// The semantics of an input, as pure pieces: what `update` makes of what is written into one, and of a step of the
// program that replaces one, by value. Nothing here runs.
import { describe, expect, test } from 'bun:test'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as fc from 'fast-check'
import { composition } from './compose.ts'
import { type Dispatch, dispatchTo } from './dispatch.ts'
import { type Field, field, renewed, write, type Written } from './input.ts'
import type { MessageOf } from './program.ts'
import { dispatchViolations } from './testing/dispatch-violations.ts'
import { isRejected, raise, reject, type Step, type Transition } from './update.ts'

// A draft with a title and a level, which the outside writes into, and what the program does with them: it clears
// the title, takes back the state it had, and mutes the level.
type Draft = Readonly<{ title: Field<string>; level: Field<number>; before: Opt.Option<Draft>; opened: number }>

type Own = 'Cleared' | 'Undone' | 'Muted' | 'Opened' | 'Touched'

const draftOf = (title: string, level = 50): Draft => ({
  title: field(title),
  level: field(level),
  before: Opt.none(),
  opened: 0,
})

const here = Optic.id<Draft>()

const { input, compose } = composition<{ state: Draft }>()

const draft = compose({
  init: () => ({ state: draftOf('') }),
  inputs: { Title: input(here.key('title')), Level: input(here.key('level')) },
  update: (message: Own) => (state) => {
    switch (message) {
      case 'Cleared':
        return state.title.value === '' ? reject : { state: { ...state, title: field(''), before: Opt.some(state) } }
      // The whole state it had, its fields included, as they were.
      case 'Undone':
        return Opt.match(state.before, { onNone: () => reject, onSome: (before) => ({ state: before }) })
      // Written by hand, with a revision of the program's own choosing.
      case 'Muted':
        return { state: { ...state, level: { value: 0, revision: 0 } } }
      case 'Opened':
        return { state: { ...state, opened: state.opened + 1 } }
      case 'Touched':
        return { state }
    }
  },
  makeModel: (state) => ({ title: state.title, level: state.level }),
})

type Message = MessageOf<typeof draft>

const title = (into: Field<string>, text: string): Message => ({ _tag: 'Title', message: write(into, text) })

const level = (into: Field<number>, value: number): Message => ({ _tag: 'Level', message: write(into, value) })

const stepOf = (message: Message, state: Draft): Step<Draft> => {
  const result = draft.update(message)(state)
  if (isRejected(result)) throw new Error('rejected')
  return result
}

const drafts = fc.record({
  title: fc.record({ value: fc.string(), revision: fc.nat() }),
  level: fc.record({ value: fc.integer(), revision: fc.nat() }),
  before: fc.constant(Opt.none<Draft>()),
  opened: fc.nat(),
})

describe('what is written into an input', () => {
  test('is stored, whatever it is, at the revision of the field it was written into', () => {
    fc.assert(fc.property(drafts, fc.string(), fc.integer(), (state, text, value) => {
      const typed = stepOf(title(state.title, text), state).state
      expect(typed).toEqual({ ...state, title: { value: text, revision: state.title.revision } })
      const slid = stepOf(level(state.level, value), state).state
      expect(slid).toEqual({ ...state, level: { value, revision: state.level.revision } })
    }))
  })

  test('leaves the very same state when the field holds it already', () => {
    const state = draftOf('Ada')
    expect(stepOf(title(state.title, 'Ada'), state).state).toBe(state)
  })

  test('is rejected once the program has replaced the field it was written into', () => {
    const drawn = draftOf('Ada')
    const cleared = stepOf('Cleared', drawn).state
    expect(cleared.title).toEqual({ value: '', revision: 1 })
    expect(isRejected(draft.update(title(drawn.title, 'Ada L'))(cleared))).toBe(true)
    // Into the field the new state holds, it is stored.
    expect(stepOf(title(cleared.title, 'B'), cleared).state.title).toEqual({ value: 'B', revision: 1 })
  })

  test('goes to its own input, and leaves the others as they are', () => {
    const state = draftOf('Ada')
    const slid = stepOf(level(state.level, 80), state).state
    expect(slid.title).toBe(state.title)
    expect(slid.level).toEqual({ value: 80, revision: 0 })
  })

  test('is rejected where the input is not in the state', () => {
    type Page = Readonly<{ search: Opt.Option<Field<string>> }>
    const page = composition<{ state: Page }>()
    const program = page.compose({
      init: () => ({ state: { search: Opt.none() } }),
      inputs: { Search: page.input(Optic.id<Page>().key('search').compose(Optic.some())) },
      makeModel: (state) => state,
    })
    const written = { _tag: 'Search' as const, message: write(field(''), 'a') }
    expect(isRejected(program.update(written)({ search: Opt.none() }))).toBe(true)
    expect(program.update(written)({ search: Opt.some(field('')) })).toMatchObject({
      state: { search: Opt.some({ value: 'a', revision: 0 }) },
    })
  })
})

