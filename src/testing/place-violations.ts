import * as Arr from "effect/Array"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import { type Input, type InputById } from "../compose.ts"

/**
 * A way the `get` and the `set` of an input break the rule of a place, as `placeViolations` finds it.
 *
 * @example
 * ```ts
 * expect(placeViolations(note, { states: [{ note: '', dirty: false }], values: ['Ada'] }))
 *   .toEqual([{ _tag: 'Changes', state: { note: '', dirty: false } }])
 * ```
 *
 * @see The guide, "Testing tools", "placeViolations".
 */
export type PlaceViolation<State, A, Id = never> =
  | {
    /** A `set` of the value that `get` gives leaves another state: the `set` changes more than its place. */
    readonly _tag: "Changes"
    /** The state the `set` was given. */
    readonly state: State
    /** The id the `set` was given, for inputs by id. */
    readonly id?: Id
  }
  | {
    /**
     * After a `set` of `value`, `get` gives another value: the `set` writes another place than `get` reads, or another
     * form of the value.
     */
    readonly _tag: "StoresAnother"
    /** The state the `set` was given. */
    readonly state: State
    /** The id the `set` was given, for inputs by id. */
    readonly id?: Id
    /** The value the `set` was given. */
    readonly value: A
  }
  | {
    /**
     * A `set` of `values[0]`, then of `values[1]`, leaves another state than a `set` of `values[1]` alone: the `set`
     * keeps something of an earlier write.
     */
    readonly _tag: "Remembers"
    /** The state the first `set` was given. */
    readonly state: State
    /** The id the `set` was given, for inputs by id. */
    readonly id?: Id
    /** The value of the first `set`, then of the second. */
    readonly values: readonly [A, A]
  }
  | {
    /** A `set` at `id` changes what `get` gives at `other`. Inputs by id only. */
    readonly _tag: "ReachesAnother"
    /** The state the `set` was given. */
    readonly state: State
    /** The id the `set` was given. */
    readonly id: Id
    /** The value the `set` was given. */
    readonly value: A
    /** The id where `get` gives another value after the `set`. */
    readonly other: Id
  }

// One place that the checks read and write: the input alone, or the inputs at one of the ids given.
type Spot<State, A, Id> = {
  readonly named: Partial<{ readonly id: Id }>
  readonly get: (state: State) => Opt.Option<A>
  readonly set: (state: State, value: A) => State
  // What a `set` here changed at the other ids given: nothing, for an input alone.
  readonly reached: (before: State, after: State, value: A) => ReadonlyArray<PlaceViolation<State, A, Id>>
}

const spotsOf = <State, A, Id>(
  input: Input<State, A> | InputById<State, Id, A>,
  ids: ReadonlyArray<Id>
): ReadonlyArray<Spot<State, A, Id>> =>
  input.kind === "one"
    ? [{ named: {}, get: input.get, set: input.set, reached: () => [] }]
    : Arr.map(ids, (id): Spot<State, A, Id> => ({
      named: { id },
      get: (state) => input.get(state, id),
      set: (state, value) => input.set(state, id, value),
      reached: (before, after, value) =>
        Arr.flatMap(
          ids.filter((other) => !Equal.equals(other, id)),
          (other): ReadonlyArray<PlaceViolation<State, A, Id>> =>
            Equal.equals(input.get(after, other), input.get(before, other))
              ? []
              : [{ _tag: "ReachesAnother", state: before, id, value, other }]
        )
    }))

// The two overloads are of this one function. TypeScript relates a generic function to an overload with its type
// parameters erased to `any`, and `id?: any` is not `id?: never`, the id of an input alone: so the overloads are cast.
const violationsOf = <State, A, Id>(
  input: Input<State, A> | InputById<State, Id, A>,
  options: Readonly<{ states: Iterable<State>; ids?: Iterable<Id>; values: Iterable<A> }>
): ReadonlyArray<PlaceViolation<State, A, Id>> => {
  const values = Arr.fromIterable(options.values)
  const spots = spotsOf(input, Arr.fromIterable(options.ids ?? []))
  return Arr.flatMap(
    Arr.fromIterable(options.states),
    (state) =>
      Arr.flatMap(spots, ({ named, get, set, reached }): ReadonlyArray<PlaceViolation<State, A, Id>> => {
        const held = get(state)
        // The library calls no `set` where the place is not there.
        if (Opt.isNone(held)) return []
        // The value held is a second write too: a `set` that marks the state only on another value is found by writing
        // back what was there, which a test would not think of giving.
        const seconds = Arr.some(values, (value) => Equal.equals(value, held.value)) ? values : [...values, held.value]
        return [
          ...(Equal.equals(set(state, held.value), state) ? [] : [{ _tag: "Changes" as const, state, ...named }]),
          ...Arr.flatMap(values, (value): ReadonlyArray<PlaceViolation<State, A, Id>> => {
            const after = set(state, value)
            return [
              ...(Equal.equals(get(after), Opt.some(value))
                ? []
                : [{ _tag: "StoresAnother" as const, state, ...named, value }]),
              ...reached(state, after, value),
              ...Arr.flatMap(seconds, (second) =>
                Equal.equals(set(after, second), set(state, second))
                  ? []
                  : [{ _tag: "Remembers" as const, state, ...named, values: [value, second] as const }])
            ]
          })
        ]
      })
  )
}

/**
 * Checks the `get` and the `set` of an input, in the states and at the ids it is given: that a `set` changes its
 * place, and nothing else.
 *
 * It finds four kinds of violation, wherever `get` gives `Some`:
 *
 * - `Changes`: a `set` of the value that `get` gives leaves another state.
 * - `StoresAnother`: after a `set` of a value, `get` gives another value.
 * - `Remembers`: a `set` of a value, then of another, leaves another state than the second alone. The second is each
 *   value given, and the value held too.
 * - `ReachesAnother`: a `set` at an id changes what `get` gives at another id given. Inputs by id only.
 *
 * It checks nothing where `get` gives `None`, since the library calls no `set` there. So give at least one state where
 * the place is there: a call that checks nothing returns no violation. States and values are compared with `Equal`.
 * It calls `get` and `set` itself, and throws what they throw.
 *
 * @param input - What `input` or `inputById` returns: declare it beside `make`, so that the test can import it.
 * @param options - `states`, the states to check in; `values`, the values to write; and, for inputs by id, `ids`, the
 * ids to write at. An id that no state has is skipped where `get` gives `None`.
 * @returns Every violation it finds, so that a test asserts there are none.
 *
 * @example
 * ```ts
 * expect(placeViolations(counts, { states, ids: ['a', 'b', 'missing'], values: ['', '3', 'x'] })).toEqual([])
 * ```
 *
 * @see The guide, "Testing tools", "placeViolations".
 * @see The guide, "Inputs", "A `set` changes its place, and nothing else".
 */
export const placeViolations = violationsOf as {
  // `NoInfer`: the types are the input's, so that a state written as a literal is checked against them, not widened.
  <State, A>(
    input: Input<State, A>,
    options: Readonly<{ states: Iterable<NoInfer<State>>; values: Iterable<NoInfer<A>> }>
  ): ReadonlyArray<PlaceViolation<State, A>>
  <State, Id, A>(
    inputs: InputById<State, Id, A>,
    options: Readonly<{ states: Iterable<NoInfer<State>>; ids: Iterable<NoInfer<Id>>; values: Iterable<NoInfer<A>> }>
  ): ReadonlyArray<PlaceViolation<State, A, Id>>
}
