// A consumer of the packed package, run with Node and typechecked by `smoke.ts` under several TypeScript versions
// and module resolutions. It instantiates the types of `program` (a child, children by id, with a key, flags and
// `listening`, events and external messages told in a step or declared, an output its parent reads, a parent of
// parents, subscriptions made from their keys, a function over programs), checks that what they reject does not
// compile, and that the declarations of what it exports can be emitted.
import {
  andThen,
  type CommandServicesOf,
  CompositionDefect,
  type Dispatch,
  forwardTo,
  type Instance,
  InvariantDefect,
  type Kept,
  type KeyOf,
  type MessageOf,
  type ModelOf,
  type Program,
  program,
  ProgramDefect,
  reject,
  start,
  type SubscriptionServicesOf,
  type Update
} from "@fgaudo/effect-tea"
import * as Library from "@fgaudo/effect-tea"
import { applyAll, rehearse, simulate, stateOf } from "@fgaudo/effect-tea/testing"
import * as Testing from "@fgaudo/effect-tea/testing"
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"

type CounterState = Readonly<{ count: number }>

type Reset = Readonly<{ _tag: "Reset" }>

type CounterMessage = Readonly<{ _tag: "Increment" }>

type Full = Readonly<{ _tag: "Full" }>

const counterUpdate: Update<CounterState, CounterMessage, never, Full> = () => ({ count }) => {
  if (count === 3) return reject
  return count === 2 ? { state: { count: 3 }, events: [{ _tag: "Full" }] } : { state: { count: count + 1 } }
}

export const counter = program<{
  state: CounterState
  model: CounterState
  message: CounterMessage
  event: Full
  external: Reset
}>().make({
  init: { state: { count: 0 } },
  update: counterUpdate,
  external: () => () => ({ state: { count: 0 } }),
  makeModel: (state) => state
})

// A child with flags, which starts from them.
type Greeting = Readonly<{ since: number }>

export const greeter = program<{ state: Greeting; model: number; flags: number }>().make({
  init: (since) => ({ state: { since } }),
  makeModel: (state) => state.since
})

// `fulls` is a field of this state alone: `smoke.ts` counts it in the declarations, to see how often they spell it out.
type State = Readonly<{
  ids: ReadonlyArray<number>
  fulls: number
  opened: Opt.Option<number>
}>

type ResetAll = Readonly<{ _tag: "ResetAll" }>

// Exported, as a module that declares a program for others: its declarations name the types of `program`.
export const { child, childById, make, withChildren } = program<{ state: State; message: ResetAll }>()

// A child that names no external message, which `nodenext` checks without `exactOptionalPropertyTypes`.
export const quiet = program<{ state: CounterState; model: CounterState; message: Readonly<{ _tag: "Increment" }> }>()
  .make({
    init: { state: { count: 0 } },
    update: () => ({ count }) => ({ state: { count: count + 1 } }),
    makeModel: (state) => state
  })

// Exported, as a package that publishes a program would: its declarations name what `child` and `childById` give. A
// child always there, children by id, told a literal as each starts, a child started again on another key, one there in
// some states, one with flags.
export const children = {
  Main: child(counter),
  Row: childById(counter, { ids: (state) => state.ids, listening: (_, id) => id > 0, tell: () => ({ _tag: "Reset" }) }),
  Keyed: child(quiet, { key: (state) => state.fulls }),
  Shown: child(quiet, { there: (state) => state.fulls > 0, listening: (state) => state.fulls < 10 }),
  Greeter: child(greeter, { flags: (state) => state.opened })
}

const first: State = { ids: [1], fulls: 0, opened: Opt.none() }

