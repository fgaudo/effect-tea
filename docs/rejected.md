# What was tried or weighed, and rejected

The ideas for the library that were tried or weighed and rejected, so that a proposal reads them before it makes one
again. An idea rejected is added here, and taken out of [`ROADMAP.md`](../ROADMAP.md), in the commit that rejects it.

Each entry is a short paragraph: what the idea was, why it was rejected, on what evidence (**spiked**: code was
written and run, and the entry names where; **reasoned**: weighed by reading and argument alone), and what would
reopen it. A record that has the full account is linked, and not repeated. An entry is not a ban: it is reopened by
what its "Reopen if" names, or by another new fact, which the proposal names ("How a decision is taken and kept" in
[`AGENTS.md`](../AGENTS.md)).

## The engine and its guarantees

- **A bound on the messages applied in one call, with a defect past it**, for a listener of the `App` that answers each
  state with a message that makes another. Reasoned, 21 November 2026, decided against in step 57: an export and a
  number that nothing gives, for the few who subscribe to the `App` themselves. "What is left to you" names the case.
  _Reopen if_ a user's bridge or application meets the loop and cannot tell why, or a check needs no number.
- **Asking every `listen` to make its channel anew**, so that the library rests on no channel run twice. Reasoned, 24
  November 2026, in step 57: a rule nothing could check, where a value run again is how Effect's descriptions are
  written. The premise is listed instead ([`premises.md`](premises.md), "One channel runs afresh each time it is run").
  _Reopen if_ its test fails on an Effect the range accepts, or Effect says that a channel may run once.
- **Leaving "Only the run, and whoever runs it, interrupt them" to the program.** Reasoned, 19 November 2026, and
  weighed again on 24 November, when the owner closed the step that was to spike it and kept the guarantee: it would
  keep ways to end in silence (a run that hangs, a `hearNext` that waits for ever, `simulate` succeeding) in a library
  that forbids them elsewhere. Of its six premises, four are documented since Effect 4.1.5, one is by the model, and
  the open one went on 26 November 2026, with the question it answered ("Asking a fiber which interruptions it
  received", below). Weighed again in step 61, by the values: a command that never answers ends in silence (value 1),
  which no simpler engine pays for (value 5).
  _Reopen if_ a fiber the run forks can be interrupted without the run's mark by anything but the program.
- **`onApplied` and `onIgnored` as effects, each call in a fiber of its own.** Spiked, 19 November 2026 (`542cb6d` on
  `spike/strict-interruptions`, against `c69b78f` on `spike/synchronous-options`): correct under 1,424 interruptions,
  but about 28% fewer messages a second, where functions gave some 7% more. The owner chose functions as the cleaner
  form: what must wait goes in a command, a subscription or the renderer. Lost: an option that waits, and an option's
  logs through the run's logger. _Reopen if_ a use needs an option that waits and cannot be a wrapped `runCommand`,
  subscription or renderer.
- **`void` as the return type of `onApplied` and `onIgnored`.** Probed with `tsc`, 19 November 2026: a function that
  returns an effect is assignable to one that returns `void`, so the types would take an effect the run never runs.
  _Reopen if_ TypeScript can refuse a function that returns a value where it takes one typed `void`.
- **The root of a fiber the run forks as its one check of an unmarked interruption.** Spiked on the same branches: a
  root alone records the death only after the scope has released, and the run applies messages meanwhile (the search
  found it, seed `-1180227867`, path `819:0:0:0:0:4:3:5:5:5:3`); a root that takes any cause gave two defects for one
  interruption. Hence the scope and the root both. _Reopen if_ a death recorded after its release keeps the order of
  the defects and the end of the messages.
- **A flag for each fiber, in place of the mark on the run's interruptions.** Spiked, 13 November 2026 (`8b714ff`):
  false `ProgramDefect`s in `init` under some interruptions, nothing added once the fiber is asked what it received,
  and a self-interruption in a stopped fiber's release always lost, for one premise saved (documented since 4.1.5). The
  owner kept the mark; weighed again on 24 November 2026, read and not run. Since 26 November 2026 the mark names
  the fiber it stops and the fiber that stops it, which tells the run's stop from a self-interruption with no question
  to the fiber, reason by reason, so a flag would add nothing still. _Reopen if_ Effect no longer carries a request's
  annotations on its `Interrupt` reason, which it documents.
- **Asking a fiber which interruptions it received**, by entering `Effect.interruptible` where it is uninterruptible,
  to take for the program's each interruption of its cause that it did not receive. The engine's way until 26 November
  2026, dropped in step 106: what that region fails with is not documented, so "Only the run, and whoever runs it,
  interrupt them" rested on what Effect may change. It also took for the run's an interruption that a fiber of the
  program made with the annotations of another fiber's stop, which the fiber did receive. Run, not only reasoned: a
  mark that names the fiber it stops, and the fiber that stops it (`Stopped` in `core.ts`), needs no answer of
  Effect's, and was taken, with a test of each case in `run.test.ts`; gates of tests still ask the question
  ([`premises.md`](premises.md)). Reasoned, and not taken, since the first held: a request to Effect for the rule of
  what an interrupted fiber fails with as it enters an interruptible region, and a check of that premise as each run
  starts. _Reopen if_ a stop by the run must be told where no mark can reach, as in a fiber the run does not stop
  itself.
- **Promising the order of the defects.** Reasoned, 13 November 2026 (`858b819`): the owner would not bind a
  guarantee to what a function of Effect makes of a cause, even a stable one (`Cause.squash` takes the first defect).
  The run keeps the order; the guide promises that every defect is in the cause, with where. _Reopen if_ the promise
  can rest on the library's own code.
- **"A dispatch never runs `update` on the caller's stack", as a guarantee.** Reasoned, 13 and 14 November 2026, and
  reversed on 20 November 2026: a dispatch applies its message on the caller's stack, so that an element with a value
  of its own is drawn as a controlled one ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E1).
- **A dispatch that records a defect with a fiber made for it, and asks the runtime which fiber it runs in.** Spiked,
  20 November 2026 (`26b2cc1` on `claude/spike-sync-dispatch-b4e430`), refused by the owner
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E3): each half rested on a premise read only in the
  source. A synchronous `record` and a model's defect recorded where it is read need neither. Its second premise, a
  fiber resumed on the stack of whoever completes its `Deferred`, was adopted on 21 November as a premise of the tests
  alone. _Reopen if_ a defect must be recorded where a synchronous `record` cannot, and Effect documents that
  `Effect.runSyncExit` inside a running fiber leaves that fiber the current one.
- **A bound on how far the effects lag behind the state.** Reasoned, 20 November 2026
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E5): it needs a dispatch that waits, which a function
  called in a handler cannot be. _Reopen if_ a dispatch may wait.
- **A job for the fiber of effects only while debug logs are enabled.** Refused in the same spike, reasoned: it would
  rest on how `LogLevel.isEnabled` reads the level. Done otherwise: the run writes no log, and a job is made only for a
  step that has effects, decided from the step alone. _Reopen if_ the run writes logs of its own again, and Effect
  documents how `LogLevel.isEnabled` reads the level.
- **The run's own debug logs**, of each message, rejection, message dropped and subscription. Removed 20 November
  2026, reasoned, with the owner's yes ([`architecture-review.md`](records/architecture-review.md), "A run without logs
  of its own"): the options with a queue log the same, every program paid a job for each message, and they needed two
  options, three sites of a defect, an invariant and a premise. Lost: the log of a message dropped before `update`.
  _Reopen if_ a user needs to see what no option hears, and an option cannot be given it.
- **Skipping the start of a subscription whose key went away before the fiber of effects reached it.** Reasoned: a
  check of what the thunk changes made in another fiber ([`invariants.md`](invariants.md), "one thunk"), for nothing,
  since such a start's messages are dropped by their start. _Reopen if_ such a start is found to cost more than a start
  and a release, as a message of it that reaches `update`.
- **The fibers of the subscriptions kept by their key**, in a `FiberMap` keyed by `K`, once an `Equal` that throws was
  left undefined, so that where the map compares its keys no longer mattered. Spiked, 27 November 2026, uncommitted:
  `typecheck`, `test`, `test:node` and `interleavings` passed. Not taken: no line goes, the generation stays for the
  source of a message and for `rehearse`'s ledger, the map alone would differ from every other register of a start,
  and it would call the program's `Equal` and `Hash` again at each `get` and `run`. _Reopen if_ the generation goes
  from the messages and the ledger, so that its key is all that names a start.
- **One owner of the run's decisions, in other forms**: a death queued as a message of the loop, no check at all, the
  death interrupting the loop, and the loop calling `runCommand`. Spiked, 13 November 2026, and reasoned
  ([`single-owner.md`](records/single-owner.md), "Alternatives"): each applied messages after a defect, or rested on
  more mechanism than the form taken. _Reopen if_ a promise of the run comes to need a test that decides the order of
  yields again.
