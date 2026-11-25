# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version, and everything else, features included, the patch version.

## 0.9.0 (unreleased)

### Added

- `stateOf(program, own, states)`, in `@fgaudo/effect-tea/testing`, makes a parent's whole state for a test, from its
  own state and the states of its children.
- `output`: a program that names `output: Output` gives `output: (state) => Output`, which its parent reads as
  `children.X.output()` in `makeModel` and in a last parameter of its `update`, `external` and `onEvent`; `OutputOf`.
- `store` in `input` and `inputById`: the form a value written is stored in, a function of the value alone
  ("Inputs", "What is typed, in another form").
- `placeViolations(input, { states, ids, values })`, in `@fgaudo/effect-tea/testing`, checks in a test that an input's
  `set` changes its place and nothing else, and returns each `PlaceViolation` it finds ("Testing tools").
- `messagesSentBy(view, model, reports)`, in `@fgaudo/effect-tea/snabbdom/testing`: `reports` gives what a handler
  reads of its element and its event, as `scrollTop` or `clientX`, and each event's `currentTarget` is its element too
  ("Writing a bridge").
- The bridge to snabbdom draws a node's `class`, `attrs` and `dataset` too, with snabbdom's modules of each, where it
  dropped them ("Writing a bridge", "The package's bridges").

### Changed

- **Breaking**: the library keeps a parent's children. A parent declares them with `withChildren({ … }).make(config)`;
  its own state lists them (`child(p, { there, key, flags })`, `childById(p, { ids })`), and its functions get that
  state alone. Its whole state is `{ own, starts, children }`.
  Upgrade: drop a child's `at`, `get`, `set` and `subscribed` (`listening` is optional), and `children.X.init` from
  `init`; `children.X.external(…)` becomes `{ state, tell: [{ _tag: 'X', message }] }`; `children.X(state)` in
  `makeModel` becomes `children.X()`, an `Option` for a child that may not be there.
- Under a parent, what a step tells its children arrives after the step, a child whose flags, or what its `key` gives,
  change starts again, an answer for a child closed or started again is rejected, and no step can copy a child's state
  or bring one back.
- **Breaking**: `forEach` is removed: a parent lists what it tells its children in `tell`. `andThen` folds `tell` too.
  Upgrade: `forEach(step, ids, (id) => children.Row.external(id, m))` becomes `{ ...step, tell: ids.map(…) }`.
- **Breaking**: an input's `set` changes its place and nothing else, and stores exactly the value it is given; one
  that does more, as storing another form, is not supported ("Inputs", "Rules").
  Upgrade: a `set` that changes the form, `set: (state, note) => ({ ...state, note: note.toUpperCase() })`, becomes
  `store: (note) => note.toUpperCase()` beside the place, `at` where the place is a path.
- **Breaking**: a subscription is made from its key alone: `subscriptions(state)` lists keys in an array, a key listed
  twice once, and `listen(key)` makes the subscription of one; `key` names their type (`Listen`, `WithListen`,
  `KeyOf`).
  Upgrade: `subscriptions: () => HashMap.make(['ticks', ticks])` becomes `subscriptions: () => ['ticks']` with
  `listen: () => ticks` and `key: 'ticks'` among the types; the key of a child's subscription,
  `[<child>, instance, key]`, becomes `{ _tag: <child>, instance, key }`, and `Subscriptions<State, Message>` becomes
  `Subscriptions<State, Key>`.
- **Breaking**: `dispatchViolations` reports `Inert`, a message the model holds whose step does nothing, unless the
  new option `inert`, of the message and the state, lists it ("Testing tools", "dispatchViolations").
  Upgrade: leave such a control out of the model, reject it in `update`, or list it in `inert`; a `switch` over a
  `DispatchViolation`'s `_tag` handles `'Inert'`.
- **Breaking**: the messages of a program written as an object are inferred from its `update` alone, by `start`,
  `drive`, `rehearse` and `simulate`: an answer of `runCommand` or a message of `listen` no longer narrows them.
  Upgrade: `{ ...counter, update: (message) => … }` becomes `{ ...counter, update: (message: Message) => … }`.
- **Breaking**: unspecified, and no longer promised ("Running", "The defects in the cause"): whether two releases of one
  scope that die of defects equal by `Equal` are two defects, and whether a command that interrupts itself as the run
  stops it is one.
  Upgrade: nothing to change in a program; a test relies on neither.