// What a parent tells its children is data of its step, typed by their external messages.
export const app = withChildren(children).make({
  init: { state: first },
  update: () => (state) =>
    andThen(
      { state, tell: [{ _tag: "Main", message: { _tag: "Reset" } }] },
      (state) => ({ state, tell: Arr.map(state.ids, (id) => ({ _tag: "Row", id, message: { _tag: "Reset" } })) })
    ),
  onEvent: {
    Main: () => (state) => ({ state: { ...state, fulls: state.fulls + 1, opened: Opt.some(state.fulls + 1) } }),
    Row: () => (state) => ({ state: { ...state, fulls: state.fulls + 1 } })
  },
  makeModel: (state, children) => ({
    main: children.Main(),
    rows: Arr.map(state.ids, (id) => ({ id, model: children.Row(id) })),
    keyed: children.Keyed(),
    shown: children.Shown(),
    greeter: children.Greeter(),
    fulls: state.fulls
  })
})

type Message = MessageOf<typeof app>

// `onEvent` is required exactly when a child has events.
// @ts-expect-error
withChildren(children).make({ init: { state: first }, update: () => (state) => ({ state }), makeModel: () => null })

const handled = {
  Main: () => (state: State) => ({ state }),
  Row: () => (state: State) => ({ state })
}

// A parent tells a child only its external messages, and only a child it has.
withChildren(children).make({
  init: { state: first },
  onEvent: handled,
  // @ts-expect-error
  update: () => (state) => ({ state, tell: [{ _tag: "Main", message: { _tag: "Increment" } }] }),
  makeModel: () => null
})

withChildren(children).make({
  init: { state: first },
  onEvent: handled,
  // @ts-expect-error
  update: () => (state) => ({ state, tell: [{ _tag: "Absent", message: { _tag: "Reset" } }] }),
  makeModel: () => null
})

withChildren(children).make({
  init: { state: first },
  onEvent: handled,
  // @ts-expect-error
  update: () => (state) => ({ state, tell: [{ _tag: "Keyed", message: { _tag: "Reset" } }] }),
  makeModel: () => null
})

// What a declaration tells is an external message of the child, and a child without one is told nothing.
// @ts-expect-error
childById(counter, { ids: (state) => state.ids, tell: () => ({ _tag: "Increment" }) })
// @ts-expect-error
child(quiet, { tell: () => ({ _tag: "Increment" }) })

// A program with external messages and none of its own passes them on to its child, in its `external`.
const relaying = program<{ state: Readonly<{ relayed: number }>; event: Full; external: Reset }>()

export const relay = relaying.withChildren({ Inner: relaying.child(counter) }).make({
  init: { state: { relayed: 0 } },
  external: (reset) => (state) => ({
    state: { relayed: state.relayed + 1 },
    tell: [{ _tag: "Inner", message: reset }]
  }),
  onEvent: { Inner: (full) => (state) => ({ state, events: [full] }) },
  makeModel: (_, children) => children.Inner()
})

// A parent of parents, which tells its child, a parent, what that child passes on.
const outerOf = program<{ state: Readonly<{ heard: number }>; message: ResetAll }>()

export const outer = outerOf.withChildren({ Relay: outerOf.child(relay) }).make({
  init: { state: { heard: 0 } },
  update: () => (state) => ({ state, tell: [{ _tag: "Relay", message: { _tag: "Reset" } }] }),
  onEvent: { Relay: () => (state) => ({ state: { heard: state.heard + 1 } }) },
  makeModel: (state, children) => ({ heard: state.heard, inner: children.Relay() })
})

// A child's output, which its parent reads in its steps and its model, and a parent's own output made of it.
type Lamp = Readonly<{ on: boolean }>

export const lamp = program<{ state: Lamp; model: boolean; message: "Pressed"; output: boolean }>().make({
  init: { state: { on: false } },
  update: () => (state) => ({ state: { on: !state.on } }),
  output: (state) => state.on,
  makeModel: (state) => state.on
})

const lighting = program<
  { state: Readonly<{ ids: ReadonlyArray<number>; lit: number }>; message: ResetAll; output: number }
>()

