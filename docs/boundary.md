# Where the library ends: an inventory of what lies before, across and after the model

**Status:** proposed, 14 November 2026, and items 1 to 5 of section 4 done on the branch
`claude/model-contract-c0da5a` (see "Item 1, as done" and "Items 2 to 5, as done"). Items 6 to 9 are not done, and
nothing of them is designed. It is an inventory for the owner to
strike lines from, made by one model (Fable 5.2) on Effect 4.1.4 and Bun 1.4.4. Sections 1 to 3 describe the
repository as it was before item 1. "What it rests on" says what was run and what was only read.

## Context

The principle weighed, not decided: **the library ends at the model.** Before it are the state, `update`, commands,
subscriptions, composition, the run and its guarantees, and the pure tests of them. After it, how the model is drawn,
and how one checks that the drawing matches, are the user's and his framework's.

Three sides are told apart below. **Before**: up to and including `makeModel`. **Across**: what carries a model out and
a message back in (a frame, a dispatch, the renderer as an effect of the run). **After**: what is said or done of a
view, a node, a handler, an input.

## 1. The inventory

"Serves" is the program (P), the renderer (R), or a test of the view (V). A dash is "nothing found".

### Exports of `src/index.ts`

| Export | Side | Serves | What it stops or costs |
| --- | --- | --- | --- |
| `Program` | before | P | requires `makeModel` and an object state (`program.ts:79`) |
| `StateOf` … `ServicesOf` (eight) | before | P | — |
| `subscriptionsOf` | before | P | — |
| `parent` | before | P | keeps each child's model by its state object, for a renderer to skip (`compose.ts:232`, `:395`) |
| `Update`, `Transition`, `Step` | before | P | — |
| `reject`, `Rejected`, `isRejected` | before | P | its comment sends to "a control the view shows" (`update.ts:18`) |
| `andThen`, `forEach`, `raise` | before | P | — |
| `Execution`, `RunCommand` | before | P | — |
| `Subscription`, `Subscriptions` | before | P | — |
| `Dispatch` | across | R | must need no services and complete synchronously, so the queue stays unbounded |
| `View` | after | R | used by no module of `src/` but the one that defines it: a name for bridges |
| `dispatchTo` | across | R | a weak cache, a `FinalizationRegistry`, three mutations, eight tests (`dispatch.ts:55`–`103`) |
| `run` | across | P, R | takes the renderer as an effect of the run: its scope, its end, its defects (`run.ts:65`–`82`) |
| `Frame` | across | R | its `model` is a getter, read lazily (`run.ts:100`) |
| `RunOptions` | before | P | — |
| `Applied`, `Ignored` | before | P | — |
| `Origin` | before | P | names the sender of a dispatched message `'View'` (`engine.ts:30`) |
| `ProgramDefect`, `DefectSite` | before | P | a site is `'render'`, "the view and `makeModel` included" |
| `defect`, `InvariantDefect`, `CompositionDefect` | before | P | — |

### Exports of `src/testing/index.ts`

| Export | Side | Serves | What it stops or costs |
| --- | --- | --- | --- |
| `applyAll` | before | P | — |
| `dispatchViolations`, `DispatchViolation` | before in code, after in words | V | takes messages, not a view (`dispatch-violations.ts:37`); only its name and prose speak of one |
| `simulate`, `Simulation` | before | P | — |
| `rehearse`, `Rehearsal`, `RehearseOptions` | before | P | `send` reads the model with a function of the test (`rehearse.ts:284`) |
| `drive`, `DriveOptions`, `Driver` | across | P | is its own renderer; patches the lazy model's defect back into the run (`drive.ts:82`–`87`) |

### Rules of `AGENTS.md`

