import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { pipe } from "effect/Function"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { collectGarbage } from "../test/gc.test_helper.ts"
import type { Execution } from "./command.ts"
import { type Child, type ChildById, type Instance, program } from "./compose.ts"
import { CompositionDefect, compositionDefect, defect } from "./defect.ts"
import { type Dispatch, forwardTo } from "./dispatch.ts"
import type { Ignored } from "./engine.ts"
import {
  type AnyProgram,
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type FlagsOf,
  type MessageOf,
  type ModelOf,
  type OutputOf,
  type Program,
  startOf,
  type StateOf,
  type SubscriptionServicesOf
} from "./program.ts"
import { start, type Started } from "./run.ts"
import type { Subscription } from "./subscription.ts"
import { applyAll } from "./testing/apply-all.ts"
import { drive } from "./testing/drive.ts"
import { rehearse } from "./testing/rehearse.ts"
import { simulate } from "./testing/simulate.ts"
import { stateOf } from "./testing/state-of.ts"
import { andThen, type Folded, reject, type Rejected, type Step, type Update } from "./update.ts"

/** The step of a message that must apply: a rejection fails the test. */
const accepted = <T>(result: T | Rejected): T => {
  if (result === reject) throw new Error("the message was rejected")
  return result as T
}

/** What `act` throws: the test fails when it throws nothing. */
const thrown = (act: () => unknown): unknown => {
  try {
    act()
  } catch (error) {
    return error
  }
  throw new Error("nothing was thrown")
}

/** The state of a child alone that must be there. */
const stateAt = <S>(kept: Opt.Option<Instance<S>>): S => Opt.getOrThrow(kept).state

/** A key as text, to sort the keys of a set: a child's key is an object. */
const keyText = (key: unknown): string => JSON.stringify(key)

// A counter that cannot go below zero, that saves on request, and that accepts typed numbers only.
type CounterMessage = Data.TaggedEnum<{
  Increment: object
  Decrement: object
  Typed: { text: string }
  SaveClicked: object
  Saved: object
}>
const CounterMessage = Data.taggedEnum<CounterMessage>()
type CounterCommand = Data.TaggedEnum<{ Save: { count: number } }>
const CounterCommand = Data.taggedEnum<CounterCommand>()
type CounterEvent = Data.TaggedEnum<{ SavedAt: { count: number } }>

type Counter = Readonly<{ count: number; text: string; saving: boolean }>

type CounterModel = Readonly<{
  count: number
  increment: CounterMessage
  decrement: Opt.Option<CounterMessage>
  type: (text: string) => CounterMessage
  save: Opt.Option<CounterMessage>
}>

// A parent may clear it, in any state: no view of its own sends that.
type External = Readonly<{ _tag: "Cleared" }>
const cleared: External = { _tag: "Cleared" }

const counter: Program<{
  state: Counter
  model: CounterModel
  message: CounterMessage
  command: CounterCommand
  event: CounterEvent
  external: External
}> = {
  init: { state: { count: 0, text: "", saving: false } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "Increment":
        return { state: { ...state, count: state.count + 1 } }
      case "Decrement":
        return state.count > 0 ? { state: { ...state, count: state.count - 1 } } : reject
      // Breaks the rule "a value is never a reason to reject", on purpose.
      case "Typed":
        return /^\d*$/.test(message.text) ? { state: { ...state, text: message.text } } : reject
      case "SaveClicked":
        return state.saving ? reject : { state: { ...state, saving: true }, commands: [CounterCommand.Save(state)] }
      case "Saved":
        return state.saving
          ? { state: { ...state, saving: false }, events: [{ _tag: "SavedAt", count: state.count }] }
          : reject
    }
  },
  external: () => (state) => ({ state: { ...state, count: 0 } }),
  runCommand: () => Effect.succeedSome(CounterMessage.Saved()),
  subscriptions: () => [],
  makeModel: (state) => ({
    count: state.count,
    increment: CounterMessage.Increment(),
    decrement: state.count > 0 ? Opt.some(CounterMessage.Decrement()) : Opt.none(),
    type: (text) => CounterMessage.Typed({ text }),
    save: state.saving ? Opt.none() : Opt.some(CounterMessage.SaveClicked())
  })
}

// A ticker that only listens.
type Tick = Readonly<{ _tag: "Tick" }>
const ticks: Subscription<Tick, never> = Channel.fromEffect(Effect.succeed<Tick>({ _tag: "Tick" })).pipe(
  Channel.concatWith(() => Channel.never)
)

type Ticks = Readonly<{ ticks: number }>

const noTicks: Ticks = { ticks: 0 }

const ticker: Program<{ state: Ticks; model: number; message: Tick; key: "ticks" }> = {
  init: { state: noTicks },
  update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
  subscriptions: () => ["ticks" as const],
  listen: () => ticks,
  makeModel: ({ ticks }) => ticks
}

// The parent's own state: whether the right counter is there, and how many saves it heard of.
type ParentState = Readonly<{ right: boolean; saves: number }>
type Reset = Readonly<{ _tag: "Reset" }>

const Parent = program<{ state: ParentState; message: Reset }>()

const app = Parent.withChildren({
  Left: Parent.child(counter),
  Right: Parent.child(counter, { there: (state) => state.right }),
  // Listens only while the right counter is there.
  Ticker: Parent.child(ticker, { listening: (state) => state.right })
}).make({
  init: { state: { right: false, saves: 0 } },
  // A parent tells a child what to do in its step.
  update: () => (state) => ({ state, tell: [{ _tag: "Left", message: cleared }] }),
  onEvent: {
    Left: () => (state) => ({ state: { ...state, saves: state.saves + 1 } }),
    Right: () => (state) => ({ state: { ...state, saves: state.saves + 1 } })
  },
  makeModel: (_, children) => ({
    left: children.Left(),
    maybeRight: children.Right(),
    reset: { _tag: "Reset" } as Reset
  })
})

type AppState = StateOf<typeof app>

type Model = ModelOf<typeof app>

type AppMessage = MessageOf<typeof app>

const withRight = stateOf(app, { right: true, saves: 0 })

/** What a renderer draws of a state: its model, and the dispatch the view gets. */
type Drawn = Readonly<{ model: Model; dispatch: Dispatch<AppMessage> }>

/**
 * Starts `app` from `state`, draws the first state and each new one as a renderer does, and hands what it draws to
 * `act`; runs the program until `act` says it is done, and returns what was drawn.
 */
const script = (act: (drawn: Drawn, index: number) => boolean, state: AppState = app.init.state) => {
  const seen: Array<Drawn> = []
  const { app: started, run } = start({ ...app, init: { ...app.init, state } })
  const done = Deferred.makeUnsafe<void>()
  let finished = false
  const draw = () => {
    // Done, it sends nothing more: under an engine that tells it again, sending would loop in one call, past any
    // timeout.
    if (finished) return
    const drawn = { model: started.model(), dispatch: started.dispatch }
    seen.push(drawn)
    if (act(drawn, seen.length - 1)) {
      finished = true
      Deferred.doneUnsafe(done, Exit.void)
    }
  }
  started.subscribe(draw)
  draw()
  return Effect.raceFirst(run, Deferred.await(done)).pipe(
    Effect.timeout("2 seconds"),
    Effect.as(seen),
    Effect.runPromiseExit
  )
}

const left = (drawn: Drawn) => forwardTo(drawn.dispatch, "Left")

/** A dispatch that keeps what it is sent, for `forwardTo` to wrap. */
const recording = <Message>() => {
  const sent: Array<Message> = []
  const dispatch: Dispatch<Message> = (message) => void sent.push(message)
  return { sent, dispatch }
}

// A list of counters, by id; one row is removed when it reports a save. The ticker never listens.
type ListState = Readonly<{ ids: ReadonlyArray<number> }>

const List = program<{ state: ListState }>()

const list = List.withChildren({
  Rows: List.childById(counter, { ids: (state) => state.ids }),
  Ticker: List.child(ticker, { listening: () => false })
}).make({
  init: { state: { ids: [] } },
  onEvent: { Rows: (id) => (state) => ({ state: { ids: state.ids.filter((other) => other !== id) } }) },
  makeModel: (state, children) => state.ids.map((id) => ({ id, model: children.Rows(id) }))
})

type List = StateOf<typeof list>

// The rows start from the counter's first state: all of them share that object.
const rows = (...ids: ReadonlyArray<number>): List => stateOf(list, { ids })

const countsOf = (state: List) =>
  state.own.ids.map((id) => Opt.getOrThrow(HashMap.get(state.children.Rows, id)).state.count)

// Lists of counters, by id: a parent whose children by id are parents with children by id.
const Nested = program<{ state: Readonly<{ ids: ReadonlyArray<string> }> }>()

const lists = Nested.withChildren({ Lists: Nested.childById(list, { ids: (state) => state.ids }) }).make({
  init: { state: { ids: [] } },
  makeModel: (state, children) => state.ids.map((id) => ({ id, rows: children.Lists(id) }))
})

describe("what a child's view sends", () => {
  test("one dispatch for the whole run, and the same dispatch for a child each time it is drawn", async () => {
    const exit = await script((drawn, index) => {
      if (index === 3) return true
      left(drawn)(drawn.model.left.increment)
      return false
    })
    const seen = Exit.isSuccess(exit) ? exit.value : []
    expect(seen.map((drawn) => drawn.model.left.count)).toEqual([0, 1, 2, 3])
    expect(new Set(seen.map((drawn) => drawn.dispatch)).size).toBe(1)
    expect(new Set(seen.map(left)).size).toBe(1)
  })

  test("a child's dispatch wraps its messages as its parent receives them, at every level, with no instance", () => {
    const { sent, dispatch } = recording<MessageOf<typeof lists>>()
    const row = forwardTo(forwardTo(dispatch, "Lists", "A"), "Rows", 1)
    row(CounterMessage.Increment())
    forwardTo(forwardTo(dispatch, "Lists", "B"), "Rows", 1)(CounterMessage.Increment())
    expect(sent).toEqual(["A", "B"].map((id) => ({
      _tag: "Lists",
      id,
      message: { _tag: "Rows", id: 1, message: CounterMessage.Increment() }
    })))
    expect(forwardTo(forwardTo(dispatch, "Lists", "A"), "Rows", 1)).toBe(row)
    expect(forwardTo(forwardTo(dispatch, "Lists", "A"), "Rows", 2)).not.toBe(row)
    // @ts-expect-error: a name that is no child's gives nothing to send with.
    expect(() => forwardTo(dispatch, "Rows")(CounterMessage.Increment())).toBeDefined()
  })

  test("a double tap acts once: the second message is rejected, and ignored", async () => {
    const at = stateOf(app, app.init.state.own, { Left: { ...counter.init.state, count: 1 } })
    const exit = await script((drawn, index) => {
      if (index > 0) return true
      const decrement = Opt.getOrThrow(drawn.model.left.decrement)
      left(drawn)(decrement)
      left(drawn)(decrement)
      return false
    }, at)
    expect(Exit.isSuccess(exit) && exit.value.map((drawn) => drawn.model.left.count)).toEqual([1, 0])
  })

  test("a message update rejects is ignored, and the run goes on", async () => {
    const exit = await script((drawn, index) => {
      if (index > 0) return true
      left(drawn)(drawn.model.left.type("not a number"))
      left(drawn)(drawn.model.left.increment)
      return false
    })
    expect(Exit.isSuccess(exit) && exit.value.map((drawn) => drawn.model.left)).toEqual([
      expect.objectContaining({ count: 0 }),
      expect.objectContaining({ count: 1 })
    ])
  })
})

describe("compose", () => {
  test("in a run, a child's commands run and their messages reach it", async () => {
    const exit = await script((drawn, index) => {
      if (index > 0) return drawn.model.left.count === 0 && Opt.isSome(drawn.model.left.save)
      left(drawn)(Opt.getOrThrow(drawn.model.left.save))
      return false
    })
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test("a parent's own message tells a child an external message", () => {
    const at = stateOf(app, app.init.state.own, { Left: { ...counter.init.state, count: 2 } })
    expect(stateAt(accepted(app.update({ _tag: "Reset" })(at)).state.children.Left).count).toBe(0)
  })

  // The very same state draws no new frame: a parent rebuilt around an unchanged child would draw one.
  test("a child's message that keeps its state keeps the parent's, its commands and events still going", () => {
    type Pinger = Readonly<{ pings: number }>
    const pinger: Program<{ state: Pinger; model: number; message: "Ping"; command: "Pong"; event: "Pinged" }> = {
      init: { state: { pings: 0 } },
      update: () => (state) => ({ state, commands: ["Pong"], events: ["Pinged"] }),
      runCommand: () => Effect.succeedNone,
      subscriptions: () => [],
      makeModel: (state) => state.pings
    }
    type Pinged = Readonly<{ heard: number }>
    const Pings = program<{ state: Pinged }>()
    const pingers = (onPinged: (state: Pinged) => Pinged) =>
      Pings.withChildren({ Pinger: Pings.child(pinger) }).make({
        init: { state: { heard: 0 } },
        onEvent: { Pinger: () => (state) => ({ state: onPinged(state) }) },
        makeModel: (_, children) => children.Pinger()
      })
    const before = pingers((state) => state).init.state
    const kept = accepted(pingers((state) => state).update({ _tag: "Pinger", message: "Ping" })(before))
    const heard = accepted(
      pingers((state) => ({ heard: state.heard + 1 })).update({ _tag: "Pinger", message: "Ping" })(before)
    )
    expect(kept.state).toBe(before)
    expect(kept.commands).toEqual([{ _tag: "Pinger", instance: 1, command: "Pong" }])
    expect(heard.state.own.heard).toBe(1)
  })

  test("a message its child rejects is rejected by the parent", () => {
    expect(app.update({ _tag: "Left", message: CounterMessage.Decrement() })(app.init.state)).toBe(reject)
  })

  test("a message for a child that is not there is rejected, from its view or as the answer of a command", () => {
    expect(app.update({ _tag: "Right", message: CounterMessage.Increment() })(app.init.state)).toBe(reject)
    const answer = Effect.runSync(
      app.runCommand({ _tag: "Right", instance: 2, command: CounterCommand.Save({ count: 0 }) })
    )
    expect(answer).toEqual(Opt.some({ _tag: "Right", instance: 2, message: CounterMessage.Saved() }))
    expect(app.update(Opt.getOrThrow(answer))(app.init.state)).toBe(reject)
    // An external message is none of the child's messages, which a view sends: only a step tells it.
    expectTypeOf<Extract<AppMessage, Readonly<{ message: External }>>>().toBeNever()
  })

  test("an own message or command whose tag a plain object inherits is the parent's own, not a child's", () => {
    type Own = Readonly<{ _tag: "toString" }>
    type OwnCommand = Readonly<{ _tag: "constructor" }>
    const Inherited = program<{ state: Ticks; command: OwnCommand; message: Own }>()
    const tested = Inherited.withChildren({ Ticker: Inherited.child(ticker) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state: { ticks: state.ticks + 1 }, commands: [{ _tag: "constructor" }] }),
      runCommand: () => Effect.succeedSome({ _tag: "toString" } as Own),
      makeModel: (_, children) => children.Ticker()
    })
    expect(accepted(tested.update({ _tag: "toString" })(tested.init.state)).state.own.ticks).toBe(1)
    expect(Effect.runSync(tested.runCommand({ _tag: "constructor" }))).toEqual(Opt.some({ _tag: "toString" }))
  })

  test("a child that the children object inherits is no child: it is not kept, and has no model and no subscriptions", () => {
    const Inherited = program<{ state: Ticks }>()
    const Ticker = Inherited.child(ticker)
    const children: { Ticker: typeof Ticker } = Object.assign(Object.create({ Ghost: Ticker }), { Ticker })
    let models: ReadonlyArray<string> = []
    const tested = Inherited.withChildren(children).make({
      init: { state: noTicks },
      makeModel: (_, handed) => {
        models = Object.keys(handed)
        return handed.Ticker()
      }
    })
    tested.makeModel(tested.init.state)
    expect(Object.keys(tested.init.state.children)).toEqual(["Ticker"])
    expect(tested.init.state.starts).toBe(1)
    expect(models).toEqual(["Ticker"])
    expect(tested.subscriptions(tested.init.state)).toEqual([{ _tag: "Ticker", instance: 1, key: "ticks" }])
  })

  test("a program made without subscriptions listens to nothing, in any state", () => {
    const silent = program<{ state: Ticks; message: Tick }>().make({
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      makeModel: ({ ticks }) => ticks
    })
    expect((silent.subscriptions(noTicks)).length === 0).toBe(true)
    expect((silent.subscriptions({ ticks: 3 })).length === 0).toBe(true)
  })

  test("a child listens under its name and its instance, and only where listening holds", () => {
    expect((app.subscriptions(app.init.state)).length).toBe(0)
    // Left is the first start, Right the second, Ticker the third: in the order of the children's names.
    expect(app.subscriptions(withRight)).toEqual([{ _tag: "Ticker", instance: 3, key: "ticks" }])
  })

  test("a child without listening listens whenever it is there", () => {
    const Maybe = program<{ state: Readonly<{ ticking: boolean }> }>()
    const maybe = Maybe.withChildren({ Ticker: Maybe.child(ticker, { there: (state) => state.ticking }) }).make({
      init: { state: { ticking: false } },
      makeModel: () => null
    })
    expect((maybe.subscriptions(maybe.init.state)).length === 0).toBe(true)
    expect(maybe.subscriptions(stateOf(maybe, { ticking: true }))).toEqual([{
      _tag: "Ticker",
      instance: 1,
      key: "ticks"
    }])
  })

  test("a child's model is kept while its state is the same object", () => {
    const first = app.makeModel(withRight)
    expect(app.makeModel({ ...withRight, own: { ...withRight.own, saves: 1 } }).left).toBe(first.left)
    const bumped = accepted(app.update({ _tag: "Left", message: CounterMessage.Increment() })(withRight)).state
    expect(app.makeModel(bumped).left).not.toBe(first.left)
    expect(app.makeModel(bumped).maybeRight).toEqual(first.maybeRight)
  })

  test("children give their models: a value for a child always there, an Option for one sometimes there", () => {
    expect(app.makeModel(app.init.state).maybeRight).toEqual(Opt.none())
    expect(Opt.map(app.makeModel(withRight).maybeRight, (model) => model.count)).toEqual(Opt.some(0))
    expectTypeOf<Model["left"]>().toEqualTypeOf<CounterModel>()
    expectTypeOf<Model["maybeRight"]>().toEqualTypeOf<Opt.Option<CounterModel>>()
  })

  // Both start in the very same state object, the counter's `init`, as two instances.
  test("a child's model is the same object while its instance keeps its state, through a step of another child too, and a child started again makes its own", () => {
    type Shown = Readonly<{ right: boolean }>
    type Toggle = Readonly<{ _tag: "Toggle" }>
    const Shown = program<{ state: Shown; message: Toggle }>()
    const toggling = Shown.withChildren({
      Left: Shown.child(counter),
      Right: Shown.child(counter, { there: (state) => state.right })
    }).make({
      init: { state: { right: true } },
      update: () => (state) => ({ state: { right: !state.right } }),
      onEvent: { Left: () => (state) => ({ state }), Right: () => (state) => ({ state }) },
      makeModel: (_, children) => ({ left: children.Left(), right: children.Right() })
    })
    const toggle: Toggle = { _tag: "Toggle" }
    const first = toggling.makeModel(toggling.init.state)
    const right = Opt.getOrThrow(first.right)
    expect(right).not.toBe(first.left)
    const bumped =
      accepted(toggling.update({ _tag: "Left", message: CounterMessage.Increment() })(toggling.init.state)).state
    expect(Opt.getOrThrow(toggling.makeModel(bumped).right)).toBe(right)
    expect(toggling.makeModel(bumped).left).not.toBe(first.left)
    const again = accepted(toggling.update(toggle)(accepted(toggling.update(toggle)(bumped)).state)).state
    expect(stateAt(again.children.Right)).toBe(stateAt(toggling.init.state.children.Right))
    const restarted = Opt.getOrThrow(toggling.makeModel(again).right)
    expect(restarted).not.toBe(right)
    expect(restarted.count).toBe(right.count)
  })
})

