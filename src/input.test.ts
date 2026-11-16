// The semantics of an input, as pure pieces: what `update` makes of what is written into one, what a step of the
// program leaves of one and of its subscriptions, and what an element on screen holds of one, as a bridge asks the
// library (`edited`, `drawn`). Nothing here runs.
import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as fc from 'fast-check'
import { composition } from './compose.ts'
import { type Dispatch, forwardTo } from './dispatch.ts'
import { drawn, edited, type Shown, type Written } from './input.ts'
import { type MessageOf, type Program, subscriptionsOf } from './program.ts'
import type { Subscription } from './subscription.ts'
import { dispatchViolations } from './testing/dispatch-violations.ts'
import { reject, type Step, type Transition } from './update.ts'

const idle = <M>(): Subscription<M, never> => Channel.never

const stepped = <S, C, E>(result: Transition<S, C, E>): Step<S, C, E> => {
  if (result === reject) throw new Error('rejected')
  return result
}

// A draft with a title and a level, which the outside writes into, and what the program does with them: it clears
// the title, keeping the state it had, takes that state back, and mutes the level.
type Draft = Readonly<{ title: string; level: number; before: Opt.Option<Draft>; opened: number }>

type Own = 'Cleared' | 'Undone' | 'Muted' | 'Opened' | 'Touched'

const draftOf = (title: string, level = 50): Draft => ({ title, level, before: Opt.none(), opened: 0 })

const here = Optic.id<Draft>()

const { compose, inputById, input } = composition<{ state: Draft }>()

const draft = compose({
  init: () => ({ state: draftOf('') }),
  inputs: { Title: input({ at: here.key('title') }), Level: input({ at: here.key('level') }) },
  update: (message: Own) => (state) => {
    switch (message) {
      case 'Cleared':
        return state.title === '' ? reject : { state: { ...state, title: '', before: Opt.some(state) } }
      // The whole state it had, as it was.
      case 'Undone':
        return Opt.match(state.before, { onNone: () => reject, onSome: (before) => ({ state: before }) })
      case 'Muted':
        return { state: { ...state, level: 0 } }
      case 'Opened':
        return { state: { ...state, opened: state.opened + 1 } }
      case 'Touched':
        return { state }
    }
  },
  makeModel: (state) => ({ title: state.title, level: state.level }),
})

type Message = MessageOf<typeof draft>

const title = (was: string, text: string): Message => ({
  _tag: 'Title',
  message: { _tag: 'Written', was, value: text },
})

const level = (was: number, value: number): Message => ({ _tag: 'Level', message: { _tag: 'Written', was, value } })

const drafts = fc.record({
  title: fc.string(),
  level: fc.integer(),
  before: fc.constant(Opt.none<Draft>()),
  opened: fc.nat(),
})

describe('what is written into an input', () => {
  test('is stored, whatever it is, when it was written over the value the place holds', () => {
    fc.assert(fc.property(drafts, fc.string(), fc.integer(), (state, text, value) => {
      expect(stepped(draft.update(title(state.title, text))(state)).state).toEqual({ ...state, title: text })
      expect(stepped(draft.update(level(state.level, value))(state)).state).toEqual({ ...state, level: value })
    }))
  })

  test('leaves the very same state when the place holds it already', () => {
    const state = draftOf('Ada')
    expect(stepped(draft.update(title('Ada', 'Ada'))(state)).state).toBe(state)
  })

  test('is rejected when it was written over another value than the place holds', () => {
    fc.assert(fc.property(drafts, fc.string(), fc.string(), (state, was, text) => {
      fc.pre(was !== state.title)
      expect(draft.update(title(was, text))(state)).toBe(reject)
    }))
    const cleared = stepped(draft.update('Cleared')(draftOf('Ada'))).state
    expect(draft.update(title('Ada', 'Ada L'))(cleared)).toBe(reject)
    expect(stepped(draft.update(title('', 'B'))(cleared)).state.title).toBe('B')
  })

  test('goes to its own input, and leaves the others as they are', () => {
    const state = draftOf('Ada')
    expect(stepped(draft.update(level(50, 80))(state)).state).toEqual({ ...state, level: 80 })
  })

  test('is rejected where the input is not in the state', () => {
    type Page = Readonly<{ search: Opt.Option<string> }>
    const page = composition<{ state: Page }>()
    const program = page.compose({
      init: () => ({ state: { search: Opt.none() } }),
      inputs: { Search: page.input({ at: Optic.id<Page>().key('search').compose(Optic.some()) }) },
      makeModel: (state) => state,
    })
    const written = { _tag: 'Search' as const, message: { _tag: 'Written' as const, was: '', value: 'a' } }
    expect(program.update(written)({ search: Opt.none() })).toBe(reject)
    expect(stepped(program.update(written)({ search: Opt.some('') })).state).toEqual({ search: Opt.some('a') })
  })

  test('compares the value it was written over by Equal, whatever it is made of', () => {
    type Tags = Readonly<{ tags: ReadonlyArray<string> }>
    const tags = composition<{ state: Tags }>()
    const program = tags.compose({
      init: () => ({ state: { tags: [] } }),
      inputs: { Tags: tags.input({ at: Optic.id<Tags>().key('tags') }) },
      makeModel: (state) => state,
    })
    const held: Tags = { tags: ['a', 'b'] }
    const over = (was: ReadonlyArray<string>, value: ReadonlyArray<string>) =>
      program.update({ _tag: 'Tags', message: { _tag: 'Written', was, value } })(held)
    expect(stepped(over(['a', 'b'], ['a', 'b', 'c'])).state).toEqual({ tags: ['a', 'b', 'c'] })
    // An equal copy of the value held leaves the very value held.
    expect(stepped(over(['a', 'b'], ['a', 'b'])).state).toBe(held)
    expect(over(['b', 'a'], ['c'])).toBe(reject)
  })
})

