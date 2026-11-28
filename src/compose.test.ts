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
import {
  Child,
  child,
  ChildById,
  childById,
  childWhen,
  type Instance,
  type Kept,
  type OutputsOf,
  program,
  type TellOf
} from "./compose.ts"
import { CompositionDefect, compositionDefect, defect, InvariantDefect } from "./defect.ts"
import { type Dispatch, forwardTo } from "./dispatch.ts"
import type { Ignored } from "./engine.ts"
import {
  type AnyProgram,
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type FlagsOf,
  type KeyOf,
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
import { andThen, type Folded, reject, type Rejected, type Step, type Transition, type Update } from "./update.ts"

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
  Left: child(counter),
  Right: childWhen(counter, { there: (state) => state.right }),
  // Listens only while the right counter is there.
  Ticker: child(ticker, { listening: (state) => state.right })
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
  Rows: childById(counter, { ids: (state) => state.ids }),
  Ticker: child(ticker, { listening: () => false })
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

const lists = Nested.withChildren({ Lists: childById(list, { ids: (state) => state.ids }) }).make({
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
      Pings.withChildren({ Pinger: child(pinger) }).make({
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

  test("a handler that answers { state } to the event of a child's step keeps the child's new state, and adds nothing", () => {
    const Quiet = program<{ state: Readonly<{ heard: number }> }>()
    const quiet = Quiet.withChildren({ Left: child(counter) }).make({
      init: { state: { heard: 0 } },
      onEvent: { Left: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const saving = stateOf(quiet, { heard: 0 }, { Left: { ...counter.init.state, count: 2, saving: true } })
    const result = accepted(quiet.update({ _tag: "Left", message: CounterMessage.Saved() })(saving))
    expect(stateAt(result.state.children.Left)).toEqual({ ...counter.init.state, count: 2, saving: false })
    expect(result.state.own).toBe(saving.own)
    expect([result.commands, result.events]).toEqual([[], []])
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
    const tested = Inherited.withChildren({ Ticker: child(ticker) }).make({
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
    const Ticker = child(ticker)
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
    const maybe = Maybe.withChildren({ Ticker: childWhen(ticker, { there: (state) => state.ticking }) }).make({
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

  test("a child that may not be there listens where it is there and listening holds, and keeps its state where it does not listen", () => {
    type Own = Readonly<{ ticking: boolean; listening: boolean }>
    const Maybe = program<{ state: Own; message: "Muted" | "Unmuted" }>()
    const maybe = Maybe.withChildren({
      Ticker: childWhen(ticker, { there: (state) => state.ticking, listening: (state) => state.listening })
    }).make({
      init: { state: { ticking: true, listening: true } },
      update: (message) => (state) => ({ state: { ...state, listening: message === "Unmuted" } }),
      makeModel: () => null
    })
    const listed = [{ _tag: "Ticker", instance: 1, key: "ticks" }] as const
    expect(maybe.subscriptions(maybe.init.state)).toEqual(listed)
    expect(maybe.subscriptions(stateOf(maybe, { ticking: false, listening: true }))).toEqual([])
    const { state: ticked } = applyAll(maybe.update, [{ _tag: "Ticker", message: { _tag: "Tick" } }], maybe.init.state)
    const { state: muted } = applyAll(maybe.update, ["Muted"], ticked)
    expect(maybe.subscriptions(muted)).toEqual([])
    expect(Opt.map(muted.children.Ticker, ({ instance, state }) => ({ instance, state })))
      .toEqual(Opt.some({ instance: 1, state: { ticks: 1 } }))
    const { state: unmuted } = applyAll(maybe.update, ["Unmuted"], muted)
    expect(maybe.subscriptions(unmuted)).toEqual(listed)
    expect(stateAt(unmuted.children.Ticker)).toEqual({ ticks: 1 })
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
      Left: child(counter),
      Right: childWhen(counter, { there: (state) => state.right })
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

  // The ticker starts in the very same state object, its `init`, at each start.
  test("a child started again on the very same state makes its own keys, under its new instance", () => {
    type Shown = Readonly<{ shown: boolean }>
    const Shown = program<{ state: Shown; message: "Toggled" }>()
    const toggling = Shown.withChildren({ Ticker: childWhen(ticker, { there: (state) => state.shown }) }).make({
      init: { state: { shown: true } },
      update: () => (state) => ({ state: { shown: !state.shown } }),
      makeModel: () => null
    })
    const first = toggling.subscriptions(toggling.init.state)
    const again = applyAll(toggling.update, ["Toggled", "Toggled"], toggling.init.state).state
    expect(stateAt(again.children.Ticker)).toBe(stateAt(toggling.init.state.children.Ticker))
    expect(first).toEqual([{ _tag: "Ticker", instance: 1, key: "ticks" }])
    expect(toggling.subscriptions(again)).toEqual([{ _tag: "Ticker", instance: 2, key: "ticks" }])
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
      Clock: child(ticker),
      Tickers: childById(ticker, { ids: (state) => state.ids })
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
      Tickers: childById(ticker, {
        ids: (state) => state.ids,
        listening: (state, id) => state.listening.includes(id)
      })
    }).make({ init: { state: { ids: [7, 8], listening: [7] } }, makeModel: () => null })
    expect(some.subscriptions(some.init.state)).toEqual([{ _tag: "Tickers", id: 7, instance: 1, key: "ticks" }])
    expect(some.update({ _tag: "Tickers", id: 8, message: { _tag: "Tick" } })(some.init.state)).not.toBe(reject)
  })

  test("the model of a child at an id that is not there is a defect that names it and its id", () => {
    const asking = List.withChildren({ Rows: childById(counter, { ids: (state) => state.ids }) }).make({
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
      Tickers: childById({
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
  Row: childById(labelled, {
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
  One: childWhen(loader, { there: (state) => state.open, key: (state) => ({ generation: state.generation }) })
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

  test("a message that names no instance reaches the instance there", () => {
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

  // A parent whose model holds the number of each child's instance, for its view: a child that is always there, one
  // that is there while open, and rows by id.
  type Shown = Readonly<{ open: boolean; ids: ReadonlyArray<number> }>
  type ShownMessage = Readonly<{ _tag: "Toggled" }> | Readonly<{ _tag: "Listed"; ids: ReadonlyArray<number> }>
  const Shown = program<{ state: Shown; message: ShownMessage }>()
  const shown = Shown.withChildren({
    Always: child(loader),
    Maybe: childWhen(loader, { there: (state) => state.open }),
    Each: childById(loader, { ids: (state) => state.ids })
  }).make({
    init: { state: { open: true, ids: [7] } },
    update: (message) => (state) =>
      message._tag === "Toggled"
        ? { state: { ...state, open: !state.open } }
        : { state: { ...state, ids: message.ids } },
    onEvent: {
      Always: () => (state) => ({ state }),
      Maybe: () => (state) => ({ state }),
      Each: () => (state) => ({ state })
    },
    makeModel: (state, children) => ({
      always: children.Always.instance(),
      maybe: children.Maybe.instance(),
      each: state.ids.map((id) => ({ id, instance: children.Each.instance(id) }))
    })
  })
  type ShownAll = MessageOf<typeof shown>
  const toggled: ShownAll = { _tag: "Toggled" }
  const listed = (...ids: ReadonlyArray<number>): ShownAll => ({ _tag: "Listed", ids })
  const shownAfter = (...messages: ReadonlyArray<ShownAll>) => applyAll(shown.update, messages, shown.init.state).state
  const bump: RowMessage = { _tag: "Bumped" }

  test("makeModel reads the number of an instance as a model: a value, an Option for a child that may not be there, by id", () => {
    expectTypeOf<ModelOf<typeof shown>>().toEqualTypeOf<{
      always: number
      maybe: Opt.Option<number>
      each: Array<{ id: number; instance: number }>
    }>()
    expect(shown.makeModel(shown.init.state)).toEqual({
      always: 1,
      maybe: Opt.some(2),
      each: [{ id: 7, instance: 3 }]
    })
    expect(shown.makeModel(shownAfter(toggled)).maybe).toEqual(Opt.none())
    // Each start is another instance, with the next number: of the child alone, then of the row at the id of before.
    expect(shown.makeModel(shownAfter(toggled, toggled, listed(), listed(7, 8)))).toEqual({
      always: 1,
      maybe: Opt.some(4),
      each: [{ id: 7, instance: 5 }, { id: 8, instance: 6 }]
    })
  })

  test("a message of a view that names its instance is rejected once the child has started again", () => {
    const sent: Array<ShownAll> = []
    const dispatch: Dispatch<ShownAll> = (message) => void sent.push(message)
    // The dispatches that a view makes as it draws the first state.
    const drawn = shown.makeModel(shown.init.state)
    const always = forwardTo(dispatch, { _tag: "Always", instance: drawn.always })
    const maybe = forwardTo(dispatch, { _tag: "Maybe", instance: Opt.getOrThrow(drawn.maybe) })
    const each = forwardTo(dispatch, { _tag: "Each", id: 7, instance: Opt.getOrThrow(Arr.head(drawn.each)).instance })
    always(bump)
    maybe(bump)
    each(bump)
    expect(sent).toEqual([
      { _tag: "Always", instance: 1, message: bump },
      { _tag: "Maybe", instance: 2, message: bump },
      { _tag: "Each", id: 7, instance: 3, message: bump }
    ])
    const [toAlways, toMaybe, toEach] = sent as [ShownAll, ShownAll, ShownAll]
    // While the instance it was drawn for is there, each applies, whatever else the state did.
    const later = shownAfter(listed(7, 8))
    expect(shown.update(toAlways)(later)).not.toBe(reject)
    expect(shown.update(toMaybe)(later)).not.toBe(reject)
    expect(shown.update(toEach)(later)).not.toBe(reject)
    // Closed and opened again, and removed and listed again at its id: the child there is another instance.
    const again = shownAfter(toggled, toggled, listed(), listed(7))
    expect(shown.update(toAlways)(again)).not.toBe(reject)
    expect(shown.update(toMaybe)(again)).toBe(reject)
    expect(shown.update(toEach)(again)).toBe(reject)
    // The same messages with no instance reach the instances there, and so do those of a view drawn for them.
    expect(shown.update({ _tag: "Maybe", message: bump })(again)).not.toBe(reject)
    expect(shown.update({ _tag: "Each", id: 7, message: bump })(again)).not.toBe(reject)
    const redrawn = shown.makeModel(again)
    sent.length = 0
    forwardTo(dispatch, { _tag: "Maybe", instance: Opt.getOrThrow(redrawn.maybe) })(bump)
    const bumped = accepted(shown.update(Opt.getOrThrow(Arr.head(sent)))(again)).state
    expect(stateAt(bumped.children.Maybe).count).toBe(1)
    // A child alone started again in one step by a new key: the view drawn before named the old instance.
    const opened = singleAfter("Opened").state
    const toOne: Array<MessageOf<typeof single>> = []
    const singleDispatch: Dispatch<MessageOf<typeof single>> = (message) => void toOne.push(message)
    forwardTo(singleDispatch, { _tag: "One", instance: Opt.getOrThrow(instanceOf(opened)) })(bump)
    const [toOld] = toOne as [MessageOf<typeof single>]
    expect(single.update(toOld)(opened)).not.toBe(reject)
    expect(single.update(toOld)(accepted(single.update({ _tag: "Renewed" })(opened)).state)).toBe(reject)
  })

  test("in a run, a message of a view drawn for an instance that is gone is ignored", () => {
    const ignored: Array<ShownAll> = []
    const { app } = start(shown, { onIgnored: ({ message }) => void ignored.push(message) })
    const maybe = forwardTo(app.dispatch, { _tag: "Maybe", instance: Opt.getOrThrow(app.model().maybe) })
    app.dispatch(toggled)
    app.dispatch(toggled)
    maybe(bump)
    expect(ignored).toEqual([{ _tag: "Maybe", instance: 2, message: bump }])
    expect(app.model().maybe).toEqual(Opt.some(4))
  })

  test("the instance of a child at an id that is not there is a defect that names it and its id", () => {
    const Peek = program<{ state: object }>()
    const peek = Peek.withChildren({ Row: childById(loader, { ids: () => [1] }) }).make({
      init: { state: {} },
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: (_, children) => children.Row.instance(9)
    })
    const error = thrown(() => peek.makeModel(peek.init.state))
    expect(error).toBeInstanceOf(CompositionDefect)
    expect(error).toMatchObject({ child: "Row", id: 9, message: "The instance of \"Row\", which is not in this state" })
  })

  test("a subscription's message carries its instance, and is rejected once that instance is gone, by id and alone", () => {
    const first = after(added(1)).state
    const key = Opt.getOrThrow(Arr.head(rowList.subscriptions(first)))
    expect(key).toEqual({ _tag: "Row", id: 1, instance: 1, key: "bumps" })
    const lifted = rowList.listen(key)
    const message = Opt.getOrThrow(Effect.runSync(Channel.runHead(lifted)))
    expect(message).toEqual({ _tag: "Row", id: 1, instance: 1, message: { _tag: "Bumped" } })
    expect(rowList.update(message)(first)).not.toBe(reject)
    const again = applyAll(rowList.update, [{ _tag: "Removed", id: 1 }, added(1)], first).state
    expect(rowList.update(message)(again)).toBe(reject)
    const opened = singleAfter("Opened").state
    const alone = Opt.getOrThrow(Arr.head(single.subscriptions(opened)))
    expect(alone).toEqual({ _tag: "One", instance: 1, key: "bumps" })
    const heard = Opt.getOrThrow(Effect.runSync(Channel.runHead(single.listen(alone))))
    expect(heard).toEqual({ _tag: "One", instance: 1, message: { _tag: "Bumped" } })
    expect(single.update(heard)(opened)).not.toBe(reject)
    expect(single.update(heard)(singleAfter("Opened", "Closed", "Opened").state)).toBe(reject)
  })
})

describe("the children that the library keeps", () => {
  test("init starts each child its first state lists, with its first commands, by the order of the names as JavaScript gives the keys, then of the ids as listed", () => {
    const Started = program<{ state: Readonly<{ ids: ReadonlyArray<number> }>; command: "Boot" }>()
    const started = Started.withChildren({
      Second: childById(loader, { ids: (state) => state.ids }),
      "01": child(loader),
      First: child(loader),
      "4294967295": child(loader),
      "7": child(loader),
      "-1": child(loader),
      "2": child(loader)
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

  test("a step that lists several children anew starts them by the order of the names, then of the ids as listed, each with the next number", () => {
    type Desk = Readonly<{ rows: ReadonlyArray<number>; open: boolean; cells: ReadonlyArray<number> }>
    const Desk = program<{ state: Desk; message: "Opened" }>()
    const desk = Desk.withChildren({
      Rows: childById(ticker, { ids: (state) => state.rows }),
      Alone: childWhen(ticker, { there: (state) => state.open }),
      Cells: childById(ticker, { ids: (state) => state.cells })
    }).make({
      init: { state: { rows: [], open: false, cells: [] } },
      update: () => () => ({ state: { rows: [5, 2], open: true, cells: [9] } }),
      makeModel: () => null
    })
    const { state } = applyAll(desk.update, ["Opened"], desk.init.state)
    expect({
      rows: state.own.rows.map((id) => Opt.map(HashMap.get(state.children.Rows, id), (row) => row.instance)),
      alone: Opt.map(state.children.Alone, (alone) => alone.instance),
      cells: Opt.map(HashMap.get(state.children.Cells, 9), (cell) => cell.instance),
      starts: state.starts
    }).toEqual({ rows: [Opt.some(1), Opt.some(2)], alone: Opt.some(3), cells: Opt.some(4), starts: 4 })
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

  test("the state after a child is dropped lists none of its keys, by id and alone", () => {
    const listed = after(added(1), added(2)).state
    expect(rowList.subscriptions(listed)).toHaveLength(2)
    const { state } = applyAll(rowList.update, [{ _tag: "Removed", id: 1 }], listed)
    expect(rowList.subscriptions(state)).toEqual([{ _tag: "Row", id: 2, instance: 2, key: "bumps" }])
    const opened = singleAfter("Opened").state
    expect(single.subscriptions(opened)).toEqual([{ _tag: "One", instance: 1, key: "bumps" }])
    expect(single.subscriptions(accepted(single.update({ _tag: "Closed" })(opened)).state)).toEqual([])
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
      Seeded: childById(seeded, { flags: (state) => state.ids.map((id) => [id, { seed: id }] as const) })
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

  test("other flags start a child alone again, from them, and flags equal by Equal, a struct made anew, keep it", () => {
    type Seeded = Readonly<{ seed: number; bumps: number }>
    const seeded = program<{ state: Seeded; message: "Bumped"; flags: Readonly<{ seed: number }> }>().make({
      init: (flags) => ({ state: { seed: flags.seed, bumps: 0 } }),
      update: () => (state) => ({ state: { ...state, bumps: state.bumps + 1 } }),
      makeModel: (state) => state.seed
    })
    type Seeds = Readonly<{ seed: number; turn: number }>
    const Seeds = program<{ state: Seeds; message: "Turned" | "Reseeded" }>()
    const seeds = Seeds.withChildren({
      Seeded: childWhen(seeded, { there: (state) => Opt.some({ seed: state.seed }) })
    }).make({
      init: { state: { seed: 1, turn: 0 } },
      update: (message) => (state) =>
        message === "Turned"
          ? { state: { ...state, turn: state.turn + 1 } }
          : { state: { ...state, seed: state.seed + 1 } },
      makeModel: () => null
    })
    const bumped = applyAll(seeds.update, [{ _tag: "Seeded", message: "Bumped" }], seeds.init.state).state
    const turned = applyAll(seeds.update, ["Turned"], bumped).state
    expect(turned.own.turn).toBe(1)
    expect(turned.children).toBe(bumped.children)
    const reseeded = applyAll(seeds.update, ["Reseeded"], bumped).state
    expect(reseeded.children.Seeded).toEqual(Opt.some({ instance: 2, key: { seed: 2 }, state: { seed: 2, bumps: 0 } }))
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

  describe("a key that gives a function made anew", () => {
    // "Copied" makes the own state anew, equal to the one before.
    const Restless = program<{ state: Ticks; message: "Copied" }>()
    const restless = Restless.withChildren({ Ticker: child(ticker, { key: () => () => undefined }) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state: { ...state } }),
      makeModel: () => null
    })
    const ticked = applyAll(restless.update, [{ _tag: "Ticker", message: { _tag: "Tick" } }], restless.init.state).state
    const tickerOf = (state: StateOf<typeof restless>) =>
      Opt.map(state.children.Ticker, ({ instance, state }) => ({ instance, state }))

    test("starts the child again at a step that makes the own state anew, from its init, with no error", () => {
      expect(tickerOf(ticked)).toEqual(Opt.some({ instance: 1, state: { ticks: 1 } }))
      const { state } = applyAll(restless.update, ["Copied"], ticked)
      expect(tickerOf(state)).toEqual(Opt.some({ instance: 2, state: noTicks }))
    })
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
    const twiceAtStart = Twice.withChildren({ Row: childById(loader, { ids: (state) => state.ids }) }).make({
      init: (id) => ({ state: { ids: [id, id] } }),
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(() => twiceAtStart.init(1)).toThrow(twice)
    // A first step that is a value is taken as the parent is made.
    const Once = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const makeTwice = () =>
      Once.withChildren({ Row: childById(loader, { ids: (state) => state.ids }) }).make({
        init: { state: { ids: [1, 1] } },
        onEvent: { Row: () => (state) => ({ state }) },
        makeModel: () => null
      })
    expect(makeTwice).toThrow(twice)
  })

  // It holds a part of the invariant "The children are those the parent's own state lists…" of docs/invariants.md:
  // children by id whose ids give the very same object are not reconciled, a cost bounded by `ids` being pure. The
  // state written by hand, which holds none of the children its own state lists and whose fate `Kept` leaves
  // unspecified, is only the probe that shows what is reconciled: a reconciliation would start the row again.
  test("children by id whose ids give the very same object are left as they are, and others are reconciled", () => {
    type Short = Readonly<{ ids: ReadonlyArray<number>; notes: number }>
    const Short = program<{ state: Short; message: "Noted" | "Relisted" }>()
    const short = Short.withChildren({ Row: childById(loader, { ids: (state) => state.ids }) }).make({
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
    | Readonly<{ _tag: "Told"; id: number; value: string }>
  const Telling = program<{ state: Own; message: Message; external: Readonly<{ _tag: "Set"; condition: string }> }>()
  const parent = (
    first: Own,
    onBounce: (state: Own) => Own = (state) => state,
    say: (condition: string) => string = (condition) => condition
  ) =>
    Telling.withChildren({
      Kid: childById(hearing, {
        ids: (state) => state.ids,
        // A new object at each call: what was told is compared by value.
        tell: (state) => ({ _tag: "Cond", value: say(state.condition) })
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
          case "Told":
            return {
              state: { ...state },
              tell: [{ _tag: "Kid", id: message.id, message: { _tag: "Cond", value: message.value } }]
            }
        }
      },
      external: ({ condition }) => (state) => ({ state: { ...state, condition } }),
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

  test("a step that gives another value, by Equal, tells every child, and one that gives an equal value tells none", () => {
    const app = parent(start)
    const { state: changed } = accepted(app.update({ _tag: "Set", condition: "c" })(app.init.state))
    expect(heard(changed)).toEqual([["a", "c"], ["a", "c"]])
    // Another own state, and an equal value in another object.
    const { state: touched } = accepted(app.update({ _tag: "Touched" })(changed))
    expect(heard(touched)).toEqual([["a", "c"], ["a", "c"]])
    expect(touched.children).toBe(changed.children)
  })

  test("children by id are told in the order their ids are listed, and two names in the order of withChildren", () => {
    const app = parent({ ...start, ids: [2, 1] })
    expect(accepted(app.update({ _tag: "Set", condition: "x" })(app.init.state)).commands).toEqual([
      { _tag: "Kid", id: 2, instance: 1, command: "Answered" },
      { _tag: "Kid", id: 1, instance: 2, command: "Answered" }
    ])
    const Named = program<{ state: Readonly<{ condition: string }>; message: "Set" }>()
    const named = Named.withChildren({
      Second: child(hearing, { tell: (state) => ({ _tag: "Cond", value: state.condition }) }),
      First: child(hearing, { tell: (state) => ({ _tag: "Cond", value: state.condition }) })
    }).make({
      init: { state: { condition: "a" } },
      update: () => () => ({ state: { condition: "x" } }),
      onEvent: { Second: () => (state) => ({ state }), First: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(accepted(named.update("Set")(named.init.state)).commands).toEqual([
      { _tag: "Second", instance: 1, command: "Answered" },
      { _tag: "First", instance: 2, command: "Answered" }
    ])
  })

  test("what the declaration tells is told before what the step lists in tell", () => {
    const app = parent(start)
    const { state } = accepted(app.update({ _tag: "SetAndPoke", condition: "c", id: 2 })(app.init.state))
    expect(heard(state)).toEqual([["a", "c"], ["a", "c", "poke"]])
  })

  test("a step of the parent's external that gives another value tells every child, and one that gives an equal value tells none", () => {
    const app = parent(start)
    const { state: changed } = app.external({ _tag: "Set", condition: "c" })(app.init.state)
    expect(heard(changed)).toEqual([["a", "c"], ["a", "c"]])
    const { state: same } = app.external({ _tag: "Set", condition: "c" })(changed)
    expect(heard(same)).toEqual([["a", "c"], ["a", "c"]])
  })

  test("what a step lists in tell is told apart: even the value the declaration gives, and it is not what the declaration last told", () => {
    const app = parent(start)
    // The declaration last told "a", and the step tells "a" again.
    const { state: again } = accepted(app.update({ _tag: "Told", id: 2, value: "a" })(app.init.state))
    expect(heard(again)).toEqual([["a"], ["a", "a"]])
    // The step tells "z", while the declaration still gives "a".
    const { state: other } = accepted(app.update({ _tag: "Told", id: 2, value: "z" })(again))
    expect(heard(other)).toEqual([["a"], ["a", "a", "z"]])
    // A step that keeps the declaration's value tells nothing more: what it last told is still "a".
    const { state: kept } = accepted(app.update({ _tag: "Touched" })(other))
    expect(heard(kept)).toEqual([["a"], ["a", "a", "z"]])
  })

  test("what a step lists in tell is bound first: a child that an answer to the declaration dropped is told nothing", () => {
    // The first child, told "b", bounces, and the parent drops the second, which the step tells.
    const app = parent(start, (state) => state.condition === "b" ? { ...state, ids: [1] } : state)
    const { state } = accepted(app.update({ _tag: "SetAndPoke", condition: "b", id: 2 })(app.init.state))
    expect(state.own.ids).toEqual([1])
    expect(heard(state)).toEqual([["a", "b"]])
  })

  test("what a step lists in tell is bound first: a child that an answer to the declaration started again is told nothing", () => {
    type Keyed = Readonly<{ condition: string; generation: number }>
    const Keyed = program<{ state: Keyed; message: Readonly<{ _tag: "SetAndPoke"; condition: string }> }>()
    // The first child, told "b", bounces, and the parent starts the second, which the step tells, again.
    const app = Keyed.withChildren({
      Kid: child(hearing, { tell: (state) => ({ _tag: "Cond", value: state.condition }) }),
      Other: child(hearing, { key: (state) => state.generation })
    }).make({
      init: { state: { condition: "a", generation: 0 } },
      update: ({ condition }) => (state) => ({
        state: { ...state, condition },
        tell: [{ _tag: "Other", message: { _tag: "Poke" } }]
      }),
      onEvent: {
        Kid: () => (state) => ({ state: { ...state, generation: state.generation + 1 } }),
        Other: () => (state) => ({ state })
      },
      makeModel: (_, children) => [children.Kid().heard, children.Other().heard]
    })
    const { state } = accepted(app.update({ _tag: "SetAndPoke", condition: "b" })(app.init.state))
    expect(Opt.map(state.children.Other, (kept) => kept.instance)).toEqual(Opt.some(3))
    expect(app.makeModel(state)).toEqual([["a", "b"], []])
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
      Kid: childWhen(hearing, {
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
      Kid: childById(hearing, {
        ids: (state) => {
          reads += 1
          return state.ids
        },
        tell: (state) => {
          calls += 1
          return { _tag: "Cond", value: state.condition }
        }
      }),
      Other: childById(hearing, { ids: (state) => state.others, tell: () => ({ _tag: "Poke" }) })
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
        Kid: childById(hearing, {
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
      Inner: childWhen(raising(start), { there: (state) => state.open ? Opt.some("b") : Opt.none() })
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

  test("stateOf tells each child it starts once it is in the state given for it, as a start tells it from its init", () => {
    const app = parent(start)
    const state = stateOf(app, { condition: "c", ids: [1, 2], bounces: 0 }, { Kid: [[2, { heard: ["given"] }]] })
    expect(heard(state)).toEqual([["c"], ["given", "c"]])
    // Each child was last told what the own state gives: a step that keeps the value tells it nothing.
    expect(heard(accepted(app.update({ _tag: "Touched" })(state)).state)).toEqual([["c"], ["given", "c"]])
    // A handler that answers what a child is told, by telling it again, reaches the state given.
    const Poking = program<{ state: Own }>()
    const poking = Poking.withChildren({
      Kid: childById(hearing, {
        ids: (state) => state.ids,
        tell: (state) => ({ _tag: "Cond", value: state.condition })
      })
    }).make({
      init: { state: start },
      onEvent: { Kid: (id) => (state) => ({ state, tell: [{ _tag: "Kid", id, message: { _tag: "Poke" } }] }) },
      makeModel: () => null
    })
    const poked = stateOf(poking, { condition: "b", ids: [1], bounces: 0 }, { Kid: [[1, { heard: ["given"] }]] })
    expect(heard(poked)).toEqual([["given", "b", "poke"]])
  })

  test("stateOf refuses a handler that gives another own state, and one that raises an event of the parent's own", () => {
    const app = parent(start)
    expect(() => stateOf(app, { condition: "b", ids: [1], bounces: 0 })).toThrow(
      "stateOf: a handler of onEvent gives another own state, in answer to what a child is told"
    )
    // An equal copy is another state too.
    const Copying = program<{ state: Own }>()
    const copying = Copying.withChildren({
      Kid: childById(hearing, {
        ids: (state) => state.ids,
        tell: (state) => ({ _tag: "Cond", value: state.condition })
      })
    }).make({
      init: { state: start },
      onEvent: { Kid: () => (state) => ({ state: { ...state } }) },
      makeModel: () => null
    })
    expect(() => stateOf(copying, { condition: "b", ids: [1], bounces: 0 })).toThrow(
      "stateOf: a handler of onEvent gives another own state, in answer to what a child is told"
    )
    const Raising = program<{ state: Own; event: "Up" }>()
    const raising = Raising.withChildren({
      Kid: childById(hearing, {
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

  test("what tell throws on the own state before the step, as a child starts, the step throws as it is", () => {
    const failure = new Error("no word for it")
    const Moving = program<{ state: Own; message: "Moved" }>()
    // No child is there at the start, so nothing reads `tell` of the first state until the step starts one, and the
    // state after the step gives a value.
    const moving = Moving.withChildren({
      Kid: childById(hearing, {
        ids: (state) => state.ids,
        tell: (state) => {
          if (state.condition === "boom") throw failure
          return { _tag: "Cond", value: state.condition }
        }
      })
    }).make({
      init: { state: { condition: "boom", ids: [], bounces: 0 } },
      update: () => (state) => ({ state: { ...state, condition: "a", ids: [1] } }),
      onEvent: { Kid: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(thrown(() => moving.update("Moved")(moving.init.state))).toBe(failure)
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
    Kid: childById(hearing, {
      flags: (state) => state.kids,
      tell: (state) => ({ _tag: "Cond", value: kidValue(state) })
    }),
    Solo: childWhen(hearing, {
      there: (state) => state.solo,
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
  // Every child was last told what the own state gives, and never one value twice in a row. What a child given to
  // `stateOf` heard before is the test's, by the instance's number: only what follows it is checked. The instances are
  // distinct, and none is above the number of starts.
  const agrees = (state: StateOf<typeof scripted>, given: ReadonlyMap<number, number> = new Map()) => {
    const instances = [
      ...Arr.map([...HashMap.values(state.children.Kid)], (kept) => kept.instance),
      ...Arr.map(Opt.toArray(state.children.Solo), (kept) => kept.instance)
    ]
    expect(new Set(instances).size).toBe(instances.length)
    for (const instance of instances) expect(instance).toBeLessThanOrEqual(state.starts)
    const told = (kept: Instance<Heard>, value: string) => {
      const heard = kept.state.heard.slice(given.get(kept.instance) ?? 0)
      expect(heard.at(-1)).toBe(value)
      expect(Arr.filter(heard, (said, at) => at > 0 && heard[at - 1] === said)).toEqual([])
    }
    const ascending = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b)
    expect(ascending(HashMap.keys(state.children.Kid))).toEqual(ascending(Arr.map(state.own.kids, ([id]) => id)))
    for (const kept of HashMap.values(state.children.Kid)) told(kept, kidValue(state.own))
    expect(Opt.isSome(state.children.Solo)).toBe(Opt.isSome(state.own.solo))
    for (const kept of Opt.toArray(state.children.Solo)) told(kept, soloValue(state.own))
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

  // An own state of an empty script, since a handler that changes the own state is an error of `stateOf`, and for each
  // child that it lists, maybe what it heard before.
  const said = fc.array(fc.constantFrom("k0", "k1", "k2", "low", "high"), { maxLength: 3 })
  const placed = first.map((own): Own => ({ ...own, script: [] })).chain((own) =>
    fc.record({
      kid: fc.array(fc.option(said, { nil: undefined }), { minLength: own.kids.length, maxLength: own.kids.length }),
      solo: fc.option(said, { nil: undefined })
    }).map(({ kid, solo }) => ({ own, kid, solo }))
  )

  test("so was every child of a state that stateOf makes, whatever state it was given, and of what follows", () => {
    fc.assert(
      fc.property(placed, fc.array(message, { maxLength: 20 }), ({ kid, own, solo }, messages) => {
        const kids = Arr.flatMap(own.kids, ([id], at) => {
          const heard = kid[at]
          return heard === undefined ? [] : [[id, { heard }] as const]
        })
        const alone = Opt.isSome(own.solo) && solo !== undefined
        let state = stateOf(scripted, own, { Kid: kids, ...(alone ? { Solo: { heard: solo } } : {}) })
        const given = new Map<number, number>()
        for (const [id, { heard }] of kids) {
          given.set(Opt.getOrThrow(HashMap.get(state.children.Kid, id)).instance, heard.length)
        }
        if (alone) given.set(Opt.getOrThrow(state.children.Solo).instance, solo.length)
        agrees(state, given)
        for (const message of messages) {
          const result = scripted.update(message)(state)
          if (result !== reject) state = result.state
          agrees(state, given)
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
  type Look = "Looked" | "FlipCeiling"
  const Room = program<{ state: Room; message: Look; external: Look; output: number }>()
  const room = Room.withChildren({
    Ceiling: child(lamp),
    Desk: childWhen(lamp, { there: (state) => state.desk }),
    Wall: childById(lamp, { ids: (state) => state.lamps })
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
    external: (message, children) => (state) =>
      message === "Looked"
        ? { state: { ...state, seen: [children.Ceiling.output()] } }
        : { state: { ...state, seen: [children.Ceiling.output()] }, tell: [{ _tag: "Ceiling", message: flip }] },
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
    const flipped = accepted(room.external("FlipCeiling")(lit)).state
    expect(flipped.own.seen).toEqual([true])
    expect(stateAt(flipped.children.Ceiling)).toEqual({ on: false })
  })

  test("a child that the step keeps, and tells before anything else changes it, is told in the state that it read", () => {
    // A lamp told what its parent read of it, whose external is a defect where its state says otherwise; and a bell
    // whose ring its parent answers by flipping the lamp.
    const checked = program<{ state: Lamp; message: "Pressed"; external: boolean | Flip; output: boolean }>().make({
      init: { state: { on: false } },
      update: () => (state) => ({ state: { on: !state.on } }),
      external: (told) => (state) => {
        if (typeof told !== "boolean") return { state: { on: !state.on } }
        if (state.on !== told) throw defect("told what its output ruled out")
        return { state }
      },
      output: (state) => state.on,
      makeModel: () => null
    })
    const bell = program<{ state: object; message: "Pressed"; event: "Rang"; external: "Ring" }>().make({
      init: { state: {} },
      update: () => (state) => ({ state }),
      external: () => (state) => ({ state, events: ["Rang"] }),
      makeModel: () => null
    })
    type Told = "Kept" | "KeptById" | "Restarted" | "AfterBell"
    const Desk = program<
      { state: Readonly<{ key: number; ids: ReadonlyArray<number> }>; message: Told; external: "Kept" }
    >()
    const desk = Desk.withChildren({
      Lamp: child(checked, { key: (state) => state.key }),
      Lamps: childById(checked, { ids: (state) => state.ids }),
      Bell: child(bell)
    }).make({
      init: { state: { key: 0, ids: [] } },
      update: (message, children) => (state) => {
        const read = { _tag: "Lamp", message: children.Lamp.output() } as const
        return message === "Kept"
          ? { state, tell: [read] }
          : message === "KeptById"
          ? { state, tell: [{ _tag: "Lamps", id: 1, message: children.Lamps.output(1) }] }
          : message === "Restarted"
          ? { state: { ...state, key: state.key + 1 }, tell: [read] }
          : { state, tell: [{ _tag: "Bell", message: "Ring" }, read] }
      },
      external: (_, children) => (state) => ({ state, tell: [{ _tag: "Lamp", message: children.Lamp.output() }] }),
      onEvent: { Bell: () => (state) => ({ state, tell: [{ _tag: "Lamp", message: flip }] }) },
      makeModel: () => null
    })
    const on = stateOf(desk, { key: 0, ids: [1] }, { Lamp: { on: true }, Lamps: [[1, { on: true }]] })
    expect(stateAt(accepted(desk.update("Kept")(on)).state.children.Lamp)).toEqual({ on: true })
    expect(stateAt(desk.external("Kept")(on).state.children.Lamp)).toEqual({ on: true })
    const byId = accepted(desk.update("KeptById")(on)).state.children.Lamps
    expect(Opt.map(HashMap.get(byId, 1), (row) => row.state)).toEqual(Opt.some({ on: true }))
    expect(thrown(() => desk.update("Restarted")(on))).toBeInstanceOf(InvariantDefect)
    expect(thrown(() => desk.update("AfterBell")(on))).toBeInstanceOf(InvariantDefect)
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
    const hall = Hall.withChildren({ Lamp: child(lamp), Toggle: child(toggle) }).make({
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
    const house = House.withChildren({ Room: child(room) }).make({
      init: { state: {} },
      makeModel: (_, children) => children.Room.output()
    })
    expect(house.makeModel(stateOf(house, {}, { Room: lit }))).toBe(2)
  })

  test("subscriptions reads the outputs of the children of the state it is given", () => {
    // A hall that listens for the dark while its ceiling's lamp is off, and to each lamp of its wall that is on.
    type Key = "Dark" | Readonly<{ _tag: "Lit"; id: number }>
    const Hall = program<{ state: Readonly<{ lamps: ReadonlyArray<number> }>; key: Key }>()
    const hall = Hall.withChildren({
      Ceiling: child(lamp),
      Wall: childById(lamp, { ids: (state) => state.lamps })
    }).make({
      init: { state: { lamps: [1, 2] } },
      subscriptions: (state, children) => [
        ...(children.Ceiling.output() ? [] : ["Dark" as const]),
        ...state.lamps.filter((id) => children.Wall.output(id)).map((id) => ({ _tag: "Lit", id }) as const)
      ],
      listen: () => Channel.never,
      onEvent: { Ceiling: () => (state) => ({ state }), Wall: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(hall.subscriptions(hall.init.state)).toEqual(["Dark"])
    const lit = stateOf(hall, { lamps: [1, 2] }, { Ceiling: { on: true }, Wall: [[2, { on: true }]] })
    expect(hall.subscriptions(lit)).toEqual([{ _tag: "Lit", id: 2 }])
    // A child's step alone, which leaves the hall's own state the very same, changes what the hall lists.
    const pressed = accepted(hall.update({ _tag: "Wall", id: 1, message: "Pressed" })(lit)).state
    expect(pressed.own).toBe(lit.own)
    expect(hall.subscriptions(pressed)).toEqual([{ _tag: "Lit", id: 1 }, { _tag: "Lit", id: 2 }])
  })

  test("the output of a child at an id that is not there is a defect that names it and its id", () => {
    const Peek = program<{ state: object; message: "Peeked" }>()
    const peek = Peek.withChildren({ Wall: childById(lamp, { ids: () => [1] }) }).make({
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
    // Each function is given the own state alone, which has no `children`.
    type Own = Readonly<{ looks: number }>
    const Reading = program<{ state: Own; message: "Go"; external: "Went"; output: number; key: "Lit" }>()
    const reading = Reading.withChildren({ Lamp: child(lamp), Counter: child(counter) }).make({
      init: { state: { looks: 0 } },
      update: (_, children) => (state) => {
        expectTypeOf(children.Lamp.output).toEqualTypeOf<() => boolean>()
        expectTypeOf(state).toEqualTypeOf<Own>()
        // @ts-expect-error: the counter declares no output.
        void children.Counter
        // @ts-expect-error: a child's model is for the view, and is read in `makeModel` alone.
        void children.Lamp()
        // @ts-expect-error: so is the number of its instance.
        void children.Lamp.instance
        return { state }
      },
      external: (_, children) => (state) => {
        expectTypeOf(state).toEqualTypeOf<Own>()
        // @ts-expect-error: nor in `external`.
        void children.Lamp()
        return { state }
      },
      onEvent: {
        Lamp: (_, children) => (state) => {
          expectTypeOf(state).toEqualTypeOf<Own>()
          // @ts-expect-error: nor in `onEvent`.
          void children.Lamp()
          return { state }
        },
        Counter: () => (state) => ({ state })
      },
      output: (state, children) => {
        expectTypeOf(state).toEqualTypeOf<Own>()
        // @ts-expect-error: nor in `output`.
        void children.Lamp()
        return state.looks
      },
      subscriptions: (state, children) => {
        expectTypeOf(state).toEqualTypeOf<Own>()
        expectTypeOf(children.Lamp.output).toEqualTypeOf<() => boolean>()
        // @ts-expect-error: nor in `subscriptions`.
        void children.Lamp()
        // @ts-expect-error: the counter declares no output.
        void children.Counter
        return children.Lamp.output() ? ["Lit"] : []
      },
      listen: () => Channel.never,
      makeModel: (_, children) => {
        // @ts-expect-error: the counter declares no output.
        void children.Counter.output
        expectTypeOf(children.Counter.instance).toEqualTypeOf<() => number>()
        return children.Lamp.output()
      }
    })
    expectTypeOf<ModelOf<typeof reading>>().toEqualTypeOf<boolean>()
  })

  test("a parent's functions written apart from make are typed by what its children output and are told", () => {
    type Hall = Readonly<{ ids: ReadonlyArray<number>; lit: number }>
    type Go = Readonly<{ _tag: "Go" }>
    const Hall = program<{ state: Hall; message: Go; external: Go; output: number; key: "Lit" }>()
    // Declared apart from `withChildren`, so that the handlers are typed by them.
    const lamps = {
      Main: child(lamp),
      Wall: childById(lamp, { ids: (state: Hall) => state.ids }),
      Ticker: child(ticker)
    }
    expectTypeOf<TellOf<typeof lamps>>().toEqualTypeOf<
      Readonly<{ _tag: "Main"; message: Flip }> | (Readonly<{ _tag: "Wall"; message: Flip }> & Readonly<{ id: number }>)
    >()
    expectTypeOf<OutputsOf<typeof lamps>>().toEqualTypeOf<{
      readonly Main: Readonly<{ output: () => boolean }>
      readonly Wall: Readonly<{ output: (id: number) => boolean }>
    }>()
    expectTypeOf<TellOf<{ Ticker: typeof lamps.Ticker }>>().toEqualTypeOf<never>()
    const lit = (state: Hall, children: OutputsOf<typeof lamps>): number =>
      state.ids.filter((id) => children.Wall.output(id)).length
    const update = (_: Go, children: OutputsOf<typeof lamps>) =>
    (state: Hall): Transition<
      Hall,
      never,
      never,
      TellOf<typeof lamps>
    > => ({ state: { ...state, lit: lit(state, children) }, tell: [{ _tag: "Main", message: flip }] })
    const external = () => (state: Hall): Step<Hall, never, never, TellOf<typeof lamps>> => ({
      state,
      tell: state.ids.map((id) => ({ _tag: "Wall", id, message: flip }))
    })
    const flipped = (_: number, __: "Flipped", children: OutputsOf<typeof lamps>) => (state: Hall) => ({
      state: { ...state, lit: lit(state, children) }
    })
    const output = (state: Hall, children: OutputsOf<typeof lamps>) => lit(state, children)
    const subscriptions = (state: Hall, children: OutputsOf<typeof lamps>): ReadonlyArray<"Lit"> =>
      lit(state, children) > 0 ? ["Lit"] : []
    const hall = Hall.withChildren(lamps).make({
      init: { state: { ids: [1, 2], lit: 0 } },
      update,
      external,
      onEvent: { Main: () => (state) => ({ state }), Wall: flipped },
      output,
      subscriptions,
      listen: () => Channel.never,
      // What `makeModel` is given has the outputs too.
      makeModel: (state, children) => lit(state, children)
    })
    const told = hall.external({ _tag: "Go" })(hall.init.state).state
    expect(hall.makeModel(told)).toBe(2)
    expect([hall.output(hall.init.state), hall.output(told)]).toEqual([0, 2])
    expect(hall.subscriptions(hall.init.state).includes("Lit")).toBe(false)
    expect(hall.subscriptions(told).includes("Lit")).toBe(true)
    const counted = hall.update({ _tag: "Go" })(told)
    expect(counted === reject ? undefined : counted.state.own.lit).toBe(2)
    const pressed = hall.update({ _tag: "Wall", id: 1, message: "Pressed" })(told)
    expect(pressed === reject ? undefined : pressed.state.own.lit).toBe(1)
    // @ts-expect-error: a lamp is told its external messages alone, not its own.
    const own: TellOf<typeof lamps> = { _tag: "Main", message: "Pressed" }
    // @ts-expect-error: children by id are told with an id.
    const unplaced: TellOf<typeof lamps> = { _tag: "Wall", message: flip }
    // @ts-expect-error: the ticker has no external messages.
    const quiet: TellOf<typeof lamps> = { _tag: "Ticker", message: flip }
    // @ts-expect-error: the ticker declares no output.
    const unread = (children: OutputsOf<typeof lamps>) => children.Ticker
    void [own, unplaced, quiet, unread]
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
    program<{ state: Lamp; message: "Pressed" }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: a program without children has no outputs to read.
      update: (_, children) => (state) => ({ state: children === undefined ? state : state }),
      makeModel: () => null
    })
    program<{ state: Lamp; external: Flip; output: boolean }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: nor in its `external`.
      external: (_, children) => (state) => ({ state: children === undefined ? state : state }),
      // @ts-expect-error: nor in its `output`.
      output: (state, children) => children === undefined && state.on,
      makeModel: () => null
    })
    program<{ state: Lamp; key: "Lit" }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: nor in its `subscriptions`.
      subscriptions: (state, children) => (children === undefined && state.on ? ["Lit"] : []),
      listen: () => Channel.never,
      makeModel: () => null
    })
    program<{ state: Lamp }>().make({
      init: { state: { on: false } },
      // @ts-expect-error: nor in its `makeModel`, which has no children's models either.
      makeModel: (state, children) => (children === undefined ? state.on : state.on)
    })
  })

  test("what the model or the output of a child that may not be there throws, its parent's read throws as it is", () => {
    const failure = new Error("burnt out")
    const broken = program<{ state: Lamp; message: "Pressed"; output: boolean }>().make({
      init: { state: { on: false } },
      update: () => (state) => ({ state }),
      output: () => {
        throw failure
      },
      makeModel: () => {
        throw failure
      }
    })
    const Shelf = program<{ state: Readonly<{ lit: boolean }>; message: "Looked" }>()
    const shelf = Shelf.withChildren({ Bulb: childWhen(broken, { there: (state) => state.lit }) }).make({
      init: { state: { lit: true } },
      update: (_, children) => () => ({ state: { lit: Opt.isSome(children.Bulb.output()) } }),
      makeModel: (_, children) => children.Bulb()
    })
    expect(thrown(() => shelf.update("Looked")(shelf.init.state))).toBe(failure)
    expect(thrown(() => shelf.makeModel(shelf.init.state))).toBe(failure)
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
      Row: childById(labelled, { flags: (state) => state.ids.map((id) => [id, `${id}`] as const) })
    }).make({
      init: { state: { ids: [2, 1] } },
      onEvent: { Row: () => (state) => ({ state }) },
      makeModel: () => null
    })
    expect(stateOf(started, started.init.state.own)).toEqual(started.init.state)
  })

  test("it puts each child in the state given, the others as they start, and numbers them from 1 as a start does", () => {
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
  const pages = Pages.withChildren({ Page: childWhen(page, { there: (state) => state.page }) }).make({
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
    const both = Both.withChildren({ Page: child(page), Left: child(counter) }).make({
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
    expect(() => pages.update({ _tag: "BackPressed" })(stateOf(pages, { page: false })))
      .toThrow("The external message BackPressed to \"Page\", which is not in this state")
  })

  test("a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on", () => {
    const alone = thrown(() => pages.update({ _tag: "BackPressed" })(stateOf(pages, { page: false })))
    expect(alone).toBeInstanceOf(CompositionDefect)
    expect(alone).toMatchObject({ _tag: "CompositionDefect", child: "Page", on: "BackPressed" })
    expect(Object.hasOwn(alone as object, "id")).toBe(false)
    const Clearable = program<{ state: ListState; message: Reset }>()
    const telling = Clearable.withChildren({ Rows: childById(counter, { ids: (state) => state.ids }) }).make({
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
    const unheard = Unheard.withChildren({ Beeper: child(raising) }).make({
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
      Saving: child(saving)
    }).make({ init: { state: noTicks }, makeModel: () => null })
    expect(one.init.commands).toEqual([{ _tag: "Saving", instance: 1, command: { _tag: "Save" } }])
    expect(thrown(() => one.runCommand(Opt.getOrThrow(Arr.head(one.init.commands ?? [])))))
      .toMatchObject({ _tag: "CompositionDefect", child: "Saving", on: "Save" })
    const when = One.withChildren({
      Saving: childWhen(saving, { there: () => true })
    }).make({ init: { state: noTicks }, makeModel: () => null })
    expect(thrown(() => when.runCommand(Opt.getOrThrow(Arr.head(when.init.commands ?? [])))))
      .toMatchObject({ _tag: "CompositionDefect", child: "Saving", on: "Save" })
    const List = program<{ state: ListState }>()
    const list = List.withChildren({
      Rows: childById(saving, { ids: (state) => state.ids })
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
      Ticker: child(deaf)
    }).make({ init: { state: noTicks }, makeModel: () => null })
    const keys = one.subscriptions(one.init.state)
    expect(keys).toEqual([{ _tag: "Ticker", instance: 1, key: "ticks" }])
    expect(thrown(() => one.listen(Opt.getOrThrow(Arr.head(keys))))).toMatchObject({
      _tag: "CompositionDefect",
      child: "Ticker"
    })
    const when = One.withChildren({
      Ticker: childWhen(deaf, { there: () => true })
    }).make({ init: { state: noTicks }, makeModel: () => null })
    const whenKeys = when.subscriptions(when.init.state)
    expect(whenKeys).toEqual([{ _tag: "Ticker", instance: 1, key: "ticks" }])
    expect(thrown(() => when.listen(Opt.getOrThrow(Arr.head(whenKeys))))).toMatchObject({
      _tag: "CompositionDefect",
      child: "Ticker"
    })
    const List = program<{ state: ListState }>()
    const list = List.withChildren({
      Rows: childById(deaf, { ids: (state) => state.ids })
    }).make({ init: { state: { ids: [0] } }, makeModel: () => null })
    const rows: ReadonlyArray<unknown> = list.subscriptions(list.init.state)
    expect(rows).toEqual([{ _tag: "Rows", id: 0, instance: 1, key: "ticks" }])
    expect(thrown(() => list.listen(Opt.getOrThrow(Arr.head(rows)) as never))).toMatchObject({
      _tag: "CompositionDefect",
      child: "Rows",
      id: 0
    })
  })

  // A child's key is listed under its name, as its command is: an own key that takes that name is refused.
  test("an own subscription key that takes the name of a child does not compile, never a silent replacement", () => {
    type Clash = Readonly<{ _tag: "Ticker"; instance: number; key: "ticks" }>
    const { withChildren } = program<{ state: Ticks; message: Tick; key: Clash }>()
    // @ts-expect-error: an own key takes the name of a child.
    const clashing = withChildren({ Ticker: child(ticker) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      subscriptions: () => Array.from<Clash>([{ _tag: "Ticker", instance: 1, key: "ticks" }]),
      listen: () => ticks,
      makeModel: () => null
    })
    // An own key of another name, or a plain string, is the parent's own.
    const own = program<{ state: Ticks; message: Tick; key: "ticks" | Readonly<{ _tag: "Clock" }> }>()
    const apart = own.withChildren({ Ticker: child(ticker) }).make({
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
    const clearing = Clearing.withChildren({ Rows: childById(counter, { ids: (state) => state.ids }) }).make({
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
  const home = Home.withChildren({ Page: child(leaving) }).make({
    init: { state: {} },
    // A parent passes an external message on, from its own `external`.
    external: (message) => (state) => ({ state, tell: [{ _tag: "Page", message }] }),
    onEvent: { Page: (event) => (state) => ({ state, events: [event] }) },
    makeModel: () => null
  })
  type App = Readonly<{ heard: ReadonlyArray<number>; resets: number }>
  const App = program<{ state: App; message: Reset }>()
  const grand = App.withChildren({ Home: child(home) }).make({
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
    Seeded: childWhen(seeded, { there: (state) => state.seed }),
    Rows: childById(seeded, { flags: (state) => state.rows })
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
  const relay = Relay.withChildren({ Inner: child(seeded, { flags: (state) => state.count * 2 }) })
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

  test("a child with flags that is always there is read with no Option, and other flags start it again", () => {
    type Count = Readonly<{ count: number }>
    const counted = program<{ state: Count; flags: number; output: number }>().make({
      init: (count) => ({ state: { count } }),
      output: (state) => state.count,
      makeModel: (state) => state.count
    })
    const Doubled = program<{ state: Count; message: Readonly<{ _tag: "Set"; count: number }> }>()
    const doubled = Doubled.withChildren({ Inner: child(counted, { flags: (state) => state.count * 2 }) })
      .make({
        init: { state: { count: 1 } },
        update: ({ count }) => () => ({ state: { count } }),
        makeModel: (_, children) => ({
          model: children.Inner(),
          output: children.Inner.output(),
          instance: children.Inner.instance()
        })
      })
    expectTypeOf(doubled.makeModel).returns.toEqualTypeOf<{ model: number; output: number; instance: number }>()
    expect(doubled.makeModel(doubled.init.state)).toEqual({ model: 2, output: 2, instance: 1 })
    const same = accepted(doubled.update({ _tag: "Set", count: 1 })(doubled.init.state)).state
    expect(Opt.getOrThrow(same.children.Inner)).toEqual({ instance: 1, key: 2, state: { count: 2 } })
    const other = accepted(doubled.update({ _tag: "Set", count: 3 })(same)).state
    expect(Opt.getOrThrow(other.children.Inner)).toEqual({ instance: 2, key: 6, state: { count: 6 } })
    expect(doubled.makeModel(other)).toEqual({ model: 6, output: 6, instance: 2 })
  })

  test("a parent with flags is started from them by its own parent, alone and by id", () => {
    const Top = program<{ state: object }>()
    const top = Top.withChildren({
      Relay: child(relay, { flags: () => 1 }),
      Rows: childById(relay, { flags: (): ReadonlyArray<readonly [number, number]> => [[9, 5]] })
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
    Relay.withChildren({ Inner: child(seeded, { flags: (state) => state.count }) }).make({
      // @ts-expect-error: its first step depends on its flags.
      init: { state: { count: 0 } },
      onEvent: { Inner: () => (state) => ({ state }) },
      makeModel: () => null
    })
    const Pair = program<{ state: Ticks }>()
    Pair.withChildren({ Ticker: child(ticker) }).make({
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
    // @ts-expect-error: its first step is a value, started from nothing.
    expect(child(ticker, { flags: () => 1 })).toBeDefined()
    // @ts-expect-error: by id too.
    expect(childById(ticker, { flags: (): ReadonlyArray<readonly [number, number]> => [[1, 1]] })).toBeDefined()
    // Options that are no literal: their fields are not checked as fields too many.
    const options = { there: () => true, flags: () => 1 }
    // @ts-expect-error: nor where it may not be there, however its options are written.
    expect(childWhen(ticker, options)).toBeDefined()
  })

  test("a child with flags is declared with them", () => {
    // @ts-expect-error: it would start without them.
    expect(child(seeded)).toBeDefined()
    // @ts-expect-error: nor where it may not be there, with a `there` that gives no flags.
    expect(childWhen(seeded, { there: () => true })).toBeDefined()
    // @ts-expect-error: nor always there, with flags that are an `Option` of them: `there` gives that.
    expect(child(seeded, { flags: () => Opt.some(1) })).toBeDefined()
    // @ts-expect-error: nor where it may not be there, with flags beside `there`.
    expect(childWhen(seeded, { flags: () => 1, there: () => Opt.some(1) })).toBeDefined()
    // @ts-expect-error: nor with options that give none.
    expect(child(seeded, { listening: () => true })).toBeDefined()
    // @ts-expect-error: by id neither.
    expect(childById(seeded, { ids: (): ReadonlyArray<number> => [1] })).toBeDefined()
    // @ts-expect-error: nor with options that list neither ids nor flags.
    expect(childById(seeded, { listening: () => true })).toBeDefined()
    const ids = (): ReadonlyArray<number> => [1]
    const flags = (_: Ticks): ReadonlyArray<readonly [number, number]> => [[1, 1]]
    // @ts-expect-error: nor with both.
    expect(childById(seeded, { ids, flags })).toBeDefined()
    // `listening` takes the id that `ids` gives, inferred from it, and the one that `flags` gives.
    expectTypeOf(
      childById(ticker, { ids: (state: Ticks) => (state.ticks > 0 ? [1] : []), listening: (_, id) => id > 0 })
    )
      .toEqualTypeOf<ChildById<Ticks, number, typeof ticker>>()
    expectTypeOf(childById(seeded, { flags, listening: (_, id) => id > 0 }))
      .toEqualTypeOf<ChildById<Ticks, number, typeof seeded>>()
  })

  test("listening takes the id of children by id among the children of withChildren too", () => {
    const { withChildren } = program<{ state: Ticks }>()
    const parent = withChildren({
      Rows: childById(ticker, {
        ids: (state) => [state.ticks],
        listening: (_, id) => {
          expectTypeOf(id).toEqualTypeOf<number>()
          return true
        }
      }),
      Seeds: childById(seeded, {
        flags: (state) => [[String(state.ticks), state.ticks] as const],
        listening: (_, id) => {
          expectTypeOf(id).toEqualTypeOf<string>()
          return true
        }
      }),
      // A `listening` that takes the state alone may come first: it takes no id.
      Quiet: childById(ticker, { listening: (state) => state.ticks > 0, ids: (state) => [state.ticks] })
    })
    expect(parent).toBeDefined()
  })

  test("a listening that takes the id is written after the ids or flags that give it", () => {
    const { withChildren } = program<{ state: Ticks }>()
    const listening = (_: Ticks, id: number) => id > 0
    expect(withChildren({
      // @ts-expect-error: before them, the id would be taken from nothing.
      Rows: childById(ticker, { listening: (_, id) => id > 0, ids: (state) => [state.ticks] })
    }))
      .toBeDefined()
    expect(withChildren({
      // @ts-expect-error: whatever `listening` does with it.
      Rows: childById(ticker, { listening: (_, id) => id !== undefined, ids: (state) => [state.ticks] })
    }))
      .toBeDefined()
    expect(withChildren({
      // @ts-expect-error: nor before `flags`.
      Seeds: childById(seeded, { listening: (_, id) => id > 0, flags: (state) => [[state.ticks, 1] as const] })
    }))
      .toBeDefined()
    type Rows = ChildById<Ticks, number, typeof ticker>
    // @ts-expect-error: nor apart, where the type it is given names the id.
    const rows: Rows = childById(ticker, { listening: (_, id) => id > 0, ids: (state) => [state.ticks] })
    expect(rows).toBeDefined()
    // With the id of `listening` annotated, or `ids`'s state, the order is free.
    expect(withChildren({ Rows: childById(ticker, { listening, ids: (state) => [state.ticks] }) })).toBeDefined()
    expectTypeOf(childById(ticker, { listening: (_, id) => id > 0, ids: (state: Ticks) => [state.ticks] }))
      .toEqualTypeOf<ChildById<Ticks, number, typeof ticker>>()
  })

  test("a child with flags takes no key beside them, and the tell of children by id takes no id", () => {
    // @ts-expect-error: other flags start it again: equal flags under another key would not.
    expect(childWhen(seeded, { there: () => Opt.some(1), key: (state: Ticks) => state.ticks })).toBeDefined()
    // @ts-expect-error: nor where it is always there.
    expect(child(seeded, { flags: () => 1, key: (state: Ticks) => state.ticks })).toBeDefined()
    // Options that are no literal: their fields are not checked as fields too many.
    const keyedAlways = { flags: () => 1, key: () => 1 }
    const keyedSometimes = { there: () => Opt.some(1), key: () => 1 }
    // @ts-expect-error: nor however its options are written, always there…
    expect(child(seeded, keyedAlways)).toBeDefined()
    // @ts-expect-error: …or not.
    expect(childWhen(seeded, keyedSometimes)).toBeDefined()
    const ids = (): ReadonlyArray<number> => [1]
    // @ts-expect-error: one value for all the children of the declaration.
    expect(childById(counter, { ids, tell: (_: Ticks, id: number) => (id > 0 ? cleared : cleared) })).toBeDefined()
    expect([childWhen(seeded, { there: () => Opt.some(1) }), childById(counter, { ids, tell: () => cleared })])
      .toHaveLength(2)
  })

  test("a child is declared in one form, always there or not", () => {
    const optionsOf = (open: boolean) => (open ? { there: (state: Ticks) => state.ticks > 0 } : undefined)
    const eitherOf = (open: boolean) => (open ? { there: () => true } : { key: (state: Ticks) => state.ticks })
    const flaggedOf = (open: boolean) => (open ? { there: () => Opt.some(1) } : { flags: () => 1 })
    const seedOf = (open: boolean) => (open ? () => Opt.some(1) : undefined)
    // @ts-expect-error: a child always there takes no `there`, in options that may be missing…
    expect(child(ticker, optionsOf(true))).toBeDefined()
    // @ts-expect-error: …nor in options of either form…
    expect(child(ticker, eitherOf(true))).toBeDefined()
    // @ts-expect-error: …with flags too.
    expect(child(seeded, flaggedOf(true))).toBeDefined()
    // @ts-expect-error: and a child that may not be there takes a `there` that is not missing…
    expect(childWhen(seeded, { there: seedOf(true) })).toBeDefined()
    // @ts-expect-error: …in options that are not missing…
    expect(childWhen(ticker, optionsOf(true))).toBeDefined()
    // @ts-expect-error: …and that give it.
    expect(childWhen(ticker, { key: (state: Ticks) => state.ticks })).toBeDefined()
  })

  test("an option that a declaration does not take says what to write", () => {
    const { make, withChildren } = program<{ state: Ticks }>()
    // What the compiler prints where the option is given.
    type Rule<Options, K extends string> = keyof NonNullable<NonNullable<Options>[K & keyof NonNullable<Options>]>
    type Always<P extends AnyProgram> = Parameters<typeof child<Ticks, P>>[1]
    type When<P extends AnyProgram> = Parameters<typeof childWhen<Ticks, P>>[1]
    type ById<P extends AnyProgram> = Parameters<typeof childById<Ticks, P, unknown>>[1]
    expectTypeOf<Rule<Always<typeof ticker>, "there">>()
      .toEqualTypeOf<"a child that may not be there is declared with childWhen">()
    expectTypeOf<Rule<Always<typeof seeded>, "there">>()
      .toEqualTypeOf<"a child that may not be there is declared with childWhen">()
    expectTypeOf<Rule<Always<typeof ticker>, "flags">>()
      .toEqualTypeOf<"a child without flags is declared without them">()
    expectTypeOf<Rule<When<typeof ticker>, "flags">>()
      .toEqualTypeOf<"a child without flags is declared without them">()
    expectTypeOf<Rule<When<typeof seeded>, "flags">>()
      .toEqualTypeOf<"a child that may not be there is given its flags by there">()
    expectTypeOf<Rule<Always<typeof seeded>, "key">>()
      .toEqualTypeOf<"a child with flags starts again from other flags, and takes no key">()
    expectTypeOf<Rule<When<typeof seeded>, "key">>()
      .toEqualTypeOf<"a child with flags starts again from other flags, and takes no key">()
    expectTypeOf<Rule<Always<typeof ticker>, "tell">>()
      .toEqualTypeOf<"a child without external messages is told nothing">()
    expectTypeOf<Rule<ById<typeof ticker>, "flags">>()
      .toEqualTypeOf<"a child without flags is declared with its ids">()
    expectTypeOf<Rule<ById<typeof seeded>, "ids">>()
      .toEqualTypeOf<"a child with flags is declared with its flags">()
    // `make` refuses the pieces of what the program does not name, alone or as a parent.
    const parent = withChildren({ Ticker: child(ticker) })
    type Pieces = Parameters<typeof make<null>>[0] | Parameters<typeof parent.make<null>>[0]
    expectTypeOf<Rule<Pieces, "update">>()
      .toEqualTypeOf<"a program has an update only where its types name messages">()
    expectTypeOf<Rule<Pieces, "external">>()
      .toEqualTypeOf<"a program has an external only where its types name external messages">()
    expectTypeOf<Rule<Pieces, "output">>()
      .toEqualTypeOf<"a program has an output only where its types name one">()
    expectTypeOf<Rule<Pieces, "runCommand">>()
      .toEqualTypeOf<"a program has a runCommand only where its types name commands">()
    expectTypeOf<Rule<Pieces, "subscriptions">>()
      .toEqualTypeOf<"a program has subscriptions only where its types name keys">()
    expectTypeOf<Rule<Pieces, "listen">>()
      .toEqualTypeOf<"a program has a listen only where its types name keys">()
  })

  test("the options of a child declared in the call of withChildren take the parent's state, without annotations", () => {
    type Shown = Readonly<{ open: boolean; generation: number; seed: Opt.Option<number>; ids: ReadonlyArray<number> }>
    // In each option, as `toEqualTypeOf` tells `any` from `Shown`, which reading a field does not.
    const children = program<{ state: Shown }>().withChildren({
      Always: child(ticker, {
        key: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.generation
        }
      }),
      Seeded: child(seeded, {
        flags: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.generation
        },
        listening: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.open
        }
      }),
      When: childWhen(ticker, {
        there: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.open
        }
      }),
      SeededWhen: childWhen(seeded, {
        there: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.seed
        }
      }),
      ById: childById(ticker, {
        ids: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.ids
        },
        listening: (state, id) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          expectTypeOf(id).toEqualTypeOf<number>()
          return true
        }
      }),
      SeededById: childById(seeded, {
        flags: (state) => {
          expectTypeOf(state).toEqualTypeOf<Shown>()
          return state.ids.map((id) => [id, state.generation] as const)
        },
        listening: (_, id) => {
          expectTypeOf(id).toEqualTypeOf<number>()
          return true
        }
      })
    })
    expect(children).toBeDefined()
  })

  test("a child declared apart from withChildren annotates the parent's state", () => {
    type Shown = Readonly<{ open: boolean; ids: ReadonlyArray<number> }>
    type Other = Readonly<{ closed: boolean }>
    const Parent = program<{ state: Shown }>()
    // @ts-expect-error: apart from `withChildren`, the state is `unknown` without an annotation…
    expect(child(ticker, { listening: (state) => state.open })).toBeDefined()
    // @ts-expect-error: …for a child that may not be there…
    expect(childWhen(ticker, { there: (state) => state.open })).toBeDefined()
    // @ts-expect-error: …and for children by id.
    expect(childById(ticker, { ids: (state) => state.ids })).toBeDefined()
    const apart = {
      Always: child(ticker, { listening: (state: Shown) => state.open }),
      When: childWhen(ticker, { there: (state: Shown) => state.open }),
      ById: childById(ticker, { ids: (state: Shown) => state.ids }),
      // A child whose options read no state fits every parent.
      Plain: child(ticker)
    }
    expectTypeOf(apart.Always).toEqualTypeOf<Child<Shown, typeof ticker, "always">>()
    expectTypeOf(apart.When).toEqualTypeOf<Child<Shown, typeof ticker, "sometimes">>()
    expectTypeOf(apart.ById).toEqualTypeOf<ChildById<Shown, number, typeof ticker>>()
    expect(Parent.withChildren(apart)).toBeDefined()
    const Elsewhere = program<{ state: Other }>()
    // @ts-expect-error: a child declared for another state is refused…
    Elsewhere.withChildren({ Always: apart.Always })
    // @ts-expect-error: …that may not be there…
    Elsewhere.withChildren({ When: apart.When })
    // @ts-expect-error: …or by id.
    Elsewhere.withChildren({ ById: apart.ById })
    expect(Elsewhere.withChildren({ Plain: apart.Plain })).toBeDefined()
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
    const { withChildren } = program<{ state: Shown; message: Toggle }>()
    // There while open, under the generation as its key: another generation, another form, in one step.
    return withChildren({ Form: childWhen(form, { there: (state) => state.open, key: (state) => state.generation }) })
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
    const holding = Holder.withChildren({ Count: child(counting) }).make({
      init: { state: { label: "count" } },
      makeModel: (state, children) => ({ label: state.label, count: children.Count() })
    })
    const message = { _tag: "Count", message: "Increment" } as const
    const model = await drawnUntil(start(holding), [message, message], ({ count }) => count === 2)
    expect(model).toEqual({ label: "count", count: 2 })
  })

  test("a program whose state is a number runs by id", async () => {
    const Holder = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const holding = Holder.withChildren({ Counts: childById(counting, { ids: (state) => state.ids }) }).make({
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
    const hollowChildren = { Ticker: child(ticker) }
    expect(Hollow.withChildren(hollowChildren).make({ init: { state: {} }, makeModel: () => null })).toBeDefined()
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
      Page: child(page),
      Row: childById(labelled, { flags: (): ReadonlyArray<readonly [number, string]> => [] })
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

  test("a child is typed as what its declaration makes: always there or not, and with the ids it has", () => {
    type Own = Readonly<{ on: boolean; ids: ReadonlyArray<number> }>
    // @ts-expect-error: a child always there is not one that may not be, whose model would be an `Option`.
    const widened: Child<Own, typeof ticker, "always" | "sometimes"> = child(ticker)
    // @ts-expect-error: nor is it one that may not be, alone.
    const sometimes: Child<Own, typeof ticker, "sometimes"> = child(ticker)
    const numbered = childById(ticker, { ids: (state: Own) => state.ids })
    // @ts-expect-error: nor are children by id typed with fewer ids than theirs, which their messages would carry.
    const narrowed: ChildById<Own, 1 | 2, typeof ticker> = numbered
    // @ts-expect-error: nor is a child that may not be there one always there, whose model would be no `Option`.
    const assumed: Child<Own, typeof ticker, "always"> = childWhen(ticker, { there: (state: Own) => state.on })
    // @ts-expect-error: nor with more ids than theirs, which a parent's functions would read them with.
    const widenedIds: ChildById<Own, number | string, typeof ticker> = numbered
    expect([widened, sometimes, narrowed, assumed, widenedIds]).toHaveLength(5)
  })

  test("a child without external takes no external message from its parent", () => {
    const { withChildren } = program<{ state: Ticks; message: Reset }>()
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
        flags: (state: Own) => Arr.map(state.ids, (id) => [id, false] as const),
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      child(lockable, { tell: (state: Own) => ({ _tag: "LockChanged", locked: state.locked }) }),
      child(lockable, {
        key: (state: Own) => state.ids,
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      childWhen(lockable, {
        there: (state: Own) => state.locked,
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      childWhen(flagged, {
        there: (state: Own) => state.locked ? Opt.some(true) : Opt.none(),
        tell: (state) => ({ _tag: "LockChanged", locked: state.locked })
      }),
      child(flagged, {
        flags: (state: Own) => state.locked,
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
    child(flagged, { flags: () => true, tell: () => ({ _tag: "Unlocked" }) })
    // @ts-expect-error: there in some states too.
    childWhen(flagged, { there: () => Opt.some(true), tell: () => ({ _tag: "Unlocked" }) })
    // A child that has no external messages is told nothing.
    const silent = program<{ state: number }>().make({ init: { state: 0 }, makeModel: (state) => state })
    // @ts-expect-error: by id.
    childById(silent, { ids, tell: () => LOCKED })
    // @ts-expect-error: alone.
    child(silent, { tell: () => LOCKED })
    expect(taken).toHaveLength(10)
  })

  test("a parent's own command answers with the parent's own messages, never with a child's", () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: () => () => ({ state: noTicks }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const { withChildren } = program<{ state: Ticks; command: "Load"; message: "Loaded" }>()
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
    const { withChildren } = program<{ state: Ticks; message: "Loaded"; key: "load" }>()
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
    const { withChildren } = program<{ state: Ticks; message: Readonly<{ _tag: "Plain" }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    withChildren({ Plain: child(plain) }).make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      makeModel: () => null
    })
  })

  test("an own command cannot take the name of a child, whose interpreter would receive it", () => {
    const { withChildren } = program<{ state: Ticks; command: Readonly<{ _tag: "Plain" }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    withChildren({ Plain: child(plain) }).make({
      init: { state: noTicks },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
  })

  test("a program has an external exactly when it has external messages, and it never rejects", () => {
    const update = () => ({ ticks }: Ticks) => ({ state: { ticks: ticks + 1 } })
    // @ts-expect-error: its parent may send it a `Reset`, which nothing answers.
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
    const middle = Middle.withChildren({ Counter: child(resettable) }).make({
      init: { state: {} },
      external: (reset) => (state) => ({ state, tell: [{ _tag: "Counter", message: reset }] }),
      makeModel: () => null
    })
    const Top = program<{ state: object; message: Reset }>()
    const top = Top.withChildren({ Middle: child(middle) }).make({
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
    // @ts-expect-error: its first state depends on its flags.
    expect(child(unknowing)).toBeDefined()
    expect(child(unknowing, { flags: () => Symbol() })).toBeDefined()
    const flags: FlagsOf<typeof unknowing> = Symbol()
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
    const { withChildren } = program<{ state: Ticks }>()
    // @ts-expect-error: its events would go unhandled.
    withChildren({ Telling: child(telling) }).make({ init: { state: noTicks }, makeModel: () => null })
  })

  test("an onEvent has a handler for each child that has events, and does not compile without one", () => {
    const { withChildren } = program<{ state: Ticks }>()
    withChildren({ Left: child(counter), Right: child(counter) }).make({
      init: { state: noTicks },
      // @ts-expect-error: the events of `Right` would go unhandled.
      onEvent: { Left: () => (state) => ({ state }) },
      makeModel: () => null
    })
  })

  test("a first step lists no tell and raises no events, with or without children", () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      external: () => () => ({ state: noTicks }),
      subscriptions: () => [],
      makeModel: ({ ticks }) => ticks
    }
    const { make, withChildren } = program<{ state: Ticks; event: "Up" }>()
    withChildren({ Counter: child(resettable) }).make({
      // @ts-expect-error: a child is given what it starts from by its flags, and told what its declaration gives.
      init: { state: noTicks, tell: [{ _tag: "Counter", message: { _tag: "Reset" } }] },
      makeModel: () => null
    })
    withChildren({ Counter: child(resettable) }).make({
      // @ts-expect-error: a program starts in no step of a parent, which would take its events.
      init: { state: noTicks, events: ["Up"] },
      makeModel: () => null
    })
    // @ts-expect-error: without children too.
    make({ init: { state: noTicks, events: ["Up"] }, makeModel: () => null })
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
    const { withChildren } = program<{ state: Ticks }>()
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
    const { withChildren } = program<{ state: Ticks }>()
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
    Silent.withChildren({ Gone: child(gone) }).make({
      init: { state: noTicks },
      // @ts-expect-error: `Gone` is no event of this parent's.
      onEvent: { Gone: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null
    })
    const Raising = program<{ state: Ticks; event: Gone }>()
    const raising = Raising.withChildren({ Gone: child(gone) }).make({
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
    const { make, withChildren } = program<{ state: Ticks; command: Readonly<{ _tag: "Beep" }> }>()
    // @ts-expect-error: `Beep` would go uninterpreted.
    withChildren({ Plain: child(plain) }).make({ init: { state: noTicks }, makeModel: () => null })
    // @ts-expect-error: without children too.
    make({ init: { state: noTicks, commands: [{ _tag: "Beep" }] }, makeModel: () => null })
    program<{ state: Ticks }>().make({
      init: { state: noTicks },
      // @ts-expect-error: a program that names no commands has none to run.
      runCommand: () => Effect.succeedNone,
      makeModel: () => null
    })
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
    const app = Listening.withChildren({ Ringing: child(ringing) }).make({
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
    const holder = Holder.withChildren({ Literal: child(written) }).make({
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
    const parent = Parent.withChildren({ Left: child(untyped), Right: child(unheard) }).make({
      init: { state: {} },
      makeModel: () => null
    })
    const parentCommands: Exactly<CommandServicesOf<typeof parent>, unknown> = true
    const parentSubscriptions: Exactly<SubscriptionServicesOf<typeof parent>, unknown> = true
    expect([commands, unknownCommands, subscriptions, declaredSubscriptions, none, parentCommands, parentSubscriptions])
      .toEqual([true, true, true, true, true, true, true])
  })

  test("the services are never named in program, where they would be ignored: they are inferred", () => {
    // @ts-expect-error: those of the commands are inferred from `runCommand` and the children.
    program<{ state: Ticks; message: Tick; command: "Save"; commandServices: "Named" }>()
    // @ts-expect-error: those of the subscriptions from `listen` and the children.
    program<{ state: Ticks; message: Tick; key: "ticks"; subscriptionServices: "Named" }>()
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
    const parent = Parent.withChildren({ Clock: child(ticker) }).make({
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

  test("make gives a Program of the types it has, and each is read back exactly", () => {
    const counting = program<{ state: Ticks; message: Tick; command: "Save"; key: "ticks" }>().make({
      init: { state: noTicks },
      update: () => (state) => ({ state, commands: ["Save"] }),
      runCommand: () => Effect.succeedNone,
      subscriptions: () => ["ticks" as const],
      listen: () => ticks,
      makeModel: ({ ticks }) => ticks
    })
    expectTypeOf(counting).toEqualTypeOf<
      Program<{ state: Ticks; model: number; message: Tick; command: "Save"; key: "ticks" }>
    >()
    const flagged = program<{ state: Ticks; flags: number }>().make({
      init: (ticks) => ({ state: { ticks } }),
      makeModel: () => null
    })
    expectTypeOf(flagged).toEqualTypeOf<Program<{ state: Ticks; model: null; message: never; flags: number }>>()
    const { withChildren } = program<{ state: ListState; key: "own" }>()
    const parent = withChildren({
      Clock: child(ticker),
      Tickers: childById(ticker, { ids: (state) => state.ids })
    }).make({
      init: { state: { ids: [] } },
      subscriptions: () => ["own" as const],
      listen: () => Channel.never,
      makeModel: () => null
    })
    type ParentState = Kept<
      ListState,
      { readonly Clock: Opt.Option<Instance<Ticks>>; readonly Tickers: HashMap.HashMap<number, Instance<Ticks>> }
    >
    type ParentMessage =
      | Readonly<{ _tag: "Clock"; message: Tick; instance?: number }>
      | (Readonly<{ _tag: "Tickers"; message: Tick; instance?: number }> & Readonly<{ id: number }>)
    type ParentKey =
      | "own"
      | Readonly<{ _tag: "Clock"; instance: number; key: "ticks" }>
      | (Readonly<{ _tag: "Tickers"; instance: number; key: "ticks" }> & Readonly<{ id: number }>)
    expectTypeOf(parent).toEqualTypeOf<
      Program<{ state: ParentState; model: null; message: ParentMessage; key: ParentKey }>
    >()
    expectTypeOf<StateOf<typeof counting>>().toEqualTypeOf<Ticks>()
    expectTypeOf<StateOf<typeof flagged>>().toEqualTypeOf<Ticks>()
    expectTypeOf<StateOf<typeof parent>>().toEqualTypeOf<ParentState>()
    expectTypeOf<MessageOf<typeof parent>>().toEqualTypeOf<ParentMessage>()
    expectTypeOf<KeyOf<typeof counting>>().toEqualTypeOf<"ticks">()
    expectTypeOf<KeyOf<typeof flagged>>().toBeNever()
    expectTypeOf<KeyOf<typeof plain>>().toBeNever()
    expectTypeOf<KeyOf<typeof parent>>().toEqualTypeOf<ParentKey>()
    // Commands that only its first step lists are its commands too.
    const booting = {
      init: { state: noTicks, commands: ["Boot" as const] },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      runCommand: () => Effect.succeedNone,
      subscriptions: () => [],
      makeModel: () => null
    }
    expectTypeOf<CommandOf<typeof booting>>().toEqualTypeOf<"Boot">()
  })

  test("reject returned through a generic function, from an update written apart, is refused unless it is typed", () => {
    const { make } = program<{ state: Ticks; message: Tick }>()
    const fewer = (state: Ticks) => Opt.liftPredicate(state.ticks, (ticks) => ticks > 0)
    const apart = (_: Tick) => (state: Ticks) =>
      Opt.match(fewer(state), { onNone: () => reject, onSome: (ticks) => ({ state: { ticks: ticks - 1 } }) })
    const typed: Update<Ticks, Tick> = () => (state) =>
      Opt.match(fewer(state), { onNone: () => reject, onSome: (ticks) => ({ state: { ticks: ticks - 1 } }) })
    // @ts-expect-error: its `reject` is widened to `symbol`, which is no step.
    make({ init: { state: noTicks }, update: apart, makeModel: () => null })
    const counting = make({ init: { state: noTicks }, update: typed, makeModel: () => null })
    expect(counting.update({ _tag: "Tick" })(noTicks)).toBe(reject)
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
    const { make, withChildren } = program<{ state: Ticks }>()
    // @ts-expect-error: it has nothing to start from.
    expect(make({ makeModel: () => null })).toBeDefined()
    // @ts-expect-error: it has nothing to draw.
    expect(make({ init: { state: noTicks } })).toBeDefined()
    // @ts-expect-error: nor has a parent.
    expect(() => withChildren({ Ticker: child(ticker) }).make({ init: { state: noTicks } })).toBeDefined()
  })

  test("children by id list their ids: ids is required", () => {
    // @ts-expect-error: without it, no child would be there.
    expect(childById(counter, { listening: () => true })).toBeDefined()
    expect(childById(counter, { ids: (state: ListState) => state.ids })).toBeDefined()
  })

  test("a handler of onEvent answers with a step, and its type has no reject", () => {
    const { withChildren } = program<{ state: Ticks }>()
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
    program<{ state: Ticks; message: Tick }>().make({
      init: { state: noTicks },
      update,
      // @ts-expect-error: nor makes a subscription.
      listen: (): Subscription<Tick> => Channel.end({ _tag: "Tick" }),
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

  test("a parent's make takes exactly the pieces its types name, and its external never rejects", () => {
    const children = { Plain: child(plain) }
    const own = { init: { state: noTicks }, makeModel: () => null }
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: it names no messages, so it has none to update on.
      update: (_: Tick) => (state) => ({ state })
    })
    // @ts-expect-error: it names messages, and nothing updates on them.
    program<{ state: Ticks; message: Tick }>().withChildren(children).make(own)
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: it names no external messages, so it has no `external`.
      external: () => (state) => ({ state })
    })
    // @ts-expect-error: its parent may send it a `Reset`, which nothing answers.
    program<{ state: Ticks; external: Reset }>().withChildren(children).make(own)
    program<{ state: Ticks; external: Reset }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: an external message applies in every state.
      external: () => () => reject
    })
    // @ts-expect-error: an output named is given.
    program<{ state: Ticks; output: number }>().withChildren(children).make(own)
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: an output not named is not given.
      output: (state) => state.ticks
    })
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: it names no commands, so it has none to run.
      runCommand: () => Effect.succeedNone
    })
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: it names no keys, so it listens to nothing of its own.
      subscriptions: () => ["ticks"]
    })
    program<{ state: Ticks }>().withChildren(children).make({
      ...own,
      // @ts-expect-error: nor makes a subscription.
      listen: (): Subscription<Tick> => Channel.end({ _tag: "Tick" })
    })
    // @ts-expect-error: it names keys, and nothing lists them.
    program<{ state: Ticks; key: "ticks" }>().withChildren(children).make({
      ...own,
      listen: (): Subscription<never> => Channel.never
    })
    // @ts-expect-error: nor makes their subscriptions.
    program<{ state: Ticks; key: "ticks" }>().withChildren(children).make({
      ...own,
      subscriptions: () => ["ticks" as const]
    })
  })

  test("a child whose program is a type parameter does not compile, in child, childWhen, childById or withChildren", () => {
    const { withChildren } = program<{ state: Ticks }>()
    const wrapping = <P extends AnyProgram>(inner: P) => {
      // @ts-expect-error: the compiler cannot decide that the program is one.
      const Inner = child(inner)
      // @ts-expect-error: nor for a child that may not be there.
      const Maybe = childWhen(inner, { there: () => true })
      // @ts-expect-error: nor for children by id.
      const Rows = childById(inner, { ids: (): ReadonlyArray<number> => [] })
      return [Inner, Maybe, Rows]
    }
    // Children declared apart, whose types compile: only `make` refuses them.
    const parentOf = <P extends AnyProgram>(
      Inner: Child<Ticks, P, "always">,
      Maybe: Child<Ticks, P, "sometimes">,
      Rows: ChildById<Ticks, number, P>
    ) => [
      // @ts-expect-error: nor what the children need, such as an `onEvent` for their events.
      withChildren({ Inner, Rows }).make({ init: { state: noTicks }, makeModel: () => null }),
      // @ts-expect-error: for a child that may not be there too.
      withChildren({ Maybe }).make({ init: { state: noTicks }, makeModel: () => null })
    ]
    expect([wrapping, parentOf]).toHaveLength(2)
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
    const { withChildren } = program<{ state: object }>()
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
    const { withChildren } = program<{ state: Store }>()
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
