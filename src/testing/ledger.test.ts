import { describe, expect, test } from 'bun:test'
import * as Opt from 'effect/Option'
import * as Ledger from './ledger.ts'

type Book = Ledger.Ledger<string, 'subscription', 'handle', string, string>

const empty: Book = Ledger.start(['A', 'B', 'A'])

const taken = (ledger: Book, select: (command: string) => boolean) => {
  const taking = Ledger.take(ledger, select)
  if (Opt.isNone(taking)) throw new Error('nothing taken')
  return taking.value
}

const listening = (ledger: Book): Book => Ledger.listened(ledger, [], [[1, 'subscription' as const]])[2]

const openedOne = (ledger: Book): Book => Ledger.open(listening(ledger), 1, 'handle')

const entered = (ledger: Book, call: string): Book => Ledger.enter(ledger, call)

const heardBy = (ledger: Book) => {
  const heard = Ledger.hear(ledger, 1)
  if (Opt.isNone(heard)) throw new Error('nothing heard')
  return heard.value
}

describe('the commands', () => {
  test('a take takes the oldest pending command the selection matches, under way under a ticket of its own', () => {
    const [first, afterFirst] = taken(empty, (command) => command === 'A')
    const [second, afterSecond] = taken(afterFirst, (command) => command === 'A')
    expect(first.command).toBe('A')
    expect(second.command).toBe('A')
    expect(first.ticket).not.toBe(second.ticket)
    expect(afterSecond.pending).toEqual(['B'])
    expect([...afterSecond.underWay]).toEqual([[first.ticket, 'A'], [second.ticket, 'A']])
  })

  test('a take that matches nothing takes nothing', () => {
    expect(Opt.isNone(Ledger.take(empty, (command) => command === 'C'))).toBe(true)
    const [, rest] = taken(taken(taken(empty, () => true)[1], () => true)[1], () => true)
    expect(Opt.isNone(Ledger.take(rest, () => true))).toBe(true)
  })

  test('the commands of a step follow those pending', () => {
    expect(Ledger.owe(empty, ['C']).pending).toEqual(['A', 'B', 'A', 'C'])
    expect(Ledger.owe(empty, [])).toBe(empty)
  })

  test('a command interrupted is cancelled and stays under way until it settles', () => {
    const [{ ticket }, under] = taken(empty, () => true)
    const cancelled = Ledger.cancel(under, ticket)
    expect(cancelled.cancelled).toEqual(['A'])
    expect(cancelled.underWay.has(ticket)).toBe(true)
    const settled = Ledger.settle(cancelled, ticket)
    expect(settled.underWay.size).toBe(0)
    expect(settled.cancelled).toEqual(['A'])
  })

  test('a ticket no longer under way changes nothing', () => {
    const [{ ticket }, under] = taken(empty, () => true)
    const settled = Ledger.settle(under, ticket)
    expect(Ledger.settle(settled, ticket)).toBe(settled)
    expect(Ledger.cancel(settled, ticket)).toBe(settled)
  })
})

