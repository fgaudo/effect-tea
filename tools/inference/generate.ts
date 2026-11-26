// The inference matrix: generates programs in each way they can be written, into `.inference/`, and checks with `tsc`
// that their types keep the three rules of `AGENTS.md` ("What belongs here"). Run by hand after a change of the types
// of `program.ts` or `compose.ts`; it fails when it finds a lead.
//
// A program is written in each form: made with `make`, typed `Program<…>` by hand, either of them started from another
// state (`{ ...program, init }`), and as an object not typed `Program<…>`, in a constant, in the call, or spread from a
// typed one. A program of `make` crosses what it names, its subscriptions, its output, whether its own pieces need
// services, and its children: none, a child alone or by id, a child beside one of other types, and a child that lacks
// one of its pieces; the axes that came last are crossed with the names in pairs
// (`crossings`). Each valid case asserts, with `Exactly`, the state, model, messages, commands, events, external
// messages, flags, services, keys and output read back from the program, and is given to every function that takes a
// program:
// `Program<…>` of the expected types, `start`, `drive`, `rehearse`, `simulate`, `child` and `childById`, each in a part
// of its own, which must take it and give back the same types, or refuse it where the table of the differences meant
// says (`checks`, `refusesEvents`, `formsRefused`). A broken program of `make` must fail to compile where it is made;
// one written as an object must be refused by each function that checks the piece it breaks, and taken by the others.
// The forms are judged by the rule of `AGENTS.md`: a form may be refused, but it is never taken wrongly. So a lead is a
// part that fails where it should compile, but a valid program in a form not typed that a function refuses is a note;
// or a part that compiles where it should not, or that gives back other types. The run of a program that needs no
// service compiles with `Effect.runFork`, the parent's of a child too. And each message a program can have, its own,
// and a child's, is given to every function that takes one, the dispatch of a run and of a driver, `forwardTo`,
// the `send` of a driver and of a rehearsal, `hear`, `simulate` and `applyAll`, in each form it is written: a literal,
// built by a constructor of `Data.taggedEnum` over the program's own messages or over its whole message, and a value
// typed `MessageOf`; each must take it, and name the program's message. A scale of parents with 1 to 64 children
// measures the time to check one, and the size of its declarations.
//
// With `--run`, the matrix writes instead the programs of its valid cases, one for each that runs differently, alone
// and as a child, each with the messages it is given as values of its own type; checks them with `tsc`; and plays
// them in `play.ts`, with lists of those messages drawn by fast-check from one seed. A program that dies of a defect,
// or whose simulation never ends, is a lead: what compiles runs without a defect the types could prevent, the second
// rule.
//
//   bun run inference [--typescript 5.9,6.0,7.0] [--exact true,false] [--unchecked true,false] [--filter <substring>]
//     [--scale 1,2,4,8,16,32,64] [--jobs <n>] [--run [--runs <n>] [--seed <n>]]
//   bun run inference --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Opt from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import { exec, Failed, main, repository, step } from "../cli.ts"
import type { Death } from "./play.ts"

const out = Effect.gen(function*() {
  const path = yield* Path.Path
  return path.join(yield* repository, ".inference")
})

const write = Effect.fnUntraced(function*(file: string, text: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fs.makeDirectory(path.dirname(file), { recursive: true })
  yield* fs.writeFileString(file, text)
})

const readJson = Effect.fnUntraced(function*(file: string) {
  const fs = yield* FileSystem.FileSystem
  return JSON.parse(yield* fs.readFileString(file))
})

type Name = "model" | "message" | "command" | "event" | "external" | "flags" | "output"
// `message` is named exactly when the program has an `update`: it follows from the form of `update`. `output` is an
// axis of its own, crossed as the other axes of point 6 of step 16 are (`crossings`).
const names: ReadonlyArray<Name> = ["model", "command", "event", "external", "flags"]
// What the program listens to: nothing, a key whose subscription answers an own message, or one that answers none (it
// only runs until its key goes). Spike of step 30: a program that names no key has no `subscriptions`, so the empty
// map of before is the special case that is refused.
type Subs = "none" | "emits" | "silent"
// `pair` is a child alone beside a child by id of other types, `pal`.
type Comp = "none" | "child" | "childById" | "pair"
// What the child lacks, beside the child of the prelude, which lacks nothing: its commands, its events, its external
// message, its output, its keys, the services of its commands and subscriptions, or all of them and its messages too.
type KidShape = "full" | "commands" | "events" | "external" | "output" | "keys" | "services" | "bare"
const kidShapes: ReadonlyArray<KidShape> = ["commands", "events", "external", "output", "keys", "services", "bare"]
// `outside`: a constant given to `make` by name, typed `Update<…>`, or, for a parent, returning a `Transition<…>`
// that names what it tells.
type UpdateForm = "absent" | "annotated" | "contextual" | "outside"
// The options of a child, beside what lists it: always there, started again on another key, there in some states, or
// listening in some. A child with flags is there where they are given.
type ChildOptions = "plain" | "key" | "there" | "listening"
// How a parent's step tells its child an external message, in `update`, `external` and `onEvent`: not at all, in a
// step written inline, in a ternary beside `reject` (or, where a step is required, beside another step), in a
// `switch`, or mapped over the ids of children by id.
type Tell = "none" | "inline" | "ternary" | "switch" | "mapped"
type Violation =
  | "wrongMessage"
  | "wrongModel"
  | "wrongCommand"
  | "missingRunCommand"
  | "wrongEvent"
  | "missingExternal"
  | "externalUnnamed"
  | "externalRejects"
  | "wrongExternal"
  | "externalToChild"
  | "unnamedCommand"
  | "unnamedEvent"
  | "flagsStep"
  | "flagsUnnamed"
  | "wrongInitState"
  | "missingOnEvent"
  | "ownToChild"
  | `clash.${Width}`
  | `commandClash.${Width}`
  | "extraRunCommand"
  | "missingUpdate"
  | "updateUnnamed"
  | "tellWrongChild"
  | "tellWithoutChildren"
  | "tellInInit"
  | "tellMissingId"
  | "tellWrongId"

// How wide the tag of a message or command that takes the name of a child is: the name itself, any
// string, a template that the name matches, `any`, or the name as an optional tag.
type Width = "literal" | "string" | "template" | "any" | "optional"
const widths: ReadonlyArray<Width> = ["literal", "string", "template", "any", "optional"]
const clashing = (tag: string, width: Width) => {
  switch (width) {
    case "literal":
      return `Readonly<{ _tag: '${tag}' }>`
    case "string":
      return "Readonly<{ _tag: string }>"
    case "template":
      return `Readonly<{ _tag: \`${tag.slice(0, 1)}\${string}\` }>`
    case "any":
      return "Readonly<{ _tag: any }>"
    case "optional":
      return `Readonly<{ _tag?: '${tag}' }>`
  }
}
const widthOf = (v: Violation | undefined, kind: "clash" | "commandClash") =>
  v?.startsWith(`${kind}.`) ? (v.slice(kind.length + 1) as Width) : undefined

type Case = Readonly<{
  id: string
  named: ReadonlySet<Name>
  comp: Comp
  update: UpdateForm
  subs: Subs
  kidFlags: boolean
  // The child's options: always there, started again on a key, there in some states, or listening in some.
  childOptions: ChildOptions
  // How the parent's steps tell its child an external message.
  tell: Tell
  // The pieces of `make` in the order of the guide, or the reverse.
  order: "canonical" | "reversed"
  // Every parameter that can be annotated is.
  annotate: boolean
  // Whether its own commands and subscriptions need services, as they do but where the axis says otherwise.
  services: boolean
  // What its child lacks.
  kid: KidShape
  violation?: Violation
}>

const isKid = (comp: Comp) => comp !== "none"
const S: Record<Comp, string> = {
  none: "SNone",
  child: "SChild",
  childById: "SChildById",
  pair: "SPair"
}
const M: Record<Comp, string> = {
  none: "MNone",
  child: "MChild",
  childById: "MChildById",
  pair: "MPair"
}
const inferredModel: Record<Comp, string> = {
  none: "{ count: number }",
  child: "{ count: number; kid: number }",
  childById: "{ count: number; kids: number[] }",
  pair: "{ count: number; kid: number; pals: string[] }"
}
const tagOf: Record<Comp, string> = {
  none: "Kid",
  child: "Kid",
  childById: "Kid",
  pair: "Kid"
}

// The child's own types, by what it lacks.
const kidTypesOf = (shape: KidShape) => {
  const lacks = (piece: KidShape) => shape === piece || shape === "bare"
  return {
    message: shape === "bare" ? "never" : "KidMessage",
    command: lacks("commands") ? "never" : "KidCommand",
    event: lacks("events") ? "never" : "KidEvent",
    external: lacks("external") ? "never" : "KReset",
    output: lacks("output") ? "never" : "boolean",
    key: lacks("keys") ? "never" : "'kid'",
    commandServices: lacks("commands") || lacks("services") ? "never" : "KidDb",
    subscriptionServices: lacks("keys") || lacks("services") ? "never" : "KidFeed"
  }
}

// The child of a shape, started from flags or not: the prelude's, which lacks nothing, or one of `kids.ts`.
const kidName = (shape: KidShape, flags: boolean) =>
  shape === "full" ? (flags ? "kidF" : "kid") : `Kids.${shape}${flags ? "F" : ""}`

// The module of the children that lack a piece, `kids.ts`, written beside the cases: each made as the prelude's child
// is, less what it lacks.
const kidsModule = () =>
  [
    "import * as Channel from 'effect/Channel'",
    "import * as Effect from 'effect/Effect'",
    "import * as Opt from 'effect/Option'",
    "import { program } from '../src/index.ts'",
    "import { KidDb, KidFeed, type KidCommand, type KidEvent, type KidMessage, type KidState, type KReset } from"
    + " '../tools/inference/prelude.ts'",
    ...kidShapes.flatMap((shape) =>
      [false, true].map((flags) => {
        const t = kidTypesOf(shape)
        const named = (name: string, type: string) => type === "never" ? [] : [`${name}: ${type}`]
        const fields = [
          "state: KidState",
          "model: number",
          ...named("message", t.message),
          ...named("command", t.command),
          ...named("event", t.event),
          ...named("external", t.external),
          ...(flags ? ["flags: number"] : []),
          ...named("output", t.output),
          ...named("key", t.key)
        ]
        const commands = t.command === "never" ? "" : ", commands: [{ _tag: 'KSave' }]"
        const free = shape === "services"
        const pieces = [
          flags ? `init: (k) => ({ state: { k }${commands} }),` : `init: { state: { k: 0 }${commands} },`,
          ...(t.message === "never" ? [] : [
            `update: () => (state) => ({ state: { k: state.k + 1 }${
              t.event === "never" ? "" : ", events: [{ _tag: 'KDone' }]"
            } }),`
          ]),
          ...(t.external === "never" ? [] : ["external: () => () => ({ state: { k: 0 } }),"]),
          ...(t.command === "never" ? [] : [
            free
              ? "runCommand: () => Effect.succeedNone,"
              : "runCommand: () => Effect.as(Effect.service(KidDb), Opt.none()),"
          ]),
          ...(t.key === "never" ? [] : [
            "subscriptions: () => ['kid'],",
            free
              ? "listen: () => Channel.never,"
              : "listen: () => Channel.unwrap(Effect.map(Effect.service(KidFeed), (feed) => feed.ticks)),"
          ]),
          "makeModel: (state) => state.k,",
          ...(t.output === "never" ? [] : ["output: (state) => state.k > 0,"])
        ]
        return [
          "",
          `export const ${shape}${flags ? "F" : ""} = program<{ ${fields.join("; ")} }>().make({`,
          ...pieces.map((piece) => `  ${piece}`),
          "})"
        ].join("\n")
      })
    )
  ].join("\n") + "\n"

// The own messages the program has: those it names, or none.
const ownOf = (c: Case) => c.named.has("message") ? "Own" : "never"

const isValid = (c: Case) => c.violation === undefined

// Broken rules that would compile and still work: an `update` or an `external` that nothing calls, a `runCommand` that
// nothing runs.
const harmless: ReadonlySet<Violation> = new Set<Violation>(["updateUnnamed", "externalUnnamed", "extraRunCommand"])
const verdictOf = (c: Case): Verdict =>
  isValid(c) ? true : c.violation !== undefined && harmless.has(c.violation) ? "refused" : false

// One item of a `tell`, to the child: by its id for children by id.
const itemOf = (c: Case, tag: "KInc" | "KReset") => {
  const v = c.violation
  const name = v === "tellWrongChild" ? "Other" : "Kid"
  const id = c.comp !== "childById" || v === "tellMissingId" ? "" : v === "tellWrongId" ? "id: '1', " : "id: 1, "
  return `{ _tag: '${name}', ${id}message: { _tag: '${tag}' } }`
}

// What a step tells the child: a list written inline, or one mapped over the ids of the state. Beside `pal`, the list
// tells it too.
const tellsOf = (c: Case, tag: "KInc" | "KReset") =>
  c.tell === "mapped"
    ? `state.ids.map((id) => ({ _tag: 'Kid', id, message: { _tag: '${tag}' } }))`
    : `[${itemOf(c, tag)}${c.comp === "pair" ? ", { _tag: 'Pal', id: 1, message: { _tag: 'PClear' } }" : ""}]`

// The child's options, the second argument of `child` or `childById`, as the case writes it.
const childOptionsOf = (c: Case, a: (type: string) => string) => {
  const s = `state${a(S[c.comp])}`
  if (c.comp === "childById") {
    const listed = c.kidFlags
      ? `flags: (${s}) => state.ids.map((id) => [id, state.n] as const)`
      : `ids: (${s}) => state.ids`
    const listening = c.childOptions === "listening" ? `, listening: (${s}, id${a("number")}) => id > 0` : ""
    return `, { ${listed}${listening} }`
  }
  const fields = [
    ...(c.kidFlags ? [`flags: (${s}) => state.open ? Opt.some(state.n) : Opt.none()`] : []),
    ...(c.childOptions === "key" ? [`key: (${s}) => state.open`] : []),
    ...(c.childOptions === "there" ? [`there: (${s}) => state.open`] : []),
    ...(c.childOptions === "listening" ? [`listening: (${s}) => state.n > 0`] : [])
  ]
  return fields.length === 0 ? "" : `, { ${fields.join(", ")} }`
}