- **The shared core in a smaller form**: the guard alone, a core for `rehearse` alone, and the register of deaths as
  part of the step's state. Reasoned ([`shared-core.md`](records/shared-core.md), "Alternatives"): each leaves the
  engine's semantics in more than one place, or makes every end of a fiber a write of the step's state. _Reopen if_ the
  run and the testing tools come to share less than a step, so that copies kept in step by a test cost less.
- **One engine under the run and the testing tools, in other forms**: an engine generic in what performs a job, and
  one transition of `core.ts` for the pure half of a step. Reasoned, 21 November 2026
  ([`one-engine.md`](records/one-engine.md), "The form"): the first writes the order of a job again in each tool, and
  the second is moot with one thunk. _Reopen if_ a tool needs to change the order of a job, not only what a fiber of
  the program runs.
- **Other caches of a parent's lifted subscriptions, for children that share one state object.** Spiked and measured
  with `bun run bench`, 15 November 2026, against the positional cache taken then. Moot since the store (22 November
  2026): each child is kept in an instance of its own.
- **Telling `onIgnored` whether a rejected message came from the frame of the current state.** Reasoned, 16 November
  2026: the run has one dispatch and cannot tell a frame without a change of `Dispatch` and of every bridge, and
  reporting what the model holds and `update` rejects is the runtime check that "`reject` means one thing" rules out;
  `onIgnored` is given the state and the message, so an application may compare them. _Reopen if_ rejections in
  production are shown to hide bugs the property tests cannot reach, and a frame can reach the run without a change of
  `Dispatch`.
- **A bridge that tells the run which state it drew**, so that the run names the instances of that state in each
  message of a view, and a tap on a child started again since is rejected with no change to a program. Reasoned, 26
  November 2026, in step 92 ([`instance-in-view.md`](records/instance-in-view.md)): it holds exactly where a dispatch
  that names its instance holds, a handler of a draw older than the state, and not where a renderer has given the
  elements of the old child the handlers of the new one. It costs a rule of every bridge that nothing checks, a
  function of every program that names the instances of a message, and a run that knows of frames. A view gives its
  dispatch the number instead, which `makeModel` reads. _Reopen if_ a renderer can tell the bridge which draw the
  screen showed when an event was made.
- **`run` split into a synchronous half and the fibers.** Parked on 20 November 2026, then spiked and taken the same day
  ([`store-and-effects.md`](records/store-and-effects.md)): `start` gives `{ app, run }`.
- **Telling a program that was started and never run, as it runs**: a `dispatch` that throws, a warning or a log.
  Reasoned, 21 November 2026, with a second opinion: the library itself makes such programs (a server's first draw, a
  render React throws away, `Host`'s microtask), and nothing tells a forgotten `run` from one left out on purpose. A
  `run` left out of `start`'s result is a variable a linter reports. _Reopen if_ such a signal is found.
- **`rehearse`, owning what the test starts, in other forms**: spiked (`cb7dfd0`, `74b271f`) and reasoned; `db8309a`
  was taken ([`rehearse-owned-effects.md`](records/rehearse-owned-effects.md), "Alternatives"): the others leave a
  release that waits for ever, let the scheduler decide what a test sees, or change the state with no call of the
  test. _Reopen if_ the form taken lets something happen that the test did not do, or leaves a release waiting for
  ever.
- **What the tools do with a step that does nothing** ([`inert-steps.md`](records/inert-steps.md), "Alternatives"):
  `reject` in `onEvent`, whole (spiked: a child could no longer rely on its own transitions) or only where the child's
  step changed nothing (reasoned); a gate on a child, which would reject its own commands' answers; `Inert` by
  identity (spiked: programs that behave alike judged by how they build their state) or as an option (a check that is
  off finds nothing); and four forms reasoned in an application, 26 October 2026. _Reopen if_ `Inert`, always on and
  by `Equal`, blames a program for a step that does something, or misses one that does nothing.
- **A tool that explores a program from `init`.** Spiked, 14 November 2026 (`5476871` on `spike/explore`), rejected by
  the owner ([`exploration.md`](records/exploration.md)): one timer is 39,050 states, children multiply them, and on
  the five examples it found nothing their tests should have caught. _Reopen if_ a walk keeps a composed program
  tractable without the test choosing its states, or finds a bug that no test the tools allow finds.
- **A mark on a model's messages, so that a tool finds a reader that forgets one.** Reasoned, 15 November 2026
  ([`boundary.md`](records/boundary.md)): `Missing` finds such a reader, given a candidate that acts, and the mark costs
  a constructor in every model. _Reopen if_ a reader forgets a fixed message and no test with `Missing` finds it.
- **A failure of a call of `rehearse` failing the rehearsal from any fiber.** Reasoned, 15 November 2026, with a second
  opinion: the register of deaths means what the run died of, and a second record would fail a scenario that caught the
  failure. The guide says that a call's failure fails the fiber that made it. _Reopen if_ a test that forked a call and
  never joined it passed on a failure an application then met.
- **Every tool starting from `from` or `flags`.** Reasoned, 15 November 2026: `simulate` folds pieces from a step, as
  `applyAll` does, and `drive` and `rehearse` start as `run` does (`rehearse`'s `from` went in 0.8.0). _Reopen if_ a
  defect of an `init` with flags goes untested under `simulate`.
- **`hear` refusing a write into an input**, while the library had inputs. By a type parameter of `Shape` (reasoned, 16
  November 2026): invariant in `Rehearsal`, so every annotation by hand breaks, for one method. By shape (shipped in
  0.8.0, removed on 22 November 2026): it refused right tests with an error that named no rule
  ([`application-report.md`](records/application-report.md), point 4), and a heard write was applied as the run applied
  it. _Reopen if_ `Shape` gains a type of what its subscriptions send for another reason.
- **`rehearse` and `simulate` taking the options of `drive`** (`RunOptions`). Reasoned, 16 November 2026, with a second
  opinion: options are how a program runs, `onApplied` and `onIgnored` cannot change what a test checks, and in
  `rehearse` they would add points between a check and its act in the largest tool. _Reopen if_ a test of a program
  needs what an observer is told: then as records of data (`applied`, `ignored`), not callbacks.
- **A child's model kept by its state where the state is an object, and made anew, or kept by value, where it is
  not.** Reasoned, 24 November 2026, in step 61 ([`decisions-weighed.md`](records/decisions-weighed.md)), beside the
  model kept by the child's instance: a model made anew at each read is no model that a renderer can skip, so a state
  that is a number would keep less than the guide promises, and nothing lets go of a cache by value. _Reopen if_ a
  parent comes to keep a child with no object of the library's own for it.
- **`simulate` as a fold with no run**, as `applyAll` is. Reasoned, 24 November 2026
  ([`tools-on-the-engine.md`](records/tools-on-the-engine.md), "Alternatives"), and weighed again in step 61, by the
  values: it is simpler (value 5), and it would give a defect another site than the run gives it, so that two tools
  disagree on where a defect is (value 4). _Reopen if_ what the engine gives the tools comes to cost the run a
  guarantee.
- **A list of what a step told, in what the testing tools give.** Reasoned, 26 November 2026, in step 93
  ([`application-report-0.9.md`](records/application-report-0.9.md), point 6): a parent's `tell` is taken by the
  `update` that `make` composes, and leaves it as the child's state and commands, which a test reads where it reads the
  rest of the step ("Testing"). A list would be a fourth thing that each tool gives, made by the composed `update`
  beside the step that the engine takes (values 3 and 5), and would tie a test of the parent to the messages it sends
  rather than to what they did. _Reopen if_ what a child is told can leave nothing in its state or its commands that a
  test reads, or a test must tell apart two messages told that leave the same state.
- **`stateOf` refusing a state given that being told would change**, in place of telling each child once it is in the
  state given for it. Reasoned, 26 November 2026, in step 93: the check would rest on a child's `external` leaving an
  equal state when it is told again what its state holds, a premise of each program and false of one that counts what
  it is told, and on comparing states by `Equal`. Telling the child as a start does keeps "A child was last told what
  its parent's state gives" by construction, and a rule of the guide asking a test for such states was the last rung
  (value 2). _Reopen if_ a test must hold a child in a state that its declared `tell` would change.
- **A tilde as the peer range of Effect** (`~4.1.6`), with a release of the library at each minor of Effect. The range
  from 17 to 26 November 2026, which the owner kept on 23 November against a caret
  ([`premises-and-range.md`](records/premises-and-range.md)) and undid on 26 November. Reasoned, on a new fact:
  Effect's answers (Effect-TS/effect#10683, Effect-TS/effect#10878) left premises that it will not document, so the
  tilde would have meant following each release of Effect for good, and it kept no broken Effect out, since a patch
  may change what a minor may. The promises that rested on what Effect may change were narrowed instead, and the last
  one was given another design in step 106 ([`premises.md`](premises.md), "The rule"). _Reopen if_ a promise comes to
  rest on an open premise that no design avoids.
- **A check of the version of Effect by the library**, as it loads or as a program is made. Reasoned, 27 November 2026
  ([`application-report-0.10.md`](records/application-report-0.10.md), point 3): bun installs an Effect below the peer
  range with no warning, and two upgrades by coding agents ran so. The range is what a package manager enforces, as
  npm does, and the check would read Effect's version as the program runs, one more premise, to refuse an Effect on
  which the library's tests pass (4.1.5, in step 109). The changelog puts the entry of a peer range first instead.
  _Reopen if_ a program is found to misbehave, with no error, on an Effect below the range.

## The API

- **A check of the names in `program<{ … }>()` and `Program<{ … }>`.** Added and removed on 17 November 2026
  (`738f49c`): a misspelled name is a name not given, and the check kept none of the three rules of the types, for two
  twin markers. _Reopen if_ a misspelled name can make a broken program compile.
- **Checks that hold for a type parameter**, so that a function over any program declares it a child. Probed with
  `tsc`, 17 November 2026: a rule "exactly when" over a deferred conditional accepts nothing, and making it hold would
  rework every reader of `Program`. Such a function is an overload over erased types ("Composition"). _Reopen if_ a
  library of components over this one needs such functions often.
- **`DeclareChild<State>` in place of `DeclareChild<T>`**, and the same for its kin. Spiked, 18 November 2026: the types
  are the same, but a state written `Readonly<{ … }>` loses its name in the declarations, and the smoke test's count
  failed. Moot since step 115: the functions are of the package, their state a type parameter of each call, and
  `DeclareChild` takes no type argument. A child declared apart, whose options annotate a state written
  `Readonly<{ … }>`, still spells it out in the declarations (the smoke test's `children`). _Reopen if_ TypeScript
  keeps the name of an alias of an alias when it prints it.
- **`attempt`**, an effect that may fail as an execution with a message for each outcome. Removed in 0.7.0
  (`775f140`) by "A function earns its place" (`AGENTS.md`): it named `Effect.match` and `Effect.asSome`. _Reopen if_
  it does what they cannot.
- **`write`, `isRejected` and `raise`.** Removed in 0.8.0 by the same rule: names over the literal of a write, over
  `=== reject` and over the step `{ state, events: [event] }`, which `tsc` narrows and checks as they did. _Reopen if_
  one comes to do what the literal or the operator cannot.
- **A dispatch as an `Effect` that completes synchronously.** Reasoned, refused by the owner on 20 November 2026
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E2): an `Effect.runSync` and a fiber for each event
  from a plain callback, and a type that reads as a step that may wait. _Reopen if_ a dispatch may wait.
- **`onClick` and `onPress` in the bridges.** Removed on 20 November 2026 by "A function earns its place"
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), B2): names over a call a handler writes as it is.
  _Reopen if_ one does what a handler that calls `dispatch` cannot.
