# Invariants the engine keeps

The guide's "Guarantees" says what a user may rely on. This page says how the engine keeps it, and what a change must
not undo. The tests of each check are those its mutation names in `tools/mutations/mutations.ts`, which the runner
checks (`bun run guarantees` prints them by item of "What you can rely on"); a check with no mutation says here why.
What the invariants rest on of Effect and of the JavaScript engine is in [`premises.md`](premises.md), and how a
change is made in [`change-engine`](../.agents/skills/change-engine/SKILL.md). Why a dispatch applies its message at
once is [`synchronous-dispatch.md`](records/synchronous-dispatch.md).

The page has three parts: what a program may rely on, what the engine keeps for itself, and how a check is built, in
the engine and in the testing tools.

## What a program may rely on

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends each
  one twice): never assume it runs once per message.
- **Messages are applied one at a time, in the order they were sent, each in the call that sends it.** One synchronous
  thunk applies each (`applyOne` in `engine.ts`): the check of a death and of the message's start, `update`, the option
  that hears it, the new state and its keys. A message sent during it waits in `pending` until it is done (`apply`). By
  ECMAScript's run to completion no other code runs inside the thunk, so its checks and its act are one thunk by
  construction.
  - The subscriptions a step stops and starts, and the commands it starts, are a job. The jobs of a call are offered
    once the outermost `apply` returns, to one fiber of effects, which takes them from an unbounded queue one at a
    time, in the order of the states (`perform`). A step that stops, starts and commands nothing makes no job
    (`queue`). A message sent before the effects start is applied all the same, and its job waits for them (`effects`).
    Never apply a message from the fiber of effects, nor start a step's commands apart from its job.
  - The listeners are told last, once the state is current, over a copy of the listeners, each only while it is still
    among them (`tell`): one stopped during a notice is not told of it, and one added is told from the next, so a
    listener that adds another on every notice cannot loop. That they are told after the job is made and the keys
    reconciled is no promise, and has no mutation.
- **`reject` means one thing: the message does not apply in the state.** The run ignores every rejection, and whether
  the view sends only what applies is for the tests. Never add a runtime check of the model against `update`, nor a way
  for a model to ask `update` what it accepts: the two are derivations of the state that tests check against each
  other, and a model that asked would make a wrong rejection a control that silently disappears. A `defect` is only for
  a message the state and the engine together rule out: an example never dies on a message of its view, nor on an
  event raised for one.
- **A parent and its children talk only through external messages, events and outputs**, so that `reject` means the
  same everywhere.
  - A child answers an external message in its `external`, which returns a step, never a rejection. A parent that
    tells one to a child not there once its step is reconciled breaks what it declared: a `CompositionDefect`, as every
    such break is (`defectAt` in `compose.ts`), so that reports group them and name the child.
  - A parent is not given its children's states: the library keeps them beside its own, in the composed program's state
    ([`kept-children.md`](records/kept-children.md)). So only a child's own `update` and `external` change its state,
    and a parent reads only its `output`, a pure function of its state, of the children of the moment (`outputsOf`): of
    before the step in `update` and `external`, as the child's step left them in a handler of `onEvent`.
  - What a parent tells is data of its step, `tell`, given to the children once the step's state is reconciled, in
    order, each to its end (`ownStep`). An item bound to an instance that an earlier item dropped or started again is
    told nothing.
  - The types enforce what a parent declares: `runCommand` exactly when it has commands of its own, `onEvent` exactly
    when a child has events, `external` exactly when it names external messages, a `tell` only with what the child's
    `external` takes, own subscriptions and commands that send only the parent's own messages (`RunCommandOf`), and no
    own message or command named like a child. A program written without `Program<…>` has `unknown` types, read as
    `never` (`Items` in `program.ts`), so that it opens none of these checks.
