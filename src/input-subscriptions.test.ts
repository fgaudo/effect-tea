// What the subscriptions and the commands of a program do when it has inputs: only what is drawn writes into one.
import { describe, expect, test } from 'bun:test'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'
import { composition } from './compose.ts'
import { write } from './input.ts'
import { type MessageOf, type Program, subscriptionsOf } from './program.ts'
import { run } from './run.ts'
import { isRejected } from './update.ts'

const forever = <M>(onStart: () => void, onStop: () => void) =>
  Channel.fromEffectDone(
    Effect.sync(onStart).pipe(Effect.andThen(Effect.never), Effect.onInterrupt(() => Effect.sync(onStop))),
  ) as Channel.Channel<M, never, M, unknown, unknown, unknown, never>

// Waits, by yielding, for what the run does on its own fibers: a bound turns a wait that never ends into a failure.
const until = (done: () => boolean) =>
  Effect.gen(function*() {
    for (let i = 0; i < 10_000 && !done(); i++) yield* Effect.yieldNow
    if (!done()) return yield* Effect.die(new Error('the run never got there'))
  })

const settle = Effect.gen(function*() {
  for (let i = 0; i < 200; i++) yield* Effect.yieldNow
})

describe('an input among the subscriptions', () => {
  type Ticks = Readonly<{ ticks: number }>
  const ticking: Program<{ state: Ticks; model: number; message: 'Tick' }> = {
    init: { state: { ticks: 0 } },
    update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
    subscriptions: () => HashMap.make(['ticks', forever<'Tick'>(() => {}, () => {})]),
    makeModel: ({ ticks }) => ticks,
  }
  type Page = Readonly<{ name: string; ticking: Ticks }>
  const here = Optic.id<Page>()
  const { child, input, compose } = composition<{ state: Page }>()
  const page = compose({
    init: (children) => ({ state: { name: '', ticking: children.Ticking.init.state } }),
    children: { Ticking: child(ticking, { at: here.key('ticking') }) },
    inputs: { Name: input(here.key('name')) },
    subscriptions: () => HashMap.make(['own', forever<never>(() => {}, () => {})]),
    makeModel: (state) => state.name,
  })
  type Message = MessageOf<typeof page>

  test('lifts no key: the program keeps its own and its children\'s, and none is under the input\'s name', () => {
    const state: Page = { name: 'Ada', ticking: { ticks: 0 } }
    const keys = subscriptionsOf(page)(state)
    expect(HashMap.size(keys)).toBe(2)
    expect(HashMap.has(keys, 'own')).toBe(true)
    expect(HashMap.has(keys, ['Ticking', 'ticks'])).toBe(true)
  })

  test('a write into it keeps every subscription the same object, the children\'s lifted ones included', () => {
    const before: Page = { name: '', ticking: { ticks: 0 } }
    const typed = page.update({ _tag: 'Name', message: write(before.name, 'Ada') })(before)
    if (isRejected(typed)) throw new Error('rejected')
    expect(typed.state.ticking).toBe(before.ticking)
    const lifted = (state: Page) => Opt.getOrThrow(HashMap.get(subscriptionsOf(page)(state), ['Ticking', 'ticks']))
    expect(lifted(typed.state)).toBe(lifted(before))
  })

  test('a subscription of the program\'s own cannot write into an input: it sends the program\'s own messages', () => {
    compose({
      init: () => ({ state: { name: '', ticking: { ticks: 0 } } }),
      inputs: { Name: input(here.key('name')) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Dictated') => (state: Page) => ({ state }),
      // @ts-expect-error: what is written into an input is no own message
      subscriptions: () => HashMap.make(['dictation', forever<Extract<Message, { _tag: 'Name' }>>(() => {}, () => {})]),
      makeModel: () => null,
    })
  })

  test('a command\'s answer cannot write into an input: it is an own message or a child\'s', () => {
    const saving = composition<{ state: Page; command: 'Load' }>()
    saving.compose({
      init: () => ({ state: { name: '', ticking: { ticks: 0 } } }),
      inputs: { Name: saving.input(here.key('name')) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Loaded') => (state: Page) => ({ state, commands: ['Load' as const] }),
      // @ts-expect-error: the answer would write into the input, over the value the command started with
      runCommand: () => Effect.succeedSome({ _tag: 'Name' as const, message: write('', 'Ada') }),
      makeModel: () => null,
    })
    saving.compose({
      init: () => ({ state: { name: '', ticking: { ticks: 0 } } }),
      inputs: { Name: saving.input(here.key('name')) },
      update: (_: 'Loaded') => (state: Page) => ({ state, commands: ['Load' as const] }),
      runCommand: () => Effect.succeedSome('Loaded' as const),
      makeModel: () => null,
    })
  })

  test('a command\'s answer cannot write into a child\'s input either', () => {
    type Note = Readonly<{ text: string }>
    const note = composition<{ state: Note }>()
    const noteProgram = note.compose({
      init: () => ({ state: { text: '' } }),
      inputs: { Text: note.input(Optic.id<Note>().key('text')) },
      makeModel: (state) => state,
    })
    type Board = Readonly<{ note: Note }>
    const board = composition<{ state: Board; command: 'Load' }>()
    const typed = { _tag: 'Note' as const, message: { _tag: 'Text' as const, message: write('', 'Ada') } }
    board.compose({
      init: (children) => ({ state: { note: children.Note.init.state } }),
      children: { Note: board.child(noteProgram, { at: Optic.id<Board>().key('note') }) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Loaded') => (state: Board) => ({ state, commands: ['Load' as const] }),
      // @ts-expect-error: the answer would write into the child's input, over the value the command started with
      runCommand: () => Effect.succeedSome(typed),
      makeModel: () => null,
    })
  })
})

// A search as one types: a subscription under a key made from the input's value, run through a run, with what each
// start and stop of it was.
describe('a reaction to every keystroke, as a subscription keyed by the value', () => {
  type Search = Readonly<{ query: string }>
  type Own = 'Same' | 'Cleared'
  const here = Optic.id<Search>()
  const { input, compose } = composition<{ state: Search }>()
  const searching = (log: Array<string>) =>
    compose({
      init: () => ({ state: { query: '' } }),
      inputs: { Query: input(here.key('query')) },
      update: (message: Own) => (state) => ({ state: { query: message === 'Same' ? `${state.query}` : '' } }),
      subscriptions: (state) =>
        HashMap.make([
          state.query,
          forever<Own>(() => log.push(`start ${state.query}`), () => log.push(`stop ${state.query}`)),
        ]),
      makeModel: (state) => state.query,
    })

  test('every write that changes it stops the search before and starts one, a value typed back too', async () => {
    const log: Array<string> = []
    const expected = [
      'start ',
      'stop ',
      'start a',
      'stop a',
      'start ab',
      'stop ab',
      'start a',
      // `Same` leaves the value, and a write of the value held leaves the very state: no search starts again.
      'stop a',
      'start ',
      // The end of the run.
      'stop ',
    ]
    await Effect.runPromise(run(searching(log), (frames) =>
      frames.pipe(
        Stream.take(1),
        Stream.runForEach(({ dispatch }) =>
          Effect.gen(function*() {
            yield* until(() => log.length === 1)
            // What the user types, over what the input on screen showed, and what the program does, one after
            // another.
            const typed = (was: string, value: string) => dispatch({ _tag: 'Query', message: write(was, value) })
            yield* typed('', 'a')
            yield* typed('a', 'ab')
            yield* typed('ab', 'a')
            yield* typed('a', 'a')
            yield* dispatch('Same')
            yield* dispatch('Cleared')
            yield* until(() => log.length >= expected.length - 1)
            yield* settle
          })
        ),
      )))
    expect(log).toEqual(expected)
  })
})

describe('a value from a subscription into an input', () => {
  type Note = Readonly<{ text: string }>
  const here = Optic.id<Note>()
  const { input, compose } = composition<{ state: Note }>()
  type Own = Readonly<{ _tag: 'Dictated'; text: string }>
  const note = compose({
    init: () => ({ state: { text: '' } }),
    inputs: { Text: input(here.key('text')) },
    update: (message: Own) => (state) => ({ state: { text: `${state.text}${message.text}` } }),
    makeModel: (state) => state.text,
  })

  test('is a step of the program: what the user typed over the value before it is rejected', () => {
    const before: Note = { text: 'Hel' }
    const dictated = note.update({ _tag: 'Dictated', text: 'lo' })(before)
    if (isRejected(dictated)) throw new Error('rejected')
    expect(dictated.state).toEqual({ text: 'Hello' })
    expect(isRejected(note.update({ _tag: 'Text', message: write(before.text, 'Help') })(dictated.state))).toBe(true)
    expect(isRejected(note.update({ _tag: 'Text', message: write('Hello', 'Hello!') })(dictated.state))).toBe(false)
  })
})