describe('a step of the program', () => {
  test('that leaves another value in the place of an input replaces it, at the next revision', () => {
    fc.assert(fc.property(drafts, (state) => {
      fc.pre(state.title.value !== '')
      expect(stepOf('Cleared', state).state.title).toEqual({ value: '', revision: state.title.revision + 1 })
    }))
  })

  test('cannot take the revision back: a field written by hand at a lower one is the next one too', () => {
    const state = { ...draftOf('Ada'), level: { value: 70, revision: 4 } }
    expect(stepOf('Muted', state).state.level).toEqual({ value: 0, revision: 5 })
  })

  // What an opaque field cannot stop (docs/registers.md, check 5): a valid field, taken from an earlier state.
  test('cannot bring a revision back: a field of an older state is a new input', () => {
    const drawn = draftOf('Ada')
    const cleared = stepOf('Cleared', drawn).state
    const typedSince = stepOf(title(cleared.title, 'B'), cleared).state
    const undone = stepOf('Undone', typedSince).state
    expect(undone.title).toEqual({ value: 'Ada', revision: 2 })
    // What was typed into the input of the first frame, which showed the same text, no longer applies.
    expect(isRejected(draft.update(title(drawn.title, 'Ada L'))(undone))).toBe(true)
  })

  test('that leaves an input as it found it keeps its field, and one that changes nothing its step', () => {
    const state = draftOf('Ada')
    expect(stepOf('Opened', state).state.title).toBe(state.title)
    expect(stepOf('Opened', state).state.level).toBe(state.level)
    expect(stepOf('Touched', state).state).toBe(state)
  })

  test('of a child, or of what the parent makes of its event, replaces the parent\'s inputs alike', () => {
    type Button = Readonly<{ pressed: number }>
    const button = {
      init: { state: { pressed: 0 } },
      update: (_: 'Pressed') => (state: Button): Step<Button, never, 'Reset'> => ({
        state: { pressed: state.pressed + 1 },
        events: ['Reset'],
      }),
      makeModel: (state: Button) => state,
    }
    type Form = Readonly<{ name: Field<string>; reset: Button }>
    const form = composition<{ state: Form; event: 'Reset' }>()
    const program = form.compose({
      init: (children) => ({ state: { name: field(''), reset: children.Reset.init.state } }),
      children: { Reset: form.child(button, { at: Optic.id<Form>().key('reset') }) },
      inputs: { Name: form.input(Optic.id<Form>().key('name')) },
      onEvent: { Reset: (event) => (state) => raise(event)({ ...state, name: field('') }) },
      makeModel: (state) => state,
    })
    const drawn: Form = { name: field('Ada'), reset: { pressed: 0 } }
    const result = program.update({ _tag: 'Reset', message: 'Pressed' })(drawn)
    expect(result).toEqual({
      state: { name: { value: '', revision: 1 }, reset: { pressed: 1 } },
      commands: [],
      events: ['Reset'],
    })
  })
})

