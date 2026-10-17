import { describe, expect, test } from 'bun:test'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import { absurd } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Offer } from './offer.ts'
import type { Subscription } from './subscription.ts'
import { isRejected, reject } from './update.ts'
import { embed, embedEach, type Program } from './program.ts'

// A child counter that stops at 3, with one subscription, embedded in a parent that holds it and says whether
// it is shown. Its model is whether it offers to increment.
type Parent = Readonly<{ child: Opt.Option<number>; isShown: boolean }>

type Increment = 'Increment'

const ticks: Subscription<Increment, never> = Channel.concatWith(
  Channel.succeed<Increment>('Increment'),
  () => Channel.never,
)

const child: Omit<Program<number, Offer<Increment>, Increment, never, never>, 'init'> = {
  update: () => (count) => count === 3 ? reject : { state: count + 1 },
  runCommand: absurd,
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: (_count, { offer }) => offer('Increment'),
}

const embedded = embed(child, {
  key: 'Child',
  wrap: (message: Increment) => message,
  get: (parent: Parent) => parent.child,
  getSubscribed: (parent: Parent) => (parent.isShown ? parent.child : Opt.none()),
  set: (parent: Parent, count: number) => ({ ...parent, child: Opt.some(count) }),
})

describe('embed', () => {
  test('getSubscribed decides whether the child listens', () => {
    expect(HashMap.size(embedded.subscriptions({ child: Opt.some(0), isShown: true }))).toBe(1)
    expect(HashMap.size(embedded.subscriptions({ child: Opt.some(0), isShown: false }))).toBe(0)
  })

  test('a child that does not listen still receives its messages', () => {
    const result = embedded.update('Increment')({ child: Opt.some(0), isShown: false })
    expect(isRejected(result) ? Opt.none() : result.state.child).toEqual(Opt.some(1))
  })

  test('a child that is not there rejects its messages', () => {
    expect(isRejected(embedded.update('Increment')({ child: Opt.none(), isShown: true }))).toBe(
      true,
    )
  })

  test('makeModel offers what the child\'s own update accepts in the child\'s state', () => {
    expect(Opt.isSome(embedded.makeModel(0))).toBe(true)
    expect(Opt.isNone(embedded.makeModel(3))).toBe(true)
  })

  test('without getSubscribed, the child listens whenever it is there', () => {
    const always = embed(child, {
      key: 'Child',
      wrap: (message: Increment) => message,
      get: (parent: Parent) => parent.child,
      set: (parent: Parent, count: number) => ({ ...parent, child: Opt.some(count) }),
    })
    expect(HashMap.size(always.subscriptions({ child: Opt.some(0), isShown: false }))).toBe(1)
  })
})

// Counters kept by id, each with one subscription, and an event when one reaches 2.
type Counters = Readonly<{ counts: ReadonlyMap<string, number>; reachedTwo: ReadonlyArray<string> }>

const counterWithEvent: Pick<
  Program<number, unknown, Increment, never, never, 'ReachedTwo'>,
  'update' | 'runCommand' | 'subscriptions' | 'makeModel'
> = {
  update: () => (count) => (count + 1 === 2 ? { state: 2, events: ['ReachedTwo'] } : { state: count + 1 }),
  runCommand: absurd,
  subscriptions: () => HashMap.make(['ticks', ticks]),
  makeModel: () => undefined,
}

const each = embedEach(counterWithEvent, {
  key: 'Counter',
  wrap: (id: string, message: Increment) => ({ id, message }),
  get: (state: Counters, id) => Opt.fromUndefinedOr(state.counts.get(id)),
  set: (state: Counters, id, count) => ({ ...state, counts: new Map([...state.counts, [id, count]]) }),
  subscribed: (state: Counters) => state.counts.entries(),
  onEvent: (id) => (state) => ({ state: { ...state, reachedTwo: [...state.reachedTwo, id] } }),
})

const twoCounters: Counters = { counts: new Map([['a', 0], ['b', 1]]), reachedTwo: [] }

describe('embedEach', () => {
  test('a message reaches the child with its id, and only that one', () => {
    const result = each.update('a', 'Increment')(twoCounters)
    expect(isRejected(result) ? undefined : [...result.state.counts]).toEqual([['a', 1], ['b', 1]])
  })

  test('the events of a child are handled with its id', () => {
    const result = each.update('b', 'Increment')(twoCounters)
    expect(isRejected(result) ? undefined : result.state.reachedTwo).toEqual(['b'])
  })

  test('a message for an id that is not there is rejected', () => {
    expect(isRejected(each.update('c', 'Increment')(twoCounters))).toBe(true)
  })

  test('each subscribed child has its own subscriptions, keyed by its id', () => {
    const keys = Array.from(HashMap.keys(each.subscriptions(twoCounters)))
    expect(keys).toContainEqual(['Counter', 'a', 'ticks'])
    expect(keys).toContainEqual(['Counter', 'b', 'ticks'])
    expect(keys.length).toBe(2)
  })
})

