# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **`onApplied` and `onIgnored` hold the loop.** It is documented ("it should be quick"), but a slow devtools slows
  the whole program, and nothing shows how to hand the work off (a queue of its own, a forked fiber).
- **The order of a step's commands is not stated.** They run concurrently in the run's `FiberSet`, with no bound,
  so their answers may arrive in any order. The README does not say so. Commands that answer at once are heard in
  the order they started, as `rehearse`'s `runAll` hears them, but `simulate` applies each answer, and runs the
  commands it starts, before the next command of the same step: it hears `A, C, B` where the run hears `A, B, C`,
  and its "as if each command completed at once" is not what the run does. `simulate` could keep its pending
  commands in order, as `rehearse` does (a change its users notice), or say what it does instead.
  `src/testing/contract.test.ts`: "simulate hears the answers of commands started together as the run does".
- **`rehearse` and `simulate` never read `subscriptions`.** The run reads it after every change of state, and dies
  when it throws, as a parent's does on an id that `subscribed` lists twice, or an own key equal to a lifted one.
  A scenario through such a state passes in both tools. They could read it after each change of state, which a
  parent's cache of lifted subscriptions keeps cheap. `src/testing/contract.test.ts`: "rehearse fails, as the run
  dies, on a state whose subscriptions are a defect", and its twin for `simulate`.
- **A command that interrupts itself is a defect in the run, an interruption of the test in `rehearse` and
  `simulate`**, which run it as it is, not through `diesIn`. The test fails either way, but with no defect that
  says where; a command that fails without a defect, which its type rules out, is the same.
  `src/testing/contract.test.ts`: "simulate fails with a defect, as the run dies, on a command interrupting
  itself", and its twin for `rehearse`.
- **Premises that no test reaches yet**, found in a review of the engine's premises (November 2026):
  - that a dispatch wakes the loop on the scheduler of the run, read only in Effect's source (a `Queue` keeps the
    scheduler of the fiber that made it);
  - that `hearNext` stops a subscription with a failure, where the run interrupts it: a release that reads its
    exit sees another one;
  - that a `Logger` never throws in the loop's debug logs: the loop is not under `diesIn`, so its defect would be
    no `ProgramDefect`.
  `hear` accepts a key whose subscription the run would have seen end, since an ended subscription keeps its key:
  no tool can know it.
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
