# Invariants the engine keeps

The guide's "Guarantees" says what a user may rely on, and the library's tests check each one
(`src/interleaving.test.ts` checks each that its scenario reaches, the order of the messages, the rule of an input and
what the run does from the first defect on included, under random orders of clicks, writes into an input, typed into
its element or over an older value, into a place the state may no longer hold, messages sent from inside a step,
answers, subscription messages and ends, releases, defects and self-interruptions, as the guide says). This is how
they are kept, and what a change must not undo. What they rest on of Effect and of the JavaScript engine is in
[`premises.md`](premises.md), and how a change of the engine or of a testing tool is made in
[`change-engine`](../.agents/skills/change-engine/SKILL.md).

The entries are in three parts: what a program may rely on, with how the engine keeps it; what the engine keeps for
itself, so that the first part costs what it should; and how a check is built and tested, in the engine and in the
testing tools. Why a dispatch applies its message at once, and what was weighed for it, is
[`synchronous-dispatch.md`](records/synchronous-dispatch.md).

## What a program may rely on

- **`update` is pure and called freely.** Tests call it more than once per message (`dispatchViolations` sends
  each one twice): never assume it runs once per message.
- **Messages are applied one at a time, in the order they were sent, each in the call that sends it**: one synchronous
  thunk applies each (`applyOne` in `engine.ts`), the check of a death and of the message's start, `update`, the option
  that hears it, the new state and its keys, and a message sent during it, as a listener or an `update` sends one,
  waits in `pending` until it is done (`apply`). No other code runs between the operations of the thunk but what it
  calls, by ECMAScript's run to completion: so every check of the thunk and its act are one thunk by construction. Its
  subscriptions stopped and started and its commands started are a job, offered last, for one fiber of effects, which
  takes the jobs from an unbounded queue one at a time, in the order of the states (`perform`). Never apply a message
  from the fiber of effects, nor start a step's commands apart from its job. When a dispatch returns, `update` and the
  option have heard its message and the new state is current: "when it returns, update and onApplied have heard it,
  and the current state is the one it made", "a message a listener sends is applied after every listener has been told
  of the step, before the dispatch returns", "a command's answer and a subscription's message are applied in the call
  that sends them", "takes the jobs one at a time, in the order of the states: none starts while the job before is
  held" (`engine.test.ts`), with a gate. The promise is of the outermost call: one sent while another is applied
  returns before its message is applied, and is applied right after, before the outer call returns. The listeners are
  told last, once the state is current; that they are told after the job is offered and after the keys are reconciled
  is no promise, and has no test and no mutation (the guide says only "once the new state is current"). Each other
  check has a mutation (`tools/mutations/mutations.ts`), and the search checks that a dispatch has been applied when it
  returns, that each `update` is heard before the next is called, and that a message a listener sends is the next one
  heard.
- **`reject` means one thing: the message does not apply in the state.** The run ignores every rejection, and
  whether the view sends only what applies is for the tests ("Rejections and defects" in the guide). Never add
  a runtime check of the model against `update`, nor a way for a model to ask `update` what it accepts: the
  model, read from the state, and `update` are two derivations that tests check against each other, and a
  model that asked would make a wrong rejection a control that silently disappears. A `defect` is only for a
  message the state and the engine together rule out, never one that what was drawn rules out: an example
  never dies on a message of its view, nor on an event raised for one.
