# Which forms of a program the library promises

**Status:** decided by the owner, 23 November 2026, after a second opinion of a session of Fable 5.2 that the owner
asked for, free to propose a change of the invariants, the guarantees and the premises, and done the same day: point 1
of step 16 of [`ROADMAP.md`](../../ROADMAP.md), with its leads under "Open problems" there. Nothing was built for the
second opinion: the probes were throwaway files outside the repository, run with TypeScript 5.9, 6.0 and 7.0, and the
one the decision rests on was run again by the session that asked for them. Read against the code at `20653b7`.

## What was asked

The guide makes every program with `make`, but `Program<…>` is exported as the type a function over a program names,
and `start`, `child` and the testing tools take an object not typed `Program<…>` as it is. api-1, api-2 and api-4 of
[`library-review.md`](library-review.md) lived in that form, and so did most of the leads the inference matrix found
on 23 November 2026. The roadmap named three choices: every form promised, each lead fixed or weighed as a form that
repeats another; `make` and `Program<…>` promised, an object not typed taken and promised nothing; or `make` alone.

## What the second opinion found

1. **The weight is in the forms already promised.** In `.inference/report.json` of 23 November 2026, 1,792 of the
   2,150 wrong parts of a configuration are programs of `make` or typed `Program<…>`, all in `start` and `drive`, and
   1,652 of them are programs of `make` with an `external`. The forms not typed have 358. Counted by the second
   opinion, not counted again.
2. **`start` and `drive` refuse every program with an `external` or an `output`**, of `make` too, with an `update`
   or not: their row names neither, so every type parameter falls back to its constraint. Run again with the
   repository's `tsc` 7.0.2. The matrix cannot see the `output` case, since no program of `make` names one (point 6 of
   step 16), and no test gives `start` or `drive` such a program.
3. **The guide gives an object not typed as a rule.** "Running", "Starting from another state", writes
   `{ ...program, init: { state } }`, and the timer's test and both bridges' tests write it. So "promised nothing"
   would take back a rule, and the matrix never writes that form today.
4. **The second rule already holds in the forms not typed.** The report has no case of a broken program that
   compiles in them.
5. **A row that names `external` and `output`, each inferred**, takes all these programs with exact types, a literal
   in the call too, and refuses an `external` that rejects and an `output` over another state. A function over any
   program still calls `start` with it. With it in `src/run.ts` and `src/testing/drive.ts`, `src/` and `test/`
   typecheck unchanged. Not run: the examples, the bridges, the tests, the matrix.
6. **A program of the library's own, hidden or branded, fixes nothing**: the leads come from how `start` infers, not
   from who made the object. It would need readers, which "A function earns its place" removed (`subscriptionsOf`),
   and break `program.makeModel(state)`, which the tests read.
7. **The parenthesis of `AGENTS.md`**, "hidden where it is not (a program that `program` makes)", is false: the guide
   documents the pieces of a program, the tests read them, and "Running" spreads them.

## Decided

The owner took the second opinion as it stands:

- **The forms are chosen by a rule, not listed**: a form may be refused, but it is never taken wrongly. The first rule
  of the types, that every correct program can be written, is owed to `make`, to a value typed `Program<…>`, and to
  `{ ...program, init }`. The second and the third are owed to every form that a function takes. `AGENTS.md` says it
  where it states the three rules, and its parenthesis on a program that `program` makes is set right.
- **The row of `start` and `drive` names `external` and `output`**, as `External = never` and `Output = never` after
  their other type parameters, and their `checks` in `tools/inference/generate.ts` gain both. Nothing promised breaks:
  an object not typed whose `external` rejects, or whose `output` reads another state, is refused, where it was taken
  and never called. It is a fix in the changelog.
- **The matrix judges by the rule**: in the forms not typed, a valid case refused is a note, not a lead; a broken case
  taken, or a case taken with other types, is a lead. It writes `{ ...program, init }` over the cases of `make` and
  the hand cases. The axes of the forms not typed may then be crossed in pairs, for the time of point 6.
- **No invariant, guarantee or premise changes**, and the guide promises nothing new: at most a description under
  "Anatomy of a program", "Precisely".

Noticed and not weighed: a child with events given to `start` is refused by design, and the error says that nothing
was inferred, not that a program with events cannot run.
