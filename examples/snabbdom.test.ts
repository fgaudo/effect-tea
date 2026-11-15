// The bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other tests
// cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, and how the bridge
// settles each input with a frame by the library's rule: what the user types survives the frames drawn while they
// type, with its focus, caret and selection, a frame that has not seen a key leaves the element alone, and a value the
// program puts in an input's place is shown by the same element. A slider writes its number, and one the program draws
// listens to a drag. A source that belongs to the control writes through the element on screen. And `messagesSentBy`,
// this bridge's own way to find what a view sends, does what its comment says.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  composition,
  type Dispatch,
  dispatchTo,
  type Frame,
  type MessageOf,
  type ModelOf,
  reject,
  run,
  type View,
  write,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'
import { h, thunk, type VNode } from 'snabbdom'
import { counter } from './counter/counter.ts'
import { view as counterView } from './counter/view.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'
import { view as formView } from './form/view.ts'
import { messagesSentBy, onClick, onInput, renderInto, shows } from './snabbdom.ts'
import { view as volumeView } from './volume/view.ts'
import { Pointer, volume } from './volume/volume.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

/** Lets the program and the renderer do what they can without a screen refresh. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** One screen refresh: the renderer resumes in its callback, and draws the latest frame at once. */
const refresh = () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
}

/** One screen refresh, then what follows from it. */
const paint = async () => {
  refresh()
  await settle()
}

beforeAll(() => {
  GlobalRegistrator.register()
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      requested += 1
      waiting.set(requested, callback)
      return requested
    },
    cancelAnimationFrame: (id: number) => waiting.delete(id),
  })
})

afterAll(() => GlobalRegistrator.unregister())

let running: Fiber.Fiber<void> | undefined

afterEach(async () => {
  if (running !== undefined) await Effect.runPromise(Fiber.interrupt(running))
  running = undefined
  waiting.clear()
})

/** Starts a program drawn with `view` into a fresh page; `views` counts the trees drawn, one per patch. */
const mount = <Model, Message>(
  view: View<Model, Message, VNode>,
  start: (render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>) => Effect.Effect<void>,
) => {
  document.body.innerHTML = '<div id="app"></div>'
  const root = document.getElementById('app') as HTMLElement
  let views = 0
  running = Effect.runFork(start(renderInto(root, (model, dispatch) => {
    views += 1
    return view(model, dispatch)
  })))
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

const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input'))
}

describe('renderInto', () => {
  test('draws the first frame at once, then at most once per screen refresh, the latest frame', async () => {
    const app = mount(counterView, (render) => run(counter, render))
    await settle()
    expect(app.views()).toBe(1)
    for (let click = 0; click < 5; click += 1) {
      button('+').click()
      await settle()
    }
    expect(app.views()).toBe(1)
    expect(element('output').textContent).toBe('0')
    await paint()
    expect(app.views()).toBe(2)
    expect(element('output').textContent).toBe('5')
    await paint()
    expect(app.views()).toBe(2)
  })

  test('a click on a drawn button reaches the program, and the next refresh shows it', async () => {
    mount(counterView, (render) => run(counter, render))
    await settle()
    button('+').click()
    await paint()
    expect(element('output').textContent).toBe('1')
    button('−').click()
    await paint()
    expect(element('output').textContent).toBe('0')
  })
})

describe('inputs the user types into', () => {
  const saving = Storage.of({ save: () => Effect.void })
  const mountForm = () =>
    mount(
      formView,
      (render) => run(form, render).pipe(Effect.provideService(Storage, saving)),
    )

  test('a frame drawn while the user types does not take back what they typed since', async () => {
    mountForm()
    await settle()
    const input = element<HTMLInputElement>('input')
    type(input, 'A')
    await settle()
    // The next key is in the input before its message reaches the program: the frame drawn now knows only "A".
    input.value = 'Ad'
    await paint()
    expect(element('input')).toBe(input)
    expect(input.value).toBe('Ad')
    expect(button('Save')).toBeDefined()
  })

  test('a name the program empties is emptied in the input on screen, which stays and keeps the focus', async () => {
    mountForm()
    await settle()
    const input = element<HTMLInputElement>('input')
    input.focus()
    type(input, 'Ada')
    await paint()
    button('Save').click()
    await paint()
    await paint()
    expect(element('input')).toBe(input)
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(element('li').textContent).toBe('Ada')
  })
})

