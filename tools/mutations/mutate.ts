// Applies each mutation of `mutations.ts` to a copy of the repository, one at a time in each copy, runs each test it
// names alone, in a process of its own, and fails when one of them passes, or fails alone without it: a check whose
// removal no test notices is held by none, and a test that fails only beside others of its file holds nothing.
//
//   bun run mutations                  every mutation
//   bun run mutations <name>…          those whose name contains one of the arguments
//   bun run mutations --discover <name>…
//                                      the whole suite under each, listing every test that fails: for a new mutation
//   --jobs=<n>                         how many copies run at once: half the processors by default
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

const decode = (text: string) =>
  text.replace(
    /&(quot|apos|lt|gt|amp);/g,
    (_, entity: string) => ({ quot: "\"", apos: "'", lt: "<", gt: ">", amp: "&" })[entity] as string
  )

const attributes = (text: string) =>
  Object.fromEntries(Array.from(text.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, decode(value ?? "")]))

// What bun's JUnit report says of each test that ran: skipped and `todo` tests are left out. Its `classname` lists
// the enclosing `describe`s innermost first, joined by ' > '.
const outcomes = (report: string): ReadonlyArray<Outcome> =>
  Array.from(report.matchAll(/<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)).flatMap(([, head, body]) => {
    if (body?.includes("<skipped")) return []
    const { name = "", file = "", classname = "" } = attributes(head ?? "")
    const describes = classname === "" ? [] : classname.split(" > ").reverse()
    return [{
      file: file.replaceAll("\\", "/"),
      name,
      title: [...describes, name].join(" "),
      failed: body?.includes("<failure") ?? false
    }]
  })

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// No test takes more than a minute: a process that lasts longer hangs, which no report says of its test.
const patience = 60 * 1000

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

// Runs `files` in `copy`, only the test whose title is `title` when given, and returns what each did, or that it hung.
const runTests = async (
  copy: string,
  files: ReadonlyArray<string>,
  title?: string
): Promise<ReadonlyArray<Outcome> | "hung"> => {
  // One for each run, so that two runs never read each other's.
  const report = path.join(copy, `report-${reports++}.xml`)
  // Anchored, since `-t` runs every test whose title the pattern finds anywhere in it.
  const filter = title === undefined ? [] : ["-t", `^${escape(title)}$`]
  const started = performance.now()
  const run = Bun.spawn(["bun", "test", ...files, ...filter, "--reporter=junit", `--reporter-outfile=${report}`], {
    cwd: copy,
    stdout: "ignore",
    stderr: "pipe",
    timeout: patience
  })
  running.add(run)
  const [stderr] = await Promise.all([new Response(run.stderr).text(), run.exited])
  running.delete(run)
  // Only `timeout` ends a run this late.
  if (performance.now() - started >= patience) return "hung"
  if (!fs.existsSync(report)) throw new Error(`bun test wrote no report (exit ${run.exitCode}):\n${stderr}`)
  const ran = outcomes(fs.readFileSync(report, "utf8"))
  fs.rmSync(report)
  return ran
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
  const ran = await runTests(copy, [...new Set(killers.map(([file]) => file))])
  if (ran === "hung") throw new Error("The files of the tests hang without any mutation")
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

// Runs `killer` alone in `copy`, in a process of its own: a test that hangs does not pass.
const alone = async (copy: string, titles: ReadonlyMap<string, string>, killer: Killer): Promise<Verdict> => {
  const title = titles.get(describe(killer)) as string
  const ran = await runTests(copy, [killer[0]], title)
  if (ran === "hung") return "hung"
  if (ran.length !== 1 || (ran[0] as Outcome).title !== title) {
    throw new Error(`A run of ${describe(killer)} alone ran ${ran.length} tests`)
  }
  return (ran[0] as Outcome).failed ? "failed" : "passed"
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

const args = process.argv.slice(2)
const discover = args.includes("--discover")
const jobsArg = args.find((arg) => arg.startsWith("--jobs="))
const jobs = jobsArg === undefined
  ? Math.max(1, Math.floor(os.availableParallelism() / 2))
  : Number(jobsArg.slice("--jobs=".length))
if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`${jobsArg} names no number of jobs`)
const wanted = args.filter((arg) => arg !== "--discover" && arg !== jobsArg)
const chosen = wanted.length === 0
  ? mutations
  : mutations.filter((mutation) => wanted.some((name) => mutation.name.includes(name)))
if (chosen.length === 0) throw new Error(`No mutation is named like ${wanted.join(", ")}`)
const names = new Set(mutations.map((mutation) => mutation.name))
if (names.size !== mutations.length) throw new Error("Two mutations have the same name")
const unheld = chosen.find((mutation) => mutation.killedBy.length === 0)
if (!discover && unheld !== undefined) throw new Error(`"${unheld.name}" names no test that must fail under it`)

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
    await pool(copies, chosen, suite, (ran, index) => {
      const { name } = chosen[index] as Mutation
      if (ran === "hung") {
        console.log(`\n${name}: the suite hangs under it`)
        return
      }
      const failed = ran.filter((outcome) => outcome.failed)
      console.log(`\n${name}: ${failed.length} failing`)
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
