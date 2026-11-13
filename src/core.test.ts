import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import fc from 'fast-check'
import {
  type Active,
  arrive,
  ended,
  hasDied,
  init,
  noDeaths,
  noneActive,
  otherwiseDefect,
  reconcile,
  record,
  report,
  type Source,
  wrapDefects,
} from './core.ts'
import { ProgramDefect } from './defect.ts'
import { reject, type Update } from './update.ts'

class Request extends Context.Service<Request, string>()('Request') {}

const defects = (cause: Cause.Cause<unknown>) =>
  cause.reasons.map((reason) => Cause.isDieReason(reason) ? reason.defect : reason._tag)

const message = (defect: unknown) => defect instanceof Error ? defect.message : defect

describe('what a fiber dies of', () => {
  test('a self-interruption is a defect, holding the interruption', () => {
    const interruption = Cause.interrupt(1)
    const [defect] = defects(otherwiseDefect(interruption))
    expect(defect).toBeInstanceOf(Error)
    expect(message(defect)).toBe('It interrupted itself, which only the run may do')
    expect((defect as Error).cause).toEqual(interruption)
  })

  test('a failure, or an empty cause, is a defect the types rule out', () => {
    expect(defects(otherwiseDefect(Cause.fail('oops'))).map(message)).toEqual(['It failed, which its type rules out'])
    expect(defects(otherwiseDefect(Cause.empty)).map(message)).toEqual(['It failed, which its type rules out'])
  })

  test('beside defects, it takes the place of the first of what is not one, so that the order stays', () => {
    const cause = Cause.fromReasons<string>([
      ...Cause.die('first').reasons,
      ...Cause.interrupt(1).reasons,
      ...Cause.die('second').reasons,
      ...Cause.fail('oops').reasons,
    ])
    expect(defects(otherwiseDefect(cause)).map(message)).toEqual([
      'first',
      'It failed, which its type rules out',
      'second',
    ])
  })

  test('an interruption the fiber received is kept as it is, beside the defect its own interruption is', () => {
    const cause = Cause.fromReasons([...Cause.interrupt(1).reasons, ...Cause.interrupt(2).reasons])
    expect(defects(otherwiseDefect(cause, Cause.interrupt(2))).map(message)).toEqual([
      'It interrupted itself, which only the run may do',
      'Interrupt',
    ])
  })

  test('a cause of interruptions the fiber received, or of defects beside them, is no further defect', () => {
    const received = Cause.interrupt(2)
    expect(otherwiseDefect(received, received)).toBe(received)
    const dying = Cause.fromReasons([...Cause.die('boom').reasons, ...Cause.interrupt(2).reasons])
    expect(otherwiseDefect(dying, received)).toBe(dying)
  })

  test('each defect is wrapped where it happened, with its annotations, and the rest kept as it is', () => {
    const annotations = Context.make(Request, 'r-1')
    const cause = Cause.fromReasons<string>([
      ...Cause.annotate(Cause.die('boom'), annotations).reasons,
      ...Cause.fail('kept').reasons,
      ...Cause.die('again').reasons,
    ])
    const wrapped = wrapDefects(cause, 'command', { on: 'Save' }, () => false)
    expect(defects(wrapped)).toEqual([
      new ProgramDefect({ where: 'command', cause: 'boom', on: 'Save' }),
      'Fail',
      new ProgramDefect({ where: 'command', cause: 'again', on: 'Save' }),
    ])
    expect(wrapped.reasons[1]).toEqual(cause.reasons[1])
    // What `Effect.die` annotates a defect with (its stack and span) is not in the type of the annotations.
    const requests = wrapped.reasons.map((reason) =>
      Context.getOption(Cause.reasonAnnotations(reason) as Context.Context<Request>, Request)
    )
    expect(requests).toEqual([Opt.some('r-1'), Opt.none(), Opt.none()])
  })

  test('a defect already wrapped is left as it is', () => {
    const inner = new ProgramDefect({ where: 'subscription', cause: 'boom' })
    const wrapped = wrapDefects(Cause.die(inner), 'command', {}, (defect) => defect === inner)
    expect(defects(wrapped)).toEqual([inner])
  })
})