describe('an input in a draft its parent starts again, and brings back', () => {
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
  const draftView = (model: ModelOf<typeof draft>, dispatch: Dispatch<MessageOf<typeof draft>>): VNode =>
    h('form', [
      h('input', shows(model.text, dispatchTo(dispatch, 'Text'))),
      h('button', { props: { type: 'button' }, on: onClick<Own>('SendClicked', dispatch) }, 'Send'),
      h('button', { props: { type: 'button' }, on: onClick<Own>('DiscardClicked', dispatch) }, 'Discard'),
      h('output', model.text),
    ])
  const view: View<ModelOf<typeof desk>, MessageOf<typeof desk>, VNode> = (model, dispatch) =>
    h('main', [
      // Skipped while the draft's state is the same object: the bridge settles its input all the same.
      thunk('form', 'draft', draftView, [model.draft, dispatchTo(dispatch, 'Draft')]),
      h('button', { on: onClick<MessageOf<typeof desk>>('Kept', dispatch) }, 'Keep'),
      h('button', { on: onClick<MessageOf<typeof desk>>('Undone', dispatch) }, 'Undo'),
      h('ul', model.sent.map((text) => h('li', text))),
    ])
  const mountDesk = () => mount(view, (render) => run(desk, render))
  /** What the page says the state holds: the draft's text, then the texts sent. */
  const state = () => [...document.querySelectorAll('output, li')].map((found) => found.textContent)

  test('a frame that has not seen a key sent before it was drawn leaves the element as it is', async () => {
    mountDesk()
    await settle()
    const typedInto = element<HTMLInputElement>('input')
    // A frame waits for the screen refresh; the key is sent, and the refresh draws that frame before the run takes
    // the key: the callback of the refresh resumes the renderer at once.
    button('Keep').click()
    await settle()
    type(typedInto, 'A')
    refresh()
    expect(typedInto.value).toBe('A')
    await paint()
    expect(state()).toEqual(['A'])
    expect(typedInto.value).toBe('A')
  })

  test('sent, the draft is emptied in the element on screen, which stays and keeps the focus', async () => {
    mountDesk()
    await settle()
    const typedInto = element<HTMLInputElement>('input')
    typedInto.focus()
    type(typedInto, 'hello')
    await paint()
    button('Send').click()
    await paint()
    expect(state()).toEqual(['', 'hello'])
    expect(element('input')).toBe(typedInto)
    expect(typedInto.value).toBe('')
    expect(document.activeElement).toBe(typedInto)
    // What is typed next is typed over the empty text, and stored.
    type(typedInto, 'again')
    await paint()
    expect(state()).toEqual(['again', 'hello'])
  })

  test('a key typed after Send, before the emptied draft is drawn, is rejected, and the element is emptied', async () => {
    mountDesk()
    await settle()
    const typedInto = element<HTMLInputElement>('input')
    type(typedInto, 'hello')
    await paint()
    button('Send').click()
    // The frame on screen still shows "hello": the key is written over it.
    type(typedInto, 'hello!')
    await paint()
    expect(state()).toEqual(['', 'hello'])
    expect(typedInto.value).toBe('')
    button('Send').click()
    await paint()
    expect(state()).toEqual(['', 'hello'])
  })

  test('a kept draft brought back as the very same state, which a thunk skips, is shown by the element', async () => {
    mountDesk()
    await settle()
    const typedInto = element<HTMLInputElement>('input')
    type(typedInto, 'Ada')
    button('Keep').click()
    await paint()
    // Within one screen refresh: the draft is discarded, a key is typed over what the screen still shows, and the
    // kept draft comes back. The key is rejected, and the draft's state is the object drawn last.
    button('Discard').click()
    type(typedInto, 'Adam')
    button('Undo').click()
    await paint()
    expect(state()).toEqual(['Ada'])
    expect(typedInto.value).toBe('Ada')
  })
})