- **Breaking**: `applyAll` and `simulate` are called in one step, as every other tool is: the messages and the state,
  or the step, to start from follow the first parameter. The types still come from `update`, or from the program,
  alone ("Testing tools").
  Upgrade: `applyAll(update)(messages, from)` becomes `applyAll(update, messages, from)`, and
  `simulate(program)(messages, from)` becomes `simulate(program, messages, from)`.
- **Breaking**: `Simulation`, what `simulate` succeeds with, is `Simulated`, as `Folded` is what `applyAll` returns.
  Upgrade: `Simulation<State, Message>` becomes `Simulated<State, Message>`.
- **Breaking**: `Interpreter` is `WithRunCommand`, as `WithListen` names a program's `listen`, and `ExternalHandler` is
  no longer exported.
  Upgrade: `Interpreter<Command, Message, R>` becomes `WithRunCommand<Command, Message, R>`, and a type that named
  `ExternalHandler` names `Pick<typeof program, 'external'>`.
- **Breaking**: `Host` takes its view as `view`, as `Draw` and `drawInto` do, where it took it as `children`;
  `HostProps` has `view` in place of `children` ("Writing a bridge").
  Upgrade: `<Host program={counter}>{view}</Host>` becomes `<Host program={counter} view={view} />`.
- **Breaking**: `ObjectState` is removed: a program's state is any value, a number or a string too, and a state that
  is a type parameter compiles in `make`.
  Upgrade: drop `ObjectState` where a signature names it.
- **Breaking**: a child's model is kept while the child keeps the very same state, and no longer by its state object:
  two children in the very same state object make a model each, and a child started again in the state object it had
  makes its model anew.
  Upgrade: a view changes nothing, and draws such a child once more. A test that expected the very same model of the
  two compares them by value.
- **Breaking**: `Applied` has no `revision`.
  Upgrade: an `onApplied` that reads it counts, from 0, the messages it hears whose `after` is not `before`.
- The guide promises only what stands under "Rules", under "What you can rely on" and in the types; the rest explains,
  and what it does not promise is unspecified, with no entry here when it changes ("Guide", "What a page promises").
  "Precisely" is gone. Now promised, under the "Rules" of its page: all that a page held under "Precisely" or said it
  described, but what only explains and what is unspecified below; and what "Guarantees" described under "What is
  left to you", now in "Running" (what the run lets go of, and waits for as it ends) and in "Writing a bridge" (how
  `Host` lives, draws on a server, and reports a run that dies, where there is no `reportError` too). "What you can
  rely on" adds that the subscriptions one state stops release together. Now unspecified: the order of the defects,
  which function refuses a program that does not compile, in which fiber a command runs, when the effects of a step
  start, on which stack and in what order beyond its rules the run ends, when children are compared, when `listen` is
  called, when React reads the model, whether the commands of `init` start once or twice under StrictMode, what a
  renderer that draws after the next event leaves in the state, and whether a handler that the bridge to snabbdom drew
  still sends its message once the bridge is stopped.
- The guide's "Inputs the user types into" is now "Inputs": a value an element reports for the program to keep is an
  input too, and a fact with a value, as a scroll's end, is one message that the view fills ("What an element reports").
- A value that the user writes belongs to the program whose rules use it: the parent's where it changes or locks it,
  and otherwise the child's, whose `output` gives the parent what the child concludes from it ("Structuring a
  program").
- `rehearse`'s `hear` takes any message of the program, as `send` does, where it refused one shaped as a write into
  an input: a wrapper built by a parent's constructor, or a value typed as the whole message, now compiles.
- The peer dependency on `effect` is `~4.1.5`, where it was `~4.1.4`.
- `react-dom` is no longer a peer: the bridge to React imports `react` alone. Where there is no `reportError`, as on
  React Native, it reports a run that dies after `Host` unmounts as React reports an error itself ("Writing a bridge").
- The package's JavaScript is ES2022, as the README now says, without the class `static {}` blocks that some
  toolchains, as Metro for Hermes, need a plugin for.
- No value given to the library, or taken from it, is to be mutated: the rule of a state now holds of a message, a
  command, an event, flags, a key, a model and an output too ("Guarantees", "What is left to you").

### Fixed

- `simulate` takes a program written as an object without commands or events, whose `commands` and `events` it gives
  as `never`.
- `simulate` gives the state that a program's `init` names, as `start` does, where it gave the type of the steps its
  `update` returns; so it refuses a program whose `init` names another state than its `update` takes.
- `start` and `drive` take a program with an `external`, which they refused, and check it as `child` does; their run
  needs no service that a program's type names for commands or subscriptions it does not have.
- `rehearse` and `simulate` fail, as the run dies, with the defect of `update` and what a message's tag throws while it
  is said, where `simulate` kept the second alone; `rehearse` also when the scenario catches the call that sent it.