describe('a step of the program', () => {
  test('leaves an input as it wrote it: the state stored is the state written', () => {
    fc.assert(fc.property(drafts, (state) => {
      fc.pre(state.title !== '')
      expect(stepped(draft.update('Cleared')(state)).state).toEqual({ ...state, title: '', before: Opt.some(state) })
    }))
    const state = draftOf('Ada')
    expect(stepped(draft.update('Opened')(state)).state.title).toBe(state.title)
    expect(stepped(draft.update('Touched')(state)).state).toBe(state)
  })

  test('of a child, or of what the parent makes of its event, is stored as written too', () => {
    type Button = Readonly<{ pressed: number }>
    const button = {
      init: { state: { pressed: 0 } },
      update: (_: 'Pressed') => (state: Button): Step<Button, never, 'Reset'> => ({
        state: { pressed: state.pressed + 1 },
        events: ['Reset'],
      }),
      makeModel: (state: Button) => state,
    }
    type Form = Readonly<{ name: string; reset: Button }>
    const form = composition<{ state: Form; event: 'Reset' }>()
    const program = form.compose({
      init: (children) => ({ state: { name: '', reset: children.Reset.init.state } }),
      children: { Reset: form.child(button, { at: Optic.id<Form>().key('reset') }) },
      inputs: { Name: form.input({ at: Optic.id<Form>().key('name') }) },
      onEvent: { Reset: (event) => (state) => ({ state: { ...state, name: '' }, events: [event] }) },
      makeModel: (state) => state,
    })
    const result = program.update({ _tag: 'Reset', message: 'Pressed' })({ name: 'Ada', reset: { pressed: 0 } })
    expect(result).toEqual({ state: { name: '', reset: { pressed: 1 } }, commands: [], events: ['Reset'] })
    expect(
      program.update({ _tag: 'Name', message: { _tag: 'Written', was: 'Ada', value: 'Ada L' } })(stepped(result).state),
    ).toBe(reject)
  })

  test('that puts a subscription\'s value into an input rejects what was typed over the value before', () => {
    type Note = Readonly<{ text: string }>
    const note = composition<{ state: Note }>()
    const program = note.compose({
      init: () => ({ state: { text: '' } }),
      inputs: { Text: note.input({ at: Optic.id<Note>().key('text') }) },
      update: (message: Readonly<{ _tag: 'Dictated'; text: string }>) => (state) => ({
        state: { text: `${state.text}${message.text}` },
      }),
      makeModel: (state) => state.text,
    })
    const dictated = stepped(program.update({ _tag: 'Dictated', text: 'lo' })({ text: 'Hel' }))
    expect(dictated.state).toEqual({ text: 'Hello' })
    expect(
      program.update({ _tag: 'Text', message: { _tag: 'Written', was: 'Hel', value: 'Help' } })(dictated.state),
    ).toBe(reject)
    expect(
      program.update({ _tag: 'Text', message: { _tag: 'Written', was: 'Hello', value: 'Hello!' } })(dictated.state),
    ).not.toBe(reject)
  })
})