- **A parent and its children talk only through external messages and events**, so that `reject` means the
  same everywhere: a handle's `update` returns a step, never a rejection, and a child rejecting an external
  message, or a parent giving one to a child that is not there, is a defect: a `CompositionDefect`, as every
  break of what a parent declared is (`defectAt` in `compose.ts`), so that reports group them and name the child. The
  types enforce what a parent declares: `runCommand` exactly when it has commands of its own, `onEvent` exactly when a
  child has events, a handle's `update` only with a child's `external` messages, which a handle alone sends (an own
  subscription and an own command send only the parent's own messages, `RunCommandOf` in `compose.ts`), no own message
  or command named like a child. A program written without `Program<…>` has `unknown` types, read as `never` (`Known`
  in `program.ts`), so that it does not open these checks.
- **A write is stored over the value it names, and only what is drawn writes into an input** (`written` in
  `input.ts`, applied in `compose.ts` as an input's program; [`registers.md`](records/registers.md) says why). A write
  is a message of the composed program like any other, so the state stays the fold of `update` over the messages,
  `applyAll` replays it, and neither the engine nor the testing tools know of inputs. It is stored when the input's
  place holds, by `Equal`, the value it was written over, whatever it is, and a write of the value held leaves the very
  same value; over another value it is rejected, since the state has moved on without the element that wrote it: a stale
  write does not apply in the state, the one meaning of `reject`. A view writes `{ _tag: 'Written', was, value }` by
  hand, `was` the value its model holds ([`rejected.md`](rejected.md), "An entry of each input in the model, which a
  view writes through"). A write into an input by id is routed as a child's message by id is, to the place of the id
  it names (`isById` in `compose.ts`), and is rejected where that place is not there. The rule reads the state and the
  message alone and keeps nothing between two writes, so every other step, the parent's own, a child's and what
  `onEvent` makes of its events, leaves an input as it wrote it, and a reset, an undo by snapshot or a place that comes
  back cuts no history. A write comes only from a view: an own subscription and an own command send only the parent's
  own messages (`RunCommandOf` in `compose.ts`), so neither compiles with a write, into the parent's input or a
  child's. Two limits are declared, not flaws: a write over a value that came back is stored, and a message names a
  place, so one drawn for an old instance reaches the new one. Each check has a mutation
  (`tools/mutations/mutations.ts`), and `interleaving.test.ts` checks that a write is stored exactly when its place is
  there and holds the value it was written over, with two inputs whose places take turns in one field, so that a write
  may reach a place that is gone, and that a write typed into the element, over the value the current model holds, is
  never rejected.
- **What a screen shows of an input is the bridges', and the library keeps no rule of an element.** A view draws a
  native controlled element from the value its model holds, and writes over that value in its handler. What the
  element then shows is no guarantee of the library's, which knows no renderer: the guide promises it in "Inputs the
  user types into" and "Writing a bridge", for the elements and the renderers they name, and the bridges' tests check
  it in a DOM (`bridges/bridge.test_suite.ts`). The bridge to React draws the model read with `useSyncExternalStore`,
  so that a controlled element is updated during its own event (`premises.md`, of a controlled input). The bridge to
  snabbdom keeps two rules beside snabbdom: after each draw it gives each element drawn with a `value` or a `checked`
  in `props` that prop back where the element differs from it (`giveBack` in `bridges/snabbdom.ts`), since snabbdom
  sets a prop only where it differs from the vnode drawn before; and it draws a message the view's own `dispatch`
  sends at once, before the handler returns, since a view takes `was` from the model it was drawn with, and a second
  key before a draw would be written over the first one's value. A draw asked for while a patch runs waits for it, and
  the patch under way draws again once it is done: a browser calls `blur` as a patch removes the focused element, and
  the DOM calls `blur` and `focus` as an `insert` hook focuses one ("a message a listener sends while a patch runs",
  `snabbdom.test.ts`). Each of these checks has a mutation.
- **Every program keeps its state in an object**, replaced and never mutated, so that any program can be a child: a
  parent keeps a child's model and its lifted subscriptions by its state object (below), and a number or a string
  has no identity to keep them by. It binds whoever writes a program, and the types are what enforce it
  (`ObjectState` in `program.ts`, checked by `Program`, `program`, `make`, `child`, `childById`, `run` and the
  testing tools that take a program). `make` checks it on its config, since the program it returns carries the
  marker that the check of `run` asks for (`MakeProgram` in `compose.ts`). A primitive state gets past them only by a
  cast or from a caller without TypeScript: a
  program run alone never needs its state to be an object, and is not checked, while a child's is checked where a
  parent reads it for a model or for its lifted subscriptions (`objectAt` in `compose.ts`), and is a
  `CompositionDefect` that names the child, since the state is the one the parent's `get` declared, where a `WeakMap`
  would raise its own `TypeError`.
- **A dispatch is a function, and needs no services**: it applies its message on its caller's stack, and records what
  the program throws there (`attempt` and `recordThrown` in `engine.ts`, with `record` of `Deaths` in `shell.ts`),
  never throwing it to the caller, whose fiber would take it for its own. No fiber is made for a message, nor for a
  defect. So a renderer calls it from a plain callback as it is, and effect code wraps it in `Effect.sync`. Keep the
  queue of the jobs unbounded, offered with `Queue.offerUnsafe`, which never waits: a bounded one would refuse a job
  when full, and lose the effects of its step. A dispatch sent once the end has stopped the engine applies nothing,
  and throws nothing ("a dispatch from a plain callback after the run has ended applies nothing, and throws nothing",
  `run.test.ts`). The loop of `apply` resets `applying` with no `finally`: nothing it calls throws but through
  `attempt`, and a change that calls anything else there keeps it so, or the engine would apply nothing more, in
  silence. Running a dispatch is the renderer's business: the library exports no helper for it.
- **A subscription never ends in silence**: its end value is a message (or `never`), sent to `update`. An ended
  subscription keeps its key among the active ones until the key goes away and comes back: never restart it
  automatically, which would loop on one that ends at once. What the end of a library's stream means is the
  caller's decision: no helper takes it for them, and the type of a subscription asks for it (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key leaves running, a gone key interrupts.
  The keys are reconciled in the thunk that makes the state (`Core.reconcile` in `applyOne`), so the keys the engine
  holds are always those of the current state, while the fibers that run are those the fiber of effects has reached:
  the two diverge by design, and the drop by start keeps them apart. The gone keys of a job are interrupted together,
  and awaited before any key of that job or a later one starts (`perform` in `engine.ts`): the fiber of effects waits
  for the slowest release rather than for their sum, the next message does not wait for it, and a key that comes back
  finds its old subscription released. A parent lifts its children's keys under their names, and dies on an own key
  equal to a lifted one. Each start has a generation that its messages carry, and a message whose key is gone, or came
  back with a new start, is dropped before `update`, as soon as the key is gone, though the fiber of effects has not
  stopped the subscription yet, or not started it: "a start whose key went away before the fiber of effects started it
  sends nothing that reaches update" (`engine.test.ts`), with a gate, "what a subscription sends once its key went
  away, before it is stopped, does not reach update" (`run.test.ts`), and "in the run, a message of a start whose key
  went away before it started reaches no update" (`contract.test.ts`). Such a start is still started, and dropped by
  its start: never skip it in the fiber of effects, which would be a check of what the thunk changes, made in another
  fiber, against "one thunk" below. `rehearse` never gives `arrive` such a message: `hear` fails on a key gone from the
  current state, also after it has waited for the job that starts its start, and its ledger forgets a start in the
  transition that stops it ("a start whose key went away is stopped and forgotten, and the calls waiting on it are
  told", `ledger.test.ts`; "hear on a key that goes away while it waits for its start's job fails the test, and
  reaches no update", `rehearse.test.ts`). The rule rests on nothing of Effect: it is the engine's own, tested where
  the fibers' order would otherwise hide it. Keys are the program's, and so are their `Equal` and `Hash`: the run
  compares them only in `'subscriptions'` (`reconcile` in `core.ts`), and keeps its fibers, and tells a message that
  still applies, by their start, which compares no keys.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description
  that must be kept in step with one: a test, `onApplied` and the logs read the command itself.
- **Commands cannot be cancelled**, a deliberate choice: do not add cancellation without asking.
- **Each command, each subscription and the renderer has a scope of its own** (`scopedIn` where the library starts
  them; a command's closes before its answer is applied: "a command's scope closes before its answer is applied",
  `engine.test.ts`), and `simulate` scopes each command the same way. Never let them acquire into the run's scope:
  what they hold would outlive them, and be released before their fibers are interrupted.
- **A model is made only when it is read**: `app.model()` makes the model of the current state, kept by the identity
  of the state in one slot (`model` in `run.ts`), a model that failed included, so that a second read of the same
  state gives the very same model, or throws the very same defect, recorded once: "a model is made only when read,
  once for each state", "a second read of the same state throws the same defect, recorded once" (`run.test.ts`), and
  the search's "a model is made only when read, once for each state read". Never make a model in the thunk, which runs
  on the sender's stack: a model nobody reads would cost every message. A parent keeps its own state when a child's
  message leaves the child's as it is, so the very same state has the very same model. The bridge to snabbdom draws no
  model that is the very one it drew last, and has a mutation for it. The bridge to React reads the model in each
  notice, as `useSyncExternalStore` compares the snapshot there, so a model is made for every new state, on the stack
  of whoever sent its message ("a new state's model is made in the notice, on the stack of whoever sent the message,
  and not again", `react.test.ts`): no page of react.dev says so, and the guide describes it in "What is left to you"
  and does not promise it. `rehearse` makes the model of each new state in the thunk that makes it, as a renderer told
  of every state that reads each one makes it, so that a defect of `makeModel` ends each tool as it ends the run, and
  no scenario meets it; since the run records a model's defect where the model is read, a defect of a later model
  never cuts that step short in either: its release and its commands go on ("in the run, the message whose model dies
  is applied whole, with its commands", and its twin of `rehearse`, `contract.test.ts`).
- **`onApplied` and `onIgnored` are given no dispatch, and return nothing**: they are functions, called in the thunk
  as `update` is (`attempt` in `applyOne`), and their types refuse a value, which an effect or a promise is too. They
  hear each accepted, or rejected, message in order, with where it came from, before the new state is current and
  before its listeners, and they send no message and change no state. That is all the rule means: they watch. So
  only functions of the program run in the thunk, and nothing holds a step: a release holds the fiber of effects
  alone, and a test that holds the fiber of effects inside a job does it with such a release (`gate` in
  `test/gate.test_helper.ts`). A defect in them is a bug like any other, and stops the step: one of `onApplied` leaves
  the state as it was. Neither hears a message dropped before `update` (one left by a stopped subscription): that is
  the engine's, not the program's.
- **Logs never carry message data by default** (`describeByTag` in `log.ts`): only tags, following a wrapped
  `message` or `command` only when it is itself tagged, since a program's own field of that name may hold data.
  A subscription's key is logged as it is, and may hold data, as the guide says ("Running"): the rule is of
  messages and commands.
  Level: `debug` for each message and for subscriptions starting, stopping and ending, nothing else, written by the
  fiber of effects, first in the job of the step. What is computed only to be logged (`describeMessage`,
  `describeCommand`) is computed only while debug logs are enabled there (`LogLevel.isEnabled`), never in the
  dispatch (`logsOf` in `engine.ts`): "describeMessage and describeCommand are called only while debug logs are
  enabled, in the fiber of effects" (`engine.test.ts`). A job is offered for each message, its logs included while
  debug logs are off: deciding in the thunk whether to offer one would rest on how `LogLevel.isEnabled` reads the
  level.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn them into
  messages: reporting is the job of whoever runs the program.
  - A fiber of the program dies when its effect ends with a defect: what the program wraps around its own code
    (`Effect.ensuring`, an `Effect.scoped` of its own) runs before, and may still catch it, so never add a way to learn
    of a defect earlier (a `Supervisor`, a look at a fiber's state); what it acquires in the scope the library gives it
    is released after, and what that release dies of is a defect once the scope has closed.
  - Where the engine knows where a defect happened, it wraps each defect of the cause in a `ProgramDefect` (`diesIn` in
    `shell.ts`) that holds it as its `cause` and says where, and keeps the rest of the cause. What a function of the
    program throws in the thunk is wrapped the same way, with the same site and fields (`recordThrown` in `engine.ts`,
    over `Core.wrapDefects`). The run's own logs die in `'log'`, each outside any other site, so that a `Logger` that
    throws is never taken for the subscription or the step that logs; what the program logs is in the site it logs
    from. Every site where a defect is told where it happened, a `diesIn`, a `scopedIn`, which calls it, or a
    `recordThrown`, in the engine and in each testing tool, has a mutation that takes the site out, or gives it another
    (and one that drops the key or the message it says, where it says one): where is what a report groups defects by,
    and a tool that told another site than the run's would point a test at the wrong code.
  - The run stops each fiber of the program with a mark of its own on the interruption, made anew for each stop
    (`stopping` in `shell.ts`, `Stopped` in `core.ts`), and `diesIn` takes an interruption of the cause for one the
    fiber received only when it has the fiber id and the mark, or the lack of one, of a received one: a fiber id alone
    is one the program can make too (`FiberMap`, `FiberSet` and `FiberHandle` interrupt as the fiber -1, and the fiber
    that ends the run may have interrupted another before). Never stop a fiber of the program otherwise. So do the
    testing tools, which run in their caller's fiber: `rehearse` stops a command whose `run` is interrupted, the starts
    whose key went away, by the job of the step that stops them, and, as it ends, the subscriptions `hearNext` started
    and the commands under way, before it closes its scope, which would interrupt them as the fiber that ends it;
    `simulate` runs each command in a fiber of its own, which it stops when it is interrupted.
  - So only the run interrupts a fiber the run forks: a command, a subscription, the renderer, and their kin in the
    testing tools. Such a fiber takes an interruption without the run's mark (`Core.byTheRun`) for one the program
    made, by whatever fiber, in two places. Its scope (`scopedIn`) takes it while the fiber's effect runs, and records
    the death before the scope releases what it holds, as for a self-interruption: from it on, the run applies no
    message, which a death recorded only after the release would break (the search found it, with a renderer that
    releases slowly). Its root (`rootedIn` in `shell.ts`), the last thing it runs, takes an end of interruptions only:
    one that reached the fiber once its scope had closed, before its answer is applied or its last message is sent,
    past every site. A cause with a defect is no end of interruptions only, so the root leaves a death that the scope
    recorded as it is, though Effect adds the interruption the fiber received to its failure (`docs/premises.md`).
    Nothing interrupts such a fiber unmarked before the run has stopped it: `Effect.forkChild` interrupts a child only
    as its parent ends, as its documentation says, and the sets close only after the end has stopped their fibers. The
    root is the last thing the fiber runs, and has no mutation: the scope takes an interruption that comes while the
    effect runs, and one that comes as it releases too (its `diesIn` restores the close), so what reaches the root
    alone is an interruption made in the operations after the scope, which a fiber of the program makes only where the
    scheduler preempts there, and no gate reaches. The search can, with a fiber of the program that interrupts another
    ("isInterrupted" in `interleaving.test.ts`). The fiber of whoever runs the program, where `init` runs and the
    testing tools call the program, and the fiber of effects, where `describeMessage` and `describeCommand` run, have no
    root: only functions of the program run there, which could interrupt it (`Fiber.getCurrent`) as whoever runs it
    would, and the guide leaves that to the program ("Guarantees", "What is left to you"). The thunk runs `update`,
    `subscriptions` and the options where the message was sent: in a command's fiber or a subscription's, whose root
    and scope take an interruption of that fiber for a defect of that command or subscription, not of `update`; in the
    renderer's; in a fiber of whoever runs a testing tool; or in no fiber at all, from a plain callback.
  - Each fiber of the run records what it dies of in one place (`makeDeaths` in `shell.ts`, made by `run` or `drive`
    and given through `runWith` to the engine; `rehearse` has its own, keeping only the program's defects, and
    `simulate` one for each simulation, for the commands it runs): the engine's, the renderer, and the
    run's own as it starts the engine, as they end, in a cleanup nothing interrupts, which an interruption that reaches
    the fiber cannot stop halfway (the cleanup of `Effect.onExit`, `docs/premises.md`), and one with a scope of its own
    as it dies too, before the scope releases what it holds (`scopedIn`), what a subscription's channel adds to that
    scope included
    (`runSubscription`), so that a defect is in the order it happened, though its release lets another fiber die first;
    what the release dies of is wrapped apart, told from what the fiber died of by what the fiber kept of it, never by
    the register, where a defect another fiber recorded may be the very one a release dies with. What a function of
    the program throws where no fiber of the run calls it, in the thunk of `engine.ts` and of `rehearse`, is recorded at
    once (`record` of `Deaths`), with no fiber made for it, in the same register and the same order. A site may be given
    the defects that are its own already (`wrapped` of `scopedIn`), recorded where they were thrown, which its effect
    and its release take as they are: the run records a defect of `makeModel` where the model is read, in `'render'`,
    once for each state, and the reader gets that `ProgramDefect`; the renderer's site, its release and a listener's
    site (`rendered` of `Engine.make`) take that very defect, so that a renderer that reads it is one defect, wherever
    it reads it: "a model read outside any fiber is recorded in render, and the reader gets the defect recorded", "a
    model read in the renderer's fiber is one defect, in render", "a listener that reads a model that throws, and
    throws it, is one defect, in render", "a renderer whose release reads a model that throws is one defect, in render"
    (`run.test.ts`). The killer of the renderer's site taking it as it is reads the model as the renderer acquires what
    it draws on ("a model read as the renderer acquires what it draws on is one defect, in render"), where nothing
    interrupts: read plainly in the renderer's fiber, the mutant survives, since the end begins on the stack that
    records the defect and its interruption takes the place of the renderer's second death, so the plain test kills
    nothing. A fiber of another site that reads a model and dies of it is a second defect, of that site, as a fiber
    that dies of a defect another fiber recorded is. `scopedIn` closes the scope itself and takes what the close dies of
    as it is (`docs/premises.md`), each defect of each release: never join the two with `Cause.combine`, as
    `Effect.scoped` does, which keeps one of two defects equal by `Equal`. What the program wraps around its own code
    (two `Effect.ensuring`) is joined by Effect, and is the effect's own.
  - The order of the defects is the engine's to keep, and its tests', and no promise of the guide, which describes
    it: what a user relies on is that every defect is in the cause, each with where. No promise of the library's
    rests on what a function of Effect makes of a cause (`Cause.squash` gives the first defect).
  - Each defect recorded is reported once, in that order: by the run as soon as one dies, and by the end of the run,
    which stops applying (`stopped`, the one check of the end, read in `apply` before each message, so that what is
    sent meanwhile is not applied: "once the end has stopped the engine, nothing sent is applied", `engine.test.ts`,
    "a message the renderer sends as the run releases it does not reach update", `run.test.ts`), then stops the fiber
    of effects first and waits for it (`stop` in `engine.ts`), so that nothing forks a fiber while it reads them (a
    stop with no mutation: the end interrupts every fiber of the engine at once after it, the fiber of effects among
    them, so a job it had not taken starts nothing either way, and what the stop first keeps, that nothing forks while
    the end reads the sets, no test without the scheduler of the tests reaches), then interrupts its other fibers
    itself, waits for them to release what they hold, and dies of the rest; the run's cause holds the defects first,
    then the rest of what it ended with, but for the defects already among them, by their identity (`endedWith` in
    `core.ts`, which `rehearse`, `drive` and `simulate`, for a command it stops, end with too). The end may begin inside
    a step: a defect recorded in the thunk completes `died` there, and what waits on it may resume on that stack, as
    the guide describes and does not promise. Nothing rests on where the end begins: `stopped` is read before each
    message, and the step under way goes on to its job and its listeners, as a step under way goes on whole.
  - From the first defect recorded on, the run applies no message, until its end stops it: it calls no `update`,
    checked in the thunk that calls it (`arrive` in `core.ts`, called by `applyOne` and by `rehearse`'s `apply`). It is
    the only check. A defect in the thunk stops the step there: one of `update` changes nothing, one of `onApplied`
    leaves the state as it was, one of `subscriptions` leaves the new state with the old keys and offers no job, and
    one of a listener is in `'render'`, the other listeners still told: "a defect of update in a dispatch is recorded in
    update, never thrown to the caller, and no update follows", and the same of the others, "defects are recorded in
    the order they happened, and a listener that throws leaves the others told" (`engine.test.ts`). A step whose
    `update` was called before goes on whole until the end stops the fiber of effects: its job may still start its
    commands and the subscriptions of its new keys ("a step applied before the first defect goes on whole: its commands
    still start", `engine.test.ts`). The renderer is called at most once, as the run starts, with no check before it: a
    run that died meanwhile may end before the call, which is the first step of a fiber `Effect.forkChild` does not
    start at once, or make it and interrupt its effect, and nothing is promised of which. Never add a check in the
    middle of a job, nor before the renderer: it would leave a state whose commands never started, which `onApplied`
    heard of, and protect nothing a correct program needs, since a command that died is, to `update`, one that has not
    answered yet (`docs/records/single-owner.md`).
  - What an effect of the program does once started is its own, until the end of the run interrupts it: no check can
    come between two of its operations. So is what a renderer reads: `model()` checks no register, `makeModel` is pure,
    and a model read after the first defect is still made.
  - Never report a defect only through a `join`, or through a fiber that races: once nothing awaits it, or the race is
    lost, the defect is lost with it, and `FiberSet` and `FiberMap` discard the exits of the fibers they interrupt as
    they close. The renderer is one of them, interrupted and awaited however the run ends, once the engine has stopped
    and before the engine's other fibers (`running` in `run.ts`).
  - `drive` stops and awaits its run however it ends, interrupted too, and begins its scenario once its renderer has
    the handle, so that `Driver.dispatch` is the run's from the first step. Its renderer is the run's, told of every
    state, which reads the model of each in its listener, so a defect of `makeModel` is recorded by the run, in
    `'render'`, in the register of the run (`runWith` in `run.ts`) as any other, and the scenario races only the end of
    the run. `Driver.model` fails with the defects once there is one, as `Rehearsal.model` does. A wait may still
    match the model read before a defect of a later model; `drive` ends with the defect first all the same. A call of
    `rehearse`'s that waits for a subscription or a command races its wait with the death of any fiber (`orDead`), as
    the run dies at once.

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
- **A state that changes no key costs a lookup for each key** (`reconcile` in `core.ts`): where no key appeared, among
  as many keys as were active, none went away either, so the active ones are left the very same and nothing is made,
  where a long list of children lists a key for each on every change of state. It runs in the thunk, on the stack of
  whoever sent the message. Whether a key is active is asked once, for that shortcut and for the starts alike, so that
  no check stands in front of another ("one thunk", below). A key that stays is kept as the listing that started it
  gave it, equal to those listed since. "the same keys, made anew, leave the active ones the very same"
  (`core.test.ts`) holds that the shortcut is taken, and each half of its check has a mutation.
- **A child's dispatch is the same while anyone holds it** (`forwardTo` in `dispatch.ts`): kept weakly by its
  parent's dispatch, its name and its id (compared with `Equal`, as subscription keys are), and removed by a
  `FinalizationRegistry` once collected. Never hold them strongly: ids that are never reused, as the guide
  advises, would pile up for as long as the run lasts.
- **No span lives as long as the run**: `run` and `Engine.make` are untraced, and the run's fibers see the span
  of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every log as an event of the
  current span until it ends.

## How a check is built, and how the testing tools follow

- **A check of what another fiber may change, and the act it guards, are one thunk.** Where the engine or a testing tool
  decides from what another fiber may change (the register of deaths, the keys of a state, the end, `pending`), the
  check and the act it guards, a call of the program or the start of a fiber, are in one synchronous thunk: the
  scheduler may yield at any other operation, and another fiber die or write meanwhile. In the engine, the thunk that
  applies a message is one by construction, on the caller's stack; the fiber of effects decides nothing from what the
  thunk writes after it offered the job. The check is a transition of the core (`core.ts`, `testing/ledger.ts`), tested
  on its own; where program code lies between the check and what the test watches, a gate (program code held by a
  `Deferred`) makes the order deterministic. A change of the engine or of a testing tool lists the points where another
  fiber can run between a check and its act, and leaves a test that fails without the check, deterministic, of the
  core or with a gate, and a mutation that takes the check out, naming that test (`tools/mutations/`,
  `change-engine`). No test of a check runs under the scheduler of the tests (`test/scheduled.test_scheduler.ts`): a
  check whose mutation no deterministic test kills is moved until one does, or goes. Three rules keep a check where
  such a test reaches it (`docs/records/single-owner.md`):
  - **A function of the program is called where the call is decided**, never as the first step of a fiber forked for
    it, which starts when the scheduler says, unless the fork runs it at once on its own stack (`FiberSet.run`, a
    premise of `docs/premises.md`).
  - **One check for each call.** No earlier check of the same register stands in front of it in another thunk: it
    would answer in its place in every order a deterministic test reaches. The end's `stopped` is read once, before
    each message, in the loop of `apply`: read at the entry of `apply` too, either of the two taken out alone failed
    nothing.
  - **A fiber and how it stops are one primitive**, `Effect.acquireRelease(fork, stop)`, with nothing in between for an
    interruption to fall into (the renderer in `run.ts`), or `Effect.acquireUseRelease` where a call waits for the
    fiber (a command's in `rehearse`'s `run`), or the fork and what keeps it for the stop in one region nothing
    interrupts, where the stop is the end's (the fiber of effects in `engine.ts`, for `stop`; `rehearse`'s scope and
    the loop forked in it, one region with its end from the scope on, as `drive` forks its run: "leaves no fiber of its
    own running, wherever the interruption reaches it", `rehearse.test.ts`, is its alarm), or `FiberSet.run` and
    `FiberMap.run`, which fork and add in one step (`docs/premises.md`), where the end reads the set.

  Every fiber the engine and the testing tools fork, each side of a race included, is interruptible, though it is
  forked where nothing interrupts, as a fork inside such a region is, and a run or a tool called inside one: Effect's
  forks and races make it so (`docs/premises.md`). A fiber that took the region of whoever forked it would be one the
  end cannot stop, and the end would wait for it.

  What cannot be one thunk with its check, as the first step of an effect of the program, is no act the guide
  promises about.

  A thunk writes first and offers or completes last: in the engine, the listeners are told once the new state is
  current; in each thunk of `rehearse`, the state, its keys, the ledger's hearings and the model are written before the
  job is offered; in `drive`, the listener reads the model before it wakes the waits, its renderer subscribes before
  its first read and keeps only the read of the latest notice, and `waitFor` takes what it waits on before it reads the
  model. So a fiber that the offer, or the completion of a `Deferred`, wakes on that stack finds the step written
  whole. That a fiber is resumed on the stack of whoever completes its `Deferred` is no premise
  ([`synchronous-dispatch.md`](records/synchronous-dispatch.md), E3): these orders have no mutation, since no
  deterministic test reaches them but through that resumption. Nor has the release of the snabbdom bridge's
  subscription to the handle a killer: the run stops the engine before the renderer, so no notice comes after it.

  A region nothing may interrupt holds no code of the program, so no gate reaches it, and it has no mutation: one that
  took it out would fail only under the scheduler of the tests. It is written in one of three forms: a transition of
  the ledger made in the thunk of `rehearse`'s loop that checks the end and offers the job (`submit` and `offer` in
  `loop.ts`), held by the test of the transition (`ledger.test.ts`); a fiber and how it stops as one primitive or one
  region, above; what follows an effect of the program outside `restore` (a command's answer, applied in its thunk).
  The last two are held by Effect's documentation and by the tests of the premises it does not document
  (`premises.md`): a fiber forked where nothing interrupts is interruptible all the same, the region of the fiber of
  effects too, `FiberSet.run` and `FiberMap.run` fork and add in one step, and the use of `Effect.acquireUseRelease`
  can be interrupted. The checks beside them (`ended` in `loop.ts`, the register, a call that left) each have a
  mutation with a deterministic killer, and the tests of `rehearse.test.ts` under the scheduler of the tests stay as
  alarms of the search, killing none.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler
  ("Testing tools" in the guide says what each one runs, fails on and ignores); `rehearse` fails on a command left
  pending, since its answer would arrive, and `drive` acts only as a user can, through `run` and the run's
  dispatch. `rehearse` models both halves of a step: a call that applies a message (`send`, `hear`, a command's answer,
  a message `hearNext` hears) applies it in one thunk in the fiber that makes it, `Core.arrive`, the state, its keys
  and the ledger's hearings, and the model, and offers its job last (`apply` in `rehearse.ts`); its loop is the fiber
  of effects, whose job stops the starts whose key went away, by their start, kept in a `FiberMap` as the engine's
  are, tells the calls that waited on them, and owes the step's commands. A call returns once its job is done, so each
  call is whole for the test, and one made while a release is held applies at once and waits behind it, as in the run.
  `hear` waits for the job that starts its start, then looks its key up again; every `hearNext` is a job, whose key is
  looked up at the call. The end of a rehearsal reads the commands under way in the thunk that takes the scenario's
  exit, which is the one that marks the end of the loop (`end`, in `loop.ts`), which refuses what is asked after it; a
  scenario that returned lets the loop finish what it was offered, a release a job waits for included, before the end
  stops it and reads the commands pending: never interrupt that job to end sooner. A scenario that failed, or was
  interrupted, has the end interrupt the job under way, wherever it is: so the end stops what still runs by the fibers
  themselves, kept as they are forked (`listeners` and `commands` in `rehearse.ts`, as the engine's end reads its
  `FiberSet` and its `FiberMap`), and tells every call of `hearNext` that has not ended (`calls` in `ledger.ts`), never
  only what the ledger still says of a start, which the thunk forgets in the transition that stops it: "a subscription
  that interrupts itself as the end stops it, its key gone, is a defect", "a hearNext waiting on a start whose key went
  away fails, though the scenario failed", "a hearNext whose message was stopping a subscription as the scenario failed
  fails as one waiting" (`rehearse.test.ts`), and of the engine "a subscription interrupting itself as the end of the
  engine stops it, its key gone, is a defect" (`engine.test.ts`). Stopping only the starts the ledger still hears has no
  mutation since the scope of a fiber the run forks takes an unmarked interruption for a defect: the close of the scope
  would interrupt the others as the fiber -1, and the self-interruption the test makes is a defect either way. Never
  make what an end stops, or tells, depend on what a job it may interrupt writes after its thunk. When the engine or one
  tool changes, keep the others in step. `src/testing/contract.test.ts` gives the same program and inputs to each tool
  and to the run; a difference found is a `test.failing` case there, which says how, and an item of `ROADMAP.md`, until
  it is fixed.
- **Windows of absence.** A test that checks that something does not happen awaits a witness where a correct run
  gives one: "it does not start again while its key stays" (`engine.test.ts`) awaits a command of the last state,
  which its job starts after its keys; and a dispatch returns having applied its message or not, so "a message the
  renderer sends as the run releases it does not reach update" (`run.test.ts`) checks it once the release has sent
  it, with no sleep. Where no
  correct run gives one, since what would signal the absence is what does not happen, the test sleeps once a signal it
  awaits has come, as `AGENTS.md` allows ("A test never rests on the clock"): of `engine.test.ts`, "takes the jobs one
  at a time, in the order of the states: none starts while the job before is held", where nothing tells that a later
  job has not started while a release holds the fiber of effects, and "the end stops the fiber of effects held by a
  release, which starts nothing after, nor any job it had not taken", where nothing of the program runs in it to tell
  when the end has stopped it, and "a message of a stopped subscription, sent once a command has died, is not
  described", where the job of the message would follow the one that stopped the ticks at once; "a subscription dying
  in a scope of its channel lets no message apply as the channel releases" (`run.test.ts`), where a correct run
  applies nothing while the channel releases; "each call hears the next message, and the subscription waits between two
  of them" (`rehearse.test.ts`); "in the run, it is heard once to its end, under a key that stays, and again once its
  key comes back", and the tests of "a fiber of the test's that sends once the tool has ended" (`contract.test.ts`). The
  scheduler of the tests could await quiescence in their place, and does not, as "one thunk" says of every test of a
  check (`rejected.md`, "The checks").
