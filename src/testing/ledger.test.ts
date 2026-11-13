import { describe, expect, test } from 'bun:test'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import { type Active, ended, noneActive, reconcile } from '../core.ts'
import * as Ledger from './ledger.ts'

type Book = Ledger.Ledger<string, 'subscription', 'handle'>

const empty: Book = Ledger.start(['A', 'B', 'A'])

const taken = (ledger: Book, select: (command: string) => boolean) => {
  const taking = Ledger.take(ledger, select)
  if (Opt.isNone(taking)) throw new Error('nothing taken')
  return taking.value
}

// One key listened to, under the first start.
const one: Active<string> = reconcile(noneActive, HashMap.make(['k', 'subscription'])).active

const listening = (ledger: Book) => Ledger.listened(ledger, [], [[1, 'subscription']])[1]

const openedOne = (ledger: Book) => Ledger.open(listening(ledger), 1, 'handle')

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
    expect(Ledger.opening(listening(empty), one, 1)).toEqual({ _tag: 'Open', subscription: 'subscription' })
    expect(Ledger.opening(openedOne(empty), one, 1)).toEqual({ _tag: 'Opened', handle: 'handle' })
    expect(Ledger.opening(empty, one, 1)).toEqual({ _tag: 'Gone' })
  })

  test('a start is heard one way: played with hear, or run by hearNext, never both', () => {
    const scripted = Ledger.script(listening(empty), one, 1)
    if (scripted._tag !== 'Scripted') throw new Error('not scripted')
    expect(Ledger.opening(scripted.ledger, one, 1)).toEqual({ _tag: 'Scripted' })
    expect(Ledger.script(scripted.ledger, one, 1)).toEqual({ _tag: 'Scripted', ledger: scripted.ledger })
    expect(Ledger.script(openedOne(empty), one, 1)).toEqual({ _tag: 'Opened' })
  })

  test('an opened start that has ended says so, to hear and to hearNext', () => {
    const over = ended(one, 1)
    expect(Ledger.script(openedOne(empty), over, 1)).toEqual({ _tag: 'Ended' })
    expect(Ledger.opening(openedOne(empty), over, 1)).toEqual({ _tag: 'Ended' })
  })

  test('each call asks for a message, unless one asked for by a call that left is not heard yet', () => {
    const [firstAsks, first] = Ledger.ask(openedOne(empty), 1)
    expect(firstAsks).toBe(true)
    const left = Ledger.leave(first, 1)
    const [secondAsks, second] = Ledger.ask(left, 1)
    expect(secondAsks).toBe(false)
    const [, heard] = Ledger.heard(Ledger.leave(second, 1), 1, false)
    expect(Ledger.ask(heard, 1)[0]).toBe(true)
  })

  test('the last message tells the calls still waiting, and only the last', () => {
    const [, once] = Ledger.ask(openedOne(empty), 1)
    const [, two] = Ledger.ask(once, 1)
    const left = Ledger.leave(two, 1)
    expect(Ledger.heard(left, 1, false)[0]).toBe(0)
    expect(Ledger.heard(left, 1, true)[0]).toBe(1)
  })

  test('a start whose key went away is stopped, and kept only while calls wait on it', () => {
    const [, waited] = Ledger.ask(openedOne(empty), 1)
    const [stopping, gone] = Ledger.listened(waited, [1], [])
    expect(stopping).toEqual(['handle'])
    expect(Ledger.opened(gone)).toEqual([])
    expect(gone.hearings.has(1)).toBe(true)
    expect(Ledger.leave(gone, 1).hearings.has(1)).toBe(false)
    const [, unwaited] = Ledger.listened(openedOne(empty), [1], [])
    expect(unwaited.hearings.has(1)).toBe(false)
    expect(Ledger.listened(listening(empty), [1], [])[0]).toEqual([])
  })

  test('the opened starts whose key stays are those to stop at the end', () => {
    expect(Ledger.opened(openedOne(empty))).toEqual(['handle'])
    expect(Ledger.opened(listening(empty))).toEqual([])
  })
})
