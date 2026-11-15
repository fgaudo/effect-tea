// The tests every bridge passes, in a DOM, whatever its renderer: a bridge's test file registers the DOM, holds its
// screen refreshes (`holdFrames`) and calls `bridgeTests` with what its renderer draws the scenarios with, a `Bridge`.
// What the other tests cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program,
// and how the bridge settles each input with a frame by the library's rule: what the user types survives the frames
// drawn while they type, with its focus, caret and selection, a frame that has not seen a key leaves the element alone,
// and a value the program puts in an input's place is shown by the same element, through a subtree the renderer skips
// too. A slider the program draws listens to a drag. A source that belongs to the control writes through the element
// on screen. A `.test_suite.ts`, a file that serves the tests, not a `*.test.ts`: `bun test` does not run it by
// itself, and it runs in the file of each bridge that calls it, under that file's name.
import { describe, expect, test } from 'bun:test'
import {
  composition,
  type Dispatch,
  type Frame,
  type MessageOf,
  type ModelOf,
  reject,
  run,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Scheduler from 'effect/Scheduler'
import * as Stream from 'effect/Stream'
import { counter, type Message as CounterMessage, type Model as CounterModel } from './counter/counter.ts'
import { form, type Message as FormMessage, type Model as FormModel } from './form/form.ts'
import { Storage } from './form/storage.ts'
import { type Message as VolumeMessage, type Model as VolumeModel, Pointer, volume } from './volume/volume.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

// Effect's own scheduler, but for the turns of the event loop it would wait for: it keeps them until `settle`, so
// that a test, not the clock, says when the program and the renderer go on. A renderer needs no turn of its own:
// snabbdom patches synchronously, and React's bridge draws each frame with `flushSync`, which commits it and runs its
// effects before it returns. What a run waits for outside Effect's scheduler (`Effect.sleep`, a promise) is not held: a
// test controls it by its own means (`TestClock`, a `Deferred`).
const held = new Set<() => void>()
const scheduler = new Scheduler.MixedScheduler('async', (task) => {
  held.add(task)
  return () => held.delete(task)
})

/** Lets the program and the renderer do all they can without a screen refresh. */
export const settle = () => {
  for (let turns = 0; held.size > 0; turns += 1) {
    if (turns === 10_000) throw new Error('The program never settles: a fiber yields forever')
    for (const task of [...held]) if (held.delete(task)) task()
  }
}

/** One screen refresh: the renderer resumes in its callback, and draws the latest frame at once. */
export const refresh = () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
}

/** One screen refresh, then what follows from it. */
export const paint = () => {
  refresh()
  settle()
}

/** Replaces the screen refreshes of the DOM just registered by those `refresh` makes: called in `beforeAll`. */
export const holdFrames = () => {
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      requested += 1
      waiting.set(requested, callback)
      return requested
    },
    cancelAnimationFrame: (id: number) => waiting.delete(id),
  })
}

let running: Fiber.Fiber<void> | undefined

/** Ends the run `mount` started, if any, and forgets the refreshes it waits for: called in `afterEach`. */
export const stop = async () => {
  if (running !== undefined) {
    // The run ends on the held scheduler too: what its interruption does is let through before it is awaited.
    const ended = Effect.runPromise(Fiber.interrupt(running))
    settle()
    await ended
  }
  running = undefined
  waiting.clear()
}

/** A view of a program, drawn by a renderer whose trees are `Node`s. */
export type View<Node, Model, Message> = (model: Model, dispatch: Dispatch<Message>) => Node

/** A bridge's `renderInto`. */
export type RenderInto<Node> = <Model, Message>(
  root: HTMLElement,
  view: View<Node, Model, Message>,
) => (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>

/** How a test starts a program: `run`, with what it needs, and the renderer it is given. */
export type Start<Model, Message> = (
  render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>,
) => Effect.Effect<void>

/**
 * Starts a program drawn by `renderInto` with `view` into a fresh page, whose `#app` is the root and whose `#aside` is
 * for what a renderer can draw outside it; `views` counts the trees drawn, one per frame.
 */
export const mount = <Node, Model, Message>(
  renderInto: RenderInto<Node>,
  view: View<Node, Model, Message>,
  start: Start<Model, Message>,
) => {
  document.body.innerHTML = '<div id="app"></div><div id="aside"></div>'
  const root = document.getElementById('app') as HTMLElement
  let views = 0
  running = Effect.runFork(start(renderInto(root, (model, dispatch) => {
    views += 1
    return view(model, dispatch)
  })), { scheduler })
  return { views: () => views }
}

export const element = <E extends Element>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`Nothing drawn matches ${selector}`)
  return found
}

