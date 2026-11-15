// The snabbdom bridge in a DOM (happy-dom), with screen refreshes that happen only when a test paints: the tests every
// bridge passes (`bridge.test_suite.ts`), drawn with snabbdom, its draft memoized with `thunk`, and those of the
// bridge's own `slides`: a slider writes its number, keeps it through the frames drawn while it is dragged, and a frame
// that has not seen a drag leaves it alone.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type Dispatch, dispatchTo, type MessageOf, type ModelOf, run } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { h, thunk, type VNode } from 'snabbdom'
import {
  type Bridge,
  bridgeTests,
  button,
  type Dictation,
  type desk,
  type draft,
  element,
  holdFrames,
  mount,
  type note,
  paint,
  refresh,
  settle,
  stop,
} from './bridge.test_suite.ts'
import { view as counterView } from './counter/view.ts'
import { view as formView } from './form/view.ts'
import { onClick, renderInto, shows, type View } from './snabbdom.ts'
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