| Rule | Side | Serves | What it stops or costs |
| --- | --- | --- | --- |
| Generic, and only Effect | the boundary itself | R | says the library knows no renderer; `View<…, Node>` is its one trace |
| An API of its own | before | P | asks symmetry of `drive`, `simulate`, `rehearse`; says nothing of a view |
| A type is Effect's or the library's | before | P | — |
| A function earns its place | before | P | `dispatchTo` passes it only by its cache; `View` is a type, outside the rule |
| Only stable APIs; nothing deprecated | before, and after | P, R | reaches React's `unstable_` APIs in the bridges |
| Peer range; changelog; README as specification | before | P | the README's view sections are specification too |
| Inv.: `update` pure, called freely | before | P | — |
| Inv.: `reject` means one thing | before | P | forbids a model that asks `update`: the two are checked by a test |
| Inv.: parent and children; state in an object | before | P | the object rule rests on the model cache and on the lifted subscriptions (`compose.ts:364`) |
| Inv.: running a dispatch | across | R | "the renderer's business: no helper" |
| Inv.: defects; subscriptions; commands; scopes | before | P, R | the renderer has a scope of the run's |
| Inv.: frames cost only what is drawn | across | R | forbids models made eagerly in `run` |
| Inv.: `onApplied`/`onIgnored`; tools like the engine; logs; premises | before | P | — |
| Tests: pure pieces | before | P | — |
| Tests: random histories | before | P | draws "clicks" as dispatches; no view |
| Tests: contracts | before, and after | P, V | "one view to each bridge", `messagesSentBy`'s tests included |
| Tests: boundary of a run | across | P, R | includes `dispatchTo`'s cache and "a bridge's `renderInto`" |
| Tests: types | before | P | — |
| Only the bridges' tests register a DOM | after | V | — |

### The README's "Guarantees"

| Guarantee | Side | Serves | What it stops or costs |
| --- | --- | --- | --- |
| One message at a time | before | P | "what the view sends is queued as it is sent" |
| Outdated clicks are harmless | before | P | — |
| Subscriptions follow their keys | before | P | — |
| Nothing outlives what acquired it | before, across | P, R | names the renderer: its scope is the run's to close |
| Logs do not pile up in a span | before | P | — |
| Nothing ends in silence | before, across | P, R | names the renderer: its defect and its self-interruption |
| Frames cost only what is drawn | across | R | the lazy getter, and what `drive` does about it |
| (left) Commands run to their end; nothing is bounded | before | P | — |
| (left) A slow renderer skips frames | across | R | a sliding buffer of one (`run.ts:60`) |
| (left) The view sends what `update` accepts | after | V | needs `messagesSentBy`, which a bridge may be unable to write |
| (left) Purity, states never mutated | before | P | "the library reuses a child's model" |

### Sections of the README's "Guide" and "Testing"

| Section | Side | Serves | What it stops or costs |
| --- | --- | --- | --- |
| Anatomy; Update; Commands; Subscriptions | before | P | — |
| Model | before | P | lets a view build its own messages from a model of data (l. 217–219) |
| View | across, then after | R | from "A bridge does three things" on, a rule for React views (l. 229–235) |
| Inputs the user types into | after | R | one fact of the run, then two rules for a DOM input |
| Rejections and defects | before | P | "what the view draws never does" is a fact about dispatch, not about a view |
| Composition, but "Children's views" | before | P | "it is the same object … so a renderer can skip" (l. 474–478) |
| Children's views | across | R | teaches `dispatchTo` against a lambda |
| Structuring: state and messages; splitting | before | P | — |
| Structuring: model and view | before, and after | P, V | "a view draws, it never decides": advice the library cannot check |
| Running | before, across | P, R | the renderer's end, its skipped frames, its release order |
| Testing: how a program is tested | before, and after | P, V | point 2 and four bullets specify `messagesSentBy` (l. 796–806) |
| Testing: the tools | before | P | "a message the test or the view sends" |

## 2. What is across or after the model

- **`Dispatch`.** There for a handler that is a plain callback. Nobody else can give it: it is the run's queue. A user
  would lose every way to send. It stays, and is the one thing a renderer must be told about the run.
- **`View`.** A name for `(model, dispatch) => Node`. No module of `src/` uses it; both bridges and every example's view
  import it. A bridge would declare it in one line. A user loses a shared name, and the library its only word about
  what a view is.
- **`dispatchTo` and its cache.** It wraps a child's message as the parent receives it, and is the same function while
  anyone holds it, so that a renderer memoizing by identity skips a child. The wrapping is one line a user writes; the
  identity is the hard part (a `WeakRef`, a `FinalizationRegistry`, a premise about their order in `premises.md`). It
  knows the shape `{ _tag, id?, message }`, which is composition's and no renderer's. Without it, each bridge that
  memoizes writes the cache again, or its views are drawn on every frame.
