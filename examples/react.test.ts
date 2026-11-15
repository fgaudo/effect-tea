// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other tests
// cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, that the run ends with
// its root and with a component that throws, and how the bridge settles each input with a frame by the library's rule:
// what the user types survives the frames drawn while they type, with its focus, caret and selection, a frame that has
// not seen a key leaves the element alone, and a value the program puts in an input's place is shown by the same
// element, through a memoized subtree, in StrictMode and through a portal too. A slider the program draws listens to a
// drag. A source that belongs to the control writes through the element on screen.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  composition,
  type Dispatch,
  dispatchTo,
  type Frame,
  type MessageOf,
  type ModelOf,
  ProgramDefect,
  reject,
  run,
  type Written,
} from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Scheduler from 'effect/Scheduler'
import * as Stream from 'effect/Stream'
import { createElement, Fragment, memo, type ReactNode, StrictMode, useEffect, useRef } from 'react'
import { counter } from './counter/counter.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'
import type { View } from './react.ts'
import { type Message as VolumeMessage, type Model as VolumeModel, Pointer, volume } from './volume/volume.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

// Effect's own scheduler, but for the turns of the event loop it would wait for: it keeps them until `settle`, so
// that a test, not the clock, says when the program and the renderer go on. React needs no turn of its own: the
// bridge draws each frame with `flushSync`, which commits it and runs its effects before it returns. What a run waits
// for outside Effect's scheduler (`Effect.sleep`, a promise) is not held: a test controls it by its own means
// (`TestClock`, a `Deferred`).
const held = new Set<() => void>()
const scheduler = new Scheduler.MixedScheduler('async', (task) => {
  held.add(task)
  return () => held.delete(task)
})

/** Lets the program and the renderer do all they can without a screen refresh. */
const settle = () => {
  for (let turns = 0; held.size > 0; turns += 1) {
    if (turns === 10_000) throw new Error('The program never settles: a fiber yields forever')
    for (const task of [...held]) if (held.delete(task)) task()
  }
}

/** One screen refresh: the renderer resumes in its callback, and draws the latest frame at once. */
const refresh = () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
}

/** One screen refresh, then what follows from it. */
const paint = () => {
  refresh()
  settle()
}

// React DOM reads the DOM when it is loaded, so the bridge, the views and React DOM are loaded once there is one.
let bridge: typeof import('./react.ts')
let counterView: typeof import('./counter-react/view.tsx').view
let formView: typeof import('./form-react/view.tsx').view
let portal: typeof import('react-dom').createPortal

beforeAll(async () => {
  GlobalRegistrator.register()
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      requested += 1
      waiting.set(requested, callback)
      return requested
    },
    cancelAnimationFrame: (id: number) => waiting.delete(id),
  })
  bridge = await import('./react.ts')
  counterView = (await import('./counter-react/view.tsx')).view
  formView = (await import('./form-react/view.tsx')).view
  portal = (await import('react-dom')).createPortal
})

// React's scheduler may still have work queued by the last unmount, which reads the DOM: it queues it with
// `setImmediate`, so a turn queued after it runs once it is done.
afterAll(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await GlobalRegistrator.unregister()
})

let running: Fiber.Fiber<void> | undefined

const stop = async () => {
  if (running !== undefined) {
    // The run ends on the held scheduler too: what its interruption does is let through before it is awaited.
    const ended = Effect.runPromise(Fiber.interrupt(running))
    settle()
    await ended
  }
  running = undefined
}

afterEach(async () => {
  await stop()
  waiting.clear()
})

/** Starts a program drawn by React with `view` into a fresh page; `views` counts the trees drawn, one per frame. */
const mount = <Model, Message>(
  view: View<Model, Message>,
  start: (render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>) => Effect.Effect<void>,
) => {
  document.body.innerHTML = '<div id="app"></div><div id="aside"></div>'
  const root = document.getElementById('app') as HTMLElement
  let views = 0
  running = Effect.runFork(start(bridge.renderInto(root, (model, dispatch) => {
    views += 1
    return view(model, dispatch)
  })), { scheduler })
  return { views: () => views }
}

const element = <E extends Element>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`Nothing drawn matches ${selector}`)
  return found
}

const button = (text: string) => {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === text)
  if (found === undefined) throw new Error(`No button "${text}" is drawn`)
  return found
}

const drawButton = (text: string, onClick: () => void) => createElement('button', { type: 'button', onClick }, text)

// React tracks an input's value through its `value` setter, and ignores an `input` event that left it as
// tracked: a key is the element's own setter, then the event, which React hears at its root.
const setValue = (input: HTMLInputElement, text: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)