- A state whose `subscriptions` dies is no longer the current one: `model()` gives the state before, as a defect of
  `onApplied` leaves it, where it gave a state that no listener was told of ("Running", "What the run still does after
  a defect").
- A wait of `drive` looks at the model of each state in order, where it could skip the model of the state that woke
  it when another wait woken by that state sent first.

## 0.8.0 (2026-11-21)

### Added

- Inputs: `inputs: { Name: input({ at }) }` in `make`, a plain value of the state that the view writes with
  `{ _tag: 'Written', value }`; the library stores a write wherever its place is there, and rejects it where it is not.
  `inputById` declares one per id, as `childById` does ("Inputs the user types into").
- `forEach(step, items, (item) => (state) => step)`, the `andThen` of many. Both are dual, for a `pipe`, and return a
  `Folded`, whose `commands` and `events` are always there.
- `program<{ …; model }>()` may name the program's model, which is then checked against `makeModel`; `children` in
  `make` is optional.
- A `CompositionDefect` says in `on`, by its tags, which external message or event broke the parent's rule.
- What a type does not need defaults to `never`: `R` in `Execution`, `RunCommand`, `Subscription` and
  `Subscriptions`, `Command` in `Applied`, `Simulation` and `Rehearsal`, and `Event` in `Simulation`.
- The types in the API's signatures are exported (`Child`, `ChildById`, `Input`, `InputById`, `ProgramMaker` and the
  others), so that a consumer's declarations and hovers name them.
- The package ships its documentation, at its version: the guide (`site/guide/`), the tutorial (`site/tutorial/`), the
  examples (`examples/`) and the bridges' sources (`bridges/`), and a skill for coding agents,
  `skills/effect-tea/SKILL.md`.
- The bridges, as entries of the package: `@fgaudo/effect-tea/snabbdom`, with `messagesSentBy` in
  `@fgaudo/effect-tea/snabbdom/testing`, and `@fgaudo/effect-tea/react`, whose renderer is an optional peer
  (`snabbdom` ^3.6.4, `react` and `react-dom` ^19.3.1). They draw native controlled elements, React's with `Host` or
  `Draw`, which draw the first model on a server too, snabbdom's with `drawInto`, in a microtask after each new state.
  They replace the files to copy ("Writing a bridge").

### Changed

- **Breaking**: `parent` is renamed `program`, its `compose` `make`, `each` `childById`, and `dispatchTo` `forwardTo`.
  Every program is made with `make`, one without children or inputs too, and its services are inferred.
  Upgrade: `parent<{ state: State }>()` becomes `program<{ state: State }>()`, `compose({ … })` becomes `make({ … })`,
  `each(program, place)` becomes `childById(program, place)`, and `dispatchTo(dispatch, 'Clock')` becomes
  `forwardTo(dispatch, 'Clock')`. `make` returns a `Program<…>` of the types the program has, and a program written as
  a `Program<…>` still compiles, with its `subscriptions`.
- **Breaking**: a program names its own messages in `program<{ … }>()`, and has an `update` exactly when it names
  them: they are no longer inferred from `update`, `runCommand` or `subscriptions`.
  Upgrade: `make({ update: (message: Message) => … })` becomes `program<{ state: State; message: Message }>()` with
  `make({ update: (message) => … })`.
- **Breaking**: a program names the services of its commands and of its subscriptions apart, read with
  `CommandServicesOf` and `SubscriptionServicesOf`; `ServicesOf` is gone. `simulate` asks only for the commands'.
  Upgrade: `services: Storage` becomes `commandServices: Storage` or `subscriptionServices: Storage`, and
  `ServicesOf<P>` becomes `CommandServicesOf<P> | SubscriptionServicesOf<P>`.
- **Breaking**: a model is data: it holds no function, and compares by `Equal` ("Model").
  Upgrade: a function of the model that makes a message from what the user typed, `changeName: (name) =>
  NameChanged({ name })`, becomes an input, and the view writes into it through `forwardTo(dispatch, 'Name')`.
- **Breaking**: a `Dispatch` is a function that applies its message before it returns, `(message) => void`, where it
  was `(message) => Effect<void>`: when a handler returns, `update` has seen its message ("View").
  Upgrade: `Effect.runSync(dispatch(message))` becomes `dispatch(message)`, `yield* dispatch(message)` becomes
  `yield* Effect.sync(() => dispatch(message))`, and a dispatch written by hand returns nothing.
