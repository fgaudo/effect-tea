import { describe, expect, test } from 'bun:test'
import { InvariantDefect, reject } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, rehearse } from '@fgaudo/effect-tea/testing'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as fc from 'fast-check'
import { messagesSentBy } from '../bridges/snabbdom-testing.ts'
import { view } from './view.ts'
import {
  Drag,
  Limit,
  type Message,
  type Model,
  Pointer,
  type Slider,
  Sound,
  type State,
  update,
  volume,
} from './volume.ts'

const start = volume.init.state

const state: fc.Arbitrary<State> = fc.record({
  media: fc.integer({ min: 0, max: 100 }),
  sound: fc.constantFrom(Sound.Audible(), Sound.Muted()),
  ringer: fc.integer({ min: 0, max: 100 }),
  limit: fc.constantFrom(Limit.Full(), Limit.Quiet()),
  drag: fc.constantFrom(Drag.Idle(), Drag.Dragging({ slider: 'Media' }), Drag.Dragging({ slider: 'Ringer' })),
})

const press = (slider: Slider): Message => ({ _tag: 'DragStarted', slider })

// What the model holds: the messages of its buttons and of its tracks, in the order the view draws them, for the
// test of the view below. The moves of a drag are a subscription's.
const messagesOf = ({ sound, limit, media, ringer }: Model): ReadonlyArray<Message> => [
  ...Opt.toArray(media.press),
  sound._tag === 'Muted' ? sound.unmute : sound.mute,
  ...Opt.toArray(ringer.press),
  limit._tag === 'Quiet' ? limit.full : limit.quiet,
]

// What a key sends, as `messagesOf` says what the model holds: a drag sends a move to wherever the pointer is, and
// its release.
const heardFrom = (key: unknown, at: number): ReadonlyArray<Message> =>
  key === 'Media' || key === 'Ringer' ? [{ _tag: 'Moved', at }, { _tag: 'DragEnded' }] : []

