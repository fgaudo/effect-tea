// What a write into an input costs as `main` stores it, written over the value the input showed (`{ _tag: 'Written',
// was, value }`), for each kind of value: by the bare rule, through the composed program's `update` as the engine calls
// it, and, for some cases, through the dispatch `run` gives its renderer, which applies the write before it returns,
// with the model of the new state read after it, as a renderer's listener reads it: what a handler pays for a key, but
// the draw. `was` is the very value the state holds, or, in the cases marked "copy", an equal value that is another
// string or object. Then what a rejected write costs. A draw is not measured: it needs a DOM and a renderer, which no
// file of `tools/` imports (`AGENTS.md`). The measures that chose this design are in `docs/records/registers.md` ("The
// cost of `was`"). Run by hand, on Bun or on Node; not part of `bun run test`.
//
//   bun tools/bench/writes.ts [--writes 2000] [--rounds 11] [--sections writes,rejected]
//   node tools/bench/writes.ts …     the same, on V8
//   bun tools/bench/writes.ts --help     the same, as the command describes itself
import * as Arr from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Num from "effect/Number"
import * as Optic from "effect/Optic"
import * as Opt from "effect/Option"
import { type Program, program, reject, run, type Transition, type Update, type Written } from "../../src/index.ts"
import { written } from "../../src/input.ts"
import { main } from "../cli.ts"

const rows = 1000

// A string equal to `text` that is not the same string: built anew, character by character, and flat, as an element
// gives it. One made by concatenation is a rope in V8, which a comparison flattens first.
const copyOf = (text: string) => Array.from(text).join("")

const base = Arr.makeBy(4096, (i) => "lorem ipsum dolor sit amet "[i % 27]).join("")

type Contact = Readonly<{ name: string; email: string; age: number; tags: ReadonlyArray<string> }>

// The values of a pass, `writes` and the one before them, each a change of the one before. The arrays and the records
// are made anew for each pass, as `Equal` keeps the hash of an object and what it found of a pair of them: the same
// objects again would be compared for free.
type Values = Readonly<{
  short: ReadonlyArray<string>
  long: ReadonlyArray<string>
  levels: ReadonlyArray<number>
  // A multi-select: 200 ids, one toggled by each write.
  selections: () => ReadonlyArray<ReadonlyArray<number>>
  // A form record whose name is typed: the rest is shared with the record before.
  contacts: () => ReadonlyArray<Contact>
}>

const valuesOf = (writes: number): Values => {
  const short = Arr.makeBy(writes + 1, (i) => "Ada Lovelace, 1815".slice(0, i % 19))
  let text = base
  const long = [text, ...Arr.makeBy(writes, (i) => (text = copyOf(`${text}${"abcdefghij"[i % 10]}`)))]
  return {
    short,
    long,
    levels: Arr.makeBy(writes + 1, (i) => i % 101),
    selections: () => {
      let ids: ReadonlyArray<number> = Arr.makeBy(200, (i) => i * 2)
      return [
        ids,
        ...Arr.makeBy(writes, (i) => {
          const id = (i * 7) % 400
          ids = ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]
          return ids
        })
      ]
    },
    contacts: () => {
      let contact: Contact = { name: "", email: "ada@example.com", age: 36, tags: ["math", "engines", "poetry"] }
      return [contact, ...Arr.makeBy(writes, (i) => (contact = { ...contact, name: short[i + 1] ?? "" }))]
    }
  }
}

const copyContact = (contact: Contact): Contact => ({ ...contact, tags: [...contact.tags] })

type Case = Readonly<{
  name: string
  values: (values: Values) => ReadonlyArray<unknown>
  copy?: (value: never) => unknown
  inRow?: boolean
  throughRun?: boolean
}>