describe('an input among the subscriptions', () => {
  type Ticks = Readonly<{ ticks: number }>
  const ticking: Program<{ state: Ticks; model: number; message: 'Tick' }> = {
    init: { state: { ticks: 0 } },
    update: () => ({ ticks }) => ({ state: { ticks: ticks + 1 } }),
    subscriptions: () => HashMap.make(['ticks', idle<'Tick'>()]),
    makeModel: ({ ticks }) => ticks,
  }
  type Page = Readonly<{ name: string; ticking: Ticks }>
  const onPage = Optic.id<Page>()
  const pages = composition<{ state: Page }>()
  const page = pages.compose({
    init: (children) => ({ state: { name: '', ticking: children.Ticking.init.state } }),
    children: { Ticking: pages.child(ticking, { at: onPage.key('ticking') }) },
    inputs: { Name: pages.input({ at: onPage.key('name') }) },
    subscriptions: () => HashMap.make(['own', idle<never>()]),
    makeModel: (state) => state.name,
  })

  test('lifts no key: the program keeps its own and its children\'s, and none is under the input\'s name', () => {
    const keys = subscriptionsOf(page)({ name: 'Ada', ticking: { ticks: 0 } })
    expect(HashMap.size(keys)).toBe(2)
    expect(HashMap.has(keys, 'own')).toBe(true)
    expect(HashMap.has(keys, ['Ticking', 'ticks'])).toBe(true)
  })

  test('a write into it keeps every subscription the same object, the children\'s lifted ones included', () => {
    const before: Page = { name: '', ticking: { ticks: 0 } }
    const written = stepped(
      page.update({ _tag: 'Name', message: { _tag: 'Written', was: before.name, value: 'Ada' } })(before),
    )
    expect(written.state.ticking).toBe(before.ticking)
    const lifted = (state: Page) => Opt.getOrThrow(HashMap.get(subscriptionsOf(page)(state), ['Ticking', 'ticks']))
    expect(lifted(written.state)).toBe(lifted(before))
  })
})

