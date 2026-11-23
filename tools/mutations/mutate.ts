// Applies each mutation of `mutations.ts` to a copy of the repository, one at a time in each copy, runs each test it
// names alone, in a process of its own, and fails when one of them passes, or fails alone without it: a check whose
// removal no test notices is held by none, and a test that fails only beside others of its file holds nothing. A test
// of the types is not run: `tsc` checks the root project of the copy once under the mutation, and the test fails when a
// diagnostic is in its lines, as an `@ts-expect-error` that nothing refuses any more.
//
//   bun run mutations                  every mutation
//   bun run mutations <name>…          those whose name contains one of the arguments
//   bun run mutations --discover <name>…
//                                      the whole suite under each, listing every test that fails: for a new mutation
//   --jobs=<n>                         how many copies run at once: half the processors by default
//   bun run mutations --against=<rev> [<name>…]
//                                      no test: whether each mutation makes the code that runs that it made at
//                                      <rev>, after a change that rewrites the code and not what it does, and, for
//                                      one of the types, which changes no code that runs, the same tokens
//   bun run mutations --help           the same, as the command describes itself
//
// The copies are under `.mutants/` (ignored by git, and by `bun test`, which skips directories that start with a dot),
// where `effect` resolves through the repository's `node_modules`. The working tree is never written. A copy holds one
// mutation at a time, so the mutations run apart, and what each did is printed in the order of the list, once a killer
// that passed under its mutation has run again with no other copy running. A run stopped by SIGINT or SIGTERM is
// interrupted: the scope of each test under way ends its process, and the copies are removed once they have ended.
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Opt from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import { exec, Failed, main, repository } from "../cli.ts"
import { type Mutation, mutations } from "./mutations.ts"

// One for each process, so that several can run at once.
const base = Effect.gen(function*() {
  const path = yield* Path.Path
  return path.join(yield* repository, ".mutants", String(process.pid))
})

const copied = ["src", "test", "examples", "bridges", "bunfig.toml", "package.json", "tsconfig.json"]

// `title` is what `bun test -t` matches: the names of the enclosing `describe`s, outermost first, and the test's,
// joined by spaces.
type Outcome = Readonly<{ file: string; name: string; title: string; failed: boolean }>

type Killer = Mutation["killedBy"][number]

const typed = (killer: Killer) => killer[2] === "typecheck"

type Verdict = "passed" | "failed" | "hung" | "ran away"

// The lines of a test, numbered from 1 as `tsc` numbers them: from the line of its call to the line that closes it.
type Span = Readonly<{ name: string; first: number; last: number }>

// The tests of a file, as dprint writes them: a call alone on its line closes at its own indentation, and a long one
// has its name alone on the next line.
const spansIn = (text: string): ReadonlyArray<Span> => {
  const lines = text.split(/\r?\n/)
  const spans: Array<Span> = []
  for (const [index, line] of lines.entries()) {
    const call = /^(\s*)test(?:\.\w+)?\((.*)$/.exec(line)
    if (call === null) continue
    const [, indent = "", rest = ""] = call
    const literal = /^\s*("(?:[^"\\]|\\.)*")/.exec(rest.trim() === "" ? lines[index + 1] ?? "" : rest)
    if (literal === null) continue
    const name: string = JSON.parse(literal[1] as string)
    if (line.trimEnd().endsWith(")")) {
      spans.push({ name, first: index + 1, last: index + 1 })
      continue
    }
    const end = lines.findIndex((other, at) => at > index && other.startsWith(`${indent}}`))
    if (end !== -1) spans.push({ name, first: index + 1, last: end + 1 })
  }
  return spans
}

type Diagnostic = Readonly<{ file: string; line: number; text: string }>

const diagnosticsIn = (output: string): ReadonlyArray<Diagnostic> =>
  Array.from(
    output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+: .*)$/gm),
    ([, file = "", line, text = ""]) => ({ file: file.replaceAll("\\", "/"), line: Number(line), text })
  )

const within = (diagnostic: Diagnostic, file: string, span: Span) =>
  diagnostic.file === file && diagnostic.line >= span.first && diagnostic.line <= span.last

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

// `.mutants/` itself is left: `FileSystem` removes a directory only with what it holds, which may be the copies of
// another process still running.
const removeCopies = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.remove(yield* base, { recursive: true, force: true })
}).pipe(Effect.orDie)

