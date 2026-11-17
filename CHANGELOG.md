# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version, and everything else, features included, the patch version.

## 0.8.0 (unreleased)

### Added

- `forEach(step, items, (item) => (state) => step)`, the `andThen` of many: one step per item, in order.
- `andThen` and `forEach` are dual: `andThen(next)` and `forEach(items, next)` take the step last, for a `pipe`.
- A `CompositionDefect` says in `on`, by its tags, which external message or event broke the parent's rule.
- Inputs: `inputs: { Name: input({ at }) }` in `compose`, at a plain value of the state, which the view writes over
  with `{ _tag: 'Written', was, value }`; the library stores a write while the place holds `was`, by `Equal`, and
  rejects it otherwise. An input takes the places a child takes, `at` or `get` and `set`.
- Inputs by id: `inputs: { Count: inputById({ at: (id) => at }) }`, or `get` and `set` that take the id, as
  `childById` does, written with `{ _tag: 'Count', id, message }` through `forwardTo(dispatch, 'Count', id)`. The
  guide's "Composition" shows them ("Inputs by id"), and "Structuring a program" says that a value the user writes into
  each row, and the parent reads, is one ("Splitting a program"). The example `stocktake` counts an aisle with them.
- `edited` and `drawn`, over an opaque `Shown`: the rule a bridge calls for the element of an input, on an edit and
  after each frame, so that the element is never replaced and never takes back what the user typed since; each gives
  the bridge its write, `edited` the message to send and `drawn` whether the element takes the frame's value.
- `children` in `compose` is optional, for a program with inputs and no children.
- The guide has a page "Writing a bridge", which shows how to write a bridge for any renderer, from the examples'
  bridge to snabbdom: its frames, its handlers and its text input, with `edited` and `drawn`, and the two places that
  are the renderer's own.
- The package ships its documentation, at its version: the guide in `site/guide/`, the tutorial in `site/tutorial/`,
  the examples with their bridges in `examples/`, and a skill for coding agents, `skills/effect-tea/SKILL.md`, which
  leads to them. The README's last section, "For coding agents", says so, and so do the module comments of
  `effect-tea` and `effect-tea/testing`.
- The guide's "Composition" says that a row the parent must read is no child ("Children by id"), how a parent locks
  its rows while an operation runs ("Inputs by id"), and how a child waits for its parent ("Events and external
  messages"). "Subscriptions" shows a subscription that ends with a message of its own ("Precisely"), and "Testing"
  how `hearNext` hears one under a `TestClock` ("How a subscription is heard"), as the doc comment of `hearNext` does.
- The guide gives the handlers of `onEvent` and a child's `external` type ("Composition", "Events and external
  messages").
- The skill says how a test without a DOM loads snabbdom, and that the examples import with `.ts`.
- What a type does not need defaults to `never`, as in `Step` and in Effect's own types: `R` in `Execution`,
  `RunCommand`, `Subscription` and `Subscriptions`, `Command` in `Applied`, `Simulation` and `Rehearsal`, and `Event`
  in `Simulation`. So `Subscription<Message>` is a subscription that needs no services, and `Rehearsal<State, Model,
  Message>` the rehearsal of a program without commands.

### Changed

- The README's "Guide", with its "Guarantees" and "Testing", moved as it was to the site's Guide, a page per section;
  the README is a short landing page, without the "API reference" table, and the bridges' paragraph under "Examples"
  and those of "View" on bridges are in the guide's "Writing a bridge".
- The README opens with whom the library is for and a link to an example running in the browser; what it adds to the
  Elm architecture is under "Why", and effect-tea-persistent under "Related".
- The README shows a test first ("A taste"), says whom the library fits and whom it does not ("Is it for you?"), draws
  the quick start's counter in React and tests it ("Quick start"), and says how the guarantees are checked ("How it
  is checked"); its "Examples" table is reworded, and "Documentation" groups the guide's pages.
- The guide's "Structuring a program" says that a click that arrives while the form saves does nothing, where it said
  that a double click saves once ("State and messages"); "Rejections and defects" says that a message of the view is
  applied where it applies, whichever frame it was sent from ("Rules"). The bridges' shared tests click "Save" twice
  before a frame is drawn, and "Writing a bridge" lists it ("Their tests").
- The guide lists "Commands", "Subscriptions", "Rejections and defects" and "Composition" before "Inputs the user types
  into", and "Writing a bridge" last; eight of its sentences are reworded, with the same promises ("Anatomy of a
  program", "Model", "Commands", "Rejections and defects", "Composition", "Inputs the user types into").
- The guide and the tutorial link the examples at the version they are built from, in the package and on the site,
  where they linked the repository's main branch.
- The guide has two more pages, summaries that link the pages that rule: "Coming from Elm or React", which maps what
  a reader knows to the library's words, and "Glossary"; the README links both.
- The tutorial is reworded for a first reader, with the same code: each step says why before how and ends with "What
  you have", "Before you start" says how to run the example and its tests, and "Testing" names the candidates where
  the model's check uses them and lists what `rehearse` fails on.
- Every page of the guide is reworded for readers, with the same promises: the common case first ("In short", the
  rules), the exact conditions last ("Precisely"); "Guarantees" keeps its titles and its two lists.
- The doc comments of `run`, `Frame`, `Written`, `Shown`, `edited` and `drawn` say what each does in short, with a
  comment per field and an example. What the comment of `drawn` said of an element is now the guide's, in "Inputs
  the user types into" ("Settling an element"), and that a frame's `dispatch` is the very same function in every
  frame in "Running".
- The guide no longer says that the writes a frame has not seen are always rejected, once the state has moved on
  without the element ("Writing a bridge", and the comment of `drawn` before): one is stored when the input's place
  holds again the value it was written over, as "Two limits" said already.
- Every other doc comment of the API, of `effect-tea` and `effect-tea/testing`, has the same form: a summary, a
  comment per field and an example, the rules of the guide that a caller needs there, in short and in plain English,
  and a line `@see` for each section of the guide that it follows, which has the full rules. The promises
  only the comments made are now the guide's: in "Anatomy of a program" (`runCommand`, `makeModel` and
  `subscriptionsOf`), "Update" (it may be called at any time), "Composition" (the messages of children by id, a
  dispatch asked for again, and every case of a `CompositionDefect`), "View" (the scheduler a message is handled on),
  "Running" (`onApplied` before the commands, `where` as a list) and "Testing" (scopes, the order of `rehearse`'s
  `run` and `runAll`, `Equal` in `dispatchViolations`, the latest frame in `drive`).
