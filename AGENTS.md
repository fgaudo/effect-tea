# @fgaudo/effect-tea — guide for coding agents

How the library is used is in [`README.md`](README.md): its "Guide" and "Testing" are the user documentation, and
"Development" names the checks. This file holds the rules that apply to every change.

Procedures live in skills, plain Markdown that any agent or person reads, under `.agents/skills/`. Read the one
for the task before starting it:

| Before…                                                 | read                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| adding, changing or removing an export                  | [`change-api`](.agents/skills/change-api/SKILL.md)         |
| adding or changing an example, or the bridge they share | [`add-example`](.agents/skills/add-example/SKILL.md)       |
| an API of a newer Effect, or a dependency upgrade       | [`upgrade-effect`](.agents/skills/upgrade-effect/SKILL.md) |
| a changelog entry, the version, a release, the site     | [`release`](.agents/skills/release/SKILL.md)               |
| a review of what the invariants rest on                 | [`premise-review`](.agents/skills/premise-review/SKILL.md) |

## Language

All code, comments, identifiers, commit messages and `.md` files are in **English**.

## Commits

A commit made with an AI agent ends with an `Assisted-by: <model>` trailer (e.g. `Assisted-by: Claude Opus 5.5`),
never `Co-Authored-By`: the author is the person who commits. A clear subject is usually enough: a body only says
why, or what the diff, the docs and the changelog do not, never what they already describe.

## What belongs here

- **Generic, and only Effect.** The library knows nothing of the applications that use it, nor of any
  renderer: views are generic over their node type, and the renderer is a function given to `run`. `effect`
  (v4) is its only dependency, as a peer. Biome forbids renderer imports, and `lib` (`ES2022`, no `DOM`)
  rejects browser APIs, everywhere but in `examples/`.
- **An API of its own.** The API is exactly what `src/index.ts` and `src/testing/index.ts` export; every other
  module is internal. It is judged on its own terms, from the library's concepts, its examples and its users in
  general: coherent, symmetric where its tools are (what `drive` gets, `simulate` and `rehearse` are asked
  about), and never shaped by, nor justified with, what one application happens to use.
- **A type is Effect's or the library's, never half of each.** One of Effect's is an alias with a name
  (`Subscription` is a `Channel`, `Execution` an `Effect`): it is built and transformed with Effect's own
  combinators, and the library defines no function over it. One of the library's own has a shape the library
  defines and documents, public where it is meant to be written by hand (an `update` writes a `Step`,
  `{ state, commands?, events? }`, as data) and hidden where it is not (a program a `parent` composes); the
  library gives the functions over it (`andThen` and `raise` over `Step`). An alias with a few helpers over it
  has the costs of both and keeps neither promise: users still write the representation everywhere else, so it
  cannot change. A type moves to the library's side only when the library must do with it what Effect alone
  cannot: inspect it in tests without running it, keep it the same across frames by a cache of its own (as
  `dispatchTo` does for a dispatch), or enforce at construction what the type cannot. A subscription is already
  inspected by its key: that is why `Subscription` stays Effect's.
- **A function earns its place by doing what Effect alone cannot**, or by being the one place where a rule of
  the library is applied (`reject`, `parent`). A name over a composition of Effect's combinators is not one,
  however often the composition recurs in an application: `attempt`, `silent` and `Subscription.every` were
  removed by this rule. A type that already imposes a rule (`Execution` cannot fail, a `Subscription` ends with
  a message) makes the function that would remind of it superfluous. A form of a declaration that takes a
  standard type of Effect in place of hand-written functions (`at`, an `Optic`, for `get` and `set`) is not a
  function, and may stay. `forEach` over `Step`, the n-ary `andThen`, is a fold the rule admits: with it, a parent
  tells one message to each of its children by id (the `list` example). Both are dual (`Function.dual`), for a
  chain of steps written in a `pipe`.