// A desk whose draft is sent, kept and brought back, and drafts by id, where an id leaves and comes back. Each history
// ends with a key typed into the input of a frame drawn before the desk replaced the draft: it is rejected from the
// state and the message alone, since the place no longer holds what the key was typed over.
describe('a key typed into an input its parent has since replaced', () => {
  type Sent = Readonly<{ _tag: 'Sent'; text: string }>
  type Text = Readonly<{ text: string }>
  const text = composition<{ state: Text; event: Sent }>()
  const textDraft = text.compose({
    init: () => ({ state: { text: '' } }),
    inputs: { Text: text.input({ at: Optic.id<Text>().key('text') }) },
    update: (message: 'SendClicked' | 'DiscardClicked') => (state) =>
      message === 'DiscardClicked'
        ? { state: { text: '' } }
        : state.text === ''
        ? reject
        : { state, events: [{ _tag: 'Sent', text: state.text }] },
    makeModel: (state) => state.text,
  })
  type DeskOwn =
    | Readonly<{ _tag: 'Kept' }>
    | Readonly<{ _tag: 'Undone' }>
    | Readonly<{ _tag: 'RowAdded'; id: number }>
    | Readonly<{ _tag: 'RowRemoved'; id: number }>
  type Desk = Readonly<{
    draft: Text
    kept: Opt.Option<Text>
    rows: ReadonlyArray<Readonly<{ id: number; draft: Text }>>
    sent: ReadonlyArray<string>
  }>
  const deskOf = composition<{ state: Desk }>()
  const rowAt = (state: Desk, id: number) =>
    Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.draft)
  const desk = deskOf.compose({
    init: (children) => ({ state: { draft: children.Draft.init.state, kept: Opt.none(), rows: [], sent: [] } }),
    children: {
      Draft: deskOf.child(textDraft, { at: Optic.id<Desk>().key('draft') }),
      Row: deskOf.childById(textDraft, {
        get: rowAt,
        set: (state, id, draft) => ({
          ...state,
          rows: Arr.map(state.rows, (row) => row.id === id ? { id, draft } : row),
        }),
        subscribed: (state) => Arr.map(state.rows, ({ id, draft }) => [id, draft] as const),
      }),
    },
    update: (message: DeskOwn, children) => (state) => {
      switch (message._tag) {
        case 'Kept':
          return { state: { ...state, kept: Opt.some(state.draft) } }
        case 'Undone':
          return Opt.match(state.kept, {
            onNone: () => reject,
            onSome: (draft) => ({ state: { ...state, draft, kept: Opt.none() } }),
          })
        case 'RowAdded':
          return { state: { ...state, rows: [...state.rows, { id: message.id, draft: children.Row.init(message.id).state }] } }
        case 'RowRemoved':
          return { state: { ...state, rows: Arr.filter(state.rows, (row) => row.id !== message.id) } }
      }
    },
    onEvent: {
      // Sent, the draft is started again: the state its parent puts back is the one it starts with.
      Draft: (event, children) => (state) => ({
        state: { ...state, draft: children.Draft.init.state, sent: [...state.sent, event.text] },
      }),
      Row: () => (state) => ({ state }),
    },
    makeModel: (state, children) => ({
      draft: children.Draft(state),
      rows: Arr.map(state.rows, ({ id }) => ({ id, text: children.Row(state, id) })),
    }),
  })
  type DeskMessage = MessageOf<typeof desk>
  type DeskModel = ReturnType<typeof desk.makeModel>
  const typing = (model: DeskModel, value: string, id?: number): DeskMessage =>
    id === undefined
      ? { _tag: 'Draft', message: { _tag: 'Text', message: { _tag: 'Written', was: model.draft, value } } }
      : {
        _tag: 'Row',
        id,
        message: {
          _tag: 'Text',
          message: {
            _tag: 'Written',
            was: Opt.getOrThrow(Arr.findFirst(model.rows, (row) => row.id === id)).text,
            value,
          },
        },
      }
  const after = (messages: ReadonlyArray<DeskMessage>, from: Desk = desk.init.state): Desk =>
    messages.reduce((state, message) => stepped(desk.update(message)(state)).state, from)
  const textOf = (state: Desk, id?: number) => (id === undefined ? state.draft : Opt.getOrThrow(rowAt(state, id))).text

  test('a text typed into the input on screen is stored', () => {
    const typedOnce = after([typing(desk.makeModel(desk.init.state), 'hel')])
    expect(textOf(after([typing(desk.makeModel(typedOnce), 'hello')], typedOnce))).toBe('hello')
  })

  test('typed before the desk started the draft again, it is rejected by the new draft', () => {
    const typedInto = after([typing(desk.makeModel(desk.init.state), 'hello')])
    const onScreen = desk.makeModel(typedInto)
    const sent = after([{ _tag: 'Draft', message: 'SendClicked' }], typedInto)
    expect(sent).toEqual({ ...desk.init.state, sent: ['hello'] })
    expect(desk.update(typing(onScreen, 'hello!'))(sent)).toBe(reject)
  })

  test('typed before the desk brought a kept draft back, it is rejected by the draft brought back', () => {
    const kept = after([typing(desk.makeModel(desk.init.state), 'Ada'), { _tag: 'Kept' }])
    const typedInto = after([typing(desk.makeModel(kept), 'Adam')], kept)
    const onScreen = desk.makeModel(typedInto)
    const undone = after([{ _tag: 'Draft', message: 'DiscardClicked' }, { _tag: 'Undone' }], typedInto)
    expect(textOf(undone)).toBe('Ada')
    expect(desk.update(typing(onScreen, 'Adamx'))(undone)).toBe(reject)
  })

  test('typed into a row, it is rejected by another row that came to its id', () => {
    const added = after([{ _tag: 'RowAdded', id: 1 }])
    const typedInto = after([typing(desk.makeModel(added), 'a', 1)], added)
    const onScreen = desk.makeModel(typedInto)
    const back = after([{ _tag: 'RowRemoved', id: 1 }, { _tag: 'RowAdded', id: 1 }], typedInto)
    expect(textOf(back, 1)).toBe('')
    expect(desk.update(typing(onScreen, 'ab', 1))(back)).toBe(reject)
  })

  // The two limits of a design where a message names a place, which the guide declares: neither corrupts the state.
  test('a write over a value that came back is stored, as what the user typed over what they saw', () => {
    const typedInto = after([typing(desk.makeModel(desk.init.state), 'hello')])
    const onScreen = desk.makeModel(desk.init.state)
    const sent = after([{ _tag: 'Draft', message: 'SendClicked' }], typedInto)
    // The draft holds '' again, the value the old frame's input was typed over.
    expect(textOf(after([typing(onScreen, 'h')], sent))).toBe('h')
  })

  test('a fixed message drawn for the old draft reaches the new one, and update decides', () => {
    const typedInto = after([typing(desk.makeModel(desk.init.state), 'hello')])
    const sent = after([{ _tag: 'Draft', message: 'SendClicked' }], typedInto)
    expect(desk.update({ _tag: 'Draft', message: 'SendClicked' })(sent)).toBe(reject)
    expect(after([{ _tag: 'Draft', message: 'DiscardClicked' }], sent)).toEqual(sent)
  })
})