- The comments no longer say what the code does not keep: that `update` always learns that a subscription is over (a
  last message still queued when its key goes away is dropped), that a program's view lives in a module of its own
  to be hot reloaded, and that ids of children are told apart with `Equal` (the `get` of `childById` compares them).
- **Breaking**: a `Dispatch` returns `Effect<number>`, the number of its message among those dispatched, and a
  `Frame` has `seen`, how many of them the run had taken when its state was made ("View", "Guarantees").
  Upgrade: a dispatch written by hand, `(message) => Effect.sync(() => void sent.push(message))`, returns a number,
  `(message) => Effect.sync(() => sent.push(message))`, and a frame made by hand has `seen`.
- **Breaking**: an `Origin` that the run gives `onApplied` and `onIgnored` for a dispatched message is tagged
  `'Dispatch'`, where it was `'View'`: the run knows a dispatch, which `simulate` and `rehearse` give to what a test
  sends, where no view exists. Upgrade: `origin._tag === 'View'` becomes `origin._tag === 'Dispatch'`.
- **Breaking**: "Model" in the guide says that a model is data: it holds no function, and compares by `Equal`.
  Upgrade: a function of the model that makes a message from what the user typed, `changeName: (name) =>
  NameChanged({ name })`, becomes an input, `inputs: { Name: input({ at }) }`, and the view writes over its value,
  `{ _tag: 'Written', was: model.name, value: text }` through `forwardTo(dispatch, 'Name')`, where it called
  `model.changeName(text)`.
- **Breaking**: `parent` is renamed `composition`, since a program with inputs and no children is made with it too.
  Upgrade: `parent<{ state: State }>()` becomes `composition<{ state: State }>()`, and its import likewise.
- **Breaking**: `each` is renamed `childById`, beside `inputById`, as the guide already says "children by id".
  Upgrade: `each(program, place)` becomes `childById(program, place)`, taken from `composition` as `each` was from
  `parent`.
- **Breaking**: `dispatchTo` is renamed `forwardTo`, which reads as what the call does: it forwards to the dispatch
  it is given. Upgrade: `dispatchTo(dispatch, 'Clock')` becomes `forwardTo(dispatch, 'Clock')`, and its import
  likewise.
- **Breaking**: `isRejected` is removed: a rejection is `reject` itself.
  Upgrade: `isRejected(result)` becomes `result === reject`, and `expect(isRejected(result)).toBe(true)` becomes
  `expect(result).toBe(reject)`.
- **Breaking**: `raise` is removed: a handler that raises a child's event as the parent's own returns the step.
  Upgrade: `onEvent: { Products: raise }` becomes `onEvent: { Products: (event) => (state) => ({ state, events:
  [event] }) }`, and `raise(event)(state)` becomes `{ state, events: [event] }`.
- **Breaking**: a parent's command answers with its own messages or its children's external ones, as a parent's
  handle sends them: an answer that writes into a child's input, or gives a child one of its own messages, no longer
  compiles. Upgrade: an answer `{ _tag: 'Note', message: { _tag: 'Pinned' } }`, of the child's own business, becomes
  an own message of the parent's, whose `update` tells the child through its handle, `children.Note.update(…)`, an
  external message the child declares for it; a value for a child's input becomes a message of the child's program,
  whose `update` puts it in the input's place.
- **Breaking**: a frame's model is made as the renderer pulls the frame, where it was made as the renderer read
  `model`, and `rehearse` makes the model of each new state as it applies the message ("Running", "Guarantees",
  "Testing"). A `Frame` is plain data: a spread or `JSON.stringify` of one no longer makes its model. Upgrade: a
  renderer that pulls a frame it does not draw pays for its model, and meets a defect of `makeModel` as it pulls it; a
  scenario of `rehearse` or `drive` no longer meets a defect of `makeModel` in `model`, `send` or `waitFor`, since the
  tool fails on the state whose model dies: a test that expects one wraps the tool, as for any other defect.
