import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Channel from 'effect/Channel'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as References from 'effect/References'
import * as Stream from 'effect/Stream'
import { RejectedInput } from './rejection.ts'
import type { Subscription } from './subscription.ts'
import { isRejected, reject } from './update.ts'
import { type Dispatch, dispatchUnsafe, type Offered } from './offer.ts'
import { parent } from './compose.ts'
import { modelOf, type Program } from './program.ts'
import { type Frame, run } from './run.ts'
import { messageOf } from './testing/message-of.ts'

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
  increment: Offered<CounterMessage>
  decrement: Opt.Option<Offered<CounterMessage>>
  type: (text: string) => Offered<CounterMessage>
  save: Opt.Option<Offered<CounterMessage>>
}>

// A parent may decrement it, as a back button would: its other messages are its own.
type External = Extract<CounterMessage, { readonly _tag: 'Decrement' }>

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
    }
  },
  runCommand: () => Effect.succeed(Opt.some(CounterMessage.Saved())),
  makeModel: (state, { offer, offerInput }) => ({
    count: state.count,
    increment: offer(CounterMessage.Increment()),
    decrement: state.count > 0 ? Opt.some(offer(CounterMessage.Decrement())) : Opt.none(),
    type: offerInput((text) => CounterMessage.Typed({ text }), state.text),
    save: state.saving ? Opt.none() : Opt.some(offer(CounterMessage.SaveClicked())),
  }),
}

// A ticker that only listens.
type Tick = Readonly<{ _tag: 'Tick' }>
const ticks: Subscription<Tick, never> = Channel.fromEffect(Effect.succeed<Tick>({ _tag: 'Tick' })).pipe(
  Channel.concatWith(() => Channel.never),
)

const ticker: Program<{ state: number; model: number; message: Tick }> = {
  init: { state: 0 },
  update: () => (ticks) => ({ state: ticks + 1 }),
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (ticks) => ticks,
}

type ParentState = Readonly<{ left: Counter; maybeRight: Opt.Option<Counter>; saves: number; ticks: number }>
type Reset = Readonly<{ _tag: 'Reset' }>

const Parent = parent<{ state: ParentState }>()

const app = Parent.compose({
  init: { state: { left: counter.init.state, maybeRight: Opt.none(), saves: 0, ticks: 0 } },
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
    // A parent applies a message of its own to a child through its handle.
    const step = children.Left.update(CounterMessage.Decrement())(state)
    return isRejected(step) ? { state } : step
  },
  onEvent: {
    Left: () => (state) => ({ state: { ...state, saves: state.saves + 1 } }),
    Right: () => (state) => ({ state: { ...state, saves: state.saves + 1 } }),
  },
  makeModel: (state, { offer, children }) => ({
    left: children.Left(state),
    maybeRight: Opt.map(state.maybeRight, () => children.Right(state)),
    reset: offer({ _tag: 'Reset' }),
  }),
})

type Model = ReturnType<typeof app.makeModel>

/**
 * Runs `program` with a renderer that hands each frame to `act`, until `act` says it is done; returns what the
 * renderer saw. Logs nothing: some tests make the run die on purpose.
 */
const script = <M>(
  program: Program<{ state: ParentState; model: M; message: unknown; command: unknown }>,
  act: (frame: Frame<M>, index: number) => Effect.Effect<boolean>,
  state: ParentState = program.init.state,
) => {
  const seen: Array<Frame<M>> = []
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
    { onRejectedInput: 'die' },
  ).pipe(
    Effect.timeout('2 seconds'),
    Effect.as(seen),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromiseExit,
  )
}

const asProgram = app as unknown as Program<{ state: ParentState; model: Model; message: unknown; command: unknown }>

const send = (dispatch: Dispatch, offered: Offered<unknown>) => dispatch(offered)

