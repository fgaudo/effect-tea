import { describe, expect, test } from "bun:test"
import * as Opt from "effect/Option"
import * as Ledger from "./ledger.ts"

type Book = Ledger.Ledger<string, string, "start", string, string>

const empty: Book = Ledger.owe(Ledger.start(), [
  { command: "A", handle: "a1" },
  { command: "B", handle: "b" },
  { command: "A", handle: "a2" }
])

const taken = (ledger: Book, select: (command: string) => boolean) => {
  const taking = Ledger.take(ledger, select)
  if (Opt.isNone(taking)) throw new Error("nothing taken")
  return taking.value
}

const listening = (ledger: Book): Book => Ledger.listened(ledger, [], [[1, "start" as const]])

const openedOne = (ledger: Book): Book => Ledger.open(listening(ledger), 1)

const entered = (ledger: Book, call: string, generation = 1): Book => Ledger.enter(ledger, call, generation)

const heardBy = (ledger: Book) => {
  const heard = Ledger.hear(ledger, 1)
  if (Opt.isNone(heard)) throw new Error("nothing heard")
  return heard.value
}

describe("the commands", () => {
  test("a take takes the oldest pending command the selection matches, under way under a ticket of its own", () => {
    const [first, afterFirst] = taken(empty, (command) => command === "A")
    const [second, afterSecond] = taken(afterFirst, (command) => command === "A")
    expect([first.command, first.handle]).toEqual(["A", "a1"])
    expect([second.command, second.handle]).toEqual(["A", "a2"])
    expect(first.ticket).not.toBe(second.ticket)
    expect(Ledger.pendingOf(afterSecond)).toEqual(["B"])
    expect([...afterSecond.underWay]).toEqual([
      [first.ticket, { command: "A", handle: "a1" }],
      [second.ticket, { command: "A", handle: "a2" }]
    ])
  })

  test("a take that matches nothing takes nothing", () => {
    expect(Opt.isNone(Ledger.take(empty, (command) => command === "C"))).toBe(true)
    const [, rest] = taken(taken(taken(empty, () => true)[1], () => true)[1], () => true)
    expect(Opt.isNone(Ledger.take(rest, () => true))).toBe(true)
  })

  test("the commands of a step follow those pending, each with the handle of its fiber", () => {
    const owed = Ledger.owe(empty, [{ command: "C", handle: "c" }])
    expect(Ledger.pendingOf(owed)).toEqual(["A", "B", "A", "C"])
    const [first, one] = taken(owed, () => true)
    const [second, two] = taken(one, () => true)
    const [third, three] = taken(two, () => true)
    const [fourth] = taken(three, () => true)
    expect([first, second, third, fourth].map(({ handle }) => handle)).toEqual(["a1", "b", "a2", "c"])
    expect(Ledger.owe(empty, [])).toBe(empty)
  })

  test("a take after a step's commands keeps the order of those older and newer than the one it takes", () => {
    const [, afterB] = taken(empty, (command) => command === "B")
    const owed = Ledger.owe(afterB, [{ command: "C", handle: "c" }, { command: "D", handle: "d" }])
    expect(Ledger.pendingOf(owed)).toEqual(["A", "A", "C", "D"])
    const [c, afterC] = taken(owed, (command) => command === "C")
    expect(c.handle).toBe("c")
    expect(Ledger.pendingOf(afterC)).toEqual(["A", "A", "D"])
    const later = Ledger.owe(afterC, [{ command: "A", handle: "a3" }])
    const [a, afterA] = taken(later, (command) => command === "A")
    expect(a.handle).toBe("a1")
    expect(Ledger.pendingOf(afterA)).toEqual(["A", "D", "A"])
    expect(Ledger.pendingOf(owed)).toEqual(["A", "A", "C", "D"])
  })

  test("a command interrupted is cancelled with the handle of its fiber, and settled by no answer after", () => {
    const [{ ticket }, under] = taken(empty, () => true)
    const cancelled = Ledger.cancel(under, ticket)
    expect(cancelled.cancelled).toEqual([{ command: "A", handle: "a1" }])
    expect(cancelled.underWay.size).toBe(0)
    expect(Opt.isNone(Ledger.settle(cancelled, ticket))).toBe(true)
  })

  test("a command that answered is settled once, and cancelled by no interruption after", () => {
    const [{ ticket }, under] = taken(empty, () => true)
    const settled = Opt.getOrThrow(Ledger.settle(under, ticket))
    expect(settled.underWay.size).toBe(0)
    expect(Opt.isNone(Ledger.settle(settled, ticket))).toBe(true)
    expect(Ledger.cancel(settled, ticket)).toBe(settled)
  })
})