export const lamps = lighting.withChildren({
  Lamp: lighting.childById(lamp, { ids: (state) => state.ids }),
  Main: lighting.child(counter)
}).make({
  init: { state: { ids: [1, 2], lit: 0 } },
  update: (_, children) => (state) => ({
    state: { ...state, lit: Arr.filter(state.ids, children.Lamp.output).length }
  }),
  onEvent: { Main: () => (state) => ({ state }) },
  output: (state, children) => Arr.filter(state.ids, children.Lamp.output).length,
  makeModel: (state, children) =>
    Arr.map(state.ids, (id) => ({
      id,
      instance: children.Lamp.instance(id),
      model: children.Lamp(id),
      on: children.Lamp.output(id)
    }))
})

// A view's dispatch names the instance that its model holds, with the id of a child by id, and only there.
export const pressing = (dispatch: Dispatch<MessageOf<typeof lamps>>, model: ModelOf<typeof lamps>) =>
  Arr.map(model, ({ id, instance }) => forwardTo(dispatch, { _tag: "Lamp", id, instance }))
const toLamps: Dispatch<MessageOf<typeof lamps>> = () => {}
const pressed: ReadonlyArray<Dispatch<"Pressed">> = pressing(toLamps, lamps.makeModel(lamps.init.state))
void pressed
// @ts-expect-error
forwardTo(toLamps, { _tag: "Lamp", instance: 1 })("Pressed")
// @ts-expect-error
forwardTo(toLamps, { _tag: "Main", id: 1, instance: 1 })(null as never)

// A parent reads only the output of a child that declares one.
lighting.withChildren({ Main: lighting.child(counter) }).make({
  init: { state: { ids: [], lit: 0 } },
  // @ts-expect-error
  update: (_, children) => (state) => ({ state: { ...state, lit: children.Main.output() } }),
  onEvent: { Main: () => (state) => ({ state }) },
  output: (state) => state.lit,
  makeModel: () => null
})

// A parent's own command answers with the parent's own messages, never with a child's: an external message is none.
export const loading = program<{ state: State; command: "Load"; message: ResetAll }>()

const loadingChildren = { Main: loading.child(counter) }

loading.withChildren(loadingChildren).make({
  init: { state: first },
  onEvent: { Main: () => (state) => ({ state }) },
  update: () => (state) => ({ state, commands: ["Load" as const] }),
  // @ts-expect-error
  runCommand: () => Effect.succeedSome({ _tag: "Main" as const, message: { _tag: "Increment" as const } }),
  makeModel: () => null
})

loading.withChildren(loadingChildren).make({
  init: { state: first },
  onEvent: { Main: () => (state) => ({ state }) },
  update: () => (state) => ({ state, commands: ["Load" as const] }),
  // @ts-expect-error
  runCommand: () => Effect.succeedSome({ _tag: "Main" as const, message: { _tag: "Reset" as const } }),
  makeModel: () => null
})

loading.withChildren(loadingChildren).make({
  init: { state: first },
  onEvent: { Main: () => (state) => ({ state }) },
  update: () => (state) => ({ state, tell: [{ _tag: "Main", message: { _tag: "Reset" } }] }),
  runCommand: () => Effect.succeedSome<ResetAll>({ _tag: "ResetAll" }),
  makeModel: () => null
})

// A program's services are those its `runCommand` needs, and those its `listen` needs, with no annotation.
class Server extends Context.Service<Server, { readonly load: Effect.Effect<void> }>()("Server") {}
class Backup extends Context.Service<Backup, { readonly load: Effect.Effect<void> }>()("Backup") {}
class Feed extends Context.Service<Feed, { readonly resets: Stream.Stream<ResetAll> }>()("Feed") {}

const listening = program<{ state: State; command: "Load"; message: ResetAll; key: "resets" }>()

