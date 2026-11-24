# Invariants the engine keeps

The guide's "Guarantees" says what a user may rely on, and the library's tests check each one
(`src/interleaving.test.ts` checks each that its scenario reaches, the order of the messages, the rule of an input and
what the run does from the first defect on included, under random orders of clicks, writes into an input, typed into
its element or over an older value, into a place the state may no longer hold, messages sent from inside a step,
answers, subscription messages and ends, releases, defects and self-interruptions, as the guide says). A mutation of
`tools/mutations/mutations.ts` names the items of "What you can rely on" its check holds a part of, and
`bun run guarantees` prints each item with those mutations and their killers: an index made by hand, which
`bun run comments` checks only for a title the list lacks and an item no mutation names, so that an item says nothing
of which of its sentences a test fails without. This is how they are kept, and what a change must not undo. What they rest on of Effect and of the JavaScript engine is in
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
  subscriptions stopped and started and its commands started are a job, which waits with the jobs of the other steps
  of the call until the outermost `apply` returns, and is then offered with them, at once, to one fiber of effects,
  which takes the jobs from an unbounded queue one at a time, in the order of the states (`perform`). A step that stops,
  starts and commands nothing makes no job, decided from the step alone (`queue`). The engine is made by plain code
  (`build`), and a message sent before its effects start is applied all the same: its job waits, with the first
  state's, and the fiber that starts the effects (`effects`) does those that waited, in their order, a job a message
  sends meanwhile included, before it forks the fiber of effects, which takes the later ones. Never apply a message
  from the fiber of effects, nor start a step's commands apart from its job. When a dispatch returns, `update` and the
  option have heard its message and the new state is current: "when it returns, update and onApplied have heard it,
  and the current state is the one it made", "a message a listener sends is applied after every listener has been told
  of the step, before the dispatch returns", "a command's answer and a subscription's message are applied in the call
  that sends them", "takes the jobs one at a time, in the order of the states: none starts while the job before is
  held" (`engine.test.ts`), with a gate. The promise is of the outermost call: one sent while another is applied
  returns before its message is applied, and is applied right after, before the outer call returns. The listeners are
  told last, once the state is current; that they are told after the job is made and after the keys are reconciled
  is no promise, and has no test and no mutation (the guide says only "once the new state is current"). A notice goes
  over a copy of the listeners, and calls each only while it is still among them (`tell`): one stopped during the
  notice is not told of it, and one added during it is told from the next, so that a listener that adds another on
  every notice cannot loop in one call: "a listener stopped during a notice is not told of it, and one added during a
  notice is told from the next" (`engine.test.ts`), with a mutation for the check and one for the copy. Each other
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
- **A parent and its children talk only through external messages, events and outputs**, so that `reject` means the
  same everywhere: a child answers an external message in its `external`, whose type returns a step, never a
  rejection, and a parent telling one to a child that is not there once its step is reconciled is a defect: a
  `CompositionDefect`, as every break of what a parent declared is (`defectAt` in `compose.ts`), so that reports group
  them and name the child. A parent is not given its children's states: its functions take its own state, and the
  library keeps the children beside it, in the state of the composed program
  ([`kept-children.md`](records/kept-children.md)). So nothing but a child's own `update` and `external` changes a
  child's state while it lives, and a parent cannot read one to decide: it reads only what a child declares as its
  `output`, a pure function of the child's state, which keeps no copy of it in the parent's. The outputs a parent's
  function is given are read from the children of the moment it is called, which are replaced and never changed
  (`outputsOf` in `compose.ts`): in `update` and `external`, of before the step; in a handler of `onEvent`, as the
  child's step left them, which a mutation holds. The types give a parent the outputs alone outside `makeModel`, and
  only of the children that declare one. What a parent tells is data of its step,
  `tell`, given to the children once the step's state is reconciled, in order, each to its end (`ownStep` in
  `compose.ts`); an item bound to an instance that an earlier item dropped or started again is told nothing, so that a
  parent can tell all its children where the answer of one removes another. The types enforce what a parent declares:
  `runCommand` exactly when it has commands of its own, `onEvent` exactly when a child has events, `external` exactly
  when it names external messages, a `tell` only with what the child's `external` takes, which reaches that `external`
  through a `tell` alone (an own subscription and an own command send only the parent's own messages, `RunCommandOf`
  in `compose.ts`), no own message or command named like a child. A program written without `Program<…>` has
  `unknown` types, read as `never` (`Known` in `program.ts`), so that it does not open these checks.
- **The children are those the parent's own state lists, and an answer reaches the instance that asked for it, or is
  rejected.** After each step of the parent's own code (its `init`, `update`, `external`, a handler of `onEvent`, a
  write into its input), the library starts each child that the own state lists anew, with its first commands, drops
  each it no longer lists, and starts again one whose flags or key differ by `Equal` (`reconcile` in `compose.ts`): the
  state stays the fold of `update` over the messages, so the engine and the testing tools know nothing of children.
  Each start has a number, counted in the state (`starts`), which the child's lifted commands, their answers and its
  lifted keys carry, and a message whose number is not that of the child there is rejected (`update` in `compose.ts`):
  a child closed and opened again, or started again in one step, never gets the answer of the one before. A message of
  a view carries no number, and names the place alone, as an input's write does. Children by id whose `ids` gives the
  very same object for the own state of before and for the new one are not reconciled: `ids` is pure, so the same
  object lists the same children. An id listed twice is a `CompositionDefect` there.
