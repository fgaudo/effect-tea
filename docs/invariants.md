# Invariants the engine keeps

The README's "Guarantees" says what a user may rely on, and the library's tests check each one
(`src/interleaving.test.ts` checks all but that of the order, and what the run does from the first defect on, the
rule of an input, and what a frame has seen, under random orders of clicks, writes into an input, current and stale, answers, subscription
messages and ends, releases, defects and self-interruptions, as the README says). This is how they are kept, and
what a change must not undo. What they rest on of Effect and of the JavaScript engine is in
[`premises.md`](premises.md), and how a change of the engine or of a testing tool is made in
[`change-engine`](../.agents/skills/change-engine/SKILL.md).

The entries are in three parts: what a program may rely on, with how the engine keeps it; what the engine keeps for
itself, so that the first part costs what it should; and how a check is built and tested, in the engine and in the
testing tools.

## What a program may rely on

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends
  each one twice): never assume it runs once per message.
- **Messages are applied one at a time, in the order they were queued**: one loop takes them from one queue
  (`engine.ts`), and takes the next only once the step of the one before is over, its observer, its frame, its
  subscriptions stopped and started and its commands started. Never apply a message from another fiber, nor start a
  step's commands apart from it. That a `Queue` gives its items in the order they were offered is documented:
  "dispatches run one after the other in one callback, before the run takes any, are all applied in order", "hears
  every accepted message in order, with the states around it, before its frame" (`run.test.ts`).
