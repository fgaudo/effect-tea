// The messages of the pages are built by the test: the parent's are `{ _tag: <page>, message }`.
import { forwardTo, InvariantDefect, reject, start } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, simulate, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import * as About from "./about.ts"
import { app, type Message, type Model, type State } from "./app.ts"
import type * as Clock from "./clock.ts"
import { view } from "./view.ts"

const aboutClicked: Message = { _tag: "Clock", message: { _tag: "AboutClicked" } }
const backClicked: Message = { _tag: "About", message: { _tag: "BackClicked" } }
const ticked = (millis: number): Message => ({
  _tag: "Clock",
  message: { _tag: "Ticked", now: DateTime.makeUnsafe(millis) }
})

const maybe = <A>(value: fc.Arbitrary<A>): fc.Arbitrary<Opt.Option<A>> =>
  fc.oneof(fc.constant(Opt.none()), value.map(Opt.some))

const time = fc.nat().map((millis) => DateTime.makeUnsafe(millis))

// Any valid state, made anew on each draw. A state of the app is made from the parent's own, which says whether About
// is there, and from the states its pages are in: `stateOf` starts each page the own state lists, and puts it in the
// state given. About opens at the time the Clock shows, and the Clock does not tick under it: both hold that time.
// About's saying, once picked, is one of its own.
const states = (): fc.Arbitrary<State> =>
  fc
    .record({
      maybeNow: maybe(time),
      format: fc.constantFrom<Clock.Format>("Iso", "Unix"),
      about: maybe(maybe(fc.constantFrom(...About.sayings)))
    })
    .map(({ about, format, maybeNow }) =>
      Opt.match(about, {
        onNone: () => stateOf(app, { about: Opt.none() }, { Clock: { maybeNow, format } }),
        onSome: (maybeSaying) =>
          stateOf(app, { about: Opt.some({ openedAt: maybeNow }) }, {
            Clock: { maybeNow, format },
            About: { openedAt: maybeNow, maybeSaying }
          })
      })
    )

const state = states()

// What the model holds: the message of the page on top, wrapped as the parent receives it, in the order the view
// draws them, for the test of the view below.
const messagesOf = ({ page }: Model): ReadonlyArray<Message> =>
  page._tag === "Clock"
    ? [
      { _tag: "Clock", message: page.model.format._tag === "Iso" ? page.model.format.toUnix : page.model.format.toIso },
      { _tag: "Clock", message: page.model.openAbout }
    ]
    : [{ _tag: "About", message: page.model.back }]

// What a user could ask of each page, a tag at a time: not the ticks, which only the clock sends, nor the saying,
// which only About's command answers with.
const clockClicks: ReadonlyArray<Clock.Message> = Object.values(
  {
    AboutClicked: [{ _tag: "AboutClicked" }],
    FormatPicked: [{ _tag: "FormatPicked", format: "Iso" }, { _tag: "FormatPicked", format: "Unix" }],
    Ticked: []
  } satisfies { [Tag in Clock.Message["_tag"]]: ReadonlyArray<Extract<Clock.Message, { _tag: Tag }>> }
).flat()

const aboutClicks: ReadonlyArray<About.Message> = Object.values(
  {
    BackClicked: [{ _tag: "BackClicked" }],
    SayingPicked: []
  } satisfies { [Tag in About.Message["_tag"]]: ReadonlyArray<Extract<About.Message, { _tag: Tag }>> }
).flat()

// What a user could ask of the app: a new page, or a new message of one, does not compile here until the test
// says what a user could ask with it.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
    Clock: clockClicks.map((message) => ({ _tag: "Clock", message })),
    About: aboutClicks.map((message) => ({ _tag: "About", message }))
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()

/** The pages whose subscriptions run, from the keys the library puts under each page's name. */
const listening = (state: State) => app.subscriptions(state).map((key) => key._tag)

