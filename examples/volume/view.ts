import { dispatchTo, type View } from '@fgaudo/effect-tea'
import { h, type VNode } from 'snabbdom'
import { initialValue, onClick, onSlide } from '../snabbdom.ts'
import type { Message, Model } from './volume.ts'

export const view: View<Model, Message, VNode> = (model, dispatch) => {
  const { level, sound, limit } = model
  return h('main', [
    h('input', {
      // A new slider when the program replaces the level; otherwise the user's own, under the pointer.
      key: level.revision,
      // The bounds come before the value, which `initialValue` writes after the props.
      props: { type: 'range', min: 0, max: model.max, step: 1, disabled: sound._tag === 'Muted' },
      ...initialValue(level.value),
      on: sound._tag === 'Muted' ? {} : onSlide(level, dispatchTo(dispatch, 'Level')),
    }),
    h('output', String(level.value)),
    sound._tag === 'Muted'
      ? h('button', { on: onClick<Message>(sound.unmute, dispatch) }, 'Unmute')
      : h('button', { on: onClick<Message>(sound.mute, dispatch) }, 'Mute'),
    limit._tag === 'Quiet'
      ? h('button', { on: onClick<Message>(limit.full, dispatch) }, 'Full volume')
      : h('button', { on: onClick<Message>(limit.quiet, dispatch) }, 'Quiet hours'),
  ])
}
