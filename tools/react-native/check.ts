// Checks the bridge to React on React Native, as an application gets the package: packs it, installs it with npm in a
// project of its own outside the repository, beside React Native, its jest preset, its Metro configuration, its Babel
// preset and its TypeScript configuration of the same version, React Native's testing library and jest. There it
// typechecks `examples/react-native/`, bundles its application with Metro for iOS and for Android, with the default
// profile and with `hermes-stable`, compiles each bundle with the `hermesc` of `hermes-compiler`, which React Native
// installs, and runs the example's tests with jest. The example, and the examples whose programs it draws, are copied
// from the package installed: what is checked is what is packed. None of it is in the lockfile, nor in `bun audit`
// (`docs/records/react-native.md`).
//
//   bun tools/react-native/check.ts [--react-native <version>] [--keep]
//   bun tools/react-native/check.ts --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import { exec, Failed, main, repository, step } from "../cli.ts"

const readJson = Effect.fnUntraced(function*(path: string) {
  const fs = yield* FileSystem.FileSystem
  return JSON.parse(yield* fs.readFileString(path))
})

// The project of the application, in a directory of its own, which `--keep` leaves for a look.
const projectDirectory = Effect.fnUntraced(function*(keep: boolean) {
  const fs = yield* FileSystem.FileSystem
  return yield* Effect.acquireRelease(
    fs.makeTempDirectory({ prefix: "effect-tea-react-native-" }),
    (dir) => keep ? Console.log(`kept ${dir}`) : Effect.orDie(fs.remove(dir, { recursive: true, force: true }))
  )
})

// The files of the project that are no example's: the application's entry, and the configurations of the tools, as
// React Native's documentation writes them.
const files = {
  "babel.config.js": `module.exports = { presets: ["module:@react-native/babel-preset"] }\n`,
  "metro.config.js": `const { getDefaultConfig } = require("@react-native/metro-config")
module.exports = getDefaultConfig(__dirname)
`,
  // Effect and the package are ES modules, which the preset leaves untransformed: without them in the pattern, the
  // tests fail to parse.
  "jest.config.js": `module.exports = {
  preset: "@react-native/jest-preset",
  testMatch: ["<rootDir>/examples/react-native/*.test_jest.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|effect|@fgaudo/effect-tea)/)"
  ]
}
`,
  "index.js": `import { AppRegistry } from "react-native"
import { App } from "./examples/react-native/App.tsx"
AppRegistry.registerComponent("app", () => App)
`,
  // Metro's command has no flag for the profile of the transform: its API takes one.
  "bundle.js": `const Metro = require("metro")
const run = async () => {
  const config = await Metro.loadConfig({ cwd: __dirname })
  for (const platform of ["ios", "android"]) {
    for (const profile of ["default", "hermes-stable"]) {
      await Metro.runBuild(config, {
        entry: "index.js",
        platform,
        dev: false,
        minify: false,
        out: platform + "." + profile + ".js",
        ...(profile === "default" ? {} : { unstable_transformProfile: profile })
      })
    }
  }
}
run().catch((error) => {
  console.error(error)
  process.exit(1)
})
`,
  // React Native's own configuration, as its template extends it, with the `lib` of what Hermes has. With
  // `exactOptionalPropertyTypes`, under which the examples are written.
  "tsconfig.json": JSON.stringify({
    extends: "@react-native/typescript-config",
    compilerOptions: { exactOptionalPropertyTypes: true },
    include: ["examples/react-native"]
  })
}

// The examples copied from the package: the one of React Native, and those whose programs it draws.
const examples = ["react-native", "counter", "form"]

const bundles = ["ios.default", "ios.hermes-stable", "android.default", "android.hermes-stable"]

const hermesBinary = (platform: NodeJS.Platform) =>
  platform === "win32" ? "win64-bin/hermesc.exe" : platform === "darwin" ? "osx-bin/hermesc" : "linux64-bin/hermesc"

