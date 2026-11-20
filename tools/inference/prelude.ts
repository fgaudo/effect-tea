// What every generated case shares: the types a case may name, the child it declares, and the services they need.
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HashMap from "effect/HashMap"
import * as Opt from "effect/Option"
import { program, type Subscription, type Written } from "../../src/index.ts"

export type { Written }

// Unlike two `extends`, it tells `any` and `unknown` apart, and a union from one of its members.
export type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

export type Inc = Readonly<{ _tag: "Inc" }>
export type Reset = Readonly<{ _tag: "Reset" }>
export type Own = Inc | Reset
export type Ext = Reset
export type Cmd = Readonly<{ _tag: "Save" }>
export type Ev = Readonly<{ _tag: "Saved" }>

export class Db extends Context.Service<Db, { readonly ok: boolean }>()("Db") {}
export class Feed extends Context.Service<Feed, { readonly ticks: Subscription<Inc> }>()("Feed") {}
export class KidDb extends Context.Service<KidDb, { readonly ok: boolean }>()("KidDb") {}
export class KidFeed extends Context.Service<KidFeed, { readonly ticks: Subscription<KInc> }>()("KidFeed") {}

export const feed = Channel.unwrap(Effect.map(Effect.service(Feed), (feed) => feed.ticks))

// A subscription that answers nothing: it holds something (a sound, a wake lock) until its key goes.
export class Lock extends Context.Service<Lock, { readonly held: Subscription<never> }>()("Lock") {}
export const held = Channel.unwrap(Effect.map(Effect.service(Lock), (lock) => lock.held))

export type KidState = Readonly<{ k: number }>
export type KInc = Readonly<{ _tag: "KInc" }>
export type KReset = Readonly<{ _tag: "KReset" }>
// What only its parent sends it, through `external`: none of its messages.
export type KidMessage = KInc
export type KidCommand = Readonly<{ _tag: "KSave" }>
export type KidEvent = Readonly<{ _tag: "KDone" }>

const kidPieces = {
  update: (_: KidMessage) => (state: KidState) => ({ state: { k: state.k + 1 }, events: [{ _tag: "KDone" } as const] }),
  external: (_: KReset) => () => ({ state: { k: 0 } }),
  runCommand: () => Effect.as(Effect.service(KidDb), Opt.none()),
  subscriptions: () => HashMap.make(["kid", Channel.unwrap(Effect.map(Effect.service(KidFeed), (feed) => feed.ticks))]),
  makeModel: (state: KidState) => state.k
}

// The child: it has commands, events, an external message and services, so that each is lifted into its parent.
export const kid = program<{
  state: KidState
  model: number
  message: KidMessage
  command: KidCommand
  event: KidEvent
  external: KReset
}>().make({ init: { state: { k: 0 }, commands: [{ _tag: "KSave" }] }, ...kidPieces })

// The same child, started from flags.
export const kidF = program<{
  state: KidState
  model: number
  message: KidMessage
  command: KidCommand
  event: KidEvent
  external: KReset
  flags: number
}>().make({ init: (k) => ({ state: { k }, commands: [{ _tag: "KSave" }] }), ...kidPieces })

export type SNone = Readonly<{ n: number }>
export type SChild = Readonly<{ n: number; kid: KidState }>
export type SChildById = Readonly<{ n: number; kids: Readonly<Record<number, KidState>> }>
export type SInput = Readonly<{ n: number; name: string }>
export type SInputById = Readonly<{ n: number; counts: Readonly<Record<string, number>> }>

export type SMixed = Readonly<{ n: number; kid: KidState; name: string }>

// The message a parent sends to make its child receive an external one.
export type Go = Readonly<{ _tag: "Go" }>

export type MNone = Readonly<{ count: number }>
export type MMixed = Readonly<{ count: number; kid: number; name: string }>
export type MChild = Readonly<{ count: number; kid: number }>
export type MChildById = Readonly<{ count: number; kids: ReadonlyArray<number> }>
export type MInput = Readonly<{ count: number; name: string }>
export type MInputById = Readonly<{ count: number }>

// A parent that declares each generated program as its child: where a wrong `external` is refused.
export type Outer<S> = Readonly<{ inner: S }>
