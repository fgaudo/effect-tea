import { describe, expect, test } from 'bun:test'
import { InvariantDefect, reject } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, rehearse } from '@fgaudo/effect-tea/testing'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as fc from 'fast-check'
import { Drag, Limit, type Message, type Model, Own, Pointer, Sound, type State, update, volume } from './volume.ts'

const start = volume.init.state

const state: fc.Arbitrary<State> = fc.record({
  media: fc.integer({ min: 0, max: 100 }),
  sound: fc.constantFrom(Sound.Audible(), Sound.Muted()),
  ringer: fc.integer({ min: 0, max: 100 }),
  limit: fc.constantFrom(Limit.Full(), Limit.Quiet()),
  drag: fc.constantFrom(Drag.Idle(), Drag.Dragging()),
})

/** Where the user drags the media's slider, drawn at `was`, as the view sends it. */
const dragging = (was: number, value: number): Message => ({ _tag: 'Media', message: { _tag: 'Written', was, value } })

// What the model holds: the messages of its buttons and of the ringer's track. What the media's slider is dragged to
// is none of them, and the moves of a drag are a subscription's.
const messagesOf = ({ sound, limit, press }: Model): ReadonlyArray<Message> => [
  sound._tag === 'Muted' ? sound.unmute : sound.mute,
  limit._tag === 'Quiet' ? limit.full : limit.quiet,
  ...Opt.toArray(press),
]

describe('volume', () => {
  // `update` alone: the rules, without running anything.
  describe('update', () => {
    test('stores where the media\'s slider is dragged', () => {
      expect(applyAll(update)([dragging(50, 80)], start).state.media).toBe(80)
    })

    // The slider shows where it was dragged whatever the state: storing it keeps the two the same.
    test('accepts a drag of the media\'s slider over the level held, in any state', () => {
      fc.assert(fc.property(state, fc.integer({ min: 0, max: 100 }), (before, dragged) => {
        const after = update(dragging(before.media, dragged))(before)
        return after !== reject && after.state.media === dragged
      }))
    })

    test('muting leaves the media\'s level as it is, and unmuting gives it back', () => {
      const muted = applyAll(update)([dragging(50, 80), Own.MuteClicked()], start).state
      expect(muted).toMatchObject({ media: 80, sound: Sound.Muted() })
      expect(volume.makeModel(muted).media).toEqual({ _tag: 'Fixed', level: 0 })
      expect(volume.makeModel(applyAll(update)([Own.UnmuteClicked()], muted).state).media)
        .toEqual({ _tag: 'Adjustable', level: 80 })
    })

    // Sent from a frame drawn before the mute: it was dragged over the level the volume still holds. Stored, it is
    // what the user meant, and unmuting gives it back.
    test('a drag of the media\'s slider drawn before it was muted is stored', () => {
      const muted = applyAll(update)([Own.MuteClicked()], start).state
      expect(applyAll(update)([dragging(50, 80), Own.UnmuteClicked()], muted).state.media).toBe(80)
    })

    // Sent from a frame drawn before another drag was stored: the slider it was dragged on has moved since.
    test('a drag of the media\'s slider over a level the volume no longer holds is rejected', () => {
      const moved = applyAll(update)([dragging(50, 80)], start).state
      expect(update(dragging(50, 30))(moved)).toBe(reject)
    })

    test('quiet hours bring a louder ringer down to their maximum, and full volume leaves it there', () => {
      const quiet = applyAll(update)([Own.QuietClicked()], start).state
      expect(quiet).toMatchObject({ ringer: 30, limit: Limit.Quiet() })
      expect(applyAll(update)([Own.FullClicked()], quiet).state.ringer).toBe(30)
    })

    // The moves are the program's own messages: each is put within the bounds the state holds when it arrives,
    // whatever they were when the drag began. No recipe is needed for bounds that narrow under a drag.
    test('a move of the ringer is put within the bounds of quiet hours that began during the drag', () => {
      const { state } = applyAll(update)(
        [Own.DragStarted(), Own.Moved({ at: 90 }), Own.QuietClicked(), Own.Moved({ at: 95 }), Own.Moved({ at: 10 })],
        start,
      )
      expect(state.ringer).toBe(10)
      const quietened = applyAll(update)([Own.DragStarted(), Own.QuietClicked(), Own.Moved({ at: 95 })], start)
      expect(quietened.state.ringer).toBe(30)
    })

    test('a second press while the ringer is dragged starts nothing', () => {
      const pressed = applyAll(update)([Own.DragStarted()], start).state
      expect(update(Own.DragStarted())(pressed)).toBe(reject)
    })

    // Only a drag's subscription sends moves, and it stops with the drag: a move anywhere else is a bug.
    test('dies on a move, or a release, with nothing dragged', () => {
      expect(() => update(Own.Moved({ at: 40 }))(start)).toThrow(InvariantDefect)
      expect(() => update(Own.DragEnded())(start)).toThrow(InvariantDefect)
    })
  })

  // The model, for any state: every message it holds is accepted, each acts once when sent twice, and nothing
  // `update` accepts is missing, but the moves, which no control sends.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    const violations = dispatchViolations(update)
    const candidates = [Own.MuteClicked(), Own.UnmuteClicked(), Own.QuietClicked(), Own.FullClicked(), Own.DragStarted()]
    fc.assert(fc.property(state, (before) => {
      expect(violations(before, messagesOf(volume.makeModel(before)), candidates)).toEqual([])
    }))
  })

  // The drag waits on the test: what each move does, and what quiet hours do to one in progress.
  test('a drag listens while the ringer is dragged, and its release ends it', async () => {
    const press = (model: Model) => model.press
    const heard = await Effect.runPromise(
      rehearse(
        volume,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(press)
          yield* rehearsal.hear('ringer', Own.Moved({ at: 90 }))
          const loud = (yield* rehearsal.model).ringer
          yield* rehearsal.send((model) => model.limit._tag === 'Full' ? Opt.some(model.limit.quiet) : Opt.none())
          yield* rehearsal.hear('ringer', Own.Moved({ at: 95 }))
          const quiet = (yield* rehearsal.model).ringer
          yield* rehearsal.hear('ringer', Own.DragEnded())
          return { loud, quiet, after: yield* rehearsal.model }
        }),
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.empty }))),
    )
    expect(heard.loud).toBe(90)
    expect(heard.quiet).toBe(30)
    expect(heard.after.press).toEqual(Opt.some(Own.DragStarted()))
  })

  // The program as it runs, driven like a user would, with a pointer that moves twice and is released.
  test('a user drags the ringer, and the slider ends where the pointer was released', async () => {
    const ringer = await Effect.runPromise(
      drive(
        volume,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => model.press)
          return yield* driver.waitFor((model) =>
            Opt.isSome(model.press) && model.ringer !== start.ringer ? Opt.some(model.ringer) : Opt.none()
          )
        }),
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(20, 64.4) }))),
    )
    expect(ringer).toBe(64)
  })
})
