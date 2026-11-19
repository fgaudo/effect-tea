// The inference matrix: generates programs in each way they can be written, into `.inference/`, and checks with `tsc`
// that their types keep the three rules of `AGENTS.md` ("What belongs here"). Run by hand after a change of the types
// of `program.ts` or `compose.ts`; it fails when it finds a lead.
//
// Each valid case asserts, with `Exactly`, the state, model, messages, commands, events, external messages, flags and
// services read back from the program, assigns it to the `Program<…>` of the expected types, and makes it the child of
// a parent, whose types it asserts too. Each broken case asserts nothing, and must fail to compile somewhere in its
// range. A lead is a valid case that fails, or a broken one that compiles. A scale of parents with 1 to 64 children
// measures the time to check one, and the size of its declarations.
//
//   bun run inference [--typescript 5.9,6.0,7.0] [--exact true,false] [--unchecked true,false] [--filter <substring>]
//     [--scale 1,2,4,8,16,32,64]
//   bun run inference --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as fs from "node:fs"
import { dirname, join } from "node:path"
import { exec, Failed, main, root, step } from "../cli.ts"

const out = join(root, ".inference")

const write = (file: string, text: string) => {
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"))

type Name = "model" | "message" | "command" | "event" | "external" | "flags"
// `message` is named exactly when the program has an `update`: it follows from the form of `update`.
const names: ReadonlyArray<Name> = ["model", "command", "event", "external", "flags"]
// What `subscriptions` returns: nothing, a subscription that answers an own message, one that answers none (it only
// runs until its key goes), or an empty map.
type Subs = "none" | "emits" | "silent" | "empty"
type Comp = "none" | "child" | "childById" | "input" | "inputById" | "mixed"
// `outside`: a constant typed `Update<…>`, given to `make` by name.
type UpdateForm = "absent" | "annotated" | "contextual" | "outside"
type Violation =
  | "wrongMessage"
  | "wrongModel"
  | "wrongCommand"
  | "missingRunCommand"
  | "wrongEvent"
  | "externalNotAmong"
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

// How wide the tag of a message or command that takes the name of a child or of an input is: the name itself, any
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
  place: "at" | "getset"
  // The pieces of `make` in the order of the guide, or the reverse.
  order: "canonical" | "reversed"
  // Every parameter that can be annotated is, but `children`, whose type is not exported.
  annotate: boolean
  violation?: Violation
}>

const isKid = (comp: Comp) => comp === "child" || comp === "childById" || comp === "mixed"
const S: Record<Comp, string> = {
  none: "SNone",
  child: "SChild",
  childById: "SChildById",
  input: "SInput",
  inputById: "SInputById",
  mixed: "SMixed"
}
const M: Record<Comp, string> = {
  none: "MNone",
  child: "MChild",
  childById: "MChildById",
  input: "MInput",
  inputById: "MInputById",
  mixed: "MMixed"
}
const inferredModel: Record<Comp, string> = {
  none: "{ count: number }",
  child: "{ count: number; kid: number }",
  childById: "{ count: number; kids: number[] }",
  input: "{ count: number; name: string }",
  inputById: "{ count: number }",
  mixed: "{ count: number; kid: number; name: string }"
}
const tagOf: Record<Comp, string> = {
  none: "Kid",
  child: "Kid",
  childById: "Kid",
  input: "Name",
  inputById: "Count",
  mixed: "Name"
}

// The own messages the program has: those it names, or none.
const ownOf = (c: Case) => c.named.has("message") ? "Own" : "never"

// A program whose `external` names a message it does not have is invalid, whatever the case meant.
const isValid = (c: Case) => c.violation === undefined && !(c.named.has("external") && ownOf(c) === "never")

// Broken rules that would compile and still work: an `update` that nothing calls, a `runCommand` that nothing runs.
const harmless: ReadonlySet<Violation> = new Set<Violation>(["updateUnnamed", "extraRunCommand"])
const verdictOf = (c: Case): Verdict =>
  isValid(c) ? true : c.violation !== undefined && harmless.has(c.violation) ? "refused" : false