- **A write is stored wherever its place is there, and only what is drawn writes into an input** (`written` in
  `input.ts`, applied in `compose.ts` as an input's program; [`registers.md`](records/registers.md) says why, and
  [`write-without-was.md`](records/write-without-was.md) why a write names no value it was written over). A write is a
  message of the composed program like any other, so the state stays the fold of `update` over the messages, `applyAll`
  replays it, and neither the engine nor the testing tools know of inputs. It is stored into its place whatever it is
  and whatever the place held, since the element on screen already shows it, in the form its input declares
  (`store`, a function of the value alone, which `set` is given), and a write whose stored form is the value held, by
  `Equal`, leaves the very same value. A view writes `{ _tag: 'Written', value }` by hand, `value` what the element
  holds ([`rejected.md`](rejected.md), "An entry of each input in the model, which a view writes through"). A write
  into an input by id is routed as a child's message by id is, to the place of the id it names (`getInput` in
  `compose.ts`). A write whose place is not there, where `get` returns `None` or the state holds no such id, is
  rejected by that routing before `written` is called, and so before the form: it does not apply in the state, the
  one meaning of `reject`.
  The rule reads the message alone and keeps nothing between two writes, so every other step, the parent's own, a
  child's and what `onEvent` makes of its events, leaves an input as it wrote it, and a reset, an undo by snapshot or a
  place that comes back cuts no history. A write comes only from a view: an own subscription and an own command send
  only the parent's own messages (`RunCommandOf` in `compose.ts`), so neither compiles with a write, into the parent's
  input or a child's. One limit is declared, not a flaw: a message names a place, so one drawn for an old instance
  reaches the new one. Each check has a mutation (`tools/mutations/mutations.ts`), and `interleaving.test.ts` checks
  that a write into the field is stored exactly when its place is there, with two inputs whose places take turns in one
  field, so that a write may reach a place that is gone, and that a write typed into the element of the current model
  is never rejected.
- **What a screen shows of an input is the bridges', and the library keeps no rule of an element.** A view draws a
  native controlled element from the value its model holds, and writes what the element holds in its handler. What the
  element then shows is no guarantee of the library's, which knows no renderer: the guide promises it in "Inputs" and
  "Writing a bridge", for the elements and the renderers they name, and the bridges' tests check it in a DOM
  (`bridges/bridge.test_suite.ts`). Since a write names no value it was written over, a key typed on a view
  older than the state would store that view's text over the newer state: so a bridge draws each new state before the
  browser handles the next event. The bridge to React draws the model read with `useSyncExternalStore`, so that a
  controlled element is updated during its own event (`premises.md`, of a controlled input), and React renders a state
  made outside its events in a microtask (`premises.md`, of a store updated outside its events). The bridge to snabbdom
  keeps two rules beside snabbdom. After each draw it gives each element drawn with a `value` or a `checked` in `props`
  that prop back where the element differs from it (`giveBack` in `bridges/snabbdom.ts`), since snabbdom sets a prop
  only where it differs from the vnode drawn before. And it draws in a microtask after each notice, and after each
  message its view's own `dispatch` sends, whether it made a new state or not (`notice`): the HTML Standard runs the
  microtasks after each task and after each listener the browser calls, so no handler of an event the browser
  dispatches runs on an older view; and a rejected write makes no notice, but its element must be given its value
  back. The notices of one task, or of one listener the browser calls, are drawn once. No microtask runs while a
  patch is on the stack, so a message a listener sends during a patch (a browser calls `blur` as a patch removes the
  focused element, and the DOM calls `blur` and `focus` as an `insert` hook focuses one) is drawn after it, in a
  microtask of its own ("a message a listener sends while a patch runs", `snabbdom.test.ts`). A draw asked for before
  the bridge is stopped is not made after it, since the root may be another program's by then. Each of these checks
  has a mutation, but the one that asks for one microtask for the notices of a task (`if (queued) return`): without it,
  a second microtask draws the model drawn last, which patches nothing (`last`), and gives the controlled elements back
  what they already hold, so no test can tell. What no check holds,
  in either bridge: an event that the program's own code dispatches in the task of a notice, before its draw
  (`element.click()`, `dispatchEvent`, `focus()`), runs its handler on the view of before the notice:
  `bridges/browser.test.ts` shows it in real browsers, and holds nothing of it.
- **Every program keeps its state in an object**, replaced and never mutated, so that any program can be a child: a
  parent keeps a child's model by its state object (below), and a number or a string has no identity to keep it by. It
  binds whoever writes a program, and the types are what enforce it (`ObjectState` in `program.ts`, checked by
  `Program`, `program`, `make`, `child`, `childById`, `start` and the testing tools that take a program). `make` checks
  it on its config, since the program it returns carries the marker that the check of `start` asks for (`MakeProgram` in
  `compose.ts`). A primitive state gets past them only by a cast or from a caller without TypeScript: a program run
  alone never needs its state to be an object, and is not checked, while a child's is checked where a parent reads it
  for a model (`modelOf` in `compose.ts`), and is a `CompositionDefect` that names the child, where a `WeakMap` would
  raise its own `TypeError`.
- **A dispatch is a function, and needs no services**: it applies its message on its caller's stack, and records what
  the program throws there (`attempt` and `recordThrown` in `engine.ts`, with `record` of `Deaths` in `shell.ts`),
  never throwing it to the caller, whose fiber would take it for its own. No fiber is made for a message, nor for a
  defect. So a renderer calls it from a plain callback as it is, and effect code wraps it in `Effect.sync`. Keep the
  queue of the jobs unbounded, offered with `Queue.offerAllUnsafe`, which never waits: a bounded one would refuse a job
  when full, and lose the effects of its step. A dispatch sent once the end has stopped the engine applies nothing,
  and throws nothing ("a dispatch from a plain callback after the run has ended applies nothing, and throws nothing",
  `run.test.ts`). What the program throws, `attempt` records; what the loop of `apply` meets thrown outside it, by the
  engine's own code or by what `recordThrown` reads of a message to say what a defect was on, its `catch` records as it
  is, with no site, and the run dies of it. `recordThrown` records the defect before it throws what its details threw,
  so the defect of `update` is kept too ("what the thunk throws outside every site is recorded as it is, after the
  defect it was saying, never thrown to the sender, and ends the run", `start.test.ts`, the killer of the mutations of
  the `catch` and of that order). Its `finally` resets `applying`, offers the jobs and releases the register (below):
  the `catch` throws nothing, so the `finally` has no mutation of its own, and keeps the engine from applying nothing
  more, in silence, should a change make it throw. Running a dispatch is the renderer's business: the library exports
  no helper for it.
- **A subscription never ends in silence**: its end value is a message (or `never`), sent to `update`. An ended
  subscription keeps its key among the active ones until the key goes away and comes back: never restart it
  automatically, which would loop on one that ends at once. What the end of a library's stream means is the
  caller's decision: no helper takes it for them, and the type of a subscription asks for it (`Channel.mapDone`).
