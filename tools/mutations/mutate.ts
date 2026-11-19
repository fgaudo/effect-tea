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
//
// The copies are under `.mutants/` (ignored by git, and by `bun test`, which skips directories that start with a dot),
// where `effect` resolves through the repository's `node_modules`. The working tree is never written. A copy holds one
// mutation at a time, so the mutations run apart, and what each did is printed in the order of the list, once a killer
// that passed under its mutation has run again with no other copy running. A run
// stopped by SIGINT or SIGTERM ends the tests under way and removes its copies too.
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { type Mutation, mutations } from "./mutations.ts"

const root = path.resolve(import.meta.dir, "../..")
// One for each process, so that several can run at once.
const base = path.join(root, ".mutants", String(process.pid))
const copied = ["src", "test", "examples", "bridges", "bunfig.toml", "package.json", "tsconfig.json"]

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
const patience = 60 * 1000
// A run of whole files lasts as long as their tests: each is ended by bun's own timeout, so a mutation under which
// many wait for what never comes can make a run of the suite last minutes without hanging.
const suitePatience = 15 * 60 * 1000

// What a run of `bun test` did: its tests, and whether it failed outside them, as on an error thrown between two
// tests, which fails the run and is the failure of no test in the report.
type Run = Readonly<{ ran: ReadonlyArray<Outcome>; failedOutside: boolean }>

let reports = 0

// The runs of `bun test` under way, so that a run of this script stopped from outside ends them before it removes the
// copies they run in.
const running = new Set<Bun.Subprocess>()

const removeCopies = () => {
  fs.rmSync(base, { recursive: true, force: true })
  // Left to another process still running, when it is not empty.
  try {
    fs.rmdirSync(path.dirname(base))
  } catch {}
}

const stopped = async (signal: NodeJS.Signals) => {
  for (const run of running) run.kill()
  await Promise.all(Array.from(running, (run) => run.exited))
  removeCopies()
  process.exit(128 + os.constants.signals[signal])
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stopped)

// Runs `files` in `copy`, only the test whose title is `title` when given, and returns what it did, or that it hung.
const runTests = async (copy: string, files: ReadonlyArray<string>, title?: string): Promise<Run | "hung"> => {
  // One for each run, so that two runs never read each other's.
  const report = path.join(copy, `report-${reports++}.xml`)
  // Anchored, since `-t` runs every test whose title the pattern finds anywhere in it.
  const filter = title === undefined ? [] : ["-t", `^${escape(title)}$`]
  const timeout = title === undefined ? suitePatience : patience
  const started = performance.now()
  const run = Bun.spawn(["bun", "test", ...files, ...filter, "--reporter=junit", `--reporter-outfile=${report}`], {
    cwd: copy,
    stdout: "ignore",
    stderr: "pipe",
    timeout
  })
  running.add(run)
  const [stderr] = await Promise.all([new Response(run.stderr).text(), run.exited])
  running.delete(run)
  // Only `timeout` ends a run this late.
  if (performance.now() - started >= timeout) return "hung"
  if (!fs.existsSync(report)) throw new Error(`bun test wrote no report (exit ${run.exitCode}):\n${stderr}`)
  const ran = outcomes(fs.readFileSync(report, "utf8"))
  fs.rmSync(report)
  return { ran, failedOutside: run.exitCode !== 0 && !ran.some((outcome) => outcome.failed) }
}

// Applies `f` to each of `items`, one at a time in each of `copies`, and hands each result to `emit` in the order of
// `items`. A failure stops the copies from taking more, and is thrown once every run under way has ended, so that no
// process is left running in a copy about to be removed.
const pool = async <A, B>(
  copies: ReadonlyArray<string>,
  items: ReadonlyArray<A>,
  f: (copy: string, item: A) => Promise<B>,
  emit: (result: B, index: number) => void = () => {}
): Promise<void> => {
  const results: Array<B> = []
  const settled: Array<boolean> = []
  let taken = 0
  let emitted = 0
  let failed = false
  const work = async (copy: string) => {
    while (!failed && taken < items.length) {
      const index = taken++
      try {
        results[index] = await f(copy, items[index] as A)
      } catch (error) {
        failed = true
        throw error
      }
      settled[index] = true
      while (settled[emitted] === true) {
        emit(results[emitted] as B, emitted)
        emitted++
      }
    }
  }
  const ended = await Promise.allSettled(copies.slice(0, items.length).map(work))
  const rejected = ended.find((outcome) => outcome.status === "rejected")
  if (rejected !== undefined) throw rejected.reason
}

const describe = ([file, name]: Killer) => `${file} › ${name}`