- **`subscriptions` optional on a program's type, with a public `subscriptionsOf`**, as from 0.4.0 to 0.7. Decided on
  18 November 2026: `make` is the one place where a config without them means listening to nothing; the `?` taken off
  broke only the library's own tests. _Reopen if_ a program cannot be written with `subscriptions`, or a test has no
  other way to read what it listens to.
- **Checking a program's external messages in `make`.** Spiked on 17 November 2026, with a second opinion: in the
  compiler's first pass the check breaks valid parents, and the form that holds only moves an error at the cost of a
  type parameter in every hover. Parts of it were taken, then went with external messages as a function of their own
  ([`external-handler.md`](records/external-handler.md)): moot since 20 November 2026.
- **An error at `make` for a `runCommand` that returns `any`.** Reasoned, 17 November 2026: services read as `unknown`
  close it for `any` and `unknown` alike; an `any` given by hand is TypeScript's own escape. _Reopen if_ one can be told
  from a program that needs no services.
- **`satisfies Program<…>` as the way to write a program without children.** Reasoned, 17 November 2026: `satisfies`
  leaves the literal its own type, which loses what its pieces do not show, and a second way to write a program
  confuses. _Reopen if_ a program that `make` cannot express is written that way.
- **`make` as `program` itself**, a call that names the types and takes the pieces. Reasoned, 17 November 2026:
  TypeScript infers no type arguments once one is given, so `make<T>()(config)` would come back under another name.
  The same reasoning kept `child` and `childById` in what `program<T>()` returns, so that their options knew the
  parent's state; step 115 probed it, found that in the call of `withChildren` they read that state from the type that
  `withChildren` expects, and made them functions of the package. _Reopen if_ TypeScript infers the type arguments a
  call does not give (microsoft/TypeScript#26242).
- **A second function beside `program` for a parent, `parent<T>()` or `parentProgram<T>()`**, while `child`,
  `childWhen` and `childById` are functions of the package. Weighed with the owner in the review of 27 November 2026,
  and decided in step 115: it would take the same types by the same signature. A program and a parent differ by their
  children, and the API forks there, at `withChildren`. _Reopen if_ a parent must name a type that a program without
  children cannot.
- **The functions that declare children given to a callback, `withChildren(({ child }) => ({ … }))`.** Probed in the
  review of 27 November 2026, with TypeScript 5.9, 6.0 and 7.0: it holds, with the state, the messages and the model
  of `examples/pages` the very same and the tags of a `tell` kept, and children declared apart are read from
  `ParentMaker<T, infer C>`. Decided in step 115: it is a callback for what an import does. _Reopen if_ the state no
  longer reaches the options of a child declared in the call of `withChildren`.
- **The children in the call that names the types, `program<T>(children)`.** Reasoned in the review of 27 November
  2026: TypeScript infers no type argument once one is given (microsoft/TypeScript#26242), so the children fall to
  their constraint, and lose their names. _Reopen if_ TypeScript infers the type arguments a call does not give.
- **The children and the pieces in one call, as two arguments.** Probed in the review of 27 November 2026: the children
  fall to their constraint there too, as in `program<T>(children)`. _Reopen if_ TypeScript infers one argument's type
  before it types the other's functions.
- **`program` as the name of `withChildren`, and `children` as another.** Weighed in the review of 27 November 2026:
  `program` would be one word for two signatures, which a module that imports `program` cannot destructure; and
  `children` is the word of what a parent's pieces take last. _Reopen if_ another word is found that says what takes
  the children and names no other concept.
- **A parent's children declared in the call of `make`.** Spiked, 22 November 2026 (`spike/tell-matrix.ts` on
  `spike/kept-children`), with TypeScript 5.9, 6.0 and 7.0: the literals of a `tell` lose their tags, and each needs
  `as const`. The owner chose `withChildren(children).make(config)`
  ([`kept-children.md`](records/kept-children.md), "Decided, under the store"). _Reopen if_ TypeScript keeps the literal
  types of a return inferred against a contextual type that holds a type parameter being inferred.
- **A child alone, always there or not, declared by one function, and children by id by overloads or by a conditional
  type of their two forms.** Spiked in steps 111 and 114, 27 November 2026, with TypeScript 5.9, 6.0 and 7.0. One
  `child`, whose form is read from what `there` returns, types options of either form, or that may be `undefined`, as
  a child that may not be there, and runs it as one always there. Its overloads print the error of the last one, at
  the option of the other form, and a last overload whose result is no child is a refusal at `withChildren`. Under a
  conditional type of the two forms of `childById`, the `Id` of `ids` does not reach `listening`, which takes `any`
  among the children of `withChildren`; a refusal of the other list typed `never` loses it too. Step 114 gave each
  form of a child alone a function, `child` and `childWhen`, read by the run from the function called, and
  `childById` one signature, whose lists are optional in a type that holds `Id` and whose conditional over `P` alone
  makes one required. An option of the other form is refused by a member that says what to write. _Reopen if_ the run
  can tell the form of a child from the types of its declaration, or TypeScript reports a failed overloaded call
  against the overload meant.
- **`childById` with one list for every program**: `ids`, and `flags: (state, id) => FlagsOf<P>`, required exactly
  when the program has flags, in place of the two lists and `ByIdForm`, so that `flags` has in `childById` the form it
  has in `child`. Probed in the review of 27 November 2026, with a signature declared and no body, with TypeScript 5.9,
  6.0 and 7.0: the types hold, as the `Id` inferred from `ids` alone types the `id` of `listening` and of `flags`.
  Measured on 27 November 2026, on the loop of `reconcile` in a script not kept, for a step of the parent's own that
  changes no child. With the rows in an array, as the guide keeps them, a `flags` that finds its row by id costs
  0.6 ms at 1,000 children and 59 ms at 10,000, where today's list, mapped from that array, costs 0.15 ms and 1.8 ms.
  With the rows in a `HashMap` it costs 0.09 ms and 1.2 ms, at every step: a list of pairs that the state keeps is
  skipped by its identity, and flags read at each id never are, as the id of a declared `tell` (below). The form
  would make the slow program the one that reads best, and break each program with flags by id, for a word that
  already says in `childById` what it says in `child` ("What `child` and `childById` take, mirrored in what they
  make", below). _Reopen if_ programs with flags by id are found to keep their rows by id, in a `HashMap` or a record,
  and to build the list of pairs for the library alone.
- **External messages answered by `update`**, so that a program has one function of its messages. Reasoned, 20
  November 2026 ([`external-handler.md`](records/external-handler.md)), and weighed again in step 61, by the values: a
  `tell` that `update` may reject ends in silence, or `reject` comes to mean a defect there (values 1 and 2), where
  `external` costs a second function for the message that a view and a parent both send. _Reopen if_ a program must
  refuse what its parent tells it, and neither its state nor an event can say so.
- **A message that a declaration routes down a chain of children, and an external message that a child refuses**: a
  `reject` in `external`, or a defect of the library's where a child is told what its output did not ask for. Asked by
  an application on 27 November 2026 ([`application-report-0.10.md`](records/application-report-0.10.md), point 6),
  whose back button goes down two levels. Reasoned. Which child takes a message, and before which other, is the logic
  of each parent, in one line of its `external` and one of its `output`, and the library knows no tie between an
  output and an external message. A `reject` would take back the step of the parent that told, as the entry above
  says, and would make silent what only a bug brings, where the child's `defect` is loud. _Reopen if_ a child must
  refuse what it is told in a state that its parent could not read from its output.
- **A child's subscriptions paused by an external message, in place of `listening`.** Reasoned, 24 November 2026, in
  step 61: the two would do one job, but a parent says from its own state when a child listens, as it says when the
  child is there, and each child that can be hidden would keep a state and an external message for it. _Reopen if_ a
  child must know that it does not listen, as one that waits for an end that its subscription sends.
- **A value of its parent that a child reads**, the mirror of `output`: the child names its type, and its `update`,
  `external`, `makeModel`, `subscriptions` and `output` take the value last. Spiked in the engine, 25 November 2026
  (`examples/cart/given.ts` on `spike/condition-down`; [`condition-down.md`](records/condition-down.md)), and reasoned
  for the rest. A child that reads cannot answer a change with a step, so one that must is told by hand again, and a
  condition goes down two ways. It leaves no copy and costs least, for a name in `program`, a parameter on five
  pieces, an option in `start` and in three tools, every reader of a program's types written again, and a program
  that no longer runs alone. A `tell` declared from the parent's state was taken instead. _Reopen if_ a condition is
  found that a child cannot keep a copy of, as one too large to tell each child, or a child must read it in its
  `init`.
- **A first step that tells its children.** Left in step 34 as what could be added with no break, and spiked on 25
  November 2026, in two lines of the engine (`examples/cart/init-tells.ts` on `spike/condition-down`): of the three
  rules of a condition handed down by hand, it removes the first value kept apart, which the declared `tell` removes
  with the other two. _Reopen if_ a parent must tell a child a moment as the program starts, which neither the
  child's flags nor a declared `tell` can say.
- **A declared `tell` that takes the id of a child, and what a child was last told kept in its instance.** Spiked, 25
  November 2026 ([`condition-down.md`](records/condition-down.md)). With the id, a step of the parent's own that
  changes nothing costs a call and a comparison for each child: 1 ms at 10,000 children with a constant, 9 ms with a
  literal, where one value for the children of a declaration costs 0.6 µs to 2.4 µs. Kept in each instance and
  compared at each step, what was told also set right a state that another program made, as one saved under an older
  `tell` and given back as `init`, at that same cost for each step: the call that tells keeps what it told, adds
  nothing to the state, and leaves such a state as it is until the value changes. A condition of each child, as which
  row is chosen, is told by hand. _Reopen if_ such a condition is handed down by hand in an application and its
  telling is found wrong where its tests pass, or a state saved under another `tell` is found to mislead a program.
- **`forEach`**, the n-ary `andThen`. Removed with the store, 22 November 2026: a parent lists what it tells in one
  `tell`, which `Arr.map` makes. `andThen` stays, the one place where two steps combine. _Reopen if_ a program must
  fold steps over items that each read the state before, and `andThen` in a reduce does not read well.
- **`andThen` over a `Transition`**, which would pass `reject` through, so that a program's `update` could chain the
  `update`s of two concerns. Weighed in step 68, 25 November 2026, on a copy of `stocktake` split into modules by
  concern, not kept: no chain was needed, since the concern that owns a message decides once whether it applies, and
  asks the others for a `Step` ("Structuring a program", "Splitting a program"). A second step that may reject would
  decide the same message twice, and `own === reject ? reject : andThen(own, next)` writes it where it is meant.
  _Reopen if_ a program shows a message that two concerns must each be able to reject.
- **A child's `key` that says whether the child is there**, beside `there`. Weighed in step 34, 22 November 2026: two
  functions would say one thing. _Reopen if_ a child there and one not need a key from one function, in a way `there`
  cannot say.
- **The last listing of children by id kept in the state**, for the shortcut of the reconciliation. Measured, 22
  November 2026: the same object from `ids` already skips it, at 0.2 µs, where 1000 children cost 154 µs without.
  _Reopen if_ a common form of `ids` builds a new iterable at each call.
- **Handlers of `update` by the case of the state.** Reasoned, 22 November 2026: `update` would no longer be one
  function a test calls with any message in any state, and the number of an instance and the state machine hold what it
  was for ([`kept-children.md`](records/kept-children.md), "What was not taken from the second opinion"). _Reopen if_
  an answer reaches, inside one program, a state its `update` cannot tell from the one that asked.
- **`renderToString`, a first frame for server-side rendering.** Reasoned, 16 November 2026, with a second opinion: the
  first model is data a program gives (`program.makeModel(program.init.state)`), and a server now calls `start` and
  reads the handle. _Reopen if_ a server needs the state after the commands of `init` have answered.
- **Offers as tokens, checked against `update`.** Shipped in 0.3.0 (`ae4661b`), removed in 0.6.0 (`3c3fdf9`): every
  page carried rules for a bug that leaves the state unchanged and the property tests find. _Reopen if_ such a bug is
  found in an application, and neither the property tests nor `dispatchViolations` find it.
- **An offer that asks `update`, and is an `Option`.** Reasoned, 22 November 2026: a model has cases and an `Option`
  two, it holds nothing by construction, it hides a rejection by mistake that `Rejected` finds today, it costs a call
  of `update` per message of each model, it can die in `makeModel`, and it is three lines over `update` and `reject`.
  A condition is a case of the state, or one function of it that `update` and `makeModel` both call. _Reopen if_ a
  control is shown in a state where `update` rejects its message, and no test with `dispatchViolations` finds it.
- **`describeKey`, an option for how a key appears in the logs and in a `ProgramDefect`.** Reasoned, 13 and 14 November
  2026, with a second opinion: a key is the identity its author chose, and reporting is the job of whoever runs the
  program. The guide says that what must stay private goes in a service. _Reopen if_ a program needs a key that must
  hold private data.
- **Input through a subscription**, a keystroke sent through a key in place of a dispatch. Reasoned, November 2026
  ([`declared-inputs.md`](records/declared-inputs.md), "What was proposed"): typed-then-Save would rest on scheduling,
  a typed message would be checked by nothing, a key that goes away drops what it sent, and the renderer would feed the
  run by a service. _Reopen if_ a renderer cannot call a dispatch from the callback where the user types.
- **What reaches `update`, declared as data.** Spiked three times on 14 November 2026, suspended, and rejected by the
  owner on 23 November 2026 ([`declared-inputs.md`](records/declared-inputs.md), "Weighed again"): its aims were reached
  otherwise, and the rest would rewrite every program. _Reopen if_ a key's message or a command's answer that `update`
  rejects is found in an application, and no test the tools allow finds it.
- **A subscription that declares what it sends.** Parked on 15 November 2026, rejected by the owner on 23 November: a
  type of the library's own where `Subscription` is Effect's. A test lists what each key sends, a function of the type
  of the keys ([`bounce`](../examples/bounce/bounce.test.ts), [`volume`](../examples/volume/volume.test.ts)). _Reopen
  if_ a key's message that `update` rejects, or that does nothing, is found in an application, and such a test does
  not find it.
- **A value that an element reports, declared in `make` with the message made of it.** Reasoned, 23 November 2026: it
  holds nothing the held message does not, for a third way to send. _Reopen if_ a model cannot hold such a message as
  data, or a view cannot fill it without building the rest.
- **A write, then a message, as the advised way for a fact that comes with a value.** Advised from 22 November 2026,
  while the library had inputs, dropped on the 23rd for a message the model holds without its value
  ([`value-in-message.md`](records/value-in-message.md), "Decided"): two steps per fact, and a view that forgot the
  write compiled. _Reopen if_ a held message cannot be filled with what the element gives.
- **An input declared in `make`, whose writes the library stores**, with its forms: a `Field` with a revision, the
  replacements of whoever steps declared, a bare optic, an exported `byId` optic, a value changed as it is stored, a
  condition on the declaration, handles of the inputs in `makeModel`, a lock derived from the model, a `set` free to
  change the state, a place as an optic alone, and the form's place kept while it saves with its writes `withheld`
  (14 to 22 November 2026: [`registers.md`](records/registers.md), [`stored-form.md`](records/stored-form.md),
  [`application-report.md`](records/application-report.md)). Shipped in 0.8.0, removed on 25 November 2026, as step 61
  decided ([`decisions-weighed.md`](records/decisions-weighed.md), point 4): it did by a second concept what a message
  that the model holds without its value does, with a place declared in `make`, a write that no model held, a rule of
  `set` that nothing checked, and a tool for that rule. What is typed is a message of the program, as a click is, and
  `update` decides what it does. _Reopen if_ a value of an element is found that a held message cannot carry, or
  programs lose what is typed where their tests with `dispatchViolations` pass.
- **A parent that reads its children's inputs; a parent's `update` given its children's models; a write into a child's
  input that raises an event**, the first and the last while the library had inputs. Reasoned, 16 November 2026, and
  weighed again on 22 November when `output` was taken ([`kept-children.md`](records/kept-children.md), "A value that a
  parent reads"): a parent gets no child's state, a model has one reader, and a parent keeps no copy. A value the user
  writes belongs to the program whose rules use it ("Structuring a program"); what a parent must read of a child is its
  `output`. _Reopen if_ a value the parent must read can be neither a message of its own, by id or not, that `update`
  stores in its state, nor a child's `output`.
- **An entry of each input in the model, which a view wrote through**, while the library had inputs. Spiked on 20
  November 2026 (`17534ff` on `claude/spike-input-in-model`), rejected by the owner
  ([`input-in-the-model.md`](records/input-in-the-model.md)): it bought what the tests found already, cost a type of
  the library's in every model, and closed neither a write built by hand nor the route above the program. Weighed again
  in step 61, 24 November 2026, as plain data, the write without its value, given to `makeModel`: left, since a message
  of the program held without its value is that data with no declaration, which took the inputs' place on 25 November
  ([`decisions-weighed.md`](records/decisions-weighed.md)). _Reopen if_ a view sends a value its model does not hold
  for that element, where its program's tests pass.
- **The wrapping of a child's message as a public, or an internal, function.** Reasoned with a probe of `tsc`, 15
  November 2026 ([`boundary.md`](records/boundary.md), "A question"): the compiler already refuses a wrong name, id or
  message in a literal; the one check it adds is a stray `id` on a literal that is not fresh. Asked again on 27
  November 2026, for a test's messages that name an instance
  ([`application-report-0.10.md`](records/application-report-0.10.md), point 7), with no new fact: the literal is
  `{ _tag, instance, message }`, and a message for a child that is not there names no instance. _Reopen if_ a tool must
  lift a child's message with no type to lean on, or the stray `id` is found in an application's tests.
- **Every message of a child's view bound to its instance**, so that `forwardTo` always takes the number, a message
  has one form, and the rule of ids that are never reused goes. Reasoned, 26 November 2026, in step 92
  ([`instance-in-view.md`](records/instance-in-view.md)), by the values: it is the form of a command's answer (value
  4), and one way to send (value 3). But every parent would hold a number for each child in its model, and every test
  would name instances in the messages that it writes and in its `candidates`, where a message that names none says
  what such a test means: the child that is there. And it would not close the case that only a key of the renderer
  closes, a tap that runs a handler of the latest draw. The number is given where the view may be older than the
  state. _Reopen if_ a message that names no instance reaches a child started again in an application whose renderer
  draws each state before the next event, or the tests come to name an instance without its number.
- **The number of an instance as a parameter of `forwardTo`**, after the id, `forwardTo(dispatch, 'Row', id,
  instance)`, or in an object of options; **an address that `makeModel` reads whole**, `children.X.address()`; and
  **the number read in `update`, `external`, `onEvent` and `output`**. Reasoned, in the same step. `forwardTo` is given
  no program, so at run time it cannot tell an instance from an id: `forwardTo(dispatch, 'Clock', 3)` from
  `forwardTo(dispatch, 'Row', 3)`. An object in place of the name, `{ _tag, id, instance }`, says which it is, and is
  the child's message without its `message`, which a test's reader writes too. An address would be a new word for the
  number, the name and the id together, where a view needs the number alone as a key. A step that read the number
  would make two states that differ in their numbers alone behave apart. _Reopen if_ a view is found to pair a
  child's model with another child's name, which an address would refuse, or a step must tell one start from another.
- **A reading of a child that may not be there which throws where it is not**, a `CompositionDefect` as for an id that
  is not listed, **and one reading of its model, its output and its instance**. Asked by an application on 27 November
  2026 ([`application-report-0.10.md`](records/application-report-0.10.md), point 5). Reasoned. The first would give
  the three kinds of children one form of reading, and take from a parent the defect that it writes where a case of
  its state goes with the child. But it would compile and then die where the `Option` refuses, against the second
  rule of the types of a program (`AGENTS.md`, "What belongs here"): a child by id throws only because no type lists
  its ids. The second is `Opt.all`, and would be a name over Effect's combinator. _Reopen if_ TypeScript comes to
  narrow what `children` gives by the case of the state that `there` reads, or parents are found to write that defect
  at most of their readings.
- **Following a string in a child's wrapping, in the default description of a message.** Reasoned, 15 November 2026:
  `describeByTag` meets a program's own values, and would name its text, where only tags are named. _Reopen if_ a
  wrapping the describer can tell from a program's own value comes for another reason.
- **`forwardTo` dual.** Spiked, 16 November 2026, uncommitted: the overloads made the errors of the common form worse,
  for one nesting. _Reopen if_ `dual`, or TypeScript, reports a failed overloaded call against the overload meant.
- **Other names for `forwardTo`** (`dispatchTo`, `dispatchOf`, `dispatchFor`, `childDispatch`, `tagged`, `wrapAs`).
  Reasoned, 16 November 2026, with a second opinion: `forwardTo` reads as it works, as Elm's `Signal.forwardTo` did.
  _Reopen if_ a reader of the guide finds it misleading.
- **Other names for `childById` and `inputById`** (`each`, `eachInput`, `eachChild`, one `each` for both). Reasoned,
  17 November 2026: the four names make a grid, the noun what and the suffix how. _Reopen if_ a reader finds `ById`
  misleading.
- **Other names for `simulate`, `rehearse` and `drive`**, and one form for `Driver` and `Rehearsal`. Reasoned, 24
  November 2026, in step 59 ([`api-review.md`](records/api-review.md)): `perform` beside `rehearse`, or a name that
  says the difference (`applyAllAnswered`), trades one metaphor for another, or a word for a phrase, at some 300
  calls, and `drive` is the word of testing tools for acting on a running application as its user. Their form tells
  them apart: two fold messages, two play a scenario. `Drive`, for `Driver`, would hide the tool in a scenario that
  names its parameter so. _Reopen if_ a reader of the guide takes one tool for another by its name.
- **`onRejected`, for `onIgnored`.** Reasoned, in the same step: `update` rejects, and the run ignores what it
  rejects, as it applies what `update` accepts, so each option is named by what the run did. In a testing tool the two
  words part: a rejected message is ignored, or fails the test. And `Rejected` is the type of `reject`. _Reopen if_ a
  reader looks for the option under `reject`, and the glossary's line on what is ignored does not lead there.
- **`model` for `makeModel`, and `keys` for `subscriptions`**, so that each piece reads as `output` and `listen` do.
  Reasoned, in the same step: a model is made, and kept by the identity of its state, where an output is read;
  `subscriptions` is Elm's word for what a state listens to, and its keys are how it says it; and `makeModel` is in
  every program, and in 735 lines of the repository. _Reopen if_ a reader takes either piece for something else.
- **A second entry of the package for the types that only signatures name** (`ProgramMaker`, `DeclareChild` and their
  kin). Spiked, 24 November 2026, with TypeScript 7.0.2, on a package of two entries, outside git: a declaration that
  needs such a type, in a file that imports the first entry alone, fails under `bundler` (TS2883), and names a path
  inside the package under `nodenext`. They stay in `.`, last in the reference, in a group of their own. _Reopen if_
  TypeScript names a type through an entry that the file does not import.
- **The types of the functions of `program` written in place**, with no name for `MakeProgram`, `MakeParent` and the
  five `Declare…`, to leave two exports of nine. Spiked, in the same step and the same way, on a copy of `src/`: a
  module that exports `child` or `make` then spells out the types of `compose.ts` in its declarations, and the smoke
  test counted its consumer's state spelled out 80 times with `make` written in place, where it counts 14. _Reopen
  if_ a declaration comes to print such a function without spelling out its types.
- **A group of the reference for each concept**, as the comments of `src/index.ts` sort the exports. Reasoned, in the
  same step: a tag on each of 84 exports, kept by hand with nothing to check it, for a page that a reader reaches
  after the guide, which sorts the concepts already. One group is kept, for what no program writes. _Reopen if_ a
  reader cannot find an export in the reference by its kind, or a tool reads the groups from the index.
- **Another name for `Field`**, the type that reads one name of `program<{ … }>`, since a state has fields too.
  Reasoned, in the same step: both are the field of an object type, so it is one concept; no program writes it, and
  the reference lists it among the types of the signatures; and some 100 lines of `src/`, of the reports and of the
  mutations hold it. _Reopen if_ a user comes to write it, or the guide names a concept of its own a field.
- **Other names for `run` and `runAll` of a `Rehearsal`**, since the run of the glossary is what `start` gives.
  Reasoned, in the same step, within value 3 of "Deciding": "one word for each concept" won over "one concept for
  each word". A command is run, in the guide and in `runCommand`, so `execute` or `perform` would give that concept a
  second word, and `rehearsal.runCommand` would give the name of the piece to a function of another shape. The two
  meanings share no object: `rehearse` starts no run, a `Driver` has no `run`, and a `Started` has no command to run
  by hand. Some 70 lines hold the name. The glossary's row **Rehearsal** says which `run` it is. _Reopen if_ a reader
  takes `rehearsal.run` for the run of the program, or one tool comes to give both.
- **Another name for the `key` of an `Instance` and of a `Child`** (`given`, `startedFrom`), which is the flags of a
  child with flags. Reasoned, in the same step: the member holds what the parent's state gave as the child started,
  the one value that tells a start from another, and flags do there what `key` does. No common word says both:
  `startedFrom` would say of what `key` gives what the glossary says of flags alone, and a new word is one more
  concept, for a member that no program writes and `stateOf` fills. Its doc comment says which of the two it holds.
  _Reopen if_ a child comes to have a `key` beside its flags (parked below), so that the member holds two values, or
  a test that reads `instance.key` takes it for a subscription's key.
- **What `child` and `childById` take, mirrored in what they make**: `ids` and `flags` in a `ChildById`, for `listed`
  and `flagged`, and `there` as a function in a `Child`; and another name for the `flags` of `childById`, which lists
  each id with its flags. Reasoned, 25 November 2026, in step 86 ([`names.md`](records/names.md)): a `Child` and a
  `ChildById` hold a declaration as the library reads it, with one function for whether a child is there and what it
  starts from. A mirror would have the types that read them decide by which option is present. `flags` says in
  `childById` what it says in `child`: the flags of each child that is there. Reopened on 26 November 2026, in step
  105 ([`child-declarations.md`](records/child-declarations.md)), by what it did not weigh: a program could write one,
  as a child always there whose `key` gives `None`, which compiled and died. Each is now a class whose constructor is
  private, and whose one member, the declaration, no program writes or reads, so a mirror has still less to mirror.
  _Reopen if_ a user comes to need what a declaration holds, outside the library.
- **A private constructor for `InvariantDefect`, `ProgramDefect` and `CompositionDefect`**, and a public one that
  takes their fields. The first was taken on 18 November 2026 (commit 41ba879), and dropped on 27 November 2026 by a
  test of the types: TypeScript refuses such a class wherever a public construct signature is asked for, so
  `expect(…).toThrow(InvariantDefect)`, which "Testing" teaches, did not compile under jest's types, nor did
  `Match.instanceOf` and `Schema.instanceOf` of Effect. Each constructor is public, and takes with its fields a member
  typed `never`, named by the rule. A program that goes out of its way gives one, as by a getter typed `never` or a
  type predicate that lies, and only misleads its own crash report. The second would make a defect two ways, `defect`
  and `new`, and a `ProgramDefect` that no run died with. _Reopen if_ TypeScript takes a class whose constructor is
  private where a construct signature is asked for, or a program is found to build one by mistake.
- **A copy of a child refused as its parent is made**: what `child` and `childById` made kept in a `WeakMap` of the
  object they made, and a `CompositionDefect` for an object that has none, as `Object.assign({}, child(p))`, which the
  types take. Written in step 105, and taken out by the owner on 26 November 2026: a copy holds the declaration that
  `child` made, so it cannot lie, and the defect was a promise, with its test and its mutation, that only the `WeakMap`
  needed. The declaration is the member of the class, and a copy is a child like the one it copies. Reasoned, with a
  sketch outside git that the types refuse the same forms either way. _Reopen if_ a copy that the types take is found
  to hold a declaration that `child` or `childById` did not make.
- **One word for the state in `Applied` and in `Ignored`**: `state` for `after`, or `before` for the `state` of an
  `Ignored`. Reasoned, in the same step: an applied message has two states and an ignored one has one. `state` beside
  `before` would not say which of the two it is, and `before` alone would promise an `after`. _Reopen if_ a third
  report of the run comes to hold a state.
- **`'runCommand'` and `'listen'`, for the sites `'command'` and `'subscription'` of `DefectSite`; `'makeModel'`, apart
  from `'render'`; and `site`, for `where`.** Reasoned, in the same step: a site is a moment of the run, not a function
  of the program. `'update'` holds `onEvent` and a child's `external` too, and `'render'` holds `makeModel` because a
  model is made as it is read, while a renderer draws. What dies in `'command'` is most often the effect that a command
  became, as it runs, and seldom `runCommand` as it makes that effect; and `Origin` names the same two, `Command` and
  `Subscription`. `'subscriptions'` and `'subscription'` differ by a letter, as the piece and what it lists do. `where`
  is the question that the field answers, as `on` is, and `DefectSite` names its answers. _Reopen if_ a crash report or
  a test is found to take `'subscription'` for `'subscriptions'`, or a user must tell a defect of `makeModel` from one
  of the renderer where the `cause` does not say which it is.
- **Other names in a `Rehearsal` and a `Driver`**: `listen`, for `hearNext`; `dispatch`, for `send`; and `model` as a
  function, as an `App` has it. Reasoned, in the same step: `send` goes through the model, as a user does, and
  `dispatch` is a `Dispatch<Message>` wherever it appears, so a `Driver` has both. `hear` says what was heard, and
  `hearNext` hears what the subscription sends next: `listen` would give the name of the piece to a function of
  another shape, as `runCommand` would for `run` (above). `model` is the model of the current state in each: a
  function for plain code, which a renderer calls, and an effect in a scenario, where it fails with the program's
  defect, as `state` and `pending` are effects. _Reopen if_ a reader takes `hear` for `hearNext`, or one object comes
  to give a model both ways.
- **`timeout`, for the `patience` of `drive`.** Reasoned, in the same step: beside a scenario, a timeout reads as the
  limit of the whole scenario, which the test runner has, and `patience` is that of each wait: how long the driver, a
  user, waits for a model. _Reopen if_ a reader sets `patience` to bound a scenario, or looks for it under `timeout`
  and does not find it.
- **Another name for the `subscribe` of an `App`** (`watch`, `onChange`), since a subscription, in the glossary, is a
  program's. Reasoned, in the same step, within value 3 of "Deciding", as for the `run` of a `Rehearsal` (above): it is
  the word of the contract that it fills. A bridge gives it as it is to React,
  `useSyncExternalStore(app.subscribe, app.model)`, and the writer of a bridge looks for a store's `subscribe`. The two
  meanings share no object: an `App` has no key and no `listen`, and a program no `subscribe`. _Reopen if_ a reader
  takes `app.subscribe` for a way to start a subscription of the program.
- **`onExternal`, for `external`, beside `onEvent`; and a plural noun for the `tell` of a step**, beside `commands` and
  `events`. Reasoned, in the same step, where the owner's choice of `external`
  ([`external-handler.md`](records/external-handler.md), "Decided") was weighed by the values: `external` has the
  name of its type in `program<{ … }>`, as `output` has, and is one function of a message, as `update` is, where
  `onEvent` is a record of handlers by child. `tell` is one word in a step and in a declaration, the guide's verb for
  what a parent does: a step lists the commands and the events that it made, and tells its children. _Reopen if_ a
  reader looks for `external` under `on…`, or takes the `tell` of a step for something else than a list.
- **A link from a doc comment to the site.** Spiked, 16 November 2026: the site keeps no older release, so a hover would
  show the next release's promises; `tools/comments.ts` refuses one. _Reopen if_ the site keeps each release.
- **A site that keeps each release.** Reasoned: infrastructure the owner declined for a rule of the documentation.
  _Reopen if_ the site is versioned for a reason of its own.
- **Links to the guide on GitHub, at the tag.** Reasoned: hosting outside the package, and GitHub shows TypeDoc's
  syntax as written. _Reopen if_ the guide no longer needs TypeDoc to read.
- **The guide in the package, linked from the comments by a relative path.** Reasoned: the hover never shows the rule,
  and whether an editor follows such a link was not checked. _Reopen if_ both are checked, and a hover that names a rule
  is enough.
- **Quotes of the guide written only into what the build makes.** Reasoned: they would miss the `src/` the package
  ships, and shift the declaration maps. _Reopen if_ the copy in `src/` costs more, in reviews or conflicts.
- **Doc comments for the users apart from those of the implementation.** Spiked on scratch projects, with TypeScript 6
  and TypeDoc 0.28.20: a comment on a re-export is ignored, a declaration again writes each signature twice, an alias
  loses its fields, and `@privateRemarks` shows in the hover. A note on the implementation is a `//` comment instead.
  _Reopen if_ TypeScript and TypeDoc hide alike a part of a doc comment from a package's users.
- **Doc comments that quote the guide, word for word** (`tools/quotes.ts`, now `tools/comments.ts`). Spiked from
  `bb7ee37`, kept a day: a section copied alone is no hover. _Reopen if_ a hover can show a short form of a section that
  the guide itself writes, kept in step with the version installed.
- **Every line of the guide quoted by a doc comment, or set aside with a reason** (`tools/unquoted.ts`). Spiked,
  `0e1738d` to `ca9b91b`: 481 lines came into the comments, and `run`'s grew from 57 to 136. _Reopen if_ the comments
  quote the guide again, with a bound on their length.
- **The `init` of a parent without flags called by `start`, not by `make`.** Reasoned, 21 November 2026, with a second
  opinion that probed each form: `make` cannot tell what that `init` returns without calling it, and each other form
  breaks a type or a spread. It now holds of the children's starts, which `make` makes (the doc comment of `init`, in
  `compose.ts`). Weighed again in step 61, by the values, as one form, an `init` that is a function always: it would
  treat `init` alike wherever it appears (value 4), and every program and test would write a call to move one
  throw from `make` to `start`, where `init` is pure and a step reads as data (value 3). _Reopen if_ a parent's `init`
  takes an input that `start` gives.
- **A subscription made from its key alone, in other forms**
  ([`subscription-from-key.md`](records/subscription-from-key.md), "For the owner"): the keys in a `HashSet`
  (spiked, `40d9400`: three times slower, and `as const` on a string key); the key known to `make` alone (a program's
  type would not change with a subscription); `hear` taking a key of the program's type (14 errors in the tests, to
  move an error); a defect that names its key by its tags (as `describeKey`); and the name `runSubscription` (nothing
  is run). _Reopen if_ a key listed twice hides a mistake a set would have
  refused, or a test that gives `hear` a wrong key passes.