- **A dispatched message is numbered as it is queued, and a frame says how many of them it has seen.** A dispatch
  returns the number of its message among those dispatched, from 1, taken in the thunk that offers it to the queue
  (`send` in `engine.ts`) each time the effect runs, never as it is made, so that the numbers follow the order the
  queue gives, which is documented. The loop counts each dispatched message it takes, a rejected one and one that leaves
  the state as it was included, and no message of a command or a subscription. It counts the message before the state
  it makes is published, and publishes the count in the same object as the state (`{ ...next, seen }`), so that a
  frame's `seen` is the count of its own state's step, whatever the loop has taken since. A message that makes no
  state draws no frame, so the last frame's `seen` may stay below the last number: nothing may wait for it to reach
  one. The thunk of the number holds no code of the program and has no mutation ("one thunk"): "follow the order
  update hears them in, under every schedule within two deviations" (`engine.test.ts`) is its alarm. Each other check
  has a mutation (`mutations/mutations.ts`), and `interleaving.test.ts` checks the count of every frame drawn.
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
- **A write is stored over the value it names, and only what is drawn writes into an input** (`written` in
  `input.ts`, applied in `compose.ts` as an input's program; [`registers.md`](registers.md) says why). A write is a
  message of the composed program like any other, so the state stays the fold of `update` over the messages,
  `applyAll` replays it, and neither the engine nor the testing tools know of inputs. It is stored when the input's
  place holds, by `Equal`, the value it was written over, whatever it is, and a write of the value held leaves the
  very same value; over another value it is rejected, since the state has moved on without the element that wrote
  it: a stale write does not apply in the state, the one meaning of `reject`. The rule reads the state and the message
  alone and keeps nothing between two writes, so every other step, the parent's own, a child's and what `onEvent`
  makes of its events, leaves an input as it wrote it, and a reset, an undo by snapshot or a place that comes back
  cuts no history. A write comes only from a view: an own subscription sends the parent's own messages, and a command
  answers with its own and its children's external ones (`RunCommandOf` in `compose.ts`), so neither compiles with a
  write, into the parent's input or a child's. Two limits are declared, not flaws: a write over a value that came
  back is stored, and a message names a place, so one drawn for an old instance reaches the new one. Each check has a
  mutation (`mutations/mutations.ts`).
- **The rule of an element is the library's, and the bridges only keep their registry** (`typed` and `drawn` in
  `input.ts`). `typed` makes the write and what the element records of it from one value, the element's, so the two
  cannot differ; the number comes from the dispatch the bridge runs, given to a continuation, since the library
  runs no dispatch. `drawn` compares the frame's value, by `Equal`, with what the element showed before its first
  write the frame has not seen, or with what it shows when the frame has seen them all, and returns the very `value`
  it held when the element stays, which a bridge compares by identity to decide whether to set the element. It
  promises the screen only for elements and renderers that meet the condition of the README ("Inputs the user types
  into"); the bridges' tests check it in a DOM. Each check of `typed` and `drawn` has a mutation.
- **Every program keeps its state in an object**, replaced and never mutated, so that any program can be a child: a
  parent keeps a child's model and its lifted subscriptions by its state object (below), and a number or a string
  has no identity to keep them by. It binds whoever writes a program, and the types are what enforce it
  (`ObjectState` in `program.ts`, checked by `Program`, `composition`, `child`, `each`, `run` and the testing tools). A
  primitive state gets past them only by a cast, or from a caller without TypeScript: a program run alone never needs
  its state to be an object, and is not checked, while a child's is checked where a parent reads it for a model or
  for its lifted subscriptions (`objectAt` in `compose.ts`), and is a `CompositionDefect` that names the child, since
  the state is the one the parent's `get` declared, where a `WeakMap` would raise its own `TypeError`.
- **Running a dispatch needs no services and completes synchronously**: it only numbers the message and offers it to
  the engine's unbounded queue, which wakes the engine on the scheduler of the run that made it, so that renderers
  send from plain callbacks with `Effect.runSync`. Keep the queue unbounded (one that waits when full would make
  every such call throw, one that drops would lose what the user did) and the dispatch free of services.
  Running a dispatch is the renderer's business: the library exports no helper for it.
- **A subscription never ends in silence**: its end value is a message (or `never`), sent to `update`. An ended
  subscription keeps its key among the active ones until the key goes away and comes back: never restart it
  automatically, which would loop on one that ends at once. What the end of a library's stream means is the
  caller's decision: no helper takes it for them, and the type of a subscription asks for it (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key leaves running, a gone key interrupts.
  The gone keys are interrupted together, and awaited before any key starts: the loop waits for the slowest
  release rather than for their sum, and a key that comes back finds its old subscription released. A parent
  lifts its children's keys under their names, and dies on an own key equal to a lifted one.
  Each start has a generation that its messages carry, and a message whose key is gone, or came back with a new
  start, is dropped before `update`, however the fibers were scheduled: "a message left by an earlier start of a key
  that came back does not reach update" (`engine.test.ts`), "what a subscription leaves in the queue after its key
  went away does not reach update" (`run.test.ts`). `rehearse` never gives `arrive` such a message: its ledger
  forgets a start in the transition that stops it ("a start whose key went away is stopped and forgotten, and the
  calls waiting on it are told", `ledger.test.ts`). The rule rests on nothing of Effect: it is the engine's own,
  tested where the fibers' order would otherwise hide it. Keys are the program's, and so are their
  `Equal` and `Hash`: the run compares them only in `'subscriptions'` (`reconcile` in `core.ts`), and keeps its
  fibers, and tells a message that still applies, by their start, which compares no keys.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description
  that must be kept in step with one: a test, `onApplied` and the logs read the command itself.
- **Commands cannot be cancelled**, a deliberate choice: do not add cancellation without asking.
- **Each command, each subscription and the renderer has a scope of its own** (`Effect.scoped` where the
  library starts them; a command's closes before its message is queued), and `simulate` scopes each command the
  same way. Never let them acquire into the run's scope: what they hold would outlive them, and be released
  before their fibers are interrupted.
- **Frames cost only what is drawn**: a frame's model is made as the renderer pulls the frame, by a `Stream.map`
  after the sliding buffer (`run.ts`), never for a state the buffer dropped, and a message that returns the very same
  state makes no new frame (a parent keeps its own state when a child's message leaves the child's as it is). Never
  make models before the buffer: "a model is made only for the frames the renderer pulls, never for a state the
  buffer dropped" (`run.test.ts`) and its mutation keep it. `rehearse` makes the model of each new state in the step
  that makes it, the test being a renderer that pulls every frame, so that a defect of `makeModel` ends each tool as
  it ends the run, and no scenario meets it.
- **`onApplied` and `onIgnored` watch, never steer**: they hear each accepted, or rejected, message in order,
  with where it came from, before its frame is published. The run gives them no dispatch and keeps nothing of what
  they return (an `Effect<void>`): they send no message and change no state, and that is all the rule means.
  They do hold the program while they run, since the next message waits for them so that they hear every one in
  order, and one that never ends holds it, as the README says ("Running"). A defect in them is a bug like any
  other. Neither hears a message dropped before `update` (one left by a stopped subscription): that is the
  engine's, not the program's.
- **Logs never carry message data by default** (`describeByTag` in `log.ts`): only tags, following a wrapped
  `message` or `command` only when it is itself tagged, since a program's own field of that name may hold data.
  A subscription's key is logged as it is, and may hold data, as the README says ("Running"): the rule is of
  messages and commands.
  Level: `debug` for the message loop and for subscriptions starting, stopping and ending, nothing else. What
  is computed only to be logged (`describeMessage`, `describeCommand`) is computed only while debug logs are
  enabled (`LogLevel.isEnabled`).
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn them into
  messages: reporting is the job of whoever runs the program.
  - A fiber of the program dies when its effect ends with a defect: what the program wraps around its own code
    (`Effect.ensuring`, an `Effect.scoped` of its own) runs before, and may still catch it, so never add a way to learn
    of a defect earlier (a `Supervisor`, a look at a fiber's state); what it acquires in the scope the library gives it
    is released after, and what that release dies of is a defect once the scope has closed.
  - Where the engine knows where a defect happened, it wraps each defect of the cause in a `ProgramDefect` (`diesIn` in
    `engine.ts`) that holds it as its `cause` and says where, and keeps the rest of the cause. The run's own logs die in
    `'log'`, each outside any other site, so that a `Logger` that throws is never taken for the subscription or the step
    that logs; what the program logs is in the site it logs from.
  - The run stops each fiber of the program with a mark of its own on the interruption, made anew for each stop
    (`stopping` in `engine.ts`, `Stopped` in `core.ts`), and `diesIn` takes an interruption of the cause for one the
    fiber received only when it has the fiber id and the mark, or the lack of one, of a received one: a fiber id alone
    is one the program can make too (`FiberMap`, `FiberSet` and `FiberHandle` interrupt as the fiber -1, and the fiber
    that ends the run may have interrupted another before). Never stop a fiber of the program otherwise. So do the
    testing tools, which run in their caller's fiber: `rehearse` stops a command whose `run` is interrupted, the keys
    that went away and, as it ends, the subscriptions `hearNext` started and the commands under way, before it closes
    its scope, which would interrupt them as the fiber that ends it; `simulate` runs each command in a fiber of its
    own, which it stops when it is interrupted.
  - Each fiber of the run records what it dies of in one place (`makeDeaths` in `engine.ts`, made by `run` or `drive`
    and given through `runWith` to the engine; `rehearse` has its own, keeping only the program's defects): the engine's, the renderer, and the
    run's own as it starts the engine, as they end, and one with a scope of its own as it dies too, before the scope
    releases what it holds (`scopedIn`), a subscription's channel and the scopes of its own included
    (`runSubscription`), so that a defect is in the order it happened, though its release lets another fiber die first;
    what the release dies of is wrapped apart, told from what the fiber died of by what the fiber kept of it, never by
    the register, where a defect another fiber recorded may be the very one a release dies with.
  - The order of the defects is the engine's to keep, and its tests', and no promise of the README, which describes
    it: what a user relies on is that every defect is in the cause, each with where. No promise of the library's
    rests on what a function of Effect makes of a cause (`Cause.squash` gives the first defect).
  - Each defect recorded is reported once, in that order: by the run as soon as one dies, and by the end of the run,
    which stops the loop first and waits for it (`stop` in `engine.ts`), so that what is sent meanwhile is not applied
    and nothing forks a fiber while it reads them, then interrupts its other fibers itself, waits for them to release
    what they hold, and dies of the rest; the run's cause holds the defects first, then the rest of what it ended with,
    but for the defects already among them, by their identity (`endedWith` in `core.ts`, which `rehearse`, `drive` and
    `simulate` end with too).
  - From the first defect recorded on, the run applies no message, until its end stops the loop: it calls no `update`,
    checked in the thunk that calls it (`arrive` in `core.ts`), where no other fiber can run, since the scheduler may
    yield at any other operation. It is the only check. A step whose `update` was called before goes on whole until the
    end stops the loop: it may still start its commands and the subscriptions of its new keys. The renderer is called
    at most once, as the run starts, with no check before it: a run that died meanwhile may end before the call, which
    is the first step of a fiber `Effect.forkChild` does not start at once, or make it and interrupt its effect, and
    nothing is promised of which. Never add a check in the middle of a step, nor
    before the renderer: it would leave a state whose commands never started, which `onApplied` heard of, and protect
    nothing a correct program needs, since a command that died is, to `update`, one that has not answered yet
    (`docs/single-owner.md`).
  - What an effect of the program does once started is its own, until the end of the run interrupts it: no check can
    come between two of its operations. So is what the renderer pulls: a frame's model is made in the renderer's
    fiber, as it pulls the frame, and `makeModel` is pure, so the run checks nothing there, and a frame pulled after
    the defect still makes its model, as the README says.
  - Never report a defect only through a `join`, or through a fiber that races: once nothing awaits it, or the race is
    lost, the defect is lost with it, and `FiberSet` and `FiberMap` discard the exits of the fibers they interrupt as
    they close. The renderer is one of them, interrupted and awaited however the run ends, once the loop has stopped and
    before the engine's other fibers (`running` in `run.ts`).
  - `drive` stops and awaits its run however it ends, interrupted too. Its renderer is the run's, which makes each
    model as it pulls the frame, so a defect of `makeModel` is the renderer's, recorded in the register of the run
    (`runWith` in `run.ts`) as any other, and the scenario races only the end of the run. A call of `rehearse`'s that
    waits for a subscription or a command races its wait with the death of any fiber (`orDead`), as the run dies at
    once.

## What the engine keeps for itself

- **A child's model, and its lifted subscriptions, are kept by its state object** (`modelsOf` and `lifted` in
  `compose.ts`) for as long as that object lives: they rely on `makeModel` and `subscriptions` being pure and on
  states being replaced, never mutated, and hold nothing of the run, so runs that share a state share them. A
  model holds nothing of its place either, so children that share a state share its model. Lifted subscriptions
  carry their place: a state keeps them for the places it held in the last call of its parent's `subscriptions` that
  met it, in their order, each checked, so that children that share a state, as those a step's `init` starts do,
  keep theirs, and ids never pile up under a shared state, since the next call that meets it lets go of the places it
  no longer holds. A place met out of that order, or a state that two callers meet in turn at other places (two
  runs, or one program as two children), is lifted again: it costs time, never a wrong place. They need the state
  to be an object, which every program keeps (above): never add a cache for primitive states, which nothing could
  let go of.
- **A child's dispatch is the same while anyone holds it** (`dispatchTo` in `dispatch.ts`): kept weakly by its
  parent's dispatch, its name and its id (compared with `Equal`, as subscription keys are), and removed by a
  `FinalizationRegistry` once collected. Never hold them strongly: ids that are never reused, as the README
  advises, would pile up for as long as the run lasts.
- **No span lives as long as the run**: `run` and `Engine.make` are untraced, and the run's fibers see the span
  of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every log as an event of the
  current span until it ends.

## How a check is built, and how the testing tools follow

- **A check of what another fiber may change, and the act it guards, are one thunk.** Where the engine or a testing tool
  decides from what another fiber may change (the register of deaths, the keys of a state, `pending`), the check and the
  act it guards, a call of the program or the start of a fiber, are in one synchronous thunk: the scheduler may yield at
  any other operation, and another fiber die or write meanwhile. The check is a transition of the core (`core.ts`,
  `testing/ledger.ts`), tested on its own; where program code lies between the check and what the test watches, a gate
  (program code held by a `Deferred`) makes the order deterministic. A change of the engine or of a testing tool lists
  the points where another fiber can run between a check and its act, and leaves a test that fails without the check,
  deterministic, of the core or with a gate, and a mutation that takes the check out, naming that test (`mutations/`,
  `change-engine`). No test of a check runs under the scheduler of the tests (`test/scheduled.ts`): a check whose
  mutation no deterministic test kills is moved until one does, or goes. Three rules keep a check where such a test
  reaches it (`docs/single-owner.md`):
  - **A function of the program is called where the call is decided**, never as the first step of a fiber forked for
    it, which starts when the scheduler says, unless the fork is documented to start at once (`FiberSet.run`).
  - **One check for each call.** No earlier check of the same register stands in front of it in another thunk: it
    would answer in its place in every order a deterministic test reaches.
  - **A fiber and how it stops are one primitive**, `Effect.acquireRelease(fork, stop)`, with nothing in between for an
    interruption to fall into (the renderer in `run.ts`), or `Effect.acquireUseRelease` where a call waits for the
    fiber (a command's in `rehearse`'s `run`), or the fork and what keeps it for the stop in one region nothing
    interrupts, where the stop is the end's (the loop in `engine.ts`, for `stop`).

  What cannot be one thunk with its check, as the first step of an effect of the program, is no act the README
  promises about.

  A region nothing may interrupt holds no code of the program, so no gate reaches it, and it has no mutation: one that
  took it out would fail only under the scheduler of the tests. It is written in one of three forms: a transition of
  the ledger made in the thunk of an offer to `rehearse`'s loop (`offered`, of `submit` in `loop.ts`), held by the test
  of the transition (`ledger.test.ts`); a fiber and how it stops as one primitive or one region, above; what follows
  an effect of the program outside `restore` (a command's answer, offered to the loop). The last two are held by
  Effect's documentation, and the region of the loop by the tests of a premise Effect does not document
  (`premises.md`). The checks beside them (`ended` in `loop.ts`, the register, a call that left) each
  have a mutation with a deterministic killer, and the tests of `rehearse.test.ts` under the scheduler of the tests
  stay as alarms of the search, killing none.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler
  ("Testing" in the README says what each one runs, fails on and ignores); `rehearse` fails on a command left
  pending, since its answer would arrive, and `drive` acts only as a user can, through `run` and the run's
  dispatch. The end of a rehearsal reads the commands under way in the thunk that takes the scenario's exit, which
  is the one that marks the end of the loop (`end`, in `loop.ts`), which refuses what is asked after it; a scenario
  that returned lets the loop finish what it was offered, a release a step waits for included, before the end stops it
  and reads the commands pending: never interrupt that step to end sooner. A scenario that failed, or was interrupted,
  has the end interrupt the step under way, wherever it is: so the end stops what still runs by the fibers themselves,
  kept as they are forked (`listeners` and `commands` in `rehearse.ts`, as the engine's end reads its `FiberSet` and
  its `FiberMap`), and tells every call of `hearNext` that has not ended (`calls` in `ledger.ts`), never only what the
  ledger still says of a start, which the step forgets in the transition that stops it: "a subscription that
  interrupts itself as the end stops it, its key gone, is a defect", "a hearNext waiting on a start whose key went
  away fails, though the scenario failed", "a hearNext whose message was stopping a subscription as the scenario
  failed fails as one waiting" (`rehearse.test.ts`), and of the engine "a subscription interrupting itself as the end
  of the engine stops it, its key gone, is a defect" (`engine.test.ts`). Never make what an end stops, or tells,
  depend on what a step it may interrupt writes after its thunk. When the engine or one tool changes, keep
  the others in step. `src/testing/contract.test.ts` gives the same program and inputs to each tool and to the run;
  where they still differ, its `test.failing` cases say how, and `ROADMAP.md` lists them.