// The title of each killer of `chosen`, found by a run of their files whole: each must have run exactly once, so that
// a renamed or removed test is an error of the list, and be the only test of its file with its title, so that a run
// of it alone runs it only.
const titlesOf = async (copy: string, chosen: ReadonlyArray<Mutation>): Promise<ReadonlyMap<string, string>> => {
  const killers = chosen.flatMap((mutation) => mutation.killedBy)
  const run = await runTests(copy, [...new Set(killers.map(([file]) => file))])
  if (run === "hung") throw new Error("The files of the tests hang without any mutation")
  const { ran } = run
  const titles = new Map<string, string>()
  for (const mutation of chosen) {
    for (const killer of mutation.killedBy) {
      const [file, name] = killer
      const found = ran.filter((outcome) => outcome.file === file && outcome.name === name)
      if (found.length !== 1) {
        throw new Error(`"${mutation.name}" names ${describe(killer)}, which ran ${found.length} times`)
      }
      const { title } = found[0] as Outcome
      const alike = ran.filter((outcome) => outcome.file === file && outcome.title === title).length
      if (alike !== 1) throw new Error(`${file} holds ${alike} tests titled "${title}"`)
      titles.set(describe(killer), title)
    }
  }
  return titles
}

// Runs `killer` alone in `copy`, in a process of its own: a test that hangs does not pass, nor one whose run fails
// outside it, since it is the only test that ran.
const alone = async (copy: string, titles: ReadonlyMap<string, string>, killer: Killer): Promise<Verdict> => {
  const title = titles.get(describe(killer)) as string
  const run = await runTests(copy, [killer[0]], title)
  if (run === "hung") return "hung"
  if (run.ran.length !== 1 || (run.ran[0] as Outcome).title !== title) {
    throw new Error(`A run of ${describe(killer)} alone ran ${run.ran.length} tests`)
  }
  return (run.ran[0] as Outcome).failed || run.failedOutside ? "failed" : "passed"
}

// The mutated text of `mutation`'s file: `from` must occur exactly once, so that a change of the code is noticed.
const mutated = (mutation: Mutation, original: string) => {
  const parts = original.split(mutation.from)
  if (parts.length !== 2) {
    throw new Error(`"${mutation.name}": ${mutation.file} holds what it replaces ${parts.length - 1} times, not once`)
  }
  return parts.join(mutation.to)
}

const under = async <A>(copy: string, mutation: Mutation, f: () => Promise<A>): Promise<A> => {
  const file = path.join(copy, mutation.file)
  const original = fs.readFileSync(file, "utf8")
  fs.writeFileSync(file, mutated(mutation, original))
  try {
    return await f()
  } finally {
    fs.writeFileSync(file, original)
  }
}

// The JavaScript that Bun runs of `text`, by line: printed from the syntax tree, with no types, comments or layout, so
// that only a change of the code that runs tells two apart. dprint would not do: it keeps some of the line breaks it
// is given.
const emitted = (file: string, text: string) =>
  new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" }).transformSync(text).split("\n")

// What `mutation` changes in the code that runs of `file`, with the lines around it that tell where: the rest of the
// file is left out, so that a change elsewhere, as an order of the imports, does not tell two apart.
const changeOf = (mutation: Mutation, file: string, original: string) => {
  const context = 3
  const then = emitted(file, original)
  const now = emitted(file, mutated(mutation, original))
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
}

const atRevision = (revision: string, file: string) => {
  const run = Bun.spawnSync(["git", "show", `${revision}:${file}`], { cwd: root })
  if (run.exitCode !== 0) throw new Error(`git show ${revision}:${file}: ${run.stderr.toString()}`)
  return run.stdout.toString()
}

// Each of `chosen` against the mutation of the same name at `revision`: after a change that rewrites the code and not
// what it does, the two change the same code in the same place, or a mutation that still finds its text exactly once
// may take out another check than it did.
const compare = async (revision: string, chosen: ReadonlyArray<Mutation>) => {
  // Imported from a file, since the list is a module; it imports nothing.
  const listed = path.join(base, "mutations.ts")
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(listed, atRevision(revision, "tools/mutations/mutations.ts"))
  const before: ReadonlyArray<Mutation> = (await import(listed)).mutations
  let different = 0
  for (const mutation of chosen) {
    const old = before.find((candidate) => candidate.name === mutation.name)
    if (old === undefined) {
      console.log(`new       ${mutation.name}`)
      continue
    }
    const then = changeOf(old, old.file, atRevision(revision, old.file))
    const now = changeOf(mutation, mutation.file, fs.readFileSync(path.join(root, mutation.file), "utf8"))
    if (then.join("\n") === now.join("\n")) {
      console.log(`same      ${mutation.name}`)
      continue
    }
    different++
    console.log(`DIFFERENT ${mutation.name}\n  at ${revision}:\n${then.join("\n")}\n  now:\n${now.join("\n")}`)
  }
  const gone = before.filter((old) => !mutations.some((mutation) => mutation.name === old.name))
  for (const old of gone) console.log(`gone      ${old.name}`)
  return different
}

const args = process.argv.slice(2)
const discover = args.includes("--discover")
const againstArg = args.find((arg) => arg.startsWith("--against="))
const jobsArg = args.find((arg) => arg.startsWith("--jobs="))
const jobs = jobsArg === undefined
  ? Math.max(1, Math.floor(os.availableParallelism() / 2))
  : Number(jobsArg.slice("--jobs=".length))