const generate = (c: Case): string => {
  const v = c.violation
  const has = (name: Name) => c.named.has(name)
  const a = (type: string) => (c.annotate ? `: ${type}` : "")
  const state = S[c.comp]
  const own = ownOf(c)
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
  if (has("external")) {
    typeFields.push(v === "externalNotAmong" ? "external: Readonly<{ _tag: 'Other' }>" : "external: Ext")
  }
  if (has("flags")) typeFields.push("flags: number")
  const T = `{ ${typeFields.join("; ")} }`
  const functions = ["make"]
  if (c.comp === "mixed") functions.push("child", "input")
  else if (c.comp !== "none") functions.push(c.comp)
  const lines: Array<string> = []
  lines.push(`  const { ${functions.join(", ")} } = program<${T}>()`)
  const entries: Array<string> = []
  // init
  const flagsHere = v === "flagsStep" ? false : v === "flagsUnnamed" ? true : has("flags")
  const n = flagsHere ? "flags" : "0"
  const ownCommands = has("command") || v === "unnamedCommand" ? ["{ _tag: 'Save' }"] : []
  const stateValue = (kid: string) => {
    const nValue = v === "wrongInitState" ? `String(${n})` : n
    switch (c.comp) {
      case "none":
        return `{ n: ${nValue} }`
      case "child":
        return `{ n: ${nValue}, kid: ${kid}.state }`
      case "childById":
        return `{ n: ${nValue}, kids: { 1: ${kid}.state } }`
      case "input":
        return `{ n: ${nValue}, name: '' }`
      case "inputById":
        return `{ n: ${nValue}, counts: {} }`
      case "mixed":
        return `{ n: ${nValue}, kid: ${kid}.state, name: '' }`
    }
  }
  if (isKid(c.comp)) {
    const start = c.comp === "childById"
      ? (c.kidFlags ? "children.Kid.init(1, 5)" : "children.Kid.init(1)")
      : (c.kidFlags ? "children.Kid.init(5)" : "children.Kid.init")
    const commands = `[...k.commands${ownCommands.map((command) => `, ${command}`).join("")}]`
    const body = `{ const k = ${start}; return { state: ${stateValue("k")}, commands: ${commands} } }`
    entries.push(
      flagsHere ? `    init: (children) => (flags${a("number")}) => ${body},` : `    init: (children) => ${body},`
    )
  } else {
    const commands = ownCommands.length > 0 ? `, commands: [${ownCommands.join(", ")}]` : ""
    const step = `{ state: ${stateValue("")}${commands} }`
    entries.push(flagsHere ? `    init: (flags${a("number")}) => (${step}),` : `    init: ${step},`)
  }
  // children and inputs
  const kidProgram = c.kidFlags ? "kidF" : "kid"
  if (c.comp === "child" || c.comp === "mixed") {
    entries.push(
      c.place === "at"
        ? `    children: { Kid: child(${kidProgram}, { at: Optic.id<${state}>().key('kid') }) },`
        : `    children: { Kid: child(${kidProgram}, { get: (state${a(state)}) => Opt.some(state.kid), set: (state${
          a(state)
        }, kid${a("KidState")}) => ({ ...state, kid }) }) },`
    )
  } else if (c.comp === "childById") {
    const subscribed = `subscribed: (state${
      a(state)
    }) => Object.entries(state.kids).map(([id, kid]) => [Number(id), kid] as const)`
    entries.push(
      c.place === "at"
        ? `    children: { Kid: childById(${kidProgram}, { at: (id: number) => Optic.id<SChildById>().key('kids').optionalKey(id).notUndefined(), ${subscribed} }) },`
        : `    children: { Kid: childById(${kidProgram}, { get: (state${
          a(state)
        }, id: number) => Opt.fromNullishOr(state.kids[id]), set: (state${a(state)}, id${a("number")}, kid${
          a("KidState")
        }) => ({ ...state, kids: { ...state.kids, [id]: kid } }), ${subscribed} }) },`
    )
  }
  if (c.comp === "input" || c.comp === "mixed") {
    entries.push(
      c.place === "at"
        ? `    inputs: { Name: input({ at: Optic.id<${state}>().key('name') }) },`
        : `    inputs: { Name: input({ get: (state${a(state)}) => Opt.some(state.name), set: (state${a(state)}, name${
          a("string")
        }) => ({ ...state, name }) }) },`
    )
  } else if (c.comp === "inputById") {
    entries.push(
      c.place === "at"
        ? "    inputs: { Count: inputById({ at: (id: string) => Optic.id<SInputById>().key('counts').at(id) }) },"
        : `    inputs: { Count: inputById({ get: (state${
          a(state)
        }, id: string) => Opt.fromNullishOr(state.counts[id]), set: (state${a(state)}, id${a("string")}, count${
          a("number")
        }) => ({ ...state, counts: { ...state.counts, [id]: count } }) }) },`
    )
  }
  // update
  if (c.update !== "absent") {
    const message = v === "wrongMessage" ? "Readonly<{ _tag: 'Other' }>" : "Own"
    const head = c.update === "annotated"
      ? `(message: ${message}) => (state: ${state}) =>`
      : c.update === "outside"
      ? "(message) => (state) =>"
      : `(message${has("message") && v !== "wrongMessage" ? "" : `: ${message}`}${
        isKid(c.comp) ? ", children" : ""
      }) => (state) =>`
    const toKid = v === "ownToChild" ? "KInc" : "KReset"
    const resetTo = c.update === "contextual" && isKid(c.comp)
      ? (c.comp === "childById"
        ? `children.Kid.update(1, { _tag: '${toKid}' })(state)`
        : `children.Kid.update({ _tag: '${toKid}' })(state)`)
      : "{ state: { ...state, n: 0 } }"
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
    const body = [
      `${head} {`,
      `      if (message._tag === 'Reset') return ${resetTo}`,
      "      if (state.n > 9) return reject",
      `      return { state: { ...state, n: state.n + 1 }${commands}${events} }`,
      "    }"
    ].join("\n")
    if (c.update === "outside") {
      lines.push(
        `  const update: Update<${state}, ${message}, ${has("command") ? "Cmd" : "never"}, ${
          has("event") ? "Ev" : "never"
        }> = ${body.replace(/\n {4}/g, "\n  ")}`
      )
      entries.push("    update,")
    } else {
      entries.push(`    update: ${body},`)
    }
  }
  // runCommand
  if ((has("command") && v !== "missingRunCommand") || v === "extraRunCommand") {
    const answer = own === "Own" ? "Opt.some({ _tag: 'Inc' } as const)" : "Opt.none()"
    entries.push(`    runCommand: (command${a("Cmd")}) => Effect.as(Effect.service(Db), ${answer}),`)
  }
  if (c.subs === "emits") {
    entries.push(
      `    subscriptions: (state${a(state)}) => state.n > 0 ? HashMap.make(['own', feed]) : HashMap.empty(),`
    )
  } else if (c.subs === "silent") {
    entries.push(
      `    subscriptions: (state${a(state)}) => state.n > 0 ? HashMap.make(['lock', held]) : HashMap.empty(),`
    )
  } else if (c.subs === "empty") {
    entries.push(`    subscriptions: (state${a(state)}) => HashMap.empty(),`)
  }
  if (isKid(c.comp) && v !== "missingOnEvent") {
    const handler = c.comp === "childById"
      ? (c.annotate ? `(id: number, event: KidEvent) => (state: ${state})` : "(id, event, children) => (state)")
      : (c.annotate ? `(event: KidEvent) => (state: ${state})` : "(event, children) => (state)")
    entries.push(`    onEvent: { Kid: ${handler} => ({ state }) },`)
  }
  // makeModel
  const model = v === "wrongModel" ? "String(state.n)" : "state.n"
  const s = `state${a(state)}`
  switch (c.comp) {
    case "none":
    case "inputById":
      entries.push(`    makeModel: (${s}) => ({ count: ${model} }),`)
      break
    case "input":
      entries.push(`    makeModel: (${s}) => ({ count: ${model}, name: state.name }),`)
      break
    case "child":
      entries.push(`    makeModel: (${s}, children) => ({ count: ${model}, kid: children.Kid(state) }),`)
      break
    case "mixed":
      entries.push(
        `    makeModel: (${s}, children) => ({ count: ${model}, kid: children.Kid(state), name: state.name }),`
      )
      break
    case "childById":
      entries.push(
        `    makeModel: (${s}, children) => ({ count: ${model}, kids: Object.keys(state.kids).map((id) => children.Kid(state, Number(id))) }),`
      )
      break
  }
  lines.push("  const made = make({")
  lines.push(...(c.order === "reversed" ? [...entries].reverse() : entries))
  lines.push("  })")
  if (!isValid(c)) {
    lines.push(
      `  const used = program<{ state: Outer<${state}> }>().child(made, { get: (state) => Opt.some(state.inner), set: (state, inner) => ({ ...state, inner }) })`
    )
    lines.push("  return made === used.program")
    return lines.join("\n")
  }
  const kidAt = c.comp === "childById" ? " & Readonly<{ id: number }>" : ""
  const message = [
    own,
    ...(isKid(c.comp) ? [`Readonly<{ _tag: 'Kid'; message: KidMessage }>${kidAt}`] : []),
    ...(c.comp === "input" || c.comp === "mixed" ? ["Readonly<{ _tag: 'Name'; message: Written<string> }>"] : []),
    ...(c.comp === "inputById" ? ["Readonly<{ _tag: 'Count'; id: string; message: Written<number> }>"] : [])
  ].join(" | ")
  const hasCommands = has("command") || isKid(c.comp)
  const command = [
    has("command") ? "Cmd" : "never",
    ...(isKid(c.comp) ? [`Readonly<{ _tag: 'Kid'; command: KidCommand }>${kidAt}`] : [])
  ].join(" | ")
  const expected: Record<string, string> = {
    state,
    model: has("model") ? M[c.comp] : inferredModel[c.comp],
    message,
    command,
    event: has("event") ? "Ev" : "never",
    external: has("external") ? "Ext" : "never",
    flags: has("flags") ? "number" : "never",
    commandServices: [has("command") ? "Db" : "never", isKid(c.comp) ? "KidDb" : "never"].join(" | "),
    subscriptionServices: [
      c.subs === "emits" ? "Feed" : c.subs === "silent" ? "Lock" : "never",
      isKid(c.comp) ? "KidFeed" : "never"
    ].join(" | ")
  }
  const readers: Record<string, string> = {
    state: "StateOf",
    model: "ModelOf",
    message: "MessageOf",
    command: "CommandOf",
    event: "EventOf",
    external: "ExternalOf",
    flags: "FlagsOf",
    commandServices: "CommandServicesOf",
    subscriptionServices: "SubscriptionServicesOf"
  }
  for (const [key, reader] of Object.entries(readers)) {
    lines.push(`  const ${key}: Exactly<${reader}<typeof made>, ${expected[key]}> = true`)
  }
  const programFields = Object.entries(expected).map(([key, type]) => `${key}: ${type}`).join("; ")
  lines.push(`  const typed: Program<{ ${programFields} }> = made`)
  // The program as a child of a parent that uses all it has: its flags, its external message and its events.
  lines.push(`  const Parent = program<{ state: Outer<${state}>${has("external") ? "; message: Go" : ""} }>()`)
  lines.push("  const parent = Parent.make({")
  lines.push(
    `    init: (children) => { const i = children.Inner.init${
      has("flags") ? "(3)" : ""
    }; return { state: { inner: i.state }, commands: i.commands } },`
  )
  lines.push(`    children: { Inner: Parent.child(made, { at: Optic.id<Outer<${state}>>().key('inner') }) },`)
  if (has("external")) {
    lines.push("    update: (_, children) => (state) => children.Inner.update({ _tag: 'Reset' })(state),")
  }
  if (has("event")) lines.push("    onEvent: { Inner: (event, children) => (state) => ({ state }) },")
  lines.push("    makeModel: (state, children) => children.Inner(state),")
  lines.push("  })")
  const parentExpected: Record<string, string> = {
    state: `Outer<${state}>`,
    model: expected.model ?? "",
    message: `${has("external") ? "Go | " : ""}Readonly<{ _tag: 'Inner'; message: ${message} }>`,
    command: hasCommands ? `Readonly<{ _tag: 'Inner'; command: ${command} }>` : "never",
    event: "never",
    external: "never",
    flags: "never",
    commandServices: expected.commandServices ?? "",
    subscriptionServices: expected.subscriptionServices ?? ""
  }
  for (const [key, reader] of Object.entries(readers)) {
    lines.push(`  const parent_${key}: Exactly<${reader}<typeof parent>, ${parentExpected[key]}> = true`)
  }
  lines.push("  return [typed, parent]")
  return lines.join("\n")
}