- **The lazy model, and "Frames cost only what is drawn".** Two halves. "The very same state draws no new frame" is a
  fact of the state (`engine.ts:415`): before the model. "A model is made only for the frames the renderer reads" is a
  getter (`run.ts:100`). A scratch run showed that a `Stream.map` after the sliding buffer runs only for the frames
  pulled (100 states, 2 pulled, 2 mapped), so without the getter a renderer that draws what it pulls loses nothing. The
  getter serves a consumer that pulls without reading: `drive`, which stores every frame (`drive.ts:96`) and then has to
  record a defect of `makeModel` in the run's register by hand (`drive.ts:82`–`87`). It also costs a paragraph of
  `invariants.md`, two sentences of "Running", and the warning in `Frame`'s comment about a spread.
- **A child's model kept by its state** (`compose.ts:395`). There only for a renderer that skips a child, as `thunk`
  does. A child could memoize its own `makeModel`. But the rule it is blamed for, a state that is an object, rests on
  the lifted subscriptions too (`compose.ts:364`), which are the engine's: taking the model's half out removes ten
  lines and no rule.
- **`dispatchViolations`.** Its code takes a state, messages and candidates, and knows no view. `Rejected` and
  `ActsTwice` judge a message against `update`; `Missing`, `withheld` and `repeatable` likewise. What is of the view is
  where the messages come from, the name, and the words "control", "frame" and "double tap" in its comment.
- **"The view sends what `update` accepts"**, and the README's fourth opening claim, "the view is checked against
  `update`". It is the library's only promise about a view, and the one it cannot keep everywhere: it holds where a
  bridge can enumerate handlers without mounting.
- **`messagesSentBy` as a duty of a bridge.** It walks the renderer's tree (`snabbdom.ts:72`–`103`;
  `react.ts:62`–`120`, which calls classes, `memo` and `forwardRef` by React's internal symbols). It cannot be written
  for a component with hooks, a third-party component, a canvas or a native toolkit. If the library asked nothing of
  it, a test would read the model with a function of its own (section 3), and whoever wants the drawing checked would
  use his framework's tools.
- **"Inputs the user types into", and `examples/field.ts`.** The cause is the run's: a frame may be older than the last
  keystroke, since a handler returns before `update` and a slow renderer skips frames. The remedy (`key`,
  `defaultValue`, `initialValue`, `Field`) is a DOM input's. "Input is never a reason to reject" (l. 596) is a rule for
  `update`, and stays before the model whatever is done with the rest.
- **A React view is never a component with state or hooks.** The reason given is "the frames are the only truth". The
  reason in the code is `messagesSentBy`, which calls components as functions. Without that duty the rule has no
  mechanical ground left; what remains is advice ("a view draws, it never decides").
- **The bridges' tests among the five kinds.** `AGENTS.md` lists them under contracts and under the boundary of a run,
  and says a line later that the examples' tests are no test of the library's correctness. They test `renderInto`,
  inputs and `messagesSentBy`: all after the model.
- **`run` taking a renderer, and `drive`'s frames.** See section 3: this is where the principle stops.

## 3. Whether "the library ends at the model" holds

**It holds of the view.** Nothing in `src/` calls a view, reads a node or knows a handler. `rehearse` and `drive`
already end at the model: both act through `select: (model) => Option<Message>`, a reader the test writes.

**It does not hold of the renderer.** The run knows it as an effect that pulls frames and calls a dispatch, and three
guarantees name it:

- **Its scope and its end.** The run forks it, ends when it ends, records what it dies of under `'render'`, and as it
  stops, stops the loop first, then the renderer, then the rest (`run.ts:77`–`82`), so that what the renderer sends as
  it releases is not applied. Two mutations and several premises hold this. A renderer outside the run would take
  "Nothing outlives what acquired it" and "Nothing ends in silence" with it, as the user's to keep.
- **A slow renderer.** The sliding buffer is the run's (`run.ts:60`). Whether a renderer could do it for itself over the
  states as the engine publishes them was not established.
- **A plain callback.** That a dispatch needs no services and completes synchronously is a promise to a renderer.

So the boundary the code has is: the library ends at **the frame**, a model and a dispatch, and knows a renderer only
as the effect that consumes frames. Everything after the model that the library says is in prose and in `examples/`.

