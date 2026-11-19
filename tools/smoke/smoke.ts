// Checks the package as a consumer outside Bun gets it: packs it, installs the tarball with npm in a project of its
// own outside the repository, runs the README's quick start and `consumer.ts` with Node (the `default` condition,
// `dist/`), and typechecks both against the declarations (`types`) under each TypeScript of `--typescript`, with
// `moduleResolution` `nodenext` and `bundler`, emitting their own. Under Bun the `bun` condition loads `src/`:
// nothing else imports `dist/`. It also checks that the documentation the package ships finds in it every file it
// links.
//
//   bun tools/smoke/smoke.ts [--effect <version>] [--typescript 5.9,6.0,7.0] [--keep]
import { $, Glob } from "bun"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"

const root = join(import.meta.dir, "../..")
const { values } = parseArgs({
  options: {
    // The Effect the consumer installs: by default the repository's own.
    effect: { type: "string" },
    // The oldest TypeScript the package supports (the README's "Installation" states it, as Effect's minimum), and
    // the newer ones.
    typescript: { type: "string", default: "5.9,6.0,7.0" },
    keep: { type: "boolean", default: false }
  }
})
const effect = values.effect ?? (await Bun.file(join(root, "node_modules/effect/package.json")).json()).version
const typescripts = values.typescript.split(",")
const dir = await mkdtemp(join(tmpdir(), "effect-tea-smoke-"))
try {
  await $`bun pm pack --quiet --destination ${dir}`.cwd(root)
  const [tarball] = await Array.fromAsync(new Glob("*.tgz").scan({ cwd: dir }))
  await Bun.write(
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
  const readme = await Bun.file(join(root, "README.md")).text()
  const quickStart = /^## Quick start$[\s\S]*?^```ts$\n([\s\S]*?)^```$/m.exec(readme)?.[1]
  if (quickStart === undefined) throw new Error("The README has no quick start")
  await Bun.write(join(dir, "quickstart.ts"), quickStart)
  await Bun.write(join(dir, "consumer.ts"), Bun.file(join(import.meta.dir, "consumer.ts")))
  // `nodenext` without `exactOptionalPropertyTypes`, `bundler` with it: consumers use both.
  for (const [resolution, module, exact] of [["nodenext", "nodenext", false], ["bundler", "esnext", true]] as const) {
    await Bun.write(
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
  await $`npm install --no-audit --no-fund --loglevel=error`.cwd(dir)
  console.log(`effect ${effect}, @fgaudo/effect-tea from ${tarball}`)
  // TypeScript resolves a `.ts` import of a declaration to its `.d.ts` by itself, so no typecheck below would
  // notice a broken rewrite in `tools/build.ts`; other tools that read declarations do not.
  const installed = join(dir, "node_modules/@fgaudo/effect-tea/dist")
  const tsImport = /from\s+'\.{1,2}\/[^']*\.ts'|import\("\.{1,2}\/[^"]*\.ts"\)/
  for await (const path of new Glob("**/*.d.ts").scan({ cwd: installed })) {
    if (tsImport.test(await Bun.file(join(installed, path)).text())) {
      throw new Error(`dist/${path} imports a .ts file`)
    }
  }
  // The guide, the tutorial and the skill are read in the package, at the version installed: what they link
  // relatively, and the files whose code the tutorial includes, must be in it. The README's links are left out, since
  // npm sends them to the repository.
  const packageRoot = join(dir, "node_modules/@fgaudo/effect-tea")
  const relativeLink =
    /\]\((?!https?:|#|mailto:)([^)#\s]+)|^\[[^\]]+\]: (?!https?:)([^\s#]+)|\{@includeCode ([^}#\s]+)/gm
  const documents = [
    ...(await Array.fromAsync(new Glob("site/{guide,tutorial}/*.md").scan({ cwd: packageRoot }))),
    ...(await Array.fromAsync(new Glob("skills/*/*.md").scan({ cwd: packageRoot })))
  ]
  if (documents.length === 0) throw new Error("The package ships no guide, tutorial or skill")
  for (const path of documents) {
    // Inline code is emptied: a link's text may be code, but code that only shows a tag links nothing.
    const text = (await Bun.file(join(packageRoot, path)).text()).replace(/`[^`\n]*`/g, "``")
    for (const [, ...targets] of text.matchAll(relativeLink)) {
      const target = targets.find((target) => target !== undefined) ?? ""
      if (!existsSync(join(packageRoot, path, "..", target))) throw new Error(`${path} links ${target}, not packed`)
    }
  }
  const logged = await $`node quickstart.ts`.cwd(dir).text()
  const counts = logged.trim().split("\n").map((line) => line.trim().split(" ").at(-1))
  if (counts.join() !== "0,1,2,3") {
    throw new Error(`The quick start logged:\n${logged}`)
  }
  console.log("node: the quick start ran")
  await $`node consumer.ts`.cwd(dir)
  const failed: Array<string> = []
  for (const version of typescripts) {
    const { version: exact } = await Bun.file(join(dir, `node_modules/typescript-${version}/package.json`)).json()
    for (const resolution of ["nodenext", "bundler"]) {
      const tsc = join(dir, `node_modules/typescript-${version}/bin/tsc`)
      const { exitCode, stdout } = await $`node ${tsc} -p tsconfig.${resolution}.json`.cwd(dir).nothrow().quiet()
      // What `program`, its functions and `rehearse` give is named, not spelled out: spelled out, it repeats the state
      // for each of its types.
      const declared = exitCode === 0
        ? await Bun.file(join(dir, `declarations/${resolution}/consumer.d.ts`)).text()
        : ""
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
      // At a word's start: `DeclareChild<` is no `Child<`.
      const unnamed = named.filter((name) => !new RegExp(`\\b${name}<`).test(declared))
      // How often the consumer's state is spelled out, by a field of its own: once for each place a declaration holds
      // it, 12 with each supported TypeScript: the alias `State`; `children` and `inputs` twice each, once for each
      // child or input; `app` twice, in its state and in its model, which has the field too; `quietChild` and `served`
      // once each; `copied`, which spells out its program, three times. An equality, not a bound: an export added to
      // `consumer.ts` changes it, and its count is read from the declarations and explained here, never raised to pass.
      // A type of the library that repeats the state inside each of its own multiplies it (80 when `make` was spelled
      // out, 25 when `Child` and `Step` were, 16 with `DeclareChild<State>`, in `docs/rejected.md`).
      const expectedSpellings = 12
      const spelled = declared.match(/\bfulls\b/g)?.length ?? 0
      // A program is named `Program<…>` wherever the library holds one, as `Child<…>` does: spelled out, it shows the
      // key of its external messages. Only `copied`, a copy, spells itself out.
      const programs = declared.match(/~@fgaudo\/effect-tea\/Program\/external/g)?.length ?? 0
      // A program `make` returns names the types it has, not the others as `never`.
      const never = /^\s+(command|commandServices|subscriptionServices|event|external|flags): never;$/gm
      const nevers = declared.match(never)?.length ?? 0
      const ok = exitCode === 0 && unnamed.length === 0 && spelled === expectedSpellings && programs <= 1
        && nevers === 0
      console.log(`typescript ${exact}, ${resolution}: ${ok ? "ok" : "failed"}`)
      if (exitCode !== 0) {
        failed.push(`typescript ${exact}, ${resolution}`)
        console.log(stdout.toString())
      } else if (!ok) {
        failed.push(`typescript ${exact}, ${resolution}`)
        if (unnamed.length > 0) console.log(`consumer.d.ts spells out ${unnamed.join(", ")}`)
        if (spelled !== expectedSpellings) {
          console.log(`consumer.d.ts spells out the state ${spelled} times, not ${expectedSpellings}`)
        }
        if (programs > 1) console.log(`consumer.d.ts spells out a program ${programs} times, more than once`)
        if (nevers > 0) console.log(`consumer.d.ts names ${nevers} types of a program as never`)
      }
    }
  }
  if (failed.length > 0) {
    throw new Error(`The declarations do not typecheck, or spell out what program returns, with ${failed.join("; ")}`)
  }
} finally {
  if (values.keep) console.log(`kept ${dir}`)
  else await rm(dir, { recursive: true, force: true })
}
