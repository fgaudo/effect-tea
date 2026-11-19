// Writes the report of the public API, one for each entrypoint of the package, from the declarations of `dist/`
// (`bun run build` first): what `src/index.ts` and `src/testing/index.ts` export, and every type of the library they
// reach without exporting it, since a change of one changes what a consumer writes as well. The reports are
// committed, so that a change of the API shows in the diff. `--check` writes nothing, and fails when a report differs
// from the declarations, as the CI runs it.
//
// Both fail on a type of the library that the API reaches and a consumer's declarations could not name: one that a
// module of `dist/` exports and the package does not, which TypeScript would import from that module, a path the
// `exports` of `package.json` do not open (TS2742, TS2883); and an interface, a class or a key that is a
// `unique symbol` that no module exports, which it cannot spell out either (TS4023). A type alias that its module
// keeps to itself is spelled out, and needs nothing. `tools/smoke/` checks the same with the compiler, on what a
// consumer exports.
//
//   bun tools/api-report.ts [--check]
//   bun tools/api-report.ts --help     the same, as the command describes itself
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
  type ExtractorMessage,
  ExtractorMessageCategory
} from "@microsoft/api-extractor"
import { Glob } from "bun"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import { join } from "node:path"
import { Failed, main, root } from "./cli.ts"

const entrypoints = [
  { name: "effect-tea", declarations: "dist/index.d.ts" },
  { name: "effect-tea-testing", declarations: "dist/testing/index.d.ts" }
]
const command = Command.make(
  "api",
  {
    check: Flag.Boolean("check").pipe(
      Flag.withDescription("Writes nothing, and fails when a report differs from the declarations"),
      Flag.withDefault(false)
    )
  },
  Effect.fnUntraced(function*({ check }) {
    // What the analysis finds wrong in the declarations; the messages of the report itself (written, or out of date) are
    // of the `console` category, and decided below.
    const problems: Array<ExtractorMessage> = []
    // The names the API reaches without exporting them: `includeForgottenExports` puts them in the report.
    const forgotten = new Set<string>()
    const failures: Array<string> = []
    for (const { name, declarations } of entrypoints) {
      const config = ExtractorConfig.prepare({
        configObject: {
          projectFolder: root,
          // As every file of the repository, on Windows too: api-extractor's default is CRLF.
          newlineKind: "lf",
          mainEntryPointFilePath: join(root, declarations),
          compiler: { tsconfigFilePath: join(root, "tsconfig.build.json") },
          apiReport: {
            enabled: true,
            reportFileName: name,
            reportFolder: join(root, "api"),
            reportTempFolder: join(root, "node_modules/.api"),
            includeForgottenExports: true
          },
          docModel: { enabled: false },
          dtsRollup: { enabled: false },
          tsdocMetadata: { enabled: false },
          messages: {
            // The report is for the diff, and these are the library's choices: every export is public, a type the API
            // reaches without exporting it stays internal to its module (`change-api`, and below), and the doc comments
            // are checked by TypeDoc, for the site, where one comment may document a group of exports.
            extractorMessageReporting: {
              default: { logLevel: ExtractorLogLevel.Warning },
              "ae-missing-release-tag": { logLevel: ExtractorLogLevel.None },
              "ae-forgotten-export": { logLevel: ExtractorLogLevel.None, addToApiReportFile: false },
              "ae-undocumented": { logLevel: ExtractorLogLevel.None, addToApiReportFile: false }
            },
            tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } }
          }
        },
        configObjectFullPath: join(root, "api/report.json"),
        packageJsonFullPath: join(root, "package.json")
      })
      const result = Extractor.invoke(config, {
        localBuild: !check,
        messageCallback: (message) => {
          const name = message.messageId === "ae-forgotten-export" ? /"(\w+)"/.exec(message.text)?.[1] : undefined
          if (name !== undefined) forgotten.add(name)
          if (
            message.category !== ExtractorMessageCategory.Console &&
            (message.logLevel === ExtractorLogLevel.Error || message.logLevel === ExtractorLogLevel.Warning)
          ) {
            problems.push(message)
          }
        }
      })
      if (check && result.apiReportChanged) {
        failures.push(`The API of ${declarations} differs from api/${name}.api.md: run \`bun run api\` and commit it.`)
      }
    }
    const files = yield* Effect.promise(async () =>
      Promise.all(
        (await Array.fromAsync(new Glob("dist/**/*.d.ts").scan({ cwd: root }))).map(async (path) => ({
          path,
          text: await Bun.file(join(root, path)).text()
        }))
      )
    )
    // What one entrypoint forgets, the other may export: `testing` reaches `Update`, which `.` exports.
    const exportedNames = (text: string) =>
      [...text.matchAll(/^export (?:type )?\{([^}]*)\}/gm)].flatMap(([, list = ""]) =>
        list.split(",").map((item) => item.trim().replace(/^type /, "").split(/\s+as\s+/).at(-1) ?? "")
      )
    const exported = new Set(
      files.filter(({ path }) =>
        entrypoints.some((entrypoint) => join(root, entrypoint.declarations) === join(root, path))
      )
        .flatMap(({ text }) => exportedNames(text))
    )
    const unnameable = [
      ...[...forgotten].filter((name) => !exported.has(name)).flatMap((name) =>
        files.flatMap(({ path, text }) => {
          const exported = new RegExp(
            String.raw`^export (declare )?(type|interface|const|class|function) ${name}\b|^export \{[^}]*\b${name}\b`,
            "m"
          )
          const opaque = new RegExp(String.raw`^(declare )?(interface|class) ${name}\b`, "m")
          if (exported.test(text)) {
            return [`${name}, which ${path} exports and the package does not: export it, or keep it local`]
          }
          if (opaque.test(text)) {
            return [`${name}, in ${path}, which TypeScript cannot spell out: export it, or make it a type alias`]
          }
          return []
        })
      ),
      // A key that is a `unique symbol` of a module's own: api-extractor does not list it among what the API reaches.
      ...files.flatMap(({ path, text }) =>
        [...text.matchAll(/^declare const (\w+): unique symbol/gm)]
          .filter(([, name]) => text.includes(`[${name}]`))
          .map(([, name]) => `${name}, a key in ${path} that TypeScript cannot spell out: make it a string`)
      )
    ]
    for (const reason of unnameable) failures.push(`A consumer's declarations cannot name ${reason}.`)
    // api-extractor has printed its own.
    if (problems.length > 0) failures.push(`api-extractor found ${problems.length} problems in the declarations.`)
    if (failures.length > 0) return yield* new Failed({ message: failures.join("\n") })
  })
)

main(command)