describe('embedded subscriptions that end', () => {
  type Signal = 'Tick' | 'Done'

  const finite: Omit<Program<number, unknown, Signal, never, never>, 'init'> = {
    update: () => (count) => ({ state: count }),
    runCommand: absurd,
    subscriptions: () => HashMap.make(['feed', Channel.mapDone(Channel.succeed<Signal>('Tick'), (): Signal => 'Done')]),
    makeModel: () => undefined,
  }

  test('their last message is wrapped like the others', async () => {
    const parent = embed(finite, {
      key: 'Child',
      wrap: (signal: Signal) => `child:${signal}`,
      get: (state: number) => Opt.some(state),
      set: (_state: number, child: number) => child,
    })
    const sent: Array<string> = []
    const [subscription] = HashMap.values(parent.subscriptions(0))
    const last = await Effect.runPromise(
      Channel.runForEach(
        Opt.getOrThrow(Opt.fromNullishOr(subscription)),
        (message) => Effect.sync(() => sent.push(message)),
      ),
    )
    expect([...sent, last]).toEqual(['child:Tick', 'child:Done'])
  })
})

describe('commands', () => {
  // A child that saves on every message; its save answers `Saved`, its logging nothing.
  type Signal = 'Tick' | 'Saved'
  type Command = 'Save' | 'Log'

  const child: Omit<Program<number, unknown, Signal, Command, never>, 'init'> = {
    update: () => (count) => ({ state: count + 1, commands: ['Save'] }),
    runCommand: (command) => command === 'Save' ? Effect.succeedSome<Signal>('Saved') : Effect.succeedNone,
    subscriptions: () => HashMap.empty(),
    makeModel: () => undefined,
  }

  const single = embed(child, {
    key: 'Child',
    wrap: (signal: Signal) => `child:${signal}`,
    wrapCommand: (command: Command) => `child:${command}`,
    get: (state: number) => Opt.some(state),
    set: (_state: number, count: number) => count,
  })

  const each = embedEach(child, {
    key: 'Child',
    wrap: (id: string, signal: Signal) => `${id}:${signal}`,
    wrapCommand: (id: string, command: Command) => `${id}:${command}`,
    get: (state: number, _id: string) => Opt.some(state),
    set: (_state: number, _id: string, count: number) => count,
    subscribed: () => [],
  })

  test('the commands of a child\'s update reach the parent wrapped', () => {
    const result = single.update('Tick')(0)
    expect(isRejected(result) ? undefined : result.commands).toEqual(['child:Save'])
    const inCollection = each.update('a', 'Tick')(0)
    expect(isRejected(inCollection) ? undefined : inCollection.commands).toEqual(['a:Save'])
  })

  test('liftCommands wraps a child\'s commands, with its id in a collection', () => {
    expect(single.liftCommands(['Save', 'Log'])).toEqual(['child:Save', 'child:Log'])
    expect(single.liftCommands()).toEqual([])
    expect(each.liftCommands('a', ['Log'])).toEqual(['a:Log'])
  })

  test('runCommand runs the child\'s interpreter and wraps its messages, with its id in a collection', async () => {
    const run = (executions: ReadonlyArray<Effect.Effect<Opt.Option<string>>>) =>
      Effect.runPromise(Effect.all(executions))
    expect(await run([single.runCommand('Save'), single.runCommand('Log')])).toEqual([
      Opt.some('child:Saved'),
      Opt.none(),
    ])
    expect(await run([each.runCommand('a', 'Save')])).toEqual([Opt.some('a:Saved')])
  })
})

describe('child models', () => {
  // A card whose model counts how many times it was made.
  type Card = Readonly<{ title: string }>
  type Rename = Readonly<{ _tag: 'Rename'; title: string }>
  let made = 0
  type CardModel = Readonly<{ title: string; rename: Offer<Rename> }>
  const card: Omit<Program<Card, CardModel, Rename, never, never>, 'init'> = {
    update: ({ title }) => () => ({ state: { title } }),
    runCommand: absurd,
    subscriptions: () => HashMap.empty(),
    makeModel: (state, { offer }) => {
      made++
      return { title: state.title, rename: offer({ _tag: 'Rename', title: '' }) }
    },
  }

  test('embed makes a child\'s model once for each state object, and again for a new one', () => {
    const embeddedCard = embed(card, {
      key: 'Card',
      wrap: (message: Rename) => message,
      get: (parent: Card) => Opt.some(parent),
      set: (_, child: Card) => child,
    })
    made = 0
    const state: Card = { title: 'Milk' }
    const model = embeddedCard.makeModel(state)
    expect(embeddedCard.makeModel(state)).toBe(model)
    expect(made).toBe(1)
    expect(embeddedCard.makeModel({ title: 'Milk' })).not.toBe(model)
    expect(made).toBe(2)
  })

  test('embedEach keeps the model of each child whose state is the same', () => {
    const cards = embedEach(card, {
      key: 'Cards',
      wrap: (id: number, message: Rename) => ({ id, message }),
      get: (state: ReadonlyArray<Card>, id) => Opt.fromUndefinedOr(state[id]),
      set: (state: ReadonlyArray<Card>, id, child) => state.map((each, index) => (index === id ? child : each)),
      subscribed: () => [],
    })
    const before: ReadonlyArray<Card> = [{ title: 'Milk' }, { title: 'Eggs' }]
    const result = cards.update(1, { _tag: 'Rename', title: 'Ham' })(before)
    const after = isRejected(result) ? before : result.state
    made = 0
    const models = before.map(cards.makeModel)
    expect(after.map(cards.makeModel)[0]).toBe(models[0])
    expect(after.map(cards.makeModel)[1]).not.toBe(models[1])
    expect(made).toBe(3)
  })
})
