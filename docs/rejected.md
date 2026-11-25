# What was tried or weighed, and rejected

The ideas for the library that were tried or weighed and rejected, so that a proposal reads them before it makes one
again. An idea rejected is added here, and taken out of [`ROADMAP.md`](../ROADMAP.md), in the commit that rejects it.

Each entry is a short paragraph: what the idea was, why it was rejected, on what evidence (**spiked**: code was
written and run, and the entry names where; **reasoned**: weighed by reading and argument alone), and what would
reopen it. A record that has the full account is linked, and not repeated. An entry is not a ban: it is reopened by
what its "Reopen if" names, or by a reason it does not answer, which the proposal says.

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
  that forbids them elsewhere. Of its six premises, four are documented since Effect 4.1.5, and two are asked of Effect
  (`ROADMAP.md`, step 47). Weighed again in step 61, by the values: a command that never answers ends in silence
  (value 1), which no simpler engine pays for (value 5). _Reopen if_ a fiber the run forks can be interrupted without
  the run's mark by anything but the program.
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
  owner kept the mark; weighed again on 24 November 2026, read and not run. _Reopen if_ a design tells the run's stop
  from a self-interruption with no question to the fiber, and keeps that self-interruption a defect.
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
- **A caret as the peer range of Effect** (`^4.1.4`). Reasoned, 23 November 2026
  ([`premises-and-range.md`](records/premises-and-range.md)): the owner kept the tilde, since a published version keeps
  its range and a patch that leaves a broken Effect out reaches only who installs after it. The range was a caret from
  12 to 17 November 2026. _Reopen if_ the premises that hold a guarantee are documented by Effect, or the library no
  longer rests on them.

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
  failed. _Reopen if_ TypeScript keeps the name of an alias of an alias when it prints it.
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
- **`child`, `childById`, `input` and `inputById` as free functions, and `make` as `program` itself.** Reasoned, 17
  November 2026: TypeScript infers no type arguments once one is given, so `make<T>()(config)` would come back under
  another name, and free declarations would not know the parent's state. _Reopen if_ TypeScript infers the type
  arguments a call does not give (microsoft/TypeScript#26242).
- **A parent's children declared in the call of `make`.** Spiked, 22 November 2026 (`spike/tell-matrix.ts` on
  `spike/kept-children`), with TypeScript 5.9, 6.0 and 7.0: the literals of a `tell` lose their tags, and each needs
  `as const`. The owner chose `withChildren(children).make(config)`
  ([`kept-children.md`](records/kept-children.md), "Decided, under the store"). _Reopen if_ TypeScript keeps the literal
  types of a return inferred against a contextual type that holds a type parameter being inferred.
- **External messages answered by `update`**, so that a program has one function of its messages. Reasoned, 20
  November 2026 ([`external-handler.md`](records/external-handler.md)), and weighed again in step 61, by the values: a
  `tell` that `update` may reject ends in silence, or `reject` comes to mean a defect there (values 1 and 2), where
  `external` costs a second function for the message that a view and a parent both send. _Reopen if_ a program must
  refuse what its parent tells it, and neither its state nor an event can say so.
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
  message in a literal; the one check it adds is a stray `id` on a literal that is not fresh. _Reopen if_ a tool must
  lift a child's message with no type to lean on, or the stray `id` is found in an application's tests.
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
