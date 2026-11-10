// The views of the tutorial's steps, drawn with snabbdom. Each draws its model and formats its values, never
// deciding: what is shown, and which messages the controls send, is the model's.
import { dispatchTo, type View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, thunk, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type * as Duration from './duration.ts'
import type * as Timer from './timer.ts'
import type * as Timers from './timers.ts'

// #region duration
// snabbdom's props module never removes a prop, so both cases of "−" set `disabled`.
export const durationView: View<Duration.Model, Duration.Message, VNode> = (model, dispatch) =>
  h('main.timer', [
    Opt.match(model.less, {
      onNone: () => h('button', { props: { disabled: true } }, '−'),
      onSome: (less) => h('button', { props: { disabled: false }, on: onClick(less, dispatch) }, '−'),
    }),
    h('output', `${model.minutes} min`),
    h('button', { on: onClick(model.more, dispatch) }, '+'),
  ])
// #endregion duration

// #region timer
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export const timerView: View<Timer.Model, Timer.Message, VNode> = (model, dispatch) => {
  switch (model._tag) {
    case 'Setting':
      return h('div.timer', [
        Opt.match(model.less, {
          onNone: () => h('button', { props: { disabled: true } }, '−'),
          onSome: (less) => h('button', { props: { disabled: false }, on: onClick(less, dispatch) }, '−'),
        }),
        h('output', `${model.minutes} min`),
        h('button', { on: onClick(model.more, dispatch) }, '+'),
        h('button', { on: onClick(model.start, dispatch) }, 'Start'),
      ])
    case 'Running':
      return h('div.timer', [
        h('output', clock(model.secondsLeft)),
        h('button', { on: onClick(model.pause, dispatch) }, 'Pause'),
        h('button.secondary', { on: onClick(model.reset, dispatch) }, 'Reset'),
      ])
    case 'Paused':
      return h('div.timer', [
        h('output', clock(model.secondsLeft)),
        h('button', { on: onClick(model.resume, dispatch) }, 'Resume'),
        h('button.secondary', { on: onClick(model.reset, dispatch) }, 'Reset'),
      ])
    case 'Finished':
      return h('div.timer', [
        h('output', 'Done'),
        h('button', { on: onClick(model.reset, dispatch) }, 'Again'),
      ])
  }
}
// #endregion timer

// #region timers
// A timer's model is the same object while its state is, and `dispatchTo` gives it the same dispatch in every
// frame: `thunk` draws again only the timer that changed.
export const view: View<Timers.Model, Timers.Message, VNode> = (model, dispatch) =>
  h('main', [
    h('button', { on: onClick(model.add, dispatch) }, 'Add a timer'),
    h(
      'ul',
      model.timers.map(({ id, model, remove }) =>
        h('li', { key: id }, [
          thunk('div.timer', String(id), timerView, [model, dispatchTo(dispatch, 'Timer', id)]),
          h('button.secondary', { on: onClick(remove, dispatch) }, 'Remove'),
        ])
      ),
    ),
  ])
// #endregion timers
