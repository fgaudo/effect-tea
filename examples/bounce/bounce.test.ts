import { describe, expect, test } from 'bun:test'
import { InvariantDefect, ProgramDefect } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive } from '@fgaudo/effect-tea/testing'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as fc from 'fast-check'
import { messagesSentBy } from '../bridges/snabbdom-testing.ts'
import {
  accumulate,
  alphaOf,
  Ball,
  bounce,
  flying,
  type Lead,
  type Loop,
  type Message,
  type Model,
  Screen,
  started,
  type State,
  update,
} from './bounce.ts'
import { view } from './view.ts'

const dt = 1000 / 60

const start = bounce.init({ dt }).state

const stepped: Message = { _tag: 'Stepped' }
const thrown: Message = { _tag: 'ThrowClicked' }

const state: fc.Arbitrary<State> = fc.oneof(
  fc.record({
    dt: fc.constantFrom(1000 / 30, 1000 / 60),
    height: fc.constant(0),
    ball: fc.constant(Ball.Resting()),
  }),
  fc.record({
    dt: fc.constantFrom(1000 / 30, 1000 / 60),
    height: fc.double({ min: 0, max: 100, noNaN: true }),
    ball: fc.record({
      velocity: fc.double({ min: -500, max: 500, noNaN: true }),
      step: fc.nat(1000),
      previous: fc.double({ min: 0, max: 100, noNaN: true }),
    }).map(Ball.Flying),
  }),
)

// Every state of a flight, one step at a time, until the ball rests: what the steps of the screen give the program.
const flight = (from: State): ReadonlyArray<State> => {
  const states = [from]
  let current = from
  while (flying(current) && states.length < 10_000) {
    current = applyAll(update)([stepped], current).state
    states.push(current)
  }
  return states
}

// What the model holds: the throw, the one control the view draws. The steps are a subscription's.
const messagesOf = (model: Model): ReadonlyArray<Message> => [model.throw]

// What a key sends, as `messagesOf` says what the model holds.
const heardFrom = (key: unknown): ReadonlyArray<Message> => key === 'steps' ? [stepped] : []

