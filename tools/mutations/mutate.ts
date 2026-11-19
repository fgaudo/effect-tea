// Applies each mutation of `mutations.ts` to a copy of the repository, one at a time in each copy, runs each test it
// names alone, in a process of its own, and fails when one of them passes, or fails alone without it: a check whose
// removal no test notices is held by none, and a test that fails only beside others of its file holds nothing.
//
//   bun run mutations                  every mutation
//   bun run mutations <name>…          those whose name contains one of the arguments
//   bun run mutations --discover <name>…
//                                      the whole suite under each, listing every test that fails: for a new mutation
//   --jobs=<n>                         how many copies run at once: half the processors by default
//   bun run mutations --against=<rev> [<name>…]
//                                      no test: whether each mutation makes the code that runs that it made at
//                                      <rev>, after a change that rewrites the code and not what it does
//   bun run mutations --help           the same, as the command describes itself
//
// The copies are under `.mutants/` (ignored by git, and by `bun test`, which skips directories that start with a dot),
// where `effect` resolves through the repository's `node_modules`. The working tree is never written. A copy holds one
// mutation at a time, so the mutations run apart, and what each did is printed in the order of the list, once a killer
// that passed under its mutation has run again with no other copy running. A run stopped by SIGINT or SIGTERM is
// interrupted: the scope of each test under way ends its process, and the copies are removed once they have ended.
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Runtime from "effect/Runtime"
import * as Stream from "effect/Stream"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { type Mutation, mutations } from "./mutations.ts"

const root = path.resolve(import.meta.dir, "../..")
// One for each process, so that several can run at once.
const base = path.join(root, ".mutants", String(process.pid))
const copied = ["src", "test", "examples", "bridges", "bunfig.toml", "package.json", "tsconfig.json"]

// What the list or a run is refused for, or what the mutations found: printed as it is, with no stack, which would
// point into this script and not at the list.
class Failed extends Data.TaggedError("Failed")<{ readonly message: string }> {
  readonly [Runtime.errorReported] = false
}

// `title` is what `bun test -t` matches: the names of the enclosing `describe`s, outermost first, and the test's,
// joined by spaces.
type Outcome = Readonly<{ file: string; name: string; title: string; failed: boolean }>

type Killer = Mutation["killedBy"][number]

type Verdict = "passed" | "failed" | "hung"

// Bun writes a control character, as a tab, by its number.
const decode = (text: string) =>
  text.replace(
    /&(?:(quot|apos|lt|gt|amp)|#(\d+)|#x([0-9a-fA-F]+));/g,
    (_, entity: string | undefined, decimal: string | undefined, hexadecimal: string | undefined) =>
      entity !== undefined
        ? ({ quot: "\"", apos: "'", lt: "<", gt: ">", amp: "&" })[entity] as string
        : String.fromCodePoint(decimal !== undefined ? Number(decimal) : Number.parseInt(hexadecimal as string, 16))
  )

const attributes = (text: string) =>
  Object.fromEntries(Array.from(text.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, decode(value ?? "")]))

