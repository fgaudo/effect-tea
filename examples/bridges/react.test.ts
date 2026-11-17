// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with React, and those of React alone: the run ends with its root and
// with a component that throws, and the draft's input is settled in StrictMode too; one run drawn by React and by
// snabbdom together, as `counter` and `form` draw theirs; then the premises of the bridge on React
// (`docs/premises.md`).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  type Dispatch,
  forwardTo,
  type MessageOf,
  type ModelOf,
  ProgramDefect,
  run,
} from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Opt from 'effect/Option'
import { act, createElement, type ReactNode, StrictMode } from 'react'
import type { VNode } from 'snabbdom'
import {
  type Bridge,
  bridgeTests,
  type Dictation,
  type desk,
  type draft,
  draftTests,
  element,
  holdFrames,
  type lid,
  mount,
  type note,
  paint,
  type RenderInto,
  setValue,
  settle,
  stop,
  type,
} from './bridge.test_suite.ts'
import { counter } from '../counter/counter.ts'
import { view as snabbdomCounterView } from '../counter/view-snabbdom.ts'
import { form } from '../form/form.ts'
import { Storage } from '../form/storage.ts'
import { view as snabbdomFormView } from '../form/view-snabbdom.ts'
import type { View } from './react.ts'
import { renderInto as renderWithSnabbdom } from './snabbdom.ts'
import { together } from '../together.ts'
import type { Message as VolumeMessage, Model as VolumeModel } from '../volume/volume.ts'

// React DOM reads the DOM when it is loaded, so the bridge, the views and React DOM are loaded once there is one:
// what the shared tests are given reaches them when a test runs.
let bridge: typeof import('./react.ts')
let counterView: typeof import('../counter/view-react.tsx').view
let formView: typeof import('../form/view-react.tsx').view
let flushSync: typeof import('react-dom').flushSync
let createRoot: typeof import('react-dom/client').createRoot

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
  bridge = await import('./react.ts')
  counterView = (await import('../counter/view-react.tsx')).view
  formView = (await import('../form/view-react.tsx')).view
  flushSync = (await import('react-dom')).flushSync
  createRoot = (await import('react-dom/client')).createRoot
})

afterAll(() => GlobalRegistrator.unregister())

// The run ends inside `act`, which returns once React has done all the work the end set going, the unmount's
// included: none is left to read the DOM after the last test. React asks the environment to say it acts, and only
// for the call, so that the frames of the tests, drawn outside `act`, are not taken for updates it was not given.
afterEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  try {
    await act(stop)
  } finally {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  }
})

const drawButton = (text: string, onClick: () => void) => createElement('button', { type: 'button', onClick }, text)

type Own = 'SendClicked' | 'DiscardClicked'
type DraftProps = Readonly<{ model: ModelOf<typeof draft>; dispatch: Dispatch<MessageOf<typeof draft>> }>

const DraftView = ({ model, dispatch }: DraftProps): ReactNode =>
  createElement(
    'form',
    null,
    createElement(bridge.Shows, { value: model.text, dispatch: forwardTo(dispatch, 'Text') }),
    drawButton('Send', bridge.onClick<Own>('SendClicked', dispatch)),
    drawButton('Discard', bridge.onClick<Own>('DiscardClicked', dispatch)),
    createElement('output', null, model.text),
  )

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    'main',
    null,
    createElement(DraftView, { model: model.draft, dispatch: forwardTo(dispatch, 'Draft') }),
    drawButton('Keep', bridge.onClick<MessageOf<typeof desk>>('Kept', dispatch)),
    drawButton('Undo', bridge.onClick<MessageOf<typeof desk>>('Undone', dispatch)),
    createElement('ul', null, ...model.sent.map((text, index) => createElement('li', { key: index }, text))),
  )