describe('an input in a child by id', () => {
  type Note = Readonly<{ text: Field<string> }>
  const note = composition<{ state: Note }>()
  const noteProgram = note.compose({
    init: () => ({ state: { text: field('') } }),
    inputs: { Text: note.input(Optic.id<Note>().key('text')) },
    update: (_: 'Discarded') => (state) => state.text.value === '' ? reject : { state: { text: field('') } },
    makeModel: (state) => state,
  })
  type Notes = Readonly<{ notes: ReadonlyArray<Readonly<{ id: number; note: Note }>> }>
  const notes = composition<{ state: Notes }>()
  const program = notes.compose({
    init: () => ({ state: { notes: [] } }),
    children: {
      Note: notes.each(noteProgram, {
        get: (state, id: number) =>
          Opt.map(Arr.findFirst(state.notes, (entry) => entry.id === id), (entry) => entry.note),
        set: (state, id, note) => ({ notes: Arr.map(state.notes, (entry) => entry.id === id ? { id, note } : entry) }),
        subscribed: () => [],
      }),
    },
    makeModel: (state, children) => Arr.map(state.notes, ({ id }) => ({ id, note: children.Note(state, id) })),
  })
  type NotesMessage = MessageOf<typeof program>
  const typing = (id: number, into: Field<string>, text: string): NotesMessage => ({
    _tag: 'Note',
    id,
    message: { _tag: 'Text', message: write(into, text) },
  })
  const state: Notes = { notes: [{ id: 1, note: { text: field('a') } }, { id: 2, note: { text: field('b') } }] }

  test('is written into through the child\'s place, and no other note changes', () => {
    const result = program.update(typing(2, field('b'), 'bc'))(state)
    expect(result).toEqual({
      state: { notes: [{ id: 1, note: { text: field('a') } }, { id: 2, note: { text: field('bc') } }] },
      commands: [],
      events: [],
    })
  })

  test('rejects what was written before the note replaced it, and what was written into a note that is gone', () => {
    const discarded = program.update({ _tag: 'Note', id: 2, message: 'Discarded' })(state)
    if (isRejected(discarded)) throw new Error('rejected')
    expect(isRejected(program.update(typing(2, field('b'), 'bc'))(discarded.state))).toBe(true)
    expect(isRejected(program.update(typing(3, field(''), 'c'))(state))).toBe(true)
  })

  test('has a dispatch of its own, made from its note\'s', () => {
    const sent: Array<NotesMessage> = []
    const dispatch: Dispatch<NotesMessage> = (message) => Effect.sync(() => void sent.push(message))
    const toText: Dispatch<Written<string>> = dispatchTo(dispatchTo(dispatch, 'Note', 2), 'Text')
    Effect.runSync(toText(write(field('b'), 'bc')))
    expect(sent).toEqual([typing(2, field('b'), 'bc')])
  })
})

describe('the tools of the model', () => {
  // What a model holds is what the program fixes: no value is drawn, and what is written is asked of nothing.
  test('judge a replacement as any message: by the value held it changes nothing, so it does not act twice', () => {
    const always = compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: input(here.key('title')) },
      update: (_: 'Cleared') => (state) => ({ state: { ...state, title: field('') } }),
      makeModel: (state) => state,
    })
    expect(dispatchViolations(always.update)(draftOf('Ada'), ['Cleared'])).toEqual([])
    expect(dispatchViolations(draft.update)(draftOf('Ada'), ['Cleared'], ['Cleared'])).toEqual([])
  })
})

describe('the types of an input', () => {
  test('a write is of the value its field holds, and goes to the name of its input', () => {
    const state = draftOf('')
    // @ts-expect-error: the level holds a number.
    level(state.level, 'loud')
    // @ts-expect-error: a text is not written into the level.
    const wrong: Message = { _tag: 'Level', message: write(state.title, 'Ada') }
    // @ts-expect-error: the draft has no such input.
    const missing: Message = { _tag: 'Body', message: write(state.title, 'Ada') }
    expect([wrong, missing]).toHaveLength(2)
  })

  test('an own message that takes the name of an input does not compile', () => {
    // @ts-expect-error: it would be routed to the input.
    compose({
      init: () => ({ state: draftOf('') }),
      inputs: { Title: input(here.key('title')) },
      update: (_: Readonly<{ _tag: 'Title' }>) => (state) => ({ state }),
      makeModel: (state) => state,
    })
  })

  test('an input is declared where the state holds a field', () => {
    // @ts-expect-error: a number is no field.
    input(here.key('opened'))
  })
})

type Titled = Readonly<{ title: Field<string>; opened: number }>

type Rebuilt = 'Cleared' | 'Opened' | 'Copied' | 'Decoded' | 'Normalised' | 'Narrowed' | 'Restored'

