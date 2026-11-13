// Applies each mutation of `mutations.ts` to a copy of the repository, one at a time, runs the tests it names alone,
// and fails when one of them passes, or fails without it: a check whose removal no test notices is held by none.
//
//   bun run mutations                  every mutation
//   bun run mutations <name>…          those whose name contains one of the arguments
//   bun run mutations --discover <name>…
//                                      the whole suite under each, listing every test that fails: for a new mutation
//
// The copy is under `.mutants/` (ignored by git, and by `bun test`, which skips directories that start with a dot),
// where `effect` resolves through the repository's `node_modules`. The working tree is never written.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { type Mutation, mutations } from './mutations.ts'

const root = path.resolve(import.meta.dir, '..')
// One for each process, so that several can run at once.
const copy = path.join(root, '.mutants', String(process.pid))
const copied = ['src', 'test', 'examples', 'bunfig.toml', 'package.json', 'tsconfig.json']

type Outcome = Readonly<{ file: string; name: string; failed: boolean }>

const decode = (text: string) =>
  text.replace(/&(quot|apos|lt|gt|amp);/g, (_, entity: string) =>
    ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[entity] as string)

const attributes = (text: string) =>
  Object.fromEntries(Array.from(text.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, decode(value ?? '')]))

// What bun's JUnit report says of each test that ran: skipped and `todo` tests are left out.
const outcomes = (report: string): ReadonlyArray<Outcome> =>
  Array.from(report.matchAll(/<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)).flatMap(([, head, body]) => {
    if (body?.includes('<skipped')) return []
    const { name, file } = attributes(head ?? '')
    return [{ file: (file ?? '').replaceAll('\\', '/'), name: name ?? '', failed: body?.includes('<failure') ?? false }]
  })

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The whole suite takes under a minute: a run that lasts longer hangs, which no report says of any one test.
const patience = 5 * 60 * 1000

// Runs `files` in the copy, only the tests named `names` when given, and returns what each did, or that it hung.
const runTests = (files: ReadonlyArray<string>, names?: ReadonlyArray<string>): ReadonlyArray<Outcome> | 'hung' => {
  const report = path.join(copy, 'report.xml')
  fs.rmSync(report, { force: true })
  const filter = names === undefined ? [] : ['-t', names.map(escape).join('|')]
  const started = performance.now()
  const run = Bun.spawnSync(['bun', 'test', ...files, ...filter, '--reporter=junit', `--reporter-outfile=${report}`], {
    cwd: copy,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: patience,
  })
  if (run.exitCode === null && performance.now() - started >= patience) return 'hung'
  if (!fs.existsSync(report)) {
    throw new Error(`bun test wrote no report (exit ${run.exitCode}):\n${run.stderr.toString()}`)
  }
  return outcomes(fs.readFileSync(report, 'utf8'))
}

const filesOf = (mutation: Mutation) => [...new Set(mutation.killedBy.map(([file]) => file))]

const namesOf = (mutation: Mutation) => mutation.killedBy.map(([, name]) => name)

// The tests `mutation` names, each found exactly once among `ran`: a renamed or removed test is an error of the list.
const named = (mutation: Mutation, ran: ReadonlyArray<Outcome>) =>
  mutation.killedBy.map(([file, name]) => {
    const found = ran.filter((outcome) => outcome.file === file && outcome.name === name)
    if (found.length !== 1) {
      throw new Error(`"${mutation.name}" names ${file} › ${name}, which ran ${found.length} times`)
    }
    return found[0] as Outcome
  })

// The mutated text of `mutation`'s file: `from` must occur exactly once, so that a change of the code is noticed.
const mutated = (mutation: Mutation, original: string) => {
  const parts = original.split(mutation.from)
  if (parts.length !== 2) {
    throw new Error(`"${mutation.name}": ${mutation.file} holds what it replaces ${parts.length - 1} times, not once`)
  }
  return parts.join(mutation.to)
}

const under = <A>(mutation: Mutation, f: () => A): A => {
  const file = path.join(copy, mutation.file)
  const original = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, mutated(mutation, original))
  try {
    return f()
  } finally {
    fs.writeFileSync(file, original)
  }
}

const args = process.argv.slice(2)
const discover = args.includes('--discover')
const wanted = args.filter((arg) => arg !== '--discover')
const chosen = wanted.length === 0
  ? mutations
  : mutations.filter((mutation) => wanted.some((name) => mutation.name.includes(name)))
if (chosen.length === 0) throw new Error(`No mutation is named like ${wanted.join(', ')}`)
const names = new Set(mutations.map((mutation) => mutation.name))
if (names.size !== mutations.length) throw new Error('Two mutations have the same name')
const unheld = chosen.find((mutation) => mutation.killedBy.length === 0)
if (!discover && unheld !== undefined) throw new Error(`"${unheld.name}" names no test that must fail under it`)

for (const entry of copied) fs.cpSync(path.join(root, entry), path.join(copy, entry), { recursive: true })
let survived = 0
try {
  if (discover) {
    for (const mutation of chosen) {
      const ran = under(mutation, () => runTests([]))
      if (ran === 'hung') {
        console.log(`\n${mutation.name}: the suite hangs under it`)
        continue
      }
      const failed = ran.filter((outcome) => outcome.failed)
      console.log(`\n${mutation.name}: ${failed.length} failing`)
      for (const { file, name } of failed) console.log(`  ['${file}', ${JSON.stringify(name)}],`)
    }
  } else {
    // Each test must pass without its mutation, or its failure under it says nothing.
    const baseline = runTests(
      [...new Set(chosen.flatMap(filesOf))],
      [...new Set(chosen.flatMap(namesOf))],
    )
    if (baseline === 'hung') throw new Error('The tests hang without any mutation')
    for (const mutation of chosen) {
      for (const { file, name } of named(mutation, baseline).filter((outcome) => outcome.failed)) {
        throw new Error(`${file} › ${name} fails without "${mutation.name}"`)
      }
    }
    for (const [index, mutation] of chosen.entries()) {
      const started = performance.now()
      const ran = under(mutation, () => runTests(filesOf(mutation), namesOf(mutation)))
      // A test that hangs does not pass.
      const passed = ran === 'hung' ? [] : named(mutation, ran).filter((outcome) => !outcome.failed)
      const seconds = ((performance.now() - started) / 1000).toFixed(1)
      const verdict = ran === 'hung' ? 'killed (the tests hang)' : passed.length === 0 ? 'killed' : 'SURVIVED'
      console.log(`${verdict} [${index + 1}/${chosen.length}] ${mutation.name} (${seconds}s)`)
      for (const { file, name } of passed) console.log(`  passes under it: ${file} › ${name}`)
      if (passed.length > 0) survived++
    }
  }
} finally {
  fs.rmSync(copy, { recursive: true, force: true })
  // Left to another process still running, when it is not empty.
  try {
    fs.rmdirSync(path.dirname(copy))
  } catch {}
}
if (survived > 0) {
  console.error(`\n${survived} of ${chosen.length} mutations survived a test that must kill them`)
  process.exit(1)
}