- **Breaking**: `run(program, render)` and `Frame` are removed: `start(program, options)` starts a program by plain
  code, and gives `{ app, run }`: `app`, the handle a renderer reads, `{ model, subscribe, dispatch, die }`, and `run`,
  which runs the program's effects; a model is made when it is read, once for the current state ("Running", "Writing a
  bridge").
  Upgrade: `Effect.runFork(run(program, render))` becomes `const { app, run } = start(program)`, plain code that draws
  `app.model()` with `app.dispatch` and again on each notice of `app.subscribe`, then `Effect.runFork(run)`.
- A message is applied in the call that sends it, a command's answer and a subscription's message in their own fiber;
  its subscriptions and commands start after, in the order of the states, and the next message waits for no release.
- **Breaking**: `Driver.latest` is gone: `Driver.model` is the model of the current state, and `Driver.dispatch` the
  run's own.
  Upgrade: `(yield* driver.latest).model` becomes `yield* driver.model`, and `(yield* driver.latest).dispatch`
  becomes `driver.dispatch`.
- **Breaking**: `rehearse` makes the model of each new state as it applies the message, and fails on the state whose
  model dies.
  Upgrade: a test that expects a defect of `makeModel` in `model`, `send` or `waitFor` wraps the tool.
- **Breaking**: the `Origin` of a dispatched message is tagged `'Dispatch'`, where it was `'View'`.
  Upgrade: `origin._tag === 'View'` becomes `origin._tag === 'Dispatch'`.
- **Breaking**: `RunOptions` and `DriveOptions` start from the state, as `Applied`, `Ignored` and `Update` do, and the
  state is required.
  Upgrade: `RunOptions<Message, State, Command>` becomes `RunOptions<State, Message, Command>`, and
  `DriveOptions<Message>` becomes `DriveOptions<State, Message>`.
- **Breaking**: `DefectSite` gains `'init'`, for an `init` that takes flags and throws.
  Upgrade: an exhaustive `switch` over `where` adds `case 'init'`.
- **Breaking**: the run writes no log of its own: `describeMessage`, `describeCommand` and their sites are removed.
  Upgrade: log what `onApplied` and `onIgnored` hear, in a fiber that takes it from a queue ("Running", "Logs"), and
  drop `case 'describeMessage'` and `case 'describeCommand'` from a `switch` over `where`.
- **Breaking**: `isRejected`, `raise`, `subscriptionsOf` and `View` are removed.
  Upgrade: `isRejected(result)` becomes `result === reject`, `subscriptionsOf(app)(state)` becomes
  `app.subscriptions(state)`, `onEvent: { Products: raise }` becomes `onEvent: { Products: (event) => (state) => ({
  state, events: [event] }) }`, and a bridge declares its own `View`, as `bridges/snabbdom.ts` does.
- **Breaking**: a program answers its `external` messages in a function `external`, apart from `update`, which never
  rejects; they are no longer among its messages, and a handle's `update` is `external` ("Events and external messages").
  Upgrade: `children.Page.update(message)` becomes `children.Page.external(message)`, and an external message leaves
  `message`: its case moves from `update` to `external: (message) => (state) => step`, which `Program<{ …; external }>`
  asks for.
- **Breaking**: these no longer compile: a parent's own command whose answer is a message for a child; a parent's own
  message or command whose tag can take a child's name, as a `string` tag does; a state whose type has no fields, such
  as `{}`, or that is a type parameter in `make`; a child with commands and no `runCommand`, or with events and no
  `onEvent`, those of its `external` included; a child written as an object that is no program, or whose `external`
  returns `reject`, and one that is a type parameter in `child`; a `Program<…>` that names more `external` messages
  than it takes; a program written as an object, or the pieces given to `simulate`, without `subscriptions`.
  Upgrade: answer a parent's own command with its own message; tag own messages with literals; write `state: object`
  where it was `state: {}`; give the child its `runCommand` and its parent an `onEvent`; answer an external message
  with a step; write `subscriptions: () => HashMap.empty()` in a program written as an object that listens to nothing.
- **Breaking**: `dispatchViolations` is called once, and reports as `Missing` only a candidate whose step would do
  something.
  Upgrade: `dispatchViolations(update, { repeatable, withheld })(state, sent, candidates)` becomes
  `dispatchViolations(update, { state, held, candidates, repeatable, withheld })`.
- **Breaking**: `rehearse` starts from the program's `init`, given `flags` for a program with them: `from` and
  `RehearseOptions` are gone. Its type parameters start with the program's type.
  Upgrade: `rehearse(program, scenario, { from })` becomes `rehearse({ ...program, init: from }, scenario)`, and
  `rehearse<State, Model, Message>(…)` becomes `rehearse<typeof app, State, Model, Message>(…)`, or names none.