// Whether the child alone may not be there, so that its model is an `Option`.
const sometimes = (c: Case) => c.comp !== "childById" && (c.kidFlags || c.childOptions === "there")

// A part of a case, checked apart by its lines: the program, or what one function makes of it. A case of one part is
// reported by its id, and a part of a case of several by `<id>/<label>`.
type Part = Readonly<{ label: string; valid: Verdict; lines: ReadonlyArray<string> }>
type Member = Readonly<{ id: string; parts: ReadonlyArray<Part> }>

// The types of a program, as the readers of `program.ts` give them back.
type Types = Readonly<{
  state: string
  model: string
  message: string
  command: string
  event: string
  external: string
  flags: string
  commandServices: string
  subscriptionServices: string
  key: string
  output: string
}>
const readers: Readonly<Record<keyof Types, string>> = {
  state: "StateOf",
  model: "ModelOf",
  message: "MessageOf",
  command: "CommandOf",
  event: "EventOf",
  external: "ExternalOf",
  flags: "FlagsOf",
  commandServices: "CommandServicesOf",
  subscriptionServices: "SubscriptionServicesOf",
  key: "KeyOf",
  output: "OutputOf"
}
const readerLines = (name: string, types: Types, prefix = "") =>
  Object.entries(readers).map(([key, reader]) =>
    `  const ${prefix}${key}: Exactly<${reader}<typeof ${name}>, ${types[key as keyof Types]}> = true`
  )
const fieldsOf = (types: Types) => Object.entries(types).map(([key, type]) => `${key}: ${type}`).join("; ")

// The functions that take a program (step 16, point 3), and `Program<…>`, the type a function that takes one names.
// Each is given the program, and must take it or refuse it as the table below says, and give back its types.
type Use = "typed" | "start" | "drive" | "rehearse" | "simulate" | "child" | "childById"
const uses: ReadonlyArray<Use> = ["typed", "start", "drive", "rehearse", "simulate", "child", "childById"]

// The pieces of a program a function may check, with the parent's `onEvent` for a child's events.
type Piece =
  | "state"
  | "init"
  | "update"
  | "subscriptions"
  | "makeModel"
  | "runCommand"
  | "listen"
  | "external"
  | "output"
  | "onEvent"
const pieces: ReadonlyArray<Piece> = [
  "state",
  "init",
  "update",
  "subscriptions",
  "makeModel",
  "runCommand",
  "listen",
  "external",
  "output",
  "onEvent"
]
const running: ReadonlySet<Piece> = new Set<Piece>([
  "state",
  "init",
  "update",
  "subscriptions",
  "makeModel",
  "runCommand",
  "listen"
])
// The differences meant between the functions: the pieces each one checks. A program broken in a piece is refused by
// those that check it, and taken by the others, which never call it: only a parent calls `external` and reads
// `output`, which `start` and `drive` check all the same, as their row names them, and `rehearse` does not; and
// `simulate` calls `update`, `subscriptions` and `runCommand` alone, reads its state from `init` where it is given one,
// and does not read keys. And `start` and `drive` refuse a program with events, which only a parent hears.
const checks: Readonly<Record<Use, ReadonlySet<Piece>>> = {
  typed: new Set(pieces.filter((piece) => piece !== "onEvent")),
  start: new Set<Piece>([...running, "external", "output"]),
  drive: new Set<Piece>([...running, "external", "output"]),
  rehearse: running,
  simulate: new Set<Piece>(["state", "init", "update", "subscriptions", "runCommand"]),
  child: new Set(pieces),
  childById: new Set(pieces)
}
const refusesEvents: ReadonlySet<Use> = new Set<Use>(["start", "drive"])
// The forms of a program written as an object that a function refuses as the owner decided, each a form that repeats
// another: what such a function refuses there is a note when it compiles, never a lead.
const formsRefused: ReadonlyArray<Readonly<{ form: string; uses: ReadonlyArray<Use>; why: string }>> = [
  {
    form: "call.contextual",
    uses: ["child", "childById"],
    // `docs/records/program-checks.md`, finding 1: the check is needed for the name of `P`.
    why: "a child is checked by the types read back from it, which leaves a parameter of a child written in the call"
      + " that is not annotated without a type"
  },
  {
    form: "spread.contextual",
    uses: uses.filter((use) => use !== "typed"),
    // Weighed by step 38, and the rule since `Shape` infers the message from `update` alone.
    why: "the messages of a program are inferred from its `update`, whose parameter not annotated, written again over a"
      + " program spread, names none"
  }
]
// `form` is given for a program written as an object not typed `Program<…>`, alone among the forms.
const verdictFor = (use: Use, events: boolean, broken: Piece | undefined, form?: string): Verdict =>
  (broken !== undefined && checks[use].has(broken)) || (events && refusesEvents.has(use))
    ? false
    : formsRefused.some((refused) => refused.form === form && refused.uses.includes(use))
    ? "refused"
    : form === undefined
    ? true
    : "untyped"

// What a parent of the program reads back of it, as its child alone or as its children by id.
const parentTypes = (types: Types, byId: boolean): Types => {
  const at = byId ? " & Readonly<{ id: number }>" : ""
  const external = types.external !== "never"
  return {
    state: `Kept<OuterOwn, { readonly Inner: ${
      byId ? `HashMap.HashMap<number, Instance<${types.state}>>` : `Opt.Option<Instance<${types.state}>>`
    } }>`,
    // Its model beside its output, which the parent reads where the program has one.
    model: types.output === "never" ? types.model : `readonly [${types.model}, ${types.output}]`,
    message: `${external ? "Go | " : ""}Readonly<{ _tag: 'Inner'; message: ${types.message}; instance?: number }>${at}`,
    command: types.command === "never"
      ? "never"
      : `Readonly<{ _tag: 'Inner'; instance: number; command: ${types.command} }>${at}`,
    event: "never",
    external: external ? types.external : "never",
    flags: "never",
    commandServices: types.commandServices,
    subscriptionServices: types.subscriptionServices,
    key: types.key === "never" ? "never" : `Readonly<{ _tag: 'Inner'; instance: number; key: ${types.key} }>${at}`,
    output: "never"
  }
}

// The program given to a parent that uses all it has: its flags, its external message, told from the parent's `update`
// and passed on from its `external`, and its events, unless the case leaves out `onEvent`.
const parentLines = (byId: boolean, program: string, types: Types, assert: boolean, onEvent: boolean) => {
  const external = types.external !== "never"
  const flagged = types.flags !== "never"
  const id = byId ? ", id: 1" : ""
  const childOptions = byId
    ? flagged
      ? ", { flags: (): ReadonlyArray<readonly [number, number]> => [[1, 3]] }"
      : ", { ids: (): ReadonlyArray<number> => [1] }"
    : flagged
    ? ", { flags: () => Opt.some(3) }"
    : ""
  const lines = [
    `  const Parent = program<{ state: OuterOwn${external ? `; message: Go; external: ${types.external}` : ""} }>()`,
    `  const parent = Parent.withChildren({ Inner: Parent.${
      byId ? "childById" : "child"
    }(${program}${childOptions}) }).make({`,
    "    init: { state: { m: 0 } },"
  ]
  if (external) {
    lines.push(`    update: () => (state) => ({ state, tell: [{ _tag: 'Inner'${id}, message: { _tag: 'Reset' } }] }),`)
    lines.push(`    external: (message) => (state) => ({ state, tell: [{ _tag: 'Inner'${id}, message }] }),`)
  }
  if (types.event !== "never" && onEvent) {
    lines.push(`    onEvent: { Inner: ${byId ? "(id, event)" : "(event)"} => (state) => ({ state }) },`)
  }
  const read = (what: string) =>
    byId ? `children.Inner${what}(1)` : flagged ? `Opt.getOrThrow(children.Inner${what}())` : `children.Inner${what}()`
  lines.push(
    `    makeModel: (_, children) => ${
      types.output === "never" ? read("") : `[${read("")}, ${read(".output")}] as const`
    },`
  )
  lines.push("  })")
  if (!assert) return lines
  const services = servicesOf(types)
  return [
    ...lines,
    ...readerLines("parent", parentTypes(types, byId), "parent_"),
    "  const parentStarted = start(parent)",
    `  const parent_run: Exactly<StartRead<typeof parentStarted>['services'], ${services}> = true`,
    ...forkLines("parentStarted", services)
  ]
}

const servicesOf = (types: Types) => `${types.commandServices} | ${types.subscriptionServices}`

// The run of a program that needs no service is run as it is, which api-4 broke for a parent of a child written as an
// object: its run asked for `unknown` (step 16, point 4).
const forkLines = (started: string, services: string) =>
  services.split(" | ").every((service) => service === "never")
    ? [`  const forked = () => Effect.runFork(${started}.run)`]
    : []

// What one function makes of `program`, an expression: a name, or the object written in the call. `assert` checks the
// types it gives back, which a broken program, taken by a function that does not check what is broken, need not keep.
const useLines = (use: Use, program: string, types: Types, assert: boolean, onEvent: boolean) => {
  const flags = types.flags === "never" ? "" : ", { flags: 3 }"
  const services = servicesOf(types)
  const read = (reader: string, name: string, fields: Readonly<Record<string, string>>) =>
    assert
      ? Object.entries(fields).map(([key, type]) =>
        `  const read_${key}: Exactly<${reader}<typeof ${name}>['${key}'], ${type}> = true`
      )
      : []
  switch (use) {
    case "typed":
      return [`  const typed: Program<{ ${fieldsOf(types)} }> = ${program}`]
    case "start":
      return [
        `  const started = start(${program}${flags})`,
        ...read("StartRead", "started", { model: types.model, message: types.message, services }),
        ...(assert ? forkLines("started", services) : [])
      ]
    case "drive":
      return [
        `  const driven = drive(${program}, (driver) => Effect.succeed(driver)${flags})`,
        ...read("DriveRead", "driven", { model: types.model, message: types.message, services })
      ]
    case "rehearse":
      return [
        `  const rehearsed = rehearse(${program}, (rehearsal) => Effect.succeed(rehearsal)${flags})`,
        ...read("RehearseRead", "rehearsed", {
          state: types.state,
          model: types.model,
          message: types.message,
          command: types.command,
          event: types.event,
          commandServices: types.commandServices,
          subscriptionServices: types.subscriptionServices
        })
      ]
    case "simulate":
      return [
        `  const simulated = simulate(${program}, [], undefined as never)`,
        ...read("SimulateRead", "simulated", {
          state: types.state,
          message: types.message,
          command: types.command,
          event: types.event,
          commandServices: types.commandServices
        })
      ]
    case "child":
    case "childById":
      return parentLines(use === "childById", program, types, assert, onEvent)
  }
}

// The parts of the functions given `program`, each in a block of its own, with its verdict from the table above.
const usesOf = (
  program: string,
  types: Types,
  given: ReadonlyArray<Use>,
  options: Readonly<{ broken?: Piece | undefined; onEvent?: boolean; form?: string }> = {}
): ReadonlyArray<Part> =>
  given.map((use) => ({
    label: use,
    valid: verdictFor(use, types.event !== "never", options.broken, options.form),
    lines: [
      "  {",
      ...useLines(use, program, types, options.broken === undefined, options.onEvent ?? true).map((line) =>
        `  ${line}`
      ),
      "  }"
    ]
  }))