describe('next: offers as tokens', () => {
  test('one dispatch for every frame, and a child sends through it as it is', async () => {
    const exit = await script(
      asProgram,
      (frame, index) =>
        index < 3 ? send(frame.dispatch, frame.model.left.increment).pipe(Effect.as(false)) : Effect.succeed(true),
    )
    const seen = Exit.isSuccess(exit) ? exit.value : []
    expect(seen.map((frame) => frame.model.left.count)).toEqual([0, 1, 2, 3])
    expect(new Set(seen.map((frame) => frame.dispatch)).size).toBe(1)
  })

  test('a token holds the message its whole program receives', () => {
    const model = modelOf(asProgram)(app.init.state)
    expect(messageOf(model.left.increment)).toEqual({ _tag: 'Left', message: CounterMessage.Increment() })
  })

  test('a double tap acts once: the second message is stale', async () => {
    const at = { ...app.init.state, left: { ...counter.init.state, count: 1 } }
    const exit = await script(asProgram, (frame, index) => {
      if (index > 0) return Effect.succeed(true)
      const decrement = Opt.getOrThrow(frame.model.left.decrement)
      return send(frame.dispatch, decrement).pipe(Effect.andThen(send(frame.dispatch, decrement)), Effect.as(false))
    }, at)
    expect(Exit.isSuccess(exit) && exit.value.map((frame) => frame.model.left.count)).toEqual([1, 0])
  })

  test('a typed value that update rejects is a bug, reported as onRejectedInput says', async () => {
    const exit = await script(
      asProgram,
      (frame) => send(frame.dispatch, frame.model.left.type('not a number')).pipe(Effect.as(false)),
    )
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedInput).toBe(true)
  })

  test('a token of another run kills the run', async () => {
    const foreign = modelOf(asProgram)(app.init.state).left.increment
    const exit = await script(asProgram, (frame) => send(frame.dispatch, foreign).pipe(Effect.as(false)))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain('another run')
  })

  // In development a view is bundled with a copy of the library of its own: tokens are read by fields only.
  test('a token goes through a second copy of the library', async () => {
    // A query makes Bun load the module again, as a second bundle would.
    const second = './offer.ts?copy'
    const copy = await import(second) as typeof import('./offer.ts')
    expect(copy.dispatchUnsafe).not.toBe(dispatchUnsafe)
    const exit = await script(asProgram, (frame, index) =>
      index === 0
        ? Effect.sync(() => copy.dispatchUnsafe(frame.dispatch)(frame.model.left.increment)).pipe(Effect.as(false))
        : Effect.succeed(true))
    expect(Exit.isSuccess(exit) && exit.value.map((frame) => frame.model.left.count)).toEqual([0, 1])
  })
})