describe("children by id", () => {
  test("a message reaches the child with its id, and only that one", () => {
    const result = accepted(list.update({ _tag: "Rows", id: 2, message: CounterMessage.Increment() })(rows(1, 2)))
    expect(countsOf(result.state)).toEqual([0, 1])
  })

  test("a child's model is kept while its state is the same object, when another child changes", () => {
    const state = rows(1, 2)
    const bumped = accepted(list.update({ _tag: "Rows", id: 1, message: CounterMessage.Increment() })(state)).state
    expect(list.makeModel(bumped)[1]?.model).toBe(list.makeModel(state)[1]?.model)
    expect(list.makeModel(bumped)[0]?.model).not.toBe(list.makeModel(state)[0]?.model)
  })

  test("a child's model is let go with its state", async () => {
    const make = () =>
      Array.from({ length: 1_000 }, (_, id) => {
        const model = list.makeModel(stateOf(list, { ids: [id] }, { Rows: [[id, { ...counter.init.state }]] }))[0]
          ?.model
        return new WeakRef(model ?? {})
      })
    const released = make()
    const left = () => released.filter((model) => model.deref() !== undefined).length
    // A WeakRef keeps its target until the current job ends: a macrotask, unlike a microtask, ends it. A collection
    // can still find a few models in register or stack slots left by JIT-compiled code, which JSC scans
    // conservatively, for many jobs: of a thousand models, a cache that kept them would keep all.
    for (let collection = 0; collection < 10 && left() > 10; collection++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      collectGarbage()
    }
    expect(left()).toBeLessThanOrEqual(10)
  })

  test("the models of ids shown once each, under one shared state, do not pile up", () => {
    collectGarbage()
    const before = process.memoryUsage().heapUsed
    for (let id = 0; id < 50_000; id++) list.makeModel(rows(id))
    collectGarbage()
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(5_000_000)
  })

  // Lists A and B, each with counter 1 in the counter's initial state. The first state and each new one are drawn, as a
  // renderer does; each of the first `draws` draws increments A's counter, or B's on draw `bumpingB`. Returns the
  // models drawn, once the run has been interrupted.
  const nested = (draws: number, bumpingB?: number) =>
    Effect.suspend(() => {
      const seen: Array<ReturnType<typeof lists.makeModel>> = []
      const state = stateOf(lists, { ids: ["A", "B"] }, { Lists: [["A", rows(1)], ["B", rows(1)]] })
      const { app, run } = start({ ...lists, init: { state } })
      const done = Deferred.makeUnsafe<void>()
      const draw = () => {
        const model = app.model()
        seen.push(model)
        const index = seen.length - 1
        // Past `draws` too, as `script` stops: under an engine that tells it again, sending would loop in one call.
        if (index >= draws) {
          Deferred.doneUnsafe(done, Exit.void)
          return
        }
        const id = index === bumpingB ? "B" : "A"
        const counter = model.find((list) => list.id === id)?.rows[0]?.model
        if (counter !== undefined) forwardTo(forwardTo(app.dispatch, "Lists", id), "Rows", 1)(counter.increment)
      }
      app.subscribe(draw)
      draw()
      return Effect.raceFirst(run, Deferred.await(done)).pipe(Effect.as(seen))
    })

  test("in a run, a nested child that did not change keeps its model from one state to the next", async () => {
    const [first, second, third] = await Effect.runPromise(nested(2))
    expect(second?.[1]?.rows[0]?.model).toBe(first?.[1]?.rows[0]?.model)
    expect(third?.[1]?.rows[0]?.model).toBe(first?.[1]?.rows[0]?.model)
    expect(second?.[0]?.rows[0]?.model).not.toBe(first?.[0]?.rows[0]?.model)
    expect(third?.[0]?.rows[0]?.model.count).toBe(2)
  })

  test("a message from a model kept from an earlier state is applied", async () => {
    const seen = await Effect.runPromise(nested(2, 1))
    expect(seen[1]?.[1]?.rows[0]?.model).toBe(seen[0]?.[1]?.rows[0]?.model)
    expect(seen.map((model) => model[1]?.rows[0]?.model.count)).toEqual([0, 0, 1])
  })

  test("two runs of one program at once do not mix", async () => {
    const runs = await Effect.runPromise(Effect.all([nested(3), nested(3)], { concurrency: "unbounded" }))
    expect(runs.map((seen) => seen.map((model) => model[0]?.rows[0]?.model.count))).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3]
    ])
  })

  test("a child's commands come back to it, and its events reach the parent with its id", async () => {
    const saving = accepted(list.update({ _tag: "Rows", id: 2, message: CounterMessage.SaveClicked() })(rows(1, 2)))
    expect(saving.commands).toEqual([
      { _tag: "Rows", id: 2, instance: 2, command: CounterCommand.Save(counter.init.state) }
    ])
    const command = Opt.getOrThrow(Arr.head(saving.commands ?? []))
    const saved = await Effect.runPromise(list.runCommand(command))
    expect(saved).toEqual(Opt.some({ _tag: "Rows", id: 2, instance: 2, message: CounterMessage.Saved() }))
    const done = accepted(list.update(Opt.getOrThrow(saved))(saving.state)).state
    expect(done.own.ids).toEqual([1])
    expect(Arr.fromIterable(HashMap.keys(done.children.Rows))).toEqual([1])
  })

  test("the late message of a removed child is rejected", () => {
    expect(list.update({ _tag: "Rows", id: 3, message: CounterMessage.Increment() })(rows(1, 2))).toBe(reject)
  })

  test("each child listens under its name, its id and its instance, alone ones under their name and instance", () => {
    const Tickers = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const tickerList = Tickers.withChildren({
      Clock: Tickers.child(ticker),
      Tickers: Tickers.childById(ticker, { ids: (state) => state.ids })
    }).make({ init: { state: { ids: [7, 8] } }, makeModel: () => null })
    expect(tickerList.subscriptions(tickerList.init.state).map(keyText).sort()).toEqual([
      keyText({ _tag: "Clock", instance: 1, key: "ticks" }),
      keyText({ _tag: "Tickers", id: 7, instance: 2, key: "ticks" }),
      keyText({ _tag: "Tickers", id: 8, instance: 3, key: "ticks" })
    ])
  })

  test("a row where listening does not hold runs no subscription, and still takes its messages", () => {
    type Listening = Readonly<{ ids: ReadonlyArray<number>; listening: ReadonlyArray<number> }>
    const Tickers = program<{ state: Listening }>()
    const some = Tickers.withChildren({
      Tickers: Tickers.childById(ticker, {
        ids: (state) => state.ids,
        listening: (state, id) => state.listening.includes(id)
      })
    }).make({ init: { state: { ids: [7, 8], listening: [7] } }, makeModel: () => null })
    expect(some.subscriptions(some.init.state)).toEqual([{ _tag: "Tickers", id: 7, instance: 1, key: "ticks" }])
    expect(some.update({ _tag: "Tickers", id: 8, message: { _tag: "Tick" } })(some.init.state)).not.toBe(reject)
  })

  test("the model of a child at an id that is not there is a defect that names it and its id", () => {
    const asking = List.withChildren({ Rows: List.childById(counter, { ids: (state) => state.ids }) }).make({
      init: { state: { ids: [] } },
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: (_, children) => children.Rows(3)
    })
    const error = thrown(() => asking.makeModel(stateOf(asking, { ids: [1, 2] })))
    expect(error).toBeInstanceOf(CompositionDefect)
    expect(error).toMatchObject({
      _tag: "CompositionDefect",
      message: "The model of \"Rows\", which is not in this state",
      child: "Rows",
      id: 3
    })
  })

  // Rows of tickers; `calls` counts the calls of the ticker's `subscriptions`.
  const countedTickers = () => {
    const counted = { calls: 0 }
    const Tickers = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const tickers = Tickers.withChildren({
      Tickers: Tickers.childById({
        ...ticker,
        subscriptions: () => {
          counted.calls++
          return ["ticks" as const]
        }
      }, { ids: (state) => state.ids })
    }).make({ init: { state: { ids: [] } }, makeModel: () => null })
    return { counted, tickers }
  }

  test("a child's keys are kept while its instance is the same object, and made again for a new state", () => {
    const { counted, tickers } = countedTickers()
    const state = stateOf(tickers, { ids: [1, 2] })
    const first = tickers.subscriptions(state)
    const kept = tickers.subscriptions({ ...state })
    expect(counted.calls).toBe(2)
    // Only keys are listed: the lifted key is the object kept with the instance.
    const lifted = (all: typeof first, id: number) => Opt.getOrThrow(Arr.findFirst(all, (key) => key.id === id))
    expect(lifted(kept, 1)).toBe(lifted(first, 1))
    const ticked = accepted(tickers.update({ _tag: "Tickers", id: 2, message: { _tag: "Tick" } })(state)).state
    const changed = tickers.subscriptions(ticked)
    expect(counted.calls).toBe(3)
    expect(lifted(changed, 1)).toBe(lifted(first, 1))
    expect(lifted(changed, 2)).not.toBe(lifted(first, 2))
    expect(changed.length).toBe(2)
  })

  test("children that share one state object each listen with their own id and instance", () => {
    const { tickers } = countedTickers()
    const all = tickers.subscriptions(stateOf(tickers, { ids: [1, 2] }))
    const first = (id: number) =>
      Effect.runSync(Channel.runHead(tickers.listen(Opt.getOrThrow(Arr.findFirst(all, (key) => key.id === id)))))
    expect([first(1), first(2)]).toEqual([
      Opt.some({ _tag: "Tickers", id: 1, instance: 1, message: { _tag: "Tick" } }),
      Opt.some({ _tag: "Tickers", id: 2, instance: 2, message: { _tag: "Tick" } })
    ])
  })
})

// A row: it loads as it starts, from its label, listens, answers its parent, and asks to be left.
type RowState = Readonly<{ label: string; count: number }>
type RowMessage = Readonly<{ _tag: "Bumped" }> | Readonly<{ _tag: "Loaded"; value: number }>
type RowCommand = Readonly<{ _tag: "Load"; label: string }>
type RowEvent = Readonly<{ _tag: "Left" }>
// Dismissed, a row loads a last time, then asks to be left.
type RowExternal = Readonly<{ _tag: "Nudged" }> | Readonly<{ _tag: "Dismissed" }>

const bumps: Subscription<RowMessage, never> = Channel.fromEffect(Effect.succeed<RowMessage>({ _tag: "Bumped" })).pipe(
  Channel.concatWith(() => Channel.never)
)

const labelled = program<{
  state: RowState
  message: RowMessage
  command: RowCommand
  event: RowEvent
  external: RowExternal
  flags: string
  key: "bumps"
}>().make({
  init: (label) => ({ state: { label, count: 0 }, commands: [{ _tag: "Load", label }] }),
  update: (message) => (state) =>
    message._tag === "Bumped"
      ? { state: { ...state, count: state.count + 1 } }
      : { state: { ...state, count: message.value } },
  external: (message) => (state) =>
    message._tag === "Nudged"
      ? { state: { ...state, count: state.count + 10 } }
      : { state, commands: [{ _tag: "Load", label: state.label }], events: [{ _tag: "Left" }] },
  runCommand: () => Effect.succeedSome<RowMessage>({ _tag: "Loaded", value: 7 }),
  subscriptions: () => ["bumps" as const],
  listen: () => bumps,
  makeModel: (state) => state
})

// The same row, without flags: it starts with one label.
const loader: Program<{
  state: RowState
  model: RowState
  message: RowMessage
  command: RowCommand
  event: RowEvent
  external: RowExternal
  key: "bumps"
}> = { ...labelled, init: { state: { label: "one", count: 0 }, commands: [{ _tag: "Load", label: "one" }] } }

// Rows by id, each started from its label. What the parent does when a row asks to be left is in its own state.
type Listed = Readonly<{ id: number; label: string }>
type Rows = Readonly<{ rows: ReadonlyArray<Listed>; onLeft: "heard" | "dropAll" | "relabelAll"; quiet: boolean }>
type RowsMessage =
  | Readonly<{ _tag: "Added"; id: number; label: string }>
  | Readonly<{ _tag: "Removed"; id: number }>
  | Readonly<{ _tag: "Relabeled"; id: number; label: string }>
  | Readonly<{ _tag: "Replaced"; rows: ReadonlyArray<Listed> }>
  | Readonly<{ _tag: "DismissedAll"; onLeft: Rows["onLeft"] }>
  | Readonly<{ _tag: "ToldMissing" }>
  | Readonly<{ _tag: "AddedAndNudged"; id: number; label: string }>
  | Readonly<{ _tag: "Kept" }>
  | Readonly<{ _tag: "Quieted" }>
type RowsCommand = Readonly<{ _tag: "Heard"; id: number }>

const Rows = program<{ state: Rows; message: RowsMessage; command: RowsCommand }>()

// What it tells is written as a literal, with no `as const`: the children's external messages type it.
const rowList = Rows.withChildren({
  Row: Rows.childById(labelled, {
    flags: (state) => state.rows.map(({ id, label }) => [id, label] as const),
    listening: (state) => !state.quiet
  })
}).make({
  init: { state: { rows: [], onLeft: "heard", quiet: false } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "Added":
        return { state: { ...state, rows: [...state.rows, { id: message.id, label: message.label }] } }
      case "Removed":
        return { state: { ...state, rows: state.rows.filter((listed) => listed.id !== message.id) } }
      case "Relabeled":
        return {
          state: {
            ...state,
            rows: state.rows.map((listed) => listed.id === message.id ? { ...listed, label: message.label } : listed)
          }
        }
      case "Replaced":
        return { state: { ...state, rows: message.rows } }
      case "DismissedAll":
        return {
          state: { ...state, onLeft: message.onLeft },
          tell: state.rows.map(({ id }) => ({ _tag: "Row", id, message: { _tag: "Dismissed" } }))
        }
      case "ToldMissing":
        return { state, tell: [{ _tag: "Row", id: 99, message: { _tag: "Nudged" } }] }
      // The step lists a row and tells it at once: it is started before it is told.
      case "AddedAndNudged":
        return {
          state: { ...state, rows: [...state.rows, { id: message.id, label: message.label }] },
          tell: [{ _tag: "Row", id: message.id, message: { _tag: "Nudged" } }]
        }
      case "Kept":
        return { state }
      case "Quieted":
        return { state: { ...state, quiet: true } }
    }
  },
  onEvent: {
    Row: (id) => (state) => {
      switch (state.onLeft) {
        case "heard":
          return { state, commands: [{ _tag: "Heard", id }] }
        case "dropAll":
          return { state: { ...state, rows: [] } }
        case "relabelAll":
          return { state: { ...state, rows: state.rows.map((listed) => ({ ...listed, label: `${listed.label}'` })) } }
      }
    }
  },
  runCommand: () => Effect.succeedNone,
  makeModel: (state, children) => state.rows.map(({ id }) => children.Row(id))
})

type RowsState = StateOf<typeof rowList>
type RowsAll = MessageOf<typeof rowList>

const added = (id: number, label = "a"): RowsAll => ({ _tag: "Added", id, label })
const after = (...messages: ReadonlyArray<RowsAll>) => applyAll(rowList.update, messages, rowList.init.state)
const instanceAt = (state: RowsState, id: number) =>
  Opt.map(HashMap.get(state.children.Row, id), (kept) => kept.instance)
const countAt = (state: RowsState, id: number) =>
  Opt.map(HashMap.get(state.children.Row, id), (kept) => kept.state.count)
const loaded: RowMessage = { _tag: "Loaded", value: 7 }

// A row alone, there while open, and started again by another generation: its key is a struct made anew each time.
type Single = Readonly<{ open: boolean; generation: number; notes: number }>
type SingleMessage =
  | Readonly<{ _tag: "Opened" }>
  | Readonly<{ _tag: "Closed" }>
  | Readonly<{ _tag: "Renewed" }>
  | Readonly<{ _tag: "Noted" }>

const Single = program<{ state: Single; message: SingleMessage }>()

const single = Single.withChildren({
  One: Single.child(loader, { there: (state) => state.open, key: (state) => ({ generation: state.generation }) })
}).make({
  init: { state: { open: false, generation: 0, notes: 0 } },
  update: (message) => (state) => {
    switch (message._tag) {
      case "Opened":
        return state.open ? reject : { state: { ...state, open: true } }
      case "Closed":
        return state.open ? { state: { ...state, open: false } } : reject
      case "Renewed":
        return { state: { ...state, generation: state.generation + 1 } }
      case "Noted":
        return { state: { ...state, notes: state.notes + 1 } }
    }
  },
  onEvent: { One: () => (state) => ({ state }) },
  makeModel: (_, children) => children.One()
})

const singleAfter = (...tags: ReadonlyArray<SingleMessage["_tag"]>) =>
  applyAll(single.update, tags.map((_tag) => ({ _tag })), single.init.state)
const instanceOf = (state: StateOf<typeof single>) => Opt.map(state.children.One, (kept) => kept.instance)

describe("the instance of a child", () => {
  test("a child's commands carry the number of its start, and so do their answers", () => {
    const { state, commands } = after(added(1, "a"), added(2, "b"))
    expect(state.starts).toBe(2)
    expect(commands).toEqual([
      { _tag: "Row", id: 1, instance: 1, command: { _tag: "Load", label: "a" } },
      { _tag: "Row", id: 2, instance: 2, command: { _tag: "Load", label: "b" } }
    ])
    expect(Effect.runSync(rowList.runCommand(Opt.getOrThrow(Arr.get(commands, 1)))))
      .toEqual(Opt.some({ _tag: "Row", id: 2, instance: 2, message: loaded }))
  })

  test("an answer for a child alone closed and opened again is rejected, and one for the instance there applies", () => {
    const { state } = singleAfter("Opened", "Closed", "Opened")
    expect(instanceOf(state)).toEqual(Opt.some(2))
    expect(single.update({ _tag: "One", instance: 1, message: loaded })(state)).toBe(reject)
    const answered = accepted(single.update({ _tag: "One", instance: 2, message: loaded })(state)).state
    expect(stateAt(answered.children.One).count).toBe(7)
  })

  test("an answer for a child alone started again in one step by a new key is rejected", () => {
    const { state } = singleAfter("Opened", "Renewed")
    expect(instanceOf(state)).toEqual(Opt.some(2))
    expect(single.update({ _tag: "One", instance: 1, message: loaded })(state)).toBe(reject)
  })

  test("an answer for a child by id started again in one step by other flags is rejected", () => {
    const { state } = after(added(1, "a"), { _tag: "Relabeled", id: 1, label: "b" })
    expect(instanceAt(state, 1)).toEqual(Opt.some(2))
    expect(rowList.update({ _tag: "Row", id: 1, instance: 1, message: loaded })(state)).toBe(reject)
  })

  test("an answer for a child by id removed and listed again at its id is rejected", () => {
    const { state } = after(added(1), { _tag: "Removed", id: 1 }, added(1))
    expect(instanceAt(state, 1)).toEqual(Opt.some(2))
    expect(rowList.update({ _tag: "Row", id: 1, instance: 1, message: loaded })(state)).toBe(reject)
    const answered = accepted(rowList.update({ _tag: "Row", id: 1, instance: 2, message: loaded })(state)).state
    expect(countAt(answered, 1)).toEqual(Opt.some(7))
  })

  test("a message of a view names no instance, and reaches the instance there", () => {
    const { state } = singleAfter("Opened", "Closed", "Opened")
    const bumped = accepted(single.update({ _tag: "One", message: { _tag: "Bumped" } })(state)).state
    expect(stateAt(bumped.children.One).count).toBe(1)
    const row = after(added(1), { _tag: "Removed", id: 1 }, added(1), {
      _tag: "Row",
      id: 1,
      message: { _tag: "Bumped" }
    })
    expect(countAt(row.state, 1)).toEqual(Opt.some(1))
  })

  test("a subscription's message carries its instance, and is rejected once that instance is gone", () => {
    const first = after(added(1)).state
    const key = Opt.getOrThrow(Arr.head(rowList.subscriptions(first)))
    expect(key).toEqual({ _tag: "Row", id: 1, instance: 1, key: "bumps" })
    const lifted = rowList.listen(key)
    const message = Opt.getOrThrow(Effect.runSync(Channel.runHead(lifted)))
    expect(message).toEqual({ _tag: "Row", id: 1, instance: 1, message: { _tag: "Bumped" } })
    expect(rowList.update(message)(first)).not.toBe(reject)
    const again = applyAll(rowList.update, [{ _tag: "Removed", id: 1 }, added(1)], first).state
    expect(rowList.update(message)(again)).toBe(reject)
  })
})