describe('the register of deaths', () => {
  test('keeps each defect once, by its identity, in the order the fibers died', () => {
    const a = new Error('a')
    const b = new Error('b')
    const once = record(noDeaths, Cause.fromReasons([...Cause.die(a).reasons, ...Cause.die(a).reasons]), () => true)
    const joined = record(once, Cause.fromReasons([...Cause.die(b).reasons, ...Cause.die(a).reasons]), () => true)
    expect(joined.deaths.map((death) => death.defect)).toEqual([a, b])
    expect(hasDied(joined, a)).toBe(true)
  })

  test('tells defects apart by identity, never by Equal', () => {
    const one = { _tag: 'Boom' }
    const other = { _tag: 'Boom' }
    const register = record(record(noDeaths, Cause.die(one), () => true), Cause.die(other), () => true)
    expect(register.deaths.map((death) => death.defect)).toEqual([one, other])
    expect(register.deaths.map((death) => death.defect)[1]).toBe(other)
    expect(hasDied(register, { _tag: 'Boom' })).toBe(false)
  })

  test('keeps only the defects it is asked to, and nothing of interruptions or failures', () => {
    const cause = Cause.fromReasons<string>([
      ...Cause.die('kept').reasons,
      ...Cause.die('left').reasons,
      ...Cause.interrupt(1).reasons,
      ...Cause.fail('oops').reasons,
    ])
    expect(record(noDeaths, cause, (defect) => defect === 'kept').deaths.map((death) => death.defect)).toEqual(['kept'])
  })

  test('is the same register when nothing new died, so that the shell signals only a new death', () => {
    const register = record(noDeaths, Cause.die('a'), () => true)
    expect(record(register, Cause.die('a'), () => true)).toBe(register)
    expect(record(register, Cause.interrupt(1), () => true)).toBe(register)
  })

  test('reports each defect once, those since the last report, in order', () => {
    const first = record(record(noDeaths, Cause.die('a'), () => true), Cause.die('b'), () => true)
    const [reported, after] = report(first)
    expect(Opt.map(reported, defects)).toEqual(Opt.some(['a', 'b']))
    expect(report(after)[0]).toEqual(Opt.none())
    const [later] = report(record(after, Cause.die('c'), () => true))
    expect(Opt.map(later, defects)).toEqual(Opt.some(['c']))
  })
})

const listing = <K>(...keys: ReadonlyArray<K>) =>
  HashMap.fromIterable(keys.map((key) => [key, `of ${String(key)}`] as const))

const startsOf = <K>(active: Active<K>): Readonly<Record<string, number>> =>
  Object.fromEntries(Array.from(active.keys, ([key, start]) => [String(key), start]))

