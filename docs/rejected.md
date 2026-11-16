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
  its reader through the scheduler of the fiber that made it), held by two tests of `run.test.ts`. The
  reason given then, that by the owner's principle above no guarantee rests on such a premise, said too much: three
  guarantees do, and the rule written since in [`premises.md`](premises.md) lets them (15 November 2026). The
  sentence is a promise all the same, of the Guide, held by those tests, and stays in "View", where a view's author
  reads it. Source: the same session, and the review of the rules of 15 November. *Reopen if* the owner wants it
  listed among the guarantees, with a property of the search for it.
- **One owner of the run's decisions, in other forms.** Spiked, 13 November 2026, on copies deleted since: a death
  queued as a message of the loop; no check at all, the loop stopped first, and the renderer stopped first; the
  death interrupting the loop; the loop calling `runCommand`. Reasoned only: `forkChild` with `startImmediately`,
  and one mode of resumption in `test/scheduled.ts`. Each, with its counts and why, is in
  [`single-owner.md`](single-owner.md), "Alternatives".
- **The shared core in a smaller form**: the guard alone, a core for `rehearse` alone, and the register of deaths as
  part of the step's state. Reasoned; the document records no spike of them. [`shared-core.md`](shared-core.md),
  "Alternatives".
- **Other caches of a parent's lifted subscriptions, for children that share one state object.** Spiked, 15
  November 2026, on `compose.ts` in the working tree and in a copy, neither kept; measured with `bun run bench`, per
  change of state for a thousand children, in objects of their own and sharing one, against 0.22 and 1.31 ms before.
  The cache kept one place for each state, so children that share one lifted again on every call; keeping every
  place would let ids pile up under a step's `init`, which lives as long as the program. Rejected, in favour of the
  places of the last call in their order (`liftedAt`): keeping only each child's own subscriptions by its state, as
  `modelsOf` keeps a model, and lifting them on every call (0.78 and 0.76 ms: a `Channel.map` for each subscription
  on each call); a map of places keyed by `[name, id]`, made again on each call (1.24 and 1.15 ms: a map for each
  child, and Effect's hash of an array key costs about 0.36 µs, a number's 0.02); and the first place kept for as
  long as the state lives, the others in maps by id for the last two calls (0.23 and 0.34 ms), which keeps two rules
  for one thing, keeps up to twice the list, and holds the ids of the last calls that shared a state once none does.
  The positional cache costs the common case about a tenth (0.26 ms), and lifts again the children after a place
  inserted or removed among those that share a state, in that call alone. Source: the session that made the change,
  with a review by a second model. *Reopen if* a list that inserts a sharing child before the others on most changes
  of state is shown to matter, which the maps by id keep.

## The testing tools

- **`rehearse`, owning what the test starts, in other forms**: the loop calling `runCommand` (spiked, `cb7dfd0`),
  a request the loop has not taken failing the rehearsal (spiked, `74b271f`), a subscription's message applied as it
  is sent (reasoned), and three more reasoned only. The accepted form was `db8309a`. Each is in
  [`rehearse-owned-effects.md`](rehearse-owned-effects.md), "Alternatives".
- **What the tools do with a step that does nothing.** These were refused inside a proposal the owner decided in
  part on 15 November 2026 ([`inert-steps.md`](inert-steps.md), "What was decided"): with `onEvent` left without
  `reject`, the first three entries and the last stand rejected. `Inert` itself is deferred, not rejected, and the
  two entries on it are to be weighed again with it. Each is in its "Alternatives":
  - `reject` in `onEvent`, the whole message rejected. Spiked (sixteen tests over seven cases): a child could no
    longer rely on its own transitions, the tool would blame the child, and one answer would have two outcomes.
  - `reject` in `onEvent` only where the child's step changed nothing of its own, a defect otherwise. Reasoned.
  - A gate on a child, an option saying when it takes messages. Reasoned: it would reject the answers of the child's
    own commands too.
  - `Inert` by identity, not by `Equal`. Spiked: two programs that behave alike would be judged by how they build
    their state.
  - `Inert` as an option to turn on. Reasoned. `Missing`'s change alone, refused beside it, was taken since, with
    `Inert` waiting for an application to measure it.
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
- **A mark on a model's messages, so that a tool finds a reader that forgets one.** Reasoned, 15 November 2026,
  from the third spike of [`declared-inputs.md`](declared-inputs.md), whose walk found every marked message of a
  model, and from the port of the plain input ([`registers.md`](registers.md)), after which the question is of a
  model's fixed messages alone: an input's writes are no reader's. A test's reader is trusted as its candidates are,
  and one that forgets a fixed message is found by `Missing`, given a candidate that acts; the mark's price is the
  spike's, a constructor every model calls and the limits of identity, for a check no example needed. The owner
  judged `Missing` enough. [`boundary.md`](boundary.md) and `declared-inputs.md`, "Open questions". Source: the
  session that removed it from `ROADMAP.md`. *Reopen if* a reader forgets a fixed message of a model, in an example
  or an application, and no test with `Missing` finds it.

