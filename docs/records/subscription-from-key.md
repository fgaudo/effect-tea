# A subscription made from its key alone: the spike

**Status:** done, 23 November 2026, as step 38 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, written
anew from `main` with the array branch as a guide: what it did otherwise is under "What was written", at the end.
Spiked the same day by a session of Fable 5.2, with the library's tests converted by five sessions
of Opus 5.5, each with its files. On two branches, never to be merged: `spike/subscription-from-key` at `40d9400`,
where the keys are listed in a `HashSet`, and `spike/subscription-from-key-array` at `2544407`, where they are listed
in an array, the form this record advises. It is step 30 of [`ROADMAP.md`](../../ROADMAP.md), which the owner took
from [`application-report.md`](application-report.md), "What the owner decided". Taken by the owner the same day,
each of its seven points as advised ("Decided", at the end), to be done as step 38. Read against the code at
`a1af9da`.

## In short

The form works, on no new premise. `subscriptions` gives the keys alone, as data, and a second function of the
program, `listen`, makes the subscription of a key, as `runCommand` makes the execution of a command:

```ts
export type Key = Data.TaggedEnum<{ Steps: { dt: number } }>

export const bounce = program<{ state: State; model: Model; message: Message; flags: Flags; key: Key }>().make({
  init,
  update,
  subscriptions: (state) => flying(state) ? [Key.Steps({ dt: state.dt })] : [],
  listen: ({ dt }) => steps(dt),
  makeModel
})
```

`listen` does not see the state, so a subscription can use nothing that its key lacks: "Whatever a subscription
depends on is in its key" leaves "What is left to you", kept by construction.

What the spike found that the roadmap did not ask:

- **A defect of a parent becomes an error of the compiler.** A child's key is listed under its name as its command is,
  `{ _tag: <child>, instance, key }`, so the types refuse an own key that could take a child's name, as they refuse
  such a command. The `CompositionDefect` "An own subscription key is the key of a subscription of …" is gone.
- **A parent lifts a child's subscription once for each start**, in `listen`, and no longer for each state. With the
  keys in an array, a parent of a thousand children lists and reconciles them in 191 µs for each change of state,
  where `main` takes 328 µs.
- **The list is better an array than a `HashSet`.** A `HashSet` costs that parent 600 µs, since Effect's `HashSet` has
  nothing like `HashMap.mutate`, and `HashSet.make("ticks")` is a `HashSet<string>`, which a key `"ticks"` refuses.
- **A defect while a subscription is made is the subscription's**, with its key, in its own fiber. Today it is a
  defect of the step, in `subscriptions`, on the stack of whoever sent the message.
