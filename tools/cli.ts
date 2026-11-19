// What the tools that take arguments share: the failure they report, how they run a process, and how a command is run.
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Command from "effect/cli/Command"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Runtime from "effect/Runtime"
import * as Stream from "effect/Stream"

// The root of the repository. `dirname`, and not Bun's `dir`, as `tools/bench/writes.ts` runs on Node too.
export const repository = Effect.map(Path.Path, (path) => path.resolve(import.meta.dirname, ".."))

// What a tool is refused for, or what it found: printed as it is, with no stack, which would point into the tool and
// not at what it found.
export class Failed extends Data.TaggedError("Failed")<{ readonly message: string }> {
  readonly [Runtime.errorReported] = false
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) => stream.pipe(Stream.decodeText(), Stream.mkString)

// What a process wrote, and how it exited: `spawner.string` does not check the exit code. Interrupted, its scope ends
// the process.
export const exec = Effect.fnUntraced(function*(command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(command)
  const [stdout, stderr, exitCode] = yield* Effect.all([text(handle.stdout), text(handle.stderr), handle.exitCode], {
    concurrency: "unbounded"
  })
  return { stdout, stderr, exitCode }
}, Effect.scoped)

// A process whose output shows as it runs, as a step of a tool: one that fails fails the tool.
export const step = Effect.fnUntraced(function*(cwd: string, command: string, args: ReadonlyArray<string>) {
  const { exitCode } = yield* exec(ChildProcess.make(command, args, { cwd, stdout: "inherit", stderr: "inherit" }))
  if (exitCode !== 0) return yield* new Failed({ message: `${command} ${args.join(" ")} exited with ${exitCode}` })
})

// Runs `command` with the arguments of the process: a `Failed` is printed, and exits with 1. On Node too, where
// `tools/bench/writes.ts` runs: the services and the `runMain` of `@effect/platform-bun` are those of
// `@effect/platform-node-shared`, which call no API of Bun's.
export const main = <Name extends string, Input, ContextInput, E>(
  command: Command.Command<Name, Input, ContextInput, E, Command.Environment>
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const { version } = JSON.parse(yield* fs.readFileString(path.join(yield* repository, "package.json")))
    return yield* command.pipe(Command.run({ version }))
  }).pipe(
    Effect.tapError((error) => error instanceof Failed ? Console.error(error.message) : Effect.void),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain
  )