export const served = listening.make({
  init: { state: first },
  update: () => (state) => ({ state, commands: ["Load" as const] }),
  runCommand: () =>
    Math.random() < 0.5
      ? Effect.as(Effect.service(Server), Opt.none<ResetAll>())
      : Effect.as(Effect.service(Backup), Opt.none<ResetAll>()),
  subscriptions: () => ["resets"],
  listen: () =>
    Channel.unwrap(Effect.map(Effect.service(Feed), (feed) =>
      feed.resets.pipe(
        Stream.toChannel,
        Channel.flattenArray,
        Channel.mapDone((): ResetAll => ({ _tag: "ResetAll" }))
      ))),
  makeModel: () => null
})

export const keyed: [KeyOf<typeof served>] extends ["resets"] ? ["resets"] extends [KeyOf<typeof served>] ? true
  : false
  : false = true

// A program that names keys has a `listen`, which makes their subscriptions.
// @ts-expect-error
listening.make({
  init: { state: first },
  update: () => (state) => ({ state }),
  runCommand: () => Effect.succeedNone,
  subscriptions: () => ["resets"],
  makeModel: () => null
})

// One that names none lists none.
loading.make({
  init: { state: first },
  update: () => (state) => ({ state }),
  runCommand: () => Effect.succeedNone,
  // @ts-expect-error
  subscriptions: () => ["resets"],
  makeModel: () => null
})

// An own key that takes a child's name does not compile, as an own command that takes it does not.
// @ts-expect-error
program<{ state: State; message: ResetAll; key: Readonly<{ _tag: "Main" }> }>().withChildren(children).make({
  init: { state: first },
  update: () => (state) => ({ state }),
  onEvent: handled,
  subscriptions: () => [{ _tag: "Main" }],
  listen: () => Channel.never,
  makeModel: () => null
})

// A copy spells its type out.
export const copied = { ...served, makeModel: () => 0 }

type Ran = CommandServicesOf<typeof served>

type Heard = SubscriptionServicesOf<typeof served>

export const ranBoth: [Ran] extends [Server | Backup] ? [Server | Backup] extends [Ran] ? true : false : false = true

export const heardFeed: [Heard] extends [Feed] ? [Feed] extends [Heard] ? true : false : false = true

// `simulate` asks only for what the commands need: the subscriptions do not run.
export const simulated: Effect.Effect<unknown, never, Server | Backup> = simulate(served, [], served.init)

// A scenario made with `Effect.fnUntraced`, of a program without commands: it keeps its errors and services, and the
// declarations name the rehearsal it returns.
export const rehearsed = rehearse(
  quiet,
  Effect.fnUntraced(function*(rehearsal) {
    yield* rehearsal.send(() => Opt.some({ _tag: "Increment" }))
    return rehearsal
  })
)
export const rehearsedChecked: Effect.Effect<unknown, never, never> = rehearsed

// An own message that takes a child's name does not compile.
// @ts-expect-error
program<{ state: State; message: Readonly<{ _tag: "Main" }> }>().withChildren(children).make({
  init: { state: first },
  update: () => (state) => ({ state }),
  onEvent: handled,
  makeModel: () => null
})

// A program with external messages has an `external`, which answers them.
// @ts-expect-error
const deaf: Program<{ state: CounterState; model: null; message: Full; external: Reset }> = {
  init: { state: { count: 0 } },
  update: () => (state) => ({ state }),
  subscriptions: () => [],
  makeModel: () => null
}

// A program written as an object has `subscriptions`, even one that listens to nothing: only `make` fills them in.
// @ts-expect-error
const unlistening: Program<{ state: CounterState; model: null; message: Full }> = {
  init: { state: { count: 0 } },
  update: () => (state) => ({ state }),
  makeModel: () => null
}

// And so do the pieces of a program that `simulate` takes.
// @ts-expect-error
simulate({ update: counterUpdate }, [], counter.init)

// A program may be typed with fewer external messages than it takes, never with more.
export const sealed: Program<{ state: CounterState; model: CounterState; message: CounterMessage; event: Full }> =
  counter

// @ts-expect-error
const opened: Program<{
  state: CounterState
  model: CounterState
  message: CounterMessage
  event: Full
  external: CounterMessage
}> = counter