const cases: ReadonlyArray<Case> = [
  { name: "short text (≤ 18 chars)", values: ({ short }) => short },
  { name: "long text (4–6 KB, at the end)", values: ({ long }) => long, throughRun: true },
  { name: "long text, `was` a copy", values: ({ long }) => long, copy: copyOf },
  { name: "slider level (number)", values: ({ levels }) => levels },
  { name: `short text in row 500 of ${rows}`, values: ({ short }) => short, inRow: true, throughRun: true },
  { name: "array of 200 ids", values: ({ selections }) => selections() },
  {
    name: "array of 200 ids, `was` a copy",
    values: ({ selections }) => selections(),
    copy: (ids: ReadonlyArray<number>) => [...ids]
  },
  { name: "record of 4 fields", values: ({ contacts }) => contacts() },
  { name: "record of 4 fields, `was` a copy", values: ({ contacts }) => contacts(), copy: copyContact }
]

type State = Readonly<{ v: unknown }>

const inputOf = program<{ state: State }>()

const inputProgram = (start: unknown) =>
  inputOf.make({
    init: { state: { v: start } },
    inputs: { V: inputOf.input({ at: Optic.id<State>().key("v") }) },
    makeModel: (state) => state.v
  })

type Rows = Readonly<{ rows: ReadonlyArray<Readonly<{ id: number; row: State }>> }>

const rowsOf = program<{ state: Rows }>()

const rowAt = (state: Rows, id: number): Opt.Option<State> =>
  Opt.map(Arr.findFirst(state.rows, (entry) => entry.id === id), (entry) => entry.row)

// The child, among `rows`, by id: found and replaced by a walk of the array, as the list of `subscriptions.ts`.
const inputRows = (child: ReturnType<typeof inputProgram>) =>
  rowsOf.make({
    init: () => ({ state: { rows: Arr.makeBy(rows, (id) => ({ id, row: child.init.state })) } }),
    children: {
      Row: rowsOf.childById(child, {
        get: (state, id: number) => rowAt(state, id),
        set: (state, id, row) => ({ rows: Arr.map(state.rows, (entry) => entry.id === id ? { id, row } : entry) }),
        subscribed: (state) => Arr.map(state.rows, ({ id, row }) => [id, row] as const)
      })
    },
    makeModel: (state) => state.rows.length
  })

type Program_ = Program<{ state: object; model: unknown; message: unknown }>

type Messages = Readonly<{ bare: ReadonlyArray<unknown>; composed: ReadonlyArray<unknown> }>

type Subject = Readonly<{
  bare: Readonly<{ start: unknown; rule: Update<unknown, unknown> }>
  program: Program_
  // Made anew on each call, from the value the program starts with.
  messages: () => Messages
}>

const rule = written as unknown as Update<unknown, unknown>

const subjectOf = ({ copy, inRow, values: of }: Case, made: Values): Subject => {
  const values = () => of(made)
  const start = values()[0]
  const child = inputProgram(start)
  const at = (message: unknown) => inRow === true ? { _tag: "Row", id: rows / 2, message } : message
  return {
    bare: { start, rule },
    program: (inRow === true ? inputRows(child) : child) as unknown as Program_,
    messages: () => {
      const all = [start, ...values().slice(1)]
      const was = (i: number) => copy === undefined ? all[i] : copy(all[i] as never)
      const bare = all.slice(1).map((value, i): Written<unknown> => ({ _tag: "Written", was: was(i), value }))
      return { bare, composed: bare.map((message) => at({ _tag: "V", message })) }
    }
  }
}

// Every write applies: a rejected one would measure a rule that was not run to its end.
const applyAll = (update: Update<unknown, unknown>, start: unknown, messages: ReadonlyArray<unknown>) => {
  let state = start
  for (const message of messages) {
    const step: Transition<unknown> = update(message)(state)
    if (step === reject) throw new Error("a write was rejected")
    state = step.state
  }
  return state
}