- **The children are those the parent's own state lists, and an answer reaches the instance that asked for it, or is
  rejected.** After each step of the parent's own code (`init`, `update`, `external`, a handler of `onEvent`, a write
  into its input), the library starts each child the own state lists anew, with its first commands, drops each it no
  longer lists, and starts again one whose flags or key differ by `Equal` (`reconcile` in `compose.ts`). So the state
  stays the fold of `update` over the messages, and the engine and the tools know nothing of children.
  - Each start has a number, counted in the state (`starts`), which the child's lifted commands, answers and keys
    carry. A message whose number is not that of the child there is rejected, so a child closed and opened again, or
    started again in one step, never gets the answer of the one before. A message of a view carries no number, and
    names the place alone, as a write does.
  - Children by id whose `ids` gives the very same object for the own states before and after are not reconciled:
    `ids` is pure. An id listed twice is a `CompositionDefect`.
- **A write is stored wherever its place is there, and only what is drawn writes into an input** (`written` in
  `input.ts`, applied in `compose.ts` as an input's program; [`registers.md`](records/registers.md) says why, and
  [`write-without-was.md`](records/write-without-was.md) why a write names no value it was written over).
  - A write is a message like any other, so `applyAll` replays it, and neither the engine nor the tools know of
    inputs. It is stored whatever it is and whatever the place held, since the element already shows it, in the form
    its input declares (`store`); a stored form equal by `Equal` to the value held leaves the very same value.
  - A write into an input by id is routed as a child's message by id is (`getInput`). A write whose place is not there
    is rejected by that routing, before `written` and the form: it does not apply in the state.
  - The rule reads the message alone and keeps nothing between two writes, so no other step changes an input, and a
    reset or an undo by snapshot cuts no history. A write comes only from a view: an own subscription or command sends
    only the parent's own messages, so neither compiles with a write. A message names a place, so one drawn for an old
    instance reaches the new one: a limit declared, not a flaw.
- **What a screen shows of an input is the bridges', and the library keeps no rule of an element.** The guide promises
  it in "Inputs" and "Writing a bridge", and `bridges/bridge.test_suite.ts` checks it in a DOM. Since a write names no
  value it was written over, a key typed on a view older than the state would store that view's text over the state:
  so a bridge draws each new state before the browser handles the next event.
  - The bridge to React reads the model with `useSyncExternalStore` (`premises.md`, of a controlled input and of a
    store updated outside its events).
  - The bridge to snabbdom gives each element drawn with a `value` or a `checked` in `props` that prop back after each
    draw, where the element differs (`giveBack`), since snabbdom sets a prop only where the vnode changed. It draws in a
    microtask after each notice, and after each message its view's `dispatch` sends, whether it made a state or not
    (`notice`): the HTML Standard runs the microtasks after each task and each listener the browser calls. The notices
    of one task are drawn once; a message a listener sends during a patch is drawn after it, in a microtask of its own;
    a draw asked for before the bridge stops is not made after it. The check that asks one microtask for a task's
    notices (`if (queued) return`) has no mutation: a second one draws the model drawn last, which patches nothing.
  - No check holds an event that the program's own code dispatches before a draw (`element.click()`, `focus()`), whose
    handler runs on the view of before the notice: `bridges/browser.test.ts` shows it in real browsers.
- **Every program keeps its state in an object**, replaced and never mutated, so that any program can be a child: a
  parent keeps a child's model by its state object, and a primitive has no identity to keep it by. The types enforce
  it (`ObjectState` in `program.ts`, checked by `Program`, `program`, `make`, `child`, `childById`, `start` and the
  tools); `make` checks its config, whose program carries the marker `start` asks for (`MakeProgram`). A program run
  alone needs no object, and is not checked; a child's state is checked where a parent reads it for a model
  (`modelOf`), as a `CompositionDefect` that names the child.
- **A dispatch is a function, and needs no services**: it applies its message on its caller's stack, and records what
  the program throws there (`attempt` and `recordThrown` in `engine.ts`, `record` of `Deaths` in `shell.ts`), never
  throwing it to the caller, whose fiber would take it for its own. No fiber is made for a message nor for a defect, so
  a renderer calls it from a plain callback, and effect code wraps it in `Effect.sync`.
  - The queue of the jobs is unbounded, offered with `Queue.offerAllUnsafe`, which never waits: a bounded one would
    refuse a job, and lose the effects of its step.
  - A dispatch sent once the end has stopped the engine applies nothing, and throws nothing.
  - What the loop of `apply` meets thrown outside the program's functions, by the engine or by what `recordThrown` reads
    of a message, its `catch` records as it is, after the defect it was saying, and the run dies of it. Its `finally`
    resets `applying`, offers the jobs and releases the register; the `catch` throws nothing, so the `finally` has no
    mutation.
