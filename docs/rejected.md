# What was tried or weighed, and rejected

**Status:** an index, begun 14 November 2026 and kept since. It lists the ideas for the library that were tried or
weighed and rejected, so that a review or a proposal reads them before it proposes one again: on 14 November a
review proposed, as untried, a flag that had been spiked and discarded the day before, because the spike was
recorded nowhere in the repository. Read it before proposing a change of design. An idea rejected is added here,
and removed from [`ROADMAP.md`](../ROADMAP.md), in the commit that rejects it.

Each entry says what the idea was, when, why it was rejected, on what evidence, and what would have to change to
reopen it. **Spiked** means code was written and run, and names where it is; **reasoned** means it was weighed by
reading and argument alone. Where a document has the full account, the entry links there and does not repeat it.
Where the reason or the evidence could not be found, the entry says so: nothing here was filled in by guess.

An entry is not a ban. It is reopened by bringing what it names under "Reopen if", or another reason it does not
answer, and saying so in the proposal.

## The engine and its guarantees

- **A flag for each fiber, in place of the mark on the run's interruptions.** Spiked, 13 November 2026: `8b714ff`,
  on `worktree-agent-a87c5e2edacf8377a`, never to be merged. Proposed by two reviewers of the invariants as a way to
  drop three premises read only in Effect's source; it would give up only a fiber that interrupts itself as the run
  stops it. What the spike showed, as its session reported it (the counts are the spike's, not run again): the flag
  alone gives false `ProgramDefect`s in `init` when whoever runs the program interrupts it at some points, which the
  suite does not see and a script interrupting after k steps did (3 and 6 of 400 values of k); with the question to
  the fiber of what interruptions it received, the flag adds nothing, since forcing it false fails the same 25 tests;
  a self-interruption in the release of a fiber the run stops would always be lost, and the rest of that release
  skipped in silence (23 tests to drop and 2 of the mechanism, 5 to 8 mutations, an invariant of the search
  weakened); and it saves one premise (the annotations of `Fiber.interruptAs`), already held by two tests that fail
  without it, and some 15 lines. `diesIn` still asks a fiber the run does not stop whether it was interrupted. The
  owner decided: the mark stays, and the guarantee is not narrowed. Source: the session "Analisi invarianti
  progetto", 13 November 2026, and the commit. *Reopen if* a design tells the run's stop from a self-interruption
  with no question to the fiber, and keeps a self-interruption in a stopped fiber's release a defect.
- **Promising the order of the defects.** Reasoned, 13 November 2026. The run keeps the order and its tests check
  it; the README describes it as how the run is made today, and promises only that every defect is in the cause,
  each with where (`858b819`). The reason the owner gave: binding the library's guarantees to a specific API of
  Effect is not right, even a stable and documented one; the argument for the promise was that `Cause.squash`, which
  `Effect.runPromise` and `Effect.runSync` use, takes the first defect. The principle is in
  [`invariants.md`](invariants.md), under "Defects always die". Source: the same session. The narrower form,
  promising only that the first defect of the cause is the first that happened, was left open in that session's
  table before the owner's decision, and the decision named no exception; it rests on the same argument. *Reopen
  if* the promise can rest on the library's own code, not on what a function of Effect makes of a cause.
- **"A dispatch never runs `update` on the caller's stack", as a guarantee.** Reasoned, 13 and 14 November 2026.
  It became a sentence of the README's "View" instead (a handler returns before `update` has seen its message,
  `c3c2783`), as the owner accepted: it rests on a premise read only in Effect's source (an unbounded `Queue` wakes
  its reader through the scheduler of the fiber that made it), held by two tests of `run.test.ts`, and by the
  owner's principle above no guarantee rests on it. Source: the same session. *Reopen if* a check of the library's
  own makes it true whatever Effect's scheduler does.
- **One owner of the run's decisions, in other forms.** Spiked, 13 November 2026, on copies deleted since: a death
  queued as a message of the loop; no check at all, the loop stopped first, and the renderer stopped first; the
  death interrupting the loop; the loop calling `runCommand`. Reasoned only: `forkChild` with `startImmediately`,
  and one mode of resumption in `test/scheduled.ts`. Each, with its counts and why, is in
  [`single-owner.md`](single-owner.md), "Alternatives".
- **The shared core in a smaller form**: the guard alone, a core for `rehearse` alone, and the register of deaths as
  part of the step's state. Reasoned; the document records no spike of them. [`shared-core.md`](shared-core.md),
  "Alternatives".

## The testing tools

- **`rehearse`, owning what the test starts, in other forms**: the loop calling `runCommand` (spiked, `cb7dfd0`),
  a request the loop has not taken failing the rehearsal (spiked, `74b271f`), a subscription's message applied as it
  is sent (reasoned), and three more reasoned only. The accepted form was `db8309a`. Each is in
  [`rehearse-owned-effects.md`](rehearse-owned-effects.md), "Alternatives".
