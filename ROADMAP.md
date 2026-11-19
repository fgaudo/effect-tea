# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.
An item deferred or suspended leaves too, for "Parked, not rejected" there, with what would reopen it: this list
holds only what is to be done or decided now.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

Found in a review of 18 November 2026, each reproduced:

- **A parent's subscriptions cannot send a child's external messages, though its commands can**: `runCommand` answers
  `Own | ChildExternals<C>`, `subscriptions` only `Own`. Every program can still be written, through an own message
  and `children.<child>.update`, and both are sources of messages the run handles alike. To decide: allow it, or say
  in "Composition" why the two differ.
- **The failure of `drive`'s `patience` carries an `Option` of the model** as its `cause`, not the model: say so where
  the guide describes it, or give the model itself.

Found in a review of the premises, 19 November 2026, each held by a `test.failing` case:

- **Equal defects become one**: two releases in the scope the run gives a command, a subscription or the renderer that
  die with errors equal by `Equal` but distinct (two `Data.TaggedError` with the same fields, two `new Error` with the
  same message) leave one defect. `Effect.scoped` joins the causes with `Cause.combine`, which dedupes by value, before
  the register sees them. A fix where `scopedIn` reads the close's exit itself rests on a new premise, that the exit
  keeps every reason, which needs the owner's consent. Held by `src/run.test.ts`, "releases that die with errors equal
  by Equal".
- **Interruptions taken for the run's**: a fiber of the program that interrupts a command's or a subscription's fiber
  is taken for the run's interruption, since it carries no mark, and the fiber ends in silence: the run goes on,
  `simulate` fails with a bare interruption, and `rehearse` ends interrupted or `hearNext` waits for ever. The same
  holds for the renderer, where the run ends in success, and for the loop interrupted from `onApplied` or `onIgnored`,
  where the run never ends. It is one form, in `diesIn` and `otherwiseDefect`. To decide: whether "Only the run, and
  whoever runs it, interrupt them" ("Guarantees", "Nothing ends in silence") is a promise the code keeps, or a rule
  left to the program. If a promise, a spike first that interrupts whoever runs the program after k steps, as the one
  of "A flag for each fiber" in `docs/rejected.md` did, so that no false defect appears in `init`. Held by
  `src/run.test.ts`, "an interruption made by another fiber of the program", and `src/testing/contract.test.ts`, "a
  command or a subscription that a fiber of the program interrupts".
- **`drive` skips `init`**: it succeeds without calling `init` when its scenario ends before the run's fiber first
  runs, since it forks the run with `Effect.forkChild`, unstarted; `rehearse`, on the same program and scenario, fails
  in `init`. A fix could begin with `startImmediately: true`. Held by `src/testing/contract.test.ts`, "what the run
  dies of, and the tools fail on", the case "drive fails, as rehearse does, in init, on an init that throws, though its
  scenario returns at once".
- **A reused element keeps its input**: an element a bridge reuses for another input keeps the first input's `Shown`,
  in both bridges, since snabbdom and React reuse an unkeyed `<input>` in the same place. A key typed into the first
  input then stays on screen against the second input's value, and the field goes dead. A fix could begin by treating
  an element that shows another input, told by its dispatch, as new to `drawn`; the guide's "Settling an element"
  would need the rule, which is asked of the owner first. Held by `bridges/bridge.test_suite.ts`, "an input in the
  place of another input", with the `steps` views of `bridges/snabbdom.test.ts` and `bridges/react.test.ts`.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `bridges/snabbdom.ts` and `bridges/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
