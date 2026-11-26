// Checks the package as a consumer outside Bun gets it: packs it, installs the tarball with npm in a project of its
// own outside the repository, runs the README's quick start and `consumer.ts` with Node (the `default` condition,
// `dist/`), and typechecks both against the declarations (`types`) under each TypeScript of `--typescript`, with
// `moduleResolution` `nodenext` and `bundler`, emitting their own, and bounds what each prints of the errors of
// `misprint.ts`. Under Bun the `bun` condition loads `src/`: nothing else imports `dist/`. It parses `dist/` at the
// syntax the README promises, and checks that the documentation the package ships finds in it every file it links.
// Then it installs the renderers, which the package takes as optional peers, and runs and typechecks `bridges.ts`, a
// consumer of the bridges, the same way.
//
//   bun tools/smoke/smoke.ts [--effect <version>] [--typescript 5.9,6.0,7.0] [--keep]
//   bun tools/smoke/smoke.ts --help     the same, as the command describes itself
import { parse } from "acorn"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Opt from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import { exec, Failed, main, repository, step } from "../cli.ts"

// Whether a node of an ESTree, or any node under it, is a class's `static {}` block.
const staticBlockIn = (node: unknown): boolean =>
  typeof node === "object" && node !== null &&
  ((node as { readonly type?: unknown }).type === "StaticBlock" || Object.values(node).some(staticBlockIn))

const readJson = Effect.fnUntraced(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return JSON.parse(yield* fs.readFileString(path))
})

// What `program`, its functions and `rehearse` give is named, not spelled out: spelled out, it repeats the state for
// each of its types.
const named = [
  "ProgramMaker",
  "DeclareChild",
  "DeclareChildById",
  "MakeProgram",
  "Child",
  "ChildById",
  "Rehearsal"
]

// How often the consumer's state is spelled out, by a field of its own: once for each place a declaration holds it,
// 13 with each supported TypeScript: the alias `State`; `children` six times, once for each child; `app` twice, in
// its own state, inside `Kept`, and in its model, which has the field too; `served` once; `copied`, which spells out
// its program, three times. An equality, not a bound: an export added to `consumer.ts`
// changes it, and its count is read from the declarations and explained here, never raised to pass. A type of the
// library that repeats the state inside each of its own multiplies it (80 when `make` was spelled out, 25 when `Child`
// and `Step` were, 16 with `DeclareChild<State>`, in `docs/rejected.md`).
const expectedSpellings = 13

// What TypeScript prints of the errors of `misprint.ts`, at most, in bytes: about 5,400 with each supported TypeScript.
// A bound, not an equality: how a type prints is the compiler's, and changes with it. The children's programs printed
// with a parent's types, and a program with what `CommandOf` read of it, gave 45,924.
const misprintBound = 7000

// What is wrong in what a consumer's TypeScript prints of the errors of `misprint.ts`, as the lines to print.
const misprintProblemsOf = (printed: string) => {
  const problems: Array<string> = []
  const errors = printed.match(/^misprint\.ts\(\d+,\d+\): error TS\d+:/gm)?.length ?? 0
  const total = printed.match(/error TS/g)?.length ?? 0
  if (errors !== 4 || total !== 4) {
    problems.push(`misprint.ts has ${errors} errors of its own and ${total} in all, not 4 and 4:\n${printed}`)
  }
  const programs = printed.match(/\bProgram</g)?.length ?? 0
  if (programs > 0) problems.push(`misprint.ts prints a program ${programs} times`)
  const bytes = new TextEncoder().encode(printed).length
  if (bytes > misprintBound) problems.push(`misprint.ts prints ${bytes} bytes, more than ${misprintBound}`)
  return problems
}

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
  // A program is named `Program<…>` wherever the library holds one, as `Child<…>` does: spelled out, it shows its
  // `makeModel`. Only `copied`, a copy, spells itself out.
  const programs = declared.match(/\bmakeModel: /g)?.length ?? 0
  if (programs > 1) problems.push(`consumer.d.ts spells out a program ${programs} times, more than once`)
  // A program `make` returns names the types it has, not the others as `never`.
  const nevers = declared.match(/^\s+(command|commandServices|subscriptionServices|event|external|flags): never;$/gm)
    ?.length ?? 0
  if (nevers > 0) problems.push(`consumer.d.ts names ${nevers} types of a program as never`)
  return problems
}