// Only the ringer is drawn here, which is what the shared test drags.
const volumeView: View<VolumeModel, VolumeMessage> = (model, dispatch) =>
  createElement(
    'main',
    null,
    createElement(
      'div',
      {
        className: 'track ringer',
        onPointerDown: Opt.match(model.ringer.press, {
          onNone: () => undefined,
          onSome: (press) => bridge.onPress<VolumeMessage>(press, dispatch),
        }),
      },
      createElement('div', { className: 'fill', style: { width: `${model.ringer.level}%` } }),
      createElement('div', { className: 'cap', style: { left: `${model.ringer.max}%` } }),
    ),
    createElement('output', { className: 'ringer' }, String(model.ringer.level)),
  )

const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>> = (model, dispatch) =>
  createElement('main', null, createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, 'Note') }))

// `Shows` takes no ref: the element is found inside a wrapper. It listens from the wrapper's ref callback, a new one in
// every frame, which has run when `flushSync` returns (`docs/premises.md`), so that a test dictates with no turn for
// React; the cleanup it returns stops the last frame's.
const dictatedView = (source: Dictation): typeof noteView => (model, dispatch) =>
  createElement(
    'main',
    null,
    createElement(
      'span',
      {
        ref: (wrapper: HTMLSpanElement | null) =>
          wrapper === null ? undefined : source.listen((text) => {
            const shown = wrapper.querySelector('input')
            if (shown !== null) type(shown, text)
          }),
      },
      createElement(bridge.Shows, { value: model, dispatch: forwardTo(dispatch, 'Note') }),
    ),
  )

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === 'Opened'
    ? createElement(
      'main',
      null,
      createElement(bridge.Shows, { value: model.note, dispatch: forwardTo(dispatch, 'Note') }),
      drawButton('Close', bridge.onClick<MessageOf<typeof lid>>(model.close, dispatch)),
      createElement('output', null, model.note),
    )
    : createElement(
      'main',
      null,
      createElement('input', { value: 'Closed', readOnly: true }),
      drawButton('Open', bridge.onClick<MessageOf<typeof lid>>(model.open, dispatch)),
    )

const react: Bridge<ReactNode> = {
  renderInto: (root, view) => bridge.renderInto(root, view),
  views: {
    counter: (model, dispatch) => counterView(model, dispatch),
    form: (model, dispatch) => formView(model, dispatch),
    desk: deskView,
    volume: volumeView,
    note: noteView,
    dictated: dictatedView,
    lid: lidView,
  },
}

bridgeTests(react)

// StrictMode attaches every ref twice, and renders every component twice.
describe('in StrictMode', () => {
  draftTests({
    ...react,
    views: {
      ...react.views,
      desk: (model, dispatch) => createElement(StrictMode, null, deskView(model, dispatch)),
    },
  })
})