// A child with commands has a `runCommand`, even when written without `Program<…>`.
child(
  // @ts-expect-error
  {
    init: { state: { count: 0 }, commands: ["Save" as const] },
    update: counterUpdate,
    subscriptions: () => [],
    makeModel: () => null
  }
)

// So does one whose `external` alone returns commands, and an `external` answers with a step, never `reject`.
const resetting = {
  init: { state: { count: 0 } },
  update: counterUpdate,
  subscriptions: () => [],
  makeModel: () => null
}
const saving = {
  ...resetting,
  external: (_: Reset) => (state: CounterState) => ({ state, commands: ["Save" as const] })
}
const refusing = { ...resetting, external: (_: Reset) => (state: CounterState) => state.count > 0 ? { state } : reject }
// @ts-expect-error
child(saving)
// @ts-expect-error
child(refusing)
// `start` checks them too, and starts a program a parent could hold: its `external` and its `output` are never called.
const steady = {
  init: { state: { count: 0 } },
  update: (_: "Pressed") => (state: CounterState) => ({ state }),
  subscriptions: () => [],
  makeModel: () => null
}
// @ts-expect-error
start({ ...steady, external: (_: Reset) => (state: CounterState) => state.count > 0 ? { state } : reject })
export const steadyStarted = start({ ...steady, external: (_: Reset) => () => ({ state: { count: 0 } }) })
export const lampStarted = start(lamp)

// A defect is read, never built: only the library makes one.
export const crashed = (error: unknown) =>
  error instanceof InvariantDefect
    ? error.reason
    : error instanceof ProgramDefect
    ? error.where
    : error instanceof CompositionDefect
    ? error.child
    : undefined
export const built = () => [
  // @ts-expect-error
  new InvariantDefect("A save completed while nothing was saving"),
  // @ts-expect-error
  new ProgramDefect({ where: "update", cause: "boom" }),
  // @ts-expect-error
  new CompositionDefect({ message: "Broken", child: "Page" })
]

// A state is any value: a number, alone, as a child and by id, a state without fields, and a type parameter.
export const numbered = program<{ state: number; message: "Increment" }>().make({
  init: { state: 0 },
  update: () => (count) => ({ state: count + 1 }),
  makeModel: (count) => count
})
const counters = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
export const numberedParent = counters.withChildren({
  Count: counters.child(numbered),
  Counts: counters.childById(numbered, { ids: (state) => state.ids })
}).make({ init: { state: { ids: [] } }, makeModel: (_, children) => children.Count() })

export const fieldless = program<{ state: {} }>().make({ init: { state: {} }, makeModel: () => null })

export const generic = <S>(state: S) => program<{ state: S }>().make({ init: { state }, makeModel: () => null })

// A function over any program: its signature names the types, its body makes the parent of a program of erased types.
type DialogOwn = Readonly<{ open: boolean }>
type DialogModel<M> = Readonly<{ open: boolean; content: M }>
type Toggle = Readonly<{ _tag: "Opened" }> | Readonly<{ _tag: "Closed" }>
type InDialog<Msg> = Toggle | Readonly<{ _tag: "Content"; message: Msg; instance?: number }>

export function inDialog<S, M, Msg>(
  content: Program<{ state: S; model: M; message: Msg }>
): Program<{
  state: Kept<DialogOwn, { readonly Content: Opt.Option<Instance<S>> }>
  model: DialogModel<M>
  message: InDialog<Msg>
}>
export function inDialog(content: Program<{ state: unknown; model: unknown; message: unknown }>) {
  const dialog = program<{ state: DialogOwn; message: Toggle }>()
  return dialog.withChildren({ Content: dialog.child(content) }).make({
    init: { state: { open: false } },
    update: (message) => () => ({ state: { open: message._tag === "Opened" } }),
    makeModel: (state, children) => ({ open: state.open, content: children.Content() })
  })
}

export const dialogOfQuiet = inDialog(quiet)

const assert = (condition: boolean, what: string) => {
  if (!condition) throw new Error(`smoke: ${what}`)
}