// The hand-written family: a program annotated with `Program<…>`, whose pieces take their types from it.
type HandName = "command" | "event" | "external" | "flags" | "commandServices" | "subscriptionServices"
type HandCase = Readonly<{
  id: string
  named: ReadonlySet<HandName>
  update: "annotated" | "contextual"
  subs: boolean
}>

const generateHand = (c: HandCase): string => {
  const has = (name: HandName) => c.named.has(name)
  const fields = ["state: SNone", "model: MNone", "message: Own"]
  if (has("command")) fields.push("command: Cmd")
  if (has("event")) fields.push("event: Ev")
  if (has("external")) fields.push("external: Ext")
  if (has("flags")) fields.push("flags: number")
  if (has("commandServices")) fields.push("commandServices: Db")
  if (has("subscriptionServices")) fields.push("subscriptionServices: Feed")
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
  if (has("command")) {
    lines.push(
      has("commandServices")
        ? "    runCommand: (command) => Effect.as(Effect.service(Db), Opt.some({ _tag: 'Inc' } as const)),"
        : "    runCommand: (command) => Effect.succeedSome({ _tag: 'Inc' } as const),"
    )
  }
  lines.push(
    c.subs
      ? "    subscriptions: (state) => state.n > 0 ? HashMap.make(['own', feed]) : HashMap.empty(),"
      : "    subscriptions: () => HashMap.empty(),"
  )
  lines.push("    makeModel: (state) => ({ count: state.n }),")
  lines.push("  }")
  const expected: Record<string, string> = {
    StateOf: "SNone",
    ModelOf: "MNone",
    MessageOf: "Own",
    CommandOf: has("command") ? "Cmd" : "never",
    EventOf: has("event") ? "Ev" : "never",
    ExternalOf: has("external") ? "Ext" : "never",
    FlagsOf: has("flags") ? "number" : "never",
    CommandServicesOf: has("command") && has("commandServices") ? "Db" : "never",
    SubscriptionServicesOf: has("subscriptionServices") ? "Feed" : "never"
  }
  for (const [reader, type] of Object.entries(expected)) {
    lines.push(`  const ${reader}_: Exactly<${reader}<typeof made>, ${type}> = true`)
  }
  lines.push(
    "  const used = program<{ state: Outer<SNone> }>().child(made, { get: (state) => Opt.some(state.inner), set: (state, inner) => ({ ...state, inner }) })"
  )
  lines.push("  return made === used.program")
  return lines.join("\n")
}

