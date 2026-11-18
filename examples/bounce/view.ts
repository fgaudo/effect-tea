import { h } from 'snabbdom'
import { onClick, type View } from '../bridges/snabbdom.ts'
import type { Message, Model } from './bounce.ts'

// Drawn at `alpha` of the way from the step before to the current one, as the renderer says (`interpolated.ts`).
export const view = (alpha: number): View<Model, Message> => (model, dispatch) => {
  const { ball } = model
  const height = ball._tag === 'Flying' ? ball.from + (ball.to - ball.from) * alpha : ball.height
  return h('main', [
    h('div.court', [h('div.ball', { style: { bottom: `calc((100% - 2rem) * ${height / 100})` } })]),
    h('button', { on: onClick<Message>(model.throw, dispatch) }, 'Throw'),
  ])
}