const type = (input: HTMLInputElement, text: string) => {
  setValue(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** What the page says the state holds: the draft's text, then the texts sent. */
const state = () => [...document.querySelectorAll('output, li')].map((found) => found.textContent)

describe('renderInto, with React', () => {
  test('draws the first frame at once, then at most once per screen refresh, the latest frame', () => {
    const app = mount(counterView, (render) => run(counter, render))
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
    mount(counterView, (render) => run(counter, render))
    settle()
    button('+').click()
    paint()
    expect(element('output').textContent).toBe('1')
    button('−').click()
    paint()
    expect(element('output').textContent).toBe('0')
  })

  test('unmounts what it drew when the run ends', async () => {
    mount(counterView, (render) => run(counter, render))
    settle()
    expect(element('output').textContent).toBe('0')
    await stop()
    expect(element('#app').childElementCount).toBe(0)
  })

  test('a component that throws ends the run, which dies in the renderer with what it threw', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = element<HTMLElement>('#app')
    const thrown = new Error('A component that cannot draw')
    const Broken = (): ReactNode => {
      throw thrown
    }
    const exit = await Effect.runPromiseExit(run(counter, bridge.renderInto(root, () => createElement(Broken))))
    const died = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(died).toMatchObject({ where: 'render', cause: thrown })
  })
})

describe('inputs the user types into, with React', () => {
  const saving = Storage.of({ save: () => Effect.void })
  const mountForm = () =>
    mount(
      formView,
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

describe('an input in a draft its parent starts again, and brings back, with React', () => {
  type Own = 'SendClicked' | 'DiscardClicked'
  type Sent = Readonly<{ _tag: 'Sent'; text: string }>
  type Draft = Readonly<{ text: string }>
  type Desk = Readonly<{ draft: Draft; kept: Opt.Option<Draft>; sent: ReadonlyArray<string> }>
  const draftOf = composition<{ state: Draft; event: Sent }>()
  const draft = draftOf.compose({
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
  const desk = deskOf.compose({
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
  type DraftProps = Readonly<{ model: ModelOf<typeof draft>; dispatch: Dispatch<MessageOf<typeof draft>> }>
  // Skipped while the draft's model is the same object: the bridge settles its input all the same.
  const DraftView = memo(({ model, dispatch }: DraftProps): ReactNode =>
    createElement(
      'form',
      null,
      createElement(bridge.Shows, { value: model.text, dispatch: dispatchTo(dispatch, 'Text') }),
      drawButton('Send', bridge.onClick<Own>('SendClicked', dispatch)),
      drawButton('Discard', bridge.onClick<Own>('DiscardClicked', dispatch)),
      createElement('output', null, model.text),
    )
  )
  const deskView = (strict: boolean): View<ModelOf<typeof desk>, MessageOf<typeof desk>> =>
  (
    model,
    dispatch,
  ) => {
    const tree = createElement(
      'main',
      null,
      createElement(DraftView, { model: model.draft, dispatch: dispatchTo(dispatch, 'Draft') }),
      drawButton('Keep', bridge.onClick<MessageOf<typeof desk>>('Kept', dispatch)),
      drawButton('Undo', bridge.onClick<MessageOf<typeof desk>>('Undone', dispatch)),
      createElement('ul', null, ...model.sent.map((text, index) => createElement('li', { key: index }, text))),
    )
    return strict ? createElement(StrictMode, null, tree) : tree
  }

  // StrictMode attaches every ref twice, and renders every component twice.
  for (const strict of [false, true]) {
    describe(strict ? 'in StrictMode' : 'plainly', () => {
      const mountDesk = () => mount(deskView(strict), (render) => run(desk, render))

      test('a frame that has not seen a key sent before it was drawn leaves the element as it is', () => {
        mountDesk()
        settle()
        const typedInto = element<HTMLInputElement>('input')
        // A frame waits for the screen refresh; the key is sent, and the refresh draws that frame before the run
        // takes the key: the callback of the refresh resumes the renderer at once.
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
        // What is typed next is typed over the empty text, and stored: React's tracking heard the emptying.
        type(typedInto, 'again')
        paint()
        expect(state()).toEqual(['again', 'hello'])
      })

      test(
        'a key typed after Send, before the emptied draft is drawn, is rejected, and the element emptied',
        () => {
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
        },
      )

      test('a kept draft brought back as the very same state, which memo skips, is shown by the element', () => {
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
      })
    })
  }
})

// The bridge has no component for the media's native range, an input over a number: `Shows` is a text input over a
// string. Only the ringer, which the program draws, is drawn here.
describe('the sliders of the volume, with React', () => {
  const volumeView: View<VolumeModel, VolumeMessage> = (model, dispatch) =>
    createElement(
      'main',
      null,
      createElement(
        'div',
        {
          className: 'track',
          onPointerDown: Opt.match(model.press, {
            onNone: () => undefined,
            onSome: (press) => bridge.onPress<VolumeMessage>(press, dispatch),
          }),
        },
        createElement('div', { className: 'fill', style: { width: `${model.ringer}%` } }),
        createElement('div', { className: 'cap', style: { left: `${model.max}%` } }),
      ),
      createElement('output', { className: 'ringer' }, String(model.ringer)),
    )

  test(
    'a press on the one the program draws starts a drag, whose moves set it until the pointer is released',
    () => {
      mount(
        volumeView,
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

describe('a value the program puts in an input\'s place, with React', () => {
  // A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
  // would.
  type Note = Readonly<{ note: string }>
  const { input, compose } = composition<{ state: Note }>()
  const note = compose({
    init: () => ({ state: { note: '' } }),
    inputs: { Note: input(Optic.id<Note>().key('note')) },
    update: (_: 'Cleared') => () => ({ state: { note: '' } }),
    makeModel: (state) => state.note,
  })
  type Model = ModelOf<typeof note>
  type Message = MessageOf<typeof note>
  const noteView: View<Model, Message> = (model, dispatch) =>
    createElement('main', null, createElement(bridge.Shows, { value: model, dispatch: dispatchTo(dispatch, 'Note') }))
  const mountNote = (view = noteView) => {
    let drawn: Readonly<{ model: Model; dispatch: Dispatch<Message> }> | undefined
    mount<Model, Message>((model, dispatch) => {
      drawn = { model, dispatch }
      return view(model, dispatch)
    }, (render) => run(note, render))
    const last = () => {
      if (drawn === undefined) throw new Error('No frame is drawn')
      return drawn
    }
    return {
      note: () => last().model,
      send: (message: Message) => Effect.runSync(last().dispatch(message)),
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

  describe('a source that belongs to the control, as a dictation that streams partial results, with React', () => {
    // The control listens to the source, not the program: each result is put into the element on screen, as a key
    // is, and written by the element's own listener, over what it showed.
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
    type Dictation = ReturnType<typeof dictation>
    type DictatedProps = Readonly<{ value: string; dispatch: Dispatch<Written<string>>; source: Dictation }>
    // `Shows` takes no ref: the element is found inside a wrapper of the control's own.
    const Dictated = ({ value, dispatch, source }: DictatedProps): ReactNode => {
      const wrapper = useRef<HTMLSpanElement>(null)
      useEffect(() =>
        source.listen((text) => {
          const shown = wrapper.current?.querySelector('input')
          if (shown !== null && shown !== undefined) type(shown, text)
        }), [source])
      return createElement('span', { ref: wrapper }, createElement(bridge.Shows, { value, dispatch }))
    }
    const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
      createElement(
        'main',
        null,
        createElement(Dictated, { value: model, dispatch: dispatchTo(dispatch, 'Note'), source }),
      )

    test('each result is shown by the input on screen, which keeps the focus, and is stored', () => {
      const source = dictation()
      const app = mountNote(dictatedView(source))
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
      const app = mountNote(dictatedView(source))
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

describe('an input React draws outside the root', () => {
  // A draft that is the run's root: it starts with a text, and Discard empties it.
  type Draft = Readonly<{ text: string }>
  const soloOf = composition<{ state: Draft }>()
  const solo = soloOf.compose({
    init: () => ({ state: { text: 'draft' } }),
    inputs: { Text: soloOf.input(Optic.id<Draft>().key('text')) },
    update: (_: 'DiscardClicked') => () => ({ state: { text: '' } }),
    makeModel: (held) => held,
  })

  test('an input drawn through a portal, outside the root, is settled by the frames of its run', () => {
    const view: View<ModelOf<typeof solo>, MessageOf<typeof solo>> = (model, dispatch) =>
      createElement(
        Fragment,
        null,
        portal(
          createElement(bridge.Shows, { value: model.text, dispatch: dispatchTo(dispatch, 'Text') }),
          element<HTMLElement>('#aside'),
        ),
        drawButton('Discard', bridge.onClick<'DiscardClicked'>('DiscardClicked', dispatch)),
        createElement('output', null, model.text),
      )
    mount(view, (render) => run(solo, render))
    settle()
    const typedInto = element<HTMLInputElement>('#aside input')
    expect(typedInto.value).toBe('draft')
    type(typedInto, 'hello')
    paint()
    button('Discard').click()
    paint()
    expect(state()).toEqual([''])
    expect(typedInto.value).toBe('')
  })
})
