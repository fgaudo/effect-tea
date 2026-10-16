import type * as Channel from 'effect/Channel'
import type * as HashMap from 'effect/HashMap'

/**
 * Listens to the world while its key is in the subscriptions: an Effect `Channel` of messages that takes no
 * input and cannot fail. It either never ends (its end value is `never`), or ends with one last message, so
 * that `update` always learns that it is over. An ended subscription is not started again while its key
 * stays: only a key that goes away and comes back starts it anew.
 */
export type Subscription<Message, R> = Channel.Channel<Message, never, Message, unknown, unknown, unknown, R>

export type Subscriptions<K, Message, R> = HashMap.HashMap<K, Subscription<Message, R>>

/** What a program listens to in a state, by key: the engine starts and stops subscriptions as keys come and go. */
export type Subscribe<State, Message, R, K = unknown> = (state: State) => Subscriptions<K, Message, R>
