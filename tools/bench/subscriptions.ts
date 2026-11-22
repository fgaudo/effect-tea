// The cost of a parent's subscriptions on each change of state: a list of many children by id, each ticking, and a
// sequence of states that each change one child. First with the changes spread over all the children, then with all
// of them made to the first child alone: a parent keeps a child's lifted subscriptions by the object it keeps the
// child's instance in, which a step of another child leaves as it was.
// Not part of `bun run test`.
//
//   bun run bench [--children 1000] [--changes 2000]
//   bun run bench --help     the same, as the command describes itself
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as HashMap from "effect/HashMap"
import * as Num from "effect/Number"
import { type MessageOf, type Program, program, reject, type StateOf } from "../../src/index.ts"
import { stateOf } from "../../src/testing/index.ts"
import { main } from "../cli.ts"

type RowState = Readonly<{ seconds: number }>

type RowMessage = Readonly<{ _tag: "Ticked" }>

const ticks = Channel.never

const row: Program<{ state: RowState; model: number; message: RowMessage }> = {
  init: { state: { seconds: 0 } },
  update: () => (state) => ({ state: { seconds: state.seconds + 1 } }),
  subscriptions: () => HashMap.make(["ticks", ticks]),
  makeModel: (state) => state.seconds
}

type Own = Readonly<{ ids: ReadonlyArray<number> }>

const { childById, withChildren } = program<{ state: Own }>()

const list = withChildren({ Row: childById(row, { ids: (state) => state.ids }) }).make({
  init: { state: { ids: [] } },
  makeModel: (state) => state.ids.length
})

const rounds = 7

const statesOf = (children: number, changes: number, one: boolean) => {
  let state: StateOf<typeof list> = stateOf(list, { ids: Arr.makeBy(children, (id) => id) })
  const all = [state]
  for (let i = 0; i < changes; i++) {
    const tick: MessageOf<typeof list> = { _tag: "Row", id: one ? 0 : i % children, message: { _tag: "Ticked" } }
    const step = list.update(tick)(state)
    if (step !== reject) state = step.state
    all.push(state)
  }
  return all
}

const subscriptions = list.subscriptions

const round = (children: number, states: ReadonlyArray<StateOf<typeof list>>) => {
  const start = performance.now()
  for (const state of states) {
    if (HashMap.size(subscriptions(state)) !== children) throw new Error("a child lost its subscription")
  }
  return (performance.now() - start) / states.length
}

const count = (name: string, description: string, fallback: number) =>
  Flag.Int(name).pipe(
    Flag.withDescription(description),
    Flag.withDefault(fallback),
    Flag.filter((value) => value >= 1, () => "a whole number of at least 1")
  )

const command = Command.make(
  "bench",
  {
    children: count("children", "How many children the list has", 1000),
    changes: count("changes", "How many changes of state are measured, each of one child", 2000)
  },
  Effect.fnUntraced(function*({ changes, children }) {
    for (const one of [false, true]) {
      const states = statesOf(children, changes, one)
      round(children, states)
      const timings = Arr.sort(Arr.makeBy(rounds, () => round(children, states)), Num.Order)
      const median = timings[Math.floor(rounds / 2)] ?? Number.NaN
      yield* Console.log(
        `subscriptions of ${children} children ${one ? "whose first alone changes" : "that change in turn"}, ` +
          `${states.length} states that each change one: ${(median * 1000).toFixed(1)} µs per change of state ` +
          `(median of ${rounds} rounds)`
      )
    }
  })
)

main(command)