// What bun's JUnit report says of each test that ran: skipped and `todo` tests are left out. Each file is a
// `testsuite`, and each `describe` one nested in it: the names of the enclosing `describe`s are read from them, not
// from a test's `classname`, which joins them by ' > ' and so splits a name that holds one.
const outcomes = (report: string): ReadonlyArray<Outcome> => {
  const suites: Array<string> = []
  const ran: Array<Outcome> = []
  const tags = /<testsuite\s([^>]*?)(\/)?>|<\/testsuite>|<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
  for (const [tag, suite, empty, head, body] of report.matchAll(tags)) {
    if (tag.startsWith("</testsuite")) suites.pop()
    else if (suite !== undefined) {
      if (empty === undefined) suites.push(attributes(suite)["name"] ?? "")
    } else if (!(body?.includes("<skipped") ?? false)) {
      const { name = "", file = "" } = attributes(head ?? "")
      ran.push({
        file: file.replaceAll("\\", "/"),
        name,
        title: [...suites.slice(1), name].join(" "),
        failed: body?.includes("<failure") ?? false
      })
    }
  }
  return ran
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// No test takes more than a minute: a process that runs one and lasts longer hangs, which no report says of its test.
const patience = Duration.minutes(1)
// A run of whole files lasts as long as their tests: each is ended by bun's own timeout, so a mutation under which
// many wait for what never comes can make a run of the suite last minutes without hanging.
const suitePatience = Duration.minutes(15)

// What a run of `bun test` did: its tests, and whether it failed outside them, as on an error thrown between two
// tests, which fails the run and is the failure of no test in the report.
type Run = Readonly<{ ran: ReadonlyArray<Outcome>; failedOutside: boolean }>

let reports = 0

const removeCopies = () => {
  fs.rmSync(base, { recursive: true, force: true })
  // Left to another process still running, when it is not empty.
  try {
    fs.rmdirSync(path.dirname(base))
  } catch {}
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) => stream.pipe(Stream.decodeText(), Stream.mkString)

// What a process wrote, and how it exited. Interrupted, its scope ends the process.
const exec = Effect.fnUntraced(function*(command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(command)
  const [stdout, stderr, exitCode] = yield* Effect.all([text(handle.stdout), text(handle.stderr), handle.exitCode], {
    concurrency: "unbounded"
  })
  return { stdout, stderr, exitCode }
}, Effect.scoped)

// Runs `files` in `copy`, only the test whose title is `title` when given, and returns what it did, or that it hung.
const runTests = Effect.fnUntraced(function*(copy: string, files: ReadonlyArray<string>, title?: string) {
  // One for each run, so that two runs never read each other's.
  const report = path.join(copy, `report-${reports++}.xml`)
  // Anchored, since `-t` runs every test whose title the pattern finds anywhere in it.
  const filter = title === undefined ? [] : ["-t", `^${escape(title)}$`]
  const ended = yield* exec(
    ChildProcess.make("bun", ["test", ...files, ...filter, "--reporter=junit", `--reporter-outfile=${report}`], {
      cwd: copy,
      // A test that hangs may not heed the first signal either.
      forceKillAfter: Duration.seconds(5)
    })
  ).pipe(Effect.timeoutOption(title === undefined ? suitePatience : patience))
  if (Opt.isNone(ended)) return "hung" as const
  const { exitCode, stderr } = ended.value
  if (!fs.existsSync(report)) {
    return yield* new Failed({ message: `bun test wrote no report (exit ${exitCode}):\n${stderr}` })
  }
  const ran = outcomes(fs.readFileSync(report, "utf8"))
  fs.rmSync(report)
  const run: Run = { ran, failedOutside: exitCode !== 0 && !ran.some((outcome) => outcome.failed) }
  return run
})

// Applies `f` to each of `items`, one at a time in each of `copies`, and hands each result to `emit` in the order of
// `items`. A failure interrupts the runs under way in the other copies, and is raised once their scopes have ended
// their processes, so that none is left running in a copy about to be removed.
const pool = <A, B, E, R>(
  copies: ReadonlyArray<string>,
  items: ReadonlyArray<A>,
  f: (copy: string, item: A) => Effect.Effect<B, E, R>,
  emit: (result: B, index: number) => void = () => {}
) =>
  Effect.suspend(() => {
    const results: Array<B> = []
    const settled: Array<boolean> = []
    let taken = 0
    let emitted = 0
    const work = Effect.fnUntraced(function*(copy: string) {
      while (taken < items.length) {
        const index = taken++
        results[index] = yield* f(copy, items[index] as A)
        settled[index] = true
        // `emit` is not an effect: nothing yields between two results, so two copies never print out of order.
        while (settled[emitted] === true) {
          emit(results[emitted] as B, emitted)
          emitted++
        }
      }
    })
    return Effect.forEach(copies.slice(0, items.length), work, { concurrency: "unbounded", discard: true })
  })

const describe = ([file, name]: Killer) => `${file} › ${name}`

// The title of each killer of `chosen`, found by a run of their files whole: each must have run exactly once, so that
// a renamed or removed test is an error of the list, and be the only test of its file with its title, so that a run
// of it alone runs it only.
const titlesOf = Effect.fnUntraced(function*(copy: string, chosen: ReadonlyArray<Mutation>) {
  const killers = chosen.flatMap((mutation) => mutation.killedBy)
  const run = yield* runTests(copy, [...new Set(killers.map(([file]) => file))])
  if (run === "hung") return yield* new Failed({ message: "The files of the tests hang without any mutation" })
  const { ran } = run
  const titles = new Map<string, string>()
  for (const mutation of chosen) {
    for (const killer of mutation.killedBy) {
      const [file, name] = killer
      const found = ran.filter((outcome) => outcome.file === file && outcome.name === name)
      if (found.length !== 1) {
        return yield* new Failed({
          message: `"${mutation.name}" names ${describe(killer)}, which ran ${found.length} times`
        })
      }
      const { title } = found[0] as Outcome
      const alike = ran.filter((outcome) => outcome.file === file && outcome.title === title).length
      if (alike !== 1) return yield* new Failed({ message: `${file} holds ${alike} tests titled "${title}"` })
      titles.set(describe(killer), title)
    }
  }
  return titles as ReadonlyMap<string, string>
})

// Runs `killer` alone in `copy`, in a process of its own: a test that hangs does not pass, nor one whose run fails
// outside it, since it is the only test that ran.
const alone = Effect.fnUntraced(function*(copy: string, titles: ReadonlyMap<string, string>, killer: Killer) {
  const title = titles.get(describe(killer)) as string
  const run = yield* runTests(copy, [killer[0]], title)
  if (run === "hung") return "hung" as Verdict
  if (run.ran.length !== 1 || (run.ran[0] as Outcome).title !== title) {
    return yield* new Failed({ message: `A run of ${describe(killer)} alone ran ${run.ran.length} tests` })
  }
  return ((run.ran[0] as Outcome).failed || run.failedOutside ? "failed" : "passed") as Verdict
})

// The mutated text of `mutation`'s file: `from` must occur exactly once, so that a change of the code is noticed.
const mutated = (mutation: Mutation, original: string) => {
  const parts = original.split(mutation.from)
  return parts.length === 2
    ? Effect.succeed(parts.join(mutation.to))
    : Effect.fail(
      new Failed({
        message: `"${mutation.name}": ${mutation.file} holds what it replaces ${parts.length - 1} times, not once`
      })
    )
}

const under = <A, E, R>(copy: string, mutation: Mutation, effect: Effect.Effect<A, E, R>) => {
  const file = path.join(copy, mutation.file)
  return Effect.acquireUseRelease(
    Effect.gen(function*() {
      const original = fs.readFileSync(file, "utf8")
      fs.writeFileSync(file, yield* mutated(mutation, original))
      return original
    }),
    () => effect,
    (original) => Effect.sync(() => fs.writeFileSync(file, original))
  )
}

// Runs the killers of `mutation` alone in `copy`, one after another, under it.
const verdictsUnder = (
  copy: string,
  titles: ReadonlyMap<string, string>,
  mutation: Mutation,
  killers: ReadonlyArray<Killer>
) =>
  under(
    copy,
    mutation,
    Effect.forEach(
      killers,
      (killer) => Effect.map(alone(copy, titles, killer), (verdict) => [killer, verdict] as const)
    )
  )

// The JavaScript that Bun runs of `text`, by line: printed from the syntax tree, with no types, comments or layout, so
// that only a change of the code that runs tells two apart. dprint would not do: it keeps some of the line breaks it
// is given.
const emitted = (file: string, text: string) =>
  new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).transformSync(text).split("\n")

