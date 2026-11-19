import type * as Channel from "effect/Channel"
import type * as HashMap from "effect/HashMap"

/**
 * Listens to the world while its key is among a program's subscriptions: an Effect `Channel` of messages.
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
 * @see The guide, "Subscriptions", "A subscription never ends in silence".
 * @see The guide, "Subscriptions", "An ended subscription is not restarted".
 * @see The guide, "Guarantees", "Subscriptions follow their keys".
 */
export type Subscription<Message, R = never> = Channel.Channel<Message, never, Message, unknown, unknown, unknown, R>

/**
 * What a program listens to in a state, by key.
 *
 * Keys are compared by value after every change of state. A new key starts its subscription, a kept key leaves it
 * running, and a missing key stops it.
 *
 * @example
 * ```ts
 * const subscriptions: Subscriptions<State, Message> = (state) =>
 *   state.phase._tag === 'Running' ? HashMap.make(['ticks', ticks]) : HashMap.empty()
 * ```
 *
 * @see The guide, "Subscriptions", "Keys are compared by value, after every change of state:".
 * @see The guide, "Guarantees", "Subscriptions follow their keys".
 */
export type Subscriptions<State, Message, R = never, K = unknown> = (
  state: State
) => HashMap.HashMap<K, Subscription<Message, R>>