describe('next: compose', () => {
  test('a child\'s commands run, and their messages reach it, and its events its parent', async () => {
    const exit = await script(asProgram, (frame, index) =>
      index === 0
        ? send(frame.dispatch, Opt.getOrThrow(frame.model.left.save)).pipe(Effect.as(false))
        : Effect.succeed(frame.model.left.count === 0 && Opt.isSome(frame.model.left.save)))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  test('the parent\'s own messages, and what it sends a child through its handle', () => {
    const at = { ...app.init.state, left: { ...counter.init.state, count: 2 } }
    const result = app.update({ _tag: 'Reset' })(at)
    expect(!isRejected(result) && result.state.left.count).toBe(1)
  })

  test('a message for a child that is not there is rejected', () => {
    expect(isRejected(app.update({ _tag: 'Right', message: CounterMessage.Increment() })(app.init.state)))
      .toBe(true)
  })

  test('the model of a child that is not there is a defect', () => {
    expect(() =>
      app.makeModel(app.init.state, {
        offer: () => {
          throw new Error('unused')
        },
        offerInput: () => () => {
          throw new Error('unused')
        },
      })
    ).toThrow()
  })

  test('a child listens under its name, and only when subscribed', () => {
    const subscriptions = app.subscriptions ?? (() => HashMap.empty())
    expect(HashMap.size(subscriptions(app.init.state))).toBe(0)
    const keys = Array.from(
      HashMap.keys(subscriptions({ ...app.init.state, maybeRight: Opt.some(counter.init.state) })),
    )
    expect(keys).toEqual([['Ticker', 'ticks']])
  })

  test('a child\'s model is kept while its state is the same object, in each run apart', () => {
    const model = modelOf(asProgram)
    const state = { ...app.init.state, maybeRight: Opt.some(counter.init.state) }
    const first = model(state)
    expect(model({ ...state, saves: 1 }).left).toBe(first.left)
    expect(model({ ...state, left: { ...state.left, count: 1 } }).left).not.toBe(first.left)
  })

  test('one program as two children, in the very same state object, sends for its own place', () => {
    const model = modelOf(asProgram)({ ...app.init.state, maybeRight: Opt.some(counter.init.state) })
    const right = Opt.getOrThrow(model.maybeRight)
    expect(right).not.toBe(model.left)
    expect([messageOf(model.left.increment), messageOf(right.increment)]).toEqual([
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
  init: { state: { rows: [] } },
  children: {
    Rows: List.each(counter, {
      get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
      set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
      subscribed: (state) => state.rows.map(({ id, counter }) => [id, counter] as const),
    }),
    Ticker: List.child(ticker, {
      get: () => Opt.some(0),
      set: (state) => state,
      subscribed: () => Opt.none(),
    }),
  },
  onEvent: {
    Rows: (id) => (state) => ({ state: { rows: state.rows.filter((row) => row.id !== id) } }),
  },
  makeModel: (state, { children }) => state.rows.map(({ id }) => ({ id, model: children.Rows(state, id) })),
})

// New rows often share one initial state object: here, all of them.
const rows = (...ids: ReadonlyArray<number>): ListState => ({
  rows: ids.map((id) => ({ id, counter: counter.init.state })),
})

// Lists of counters, by id: parents whose children by id are parents with children by id.
type Lists = Readonly<{ rows: ReadonlyArray<Readonly<{ id: string; list: ListState }>> }>

const Nested = parent<{ state: Lists }>()

const lists = Nested.compose({
  init: { state: { rows: [] } },
  children: {
    Lists: Nested.each(list, {
      get: (state, id: string) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.list),
      set: (state, id, list) => ({ rows: state.rows.map((row) => row.id === id ? { id, list } : row) }),
      subscribed: (state) => state.rows.map(({ id, list }) => [id, list] as const),
    }),
  },
  makeModel: (state, { children }) => state.rows.map(({ id }) => children.Lists(state, id)),
})

describe('next: children by id', () => {
  test('a message reaches the child with its id, and only that one', () => {
    const result = list.update({ _tag: 'Rows', id: 2, message: CounterMessage.Increment() })(rows(1, 2))
    expect(!isRejected(result) && result.state.rows.map((row) => row.counter.count)).toEqual([0, 1])
  })

  // The case `embedEach` gets away with: its offers are plain messages, wrapped with the id by the view.
  test('children that share one state object get models of their own, whose offers carry their id', () => {
    const [first, second] = modelOf(list)(rows(1, 2))
    expect(first?.model).not.toBe(second?.model)
    expect(second && messageOf(second.model.increment)).toEqual({
      _tag: 'Rows',
      id: 2,
      message: CounterMessage.Increment(),
    })
  })

  test('a child\'s model is kept while its state and id are the same', () => {
    const state = rows(1, 2)
    const model = modelOf(list)
    expect(model({ rows: [...state.rows] })[1]?.model).toBe(model(state)[1]?.model)
  })

  test('a child\'s model is let go once the last two frames have not shown it', async () => {
    const model = modelOf(list)
    const first = model(rows(1))[0]?.model
    const released = new WeakRef(first ?? {})
    model(rows(2))
    model(rows(3))
    expect(model(rows(1))[0]?.model).not.toBe(first)
    // A WeakRef keeps its target until the current job ends.
    await Promise.resolve()
    Bun.gc(true)
    expect(released.deref()).toBeUndefined()
  })

  test('the models of ids shown once each, under one shared state, do not pile up', () => {
    const model = modelOf(list)
    Bun.gc(true)
    const before = process.memoryUsage().heapUsed
    for (let id = 0; id < 50_000; id++) model(rows(id))
    Bun.gc(true)
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(5_000_000)
  })

  // Lists A and B, each with counter 1 in the counter's initial state. Each of the first `frames` frames
  // increments A's counter, or B's on frame `bumpingB`; returns the frames.
  const nested = (frames: number, bumpingB?: number) => {
    const seen: Array<Frame<ReturnType<typeof lists.makeModel>>> = []
    return run(
      { ...lists, init: { state: { rows: [{ id: 'A', list: rows(1) }, { id: 'B', list: rows(1) }] } } },
      (stream) =>
        stream.pipe(
          Stream.tap((frame) => {
            seen.push(frame)
            const index = seen.length - 1
            const [a, b] = frame.model
            const counter = (index === bumpingB ? b : a)?.[0]?.model
            return index < frames && counter !== undefined ? frame.dispatch(counter.increment) : Effect.void
          }),
          Stream.take(frames + 1),
          Stream.runDrain,
        ),
      { onRejectedInput: 'die' },
    ).pipe(Effect.as(seen))
  }

  test('in a run, a nested child that did not change keeps its model from frame to frame', async () => {
    const [first, second, third] = (await Effect.runPromise(nested(2))).map((frame) => frame.model)
    expect(second?.[1]?.[0]?.model).toBe(first?.[1]?.[0]?.model)
    expect(third?.[1]?.[0]?.model).toBe(first?.[1]?.[0]?.model)
    expect(second?.[0]?.[0]?.model).not.toBe(first?.[0]?.[0]?.model)
    expect(third?.[0]?.[0]?.model.count).toBe(2)
  })

  test('an offer of a model kept from an older frame is applied', async () => {
    const seen = await Effect.runPromise(nested(2, 1))
    expect(seen[1]?.model[1]?.[0]?.model).toBe(seen[0]?.model[1]?.[0]?.model)
    expect(seen.map((frame) => frame.model[1]?.[0]?.model.count)).toEqual([0, 0, 1])
  })

  test('two runs of one program at once keep their models apart', async () => {
    const runs = await Effect.runPromise(Effect.all([nested(3), nested(3)], { concurrency: 'unbounded' }))
    expect(runs.map((seen) => seen.map((frame) => frame.model[0]?.[0]?.model.count))).toEqual([
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ])
  })

  test('the children of two children that share their state and ids send for their own parent', () => {
    // Both lists hold one counter with id 1, in the counter's initial state: only their places differ.
    const [a, b] = modelOf(lists)({ rows: [{ id: 'A', list: rows(1) }, { id: 'B', list: rows(1) }] })
    const sent = (models: typeof a) => models?.[0] && messageOf(models[0].model.increment)
    expect([sent(a), sent(b)]).toEqual(['A', 'B'].map((id) => ({
      _tag: 'Lists',
      id,
      message: { _tag: 'Rows', id: 1, message: CounterMessage.Increment() },
    })))
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
      init: { state: { ids: [7, 8] } },
      children: {
        Tickers: Tickers.each(ticker, {
          get: (state, id: number) => state.ids.includes(id) ? Opt.some(0) : Opt.none(),
          set: (state) => state,
          subscribed: (state) => state.ids.map((id) => [id, 0] as const),
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

describe('next: what a parent can do with a child', () => {
  test('a handle\'s update takes only the messages the child\'s type says a parent may send', () => {
    const sendTo = Parent.compose({
      init: { state: app.init.state },
      children: {
        Left: Parent.child(counter, { get: (s) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
      },
      update: (_: Reset, children) => (state) => {
        // @ts-expect-error: `Increment` is the counter's own business.
        const forged = children.Left.update(CounterMessage.Increment())(state)
        return isRejected(forged) ? { state } : forged
      },
      onEvent: { Left: () => (state) => ({ state }) },
      makeModel: () => null,
    })
    expect(isRejected(sendTo.update({ _tag: 'Reset' })(app.init.state))).toBe(false)
  })

  test('init gives a new child its state and its commands, lifted with its id', () => {
    const starting: typeof counter = {
      ...counter,
      init: { ...counter.init, commands: [CounterCommand.Save({ count: 0 })] },
    }
    const started = List.compose({
      init: { state: { rows: [] } },
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
})

// Each `@ts-expect-error` is the test: if the types accepted the mistake, the typecheck would fail.
describe('next: what the types reject', () => {
  // A program written as a plain object, without `Program<…>`: no external messages, so nothing a parent may send.
  const plain = {
    init: { state: 0 },
    update: (message: Tick) => (ticks: number) => message._tag === 'Tick' ? { state: ticks + 1 } : reject,
    makeModel: (ticks: number) => ticks,
  }

  test('a child whose type names no external message takes none from its parent', () => {
    const { child, compose } = parent<{ state: number }>()
    const program = compose({
      init: { state: 0 },
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Reset, children) => (state) => {
        // @ts-expect-error: `Tick` is the child's own business.
        const forged = children.Plain.update({ _tag: 'Tick' })(state)
        return isRejected(forged) ? { state } : forged
      },
      makeModel: () => null,
    })
    expect(isRejected(program.update({ _tag: 'Reset' })(0))).toBe(false)
  })

  test('an own message cannot take the name of a child, which would receive it', () => {
    const { child, compose } = parent<{ state: number }>()
    // @ts-expect-error: `Plain` is a child's name.
    compose({
      init: { state: 0 },
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      update: (_: Readonly<{ _tag: 'Plain' }>) => (state) => ({ state }),
      makeModel: () => null,
    })
  })

  test('commands of its own need a runCommand', () => {
    const { child, compose } = parent<{ state: number; command: Readonly<{ _tag: 'Beep' }> }>()
    // @ts-expect-error: `Beep` would go uninterpreted.
    compose({
      init: { state: 0 },
      children: { Plain: child(plain, { get: (state) => Opt.some(state), set: (_, child) => child }) },
      makeModel: () => null,
    })
  })
})
