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
- **`describeKey`, an option for how a subscription's key appears in the logs and in a `ProgramDefect`.** Reasoned,
  13 and 14 November 2026. Proposed by a review of the invariants, since a key, a string message and a child's id
  reach a crash report as they are. Deferred on the 13th, then rejected on the 14th after a second opinion: a key is
  the identity its author chose, as a tag is, not data; reporting is the job of whoever runs the program, whose
  reporter already filters the `cause`, any thrown value the library cannot scrub, and with it `key` and `on`; and an
  option would only name code around `run`. An option for the logs alone leaves out the crash report; one for the
  defect too runs the program's code as the run dies, or costs at every start outside debug, makes the key differ
  from `onApplied`'s `origin`, and leaves a child's `id` undefined. The README says instead that the key and the id
  are carried as they are, and a string message whole. Source: the sessions "Analisi invarianti progetto" and
  "Parere Fable sulle invarianti", and this one. *Reopen if* a program needs a key that must hold private data and
  cannot be built otherwise.
- **Input through a subscription**, a keystroke sent through a key in place of a dispatch. Reasoned, November 2026,
  before the proposal of declared inputs: typed-then-Save would rest on scheduling, a typed message would be checked
  by nothing, a key that goes away drops what it sent, and the renderer would feed the run by a service.
  [`declared-inputs.md`](declared-inputs.md), "What was proposed".
- **An input as a `Field`, `{ value, revision }`, with `field`, `renewed` and a revision derived by value.**
  Implemented on 14 November 2026 and replaced, unreleased, on 15 November by the plain input of the ninth review
  ([`registers.md`](registers.md), "A plain input, and a frame that says what it has seen"). The rule of a revision is
  applied after each step of the program that holds the input, and a hierarchical composition splits that ownership:
  a child its parent starts again, a kept state brought back and a row whose id comes back gave the input a revision
  it had, and a late key was stored into the new instance, run in `src/input-swap.test.ts` of
  `worktree-agent-a02816c77ebec330c` (`4757546`). `renewed` was a recipe to remember for a slider whose bounds narrow,
  and the state stored differed from the state written. *Reopen if* the numbering of a frame (`seen`) or the condition
  on elements and renderers it rests on fails where no revision would.
- **Whoever steps replaces what is below** (the seventh review) **and the channel of a replacement, declared** (the
  eighth). Spiked, 15 November 2026: `2d2e77b` on `worktree-agent-a144664c3ddf8f27a` and `45da546` on
  `worktree-agent-a04cfe354d300ce70`, never to be merged. The rule of a revision applied by whichever program steps to
  every input below it, through a channel from a child to its parent (`replacing`, with `all` in `each`, an input's
  place a lens, and a generation for what is left): they close the reset and the undo, but patch the split of
  ownership rather than remove it, need a recipe for what they leave, and widen what a parent's `compose` does to a
  child's state. The owner judged the complexity of parents and children too much and asked for another way, which
  the ninth review gave. [`registers.md`](registers.md), "Whoever steps replaces what is below" and "The channel of a
  replacement, declared". *Reopen if* the plain input is dropped and an input must again keep a history between two
  writes.

## Not here

What is open, proposed or suspended is not rejected, and is listed in `ROADMAP.md` with its document:

- **What reaches `update`, declared as data** ([`declared-inputs.md`](declared-inputs.md)): suspended by the owner,
  not revoked. The decisions taken in it stand only if it is taken up again, and what its spikes refuted is there.
- **The proposal of [`inert-steps.md`](inert-steps.md)**: proposed, not decided.
- **The wrapping of a child's message as a public function** ([`boundary.md`](boundary.md), "A question"), and its
  items 6 to 8: questions and candidates, not decided.
