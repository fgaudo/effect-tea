# What a dispatch that applies at once left as it was: a review of the architecture

**Status:** proposed, 20 November 2026, by a review of the whole project that the owner asked for that day, made by a
session of Fable 5.2 at commit `3797b03`. Nothing was run: each part is reasoned from the code and the documents read.
Part 1 was taken by the owner the same day, on its spike ([`write-without-was.md`](write-without-was.md)); the others
are not decided. The steps that decide each part are in [`ROADMAP.md`](../../ROADMAP.md), in the order the
review advises. A part that is taken gets a record of its own, for its spike and its plan. A part that is refused
becomes an entry of [`rejected.md`](../rejected.md).

## What was read

- **Whole:** `src/` but its tests, `bridges/react.ts` and `bridges/snabbdom.ts`, `AGENTS.md`, `ROADMAP.md`,
  [`invariants.md`](../invariants.md), [`premises.md`](../premises.md), `rejected.md`, and four pages of the guide:
  "Guarantees", "Inputs the user types into", "Events and external messages" and "Structuring a program".
- **Through a summary that a second session made:** the other records of this directory. R1 and "Found there" of
  [`synchronous-dispatch.md`](synchronous-dispatch.md) were then read in its text.
- **Hardly at all:** the tests, `tools/`, and the examples but `examples/form`.
- **Nothing was run.** So each part below is a lead, as `premises.md` uses the word: its step turns it into a spike, or
  drops it. Where a part says "not found among the rejected", it was looked for in `rejected.md`, read whole, and in
  that summary of the records.

## The finding

The core is sound. `core.ts` is pure. Commands are data. A subscription's message is dropped by its start, with no
comparison of keys. And since a dispatch applies its message at once, the order of the messages rests on ECMAScript's
run to completion alone, and on nothing of Effect.

What is in doubt is mostly of one kind: a piece designed while a dispatch only queued its message, which the change of
20 November 2026 left with its form and without its reason. Parts 1, 2 and 4 are of that kind. Parts 3 and 5 are older
than that change, and the change did not make them worse. Part 6 follows from the others.

The order below is the order the review advises. Parts 1 to 4 change exports that no release has had, or remove ones
that a release has: they come before the release of 0.8.0, by the reason of R2 of `synchronous-dispatch.md`. Parts 5
and 6 change nothing a user writes.

## 1. A write without `was`

**Today.** A view writes `{ _tag: 'Written', was, value }`, where `was` is the value its model holds. `written`
(`src/input.ts`) stores the write when its place holds `was`, by `Equal`, and rejects it otherwise. The owner kept
`was` on 20 November 2026 (R1 of `synchronous-dispatch.md`): without it, a key typed between a state the program
changed and its draw would be stored over what the program put there, in a window of one refresh.

**Why it is in doubt.** R1 weighed what `was` saves. What it costs was found later, or was not weighed there:

- **The window is one bridge's.** The bridge to snabbdom draws a notice from a command or a subscription at the next
  animation frame. With React no such window is known, since a store read with `useSyncExternalStore` is rendered
  before the next event: reasoned, not run.
- **In that window, `was` chooses who loses.** It keeps the program's value and takes back the key. Stage 4 found the
  window at about 500 ms with the pane hidden ("Found there"), and what was typed in it was taken back.
- **It rejects writes that are not stale.** A source outside React that writes twice before a render has its second
  write rejected (`ROADMAP.md`, "Waiting for the owner"). A view that React draws from a deferred model
  (`useDeferredValue`) would write over an older value too: reasoned, not run.
- **It shapes the bridge.** The bridge to snabbdom draws in each handler only so that the next handler finds `was`
  current (the opening comment of `bridges/snabbdom.ts`). R1 calls the two one question.
- **It forbids a `set` that changes the value** ("Do not change the value in `set`"), and so a value that is normal
  in the state as it is typed.
