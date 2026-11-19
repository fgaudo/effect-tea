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

// The constructors are private, so that each class keeps the one meaning the library gives it: these, set in each
// class's static block, are the only way to build one, and are not exported by the package.
let makeProgramDefect: (fields: Fields) => ProgramDefect
let makeCompositionDefect: (fields: CompositionFields) => CompositionDefect
let makeInvariantDefect: (reason: string) => InvariantDefect

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
 * - `on` names the message by its tags, as the logs do by default. A message that is a string appears whole.
 * - `key` is the subscription's key as it is. Like `cause`, it may hold the program's data.
 * - The run does not log the defect and does not recover from it. Report it, and choose what the user sees next.
 * - Only the run makes one. Read it, as a crash report or a test does: the types refuse a `new` of it.
 *
 * @example
 * ```ts
 * const where = (error: unknown) => error instanceof ProgramDefect ? error.where : 'outside the run'
 * ```
 *
 * @see The guide, "Running", "Its `cause` is the defect itself".
 * @see The guide, "Running", "When a defect happens".
 * @see The guide, "Running", "Its `where` says where it happened".
 * @see The guide, "Running", "How messages and commands appear in the logs".
 * @see The guide, "Running", "The run never recovers from a defect, and does not log it".
 * @see The guide, "Running", "The app around the run chooses what leaves the device".
 */
export class ProgramDefect extends Data.TaggedError('ProgramDefect')<Fields & Readonly<{ message: string }>> {
  static {
    makeProgramDefect = (fields) => new ProgramDefect(fields)
  }

  private constructor(fields: Fields) {
    super({
      ...fields,
      // oxlint-disable-next-line typescript/no-base-to-string -- `on` is a message's tags, or its `typeof`
      message: `A defect in ${described[fields.where]}${fields.on === undefined ? '' : ` on ${String(fields.on)}`}`,
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
 * It is thrown when a child rejects an external message, or when a parent sends one to a child that is not there.
 * Among other cases, it is thrown for a parent's subscription key that a child uses too, and for a `subscribed` that
 * lists an id twice. `on` names the message by its tags, as the logs do by default. `id` is the child's id as it is,
 * and may hold the program's data. Only `program` makes one: a test reads it, and the types refuse a `new` of it.
 *
 * @example
 * ```ts
 * expect(() => app.update({ _tag: 'BackPressed' })(state)).toThrow(CompositionDefect)
 * ```
 *
 * @see The guide, "Composition", "What is a defect".
 * @see The guide, "Events and external messages", "A rejection of an external message is a defect".
 * @see The guide, "Running", "How messages and commands appear in the logs".
 * @see The guide, "Running", "The app around the run chooses what leaves the device".
 */
export class CompositionDefect extends Data.TaggedError('CompositionDefect')<CompositionFields> {
  static {
    makeCompositionDefect = (fields) => new CompositionDefect(fields)
  }

  private constructor(fields: CompositionFields) {
    super(fields)
  }
}

/**
 * A rule of the program broken, such as a message that cannot arrive or a state that cannot be: what `defect` throws.
 *
 * The run dies with it as with any other defect, and it is the `cause` of the `ProgramDefect`. It lets a crash report
 * tell a broken rule of the program from any other error. Only `defect` makes one: a test or a crash report reads it,
 * and the types refuse a `new` of it.
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
  static {
    makeInvariantDefect = (reason) => new InvariantDefect(reason)
  }

  private constructor(reason: string) {
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
  throw makeInvariantDefect(reason)
}

/** Builds the `ProgramDefect` the run dies with: only the engine does. */
export const programDefect = (fields: Fields): ProgramDefect => makeProgramDefect(fields)

/** Builds the `CompositionDefect` of a parent that breaks what it declared: only `program` does. */
export const compositionDefect = (fields: CompositionFields): CompositionDefect => makeCompositionDefect(fields)
