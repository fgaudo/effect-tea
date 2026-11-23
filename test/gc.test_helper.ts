import * as V8 from "node:v8"

/** A full, synchronous collection: Bun's own, or V8's, which Node exposes under `--expose-gc` (`bun run test:node`). */
export const collectGarbage = (): void => {
  if (typeof Bun !== "undefined") Bun.gc(true)
  else if (globalThis.gc !== undefined) globalThis.gc()
  else throw new Error("No collector to call: Node needs --expose-gc")
}

// The spaces of V8 that hold the objects a program makes. Its other spaces hold the code that it compiles, and the
// bytecode and data of that code ("trusted"): they grow as functions are optimized, and when depends on how loaded the
// machine is, by tens of kB on a fast one and more on a slow one.
const objectSpaces = new Set(["new_space", "old_space", "new_large_object_space", "large_object_space"])

/** The bytes of the heap that objects use: on V8, without the code it compiles; on Bun, the heap as it reports it. */
export const objectHeap = (): number =>
  typeof Bun !== "undefined"
    ? process.memoryUsage().heapUsed
    : V8.getHeapSpaceStatistics().reduce(
      (used, space) => objectSpaces.has(space.space_name) ? used + space.space_used_size : used,
      0
    )