// Runs `files` in `copy`, only the test whose title is `title` when given, and returns what it did, that it hung, or
// that it ran away: that the memory guard of the tests (`test/memory-guard.test_hook.ts`) ended it, with no report.
const runTests = Effect.fnUntraced(function*(copy: string, files: ReadonlyArray<string>, title?: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
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
  if (!(yield* fs.exists(report))) {
    if (stderr.includes("memory guard: ")) return "ran away" as const
    return yield* new Failed({ message: `bun test wrote no report (exit ${exitCode}):\n${stderr}` })
  }
  const ran = outcomes(yield* fs.readFileString(report))
  yield* fs.remove(report)
  const run: Run = { ran, failedOutside: exitCode !== 0 && !ran.some((outcome) => outcome.failed) }
  return run
})

// What `tsc` reports of the root project of `copy`, whose `effect` and whose `tsc` resolve through the repository's
// `node_modules`: the language service of Effect patched in, as `bun run typecheck` runs it.
const typecheck = Effect.fnUntraced(function*(copy: string) {
  const ended = yield* exec(
    ChildProcess.make("bun", ["x", "tsc", "--noEmit", "--pretty", "false", "-p", "."], {
      cwd: copy,
      forceKillAfter: Duration.seconds(5)
    })
  ).pipe(Effect.timeoutOption(patience))
  if (Opt.isNone(ended)) return "hung" as const
  const { exitCode, stderr, stdout } = ended.value
  const diagnostics = diagnosticsIn(stdout)
  if (exitCode !== 0 && diagnostics.length === 0) {
    return yield* new Failed({ message: `tsc reported no diagnostic (exit ${exitCode}):\n${stdout}${stderr}` })
  }
  return diagnostics
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

const describe = ([file, name, by]: Killer) => `${file} › ${name}${by === undefined ? "" : ` (${by})`}`

// The title of each killer of `chosen` that runs, found by a run of their files whole: each must have run exactly once,
// so that a renamed or removed test is an error of the list, and be the only test of its file with its title, so that
// a run of it alone runs it only.
const titlesOf = Effect.fnUntraced(function*(copy: string, chosen: ReadonlyArray<Mutation>) {
  const killers = chosen.flatMap((mutation) => mutation.killedBy).filter((killer) => !typed(killer))
  if (killers.length === 0) return new Map<string, string>() as ReadonlyMap<string, string>
  const run = yield* runTests(copy, [...new Set(killers.map(([file]) => file))])
  if (run === "hung" || run === "ran away") {
    return yield* new Failed({
      message: `The files of the tests ${run === "hung" ? "hang" : "run away"} without any mutation`
    })
  }
  const { ran } = run
  const titles = new Map<string, string>()
  for (const mutation of chosen) {
    for (const killer of mutation.killedBy.filter((killer) => !typed(killer))) {
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

// The lines of each killer of `chosen` that is a test of the types, found in its file: as for a test that runs, its
// name must be found exactly once there.
const spansOf = Effect.fnUntraced(function*(copy: string, chosen: ReadonlyArray<Mutation>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spans = new Map<string, Span>()
  for (const mutation of chosen) {
    for (const killer of mutation.killedBy.filter(typed)) {
      const [file, name] = killer
      const found = spansIn(yield* fs.readFileString(path.join(copy, file))).filter((span) => span.name === name)
      if (found.length !== 1) {
        return yield* new Failed({
          message: `"${mutation.name}" names ${describe(killer)}, which its file holds ${found.length} times`
        })
      }
      spans.set(describe(killer), found[0] as Span)
    }
  }
  return spans as ReadonlyMap<string, Span>
})

type Located = Readonly<{ titles: ReadonlyMap<string, string>; spans: ReadonlyMap<string, Span> }>

// The verdict of a test of the types, from what `tsc` reported under the mutation.
const typedVerdict = (
  located: Located,
  diagnostics: ReadonlyArray<Diagnostic> | "hung",
  killer: Killer
): Verdict => {
  if (diagnostics === "hung") return "hung"
  const span = located.spans.get(describe(killer)) as Span
  return diagnostics.some((diagnostic) => within(diagnostic, killer[0], span)) ? "failed" : "passed"
}

// Runs `killer` alone in `copy`, in a process of its own: a test that hangs does not pass, nor one whose run fails
// outside it, since it is the only test that ran.
const alone = Effect.fnUntraced(function*(copy: string, titles: ReadonlyMap<string, string>, killer: Killer) {
  const title = titles.get(describe(killer)) as string
  const run = yield* runTests(copy, [killer[0]], title)
  if (run === "hung" || run === "ran away") return run as Verdict
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

const under = Effect.fnUntraced(function*<A, E, R>(copy: string, mutation: Mutation, effect: Effect.Effect<A, E, R>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(copy, mutation.file)
  return yield* Effect.acquireUseRelease(
    Effect.gen(function*() {
      const original = yield* fs.readFileString(file)
      yield* fs.writeFileString(file, yield* mutated(mutation, original))
      return original
    }),
    () => effect,
    (original) => Effect.orDie(fs.writeFileString(file, original))
  )
})

// Runs the killers of `mutation` alone in `copy`, one after another, under it: those of the types by one `tsc`.
const verdictsUnder = (copy: string, located: Located, mutation: Mutation, killers: ReadonlyArray<Killer>) =>
  under(
    copy,
    mutation,
    Effect.gen(function*() {
      const diagnostics = killers.some(typed) ? yield* typecheck(copy) : []
      return yield* Effect.forEach(killers, (killer) =>
        typed(killer)
          ? Effect.succeed([killer, typedVerdict(located, diagnostics, killer)] as const)
          : Effect.map(alone(copy, located.titles, killer), (verdict) => [killer, verdict] as const))
    })
  )

// The JavaScript that Bun runs of `text`, by line: printed from the syntax tree, with no types, comments or layout, so
// that only a change of the code that runs tells two apart. dprint would not do: it keeps some of the line breaks it
// is given.
const emitted = (file: string, text: string) =>
  new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).transformSync(text).split("\n")

// The tokens of `text`, with no comments or layout: what tells apart two mutations of the types, which change no code
// that runs.
const tokens = (_file: string, text: string) =>
  (text.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\w+|\S/g) ?? [])
    .filter((token) => !token.startsWith("//") && !token.startsWith("/*"))

// What `mutation` changes in the code that runs of `file`, by line, or in its tokens, with the lines or the tokens
// around it that tell where: the rest of the file is left out, so that a change elsewhere, as an order of the imports,
// does not tell two apart.
const changeOf = Effect.fnUntraced(function*(
  mutation: Mutation,
  file: string,
  original: string,
  split: (file: string, text: string) => ReadonlyArray<string> = emitted
) {
  const context = split === emitted ? 3 : 8
  const then = split(file, original)
  const now = split(file, yield* mutated(mutation, original))
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

const changes = (change: ReadonlyArray<string>) => change.some((line) => line.startsWith("- ") || line.startsWith("+ "))

const atRevision = Effect.fnUntraced(function*(revision: string, file: string) {
  const { exitCode, stdout, stderr } = yield* exec(
    ChildProcess.make("git", ["show", `${revision}:${file}`], { cwd: yield* repository })
  )
  if (exitCode !== 0) return yield* new Failed({ message: `git show ${revision}:${file}: ${stderr}` })
  return stdout
})

// Each of `chosen` against the mutation of the same name at `revision`: after a change that rewrites the code and not
// what it does, the two change the same code in the same place, or a mutation that still finds its text exactly once
// may take out another check than it did.
const compare = Effect.fnUntraced(function*(revision: string, chosen: ReadonlyArray<Mutation>) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* repository
  const directory = yield* base
  // Imported from a file, since the list is a module; it imports nothing.
  const listed = path.join(directory, "mutations.ts")
  const list = yield* atRevision(revision, "tools/mutations/mutations.ts")
  yield* fs.makeDirectory(directory, { recursive: true })
  yield* fs.writeFileString(listed, list)
  const before: ReadonlyArray<Mutation> = (yield* Effect.promise(() => import(listed))).mutations
  let different = 0
  for (const mutation of chosen) {
    const old = before.find((candidate) => candidate.name === mutation.name)
    if (old === undefined) {
      yield* Console.log(`new       ${mutation.name}`)
      continue
    }
    const textThen = yield* atRevision(revision, old.file)
    const textNow = yield* fs.readFileString(path.join(root, mutation.file))
    let then = yield* changeOf(old, old.file, textThen)
    let now = yield* changeOf(mutation, mutation.file, textNow)
    // A mutation of the types changes no code that runs, at either revision: its tokens tell where it is.
    const byTokens = !changes(then) && !changes(now)
    if (byTokens) {
      then = yield* changeOf(old, old.file, textThen, tokens)
      now = yield* changeOf(mutation, mutation.file, textNow, tokens)
    }
    if (then.join("\n") === now.join("\n")) {
      yield* Console.log(`same      ${mutation.name}${byTokens ? " (by its tokens)" : ""}`)
      continue
    }
    different++
    yield* Console.log(`DIFFERENT ${mutation.name}\n  at ${revision}:\n${then.join("\n")}\n  now:\n${now.join("\n")}`)
  }
  const gone = before.filter((old) => !mutations.some((mutation) => mutation.name === old.name))
  for (const old of gone) yield* Console.log(`gone      ${old.name}`)
  return different
})

// The files of the tests in `copy`, but for the search of the histories.
const testFiles = Effect.fnUntraced(function*(copy: string) {
  const fs = yield* FileSystem.FileSystem
  const entries = yield* fs.readDirectory(copy, { recursive: true })
  return entries
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => entry.endsWith(".test.ts") && entry !== "src/interleaving.test.ts")
    .sort()
})

// The suite of `bun run test`: the search of the histories lasts longer than a test may, and a property of it is named
// a killer only once it failed under the mutation on each of a hundred runs, which a discovery does not tell. A suite
// that runs away names no test, since the guard ends its process at once: then each file runs alone, and those that run
// away are named.
const suiteUnder = Effect.fnUntraced(function*(copy: string) {
  const run = yield* runTests(copy, ["--path-ignore-patterns=src/interleaving.test.ts"])
  if (run !== "ran away") return run
  const ranAway: Array<string> = []
  for (const file of yield* testFiles(copy)) if ((yield* runTests(copy, [file])) === "ran away") ranAway.push(file)
  return { ranAway } as const
})

// What `tsc` reports under a mutation, by the test of the types whose lines hold it, or outside any test.
const typedUnder = Effect.fnUntraced(function*(copy: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const diagnostics = yield* typecheck(copy)
  if (diagnostics === "hung") return "hung" as const
  const failed = new Map<string, Killer>()
  const outside: Array<Diagnostic> = []
  const spans = new Map<string, ReadonlyArray<Span>>()
  for (const diagnostic of diagnostics) {
    if (!spans.has(diagnostic.file)) {
      spans.set(diagnostic.file, spansIn(yield* fs.readFileString(path.join(copy, diagnostic.file))))
    }
    const span = (spans.get(diagnostic.file) ?? []).find((span) => within(diagnostic, diagnostic.file, span))
    if (span === undefined) outside.push(diagnostic)
    else failed.set(`${diagnostic.file} › ${span.name}`, [diagnostic.file, span.name, "typecheck"])
  }
  return { failed: [...failed.values()], outside }
})

// Whether `mutation` leaves the code that runs as it is: it changes only types, and no test that runs can fail.
const ofTypes = Effect.fnUntraced(function*(copy: string, mutation: Mutation) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return !changes(yield* changeOf(mutation, mutation.file, yield* fs.readFileString(path.join(copy, mutation.file))))
})

const discoverIn = (copies: ReadonlyArray<string>, chosen: ReadonlyArray<Mutation>) =>
  pool(
    copies,
    chosen,
    (copy, mutation) =>
      Effect.flatMap(ofTypes(copy, mutation), (onlyTypes) =>
        under(
          copy,
          mutation,
          Effect.all({
            run: onlyTypes ? Effect.succeed("same code" as const) : suiteUnder(copy),
            types: typedUnder(copy)
          })
        )),
    ({ run, types }, index) => {
      const { name } = chosen[index] as Mutation
      console.log(`\n${name}:`)
      if (types === "hung") console.log("  tsc hangs under it")
      else {
        for (const [file, test] of types.failed) console.log(`  ['${file}', ${JSON.stringify(test)}, "typecheck"],`)
        for (const { file, line, text } of types.outside) {
          console.log(`  and, outside a test, ${file}(${line}): ${text}`)
        }
      }
      if (run === "same code") {
        console.log("  and it changes no code that runs: no test that runs can fail")
        return
      }
      if (run === "hung") {
        console.log("  the suite hangs under it")
        return
      }
      if ("ranAway" in run) {
        console.log("  the suite runs away under it")
        for (const file of run.ranAway) console.log(`  and so does ${file}, alone`)
        return
      }
      // An error thrown between two tests fails none of them in the report: only a run of each alone tells which one
      // leaves it.
      if (run.failedOutside) console.log("  and the suite fails outside its tests")
      for (const { file, name } of run.ran.filter((outcome) => outcome.failed)) {
        console.log(`  ['${file}', ${JSON.stringify(name)}],`)
      }
    }
  )

// How many of `chosen` survived a test that must kill them.
const killIn = Effect.fnUntraced(function*(copies: ReadonlyArray<string>, chosen: ReadonlyArray<Mutation>) {
  const titles = yield* titlesOf(copies[0] as string, chosen)
  const located: Located = { titles, spans: yield* spansOf(copies[0] as string, chosen) }
  // Each test must pass alone without its mutation, or its failure under it says nothing; a test of the types, with
  // no diagnostic in its lines.
  const killers = new Map(chosen.flatMap((mutation) => mutation.killedBy.map((killer) => [describe(killer), killer])))
  const unmutated = [...killers.values()].some(typed) ? yield* typecheck(copies[0] as string) : []
  const fail = (killer: Killer, outcome: Verdict) =>
    outcome === "passed"
      ? Effect.void
      : Effect.fail(new Failed({ message: `${describe(killer)} ${outcome} alone without any mutation` }))
  for (const killer of [...killers.values()].filter(typed)) {
    yield* fail(killer, typedVerdict(located, unmutated, killer))
  }
  yield* pool(
    copies,
    [...killers.values()].filter((killer) => !typed(killer)),
    (copy, killer) => Effect.flatMap(alone(copy, titles, killer), (outcome) => fail(killer, outcome))
  )
  const killedIn = (copy: string, mutation: Mutation) =>
    Effect.map(
      Effect.timed(verdictsUnder(copy, located, mutation, mutation.killedBy)),
      ([duration, ran]) => ({ ran, seconds: Duration.toSeconds(duration).toFixed(1) })
    )
  const results: Array<Effect.Success<ReturnType<typeof killedIn>>> = []
  yield* pool(copies, chosen, killedIn, (result, index) => {
    results[index] = result
  })
  // A killer that holds a window of absence (`docs/invariants.md`) may pass under its mutation on a machine the other
  // copies load. It is run again, alone and with no other copy running, before it is taken for a survivor: the
  // killers of a check no test notices pass again, so this keeps every survivor. A test of the types holds no window.
  const again = new Map<number, ReadonlyArray<Killer>>()
  for (const [index, { ran }] of results.entries()) {
    const passed = ran.filter(([killer, outcome]) => outcome === "passed" && !typed(killer)).map(([killer]) => killer)
    if (passed.length === 0) continue
    const verdicts = yield* verdictsUnder(copies[0] as string, located, chosen[index] as Mutation, passed)
    again.set(index, verdicts.filter(([, outcome]) => outcome !== "passed").map(([killer]) => killer))
  }
  let survived = 0
  for (const [index, { ran, seconds }] of results.entries()) {
    const failedAgain = again.get(index) ?? []
    const passed = ran.filter(([killer, outcome]) => outcome === "passed" && !failedAgain.includes(killer))
    const hung = ran.filter(([, outcome]) => outcome === "hung")
    const away = ran.filter(([, outcome]) => outcome === "ran away")
    const verdict = passed.length === 0 ? "killed" : "SURVIVED"
    yield* Console.log(`${verdict} [${index + 1}/${chosen.length}] ${(chosen[index] as Mutation).name} (${seconds}s)`)
    for (const [killer] of hung) yield* Console.log(`  hangs under it: ${describe(killer)}`)
    for (const [killer] of away) yield* Console.log(`  runs away under it: ${describe(killer)}`)
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
      Flag.withDefault(Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))),
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
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* repository
      const directory = yield* base
      const copies = Array.from(
        { length: Math.min(jobs, chosen.length) },
        (_, index) => path.join(directory, String(index))
      )
      // A process killed before its copies were removed may have had this pid: `copy` overwrites none of its files.
      yield* removeCopies
      for (const copy of copies) {
        for (const entry of copied) yield* fs.copy(path.join(root, entry), path.join(copy, entry))
      }
      if (discover) return yield* discoverIn(copies, chosen)
      const survived = yield* killIn(copies, chosen)
      if (survived > 0) {
        return yield* new Failed({
          message: `\n${survived} of ${chosen.length} mutations survived a test that must kill them`
        })
      }
    },
    Effect.ensuring(removeCopies)
  )
)

main(command)
