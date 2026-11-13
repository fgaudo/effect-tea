import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import fc from 'fast-check'
import {
  type Active,
  diesOnly,
  hasDied,
  noDeaths,
  noneActive,
  otherwiseDefect,
  reconcile,
  record,
  report,
  wrapDefects,
} from './core.ts'
import { ProgramDefect } from './defect.ts'

class Request extends Context.Service<Request, string>()('Request') {}

const defects = (cause: Cause.Cause<unknown>) =>
  cause.reasons.map((reason) => Cause.isDieReason(reason) ? reason.defect : reason._tag)

const message = (defect: unknown) => defect instanceof Error ? defect.message : defect

describe('what a fiber dies of', () => {
  test('dies of defects only when its cause holds defects and nothing else', () => {
    expect(diesOnly(Cause.die('a'))).toBe(true)
    expect(diesOnly(Cause.fromReasons([...Cause.die('a').reasons, ...Cause.interrupt(1).reasons]))).toBe(false)
    expect(diesOnly(Cause.interrupt(1))).toBe(false)
    expect(diesOnly(Cause.empty)).toBe(false)
  })

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
