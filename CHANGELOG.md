# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version, and everything else, features included, the patch version.

## 0.8.0 (unreleased)

### Added

- Inputs: `inputs: { Name: input({ at }) }` in `make`, a plain value of the state that the view writes over with
  `{ _tag: 'Written', was, value }`; the library stores a write while the place holds `was`, by `Equal`, and rejects
  it otherwise. `inputById` declares one per id, as `childById` does ("Inputs the user types into").
- `edited` and `drawn`, over an opaque `Shown`: the rule a bridge calls for the element of an input, so that the
  element is never replaced and never takes back what the user typed ("Writing a bridge").
- `forEach(step, items, (item) => (state) => step)`, the `andThen` of many. Both are dual, for a `pipe`, and return a
  `Folded`, whose `commands` and `events` are always there.
- `program<{ …; model }>()` may name the program's model, which is then checked against `makeModel`; `children` in
  `make` is optional.
- A `CompositionDefect` says in `on`, by its tags, which external message or event broke the parent's rule.
- What a type does not need defaults to `never`: `R` in `Execution`, `RunCommand`, `Subscription` and
  `Subscriptions`, `Command` in `Applied`, `Simulation` and `Rehearsal`, and `Event` in `Simulation`.
- The types in the API's signatures are exported (`Child`, `ChildById`, `Input`, `InputById`, `ProgramMaker` and the
  others), so that a consumer's declarations and hovers name them.
- The package ships its documentation, at its version: the guide (`site/guide/`), the tutorial (`site/tutorial/`),
  the examples with their bridges (`examples/`), and a skill for coding agents, `skills/effect-tea/SKILL.md`.

### Changed