const subsets = <A>(items: ReadonlyArray<A>): ReadonlyArray<ReadonlySet<A>> =>
  Array.from({ length: 2 ** items.length }, (_, mask) => new Set(items.filter((_, i) => (mask >> i) & 1)))

const cases: Array<Case> = []
const comps: ReadonlyArray<Comp> = ["none", "child", "childById", "input", "inputById", "mixed"]
for (const comp of comps) {
  // Without children, so that `update` can be written apart: with them, it takes `children`, whose type is not exported.
  const forms: ReadonlyArray<UpdateForm> = isKid(comp)
    ? ["absent", "annotated", "contextual"]
    : ["absent", "annotated", "contextual", "outside"]
  for (const update of forms) {
    for (const subset of subsets(names)) {
      const named = new Set(subset)
      if (update !== "absent") named.add("message")
      for (const subs of ["none", "emits", "silent", "empty"] as const) {
        for (const kidFlags of isKid(comp) ? [false, true] : [false]) {
          for (const place of comp === "none" ? (["getset"] as const) : (["at", "getset"] as const)) {
            for (const order of ["canonical", "reversed"] as const) {
              for (const annotate of [false, true]) {
                const c: Case = { id: "", named, comp, update, subs, kidFlags, place, order, annotate }
                // A subscription that answers with an own message needs one: without, it answers with none.
                if (subs === "emits" && ownOf(c) === "never") continue
                const id = [
                  comp,
                  update,
                  [...named].join("+") || "state",
                  ...(subs === "none" ? [] : [subs]),
                  ...(kidFlags ? ["kidFlags"] : []),
                  place,
                  order,
                  ...(annotate ? ["annotated"] : [])
                ].join(".")
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
  { violation: "externalNotAmong", applies: () => true },
  { violation: "unnamedCommand", applies: () => true, named: (named) => named.delete("command") },
  { violation: "unnamedEvent", applies: (c) => c.update !== "absent", named: (named) => named.delete("event") },
  { violation: "flagsStep", applies: () => true },
  { violation: "flagsUnnamed", applies: () => true, named: (named) => named.delete("flags") },
  { violation: "wrongInitState", applies: () => true },
  { violation: "missingOnEvent", applies: (c) => isKid(c.comp) },
  { violation: "ownToChild", applies: (c) => isKid(c.comp) && c.update === "contextual" },
  ...widths.flatMap((width) => [
    { violation: `clash.${width}` as const, applies: (c: Case) => c.comp !== "none" && c.update !== "absent" },
    { violation: `commandClash.${width}` as const, applies: (c: Case) => c.comp !== "none" }
  ]),
  { violation: "extraRunCommand", applies: () => true, named: (named) => named.delete("command") },
  // `message` named and no `update`, and an `update` with no `message` named.
  { violation: "missingUpdate", applies: (c) => c.update === "absent", named: (named) => named.add("message") },
  { violation: "updateUnnamed", applies: (c) => c.update !== "absent", named: (named) => named.delete("message") }
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
        place: "getset",
        order: "canonical",
        annotate: false,
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

// By the three rules the types of a program keep (`AGENTS.md`, "What belongs here"): `true` must compile, and fails
// only against the first or the third; `false` must not, since it breaks the second; and `refused` must not either,
// but would break none if it compiled, so that it is reported apart, as a note.
type Verdict = boolean | "refused"

// Cases written by hand, each with its verdict.
const specials: ReadonlyArray<Readonly<{ id: string; valid: Verdict; body: string }>> = [
  {
    id: "special.silent-subscription-without-message",
    valid: true,
    body: `  const made = program<{ state: SNone }>().make({
    init: { state: { n: 0 } },
    subscriptions: (state) => state.n > 0 ? HashMap.make(['lock', held]) : HashMap.empty(),
    makeModel: () => null,
  })
  const message: Exactly<MessageOf<typeof made>, never> = true
  const services: Exactly<SubscriptionServicesOf<typeof made>, Lock> = true
  return [message, services]`
  },
  {
    id: "special.empty-subscriptions-without-message",
    valid: true,
    body: `  const made = program<{ state: SNone }>().make({
    init: { state: { n: 0 } },
    subscriptions: () => HashMap.empty(),
    makeModel: () => null,
  })
  const message: Exactly<MessageOf<typeof made>, never> = true
  const services: Exactly<SubscriptionServicesOf<typeof made>, never> = true
  return [message, services]`
  },
  {
    id: "special.silent-subscription-beside-messages",
    valid: true,
    body: `  const made = program<{ state: SNone; message: Own }>().make({
    init: { state: { n: 0 } },
    update: () => (state) => ({ state }),
    subscriptions: () => HashMap.make(['lock', held], ['own', feed]),
    makeModel: () => null,
  })
  const services: Exactly<SubscriptionServicesOf<typeof made>, Lock | Feed> = true
  return services`
  },
  // A state type without fields is refused: `state: object` is the empty state.
  ...["{}", "Readonly<{}>", "Record<never, never>"].map((type) => ({
    id: `special.state-without-fields.${type}`,
    valid: false,
    body: `  const made = program<{ state: ${type} }>().make({ init: { state: 0 }, makeModel: () => null })
  const used = program<{ state: Outer<object> }>().child(made, { get: (state) => Opt.some(state.inner), set: (_, inner) => ({ inner }) })
  return used`
  })),
  {
    id: "special.state-object",
    valid: true,
    body: `  const made = program<{ state: object }>().make({ init: { state: {} }, makeModel: () => null })
  const state: Exactly<StateOf<typeof made>, object> = true
  const used = program<{ state: Outer<object> }>().child(made, { get: (state) => Opt.some(state.inner), set: (_, inner) => ({ inner }) })
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
    subscriptions: () => HashMap.empty(),
    makeModel: (state) => ({ count: state.n }),
  }
  const event: Exactly<EventOf<typeof made>, never> = true
  return event`
  },
  // A parent's `external` that names a message its child keeps to itself is refused at `make`.
  {
    id: "special.external-a-child-keeps-to-itself",
    valid: false,
    body: `  type Through = Readonly<{ kid: KidState }>
  const Parent = program<{ state: Through; external: Readonly<{ _tag: 'Kid'; message: Readonly<{ _tag: 'KInc' }> }> }>()
  const parent = Parent.make({
    init: (children) => ({ state: { kid: children.Kid.init.state }, commands: children.Kid.init.commands }),
    children: { Kid: Parent.child(kid, { at: Optic.id<Through>().key('kid') }) },
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  },
  {
    id: "special.external-a-child-takes",
    valid: true,
    body: `  type Through = Readonly<{ kid: KidState }>
  const Parent = program<{ state: Through; external: Readonly<{ _tag: 'Kid'; message: Readonly<{ _tag: 'KReset' }> }> }>()
  const parent = Parent.make({
    init: (children) => ({ state: { kid: children.Kid.init.state }, commands: children.Kid.init.commands }),
    children: { Kid: Parent.child(kid, { at: Optic.id<Through>().key('kid') }) },
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  const external: Exactly<ExternalOf<typeof parent>, Readonly<{ _tag: 'Kid'; message: Readonly<{ _tag: 'KReset' }> }>> = true
  return external`
  },
  // A parent's `external` whose tag is wide enough to name the child, with a message the child keeps to itself.
  ...["string", "`K${string}`"].map((tag) => ({
    id: `special.external-wide-tag.${tag === "string" ? "string" : "template"}`,
    valid: false as const,
    body: `  type Through = Readonly<{ kid: KidState }>
  const Parent = program<{ state: Through; external: Readonly<{ _tag: ${tag}; message: Readonly<{ _tag: 'KInc' }> }> }>()
  const parent = Parent.make({
    init: (children) => ({ state: { kid: children.Kid.init.state }, commands: children.Kid.init.commands }),
    children: { Kid: Parent.child(kid, { at: Optic.id<Through>().key('kid') }) },
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  })),
  // Children and inputs given as a record of wide keys: an own message that takes the name of one is broken. One that
  // takes another name is the control: refused, since the same program can be written with the names as they are.
  ...([["Kid", false], ["Inc", "refused"]] as const).map(([tag, valid]) => ({
    id: `special.children-wide-names.${tag}`,
    valid,
    body: `  type Through = Readonly<{ n: number; kid: KidState }>
  const Parent = program<{ state: Through; message: Readonly<{ _tag: '${tag}' }> }>()
  const handle = Parent.child(kid, { at: Optic.id<Through>().key('kid') })
  const children: Readonly<Record<string, typeof handle>> = { Kid: handle }
  const parent = Parent.make({
    init: () => ({ state: { n: 0, kid: { k: 0 } } }),
    children,
    update: () => (state) => ({ state }),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  })),
  ...([["Name", false], ["Inc", "refused"]] as const).map(([tag, valid]) => ({
    id: `special.inputs-wide-names.${tag}`,
    valid,
    body: `  type Named = Readonly<{ n: number; name: string }>
  const Parent = program<{ state: Named; message: Readonly<{ _tag: '${tag}' }> }>()
  const name = Parent.input({ at: Optic.id<Named>().key('name') })
  const inputs: Readonly<Record<string, typeof name>> = { Name: name }
  const parent = Parent.make({
    init: { state: { n: 0, name: '' } },
    inputs,
    update: () => (state) => ({ state }),
    makeModel: () => null,
  })
  return parent`
  })),
  // A wide type in a place of a program without children or inputs is true, and read back as named.
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
    body: `  type Through = Readonly<{ kid: KidState }>
  const Parent = program<{ state: Through; message: ${type} }>()
  const parent = Parent.make({
    init: (children) => ({ state: { kid: children.Kid.init.state }, commands: children.Kid.init.commands }),
    children: { Kid: Parent.child(kid, { at: Optic.id<Through>().key('kid') }) },
    update: () => (state) => ({ state }),
    onEvent: { Kid: () => (state) => ({ state }) },
    makeModel: () => null,
  })
  return parent`
  })),
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
    program<{ state: Outer<SNone> }>().child(p, { get: (state) => Opt.some(state.inner), set: (_, inner) => ({ inner }) })
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

const header = `import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import {
  type CommandOf, type CommandServicesOf, type EventOf, type ExternalOf, type FlagsOf, type MessageOf, type ModelOf,
  type Program, program, reject, type StateOf, type SubscriptionServicesOf, type Update,
} from '../src/index.ts'
import {
  type Cmd, Db, type Ev, type Exactly, type Ext, type Feed, feed, type Go, held, type Lock, kid, type KidCommand, type KidDb,
  type KidEvent, type KidFeed, type KidMessage, type KidState, kidF, type MChild, type MChildById, type MInput,
  type MInputById, type MMixed, type MNone, type Outer, type Own, type SChild, type SChildById, type SInput,
  type SInputById, type SMixed, type SNone, type Written,
} from '../tools/inference/prelude.ts'
`

type Span = Readonly<{ id: string; file: string; from: number; to: number; valid: Verdict }>

// A parent with `count` children, each with commands, events, subscriptions and services.
const scaled = (count: number) => {
  const ids = Array.from({ length: count }, (_, i) => i)
  return `import * as Optic from 'effect/Optic'
import { type MessageOf, program } from '../../src/index.ts'
import { type Go, kid, type KidState } from '../../tools/inference/prelude.ts'

type State = Readonly<{ ${ids.map((i) => `k${i}: KidState`).join("; ")} }>

export const { make, child } = program<{ state: State; message: Go }>()

export const parent = make({
  init: (children) => ({
    state: { ${ids.map((i) => `k${i}: children.K${i}.init.state`).join(", ")} },
    commands: [${ids.map((i) => `...children.K${i}.init.commands`).join(", ")}],
  }),
  children: { ${ids.map((i) => `K${i}: child(kid, { at: Optic.id<State>().key('k${i}') })`).join(", ")} },
  update: (_, children) => (state) => children.K${count - 1}.update({ _tag: 'KReset' })(state),
  onEvent: { ${ids.map((i) => `K${i}: (event, children) => (state) => ({ state })`).join(", ")} },
  makeModel: (state, children) => ({ ${ids.map((i) => `k${i}: children.K${i}(state)`).join(", ")} }),
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

// One `tsc` on one file of cases or of the scale, with the options of `config`: what it reports.
const check = Effect.fnUntraced(function*(tsc: string, config: string, options: object, file: string) {
  write(join(out, config), JSON.stringify({ compilerOptions: options, files: [file] }))
  const { stdout } = yield* exec(ChildProcess.make("node", [tsc, "-p", config, "--pretty", "false"], { cwd: out }))
  return parse(stdout)
})

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
    )
  },
  Effect.fnUntraced(
    function*({ exact: exacts, filter: chosen, scale, typescript: typescripts, unchecked: uncheckeds }) {
      const filter = Opt.getOrUndefined(chosen)
      const selected = cases.filter((c) => filter === undefined || c.id.includes(filter))
      const selectedHand = handCases.filter((c) => filter === undefined || c.id.includes(filter))
      const spans: Array<Span> = []
      fs.rmSync(out, { recursive: true, force: true })
      fs.mkdirSync(out, { recursive: true })
      const groups = new Map<string, Array<Readonly<{ id: string; valid: Verdict; body: string }>>>()
      const add = (group: string, member: Readonly<{ id: string; valid: Verdict; body: string }>) =>
        groups.set(group, [...(groups.get(group) ?? []), member])
      for (const c of selected) {
        add(c.violation === undefined ? `${c.comp}.${c.update}` : `invalid.${c.comp}`, {
          id: c.id,
          valid: verdictOf(c),
          body: generate(c)
        })
      }
      for (const c of selectedHand) add("hand", { id: c.id, valid: true, body: generateHand(c) })
      for (const special of specials) {
        if (filter === undefined || special.id.includes(filter)) add("special", special)
      }
      for (const [group, members] of groups) {
        const file = `${group}.ts`
        let text = header
        let line = header.split("\n").length
        members.forEach((member, index) => {
          const block = `\n// ${member.id}\nexport function case${index}() {\n${member.body}\n}\n`
          const from = line + 1
          line += block.split("\n").length - 1
          spans.push({ id: member.id, file, from, to: line, valid: member.valid })
          text += block
        })
        write(join(out, file), text)
      }
      const valid = spans.filter((span) => span.valid === true).length
      yield* Console.log(`${spans.length} cases (${valid} valid) in ${groups.size} files`)
      for (const count of scale) write(join(out, `scale/scale${count}.ts`), scaled(count))
      // The TypeScripts, installed apart as `smoke.ts` installs them.
      const tsDir = join(root, "node_modules/.cache/inference-typescripts")
      const missing = typescripts.filter((version) => !fs.existsSync(join(tsDir, `node_modules/typescript-${version}`)))
      if (missing.length > 0) {
        write(
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
      // One `tsc` for each file of cases, a few at a time: one program of all of them takes too much memory under 5.9.
      const files = [...groups.keys()].map((group) => `${group}.ts`)
      const report: Record<string, unknown> = {}
      for (const exact of exacts) {
        for (const unchecked of uncheckeds) {
          for (const version of typescripts) {
            const tsc = join(tsDir, `node_modules/typescript-${version}/bin/tsc`)
            const { version: exactVersion } = readJson(join(tsDir, `node_modules/typescript-${version}/package.json`))
            const started = performance.now()
            const options = { ...compilerOptions(exact, unchecked), noEmit: true }
            const diagnostics = (yield* Effect.forEach(
              files,
              (file) => check(tsc, `tsconfig.${file}.json`, options, file),
              { concurrency: 4 }
            )).flat()
            const seconds = ((performance.now() - started) / 1000).toFixed(1)
            const outside = diagnostics.filter((d) =>
              !spans.some((s) => d.file.endsWith(s.file) && d.line >= s.from && d.line <= s.to)
            )
            const wrong: Array<Readonly<{ id: string; why: string; errors: ReadonlyArray<string> }>> = []
            const notes: Array<Readonly<{ id: string; why: string; errors: ReadonlyArray<string> }>> = []
            for (const span of spans) {
              const errors = diagnostics
                .filter((d) => d.file.endsWith(span.file) && d.line >= span.from && d.line <= span.to)
                .map((d) => `${d.line - span.from - 1}: ${d.code} ${d.text}`)
              if (span.valid === "refused") {
                if (errors.length === 0) {
                  notes.push({ id: span.id, why: "refused, but compiles: no rule is broken", errors })
                }
              } else if (span.valid && errors.length > 0) wrong.push({ id: span.id, why: "valid, but fails", errors })
              else if (!span.valid && errors.length === 0) {
                wrong.push({ id: span.id, why: "broken, but compiles", errors })
              }
            }
            yield* Console.log(
              `typescript ${exactVersion}, exactOptionalPropertyTypes ${exact}, noUncheckedIndexedAccess ${unchecked}: ${seconds}s (4 at a time), ${wrong.length} leads, ${notes.length} notes, ${outside.length} errors outside the cases`
            )
            for (const d of outside.slice(0, 10)) {
              yield* Console.log(`  outside: ${d.file}(${d.line}): ${d.code} ${d.text}`)
            }
            for (const w of [...wrong, ...notes].slice(0, 10)) yield* Console.log(`  ${w.why}: ${w.id}`)
            // The scale, one file at a time: the time to check it, and the size of its declarations.
            const scaleReport: Array<
              Readonly<{ count: number; seconds: string; declarations: number; errors: number }>
            > = []
            for (const count of scale) {
              const declarations = join(out, `declarations/${version}-${exact}-${unchecked}`)
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
              const size = fs.existsSync(emitted) ? fs.readFileSync(emitted, "utf8").length : -1
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
        }
      }
      write(join(out, "report.json"), JSON.stringify(report, null, 2))
      yield* Console.log(`report: ${join(out, "report.json")}`)
      const leads = Object.values(report).reduce(
        (sum: number, run) => sum + (run as Readonly<{ wrong: ReadonlyArray<unknown> }>).wrong.length,
        0
      )
      if (leads > 0) return yield* new Failed({ message: `${leads} leads` })
    }
  )
)

main(command)
