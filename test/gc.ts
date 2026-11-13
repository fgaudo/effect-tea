/** A full, synchronous collection: Bun's own, or V8's, which Node exposes under `--expose-gc` (`bun run test:node`). */
export const collectGarbage = (): void => {
  if (typeof Bun !== 'undefined') Bun.gc(true)
  else if (globalThis.gc !== undefined) globalThis.gc()
  else throw new Error('No collector to call: Node needs --expose-gc')
}
