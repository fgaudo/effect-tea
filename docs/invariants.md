# Invariants the engine keeps

The guide's "Guarantees" says what a user may rely on. This page says how the engine keeps it, and what a change must
not undo. The tests of each check are those its mutation names in `tools/mutations/mutations.ts`, which the runner
checks (`bun run guarantees` prints them by item of "What you can rely on"); a check with no mutation says here why.
What the invariants rest on of Effect and of the JavaScript engine is in [`premises.md`](premises.md), and how a
change is made in [`change-engine`](../.agents/skills/change-engine/SKILL.md). Why a dispatch applies its message at
once is [`synchronous-dispatch.md`](records/synchronous-dispatch.md).

The page has four parts: what a program may rely on, what a step promises those who enter it, what the engine keeps
for itself, and how a check is built, in the engine and in the testing tools.

## What a program may rely on

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends each
  one twice): never assume it runs once per message.
- **Messages are applied one at a time, in the order they were sent, each in the call that sends it.** One synchronous
  thunk applies each (`applyOne` in `engine.ts`): the check of a death and of the message's start, `update`, the option
  that hears it, the new state and its keys. A message sent during it waits in `pending` until it is done (`apply`).
  The thunk calls code that is not the engine's, which may call the engine back: what makes the step whole is that
  `applying` keeps every other writer of `current` and of `active` out ("A step, and who may enter it").
  - The subscriptions a step stops and starts, and the commands it starts, are a job. The jobs of a call are offered
    once the outermost `apply` returns, to one fiber of effects, which takes them from an unbounded queue one at a
    time, in the order of the states (`perform`). A step that stops, starts and commands nothing makes no job
    (`queue`). A message sent before the effects start is applied all the same, and its job waits for them (`effects`).
    The engine's fiber of effects applies no message of its own, and starts a step's commands only in its job. A
    message is still applied on its stack by a fiber that a job starts or resumes there, as a subscription that sends
    as it starts, and by a job that only tells (`after`), which a tool gives: `rehearse` applies there the messages
    held for a `hearNext` (`openFor`). Such a message is applied whole, and its job offered after the one under way.
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
    before the step in `update` and `external`, as the child's step and the handlers of its earlier events left them in
    a handler of `onEvent`, of the state given in `makeModel`, `output` and `subscriptions`.
  - What a parent tells is data of its step, `tell`, given to the children once the step's state is reconciled, in
    order, each to its end (`ownStep`). An item bound to an instance that an earlier item dropped or started again is
    told nothing.
  - What the `tell` of a declaration gives is told to a child as it starts, and again where it is another, by `Equal`,
    than the last the child was told (`sync`), once the step is reconciled and what it lists is bound, and before that
    is told. No field of the state keeps what a child was told: between two calls every child was last told what the own
    state gives, for a state that the program made, and for one of `stateOf`, which tells each child once it is in the
    state given for it (`placer`); within a call `told` keeps it, by the instance's number, with the own state and the
    count of starts as the call began. So a name whose value is the one of the own state before the step, and that
    started no child, is skipped for two calls of `tell`: a child that an enclosing step of the call has not reached yet
    is told at its turn, and one that it has reached was told by the step whose change it followed. A handler that
    raises an event of the parent's own in a start, `init` or `stateOf`, where no step takes events, is a
    `CompositionDefect`.
  - The types enforce what a parent declares: `runCommand` exactly when it has commands of its own, `onEvent` exactly
    when a child has events, `external` exactly when it names external messages, a `tell`, of a step or of a
    declaration, only with what the child's `external` takes, own subscriptions and commands that send only the
    parent's own messages (`RunCommandOf`), and no own message or command named like a child. A program written
    without `Program<…>` has `unknown` types, read as `never` (`Items` in `program.ts`), so that it opens none of
    these checks.
- **The children are those the parent's own state lists, and an answer reaches the instance that asked for it, or is
  rejected.** After each step of the parent's own code (`init`, `update`, `external`, a handler of `onEvent`), the
  library starts each child the own state lists anew, with its first commands, drops each it no longer lists, and
  starts again one whose flags or key differ by `Equal` (`reconcile` in `compose.ts`), and gives the names that started
  a child to `sync`. A first step runs a child's `external`, and the parent's `onEvent`, only through what a
  declaration tells. So the state stays the fold of `update` over the messages, and the engine and the tools know
  nothing of children.
  - Each start has a number, counted in the state (`starts`), which the child's lifted commands, answers and keys
    carry. A message whose number is not that of the child there is rejected, so a child closed and opened again, or
    started again in one step, never gets the answer of the one before. A message of a view carries the number that
    its dispatch was given (`forwardTo`), which `makeModel` reads from the instance (`children.X.instance`), and is
    rejected by that same check; one that carries none names the place alone.
  - Children by id whose `ids` gives the very same object for the own states before and after are not reconciled:
    `ids` is pure. An id listed twice is a `CompositionDefect`.