- **One inference is lost**, for a program written in the call of `start` (below, "Services, and what the types
  infer").

On the array branch the whole suite passes: 1074 tests, with 5 skipped that have no translation, each of them
expected. The inference matrix finds no lead.

## Whether it was weighed before

It was not. `docs/rejected.md` was read by its entries, not by its titles alone, and the records were searched. No
entry weighs a `subscriptions` that gives keys alone. Its neighbours, none of which this form reopens by itself:

- **`describeKey`**, rejected: a key reaches a `ProgramDefect` and an `Origin` as it is. Its "Reopen if" is "a program
  needs a key that must hold private data and cannot be built otherwise". This form brings that nearer ("For the
  owner", point 6).
- **"What a key sends is not data"**, parked. It comes nearer by one step ("The testing tools", below).
- **`hear` refusing a write**, rejected, with "Reopen if `Shape` gains a type of what its subscriptions send". This form
  does the opposite: `subscriptions` no longer names a message at all.
- **`subscriptions` optional on a program's type**, rejected. Kept as decided: a program on a type always has
  `subscriptions`.

## What was built

On `spike/subscription-from-key-array`, each with what ran:

- **`src/subscription.ts`.** `Subscriptions<State, Key>` is `(state) => ReadonlyArray<Key>`, and `Listen<Key, Message,
  R>` is `(key) => Subscription<Message, R>`. `Subscription` is unchanged, an alias of Effect's `Channel`.
- **`src/program.ts`.** A program names `key` beside `command`. `Listener` asks for `listen` exactly when the program
  has keys, as `Interpreter` asks for `runCommand`, and `listenOf` reads it, as `runCommandOf` does. `KeyOf` reads the
  keys back, and `SubscriptionServicesOf` reads the services from `listen`.
- **`src/core.ts`.** `reconcile` takes the keys listed, and gives each fresh key with its start, without a
  subscription. A key listed twice is listed once.
- **`src/engine.ts`, `src/run.ts`.** The job of a step holds keys. The fiber of a subscription calls `listen`, as the
  fiber of a command calls the interpreter. About ten lines.
- **`src/compose.ts`.** `make` asks for `subscriptions` and `listen` exactly when the program names keys of its own,
  and refuses both otherwise. A parent lists its children's keys under their names, and its `listen` lifts a child's
  subscription. The services of the subscriptions are read from what `listen` returns.
- **`src/testing/`.** `rehearse` keeps the key of a start that nobody hears, and `hearNext` calls `listen` as it opens
  the start. The ledger is unchanged. `simulate` and `drive` change in their types alone.
- **`bridges/react.ts`.** `Host` and `HostProps` take the type of the keys.
- **The six examples that listen**, and their tests. **Every test of the library.** **`tools/inference/`**, and
  **`tools/bench/keys.ts`**, which measures a parent's keys listed and reconciled.

The sources changed by 220 lines added and 134 removed, in ten files. The examples' programs changed by 28 and 23.

## What the roadmap asked

### What a key is

A value of a type that the program names, `key`, compared by `Equal`, which carries what its subscription needs. A key
that carries data is a case of a `Data.TaggedEnum`, as a command is. A string still does for a program with one
subscription that needs nothing: `key: "ticks"`. What decides when a subscription starts again and what it is made
from are now one value, where they were two.

### The name of the function, and what a program leaves out

The spike wrote `listen`, and `key` for the type. The guide already says that a program listens to the world, and a
child's `listening` says when its subscriptions run. Weighed, not written:

- `runSubscription`, as `runCommand`. Nothing is run by either, but the pair reads alike. `src/shell.ts` has an
  internal function of that name.
- `subscribe`, which the handle of `start` already has, for a renderer's listener.

A program without subscriptions leaves out both `subscriptions` and `listen`, in `make`. A program written as an
object keeps `subscriptions: () => []`, as decided on 18 November 2026, and has no `listen`.

### What a parent lifts

A child's keys, each wrapped as `{ _tag: <child>, instance, key }`, with its `id` for a child by id. They were arrays,
`[<child>, instance, key]`. The parent's own `listen` finds the child by the tag, calls the child's `listen` with the
child's own key, and maps its messages, once for each start. The cache that kept a child's lifted subscriptions by its
instance now keeps its wrapped keys.

The types read back as expected in every case that the tests of `compose` hold, a nested parent among them:
`KeyOf` of a parent is its own keys and its children's, and it is what its `listen` takes. An own key typed `unknown`
beside a child does not compile, as an own command typed `unknown` does not.

### The testing tools

- **`program.subscriptions(state)`** is an array of keys, which a test compares as it is:
  `expect(bounce.subscriptions(before)).toEqual([Key.Steps({ dt: before.dt })])`. That test failed as first written,
  with the constant `dt` of the test: the key shows what the subscription depends on, which no test could see before.
- **`program.listen(key)`** gives a test the subscription of a key, without a state that lists it.
- **`hear` and `hearNext`** are unchanged. They take a child's key in its new shape.
- **`simulate`** reads the keys of each state and runs nothing, as before.
- **"What a key sends is not data"** comes nearer by one step. A test's list of what each key sends is a function of
  the type of the keys, so a `switch` on it does not compile until it says what a new key sends (`heardFrom`, in the
  test of `bounce`). What a key sends is still a `Channel`, which no tool reads.

### Services, and what the types infer

`SubscriptionServicesOf` is read from what `listen` returns, as `CommandServicesOf` from `runCommand`. In `make`, the
parameter `K` and the two types that read the services out of a map are gone, and `subscriptions` names neither a
message nor a service.

The inference matrix, with a `key` and a `listen` for each case that listens and `KeyOf` among what it reads back:
49,951 cases, no lead, with TypeScript 5.9.3, 6.0.3 and 7.0.2, each with `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess` on. One special case changes its verdict: a `subscriptions` that returns nothing, given to
`make` by a program that names no key, was valid and is refused, as a `runCommand` is for a program that names no
command.

What was lost, each found by a converted test:

- **A program written in the call of `start`, spread from a typed one, with an `update` whose parameter is not
  annotated.** `start({ ...counter, update: (message) => … })` compiles on `main` and not here: `message` is
  `unknown`. On `main` the `subscriptions` of the typed program named the message, and fixed it. Run as a probe on
  both. A program of `make` names its types first, and is not touched.
- **`listen: (key) => …` beside a `subscriptions` that takes its state from the context**, in an object given to
  `start`: `key` is `any`, and needs its type. One test.
- **`subscriptionServices` named on a `Program<…>` that names no `key`** reads back as `never`, as `commandServices`
  without `command` does today.
- **`rehearse` needed for the keys what it has for the commands** (`Commanded`): a program without keys gives the
  type of the keys and of their services nothing to be inferred from. Found by the test of `form`, and done.

### `bounce`, `volume` and the timer

- **`bounce`** gains the most. Its key is `Steps({ dt })`, and the comment that said why `dt` could stay out of the key
  is gone, with the reasoning it asked of a reader.
- **`volume`** is shorter: its key was already the slider, and `subscriptions` is `Opt.toArray(dragged(state))`.
- **The timer** pays: a type of one key, `Ticks`, and a `listen` that returns the same channel for it. Five lines for
  the first subscription of the tutorial, where a string under a map was one.

### Premises

None is added with the keys in an array: `reconcile` still reads the keys through a `HashMap`, as today, and `listen`
is called in a fiber as the interpreter of the commands is. With a `HashSet`, the premise "`HashMap` calls a key's
`Equal` and `Hash` only within the call it is given the key in" would be needed of `HashSet` too.

## The list: an array or a `HashSet`

Run, `tools/bench/keys.ts`: a parent of children by id, each with one key, 2000 states that each change one child,
the keys listed and reconciled with those before. Microseconds for each change of state, the children changing in
turn and then the first alone.

| The keys are listed in…                       | 10 children | 1000 children |
| --------------------------------------------- | ----------- | ------------- |
| a `HashMap` with their subscriptions (`main`) | 2.6, 2.4    | 328, 266      |
| a `HashSet`                                   | 3.1, 3.1    | 600, 545      |
| an array                                      | 2.7, 2.9    | 191, 125      |

`HashSet.fromIterable` takes about 370 µs for a thousand keys, and `HashMap.mutate` with as many `set` 94 µs: Effect's
`HashSet` has no transient form, so a parent would build a persistent set on every change of state.

- **An array** is what a step lists its `commands`, `events` and `tell` in. A literal keeps its type
  (`["ticks"]` is a list of `"ticks"`), a test compares it with `toEqual`, and the subscriptions of a step start in
  the order listed. It needs one rule: a key listed twice is listed once. `reconcile` keeps it without building a
  set where nothing changed, by the starts of the keys it finds, and a test and a property hold it.
- **A `HashSet`** says by its type that no key is twice. `HashSet.make("ticks")` is a `HashSet<string>`, so a string
  key needs `as const` (about thirty times in the tests of the contracts alone), and two keys need
  `HashSet.fromIterable<Key>([…])`.

## What the tests said

Each session converted its files to the `HashSet` form and ran them; the array form was then made from them by a
script, and run whole.

- **`bun test`, but for the search:** 1074 pass, 5 skipped, none fails, in 37 files. **The search:** its 22 properties
  pass. **On Node:** 776 pass; two `describe` do not load, since the shim of `bun:test` has no `test.skip`, which the
  spike used to mark what has no translation.
- **The typecheck** passes, on the library, the examples and both configurations of the bridges.
- **No translation, 5 tests**, all of `src/testing/contract.test.ts`:
  - "rehearse's hearNext runs the subscription listed when its key appeared, as the run starts it", under "a
    subscription that depends on more of the state than its key". Its program cannot be written: it is what this form
    rules out.
  - Four tests of a state whose subscriptions are a defect because an own key is a child's. The same program is one
    `@ts-expect-error` now. The run still dies in `subscriptions` of what `subscriptions` throws, which other tests
    hold.
- **More than a mechanical translation:** about 30 of some 200 programs under test. Most have several keys, whose
  `listen` is a `switch` on the key.

What the sessions found awkward, beside the `as const` of a `HashSet`:

- **A program's type changes when it gains a subscription**, as when it gains a command: `key` is one of its types.
  A helper of a test that took `Program<{ … }>` had to take the key too (five helpers of `run.test.ts`).
- **The channel is no longer written beside the condition that lists its key.** They are two fields, as a command and
  its interpreter are.
- **An engine that listens to nothing** is given a `listen` that is never called. It is `Engine.make`, which only the
  tests of the engine call.
- **The search lost a case.** The row of `src/interleaving.test.ts` made its subscription from its id and its session,
  under one key for every session, and told a message of an earlier session by what it carried. Those are in the key
  now, so each session has a key of its own. A message of an earlier start of the same key is still dropped, and
  `core.test.ts` holds it, but the search meets it only through a subscription that sends nothing. A step that takes
  this form writes the row anew.

## What it costs a user

Every program with a subscription changes: a type for its keys, `key` among its types, `subscriptions` that lists
keys, and `listen`. So does every test that reads `subscriptions(state)`, and every key of a child that a test gives
`hear`. The exported types `Subscriptions` and `HostProps` change their parameters. `Listen`, `Listener` and `KeyOf`
are added.

In the guide, promises change, so it is a breaking change of the specification too:

- "Subscriptions": `subscriptions` returns keys, and `listen` makes a subscription. "A subscription sees the state
  only through its key" is kept by construction. "A value that stays the same while the key is kept can stay out of
  the key", and "A new subscription that `subscriptions` returns under the kept key is not used", go.
- "Guarantees": "Whatever a subscription depends on is in its key" leaves "What is left to you". "A key listed twice
  is listed once" is a new rule.
- "Composition": the shape of a child's key, and one defect less under "What is a defect".
- "Running": a defect of `listen` is in `'subscription'`, with its key.

## Not run

- `bun run inference` with `exactOptionalPropertyTypes` or `noUncheckedIndexedAccess` off: nine of its twelve
  configurations.
- `bun run smoke`, `bun run api`, `bun run comments`, `bun run lint`: the spike changed no doc comment, no guide page
  and no declaration report, and was not formatted.
- `bun run mutations`: the mutations of the code that changed no longer find their text.
- The bridge to snabbdom needed no change. Nothing was run in a browser.

## For the owner

1. **Whether to take the form.** Advised: take it. It moves a rule from the reader to the compiler, makes a key what a
   command is, and takes a defect and a cost out of a parent. Its price is a breaking change for every program that
   listens, a type that each of them names, and the two inferences above, neither of a program of `make`.
2. **The list: an array, or a `HashSet`.** Advised: an array, with the rule that a key listed twice is listed once.
3. **The names: `listen` and `key`**, or `runSubscription`.
4. **The key among a program's types, or known to `make` alone.** The spike named it, as `command` is named: it gives
   `KeyOf`, a parent's keys typed, and a `listen` checked against every key. Known to `make` alone, as `K` is today, a
   program's type would not change when it gains a subscription. Advised: named. The other was reasoned, not run.
5. **Whether `hear` and `hearNext` take a key of the program's type.** Run as a probe, and taken back: 14 errors, all
   in `rehearse.test.ts`. Eleven are a `Rehearsal<…>` written by hand, which would name the key; two are tests that
   give a wrong key on purpose. A wrong key already fails the test, with "nothing listens under". Advised: leave
   `unknown`, since the check would only move an error that exists (`AGENTS.md`, "What belongs here").
6. **What a defect carries of a key.** A key now holds all that its subscription needs, and reaches a `ProgramDefect`
   and an `Origin` whole, where a message is named by its tags alone. Advised: leave it whole, for the reasons of the
   entry on `describeKey`, and say in the guide that what must stay private goes in a service, not in a key.
7. **Where the step goes.** Advised: before step 18, which writes anew what starts and stops a subscription, so that
   it is written once. For Opus 5.5, `high`: it changes the engine and the API
   ([`change-engine`](../../.agents/skills/change-engine/SKILL.md),
   [`change-api`](../../.agents/skills/change-api/SKILL.md)), written anew from `main` with the array branch as a
   guide, its tests among them.

## Decided

By the owner, on 23 November 2026, each point as advised:

1. The form is taken.
2. The keys are listed in an array, and a key listed twice is listed once.
3. The function is `listen`, and the type of the keys is `key`.
4. The key is among a program's types, as `command` is.
5. `hear` and `hearNext` take a key typed `unknown`, as today.
6. A defect carries its key whole, and the guide says that what must stay private goes in a service.
7. It is written as step 38 of [`ROADMAP.md`](../../ROADMAP.md), before step 18, by Opus 5.5, `high`.

What was weighed beside each and not taken is in [`rejected.md`](../rejected.md), "A subscription made from its key
alone, in other forms".

## What was written

As step 38, each point as decided, and otherwise as the array branch has it, but for these:

- **The timer's key is a string**, `'ticks'`, as "What a key is" allows for a subscription that needs nothing: the
  first subscription of the tutorial costs a line, not five.
- **The search's row keeps the session in its key.** A key of a row that came back the same would need its ticks to
  name their start, which only a count kept outside the program could, and a start interrupted before it runs would
  put that count out of step. The case moved to the list's search instead, whose key comes back whenever the field
  holds the same text again: the search now sends three messages that name its start, and a property checks that one
  of an earlier start of a key that came back never reaches `update`. It fails, on 2000 scenarios, with the drop of a
  message by its key in place of its start.
- **A child with keys and no `listen`**, which only a cast lets in, is a `CompositionDefect` as its subscription
  starts, with a test and a mutation, as a child with commands and no `runCommand` is.
- **Where `listen` runs is described, not promised**, as where `runCommand` runs is ("Running", "When a defect
  happens"). That a key is shown whole is promised, and a secret kept out of a key is listed in "What is left to you".
- **The premise that `Channel.map` and `Channel.mapDone` make a channel that runs afresh each time** is dropped, with
  its test: a parent no longer caches a child's lifted subscription, but makes one for each start.
- **The inference lost** in `start({ ...typed, update: (message) => … })` was weighed as a form that repeats another,
  and the guide says nothing of it; step 16 of the roadmap checks it in the matrix.