if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`${jobsArg} names no number of jobs`)
const wanted = args.filter((arg) => arg !== "--discover" && arg !== jobsArg && arg !== againstArg)
const chosen = wanted.length === 0
  ? mutations
  : mutations.filter((mutation) => wanted.some((name) => mutation.name.includes(name)))
if (chosen.length === 0) throw new Error(`No mutation is named like ${wanted.join(", ")}`)
const names = new Set(mutations.map((mutation) => mutation.name))
if (names.size !== mutations.length) throw new Error("Two mutations have the same name")
const unheld = chosen.find((mutation) => mutation.killedBy.length === 0)
if (!discover && unheld !== undefined) throw new Error(`"${unheld.name}" names no test that must fail under it`)

if (againstArg !== undefined) {
  const revision = againstArg.slice("--against=".length)
  let different: number
  try {
    different = await compare(revision, chosen)
  } finally {
    removeCopies()
  }
  if (different > 0) {
    console.error(`\n${different} of ${chosen.length} mutations make other code than at ${revision}`)
    process.exit(1)
  }
  process.exit(0)
}

const copies = Array.from({ length: Math.min(jobs, chosen.length) }, (_, index) => path.join(base, String(index)))
let survived = 0
try {
  for (const copy of copies) {
    for (const entry of copied) fs.cpSync(path.join(root, entry), path.join(copy, entry), { recursive: true })
  }
  if (discover) {
    // The suite of `bun run test`: the search of the histories lasts longer than a test may, and names no killer.
    const suite = (copy: string, mutation: Mutation) =>
      under(copy, mutation, () => runTests(copy, ["--path-ignore-patterns=src/interleaving.test.ts"]))
    await pool(copies, chosen, suite, (run, index) => {
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
    })
  } else {
    const titles = await titlesOf(copies[0] as string, chosen)
    // Each test must pass alone without its mutation, or its failure under it says nothing.
    const killers = new Map(chosen.flatMap((mutation) => mutation.killedBy.map((killer) => [describe(killer), killer])))
    await pool(copies, [...killers.values()], async (copy, killer) => {
      const outcome = await alone(copy, titles, killer)
      if (outcome !== "passed") throw new Error(`${describe(killer)} ${outcome} alone without any mutation`)
    })
    const killedIn = async (copy: string, mutation: Mutation) => {
      const started = performance.now()
      const ran = await under(copy, mutation, async () => {
        const verdicts: Array<readonly [Killer, Verdict]> = []
        for (const killer of mutation.killedBy) verdicts.push([killer, await alone(copy, titles, killer)])
        return verdicts
      })
      return { ran, seconds: ((performance.now() - started) / 1000).toFixed(1) }
    }
    const results: Array<Awaited<ReturnType<typeof killedIn>>> = []
    await pool(copies, chosen, killedIn, (result, index) => {
      results[index] = result
    })
    // A killer that holds a window of absence (`docs/invariants.md`) may pass under its mutation on a machine the other
    // copies load. It is run again, alone and with no other copy running, before it is taken for a survivor: the
    // killers of a check no test notices pass again, so this keeps every survivor.
    const again = new Map<number, ReadonlyArray<Killer>>()
    for (const [index, { ran }] of results.entries()) {
      const passed = ran.filter(([, outcome]) => outcome === "passed").map(([killer]) => killer)
      if (passed.length === 0) continue
      const copy = copies[0] as string
      const mutation = chosen[index] as Mutation
      const verdicts = await under(copy, mutation, async () => {
        const verdicts: Array<readonly [Killer, Verdict]> = []
        for (const killer of passed) verdicts.push([killer, await alone(copy, titles, killer)])
        return verdicts
      })
      again.set(index, verdicts.filter(([, outcome]) => outcome !== "passed").map(([killer]) => killer))
    }
    for (const [index, { ran, seconds }] of results.entries()) {
      const failedAgain = again.get(index) ?? []
      const passed = ran.filter(([killer, outcome]) => outcome === "passed" && !failedAgain.includes(killer))
      const hung = ran.filter(([, outcome]) => outcome === "hung")
      const verdict = passed.length === 0 ? "killed" : "SURVIVED"
      console.log(`${verdict} [${index + 1}/${chosen.length}] ${(chosen[index] as Mutation).name} (${seconds}s)`)
      for (const [killer] of hung) console.log(`  hangs under it: ${describe(killer)}`)
      for (const killer of failedAgain) {
        console.log(`  passes under it beside the other copies, fails alone: ${describe(killer)}`)
      }
      for (const [killer] of passed) console.log(`  passes under it: ${describe(killer)}`)
      if (passed.length > 0) survived++
    }
  }
} finally {
  removeCopies()
}
if (survived > 0) {
  console.error(`\n${survived} of ${chosen.length} mutations survived a test that must kill them`)
  process.exit(1)
}
