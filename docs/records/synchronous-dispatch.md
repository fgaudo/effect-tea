# A dispatch that applies its message at once

**Status:** decided by the owner, 20 November 2026, and done that day. The owner decided the direction, after the
spike, and then every answer this plan proposed to the points left open ("The decisions"). The plan was written that
day by a session of Fable 5.2, on the owner's request, and read against the code at `88a3ae1`. Its stages are done,
each with its outcome under "The stages", the reader's check among them, and the spike of R4 was run and rejected.
What they left for the owner is in `ROADMAP.md`. Since the swap of stage 4 the code is in `src/` and `bridges/`:
`src/next/` and `bridges/next/`, which this record names, are gone.

This file has three parts: the plan; the proposal as `ROADMAP.md` held it before the plan; and the spike's record,
brought from the branch `claude/spike-sync-dispatch-b4e430` (at `26b2cc1`), which is never to be merged. The spike's
record holds the evidence: what was built, run and found, the checks taken out by hand, and what the guide and
`docs/invariants.md` would say. The plan calls it "the spike's record" and does not repeat it.

## What this plan rests on

**Read** for it: the spike's record, `docs/invariants.md` and `docs/premises.md`, whole, and the entries of
`docs/rejected.md` that the change reopens; `src/engine.ts`, `run.ts`, `shell.ts`, `core.ts`, `dispatch.ts` and
`input.ts`; `src/testing/drive.ts`, `rehearse.ts`, `loop.ts` and `ledger.ts`; `bridges/snabbdom.ts` and
`snabbdom-testing.ts`; and, of the spike, `src/sync/engine.ts`, `run.ts` and both bridges.

**Checked**:

- `Deferred.doneUnsafe` completes a `Deferred` synchronously, and is stable and documented in the declarations of
  Effect 4.1.4 (`node_modules/effect/dist/Deferred.d.ts`). So are `Effect.runSyncExit` and `Fiber.getCurrent`.
- The last release, 0.7.1, has `Dispatch<Message> = (message) => Effect<void>` and `Frame = { model, dispatch }`
  (`git show v0.7.1:src/dispatch.ts`, `src/run.ts`). The numbered dispatch, `seen`, `edited`, `drawn`, `Shown`,
  `shows`, `Shows`, `makeStore` and `Frames` were never released.
- `Driver.latest` is read by four tests, of `contract.test.ts` and `drive.test.ts`, and by nothing else in `src/`,
  `examples/`, `bridges/`, `tools/`, the guide or the README (a search).

**Counted by a search, by a delegated session (Sonnet 5.5), and not counted again**: 198 mutations, 128 of them of
files this change rewrites or removes (`engine.ts` 32, `run.ts` 6, `input.ts` 13, `dispatch.ts` 3, `rehearse.ts` 40,
`ledger.ts` 9, `loop.ts` 7, `drive.ts` 3, `bridges/react.ts` 13, `bridges/snabbdom.ts` 2). The tests of those files:
`run.test.ts` 94, `engine.test.ts` 32, `contract.test.ts` 109, `rehearse.test.ts` 74, `drive.test.ts` 19,
`input.test.ts` 46, the search 20, the bridges' suite 26, `react.test.ts` 34, `snabbdom.test.ts` 6. Fifteen of the
nineteen pages of the guide and four of the six of the tutorial name what goes, and so do the README, the skill, the
five reports of the API, the views of the eight examples, `tools/smoke/consumer.ts`, `tools/smoke/bridges.ts` and
`tools/bench/writes.ts`.

**Reasoned, not run**: every answer proposed below. No test and no spike was run for this plan.

## The decisions

The spike's record leaves seven points for the engine (E1 to E7) and six for the bridges (B1 to B6), and `ROADMAP.md`
added four (R1 to R4). The plan added three of its own (P1 to P3). E1 was taken first: a dispatch applies its message
at once. **The owner took every answer below as the plan proposed it, on 20 November 2026.** Each was reasoned, and
none was run: where an answer names something to check first, its stage checks it before it builds on it.

### The engine

- **E2. `dispatch` is a function**, `(message: Message) => void`, as spiked. A handler of any renderer calls it as it
  is, with no fiber made for each event, and effect code writes `Effect.sync(() => dispatch(message))`. An `Effect`
  would be read as a step that may wait, which this one may not.
- **E3. Neither premise is adopted.** The first goes with a synchronous `record` on `Deaths` (`shell.ts`):
  `Core.record` is pure already, and `died` is completed with `Deferred.doneUnsafe`. What the program throws in the
  thunk is then wrapped and recorded as plain code. No fiber is made for it, which also answers "a defect is recorded
  by a fiber made for it" (the spike's record, "The case against it"). Nothing rests on the second premise. The guide
  describes, and does not promise, that the end of the run may begin inside a dispatch.
- **E4. A dispatch sent while a message is being applied is accepted** as spiked: it is applied right after, before
  the outermost call returns. The promise of "View" is of a handler: when it returns, `update` has seen its message.
  The guide says who sends during a step: a renderer's listener, and code that a function of the program wakes.
- **E5. The effects may lag without a bound.** It is today's unbounded queue of messages, moved to the effects, and
  "What is left to you" says it. A step that held the next message until its job had started would need a dispatch
  that waits, which a function called in a handler cannot do.
- **E6. A model's defect is recorded where the model is read**, in `'render'`, once for each state, and the reader
  gets that `ProgramDefect`. The renderer's own site takes that very defect as it is (a `wrapped` given to
  `scopedIn`), so a renderer that reads the model in its own fiber is one defect. `model()` asks nothing of
  `Fiber.getCurrent`. A fiber of another site that dies of it is a defect of its own, as a fiber that dies of a
  defect another fiber recorded is today (the comment of `scopedIn`). Stage 1 writes the test first.
- **E7. `rehearse` models both halves.** A call that applies a message (`send`, a command's answer, a message
  `hearNext` hears) applies it in one thunk: `Core.arrive`, the state, and the keys of the ledger. Its stops and the
  commands it owes are a job for the rehearsal's loop, which becomes its fiber of effects. The call returns once its
  job is done, so each call is still whole for the test, and a call made while a release is held applies at once and
  waits behind it, as in the run. A start of `hearNext` is a job, so it waits for the stops before it. `hear` plays a
  key only once the job that starts it is done: no run hears a start that does not run yet. `drive` follows `run`,
  and `simulate` is expected to stay as it is. Stage 2 begins with a design note of these cases, reviewed before any
  code.

### The bridges

- **B1. The bridges follow**, as spiked: React's over `useSyncExternalStore` and controlled elements, snabbdom's with
  the comparison of the controlled prop.
