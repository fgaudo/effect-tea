import * as Data from 'effect/Data'

/**
 * Where a defect happened, as a `ProgramDefect` says it in `where`.
 *
 * @example
 * ```ts
 * const report = (defect: ProgramDefect) => defect.where === 'update' ? `${defect.on}` : defect.where
 * ```
 *
 * @remarks
 * From the guide, "Running", "Its `where` says where it happened":
 *
 * **Its `where` says where it happened**, which only the run knows:
 * - `'init'`: in `init`, for a program that starts from flags;
 * - `'update'`: in `update`, `onEvent` included; the message it was given is in `on`, by its tags, as the logs describe
 *   it by default;
 * - `'subscriptions'`: in `subscriptions`, the `Equal` and `Hash` of its keys included;
 * - `'subscription'`: in a subscription; its `key` is there as it is, as the logs show it;
 * - `'command'`: in a command;
 * - `'render'`: in the renderer, the view and `makeModel` included;
 * - an option's name: in that option;
 * - `'log'`: in one of the run's own debug logs (a `Logger` that throws).
 *
 * What the program logs itself is in the place it logs from.
 */
export type DefectSite =
  | 'init'
  | 'update'
  | 'subscriptions'
  | 'subscription'
  | 'command'
  | 'describeMessage'
  | 'describeCommand'
  | 'onApplied'
  | 'onIgnored'
  | 'render'
  | 'log'

const described: Readonly<Record<DefectSite, string>> = {
  init: 'init',
  update: 'update',
  subscriptions: 'subscriptions',
  subscription: 'a subscription',
  command: 'a command',
  describeMessage: 'describeMessage',
  describeCommand: 'describeCommand',
  onApplied: 'onApplied',
  onIgnored: 'onIgnored',
  render: 'the renderer, its view or makeModel',
  log: 'a log of the run',
}

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
 * Its `message` says where, with the message it happened on for one in `update`, for whoever reads the error.
 *
 * @example
 * ```ts
 * const where = (error: unknown) => error instanceof ProgramDefect ? error.where : 'outside the run'
 * ```
 *
 * @remarks
 * From the guide, "Running", "Its `cause` is the defect itself":
 *
 * **Its `cause` is the defect itself**: an `InvariantDefect` for one thrown with `defect`.
 *
 * From the guide, "Running", "Its `where` says where it happened":
 *
 * **Its `where` says where it happened**, which only the run knows:
 * - `'init'`: in `init`, for a program that starts from flags;
 * - `'update'`: in `update`, `onEvent` included; the message it was given is in `on`, by its tags, as the logs describe
 *   it by default;
 * - `'subscriptions'`: in `subscriptions`, the `Equal` and `Hash` of its keys included;
 * - `'subscription'`: in a subscription; its `key` is there as it is, as the logs show it;
 * - `'command'`: in a command;
 * - `'render'`: in the renderer, the view and `makeModel` included;
 * - an option's name: in that option;
 * - `'log'`: in one of the run's own debug logs (a `Logger` that throws).
 *
 * What the program logs itself is in the place it logs from.
 *
 * From the guide, "Running", "How messages and commands appear in the logs":
 *
 * - One that is a string is its own tag, and appears whole. Data goes in a field of a tagged value.
 * - A parent's wrapping is followed only to a tagged value. So the message of a child whose messages are strings
 *   appears by the child's name alone: `{ _tag: 'Counter', message: 'Increment' }` appears as `Counter`. A string in a
 *   field named `message` may be the program's own data.
 *
 * From the guide, "Running", "The run never recovers from a defect, and does not log it":
 *
 * **The run never recovers from a defect, and does not log it.** Reporting it, and what the user sees next, are the
 * app's, around the run. The screen keeps the last frame: show a crash screen, or run the program again.
 *
 * From the guide, "Running", "What leaves the device is chosen there":
 *
 * **What leaves the device is chosen there.** The `cause` is whatever was thrown. A `ProgramDefect`'s `key`, like a
 * `CompositionDefect`'s `id`, is the program's own value, as it is, and may hold data.
 */
export class ProgramDefect extends Data.TaggedError('ProgramDefect')<Fields & Readonly<{ message: string }>> {
  constructor(fields: Fields) {
    super({
      ...fields,
      message: `A defect in ${described[fields.where]}${fields.on === undefined ? '' : ` on ${String(fields.on)}`}`,
    })
  }
}

