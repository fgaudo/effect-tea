// Seven type errors a consumer may write over a parent's state, messages, commands, keys and services, in a tree of
// parents that holds every exported program of `consumer.ts` with keys or commands, a parent of parents, and a child
// that needs other services, over what a function written apart reads of children of that tree and tells them, and in
// the options of a child. `smoke.ts` typechecks it with no truncation, and bounds what TypeScript prints: each child's
// program printed with its parent's types would multiply it at each level of the tree.
import {
  child,
  type CommandOf,
  type CommandServicesOf,
  type KeyOf,
  type MessageOf,
  type OutputsOf,
  program,
  type StateOf,
  type TellOf
} from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import { app, greeter, lamps, outer, relay, served } from "./consumer.js"

class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("Clock") {}

const timed = program<{ state: Readonly<{ at: number }>; command: "Now"; message: Readonly<{ _tag: "Timed" }> }>()
  .make({
    init: { state: { at: 0 } },
    update: () => (state) => ({ state, commands: ["Now" as const] }),
    runCommand: () => Effect.as(Effect.service(Clock), Opt.none()),
    makeModel: () => null
  })

const treeOf = program<{ state: Readonly<{ n: number }> }>()

const tree = treeOf.withChildren({
  App: child(app),
  Outer: child(outer),
  Served: child(served),
  Timed: child(timed)
}).make({ init: { state: { n: 0 } }, makeModel: () => null })

declare const pressedUnder: (key: KeyOf<typeof tree>) => Opt.Option<MessageOf<typeof tree>>

// `Arr.filterMap` takes a `Result`, not an `Option`.
export const pressed = (state: StateOf<typeof tree>) =>
  Arr.filterMap(tree.subscriptions(state), (key) => Opt.map(pressedUnder(key), (pressed) => ({ key, pressed })))

declare const command: CommandOf<typeof tree>

export const commanded: number = command

declare const state: StateOf<typeof tree>

export const kept: number = state

declare const services: CommandServicesOf<typeof tree>

export const needed: number = services

// Children with external messages and outputs, beside the whole tree.
const told = { Lamps: child(lamps), Relay: child(relay), Tree: child(tree) }

declare const tell: TellOf<typeof told>

export const telling: number = tell

declare const outputs: OutputsOf<typeof told>

export const reading: number = outputs

// A child with flags given an `Option` of them, as a child that may not be there is given them by `there`, in the call
// of `withChildren`: `smoke.ts` holds that the error is one, which says the type that `flags` takes.
export const greeted = treeOf.withChildren({ Greeter: child(greeter, { flags: (state) => Opt.some(state.n) }) })
