// The cost of a parent's subscriptions on each change of state: a list of many children by id, each ticking, and a
// sequence of states that each change one child. First with each child in a state object of its own, then with all
// of them starting from one object, `row.init.state`, and the changes made to the first child alone, so that the
// others keep sharing it: a parent keeps a child's lifted subscriptions by its state object, for the places it held.
// Run with `bun run bench [children] [changes]`; not part of `bun run test`.
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as HashMap from "effect/HashMap"
import * as Num from "effect/Number"
import * as Opt from "effect/Option"
import { type MessageOf, type Program, program, reject, type StateOf } from "../../src/index.ts"

type RowState = Readonly<{ seconds: number }>

type RowMessage = Readonly<{ _tag: "Ticked" }>

const ticks = Channel.never

const row: Program<{ state: RowState; model: number; message: RowMessage }> = {
  init: { state: { seconds: 0 } },
  update: () => (state) => ({ state: { seconds: state.seconds + 1 } }),
  subscriptions: () => HashMap.make(["ticks", ticks]),
  makeModel: (state) => state.seconds
}

type State = Readonly<{ rows: ReadonlyArray<Readonly<{ id: number; row: RowState }>> }>

const { make, childById } = program<{ state: State }>()

const list = make({
  init: () => ({ state: { rows: [] } }),
  children: {
    Row: childById(row, {
      get: (state, id: number) => Opt.map(Arr.findFirst(state.rows, (entry) => entry.id === id), (entry) => entry.row),
      set: (state, id, row) => ({ rows: Arr.map(state.rows, (entry) => entry.id === id ? { id, row } : entry) }),
      subscribed: (state) => Arr.map(state.rows, ({ id, row }) => [id, row] as const)
    })
  },
  makeModel: (state) => state.rows.length
})

const children = Number(Bun.argv[2] ?? 1000)
const changes = Number(Bun.argv[3] ?? 2000)
const rounds = 7

const statesOf = (shared: boolean) => {
  let state: StateOf<typeof list> = {
    rows: Arr.makeBy(children, (id) => ({ id, row: shared ? row.init.state : { ...row.init.state } }))
  }
  const all = [state]
  for (let i = 0; i < changes; i++) {
    const tick: MessageOf<typeof list> = { _tag: "Row", id: shared ? 0 : i % children, message: { _tag: "Ticked" } }
    const step = list.update(tick)(state)
    if (step !== reject) state = step.state
    all.push(state)
  }
  return all
}

const subscriptions = list.subscriptions

const round = (states: ReadonlyArray<StateOf<typeof list>>) => {
  const start = performance.now()
  for (const state of states) {
    if (HashMap.size(subscriptions(state)) !== children) throw new Error("a child lost its subscription")
  }
  return (performance.now() - start) / states.length
}

for (const shared of [false, true]) {
  const states = statesOf(shared)
  round(states)
  const timings = Arr.sort(Arr.makeBy(rounds, () => round(states)), Num.Order)
  const median = timings[Math.floor(rounds / 2)] ?? Number.NaN
  console.log(
    `subscriptions of ${children} children ${shared ? "that share one state object" : "in objects of their own"}, ` +
      `${states.length} states that each change one: ${(median * 1000).toFixed(1)} µs per change of state ` +
      `(median of ${rounds} rounds)`
  )
}
