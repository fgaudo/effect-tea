# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

A step for Fable 5.2 runs on Opus 5.5, `xhigh`, while Fable is not available.

## How the steps run

One after another, in the order of "Next, in order", each in a context of its own (a workflow per step, or a session
per step), and with no question to the owner but those of "Deciding". An agent of the step's model and effort does
the step. Then an agent that wrote none of it, on Opus 5.5 at `high`, runs the checks of its "Done when" and reads its
diff against "Deciding" and the step; the first agent fixes what it finds, twice at most, and a step whose checks
still fail stops the chain, with a report. A step ends in one local commit, with its decisions in the body, and takes
itself out of this file. Before each step, the use of the owner's plan is read where a tool reports it: a step that
the rest of the week cannot pay for waits for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
lead of the types has no `test.failing`: its fix adds the test of the types that holds it, and a lead of the inference
matrix is shown by its case (`bun run inference --filter <case>`).

- **A tag that throws as a tool names its message replaces the tool's error with what it threw**: `doesNothing`
  and `describeAll` (`rehearse.ts`), and `unexpectedRejection` (`unexpected.ts`), which `simulate` fails with on a
  rejection, call `describeByTag` with no guard, in the call's fiber. Found by the review of step 20, on 24 November
  2026, in `rehearse`, and untested. Step 52 left the error of a rejected message to the tool that calls
  `outcomeOf` (`stage.ts`), so each is built in the call that fails: step 53 takes them.
- **`rehearse` waits for ever on a key whose printing throws**: a `hearNext` waits on a key whose `toJSON` and
  `toString` throw, and a `send` takes the key away. The fiber of effects tells the calls that waited (`released` in
  `rehearse.ts`) with an error it builds at once, `stoppedWhileWaiting(key)`, whose `Inspectable.toStringUnknown`
  falls back to `String` and throws, as its JSDoc says: the fiber of effects dies there, before the job's starts and
  every later job, and the `send`, which waits for a job that tells after its own (`outcomeOf`, not raced with a
  death), waits for ever, and so does the rehearsal. With a key that prints, it ends at once. It breaks "It throws
  nothing" of `released` and `Engine.after`, and "The testing tools behave like the engine": the run never prints a
  key. Its `test.failing` is "a hearNext stopped as its key goes away fails the test, and the rehearsal ends"
  (`rehearse.test.ts`). Found by the review of step 20, on 24 November 2026, and run. Of the same form, untested: the
  job of a `hearNext` builds `hasEnded(call.key)`, and `openFor` the error of a start `hear` played, in the `done` of
  `Engine.after`; the end's `stoppedWhileWaiting` fails the rehearsal's fiber with the throw. The form is that of the
  item above it, a value of the program printed outside its functions with no guard: step 53 fixes both by that form.

## Next, in order

Step 60 applies the review of the API that step 59 made ([`api-review.md`](docs/records/api-review.md)), now that
step 58 has made a name change fewer documents. Steps 62 to 64 apply what step 61 decided on 24 November 2026, when it
weighed the decisions taken before the charter, and the invariants, by the values of "Deciding"
([`decisions-weighed.md`](docs/records/decisions-weighed.md)). Steps 62 and 63 come before the steps of the engine, 53
and 54, since step 62 changes `rehearse.ts`. Step 64 comes after them: it is the largest, and may stop with a report,
so their fixes do not wait for it. Step 55 comes last, before the release that follows them all, so that one release
carries every breaking change.

### 60. The API as step 59 decided

**Model and effort.** Opus 5.5, `medium`: the changes follow the record, across modules.

**Depends on** no open step. Step 59 left its decisions in [`api-review.md`](docs/records/api-review.md), and step 61
added to them: "What changes" lists the changes, and "Each export" what stays. This step applies changes 1 to 4 and 6
to 8. Change 5 was taken into change 9, and changes 9 to 11 change the engine and the guide too: steps 62 to 64 apply
them, so this step changes nothing of `ObjectState`, of `Applied` and of the inputs but the tag of change 6. Nothing
of the API is decided again here: a change that cannot be made as the record says stops the step, with a report.

**How.** Each of these changes of the record, by `change-api`: the code, the tests, the doc comments, the guide, the
tutorial, the examples, the skill, the reports of the API, the inference matrix and the smoke test. The changelog takes
changes 1 to 4 under the unreleased section, each a `**Breaking**:` with its `Upgrade:` (`release`), so that one
release carries them all. That section is no history yet, and follows the record where it names what changes:
`Listener` (point 1) and two sentences on keys (point 4). In this order, since each is checked before the next:

1. **The names of changes 2 and 3**, each by a search of what follows the code, and of nothing else:
   `git grep -w -e Simulation -e Interpreter -e ExternalHandler` and `git grep 'Listener<'`, each over
   `-- src bridges tools test examples site skills README.md`, with the imports and the index that the typecheck then
   names. `WithExternal` leaves `src/index.ts`. `WithOutput` is new, written as change 3 writes it, on one line: the
   mutations "a program with an output is typed without it" and "a program's output reads any state" quote its last
   part, and still find it once. History keeps the old names, and is not edited: the released sections of
   `CHANGELOG.md` (`Simulation`, under 0.8.0), `docs/records/` and `docs/rejected.md`. The unreleased section of
   `CHANGELOG.md` is edited: the `Listener` of its entry "a subscription is made from its key alone" becomes
   `WithListen`, and the breaking entry of change 3 names `Interpreter` and `ExternalHandler` alone, since no release
   has `Listener`. The reports `api/*.api.md` are not edited: `bun run api` writes them again. `ExternalHandlerOf`, of
   `compose.ts`, keeps its name, as change 3 says, and so do the `Listener` of `bridges/snabbdom-testing.ts`, which is
   snabbdom's, and that of `src/testing/contract.test.ts`, a program of the test. A mutation quotes the text it
   replaces (`from` and `to`): a line renamed is renamed there too. `tools/inference/prelude.ts` reads a `Simulation`.