- **A failure of a call of `rehearse` failing the rehearsal from any fiber.** Reasoned, 15 November 2026, on a
  finding of the review of that day: a rejected `send`, a `run` that matches nothing or a `hearNext` stopped while
  it waited, made in a fiber the scenario does not join, let the rehearsal succeed. The register of deaths means what
  the run died of, and `deadOr` makes every later call fail because nothing happens in a run that died: a call's
  failure leaves the program whole. A typed failure, in the error channel, is lost in a fiber nobody joins as a
  defect is. The one form that keeps the register's meaning, a second record read at the end, would fail a rehearsal
  whose scenario caught the failure with `Effect.exit` (tests of `rehearse.test.ts` observe one and go on), and
  `drive`'s timeouts, which fail the calling fiber too, would need the same. The README says instead that a call's
  failure fails the fiber that made it. Weighed with a second opinion (Fable), the owner deciding. *Reopen if* a
  test that forked a call and never joined it passed on a failure an application then met.
- **Every tool starting from `from` or `flags`.** Reasoned, 15 November 2026, on the same review. `simulate` is
  given pieces of a program, with no `init` (`simulate({ update })` is one), and folds from a step as `applyAll`
  does: giving it flags would ask for `init` to save the test a call of it. `drive` is a run, and a `from` there would
  name `{ ...program, init: { state } }`, which the README gives for `run`. `rehearse`'s `from` was that spread under
  a name, and was removed instead (0.8.0), so that `drive` and `rehearse` start as `run` does. Left: under `simulate`,
  an `init` that throws on its flags is the test's own defect, not a `ProgramDefect` in `'init'`. *Reopen if* such a
  defect goes untested in a program with flags.