- **What the tools do with a step that does nothing.** These were refused inside a proposal the owner has **not yet
  decided** ([`inert-steps.md`](inert-steps.md), proposed 14 November 2026): if the proposal is taken, they stand
  rejected; if it is struck, they are to be weighed again with it. Each is in its "Alternatives":
  - `reject` in `onEvent`, the whole message rejected. Spiked (sixteen tests over seven cases): a child could no
    longer rely on its own transitions, the tool would blame the child, and one answer would have two outcomes.
  - `reject` in `onEvent` only where the child's step changed nothing of its own, a defect otherwise. Reasoned.
  - A gate on a child, an option saying when it takes messages. Reasoned: it would reject the answers of the child's
    own commands too.
  - `Inert` by identity, not by `Equal`. Spiked: two programs that behave alike would be judged by how they build
    their state.
  - `Inert` as an option to turn on, and `Missing`'s change alone. Reasoned.
  - A constant `unchanged`, frames with a version, a child that removes its own duplicates, events with an answer
    from the parent. Reasoned, 26 October 2026, in a discussion in an application that uses the library, not in
    this repository; the reasons are the document's, and that discussion was not read again for this index.
- **A tool that explores a program from `init`**, breadth first, by what each state offers, to a bound. Spiked, 14
  November 2026: `spike/explore` (`5476871`), never to be merged; the account is
  [`exploration.md`](exploration.md). Rejected by the owner the same day, as neither practicable nor useful. Its
  measures (the spike's, not run again): one timer of twenty-five minutes from `init` is 39,050 states in 0.9 s, and
  children multiply, so two would be the square (reasoned, not run): a composed program, the usual one, is walked
  only within a bound so tight that the test chooses the states again, as a generator does. What it found on the
  five examples: one control already known (`StopAllClicked` over an empty list), two behaviours that are meant and
  two false alarms of `Inert`; nothing their tests should have caught. It replaces no generator, since it does not
  reach messages from older frames, ended subscriptions or values beyond its samples; what it adds to
  `dispatchViolations` over a generator's states is `Outdated`, `Stuck` and `Ignored`, the last two often meant. And
  it would be one more tool to keep in step with the engine, with concepts of its own (`within`, `heard`,
  `answers`, nodes with the commands under way, eight findings). Not measured: what it finds when a bug is put into
  an example. *Reopen if* a walk keeps a composed program tractable without the test choosing its states (a child
  walked alone, ids told as names), or a bug put into an example is found by it and by no test the library's tools
  already make possible.

## The API

- **`attempt`**, which turned an effect that may fail into an execution with a message for each outcome. Removed in
  0.7.0 (`775f140`, 26 October 2026) by "A function earns its place" (`AGENTS.md`): it only named two combinators of
  Effect (`Effect.match` and `Effect.asSome`), and the type of an execution already says it cannot fail. Reasoned.
  *Reopen if* it does what those combinators cannot.
- **`silent` and `Subscription.every`.** `AGENTS.md` names them as removed by the same rule, since `775f140`.
  Neither appears anywhere in this repository's history, so what each was, when it was removed and where are not
  found here: they may come from an application or a predecessor of the library. To be completed by whoever knows.
- **Offers as tokens, checked against `update`** (`offer`, `offerInput`, `missingOffers`, a run that reported a
  rejected offer). Shipped in 0.3.0 (`ae4661b`) and removed in 0.6.0 (`3c3fdf9`, 23 October 2026): checking each
  offer against `update` made every page carry rules (offer only what `update` accepts, never probe offers, inputs
  never rejected at runtime) for a bug that leaves the state unchanged and that the property tests already find.
  The run then ignored every rejection, and the testing tools held the view (since item 1 of `boundary.md`, the
  model) to what `update` accepts. Shipped and used, then reasoned out. A related form, offers as data with no
  check at run time, is in a suspended proposal (below), not here.
- **Input through a subscription**, a keystroke sent through a key in place of a dispatch. Reasoned, November 2026,
  before the proposal of declared inputs: typed-then-Save would rest on scheduling, a typed message would be checked
  by nothing, a key that goes away drops what it sent, and the renderer would feed the run by a service.
  [`declared-inputs.md`](declared-inputs.md), "What was proposed".

## Not here

What is open, proposed or suspended is not rejected, and is listed in `ROADMAP.md` with its document:

- **What reaches `update`, declared as data** ([`declared-inputs.md`](declared-inputs.md)): suspended by the owner,
  not revoked. The decisions taken in it stand only if it is taken up again, and what its spikes refuted is there.
- **The proposal of [`inert-steps.md`](inert-steps.md)**: proposed, not decided.
- **The wrapping of a child's message as a public function** ([`boundary.md`](boundary.md), "A question"), and its
  items 6 to 8: questions and candidates, not decided.