// A case's program, `made`, and the types a valid one gives back.
const madeOf = (c: Case): Readonly<{ lines: ReadonlyArray<string>; expected: Types }> => {
  const v = c.violation
  const has = (name: Name) => c.named.has(name)
  const a = (type: string) => (c.annotate ? `: ${type}` : "")
  const state = S[c.comp]
  const own = ownOf(c)
  const kidded = isKid(c.comp)
  const pair = c.comp === "pair"
  const kt = kidTypesOf(c.kid)
  // Whether the parent reads its child's output: where the child has one.
  const reads = kidded && kt.output !== "never"
  const typeFields = [`state: ${state}`]
  if (has("model")) typeFields.push(`model: ${M[c.comp]}`)
  if (has("message")) {
    const width = widthOf(v, "clash")
    typeFields.push(width === undefined ? "message: Own" : `message: Own | ${clashing(tagOf[c.comp], width)}`)
  }
  if (has("command")) {
    const width = widthOf(v, "commandClash")
    typeFields.push(width === undefined ? "command: Cmd" : `command: Cmd | ${clashing(tagOf[c.comp], width)}`)
  }
  if (has("event")) typeFields.push("event: Ev")
  if (has("external")) typeFields.push("external: Ext")
  if (has("flags")) typeFields.push("flags: number")
  if (has("output")) typeFields.push("output: boolean")
  const ownKey = c.subs === "emits" ? "'own'" : c.subs === "silent" ? "'lock'" : "never"
  if (c.subs !== "none") typeFields.push(`key: ${ownKey}`)
  const T = `{ ${typeFields.join("; ")} }`
  const functions = kidded ? ["withChildren"] : ["make"]
  if (pair) functions.push("child", "childById")
  else if (c.comp !== "none") functions.push(c.comp)
  const lines: Array<string> = []
  lines.push(`  const { ${functions.join(", ")} } = program<${T}>()`)
  const entries: Array<string> = []
  // init: a step of the parent's own state, from which the library starts the child.
  const flagsHere = v === "flagsStep" ? false : v === "flagsUnnamed" ? true : has("flags")
  const n = flagsHere ? "flags" : "0"
  const ownCommands = has("command") || v === "unnamedCommand" ? ["{ _tag: 'Save' }"] : []
  const nValue = v === "wrongInitState" ? `String(${n})` : n
  const stateValue = {
    none: `{ n: ${nValue} }`,
    child: `{ n: ${nValue}, open: true }`,
    childById: `{ n: ${nValue}, ids: [1] }`,
    pair: `{ n: ${nValue}, open: true, ids: [1] }`
  }[c.comp]
  const initCommands = ownCommands.length > 0 ? `, commands: [${ownCommands.join(", ")}]` : ""
  const initTell = v === "tellInInit" ? `, tell: [${itemOf(c, "KReset")}]` : ""
  const initStep = `{ state: ${stateValue}${initCommands}${initTell} }`
  entries.push(flagsHere ? `    init: (flags${a("number")}) => (${initStep}),` : `    init: ${initStep},`)
  // What the parent's `update` reads of its child's output, and its type, for a step written apart: by id for children
  // by id, an `Option` for a child alone that may not be there.
  const output = c.comp === "childById"
    ? "children.Kid.output(1)"
    : sometimes(c)
    ? "Opt.getOrElse(children.Kid.output(), () => false)"
    : "children.Kid.output()"
  const outputs = `Readonly<{ Kid: Readonly<{ output: ${
    c.comp === "childById" ? "(id: number) => boolean" : sometimes(c) ? "() => Opt.Option<boolean>" : "() => boolean"
  } }>${pair ? "; Pal: Readonly<{ output: (id: number) => number }>" : ""} }>`
  // What a parent's step takes last, where it reads its child's output.
  const children = (contextual: boolean) => reads ? (contextual ? ", children" : `, children: ${outputs}`) : ""
  // The type of what the parent tells its children, for a step written apart: nothing to a child without `external`.
  const told = [
    ...(kt.external === "never"
      ? []
      : [`Readonly<{ _tag: 'Kid'; message: KReset }>${c.comp === "childById" ? " & Readonly<{ id: number }>" : ""}`]),
    ...(pair ? ["(Readonly<{ _tag: 'Pal'; message: PClear }> & Readonly<{ id: number }>)"] : [])
  ].join(" | ") || "never"
  // update
  if (c.update !== "absent") {
    const message = v === "wrongMessage" ? "Readonly<{ _tag: 'Other' }>" : "Own"
    const commandType = has("command") ? "Cmd" : "never"
    const eventType = has("event") ? "Ev" : "never"
    // A parent's `update` reads its child's output last, in each form a step is written in.
    const read = children(c.update === "contextual")
    const head = c.update === "annotated"
      ? `(message: ${message}${read}) => (state: ${state}) =>`
      : c.update === "outside"
      ? kidded
        ? `(message: ${message}${read}) => (state: ${state}): `
          + `Transition<${state}, ${commandType}, ${eventType}, ${told}> =>`
        : "(message) => (state) =>"
      : `(message${has("message") && v !== "wrongMessage" ? "" : `: ${message}`}${read}) => (state) =>`
    const tellVia = v === "tellWithoutChildren" ? `, tell: [${itemOf(c, "KReset")}]` : ""
    const zero = reads ? `${output} ? 0 : 1` : "0"
    const reset = kidded && c.tell !== "none"
      ? `{ state: { ...state, n: ${zero} }, tell: ${tellsOf(c, v === "ownToChild" ? "KInc" : "KReset")} }`
      : `{ state: { ...state, n: ${zero} }${tellVia} }`
    const commands = v === "wrongCommand"
      ? ", commands: [{ _tag: 'Load' }]"
      : has("command") || v === "unnamedCommand"
      ? ", commands: [{ _tag: 'Save' }]"
      : ""
    const events = v === "wrongEvent"
      ? ", events: [{ _tag: 'Lost' }]"
      : has("event") || v === "unnamedEvent"
      ? ", events: [{ _tag: 'Saved' }]"
      : ""
    const advance = `{ state: { ...state, n: state.n + 1 }${commands}${events} }`
    const steps = c.tell === "switch"
      ? [
        "      switch (message._tag) {",
        `        case 'Reset': return ${reset}`,
        `        case 'Inc': return state.n > 9 ? reject : ${advance}`,
        "      }"
      ]
      : c.tell === "ternary"
      ? [
        `      if (message._tag === 'Reset') return state.n > 9 ? reject : ${reset}`,
        // Bounded, as in every form: a command's answer starts the command again.
        `      return state.n > 9 ? reject : ${advance}`
      ]
      : [
        `      if (message._tag === 'Reset') return ${reset}`,
        "      if (state.n > 9) return reject",
        `      return ${advance}`
      ]
    const body = [`${head} {`, ...steps, "    }"].join("\n")
    if (c.update === "outside") {
      lines.push(
        kidded
          ? `  const update = ${body.replace(/\n {4}/g, "\n  ")}`
          : `  const update: Update<${state}, ${message}, ${commandType}, ${eventType}> = ${
            body.replace(/\n {4}/g, "\n  ")
          }`
      )
      entries.push("    update,")
    } else {
      entries.push(`    update: ${body},`)
    }
  }
  // external: written as `update` is, and, without `update`, as the case annotates. Written apart, it tells nothing:
  // its literal tags would widen there, as anywhere a step is written without the type it returns.
  if ((has("external") && v !== "missingExternal") || v === "externalUnnamed") {
    const form = c.update === "absent" ? (c.annotate ? "annotated" : "contextual") : c.update
    const message = v === "wrongExternal" ? "Readonly<{ _tag: 'Other' }>" : "Ext"
    const tells = kidded && c.tell !== "none" && form !== "outside"
      ? tellsOf(c, v === "externalToChild" ? "KInc" : "KReset")
      : undefined
    const reset = tells === undefined
      ? "({ state: { ...state, n: 0 } })"
      : `({ state: { ...state, n: 0 }, tell: ${tells} })`
    const answer = v === "externalRejects"
      ? `state.n > 9 ? reject : ${reset}`
      : tells !== undefined && c.tell === "ternary"
      ? `(state.n > 9 ? { state } : { state: { ...state, n: 0 }, tell: ${tells} })`
      : tells !== undefined && c.tell === "switch"
      ? `{ switch (message._tag) { case 'Reset': return { state, tell: ${tells} } } }`
      : reset
    if (form === "outside") {
      lines.push(`  const answer = (message: ${message}) => (state: ${state}) => ${answer}`)
      entries.push("    external: answer,")
    } else {
      const head = form === "annotated"
        ? `(message: ${message}) => (state: ${state}) =>`
        : `(message${v === "wrongExternal" ? `: ${message}` : ""}) => (state) =>`
      entries.push(`    external: ${head} ${answer},`)
    }
  }
  // runCommand
  if ((has("command") && v !== "missingRunCommand") || v === "extraRunCommand") {
    const answer = own === "Own" ? "Opt.some({ _tag: 'Inc' } as const)" : "Opt.none()"
    entries.push(
      `    runCommand: (command${a("Cmd")}) => ${
        c.services ? `Effect.as(Effect.service(Db), ${answer})` : `Effect.succeed(${answer})`
      },`
    )
  }
  if (c.subs !== "none") {
    const listened = c.subs === "emits" ? (c.services ? "feed" : "ticked") : (c.services ? "held" : "idle")
    entries.push(`    subscriptions: (state${a(state)}) => state.n > 0 ? [${ownKey}] : [],`)
    entries.push(`    listen: (key${a(ownKey)}) => ${listened},`)
  }
  if (kidded) {
    const handler = c.comp === "childById"
      ? (c.annotate ? `(id: number, event: KidEvent) => (state: ${state}) =>` : "(id, event) => (state) =>")
      : (c.annotate ? `(event: KidEvent) => (state: ${state}) =>` : "(event) => (state) =>")
    const tells = c.tell === "none" ? undefined : tellsOf(c, "KReset")
    const answer = tells === undefined
      ? "({ state })"
      : c.tell === "ternary"
      ? `(state.n > 9 ? { state } : { state, tell: ${tells} })`
      : c.tell === "switch"
      ? `{ switch (event._tag) { case 'KDone': return { state, tell: ${tells} } } }`
      : `({ state, tell: ${tells} })`
    // A handler for each child with events: none for a child without, which `onEvent` refuses.
    const handlers = [
      ...(kt.event === "never" || v === "missingOnEvent" ? [] : [`Kid: ${handler} ${answer}`]),
      ...(pair
        ? [
          `Pal: ${
            c.annotate ? `(id: number, event: PalEvent) => (state: ${state}) =>` : "(id, event) => (state) =>"
          } ({ state })`
        ]
        : [])
    ]
    if (handlers.length > 0) entries.push(`    onEvent: { ${handlers.join(", ")} },`)
  }
  // makeModel
  const model = v === "wrongModel" ? "String(state.n)" : "state.n"
  const s = `state${a(state)}`
  const kidModel = sometimes(c) ? "Opt.getOrElse(children.Kid(), () => 0)" : "children.Kid()"
  switch (c.comp) {
    case "none":
      entries.push(`    makeModel: (${s}) => ({ count: ${model} }),`)
      break
    case "child":
      entries.push(`    makeModel: (${s}, children) => ({ count: ${model}, kid: ${kidModel} }),`)
      break
    case "childById":
      entries.push(
        `    makeModel: (${s}, children) => ({ count: ${model}, kids: state.ids.map((id) => children.Kid(id)) }),`
      )
      break
    case "pair":
      entries.push(
        `    makeModel: (${s}, children) => ({ count: ${model}, kid: ${kidModel}, pals: state.ids.map((id) => children.Pal(id)) }),`
      )
      break
  }
  // output: of the program's own state, and of its child's output where it has one.
  if (has("output")) {
    entries.push(`    output: (${s}${children(!c.annotate)}) => state.n > 0${reads ? ` && ${output}` : ""},`)
  }
  const kidProgram = kidName(c.kid, c.kidFlags)
  const declare = c.comp === "childById" ? "childById" : "child"
  const pal = pair ? `, Pal: childById(pal, { ids: (state${a(state)}) => state.ids })` : ""
  lines.push(
    kidded
      ? `  const made = withChildren({ Kid: ${declare}(${kidProgram}${childOptionsOf(c, a)})${pal} }).make({`
      : "  const made = make({"
  )
  lines.push(...(c.order === "reversed" ? [...entries].reverse() : entries))
  lines.push("  })")
  const kidAt = c.comp === "childById" ? " & Readonly<{ id: number }>" : ""
  // A child's message is wrapped whether or not it has any: a child without messages gives a wrapper of `never`.
  const message = [
    own,
    ...(kidded ? [`Readonly<{ _tag: 'Kid'; message: ${kt.message}; instance?: number }>${kidAt}`] : []),
    ...(pair ? ["Readonly<{ _tag: 'Pal'; message: PalMessage; instance?: number }> & Readonly<{ id: number }>"] : [])
  ].join(" | ")
  const kidCommands = kidded && kt.command !== "never"
  const command = [
    has("command") ? "Cmd" : "never",
    ...(kidCommands ? [`Readonly<{ _tag: 'Kid'; instance: number; command: KidCommand }>${kidAt}`] : [])
  ].join(" | ")
  const kept = c.comp === "childById"
    ? "HashMap.HashMap<number, Instance<KidState>>"
    : "Opt.Option<Instance<KidState>>"
  const pals = pair ? "; readonly Pal: HashMap.HashMap<number, Instance<PalState>>" : ""
  const serving = (service: string) => c.services ? service : "never"
  const expected: Types = {
    state: kidded ? `Kept<${state}, { readonly Kid: ${kept}${pals} }>` : state,
    model: has("model") ? M[c.comp] : inferredModel[c.comp],
    message,
    command: has("command") || kidCommands ? command : "never",
    event: has("event") ? "Ev" : "never",
    external: has("external") ? "Ext" : "never",
    flags: has("flags") ? "number" : "never",
    commandServices: [has("command") ? serving("Db") : "never", kidded ? kt.commandServices : "never"].join(" | "),
    subscriptionServices: [
      c.subs === "emits" ? serving("Feed") : c.subs === "silent" ? serving("Lock") : "never",
      kidded ? kt.subscriptionServices : "never"
    ].join(" | "),
    key: [
      ownKey,
      ...(kidded && kt.key !== "never" ? [`Readonly<{ _tag: 'Kid'; instance: number; key: 'kid' }>${kidAt}`] : [])
    ].join(" | "),
    output: has("output") ? "boolean" : "never"
  }
  return { lines, expected }
}

const generate = (c: Case): ReadonlyArray<Part> => {
  const { expected, lines } = madeOf(c)
  if (!isValid(c)) {
    const flagged = c.named.has("flags") ? ", { flags: () => Opt.some(3) }" : ""
    return [{
      label: "program",
      valid: verdictOf(c),
      lines: [...lines, `  const used = program<{ state: OuterOwn }>().child(made${flagged})`]
    }]
  }
  return [
    { label: "program", valid: true, lines: [...lines, ...readerLines("made", expected)] },
    ...usesOf("made", expected, representative(c) ? uses : ["typed", "child"]),
    ...(representative(c) ? restarted("made", expected) : [])
  ]
}

// The program started from another state, as "Running" writes it,
// `{ ...program, init: { state } }`, with a state saved before: given to every function but `simulate`, which takes
// no `init` and is given a state in each call, and owed the first rule as the program it spreads is. Its flags are
// gone with its `init`, and the rest of its types are the same.
const restarted = (name: string, types: Types): ReadonlyArray<Part> =>
  usesOf(
    `{ ...${name}, init: { state: savedState<StateOf<typeof ${name}>>() } }`,
    { ...types, flags: "never" },
    uses.filter((use) => use !== "simulate")
  ).map((part) => ({ ...part, label: `restart.${part.label}` }))

