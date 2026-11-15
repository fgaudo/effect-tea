// What a write into an input costs as `main` stores it, written over the value the input showed (`{ _tag: 'Written',
// was, value }`), for each kind of value: by the bare rule, through the composed program's `update` as the engine calls
// it, and, for some cases, through `run` with a renderer that sends the next write once a frame has seen the last one.
// `was` is the very value the state holds, as the snabbdom bridge sends it, or, in the cases marked "copy", an equal
// value that is another string or object, as a bridge that read it again from the element would send. Then what the
// bridge pays on each frame, `drawn` for one input and the snabbdom bridge's `settle` for many, and what a rejected
// write costs. The measures that chose this design are in `docs/registers.md` ("The cost of `was`"). Run with `bun
// bench/writes.ts [writes] [rounds] [sections]`, or `node bench/writes.ts …`, where `sections` is a list of `writes`,
// `drawn`, `settle` and `rejected` (all of them by default); not part of `bun run test`.
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Num from 'effect/Number'
import * as Opt from 'effect/Option'
import * as Optic from 'effect/Optic'
import * as Stream from 'effect/Stream'
import {
  composition,
  drawn,
  reject,
  type Program,
  run,
  type Shown,
  type Transition,
  typed,
  type Update,
  type Written,
} from '../src/index.ts'
import { written } from '../src/input.ts'

const writes = Number(process.argv[2] ?? 2000)
const rounds = Number(process.argv[3] ?? 11)
const sections = (process.argv[4] ?? 'writes,drawn,settle,rejected').split(',')
const rows = 1000

// A string equal to `text` that is not the same string: built anew, character by character, and flat, as an element
// gives it. One made by concatenation is a rope in V8, which a comparison flattens first.
const copyOf = (text: string) => Array.from(text).join('')

const short = Arr.makeBy(writes + 1, (i) => 'Ada Lovelace, 1815'.slice(0, i % 19))

const long = (() => {
  const base = Arr.makeBy(4096, (i) => 'lorem ipsum dolor sit amet '[i % 27]).join('')
  let text = base
  return [text, ...Arr.makeBy(writes, (i) => (text = copyOf(`${text}${'abcdefghij'[i % 10]}`)))]
})()

const levels = Arr.makeBy(writes + 1, (i) => i % 101)

// A multi-select: 200 ids, one toggled by each write. Made anew for each pass, as `Equal` keeps the hash of an object
// and what it found of a pair of them: the same objects again would be compared for free.
const selections = () => {
  let ids: ReadonlyArray<number> = Arr.makeBy(200, (i) => i * 2)
  return [
    ids,
    ...Arr.makeBy(writes, (i) => {
      const id = (i * 7) % 400
      ids = ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]
      return ids
    }),
  ]
}

type Contact = Readonly<{ name: string; email: string; age: number; tags: ReadonlyArray<string> }>

// A form record whose name is typed: the rest is shared with the record before.
const contacts = () => {
  let contact: Contact = { name: '', email: 'ada@example.com', age: 36, tags: ['math', 'engines', 'poetry'] }
  return [contact, ...Arr.makeBy(writes, (i) => (contact = { ...contact, name: short[i + 1] ?? '' }))]
}

const copyContact = (contact: Contact): Contact => ({ ...contact, tags: [...contact.tags] })

type Case = Readonly<{
  name: string
  values: () => ReadonlyArray<unknown>
  copy?: (value: never) => unknown
  inRow?: boolean
  throughRun?: boolean
}>

const cases: ReadonlyArray<Case> = [
  { name: 'short text (≤ 18 chars)', values: () => short },
  { name: 'long text (4–6 KB, at the end)', values: () => long, throughRun: true },
  { name: 'long text, `was` a copy', values: () => long, copy: copyOf },
  { name: 'slider level (number)', values: () => levels },
  { name: `short text in row 500 of ${rows}`, values: () => short, inRow: true, throughRun: true },
  { name: 'array of 200 ids', values: selections },
  { name: 'array of 200 ids, `was` a copy', values: selections, copy: (ids: ReadonlyArray<number>) => [...ids] },
  { name: 'record of 4 fields', values: contacts },
  { name: 'record of 4 fields, `was` a copy', values: contacts, copy: copyContact },
]

type State = Readonly<{ v: unknown }>

const inputOf = composition<{ state: State }>()

const inputProgram = (start: unknown) =>
  inputOf.compose({
    init: () => ({ state: { v: start } }),
    inputs: { V: inputOf.input(Optic.id<State>().key('v')) },
    makeModel: (state) => state.v,
  })

type Rows = Readonly<{ rows: ReadonlyArray<Readonly<{ id: number; row: State }>> }>