describe('the sliders of the volume', () => {
  const drag = (slider: HTMLInputElement, value: number) => {
    slider.value = String(value)
    slider.dispatchEvent(new Event('input'))
  }
  const media = () => element<HTMLInputElement>('input.media')
  const shown = (selector: string) => element(selector).textContent
  const mountVolume = (moves: Stream.Stream<number> = Stream.empty) =>
    mount(volumeView, (render) => run(volume, render).pipe(Effect.provideService(Pointer, Pointer.of({ moves }))))

  test('the native one writes its number, and a frame drawn while it is dragged keeps it', async () => {
    mountVolume()
    await settle()
    const slider = media()
    drag(slider, 80)
    await paint()
    expect(media()).toBe(slider)
    expect([slider.value, shown('output.media')]).toEqual(['80', '80'])
  })

  // The slider is never replaced: muted, it is given 0 and disabled, and unmuted, it is given the level back.
  test('muted, the native one shows 0 on the same slider, and unmuted it gets the level back', async () => {
    mountVolume()
    await settle()
    const slider = media()
    drag(slider, 80)
    await paint()
    button('Mute').click()
    await paint()
    expect(media()).toBe(slider)
    expect([slider.value, slider.disabled]).toEqual(['0', true])
    button('Unmute').click()
    await paint()
    expect(media()).toBe(slider)
    expect([slider.value, slider.disabled, shown('output.media')]).toEqual(['80', false, '80'])
  })

  test('a drag of the native one after Mute, before its frame, is stored, and Unmute gives it back', async () => {
    mountVolume()
    await settle()
    const slider = media()
    button('Mute').click()
    drag(slider, 80)
    await paint()
    expect([slider.value, slider.disabled]).toEqual(['0', true])
    button('Unmute').click()
    await paint()
    expect([slider.value, shown('output.media')]).toEqual(['80', '80'])
  })

  test('a frame that has not seen a drag sent before it was drawn leaves the native one where it is', async () => {
    mountVolume()
    await settle()
    const slider = media()
    drag(slider, 20)
    await paint()
    // The frame of quiet hours is drawn before the run takes the drag, as in the draft's test above.
    button('Quiet hours').click()
    await settle()
    drag(slider, 25)
    refresh()
    expect(slider.value).toBe('25')
    await paint()
    expect([slider.value, shown('output.media')]).toEqual(['25', '25'])
  })

  test('a press on the one the program draws starts a drag, whose moves set it until the pointer is released', async () => {
    mountVolume(Stream.make(40, 64.4))
    await settle()
    element('.track').dispatchEvent(new Event('pointerdown'))
    await paint()
    await paint()
    expect(shown('output.ringer')).toBe('64')
    expect(element<HTMLElement>('.fill').style.width).toBe('64%')
  })
})