// What `mutation` changes in the code that runs of `file`, with the lines around it that tell where: the rest of the
// file is left out, so that a change elsewhere, as an order of the imports, does not tell two apart.
const changeOf = Effect.fnUntraced(function*(mutation: Mutation, file: string, original: string) {
  const context = 3
  const then = emitted(file, original)
  const now = emitted(file, yield* mutated(mutation, original))
  let start = 0
  while (start < then.length && start < now.length && then[start] === now[start]) start++
  let end = 0
  while (end < then.length - start && end < now.length - start && then.at(-1 - end) === now.at(-1 - end)) end++
  return [
    ...then.slice(Math.max(0, start - context), start).map((line) => `  ${line}`),
    ...then.slice(start, then.length - end).map((line) => `- ${line}`),
    ...now.slice(start, now.length - end).map((line) => `+ ${line}`),
    ...then.slice(then.length - end, then.length - end + context).map((line) => `  ${line}`)
  ]
})

const atRevision = Effect.fnUntraced(function*(revision: string, file: string) {
  const { exitCode, stdout, stderr } = yield* exec(
    ChildProcess.make("git", ["show", `${revision}:${file}`], { cwd: root })
  )
  if (exitCode !== 0) return yield* new Failed({ message: `git show ${revision}:${file}: ${stderr}` })
  return stdout
})