- **`hear` typed by what a program's subscriptions send**, in place of reading a write by its shape. Reasoned, 16
  November 2026, on the item of `ROADMAP.md`, confirmed by a type test: `Rehearsal.hear` refuses
  `{ _tag, message: Written }` at any depth, so an own message of that shape, holding a `Written` as data, is refused
  too, though `update` takes it and its subscription may send it ("hear refuses, by its shape, an own message that
  holds a write as data, …", `rehearse.test.ts`, a known limit). The exact form was a trailing `Heard` parameter of
  `Shape`, typing `subscriptions` (`Own | ChildHeard<C>` from `composition`, the `message` of a `Program<…>`), taken
  by `hear` and returned by `hearNext`. It would be invariant in `Rehearsal`, which takes and returns it, so a
  `Rehearsal<…>` annotated by hand, as tests write it, breaks unless the test names it, with a new `HeardOf`; a
  `Program<…>` annotation, which gives `message`, loses the rule again; and it serves one method of one tool. The
  collision of a program's own value with the library's wrapping was accepted already, for `describeByTag` (under
  "The API"). Workarounds: `hearNext` with a subscription that sends the message, a cast at the call, or another
  name for the field. Weighed with a second opinion (Fable), the owner deciding. *Reopen if* an application's
  subscription is found sending such a message, or `Shape` gains a type of what its subscriptions send for another
  reason.

## The API

- **`attempt`**, which turned an effect that may fail into an execution with a message for each outcome. Removed in
  0.7.0 (`775f140`, 26 October 2026) by "A function earns its place" (`AGENTS.md`): it only named two combinators of
  Effect (`Effect.match` and `Effect.asSome`), and the type of an execution already says it cannot fail. Reasoned.
  *Reopen if* it does what those combinators cannot.
- **`silent` and `Subscription.every`.** `AGENTS.md` names them as removed by the same rule, since `775f140`.
  Neither appears anywhere in this repository's history, so what each was, when it was removed and where are not
  found here: they may come from an application or a predecessor of the library. To be completed by whoever knows.
- **`write`, `isRejected` and `raise`.** Removed in 0.8.0, 15 November 2026, by the same rule: each was a name over
  what a user writes as it is, `write(was, value)` over the literal `{ _tag: 'Written', was, value }`,
  `isRejected(result)` over `result === reject`, and `raise(event)(state)` over the step `{ state, events: [event] }`,
  as the wrapping of a child's message would have been (below). `write` took two arguments of one type, in an order
  nothing checked, where the literal names them. Checked with `tsc`: `=== reject` narrows a `Transition` as
  `isRejected` did, and a handler written by hand in `onEvent` is refused and inferred as `raise` was ("a parent
  raises only the events its own type includes", `compose.test.ts`), since the check is `onEvent`'s. `raise` was
  weighed with a second opinion (Opus 5.5), the owner deciding; `write` was never released. *Reopen if* one of them
  comes to do what the literal or the operator cannot: a check as it is made, or a shape that is hidden.
- **Making `subscriptionsOf` internal**, as `write`, `isRejected` and `raise` were removed: it stays public. Reasoned,
  15 November 2026, with a second opinion (Opus 5.5), the owner deciding: it is `program.subscriptions ?? (() =>
  HashMap.empty())`, and its siblings `runCommandOf` and `startOf` are internal. It stays, since it is no name over a
  literal: `subscriptions` is optional on every type a test holds (`Shape` in `program.ts`, which `compose` returns too,
  though it always sets the piece), so that without it each test would write again what a missing piece means, which is
  the library's rule; nothing else tells a pure test what a program listens to in a state; and its fallback is one a
  test observes, where `runCommandOf`'s is never called and `startOf` decides only for generic code. The reason is in
  `AGENTS.md` ("Code"). *Reopen if* `subscriptions` becomes required on a program's type, where it would be a property
  read.
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
  the identity its author chose, as a tag is, even where it holds data; reporting is the job of whoever runs the
  program, whose reporter already filters the `cause`, any thrown value the library cannot scrub, and with it `key`
  and `on`; and an option would only name code around `run`.
  An option for the logs alone leaves out the crash report; one for the
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
- **A peer range that stops at the minors of Effect tested** (`~4.1.4`, widened by a release on each green run of
  the daily job). Reasoned, 15 November 2026. Proposed by the review of the invariants of November 2026: about
  seventeen entries of [`premises.md`](premises.md) rest in part on what Effect does not document, and `^4.1.4`
  accepts minors no test has run on, so the daily job (`.github/workflows/effect-latest.yml`) tells of a break and
  does not protect a consumer already on that minor. The owner chose the wide range with the daily job, and acts only
  when it fails: the narrow one would ask for a release at each minor of Effect, even one that changes nothing, and
  warn every consumer who upgrades Effect before it. The evidence at the time: the newest Effect 4 published was
  4.1.4, the version of the lockfile, and the job was green on 14 and 15 November. Source: the session that removed
  it from `ROADMAP.md`. *Reopen if* a minor of Effect breaks a premise and reaches consumers before a release of the
  library follows it.
- **The wrapping of a child's message as a public function** (`{ _tag, id?, message }`, for `dispatchTo` and a
  test's reader to share), **and as an internal one** for the two places of `src/` that build it. Reasoned, with a
  scratch probe of `tsc` against the `list` and `pages` examples, outside the repository and deleted, 15 November
  2026. The public function adds a name over a shape the library documents as data, as `Step` is, and covers one of
  the three shapes a parent's test rebuilds (a child's command and a lifted key stay literals). The probe confirmed
  that the compiler rejects a wrong child name, a missing or mistyped id and another child's message in a literal
  typed as the parent's `Message`, and found the one check a function would add: a stray `id` on a child that is
  alone compiles when the literal is not fresh (a `const` assigned later, or the result of a `map`). Inferring the
  parent's `Message` from the parent program was found easy, so that was no reason against. The internal function
  would share only the spread: `compose` and `dispatchTo` decide differently whether a child is by id, and it would
  add an import between `compose.ts` and `dispatch.ts`, which have none. The owner decided against both.
  [`boundary.md`](boundary.md), "A question". Source: the session that removed it from `ROADMAP.md`, with a review by
  Fable 5.2. *Reopen if* a tool must lift a child's message without a type to lean on (as the third spike of
  [`declared-inputs.md`](declared-inputs.md) did), or the stray `id` is found in an application's tests.

