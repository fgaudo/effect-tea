// A stopwatch's offers carry its id, so it gets the one dispatch of the run. Its model is kept while its state is
// the same, and the dispatch is the same for every frame, so snabbdom's `thunk` draws again only the stopwatch that
// changed.
import type { Dispatch, View } from '@fgaudo/effect-tea'
import { h, thunk, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type { Model } from './list.ts'
import type * as Stopwatch from './stopwatch.ts'

const stopwatchView = (model: Stopwatch.Model, dispatch: Dispatch): VNode =>
  h('li', [
    h('output', `${model.seconds} s`),
    model.watch._tag === 'Running'
      ? h('button', { on: onClick(model.watch.stop, dispatch) }, 'Stop')
      : h('button', { on: onClick(model.watch.start, dispatch) }, 'Start'),
    h('button', { on: onClick(model.remove, dispatch) }, 'Remove'),
  ])

export const view: View<Model, VNode> = (model, dispatch) =>
  h('main', [
    h('button', { on: onClick(model.add, dispatch) }, 'Add a stopwatch'),
    h('ul', model.stopwatches.map(({ id, model }) => thunk('li', String(id), stopwatchView, [model, dispatch]))),
  ])
