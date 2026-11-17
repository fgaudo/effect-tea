// A consumer of the packed package, run with Node and typechecked by `smoke.ts` under several TypeScript versions
// and module resolutions. It instantiates the types of `program` (a child, children by id, events and external
// messages, an input, and the rule a bridge calls for the element that shows one), checks that what they reject
// does not compile, and that the declarations of what it exports can be emitted.
import {
  andThen,
  type CommandServicesOf,
  program,
  drawn,
  edited,
  type MessageOf,
  type Program,
  reject,
  run,
  type Shown,
  type SubscriptionServicesOf,
  type Update,
} from '@fgaudo/effect-tea'
import * as Library from '@fgaudo/effect-tea'
import { applyAll, simulate } from '@fgaudo/effect-tea/testing'
import * as Testing from '@fgaudo/effect-tea/testing'
import * as Arr from 'effect/Array'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'

type CounterState = Readonly<{ count: number }>

type Reset = Readonly<{ _tag: 'Reset' }>

type CounterMessage = Readonly<{ _tag: 'Increment' }> | Reset

type Full = Readonly<{ _tag: 'Full' }>

const counterUpdate: Update<CounterState, CounterMessage, never, Full> = (message) => ({ count }) => {
  if (message._tag === 'Reset') return { state: { count: 0 } }
  if (count === 3) return reject
  return count === 2 ? { state: { count: 3 }, events: [{ _tag: 'Full' }] } : { state: { count: count + 1 } }
}

export const counter = program<{
  state: CounterState
  model: CounterState
  message: CounterMessage
  event: Full
  external: Reset
}>().make({
  init: { state: { count: 0 } },
  update: counterUpdate,
  makeModel: (state) => state,
})

type Row = Readonly<{ id: number; counter: CounterState }>

// `fulls` is a field of this state alone: `smoke.ts` counts it in the declarations, to see how often they spell it out.
type State = Readonly<{ main: CounterState; rows: ReadonlyArray<Row>; fulls: number }>

type ResetAll = Readonly<{ _tag: 'ResetAll' }>

// Exported, as a module that declares a program for others: its declarations name the types of `program`.
export const { child, make, childById, input } = program<{ state: State }>()

// Exported, as a package that publishes a program would: its declarations name what `child` and `make` give.
export const children = {
  Main: child(counter, {
    get: (state) => Opt.some(state.main),
    set: (state, main) => ({ ...state, main }),
  }),
  Row: childById(counter, {
    get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
    set: (state, id, counter) => ({
      ...state,
      rows: Arr.map(state.rows, (row) => row.id === id ? { id, counter } : row),
    }),
    subscribed: (state) => Arr.map(state.rows, ({ id, counter }) => [id, counter] as const),
  }),
}

// A child that names no external message, which `nodenext` checks without `exactOptionalPropertyTypes`.
export const quiet = program<{ state: CounterState; model: CounterState; message: Readonly<{ _tag: 'Increment' }> }>()
  .make({
    init: { state: { count: 0 } },
    update: () => ({ count }) => ({ state: { count: count + 1 } }),
    makeModel: (state) => state,
  })

export const quietChild = child(quiet, {
  get: (state) => Opt.some(state.main),
  set: (state, main) => ({ ...state, main }),
})

export const app = make({
  init: (children) => ({
    state: { main: children.Main.init.state, rows: [{ id: 1, counter: children.Row.init(1).state }], fulls: 0 },
  }),
  children,
  update: (_: ResetAll, children) => (state) =>
    andThen(children.Main.update({ _tag: 'Reset' })(state), children.Row.update(1, { _tag: 'Reset' })),
  onEvent: {
    Main: () => (state) => ({ state: { ...state, fulls: state.fulls + 1 } }),
    Row: () => (state) => ({ state: { ...state, fulls: state.fulls + 1 } }),
  },
  makeModel: (state, children) => ({
    main: children.Main(state),
    rows: Arr.map(state.rows, ({ id }) => ({ id, model: children.Row(state, id) })),
    fulls: state.fulls,
  }),
})

type Message = MessageOf<typeof app>

// `onEvent` is required exactly when a child has events.
// @ts-expect-error
make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  makeModel: () => null,
})

make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  onEvent: { Main: () => (state) => ({ state }), Row: () => (state) => ({ state }) },
  // A parent sends a child only its external messages.
  // @ts-expect-error
  update: (_: ResetAll, children) => children.Main.update({ _tag: 'Increment' }),
  makeModel: () => null,
})

// So does a command's answer.
export const loading = program<{ state: State; command: 'Load' }>()

loading.make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children: { Main: loading.child(counter, { at: Optic.id<State>().key('main') }) },
  onEvent: { Main: () => (state) => ({ state }) },
  update: (_: ResetAll) => (state: State) => ({ state, commands: ['Load' as const] }),
  // @ts-expect-error
  runCommand: () => Effect.succeedSome({ _tag: 'Main' as const, message: { _tag: 'Increment' as const } }),
  makeModel: () => null,
})