const command = Command.make(
  "test:react-native",
  {
    reactNative: Flag.String("react-native").pipe(
      Flag.withDescription("The version of React Native installed, with its presets of the same version"),
      Flag.withDefault("0.88.1")
    ),
    keep: Flag.Boolean("keep").pipe(
      Flag.withDescription("Leaves the project of the application, and prints where it is"),
      Flag.withDefault(false)
    )
  },
  Effect.fnUntraced(function*({ keep, reactNative }) {
    const fs = yield* FileSystem.FileSystem
    const { join } = yield* Path.Path
    const root = yield* repository
    // Effect and React at the repository's versions, as `bun run smoke` installs them.
    const [effect, react, types] = yield* Effect.forEach(
      ["effect", "react", "@types/react"],
      (name) => Effect.map(readJson(join(root, `node_modules/${name}/package.json`)), ({ version }) => version)
    )
    // jest at the version of the `babel-jest` that the preset depends on, which the preset's transform is.
    const preset = yield* exec(
      ChildProcess.make("npm", ["view", `@react-native/jest-preset@${reactNative}`, "dependencies.babel-jest"], {
        cwd: root
      })
    )
    const jest = preset.stdout.trim()
    const jestMajor = /\d+/.exec(jest)?.[0]
    if (preset.exitCode !== 0 || jestMajor === undefined) {
      return yield* new Failed({
        message: `npm found no babel-jest in @react-native/jest-preset@${reactNative}:\n${preset.stderr}`
      })
    }
    const dir = yield* projectDirectory(keep)
    yield* step(root, "bun", ["pm", "pack", "--quiet", "--destination", dir])
    const [tarball] = yield* fs.glob("*.tgz", { root: dir })
    yield* fs.writeFileString(
      join(dir, "package.json"),
      JSON.stringify({
        name: "react-native-check",
        private: true,
        dependencies: {
          "@fgaudo/effect-tea": `file:./${tarball}`,
          effect,
          react,
          "react-native": reactNative
        },
        devDependencies: {
          "@react-native/babel-preset": reactNative,
          "@react-native/jest-preset": reactNative,
          "@react-native/metro-config": reactNative,
          "@react-native/typescript-config": reactNative,
          "@testing-library/react-native": "^14.1.0",
          "@types/jest": `^${jestMajor}`,
          "@types/react": types,
          jest,
          "test-renderer": "^1.3.1",
          // The oldest TypeScript the package supports, as the README's "Installation" states it.
          typescript: "~5.9.0"
        }
      })
    )
    for (const [name, text] of Object.entries(files)) yield* fs.writeFileString(join(dir, name), text)
    yield* step(dir, "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"])
    const installed = yield* Effect.forEach(
      ["react-native", "react", "jest", "typescript"],
      (name) =>
        Effect.map(readJson(join(dir, `node_modules/${name}/package.json`)), ({ version }) => `${name} ${version}`)
    )
    yield* Console.log(`${installed.join(", ")}, @fgaudo/effect-tea from ${tarball}`)
    for (const example of examples) {
      yield* fs.copy(join(dir, "node_modules/@fgaudo/effect-tea/examples", example), join(dir, "examples", example))
    }
    yield* step(dir, "node", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"])
    yield* Console.log("typescript: the example typechecks")
    yield* step(dir, "node", ["bundle.js"])
    yield* Console.log(`metro: bundled ${bundles.join(", ")}`)
    const hermesc = join(dir, "node_modules/hermes-compiler/hermesc", hermesBinary(process.platform))
    // Without a warning for each global that React Native's runtime defines, and that `hermesc` does not know.
    for (const bundle of bundles) {
      yield* step(dir, hermesc, [
        "-Wno-undefined-variable",
        "-emit-binary",
        "-O",
        "-out",
        `${bundle}.hbc`,
        `${bundle}.js`
      ])
    }
    yield* Console.log("hermesc: compiled each bundle")
    yield* step(dir, "node", ["node_modules/jest/bin/jest.js", "--ci"])
  }, Effect.scoped)
)

main(command)