- **Breaking**: `rehearse` applies each message in the call that sends it, and its effects after, as the run does,
  and fails on a defect of the program in any fiber.
  Upgrade: a test that expects a defect wraps `rehearse`, where its scenario caught it with `Effect.exit`.
- **Breaking**: `rehearse`'s `hearNext` keeps its subscription while its key stays, each call hearing its next message,
  and each start of a key is heard with `hear` or with `hearNext`, never both.
  Upgrade: after its end value, a key must go away and come back before it is heard again.
- **Breaking**: `simulate` runs each command after those started before it, as the run does.
  Upgrade: a step starting `A` and `B`, with `A`'s answer starting `C`, is heard `A, B, C`, where it was `A, C, B`.
- **Breaking**: as the run ends, it stops applying messages first, then its commands and subscriptions.
  Upgrade: a command or a subscription that sent a message for the program to act on as it is released does that work
  itself.
- **Breaking**: `onApplied` and `onIgnored` are functions that return nothing, called as `update` is, not effects.
  Upgrade: `(applied) => Effect.sync(() => record(applied))` becomes `(applied) => { record(applied) }`, and one
  declared apart returns `: undefined`, not `void`; slow work goes to a queue, offered with `Queue.offerUnsafe`
  ("Running", "Give slow work to a queue").
- **Breaking**: the constructors of `InvariantDefect`, `ProgramDefect` and `CompositionDefect` are private.
  Upgrade: `throw new InvariantDefect({ reason })` becomes `defect(reason)`; another error of a program's own is an
  error class of its own.
- The peer dependency on `effect` is `~4.1.4`, where it was `^4.0.0`: a later minor of Effect needs a release of the
  library.
- A parent lifts once the subscriptions of children that share one state object, and keeps them by that object.
- A child whose state is not an object, past the types, is a `CompositionDefect` that names it, not a `TypeError`.
- `simulate` and `rehearse` read `subscriptions` and compare keys on each new state, and fail where the run dies of a
  defect, as a `ProgramDefect` in the run's site.
- The guide moved from the README to the site, a page per concept, with a tutorial that builds the `timer` example, a
  "Glossary" and "Coming from Elm or React"; a section the README had is found there on the page of its concept.
- The guide now promises that messages are applied one at a time, in the order they were sent; that commands run
  concurrently, and the end of the run interrupts them; and that `subscriptions` is pure. It says that nothing is
  bounded or times out ("Guarantees", "Commands", "Running").
- The guide tells a promise from a description of the version installed: what stands under "Precisely", and under
  "What is left to you" in "Guarantees", describes, and may change in any release ("Guide", "What a page promises").
- What the guide's "View" said of every renderer is now what each bridge promises. `counter` and `form` draw with
  React too.

### Fixed

- The declarations of `dist/` import `.js` files, where they imported `.ts` files that `dist/` lacks, which tools
  other than TypeScript could not resolve.
- A package that exports a program, a child or what the API returns emits its declarations, where TypeScript failed
  with `TS2742`, `TS2883` or `TS4023`; `Applied`'s `revision` is a `number` in them.
- A child's types read the `external`, `flags`, events, commands and services it has, where some read as `never`, as
  `unknown` or as absent, and a `Program<…>` that names fewer `external` messages than it takes compiles. `CommandOf`
  and `EventOf` read what `external` returns too, and a program written as an object that listens to nothing needs no
  service.
- `andThen` over steps that list no commands or no events gives a step that has none, where they were `unknown`.
- The run ends with every defect of its pieces and their releases, two equal by `Equal` among them, in the order they
  happened and saying where, and applies no message once one happened.
- `drive` puts a defect of the program before the scenario's failure, waits for the run's release, and says its
  patience with a unit, `within 500ms`, with the latest model as the `cause`, where it gave an `Option` of it. It
  calls `init` before the scenario, so a scenario that returns at once fails on an `init` that throws, as `rehearse`.
- `rehearse` no longer loses a command's answer or a message, and hears, applies and ends as the run does.
- A command or a subscription that another fiber of the program interrupts is a defect in its site, in the run,
  `simulate` and `rehearse`, where the run went on, or ended, in silence.
- `simulate` closes a command's scope as the run does.
- A message or command whose wrapping comes back to itself is described by its tags until then, `Loop › …`, where its
  description overflowed the stack.
- A parent whose `subscribed` lists an id twice says so, not that an own key took a child's.

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
