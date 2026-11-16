# Exploring a program from `init`

**Status:** rejected by the owner, 14 November 2026, the day it was proposed, as neither practicable nor useful; why,
and what would reopen it, is in [`rejected.md`](rejected.md), "The testing tools". Nothing of it is done. It records
one spike (Fable 5.2), on Effect 4.1.4, Bun 1.4.4 and Node 24.14.1, kept on the branch `spike/explore` (commit
`5476871`, cut from `7403044`, never to be merged). Rewritten the same day for the contract of the model
([`boundary.md`](boundary.md), item 1): the spike was written before it, and **asked a view, through snabbdom's
bridge, what each state offers**; today a test reads that from the model. Its measures and findings are what it
ran, with the bridge, and were not run again. What changes with the contract was read, at `1d0ccc9`, and is marked.
The first version is `docs/exploration.md` on `claude/explore-spike-a9de80`.

## Context

A test checks a program in the states a generator written by hand invents (guide, "Testing", step 1). Nothing says
they are the states the program reaches. [`declared-inputs.md`](declared-inputs.md) proposed, as the last of its
points, a tool that explores a program from `init`, after every message a program offers had become data. That
redesign is suspended. The question of this spike is the other way round: **can a tool explore a program from
`init`, to a bound, by what each state offers, on the API as it is, and what stands in its way?**

## What was built

`explore(program, options)`, in `src/testing/explore.ts` of the spike, not exported. A plain function, as `applyAll`
and `dispatchViolations` are: no `Effect`, nothing run. It calls `update` and `subscriptions` alone, through the core
the run shares (`Core.init`, `Core.arrive`, `Core.reconcile`).

```ts
explore(form, {
  depth: 1000,                                    // never optional
  states: 100_000,                                // never optional
  sent: (state) => texts.flatMap((text) => messagesOf(form.makeModel(state), text)),
  heard: (key, state) => [],                      // what the subscription of a key may send
  answers: (command) => [                         // what a command may answer; Opt.none() for no answer
    Opt.some(Message.SaveSucceeded({ name: command.name })),
    Opt.some(Message.SaveFailed({ name: command.name })),
  ],
  within: ({ saved }) => saved.length <= 2,       // the states the test means to walk
  candidates, repeatable, withheld,               // given to dispatchViolations as they are
  inert: (message) => message._tag === 'NameChanged',
  property: (state, pending) => { /* throws where a state reached is wrong */ },
})
```

`sent` is written here as a test would write it today, with the reader of `examples/form/form.test.ts`. The spike
had `messagesSentBy(view, form.makeModel(state), text)` there. The option is the same function of the state.

- **A node is a state beside the commands under way**, a bag of those a step started that have not answered. The
  walk is breadth first from `init`. In each node every message that can reach `update` there is applied: what
  `sent` gives, what each key of the state sends, each answer of each command under way.
- **Each node is checked**: `update` answers each message offered with a step or a rejection and never throws;
  `dispatchViolations` on what `sent` gives; the property of the test.
- **It returns data**: the nodes reached, the path to each, how many arrivals each bound left out, whether the walk
  is `closed` (nothing left out by `depth` or `states`), and the findings, each in the state nearest to `init`
  that shows it.

| Finding | What it is |
| --- | --- |
| `Defect` | code of the program threw: `update` on a message offered, or `subscriptions` on a state reached |
| `Outdated` | a message offered in one state makes `update` throw in a state reached from it: a tap on an older frame |
| `Dispatch` | a violation of `dispatchViolations` (`Rejected`, `ActsTwice`, `Missing`) |
| `Inert` | a message offered, or a key's, whose step does nothing, by the rule of [`inert-steps.md`](inert-steps.md) |
| `Rejected` | a message a key of the state sends, which `update` rejects there |
| `Ignored` | an answer of a command under way, which `update` rejects there |
| `Stuck` | nothing the state offers leads to another node |
| `Property` | the property of the test threw |

## What the spike ran

With snabbdom's bridge for `sent`, on the examples as they were at `7403044`.