- **Breaking**: `parent` is renamed `program`, its `compose` `make`, `each` `childById`, and `dispatchTo` `forwardTo`.
  Every program is made with `make`, one without children or inputs too, and its services are inferred.
  Upgrade: `parent<{ state: State }>()` becomes `program<{ state: State }>()`, `compose({ … })` becomes `make({ … })`,
  `each(program, place)` becomes `childById(program, place)`, and `dispatchTo(dispatch, 'Clock')` becomes
  `forwardTo(dispatch, 'Clock')`. `make` returns a `Program<…>` of the types the program has, and a program written as
  a `Program<…>` still compiles.
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
  NameChanged({ name })`, becomes an input, and the view writes over its value through `forwardTo(dispatch, 'Name')`.
- **Breaking**: a `Dispatch` returns `Effect<number>`, the number of its message among those dispatched, and a `Frame`
  has `seen`, how many of them the run had taken when its state was made.
  Upgrade: a dispatch written by hand returns a number, `(message) => Effect.sync(() => sent.push(message))`, and a
  frame made by hand has `seen`.
- **Breaking**: a frame's model is made as the renderer pulls the frame, and a `Frame` is plain data; `rehearse` makes
  the model of each new state as it applies the message, and fails on the state whose model dies.
  Upgrade: a renderer that pulls a frame it does not draw pays for its model; a test that expects a defect of
  `makeModel` in `model`, `send` or `waitFor` wraps the tool.
- **Breaking**: the `Origin` of a dispatched message is tagged `'Dispatch'`, where it was `'View'`.
  Upgrade: `origin._tag === 'View'` becomes `origin._tag === 'Dispatch'`.
- **Breaking**: `RunOptions` and `DriveOptions` start from the state, as `Applied`, `Ignored` and `Update` do, and the
  state is required.
  Upgrade: `RunOptions<Message, State, Command>` becomes `RunOptions<State, Message, Command>`, and
  `DriveOptions<Message>` becomes `DriveOptions<State, Message>`.
- **Breaking**: `DefectSite` gains `'init'` and `'log'`, for an `init` or a `Logger` that throws.
  Upgrade: an exhaustive `switch` over `where` adds `case 'init'` and `case 'log'`.
- **Breaking**: `isRejected`, `raise` and `View` are removed.
  Upgrade: `isRejected(result)` becomes `result === reject`; `onEvent: { Products: raise }` becomes
  `onEvent: { Products: (event) => (state) => ({ state, events: [event] }) }`; a bridge declares its own `View`, as
  `examples/bridges/snabbdom.ts` does.
- **Breaking**: these no longer compile: a parent's `external` that names a message its child keeps to itself; a
  parent's command whose answer is a child's own message; a state whose type has no fields, such as `{}`, or that is a
  type parameter in `make`; a child with commands and no `runCommand`.
  Upgrade: send a child only its external messages, through its handle; write `state: object` where it was `state: {}`;
  give the child its `runCommand`.
- **Breaking**: `dispatchViolations` is called once, and reports as `Missing` only a candidate whose step would do
  something, so `withheld` is gone.
  Upgrade: `dispatchViolations(update, { repeatable, withheld })(state, sent, candidates)` becomes
  `dispatchViolations(update, { state, held, candidates, repeatable })`.
- **Breaking**: `rehearse` starts from the program's `init`, given `flags` for a program with them: `from` and
  `RehearseOptions` are gone. Its type parameters start with the program's type.
  Upgrade: `rehearse(program, scenario, { from })` becomes `rehearse({ ...program, init: from }, scenario)`, and
  `rehearse<State, Model, Message>(…)` becomes `rehearse<typeof app, State, Model, Message>(…)`, or names none.
- **Breaking**: `rehearse` applies every message in one loop, and fails on a defect of the program in any fiber.
  Upgrade: a test that expects a defect wraps `rehearse`, where its scenario caught it with `Effect.exit`.
- **Breaking**: `rehearse`'s `hearNext` keeps its subscription while its key stays, each call hearing its next message,
  and each start of a key is heard with `hear` or with `hearNext`, never both.
  Upgrade: after its end value, a key must go away and come back before it is heard again.
- **Breaking**: `simulate` runs each command after those started before it, as the run does.
  Upgrade: a step starting `A` and `B`, with `A`'s answer starting `C`, is heard `A, B, C`, where it was `A, C, B`.
- **Breaking**: as the run ends, it stops applying messages first, then the renderer, then commands and subscriptions.
  Upgrade: a renderer that sent a message for the program to act on as it is released does that work itself.
- **Breaking**: only the library builds an `InvariantDefect`, a `ProgramDefect` or a `CompositionDefect`: their
  constructors are private, so a `new` of one, or a class that extends one, no longer compiles. Read them as before,
  with `instanceof`, `toThrow` and their fields.
  Upgrade: `throw new InvariantDefect({ reason })` becomes `defect(reason)`; any other error of a program's own is an
  `Error` of its own, or an Effect `Data.TaggedError`.
- The peer dependency on `effect` is `~4.1.4`, where it was `^4.0.0`: a later minor of Effect needs a release of the
  library.
- A parent lifts once the subscriptions of children that share one state object, and keeps them by that object.
- A child whose state is not an object, past the types, is a `CompositionDefect` that names it, not a `TypeError`.
- `simulate` and `rehearse` read `subscriptions` and compare keys on each new state, and fail where the run dies of a
  defect, as a `ProgramDefect` in the run's site.
- The guide moved from the README to the site, a page per concept, with a tutorial that builds the `timer` example, a
  "Glossary" and "Coming from Elm or React"; a section the README had is found there on the page of its concept.
- The guide now promises what the run already did: messages are applied one at a time, in the order they were queued;
  commands run concurrently, with no bound, and the end of the run interrupts them; nothing is bounded or times out;
  `subscriptions` is pure; the run waits for `onApplied` and `onIgnored` ("Guarantees", "Commands", "Running").
- The examples' bridges are in `examples/bridges/`, with `messagesSentBy` in `snabbdom-testing.ts`; they settle each
  text `<input>` with `drawn`, and no longer have `onInput`. `counter` and `form` draw with React too.

### Fixed

- A package that exports a program, a child or what the API returns emits its declarations, where TypeScript failed
  with `TS2742`, `TS2883` or `TS4023`; `Applied`'s `revision` is a `number` in them.
- The types of a program read what it has: a child that names no `external`, without `exactOptionalPropertyTypes`; a
  child whose `flags`, events or commands are `unknown`; services typed `any` or `unknown`, which a parent read as
  `never` and ran without; and a parent whose `runCommand` and `subscriptions` need different services compiles
  without an annotation.
- A `Program<…>` that names more `external` messages than it takes, or ones that are not among its messages, no longer
  compiles; one that names fewer does.
- `andThen` over steps that list no commands or no events gives a step that has none, where they were `unknown`.
- The run ends with every defect, in the order they happened, and says where: a defect of a release, of a renderer
  being released, of a subscription key's `Equal` or `Hash`, of an effect that interrupts itself or fails against its
  type, and one already among the run's. A run that died applies no message, even one taken before the defect, and an
  interrupted fork of the renderer no longer leaves it running.
- `drive` puts a defect of the program before the scenario's failure, waits for the run to release what it holds, also
  when interrupted, and says its patience with a unit, `within 500ms`.
- `rehearse` no longer loses a command's answer, nor a message sent before its scenario returned; it applies messages
  one at a time, runs the subscription listed when its key appeared, keeps it while its key stays, fails on a command
  interrupted or still under way at the end, and leaves no scope or fiber of its own running.
- `simulate` closes a command's scope as the run does, and has begun the command's effect once interrupted after
  `runCommand`.
- A message or command whose wrapping comes back to itself is described by its tags until then, `Loop › …`, where its
  description overflowed the stack.
- A parent whose `subscribed` lists an id twice says so, not that an own key took a child's.
- A parent's own message or command that can take the name of a child or of an input no longer compiles: one tagged
  `string`, or with a template the name matches, or an optional tag, and one of `unknown` or `object`. Nor does an
  external message that can take a child's name and gives it a message the child keeps to itself.

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
