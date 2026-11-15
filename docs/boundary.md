# Where the library ends: what is left across and after the model

**Status:** items 1 to 5 done on `main`, 14 November 2026, and items 8, 6 and 7 on 15 November 2026; item 9, the
question of the wrapping, was answered no on 15 November 2026 ([`rejected.md`](rejected.md)). Rewritten the same
day from the inventory it
was (`d13bd6f`, whose tables and sections 1 to 3 describe the repository before item 1 and are kept there, in the
history). Made by one model (Fable 5.2) on Effect 4.1.4 and Bun 1.4.4. "What it rests on" says what was read again in
the code today, at `1d0ccc9`, and what is carried over. Read again on 15 November 2026, at `7074b7a`, after the port
of the plain input ([`registers.md`](registers.md)): items 8 and 9 say what the port added to them. The places cited
in items 6, 7 and 9 were read again at `9903b9c`.

## Context

The principle weighed: **the library ends at the model.** Before it are the state, `update`, commands, subscriptions,
composition, the run and its guarantees, and the pure tests of them. After it, how a model is drawn, and how one
checks that the drawing matches, are the user's and his framework's.

It holds of the view, and since item 1 of the contract too: the library's promise is of the model with `update`
(README, "Model", "What is left to you", "Testing"), a test reads a model's messages with a function of its own, and
no bridge owes the library anything. It does not hold of the renderer, and is not meant to: the run knows a renderer
as the effect that pulls frames and calls a dispatch, with a scope of its own, and three guarantees name it. So the
boundary the code has is **the frame**, a model and a dispatch. What follows is what is still on the far side of it.

## What was done

| Item | What | Commits on `main` |
| --- | --- | --- |
| 1 | The contract is of the model, not of the view: the examples' tests read their models, React's `messagesSentBy` is removed and snabbdom's kept as an example, the README says that messages live in the model | `ed9ffd0`, `8c3f2a1`, `495800c`, `89be433` |
| 2 | The rule on React views is advice on what a view may keep | `858c5f8` |
| 3 | `dispatchViolations` has the words of what it takes: the messages a model holds | `910b343` |
| 4 | "Inputs the user types into" keeps the cause and `update`'s rule; the remedy is the examples'. **Reopened** by [`registers.md`](registers.md): the rule is the library's, for an input declared in `compose`, and `examples/field.ts` is gone | `36119ad` |
| 5 | The bridges' tests are examples' tests, not among the library's five kinds | `87e5e35` |
| 8 | What a dispatch sends has the origin `'Dispatch'`, and the run's words name a dispatch where they named the view | `9903b9c` |
| 6 | `View` is no longer exported: each bridge declares the type of its views, `View<Model, Message>` | `18f813b` |
| 7 | A frame's model is made as the renderer pulls it, and `rehearse` makes the model of each new state as it applies the message | `606b6e9` |

What each found that the inventory did not have is in this document as `1d0ccc9` left it ("Item 1, as done",
"Items 2 to 5, as done"). Three findings bear on what is open:

- **No example had to change its model**: each already held every message of its controls.
- **A reader belongs to a program, and composes as models do**: a child's is shared (`examples/timer/reader.ts`), and
  a parent's wraps what it returns (item 9).
- **A reader that forgets a field is found only by `Missing`**, in a state where `update` accepts the field's
  message and the test lists it among the candidates. The reader is trusted as the candidates are (see
  [`declared-inputs.md`](declared-inputs.md), "What still makes sense").

## Candidates

Item 7 is breaking; 0.8.0 is open and unreleased. Items 6 and 8 are done, and kept below as they were weighed.

### 6. Take `View` out of the exports (done)

- **As done.** Decided by the owner on 15 November 2026. The type is gone from `dispatch.ts`, the index and the API
  report; `examples/snabbdom.ts` and `examples/react.ts` each export `View<Model, Message>`, with their node type, and
  the views and the bridges' tests import it from there. The README keeps "View" in prose, says that each bridge
  names the type, and its API reference has a row for `Dispatch` alone.

- **What it is today.** `View<Model, Message, Node>` is one line (`dispatch.ts:20`), used by no module of `src/` but
  the one that defines it. Twelve files of `examples/` import it (eight views, the two bridges and their tests), and
  the README has it in "Children's views" and in the API reference.
