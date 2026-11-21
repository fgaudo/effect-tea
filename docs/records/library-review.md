# A review of the whole library

**Status:** done, 21 November 2026, at commit `c209854`, by a session of Opus 5.5 that the owner asked for a review
of the whole library. Six reviewers of Opus 5.5, each on one part, read the code and ran probes. Then six verifiers of
Opus 5.5, one for each part, tried to refute each finding, read the code themselves, and ran their own probes. The
session checked the lines each surviving finding names. The findings are open problems of
[`ROADMAP.md`](../../ROADMAP.md), each with its `test.failing` where a test can hold it. Nothing else was changed.

## What was read and run

The six parts were: the engine (`src/` but the testing tools), the testing tools (`src/testing/`), the bridges
(`bridges/`, with the bridge the examples share), the API and its types (`src/index.ts`, `src/testing/index.ts`, the
bridges' exports, `program.ts`, the types of `compose.ts`, `package.json`, `tools/smoke/`, `tools/inference/`), the
documentation against the code (every page of `site/guide/`, the tutorial, the skill, `README.md`, the unreleased
section of `CHANGELOG.md`, the doc comments), and the tests, the tools and the examples. Each reviewer read the skill
of its part, the parts of [`invariants.md`](../invariants.md), [`premises.md`](../premises.md) and
[`rejected.md`](../rejected.md) that bear on it, `ROADMAP.md`, and [`architecture-review.md`](architecture-review.md).
Each was told not to report what those already plan or reject.

`bun run test` passed (981 tests), and so did `bun run typecheck`. A probe was a throwaway test file, run with
`bun test` and deleted. Not run: `bun run mutations` and `bun run interleavings`.

## In short

23 findings were reported. 3 were refuted. 2 were the same as another. That leaves 18, and none was already known. The
engine held up: the reviewer of the engine found no scope leak, no lost defect, no ended subscription restarted, and no
break of the order of messages, and every defect site it checked has a mutation.

What was found is mostly at the edges:

- **A child written as an object is checked less than a program.** Three ways in which a program written without
  `make` or `Program<…>` compiles as a child and then dies, or widens its parent's types.
- **Two checks by identity meet a primitive state**: a write of `NaN` over `NaN` makes a new state, and a state that is
  `undefined` crashes `model()`.
- **`rehearse` differs from the run** in the order of its end, which can hang, and in the key its defect carries.
- **The bridge to React** reports one death twice when `<Activity>` hides `Host` in the batch of the death.
- **A parent's `init` runs in `make`**, so a defect in it escapes `make`.
- **Four sentences are false of the code**: one of the guide, one of the changelog, one of a doc comment, and the
  comments of an example.
- **Four checks are missing**: mutations of the rejection, the caret in two tests of the bridges, the links of
  `examples/README.md`, and `Effect.fnUntraced` in the tests' helpers.
- **One case is left to decide**: a listener stopped during a notice is still told of it.

## The findings

Each finding keeps the id the review gave it. "Probed" means that the reviewer and the verifier each ran a probe that
showed it.

### A child written as an object

The guide allows a child written as an object ("Composition", "Precisely": "a program written without `Program<…>`
can be one"). `DeclareChild` and `DeclareChildById` bound such a child by `AnyProgram` alone, whose `update`,
`subscriptions` and `makeModel` are `any` and which has no `external`. `CheckedChild` adds only the check of
`runCommand`. `start` takes `Shape`, and refuses some of what `child` takes.

- **api-1. A child whose `external` returns `reject` compiles** (`src/compose.ts`, `DeclareChild`; `tell`). The parent's
  `update` then sets the child's state to `undefined`, and the run dies later with a `CompositionDefect` that names the
  state, not the rejection. The guide says "Answer an external message with `reject`: it does not compile", and
  `AGENTS.md` names "a child that rejects an external message" as a combination that must not compile. A plain object
  that is no program (`subscriptions: 'none'`, `makeModel: 42`) also passes `child`. Probed. The only test of the rule
  (`compose.test.ts`) types its child `Program<…>`.
- **api-2. `CommandOf` and `EventOf` do not read `external`** (`src/program.ts`, `Returned`). A child that returns
  commands or events from `external` alone needs no `runCommand` and no `onEvent`, compiles, and dies with a
  `CompositionDefect`. This breaks "a child with commands and no `runCommand` does not compile" ("Composition") and
  "`onEvent` is required exactly when a child has events" ("Events and external messages"). The comment on `CommandOf`
  says that it reads `update` for a program written without `Program<…>`: `external` was left out. Probed.
- **api-4. An empty map of subscriptions reads as `unknown` services** (`src/program.ts`, `SubscriptionServicesOf`). A
  child written as an object with `subscriptions: () => HashMap.empty()` gives `HashMap<never, never>`, from which the
  inference takes `unknown`. Its parent's `run` is then `Effect<never, never, unknown>`, which `Effect.runFork` refuses.
  The same object started alone needs `never`. `make` handles the empty map for a parent's own subscriptions (`Needed`
  in `compose.ts`), not for a child's. This widens a type, against the third rule of the types. Probed.

None of the three is held by a `test.failing`: the defect is in what compiles. A fix adds the `@ts-expect-error` and
`expectTypeOf` checks that the probes used, beside the tests of `child` in `compose.test.ts`. The inference matrix
(`tools/inference/`) writes its hand-written programs with `Program<…>`, so it never met these cases.

### A parent's `init` runs in `make`

- **api-3 (and docs-1). A defect in the `init` of a parent with children and no flags escapes `make`**
  (`src/compose.ts`, the `init` of the program `make` returns). `make` calls `init(handles)` as it builds the program,
  so a `defect(...)` in it is thrown when the module that declares the program is evaluated. There is no handle and no
  `ProgramDefect`, and the application's report of a crash never sees it. "Running" promises that "A defect in `init` is
  recorded as the program starts. `start` still gives a handle", and so do the doc comments of `start` and `Started`. A
  program with flags keeps the promise. Step 9 of the roadmap and part "Smaller points" of `architecture-review.md` name
  the two forms of `init`, not this. Probed.

### Two checks by identity meet a primitive state

- **engine-1. A write of `NaN` over `NaN` makes a new state** (`src/compose.ts`, `liftAt`). `written` returns the state
  held, since `Equal.equals(NaN, NaN)` is true. `liftAt` then compares with `===`, which is false for `NaN`, and makes a
  new parent state: a new model, and a notice to every listener. "Guarantees" promises that a value equal, by `Equal`,
  to the one the place holds leaves the very same state. Only an input's place can hold a primitive, so `Object.is`
  there would keep the promise. Probed.
- **engine-3. A state that is `undefined` crashes `model()`** (`src/run.ts`, `model`). `last` starts as `undefined`, and
  the check is `last?.state !== state`: with a state that is `undefined`, no model is made, and `last.made` throws a
  `TypeError` that is recorded as no defect. Such a state comes only from a cast or from plain JavaScript, but
  `invariants.md` says that a program run alone never needs its state to be an object. Probed.

### `rehearse` differs from the run

- **testing-1. `rehearse`'s end can hang, where the run ends** (`src/testing/rehearse.ts`, `end`). The run's end stops
  all its fibers together. `rehearse` stops the subscriptions `hearNext` started, waits for their release, and only then
  stops the commands. When a subscription's release waits for what a command's release gives, the run ends, and
  `rehearse` never does. Its end runs under `uninterruptibleMask`, so no timeout around it ends it either. The order of
  the defects at the end differs too: a subscription's comes first. `contract.test.ts` has no case that releases a
  command and a subscription at the end. Probed.
- **testing-2. `rehearse`'s defect in a subscription carries the test's key** (`src/testing/rehearse.ts`, `listen`).
  The run's `ProgramDefect` carries the key the program listed. `rehearse`'s carries the key given to `hearNext`, which
  is found by `Equal` and may be another object, or hold other data. "Testing tools" promises the same `key`, and
  `defect.ts` says "the subscription's key as it is". The contract's case uses a string key, which cannot show it.
  Probed.

### The bridge to React

- **bridges-1. A death is reported twice when `<Activity>` hides `Host` in its batch** (`bridges/react.ts`, the cleanup
  of `Host`'s effect). It mirrors the finding fixed on 21 November 2026, where the parent removed `Host`. Here the
  cleanup gives the death to `reportError`, since `Host` has not thrown it. `<Activity>` keeps `Host`'s state, so when
  `Host` is shown again it throws the same death to the boundary. It does not start the program anew either. Probed.

### Sentences false of the code

- **engine-5. "Composition", "Ids that come back"**: "Subscriptions do not need this: when a row is removed, its
  subscriptions stop." When one step removes a row and adds a new row with the same id, the keys stay. The old row's
  subscription runs on, and the new row's never starts: a subscription that ended is not started again, since its key
  never went away. The engine does as the rule of keys says. The sentence is what is false. Probed.
- **docs-2. `CHANGELOG.md`, the unreleased entry of `dispatchViolations`**, says that `withheld` is gone, and its line
  of upgrade drops it. `withheld` is still an option, the guide documents it, and 0.7.1 had it. A user who follows the
  line loses it. Probed.
- **docs-3. The comments of `examples/form/form.ts`** (its head, and the comment on `SaveSucceeded`) say that what is
  typed is rejected once the form has put another name in its place. That was the write with `was`. Since the write
  without it ([`write-without-was.md`](write-without-was.md)), a write into the name is stored in every state. Probed.
- **docs-4. The doc comment of `drive`'s `send`** says that it waits for a model that shows the message, the current one
  or a later one, and so it does. The guide's "drive" says that `send` "finds the message on a model and sends it at
  once", and names `waitFor` alone as a wait. The comment promises what the guide does not. Nothing tells `drive`'s
  `send` from `rehearse`'s, which fails at once.

### Checks missing

- **engine-2 (and mutations-1). The rejection has no mutation** (`tools/mutations/mutations.ts`). Three checks hold
  "`reject` means one thing" and the rule of an input: `onNone: () => reject` in `updateAt` (`compose.ts`), which
  rejects a message whose place is not there; `result === reject ? reject : …` in `updateAt`, which passes a child's
  rejection on; and `if (result === reject) return ignored` in `Core.arrive`. `invariants.md` says of the first, "Each
  check has a mutation". Tests kill each: the verifier took out the first on a copy, and 10 tests failed. What is
  missing is the entry of the list.
- **bridges-4. Two tests of `bridges/bridge.test_suite.ts` name the caret and do not check it**: "what is typed is
  stored, and the element keeps it with its focus and its caret", and "a textarea keeps what is typed, with its caret,
  and stores it". Neither reads `selectionStart` or `selectionEnd`. The guide's "Writing a bridge" lists the caret among
  what the tests check. No test checks a textarea's caret.
- **smoke-1. The smoke test does not check the links of `examples/README.md`** (`tools/smoke/smoke.ts`). The package
  ships it, and its links are relative. `AGENTS.md` says that `bun run smoke` fails on a link the package lacks. All
  its links resolve today.
- **rule-1. About thirty helpers of the tests take arguments and return an `Effect.gen`**, against "Code" in
  `AGENTS.md`, which says `Effect.fnUntraced`, tests included. Among them `playRound` in `run.test.ts`, added by
  `e0df006`, and the scenarios written `(driver) => Effect.gen(…)` in `contract.test.ts`. Neither the lint nor the
  typecheck flags them, and new tests copy their neighbours.

### Left to decide

- **engine-4. A listener stopped during a notice is still told of it** (`src/engine.ts`, `tell`). `tell` goes over a
  copy of the listeners, so a listener that an earlier one stops is still called for that state. The guide says only
  that `subscribe` "returns what stops it", and not when a stop takes effect. The bridge to snabbdom guards its own draw
  with a flag. A bridge written from the guide would not know that it has to. The verifier found it plausible, not
  broken: an unstated case, not a promise. To decide: the guide says that a stop takes effect from the next notice, or
  `tell` skips a listener that was stopped.

## Refuted

- **testing-3.** `drive`'s `send`, made by a fiber that `onApplied` wakes, returns before its message is applied. The
  behaviour is real, and documented: "View" says that code a function of the program wakes may send while a message is
  being applied, and that such a call may return before its message is applied. The options are among those functions.
- **bridges-2.** The bridge to snabbdom writes the text "undefined" into an element drawn with
  `props: { value: undefined }`. A controlled element is given the string its model holds. And snabbdom alone writes
  "undefined" too, on any patch from a string to `undefined`.
- **bridges-3.** `messagesSentBy` calls the listeners of a disabled element. By design: its doc comment says that it
  calls every listener in the tree, without a DOM. It checks what each control sends, not what a browser lets a user do.

## What follows

The roadmap's "Open problems" lists the findings by these groups, with their tests. The types of a child written as an
object (api-1, api-2, api-4) are one fix: `child` checks such a child as `start` checks a program, and `external` is
read where `update` is. The `init` of a parent (api-3) may be decided with step 9 of the roadmap, which weighs the two
forms of `init`. The two differences of `rehearse` belong with step 7, one engine under the run and the testing tools,
but neither waits for it.
