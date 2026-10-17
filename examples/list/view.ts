import { mapDispatch, type View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import { Message, type Model } from './list.ts'
import type * as Stopwatch from './stopwatch.ts'

const stopwatchView: View<Stopwatch.Model, Stopwatch.Message, VNode> = (model, dispatch) =>
  h('li', [
    h('output', `${model.seconds} s`),
    model.watch._tag === 'Running'
      ? h('button', { on: onClick(model.watch.stop, dispatch) }, 'Stop')
      : h('button', { on: onClick(model.watch.start, dispatch) }, 'Start'),
    h('button', { on: onClick(model.remove, dispatch) }, 'Remove'),
  ])

// Each stopwatch sends through the parent's dispatch, wrapped with its id as `embedEach` wraps it.
export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('button', { on: onClick(model.add, dispatch) }, 'Add a stopwatch'),
    h(
      'ul',
      model.stopwatches.map(({ id, model }) =>
        stopwatchView(model, mapDispatch(dispatch, (message) => Message.GotStopwatch({ id, message })))
      ),
    ),
  ])