// Each of `chosen` against the mutation of the same name at `revision`: after a change that rewrites the code and not
// what it does, the two change the same code in the same place, or a mutation that still finds its text exactly once
// may take out another check than it did.
const compare = Effect.fnUntraced(function*(revision: string, chosen: ReadonlyArray<Mutation>) {
  // Imported from a file, since the list is a module; it imports nothing.
  const listed = path.join(base, "mutations.ts")
  const list = yield* atRevision(revision, "tools/mutations/mutations.ts")
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(listed, list)
  const before: ReadonlyArray<Mutation> = (yield* Effect.promise(() => import(listed))).mutations
  let different = 0
  for (const mutation of chosen) {
    const old = before.find((candidate) => candidate.name === mutation.name)
    if (old === undefined) {
      yield* Console.log(`new       ${mutation.name}`)
      continue
    }
    const then = yield* changeOf(old, old.file, yield* atRevision(revision, old.file))
    const now = yield* changeOf(mutation, mutation.file, fs.readFileSync(path.join(root, mutation.file), "utf8"))
    if (then.join("\n") === now.join("\n")) {
      yield* Console.log(`same      ${mutation.name}`)
      continue
    }
    different++
    yield* Console.log(`DIFFERENT ${mutation.name}\n  at ${revision}:\n${then.join("\n")}\n  now:\n${now.join("\n")}`)
  }
  const gone = before.filter((old) => !mutations.some((mutation) => mutation.name === old.name))
  for (const old of gone) yield* Console.log(`gone      ${old.name}`)
  return different
})

// The suite of `bun run test`: the search of the histories lasts longer than a test may, and names no killer.
const discoverIn = (copies: ReadonlyArray<string>, chosen: ReadonlyArray<Mutation>) =>
  pool(
    copies,
    chosen,
    (copy, mutation) => under(copy, mutation, runTests(copy, ["--path-ignore-patterns=src/interleaving.test.ts"])),
    (run, index) => {
      const { name } = chosen[index] as Mutation
      if (run === "hung") {
        console.log(`\n${name}: the suite hangs under it`)
        return
      }
      const failed = run.ran.filter((outcome) => outcome.failed)
      console.log(`\n${name}: ${failed.length} failing`)
      // An error thrown between two tests fails none of them in the report: only a run of each alone tells which one
      // leaves it.
      if (run.failedOutside) console.log("  and the suite fails outside its tests")
      for (const { file, name } of failed) console.log(`  ['${file}', ${JSON.stringify(name)}],`)
    }
  )