describe('an input in a child by id', () => {
  type Note = Readonly<{ text: string }>
  const note = composition<{ state: Note }>()
  const noteProgram = note.compose({
    init: () => ({ state: { text: '' } }),
    inputs: { Text: note.input({ at: Optic.id<Note>().key('text') }) },
    makeModel: (state) => state,
  })
  type Notes = Readonly<{ notes: ReadonlyArray<Readonly<{ id: number; note: Note }>> }>
  const notes = composition<{ state: Notes }>()
  const program = notes.compose({
    init: () => ({ state: { notes: [] } }),
    children: {
      Note: notes.childById(noteProgram, {
        get: (state, id: number) =>
          Opt.map(Arr.findFirst(state.notes, (entry) => entry.id === id), (entry) => entry.note),
        set: (state, id, note) => ({ notes: Arr.map(state.notes, (entry) => entry.id === id ? { id, note } : entry) }),
        subscribed: () => [],
      }),
    },
    makeModel: (state, children) => Arr.map(state.notes, ({ id }) => ({ id, note: children.Note(state, id) })),
  })
  type NotesMessage = MessageOf<typeof program>
  const typing = (id: number, was: string, text: string): NotesMessage => ({
    _tag: 'Note',
    id,
    message: { _tag: 'Text', message: { _tag: 'Written', was, value: text } },
  })
  const state: Notes = { notes: [{ id: 1, note: { text: 'a' } }, { id: 2, note: { text: 'b' } }] }

  test('is written into through the child\'s place, and no other note changes', () => {
    expect(program.update(typing(2, 'b', 'bc'))(state)).toEqual({
      state: { notes: [{ id: 1, note: { text: 'a' } }, { id: 2, note: { text: 'bc' } }] },
      commands: [],
      events: [],
    })
  })

  test('rejects what was written over another text, and what was written into a note that is gone', () => {
    expect(program.update(typing(2, 'a', 'ac'))(state)).toBe(reject)
    expect(program.update(typing(3, '', 'c'))(state)).toBe(reject)
  })

  test('has a dispatch of its own, made from its note\'s', () => {
    const sent: Array<NotesMessage> = []
    const dispatch: Dispatch<NotesMessage> = (message) => Effect.sync(() => sent.push(message))
    const toText: Dispatch<Written<string>> = forwardTo(forwardTo(dispatch, 'Note', 2), 'Text')
    expect(Effect.runSync(toText({ _tag: 'Written', was: 'b', value: 'bc' }))).toBe(1)
    expect(sent).toEqual([typing(2, 'b', 'bc')])
  })
})

describe('an input by id', () => {
  // Rows in a record by id, which Effect's own `at` reaches.
  type Sheet = Readonly<{ title: string; counts: Readonly<Record<string, string>> }>
  type Own = Readonly<{ _tag: 'Removed'; id: string }> | Readonly<{ _tag: 'Added'; id: string; count: string }>
  const sheet = Optic.id<Sheet>()
  const sheets = composition<{ state: Sheet }>()
  const program = sheets.compose({
    init: () => ({ state: { title: '', counts: { a: '1', b: '2' } } }),
    inputs: {
      Title: sheets.input({ at: sheet.key('title') }),
      Count: sheets.inputById({ at: (id: string) => sheet.key('counts').at(id) }),
    },
    update: (message: Own) => (state) => ({
      state: {
        ...state,
        counts: message._tag === 'Added'
          ? { ...state.counts, [message.id]: message.count }
          : Object.fromEntries(Object.entries(state.counts).filter(([id]) => id !== message.id)),
      },
    }),
    makeModel: (state) => state,
  })
  type SheetMessage = MessageOf<typeof program>
  const count = (id: string, was: string, value: string): SheetMessage => ({
    _tag: 'Count',
    id,
    message: { _tag: 'Written', was, value },
  })
  const start = program.init.state
  const after = (state: Sheet, message: SheetMessage) => stepped(program.update(message)(state)).state

  test('stores a write at its id, and leaves the other rows and inputs as they are', () => {
    expect(program.update(count('b', '2', '25'))(start)).toEqual({
      state: { title: '', counts: { a: '1', b: '25' } },
      commands: [],
      events: [],
    })
  })

  test('rejects a write at an id the state does not hold, and one over another value than its row holds', () => {
    expect(program.update(count('c', '', '3'))(start)).toBe(reject)
    expect(program.update(count('b', '1', '15'))(start)).toBe(reject)
  })

  test('rejects a late write by another row that came to its id, unless that row holds the value written over', () => {
    const gone = after(start, { _tag: 'Removed', id: 'b' })
    expect(program.update(count('b', '2', '25'))(gone)).toBe(reject)
    const other = after(gone, { _tag: 'Added', id: 'b', count: '9' })
    expect(program.update(count('b', '2', '25'))(other)).toBe(reject)
    const same = after(gone, { _tag: 'Added', id: 'b', count: '2' })
    expect(after(same, count('b', '2', '25'))).toEqual({ title: '', counts: { a: '1', b: '25' } })
  })

  test('has a dispatch for each id, which names it', () => {
    const sent: Array<SheetMessage> = []
    const dispatch: Dispatch<SheetMessage> = (message) => Effect.sync(() => sent.push(message))
    const toB: Dispatch<Written<string>> = forwardTo(dispatch, 'Count', 'b')
    expect(Effect.runSync(toB({ _tag: 'Written', was: '2', value: '25' }))).toBe(1)
    expect(sent).toEqual([count('b', '2', '25')])
  })

  test('the types: a write names its id, of the type its place takes, and an input alone takes none', () => {
    const dispatch: Dispatch<SheetMessage> = () => Effect.succeed(0)
    // @ts-expect-error: an input by id is written at an id.
    forwardTo(dispatch, 'Count')
    // @ts-expect-error: the id is a string.
    forwardTo(dispatch, 'Count', 1)
    // @ts-expect-error: an input alone takes no id.
    forwardTo(dispatch, 'Title', 'a')
    // @ts-expect-error: a write into an input by id names its id.
    const unnamed: SheetMessage = { _tag: 'Count', message: { _tag: 'Written', was: '2', value: '25' } }
    // @ts-expect-error: a count holds a string.
    const mistyped: SheetMessage = { _tag: 'Count', id: 'b', message: { _tag: 'Written', was: 2, value: 25 } }
    expect([unnamed, mistyped]).toHaveLength(2)
  })
})

