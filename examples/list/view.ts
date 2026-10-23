// Each stopwatch gets a dispatch of its own, which adds its id to its messages. Its model is kept while its state
// is the same, and `dispatchTo` gives it the same dispatch in every frame, so snabbdom's `thunk` draws again only
// the stopwatch that changed.
import { type Dispatch, dispatchTo, type View } from '@fgaudo/effect-tea'
import { h, thunk, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type { Message, Model } from './list.ts'
import type * as Stopwatch from './stopwatch.ts'

const stopwatchView = (model: Stopwatch.Model, dispatch: Dispatch<Stopwatch.Message>): VNode =>
  h('li', [
    h('output', `${model.seconds} s`),
    model.watch._tag === 'Running'
      ? h('button', { on: onClick(model.watch.stop, dispatch) }, 'Stop')
      : h('button', { on: onClick(model.watch.start, dispatch) }, 'Start'),
    h('button.secondary', { on: onClick(model.remove, dispatch) }, 'Remove'),
  ])

export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('button', { on: onClick(model.add, dispatch) }, 'Add a stopwatch'),
    h(
      'ul',
      model.stopwatches.map(({ id, model }) =>
        thunk('li', String(id), stopwatchView, [model, dispatchTo(dispatch, 'Stopwatch', id)])
      ),
    ),
  ])
