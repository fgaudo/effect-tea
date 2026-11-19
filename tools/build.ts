// Builds `dist/`: JavaScript and declarations for consumers that do not compile TypeScript sources.
// `tsc` rewrites relative `.ts` imports to `.js` in the JavaScript it emits, but not in the declarations,
// so they are rewritten here: otherwise a consumer's TypeScript would look for `.ts` files `dist/` lacks.
//
//   bun tools/build.ts
//   bun tools/build.ts --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { main, repository, step } from "./cli.ts"

const command = Command.make(
  "build",
  {},
  Effect.fnUntraced(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* repository
    const dist = path.join(root, "dist")
    yield* fs.remove(dist, { recursive: true, force: true })
    // Resolved as a dependency: lifecycle scripts (e.g. `prepack`) do not see the workspace's binaries.
    const tsc = path.join(
      path.dirname(yield* path.fromFileUrl(new URL(import.meta.resolve("typescript/package.json")))),
      "bin/tsc"
    )
    yield* step(root, "bun", [tsc, "-p", "tsconfig.build.json"])
    for (const declaration of yield* fs.glob("**/*.d.ts", { root: dist })) {
      const file = path.join(dist, declaration)
      // Both forms `tsc` may write: `from './x.ts'`, and `import("./x.ts")` in an inferred type.
      const text = yield* fs.readFileString(file)
      yield* fs.writeFileString(
        file,
        text.replace(/(from\s+'\.{1,2}\/[^']*)\.ts'/g, "$1.js'").replace(
          /(import\("\.{1,2}\/[^"]*)\.ts"\)/g,
          "$1.js\")"
        )
      )
    }
  })
)

main(command)
