// Four type errors a consumer may write over a parent's state, messages, commands, keys and services, in a tree of
// parents that holds every exported program of `consumer.ts` with keys or commands, a parent of parents, and a child
// that needs other services. `smoke.ts` typechecks it with no truncation, and bounds what TypeScript prints: each
// child's program printed with its parent's types would multiply it at each level of the tree.
import {
  type CommandOf,
  type CommandServicesOf,
  type KeyOf,
  type MessageOf,
  program,
  type StateOf
} from "@fgaudo/effect-tea"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import { app, outer, served } from "./consumer.js"

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
  App: treeOf.child(app),
  Outer: treeOf.child(outer),
  Served: treeOf.child(served),
  Timed: treeOf.child(timed)
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
