# Children that the library keeps

**Status:** proposed, 22 November 2026, at commit `15b9b87`, by a session of Fable 5.2 that the owner asked how the
relation of a parent and its children should be set right, with a free hand over the invariants, the guarantees and the
premises. The owner took the direction the same day, to be spiked: step 33 of [`ROADMAP.md`](../../ROADMAP.md), which
closes its step 32 and takes in its step 31. Nothing of the library, of the guide or of the examples was changed.
Everything below is reasoned from the code and the documents read, and not run, but where it says **run**.

## What the owner asked

Step 32 of the roadmap weighed a child that its parent starts again, whose new instance gets the answer of the one
before. Its first form changed the guide alone, and its second was partial. The owner refused a fix by the guide alone,
and asked for the problem to be decided and fixed before the rest. The owner also asked whether a third channel
between a parent and its children, a value of the child's that its parent reads, belongs to a later step, or must be
discussed now so that nothing is written twice. With the questions came the second opinion that step 32 came from, as
the owner reported it: a parent that cannot read its child is a wall where an interface was meant, and the library
keeps by written rule much of what it could keep by structure.

What one application uses decides nothing ([`AGENTS.md`](../../AGENTS.md)). Each point below is weighed on the
library's own code and examples.

## The probe, run

The probe of step 32 called the `update` of a composed program. It was written again and run with `start` (**run**,
Bun 1.4.5, Windows): a throwaway file under `examples/form/`, deleted after.

- The parent keeps `examples/form` as it is at an optional place, `Optic.id<State>().key("maybeForm")` composed with
  `Optic.some()`. Its own messages are `Opened`, which puts `children.Form.init.state` there, and `Closed`, which puts
  `Opt.none()`.
- The run was forked with a `Storage` whose `save` waits for a `Deferred`. The probe dispatched `Opened`, a write of a
  name and `SaveClicked`, waited until the save had begun, dispatched what follows, and let the save end.
- **Closed, and not opened again.** The run goes on. `onIgnored` hears `{ _tag: 'Form', message: SaveSucceeded }`, of
  origin `Command`: the answer is rejected, as "Where a child lives" says.
- **Closed, then opened again.** The run dies of a `ProgramDefect`, "A defect in update on Form › SaveSucceeded", whose
  cause is the form's `InvariantDefect`, "A save completed while nothing was saving".

Neither program has a bug by the guide. The form calls `defect` where "Structuring a program" says to. The parent
starts a child with `children.Form.init`, as "Composition" says to. Read in `src/compose.ts`: `runCommand` wraps the
answer of a child's command with the child's name and id alone (`wrapMessage(place)`), and `updateAt` gives it to
whatever state `get` finds there.

## One cause

Today a child is a program whose state its parent stores. The parent chooses the shape and the place, writes `get` and
`set`, wires the child's start, and lists the children that listen. The child owns what its state means, and the parent
owns where it is kept. Each rule that nothing checks is a rule that stops the keeper from acting as the owner:

| The rule, left to the user                                              | Why it exists                              |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| A `set` changes its place, and nothing else (step 29)                   | The parent writes the `set`                |
| A parent never reads a child's state to decide (step 31)                | The parent holds it, under a type it reads |
| Start a child with `children.X.init`, and use its state and commands    | The parent wires the start by hand         |
| List in `subscribed` every row that must listen                         | The library does not know which rows exist |
| Use ids that are never reused, or say in the answer which row it is for | An instance has no name                    |
| Nothing but a child's own `update` replaces its state (step 32)         | The parent can put another state there     |

The first five are in the guide ("Composition", "Structuring a program", and "Guarantees", "What is left to you"). The
sixth is the one that step 32 found missing. [`rejected.md`](../rejected.md) says the same of the seventh and the
eighth review of the inputs ("Whoever steps replaces what is below"): they "patch the split of ownership rather than
remove it". The owner then judged the complexity of parents and children too much, and asked for another way.

## No form lies between a rule and a store of the library's

