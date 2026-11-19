// What the tools that take arguments share: the failure they report, how they run a process, and how a command is run.
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Command from "effect/cli/Command"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Runtime from "effect/Runtime"
import * as Stream from "effect/Stream"
import * as fs from "node:fs"
import * as path from "node:path"

export const root = path.resolve(import.meta.dir, "..")

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

// Runs `command` with the arguments of the process: a `Failed` is printed, and exits with 1.
export const main = <Name extends string, Input, ContextInput, E>(
  command: Command.Command<Name, Input, ContextInput, E, Command.Environment>
) =>
  command.pipe(
    Command.run({ version: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version }),
    Effect.tapError((error) => error instanceof Failed ? Console.error(error.message) : Effect.void),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain
  )