**A contract of the model with `update`, with no view, can be stated and tested on today's API.** Tried in a scratch
test, deleted: for each of `timer`, `timers`, `form`, `list` and `pages`, a function from the model to the messages it
holds, given to `dispatchViolations` with the examples' own states, options and candidates. All five pass, and over
the same generated states each reader returns exactly the messages `messagesSentBy` returns from the real view.

| Example | The reader | What it costs |
| --- | --- | --- |
| `timer` | 12 lines, a `switch` over the model's four cases | the compiler checks the cases, not the fields |
| `timers` | 7 lines, calling the timer's reader | wraps each child's message as `{ _tag: 'Timer', id, message }` by hand |
| `form` | 10 lines, taking the text typed | calls `changeName(typed)`, as a bridge's stand-in event does |
| `list` | 11 lines with the stopwatch's | wraps by hand, as above |
| `pages` | 4 lines | wraps by hand; `withheld` is still needed (see `inert-steps.md`) |

What it does not say, that the view's test says today:

- **That the view draws what the model holds**, each control once, through the right dispatch. A wrong child name in
  `dispatchTo` does not compile; a wrong id does.
- **That the reader is complete.** A reader that forgets a field of a case passes `Rejected` and `ActsTwice` (checked:
  one that forgets `reset`); only `Missing`, with candidates, finds it. The view has the same hole today.
- **Anything of a program whose view builds its messages** from a model of data, which the README allows (l. 217–219).
  There the model holds nothing to read, and the contract needs the view. The principle asks that this option goes.

And the contract with the model says of the screen only what "a view draws, it never decides" lets it say: that rule,
advice today, becomes what the promise rests on.

## 4. What it would simplify, and what it would make more elegant

Ordered by how much each removes for how little it costs. Each can be struck alone, but 2 and 3 lean on 1.

1. **State the contract of the model, not of the view.** Done, with two changes the owner asked for (below).
   Removes: the duty of a bridge to write `messagesSentBy`
   (README l. 229–230, 796–806), both implementations and their tests (some 95 lines of the bridges, two
   `describe`s), a clause of the contracts kind in `AGENTS.md`, a section of `add-example`, a page of the tutorial.
   Adds a reader in each example's test (4 to 12 lines). README as specification: the left-to-you guarantee and the
   fourth opening claim speak of the model; "Model" loses the option of a view that builds its messages, or keeps it
   as untested. Consumer:
   nothing of the package changes; a changelog entry for the README, no version.
2. **Drop the rule on React views.** Removes one sentence of "View" and the comment at the head of `react.ts`. README:
   one rule less, replaced by nothing or by the advice already in "Structuring". Consumer: no.
3. **Give `dispatchViolations` the words of what it takes.** Its comment and the README's table speak of messages a
   model holds. A new name would be breaking (an entry under 0.8.0); new words are not.
4. **Shrink "Inputs the user types into" to its cause.** Keeps: a frame may be older than the last keystroke, and input
   is never a reason to reject. Moves the remedy, `field.ts` and `initialValue`, to the examples as examples. README:
   the same promise about the run, no rule about inputs. Consumer: no.
5. **Take the bridges' tests out of the five kinds.** They become examples' tests, which `AGENTS.md` already keeps
   apart. Removes two clauses of "Tests". Consumer: no.
6. **Take `View` out of the exports.** Removes a type no module uses; each bridge declares its own. Consumer: yes, an
   import that no longer resolves; breaking, an entry under 0.8.0.
7. **Make the model when the frame is pulled, not when it is read.** Removes the getter, `drive`'s recording of
   `makeModel`'s defect, a paragraph of `invariants.md`, two sentences of "Running" and `Frame`'s warning. README: "a
   model is made only for the frames the renderer reads" becomes "pulls". Consumer: yes, where a renderer pulls a frame
   and does not read it, and in when a defect of `makeModel` is met; breaking.
8. **Rename what the run calls the view.** `Origin`'s `'View'`, "the view" in "Guarantees" and in the tools' table, are
   "a dispatch". Elegance only; breaking for `'View'`.
9. **Move `dispatchTo` out.** Removes 50 lines, three mutations, eight tests, a premise and an invariant. Costs each
   memoizing bridge the hardest code on this side, and takes from the package the one function that knows how a parent
   wraps a message. Breaking. Last, since it removes least for most.

