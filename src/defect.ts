import * as Data from 'effect/Data'

/**
 * Where a defect happened, as a `ProgramDefect` says it in `where`.
 *
 * - `'update'` includes `onEvent`.
 * - `'subscriptions'` includes the `Equal` and `Hash` of the keys.
 * - `'render'` includes the view and `makeModel`.
 * - An option's name means that option. `'log'` means one of the run's own debug logs.
 * - A defect in a log of the program's own is in the place it logs from.
 *
 * @example
 * ```ts
 * const report = (defect: ProgramDefect) => defect.where === 'update' ? `${defect.on}` : defect.where
 * ```
 *
 * @see The guide, "Running", "Its `where` says where it happened".
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
 * - `cause` is what was thrown: an `InvariantDefect` for one thrown with `defect`.
 * - `on` names the message by its tags, as the logs do. A message that is a string appears whole.
 * - `key` is the subscription's key as it is. Like `cause`, it may hold the program's data.
 * - The run does not log the defect and does not recover from it. Report it, and choose what the user sees next.
 *
 * @example
 * ```ts
 * const where = (error: unknown) => error instanceof ProgramDefect ? error.where : 'outside the run'
 * ```
 *
 * @see The guide, "Running", "Its `cause` is the defect itself".
 * @see The guide, "Running", "Its `where` says where it happened".
 * @see The guide, "Running", "How messages and commands appear in the logs".
 * @see The guide, "Running", "The run never recovers from a defect, and does not log it".
 * @see The guide, "Running", "What leaves the device is chosen there".
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
 * It is thrown when a child rejects an external message, or gets one while it is not there. Among other cases, it is
 * thrown for a parent's subscription key that a child uses too, and for a `subscribed` that lists an id twice. `on`
 * names the message by its tags, as the logs do. `id` is the child's id as it is, and may hold the program's data.
 *
 * @example
 * ```ts
 * expect(() => app.update({ _tag: 'BackPressed' })(state)).toThrow(CompositionDefect)
 * ```
 *
 * @see The guide, "Composition", "What is a defect".
 * @see The guide, "Composition", "A rejection of an external message is a defect".
 * @see The guide, "Running", "How messages and commands appear in the logs".
 * @see The guide, "Running", "What leaves the device is chosen there".
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
 * The run dies with it as with any other defect, and it is the `cause` of the `ProgramDefect`. It lets a crash report
 * tell a broken rule of the program from any other error.
 *
 * @example
 * ```ts
 * expect(() => update(Message.Saved())(idle)).toThrow(InvariantDefect)
 * ```
 *
 * @see The guide, "Rejections and defects", "`defect` makes a bug loud".
 * @see The guide, "Running", "Its `cause` is the defect itself".
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
 * The run dies, as with any other defect. `defect` is an expression, for a branch of a ternary or a `Match`. Use it in
 * the synchronous functions: `init`, `update`, `onEvent`, `makeModel`, `subscriptions`. Inside an Effect, use
 * `Effect.die`.
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
 * @see The guide, "Rejections and defects", "`defect` makes a bug loud".
 * @see The guide, "Update", "A message that cannot arrive is a defect".
 */
export const defect = (reason: string): never => {
  throw new InvariantDefect({ reason })
}
