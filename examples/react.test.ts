// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints. What the other
// tests cannot see: how often `renderInto` draws, that a click on a drawn button reaches the program, and that
// what the user types into an uncontrolled input survives the frames drawn while they type.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type Frame, run, type View } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import type * as Stream from 'effect/Stream'
import type { ReactNode } from 'react'
import { counter } from './counter/counter.ts'
import { form } from './form/form.ts'
import { Storage } from './form/storage.ts'

// The callbacks waiting for the next screen refresh: none runs until `paint`.
const waiting = new Map<number, FrameRequestCallback>()
let requested = 0

/** Lets the program, the renderer and React's scheduler do what they can without a screen refresh. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** One screen refresh, then what follows from it. */
const paint = async () => {
  const due = [...waiting.values()]
  waiting.clear()
  for (const callback of due) callback(performance.now())
  await settle()
}

// React DOM reads the DOM when it is loaded, so the bridge and the views are loaded once there is one.
let bridge: typeof import('./react.ts')
let counterView: typeof import('./counter-react/view.tsx').view
let formView: typeof import('./form-react/view.tsx').view

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
})

// React's scheduler may still have work queued by the last unmount, which reads the DOM.
afterAll(async () => {
  await settle()
  await GlobalRegistrator.unregister()
})

let running: Fiber.Fiber<void> | undefined

const stop = async () => {
  if (running !== undefined) await Effect.runPromise(Fiber.interrupt(running))
  running = undefined
}

afterEach(async () => {
  await stop()
  waiting.clear()
})

/** Starts a program drawn by React with `view` into a fresh page; `views` counts the trees drawn, one per frame. */
const mount = <Model, Message>(
  view: View<Model, Message, ReactNode>,
  start: (render: (frames: Stream.Stream<Frame<Model, Message>>) => Effect.Effect<void>) => Effect.Effect<void>,
) => {
  document.body.innerHTML = '<div id="app"></div>'
  const root = document.getElementById('app') as HTMLElement
  let views = 0
  running = Effect.runFork(start(bridge.renderInto(root, (model, dispatch) => {
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

// React tracks an input's value through its `value` setter, and ignores an `input` event that left it as
// tracked: a key is the element's own setter, then the event, which React hears at its root.
const setValue = (input: HTMLInputElement, text: string) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)

const type = (input: HTMLInputElement, text: string) => {
  setValue(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('renderInto, with React', () => {
  test('draws the first frame at once, then at most once per screen refresh, the latest frame', async () => {
    const app = mount(counterView, (render) => run(counter, render))
    await settle()
    expect(app.views()).toBe(1)
    expect(element('output').textContent).toBe('0')
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

  test('unmounts what it drew when the run ends', async () => {
    mount(counterView, (render) => run(counter, render))
    await settle()
    expect(element('output').textContent).toBe('0')
    await stop()
    await settle()
    expect(element('#app').childElementCount).toBe(0)
  })
})

describe('inputs the user types into, with React', () => {
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
    setValue(input, 'Ad')
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
