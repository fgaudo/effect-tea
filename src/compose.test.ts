import { describe, expect, expectTypeOf, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'
import { collectGarbage } from '../test/gc.test_helper.ts'
import type { Execution } from './command.ts'
import type { Subscription } from './subscription.ts'
import { andThen, forEach, reject, type Step, type Update } from './update.ts'
import { type Dispatch, forwardTo } from './dispatch.ts'
import { program } from './compose.ts'
import { CompositionDefect } from './defect.ts'
import type { Written } from './input.ts'
import {
  type CommandOf,
  type CommandServicesOf,
  type EventOf,
  type ExternalOf,
  type FlagsOf,
  type MessageOf,
  type ModelOf,
  type Program,
  subscriptionsOf,
  type SubscriptionServicesOf,
} from './program.ts'
import { type Frame, run } from './run.ts'
import { drive } from './testing/drive.ts'
import { rehearse } from './testing/rehearse.ts'
import { simulate } from './testing/simulate.ts'

// A counter that cannot go below zero, that saves on request, and that accepts typed numbers only.
type CounterMessage = Data.TaggedEnum<{
  Increment: object
  Decrement: object
  Typed: { text: string }
  SaveClicked: object
  Saved: object
  Cleared: object
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

// A parent may clear it, in any state: its other messages are its own.
type External = Extract<CounterMessage, { readonly _tag: 'Cleared' }>

const counter: Program<{
  state: Counter
  model: CounterModel
  message: CounterMessage
  command: CounterCommand
  event: CounterEvent
  external: External
}> = {
  init: { state: { count: 0, text: '', saving: false } },
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Increment':
        return { state: { ...state, count: state.count + 1 } }
      case 'Decrement':
        return state.count > 0 ? { state: { ...state, count: state.count - 1 } } : reject
      // Breaks the rule "input is never a reason to reject", on purpose.
      case 'Typed':
        return /^\d*$/.test(message.text) ? { state: { ...state, text: message.text } } : reject
      case 'SaveClicked':
        return state.saving ? reject : { state: { ...state, saving: true }, commands: [CounterCommand.Save(state)] }
      case 'Saved':
        return state.saving
          ? { state: { ...state, saving: false }, events: [{ _tag: 'SavedAt', count: state.count }] }
          : reject
      case 'Cleared':
        return { state: { ...state, count: 0 } }
    }
  },
  runCommand: () => Effect.succeedSome(CounterMessage.Saved()),
  makeModel: (state) => ({
    count: state.count,
    increment: CounterMessage.Increment(),
    decrement: state.count > 0 ? Opt.some(CounterMessage.Decrement()) : Opt.none(),
    type: (text) => CounterMessage.Typed({ text }),
    save: state.saving ? Opt.none() : Opt.some(CounterMessage.SaveClicked()),
  }),
}

// A ticker that only listens.
type Tick = Readonly<{ _tag: 'Tick' }>
const ticks: Subscription<Tick, never> = Channel.fromEffect(Effect.succeed<Tick>({ _tag: 'Tick' })).pipe(
  Channel.concatWith(() => Channel.never),
)

type Ticks = Readonly<{ ticks: number }>

const noTicks: Ticks = { ticks: 0 }

const ticker: Program<{ state: Ticks; model: number; message: Tick }> = {
  init: { state: noTicks },
  update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: ({ ticks }) => ticks,
}

type ParentState = Readonly<{ left: Counter; maybeRight: Opt.Option<Counter>; saves: number; ticks: Ticks }>
type Reset = Readonly<{ _tag: 'Reset' }>

const Parent = program<{ state: ParentState; message: Reset }>()

