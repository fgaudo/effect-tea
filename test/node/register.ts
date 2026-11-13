// Imported by Node before the tests (`bun run test:node`): every test file imports `bun:test`, which Node
// resolves to the module that gives the same names over its own runner.
import { registerHooks } from 'node:module'

const bunTest = new URL('./bun-test.ts', import.meta.url).href

registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === 'bun:test' ? { url: bunTest, shortCircuit: true } : nextResolve(specifier, context),
})