| Walk | Nodes | States | Arrivals | Deepest | Closed | Time |
| --- | --- | --- | --- | --- | --- | --- |
| `counter`, depth 50 | 51 | 51 | 101 | 50 | no | 6 ms |
| `counter`, count at most 1,000 | 1,001 | 1,001 | 2,001 | 1,000 | yes | 22 ms |
| `form`, depth 12 | 27 | 27 | 85 | 12 | no | 4 ms |
| `form`, at most two names saved, three texts typed | 21 | 21 | 66 | 10 | yes | 2 ms |
| `timer`, depth 30 | 1,771 | 1,771 | 4,481 | 30 | no | 50 ms |
| `timer`, from one minute, at most two | 364 | 364 | 907 | 122 | yes | 10 ms |
| `timer`, from `init`, at most its twenty-five minutes | 39,050 | 39,050 | 97,599 | 1,501 | yes | 0.9 s |
| `timers`, two ever added, three seconds into each | 240 | 240 | 1,790 | 11 | yes | 27 ms |
| `list`, three ever added, at most two seconds each | 400 | 400 | 3,230 | 13 | yes | 77 ms |
| `list`, four ever added, at most three seconds each | 7,381 | 7,381 | 78,322 | 21 | yes | 1.2 s |
| `pages`, depth 8 | 45 | 12 | 143 | 8 | no | 8 ms |
| `pages`, at most two commands under way | 27 | 12 | 81 | 5 | yes | 3 ms |

- **None of the five ends without a bound**: a number that grows (`counter`, `timer`), a list that grows (`form`),
  ids never reused and seconds counted (`list`, `timers`), commands under way that nothing makes answer (`pages`).
- **What bounds a walk honestly is a predicate of the test, `within`.** A walk within it is closed: everything
  offered leads to a state reached or to one the test left out, which is counted. `depth` and `states` are the net
  under it, and a walk they cut says so.
- **A product of children is what costs.** One timer of twenty-five minutes is 39,050 states; two would be the
  square.
- **Drawing the view was about a third of the time**: `timer`, 0.75 s with the bridge, 0.55 s with the messages
  read from the model by hand. The second is what a test would do today.
- **States are told apart by `Equal` and `Hash`**, in a `MutableHashMap`. A state that holds a function is equal
  only to itself, and no walk of it would close; no example's does. The keys of a state are not part of a node.

What it found on the examples:

| Found | Where | Real? |
| --- | --- | --- |
| `Inert`: `StopAllClicked` | `list`, 85 of 400 nodes, from `init` itself | real where the list is empty; known (`inert-steps.md`, "Open questions") |
| `Inert`: `NameChanged` with the text the field has | `form`, 6 of 21 nodes for each text | a false alarm: it depends on the value. One line of `inert` |
| `Inert`: a tick with the time the clock shows | `pages`, 3 of 27 nodes for each time | a false alarm of the sample |
| `Ignored`: `SayingPicked` | `pages`, after About was asked for and left | real, and meant; no test of the example shows it |
| `Property`: a saying shown while a command is still to answer | `pages`, with a property written for it | real, and small: the saying of an About that left is shown by the next one. The guide's "ids that come back" |

- **No example had a `Defect`, an `Outdated`, a `Stuck`, a key `Rejected` or a violation of `dispatchViolations`.**
  The `defect`s of `form`, `timer` and `stopwatch` are never reached, with no pair to skip by hand.
- **Each kind of finding is found where it exists**, on programs written for it (22 tests).
- **It does not reach a state only a message from an older frame leads to.** `form` stores a key typed just before
  the save disabled the input, and tests that state; the walk never gets there. Nor a subscription that has ended,
  values beyond the samples, or what lies past `within`. So a generator's states are no subset of the walk's, nor
  the other way.

## The obstacles, weighed again

The spike asked of four things whether they stand in the walk's way. Read again under the contract of the model:

