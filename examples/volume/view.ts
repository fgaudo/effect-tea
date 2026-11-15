import { dispatchTo } from '@fgaudo/effect-tea'
import * as Opt from 'effect/Option'
import { h } from 'snabbdom'
import { onClick, onPress, slides, type View } from '../snabbdom.ts'
import type { Message, Model } from './volume.ts'

export const view: View<Model, Message> = (model, dispatch) => {
  const { sound, limit, media } = model
  return h('main', [
    h('section.volume', [
      h('h2', 'Media'),
      // A native range over a plain input: its bounds never change. Muted, it shows 0 and cannot be dragged.
      h('input.media', {
        ...slides(media.level, dispatchTo(dispatch, 'Media')),
        props: { type: 'range', min: 0, max: 100, step: 1, disabled: media._tag === 'Fixed' },
      }),
      h('output.media', String(media.level)),
      sound._tag === 'Muted'
        ? h('button', { on: onClick<Message>(sound.unmute, dispatch) }, 'Unmute')
        : h('button', { on: onClick<Message>(sound.mute, dispatch) }, 'Mute'),
    ]),
    h('section.volume', [
      h('h2', 'Ringer'),
      // Drawn by the program: a press starts a drag, whose moves `update` puts within the bounds it holds.
      h(
        'div.track',
        { on: Opt.match(model.press, { onNone: () => ({}), onSome: (press) => onPress<Message>(press, dispatch) }) },
        [
          h('div.fill', { style: { width: `${model.ringer}%` } }),
          h('div.cap', { style: { left: `${model.max}%` } }),
        ],
      ),
      h('output.ringer', String(model.ringer)),
      limit._tag === 'Quiet'
        ? h('button', { on: onClick<Message>(limit.full, dispatch) }, 'Full volume')
        : h('button', { on: onClick<Message>(limit.quiet, dispatch) }, 'Quiet hours'),
    ]),
  ])
}
