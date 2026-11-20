// The messages of the pages are built by the test: the parent's are `{ _tag: <page>, message }`.
import { forwardTo, run } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, simulate } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HashMap from "effect/HashMap"
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

const state: fc.Arbitrary<State> = fc.record({
  clock: fc.record({ maybeNow: maybe(time), format: fc.constantFrom<Clock.Format>("Iso", "Unix") }),
  maybeAbout: maybe(fc.record({ openedAt: maybe(time), maybeSaying: maybe(fc.string()) }))
})

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

/** The pages whose subscriptions run, from the keys the library namespaces (`['Clock', 'ticks']`). */
const listening = (state: State) =>
  Array.from(HashMap.keys(app.subscriptions(state))).flatMap((key) => Array.isArray(key) ? [key[0]] : [])

describe("pages", () => {
  describe("navigation", () => {
    test("the Clock asks for About, which opens over it and loads its saying", () => {
      const { state, commands } = applyAll(app.update)([aboutClicked], app.init.state)
      expect(state.maybeAbout).toEqual(Opt.some(About.about.init({ openedAt: Opt.none() }).state))
      expect(commands).toEqual([{ _tag: "About", command: About.Command.PickSaying() }])
    })

    test("About starts from the time the Clock showed when it was asked for", () => {
      const { state } = applyAll(app.update)([ticked(0), aboutClicked], app.init.state)
      expect(Opt.map(state.maybeAbout, (about) => about.openedAt)).toEqual(Opt.some(Opt.some(DateTime.makeUnsafe(0))))
    })

    test("About asks to be left, and the Clock is back as it was", () => {
      const { state } = applyAll(app.update)([ticked(0), aboutClicked, backClicked], app.init.state)
      expect(state).toEqual({
        clock: { maybeNow: Opt.some(DateTime.makeUnsafe(0)), format: "Iso" },
        maybeAbout: Opt.none()
      })
    })

    test("the Clock stops ticking while About is over it", () => {
      expect(listening(app.init.state)).toEqual(["Clock"])
      expect(listening(applyAll(app.update)([aboutClicked], app.init.state).state)).toEqual([])
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
          message._tag === "Clock" && message.message._tag === "FormatPicked" && Opt.isSome(state.maybeAbout)
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once and each page
  // through its own dispatch. `messagesSentBy`, beside the snabbdom bridge, is its way to see it without a DOM.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state, (before) => {
      const model = app.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model))
    }))
  })

  test("About receives its saying through the parent", async () => {
    const { state, messages } = await Effect.runPromise(simulate(app)([aboutClicked], app.init))
    expect(messages.map((message) => message._tag)).toEqual(["Clock", "About"])
    expect(Opt.isSome(Opt.flatMap(state.maybeAbout, (about) => about.maybeSaying))).toBe(true)
  })

  // As it runs: a user opens About with the Clock's own message, through the Clock's dispatch, asked for at each new
  // state, as a view asks for it each time it is drawn.
  test("a user opens About, and the Clock's dispatch is the same function every time it is asked for", async () => {
    const clockDispatches = new Set<unknown>()
    await Effect.runPromise(
      run(app, (handle) =>
        Effect.gen(function*() {
          const opened = yield* Deferred.make<void>()
          yield* Effect.sync(() =>
            handle.subscribe(() => {
              const { page } = handle.model()
              const clock = forwardTo(handle.dispatch, "Clock")
              clockDispatches.add(clock)
              if (page._tag === "Clock" && page.model.time !== "") clock(page.model.openAbout)
              if (page._tag === "About" && Opt.isSome(page.model.saying)) Deferred.doneUnsafe(opened, Exit.void)
            })
          )
          yield* Deferred.await(opened)
        })).pipe(Effect.timeout("3 seconds"))
    )
    expect(clockDispatches.size).toBe(1)
  })
})
