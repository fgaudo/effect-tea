// A volume, set with a slider the user drags, that the program also sets: muting puts it at 0 and unmuting gives
// back the level it had, and quiet hours lower its maximum, bringing a louder level down. Muted, the slider shows 0
// and cannot be dragged. The level is an input over a number, as the form's name is over a text, with the same rule:
// a drag into a slider the program has replaced since is rejected, whatever it holds. What a slider adds is its
// bounds: the browser keeps a slider within those it was drawn with, and the input takes any number, so a program
// that narrows the bounds draws a new slider, even for a level within them, and a drag of one drawn wider is
// rejected for its revision.
import {
  composition,
  type Field,
  field,
  type MessageOf,
  type ModelOf,
  reject,
  renewed,
} from '@fgaudo/effect-tea'
import * as Data from 'effect/Data'
import * as Optic from 'effect/Optic'

/** Whether the volume is heard; a muted one keeps the level it had, to give it back. */
export type Sound = Data.TaggedEnum<{
  Audible: object
  Muted: { level: number }
}>

export const Sound = Data.taggedEnum<Sound>()

/** How loud the volume may go: quiet hours bring the maximum down. */
export type Limit = Data.TaggedEnum<{
  Full: object
  Quiet: object
}>

export const Limit = Data.taggedEnum<Limit>()

export const maxOf = (limit: Limit): number => limit._tag === 'Quiet' ? 30 : 100

export type State = Readonly<{
  level: Field<number>
  sound: Sound
  limit: Limit
}>

/** The volume's own messages: what the slider is dragged to is no message of the volume's. */
export type Own = Data.TaggedEnum<{
  MuteClicked: object
  UnmuteClicked: object
  QuietClicked: object
  FullClicked: object
}>

export const Own = Data.taggedEnum<Own>()

// A new slider at `value`: another value is one already, and the same one asks for it with `renewed`, since a
// field equal by value is the same input.
const newSlider = (level: Field<number>, value: number): Field<number> =>
  value === level.value ? renewed(level) : field(value)

const { input, compose } = composition<{ state: State }>()

export const volume = compose({
  init: () => ({ state: { level: field(50), sound: Sound.Audible(), limit: Limit.Full() } }),
  inputs: { Level: input(Optic.id<State>().key('level')) },
  update: (message: Own) => (state) => {
    switch (message._tag) {
      // The slider at 0 is another one even when the level was 0: a drag of the slider drawn before, handled after,
      // would be stored into a muted volume.
      case 'MuteClicked':
        return state.sound._tag === 'Muted'
          ? reject
          : { state: { ...state, level: newSlider(state.level, 0), sound: Sound.Muted({ level: state.level.value }) } }
      // The muted slider cannot be dragged, so nothing written into it is to reject: the level given back may stay on
      // the same slider.
      case 'UnmuteClicked':
        return state.sound._tag === 'Audible'
          ? reject
          : { state: { ...state, level: field(state.sound.level), sound: Sound.Audible() } }
      // The bounds narrow: a slider drawn with the old ones may still write above the new maximum, so the slider is
      // replaced whatever the level. A muted level stays 0, and gives back no more than the new maximum.
      case 'QuietClicked': {
        if (state.limit._tag === 'Quiet') return reject
        const max = maxOf(Limit.Quiet())
        return {
          state: {
            level: newSlider(state.level, Math.min(state.level.value, max)),
            sound: state.sound._tag === 'Muted'
              ? Sound.Muted({ level: Math.min(state.sound.level, max) })
              : state.sound,
            limit: Limit.Quiet(),
          },
        }
      }
      // The bounds widen: what a slider drawn with the old ones writes is within the new ones, so the slider stays,
      // and so does a drag in progress.
      case 'FullClicked':
        return state.limit._tag === 'Full' ? reject : { state: { ...state, limit: Limit.Full() } }
    }
  },
  makeModel: (state) => ({
    // The volume's own state: the view draws the slider from it, and writes into it.
    level: state.level,
    max: maxOf(state.limit),
    sound: state.sound._tag === 'Muted'
      ? { _tag: 'Muted' as const, unmute: Own.UnmuteClicked() }
      : { _tag: 'Audible' as const, mute: Own.MuteClicked() },
    limit: state.limit._tag === 'Quiet'
      ? { _tag: 'Quiet' as const, full: Own.FullClicked() }
      : { _tag: 'Full' as const, quiet: Own.QuietClicked() },
  }),
})

export type Model = ModelOf<typeof volume>

/** The volume's messages, made by the library: its own, and `{ _tag: 'Level', message }` for what is dragged. */
export type Message = MessageOf<typeof volume>

export const update = volume.update