The composed `update` decides from the message and the state alone. To tell two instances at one place apart, the
answer must carry a name of the instance, and the state must hold that name at the place. The name must differ between
an instance and the next one, also when the place was empty between them. So something must count across the gap, and
what counts is state. Either the parent keeps it, which is the recipe of a generation and a rule of the guide. Or the
library keeps it, and then the library owns a part of the state. [`registers.md`](registers.md) reached the same end
for the inputs ("Whoever steps replaces what is below", "The proposal": an instance across a gap is named only by state
that the parent holds).

Two ways around it were weighed, and neither stands:

- **A name by the identity of an object**, made as the child starts. Messages would no longer be data: a state brought
  back by `init: { state }`, or a list of messages given to `applyAll`, would not match. The library uses identity only
  for what it may compute again (`registers.md`, "The channel of a replacement, declared", on the `WeakMap`).
- **A counter under a hidden symbol of the parent's state**, set by the composed `update` after each step. A state
  built anew, and not spread, loses it in silence. It is of the family that the owner refused with the seventh review.

So to refuse a fix by the guide alone is to decide who keeps a child's state. Steps 29 (for a child's place), 31 and 32,
and the third channel, are one question asked four times.

## The proposal

One idea: **a parent's state says which children exist, as it says which subscriptions run, and the library keeps
them.** It keeps them in the state of the composed program, not in the run. The names below are placeholders.

1. **A child is declared from the parent's own state.** A child alone is there in the states where a function of the
   parent's state gives its flags, `flags: (state) => Opt.Option<Flags>`. A child without flags is always there, or
   there where a predicate holds. Children by id are listed with their ids, `ids: (state) => Iterable<Id>`, or with
   their ids and flags. No `at`, `get` or `set` is written for a child.
2. **The library reconciles, inside `update`.** After each step of the parent's own code (its `update`, its `external`,
   a handler of `onEvent`, its `init`), the composed program starts each child that the new state lists and the old one
   did not, with its first commands lifted, and drops each child that is no longer listed. Flags are a key, compared
   with `Equal`: other flags, another child. A restart is a change of key.
3. **The state of the composed program is the parent's own state and what the library keeps.** The parent's functions
   take the parent's own state alone. The whole state is still one value, the fold of `update` over the messages: the
   engine and the testing tools take it as they take any state, and `make` gives a program like any other.
4. **An instance has a number.** The library counts the starts, in the part of the state it keeps. The number is in
   each lifted command, so in its answer, and in each lifted subscription key. An answer for an instance that is not
   there is rejected. A message of a child's view names the place alone, as today: `update` judges it in any state.
5. **What a parent tells a child is data of its step**, beside its commands and its events:
   `{ state, tell: [{ _tag: 'Page', message }] }`. The library gives each to the child's `external` once the step is
   reconciled, in order, each to its end (its events handled) before the next. The parent's `update` is then a function
   of its message and its own state, as any program's.
6. **`subscribed` becomes optional**: a function of the parent's state that says which of the children that are there
   listen. Without it, all of them do.

`pages`, in that form:

```ts
type State = Readonly<{ about: Opt.Option<About.Flags> }>

export const app = make({
  init: { state: { about: Opt.none() } },
  children: {
    // Always there. Hidden under About, it keeps its state and stops ticking.
    Clock: child(Clock.clock, { listening: (state) => Opt.isNone(state.about) }),
    // There while the state gives its flags, and started from them.
    About: child(About.about, { flags: (state) => state.about })
  },
  onEvent: {
    Clock: (event) => (state) =>
      Opt.isSome(state.about) ? { state } : { state: { about: Opt.some({ openedAt: event.at }) } },
    About: () => () => ({ state: { about: Opt.none() } })
  },
  makeModel: (state, children) => ({
    page: Opt.isNone(state.about)
      ? { _tag: "Clock" as const, model: children.Clock() }
      : { _tag: "About" as const, model: children.About() }
  })
})
```

And `list`, whose own state is the ids and their order:

