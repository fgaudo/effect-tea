// A page's offers already know where they go, so each page gets the one dispatch of the run. And since that
// dispatch is the same for every frame, snabbdom's `thunk` skips a page whose model has not changed.
import type { Dispatch, View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, thunk, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type * as About from './about.ts'
import type { Model } from './app.ts'
import type * as Clock from './clock.ts'

const clockView = (model: Clock.Model, dispatch: Dispatch): VNode =>
  h('main', [
    h('time', model.time),
    h('button', { on: onClick(model.openAbout, dispatch) }, 'About'),
  ])

const aboutView = (model: About.Model, dispatch: Dispatch): VNode =>
  h('main', [
    ...Opt.match(model.openedAt, { onNone: () => [], onSome: (at) => [h('p', `Opened at ${at}`)] }),
    h('blockquote', Opt.getOrElse(model.saying, () => '…')),
    h('button.secondary', { on: onClick(model.back, dispatch) }, 'Back'),
  ])

export const view: View<Model, VNode> = (model, dispatch) => {
  switch (model.page._tag) {
    case 'Clock':
      return thunk('main', 'clock', clockView, [model.page.model, dispatch])
    case 'About':
      return thunk('main', 'about', aboutView, [model.page.model, dispatch])
  }
}