- **A view needed to know what a state offers: gone.** The spike said "no obstacle where there is a bridge, and no
  way round it where there is none", and that listing a model's messages field by field "is the view written
  again". That listing is now the reader every example's test has, 1 to 12 lines, and the contract the guide
  states. The walk needs no bridge, no renderer and no preload, and is a third faster for it. What it no longer
  does is check the real view: nothing of the library does (guide, "Testing").
- **A model's functions for an input: no obstacle, as before.** The walk compares states, never models; the reader
  calls `changeName` with the texts the test gives. `Inert` still cannot tell an input's message from a button's,
  and the reader, where the text is given, is where a test can tell them. The spike's other remedy, a bridge that
  says which handler is an input's, is overtaken: a bridge owes nothing.
- **What a key sends not being data: unchanged, and what the walk trusts most blindly.** The test writes again what
  each `Channel` sends, and nothing checks it against the stream; a parent's test rebuilds the lifted key and the
  routed message by hand. What it is and what could hold it is in `declared-inputs.md`, "What still makes sense".
- **A command's answers not being data: unchanged, and the least awkward.** The test gives them as it gives
  `simulate` a `runCommand` of its own.

**So no declaration has to become data for the walk to work**, as the spike concluded, and now no view either. What
stands in its way is what stood before, and none of it is what a program declares: domains without a bound, the
product of children, and messages from older frames.

A walk returns the states it reached, which a test can give to `dispatchViolations`, to a property, or to
fast-check in place of a generator. The generator is still needed for what the walk does not reach.

## What it rests on

Run, on the spike, with the bridge:

- **That `Equal` and `Hash` tell states apart by value** (plain and nested objects, arrays, `Data`, `Option`,
  `HashMap`, `DateTime`), and that a state holding a function is equal only to itself: 31 tests.
- **That the walk does what "What was built" says**: 22 tests; 24 checks taken out by hand, each killed.
- **The measures and the findings**: 15 tests, one run for the times.
- **The checks**: `typecheck`, `lint`, `test` (606), `test:node` (530), `interleavings` (14). Not run: `mutations`,
  `smoke`, the site.

Read, not run:

- **That the walk gives the same with a reader as with the bridge.** `sent` is a function of the state in both, and
  item 1 of `boundary.md` found each example's reader to return what `messagesSentBy` returns from its view. The
  spike's own measure of `timer` without the bridge is the one thing run this way.
- **That the examples have not changed in what the walk reads** since `7403044`: by `git diff --stat`, items 1 to
  5 changed their tests, the bridges and `field.ts`, and no program nor view.
- That `effect/Equal`, `effect/Hash` and `effect/MutableHashMap` are stable at 4.1.4; that `update` and
  `subscriptions` are pure; that the false alarms are false.

Not established: that a walk ends, within a bound a test would accept, on a program larger than the examples, and
what it finds there.

## Open questions

- **Whether to build it.** It can be built on the API as it is, beside the other tools, with no change of a program
  and now with no bridge. It is not shown to be worth a place: on the examples it found one control already known,
  two behaviours that are meant, and nothing their tests should have caught. Not measured: what it finds when a bug
  is put into an example.
- **`Inert`.** The walk reports it, and `dispatchViolations` does not have it: it waits for `inert-steps.md`.
- **Messages from older frames.** Whether the walk applies them as arrivals of their own. It is what the run does,
  it reaches the state `form` tests by hand, and it multiplies the arrivals. `Outdated` is the cheap half.
- **What a key sends.** In `declared-inputs.md`.
- **A subscription that ends.** A node would hold the keys that have ended.
- **What `within` is.** Whether ids never reused can be told to the walk as names, so that `[1, 2]` and `[2, 3]`
  are one state: not tried.
- **What a finding fails.** `Ignored` and `Stuck` are often meant: whether a test lists them, as `withheld`, or
  reads them as measures.
- **The names**, and whether `sent`, `heard` and `answers` are asked as `rehearse` asks for `send`, `hear` and
  `run`. `sent` is now what `dispatchViolations` calls the messages a model holds.
- **An application.** It decides nothing of the tool, and says what it is worth.
