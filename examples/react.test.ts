// React's bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with React, its draft memoized with `memo`, and those of React alone:
// the run ends with its root and with a component that throws, the draft's input is settled in StrictMode too, and an
// input drawn through a portal is settled by the frames of its run.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import {
  composition,
  type Dispatch,
  dispatchTo,
  type MessageOf,
  type ModelOf,
  ProgramDefect,
  run,
  type Written,
} from '@fgaudo/effect-tea'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import { createElement, Fragment, memo, type ReactNode, StrictMode, useEffect, useRef } from 'react'
import {
  type Bridge,
  bridgeTests,
  button,
  type Dictation,
  type desk,
  type draft,
  draftTests,
  element,
  holdFrames,
  mount,
  type note,
  paint,
  settle,
  state,
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
let portal: typeof import('react-dom').createPortal

beforeAll(async () => {
  GlobalRegistrator.register()
  holdFrames()
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

afterEach(stop)

const drawButton = (text: string, onClick: () => void) => createElement('button', { type: 'button', onClick }, text)

type Own = 'SendClicked' | 'DiscardClicked'
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

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  createElement(
    'main',
    null,
    createElement(DraftView, { model: model.draft, dispatch: dispatchTo(dispatch, 'Draft') }),
    drawButton('Keep', bridge.onClick<MessageOf<typeof desk>>('Kept', dispatch)),
    drawButton('Undo', bridge.onClick<MessageOf<typeof desk>>('Undone', dispatch)),
    createElement('ul', null, ...model.sent.map((text, index) => createElement('li', { key: index }, text))),
  )

// The bridge has no component for the media's native range, an input over a number: `Shows` is a text input over a
// string. Only the ringer, which the program draws, is drawn here.
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

const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>> = (model, dispatch) =>
  createElement('main', null, createElement(bridge.Shows, { value: model, dispatch: dispatchTo(dispatch, 'Note') }))

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
  createElement('main', null, createElement(Dictated, { value: model, dispatch: dispatchTo(dispatch, 'Note'), source }))

const react: Bridge<ReactNode> = {
  renderInto: (root, view) => bridge.renderInto(root, view),
  skips: 'memo',
  views: {
    counter: (model, dispatch) => counterView(model, dispatch),
    form: (model, dispatch) => formView(model, dispatch),
    desk: deskView,
    volume: volumeView,
    note: noteView,
    dictated: dictatedView,
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
    mount(react.renderInto, view, (render) => run(solo, render))
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