- **An optional member that takes `undefined`, as one not given**, under `exactOptionalPropertyTypes`: `| undefined` on
  each optional member of what `make`, `child`, `childWhen`, `childById`, `start` and the testing tools take, and on
  the lists of a `Step`, so that `listening: paused ? undefined : (state) => …` compiles under that option as it does
  without it. Spiked in step 117, 27 November 2026: the types took it with no other change, as the run already reads
  `undefined` as a member not given, and the tests of the types failed without it. Undone by the owner the same day:
  `undefined` is not a value of an option where it means nothing of its own, and only says that the option is not
  given, which leaving it out says. Without the compiler's option, a consumer may still write it, and the run reads it
  as a member left out, which stays unspecified. _Reopen if_ an option comes to have a meaning for `undefined` of its
  own, or a user's program cannot be written without it.

## The bridges

- **Bridges that support what a renderer does beyond drawing.** Decided by the owner on 16 November 2026, after a
  review found four gaps (a reset the user begins, a root in a shadow tree, Suspense in React, a field that strips line
  breaks): each fix brought more premises on the DOM and the renderer, outside the library's concern, and a bridge is
  an example to start from. Since 20 November 2026 the bridge to React is hosted by React
  ([`hosted-react.md`](records/hosted-react.md)), the bridges are entries of the package
  ([`adoption.md`](records/adoption.md)), and both draw native controlled elements; what they leave out is a form's
  reset, a value written past React's setter, and a value the element changes by itself. _Reopen if_ a user of an entry
  needs a feature of its renderer that it leaves out.