- **Following a string in a child's wrapping, in the default description of a message.** Reasoned, 15 November
  2026, on the same review: `describeByTag` describes `{ _tag: 'Counter', message: 'Increment' }` as `Counter`. It is
  a function of the value alone, used where no program is at hand (`applyAll`, the `on` of a `ProgramDefect`), and
  it meets a leaf program's own values, which nothing of the library checks: another name for the field collides the
  same way, a rule of the types reaches only a composition's own tags, and a key that is a symbol, the one shape it
  could trust, would be imported by every parent's test and view and lost in a session saved as JSON. Following the
  string would log a program's own text, `{ _tag: 'ToastShown', message: '<text>' }`, which the default must not.
  The README says what it does; `describeMessage` shows more. *Reopen if* a wrapping the describer can tell from a
  program's own value comes for another reason.

## The checks

- **A framework of mutation testing (StrykerJS) in place of `mutations/`.** Reasoned, 15 November 2026, when the run
  grew slow. Stryker generates mutants by syntactic operators and scores how many the suite kills; the list in
  `mutations/mutations.ts` takes out each check an invariant rests on, names the tests that must fail under it, and
  the runner refuses a killer that ran more or fewer times than once, or fails only beside its file. A score is no
  such promise, the mutants equivalent in code over Effect would each be read by hand, and Stryker has no runner for
  `bun:test`: its command runner would run the whole suite for each mutant. The run was made parallel instead (162 s
  to 44 s on 24 processors). *Reopen if* the list is to be judged for what it misses, beside the checks it names.

## Parked, not rejected

What is deferred or suspended is not rejected: it is kept here, with its document and what would reopen it, and is
out of [`ROADMAP.md`](../ROADMAP.md), which lists only what is to be done or decided now. An item reopened goes back
there; one decided against becomes an entry above.

- **Running only the mutations a diff touches** (`--changed`: those whose file, or a file of whose killers, changed):
  deferred by the owner on 15 November 2026, for the parallel run. A change elsewhere can make a check redundant, and
  the mutation of it survive, which such a selection does not run; and the files of the engine hold most of the list.
  *Reopen if* the parallel run grows slow again; the whole run stays before a release.

- **What reaches `update`, declared as data** ([`declared-inputs.md`](declared-inputs.md)): suspended by the owner on
  14 November 2026, not revoked. The decisions taken in it stand only if it is taken up again, and what its spikes
  refuted is there; its first aim, a model with no function for what the user types, was reached by the plain input.
  *Reopen if* the owner takes it up again; the one case the owner named, exploring made awkward on today's API
  because a model's functions do not compare, the exploration did not find (`exploration.md`).
- **`Inert`, a message a model holds that does nothing** ([`inert-steps.md`](inert-steps.md), "What was decided"):
  deferred by the owner on 15 November 2026, not rejected; the rest of the proposal is done. It would flag the guard
  `{ state }` against a double tap and a parent's broadcast, and found one real case in the examples, fixed without
  it. *Reopen if* an application has a message that does nothing where it should act, which a test with `Inert`
  would have found, or a key's messages are given to the tools (below).
- **What a key sends is not data** (`declared-inputs.md`, "What still makes sense", point 3): no tool judges a
  subscription's message, and whether a test lists a key's messages, a program exports them or a subscription
  declares them is open. Deferred with the suspension above, 15 November 2026; no control drawn goes through a key
  in the examples, so it concerns only sources that exist whatever is drawn ([`registers.md`](registers.md)).
  Weighed again the same day as a second `makeModel`, whose messages `subscriptions` would be given, and left parked
  (reasoned): a subscription starts once for a key, where a view is drawn again from each model, so the messages
  could depend on the key alone; most carry a value from the world, so that model would hold functions again; and
  only a `Subscription` of the library's own could hold a channel to what it is given. Tried instead, and run: a
  test lists what each key sends, as its reader lists what the model holds, and gives it to `dispatchViolations`
  with every message `repeatable` ([`volume`](../examples/volume/volume.test.ts)). *Reopen if* a key's message that
  `update` rejects, or that does nothing, is found in an application, and such a test does not find it.
- **Frames a bridge skips by the equality of models** (`registers.md`, "To explore"): with no function in a model,
  the models of two equal states are `Equal`, and a bridge could skip the drawing, as `thunk` and `memo` do by
  reference. Neither spiked nor measured, 15 November 2026. *Reopen if* the benchmark of a bridge's frame
  (`bench/writes.ts`) shows the drawing of an unchanged model to be a cost that matters.