// The axes that change only how `make` is written, the order of its pieces, their annotations, and the form of
// `update`, leave the type it returns the same, as the readers assert in every case: so a program of `make` is given to
// every function once for each type, and to `Program<…>` and `child` in every case.
const representative = (c: Case) =>
  c.order === "canonical" && !c.annotate && (c.update === "absent" || c.update === "contextual")

// The hand-written family: a program annotated with `Program<…>`, whose pieces take their types from it.
type HandName = "command" | "event" | "external" | "flags" | "commandServices" | "subscriptionServices"
type HandCase = Readonly<{
  id: string
  named: ReadonlySet<HandName>
  update: "annotated" | "contextual"
  subs: boolean
}>

// A hand-written case's program, `made`, and the types it gives back.
const handOf = (c: HandCase): Readonly<{ lines: ReadonlyArray<string>; expected: Types }> => {
  const has = (name: HandName) => c.named.has(name)
  const fields = ["state: SNone", "model: MNone", "message: Own"]
  if (has("command")) fields.push("command: Cmd")
  if (has("event")) fields.push("event: Ev")
  if (has("external")) fields.push("external: Ext")
  if (has("flags")) fields.push("flags: number")
  if (has("commandServices")) fields.push("commandServices: Db")
  if (has("subscriptionServices")) fields.push("subscriptionServices: Feed")
  if (c.subs) fields.push("key: 'own'")
  const T = `{ ${fields.join("; ")} }`
  const commands = has("command") ? ", commands: [{ _tag: 'Save' }]" : ""
  const events = has("event") ? ", events: [{ _tag: 'Saved' }]" : ""
  const lines = [`  const made: Program<${T}> = {`]
  lines.push(
    has("flags")
      ? `    init: (flags) => ({ state: { n: flags }${commands} }),`
      : `    init: { state: { n: 0 }${commands} },`
  )
  lines.push(
    `    update: ${c.update === "annotated" ? "(message: Own) => (state: SNone) =>" : "(message) => (state) =>"} {`
  )
  lines.push("      if (message._tag === 'Reset') return { state: { n: 0 } }")
  lines.push("      if (state.n > 9) return reject")
  lines.push(`      return { state: { n: state.n + 1 }${commands}${events} }`)
  lines.push("    },")
  if (has("external")) {
    lines.push(
      `    external: ${
        c.update === "annotated" ? "(message: Ext) => (state: SNone) =>" : "(message) => (state) =>"
      } ({ state: { ...state, n: 0 } }),`
    )
  }
  if (has("command")) {
    lines.push(
      has("commandServices")
        ? "    runCommand: (command) => Effect.as(Effect.service(Db), Opt.some({ _tag: 'Inc' } as const)),"
        : "    runCommand: (command) => Effect.succeedSome({ _tag: 'Inc' } as const),"
    )
  }
  lines.push(
    c.subs
      ? "    subscriptions: (state) => state.n > 0 ? ['own'] : [],"
      : "    subscriptions: () => [],"
  )
  if (c.subs) lines.push("    listen: () => feed,")
  lines.push("    makeModel: (state) => ({ count: state.n }),")
  lines.push("  }")
  const expected: Types = {
    state: "SNone",
    model: "MNone",
    message: "Own",
    command: has("command") ? "Cmd" : "never",
    event: has("event") ? "Ev" : "never",
    external: has("external") ? "Ext" : "never",
    flags: has("flags") ? "number" : "never",
    commandServices: has("command") && has("commandServices") ? "Db" : "never",
    // As the services of the commands: those named for subscriptions that the program does not have read back as none.
    subscriptionServices: has("subscriptionServices") && c.subs ? "Feed" : "never",
    key: c.subs ? "'own'" : "never",
    output: "never"
  }
  return { lines, expected }
}

const generateHand = (c: HandCase): ReadonlyArray<Part> => {
  const { expected, lines } = handOf(c)
  return [
    { label: "program", valid: true, lines: [...lines, ...readerLines("made", expected)] },
    ...usesOf("made", expected, uses),
    ...restarted("made", expected)
  ]
}

const subsets = <A>(items: ReadonlyArray<A>): ReadonlyArray<ReadonlySet<A>> =>
  Array.from({ length: 2 ** items.length }, (_, mask) => new Set(items.filter((_, i) => (mask >> i) & 1)))

// The layouts of a parent: the options of its child, whether it starts from flags, and how its steps tell the
// child. Each form of its options is crossed with a tell written inline, and each other tell with the plain options.
type Layout = Readonly<{ kidFlags: boolean; childOptions: ChildOptions; tell: Tell }>
const layoutsOf = (comp: Comp): ReadonlyArray<Layout> => {
  const plain = { kidFlags: false, childOptions: "plain", tell: "none" } as const
  switch (comp) {
    case "none":
      return [plain]
    case "child":
      return [
        ...(["plain", "key", "there", "listening"] as const).map((childOptions) => ({
          ...plain,
          childOptions,
          tell: "inline" as const
        })),
        ...(["none", "ternary", "switch"] as const).map((tell) => ({ ...plain, tell })),
        ...(["plain", "listening"] as const).map((childOptions) => ({
          ...plain,
          kidFlags: true,
          childOptions,
          tell: "inline" as const
        }))
      ]
    case "childById":
      return [
        ...(["plain", "listening"] as const).map((childOptions) => ({
          ...plain,
          childOptions,
          tell: "inline" as const
        })),
        ...(["none", "ternary", "switch", "mapped"] as const).map((tell) => ({ ...plain, tell })),
        ...(["plain", "listening"] as const).map((childOptions) => ({
          ...plain,
          kidFlags: true,
          childOptions,
          tell: "inline" as const
        })),
        { ...plain, kidFlags: true, tell: "mapped" }
      ]
    case "pair":
      return [
        { ...plain, tell: "inline" },
        plain,
        { ...plain, childOptions: "there", tell: "inline" },
        { ...plain, kidFlags: true, tell: "inline" }
      ]
  }
}

// The axes found missing by point 6 of step 16: a program of `make` that names an `output` of its own, so that a
// parent that is a child in turn declares one; own commands and subscriptions that need no service; and a child that
// lacks a piece. Each is crossed with every axis above but the names, which it meets in pairs, none, each alone and
// all, and the other axes of point 6, which it does not meet: the full product would double the matrix for each. A
// child's shape meets the names none and all alone, and the canonical order alone: it changes what the parent
// declares of its child, not how the parent's own pieces are written, and its seven shapes crossed as the others are
// weighed as much as all the matrix before them.
type Extra = Readonly<{ output: boolean; services: boolean; kid: KidShape }>
const plainExtra: Extra = { output: false, services: true, kid: "full" }
const pairsOf = <A>(items: ReadonlyArray<A>): ReadonlyArray<ReadonlySet<A>> => [
  new Set(),
  ...items.map((item) => new Set([item])),
  new Set(items)
]
type Order = Case["order"]
const orders: ReadonlyArray<Order> = ["canonical", "reversed"]
const comps: ReadonlyArray<Comp> = ["none", "child", "childById", "pair"]
const crossings: ReadonlyArray<
  Readonly<{
    extra: Extra
    comps: ReadonlyArray<Comp>
    named: ReadonlyArray<ReadonlySet<Name>>
    orders: ReadonlyArray<Order>
  }>
> = [
  { extra: plainExtra, comps, named: subsets(names), orders },
  { extra: { ...plainExtra, output: true }, comps, named: pairsOf(names), orders },
  { extra: { ...plainExtra, services: false }, comps, named: pairsOf(names), orders },
  // `pal` lacks no piece of its own types: its shape is not crossed.
  ...kidShapes.map((kid) => ({
    extra: { ...plainExtra, kid },
    comps: comps.filter((comp) => isKid(comp) && comp !== "pair"),
    named: [new Set<Name>(), new Set(names)],
    orders: ["canonical"] as const
  }))
]

const cases: Array<Case> = []
const ids = new Set<string>()
for (const { comps: among, extra, named: namesets, orders: ordered } of crossings) {
  for (const comp of among) {
    for (const update of ["absent", "annotated", "contextual", "outside"] as const) {
      for (const subset of namesets) {
        const named = new Set(subset)
        if (update !== "absent") named.add("message")
        if (extra.output) named.add("output")
        for (const subs of ["none", "emits", "silent"] as const) {
          // Without own commands or subscriptions, nothing of its own needs a service.
          if (!extra.services && !named.has("command") && subs === "none") continue
          for (const given of layoutsOf(comp)) {
            // A child without `external` is told nothing.
            const layout = kidTypesOf(extra.kid).external === "never" ? { ...given, tell: "none" as const } : given
            for (const order of ordered) {
              for (const annotate of [false, true]) {
                const c: Case = {
                  id: "",
                  named,
                  comp,
                  update,
                  subs,
                  ...layout,
                  order,
                  annotate,
                  services: extra.services,
                  kid: extra.kid
                }
                // A subscription that answers with an own message needs one: without, it answers with none.
                if (subs === "emits" && ownOf(c) === "never") continue
                const id = [
                  comp,
                  update,
                  [...named].join("+") || "state",
                  ...(subs === "none" ? [] : [subs]),
                  ...(extra.services ? [] : ["free"]),
                  ...(extra.kid === "full" ? [] : [`kidLacks-${extra.kid}`]),
                  ...(layout.kidFlags ? ["kidFlags"] : []),
                  ...(isKid(comp) ? [layout.childOptions, `tell-${layout.tell}`] : []),
                  order,
                  ...(annotate ? ["annotated"] : [])
                ].join(".")
                // A layout whose tell is taken out repeats another.
                if (ids.has(id)) continue
                ids.add(id)
                cases.push({ ...c, id })
              }
            }
          }
        }
      }
    }
  }
}
// The broken rules: secondary, a few of each, to see that the checks the library has still hold.
const violations: ReadonlyArray<
  Readonly<{ violation: Violation; applies: (c: Case) => boolean; named?: (named: Set<Name>) => void }>
> = [
  { violation: "wrongMessage", applies: (c) => c.update !== "absent" },
  { violation: "wrongModel", applies: () => true },
  { violation: "wrongCommand", applies: (c) => c.update !== "absent" },
  { violation: "missingRunCommand", applies: () => true },
  { violation: "wrongEvent", applies: (c) => c.update !== "absent" },
  { violation: "missingExternal", applies: () => true },
  { violation: "externalUnnamed", applies: () => true, named: (named) => named.delete("external") },
  { violation: "externalRejects", applies: () => true },
  { violation: "wrongExternal", applies: () => true },
  { violation: "externalToChild", applies: (c) => isKid(c.comp) },
  { violation: "unnamedCommand", applies: () => true, named: (named) => named.delete("command") },
  { violation: "unnamedEvent", applies: (c) => c.update !== "absent", named: (named) => named.delete("event") },
  { violation: "flagsStep", applies: () => true },
  { violation: "flagsUnnamed", applies: () => true, named: (named) => named.delete("flags") },
  { violation: "wrongInitState", applies: () => true },
  { violation: "missingOnEvent", applies: (c) => isKid(c.comp) },
  { violation: "ownToChild", applies: (c) => isKid(c.comp) && c.update !== "absent" },
  ...widths.flatMap((width) => [
    { violation: `clash.${width}` as const, applies: (c: Case) => c.comp !== "none" && c.update !== "absent" },
    { violation: `commandClash.${width}` as const, applies: (c: Case) => c.comp !== "none" }
  ]),
  { violation: "extraRunCommand", applies: () => true, named: (named) => named.delete("command") },
  // `message` named and no `update`, and an `update` with no `message` named.
  { violation: "missingUpdate", applies: (c) => c.update === "absent", named: (named) => named.add("message") },
  { violation: "updateUnnamed", applies: (c) => c.update !== "absent", named: (named) => named.delete("message") },
  // A step tells only a child the parent has, by its id for children by id, and never from `init`.
  { violation: "tellWrongChild", applies: (c) => isKid(c.comp) },
  { violation: "tellWithoutChildren", applies: (c) => !isKid(c.comp) && c.update !== "absent" },
  { violation: "tellInInit", applies: (c) => isKid(c.comp) },
  { violation: "tellMissingId", applies: (c) => c.comp === "childById" },
  { violation: "tellWrongId", applies: (c) => c.comp === "childById" }
]
for (const comp of comps) {
  for (const update of ["absent", "annotated", "contextual"] as const) {
    for (const { violation, applies, named: adjust } of violations) {
      const named = new Set<Name>(update === "absent" ? names : [...names, "message"])
      adjust?.(named)
      const c: Case = {
        id: "",
        named,
        comp,
        update,
        subs: "none",
        kidFlags: false,
        childOptions: "plain",
        tell: isKid(comp) ? "inline" : "none",
        order: "canonical",
        annotate: false,
        services: true,
        kid: "full",
        violation
      }
      if (!applies(c)) continue
      cases.push({ ...c, id: `invalid.${violation}.${comp}.${update}` })
    }
  }
}
const handCases: Array<HandCase> = []
const handNames = ["command", "event", "external", "flags", "commandServices", "subscriptionServices"] as const
for (const named of subsets(handNames)) {
  for (const update of ["annotated", "contextual"] as const) {
    for (const subs of named.has("subscriptionServices") ? [false, true] : [false]) {
      handCases.push({
        id: `hand.${update}.${[...named].join("+") || "plain"}${subs ? ".subs" : ""}`,
        named,
        update,
        subs
      })
    }
  }
}

// The family of programs written as an object not typed `Program<…>`, which the functions take as it is (step 16,
// point 2): in a constant, with every parameter annotated; written in the call, annotated or contextual; or spread
// from a typed program with its `update` written again, annotated or contextual. Contextual, the message of `update`
// and the flags of `init` stay annotated: nothing else names them.
type ObjectName = "command" | "event" | "external" | "flags" | "output"
const objectNames: ReadonlyArray<ObjectName> = ["command", "event", "external", "flags", "output"]
type ObjectForm = "constant" | "call" | "spread"
// The rules a program written as an object can break, each in the piece that the functions which check it read.
type ObjectViolation =
  | "missingRunCommand"
  | "wrongAnswer"
  | "externalRejects"
  | "externalCommandsUnrun"
  | "missingListen"
  | "wrongListen"
  | "wrongInitState"
  | "missingSubscriptions"
  | "missingOnEvent"
  | "outputOtherState"