const increment = (id?: number): Message =>
  id === undefined
    ? { _tag: "Main", message: { _tag: "Increment" } }
    : { _tag: "Row", id, message: { _tag: "Increment" } }

const countOf = (kept: Opt.Option<Instance<CounterState>>) => Opt.getOrThrow(kept).state.count

const folded = applyAll(app.update, [increment(), increment(), increment(), increment(1)], app.init.state)
assert(countOf(folded.state.children.Main) === 3 && folded.state.own.fulls === 1, "applyAll routes to the children")
const foldedModel = app.makeModel(folded.state)
assert(foldedModel.rows[0]?.model.count === 1, "makeModel reads the children by id")
assert(
  Opt.getOrThrow(foldedModel.greeter) === 1 && Opt.isSome(foldedModel.shown),
  "a child is there where its state says"
)

// A whole state for a test, from the own state and the states of the children it lists.
const placed = stateOf(app, { ...first, ids: [1, 2] }, { Main: { count: 2 }, Row: [[2, { count: 1 }]] })
const placedModel = app.makeModel(placed)
assert(placedModel.main.count === 2 && placedModel.rows[1]?.model.count === 1, "stateOf puts the children in place")
// @ts-expect-error
stateOf(app, first, { Main: { count: "2" } })

const lampsLit = stateOf(lamps, { ids: [1, 2], lit: 0 }, { Lamp: [[2, { on: true }]] })
const read = lamps.update({ _tag: "ResetAll" })(lampsLit)
assert(
  read !== reject && read.state.own.lit === 1 && lamps.output(lampsLit) === 1 &&
    lamps.makeModel(lampsLit)[1]?.on === true,
  "a parent reads its children's outputs"
)

const relayed = applyAll(outer.update, [{ _tag: "ResetAll" }], outer.init.state)
assert(relayed.state.own.heard === 0, "a parent of parents tells its child, which tells its own")
const told = dialogOfQuiet.update({ _tag: "Content", message: { _tag: "Increment" } })(dialogOfQuiet.init.state)
assert(told !== reject && countOf(told.state.children.Content) === 1, "a parent made over any program routes to it")

assert(deaf.update({ _tag: "Full" })(deaf.init.state) !== reject, "a program typed past its types runs")
assert(!("subscriptions" in unlistening), "a program typed past its types has only the pieces written")
assert(opened === sealed, "a program typed with other external messages is the same program")

// An option of the run is a function that returns nothing: an effect it returned would never run.
// @ts-expect-error
export const unheard = start(app, { onApplied: () => Effect.log("heard") }).run

// Every value of the package, as a module that wraps the library would export it: its declarations name every type
// of their signatures.
export const library = { ...Library }
export const testing = { ...Testing }

const main = Effect.gen(function*() {
  const simulation = yield* simulate(app, [increment(), { _tag: "ResetAll" }], app.init)
  assert(countOf(simulation.state.children.Main) === 0, "simulate tells the children the external messages")
  const counts: Array<number> = []
  const heard: Array<unknown> = []
  const { app: handle, run } = start(app, {
    onApplied: ({ message }) => {
      heard.push(message)
    }
  })
  counts.push(handle.model().main.count)
  handle.subscribe(() => void counts.push(handle.model().main.count))
  for (const count of [1, 2, 3]) {
    handle.dispatch(increment())
    assert(handle.model().main.count === count, "a program started applies a message before it returns, unrun")
  }
  assert(counts.join() === "0,1,2,3", `a listener is told of every new state: ${counts.join()}`)
  assert(heard.length === 3, `onApplied hears every accepted message: ${heard.length}`)
  yield* Fiber.interrupt(yield* Effect.forkChild(run))
})

await Effect.runPromise(main)
// The services are inferred, never named in `program`.
// @ts-expect-error
program<{ state: number; message: "Go"; command: "Save"; commandServices: "Named" }>()
console.log("smoke: the consumer ran")
