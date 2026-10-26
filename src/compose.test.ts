import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'
import type { Subscription } from './subscription.ts'
import { isRejected, reject } from './update.ts'
import { type Dispatch, dispatchTo } from './dispatch.ts'
import { parent } from './compose.ts'
import { CompositionDefect } from './defect.ts'
import { type CommandOf, type FlagsOf, type MessageOf, type Program, subscriptionsOf } from './program.ts'
import { type Frame, run } from './run.ts'

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

const Parent = parent<{ state: ParentState }>()

const app = Parent.compose({
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

const left = (frame: Frame<Model, AppMessage>) => dispatchTo(frame.dispatch, 'Left')

/** A dispatch that keeps what it is sent, for `dispatchTo` to wrap. */
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
    const row = dispatchTo(dispatchTo(dispatch, 'Lists', 'A'), 'Rows', 1)
    Effect.runSync(row(CounterMessage.Increment()))
    Effect.runSync(dispatchTo(dispatchTo(dispatch, 'Lists', 'B'), 'Rows', 1)(CounterMessage.Increment()))
    expect(sent).toEqual(['A', 'B'].map((id) => ({
      _tag: 'Lists',
      id,
      message: { _tag: 'Rows', id: 1, message: CounterMessage.Increment() },
    })))
    expect(dispatchTo(dispatchTo(dispatch, 'Lists', 'A'), 'Rows', 1)).toBe(row)
    expect(dispatchTo(dispatchTo(dispatch, 'Lists', 'A'), 'Rows', 2)).not.toBe(row)
    // @ts-expect-error: a name that is no child's gives nothing to send with.
    expect(() => dispatchTo(dispatch, 'Rows')(CounterMessage.Increment())).toBeDefined()
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
    expect(!isRejected(result) && result.state.left.count).toBe(0)
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
    const Pings = parent<{ state: Pinged }>()
    const pingers = (onPinged: (state: Pinged) => Pinged) =>
      Pings.compose({
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
    expect(!isRejected(kept) && kept.state === before).toBe(true)
    expect(!isRejected(kept) && kept.commands).toEqual([{ _tag: 'Pinger', command: 'Pong' }])
    expect(!isRejected(heard) && heard.state.heard).toBe(1)
  })

  test('a message for a child that is not there is rejected', () => {
    expect(isRejected(app.update({ _tag: 'Right', message: CounterMessage.Increment() })(app.init.state)))
      .toBe(true)
  })

  test('the model of a child that is not there is a defect', () => {
    const Broken = parent<{ state: ParentState }>()
    const broken = Broken.compose({
      init: () => ({ state: app.init.state }),
      children: { Right: Broken.child(counter, { get: (s) => s.maybeRight, set: (s) => s }) },
      onEvent: { Right: () => (state) => ({ state }) },
      makeModel: (state, children) => children.Right(state),
    })
    expect(() => broken.makeModel(app.init.state)).toThrow()
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
    Effect.runSync(dispatchTo(dispatch, 'Left')(model.left.increment))
    Effect.runSync(dispatchTo(dispatch, 'Right')(model.left.increment))
    expect(sent).toEqual([
      { _tag: 'Left', message: CounterMessage.Increment() },
      { _tag: 'Right', message: CounterMessage.Increment() },
    ])
  })
})

// A list of counters, by id; one row is removed when it reports a save.
type Row = Readonly<{ id: number; counter: Counter }>
type ListState = Readonly<{ rows: ReadonlyArray<Row> }>

const List = parent<{ state: ListState }>()