const brokenPiece: Readonly<Record<ObjectViolation, Piece>> = {
  missingRunCommand: "runCommand",
  wrongAnswer: "runCommand",
  externalRejects: "external",
  externalCommandsUnrun: "external",
  missingListen: "listen",
  wrongListen: "listen",
  wrongInitState: "init",
  missingSubscriptions: "subscriptions",
  missingOnEvent: "onEvent",
  outputOtherState: "output"
}
type ObjectCase = Readonly<{
  id: string
  named: ReadonlySet<ObjectName>
  subs: Subs
  form: ObjectForm
  annotate: boolean
  violation?: ObjectViolation
}>

const keyOf = (subs: Subs) => subs === "emits" ? "'own'" : subs === "silent" ? "'lock'" : undefined

// The object's pieces, each with the piece it is, broken as its violation says.
const objectEntries = (o: ObjectCase): ReadonlyArray<readonly [Piece, string]> => {
  const v = o.violation
  const has = (name: ObjectName) => o.named.has(name)
  const S = "SNone"
  const a = (type: string) => (o.annotate ? `: ${type}` : "")
  const n = "state.n"
  const st = (value: string) => `{ n: ${value} }`
  const commands = has("command") ? ", commands: [save]" : ""
  const events = has("event") ? ", events: [saved]" : ""
  const initState = v === "wrongInitState" ? "{ n: '0' }" : st(has("flags") ? "flags" : "0")
  const key = keyOf(o.subs)
  const entries: Array<readonly [Piece, string]> = [
    [
      "init",
      has("flags")
        ? `init: (flags: number) => ({ state: ${initState}${commands} }),`
        : `init: { state: ${initState}${commands} },`
    ],
    [
      "update",
      [
        `update: (message: Own) => (state${a(S)}) => {`,
        `  if (message._tag === 'Reset') return { state: ${st("0")} }`,
        `  if (${n} > 9) return reject`,
        `  return { state: ${st(`${n} + 1`)}${commands}${events} }`,
        "},"
      ].join("\n")
    ]
  ]
  if (has("external")) {
    const step = `{ state: ${st("0")}${v === "externalCommandsUnrun" ? ", commands: [save]" : ""} }`
    const answer = v === "externalRejects" ? `${n} > 9 ? reject : ${step}` : step
    entries.push(["external", `external: (message${a("Ext")}) => (state${a(S)}) => (${answer}),`])
  }
  if (has("command") && v !== "missingRunCommand") {
    const answer = v === "wrongAnswer" ? "other" : "inc"
    entries.push([
      "runCommand",
      `runCommand: (command${a("Cmd")}) => Effect.as(Effect.service(Db), Opt.some(${answer})),`
    ])
  }
  if (v !== "missingSubscriptions") {
    entries.push([
      "subscriptions",
      key === undefined
        ? "subscriptions: () => [],"
        : `subscriptions: (state${a(S)})${o.annotate ? `: ReadonlyArray<${key}>` : ""} => ${n} > 0 ? [${key}] : [],`
    ])
  }
  if (key !== undefined && v !== "missingListen") {
    const listened = v === "wrongListen" ? "stray" : o.subs === "emits" ? "feed" : "held"
    entries.push(["listen", `listen: (key${a(key)}) => ${listened},`])
  }
  entries.push(["makeModel", `makeModel: (state${a(S)}) => ({ count: ${n} }),`])
  if (has("output")) {
    entries.push([
      "output",
      v === "outputOtherState"
        ? "output: (other: Readonly<{ other: string }>) => other.other.length > 0,"
        : `output: (state${a(S)}) => ${n} > 0,`
    ])
  }
  return entries
}

const objectText = (entries: ReadonlyArray<readonly [Piece, string]>, indent: string) =>
  [
    "{",
    ...entries.flatMap(([, entry]) => entry.split("\n").map((line) => `${indent}  ${line}`)),
    `${indent}}`
  ].join("\n")

// The types a program written as an object gives back: those it is written with, and those of `SNone` and `MNone` where
// it is spread from a typed one.
const objectTypes = (o: ObjectCase): Types => {
  const has = (name: ObjectName) => o.named.has(name)
  const key = keyOf(o.subs)
  const spread = o.form === "spread"
  return {
    state: spread ? "SNone" : "{ n: number }",
    model: spread ? "MNone" : "{ count: number }",
    message: "Own",
    command: has("command") ? "Cmd" : "never",
    event: has("event") ? "Ev" : "never",
    external: has("external") ? "Ext" : "never",
    flags: has("flags") ? "number" : "never",
    commandServices: has("command") ? "Db" : "never",
    subscriptionServices: o.subs === "emits" ? "Feed" : o.subs === "silent" ? "Lock" : "never",
    key: key ?? "never",
    output: has("output") ? "boolean" : "never"
  }
}

const generateObject = (o: ObjectCase): ReadonlyArray<Part> => {
  const has = (name: ObjectName) => o.named.has(name)
  const types = objectTypes(o)
  const broken = o.violation === undefined ? undefined : brokenPiece[o.violation]
  const options = { broken, onEvent: o.violation !== "missingOnEvent", form: formId(o.form, o.annotate) }
  switch (o.form) {
    case "constant": {
      const lines = [`  const made = ${objectText(objectEntries(o), "  ")}`]
      if (broken === undefined) lines.push(...readerLines("made", types))
      return [{ label: "program", valid: true, lines }, ...usesOf("made", types, uses, options)]
    }
    case "call": {
      const entries = objectEntries(o)
      // `simulate` takes the pieces it calls, and is written them alone, annotated: no `init` gives it the state, and
      // one broken is not there to break them.
      const simulated = entries.filter(([piece]) => checks.simulate.has(piece) && piece !== "init")
      const alone = { ...options, broken: broken === "init" ? undefined : broken }
      return [
        ...usesOf(objectText(entries, "    "), types, uses.filter((use) => use !== "simulate"), options),
        ...(o.annotate ? usesOf(objectText(simulated, "    "), types, ["simulate"], alone) : [])
      ]
    }
    case "spread": {
      // The program spread from, typed, with its pieces contextual, and the `update` written again over it.
      const base = objectText(objectEntries({ ...o, annotate: false }), "  ")
      const commands = has("command") ? ", commands: [save]" : ""
      const events = has("event") ? ", events: [saved]" : ""
      const a = (type: string) => (o.annotate ? `: ${type}` : "")
      const update = [
        `update: (message${a("Own")}) => (state${a("SNone")}) => {`,
        "  if (message._tag === 'Reset') return { state: { n: 0 } }",
        "  if (state.n > 9) return reject",
        `  return { state: { n: state.n + 1 }${commands}${events} }`,
        "}"
      ].map((line, index) => index === 0 ? line : `      ${line}`).join("\n")
      return [
        { label: "program", valid: true, lines: [`  const base: Program<{ ${fieldsOf(types)} }> = ${base}`] },
        ...usesOf(`{ ...base, ${update} }`, types, uses, options)
      ]
    }
  }
}

const objectCases: Array<ObjectCase> = []
const objectForms: ReadonlyArray<readonly [ObjectForm, boolean]> = [
  ["constant", true],
  ["call", true],
  ["call", false],
  ["spread", true],
  ["spread", false]
]
const formId = (form: ObjectForm, annotate: boolean) => `${form}${annotate ? ".annotated" : ".contextual"}`
for (const named of subsets(objectNames)) {
  for (const subs of ["none", "emits", "silent"] as const) {
    for (const [form, annotate] of objectForms) {
      objectCases.push({
        id: ["object", formId(form, annotate), [...named].join("+") || "state", ...(subs === "none" ? [] : [subs])]
          .join("."),
        named,
        subs,
        form,
        annotate
      })
    }
  }
}
// Each violation with the pieces it needs alone, so that no other difference meant hides it, in the forms that write
// the piece it breaks: a program spread from a typed one is checked by its type, but for the `update` written again.
const objectViolations: ReadonlyArray<
  Readonly<{ violation: ObjectViolation; named: ReadonlyArray<ObjectName>; subs: Subs; annotatedOnly?: boolean }>
> = [
  { violation: "missingRunCommand", named: ["command"], subs: "none" },
  { violation: "wrongAnswer", named: ["command"], subs: "none" },
  { violation: "externalRejects", named: ["external"], subs: "none" },
  { violation: "externalCommandsUnrun", named: ["external"], subs: "none" },
  { violation: "missingListen", named: [], subs: "emits" },
  { violation: "wrongListen", named: [], subs: "emits" },
  // Contextual, the state of `update` is the one `init` gives: nothing names another.
  { violation: "wrongInitState", named: [], subs: "none", annotatedOnly: true },
  { violation: "missingSubscriptions", named: [], subs: "none" },
  { violation: "missingOnEvent", named: ["event"], subs: "none" },
  { violation: "outputOtherState", named: ["output"], subs: "none" }
]
for (const { violation, named, subs, annotatedOnly } of objectViolations) {
  for (const [form, annotate] of objectForms) {
    if (form === "spread" || (annotatedOnly === true && !annotate)) continue
    objectCases.push({
      id: `invalid.object.${violation}.${formId(form, annotate)}`,
      named: new Set(named),
      subs,
      form,
      annotate,
      violation
    })
  }
}

// By the three rules the types of a program keep (`AGENTS.md`, "What belongs here"): `true` must compile, and fails
// only against the first or the third; `false` must not, since it breaks the second; and `refused` must not either,
// but would break none if it compiled, so that it is reported apart, as a note. `untyped` is a valid program in a form
// not typed `Program<…>`, which is owed the second and the third rule but not the first: a form may be refused, but
// never taken wrongly. So it is a lead only where it compiles and an assertion of its types fails, and a note where it
// is refused.
type Verdict = boolean | "refused" | "untyped"