- **What a screen shows of a controlled element is the bridges', and the library keeps no rule of an element.** The
  guide promises it in "What an element gives" and "Writing a bridge", and `bridges/bridge.test_suite.ts` checks it in
  a DOM. A message that an element fills carries the value the element holds, and names no value it replaces, so a
  key typed on a view older than the state would send that view's text over the state: so a bridge draws each new
  state before the browser handles the next event.
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
- **A dispatch is a function, and needs no services**: it applies its message on its caller's stack, and records what
  the program throws there (`attempt` and `recordThrown` in `engine.ts`, `record` of `Deaths` in `shell.ts`), never
  throwing it to the caller, whose fiber would take it for its own. No fiber is made for a message nor for a defect, so
  a renderer calls it from a plain callback, and effect code wraps it in `Effect.sync`.
  - The queue of the jobs is unbounded, offered with `Queue.offerAllUnsafe`, which never waits: a bounded one would
    refuse a job, and lose the effects of its step.
  - A dispatch sent once the end has stopped the engine applies nothing, and throws nothing.
  - What the loop of `apply` meets thrown outside the program's functions, by the engine or by what `recordThrown` reads
    of a message, its `catch` records as it is, after the defect it was saying, and the run dies of it. Its `finally`
    resets `applying` and does what the call owes; the `catch` throws nothing, so what is in the `finally` rather than
    after the `try` has no mutation, only what it does.