- **Only stable APIs.** A module or function marked `@stability unstable` in Effect's declarations may change
  under the library's users: never build on one, not even as an option, and not in `examples/` either, since
  users copy them. The same holds for React's `unstable_` and `experimental_` APIs in the bridges. The typecheck
  fails on one, in the library and in the examples (the Effect language service's `unstableApiUsage`).
- **Nothing deprecated.** No module, type, function, method or option marked `@deprecated`, of any dependency,
  in the library, its tests or its examples: use what the deprecation names instead, and replace a use found in
  passing. `bun run lint` warns about one (Oxlint's type-aware `typescript/no-deprecated`).
- **The peer range starts at the Effect the library is developed with** (`^4.1.4` today): `peerDependencies`
  names the version of `devDependencies` with a caret, and an upgrade of Effect raises both in one commit, so that
  the library is checked, and what it rests on of Effect read and tested, at one version only. No older Effect is
  supported. An API that exists only in a newer Effect is not a reason for a workaround: ask whether to upgrade
  (`upgrade-effect`).
- **A change a consumer can notice has a changelog entry** in the same commit, and raises the version when it
  needs more than the unreleased section says (`release`).
- **The README is a specification.** Its "Guide" and "Guarantees" say what the library promises, and
  applications cite them as rules. Its prose changes one section at a time, each sentence checked against the
  old one: the same promise, no weaker and no stronger, as the code and the tests keep it. A word that looks
  minor ("exactly when", "by `Equal`", "never more") is often the rule.

## Invariants the engine keeps

The README's "Guarantees" says what a user may rely on, and the library's tests check each one
(`src/interleaving.test.ts` checks all six, and what the run does from the first defect on, under random orders of
clicks, answers, subscription messages and ends, releases, defects and self-interruptions, as the README says). This
is how they are kept, and what a change must not undo:

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends
  each one twice): never assume it runs once per message.
- **`reject` means one thing: the message does not apply in the state.** The run ignores every rejection, and
  whether the view sends only what applies is for the tests ("Rejections and defects" in the README). Never add
  a runtime check of the model against `update`, nor a way for a model to ask `update` what it accepts: the
  model, read from the state, and `update` are two derivations that tests check against each other, and a
  model that asked would make a wrong rejection a control that silently disappears. A `defect` is only for a
  message the state and the engine together rule out, never one that what was drawn rules out: an example
  never dies on a message of its view, nor on an event raised for one.
- **A parent and its children talk only through external messages and events**, so that `reject` means the
  same everywhere: a handle's `update` returns a step, never a rejection, and a child rejecting an external
  message, or a parent giving one to a child that is not there, is a defect: a `CompositionDefect`, as every
  break of what a parent declared is (`defectAt` in `compose.ts`), so that reports group them and name the child. The types
  enforce what a parent declares: `runCommand` exactly when it has commands of its own, `onEvent` exactly when a
  child has events, a handle's `update` only with a child's `external` messages, no own message or command
  named like a child. A program written without `Program<…>` has `unknown` types, read as `never` (`Known` in
  `program.ts`), so that it does not open these checks.
- **A child's model, and its lifted subscriptions, are kept by its state object** (`modelsOf` and `lifted` in
  `compose.ts`) for as long as that object lives: they rely on `makeModel` and `subscriptions` being pure and on
  states being replaced, never mutated, and hold nothing of the run, so runs that share a state share them. A
  model holds nothing of its place either, so children that share a state share its model; lifted subscriptions
  carry their place, which is checked rather than kept, one per state, so that ids never pile up under a shared
  state. That is why every program
  keeps its state in an object (`ObjectState` in `program.ts`, checked by `Program`, `parent`, `child`, `each`,
  `run` and the testing tools): never add a cache for primitive states, which nothing could let go of.
- **A child's dispatch is the same while anyone holds it** (`dispatchTo` in `dispatch.ts`): kept weakly by its
  parent's dispatch, its name and its id (compared with `Equal`, as subscription keys are), and removed by a
  `FinalizationRegistry` once collected. Never hold them strongly: ids that are never reused, as the README
  advises, would pile up for as long as the run lasts.