- **Removes**: the type, a row of the API reference, and the library's one name for something after the model.
- **Costs**: each bridge declares it, and each view imports it from its bridge. The README's "View" still says what
  a view is, `(model, dispatch) => Node`, in prose.
- **A consumer notices**: an import that no longer resolves.
- **Read again**: it constrains nothing and nothing rests on it. It is a name, and "A function earns its place" does
  not judge a type.

### 7. Make the model when the frame is pulled, not when it is read (done)

- **What it was.** `lazyFrame` (`run.ts:102`) made the model in a getter, after the sliding buffer
  (`run.ts:62`); a frame's `seen` is a plain field beside it. `drive` keeps every frame it pulls and reads a model only
  when the scenario asks, so it records a defect of `makeModel` in the run's register by hand (`drive.ts:82`–`88`),
  held by two mutations ("drive keeps no defect of makeModel the scenario caught", "drive goes on after a defect of
  makeModel until the scenario ends").
- **Removes**: the getter, `drive`'s recording and those mutations, a sentence of `invariants.md` ("a frame's model is
  made when first read") and the warning of `Frame`'s comment about a spread.
- **Costs**: `drive` would make a model for every frame it pulls, read or not, and a defect of `makeModel` would end
  a scenario that never looked at that frame. The README's "a model is made only for the frames the renderer reads"
  becomes "pulls", and the search (`interleaving.test.ts`) checks the first.
- **A consumer notices**: a renderer that pulls a frame without reading it pays for its model, and meets a defect of
  `makeModel` sooner.
- **Read again**: the code is as the inventory found it. That a `Stream.map` after the buffer runs only for the
  frames pulled was run by the inventory (2 mapped for 2 pulled of 101) and not again. Nothing was tried against
  `drive`'s tests, the contract tests or the search: it cannot be settled by reading.
- **Tried** on 15 November 2026, at `18f813b`, on a branch (`claude/model-when-pulled`), by Opus 5.5: the model made in
  the `Stream.map` after the buffer, `lazyFrame` and `drive`'s `shown` removed (21 and 5 lines). The typecheck and the
  lint pass, and 632 tests of 635. The premise holds: "a model is made only for the frames the renderer pulls, never
  for a state the buffer dropped" (`run.test.ts`, in place of "… whose model is read, once each") makes 2 models for 2
  frames pulled of 4 states, and 4 with the map before the buffer. What fails is what the getter alone allowed:
  - "a makeModel that dies as a run that died releases the renderer is the second defect, in render" (`run.test.ts`)
    and "fails with the defects in the order they happened" (`drive.test.ts`, which now waits for its patience) read a
    model first after another fiber has died. The model is made as the frame is pulled, before that death, so the
    order they check has no scenario left: a defect of `makeModel` after another needs a frame pulled after it, of a
    step whose `update` was called before. Both would go, or be written again with such a step.
  - "drive fails, as rehearse does, in render first, then with what a scenario that caught it ended with"
    (`contract.test.ts`): `rehearse` still makes the model when the scenario asks, so its scenario meets the defect
    and goes on; `drive`'s never does, the renderer dying as it pulls, and ends with `['render']` alone. The tools
    differ there unless `rehearse` makes its model at each step too, which "drive without the getter" left open.
  - The search: `made` equals the frames read no more, and "a model is made once for each frame the renderer pulls"
    holds with `made` at most one more than the frames drawn, a frame pulled as the end interrupts the renderer (seed
    `-1767139819`, path `0:2:1:1:1:4:2:5:7:6:3:7:11:6:7:7:10:12:14:13:14:14:35`, made 3 for 2 drawn); eleven runs of 60
    scenarios found nothing else, and the other properties of one whole run pass. "A frame never read" of the scenarios reached means nothing after it.

- **Done** the same day, by the owner's decision, with `rehearse` brought in step: it makes the model of each new
  state in the step that makes it, under `'render'`, the test being a renderer that pulls every frame, where it made
  it as the test read `model` or sent. So a defect of `makeModel` ends each tool as it ends the run, and no scenario
  meets it; "drive fails, as rehearse does, in render alone: the scenario that would catch it never meets it"
  (`contract.test.ts`) holds both. The two tests of the run read now a frame pulled anew in the renderer's release,
  which the frames replay ("a frame the renderer pulls as a run that died releases it still makes its model"); that of
  `drive` went, its order being the run's register, which those tests hold. The search checks that a model is made
  for each frame pulled, at most one more than the frames drawn. Of the mutations, "drive keeps no defect of makeModel
  the scenario caught" went; "drive goes on after a defect of the program until the scenario ends" stays, killed by
  two tests of `drive.test.ts`; "the run makes a model for every state, before the buffer drops it" is new. In
  `rehearse`, a read of the model could no longer die in a `select`, which left "rehearse calls update after the first
  defect" with no killer: a command that the `select` runs, and that dies at once in a fiber `FiberSet.run` starts as
  it is forked, records its death there instead ("send calls no update once a command run in its select has died").
  What the tools share of the model is a rule, not code: a function of the core that makes it would be `makeModel`
  under a name ([`shared-core.md`](shared-core.md)), and `simulate` has no model.

### 8. Call what a dispatch sends by its name (done)

- **As done.** The tag is `'Dispatch'`, and `Core.fromDispatch` its source. The words changed where the run names
  where a message comes from, numbers it or counts it: the comments of `core.ts`, `engine.ts` and `dispatch.ts`,
  `invariants.md` and `premises.md`, the names of the tests and mutations that count a frame's `seen`, and in the
  README "View", `origin` in "Running", and "Guarantees" and "Testing". They stayed where the view is meant: "What
  the view draws never does" and "a message of the view" in "Rejections and defects" say why `update` rejects (a tap
  on a frame drawn before), `reject`'s comment speaks of a control the view shows, and "the test, or the view through
  it" in "The tools" of a test that drives a view.

