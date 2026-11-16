// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with React, and those of React alone: the run ends with its root and
// with a component that throws, and the draft's input is settled in StrictMode too; then the premises of the bridge
// on React (`docs/premises.md`).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  type Dispatch,
  dispatchTo,
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
  setValue,
  settle,
  stop,
  type,
} from './bridge.test_suite.ts'
import { counter } from './counter/counter.ts'
import type { View } from './react.ts'
import type { Message as VolumeMessage, Model as VolumeModel } from './volume/volume.ts'

// React DOM reads the DOM when it is loaded, so the bridge, the views and React DOM are loaded once there is one:
// what the shared tests are given reaches them when a test runs.
let bridge: typeof import('./react.ts')
let counterView: typeof import('./counter-react/view.tsx').view
let formView: typeof import('./form-react/view.tsx').view
let flushSync: typeof import('react-dom').flushSync
let createRoot: typeof import('react-dom/client').createRoot

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
  bridge = await import('./react.ts')
  counterView = (await import('./counter-react/view.tsx')).view
  formView = (await import('./form-react/view.tsx')).view
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
    createElement(bridge.Shows, { value: model.text, dispatch: dispatchTo(dispatch, 'Text') }),
    drawButton('Send', bridge.onClick<Own>('SendClicked', dispatch)),
    drawButton('Discard', bridge.onClick<Own>('DiscardClicked', dispatch)),
    createElement('output', null, model.text),
  )

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    'main',
    null,
    createElement(DraftView, { model: model.draft, dispatch: dispatchTo(dispatch, 'Draft') }),
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
  createElement('main', null, createElement(bridge.Shows, { value: model, dispatch: dispatchTo(dispatch, 'Note') }))

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
      createElement(bridge.Shows, { value: model, dispatch: dispatchTo(dispatch, 'Note') }),
    ),
  )

const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === 'Opened'
    ? createElement(
      'main',
      null,
      createElement(bridge.Shows, { value: model.note, dispatch: dispatchTo(dispatch, 'Note') }),
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

// The premises of the bridge on React (`docs/premises.md`), each checked on React alone: what react.dev says of
// `flushSync` is that the DOM is updated when it returns.
describe('React, as the bridge rests on it', () => {
  test('the ref callbacks of a commit have run when flushSync returns', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const root = createRoot(element('#app'))
    const attached: Array<string> = []
    // A ref that returns its cleanup is never called with null, as the bridge's are not.
    const ref = (node: HTMLInputElement) => {
      attached.push(node.tagName)
      return () => {}
    }
    flushSync(() => root.render(createElement('input', { ref })))
    expect(attached).toEqual(['INPUT'])
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