loading.make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children: { Main: loading.child(counter, { at: Optic.id<State>().key('main') }) },
  onEvent: { Main: () => (state) => ({ state }) },
  update: (_: ResetAll) => (state: State) => ({ state, commands: ['Load' as const] }),
  runCommand: () => Effect.succeedSome({ _tag: 'Main' as const, message: { _tag: 'Reset' as const } }),
  makeModel: () => null,
})

// A parent's services are those its `runCommand` needs, and those its `subscriptions` need, with no annotation.
class Server extends Context.Service<Server, { readonly load: Effect.Effect<void> }>()('Server') {}
class Backup extends Context.Service<Backup, { readonly load: Effect.Effect<void> }>()('Backup') {}
class Feed extends Context.Service<Feed, { readonly resets: Stream.Stream<ResetAll> }>()('Feed') {}

export const served = loading.make({
  init: { state: { main: { count: 0 }, rows: [], fulls: 0 } },
  update: (_: ResetAll) => (state: State) => ({ state, commands: ['Load' as const] }),
  runCommand: () =>
    Math.random() < 0.5
      ? Effect.as(Effect.service(Server), Opt.none<ResetAll>())
      : Effect.as(Effect.service(Backup), Opt.none<ResetAll>()),
  subscriptions: () =>
    HashMap.make([
      'resets',
      Channel.unwrap(Effect.map(Effect.service(Feed), (feed) =>
        feed.resets.pipe(
          Stream.toChannel,
          Channel.flattenArray,
          Channel.mapDone((): ResetAll => ({ _tag: 'ResetAll' })),
        ))),
    ]),
  makeModel: () => null,
})

// A copy spells its type out, the key of its external messages included.
export const copied = { ...served, makeModel: () => 0 }

type Ran = CommandServicesOf<typeof served>

type Heard = SubscriptionServicesOf<typeof served>

export const ranBoth: [Ran] extends [Server | Backup] ? [Server | Backup] extends [Ran] ? true : false : false = true

export const heardFeed: [Heard] extends [Feed] ? [Feed] extends [Heard] ? true : false : false = true

// `simulate` asks only for what the commands need: the subscriptions do not run.
export const simulated: Effect.Effect<unknown, never, Server | Backup> = simulate(served)([], served.init)

// An own message that takes a child's name does not compile.
// @ts-expect-error
make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  update: (_: Readonly<{ _tag: 'Main' }>) => (state) => ({ state }),
  onEvent: { Main: () => (state) => ({ state }), Row: () => (state) => ({ state }) },
  makeModel: () => null,
})

// Nor does an input that takes a child's name.
// @ts-expect-error
make({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  inputs: { Main: input({ at: Optic.id<State>().key('fulls') }) },
  onEvent: { Main: () => (state) => ({ state }), Row: () => (state) => ({ state }) },
  makeModel: () => null,
})

// A program's external messages are among its messages.
// @ts-expect-error
const deaf: Program<{ state: CounterState; model: null; message: Full; external: Reset }> = {
  init: { state: { count: 0 } },
  update: () => (state) => ({ state }),
  makeModel: () => null,
}

// A name that is none of a program's types does not compile.
// @ts-expect-error
program<{ state: CounterState; modl: null }>().make({ init: { state: { count: 0 } }, makeModel: () => null })

// A child with commands has a `runCommand`, even when written without `Program<…>`.
child(
  // @ts-expect-error
  { init: { state: { count: 0 }, commands: ['Save' as const] }, update: counterUpdate, makeModel: () => null },
  { get: (state) => Opt.some(state.main), set: (state, main) => ({ ...state, main }) },
)

// An input and no children: the title is the program's own state, which the outside writes over.
type Draft = Readonly<{ title: string }>

const drafting = program<{ state: Draft; command: 'Load' }>()

const draft = drafting.make({
  init: { state: { title: '' } },
  inputs: { Title: drafting.input({ at: Optic.id<Draft>().key('title') }) },
  update: (_: 'Cleared') => (state: Draft) => ({
    state: { title: '' },
    commands: state.title === '' ? [] : ['Load' as const],
  }),
  runCommand: () => Effect.succeedNone,
  makeModel: (state) => state.title,
})

// A write is of the value the place holds; an own message that takes an input's name does not compile, nor does a
// command's answer that writes into an input, nor an element made by hand.
// @ts-expect-error
const wrong: MessageOf<typeof draft> = { _tag: 'Title', message: { _tag: 'Written', was: 0, value: 1 } }

// @ts-expect-error
const byHand: Shown<string> = { value: '' }

// @ts-expect-error
drafting.make({
  init: { state: { title: '' } },
  inputs: { Title: drafting.input({ at: Optic.id<Draft>().key('title') }) },
  update: (_: Readonly<{ _tag: 'Title' }>) => (state: Draft) => ({ state }),
  runCommand: () => Effect.succeedNone,
  makeModel: () => null,
})