// The update a program gives to `compose`, as a function of its own.
const own = (message: Rebuilt) => (state: Titled): Transition<Titled> => {
  switch (message) {
    case 'Cleared':
      return state.title.value === '' ? reject : { state: { ...state, title: field('') } }
    case 'Opened':
      return { state: { ...state, opened: state.opened + 1 } }
    // Three steps that leave a state equal by value to the one `Opened` leaves, built another way.
    case 'Copied':
      return { state: { opened: state.opened + 1, title: { ...state.title } } }
    case 'Decoded':
      return { state: JSON.parse(JSON.stringify({ ...state, opened: state.opened + 1 })) as Titled }
    case 'Normalised':
      return { state: { opened: state.opened + 1, title: { ...state.title, value: state.title.value.trim() } } }
    // A new input for the same value, asked for as data.
    case 'Narrowed':
      return { state: { ...state, title: renewed(state.title) } }
    // The value held, in a field of an older revision.
    case 'Restored':
      return { state: { ...state, title: { value: state.title.value, revision: 0 } } }
  }
}

const titled = composition<{ state: Titled }>()

const titledDraft = titled.compose({
  init: () => ({ state: { title: field(''), opened: 0 } }),
  inputs: { Title: titled.input(Optic.id<Titled>().key('title')) },
  update: own,
  makeModel: (state) => state,
})

type TitledMessage = MessageOf<typeof titledDraft>

const typed = (into: Field<string>, text: string): TitledMessage => ({ _tag: 'Title', message: write(into, text) })

const stepped = <S>(result: Transition<S>): Step<S> => {
  if (isRejected(result)) throw new Error('rejected')
  return result
}

const shown: Titled = { title: { value: 'Ada', revision: 3 }, opened: 0 }

describe('the revision, derived by value: the state stored is not the state written', () => {
  test('the update given to compose and the program\'s differ in the revision of an input whose value changed', () => {
    expect(stepped(own('Cleared')(shown)).state.title).toEqual({ value: '', revision: 0 })
    expect(stepped(titledDraft.update('Cleared')(shown)).state.title).toEqual({ value: '', revision: 4 })
  })

  test('a step that asks for the new input itself is stored as written', () => {
    expect(stepped(titledDraft.update('Narrowed')(shown)).state).toEqual(stepped(own('Narrowed')(shown)).state)
  })
})

describe('the revision, derived by value: identity is an optimisation', () => {
  test('the steps are equal by value as the program wrote them', () => {
    const opened = stepped(own('Opened')(shown)).state
    expect(stepped(own('Copied')(shown)).state).toEqual(opened)
    expect(stepped(own('Decoded')(shown)).state).toEqual(opened)
    expect(stepped(own('Normalised')(shown)).state).toEqual(opened)
  })

  test.each(['Copied', 'Decoded', 'Normalised'] as const)(
    'a step that leaves an equal field built anew (%s) leaves the same input, and what is being typed is stored',
    (message) => {
      const opened = stepped(titledDraft.update('Opened')(shown)).state
      const rebuilt = stepped(titledDraft.update(message)(shown)).state
      expect(rebuilt).toEqual(opened)
      // The very field it held, so that a view that skips an unchanged field still does.
      expect(rebuilt.title).toBe(shown.title)
      expect(stepped(titledDraft.update(typed(shown.title, 'Ada L'))(rebuilt)).state.title).toEqual({
        value: 'Ada L',
        revision: 3,
      })
    },
  )

  test('a value compares by Equal, whatever it is made of', () => {
    type Tags = Readonly<{ tags: Field<ReadonlyArray<string>> }>
    const tags = composition<{ state: Tags }>()
    const program = tags.compose({
      init: () => ({ state: { tags: field([]) } }),
      inputs: { Tags: tags.input(Optic.id<Tags>().key('tags')) },
      update: (message: 'Rebuilt' | 'Sorted') => (state) => ({
        state: { tags: field(message === 'Rebuilt' ? [...state.tags.value] : [...state.tags.value].sort()) },
      }),
      makeModel: (state) => state,
    })
    const held: Tags = { tags: { value: ['b', 'a'], revision: 2 } }
    expect(stepped(program.update('Rebuilt')(held)).state.tags).toBe(held.tags)
    expect(stepped(program.update('Sorted')(held)).state.tags).toEqual({ value: ['a', 'b'], revision: 3 })
  })

  test('a new input for the same value is asked for as data, and rejects what was written into the old one', () => {
    const narrowed = stepped(titledDraft.update('Narrowed')(shown)).state
    expect(narrowed.title).toEqual({ value: 'Ada', revision: 4 })
    expect(isRejected(titledDraft.update(typed(shown.title, 'Ada L'))(narrowed))).toBe(true)
  })

  test('a revision never comes back: the value held in a field of an older revision is the same input', () => {
    expect(stepped(titledDraft.update('Restored')(shown)).state.title).toBe(shown.title)
  })

  test('a replacement by the value held changes nothing, so a control always shown does not act twice', () => {
    const always = titled.compose({
      init: () => ({ state: { title: field(''), opened: 0 } }),
      inputs: { Title: titled.input(Optic.id<Titled>().key('title')) },
      update: (_: 'Cleared') => (state) => ({ state: { ...state, title: field('') } }),
      makeModel: (state) => state,
    })
    expect(dispatchViolations(always.update)(shown, ['Cleared'])).toEqual([])
  })
})