describe('inputs at get and set, alone and by id', () => {
  // Rows in an array, found by their id, as `childById` finds its children.
  type Row = Readonly<{ id: number; count: string }>
  type Sheet = Readonly<{ title: string; rows: ReadonlyArray<Row> }>
  const sheets = composition<{ state: Sheet }>()
  const rowAt = (state: Sheet, id: number) =>
    Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.count)
  const program = sheets.compose({
    init: () => ({ state: { title: '', rows: [{ id: 1, count: '1' }, { id: 2, count: '2' }] } }),
    inputs: {
      Title: sheets.input({ get: (state) => Opt.some(state.title), set: (state, title) => ({ ...state, title }) }),
      Count: sheets.inputById({
        get: (state, id: number) => rowAt(state, id),
        set: (state, id, count) => ({ ...state, rows: Arr.map(state.rows, (row) => row.id === id ? { id, count } : row) }),
      }),
    },
    makeModel: (state) => state,
  })
  type SheetMessage = MessageOf<typeof program>
  const written = <A>(was: A, value: A) => ({ _tag: 'Written', was, value }) as const
  const start = program.init.state

  test('an input alone stores a write where get finds the value it was written over, through set', () => {
    expect(stepped(program.update({ _tag: 'Title', message: written('', 'Ada') })(start)).state).toEqual({
      ...start,
      title: 'Ada',
    })
    expect(program.update({ _tag: 'Title', message: written('Eve', 'Ada') })(start)).toBe(reject)
  })

  test('an input by id stores a write at its id through set, and rejects one at an id get does not find', () => {
    expect(stepped(program.update({ _tag: 'Count', id: 2, message: written('2', '25') })(start)).state).toEqual({
      ...start,
      rows: [{ id: 1, count: '1' }, { id: 2, count: '25' }],
    })
    expect(program.update({ _tag: 'Count', id: 3, message: written('', '3') })(start)).toBe(reject)
    expect(program.update({ _tag: 'Count', id: 2, message: written('1', '15') })(start)).toBe(reject)
  })

  test('the types: get, set and the id are typed from the state and the id get takes, without annotations', () => {
    sheets.compose({
      init: () => ({ state: start }),
      inputs: {
        Title: sheets.input({
          get: (state) => Opt.some(state.title),
          set: (state, title) => {
            // @ts-expect-error: the value is the title, a string.
            const wrong: number = title
            void wrong
            return state
          },
        }),
        Count: sheets.inputById({
          get: (state, id: number) => rowAt(state, id),
          set: (state, id, count) => {
            // @ts-expect-error: the id is the number get takes.
            const wrongId: string = id
            // @ts-expect-error: the value is the count, a string.
            const wrongCount: number = count
            void wrongId
            void wrongCount
            return state
          },
        }),
      },
      makeModel: (state) => state,
    })
    // @ts-expect-error: a write at an id names one of the type get takes.
    const mistyped: SheetMessage = { _tag: 'Count', id: '2', message: written('2', '25') }
    expect(mistyped).toBeDefined()
  })
})

describe('the tools of the model', () => {
  // What a model holds is what the program fixes: no value is drawn, and what is written is asked of nothing.
  test('judge a step that empties an input as any message: on an empty one it changes nothing, so it does not act twice', () => {
    const always = compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: input({ at: here.key('title') }) },
      update: (_: 'Cleared') => (state) => ({ state: { ...state, title: '' } }),
      makeModel: (state) => state,
    })
    expect(dispatchViolations(always.update)(draftOf('Ada'), ['Cleared'])).toEqual([])
    expect(dispatchViolations(draft.update)(draftOf('Ada'), ['Cleared'], ['Cleared'])).toEqual([])
  })
})

