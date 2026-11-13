# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

### Found by the seventh review of the premises (November 2026)

Each is held by a `test.failing` case named after what should hold; its fix removes the mark and the item. The
reports are the bodies of the commits of `claude/premise-review-7-engine-a13862` (`5e34644`, `531638b`) and of
`claude/premise-review-7-testing-3485ba` (`5b88849`, `3299b61`).

- **The end of `rehearse` skips the cleanup of a key its interrupted step was stopping**: `Ledger.listened` takes the
  start, and the calls waiting on it, out of the ledger in the step's thunk, and the step stops and tells them after;
  a scenario that fails meanwhile has the end interrupt the step, and `Ledger.opened` no longer holds them. The
  subscription is then left to the close of the scope, unmarked, so a self-interruption of it is lost, and a
  `hearNext` waiting on it in a fiber the scenario does not join waits for ever. The form: a cleanup skipped as a step
  is interrupted; the engine's end, which stops its loop in a step that releases a gone key, is to be checked for it.
  `rehearse.test.ts`, "a subscription that interrupts itself as the end stops it, its key gone, is a defect", "a
  hearNext waiting on a start whose key went away fails, though the scenario failed".

Places where the code or a document says otherwise than the other, from the same reports, each to be settled:

- `core.ts` (the comment on a dropped message) and `engine.ts` (on `describeMessage`) promise that a run that died
  describes no dropped message; a death recorded after the check of `Core.arrive` still lets the step describe one.
- `docs/premises.md` names, for `Effect.forkIn`'s close that waits and for `Effect.raceFirst`'s wait for its loser,
  tests that pass without them since rehearse finishes the step of a scenario that returned.
- `docs/shared-core.md` cites a roadmap item that is gone; `loop.ts` stops the loop with `Fiber.interrupt`, unmarked.
- Comments and names of tests that say more than they check: `run.test.ts`, "a run that died takes no message from
  its queue while the renderer releases", and comments that still describe the run before its marks;
  `contract.test.ts`, the comment on "rehearse fails with the defect alone, as the run dies, though a hearNext
  waited"; `rehearse.test.ts`, "a command that answers while the end releases a subscription fails it, as one under
  way", "a message its subscription sends after its key went away does not reach update".

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