```ts
type State = Readonly<{ nextId: number; ids: ReadonlyArray<number> }>

export const list = make({
  init: { state: { nextId: 1, ids: [] } },
  children: { Stopwatch: childById(Stopwatch.stopwatch, { ids: (state) => state.ids }) },
  update: (message) => (state) => {
    switch (message._tag) {
      case "AddClicked":
        return { state: { nextId: state.nextId + 1, ids: [...state.ids, state.nextId] } }
      case "StopAllClicked":
        return Arr.isReadonlyArrayEmpty(state.ids)
          ? reject
          : { state, tell: Arr.map(state.ids, (id) => ({ _tag: "Stopwatch", id, message: { _tag: "Halted" } })) }
    }
  },
  onEvent: {
    Stopwatch: (id) => (state) => ({ state: { ...state, ids: Arr.filter(state.ids, (other) => other !== id) } })
  },
  makeModel: (state, children) => ({
    stopwatches: Arr.map(state.ids, (id) => ({ id, model: children.Stopwatch(id) }))
  })
})
```

### What it closes

Each row of the table above, by construction and not by a check:

- **No `set` of a child exists**, so none can do more than its place. The rule stays for an input's place alone.
- **A parent cannot read or write a child's state**: it is not given it. No opaque type is needed, so none of the four
  conditions of `AGENTS.md` for a type that only prints is asked.
- **A child's first commands cannot be left behind**: the library starts it.
- **No row can be left out of the listening by mistake**: the library knows which rows exist. The defect of an id
  listed twice goes with it.
- **An answer reaches the instance that asked for it, or is rejected.** Ids may be reused.
- **Nothing but a child's own `update` and `external` changes its state while it lives.** So "a completion outside the
  state that only its completion leaves is a `defect`" holds under any parent, with no third condition.

It also removes the hardest cache of `compose.ts`: the lifted subscriptions kept by the child's state object, with the
places it held in the last call, in their order (`Kept`, `liftedAt`). They would be kept with the instance.

### Against the entry of `rejected.md`, and the note of step 32

"Children declared apart from the parent's own state" was refused on 17 November 2026, reasoned and not spiked, and
step 32 advised against it again. Each reason, against this form:

- **"A second record of the same list, which can disagree."** The ids are derived from the parent's state and
  reconciled after each of its steps. Step 32 says so too.
- **"Birth and removal would need a part of a step of their own, a third way."** They are no channel: they follow from
  the parent's state, as the start and the stop of a subscription do.
- **"`init: { state }`, `applyAll` and the testing tools take whole states."** They still do: the whole state holds
  what the library keeps. Its shape is the library's, and a test must be able to write it: a cost, below.
- **"What it saves is the `at` of each child, one line."** It now saves the six rules. The entry's own "Reopen if" asks
  for a cost of more than that line: steps 29, 31 and 32 are that cost, counted in the library itself.
- **"The state would no longer be the fold of `update`", and "`make` would no longer give a program like any other"**
  (step 32). True of children whose states the run keeps. Here the composed `update` reconciles, and the run knows
  nothing of children.

## A value that a parent reads

The roadmap had no step for it. Step 31 went the other way, and three entries of `rejected.md` of 16 November 2026
refuse its neighbours ("A parent that reads its children's inputs", "A parent's `update` given its children's models",
"A write into a child's input that raises an event"), each to be reopened by "a value the parent must read" that
"cannot be an input of its own".

It must be decided with the store, for two reasons. Today the rule is advice, and a function that the child's module
exports can break it honestly. Once the library keeps the children, the wall is whole: what a parent cannot be told by
an event, it cannot know. And where the parent's functions take what they read decides whether a read can be added
later without writing them again.

The case for it, on the library's own terms:

- **A child can tell its parent a moment, and not a condition.** An event says that something happened. A condition
  that holds over time ("some stopwatch runs") must then be copied into the parent's state at each change, which is
  derived data in a state ("Structuring a program", "No derived data in the state").
- **`examples/list` pays for it.** Its model offers "Stop all" whenever the list is not empty, also when no stopwatch
  runs, and its comment says why: "Every stopwatch is told, running or not: the parent never reads a child's state to
  decide." That is a control that does nothing, against "Show less than `update` accepts, never more". Read in the
  code, and not run.
- **A read desynchronises nothing.** It is a pure function of the one state.

