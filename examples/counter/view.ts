import type { View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type { Message, Model } from './counter.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main', [
    model._tag === 'Counting'
      ? h('button', { on: onClick(model.decrement, dispatch) }, '−')
      : h('button', { props: { disabled: true } }, '−'),
    h('output', String(model.count)),
    h('button', { on: onClick(model.increment, dispatch) }, '+'),
  ])