describe('the keys of a new state, against those before', () => {
  test('a new key starts, with a start of its own, in the order the listing gives them', () => {
    const listed = listing('a', 'b')
    const [first, second] = Array.from(HashMap.keys(listed)) as [string, string]
    const { gone, fresh, active } = reconcile(noneActive, listed)
    expect(gone).toEqual([])
    expect(fresh).toEqual([[first, `of ${first}`, 1], [second, `of ${second}`, 2]])
    expect(startsOf(active)).toEqual({ [String(first)]: 1, [String(second)]: 2 })
    expect(active.starts).toEqual(new Set([1, 2]))
  })

  test('a kept key keeps its start, and a gone key stops with its start', () => {
    const first = reconcile(noneActive, listing('a', 'b')).active
    const { gone, fresh, active } = reconcile(first, listing('a', 'c'))
    expect(gone).toEqual([['b', 2]])
    expect(fresh).toEqual([['c', 'of c', 3]])
    expect(startsOf(active)).toEqual({ a: 1, c: 3 })
    expect(active.starts).toEqual(new Set([1, 3]))
  })

  test('a key that comes back gets a new start', () => {
    const first = reconcile(noneActive, listing('a')).active
    const without = reconcile(first, listing()).active
    const { fresh, active } = reconcile(without, listing('a'))
    expect(fresh).toEqual([['a', 'of a', 2]])
    expect(active.starts).toEqual(new Set([2]))
  })

  test('a key equal by value, made anew, keeps its start', () => {
    const first = reconcile(noneActive, listing(['row', 1])).active
    const { gone, fresh, active } = reconcile(first, listing(['row', 1]))
    expect(gone).toEqual([])
    expect(fresh).toEqual([])
    expect(active.starts).toEqual(new Set([1]))
  })

  test('under any history of listings, starts follow the keys', () => {
    const keys = fc.uniqueArray(fc.constantFrom<string>('a', 'b', 'c', 'd', 'e'), { maxLength: 5 })
    fc.assert(fc.property(fc.array(keys, { maxLength: 20 }), (history) => {
      let active: Active<string> = noneActive
      const used = new Set<number>()
      for (const listed of history) {
        const before = active
        const map = listing(...listed)
        const { gone, fresh, active: after } = reconcile(before, map)
        const previous = startsOf(before)
        const now = startsOf(after)
        expect(Object.keys(now).sort()).toEqual([...listed].sort())
        expect(gone).toEqual(Object.entries(previous).filter(([key]) => !listed.includes(key)))
        for (const key of listed) {
          if (key in previous) expect(now[key]).toBe(previous[key])
        }
        expect(fresh.map(([key]) => key)).toEqual(Array.from(HashMap.keys(map)).filter((key) => !(key in previous)))
        for (const [key, , start] of fresh) {
          expect(used.has(start)).toBe(false)
          expect(now[key]).toBe(start)
          used.add(start)
        }
        expect(after.starts).toEqual(new Set(Object.values(now)))
        active = after
      }
    }))
  })
})

describe('the end of a subscription', () => {
  test('an ended start keeps its key and stays ended while it stays, and its key comes back not ended', () => {
    const first = ended(reconcile(noneActive, listing('a', 'b')).active, 1)
    expect(first.ended).toEqual(new Set([1]))
    const kept = reconcile(first, listing('a'))
    expect(kept.fresh).toEqual([])
    expect(startsOf(kept.active)).toEqual({ a: 1 })
    expect(kept.active.ended).toEqual(new Set([1]))
    const without = reconcile(kept.active, listing())
    expect(without.gone).toEqual([['a', 1]])
    expect(without.active.ended).toEqual(new Set())
    const back = reconcile(without.active, listing('a'))
    expect(back.fresh).toEqual([['a', 'of a', 3]])
    expect(back.active.ended).toEqual(new Set())
  })

  test('the end of a start no longer active, or already ended, leaves the keys as they are', () => {
    const active = ended(reconcile(noneActive, listing('a')).active, 1)
    expect(ended(active, 1)).toBe(active)
    expect(ended(active, 2)).toBe(active)
  })
})

describe('the start of a program', () => {
  test('starts from its first state, at the first revision, with the commands of its first step', () => {
    const state = { n: 0 }
    expect(init({ state, commands: ['Load'] })).toEqual({ current: { state, revision: 0 }, commands: ['Load'] })
    expect(init({ state }).commands).toEqual([])
  })
})

type Counted = Readonly<{ n: number }>

type Change = 'Bump' | 'Stay' | 'Refuse'

/** An `update` that counts its calls. */
const counting = () => {
  const calls = { count: 0 }
  const update: Update<Counted, Change, 'Save', 'Saved'> = (message) => (state) => {
    calls.count += 1
    return message === 'Bump'
      ? { state: { n: state.n + 1 }, commands: ['Save'], events: ['Saved'] }
      : message === 'Stay'
      ? { state, commands: ['Save'] }
      : reject
  }
  return { calls, update }
}

const fromView: Source<string> = { _tag: 'View' }

const alive = () => false