const list = List.compose({
  init: () => ({ state: { rows: [] } }),
  children: {
    Rows: List.each(counter, {
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

const Nested = parent<{ state: Lists }>()

const lists = Nested.compose({
  init: () => ({ state: { rows: [] } }),
  children: {
    Lists: Nested.each(list, {
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
    expect(!isRejected(result) && result.state.rows.map((row) => row.counter.count)).toEqual([0, 1])
  })

  test('children that share one state object share its model, and their dispatch adds their id', () => {
    const [first, second] = list.makeModel(rows(1, 2))
    expect(first?.model).toBe(second?.model)
    const { sent, dispatch } = recording<MessageOf<typeof list>>()
    Effect.runSync(dispatchTo(dispatch, 'Rows', 2)(CounterMessage.Increment()))
    expect(sent).toEqual([{ _tag: 'Rows', id: 2, message: CounterMessage.Increment() }])
  })

  test('a child\'s model is kept while its state is the same object', () => {
    const state = rows(1, 2)
    expect(list.makeModel({ rows: [...state.rows] })[1]?.model).toBe(list.makeModel(state)[1]?.model)
  })

  test('a child\'s model is let go with its state', async () => {
    const make = () => {
      const model = list.makeModel({ rows: [{ id: 1, counter: { ...counter.init.state } }] })[0]?.model
      return new WeakRef(model ?? {})
    }
    const released = make()
    // A WeakRef keeps its target until the current job ends: a macrotask, unlike a microtask, ends it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    Bun.gc(true)
    expect(released.deref()).toBeUndefined()
  })

  test('the models of ids shown once each, under one shared state, do not pile up', () => {
    Bun.gc(true)
    const before = process.memoryUsage().heapUsed
    for (let id = 0; id < 50_000; id++) list.makeModel(rows(id))
    Bun.gc(true)
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
            const send = dispatchTo(dispatchTo(frame.dispatch, 'Lists', id), 'Rows', 1)
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
    if (isRejected(saving)) throw new Error('saving was rejected')
    expect(saving.commands).toEqual([{ _tag: 'Rows', id: 2, command: CounterCommand.Save(counter.init.state) }])
    const [command] = saving.commands ?? []
    if (command === undefined) throw new Error('saving started no command')
    const saved = await Effect.runPromise(list.runCommand(command))
    expect(saved).toEqual(Opt.some({ _tag: 'Rows', id: 2, message: CounterMessage.Saved() }))
    const done = list.update(Opt.getOrThrow(saved))(saving.state)
    expect(!isRejected(done) && done.state.rows.map((row) => row.id)).toEqual([1])
  })

  test('the late message of a removed child is rejected', () => {
    expect(isRejected(list.update({ _tag: 'Rows', id: 3, message: CounterMessage.Increment() })(rows(1, 2)))).toBe(true)
  })

  test('each child listens under its name and id, alone ones under their name', () => {
    const Tickers = parent<{ state: Readonly<{ ids: ReadonlyArray<number> }> }>()
    const tickerList = Tickers.compose({
      init: () => ({ state: { ids: [7, 8] } }),
      children: {
        Tickers: Tickers.each(ticker, {
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
})

describe('what a parent can do with a child', () => {
  test('a handle\'s update takes only the messages the child\'s type says a parent may send', () => {
    const sendTo = Parent.compose({
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
    expect(isRejected(sendTo.update({ _tag: 'Reset' })(app.init.state))).toBe(false)
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
  const Pages = parent<{ state: Pages }>()
  const shown = Pages.child(page, { get: (state) => state.page, set: (_, page) => ({ page: Opt.some(page) }) })

  test('a child answers its parent with its state or an event, handled in the same step', () => {
    const pages = Pages.compose({
      init: () => ({ state: { page: Opt.some(page.init.state) } }),
      children: { Page: shown },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => () => ({ state: { page: Opt.none() } }) },
      makeModel: () => null,
    })
    const back = (state: Pages) => {
      const result = pages.update({ _tag: 'BackPressed' })(state)
      return isRejected(result) ? state : result.state
    }
    expect(back(pages.init.state)).toEqual({ page: Opt.some({ menu: false }) })
    expect(back(back(pages.init.state))).toEqual({ page: Opt.none() })
  })

  test('a child that rejects what its parent gives it, or is not there to take it, is a defect', () => {
    const rejecting: typeof page = { ...page, update: () => (state) => state.menu ? { state } : reject }
    const pages = Pages.compose({
      init: () => ({ state: { page: Opt.some(page.init.state) } }),
      children: {
        Page: Pages.child(rejecting, { get: (state) => state.page, set: (_, page) => ({ page: Opt.some(page) }) }),
      },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.some({ menu: false }) }))
      .toThrow('"Page" rejected an external message')
    expect(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.none() }))
      .toThrow('An external message to "Page", which is not in this state')
  })

  test('a defect of the composition is a CompositionDefect naming the child, with its id for a child by id', () => {
    const thrown = (act: () => unknown): unknown => {
      try {
        act()
      } catch (error) {
        return error
      }
      throw new Error('nothing was thrown')
    }
    const pages = Pages.compose({
      init: () => ({ state: { page: Opt.none() } }),
      children: { Page: shown },
      update: (_: BackPressed, children) => children.Page.update({ _tag: 'BackPressed' }),
      onEvent: { Page: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    const alone = thrown(() => pages.update({ _tag: 'BackPressed' })({ page: Opt.none() }))
    expect(alone).toBeInstanceOf(CompositionDefect)
    expect(alone).toMatchObject({ _tag: 'CompositionDefect', child: 'Page' })
    expect(Object.hasOwn(alone as object, 'id')).toBe(false)
    const telling = List.compose({
      init: () => ({ state: { rows: [] } }),
      children: {
        Rows: List.each(counter, {
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
      .toMatchObject({ _tag: 'CompositionDefect', child: 'Rows', id: 7 })
  })

  test('an own subscription key that is the lifted key of a child\'s is a defect, never a silent replacement', () => {
    const { child, compose } = parent<{ state: Ticks }>()
    const clashing = compose({
      init: () => ({ state: noTicks }),
      children: { Ticker: child(ticker, { get: Opt.some, set: (_, ticks) => ticks }) },
      update: (_: Tick) => (state) => ({ state }),
      subscriptions: () => HashMap.make([['Ticker', 'ticks'] as const, ticks]),
      makeModel: () => null,
    })
    expect(() => subscriptionsOf(clashing)(noTicks)).toThrow(CompositionDefect)
  })
})

describe('a child placed with an optic', () => {
  const Placed = parent<{ state: ParentState }>()
  const placed = Placed.compose({
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
    expect(!isRejected(left) && left.state.left.count).toBe(1)
    expect(placed.makeModel(app.init.state).left.count).toBe(0)
  })

  test('a child the optic does not focus is not there: its messages are rejected, and it has no model', () => {
    expect(isRejected(placed.update(increment('Right'))(app.init.state))).toBe(true)
    const withRight = { ...app.init.state, maybeRight: Opt.some(counter.init.state) }
    const right = placed.update(increment('Right'))(withRight)
    expect(!isRejected(right) && Opt.map(right.state.maybeRight, (counter) => counter.count)).toEqual(Opt.some(1))
    expect(Opt.map(placed.makeModel(withRight).maybeRight, (model) => model.count)).toEqual(Opt.some(0))
  })

  test('a child by id takes an optic of the id', () => {
    type Rows = Readonly<{ rows: Readonly<Record<number, Counter>> }>
    const ById = parent<{ state: Rows }>()
    const byId = ById.compose({
      init: () => ({ state: { rows: {} } }),
      children: {
        Rows: ById.each(counter, {
          at: (id: number) => Optic.id<Rows>().key('rows').optionalKey(id).notUndefined(),
          subscribed: () => [],
        }),
      },
      onEvent: { Rows: () => (state) => ({ state }) },
      makeModel: (state, children) => Object.keys(state.rows).map((id) => children.Rows(state, Number(id))),
    })
    const state: Rows = { rows: { 1: counter.init.state } }
    const result = byId.update({ _tag: 'Rows', id: 1, message: CounterMessage.Increment() })(state)
    expect(!isRejected(result) && result.state.rows[1]?.count).toBe(1)
    expect(isRejected(byId.update({ _tag: 'Rows', id: 2, message: CounterMessage.Increment() })(state))).toBe(true)
    expect(byId.makeModel(state).map((model) => model.count)).toEqual([0])
  })

  test('init gives a new child its state and its commands, lifted with its id', () => {
    const starting: typeof counter = {
      ...counter,
      init: { ...counter.init, commands: [CounterCommand.Save({ count: 0 })] },
    }
    const started = List.compose({
      init: () => ({ state: { rows: [] } }),
      children: {
        Rows: List.each(starting, {
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
    expect(!isRejected(result) && result.commands).toEqual([
      { _tag: 'Rows', id: 7, command: CounterCommand.Save({ count: 0 }) },
    ])
    expect(!isRejected(result) && result.state.rows).toEqual([{ id: 7, counter: counter.init.state }])
  })

  test('a parent\'s init starts a child there from the start with its commands, lifted', () => {
    const starting: typeof counter = {
      ...counter,
      init: { ...counter.init, commands: [CounterCommand.Save({ count: 0 })] },
    }
    const started = Parent.compose({
      init: (children) => {
        const left = children.Left.init
        return { state: { ...app.init.state, left: left.state }, commands: left.commands }
      },
      children: {
        Left: Parent.child(starting, { get: (s) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
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

  const Seeds = parent<{ state: Seeds }>()

  const seeds = Seeds.compose({
    init: () => ({ state: { maybeSeeded: Opt.none(), rows: [] } }),
    children: {
      Seeded: Seeds.child(seeded, {
        get: (state) => state.maybeSeeded,
        set: (state, seeded) => ({ ...state, maybeSeeded: Opt.some(seeded) }),
      }),
      Rows: Seeds.each(seeded, {
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
    expect(!isRejected(result) && result.state).toEqual({
      maybeSeeded: Opt.some({ count: 3, text: '', saving: true }),
      rows: [{ id: 7, counter: { count: 4, text: '', saving: true } }],
    })
    expect(!isRejected(result) && result.commands).toEqual([
      { _tag: 'Seeded', command: CounterCommand.Save({ count: 3 }) },
      { _tag: 'Rows', id: 7, command: CounterCommand.Save({ count: 4 }) },
    ])
  })

  // A parent with flags: it starts its counter from twice its own.
  const Relay = parent<{ state: Counter; flags: number }>()

  const relay = Relay.compose({
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
    const Top = parent<{ state: Relays }>()
    const top = Top.compose({
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
        Rows: Top.each(relay, {
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
    Relay.compose({
      // @ts-expect-error: its first step depends on its flags.
      init: () => ({ state: counter.init.state }),
      children: {},
      makeModel: () => null,
    })
    const { compose } = parent<{ state: Ticks }>()
    compose({
      // @ts-expect-error: it has no flags to start from.
      init: () => (ticks: number) => ({ state: { ticks } }),
      children: {},
      makeModel: () => null,
    })
  })

  test('a child without flags is started with none', () => {
    const { child, compose } = parent<{ state: Ticks }>()
    // Not called: its `init` would throw.
    const make = () =>
      compose({
        init: (children) => {
          // @ts-expect-error: its first step is a value.
          const started = children.Ticker.init(1)
          return { state: started.state }
        },
        children: { Ticker: child(ticker, { get: Opt.some, set: (_, ticks) => ticks }) },
        makeModel: () => null,
      })
    expect(make).toBeDefined()
  })

  test('a child with flags starts only from its flags', () => {
    const { child, compose } = parent<{ state: Opt.Option<Counter> }>()
    const program = compose({
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
    expect(program.init.state).toEqual(Opt.none())
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
    expect(parent<{ state: string }>()).toBeDefined()
    const { child } = parent<{ state: Ticks }>()
    // @ts-expect-error: a child's state is an object.
    expect(child(counting, { get: () => Opt.some(0), set: (state) => state })).toBeDefined()
    // @ts-expect-error: and so is the state of the program that runs.
    expect(run(counting, () => Effect.void)).toBeDefined()
    expect([typed, counting]).toHaveLength(2)
  })

  test('a child whose type names no external message takes none from its parent', () => {
    const { child, compose } = parent<{ state: Ticks }>()
    const program = compose({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Reset, children) => (state) => {
        // @ts-expect-error: `Tick` is the child's own business.
        return children.Plain.update({ _tag: 'Tick' })(state)
      },
      makeModel: () => null,
    })
    expect(isRejected(program.update({ _tag: 'Reset' })(noTicks))).toBe(false)
  })

  test('an own message cannot take the name of a child, which would receive it', () => {
    const { child, compose } = parent<{ state: Ticks }>()
    // @ts-expect-error: `Plain` is a child's name.
    compose({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Readonly<{ _tag: 'Plain' }>) => (state) => ({ state }),
      makeModel: () => null,
    })
  })

  test('an own command cannot take the name of a child, whose interpreter would receive it', () => {
    const { child, compose } = parent<{ state: Ticks; command: Readonly<{ _tag: 'Plain' }> }>()
    // @ts-expect-error: `Plain` is a child's name.
    compose({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      runCommand: () => Effect.succeedNone,
      makeModel: () => null,
    })
  })

  test('a child that starts with no command still has those its update returns', () => {
    const saving = {
      init: { state: noTicks },
      update: (_: Tick) => (state: Ticks) =>
        state.ticks > 0 ? { state, commands: ['Save' as const] } : { state: { ticks: 1 } },
      runCommand: () => Effect.succeedNone,
      makeModel: ({ ticks }: Ticks) => ticks,
    }
    const { child, compose } = parent<{ state: Ticks }>()
    const program = compose({
      init: () => ({ state: noTicks }),
      children: { Saving: child(saving, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
    const command: CommandOf<typeof program> = { _tag: 'Saving', command: 'Save' }
    // @ts-expect-error: the child returns no other command.
    const other: CommandOf<typeof saving> = 'Load'
    expect([command, other]).toHaveLength(2)
  })

  test('commands of its own need a runCommand', () => {
    const { child, compose } = parent<{ state: Ticks; command: Readonly<{ _tag: 'Beep' }> }>()
    // @ts-expect-error: `Beep` would go uninterpreted.
    compose({
      init: () => ({ state: noTicks }),
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
  })
})