Not on the list, since the principle does not reach them: the renderer as an effect of the run, the sliding buffer, the
child's model kept by its state, and the state as an object.

## Item 1, as done

On `claude/model-contract-c0da5a`, in four commits: the examples' tests, the bridges, the README with its changelog
entries, and the rest. Two changes to the item as written above, agreed with the owner: `messagesSentBy` stays in
`examples/snabbdom.ts`, with its tests, as an example of how to check the drawing and no duty of a bridge, and only
React's is removed; and the README no longer offers a view that builds its messages ("Messages live in the model").

What the inventory did not have:

- **No example had to change its model.** `counter`, `duration`, `pages` and the others already hold every message
  of their controls: the rule was kept before it was one.
- **A reader belongs to a program, not to a view.** `counter-react` and `form-react` draw the programs of `counter`
  and `form`: their tests became copies of those, and are removed. React's bridge is still tested in a DOM.
- **Readers compose as models do, so a child's reader is shared.** `timers`' reader calls the timer's, which two
  test files then need: it lies in `examples/timer/reader.ts`. The scratch test, being one file, did not show it.
  `list` keeps the stopwatch's in its test, the only one that needs it.
- **The wrapping by hand was already there.** `list`, `timers` and `pages` wrapped their candidates by hand
  before (`to(id, message)`), and the readers use the same function. A reader that wraps with a wrong id fails
  (`Rejected`, and `Missing` for the right one), since the candidates come from the state, not from the reader.
- **The readers, as they stand**: `counter` 2 lines, `duration` 1, `timer` 12, `timers` 7, `form` 10, `list` 9 with
  the stopwatch's, `pages` 4. A reader's order means nothing to `dispatchViolations`; `list`'s follows its view,
  for the one test that compares the two.
- **Seen to fail**, each in its own test and then restored: for every example, a model that holds what `update`
  rejects (or, for `pages`, whose `update` rejects nothing of a page that is there, a reader that wraps a message
  for the wrong page), and a reader that forgets a field; for `list` and `timers`, a reader that wraps with a wrong
  id; for `list`, a view that gives a stopwatch another's dispatch, which only the test of the view finds.
- **A forgotten field hides a `Rejected` too.** A reader that forgets a field does not show a control the model
  holds where `update` rejects it. `Missing` finds the field in the states where `update` accepts it, which is
  how the README's "Testing" now words it.
- **Six of the seven tests no longer load a view or a renderer.** Only `list`'s does, for the optional test of
  its view.
- **One clause of `src/` changed**, in the comment of `dispatchViolations`: the messages are "as a test reads them
  from the model", where they were "collected from what the renderer draws". Nothing else of `src/`.
- **The changelog** has three entries under 0.8.0, which was already open, and no new version, as the inventory
  judged. They replace the unreleased entry that said what a bridge's `messagesSentBy` must do.

Left as it was then, for the items it belonged to: what items 2, 3 and 5 have since changed (below), and
`reject`'s comment, `Origin`'s `'View'` and "what the view sends" in "Guarantees" (item 8).

