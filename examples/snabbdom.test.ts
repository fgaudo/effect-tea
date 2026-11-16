// The snabbdom bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with snabbdom, its draft memoized with `thunk`, and those of the
// bridge's own `slides`: a slider writes its number, keeps it through the frames drawn while it is dragged, and a frame
// that has not seen a drag leaves it alone; an input the style module keeps on screen as it fades sends nothing; then
// the premise of the bridge on snabbdom (`docs/premises.md`).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type Dispatch, dispatchTo, type MessageOf, type ModelOf, run } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { h, init, propsModule, thunk, type VNode } from 'snabbdom'
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
  refresh,
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
import { Pointer, volume } from './volume/volume.ts'

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
  skips: 'a thunk',
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

// The native slider of `volume`, drawn with `slides`: the React bridge has no slider.
describe('the sliders of the volume', () => {
  const drag = (slider: HTMLInputElement, value: number) => {
    slider.value = String(value)
    slider.dispatchEvent(new Event('input'))
  }
  const media = () => element<HTMLInputElement>('input.media')
  const shown = (selector: string) => element(selector).textContent
  const mountVolume = () =>
    mount(
      renderInto,
      volumeView,
      (render) => run(volume, render).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.empty }))),
    )

  test('the native one writes its number, and a frame drawn while it is dragged keeps it', () => {
    mountVolume()
    settle()
    const slider = media()
    drag(slider, 80)
    paint()
    expect(media()).toBe(slider)
    expect([slider.value, shown('output.media')]).toEqual(['80', '80'])
  })

  // The slider is never replaced: muted, it is given 0 and disabled, and unmuted, it is given the level back.
  test('muted, the native one shows 0 on the same slider, and unmuted it gets the level back', () => {
    mountVolume()
    settle()
    const slider = media()
    drag(slider, 80)
    paint()
    button('Mute').click()
    paint()
    expect(media()).toBe(slider)
    expect([slider.value, slider.disabled]).toEqual(['0', true])
    button('Unmute').click()
    paint()
    expect(media()).toBe(slider)
    expect([slider.value, slider.disabled, shown('output.media')]).toEqual(['80', false, '80'])
  })

  test('a drag of the native one after Mute, before its frame, is stored, and Unmute gives it back', () => {
    mountVolume()
    settle()
    const slider = media()
    button('Mute').click()
    drag(slider, 80)
    paint()
    expect([slider.value, slider.disabled]).toEqual(['0', true])
    button('Unmute').click()
    paint()
    expect([slider.value, shown('output.media')]).toEqual(['80', '80'])
  })

  test('a frame that has not seen a drag sent before it was drawn leaves the native one where it is', () => {
    mountVolume()
    settle()
    const slider = media()
    drag(slider, 20)
    paint()
    // The frame of quiet hours is drawn before the run takes the drag, as in the draft's test of
    // `bridge.test_suite.ts`.
    button('Quiet hours').click()
    settle()
    drag(slider, 25)
    refresh()
    expect(slider.value).toBe('25')
    paint()
    expect([slider.value, shown('output.media')]).toEqual(['25', '25'])
  })
})

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
