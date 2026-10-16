// Builds `dist/`: JavaScript and declarations for consumers that do not compile TypeScript sources.
// `tsc` rewrites relative `.ts` imports to `.js` in the JavaScript it emits, but not in the declarations,
// so they are rewritten here: otherwise a consumer's TypeScript would look for `.ts` files `dist/` lacks.
import { $, Glob } from 'bun'

const dist = `${import.meta.dir}/dist`
await $`rm -rf ${dist}`
// Resolved as a dependency: lifecycle scripts (e.g. `prepack`) do not see the workspace's binaries.
const tsc = Bun.resolveSync('typescript/package.json', import.meta.dir).replace(/package\.json$/, 'bin/tsc')
await $`bun ${tsc} -p tsconfig.build.json`.cwd(import.meta.dir)
for await (const path of new Glob('**/*.d.ts').scan({ cwd: dist, absolute: true })) {
  await Bun.write(path, (await Bun.file(path).text()).replace(/(from\s+'\.{1,2}\/[^']*)\.ts'/g, "$1.js'"))
}