- **`Host` running its program in its effect, with no microtask**, so that the premise of StrictMode goes
  ([`premises.md`](premises.md)). Accepted on 20 November 2026 ([`hosted-react.md`](records/hosted-react.md),
  "Decided", 6), reversed the same day ([`store-and-effects.md`](records/store-and-effects.md), "Decided", 4), and
  weighed again in step 61: the premise holds no promise, and its fall costs what the microtask saves each day, the
  commands of `init` twice in development and a program started anew. _Reopen if_ a first effect must start in the
  task of `Host`'s effect, or React says when StrictMode runs a cleanup.
- **A frame of the very same model taken at once.** Rejected on 20 November 2026, and superseded the same day: there are
  no frames ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), R1), and the bridge to snabbdom draws in a
  microtask after each notice ([`write-without-was.md`](records/write-without-was.md)).
- **A view of the library's own, as data over snabbdom.** Rejected by the owner on 23 November 2026
  ([`adoption.md`](records/adoption.md), "A wider form"; [`architecture-review.md`](records/architecture-review.md),
  "Smaller points"): what it was for is done otherwise (a dispatch that applies at once, a write of the element's value
  alone, `messagesSentBy`), for a second product to keep that knows a renderer. _Reopen if_ a view shows a message that
  `messagesSentBy` cannot find, or the same dispatch in every draw costs users what `forwardTo` does not answer.
