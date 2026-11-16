// The snabbdom bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with snabbdom, its draft memoized with `thunk`, and those of snabbdom
// alone: an input the style module keeps on screen as it fades sends nothing, and the timer's buttons lend no
// `disabled` to each other; then the premises of the bridge on snabbdom (`docs/premises.md`).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type Dispatch, dispatchTo, type MessageOf, type ModelOf, run } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import { eventListenersModule, h, init, propsModule, styleModule, thunk, type VNode } from 'snabbdom'
import {
  type Bridge,
  bridgeTests,
  button,
  type Dictation,
  type desk,
  type draft,
  element,
  holdFrames,
  lid,
  mount,
  type note,
  paint,
  settle,
  stop,
  type,
} from './bridge.test_suite.ts'
import { view as counterView } from './counter/view.ts'
import { view as formView } from './form/view.ts'
import { onClick, renderInto, shows, type View } from './snabbdom.ts'
import { Bell, Phase, timer } from './timer/timer.ts'
import { timerView } from './timer/view.ts'
import { view as volumeView } from './volume/view.ts'

beforeAll(() => {
  GlobalRegistrator.register()
  holdFrames()
})

afterAll(() => GlobalRegistrator.unregister())

afterEach(stop)

type Own = 'SendClicked' | 'DiscardClicked'

const draftView = (model: ModelOf<typeof draft>, dispatch: Dispatch<MessageOf<typeof draft>>): VNode =>
  h('form', [
    h('input', shows(model.text, dispatchTo(dispatch, 'Text'))),
    h('button', { props: { type: 'button' }, on: onClick<Own>('SendClicked', dispatch) }, 'Send'),
    h('button', { props: { type: 'button' }, on: onClick<Own>('DiscardClicked', dispatch) }, 'Discard'),
    h('output', model.text),
  ])

const deskView: View<ModelOf<typeof desk>, MessageOf<typeof desk>> = (model, dispatch) =>
  h('main', [
    // Skipped while the draft's state is the same object: the bridge settles its input all the same.
    thunk('form', 'draft', draftView, [model.draft, dispatchTo(dispatch, 'Draft')]),
    h('button', { on: onClick<MessageOf<typeof desk>>('Kept', dispatch) }, 'Keep'),
    h('button', { on: onClick<MessageOf<typeof desk>>('Undone', dispatch) }, 'Undo'),
    h('ul', model.sent.map((text) => h('li', text))),
  ])

const noteView: View<ModelOf<typeof note>, MessageOf<typeof note>> = (model, dispatch) =>
  h('main', [h('input', shows(model, dispatchTo(dispatch, 'Note')))])

