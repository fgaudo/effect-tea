import * as Data from "effect/Data"

/**
 * Where a defect happened, as a `ProgramDefect` says it in `where`.
 *
 * - `'init'` is the `init` of a program that starts from flags, with what its children's declarations run as it
 *   starts.
 * - `'update'` includes `onEvent`, a child's `external`, a child's `init` when a step of its parent starts it, `there`,
 *   `key`, `flags`, `ids`, the declared `tell`, and an output read in `update`. The message is in `on`.
 * - `'subscriptions'` includes the `Equal` and `Hash` of the keys, `listening`, a child's `subscriptions`, and an
 *   output read in `subscriptions`.
 * - `'subscription'` is a subscription, and `listen` as it makes one, a child's too. The key is in `key`.
 * - `'command'` is a command, and `runCommand` as it makes the command's effect.
 * - `'render'` is `makeModel`, a child's too, wherever the model is read, an output read in `makeModel`, a listener of
 *   the `App`, and what a renderer gives `die`.
 * - An option's name means that option.
 * - A defect in a log that the program writes is in the place it logs from.
 *
 * @example
 * ```ts
 * const report = (defect: ProgramDefect) => defect.where === 'update' ? `${defect.on}` : defect.where
 * ```
 *
 * @see The guide, "Running".
 */
export type DefectSite =
  | "init"
  | "update"
  | "subscriptions"
  | "subscription"
  | "command"
  | "onApplied"
  | "onIgnored"
  | "render"

const described: Readonly<Record<DefectSite, string>> = {
  init: "init",
  update: "update",
  subscriptions: "subscriptions",
  subscription: "a subscription",
  command: "a command",
  onApplied: "onApplied",
  onIgnored: "onIgnored",
  render: "makeModel or the renderer"
}

// The constructors are private, so that each class keeps the one meaning the library gives it: the types refuse a
// `new` of one outside its class. The functions at the end of this module are the only way to build one, and are not
// exported by the package. They call each constructor through the type it has at run time, and not from a `static {}`
// block of the class: that syntax is the one the package would add to what Effect's own `dist/` asks of a toolchain.
type Constructor<A, Fields> = new(fields: Fields) => A

type Fields = Readonly<{
  /** Where the defect happened. */
  where: DefectSite
  /** The defect itself: what was thrown, or given to `Effect.die`. */
  cause: unknown
  /** The subscription's key, for a defect in a subscription. */
  key?: unknown
  /** The message `update` was given, by its tags (`Home › Products › Deleted`), for a defect in `update`. */
  on?: unknown
}>

/**
 * The defect a run dies with: the one that happened, and where.
 *
 * Its `message` says where the defect happened, for whoever reads the error. For a defect in `update`, it also names
 * the message.
 *
 * - `cause` is what was thrown: an `InvariantDefect` for one thrown with `defect`.
 * - `on` names the message by its tags, never its data (`Home › Products › Deleted`). A message that is a string is
 *   its own tag, and appears whole. A parent's wrapping is followed only to a tagged value, so the message of a child
 *   whose messages are strings appears by the child's name alone.
 * - `key` is the subscription's key as it is. Like `cause`, it may hold the program's data.
 * - The run does not log the defect and does not recover from it. Report it, and choose what the user sees next.
 * - Only the library makes one: the run, and the testing tools that fail as the run dies. Read it, as a crash report
 *   or a test does: the types refuse a `new` of it.
 * - What throws outside the functions of the program, in the run's own code or as the run reads a message's tags for
 *   `on`, is in the run's cause as it is, with no `where`, and ends the run as a defect does.
 *
 * @example
 * ```ts
 * const where = (error: unknown) => error instanceof ProgramDefect ? error.where : 'outside the run'
 * ```
 *
 * @see The guide, "Running".
 */
export class ProgramDefect extends Data.TaggedError("ProgramDefect")<Fields & Readonly<{ message: string }>> {
  private constructor(fields: Fields) {
    super({
      ...fields,
      // oxlint-disable-next-line typescript/no-base-to-string -- `on` is a message's tags, or its `typeof`
      message: `A defect in ${described[fields.where]}${fields.on === undefined ? "" : ` on ${String(fields.on)}`}`
    })
  }
}