// Nanoseconds per call of one round: as many passes, each over `count` calls made anew beforehand, as last 20 ms at
// least, or `most` of them, where what they are made of would not fit in memory.
const sampler = <T>(
  make: () => T,
  pass: (made: T) => unknown,
  count: number,
  most = Number.POSITIVE_INFINITY
): Effect.Effect<number> => {
  let passes = 1
  const time = () => {
    const all = Arr.makeBy(passes, make)
    const start = performance.now()
    for (const made of all) pass(made)
    return performance.now() - start
  }
  while (time() < 20 && passes < most) passes *= 2
  return Effect.sync(() => (time() * 1e6) / (passes * count))
}

// The rounds of what is measured together alternate, after one of each is thrown away: the first measured would
// otherwise pay for the warming of what they all run.
const alternated = Effect.fnUntraced(function*(rounds: number, samplers: ReadonlyArray<Effect.Effect<number>>) {
  for (const sample of samplers) yield* sample
  const all = samplers.map((): Array<number> => [])
  for (let round = 0; round < rounds; round++) {
    for (const [i, sample] of samplers.entries()) all[i]?.push(yield* sample)
  }
  return all
})

// One write at a time, through the run's dispatch, which applies it before it returns, then the model of the state it
// made: the effects of each step are left to the run's fiber of effects.
const throughRun = (subject: Subject) =>
  Effect.gen(function*() {
    const messages = subject.messages().composed
    let elapsed = 0
    yield* run(subject.program, (app) =>
      Effect.sync(() => {
        const start = performance.now()
        for (const message of messages) {
          app.dispatch(message)
          void app.model()
        }
        elapsed = performance.now() - start
      }))
    return (elapsed * 1e6) / messages.length
  })

const summary = (samples: ReadonlyArray<number>) => {
  const sorted = Arr.sort(samples, Num.Order)
  const at = (q: number) => sorted[Math.round(q * (sorted.length - 1))] ?? Number.NaN
  const format = (ns: number) => ns >= 10_000 ? `${(ns / 1000).toFixed(1)} µs` : `${ns.toFixed(0)} ns`
  return `${format(at(0.5))} (${format(at(0))}–${format(at(1))})`
}

// What each section is given: how many writes a pass makes, how many rounds it measures, and the values it writes.
type Sizes = Readonly<{ writes: number; rounds: number; values: Values }>

const writesSection = Effect.fnUntraced(function*({ rounds, values, writes }: Sizes) {
  yield* Console.log("\n| case | bare rule | compose `update` | `run`'s dispatch, and the model |")
  yield* Console.log("| --- | --- | --- | --- |")
  for (const each of cases) {
    const subject = subjectOf(each, values)
    const update = subject.program.update as unknown as Update<unknown, unknown>
    const [bare, composed] = yield* alternated(rounds, [
      sampler(subject.messages, (all) => applyAll(subject.bare.rule, subject.bare.start, all.bare), writes),
      sampler(subject.messages, (all) => applyAll(update, subject.program.init.state, all.composed), writes)
    ])
    const [whole] = each.throughRun === true ? yield* alternated(rounds, [throughRun(subject)]) : []
    const through = whole === undefined ? "–" : summary(whole)
    yield* Console.log(`| ${each.name} | ${summary(bare ?? [])} | ${summary(composed ?? [])} | ${through} |`)
  }
})

// A rejected write: the value held, and what was written over another, made anew on each call.
type Refusal = Readonly<{ name: string; held: unknown; was: () => unknown }>

const shortHeld = "Ada Lovelace, 1815"

const longHeld = base

const ids = Arr.makeBy(200, (i) => i * 2)

const contact: Contact = { name: "Ada", email: "ada@example.com", age: 36, tags: ["math", "engines", "poetry"] }