- **Every view builds `Written` by hand**, with `was` from its model. Nothing checks it ("A view sends only what its
  model holds", in "Guarantees").
- **Two of the guide's three reasons no longer hold** ("Why what the user types is no message"). The second, that the
  screen may be older than the state, is the window itself. The third, that the view would build the message and no
  test would see it, is not kept today either: the view builds the write. The first stands: there is nothing to
  decide.

**Proposed.** The window is closed in the bridge, not in the protocol.

- **A write carries its value.** `written` stores it wherever its place is there, and a write of the value held leaves
  the very same value. A write to a place that is not there is rejected, as today.
- **The bridge to snabbdom lets no handler run on a view older than the state.** There are two ways.
  - It draws at every notice, with no animation frame, as React renders a store. The bridge loses its wait, its
    `noticed` and its animation frame. To measure: a subscription that sends more often than the screen refreshes.
  - Or it keeps the animation frame, and draws a notice not drawn yet before a handler runs, from a listener in the
    capture phase on its root, for each type of event its vnodes listen to. The handler then reads an element already
    given back the program's value, and writes that value: the outcome R1 wanted.

  The capture phase and its order are the DOM's specification, so neither way is a premise in the sense of
  `premises.md`.
- **`input` and `inputById` stay.** They are the one place where the rule of a write is applied: what is written is
  stored, and no `update` judges it.

**What it removes.** `was` and its comparison. "The view writes over the value its model holds", with its "Don't". The
limit "A write over a value that came back is stored". The draw in each handler as a rule of the bridge, under the
first way. And "Do not change the value in `set`", if the owner then allows it.

**What it changes of the guarantees.** "An input stores what is written over the value it holds" becomes: an input
stores what is written, where its place is there. "Outdated clicks are harmless" no longer covers a write typed over
an older screen. That no handler runs on one becomes each bridge's promise ("Writing a bridge"). A test that sends a
write over an old model through `Driver.dispatch` sees it stored.

**What it reopens.** R1. "A value changed as the library stores it" (`rejected.md`), whose probe sent its second write
before any draw. The first two of the "Three points of the guide that the swap left" (`ROADMAP.md`). It does not
reopen "A write that `update` sees and may reject": the review would keep it rejected, and names its price, which
stays: an undo at every write still needs a subscription keyed by the value ("Undo at every write of an input").

**What the spike must show.**

- Which way the bridge to snabbdom takes, with the measure of the first.
- The form of a write. `{ _tag: 'Written', value }` keeps the refusal of a write by its shape in `Rehearsal.hear`
  (`Heard` in `src/testing/rehearse.ts`). The value alone as `message` loses it, and `forwardTo(dispatch, 'Name')`
  is then a `Dispatch<string>`.
- By hand in Chromium, as stage 4 did, with both bridges: a text typed in its middle and over a selection while a
  subscription changes that very value, with the pane on screen and hidden; and with React, two writes before a
  render.
- Whether a `set` that changes the value is then shown at once, and where the caret goes.

## 2. The run as a store and its effects

**Today.** `run(program, render)` forks `render(app)` as a fiber of the run, with a scope, a root and a site of its
own. It races the end of that fiber with the death of the engine, and ends when the renderer ends (`running` in
`src/run.ts`).

**Why it is in doubt.**

- **All a renderer needs is synchronous** since a dispatch applies at once: `model`, `subscribe` and `dispatch`.
- **Three of the four renderers of the repository use the effect only to be handed the `App`, and then wait for
  ever**: `Host` in `bridges/react.ts` (`setApp`, then `Effect.never`), the example in the doc comment of `Draw`, and
  `drive`. Only `renderInto` of the bridge to snabbdom does work in it, the wait for an animation frame, which the
  first way of part 1 removes.
- **The engine is split this way inside already.** `Engine.make` builds what the thunk reads and writes with no fiber,
  and then forks the fiber of effects.
- **What a reader with an application in React meets first comes from it**: `Host` draws `fallback` until the run has
  started its renderer (`ROADMAP.md`, at the end of "Seven points of a review of the design").

**Proposed.** Two halves, and the first is no effect. The names are the spike's to choose.

```ts
const app = start(program, options) // synchronous: `init`, the first state and its keys, and no fiber
app.model()
app.subscribe(listener)
app.dispatch(message)
Effect.runFork(app.run) // an effect that never succeeds: it performs the jobs of the states, and dies of the defects
```

A renderer is then plain code that reads the handle. Whoever runs the program ends the run by interrupting `run`.
`run(program, render)` becomes a composition of the two, or goes: the review advises one way to start a program.

With it, **one wake for each dispatch**. The thunk keeps its jobs in an array, and wakes the fiber of effects once, as
the outermost `apply` returns, in a `finally`. A death recorded in the thunk completes `died` there too. This answers
points 1, 2 and 3 of the "Seven points of a review of the design" (`ROADMAP.md`) by construction. The end never begins
inside a step. The loop has its `finally`. And "writes first, offers last" is one line of the engine, not a rule of
every thunk that has no mutation.

**What it removes.** The renderer's fiber, with its scope and its root. `rendered` of `Engine.make` and `isModels` of
`run.ts`, if a model's defect is then recorded in one place. The race of `died` with the renderer. "The run ends when
the renderer ends". The renderer `drive` makes only to get the handle, and its `shown`. The relay of what a draw
throws in a handler (`thrown` and `wake` in `bridges/snabbdom.ts`). `fallback` of `Host`, which would draw the first
model as it mounts. And a server would read the first model from the handle.

**Open, for the plan.**

- An `init` that throws: there is no state to read. The start throws the `ProgramDefect`, or gives a handle that has
  died.
- A dispatch before `run` starts applies, and its effects wait: the state is ahead of its effects from the start. A
  dispatch after `run` has ended applies nothing, as today.
- `run` started twice on one handle. B5 says that StrictMode would then start no command of `init` twice. The review
  doubts it: React starts an effect, stops it and starts it again on one component, so the second `run` meets a
  handle whose first commands were interrupted, and a command is never started again. To try before anything is said
  of StrictMode.
- How a bridge reports a draw that throws outside a listener, as a view that throws when `renderInto` first draws.
- What "Nothing outlives what acquired it" and "Nothing ends in silence" say once the renderer is no fiber of the
  run.
- `drive` over the handle, with no renderer of its own.

**What it reopens.** "`run` split into a synchronous half and the fibers" (`rejected.md`, parked, B5). It was parked
because the first model is data a program gives already, and because a split is a second way to start a run. The
review's reason is another: the renderer as an effect has no use left but to hand over the handle, so the split would
be the one way, not a second.

## 3. External messages with a handler of their own

**Today.** A program's `external` names some of its messages, in its type alone: a property that no program has
(`Shape` in `src/program.ts`). A parent sends one with `children.<child>.update`. The child's `update` takes it as
any message, and a rejection of it is a `CompositionDefect` at run time (`tell` in `src/compose.ts`).

**Why it is in doubt.**

- **It breaks the second rule of the types** (`AGENTS.md`, "The types of a program keep three rules"): it compiles,
  and then dies by the engine's rules, where the types could have prevented it. "The child answers in every state" is
  a sentence of the guide, and nothing but that defect holds a child to it.
- **The subset in the type needs a row of checks**, each found by a hole: `ExternalAmong`, `ExternalTaken`,
  `ExternalPassed` with `Unsent` and `Unpassed`, and `ExternalWritten`. The entry "Checking a program's external
  messages in `make`" (`rejected.md`) was reopened in part twice, for an `external` that compiled everywhere and died.

**Proposed.** A program that names `external` gives a handler for it, apart from `update`:

```ts
make({
  // A `Step`, never a `Transition`: it cannot reject.
  external: (message, children) => (state) => step
})
```

- It is required exactly when the program names `external`, as `runCommand` is when it has commands.
- `ExternalOf` reads the type from that function, which every program with external messages has.
- External messages are no longer among the program's messages. So no view, command or subscription sends one: "which
  a handle alone sends" (`invariants.md`) holds by the types.
- A parent that passes one on does it in its own handler, by calling the child's handle. Nothing is routed by a tag.
- What stays a defect: an external message to a child that is not there, which depends on the state.

**What it removes.** The five checks above, the property in the type with `Unboxed`, the check of a rejection in
`tell`, most of "Precisely" in "Events and external messages", and what is left of that entry of `rejected.md`.

**What it costs.** A message that both the child's view and its parent send, as `BackPressed` in the guide, has two
entries that call one function. And a test of a program alone sends an external message by calling
`program.external(message)(state)`, not through a dispatch or `applyAll`.

**Open, for the spike.** The name of the handle's function, `update` today. Whether `make` still infers its children
and its own messages with one more function that takes its type from the signature, under each supported TypeScript
(`bun run inference`). What the declarations and the hovers print (`bun run smoke`). Not found among the rejected.

## 4. A run without logs of its own

**Today.** The run writes a debug log for each message, and for each subscription that starts, stops and ends. So a
job is offered for every message, one that stops, starts and commands nothing included (`applyOne` in
`src/engine.ts`). `ROADMAP.md` says that the jobs are most of what a message costs.

**Why it is in doubt.**

- **It is a name over a composition** ("A function earns its place", `AGENTS.md`). `onApplied` and `onIgnored` hear
  every message, and a queue with a fiber that reads it is what the doc comment of `onApplied` already shows, for a
  devtools bridge.
- **For the logs alone** there are two options (`describeMessage`, `describeCommand`), three sites of a defect
  (`'log'`, `'describeMessage'`, `'describeCommand'`), an invariant ("Logs never carry message data by default"), and
  the run's own use of a premise (a `Logger` is called in the fiber that logs).
- **The cost is paid by every program**, debug logs enabled or not.

**Proposed.** The run writes no log. A job is offered only for a step that stops or starts a subscription, or has
commands: the thunk decides it from the step alone. The guide shows the few lines that log from `onApplied`.

**What stays.** `describeByTag`, for the `on` of a defect and for what the testing tools say. `withExternalSpan` and
"Logs do not pile up in a span", which are of the program's own logs.

**What is lost.** Debug logs with nothing to write. The log of a message dropped before `update`, which no option
hears. And the logs of a subscription that starts and stops, which an option can still work out from the keys of the
two states it is given.

**What it reopens.** "A job for the fiber of effects only while debug logs are enabled" (`rejected.md`), which is
then decided with no reading of the log level. A release has had `describeMessage` and `describeCommand`, so their
removal has an entry of the changelog with its upgrade (`release`).

## 5. One engine under the run and the testing tools

**Today.** `rehearse` models both halves of the engine (E7 of `synchronous-dispatch.md`). `rehearse.ts`, `ledger.ts`
and `loop.ts` are as long together as `engine.ts`, `run.ts`, `core.ts` and `shell.ts`: some 1,180 lines against 1,150,
blank lines left out. Some 4,700 lines of tests keep the two in step, `contract.test.ts` among them.

**Why it is in doubt.** "The testing tools behave like the engine" is kept by hand. The pure half of a step is written
twice, in `applyOne` of `engine.ts` and in `apply` of `rehearse.ts`: point 4 of the "Seven points of a review of the
design" (`ROADMAP.md`), which proposes one transition of `core.ts` for both.

**Proposed.** A wider form than that point: one engine, generic in what performs a job.

- The run's performer forks fibers, as today.
- `rehearse`'s writes its ledger: it owes the commands, and answers its calls.
- `simulate`'s runs each command in line.

The thunk, the queue of the jobs and their order are then the same code for all three, and the sentence holds by
construction for the pure half. For it, the engine inside carries events, lets a tool apply a message as a
subscription's, and tells a hook of the thunk the whole step: the keys gone and those new, and what the message came
to. Those are not exported.

**Open, for the plan.** What of `ledger.ts` and `loop.ts` stays. Whether the contract's tests then pass as they are,
which is the proof. Whether the smaller form, the one transition, is enough. And two things that follow, each the
owner's to decide: whether `simulate` still earns its place beside `rehearse`, and whether `Shape` can leave the API
("`run`, `drive` and `rehearse` taking `Program<{ … }>` by name", `rejected.md`, which failed on how `rehearse`'s
signature was inferred).

`shared-core.md` weighed smaller forms: the guard alone, and a core for `rehearse` alone. This one was not found among
the rejected.

## 6. What the premises hold, and the peer range of Effect

**Today.** `effect` is a peer at `~4.1.4`. An application on a later minor of Effect cannot install the library until
a release of it. The reason is in `AGENTS.md`: nearly thirty premises of `premises.md` are read only in Effect's
source, and a minor may change them.

**Why it is in doubt.**

- **The owner decided on 20 November 2026 that the library is for others to adopt** ([`adoption.md`](adoption.md)).
  The tilde is then its highest price, and it was set before that decision.
- **Since a dispatch applies at once, no premise seems to hold the order of the messages.** What the premises hold is
  the effects and the end of a run: where a defect is told to have happened, in which order, and that an interruption
  the program makes is a defect. As far as the review read: the step checks it premise by premise.

**Proposed.**

- **Sort each premise by what falls with it**: a guarantee of the guide's "What you can rely on"; only the where or
  the order of a defect as a run ends; only what a testing tool does; only the scheduler of the tests.
- **Weigh each guarantee that rests on a premise.** The review would move the finest of them to "described, not
  promised", as the order of the defects is already: that a self-interruption inside a release, as the run stops the
  fiber, is a defect; and that two defects equal by `Equal` stay two.
- **Then weigh a caret**, `^4.1.4`, with the daily job (`.github/workflows/effect-latest.yml`), which already runs
  the premises' tests at a later minor, as the alarm.

**What it reopens.** "A flag for each fiber, in place of the mark on the run's interruptions" (13 November 2026),
whose one loss was that guarantee, and "Leaving 'Only the run, and whoever runs it, interrupt them' to the program"
(19 November 2026). The owner kept the guarantee both times. What is new since is the decision of adoption. It also
changes a rule of `AGENTS.md` ("The peer range is the patches of the Effect the library is developed with").

It comes after parts 2 and 5, which change which premises there are.

## Smaller points

- **"A view of the library's own"** (`ROADMAP.md`). The review advises to reject it. With part 1, a view builds no
  `Written` by hand. `messagesSentBy` finds the messages of a snabbdom view already. What is left is a view that takes
  no dispatch, so that `forwardTo`'s cache goes: a second product to keep, for that, and one that knows a renderer.
- **`invariants.md` names in prose the tests that `tools/mutations/mutations.ts` binds to each check.** The two lists
  drift: `ROADMAP.md` already names a premise whose test has not been there since `35fe18f`. The prose could keep the
  invariant and how it is kept, and leave the killers to the list, which a tool checks.
- **`init` means two things in the config of `make`**: the program's own without children, and a function of the
  children with them, "so the children declared decide" (`make` in `compose.ts`). To weigh: one form.

## What the review would leave as it is

`reject` and `defect`, and the one meaning of each. Commands as data, never cancelled. Keys, and a start that drops
what no longer applies. `Step`, `andThen` and `forEach`. A child's model kept by its state object, and so
`ObjectState`. `forwardTo` and its cache, while a view takes a dispatch. The bridges as entries of the package.