- **Breaking**: `View` is no longer exported: the library ends at the frame, and a view's type is its renderer's.
  Upgrade: a bridge declares it, `type View<Model, Message> = (model: Model, dispatch: Dispatch<Message>) => VNode`,
  as `examples/snabbdom.ts` and `examples/react.ts` do, and a view imports it from its bridge, `View<Model, Message>`
  where it wrote `View<Model, Message, VNode>`.
- "View", "Inputs the user types into", "Declaring children", "Model and view", "Splitting a program", "Guarantees"
  and "Testing" in the guide describe inputs, the condition they need of elements and renderers, and that a renderer
  draws frames and nothing else; `examples/field.ts` is removed, and `form` and `form-react` declare one.
- The examples' bridges keep the element of each input and settle it after each frame with `drawn` (`shows` with
  snabbdom, `Shows` with React), and have `onPress`; `volume` draws two sliders of its own, whose drags are
  subscriptions, for bounds that narrow.
- The examples' bridges are minimal examples: they only draw each frame, run `dispatch` in plain handlers and settle
  each native text `<input>`. "View" in the guide says that another native widget that meets the condition of
  `edited` and `drawn` would be connected by hand with them, or replaced by one the program draws, and that any other
  feature of a renderer (a form's reset, a shadow tree, and in React a component with state or effects, Suspense,
  `memo`, portals and a run inside another's root) is left to the bridge that needs it; "Inputs the user types into"
  no longer says that a text field meets its condition once its form's reset is heard
  ([`docs/rejected.md`](docs/rejected.md), "The bridges").
- `messagesSentBy` moves from `examples/snabbdom.ts` to `examples/snabbdom-testing.test_messages.ts`, so that the
  bridge holds only what a bridge does ("Testing" and "Writing a bridge" in the guide).
- The tests the examples' two bridges share are written once, in `examples/bridge.test_suite.ts`, over a `Bridge` of
  each renderer, its `renderInto` and the views of the scenarios, which a bridge of one's own can give too
  ("Writing a bridge" in the guide).
- `examples/preload.ts`, which `bun test` preloads (`bunfig.toml`), is `examples/preload.test_setup.ts`: a file that
  serves the tests is named `<name>.test_<kind>.ts`, as `examples/bridge.test_suite.ts` is.
- The peer dependency on `effect` is `^4.1.4`, where it was `^4.0.0`, and starts at the Effect it is developed with.
- A child whose state is not an object, past the types, is a `CompositionDefect` that names it, not a `TypeError`.
- A parent lifts once the subscriptions of children that share one state object, as those a step's `init` starts do,
  where it lifted them again on each change of state (about six times the cost, in `bun run bench`).
- `simulate` and `rehearse` read `subscriptions` on each new state, as the run does, and fail where it dies of them.
- `simulate` and `rehearse` fail with a `ProgramDefect` on a command or subscription that interrupts itself.
- `simulate`, `rehearse` and `drive` fail with a `ProgramDefect` in the run's site, where they failed with the defect.
- `drive` keeps a defect of `makeModel` among the program's in the order they happened, as the run does, not first.
- The run dies of an effect that interrupts itself with the fiber id of the run's interruption, as the run stops it.
- `rehearse` and `simulate` fail, as the run dies, on such an effect, and stop a command as the run does.
- **Breaking**: `simulate` runs each command after those started before it, as the run does.
  Upgrade: a step starting `A` and `B`, with `A`'s answer starting `C`, is heard `A, B, C`, where it was `A, C, B`.
- **Breaking**: `rehearse`'s `hearNext` keeps its subscription while its key stays, each call hearing its next message.
  Upgrade: after its end value, `hearNext` and `hear` fail until the key goes away and comes back; a release sees an
  interruption when the key goes away, where it saw a failure, so a scenario awaiting it makes the key go away first.
- **Breaking**: `rehearse` hears each start of a key with `hear` or with `hearNext`, never both.
  Upgrade: hear that start with one of the two, or make its key go away and come back in between.
- `rehearse` applies whole, as the run does, a message whose stopped subscription dies as it releases.
- `rehearse` whose scenario failed as a message stopped a subscription stops it as the run does, and fails the
  `hearNext` calls still waiting, in a fiber the scenario did not join too, where they waited for ever.
- **Breaking**: as the run ends, it stops applying messages first, then the renderer, then commands and subscriptions.
  Upgrade: a renderer that sent a message for the program to act on as it is released does that work itself.
- "Commands" in the guide says that commands run concurrently, with no bound, and answer in the order they end.
- "Running" in the guide says that the run waits for `onApplied` and `onIgnored`, and how a slow observer hands off.
- "Commands" and "Guarantees" in the guide say that the end of the run interrupts the commands under way.
- "Running" in the guide says that a string message is logged whole, and that a defect's `key` and `id` are as is.
- "Guarantees" in the guide says that messages are applied one at a time, in the order they were queued.
- "Guarantees" in the guide says that nothing is bounded or times out: a release that never ends holds the program.
- "Running" in the guide says that `onApplied` may hear a step whose frame is never drawn, as the run ends.
- "Running" in the guide says that a message the run does not apply starts no command and is not heard by
  `onApplied`, and that `onApplied` hears the commands a message decided, which may never start as the run ends.
- "View" in the guide says that a handler returns before `update` has seen the message it sent.
- "Running" in the guide describes the order of the defects in the cause, and no longer promises it.
- **Breaking**: `DefectSite` gains `'init'` and `'log'`, for an `init` or a `Logger` that throws.
  Upgrade: a `switch` over `where` that must be exhaustive adds a `case 'init'` and a `case 'log'`.
- A parent's subscriptions are kept by each child's state object, as its models are.
- "Guarantees" in the guide asks that `subscriptions` be pure, as `update` and `makeModel` are.
- "Guarantees" in the guide says that a subscription starts and stops once the new state is published, and
  that one that ended stays ended while its key stays, where it said that a subscription runs exactly while its key
  is in the state.
- The guide goes from a program's anatomy to its structure, and "Anatomy of a program" draws the loop: `init`,
  `update` and what it rejects, commands, subscriptions, the model, and a write into an input; the README links it.
- "Installation" in the README states the oldest TypeScript supported, 5.9, as Effect 4's.
- The README and the site link effect-tea-persistent, the same architecture for long-lived entities on a server.
- "Running" in the guide, the examples and the tutorial start a program with `Effect.runFork`, an API that is stable.
- The `counter-react` and `form-react` examples draw with React, through `examples/react.ts`, a bridge to copy.
- "Model", "Guarantees" and "Testing" in the guide say that the model holds what `update` accepts, as a test reads it.
- "Model" in the guide says that messages live in the model, and no longer offers a view that builds its own.
- "View" and "Testing" in the guide ask no `messagesSentBy` of a bridge, and the examples' React bridge has none.
- The comments of `dispatchViolations` and the table of the tools in the guide's "Testing" speak of the messages a
  model holds.
- The site has a tutorial that builds the new `timer` example in five steps, the fourth a name the user types into
  each timer, an input, which "Testing" writes into.
- **Breaking**: `child` and `childById` refuse a program with commands and no `runCommand`.
  Upgrade: give the child the `runCommand` its commands need; one that gets there through a cast is a
  `CompositionDefect` naming the child.
- The guide says that a command, a subscription or the renderer dies once its effect ends with a defect.
- "Rejections and defects" in the guide says, as one choice, who settles what arrives too late: the run drops a
  stopped subscription's message, `update` rejects a command's outdated answer, the library a write over a value
  replaced.
- `dispatchViolations` reports as `Missing` only a candidate whose step would do something: one that leaves the same
  state by `Equal`, with no commands and no events, is no control missing, by the rule `ActsTwice` applies to a
  message sent twice. A `withheld` that listed such messages is no longer needed.
- "Rejections and defects" in the guide says why a handler of `onEvent` has no `reject`, and how `onApplied` hears
  a message whose handler answers `{ state }`; "Model and view" and "Testing" say that a control that would do
  nothing is no control missing.
- The clock of `pages` has a format, ISO or Unix, which its test withholds under About; `list` rejects "Stop all"
  over an empty list, and its model leaves it out there.
- The views of `volume` and `pages` apply no fallback: `volume`'s model says whether the media's slider is fixed at 0,
  and its drag ends on `pointercancel` too.
- **Breaking**: `rehearse` starts from the program's `init`, given `flags` for a program with them, as `run` and
  `drive` do: its `from` option, and `RehearseOptions`, are gone. Upgrade: `rehearse(program, scenario, { from })`
  becomes `rehearse({ ...program, init: from }, scenario)`.
- The guide says that a parent's message wrapping a child's string is logged by the child's name alone, that a
  failure of a call of `rehearse` fails the fiber that made it, and that `simulate` calls no `init`.
- **Breaking**: `rehearse`'s `hear` takes no write into an input, the program's or a child's, which only a view sends.
  Upgrade: a test that heard `{ _tag: 'Name', message: { _tag: 'Written', … } }` sends it with `send`, from the model
  that shows the input.
- **Breaking**: a program names the services of its commands and those of its subscriptions apart, and `composition`
  keeps them apart. So `simulate` asks only for those of the commands, and `rehearse` for those of what the test runs:
  `run` and `runAll` for the commands', `hearNext` for the subscriptions'. `CommandServicesOf` and
  `SubscriptionServicesOf` read them, and `ServicesOf` is gone.
  Upgrade: `Program<{ …; services: Storage }>` becomes `Program<{ …; commandServices: Storage }>`, or
  `subscriptionServices` for a service of the subscriptions; `ServicesOf<P>` becomes
  `CommandServicesOf<P> | SubscriptionServicesOf<P>`; a test that gave `simulate` a service only the subscriptions use
  no longer gives it.
- `Update`, `Transition`, `Rejected`, `ModelOf`, `MessageOf`, `CommandOf`, `EventOf` and `ServicesOf` have doc comments
  of their own, and `StateOf`'s speaks of `StateOf` alone.
- "Rejections and defects" in the guide says that `defect` is for `init` too, and the doc comment of `ProgramDefect`
  that it holds the tags of `update`'s message, not the message.
- `CompositionDefect`'s documentation names a child whose state is not an object, and that of `Rehearsal.ignored`
  says that it holds messages.
- "Running" in the guide says that what a channel adds to the scope the run gives it is released after its defect,
  where it said "a channel's own scopes".
- The examples export `Message` as a type only, as "Model" in the guide says (`pages`, `list`, `timer`, `form`,
  `volume`): their tests write messages as data.
- `examples/form/late-key.test.ts` is removed: its two histories of a key typed before a save completed are cases of
  `examples/bridge.test_suite.ts`, run on each bridge with `form`'s views.
- The examples' snabbdom bridge no longer has `onInput`, which turned what is typed into a message in the view: what
  the user types is an input, drawn with `shows`, and `messagesSentBy` no longer takes a text to type.
- `messagesSentBy` calls a listener, or a list of them, as snabbdom's types say: a list nested in a list, which they do
  not show, is no longer walked.
- The examples' tests list the candidates of tagged messages a tag at a time, in a record checked against `Message`
  with `satisfies`, so that a new message does not compile until the test says what a user could ask with it; and
  each example drawn with snabbdom, not `list` alone, compares what its view sends (`messagesSentBy`) with what its
  reader returns, whose order is now the view's. "Testing" in the guide, the tutorial's "Testing" and the
  `add-example` skill say so.
- The guide's "Composition" ("Declaring children") names the types `composition` takes beside `state` and `flags`;
  its "Testing" says what `simulate` and `hearNext` succeed with ("`simulate`", "How a subscription is heard"), and
  how a program run under its renderer in a DOM is tested ("The view").
- The guide's "Composition" says that `subscribed` is required for children by id ("Children by id"); "Inputs the
  user types into" says that an input's optic may focus nothing, and that a write is rejected there ("Rules"); "Writing
  a bridge" says how the shared tests of a bridge are reused, and how they hold frames and fibers ("Their tests").
- The guide's prose is reworded for readers who are not native English speakers, with the same promises: "Anatomy of a
  program", "Update", "Model", "Commands", "Subscriptions", "Rejections and defects", "Composition", "Inputs the user
  types into", "Structuring a program", "Running", "Guarantees", "Testing" and "Writing a bridge".

### Fixed

- A parent's services are all those its `runCommand` and its `subscriptions` need: one whose two need different
  services, or whose `runCommand` returns effects of different services by branch, or whose subscriptions differ in
  theirs, compiles without an annotation. The guide's "Composition" says so ("Declaring children").
- An input that takes a child's name no longer compiles: it replaced the child, whose messages were then rejected.
- A program whose `external` messages are not among its `message`s no longer compiles, as a `Program<…>` or as a
  child of a `composition`: its parent's message reached an `update` that does not take it, as a `TypeError`.
- A child whose `flags`, events or commands are of type `unknown`, or whose `init` is a function written without
  `Program<…>`, is typed as having them: its handle takes flags, `onEvent` is required, and so is `runCommand`, where
  the types read them as absent and the run met them. `FlagsOf`, `EventOf` and `CommandOf` read them as `unknown`.
- A run interrupted just as it forked the renderer left the renderer running, and lost a defect.
- A message taken before a defect could reach `update` after it, under a lowered `Scheduler.MaxOpsBeforeYield`.
- A release that interrupts itself, or fails against its type, after its command or subscription died, is a defect.
- A command, subscription or renderer that interrupts itself as the run is interrupted is a defect.
- `drive` puts a defect of the program before the scenario's failure in the cause, as the run and `rehearse` do.
- `drive` waits for the run to release what it holds once the scenario ends, and fails on a defect of that release.
- A command or subscription that dies as the end of the run releases what it holds ends the run with that defect.
- A renderer that dies as it is released, in a run interrupted or dead of a defect elsewhere, ends the run with it.
- A command, subscription or message of the renderer that dies as the run releases the renderer ends the run with it.
- `drive` interrupted by whoever runs it waits for the run to release what it holds, and fails on its defect.
- A command, subscription, renderer, `onApplied` or `onIgnored` that interrupts itself is a defect, not a silent end.
- Four defects that ended the run with the error itself die in `'onApplied'`, `'onIgnored'`, `'render'` or
  `'subscription'`.
- A subscription key whose `Equal` or `Hash` throws dies in `'subscriptions'`, where the run ended with the error.
- A command, subscription, renderer or option that fails against its type (an empty cause, a cast) is a defect.
- A parent whose `subscribed` lists an id twice says so, not that an own key took a child's.
- `rehearse` applies messages that arrive together one at a time: a command's answer could be lost.
- `simulate` and `rehearse` compare a new state's keys with those of the state before, as the run does.
- `drive`'s timeout says its patience with a unit, `within 500ms`, where it said `within 500`.
- `rehearse`'s `hearNext` runs the subscription listed when its key appeared, not the one listed at its first call.
- A subscription that `hearNext` started keeps running while its key stays, whichever fiber of the test's heard it.
- What a subscription that `hearNext` runs sends after its key went away no longer reaches `update`.
- `rehearse` fails on a command whose `run` was interrupted before it answered, or still under way at the end.
- **Breaking**: `rehearse` applies every message in one loop, and fails on a defect of the program in any fiber.
  Upgrade: a test that expects a defect wraps `rehearse`, where its scenario caught it with `Effect.exit`.
- A run that died applies no message, and so starts the commands of no later step.
- The defects a run dies of are in its cause in the order they happened, and so in `rehearse`.
- `rehearse`'s `hearNext` or `run`, waiting, fails as soon as another fiber of the test's dies, as the run dies.
- A subscription that dies while its channel holds a scope of its own ends the run before that release.
- `rehearse`'s `runAll` no longer fails with "No pending command matches" when another fiber runs the last one.
- A release that dies with a defect already among those of the run is a defect of its own, not lost.
- A scenario that throws before it returns its effect fails `drive` and `rehearse`, which then stop the run as they end.
- `rehearse` fails on a command under way as the scenario ends, though it answers while the end releases what it holds.
- `rehearse` applies what the test sent before its scenario returned, where it dropped what its loop had not taken.
- `rehearse` runs a command's effect in its own scope: an interrupted `run` no longer loses its answer or its count.
- A `run` made once a rehearsal has ended no longer calls `runCommand`.
- A message that `hearNext`'s subscription sent to a call interrupted meanwhile is heard by the next call, not lost.
- `rehearse` writes a new state, and makes its model, before the subscriptions it stops release what they hold, as
  the run publishes it: a release that waited on what the test saw of the new state hung, and after a defect of
  `subscriptions`, `state` read the state before the message.
- `simulate` closes a command's scope as the run does, once its defect says where: what a command that died
  releases was given the bare defect, or an interruption for one that interrupted itself, where the run gives it a
  `ProgramDefect` in `'command'`, and a release that died of the very defect of its command was one defect, not two.
- A message or command whose wrapping comes back to itself is described by its tags until then, `Loop › …`: its
  description overflowed the stack, and a defect it was made for died as that `RangeError`, without where.
- `Applied`'s `revision` is a `number` in the declarations, which no longer carry the engine's internal modules, and
  the guide says what it counts ("Running").
- The examples' snabbdom bridge settles an `<input>` that snabbdom reuses for another vnode: drawn with `shows` in the
  place of a plain field, it shows the program's value and sends its writes; drawn as a plain field in the place of an
  input, it is let go and keeps what the view gives it.
- `simulate` interrupted once it has called `runCommand` has begun the command's effect, as the run has.
- `rehearse` whose `init`, `subscriptions` or `makeModel` dies at the start leaves no scope of its own open.
- `rehearse` interrupted by whoever runs it as it sets up, before its scenario, leaves no fiber of its own running:
  its loop ran on, in a scope nothing closed.
- The examples' React bridge hears an input's own `input` event, not React's `onChange`: a text a script wrote into
  the element through its `value`, as an extension that fills forms does, was lost.

## 0.7.1 (2026-10-28)

### Added

- `andThen(step, (state) => step)`, a step and the next one made from its state, with both commands and events.
- `raise(event)`, a step that raises a child's event as the parent's own: `onEvent: { Products: raise }`.
- `defect(reason)`, the twin of `reject` for a message that cannot arrive: it throws an `InvariantDefect`.

### Changed

- The README's "Guide" says how a program is structured, and the `form` and `list` examples follow it.

## 0.7.0 (2026-10-26)

### Changed

- **Breaking**: the run dies with a `ProgramDefect` that says where, and no longer logs its defects at the error level.
  Upgrade: read `defect.cause` where you inspected the defect the run died with, e.g. with `Cause.squash`.
- `describeMessage` and `describeCommand` are called only while debug logs are enabled.
- The subscriptions one message stops are interrupted together, not one after the other.
- **Breaking**: a parent breaking what it declared throws a `CompositionDefect` naming the child, not an `Error`.
  Upgrade: a test that matched `compose: …` matches the `CompositionDefect` by its `_tag`.
- A parent's own subscription key equal to a child's lifted key is a `CompositionDefect`, where it replaced it.
- `Applied` says where its message came from, as `origin`, and `DefectSite` gains `'onIgnored'`.
- **Breaking**: `attempt` is removed: it only named two combinators of Effect.
  Upgrade: write `Effect.match(effect, { onSuccess, onFailure })` and `Effect.asSome` for `attempt(effect, { … })`,
  and `Effect.match({ onSuccess, onFailure }), Effect.asSome` in a `pipe` for `attempt({ onSuccess, onFailure })`.

### Added

- `ProgramDefect`, `DefectSite` and `CompositionDefect`; a `ProgramDefect` of `update` names its message as `on`.
- `at`, an optic that places a child in place of `get` and `set`: `child(clock, { at: Optic.id<State>().key(…) })`.
- `onIgnored`, an option of `run` that hears every message `update` rejects (`Ignored`, `Origin`).
- `hearNext(key)` in `rehearse`, which runs the subscription under `key` until its first message, and applies it.
- The README says how to start a program from another state, and that `dispatchViolations` compares by `Equal`.

### Fixed

- The README says why a child's view takes its dispatch from `dispatchTo`, not from a lambda.

## 0.6.0 (2026-10-23)

### Changed

- **Breaking**: models hold plain data, and views send messages: offers are gone, and so is every check of a model.
  Upgrade:
  - `makeModel: (state, { offer, offerInput }) =>` becomes `makeModel: (state) =>`: write `Message` where you
    wrote `offer(Message)`, and `(value) => Message` where you wrote `offerInput((value) => Message, current)`;
    `Offered<Message>` becomes `Message` in a model's type. A parent's `makeModel: (state, { children })`
    becomes `makeModel: (state, children)`.
  - `Dispatch` and `View` take the program's messages: `Dispatch<Message>`, `View<Model, Message, Node>`, and
    `Frame<Model, Message>`. A child's view gets its own dispatch, `dispatchTo(dispatch, '<child>')`, or
    `dispatchTo(dispatch, '<child>', id)` for children by id, where it got the parent's.
  - `run` takes no `onRejectedInput`. `RejectedInput`, `RejectedOffer` and `OnRejectedInput` are gone.
  - `modelOf(program)(state)` becomes `program.makeModel(state)`.
  - In `drive` and `rehearse`, `send` takes the message: `model.save` for `tap(model.save)`, and
    `model.changeName('Ada')` for `input(model.changeName, 'Ada')`. `Action`, `tap`, `input` and `messageOf` are
    gone, and `Driver<Model, Message>` takes the messages again.
  - `missingOffers` is gone: write `dispatchViolations(update, { repeatable, withheld })(state, sent, candidates)`
    where you wrote `dispatchViolations(update, { repeatable })(state, sent)` and `missingOffers(update, { withheld
    })(state, sent, candidates)`.
  - `dispatchUnsafe` is gone: write `Effect.runSync(dispatch(message))` where you wrote
    `dispatchUnsafe(dispatch)(message)`.
- A child's model is kept while its state object lives, where it was kept for the root's last two frames.
- **Breaking**: a parent's handle gives its child an external message and returns a step, never a rejection.
  Upgrade: a child that rejected to let its parent act raises an event, handled in `onEvent`, and the parent drops its
  `isRejected` check: `update: (_, children) => children.Page.update(message)`, with `onEvent: { Page: … }`.
- **Breaking**: a program keeps its state in an object, the root's included: a primitive or `null` no longer compiles.
  Upgrade: wrap the state, `{ count }` where it was `count`.

### Added

- `dispatchTo(dispatch, name, id?)`, the dispatch of a child for its view, the same function every time.

### Fixed

- A parent's own command named like one of its children is a type error, where it went to that child's `runCommand`.
- `CommandOf` reads a program's commands from its `update` too, not from its `init` alone.
- A defect in `subscriptions`, `describeMessage`, `describeCommand`, the renderer or `makeModel` says where.
- `rehearse`'s `hear` says that nothing listens for a key that holds a `bigint`, where it failed with a JSON error.

## 0.5.1 (2026-10-22)

### Added

- `flags`, as in Elm: a program that declares them has `init: (flags) => step`, given by whoever starts it.
- `run` and `drive` take the root's `flags`, `rehearse` them or a step to start `from`, and `FlagsOf` reads them.

### Fixed

- `run`, `drive` and `rehearse` accept a program written without `Program<…>` that has no commands.

## 0.5.0 (2026-10-22)

### Changed

- **Breaking**: a parent's `init` is a function of its `children`, so that a child's first commands are not lost.
  Upgrade: write `init: () => ({ … })` where you wrote `init: { … }`, and start each child with its handle's `init`.

## 0.4.0 (2026-10-22)

### Changed

- **Breaking**: `onRejectedInput`'s function gets the `RejectedInput` itself, and `InputRejection` is gone.
  Upgrade: replace `InputRejection<Message>` with `RejectedInput`.
- **Breaking**: `RejectedInput` and `RejectedOffer` hold the message in `rejected`, and `message` names its tags.
  Upgrade: read `rejection.rejected` where you read `rejection.message`.

### Added

- `rehearse(program, scenario, { from })`, between `simulate` and `drive`: each command waits for the test to run it.
- `Action`, `tap` and `input` serve `rehearse` as well as `drive`.
- `subscriptionsOf(program)(state)`, what a program listens to in a state, by key, as `run` reconciles it.

### Fixed

- A parent keeps its state for a child's message that leaves the child's state as it was.
- The README says what a rejection holds, and how to keep a connection open while a value it uses changes.

## 0.3.1 (2026-10-22)

### Added

- `attempt({ onSuccess, onFailure })`, with the handlers alone, returns the function that takes the effect.

### Fixed

- Each command and each subscription has a scope of its own, where what they acquired was kept in the run's.
- A fiber that a command forks with `forkScoped` stops when the command ends: work that should go on is a subscription.
- What the run's fibers log no longer piles up as events of a span that lives as long as the run.
- The models of children by id under a shared state object are kept for the last two frames, not for every id.
- A parent used as a child by id keeps its children's models by their place too, where two instances shared them.

## 0.3.0 (2026-10-21)

### Added

- `parent<{ state; command?; event?; external? }>()`, a parent of declared children: `child`, `each` and `compose`.
- `StateOf`, `ModelOf`, `MessageOf`, `CommandOf`, `EventOf`, `ExternalOf` and `ServicesOf` read a program's types.
- `messageOf` in `@fgaudo/effect-tea/testing`: the message an offer sends, as the root of its program receives it.

### Changed

- **Breaking**: an offer is an opaque token, and one `dispatch` per run takes the offers of any level.
- Rejections are judged by the offer, no longer by the frame's state, and an offer made by another run is a defect.
- **Breaking**: `onRejected` is `onRejectedInput`, `OnRejected` is `OnRejectedInput`, `Rejection` is
  `InputRejection`, and `RejectedMessage` is `RejectedInput`.
- **Breaking**: `Program` names its types: `Program<{ state: State; model: Model; message: Message }>`.
- `offerInput(toMessage, current)` widens its value type from `current`: a literal `true` no longer narrows it.
- The logs describe a child's message or command by the tags on its way (`Home › Products › Deleted`).
- **Breaking**: `drive`'s `Action`, `tap` and `input` take offers of any level, and `Driver<Model>` loses `Message`.
- **Breaking**: `embed`, `embedEach` and `mapDispatch` are removed: `parent` replaces them.

To upgrade:

- Write each `Program<State, Model, Message, …>` as `Program<{ state: State; model: Model; message: Message; … }>`,
  and drop the `Message` parameter of `View`, `Dispatch` and `Frame`.
- Rename `onRejected` to `onRejectedInput` in the options of `run`, and `OnRejected`, `Rejection` and
  `RejectedMessage` to `OnRejectedInput`, `InputRejection` and `RejectedInput`.
- Replace a parent built with `embed` and `embedEach` by `parent<{ state: State; … }>()`: declare each child
  with `child(program, { get, set, subscribed? })` or `each(program, { get, set, subscribed })`, move the
  `onEvent` of each `embed` into `compose`'s `onEvent` under the child's name, and drop `wrap`, `wrapCommand`,
  `key` and `liftCommands`. Where the parent's `update` sent a child a message, use
  `children.<Child>.update(message)` and name that message in the child's type as `external`; where it started
  a child, use `children.<Child>.init`. In `makeModel`, replace each embedded `makeModel(childState)` with
  `children.<Child>(state)`. Name the parent's messages with `MessageOf<typeof parent>`.
- In views, drop `mapDispatch`: pass the run's `dispatch` to a child's view as it is.
- In tests that collect what a view sends, read each offer with `messageOf`.

## 0.2.0 (2026-10-18)

### Added

- `onApplied`, an option of `run` that hears every accepted message, in order, before its frame is drawn.
- `simulate` in `@fgaudo/effect-tea/testing`, which runs a flow without a runtime, commands included.
- `drive` in `@fgaudo/effect-tea/testing`, which runs a program with `run` and acts as its user through a `Driver`.
- `missingOffers` in `@fgaudo/effect-tea/testing`: the messages `update` accepts in a state and the view leaves out.
- `applyAll` also returns the `events`, in order.
- The `makeModel` of `embed` and `embedEach` keeps a child's model while the child's state is the same object.
- The step that `onEvent` returns, in `embed` and `embedEach`, may emit events of the parent's own.

### Changed

- The README clarifies immutable state, and how to choose a testing tool.
- **Breaking**: an offer is an `Offered<Message>`, no longer an `Option`, and `offer` throws `RejectedOffer`.
  Upgrade: turn each model whose actions depend on the state into a union with a case per state, holding only the
  actions of that case, and return `Opt.some(tap(...))` from `send` in scenarios, where the case has the action.
- **Breaking**: `makeModel` receives the offers, `makeModel(state, { offer, offerInput })`, and `offers` is gone.
  Upgrade: take `{ offer, offerInput }` as `makeModel`'s second argument instead of calling `offers(update, state)`,
  call the `makeModel` that `embed` returns instead of the child's, and write `modelOf(program)(state)` for
  `program.makeModel(state)`.
- **Breaking**: commands are data, which `runCommand` turns into an `Execution<Message, R>`, the former `Command`.
  Upgrade: declare a command union, move each command's effect into `runCommand`, return the union's values from
  `update`, rename `Command` to `Execution`, add `wrapCommand` to the `embed` of a child with commands and delegate
  to the `runCommand` it returns, and pass the program to `simulate`.
- **Breaking**: `Dispatch` returns an `Effect<void>`, and `dispatchUnsafe(dispatch)` sends at once.
  Upgrade: wrap the dispatch your renderer's callbacks call with `dispatchUnsafe`, and yield it inside an Effect.
- **Breaking**: `embed` and `embedEach` return `liftCommands` instead of `init`.
  Upgrade: put the child's initial state in the parent's state yourself, and write `liftCommands(step.commands)`
  (`liftCommands(id, step.commands)` for `embedEach`) for `init(step).commands`.
- A renderer slower than the program gets only the latest frame, instead of every frame in turn.
- The README says why a view should not write the model's text into an input the user types into.
- **Breaking**: the run fails with its defects, which whoever runs it reports, and `onBug` is gone.
  Upgrade: report defects with `Effect.tapCause` around `run`, replace `{ onRejected: 'ignore', onBug }` with
  `{ onRejected: (rejection) => ... }`, and drop `onBug` where `onRejected` is `'die'`.
- What a subscription sent before its key went away, and `update` has not received yet, is dropped.
- **Breaking**: a program has a `runCommand` exactly when it has commands, and `subscriptions` only when it listens.
  Upgrade: remove `runCommand: absurd` and `subscriptions: () => HashMap.empty()`.
- **Breaking**: `Subscribe` is renamed `Subscriptions`, and the former `Subscriptions` is no longer exported.
  Upgrade: write `HashMap<K, Subscription<Message, R>>` where you used the old `Subscriptions`.
- **Breaking**: `embed`'s `getSubscribed` is renamed `subscribed`, as in `embedEach`.
- Every accepted message is logged at `debug`, also when it leaves the state as it was and starts nothing.
- `DriveOptions` is `RunOptions` without `onRejected`, plus `patience`.

## 0.1.0 (2026-10-17)

First release.