describe("pages", () => {
  describe("navigation", () => {
    test("the Clock asks for About, which opens over it and loads its saying", () => {
      const { state, commands } = applyAll(app.update, [aboutClicked], app.init.state)
      expect(Opt.map(state.children.About, (about) => about.state)).toEqual(
        Opt.some(About.about.init({ openedAt: Opt.none() }).state)
      )
      // The Clock was the first child started, and About is the second: its command says so, and so will its answer.
      expect(commands).toEqual([{ _tag: "About", instance: 2, command: About.Command.PickSaying() }])
    })

    test("About starts from the time the Clock showed when it was asked for", () => {
      const { state } = applyAll(app.update, [ticked(0), aboutClicked], app.init.state)
      expect(Opt.map(state.children.About, (about) => about.state.openedAt)).toEqual(
        Opt.some(Opt.some(DateTime.makeUnsafe(0)))
      )
    })

    test("About asks to be left, and the Clock is back as it was", () => {
      const { state } = applyAll(app.update, [ticked(0), aboutClicked, backClicked], app.init.state)
      expect(state.own).toEqual({ about: Opt.none() })
      expect(state.children.About).toEqual(Opt.none())
      expect(Opt.map(state.children.Clock, (clock) => clock.state)).toEqual(
        Opt.some({ maybeNow: Opt.some(DateTime.makeUnsafe(0)), format: "Iso" })
      )
    })

    test("the Clock stops ticking while About is over it", () => {
      expect(listening(app.init.state)).toEqual(["Clock"])
      expect(listening(applyAll(app.update, [aboutClicked], app.init.state).state)).toEqual([])
    })

    test("the Clock shows the format picked, and rejects the format it shows", () => {
      const toUnix: Message = { _tag: "Clock", message: { _tag: "FormatPicked", format: "Unix" } }
      const { state } = applyAll(app.update, [ticked(0), toUnix], app.init.state)
      expect(Opt.map(state.children.Clock, (clock) => clock.state)).toEqual(
        Opt.some({ maybeNow: Opt.some(DateTime.makeUnsafe(0)), format: "Unix" })
      )
      expect(app.update(toUnix)(state)).toBe(reject)
    })

    test("About takes the saying it picked", () => {
      const opened = applyAll(app.update, [aboutClicked], app.init.state).state
      const picked: Message = { _tag: "About", message: { _tag: "SayingPicked", saying: About.sayings[0] } }
      const { state } = applyAll(app.update, [picked], opened)
      expect(Opt.map(state.children.About, (about) => about.state.maybeSaying)).toEqual(
        Opt.some(Opt.some(About.sayings[0]))
      )
    })

    // About picks its saying once: a second answer cannot arrive.
    test("dies on a saying picked once About has one", () => {
      const shown = { openedAt: Opt.none(), maybeSaying: Opt.some(About.sayings[0]) }
      expect(() => About.update({ _tag: "SayingPicked", saying: About.sayings[1] })(shown)).toThrow(InvariantDefect)
    })
  })

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    // Under About, the Clock's format would change on the page hidden below it: held back on purpose. Its About
    // would do nothing there, so it is no control missing.
    fc.assert(fc.property(state, (before) => {
      expect(dispatchViolations(app.update, {
        state: before,
        held: messagesOf(app.makeModel(before)),
        candidates: userMessages,
        withheld: (message, state) =>
          message._tag === "Clock" && message.message._tag === "FormatPicked" && Opt.isSome(state.own.about)
      })).toEqual([])
    }))
  })

  // The view draws what its model holds, each control once and each page through its own dispatch:
  // `messagesSentBy` finds what it sends without a DOM, and the test compares it with the reader.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = app.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(states(), { seed, numRuns: 1 })
      const [other] = fc.sample(states(), { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(app.makeModel(one), app.makeModel(other))).toBe(true)
    }))
  })

  test("the app listens to the Clock exactly where the model shows the Clock", () => {
    fc.assert(fc.property(state, (before) => {
      expect(listening(before)).toEqual(app.makeModel(before).page._tag === "Clock" ? ["Clock"] : [])
    }))
  })

  test("About receives its saying through the parent", async () => {
    const { state, applied } = await Effect.runPromise(simulate(app, [aboutClicked], app.init))
    expect(applied.map((message) => message._tag)).toEqual(["Clock", "About"])
    expect(Opt.isSome(Opt.flatMap(state.children.About, (about) => about.state.maybeSaying))).toBe(true)
  })

  // As it runs: a user opens About with the Clock's own message, through the Clock's dispatch, asked for at each new
  // state, as a view asks for it each time it is drawn.
  test("a user opens About, and the Clock's dispatch is the same function every time it is asked for", async () => {
    const clockDispatches = new Set<unknown>()
    const { app: handle, run } = start(app)
    const opened = Deferred.makeUnsafe<void>()
    handle.subscribe(() => {
      const { page } = handle.model()
      const clock = forwardTo(handle.dispatch, "Clock")
      clockDispatches.add(clock)
      if (page._tag === "Clock" && page.model.time !== "") clock(page.model.openAbout)
      if (page._tag === "About" && Opt.isSome(page.model.saying)) Deferred.doneUnsafe(opened, Exit.void)
    })
    // The run is interrupted once About shows its saying.
    await Effect.runPromise(Effect.raceFirst(run, Deferred.await(opened)).pipe(Effect.timeout("3 seconds")))
    expect(clockDispatches.size).toBe(1)
  })
})