- **A subscription never ends in silence**: its end value is a message (or `never`). An ended subscription keeps its
  key among the active ones until the key goes away and comes back: never restart it automatically, which would loop
  on one that ends at once. What the end of a stream means is the caller's decision, and the type asks for it
  (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key runs on, a gone key interrupts.
  - The keys are reconciled in the thunk that makes the state (`Core.reconcile` in `applyOne`), so the engine's keys
    are the current state's, while the fibers that run are those the fiber of effects has reached: the two diverge by
    design. The gone keys of a job are interrupted together, and awaited before any start of that job or a later one
    (`perform`). That they are interrupted together is no promise, and the engine's to keep: the stops of a job cost
    its longest release, not the sum of them. `reconcile` counts the starts of the active keys it finds, not the keys
    listed, so a key listed twice starts once and hides no key that went away.
  - A subscription is made from its key alone, by `listen`, which the fiber of its start calls: a defect of `listen` is
    the subscription's, with its key. A parent lifts its children's keys under their names, and its `listen` lifts a
    child's subscription once for each start.
  - Each start has a generation that its messages carry: a message whose key is gone, or came back with a new start, is
    dropped before `update`, though the fiber of effects has not stopped or started it yet. Such a start is still
    started, and dropped by its start: never skip it in the fiber of effects, which would check from another fiber what
    the thunk changes. `rehearse` never gives the engine such a message: `hear` fails on a key gone from the current
    state, and its ledger forgets a start in the transition that stops it.
  - Keys and their `Equal` and `Hash` are the program's: the run compares the keys only as it makes a state
    (`Core.reconcile`), and from there on knows a start by its generation, in every register of a start: the messages
    it sends, the fiber the engine keeps for it, and `rehearse`'s ledger. A `FiberMap` keyed by the keys would call the
    program's `Equal` and `Hash` again at each `get` and `run`, for what the generation says already
    ([`rejected.md`](rejected.md), "The fibers of the subscriptions kept by their key"). Nothing of the engine is built
    for an `Equal` or a `Hash` that throws, which the guide leaves undefined, and no premise is held for one
    (`premises.md`, "The rule").
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
- **`onApplied` and `onIgnored` are given no dispatch, and return nothing**: functions of whoever runs the program,
  called in the thunk as `update` is (`attempt` in `applyOne`), whose types refuse a value, an effect or a promise
  among them. They hear each accepted, or rejected, message in order, with where it came from, before the new state is
  current. They return nothing, so nothing holds a step: a release holds the fiber of effects alone, as `gate` in
  `test/gate.test_helper.ts` does in a test. They are no functions of the program, and nothing keeps one pure: what it
  does as it hears, as the guide's offers a step to a queue and a test's completes a `Deferred`, it does as a callback
  of a step ("A step, and who may enter it"). A defect in one stops the step, and one of `onApplied` leaves the state
  as it was. Neither hears a message dropped before `update`: that is the engine's.
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
  - The run stops each fiber of the program with a mark of its own, made anew for each stop, which names the fiber it
    stops and the fiber that stops it (`stopping` in `shell.ts`, `Stopped` in `core.ts`). `diesIn` takes an
    interruption for the run's stop of its fiber only with a mark that names that fiber, and the id of the reason as
    its stopper, read from the cause alone, with no question to Effect of what the fiber received (`dying`). An id
    alone the program can make too (`FiberMap`, `FiberSet` and `FiberHandle` interrupt as the fiber -1, and
    `Cause.interruptors` gives a fiber the id of its interrupter), and a mark that the program finds says whose stop
    it was: on a reason that reaches another fiber, which joined that one or was interrupted with its annotations, or
    on one that the stopped fiber makes as another fiber, it is the program's. Never stop a fiber of the program
    otherwise. `rehearse` and `simulate` stop the command of an interrupted `run` themselves (`runFirst` in
    `testing/stage.ts`).
  - Only the run interrupts a fiber the run forks. Such a fiber takes an interruption that is not the run's stop of it
    (`Core.otherwiseDefect`) for one the program made, in two places. Its scope (`scopedIn`) takes it while the effect
    runs and as it releases, and records the death before the scope releases, so that from it on no message applies.
    Its root (`rootedIn` in `shell.ts`), its last step, takes an end of interruptions only, one that reached the fiber
    once its scope had closed; a cause with a defect is none, so the root leaves a death the scope recorded as it is.
    Nothing interrupts such a fiber unmarked before the run stops it: the engine forks it with `FiberSet.run` or
    `FiberMap.run`, as no child of its forker, and the sets close only after the end has stopped their fibers. The
    fiber of whoever runs the program has no root, since only what a thunk calls runs there, and the guide leaves that
    to the program; nor has the fiber of effects, where none runs.
  - Each fiber of the run records what it dies of in one register (`makeDeaths` in `shell.ts`: the run's, made by
    `start` or `drive` and given through `startWith`; `rehearse`'s, through `partsOf`; one per simulation), in a cleanup
    nothing interrupts (`Effect.onExit`), and a fiber with a scope as it dies, before its scope releases (`scopedIn`,
    with what a subscription's channel adds to it, `runSubscription`): so the defects are in the order they happened,
    and what a release dies of is wrapped apart. What a function of the program throws outside a fiber of the run (in
    the thunk, in the handle) is recorded at once, in the same register.
  - `'render'` is the site of what a renderer meets: `makeModel` wherever the model is read, a listener, and what a
    renderer gives `die`. A defect of `makeModel` is recorded where the model is read, once for each state, and a
    listener's site and `die` take that very defect as it is, as they take the defect of an `init` that threw. Once the
    run has ended, `die` throws back a defect the register lacks, checked after it records.
  - `scopedIn` closes the scope itself and takes each defect of each release as it is: never join them with
    `Cause.combine`, which keeps one of two defects equal by `Equal`. What `scopedIn` ends with once the scope has
    closed (`Core.released`) is read only by the register and by a tool's `run`, so that join has no mutation.
  - The order of the defects is the engine's to keep, and no promise: the guide leaves it unspecified, with what else
    rests on a premise that Effect may change (`premises.md`, "The rule"): a self-interruption as the run stops the
    fiber, and which defects of several releases of one command or one subscription are in the cause. No promise rests
    on such a premise.
  - The register is read once, as the run ends: its effects end once a defect is recorded (`died`), or as whoever runs
    it interrupts it, and the run then reads the register, and ends with the defects first, in that order, then what
    else it ended with (`endedWith` in `core.ts`, which the tools end with too). Where `init` threw there is no engine,
    and the run reads it at once. The end of the engine reports nothing, since the register holds it all: it stops
    applying (`stopped`, its one check, read in `apply` before each message), stops the fiber of effects first and waits
    for it (`stop`), so that nothing forks while it reads the sets, interrupts the other fibers and waits for their
    releases, which record what they die of as they end. The stop of the fiber of effects has no mutation: the end
    interrupts every fiber at once after it, so only the scheduler of the tests reaches what it keeps. The end never
    begins inside a step: what waits on a death waits on the engine's `died`, which resumes it, for a defect recorded
    during a step, only as the outermost call returns, and an end that comes during a step, as whoever runs the program
    stops it on the stack of a listener that completed what it waits for, is marked as that call returns (`end`, `owe`),
    in the run, in its finalizer and in `Stage.play`. It may begin on the stack of the dispatch, once it has applied.
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
  - A program started is run once: the run's first operation is a region nothing interrupts, whose thunk reads and sets
    `begun` (`startWith` in `run.ts`), and a second `run` dies with a plain `Error`, while the first goes on. A program
    whose `run` was interrupted before that operation, or never forked, is never stopped: its state can still change,
    and no effect follows. One that has set `begun` is stopped by that region as the effects end, by `engine.end()`,
    which waits for a step under way, before the read: the scope's own stop is added after steps that can be
    interrupted, at a yield of the scheduler, and a scope interrupted before it closes without it.
  - `drive` starts the program by plain code (`startWith`), subscribes before its first read, forks its run, stops and
    awaits it however it ends, and begins its scenario once the run has started the effects of the first state
    (`began`), unless the program has died. It reads each model in its listener (`readEach`), so a defect of `makeModel`
    is the run's, and the scenario races only the end of the run. A call of `rehearse` races with a death only its waits
    before it has applied anything ("The testing tools behave like the engine").

## A step, and who may enter it

A step is what one message comes to: the check of a death and of the message's start, `update`, the option that hears
it, the new state with its keys, and the notice of each listener (`applyOne` in `engine.ts`). The outermost call of
`apply` does the step of its message, then that of each message sent meanwhile, and does in its `finally` what they
owe: the offer of the jobs, the wake of a death, the mark of an end, the wakes of a tool (`owe`).

A step calls code that is not the engine's: `update` and `subscriptions`, the options, a tool's `stepped`, and the
listeners. That code may call the engine back, and may wake a fiber that does, on the same stack, since a fiber that
waits on a `Deferred` runs where it is completed (`premises.md`). So a step is not whole because nothing else runs
inside it. It is whole because `applying` keeps every other writer of `current` and of `active` out, and because the
engine wakes nobody before the outermost call returns. Every entry of the engine keeps one property, but `effects`,
which `run` begins once: a run begun inside a step is a form that no page shows.

**An entry made during a step has the effect of the same entry made right after the outermost call returns.**

- A message (`dispatch`, `send`, an answer, a subscription's message) waits in `pending` behind the step, and is
  applied before the call returns, in the order sent.
- The end (`end`, and so `stop`, the engine's finalizer, the run's own end and that of `Stage.play`) is marked as the
  outermost call returns.
- A job that only tells (`after`) is offered with the jobs of the call.
- What an entry owes (`owe`) is done in the `finally` alone, once `applying` is reset, and at once outside a step:
  the offer of the jobs first, then, in the order owed, the wake of what waits on `died`, the mark of an end, and the
  waits of `drive`. A thunk owed there that applies a message makes an outermost call of its own, before the next thunk.

Three entries act at once instead:

- A read (`current`, `active`, `model()`) gives the state that is current then: the one of before the step in an
  option, and the new one in a notice.
- A listener stopped is told no more, of the notice under way either, and one added is told from the next (`tell`).
- A defect recorded (a throw of the code that a step calls, `die`, a fiber that dies there) is in the register at once:
  no message applies from it on, those that wait in `pending` included (`arrive`). What waits on the engine's `died`
  wakes as the call returns: a fiber that the register's own `died` resumes inside the step only owes its resumption
  (`outside`).

A tool that plays a program owes the same of its own entries: a call of a scenario made during a step does what it
does right after the outermost call. `rehearse` and `simulate` give a scenario no way into a step. `drive` does,
through the options it takes: a call of its driver made during a step waits for the outermost call to return, as an
end does (`outside` in `drive.ts`, over `owe`), and then acts.

### Who may act, and when

Four actors enter the engine, each at six moments:

- **Between two tasks**: nothing of the engine is on the stack, and no step is under way.
- **At a yield of the scheduler**: between two operations of a fiber of the run or of a tool, where Effect's scheduler
  may run another fiber, or a task.
- **In a job**: on the stack of the fiber of effects as it does a job (`perform`), where it starts a subscription or a
  command, and where a tool is told (`released`, the `done` of a job that only tells). A message sent there is the
  outermost call of its own, and its job is offered after the one under way.
- **In a callback of a step**: on the stack of an option, of a notice, or of a fiber that one of them wakes.
- **In a wake of the `finally`**: on the stack of what the outermost call owes as it returns, its steps done (`owe`):
  what waits on `died` or on an end, and the waits of `drive`. A message sent there is the outermost call of its own.
- **During the end**: from the mark of the end (`stopped`) until the run, or the tool, has ended.

Each cell names what reaches it: the search (`src/interleaving.test.ts`), the sweep (`src/testing/contract.test.ts`,
"the run and each tool, interrupted by whoever runs it at any yield of the scheduler"), or a test file, whose tests the
list below names. "None yet" is a cell that a page shows and no test reaches: it is owed a generator of the search, or
a row of `contract.test.ts` (`ROADMAP.md`). "Unspecified" is a cell that no page shows ("Deciding" in
[`AGENTS.md`](../AGENTS.md)), and "no entry" one where the actor cannot call the engine.

|                                | Between two tasks              | At a yield                                      | In a job                            | In a callback of a step       | In a wake of the `finally`                         | During the end                                |
| ------------------------------ | ------------------------------ | ----------------------------------------------- | ----------------------------------- | ----------------------------- | -------------------------------------------------- | --------------------------------------------- |
| The program's effects          | the search                     | the search                                      | `contract.test.ts`                  | unspecified: no page shows it | `start.test.ts`, `contract.test.ts`                | the search, `run.test.ts`, `contract.test.ts` |
| The renderer                   | the search, the bridges' suite | the search                                      | no entry                            | the search, `engine.test.ts`  | no entry                                           | the search, `engine.test.ts`, `run.test.ts`   |
| Whoever runs the program       | the search, `start.test.ts`    | the sweep as the run begins, the search past it | `engine.test.ts`                    | the search, `start.test.ts`   | `engine.test.ts`, `start.test.ts`, `drive.test.ts` | `contract.test.ts`                            |
| The scenario of a testing tool | each tool's tests              | `rehearse.test.ts`, the sweep                   | `rehearse.test.ts`, `drive.test.ts` | `contract.test.ts`            | `drive.test.ts`, `rehearse.test.ts`                | `contract.test.ts`, `rehearse.test.ts`        |

- **The program's effects** are a command, a subscription and what they release: they send an answer, a message or an
  end value, die, interrupt themselves, and end.
  - Between two tasks and at a yield, the search draws each of them (`Fates`), under the scheduler of the tests in both
    its modes, which makes any fiber yield between two of its steps.
  - In a job, a subscription sends as it starts, and the job of its message comes after the one under way
    (`contract.test.ts`, "a message heard while the job of its own start is under way"). The subscriptions of the
    search wait a turn before they send.
  - In a callback of a step, an effect acts only where a listener or an option wakes it: no page shows one. A message
    that it would send there waits in `pending`, as any does.
  - In a wake of the `finally`, an end that a defect begins stops them on the stack of the dispatch (`start.test.ts`,
    "the end of a run"). A command that a service of the test's holds, freed by a scenario of `drive` that the return of
    the call woke, answers there, in an outermost call of its own, as one freed right after the call does
    (`contract.test.ts`, "the program's effects, in a wake of the finally, under drive").
  - During the end, one sends, dies or interrupts itself as it is stopped, or waits for the release of another
    (`run.test.ts`; `contract.test.ts`, "an end where the release of a fiber waits for the release of another"; the
    search, "once the run has ended, the subscriptions and the commands have released all").
- **The renderer** is a listener of the `App`, a handler of a view and a draw: it reads the model, sends, stops or adds
  a listener, throws, and gives `die` what a draw threw.
  - Between two tasks and at a yield, the user of the search acts on a model read before, from before the run begins
    until after it has ended, each act at the turn that the scheduler gives it; the bridges' suite
    (`bridges/bridge.test_suite.ts`) does so in a DOM.
  - In a job it has no entry: a notice of a message sent there is a callback of its step.
  - In a callback of a step, the listener of the search reads the model, sends and throws. One that stops, or adds
    another, in a notice is in `engine.test.ts` ("a listener stopped during a notice is not told of it, and one added
    during a notice is told from the next").
  - In a wake of the `finally` it has no entry: the engine tells no listener there.
  - During the end, and after it, a dispatch applies nothing, a model read is still made, and `die` throws back what
    the cause lacks (`engine.test.ts`, "the end of the engine"; `run.test.ts`, "die").
- **Whoever runs the program** starts it, forks `run` and interrupts it, and gives the options, which hear each step.
  - Between two tasks, the search interrupts the run when the program is quiet, a second time where it stopped the run
    before, and `start.test.ts` runs a program twice, late, or never.
  - At a yield, the sweep interrupts the run at each yield of its beginning, of a program that holds a command and a
    subscription from its first state. Past the beginning, the search stops the run before an act, once it has started
    an effect, while the user goes on acting, jobs are under way and releases are awaited (`Stop` in
    `src/interleaving.test.ts`).
  - In a job, the end begins where a command or a subscription that the job starts makes whoever runs the program stop
    it (`engine.test.ts`, "a command whose runCommand begins the end of the engine as it is called is interrupted by
    that end", and the same of a subscription).
  - In a callback of a step, the options hear and throw in the search. Whoever runs the program stops it there through
    a fiber that awaits a `Deferred` that a notice, or `onApplied`, completes, as the tests of the examples `list` and
    `pages` race the run (`start.test.ts`, "the end of a run"), and the search draws such a stop, with a message that
    the listener sends after it in the step: under `'inline'` alone, the stop runs inside the step, since `'queued'`
    resumes a fiber woken or interrupted there in a task of its own. From `onIgnored`, and by plain code that interrupts
    the fiber in the callback itself, no page shows it: unspecified, and the search draws them at the price of the same
    generator, so a failure that only they meet is no finding.
  - In a wake of the `finally`, the run ends itself as `died` wakes it (`engine.test.ts`, "died wakes no fiber inside a
    step: a defect a listener throws completes it once every listener is told"; `start.test.ts`, "the end of a run"),
    and `drive`, which runs the run, interrupts it as its scenario returns from a wait that the return of the call woke
    (`drive.test.ts`, "drive's send, made by a wait that a step wakes").
  - During the end, a second interruption of the run, as a `stop` of "Running" called twice makes, ends with the first
    once the run has ended (`contract.test.ts`, "whoever runs the program, during the end of the run").
- **The scenario of a testing tool** is the calls of a `Driver` or of a `Rehearsal`, from one fiber of the test's or
  from several, and whoever runs the tool, who may interrupt it.
  - Between two tasks, each tool's tests and `contract.test.ts` make their calls one after another.
  - At a yield, `rehearse.test.ts` makes calls from several fibers, and interrupts a call, under the scheduler of the
    tests ("rehearse, as a call is interrupted between what it took and its job", "rehearse, as its end is marked while
    a command left under way answers"), and the sweep interrupts `drive`, `rehearse` and `simulate` as they begin.
  - In a job, a call of `rehearse` goes on as the job tells it (`rehearse.test.ts`, "rehearse's send, made by a
    hearNext that a job wakes"), and a scenario of `drive` as a subscription that starts completes what it waits for
    (`drive.test.ts`, "a wait that ends once a model shows a step does not wait for the step's commands, which start
    after it").
  - In a callback of a step, a scenario of `drive` acts where an option of the test's wakes it, as
    `examples/bounce/bounce.test.ts` awaits a `Deferred` that its `onApplied` completes: each call of its driver does
    what it does right after the outermost call (`contract.test.ts`, "the scenario of drive, in a callback of a step").
    `rehearse` and `simulate` take no option, and tell a scenario nothing in a step: no entry.
  - In a wake of the `finally`, the waits of `drive` go on as the return of the call wakes them (`drive.test.ts`,
    "drive's send, made by a wait that a step wakes"), and a `run` of `rehearse` that waits for its command fails as
    `died` wakes it (`rehearse.test.ts`, "a send whose message's model throws waits for its job, though an answer is
    applied on its stack").
  - During the end, a fiber of the test's calls once the tool has ended (`contract.test.ts`, "a fiber of the test's
    that sends once the tool has ended"), and a command answers as the end is marked (`rehearse.test.ts`, "rehearse, as
    its end is marked while a command left under way answers").

## What the engine keeps for itself

- **A child's model and its lifted keys are kept by its instance** (`models` and `lifted` in `compose.ts`), for as
  long as that object lives: they rely on `makeModel` and `subscriptions` being pure and on states never mutated. The
  instance is at one place, and replaced with the child's state, so its keys carry its place and its number with no
  check, and an instance kept with the very same state keeps the very same model, whatever value the state is. A lifted
  key holds no subscription.
- **A state that changes no key costs a lookup for each key** (`reconcile` in `core.ts`): where no key appeared and
  every active key was found, none went either, and the active ones are left the very same. Whether a key is active is
  asked once, for that shortcut and for the starts, so that no check stands in front of another. A key that stays is
  kept as the listing that started it gave it.
- **A child's dispatch is the same while anyone holds it** (`forwardTo` in `dispatch.ts`): kept weakly by its parent's
  dispatch, its name, its id (by `Equal`) and the instance it names, and removed by a `FinalizationRegistry` once
  collected. Never hold them strongly: ids that are never reused, and the instances of a child that starts again,
  would pile up for as long as the run lasts.
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
  current span until it ends. So do the commands and subscriptions of `rehearse`, with the span of the call that runs
  or starts them.

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

  A thunk writes first and offers or completes last. In the engine, what a step leaves to offer or to wake is owed, and
  done in one place, the `finally` of the outermost `apply`, once every step of the call is written and every listener
  told (`owe`): the jobs offered, what waits on `died`, the mark of an end, and the waits of `drive`. So the engine and
  the tools wake no fiber inside a step: one that a callback of the step wakes enters as "A step, and who may enter it"
  says. The check of `owe`, its loop in the `finally`, and each entry that owes have a mutation, whose killers rest on
  a fiber resumed on the stack of whoever completes its `Deferred`, a premise of the tests alone. `rehearse` and
  `simulate` race the engine's `died` too (`orDead` in `testing/stage.ts`), and that choice has no mutation: with the
  register's own, a call would fail on the step's stack, where nothing that a scenario may do shows it, since every
  call of a rehearsal checks the register first and a command is pending only once the fiber of effects has done its
  job, in a task of its own. A wait of
  `drive` reads each model in order, from a place of its own among the models `drive` read (`place` in `drive.ts`),
  never only the latest; the models are kept from the oldest place a wait holds, and a wait lets go of its place however
  it ends. Each thunk of `rehearse` writes the ledger before it completes a `Deferred`, gives a fiber its effect or asks
  a start for a message: that order has no mutation, since no deterministic test reaches it. The calls told that a
  start has ended are told once its end value is applied, so that none sends before it (`hearHeld`): that order has a
  mutation. That the effects of a step start only once its call has returned rests on the queue
  resuming the fiber of effects in a task, which the guide leaves unspecified. The release of the snabbdom bridge's
  subscription to the handle has no killer: its stop sets `stopped` first.
  A region nothing may interrupt holds no code of the program, but it is no exemption: whoever runs the program may
  interrupt its fiber at any yield of the scheduler, before the region or where `restore` makes it interruptible. One
  test sweeps that interruption over every yield of whoever runs the run, `drive`, `rehearse` and `simulate`, on
  Effect's own scheduler, given a program that holds a command and a subscription from its first state, and checks that
  each was never begun or is stopped, with no fiber left and nothing held as it ends (`contract.test.ts`, "the run and
  each tool, interrupted by whoever runs it at any yield of the scheduler"). It kills the mutation that takes out the
  region of `run` (`startWith` in `run.ts`), of `Stage.play` and of `drive`. Two have none: the transition of the ledger
  made in the thunk that checks the end (`submit` in `testing/stage.ts`), which asks the engine for a job that only
  tells (`afterJobs`), held by the test of the transition; and the region of the fork of the fiber of effects (the end
  of `effectsIn` in `engine.ts`), which only keeps that fiber for the end to stop first: without it, `FiberSet` and
  `FiberMap` still stop what that fiber forks late, and only the order of the releases at the end changes, which the
  guide leaves unspecified, as for the stop of the fiber of effects.
  The checks beside them have mutations with deterministic killers, and the tests of `rehearse.test.ts` under the
  scheduler of the tests are alarms of the search, killing none.
- **What the engine gives a testing tool, the run takes by its defaults** ([`one-engine.md`](records/one-engine.md),
  "What the engine gets").
  - The config of `Engine.build` has four. `listening` and
    `answering` say what the fiber of a start and of a command run: the job calls each where it forks the fiber, and the
    fiber runs what it returns in its root, through `startFiber` and `commandFiber` of `shell.ts` (a subscription or a
    command in a scope of its own, dying in its site, its last message or answer sent after that scope); the config
    takes them or `runCommand` and `listen`, never both. `stepped` is told in the thunk what each message came to and
    the keys of each new state once they are the active ones. `released` is told once the stops of a job have ended,
    before its starts.
  - The engine gives six more: `after`, a job that only tells, done once every job before it is; `owe`, what is done
    once no step is under way, where `drive` wakes its waits, which `startWith` gives it; `send`, which applies a
    message as its source sends it; `active`, the keys of the current state; and `end` and `ended`, which mark the end,
    once no step is under way, and read it by plain code.
  - The run gives none of them: `drive` gives none either, `rehearse` all, and `simulate` `stepped`, `listening` and
    `answering`. They add no premise, and each has a test in `engine.test.ts` and a mutation.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler ("Testing
  tools" in the guide), since a tool that plays a program runs it on the engine. `rehearse` and `simulate` run on the
  engine itself (`Engine.build`), with the register of the run, so the thunk, the jobs, the fibers, their roots and
  records, and the end are the engine's, held by its tests and mutations. `drive` acts only as a user can, through `run`
  and the run's dispatch. A tool decides at most when a command runs, when a subscription's message is heard, and what
  fails the test; it makes no step, no scope of a subscription or a command, and no site of a defect. A state it makes
  is one that a start makes, `stateOf` with the states given for the children in place of their first states: so what
  holds of the states that the program makes holds of it, and a test of that over random histories starts from both
  (`compose.test.ts`, "what a declaration tells its children, over random histories"). The lint holds its boundary with
  the engine: a module of `src/testing/`, its tests aside, takes of `core.ts` and `shell.ts` only the names of the
  allow-list in `.oxlintrc.json`, by name, and a name added there is read against this rule.
  `src/testing/contract.test.ts` gives the same program and messages to each tool and to the run, and a difference found
  is a `test.failing` there and an item of `ROADMAP.md` until it is fixed.
  - `rehearse` runs through the handle the run makes (`partsOf` in `run.ts`), and decides only what the test decides:
    when a command runs, and when a subscription's message is heard. A call that applies a message gives it to the
    engine's `send` in a thunk of its own, reads what it came to (`stepped`), and waits for a job that only tells
    (`after`), so each call is whole for the test. A call waits in one way, given by `testing/stage.ts`, and the lint
    keeps `rehearse.ts` and `simulate.ts` from awaiting a `Deferred` of their own, but where a start's fiber waits for
    an ask (`nextAsk`), which is no call's wait. Until its message is applied (a start, a subscription's message, a
    command, the job that opens a `hearNext`), it fails as soon as any fiber dies, as the run dies at once (`waiting`,
    `afterJobs`, `runFirst`). Once its message is applied, it waits for the job whole, though another fiber dies (what
    `apply` and `dispatch` give, and `runFirst` once the command has answered), as the run's dispatch returns: the job
    of a step applied before the first defect goes on whole, its commands owed and its starts opened, for as long as a
    release holds it.
    The fiber of effects dies of nothing: what it and the end tell a call is data, which the call makes its error of in
    its own fiber, and a tool names a value in its errors by one function (`failure` in `testing/failure.ts`), which
    throws nothing. What a value throws as it is named is a failure of the test, no defect: the tool's error comes
    first, with what was thrown as its `cause`.
  - A command's fiber (`answering`) is pending once its step's stops are released, and waits for a `run` to give it the
    effect `runCommand` returned in the `run`'s thunk, run in `commandFiber` with the services of that call. It is
    interruptible as the engine's is, by the engine's end, by an interrupted `run` and by the program alike: an
    interruption that lands before the thunk of its answer leaves the answer unapplied, and the root makes one without
    the run's mark a defect. An interrupted `run` cancels its command before it stops the fiber, and the scheduler may
    yield between the two: the thunk of the answer applies it only where the command is still under way, in the
    transition that settles it (`Ledger.settle`), so that the answer and the cancel exclude each other. The test of the
    transition holds it, and the search finds the order that reaches it (`rehearse.test.ts`, "never both"). A start's
    fiber (`listening`) waits for the first `hearNext`. Its messages are applied by the thunk that finds a call waiting
    for them, never as they come ([`rejected.md`](rejected.md), "`rehearse`, owning what the test starts, in other
    forms").
  - What a start, a command and a call are to the test is the ledger's (`ledger.ts`): a start is starting until its job
    begins its fiber, though its key goes away first, and the calls that waited on a start whose key went are told once
    the engine has released it (`released`).
  - The end of a rehearsal reads the commands under way in the thunk that marks the engine's end (`end`, given the read;
    an alarm of the search, `rehearse.test.ts`, "rehearse, as its end is marked while a command left under way
    answers"), after which `rehearse`'s thunks refuse what is asked (`submit`): a command that answers, or a
    subscription that sends, once the end is marked is refused with no defect, as the run applies nothing once stopped.
    A scenario that returned lets the engine finish what it was offered, a held release included: never interrupt that
    job to end sooner. One that failed, or was interrupted, has the end stop the fiber of effects at once, then
    interrupt the calls that wait for a job it will not do, before the engine's end waits for the releases, which may
    wait for what such a call holds. The rehearsal then tells every `hearNext` not ended (`calls` in `ledger.ts`), never
    only what the ledger still says of a start. A `run` interrupted before its command's fiber began waits for it, and
    the end interrupts that wait once it has stopped the fibers: no deterministic test reaches it, so it has no
    mutation. Never make what an end stops, or tells, depend on what a job it may interrupt writes after its thunk.
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