// What a bridge asks of the library for each element that shows an input: `edited` when the user edits it, `drawn`
// when a frame is drawn. `sent` numbers stand for what the run's dispatch returned.
describe('what an element on screen holds of an input', () => {
  const made = (value: string) => drawn(undefined, value, 0).shown
  const typing = (held: Shown<string>, value: string, sent: number) => edited(held, value).sent(sent)

  test('a new element takes the frame\'s very value', () => {
    const value = { text: 'a' }
    const { shown, taken } = drawn(undefined, value, 3)
    expect(shown.value).toBe(value)
    expect(taken).toBe(true)
  })

  test('edited, the write names what the element showed, as the element records it', () => {
    fc.assert(fc.property(fc.string(), fc.array(fc.string(), { minLength: 1 }), (start, keys) => {
      let held = made(start)
      keys.forEach((key, index) => {
        const { write: written, sent } = edited(held, key)
        expect(written).toEqual({ _tag: 'Written', was: held.value, value: key })
        const next = sent(index + 1)
        expect(next.value).toBe(key)
        // A frame that has seen none of the writes and holds the start leaves the element as it is.
        expect(drawn(next, start, 0)).toEqual({ shown: next, taken: false })
        held = next
      })
    }))
  })

  test('a frame older than the keys typed since leaves the element as it is', () => {
    const element = typing(typing(made(''), 'a', 4), 'ab', 5)
    // The frame has seen neither key, then the first alone: each time it holds what the element showed before the
    // first key the frame has not seen.
    expect(drawn(element, '', 3)).toEqual({ shown: element, taken: false })
    const later = drawn(element, 'a', 4)
    expect(later.shown.value).toBe('ab')
    expect(later.taken).toBe(false)
    // The key it has seen is forgotten: a frame that holds '' from now on is no longer its past.
    expect(drawn(later.shown, '', 4)).toMatchObject({ shown: { value: '' }, taken: true })
  })

  test('a frame that has seen every key and holds what the element shows leaves it as it is', () => {
    const element = typing(made(''), 'a', 4)
    const settled = drawn(element, 'a', 4)
    expect(settled).toMatchObject({ shown: { value: 'a' }, taken: false })
    expect(drawn(settled.shown, '', 3)).toMatchObject({ shown: { value: '' }, taken: true })
  })

  test('a frame that has seen every key and holds another value gives the element that value', () => {
    // The program emptied the input after the key: the element takes the empty text.
    expect(drawn(typing(made(''), 'a', 4), '', 5)).toMatchObject({ shown: { value: '' }, taken: true })
  })

  test('a frame that holds neither the element\'s past nor its present gives the element its value at once', () => {
    // The key was typed over 'a', and the frame, which has not seen it, holds '': the key will be rejected.
    expect(drawn(typing(made('a'), 'ab', 4), '', 3)).toMatchObject({ shown: { value: '' }, taken: true })
  })

  test('a frame of a state brought back to one the element has left gives the element its value', () => {
    // An undo brought 'a' back after the element's two keys were stored: the frame has seen both.
    expect(drawn(typing(typing(made(''), 'a', 4), 'ab', 5), 'a', 7)).toMatchObject({
      shown: { value: 'a' },
      taken: true,
    })
  })

  test('a frame of a state that moved on to the very value the element shows does not write it again', () => {
    // The key 'a' was typed over '', and the frame, which has not seen it, holds 'a' from elsewhere: the key will be
    // rejected, and the element already shows what the frame holds.
    const element = typing(made(''), 'a', 4)
    const { shown, taken } = drawn(element, 'a', 3)
    expect(shown).not.toBe(element)
    expect(shown.value).toBe('a')
    expect(taken).toBe(false)
  })

  // "The very value" is `Object.is`, not `===`: `NaN` is the very value of itself, and `0` is not that of `-0`.
  test('a frame of a state that moved on to NaN, the very value the element shows, does not write it again', () => {
    const element = edited(drawn(undefined, 5, 0).shown, NaN).sent(4)
    expect(drawn(element, NaN, 3)).toMatchObject({ shown: { value: NaN }, taken: false })
  })

  test('a frame of a state that moved on to 0, where the element shows -0, gives the element its value', () => {
    const element = edited(drawn(undefined, 5, 0).shown, -0).sent(4)
    const { shown, taken } = drawn(element, 0, 3)
    expect(Object.is(shown.value, 0)).toBe(true)
    expect(taken).toBe(true)
  })

  test('an element that stays is not taken, though the frame holds an equal copy', () => {
    const element = drawn(undefined, { tags: ['a'] }, 0).shown
    expect(drawn(element, { tags: ['a'] }, 1)).toEqual({ shown: element, taken: false })
    // The frame has not seen the write, and holds a copy of what the element showed before it: the element keeps
    // what it shows.
    const later = edited(element, { tags: ['a', 'b'] }).sent(2)
    expect(drawn(later, { tags: ['a'] }, 1)).toMatchObject({ shown: { value: { tags: ['a', 'b'] } }, taken: false })
  })

  test('compares the frame by Equal, so that a copy of what the element showed keeps it', () => {
    const element = edited(drawn(undefined, ['a'], 0).shown, ['a', 'b']).sent(1)
    expect(drawn(element, ['a'], 0)).toEqual({ shown: element, taken: false })
    expect(drawn(element, ['b'], 0)).toMatchObject({ shown: { value: ['b'] }, taken: true })
  })
})

