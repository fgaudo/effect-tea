# How the functions that take a program check it

**Status:** decided by the owner, 23 November 2026, after a second opinion of a session of Fable 5.2 that the owner
asked for, and done the same day: point 1 of step 16 of [`ROADMAP.md`](../../ROADMAP.md), rewritten as below, with its
leads under "Open problems" there. Nothing was built for the second opinion: the probes were throwaway files outside the
repository, run with the repository's `tsc` 7.0.2 and the options of `tsconfig.json`, and checked again by the session
that asked for them. Read against the code at `dda7a65`.

## What was proposed

Point 1 of step 16 asked that `start`, `child`, `childById`, `simulate`, `rehearse` and `drive` check a program through
one type, as `ProgramChecked` in `src/compose.ts` checks a child, "so that they cannot differ", and that a rule of
`AGENTS.md` say so. Today four checks do it:

- `start` and `drive` infer the types of a row, `Program<{ state; model; message; … }>`, from the program given.
- `rehearse` takes `P & Program<…>`, and reads its commands and keys through `P` (`Commanded`, `Listened`).
- `child` and `childById` read the types back from the program (`StateOf<P>`, `CommandOf<P>`, …) and check it against
  them, through `CheckedChild<P>`.
- `simulate` takes only the pieces it calls: `update`, `subscriptions`, `runCommand`, and a state that is an object.

## What the probes found

1. **The check read back costs `start`, `drive` and `rehearse` their contextual types.** A program written in the
   call with a parameter not annotated, `makeModel: (s) => s.count`, or spread from a typed program with one such
   piece, compiles in all three today. Under a `start` typed `<P extends AnyProgram>(program: CheckedChild<P>)`, it
   does not: `P` reads as `AnyProgram`, and the error asks for a `runCommand`. It is the lead that step 16 already
   lists for `child`, spread to three more functions.
2. **The check of a row narrows the message.** An object not typed `Program<…>`, whose `update` takes `"Inc" | "Dec"`
   and whose only command answers `"Inc"`, gets from `start` a dispatch of `"Inc"` alone, and `"Dec"` does not compile;
   `drive`, `rehearse` and `simulate` narrow it alike, where `MessageOf` gives the union. `Message` is inferred from
   every piece that names it, and the answer of `runCommand` wins. `NoInfer<Message>` in the `runCommand` and the
   `listen` of the row gave the union in four cases (a constant, a program written in the call, one typed
   `Program<…>`, and a wrong answer still refused): not run against the tests or the matrix.
3. **`simulate` refuses the simplest program.** A constant object without commands is taken by `start`, `drive`,
   `rehearse` and `child`, and refused by `simulate`, which asks for a `runCommand` of `unknown` commands: its
   `Command` and `Event` have no default (`src/testing/simulate.ts`). With `= never` for both, it takes that program,
   and one with commands still.
4. **The copy of the pieces has drifted.** `ProgramChecked` writes out the pieces of a program by hand, and lacks the
   `output` of `Shape` in `src/program.ts`. So `child` takes an object whose `output` reads another state,
   `output: (s: { readonly other: string }) => s.other.length`, and the parent reads `children.Kid.output()` as a
   `number`; `Program<{ …; output: number }>` refuses the same object. That it throws in a run is reasoned, not run.
5. **The functions differ by design too.** `start` and `drive` refuse a program with events, and `rehearse` and a
   child take it. A child refuses an `external` that rejects, and commands that `external` alone starts with no
   `runCommand`; `start`, `drive` and `rehearse` take both, and never call `external`. All but `simulate` refuse keys
   without a `listen`.
6. **How a type prints constrains only `child`.** The declarations emitted for `start` are the same in both forms,
   `Started<number, M, never>`, for an object and for a program of `make`. `child` must keep its `P` for
   `Child<…, P, …>`: `P & Program<…>` loses the name, as the comment at `CheckedChild` says.

## The second opinion

One type for the six cannot hold their agreement. The check read back everywhere agrees by construction, but breaks a
program written in the call (finding 1), gives errors that name a sentence key where a row names `events`, and
`simulate` cannot take it. The row everywhere cannot serve `child` (finding 6). And finding 2 is one shape giving two
messages, because one side infers and the other reads back: no type closes that, only a check that gives each case to
every function. What is worth sharing is the definition: `ProgramChecked` written from `Shape`, so that a piece added
to a program reaches `child` too. api-1 came from a form that no test wrote, not from two checks: points 2 and 3 of
step 16 hold that, and should come before point 1, which would otherwise change signatures before the matrix can say
what differs.

## Decided

The owner took the second opinion, on each of its four questions:

- **One definition, two forms.** `ProgramChecked` is written from `Shape`, in `src/program.ts` beside it, which closes
  finding 4. `start`, `drive` and `rehearse` keep the row, `child` and `childById` the check read back. The agreement
  is held by the matrix (point 3 of step 16), with a table of the differences meant (finding 5). Points 2 and 3 come
  before point 1.
- **`simulate` stays apart**, with its check of the pieces it calls, made of the same pieces (`Update`, `Interpreter`,
  `Subscriptions`, `ObjectState`), and takes `Command = never` and `Event = never`, which closes finding 3. The matrix
  compares it with the others by the types it gives back. Step 21 weighs it again.
- **A narrow rule in `AGENTS.md`, one a check can hold**: the pieces of a program are written once, in `Shape`; every
  function that takes a program is listed in the matrix, which fails where they disagree beyond the differences it
  lists; and a change of the signature of one runs `bun run inference`, which `change-api` says.
- **Finding 2 breaks the third rule** of "What belongs here", a type narrowed, and is to be fixed: a lead under "Open
  problems", with the `NoInfer` of the probe as the fix to try.
