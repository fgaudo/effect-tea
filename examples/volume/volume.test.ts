import { describe, expect, test } from 'bun:test'
import { type Field, isRejected, write } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { Limit, type Message, type Model, Own, Sound, type State, update, volume } from './volume.ts'

const start = volume.init.state

const state: fc.Arbitrary<State> = fc.record({
  level: fc.record({ value: fc.integer({ min: 0, max: 100 }), revision: fc.nat() }),
  sound: fc.oneof(
    fc.constant(null).map(() => Sound.Audible()),
    fc.integer({ min: 0, max: 100 }).map((level) => Sound.Muted({ level })),
  ),
  limit: fc.constantFrom(Limit.Full(), Limit.Quiet()),
})

/** Where the user drags the slider drawn from `level`, as the view sends it. */
const dragging = (level: Field<number>, value: number): Message => ({ _tag: 'Level', message: write(level, value) })

// What the model holds: the messages of its buttons. What is dragged is none of them.
const messagesOf = ({ sound, limit }: Model): ReadonlyArray<Message> => [
  sound._tag === 'Muted' ? sound.unmute : sound.mute,
  limit._tag === 'Quiet' ? limit.full : limit.quiet,
]

describe('volume', () => {
  // `update` alone: the rules, without running anything.
  describe('update', () => {
    test('stores where the slider is dragged', () => {
      expect(applyAll(update)([dragging(start.level, 80)], start).state.level.value).toBe(80)
    })

    // The slider shows where it was dragged whatever the state: storing it keeps the two the same.
    test('accepts a drag of the slider on screen in any state, and keeps that slider', () => {
      fc.assert(fc.property(state, fc.integer({ min: 0, max: 100 }), (before, dragged) => {
        const after = update(dragging(before.level, dragged))(before)
        return !isRejected(after) && after.state.level.value === dragged
          && after.state.level.revision === before.level.revision
      }))
    })

    test('muting puts the level at 0, on a new slider, and unmuting gives it back', () => {
      const loud = applyAll(update)([dragging(start.level, 80)], start).state
      const muted = applyAll(update)([Own.MuteClicked()], loud).state
      expect(muted.level.value).toBe(0)
      expect(muted.level.revision).toBeGreaterThan(loud.level.revision)
      expect(applyAll(update)([Own.UnmuteClicked()], muted).state.level.value).toBe(80)
    })

    // Sent from a frame drawn before the mute: the slider it was dragged on has been replaced by one at 0, which
    // does not show it, even when the level was 0 already.
    test('a drag of a slider the volume has since muted is rejected, even at 0', () => {
      for (const level of [80, 0]) {
        const drawn = applyAll(update)([dragging(start.level, level)], start).state
        const muted = applyAll(update)([Own.MuteClicked()], drawn).state
        expect(isRejected(update(dragging(drawn.level, 30))(muted))).toBe(true)
      }
    })

    test('quiet hours bring a louder level down to their maximum, and a muted one too', () => {
      const loud = applyAll(update)([dragging(start.level, 80), Own.QuietClicked()], start).state
      expect(loud.level.value).toBe(30)
      const muted = applyAll(update)([dragging(start.level, 80), Own.MuteClicked(), Own.QuietClicked()], start).state
      expect(applyAll(update)([Own.UnmuteClicked()], muted).state.level.value).toBe(30)
    })

    // The slider drawn before quiet hours goes up to 100, and the input takes any number: only the revision keeps
    // what it writes out of the new bounds.
    test('a drag of a slider drawn before quiet hours is rejected, even when the level was within them', () => {
      const drawn = applyAll(update)([dragging(start.level, 20)], start).state
      const quiet = applyAll(update)([Own.QuietClicked()], drawn).state
      expect(quiet.level.value).toBe(20)
      expect(isRejected(update(dragging(drawn.level, 80))(quiet))).toBe(true)
    })

    // What a slider drawn with the quiet bounds writes is within the full ones: the drag in progress goes on.
    test('full volume keeps the slider being dragged', () => {
      const quiet = applyAll(update)([Own.QuietClicked()], start).state
      const full = applyAll(update)([Own.FullClicked()], quiet).state
      expect(full.level).toBe(quiet.level)
      expect(applyAll(update)([dragging(quiet.level, 25)], full).state.level.value).toBe(25)
    })
  })

  // The model, for any state: every message it holds is accepted, a double click acts once, and nothing `update`
  // accepts is missing. No level is drawn: what is dragged is no message of the model's.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    const violations = dispatchViolations(update)
    const candidates = [Own.MuteClicked(), Own.UnmuteClicked(), Own.QuietClicked(), Own.FullClicked()]
    fc.assert(fc.property(state, (before) => {
      expect(violations(before, messagesOf(volume.makeModel(before)), candidates)).toEqual([])
    }))
  })

  // The program as it runs, driven like a user would.
  test('a user drags the volume up, mutes it and gets it back', async () => {
    const level = await Effect.runPromise(
      drive(
        volume,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send(({ level }) => Opt.some(dragging(level, 80)))
          yield* driver.send(({ sound }) => sound._tag === 'Audible' ? Opt.some(sound.mute) : Opt.none())
          yield* driver.send(({ sound }) => sound._tag === 'Muted' ? Opt.some(sound.unmute) : Opt.none())
          return yield* driver.waitFor((model) => model.sound._tag === 'Audible' ? Opt.some(model.level) : Opt.none())
        }),
      ),
    )
    expect(level.value).toBe(80)
  })
})
