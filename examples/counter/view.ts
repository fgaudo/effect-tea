import type { View } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type { Message, Model } from './counter.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    h('button', { on: onClick(model.decrement, dispatch), props: { disabled: Opt.isNone(model.decrement) } }, '−'),
    h('output', String(model.count)),
    h('button', { on: onClick(model.increment, dispatch) }, '+'),
  ])