describe('renderInto, with React', () => {
  test('unmounts what it drew when the run ends', async () => {
    mount(react.renderInto, counterView, (render) => run(counter, render))
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

// Each renderer in a root of its own inside `#app`, given the half of a view's pair that is its own: snabbdom's first,
// which patches its root into the tree it draws, then React's.
type Both = Readonly<{ snabbdom: VNode; react: ReactNode }>

const bothInto: RenderInto<Both> = (root, view) => {
  root.innerHTML = '<div id="snabbdom"></div><div id="react"></div>'
  return together(
    renderWithSnabbdom(element('#snabbdom'), (model, dispatch) => view(model, dispatch).snabbdom),
    bridge.renderInto(element('#react'), (model, dispatch) => view(model, dispatch).react),
  )
}

const drawnBySnabbdom = <E extends Element>(selector: string): E => element(`#app > main ${selector}`)

const drawnByReact = <E extends Element>(selector: string): E => element(`#react ${selector}`)

describe('together, React beside snabbdom', () => {
  test('a click in either renderer is drawn by both at the next refresh', () => {
    mount(
      bothInto,
      (model: ModelOf<typeof counter>, dispatch: Dispatch<MessageOf<typeof counter>>) => ({
        snabbdom: snabbdomCounterView(model, dispatch),
        react: counterView(model, dispatch),
      }),
      (render) => run(counter, render),
    )
    settle()
    const counts = () => [drawnBySnabbdom('output').textContent, drawnByReact('output').textContent]
    expect(counts()).toEqual(['0', '0'])
    drawnByReact<HTMLButtonElement>('button:last-of-type').click()
    paint()
    expect(counts()).toEqual(['1', '1'])
    drawnBySnabbdom<HTMLButtonElement>('button:last-of-type').click()
    paint()
    expect(counts()).toEqual(['2', '2'])
  })

  test('each input keeps what the user typed into it since the frame, and shows what was typed into the other', () => {
    mount(
      bothInto,
      (model: ModelOf<typeof form>, dispatch: Dispatch<MessageOf<typeof form>>) => ({
        snabbdom: snabbdomFormView(model, dispatch),
        react: formView(model, dispatch),
      }),
      (render) => run(form, render).pipe(Effect.provideService(Storage, Storage.of({ save: () => Effect.void }))),
    )
    settle()
    const inReact = drawnByReact<HTMLInputElement>('input')
    const inSnabbdom = drawnBySnabbdom<HTMLInputElement>('input')
    type(inReact, 'A')
    settle()
    // The next key is in React's input before its message reaches the program: the frame drawn now knows only "A".
    setValue(inReact, 'Ad')
    paint()
    expect([inSnabbdom.value, inReact.value]).toEqual(['A', 'Ad'])
    type(inSnabbdom, 'Ada')
    paint()
    expect([drawnBySnabbdom('input'), drawnByReact('input')]).toEqual([inSnabbdom, inReact])
    expect([inSnabbdom.value, inReact.value]).toEqual(['Ada', 'Ada'])
  })
})

// The premises of the bridge on React (`docs/premises.md`), each checked on React alone: what react.dev says of
// `flushSync` is that the DOM is updated when it returns.
describe('React, as the bridge rests on it', () => {
  test('the ref callbacks of a commit have run when flushSync returns', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = createRoot(element('#app'))
    const attached: Array<string | null> = []
    // As the bridge's: a new ref in every render, which returns no cleanup, so React calls the old one with null.
    const ref = (frame: string) => (node: HTMLInputElement | null) => {
      attached.push(node === null ? null : `${frame} ${node.tagName}`)
    }
    flushSync(() => root.render(createElement('input', { ref: ref('first') })))
    expect(attached).toEqual(['first INPUT'])
    flushSync(() => root.render(createElement('input', { ref: ref('second') })))
    expect(attached).toEqual(['first INPUT', null, 'second INPUT'])
    root.unmount()
  })

  // react.dev ("<input>") says only that the JSX of an uncontrolled input does not control its value.
  test('React leaves the value of an input drawn without value or defaultValue as it is when it draws it again', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = createRoot(element('#app'))
    flushSync(() => root.render(createElement('input', { placeholder: 'first' })))
    const drawn = element<HTMLInputElement>('input')
    setValue(drawn, 'Ada')
    flushSync(() => root.render(createElement('input', { placeholder: 'second' })))
    expect(element('input')).toBe(drawn)
    expect([drawn.placeholder, drawn.value]).toEqual(['second', 'Ada'])
    root.unmount()
  })

  // react.dev says only that `unmount` removes the root's components and lets go of its DOM node.
  test('root.unmount() has removed what the root drew from the DOM when it returns', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = createRoot(element('#app'))
    flushSync(() => root.render(createElement('main', null, createElement('input'))))
    root.unmount()
    expect(element('#app').childElementCount).toBe(0)
  })

  test('onUncaughtError is called before flushSync returns', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const heard: Array<unknown> = []
    const root = createRoot(element('#app'), { onUncaughtError: (error) => heard.push(error) })
    const thrown = new Error('A component that cannot draw')
    const Broken = (): ReactNode => {
      throw thrown
    }
    flushSync(() => root.render(createElement(Broken)))
    expect(heard).toEqual([thrown])
    root.unmount()
  })
})