- **B2. `onClick` and `onPress` go.** Each would be a name over a call (`AGENTS.md`, "A function earns its place").
- **B3. A value written past React's setter, and a form's reset, are left out**, and "What is left out" says so.
  Nothing is promised of a reset with React either: it works there by what React does not document (the fourth
  premise of the spike's record), and the contract stays as narrow as `adoption.md` decided.
- **B4. `Draw` and `Host`, as spiked.** The entry exports `View`, `Draw`, `Host`, `HostProps` and `Fork`.
- **B5. `run` is not split now**: parked. The first model, for a server or for `Host`'s `fallback`, is data a program
  gives already, `program.makeModel(program.init.state)`, drawn with a dispatch that does nothing (`rejected.md`,
  "`renderToString`"). A split is an export and a second way to start a run. The engine keeps what the thunk reads
  and writes free of fibers, as spiked, so a split stays possible. _Reopen if_ a first model must be drawn by `Host`
  itself, or a server needs the state after the commands of `init` have answered.
- **B6. `messagesSentBy` gives each listener an event whose `target` holds the vnode's `value` and `checked`.** It
  then finds the writes of a view without a DOM, each over the value its model holds, which today's cannot.

### The four of the roadmap

- **R1. `was` stays, and the snabbdom bridge draws a handler's message at once.** _Reversed on 20 November 2026 by
  [`write-without-was.md`](write-without-was.md): a write carries its value alone, and the bridge draws in a microtask
  after each notice. What follows is the decision as it was taken._ They are one question. A view takes
  `was` from the model it was drawn with. With `was`, a handler must find its view drawn from the current state, or
  its second write is rejected: so the bridge draws in each handler, and leaves any other notice to the next
  animation frame. Without `was`, a write carries its value alone and the bridge may draw at the next animation frame
  only. But a key typed between a state the program changed and its draw is then stored over what the program put
  there: the stale write that `registers.md` ruled out, in a window of one refresh. "Outdated clicks are harmless"
  holds of a write by `was` alone, so it stays. To check first, in stage 3: whether a browser calls a listener while
  a patch runs (a `focusout` as the focused element is removed). The spike's bridge would then patch inside a patch.
- **R2. 0.8.0 is not released before.** The unreleased section is the net change since 0.7.1, and what this change
  removes was never released (above). Released first, 0.8.0 would publish it for one release, and the next would
  break each export with an `Upgrade:` note. Not released first, those entries are edited away, and the version stays
  0.8.0, which is breaking already. What it costs: the fixed declarations wait for the whole change. In `ROADMAP.md`,
  the release comes after this item.
- **R3. "A view of the library's own" (`ROADMAP.md`) stays open, and is weighed again after stage 4.** Its first
  reason goes: no bridge settles an input. Its second is met in part by B6, for snabbdom. What is left of it is a
  handler that holds a message, and a view that takes no dispatch.
- **R4. The second step, an input as a value of the library's in the model, is weighed before stage 4, apart.**
  Stage 4 rewrites every view of an input, and would rewrite them twice otherwise. It is a spike over the code of
  stages 1 and 3, on the form and the stocktake, and then the owner's decision. It reopens "Handles of the inputs in
  `makeModel`" (`rejected.md`), whose cost "both bridges" is gone; a type of the library's in every model with an
  input is the cost that stays. Not taken, the views write `Written` by hand, as the spike's do. **The owner did
  not take it**, once it was spiked ("The spike of R4").

### What the plan adds

- **P1. The work is done on `main`, beside what is there, and swapped in one commit.** The new engine, the new tools
  and the new bridges are written in `src/next/`, `src/next/testing/` and `bridges/next/`, exported by nothing, with
  their tests and their mutations. Stage 4 moves them over the old files. So every stage is committed only once
  every check passes, stages 2 and 3 run at once on folders of their own, and each test is ported once. In place,
  `tsc` would fail for the whole repository from the first stage to the last, and no check could verify a stage.
  What it costs: until the swap the repository holds two engines, `bun run test` runs both, and the guide and
  `docs/invariants.md` describe the old one. The other way is a branch the owner names, in place, checked only at
  its end.
- **P2. `Driver.latest` goes with `Frame`.** In its place: `Driver.model`, an `Effect<Model>` as `Rehearsal.model`
  is, and `Driver.dispatch`, the run's own, for a tap on a model that has moved on.
- **P3. The premises.** Dropped: an unbounded `Queue` waking its taker through the scheduler of the run, a
  `Stream.map` after `Stream.buffer`, React's two (`flushSync`, an uncontrolled `<input>`), and snabbdom's module of
  listeners. New, and agreed to by the owner on 20 November 2026: a controlled input keeps what is typed, its caret
  and its selection when a store read with `useSyncExternalStore` is updated during its `onChange`. react.dev states
  it of a state variable, not of a store. The spike saw it in happy-dom and in one browser; its test is the bridge's,
  in `react.test.ts`. With E3 and E6, Effect brings no new premise.

## The stages

Each stage is one session of Opus 5.5 at `high`, briefed by a session of Fable 5.2, which verifies its diff, runs its
checks again and commits on `main`. A session commits nothing. Each begins with
[`change-engine`](../../.agents/skills/change-engine/SKILL.md), and from the spike's files, read from its branch:
they are a reference, and nothing of them is merged.

### 0. The decisions

Done, 20 November 2026. The owner took every answer above, and the commit that says so brought the spike's record to
`main`, below this plan, so that the branch is no longer the one place that holds it. No code.

### 1. The engine and the run, beside

**Where.** `src/shell.ts` (the synchronous `record`, and `wrapped` for `scopedIn`), `src/next/engine.ts`, `run.ts`
and `dispatch.ts`, their tests, `src/next/interleaving.test.ts`, `tools/mutations/mutations.ts`, and the scripts of
`package.json` (`test` leaves both searches out, `interleavings` runs both).

**What differs from the spike.** E3 and E6. Each check of the table of the spike's record gets a mutation and a
killer that fails alone. Of the four that no test killed: the order of the listeners after the job and after the
keys goes, and the guide will say only "once the new state is current"; the fiber of effects stopped first at the
end has no mutation, as the loop's stop has none today, and `docs/invariants.md` says why; "one fiber of effects,
its jobs in order" gets a deterministic test, with a gate. What a message costs through the thunk is measured
against today's loop, by hand, and reported: the spike did not measure it.

**Not yet.** The doc comments of what will be exported, which follow sections the guide does not have yet
(`bun run comments` would fail on them), and the guide itself. `docs/invariants.md` says in one sentence that
`src/next/` holds the engine of this record, not described there yet.

**Done when** `typecheck`, `lint`, `test`, `test:node`, both searches and `mutations` pass, and the points where
another fiber can run between a check and its act are listed in the session's report (`change-engine`).

**Done, 20 November 2026**, by a session of Opus 5.5, and run again by the session that briefed it: `typecheck`,
`lint`, `test:node` (755), both searches (41 properties, three runs) and `mutations` (248, 50 of them new) pass.
`bun run test` passes (963) but for two tests of a probe left in `scratch/`, which git ignores: they fail the same at
`a95d353`, run on a copy of it. What the stage settled beyond the plan, each with a test and a mutation:

- **A listener's site, and the renderer's release, take a model's defect as it is too.** E6 named the renderer's
  fiber. A listener is called in `'render'`, in the thunk, and a renderer may read the model there: a model that
  throws would be two defects for one throw otherwise.
- **The killer of "the renderer's site wraps again the defect a model recorded" reads the model as the renderer
  acquires what it draws on**, where nothing interrupts. Read plainly in the renderer's fiber, the mutant survives:
  the end begins on the stack that records the defect, and its interruption takes the place of the renderer's second
  death. The plain test stays, and kills nothing.
- **`Deaths.recorded` calls the synchronous `record` in its cleanup.** `Deferred.succeed` is `doneUnsafe` in an
  `Effect.sync` in Effect 4.1.4 (read in its source), so what runs there is what ran before.

Measured by the stage's session, by hand, and not again: about 200,000 messages a second through today's loop, about
270,000 through the thunk and its jobs, and about 2,000,000 through the thunk alone, which is what a dispatch costs
its caller (a counter, no subscription, Bun 1.4.5 on Windows). Left open, for stage 4 or before:

- A job is queued for each message, its logs included while debug logs are off: most of the new engine's time.
- The loop of the thunk resets `applying` with no `finally`. Nothing in it throws today; what did would leave the
  engine applying nothing, in silence.

### 2. The testing tools, beside

**Where.** `src/next/testing/`: `drive.ts`, `rehearse.ts`, the ledger and the loop where they change, their tests and
`contract.test.ts`, and their mutations. Starts once stage 1 is committed, and runs beside stage 3.

**What.** First the design note of E7, with its cases: a message applied while a release is held; a message of a key
whose start is logical and does not run yet, dropped; `hear` on such a key; what `pending` shows before a job is
done; where a model is made and where its defect is recorded. Then the code. The contract restates each case of
`seen` and of the frames, inverts "the next message waits for the slowest release", and adds the first two cases
above, given alike to the run and to each tool. P2.

**Done when** the same checks pass, with no `test.failing` left in the contract, or each one listed in `ROADMAP.md`
with what it says.

**Done, 20 November 2026**, by a session of Opus 5.5, from a design note that the session that briefed it reviewed
before any code, and run again by that session: `typecheck`, `lint`, `test` (1,279), `test:node` (982), both searches
and `mutations` (307, 59 of them new) pass, with no `test.failing` in the contract. `ledger.ts` and `simulate` did not
change, and are imported from `src/testing/`. How E7 was built:

- **A call applies its message in one thunk, in the fiber that makes it**: the end, the register, `update`, the
  state, the keys, the ledger's hearings and the model, and its job offered last. The loop is the fiber of effects: a
  job stops the starts whose key went away, by their start, kept in a `FiberMap` as the engine's are, tells the calls
  that waited on them, and owes the step's commands. A call returns once its job is done.
- **`hear` waits for the job that starts its start**, then looks its key up again: a key that is not in the current
  state then fails the test, as it does today, so that no call gives `arrive` a message to drop. The note proposed a
  silent drop, and the review changed it.
- **Every `hearNext` is a job**, and its key is looked up at the call: one whose key goes away before its job fails as
  stopped, told after the job that stops its start, and starts nothing.
- **Jobs after a death run whole**, as the engine's do, and each call checks the register in its own thunk.
- **`drive` begins its scenario once its renderer has the handle**, so that `Driver.dispatch` is the run's from the
  first step, and its run is forked without `startImmediately`. `Driver.model` fails with the defects after one.
  `send` selects and sends in one thunk: the review made it so, where it sent once the wait had returned.

Left for stage 4: `docs/premises.md` names `FiberSet.run` for the subscriptions of `rehearse`, now kept in a
`FiberMap`, and `startImmediately` for `drive`, which no longer rests on it; the guide's "Messages that arrive
together" is inverted; and nothing says yet that `Driver.waitFor`, after a defect of a later model, may match the
model read before it, though `drive` still ends with the defect first.

### 3. The bridges, beside

**Where.** `bridges/next/react.ts`, `snabbdom.ts` and `snabbdom-testing.ts`, the suite they share and their tests,
their mutations, and `bridges/tsconfig.build.json`, which leaves `next` out until the swap. Starts once stage 1 is
committed. The premise of P3 joins `docs/premises.md` here, with its test.

**What differs from the spike.** The check of R1 first, and the guard it asks for, if any. B3 and B6. The checks that
no test killed (a model's throw in a handler, a removed element forgotten, a death after unmount) each get a test or
go. A test says where `makeModel` runs under `Draw`: React may read the model in the notice itself, on the sender's
stack, and "What is left to you" must say where a slow one is felt. `bridges/next/snabbdom.ts` has the regions the
guide's "Writing a bridge" will include.

**Done when** the same checks pass. A real browser is "The bridges in a real browser" of `ROADMAP.md`, as it was.

**Done, 20 November 2026**, by a session of Opus 5.5, its code read by the session that briefed it, which ran the
checks again: `typecheck`, `lint`, `test` (1,279), `test:node` (982), both searches, the build and `mutations` (333,
26 of them new) pass. What it found and settled:

- **R1: a listener can be called while a patch runs, so the guard is in.** Chromium 156 calls `blur` and `focusout`
  inside `removeChild` of the focused element, against the HTML Standard, by which a removal fires no focus event.
  happy-dom 21 follows the standard. And `focus()` fires them synchronously, by the standard, as an `insert` hook that
  focuses an element does inside a patch. So a draw asked for while a patch runs waits for it, and the patch under way
  draws again once it is done. Without the guard the inner patch meets a tree that no longer matches the page, and the
  run dies in `'render'`. Its test reaches the guard through `focus()`, since happy-dom fires nothing on a removal.
- **React reads the model in the store's notice itself**, to compare, so `makeModel` runs on the stack of whoever sent
  the message, under React as under snabbdom, and not again in the render. No page of react.dev says it. Nothing of
  the bridge rests on it, and a test holds it. The owner decided the same day: it is described, in "What is left to
  you", and not promised, and it is no premise.
- **One `catch` for what a handler's draw throws** with snabbdom, the view's or `makeModel`'s, handed to the
  renderer's fiber, which dies of it at once. A defect of `makeModel` is still one: the one the run recorded.
- **B3**: no test of a form's reset, nor of a value written past React's setter. The test of a text field that strips
  line breaks stays: it holds what "What is left out" will say of a value the element changes by itself.
- **The premises**: P3, with its test, and the two of snabbdom that the new bridge rests on, in `docs/premises.md`
  beside those of the bridges it replaces, which stay until the swap.
- **The regions** of `bridges/next/snabbdom.ts`, for the guide's "Writing a bridge": `controlled`, `draw`, `wait`,
  `dispatch` and `handle`.

Left open: a handler of a snabbdom renderer that was interrupted while its run goes on, as one of two renderers an
application races, still applies its message and patches the root it drew last. And the release of the bridge's
subscription to the handle has no killer: the run stops the engine before the renderer, so no notice comes after.

### The spike of R4

Once stage 3 is committed: a spike over stages 1 and 3, on a branch, never to be merged, of the form and the
stocktake with an input as a value of the library's in the model. Its record goes in this file. The owner decides
before stage 4.

**Spiked, 20 November 2026**, by a session of Opus 5.5, on the branch `claude/spike-input-in-model`, at `17534ff`. Its
record is a file of its own, [`input-in-the-model.md`](input-in-the-model.md), as it was written as one: `make` gives
`makeModel` an `Entry` of each input, with its value and its route, and a view writes
`dispatch(write(model.name, text))`.

**Rejected by the owner the same day**, on the advice of the session that briefed it. It buys little that the types
and the tests of a program do not give already, and it costs a type of the library's in every model with an input, a
third parameter of `makeModel` and a second weak cache, looked up in every `makeModel`. So the views of stage 4 write
`Written` by hand, as those of stage 3's tests do. `docs/rejected.md` has the entry, "An entry of each input in the
model, which a view writes through", with what would reopen it.

### 4. The swap

Three sessions at once, in the one checkout, each on files of its own. One commit, since the guide, the invariants
and the changelog change with the code they describe (`change-engine`, "In the same commit").

- **The code.** `src/next/` and `bridges/next/` move over the old files, whose tests and mutations go. `input.ts`
  keeps `Written` and `written`: `Shown`, `edited`, `drawn`, their tests and their 13 mutations go. The two indexes;
  the views, the mains and the tests of the eight examples (`together.ts` goes if two renderers over one handle need
  no helper); `tools/smoke/consumer.ts` and `bridges.ts`; `tools/bench/writes.ts`, rewritten or removed; the scripts
  of `package.json`; the five reports of the API. It follows [`change-api`](../../.agents/skills/change-api/SKILL.md)
  and [`add-example`](../../.agents/skills/add-example/SKILL.md).
- **The guide, and what follows it.** "View", "Guarantees", "Running", "Writing a bridge", "Inputs the user types
  into", the glossary and the other pages that name a frame; the tutorial; the README, with its quick start run; the
  examples' README; the skill; every doc comment and its `@see` lines. One section at a time, each sentence against
  the old one (`AGENTS.md`): the spike's record lists the sentences that become untrue, and how each would read.
- **The repository's documents.** `docs/invariants.md` and `docs/premises.md`. `docs/rejected.md`: the entries this
  supersedes ("A dispatch never runs `update` on the caller's stack", "A frame of the very same model taken at
  once", what "An input as a `Field`" and "Frames a bridge skips" say of `seen` and of frames), and what this plan
  refuses or parks (E2's `Effect`, the two premises, a bound on the lag, B5). The status of `registers.md` and
  `hosted-react.md`. The skills that name what is gone. `CHANGELOG.md`: the unreleased section again, as the net
  change since 0.7.1. `ROADMAP.md`. The sentences of `AGENTS.md` that change ("Running a dispatch needs no services
  and completes synchronously", "Frames cost only what is drawn", what `input.ts` is) are proposed to the owner, old
  and new, and not written before the owner's yes.

**Done when** `typecheck`, `lint`, `test`, `test:node`, `interleavings`, `mutations`, `comments`, `build` with
`api --check`, `smoke` and the site's build pass, and the form and the stocktake were tried in a browser with keys
sent as a user's: a text typed in its middle, its caret, a save.

**Done, 20 November 2026**, by three sessions of Opus 5.5 at once in the one checkout, and two forks of the first for
the old tests of the run and of the engine. The session that briefed them read their reports and their diff, and ran
the checks again: `typecheck`, `lint`, `test` (913), `test:node` (713), the search three times (21 properties),
`comments`, `build`, `api --check`, `smoke`, the site's build and `mutations` (217) pass. What it found and settled:

- **The code moved as it was reviewed.** Compared file by file, each file of `src/next/` and `bridges/next/` differs
  from its place in `src/` and `bridges/` by its imports and its doc comments alone. `engine.ts` holds `Origin`,
  `Applied`, `Ignored` and `RunOptions` too. `core.ts`, `shell.ts`, `compose.ts`, `log.ts` and the testing tools that
  did not change held nothing that the old code alone used.
- **The old tests** are accounted for in the sessions' reports, by `describe` or by test: ported under their names
  where they still apply, gone with a decision of this record where they do not. `run.test.ts` went from 94 tests to
  122, and the search from 20 properties to 21.
- **The mutations** went from 333 to 217. The 116 of the files replaced go: 10 of `input.ts`, not 13, since three are
  of `written`, which stays. Those of the `next` files take the plain names.
- **The examples**: no program changed. Each view draws controlled elements and writes by hand, and `together.ts` is
  gone, since two renderers over one `App` are an `Effect.all` of two renderers.
- **The premises** that went, each with its test: the unbounded `Queue`, whole, since `Queue.offerUnsafe` is
  documented and nothing rests on how a taker is woken; `Stream.map` after `Stream.buffer`; React's two of
  `flushSync` and its uncontrolled `<input>`; snabbdom's module of listeners. `startImmediately` stays, for `simulate`
  and the tests.
- **A sentence of the guide had no test**: "One that interrupts the fiber of a command, of a subscription or of the
  renderer is a defect of that command, subscription or renderer" ("Guarantees"), written as the spike's record said
  it would read. Run by the briefing session, it holds for each of the three, and `run.test.ts` has the tests now ("an
  update that interrupts the fiber it runs in is a defect of whoever sent its message").
- **In a browser**, Chromium, with keys sent as a user's. The form, with snabbdom and with React: a text typed in its
  middle, and over a selection, keeps its caret and its focus, each renderer shows what was typed into the other, and
  a save disables both fields, lists the name and empties them. The stock-take: a count typed in its middle keeps its
  caret, and a submit locks the counts and shows its outcome. No error on the console.

Left by the swap, each in `ROADMAP.md`: three points of the guide for the owner; a test of the timer's buttons that no
mutation tried makes fail; and, for the review of the premises before a release, that no test of a premise was run
again without its premise under the new engine. The seven sentences of `AGENTS.md` that the swap made untrue were
proposed to the owner, and written the same day on the owner's yes: what a dispatch is, a model made only when it is
read, what `input.ts` and `loop.ts` are, and three wordings that named frames, the loop or `Shown`.

### 5. After

A reader's check of the documentation ([`guide-reader`](../../.agents/skills/guide-reader/SKILL.md)). Then, in
`ROADMAP.md`, the release of 0.8.0, with its review of the premises in a session that wrote none of this, and "The
bridges in a real browser", with what this leaves it: an IME composition, and what is typed with snabbdom between a
notice and its draw.

**The reader's check is done, 20 November 2026**, by a session of Opus 5.5 that wrote none of the documentation, as
`guide-reader` says: two readers that had not seen the code, one from the package and one from the guide alone, each
built a greenhouse panel, and an examiner that had not seen the library wrote 27 acceptance tests from the requirement.
Both programs pass the 27, once seven of the tests were fixed: each of the seven checked the world at the moment the
page showed the new state, where the state is ahead of its effects. The session that briefed it read its report, and
ran `comments`, `lint`, `typecheck` and the site's build again. What it showed:

- **What the new pages taught with no guess and no slip**: a handler that calls `dispatch` itself, a controlled element
  written over the value its model holds, a write over an older value rejected, a key that comes back listened to
  anew, the `App` with its `subscribe` and its `model`, and when the bridge to snabbdom draws.
- **Neither reader missed the "Precisely" of "View"**, which went with the frames.
- **Neither reader called `dispatch` outside a view**: both took a key pressed anywhere as a subscription to a
  service. So no reader relied on what is true when a dispatch returns, outside a handler of a view.
- **One page changed**, with the same promise: "Testing tools", "drive", names `waitFor`, which the guide never named.
- **Four findings wait for the owner** in `ROADMAP.md`, since each changes what a page promises or adds a page:
  `renderInto` replaces `root`, where its doc comment, written by the swap, says that it draws into it; what the
  bridge to snabbdom draws of a vnode's data; a subscription from an API of callbacks; and what is drawn outside the
  root.

## What may go wrong

- **`rehearse` is reasoned only.** No spike modelled the two kinds of key. If the design note of stage 2 finds no
  simple form, the stage stops there and the owner is asked.
- **The swap is one large commit**, written by three sessions in one checkout. The code is moved first, so that the
  other two write against names that exist.
- **The program runs on the stack of whoever sends.** A slow `update`, `makeModel` or listener holds the event that
  sent the message. The guide says so, and nothing bounds it.
- **With snabbdom, what is typed between a notice and the next animation frame is rejected and taken back.** One
  refresh on a page on screen (the spike's record, "Found there"). Whether a draw before the key closes it is for
  "The bridges in a real browser".
- **React's premise is seen in happy-dom and in one browser.** An IME composition was never run.
- **Two engines until the swap.** Nothing is released meanwhile, and a fix of the old engine in those weeks is made
  twice.

## The proposal, as `ROADMAP.md` held it

Moved here from `ROADMAP.md`, where it stood under "Waiting for the owner" at commit `88a3ae1`, before the plan was
written. Its "item 1" is the release of 0.8.0, and its "item 4" the view of the library's own.

- **Whether a dispatch applies its message at once.** Proposed on 20 November 2026 by a session of Fable 5.2, asked
  how to settle the bridges with a free hand over the premises, the invariants, the API and the goals. Spiked
  since (below), and nothing of it is on `main`. The owner took the direction the same day, after the spike, and asked
  for a plan of the implementation: the next step is that plan, not written yet.
  - **The diagnosis.** A dispatch only queues its message, and `update` hears it later, in the run's fiber (the guide,
    "View", "Sending only hands the message to the run"). An element with a value of its own needs the state to change
    during its event: React's documentation says that a controlled input updates its value synchronously in `onChange`
    (react.dev, `<input>`, "Caveats" and "My input caret jumps to the beginning on every keystroke", read that day).
    What the library has for the element of an input follows from that one premise: `seen`, the number a dispatch
    returns, a frame for each dispatched message, `Shown`, `edited`, `drawn`, `Shows` over an uncontrolled `<input>`,
    and bridges that settle a native text field alone.
  - **The proposal.** When a dispatch returns, `update` has heard the message and the state is the new one. The pure
    half of a step is one synchronous thunk; its effects (the subscriptions stopped and started, the commands started,
    the logs) follow in a fiber, in the order of the states. A renderer is given the current model, a notice of each
    change and the dispatch, and no stream of frames: it draws a widget as its own documentation says a controlled one
    is drawn, a text field, a select, a checkbox or a component of a library alike. `input`, `inputById` and `Written`
    stay, as the program's own. Gone: `edited`, `drawn`, `Shown`, `Frame.seen`, the numbered dispatch, `Shows`,
    `shows`, the bridges' handlers, and what the guide promises of an element.
  - **What it changes of "Guarantees".** The next message no longer waits for the slowest release: the effects of the
    next state do, so a key that comes back still finds its old subscription released. "A handler returns before
    `update` has seen its message" is reversed. A message of a stopped subscription is dropped by its start, as today.
  - **Run first**, in `scratch/sync-store/probe.test.ts`, outside git and not kept, on happy-dom with React 19.3.1 and
    Bun 1.4.5, a program with three inputs drawn as controlled elements through `useSyncExternalStore`. With its
    `update` applied in the dispatch: a text field keeps what is typed in its middle, and its caret; a select and a
    checkbox hold. With the same `update` applied a microtask later, and with `run` as it is, drawn by `Frames`: React
    takes back what was typed as the event ends, then shows it with the caret moved to the end.
  - **Spiked**, the same day, by a session of Opus 5.5, in two phases, on the branch
    `claude/spike-sync-dispatch-b4e430` (cut from `ee45648`, at `26b2cc1`), never to be merged. Its record is on that
    branch alone, `docs/records/synchronous-dispatch.md`: read it there, with what the guide and `docs/invariants.md`
    would say. Additive, in `src/sync/`, `bridges/sync/` and `examples/sync/`. Run again by the session that briefed
    it: `typecheck`, `lint`, `bun run test` (1,013), `bun run test:node` (736), and the search ported to the new run
    (21 properties, four runs, no lead).
    - **The engine**, about 330 lines where `engine.ts` has 445, with `core.ts` and `shell.ts` unchanged: every
      guarantee restated holds, with no `test.failing`.
    - **The bridge to React**: 69 lines of code where `bridges/react.ts` has 192, five exports where it has eleven:
      `Host`, and `Draw` over `useSyncExternalStore`. A text field, a textarea, a select, a checkbox, a range, a
      component with state of its own, `memo`, Suspense, a portal and a shadow root pass. Six of the nine premises of
      `hosted-react.md` are gone.
    - **The bridge to snabbdom is no simpler**: 106 lines of code where `bridges/snabbdom.ts` has 91. It compares each
      controlled prop with the element after a draw, draws a handler's message at once, and draws any other notice at
      the next animation frame.
    - **In the built-in browser of the desktop app**, on the spike's page of the form, with keys sent as a user's: both
      fields keep what is typed in their middle, and the caret, and Save empties both. An IME composition was not run.
  - **What the spike found against it.**
    - `update`, the options and the renderer's listeners run on the stack of whoever sends the message.
    - The end of the run may begin inside a dispatch: a waiter on `died` resumes on the stack that records the defect.
    - The effects may lag behind the state without a bound, and a dispatch sent while another is applied returns
      before its message is applied.
    - Two premises read only in Effect's source are flagged, and neither is adopted: the first goes with a synchronous
      `record` in `shell.ts`, and nothing rests on the second.
    - A view takes `was` from the model it was drawn with, so a second write before a draw is rejected. That is why
      the snabbdom bridge draws in each handler, and why, with React, a source outside React that writes twice before
      a render loses its second write.
    - React sends no `onChange` for a value that a script writes past its setter, and a form's reset is still left out
      with snabbdom.
  - **A second step, apart**: an input as a value of the library's in the model, its value and its name together,
    which a view writes with `dispatch(write(model.name, text))`. It reopens "Handles of the inputs in `makeModel`"
    (`docs/rejected.md`): with no bridge that settles an element, its cost there, "both bridges", is gone. The spike's
    views build `Written` by hand in each handler, which this would end.
  - **To decide, in the plan**: the seven points the record leaves for the engine and the six for
    the bridges; whether `was` stays once a dispatch applies at once, and when a bridge to snabbdom draws, which the
    spike shows to be one question; whether 0.8.0 (item 1) is released before, since it would publish the entries and
    the exports that this removes; and item 4, whose first reason, that no user writes the part of a bridge that
    settles an input, would be gone.

## The spike's record: an engine in which a dispatch applies its message at once

As its branch held it at `26b2cc1`, with its headings one level down. Where it says "not decided" and "the owner has
not agreed", that was so when it was written: the decisions are above.

**Status:** a spike of 20 November 2026 by a session of Opus 5.5, in two phases, the engine and the bridges ("Phase 2",
at the end), on the branch `claude/spike-sync-dispatch-b4e430` cut from `ee45648`, never to be merged. Read against the
code at `ee45648`. Nothing existing changed behaviour: the spike is `src/sync/`, `bridges/sync/` and `examples/sync/`,
beside what is there, and nothing of it is exported. Not decided.

**Two premises read only in Effect's source are flagged here**, as the rule of `docs/premises.md` asks, and neither is
adopted: the owner has not agreed to them. Each has a test of the spike's own (`src/sync/premises.test.ts`), seen to
pass, never in `test/premises.test.ts`.

1. **`Effect.runSyncExit` called inside a running fiber leaves that fiber the current one when it returns** (the
   `finally` of `runLoop` restores the fiber it found). The engine records a defect thrown in its thunk with a fiber
   of its own, run synchronously in whatever fiber sent the message (`recordThrown`), and `model()` then asks
   `Fiber.getCurrent()` whether it runs in the renderer's fiber. Without it, a model read in the renderer's fiber
   after a defect was recorded in the same call would be recorded twice. No test of the engine reaches that case.
2. **A fiber waiting on a `Deferred` resumes on the stack of the fiber that completes it, before the completion
   returns**, when it is not on that stack already. The engine does not rest on it: the thunk is correct either way.
   It is listed because it is what a program meets: a waiter that `onApplied`, a listener or the register of deaths
   wakes runs inside the thunk, before the step is done, and the end of the run may begin there (below, "The case
   against it").

### Context

Today a dispatch queues its message, and `update` hears it later, in the run's fiber (`src/engine.ts`: one loop over
one `Queue`). An element with a value of its own (a text field, a select, a checkbox, a component of a library) needs
the state to change during its event: a controlled input must update its value synchronously in its handler. So the
library grew a rule for the element of an input (`seen`, the number a dispatch returns, a frame for each dispatched
message, `Shown`, `edited`, `drawn` in `src/input.ts`), and its bridges settle a native text field alone. A probe by
the session that briefed this one (Fable 5.2), in happy-dom with React 19.3.1, found that a controlled text input keeps
what is typed and its caret when `update` is applied inside the dispatch, and loses both when it is applied a
microtask later or by `run` as it is.

The proposal spiked here: when a dispatch returns, `update` has heard the message and the state is the new one. The
pure half of a step is one synchronous thunk; its effects follow in a fiber, in the order of the states. A renderer is
given the current model, a notice of each change and the dispatch, and no stream of frames. `input`, `inputById` and
`Written` stay as they are.

### What was built

Five files under `src/sync/`, and one line of `package.json`:

- **`src/sync/engine.ts`**, about 330 lines. `make` takes what `Engine.make` takes and returns `current()`,
  `subscribe(listener)`, `dispatch(message)`, `died`, `deaths`, `report` and `stop`.
  - `apply(message, source)` is the one entry for a dispatch, a command's answer and a subscription's message, from
    whatever fiber or callback. It pushes the message to `pending`, and, unless a message is being applied already
    (`applying`), applies the pending messages one at a time, in order, until none is left or the end has stopped the
    engine (`stopped`, checked once before each message, the one check of the end), and drops what is left.
  - `applyOne` is the thunk: `Core.arrive` (the check of a death and of the message's start, then `update`), then
    `onIgnored` or `onApplied`, then the new state, then `Core.reconcile(active, subscriptions(state))`, which makes
    the keys the engine holds true of the current state at once; then it queues a job for the fiber of effects, and
    tells the listeners last. A rejected message and the very same state tell no listener and reconcile nothing.
  - What a function of the program throws in the thunk is recorded where it happened (`attempt`, then `recordThrown`,
    which runs `Effect.sync(throw).pipe(diesIn(where, details), deaths.recorded)` with `Effect.runSyncExit`), so that
    its `ProgramDefect` has the site and the fields `diesIn` gives today. It is never thrown to whoever sent the
    message, and the step stops there: a defect of `update` changes nothing, one of `onApplied` leaves the state as it
    was, one of `subscriptions` leaves the new state with the old keys and queues no job, one of a listener is in
    `'render'` and the other listeners are still told.
  - The fiber of effects takes the jobs in order. For each: the step's own debug logs, written first as the loop
    writes them today; the starts whose key went away, stopped together with the run's mark (`stopping`) and awaited;
    the keys that appeared, started with `FiberMap.run`; the step's commands, started with `FiberSet.run`. Forks
    follow "one thunk" as `engine.ts` does: the fiber of effects is forked and assigned in one region nothing
    interrupts; each command and subscription is `scopedIn`, `rootedIn` and `recorded` as today. The first state's
    keys and its job run in the fiber that makes the engine, as today.
  - The end: `stop` sets `stopped`, then interrupts the fiber of effects with the mark and waits; the finalizer then
    stops every other fiber at once and reports, as `engine.ts` does.
- **`src/sync/run.ts`**, about 120 lines: `run` and `runWith`, with `running`'s lifecycle, scopes, deaths and order of
  its end unchanged, and a renderer `(app: App<Model, Message>) => Effect<void, never, RR>`. `app.model()` is the model
  of the current state, made when read, kept in one slot by the identity of the state, a failure of `makeModel` too.
  `app.subscribe` and `app.dispatch` are the engine's.
- **`src/sync/engine.test.ts`** (23 tests), **`src/sync/run.test.ts`** (15) and **`src/sync/premises.test.ts`** (2),
  which `bun run test` and `bun run test:node` run.
- **`src/sync/interleaving.test.ts`**, the search ported, which `bun run test` leaves out (its `--path-ignore-patterns`
  names it, the one line of `package.json` changed, beside a script): run apart with `bun run interleavings:sync`, which
  is `bun test ./src/sync/interleaving.test.ts`.

Nothing of `src/core.ts` or `src/shell.ts` changed: both are used as they are.

### What was decided where the brief asked

- **A defect of `makeModel` when `app.model()` is read outside any fiber** is recorded there, in `'render'`, as
  `recordThrown` records one, and the reader gets that `ProgramDefect`, thrown; a second read of the same state throws
  the same one, recorded once. Read in the renderer's own fiber (`Fiber.getCurrent()` is that fiber), the raw error is
  thrown instead, and the renderer's `scopedIn` records it in `'render'`, as a defect of `makeModel` in a frame the
  renderer pulls is recorded today: one defect, never two. Read in another fiber, it is recorded and then that fiber
  dies of it too, wrapped by its own site if it has one: two defects for one throw, a case no test reaches. Tests:
  "a makeModel that throws, read outside any fiber, is recorded in render, and the reader gets the defect", "… read in
  the renderer's fiber, is one defect in render" (`run.test.ts`).
- **A listener that throws** is a defect in `'render'`, recorded in the thunk, and never reaches the fiber that sent
  the message: "a listener that throws on a command's answer dies in render, and the command ends as it should"
  (`engine.test.ts`, `run.test.ts`).
- **Jobs still queued when a fiber dies are run until the end stops the fiber of effects**, as a step under way goes
  on whole today: "a step applied before the first defect goes on whole: its commands still start"
  (`engine.test.ts`). A job the fiber of effects has not taken when the end stops it starts nothing: "the end stops
  the fiber of effects held by a release, and a job it had not taken starts nothing". When the fiber of effects dies
  itself, of a `Logger` that throws, the jobs after are not run, as the loop runs no step after its own death today.
- **`dispatch` is a plain function.** An `Effect` that completes synchronously would keep today's type (`Dispatch`,
  and with it `forwardTo` and every view), compose in effect code with `yield*`, and say by its type that it needs no
  services and cannot fail. It would cost, from a plain callback, an `Effect.runSync` and a fiber made for each event,
  and a reader would take an `Effect` for a step that may wait, which this one may not. With a function, a handler of
  any renderer calls it as it is, and `forwardTo` would need a form over a function (phase 2). The spike's search
  wraps the function in a `Dispatch` to reuse `forwardTo`, which works since it compares dispatches by identity.

### What was run, checked and reasoned

**Run**, on Bun 1.4.5 and Node (Windows), Effect 4.1.4:

- `bun run typecheck`: passes. `bun run lint`: passes. `bun run test`: 941 pass, 0 fail (the 901 of the base, and the
  40 of `src/sync/` but the search). `bun run test:node`: 733 pass, 0 fail; a first run timed out on a test of the
  spike's that waited for a renderer by a timer, which on Node fired first, fixed with a `Deferred`.
- The ported search, `bun run interleavings:sync`: 21 properties, 11 runs, each of about 5,600 scenarios (2,000 for
  the coverage, 1,500 of four schedules for the defects, 1,000 for the writes, 60 for each of the 18 others), about 20
  seconds a run: every run passed.
- **What the deterministic tests show** (`src/sync/engine.test.ts`, `src/sync/run.test.ts`):
  - when `dispatch` returns, `update` and `onApplied` have heard the message, and `current()` (`app.model()`) is of the
    state it made; a rejected message leaves the very same state, `onIgnored` hears it at once, and no listener is
    told; a listener is told of each new state, never of the very same one;
  - a message a listener sends is applied after every listener of the step has been told, before the outer dispatch
    returns; a command's answer and a subscription's message are applied in the call that sends them;
  - the stops of a state are awaited before any start of that state or a later one, and a key that comes back finds
    its old start released; keys that go away together are stopped together;
  - the next message does not wait for a release, which the effects of the next state do;
  - a start whose key went away before the fiber of effects started it sends nothing that reaches `update`, and the
    same key coming back starts anew and is heard;
  - a command's scope closes before its answer is applied;
  - a defect of `update`, `onApplied`, `onIgnored` or `subscriptions` in a dispatch is recorded in its site, never
    thrown to the caller, and no `update` follows; one of `update` in a command's answer or a subscription's message is
    in `'update'`, with `on`, never the command's or the subscription's; defects are recorded in the order they
    happened; from the first on, no `update` is called on a subscription's message either; a self-interruption of the
    renderer or of a command is a defect;
  - once the end has stopped the engine, nothing sent is applied, the renderer's message as the run releases it
    included, with no sleep: the dispatch returns having applied it or not;
  - a model is made only when read, once for each state;
  - the span of whoever runs the run keeps no log of it, and stays the parent of a command's span;
    `describeMessage` and `describeCommand` are called only while debug logs are enabled, in the fiber of effects,
    never in the dispatch; a `Logger` that throws is one defect in `'log'`, never thrown to the dispatch.
- **Each check taken out by hand**, one at a time, with the deterministic tests of `src/sync/` and one run of the
  search under each (a script of the session, not in the repository):

  | Check taken out                                 | Deterministic tests that fail              | The search, one run |
  | ----------------------------------------------- | ------------------------------------------ | ------------------- |
  | the death check (`dead` for `Core.arrive`)      | six: the defects in the thunk, their order | the first defect on |
  | the drop by start                               | the start whose key went away              | the ticks           |
  | the logical keys (the drop against starts made) | the start whose key went away              | the ticks           |
  | the queue of re-entrant messages                | the message a listener sends               | nothing             |
  | the stops awaited before the starts             | three: the stops, together, the end        | the releases        |
  | one fiber of effects, its jobs in order         | the `Logger` that throws, by its death     | four, the releases  |
  | the commands of a job after its subscriptions   | the end held by a release                  | nothing             |
  | the stop at the end (`!stopped` in the loop)    | three: after the end, as the run releases  | nothing             |
  | the fiber of effects stopped first at the end   | **nothing**                                | nothing             |
  | the model kept by state                         | two: the models made, `model()`            | three, the models   |
  | the listeners told once the state is current    | six: every listener that reads the state   | the models read     |
  | the listeners told after the job is queued      | **nothing**                                | the coverage only   |
  | the listeners told after the keys               | **nothing**                                | nothing             |
  | a throw of the program kept from its sender     | eleven: every defect in the thunk          | all 21              |
  | a listener's throw recorded in `'render'`       | three: the listener's, the order           | nothing             |
  | the step stopped at a defect of `onApplied`     | its test of a defect in a dispatch         | not run             |
  | the step stopped at a defect of `subscriptions` | its test of a defect in a dispatch         | not run             |
  | a model's defect recorded outside the renderer  | the model read outside any fiber           | nothing             |
  | a model's defect left to the renderer's site    | **nothing**                                | nothing             |

  The stop at the end was two checks for one thing at first, one at the entry of `apply` and one in its loop: either
  taken out alone failed nothing, which the session that briefed this one found by taking each out again. One is kept,
  in the loop, before each message, and the row above is of it alone.

  The two "step stopped" rows were unkilled in the first pass: the tests of a defect in the thunk then asserted no
  state and no listener after it, and now do, which the second pass, with the deterministic tests alone, checked.
  Four are left unkilled, each with its reason:

  - **The fiber of effects stopped first at the end.** The end interrupts every fiber of the engine at once after it,
    the fiber of effects among them, so a job it had not taken starts nothing either way, as `docs/invariants.md`
    says of the loop's `stop` today. What the stop first keeps is that nothing forks while the end reads the sets,
    an order no test without the scheduler of the tests reaches.
  - **The listeners told after the job is queued, and after the keys are reconciled.** Nothing a listener can do sees
    the difference: a message it sends waits in `pending`, and the job is taken by another fiber. The order is
    kept for "told last" as the brief asked; it could go, and the guide would say only "after the new state is
    current".
  - **A model's defect left to the renderer's site in its own fiber.** Taken out, `model()` records the defect in the
    renderer's fiber too, and the renderer then dies of it, which should be a second defect: the run still ends with
    one (a probe, not kept, ran it). The register's `died` wakes the run on the thunk's stack (the second premise
    above), the end begins there and interrupts the renderer, and the renderer's own failure that follows is replaced
    by that interruption, which is no defect. So the check guards a case the inline end already hides, by a behaviour
    of Effect that is not documented. It is kept, unkilled.

  "One fiber of effects" is killed by a deterministic test only through the death of a `Logger`, not by the order of
  the jobs, which the search alone reaches: a deterministic test of it is still to write.

**Checked**, by reading code or documentation: `Effect.runSyncExit` and `Fiber.getCurrent` are stable and documented
(`Fiber.getCurrent` returns the fiber that runs, `undefined` outside one); that the thunk is not interleaved with any
other code but what it calls is ECMAScript's run to completion. `Queue.offerUnsafe` on the queue of jobs is called only
before the end shuts it down: `stopped` is set by the first finalizer the end runs.

**Reasoned**, not run: no bench was run, so what the thunk costs a message against today's loop is not measured; a
real browser, React, an IME composition and the caret are phase 2.

### The search

The program, its fates and its scheduler are those of `src/interleaving.test.ts`. Kept, as they are: the rejections,
the defects in order with their sites, no message applied from the first defect on (1,500 scenarios of four
schedules), a tick or an end heard only while its session listens, the writes into an input stored exactly when their
place holds what they were written over (1,000 scenarios, current and stale writes), the searches by text, the ended
subscriptions, a command released before its answer, the renderer released once stopped, the subscriptions holding at
the end, everything released at the end, and the span. Dropped: those of `seen`, of the frames and of `drawn`.
Restated: the releases, as "the subscriptions a state stops are released before any start of that state or a later
one" (a start belongs to the state whose message brought its key). Added: a dispatch has been applied when it returns;
messages are applied one at a time (each `update` is heard before the next is called); a message a listener sends is
the next one heard; a model read after a notice is of the latest state, and the very same state has the very same
model; a model is made once for each state read; a write typed into the element is never rejected. The renderer reads
the model at a notice or not, as the fates say, and now and then sends a poke from inside the step; the element of the
field shows what the current model holds, as a controlled element does. The coverage it checks over 2,000 scenarios
adds a message a listener sends, a message applied while a release is under way, a subscription started once its key
had gone, a state whose model was never read, and a model read twice for one state.

**Leads**: none. No run of the search failed, and no `test.failing` was needed: every property the brief restated
holds in this form, the releases as restated.

### What the guide says that would be untrue

Each sentence is quoted, then how it would read.

From "Guarantees":

- "One message at a time, in the order they were queued. The run takes the next message only once the step of the one
  before is over." would read: "One message at a time, in the order they were sent. A message is applied in the call
  that sends it. A message sent while another is being applied, as a renderer's listener sends one, is applied right
  after it."
- "The step of a message is its `update`, then `onApplied` or `onIgnored`, its frame, the subscriptions it stops and
  starts, and the start of its commands." would read: "The step of a message is its `update`, then `onApplied` or
  `onIgnored`, then the renderer's listeners. The subscriptions it stops and starts, and the start of its commands,
  follow in the run's own fiber, in the order of the states."
- "What a dispatch sends is queued as it is sent. A subscription's message is queued as it is emitted. A command's
  answer is queued as the command ends." would read "applied", with "in the subscription's fiber" and "in the command's
  fiber, once its scope has closed".
- Under "Subscriptions follow their keys": "Both happen once that state is published for the renderer, and before the
  run takes the next message." would read: "Both happen after the renderer is told of that state, and before any start
  of a later state. A later message may be applied first: what a subscription sends reaches `update` only while its key
  is in the current state, from the moment the key is gone, before the subscription has been stopped."
- Under "Nothing outlives what acquired it": "The next message waits for the slowest release, so keep releases quick."
  would read: "The next message does not wait for a release. The subscriptions and commands of the next state do: keep
  releases quick."
- "Frames cost only what is drawn. A frame of the very same state as the frame before it holds the very same model, so
  a bridge need not draw it again. A model is made only for the frames the renderer pulls." would read: "A model is made
  only when it is read, once for each state."
- "A frame says what it has seen." and its six sentences, and the two of `drawn` under "An input stores what is written
  over the value it holds", would go.
- In "What is left to you": "A slow renderer skips frames. It gets only the latest one." would read: "A renderer is
  told of every new state, in the call that made it. One that draws later reads the latest model when it draws." "The
  run queues every message as it is sent, however many wait." would read: "The run applies every message as it is sent,
  and queues the effects of every state, however many wait."
- "A function of the program never interrupts the fiber it runs in. `init`, `update`, `makeModel`, `subscriptions` and
  the options run in a fiber of the run, or of whoever runs it" would read: "… `update`, `subscriptions` and the options
  run where the message was sent: in a command's fiber, a subscription's, the renderer's, or no fiber at all, and
  `makeModel` where the model is read." One that interrupts a command's or a subscription's fiber is then a defect of
  that command or subscription, not of `update`.
- "The run keeps the guarantee of the order with one loop over one queue." would read: "with one synchronous step, and
  a queue of the messages sent during it".

From "View":

- "Sending a message returns an `Effect<number>`. This effect needs no services, and it completes synchronously." would
  read: "Sending a message is a call that returns nothing. It needs no services."
- "A handler may run it either way." would go.
- "Sending only hands the message to the run. The run handles the message in its own fiber, with its own services, on
  the scheduler that the run started with. So a handler returns before `update` has seen the handler's message." would
  read: "Sending applies the message. When a handler returns, `update` has seen the handler's message, and the model is
  the new one. What the message starts runs later, in the run's fiber, with its services."
- "What the program draws comes from its frames." would read "from its model".
- In "Do and don't": "Expect `update` to see the message after the handler returns." would be the "Don't", and its
  opposite the "Do".
- In "Precisely": "The number a dispatch returns", "A frame's `seen`" and "A frame for each dispatched message" would
  go.

From "Running": "The run also calls `onApplied` before the message's frame and before its commands." would read "before
the renderer is told, and before its commands start"; the sentences on what the run still does after a defect would
say "the fiber of effects" where they say the loop.

### What `docs/invariants.md` would say

- "Messages are applied one at a time, in the order they were queued: one loop takes them from one queue
  (`engine.ts`), and takes the next only once the step of the one before is over, its observer, its frame, its
  subscriptions stopped and started and its commands started." would read: "Messages are applied one at a time, in the
  order they were sent: one synchronous thunk applies each, in the call that sends it, and one sent during it waits in
  `pending` until it is done. Its subscriptions stopped and started and its commands started are a job for one fiber of
  effects, which takes the jobs in order. Never start a step's commands apart from its job."
- "A dispatched message is numbered as it is queued, and a frame says how many of them it has seen." and "The rule of
  an element is the library's" would go, with their mutations.
- "Running a dispatch needs no services and completes synchronously: it only numbers the message and offers it to the
  engine's unbounded queue, which wakes the engine on the scheduler of the run that made it" would read: "A dispatch is
  a function, and needs no services: it applies the message on its caller's stack, and records what the program throws
  there."
- "Subscriptions are reconciled by key … The gone keys are interrupted together, and awaited before any key starts: the
  loop waits for the slowest release rather than for their sum" would read "… awaited before any key of that state or a
  later one starts: the fiber of effects waits for the slowest release, and the next message does not". The drop by
  start would add: "The keys are reconciled in the thunk, so a message is dropped as soon as its key is gone, though the
  fiber of effects has not stopped it yet, or not started it."
- "a command's closes before its message is queued" would read "applied".
- "Frames cost only what is drawn: a frame's model is made as the renderer pulls the frame, by a `Stream.map` after the
  sliding buffer" would read: "A model is made only when read: `app.model()` makes the model of the current state, kept
  by the identity of the state in one slot."
- "`onApplied` and `onIgnored` … called in the loop as `update` is (`call` in `engine.ts`) … what holds a step is the
  release of a subscription it stops alone" would read "called in the thunk; nothing holds a step: a release holds the
  fiber of effects".
- Under "Defects always die": "A step whose `update` was called before goes on whole until the end stops the loop"
  would read "until the end stops the fiber of effects"; "the end of the run, which stops the loop first and waits for
  it (`stop` in `engine.ts`)" would read "which stops applying, then the fiber of effects, and waits for it"; "The fiber
  of whoever runs the program … and the loop, have no root: only functions of the program run there" would have to
  say that `update` and the options now run in the fibers of commands and subscriptions, which have roots, and in no
  fiber at all.

### What it rests on

Of Effect 4.1.4, as `engine.ts` does today, unchanged: every premise of `docs/premises.md` that names `stopping`,
`diesIn`, `scopedIn`, `rootedIn`, `FiberSet.run`, `FiberMap.run`, `Effect.onExit`, the order of a scope's finalizers,
`Scope.close`, `Fiber.interruptAs`, `Effect.raceFirst`, `Fiber.await`, `Effect.suspend`, the `Logger`, the external
span and `Channel.toPull`, with their tests. The jobs go to an unbounded `Queue` with `offerUnsafe`, as the dispatch
does today.

Of Effect 4.1.4, documented on stable APIs: `Effect.runSyncExit` runs a synchronous effect to its exit, and
`Fiber.getCurrent` gives the fiber that runs, or `undefined` outside one.

Of the JavaScript engine: run to completion, which ECMAScript states.

New, read only in the source, flagged at the top: `Effect.runSyncExit` inside a running fiber leaves it current; and a
waiter on a `Deferred` resumes on the stack of its completer, which nothing rests on.

Dropped: "an unbounded `Queue` … wakes its taker through the scheduler of the fiber that made it, so a dispatch never
runs `update` in its caller's stack", whose opposite is now the design, and "a `Stream.map` after `Stream.buffer` runs
only for the elements the consumer pulls", with the stream.

### Refused on the way

- **A synchronous `record` on `Shell.Deaths`**, or a `wrapped` option on `scopedIn` so that the renderer's site would
  take the defect `model()` recorded as it is: each changes `src/shell.ts`, whose texts the mutations of the engine
  match exactly. `recordThrown` with `Effect.runSyncExit`, and the question to `Fiber.getCurrent()` in `model()`, need
  no change of it.
- **Skipping the start of a subscription whose key went away before the fiber of effects reached it.** It would be a
  check of what the thunk changes, made in another fiber, against "one thunk"; and nothing needs it, since its messages
  are dropped by their start. It costs a start and a release for nothing, which the search reaches ("a subscription
  started once its key had gone").
- **A job only while debug logs are enabled**, decided in the thunk from the run's context: it would rest on how
  `LogLevel.isEnabled` reads the level. A job of logs alone is a small object for each message.
- **The logs of a step last in its job**, as the brief proposed: kept first, as the loop writes them today, so that a
  `Logger` that throws dies before the step's effects, as the loop dies before its step's today.
- **Telling the listeners of a state whose `subscriptions` threw**: the step stops at a defect, as the loop does.

### What it does not close

The guide, and `input`'s element, which phase 2 spikes without `Shown`; `simulate`, `rehearse` and
`drive` (below); a model read in a fiber other than the renderer's that throws, which is two defects; what a step
costs, not measured; a re-entrant dispatch, which returns before its message is applied, so that the promise of a
dispatch holds only of the outermost one.

### What the testing tools would need (reasoned only)

- **`simulate`** applies messages as data and runs commands one at a time: it already applies at once. It would lose
  nothing, and gain the listeners only if it modelled a renderer, which it does not.
- **`rehearse`** models the loop: a step applied, then its stops and starts, then its commands, in one transition of
  its ledger. It would need two halves: the logical keys moved in the transition that applies the message, and the
  starts and stops of each state queued for a second actor, so that a scenario can ask for a message of a key whose
  start is logical and not yet running, and see it dropped. `hearNext` on a key would wait for the start of its job,
  not of its step. Its `model` would be the model of the current state at once, with no frame to wait for.
- **`drive`** waits for frames (`latest`, `waitFor`, `send` through "that frame's dispatch"). It would read
  `app.model()` after each notice in place of a stream of frames, and `send` would apply at once: `waitFor` would still
  wait for what commands and subscriptions bring, but no longer for what a dispatch brings. Its renderer is the run's,
  so it would follow `run` with no change of its own beyond the handle.
- `src/testing/contract.test.ts` gives one program to each tool and to the run: every case of `seen` and frames would
  be restated, and the cases of releases ("the next message waits") inverted.

### What would carry over (reasoned from the names, not counted test by test)

- **`src/engine.test.ts`**, 32 tests: about 3 go (what the engine publishes, the numbers of two dispatches racing),
  about 10 change (the loop held by a release becomes the fiber of effects held; the register read by the loop;
  generations, where nothing is queued any more), and about 19 carry over with `dispatch` called and `states` replaced
  by `current()` and a listener.
- **`src/run.test.ts`**, 93 tests: about 15 go or invert (frames, `seen`, the sliding buffer, a renderer slower than the
  program, a dispatch that returns before `update`, the scheduler a dispatch wakes), about 15 change meaning (what the
  renderer sends as it releases, a step held by a release, a frame pulled after a defect), and about 60 carry over with
  the renderer written over a handle in place of a stream.
- **`tools/mutations/mutations.ts`**, 38 mutations of `engine.ts` and `run.ts`: about 13 go (the queue, the frames, the
  slot of the model before the buffer, `seen`, a state published), and about 25 carry over or move to the sites of
  `attempt` and the fiber of effects; the 18 of `core.ts` and the 16 of `shell.ts` carry over; the 13 of `input.ts` go
  with `Shown`, `edited` and `drawn`; the 76 of the testing tools follow what is said of them above.

### The case against it

- **The program runs on whoever's stack sends.** `update`, `subscriptions`, the options and the renderer's listeners
  run in a React handler, a command's fiber, a subscription's fiber, or a listener, where today they run in one fiber.
  A slow `update` holds the event that sent the message; a subscription that emits fast is held by `update` and by
  every listener of every state it makes. "A function of the program never interrupts the fiber it runs in" becomes
  harder to keep: the fiber is the sender's, and one that `update` interrupts is taken for the sender's defect.
- **What the thunk wakes runs inside it.** A waiter that `onApplied` completes resumes on the thunk's stack, before the
  new state is set: a test of the spike's met it ("a command's answer and a subscription's message are applied in the
  call that sends them", which tells its waiter from a listener for that reason), and the second premise flagged above
  is that behaviour. The register of deaths completes `died` inside `recordThrown`: the end of the run may begin on the
  stack of a dispatch, mid-step. The engine is correct either way, by the `stopped` check and by stopping the step at a
  defect, but whoever reads a program's logs or traces will see the end inside an event handler. A probe of the
  session's showed one more effect of it: once a defect recorded in the renderer's fiber has begun the end there, the
  renderer's own failure that follows is replaced by the run's interruption, and is no defect (the table above).
- **The promise of a dispatch has an exception.** One sent while another is applied (a listener that dispatches, an
  `update` that does) returns before its message is applied. A view cannot tell the two from where it stands.
- **The effects lag, without a bound.** Under a burst, the fiber of effects may be any number of jobs behind; a
  subscription may start, acquire and release for a key that is already gone; a command starts after messages that came
  after its step. Today a step holds the next message until its effects have started, which is a bound.
- **Two kinds of key.** The keys the engine holds and the fibers that run diverge by design, and the drop by start is
  what keeps them apart. That is one more thing a reader of `docs/invariants.md` must hold in mind, and one more thing
  `rehearse` must model.
- **A defect is recorded by a fiber made for it**, and `model()` asks the runtime which fiber it runs in. Both rest on
  what Effect does not document (the first premise), and a model read in another fiber of the renderer is two defects.
- **It is most of the engine again.** Replacing `engine.ts` and `run.ts` changes about 40 tests and 40 mutations, the
  three testing tools, the guide's "Guarantees", "View" and "Running", and every bridge, for what the brief names one
  need: elements with a value of their own.

### What is left for the owner to decide

1. Whether a dispatch applies its message at once, the engine as spiked, and whether the bridges follow (phase 2).
2. Whether `dispatch` is a function, as spiked, or an `Effect` that completes synchronously.
3. Whether the two premises flagged at the top are agreed to, or the design avoids them: the first by a synchronous
   `record` of the register, a change of `src/shell.ts`.
4. Whether a re-entrant dispatch, which returns before its message is applied, is acceptable, and how the guide says it.
5. Whether the effects may lag without a bound, or a step holds the next message until its job has started, which would
   bring back the wait for the slowest release.
6. Where a model read in a fiber other than the renderer's that throws is recorded.
7. What `rehearse` models of the fiber of effects.

### Phase 2: the bridges over it

Briefed by the same session once phase 1 was verified there. First, a finding of that verification, fixed in a commit
of its own: the stop at the end was two checks for one thing, and is one now (the table of phase 1 says so).

#### What was built

- **`src/sync/dispatch.ts`**: `forwardTo` of `src/dispatch.ts` over a `Dispatch` that is a function,
  `(message) => void`, with the same cache, copied (weak by the parent's dispatch, its name and its id, ids compared
  with `Equal`, entries dropped by a `FinalizationRegistry`) and the same types of the name and the id. Three tests in
  `src/sync/dispatch.test.ts`. `App.dispatch` is that type.
- **`bridges/sync/react.ts`**, 98 lines, 69 of code (`bridges/react.ts` has 350 and 192). Exports, five against
  eleven:
  - `View`, the view's type, over the new `Dispatch`;
  - `Draw`, `{ app, view }`: `view(useSyncExternalStore(app.subscribe, app.model), app.dispatch)`. It is the one piece
    a run the application starts itself needs, in place of `makeStore` and `Frames`: the application's renderer hands
    its `App` to a root that draws `Draw` (`examples/sync/form/main.tsx` does). A hook would be one line over it, and
    is not exported for that reason, as the decision of `hosted-react.md` left a hook to the application;
  - `Host`, `HostProps` and `Fork`, with today's props: it starts the run as it mounts, keeps the `App` the renderer
    hands it in its state, draws `Draw`, interrupts the run as it unmounts, and throws a run that died as it renders,
    or gives it to `reportError` once unmounted.
  - Gone: `Shows`, `makeStore`, `Store`, `Frames`, `Render`, `onClick`, `onPress`, the context of the inputs,
    `flushSync`, the animation frame, and the yield before the first frame.
- **`bridges/sync/snabbdom.ts`**, 134 lines, 106 of code (`bridges/snabbdom.ts` has 190 and 91). Exports, two against
  five: `View` and `renderInto`. Gone: `shows`, `onClick`, `onPress`. It keeps the two rules of the brief:
  - **A controlled prop is compared with the element.** A module records each element drawn with a `value` or a
    `checked` in `props`, with the props of its last vnode; after each draw the element is given the prop where it
    differs from it. No `Shown`, no numbers.
  - **When it draws.** The `dispatch` the view gets applies the message, then draws the current model at once, before
    the handler returns, whether the message made a new state or not; a model that is the very one drawn last is not
    patched, its controlled elements only given their props back. A notice from anywhere else is drawn by the
    renderer's fiber at the next animation frame, at most once for each refresh. What a draw in a handler throws is
    handed to the renderer's fiber, which dies of it at once, not at the next frame (a test found that first form).
- **`bridges/sync/bridge.test_suite.ts`**: the scenarios of `bridges/bridge.test_suite.ts` that still mean something,
  with controlled elements, given to both bridges, and the new ones; its programs and its scheduler are imported from
  the old suite.
- **`bridges/sync/react.test.ts`** (39 tests, the shared 25 among them) and **`bridges/sync/snabbdom.test.ts`** (30),
  in happy-dom.
- **`examples/sync/`**: the views of `examples/form` for both renderers and of `examples/stocktake`, their programs
  unchanged, a page that draws one run of the form with both renderers at once (`Effect.all` of the two renderers over
  one `App`), and a page of the stocktake. **Run with `bun examples/sync/serve.ts`**, then
  `http://localhost:3000/form/` and `http://localhost:3000/stocktake/` (`PORT` changes the port). `bun
  examples/sync/form/index.html`, as the examples run, would not do: Bun's server of an HTML page takes the package from
  `dist/`, a second copy of the library beside the sources the spike imports, whose `reject` the spike's engine takes
  for a step; it ignores `--conditions`. `serve.ts` builds the pages with `Bun.build({ conditions: ["bun"] })` into
  `scratch/`, which git ignores, and serves them: one copy, checked in each bundle.
- `bridges/tsconfig.build.json` leaves `sync` out, since the spike's bridges import `src/sync/` outside its `rootDir`:
  the one line changed outside the new folders. Oxlint and `bridges/tsconfig.json` take the imports as they are.

#### What was run, checked and reasoned

**Run**:

- `bun run typecheck` and `bun run lint` pass; `bun run test`: 1,013 pass, 0 fail, three runs (the 941 of phase 1 and
  72 of phase 2, its two `test.failing` among them); `bun run test:node`: 736 pass, 0 fail; `bun run
  interleavings:sync`: 21 pass.
- **In the built-in browser of the desktop app** (Chromium), the form's page served by `serve.ts`: "Ada" typed into the
  snabbdom field, then "X" typed at the start of the React field: both fields show "XAda", and the React field keeps
  its caret after the "X". Nothing else was tried there; the session that briefs this one will open the pages.
- **By the session that briefed this one** (Fable 5.2), at `acb1d74`: `typecheck` and `lint` pass, `bun run test` 1,013
  pass, `bun run test:node` 736 pass, `bun run interleavings:sync` 21 pass. In the built-in browser of the desktop app,
  on the form's page, with keys sent as a user's:
  - In the React field: "Adam", the caret moved two places left, "X", then "YZ". It shows "AdXYZam", the caret after
    the "X", then after the "Z".
  - In the snabbdom field: the caret moved three places from the end, "q", then "w" at once, then a backspace. It shows
    "AdXYqwZam" with the caret after the "w", then "AdXYqZam" with the caret after the "q". The React field showed each
    value as soon as it was read.
  - Save, clicked under the React field: that field is disabled and its button says "Saving…" at once. Then both fields
    are emptied, and the name is in both lists. No error in the console.
  - **Found there.** The pane was hidden, and its animation frames came about every 500 ms. A draw that the snabbdom
    bridge leaves to the next animation frame then waits that long. Its field shows the old value meanwhile, and what
    was typed into it in that window was rejected and taken back, as a write over a value the state no longer holds
    is. Under the React field's Save, the snabbdom button stayed enabled for that window: a click there is rejected.
    With a page on screen the window is one refresh.
  - Not run: an IME composition.
- **The shared scenarios**, in both bridges: a click drawn once its handler returns; what is typed stored, with the
  focus and the caret; a name the program empties after a save emptied in the same element, with the focus; two clicks
  on Save in one task, the second rejected; a save again after a failure; the draft sent, emptied and typed into
  again; a rejected click that draws no tree; a kept draft brought back as the very same state; the volume's drag; a
  text typed in its middle that keeps its selection; a value the program puts in an input's place, shown with the
  focus; a write the element did not make, shown, and the next key over it; a value with a line break that the field
  strips; the dictation, twice; the lid, twice; the steps; the lock; a textarea, a select, a checkbox and a range, each
  stored and shown; a textarea and a checkbox whose writes are rejected once frozen, both shown the model again; and an
  input in a shadow root.
- **Dropped or restated from the old suite**, and why:
  - "draws the first frame at once, then at most once per screen refresh, the latest frame": split, a click drawn at
    once (shared) and a command's answer drawn at the next refresh, at most once (snabbdom's own). React renders a
    notice as React schedules it, in a microtask.
  - "a frame drawn while the user types does not take back what they typed since": dropped. No model is older than a
    key: the key is applied in its own event. Restated as the caret and the selection kept.
  - "a key typed into the input drawn before a save completed", both orders: dropped. The click is applied and drawn
    at once, and the input is disabled until the answer is drawn: no key can reach it.
  - "a second click on Save, before a frame is drawn for the first": of its four, "the run has taken neither click"
    and "the run has taken the first" become "a second click in the same task is rejected"; "once the save has
    succeeded" is dropped, the button disabled at once; "saves again once the save has failed" is kept.
  - In the draft: "a frame that has not seen a key sent before it was drawn" and "a key typed after Send, before the
    emptied draft is drawn": dropped, no `seen`, and Send is drawn at once.
  - "an input in the place of another input": restated, Next drawn at once, so no key for the first step reaches the
    run after it; the element is the second step's, empty, and stores what is typed.
  - "an input whose place the state no longer holds": restated, a key once locked is rejected and the element shows
    the program's value again at once, by the comparison of the controlled prop.
  - "a text a script writes into the input, and announces with an input event": moved to each bridge, since it holds
    in snabbdom and fails in React (below).
- **From `hosted-react.md`, in React**: `memo`, a key rejected in an input that `memo` skips, taken back; Suspense, an
  input hidden and shown again with the value the program put there meanwhile; a portal; two programs on one page; an
  input a component mounts from its own state; StrictMode, the first run interrupted and the second drawn and typed
  into; the error boundary; an unmount with a command under way, which interrupts it. And a component with state of
  its own, `value` and `onChange` props, as a component of a library is: what is typed is stored, and a value the
  program puts is shown.
- **The four gaps of 16 November 2026**, with controlled elements:
  - A form's reset. In snabbdom, a `test.failing` that says how: a reset sends no input event, and the props module
    sets the element's `value` and never its attribute, so the reset empties the element and the program keeps "Ada";
    a passing test shows that the next draw gives the element the model's value again. In React, a passing test: React
    keeps the `value` attribute of a controlled input in step with its value, so the reset gives the element the
    program's value, which it shows already.
  - A root in a shadow tree: passes in both.
  - Suspense: passes in React.
  - A text field that strips line breaks: passes in both, in the sense the test says: the element shows the stripped
    text, the next key is written over the model's value, and is stored. The element and the state differ until that
    key, by the element's own rule.
- **`test.failing`**, two, each saying how: the snabbdom reset above; and in React, "a text a script writes into the
  input, and announces with an input event, is stored": React tracks the value of a controlled input through its
  setter, so a value written past that setter and announced finds the tracked value equal and sends no `onChange`
  (`Shows` listened to the element's own event for this).
- **Each check of the bridges taken out by hand**, the bridges' two test files run under each (a script of the
  session, not in the repository):

  | Check taken out                                         | Tests that fail                               |
  | ------------------------------------------------------- | --------------------------------------------- |
  | snabbdom: a handler's message drawn at once             | 20                                            |
  | snabbdom: a controlled prop compared                    | 3: the lock, the frozen fields, the reset     |
  | snabbdom: the model drawn last not patched again        | 2: the rejected click, the lock               |
  | snabbdom: a notice drawn at the next animation frame    | 1: a command's answer at the next refresh     |
  | snabbdom: a handler's throw ends the wait for the frame | 1: a view that throws in a handler's draw     |
  | snabbdom: a handler's throw handed to the fiber         | 1: the same                                   |
  | snabbdom: a model's throw in a handler left to the run  | **nothing**                                   |
  | snabbdom: a removed element forgotten                   | **nothing**                                   |
  | React: the model read from the store                    | 35                                            |
  | React: a run that died thrown as `Host` renders         | 1: the error boundary                         |
  | React: the run interrupted as `Host` unmounts           | 3: unmount, StrictMode, the command under way |
  | React: no `App` set once unmounted                      | **nothing**: removed                          |
  | React: a death after unmount given to `reportError`     | **nothing**                                   |

  Of the four left: `if (mounted)` before `setApp` was removed, since React ignores the state of an unmounted
  component. A `makeModel` that throws, read in a handler, is recorded by the run either way: what the `catch` keeps
  is an error thrown out of the user's event, which happy-dom reports and no test reads. A removed element kept in the
  map is a leak, never drawn again: no test can see it. A death after unmount needs a release that dies as the run is
  interrupted, which was not ported.
- **Found on the way**, run: React renders a click's update in a microtask, and a notice from outside React too, which
  `flushSync(() => {})` takes at once; a key typed into a controlled input is rendered before its event ends, React
  restoring a controlled element after its handler. And, in the tests only: the old `react.test.ts` and the new one in
  one process share React's own scheduler, loaded under the first file's DOM, which is gone for the second: a state
  set outside `act` there never renders. The test of the error boundary clicks and settles inside `act` for this.

**Checked**, by reading: snabbdom's `propsModule` sets a prop only where it differs from the old vnode's, and `value`
only where it also differs from the element (`node_modules/snabbdom/build/modules/props.js`), which is why the
comparison after each draw exists; `checked` has no such guard.

**Reasoned**, not built:

- **`Host` drawing the first model in the render that mounts it.** The thunk applies at once, and the effects of a
  step are jobs for a fiber: the engine's state, its keys, its listeners and its queue of jobs could be made
  synchronously, before any fiber starts, and its fibers started later, the jobs queued meanwhile waiting for them, the
  first state's among them. `Host` would make that half in its state's initializer, during render, draw the model at
  once, and start the fibers in its effect. A dispatch before the effect would apply and queue its job. StrictMode's
  second render would make a second half that nothing starts, with no command of `init` run twice, which today's
  `Host` and this one both do. It needs `run` split into a synchronous part and an effect, a change of the engine.
- **Server rendering.** With that split, `getServerSnapshot` is `app.model` of a half that is never started: the model
  of `init`'s state, with no effect run on the server. Hydration would then start the fibers.
- **`messagesSentBy` over a function.** The same walk of the tree, with a `dispatch` that records. A controlled
  element's handler builds its write from the event's target, so the walk would give each listener an event whose
  `target` holds the vnode's own props, `value` and `checked`: each write it records is then over the model's value,
  with that value, which names the input and proves that the view writes over what its model holds. It finds the writes
  that way, which today's cannot (`shows` writes only from an element on screen); what was typed is no part of it.

#### What it rests on of React and of snabbdom

Of React, each with the page of react.dev that states it or the test that fails without it:

1. **`useSyncExternalStore` renders again when the snapshot changes, by `Object.is`** (react.dev,
   "useSyncExternalStore"): `app.model` is the snapshot, the very same for the very same state. Taken out: 35 tests.
2. **A controlled input keeps what is typed, its caret and its selection, when its value is updated during its
   `onChange`** (react.dev, "<input>", controlled inputs: the state is updated synchronously in `onChange`). The
   update here is a store's, not a state variable's: what React does with it is seen in the tests of the caret and the
   selection, and in the browser of the desktop app, not stated for a store by the page.
3. **React gives a controlled element back the value it was drawn with when the render its handler scheduled changes
   nothing** (react.dev, "<input>": React reverts the input to the value given). Test: the key rejected under `memo`.
4. **React keeps the `value` attribute of a controlled input in step with its value**: not on react.dev; seen in the
   reset's test, which fails without it.
5. **React sends no `onChange` for a value written past its own setter**: not on react.dev; the `test.failing` of a
   script's write holds it.
6. **StrictMode runs effects twice; an error thrown while rendering reaches the nearest error boundary; Suspense hides
   with `display: none` and shows again**: react.dev, as `hosted-react.md` lists them. Tests: StrictMode, the boundary,
   Suspense.

Of the nine premises of `hosted-react.md`, six are gone: `flushSync` committing before it returns (no `flushSync` but
in the tests), `memo` rendering again for a store it reads (no store below `Draw`), the layout effect before paint (no
layout effect), Suspense running layout effects again (none), a portal reading the contexts (no context), and
`flushSync` inside an effect (no yield needed). Kept: `useSyncExternalStore`, StrictMode, the error boundary. Of
`docs/premises.md`, both of React go: the ref callbacks and layout effects of a commit run by `flushSync`, and React
leaving an uncontrolled `<input>`'s value as it is.

Of snabbdom: its props module sets a prop only where it differs from the old vnode's (read in its source, above): the
comparison of the controlled prop rests on it, and its three killers fail without the comparison. It reuses an
`<input>` with no key in the same place (kept from `docs/premises.md`: the lid and the steps rest on it), and calls a
module's `update` hook on every element `h` draws again (kept: the module of the controlled elements is told of each
draw by it). Its patch is synchronous, as its API returns the new vnode. Gone: the module of listeners taking off those
of a fading element, since nothing of the element is kept beside its props.

#### What the guide would say

"Writing a bridge":

- "Frames" would go, and become "The handle": a renderer is given an `App`, reads `model()`, is told of each new
  state by `subscribe`, and draws the model of the state current when it draws.
- "Handlers" would say that a handler calls `dispatch(message)` itself, a plain call: `onClick` and `onPress` go.
- "A text input" would go, and become "A controlled element": a view draws the model's value as the element's, and
  writes over it in its handler, `{ _tag: 'Written', was: model.name, value }`; a bridge whose renderer sets a value
  only where its own tree changed compares the element after each draw, and one whose handlers' messages are drawn
  later than the next event draws them at once.
- "What is left out" would read: they run `dispatch` from any event of a native element, and draw any native
  controlled element, a text field, a textarea, a select, a checkbox, a range; left out: a form's reset with snabbdom,
  a value written past React's setter with React, and a value the element changes by itself, which the element shows
  until the next write, stored over the model's value. "A root or an input in a shadow tree" and "an input drawn under
  one run's `Host` with the dispatch of another" would go: the first works, the second means nothing without `seen`.

"Inputs the user types into": "The element on screen", "Settling an element" and "Which elements and renderers this
holds for" would go, with `Shown`, `edited` and `drawn`. "The view writes over the value its model holds" stays, and
becomes the whole of what a view does for an input. "Two limits" stay.

"View": as phase 1 says above; and the third place the screen shows the program from, "the element of an input, which
may show what the user typed after the frame was made", would go: an element shows the model's value, or, for the
length of its own event, what was typed into it.

#### What is left out now

Against the guide's "What is left out": the base case widens from a native text `<input>` to every native controlled
element, in both bridges; a root in a shadow tree, Suspense, a portal, `memo` and a component with state of its own
work; a form's reset is closed in React and still open in snabbdom; a value the text field changes by itself is shown
as the element changes it, and the next write is stored; a value written by a script past React's setter is lost in
React. Not run at all: a real browser beyond the one check above, an IME composition, `startTransition` or
`useDeferredValue`, `<Activity>`, server rendering and hydration, a component library of the real world.

#### The case against it

- **Every handler of snabbdom draws.** A key, a click, a drag: each patches the tree in its own event, where today a
  burst of events draws once for each refresh. Most events change the model, and a model that is the very one drawn
  last is not patched; but a list of a thousand rows is drawn again on every key of its search field.
- **React draws a handler's message later than the next event of another source.** A key in `onChange` is rendered
  before its event ends, but a click is rendered in a microtask, and a source of events outside React, as the
  dictation's listener, may write twice before React renders: the second write is over the `was` of the first model,
  and is rejected. The tests draw after each result. snabbdom draws at once, so the two bridges do not draw at the same
  moments.
- **A script's write is lost in React.** An extension that fills a form by `input.value =` and an input event, which
  `Shows` stored, sends nothing: React's own rule, which the bridge cannot change without listening to the element as
  `Shows` did.
- **The view builds `Written` in each handler.** `{ _tag: 'Written', was: model.name, value }` is repeated in every
  view of an input, where `shows` and `Shows` built it; a helper that builds it would be a name over a literal of a
  shape the library documents, which `AGENTS.md` rules out.
- **The snabbdom bridge holds more than its renderer.** A map of the controlled elements and their props, kept by a
  module, compared after each draw, and a second path of drawing, in the handlers, beside the renderer's fiber, with
  what a draw there throws carried back to the fiber.
- **Two moments of drawing to test.** The tests of the bridges call `drawn()` after each act, which in React flushes
  what React scheduled; a test of a user's view must know which renderer it runs under to know when the screen is
  current.
- **The spike imports the sources.** Its bridges and examples import `src/sync/` directly, so a page needs a build with
  the `bun` condition: an artefact of the spike, not of the design.

#### What is left for the owner to decide

1. Whether the bridges follow the engine: React's over `useSyncExternalStore` and controlled elements, snabbdom's with
   the comparison of the controlled prop and a handler's message drawn at once.
2. Whether `onClick` and `onPress` go, as spiked, or stay as a name over a call.
3. Whether a script's write that React drops, and a form's reset in snabbdom, are left out, as the guide's list would
   say.
4. Whether `Draw` is the one export for a run the application starts, and `Host` stays as it is.
5. Whether `run` is split into a synchronous half and the fibers, for a first model in the mounting render and for
   server rendering.
6. Whether `messagesSentBy` gives a listener an event whose target holds the vnode's props, to find the writes.
