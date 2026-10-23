// Each page gets a dispatch of its own, which wraps its messages as the parent receives them. `dispatchTo` gives
// it the same dispatch in every frame, so snabbdom's `thunk` skips a page whose model has not changed.
import { type Dispatch, dispatchTo, type View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, thunk, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type * as About from './about.ts'
import type { Message, Model } from './app.ts'
import type * as Clock from './clock.ts'

const clockView = (model: Clock.Model, dispatch: Dispatch<Clock.Message>): VNode =>
  h('main', [
    h('time', model.time),
    h('button', { on: onClick(model.openAbout, dispatch) }, 'About'),
  ])

const aboutView = (model: About.Model, dispatch: Dispatch<About.Message>): VNode =>
  h('main', [
    ...Opt.match(model.openedAt, { onNone: () => [], onSome: (at) => [h('p', `Opened at ${at}`)] }),
    h('blockquote', Opt.getOrElse(model.saying, () => '…')),
    h('button.secondary', { on: onClick(model.back, dispatch) }, 'Back'),
  ])

export const view: View<Model, Message, VNode> = (model, dispatch) => {
  switch (model.page._tag) {
    case 'Clock':
      return thunk('main', 'clock', clockView, [model.page.model, dispatchTo(dispatch, 'Clock')])
    case 'About':
      return thunk('main', 'about', aboutView, [model.page.model, dispatchTo(dispatch, 'About')])
  }
}