- **Subscriptions are reconciled by key**: a new key starts, a kept key leaves running, a gone key interrupts. The keys
  are reconciled in the thunk that makes the state (`Core.reconcile` in `applyOne`), so the keys the engine holds are
  always those of the current state, while the fibers that run are those the fiber of effects has reached: the two
  diverge by design, and the drop by start keeps them apart. The gone keys of a job are interrupted together, and
  awaited before any key of that job or a later one starts (`perform` in `engine.ts`): the fiber of effects waits for
  the slowest release rather than for their sum, the next message does not wait for it, and a key that comes back finds
  its old subscription released. A key listed twice is listed once: `reconcile` counts the starts of the active keys it
  finds, not the keys listed, so a key listed twice hides no key that went away, and starts once ("a key listed twice is
  listed once, and hides no key that went away", `core.test.ts`). A subscription is made from its key alone, by
  `listen`, which the fiber of the start calls, as a command's calls `runCommand`: a defect of `listen` is the
  subscription's, with its key, and never one of the fiber of effects ("the run dies in the subscription, with its key,
  of what listen throws", `contract.test.ts`). A parent lifts its children's keys under their names, as it lifts their
  commands, so the types refuse an own key that could take a child's name, and its `listen` lifts a child's subscription
  once for each start. Each start has a generation that its messages carry, and a message whose key is gone, or came
  back with a new start, is dropped before `update`, as soon as the key is gone, though the fiber of effects has not
  stopped the subscription yet, or not started it: "a start whose key went away before the fiber of effects started it
  sends nothing that reaches update" (`engine.test.ts`), with a gate, "what a subscription sends once its key went away,
  before it is stopped, does not reach update" (`run.test.ts`), and "in the run, a message of a start whose key went
  away before it started reaches no update" (`contract.test.ts`). Such a start is still started, and dropped by its
  start: never skip it in the fiber of effects, which would be a check of what the thunk changes, made in another fiber,
  against "one thunk" below. `rehearse` never gives the engine such a message: `hear` fails on a key gone from the current
  state, also after it has waited for the job that starts its start, and its ledger forgets a start in the transition
  that stops it ("a start whose key went away is forgotten, and the calls waiting on it are told once it is
  released", `ledger.test.ts`; "hear on a key that goes away while it waits for its start's job fails the test, and
  reaches no update", `rehearse.test.ts`). The rule rests on nothing of Effect: it is the engine's own, tested where the fibers'
  order would otherwise hide it. Keys are the program's, and so are their `Equal` and `Hash`: the run compares them only
  in `'subscriptions'` (`reconcile` in `core.ts`), and keeps its fibers, and tells a message that still applies, by
  their start, which compares no keys.
- **Commands are data; only `runCommand` runs them.** Never let a command carry its effect, or a description
  that must be kept in step with one: a test and `onApplied` read the command itself.
- **Commands cannot be cancelled**, a deliberate choice of design.
- **Each command and each subscription has a scope of its own** (`scopedIn` where the library starts
  them; a command's closes before its answer is applied: "a command's scope closes before its answer is applied",
  `engine.test.ts`), and the testing tools that run them, `rehearse` and `simulate`, run them on the engine. Never
  let them acquire into the run's scope:
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
  and not again", `react.test.ts`): no page of react.dev says so, and the guide says only that it may happen ("What is
  left to you"), and leaves it unspecified. `rehearse` and `drive` read the model of each state through the handle, by
  one function (`readEach` in `run.ts`): that of each new state in a listener, in the thunk that makes the state, as a
  renderer told of every state that reads each one makes it, and the first whatever the first keys did, as a renderer
  reads it to draw ("rehearse fails in subscriptions, then in render, as the run dies, on a first state whose model is
  a defect too", and its twin of `drive`, `contract.test.ts`, with a mutation), so that a defect of `makeModel` ends
  each tool as it ends the run, and no scenario meets it; since the run records a model's defect where the model is
  read, a defect of a later model never cuts that step short in either: its release and its commands go on ("in the
  run, the message whose model dies is applied whole, with its commands", and its twin of `rehearse`,
  `contract.test.ts`).
- **`onApplied` and `onIgnored` are given no dispatch, and return nothing**: they are functions, called in the thunk
  as `update` is (`attempt` in `applyOne`), and their types refuse a value, which an effect or a promise is too. They
  hear each accepted, or rejected, message in order, with where it came from, before the new state is current and
  before its listeners, and they send no message and change no state. That is all the rule means: they watch. So
  only functions of the program run in the thunk, and nothing holds a step: a release holds the fiber of effects
  alone, and a test that holds the fiber of effects inside a job does it with such a release (`gate` in
  `test/gate.test_helper.ts`). A defect in them is a bug like any other, and stops the step: one of `onApplied` leaves
  the state as it was. Neither hears a message dropped before `update` (one left by a stopped subscription): that is
  the engine's, not the program's.
- **The run writes no log of its own.** What the program logs is its own, and so is what it logs of what `onApplied`
  and `onIgnored` hear. A message is named by its tags alone (`describeByTag` in `log.ts`) where the library names one,
  in the `on` of a defect and in what the testing tools say: a wrapped `message` or `command` is followed only when it
  is itself tagged, since a program's own field of that name may hold data.
- **Defects always die, and the run dies with them.** Nothing in the library may retry, swallow, log or turn them into
  messages: reporting is the job of whoever runs the program.
  - A fiber of the program dies when its effect ends with a defect: what the program wraps around its own code
    (`Effect.ensuring`, an `Effect.scoped` of its own) runs before, and may still catch it, so never add a way to learn
    of a defect earlier (a `Supervisor`, a look at a fiber's state); what it acquires in the scope the library gives it
    is released after, and what that release dies of is a defect once the scope has closed.
  - Where the engine knows where a defect happened, it wraps each defect of the cause in a `ProgramDefect` (`diesIn` in
    `shell.ts`) that holds it as its `cause` and says where, and keeps the rest of the cause. What a function of the
    program throws in the thunk is wrapped the same way, with the same site and fields (`recordThrown` in `engine.ts`,
    over `Core.wrapDefects`). What the program logs dies in the site it logs from. Every site where a defect is told
    where it happened, a `diesIn`, a `scopedIn`, which calls it, or a `recordThrown`, in the engine and in each testing
    tool, has a mutation that takes the site out, or gives it another (and one that drops the key or the message it
    says, where it says one): where is what a report groups defects by, and a tool that told another site than the run's
    would point a test at the wrong code.
  - The run stops each fiber of the program with a mark of its own on the interruption, made anew for each stop
    (`stopping` in `shell.ts`, `Stopped` in `core.ts`), and `diesIn` takes an interruption of the cause for one the
    fiber received only when it has the fiber id and the mark, or the lack of one, of a received one: a fiber id alone
    is one the program can make too (`FiberMap`, `FiberSet` and `FiberHandle` interrupt as the fiber -1, and a fiber
    learns the id of the one that stops it from the interruption it receives, `Cause.interruptors`, and can interrupt
    another as that id). Never stop a fiber of the program otherwise. So do the
    testing tools: `rehearse` and `simulate` run on the engine, whose jobs and end stop their fibers, and stop
    themselves the command of a `run` that is interrupted (`runFirst` in `testing/stage.ts`).
  - So only the run interrupts a fiber the run forks: a command, a subscription, and their kin in the testing tools.
    Such a fiber takes an interruption without the run's mark (`Core.byTheRun`) for one the program made, by whatever
    fiber, in two places. Its scope (`scopedIn`) takes it while the fiber's effect runs, and records the death before
    the scope releases what it holds, as for a self-interruption: from it on, the run applies no message, which a death
    recorded only after the release would break (the search found it, with a renderer of the run's that released slowly,
    which the run no longer has). Its root (`rootedIn` in `shell.ts`), the last thing it runs, takes an end of
    interruptions only: one that reached the fiber once its scope had closed, before its answer is applied or its last
    message is sent, past every site. A cause with a defect is no end of interruptions only, so the root leaves a death
    that the scope recorded as it is, though Effect adds the interruption the fiber received to its failure
    (`docs/premises.md`). Nothing interrupts such a fiber unmarked before the run has stopped it: the engine, for the run
    and for the testing tools, forks it with `FiberSet.run` or `FiberMap.run`, as no child of the fiber that forks it,
    as their documentation says, and the sets close only after the end has stopped their fibers. The root is the last thing the fiber runs, and is recorded as the scope is (`recorded` after
    it, in the engine and in each testing tool). The scope takes an interruption that comes while the effect runs, and
    one that comes as it releases too (its `diesIn` restores the close), so what reaches the root alone is an
    interruption that lands once the scope has closed. A release that has another fiber of the program interrupt the
    command's or a subscription's fiber makes one, since nothing interrupts the fiber while it releases: the root of a
    command, and its record, have a mutation in the engine, which `rehearse` and `simulate` run on, and the root of
    a subscription, and its record, in the engine, killed by such a release ("of a command a fiber of the program
    interrupts as it releases" and "of a subscription a fiber of the program interrupts as it releases",
    `contract.test.ts`). The search reaches both, with a fiber of the program that interrupts another ("isInterrupted"
    in `interleaving.test.ts`). The fiber of whoever runs the program,
    where `init` runs and the testing tools call the program, has no root: only functions of the program run there,
    which could interrupt it (`Fiber.getCurrent`) as whoever runs it would, and the guide leaves that to the program
    ("Guarantees", "What is left to you"). Nor has the fiber of effects, where no function of the program runs. The
    thunk runs `update`, `subscriptions` and the options where the message was sent: in a command's fiber or a
    subscription's, whose root and scope take an interruption of that fiber for a defect of that command or
    subscription, not of `update`; in a fiber of whoever runs a testing tool; or in no fiber at all, from a plain
    callback, as a renderer sends.
  - Each fiber of the run records what it dies of in one place (`makeDeaths` in `shell.ts`, made by plain code by
    `start` or `drive` and given through `startWith` to the engine; `rehearse` has its own, given through `partsOf` in
    `run.ts`, which keeps every defect, as the run's does, since a failure of a call of the tool's is returned to the
    fiber that made the call and never dies in a fiber of the engine's, and `simulate` one for each simulation, given to
    `Engine.build`): the engine's, and the run's own as it starts the effects, as they end, in a cleanup nothing
    interrupts, which an interruption that reaches the fiber cannot stop halfway (the cleanup of `Effect.onExit`, as its
    documentation says), and one with a scope of its own as it dies too, before the scope releases what it holds
    (`scopedIn`), what a subscription's channel adds to that scope included (`runSubscription`), so that a defect is in
    the order it happened, though its release lets another fiber die first; what the release dies of is wrapped apart,
    told from what the fiber died of by what the fiber kept of it, never by the register, where a defect another fiber
    recorded may be the very one a release dies with. What a function of the program throws where no fiber of the run
    calls it, in the thunk of `engine.ts`, in the handle (`partsOf`) and where `rehearse` compares a key of the test's,
    is recorded at once (`record` of `Deaths`), with no fiber made for it, in the same register and the same order.
    `'render'` is the
    site of what a renderer meets, and of nothing of a fiber: `makeModel` wherever the model is read, a listener given
    to `subscribe`, and what a renderer gives to `die` (`partsOf` in `run.ts`), since the run has no renderer of its
    own to fork. The run records a defect of `makeModel` where the model is read, in `'render'`, once for each state,
    and the reader gets that `ProgramDefect`; a listener's site (`rendered` of `Engine.build`) and `die` of the handle
    take that very defect as it is, so that a renderer that reads it is one defect, wherever it reads it: "a model read
    outside any fiber is recorded in render, and the reader gets the defect recorded", "a model read before the run
    starts is one defect, in render, and the run dies of it", "a listener that reads a model that throws, and throws it,
    is one defect, in render", "a model's defect a renderer gives to die is one defect, in render" (`run.test.ts`). The
    last two read the model before the run starts: once it has started, the end may begin on the stack that records the
    defect, and finish before the renderer gives it on, so that a second record would change nothing the test sees.
    The defect of an `init` that threw, which the dead handle's `model()` throws, is taken as it is too ("by a handle
    whose init threw, takes the defect model() threw as it is", `run.test.ts`, and the first draw of the bridge to
    snabbdom). The thunk where the run reads its register is its end: `die` given a defect that this read lacks
    throws it back to the renderer, since no cause will hold it, and it checks after it records, since the record may
    end the run on its stack ("once the run has ended, throws back what it is given", "before the run has ended,
    throws nothing", `run.test.ts`; "by makeModel, ends the run at once, with one defect", `snabbdom.test.ts`). A
    fiber of another site that reads a model and dies of it is a second defect, of that site, as a fiber that dies of a
    defect another fiber recorded is. `scopedIn` closes the scope itself and takes what the close dies of as it is
    (`docs/premises.md`), each defect of each release: never join the two with `Cause.combine`, as `Effect.scoped` does,
    which keeps one of two defects equal by `Equal`. What `scopedIn` ends with once the scope has closed (`Core.released`)
    is read only by the register, which keeps each defect once by its identity and has recorded both already, and by a
    `run` of a testing tool, which fails with what its command's fiber ended with: so that join has no mutation, since
    what would kill one is the cause of a `run` that a scenario catches, which nothing promises. What the program wraps around its own code (two `Effect.ensuring`)
    is joined by Effect, and is the effect's own.
  - The order of the defects is the engine's to keep, and its tests', and no promise of the guide, which leaves it
    unspecified: what a user relies on is that every defect is in the cause, each with where. The guide leaves two
    cases of that unspecified too, since each rests on half of a premise read only in Effect's source
    (`docs/premises.md`): that two releases of one scope that die of defects equal by `Equal` are two defects, and that
    a command or a subscription that interrupts itself while the run stops it is a defect. No promise of the library's
    rests on what a function of Effect makes of a cause (`Cause.squash` gives the first defect).
  - Each defect recorded is reported once, in that order: by the run as soon as one dies, and by the end of the run,
    which stops applying (`stopped`, the one check of the end, read in `apply` before each message, so that what is
    sent meanwhile is not applied: "once the end has stopped the engine, nothing sent is applied", `engine.test.ts`,
    "a message a command sends as the run releases it does not reach update", `run.test.ts`), then stops the fiber
    of effects first and waits for it (`stop` in `engine.ts`), so that nothing forks a fiber while it reads them (a
    stop with no mutation: the end interrupts every fiber of the engine at once after it, the fiber of effects among
    them, so a job it had not taken starts nothing either way, and what the stop first keeps, that nothing forks while
    the end reads the sets, no test without the scheduler of the tests reaches), then interrupts its other fibers
    itself, waits for them to release what they hold, and dies of the rest; the run's cause holds the defects first,
    then the rest of what it ended with, but for the defects already among them, by their identity (`endedWith` in
    `core.ts`, which `rehearse`, `drive` and `simulate` end with too). The end never begins
    inside a step: the outermost `apply` holds the register (`hold` of `Deaths`), so that a defect recorded meanwhile
    completes `died` only as it returns, once every message sent during it is applied, every listener told and its jobs
    offered (`release`, in its `finally`): "never begins inside a step: a defect a listener throws ends the run once
    every listener of the step is told" (`start.test.ts`), with a mutation. It may begin on the stack of the dispatch,
    once it has applied, which the guide leaves unspecified: `stopped` is read before each message all the same, since a
    defect recorded outside a step, by a fiber or by a model read, completes `died` at once.
  - From the first defect recorded on, the run applies no message, until its end stops it: it calls no `update`,
    checked in the thunk that calls it (`arrive` in `core.ts`, called by `applyOne`, which `rehearse` runs too). It is
    the only check. A defect in the thunk stops the step there: one of `update` changes nothing, one of `onApplied` or
    of `subscriptions` leaves the state as it was, with its keys, tells no listener and offers no job, so that a state
    is current only once its keys are, and one of a listener is in `'render'`, the other listeners still told: "a
    defect of update in a dispatch is recorded in update, never thrown to the caller, leaves the state as it was, and no
    update follows", and the same of the others, "defects are recorded in the order they happened, and a listener that
    throws leaves the others told" (`engine.test.ts`). A step whose `update` was called before goes on whole until the
    end stops the fiber of effects: its job may still start its commands and the subscriptions of its new keys ("a step
    applied before the first defect goes on whole: its commands still start", `engine.test.ts`). Never add a check in
    the middle of a job: it would leave a state whose commands never started, which `onApplied` heard of, and protect
    nothing a correct program needs, since a command that died is, to `update`, one that has not answered yet
    (`docs/records/single-owner.md`).
  - What an effect of the program does once started is its own, until the end of the run interrupts it: no check can
    come between two of its operations. So is what a renderer reads: `model()` checks no register, `makeModel` is pure,
    and a model read after the first defect is still made.
  - Never report a defect only through a `join`, or through a fiber that races: once nothing awaits it, or the race is
    lost, the defect is lost with it, and `FiberSet` and `FiberMap` discard the exits of the fibers they interrupt as
    they close.
  - A program started is run once: the run's first operation reads and sets `begun` in one thunk (`startWith` in
    `run.ts`), and a second `run` dies with a plain `Error`, a mistake of whoever runs it and no defect of the program,
    while the first goes on ("is run once: a second run dies, and the first goes on", `start.test.ts`, with a mutation).
    A program whose `run` was interrupted before that operation, or never forked, is never stopped: its state can still
    change, and no effect follows, since only the end of a run stops the engine.
  - `drive` starts the program by plain code (`startWith`), subscribes before its first read, forks its run, and stops
    and awaits it however it ends, interrupted too. It begins its scenario once the run has started the effects of the
    first state (`began`), unless the program has died by then: so `Driver.dispatch` is the program's from the first
    step, and the scenario meets a program whose run has begun, since a fiber `Effect.forkChild` forks starts later and
    one interrupted before it begins would leave the program not stopped (the tests of the contract that a subscription
    of `init` starts, that a defect of the first model reaches no scenario, and that a message sent after `drive` ended
    is not applied, with a mutation). It is told of every state, and reads the model of each in its listener
    (`readEach`, as `rehearse` does), so a
    defect of `makeModel` is recorded by the run, in `'render'`, in the register of the run as any other, and the
    scenario races only the end of the run. `Driver.model` fails with the defects once there is one, as
    `Rehearsal.model` does. A wait may still match the model read before a defect of a later model; `drive` ends with
    the defect first all the same. A call of `rehearse`'s that waits for a subscription or a command races its wait with
    the death of any fiber (`orDead` in `testing/stage.ts`), as the run dies at once.

## What the engine keeps for itself

- **A child's model is kept by its state object, and its lifted keys by its instance** (`modelsOf` and `lifted` in
  `compose.ts`), for as long as that object lives: they rely on `makeModel` and `subscriptions` being pure and on states
  being replaced, never mutated, and hold nothing of the run, so runs that share a state share them. A model holds
  nothing of its place either, so children that share a state share its model. The instance, the object in which the
  library keeps a child, is at one place, and is replaced with the child's state, so its lifted keys carry its place and
  its number with no check, and go with it. A lifted key holds no subscription: the parent's `listen` makes one for each
  start, so nothing of a run is kept with the key. The model's cache needs the state to be an object, which every
  program keeps (above): never add a cache for primitive states, which nothing could let go of.
- **A state that changes no key costs a lookup for each key** (`reconcile` in `core.ts`): where no key appeared, and
  every active key was found among those listed, none went away either, so the active ones are left the very same and
  nothing is made, however often a key is listed, where a long list of children lists a key for each on every change of
  state. It runs in the thunk, on the stack of whoever sent the message. Whether a key is active is asked once, for that
  shortcut and for the starts alike, so that no check stands in front of another ("one thunk", below). A key that stays
  is kept as the listing that started it gave it, equal to those listed since. "the same keys, made anew, leave the
  active ones the very same" (`core.test.ts`) holds that the shortcut is taken, and each half of its check has a
  mutation.
- **A child's dispatch is the same while anyone holds it** (`forwardTo` in `dispatch.ts`): kept weakly by its
  parent's dispatch, its name and its id (compared with `Equal`, as subscription keys are), and removed by a
  `FinalizationRegistry` once collected. Never hold them strongly: ids that are never reused, as the guide
  advises, would pile up for as long as the run lasts.
- **A run that goes on keeps nothing of the steps it has done**, but what waits: the state is replaced (`current` in
  `engine.ts`), and with it the model of the last one read (`last` in `run.ts`); a message leaves `pending` as it is
  applied; a job leaves `waiting` as it is offered, and the queue as it is taken (`docs/premises.md`); a command's or a
  subscription's fiber leaves its `FiberSet` or its `FiberMap` as it ends, as their JSDoc says, and Effect keeps
  nothing of it, nor of what its scope released (`docs/premises.md`); a listener stopped leaves `listeners`; and a
  child's model and dispatch are kept weakly (above). "of what a thousand rounds used, a collection leaves a few at
  most while the run goes on" (`run.test.ts`) holds it, with the run alive, for each of these. What lets go is an
  assignment that replaces, not a check, so only the removal of a listener has a mutation; the others were seen to fail
  the test under a retention written by hand, on 21 November 2026: a job, a state, a message or what `onApplied`
  heard kept by the engine, a model kept by the handle, a fiber kept as it is forked, a scope's finalizers kept as it
  closes, a child's dispatch held strongly, and a child's model kept in a `Map`. What no weak reference can hold, the
  keys and the entries a run counts, this test does not see: the keys of `active` and their starts, the entries of the
  `FiberMap` and the `FiberSet`, those that `forwardTo` keeps before its `FinalizationRegistry` calls back, and the
  room of the queue of the jobs. "past two thousand rounds, four thousand more grow the objects of a run that goes on
  by less than 100 kB" (`run.test.ts`) sees them, by the objects of the heap after the same rounds read twice, and was
  seen to fail with one entry of a `Map` kept by the engine for each command, on 23 November 2026. It has no mutation,
  for the reason above.
- **`Host` starts one run under StrictMode** (`bridges/react.ts`): it starts its run in a microtask after its effect,
  which its cleanup cancels, so that the commands of `init` start once, as the owner chose on 20 November 2026
  ([`store-and-effects.md`](records/store-and-effects.md), "Decided", 4). The guide leaves it unspecified, since it
  rests on a premise of React (`premises.md`, of StrictMode): the two tests of StrictMode in `react.test.ts` hold it,
  each with a mutation.
- **No span lives as long as the run**: the `run` of a program started and the engine's `effects` are untraced,
  and the run's fibers see the span of whoever runs it as an external one (`withExternalSpan`), since Effect keeps every
  log as an event of the current span until it ends.

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
    it, which starts when the scheduler says, unless the fork runs it at once on its own stack (`FiberSet.run`, as its
    documentation says).
  - **One check for each call.** No earlier check of the same register stands in front of it in another thunk: it
    would answer in its place in every order a deterministic test reaches. The end's `stopped` is read once, before
    each message, in the loop of `apply`: read at the entry of `apply` too, either of the two taken out alone failed
    nothing.
  - **A fiber and how it stops are one primitive**, `Effect.acquireRelease(fork, stop)`, with nothing in between for an
    interruption to fall into, or `Effect.acquireUseRelease` where a call waits for the fiber (a command's in
    `rehearse`'s `run`), or the fork and what keeps it for the stop in one region nothing interrupts, where the stop is
    the end's (the fiber of effects in `engine.ts`, for `stop`; `rehearse`'s scope and the effects of the engine started
    in it, one region with its end from the scope on, as `drive` forks its run: "leaves no fiber of its own running, wherever the
    interruption reaches it", `rehearse.test.ts`, is its alarm), or `FiberSet.run` and `FiberMap.run`, which fork and
    add in one step, as their documentation says, where the end reads the set.

  Every fiber the engine and the testing tools fork, each side of a race included, is interruptible, though it is
  forked where nothing interrupts, as a fork inside such a region is, and a run or a tool called inside one: Effect's
  forks and races make it so, as their documentation says. A fiber that took the region of whoever forked it would be
  one the end cannot stop, and the end would wait for it.

  What cannot be one thunk with its check, as the first step of an effect of the program, is no act the guide
  promises about.

  A thunk writes first and offers or completes last. In the engine, nothing rests on it any more: the listeners are
  told once the new state is current, and the jobs are offered and `died` completed in one place, the `finally` of the
  outermost `apply`, once every step of the call is written whole and every listener told, so no fiber is woken inside
  a step, wherever a fiber that waits is resumed; the hold of the register has a mutation, and that the jobs are
  offered there has one too. `drive` wakes its waits in the same place (`settled` of `Engine.build`, called last in
  that `finally`), having read the model in its listener, so that a `send` a wait makes is applied before it returns:
  "returns once update has seen its message, as it promises" (`drive.test.ts`), with a mutation. It subscribes before
  its first read, and a wait takes what it waits on before it reads. A wait reads each model in order, from the one
  current as it began, at a place of its own among the models `drive` read (`place` in `drive.ts`), and never only the
  latest: a wait woken by a state may run after another one woken by it has sent, and so made a later state, and it
  still looks at the model that woke it ("a wait looks at the model of the state that woke it, though another wait
  woken by it sent first", with a mutation). The models are kept from the oldest place a wait still holds, and the
  latest alone while none does: a wait lets go of its place however it ends, patience run out included ("are let go:
  of two hundred states made after a wait that ran out of patience, a collection leaves a few at most", with a mutation
  of each). `rehearse` applies each message through the engine, whose thunk writes the state, its keys and, in what it
  tells (`stepped`), the ledger's hearings, and reads the model through the handle, in its listener; each thunk of
  `rehearse`'s own writes the ledger before it completes a `Deferred`, gives a command's fiber its effect or asks a
  start for a message, so a fiber woken on that stack finds the step written whole: that order has no mutation, since no
  deterministic test reaches it but through the resumption below. A fiber resumed on the stack of
  whoever completes its `Deferred` is a premise of the tests alone (`premises.md`): the killers of the mutations that
  wake inside a step rest on it, in `start.test.ts` and `drive.test.ts`, and so do the killers of the refusal of a
  command's answer and of a subscription's message once a rehearsal has ended, in `rehearse.test.ts`; no guarantee
  does. That the effects of a step start only once the call that sent its message has returned rests on the queue
  resuming the fiber of effects in a task of the scheduler, which is no premise either: the guide leaves it unspecified,
  and "a dispatch returns before the commands of its step start, while the fiber of effects waits" (`start.test.ts`) is
  its alarm, the killer of no mutation. Nor has the release of the snabbdom bridge's subscription to the handle a
  killer: its stop sets `stopped` first, which keeps a notice that comes after from drawing.

  A region nothing may interrupt holds no code of the program, so no gate reaches it, and it has no mutation: one that
  took it out would fail only under the scheduler of the tests. It is written in one of three forms: a transition of
  the ledger made in the thunk of `rehearse` or `simulate` that checks the end (`submit` in `testing/stage.ts`) and
  asks the engine for a job that only tells (`afterJobs`), held by the test of the transition (`ledger.test.ts`); a
  fiber and how it stops as one primitive or one region, above; what follows an effect of the program outside `restore` (a command's answer, applied in its thunk).
  The last two are held by Effect's documentation: a fiber forked where nothing interrupts is interruptible all the
  same, the region of the fiber of effects too, `FiberSet.run` and `FiberMap.run` fork and add in one step, and the use
  of `Effect.acquireUseRelease` can be interrupted where its caller can be. The checks beside them (the end the
  engine marks, read by `submit`, the register, a call that left) each have a mutation with a deterministic killer, and the tests of
  `rehearse.test.ts` under the scheduler of the tests stay as alarms of the search, killing none.
- **What the engine gives a testing tool, the run takes by its defaults** ("What the engine gets", in
  [`one-engine.md`](records/one-engine.md)). In the config of `Engine.build`, there are five. `settled` is called last
  as the outermost `apply` returns, where `drive` wakes its waits. `listening` and
  `answering` say what the fiber of a start and that of a command run. The job calls each where it forks the fiber, as
  a function of the program is called where the call is decided ("one thunk", below), and the fiber runs what it
  returns inside its root, in the run's context. What such a fiber runs of the program is written once, in `shell.ts`:
  `startFiber`, the subscription `listen` makes, made inside the fiber, in a scope of its own whose defects die in
  `'subscription'` with the key, and its last message sent after that scope; `commandFiber`, the effect of a command in
  a scope of its own whose defects die in `'command'`, and its answer sent after that scope. The run's defaults call
  them with the program's `listen` and `runCommand`, and a tool's `listening` and `answering` call them too, with what
  the test decides around them. The config takes `runCommand` and `listen`, or `listening` and `answering`, never both,
  so that nothing given is left uncalled. `stepped` is told in the thunk as each step stands: what a message came
  to (dropped or dead at once, ignored once `onIgnored` has heard it, applied once `onApplied` has heard it and its
  state is current, and never for a step a defect stopped before), and the keys of each new state once they are the
  active ones, the first state's as the engine is made. `released` is told by the fiber of effects once the stops of a
  job have ended, before its starts. On the engine, there are five more. `after` is a job that only tells: it is done
  once every job before it is, and asked in a step, it waits with that step's job until the outermost call returns.
  `send` applies a message as its source sends it, and `active` gives the keys of the current state. `end` marks the
  end by plain code, as `stop` marks it first, and `ended` reads it. The defaults are what the run did before them,
  and the run gives none of them: `drive` gives `settled` alone, through `startWith`, `rehearse` all but
  `settled`, through `partsOf`, and `simulate` `stepped`, `listening` and `answering`, to `Engine.build` itself; only a testing tool may, or the tests of the engine. They add no premise:
  the fibers are forked with `FiberSet.run` and `FiberMap.run`, as before. Each has a test in `engine.test.ts` ("what a
  testing tool is given") and a mutation.
- **The testing tools behave like the engine** where it is deterministic, with the test as the scheduler
  ("Testing tools" in the guide says what each one runs, fails on and ignores); `rehearse` fails on a command left
  pending, since its answer would arrive, and `drive` acts only as a user can, through `run` and the run's
  dispatch. `rehearse` runs on the engine itself (`Engine.build`, [`one-engine.md`](records/one-engine.md)), through the
  handle the run makes (`partsOf` in `run.ts`: `init` called with the flags, its defect in `'init'`, and each model made
  once for its state, read as `drive` reads it), with the register of the run, so that the thunk, the jobs and their
  order, the fibers, their roots and records, and the end that stops them are the engine's, held by the engine's tests
  and mutations, and `rehearse` decides only what the test
  decides: when a command runs, and when a subscription's message is heard. A call that applies a message (`send`,
  `hear`, a command's answer, a message `hearNext` hears) gives it to the engine's `send` in a thunk of its own, reads
  what the step came to from what the thunk told (`stepped`), and waits for a job that only tells (`after`), after the
  job of its step: so each call is whole for the test, and one made while a release is held applies at once and waits
  behind it, as in the run. The fiber the engine forks for a command (`answering`) makes the command pending, in the
  job, once what the step stops is released, and waits until a `run` gives it the effect `runCommand` returned, called
  in the `run`'s thunk, which it runs in `commandFiber`, with the services of that call, in a region that nothing
  interrupts from the answer to its apply, the testing tools' alone; the fiber of a start (`listening`) waits for the
  first ask of a `hearNext`, and runs the subscription in `startFiber` with the services of that call. Its messages are applied by the thunk that finds a call waiting for
  them, never by the engine's `send` as they come ([`rejected.md`](rejected.md), "`rehearse`, owning what the test
  starts, in other forms"). What a start, a command and a call are to the test is the ledger's (`ledger.ts`): a start
  that appears is starting until the job begins its fiber, though its key goes away first, and `hear` waits for that;
  the calls that waited on a start whose key went away, and those whose job found the key gone, are told once the
  engine has released it (`released`). Every `hearNext` is a job, whose key is looked up at the call. The end of a
  rehearsal reads the commands under way in the thunk that takes the scenario's exit, which is the one that marks the
  engine's end (`end`), after which the thunks of `rehearse` refuse what is asked (`submit`): a command that answers
  once the end is marked, before the end stops it, is refused with no defect, as the run applies nothing once it has
  stopped ("a command that answers as the end tells a call that its job was not done is no defect",
  `rehearse.test.ts`). A subscription that sends then is refused too, and waits for the end to stop it, since one that
  interrupted itself would die ("a subscription that sends as the end tells a call that its job was not done is no
  defect"). A scenario that returned lets the engine finish what it was offered, a release a job waits for included,
  before the end stops it and reads the commands pending: never interrupt that job to end sooner. A scenario that
  failed, or was interrupted, has the end stop the fiber of effects at once, wherever its job is, then interrupt the
  calls that wait for a job it will not do, before the engine's end waits for the releases, since such a call may hold
  what a release waits for: "a scenario that failed stops the fiber of effects at once, its job under way included"
  (`rehearse.test.ts`). The engine's end then stops every fiber all at once, since a release may wait for what another
  gives ("rehearse ends too, as the run does, failing on the command still under way", both ways, `contract.test.ts`),
  and the rehearsal tells every call of `hearNext` that has not ended (`calls` in `ledger.ts`), never only what the
  ledger still says of a start, which the thunk forgets in the transition that stops it: "a hearNext waiting on a start
  whose key went away fails, though the scenario failed", "a hearNext whose message was stopping a subscription as the
  scenario failed fails as one waiting" (`rehearse.test.ts`). What the engine's end dies of is the register, which
  `rehearse` reads itself with what the scenario ended with. A `run` interrupted before the fiber of its command has
  begun waits for it, to stop it; the end interrupts that wait once it has stopped the fibers, for a fiber it stopped
  before it began: no deterministic test reaches it, since a fiber the job forks begins before the end of a scenario
  that waits for its `run`, so it has no mutation. Never make what an end stops, or tells, depend on what a job it may
  interrupt writes after its thunk. `simulate` runs on the engine too (`Engine.build`, with the register of the run):
  what it shares with `rehearse` is one module, `testing/stage.ts` (the fiber of a command that waits for a `run`, the
  ledger of the commands, a message applied and what its call waits for, `runFirst`, and the end), and it has no handle
  and no model, and a start whose fiber ends at once, its keys read and reconciled by the engine on each new state. It
  runs the commands oldest first until none is pending, then applies each of the test's messages as a dispatch, and
  runs the commands again; it ends as a rehearsal ends, but fails on no command left, since none is once it returns.
  When the engine or one tool changes, keep the others in step.
  `src/testing/contract.test.ts` gives the same program and inputs to each tool and to the run; a difference found is a
  `test.failing` case there, which says how, and an item of `ROADMAP.md`, until it is fixed.
- **Windows of absence.** A test that checks that something does not happen awaits a witness where a correct run
  gives one: "it does not start again while its key stays" (`engine.test.ts`) awaits a command of the last state,
  which its job starts after its keys; and a dispatch returns having applied its message or not, so "a message a command
  sends as the run releases it does not reach update" (`run.test.ts`) checks it once the release has sent it, with no
  sleep. Where no correct run gives one, since what would signal the absence is what does not happen, the test sleeps
  once a signal it awaits has come, as `AGENTS.md` allows ("A test never rests on the clock"): of `engine.test.ts`,
  "takes the jobs one at a time, in the order of the states: none starts while the job before is held", where nothing
  tells that a later job has not started while a release holds the fiber of effects, and "the end stops the fiber of
  effects held by a release, which starts nothing after, nor any job it had not taken", where nothing of the program
  runs in it to tell when the end has stopped it; of `run.test.ts`, "a subscription dying in a scope of its channel lets
  no message apply as the channel releases", where a correct run applies nothing while the channel releases, "never
  succeeds: once every effect of the program has run and ended, it runs until it is interrupted", where nothing of the
  program is left to tell that the run has not ended, and "a release that never ends holds the next job, then the
  defects the run would die with, with no defect of its own", whose window is a day of a `TestClock`, with yields and no
  real time; "each call hears the next message, and the subscription waits between two of them" (`rehearse.test.ts`);
  "in the run, it is heard once to its end, under a key that stays, and again once its key comes back", and the tests of
  "a fiber of the test's that sends once the tool has ended" (`contract.test.ts`). The scheduler of the tests could await quiescence in their
  place, and does not, as "one thunk" says of every test of a check (`rejected.md`, "The checks").