export const button = (text: string) => {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === text)
  if (found === undefined) throw new Error(`No button "${text}" is drawn`)
  return found
}

// React tracks an input's value through its `value` setter, and ignores an `input` event that left it as tracked: a
// key is the element's own setter, then the event, which bubbles, since React hears it at its root.
export const setValue = (input: HTMLInputElement, text: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)

export const type = (input: HTMLInputElement, text: string) => {
  setValue(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** What the page says the state holds: the draft's text, then the texts sent. */
export const state = () => [...document.querySelectorAll('output, li')].map((found) => found.textContent)

// A draft its parent starts again once sent, keeps, and brings back as the very same state.
type Own = 'SendClicked' | 'DiscardClicked'
type Sent = Readonly<{ _tag: 'Sent'; text: string }>
type Draft = Readonly<{ text: string }>
type Desk = Readonly<{ draft: Draft; kept: Opt.Option<Draft>; sent: ReadonlyArray<string> }>
const draftOf = composition<{ state: Draft; event: Sent }>()

export const draft = draftOf.compose({
  init: () => ({ state: { text: '' } }),
  inputs: { Text: draftOf.input(Optic.id<Draft>().key('text')) },
  update: (message: Own) => (held) =>
    message === 'DiscardClicked'
      ? { state: { text: '' } }
      : held.text === ''
      ? reject
      : { state: held, events: [{ _tag: 'Sent', text: held.text }] },
  makeModel: (held) => held,
})

const deskOf = composition<{ state: Desk }>()

export const desk = deskOf.compose({
  init: (children) => ({ state: { draft: children.Draft.init.state, kept: Opt.none(), sent: [] } }),
  children: { Draft: deskOf.child(draft, { at: Optic.id<Desk>().key('draft') }) },
  update: (message: 'Kept' | 'Undone') => (held) =>
    message === 'Kept'
      ? { state: { ...held, kept: Opt.some(held.draft) } }
      : Opt.match(held.kept, { onNone: () => reject, onSome: (kept) => ({ state: { ...held, draft: kept } }) }),
  onEvent: {
    // Sent, the draft is started again: the state its parent puts back is the one it starts with.
    Draft: (event, children) => (held) => ({
      state: { ...held, draft: children.Draft.init.state, sent: [...held.sent, event.text] },
    }),
  },
  makeModel: (held, children) => ({ draft: children.Draft(held), sent: held.sent }),
})

// A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
// would.
type Note = Readonly<{ note: string }>
const noteOf = composition<{ state: Note }>()

export const note = noteOf.compose({
  init: () => ({ state: { note: '' } }),
  inputs: { Note: noteOf.input(Optic.id<Note>().key('note')) },
  update: (_: 'Cleared') => () => ({ state: { note: '' } }),
  makeModel: (state) => state.note,
})

/** A source that belongs to the control, as a dictation that streams partial results: the control listens to it. */
export type Dictation = Readonly<{ listen: (listener: (text: string) => void) => () => void }>

const dictation = () => {
  const listeners = new Set<(text: string) => void>()
  return {
    listen: (listener: (text: string) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    say: (text: string) => {
      for (const listener of [...listeners]) listener(text)
    },
  }
}

/** What a bridge's tests give the shared ones: its `renderInto`, and the views of their scenarios, drawn with it. */
export type Bridge<Node> = Readonly<{
  renderInto: RenderInto<Node>
  /** What skips a subtree whose arguments are the same, as a test's name says it: `'a thunk'`, `'memo'`. */
  skips: string
  views: Readonly<{
    /** `counter`'s view, of the example. */
    counter: View<Node, CounterModel, CounterMessage>
    /** `form`'s view, of the example. */
    form: View<Node, FormModel, FormMessage>
    /**
     * The draft's input, Send and Discard buttons, and its text in an `<output>`, in a subtree skipped while the
     * draft's model is the same object; then Keep and Undo buttons, and the texts sent, an `<li>` each.
     */
    desk: View<Node, ModelOf<typeof desk>, MessageOf<typeof desk>>
    /** `volume`'s view, with the ringer the program draws at least: its `.track`, `.fill` and `output.ringer`. */
    volume: View<Node, VolumeModel, VolumeMessage>
    /** The note's input, alone. */
    note: View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
    /** The note's input, which puts each result of `source` into the element on screen, as a key is. */
    dictated: (source: Dictation) => View<Node, ModelOf<typeof note>, MessageOf<typeof note>>
  }>
}>

/** The tests of an input in the desk's draft: a describe of its own, which a renderer may run in more than one mode. */
export const draftTests = <Node>(bridge: Bridge<Node>) =>
  describe('an input in a draft its parent starts again, and brings back', () => {
    const mountDesk = () => mount(bridge.renderInto, bridge.views.desk, (render) => run(desk, render))

    test('a frame that has not seen a key sent before it was drawn leaves the element as it is', () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>('input')
      // A frame waits for the screen refresh; the key is sent, and the refresh draws that frame before the run takes
      // the key: the callback of the refresh resumes the renderer at once.
      button('Keep').click()
      settle()
      type(typedInto, 'A')
      refresh()
      expect(typedInto.value).toBe('A')
      paint()
      expect(state()).toEqual(['A'])
      expect(typedInto.value).toBe('A')
    })

    test('sent, the draft is emptied in the element on screen, which stays and keeps the focus', () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>('input')
      typedInto.focus()
      type(typedInto, 'hello')
      paint()
      button('Send').click()
      paint()
      expect(state()).toEqual(['', 'hello'])
      expect(element('input')).toBe(typedInto)
      expect(typedInto.value).toBe('')
      expect(document.activeElement).toBe(typedInto)
      // What is typed next is typed over the empty text, and stored: the element itself was emptied, so a renderer
      // that tracks its value, as React does, heard the emptying, and takes the next key for an edit.
      type(typedInto, 'again')
      paint()
      expect(state()).toEqual(['again', 'hello'])
    })

    test('a key typed after Send, before the emptied draft is drawn, is rejected, and the element is emptied', () => {
      mountDesk()
      settle()
      const typedInto = element<HTMLInputElement>('input')
      type(typedInto, 'hello')
      paint()
      button('Send').click()
      // The frame on screen still shows "hello": the key is written over it.
      type(typedInto, 'hello!')
      paint()
      expect(state()).toEqual(['', 'hello'])
      expect(typedInto.value).toBe('')
      button('Send').click()
      paint()
      expect(state()).toEqual(['', 'hello'])
    })

    test(
      `a kept draft brought back as the very same state, which ${bridge.skips} skips, is shown by the element`,
      () => {
        mountDesk()
        settle()
        const typedInto = element<HTMLInputElement>('input')
        type(typedInto, 'Ada')
        button('Keep').click()
        paint()
        // Within one screen refresh: the draft is discarded, a key is typed over what the screen still shows, and
        // the kept draft comes back. The key is rejected, and the draft's state is the object drawn last.
        button('Discard').click()
        type(typedInto, 'Adam')
        button('Undo').click()
        paint()
        expect(state()).toEqual(['Ada'])
        expect(typedInto.value).toBe('Ada')
      },
    )
  })

/** Declares the tests every bridge passes, drawn with `bridge`. */
export const bridgeTests = <Node>(bridge: Bridge<Node>) => {
  describe('renderInto', () => {
    test('draws the first frame at once, then at most once per screen refresh, the latest frame', () => {
      const app = mount(bridge.renderInto, bridge.views.counter, (render) => run(counter, render))
      settle()
      expect(app.views()).toBe(1)
      expect(element('output').textContent).toBe('0')
      for (let click = 0; click < 5; click += 1) {
        button('+').click()
        settle()
      }
      expect(app.views()).toBe(1)
      expect(element('output').textContent).toBe('0')
      paint()
      expect(app.views()).toBe(2)
      expect(element('output').textContent).toBe('5')
      paint()
      expect(app.views()).toBe(2)
    })

    test('a click on a drawn button reaches the program, and the next refresh shows it', () => {
      mount(bridge.renderInto, bridge.views.counter, (render) => run(counter, render))
      settle()
      button('+').click()
      paint()
      expect(element('output').textContent).toBe('1')
      button('−').click()
      paint()
      expect(element('output').textContent).toBe('0')
    })
  })

  describe('inputs the user types into', () => {
    const saving = Storage.of({ save: () => Effect.void })
    const mountForm = () =>
      mount(
        bridge.renderInto,
        bridge.views.form,
        (render) => run(form, render).pipe(Effect.provideService(Storage, saving)),
      )

    test('a frame drawn while the user types does not take back what they typed since', () => {
      mountForm()
      settle()
      const input = element<HTMLInputElement>('input')
      type(input, 'A')
      settle()
      // The next key is in the input before its message reaches the program: the frame drawn now knows only "A".
      setValue(input, 'Ad')
      paint()
      expect(element('input')).toBe(input)
      expect(input.value).toBe('Ad')
      expect(button('Save')).toBeDefined()
    })

    test('a name the program empties is emptied in the input on screen, which stays and keeps the focus', () => {
      mountForm()
      settle()
      const input = element<HTMLInputElement>('input')
      input.focus()
      type(input, 'Ada')
      paint()
      button('Save').click()
      paint()
      paint()
      expect(element('input')).toBe(input)
      expect(input.value).toBe('')
      expect(document.activeElement).toBe(input)
      expect(element('li').textContent).toBe('Ada')
    })
  })

  draftTests(bridge)

  describe('the sliders of the volume', () => {
    test(
      'a press on the one the program draws starts a drag, whose moves set it until the pointer is released',
      () => {
        mount(
          bridge.renderInto,
          bridge.views.volume,
          (render) =>
            run(volume, render).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(40, 64.4) }))),
        )
        settle()
        element('.track').dispatchEvent(new Event('pointerdown', { bubbles: true }))
        paint()
        paint()
        expect(element('output.ringer').textContent).toBe('64')
        expect(element<HTMLElement>('.fill').style.width).toBe('64%')
      },
    )
  })

  describe('a value the program puts in an input\'s place', () => {
    const mountNote = (view = bridge.views.note) => {
      let drawn: Readonly<{ model: ModelOf<typeof note>; dispatch: Dispatch<MessageOf<typeof note>> }> | undefined
      mount(bridge.renderInto, (model: ModelOf<typeof note>, dispatch: Dispatch<MessageOf<typeof note>>) => {
        drawn = { model, dispatch }
        return view(model, dispatch)
      }, (render) => run(note, render))
      const last = () => {
        if (drawn === undefined) throw new Error('No frame is drawn')
        return drawn
      }
      return {
        note: () => last().model,
        send: (message: MessageOf<typeof note>) => Effect.runSync(last().dispatch(message)),
      }
    }

    test('a frame drawn while the user types keeps the focus, the caret and the selection of the input', () => {
      mountNote()
      settle()
      const typed = element<HTMLInputElement>('input')
      type(typed, 'Ada')
      typed.focus()
      typed.setSelectionRange(1, 3)
      paint()
      expect(element('input')).toBe(typed)
      expect(document.activeElement).toBe(typed)
      expect([typed.selectionStart, typed.selectionEnd]).toEqual([1, 3])
    })

    test('is shown by the element on screen, which stays and keeps the focus', () => {
      const app = mountNote()
      settle()
      const typed = element<HTMLInputElement>('input')
      type(typed, 'Ada')
      typed.focus()
      paint()
      app.send('Cleared')
      paint()
      expect(element('input')).toBe(typed)
      expect(typed.value).toBe('')
      expect(document.activeElement).toBe(typed)
    })

    // What a scanner would send if it could write: the bridge cannot tell it from a step of the program, and shows it.
    test('a write the element did not make is shown by it too, and the next key is written over it', () => {
      const app = mountNote()
      settle()
      const typed = element<HTMLInputElement>('input')
      type(typed, 'Hel')
      paint()
      app.send({ _tag: 'Note', message: { _tag: 'Written', was: app.note(), value: 'SCAN' } })
      paint()
      expect(app.note()).toBe('SCAN')
      expect(element('input')).toBe(typed)
      expect(typed.value).toBe('SCAN')
      type(typed, 'SCANs')
      paint()
      expect(app.note()).toBe('SCANs')
    })

    describe('a source that belongs to the control, as a dictation that streams partial results', () => {
      // The control listens to the source, not the program: each result is put into the element on screen, as a key
      // is, and written by the element's own listener, over what it showed.
      test('each result is shown by the input on screen, which keeps the focus, and is stored', () => {
        const source = dictation()
        const app = mountNote(bridge.views.dictated(source))
        settle()
        const typed = element<HTMLInputElement>('input')
        type(typed, 'Note: ')
        typed.focus()
        paint()
        source.say('Note: hel')
        settle()
        source.say('Note: hello')
        // A dispatch only queues the message: the program applies it in a later step of the scheduler.
        settle()
        paint()
        expect(element('input')).toBe(typed)
        expect(document.activeElement).toBe(typed)
        expect(typed.value).toBe('Note: hello')
        expect(app.note()).toBe('Note: hello')
        type(typed, 'Note: hello!')
        paint()
        expect(app.note()).toBe('Note: hello!')
      })

      test('after the program empties the input, the results go on into the same element, and are stored', () => {
        const source = dictation()
        const app = mountNote(bridge.views.dictated(source))
        settle()
        const typed = element<HTMLInputElement>('input')
        source.say('Ada')
        paint()
        app.send('Cleared')
        paint()
        expect(typed.value).toBe('')
        source.say('Bob')
        paint()
        expect(element('input')).toBe(typed)
        expect(typed.value).toBe('Bob')
        expect(app.note()).toBe('Bob')
      })
    })
  })
}
