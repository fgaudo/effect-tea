import { type Applied, InvariantDefect, ProgramDefect } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import * as fc from "fast-check"
import {
  accumulate,
  Ball,
  bounce,
  flying,
  Key,
  type Loop,
  type Message,
  type Model,
  Screen,
  started,
  type State,
  update
} from "./bounce.ts"
import { view } from "./view.ts"

const dt = 1000 / 60

const start = bounce.init({ dt }).state

const stepped: Message = { _tag: "Stepped" }
const thrown: Message = { _tag: "ThrowClicked" }
const advanced = (alpha: number): Message => ({ _tag: "Advanced", alpha })

const alpha = fc.double({ min: 0, max: 1, noNaN: true })

// Any valid state: the ball at rest, or what the drop reaches through the steps of the screen, their parts and the
// throws, applied by `update` as the run applies them. In flight, the height and the height at the step before are
// tied by the steps, so a state is reached rather than drawn. A step or a part at rest cannot arrive, and is skipped.
const state: fc.Arbitrary<State> = fc.record({
  dt: fc.constantFrom(1000 / 30, 1000 / 60),
  messages: fc.array(
    fc.oneof(
      { arbitrary: fc.constant(stepped), weight: 8 },
      { arbitrary: alpha.map(advanced), weight: 2 },
      { arbitrary: fc.constant(thrown), weight: 1 }
    ),
    { maxLength: 400 }
  ),
  resting: fc.boolean()
}).map(({ dt, messages, resting }) =>
  resting ? { dt, height: 0, ball: Ball.Resting() } : messages.reduce(
    (now, message) => message._tag === "ThrowClicked" || flying(now) ? applyAll(update, [message], now).state : now,
    bounce.init({ dt }).state
  )
)

const inFlight = state.filter(flying)

// The velocity that takes a ball from `height` up to the top, under the gravity of the program, 400 heights a second
// squared.
const toTheTop = (height: number) => Math.sqrt(2 * 400 * Math.max(100 - height, 0))

// The same state, with the ball drawn at another part of the next step.
const at = (state: State, alpha: number): State =>
  state.ball._tag === "Flying" ? { ...state, ball: Ball.Flying({ ...state.ball, alpha }) } : state

// Every state of a flight, one step at a time, until the ball rests: what the steps of the screen give the program.
const flight = (from: State): ReadonlyArray<State> => {
  const states = [from]
  let current = from
  while (flying(current) && states.length < 10_000) {
    current = applyAll(update, [stepped], current).state
    states.push(current)
  }
  return states
}

// What the model holds: the throw, the one control the view draws. The steps and their parts are a subscription's.
const messagesOf = (model: Model): ReadonlyArray<Message> => [model.throw]

// What a key sends, as `messagesOf` says what the model holds.
// A key at a time: a new key does not compile here until the test says what it sends.
const heardFrom = (key: Key): ReadonlyArray<Message> => {
  switch (key._tag) {
    case "Steps":
      return [stepped, advanced(0.5)]
  }
}

