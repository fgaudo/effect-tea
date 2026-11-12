# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done or rejected, with the reason in the commit.

## Open problems

- **The changelog's entries are paragraphs**, where a reader looking for what changed would scan a line each.
- **A renderer's defect is lost when the run ends otherwise.** The renderer is the loser of `Effect.raceFirst` in
  `runWith` (`run.ts`), which keeps nothing of its exit: when whoever runs it interrupts the run, or the run dies
  of a defect elsewhere, what the renderer dies of while it is released is not in the cause, where a
  subscription's or a command's is. `run.test.ts`, "the end of the run", holds it with two `test.failing` cases. A
  fix could fork the renderer and add the dies of its exit, as the engine's finalizer does for its fibers.
- **A command or a subscription that dies once the renderer has ended is lost.** When the renderer ends of itself,
  `engine.await` is interrupted at once, and the engine's finalizer runs only as the run's scope closes, seeing the
  fibers still in its `FiberSet` and `FiberMap`: one that dies in between has left them, and its defect fails a
  `join` nobody awaits, so the run succeeds. Interrupted by whoever runs it, the run keeps it ("a command that dies
  once the renderer of an interrupted run has ended…"). `run.test.ts` holds it with two `test.failing` cases. A fix
  could record each die of the engine's fibers in a place of its own, and fail the finalizer with it.
- **`drive` loses a defect of what a subscription releases as the scenario ends.** Its `Effect.raceFirst`
  (`drive.ts`) interrupts the run and discards its exit, where the run interrupted by whoever runs it dies of that
  defect and `rehearse` fails on it; its JSDoc says "a defect of the program fails it". `contract.test.ts` holds it.
  A fix could fork the run, interrupt and await it once the scenario ends, and fail with its dies.
- **`rehearse` cancels a command whose `run` is interrupted, and the scenario passes.** The command leaves
  `pending` before it runs, so interrupting the `run` (a `timeoutOption` around it) closes its scope and drops its
  answer, a history no run makes; the JSDoc promises that a command left without an answer fails the test.
  `rehearse.test.ts` holds it. A fix could keep the command pending until it answers, or fail when its run is
  interrupted.
- **A subscription first heard by a `hearNext` in a fiber that ends dies with that fiber.** `open` forks it as a
  child of the calling fiber (`Effect.forkChild`), so the key stays and the subscription is gone; the README says
  `hearNext` keeps it "as the run does, for as long as the key stays". `rehearse.test.ts` holds it. A fix could fork
  it into a scope the rehearsal owns.
- **A message a `hearNext` takes after its key went away reaches `update`.** Waiting in a fiber of the test's, it
  takes the message from the queue of a start `listen` has already removed; the run drops it by its generation.
  `rehearse.test.ts` holds it. A fix could apply a heard message only while that very start is still open.
- **Two messages that arrive together in `rehearse` lose one when the first stops a subscription.** `apply` reads
  the state, awaits the release of the gone keys, then writes, so a command's answer applied meanwhile is written
  over; the run takes one message at a time. `rehearse.test.ts` holds it. A fix could apply one message at a time.
- **`simulate` and `rehearse` miss a key whose `Equal` throws against a key of the state before**, which the run
  compares in `reconcile` and dies of in `'subscriptions'`. `contract.test.ts` holds it, once for each tool. A fix
  could keep the previous listing and compare with it as `reconcile` does.
- **`rehearse`'s `hearNext` runs the subscription listed at its first call, the run the one listed when its key
  appeared.** It shows only with a subscription that sees the state other than through its key, which the README
  advises against but "What is left to you" does not list. `contract.test.ts` holds it. A fix could take the
  subscription in `listen` when its key appears, or state the rule among what is left to the program.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`bench/subscriptions.ts`) measures a parent's subscriptions only.
- **A scenario of `interleaving.test.ts` that reaches every guarantee**: today its rejected clicks are checked
  only to raise no defect (not to leave the state as it was), its subscriptions never end, its commands never die
  and nothing is released slowly, so "Nothing ends in silence" and the wait for the slowest release are checked
  only by the run's own tests.

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
