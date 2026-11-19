import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import type { Subscription } from "../src/subscription.ts"

/**
 * A subscription that sends nothing and holds a release: the step that takes its key away waits until `release` ends,
 * as the loop waits for every release. The options are functions, so a release is what holds the loop inside a step;
 * what a test queues meanwhile is taken once the step is over.
 */
export const gate = <Message = never>(release: Effect.Effect<void>): Subscription<Message> =>
  Channel.unwrap(Effect.as(Effect.addFinalizer(() => release), Channel.never))