// The project of the consumer, in a directory of its own, which `--keep` leaves for a look.
const consumerDirectory = Effect.fnUntraced(function*(keep: boolean) {
  const fs = yield* FileSystem.FileSystem
  return yield* Effect.acquireRelease(
    fs.makeTempDirectory({ prefix: "effect-tea-smoke-" }),
    (dir) => keep ? Console.log(`kept ${dir}`) : Effect.orDie(fs.remove(dir, { recursive: true, force: true }))
  )
})

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
    const fs = yield* FileSystem.FileSystem
    const { join } = yield* Path.Path
    const root = yield* repository
    const effect = Opt.isSome(chosen)
      ? chosen.value
      : (yield* readJson(join(root, "node_modules/effect/package.json"))).version
    const dir = yield* consumerDirectory(keep)
    yield* step(root, "bun", ["pm", "pack", "--quiet", "--destination", dir])
    const [tarball] = yield* fs.glob("*.tgz", { root: dir })
    yield* fs.writeFileString(
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
    const readme = yield* fs.readFileString(join(root, "README.md"))
    const quickStart = /^## Quick start$[\s\S]*?^```ts$\n([\s\S]*?)^```$/m.exec(readme)?.[1]
    if (quickStart === undefined) return yield* new Failed({ message: "The README has no quick start" })
    yield* fs.writeFileString(join(dir, "quickstart.ts"), quickStart)
    yield* fs.copyFile(join(import.meta.dir, "consumer.ts"), join(dir, "consumer.ts"))
    yield* fs.copyFile(join(import.meta.dir, "misprint.ts"), join(dir, "misprint.ts"))
    // `nodenext` without `exactOptionalPropertyTypes`, `bundler` with it: consumers use both.
    for (const [resolution, module, exact] of [["nodenext", "nodenext", false], ["bundler", "esnext", true]] as const) {
      yield* fs.writeFileString(
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
    yield* fs.writeFileString(
      join(dir, "tsconfig.misprint.json"),
      JSON.stringify({
        extends: "./tsconfig.bundler.json",
        compilerOptions: { declaration: false, emitDeclarationOnly: false, noEmit: true, noErrorTruncation: true },
        files: ["misprint.ts"]
      })
    )
    yield* step(dir, "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"])
    yield* Console.log(`effect ${effect}, @fgaudo/effect-tea from ${tarball}`)
    // TypeScript resolves a `.ts` import of a declaration to its `.d.ts` by itself, so no typecheck below would notice
    // a broken rewrite in `tools/build.ts`; other tools that read declarations do not.
    const installed = join(dir, "node_modules/@fgaudo/effect-tea/dist")
    const tsImport = /from\s+["']\.{1,2}\/[^"']*\.ts["']|import\(["']\.{1,2}\/[^"']*\.ts["']\)/
    const importing = yield* Effect.findFirst(
      yield* fs.glob("**/*.d.ts", { root: installed }),
      (path) => Effect.map(fs.readFileString(join(installed, path)), (text) => tsImport.test(text))
    )
    if (Opt.isSome(importing)) return yield* new Failed({ message: `dist/${importing.value} imports a .ts file` })
    // The README promises ES2022 with no `static {}` block: the syntax of Effect's own `dist/`, which a toolchain that
    // installs Effect already takes. A block is ES2022 too, so the parser at that level does not refuse one alone.
    for (const path of yield* fs.glob("**/*.js", { root: installed })) {
      const text = yield* fs.readFileString(join(installed, path))
      const refused = yield* Effect.try({
        try: () => staticBlockIn(parse(text, { ecmaVersion: 2022, sourceType: "module" })),
        catch: (error) => new Failed({ message: `dist/${path} is not ES2022: ${String(error)}` })
      })
      if (refused) return yield* new Failed({ message: `dist/${path} has a static {} block` })
    }
    // The guide, the tutorial, the skill and the examples' README are read in the package, at the version installed:
    // what they link relatively, and the files whose code the tutorial includes, must be in it. The root README's links
    // are left out, since npm sends them to the repository.
    const packageRoot = join(dir, "node_modules/@fgaudo/effect-tea")
    const relativeLink =
      /\]\((?!https?:|#|mailto:)([^)#\s]+)|^\[[^\]]+\]: (?!https?:)([^\s#]+)|\{@includeCode ([^}#\s]+)/gm
    const documents = [
      ...yield* fs.glob("site/{guide,tutorial}/*.md", { root: packageRoot }),
      ...yield* fs.glob("skills/*/*.md", { root: packageRoot })
    ]
    if (documents.length === 0) return yield* new Failed({ message: "The package ships no guide, tutorial or skill" })
    for (const path of [...documents, "examples/README.md"]) {
      // Inline code is emptied: a link's text may be code, but code that only shows a tag links nothing.
      const text = (yield* fs.readFileString(join(packageRoot, path))).replace(/`[^`\n]*`/g, "``")
      for (const [, ...targets] of text.matchAll(relativeLink)) {
        const target = targets.find((target) => target !== undefined) ?? ""
        if (!(yield* fs.exists(join(packageRoot, path, "..", target)))) {
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
      const { version: exact } = yield* readJson(join(dir, `node_modules/typescript-${version}/package.json`))
      for (const resolution of ["nodenext", "bundler"]) {
        const tsc = join(dir, `node_modules/typescript-${version}/bin/tsc`)
        const { exitCode, stdout } = yield* exec(
          ChildProcess.make("node", [tsc, "-p", `tsconfig.${resolution}.json`], { cwd: dir })
        )
        const problems = exitCode === 0
          ? problemsOf(yield* fs.readFileString(join(dir, `declarations/${resolution}/consumer.d.ts`)))
          : [stdout]
        yield* Console.log(`typescript ${exact}, ${resolution}: ${problems.length === 0 ? "ok" : "failed"}`)
        if (problems.length > 0) {
          failed.push(`typescript ${exact}, ${resolution}`)
          for (const problem of problems) yield* Console.log(problem)
        }
      }
      const { stdout } = yield* exec(
        ChildProcess.make("node", [
          join(dir, `node_modules/typescript-${version}/bin/tsc`),
          "-p",
          "tsconfig.misprint.json"
        ], {
          cwd: dir
        })
      )
      const problems = misprintProblemsOf(stdout)
      yield* Console.log(`typescript ${exact}, the errors of misprint.ts: ${problems.length === 0 ? "ok" : "failed"}`)
      if (problems.length > 0) {
        failed.push(`typescript ${exact}, the errors of misprint.ts`)
        for (const problem of problems) yield* Console.log(problem)
      }
    }
    if (failed.length > 0) {
      return yield* new Failed({
        message: `The declarations do not typecheck, spell out what program returns, or print too much, with ${
          failed.join("; ")
        }`
      })
    }
    // The renderers are optional peers: installed only now, so that what is checked above needs none of them. React's
    // bridge gets `react` alone, as an application on another renderer of React would install it.
    const renderers = yield* Effect.forEach(
      ["snabbdom", "react", "@types/react"],
      (name) =>
        Effect.map(readJson(join(root, `node_modules/${name}/package.json`)), ({ version }) => `${name}@${version}`)
    )
    yield* step(dir, "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...renderers])
    yield* Console.log(renderers.join(", "))
    yield* fs.copyFile(join(import.meta.dir, "bridges.ts"), join(dir, "bridges.ts"))
    yield* fs.writeFileString(join(dir, "window.ts"), "Object.assign(globalThis, { window: undefined })\n")
    for (const resolution of ["nodenext", "bundler"]) {
      const config: { compilerOptions: object } = yield* readJson(join(dir, `tsconfig.${resolution}.json`))
      yield* fs.writeFileString(
        join(dir, `tsconfig.bridges.${resolution}.json`),
        JSON.stringify({
          compilerOptions: { ...config.compilerOptions, outDir: `declarations/bridges/${resolution}` },
          files: ["bridges.ts"]
        })
      )
    }
    yield* step(dir, "node", ["--import", "./window.ts", "bridges.ts"])
    for (const version of typescripts) {
      for (const resolution of ["nodenext", "bundler"]) {
        const tsc = join(dir, `node_modules/typescript-${version}/bin/tsc`)
        const { exitCode, stdout } = yield* exec(
          ChildProcess.make("node", [tsc, "-p", `tsconfig.bridges.${resolution}.json`], { cwd: dir })
        )
        yield* Console.log(`typescript ${version}, ${resolution}, the bridges: ${exitCode === 0 ? "ok" : "failed"}`)
        if (exitCode !== 0) {
          yield* Console.log(stdout)
          failed.push(`typescript ${version}, ${resolution}`)
        }
      }
    }
    if (failed.length > 0) {
      return yield* new Failed({ message: `The bridges' declarations do not typecheck with ${failed.join("; ")}` })
    }
  }, Effect.scoped)
)

main(command)