- **What it is today.** `Origin`'s case is `'View'` (`engine.ts:30`, `core.ts:195`), and `Core.fromView` is the
  source `rehearse` and `simulate` give to a message the test sends (`rehearse.ts:289`, `simulate.ts:129`): the name
  is already untrue where no view exists. The words: `reject`'s comment (`update.ts:19`), "Enqueues a message sent
  by the view" (`engine.ts:236`), and in the README "what the view draws never does" and "a message of the view"
  ("Rejections and defects"), `origin`'s description in "Running", "what the view sends is queued" in "Guarantees",
  and "the test or the view" twice in "The tools".
- **Since the port**, the tag has a second use: the run numbers the messages of that source, and a frame's `seen`
  counts them (`engine.ts:397`, where the tag is tested). The words grew with it: "how many of the view's messages"
  (`engine.ts:234`), "the view's messages are numbered" (`engine.ts:323`), and in the README "among those the view has
  sent" in "View", "A frame says what it has seen" in "Guarantees" ("Each message the view sends is numbered") and
  "the view's messages" in "Testing". A message a test sends is numbered as one of the view's in `drive`, since it
  goes through the run's dispatch.
- **Removes**: nothing. It makes the run speak of what it knows, a dispatch.
- **Costs**: the words are free. The tag is a rename through `core.ts`, `engine.ts`, their tests and the README.
- **A consumer notices**: an `onApplied` or `onIgnored` that matches `origin._tag === 'View'`.
- **Read again**: the list above is today's, at `7074b7a`. It splits in two: the words alone (a changelog entry at
  most), and the tag (breaking).

## A question: the wrapping of a child's message, before the model (answered: no)

`dispatchTo` stays where it is: its cache is what earns it its place, and each memoizing bridge would otherwise
write a `WeakRef` and a `FinalizationRegistry` again. The question is narrower: whether the library offers, as a
pure function, how a parent receives a child's message (`{ _tag, id?, message }`), for `dispatchTo` and a test's
reader to share.

What the code has, read today:

- **The shape is written twice in `src/`, and typed three times.** `compose.ts:357`, `wrapMessage(place)`, used for
  a child's subscriptions (`:449`) and for the answers of its commands (`:527`); and `dispatch.ts:98`, inline in
  `dispatchTo`. The types are `ChildMessages` (`compose.ts:172`), `InputMessages` (`compose.ts:131`), since the port
  the same shape without an id for a write into an input, and `Routed` (`dispatch.ts:24`). The two functions differ in
  how they know that a child is by id: `compose` asks its configuration, `dispatchTo` whether an id was given.