- **The bridges under `src/`**, since they are entries of the package. Proposed by the owner on 25 November 2026, who
  left the choice to the agent. Reasoned: `src/` is what is generic and only Effect, and four globs say so with no
  exception: the root `tsconfig.json`, whose `lib` has no `DOM`; oxlint's refusal of a renderer; `test:node`; and
  `files` in `package.json`, which packs no test of `src/` and every test of the bridges, for a bridge of a user's own
  to start from. A bridge is also read as an example of one, written on the package's name. The move changes no entry
  and nothing that a user imports, for an exception in each of the four. _Reopen if_ a bridge needs a module that
  `src/` keeps to itself, or the package stops shipping the bridges' tests.
- **An entry `./react-native`.** Decided against in step 82, 25 November 2026
  ([`react-native.md`](records/react-native.md), 1): the bridge to React imports `react` alone, and `Host` and `Draw`
  draw with React Native as they are, run under its jest preset. An entry that exports again what `./react` exports
  is a second name for one thing. _Reopen if_ React Native needs code that `./react` cannot hold, as a testing tool
  that imports `react-native`.
- **A dead run reported through React Native's `ErrorUtils`**, so that it reaches a handler which an application sets
  with `ErrorUtils.setGlobalHandler`. Decided against in step 82, 25 November 2026
  ([`react-native.md`](records/react-native.md), 4): it is a global of one renderer in the bridge, for a report that
  React itself gives to `console.error` there, and an application that wants the cause wraps the run in the `fork` it
  gives `Host`. _Reopen if_ a user's crash reports miss a dead run that `fork` cannot give them.