describe('volume', () => {
  // `update` alone: the rules, without running anything.
  describe('update', () => {
    test('a drag of the media sets its level where the pointer is, within its bounds', () => {
      const { state } = applyAll(update)([press('Media'), { _tag: 'Moved', at: 80.4 }, { _tag: 'DragEnded' }], start)
      expect(state).toMatchObject({ media: 80, drag: Drag.Idle() })
      expect(applyAll(update)([press('Media'), { _tag: 'Moved', at: 140 }], start).state.media).toBe(100)
    })

    test('muting leaves the media\'s level as it is, and unmuting gives it back', () => {
      const muted = applyAll(update)(
        [press('Media'), { _tag: 'Moved', at: 80 }, { _tag: 'DragEnded' }, { _tag: 'MuteClicked' }],
        start,
      ).state
      expect(muted).toMatchObject({ media: 80, sound: Sound.Muted() })
      expect(volume.makeModel(muted).media).toEqual({ level: 0, max: 100, press: Opt.none() })
      expect(volume.makeModel(applyAll(update)([{ _tag: 'UnmuteClicked' }], muted).state).media.level).toBe(80)
    })

    // The track is drawn at 0 with no press: a drag of it would move a level nobody sees.
    test('a mute ends a drag of the media, and a press drawn before it starts none', () => {
      const pressed = applyAll(update)([press('Media'), { _tag: 'MuteClicked' }], start).state
      expect(pressed.drag).toEqual(Drag.Idle())
      expect(update(press('Media'))(pressed)).toBe(reject)
    })

    test('quiet hours bring a louder ringer down to their maximum, and full volume leaves it there', () => {
      const quiet = applyAll(update)([{ _tag: 'QuietClicked' }], start).state
      expect(quiet).toMatchObject({ ringer: 30, limit: Limit.Quiet() })
      expect(applyAll(update)([{ _tag: 'FullClicked' }], quiet).state.ringer).toBe(30)
    })

    // The moves are the program's own messages: each is put within the bounds the state holds when it arrives,
    // whatever they were when the drag began. No recipe is needed for bounds that narrow under a drag.
    test('a move of the ringer is put within the bounds of quiet hours that began during the drag', () => {
      const { state } = applyAll(update)(
        [
          press('Ringer'),
          { _tag: 'Moved', at: 90 },
          { _tag: 'QuietClicked' },
          { _tag: 'Moved', at: 95 },
          { _tag: 'Moved', at: 10 },
        ],
        start,
      )
      expect(state.ringer).toBe(10)
      const quietened = applyAll(update)(
        [press('Ringer'), { _tag: 'QuietClicked' }, { _tag: 'Moved', at: 95 }],
        start,
      )
      expect(quietened.state.ringer).toBe(30)
    })

    test('a second press while a slider is dragged starts nothing', () => {
      const pressed = applyAll(update)([press('Ringer')], start).state
      expect(update(press('Ringer'))(pressed)).toBe(reject)
      expect(update(press('Media'))(pressed)).toBe(reject)
    })

    // Only a drag's subscription sends moves, and it stops with the drag: a move anywhere else is a bug.
    test('dies on a move, or a release, with nothing dragged', () => {
      expect(() => update({ _tag: 'Moved', at: 40 })(start)).toThrow(InvariantDefect)
      expect(() => update({ _tag: 'DragEnded' })(start)).toThrow(InvariantDefect)
    })
  })

  // The model, for any state: every message it holds is accepted, each acts once when sent twice, and nothing
  // `update` accepts is missing, but the moves, which no control sends.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    // A tag at a time, so that a new message does not compile here until the test says what a user could ask with
    // it: the moves and the release are a drag's subscription's.
    const candidates: ReadonlyArray<Message> = Object.values(
      {
        MuteClicked: [{ _tag: 'MuteClicked' }],
        UnmuteClicked: [{ _tag: 'UnmuteClicked' }],
        QuietClicked: [{ _tag: 'QuietClicked' }],
        FullClicked: [{ _tag: 'FullClicked' }],
        DragStarted: [{ _tag: 'DragStarted', slider: 'Media' }, { _tag: 'DragStarted', slider: 'Ringer' }],
        Moved: [],
        DragEnded: [],
      } satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> },
    ).flat()
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(update, { state: before, held: messagesOf(volume.makeModel(before)), candidates }))
        .toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once. `messagesSentBy`,
  // beside the snabbdom bridge, is its way to see it without a DOM.
  test('the view sends what its model holds', () => {
    fc.assert(fc.property(state, (before) => {
      const model = volume.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  test('listens to a drag exactly while a slider is dragged, by the slider', () => {
    fc.assert(fc.property(state, (before) => {
      expect(Arr.fromIterable(HashMap.keys(volume.subscriptions(before))))
        .toEqual(before.drag._tag === 'Dragging' ? [before.drag.slider] : [])
    }))
  })

  // The keys, for any state: `update` accepts what each key the state lists may send, wherever the pointer is. A
  // key's messages are meant to repeat, and no control sends them, so only a rejection is asked of them.
  test('update accepts what each key it listens to sends', () => {
    fc.assert(fc.property(state, fc.double({ min: -50, max: 150, noNaN: true }), (before, at) => {
      const heard = Arr.flatMap(
        Arr.fromIterable(HashMap.keys(volume.subscriptions(before))),
        (key) => heardFrom(key, at),
      )
      expect(dispatchViolations(update, { state: before, held: heard, repeatable: () => true })).toEqual([])
    }))
  })

  // The drag waits on the test: what each move does, and what quiet hours do to one in progress.
  test('a drag listens while the ringer is dragged, and its release ends it', async () => {
    const ringer = (model: Model) => model.ringer.press
    const heard = await Effect.runPromise(
      rehearse(
        volume,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(ringer)
          yield* rehearsal.hear('Ringer', { _tag: 'Moved', at: 90 })
          const loud = (yield* rehearsal.model).ringer.level
          yield* rehearsal.send((model) => model.limit._tag === 'Full' ? Opt.some(model.limit.quiet) : Opt.none())
          yield* rehearsal.hear('Ringer', { _tag: 'Moved', at: 95 })
          const quiet = (yield* rehearsal.model).ringer.level
          yield* rehearsal.hear('Ringer', { _tag: 'DragEnded' })
          return { loud, quiet, after: yield* rehearsal.model }
        }),
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.empty }))),
    )
    expect(heard.loud).toBe(90)
    expect(heard.quiet).toBe(30)
    expect(heard.after.ringer.press).toEqual(Opt.some(press('Ringer')))
  })

  // The program as it runs, driven like a user would, with a pointer that moves twice and is released.
  test('a user drags the ringer, and the slider ends where the pointer was released', async () => {
    const ringer = await Effect.runPromise(
      drive(
        volume,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => model.ringer.press)
          return yield* driver.waitFor((model) =>
            Opt.isSome(model.ringer.press) && model.ringer.level !== start.ringer
              ? Opt.some(model.ringer.level)
              : Opt.none()
          )
        }),
      ).pipe(Effect.provideService(Pointer, Pointer.of({ moves: Stream.make(20, 64.4) }))),
    )
    expect(ringer).toBe(64)
  })
})
