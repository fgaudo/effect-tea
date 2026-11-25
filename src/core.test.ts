import { describe, expect, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Exit from "effect/Exit"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import fc from "fast-check"
import {
  type Active,
  arrive,
  diesFirst,
  endedWith,
  hasDied,
  init,
  noDeaths,
  noneActive,
  otherwiseDefect,
  reconcile,
  record,
  released,
  type Source,
  Stopped,
  wrapDefects
} from "./core.ts"
import { programDefect } from "./defect.ts"
import { reject, type Update } from "./update.ts"

class Request extends Context.Service<Request, string>()("Request") {}

const defects = (cause: Cause.Cause<unknown>) =>
  cause.reasons.map((reason) => Cause.isDieReason(reason) ? reason.defect : reason._tag)

const message = (defect: unknown) => defect instanceof Error ? defect.message : defect

describe("what a fiber dies of", () => {
  test("a self-interruption is a defect, holding the interruption", () => {
    const interruption = Cause.interrupt(1)
    const [defect] = defects(otherwiseDefect(interruption))
    expect(defect).toBeInstanceOf(Error)
    expect(message(defect)).toBe("It was interrupted by the program, which only the run may do")
    expect((defect as Error).cause).toEqual(interruption)
  })

  test("a failure, or an empty cause, is a defect the types rule out", () => {
    expect(defects(otherwiseDefect(Cause.fail("oops"))).map(message)).toEqual(["It failed, which its type rules out"])
    expect(defects(otherwiseDefect(Cause.empty)).map(message)).toEqual(["It failed, which its type rules out"])
  })

  test("beside defects, it takes the place of the first of what is not one, so that the order stays", () => {
    const cause = Cause.fromReasons<string>([
      ...Cause.die("first").reasons,
      ...Cause.interrupt(1).reasons,
      ...Cause.die("second").reasons,
      ...Cause.fail("oops").reasons
    ])
    expect(defects(otherwiseDefect(cause)).map(message)).toEqual([
      "first",
      "It failed, which its type rules out",
      "second"
    ])
  })

  test("an interruption the fiber received is kept as it is, beside the defect its own interruption is", () => {
    const cause = Cause.fromReasons([...Cause.interrupt(1).reasons, ...Cause.interrupt(2).reasons])
    expect(defects(otherwiseDefect(cause, Cause.interrupt(2))).map(message)).toEqual([
      "It was interrupted by the program, which only the run may do",
      "Interrupt"
    ])
  })

  test("a cause of interruptions the fiber received, or of defects beside them, is no further defect", () => {
    const received = Cause.interrupt(2)
    expect(otherwiseDefect(received, received)).toBe(received)
    const dying = Cause.fromReasons([...Cause.die("boom").reasons, ...Cause.interrupt(2).reasons])
    expect(otherwiseDefect(dying, received)).toBe(dying)
  })

  // `FiberMap`, `FiberSet` and `FiberHandle` interrupt as the fiber -1, as a stop of the run could: the mark tells them.
  test("an interruption with the fiber id of one received, and not its mark, is a defect", () => {
    const received = Cause.annotate(Cause.interrupt(-1), Context.make(Stopped, {}))
    const cause = Cause.fromReasons([...Cause.interrupt(-1).reasons, ...received.reasons])
    expect(defects(otherwiseDefect(cause, received)).map(message)).toEqual([
      "It was interrupted by the program, which only the run may do",
      "Interrupt"
    ])
    const again = Cause.annotate(Cause.interrupt(-1), Context.make(Stopped, {}))
    expect(defects(otherwiseDefect(again, received)).map(message)).toEqual([
      "It was interrupted by the program, which only the run may do"
    ])
    const annotated = Cause.annotate(received, Context.make(Request, "r-1"))
    expect(otherwiseDefect(annotated, received)).toBe(annotated)
  })

  test("each defect is wrapped where it happened, with its annotations, and the rest kept as it is", () => {
    const annotations = Context.make(Request, "r-1")
    const cause = Cause.fromReasons<string>([
      ...Cause.annotate(Cause.die("boom"), annotations).reasons,
      ...Cause.fail("kept").reasons,
      ...Cause.die("again").reasons
    ])
    const wrapped = wrapDefects(cause, "command", { on: "Save" }, () => false)
    expect(defects(wrapped)).toEqual([
      programDefect({ where: "command", cause: "boom", on: "Save" }),
      "Fail",
      programDefect({ where: "command", cause: "again", on: "Save" })
    ])
    expect(wrapped.reasons[1]).toEqual(cause.reasons[1])
    // What `Effect.die` annotates a defect with (its stack and span) is not in the type of the annotations.
    const requests = wrapped.reasons.map((reason) =>
      Context.getOption(Cause.reasonAnnotations(reason) as Context.Context<Request>, Request)
    )
    expect(requests).toEqual([Opt.some("r-1"), Opt.none(), Opt.none()])
  })

  test("a defect already wrapped is left as it is", () => {
    const inner = programDefect({ where: "subscription", cause: "boom" })
    const wrapped = wrapDefects(Cause.die(inner), "command", {}, (defect) => defect === inner)
    expect(defects(wrapped)).toEqual([inner])
  })
})

describe("the register of deaths", () => {
  test("keeps each defect once, by its identity, in the order the fibers died", () => {
    const a = new Error("a")
    const b = new Error("b")
    const once = record(noDeaths, Cause.fromReasons([...Cause.die(a).reasons, ...Cause.die(a).reasons]), () => true)
    const joined = record(once, Cause.fromReasons([...Cause.die(b).reasons, ...Cause.die(a).reasons]), () => true)
    expect(joined.map((death) => death.defect)).toEqual([a, b])
    expect(hasDied(joined, a)).toBe(true)
  })

  test("tells defects apart by identity, never by Equal", () => {
    const one = { _tag: "Boom" }
    const other = { _tag: "Boom" }
    const register = record(record(noDeaths, Cause.die(one), () => true), Cause.die(other), () => true)
    expect(register.map((death) => death.defect)).toEqual([one, other])
    expect(register.map((death) => death.defect)[1]).toBe(other)
    expect(hasDied(register, { _tag: "Boom" })).toBe(false)
  })

  test("keeps only the defects it is asked to, and nothing of interruptions or failures", () => {
    const cause = Cause.fromReasons<string>([
      ...Cause.die("kept").reasons,
      ...Cause.die("left").reasons,
      ...Cause.interrupt(1).reasons,
      ...Cause.fail("oops").reasons
    ])
    expect(record(noDeaths, cause, (defect) => defect === "kept").map((death) => death.defect)).toEqual(["kept"])
  })

  test("is the same register when nothing new died, so that the shell signals only a new death", () => {
    const register = record(noDeaths, Cause.die("a"), () => true)
    expect(record(register, Cause.die("a"), () => true)).toBe(register)
    expect(record(register, Cause.interrupt(1), () => true)).toBe(register)
  })
})

describe("what a run ends with", () => {
  const dies = (...thrown: ReadonlyArray<unknown>) =>
    thrown.flatMap((defect) => Cause.die(defect).reasons.filter(Cause.isDieReason))

  test("a run that died ends with its defects first, then the rest of what it ended with", () => {
    const a = new Error("a")
    const b = new Error("b")
    const ended = Cause.fromReasons<string>([...Cause.interrupt(1).reasons, ...dies(b), ...Cause.fail("oops").reasons])
    const failed = endedWith(dies(a, b), Exit.failCause(ended))
    expect(Exit.isFailure(failed) ? defects(failed.cause) : []).toEqual([a, b, "Interrupt", "Fail"])
    const succeeded = endedWith(dies(a), Exit.succeed(1))
    expect(Exit.isFailure(succeeded) ? defects(succeeded.cause) : []).toEqual([a])
  })

  test("a run where nothing died ends with what it ended with, as it is", () => {
    const exit = Exit.fail("oops")
    expect(endedWith([], exit)).toBe(exit)
  })

  test("a defect is left out of the rest by its identity, never by Equal", () => {
    const one = { _tag: "Boom" }
    const other = { _tag: "Boom" }
    expect(defects(diesFirst(dies(one), Cause.fromReasons([...dies(other), ...dies(one)])))).toEqual([one, other])
    expect(diesFirst(dies(one), Cause.die(other)).reasons[1]?._tag === "Die").toBe(true)
  })
})

describe("what a fiber with a scope of its own ends with", () => {
  test("what its effect ended with, then what its release died of", () => {
    const own = Cause.fromReasons<string>([...Cause.die("own").reasons, ...Cause.interrupt(1).reasons])
    expect(defects(released(own, Cause.die("release")))).toEqual(["own", "Interrupt", "release"])
  })

  test("two defects equal by Equal stay two, told apart by identity", () => {
    const one = { _tag: "Boom" }
    const other = { _tag: "Boom" }
    const release = Cause.fromReasons([...Cause.die(other).reasons, ...Cause.die(one).reasons])
    expect(defects(released(Cause.die(one), release))).toEqual([one, other])
  })

  test("an interruption of the release is left out when the effect has one by the same fiber, with its mark", () => {
    const mark = Context.make(Stopped, {})
    const own = Cause.fromReasons([...Cause.die("own").reasons, ...Cause.annotate(Cause.interrupt(1), mark).reasons])
    const release = Cause.fromReasons<never>([
      ...Cause.annotate(Cause.interrupt(1), Context.make(Stopped, {})).reasons,
      ...Cause.interrupt(1).reasons,
      ...Cause.interrupt(2).reasons,
      ...Cause.annotate(Cause.interrupt(1), mark).reasons
    ])
    expect(released(own, release).reasons.map((reason) => Cause.isInterruptReason(reason) ? reason.fiberId : "own"))
      .toEqual(["own", 1, 1, 1, 2])
  })
})

const listing = <K>(...keys: ReadonlyArray<K>) => Array.from(keys)

const startsOf = <K>(active: Active<K>): Readonly<Record<string, number>> =>
  Object.fromEntries(Array.from(active.keys, ([key, start]) => [String(key), start]))

describe("the keys of a new state, against those before", () => {
  test("a new key starts, with a start of its own, in the order the listing gives them", () => {
    const listed = listing("a", "b")
    const [first, second] = Array.from(listed) as [string, string]
    const { gone, fresh, active } = reconcile(noneActive, listed)
    expect(gone).toEqual([])
    expect(fresh).toEqual([[first, 1], [second, 2]])
    expect(startsOf(active)).toEqual({ [String(first)]: 1, [String(second)]: 2 })
    expect(active.starts).toEqual(new Set([1, 2]))
  })

  test("a kept key keeps its start, and a gone key stops with its start", () => {
    const first = reconcile(noneActive, listing("a", "b")).active
    const { gone, fresh, active } = reconcile(first, listing("a", "c"))
    expect(gone).toEqual([["b", 2]])
    expect(fresh).toEqual([["c", 3]])
    expect(startsOf(active)).toEqual({ a: 1, c: 3 })
    expect(active.starts).toEqual(new Set([1, 3]))
  })

  test("a key that comes back gets a new start", () => {
    const first = reconcile(noneActive, listing("a")).active
    const without = reconcile(first, listing()).active
    const { fresh, active } = reconcile(without, listing("a"))
    expect(fresh).toEqual([["a", 2]])
    expect(active.starts).toEqual(new Set([2]))
  })

  test("a key equal by value, made anew, keeps its start", () => {
    const first = reconcile(noneActive, listing(["row", 1])).active
    const { gone, fresh, active } = reconcile(first, listing(["row", 1]))
    expect(gone).toEqual([])
    expect(fresh).toEqual([])
    expect(active.starts).toEqual(new Set([1]))
  })

  test("the same keys, made anew, leave the active ones the very same", () => {
    const first = reconcile(noneActive, listing(["row", 1], ["row", 2])).active
    const { gone, fresh, active } = reconcile(first, listing(["row", 2], ["row", 1]))
    expect(gone).toEqual([])
    expect(fresh).toEqual([])
    expect(active).toBe(first)
  })

  // A listing is an array, so a key may be listed twice.
  test("a key listed twice is listed once, and hides no key that went away", () => {
    const first = reconcile(noneActive, listing("a", "a", "b"))
    expect(first.fresh).toEqual([["a", 1], ["b", 2]])
    // As many keys listed as active, each of them active: `b` went away all the same.
    const second = reconcile(first.active, listing("a", "a"))
    expect(second.gone).toEqual([["b", 2]])
    expect(second.fresh).toEqual([])
    expect(reconcile(second.active, listing("a", "a", "a")).active).toBe(second.active)
  })

  test("under any history of listings, starts follow the keys", () => {
    const keys = fc.array(fc.constantFrom<string>("a", "b", "c", "d", "e"), { maxLength: 7 })
    fc.assert(fc.property(fc.array(keys, { maxLength: 20 }), (history) => {
      let active: Active<string> = noneActive
      const used = new Set<number>()
      for (const listed of history) {
        const before = active
        const map = listing(...listed)
        const { gone, fresh, active: after } = reconcile(before, map)
        const previous = startsOf(before)
        const now = startsOf(after)
        const distinct = Array.from(new Set(listed))
        expect(Object.keys(now).sort()).toEqual([...distinct].sort())
        expect(gone).toEqual(Object.entries(previous).filter(([key]) => !listed.includes(key)))
        for (const key of listed) {
          if (key in previous) expect(now[key]).toBe(previous[key])
        }
        expect(fresh.map(([key]) => key)).toEqual(distinct.filter((key) => !(key in previous)))
        for (const [key, start] of fresh) {
          expect(used.has(start)).toBe(false)
          expect(now[key]).toBe(start)
          used.add(start)
        }
        expect(after.starts).toEqual(new Set(Object.values(now)))
        expect(after === before).toBe(gone.length === 0 && fresh.length === 0)
        active = after
      }
    }))
  })
})

describe("the start of a program", () => {
  test("starts from its first state, with the commands of its first step", () => {
    const state = { n: 0 }
    expect(init({ state, commands: ["Load"] })).toEqual({ state, commands: ["Load"] })
    expect(init({ state }).commands).toEqual([])
  })
})

type Counted = Readonly<{ n: number }>

type Change = "Bump" | "Stay" | "Refuse"

/** An `update` that counts its calls. */
const counting = () => {
  const calls = { count: 0 }
  const update: Update<Counted, Change, "Save", "Saved"> = (message) => (state) => {
    calls.count += 1
    return message === "Bump"
      ? { state: { n: state.n + 1 }, commands: ["Save"], events: ["Saved"] }
      : message === "Stay"
      ? { state, commands: ["Save"] }
      : reject
  }
  return { calls, update }
}

const fromDispatch: Source<string> = { _tag: "Dispatch" }

const alive = () => false

describe("a message against the state", () => {
  const current = { n: 0 }

  test("a new state is the one update gave, with the commands and the events of its step", () => {
    const { calls, update } = counting()
    expect(arrive(update, current, noneActive, fromDispatch, "Bump", alive)).toEqual({
      _tag: "Applied",
      next: { n: 1 },
      changed: true,
      commands: ["Save"],
      events: ["Saved"]
    })
    expect(calls.count).toBe(1)
  })

  test("the very same state is no new state, and its commands still run", () => {
    const { update } = counting()
    const arrived = arrive(update, current, noneActive, { _tag: "Command" }, "Stay", alive)
    expect(arrived).toEqual({ _tag: "Applied", next: current, changed: false, commands: ["Save"], events: [] })
    expect(arrived._tag === "Applied" && arrived.next).toBe(current)
  })

  test("a state that is NaN, given back, is the very same state", () => {
    const update: Update<number, "Stay"> = () => () => ({ state: Number.NaN })
    const nan = Number.NaN
    const arrived = arrive(update, nan, noneActive, fromDispatch, "Stay", alive)
    expect(arrived).toEqual({ _tag: "Applied", next: nan, changed: false, commands: [], events: [] })
    expect(arrived._tag === "Applied" && arrived.next).toBe(Number.NaN)
  })

  test("a message update rejects is ignored", () => {
    const { update } = counting()
    expect(arrive(update, current, noneActive, fromDispatch, "Refuse", alive)).toEqual({ _tag: "Ignored" })
  })

  test("once the run has died, update is not called", () => {
    const { calls, update } = counting()
    expect(arrive(update, current, noneActive, fromDispatch, "Bump", () => true)).toEqual({ _tag: "Dead" })
    expect(calls.count).toBe(0)
  })

  test("a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing", () => {
    const { calls, update } = counting()
    const first = reconcile(noneActive, listing("a")).active
    const back = reconcile(reconcile(first, listing()).active, listing("a")).active
    const earlier: Source<string> = { _tag: "Subscription", key: "a", generation: 1 }
    expect(arrive(update, current, back, earlier, "Bump", alive)).toEqual({ _tag: "Dropped" })
    expect(arrive(update, current, back, earlier, "Bump", () => true)).toEqual({ _tag: "Dead" })
    expect(calls.count).toBe(0)
    const now: Source<string> = { _tag: "Subscription", key: "a", generation: 2 }
    expect(arrive(update, current, back, now, "Bump", alive)._tag).toBe("Applied")
  })

  test("under any history of listings, arrivals and a death, update is called exactly when it applies", () => {
    type Event =
      | Readonly<{ _tag: "List"; keys: ReadonlyArray<string> }>
      | Readonly<{ _tag: "Arrive"; from: number }>
      | Readonly<{ _tag: "Die" }>
    const event = fc.oneof(
      fc.record({
        _tag: fc.constant("List" as const),
        keys: fc.uniqueArray(fc.constantFrom("a", "b", "c"), { maxLength: 3 })
      }),
      // A start among those made so far, by its index, or the view (-1).
      fc.record({ _tag: fc.constant("Arrive" as const), from: fc.integer({ min: -1, max: 12 }) }),
      fc.constant({ _tag: "Die" as const })
    )
    fc.assert(fc.property(fc.array(event, { maxLength: 40 }), (history: ReadonlyArray<Event>) => {
      const { calls, update } = counting()
      let active: Active<string> = noneActive
      let state: Counted = { n: 0 }
      let died = false
      const starts: Array<readonly [string, number]> = []
      for (const happened of history) {
        if (happened._tag === "Die") {
          died = true
        } else if (happened._tag === "List") {
          const { fresh, active: after } = reconcile(active, listing(...happened.keys))
          for (const [key, start] of fresh) starts.push([key, start])
          active = after
        } else {
          const start = starts[happened.from]
          if (happened.from >= 0 && start === undefined) continue
          const source: Source<string> = start === undefined
            ? fromDispatch
            : { _tag: "Subscription", key: start[0], generation: start[1] }
          const applies = start === undefined || HashMap.get(active.keys, start[0]).pipe(Opt.contains(start[1]))
          const before = calls.count
          const arrived = arrive(update, state, active, source, "Bump", () => died)
          expect(arrived._tag).toBe(died ? "Dead" : !applies ? "Dropped" : "Applied")
          expect(calls.count - before).toBe(applies && !died ? 1 : 0)
          if (arrived._tag === "Applied") state = arrived.next
        }
      }
    }))
  })
})