describe("bounce", () => {
  // `update` alone: the rules, without running anything. The steps carry no time, so a flight is a list of them.
  describe("update", () => {
    test("a dropped ball bounces lower each time, and comes to rest on the floor", () => {
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

    test("a throw sends a resting ball up to the top, from the start of its first step", () => {
      const thrownUp = applyAll(update, [thrown], { dt, height: 0, ball: Ball.Resting() }).state
      expect(thrownUp).toEqual({ dt, height: 0, ball: Ball.Flying({ velocity: toTheTop(0), previous: 0, alpha: 0 }) })
      // A step moves by the velocity it ends with, so the ball turns a little below the top.
      const highest = Math.max(...flight(thrownUp).map(({ height }) => height))
      expect(highest).toBeGreaterThan(95)
      expect(highest).toBeLessThanOrEqual(100)
    })

    test("a throw in flight changes the velocity alone", () => {
      const before = applyAll(update, [stepped, stepped, advanced(0.5)], start).state
      const { state } = applyAll(update, [thrown], before)
      expect(state).toEqual({
        ...before,
        ball: Ball.Flying({ velocity: toTheTop(before.height), previous: flight(start)[1]?.height ?? 0, alpha: 0.5 })
      })
    })

    // The part of the next step says where the ball is drawn, and nothing else: a step is the same at any part.
    test("a step does not depend on the part of the next step, and starts the next one at 0", () => {
      fc.assert(fc.property(inFlight, alpha, (before, other) => {
        const after = applyAll(update, [stepped], before).state
        expect(applyAll(update, [stepped], at(before, other)).state).toEqual(after)
        if (after.ball._tag === "Flying") expect(after.ball.alpha).toBe(0)
      }))
    })

    test("the part of the next step changes nothing but itself", () => {
      fc.assert(fc.property(inFlight, alpha, (before, part) => {
        expect(applyAll(update, [advanced(part)], before).state).toEqual(at(before, part))
      }))
    })

    // Only the subscription of a flight sends steps and their parts, and it stops when the ball rests: one at rest is a
    // bug.
    test("dies on a step, or a part of one, at rest", () => {
      const resting: State = { dt, height: 0, ball: Ball.Resting() }
      expect(() => update(stepped)(resting)).toThrow(InvariantDefect)
      expect(() => update(advanced(0.5))(resting)).toThrow(InvariantDefect)
    })
  })

  // The loop of steps, as a pure function: how many steps the subscription sends for the screen's frames, and the rest
  // it keeps.
  describe("the loop", () => {
    const steps = (instants: ReadonlyArray<number>, length: number) =>
      Arr.reduce(instants, { loop: started, sent: [] as ReadonlyArray<number> }, ({ loop, sent }, now) => {
        const next = accumulate(loop, now, length)
        return { loop: next.loop, sent: [...sent, next.steps] }
      })

    test("sends a step for each whole dt of time the frames go through, and keeps the rest", () => {
      const { loop, sent } = steps([0, 16, 33, 50, 105], 20)
      expect(sent).toEqual([0, 0, 1, 1, 3])
      expect(loop).toEqual<Loop>({ last: Opt.some(105), accumulator: 5 })
    })

    test("a frame adds at most 250 ms, and time going back adds none", () => {
      expect(steps([0, 1000], 20)).toMatchObject({ sent: [0, 12], loop: { accumulator: 10 } })
      expect(steps([100, 50], 20)).toMatchObject({ sent: [0, 0], loop: { accumulator: 0 } })
    })
  })

  // The model, for any state: the throw is accepted, it acts once when sent twice, and nothing `update` accepts is
  // missing, but the steps and their parts, which no control sends. A throw does nothing where the ball goes up to the
  // top already, as it starts and until the step after a throw: the button stays, rather than flicker for a frame.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    // A tag at a time, so that a new message does not compile here until the test says what a user could ask with
    // it: the steps and their parts are the subscription's.
    const candidates: ReadonlyArray<Message> = Object.values(
      {
        ThrowClicked: [thrown],
        Stepped: [],
        Advanced: []
      } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
    ).flat()
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(update, {
        state: before,
        held: messagesOf(bounce.makeModel(before)),
        candidates,
        inert: (message, at) =>
          message._tag === "ThrowClicked" && at.ball._tag === "Flying" && at.ball.velocity === toTheTop(at.height)
      })).toEqual([])
    }))
  })

  test("the model draws a flying ball by the part of the next step, and a resting one where it is", () => {
    const flyingAt = { dt, height: 50, ball: Ball.Flying({ velocity: 0, previous: 40, alpha: 0.25 }) }
    expect(bounce.makeModel(flyingAt).height).toBe(42.5)
    expect(bounce.makeModel(at(flyingAt, 0)).height).toBe(40)
    expect(bounce.makeModel(at(flyingAt, 1)).height).toBe(50)
    expect(bounce.makeModel({ dt, height: 0, ball: Ball.Resting() }).height).toBe(0)
  })

  // The view, checked with the tools of its renderer: `messagesSentBy`, of the snabbdom bridge, finds what the view
  // sends without a DOM, which the test compares with what the reader returns.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = bounce.makeModel(before)
      expect(messagesSentBy(view, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state, { seed, numRuns: 1 })
      const [other] = fc.sample(state, { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(bounce.makeModel(one), bounce.makeModel(other))).toBe(true)
    }))
  })

  test("listens to the screen exactly while the ball flies", () => {
    fc.assert(fc.property(state, (before) => {
      expect(bounce.subscriptions(before)).toEqual(flying(before) ? [Key.Steps({ dt: before.dt })] : [])
    }))
  })

  // The keys, for any state: `update` accepts what each key the state lists sends. No control sends a step or its
  // part, so only a rejection is asked of them: they are meant to repeat, and none is a control that does nothing.
  test("update accepts what each key it listens to sends", () => {
    fc.assert(fc.property(state, (before) => {
      const heard = Arr.flatMap(bounce.subscriptions(before), heardFrom)
      expect(dispatchViolations(update, { state: before, held: heard, repeatable: () => true, inert: () => true }))
        .toEqual([])
    }))
  })

  // The subscription itself, from its key, with frames half a step apart: for each frame, it sends a step for each
  // whole `dt`, none for a frame that adds less, and then the part of the next step.
  test("the subscription sends, for each frame of the screen, its steps, then the part of the next step", async () => {
    const steps = bounce.listen(Key.Steps({ dt: 20 }))
    const sent: Array<Message> = []
    // The frames end after the last one, so the subscription dies there: the messages are what it sent before.
    await Effect.runPromiseExit(
      steps.pipe(
        Channel.runForEach((message) => Effect.sync(() => sent.push(message))),
        Effect.provideService(Screen, Screen.of({ frames: Stream.make(0, 10, 20, 30, 40, 50, 60) }))
      )
    )
    expect(sent).toEqual([
      advanced(0),
      advanced(0.5),
      stepped,
      advanced(0),
      advanced(0.5),
      stepped,
      advanced(0),
      advanced(0.5),
      stepped,
      advanced(0)
    ])
  })

  // The program as it runs, with a screen whose frames come at the instants the test gives, and then never end, as a
  // screen's: the ball comes to rest as `update` alone brings it there. The loop runs ahead of the run, and sends the
  // part of a step after the last step of the flight: the run drops what it sent once the ball rests, so the next
  // message `update` gets is the throw the test sends then.
  test("the screen's frames step the ball until it rests, and nothing the loop sent after reaches update", async () => {
    const applied: Array<Applied<State, Message>> = []
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        const rested = yield* Deferred.make<void>()
        const threw = yield* Deferred.make<void>()
        const onApplied = (heard: Applied<State, Message>): undefined => {
          applied.push(heard)
          if (heard.message._tag === "ThrowClicked") Deferred.doneUnsafe(threw, Exit.void)
          else if (!flying(heard.after)) Deferred.doneUnsafe(rested, Exit.void)
        }
        const instants = Arr.makeBy(2 * flight(start).length, (i) => i * dt)
        const frames = Stream.concat(Stream.fromIterable(instants), Stream.never)
        // Bounded only for a run that never gets there, which fails the test.
        const awaited = (deferred: Deferred.Deferred<void>) =>
          Deferred.await(deferred).pipe(Effect.timeout("2 seconds"))
        return yield* drive(
          bounce,
          Effect.fnUntraced(function*(driver) {
            yield* awaited(rested)
            yield* driver.send((model) => Opt.some(model.throw))
            yield* awaited(threw)
          }),
          { flags: { dt }, onApplied }
        ).pipe(Effect.provideService(Screen, Screen.of({ frames })))
      })
    )
    expect(result).toBeUndefined()
    const rest = applied.findIndex(({ after }) => !flying(after))
    expect(applied[rest]?.after).toEqual({ dt, height: 0, ball: Ball.Resting() })
    expect(applied[rest + 1]?.message._tag).toBe("ThrowClicked")
    // The flight is the one of `update` alone: the steps of the run, and the parts between them, give the same states.
    expect(applied.slice(0, rest + 1).filter(({ message }) => message._tag === "Stepped").map(({ after }) => after))
      .toEqual(flight(start).slice(1))
  })

  // A screen's frames never end: frames that end while the ball flies are a broken `Screen`, and the run dies, with the
  // subscription's key.
  test("dies when the frames of the screen end", async () => {
    const exit = await Effect.runPromiseExit(
      drive(bounce, () => Effect.never, { flags: { dt } }).pipe(
        Effect.provideService(Screen, Screen.of({ frames: Stream.make(0, dt, 2 * dt) }))
      )
    )
    const died = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(died).toMatchObject({ where: "subscription", key: Key.Steps({ dt }) })
    expect(died instanceof ProgramDefect ? died.cause : undefined).toEqual(new Error("The frames of the screen ended"))
  })
})