describe('the starts heard', () => {
  test('a start that appears is unheard, and hearNext opens it with the subscription listed then', () => {
    expect(Ledger.opening(entered(listening(empty), 'call'), 1, 'call')).toEqual({
      _tag: 'Open',
      subscription: 'subscription',
    })
    expect(Ledger.opening(entered(openedOne(empty), 'call'), 1, 'call')).toEqual({ _tag: 'Opened', handle: 'handle' })
    expect(Ledger.opening(entered(empty, 'call'), 1, 'call')).toEqual({ _tag: 'Gone' })
  })

  test('a start is heard one way: played with hear, or run by hearNext, never both', () => {
    const scripted = Ledger.script(listening(empty), 1)
    if (scripted._tag !== 'Scripted') throw new Error('not scripted')
    expect(Ledger.opening(entered(scripted.ledger, 'call'), 1, 'call')).toEqual({ _tag: 'Scripted' })
    expect(Ledger.script(scripted.ledger, 1)).toEqual({ _tag: 'Scripted', ledger: scripted.ledger })
    expect(Ledger.script(openedOne(empty), 1)).toEqual({ _tag: 'Opened' })
  })

  test('an opened start whose last message is heard has ended, and says so to hear and to hearNext', () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'first'), 1, 'first')
    const before = heardBy(Ledger.send(waited, 1, { message: 'm', last: false })).ledger
    expect(Ledger.script(before, 1)).toEqual({ _tag: 'Opened' })
    expect(Ledger.opening(entered(before, 'call'), 1, 'call')).toEqual({ _tag: 'Opened', handle: 'handle' })
    const [, again] = Ledger.ask(Ledger.enter(before, 'second'), 1, 'second')
    const sentLast = Ledger.send(again, 1, { message: 'm', last: true })
    expect(Ledger.script(sentLast, 1)).toEqual({ _tag: 'Opened' })
    const over = heardBy(sentLast).ledger
    expect(Ledger.script(over, 1)).toEqual({ _tag: 'Ended' })
    expect(Ledger.opening(entered(over, 'call'), 1, 'call')).toEqual({ _tag: 'Ended' })
  })

  test('an ended start stays ended while its key stays, and its key comes back not ended', () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'call'), 1, 'call')
    const over = heardBy(Ledger.send(waited, 1, { message: 'm', last: true })).ledger
    const [, , kept] = Ledger.listened(over, [], [[2, 'subscription' as const]])
    expect(Ledger.script(kept, 1)).toEqual({ _tag: 'Ended' })
    const [stopping, , gone] = Ledger.listened(kept, [1], [])
    expect(stopping).toEqual(['handle'])
    const [, , back] = Ledger.listened(gone, [], [[3, 'subscription' as const]])
    expect(Ledger.opening(entered(back, 'call'), 3, 'call')).toEqual({ _tag: 'Open', subscription: 'subscription' })
    expect(Ledger.script(Ledger.open(back, 3, 'handle'), 3)).toEqual({ _tag: 'Opened' })
  })

  test('a call asks for a message, unless one asked for by a call that left is not heard yet', () => {
    const [firstAsks, first] = Ledger.ask(entered(openedOne(empty), 'first'), 1, 'first')
    expect(firstAsks).toBe(true)
    const left = Ledger.leave(first, 'first')
    const [secondAsks, second] = Ledger.ask(Ledger.enter(left, 'second'), 1, 'second')
    expect(secondAsks).toBe(false)
    const heard = heardBy(Ledger.send(second, 1, { message: 'm', last: false }))
    expect(heard.call).toBe('second')
    expect(Ledger.ask(Ledger.enter(heard.ledger, 'third'), 1, 'third')[0]).toBe(true)
  })

  test('a message is heard by the first call waiting, and waits for a call when none does', () => {
    const [, one] = Ledger.ask(entered(openedOne(empty), 'first'), 1, 'first')
    const [, two] = Ledger.ask(Ledger.enter(one, 'second'), 1, 'second')
    expect(Opt.isNone(Ledger.hear(two, 1))).toBe(true)
    const first = heardBy(Ledger.send(Ledger.send(two, 1, { message: 'a', last: false }), 1, { message: 'b', last: false }))
    expect([first.call, first.sent.message]).toEqual(['first', 'a'])
    const second = heardBy(first.ledger)
    expect([second.call, second.sent.message]).toEqual(['second', 'b'])
    expect(Opt.isNone(Ledger.hear(second.ledger, 1))).toBe(true)
    const [, interrupted] = Ledger.ask(Ledger.enter(second.ledger, 'third'), 1, 'third')
    const kept = Ledger.send(Ledger.leave(interrupted, 'third'), 1, { message: 'c', last: false })
    expect(Opt.isNone(Ledger.hear(kept, 1))).toBe(true)
    const [, fourth] = Ledger.ask(Ledger.enter(kept, 'fourth'), 1, 'fourth')
    expect(heardBy(fourth).sent.message).toBe('c')
  })

  test('the last message tells the calls still waiting, and only the last', () => {
    const [, once] = Ledger.ask(entered(openedOne(empty), 'first'), 1, 'first')
    const [, two] = Ledger.ask(Ledger.enter(once, 'second'), 1, 'second')
    expect(heardBy(Ledger.send(two, 1, { message: 'm', last: false })).ended).toEqual([])
    const last = heardBy(Ledger.send(two, 1, { message: 'm', last: true }))
    expect(last.ended).toEqual(['second'])
    expect(Ledger.opened(last.ledger)[1]).toEqual([])
  })

  test('a call that left before the loop made it wait starts nothing, and waits on nothing', () => {
    const left = Ledger.leave(entered(listening(empty), 'call'), 'call')
    expect(Ledger.opening(left, 1, 'call')).toEqual({ _tag: 'Left' })
    expect(Ledger.opening(listening(empty), 1, 'call')).toEqual({ _tag: 'Left' })
    const leftOpened = Ledger.leave(entered(openedOne(empty), 'call'), 'call')
    expect(Ledger.ask(leftOpened, 1, 'call')).toEqual([false, leftOpened])
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'call'), 1, 'call')
    expect(waited.asking.has('call')).toBe(false)
  })

  test('a message sent once the key went away is heard by nobody', () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'call'), 1, 'call')
    const [, , gone] = Ledger.listened(waited, [1], [])
    expect(Ledger.send(gone, 1, { message: 'm', last: false })).toBe(gone)
  })

  test('a start whose key went away is stopped and forgotten, and the calls waiting on it are told', () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'call'), 1, 'call')
    const [stopping, stopped, gone] = Ledger.listened(waited, [1], [])
    expect(stopping).toEqual(['handle'])
    expect(stopped).toEqual(['call'])
    expect(gone.hearings.has(1)).toBe(false)
    expect(Ledger.listened(listening(empty), [1], [])[0]).toEqual([])
  })

  test('the opened starts are those to stop at the end, with the calls waiting on them', () => {
    const [, waited] = Ledger.ask(entered(openedOne(empty), 'call'), 1, 'call')
    expect(Ledger.opened(waited)).toEqual([['handle'], ['call']])
    expect(Ledger.opened(listening(empty))).toEqual([[], []])
  })
})
