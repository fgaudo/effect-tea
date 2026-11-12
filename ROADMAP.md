# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **`hear` accepts a key whose subscription the run would have seen end**, since an ended subscription keeps its
  key: no tool can know it.
- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A `CompositionDefect` names the child, not the message**: the one for a rejected external message could carry
  its tags, as `ProgramDefect`'s `on` does.
- **The kinds of test, as a rule of `AGENTS.md`**, after the one of effect-tea-persistent, which has four. Here
  there would be five: the semantics of the pure pieces (`Step`, `andThen`, `forEach`, `reject`, a parent's
  composition, in `compose.test.ts`); invariants under random histories (`interleaving.test.ts`, with
  fast-check); contracts, one program and its inputs given alike to each testing tool and to the run
  (`src/testing/contract.test.ts`), and to each bridge (`messagesSentBy`); the run's boundary: lifecycle, scopes,
  interruption and defects (`run.test.ts`, `engine.test.ts`); and the types, what the compiler refuses
  (`expectTypeOf`, `@ts-expect-error`). A test of no kind is not added, and a bug found is held by a case of one
  of them, with a scenario of its own only where none can hold it. Doing it sorts the tests there are by kind,
  says where each kind lives, and decides of a test that fits none (`log.test.ts`?) whether it names a kind
  missing or moves.
- **A review of the premises, as a rule and a procedure.** The review of November 2026 followed
  effect-tea-persistent's `premise-review` skill, and its rule: a reading of the code alone gives a lead, and a
  finding is reproduced by a test that fails, or ruled out by one that passes or by Effect's documentation in the
  oldest version of the peer range. `AGENTS.md` could state that rule next to "What the invariants rest on", and
  `.agents/skills/` hold the procedure adapted to this project (no notes: the invariants of `AGENTS.md` and the
  README's "Guarantees" are what it reads). A lead no test reaches goes under "Premises that no test reaches
  yet". To decide: when a review is due (after a change of the engine that adds a premise, before 1.0).

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `examples/snabbdom.ts` and `examples/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the README hints at (the view lives in a
  module of its own) without showing.
- **A first frame for server-side rendering** (`renderToString` of the initial model), to be weighed against "a
  function earns its place by doing what Effect alone cannot".
- **What 1.0 needs**: the API looks close to stable; the problems above are the list to close before freezing it.
