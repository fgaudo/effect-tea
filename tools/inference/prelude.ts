// What every generated case shares: the types a case may name, the child it declares, and the services they need.
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import { type MessageOf, program, type Subscription, type Written } from "../../src/index.ts"
import type { Driver, Rehearsal, Simulation } from "../../src/testing/index.ts"

export type { Written }

// Unlike two `extends`, it tells `any` and `unknown` apart, and a union from one of its members.
export type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

export type Inc = Readonly<{ _tag: "Inc" }>
export type Reset = Readonly<{ _tag: "Reset" }>
export type Own = Inc | Reset
export type Ext = Reset
export type Cmd = Readonly<{ _tag: "Save" }>
export type Ev = Readonly<{ _tag: "Saved" }>

// A program written as an object names its commands, events and answers by these: two literals of one tag `as const`
// are two types, whose union is not the type a program names.
export const inc: Inc = { _tag: "Inc" }
export const save: Cmd = { _tag: "Save" }
export const saved: Ev = { _tag: "Saved" }

// A state saved before, as `onApplied` gives it or a reload keeps it, of the type the program names: what a program is
// started from elsewhere, `{ ...program, init: { state: savedState<StateOf<typeof program>>() } }`. Only checked, never
// run.
export declare const savedState: <S>() => S

// What the run of the matrix plays (step 16, point 4): a program, the step it starts from, and the messages it is
// given, written as values of the type it names, which `tsc` checks.
export type Played = Readonly<{ id: string; program: unknown; from: unknown; messages: ReadonlyArray<unknown> }>
export const played = <P>(id: string, program: P, from: unknown, messages: ReadonlyArray<MessageOf<P>>): Played => ({
  id,
  program,
  from,
  messages
})

export class Db extends Context.Service<Db, { readonly ok: boolean }>()("Db") {}
export class Feed extends Context.Service<Feed, { readonly ticks: Subscription<Inc> }>()("Feed") {}
export class KidDb extends Context.Service<KidDb, { readonly ok: boolean }>()("KidDb") {}
export class KidFeed extends Context.Service<KidFeed, { readonly ticks: Subscription<KInc> }>()("KidFeed") {}

export const feed = Channel.unwrap(Effect.map(Effect.service(Feed), (feed) => feed.ticks))

// A subscription that answers nothing: it holds something (a sound, a wake lock) until its key goes.
export class Lock extends Context.Service<Lock, { readonly held: Subscription<never> }>()("Lock") {}
export const held = Channel.unwrap(Effect.map(Effect.service(Lock), (lock) => lock.held))

// A message that no program of the matrix takes, and a subscription that answers it.
export type Other = Readonly<{ _tag: "Other" }>
export const other: Other = { _tag: "Other" }
export class Stray extends Context.Service<Stray, { readonly ticks: Subscription<Other> }>()("Stray") {}
export const stray = Channel.unwrap(Effect.map(Effect.service(Stray), (stray) => stray.ticks))

// The types each function that takes a program gives back, read from what it returns.
export type StartRead<S> = S extends {
  readonly app: { readonly model: () => infer M; readonly dispatch: (message: infer Message) => unknown }
  readonly run: Effect.Effect<never, never, infer R>
} ? { model: M; message: Message; services: R }
  : never
export type DriveRead<D> = D extends Effect.Effect<Driver<infer M, infer Message>, infer _E, infer R>
  ? { model: M; message: Message; services: R }
  : never
export type RehearseRead<X> = X extends
  Effect.Effect<Rehearsal<infer S, infer M, infer Message, infer C, infer E, infer RC, infer RS>, infer _E, infer _R> ?
  {
    state: S
    model: M
    message: Message
    command: C
    event: E
    commandServices: RC
    subscriptionServices: RS
  }
  : never
export type SimulateRead<F> = F extends (
  ...args: ReadonlyArray<never>
) => Effect.Effect<Simulation<infer S, infer Message, infer C, infer E>, infer _E, infer R>
  ? { state: S; message: Message; command: C; event: E; commandServices: R }
  : never

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
  subscriptions: (): ReadonlyArray<"kid"> => ["kid"],
  listen: () => Channel.unwrap(Effect.map(Effect.service(KidFeed), (feed) => feed.ticks)),
  makeModel: (state: KidState) => state.k,
  output: (state: KidState) => state.k > 0
}

// The child: it has commands, events, an external message, an output and services, so that each is lifted into its
// parent, and its output read by it.
export const kid = program<{
  state: KidState
  model: number
  message: KidMessage
  command: KidCommand
  event: KidEvent
  external: KReset
  output: boolean
  key: "kid"
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
  output: boolean
  key: "kid"
}>().make({ init: (k) => ({ state: { k }, commands: [{ _tag: "KSave" }] }), ...kidPieces })

export type SNone = Readonly<{ n: number }>
// A parent's own state: whether its child alone is there, or the ids of its children by id. The library keeps the
// children's states beside it.
export type SChild = Readonly<{ n: number; open: boolean }>
export type SChildById = Readonly<{ n: number; ids: ReadonlyArray<number> }>
export type SInput = Readonly<{ n: number; name: string }>
export type SInputById = Readonly<{ n: number; counts: Readonly<Record<string, number>> }>

export type SMixed = Readonly<{ n: number; open: boolean; name: string }>

// The message a parent sends to make its child receive an external one.
export type Go = Readonly<{ _tag: "Go" }>

export type MNone = Readonly<{ count: number }>
export type MMixed = Readonly<{ count: number; kid: number; name: string }>
export type MChild = Readonly<{ count: number; kid: number }>
export type MChildById = Readonly<{ count: number; kids: ReadonlyArray<number> }>
export type MInput = Readonly<{ count: number; name: string }>
export type MInputById = Readonly<{ count: number }>

// The own state of a parent that declares each generated program as its child: where a wrong `external` is refused.
export type OuterOwn = Readonly<{ m: number }>