- **A subscription never ends in silence**: its end value is a message (or `never`). An ended subscription keeps its
  key among the active ones until the key goes away and comes back: never restart it automatically, which would loop
  on one that ends at once. What the end of a stream means is the caller's decision, and the type asks for it
  (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key runs on, a gone key interrupts.
  - The keys are reconciled in the thunk that makes the state (`Core.reconcile` in `applyOne`), so the engine's keys
    are the current state's, while the fibers that run are those the fiber of effects has reached: the two diverge by
    design. The gone keys of a job are interrupted together, and awaited before any start of that job or a later one
    (`perform`). `reconcile` counts the starts of the active keys it finds, not the keys listed, so a key listed twice
    starts once and hides no key that went away.
  - A subscription is made from its key alone, by `listen`, which the fiber of its start calls: a defect of `listen` is
    the subscription's, with its key. A parent lifts its children's keys under their names, and its `listen` lifts a
    child's subscription once for each start.
  - Each start has a generation that its messages carry: a message whose key is gone, or came back with a new start, is
    dropped before `update`, though the fiber of effects has not stopped or started it yet. Such a start is still
    started, and dropped by its start: never skip it in the fiber of effects, which would check from another fiber what
    the thunk changes. `rehearse` never gives the engine such a message: `hear` fails on a key gone from the current
    state, and its ledger forgets a start in the transition that stops it.
  - Keys and their `Equal` and `Hash` are the program's: the run compares them only in `'subscriptions'`, and keeps its
    fibers by their start, which compares no keys.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description kept in
  step with one: a test and `onApplied` read the command itself.
- **Commands cannot be cancelled**, a choice of design.
- **Each command and each subscription has a scope of its own** (`scopedIn`; a command's closes before its answer is
  applied), in the run and in the tools that run them. Never let them acquire into the run's scope: what they hold
  would outlive them, and be released before their fibers are interrupted.
- **A model is made only when it is read**: `app.model()` makes the model of the current state, kept by the state's
  identity in one slot (`model` in `run.ts`), a model that failed included, so a second read of the same state gives
  the very same model, or throws the very same defect, recorded once. Never make a model in the thunk: a model nobody
  reads would cost every message.
  - A parent keeps its own state when a child's step leaves the child's as it is, so the very same state has the very
    same model. The bridge to snabbdom draws no model that is the very one it drew last.
  - The bridge to React reads the model in each notice, where `useSyncExternalStore` compares it, so a model is made for
    every new state on the sender's stack: the guide leaves that unspecified.
  - `rehearse` and `drive` read the model of each new state in a listener, and the first whatever the first keys did,
    by one function (`readEach` in `run.ts`), so a defect of `makeModel` ends each as it ends the run, and a later
    model's defect never cuts its step short.
- **`onApplied` and `onIgnored` are given no dispatch, and return nothing**: functions called in the thunk as `update`
  is (`attempt` in `applyOne`), whose types refuse a value, an effect or a promise among them. They hear each accepted,
  or rejected, message in order, with where it came from, before the new state is current; they send nothing and change
  nothing. So only functions of the program run in the thunk, and nothing holds a step: a release holds the fiber of
  effects alone, as `gate` in `test/gate.test_helper.ts` does in a test. A defect in one stops the step, and one of
  `onApplied` leaves the state as it was. Neither hears a message dropped before `update`: that is the engine's.
- **The run writes no log of its own.** What the program logs is its own. Where the library names a message, in the
  `on` of a defect and in what the tools say, it names it by its tags alone (`describeByTag` in `log.ts`): a wrapped
  `message` or `command` is followed only when it is itself tagged, since a program's own field may hold data.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn them into
  messages: reporting is the job of whoever runs the program.
  - A fiber of the program dies when its effect ends with a defect. What the program wraps around its own code runs
    first, and may still catch it, so never learn of a defect earlier (a `Supervisor`, a look at a fiber's state). What
    it acquires in the scope the library gives it is released after.
  - Where the engine knows where a defect happened, it wraps each defect of the cause in a `ProgramDefect` that holds it
    as its `cause` and says where (`diesIn` in `shell.ts`); what a function throws in the thunk is wrapped alike
    (`recordThrown`, over `Core.wrapDefects`). Every site, a `diesIn`, a `scopedIn` or a `recordThrown`, in the engine
    and in each tool, has a mutation that takes it out or gives it another site, and one that drops the key or the
    message it names: where is what a report groups defects by.
  - The run stops each fiber of the program with a mark of its own, made anew for each stop (`stopping` in `shell.ts`,
    `Stopped` in `core.ts`). `diesIn` takes an interruption for one the fiber received only with both the fiber id and
    the mark of a received one: an id alone the program can make too (`FiberMap`, `FiberSet` and `FiberHandle`
    interrupt as the fiber -1, and `Cause.interruptors` gives a fiber the id of its interrupter). Never stop a fiber of
    the program otherwise. `rehearse` and `simulate` stop the command of an interrupted `run` themselves (`runFirst` in
    `testing/stage.ts`).
  - Only the run interrupts a fiber the run forks. Such a fiber takes an interruption without the run's mark
    (`Core.byTheRun`) for one the program made, in two places. Its scope (`scopedIn`) takes it while the effect runs and
    as it releases, and records the death before the scope releases, so that from it on no message applies. Its root
    (`rootedIn` in `shell.ts`), its last step, takes an end of interruptions only, one that reached the fiber once its
    scope had closed; a cause with a defect is none, so the root leaves a death the scope recorded as it is. Nothing
    interrupts such a fiber unmarked before the run stops it: the engine forks it with `FiberSet.run` or
    `FiberMap.run`, as no child of its forker, and the sets close only after the end has stopped their fibers. The
    fiber of whoever runs the program has no root, since only functions of the program run there, and the guide leaves
    that to the program; nor has the fiber of effects, where none runs.
  - Each fiber of the run records what it dies of in one register (`makeDeaths` in `shell.ts`: the run's, made by
    `start` or `drive` and given through `startWith`; `rehearse`'s, through `partsOf`; one per simulation), in a cleanup
    nothing interrupts (`Effect.onExit`), and a fiber with a scope as it dies, before its scope releases (`scopedIn`,
    with what a subscription's channel adds to it, `runSubscription`): so the defects are in the order they happened,
    and what a release dies of is wrapped apart. What a function of the program throws outside a fiber of the run (in
    the thunk, in the handle, where `rehearse` compares a key) is recorded at once, in the same register.
  - `'render'` is the site of what a renderer meets: `makeModel` wherever the model is read, a listener, and what a
    renderer gives `die`. A defect of `makeModel` is recorded where the model is read, once for each state, and a
    listener's site and `die` take that very defect as it is, as they take the defect of an `init` that threw. Once the
    run has ended, `die` throws back a defect the register lacks, checked after it records.
  - `scopedIn` closes the scope itself and takes each defect of each release as it is: never join them with
    `Cause.combine`, which keeps one of two defects equal by `Equal`. What `scopedIn` ends with once the scope has
    closed (`Core.released`) is read only by the register and by a tool's `run`, so that join has no mutation.
  - The order of the defects is the engine's to keep, and no promise: the guide leaves it unspecified, with two cases
    that each rest on half of a premise read only in Effect's source (`premises.md`). No promise rests on what a
    function of Effect makes of a cause.
  - Each defect is reported once, in that order: by the run as soon as one dies, and by the end. The end stops applying
    (`stopped`, its one check, read in `apply` before each message), stops the fiber of effects first and waits for it
    (`stop`), so that nothing forks while it reads the sets, interrupts the other fibers, waits for their releases, and
    dies with the defects first, then what else it ended with (`endedWith` in `core.ts`, which the tools end with too).
    The stop of the fiber of effects has no mutation: the end interrupts every fiber at once after it, so only the
    scheduler of the tests reaches what it keeps. The end never begins inside a step: the outermost `apply` holds the
    register (`hold` of `Deaths`), and a defect recorded meanwhile completes `died` only as it returns (`release`). It
    may begin on the stack of the dispatch, once it has applied.
  - From the first defect on, the run applies no message: it calls no `update`, checked in the thunk (`arrive` in
    `core.ts`, called by `applyOne`), the only check. A defect in the thunk stops the step there: one of `update`
    changes nothing, and one of `onApplied` or of `subscriptions` leaves the state and its keys as they were, tells no
    listener and offers no job, so that a state is current only once its keys are; one of a listener is in `'render'`,
    the others still told. A step whose `update` ran before goes on whole, its job included, until the end stops the
    fiber of effects. Never add a check in the middle of a job: it would leave a state whose commands never started,
    which `onApplied` heard of ([`single-owner.md`](records/single-owner.md)).
  - What an effect of the program does once started is its own until the end interrupts it, and so is what a renderer
    reads: `model()` checks no register.
  - Never report a defect only through a `join` or a fiber that races: once nothing awaits it, it is lost, and
    `FiberSet` and `FiberMap` discard the exits of the fibers they interrupt as they close.
  - A program started is run once: the run's first operation reads and sets `begun` in one thunk (`startWith` in
    `run.ts`), and a second `run` dies with a plain `Error`, while the first goes on. A program whose `run` was
    interrupted before that operation, or never forked, is never stopped: its state can still change, and no effect
    follows.
  - `drive` starts the program by plain code (`startWith`), subscribes before its first read, forks its run, stops and
    awaits it however it ends, and begins its scenario once the run has started the effects of the first state
    (`began`), unless the program has died. It reads each model in its listener (`readEach`), so a defect of `makeModel`
    is the run's, and the scenario races only the end of the run. A call of `rehearse` that waits for a subscription or
    a command races its wait with the death of any fiber (`orDead` in `testing/stage.ts`).

## What the engine keeps for itself

- **A child's model is kept by its state object, and its lifted keys by its instance** (`modelsOf` and `lifted` in
  `compose.ts`), for as long as that object lives: they rely on `makeModel` and `subscriptions` being pure and on states
  never mutated, and hold nothing of the run nor of a place, so runs and children that share a state share them. The
  instance is at one place, and replaced with the child's state, so its keys carry its place and its number with no
  check. A lifted key holds no subscription. Never add a cache for primitive states, which nothing could let go of.
- **A state that changes no key costs a lookup for each key** (`reconcile` in `core.ts`): where no key appeared and
  every active key was found, none went either, and the active ones are left the very same. Whether a key is active is
  asked once, for that shortcut and for the starts, so that no check stands in front of another. A key that stays is
  kept as the listing that started it gave it.
- **A child's dispatch is the same while anyone holds it** (`forwardTo` in `dispatch.ts`): kept weakly by its parent's
  dispatch, its name and its id (by `Equal`), and removed by a `FinalizationRegistry` once collected. Never hold them
  strongly: ids that are never reused would pile up for as long as the run lasts.
- **A run that goes on keeps nothing of the steps it has done**, but what waits: the state and the model read last are
  replaced (`current` in `engine.ts`, `last` in `run.ts`); a message leaves `pending`, and a job `waiting` and then the
  queue; a command's or a subscription's fiber leaves its `FiberSet` or `FiberMap` as it ends, and Effect keeps nothing
  of it nor of what its scope released (`premises.md`); a listener stopped leaves `listeners`; a child's model and
  dispatch are kept weakly. What lets go is an assignment that replaces, not a check, so only the removal of a listener
  has a mutation: the two tests of memory of `run.test.ts`, by collection and by the growth of the heap, were seen to
  fail under a retention written by hand of each of the others, on 21 and 23 November 2026.
- **`Host` starts one run under StrictMode** (`bridges/react.ts`): it starts its run in a microtask after its effect,
  which its cleanup cancels, so that the commands of `init` start once
  ([`store-and-effects.md`](records/store-and-effects.md), "Decided", 4). The guide leaves it unspecified, since it
  rests on a premise of React.
- **No span lives as long as the run**: the `run` and the engine's `effects` are untraced, and the run's fibers see the
  span of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every log as an event of the
  current span until it ends.

## How a check is built, and how the testing tools follow

- **A check of what another fiber may change, and the act it guards, are one thunk.** Where the engine or a tool
  decides from what another fiber may change (the register of deaths, the keys of a state, the end, `pending`), the
  check and its act (a call of the program, the start of a fiber) are one synchronous thunk: the scheduler may yield at
  any other operation. In the engine, the thunk that applies a message is one by construction, and the fiber of effects
  decides nothing from what the thunk writes after it offered the job. The check is a transition of the core
  (`core.ts`, `testing/ledger.ts`), tested on its own, or held by a gate (program code held by a `Deferred`) where
  program code lies between the check and what the test watches. No test of a check runs under the scheduler of the
  tests: a check whose mutation no deterministic test kills is moved until one does, or goes. Three rules keep a check
  where such a test reaches it ([`single-owner.md`](records/single-owner.md)):
  - **A function of the program is called where the call is decided**, never as the first step of a fiber forked for
    it, unless the fork runs it at once on its own stack (`FiberSet.run`, as documented).
  - **One check for each call.** No earlier check of the same register stands in front of it in another thunk, where it
    would answer in its place in every deterministic order. The end's `stopped` is read once, before each message, in
    the loop of `apply`.
  - **A fiber and how it stops are one primitive**: `Effect.acquireRelease(fork, stop)`; `Effect.acquireUseRelease`
    where a call waits for the fiber (a command's in `rehearse`'s `run`); the fork and what keeps it for the stop in one
    region nothing interrupts, where the stop is the end's (the fiber of effects; `rehearse`'s scope and the effects
    started in it; `drive`'s run); or `FiberSet.run` and `FiberMap.run`, which fork and add in one step.

  Every fiber the engine and the tools fork, each side of a race included, is interruptible, though forked where
  nothing interrupts: Effect's forks and races make it so, as documented. What cannot be one thunk with its check, as
  the first step of an effect of the program, is no act the guide promises about.

  A thunk writes first and offers or completes last. In the engine, the jobs are offered and `died` completed in one
  place, the `finally` of the outermost `apply`, once every step of the call is written and every listener told, and
  `drive` wakes its waits there too (`settled`), so no fiber is woken inside a step. Each has a mutation, whose killers
  rest on a fiber resumed on the stack of whoever completes its `Deferred`, a premise of the tests alone. A wait of
  `drive` reads each model in order, from a place of its own among the models `drive` read (`place` in `drive.ts`),
  never only the latest; the models are kept from the oldest place a wait holds, and a wait lets go of its place however
  it ends. Each thunk of `rehearse` writes the ledger before it completes a `Deferred`, gives a fiber its effect or asks
  a start for a message: that order has no mutation, since no deterministic test reaches it. That the effects of a step
  start only once its call has returned rests on the queue resuming the fiber of effects in a task, which the guide
  leaves unspecified. The release of the snabbdom bridge's subscription to the handle has no killer: its stop sets
  `stopped` first.

  A region nothing may interrupt holds no code of the program, so no gate reaches it, and it has no mutation. It is one
  of three forms: a transition of the ledger made in the thunk that checks the end (`submit` in `testing/stage.ts`),
  which asks the engine for a job that only tells (`afterJobs`), held by the test of the transition; a fiber and how it
  stops, above, held by Effect's documentation; and what follows an effect of the program outside `restore` (a
  command's answer, applied in its thunk). The checks beside them have mutations with deterministic killers, and the
  tests of `rehearse.test.ts` under the scheduler of the tests are alarms of the search, killing none.
- **What the engine gives a testing tool, the run takes by its defaults** ([`one-engine.md`](records/one-engine.md),
  "What the engine gets").
  - The config of `Engine.build` has five. `settled` is called last as the outermost `apply` returns. `listening` and
    `answering` say what the fiber of a start and of a command run: the job calls each where it forks the fiber, and the
    fiber runs what it returns in its root, through `startFiber` and `commandFiber` of `shell.ts` (a subscription or a
    command in a scope of its own, dying in its site, its last message or answer sent after that scope); the config
    takes them or `runCommand` and `listen`, never both. `stepped` is told in the thunk what each message came to and
    the keys of each new state once they are the active ones. `released` is told once the stops of a job have ended,
    before its starts.
  - The engine gives five more: `after`, a job that only tells, done once every job before it is; `send`, which applies
    a message as its source sends it; `active`, the keys of the current state; and `end` and `ended`, which mark and
    read the end by plain code.
  - The run gives none of them: `drive` gives `settled`, `rehearse` all but `settled`, and `simulate` `stepped`,
    `listening` and `answering`. They add no premise, and each has a test in `engine.test.ts` and a mutation.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler ("Testing
  tools" in the guide). `rehearse` and `simulate` run on the engine itself (`Engine.build`), with the register of the
  run, so the thunk, the jobs, the fibers, their roots and records, and the end are the engine's, held by its tests and
  mutations. `drive` acts only as a user can, through `run` and the run's dispatch. When the engine or one tool changes,
  keep the others in step: `src/testing/contract.test.ts` gives the same program and inputs to each, and a difference
  found is a `test.failing` there and an item of `ROADMAP.md` until it is fixed.
  - `rehearse` runs through the handle the run makes (`partsOf` in `run.ts`), and decides only what the test decides:
    when a command runs, and when a subscription's message is heard. A call that applies a message gives it to the
    engine's `send` in a thunk of its own, reads what it came to (`stepped`), and waits for a job that only tells
    (`after`), so each call is whole for the test.
  - A command's fiber (`answering`) is pending once its step's stops are released, and waits for a `run` to give it the
    effect `runCommand` returned in the `run`'s thunk, run in `commandFiber` with the services of that call. A start's
    fiber (`listening`) waits for the first `hearNext`. Its messages are applied by the thunk that finds a call waiting
    for them, never as they come ([`rejected.md`](rejected.md), "`rehearse`, owning what the test starts, in other
    forms").
  - What a start, a command and a call are to the test is the ledger's (`ledger.ts`): a start is starting until its job
    begins its fiber, though its key goes away first, and the calls that waited on a start whose key went are told once
    the engine has released it (`released`).
  - The end of a rehearsal reads the commands under way in the thunk that marks the engine's end (`end`), after which
    `rehearse`'s thunks refuse what is asked (`submit`): a command that answers, or a subscription that sends, once the
    end is marked is refused with no defect, as the run applies nothing once stopped. A scenario that returned lets the
    engine finish what it was offered, a held release included: never interrupt that job to end sooner. One that
    failed, or was interrupted, has the end stop the fiber of effects at once, then interrupt the calls that wait for a
    job it will not do, before the engine's end waits for the releases, which may wait for what such a call holds. The
    rehearsal then tells every `hearNext` not ended (`calls` in `ledger.ts`), never only what the ledger still says of
    a start. A `run` interrupted before its command's fiber began waits for it, and the end interrupts that wait once
    it has stopped the fibers: no deterministic test reaches it, so it has no mutation. Never make what an end stops, or
    tells, depend on what a job it may interrupt writes after its thunk.
  - `simulate` shares with `rehearse` `testing/stage.ts` (a command's fiber that waits for a `run`, the ledger of the
    commands, a message applied and what its call waits for, `runFirst`, the end). It has no handle and no model, and a
    start whose fiber ends at once. It runs the commands oldest first until none is pending, applies each message of the
    test as a dispatch, and runs them again; it ends as a rehearsal ends, but fails on no command left.
- **Windows of absence.** A test that checks that something does not happen awaits a witness where a correct run gives
  one: a command of a later state, a dispatch that has returned. Where none can, since what would signal the absence is
  what does not happen, the test sleeps once a signal it awaits has come, under a `TestClock` where it can be, and says
  so where it sleeps, in a comment that begins "A window of absence": a search for the words lists them. So a loaded
  machine can only let a mutant survive, and the runner of the mutations runs a killer that passed under its mutation
  again, alone, before it reports a survivor. The scheduler of the tests could await quiescence instead, and does not
  ([`rejected.md`](rejected.md), "The checks").