Run at the end: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run mutations` and the site's build.

## Items 2 to 5, as done

On the same branch, a commit each, as the owner asked them.

- **Item 2.** "View" loses its sentence on React views, and "Model and view", in "Structuring a program", gains
  the advice: what is only the screen's (a hover, an animation, the focus) may stay in a component of the
  renderer's, and what the program decides stays in its state. The head of `examples/react.ts` follows. Not in
  the inventory: one fact of the old rule is no advice and stays, in that comment alone. The bridge calls a view
  outside React, so the view function itself can use no hook; a component in the tree it returns can. No example
  has such a component, and no test shows one keeping its state across frames: it is React's own behaviour for a
  component of the same type at the same place, read and not run here.
- **Item 3.** The comments of `dispatchViolations` and of `DispatchViolation`, the README's table of the tools
  and its bullet speak of the messages a model holds. No name changed: the parameter is still `sent`, which the
  comment now introduces as those messages. Not in the inventory: four tests of
  `src/testing/dispatch-violations.test.ts` named the view, and are renamed, as `AGENTS.md` asks of a test whose
  subject changes; no mutation names them. "Control", "frame" and "double tap" stay: they say what a violation
  means on the screen.
- **Item 4.** "Inputs the user types into" keeps the cause, and says what `update` owes an input, that it accepts
  its messages in every state where the input exists; it sends to `examples/field.ts`, `form` and `form-react`
  for the remedy. The two rules of the remedy (the input owns the text while the user types; a new `key` when the
  program replaces it) are now the head of `field.ts`, which the comments of both bridges send to. "Input is
  never a reason to reject", in "Structuring a program", is untouched. Not in the inventory: the section had no
  link to that rule, and has one now; and `update`'s rule was stated only inside the remedy's first bullet, so
  it had to be lifted out of it to stay in the README.
- **Item 5.** `AGENTS.md` takes the bridges' tests out of "contracts" and of "the boundary of a run", and names
  them with the examples' tests, which it already kept apart. Not in the inventory: nothing else named them among
  the library's tests. `mutations/mutations.ts` mutates no file of `examples/` and names no test of theirs,
  `change-engine` only sends to `AGENTS.md` for the five kinds, and the CI runs them with `bun run test` as
  before, never on Node (`test:node` globs `src/` and `test/`).

Still saying "the view" of what is a dispatch, for item 8: `Origin`'s `'View'`, "what the view sends is queued" in
"Guarantees", "a message the test or the view sends" in the table of rejections, `reject`'s comment, and
"what the view draws never does" in "Rejections and defects".

Run at the end: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:node`, `bun run interleavings`,
`bun run mutations` and the site's build.

## What it rests on

- **Run**, in scratch files since deleted, with nothing else changed: the five readers against `dispatchViolations` and
  against `messagesSentBy`, and the forgetful reader (6 tests, 1,002 expectations, passing; `tsc -p examples` clean
  with the file in); a `Stream.map` after `Stream.buffer({ capacity: 1, strategy: 'sliding' })` over a
  `SubscriptionRef`'s changes, with a slow consumer (2 mapped for 2 pulled of 101).
- **Not run**: `bun run test`, `typecheck`, `lint`, `test:node`, `interleavings`, `mutations`. Nothing they check
  changed.
- **Read whole**: `AGENTS.md`, the README, `docs/invariants.md`, `docs/inert-steps.md`, `src/index.ts`,
  `src/testing/index.ts`, `dispatch.ts`, `run.ts`, `program.ts`, `update.ts`, `testing/dispatch-violations.ts`,
  `testing/drive.ts`, both bridges, `field.ts`, and the programs and views of `timer`, `form`, `list` and `pages`.
- **Read in part, by search**: `docs/premises.md`, `docs/shared-core.md`, `engine.ts`, `compose.ts`, `rehearse.ts`,
  `mutations/mutations.ts`, the tests of the bridges and of the examples, `ROADMAP.md`. The counts of tests and
  mutations of `dispatchTo` are from their names. `simulate.ts`, `core.ts` and the library's own tests were not read.
- **Not read**: `docs/declared-inputs.md` and `docs/exploration.md` beyond their hand-over notes; nothing here builds
  on them.

## Open questions

- **A view that builds its messages.** Whether the README keeps the option (l. 217–219). With it, the contract of the
  model is no contract for such a program; without it, "messages live in the model" becomes a rule of the library.
- **Who checks the reader.** A model's messages are not marked, so no function of the library can find them: a string
  that is a message looks like one that is data. The reader is trusted as `candidates` are. Whether that is enough is
  what `declared-inputs.md` was about, and is not weighed here.
- **Wrapping a child's message in a test.** Three of five readers repeat by hand what `dispatchTo` does in the view.
  Whether that is a cost to accept, or a sign that the wrapping belongs before the model, is not weighed here.
- **The renderer outside the run.** Whether "the run ends when the renderer ends" and the order of the stop are the
  library's to keep, or would be simpler as the user's, was not tried: it is a design, and two guarantees name it.
- **The sliding buffer.** Whether a renderer could skip frames by itself was not established.
- **`drive` without the getter.** Item 7 was not tried against `drive`'s tests, nor against the contract tests.
- **React Native, a canvas, a terminal.** That `messagesSentBy` cannot be written there is the owner's report and
  follows from how both bridges are written; no such bridge was attempted.
- **An application.** How long a reader is for a model larger than the examples' is not measured.