- **The tests write it a third time.** `list` and `timers` have `to(id, message)`, one line, and `pages` two
  literals. Each had it before the readers, to build its candidates and the messages of its own tests: the readers
  added no wrapping, they reuse it. Since the port, `form` writes it for an input, `{ _tag: 'Name', message:
  write(model.name, text) }`, in the messages of its own tests and in no reader, since a write is no message of the
  model's.
- **The compiler already checks the literal.** A wrong child name, a missing or mistyped id, a message of another
  child: none compiles, since the literal is typed as the parent's `Message`. A wrong id of the right type compiles,
  with a function as with a literal, and the test finds it (`Rejected`, and `Missing` for the right one). One case
  escapes the literal: a stray `id` on a child that is alone compiles when the literal is not fresh (a `const`
  assigned later, or the result of a `map`), where a function would refuse it. It is the one check a function adds;
  what the engine does with such a message was not run.
- **It is not the only shape a parent's test rebuilds.** A child's command is `{ _tag, id?, command }`
  (`compose.ts:358`; `pages` asserts one by hand), and a lifted key `[name, id, key]`. A function for messages
  alone covers one of three.
- **A function has no value to infer the parent's `Message` from**, but the parent program is one. `dispatchTo`
  infers it from the dispatch it is given; a function given the parent program, `messageTo(list)('Stopwatch', 1)`,
  typed correctly in a probe with a few lines of types like `Routed` and `IdOf`. Inference is no obstacle.

By "A function earns its place": the wrapping is an object literal, so Effect is not in question, and the test is
whether it is "the one place where a rule of the library is applied". Today the rule is applied by the types, in
every place a parent's message is written. A function would add a name, and no check the literal lacks: `attempt`,
`silent` and `Subscription.every` were removed by this rule. What would change the answer is a tool that must lift
without a type to lean on: the third spike of `declared-inputs.md` lifted a child's offers with the function
`dispatchTo` used, because a walk of a model had no other way. With readers written by hand there is no such tool.

Apart from the question, and with no change of the API: the two places of `src/` could share one internal function.
It would share only the spread, since they decide differently whether a child is by id, and it would add an import
between `compose.ts` and `dispatch.ts`, which have none.

**Answered, 15 November 2026:** neither. The owner decided against the public function and the internal one, after
the claims above were checked with a scratch probe of `tsc` against the `list` and `pages` examples (outside the
repository, deleted), by Fable 5.2: the probe found the stray `id` and the inference from the parent program. The
entry, and what would reopen it, is in [`rejected.md`](rejected.md).

## Not on the list

The renderer as an effect of the run, the sliding buffer, a child's model kept by its state object, and the state as
an object: the principle does not reach them. Whether "the run ends when the renderer ends" and the order of the stop
would be simpler as the user's, and whether a renderer could skip frames by itself, were not tried, and nothing asks
for them.

## What it rests on

- **Read again today**, at `1d0ccc9`: `src/dispatch.ts` whole; `src/compose.ts` where it wraps, lifts and keeps a
  child's model; `src/run.ts` and `src/testing/drive.ts` where the frame is made and read; every use of `View` and of
  `'View'` in `src/`, `examples/` and the README; the readers of `list`, `timers`, `pages` and `timer`; the README's
  "Model", "View", "Guarantees" and "Testing"; the names of the mutations of `dispatchTo` and of `drive`.
- **Carried over**, from the inventory and from the sessions that did items 1 to 5: what was run for them
  (`typecheck`, `lint`, `test`, `test:node`, `interleavings`, `mutations`, the site's build, all passing at
  `1d0ccc9`), and the scratch run of `Stream.map` after a sliding buffer.
- **Not run** for this rewriting: anything. No file but documents changed.

## Open questions

- **Who checks the reader** (answered: `Missing` is enough, 15 November 2026, [`rejected.md`](rejected.md)). A model's
  messages are not marked, so no function of the library finds them. Whether trusting the reader as the candidates are
  trusted is enough is the one thing the third spike of `declared-inputs.md` still answers. Since the port, the question
  is of a model's fixed messages alone: an input is a value of the model, and its writes are no message a reader
  returns.
- **A renderer with no tree to walk** (React Native, a canvas, a terminal). The contract of the model asks nothing
  of it now. That its drawing can be checked with its own tools is the README's word, and no such bridge was
  attempted.
- **An application.** How long a reader is for a model larger than the examples' is not measured.