describe('a message against the state', () => {
  const current = { state: { n: 0 }, revision: 3 }

  test('a new state gets the next revision, with the commands and the events of its step', () => {
    const { calls, update } = counting()
    expect(arrive(update, current, noneActive, fromView, 'Bump', alive)).toEqual({
      _tag: 'Applied',
      next: { state: { n: 1 }, revision: 4 },
      changed: true,
      commands: ['Save'],
      events: ['Saved'],
    })
    expect(calls.count).toBe(1)
  })

  test('the very same state keeps its revision, and its commands still run', () => {
    const { update } = counting()
    const arrived = arrive(update, current, noneActive, { _tag: 'Command' }, 'Stay', alive)
    expect(arrived).toEqual({ _tag: 'Applied', next: current, changed: false, commands: ['Save'], events: [] })
    expect(arrived._tag === 'Applied' && arrived.next).toBe(current)
  })

  test('a message update rejects is ignored', () => {
    const { update } = counting()
    expect(arrive(update, current, noneActive, fromView, 'Refuse', alive)).toEqual({ _tag: 'Ignored' })
  })

  test('once the run has died, update is not called', () => {
    const { calls, update } = counting()
    expect(arrive(update, current, noneActive, fromView, 'Bump', () => true)).toEqual({ _tag: 'Dead' })
    expect(calls.count).toBe(0)
  })

  test('a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing', () => {
    const { calls, update } = counting()
    const first = reconcile(noneActive, listing('a')).active
    const back = reconcile(reconcile(first, listing()).active, listing('a')).active
    const earlier: Source<string> = { _tag: 'Subscription', key: 'a', generation: 1 }
    expect(arrive(update, current, back, earlier, 'Bump', alive)).toEqual({ _tag: 'Dropped' })
    expect(arrive(update, current, back, earlier, 'Bump', () => true)).toEqual({ _tag: 'Dead' })
    expect(calls.count).toBe(0)
    const now: Source<string> = { _tag: 'Subscription', key: 'a', generation: 2 }
    expect(arrive(update, current, back, now, 'Bump', alive)._tag).toBe('Applied')
  })

  test('under any history of listings, arrivals and a death, update is called exactly when it applies', () => {
    type Event =
      | Readonly<{ _tag: 'List'; keys: ReadonlyArray<string> }>
      | Readonly<{ _tag: 'Arrive'; from: number }>
      | Readonly<{ _tag: 'Die' }>
    const event = fc.oneof(
      fc.record({
        _tag: fc.constant('List' as const),
        keys: fc.uniqueArray(fc.constantFrom('a', 'b', 'c'), { maxLength: 3 }),
      }),
      // A start among those made so far, by its index, or the view (-1).
      fc.record({ _tag: fc.constant('Arrive' as const), from: fc.integer({ min: -1, max: 12 }) }),
      fc.constant({ _tag: 'Die' as const }),
    )
    fc.assert(fc.property(fc.array(event, { maxLength: 40 }), (history: ReadonlyArray<Event>) => {
      const { calls, update } = counting()
      let active: Active<string> = noneActive
      let state = { state: { n: 0 }, revision: 0 }
      let died = false
      const starts: Array<readonly [string, number]> = []
      for (const happened of history) {
        if (happened._tag === 'Die') {
          died = true
        } else if (happened._tag === 'List') {
          const { fresh, active: after } = reconcile(active, listing(...happened.keys))
          for (const [key, , start] of fresh) starts.push([key, start])
          active = after
        } else {
          const start = starts[happened.from]
          if (happened.from >= 0 && start === undefined) continue
          const source: Source<string> = start === undefined
            ? fromView
            : { _tag: 'Subscription', key: start[0], generation: start[1] }
          const applies = start === undefined || HashMap.get(active.keys, start[0]).pipe(Opt.contains(start[1]))
          const before = calls.count
          const arrived = arrive(update, state, active, source, 'Bump', () => died)
          expect(arrived._tag).toBe(died ? 'Dead' : !applies ? 'Dropped' : 'Applied')
          expect(calls.count - before).toBe(applies && !died ? 1 : 0)
          if (arrived._tag === 'Applied') state = arrived.next
        }
      }
    }))
  })
})
