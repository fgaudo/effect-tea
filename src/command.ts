import type * as Effect from 'effect/Effect'
import type * as Opt from 'effect/Option'

/**
 * How a command happens: an effect that answers with a message, or with `None` when it only acts on the world.
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
 * @remarks
 * From the guide, "Commands", "An execution cannot fail":
 *
 * **An execution cannot fail.** Its type says so: `Execution<Message, R>` is an `Effect<Option<Message>, never, R>`.
 *
 * From the guide, "Commands", "An expected failure becomes a message, as the success does":
 *
 * **An expected failure becomes a message, as the success does.** Then `update` decides what each means.
 *
 * From the guide, "Commands", "An effect that only acts on the world answers `None`":
 *
 * **An effect that only acts on the world answers `None`**: `Effect.as(effect, Opt.none())`, as the bell does.
 *
 * From the guide, "Commands", "A defect (`Effect.die`, a thrown error) ends the run":
 *
 * **A defect (`Effect.die`, a thrown error) ends the run.**
 */
export type Execution<Message, R> = Effect.Effect<Opt.Option<Message>, never, R>

/**
 * The interpreter of a program's commands: it turns each one into the execution that makes it happen.
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
 * @remarks
 * From the guide, "Commands", "In short":
 *
 * A command is **data** that says what `update` decided, usually a `Data.TaggedEnum`: `Command.Save({ name })`. The
 * program's `runCommand` alone turns it into an Effect that may produce one message back. Since the decision is data,
 * tests can assert it without running it.
 *
 * From the guide, "Commands", "A command carries everything it needs":
 *
 * **A command carries everything it needs.** `runCommand` does not see the state. Its services are provided around
 * `run`.
 */
export type RunCommand<Command, Message, R> = (command: Command) => Execution<Message, R>
