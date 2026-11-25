// A small reference of three topics, one page each, at an address of its own. The route is the program's state: it
// starts from the address the page was opened at, its flags, a link the user follows is a message whose command pushes
// the new address, and the browser's back and forward are a subscription that tells the program the address it went
// to. The pages hold nothing of their own; a page that does would be a child, there while the route gives its flags,
// as in `pages`.
import { program, reject, type Subscription, type Update } from "@fgaudo/effect-tea"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"

/**
 * The address bar, as the program knows it: `push` goes to an address, relative to the page's own, and adds it to the
 * history, as a link would; `popped` gives the query of each address that back and forward go to. The program knows
 * only this interface: `main.ts` and the tests provide it.
 */
export class Address extends Context.Service<Address, {
  readonly push: (href: string) => Effect.Effect<void>
  readonly popped: Stream.Stream<string>
}>()("examples/routing/Address") {}

const topics = {
  model: { title: "Model", text: "What the view draws, made from the state, with the messages it may send." },
  update: { title: "Update", text: "How a message makes the next state, with the commands it starts." },
  view: { title: "View", text: "The model drawn, and its controls, which send the messages it holds." }
} as const

/** A topic of the reference. */
export type Topic = keyof typeof topics

const topicsInOrder: ReadonlyArray<Topic> = ["model", "update", "view"]

const isTopic = (name: string): name is Topic => topicsInOrder.some((topic) => topic === name)

/** A page of the reference: its contents, a topic, or an address that names none. */
export type Route = Data.TaggedEnum<{
  Contents: object
  Topic: { topic: Topic }
  NotFound: object
}>

export const Route = Data.taggedEnum<Route>()

/** A route that a link goes to: an address that names no page is never linked. */
export type Target = Extract<Route, { _tag: "Contents" | "Topic" }>

/**
 * The route of an address, from its whole query: `?topic=update` is a topic, no query is the contents, and a query with
 * any other name names no page.
 */
export const routeOf = (query: string): Route => {
  const params = new URLSearchParams(query)
  const names = [...params.keys()]
  if (names.length === 0) return Route.Contents()
  const topic = params.get("topic")
  return names.length === 1 && topic !== null && isTopic(topic) ? Route.Topic({ topic }) : Route.NotFound()
}

/**
 * The address of a target, relative to the page's own: the page itself, with no query, for the contents. `routeOf`
 * reads its query back.
 */
export const hrefOf = (target: Target): string =>
  target._tag === "Contents" ? "./" : `?${new URLSearchParams({ topic: target.topic })}`

export type State = Readonly<{ route: Route }>

/** What the program starts from: the query of the address the page was opened at. */
export type Flags = Readonly<{ query: string }>

export type Message = Data.TaggedEnum<{
  LinkFollowed: { target: Target }
  AddressPopped: { query: string }
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const Message = Data.taggedEnum<Message>()

export type Command = Data.TaggedEnum<{ PushAddress: { href: string } }>

export const Command = Data.taggedEnum<Command>()

export const update: Update<State, Message, Command> = (message) => (state) => {
  switch (message._tag) {
    // A link to the page shown adds no address to the history: the model holds none, and one drawn before is rejected.
    case "LinkFollowed":
      return Equal.equals(message.target, state.route)
        ? reject
        : { state: { route: message.target }, commands: [Command.PushAddress({ href: hrefOf(message.target) })] }
    // The browser is already at the address: the program follows it, and pushes nothing.
    case "AddressPopped": {
      const route = routeOf(message.query)
      return Equal.equals(route, state.route) ? reject : { state: { route } }
    }
  }
}

// Back and forward, for as long as the page is open: a history that ends is a defect of what provides it.
const popped: Subscription<Message, Address> = Channel.unwrap(
  Effect.map(Effect.service(Address), (address) =>
    Stream.toChannel(address.popped).pipe(
      Channel.flattenArray,
      Channel.map((query) => Message.AddressPopped({ query })),
      Channel.concatWith(() => Channel.die(new Error("The history of the page ended")))
    ))
)

/** An entry of the menu: a link, or the page shown, which links nowhere. */
export type Entry = Readonly<
  | { _tag: "Link"; title: string; href: string; follow: Message }
  | { _tag: "Here"; title: string }
>

/** What the page shows. */
export type Page = Readonly<
  | { _tag: "Contents" }
  | { _tag: "Topic"; title: string; text: string }
  | { _tag: "NotFound" }
>

export type Model = Readonly<{ title: string; menu: ReadonlyArray<Entry>; page: Page }>

const titleOf = (route: Route): string => {
  switch (route._tag) {
    case "Contents":
      return "Contents"
    case "Topic":
      return topics[route.topic].title
    case "NotFound":
      return "Not found"
  }
}

const entryOf = (state: State, target: Target): Entry =>
  Equal.equals(target, state.route)
    ? { _tag: "Here", title: titleOf(target) }
    : { _tag: "Link", title: titleOf(target), href: hrefOf(target), follow: Message.LinkFollowed({ target }) }

export const routing = program<
  { state: State; model: Model; message: Message; command: Command; flags: Flags; key: "popped" }
>().make({
  init: ({ query }) => ({ state: { route: routeOf(query) } }),
  update,
  runCommand: (command) => {
    switch (command._tag) {
      case "PushAddress":
        return Effect.flatMap(Effect.service(Address), (address) => address.push(command.href)).pipe(
          Effect.as(Opt.none())
        )
    }
  },
  subscriptions: () => ["popped"],
  listen: () => popped,
  makeModel: (state) => ({
    title: titleOf(state.route),
    menu: [
      entryOf(state, Route.Contents()),
      ...topicsInOrder.map((topic) => entryOf(state, Route.Topic({ topic })))
    ],
    page: state.route._tag === "Topic"
      ? { _tag: "Topic", ...topics[state.route.topic] }
      : { _tag: state.route._tag }
  })
})
