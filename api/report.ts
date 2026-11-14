// Writes the report of the public API, one for each entrypoint of the package, from the declarations of `dist/`
// (`bun run build` first): what `src/index.ts` and `src/testing/index.ts` export, and every type of the library they
// reach without exporting it, since a change of one changes what a consumer writes as well. The reports are
// committed, so that a change of the API shows in the diff. `--check` writes nothing, and fails when a report differs
// from the declarations, as the CI runs it.
//
//   bun api/report.ts [--check]
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
  ExtractorMessageCategory,
  type ExtractorMessage,
} from '@microsoft/api-extractor'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..')
const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } })
const entrypoints = [
  { name: 'effect-tea', declarations: 'dist/index.d.ts' },
  { name: 'effect-tea-testing', declarations: 'dist/testing/index.d.ts' },
]
// What the analysis finds wrong in the declarations; the messages of the report itself (written, or out of date) are
// of the `console` category, and decided below.
const problems: Array<ExtractorMessage> = []
let stale = false
for (const { name, declarations } of entrypoints) {
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: root,
      // As every file of the repository, on Windows too: api-extractor's default is CRLF.
      newlineKind: 'lf',
      mainEntryPointFilePath: join(root, declarations),
      compiler: { tsconfigFilePath: join(root, 'tsconfig.build.json') },
      apiReport: {
        enabled: true,
        reportFileName: name,
        reportFolder: import.meta.dir,
        reportTempFolder: join(root, 'node_modules/.api'),
        includeForgottenExports: true,
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: {
        // The report is for the diff, and these are the library's choices: every export is public, a type the API
        // reaches without exporting it stays internal (`change-api`), and the doc comments are checked by TypeDoc, for
        // the site, where one comment may document a group of exports.
        extractorMessageReporting: {
          default: { logLevel: ExtractorLogLevel.Warning },
          'ae-missing-release-tag': { logLevel: ExtractorLogLevel.None },
          'ae-forgotten-export': { logLevel: ExtractorLogLevel.None, addToApiReportFile: false },
          'ae-undocumented': { logLevel: ExtractorLogLevel.None, addToApiReportFile: false },
        },
        tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } },
      },
    },
    configObjectFullPath: join(import.meta.dir, 'report.json'),
    packageJsonFullPath: join(root, 'package.json'),
  })
  const result = Extractor.invoke(config, {
    localBuild: !values.check,
    messageCallback: (message) => {
      if (
        message.category !== ExtractorMessageCategory.Console &&
        (message.logLevel === ExtractorLogLevel.Error || message.logLevel === ExtractorLogLevel.Warning)
      )
        problems.push(message)
    },
  })
  if (values.check && result.apiReportChanged) {
    stale = true
    console.error(`The API of ${declarations} differs from api/${name}.api.md: run \`bun run api\` and commit it.`)
  }
}
if (problems.length > 0 || stale) process.exit(1)
