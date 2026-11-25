import type * as Channel from "effect/Channel"

/**
 * Listens to the world while its key is among a program's subscriptions: an Effect `Channel` of messages, which the
 * program's `listen` makes from the key.
 *
 * It takes no input and cannot fail. Its end value is a message, or `never` for one that never ends. `R` is the
 * services it needs: one that needs none leaves `R` as `never`.
 *
 * - It never ends in silence: either it never ends, or it ends with one last message, its end value.
 * - It starts when a new state brings its key, and it is interrupted when a new state takes its key away.
 * - An ended subscription is not restarted until its key goes away and comes back.
 * - When its key goes away, it releases what it holds, and nothing it sent reaches `update` any more.
 *
 * @example
 * ```ts
 * // `Ticked` once a second, forever, with no services.
 * const ticks: Subscription<Message> = Channel.forever(
 *   Channel.fromEffectDrain(Effect.sleep('1 second')).pipe(
 *     Channel.concatWith(() => Channel.succeed(Message.Ticked())),
 *   ),
 * )
 * ```
 *
 * @see The guide, "Subscriptions".
 * @see The guide, "Guarantees", "Subscriptions follow their keys".
 */
export type Subscription<Message, R = never> = Channel.Channel<Message, never, Message, unknown, unknown, unknown, R>

/**
 * What a program listens to in a state: the keys of its subscriptions, as data, in an array.
 *
 * Keys are compared by value after every change of state. A new key starts its subscription, a kept key leaves it
 * running, and a missing key stops it. A key listed twice is listed once.
 *
 * @example
 * ```ts
 * const subscriptions: Subscriptions<State, 'ticks'> = (state) => state.phase._tag === 'Running' ? ['ticks'] : []
 * ```
 *
 * @see The guide, "Subscriptions".
 * @see The guide, "Guarantees", "Subscriptions follow their keys".
 */
export type Subscriptions<State, Key = unknown> = (state: State) => ReadonlyArray<Key>

/**
 * Makes the subscription of a key, from the key alone.
 *
 * `listen` does not see the state, so a key carries everything that its subscription needs, as a command carries
 * everything that `runCommand` needs. `R` is the services the subscriptions need.
 *
 * - What it throws is a defect of the subscription, with its key. When it is called is unspecified.
 * - A key is shown whole, in a defect and to `onApplied` and `onIgnored`: what must stay private goes in a service.
 *
 * @example
 * ```ts
 * type Key = Data.TaggedEnum<{ Steps: { dt: number } }>
 *
 * const listen: Listen<Key, Message, Screen> = ({ dt }) => steps(dt)
 * ```
 *
 * @see The guide, "Subscriptions".
 * @see The guide, "Running", "A key is shown whole".
 */
export type Listen<Key, Message, R = never> = (key: Key) => Subscription<Message, R>