- **A premise on what a `TextInput` of React Native shows.** Decided against in step 82, 25 November 2026
  ([`react-native.md`](records/react-native.md), 2): no test without a device reaches the native view, and a premise
  has a test that fails without it. What it shows until the native view takes the model's value is left out. _Reopen
  if_ a test can run React Native's own renderer with no device.
- **A `messagesSentBy` for a view of React**, in an entry `./react/testing`, as snabbdom has one. Removed on 14
  November 2026 ([`boundary.md`](records/boundary.md), item 1), and decided against again in step 84, 25 November 2026,
  after a spike ([`react-view-tests.md`](records/react-view-tests.md)). A walk that calls no component misses in
  silence what a component sends by a function it was given, and can refuse it only by refusing views that are right.
  A render by `test-renderer` finds what the view wrote with React DOM alone: on React Native a host element holds
  what `Pressable` made of `onPress`, and what the view wrote is read from React's fibers. The bridges differ because
  their renderers do: a view of snabbdom returns its whole tree as data, and React alone calls a component. A test
  draws `view(model, record)` with its renderer's testing library instead. _Reopen if_ React gives a stable way to
  read the props of the components it has rendered, or keeps a renderer of tests of its own.

## The checks

- **A tool that keeps the table of the functions a user gives** ([`given-functions.md`](records/given-functions.md)).
  Decided against in step 57, 24 November 2026: the record is history, and what it found is in the guide. _Reopen if_
  an export is found that no page of the guide says how it is called.