type CompositionFields = Readonly<{
  /** What was broken, for whoever reads the error. */
  message: string
  /** The child's name. */
  child: string
  /** The child's id, for a child by id. */
  id?: unknown
  /** The external message, or the event, it happened on, by its tags (`Cleared`), for one that has one. */
  on?: unknown
}>

/**
 * A parent that breaks what it declared of a child.
 *
 * A program meets it in five cases:
 *
 * - `make` is given a child that `child` or `childById` did not make, as a copy of one that `Object.assign` makes;
 * - a step of a parent tells a child that is not there once the step is taken;
 * - children by id whose `ids` or `flags` list an id twice;
 * - the model or the output of a child by id is read at an id that the parent's state does not list;
 * - a handler of `onEvent` that runs as the parent starts raises an event of the parent's own, which `stateOf` throws
 *   too.
 *
 * `on` names the message by its tags. `id` is the child's id as it is, and may hold the program's data. Only
 * `program` makes one: a test reads it, and the types refuse a `new` of it, or a class that extends it. What a parent
 * does once a cast, or an `any`, has let through what the types refuse is unspecified.
 *
 * @example
 * ```ts
 * expect(() => app.update({ _tag: 'BackPressed' })(state)).toThrow(CompositionDefect)
 * ```
 *
 * @see The guide, "Composition".
 * @see The guide, "Events and external messages".
 * @see The guide, "Running".
 */
export class CompositionDefect extends Data.TaggedError("CompositionDefect")<CompositionFields> {
  private constructor(fields: CompositionFields) {
    super(fields)
  }
}

/**
 * A rule of the program broken, such as a message that cannot arrive or a state that cannot be: what `defect` throws.
 *
 * The run dies with it as with any other defect, and it is the `cause` of the `ProgramDefect`. It lets a crash report
 * tell a broken rule of the program from any other error. Only `defect` makes one: a test or a crash report reads it,
 * and the types refuse a `new` of it, or a class that extends it.
 *
 * @example
 * ```ts
 * expect(() => update(Message.Saved())(idle)).toThrow(InvariantDefect)
 * ```
 *
 * @see The guide, "Rejections and defects".
 * @see The guide, "Running".
 */
export class InvariantDefect extends Data.TaggedError("InvariantDefect")<
  Readonly<{
    /** Which rule was broken. */
    reason: string
    /** The `reason`, for whoever reads the error. */
    message: string
  }>
> {
  private constructor(reason: string) {
    super({ reason, message: reason })
  }
}

/**
 * The twin of `reject`, for a message that cannot arrive: throws an `InvariantDefect` with `reason`.
 *
 * The run dies, as with any other defect. `defect` is an expression, for a branch of a ternary or a `Match`. Use it in
 * the synchronous functions of a program: `init`, `update`, `external`, `onEvent`, `makeModel`, `output`,
 * `subscriptions`, and those of a child's declaration, as `there` or `ids`. Inside an Effect, use `Effect.die`.
 *
 * @param reason - Which rule of the program was broken.
 * @returns Never: it throws.
 *
 * @example
 * ```ts
 * case 'SaveSucceeded':
 *   return state.save._tag === 'Saving'
 *     ? { state: { ...state, save: Save.Idle() } }
 *     : defect('A save completed while nothing was saving')
 * ```
 *
 * @see The guide, "Rejections and defects".
 * @see The guide, "Update".
 */
export const defect = (reason: string): never => {
  throw new (InvariantDefect as unknown as Constructor<InvariantDefect, string>)(reason)
}

/** Builds the `ProgramDefect` the run dies with: only the engine does. */
export const programDefect = (fields: Fields): ProgramDefect =>
  new (ProgramDefect as unknown as Constructor<ProgramDefect, Fields>)(fields)

/** Builds the `CompositionDefect` of a parent that breaks what it declared: only `program` does. */
export const compositionDefect = (fields: CompositionFields): CompositionDefect =>
  new (CompositionDefect as unknown as Constructor<CompositionDefect, CompositionFields>)(fields)
