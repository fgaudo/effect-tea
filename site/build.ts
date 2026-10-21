// Builds the documentation site into `site/dist/`: the API reference generated from `src/`, with the README as
// its home page, and the examples bundled to run in the browser under `examples/<name>/`.
import { $, Glob } from 'bun'

const here = import.meta.dir
const root = `${here}/..`
const dist = `${here}/dist`
const revision = (await $`git rev-parse HEAD`.cwd(root).text()).trim()
// The README's relative links point into the repository, which the site does not contain.
const readme = (await Bun.file(`${root}/README.md`).text()).replace(
  /\]\((?!https?:|#)([^)]+)\)/g,
  `](https://github.com/fgaudo/effect-tea/tree/${revision}/$1)`,
)
await Bun.write(`${here}/.build/README.md`, readme)
await $`bunx typedoc --readme .build/README.md --gitRevision ${revision}`.cwd(here)
// The examples import the package by its name, which a browser bundle resolves to the package's `dist/`.
await $`bun run build`.cwd(root)
const examples = await Array.fromAsync(new Glob('examples/*/index.html').scan({ cwd: root, absolute: true }))
await $`bun build ${examples} --outdir ${dist}/examples --minify`