describe('bounce', () => {
  // `update` alone: the rules, without running anything. The steps carry no time, so a flight is a list of them.
  describe('update', () => {
    test('a dropped ball bounces lower each time, and comes to rest on the floor', () => {
      const states = flight(start)
      const last = states[states.length - 1]
      expect(last).toEqual({ dt, height: 0, ball: Ball.Resting() })
      // The highest point between two bounces, each lower than the one before.
      const peaks = states.filter((now, i) => {
        const before = states[i - 1]
        const after = states[i + 1]
        return before !== undefined && after !== undefined && now.height > before.height && now.height >= after.height
      }).map(({ height }) => height)
      expect(peaks.length).toBeGreaterThan(1)
      expect(peaks).toEqual([...peaks].sort((a, b) => b - a))
    })

    test('a throw sends a resting ball up to the top, and a new flight starts from its first step', () => {
      const thrownUp = applyAll(update)([thrown], { dt, height: 0, ball: Ball.Resting() }).state
      expect(thrownUp.ball).toMatchObject({ _tag: 'Flying', step: 0, previous: 0 })
      // A step moves by the velocity it ends with, so the ball turns a little below the top.
      const highest = Math.max(...flight(thrownUp).map(({ height }) => height))
      expect(highest).toBeGreaterThan(95)
      expect(highest).toBeLessThanOrEqual(100)
    })

    test('a throw in flight keeps the steps of the flight', () => {
      const { state } = applyAll(update)([stepped, stepped, thrown, stepped], start)
      expect(state.ball).toMatchObject({ _tag: 'Flying', step: 3 })
    })

    // Only the subscription of a flight sends steps, and it stops when the ball rests: a step at rest is a bug.
    test('dies on a step at rest', () => {
      expect(() => update(stepped)({ dt, height: 0, ball: Ball.Resting() })).toThrow(InvariantDefect)
    })
  })

  // The loop of steps, as pure functions: what the subscription sends for the screen's frames, and how far the
  // renderer draws between two steps.
  describe('the loop', () => {
    const steps = (instants: ReadonlyArray<number>, length: number) =>
      Arr.reduce(instants, { loop: started, sent: [] as ReadonlyArray<number> }, ({ loop, sent }, now) => {
        const next = accumulate(loop, now, length)
        return { loop: next.loop, sent: [...sent, next.steps] }
      })

    test('sends a step for each whole dt of time the frames go through, and keeps the rest', () => {
      const { loop, sent } = steps([0, 16, 33, 50, 105], 20)
      expect(sent).toEqual([0, 0, 1, 1, 3])
      expect(loop).toEqual<Loop>({ last: Opt.some(105), accumulator: 5, step: 5 })
    })

    test('a frame adds at most 250 ms, and time going back adds none', () => {
      expect(steps([0, 1000], 20)).toMatchObject({ sent: [0, 12], loop: { accumulator: 10 } })
      expect(steps([100, 50], 20)).toMatchObject({ sent: [0, 0], loop: { accumulator: 0 } })
    })

    test('the renderer draws by the rest of the loop, and never back when the state is behind it', () => {
      const lead: Lead = { step: 7, alpha: 0.25 }
      expect(alphaOf(7, lead)).toBe(0.25)
      expect(alphaOf(6, lead)).toBe(1)
      expect(alphaOf(8, lead)).toBe(0)
    })
  })

  // The model, for any state: the throw is accepted, it acts once when sent twice, and nothing `update` accepts is
  // missing, but the steps, which no control sends.
  test('the model holds what update accepts, all of it, and each acts once when sent twice', () => {
    // A tag at a time, so that a new message does not compile here until the test says what a user could ask with
    // it: the steps are the subscription's.
    const candidates: ReadonlyArray<Message> = Object.values(
      {
        ThrowClicked: [thrown],
        Stepped: [],
      } satisfies { [Tag in Message['_tag']]: ReadonlyArray<Extract<Message, { _tag: Tag }>> },
    ).flat()
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(update, { state: before, held: messagesOf(bounce.makeModel(before)), candidates }))
        .toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, at any point between two steps.
  test('the view sends what its model holds', () => {
    fc.assert(fc.property(state, fc.double({ min: 0, max: 1, noNaN: true }), (before, alpha) => {
      const model = bounce.makeModel(before)
      expect(messagesSentBy<Model, Message>(view(alpha), model)).toEqual(messagesOf(model))
    }))
  })

  test('listens to the screen exactly while the ball flies', () => {
    fc.assert(fc.property(state, (before) => {
      expect(Arr.fromIterable(HashMap.keys(bounce.subscriptions(before)))).toEqual(flying(before) ? ['steps'] : [])
    }))
  })

  // The keys, for any state: `update` accepts what each key the state lists sends. A step is meant to repeat, and no
  // control sends it, so only a rejection is asked of it.
  test('update accepts what each key it listens to sends', () => {
    fc.assert(fc.property(state, (before) => {
      const heard = Arr.flatMap(Arr.fromIterable(HashMap.keys(bounce.subscriptions(before))), heardFrom)
      expect(dispatchViolations(update, { state: before, held: heard, repeatable: () => true })).toEqual([])
    }))
  })

  // The subscription itself, from the state, with frames half a step apart: it sends a step for every second frame,
  // none for a frame that adds less than `dt`, and tells the renderer how far into the next step it is after each.
  test('the subscription sends a step for each whole dt of the screen\'s frames, and none for less', async () => {
    const steps = Opt.getOrThrow(HashMap.get(bounce.subscriptions(bounce.init({ dt: 20 }).state), 'steps'))
    const sent: Array<Message> = []
    const leads: Array<Lead> = []
    const screen = Screen.of({
      frames: Stream.make(0, 10, 20, 30, 40, 50, 60),
      reached: (lead) => Effect.sync(() => leads.push(lead)),
    })
    // The frames end after the last one, so the subscription dies there: the messages are what it sent before.
    await Effect.runPromiseExit(
      steps.pipe(
        Channel.runForEach((message) => Effect.sync(() => sent.push(message))),
        Effect.provideService(Screen, screen),
      ),
    )
    expect(sent).toEqual([stepped, stepped, stepped])
    expect(leads).toEqual([
      { step: 0, alpha: 0 },
      { step: 0, alpha: 0.5 },
      { step: 1, alpha: 0 },
      { step: 1, alpha: 0.5 },
      { step: 2, alpha: 0 },
      { step: 2, alpha: 0.5 },
      { step: 3, alpha: 0 },
    ])
  })

  // The program as it runs, with a screen whose frames come at the instants the test gives, and then never end, as a
  // screen's: the ball comes to rest, and by then the loop has told the renderer of at least the steps of the flight of
  // `update` alone. The loop may run ahead of the run, and the run drops what it sent once the ball rests: how many
  // steps a frame sends is the test above.
  test('the screen\'s frames step the ball until it rests', async () => {
    const steps = flight(start).length - 1
    const leads: Array<Lead> = []
    const screen = Screen.of({
      frames: Stream.concat(Stream.fromIterable(Arr.makeBy(2 * steps, (i) => i * dt)), Stream.never),
      reached: (lead) => Effect.sync(() => leads.push(lead)),
    })
    const resting = await Effect.runPromise(
      drive(
        bounce,
        (driver) => driver.waitFor((model) => model.ball._tag === 'Resting' ? Opt.some(model.ball) : Opt.none()),
        { flags: { dt } },
      ).pipe(Effect.provideService(Screen, screen)),
    )
    expect(resting).toEqual({ _tag: 'Resting', height: 0 })
    expect(leads.at(-1)?.step).toBeGreaterThanOrEqual(steps)
  })

  // A screen's frames never end: frames that end while the ball flies are a broken `Screen`, and the run dies, with the
  // subscription's key.
  test('dies when the frames of the screen end', async () => {
    const screen = Screen.of({ frames: Stream.make(0, dt, 2 * dt), reached: () => Effect.void })
    const exit = await Effect.runPromiseExit(
      drive(
        bounce,
        (driver) => driver.waitFor((model) => model.ball._tag === 'Resting' ? Opt.some(model.ball) : Opt.none()),
        { flags: { dt } },
      ).pipe(Effect.provideService(Screen, screen)),
    )
    const died = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(died).toMatchObject({ where: 'subscription', key: 'steps' })
    expect(died instanceof ProgramDefect ? died.cause : undefined).toEqual(new Error('The frames of the screen ended'))
  })
})
