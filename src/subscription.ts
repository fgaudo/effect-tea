import type * as Channel from 'effect/Channel'
import type * as HashMap from 'effect/HashMap'

/**
 * Listens to the world while its key is among a program's subscriptions: an Effect `Channel` of messages.
 *
 * It takes no input and cannot fail. Its end value is a message, or `never` for one that never ends.
 *
 * @example
 * ```ts
 * // `Ticked` once a second, forever: its end value is `never`.
 * const ticks: Subscription<Message, never> = Channel.forever(
 *   Channel.fromEffectDrain(Effect.sleep('1 second')).pipe(
 *     Channel.concatWith(() => Channel.succeed(Message.Ticked())),
 *   ),
 * )
 * ```
 *
 * @remarks
 * From the guide, "Subscriptions", "A subscription never ends in silence":
 *
 * **A subscription never ends in silence.** Either it never ends, or it ends with **one last message**, its end value.
 *
 * From the guide, "Subscriptions", "An ended subscription is not restarted":
 *
 * **An ended subscription is not restarted** until its key goes away and comes back.
 *
 * From the guide, "Guarantees", "Subscriptions follow their keys":
 *
 * **Subscriptions follow their keys.** A subscription starts when a new state brings its key. It is interrupted when a
 * new state takes its key away.
 * - Both happen once that state is published for the renderer, and before the run takes the next message.
 * - A subscription that ends stays ended while its key stays, until the key goes away and comes back.
 * - When the key goes away, the subscription releases what it holds.
 * - After that, nothing it sent reaches `update`, even if the same key comes back later.
 */
export type Subscription<Message, R> = Channel.Channel<Message, never, Message, unknown, unknown, unknown, R>

/**
 * What a program listens to in a state, by key.
 *
 * @example
 * ```ts
 * const subscriptions: Subscriptions<State, Message, never, string> = (state) =>
 *   state.phase._tag === 'Running' ? HashMap.make(['ticks', ticks]) : HashMap.empty()
 * ```
 *
 * @remarks
 * From the guide, "Subscriptions", "Keys are compared by value, after every change of state:":
 *
 * **Keys are compared by value, after every change of state:**
 * - a new key starts its subscription;
 * - a kept key leaves it running;
 * - a missing key stops it.
 *
 * From the guide, "Guarantees", "Subscriptions follow their keys":
 *
 * **Subscriptions follow their keys.** A subscription starts when a new state brings its key. It is interrupted when a
 * new state takes its key away.
 * - Both happen once that state is published for the renderer, and before the run takes the next message.
 * - A subscription that ends stays ended while its key stays, until the key goes away and comes back.
 * - When the key goes away, the subscription releases what it holds.
 * - After that, nothing it sent reaches `update`, even if the same key comes back later.
 */
export type Subscriptions<State, Message, R, K = unknown> = (
  state: State,
) => HashMap.HashMap<K, Subscription<Message, R>>
