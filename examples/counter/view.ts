import type { View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { onClick } from '../snabbdom.ts'
import type { Message, Model } from './counter.ts'

// snabbdom's props module never removes a prop, so both cases of a button set `disabled`: a button patched
// from disabled to enabled would stay disabled otherwise.
export const view: View<Model, Message, VNode> = (model, dispatch) =>
  h('main.counter', [
    model._tag === 'Counting'
      ? h('button', { props: { disabled: false }, on: onClick(model.decrement, dispatch) }, '−')
      : h('button', { props: { disabled: true } }, '−'),
    h('output', String(model.count)),
    h('button', { on: onClick(model.increment, dispatch) }, '+'),
  ])
