// Checks the package as a consumer outside Bun gets it: packs it, installs the tarball with npm in a project of its
// own outside the repository, runs the README's quick start and `consumer.ts` with Node (the `default` condition,
// `dist/`), and typechecks both against the declarations (`types`) under each TypeScript of `--typescript`, with
// `moduleResolution` `nodenext` and `bundler`, emitting their own. Under Bun the `bun` condition loads `src/`:
// nothing else imports `dist/`. It also checks that the documentation the package ships finds in it every file it
// links.
//
//   bun tools/smoke/smoke.ts [--effect <version>] [--typescript 5.9,6.0,7.0] [--keep]
//   bun tools/smoke/smoke.ts --help     the same, as the command describes itself
import { Glob } from "bun"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as fs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exec, Failed, main, root } from "../cli.ts"

const readJson = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))

const scan = (pattern: string, cwd: string) => [...new Glob(pattern).scanSync({ cwd })]

// A process whose output shows as it runs, as a step of the check: one that fails fails the check.
const step = Effect.fnUntraced(function*(cwd: string, command: string, args: ReadonlyArray<string>) {
  const { exitCode } = yield* exec(ChildProcess.make(command, args, { cwd, stdout: "inherit", stderr: "inherit" }))
  if (exitCode !== 0) return yield* new Failed({ message: `${command} ${args.join(" ")} exited with ${exitCode}` })
})

// What `program`, its functions and `rehearse` give is named, not spelled out: spelled out, it repeats the state for
// each of its types.
const named = [
  "ProgramMaker",
  "DeclareChild",
  "DeclareChildById",
  "DeclareInput",
  "DeclareInputById",
  "MakeProgram",
  "Child",
  "ChildById",
  "Input",
  "InputById",
  "Rehearsal"
]

// How often the consumer's state is spelled out, by a field of its own: once for each place a declaration holds it,
// 12 with each supported TypeScript: the alias `State`; `children` and `inputs` twice each, once for each child or
// input; `app` twice, in its state and in its model, which has the field too; `quietChild` and `served` once each;
// `copied`, which spells out its program, three times. An equality, not a bound: an export added to `consumer.ts`
// changes it, and its count is read from the declarations and explained here, never raised to pass. A type of the
// library that repeats the state inside each of its own multiplies it (80 when `make` was spelled out, 25 when `Child`
// and `Step` were, 16 with `DeclareChild<State>`, in `docs/rejected.md`).
const expectedSpellings = 12

// What is wrong in the declarations a consumer's TypeScript emits, as the lines to print.
const problemsOf = (declared: string) => {
  const problems: Array<string> = []
  // At a word's start: `DeclareChild<` is no `Child<`.
  const unnamed = named.filter((name) => !new RegExp(`\\b${name}<`).test(declared))
  if (unnamed.length > 0) problems.push(`consumer.d.ts spells out ${unnamed.join(", ")}`)
  const spelled = declared.match(/\bfulls\b/g)?.length ?? 0
  if (spelled !== expectedSpellings) {
    problems.push(`consumer.d.ts spells out the state ${spelled} times, not ${expectedSpellings}`)
  }
  // A program is named `Program<…>` wherever the library holds one, as `Child<…>` does: spelled out, it shows the key
  // of its external messages. Only `copied`, a copy, spells itself out.
  const programs = declared.match(/~@fgaudo\/effect-tea\/Program\/external/g)?.length ?? 0
  if (programs > 1) problems.push(`consumer.d.ts spells out a program ${programs} times, more than once`)
  // A program `make` returns names the types it has, not the others as `never`.
  const nevers = declared.match(/^\s+(command|commandServices|subscriptionServices|event|external|flags): never;$/gm)
    ?.length ?? 0
  if (nevers > 0) problems.push(`consumer.d.ts names ${nevers} types of a program as never`)
  return problems
}

// The project of the consumer, in a directory of its own, which `--keep` leaves for a look.
const consumerDirectory = (keep: boolean) =>
  Effect.acquireRelease(
    Effect.sync(() => fs.mkdtempSync(join(tmpdir(), "effect-tea-smoke-"))),
    (dir) => keep ? Console.log(`kept ${dir}`) : Effect.sync(() => fs.rmSync(dir, { recursive: true, force: true }))
  )

