// The bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other
// tests cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, and that
// what the user types survives the frames drawn while they type, with its focus, caret and selection, which a
// replacement loses, and that a write the input on screen did not make parts the state from the screen. And that
// `messagesSentBy`, this bridge's own way to find what a view sends, does what its comment says.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  composition,
  type Dispatch,
  dispatchTo,
  field,
  type Field,
  type Frame,
  type MessageOf,
  type ModelOf,
  run,
  type View,
  write,
} from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Optic from 'effect/Optic'
import type * as Stream from 'effect/Stream'
import { h, thunk, type VNode } from 'snabbdom'
import { counter } from './counter/counter.ts'
import { view as counterView } from './counter/view.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'
import { view as formView } from './form/view.ts'
import { initialValue, messagesSentBy, onClick, onInput, onWrite, renderInto } from './snabbdom.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

/** Lets the program and the renderer do what they can without a screen refresh. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** One screen refresh, then what follows from it. */
const paint = async () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
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

  test('a text the program puts in the field is shown by a new input', async () => {
    mountForm()
    await settle()
    const input = element<HTMLInputElement>('input')
    type(input, 'Ada')
    await paint()
    button('Save').click()
    await paint()
    await paint()
    const replaced = element<HTMLInputElement>('input')
    expect(replaced).not.toBe(input)
    expect(replaced.value).toBe('')
    expect(element('li').textContent).toBe('Ada')
  })
})

describe('what a replacement loses, and what a write the input did not make does', () => {
  // A note the program clears on a message that no control drawn sends, as a source that exists whatever is drawn
  // would.
  type Note = Readonly<{ note: Field<string> }>
  const { input, compose } = composition<{ state: Note }>()
  const note = compose({
    init: () => ({ state: { note: field('') } }),
    inputs: { Note: input(Optic.id<Note>().key('note')) },
    update: (_: 'Cleared') => () => ({ state: { note: field('') } }),
    makeModel: (state) => state.note,
  })
  const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>, VNode> = (model, dispatch) =>
    h('main', [
      h('input', {
        key: model.revision,
        ...initialValue(model.value),
        on: onWrite(model, dispatchTo(dispatch, 'Note')),
      }),
    ])
  const mountNote = () => {
    let drawn: Readonly<{ model: Field<string>; dispatch: Dispatch<MessageOf<typeof note>> }> | undefined
    mount<ModelOf<typeof note>, MessageOf<typeof note>>((model, dispatch) => {
      drawn = { model, dispatch }
      return noteView(model, dispatch)
    }, (render) => run(note, render))
    const last = () => {
      if (drawn === undefined) throw new Error('No frame is drawn')
      return drawn
    }
    return {
      field: () => last().model,
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

  test('a replacement draws a new input, which has neither the focus nor the caret nor the selection', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Ada')
    typed.focus()
    typed.setSelectionRange(1, 3)
    await paint()
    app.send('Cleared')
    await paint()
    const replaced = element<HTMLInputElement>('input')
    expect(replaced).not.toBe(typed)
    expect(replaced.value).toBe('')
    expect(document.activeElement).not.toBe(replaced)
    expect([replaced.selectionStart, replaced.selectionEnd]).toEqual([0, 0])
  })

  test('a write the input did not make parts the state from the screen, and the next key erases it', async () => {
    const app = mountNote()
    await settle()
    const typed = element<HTMLInputElement>('input')
    type(typed, 'Hel')
    await paint()
    // At the revision on screen, from elsewhere than the element: what a scanner would send if it could write.
    app.send({ _tag: 'Note', message: write(app.field(), 'SCAN') })
    await paint()
    expect(app.field().value).toBe('SCAN')
    expect(element('input')).toBe(typed)
    expect(typed.value).toBe('Hel')
    type(typed, 'Help')
    await paint()
    expect(app.field().value).toBe('Help')
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
})
