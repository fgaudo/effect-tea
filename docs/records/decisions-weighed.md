# The decisions before the charter, and the invariants, weighed again

**Status:** decided on 24 November 2026, as step 61 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Steps 62 to 64 of the roadmap apply it, and
[`api-review.md`](api-review.md) holds what it changes of the API, as its changes 9 to 11. It read
[`invariants.md`](../invariants.md), [`premises.md`](../premises.md), [`rejected.md`](../rejected.md), the decisions of
each record of this folder, the guide and the code that they shape. Each probe ran on a copy of the repository outside
it, with TypeScript 7.0.2 and Bun 1.4.5, and is not kept: the step that applies a change runs the checks. What was
weighed and left has its entry of this step in `rejected.md`.

## What changes

1. **A program's state is any value** (step 62, change 9). "Every program keeps its state in an object" had one reason:
   a parent kept a child's model by the child's state object. Since the library keeps the children
   ([`kept-children.md`](kept-children.md), 22 November), each child has an object of the library's own, its instance,
   replaced with the child's state, and the child's lifted keys are kept by it already. Kept by its instance too, a
   model asks nothing of the state. So the rule goes, with `ObjectState`, its checks in nine places, the defect of a
   child whose state is no object, and two of the three kinds of program that "Anatomy of a program" refuses; and a
   state that is a type parameter compiles in `make`.
   - By the values: a rule that the library no longer needs has no break to refuse (2); an export, a rule and a defect
     less (3); a child's model and its keys are kept one way (4); and a cache for all programs goes (5).
   - What it costs: two children in the very same state object make a model each, where they shared one, and a child
     started again in the state object it had makes its model anew. It is another instance. "Composition", "A child's
     model is kept", promised the same object while the child's state is the same object, and a child whose `init`
     gives one constant state object is started again in it: the promise is withdrawn for that case, as a breaking
     change with an entry of its own.
   - Probed: with the model kept by the instance and the checks taken out, `src/`, the examples and the bridges
     typecheck, and 4 of 1,085 tests fail, the two of the defect and the two of the shared model. A state that is a
     number runs alone, as a child and by id, and its model is the same object while it stays.
2. **The end of a run reads the register once** (step 63). The engine's end dies of the defects not reported yet
   (`report`, and the count `reported` of the register). The run, and each tool, then ends with `Core.endedWith`,
   which puts every defect of the register first and drops from the cause those it holds. So what `report` adds to the
   cause is dropped each time, and only the tests of the engine read it. Without it, `Core.report`, `reported`,
   `Deaths.report` and `Engine.report` go, with two mutations and, where no test rests on it any more, the premise of
   what `Effect.scoped` fails with. A mechanism and a premise less (5), and nothing that a run does changes.
   - Probed: with an end that reports nothing, and a run that ends once `died` succeeds, every test passes but 14,
     all of `engine.test.ts`, which read the exit of the engine's scope where they would read the register.
3. **`Applied` has no `revision`** (step 63, change 10). The engine counts the states for `onApplied` alone, which
   hears every accepted message in order, with the state before it and the state after: an option that wants a count
   keeps one. No example, tool or bridge reads it. A concept of the guide less (3), and a state kept as it is (5).
4. **What an element gives is a message that the model holds without it, and inputs go** (step 64, change 11). Since
   23 November a model holds a message without its value, and the view fills what the element or its event gives
   ([`value-in-message.md`](value-in-message.md)). That record says that the form, unrestricted, "is a message for what
   the user types", and keeps the inputs by a border: a value that the program can give back to the element stays an
   input, since "there is nothing to decide".
   - By the values, the border is two concepts for one job (3). A view sends a value in three ways, a write, a held
     message, and a write then a message for a message that is a class, with a rule to choose among them.
   - A write is the one message that no model holds (4). A view names its input by a string, a test builds the write
     by hand, and `dispatchViolations` sees it only where a test lists it beside what its reader returns. So the form
     of the examples once kept a place that its model showed read-only
     ([`application-report.md`](application-report.md), point 3), and no check asked: its test listed no write.
   - An input brings a rule that nothing checks, that a `set` changes its place and nothing else, with a tool of its
     own for it (2, 7).
   - The refusal of 18 November, "A write that `update` sees and may reject", had three reasons. A screen older than
     the state went when a dispatch applied at once (20 November): each bridge gives a controlled element the value of
     its model back after every message, rejected or not. A message that the view would build went when a model held
     it without its value. "There is nothing to decide" is left: it says that one rule would do for every field, and
     names nothing that a message cannot do.
   - `update` now sees what is typed, so an undo at each write is a case of it, and "Undo at every write of an input"
     leaves `rejected.md` too. Refused on 17 November, it was a subscription keyed by the value, since no `update` saw
     a write: how many writes it recorded rested on when the scheduler started it, and it had two traps. A message is
     applied as it is sent, so `update` records each, and both traps went with the subscription.
   - What is lost: "an input stores what is written" as a guarantee by construction, and the one line of
     `input({ at })`. Value 2 asks for no such refusal. An `update` that rejects what is typed is defined: the message
     is ignored, `onIgnored` hears it, and the element shows its model's value again. A model that holds such a message
     is found by `dispatchViolations`, as `Rejected`. A field costs a message, a case of `update` and a held part in
     the model.
   - Probed, on the library as it is: the form of `examples/form` with `NameTyped { value }`, held as
     `{ _tag: 'NameTyped' } as const`. The filled message is equal to the constructor's. `dispatchViolations` passes in
     each case of the draft, finds a field shown while the form saves (`Rejected`), and finds a text equal to the one
     held (`Inert`), which a reader avoids as a test of an input does today. `rehearse` types through what the model
     shows.

Steps 62 and 63 come before steps 53 and 54, since step 62 changes `rehearse.ts`. Step 64 comes after them, though it
changes the example of a doc comment there: it is the largest step, and it stops with a report where a value is found
that an input serves and a held message cannot, so the fixes of steps 53 and 54 do not wait for it.

## Kept, where it was close

- **`init` is a step, or a function of the flags.** One form, a function always, would treat `init` alike wherever it
  appears (4), and record what a child's `init` throws as the program starts. But a step reads as data to a test
  (`simulate(form, messages, form.init)`), and every program would write a thunk to move one throw from `make` to
  `start`: `init` is pure, so calling it early changes nothing that is defined.
- **`Host` starts its run in a microtask**, on a premise of StrictMode. The premise holds no promise, and its fall
  costs what the mechanism saves each day: the commands of `init` twice in development.
- **A command or a subscription that the program interrupts is a defect**, on two premises and a mark. Left to the
  program, a command that never answers ends in silence (1).
- **`simulate` runs on the engine.** A fold would be simpler (5), and would give a defect another site than the run
  gives it (4).
- **`external` apart from `update`, and `listening`.** A `tell` that `update` could reject would end in silence, or
  give `reject` a second meaning. And a parent says from its own state when a child listens, as it says when the
  child is there, where every child that can be hidden would keep a state for it.

## Set right on the way

[`invariants.md`](../invariants.md) named `Known`, a type that left `src/program.ts` long ago, for how a program
written without `Program<…>` opens none of a parent's checks: `Items` reads its lists as `never`.