- **A framework of mutation testing (StrykerJS).** Reasoned, 15 November 2026: a score is no promise that a named
  check has a named killer, the mutants equivalent over Effect would each be read by hand, and Stryker has no runner for
  `bun:test`. The run was made parallel instead (162 s to 44 s on 24 processors). _Reopen if_ the list is to be judged
  for what it misses.
- **Windows of absence awaited under the scheduler of the tests** (`idle`). Reasoned, 16 November 2026, with a second
  opinion: no test of a check runs under that scheduler, which rests on a reading of `runLoop`. The windows with a
  witness are awaited, and the runner runs again alone a killer that passed. _Reopen if_ a window lets a mutant survive
  on a run alone, or the scheduler's reading becomes a premise with a test of its own.
- **The guide tied to the inference matrix**, each item of "What does not compile" naming a `Violation`. Reasoned, 23
  November 2026, with a second opinion that ran 40 mutations: about 6 of 13 items have no `Violation`, and the CI would
  check names against a matrix it never runs. The mutations of the types named the items instead (`refuses`), until
  the lists of "Composition" and of "Anatomy of a program" went to the doc comments, on 25 November 2026: no list of
  the guide is left to name. _Reopen if_ the matrix runs in the CI, or the guide gathers every refusal in one list.
- **A mutation for each check of the types** of `program.ts` and `compose.ts`, killed by a test of the types under
  `tsc`. Kept from step 44, of 23 November 2026, and taken out by the owner on 26 November: 64 mutations in 875 lines,
  each a text of the types to keep in step with every change of them, and a second half of the runner, to show that a
  check has a test, which the test shows as it is written: an `@ts-expect-error` fails once nothing is refused under
  it. What is lost is the proof, at every run, that no check has lost its test. Reasoned; the list is in the history,
  at the commit before this entry. _Reopen if_ a check of the types is found removed with no test of the types failing.
- **The boundary of the testing tools in other forms**: a list of the names of `core.ts` and `shell.ts` refused to
  `src/testing/`; the two files refused whole, with what it takes of them exported again by `engine.ts` and `run.ts`;
  a script that reads the uses, as `tools/comments.ts` reads the doc comments; `no-restricted-properties` on
  `Core.arrive`; and the same check refusing `effect/Inspectable` and `describeByTag` outside `testing/failure.ts`.
  Weighed in step 54, 25 November 2026. A list of refused names holds only what it names: it let pass `init`,
  `wrapDefects`, `record` and the other exports that make a step or a site of a defect, and named two that `shell.ts`
  does not export. The second makes `engine.ts` a second door to the pure pieces, the third a tool to keep, and the
  fourth misses a named import. The tools take instead the names of an allow-list, by name and from any depth of the
  folder (`.oxlintrc.json`), so a new name is an edit of the boundary. The last needs an override of its own for
  `failure.ts`, all of the rule written again, to guard how a value is named in an error, which `String` would pass all
  the same. _Reopen if_ a tool is found to name a value by another function, or oxlint merges the options of a rule
  across overrides.

## The documentation

- **Naming Foldkit in the README**, for a reader who weighs the two, as the adoption record
  ([`adoption.md`](records/adoption.md)) and step 67 asked. Written in step 67, in Foldkit's own words and with no
  comparison, since none may decide what this library does (`AGENTS.md`, "What belongs here"), and taken out by the
  owner on 25 November 2026: a paragraph that offers to help weigh the two and then compares nothing is of no use to
  the reader. Reasoned. _Reopen if_ the README can say something of the two that helps a reader choose, true of each,
  with no reading of Foldkit deciding anything here.
- **The compiler's error beside each `Upgrade:` of the changelog**, so that an upgrade finds its entry by the error.
  Asked by an application on 27 November 2026
  ([`application-report-0.10.md`](records/application-report-0.10.md), point 11). Reasoned: the code and the text of an
  error are TypeScript's, and change with its version and with how the call is written, as a literal or a variable.
  The one error that did not say its fix is for the types to say (step 111), and an entry says where the old spelling
  still compiles (step 113). _Reopen if_ an upgrade is found to miss its entry where the error names what is wrong.

## Parked, not rejected

What is deferred is kept here, with what would reopen it, and is out of [`ROADMAP.md`](../ROADMAP.md). An item
reopened goes back there; one decided against becomes an entry above.

- **Running only the mutations a diff touches** (`--changed`). Deferred by the owner on 15 November 2026, for the
  parallel run: a change elsewhere can make a check redundant, which such a selection does not run. _Reopen if_ the
  parallel run grows slow again; the whole run stays before a release.
- **Draws a bridge skips by the equality of models** ([`registers.md`](records/registers.md), "To explore"). Measured
  on 16 and 17 November 2026 in happy-dom, on the bridge of frames since gone: a skip by `Equal` cost about twice the
  drawing it saved, and drawing a thousand rows again about 1 ms. The bridge to snabbdom skips a model that is the very
  one it drew last. _Reopen if_ a browser, or a heavier row, shows drawing an unchanged model to cost more than its
  comparison by `Equal`.
- **A first step that carries events**, so that a parent may raise an event of its own as it starts. Deferred in
  step 79, 25 November 2026, reasoned and not run ([`condition-down.md`](records/condition-down.md)): with a `tell`
  declared from the state, a child may answer what it is told as it starts with an event, and its parent's handler may
  raise one of the parent's own, which is a `CompositionDefect`, since `init` gives a state and commands alone. To
  carry it, the `init` of every program, `Core.init` and each tool that starts a program would take events, and a
  parent would handle those of the children that it starts. Added later, it turns a defect into a step, and breaks
  nothing. _Reopen if_ a program is found whose child must answer what it is told as it starts with an event that its
  parent passes on.
- **A `key` beside the `flags` of a child**, so that it can start again from equal flags
  ([`kept-children.md`](records/kept-children.md), "Decided, under the store"). Deferred in step 59, 24 November 2026,
  reasoned ([`api-review.md`](records/api-review.md)): a child's flags are what it starts from, and other flags start
  it again, as another value of `key` does, so a `key` beside them adds a field to `Child` and to `Instance`, a test
  and a mutation, for a use that no program has shown. Added later, it breaks nothing. Until then such a child starts
  again by other flags, or goes back to its first state on an external message. _Reopen if_ a program must start a
  child with flags again from equal flags in one step, and an external message cannot say it: the answers of its
  commands under way must be rejected, as a start rejects them.
- **A declared `tell` that gives several messages**, as a list, or one `tell` for each. Asked by an application on 26
  November 2026 ([`application-report-0.9.md`](records/application-report-0.9.md), point 2), which told a time and a
  lock as one message made for it. Deferred the same day, reasoned and not run: a declared `tell` is a condition, one
  value that holds in a state and is compared with `Equal`, and a message with a field for each fact says it. A list
  would keep what each child was last told item by item, and say which items a change tells again, for one case.
  _Reopen if_ a child that two parents use must shape its external messages for the declaration of one of them, or a
  child must tell which of two conditions changed and its own state cannot say.
- **A `listening` that reads the children's outputs**, as a parent's own `subscriptions` does since step 95, 26
  November 2026 ([`subscriptions-read-outputs.md`](records/subscriptions-read-outputs.md)). Deferred the same day,
  reasoned: `listening` is read once every child is in place, so it could, with no order among the children, but every
  option of a declaration reads the parent's own state alone, and no program has asked for it. Added later, it breaks
  nothing. _Reopen if_ a program must run a child's subscriptions only while another child's output says so.
- **The check of step 87 on Firefox** (`bun run test:browsers`). Deferred by the owner on 26 November 2026: on the
  machine of the step, Windows 11 build 26300, the Firefox of Playwright 1.65.1 (`firefox-1572`) does not start, even
  installed again with `--force`. The event log says that the assembly `mozglue`, which `firefox.exe` depends on, could
  not be found, though `mozglue.dll` is beside it; Smart App Control is off, and Code Integrity blocked nothing. The
  tests pass on Chromium and WebKit, 294 of them, and step 87 renames, with no behaviour of a bridge changed.
  _Reopen if_ Firefox starts on this machine (a newer Playwright, or a cause found with `sxstrace.exe`, which needs an
  administrator), or the CI runs `test:browsers` on Firefox: then it runs once at the commit that closed step 87.
