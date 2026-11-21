# Each promise of the guide against the tests

**Status:** done, 21 November 2026, as step 11 of [`ROADMAP.md`](../../ROADMAP.md), at commit `b6db847`, by a session
of Opus 5.5. Six readers of Sonnet 5.5 read the pages and the tests. The session checked every type promise, every
candidate of the step, and part of the other gaps on the tests' bodies. A reviewer of Opus 5.5 checked the rest. No test
was written, and no sentence of the guide changed. Step 12 wrote the tests, and its decisions are at the end ("What step
12 made of it"). Step 13 weighed a check that keeps a guarantee tied to its tests: on a second opinion of Fable 5.2,
the owner took it on 21 November 2026 as an index and a tripwire, not as a proof that each guarantee is checked (the
`guarantees` of a mutation, checked by `bun run comments` and printed by `bun run guarantees`).

## In short

Of 488 sentences of the guide that say what the library does, or what the compiler refuses, 423 have a test that would
fail if the sentence were false. 65 have none, or have one for a part of the sentence only. One sentence is false of the
code ("Found false"). 46 more could not be sorted between behaviour, advice and consequence.

Every item of "What you can rely on", in "Guarantees", has a test. The gaps are elsewhere, and they are of three
families:

- **Types.** Thirteen promises of what the compiler refuses or infers have no `@ts-expect-error` and no `expectTypeOf`:
  that a program with events does not start, that `subscribed` is required of a child by id, that a handler of
  `onEvent` has no `reject`, that an `Execution` cannot fail, and more. One of them the smoke test alone checks, for one
  case of three.
- **One case of several.** A sentence names a command and a subscription, `update` and the options, a child alone and a
  child by id, and the tests take one. This is most of the gaps of kind "part".
- **The testing tools after a defect.** What `rehearse` does once its program died is tested for some of its calls, not
  for all that the guide names.

## Method

**A sentence of behaviour** says what the library, a testing tool or a bridge does as a program runs, or what the
compiler refuses or infers for a program. Sentences under "Precisely" and "What is left to you" count: the guide says
that the tests check a description too. Not counted: advice to the user, a definition, what an example's code does, a
sentence about the guide itself, and a sentence that repeats one already counted on the same page. A sentence that two
pages state is counted on each, as a gap of each (C3 and G2, V3 and G5, V4 and B8). `index.md`,
`glossary.md` and `coming-from-elm-or-react.md` only repeat the pages they link, so they count nothing. One line of the
glossary says something its linked page does not: "Handler (of `onEvent`) ... Its type has no `reject`", which only
"Rejections and defects" says. It is gap D1 below.

**A sentence has a test** when a test of `src/`, `test/`, `bridges/` or `examples/` would fail if the sentence were
false. This is decided from the body of the test, what it runs and what it asserts, never from its name. A test that
runs the code and asserts nothing that the sentence rules does not count. A promise of a type needs a
`@ts-expect-error` or an `expectTypeOf` in a test file.

**A gap is of one of four kinds:**

- **no test**: nothing checks the sentence;
- **part**: a test checks one part of the sentence, and the part that none checks is named;
- **search alone**: only `src/interleaving.test.ts` checks it, which runs apart from `bun run test`;
- **smoke alone**: only `tools/smoke/` checks it, which is no test of the library.

A sentence that says the library does not do something ("the run does not check this") is held only by a test that
would fail if the library began to do it. Such a gap is marked _negative_: a test of it is often not worth writing, and
step 12 says so to the owner.

**Who checked what.** Each reader listed the sentences of its pages, with the test of each, and the gaps. The counts of
matched sentences are theirs, and are close, not exact: the readers split some sentences in two. Each gap below was
checked again on the tests' bodies, by the session (the types, the candidates of the step, and those marked "checked by
the session") or by the reviewer. Six gaps that the readers reported were refuted then, by a test that the reader had
not found. They are not listed as gaps.

## Counts

| Page                                      | Sentences | Have a test |   Gaps | Unsorted |
| ----------------------------------------- | --------: | ----------: | -----: | -------: |
| Anatomy of a program                      |        24 |          21 |      3 |        2 |
| Update                                    |         3 |           3 |      0 |        0 |
| Model                                     |         3 |           2 |      1 |        5 |
| Commands                                  |        16 |          13 |      3 |        3 |
| Subscriptions                             |        12 |          11 |      1 |        2 |
| Events and external messages              |        23 |          22 |      1 |        2 |
| Composition                               |        53 |          44 |      9 |        3 |
| Structuring a program                     |         5 |           5 |      0 |        1 |
| Rejections and defects                    |        17 |          14 |      3 |        4 |
| Running                                   |        81 |          70 |     11 |        4 |
| Guarantees, "What you can rely on"        |        24 |          24 |      0 |        0 |
| Guarantees, "What is left to you"         |        33 |          25 |      8 |        6 |
| View                                      |        21 |          17 |      4 |        2 |
| Inputs the user types into                |        23 |          21 |      2 |        4 |
| Writing a bridge                          |        44 |          36 |      8 |        3 |
| Testing tools                             |        97 |          87 |     10 |        3 |
| Testing                                   |         9 |           8 |      1 |        2 |
| Index, Glossary, Coming from Elm or React |         0 |           0 |      0 |        0 |
| **All**                                   |   **488** |     **423** | **65** |   **46** |

Of the 65 gaps: 25 no test, 37 part, 2 search alone, 1 smoke alone. "How the tests check them", in "Guarantees", is
about the tests and counts nothing: each check it names is in `src/interleaving.test.ts`.

## Found false

- **"Guarantees", "What is left to you", "The program runs on the stack of whoever sends the message"**: "So does
  `makeModel`, when a renderer reads the model in that call, as the bridge to snabbdom does for what a handler of the
  view sends." The bridge to snabbdom reads no model in that call. Its dispatch applies the message and asks for a
  draw, and the draw is in a microtask (`notice` in `bridges/snabbdom.ts`), as "Writing a bridge" and the bridge's doc
  comment say. `bridges/snabbdom.test.ts`, "a notice from a command is drawn in a microtask, once", asserts that nothing
  is drawn while the task that clicked runs. The sentence is a description, and it was left by the change to a draw in
  a microtask ([`write-without-was.md`](write-without-was.md)). Checked by the session. It is the one place that says
  it.

## The gaps

Each gap gives the sentence, short, its section, its kind, and what holds the rest of it, if anything.

### Running

- **R1.** "Only a program without events starts." Rules. A type, no test: no `@ts-expect-error` gives `start` a program
  with events. Checked by the session.
- **R2.** "It never succeeds: it runs until it is interrupted, or until a defect ends it." Rules. Search alone, for a
  program whose effects all ran and ended (`src/interleaving.test.ts`, which fails when the run's fiber has ended). A
  program with no effects is held by `src/run.test.ts`, which asserts that its exit is an interruption alone.
- **R3.** "Both hold of a program whose `run` is interrupted before it begins, too." Rules. No test: every test forks
  the run with `Effect.runFork`, which starts it at once. Checked by the session.
- **R4.** "The types refuse one that returns a value, an effect or a promise." Options. Smoke alone, for an effect
  (`tools/smoke/consumer.ts`). No test for a value or a promise. Checked by the session.
- **R5.** "A function declared apart needs one: TypeScript gives it `void`, which the types refuse." Options. A type, no
  test.
- **R6.** "Neither option hears a message that the run drops before `update`." Logs. Search alone for `onApplied`; no
  test for `onIgnored`. The deterministic tests of a late message (`src/run.test.ts`, "what a subscription sends once
  its key went away") give no options.
- **R7.** The site `'update'` is "In `update`, `onEvent` included." Defects. No test: no `onEvent` throws in a test.
  Checked by the session.
- **R8.** "A defect in that log is in the place the program logs from." Defects. Part: a command that logs is tested
  (`src/run.test.ts`), a subscription that logs is not.
- **R9.** "The `key` of a `ProgramDefect` is the program's own value, as it is", and the `id` of a `CompositionDefect`.
  Defects. Part: keys and ids are strings and numbers, compared by `toEqual`; no test checks that the value is the
  program's own, by identity.
- **R10.** "A message that the run does not apply starts no command and no subscription, and `onApplied` does not hear
  the message." Precisely. Part: only that `update` is not called (`src/engine.test.ts`).
- **R11.** "This also holds in a run that died as it started, for example when a subscription of `init` dies."
  Precisely. Part: `subscriptions` that throws on the first state (`src/start.test.ts`) and a command of `init` that
  dies (`src/run.test.ts`) are tested; a subscription of `init` that dies is not.

### Guarantees, "What is left to you"

All are descriptions.

- **G1.** "The run applies every message as it is sent, and queues the effects of every state, however many wait." Part:
  at most two jobs wait in a test (`src/engine.test.ts`).
- **G2.** "It starts every command, however many run." Part: at most two run at once (`src/run.test.ts`). Commands C3
  is the same sentence.
- **G3.** A release that "never ends holds up the program, and no defect says so." Part: a release held for 20 ms holds
  the later jobs (`src/engine.test.ts`); no test checks that no defect comes. _Negative_, for its second half.
- **G4.** "A release that never ends also holds back the defects that the run would die with." Part: that the end
  awaits the releases is tested (`src/run.test.ts`), with releases that end; a wait that gave up would pass.
- **G5.** "The bridge to snabbdom keeps no state beside the program's state, except the value a model gave each
  controlled element." No test, _negative_. Tested: an element no longer controlled is not given its value back
  (`bridges/snabbdom.test.ts`). View V3 is the same sentence.
- **G6.** "What is thrown is `Cause.squash` of what the run ended with, which keeps one defect." Part: each React test
  of a run that dies (`bridges/react.test.ts`, "a run that dies") ends with one defect; none with several.
- **G7.** "`update`, `subscriptions` and the options run where the message was sent: in a command's fiber, a
  subscription's, a fiber that calls the dispatch, or in no fiber at all." Part: the fiber is checked for `update`
  alone, in a command's and in a subscription's (`src/run.test.ts`).
- **G8.** "The run cannot tell an interruption of another fiber from one by whoever runs the program, so no defect says
  that one happened." No test: the tests interrupt a command's or a subscription's own fiber, which is another case.

### Commands

- **C1.** "An execution cannot fail. Its type says so." Rules. A type, no test: `Execution` is used in tests, never
  refused with an error type. Checked by the session.
- **C2.** "When it is acquired in the service or the subscription ... a defect ends the run before the release, not
  after." Precisely. Part: a subscription's release after a command's defect is tested (`src/run.test.ts`); a finalizer
  of a service around `run` is not.
- **C3.** "There is no bound on how many commands run at once." Precisely. Part, as G2.

### Subscriptions

- **S1.** "A subscription is a `Channel` whose end value is a message." Rules. A type, no test: the run's handling of
  the end value is tested (`src/engine.test.ts`), its type is not. Checked by the session.

### Events and external messages

- **E1.** "A parent sends an external message ... in the parent's own `update`, `external` and `onEvent`." Part: from
  `update` and `external` (`src/compose.test.ts`); no test or example sends one from `onEvent`. Checked by the session.

### Model

- **M1.** "The run does not check this" (a view that shows a "Save" where `update` rejects it). Rules. Part,
  _negative_: a rejected message is ignored (`src/run.test.ts`), with a counter whose model shows no message.

### Composition

- **P1.** `subscribed` "is required" of a child by id. Children by id. A type, no test: each `childById` of the tests
  passes `subscribed`, and no `@ts-expect-error` leaves it out. Checked by the session.
- **P2.** "Ids are compared by value, with `Equal`, wherever they go: in subscription keys and in dispatches." Children
  by id. Part: a dispatch with a tuple id (`src/dispatch.test.ts`, "tells ids apart by value, as subscription keys
  are"); no subscription is kept across states for an id that is a tuple or a struct. Checked by the session.
- **P3.** "Ids that come back": a command's answer "reaches the row that has that id at that moment", so a new row may
  get the old row's answer. No test for a child: `src/input.test.ts` holds it for an input by id. Checked by the
  session.
- **P4.** "By default, a child's subscriptions run whenever the child is there." When a child's subscriptions run. Part:
  no test has a child without `subscribed`, that listens, and is absent.
- **P5.** "A subscription or a command of the parent's own that sends ... a message for a child." Precisely. Part: the
  command is tested (`src/compose.test.ts`), the subscription is not.
- **P6.** "For a type parameter, such as `P` in `<P extends AnyProgram>(p: P) => …`, ... `make` does not compile there."
  Precisely. A type, no test: the tests refuse a state that is a type parameter, not a program. Checked by the session.
- **P7.** A `CompositionDefect` for "a child whose state is not an object", and for "asking for the model of a child
  that is not there". Precisely. Part: the first for a child by id alone, the second for a child alone. Checked by the
  session.
- **P8.** A `CompositionDefect` for "a `subscribed` that lists one id twice, for a child that listens to something in
  that state". Precisely. Part: the defect is tested; that a child that listens to nothing raises none is not.
- **P9.** "A row that `subscribed` leaves out runs no subscription." Children by id. Part: no test has a row in the
  state that `subscribed` leaves out.

### Rejections and defects

- **D1.** "The handler's type has no `reject`" (of `onEvent`), in "Do and don't" and "Precisely", and in the glossary. A
  type, no test: the `@ts-expect-error` of a handler that rejects are of `external`. Checked by the session.
- **D2.** "`defect` is an expression, for a branch of a ternary or a `Match`." Rules. A type, no test: no `expectTypeOf`
  checks that it returns `never` (`src/defect.test.ts`). Checked by the session.
- **D3.** The table of late messages: a subscription's message once its key is gone, "`onIgnored`: Does not hear it."
  Rules. Part: the drop is tested (`src/run.test.ts`, `src/engine.test.ts`), with no `onIgnored`. Checked by the
  session.

### Anatomy of a program

- **A1.** `init` and `makeModel` are "Needed: always". Rules. A type, no test: no `@ts-expect-error` gives `make` a
  program without one. Checked by the session.
- **A2.** A program object without `subscriptions` is refused by "`child`, `childById`, `start`, `rehearse` or `drive`".
  Precisely. A type, part: `Program`, `start`, `child`, `childById` and `simulate` are refused in tests; `rehearse` and
  `drive` are not. Checked by the session.
- **A3.** Without `strictFunctionTypes`, the compiler accepts programs it should refuse. Precisely. A type, no test:
  nothing compiles a program without `strict`. Checked by the session. It is about the compiler's options, and may be
  advice: for the owner.

### View

- **V1.** "Sending a message is a call that returns nothing." Rules. A type, no test: `Dispatch` returns `void`, which
  nothing asserts. Checked by the session.
- **V2.** "Two kinds of code send one then: a renderer's listener ... and code that a function of the program wakes."
  Rules. Part: a listener of the `App` that sends (`src/engine.test.ts`); no test has code woken by `update`,
  `makeModel` or `onApplied` send.
- **V3.** "The bridge to snabbdom draws the model, and nothing else. It keeps no state beside the program's state."
  Rules. Part, _negative_, as G5.
- **V4.** "It draws each model whole, never in parts." Rules. Part: a message sent during a patch is drawn after it
  (`bridges/snabbdom.test.ts`); no test checks that every part of the screen shows one model. Checked by the session.

### Inputs the user types into

- **I1.** "A limit that the element keeps by itself, such as `maxlength`, needs nothing." What is typed, in another
  form. No test. Checked by the session.
- **I2.** "What `input` and `inputById` return has the `get` of the place." Inputs by id. Part: only the `stocktake`
  example calls it, for an `inputById` given `get` and `set`, and its test would fail if it were missing; no test
  asserts what `get` returns, none calls it on what `input` returns, and none on a place given with `at`. Checked by the
  session.

### Writing a bridge

- **B1.** "The run does not stop a bridge." The handle. No test: the test of an interrupted run draws nothing
  (`src/start.test.ts`).
- **B2.** "What a task, or a listener that the browser calls, sends until it returns is drawn once." The handle. Part:
  draws are counted with one message a task (`bridges/snabbdom.test.ts`); the test of two clicks in one task
  (`bridges/bridge.test_suite.ts`) counts no draws.
- **B3.** A draw that comes once the run has ended "throws it out of the microtask, as an error of the page". The
  handle. Part: that `die` gives the defect back once the run has ended is tested (`src/run.test.ts`); no bridge draws
  after the run has ended. Checked by the session.
- **B4.** "`Draw` alone throws it as it renders, and the run that the application started dies of it too." The handle.
  No test: every React test of a `makeModel` that throws is under `Host`. Checked by the session.
- **B5.** "A handler that awaits returns at its first `await`: what it sends after that is drawn apart", with what the
  HTML Standard runs after each task. The handle. No test: it rests on the browser, and the tests run on happy-dom. For
  step 6.
- **B6.** With React, a value that a script writes past React's own setter "is lost". What is left out. No test.
- **B7.** "An event that the program's own code dispatches before a new state is drawn ... a write from it is stored
  over what the program put there." What is left out. Part: the second click of one task is rejected
  (`bridges/bridge.test_suite.ts`); a write is not tested. For step 6, which names this case.
- **B8.** "When the line returns, snabbdom has drawn the model whole." The handle. Part, as V4.

### Testing tools

- **T1.** `rehearse`: a subscription's message that no longer applies is "ignored, in `ignored`". Rules, and "How a
  subscription is heard". No test: `ignored` is read for a command's answer alone (`src/testing/rehearse.test.ts`), and
  the contract's only rejected message is a command's (`src/testing/contract.test.ts`). Checked by the session.
- **T2.** `drive` and the run: a subscription's message that is rejected is ignored. Rules. Part: the origins
  `Dispatch` and `Command` are checked (`src/run.test.ts`, "hears every message update rejects"), `Subscription` is not.
- **T3.** `applyAll` and `dispatchViolations` "fail with the defect itself". Defects of the program. Part: `applyAll` is
  tested (`src/testing/apply-all.test.ts`), `dispatchViolations` is not. Checked by the session.
- **T4.** After a defect, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with the defect. After a defect
  of the program. Part: `send`, `hear` and `model` are asserted; `run` only for calling no `runCommand`; `runAll` and
  `hearNext` not at all.
- **T5.** After a defect, `state`, `pending`, `events` and `ignored` stay readable. Same section. Part: `events` and
  `ignored` are never read after a defect.
- **T6.** A detached fiber's request after the end: "a defect it meets then is lost". Fibers the test forks or detaches.
  No test: the detached calls of the tests meet no defect.
- **T7.** A scenario that failed or was interrupted stops at once. Messages that arrive together. Part: a failed one
  (`src/testing/rehearse.test.ts`); none is interrupted while a job is held.
- **T8.** `drive`: "A wait that ends once a model shows a step does not wait for the step's commands." Part: a scenario
  that waits on sees a command's defect (`src/testing/drive.test.ts`); nothing checks that a wait that ended did not
  wait for the commands. Checked by the session.
- **T9.** `drive`: `patience` is "2 seconds by default". No test: each test of a patience gives one. Checked by the
  session.
- **T10.** "A wait may still match a model read before a defect of a later model." How `drive` ends. No test.

### Testing

- **T11.** "Then `Rejected` finds an editor with no place to write into, and `Missing` finds a place that the model
  shows as read-only." The reader. Part: `Rejected` and `Missing` are tested for plain messages
  (`src/testing/dispatch-violations.test.ts`); no test gives `dispatchViolations` the writes of an input and expects
  one.

## The candidates of the step

The step listed 25 candidates. Twenty are gaps above. Five were refuted:

- "Commands": "Once started, a command runs to its end, and its message arrives, even if the state has moved on."
  `src/run.test.ts`, where a slow command answers after a fast one moved the state, and its message is heard.
- "Subscriptions": a new subscription "under the kept key is not used". `src/engine.test.ts` and `src/core.test.ts`:
  the subscription is made anew on each state, and starts once. No test has a new one that differs from the old.
- "Events and external messages": "An external message reaches only `external`". `src/compose.test.ts`, where the
  child's `update` has no case for it and its `external` answers.
- "Running": "The run also calls `onApplied` before the listeners of the `App` are told, and before the message's
  commands start." `src/engine.test.ts`: a log that holds `onApplied` before the command's acquire, and an `onApplied`
  that throws, after which no listener is told.
- "View": a part under a Suspense boundary "is shown later, with the model of the state current then".
  `bridges/react.test.ts`, "an input Suspense hides, and shows again, shows the value the program put there meanwhile".

Two candidates are half refuted, and listed above for the half that is not: `applyAll` fails with the defect itself
(T3), and "Running", "It never succeeds" (R2).

## Refuted on a second reading

Six gaps that the readers reported have a test, found when each gap was checked again:

- "Running", "A model that the renderer reads after the defect is still made": `src/run.test.ts`, "a makeModel that dies
  as a run that died elsewhere stops a command is the second defect, in render".
- "View", what a message starts "runs later, in the run, with the run's services", for a subscription:
  `examples/stocktake/stocktake.test.ts`, whose scanner subscription reads a service provided around `drive` alone.
- "Writing a bridge", "Between two draws, the bridge to snabbdom draws nothing": `bridges/snabbdom.test.ts`, "a notice
  from a command is drawn in a microtask, once", which counts the draws.
- "Testing tools", `simulate`: "The program's subscriptions do not run": `examples/stocktake/stocktake.test.ts`, whose
  `simulate` provides no service of a subscription that its states listen to.
- "Commands", "The services of a command are provided around `run`": `bridges/react.test.ts`, "the program's services
  come from the runtime the application gives", and the form's tests of the bridge to snabbdom.
- "Composition", a command's answer for a child by id that is not there is rejected: the answer is the message by id
  that `src/compose.test.ts`, "the late message of a removed child is rejected", rejects.

## Unsorted

46 sentences could not be sorted. They are of four kinds, and step 12 asks the owner of none of them:

- **What Effect, a renderer or a browser does**, and not the library: `TestClock` and time moved before a sleep, a fiber
  forked and not joined, a value without structural equality compared by reference, `Effect.retry`, the span that keeps
  a log, that snabbdom reads `window` as it loads, where Chromium puts the caret, the peer ranges of the renderers.
- **A consequence of another sentence**, counted there: a child that raises an event for a click raises it whenever
  the click comes; an option cannot hold up the run; the run goes no faster than one draw a task; a command answers
  once.
- **Advice with a behaviour in it**: an expected failure becomes a message, an effect that only acts on the world
  answers `None`, `defect` is for the synchronous functions, export `Message` as a type only, give the program to
  `drive` and `rehearse` the same way.
- **A negative, or a "may"**: the library does not enforce the rules of a model, or of "Structuring a program"; the
  first run may have started the commands of `init`; a renderer is not stopped by the run; nothing is promised of a
  form's reset with React.

Two of them may be worth a test, if the owner counts them: an answer `None` sends no message ("Commands"), which no test
asserts, and "Composition", "An input. No `update` sees it", which `src/input.test.ts` holds only weakly.

## What follows

- **Step 12** takes the 65 gaps, and the sentence found false. The false one is for the owner first: the sentence, or a
  test that the bridge to snabbdom reads the model in the call, which it does not.
- **The types** are the cheapest: thirteen gaps (R1, R4, R5, C1, S1, P1, P6, D1, D2, A1, A2, A3, V1), each a
  `@ts-expect-error` or an `expectTypeOf` beside the tests of its function.
- **The negatives** (G3, G5, M1, V3) are held only by a test that fails if the library starts to check or to keep
  something. Step 12 asks the owner whether each is a sentence of behaviour.
- **What rests on a browser** (B5, B7) is for step 6, which runs the bridges in a real browser.
- **Step 13**: "What you can rely on" has a test for each item, and the gaps are on the other pages. A check that names,
  for each guarantee, the mutations that hold it would cover none of these 65. The method above is what a skill run
  before a release would do for the other pages.

## What step 12 made of it

Done on 21 November 2026 by a session of Opus 5.5, with four agents of Opus 5.5 that wrote the tests of behaviour, each
checked by the session against the full suite and against the mutations. No test came out failing: no sentence but the
one above was found false. The owner decided what the record left to them, on the advice of a reviewer of Fable 5.2 for
the negatives.

**The sentences the owner decided.**

- The sentence found false is changed: `makeModel` runs in the call that sends the message when a renderer reads the
  model there, "as the bridge to React may", which `bridges/react.test.ts` holds ("a new state's model is made in the
  notice, on the stack of whoever sent the message, and not again").
- G5 and V3: "keeps no state beside the program's state" was neither observable nor true to the letter, since the bridge
  keeps the tree it drew, the model it drew last, and what schedules its draws. It now reads "draws the model, and
  nothing else: what it shows of a controlled element is the value its model gave it", in "View", "Guarantees" and the
  skill, held by the suite of the bridges and the tests of an element no longer controlled.
- G3 is held by the test of G4, which takes a release that never ends under a `TestClock`. M1 promises no behaviour of
  its own, as the negatives under "Unsorted": the run could check the model only by making one that nobody read, which
  "a model is made only when read, once for each state" (`src/run.test.ts`) rules out, or by a defect for a rejection,
  which "a message that update rejects is ignored, and the program goes on" rules out.
- A3 is advice on the compiler's options, and has no test.

**The tests**, each in the file of its module, by gap:

- Types: R1, R4, R5, C1, S1 in `src/run.test.ts`; P1, P5, P6, D1, A1, A2 in `src/compose.test.ts`; D2 in
  `src/defect.test.ts`; V1 in `src/dispatch.test.ts`.
- `src/run.test.ts`: R2 ("never succeeds: …"), R6 and D3 ("neither onApplied nor onIgnored hears what a subscription
  sends once its key went away"), R7, R8, R9, R10, R11, G2 and C3 ("starts every command of a step, however many: a
  thousand run at once"), G3 and G4 ("a release that never ends holds the next job, then the defects the run would die
  with, with no defect of its own"), G7, G8, C2, and T2 in "hears every message update rejects", with a subscription's
  message. `src/start.test.ts`: R3. `src/engine.test.ts`: G1 and V2.
- `src/compose.test.ts`: E1, P2, P3, P4, P7 (two tests), P8, P9. `src/input.test.ts`: I2.
- The bridges: B1 in `bridges/bridge.test_suite.ts`, for both; B2, B3, V4 and B8 in `bridges/snabbdom.test.ts`; G6, B4,
  B6 in `bridges/react.test.ts`.
- The testing tools: T1, T4 and T5 (one test), T7 in `src/testing/rehearse.test.ts`; T8, T9, T10 in
  `src/testing/drive.test.ts`; T3, T11 in `src/testing/dispatch-violations.test.ts`. T9 waits two real seconds, by the
  owner's leave: `drive` reads the real clock on purpose, so a `TestClock` cannot move its patience.

Of the checks these tests hold, three that `docs/invariants.md` names had no mutation, or none that these tests kill:
"the options hear a message dropped before update" (R6), "drive ends with what the scenario ended with, before the
defects" (T10), and the existing "a child's state that is not an object dies of the WeakMap's TypeError", which now
names the test of a child alone (P7). R10 and R11 are killers of "update is called after the first defect". The rest
hold a form of the code, as the key a child's subscription is lifted under, and not a check that a mutation takes out.

**No test.**

- B5, B7 and I1 rest on a browser, and are named by step 6. Of I1: happy-dom, as a browser, does not apply `maxlength`
  to a value that a script sets, only to what a user types.
- T6: a call made once `rehearse` has ended is refused before it reaches the program (the contract's "in rehearse, it
  reaches no update, and its call is interrupted"), and the exit returned cannot change after, so the sentence is true
  by construction.

Found in passing:

- "after a defect of the program, model fails with it" (`src/testing/drive.test.ts`) reads the model in the scenario
  right after the dispatch that dies, and nothing orders that read before the run's death ends the scenario. It passes,
  since the scenario goes on in the same fiber, but no signal holds it.
- `bun run mutations --discover`, over the whole list, filled the memory of the machine. Under "the listeners are told
  before the new state is current", four tests of `src/compose.test.ts` looped in one synchronous call: the listeners of
  `script` and `nested` sent a message on every notice past the last one they waited for, and a listener told twice for
  each state reached that past. No timeout stops a loop that never yields. Both now send nothing once done. The same
  probe, each test file alone with a bound on its memory, found nothing else under that mutation and under "the very
  same state tells the listeners". So that it cannot happen again in silence, every run of `bun test` now preloads a
  memory guard (`test/memory-guard.test_hook.ts`), whose worker ends the process past 2 GB, and `bun run mutations`
  reports a run that it ended as one that ran away, with its files under `--discover`. With the helpers of before
  put back, `--discover` of that mutation named `src/compose.test.ts` and kept the memory under the bound.
