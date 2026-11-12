// A consumer of the packed package, run with Node and typechecked by `smoke.ts` under several TypeScript versions
// and module resolutions. It instantiates the types of `parent` (a child, children by id, events and external
// messages) and checks that what they reject does not compile.
import { andThen, type MessageOf, parent, type Program, reject, run, type Update } from '@fgaudo/effect-tea'
import { applyAll, simulate } from '@fgaudo/effect-tea/testing'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
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

const counter: Program<{
  state: CounterState
  model: CounterState
  message: CounterMessage
  event: Full
  external: Reset
}> = {
  init: { state: { count: 0 } },
  update: counterUpdate,
  makeModel: (state) => state,
}

type Row = Readonly<{ id: number; counter: CounterState }>

type State = Readonly<{ main: CounterState; rows: ReadonlyArray<Row>; fulls: number }>

type ResetAll = Readonly<{ _tag: 'ResetAll' }>

const { child, compose, each } = parent<{ state: State }>()

const children = {
  Main: child(counter, {
    get: (state) => Opt.some(state.main),
    set: (state, main) => ({ ...state, main }),
  }),
  Row: each(counter, {
    get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (row) => row.id === id), (row) => row.counter),
    set: (state, id, counter) => ({
      ...state,
      rows: Arr.map(state.rows, (row) => row.id === id ? { id, counter } : row),
    }),
    subscribed: (state) => Arr.map(state.rows, ({ id, counter }) => [id, counter] as const),
  }),
}

const app = compose({
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
compose({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  makeModel: () => null,
})

compose({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  onEvent: { Main: () => (state) => ({ state }), Row: () => (state) => ({ state }) },
  // A parent sends a child only its external messages.
  // @ts-expect-error
  update: (_: ResetAll, children) => children.Main.update({ _tag: 'Increment' }),
  makeModel: () => null,
})

// An own message that takes a child's name does not compile.
// @ts-expect-error
compose({
  init: () => ({ state: { main: { count: 0 }, rows: [], fulls: 0 } }),
  children,
  update: (_: Readonly<{ _tag: 'Main' }>) => (state) => ({ state }),
  onEvent: { Main: () => (state) => ({ state }), Row: () => (state) => ({ state }) },
  makeModel: () => null,
})

// A child with commands has a `runCommand`, even when written without `Program<…>`.
child(
  // @ts-expect-error
  { init: { state: { count: 0 }, commands: ['Save' as const] }, update: counterUpdate, makeModel: () => null },
  { get: (state) => Opt.some(state.main), set: (state, main) => ({ ...state, main }) },
)

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

const main = Effect.gen(function*() {
  const simulation = yield* simulate(app)([increment(), { _tag: 'ResetAll' }], app.init)
  assert(simulation.state.main.count === 0, 'simulate applies the external messages')
  const counts: Array<number> = []
  yield* run(app, (frames) =>
    frames.pipe(
      Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
        counts.push(model.main.count)
        if (model.fulls === 0) yield* dispatch(increment())
      })),
      Stream.take(4),
      Stream.runDrain,
    ))
  assert(counts.join() === '0,1,2,3', `run draws every frame: ${counts.join()}`)
})

await Effect.runPromise(main)
console.log('smoke: the consumer ran')