describe('the types of an input', () => {
  test('a write is of the value its place holds, and goes to the name of its input', () => {
    // @ts-expect-error: the level holds a number.
    level(50, 'loud')
    // @ts-expect-error: a text is not written into the level.
    const wrong: Message = { _tag: 'Level', message: { _tag: 'Written', was: 'Ada', value: 'Ada L' } }
    // @ts-expect-error: the draft has no such input.
    const missing: Message = { _tag: 'Body', message: { _tag: 'Written', was: 'Ada', value: 'Ada L' } }
    expect([wrong, missing]).toHaveLength(2)
  })

  test('an optic into another state than the program\'s is no input of it, alone or by id', () => {
    type Other = Readonly<{ title: string; titles: Readonly<Record<string, string>> }>
    const other = Optic.id<Other>()
    compose({
      init: () => ({ state: draftOf('') }),
      inputs: {
        // @ts-expect-error: the optic is into another state.
        Title: input({ at: other.key('title') }),
      },
      makeModel: (state) => state,
    })
    compose({
      init: () => ({ state: draftOf('') }),
      inputs: {
        // @ts-expect-error: the optic of each id is into another state.
        Titles: inputById({ at: (id: string) => other.key('titles').at(id) }),
      },
      makeModel: (state) => state,
    })
  })

  test('an own message that takes the name of an input does not compile', () => {
    // @ts-expect-error: it would be routed to the input.
    compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: input({ at: here.key('title') }) },
      update: (_: Readonly<{ _tag: 'Title' }>) => (state) => ({ state }),
      makeModel: (state) => state,
    })
  })

  test('a subscription of the program\'s own cannot write into an input: it sends the program\'s own messages', () => {
    compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: input({ at: here.key('title') }) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Dictated') => (state: Draft) => ({ state }),
      // @ts-expect-error: what is written into an input is no own message
      subscriptions: () => HashMap.make(['dictation', idle<Extract<Message, { _tag: 'Title' }>>()]),
      makeModel: () => null,
    })
  })

  test('a command\'s answer cannot write into an input: it is an own message or a child\'s', () => {
    const saving = composition<{ state: Draft; command: 'Load' }>()
    saving.compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: saving.input({ at: here.key('title') }) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Loaded') => (state: Draft) => ({ state, commands: ['Load' as const] }),
      runCommand: () =>
        // @ts-expect-error: the answer would write into the input, over the value the command started with
        Effect.succeedSome({ _tag: 'Title' as const, message: { _tag: 'Written' as const, was: '', value: 'Ada' } }),
      makeModel: () => null,
    })
    saving.compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: saving.input({ at: here.key('title') }) },
      update: (_: 'Loaded') => (state: Draft) => ({ state, commands: ['Load' as const] }),
      runCommand: () => Effect.succeedSome('Loaded' as const),
      makeModel: () => null,
    })
  })

  test('a command\'s answer cannot write into a child\'s input either', () => {
    type Note = Readonly<{ text: string }>
    const note = composition<{ state: Note }>()
    const noteProgram = note.compose({
      init: () => ({ state: { text: '' } }),
      inputs: { Text: note.input({ at: Optic.id<Note>().key('text') }) },
      makeModel: (state) => state,
    })
    type Board = Readonly<{ note: Note }>
    const board = composition<{ state: Board; command: 'Load' }>()
    const written = {
      _tag: 'Note' as const,
      message: { _tag: 'Text' as const, message: { _tag: 'Written' as const, was: '', value: 'Ada' } },
    }
    board.compose({
      init: (children) => ({ state: { note: children.Note.init.state } }),
      children: { Note: board.child(noteProgram, { at: Optic.id<Board>().key('note') }) },
      // The state annotated, so that the own messages are inferred from `update` alone.
      update: (_: 'Loaded') => (state: Board) => ({ state, commands: ['Load' as const] }),
      // @ts-expect-error: the answer would write into the child's input, over the value the command started with
      runCommand: () => Effect.succeedSome(written),
      makeModel: () => null,
    })
  })

  test('the element a bridge holds shows its value, and keeps the rest to the library', () => {
    const element = drawn(undefined, 'a', 0).shown
    expect(element.value).toBe('a')
    // @ts-expect-error: what the element sent that no frame has seen is not for a bridge to read.
    expect(element.unseen).toBeUndefined()
    // @ts-expect-error: an element is made by `drawn` and `edited`, not by hand.
    const byHand: Shown<string> = { value: 'a' }
    expect(byHand.value).toBe('a')
  })
})