2. **Change 1.** `simulate` is written as `drive` is, one `Effect.fnUntraced` of its three parameters. Then the
   calls, each `applyAll(x)(messages, from)` to `applyAll(x, messages, from)` by one pattern, and the same for
   `simulate`: some 140 lines, with the tests that keep `simulate(program)` to call it twice, and
   `tools/inference/play.ts`. In the matrix (`tools/inference/generate.ts` and `prelude.ts`): as a use, `simulate` is
   called with no messages and a `from` typed `never`, so that the program alone gives the types, and `SimulateRead`
   reads them from the effect it returns; as takers, `simulate` and `applyAll` are given the messages in the one call,
   and the line that reads what `applyAll` takes goes, since its messages are `NoInfer` and the uses check `update`.
   Then `bun run inference` and `bun run inference --run`.
3. **Change 4**, in `bridges/react.ts` (the `children` of `HostProps`, the `children` of `Host`'s doc comment, and
   `props.children` in `Host`), in `tools/mutations/mutations.ts` (the `from` and the `to` of "Host gives React the
   model it read itself", which quote `view: props.children`), in `bridges/react.test.ts` and
   `tools/smoke/bridges.ts`, and in each file that writes `<Host` (`git grep '<Host' -- bridges README.md site`): the
   example of its doc comment, the README, and "Coming from Elm or React" of the guide, each as
   `<Host program={counter} view={view} />`. Only the `children` of `HostProps` changes, with what a test gives
   `host(…)` or `Host` for it. React's own `children` stays, in `bridges/react.test.ts`: that of `Boundary`
   (`this.props.children`), of `Toggle`, and of `Activity`, whose `children` is the `host(…)` that takes `view`.
4. **The documents.** In the guide, beside that line of "Coming from Elm or React", "Testing" and "Testing tools"
   change their code, and the sentences of change 8: no rule says how a tool is called beyond "takes the program
   first", which stays true. The rows of change 7 go in the glossary as the record words them. Change 8 is made as the
   record spells it, one section at a time, each sentence checked against the old one: the sentences of "Guarantees",
   "Composition", "Testing", "Testing tools" and "Anatomy of a program", the skill's rule, the two sentences of the
   unreleased section of `CHANGELOG.md` ("a child whose flags or key change", and "a child's key" in the `Upgrade:` of
   "a subscription is made from its key alone"), and the doc comments. In "Composition", "a child with keys and no
   `listen`" is written twice, under "What does not compile" and under "What is a defect". In `src/compose.ts` the doc
   comments are the option `key` of `AlwaysPlace` and of `SometimesPlace`, the type `Child`, `At`, `ChildKeys` and
   `Lifted`, and the member `key` of `Instance` and of `Child`, which holds the flags of a child with flags, or what
   its `key` gives: its doc comment says both, never the key alone. In `src/program.ts` it is `KeyOf`, and in
   `src/testing/rehearse.ts` the `@param key` of `hear`. Then
   `git grep -n -i -E "child(ren)?'s keys?|another key|flags and keys|keys and flags|with keys"` finds nothing in
   `site/guide`, `site/tutorial`, `skills` and `README.md`. The README, the tutorial, the skill and the doc comments
   follow the code (`@returns` of `applyAll` and of `simulate`, the `children` of `HostProps`). Change 6 comes last:
   the tag goes before the `@see` lines, and its sentence in "Document it" of `change-api`, as the record words it.

**Done when** the API is the record's, but for its changes 9 to 11, and `bun run typecheck`, `bun run lint`,
`bun run test`, `bun run test:node`, `bun run comments`, `bun run build`, `bun run api --check`, `bun run smoke`,
`bun run inference` and `bun run mutations` pass, `bun run test:browsers` for the bridge to React, and the site builds
with no warning (`cd site && bun install && bun run build`), with "Types of the signatures" last on the page of the
module.

### 62. A program's state is any value

**Model and effort.** Opus 5.5, `high`: the types of `program.ts` and `compose.ts`, with their mutations, and an
invariant that goes.

**Depends on** step 60, which renames what `Shape` is made of and leaves `ObjectState` as it is. Step 61 decided it
([`decisions-weighed.md`](docs/records/decisions-weighed.md), point 1), and change 9 of
[`api-review.md`](docs/records/api-review.md) spells what the API loses. It comes before step 53, since it changes the
type parameters of `rehearse.ts`.

**Why.** A program kept its state in an object so that a parent could keep a child's model by it. Since the library
keeps the children, each has an instance, which is replaced with the child's state and keeps its lifted keys already.
Kept there too, a model asks nothing of the state: the rule, its type, its nine checks and its defect serve nothing.

**How.** By `change-api` and `change-engine`, in this order, since each is checked before the next:

1. **The model, by the instance** (`src/compose.ts`). `modelOf` keeps a child's model in a `WeakMap` of `make`, by
   its instance, as `liftedAt` keeps its keys. The cache by program and by state object (`models`, `modelsOf`) goes,
   with the defect of a state that is no object and its two tests. One test takes the place of the two of a shared
   model ("one program as two children, in the very same state object, has one model", and "children that share one
   state object share its model, and their dispatch adds their id"): a child's model is the same object while its
   instance keeps its state, through a step of another child too, and a child started again makes its own. The
   mutation "a child's model is made anew for a state it was made for" is written again on the new cache, and "a
   child's state that is not an object dies of the WeakMap's TypeError" goes. `bun run test` passes with the types as
   they are.
2. **The types**, as change 9 spells them. The tests of the types that refused a state take it now, each as a user
   writes it: a number alone, as a child and by id, `{}`, and a state that is a type parameter in `make`
   (`src/compose.test.ts`, `src/testing/simulate.test.ts`, `tools/smoke/consumer.ts`, and the case of
   `tools/inference/generate.ts` on a state without fields). Eight mutations of the types held the rule, and go, each
   by its name, since other mutations stand between them in `tools/mutations/mutations.ts`: "a state that is no object
   is let through", "a state without fields is let through", "a state typed object is refused as a state without
   fields", "a program typed Program is not checked for its state", "a child is not checked for its state", "make
   takes a state without fields", "the make of a parent takes a state without fields" and "program takes a state that
   is no object". The line of the mutations' header on the places of `child` and `childById` goes with them. Then
   `bun run typecheck`, `bun run inference`, `bun run inference --run` and `bun run mutations`.
3. **The very same state is told by `Object.is`**, in `Core.arrive` and in the slot of `src/run.ts`, as in
   `compose.ts`: a state may be `NaN` now. A test of each holds it, with its mutation.
4. **The guide**, one section at a time, each sentence checked against the old one.
   - "Anatomy of a program": "Its state is always an object" goes, and one kind of program is left under "What does
     not compile", one written as an object without `subscriptions`.
   - The glossary's **State** is "What the program knows: any value, replaced and never mutated".
   - "Composition", "A child's model is kept", says: "It is the same object while the child keeps the very same
     state: a step that returns the state it was given, and a step of another program, leave it as it is. A child
     started again is another instance, with a model of its own." Its sentences on a number or a string go. "What is a
     defect" loses the child whose state is not an object. "A function that makes a parent of any program" loses the
     sentence on `make` and a state that is a type parameter, and its example names `S` with no bound, and a program
     whose types are all `unknown`.
   - Where a page says "the same object" of the state after a step ("Update", "Running", "Rejections and defects"),
     it says the very same state: the same object, or the same primitive value.
   - A sentence on a child's model takes the words of "Composition", never that rule, which would promise what the
     new cache does not keep. In "Guarantees", "What is left to you": "The library reuses a child's model, and the
     keys of its subscriptions, while the child keeps the very same state: a child started again makes its own." In
     "Testing", one state object used twice passes "because a parent keeps each child's model while the child keeps
     its state", where it said "for each state object".
   - The skill, the tutorial ("Children", on its children's models), the README and the doc comments follow
     (`Program`, `Models`, `App`), by `bun run comments`, a child's model in the words of "Composition" there too.
5. **The documents.** In `docs/invariants.md`, "Every program keeps its state in an object" goes, and "A child's model
   is kept by its state object, and its lifted keys by its instance" says both by its instance, with no sentence on a
   cache for primitive states. In `docs/rejected.md`, "Checks that hold for a type parameter" loses its clause on a
   state that is a type parameter in `make`. The changelog takes the two entries that change 9 words, each a
   `**Breaking**:` with its `Upgrade:` (`release`): the second withdraws a promise of "A child's model is kept", which
   said the same object while the child's state is the same object.

**Done when** a program whose state is a number runs alone, as a child and by id, in a test of each; `ObjectState` is
named in no file but `CHANGELOG.md` and those of `docs/records/`; and `bun run typecheck`, `bun run lint`,
`bun run test`, `bun run test:node`, `bun run interleavings`, `bun run comments`, `bun run build`,
`bun run api --check` once `bun run api` has written the reports, `bun run smoke` with the count that its comment
explains, `bun run inference`, `bun run mutations` and `bun run test:browsers` pass, and the site builds with no
warning (`cd site && bun install && bun run build`).

### 63. The engine keeps no count: the end reads the register, and a state has no revision

**Model and effort.** Opus 5.5, `high`: the end of a run, which "Nothing ends in silence" rests on.

**Depends on** step 62 for the order alone: both change `src/run.ts`. Step 61 decided it
([`decisions-weighed.md`](docs/records/decisions-weighed.md), points 2 and 3), and change 10 of
[`api-review.md`](docs/records/api-review.md) spells what the API loses.

**Why.** The engine keeps two counts that nothing needs. `reported` says which defects its end has still to die of,
and `Core.endedWith` then drops them from the cause, since the run and each tool end with the whole register.
`revision` counts the states for `onApplied`, which hears each of them in order.

**How.** By `change-engine`, and by `change-api` for the field:

1. **The end.** The engine's finalizer stops its fibers, and reports nothing. `Core.report`, the `reported` of
   `Register`, `Deaths.report` and `Engine.report` go. The run's effects end once `died` succeeds, and the run then
   reads the register and ends with `Core.endedWith`, as today. Where `init` threw there is no engine, and the run
   reads the register at once. The tests of `src/engine.test.ts` that read what the engine's scope dies of, 14 under
   the probe of step 61, read the register that they give `Engine.make`, through `Core.endedWith`, as the run and the
   tools end. The mutations "a report leaves the defects it reported to be reported again" and "the end of the engine
   does not report what its fibers died of" go with their code, and so does the test of `src/core.test.ts` that the
   first names. If a test of the run, of a tool or of a bridge then fails, a defect reached a cause through the second
   report alone: the step stops, with a report.
2. **The premise.** "`Effect.scoped` fails with what a finalizer of its scope dies of" leaves `docs/premises.md`, with
   its tests, if no test rests on it any more. Otherwise its sentence names the test that does. Step 47 then names
   what is left of the premises of how the failures of cleanups combine.
3. **The revision**, as change 10 spells it. `Applied` loses `revision`, `src/core.ts` loses `Revision` and
   `Revisioned`, and the engine's `current` gives the state. A test that read a revision reads the states, or what the
   listeners were told, and "the very same state is taken for a new one" keeps a killer in each of its files. The item
   of "Any time" on saving each state says "the state" where it said "the state and its revision".
4. **The documents.** `docs/invariants.md` says how the end is kept now, where it said "Each defect is reported once,
   in that order: by the run as soon as one dies, and by the end". The guide and the changelog change for the revision
   alone, as change 10 words it: the end changes nothing that a consumer can notice.

**Done when** `Core.report`, `Deaths.report`, `Engine.report` and `reported` are gone; `revision` is in no file of
`src/`, of the guide and of the skill; and the checks of `change-engine` pass, with `bun run mutations`,
`bun run comments`, `bun run build`, `bun run api --check` once `bun run api` has written the reports, and
`bun run smoke`.

### 53. In `rehearse`, the fiber of effects tells data, and the call makes the error

**Model and effort.** Opus 5.5, `high`: a fix by its form, in the largest tool.

**Depends on** step 60, which renames neither tool, and changes how `simulate` is called (`simulate.ts`), and on
steps 62 and 63, which come before it: step 62 changes the type parameters of `rehearse.ts`, and step 63 the end of
the engine, which `stage.ts` ends a tool by. Step 52 left the code where it stays, what `rehearse` and `simulate`
share in `src/testing/stage.ts`, and what `rehearse` hears in `rehearse.ts`. It waits because only a key whose
printing throws, or a message whose tag does, meets it.

**Why.** Two findings of "Open problems", of one form: a value of the program, or of the test, printed where what it
throws is not the call's. `released`, the job of a `hearNext` and `openFor` build an `Error` with
`Inspectable.toStringUnknown(key)` in the fiber of effects, inside a `done` of `Engine.after` that "throws nothing": a
key whose printing throws ends that fiber, and every call that waits for a job waits for ever. `doesNothing`,
`describeAll` and `unexpectedRejection` call `describeByTag` with no guard, and a tag that throws takes the place of
the tool's error.

**How.** A call of `hearNext` is told data: the message it heard, that its start has ended, or that it was stopped.
`heard` is completed with a value, never with a defect, and the fiber of the call makes the error of it. What the job
of a `hearNext` decides (`openFor`) is data too, which the call turns into its effect. So nothing that runs in the
fiber of effects, or at the end, builds a text. One function says how a tool names a value in its own errors, a key or
a message by its tags. What it does when the value throws as it is named is decided before it is written, by
"Deciding": the run's rule for a defect is that neither is lost (`recordThrown`), and here the first of the two is a
failure of the test, no defect of the program. The other half of the item, a call's wait for its job raced with a
death, has no case once nothing throws in the fiber of effects: `docs/invariants.md` says so, or the race is written
if a case is found.

**Done when** "a hearNext stopped as its key goes away fails the test, and the rehearsal ends" (`rehearse.test.ts`)
passes unmarked; a test of the same form holds each other place that the item names (the job of a `hearNext` on a
start that has ended, a start that `hear` played, the end), and one holds a tag that throws in `doesNothing`, in
`describeAll` and in `unexpectedRejection`; each check has its mutation; both items leave "Open problems"; the
changelog has the fix, by `release`; and the checks of `change-engine` pass.

### 54. The rule as a boundary: a tool decides when, never what

**Model and effort.** Opus 5.5, `high`: a rule of `docs/invariants.md` said again, with the line of `change-engine`
that links to it, each sentence checked against the code.

**Depends on** step 53. Since steps 50 to 52, `src/testing/` uses none of the six: what it takes of `shell.ts` is
`makeDeaths`, `startFiber`, `commandFiber` and `stopping` (`drive.ts`, `rehearse.ts`, `simulate.ts` and `stage.ts`),
so the check passes once it is written.

**Why.** After them, each tool that plays a program runs it on the engine, and "when the engine or one tool changes,
keep the others in step" (`docs/invariants.md`, `change-engine`) is a duty with nothing left to keep.
What keeps the tools aligned is then a structure, which a check can hold where a duty could not.

**How.**

1. A check, in `bun run lint`, that fails when a module of `src/testing/`, its tests aside, uses `Core.arrive`,
   `Core.reconcile`, `diesIn`, `scopedIn`, `rootedIn` or `runSubscription`. The library's modules are imported as
   namespaces, so `no-restricted-imports` cannot name a member: either `src/testing/` is forbidden `core.ts` and
   `shell.ts` whole, and takes what it may use from `engine.ts` and `run.ts`, or a script reads the uses, as
   `tools/comments.ts` reads the doc comments. The smaller of the two, seen to fail on a use put back by hand.
2. The rule said as it then is, in `docs/invariants.md` ("The testing tools behave like the engine"), its one place
   since step 58, and in `change-engine` (point 4 of "Before the change") as a line that links to it: a tool that
   plays a program runs it on the engine; it decides when a command runs, when a subscription's message is heard and
   what fails the test; and it makes no step, no scope and no site of a defect. `AGENTS.md` names the invariants by a
   link alone since step 58.
3. The contract, `contract.test.ts`, read case by case: a case that gives a tool what the engine alone now does is
   held by the engine's tests and mutations. Each stays as an alarm or goes, by "Deciding", and none goes that a
   mutation still names as its killer.
4. The guide's "Testing tools" says "as the run does" of each tool already: it changes only if a sentence is found
   that the code no longer keeps, and then as `AGENTS.md` says.

**Done when** the check runs in `bun run lint`, and was seen to fail on a use put back by hand; the two documents
say the rule; each case of the contract is kept or removed, with its line in the commit; and `bun run comments`,
`bun run lint`, `bun run test`, `bun run test:node` and `bun run mutations` pass.

### 64. What an element gives is a message that the model holds, and inputs go

**Model and effort.** Opus 5.5, `high`: a page of the guide is a specification, and a concept leaves `compose.ts` with
its checks.

**Depends on** steps 60 and 62, which change the types of `program.ts` and `compose.ts`, and comes after steps 53 and
54, so that their fixes do not wait for the largest step. Step 61 decided it
([`decisions-weighed.md`](docs/records/decisions-weighed.md), point 4), and change 11 of
[`api-review.md`](docs/records/api-review.md) spells what the API loses.

**Why.** A model holds a message without its value, and the view fills what the element gives ("Inputs", "What an
element reports"). An input does the same job by a second concept: a place declared in `make`, a write that no model
holds, a rule of `set` that nothing checks, and a tool for that rule. One way is left: what the user types is a
message of the program, as a click is, and `update` decides what it does.

**How.** By `change-api`, `change-engine` and `add-example`, in this order, since each is checked before the next:

1. **The examples first, on the library as it is**: `examples/form`, `examples/stocktake` and the named timers of
   `examples/timer`, each with its views and its tests. A value that an input held is a message of the program, named
   by what happened (`NameTyped { value }`, and `CountTyped { id, value }` for a row). `update` stores it where the
   input's place was there, and rejects it elsewhere. The model holds its held part, `{ _tag: 'NameTyped' } as const`,
   in each case where the view draws the element to be written into. The reader of each test fills the held messages,
   with a value other than the one the model shows, and gives them to `dispatchViolations` with the rest. A test of
   `placeViolations` goes: `update` is tested there as for any message. If a value is found that an input serves and a
   held message cannot, the step stops here, with a report, and changes nothing.
2. **The guide**, one section at a time, each sentence checked against the old one. A rule that still holds keeps its
   words.
   - The page "Inputs" becomes "What an element gives" (`site/guide/what-an-element-gives.md`), and says what the user
     types and what an element reports one way. Its first rule: "**What an element gives is a message of the
     program**, as a click is: `update` decides what it does. The model holds the message without the value, and the
     view fills it." "Why what the user types is no message", the rules of an input and of a `set`, `store` and
     "Inputs by id" go. What is typed in another form is what `update` stores. A lock is a case of the state in which
     `update` rejects the message and the model holds none. "The element on screen", "What is there whatever is drawn
     is a subscription" and "A value is never a reason to reject" stay. "Only a plain tagged message can be held
     without a value", under "What an element reports" of that page, loses the way of a write, then a message: a
     message that an element fills is a plain tagged one.
   - "Model", "Messages live in the model": the bullet on what the user types goes, and the bullet on a fact that comes
     with a value says it of every value that an element holds or reports, the text of a field first. The sentence "A
     view writes only into the inputs that the model shows" goes, and "Its shape says what the view shows" says the
     values that the view draws in a case, where it said the values of the inputs.
   - "Guarantees": "An input stores what is written, where its place is there" leaves "What you can rely on", since
     "Outdated clicks are harmless" holds of what is typed as of a click. "What is left to you" loses "A `set` changes
     its place, and nothing else", and what "A view sends only what its model holds" and the item of flags and keys
     say of an input. Its item on the stack of whoever sends the message says "An element that reports at each of its
     events, as a scroll does, runs a step at each, in its handler", with no sentence on a write. Its item on purity
     loses "the `get`, the `set` and the `store` of an input and an `at` that is a function of the id" from the
     functions that are pure, and "the `get`, the `set` and the `store` of a write" from what runs in the parent's
     `update`. "How the tests check them" follows the search.
   - "Running", "When a defect happens": "A function that a parent or an input gives" says "A function that a parent
     gives", and the item of `'update'` loses "the `get` and the `set` of an input".
   - "Rejections and defects": "A message of the view that is not a write into an input is rejected" says "A message
     of the view is rejected", the "Three other kinds of message" are two, and the table loses its row of a write. The
     sentence after the table stays: a screen older than the state is that of a message of the view.
   - "Coming from Elm or React". Elm's row of `onInput` says "A message for each keystroke too: the model holds it
     without the text, and the view fills it". Under "What is new", "Inputs" becomes "**A message that an element
     fills.** As in Elm, what the user types is a message, and `update` stores the text. The model holds the message
     without the value, and the view copies the value from the element into it", and a fact that comes with a value
     is said there as another case of it. React's row of a controlled `<input>` says "A controlled `<input>` too:
     `value` is the model's, and `onChange` sends the message that the model holds for it, filled with what the
     element holds". Each links the new page.
   - "View", "Rules": the sentence on an element with a value of its own links the new page.
   - The guide's index has `./what-an-element-gives.md` among its `children`, where `./inputs.md` was. Its item of
     "Composition" says "a parent declares its children, and says where each child lives in its state", and that of
     the page: "[What an element gives](./what-an-element-gives.md): values that an element holds or reports, such as
     the text of a field or the offset of a scroll. Each is a message that the model holds without its value, and that
     the view fills."
   - "Composition": "The parent's inputs", "The rule of an input" and what names an input under "What does not
     compile" go. "A row whose value the parent reads" says a message of the parent's own, with the row's id.
   - "Events and external messages" loses "An external message never writes into an input". In "Structuring a
     program", "Input is never a reason to reject" becomes a case of "A value is never a reason to reject", and the
     table of "What kind of thing is it" names no input.
   - "Testing" and "Testing tools" lose what a reader does for an input, "The place of an input" and
     `placeViolations`. In "Writing a bridge", the handler of a controlled element "sends the message that its model
     holds for it, filled with what the element holds".
   - The glossary loses **Input**, **Write** and **`at`**, and what **Controlled element**, **Composition** and **By
     id** say of an input. "Anatomy of a program" draws its loop with no input.
   - The fourth step of the tutorial teaches the same, as "What the user types"
     (`site/tutorial/4-what-the-user-types.md`, where `4-inputs.md` was). The tutorial's index follows, in its
     `children`, in its items of steps 4 and 5 and in its sentence on a native controlled element, and so do the links
     of `1-first-program.md` and of `3-children.md`, and "An input" of `5-testing.md`, which says how a test fills a
     held message.
   - Then a search of what a user reads is read line by line
     (`git grep -n -i -w -E "inputs?|writes?|written" -- site skills README.md`), once point 4 has changed the skill
     and the README: what is left names an `<input>` of the DOM, what the user writes or types, or what a program, a
     test or a tool writes as code. And `git grep -n -e 'inputs\.md' -e '4-inputs' -e '"Inputs"'` finds a line only
     in this step, in the released sections of `CHANGELOG.md`, in `docs/records/` and in `docs/rejected.md`: no link,
     no `@see` line of a doc comment, and not the example in the header of `tools/comments.ts`.
3. **The library**, as change 11 spells it. `src/input.ts` and `src/testing/place-violations.ts` go, with their tests.
   `src/compose.ts` loses the placements, the routing of a write, and what its types say of an input (`Inputs`,
   `InputMessages`, `NoShared`, and the half of `NoClash` on an input). In `src/dispatch.ts`, the two refusals of
   `forwardTo` take the keys that change 11 spells, and the doc comments of `IdOf`, of `ChildDispatch` and of
   `forwardTo` name a child alone, with no line on `Written` and no `@see` of "Inputs". `src/dispatch.test.ts` reads the
   new keys, in a test whose name says that a name is no child's. Each mutation of an input goes, or loses "or of an
   input". The tests of the library, of the bridges and of the tools that wrote into an input send a held message:
   `bridges/bridge.test_suite.ts` and the bridges' own tests, `src/interleaving.test.ts`, the tests of the testing
   tools, `tools/smoke/`, `tools/inference/` and `tools/bench/writes.ts`.
4. **The documents.** In `docs/invariants.md`, "A write is stored wherever its place is there" goes, and "What a screen
   shows of an input is the bridges'" says it of a controlled element, under a title that names one, with its reason
   said of a message that an element fills. "The children are those the parent's own state lists" loses "a write into
   its input" from the steps of the parent's own code, and "as a write does" from what a message of a view carries.
   `docs/premises.md` cites the invariant of the bridges by its new title, in the premise of a store updated outside its
   events. In this file, the item of "Any time" on a benchmark says what `tools/bench/writes.ts` measures once point 3
   has written it again. Then a search of the three is read line by line
   (`git grep -n -i -w -E "inputs?|writes?|written" -- docs/invariants.md docs/premises.md ROADMAP.md`): what is left
   names an `<input>` of the DOM, what a thunk or a tool writes, or the inputs as what this step took away. In
   `docs/rejected.md`, the entries whose subject is a form of an input are gathered in one, "An input declared
   in `make`, whose writes the library stores", which says why it went, and what would bring it back: a value of an
   element that a held message cannot carry, or programs that lose what is typed where their tests with
   `dispatchViolations` pass. "An entry of each input in the model", "A write, then a message" and "`hear` refusing a
   write into an input" are set right: each says of an input what was, the first names no step of this file, and the
   second loses "It stays the way for a message that is a class". An entry on something else keeps the names of its
   day, since it tells what was weighed then, and is not edited: "`write`, `isRejected` and `raise`", "`child`,
   `childById`, `input` and `inputById` as free functions", "Other names for `childById` and `inputById`" and their
   like. So `docs/rejected.md` is outside the search of "Done when". The skill, the README, the doc comments and the
   changelog follow, the last as change 11 words it (`release`). In the README, the rows of `form`, `stocktake` and
   `timer` say what each example shows then, and the link to the page is the one that the built site gives it. In the
   unreleased section of the changelog, the entry on the page "Inputs" names the page by its new title. The documents
   of the agents follow too:
   - `AGENTS.md` and `.agents/skills/change-engine/SKILL.md`, in its description and in its first paragraph, list the
     modules of the engine without `input.ts`. In `AGENTS.md`, under "A function earns its place", the declaration
     that takes a standard type of Effect is the `flags` of a child, an `Option`, where it was `at`, an `Optic`.
   - `.agents/skills/add-example/SKILL.md`. In its item "The view", the sentence on an input declared in `make` says
     that a native controlled element has the value that its model holds in `props`, no key, and a handler that sends
     the message that its model holds for it, filled with what the element holds, as "What an element gives" says. In
     "A bridge owes no `messagesSentBy`", the clause on a view with an input that expects its writes goes: a held
     message is in `messagesOf(model)` already. Its last paragraph names the fourth step of the tutorial by its new
     title, with the modules of `examples/timer` that the step has then. Its first paragraph names no optics: no
     example places a child with one.

**Done when** the examples, the tutorial and the bridges' tests send what an element gives as a held message; what
change 11 removes is named in no file, `AGENTS.md` and those of `.agents/skills/` included, but `CHANGELOG.md`, in its
released sections and in the entry of change 11, `docs/records/` and `docs/rejected.md`, which keep the names of their
day; the two searches of point 2 leave what it says; and `bun run typecheck`, `bun run lint`,
`bun run test`, `bun run test:node`, `bun run interleavings`, `bun run comments`, `bun run build`,
`bun run api --check` once `bun run api` has written the reports, `bun run smoke`, `bun run inference`,
`bun run mutations` and `bun run test:browsers` pass, and the site builds with no warning
(`cd site && bun install && bun run build`).

### 55. The review before the release

**Model and effort.** Opus 5.5, `high`, by a reviewer that wrote none of the changes
([`premise-review`](.agents/skills/premise-review/SKILL.md)).

**Depends on** steps 60, 62, 63, 53, 54 and 64, and comes before the release that follows them.

**Why.** Steps 49 to 54 move a check from a tool to the engine, or take one away with the code it guarded: a premise
may leave with it, and no test fail. From step 52 on, `simulate` rests on the engine's premises, and no longer on
those of a fork of its own. Step 56 made the guide promise only its rules, and steps 57 to 60 change what it
promises, and how the API is written. Step 57 made a state current only once its keys are, a defect of `subscriptions`
leaving the state as it was (`applyOne` in `engine.ts`, and `stepped`, which the stage of the tools reads), and added
the premise of one channel run again, the first on the user's own value. Steps 62 to 64 each take an invariant away:
a state that is an object, with a child's model kept by its instance since; the end's own report of the defects, read
from the register alone since; and the rule of an input.

**Done when** the review has read the engine and the testing tools over the changes since the last review; each
finding is an item of "Open problems" with its `test.failing`; each place where the code or a document says otherwise
is set right; `docs/premises.md` says what `simulate` rests on; and the checks of point 1 of "Releasing", in
`release`, pass.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **The release that follows step 55.** An agent prepares its commit and its tag (`release`) when the owner asks for
  it, and the owner pushes them and publishes the package.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API. Until then,
  releases stay at 0.x.

### 47. Ask Effect to document what the library rests on

**Model and effort.** Opus 5.5, `high`, for the drafts: each request states a general rule of Effect, true of its
source.

**Depends on** no other step. Step 46, which weighed the guarantee of an interruption by the program, was closed on 24
November 2026 with the guarantee kept: its two premises stay in `docs/premises.md`, and are asked here.

**Since the upgrade to Effect 4.1.5** (23 November 2026), its JSDoc documents seventeen of the thirty-one premises on
Effect, which left `docs/premises.md` with their tests: what `FiberSet.run` and `FiberMap.run` promise of the fiber
they fork, a fork's region and `startImmediately`, the cleanup of `Effect.onExit`, the order of a scope's finalizers, a
handler that an interrupted fiber skips, the annotations of `Fiber.interruptAs`, the races, `acquireUseRelease`,
`suspend`, `Fiber.await`, and the clock of a timeout and its default. Thirteen are left to ask, the scheduler's aside.

**Why.** A behaviour that a stable API documents is no premise (`docs/premises.md`, "The rule"): Effect
keeps it within the major, and a change of it is Effect's to announce. It is the one way a premise leaves the list
with nothing of the library changed, and what would reopen the caret (`docs/rejected.md`, "A caret as the peer range of
Effect").

**How.** Each premise on Effect, in the order of the sort: those that hold a guarantee, the broad ones first; then
the where and the order of a defect; then the testing tools'. A request asks for the general rule, never for the
library's case: when a scope runs its finalizers, not that the engine's end runs before its sets close. Read first
whether the JSDoc of the newest Effect says it already (`upgrade-effect`, step 4 of "Upgrading Effect"), what
effect.website and the `ai-docs` of the package say of it, and whether an issue asks it: the request cites what they
say, as Effect-TS/effect#10719 cited the website, since a maintainer reads it with them in mind. A request is an issue,
or a pull request of the JSDoc alone where the rule is a sentence. An agent drafts each, with its text, and the owner
opens it, in the owner's name. That of `Stream.callback` is one of them, as a case of the scope a stream runs in. The
premise of the scheduler of the tests, and that of the JavaScript engine, are not asked.

**Asked on 24 November 2026**, before step 46 was closed, in Effect-TS/effect#10877, after the two requests answered
(Effect-TS/effect#10667 by Effect-TS/effect#10683, and Effect-TS/effect#10719 by Effect-TS/effect#10731). What the
first answer chose not to promise is not asked again: a rule for callbacks that throw, `run` on a closed container,
when a loser is interrupted, how the failures of cleanups combine, and the turn of a deferred fork. The second took all
eight rules of its request. So #10877 asks four rules, each checked on `effect@4.1.5` on every function it names, and
holds five premises, which name it:

- the scope a stream runs in: a run function makes one of its own, closed before the run completes however the stream
  ends, and a pull runs in the scope it is given, while `Stream.toQueue` and `Stream.toPubSub` run the stream as a run
  function does; `callback`, `Channel.callbackArray` and `unwrap` give their effect that scope, and
  `Channel.acquireRelease` its release; `scoped`, `ensuring`, `onExit` and `Channel.acquireUseRelease` release as their
  part ends by itself, and a part that what follows it stops (`Stream.take`, a later operator that dies) with the scope
  the stream runs in, so under a pull only as its scope closes, a difference it asks about. It holds the premises of
  `Stream.callback` and of `Channel.toPull`;
- an external span records nothing (`tracerLogger`, `annotateCurrentSpan`, `currentSpan` under one);
- a logger of `Logger.make`, or derived with `Logger.map` or `Logger.withConsoleLog`, runs synchronously in the fiber
  that logs, and dies there with what it throws, asked of loggers alone, as the first answer wrote one for `suspend`;
- `HashMap`, `HashSet`, `MutableHashMap` and `MutableHashSet` call `Equal` and `Hash` only during a call: not a rule of
  `Equal`, since a `FiberMap` compares a key in a fiber's observer.

Its draft read the JSDoc alone: the rule above on effect.website and `ai-docs` came after it, and they were read once it
was opened. Of its four rules, only the scope of a stream has a word there, the example of `Stream.callback` in
`ai-docs`, which its premise names; the site shows streams that release, and says nothing of which scope or when.

Not asked: the three premises of how the failures of cleanups combine (`Effect.onExit`, `Effect.scoped`, `Scope.close`)
and that of a `Deferred` resuming on the stack of whoever completes it, which fall under what the first answer
declined; and those of what a `Queue` and the runtime keep, whose fall would be a leak that Effect fixes as a bug.

**Still to ask**, since step 46 kept the guarantee that rests on them: what `Effect.interruptible` fails with, entered
by an interrupted fiber where it is uninterruptible (the second half of its premise; the first half holds only what
the guide leaves unspecified), and the fiber that code run on the stack of its forker sees as its own. Since step 57,
also that one channel runs afresh each time it is run, which the guide's `listen: () => ticks` rests on: a rule of
`Channel` in general, not of `listen`. Each is read first against what the first answer declined, as the others were.

**Done when** each premise on Effect names, in `docs/premises.md`, the request that the owner opened for it, or says
that none was asked and why. A premise leaves the list by an upgrade to the Effect that documents it
(`upgrade-effect`).

## Any time

None of these waits for the steps above, nor holds them up. Each is for Opus 5.5, `medium`, but where it says
otherwise.

- **What a real browser has not run of the bridges.** The bridges' tests run in Chromium, Firefox and WebKit
  (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows machine,
  Playwright's Firefox does not start ("side-by-side configuration is incorrect"). An IME is driven in Chromium alone,
  through its protocol: Playwright drives none in Firefox or WebKit, so a composition there is not run. With React, not
  run: `startTransition` or `useDeferredValue` in the application, Fast Refresh (likely to restart the run, as
  `<Activity>` does), and hydration: the guide promises that `Host` and `Draw` draw the first model on a server, run
  under `renderToString`, and nothing of hydration until `hydrateRoot` is run in a browser.
- **The search comes near the bound of the memory guard.** `test/memory-guard.test_worker.ts` says the heaviest file
  of the suite holds under a gigabyte, but `src/interleaving.test.ts` reached 980 to 1568 MB at its peak on 24 November
  2026 (six runs before step 50 and six after it, measured from a worker as the guard measures, the peaks before no
  lower), and the guard ended 2 runs of `bun run interleavings` in 14 after it, at 2050 and 2069 MB, and none of 6
  before. Whether the search holds what it no longer needs (a history kept by fast-check, a scheduler's log), or the
  bound is too low for it; never a bound raised without knowing which.
- **The README says what the library is and for whom, and names Foldkit**, as the owner's decision of 20 November
  2026 asks ([`adoption.md`](docs/records/adoption.md)): one reader starts a new application, the other has one
  already, most often in React.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a write into an input and a dispatch with its model read cost; neither runs in the CI. A CI machine's times
  vary, so what fails is a count that does not: how often `makeModel` runs, how many keys one message reconciles.
  What one step with many keys costs was measured by hand in step 57 ([`left-points.md`](docs/records/left-points.md),
  the last item): a start for its cases.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state and its revision to a
  queue, a fiber of whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step
  heard is saved.
- **The search laid out by guarantee.** The 21 properties of `src/interleaving.test.ts` sit in one `describe`. Each
  would go under a `describe` named by the bold title of the item of "What you can rely on" it checks, with one for
  what the guide says the search "also checks", and `bun run comments` would check the names both ways, with
  `sectionsOf` kept to that list. It ties an item to what the guide says checks it, which the `guarantees` of the
  mutations cannot, since the search kills no mutation. Not tried: a spike first, for whether every property falls
  under one item. It changes the layout of the tests of the engine (`change-engine`).
- **The reading of the guide's promises against the tests, as a skill run before a release**: since step 56, the
  promises are what stands under "Rules", under "What you can rely on" and in the types. The method of
  [`promises-and-tests.md`](docs/records/promises-and-tests.md), which found 65 promises outside "What you can rely on"
  that no test checks, written in `.agents/skills/` and named by `release`, as `premise-review` is. Fable 5.2, `high`,
  to write it: it decides what a release weighs. With it, the examples read against the guide, which no check does:
  each "Don't" of a page is looked for in `examples/`, and a comment of an example that gives a reason is reread when
  the rule it rests on changes.
- **A reader's check that meets what no check has met.** The six requirements of
  [`guide-reader`](.agents/skills/guide-reader/SKILL.md) are each a page of a browser with a value that is typed, and
  those that were drawn are drawn with snabbdom: each was chosen to need the pages that the guide has. The skill
  would list what a requirement may vary, and its step 3 would choose one that no earlier check had: a program drawn
  with the bridge to React, a node type with no DOM, a value that an element reports, a control that chooses among
  fixed values, tests that build their messages with constructors. And a third mode, an upgrade: coding agents upgrade
  an application that exists to the new version, from the package and its changelog alone, and report as a reader
  does. `release` would name it, for where the owner has such an application. What it finds is weighed on the
  library's own terms, as the record did. Done when the skill has both.
- **A program too large for one module that is not split into children.** "Structuring a program" says that a program
  lives in one module until it is too large, and then splits into children, and that a part that the parent reads is
  no child. So the guide has no page for a large program whose parts read each other. Its parts are plain code: an
  `update` and a `makeModel` of each concern, as functions of the whole state in modules of their own, with their
  steps chained by `andThen`, which the guide shows only between a parent and a child ("Events and external
  messages"). Reasoned, from the second opinion of 22 November 2026
  ([`kept-children.md`](docs/records/kept-children.md)), and not tried: it is tried first on a copy of an example that
  is not kept, as `stocktake`, for what it costs with the types of a `Step`. The rule of the guide that it adds comes
  first, since an example never brings the rule that allows it (`AGENTS.md`). It is weighed against the page as step
  36 left it: with `output` (step 35), a parent reads a value that its child declares, so "a part that the parent reads
  is no child" is written again there. Opus 5.5, `high`: a page of the guide is a specification.
- **The inference matrix crossed in pairs.** Its twelve configurations took 45 minutes on 22 November 2026, and its
  three default ones 16 minutes on 23 November, for 369,342 parts: the full product of its axes pays for most of it,
  and the order of the pieces and the annotations alone multiply every case by four. Since the forms not typed are
  judged by the rule of `AGENTS.md` ("What belongs here"), their axes may be crossed in pairs, as the axes of point 6
  of step 16 are crossed with the names (`crossings` in `tools/inference/generate.ts`), leaving time for more axes.
  Opus 5.5, `high`: what the matrix stops crossing is what it no longer checks.