const app = Parent.make({
  init: (children) => {
    const left = children.Left.init
    const ticker = children.Ticker.init
    return {
      state: { left: left.state, maybeRight: Opt.none(), saves: 0, ticks: ticker.state },
      commands: [...left.commands, ...ticker.commands],
    }
  },
  children: {
    Left: Parent.child(counter, { get: (s) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
    Right: Parent.child(counter, {
      get: (s) => s.maybeRight,
      set: (s, right) => ({ ...s, maybeRight: Opt.some(right) }),
    }),
    // Listens only while the right counter is there.
    Ticker: Parent.child(ticker, {
      get: (s) => Opt.some(s.ticks),
      set: (s, ticks) => ({ ...s, ticks }),
      subscribed: (s) => Opt.map(s.maybeRight, () => s.ticks),
    }),
  },
  update: (_: Reset, children) => (state) => {
    // A parent gives a child a message through its handle.
    return children.Left.update(CounterMessage.Cleared())(state)
  },
  onEvent: {
    Left: () => (state) => ({ state: { ...state, saves: state.saves + 1 } }),
    Right: () => (state) => ({ state: { ...state, saves: state.saves + 1 } }),
  },
  makeModel: (state, children) => ({
    left: children.Left(state),
    maybeRight: Opt.map(state.maybeRight, () => children.Right(state)),
    reset: { _tag: 'Reset' } as Reset,
  }),
})

type Model = ReturnType<typeof app.makeModel>

type AppMessage = MessageOf<typeof app>

/**
 * Runs `program` with a renderer that hands each frame to `act`, until `act` says it is done; returns what the
 * renderer saw.
 */
const script = <M>(
  program: Program<{ state: ParentState; model: M; message: AppMessage; command: unknown }>,
  act: (frame: Frame<M, AppMessage>, index: number) => Effect.Effect<boolean>,
  state: ParentState = program.init.state,
) => {
  const seen: Array<Frame<M, AppMessage>> = []
  return run(
    { ...program, init: { ...program.init, state } },
    (frames) =>
      Stream.runForEach(
        frames.pipe(Stream.takeUntilEffect((frame) => {
          seen.push(frame)
          return act(frame, seen.length - 1)
        })),
        () => Effect.void,
      ),
  ).pipe(
    Effect.timeout('2 seconds'),
    Effect.as(seen),
    Effect.runPromiseExit,
  )
}

const asProgram = app as unknown as Program<
  { state: ParentState; model: Model; message: AppMessage; command: unknown }
>

const left = (frame: Frame<Model, AppMessage>) => forwardTo(frame.dispatch, 'Left')

/** A dispatch that keeps what it is sent, for `forwardTo` to wrap. */
const recording = <Message>() => {
  const sent: Array<Message> = []
  const dispatch: Dispatch<Message> = (message) => Effect.sync(() => sent.push(message))
  return { sent, dispatch }
}

describe('what a child\'s view sends', () => {
  test('one dispatch for every frame, and the same dispatch for a child in every frame', async () => {
    const exit = await script(
      asProgram,
      (frame, index) =>
        index < 3 ? left(frame)(frame.model.left.increment).pipe(Effect.as(false)) : Effect.succeed(true),
    )
    const seen = Exit.isSuccess(exit) ? exit.value : []
    expect(seen.map((frame) => frame.model.left.count)).toEqual([0, 1, 2, 3])
    expect(new Set(seen.map((frame) => frame.dispatch)).size).toBe(1)
    expect(new Set(seen.map(left)).size).toBe(1)
  })

  test('a child\'s dispatch wraps its messages as its parent receives them, at every level', () => {
    const { sent, dispatch } = recording<MessageOf<typeof lists>>()
    const row = forwardTo(forwardTo(dispatch, 'Lists', 'A'), 'Rows', 1)
    Effect.runSync(row(CounterMessage.Increment()))
    Effect.runSync(forwardTo(forwardTo(dispatch, 'Lists', 'B'), 'Rows', 1)(CounterMessage.Increment()))
    expect(sent).toEqual(['A', 'B'].map((id) => ({
      _tag: 'Lists',
      id,
      message: { _tag: 'Rows', id: 1, message: CounterMessage.Increment() },
    })))
    expect(forwardTo(forwardTo(dispatch, 'Lists', 'A'), 'Rows', 1)).toBe(row)
    expect(forwardTo(forwardTo(dispatch, 'Lists', 'A'), 'Rows', 2)).not.toBe(row)
    // @ts-expect-error: a name that is no child's gives nothing to send with.
    expect(() => forwardTo(dispatch, 'Rows')(CounterMessage.Increment())).toBeDefined()
  })

  test('a double tap acts once: the second message is rejected, and ignored', async () => {
    const at = { ...app.init.state, left: { ...counter.init.state, count: 1 } }
    const exit = await script(asProgram, (frame, index) => {
      if (index > 0) return Effect.succeed(true)
      const decrement = Opt.getOrThrow(frame.model.left.decrement)
      return left(frame)(decrement).pipe(Effect.andThen(left(frame)(decrement)), Effect.as(false))
    }, at)
    expect(Exit.isSuccess(exit) && exit.value.map((frame) => frame.model.left.count)).toEqual([1, 0])
  })

  test('a message update rejects is ignored, and the run goes on', async () => {
    const exit = await script(asProgram, (frame, index) =>
      index === 0
        ? left(frame)(frame.model.left.type('not a number')).pipe(
          Effect.andThen(left(frame)(frame.model.left.increment)),
          Effect.as(false),
        )
        : Effect.succeed(true))
    expect(Exit.isSuccess(exit) && exit.value.map((frame) => frame.model.left)).toEqual([
      expect.objectContaining({ count: 0 }),
      expect.objectContaining({ count: 1 }),
    ])
  })
})

describe('compose', () => {
  test('in a run, a child\'s commands run and their messages reach it', async () => {
    const exit = await script(asProgram, (frame, index) =>
      index === 0
        ? left(frame)(Opt.getOrThrow(frame.model.left.save)).pipe(Effect.as(false))
        : Effect.succeed(frame.model.left.count === 0 && Opt.isSome(frame.model.left.save)))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test('a parent\'s own message gives a child an external message through its handle', () => {
    const at = { ...app.init.state, left: { ...counter.init.state, count: 2 } }
    const result = app.update({ _tag: 'Reset' })(at)
    expect(result !== reject && result.state.left.count).toBe(0)
  })

  // The very same state draws no new frame: a parent rebuilt around an unchanged child would draw one.
  test('a child\'s message that keeps its state keeps the parent\'s, its commands and events still going', () => {
    type Pinger = Readonly<{ pings: number }>
    const pinger: Program<{ state: Pinger; model: number; message: 'Ping'; command: 'Pong'; event: 'Pinged' }> = {
      init: { state: { pings: 0 } },
      update: () => (state) => ({ state, commands: ['Pong'], events: ['Pinged'] }),
      runCommand: () => Effect.succeedNone,
      makeModel: (state) => state.pings,
    }
    type Pinged = Readonly<{ pinger: Pinger; heard: number }>
    const Pings = program<{ state: Pinged }>()
    const pingers = (onPinged: (state: Pinged) => Pinged) =>
      Pings.make({
        init: (children) => ({
          state: { pinger: children.Pinger.init.state, heard: 0 },
          commands: children.Pinger.init.commands,
        }),
        children: {
          Pinger: Pings.child(pinger, { get: (s) => Opt.some(s.pinger), set: (s, p) => ({ ...s, pinger: p }) }),
        },
        onEvent: { Pinger: () => (state) => ({ state: onPinged(state) }) },
        makeModel: (state, children) => children.Pinger(state),
      })
    const before = pingers((state) => state).init.state
    const kept = pingers((state) => state).update({ _tag: 'Pinger', message: 'Ping' })(before)
    const heard = pingers((state) => ({ ...state, heard: state.heard + 1 })).update({
      _tag: 'Pinger',
      message: 'Ping',
    })(before)
    expect(kept !== reject && kept.state === before).toBe(true)
    expect(kept !== reject && kept.commands).toEqual([{ _tag: 'Pinger', command: 'Pong' }])
    expect(heard !== reject && heard.state.heard).toBe(1)
  })

  test('a message for a child that is not there is rejected, from its view or as the answer of a command', () => {
    expect(app.update({ _tag: 'Right', message: CounterMessage.Increment() })(app.init.state)).toBe(reject)
    const answer = Effect.runSync(app.runCommand({ _tag: 'Right', command: CounterCommand.Save({ count: 0 }) }))
    expect(answer).toEqual(Opt.some({ _tag: 'Right', message: CounterMessage.Saved() }))
    expect(app.update(Opt.getOrThrow(answer))(app.init.state)).toBe(reject)
    // An external message too, as the parent's own command may answer: through the handle, it would be a defect.
    expect(app.update({ _tag: 'Right', message: CounterMessage.Cleared() })(app.init.state)).toBe(reject)
  })

  test('an own message or command whose tag a plain object inherits is the parent\'s own, not a child\'s', () => {
    type Own = Readonly<{ _tag: 'toString' }>
    type OwnCommand = Readonly<{ _tag: 'constructor' }>
    const Inherited = program<{ state: Ticks; command: OwnCommand; message: Own }>()
    const tested = Inherited.make({
      init: (children) => ({ state: children.Ticker.init.state }),
      children: { Ticker: Inherited.child(ticker, { get: (s) => Opt.some(s), set: (_, ticks) => ticks }) },
      update: (_: Own) => (state) => ({ state: { ticks: state.ticks + 1 }, commands: [{ _tag: 'constructor' }] }),
      runCommand: () => Effect.succeedSome({ _tag: 'toString' } as Own),
      makeModel: (state, children) => children.Ticker(state),
    })
    const step = tested.update({ _tag: 'toString' })(noTicks)
    expect(step !== reject && step.state.ticks).toBe(1)
    expect(Effect.runSync(tested.runCommand({ _tag: 'constructor' }))).toEqual(Opt.some({ _tag: 'toString' }))
  })

  test('a child that the children object inherits is no child: it has no handle, no model and no subscriptions', () => {
    const Inherited = program<{ state: Ticks }>()
    const own = { get: (s: Ticks) => Opt.some(s), set: (_: Ticks, ticks: Ticks) => ticks }
    const Ticker = Inherited.child(ticker, own)
    const children: { Ticker: typeof Ticker } = Object.assign(Object.create({ Ghost: Ticker }), { Ticker })
    let handles: ReadonlyArray<string> = []
    let models: ReadonlyArray<string> = []
    const tested = Inherited.make({
      init: (handed) => {
        handles = Object.keys(handed)
        return { state: handed.Ticker.init.state }
      },
      children,
      makeModel: (state, handed) => {
        models = Object.keys(handed)
        return handed.Ticker(state)
      },
    })
    tested.makeModel(tested.init.state)
    expect(handles).toEqual(['Ticker'])
    expect(models).toEqual(['Ticker'])
    expect(Arr.fromIterable(HashMap.keys(subscriptionsOf(tested)(noTicks)))).toEqual([['Ticker', 'ticks']])
  })

  test('the model of a child that is not there is a defect', () => {
    const Broken = program<{ state: ParentState }>()
    const broken = Broken.make({
      init: () => ({ state: app.init.state }),
      children: { Right: Broken.child(counter, { get: (s) => s.maybeRight, set: (s) => s }) },
      onEvent: { Right: () => (state) => ({ state }) },
      makeModel: (state, children) => children.Right(state),
    })
    const thrown = (() => {
      try {
        return broken.makeModel(app.init.state)
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toMatchObject({ _tag: 'CompositionDefect', child: 'Right' })
  })

  test('a child listens under its name, and only when subscribed', () => {
    const subscriptions = app.subscriptions ?? (() => HashMap.empty())
    expect(HashMap.size(subscriptions(app.init.state))).toBe(0)
    const keys = Array.from(
      HashMap.keys(subscriptions({ ...app.init.state, maybeRight: Opt.some(counter.init.state) })),
    )
    expect(keys).toEqual([['Ticker', 'ticks']])
  })

  test('a child\'s model is kept while its state is the same object', () => {
    const state = { ...app.init.state, maybeRight: Opt.some(counter.init.state) }
    const first = app.makeModel(state)
    expect(app.makeModel({ ...state, saves: 1 }).left).toBe(first.left)
    expect(app.makeModel({ ...state, left: { ...state.left, count: 1 } }).left).not.toBe(first.left)
  })

  // A model depends only on its state: what tells the two children apart is the dispatch each one's view gets.
  test('one program as two children, in the very same state object, has one model', () => {
    const model = app.makeModel({ ...app.init.state, maybeRight: Opt.some(app.init.state.left) })
    expect(Opt.getOrThrow(model.maybeRight)).toBe(model.left)
    const { sent, dispatch } = recording<AppMessage>()
    Effect.runSync(forwardTo(dispatch, 'Left')(model.left.increment))
    Effect.runSync(forwardTo(dispatch, 'Right')(model.left.increment))
    expect(sent).toEqual([
      { _tag: 'Left', message: CounterMessage.Increment() },
      { _tag: 'Right', message: CounterMessage.Increment() },
    ])
  })
})

// A list of counters, by id; one row is removed when it reports a save.
type Row = Readonly<{ id: number; counter: Counter }>
type ListState = Readonly<{ rows: ReadonlyArray<Row> }>

const List = program<{ state: ListState }>()

// The same list, with a message of its own.
const Clearable = program<{ state: ListState; message: Reset }>()

const list = List.make({
  init: () => ({ state: { rows: [] } }),
  children: {
    Rows: List.childById(counter, {
      get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
      set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
      subscribed: (state) => state.rows.map(({ id, counter }) => [id, counter] as const),
    }),
    Ticker: List.child(ticker, {
      get: () => Opt.some(noTicks),
      set: (state) => state,
      subscribed: () => Opt.none(),
    }),
  },
  onEvent: {
    Rows: (id) => (state) => ({ state: { rows: state.rows.filter((row) => row.id !== id) } }),
  },
  makeModel: (state, children) => state.rows.map(({ id }) => ({ id, model: children.Rows(state, id) })),
})

// New rows often share one initial state object: here, all of them.
const rows = (...ids: ReadonlyArray<number>): ListState => ({
  rows: ids.map((id) => ({ id, counter: counter.init.state })),
})

// Lists of counters, by id: parents whose children by id are parents with children by id.
type Lists = Readonly<{ rows: ReadonlyArray<Readonly<{ id: string; list: ListState }>> }>

const Nested = program<{ state: Lists }>()

const lists = Nested.make({
  init: () => ({ state: { rows: [] } }),
  children: {
    Lists: Nested.childById(list, {
      get: (state, id: string) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.list),
      set: (state, id, list) => ({ rows: state.rows.map((row) => row.id === id ? { id, list } : row) }),
      subscribed: (state) => state.rows.map(({ id, list }) => [id, list] as const),
    }),
  },
  makeModel: (state, children) => state.rows.map(({ id }) => ({ id, rows: children.Lists(state, id) })),
})

describe('children by id', () => {
  test('a message reaches the child with its id, and only that one', () => {
    const result = list.update({ _tag: 'Rows', id: 2, message: CounterMessage.Increment() })(rows(1, 2))
    expect(result !== reject && result.state.rows.map((row) => row.counter.count)).toEqual([0, 1])
  })

  test('children that share one state object share its model, and their dispatch adds their id', () => {
    const [first, second] = list.makeModel(rows(1, 2))
    expect(first?.model).toBe(second?.model)
    const { sent, dispatch } = recording<MessageOf<typeof list>>()
    Effect.runSync(forwardTo(dispatch, 'Rows', 2)(CounterMessage.Increment()))
    expect(sent).toEqual([{ _tag: 'Rows', id: 2, message: CounterMessage.Increment() }])
  })

  test('a child\'s model is kept while its state is the same object', () => {
    const state = rows(1, 2)
    expect(list.makeModel({ rows: [...state.rows] })[1]?.model).toBe(list.makeModel(state)[1]?.model)
  })

  test('a child\'s model is let go with its state', async () => {
    const make = () =>
      Array.from({ length: 1_000 }, (_, id) => {
        const model = list.makeModel({ rows: [{ id, counter: { ...counter.init.state } }] })[0]?.model
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

  test('the models of ids shown once each, under one shared state, do not pile up', () => {
    collectGarbage()
    const before = process.memoryUsage().heapUsed
    for (let id = 0; id < 50_000; id++) list.makeModel(rows(id))
    collectGarbage()
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(5_000_000)
  })

  // Lists A and B, each with counter 1 in the counter's initial state. Each of the first `frames` frames
  // increments A's counter, or B's on frame `bumpingB`; returns the frames.
  const nested = (frames: number, bumpingB?: number) => {
    const seen: Array<Frame<ReturnType<typeof lists.makeModel>, MessageOf<typeof lists>>> = []
    return run(
      { ...lists, init: { state: { rows: [{ id: 'A', list: rows(1) }, { id: 'B', list: rows(1) }] } } },
      (stream) =>
        stream.pipe(
          Stream.tap((frame) => {
            seen.push(frame)
            const index = seen.length - 1
            const id = index === bumpingB ? 'B' : 'A'
            const counter = frame.model.find((list) => list.id === id)?.rows[0]?.model
            const send = forwardTo(forwardTo(frame.dispatch, 'Lists', id), 'Rows', 1)
            return index < frames && counter !== undefined ? send(counter.increment) : Effect.void
          }),
          Stream.take(frames + 1),
          Stream.runDrain,
        ),
    ).pipe(Effect.as(seen))
  }

  test('in a run, a nested child that did not change keeps its model from frame to frame', async () => {
    const [first, second, third] = (await Effect.runPromise(nested(2))).map((frame) => frame.model)
    expect(second?.[1]?.rows[0]?.model).toBe(first?.[1]?.rows[0]?.model)
    expect(third?.[1]?.rows[0]?.model).toBe(first?.[1]?.rows[0]?.model)
    expect(second?.[0]?.rows[0]?.model).not.toBe(first?.[0]?.rows[0]?.model)
    expect(third?.[0]?.rows[0]?.model.count).toBe(2)
  })

  test('a message from a model kept from an older frame is applied', async () => {
    const seen = await Effect.runPromise(nested(2, 1))
    expect(seen[1]?.model[1]?.rows[0]?.model).toBe(seen[0]?.model[1]?.rows[0]?.model)
    expect(seen.map((frame) => frame.model[1]?.rows[0]?.model.count)).toEqual([0, 0, 1])
  })

  test('two runs of one program at once do not mix', async () => {
    const runs = await Effect.runPromise(Effect.all([nested(3), nested(3)], { concurrency: 'unbounded' }))
    expect(runs.map((seen) => seen.map((frame) => frame.model[0]?.rows[0]?.model.count))).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ])
  })

  test('a child\'s commands come back to it, and its events reach the parent with its id', async () => {
    const saving = list.update({ _tag: 'Rows', id: 2, message: CounterMessage.SaveClicked() })(rows(1, 2))
    if (saving === reject) throw new Error('saving was rejected')
    expect(saving.commands).toEqual([{ _tag: 'Rows', id: 2, command: CounterCommand.Save(counter.init.state) }])
    const [command] = saving.commands ?? []
    if (command === undefined) throw new Error('saving started no command')
    const saved = await Effect.runPromise(list.runCommand(command))
    expect(saved).toEqual(Opt.some({ _tag: 'Rows', id: 2, message: CounterMessage.Saved() }))
    const done = list.update(Opt.getOrThrow(saved))(saving.state)
    expect(done !== reject && done.state.rows.map((row) => row.id)).toEqual([1])
  })

  test('the late message of a removed child is rejected', () => {
    expect(list.update({ _tag: 'Rows', id: 3, message: CounterMessage.Increment() })(rows(1, 2))).toBe(reject)
  })

  test('each child listens under its name and id, alone ones under their name', () => {
    const Tickers = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const tickerList = Tickers.make({
      init: () => ({ state: { ids: [7, 8] } }),
      children: {
        Tickers: Tickers.childById(ticker, {
          get: (state, id: number) => state.ids.includes(id) ? Opt.some(noTicks) : Opt.none(),
          set: (state) => state,
          subscribed: (state) => state.ids.map((id) => [id, noTicks] as const),
        }),
      },
      onEvent: {},
      makeModel: () => null,
    })
    const subscriptions = tickerList.subscriptions ?? (() => HashMap.empty())
    expect(Array.from(HashMap.keys(subscriptions(tickerList.init.state)))).toEqual([
      ['Tickers', 7, 'ticks'],
      ['Tickers', 8, 'ticks'],
    ])
  })

  test('subscribed children that list one id twice are a defect that says so, not a clash with an own key', () => {
    const Tickers = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const twice = Tickers.make({
      init: () => ({ state: { ids: [7, 7] } }),
      children: {
        Tickers: Tickers.childById(ticker, {
          get: (state, id: number) => state.ids.includes(id) ? Opt.some(noTicks) : Opt.none(),
          set: (state) => state,
          subscribed: (state) => state.ids.map((id) => [id, noTicks] as const),
        }),
      },
      onEvent: {},
      makeModel: () => null,
    })
    expect(() => subscriptionsOf(twice)(twice.init.state))
      .toThrow(new CompositionDefect({
        message: 'The subscribed children of "Tickers" list the same id twice',
        child: 'Tickers',
        id: 7,
      }))
  })

  // Only a cast, or a caller without TypeScript, gets a primitive state past the types.
  test('a child whose state is not an object is a defect that names it, in its model and in its subscriptions', () => {
    const Tickers = program<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const primitive = 0 as unknown as Ticks
    const counting = Tickers.make({
      init: () => ({ state: { ids: [7] } }),
      children: {
        Tickers: Tickers.childById(ticker, {
          get: (state, id: number) => state.ids.includes(id) ? Opt.some(primitive) : Opt.none(),
          set: (state) => state,
          subscribed: (state) => state.ids.map((id) => [id, primitive] as const),
        }),
      },
      onEvent: {},
      makeModel: (state, children) => state.ids.map((id) => children.Tickers(state, id)),
    })
    const defect = new CompositionDefect({
      message: 'The state of "Tickers" is a number, where a program keeps its state in an object',
      child: 'Tickers',
      id: 7,
    })
    expect(() => counting.makeModel(counting.init.state)).toThrow(defect)
    expect(() => subscriptionsOf(counting)(counting.init.state)).toThrow(defect)
  })

  // Rows of tickers, each in a state of its own; `calls` counts the calls of the ticker's `subscriptions`.
  const countedTickers = () => {
    const counted = { calls: 0 }
    const Tickers = program<{ state: Readonly<{ rows: ReadonlyArray<Readonly<{ id: number; ticks: Ticks }>> }> }>()
    const tickers = Tickers.make({
      init: () => ({ state: { rows: [] } }),
      children: {
        Tickers: Tickers.childById({
          ...ticker,
          subscriptions: () => {
            counted.calls++
            return HashMap.make(['ticks', ticks])
          },
        }, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.ticks),
          set: (state, id, ticks) => ({ rows: state.rows.map((row) => row.id === id ? { id, ticks } : row) }),
          subscribed: (state) => state.rows.map(({ id, ticks }) => [id, ticks] as const),
        }),
      },
      makeModel: () => null,
    })
    return { counted, subscriptions: subscriptionsOf(tickers) }
  }

  test('a child\'s subscriptions are kept while its state is the same object, and made again for a new one', () => {
    const { counted, subscriptions } = countedTickers()
    const one = { id: 1, ticks: { ticks: 0 } }
    const state = { rows: [one, { id: 2, ticks: { ticks: 0 } }] }
    const first = subscriptions(state)
    const kept = subscriptions({ rows: [...state.rows] })
    expect(counted.calls).toBe(2)
    const lifted = (all: typeof first) => Opt.getOrThrow(HashMap.get(all, ['Tickers', 1, 'ticks']))
    expect(lifted(kept)).toBe(lifted(first))
    const changed = subscriptions({ rows: [one, { id: 2, ticks: { ticks: 1 } }] })
    expect(counted.calls).toBe(3)
    expect(lifted(changed)).toBe(lifted(first))
    expect(HashMap.size(changed)).toBe(2)
  })

  test('children that share one state object each listen with their own id, however often they are asked', () => {
    const { subscriptions } = countedTickers()
    const state = { rows: [{ id: 1, ticks: noTicks }, { id: 2, ticks: noTicks }] }
    const first = (all: ReturnType<typeof subscriptions>, id: number) =>
      Effect.runSync(Channel.runHead(Opt.getOrThrow(HashMap.get(all, ['Tickers', id, 'ticks']))))
    for (const all of [subscriptions(state), subscriptions({ rows: [...state.rows] })]) {
      expect([first(all, 1), first(all, 2)]).toEqual([
        Opt.some({ _tag: 'Tickers', id: 1, message: { _tag: 'Tick' } }),
        Opt.some({ _tag: 'Tickers', id: 2, message: { _tag: 'Tick' } }),
      ])
    }
  })

  test('children that share one state object are lifted once while they keep sharing it', () => {
    const { counted, subscriptions } = countedTickers()
    const shared = { ticks: 0 }
    const state = { rows: [{ id: 1, ticks: shared }, { id: 2, ticks: shared }, { id: 3, ticks: shared }] }
    const first = subscriptions(state)
    const again = subscriptions({ rows: [...state.rows] })
    expect(counted.calls).toBe(3)
    for (const id of [1, 2, 3]) {
      const lifted = (all: typeof first) => Opt.getOrThrow(HashMap.get(all, ['Tickers', id, 'ticks']))
      expect(lifted(again)).toBe(lifted(first))
    }
  })

  test('a child that takes the place of another in a shared state listens with its own id', () => {
    const { subscriptions } = countedTickers()
    const shared = { ticks: 0 }
    subscriptions({ rows: [{ id: 1, ticks: shared }, { id: 2, ticks: shared }] })
    const taken = subscriptions({ rows: [{ id: 3, ticks: shared }, { id: 2, ticks: shared }] })
    expect(HashMap.size(taken)).toBe(2)
    expect(HashMap.has(taken, ['Tickers', 1, 'ticks'])).toBe(false)
    expect(Effect.runSync(Channel.runHead(Opt.getOrThrow(HashMap.get(taken, ['Tickers', 3, 'ticks'])))))
      .toEqual(Opt.some({ _tag: 'Tickers', id: 3, message: { _tag: 'Tick' } }))
  })

  // What a shared state keeps is not observed directly: a place it let go of is lifted again when it comes back.
  test('a place that a shared state no longer holds is let go of by the next call that meets the state', () => {
    const { counted, subscriptions } = countedTickers()
    const shared = { ticks: 0 }
    const rows = [{ id: 1, ticks: shared }, { id: 2, ticks: shared }, { id: 3, ticks: shared }]
    subscriptions({ rows })
    subscriptions({ rows: rows.slice(0, 2) })
    expect(counted.calls).toBe(3)
    subscriptions({ rows })
    expect(counted.calls).toBe(4)
  })
})

describe('what a parent can do with a child', () => {
  test('a handle\'s update takes only the messages the child\'s type says a parent may send', () => {
    const sendTo = Parent.make({
      init: () => ({ state: app.init.state }),
      children: {
        Left: Parent.child(counter, { get: (s) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
      },
      update: (_: Reset, children) => (state) => {
        // @ts-expect-error: `Increment` is the counter's own business.
        return children.Left.update(CounterMessage.Increment())(state)
      },
      onEvent: { Left: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(sendTo.update({ _tag: 'Reset' })(app.init.state)).not.toBe(reject)
  })

  // A page with a menu, which a back button closes, or, with nothing to close, asks its parent to leave.
  type Page = Readonly<{ menu: boolean }>
  type BackPressed = Readonly<{ _tag: 'BackPressed' }>
  const page: Program<{
    state: Page
    model: null
    message: BackPressed
    event: Readonly<{ _tag: 'LeaveRequested' }>
    external: BackPressed
  }> = {
    init: { state: { menu: true } },
    update: () => (state) => state.menu ? { state: { menu: false } } : { state, events: [{ _tag: 'LeaveRequested' }] },
    makeModel: () => null,
  }
  type Pages = Readonly<{ page: Opt.Option<Page> }>
  const Pages = program<{ state: Pages; message: BackPressed }>()
  const shown = Pages.child(page, { get: (state) => state.page, set: (_, page) => ({ page: Opt.some(page) }) })

  test('a child answers its parent with its state or an event, handled in the same step', () => {
    const pages = Pages.make({
      init: () => ({ state: { page: Opt.some(page.init.state) } }),
      children: { Page: shown },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => () => ({ state: { page: Opt.none() } }) },
      makeModel: () => null,
    })
    const back = (state: Pages) => {
      const result = pages.update({ _tag: 'BackPressed' })(state)
      return result === reject ? state : result.state
    }
    expect(back(pages.init.state)).toEqual({ page: Opt.some({ menu: false }) })
    expect(back(back(pages.init.state))).toEqual({ page: Opt.none() })
  })

  test('a child that rejects what its parent gives it, or is not there to take it, is a defect', () => {
    const rejecting: typeof page = { ...page, update: () => (state) => state.menu ? { state } : reject }
    const pages = Pages.make({
      init: () => ({ state: { page: Opt.some(page.init.state) } }),
      children: {
        Page: Pages.child(rejecting, { get: (state) => state.page, set: (_, page) => ({ page: Opt.some(page) }) }),
      },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.some({ menu: false }) }))
      .toThrow('"Page" rejected the external message BackPressed, which it takes')
    expect(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.none() }))
      .toThrow('The external message BackPressed to "Page", which is not in this state')
  })

  test('a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on', () => {
    const thrown = (act: () => unknown): unknown => {
      try {
        act()
      } catch (error) {
        return error
      }
      throw new Error('nothing was thrown')
    }
    const pages = Pages.make({
      init: () => ({ state: { page: Opt.none() } }),
      children: { Page: shown },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    const alone = thrown(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.none() }))
    expect(alone).toBeInstanceOf(CompositionDefect)
    expect(alone).toMatchObject({ _tag: 'CompositionDefect', child: 'Page', on: 'BackPressed' })
    expect(Object.hasOwn(alone as object, 'id')).toBe(false)
    const telling = Clearable.make({
      init: () => ({ state: { rows: [] } }),
      children: {
        Rows: Clearable.childById(counter, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
          set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
          subscribed: () => [],
        }),
      },
      update: (_: Reset, children) => children.Rows.update(7, CounterMessage.Cleared()),
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(thrown(() => telling.update({ _tag: 'Reset' })({ rows: [] })))
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Rows', id: 7, on: 'Cleared' })
    const refusing: typeof counter = { ...counter, update: () => () => reject }
    const rejecting = Clearable.make({
      init: () => ({ state: { rows: [{ id: 7, counter: { count: 0, text: '', saving: false } }] } }),
      children: {
        Rows: Clearable.childById(refusing, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
          set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
          subscribed: () => [],
        }),
      },
      update: (_: Reset, children) => children.Rows.update(7, CounterMessage.Cleared()),
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(thrown(() => rejecting.update({ _tag: 'Reset' })(rejecting.init.state)))
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Rows', id: 7, on: 'Cleared' })
    const raising = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state, events: [{ _tag: 'Beeped' }] }),
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const Unheard = program<{ state: Ticks }>()
    // @ts-expect-error: the types ask for an `onEvent` already; this one runs without.
    const unheard = Unheard.make({
      init: () => ({ state: noTicks }),
      children: { Beeper: Unheard.child(raising, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
    expect(thrown(() => unheard.update({ _tag: 'Beeper', message: { _tag: 'Tick' } })(noTicks)))
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Beeper', on: 'Beeped' })
  })

  test('a child\'s command that nothing interprets is a CompositionDefect naming the child', () => {
    const saving = {
      init: { state: noTicks, commands: [{ _tag: 'Save' as const }] },
      update: (_: Tick) => (state: Ticks) => ({ state }),
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const thrown = (run: () => unknown) => {
      try {
        return run()
      } catch (error) {
        return error
      }
    }
    const One = program<{ state: Ticks }>()
    const one = One.make({
      init: (children) => children.Saving.init,
      children: {
        // @ts-expect-error: a child with commands and no `runCommand` does not compile; this one runs without.
        Saving: One.child(saving, { get: (state) => Opt.some(state), set: (_, child) => child }),
      },
      makeModel: () => null,
    })
    expect(thrown(() => one.runCommand({ _tag: 'Saving', command: { _tag: 'Save' } })))
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Saving', on: 'Save' })
    const List = program<{ state: { rows: ReadonlyArray<Ticks> } }>()
    const list = List.make({
      init: () => ({ state: { rows: [noTicks] } }),
      children: {
        // @ts-expect-error: likewise for children by id.
        Rows: List.childById(saving, {
          get: (state, id: number) => Arr.get(state.rows, id),
          set: (state, id, row) => ({ rows: state.rows.map((kept, at) => at === id ? row : kept) }),
          subscribed: () => [],
        }),
      },
      makeModel: () => null,
    })
    // The id of a child the types refused reads as `never`.
    expect(thrown(() => list.runCommand({ _tag: 'Rows', id: 0 as never, command: { _tag: 'Save' } })))
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Rows', id: 0, on: 'Save' })
  })

  test('an own subscription key that is the lifted key of a child\'s is a defect, never a silent replacement', () => {
    const { child, make } = program<{ state: Ticks; message: Tick }>()
    const clashing = make({
      init: () => ({ state: noTicks }),
      children: { Ticker: child(ticker, { get: Opt.some, set: (_, ticks) => ticks }) },
      update: (_: Tick) => (state) => ({ state }),
      subscriptions: () => HashMap.make([['Ticker', 'ticks'] as const, ticks]),
      makeModel: () => null,
    })
    expect(() => subscriptionsOf(clashing)(noTicks))
      .toThrow(new CompositionDefect({
        message: 'An own subscription key is the key of a subscription of "Ticker"',
        child: 'Ticker',
      }))
  })
})

describe('steps that add up', () => {
  test('andThen takes the second state, and keeps both steps\' commands and events in order', () => {
    const step: Step<Ticks, 'Save' | 'Load', 'Saved' | 'Loaded'> = andThen(
      { state: { ticks: 1 }, commands: ['Save'], events: ['Saved'] },
      ({ ticks }) => ({ state: { ticks: ticks + 1 }, commands: ['Load'], events: ['Loaded'] }),
    )
    expect(step).toEqual({ state: { ticks: 2 }, commands: ['Save', 'Load'], events: ['Saved', 'Loaded'] })
    expect(andThen({ state: noTicks }, (state) => ({ state }))).toEqual({ state: noTicks, commands: [], events: [] })
  })

  test('andThen with the step last, in a pipe, adds up as with the step first', () => {
    const next = ({ ticks }: Ticks): Step<Ticks, 'Load'> => ({ state: { ticks: ticks * 10 }, commands: ['Load'] })
    const first: Step<Ticks, 'Save'> = { state: { ticks: 1 }, commands: ['Save'] }
    expect(pipe(first, andThen(next), andThen(next))).toEqual(andThen(andThen(first, next), next))
  })

  test('forEach makes each item\'s step from the state the previous one left, and keeps every step\'s effects', () => {
    const first: Step<Ticks, string, string> = { state: { ticks: 1 }, commands: ['Save'], events: ['Saved'] }
    const step = forEach(
      first,
      [2, 3],
      (by) => ({ ticks }) => ({ state: { ticks: ticks * by }, commands: [`Times ${by}`], events: [`${ticks}`] }),
    )
    expect(step).toEqual({ state: { ticks: 6 }, commands: ['Save', 'Times 2', 'Times 3'], events: ['Saved', '1', '2'] })
  })

  test('forEach over no items is the step, with both its lists', () => {
    expect(forEach({ state: noTicks }, [], () => (state: Ticks) => ({ state }))).toEqual({
      state: noTicks,
      commands: [],
      events: [],
    })
  })

  test('forEach with the step last, in a pipe, adds up as with the step first', () => {
    const times = (by: number) => ({ ticks }: Ticks): Step<Ticks, number> => ({
      state: { ticks: ticks * by },
      commands: [by],
    })
    expect(pipe({ state: { ticks: 1 } }, forEach([2, 3], times), andThen(times(5))))
      .toEqual(andThen(forEach({ state: { ticks: 1 } }, [2, 3], times), times(5)))
  })

  test('in a pipe, a first step without commands or events has the types of the steps after it', () => {
    const load = ({ ticks }: Ticks): Step<Ticks, 'Load', 'Loaded'> => ({
      state: { ticks: ticks + 1 },
      commands: ['Load'],
      events: ['Loaded'],
    })
    const step: Step<Ticks, 'Load', 'Loaded'> = pipe({ state: noTicks }, andThen(load), forEach([1], () => load))
    expect(step.commands).toEqual(['Load', 'Load'])
    const saved: Step<Ticks, 'Save'> = { state: noTicks, commands: ['Save'] }
    // @ts-expect-error: the first step's commands are kept in the result's type.
    expect(pipe(saved, andThen(load)) satisfies Step<Ticks, 'Load', 'Loaded'>).toEqual(andThen(saved, load))
  })

  test('a parent that tells each of its children by id the same thing, with forEach, reaches every one', () => {
    const Clearing = program<{ state: ListState; message: Reset }>()
    const clearing = Clearing.make({
      init: () => ({ state: { rows: [] } }),
      children: {
        Rows: Clearing.childById(counter, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
          set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
          subscribed: () => [],
        }),
      },
      update: (_: Reset, children) => (state) =>
        forEach({ state }, state.rows, ({ id }) => children.Rows.update(id, CounterMessage.Cleared())),
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    const counted = (id: number, count: number): Row => ({ id, counter: { ...counter.init.state, count } })
    expect(clearing.update({ _tag: 'Reset' })({ rows: [counted(1, 4), counted(2, 7)] })).toEqual({
      state: { rows: [counted(1, 0), counted(2, 0)] },
      commands: [],
      events: [],
    })
  })

  // A page that, left, forgets what it held and says so; a home that has nothing to say about it; an app that
  // counts the pages left, and remembers whether each was left when it heard of it.
  type Leave = Readonly<{ _tag: 'Leave' }>
  type Left = Readonly<{ _tag: 'Left' }>
  const leaving: Program<{
    state: Readonly<{ left: boolean }>
    model: null
    message: Leave
    command: 'Forget'
    event: Left
    external: Leave
  }> = {
    init: { state: { left: false } },
    update: () => () => ({ state: { left: true }, commands: ['Forget'], events: [{ _tag: 'Left' }] }),
    runCommand: () => Effect.succeedNone,
    makeModel: () => null,
  }
  type Home = Readonly<{ page: Readonly<{ left: boolean }> }>
  const Home = program<{ state: Home; event: Left; external: Leave; message: Leave }>()
  const home = Home.make({
    init: (children) => ({ state: { page: children.Page.init.state } }),
    children: { Page: Home.child(leaving, { get: (state) => Opt.some(state.page), set: (_, page) => ({ page }) }) },
    update: (_: Leave, children) => children.Page.update({ _tag: 'Leave' }),
    onEvent: { Page: (event) => (state) => ({ state, events: [event] }) },
    makeModel: () => null,
  })
  type App = Readonly<{ home: Home; heard: ReadonlyArray<boolean>; resets: number }>
  const App = program<{ state: App; message: Reset }>()
  const app = App.make({
    init: (children) => ({ state: { home: children.Home.init.state, heard: [], resets: 0 } }),
    children: {
      Home: App.child(home, { get: (state) => Opt.some(state.home), set: (state, home) => ({ ...state, home }) }),
    },
    update: (_: Reset, children) => (state) =>
      andThen(
        { state: { ...state, resets: state.resets + 1 } },
        children.Home.update({ _tag: 'Leave' }),
      ),
    onEvent: { Home: () => (state) => ({ state: { ...state, heard: [...state.heard, state.home.page.left] } }) },
    makeModel: () => null,
  })

  test('an event its parent raises reaches the grandparent in the same step, after the parent\'s', () => {
    const result = app.update({ _tag: 'Home', message: { _tag: 'Page', message: { _tag: 'Leave' } } })(
      app.init.state,
    )
    expect(result).toEqual({
      state: { home: { page: { left: true } }, heard: [true], resets: 0 },
      commands: [{ _tag: 'Home', command: { _tag: 'Page', command: 'Forget' } }],
      events: [],
    })
  })

  test('a parent\'s own step, then a child\'s, keeps the parent\'s state and both steps\' effects', () => {
    expect(app.update({ _tag: 'Reset' })(app.init.state)).toEqual({
      state: { home: { page: { left: true } }, heard: [true], resets: 1 },
      commands: [{ _tag: 'Home', command: { _tag: 'Page', command: 'Forget' } }],
      events: [],
    })
  })
})

describe('a child placed with an optic', () => {
  const Placed = program<{ state: ParentState }>()
  const placed = Placed.make({
    init: () => ({ state: app.init.state }),
    children: {
      Left: Placed.child(counter, { at: Optic.id<ParentState>().key('left') }),
      Right: Placed.child(counter, { at: Optic.id<ParentState>().key('maybeRight').compose(Optic.some()) }),
    },
    onEvent: { Left: () => (state) => ({ state }), Right: () => (state) => ({ state }) },
    makeModel: (state, children) => ({
      left: children.Left(state),
      maybeRight: Opt.map(state.maybeRight, () => children.Right(state)),
    }),
  })
  const increment = (name: 'Left' | 'Right'): MessageOf<typeof placed> => ({
    _tag: name,
    message: CounterMessage.Increment(),
  })

  test('the optic finds the child and puts its new state back, as get and set would', () => {
    const left = placed.update(increment('Left'))(app.init.state)
    expect(left !== reject && left.state.left.count).toBe(1)
    expect(placed.makeModel(app.init.state).left.count).toBe(0)
  })

  test('a child the optic does not focus is not there: its messages are rejected, and it has no model', () => {
    expect(placed.update(increment('Right'))(app.init.state)).toBe(reject)
    const withRight = { ...app.init.state, maybeRight: Opt.some(counter.init.state) }
    const right = placed.update(increment('Right'))(withRight)
    expect(right !== reject && Opt.map(right.state.maybeRight, (counter) => counter.count)).toEqual(Opt.some(1))
    expect(Opt.map(placed.makeModel(withRight).maybeRight, (model) => model.count)).toEqual(Opt.some(0))
  })

  test('a child by id takes an optic of the id', () => {
    type Rows = Readonly<{ rows: Readonly<Record<number, Counter>> }>
    const ById = program<{ state: Rows }>()
    const byId = ById.make({
      init: () => ({ state: { rows: {} } }),
      children: {
        Rows: ById.childById(counter, {
          at: (id: number) => Optic.id<Rows>().key('rows').optionalKey(id).notUndefined(),
          subscribed: () => [],
        }),
      },
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: (state, children) => Object.keys(state.rows).map((id) => children.Rows(state, Number(id))),
    })
    const state: Rows = { rows: { 1: counter.init.state } }
    const result = byId.update({ _tag: 'Rows', id: 1, message: CounterMessage.Increment() })(state)
    expect(result !== reject && result.state.rows[1]?.count).toBe(1)
    expect(byId.update({ _tag: 'Rows', id: 2, message: CounterMessage.Increment() })(state)).toBe(reject)
    expect(byId.makeModel(state).map((model) => model.count)).toEqual([0])
  })

  test('init gives a new child its state and its commands, lifted with its id', () => {
    const starting: typeof counter = {
      ...counter,
      init: { ...counter.init, commands: [CounterCommand.Save({ count: 0 })] },
    }
    const started = Clearable.make({
      init: () => ({ state: { rows: [] } }),
      children: {
        Rows: Clearable.childById(starting, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
          set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
          subscribed: () => [],
        }),
      },
      update: (_: Reset, children) => (state) => {
        const row = children.Rows.init(7)
        return { state: { rows: [...state.rows, { id: 7, counter: row.state }] }, commands: row.commands }
      },
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    const result = started.update({ _tag: 'Reset' })(started.init.state)
    expect(result !== reject && result.commands).toEqual([
      { _tag: 'Rows', id: 7, command: CounterCommand.Save({ count: 0 }) },
    ])
    expect(result !== reject && result.state.rows).toEqual([{ id: 7, counter: counter.init.state }])
  })

  test('a parent\'s init starts a child there from the start with its commands, lifted', () => {
    const starting: typeof counter = {
      ...counter,
      init: { ...counter.init, commands: [CounterCommand.Save({ count: 0 })] },
    }
    const Starting = program<{ state: ParentState }>()
    const started = Starting.make({
      init: (children) => {
        const left = children.Left.init
        return { state: { ...app.init.state, left: left.state }, commands: left.commands }
      },
      children: {
        Left: Starting.child(starting, { get: (s) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
      },
      onEvent: { Left: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(started.init.commands).toEqual([{ _tag: 'Left', command: CounterCommand.Save({ count: 0 }) }])
  })
})

describe('flags', () => {
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
    init: (count) => ({ state: { count, text: '', saving: true }, commands: [CounterCommand.Save({ count })] }),
  }

  type Seeds = Readonly<
    { maybeSeeded: Opt.Option<Counter>; rows: ReadonlyArray<Readonly<{ id: number; counter: Counter }>> }
  >

  type Seed = Readonly<{ _tag: 'Seed'; count: number }>

  const Seeds = program<{ state: Seeds; message: Seed }>()

  const seeds = Seeds.make({
    init: () => ({ state: { maybeSeeded: Opt.none(), rows: [] } }),
    children: {
      Seeded: Seeds.child(seeded, {
        get: (state) => state.maybeSeeded,
        set: (state, seeded) => ({ ...state, maybeSeeded: Opt.some(seeded) }),
      }),
      Rows: Seeds.childById(seeded, {
        get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
        set: (state, id, counter) => ({
          ...state,
          rows: state.rows.map((row) => row.id === id ? { id, counter } : row),
        }),
        subscribed: () => [],
      }),
    },
    update: ({ count }: Seed, children) => () => {
      const one = children.Seeded.init(count)
      const row = children.Rows.init(7, count + 1)
      return {
        state: { maybeSeeded: Opt.some(one.state), rows: [{ id: 7, counter: row.state }] },
        commands: [...one.commands, ...row.commands],
      }
    },
    onEvent: { Seeded: () => (state) => ({ state }), Rows: () => (state) => ({ state }) },
    makeModel: () => null,
  })

  test('a child with flags starts from the flags its parent gives it, its commands lifted', () => {
    const result = seeds.update({ _tag: 'Seed', count: 3 })(seeds.init.state)
    expect(result !== reject && result.state).toEqual({
      maybeSeeded: Opt.some({ count: 3, text: '', saving: true }),
      rows: [{ id: 7, counter: { count: 4, text: '', saving: true } }],
    })
    expect(result !== reject && result.commands).toEqual([
      { _tag: 'Seeded', command: CounterCommand.Save({ count: 3 }) },
      { _tag: 'Rows', id: 7, command: CounterCommand.Save({ count: 4 }) },
    ])
  })

  // A parent with flags: it starts its counter from twice its own.
  const Relay = program<{ state: Counter; flags: number }>()

  const relay = Relay.make({
    init: (children) => (count) => {
      const inner = children.Inner.init(count * 2)
      return { state: inner.state, commands: inner.commands }
    },
    children: { Inner: Relay.child(seeded, { get: Opt.some, set: (_, inner) => inner }) },
    onEvent: { Inner: () => (state) => ({ state }) },
    makeModel: () => null,
  })

  test('a parent with flags makes its first step from them, and starts its children from them', () => {
    const flags: FlagsOf<typeof relay> = 2
    expect(relay.init(flags)).toEqual({
      state: { count: 4, text: '', saving: true },
      commands: [{ _tag: 'Inner', command: CounterCommand.Save({ count: 4 }) }],
    })
  })

  test('a parent with flags is started from them by its own parent, alone and by id', () => {
    type Relays = Readonly<{ relay: Counter; rows: ReadonlyArray<Readonly<{ id: number; counter: Counter }>> }>
    const Top = program<{ state: Relays }>()
    const top = Top.make({
      init: (children) => {
        const one = children.Relay.init(1)
        const row = children.Rows.init(9, 5)
        return {
          state: { relay: one.state, rows: [{ id: 9, counter: row.state }] },
          commands: [...one.commands, ...row.commands],
        }
      },
      children: {
        Relay: Top.child(relay, {
          get: (state) => Opt.some(state.relay),
          set: (state, one) => ({ ...state, relay: one }),
        }),
        Rows: Top.childById(relay, {
          get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
          set: (state, id, counter) => ({
            ...state,
            rows: state.rows.map((row) => row.id === id ? { id, counter } : row),
          }),
          subscribed: () => [],
        }),
      },
      makeModel: () => null,
    })
    expect(top.init.state).toEqual({
      relay: { count: 2, text: '', saving: true },
      rows: [{ id: 9, counter: { count: 10, text: '', saving: true } }],
    })
    expect(top.init.commands).toEqual([
      { _tag: 'Relay', command: { _tag: 'Inner', command: CounterCommand.Save({ count: 2 }) } },
      { _tag: 'Rows', id: 9, command: { _tag: 'Inner', command: CounterCommand.Save({ count: 10 }) } },
    ])
  })

  test('a parent with flags returns the function of them, and one without its first step', () => {
    Relay.make({
      // @ts-expect-error: its first step depends on its flags.
      init: () => ({ state: counter.init.state }),
      children: { Inner: Relay.child(seeded, { get: Opt.some, set: (_, inner) => inner }) },
      onEvent: { Inner: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    const Pair = program<{ state: Readonly<{ counter: Counter }> }>()
    Pair.make({
      // @ts-expect-error: it has no flags to start from.
      init: () => (count: number) => ({ state: { counter: { ...counter.init.state, count } } }),
      children: { Counter: Pair.child(counter, { at: Optic.id<Readonly<{ counter: Counter }>>().key('counter') }) },
      makeModel: () => null,
    })
  })

  test('a program without children starts from its first step, or from the function of its flags', () => {
    const { make } = program<{ state: Ticks }>()
    const still = make({ init: { state: { ticks: 1 } }, makeModel: (state) => state.ticks })
    expect(still.init).toEqual({ state: { ticks: 1 } })
    const counted = Relay.make({ init: (count) => ({ state: { ...counter.init.state, count } }), makeModel: () => null })
    expect(counted.init(3)).toEqual({ state: { ...counter.init.state, count: 3 } })
    // @ts-expect-error: its first step depends on its flags.
    Relay.make({ init: { state: counter.init.state }, makeModel: () => null })
    // @ts-expect-error: it has no flags to start from.
    make({ init: (ticks: number) => ({ state: { ticks } }), makeModel: () => null })
    // @ts-expect-error: it has no children to start it.
    make({ init: () => ({ state: { ticks: 1 } }), makeModel: () => null })
  })

  test('a child without flags is started with none', () => {
    const { child, make } = program<{ state: Ticks }>()
    // Not called: its `init` would throw.
    const parent = () =>
      make({
        init: (children) => {
          // @ts-expect-error: its first step is a value.
          const started = children.Ticker.init(1)
          return { state: started.state }
        },
        children: { Ticker: child(ticker, { get: Opt.some, set: (_, ticks) => ticks }) },
        makeModel: () => null,
      })
    expect(parent).toBeDefined()
  })

  test('a child with flags starts only from its flags', () => {
    const { child, make } = program<{ state: Opt.Option<Counter>; message: Reset }>()
    const tested = make({
      init: () => ({ state: Opt.none() }),
      children: { Seeded: child(seeded, { get: (state) => state, set: (_, seeded) => Opt.some(seeded) }) },
      update: (_: Reset, children) => () => {
        // @ts-expect-error: the child's first state depends on its flags.
        const started = children.Seeded.init.state
        return { state: Opt.some(started) }
      },
      onEvent: { Seeded: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(tested.init.state).toEqual(Opt.none())
  })
})

// Each `@ts-expect-error` is the test: if the types accepted the mistake, the typecheck would fail.
describe('what the types reject', () => {
  // A program written as a plain object, without `Program<…>`: no external messages, so nothing a parent may send.
  const plain = {
    init: { state: noTicks },
    update: (message: Tick) => ({ ticks }: Ticks) => message._tag === 'Tick' ? { state: { ticks: ticks + 1 } } : reject,
    makeModel: ({ ticks }: Ticks) => ticks,
  }

  // A parent keeps a child's model by its state object: a number or a string has no identity to keep it by.
  test('a program keeps its state in an object, however it is written', () => {
    const counting = {
      init: { state: 0 },
      update: () => (count: number) => ({ state: count + 1 }),
      makeModel: (count: number) => count,
    }
    // @ts-expect-error: a number is no object.
    const typed: Program<{ state: number; model: number; message: Tick }> = counting
    // @ts-expect-error: nor is a string, a parent's included.
    expect(program<{ state: string }>()).toBeDefined()
    const { child, childById } = program<{ state: Ticks }>()
    // @ts-expect-error: a child's state is an object.
    expect(child(counting, { get: () => Opt.some(0), set: (state) => state })).toBeDefined()
    // @ts-expect-error: a child's by id too.
    expect(childById(counting, { get: () => Opt.some(0), set: (state) => state, subscribed: () => [] })).toBeDefined()
    // @ts-expect-error: and so is the state of the program that runs.
    expect(run(counting, () => Effect.void)).toBeDefined()
    // @ts-expect-error: or that a testing tool takes.
    expect(simulate(counting)).toBeDefined()
    // @ts-expect-error: `rehearse` too.
    expect(rehearse(counting, () => Effect.void)).toBeDefined()
    // @ts-expect-error: and `drive`.
    expect(drive(counting, () => Effect.void)).toBeDefined()
    expect([typed, counting]).toHaveLength(2)
  })

  test('a state without fields holds a number too: refused as written, by make, and where a program is a child', () => {
    type Empty = Record<never, never>
    const empty = { init: { state: {} }, update: () => (state: Empty) => ({ state }), makeModel: () => null }
    // @ts-expect-error: a type without fields holds a number too.
    const typed: Program<{ state: Empty; model: null; message: never }> = empty
    // @ts-expect-error: so a program written as an object does not run with it.
    expect(run(empty, () => Effect.void)).toBeDefined()
    // @ts-expect-error: nor does a testing tool take it.
    expect(simulate(empty)).toBeDefined()
    // @ts-expect-error: `rehearse` neither.
    expect(rehearse(empty, () => Effect.void)).toBeDefined()
    // @ts-expect-error: nor `drive`.
    expect(drive(empty, () => Effect.void)).toBeDefined()
    // @ts-expect-error: nor does `make`, whose program would run with a number as its state.
    expect(program<{ state: Empty }>().make({ init: { state: 0 }, makeModel: () => null })).toBeDefined()
    const { child, childById } = program<{ state: Readonly<{ inner: object }> }>()
    // @ts-expect-error: nor `child`, where it would be a defect.
    expect(child(empty, { get: (state) => Opt.some(state.inner), set: (_, inner) => ({ inner }) })).toBeDefined()
    expect(
      // @ts-expect-error: by id too.
      childById(empty, {
        get: (state) => Opt.some(state.inner),
        set: (_, __, inner) => ({ inner }),
        subscribed: () => [],
      }),
    ).toBeDefined()
    const bare = program<{ state: object }>().make({ init: { state: {} }, makeModel: () => null })
    const kept: Program<{ state: object; model: null; message: never }> = bare
    expect(child(bare, { get: (state) => Opt.some(state.inner), set: (_, inner) => ({ inner }) })).toBeDefined()
    expect([typed, kept]).toHaveLength(2)
  })

  test('a state that is a type parameter does not compile in make, and a parameter in a field of the state does', () => {
    // A number could be that parameter, and the compiler cannot decide whether it is one.
    const whole = <S extends object>(state: S) =>
      // @ts-expect-error: the state is the parameter.
      program<{ state: S }>().make({ init: { state }, makeModel: () => null })
    const widened = <S extends object>(state: S) =>
      // @ts-expect-error: the state is the parameter, and more.
      program<{ state: S & Readonly<{ open: boolean }> }>().make({
        init: { state: { ...state, open: false } },
        makeModel: () => null,
      })
    const held = <A>(items: ReadonlyArray<A>) =>
      program<{ state: Readonly<{ items: ReadonlyArray<A> }> }>().make({
        init: { state: { items } },
        makeModel: () => null,
      })
    expect([whole, widened]).toHaveLength(2)
    expect(held([1]).init).toEqual({ state: { items: [1] } })
  })

  test('a child whose type names no external message takes none from its parent', () => {
    const { child, make } = program<{ state: Ticks; message: Reset }>()
    const tested = make({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Reset, children) => (state) => {
        // @ts-expect-error: `Tick` is the child's own business.
        return children.Plain.update({ _tag: 'Tick' })(state)
      },
      makeModel: () => null,
    })
    expect(tested.update({ _tag: 'Reset' })(noTicks)).not.toBe(reject)
  })

  test('a command\'s answer gives a child only what its parent may send it', () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick | Reset; external: Reset }> = {
      init: { state: noTicks },
      update: (message) => ({ ticks }) => ({ state: { ticks: message._tag === 'Tick' ? ticks + 1 : 0 } }),
      makeModel: ({ ticks }) => ticks,
    }
    const { child, make } = program<{ state: Ticks; command: 'Load'; message: 'Loaded' }>()
    const children = {
      Counter: child(resettable, { get: (state: Ticks) => Opt.some(state), set: (_: Ticks, child: Ticks) => child }),
    }
    make({
      init: () => ({ state: noTicks }),
      children,
      update: () => (state) => ({ state, commands: ['Load'] }),
      // @ts-expect-error: `Tick` is the child's own business.
      runCommand: () => Effect.succeedSome({ _tag: 'Counter' as const, message: { _tag: 'Tick' as const } }),
      makeModel: () => null,
    })
    const tested = make({
      init: () => ({ state: noTicks }),
      children,
      update: (_: 'Loaded') => (state: Ticks) => ({ state, commands: ['Load' as const] }),
      runCommand: () => Effect.succeedSome({ _tag: 'Counter' as const, message: { _tag: 'Reset' as const } }),
      makeModel: () => null,
    })
    expect(Effect.runSync(tested.runCommand('Load'))).toEqual(
      Opt.some({ _tag: 'Counter', message: { _tag: 'Reset' } }),
    )
  })

  test('a parent takes from its own parent, for a child, only what the child may be sent', () => {
    const resettable: Program<{ state: Ticks; model: number; message: Tick | Reset; external: Reset }> = {
      init: { state: noTicks },
      update: (message) => ({ ticks }) => ({ state: { ticks: message._tag === 'Tick' ? ticks + 1 : 0 } }),
      makeModel: ({ ticks }) => ticks,
    }
    type Wrapped<M> = Readonly<{ _tag: 'Counter'; message: M }>
    const counter = <M>() => {
      const { child, make } = program<{ state: Ticks; external: Wrapped<M> }>()
      return { make, children: { Counter: child(resettable, { get: Opt.some, set: (_, ticks) => ticks }) } }
    }
    const passing = counter<Reset>()
    const tested = passing.make({ init: () => ({ state: noTicks }), children: passing.children, makeModel: () => null })
    const private_ = counter<Tick>()
    // @ts-expect-error: `Tick` is the child's own business.
    private_.make({ init: () => ({ state: noTicks }), children: private_.children, makeModel: () => null })
    expect(tested.update({ _tag: 'Counter', message: { _tag: 'Reset' } })({ ticks: 2 })).toMatchObject({
      state: { ticks: 0 },
    })
  })

  test('an own message cannot take the name of a child, which would receive it', () => {
    const { child, make } = program<{ state: Ticks; message: Readonly<{ _tag: 'Plain' }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    make({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Readonly<{ _tag: 'Plain' }>) => (state) => ({ state }),
      makeModel: () => null,
    })
  })

  test('an own command cannot take the name of a child, whose interpreter would receive it', () => {
    const { child, make } = program<{ state: Ticks; command: Readonly<{ _tag: 'Plain' }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    make({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null,
    })
  })

  test('an own command cannot take the name of an input', () => {
    type Named = Readonly<{ name: string }>
    const { input, make } = program<{ state: Named; command: Readonly<{ _tag: 'Name' }> }>()
    // @ts-expect-error: `Name` is an input's name.
    make({
      init: { state: { name: '' } },
      inputs: { Name: input({ at: Optic.id<Named>().key('name') }) },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null,
    })
  })

  test('an external message cannot write into an input, whatever spells its tag', () => {
    type Named = Readonly<{ name: string }>
    type Write = Readonly<{ _tag: 'Name'; message: Written<string> }>
    type Own = Readonly<{ _tag: 'Own'; message: Written<string> }>
    type Either = Readonly<{ _tag: 'Name' | 'Own'; message: Written<string> }>
    type Any = Readonly<{ _tag: string; message: Written<string> }>
    type Cleared = Readonly<{ _tag: 'Cleared' }>
    const inputs = { Name: program<{ state: Named }>().input({ at: Optic.id<Named>().key('name') }) }
    const init = { state: { name: 'Ada' } }
    // @ts-expect-error: `Name` is an input's name.
    program<{ state: Named; external: Write }>().make({ init, inputs, makeModel: () => null })
    // @ts-expect-error: likewise when it is one tag of several.
    program<{ state: Named; message: Own; external: Either }>().make({
      init,
      inputs,
      update: (_: Own) => (state) => ({ state }),
      makeModel: () => null,
    })
    // @ts-expect-error: likewise when the tag is any string.
    program<{ state: Named; message: Any; external: Any }>().make({
      init,
      inputs,
      update: (_: Any) => (state) => ({ state }),
      makeModel: () => null,
    })
    const clearing = program<{ state: Named; message: Cleared; external: Cleared }>().make({
      init,
      inputs,
      update: (_: Cleared) => () => ({ state: { name: '' } }),
      makeModel: () => null,
    })
    expect(clearing.update({ _tag: 'Cleared' })(init.state)).toEqual({ state: { name: '' } })
  })

  test('an input cannot take the name of a child, which it would replace', () => {
    type Named = Readonly<{ ticks: number; name: string }>
    const { child, make, input } = program<{ state: Named }>()
    // @ts-expect-error: `Plain` is a child's name.
    make({
      init: () => ({ state: { ticks: 0, name: '' } }),
      children: {
        Plain: child(plain, { get: (state) => Opt.some(state), set: (state, ticks) => ({ ...state, ...ticks }) }),
      },
      inputs: { Plain: input({ at: Optic.id<Named>().key('name') }) },
      makeModel: () => null,
    })
  })

  test('an external message is one of the program\'s messages, however the program is made', () => {
    // @ts-expect-error: `Reset` is none of its messages.
    const resetting: Program<{ state: Ticks; model: number; message: Tick; external: Reset }> = {
      init: { state: noTicks },
      update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
      makeModel: ({ ticks }) => ticks,
    }
    const Wrapper = program<{ state: Ticks; external: Reset; message: Tick }>()
    const wrapper = Wrapper.make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      makeModel: () => null,
    })
    const { child, childById } = program<{ state: Ticks }>()
    // @ts-expect-error: its parent may send it a `Reset`, which its `update` does not take.
    expect(child(wrapper, { get: Opt.some, set: (_, ticks) => ticks })).toBeDefined()
    // @ts-expect-error: likewise for children by id.
    expect(childById(wrapper, { get: () => Opt.some(noTicks), set: (state) => state, subscribed: () => [] })).toBeDefined()
    expect(resetting).toBeDefined()
  })

  test('a program may be typed with fewer external messages than it takes, never with more', () => {
    const resetting = program<{ state: Ticks; message: Tick | Reset; external: Reset }>().make({
      init: { state: noTicks },
      update: (message: Tick | Reset) => ({ ticks }) => ({ state: { ticks: message._tag === 'Tick' ? ticks + 1 : 0 } }),
      makeModel: ({ ticks }) => ticks,
    })
    // @ts-expect-error: its parent could send it a `Tick`, which its `update` would take as its own business.
    const widened: Program<{ state: Ticks; model: number; message: Tick | Reset; external: Tick | Reset }> = resetting
    const narrowed: Program<{ state: Ticks; model: number; message: Tick | Reset }> = resetting
    expectTypeOf<ExternalOf<typeof narrowed>>().toEqualTypeOf<never>()
    expectTypeOf<ExternalOf<typeof resetting>>().toEqualTypeOf<Reset>()
    expect([widened, narrowed]).toEqual([resetting, resetting])
  })

  test('a function over programs passes its type parameter on to them', () => {
    const counting = program<{ state: Ticks; model: number; message: Tick }>().make(plain)
    const same = <T extends { state: object; model: unknown; message: unknown }>(p: Program<T>) => p
    const maker = <T extends { state: object }>() => program<T>()
    expect(same(counting)).toBe(counting)
    expect(maker<{ state: Ticks }>().make({ init: { state: noTicks }, makeModel: () => null }).init).toEqual({
      state: noTicks,
    })
  })

  // What a program's type does not name is read back as none, and what it names as `unknown` as anything.
  test('a child whose init is a function starts from flags, whatever their type', () => {
    const unknowing: Program<{ state: Ticks; model: number; message: Tick; flags: unknown }> = {
      init: () => ({ state: noTicks }),
      update: () => (state) => ({ state }),
      makeModel: ({ ticks }) => ticks,
    }
    const thunk = { ...plain, init: () => ({ state: noTicks }) }
    const { child, make } = program<{ state: Readonly<{ a: Ticks; b: Ticks }> }>()
    // Not called: it would start the children without flags.
    const parent = () =>
      make({
        init: (children) => ({
          state: {
            // @ts-expect-error: its first state depends on its flags.
            a: children.Unknowing.init.state,
            // @ts-expect-error: and so does that of a program written as a plain object.
            b: children.Thunk.init.state,
          },
        }),
        children: {
          Unknowing: child(unknowing, { get: (state) => Opt.some(state.a), set: (state, a) => ({ ...state, a }) }),
          Thunk: child(thunk, { get: (state) => Opt.some(state.b), set: (state, b) => ({ ...state, b }) }),
        },
        makeModel: () => null,
      })
    const flags: [FlagsOf<typeof unknowing>, FlagsOf<typeof thunk>] = [Symbol(), null]
    // @ts-expect-error: a program whose first step is a value has no flags.
    const none: FlagsOf<typeof plain> = null
    expect([parent, flags, none]).toHaveLength(3)
  })

  test('a child whose events are of any type needs an onEvent', () => {
    const telling: Program<{ state: Ticks; model: number; message: Tick; event: unknown }> = {
      init: { state: noTicks },
      update: () => (state) => ({ state, events: [state.ticks] }),
      makeModel: ({ ticks }) => ticks,
    }
    const { child, make } = program<{ state: Ticks }>()
    // @ts-expect-error: its events would go unhandled.
    make({
      init: () => ({ state: noTicks }),
      children: { Telling: child(telling, { get: Opt.some, set: (_, ticks) => ticks }) },
      makeModel: () => null,
    })
  })

  test('a program\'s commands and events are those its steps list, and none where none lists them', () => {
    const sometimes = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) =>
        state.ticks > 1 ? { state, events: ['Many' as const], commands: [1 as const] }
        : state.ticks > 0 ? { state, events: ['One' as const] }
        : reject,
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const read: [EventOf<typeof sometimes>, CommandOf<typeof sometimes>] = ['One', 1]
    // @ts-expect-error: no step lists another event.
    const other: EventOf<typeof sometimes> = 'None'
    // @ts-expect-error: nor does any step of a program that lists none.
    const none: EventOf<typeof plain> | CommandOf<typeof plain> = 'None'
    const anything: [EventOf<Program<{ state: Ticks; model: null; message: Tick; event: unknown }>>] = [Symbol()]
    expect([read, other, none, anything]).toHaveLength(4)
  })

  test('a program that names events and no messages has those events, for its parent too', () => {
    type Rang = Readonly<{ _tag: 'Rang' }>
    const bell = program<{ state: Ticks; event: Rang }>().make({ init: { state: noTicks }, makeModel: () => null })
    const event: EventOf<typeof bell> = { _tag: 'Rang' }
    const { child, make } = program<{ state: Ticks }>()
    make({
      init: () => ({ state: noTicks }),
      children: { Bell: child(bell, { get: Opt.some, set: (_, ticks) => ticks }) },
      onEvent: { Bell: (rang) => (state) => ({ state: { ticks: rang._tag.length + state.ticks } }) },
      makeModel: () => null,
    })
    expect(event).toEqual({ _tag: 'Rang' })
  })

  test('a child that starts with no command still has those its update returns', () => {
    const saving = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) =>
        state.ticks > 0 ? { state, commands: ['Save' as const] } : { state: { ticks: 1 } },
      runCommand: () => Effect.succeedNone,
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const { child, make } = program<{ state: Ticks }>()
    const tested = make({
      init: () => ({ state: noTicks }),
      children: { Saving: child(saving, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
    const command: CommandOf<typeof tested> = { _tag: 'Saving', command: 'Save' }
    // @ts-expect-error: the child returns no other command.
    const other: CommandOf<typeof saving> = 'Load'
    expect([command, other]).toHaveLength(2)
  })

  test('a program raises only the events its own type includes, with or without children', () => {
    type Gone = Readonly<{ _tag: 'Gone' }>
    program<{ state: Ticks }>().make({
      init: { state: noTicks },
      // @ts-expect-error: it names no event.
      update: (_: Tick) => (state) => ({ state, events: [{ _tag: 'Gone' } as Gone] }),
      makeModel: ({ ticks }) => ticks,
    })
    const leaving = program<{ state: Ticks; event: Gone; message: Tick }>().make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state, events: [{ _tag: 'Gone' } as Gone] }),
      makeModel: ({ ticks }) => ticks,
    })
    expect(leaving.update({ _tag: 'Tick' })(noTicks)).toEqual({ state: noTicks, events: [{ _tag: 'Gone' }] })
    const gone = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) => ({ state, events: [{ _tag: 'Gone' } as Gone] }),
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const Silent = program<{ state: Ticks; event: Readonly<{ _tag: 'Other' }> }>()
    Silent.make({
      init: () => ({ state: noTicks }),
      children: { Gone: Silent.child(gone, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      // @ts-expect-error: `Gone` is no event of this parent's.
      onEvent: { Gone: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null,
    })
    const Raising = program<{ state: Ticks; event: Gone }>()
    expect(Raising.make({
      init: () => ({ state: noTicks }),
      children: { Gone: Raising.child(gone, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      onEvent: { Gone: (event) => (state) => ({ state, events: [event] }) },
      makeModel: () => null,
    }).update({ _tag: 'Gone', message: { _tag: 'Tick' } })(noTicks)).toEqual({
      state: noTicks,
      commands: [],
      events: [{ _tag: 'Gone' }],
    })
  })

  test('commands of its own need a runCommand', () => {
    const { child, make } = program<{ state: Ticks; command: Readonly<{ _tag: 'Beep' }> }>()
    // @ts-expect-error: `Beep` would go uninterpreted.
    make({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
  })

  test('the commands of a parent need what its runCommand and those of its children need, and its subscriptions what its own and those of its children need, wherever they are returned', () => {
    class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('Clock') {}
    class Disk extends Context.Service<Disk, { readonly now: Effect.Effect<number> }>()('Disk') {}
    class Gong extends Context.Service<Gong, { readonly now: Effect.Effect<number> }>()('Gong') {}
    class Feed extends Context.Service<Feed, { readonly ticks: Subscription<Tick, never> }>()('Feed') {}
    class Wire extends Context.Service<Wire, { readonly ticks: Subscription<Tick, never> }>()('Wire') {}
    class Tape extends Context.Service<Tape, { readonly ticks: Subscription<Tick, never> }>()('Tape') {}
    class Bell extends Context.Service<Bell, { readonly ticks: Subscription<Tick, never> }>()('Bell') {}
    // Unlike two `extends`, it tells `any` and `unknown` from the services named.
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const tick = (): Opt.Option<Tick> => Opt.some({ _tag: 'Tick' })
    const fromClock = Effect.map(Effect.service(Clock), tick)
    const fromDisk = Effect.map(Effect.service(Disk), tick)
    const fromFeed = Channel.unwrap(Effect.map(Effect.service(Feed), (feed) => feed.ticks))
    const fromWire = Channel.unwrap(Effect.map(Effect.service(Wire), (wire) => wire.ticks))
    const fromTape = Channel.unwrap(Effect.map(Effect.service(Tape), (tape) => tape.ticks))
    const ringing: Program<
      { state: Ticks; model: null; message: Tick; command: 'Ring'; commandServices: Gong; subscriptionServices: Bell }
    > = {
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      runCommand: () => Effect.map(Effect.service(Gong), tick),
      subscriptions: () =>
        HashMap.make(['bell', Channel.unwrap(Effect.map(Effect.service(Bell), (bell) => bell.ticks))]),
      makeModel: () => null,
    }
    const { child, make } = program<{ state: Ticks; command: 'Read' | 'Load'; message: Tick }>()
    // One service for each place they are read from: the two branches of `runCommand`, two subscriptions of one map,
    // a second map, and a child's command and subscription.
    const app = make({
      init: () => ({ state: noTicks }),
      children: { Ringing: child(ringing, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: (command) => command === 'Read' ? fromClock : fromDisk,
      subscriptions: ({ ticks }) =>
        ticks > 0 ? HashMap.make(['feed', fromFeed], ['wire', fromWire]) : HashMap.make(['tape', fromTape]),
      makeModel: () => null,
    })
    const commands: Exactly<CommandServicesOf<typeof app>, Clock | Disk | Gong> = true
    expect(commands).toBe(true)
    const subscriptions: Exactly<SubscriptionServicesOf<typeof app>, Feed | Wire | Tape | Bell> = true
    expect(subscriptions).toBe(true)
    // An empty map needs nothing, wherever it is returned from.
    const quiet = make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => Effect.succeedNone,
      subscriptions: ({ ticks }) =>
        Opt.match(Opt.liftPredicate(ticks, (ticks) => ticks > 0), {
          onNone: () => HashMap.empty(),
          onSome: (ticks) => ticks > 1 ? HashMap.make(['feed', fromFeed]) : HashMap.empty(),
        }),
      makeModel: () => null,
    })
    const quietCommands: Exactly<CommandServicesOf<typeof quiet>, never> = true
    expect(quietCommands).toBe(true)
    const one: Exactly<SubscriptionServicesOf<typeof quiet>, Feed> = true
    expect(one).toBe(true)
    const silent = make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => Effect.succeedNone,
      subscriptions: () => HashMap.empty(),
      makeModel: () => null,
    })
    const none: Exactly<SubscriptionServicesOf<typeof silent>, never> = true
    expect(none).toBe(true)
    // What a `runCommand` is annotated to need is the parent's too, whatever it returns.
    const annotated = make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: (): Execution<Tick, Clock | Disk> => fromClock,
      makeModel: () => null,
    })
    const named: Exactly<CommandServicesOf<typeof annotated>, Clock | Disk> = true
    expect(named).toBe(true)
    const unheard: Exactly<SubscriptionServicesOf<typeof annotated>, never> = true
    expect(unheard).toBe(true)
  })

  test('services that a type does not say, any or unknown, are needed as unknown, by the program and by its parent', () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const loose: any = Effect.succeedNone
    const Leaf = program<{ state: Ticks; message: Tick; command: 'Read' }>()
    const base = { init: { state: noTicks }, update: (_: Tick) => (state: Ticks) => ({ state }), makeModel: () => null }
    const untyped = Leaf.make({ ...base, runCommand: () => loose })
    const unknowing = Leaf.make({ ...base, runCommand: () => Effect.succeedNone as Execution<Tick, unknown> })
    const unheard = program<{ state: Ticks; message: Tick }>().make({ ...base, subscriptions: () => loose })
    const declared: Program<{ state: Ticks; model: null; message: Tick; subscriptionServices: unknown }> = base
    const commands: Exactly<CommandServicesOf<typeof untyped>, unknown> = true
    const unknownCommands: Exactly<CommandServicesOf<typeof unknowing>, unknown> = true
    const subscriptions: Exactly<SubscriptionServicesOf<typeof unheard>, unknown> = true
    const declaredSubscriptions: Exactly<SubscriptionServicesOf<typeof declared>, unknown> = true
    const none: Exactly<SubscriptionServicesOf<typeof base>, never> = true
    type Pair = Readonly<{ left: Ticks; right: Ticks }>
    const Parent = program<{ state: Pair }>()
    const parent = Parent.make({
      init: (children) => ({ state: { left: children.Left.init.state, right: children.Right.init.state } }),
      children: {
        Left: Parent.child(untyped, { at: Optic.id<Pair>().key('left') }),
        Right: Parent.child(unheard, { at: Optic.id<Pair>().key('right') }),
      },
      makeModel: () => null,
    })
    const parentCommands: Exactly<CommandServicesOf<typeof parent>, unknown> = true
    const parentSubscriptions: Exactly<SubscriptionServicesOf<typeof parent>, unknown> = true
    expect([commands, unknownCommands, subscriptions, declaredSubscriptions, none, parentCommands, parentSubscriptions])
      .toEqual([true, true, true, true, true, true, true])
  })

  test('one branch of a runCommand, or one subscription of a map, that answers with no message of the parent\'s', () => {
    class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()('Clock') {}
    type Tock = Readonly<{ _tag: 'Tock' }>
    const fromClock = Effect.map(Effect.service(Clock), (): Opt.Option<Tick> => Opt.some({ _tag: 'Tick' }))
    const tock: Execution<Tock, never> = Effect.succeedNone
    const { make } = program<{ state: Ticks; command: 'Read' | 'Load'; message: Tick }>()
    make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      // @ts-expect-error: `Tock` is no message of this parent's.
      runCommand: (command) => command === 'Read' ? fromClock : tock,
      makeModel: () => null,
    })
    make({
      init: { state: noTicks },
      update: (_: Tick) => (state) => ({ state }),
      runCommand: () => fromClock,
      // @ts-expect-error: `Tock` is no message of this parent's.
      subscriptions: () =>
        HashMap.make(
          ['ticks', Channel.never as Subscription<Tick, Clock>],
          ['tocks', Channel.never as Subscription<Tock, never>],
        ),
      makeModel: () => null,
    })
  })

  test('a model that is named is checked, one that is not is inferred, and own messages are those named', () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    type Reset = 'Reset'
    const Named = program<{ state: Ticks; model: number; message: Tick | Reset }>()
    const named = Named.make({
      init: { state: noTicks },
      update: (message) => ({ ticks }) => ({ state: { ticks: message === 'Reset' ? 0 : ticks + 1 } }),
      makeModel: ({ ticks }) => ticks,
    })
    const model: Exactly<ModelOf<typeof named>, number> = true
    const messages: Exactly<MessageOf<typeof named>, Tick | Reset> = true
    Named.make({
      init: { state: noTicks },
      // @ts-expect-error: it takes `Reset` too.
      update: (_: Tick) => (state) => ({ state }),
      makeModel: ({ ticks }) => ticks,
    })
    Named.make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      // @ts-expect-error: its model is a number.
      makeModel: ({ ticks }) => String(ticks),
    })
    program<{ state: Ticks; model: never }>().make({
      init: { state: noTicks },
      // @ts-expect-error: a model named `never` is named all the same, and no model is one.
      makeModel: ({ ticks }) => ticks,
    })
    const inferred = program<{ state: Ticks; message: Reset }>().make({
      init: { state: noTicks },
      update: () => (state) => ({ state }),
      makeModel: ({ ticks }) => ticks,
    })
    const inferredModel: Exactly<ModelOf<typeof inferred>, number> = true
    const namedMessages: Exactly<MessageOf<typeof inferred>, Reset> = true
    // A parent's own messages are its own: its child's are added.
    type Clock = Readonly<{ clock: Ticks }>
    const Parent = program<{ state: Clock; message: Reset }>()
    const parent = Parent.make({
      init: (children) => ({ state: { clock: children.Clock.init.state } }),
      children: { Clock: Parent.child(ticker, { at: Optic.id<Clock>().key('clock') }) },
      update: () => () => ({ state: { clock: noTicks } }),
      makeModel: (state, children) => children.Clock(state),
    })
    const parentMessages: Exactly<MessageOf<typeof parent>, Reset | Readonly<{ _tag: 'Clock'; message: Tick }>> = true
    expect([model, messages, inferredModel, namedMessages, parentMessages]).toEqual([true, true, true, true, true])
  })

  test('an update is there exactly when the program names messages of its own', () => {
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    program<{ state: Ticks }>().make({
      init: { state: noTicks },
      // @ts-expect-error: it names no messages, so it has none to update on.
      update: (_: Tick) => (state) => ({ state }),
      makeModel: () => null,
    })
    // @ts-expect-error: it names messages, and nothing updates on them.
    program<{ state: Ticks; message: Tick }>().make({ init: { state: noTicks }, makeModel: () => null })
    // An update given by name, and a command that answers with fewer messages than it takes.
    const update: Update<Ticks, Tick | Reset, 'Beep'> = (message) => ({ ticks }) =>
      message._tag === 'Tick' ? { state: { ticks: ticks + 1 }, commands: ['Beep'] } : { state: noTicks }
    const answered = program<{ state: Ticks; message: Tick | Reset; command: 'Beep' }>().make({
      init: { state: noTicks },
      update,
      runCommand: () => Effect.succeedSome<Tick>({ _tag: 'Tick' }),
      makeModel: ({ ticks }) => ticks,
    })
    const byName: Exactly<MessageOf<typeof answered>, Tick | Reset> = true
    expect(byName).toBe(true)
  })
})

describe('a child\'s subscriptions in a run', () => {
  // Its lifted keys are new arrays for each new state of the child: only their values, compared with `Equal`, keep
  // its subscription running.
  test('a child whose state changes, under the same key, keeps its subscription running', async () => {
    let starts = 0
    type Bumps = Readonly<{ bumps: number }>
    const bumping: Program<{ state: Bumps; model: number; message: 'Bump' }> = {
      init: { state: { bumps: 0 } },
      update: () => ({ bumps }) => ({ state: { bumps: bumps + 1 } }),
      subscriptions: () =>
        HashMap.make([
          { name: 'ticks' },
          Channel.fromEffectDone(Effect.sync(() => void (starts += 1)).pipe(Effect.andThen(Effect.never))),
        ]),
      makeModel: ({ bumps }) => bumps,
    }
    type Holder = Readonly<{ bumping: Bumps }>
    const { child, make } = program<{ state: Holder }>()
    const holder = make({
      init: (children) => ({ state: { bumping: children.Bumping.init.state } }),
      children: { Bumping: child(bumping, { at: Optic.id<Holder>().key('bumping') }) },
      makeModel: (state, children) => children.Bumping(state),
    })
    await Effect.runPromise(run(holder, (frames) =>
      frames.pipe(
        Stream.tap(({ model, dispatch }) => model < 3 ? dispatch({ _tag: 'Bumping', message: 'Bump' }) : Effect.void),
        Stream.takeUntil(({ model }) => model === 3),
        Stream.runDrain,
      )))
    expect(starts).toBe(1)
  })
})