const rowsOf = composition<{ state: Rows }>()

const rowAt = (state: Rows, id: number): Opt.Option<State> =>
  Opt.map(Arr.findFirst(state.rows, (entry) => entry.id === id), (entry) => entry.row)

// The child, among `rows`, by id: found and replaced by a walk of the array, as the list of `subscriptions.ts`.
const inputRows = (child: ReturnType<typeof inputProgram>) =>
  rowsOf.compose({
    init: () => ({ state: { rows: Arr.makeBy(rows, (id) => ({ id, row: child.init.state })) } }),
    children: {
      Row: rowsOf.each(child, {
        get: (state, id: number) => rowAt(state, id),
        set: (state, id, row) => ({ rows: Arr.map(state.rows, (entry) => entry.id === id ? { id, row } : entry) }),
        subscribed: (state) => Arr.map(state.rows, ({ id, row }) => [id, row] as const),
      }),
    },
    makeModel: (state) => state.rows.length,
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

const subjectOf = ({ values, copy, inRow }: Case): Subject => {
  const start = values()[0]
  const child = inputProgram(start)
  const at = (message: unknown) => inRow === true ? { _tag: 'Row', id: rows / 2, message } : message
  return {
    bare: { start, rule },
    program: (inRow === true ? inputRows(child) : child) as unknown as Program_,
    messages: () => {
      const all = [start, ...values().slice(1)]
      const was = (i: number) => copy === undefined ? all[i] : copy(all[i] as never)
      const bare = all.slice(1).map((value, i): Written<unknown> => ({ _tag: 'Written', was: was(i), value }))
      return { bare, composed: bare.map((message) => at({ _tag: 'V', message })) }
    },
  }
}

// Every write applies: a rejected one would measure a rule that was not run to its end.
const applyAll = (update: Update<unknown, unknown>, start: unknown, messages: ReadonlyArray<unknown>) => {
  let state = start
  for (const message of messages) {
    const step: Transition<unknown> = update(message)(state)
    if (step === reject) throw new Error('a write was rejected')
    state = step.state
  }
  return state
}

// Nanoseconds per call of one round: as many passes, each over `count` calls made anew beforehand, as last 20 ms at
// least, or `most` of them, where what they are made of would not fit in memory.
const sampler = <T>(make: () => T, pass: (made: T) => unknown, count: number, most = Number.POSITIVE_INFINITY) => {
  let passes = 1
  const time = () => {
    const all = Arr.makeBy(passes, make)
    const start = performance.now()
    for (const made of all) pass(made)
    return performance.now() - start
  }
  while (time() < 20 && passes < most) passes *= 2
  return () => (time() * 1e6) / (passes * count)
}

// The rounds of what is measured together alternate, after one of each is thrown away: the first measured would
// otherwise pay for the warming of what they all run.
const alternated = async (samplers: ReadonlyArray<() => number | Promise<number>>) => {
  for (const sample of samplers) await sample()
  const all = samplers.map((): Array<number> => [])
  for (let round = 0; round < rounds; round++) {
    for (const [i, sample] of samplers.entries()) all[i]?.push(await sample())
  }
  return all
}

// One write at a time: the renderer sends the next one when a frame has seen the one before.
const throughRun = (subject: Subject) =>
  Effect.runPromise(Effect.gen(function*() {
    const messages = subject.messages().composed
    let start = 0
    let end = 0
    yield* run(subject.program, (frames) =>
      frames.pipe(
        Stream.takeUntil((frame) => frame.seen >= messages.length),
        Stream.runForEach((frame) =>
          Effect.suspend(() => {
            void frame.model
            if (frame.seen === 0) start = performance.now()
            if (frame.seen < messages.length) return Effect.asVoid(frame.dispatch(messages[frame.seen]))
            end = performance.now()
            return Effect.void
          })
        ),
      ))
    return ((end - start) * 1e6) / messages.length
  }))

const summary = (samples: ReadonlyArray<number>) => {
  const sorted = Arr.sort(samples, Num.Order)
  const at = (q: number) => sorted[Math.round(q * (sorted.length - 1))] ?? Number.NaN
  const format = (ns: number) => ns >= 10_000 ? `${(ns / 1000).toFixed(1)} µs` : `${ns.toFixed(0)} ns`
  return `${format(at(0.5))} (${format(at(0))}–${format(at(1))})`
}

const runtime = typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`
console.log(`${runtime}, ${writes} calls per pass, ${rounds} rounds: median (min–max) per call`)

if (sections.includes('writes')) {
  console.log('\n| case | bare rule | compose `update` | `run`, a frame per write |')
  console.log('| --- | --- | --- | --- |')
  for (const each of cases) {
    const subject = subjectOf(each)
    const update = subject.program.update as unknown as Update<unknown, unknown>
    const [bare, composed] = await alternated([
      sampler(subject.messages, (all) => applyAll(subject.bare.rule, subject.bare.start, all.bare), writes),
      sampler(subject.messages, (all) => applyAll(update, subject.program.init.state, all.composed), writes),
    ])
    const [whole] = each.throughRun === true ? await alternated([() => throughRun(subject)]) : []
    const through = whole === undefined ? '–' : summary(whole)
    console.log(`| ${each.name} | ${summary(bare ?? [])} | ${summary(composed ?? [])} | ${through} |`)
  }
}

// The values `drawn` meets, made anew on each call, an equal value that is not the same, and at most how many passes
// a round makes of them: on V8, 20 ms of `drawn` over copies of a long text would hold gigabytes of them.
type Kind = Readonly<{
  name: string
  values: () => ReadonlyArray<unknown>
  copy: (value: never) => unknown
  most?: number
}>

const kinds: ReadonlyArray<Kind> = [
  { name: 'short text (≤ 18 chars)', values: () => short, copy: copyOf },
  { name: 'long text (4–6 KB)', values: () => long, copy: copyOf, most: 64 },
  { name: 'number', values: () => levels, copy: (level: number) => level },
  { name: 'array of 200 ids', values: selections, copy: (ids: ReadonlyArray<number>) => [...ids] },
  { name: 'record of 4 fields', values: contacts, copy: copyContact },
]

type Drawing = Readonly<{ held: Shown<unknown>; value: unknown; seen: number }>

type Situation = Readonly<{
  name: string
  at: (values: ReadonlyArray<unknown>, i: number, copy: Kind['copy']) => Drawing
}>

const shownOf = <A>(value: A) => drawn(undefined, value, 0)

const sentOf = (was: unknown, value: unknown) => typed(shownOf(was), value).sent(1)

// What a frame meets of an element that shows `values[i]`, and may have sent `values[i + 1]`, numbered 1.
const situations: ReadonlyArray<Situation> = [
  {
    name: 'no unseen write, the very value',
    at: (values, i) => ({ held: shownOf(values[i]), value: values[i], seen: 0 }),
  },
  {
    name: 'no unseen write, an equal copy',
    at: (values, i, copy) => ({ held: shownOf(values[i]), value: copy(values[i] as never), seen: 0 }),
  },
  {
    name: 'an unseen write, the frame its past',
    at: (values, i) => ({ held: sentOf(values[i], values[i + 1]), value: values[i], seen: 0 }),
  },
  {
    name: 'its write seen, the frame its present',
    at: (values, i) => ({ held: sentOf(values[i], values[i + 1]), value: values[i + 1], seen: 1 }),
  },
  {
    name: 'the state moved on, the frame wins',
    at: (values, i) => ({ held: sentOf(values[i], values[i + 1]), value: values[i + 2], seen: 0 }),
  },
]

if (sections.includes('drawn')) {
  console.log('\n`drawn`, for one input in one frame\n')
  console.log(`| case | ${situations.map(({ name }) => name).join(' | ')} |`)
  console.log(`| --- |${situations.map(() => ' --- |').join('')}`)
  for (const kind of kinds) {
    const timings = await alternated(situations.map((situation) =>
      sampler(
        () => {
          const values = kind.values()
          return Arr.makeBy(writes - 2, (i) => situation.at(values, i, kind.copy))
        },
        (all) => {
          for (const { held, value, seen } of all) drawn(held, value, seen)
        },
        writes - 2,
        kind.most,
      )
    ))
    console.log(`| ${kind.name} | ${timings.map(summary).join(' | ')} |`)
  }
}

// As the snabbdom bridge has them, without a DOM: an element is what holds `value`.
type Element = { value: string }

type Live = { held: Shown<string> | undefined; value: string }

const settle = (live: Set<Element>, lives: WeakMap<Element, Live>, seen: number): void => {
  for (const element of live) {
    const known = lives.get(element)
    if (known === undefined) continue
    const next = drawn(known.held, known.value, seen)
    if (known.held === undefined || next.value !== known.held.value) element.value = next.value
    known.held = next
  }
}

// `inputs` elements, each given `frame(text)` by the frame, but the first, which sent a write the frame has seen:
// `reset` gives it back that write before each frame, the others settle as they were.
const screenOf = (inputs: number, text: string, frame: (text: string) => string) => {
  const live = new Set<Element>()
  const lives = new WeakMap<Element, Live>()
  const typedOne = `${text}!`
  const unseen = typed(shownOf(text), typedOne).sent(1)
  const first: Live = { held: unseen, value: typedOne }
  for (let i = 0; i < inputs; i++) {
    const element = { value: text }
    live.add(element)
    lives.set(element, i === 0 ? first : { held: shownOf(text), value: frame(text) })
  }
  return { live, lives, reset: () => (first.held = unseen) }
}

if (sections.includes('settle')) {
  const counts = [1, 10, 100, 1000]
  const longText = long[0] as string
  const screens = [
    { name: 'short text, the very value', text: 'Ada Lovelace, 1815', frame: (text: string) => text },
    { name: 'long text (4 KB), the very value', text: longText, frame: (text: string) => text },
    { name: 'long text (4 KB), an equal copy', text: longText, frame: copyOf },
  ]
  console.log("\nThe bridge's `settle`, for a whole frame\n")
  console.log(`| inputs | ${counts.join(' | ')} |`)
  console.log(`| --- |${counts.map(() => ' --- |').join('')}`)
  for (const screen of screens) {
    const timings = await alternated(counts.map((inputs) => {
      const made = screenOf(inputs, screen.text, screen.frame)
      return sampler(() => made, ({ live, lives, reset }) => {
        reset()
        settle(live, lives, 1)
      }, 1)
    }))
    console.log(`| ${screen.name} | ${timings.map(summary).join(' | ')} |`)
  }
}

// A rejected write: the value held, and what was written over another, made anew on each call.
type Refusal = Readonly<{ name: string; held: unknown; was: () => unknown }>

const shortHeld = 'Ada Lovelace, 1815'

const longHeld = long[0] as string

const ids = Arr.makeBy(200, (i) => i * 2)

const contact: Contact = { name: 'Ada', email: 'ada@example.com', age: 36, tags: ['math', 'engines', 'poetry'] }

const refusals: ReadonlyArray<Refusal> = [
  { name: 'short text, first char differs', held: shortHeld, was: () => copyOf(`X${shortHeld.slice(1)}`) },
  { name: 'short text, last char differs', held: shortHeld, was: () => copyOf(`${shortHeld.slice(0, -1)}X`) },
  { name: 'long text, first char differs', held: longHeld, was: () => copyOf(`X${longHeld.slice(1)}`) },
  { name: 'long text, last char differs', held: longHeld, was: () => copyOf(`${longHeld.slice(0, -1)}X`) },
  { name: 'long text, one char shorter', held: longHeld, was: () => copyOf(longHeld.slice(0, -1)) },
  { name: 'number', held: 50, was: () => 51 },
  { name: 'array of 200 ids, first differs', held: ids, was: () => [1, ...ids.slice(1)] },
  { name: 'array of 200 ids, last differs', held: ids, was: () => [...ids.slice(0, -1), 1] },
  { name: 'record, a field differs', held: contact, was: () => ({ ...contact, tags: [...contact.tags], name: 'Eve' }) },
  {
    name: 'record, its last tag differs',
    held: contact,
    was: () => ({ ...contact, tags: [...contact.tags.slice(0, -1), 'prose'] }),
  },
]

// Some rejections take a few nanoseconds: 20 ms of them would be millions of messages, each with a text of 4 KB
// where `was` is one.
const rejectedPasses = 16

// Every write is rejected: one stored would measure another path.
const rejectAll = (update: Update<unknown, unknown>, state: unknown, messages: ReadonlyArray<unknown>) => {
  for (const message of messages) {
    if (update(message)(state) !== reject) throw new Error('a write was stored')
  }
}

if (sections.includes('rejected')) {
  console.log('\nRejected writes, over another value than the one held\n')
  console.log('| case | bare rule | compose `update` |')
  console.log('| --- | --- | --- |')
  for (const refusal of refusals) {
    // The value held was hashed when it was stored, by the `Equal` of the write that stored it.
    Equal.equals(refusal.held, refusal.was())
    const program = inputProgram(refusal.held) as unknown as Program_
    const update = program.update as unknown as Update<unknown, unknown>
    const message = (): Written<unknown> => ({ _tag: 'Written', was: refusal.was(), value: refusal.held })
    const [bare, composed] = await alternated([
      sampler(() => Arr.makeBy(writes, message), (all) => rejectAll(rule, refusal.held, all), writes, rejectedPasses),
      sampler(
        () => Arr.makeBy(writes, () => ({ _tag: 'V', message: message() })),
        (all) => rejectAll(update, program.init.state, all),
        writes,
        rejectedPasses,
      ),
    ])
    console.log(`| ${refusal.name} | ${summary(bare ?? [])} | ${summary(composed ?? [])} |`)
  }
}