drafting.make({
  init: { state: { title: '' } },
  inputs: { Title: drafting.input({ at: Optic.id<Draft>().key('title') }) },
  update: (_: 'Cleared') => (state: Draft) => ({ state, commands: ['Load' as const] }),
  // @ts-expect-error
  runCommand: () => Effect.succeedSome({ _tag: 'Title' as const, message: { _tag: 'Written', was: '', value: 'a' } }),
  makeModel: () => null,
})

// Inputs by id, at an optic of the id and at `get` and `set`, which take it: a write names its id.
type Sheet = Readonly<{
  counts: Readonly<Record<string, string>>
  rows: ReadonlyArray<Readonly<{ id: number; note: string }>>
}>

const sheets = program<{ state: Sheet }>()

const sheet = sheets.make({
  init: { state: { counts: { a: '' }, rows: [{ id: 1, note: '' }] } },
  inputs: {
    Count: sheets.inputById({ at: (id: string) => Optic.id<Sheet>().key('counts').at(id) }),
    Note: sheets.inputById({
      get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.note),
      set: (state, id, note) => ({ ...state, rows: Arr.map(state.rows, (row) => row.id === id ? { id, note } : row) }),
    }),
  },
  makeModel: (state) => state.counts,
})

// @ts-expect-error
const unnamed: MessageOf<typeof sheet> = { _tag: 'Count', message: { _tag: 'Written', was: '', value: '1' } }

const assert = (condition: boolean, what: string) => {
  if (!condition) throw new Error(`smoke: ${what}`)
}

const increment = (id?: number): Message =>
  id === undefined
    ? { _tag: 'Main', message: { _tag: 'Increment' } }
    : { _tag: 'Row', id, message: { _tag: 'Increment' } }

const folded = applyAll(app.update)([increment(), increment(), increment(), increment(1)], app.init.state)
assert(folded.state.main.count === 3 && folded.state.fulls === 1, 'applyAll routes to the children')
assert(app.makeModel(folded.state).rows[0]?.model.count === 1, 'makeModel reads the children by id')

const cleared = applyAll(draft.update)(
  [{ _tag: 'Title', message: { _tag: 'Written', was: draft.init.state.title, value: 'Ada' } }, 'Cleared'],
  draft.init.state,
)
assert(cleared.state.title === '' && cleared.commands.length === 1, 'a write is stored, and the step sees it')
const late = draft.update({ _tag: 'Title', message: { _tag: 'Written', was: 'Ada', value: 'Ada L' } })(cleared.state)
assert(late === reject && wrong !== undefined, 'a write over a value the input no longer holds is rejected')

const counted = sheet.update({ _tag: 'Count', id: 'a', message: { _tag: 'Written', was: '', value: '1' } })(
  sheet.init.state,
)
assert(counted !== reject && counted.state.counts.a === '1', 'a write into an input by id is stored at its id')
const nowhere = sheet.update({ _tag: 'Count', id: 'b', message: { _tag: 'Written', was: '', value: '1' } })(
  sheet.init.state,
)
assert(nowhere === reject && unnamed !== undefined, 'a write at an id the state does not hold is rejected')

// What a bridge does with an element: typed by the user, numbered by the dispatch, settled by a frame.
const { shown, taken } = drawn(undefined, 'Ada', 0)
assert(taken, 'a new element takes the frame\'s value')
const { write: edit, sent } = edited(shown, 'Ada L')
const element = sent(1)
assert(edit.was === 'Ada' && element.value === 'Ada L', 'edited writes over what the element showed')
// Exported, as a bridge's module may: its declarations spell out what the element holds.
export const kept = drawn(element, 'Ada', 0)
assert(kept.shown === element && !kept.taken && byHand !== undefined, 'a frame that has not seen the write keeps it')
assert(deaf.update({ _tag: 'Full' })(deaf.init.state) !== reject, 'a program typed past its types runs')
const moved = drawn(element, '', 1)
assert(moved.shown.value === '' && moved.taken, 'a frame that has seen it and moved on gives its value')

// Every value of the package, as a module that wraps the library would export it: its declarations name every type
// of their signatures.
export const library = { ...Library }
export const testing = { ...Testing }

const main = Effect.gen(function*() {
  const simulation = yield* simulate(app)([increment(), { _tag: 'ResetAll' }], app.init)
  assert(simulation.state.main.count === 0, 'simulate applies the external messages')
  const counts: Array<number> = []
  yield* run(app, (frames) =>
    frames.pipe(
      Stream.tap(Effect.fnUntraced(function*({ model, dispatch, seen }) {
        counts.push(model.main.count)
        assert(seen === model.main.count, 'a frame has seen the messages that made its state')
        if (model.fulls === 0) assert((yield* dispatch(increment())) === seen + 1, 'a dispatch numbers its message')
      })),
      Stream.take(4),
      Stream.runDrain,
    ))
  assert(counts.join() === '0,1,2,3', `run draws every frame: ${counts.join()}`)
})

await Effect.runPromise(main)
console.log('smoke: the consumer ran')
