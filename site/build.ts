// Builds the documentation site into `site/dist/`: the API reference generated from `src/`, with the README as
// its home page and its diagrams drawn by `mermaid.ts`, the guide of `guide/`, the tutorial of `tutorial/`, and
// the examples bundled to run in the browser under `examples/<name>/`.
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
// The guide and the tutorial link the repository's files relatively, as the package that ships them all resolves
// them. Here they are built from a copy one directory deeper: a link into the repository goes to it at the built
// commit, and an included file is one `../` further away.
for (const path of await Array.fromAsync(new Glob('{guide,tutorial}/*.md').scan({ cwd: here }))) {
  const text = (await Bun.file(`${here}/${path}`).text())
    .replace(/(\]\(|^\[[^\]]+\]: )\.\.\/\.\.\//gm, `$1https://github.com/fgaudo/effect-tea/tree/${revision}/`)
    .replaceAll('{@includeCode ../../', '{@includeCode ../../../')
  await Bun.write(`${here}/.build/${path}`, text)
}
await $`bun build custom.ts --outfile .build/custom.js --format iife --target browser --minify`.cwd(here)
await $`bunx typedoc --readme .build/README.md --gitRevision ${revision}`.cwd(here)
// Split, so that a page loads only the kinds of diagram it draws.
await $`bun build mermaid.ts --outdir ${dist}/assets/mermaid --splitting --target browser --minify`.cwd(here)
// The examples import the package by its name, which a browser bundle resolves to the package's `dist/`.
await $`bun run build`.cwd(root)
const examples = await Array.fromAsync(new Glob('examples/*/index.html').scan({ cwd: root, absolute: true }))
// The root is named: left to `bun build`, on Windows the examples land under `_.._/examples/`.
await $`bun build ${examples} --root ${root}/examples --outdir ${dist}/examples --minify`