describe('a value the program puts in an input\'s place', () => {
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
  const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>, VNode> = (model, dispatch) =>
    h('main', [h('input', shows(model, dispatchTo(dispatch, 'Note')))])
  const mountNote = (view = noteView) => {
    let drawn: Readonly<{ model: string; dispatch: Dispatch<MessageOf<typeof note>> }> | undefined
    mount<ModelOf<typeof note>, MessageOf<typeof note>>((model, dispatch) => {
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

  test('a frame drawn while the user types keeps the focus, the caret and the selection of the input', async () => {
    mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Ada')
    typed.focus()
    typed.setSelectionRange(1, 3)
    await paint()
    expect(element('input')).toBe(typed)
    expect(document.activeElement).toBe(typed)
    expect([typed.selectionStart, typed.selectionEnd]).toEqual([1, 3])
  })

  test('is shown by the element on screen, which stays and keeps the focus', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Ada')
    typed.focus()
    await paint()
    app.send('Cleared')
    await paint()
    expect(element('input')).toBe(typed)
    expect(typed.value).toBe('')
    expect(document.activeElement).toBe(typed)
  })

  // What a scanner would send if it could write: the bridge cannot tell it from a step of the program, and shows it.
  test('a write the element did not make is shown by it too, and the next key is written over it', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Hel')
    await paint()
    app.send({ _tag: 'Note', message: write(app.note(), 'SCAN') })
    await paint()
    expect(app.note()).toBe('SCAN')
    expect(element('input')).toBe(typed)
    expect(typed.value).toBe('SCAN')
    type(typed, 'SCANs')
    await paint()
    expect(app.note()).toBe('SCANs')
  })

  describe('a source that belongs to the control, as a dictation that streams partial results', () => {
    // The control listens to the source, not the program: each result is put into the element on screen, and
    // written through its own listener, over what the element showed.
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
    const dictatedView = (source: ReturnType<typeof dictation>): typeof noteView => {
      const stops = new WeakMap<Node, () => void>()
      return (model, dispatch) =>
        h('main', [
          h('input', {
            ...shows(model, dispatchTo(dispatch, 'Note')),
            hook: {
              insert: (vnode) => {
                const input = vnode.elm as HTMLInputElement
                stops.set(
                  input,
                  source.listen((text) => {
                    input.value = text
                    input.dispatchEvent(new Event('input'))
                  }),
                )
              },
              destroy: (vnode) => {
                if (vnode.elm !== undefined) stops.get(vnode.elm)?.()
              },
            },
          }),
        ])
    }

    test('each result is shown by the input on screen, which keeps the focus, and is stored', async () => {
      const source = dictation()
      const app = mountNote(dictatedView(source))
      await settle()
      const typed = element<HTMLInputElement>('input')
      type(typed, 'Note: ')
      typed.focus()
      await paint()
      source.say('Note: hel')
      await settle()
      source.say('Note: hello')
      // A dispatch only queues the message: the program applies it in a later step of the scheduler.
      await settle()
      await paint()
      expect(element('input')).toBe(typed)
      expect(document.activeElement).toBe(typed)
      expect(typed.value).toBe('Note: hello')
      expect(app.note()).toBe('Note: hello')
      type(typed, 'Note: hello!')
      await paint()
      expect(app.note()).toBe('Note: hello!')
    })

    test('after the program empties the input, the results go on into the same element, and are stored', async () => {
      const source = dictation()
      const app = mountNote(dictatedView(source))
      await settle()
      const typed = element<HTMLInputElement>('input')
      source.say('Ada')
      await paint()
      app.send('Cleared')
      await paint()
      expect(typed.value).toBe('')
      source.say('Bob')
      await paint()
      expect(element('input')).toBe(typed)
      expect(typed.value).toBe('Bob')
      expect(app.note()).toBe('Bob')
    })
  })
})

describe('messagesSentBy', () => {
  type Row = 'Tapped'
  type Message =
    | Readonly<{ _tag: 'Typed'; text: string }>
    | Readonly<{ _tag: 'Cleared' }>
    | Readonly<{ _tag: 'Saved' }>
    | Readonly<{ _tag: 'Row'; id: number; message: Row }>
  const send = (dispatch: Dispatch<Message>, message: Message) => () => Effect.runSync(dispatch(message))
  const rowView = (id: number, dispatch: Dispatch<Row>) => h('button', { on: onClick('Tapped', dispatch) }, String(id))
  const view: View<ReadonlyArray<number>, Message, VNode> = (ids, dispatch) =>
    h('div', [
      h('input', { on: onInput((text): Message => ({ _tag: 'Typed', text }), dispatch) }),
      h('button', { on: { click: [send(dispatch, { _tag: 'Cleared' }), send(dispatch, { _tag: 'Saved' })] } }),
      // snabbdom calls the listeners of nested lists too, which its types do not show.
      h('button', { on: { click: [[send(dispatch, { _tag: 'Cleared' })]] as unknown as () => void } }),
      ...ids.map((id) => thunk('button', String(id), rowView, [id, dispatchTo(dispatch, 'Row', id)])),
    ])

  test('gives every input the text typed', () => {
    expect(messagesSentBy(view, [], 'Ada')[0]).toEqual({ _tag: 'Typed', text: 'Ada' })
  })

  test('calls each listener of a list, nested or not, in order', () => {
    expect(messagesSentBy(view, []).slice(1)).toEqual([{ _tag: 'Cleared' }, { _tag: 'Saved' }, { _tag: 'Cleared' }])
  })

  test('draws each thunk, and records the message of a child as the root of the program receives it', () => {
    expect(messagesSentBy(view, [1, 2]).slice(4)).toEqual([
      { _tag: 'Row', id: 1, message: 'Tapped' },
      { _tag: 'Row', id: 2, message: 'Tapped' },
    ])
  })

  test('leaves out what is written into an input, which only an element on screen writes', () => {
    type Named = Readonly<{ name: string }>
    const named = composition<{ state: Named }>()
    const program = named.compose({
      init: () => ({ state: { name: '' } }),
      inputs: { Name: named.input(Optic.id<Named>().key('name')) },
      makeModel: (state) => state.name,
    })
    const nameView: View<ModelOf<typeof program>, MessageOf<typeof program>, VNode> = (model, dispatch) =>
      h('main', [h('input', shows(model, dispatchTo(dispatch, 'Name')))])
    expect(messagesSentBy(nameView, '', 'Ada')).toEqual([])
  })
})