const command = Command.make(
  "smoke",
  {
    effect: Flag.String("effect").pipe(
      Flag.withDescription("The version of Effect the consumer installs: the repository's own when none is given"),
      Flag.optional
    ),
    // The oldest TypeScript the package supports (the README's "Installation" states it, as Effect's minimum), and the
    // newer ones.
    typescript: Flag.String("typescript").pipe(
      Flag.withDescription("The versions of TypeScript the declarations are checked with, separated by commas"),
      Flag.withDefault("5.9,6.0,7.0"),
      Flag.map((versions) => versions.split(","))
    ),
    keep: Flag.Boolean("keep").pipe(
      Flag.withDescription("Leaves the project of the consumer, and prints where it is"),
      Flag.withDefault(false)
    )
  },
  Effect.fnUntraced(function*({ effect: chosen, keep, typescript: typescripts }) {
    const effect = Opt.getOrElse(chosen, () => readJson(join(root, "node_modules/effect/package.json")).version)
    const dir = yield* consumerDirectory(keep)
    yield* step(root, "bun", ["pm", "pack", "--quiet", "--destination", dir])
    const [tarball] = scan("*.tgz", dir)
    fs.writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "smoke",
        private: true,
        type: "module",
        dependencies: {
          "@fgaudo/effect-tea": `file:./${tarball}`,
          effect,
          ...Object.fromEntries(typescripts.map((version) => [`typescript-${version}`, `npm:typescript@~${version}`]))
        }
      })
    )
    const readme = fs.readFileSync(join(root, "README.md"), "utf8")
    const quickStart = /^## Quick start$[\s\S]*?^```ts$\n([\s\S]*?)^```$/m.exec(readme)?.[1]
    if (quickStart === undefined) return yield* new Failed({ message: "The README has no quick start" })
    fs.writeFileSync(join(dir, "quickstart.ts"), quickStart)
    fs.copyFileSync(join(import.meta.dir, "consumer.ts"), join(dir, "consumer.ts"))
    // `nodenext` without `exactOptionalPropertyTypes`, `bundler` with it: consumers use both.
    for (const [resolution, module, exact] of [["nodenext", "nodenext", false], ["bundler", "esnext", true]] as const) {
      fs.writeFileSync(
        join(dir, `tsconfig.${resolution}.json`),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            lib: ["ESNext", "DOM"],
            module,
            moduleResolution: resolution,
            strict: true,
            exactOptionalPropertyTypes: exact,
            verbatimModuleSyntax: true,
            skipLibCheck: false,
            // As a package that publishes a program would: a type its declarations cannot name fails.
            declaration: true,
            emitDeclarationOnly: true,
            outDir: `declarations/${resolution}`,
            types: []
          },
          files: ["quickstart.ts", "consumer.ts"]
        })
      )
    }
    yield* step(dir, "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"])
    yield* Console.log(`effect ${effect}, @fgaudo/effect-tea from ${tarball}`)
    // TypeScript resolves a `.ts` import of a declaration to its `.d.ts` by itself, so no typecheck below would notice
    // a broken rewrite in `tools/build.ts`; other tools that read declarations do not.
    const installed = join(dir, "node_modules/@fgaudo/effect-tea/dist")
    const tsImport = /from\s+'\.{1,2}\/[^']*\.ts'|import\("\.{1,2}\/[^"]*\.ts"\)/
    const importing = scan("**/*.d.ts", installed).find((path) =>
      tsImport.test(fs.readFileSync(join(installed, path), "utf8"))
    )
    if (importing !== undefined) return yield* new Failed({ message: `dist/${importing} imports a .ts file` })
    // The guide, the tutorial and the skill are read in the package, at the version installed: what they link
    // relatively, and the files whose code the tutorial includes, must be in it. The README's links are left out, since
    // npm sends them to the repository.
    const packageRoot = join(dir, "node_modules/@fgaudo/effect-tea")
    const relativeLink =
      /\]\((?!https?:|#|mailto:)([^)#\s]+)|^\[[^\]]+\]: (?!https?:)([^\s#]+)|\{@includeCode ([^}#\s]+)/gm
    const documents = [...scan("site/{guide,tutorial}/*.md", packageRoot), ...scan("skills/*/*.md", packageRoot)]
    if (documents.length === 0) return yield* new Failed({ message: "The package ships no guide, tutorial or skill" })
    for (const path of documents) {
      // Inline code is emptied: a link's text may be code, but code that only shows a tag links nothing.
      const text = fs.readFileSync(join(packageRoot, path), "utf8").replace(/`[^`\n]*`/g, "``")
      for (const [, ...targets] of text.matchAll(relativeLink)) {
        const target = targets.find((target) => target !== undefined) ?? ""
        if (!fs.existsSync(join(packageRoot, path, "..", target))) {
          return yield* new Failed({ message: `${path} links ${target}, not packed` })
        }
      }
    }
    const quick = yield* exec(ChildProcess.make("node", ["quickstart.ts"], { cwd: dir, stderr: "inherit" }))
    const counts = quick.stdout.trim().split("\n").map((line) => line.trim().split(" ").at(-1))
    if (quick.exitCode !== 0 || counts.join() !== "0,1,2,3") {
      return yield* new Failed({
        message: `The quick start exited with ${quick.exitCode}, and logged:\n${quick.stdout}`
      })
    }
    yield* Console.log("node: the quick start ran")
    yield* step(dir, "node", ["consumer.ts"])
    const failed: Array<string> = []
    for (const version of typescripts) {
      const { version: exact } = readJson(join(dir, `node_modules/typescript-${version}/package.json`))
      for (const resolution of ["nodenext", "bundler"]) {
        const tsc = join(dir, `node_modules/typescript-${version}/bin/tsc`)
        const { exitCode, stdout } = yield* exec(
          ChildProcess.make("node", [tsc, "-p", `tsconfig.${resolution}.json`], { cwd: dir })
        )
        const problems = exitCode === 0
          ? problemsOf(fs.readFileSync(join(dir, `declarations/${resolution}/consumer.d.ts`), "utf8"))
          : [stdout]
        yield* Console.log(`typescript ${exact}, ${resolution}: ${problems.length === 0 ? "ok" : "failed"}`)
        if (problems.length > 0) {
          failed.push(`typescript ${exact}, ${resolution}`)
          for (const problem of problems) yield* Console.log(problem)
        }
      }
    }
    if (failed.length > 0) {
      return yield* new Failed({
        message: `The declarations do not typecheck, or spell out what program returns, with ${failed.join("; ")}`
      })
    }
  }, Effect.scoped)
)

main(command)
