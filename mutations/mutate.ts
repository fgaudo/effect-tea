// Applies each mutation of `mutations.ts` to a copy of the repository, one at a time, runs each test it names alone,
// in a process of its own, and fails when one of them passes, or fails alone without it: a check whose removal no
// test notices is held by none, and a test that fails only beside others of its file holds nothing.
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

// `title` is what `bun test -t` matches: the names of the enclosing `describe`s, outermost first, and the test's,
// joined by spaces.
type Outcome = Readonly<{ file: string; name: string; title: string; failed: boolean }>

type Killer = Mutation['killedBy'][number]

const decode = (text: string) =>
  text.replace(/&(quot|apos|lt|gt|amp);/g, (_, entity: string) =>
    ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[entity] as string)

const attributes = (text: string) =>
  Object.fromEntries(Array.from(text.matchAll(/(\w+)="([^"]*)"/g), ([, key, value]) => [key, decode(value ?? '')]))

// What bun's JUnit report says of each test that ran: skipped and `todo` tests are left out. Its `classname` lists
// the enclosing `describe`s innermost first, joined by ' > '.
const outcomes = (report: string): ReadonlyArray<Outcome> =>
  Array.from(report.matchAll(/<testcase\s([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)).flatMap(([, head, body]) => {
    if (body?.includes('<skipped')) return []
    const { name = '', file = '', classname = '' } = attributes(head ?? '')
    const describes = classname === '' ? [] : classname.split(' > ').reverse()
    return [{
      file: file.replaceAll('\\', '/'),
      name,
      title: [...describes, name].join(' '),
      failed: body?.includes('<failure') ?? false,
    }]
  })

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// No test takes more than half a minute: a process that lasts longer hangs, which no report says of its test.
const patience = 60 * 1000

// Runs `files` in the copy, only the test whose title is `title` when given, and returns what each did, or that it
// hung.
const runTests = (files: ReadonlyArray<string>, title?: string): ReadonlyArray<Outcome> | 'hung' => {
  const report = path.join(copy, 'report.xml')
  fs.rmSync(report, { force: true })
  // Anchored, since `-t` runs every test whose title the pattern finds anywhere in it.
  const filter = title === undefined ? [] : ['-t', `^${escape(title)}$`]
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

const describe = ([file, name]: Killer) => `${file} › ${name}`

// The title of each killer of `chosen`, found by a run of their files whole: each must have run exactly once, so that
// a renamed or removed test is an error of the list, and be the only test of its file with its title, so that a run
// of it alone runs it only.
const titlesOf = (chosen: ReadonlyArray<Mutation>): ReadonlyMap<string, string> => {
  const killers = chosen.flatMap((mutation) => mutation.killedBy)
  const ran = runTests([...new Set(killers.map(([file]) => file))])
  if (ran === 'hung') throw new Error('The files of the tests hang without any mutation')
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

// Runs `killer` alone, in a process of its own: a test that hangs does not pass.
const alone = (titles: ReadonlyMap<string, string>, killer: Killer): 'passed' | 'failed' | 'hung' => {
  const title = titles.get(describe(killer)) as string
  const ran = runTests([killer[0]], title)
  if (ran === 'hung') return 'hung'
  if (ran.length !== 1 || (ran[0] as Outcome).title !== title) {
    throw new Error(`A run of ${describe(killer)} alone ran ${ran.length} tests`)
  }
  return (ran[0] as Outcome).failed ? 'failed' : 'passed'
}

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
    const titles = titlesOf(chosen)
    // Each test must pass alone without its mutation, or its failure under it says nothing.
    const killers = new Map(chosen.flatMap((mutation) => mutation.killedBy.map((killer) => [describe(killer), killer])))
    for (const killer of killers.values()) {
      const outcome = alone(titles, killer)
      if (outcome !== 'passed') throw new Error(`${describe(killer)} ${outcome} alone without any mutation`)
    }
    for (const [index, mutation] of chosen.entries()) {
      const started = performance.now()
      const ran = under(mutation, () => mutation.killedBy.map((killer) => [killer, alone(titles, killer)] as const))
      const passed = ran.filter(([, outcome]) => outcome === 'passed')
      const hung = ran.filter(([, outcome]) => outcome === 'hung')
      const seconds = ((performance.now() - started) / 1000).toFixed(1)
      const verdict = passed.length === 0 ? 'killed' : 'SURVIVED'
      console.log(`${verdict} [${index + 1}/${chosen.length}] ${mutation.name} (${seconds}s)`)
      for (const [killer] of hung) console.log(`  hangs under it: ${describe(killer)}`)
      for (const [killer] of passed) console.log(`  passes under it: ${describe(killer)}`)
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