describe('the revision, derived by value: where it comes back, which no rule of before and after closes', () => {
  test('init is stored as written: nothing gives its inputs a revision', () => {
    const program = titled.compose({
      init: () => ({ state: { title: { value: '', revision: 7 }, opened: 0 } }),
      inputs: { Title: titled.input(Optic.id<Titled>().key('title')) },
      makeModel: (state) => state,
    })
    expect(program.init).toEqual({ state: { title: { value: '', revision: 7 }, opened: 0 } })
  })

  test('an input at an optional place that goes and comes back restarts, and takes what was typed into the old one', () => {
    type Page = Readonly<{ search: Opt.Option<Field<string>> }>
    const page = composition<{ state: Page }>()
    const program = page.compose({
      init: () => ({ state: { search: Opt.none() } }),
      inputs: { Search: page.input(Optic.id<Page>().key('search').compose(Optic.some())) },
      update: (message: 'Opened' | 'Closed') => (state) =>
        message === 'Opened'
          ? Opt.isSome(state.search) ? reject : { state: { search: Opt.some(field('')) } }
          : Opt.isNone(state.search)
          ? reject
          : { state: { search: Opt.none() } },
      makeModel: (state) => state,
    })
    const old = { value: 'abc', revision: 0 }
    const closed = stepped(program.update('Closed')({ search: Opt.some(old) })).state
    const reopened = stepped(program.update('Opened')(closed)).state
    expect(reopened).toEqual({ search: Opt.some({ value: '', revision: 0 }) })
    const late = program.update({ _tag: 'Search', message: write(old, 'abcd') })(reopened)
    expect(stepped(late).state).toEqual({ search: Opt.some({ value: 'abcd', revision: 0 }) })
  })

  describe('a child its parent starts again', () => {
    type Note = Readonly<{ text: Field<string>; pinned: boolean }>
    const note = composition<{ state: Note }>()
    const noteProgram = note.compose({
      init: () => ({ state: { text: field(''), pinned: false } }),
      inputs: { Text: note.input(Optic.id<Note>().key('text')) },
      update: (_: 'Pinned') => (state) => state.pinned ? reject : { state: { ...state, pinned: true } },
      makeModel: (state) => state,
    })
    type Board = Readonly<{ note: Note }>
    const board = composition<{ state: Board }>()
    const program = board.compose({
      init: (children) => ({ state: { note: children.Note.init.state } }),
      children: { Note: board.child(noteProgram, { at: Optic.id<Board>().key('note') }) },
      update: (_: 'Restarted', children) => () => ({ state: { note: children.Note.init.state } }),
      makeModel: (state) => state,
    })
    const old: Board = { note: { text: { value: 'Ada', revision: 0 }, pinned: false } }
    const restarted = stepped(program.update('Restarted')(old)).state

    test('restarts its inputs at the revision of its init, and takes what was typed into the old one', () => {
      expect(restarted.note.text).toEqual({ value: '', revision: 0 })
      const late = program.update({ _tag: 'Note', message: { _tag: 'Text', message: write(old.note.text, 'Ada x') } })(
        restarted,
      )
      expect(stepped(late).state.note.text).toEqual({ value: 'Ada x', revision: 0 })
    })

    // The class the gap belongs to, as it is on `main`: a message names a child's place, not the child it was shown for.
    test('takes a fixed message shown for the old one too', () => {
      expect(stepped(program.update({ _tag: 'Note', message: 'Pinned' })(restarted)).state.note.pinned).toBe(true)
    })
  })
})