The form to spike: a program may declare `output`, a function of its state, as it declares `external`. A parent reads
`children.Stopwatch.output(id)` where it reads its children's models, and in its `update`. It is not the model: a model
is for a view, and "A parent's `update` given its children's models" stays refused. Its costs: one more piece of a
program; a parent's test must put a child in a state that gives the output; and the parent's `update` takes a second
argument beside its state.

## What was not taken from the second opinion

- **Handlers of `update` by the case of the state.** As step 32 weighed it: `update` stays one function that a test
  calls with any message in any state. What it was for, an answer given only to whoever asked, the number of an
  instance gives between programs. Inside one program, the state machine holds it once nothing else replaces the
  state.
- **Regions of one program that read each other.** It is the page that "Any time" lists, of a program too large for
  one module that is not split into children. It does not wait for this.
- **A message with a value that the element gives.** It is in step 9, with the parked "What reaches `update`, declared
  as data".

## Weighed beside it, and set aside

- **The guide alone, and the run that drops an answer** (step 32, forms 1 and 2). The first leaves the six rules, and
  adds a seventh. The second makes the engine know of children, and does not hold for a child that one step replaces.
  They are weighed again only if the spike falls.
- **A child's state under a type of the library's, at a place of the parent's state**, with a mark that the place keeps
  when the child leaves, and a container of the library's for children by id. It keeps `at` and the handles as
  functions. But the start and the end of a child stay calls that the parent must make, and a list has two records
  again, the parent's order and the library's container, which can disagree. And the types need the tricks of how they
  print.

## Against, by the session itself

- **It breaks the central API.** Every parent is written again, and `compose.ts` with its tests, its mutations and the
  inference matrix, the pages "Composition" and "Events and external messages", the tutorial's third and fourth steps,
  and the skill.
- **A test builds a composed state another way.** Its shape is the library's. A test folds from `init` with
  `applyAll`, or `./testing` gives a way to write one. A state written by hand may list a child and hold no state for
  it.
- **The number of an instance is in the data.** A test that writes a lifted command or a lifted key by hand writes the
  number too. "A test reads a child's subscriptions by key" changes.
- **The order changes.** What a step tells its children arrives after the step. Today a parent may tell a child and
  then take a step of its own on the state that the child's events left.
- **A parent can no longer copy a child's state, nor put an old one back.** An undo by snapshot above a child is gone:
  a child that comes back starts again. `registers.md` called that undo legitimate.
- **Flags stay in the parent's state** while the child lives, and each step of the parent's own costs a comparison for
  each child.
- **A flag that changes restarts the child**, which a user may not expect of a value that only looked like a start.
- **Nothing of it was run.** The form was reasoned in one session, on five examples read.

## What the spike must find

For the store:

- the shape of the composed state, what `StateOf` gives and prints, and how a test writes one;
- whether flags are the key, and what a child without flags that must start again is given;
- where the number of an instance is counted, so that a long list leaves nothing behind, and how it reads in a lifted
  command, in a lifted key and in a test;
- `tell` as data: its type, its order with `onEvent`, a message to a child that the step removed, and what becomes of
  `andThen` and `forEach`;
- what a child's model is where the child is not there: an `Option`, or a defect as today;
- what the reconciliation costs a step of the parent's own, at 10, 1000 and 10000 children by id;
- the types, with each form of the inference matrix, and `inDialog` of "Composition";
- `pages`, `list`, `timers`, `named-timers` and `named` in the new form, and their tests;
- each premise it would rest on (`docs/premises.md`), as that `Equal` compares the flags that a user writes.

For `output`: its name, where a parent reads it, what the types refuse, and `list` with a "Stop all" that is there only
while a stopwatch runs.

## What becomes of the steps

- **Step 32** is closed by this record and the owner's decision. Its two forms are kept above in short, and in full in
  `ROADMAP.md` at `15b9b87`.
- **Step 31** is taken in: a state that a parent is not given needs no type to hide it. If the store is not taken, it
  comes back as it was written at `15b9b87`.
- **Step 29** stays, for the place of an input alone if the store is taken.
- **Steps 30, 9 and 16** are weighed after step 33: each changes or checks `compose.ts`.