// How many of `chosen` survived a test that must kill them.
const killIn = Effect.fnUntraced(function*(copies: ReadonlyArray<string>, chosen: ReadonlyArray<Mutation>) {
  const titles = yield* titlesOf(copies[0] as string, chosen)
  // Each test must pass alone without its mutation, or its failure under it says nothing.
  const killers = new Map(chosen.flatMap((mutation) => mutation.killedBy.map((killer) => [describe(killer), killer])))
  yield* pool(
    copies,
    [...killers.values()],
    (copy, killer) =>
      Effect.flatMap(alone(copy, titles, killer), (outcome) =>
        outcome === "passed"
          ? Effect.void
          : Effect.fail(new Failed({ message: `${describe(killer)} ${outcome} alone without any mutation` })))
  )
  const killedIn = (copy: string, mutation: Mutation) =>
    Effect.map(
      Effect.timed(verdictsUnder(copy, titles, mutation, mutation.killedBy)),
      ([duration, ran]) => ({ ran, seconds: Duration.toSeconds(duration).toFixed(1) })
    )
  const results: Array<Effect.Success<ReturnType<typeof killedIn>>> = []
  yield* pool(copies, chosen, killedIn, (result, index) => {
    results[index] = result
  })
  // A killer that holds a window of absence (`docs/invariants.md`) may pass under its mutation on a machine the other
  // copies load. It is run again, alone and with no other copy running, before it is taken for a survivor: the
  // killers of a check no test notices pass again, so this keeps every survivor.
  const again = new Map<number, ReadonlyArray<Killer>>()
  for (const [index, { ran }] of results.entries()) {
    const passed = ran.filter(([, outcome]) => outcome === "passed").map(([killer]) => killer)
    if (passed.length === 0) continue
    const verdicts = yield* verdictsUnder(copies[0] as string, titles, chosen[index] as Mutation, passed)
    again.set(index, verdicts.filter(([, outcome]) => outcome !== "passed").map(([killer]) => killer))
  }
  let survived = 0
  for (const [index, { ran, seconds }] of results.entries()) {
    const failedAgain = again.get(index) ?? []
    const passed = ran.filter(([killer, outcome]) => outcome === "passed" && !failedAgain.includes(killer))
    const hung = ran.filter(([, outcome]) => outcome === "hung")
    const verdict = passed.length === 0 ? "killed" : "SURVIVED"
    yield* Console.log(`${verdict} [${index + 1}/${chosen.length}] ${(chosen[index] as Mutation).name} (${seconds}s)`)
    for (const [killer] of hung) yield* Console.log(`  hangs under it: ${describe(killer)}`)
    for (const killer of failedAgain) {
      yield* Console.log(`  passes under it beside the other copies, fails alone: ${describe(killer)}`)
    }
    for (const [killer] of passed) yield* Console.log(`  passes under it: ${describe(killer)}`)
    if (passed.length > 0) survived++
  }
  return survived
})

const command = Command.make(
  "mutations",
  {
    names: Argument.String("name").pipe(
      Argument.withDescription(
        "Runs only the mutations whose name contains one of these: every one when none is given"
      ),
      Argument.variadic()
    ),
    discover: Flag.Boolean("discover").pipe(
      Flag.withDescription("Runs the whole suite under each mutation, and lists every test that fails"),
      Flag.withDefault(false)
    ),
    jobs: Flag.Int("jobs").pipe(
      Flag.withDescription("How many copies of the repository run at once"),
      Flag.withDefault(Math.max(1, Math.floor(os.availableParallelism() / 2))),
      Flag.filter((jobs) => jobs >= 1, () => "a whole number of at least 1")
    ),
    against: Flag.String("against").pipe(
      Flag.withDescription(
        "Runs no test: checks that each mutation changes the code that runs as it did at this revision"
      ),
      Flag.optional
    )
  },
  Effect.fnUntraced(
    function*({ against, discover, jobs, names }) {
      const chosen = names.length === 0
        ? mutations
        : mutations.filter((mutation) => names.some((name) => mutation.name.includes(name)))
      if (chosen.length === 0) return yield* new Failed({ message: `No mutation is named like ${names.join(", ")}` })
      const listed = new Set(mutations.map((mutation) => mutation.name))
      if (listed.size !== mutations.length) return yield* new Failed({ message: "Two mutations have the same name" })
      const unheld = chosen.find((mutation) => mutation.killedBy.length === 0)
      if (!discover && unheld !== undefined) {
        return yield* new Failed({ message: `"${unheld.name}" names no test that must fail under it` })
      }
      if (Opt.isSome(against)) {
        const different = yield* compare(against.value, chosen)
        if (different > 0) {
          return yield* new Failed({
            message: `\n${different} of ${chosen.length} mutations make other code than at ${against.value}`
          })
        }
        return
      }
      const copies = Array.from({ length: Math.min(jobs, chosen.length) }, (_, index) => path.join(base, String(index)))
      for (const copy of copies) {
        for (const entry of copied) fs.cpSync(path.join(root, entry), path.join(copy, entry), { recursive: true })
      }
      if (discover) return yield* discoverIn(copies, chosen)
      const survived = yield* killIn(copies, chosen)
      if (survived > 0) {
        return yield* new Failed({
          message: `\n${survived} of ${chosen.length} mutations survived a test that must kill them`
        })
      }
    },
    Effect.ensuring(Effect.sync(removeCopies))
  )
)

command.pipe(
  Command.run({ version: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version }),
  Effect.tapErrorTag("Failed", (failed) => Console.error(failed.message)),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain
)
