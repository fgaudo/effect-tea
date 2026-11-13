# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

### Found by the sixth review of the premises (November 2026)

Each is held by a `test.failing` case named after what should hold; its fix removes the mark and the item. The
reports are the bodies of the commits of `claude/premise-review-6-engine-8ac990` (`ec3fe8c`, `d08d9d7`) and of
`claude/premise-review-6-testing-d70db0` (`463159c`, `e4f4687`).

- **An interruption the program makes with the fiber id of the one its effect received ends in silence**:
  `Core.otherwiseDefect` takes an interruption for the run's by the id of the fiber that made it, an id the program
  can make too. By key, a gone subscription is stopped by `FiberMap.remove`, as the fiber -1, as every `FiberMap`,
  `FiberSet` and `FiberHandle` of the program's interrupts; at the end of the run, the renderer, the commands and the
  subscriptions are interrupted as the fiber the run is in, which may have interrupted a fiber before. The form: an
  identity taken for the run's that the program can make too; `Fiber.interrupt` in place of `FiberMap.remove` only
  moves the first sequence into the second. `run.test.ts`, "a subscription that joins a fiber its own FiberMap
  interrupted, as the run stops it, is a defect in the subscription", the same of `FiberSet` and of `FiberHandle`,
  and "a command that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the command",
  the same of a renderer and of a subscription.
- **A defect of `makeModel` that the scenario catches fails `rehearse` and not `drive`**, where the README says a
  defect of the program fails each tool as it ends the run: in `drive` the scenario reads the model, and the run
  does not die of it. To be decided which of the two is right. `contract.test.ts`, "drive fails in render all the
  same, as rehearse does".

Conditions the review took out with every test still passing, each to get a test and, where it is a check, a
mutation:

- **The engine's own end** (`engine.ts`, the finalizer of `make`, the fix of f415d46): with nothing after `stop`,
  `bun run test` and the search pass. What it still gives is read only: the fibers interrupted as the run's fiber,
  and the commands and the subscriptions together.
- **The end of `rehearse`**: that it interrupts the loop, shuts the queue (and that a refused `submit` interrupts the
  call), interrupts what was offered and not delivered, and stops the opened starts itself; that a step fails on a
  defect of the release it awaited; that the shell makes `Ledger.leave` as a call ends; that a message of `hearNext`
  the loop dropped fails the call.
- **Smaller ones**: the first of the two checks of an own key in `compose.ts`, which the second hides; the run's
  queue unbounded, killed only by a test that hangs; `debugging` before the log of a dropped message;
  `dispatchViolations` on a second send that only raises an event; `simulate`'s `diesIn('command')` outside
  `Effect.scoped`. "a key that goes away interrupts its subscription, which releases what it holds"
  (`engine.test.ts`) passes with a gone key that keeps running: two other tests hold the condition.
- **A lead no test reaches yet**: the loop forked and not yet known to `stop`, under "Premises that no test reaches
  yet" in `docs/premises.md`.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A report of the public API**, generated from the declarations of `dist/` and committed, so that a change of
  what `src/index.ts` and `src/testing/index.ts` export shows in the diff, and a breaking one is not made by
  accident (as api-extractor does), with a check that the package's types resolve for each kind of consumer.
  `change-api` asks for this by hand today.

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
