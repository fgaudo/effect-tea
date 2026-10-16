import { describe, expect, test } from 'bun:test'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import type { Subscription } from './subscription.ts'
import { isRejected } from './update.ts'
import { embed, embedEach, type Program } from './program.ts'

// A child counter with one subscription, embedded in a parent that holds it and says whether it is shown.
type Parent = Readonly<{ child: Opt.Option<number>; isShown: boolean }>

type Increment = 'Increment'

const ticks: Subscription<Increment, never> = Channel.concatWith(
  Channel.succeed<Increment>('Increment'),
  () => Channel.never,
)

const child: Pick<Program<number, unknown, Increment, never>, 'update' | 'subscriptions'> = {
  update: () => (count) => ({ state: count + 1 }),
  subscriptions: () => HashMap.make(['ticks', ticks]),
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

const counterWithEvent: Pick<Program<number, unknown, Increment, never, 'ReachedTwo'>, 'update' | 'subscriptions'> = {
  update: () => (count) => (count + 1 === 2 ? { state: 2, events: ['ReachedTwo'] } : { state: count + 1 }),
  subscriptions: () => HashMap.make(['ticks', ticks]),
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

  const finite: Pick<Program<number, unknown, Signal, never>, 'update' | 'subscriptions'> = {
    update: () => (count) => ({ state: count }),
    subscriptions: () => HashMap.make(['feed', Channel.mapDone(Channel.succeed<Signal>('Tick'), (): Signal => 'Done')]),
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