describe("the starts heard", () => {
  test("a start that appears is unheard, and hearNext opens it with what was made for it then", () => {
    expect(Ledger.opening(entered(listening(empty), "call"), 1, "call")).toEqual({ _tag: "Open", start: "start" })
    expect(Ledger.opening(entered(openedOne(empty), "call"), 1, "call")).toEqual({ _tag: "Opened", start: "start" })
    expect(Ledger.opening(entered(empty, "call"), 1, "call")).toEqual({ _tag: "Gone" })
  })

  test("a start that appears is starting until its fiber begins, though its key goes away first", () => {
    const appeared = listening(empty)
    expect(appeared.starting.get(1)).toBe("start")
    const gone = Ledger.listened(appeared, [1], [])
    expect(gone.hearings.has(1)).toBe(false)
    expect(gone.starting.get(1)).toBe("start")
    const [start, begun] = Ledger.begin(gone, 1)
    expect(start).toEqual(Opt.some("start"))
    expect(begun.starting.has(1)).toBe(false)
    expect(Ledger.begin(begun, 1)).toEqual([Opt.none(), begun])
  })

  test("a start is heard one way: played with hear, or run by hearNext, never both", () => {
    const scripted = Ledger.script(listening(empty), 1)
    if (scripted._tag !== "Scripted") throw new Error("not scripted")
    expect(Ledger.opening(entered(scripted.ledger, "call"), 1, "call")).toEqual({ _tag: "Scripted" })
    expect(Ledger.script(scripted.ledger, 1)).toEqual({ _tag: "Scripted", ledger: scripted.ledger })
    expect(Ledger.script(openedOne(empty), 1)).toEqual({ _tag: "Opened" })
    expect(Ledger.open(scripted.ledger, 1)).toBe(scripted.ledger)
  })

  test("an opened start whose last message is heard has ended, and says so to hear and to hearNext", () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), "first"), 1, "first")
    const before = heardBy(Ledger.send(waited, 1, { message: "m", last: false })).ledger
    expect(Ledger.script(before, 1)).toEqual({ _tag: "Opened" })
    expect(Ledger.opening(entered(before, "call"), 1, "call")).toEqual({ _tag: "Opened", start: "start" })
    const [, again] = Ledger.ask(entered(before, "second"), 1, "second")
    const sentLast = Ledger.send(again, 1, { message: "m", last: true })
    expect(Ledger.script(sentLast, 1)).toEqual({ _tag: "Opened" })
    const over = heardBy(sentLast).ledger
    expect(Ledger.script(over, 1)).toEqual({ _tag: "Ended" })
    expect(Ledger.opening(entered(over, "call"), 1, "call")).toEqual({ _tag: "Ended" })
  })

  test("an ended start stays ended while its key stays, and its key comes back not ended", () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), "call"), 1, "call")
    const over = heardBy(Ledger.send(waited, 1, { message: "m", last: true })).ledger
    const kept = Ledger.listened(over, [], [[2, "start" as const]])
    expect(Ledger.script(kept, 1)).toEqual({ _tag: "Ended" })
    const gone = Ledger.listened(kept, [1], [])
    const back = Ledger.listened(gone, [], [[3, "start" as const]])
    expect(Ledger.opening(entered(back, "call", 3), 3, "call")).toEqual({ _tag: "Open", start: "start" })
    expect(Ledger.script(Ledger.open(back, 3), 3)).toEqual({ _tag: "Opened" })
  })

  test("a call asks for a message, unless one asked for by a call that left is not heard yet", () => {
    const [firstAsks, first] = Ledger.ask(entered(openedOne(empty), "first"), 1, "first")
    expect(firstAsks).toBe(true)
    const left = Ledger.leave(first, "first")
    const [secondAsks, second] = Ledger.ask(entered(left, "second"), 1, "second")
    expect(secondAsks).toBe(false)
    const heard = heardBy(Ledger.send(second, 1, { message: "m", last: false }))
    expect(heard.call).toBe("second")
    expect(Ledger.ask(entered(heard.ledger, "third"), 1, "third")[0]).toBe(true)
  })

  test("a message is heard by the first call waiting, and waits for a call when none does", () => {
    const [, one] = Ledger.ask(entered(openedOne(empty), "first"), 1, "first")
    const [, two] = Ledger.ask(entered(one, "second"), 1, "second")
    expect(Opt.isNone(Ledger.hear(two, 1))).toBe(true)
    const first = heardBy(
      Ledger.send(Ledger.send(two, 1, { message: "a", last: false }), 1, { message: "b", last: false })
    )
    expect([first.call, first.sent.message]).toEqual(["first", "a"])
    const second = heardBy(first.ledger)
    expect([second.call, second.sent.message]).toEqual(["second", "b"])
    expect(Opt.isNone(Ledger.hear(second.ledger, 1))).toBe(true)
    const [, interrupted] = Ledger.ask(entered(second.ledger, "third"), 1, "third")
    const kept = Ledger.send(Ledger.leave(interrupted, "third"), 1, { message: "c", last: false })
    expect(Opt.isNone(Ledger.hear(kept, 1))).toBe(true)
    const [, fourth] = Ledger.ask(entered(kept, "fourth"), 1, "fourth")
    expect(heardBy(fourth).sent.message).toBe("c")
  })

  test("the last message tells the calls still waiting, and only the last", () => {
    const [, once] = Ledger.ask(entered(openedOne(empty), "first"), 1, "first")
    const [, two] = Ledger.ask(entered(once, "second"), 1, "second")
    expect(heardBy(Ledger.send(two, 1, { message: "m", last: false })).ended).toEqual([])
    const last = heardBy(Ledger.send(two, 1, { message: "m", last: true }))
    expect(last.ended).toEqual(["second"])
    expect(last.ledger.hearings.get(1)).toMatchObject({ waiting: [] })
  })

  test("a call that left before its job made it wait starts nothing, and waits on nothing", () => {
    const left = Ledger.leave(entered(listening(empty), "call"), "call")
    expect(Ledger.opening(left, 1, "call")).toEqual({ _tag: "Left" })
    expect(Ledger.opening(listening(empty), 1, "call")).toEqual({ _tag: "Left" })
    const leftOpened = Ledger.leave(entered(openedOne(empty), "call"), "call")
    expect(Ledger.ask(leftOpened, 1, "call")).toEqual([false, leftOpened])
    const [, waited] = Ledger.ask(entered(openedOne(empty), "call"), 1, "call")
    expect(waited.asking.has("call")).toBe(false)
  })

  test("a message sent once the key went away is heard by nobody", () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), "call"), 1, "call")
    const gone = Ledger.listened(waited, [1], [])
    expect(Ledger.send(gone, 1, { message: "m", last: false })).toBe(gone)
  })

  test("a start whose key went away is forgotten, and the calls waiting on it are told once it is released", () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), "call"), 1, "call")
    const gone = Ledger.listened(waited, [1], [])
    expect(gone.hearings.has(1)).toBe(false)
    expect(gone.stopped.get(1)).toEqual(["call"])
    const [told, released] = Ledger.release(gone, [1])
    expect(told).toEqual(["call"])
    expect(released.stopped.has(1)).toBe(false)
    expect(Ledger.release(released, [1])[0]).toEqual([])
    expect(Ledger.listened(listening(empty), [1], []).stopped.has(1)).toBe(false)
  })

  // A call looks its key up in the thunk, and its job, which comes before the job that stops the start, finds the key
  // gone when a thunk took it away in between: its start's release tells it, and only that start's.
  test("a call whose job found its key gone is told once its start is released, and by no other release", () => {
    const both = Ledger.listened(Ledger.listened(empty, [], [[1, "start" as const]]), [], [[2, "start" as const]])
    const asking = entered(entered(both, "one", 1), "two", 2)
    const gone = Ledger.listened(asking, [1], [])
    expect(Ledger.opening(gone, 1, "one")).toEqual({ _tag: "Gone" })
    const [told, released] = Ledger.release(gone, [1])
    expect(told).toEqual(["one"])
    expect([...released.asking]).toEqual([["two", 2]])
    expect(Ledger.opening(released, 1, "one")).toEqual({ _tag: "Left" })
  })

  // What the end of the rehearsal tells: a call a step took out of its start, to tell it afterwards, is still one.
  test("a call is among the calls from the thunk that looks its key up until it leaves, whatever its job made of it", () => {
    const offered = entered(openedOne(empty), "call")
    expect([...offered.calls]).toEqual(["call"])
    const [, waited] = Ledger.ask(offered, 1, "call")
    expect([...waited.calls]).toEqual(["call"])
    expect([...Ledger.release(Ledger.listened(waited, [1], []), [1])[1].calls]).toEqual(["call"])
    const heard = heardBy(Ledger.send(waited, 1, { message: "m", last: false })).ledger
    expect([...heard.calls]).toEqual(["call"])
    expect([...Ledger.leave(heard, "call").calls]).toEqual([])
    expect([...Ledger.leave(offered, "call").calls]).toEqual([])
  })
})