// Each result is put into the element on screen, and written through its own listener.
const dictatedView = (source: Dictation): typeof noteView => {
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

// The same `<input>` in both cases, which snabbdom patches into each other: the props module never removes a prop, so
// the input sets `readOnly` too.
const lidView: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
  model._tag === 'Opened'
    ? h('main', [
      h('input', { ...shows(model.note, dispatchTo(dispatch, 'Note')), props: { readOnly: false } }),
      h('button', { on: onClick<MessageOf<typeof lid>>(model.close, dispatch) }, 'Close'),
      h('output', model.note),
    ])
    : h('main', [
      h('input', { props: { value: 'Closed', readOnly: true } }),
      h('button', { on: onClick<MessageOf<typeof lid>>(model.open, dispatch) }, 'Open'),
    ])

const snabbdom: Bridge<VNode> = {
  renderInto,
  views: {
    counter: counterView,
    form: formView,
    desk: deskView,
    volume: volumeView,
    note: noteView,
    dictated: dictatedView,
    lid: lidView,
  },
}

bridgeTests(snabbdom)

// The style module keeps an element a frame removes on screen until its `remove` styles are done: the bridge forgets
// it as the frame removes it.
describe('an input the style module keeps on screen as it fades', () => {
  test('sends nothing once a frame has removed it', () => {
    const applied: Array<MessageOf<typeof lid>> = []
    const fading: View<ModelOf<typeof lid>, MessageOf<typeof lid>> = (model, dispatch) =>
      model._tag === 'Opened'
        ? h('main', [
          h('input', {
            ...shows(model.note, dispatchTo(dispatch, 'Note')),
            style: { opacity: '1', transition: 'opacity 1s', remove: { opacity: '0' } },
          }),
          h('button', { on: onClick<MessageOf<typeof lid>>(model.close, dispatch) }, 'Close'),
        ])
        : h('main', [h('button', { on: onClick<MessageOf<typeof lid>>(model.open, dispatch) }, 'Open')])
    mount(renderInto, fading, (render) =>
      run(lid, render, {
        flags: 'Opened',
        onApplied: ({ message }) => Effect.sync(() => applied.push(message)),
      }))
    settle()
    const input = element<HTMLInputElement>('input')
    button('Close').click()
    paint()
    expect(input.isConnected).toBe(true)
    type(input, 'draft!')
    paint()
    expect(applied).toEqual(['Closed'])
  })
})

// snabbdom reuses the timer's buttons by position, and its props module never removes a prop: the disabled "−" of one
// minute must not lend its `disabled` to the button drawn in its place.
describe('the buttons of the timer', () => {
  const quiet = Bell.of({ ring: Effect.void })
  const oneMinute = { ...timer, init: { state: { minutes: 1, phase: Phase.Setting() } } }

  test('only the "−" of one minute is disabled, through a start and a reset', () => {
    mount(renderInto, timerView, (render) => run(oneMinute, render).pipe(Effect.provideService(Bell, quiet)))
    settle()
    expect(button('−').disabled).toBe(true)
    button('Start').click()
    paint()
    expect([button('Pause').disabled, button('Reset').disabled]).toEqual([false, false])
    button('Reset').click()
    paint()
    expect([button('−').disabled, button('+').disabled, button('Start').disabled]).toEqual([true, false, false])
  })
})

// The premise of the bridge on snabbdom (`docs/premises.md`), checked on snabbdom alone: its README describes the reuse
// of keyed elements only.
test('snabbdom reuses an <input> with no key in the same place', () => {
  document.body.innerHTML = '<div id="app"></div>'
  const patch = init([propsModule])
  const first = patch(element('#app'), h('main', [h('input', { props: { placeholder: 'first' } })]))
  const drawn = element<HTMLInputElement>('input')
  patch(first, h('main', [h('input', { props: { placeholder: 'second' } })]))
  expect(element('input')).toBe(drawn)
  expect(drawn.placeholder).toBe('second')
})

// The bridge's other premise, on snabbdom alone: its README says that `update` runs as an element is updated, and
// nothing of the vnodes it skips.
test('snabbdom calls a module\'s update hook on every element h draws again, one h is given no data for included', () => {
  document.body.innerHTML = '<div id="app"></div>'
  const updated: Array<unknown> = []
  const patch = init([propsModule, { update: (_, vnode) => void updated.push(vnode.elm) }])
  const first = patch(element('#app'), h('main', [h('input', { props: { placeholder: 'first' } })]))
  const drawn = element<HTMLInputElement>('input')
  patch(first, h('main', [h('input')]))
  expect(updated).toContain(drawn)
})

// A third, on snabbdom alone: its README says that the module of listeners attaches them, not when it takes them off.
test('snabbdom\'s module of listeners takes off those of an element a patch removes, though the style module keeps it on screen as it fades', () => {
  document.body.innerHTML = '<div id="app"></div>'
  const heard: Array<string> = []
  const patch = init([styleModule, eventListenersModule])
  const first = patch(element('#app'), h('main', [h('input', {
    on: { input: () => void heard.push('input') },
    style: { opacity: '1', transition: 'opacity 1s', remove: { opacity: '0' } },
  })]))
  const drawn = element<HTMLInputElement>('input')
  patch(first, h('main'))
  expect(drawn.isConnected).toBe(true)
  drawn.dispatchEvent(new Event('input', { bubbles: true }))
  expect(heard).toEqual([])
})
