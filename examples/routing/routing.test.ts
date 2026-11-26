// The messages are built by the test: the program's constructors are not exported.
import { reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive, rehearse } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import {
  Address,
  Command,
  hrefOf,
  type Message,
  type Model,
  Route,
  routeOf,
  routing,
  type State,
  type Target
} from "./routing.ts"
import { view } from "./view.ts"

// Made anew on each call, so that two lists share no object.
const targetsOf = (): ReadonlyArray<Target> => [
  Route.Contents(),
  Route.Topic({ topic: "model" }),
  Route.Topic({ topic: "update" }),
  Route.Topic({ topic: "view" })
]

const targets = targetsOf()

// Every state of the program, listed in place of an arbitrary: the state is the route, and the route is a target, or
// an address that names none.
const statesOf = (): ReadonlyArray<State> => [...targetsOf(), Route.NotFound()].map((route) => ({ route }))

const states = statesOf()

const followed = (target: Target): Extract<Message, { _tag: "LinkFollowed" }> => ({ _tag: "LinkFollowed", target })

// What the model holds: the link of each entry of the menu, in the order the view draws them.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model.menu.flatMap((entry) => entry._tag === "Link" ? [entry.follow] : [])

// What a user could ask for, a tag at a time: not an address popped, which only the history sends.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
    LinkFollowed: targets.map(followed),
    AddressPopped: []
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()

// A plain click of the main button, as the browser reports it.
const plainClick = { button: 0, preventDefault: () => undefined }

describe("routing", () => {
  describe("the address", () => {
    test("the page starts on the route of the address it is opened at", () => {
      const routeAt = (query: string) => routing.init({ query }).state.route
      expect(routeAt("")).toEqual(Route.Contents())
      expect(routeAt("?topic=update")).toEqual(Route.Topic({ topic: "update" }))
      expect(routeAt("?topic=nothing")).toEqual(Route.NotFound())
      expect(routeAt("?topic=update&page=2")).toEqual(Route.NotFound())
    })

    test("the address of each target, resolved from the page's own, gives the target back", () => {
      for (const target of targets) {
        const { search } = new URL(hrefOf(target), "https://example.test/examples/routing/?topic=view")
        expect(routeOf(search)).toEqual(target)
      }
    })
  })

  describe("navigation", () => {
    test("a link goes to its page, and pushes its address", () => {
      const { state, commands } = applyAll(routing.update, [followed(Route.Topic({ topic: "update" }))], {
        route: Route.Contents()
      })
      expect(state.route).toEqual(Route.Topic({ topic: "update" }))
      expect(commands).toEqual([Command.PushAddress({ href: "?topic=update" })])
    })

    test("a link to the page shown is rejected", () => {
      expect(routing.update(followed(Route.Contents()))({ route: Route.Contents() })).toBe(reject)
    })

    test("an address popped goes to its page, and one of the page shown is rejected", () => {
      const popped = (query: string): Message => ({ _tag: "AddressPopped", query })
      const { state, commands } = applyAll(routing.update, [popped("?topic=nothing")], { route: Route.Contents() })
      expect(state.route).toEqual(Route.NotFound())
      expect(commands).toEqual([])
      expect(routing.update(popped("?topic=view"))({ route: Route.Topic({ topic: "view" }) })).toBe(reject)
    })

    test("back goes to the page of the address popped, and pushes nothing", async () => {
      const after = await Effect.runPromise(
        rehearse(
          routing,
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.hear("popped", { _tag: "AddressPopped", query: "" })
            return { model: yield* rehearsal.model, pending: yield* rehearsal.pending }
          }),
          { flags: { query: "?topic=view" } }
        )
      )
      expect(after.model.title).toBe("Contents")
      expect(after.pending).toEqual([])
    })
  })

  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    for (const state of states) {
      expect(dispatchViolations(routing.update, {
        state,
        held: messagesOf(routing.makeModel(state)),
        candidates: userMessages
      })).toEqual([])
    }
  })

  // The view draws what its model holds, and leaves to the browser a click that opens a link elsewhere:
  // `messagesSentBy` finds what it sends without a DOM, and the test compares it with the reader.
  test("the view sends what its model holds on a plain click, and nothing on one that opens a tab", () => {
    for (const state of states) {
      const model = routing.makeModel(state)
      expect(messagesSentBy<Model, Message>(view, model, () => ({ event: plainClick }))).toEqual(messagesOf(model))
      for (
        const opensElsewhere of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, {
          button: 1
        }]
      ) {
        expect(messagesSentBy<Model, Message>(view, model, () => ({ event: { ...plainClick, ...opensElsewhere } })))
          .toEqual([])
      }
    }
  })

  // Two equal states built apart give two equal models, which a function in a model would break, being made anew by
  // each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    const others = statesOf()
    states.forEach((state, index) => {
      const other = others[index]
      expect(other).not.toBe(state)
      expect(other !== undefined && Equal.equals(routing.makeModel(state), routing.makeModel(other))).toBe(true)
    })
  })

  test("the program listens to the history in every state", () => {
    for (const state of states) expect(routing.subscriptions(state)).toEqual(["popped"])
  })

  // As it runs, with a history of the test's: a user follows a link, its address is pushed, and the browser goes
  // back to the address the page was opened at.
  test("a user follows a link, and back brings the contents again", async () => {
    const heard = await Effect.runPromise(Effect.gen(function*() {
      const pushed = yield* Queue.unbounded<string>()
      const popped = yield* Queue.unbounded<string>()
      const address = Address.of({
        push: (href) => Effect.asVoid(Queue.offer(pushed, href)),
        popped: Stream.fromQueue(popped)
      })
      return yield* drive(
        routing,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) =>
            Opt.fromNullishOr(
              model.menu.flatMap((entry) => entry._tag === "Link" && entry.title === "View" ? [entry.follow] : [])[0]
            )
          )
          const href = yield* Queue.take(pushed)
          const shown = (yield* driver.model).title
          yield* Queue.offer(popped, "")
          const back = yield* driver.waitFor((model) => model.title === "Contents" ? Opt.some(model) : Opt.none())
          return { href, shown, back }
        }),
        { flags: { query: "" } }
      ).pipe(Effect.provideService(Address, address))
    }))
    expect(heard.href).toBe("?topic=view")
    expect(heard.shown).toBe("View")
    expect(heard.back.menu[0]).toEqual({ _tag: "Here", title: "Contents" })
  })
})
