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
import { RejectedMessage } from '../rejection.ts'
import type { Subscription } from '../subscription.ts'
import { isRejected, reject } from '../update.ts'
import { type Dispatch, dispatchUnsafe, type Offered } from './offer.ts'
import { child, compose, each, modelOf, type Program } from './program.ts'
import { type Frame, run } from './run.ts'
import { messageOf } from './testing.ts'

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

const counter: Program<Counter, CounterModel, CounterMessage, CounterCommand, never, CounterEvent> = {
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

const ticker: Program<number, number, Tick> = {
  init: { state: 0 },
  update: () => (ticks) => ({ state: ticks + 1 }),
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (ticks) => ticks,
}

type ParentState = Readonly<{ left: Counter; maybeRight: Opt.Option<Counter>; saves: number; ticks: number }>
type Reset = Readonly<{ _tag: 'Reset' }>

const parent = compose({
  init: { state: { left: counter.init.state, maybeRight: Opt.none(), saves: 0, ticks: 0 } as ParentState },
  children: {
    Left: child(counter, { get: (s: ParentState) => Opt.some(s.left), set: (s, left) => ({ ...s, left }) }),
    Right: child(counter, {
      get: (s: ParentState) => s.maybeRight,
      set: (s, right) => ({ ...s, maybeRight: Opt.some(right) }),
    }),
    // Listens only while the right counter is there.
    Ticker: child(ticker, {
      get: (s: ParentState) => Opt.some(s.ticks),
      set: (s, ticks) => ({ ...s, ticks }),
      subscribed: (s) => Opt.map(s.maybeRight, () => s.ticks),
    }),
  },
  update: (_: Reset, children) => (state) => {
    // A parent sends its own message to a child through its handle.
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

type Model = ReturnType<typeof parent.makeModel>

/**
 * Runs `program` with a renderer that hands each frame to `act`, until `act` says it is done; returns what the
 * renderer saw. Logs nothing: some tests make the run die on purpose.
 */
const script = <M>(
  program: Program<ParentState, M, unknown, unknown, never>,
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
    { onRejected: 'die' },
  ).pipe(
    Effect.timeout('2 seconds'),
    Effect.as(seen),
    Effect.provideService(References.MinimumLogLevel, 'None'),
    Effect.runPromiseExit,
  )
}

const asProgram = parent as unknown as Program<ParentState, Model, unknown, unknown, never>

const send = (dispatch: Dispatch, offered: Offered<unknown>) => dispatch(offered)

describe('next: offers as tokens', () => {
  test('one dispatch for every frame, and a child sends through it as it is', async () => {
    const exit = await script(asProgram, (frame, index) =>
      index < 3 ? send(frame.dispatch, frame.model.left.increment).pipe(Effect.as(false)) : Effect.succeed(true))
    const seen = Exit.isSuccess(exit) ? exit.value : []
    expect(seen.map((frame) => frame.model.left.count)).toEqual([0, 1, 2, 3])
    expect(new Set(seen.map((frame) => frame.dispatch)).size).toBe(1)
  })

  test('a token holds the message its whole program receives', () => {
    const model = modelOf(asProgram)(parent.init.state)
    expect(messageOf(model.left.increment)).toEqual({ _tag: 'Left', message: CounterMessage.Increment() })
  })

  test('a double tap acts once: the second message is stale', async () => {
    const at = { ...parent.init.state, left: { ...counter.init.state, count: 1 } }
    const exit = await script(asProgram, (frame, index) => {
      if (index > 0) return Effect.succeed(true)
      const decrement = Opt.getOrThrow(frame.model.left.decrement)
      return send(frame.dispatch, decrement).pipe(Effect.andThen(send(frame.dispatch, decrement)), Effect.as(false))
    }, at)
    expect(Exit.isSuccess(exit) && exit.value.map((frame) => frame.model.left.count)).toEqual([1, 0])
  })

  test('a typed value that update rejects is a bug, reported as onRejected says', async () => {
    const exit = await script(asProgram, (frame) =>
      send(frame.dispatch, frame.model.left.type('not a number')).pipe(Effect.as(false)))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof RejectedMessage).toBe(true)
  })

  test('a token of another run kills the run', async () => {
    const foreign = modelOf(asProgram)(parent.init.state).left.increment
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
    const at = { ...parent.init.state, left: { ...counter.init.state, count: 2 } }
    const result = parent.update({ _tag: 'Reset' })(at)
    expect(!isRejected(result) && result.state.left.count).toBe(1)
  })

  test('a message for a child that is not there is rejected', () => {
    expect(isRejected(parent.update({ _tag: 'Right', message: CounterMessage.Increment() })(parent.init.state)))
      .toBe(true)
  })

  test('the model of a child that is not there is a defect', () => {
    expect(() =>
      parent.makeModel(parent.init.state, {
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
    const subscriptions = parent.subscriptions ?? (() => HashMap.empty())
    expect(HashMap.size(subscriptions(parent.init.state))).toBe(0)
    const keys = Array.from(
      HashMap.keys(subscriptions({ ...parent.init.state, maybeRight: Opt.some(counter.init.state) })),
    )
    expect(keys).toEqual([['Ticker', 'ticks']])
  })

  test('a child\'s model is kept while its state is the same object, in each run apart', () => {
    const model = modelOf(asProgram)
    const state = { ...parent.init.state, maybeRight: Opt.some(counter.init.state) }
    const first = model(state)
    expect(model({ ...state, saves: 1 }).left).toBe(first.left)
    expect(model({ ...state, left: { ...state.left, count: 1 } }).left).not.toBe(first.left)
  })
})

// A list of counters, by id; one row is removed when it reports a save.
type Row = Readonly<{ id: number; counter: Counter }>
type ListState = Readonly<{ rows: ReadonlyArray<Row> }>

const list = compose({
  init: { state: { rows: [] } as ListState },
  children: {
    Rows: each(counter, {
      get: (state: ListState, id: number) =>
        Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
      set: (state, id, counter) => ({ rows: state.rows.map((row) => row.id === id ? { id, counter } : row) }),
      subscribed: (state) => state.rows.map(({ id, counter }) => [id, counter] as const),
    }),
    Ticker: child(ticker, {
      get: (_: ListState) => Opt.some(0),
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
const rows = (...ids: ReadonlyArray<number>): ListState => ({ rows: ids.map((id) => ({ id, counter: counter.init.state })) })

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
    const tickerList = compose({
      init: { state: { ids: [7, 8] } as Readonly<{ ids: ReadonlyArray<number> }> },
      children: {
        Tickers: each(ticker, {
          get: (state: Readonly<{ ids: ReadonlyArray<number> }>, id: number) =>
            state.ids.includes(id) ? Opt.some(0) : Opt.none(),
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
