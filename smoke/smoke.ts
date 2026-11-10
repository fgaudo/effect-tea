// Checks the package as a consumer outside Bun gets it: packs it, installs the tarball with npm in a project of its
// own outside the repository, runs the README's quick start and `consumer.ts` with Node (the `default` condition,
// `dist/`), and typechecks both against the declarations (`types`) under each TypeScript of `--typescript`, with
// `moduleResolution` `nodenext` and `bundler`. Under Bun the `bun` condition loads `src/`: nothing else imports
// `dist/`.
//
//   bun smoke/smoke.ts [--effect <version>] [--typescript 5.9,6.0,7.0] [--keep]
import { $, Glob } from 'bun'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..')
const { values } = parseArgs({
  options: {
    // The Effect the consumer installs: by default the repository's own.
    effect: { type: 'string' },
    // The oldest TypeScript the package supports (the README's "Installation" states it, as Effect's minimum), and
    // the newer ones.
    typescript: { type: 'string', default: '5.9,6.0,7.0' },
    keep: { type: 'boolean', default: false },
  },
})
const effect = values.effect ?? (await Bun.file(join(root, 'node_modules/effect/package.json')).json()).version
const typescripts = values.typescript.split(',')
const dir = await mkdtemp(join(tmpdir(), 'effect-tea-smoke-'))
try {
  await $`bun pm pack --quiet --destination ${dir}`.cwd(root)
  const [tarball] = await Array.fromAsync(new Glob('*.tgz').scan({ cwd: dir }))
  await Bun.write(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'smoke',
      private: true,
      type: 'module',
      dependencies: {
        '@fgaudo/effect-tea': `file:./${tarball}`,
        effect,
        ...Object.fromEntries(typescripts.map((version) => [`typescript-${version}`, `npm:typescript@~${version}`])),
      },
    }),
  )
  const readme = await Bun.file(join(root, 'README.md')).text()
  const quickStart = /^## Quick start$[\s\S]*?^```ts$\n([\s\S]*?)^```$/m.exec(readme)?.[1]
  if (quickStart === undefined) throw new Error('The README has no quick start')
  await Bun.write(join(dir, 'quickstart.ts'), quickStart)
  await Bun.write(join(dir, 'consumer.ts'), Bun.file(join(import.meta.dir, 'consumer.ts')))
  // `nodenext` without `exactOptionalPropertyTypes`, `bundler` with it: consumers use both.
  for (const [resolution, module, exact] of [['nodenext', 'nodenext', false], ['bundler', 'esnext', true]] as const) {
    await Bun.write(
      join(dir, `tsconfig.${resolution}.json`),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ESNext', 'DOM'],
          module,
          moduleResolution: resolution,
          strict: true,
          exactOptionalPropertyTypes: exact,
          verbatimModuleSyntax: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
        },
        files: ['quickstart.ts', 'consumer.ts'],
      }),
    )
  }
  await $`npm install --no-audit --no-fund --loglevel=error`.cwd(dir)
  console.log(`effect ${effect}, @fgaudo/effect-tea from ${tarball}`)
  // TypeScript resolves a `.ts` import of a declaration to its `.d.ts` by itself, so no typecheck below would
  // notice a broken rewrite in `build.ts`; other tools that read declarations do not.
  const installed = join(dir, 'node_modules/@fgaudo/effect-tea/dist')
  for await (const path of new Glob('**/*.d.ts').scan({ cwd: installed })) {
    if (/from\s+'\.{1,2}\/[^']*\.ts'/.test(await Bun.file(join(installed, path)).text())) {
      throw new Error(`dist/${path} imports a .ts file`)
    }
  }
  const logged = await $`node quickstart.ts`.cwd(dir).text()
  const counts = logged.trim().split('\n').map((line) => line.trim().split(' ').at(-1))
  if (counts.join() !== '0,1,2,3') {
    throw new Error(`The quick start logged:\n${logged}`)
  }
  console.log('node: the quick start ran')
  await $`node consumer.ts`.cwd(dir)
  const failed: Array<string> = []
  for (const version of typescripts) {
    const { version: exact } = await Bun.file(join(dir, `node_modules/typescript-${version}/package.json`)).json()
    for (const resolution of ['nodenext', 'bundler']) {
      const tsc = join(dir, `node_modules/typescript-${version}/bin/tsc`)
      const { exitCode, stdout } = await $`node ${tsc} -p tsconfig.${resolution}.json`.cwd(dir).nothrow().quiet()
      console.log(`typescript ${exact}, ${resolution}: ${exitCode === 0 ? 'ok' : 'failed'}`)
      if (exitCode !== 0) {
        failed.push(`typescript ${exact}, ${resolution}`)
        console.log(stdout.toString())
      }
    }
  }
  if (failed.length > 0) throw new Error(`The declarations do not typecheck with ${failed.join('; ')}`)
} finally {
  if (values.keep) console.log(`kept ${dir}`)
  else await rm(dir, { recursive: true, force: true })
}
