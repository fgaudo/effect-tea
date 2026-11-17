import type * as Effect from 'effect/Effect'
import type * as Opt from 'effect/Option'

/**
 * How a command happens: an effect that answers with a message, or with `None` when it only acts on the world.
 *
 * - It cannot fail: its type is an `Effect<Option<Message>, never, R>`.
 * - An expected failure becomes a message, as the success does. Then `update` decides what each means.
 * - An effect that only acts on the world answers `None`.
 * - A defect (`Effect.die`, a thrown error) ends the run.
 *
 * @example
 * ```ts
 * const save = (name: string): Execution<Message, Storage> =>
 *   Effect.flatMap(Effect.service(Storage), (storage) => storage.save(name)).pipe(
 *     Effect.match({ onSuccess: () => Message.Saved(), onFailure: () => Message.SaveFailed() }),
 *     Effect.asSome,
 *   )
 * ```
 *
 * @see The guide, "Commands", "An execution cannot fail".
 * @see The guide, "Commands", "An expected failure becomes a message, as the success does".
 * @see The guide, "Commands", "An effect that only acts on the world answers `None`".
 * @see The guide, "Commands", "A defect (`Effect.die`, a thrown error) ends the run".
 */
export type Execution<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/**
 * The interpreter of a program's commands: it turns each one into the execution that makes it happen.
 *
 * A command is data, and only `runCommand` runs it. It does not see the state, so a command carries everything it
 * needs. Its services are provided around `run`.
 *
 * @example
 * ```ts
 * const runCommand: RunCommand<Command, Message, Storage> = (command) => {
 *   switch (command._tag) {
 *     case 'Save':
 *       return save(command.name)
 *   }
 * }
 * ```
 *
 * @see The guide, "Commands", "In short".
 * @see The guide, "Commands", "A command carries everything it needs".
 */
export type RunCommand<Command, Message, R> = (command: Command) => Execution<Message, R>
