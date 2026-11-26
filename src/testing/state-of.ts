import type * as HashMap from "effect/HashMap"
import type * as Opt from "effect/Option"
import { type Instance, type Kept, type Placer, statesKey } from "../compose.ts"
import type { Step } from "../update.ts"

/**
 * What a test gives `stateOf` for a parent's children, by name: the state of a child alone, and the ids and states of
 * children by id. A child that is given no state is as it starts.
 */
type StatesOf<Children> = {
  readonly [K in keyof Children]?: Children[K] extends HashMap.HashMap<infer Id, Instance<infer State>>
    ? Iterable<readonly [Id, State]>
    : Children[K] extends Opt.Option<Instance<infer State>> ? State
    : never
}

/**
 * A state of a parent, for a test: the parent's own state, with the children it lists, each in the state given for it.
 *
 * - Each child that the own state lists is started, and told what the `tell` of its declaration gives, as the parent's
 *   `init` starts it, and then put in the state given for it. A child that is given no state is as it starts.
 * - A state given for a child that the own state does not list is an error, and so is a handler of `onEvent` that
 *   gives another object as the own state, equal or not, in answer to what a child is told. One that raises an event
 *   of the parent's own is a `CompositionDefect`, as in `init`.
 * - A state given under a name that is no child's is an error, and so is a program without children, whose state is
 *   its own.
 * - For a parent of parents, the state of a child that is a parent is itself made with `stateOf`.
 *
 * @param program - The parent, made with `withChildren`.
 * @param own - The parent's own state.
 * @param states - The states of its children, by name.
 * @returns The parent's whole state, for its `update`, its `makeModel` and the testing tools.
 *
 * @example
 * ```ts
 * const state = stateOf(app, { about: Opt.none() }, { Clock: { maybeNow: Opt.none(), format: 'Iso' } })
 * ```
 *
 * @see The guide, "Testing".
 */
export const stateOf = <Own, Children>(
  program: Readonly<{ init: Step<Kept<Own, Children>, any> | ((flags: any) => Step<Kept<Own, Children>, any>) }>,
  own: Own,
  states: StatesOf<Children> = {}
): Kept<Own, Children> => {
  const place = (program as Readonly<{ [statesKey]?: Placer }>)[statesKey]
  if (place === undefined) throw new Error("stateOf: a program without children, whose state is its own")
  return place(own, states as Readonly<Record<string, unknown>>) as Kept<Own, Children>
}