- **Running a dispatch needs no services and completes synchronously**: it only offers the message to the
  engine's unbounded queue, which wakes the engine on the scheduler of the run that made it, so that renderers
  send from plain callbacks with `Effect.runSync`. Keep the queue unbounded (one that waits when full would make
  every such call throw, one that drops would lose what the user did) and the dispatch free of services.
  Running a dispatch is the renderer's business: the library exports no helper for it.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn
  them into messages: reporting is the job of whoever runs the program. A fiber of the program dies when its effect
  ends with a defect: what the program wraps around its own code (`Effect.ensuring`, an `Effect.scoped` of its own)
  runs before, and may still catch it, so never add a way to learn of a defect earlier (a `Supervisor`, a look at a
  fiber's state); what it acquires in the scope the library gives it is released after. Where the engine knows
  where a defect happened, it wraps each defect of the cause in a `ProgramDefect` (`diesIn` in `engine.ts`) that holds it as
  its `cause` and says where, and keeps the rest of the cause. The run's own logs die in `'log'`, each outside
  any other site, so that a `Logger` that throws is never taken for the subscription or the step that logs; what
  the program logs is in the site it logs from. Each fiber of the run records what it dies of in one place
  (`makeDeaths` in `engine.ts`, made by `runWith` and given to the engine; `rehearse` has its own, keeping only the
  program's defects): the engine's, the renderer, and the run's own as it starts the engine, as they end, and one with
  a scope of its own as it dies too, before the scope releases what it holds (`scopedIn`), a subscription's channel and
  the scopes of its own included (`runSubscription`), so that a defect is in the order it happened, though its release
  lets another fiber die first. Each defect recorded is reported once, in that
  order: by the run as soon as one dies, and by the end of the run, which interrupts its fibers itself, waits for them
  to release what they hold, and dies of the rest; the run's cause holds the defects first, then the rest of what it
  ended with. From the first defect recorded on, the run calls neither `update` nor `runCommand`, a step under way
  included, while the renderer releases what it holds: each is checked in the thunk that calls the program (`arrive` in
  `core.ts` for `update`, `alive` in `engine.ts` for `runCommand`, and nowhere else: a check of the loop's own would
  hide one left apart from its call from every test but a scheduled one), where no other fiber can run, since the scheduler may yield at any other operation, and
  a step may wait for a release or an option while another fiber dies. A subscription is a `Channel`, which the run
  does not call: the start of its fiber is checked too, but its first step may still come after the defect, under the
  scheduler of the tests with the check as without it. What an effect of the program does once started is its own,
  until the end of the run interrupts it: no check can come between two of its operations. Never
  report a defect only through a `join`, or through a fiber that races: once nothing awaits it, or the race is lost, the
  defect is lost with it, and `FiberSet` and `FiberMap` discard the exits of the fibers they interrupt as they close.
  The renderer is one of them, interrupted and awaited first however the run ends (`runWith` in `run.ts`). `drive`
  stops and awaits its run however it ends, interrupted too. A call of `rehearse`'s that waits for a subscription or a
  command races its wait with the death of any fiber (`orDead`), as the run dies at once.
- **A subscription never ends in silence**: its end value is a message (or `never`), sent to `update`. An ended
  subscription keeps its key among the active ones until the key goes away and comes back: never restart it
  automatically, which would loop on one that ends at once. What the end of a library's stream means is the
  caller's decision: no helper takes it for them, and the type of a subscription asks for it (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key leaves running, a gone key interrupts.
  The gone keys are interrupted together, and awaited before any key starts: the loop waits for the slowest
  release rather than for their sum, and a key that comes back finds its old subscription released. A parent
  lifts its children's keys under their names, and dies on an own key equal to a lifted one.
  Each start has a generation that its messages carry, and a message whose key is gone, or came back with a new
  start, is dropped before `update`, however the fibers were scheduled. Keys are the program's, and so are their
  `Equal` and `Hash`: the run compares them only in `'subscriptions'` (`reconcile` in `core.ts`), and keeps its
  fibers, and tells a message that still applies, by their start, which compares no keys.
- **A check of what another fiber may change, and the act it guards, are one thunk.** Where the engine or a testing
  tool decides from what another fiber may change (the register of deaths, the keys of a state, `pending`), the
  check and the act it guards, a call of the program or the start of a fiber, are in one synchronous thunk: the
  scheduler may yield at any other operation, and another fiber die or write meanwhile. A change of the engine or of
  a testing tool lists the points where another fiber can run between a check and its act, and leaves a test under
  the scheduler of the tests (`test/scheduled.ts`) that fails without the check: a budget of operations samples the
  interleavings, and reaches only some. The check also gets a mutation that takes it out, naming that test
  (`mutations/`, under "Tests"). What cannot be one thunk with its check, as the first step of an effect of the
  program, is no act the README promises about.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description
  that must be kept in step with one: a test, `onApplied` and the logs read the command itself.
- **Commands cannot be cancelled**, a deliberate choice: do not add cancellation without asking.
- **Each command, each subscription and the renderer has a scope of its own** (`Effect.scoped` where the
  library starts them; a command's closes before its message is queued), and `simulate` scopes each command the
  same way. Never let them acquire into the run's scope: what they hold would outlive them, and be released
  before their fibers are interrupted.
- **No span lives as long as the run**: `run` and `Engine.make` are untraced, and the run's fibers see the span
  of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every log as an event of the
  current span until it ends.
- **Frames cost only what is drawn**: a frame's model is made when first read, and a message that returns the
  very same state makes no new frame (a parent keeps its own state when a child's message leaves the child's as
  it is). Do not compute models eagerly in `run`.
- **`onApplied` and `onIgnored` watch, never steer**: they hear each accepted, or rejected, message in order,
  with where it came from, before its frame is published, with no way to send messages or change the state. A
  defect in them is a bug like any other. Neither hears a message dropped before `update` (one left by a
  stopped subscription): that is the engine's, not the program's.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler
  ("Testing" in the README says what each one runs, fails on and ignores); `rehearse` fails on a command left
  pending, since its answer would arrive, and `drive` acts only as a user can, through `run` and the run's
  dispatch. When the engine or one tool changes, keep the others in step. `src/testing/contract.test.ts` gives
  the same program and inputs to each tool and to the run; where they still differ, its `test.failing` cases say
  how, and `ROADMAP.md` lists them.
- **Logs never carry message data by default** (`describeByTag` in `log.ts`): only tags, following a wrapped
  `message` or `command` only when it is itself tagged, since a program's own field of that name may hold data.
  Level: `debug` for the message loop and for subscriptions starting, stopping and ending, nothing else. What
  is computed only to be logged (`describeMessage`, `describeCommand`) is computed only while debug logs are
  enabled (`LogLevel.isEnabled`).

## What the invariants rest on

An invariant holds only while what it rests on does: the purity of the program's code, states never mutated, and
the behaviour of Effect's runtime and of the JavaScript engine. What the program must do is the README's ("What is
left to you"). What Effect and the JavaScript engine must do is listed here, each with what checks it, as the rule
after the list says. A change that rests on a new premise adds it here, with what checks it.

- **`HashMap` compares keys with `Equal`, structurally for arrays and records**, so a key made anew
  for each state, as a parent's lifted keys are, keeps its subscription: "a key equal by value keeps its
  subscription running, untouched" (`engine.test.ts`), "a child whose state changes, under the same key, keeps
  its subscription running" (`compose.test.ts`). `Equal` keeps its results and hashes by reference, so a key or an
  id is never mutated, as states are not. A `MutableHashMap` compares the key it is given with those already in
  it, that key first, so that what `dispatchTo`'s `FinalizationRegistry` callback looks up, outside any run, finds
  only pairs compared while the view made the dispatches: "lets go of collected dispatches without comparing ids
  again" (`dispatch.test.ts`). Both are read only in the source.
- **`HashMap` calls a key's `Equal` and `Hash` only within the call it is given the key in**, synchronously, and
  never later, so that `reconcile` compares keys all inside `'subscriptions'`: "a key whose Equal throws dies in
  subscriptions" (`run.test.ts`), and so do `simulate` and `rehearse`, which compare them as it does: "… on a key
  whose Equal throws against the key of the state before" (`contract.test.ts`). `FiberMap` compares its keys in a
  fiber's observer as well, which is why the run keeps its fibers by their start, never by their key. Both are read
  only in the source.
- **`FiberMap.remove` waits for the interrupted fiber to end**, its release included, which is what makes the
  gone keys released before any key starts: "a key that changes stops the old subscription and starts the new
  one", "keys that go away together release their subscriptions together, not one after the other"
  (`engine.test.ts`).
- **`Effect.onExit` runs its cleanup however the effect ends, and puts what the cleanup fails with after the cause
  of the effect**, so that `runWith` interrupts the renderer however the run ends, and what ended the run stays
  the first defect of the cause: "a renderer that dies while an interrupted run releases it is in the cause", "a
  renderer that dies as a run that died elsewhere releases it is in the cause" (`run.test.ts`). It is also how
  each fiber of the engine records what it dies of, interrupted or not. Interrupted: "a defect in what a subscription
  the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts it, which dies
  as it releases, is in the cause"; dying of itself: "a command that dies while an interrupted run releases the
  renderer ends the run with it", "a command that dies while a run that died elsewhere releases the renderer is in
  the cause" (`run.test.ts`); and how `rehearse` records each defect of the program in whichever fiber, an interrupted one
  included, merging no causes there: "a defect of what a subscription releases fails it, in a fiber of the test's
  that nobody joins", "a defect of what a command the scenario interrupts releases fails it, alone"
  (`rehearse.test.ts`), "rehearse fails, as the run dies, on a command that dies in a fiber nobody joins"
  (`contract.test.ts`). That the cleanup runs, and that the causes are merged, is documented; their order is read
  only in the source.
- **A fiber interrupted while interruptible runs no failure handler**, which is how `diesIn` tells an interruption
  by the run from one the program makes: "a run interrupted by whoever runs it is no defect", "a subscription
  stopped inside an uninterruptible region is no defect" (`run.test.ts`); and beside a defect of its release, which is
  how `diesIn` turns a self-interruption into a defect even after a defect, never one by the run: "a defect in what
  a subscription the run stopped releases ends the run", "a subscription stopped as whoever runs the run interrupts
  it, which dies as it releases, is in the cause" (`run.test.ts`) fail with a handler that runs on them.
- **An unbounded `Queue` takes an offer at once, and a shut one refuses it without interrupting**: "a dispatch runs
  with Effect.runSync from a plain callback, and after the run has ended too" (`run.test.ts`). It wakes its taker
  through the scheduler of the fiber that made it, so a dispatch never runs `update` in its caller's stack:
  "running a dispatch from a plain callback returns before update has seen the message" (`run.test.ts`). That
  the scheduler is the run's own is read only in the source: "a dispatch run from a plain callback wakes the
  program on the scheduler the run started with" (`run.test.ts`).
- **A start's generation, not only its key, says whether its messages still apply**: "a message left by an earlier
  start of a key that came back does not reach update" (`engine.test.ts`), and "what a subscription leaves in the
  queue after its key went away does not reach update" (`run.test.ts`); `rehearse` drops it by the same `arrive` of
  the core: "a message its subscription sends after its key went away does not reach update" (`rehearse.test.ts`).
  This one rests on nothing of Effect: it is the engine's own rule, tested where the fibers' order would otherwise
  hide it.
- **Every fiber of a run asks the `Scheduler` it is given before each step, and every task it makes goes to that
  scheduler's dispatcher, or resumes inline where the scheduler of the tests makes it yield first**, so that
  `test/scheduled.ts` decides where each fiber yields and which runs next, needing nothing of the platform's: "driven
  by hand, every fiber resumes through the scheduler, that of the test clock included", "fibers a Deferred resumes
  inline run in the order the test picks", "a fiber that yielded and is interrupted waits for its turn, as one resumed
  inline does" (`test/effect-scheduler.test.ts`), and the rules of the scheduler built on them
  (`test/scheduled.test.ts`). Read in the source (`runLoop` in `internal/effect.ts`, unchanged from 4.1.3, where
  effect-tea-persistent's decision 0104 found them), and seen in those tests.
- **`SubscriptionRef.changes` replays the latest state to a new subscriber**, so a renderer that subscribes late,
  or skips frames, still draws the last state: "a renderer slower than the program gets only the latest frame"
  (`run.test.ts`).
- **Effect calls each `Logger` synchronously, in the fiber that logs**, so that what it throws is a defect of
  that fiber, which `diesIn` wraps where the log is written: "a Logger that throws on the log of an accepted
  message is one defect, in the log", "a Logger that throws on what a command logs is a defect in the command"
  (`run.test.ts`). That it runs in the fiber that logs is read only in the source.
- **A `WeakRef` is cleared before the `FinalizationRegistry` callback of its target runs**, and a `WeakMap` lets go
  of a value with its key: the tests of `dispatchTo` (`dispatch.test.ts`) and "a child's model is let go with its
  state" (`compose.test.ts`), under `Bun.gc`.
- **A `Queue` gives its items in the order they were offered, and a fiber that awaits a `Deferred` is interrupted
  alone, never the fiber that completes it**, which is how `rehearse` applies one message at a time, as the run's
  loop takes them, the fibers of the test's offering a step to one loop of its own and awaiting its result, and how
  an interrupted caller never splits a step: "two messages that arrive together, one stopping a subscription, are
  both applied", "a command run while a message waits for a release leaves pending once", "send selects on the model
  of the state its message is applied to", "a send interrupted while its message stops a subscription leaves the
  state that stopped it" (`rehearse.test.ts`). Documented.
- **What `Effect.uninterruptibleMask` runs outside `restore` cannot be interrupted**, which is how `drive` stops and
  awaits its run when whoever runs it interrupts it: "drive interrupted by whoever runs it" (`drive.test.ts`); and how
  `rehearse`'s `run` and `hearNext` give the loop the message they took before anything interrupts them: "a run
  interrupted while its answer stops a subscription has answered, and leaves its state", "a hearNext interrupted while
  its message stops a subscription leaves the state the message made" (`rehearse.test.ts`). It is also how the end of
  `rehearse` takes the scenario's exit however it ends, an interruption by whoever runs it included, and stops what it
  started before it reads what its fibers died of, the defects first: "interrupted by whoever runs it, it fails on a
  defect of what a subscription releases", "a defect of a release still under way when the scenario returns fails it",
  "a defect the scenario catches fails it all the same, first, and once" (`rehearse.test.ts`). Documented.
- **A fiber forked with `Effect.forkIn` is interrupted when its scope closes, and not when the fiber that forked it
  ends, and the close waits for it to end, its release included**, which is how `rehearse` keeps its loop, and a
  subscription that `hearNext` started for as long as its key stays, whichever fiber of the test's asked for them: "a
  subscription first heard in a fiber that has ended since keeps running while its key stays", "a subscription it
  started is released when whoever runs the rehearsal interrupts it"; and how its end reaches a release under way in
  a step its loop was interrupted in, whose key has already left the state: "it returns once a release under way when
  the scenario returns has ended, its key already gone", "a defect of a release still under way when the scenario
  returns fails it" (`rehearse.test.ts`). That it is interrupted when its scope closes is documented
  (`Effect.forkIn`); that it is not when the fiber that forked it ends is not, and "a subscription first heard in a
  fiber that has ended since" fails without it; that the close waits is not either, and the last two fail with a
  close that does not wait.
- **`Effect.onInterrupt` runs its finalizer when the effect is interrupted**, which is how `rehearse` fails on a
  command whose `run` was interrupted before it answered: "when a run interrupted while its command runs leaves the
  command unanswered" (`rehearse.test.ts`). Documented.
- **`Effect.scoped` closes the scope once the effect has ended, and what an effect inside it does on its exit runs
  before the release**, which is how `scopedIn` records the defect of a command, a subscription or the renderer before
  its release lets another fiber die: "a renderer that dies before a command is the first defect of the cause", "a
  command that dies before another, which its release lets die, is the first defect of the cause", "a subscription that
  dies before another, which its release lets die, is the first defect" (`run.test.ts`), "a command that dies before
  another, which its release lets die, fails it first", "a subscription that dies before another, which its release
  lets die, fails it first" (`rehearse.test.ts`). Documented.
- **An effect ends with a defect only once what it wraps around its own code (`Effect.ensuring`, an `Effect.scoped`
  of its own) has run, and `Effect.catchCause` around it recovers from the defect**, which is why the README counts a
  defect from the end of the effect, and the engine learns of it no earlier: "a command that dies under a release of
  its own dies once it has released, applying messages meanwhile", and the same of a subscription and of a renderer,
  "a command that catches the defect of a scope of its own answers, and the run goes on", and the same of a
  subscription and of a renderer (`run.test.ts`), "simulate applies, as the run does, the answer of a command that
  catches the defect of a scope of its own", and the same of `rehearse` (`contract.test.ts`). Documented.
- **`Channel.toPull` keeps what a channel acquires, in scopes of its own too, in the scope it is given, and releases
  none of it as the pull fails**, which is how `runSubscription` leaves a subscription's channel to release what it
  holds as the scope of `scopedIn` closes, once its defect is recorded, and how the loop applies nothing meanwhile: "a
  subscription dying in a scope of its channel, before one its release lets die, is the first defect", "a subscription
  dying in a scope of its channel lets no message apply as the channel releases" (`run.test.ts`), "a subscription
  dying in a scope of its channel, before one its release lets die, fails it first" (`rehearse.test.ts`). That it
  takes the scope it is run in, and its pull is used while that scope is open, is documented; that a failing pull
  releases nothing is not, and the three fail with `Channel.runForEach`, which closes a scope of its own before the
  defect leaves it.
- **`Effect.raceFirst` ends with the first of its effects to end, and interrupts the other, and waits for it to end,
  its release included**, which is how a call of `rehearse`'s that waits for a subscription or a command fails as soon
  as another fiber dies: "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies", "a
  run waiting for its command fails as soon as another fiber of the test's dies" (`rehearse.test.ts`); and how a `run`
  whose command dies fails with what the command dies of as it releases, too: "a run whose command dies, then dies
  again as it slowly releases, fails with both" (`rehearse.test.ts`). That it interrupts the other is documented; that
  it waits for it is not, and the last test fails with a race that does not wait.

A premise about what code does when it runs is checked before the change that rests on it is written, and never
only reasoned:

- **Documented, on a stable API**: the documentation is enough, since a stable API keeps its promise within the
  major. For Effect, it is the JSDoc of its declarations in the version of the lockfile, where the peer range starts;
  for the JavaScript engine, the ECMAScript specification. That a bug of the dependency where it promises is caught
  by no test is a risk the rule accepts.
- **Not documented** (read only in the source, or seen in a run): a test that fails without it. For Effect, what is
  not promised may change in a minor version: an upgrade of Effect runs every such test before it raises the peer
  range. For the JavaScript engine, the test runs on Bun only, and says so: what Node or a browser could do
  otherwise goes under "Premises that no test reaches yet", unless `smoke/` runs it on Node.

What the dependencies of development do (fast-check, happy-dom, the renderers of the examples) is no premise of the
library, and the rule leaves it out, with two exceptions. The bridges, `examples/snabbdom.ts` and
`examples/react.ts`, are copied by users: their premises about the renderer follow the rule at the version of the
lockfile, each bridge's opening comment names the versions it was checked with, and what they rest on of the DOM is
documented by its specification (WHATWG), since their tests run on happy-dom, which no browser is; one that is not
goes under "Premises that no test reaches yet". A bridge that becomes a package of its own makes its renderer a peer,
whose range starts at the version it is developed with, as Effect's does. And a test resting on what a dependency of
development does is still held to failing without what it checks.

A premise that the rule cannot check yet holds the change up: it waits, or a guard of the library's makes the premise
unneeded, and the premise goes under "Premises that no test reaches yet". A move to a new major of Effect, or of a
bridge's renderer, checks every premise on it again, the documented ones included.

A review of the premises reports a finding only once it is reproduced by a test that fails, or ruled out by the check
the rule above asks of the premise: a reading of the code alone, or of a dependency's source, gives a lead, and the
review turns it into a test or drops it. A review is due before a release, and before 1.0, over the changes of the
engine and of the testing tools since the last review, in a session that wrote none of them: it follows
[`premise-review`](.agents/skills/premise-review/SKILL.md). A change is not held up for it: between two reviews, what
keeps a known bug from coming back is the rule of fixes that follows, and the tests it leaves.

A finding is fixed by its form, not only by the sequence that found it. The fix names the form (a cleanup skipped, or
an exit discarded, as a scope closes; a step applied by two actors at once; a window between two fibers that nobody
watches), looks for it in every place of the engine and of the testing tools that ends a run, applies a message or
releases what a fiber holds, and leaves a test at each place the form can reach. The second review of November 2026
met the form of f415d46 again in four places that the fixes of the first had not looked at.

### Premises that no test reaches yet

A lead no test can reach yet is listed here, with what would decide it. None is, today.

## Code

- One module per concept: `update.ts`, `command.ts`, `subscription.ts`, `dispatch.ts` (views and their
  dispatch), `program.ts` (the program and its types), `compose.ts` (`parent`), `log.ts`, `defect.ts`;
  `core.ts` is what the run and the testing tools share, as pure functions of data (`docs/shared-core.md`);
  `engine.ts` is the runtime only (with `RunOptions`), and `run.ts` connects it to a renderer. `testing/` holds
  one module per testing tool (and `unexpected.ts`, the failure they share).
- A piece of a program that may be missing (`runCommand` without commands, `subscriptions`) is read through
  `runCommandOf` and `subscriptionsOf`, never directly: the engine always gets the complete set. Likewise
  `init`, a step or a function of the flags, is read through `startOf`: a step is never a function, so `typeof`
  tells them apart, and so does `compose` for a child's handle.
- Effect modules are imported as namespaces (`import * as Effect from 'effect/Effect'`), with `Arr`, `Opt` for
  `Array`, `Option`.
- A function that returns an effect made with `Effect.gen` is an `Effect.fnUntraced` instead, with what would
  follow it in a `pipe` as its further arguments, tests included: the library opens no spans of its own (they
  belong to the application, e.g. `Effect.fn('Save')` in a `runCommand`), and the stack frames `Effect.fn`
  records add nothing a test's name does not say. An effect that takes no arguments stays an `Effect.gen`.
- Relative imports carry the `.ts` extension (Biome's `useImportExtensions`); `tsc` rewrites them to `.js` in
  the build, and `build.ts` does the same in the declarations.
- Comments only for what the code cannot say: a reason, an invariant the types do not show, a choice that
  would look like a mistake. Never a repetition of names or of the next line.
- No blank lines between the statements of a block; blank lines separate declarations and `describe`/`test`
  calls.
- Formatting: 120 columns, two-space indentation, single quotes, no semicolons, trailing commas in multiline
  lists; `.md` prose wrapped at 120 columns. No formatter is set up: match the surrounding code, and touch only
  the lines you change.

## Tests

- `bun:test`, in a `*.test.ts` next to the module. Tests are excluded from `dist/` and from the packed `src/`.
- Test through behaviour (`run`, `Engine.make`, the public functions), not through internals.
- A test of the library is of one of five kinds, and a test of none of them is not added:
  - **the semantics of the pure pieces**: what a function that runs nothing returns, as a `Step` and `andThen`,
    `forEach` and `reject` over it, a parent's composition, how a child's message is wrapped, how the logs describe
    a message, `defect`, `applyAll` and `dispatchViolations`, what the core makes of a cause and of the keys of a
    state. They lie in the test file of their module (`compose.test.ts`, `dispatch.test.ts`, `log.test.ts`,
    `defect.test.ts`, `core.test.ts`, `src/testing/`).
  - **invariants under random histories**: fast-check draws clicks, answers, subscription messages and ends,
    releases, defects and self-interruptions, and the seed of the order the scheduler of the tests (`test/scheduled.ts`)
    runs them in, and each promise of the README's "Guarantees" that the scenario reaches is checked on every one
    (`interleaving.test.ts`). It is a search, from a seed drawn on each run, and runs apart: `bun run interleavings`,
    and a daily job of the CI (`.github/workflows/interleavings.yml`), never `bun run test`. An order it finds is a
    finding, listed in `ROADMAP.md` with its seed and path until a fix leaves a deterministic test of it; no
    mutation names it among its killers.
  - **contracts**: one program and its inputs given alike to each testing tool and to the run
    (`src/testing/contract.test.ts`, where a `test.failing` says how they still differ), and one view to each
    bridge (the same tests, `messagesSentBy`'s included, in `examples/snabbdom.test.ts` and
    `examples/react.test.ts`).
  - **the boundary of a run**, the run's or a testing tool's: its lifecycle, scopes, interruption and defects, what
    it holds and lets go, what a tool fails on (`run.test.ts`, `engine.test.ts`, the cache of `dispatchTo` in
    `dispatch.test.ts`, a parent's subscriptions in a run in `compose.test.ts`, each tool's own file in
    `src/testing/`, a bridge's `renderInto`). A test of a premise ("What the invariants rest on") is of this kind,
    and so is one under the scheduler of the tests, `test/scheduled.ts`, which is no part of the package.
  - **the types**: what the compiler refuses (`@ts-expect-error`), or infers (`expectTypeOf`), next to the tests
    of the function whose types they are.

  A bug found is held by a case of one of them: a rule of a pure piece, an invariant, a contract, a boundary or a
  type, and gets a scenario of its own only where none can hold it. The examples' own tests show users how to test
  a program, and the smoke test (`smoke/`) and the benchmark (`bench/`) check the package and its speed: none of
  them is a test of the library's correctness, and they are kept apart from the five.
- **Each check an invariant rests on has a mutation** in `mutations/mutations.ts` that takes it out, with the tests
  that must fail under it: `bun run mutations` applies them one at a time to a copy of the repository (`.mutants/`),
  runs those tests alone, and fails when one passes under its mutation, or fails without it. So a test that fails
  without its check is run again, not only seen once. A new check adds its mutation; a test of one renamed or
  removed, or the code it replaces rewritten, updates the list, which the script refuses otherwise (a name that runs
  no test, or a text not found exactly once); `bun run mutations --discover <name>` lists every test that fails
  under one. A test that fails only beside others of its file is no killer: the list names those that fail alone. It
  runs before a release (`release`), and after a change of a file it mutates.
- A test's name says what it checks. When a change touches a test, or what it tests, check that its name, its
  `describe` and its comments still say what the assertions check: a test adapted to a new design keeps an old
  name that promises what it no longer proves.
- Only the bridges' tests, `examples/snabbdom.test.ts` and `examples/react.test.ts`, register a DOM (happy-dom);
  every other test runs without one.

## Checks

Before finishing, from the repository root: `bun run typecheck` (`tsc` with the Effect language service, on the
library and on the examples), `bun run lint` (Biome and Oxlint) and `bun run test`; after a change of the engine or of
a testing tool, `bun run interleavings` too. `bun run build` compiles `src/` into `dist/` (ignored by git) and runs
before `bun pm pack`. An API change is also checked as a consumer
would see it (`change-api`).