// Cases written by hand, each with its verdict.
const specials: ReadonlyArray<Readonly<{ id: string; valid: Verdict; body: string }>> = [
  {
    id: "special.silent-subscription-without-message",
    valid: true,
    body: `  const made = program<{ state: SNone; key: 'lock' }>().make({
    init: { state: { n: 0 } },
    subscriptions: (state) => state.n > 0 ? ['lock'] : [],
    listen: () => held,
    makeModel: () => null,
  })
  const message: Exactly<MessageOf<typeof made>, never> = true
  const services: Exactly<SubscriptionServicesOf<typeof made>, Lock> = true
  return [message, services]`
  },
  {
    id: "special.empty-subscriptions-without-message",
    valid: "refused",
    body: `  const made = program<{ state: SNone }>().make({
    init: { state: { n: 0 } },
    subscriptions: () => [],
    makeModel: () => null,
  })
  const message: Exactly<MessageOf<typeof made>, never> = true
  const services: Exactly<SubscriptionServicesOf<typeof made>, never> = true
  return [message, services]`
  },
  {
    id: "special.silent-subscription-beside-messages",
    valid: true,
    body: `  const made = program<{ state: SNone; message: Own; key: 'lock' | 'own' }>().make({
    init: { state: { n: 0 } },
    update: () => (state) => ({ state }),
    subscriptions: () => ['lock', 'own'],
    listen: (key) => key === 'lock' ? held : feed,
    makeModel: () => null,
  })
  const services: Exactly<SubscriptionServicesOf<typeof made>, Lock | Feed> = true
  return services`
  },
  // A state is any value: a type without fields, and a number.
  ...["{}", "Readonly<{}>", "Record<never, never>"].map((type) => ({
    id: `special.state-without-fields.${type}`,
    valid: true,
    body: `  const made = program<{ state: ${type} }>().make({ init: { state: {} }, makeModel: () => null })
  const used = program<{ state: OuterOwn }>().child(made)
  return used`
  })),
  {
    id: "special.state-number",
    valid: true,
    body: `  const made = program<{ state: number }>().make({ init: { state: 0 }, makeModel: (n) => n })
  const state: Exactly<StateOf<typeof made>, number> = true
  const used = program<{ state: OuterOwn }>().child(made)
  return [state, used]`
  },
  {
    id: "special.state-object",
    valid: true,
    body: `  const made = program<{ state: object }>().make({ init: { state: {} }, makeModel: () => null })
  const state: Exactly<StateOf<typeof made>, object> = true
  const used = program<{ state: OuterOwn }>().child(made)
  return [state, used]`
  },
  // `model: never` named is checked: a model that is drawn is refused, one that is never drawn is true.
  {
    id: "special.model-never-drawn",
    valid: false,
    body:
      `  const made = program<{ state: SNone; model: never }>().make({ init: { state: { n: 0 } }, makeModel: (state) => state.n })
  return made`
  },
  {
    id: "special.model-never-not-drawn",
    valid: true,
    body: `  const made = program<{ state: SNone; model: never }>().make({
    init: { state: { n: 0 } },
    makeModel: () => {
      throw new Error('never drawn')
    },
  })
  const model: Exactly<ModelOf<typeof made>, never> = true
  return model`
  },
  // A misspelled name is a name not given: the program compiles as it would without it.
  {
    id: "special.misspelled-name-in-program",
    valid: true,
    body:
      `  const made = program<{ state: SNone; modl: MNone }>().make({ init: { state: { n: 0 } }, makeModel: (state) => ({ count: state.n }) })
  const model: Exactly<ModelOf<typeof made>, { count: number }> = true
  return model`
  },
  {
    id: "special.misspelled-name-in-Program",
    valid: true,
    body: `  const made: Program<{ state: SNone; model: MNone; message: Own; evnt: Ev }> = {
    init: { state: { n: 0 } },
    update: () => (state) => ({ state }),
    subscriptions: () => [],
    makeModel: (state) => ({ count: state.n }),
  }
  const event: Exactly<EventOf<typeof made>, never> = true
  return event`
  },
  // A parent's `external` passes on to its child only what the child's `external` takes, whatever its own type.
  ...([["'KReset'", "KReset", true], ["'KReset'", "KInc", false], ["string", "KReset", true], [
    "string",
    "KInc",
    false
  ]] as const)
    .map(([tag, sent, valid]) => ({
      id: `special.external-passed-on.${tag === "string" ? "string" : "literal"}.${sent}`,
      valid,
      body: `  const Parent = program<{ state: OuterOwn; external: Readonly<{ _tag: ${tag} }> }>()
  const parent = Parent.withChildren({ Kid: Parent.child(kid) }).make({
    init: { state: { m: 0 } },
    external: () => (state) => ({ state, tell: [{ _tag: 'Kid', message: { _tag: '${sent}' } }] }),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  const external: Exactly<ExternalOf<typeof parent>, Readonly<{ _tag: ${tag} }>> = true
  const message: Exactly<MessageOf<typeof parent>, Readonly<{ _tag: 'Kid'; message: KidMessage; instance?: number }>> = true
  return [external, message]`
    })),
  // A wide type for the external messages is true, and read back as named.
  ...(["any", "unknown"] as const).map((type) => ({
    id: `special.wide-external.${type}`,
    valid: true as const,
    body: `  const made = program<{ state: SNone; external: ${type} }>().make({
    init: { state: { n: 0 } },
    external: () => (state) => ({ state }),
    makeModel: () => null,
  })
  const read: Exactly<ExternalOf<typeof made>, ${type}> = true
  return read`
  })),
  // Children given as a record of wide keys: an own message that takes the name of one is broken. One that takes
  // another name is the control: refused, since the same program can be written with the names as they are.
  ...([["Kid", false], ["Inc", "refused"]] as const).map(([tag, valid]) => ({
    id: `special.children-wide-names.${tag}`,
    valid,
    body: `  const Parent = program<{ state: OuterOwn; message: Readonly<{ _tag: '${tag}' }> }>()
  const handle = Parent.child(kid)
  const children: Readonly<Record<string, typeof handle>> = { Kid: handle }
  const parent = Parent.withChildren(children).make({
    init: { state: { m: 0 } },
    update: () => (state) => ({ state }),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  })),
  // A wide type in a place of a program without children is true, and read back as named.
  ...(["message", "command", "event"] as const).flatMap((place) =>
    (["any", "unknown"] as const).map((type) => ({
      id: `special.wide-${place}.${type}`,
      valid: true as const,
      body: `  const made = program<{ state: SNone; message: ${place === "message" ? type : "Own"}${
        place === "message" ? "" : `; ${place}: ${type}`
      } }>().make({
    init: { state: { n: 0 } },
    update: () => (state) => ({ state }),${place === "command" ? "\n    runCommand: () => Effect.succeedNone," : ""}
    makeModel: () => null,
  })
  const read: Exactly<${
        place === "message" ? "MessageOf" : place === "command" ? "CommandOf" : "EventOf"
      }<typeof made>, ${type}> = true
  return read`
    }))
  ),
  {
    id: "special.wide-model.any",
    valid: true,
    body:
      `  const made = program<{ state: SNone; model: any }>().make({ init: { state: { n: 0 } }, makeModel: (state) => state.n })
  const model: Exactly<ModelOf<typeof made>, any> = true
  return model`
  },
  // An own message of a wide type beside a child may take the child's name; one without a tag never does.
  ...([["unknown", false], ["object", false], ["number", true]] as const).map(([type, valid]) => ({
    id: `special.wide-message-beside-child.${type}`,
    valid,
    body: `  const Parent = program<{ state: OuterOwn; message: ${type} }>()
  const parent = Parent.withChildren({ Kid: Parent.child(kid) }).make({
    init: { state: { m: 0 } },
    update: () => (state) => ({ state }),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  })),
  // What a step tells is folded by `andThen`, and keeps its literal tags there too.
  {
    id: "special.tell-through-andThen",
    valid: true,
    body: `  const Parent = program<{ state: SChildById; message: Own }>()
  const parent = Parent.withChildren({ Kid: Parent.childById(kid, { ids: (state) => state.ids }) }).make({
    init: { state: { n: 0, ids: [1] } },
    update: () => (state) =>
      andThen({ state: { ...state, n: 0 }, tell: [{ _tag: 'Kid', id: 1, message: { _tag: 'KReset' } }] }, (state) => ({
        state,
        tell: state.ids.map((id) => ({ _tag: 'Kid', id, message: { _tag: 'KReset' } })),
      })),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  },
  // A parent of no children is a program whose state is kept, with nothing beside its own.
  {
    id: "special.no-children",
    valid: true,
    body: `  const made = program<{ state: SNone; message: Own }>().withChildren({}).make({
    init: { state: { n: 0 } },
    update: () => (state) => ({ state }),
    makeModel: (state) => state.n,
  })
  const state: Exactly<StateOf<typeof made>, Kept<SNone, {}>> = true
  const message: Exactly<MessageOf<typeof made>, Own> = true
  return [state, message]`
  },
  {
    id: "special.generic-program-of-t",
    valid: true,
    body:
      `  const models = <T extends { state: object; model: unknown; message: unknown }>(p: Program<T>) => p.makeModel
  const maker = <T extends { state: object }>() => program<T>()
  const made = maker<{ state: SNone }>().make({ init: { state: { n: 0 } }, makeModel: (state) => state.n })
  const model: Exactly<ReturnType<typeof models<{ state: SNone; model: number; message: never }>>, (state: SNone) => number> = true
  return [models(made), model]`
  },
  // A function that makes a parent of any program is an overload over erased types (the guide, "Composition"): the
  // rules of a child are not decided for a type parameter.
  {
    id: "special.generic-program-of-t-as-child",
    valid: "refused",
    body: `  const asChild = <T extends { state: SNone; model: unknown; message: unknown }>(p: Program<T>) =>
    program<{ state: OuterOwn }>().child(p)
  return asChild`
  },
  // `T` may name flags or messages, which a step and no `update` would break.
  {
    id: "special.generic-make-of-t",
    valid: false,
    body:
      `  const made = <T extends { state: SNone }>() => program<T>().make({ init: { state: { n: 0 } }, makeModel: () => null })
  return made`
  }
]

// The messages given to every function that takes one (step 16, point 5), in each form a test or a view writes one: a
// literal, with a constructor of `Data.taggedEnum` over the own messages of the program that takes it (`own`), or over
// its whole message, which builds the wrapper of a child's (`whole`), and as a value typed `MessageOf`
// (`typed`). A function takes the message the program names, as the readers of each use assert in every form a program
// is written, so that a message is taken or refused by its type alone: the messages are given to one program of `make`
// for each message it can have, alone, and as a child alone and by id, whose parent's messages wrap its own. Each
// function's parameter is asserted to be the message of the program, which a wider one would take as well.
type MessageForm = "literal" | "own" | "whole" | "typed"
const messageForms: ReadonlyArray<MessageForm> = ["literal", "own", "whole", "typed"]
// What a dispatch takes: its type, the constructors over its own messages (`ownType`, none where it has none) and over
// all of them, and its entries: an own message, with the fields it has but its tag, or the wrapper of a child's, with
// the id it is addressed by and whether it carries the `instance` of an answer.
type Entry =
  | Readonly<{ kind: "own"; tag: string; fields: string }>
  | Readonly<{ kind: "wrap"; tag: string; id?: string; instance: boolean; target: Target }>
type Target = Readonly<{
  type: string
  ownType?: string
  own: string
  whole: string
  entries: ReadonlyArray<Entry>
}>

// The messages of `target` in `form`, the typed one but as the literals its values are typed from.
const messagesIn = (target: Target, form: Exclude<MessageForm, "typed">): ReadonlyArray<string> =>
  target.entries.flatMap((entry) => {
    if (entry.kind === "own") {
      const args = entry.fields === "" ? "" : `{ ${entry.fields} }`
      return form === "literal"
        ? [`{ _tag: '${entry.tag}'${entry.fields === "" ? "" : `, ${entry.fields}`} }`]
        : [`${form === "own" ? target.own : target.whole}.${entry.tag}(${args})`]
    }
    const id = entry.id === undefined ? "" : `id: ${entry.id}, `
    return messagesIn(entry.target, form).flatMap((inner) =>
      (entry.instance ? ["", ", instance: 1"] : [""]).map((instance) =>
        form === "whole"
          ? `${target.whole}.${entry.tag}({ ${id}message: ${inner}${instance} })`
          : `{ _tag: '${entry.tag}', ${id}message: ${inner}${instance} }`
      )
    )
  })

// The messages of `target` as a part gives them: the lines that declare them, for values typed, and the expressions.
const givenIn = (target: Target, form: MessageForm, prefix: string) => {
  if (form !== "typed") return { lines: [], messages: messagesIn(target, form) }
  const literals = messagesIn(target, "literal")
  return {
    lines: literals.map((literal, index) => `const ${prefix}${index}: ${target.type} = ${literal}`),
    messages: literals.map((_, index) => `${prefix}${index}`)
  }
}

// The constructors of `target` and of the dispatches it wraps, each declared once.
const constructorsOf = (target: Target): ReadonlyArray<string> => {
  const own = target.ownType === undefined ? [] : [`  const ${target.own} = Data.taggedEnum<${target.ownType}>()`]
  const whole = target.whole === target.own && target.ownType !== undefined
    ? []
    : [`  const ${target.whole} = Data.taggedEnum<${target.type}>()`]
  const wrapped = target.entries.flatMap((entry) => entry.kind === "wrap" ? constructorsOf(entry.target) : [])
  return [...new Set([...own, ...whole, ...wrapped])]
}

const kidTarget: Target = {
  type: "MessageOf<typeof kid>",
  ownType: "KidMessage",
  own: "KidOwn",
  whole: "KidWhole",
  entries: [{ kind: "own", tag: "KInc", fields: "" }]
}
const palTarget: Target = {
  type: "MessageOf<typeof pal>",
  ownType: "PalMessage",
  own: "PalOwn",
  whole: "PalWhole",
  entries: [{ kind: "own", tag: "PSet", fields: "text: 'a'" }]
}
// What a program of `make` takes, by its composition: its own messages, and the wrappers of its children's, by the id
// the case writes.
const targetOf = (c: Case): Target => ({
  type: "MessageOf<typeof made>",
  ...(ownOf(c) === "Own" ? { ownType: "Own" } : {}),
  own: "MadeOwn",
  whole: "Made",
  entries: [
    ...(ownOf(c) === "Own" ? ["Inc", "Reset"].map((tag) => ({ kind: "own" as const, tag, fields: "" })) : []),
    ...(isKid(c.comp)
      ? [{
        kind: "wrap" as const,
        tag: "Kid",
        ...(c.comp === "childById" ? { id: "1" } : {}),
        instance: true,
        target: kidTarget
      }]
      : []),
    ...(c.comp === "pair"
      ? [{ kind: "wrap" as const, tag: "Pal", id: "1", instance: true, target: palTarget }]
      : [])
  ]
})

// What the parent of `parentLines` takes: its own message where the program has an external one, and the program's,
// wrapped.
const parentTarget = (made: Target, byId: boolean, external: boolean): Target => ({
  type: "MessageOf<typeof parent>",
  ...(external ? { ownType: "Go" } : {}),
  own: "ParentOwn",
  whole: "ParentWhole",
  entries: [
    ...(external ? [{ kind: "own" as const, tag: "Go", fields: "" }] : []),
    { kind: "wrap", tag: "Inner", ...(byId ? { id: "1" } : {}), instance: true, target: made }
  ]
})

// The functions that take a message: the dispatch of a run, and of a driver, each child's that `forwardTo` makes of
// them, the `send` of a driver and of a rehearsal, the `hear` of a rehearsal, and `simulate` and `applyAll`.
type Taker = "dispatch" | "forwardTo" | "driver.dispatch" | "driver.send" | "send" | "hear" | "simulate" | "applyAll"
const takers: ReadonlyArray<Taker> = [
  "dispatch",
  "forwardTo",
  "driver.dispatch",
  "driver.send",
  "send",
  "hear",
  "simulate",
  "applyAll"
]

// The lines that give `forwardTo` of `dispatch` the messages of each dispatch that `target` wraps, and of those they
// wrap in turn.
const forwardLines = (dispatch: string, target: Target, form: MessageForm, prefix: string): ReadonlyArray<string> =>
  target.entries.flatMap((entry, index) => {
    if (entry.kind === "own") return []
    const name = `${prefix}${index}`
    const given = givenIn(entry.target, form, `${name}_message`)
    return [
      `const ${name} = forwardTo(${dispatch}, '${entry.tag}'${entry.id === undefined ? "" : `, ${entry.id}`})`,
      `const ${name}_takes: Exactly<Parameters<typeof ${name}>[0], ${entry.target.type}> = true`,
      // The same child's, by an instance: it takes the same messages.
      `const ${name}_instance = forwardTo(${dispatch}, { _tag: '${entry.tag}', ${
        entry.id === undefined ? "" : `id: ${entry.id}, `
      }instance: 1 })`,
      `const ${name}_instance_takes: Exactly<Parameters<typeof ${name}_instance>[0], ${entry.target.type}> = true`,
      ...given.lines,
      ...given.messages.map((message) => `${name}(${message})`),
      ...forwardLines(name, entry.target, form, `${name}_to`)
    ]
  })

// What one function makes of the messages of `target`, given to `program` in `form`; nothing for `forwardTo` where the
// program wraps no dispatch.
const takerLines = (
  taker: Taker,
  program: string,
  types: Types,
  target: Target,
  form: MessageForm
): ReadonlyArray<string> => {
  const flags = types.flags === "never" ? "" : ", { flags: 3 }"
  const given = givenIn(target, form, "message")
  const sent = (to: string) => given.messages.map((message) => `  ${to}(() => Opt.some(${message}))`)
  const takes = (type: string) => `const takes: Exactly<${type}, ${target.type}> = true`
  switch (taker) {
    case "dispatch":
      return [
        `const dispatch = start(${program}${flags}).app.dispatch`,
        takes("Parameters<typeof dispatch>[0]"),
        ...given.lines,
        ...given.messages.map((message) => `dispatch(${message})`)
      ]
    case "forwardTo": {
      const forwarded = forwardLines("dispatch", target, form, "to")
      return forwarded.length === 0 ? [] : [`const dispatch = start(${program}${flags}).app.dispatch`, ...forwarded]
    }
    case "driver.dispatch":
    case "driver.send":
      return [
        ...given.lines,
        `const driven = drive(${program}, (driver) => Effect.sync(() => {`,
        ...(taker === "driver.dispatch"
          ? [
            `  ${takes("Parameters<typeof driver.dispatch>[0]")}`,
            ...given.messages.map((message) => `  driver.dispatch(${message})`)
          ]
          : [
            `  const takes: Exactly<ReturnType<Parameters<typeof driver.send>[0]>, Opt.Option<${target.type}>> = true`,
            ...sent("driver.send")
          ]),
        `})${flags})`
      ]
    case "send":
    case "hear":
      return [
        ...given.lines,
        `const rehearsed = rehearse(${program}, (rehearsal) => Effect.sync(() => {`,
        ...(taker === "send"
          ? [
            `  const takes: Exactly<ReturnType<Parameters<typeof rehearsal.send>[0]>, Opt.Option<${target.type}>> = true`,
            ...sent("rehearsal.send")
          ]
          : [
            `  ${takes("Parameters<typeof rehearsal.hear>[1]")}`,
            ...given.messages.map((message) => `  rehearsal.hear('heard', ${message})`)
          ]),
        `})${flags})`
      ]
    case "simulate":
    case "applyAll": {
      const from = taker === "applyAll"
        ? `savedState<StateOf<typeof ${program}>>()`
        : types.flags === "never"
        ? `${program}.init`
        : `${program}.init(3)`
      const args = `[${given.messages.join(", ")}], ${from}`
      return [
        ...given.lines,
        taker === "simulate" ? `simulate(${program}, ${args})` : `applyAll(${program}.update, ${args})`
      ]
    }
  }
}

// The parts of the functions given the messages of `target`, one for each function and form.
const takersOf = (program: string, types: Types, target: Target): ReadonlyArray<Part> =>
  takers.flatMap((taker) =>
    messageForms.flatMap((form) => {
      const lines = takerLines(taker, program, types, target, form)
      return lines.length === 0
        ? []
        : [{ label: `${taker}.${form}`, valid: true, lines: ["  {", ...lines.map((line) => `    ${line}`), "  }"] }]
    })
  )

// One program of `make` for each message it can have: its own or none, and its composition. It has an external
// message, so that the parent it is given to has one of its own. The axes of point 6 change no message but a child's
// that lacks them all, which nothing can send.
const messageCases = comps.flatMap((comp) =>
  (["Own", "never"] as const).flatMap((own) => {
    if (comp === "none" && own === "never") return []
    const layout = layoutsOf(comp)[0]
    const found = cases.find((c) =>
      isValid(c) && representative(c) && c.comp === comp && ownOf(c) === own && c.subs === "none"
      && c.services && c.kid === "full" && !c.named.has("output")
      && c.named.size === (own === "Own" ? 2 : 1) && c.named.has("external") && layout !== undefined
      && c.kidFlags === layout.kidFlags && c.childOptions === layout.childOptions && c.tell === layout.tell
    )
    return found === undefined ? [] : [found]
  })
)

const messageMembers: ReadonlyArray<Member> = messageCases.flatMap((c) => {
  const { expected, lines } = madeOf(c)
  const made = targetOf(c)
  const alone: Member = {
    id: `message.${c.id}`,
    parts: [
      { label: "program", valid: true, lines: [...lines, ...constructorsOf(made)] },
      ...takersOf("made", expected, made)
    ]
  }
  const asChild = (byId: boolean): Member => {
    const target = parentTarget(made, byId, expected.external !== "never")
    return {
      id: `message.${c.id}.${byId ? "childById" : "child"}`,
      parts: [
        {
          label: "program",
          valid: true,
          lines: [...lines, ...parentLines(byId, "made", expected, false, true), ...constructorsOf(target)]
        },
        ...takersOf("parent", parentTypes(expected, byId), target)
      ]
    }
  }
  return [alone, asChild(false), asChild(true)]
})

const header = `import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import {
  andThen, type CommandOf, forwardTo, type CommandServicesOf, type EventOf, type ExternalOf, type FlagsOf, type Instance, type Kept, type KeyOf,
  type MessageOf, type ModelOf, type OutputOf, type Program, program, reject, start, type StateOf,
  type SubscriptionServicesOf, type Transition, type Update,
} from '../src/index.ts'
import { applyAll, drive, rehearse, simulate } from '../src/testing/index.ts'
import {
  type Cmd, Db, type DriveRead, type Ev, type Exactly, type Ext, type Feed, feed, type Go, held, idle, inc, type Lock,
  kid, type KidCommand, type KidDb, type KidEvent, type KidFeed, type KidMessage, type KidState, kidF, type KReset,
  type MChild, type MChildById, type MNone, type MPair, other,
  type OuterOwn, type Own, pal, type PalEvent, type PalMessage, type PalState, type PClear, type RehearseRead,
  type SChild, type SChildById, type SimulateRead, type SPair, save, saved,
  savedState, type SNone, type StartRead, stray, ticked,
} from '../tools/inference/prelude.ts'
import * as Kids from './kids.ts'
`

// The run of the matrix (step 16, point 4): what compiles runs without a defect that the types could prevent, the
// second rule. Each program of a valid case is played with messages drawn by fast-check, alone and as the child of the
// parents of `parentLines`, which tell it its external messages, give it its flags and hear its events. The forms of
// a program differ in their types alone, so one program is played for each that runs differently: a program of
// `make` once for each type (`representative`), a program written as an object in a constant, and each hand-written
// one. The special cases are not played: each is written for what it checks of the types.
type Runnable = Readonly<{
  id: string
  lines: ReadonlyArray<string>
  types: Types
  messages: ReadonlyArray<string>
}>

const ownMessages = ["{ _tag: 'Inc' }", "{ _tag: 'Reset' }"]

// The messages a program of `make` is given: its own, those its children's views send, by an instance that may be past
// and an id that may not be there.
const messagesOf = (c: Case): ReadonlyArray<string> => [
  ...(ownOf(c) === "Own" ? ownMessages : []),
  ...(isKid(c.comp) && kidTypesOf(c.kid).message !== "never"
    ? (c.comp === "childById" ? ["id: 1, ", "id: 2, "] : [""]).flatMap((id) =>
      ["", ", instance: 0", ", instance: 1"].map((instance) =>
        `{ _tag: 'Kid', ${id}message: { _tag: 'KInc' }${instance} }`
      )
    )
    : []),
  ...(c.comp === "pair"
    ? [1, 2].flatMap((id) =>
      ["", ", instance: 0"].map((instance) =>
        `{ _tag: 'Pal', id: ${id}, message: { _tag: 'PSet', text: 'a' }${instance} }`
      )
    )
    : [])
]

const runnables: ReadonlyArray<Runnable> = [
  ...cases.filter((c) => isValid(c) && representative(c)).map((c) => {
    const { expected, lines } = madeOf(c)
    return { id: c.id, lines, types: expected, messages: messagesOf(c) }
  }),
  ...handCases.map((c) => {
    const { expected, lines } = handOf(c)
    return { id: c.id, lines, types: expected, messages: ownMessages }
  }),
  ...objectCases.filter((o) => o.violation === undefined && o.form === "constant").map((o) => ({
    id: o.id,
    lines: [`  const made = ${objectText(objectEntries(o), "  ")}`],
    types: objectTypes(o),
    messages: ownMessages
  }))
]

// What a runnable plays: the program, from its `init`, and as a child alone and as children by id, from their parent's.
// A parent's messages are those of the program, wrapped as its view sends them, and its own, which tells the program
// its external message.
const runLines = (r: Runnable) => {
  const from = r.types.flags === "never" ? "made.init" : "made.init(3)"
  const go = r.types.external === "never" ? [] : ["{ _tag: 'Go' }"]
  const parent = (name: string, byId: boolean, wrapped: ReadonlyArray<string>) => [
    `  const ${name} = (() => {`,
    ...parentLines(byId, "made", r.types, false, true),
    "    return parent",
    "  })()",
    `  const ${name}Played = played<typeof ${name}>('${r.id}/${
      byId ? "childById" : "child"
    }', ${name}, ${name}.init, [${[...go, ...wrapped].join(", ")}])`
  ]
  return [
    ...r.lines,
    `  const alone = played<typeof made>('${r.id}', made, ${from}, [${r.messages.join(", ")}])`,
    ...parent(
      "asChild",
      false,
      r.messages.flatMap((m) => [`{ _tag: 'Inner', message: ${m} }`, `{ _tag: 'Inner', message: ${m}, instance: 1 }`])
    ),
    ...parent(
      "asChildById",
      true,
      r.messages.flatMap((m) => [1, 2].map((id) => `{ _tag: 'Inner', id: ${id}, message: ${m} }`))
    ),
    "  return [alone, asChildPlayed, asChildByIdPlayed]"
  ]
}

// The run's files import what the cases do, but `savedState`, which exists only for `tsc`, and `played`.
const runHeader = header.replace(" savedState,", " played,")

// `asserts` are the lines, numbered as `tsc` numbers them, that assert the types a function gave back (`Exactly`), and
// that its run needs no service (`forkLines`).
const isAssert = (line: string) => line.includes(": Exactly<") || line.includes("Effect.runFork(")

type Span = Readonly<{
  id: string
  file: string
  from: number
  to: number
  valid: Verdict
  asserts: ReadonlySet<number>
}>

// A parent with `count` children, each with commands, events, subscriptions and services.
const scaled = (count: number) => {
  const ids = Array.from({ length: count }, (_, i) => i)
  return `import { type MessageOf, program } from '../../src/index.ts'
import { type Go, kid } from '../../tools/inference/prelude.ts'

type State = Readonly<{ n: number }>

export const { child, withChildren } = program<{ state: State; message: Go }>()

export const parent = withChildren({ ${ids.map((i) => `K${i}: child(kid)`).join(", ")} }).make({
  init: { state: { n: 0 } },
  update: () => (state) => ({ state, tell: [{ _tag: 'K${count - 1}', message: { _tag: 'KReset' } }] }),
  onEvent: { ${ids.map((i) => `K${i}: () => (state) => ({ state })`).join(", ")} },
  makeModel: (_, children) => ({ ${ids.map((i) => `k${i}: children.K${i}()`).join(", ")} }),
})

export type Message = MessageOf<typeof parent>
`
}

const compilerOptions = (exact: boolean, unchecked: boolean) => ({
  target: "ES2022",
  lib: ["ES2022"],
  module: "ESNext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  strict: true,
  exactOptionalPropertyTypes: exact,
  noUncheckedIndexedAccess: unchecked,
  skipLibCheck: true,
  types: []
})

type Diagnostic = Readonly<{ file: string; line: number; code: string; text: string }>
const parse = (output: string): Array<Diagnostic> => {
  const diagnostics: Array<Diagnostic> = []
  for (const raw of output.split("\n")) {
    const [, file, line, code, text] = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(raw.trim()) ?? []
    if (file !== undefined && code !== undefined && text !== undefined) {
      diagnostics.push({ file: file.replace(/\\/g, "/"), line: Number(line), code, text })
    }
  }
  return diagnostics
}

// One `tsc` on one file of cases or of the scale, with the options of `config`: what it reports. `config` names the
// configuration of the compiler too, since the checks of every configuration run at once.
const check = Effect.fnUntraced(function*(tsc: string, config: string, options: object, file: string) {
  const path = yield* Path.Path
  const directory = yield* out
  yield* write(path.join(directory, config), JSON.stringify({ compilerOptions: options, files: [file] }))
  const { stdout } = yield* exec(
    ChildProcess.make("node", [tsc, "-p", config, "--pretty", "false"], { cwd: directory })
  )
  return parse(stdout)
})

// The cases of a file: a `tsc` on a file of 4,608 of them holds 3 GB under 5.9, so a group is cut into files of this
// many, which take less memory each and share the jobs evenly. Each file pays for loading Effect's declarations once,
// about a second.
const chunk = 512

const list = (name: string, description: string, fallback: string) =>
  Flag.String(name).pipe(
    Flag.withDescription(description),
    Flag.withDefault(fallback),
    Flag.map((items) => items.split(","))
  )

// The values of an option of the compiler that the matrix takes, each with each value of the others.
const booleans = (name: string, option: string) =>
  list(name, `The values of ${option} the cases are checked with: true, false, or both separated by commas`, "true")
    .pipe(
      Flag.filter((items) => items.every((item) => item === "true" || item === "false"), () => "true, false, or both"),
      Flag.map((items) => items.map((item) => item === "true"))
    )

const command = Command.make(
  "inference",
  {
    typescript: list("typescript", "The versions of TypeScript the cases are checked with", "5.9,6.0,7.0"),
    exact: booleans("exact", "exactOptionalPropertyTypes"),
    unchecked: booleans("unchecked", "noUncheckedIndexedAccess"),
    filter: Flag.String("filter").pipe(
      Flag.withDescription("Generates only the cases whose id holds this text: all of them when none is given"),
      Flag.optional
    ),
    scale: list("scale", "The numbers of children of the parents of the scale", "1,2,4,8,16,32,64").pipe(
      Flag.map((counts) => counts.map(Number)),
      Flag.filter(
        (counts) => counts.every((count) => Number.isInteger(count) && count >= 1),
        () => "whole numbers of at least 1"
      )
    ),
    jobs: Flag.Int("jobs").pipe(
      Flag.withDescription(
        "How many `tsc` run at once, over the files of every configuration, and how many files are played at once"
      ),
      Flag.withDefault(Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))),
      Flag.filter((jobs) => jobs >= 1, () => "a whole number of at least 1")
    ),
    run: Flag.Boolean("run").pipe(
      Flag.withDescription(
        "Plays the programs of the valid cases with messages drawn by fast-check, once `tsc` has checked them, in place"
          + " of checking the cases: none may die of a defect"
      ),
      Flag.withDefault(false)
    ),
    runs: Flag.Int("runs").pipe(
      Flag.withDescription("How many lists of messages each program is played with, under --run"),
      Flag.withDefault(20),
      Flag.filter((runs) => runs >= 1, () => "a whole number of at least 1")
    ),
    seed: Flag.Int("seed").pipe(
      Flag.withDescription("The seed of fast-check under --run, to play again a run that found a defect"),
      Flag.optional
    )
  },
  Effect.fnUntraced(
    function*(
      {
        exact: exacts,
        filter: chosen,
        jobs,
        run,
        runs,
        scale: counts,
        seed: given,
        typescript: typescripts,
        unchecked: uncheckeds
      }
    ) {
      const filter = Opt.getOrUndefined(chosen)
      // The run checks its own files alone, with no scale.
      const scale = run ? [] : counts
      const selected = cases.filter((c) => filter === undefined || c.id.includes(filter))
      const selectedHand = handCases.filter((c) => filter === undefined || c.id.includes(filter))
      const selectedObject = objectCases.filter((o) => filter === undefined || o.id.includes(filter))
      const fs = yield* FileSystem.FileSystem
      const { join } = yield* Path.Path
      const root = yield* repository
      const directory = yield* out
      const spans: Array<Span> = []
      yield* fs.remove(directory, { recursive: true, force: true })
      yield* fs.makeDirectory(directory, { recursive: true })
      yield* write(join(directory, "kids.ts"), kidsModule())
      const groups = new Map<string, Array<Member>>()
      const add = (group: string, member: Member) => groups.set(group, [...(groups.get(group) ?? []), member])
      for (const r of run ? runnables : []) {
        if (filter === undefined || r.id.includes(filter)) {
          add("run", { id: r.id, parts: [{ label: "run", valid: true, lines: runLines(r) }] })
        }
      }
      for (const c of run ? [] : selected) {
        add(c.violation === undefined ? `${c.comp}.${c.update}` : `invalid.${c.comp}`, { id: c.id, parts: generate(c) })
      }
      for (const c of run ? [] : selectedHand) add("hand", { id: c.id, parts: generateHand(c) })
      for (const o of run ? [] : selectedObject) {
        add(o.violation === undefined ? `object.${o.form}` : "invalid.object", { id: o.id, parts: generateObject(o) })
      }
      for (const member of run ? [] : messageMembers) {
        if (filter === undefined || member.id.includes(filter)) add("message", member)
      }
      for (const special of run ? [] : specials) {
        if (filter === undefined || special.id.includes(filter)) {
          add("special", {
            id: special.id,
            parts: [{ label: "case", valid: special.valid, lines: special.body.split("\n") }]
          })
        }
      }
      const files: Array<string> = []
      for (const [group, all] of groups) {
        for (let first = 0; first < all.length; first += chunk) {
          const file = `${group}.${first / chunk}.ts`
          // The lines of the file, the first numbered 1, as `tsc` numbers them.
          const text = (run ? runHeader : header).trimEnd().split("\n")
          all.slice(first, first + chunk).forEach((member, index) => {
            text.push("", `// ${member.id}`, `export function case${index}() {`)
            for (const part of member.parts) {
              const from = text.length + 1
              // A program written in the call spans lines of its own.
              const written = part.lines.flatMap((line) => line.split("\n"))
              text.push(...written)
              spans.push({
                id: member.parts.length === 1 ? member.id : `${member.id}/${part.label}`,
                file,
                from,
                to: text.length,
                valid: part.valid,
                asserts: new Set(written.flatMap((line, index) => isAssert(line) ? [from + index] : []))
              })
            }
            text.push("}")
          })
          yield* write(join(directory, file), `${text.join("\n")}\n`)
          files.push(file)
        }
      }
      const valid = spans.filter((span) => span.valid === true || span.valid === "untyped").length
      yield* Console.log(`${spans.length} cases (${valid} valid) in ${files.length} files`)
      for (const count of scale) yield* write(join(directory, `scale/scale${count}.ts`), scaled(count))
      // The TypeScripts, installed apart as `smoke.ts` installs them.
      const tsDir = join(root, "node_modules/.cache/inference-typescripts")
      const missing = yield* Effect.filter(
        typescripts,
        (version) => Effect.map(fs.exists(join(tsDir, `node_modules/typescript-${version}`)), (exists) => !exists)
      )
      if (missing.length > 0) {
        yield* write(
          join(tsDir, "package.json"),
          JSON.stringify({
            name: "inference-typescripts",
            private: true,
            dependencies: Object.fromEntries(
              typescripts.map((version) => [`typescript-${version}`, `npm:typescript@~${version}`])
            )
          })
        )
        yield* step(tsDir, "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"])
      }
      // One `tsc` for each file of cases and each configuration, all in one pool: one program of all the cases takes
      // too much memory under 5.9, and 5.9 and 6.0 check on one thread.
      const configurations = yield* Effect.forEach(
        exacts.flatMap((exact) =>
          uncheckeds.flatMap((unchecked) => typescripts.map((version) => ({ exact, unchecked, version })))
        ),
        (configuration) =>
          Effect.map(
            readJson(join(tsDir, `node_modules/typescript-${configuration.version}/package.json`)),
            ({ version: exactVersion }) => ({
              ...configuration,
              exactVersion: exactVersion as string,
              tsc: join(tsDir, `node_modules/typescript-${configuration.version}/bin/tsc`),
              name: `${configuration.version}-${configuration.exact}-${configuration.unchecked}`
            })
          )
      )
      yield* Console.log(`${files.length * configurations.length} checks, ${jobs} at a time`)
      const started = performance.now()
      const checked = yield* Effect.forEach(
        configurations.flatMap((configuration) => files.map((file) => ({ configuration, file }))),
        ({ configuration, file }) =>
          Effect.gen(function*() {
            const begun = performance.now()
            const options = { ...compilerOptions(configuration.exact, configuration.unchecked), noEmit: true }
            const diagnostics = yield* check(
              configuration.tsc,
              `tsconfig.${configuration.name}.${file}.json`,
              options,
              file
            )
            return { name: configuration.name, diagnostics, seconds: (performance.now() - begun) / 1000 }
          }),
        { concurrency: jobs }
      )
      yield* Console.log(`checked in ${((performance.now() - started) / 1000).toFixed(1)}s`)
      // A diagnostic is of the file it names: the files of the cases are all in `directory`.
      const fileOf = (d: Diagnostic) => d.file.slice(d.file.lastIndexOf("/") + 1)
      const spansOf = new Map<string, Array<Span>>()
      for (const span of spans) spansOf.set(span.file, [...(spansOf.get(span.file) ?? []), span])
      const report: Record<string, unknown> = {}
      for (const { exact, exactVersion, name, tsc, unchecked, version } of configurations) {
        const own = checked.filter((result) => result.name === name)
        const diagnostics = own.flatMap((result) => result.diagnostics)
        const seconds = own.reduce((sum, result) => sum + result.seconds, 0).toFixed(1)
        const byFile = new Map<string, Array<Diagnostic>>()
        for (const d of diagnostics) byFile.set(fileOf(d), [...(byFile.get(fileOf(d)) ?? []), d])
        const outside = diagnostics.filter((d) =>
          !(spansOf.get(fileOf(d)) ?? []).some((s) => d.line >= s.from && d.line <= s.to)
        )
        const wrong: Array<Readonly<{ id: string; why: string; errors: ReadonlyArray<string> }>> = []
        const notes: Array<Readonly<{ id: string; why: string; errors: ReadonlyArray<string> }>> = []
        for (const span of spans) {
          const found = (byFile.get(span.file) ?? []).filter((d) => d.line >= span.from && d.line <= span.to)
          const errors = found.map((d) => `${d.line - span.from + 1}: ${d.code} ${d.text}`)
          if (span.valid === "untyped") {
            if (found.length > 0 && found.every((d) => span.asserts.has(d.line))) {
              wrong.push({ id: span.id, why: "valid, but taken with other types", errors })
            } else if (found.length > 0) {
              notes.push({ id: span.id, why: "valid in a form not typed, and refused: no rule is broken", errors })
            }
          } else if (span.valid === "refused") {
            if (errors.length === 0) {
              notes.push({ id: span.id, why: "refused, but compiles: no rule is broken", errors })
            }
          } else if (span.valid && errors.length > 0) wrong.push({ id: span.id, why: "valid, but fails", errors })
          else if (!span.valid && errors.length === 0) {
            wrong.push({ id: span.id, why: "broken, but compiles", errors })
          }
        }
        yield* Console.log(
          `typescript ${exactVersion}, exactOptionalPropertyTypes ${exact}, noUncheckedIndexedAccess ${unchecked}: ${seconds}s of checks, ${wrong.length} leads, ${notes.length} notes, ${outside.length} errors outside the cases`
        )
        for (const d of outside.slice(0, 10)) {
          yield* Console.log(`  outside: ${d.file}(${d.line}): ${d.code} ${d.text}`)
        }
        // The leads counted by what they are, the family of the case and the part: one cause often makes many.
        const tally = new Map<string, number>()
        for (const w of wrong) {
          const family = w.id.startsWith("invalid.") ? w.id.split(".").slice(0, 2).join(".") : w.id.split(".")[0]
          const part = w.id.includes("/") ? w.id.slice(w.id.lastIndexOf("/") + 1) : "case"
          const kind = `${w.why}: ${family}/${part}`
          tally.set(kind, (tally.get(kind) ?? 0) + 1)
        }
        for (const [kind, count] of tally) yield* Console.log(`  ${count} ${kind}`)
        for (const w of [...wrong, ...notes].slice(0, 10)) yield* Console.log(`  ${w.why}: ${w.id}`)
        // The scale, one file at a time: the time to check it, and the size of its declarations.
        const scaleReport: Array<
          Readonly<{ count: number; seconds: string; declarations: number; errors: number }>
        > = []
        for (const count of scale) {
          const declarations = join(directory, `declarations/${version}-${exact}-${unchecked}`)
          const begun = performance.now()
          const errors = yield* check(tsc, `tsconfig.scale${count}.json`, {
            ...compilerOptions(exact, unchecked),
            declaration: true,
            emitDeclarationOnly: true,
            outDir: declarations,
            rootDir: ".."
          }, `scale/scale${count}.ts`)
          const took = ((performance.now() - begun) / 1000).toFixed(1)
          const emitted = join(declarations, `.inference/scale/scale${count}.d.ts`)
          const size = (yield* fs.exists(emitted)) ? (yield* fs.readFileString(emitted)).length : -1
          scaleReport.push({ count, seconds: took, declarations: size, errors: errors.length })
        }
        yield* Console.log(
          `  scale: ${
            scaleReport.map((s) =>
              `${s.count}: ${s.seconds}s ${s.declarations}B${s.errors > 0 ? ` ${s.errors} errors` : ""}`
            ).join(", ")
          }`
        )
        report[`${exactVersion}/${exact}/${unchecked}`] = { seconds, wrong, notes, outside, scale: scaleReport }
      }
      yield* write(join(directory, "report.json"), JSON.stringify(report, null, 2))
      yield* Console.log(`report: ${join(directory, "report.json")}`)
      const leads = Object.values(report).reduce(
        (sum: number, configuration) =>
          sum + (configuration as Readonly<{ wrong: ReadonlyArray<unknown> }>).wrong.length,
        0
      )
      if (leads > 0) return yield* new Failed({ message: `${leads} leads` })
      if (!run) return
      // Each program played from one seed, printed, so that `--seed` plays a run that found a defect again.
      const seed = Opt.getOrElse(given, () => Math.floor(Math.random() * 2 ** 31))
      yield* Console.log(`playing, ${runs} lists of messages for each program, seed ${seed}`)
      const begun = performance.now()
      const played = yield* Effect.forEach(
        files,
        (file) =>
          Effect.gen(function*() {
            const { exitCode, stderr, stdout } = yield* exec(
              ChildProcess.make("bun", [
                join(root, "tools/inference/play.ts"),
                join(directory, file),
                "--runs",
                String(runs),
                "--seed",
                String(seed)
              ], { cwd: root })
            )
            if (exitCode !== 0) {
              return { count: 0, deaths: [{ id: file, died: `play exited with ${exitCode}: ${stderr}` }] }
            }
            return JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as Readonly<{
              count: number
              deaths: ReadonlyArray<Death>
            }>
          }),
        { concurrency: jobs }
      )
      const count = played.reduce((sum, file) => sum + file.count, 0)
      const deaths = played.flatMap((file) => file.deaths)
      const seconds = ((performance.now() - begun) / 1000).toFixed(1)
      yield* Console.log(`played ${count} programs in ${seconds}s: ${deaths.length} died`)
      for (const death of deaths.slice(0, 10)) {
        yield* Console.log(
          `  ${death.id}: ${death.died}${death.messages ? ` on ${JSON.stringify(death.messages)}` : ""}`
        )
      }
      yield* write(join(directory, "run.json"), JSON.stringify({ seed, deaths }, null, 2))
      yield* Console.log(`report: ${join(directory, "run.json")}`)
      if (deaths.length > 0) return yield* new Failed({ message: `${deaths.length} programs died, seed ${seed}` })
    }
  )
)

main(command)