/**
 * A parent that breaks what it declared of a child.
 *
 * @example
 * ```ts
 * expect(() => app.update({ _tag: 'BackPressed' })(state)).toThrow(CompositionDefect)
 * ```
 *
 * @remarks
 * From the guide, "Composition", "What is a defect":
 *
 * **What is a defect** (a `CompositionDefect`):
 * - a child with commands and no `runCommand` that gets there through a cast: the defect comes when its command runs;
 * - a child with events and no handler in `onEvent` that gets there through a cast: the defect comes when it raises
 *   one;
 * - a child whose state is not an object, which only a cast gets there: the defect comes when its model or its
 *   subscriptions are made;
 * - a subscription key of the parent's own that is the key of a child's subscription;
 * - a `subscribed` that lists one id twice;
 * - asking for the model of a child that is not there.
 *
 * From the guide, "Composition", "A rejection of an external message is a defect":
 *
 * **A rejection of an external message is a defect**: a `CompositionDefect` that names the child, and names the message
 * by its tags. So is sending an external message to a child that is not there.
 *
 * From the guide, "Running", "How messages and commands appear in the logs":
 *
 * - One that is a string is its own tag, and appears whole. Data goes in a field of a tagged value.
 * - A parent's wrapping is followed only to a tagged value. So the message of a child whose messages are strings
 *   appears by the child's name alone: `{ _tag: 'Counter', message: 'Increment' }` appears as `Counter`. A string in a
 *   field named `message` may be the program's own data.
 *
 * From the guide, "Running", "What leaves the device is chosen there":
 *
 * **What leaves the device is chosen there.** The `cause` is whatever was thrown. A `ProgramDefect`'s `key`, like a
 * `CompositionDefect`'s `id`, is the program's own value, as it is, and may hold data.
 */
export class CompositionDefect extends Data.TaggedError('CompositionDefect')<
  Readonly<{
    /** What was broken, for whoever reads the error. */
    message: string
    /** The child's name. */
    child: string
    /** The child's id, for a child by id. */
    id?: unknown
    /** The external message, or the event, it happened on, by its tags (`Cleared`), for one that has one. */
    on?: unknown
  }>
> {}

/**
 * A rule of the program broken, such as a message that cannot arrive or a state that cannot be: what `defect` throws.
 *
 * @example
 * ```ts
 * expect(() => update(Message.Saved())(idle)).toThrow(InvariantDefect)
 * ```
 *
 * @remarks
 * From the guide, "Rejections and defects", "`defect` makes a bug loud":
 *
 * **`defect` makes a bug loud.** `form` throws it on a save that completes while nothing is saving. A rejection there
 * would hide the bug.
 * - The run dies as it dies with any defect (an `Effect.die`, a thrown error: broken code).
 * - The `InvariantDefect` lets a crash report tell a broken rule of the program from any other error.
 * - `defect` is an expression, for a branch of a ternary or a `Match`.
 * - It is for the synchronous functions: `init`, `update`, `onEvent`, `makeModel`, `subscriptions`. Inside an Effect,
 *   `Effect.die` stays.
 *
 * From the guide, "Running", "Its `cause` is the defect itself":
 *
 * **Its `cause` is the defect itself**: an `InvariantDefect` for one thrown with `defect`.
 */
export class InvariantDefect extends Data.TaggedError('InvariantDefect')<
  Readonly<{
    /** Which rule was broken. */
    reason: string
    /** The `reason`, for whoever reads the error. */
    message: string
  }>
> {
  constructor({ reason }: Readonly<{ reason: string }>) {
    super({ reason, message: reason })
  }
}

/**
 * The twin of `reject`, for a message that cannot arrive: throws an `InvariantDefect` with `reason`.
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
 * @remarks
 * From the guide, "Rejections and defects", "`defect` makes a bug loud":
 *
 * **`defect` makes a bug loud.** `form` throws it on a save that completes while nothing is saving. A rejection there
 * would hide the bug.
 * - The run dies as it dies with any defect (an `Effect.die`, a thrown error: broken code).
 * - The `InvariantDefect` lets a crash report tell a broken rule of the program from any other error.
 * - `defect` is an expression, for a branch of a ternary or a `Match`.
 * - It is for the synchronous functions: `init`, `update`, `onEvent`, `makeModel`, `subscriptions`. Inside an Effect,
 *   `Effect.die` stays.
 *
 * From the guide, "Update", "A message that cannot arrive is a defect":
 *
 * **A message that cannot arrive is a defect.** Its arrival is a bug: `update` throws `defect(reason)`, and the run
 * dies (see "Rejections and defects").
 */
export const defect = (reason: string): never => {
  throw new InvariantDefect({ reason })
}
