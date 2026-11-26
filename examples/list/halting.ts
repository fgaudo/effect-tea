// Halting the stopwatches that run, a concern of the list: its message, its step, and the part of the model that it
// makes. Written apart from `make`, its functions name what they read of the stopwatches and what they tell them, by
// the stopwatches that `list.ts` declares: `OutputsOf` and `TellOf`.
import { type OutputsOf, reject, type TellOf, type Transition } from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Opt from "effect/Option"
import type { Own, stopwatches } from "./list.ts"

export type StopAllClicked = Readonly<{ _tag: "StopAllClicked" }>

type Stopwatches = typeof stopwatches

/** The stopwatches that run, read from their output: `update` and `stopAll` both ask this. */
const runningOf = (state: Own, children: OutputsOf<Stopwatches>): ReadonlyArray<number> =>
  Arr.filter(state.ids, (id) => children.Stopwatch.output(id).running)

/** Tells only the stopwatches that run. Where none runs, there is nothing to stop. */
export const update =
  (_: StopAllClicked, children: OutputsOf<Stopwatches>) =>
  (state: Own): Transition<Own, never, never, TellOf<Stopwatches>> => {
    const running = runningOf(state, children)
    return Arr.isReadonlyArrayEmpty(running)
      ? reject
      : { state, tell: Arr.map(running, (id) => ({ _tag: "Stopwatch", id, message: { _tag: "Halted" } })) }
  }

/** "Stop all", offered only while a stopwatch runs. */
export const stopAll = (state: Own, children: OutputsOf<Stopwatches>): Opt.Option<StopAllClicked> =>
  Arr.isReadonlyArrayEmpty(runningOf(state, children)) ? Opt.none() : Opt.some({ _tag: "StopAllClicked" })
