// The run of the inference matrix plays the programs of one file that `bun run inference --run` wrote (step 16, point
// 4): each with lists of messages drawn by fast-check, one at a time as `simulate` plays them, with its model made on
// each state. It prints what it played and what died, as JSON, for the matrix to report: one process for each file, so
// that the files are played at once.
//
//   bun tools/inference/play.ts <file> --runs <n> --seed <n>
import * as Cause from "effect/Cause"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Opt from "effect/Option"
import * as Result from "effect/Result"
import fc from "fast-check"
import { pathToFileURL } from "node:url"
import { ProgramDefect, reject } from "../../src/index.ts"
import { simulate } from "../../src/testing/index.ts"
import { main } from "../cli.ts"
import { Db, KidDb, type Played } from "./prelude.ts"

type Playable = Readonly<{
  update: (message: unknown) => (state: unknown) => unknown
  makeModel: (state: unknown) => unknown
}>

// What a program died of, with where for a defect of the program: a `CompositionDefect` is one the types could prevent.
const died = (cause: Cause.Cause<unknown>) => {
  const found = Cause.findDefect(cause)
  const defect = Result.isSuccess(found) ? found.success : undefined
  const inner = defect instanceof ProgramDefect ? defect.cause : defect
  const where = defect instanceof ProgramDefect ? ` in ${defect.where}` : ""
  return Opt.some(inner instanceof Error ? `${inner.name}${where}: ${inner.message}` : Cause.pretty(cause))
}

// A program played with `messages`, one at a time from the step it starts from, with its model made on each state:
// what it died of, if it died. A message that `update` rejects is left out, as the run ignores it.
const play = Effect.fnUntraced(
  function*(played: Played, messages: ReadonlyArray<unknown>) {
    // The case file has checked the types: here a program is any program.
    const program = played.program as Playable
    const simulated = (messages: ReadonlyArray<unknown>, from: unknown) =>
      simulate(program as never, messages as ReadonlyArray<never>, from as never) as Effect.Effect<
        Readonly<{ state: unknown }>
      >
    const first = yield* Effect.exit(simulated([], played.from))
    if (Exit.isFailure(first)) return died(first.cause)
    let state = first.value.state
    const model = yield* Effect.exit(Effect.sync(() => program.makeModel(state)))
    if (Exit.isFailure(model)) return died(model.cause)
    for (const message of messages) {
      // `update` is pure and called freely: a message it rejects is not given to `simulate`, which fails on one.
      const answer = yield* Effect.exit(Effect.sync(() => program.update(message)(state)))
      if (Exit.isFailure(answer)) return died(answer.cause)
      if (answer.value === reject) continue
      const step = yield* Effect.exit(simulated([message], { state }))
      if (Exit.isFailure(step)) return died(step.cause)
      state = step.value.state
      const model = yield* Effect.exit(Effect.sync(() => program.makeModel(state)))
      if (Exit.isFailure(model)) return died(model.cause)
    }
    return Opt.none<string>()
  },
  Effect.provideService(Db, { ok: true }),
  Effect.provideService(KidDb, { ok: true })
)

// A program whose commands answer forever never ends its simulation, as it never settles in a run: it is reported,
// and the next one is played.
const bounded = (played: Played, messages: ReadonlyArray<unknown>) =>
  play(played, messages).pipe(
    Effect.timeoutOption("10 seconds"),
    Effect.map(Opt.getOrElse(() => Opt.some("did not end in 10 seconds")))
  )

export type Death = Readonly<{ id: string; died: string; messages?: ReadonlyArray<unknown> }>

const command = Command.make(
  "play",
  {
    file: Argument.String("file").pipe(Argument.withDescription("The file of the run to play")),
    runs: Flag.Int("runs").pipe(Flag.withDescription("How many lists of messages each program is played with")),
    seed: Flag.Int("seed").pipe(Flag.withDescription("The seed of fast-check"))
  },
  Effect.fnUntraced(function*({ file, runs, seed }) {
    const deaths: Array<Death> = []
    let count = 0
    const runPromise = Effect.runPromiseWith(yield* Effect.context<never>())
    const module: Readonly<Record<string, () => ReadonlyArray<Played>>> = yield* Effect.promise(() =>
      import(pathToFileURL(file).href)
    )
    for (const [name, made] of Object.entries(module)) {
      const all = yield* Effect.exit(Effect.sync(made))
      if (Exit.isFailure(all)) {
        deaths.push({ id: name, died: Cause.pretty(all.cause) })
        continue
      }
      for (const played of all.value) {
        count++
        const drawn = played.messages.length === 0
          ? fc.constant<ReadonlyArray<unknown>>([])
          : fc.array(fc.constantFrom(...played.messages), { maxLength: 12 })
        const details = yield* Effect.promise(() =>
          fc.check(
            fc.asyncProperty(drawn, (messages) => runPromise(Effect.map(bounded(played, messages), Opt.isNone))),
            { numRuns: played.messages.length === 0 ? 1 : runs, seed }
          )
        )
        if (!details.failed) continue
        const [messages] = details.counterexample ?? [[]]
        const death = yield* bounded(played, messages)
        deaths.push({ id: played.id, died: Opt.getOrElse(death, () => String(details.errorInstance)), messages })
      }
    }
    yield* Console.log(JSON.stringify({ count, deaths }))
  })
)

main(command)
