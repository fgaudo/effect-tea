// The bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other
// tests cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, and that
// what the user types survives the frames drawn while they type. And that `messagesSentBy` keeps the contract
// the README's "Testing" sets for one.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type Dispatch, dispatchTo, type Frame, run, type View } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import type * as Stream from 'effect/Stream'
import { h, thunk, type VNode } from 'snabbdom'
import { counter } from './counter/counter.ts'
import { view as counterView } from './counter/view.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'
import { view as formView } from './form/view.ts'
import { messagesSentBy, onClick, onInput, renderInto } from './snabbdom.ts'

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
      ...ids.map((id) => thunk('button', String(id), rowView, [id, dispatchTo(dispatch, 'Row', id)])),
    ])

  test('gives every input the text typed', () => {
    expect(messagesSentBy(view, [], 'Ada')[0]).toEqual({ _tag: 'Typed', text: 'Ada' })
  })

  test('calls each listener of a list, in order', () => {
    expect(messagesSentBy(view, []).slice(1)).toEqual([{ _tag: 'Cleared' }, { _tag: 'Saved' }])
  })

  test('draws each thunk, and records the message of a child as the root of the program receives it', () => {
    expect(messagesSentBy(view, [1, 2]).slice(3)).toEqual([
      { _tag: 'Row', id: 1, message: 'Tapped' },
      { _tag: 'Row', id: 2, message: 'Tapped' },
    ])
  })
})