describe("the children that the library keeps", () => {
  test("init starts each child its first state lists, with its first commands, by the order of the names as JavaScript gives the keys, then of the ids as listed", () => {
    const Started = program<{ state: Readonly<{ ids: ReadonlyArray<number> }>; command: "Boot" }>()
    const started = Started.withChildren({
      Second: Started.childById(loader, { ids: (state) => state.ids }),
      "01": Started.child(loader),
      First: Started.child(loader),
      "4294967295": Started.child(loader),
      "7": Started.child(loader),
      "-1": Started.child(loader),
      "2": Started.child(loader)
    }).make({
      init: { state: { ids: [3, 1] }, commands: ["Boot"] },
      onEvent: {
        Second: () => (state) => ({ state }),
        "01": () => (state) => ({ state }),
        First: () => (state) => ({ state }),
        "4294967295": () => (state) => ({ state }),
        "7": () => (state) => ({ state }),
        "-1": () => (state) => ({ state }),
        "2": () => (state) => ({ state })
      },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
    const load: RowCommand = { _tag: "Load", label: "one" }
    expect(started.init.commands).toEqual([
      "Boot",
      { _tag: "2", instance: 1, command: load },
      { _tag: "7", instance: 2, command: load },
      { _tag: "Second", id: 3, instance: 3, command: load },
      { _tag: "Second", id: 1, instance: 4, command: load },
      { _tag: "01", instance: 5, command: load },
      { _tag: "First", instance: 6, command: load },
      { _tag: "4294967295", instance: 7, command: load },
      { _tag: "-1", instance: 8, command: load }
    ])
    expect(started.init.state.starts).toBe(8)
  })

  test("a child that a step lists anew is started, with its first commands lifted with its number", () => {
    const before = after(added(1, "a")).state
    const { state, commands } = applyAll(rowList.update, [added(2, "b")], before)
    expect(HashMap.get(state.children.Row, 2)).toEqual(
      Opt.some({ instance: 2, key: "b", state: { label: "b", count: 0 } })
    )
    expect(commands).toEqual([{ _tag: "Row", id: 2, instance: 2, command: { _tag: "Load", label: "b" } }])
  })

  test("a child that the state no longer lists is dropped, and a message for it is rejected", () => {
    const { state } = after(added(1), { _tag: "Removed", id: 1 })
    expect(HashMap.size(state.children.Row)).toBe(0)
    expect(rowList.update({ _tag: "Row", id: 1, message: { _tag: "Bumped" } })(state)).toBe(reject)
    const closed = singleAfter("Opened", "Closed").state
    expect(Opt.isNone(closed.children.One)).toBe(true)
    expect(single.update({ _tag: "One", message: { _tag: "Bumped" } })(closed)).toBe(reject)
  })

  test("other flags start a child by id again, from them, in one step, under other keys", () => {
    const before = after(added(1, "a"), { _tag: "Row", id: 1, message: { _tag: "Bumped" } }).state
    const { state, commands } = applyAll(rowList.update, [{ _tag: "Relabeled", id: 1, label: "b" }], before)
    expect(instanceAt(state, 1)).toEqual(Opt.some(2))
    expect(countAt(state, 1)).toEqual(Opt.some(0))
    expect(commands).toEqual([{ _tag: "Row", id: 1, instance: 2, command: { _tag: "Load", label: "b" } }])
    expect(rowList.subscriptions(before)).toEqual([{ _tag: "Row", id: 1, instance: 1, key: "bumps" }])
    expect(rowList.subscriptions(state)).toEqual([{ _tag: "Row", id: 1, instance: 2, key: "bumps" }])
  })

  test("equal flags keep the child, and leave the very same children", () => {
    const before = after(added(1, "a"), { _tag: "Row", id: 1, message: { _tag: "Bumped" } }).state
    const { state } = applyAll(rowList.update, [{ _tag: "Relabeled", id: 1, label: "a" }], before)
    expect(state.own).not.toBe(before.own)
    expect(state.children).toBe(before.children)
  })

  test("flags equal by Equal, a struct made anew at each call, keep a child by id", () => {
    type Seeded = Readonly<{ seed: number }>
    const seeded = program<{ state: Seeded; flags: Readonly<{ seed: number }> }>().make({
      init: (flags) => ({ state: { seed: flags.seed } }),
      makeModel: (state) => state.seed
    })
    type Seeds = Readonly<{ ids: ReadonlyArray<number>; turn: number }>
    const Seeds = program<{ state: Seeds; message: Readonly<{ _tag: "Turned" }> }>()
    const seeds = Seeds.withChildren({
      Seeded: Seeds.childById(seeded, { flags: (state) => state.ids.map((id) => [id, { seed: id }] as const) })
    }).make({
      init: { state: { ids: [1, 2], turn: 0 } },
      update: () => (state) => ({ state: { ...state, turn: state.turn + 1 } }),
      makeModel: () => null
    })
    const { state } = applyAll(seeds.update, [{ _tag: "Turned" }], seeds.init.state)
    expect(state.own.turn).toBe(1)
    expect(state.starts).toBe(2)
    expect(state.children).toBe(seeds.init.state.children)
  })

  test("another key starts a child alone again, and a key equal by Equal, a struct made anew, keeps it", () => {
    const opened = singleAfter("Opened").state
    const noted = accepted(single.update({ _tag: "Noted" })(opened))
    expect(instanceOf(noted.state)).toEqual(Opt.some(1))
    expect(noted.state.children).toBe(opened.children)
    const renewed = accepted(single.update({ _tag: "Renewed" })(opened))
    expect(instanceOf(renewed.state)).toEqual(Opt.some(2))
    expect(renewed.commands).toEqual([{ _tag: "One", instance: 2, command: { _tag: "Load", label: "one" } }])
  })

  test("a step that removes an id and lists it again keeps the child, as its flags are the same", () => {
    const before = after(added(1, "a"), added(2, "b")).state
    const { state } = applyAll(rowList.update, [{
      _tag: "Replaced",
      rows: [{ id: 2, label: "b" }, { id: 1, label: "a" }]
    }], before)
    expect([instanceAt(state, 1), instanceAt(state, 2)]).toEqual([Opt.some(1), Opt.some(2)])
  })

  test("an id listed twice is a CompositionDefect, in update and in init", () => {
    const twice = compositionDefect({ message: "The children \"Row\" list the same id twice", child: "Row", id: 1 })
    expect(() => after(added(1), added(1))).toThrow(twice)
    const Twice = program<{ state: Readonly<{ ids: ReadonlyArray<number> }>; flags: number }>()
    const twiceAtStart = Twice.withChildren({ Row: Twice.childById(loader, { ids: (state) => state.ids }) }).make({
      init: (id) => ({ state: { ids: [id, id] } }),
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(() => twiceAtStart.init(1)).toThrow(twice)
    // A first step that is a value is taken as the parent is made.
    const Once = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const makeTwice = () =>
      Once.withChildren({ Row: Once.childById(loader, { ids: (state) => state.ids }) }).make({
        init: { state: { ids: [1, 1] } },
        onEvent: { Row: () => (state) => ({ state }) },
        makeModel: () => null
      })
    expect(makeTwice).toThrow(twice)
  })

  // A state written by hand that holds none of the children its own state lists shows what is reconciled: a
  // reconciliation would start the row again.
  test("children by id whose ids give the very same object are left as they are, and others are reconciled", () => {
    type Short = Readonly<{ ids: ReadonlyArray<number>; notes: number }>
    const Short = program<{ state: Short; message: "Noted" | "Relisted" }>()
    const short = Short.withChildren({ Row: Short.childById(loader, { ids: (state) => state.ids }) }).make({
      init: { state: { ids: [1], notes: 0 } },
      update: (message) => (state) =>
        message === "Noted"
          ? { state: { ...state, notes: state.notes + 1 } }
          : { state: { ...state, ids: [...state.ids] } },
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const bare: StateOf<typeof short> = { ...short.init.state, children: { Row: HashMap.empty() } }
    const noted = accepted(short.update("Noted")(bare)).state
    expect(noted.own.notes).toBe(1)
    expect(noted.children).toBe(bare.children)
    const relisted = accepted(short.update("Relisted")(bare)).state
    expect(Opt.map(HashMap.get(relisted.children.Row, 1), (kept) => kept.instance)).toEqual(Opt.some(2))
  })
})

describe("what a parent tells its children", () => {
  test("a child that the step lists anew is started before it is told", () => {
    const { state, commands } = after({ _tag: "AddedAndNudged", id: 1, label: "a" })
    expect(instanceAt(state, 1)).toEqual(Opt.some(1))
    expect(countAt(state, 1)).toEqual(Opt.some(10))
    expect(commands).toEqual([{ _tag: "Row", id: 1, instance: 1, command: { _tag: "Load", label: "a" } }])
  })

  test("children are told in order, each to its end: the events of one are handled before the next is told", () => {
    const before = after(added(1, "a"), added(2, "b")).state
    const { commands } = applyAll(rowList.update, [{ _tag: "DismissedAll", onLeft: "heard" }], before)
    expect(commands).toEqual([
      { _tag: "Row", id: 1, instance: 1, command: { _tag: "Load", label: "a" } },
      { _tag: "Heard", id: 1 },
      { _tag: "Row", id: 2, instance: 2, command: { _tag: "Load", label: "b" } },
      { _tag: "Heard", id: 2 }
    ])
  })

  test("telling a child that is not there once the step is reconciled is a CompositionDefect naming it and the message", () => {
    const error = thrown(() => after(added(1), { _tag: "ToldMissing" }))
    expect(error).toBeInstanceOf(CompositionDefect)
    expect(error).toMatchObject({
      _tag: "CompositionDefect",
      message: "The external message Nudged to \"Row\", which is not in this state",
      child: "Row",
      id: 99,
      on: "Nudged"
    })
  })

  test("a child that an earlier answer of the same step dropped is told nothing, and it is no defect", () => {
    // The first row answers with an event, whose handler drops every row: the second is gone when its turn comes.
    const before = after(added(1, "a"), added(2, "b")).state
    const { state, commands } = applyAll(rowList.update, [{ _tag: "DismissedAll", onLeft: "dropAll" }], before)
    expect(HashMap.size(state.children.Row)).toBe(0)
    expect(commands).toEqual([{ _tag: "Row", id: 1, instance: 1, command: { _tag: "Load", label: "a" } }])
  })

  test("a child that an earlier answer of the same step started again is told nothing", () => {
    // The first row's event relabels every row: both start again, and the second, another instance, is not told.
    const before = after(added(1, "a"), added(2, "b")).state
    const { state, commands } = applyAll(rowList.update, [{ _tag: "DismissedAll", onLeft: "relabelAll" }], before)
    expect([instanceAt(state, 1), instanceAt(state, 2)]).toEqual([Opt.some(3), Opt.some(4)])
    expect(commands).toEqual([
      { _tag: "Row", id: 1, instance: 1, command: { _tag: "Load", label: "a" } },
      { _tag: "Row", id: 1, instance: 3, command: { _tag: "Load", label: "a'" } },
      { _tag: "Row", id: 2, instance: 4, command: { _tag: "Load", label: "b'" } }
    ])
  })

  test("without listening every child listens, and with it those where it holds", () => {
    const listening = after(added(1), added(2)).state
    expect(rowList.subscriptions(listening).map(keyText).sort()).toEqual([
      keyText({ _tag: "Row", id: 1, instance: 1, key: "bumps" }),
      keyText({ _tag: "Row", id: 2, instance: 2, key: "bumps" })
    ])
    expect(rowList.subscriptions(applyAll(rowList.update, [{ _tag: "Quieted" }], listening).state))
      .toEqual([])
  })
})

describe("what a declaration tells its children", () => {
  type Heard = Readonly<{ heard: ReadonlyArray<string> }>
  type Said = Readonly<{ _tag: "Cond"; value: string }> | Readonly<{ _tag: "Poke" }>
  // A child that keeps what it was told, in order. Told "b", it raises an event, and told "x", it runs a command.
  const hearing = program<{
    state: Heard
    message: "Bump"
    external: Said
    event: "Bounced"
    command: "First" | "Answered"
  }>().make({
    init: { state: { heard: [] }, commands: ["First"] },
    update: () => () => reject,
    external: (message) => (state): Step<Heard, "First" | "Answered", "Bounced"> => {
      const value = message._tag === "Cond" ? message.value : "poke"
      return {
        state: { heard: [...state.heard, value] },
        ...(value === "b" ? { events: ["Bounced"] } : {}),
        ...(value === "x" ? { commands: ["Answered"] } : {})
      }
    },
    runCommand: () => Effect.die("not run"),
    makeModel: (state) => state
  })
  type Own = Readonly<{ condition: string; ids: ReadonlyArray<number>; bounces: number }>
  type Message =
    | Readonly<{ _tag: "Set"; condition: string }>
    | Readonly<{ _tag: "Added"; id: number }>
    | Readonly<{ _tag: "SetAndPoke"; condition: string; id: number }>
    | Readonly<{ _tag: "Touched" }>
  const Telling = program<{ state: Own; message: Message }>()
  const parent = (first: Own, onBounce: (state: Own) => Own = (state) => state) =>
    Telling.withChildren({
      Kid: Telling.childById(hearing, {
        ids: (state) => state.ids,
        // A new object at each call: what was told is compared by value.
        tell: (state) => ({ _tag: "Cond", value: state.condition })
      })
    }).make({
      init: { state: first },
      update: (message) => (state) => {
        switch (message._tag) {
          case "Set":
            return { state: { ...state, condition: message.condition } }
          case "Added":
            return { state: { ...state, ids: [...state.ids, message.id] } }
          case "SetAndPoke":
            return {
              state: { ...state, condition: message.condition },
              tell: [{ _tag: "Kid", id: message.id, message: { _tag: "Poke" } }]
            }
          case "Touched":
            return { state: { ...state } }
        }
      },
      onEvent: { Kid: () => (state) => ({ state: { ...onBounce(state), bounces: state.bounces + 1 } }) },
      makeModel: (state, children) => state.ids.map((id) => children.Kid(id).heard)
    })
  const start: Own = { condition: "a", ids: [1, 2], bounces: 0 }
  const heard = (state: { readonly children: { readonly Kid: HashMap.HashMap<number, Instance<Heard>> } }) =>
    [...HashMap.entries(state.children.Kid)].sort(([a], [b]) => a - b).map(([, kept]) => kept.state.heard)

  test("the children of the first state are told as they start, after the first commands of every child", () => {
    const app = parent({ ...start, condition: "x" })
    expect(heard(app.init.state)).toEqual([["x"], ["x"]])
    expect(app.init.commands).toEqual([
      { _tag: "Kid", id: 1, instance: 1, command: "First" },
      { _tag: "Kid", id: 2, instance: 2, command: "First" },
      { _tag: "Kid", id: 1, instance: 1, command: "Answered" },
      { _tag: "Kid", id: 2, instance: 2, command: "Answered" }
    ])
  })

  test("a child that starts later is told as it starts, and the others are told nothing", () => {
    const app = parent(start)
    const { state } = accepted(app.update({ _tag: "Added", id: 3 })(app.init.state))
    expect(heard(state)).toEqual([["a"], ["a"], ["a"]])
  })

  test("a step that changes the value tells every child, and one that keeps it tells none", () => {
    const app = parent(start)
    const { state: changed } = accepted(app.update({ _tag: "Set", condition: "c" })(app.init.state))
    expect(heard(changed)).toEqual([["a", "c"], ["a", "c"]])
    // Another own state, and an equal value in another object.
    const { state: touched } = accepted(app.update({ _tag: "Touched" })(changed))
    expect(heard(touched)).toEqual([["a", "c"], ["a", "c"]])
    expect(touched.children).toBe(changed.children)
  })

  test("what the declaration tells is told before what the step lists in tell", () => {
    const app = parent(start)
    const { state } = accepted(app.update({ _tag: "SetAndPoke", condition: "c", id: 2 })(app.init.state))
    expect(heard(state)).toEqual([["a", "c"], ["a", "c", "poke"]])
  })

  test("what a step lists in tell is bound first: a child that an answer to the declaration dropped is told nothing", () => {
    // The first child, told "b", bounces, and the parent drops the second, which the step tells.
    const app = parent(start, (state) => state.condition === "b" ? { ...state, ids: [1] } : state)
    const { state } = accepted(app.update({ _tag: "SetAndPoke", condition: "b", id: 2 })(app.init.state))
    expect(state.own.ids).toEqual([1])
    expect(heard(state)).toEqual([["a", "b"]])
  })

  test("a child whose answer makes the parent change the value again: each child ends with the last one", () => {
    // The first child, told "b", bounces, and the parent goes to "c" at once.
    const app = parent(start, (state) => state.condition === "b" ? { ...state, condition: "c" } : state)
    const { state } = accepted(app.update({ _tag: "Set", condition: "b" })(app.init.state))
    expect(state.own).toEqual({ condition: "c", ids: [1, 2], bounces: 1 })
    // The second child is told "c" once, and never "b", which no longer held at its turn.
    expect(heard(state)).toEqual([["a", "b", "c"], ["a", "c"]])
  })

  test("a child whose answer makes the parent go back to the value of before: the others are told nothing", () => {
    const app = parent(start, (state) => state.condition === "b" ? { ...state, condition: "a" } : state)
    const { state } = accepted(app.update({ _tag: "Set", condition: "b" })(app.init.state))
    expect(heard(state)).toEqual([["a", "b", "a"], ["a"]])
  })

  test("a child that raises an event as the program starts has it handled, in the first step", () => {
    const app = parent({ ...start, condition: "b" })
    expect(app.init.state.own.bounces).toBe(2)
    expect(heard(app.init.state)).toEqual([["b"], ["b"]])
  })

  test("a child alone is told as it starts, and again when it starts again", () => {
    type Alone = Readonly<{ open: Opt.Option<number>; condition: string }>
    const Alone = program<{ state: Alone; message: "Opened" | "Reopened" }>()
    const app = Alone.withChildren({
      Kid: Alone.child(hearing, {
        there: (state) => Opt.isSome(state.open),
        key: (state) => state.open,
        tell: (state) => ({ _tag: "Cond", value: state.condition })
      })
    }).make({
      init: { state: { open: Opt.none(), condition: "a" } },
      update: (message) => (state) => ({ state: { ...state, open: Opt.some(message === "Opened" ? 1 : 2) } }),
      onEvent: { Kid: () => (state) => ({ state }) },
      makeModel: (_, children) => children.Kid()
    })
    const opened = accepted(app.update("Opened")(app.init.state))
    expect(app.makeModel(opened.state)).toEqual(Opt.some({ heard: ["a"] }))
    const again = accepted(app.update("Reopened")(opened.state))
    expect(app.makeModel(again.state)).toEqual(Opt.some({ heard: ["a"] }))
    expect(again.commands).toEqual([{ _tag: "Kid", instance: 2, command: "First" }])
  })

  test("a name whose value is equal, and that started no child, costs two calls of its tell, whatever another name started", () => {
    type Both = Readonly<{ condition: string; ids: ReadonlyArray<number>; others: ReadonlyArray<number> }>
    const Both = program<{ state: Both; message: "OtherAdded" | "Touched" }>()
    let calls = 0
    let reads = 0
    const app = Both.withChildren({
      Kid: Both.childById(hearing, {
        ids: (state) => {
          reads += 1
          return state.ids
        },
        tell: (state) => {
          calls += 1
          return { _tag: "Cond", value: state.condition }
        }
      }),
      Other: Both.childById(hearing, { ids: (state) => state.others, tell: () => ({ _tag: "Poke" }) })
    }).make({
      init: { state: { condition: "a", ids: [1, 2, 3], others: [] } },
      update: (message) => (state) =>
        message === "Touched"
          ? { state: { ...state } }
          : { state: { ...state, others: [...state.others, state.others.length + 1] } },
      onEvent: { Kid: () => (state) => ({ state }), Other: () => (state) => ({ state }) },
      makeModel: () => null
    })
    // What a step that starts no child costs the name: its children are not read one by one.
    const cost = (message: "OtherAdded" | "Touched") => {
      calls = 0
      reads = 0
      const { state } = accepted(app.update(message)(app.init.state))
      return { calls, reads, others: HashMap.size(state.children.Other) }
    }
    const touched = cost("Touched")
    expect(touched).toEqual({ calls: 2, reads: touched.reads, others: 0 })
    expect(cost("OtherAdded")).toEqual({ ...touched, others: 1 })
  })

  test("a handler that raises an event of the parent's own as the program starts is a CompositionDefect naming the child", () => {
    const Raising = program<{ state: Own; event: "Up"; flags: string }>()
    const raising = (state: Own) =>
      Raising.withChildren({
        Kid: Raising.childById(hearing, {
          ids: (state) => state.ids,
          tell: (state) => ({ _tag: "Cond", value: state.condition })
        })
      }).make({
        init: (condition) => ({ state: { ...state, condition } }),
        onEvent: { Kid: () => (state) => ({ state, events: ["Up"] }) },
        makeModel: () => null
      })
    const expected = {
      _tag: "CompositionDefect",
      message: "The parent raised the event Up for \"Kid\" as the program starts, where no step takes events",
      child: "Kid",
      id: 1,
      on: "Up"
    }
    const error = thrown(() => startOf(raising(start).init, "b"))
    expect(error).toBeInstanceOf(CompositionDefect)
    expect(error).toMatchObject(expected)
    // The same, where a step of its own parent starts it: the defect is of that step.
    const Outer = program<{ state: Readonly<{ open: boolean }>; message: "Opened"; event: "Up" }>()
    const outer = Outer.withChildren({
      Inner: Outer.child(raising(start), { flags: (state) => state.open ? Opt.some("b") : Opt.none() })
    }).make({
      init: { state: { open: false } },
      update: () => () => ({ state: { open: true } }),
      onEvent: { Inner: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null
    })
    expect(thrown(() => outer.update("Opened")(outer.init.state))).toMatchObject(expected)
    // A value that raises nothing starts.
    expect(heard(startOf(raising(start).init, "a").state as never)).toEqual([["a"], ["a"]])
  })

  test("stateOf tells the children it starts, and a state given for one replaces what it was told into", () => {
    const app = parent(start)
    const state = stateOf(app, { condition: "c", ids: [1, 2], bounces: 0 }, { Kid: [[2, { heard: ["given"] }]] })
    expect(heard(state)).toEqual([["c"], ["given"]])
    // The child whose state was given counts as told: a step that keeps the value tells it nothing.
    expect(heard(accepted(app.update({ _tag: "Touched" })(state)).state)).toEqual([["c"], ["given"]])
  })

  test("stateOf refuses a handler that gives another own state, and one that raises an event of the parent's own", () => {
    const app = parent(start)
    expect(() => stateOf(app, { condition: "b", ids: [1], bounces: 0 })).toThrow(
      "stateOf: a handler of onEvent gives another own state, in answer to what a child is told"
    )
    const Raising = program<{ state: Own; event: "Up" }>()
    const raising = Raising.withChildren({
      Kid: Raising.childById(hearing, {
        ids: (state) => state.ids,
        tell: (state) => ({ _tag: "Cond", value: state.condition })
      })
    }).make({
      init: { state: start },
      onEvent: { Kid: () => (state) => ({ state, events: ["Up"] }) },
      makeModel: () => null
    })
    expect(thrown(() => stateOf(raising, { condition: "b", ids: [1], bounces: 0 }))).toBeInstanceOf(CompositionDefect)
  })
})

describe("what a declaration tells its children, over random histories", () => {
  // Each child, a child alone and children by id, answers what it is told with an event, and each event makes its
  // parent take the next reaction of a script in its own state: change the value, add, drop or start again a child.
  type Heard = Readonly<{ heard: ReadonlyArray<string> }>
  type Cond = Readonly<{ _tag: "Cond"; value: string }>
  const hearing = program<{ state: Heard; message: "Ping"; external: Cond; event: "Heard"; flags: number }>().make({
    init: () => ({ state: { heard: [] } }),
    update: () => (state) => ({ state, events: ["Heard"] }),
    external: (message) => (state) => ({ state: { heard: [...state.heard, message.value] }, events: ["Heard"] }),
    makeModel: (state) => state.heard
  })
  type Reaction =
    | Readonly<{ _tag: "Set"; value: number }>
    | Readonly<{ _tag: "Add"; id: number }>
    | Readonly<{ _tag: "Drop"; id: number }>
    | Readonly<{ _tag: "Restart"; id: number }>
    | Readonly<{ _tag: "Solo" }>
    | Readonly<{ _tag: "SoloOff" }>
  type Own = Readonly<{
    value: number
    // Each id with its generation, its flags: another starts it again.
    kids: ReadonlyArray<readonly [number, number]>
    solo: Opt.Option<number>
    script: ReadonlyArray<Reaction>
  }>
  type Message =
    | Readonly<{ _tag: "Do"; reaction: Reaction }>
    | Readonly<{ _tag: "Queued"; reactions: ReadonlyArray<Reaction> }>
  const react = (reaction: Reaction) => (state: Own): Own => {
    switch (reaction._tag) {
      case "Set":
        return { ...state, value: reaction.value }
      case "Add":
        return Arr.some(state.kids, ([id]) => id === reaction.id)
          ? state
          : { ...state, kids: [...state.kids, [reaction.id, 0] as const] }
      case "Drop":
        return { ...state, kids: Arr.filter(state.kids, ([id]) => id !== reaction.id) }
      case "Restart":
        return {
          ...state,
          kids: Arr.map(state.kids, ([id, flags]) => [id, id === reaction.id ? flags + 1 : flags] as const)
        }
      case "Solo":
        return { ...state, solo: Opt.some(Opt.getOrElse(Opt.map(state.solo, (flags) => flags + 1), () => 0)) }
      case "SoloOff":
        return { ...state, solo: Opt.none() }
    }
  }
  const next = (state: Own): Step<Own> =>
    Arr.match(state.script, {
      onEmpty: () => ({ state }),
      onNonEmpty: ([reaction, ...script]) => ({ state: react(reaction)({ ...state, script }) })
    })
  const kidValue = (state: Own) => `k${state.value}`
  const soloValue = (state: Own) => state.value >= 1 ? "high" : "low"
  const Scripted = program<{ state: Own; message: Message; flags: Own }>()
  const scripted = Scripted.withChildren({
    Kid: Scripted.childById(hearing, {
      flags: (state) => state.kids,
      tell: (state) => ({ _tag: "Cond", value: kidValue(state) })
    }),
    Solo: Scripted.child(hearing, {
      flags: (state) => state.solo,
      tell: (state) => ({ _tag: "Cond", value: soloValue(state) })
    })
  }).make({
    init: (state) => ({ state }),
    update: (message) => (state) =>
      message._tag === "Do"
        ? { state: react(message.reaction)(state) }
        : { state: { ...state, script: [...state.script, ...message.reactions] } },
    onEvent: { Kid: () => next, Solo: () => next },
    makeModel: () => null
  })
  const id = fc.integer({ min: 1, max: 4 })
  const reaction: fc.Arbitrary<Reaction> = fc.oneof(
    fc.integer({ min: 0, max: 2 }).map((value) => ({ _tag: "Set", value }) as const),
    id.map((id) => ({ _tag: "Add", id }) as const),
    id.map((id) => ({ _tag: "Drop", id }) as const),
    id.map((id) => ({ _tag: "Restart", id }) as const),
    fc.constant({ _tag: "Solo" } as const),
    fc.constant({ _tag: "SoloOff" } as const)
  )
  const script = fc.array(reaction, { maxLength: 6 })
  const first: fc.Arbitrary<Own> = fc.record({
    value: fc.integer({ min: 0, max: 2 }),
    kids: fc.uniqueArray(id, { maxLength: 4 }).map(Arr.map((id) => [id, 0] as const)),
    solo: fc.boolean().map((there) => there ? Opt.some(0) : Opt.none()),
    script
  })
  const message: fc.Arbitrary<MessageOf<typeof scripted>> = fc.oneof(
    reaction.map((reaction) => ({ _tag: "Do", reaction }) as const),
    script.map((reactions) => ({ _tag: "Queued", reactions }) as const),
    id.map((id) => ({ _tag: "Kid", id, message: "Ping" }) as const),
    fc.constant({ _tag: "Solo", message: "Ping" } as const)
  )
  // Every child was last told what the own state gives, and never one value twice in a row.
  const agrees = (state: StateOf<typeof scripted>) => {
    const told = (heard: ReadonlyArray<string>, value: string) => {
      expect(heard.at(-1)).toBe(value)
      expect(Arr.filter(heard, (said, at) => at > 0 && heard[at - 1] === said)).toEqual([])
    }
    const ascending = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b)
    expect(ascending(HashMap.keys(state.children.Kid))).toEqual(ascending(Arr.map(state.own.kids, ([id]) => id)))
    for (const kept of HashMap.values(state.children.Kid)) told(kept.state.heard, kidValue(state.own))
    expect(Opt.isSome(state.children.Solo)).toBe(Opt.isSome(state.own.solo))
    for (const kept of Opt.toArray(state.children.Solo)) told(kept.state.heard, soloValue(state.own))
  }

  test("every child was last told what its parent's state gives, and never one value twice in a row", () => {
    fc.assert(
      fc.property(first, fc.array(message, { maxLength: 20 }), (flags, messages) => {
        let state = startOf(scripted.init, flags).state
        agrees(state)
        for (const message of messages) {
          const result = scripted.update(message)(state)
          if (result !== reject) state = result.state
          agrees(state)
        }
      }),
      { numRuns: 300 }
    )
  })
})

describe("what a parent reads of its children", () => {
  // A lamp that its button flips, telling its parent, and that its parent may flip: whether it is on is its output.
  type Lamp = Readonly<{ on: boolean }>
  type Flip = Readonly<{ _tag: "Flip" }>
  const flip: Flip = { _tag: "Flip" }
  const lamp = program<{ state: Lamp; message: "Pressed"; event: "Flipped"; external: Flip; output: boolean }>()
    .make({
      init: { state: { on: false } },
      update: () => (state) => ({ state: { on: !state.on }, events: ["Flipped"] }),
      external: () => (state) => ({ state: { on: !state.on } }),
      output: (state) => state.on,
      makeModel: (state) => (state.on ? "on" : "off")
    })
  // A room that writes down what it reads of its lamps, and counts those that are on.
  type Room = Readonly<{ seen: ReadonlyArray<unknown>; lamps: ReadonlyArray<number>; desk: boolean }>
  const Room = program<{ state: Room; message: "Looked" | "FlipCeiling"; external: "Looked"; output: number }>()
  const room = Room.withChildren({
    Ceiling: Room.child(lamp),
    Desk: Room.child(lamp, { there: (state) => state.desk }),
    Wall: Room.childById(lamp, { ids: (state) => state.lamps })
  }).make({
    init: { state: { seen: [], lamps: [1, 2], desk: false } },
    update: (message, children) => (state) => {
      const seen = [
        children.Ceiling.output(),
        children.Desk.output(),
        ...state.lamps.map((id) => children.Wall.output(id))
      ]
      return message === "Looked"
        ? { state: { ...state, seen } }
        : { state: { ...state, seen }, tell: [{ _tag: "Ceiling", message: flip }] }
    },
    external: (_, children) => (state) => ({ state: { ...state, seen: [children.Ceiling.output()] } }),
    onEvent: {
      Ceiling: (_, children) => (state) => ({ state: { ...state, seen: [children.Ceiling.output()] } }),
      Desk: () => (state) => ({ state }),
      Wall: (id, _, children) => (state) => ({ state: { ...state, seen: [id, children.Wall.output(id)] } })
    },
    output: (state, children) =>
      [children.Ceiling.output(), ...Opt.toArray(children.Desk.output()), ...state.lamps.map(children.Wall.output)]
        .filter((on) => on).length,
    makeModel: (state, children) => ({
      ceiling: { model: children.Ceiling(), on: children.Ceiling.output() },
      desk: children.Desk.output(),
      wall: state.lamps.map((id) => children.Wall.output(id))
    })
  })
  const lit = stateOf(room, { seen: [], lamps: [1, 2], desk: true }, {
    Ceiling: { on: true },
    Wall: [[2, { on: true }]]
  })

  test("update reads the outputs of the children as they were before its step", () => {
    const { state } = accepted(room.update("FlipCeiling")(lit))
    expect(state.own.seen).toEqual([true, Opt.some(false), false, true])
    expect(stateAt(state.children.Ceiling)).toEqual({ on: false })
    expect(accepted(room.external("Looked")(lit)).state.own.seen).toEqual([true])
  })

  test("a handler of onEvent reads the outputs as the child's step left them", () => {
    const off = stateOf(room, { seen: [], lamps: [1, 2], desk: false })
    expect(accepted(room.update({ _tag: "Ceiling", message: "Pressed" })(off)).state.own.seen).toEqual([true])
    expect(accepted(room.update({ _tag: "Wall", id: 2, message: "Pressed" })(off)).state.own.seen).toEqual([2, true])
  })

  test("a handler of onEvent reads the outputs as the earlier handlers of the step, with what they told, left them", () => {
    // A switch whose press raises two events: the handler of the first flips the lamp, and that of the second reads it.
    const toggle = program<{ state: object; message: "Pressed"; event: "Told" | "Looked" }>().make({
      init: { state: {} },
      update: () => (state) => ({ state, events: ["Told", "Looked"] }),
      makeModel: () => null
    })
    const Hall = program<{ state: Readonly<{ seen: ReadonlyArray<boolean> }> }>()
    const hall = Hall.withChildren({ Lamp: Hall.child(lamp), Toggle: Hall.child(toggle) }).make({
      init: { state: { seen: [] } },
      onEvent: {
        Lamp: () => (state) => ({ state }),
        Toggle: (event, children) => (state) =>
          event === "Told"
            ? { state, tell: [{ _tag: "Lamp", message: flip }] }
            : { state: { seen: [...state.seen, children.Lamp.output()] } }
      },
      makeModel: () => null
    })
    const { state } = accepted(hall.update({ _tag: "Toggle", message: "Pressed" })(hall.init.state))
    expect(state.own.seen).toEqual([true])
  })

  test("an output is read as a model is: a value, an Option for a child that may not be there, by id", () => {
    expect(room.makeModel(lit)).toEqual({
      ceiling: { model: "on", on: true },
      desk: Opt.some(false),
      wall: [false, true]
    })
    expect(room.makeModel(room.init.state).desk).toEqual(Opt.none())
    expect(room.output(lit)).toBe(2)
    expect(room.output(room.init.state)).toBe(0)
  })

  test("a parent's output is read by its own parent", () => {
    const House = program<{ state: object }>()
    const house = House.withChildren({ Room: House.child(room) }).make({
      init: { state: {} },
      makeModel: (_, children) => children.Room.output()
    })
    expect(house.makeModel(stateOf(house, {}, { Room: lit }))).toBe(2)
  })

  test("the output of a child at an id that is not there is a defect that names it and its id", () => {
    const Peek = program<{ state: object; message: "Peeked" }>()
    const peek = Peek.withChildren({ Wall: Peek.childById(lamp, { ids: () => [1] }) }).make({
      init: { state: {} },
      update: (_, children) => (state) => (children.Wall.output(9) ? { state } : reject),
      onEvent: { Wall: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const error = thrown(() => peek.update("Peeked")(peek.init.state))
    expect(error).toBeInstanceOf(CompositionDefect)
    expect(error).toMatchObject({ child: "Wall", id: 9, message: "The output of \"Wall\", which is not in this state" })
  })

  test("a parent reads only the outputs its children declare, and no model, outside makeModel", () => {
    const Reading = program<{ state: object; message: "Go" }>()
    const reading = Reading.withChildren({ Lamp: Reading.child(lamp), Counter: Reading.child(counter) }).make({
      init: { state: {} },
      update: (_, children) => (state) => {
        expectTypeOf(children.Lamp.output).toEqualTypeOf<() => boolean>()
        // @ts-expect-error: the counter declares no output.
        void children.Counter
        // @ts-expect-error: a child's model is for the view, and is read in `makeModel` alone.
        void children.Lamp()
        return { state }
      },
      onEvent: { Lamp: () => (state) => ({ state }), Counter: () => (state) => ({ state }) },
      makeModel: (_, children) => {
        // @ts-expect-error: the counter declares no output.
        void children.Counter.output
        return children.Lamp.output()
      }
    })
    expectTypeOf<ModelOf<typeof reading>>().toEqualTypeOf<boolean>()
  })

  test("a program has an output exactly when it names one, and one without children reads none", () => {
    expectTypeOf<OutputOf<typeof lamp>>().toEqualTypeOf<boolean>()
    expectTypeOf<OutputOf<typeof room>>().toEqualTypeOf<number>()
    expectTypeOf<OutputOf<typeof counter>>().toEqualTypeOf<never>()
    // @ts-expect-error: an output named is given.
    program<{ state: Lamp; output: boolean }>().make({ init: { state: { on: false } }, makeModel: () => null })
    program<{ state: Lamp }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: an output not named is not given.
      output: (state) => state.on,
      makeModel: () => null
    })
    // @ts-expect-error: a program typed with an output has one.
    const unread: Program<{ state: Lamp; model: null; message: never; output: boolean }> = {
      init: { state: { on: false } },
      update: () => () => reject,
      subscriptions: () => [],
      makeModel: () => null
    }
    program<{ state: Lamp; message: "Pressed" }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: a program without children has no outputs to read.
      update: (_, children) => (state) => ({ state: children === undefined ? state : state }),
      makeModel: () => null
    })
    expect(unread.makeModel(unread.init.state)).toBeNull()
  })
})

describe("the very same objects", () => {
  test("a step that changes nothing leaves the very same state", () => {
    const before = after(added(1)).state
    expect(accepted(rowList.update({ _tag: "Kept" })(before)).state).toBe(before)
  })

  test("a child's step leaves its parent's own state, and the other instances, the very same objects", () => {
    const before = after(added(1), added(2)).state
    const { state } = applyAll(rowList.update, [{ _tag: "Row", id: 2, message: { _tag: "Bumped" } }], before)
    expect(state.own).toBe(before.own)
    expect(Opt.getOrThrow(HashMap.get(state.children.Row, 1))).toBe(Opt.getOrThrow(HashMap.get(before.children.Row, 1)))
    expect(rowList.makeModel(state)[0]).toBe(rowList.makeModel(before)[0])
    expect(rowList.makeModel(state)[1]).not.toBe(rowList.makeModel(before)[1])
  })
})

describe("stateOf", () => {
  test("it makes the state that init makes from the same own state", () => {
    expect(stateOf(app, app.init.state.own)).toEqual(app.init.state)
    const Started = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const started = Started.withChildren({
      Row: Started.childById(labelled, { flags: (state) => state.ids.map((id) => [id, `${id}`] as const) })
    }).make({
      init: { state: { ids: [2, 1] } },
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(stateOf(started, started.init.state.own)).toEqual(started.init.state)
  })

  test("it puts each child in the state given, and the others as they start", () => {
    const own: Rows = { rows: [{ id: 5, label: "e" }, { id: 6, label: "f" }], onLeft: "heard", quiet: false }
    const state = stateOf(rowList, own, { Row: [[6, { label: "f", count: 3 }]] })
    expect(rowList.makeModel(state)).toEqual([{ label: "e", count: 0 }, { label: "f", count: 3 }])
    expect([instanceAt(state, 5), instanceAt(state, 6)]).toEqual([Opt.some(1), Opt.some(2)])
  })

  test("it throws for a state of a child that the own state does not list, and for a program without children", () => {
    const own: Rows = { rows: [], onLeft: "heard", quiet: false }
    expect(() => stateOf(rowList, own, { Row: [[6, { label: "f", count: 3 }]] })).toThrow(
      "stateOf: a state for \"Row\", which the parent's state does not list"
    )
    expect(() => stateOf(single, { open: false, generation: 0, notes: 0 }, { One: loader.init.state })).toThrow()
    // A program without children has no whole state: its state is its own.
    const alone = program<{ state: Ticks }>().make({ init: { state: noTicks }, makeModel: () => null })
    expect(() => stateOf(alone as never, noTicks)).toThrow("stateOf: a program without children")
  })

  test("it nests, for a parent of parents", () => {
    const state = stateOf(lists, { ids: ["A"] }, {
      Lists: [["A", stateOf(list, { ids: [1] }, { Rows: [[1, { ...counter.init.state, count: 4 }]] })]]
    })
    expect(lists.makeModel(state).map(({ rows }) => rows.map(({ model }) => model.count))).toEqual([[4]])
  })
})

describe("what a parent can do with a child", () => {
  // A page with a menu, which a back button closes, or, with nothing to close, asks its parent to leave.
  type Page = Readonly<{ menu: boolean }>
  type BackPressed = Readonly<{ _tag: "BackPressed" }>
  // Its view and its parent both send back: two entries, one function.
  const back = () => (state: Page) =>
    state.menu ? { state: { menu: false } } : { state, events: [{ _tag: "LeaveRequested" as const }] }
  const page: Program<{
    state: Page
    model: null
    message: BackPressed
    event: Readonly<{ _tag: "LeaveRequested" }>
    external: BackPressed
  }> = {
    init: { state: { menu: true } },
    update: back,
    external: back,
    subscriptions: () => [],
    makeModel: () => null
  }
  type Pages = Readonly<{ page: boolean }>
  const Pages = program<{ state: Pages; message: BackPressed }>()
  const pages = Pages.withChildren({ Page: Pages.child(page, { there: (state) => state.page }) }).make({
    init: { state: { page: true } },
    update: (message) => (state) => ({ state, tell: [{ _tag: "Page", message }] }),
    onEvent: { Page: () => () => ({ state: { page: false } }) },
    makeModel: () => null
  })
  const pressed = (state: StateOf<typeof pages>) => accepted(pages.update({ _tag: "BackPressed" })(state)).state

  test("a child answers its parent with its state or an event, handled in the same step", () => {
    const once = pressed(pages.init.state)
    expect(stateAt(once.children.Page)).toEqual({ menu: false })
    const twice = pressed(once)
    expect(twice.own).toEqual({ page: false })
    expect(Opt.isNone(twice.children.Page)).toBe(true)
  })

  test("a parent tells from onEvent too: one child's event clears another, in the same step", () => {
    const Both = program<{ state: object }>()
    const both = Both.withChildren({ Page: Both.child(page), Left: Both.child(counter) }).make({
      init: { state: {} },
      onEvent: {
        Page: () => (state) => ({ state, tell: [{ _tag: "Left", message: cleared }] }),
        Left: () => (state) => ({ state })
      },
      makeModel: () => null
    })
    const at = stateOf(both, {}, { Page: { menu: false }, Left: { ...counter.init.state, count: 3 } })
    const result = accepted(both.update({ _tag: "Page", message: { _tag: "BackPressed" } })(at))
    expect(stateAt(result.state.children.Left)).toEqual({ ...counter.init.state, count: 0 })
    expect([result.commands, result.events]).toEqual([[], []])
  })

  test("a child's external never rejects, and telling a child that is not there is a defect", () => {
    // @ts-expect-error: an external message applies in every state.
    const rejecting: typeof page = { ...page, external: () => (state) => state.menu ? { state } : reject }
    expect(() => pages.update({ _tag: "BackPressed" })(stateOf(pages, { page: false })))
      .toThrow("The external message BackPressed to \"Page\", which is not in this state")
    expect(rejecting.update).toBe(page.update)
  })

  test("a child written as an object is checked as a program is: its external answers with a step, its output reads its state, and it asks for what it returns", () => {
    const base = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      subscriptions: () => [],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const rejecting = { ...base, external: (_: BackPressed) => (state: Ticks) => state.ticks > 0 ? { state } : reject }
    const saving = { ...base, external: (_: BackPressed) => (state: Ticks) => ({ state, commands: ["Save" as const] }) }
    const leaving = { ...base, external: (_: BackPressed) => (state: Ticks) => ({ state, events: ["Left" as const] }) }
    const { child, childById, withChildren } = program<{ state: Ticks }>()
    const ids = { ids: (): ReadonlyArray<number> => [] }
    // @ts-expect-error: an external message applies in every state.
    expect(child(rejecting)).toBeDefined()
    // @ts-expect-error: for children by id too.
    expect(childById(rejecting, ids)).toBeDefined()
    // @ts-expect-error: the commands of its external need a `runCommand`, as those of its update do.
    expect(child(saving)).toBeDefined()
    // @ts-expect-error: for children by id too.
    expect(childById(saving, ids)).toBeDefined()
    // @ts-expect-error: and the events of its external need an `onEvent` of its parent.
    const unheard = withChildren({ Leaving: child(leaving) }).make({ init: { state: noTicks }, makeModel: () => null })
    // @ts-expect-error: an object that is no program is no child.
    expect(child({ ...base, subscriptions: "none", makeModel: 42 })).toBeDefined()
    // @ts-expect-error: its output reads its own state, as `Program<…>` asks.
    expect(child({ ...base, output: (other: Readonly<{ other: string }>) => other.other.length })).toBeDefined()
    // @ts-expect-error: for children by id too.
    expect(childById({ ...base, output: (other: Readonly<{ other: string }>) => other.other.length }, ids))
      .toBeDefined()
    const read: [CommandOf<typeof saving>, EventOf<typeof leaving>] = ["Save", "Left"]
    const heard = withChildren({
      Saving: child({ ...saving, runCommand: () => Effect.succeedNone }),
      Leaving: child(leaving)
    }).make({
      init: { state: noTicks },
      onEvent: { Leaving: (left) => (state) => ({ state: { ticks: state.ticks + left.length } }) },
      makeModel: () => null
    })
    const lifted: CommandOf<typeof heard> = { _tag: "Saving", instance: 1, command: "Save" }
    // A child written in the call is checked alike, and its empty set lists no key.
    const inline = [
      child({ ...base, init: { state: noTicks }, subscriptions: () => [] }),
      childById({ ...base, init: { state: noTicks }, subscriptions: () => [] }, ids),
      child({
        init: { state: noTicks, commands: ["Save" as const] },
        update: (_: Tick) => (state: Ticks) => ({ state }),
        runCommand: () => Effect.succeedNone,
        subscriptions: () => [],
        makeModel: () => null
      })
    ]
    expect([unheard, read, lifted, inline]).toHaveLength(4)
  })

  test("a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on", () => {
    const alone = thrown(() => pages.update({ _tag: "BackPressed" })(stateOf(pages, { page: false })))
    expect(alone).toBeInstanceOf(CompositionDefect)
    expect(alone).toMatchObject({ _tag: "CompositionDefect", child: "Page", on: "BackPressed" })
    expect(Object.hasOwn(alone as object, "id")).toBe(false)
    const Clearable = program<{ state: ListState; message: Reset }>()
    const telling = Clearable.withChildren({ Rows: Clearable.childById(counter, { ids: (state) => state.ids }) }).make({
      init: { state: { ids: [] } },
      update: () => (state) => ({ state, tell: [{ _tag: "Rows", id: 7, message: cleared }] }),
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(thrown(() => telling.update({ _tag: "Reset" })(telling.init.state)))
      .toMatchObject({ _tag: "CompositionDefect", child: "Rows", id: 7, on: "Cleared" })
    const raising = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state, events: [{ _tag: "Beeped" }] }),
      subscriptions: () => [],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const Unheard = program<{ state: Ticks }>()
    // @ts-expect-error: the types ask for an `onEvent` already; this one runs without.
    const unheard = Unheard.withChildren({ Beeper: Unheard.child(raising) }).make({
      init: { state: noTicks },
      makeModel: () => null
    })
    expect(thrown(() => unheard.update({ _tag: "Beeper", message: { _tag: "Tick" } })(unheard.init.state)))
      .toMatchObject({ _tag: "CompositionDefect", child: "Beeper", on: "Beeped" })
  })

  test("a child's command that nothing interprets is a CompositionDefect naming the child", () => {
    const saving = {
      init: { state: noTicks, commands: [{ _tag: "Save" as const }] },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      subscriptions: () => [],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const One = program<{ state: Ticks }>()
    const one = One.withChildren({
      // @ts-expect-error: a child with commands and no `runCommand` does not compile; this one runs without.
      Saving: One.child(saving)
    }).make({ init: { state: noTicks }, makeModel: () => null })
    expect(one.init.commands).toEqual([{ _tag: "Saving", instance: 1, command: { _tag: "Save" } }])
    expect(thrown(() => one.runCommand(Opt.getOrThrow(Arr.head(one.init.commands ?? [])))))
      .toMatchObject({ _tag: "CompositionDefect", child: "Saving", on: "Save" })
    const List = program<{ state: ListState }>()
    const list = List.withChildren({
      // @ts-expect-error: likewise for children by id.
      Rows: List.childById(saving, { ids: (state) => state.ids })
    }).make({ init: { state: { ids: [0] } }, makeModel: () => null })
    expect(thrown(() => list.runCommand(Opt.getOrThrow(Arr.head(list.init.commands ?? [])))))
      .toMatchObject({ _tag: "CompositionDefect", child: "Rows", id: 0, on: "Save" })
  })

  test("a child's key that nothing listens to is a CompositionDefect naming the child", () => {
    const deaf = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      subscriptions: () => ["ticks" as const],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const One = program<{ state: Ticks }>()
    const one = One.withChildren({
      // @ts-expect-error: a child with keys and no `listen` does not compile; this one runs without.
      Ticker: One.child(deaf)
    }).make({ init: { state: noTicks }, makeModel: () => null })
    const keys = one.subscriptions(one.init.state)
    expect(keys).toEqual([{ _tag: "Ticker", instance: 1, key: "ticks" }])
    expect(thrown(() => one.listen(Opt.getOrThrow(Arr.head(keys))))).toMatchObject({
      _tag: "CompositionDefect",
      child: "Ticker"
    })
    const List = program<{ state: ListState }>()
    const list = List.withChildren({
      // @ts-expect-error: likewise for children by id.
      Rows: List.childById(deaf, { ids: (state) => state.ids })
    }).make({ init: { state: { ids: [0] } }, makeModel: () => null })
    // The ids of a child that does not compile read back as `never`.
    const rows: ReadonlyArray<unknown> = list.subscriptions(list.init.state)
    expect(rows).toEqual([{ _tag: "Rows", id: 0, instance: 1, key: "ticks" }])
    expect(thrown(() => list.listen(Opt.getOrThrow(Arr.head(rows)) as never))).toMatchObject({
      _tag: "CompositionDefect",
      child: "Rows",
      id: 0
    })
  })

  // A child's key is listed under its name, as its command is: an own key that could take that name is refused.
  test("an own subscription key that may take the name of a child does not compile, never a silent replacement", () => {
    type Clash = Readonly<{ _tag: "Ticker"; instance: number; key: "ticks" }>
    const { child, withChildren } = program<{ state: Ticks; message: Tick; key: Clash }>()
    // @ts-expect-error: an own key takes the name of a child.
    const clashing = withChildren({ Ticker: child(ticker) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => Array.from<Clash>([{ _tag: "Ticker", instance: 1, key: "ticks" }]),
      listen: () => ticks,
      makeModel: () => null
    })
    // A key as wide as a string may be a child's name too.
    const wide = program<{ state: Ticks; message: Tick; key: Readonly<{ _tag: string }> }>()
    // @ts-expect-error: an own key whose tag is any string may take the name of a child.
    wide.withChildren({ Ticker: wide.child(ticker) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => [{ _tag: "Clock" }],
      listen: () => ticks,
      makeModel: () => null
    })
    // An own key of another name, or a plain string, is the parent's own.
    const own = program<{ state: Ticks; message: Tick; key: "ticks" | Readonly<{ _tag: "Clock" }> }>()
    const apart = own.withChildren({ Ticker: own.child(ticker) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => Array.from<"ticks" | Readonly<{ _tag: "Clock" }>>(["ticks", { _tag: "Clock" }]),
      listen: () => ticks,
      makeModel: () => null
    })
    expect(clashing).toBeDefined()
    expect(apart.subscriptions(apart.init.state).map(keyText).sort()).toEqual([
      keyText("ticks"),
      keyText({ _tag: "Clock" }),
      keyText({ _tag: "Ticker", instance: 1, key: "ticks" })
    ])
  })
})

describe("steps that add up", () => {
  test("andThen takes the second state, and keeps both steps' commands and events in order", () => {
    const step: Step<Ticks, "Save" | "Load", "Saved" | "Loaded"> = andThen(
      { state: { ticks: 1 }, commands: ["Save"], events: ["Saved"] },
      ({ ticks }) => ({ state: { ticks: ticks + 1 }, commands: ["Load"], events: ["Loaded"] })
    )
    expect(step).toEqual({ state: { ticks: 2 }, commands: ["Save", "Load"], events: ["Saved", "Loaded"] })
    expect(andThen({ state: noTicks }, (state) => ({ state }))).toEqual({ state: noTicks, commands: [], events: [] })
  })

  test("andThen with the step last, in a pipe, adds up as with the step first", () => {
    const next = ({ ticks }: Ticks): Step<Ticks, "Load"> => ({ state: { ticks: ticks * 10 }, commands: ["Load"] })
    const first: Step<Ticks, "Save"> = { state: { ticks: 1 }, commands: ["Save"] }
    expect(pipe(first, andThen(next), andThen(next))).toEqual(andThen(andThen(first, next), next))
  })

  test("in a pipe, a first step without commands or events has the types of the steps after it", () => {
    const load = ({ ticks }: Ticks): Step<Ticks, "Load", "Loaded"> => ({
      state: { ticks: ticks + 1 },
      commands: ["Load"],
      events: ["Loaded"]
    })
    const step: Step<Ticks, "Load", "Loaded"> = pipe({ state: noTicks }, andThen(load), andThen(load))
    expect(step.commands).toEqual(["Load", "Load"])
    const saved: Step<Ticks, "Save"> = { state: noTicks, commands: ["Save"] }
    // @ts-expect-error: the first step's commands are kept in the result's type.
    expect(pipe(saved, andThen(load)) satisfies Step<Ticks, "Load", "Loaded">).toEqual(andThen(saved, load))
  })

  test("steps that list no commands and no events add up to a step of a program that has none", () => {
    // Outside an `update`, no context names the commands or the events: a step that lists none has none.
    const bump = (state: Ticks) => andThen({ state }, ({ ticks }) => ({ state: { ticks: ticks + 1 } }))
    const last = (state: Ticks) => pipe({ state }, andThen(({ ticks }: Ticks) => ({ state: { ticks: ticks * 2 } })))
    const update: Update<Ticks, "Bump" | "Last"> = (message) => (state) =>
      message === "Bump" ? bump(state) : last(state)
    expect(update("Bump")(noTicks)).toEqual({ state: { ticks: 1 }, commands: [], events: [] })
    expect(update("Last")({ ticks: 2 })).toEqual({ state: { ticks: 4 }, commands: [], events: [] })
  })

  test("the type of what andThen gives has both lists", () => {
    const first: Step<Ticks, "Save"> = { state: noTicks, commands: ["Save"] }
    const next = (state: Ticks): Step<Ticks, never, "Saved"> => ({ state, events: ["Saved"] })
    expectTypeOf(andThen(first, next)).toEqualTypeOf<Folded<Ticks, "Save", "Saved">>()
    expectTypeOf(pipe(first, andThen(next))).toEqualTypeOf<Folded<Ticks, "Save", "Saved">>()
    expect(andThen(first, next).commands.length + andThen(first, next).events.length).toBe(2)
  })

  test("andThen folds what is told, in order, and has a tell only where a step has one", () => {
    type Told = Readonly<{ _tag: "Row"; id: number; message: External }>
    const one: Told = { _tag: "Row", id: 1, message: cleared }
    const two: Told = { _tag: "Row", id: 2, message: cleared }
    const first: Step<Ticks, never, never, Told> = { state: noTicks, tell: [one] }
    const next = (state: Ticks): Step<Ticks, never, never, Told> => ({ state, tell: [two] })
    expect(andThen(first, next)).toEqual({ state: noTicks, commands: [], events: [], tell: [one, two] })
    expect(pipe(first, andThen(next), andThen(next)).tell).toEqual([one, two, two])
    expect(andThen({ state: noTicks }, next).tell).toEqual([two])
    expect(andThen(first, (state) => ({ state })).tell).toEqual([one])
    expect(Object.hasOwn(andThen({ state: noTicks }, (state) => ({ state })), "tell")).toBe(false)
    expectTypeOf(andThen(first, next)).toEqualTypeOf<Folded<Ticks, never, never, Told>>()
    expectTypeOf(pipe(first, andThen(next))).toEqualTypeOf<Folded<Ticks, never, never, Told>>()
  })

  test("a parent that tells each of its children by id the same thing reaches every one", () => {
    const Clearing = program<{ state: ListState; message: Reset }>()
    const clearing = Clearing.withChildren({ Rows: Clearing.childById(counter, { ids: (state) => state.ids }) }).make({
      init: { state: { ids: [] } },
      update: () => (state) => ({ state, tell: state.ids.map((id) => ({ _tag: "Rows", id, message: cleared })) }),
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const counted = (count: number) => ({ ...counter.init.state, count })
    const at = stateOf(clearing, { ids: [1, 2] }, { Rows: [[1, counted(4)], [2, counted(7)]] })
    const result = accepted(clearing.update({ _tag: "Reset" })(at))
    expect(Arr.fromIterable(HashMap.values(result.state.children.Rows)).map((kept) => kept.state.count))
      .toEqual([0, 0])
    expect([result.commands, result.events]).toEqual([[], []])
  })

  // A page that, left, forgets what it held and says so; a home that has nothing to say about it, and no message of
  // its own; an app that counts its resets, and remembers how many it had counted when it heard a page was left.
  type Leave = Readonly<{ _tag: "Leave" }>
  type Left = Readonly<{ _tag: "Left" }>
  const leave = () => () => ({
    state: { left: true },
    commands: ["Forget" as const],
    events: [{ _tag: "Left" as const }]
  })
  const leaving: Program<{
    state: Readonly<{ left: boolean }>
    model: null
    message: Leave
    command: "Forget"
    event: Left
    external: Leave
  }> = {
    init: { state: { left: false } },
    update: leave,
    external: leave,
    runCommand: () => Effect.succeedNone,
    subscriptions: () => [],
    makeModel: () => null
  }
  const Home = program<{ state: object; event: Left; external: Leave }>()
  const home = Home.withChildren({ Page: Home.child(leaving) }).make({
    init: { state: {} },
    // A parent passes an external message on, from its own `external`.
    external: (message) => (state) => ({ state, tell: [{ _tag: "Page", message }] }),
    onEvent: { Page: (event) => (state) => ({ state, events: [event] }) },
    makeModel: () => null
  })
  type App = Readonly<{ heard: ReadonlyArray<number>; resets: number }>
  const App = program<{ state: App; message: Reset }>()
  const grand = App.withChildren({ Home: App.child(home) }).make({
    init: { state: { heard: [], resets: 0 } },
    update: () => (state) =>
      andThen(
        { state: { ...state, resets: state.resets + 1 } },
        (state) => ({ state, tell: [{ _tag: "Home", message: { _tag: "Leave" } }] })
      ),
    onEvent: { Home: () => (state) => ({ state: { ...state, heard: [...state.heard, state.resets] } }) },
    makeModel: () => null
  })
  const pageOf = (state: StateOf<typeof grand>) => stateAt(stateAt(state.children.Home).children.Page)

  test("an event its parent raises reaches the grandparent in the same step, after the parent's", () => {
    const result = accepted(
      grand.update({ _tag: "Home", message: { _tag: "Page", message: { _tag: "Leave" } } })(grand.init.state)
    )
    expect(result.state.own).toEqual({ heard: [0], resets: 0 })
    expect(pageOf(result.state)).toEqual({ left: true })
    expect(result.commands).toEqual([
      { _tag: "Home", instance: 1, command: { _tag: "Page", instance: 1, command: "Forget" } }
    ])
    expect(result.events).toEqual([])
  })

  test("a parent's own step, then one that tells a child, keeps the parent's state and both steps' effects", () => {
    const result = accepted(grand.update({ _tag: "Reset" })(grand.init.state))
    // The child is told once the parent's state is the step's: the event is heard after the reset.
    expect(result.state.own).toEqual({ heard: [1], resets: 1 })
    expect(pageOf(result.state)).toEqual({ left: true })
    expect(result.commands).toEqual([
      { _tag: "Home", instance: 1, command: { _tag: "Page", instance: 1, command: "Forget" } }
    ])
  })
})

describe("flags", () => {
  // A counter that starts from the count it is given, and saves it at once.
  const seeded: Program<{
    state: Counter
    model: CounterModel
    message: CounterMessage
    command: CounterCommand
    event: CounterEvent
    external: External
    flags: number
  }> = {
    ...counter,
    init: (count) => ({ state: { count, text: "", saving: true }, commands: [CounterCommand.Save({ count })] })
  }

  type Seeds = Readonly<{ seed: Opt.Option<number>; rows: ReadonlyArray<readonly [number, number]> }>
  type Seed = Readonly<{ _tag: "Seed"; count: number }>
  const Seeds = program<{ state: Seeds; message: Seed }>()
  const seeds = Seeds.withChildren({
    Seeded: Seeds.child(seeded, { flags: (state) => state.seed }),
    Rows: Seeds.childById(seeded, { flags: (state) => state.rows })
  }).make({
    init: { state: { seed: Opt.none(), rows: [] } },
    update: ({ count }) => () => ({ state: { seed: Opt.some(count), rows: [[7, count + 1]] } }),
    onEvent: { Seeded: () => (state) => ({ state }), Rows: () => (state) => ({ state }) },
    makeModel: () => null
  })

  test("a child with flags starts from the flags its parent's state gives it, its commands lifted", () => {
    const result = accepted(seeds.update({ _tag: "Seed", count: 3 })(seeds.init.state))
    expect(stateAt(result.state.children.Seeded)).toEqual({ count: 3, text: "", saving: true })
    expect(HashMap.get(result.state.children.Rows, 7)).toEqual(
      Opt.some({ instance: 2, key: 4, state: { count: 4, text: "", saving: true } })
    )
    expect(result.commands).toEqual([
      { _tag: "Seeded", instance: 1, command: CounterCommand.Save({ count: 3 }) },
      { _tag: "Rows", id: 7, instance: 2, command: CounterCommand.Save({ count: 4 }) }
    ])
  })

  // A parent with flags: it starts its counter from twice its own.
  const Relay = program<{ state: Readonly<{ count: number }>; flags: number }>()
  const relay = Relay.withChildren({ Inner: Relay.child(seeded, { flags: (state) => Opt.some(state.count * 2) }) })
    .make({
      init: (count) => ({ state: { count } }),
      onEvent: { Inner: () => (state) => ({ state }) },
      makeModel: () => null
    })

  test("a parent with flags makes its first step from them, and its children start from its state", () => {
    const flags: FlagsOf<typeof relay> = 2
    const { state, commands } = relay.init(flags)
    expect(state.own).toEqual({ count: 2 })
    expect(stateAt(state.children.Inner)).toEqual({ count: 4, text: "", saving: true })
    expect(commands).toEqual([{ _tag: "Inner", instance: 1, command: CounterCommand.Save({ count: 4 }) }])
  })

  test("a parent with flags is started from them by its own parent, alone and by id", () => {
    const Top = program<{ state: object }>()
    const top = Top.withChildren({
      Relay: Top.child(relay, { flags: () => Opt.some(1) }),
      Rows: Top.childById(relay, { flags: (): ReadonlyArray<readonly [number, number]> => [[9, 5]] })
    }).make({ init: { state: {} }, makeModel: () => null })
    expect(stateAt(top.init.state.children.Relay).own).toEqual({ count: 1 })
    expect(Opt.map(HashMap.get(top.init.state.children.Rows, 9), (kept) => kept.state.own)).toEqual(
      Opt.some({ count: 5 })
    )
    expect(top.init.commands).toEqual([
      {
        _tag: "Relay",
        instance: 1,
        command: { _tag: "Inner", instance: 1, command: CounterCommand.Save({ count: 2 }) }
      },
      {
        _tag: "Rows",
        id: 9,
        instance: 2,
        command: { _tag: "Inner", instance: 1, command: CounterCommand.Save({ count: 10 }) }
      }
    ])
  })

  test("a parent with flags returns the function of them, and one without its first step", () => {
    const inner = { Inner: Relay.child(seeded, { flags: (state) => Opt.some(state.count) }) }
    Relay.withChildren(inner).make({
      // @ts-expect-error: its first step depends on its flags.
      init: { state: { count: 0 } },
      onEvent: { Inner: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const Pair = program<{ state: Ticks }>()
    Pair.withChildren({ Ticker: Pair.child(ticker) }).make({
      // @ts-expect-error: it has no flags to start from.
      init: (ticks: number) => ({ state: { ticks } }),
      makeModel: () => null
    })
  })

  test("a program without children starts from its first step, or from the function of its flags", () => {
    const { make } = program<{ state: Ticks }>()
    const still = make({ init: { state: { ticks: 1 } }, makeModel: (state) => state.ticks })
    expect(still.init).toEqual({ state: { ticks: 1 } })
    const counted = program<{ state: Counter; flags: number }>().make({
      init: (count) => ({ state: { ...counter.init.state, count } }),
      makeModel: () => null
    })
    expect(counted.init(3)).toEqual({ state: { ...counter.init.state, count: 3 } })
    // @ts-expect-error: its first step depends on its flags.
    program<{ state: Counter; flags: number }>().make({ init: { state: counter.init.state }, makeModel: () => null })
    // @ts-expect-error: it has no flags to start from.
    make({ init: (ticks: number) => ({ state: { ticks } }), makeModel: () => null })
    // @ts-expect-error: nor from nothing: a first step without flags is a value.
    make({ init: () => ({ state: { ticks: 1 } }), makeModel: () => null })
  })

  test("a child without flags is declared without them", () => {
    const { child, childById } = program<{ state: Ticks }>()
    // @ts-expect-error: its first step is a value, started from nothing.
    expect(child(ticker, { flags: () => Opt.some(1) })).toBeDefined()
    // @ts-expect-error: by id too.
    expect(childById(ticker, { flags: (): ReadonlyArray<readonly [number, number]> => [[1, 1]] })).toBeDefined()
    // A place that is no literal: its fields are not checked as fields too many.
    const place = { there: () => true, flags: () => Opt.some(1) }
    // @ts-expect-error: nor where it is sometimes there, however its place is written.
    expect(child(ticker, place)).toBeDefined()
  })

  test("a child with flags is declared with them", () => {
    const { child, childById } = program<{ state: Ticks }>()
    // @ts-expect-error: it would start without them.
    expect(child(seeded)).toBeDefined()
    // @ts-expect-error: nor where it is sometimes there.
    expect(child(seeded, { there: () => true })).toBeDefined()
    // @ts-expect-error: nor with a place that gives none.
    expect(child(seeded, { listening: () => true })).toBeDefined()
    // @ts-expect-error: by id neither.
    expect(childById(seeded, { ids: (): ReadonlyArray<number> => [1] })).toBeDefined()
    // @ts-expect-error: nor with a place that lists neither ids nor flags.
    expect(childById(seeded, { listening: () => true })).toBeDefined()
    // A child without flags is listed by its ids alone.
    // @ts-expect-error: it has no flags to start from.
    expect(childById(ticker, { flags: (): ReadonlyArray<readonly [number, number]> => [[1, 1]] })).toBeDefined()
    // `listening` takes the id that `ids` gives, inferred from it.
    expectTypeOf(childById(ticker, { ids: (state) => (state.ticks > 0 ? [1] : []), listening: (_, id) => id > 0 }))
      .toEqualTypeOf<ChildById<Ticks, number, typeof ticker>>()
  })

  test("the functions of a child's place take the parent's state, without annotations", () => {
    type Shown = Readonly<{ open: boolean; generation: number; seed: Opt.Option<number> }>
    const { child } = program<{ state: Shown }>()
    expectTypeOf(child(ticker, { there: (state) => state.open, key: (state) => state.generation }))
      .toEqualTypeOf<Child<Shown, typeof ticker, "sometimes">>()
    expectTypeOf(child(seeded, { flags: (state) => state.seed, listening: (state) => state.open }))
      .toEqualTypeOf<Child<Shown, typeof seeded, "sometimes">>()
  })
})

// The probe of `docs/records/kept-children.md`: a form whose save waits, under a parent that closes it and opens it
// again, or starts it again by another key, while the save waits. The answer of the form before is rejected, and the
// form after, which saves nothing, never hears it: it would die of its own `defect`.
describe("a child started again while its command waits", () => {
  type Form = Readonly<{ saving: boolean }>
  type FormMessage = Readonly<{ _tag: "SaveClicked" }> | Readonly<{ _tag: "SaveSucceeded" }>
  // As `examples/form` has it: a save completes only while saving, and anywhere else it is a bug.
  const formOf = (save: Execution<FormMessage>) =>
    program<{ state: Form; message: FormMessage; command: "Save" }>().make({
      init: { state: { saving: false } },
      update: (message) => (state) =>
        message._tag === "SaveClicked"
          ? state.saving ? reject : { state: { saving: true }, commands: ["Save"] }
          : state.saving
          ? { state: { saving: false } }
          : defect("A save completed while nothing was saving"),
      runCommand: () => save,
      makeModel: (state) => state
    })
  type Shown = Readonly<{ open: boolean; generation: number }>
  type Toggle = Readonly<{ _tag: "Opened" }> | Readonly<{ _tag: "Closed" }> | Readonly<{ _tag: "Renewed" }>
  const pageOf = (form: ReturnType<typeof formOf>) => {
    const { child, withChildren } = program<{ state: Shown; message: Toggle }>()
    // There while open, under the generation as its key: another generation, another form, in one step.
    return withChildren({ Form: child(form, { there: (state) => state.open, key: (state) => state.generation }) })
      .make({
        init: { state: { open: false, generation: 0 } },
        update: (message) => (state) => {
          switch (message._tag) {
            case "Opened":
              return state.open ? reject : { state: { ...state, open: true } }
            case "Closed":
              return state.open ? { state: { ...state, open: false } } : reject
            case "Renewed":
              return { state: { ...state, generation: state.generation + 1 } }
          }
        },
        makeModel: (_, children) => children.Form()
      })
  }

  const probe = Effect.fnUntraced(function*(between: ReadonlyArray<Toggle>) {
    const began = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const heard = yield* Deferred.make<void>()
    const save = Effect.andThen(Deferred.succeed(began, undefined), Deferred.await(release)).pipe(
      Effect.as(Opt.some<FormMessage>({ _tag: "SaveSucceeded" }))
    )
    const page = pageOf(formOf(save))
    const ignored: Array<Ignored<StateOf<typeof page>, MessageOf<typeof page>>> = []
    const { app, run } = start(page, {
      onIgnored: (entry) => {
        ignored.push(entry)
        Deferred.doneUnsafe(heard, Exit.void)
        return undefined
      }
    })
    const fiber = yield* Effect.forkChild(run)
    app.dispatch({ _tag: "Opened" })
    app.dispatch({ _tag: "Form", message: { _tag: "SaveClicked" } })
    yield* Deferred.await(began)
    for (const message of between) app.dispatch(message)
    yield* Deferred.succeed(release, undefined)
    // The answer of the save is heard, rejected: had it reached the form there, the run would die, and the race would
    // end with it.
    const exit = yield* Effect.raceFirst(Effect.exit(Fiber.join(fiber)), Effect.as(Deferred.await(heard), "heard"))
    yield* Fiber.interrupt(fiber)
    return { exit, ignored, model: app.model() }
  })

  const late: MessageOf<ReturnType<typeof pageOf>> = { _tag: "Form", instance: 1, message: { _tag: "SaveSucceeded" } }

  test("closed, then opened again: the answer of the form before is rejected, and the run goes on", async () => {
    const { exit, ignored, model } = await Effect.runPromise(probe([{ _tag: "Closed" }, { _tag: "Opened" }]))
    expect(exit).toBe("heard")
    expect(ignored.map(({ message, origin }) => ({ message, origin }))).toEqual([
      { message: late, origin: { _tag: "Command" } }
    ])
    expect(model).toEqual(Opt.some({ saving: false }))
  })

  test("started again in one step, by its key: the answer of the form before is rejected", async () => {
    const { exit, ignored, model } = await Effect.runPromise(probe([{ _tag: "Renewed" }]))
    expect(exit).toBe("heard")
    expect(ignored.map(({ message, origin }) => ({ message, origin }))).toEqual([
      { message: late, origin: { _tag: "Command" } }
    ])
    expect(model).toEqual(Opt.some({ saving: false }))
  })
})

describe("a state that is any value", () => {
  // A program whose state is a number: each `Increment` adds one.
  type Increment = "Increment"
  const counting = program<{ state: number; message: Increment }>().make({
    init: { state: 0 },
    update: () => (count) => ({ state: count + 1 }),
    makeModel: (count) => count
  })

  /** Runs a program started, sends `messages`, and gives the first model drawn that `done` holds of. */
  const drawnUntil = <Model, Message>(
    { app, run }: Started<Model, Message>,
    messages: ReadonlyArray<Message>,
    done: (model: Model) => boolean
  ): Promise<Model> => {
    const found = Deferred.makeUnsafe<Model>()
    const draw = () => {
      const model = app.model()
      if (done(model)) Deferred.doneUnsafe(found, Exit.succeed(model))
    }
    app.subscribe(draw)
    for (const message of messages) app.dispatch(message)
    return Effect.runPromise(Effect.raceFirst(run, Deferred.await(found)))
  }

  test("a program whose state is a number runs alone", async () => {
    expect(await drawnUntil(start(counting), ["Increment", "Increment"], (count) => count === 2)).toBe(2)
  })

  test("a program whose state is a number runs as a child", async () => {
    const Holder = program<{ state: Readonly<{ label: string }> }>()
    const holding = Holder.withChildren({ Count: Holder.child(counting) }).make({
      init: { state: { label: "count" } },
      makeModel: (state, children) => ({ label: state.label, count: children.Count() })
    })
    const message = { _tag: "Count", message: "Increment" } as const
    const model = await drawnUntil(start(holding), [message, message], ({ count }) => count === 2)
    expect(model).toEqual({ label: "count", count: 2 })
  })

  test("a program whose state is a number runs by id", async () => {
    const Holder = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const holding = Holder.withChildren({ Counts: Holder.childById(counting, { ids: (state) => state.ids }) }).make({
      init: { state: { ids: [1, 2] } },
      makeModel: (state, children) => state.ids.map((id) => children.Counts(id))
    })
    const message = { _tag: "Counts", id: 2, message: "Increment" } as const
    const model = await drawnUntil(start(holding), [message, message], (counts) => counts[1] === 2)
    expect(model).toEqual([0, 2])
  })

  test("a program's state is any value, however it is written", () => {
    const written = {
      init: { state: 0 },
      update: () => (count: number) => ({ state: count + 1 }),
      subscriptions: () => [],
      makeModel: (count: number) => count
    }
    const typed: Program<{ state: number; model: number; message: Tick }> = written
    const named = program<{ state: string }>().make({ init: { state: "" }, makeModel: (text) => text })
    const { child, childById } = program<{ state: Ticks }>()
    expect(child(written)).toBeDefined()
    expect(childById(written, { ids: (): ReadonlyArray<number> => [] })).toBeDefined()
    expect(() => start(written)).toBeDefined()
    expect(simulate(written, [], written.init)).toBeDefined()
    expect(rehearse(written, () => Effect.void)).toBeDefined()
    expect(drive(written, () => Effect.void)).toBeDefined()
    expect([typed, written, named]).toHaveLength(3)
  })

  test("a state without fields is a state as any other: as written, by make, and where a program is a child", () => {
    type Empty = Record<never, never>
    const empty = {
      init: { state: {} },
      update: () => (state: Empty) => ({ state }),
      subscriptions: () => [],
      makeModel: () => null
    }
    const typed: Program<{ state: Empty; model: null; message: never }> = empty
    expect(() => start(empty)).toBeDefined()
    expect(simulate(empty, [], empty.init)).toBeDefined()
    expect(rehearse(empty, () => Effect.void)).toBeDefined()
    expect(drive(empty, () => Effect.void)).toBeDefined()
    expect(program<{ state: Empty }>().make({ init: { state: {} }, makeModel: () => null })).toBeDefined()
    const Hollow = program<{ state: Empty }>()
    const hollowChildren = { Ticker: Hollow.child(ticker) }
    expect(Hollow.withChildren(hollowChildren).make({ init: { state: {} }, makeModel: () => null })).toBeDefined()
    const { child, childById } = program<{ state: Ticks }>()
    expect(child(empty)).toBeDefined()
    expect(childById(empty, { ids: (): ReadonlyArray<number> => [] })).toBeDefined()
    expect(typed).toBe(empty)
  })

  test("a state that is a type parameter compiles in make, whole or in a field of the state", () => {
    const whole = <S>(state: S) => program<{ state: S }>().make({ init: { state }, makeModel: () => null })
    const widened = <S extends object>(state: S) =>
      program<{ state: S & Readonly<{ open: boolean }> }>().make({
        init: { state: { ...state, open: false } },
        makeModel: () => null
      })
    const held = <A>(items: ReadonlyArray<A>) =>
      program<{ state: Readonly<{ items: ReadonlyArray<A> }> }>().make({
        init: { state: { items } },
        makeModel: () => null
      })
    expect(whole(1).init).toEqual({ state: 1 })
    expect(widened({ id: 1 }).init).toEqual({ state: { id: 1, open: false } })
    expect(held([1]).init).toEqual({ state: { items: [1] } })
  })
})

// Each `@ts-expect-error` is the test: if the types accepted the mistake, the typecheck would fail.
describe("what the types reject", () => {
  // A program written as a plain object, without `Program<…>`: no `external`, so nothing a parent may send.
  const plain = {
    init: { state: noTicks },
    update: (message: Tick) => ({ ticks }: Ticks) => message._tag === "Tick" ? { state: { ticks: ticks + 1 } } : reject,
    subscriptions: () => [],
    makeModel: ({ ticks }: Ticks) => ticks
  }

  test("a step tells a child only its external messages, by its name, with its id for a child by id", () => {
    type Page = Readonly<{ menu: boolean }>
    type BackPressed = Readonly<{ _tag: "BackPressed" }>
    const page = program<{ state: Page; external: BackPressed }>().make({
      init: { state: { menu: true } },
      external: () => () => ({ state: { menu: false } }),
      makeModel: () => null
    })
    const Telling = program<{ state: object; message: "Go" }>()
    const children = {
      Page: Telling.child(page),
      Row: Telling.childById(labelled, { flags: (): ReadonlyArray<readonly [number, string]> => [] })
    }
    Telling.withChildren(children).make({
      init: { state: {} },
      update: () => (state) => ({
        state,
        tell: [
          // @ts-expect-error: no child has this name.
          { _tag: "Nobody", message: { _tag: "BackPressed" } },
          // @ts-expect-error: `Nudged` is no external message of the page.
          { _tag: "Page", message: { _tag: "Nudged" } },
          // @ts-expect-error: a child by id is told with its id.
          { _tag: "Row", message: { _tag: "Nudged" } },
          // @ts-expect-error: `Bumped` is the row's own message, which its view sends, not its parent.
          { _tag: "Row", id: 1, message: { _tag: "Bumped" } }
        ]
      }),
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    // Literals, with no `as const`: what each child takes types them.
    const telling = Telling.withChildren(children).make({
      init: { state: {} },
      update: () => (state) => ({
        state,
        tell: [{ _tag: "Page", message: { _tag: "BackPressed" } }, { _tag: "Row", id: 1, message: { _tag: "Nudged" } }]
      }),
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expectTypeOf<Parameters<typeof telling.update>[0]>().toEqualTypeOf<MessageOf<typeof telling>>()
    expect(() => telling.update("Go")(telling.init.state)).toThrow("which is not in this state")
  })

  test("a program written as an object makes its model from its own state", () => {
    const widened = { ...plain, makeModel: ({ more, ticks }: Ticks & Readonly<{ more: number }>) => ticks + more }
    // @ts-expect-error: its state has no `more`.
    const typed: Program<{ state: Ticks; model: number; message: Tick }> = widened
    expect(typed).toBeDefined()
  })

  test("a child declared for another state is no child of a parent, alone or by id", () => {
    type Other = Readonly<{ other: string }>
    const elsewhere = program<{ state: Other }>()
    const { withChildren } = program<{ state: Ticks }>()
    // @ts-expect-error: its place reads another state than the parent's.
    expect(withChildren({ Ticker: elsewhere.child(ticker, { key: (state) => state.other }) })).toBeDefined()
    // @ts-expect-error: by id too.
    expect(withChildren({ Rows: elsewhere.childById(ticker, { ids: (state) => [state.other] }) })).toBeDefined()
  })

  test("a program written as an object has subscriptions, even when it listens to nothing", () => {
    const silent = {
      init: { state: noTicks },
      update: () => ({ ticks }: Ticks) => ({ state: { ticks: ticks + 1 } }),
      makeModel: ({ ticks }: Ticks) => ticks
    }
    // @ts-expect-error: only `make` fills in the subscriptions of a program that has none.
    const typed: Program<{ state: Ticks; model: number; message: Tick }> = silent
    // @ts-expect-error: so `start` does not take it either.
    expect(() => start(silent)).toBeDefined()
    // @ts-expect-error: nor `rehearse`.
    expect(rehearse(silent, () => Effect.void)).toBeDefined()
    // @ts-expect-error: nor `drive`.
    expect(drive(silent, () => Effect.void)).toBeDefined()
    const { child, childById } = program<{ state: Ticks }>()
    const ids = { ids: (): ReadonlyArray<string> => [] }
    // @ts-expect-error: nor does `child`, whose parent would call the missing piece.
    expect(child(silent)).toBeDefined()
    // @ts-expect-error: nor `childById`.
    expect(childById(silent, ids)).toBeDefined()
    // With the piece, each takes it: nothing else refuses it above.
    const listening = { ...silent, subscriptions: () => [] }
    expect([child(listening), childById(listening, ids)]).toHaveLength(2)
    expect([typed, silent]).toHaveLength(2)
  })

  test("a child without external takes no external message from its parent", () => {
    const { child, withChildren } = program<{ state: Ticks; message: Reset }>()
    const tested = withChildren({ Plain: child(plain) }).make({
      init: { state: noTicks },
      update: () => (state) => ({
        state,
        // @ts-expect-error: `Tick` is the child's own business.
        tell: [{ _tag: "Plain", message: { _tag: "Tick" } }]
      }),
      makeModel: () => null
    })
    // Past the types, by a cast: a CompositionDefect that names the child.
    expect(() => tested.update({ _tag: "Reset" })(tested.init.state)).toThrow(
      "The external message Tick to \"Plain\", which has no external"
    )
  })

  test("a declared tell gives an external message of the child, a literal with no as const, and nothing to a child without", () => {
    type Locked = Readonly<{ _tag: "LockChanged"; locked: boolean }>
    type Own = Readonly<{ ids: ReadonlyArray<number>; locked: boolean }>
    const lockable = program<{ state: boolean; external: Locked }>().make({
      init: { state: false },
      external: (message) => () => ({ state: message.locked }),
      makeModel: (state) => state
    })
    const flagged = program<{ state: boolean; external: Locked; flags: boolean }>().make({
      init: (flags) => ({ state: flags }),
      external: (message) => () => ({ state: message.locked }),
      makeModel: (state) => state
    })
    const LOCKED: Locked = { _tag: "LockChanged", locked: true }
    const { child, childById } = program<{ state: Own }>()
    const ids = (state: Own) => state.ids
    // Literals, with no `as const`: of each form of declaration, a branch for each value, and a value made apart.
    const taken = [
      childById(lockable, { ids, tell: (state) => ({ _tag: "LockChanged", locked: state.locked }) }),
      childById(lockable, { ids, tell: () => ({ _tag: "LockChanged", locked: true }) }),
      childById(lockable, { ids, tell: () => LOCKED }),
      childById(lockable, {
        ids,
        tell: (state) => state.locked ? { _tag: "LockChanged", locked: true } : { _tag: "LockChanged", locked: false }
      }),
      childById(flagged, {
        flags: (state) => Arr.map(state.ids, (id) => [id, false] as const),
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      child(lockable, { tell: (state) => ({ _tag: "LockChanged", locked: state.locked }) }),
      child(lockable, { key: (state) => state.ids, tell: (state) => ({ _tag: "LockChanged", locked: state.locked }) }),
      child(lockable, {
        there: (state) => state.locked,
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      child(flagged, {
        flags: (state) => state.locked ? Opt.some(true) : Opt.none(),
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      })
    ]
    // Refused: a message that is no external message of the child, of a tag or of a field. TypeScript 7.0.2 reports
    // one of `childById` at `ids`, as the error of its last overload.
    // @ts-expect-error: `Unlocked` is no external message of the child.
    childById(lockable, { ids, tell: (state) => ({ _tag: "Unlocked", locked: state.locked }) })
    // @ts-expect-error: `locked` is a boolean.
    childById(lockable, { ids, tell: (state) => ({ _tag: "LockChanged", locked: String(state.locked) }) })
    // @ts-expect-error: alone too.
    child(lockable, { tell: () => ({ _tag: "Unlocked" }) })
    // @ts-expect-error: and with flags.
    child(flagged, { flags: () => Opt.some(true), tell: () => ({ _tag: "Unlocked" }) })
    // A child that has no external messages is told nothing.
    const silent = program<{ state: number }>().make({ init: { state: 0 }, makeModel: (state) => state })
    // @ts-expect-error: by id.
    childById(silent, { ids, tell: () => LOCKED })
    // @ts-expect-error: alone.
    child(silent, { tell: () => LOCKED })
    expect(taken).toHaveLength(9)
  })

  test("a parent's own command answers with the parent's own messages, never with a child's", () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: () => () => ({ state: noTicks }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const { child, withChildren } = program<{ state: Ticks; command: "Load"; message: "Loaded" }>()
    const children = { Counter: child(resettable) }
    withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state, commands: ["Load"] }),
      // @ts-expect-error: `Tick` is the child's own business.
      runCommand: () => Effect.succeedSome({ _tag: "Counter" as const, message: { _tag: "Tick" as const } }),
      makeModel: () => null
    })
    withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state, commands: ["Load"] }),
      // @ts-expect-error: `Reset` is no message of the child: the parent tells it in a step.
      runCommand: () => Effect.succeedSome({ _tag: "Counter" as const, message: { _tag: "Reset" as const } }),
      makeModel: () => null
    })
    const tested = withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state, tell: [{ _tag: "Counter", message: { _tag: "Reset" } }] }),
      runCommand: () => Effect.succeedSome("Loaded" as const),
      makeModel: () => null
    })
    expect(Effect.runSync(tested.runCommand("Load"))).toEqual(Opt.some("Loaded"))
    const at = stateOf(tested, noTicks, { Counter: { ticks: 3 } })
    expect(stateAt(accepted(tested.update("Loaded")(at)).state.children.Counter)).toEqual(noTicks)
  })

  test("a parent's own subscription sends the parent's own messages, never a child's", () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: () => () => ({ state: noTicks }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const idle = <M>(): Subscription<M, never> => Channel.never
    const { child, withChildren } = program<{ state: Ticks; message: "Loaded"; key: "load" }>()
    const children = { Counter: child(resettable) }
    withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => ["load" as const],
      // @ts-expect-error: `Tick` is the child's own business.
      listen: () => idle<Readonly<{ _tag: "Counter"; message: Tick }>>(),
      makeModel: () => null
    })
    withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => ["load" as const],
      // @ts-expect-error: `Reset` is no message of the child: the parent tells it in a step.
      listen: () => idle<Readonly<{ _tag: "Counter"; message: Reset }>>(),
      makeModel: () => null
    })
    const tested = withChildren(children).make({
      init: { state: noTicks },
      update: () => (state) => ({ state, tell: [{ _tag: "Counter", message: { _tag: "Reset" } }] }),
      subscriptions: () => ["load" as const],
      listen: () => idle<"Loaded">(),
      makeModel: () => null
    })
    expect(tested.subscriptions(tested.init.state)).toEqual(["load"])
  })

  test("an own message cannot take the name of a child, which would receive it", () => {
    const { child, withChildren } = program<{ state: Ticks; message: Readonly<{ _tag: "Plain" }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    withChildren({ Plain: child(plain) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      makeModel: () => null
    })
  })

  test("an own command cannot take the name of a child, whose interpreter would receive it", () => {
    const { child, withChildren } = program<{ state: Ticks; command: Readonly<{ _tag: "Plain" }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    withChildren({ Plain: child(plain) }).make({
      init: { state: noTicks },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
  })

  test("an own message or command cannot take the name of a child, however wide its type", () => {
    const { child } = program<{ state: Ticks }>()
    const children = { Plain: child(plain) }
    const parentOf = <T extends { state: Ticks; message?: unknown; command?: unknown }>() => program<T>()
    const init = { state: noTicks }
    const update = () => (state: Ticks) => ({ state })
    // @ts-expect-error: any string is `Plain` too.
    parentOf<{ state: Ticks; message: Readonly<{ _tag: string }> }>().withChildren(children).make({
      init,
      update,
      makeModel: () => null
    })
    // @ts-expect-error: `Plain` matches the template.
    parentOf<{ state: Ticks; message: Readonly<{ _tag: `P${string}` }> }>().withChildren(children).make({
      init,
      update,
      makeModel: () => null
    })
    // @ts-expect-error: an optional tag is a tag.
    parentOf<{ state: Ticks; message: Readonly<{ _tag?: "Plain" }> }>().withChildren(children).make({
      init,
      update,
      makeModel: () => null
    })
    // @ts-expect-error: a message of any value may be tagged `Plain`.
    parentOf<{ state: Ticks; message: unknown }>().withChildren(children).make({ init, update, makeModel: () => null })
    // @ts-expect-error: likewise for a command.
    parentOf<{ state: Ticks; command: Readonly<{ _tag: string }> }>().withChildren(children).make({
      init,
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
    // Children whose names are not known: any of them may be `Go`.
    const named: Readonly<Record<string, Child<Ticks, typeof plain, "always">>> = children
    // @ts-expect-error: a tag that is a name of none of the children here may be one of another such object.
    parentOf<{ state: Ticks; message: Readonly<{ _tag: "Go" }> }>().withChildren(named).make({
      init,
      update,
      makeModel: () => null
    })
    const elsewhere = parentOf<{ state: Ticks; message: Readonly<{ _tag: `Q${string}` }> | number }>()
      .withChildren(children)
      .make({ init, update, makeModel: () => null })
    const alone = parentOf<{ state: Ticks; message: Readonly<{ _tag: string }> }>().make({
      init,
      update,
      makeModel: () => null
    })
    expect([elsewhere.update(1)(elsewhere.init.state), alone.init]).toEqual([
      { state: elsewhere.init.state, commands: [], events: [] },
      { state: noTicks }
    ])
  })

  test("a program has an external exactly when it has external messages, and it never rejects", () => {
    const update = () => ({ ticks }: Ticks) => ({ state: { ticks: ticks + 1 } })
    const pieces = { init: { state: noTicks }, update, subscriptions: () => [], makeModel: () => 0 }
    // @ts-expect-error: its parent may send it a `Reset`, which nothing answers.
    const deaf: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = pieces
    // @ts-expect-error: likewise for a program that `make` makes.
    program<{ state: Ticks; message: Tick; external: Reset }>().make({
      init: { state: noTicks },
      update,
      makeModel: () => 0
    })
    program<{ state: Ticks; message: Tick }>().make({
      init: { state: noTicks },
      update,
      // @ts-expect-error: a program that names no external messages has no `external`.
      external: () => (state) => ({ state }),
      makeModel: () => 0
    })
    program<{ state: Ticks; external: Reset }>().make({
      init: { state: noTicks },
      // @ts-expect-error: an external message applies in every state.
      external: () => () => reject,
      makeModel: () => 0
    })
    expect(deaf).toBeDefined()
  })

  test("a program may be typed with fewer external messages than it takes, never with more", () => {
    type Other = Readonly<{ _tag: "Other" }>
    const resetting = program<{ state: Ticks; message: Tick; external: Tick | Reset }>().make({
      init: { state: noTicks },
      update: (_: Tick) => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: (message: Tick | Reset) => ({ ticks }) => ({
        state: { ticks: message._tag === "Tick" ? ticks + 1 : 0 }
      }),
      makeModel: ({ ticks }) => ticks
    })
    // @ts-expect-error: its parent could send it an `Other`, which its `external` does not take.
    const widened: Program<{ state: Ticks; model: number; message: Tick; external: Tick | Reset | Other }> = resetting
    const narrowed: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = resetting
    const none: Program<{ state: Ticks; model: number; message: Tick }> = resetting
    expectTypeOf<ExternalOf<typeof narrowed>>().toEqualTypeOf<Reset>()
    expectTypeOf<ExternalOf<typeof none>>().toEqualTypeOf<never>()
    expectTypeOf<ExternalOf<typeof resetting>>().toEqualTypeOf<Tick | Reset>()
    expect([widened, narrowed, none]).toEqual([resetting, resetting, resetting])
  })

  test("a parent passes an external message on in its own external, and a grandparent reaches the child", () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: () => () => ({ state: noTicks }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const Middle = program<{ state: object; external: Reset }>()
    const middle = Middle.withChildren({ Counter: Middle.child(resettable) }).make({
      init: { state: {} },
      external: (reset) => (state) => ({ state, tell: [{ _tag: "Counter", message: reset }] }),
      makeModel: () => null
    })
    const Top = program<{ state: object; message: Reset }>()
    const top = Top.withChildren({ Middle: Top.child(middle) }).make({
      init: { state: {} },
      update: (reset) => (state) => ({ state, tell: [{ _tag: "Middle", message: reset }] }),
      makeModel: () => null
    })
    const at = stateOf(top, {}, { Middle: stateOf(middle, {}, { Counter: { ticks: 2 } }) })
    expect(stateAt(stateAt(accepted(top.update({ _tag: "Reset" })(at)).state.children.Middle).children.Counter))
      .toEqual(noTicks)
    expectTypeOf<MessageOf<typeof middle>>().toEqualTypeOf<
      Readonly<{ _tag: "Counter"; message: Tick; instance?: number }>
    >()
  })

  test("a function over programs passes its type parameter on to them", () => {
    // `make` refuses the `subscriptions` of a program that declares no key: the pieces are taken without it.
    const counting = program<{ state: Ticks; model: number; message: Tick }>().make({
      init: plain.init,
      update: plain.update,
      makeModel: plain.makeModel
    })
    const same = <T extends { state: object; model: unknown; message: unknown }>(p: Program<T>) => p
    const maker = <T extends { state: object }>() => program<T>()
    expect(same(counting)).toBe(counting)
    expect(maker<{ state: Ticks }>().make({ init: { state: noTicks }, makeModel: () => null }).init).toEqual({
      state: noTicks
    })
  })

  // What a program's type does not name is read back as none, and what it names as `unknown` as anything.
  test("a child whose init is a function starts from flags, whatever their type", () => {
    const unknowing: Program<{ state: Ticks; model: number; message: Tick; flags: unknown }> = {
      init: () => ({ state: noTicks }),
      update: () => (state) => ({ state }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const thunk = { ...plain, init: () => ({ state: noTicks }) }
    const { child } = program<{ state: Ticks }>()
    // @ts-expect-error: its first state depends on its flags.
    expect(child(unknowing)).toBeDefined()
    // @ts-expect-error: and so does that of a program written as a plain object.
    expect(child(thunk)).toBeDefined()
    expect([child(unknowing, { flags: () => Opt.some(Symbol()) }), child(thunk, { flags: () => Opt.some(null) })])
      .toHaveLength(2)
    const flags: [FlagsOf<typeof unknowing>, FlagsOf<typeof thunk>] = [Symbol(), null]
    // @ts-expect-error: a program whose first step is a value has no flags.
    const none: FlagsOf<typeof plain> = null
    expect([flags, none]).toHaveLength(2)
  })

  test("a child whose events are of any type needs an onEvent", () => {
    const telling: Program<{ state: Ticks; model: number; message: Tick; event: unknown }> = {
      init: { state: noTicks },
      update: () => (state) => ({ state, events: [state.ticks] }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const { child, withChildren } = program<{ state: Ticks }>()
    // @ts-expect-error: its events would go unhandled.
    withChildren({ Telling: child(telling) }).make({ init: { state: noTicks }, makeModel: () => null })
  })

  test("a program's commands and events are those its steps list, and none where none lists them", () => {
    const sometimes = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) =>
        state.ticks > 1 ?
          { state, events: ["Many" as const], commands: [1 as const] }
          : state.ticks > 0 ?
          { state, events: ["One" as const] }
          : reject,
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const read: [EventOf<typeof sometimes>, CommandOf<typeof sometimes>] = ["One", 1]
    // @ts-expect-error: no step lists another event.
    const other: EventOf<typeof sometimes> = "None"
    // @ts-expect-error: nor does any step of a program that lists none.
    // oxlint-disable-next-line typescript/no-duplicate-type-constituents, typescript/no-redundant-type-constituents -- both are `never`, which is what this checks
    const none: EventOf<typeof plain> | CommandOf<typeof plain> = "None"
    const anything: [EventOf<Program<{ state: Ticks; model: null; message: Tick; event: unknown }>>] = [Symbol()]
    expect([read, other, none, anything]).toHaveLength(4)
  })

  test("a program that names events and no messages has those events, for its parent too", () => {
    type Rang = Readonly<{ _tag: "Rang" }>
    const bell = program<{ state: Ticks; event: Rang }>().make({ init: { state: noTicks }, makeModel: () => null })
    const event: EventOf<typeof bell> = { _tag: "Rang" }
    const { child, withChildren } = program<{ state: Ticks }>()
    withChildren({ Bell: child(bell) }).make({
      init: { state: noTicks },
      onEvent: { Bell: (rang) => (state) => ({ state: { ticks: rang._tag.length + state.ticks } }) },
      makeModel: () => null
    })
    expect(event).toEqual({ _tag: "Rang" })
  })

  test("a child that starts with no command still has those its update returns", () => {
    const saving = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) =>
        state.ticks > 0 ? { state, commands: ["Save" as const] } : { state: { ticks: 1 } },
      runCommand: () => Effect.succeedNone,
      subscriptions: () => [],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const { child, withChildren } = program<{ state: Ticks }>()
    const tested = withChildren({ Saving: child(saving) }).make({ init: { state: noTicks }, makeModel: () => null })
    const command: CommandOf<typeof tested> = { _tag: "Saving", instance: 1, command: "Save" }
    // @ts-expect-error: the child returns no other command.
    const other: CommandOf<typeof saving> = "Load"
    expect([command, other]).toHaveLength(2)
  })

  test("a program raises only the events its own type includes, with or without children", () => {
    type Gone = Readonly<{ _tag: "Gone" }>
    program<{ state: Ticks }>().make({
      init: { state: noTicks },
      // @ts-expect-error: it names no event.
      update: (_: Tick) => (state) => ({ state, events: [{ _tag: "Gone" } as Gone] }),
      makeModel: ({ ticks }) => ticks
    })
    const leaving = program<{ state: Ticks; event: Gone; message: Tick }>().make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state, events: [{ _tag: "Gone" } as Gone] }),
      makeModel: ({ ticks }) => ticks
    })
    expect(leaving.update({ _tag: "Tick" })(noTicks)).toEqual({ state: noTicks, events: [{ _tag: "Gone" }] })
    const gone = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state, events: [{ _tag: "Gone" } as Gone] }),
      subscriptions: () => [],
      makeModel: ({ ticks }: Ticks) => ticks
    }
    const Silent = program<{ state: Ticks; event: Readonly<{ _tag: "Other" }> }>()
    Silent.withChildren({ Gone: Silent.child(gone) }).make({
      init: { state: noTicks },
      // @ts-expect-error: `Gone` is no event of this parent's.
      onEvent: { Gone: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null
    })
    const Raising = program<{ state: Ticks; event: Gone }>()
    const raising = Raising.withChildren({ Gone: Raising.child(gone) }).make({
      init: { state: noTicks },
      onEvent: { Gone: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null
    })
    expect(raising.update({ _tag: "Gone", message: { _tag: "Tick" } })(raising.init.state)).toEqual({
      state: raising.init.state,
      commands: [],
      events: [{ _tag: "Gone" }]
    })
  })

  test("commands of its own need a runCommand", () => {
    const { child, withChildren } = program<{ state: Ticks; command: Readonly<{ _tag: "Beep" }> }>()
    // @ts-expect-error: `Beep` would go uninterpreted.
    withChildren({ Plain: child(plain) }).make({ init: { state: noTicks }, makeModel: () => null })
  })

  test("the commands of a parent need what its runCommand and those of its children need, and its subscriptions what its own and those of its children need, wherever they are returned", () => {
    class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("Clock") {}
    class Disk extends Context.Service<Disk, { readonly now: Effect.Effect<number> }>()("Disk") {}
    class Gong extends Context.Service<Gong, { readonly now: Effect.Effect<number> }>()("Gong") {}
    class Feed extends Context.Service<Feed, { readonly ticks: Subscription<Tick, never> }>()("Feed") {}
    class Wire extends Context.Service<Wire, { readonly ticks: Subscription<Tick, never> }>()("Wire") {}
    class Tape extends Context.Service<Tape, { readonly ticks: Subscription<Tick, never> }>()("Tape") {}
    class Bell extends Context.Service<Bell, { readonly ticks: Subscription<Tick, never> }>()("Bell") {}
    // Unlike two `extends`, it tells `any` and `unknown` from the services named.
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const tick = (): Opt.Option<Tick> => Opt.some({ _tag: "Tick" })
    const fromClock = Effect.map(Effect.service(Clock), tick)
    const fromDisk = Effect.map(Effect.service(Disk), tick)
    const fromFeed = Channel.unwrap(Effect.map(Effect.service(Feed), (feed) => feed.ticks))
    const fromWire = Channel.unwrap(Effect.map(Effect.service(Wire), (wire) => wire.ticks))
    const fromTape = Channel.unwrap(Effect.map(Effect.service(Tape), (tape) => tape.ticks))
    const ringing: Program<
      {
        state: Ticks
        model: null
        message: Tick
        command: "Ring"
        commandServices: Gong
        subscriptionServices: Bell
        key: "bell"
      }
    > = {
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      runCommand: () => Effect.map(Effect.service(Gong), tick),
      subscriptions: () => ["bell" as const],
      listen: () => Channel.unwrap(Effect.map(Effect.service(Bell), (bell) => bell.ticks)),
      makeModel: () => null
    }
    const { make } = program<{ state: Ticks; command: "Read" | "Load"; message: Tick }>()
    const Listening = program<
      { state: Ticks; command: "Read" | "Load"; message: Tick; key: "feed" | "wire" | "tape" }
    >()
    // One service for each place they are read from: the two branches of `runCommand`, the three branches of `listen`,
    // and a child's command and subscription.
    const app = Listening.withChildren({ Ringing: Listening.child(ringing) }).make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: (command) => command === "Read" ? fromClock : fromDisk,
      subscriptions: ({ ticks }) => ticks > 0 ? ["feed" as const, "wire" as const] : ["tape" as const],
      listen: (key) => {
        switch (key) {
          case "feed":
            return fromFeed
          case "wire":
            return fromWire
          case "tape":
            return fromTape
        }
      },
      makeModel: () => null
    })
    const commands: Exactly<CommandServicesOf<typeof app>, Clock | Disk | Gong> = true
    expect(commands).toBe(true)
    const subscriptions: Exactly<SubscriptionServicesOf<typeof app>, Feed | Wire | Tape | Bell> = true
    expect(subscriptions).toBe(true)
    // An empty set needs nothing, wherever it is returned from: services are read from `listen` alone.
    const quiet = program<{ state: Ticks; command: "Read" | "Load"; message: Tick; key: "feed" }>().make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => Effect.succeedNone,
      subscriptions: ({ ticks }) =>
        Opt.match(Opt.liftPredicate(ticks, (ticks) => ticks > 0), {
          onNone: () => [],
          onSome: (ticks) => ticks > 1 ? ["feed" as const] : []
        }),
      listen: () => fromFeed,
      makeModel: () => null
    })
    const quietCommands: Exactly<CommandServicesOf<typeof quiet>, never> = true
    expect(quietCommands).toBe(true)
    const one: Exactly<SubscriptionServicesOf<typeof quiet>, Feed> = true
    expect(one).toBe(true)
    // `make` takes no `subscriptions` from a program that declares no key: it listens to nothing.
    const silent = make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
    const none: Exactly<SubscriptionServicesOf<typeof silent>, never> = true
    expect(none).toBe(true)
    // A program written as an object, and its parent.
    const written = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      subscriptions: () => [],
      makeModel: () => null
    }
    const Holder = program<{ state: Ticks }>()
    const holder = Holder.withChildren({ Literal: Holder.child(written) }).make({
      init: { state: noTicks },
      makeModel: () => null
    })
    expectTypeOf<SubscriptionServicesOf<typeof written>>().toEqualTypeOf<never>()
    expectTypeOf<SubscriptionServicesOf<typeof holder>>().toEqualTypeOf<never>()
    // What a `runCommand` is annotated to need is the parent's too, whatever it returns.
    const annotated = make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: (): Execution<Tick, Clock | Disk> => fromClock,
      makeModel: () => null
    })
    const named: Exactly<CommandServicesOf<typeof annotated>, Clock | Disk> = true
    expect(named).toBe(true)
    const unheard: Exactly<SubscriptionServicesOf<typeof annotated>, never> = true
    expect(unheard).toBe(true)
  })

  test("services that a type does not say, any or unknown, are needed as unknown, by the program and by its parent", () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const loose: any = Effect.succeedNone
    const Leaf = program<{ state: Ticks; message: Tick; command: "Read" }>()
    const base = { init: { state: noTicks }, update: (_: Tick) => (state: Ticks) => ({ state }), makeModel: () => null }
    const untyped = Leaf.make({ ...base, runCommand: () => loose })
    const unknowing = Leaf.make({ ...base, runCommand: () => Effect.succeedNone as Execution<Tick, unknown> })
    const unheard = program<{ state: Ticks; message: Tick; key: "loose" }>().make({
      ...base,
      subscriptions: () => ["loose" as const],
      listen: () => loose
    })
    // Services are read from `listen`, which a program has only with keys: without one, the services it names are
    // never read back.
    const declared: Program<{ state: Ticks; model: null; message: Tick; subscriptionServices: unknown; key: "a" }> = {
      ...base,
      subscriptions: () => [],
      listen: () => Channel.never
    }
    const commands: Exactly<CommandServicesOf<typeof untyped>, unknown> = true
    const unknownCommands: Exactly<CommandServicesOf<typeof unknowing>, unknown> = true
    const subscriptions: Exactly<SubscriptionServicesOf<typeof unheard>, unknown> = true
    const declaredSubscriptions: Exactly<SubscriptionServicesOf<typeof declared>, unknown> = true
    const none: Exactly<SubscriptionServicesOf<typeof base>, never> = true
    const Parent = program<{ state: object }>()
    const parent = Parent.withChildren({ Left: Parent.child(untyped), Right: Parent.child(unheard) }).make({
      init: { state: {} },
      makeModel: () => null
    })
    const parentCommands: Exactly<CommandServicesOf<typeof parent>, unknown> = true
    const parentSubscriptions: Exactly<SubscriptionServicesOf<typeof parent>, unknown> = true
    expect([commands, unknownCommands, subscriptions, declaredSubscriptions, none, parentCommands, parentSubscriptions])
      .toEqual([true, true, true, true, true, true, true])
  })

  test("one branch of a runCommand, or one subscription of a map, that answers with no message of the parent's", () => {
    class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("Clock") {}
    type Tock = Readonly<{ _tag: "Tock" }>
    const fromClock = Effect.map(Effect.service(Clock), (): Opt.Option<Tick> => Opt.some({ _tag: "Tick" }))
    const tock: Execution<Tock, never> = Effect.succeedNone
    const { make } = program<{ state: Ticks; command: "Read" | "Load"; message: Tick }>()
    make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      // @ts-expect-error: `Tock` is no message of this parent's.
      runCommand: (command) => command === "Read" ? fromClock : tock,
      makeModel: () => null
    })
    program<{ state: Ticks; command: "Read" | "Load"; message: Tick; key: "ticks" | "tocks" }>().make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => fromClock,
      subscriptions: () => ["ticks" as const, "tocks" as const],
      listen: (key) =>
        // @ts-expect-error: `Tock` is no message of this parent's.
        key === "ticks" ? Channel.never as Subscription<Tick, Clock> : Channel.never as Subscription<Tock, never>,
      makeModel: () => null
    })
  })

  test("a model that is named is checked, one that is not is inferred, and own messages are those named", () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    type Reset = "Reset"
    const Named = program<{ state: Ticks; model: number; message: Tick | Reset }>()
    const named = Named.make({
      init: { state: noTicks },
      update: (message) => ({ ticks }) => ({ state: { ticks: message === "Reset" ? 0 : ticks + 1 } }),
      makeModel: ({ ticks }) => ticks
    })
    const model: Exactly<ModelOf<typeof named>, number> = true
    const messages: Exactly<MessageOf<typeof named>, Tick | Reset> = true
    Named.make({
      init: { state: noTicks },
      // @ts-expect-error: it takes `Reset` too.
      update: (_: Tick) => (state) => ({ state }),
      makeModel: ({ ticks }) => ticks
    })
    Named.make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      // @ts-expect-error: its model is a number.
      makeModel: ({ ticks }) => String(ticks)
    })
    program<{ state: Ticks; model: never }>().make({
      init: { state: noTicks },
      // @ts-expect-error: a model named `never` is named all the same, and no model is one.
      makeModel: ({ ticks }) => ticks
    })
    const inferred = program<{ state: Ticks; message: Reset }>().make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      makeModel: ({ ticks }) => ticks
    })
    const inferredModel: Exactly<ModelOf<typeof inferred>, number> = true
    const namedMessages: Exactly<MessageOf<typeof inferred>, Reset> = true
    // A parent's own messages are its own: its child's are added.
    const Parent = program<{ state: object; message: Reset }>()
    const parent = Parent.withChildren({ Clock: Parent.child(ticker) }).make({
      init: { state: {} },
      update: () => (state) => ({ state }),
      makeModel: (_, children) => children.Clock()
    })
    const parentModel: Exactly<ModelOf<typeof parent>, number> = true
    const parentMessages: Exactly<
      MessageOf<typeof parent>,
      Reset | Readonly<{ _tag: "Clock"; message: Tick; instance?: number }>
    > = true
    expect([model, messages, inferredModel, namedMessages, parentModel, parentMessages]).toEqual([
      true,
      true,
      true,
      true,
      true,
      true
    ])
  })

  test("an update is there exactly when the program names messages of its own", () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    program<{ state: Ticks }>().make({
      init: { state: noTicks },
      // @ts-expect-error: it names no messages, so it has none to update on.
      update: (_: Tick) => (state) => ({ state }),
      makeModel: () => null
    })
    // @ts-expect-error: it names messages, and nothing updates on them.
    program<{ state: Ticks; message: Tick }>().make({ init: { state: noTicks }, makeModel: () => null })
    // An update given by name, and a command that answers with fewer messages than it takes.
    const update: Update<Ticks, Tick | Reset, "Beep"> = (message) => ({ ticks }) =>
      message._tag === "Tick" ? { state: { ticks: ticks + 1 }, commands: ["Beep"] } : { state: noTicks }
    const answered = program<{ state: Ticks; message: Tick | Reset; command: "Beep" }>().make({
      init: { state: noTicks },
      update,
      runCommand: () => Effect.succeedSome<Tick>({ _tag: "Tick" }),
      makeModel: ({ ticks }) => ticks
    })
    const byName: Exactly<MessageOf<typeof answered>, Tick | Reset> = true
    expect(byName).toBe(true)
  })

  test("a program needs its init and its makeModel, however it is written", () => {
    const { make, withChildren, child } = program<{ state: Ticks }>()
    // @ts-expect-error: it has nothing to start from.
    expect(make({ makeModel: () => null })).toBeDefined()
    // @ts-expect-error: it has nothing to draw.
    expect(make({ init: { state: noTicks } })).toBeDefined()
    // @ts-expect-error: nor has a parent.
    expect(() => withChildren({ Ticker: child(ticker) }).make({ init: { state: noTicks } })).toBeDefined()
    const { init, ...uninitialized } = ticker
    const { makeModel, ...unmodelled } = ticker
    // @ts-expect-error: a program written as an object has nothing to start from without it.
    expect(() => start(uninitialized)).toBeDefined()
    // @ts-expect-error: nor anything to draw.
    expect(() => start(unmodelled)).toBeDefined()
    expect([init, makeModel]).toHaveLength(2)
  })

  test("children by id list their ids: ids is required", () => {
    const { childById } = program<{ state: ListState }>()
    // @ts-expect-error: without it, no child would be there.
    expect(childById(counter, { listening: () => true })).toBeDefined()
    expect(childById(counter, { ids: (state) => state.ids })).toBeDefined()
  })

  test("a handler of onEvent answers with a step, and its type has no reject", () => {
    const { child, childById, withChildren } = program<{ state: Ticks }>()
    withChildren({ Left: child(counter) }).make({
      init: { state: noTicks },
      onEvent: {
        // @ts-expect-error: a handler that does not apply answers `{ state }`.
        Left: () => () => reject
      },
      makeModel: () => null
    })
    withChildren({ Rows: childById(counter, { ids: (): ReadonlyArray<number> => [] }) }).make({
      init: { state: noTicks },
      onEvent: {
        // @ts-expect-error: for children by id too.
        Rows: () => () => reject
      },
      makeModel: () => null
    })
  })

  test("a program has subscriptions and listen exactly when it names keys of its own", () => {
    const update = () => (state: Ticks) => ({ state })
    program<{ state: Ticks; message: Tick }>().make({
      init: { state: noTicks },
      update,
      // @ts-expect-error: it names no keys, so it listens to nothing.
      subscriptions: () => ["ticks"],
      makeModel: () => null
    })
    // @ts-expect-error: it names keys, and nothing lists them.
    program<{ state: Ticks; message: Tick; key: "ticks" }>().make({
      init: { state: noTicks },
      update,
      listen: (): Subscription<Tick> => Channel.end({ _tag: "Tick" }),
      makeModel: () => null
    })
    // @ts-expect-error: nor makes their subscriptions.
    program<{ state: Ticks; message: Tick; key: "ticks" }>().make({
      init: { state: noTicks },
      update,
      subscriptions: () => ["ticks"],
      makeModel: () => null
    })
  })

  test("a child whose program is a type parameter does not compile, in child, childById or withChildren", () => {
    const wrapping = <P extends AnyProgram>(inner: P) => {
      const { child, childById, withChildren } = program<{ state: Ticks }>()
      // @ts-expect-error: the compiler cannot decide that the program is one.
      const Inner = child(inner)
      // @ts-expect-error: nor for children by id.
      const Rows = childById(inner, { ids: (): ReadonlyArray<number> => [] })
      // @ts-expect-error: nor what the child needs.
      return withChildren({ Inner, Rows }).make({ init: { state: noTicks }, makeModel: () => null })
    }
    expect(wrapping).toBeDefined()
  })
})