const refusals: ReadonlyArray<Refusal> = [
  { name: "short text, first char differs", held: shortHeld, was: () => copyOf(`X${shortHeld.slice(1)}`) },
  { name: "short text, last char differs", held: shortHeld, was: () => copyOf(`${shortHeld.slice(0, -1)}X`) },
  { name: "long text, first char differs", held: longHeld, was: () => copyOf(`X${longHeld.slice(1)}`) },
  { name: "long text, last char differs", held: longHeld, was: () => copyOf(`${longHeld.slice(0, -1)}X`) },
  { name: "long text, one char shorter", held: longHeld, was: () => copyOf(longHeld.slice(0, -1)) },
  { name: "number", held: 50, was: () => 51 },
  { name: "array of 200 ids, first differs", held: ids, was: () => [1, ...ids.slice(1)] },
  { name: "array of 200 ids, last differs", held: ids, was: () => [...ids.slice(0, -1), 1] },
  { name: "record, a field differs", held: contact, was: () => ({ ...contact, tags: [...contact.tags], name: "Eve" }) },
  {
    name: "record, its last tag differs",
    held: contact,
    was: () => ({ ...contact, tags: [...contact.tags.slice(0, -1), "prose"] })
  }
]

// Some rejections take a few nanoseconds: 20 ms of them would be millions of messages, each with a text of 4 KB
// where `was` is one.
const rejectedPasses = 16

// Every write is rejected: one stored would measure another path.
const rejectAll = (update: Update<unknown, unknown>, state: unknown, messages: ReadonlyArray<unknown>) => {
  for (const message of messages) {
    if (update(message)(state) !== reject) throw new Error("a write was stored")
  }
}

const rejectedSection = Effect.fnUntraced(function*({ rounds, writes }: Sizes) {
  yield* Console.log("\nRejected writes, over another value than the one held\n")
  yield* Console.log("| case | bare rule | compose `update` |")
  yield* Console.log("| --- | --- | --- |")
  for (const refusal of refusals) {
    // The value held was hashed when it was stored, by the `Equal` of the write that stored it.
    Equal.equals(refusal.held, refusal.was())
    const program = inputProgram(refusal.held) as unknown as Program_
    const update = program.update as unknown as Update<unknown, unknown>
    const message = (): Written<unknown> => ({ _tag: "Written", was: refusal.was(), value: refusal.held })
    const [bare, composed] = yield* alternated(rounds, [
      sampler(() => Arr.makeBy(writes, message), (all) => rejectAll(rule, refusal.held, all), writes, rejectedPasses),
      sampler(
        () => Arr.makeBy(writes, () => ({ _tag: "V", message: message() })),
        (all) => rejectAll(update, program.init.state, all),
        writes,
        rejectedPasses
      )
    ])
    yield* Console.log(`| ${refusal.name} | ${summary(bare ?? [])} | ${summary(composed ?? [])} |`)
  }
})

// In the order they run, whatever the order they are named in.
const sections = { writes: writesSection, rejected: rejectedSection }

const names = Object.keys(sections)

const command = Command.make(
  "writes",
  {
    writes: Flag.Int("writes").pipe(
      Flag.withDescription("How many calls a pass makes"),
      Flag.withDefault(2000),
      Flag.filter((writes) => writes >= 1, () => "a whole number of at least 1")
    ),
    rounds: Flag.Int("rounds").pipe(
      Flag.withDescription("How many rounds each measure takes"),
      Flag.withDefault(11),
      Flag.filter((rounds) => rounds >= 1, () => "a whole number of at least 1")
    ),
    sections: Flag.String("sections").pipe(
      Flag.withDescription(`The sections measured, separated by commas: ${names.join(", ")}`),
      Flag.withDefault(names.join(",")),
      Flag.map((chosen) => chosen.split(",")),
      Flag.filter((chosen) => chosen.every((name) => names.includes(name)), () => names.join(", "))
    )
  },
  Effect.fnUntraced(function*({ rounds, sections: chosen, writes }) {
    const runtime = typeof Bun === "undefined" ? `Node ${process.version}` : `Bun ${Bun.version}`
    yield* Console.log(`${runtime}, ${writes} calls per pass, ${rounds} rounds: median (min–max) per call`)
    const sizes: Sizes = { writes, rounds, values: valuesOf(writes) }
    for (const [name, section] of Object.entries(sections)) {
      if (chosen.includes(name)) yield* section(sizes)
    }
  })
)

main(command)
