import { mapDispatch, type View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type * as About from './about.ts'
import { Message, type Model } from './app.ts'
import type * as Clock from './clock.ts'

const clockView: View<Clock.Model, Clock.Message, VNode> = (model, dispatch) =>
  h('main', [
    h('time', model.time),
    h('button', { on: onClick(model.openAbout, dispatch) }, 'About'),
  ])

const aboutView: View<About.Model, About.Message, VNode> = (model, dispatch) =>
  h('main', [
    h('blockquote', Opt.getOrElse(model.saying, () => '…')),
    h('button', { on: onClick(model.back, dispatch) }, 'Back'),
  ])

// Each page sends through the parent's dispatch, wrapped as `embed` wraps it: so its offers stay valid.
export const view: View<Model, Message, VNode> = (model, dispatch) => {
  switch (model.page._tag) {
    case 'Clock':
      return clockView(model.page.model, mapDispatch(dispatch, (message) => Message.GotClock({ message })))
    case 'About':
      return aboutView(model.page.model, mapDispatch(dispatch, (message) => Message.GotAbout({ message })))
  }
}