describe("a child's subscriptions in a run", () => {
  // Its lifted keys are new objects for each new state of the child: only their values, compared with `Equal`, keep
  // its subscription running. The command of the third bump, started once its job has stopped and started what it
  // had to, is the witness that the jobs are done.
  test("a child whose state changes, under the same key, keeps its subscription running", async () => {
    let starts = 0
    const noted = Deferred.makeUnsafe<void>()
    type Bumps = Readonly<{ bumps: number }>
    const bumping: Program<
      { state: Bumps; model: number; message: "Bump"; command: "Noted"; key: Readonly<{ name: string }> }
    > = {
      init: { state: { bumps: 0 } },
      update: () => ({ bumps }) => ({ state: { bumps: bumps + 1 }, commands: bumps + 1 === 3 ? ["Noted"] : [] }),
      runCommand: () => Effect.as(Deferred.succeed(noted, undefined), Opt.none()),
      subscriptions: () => [{ name: "ticks" }],
      listen: () => Channel.fromEffectDone(Effect.sync(() => void (starts += 1)).pipe(Effect.andThen(Effect.never))),
      makeModel: ({ bumps }) => bumps
    }
    const { child, withChildren } = program<{ state: object }>()
    const holder = withChildren({ Bumping: child(bumping) }).make({
      init: { state: {} },
      makeModel: (_, children) => children.Bumping()
    })
    const { app, run } = start(holder)
    const fiber = Effect.runFork(run)
    app.dispatch({ _tag: "Bumping", message: "Bump" })
    app.dispatch({ _tag: "Bumping", message: "Bump" })
    app.dispatch({ _tag: "Bumping", message: "Bump" })
    await Effect.runPromise(Effect.raceFirst(Fiber.join(fiber), Deferred.await(noted)))
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect({ bumps: app.model(), starts }).toEqual({ bumps: 3, starts: 1 })
  })

  // Each message carries its id made anew, a new array or object: only `Equal` finds the child, and its key, again.
  // The messages are sent once both rows listen, so that a key not found again would start a row's subscription over.
  // The command of each row's second bump is the witness, as above: the second that runs was started once the last
  // job was done.
  test("a child by id keeps its subscription running from one state to the next, its id a tuple or a struct made anew", async () => {
    let starts = 0
    let noted = 0
    const listening = Deferred.makeUnsafe<void>()
    const done = Deferred.makeUnsafe<void>()
    type Bumps = Readonly<{ bumps: number }>
    const bumping: Program<{ state: Bumps; model: number; message: "Bump"; command: "Noted"; key: "ticks" }> = {
      init: { state: { bumps: 0 } },
      update: () => ({ bumps }) => ({ state: { bumps: bumps + 1 }, commands: bumps + 1 === 2 ? ["Noted"] : [] }),
      runCommand: () =>
        Effect.suspend(() => ++noted === 2 ? Deferred.succeed(done, undefined) : Effect.void).pipe(
          Effect.as(Opt.none())
        ),
      subscriptions: () => ["ticks" as const],
      listen: () =>
        Channel.fromEffectDone(
          Effect.suspend(() => ++starts === 2 ? Deferred.succeed(listening, undefined) : Effect.void).pipe(
            Effect.andThen(Effect.never)
          )
        ),
      makeModel: ({ bumps }) => bumps
    }
    type Pair = readonly [string, number]
    type Shelf = Readonly<{ shelf: string }>
    type Store = Readonly<{ pairs: ReadonlyArray<Pair>; shelves: ReadonlyArray<Shelf> }>
    const { childById, withChildren } = program<{ state: Store }>()
    const store = withChildren({
      Pairs: childById(bumping, { ids: (state) => state.pairs }),
      Shelves: childById(bumping, { ids: (state) => state.shelves })
    }).make({
      init: { state: { pairs: [["milk", 1]], shelves: [{ shelf: "top" }] } },
      makeModel: (_, children) => [children.Pairs(["milk", 1]), children.Shelves({ shelf: "top" })]
    })
    const { app, run } = start(store)
    const fiber = Effect.runFork(run)
    await Effect.runPromise(Effect.raceFirst(Fiber.join(fiber), Deferred.await(listening)))
    for (let bump = 0; bump < 2; bump++) {
      app.dispatch({ _tag: "Pairs", id: ["milk", 1], message: "Bump" })
      app.dispatch({ _tag: "Shelves", id: { shelf: "top" }, message: "Bump" })
    }
    await Effect.runPromise(Effect.raceFirst(Fiber.join(fiber), Deferred.await(done)))
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect({ bumps: app.model(), starts }).toEqual({ bumps: [2, 2], starts: 2 })
  })
})
