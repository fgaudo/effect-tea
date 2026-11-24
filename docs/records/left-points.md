# The points left for the owner, decided

**Status:** done, 24 November 2026, as step 57 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by the
values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). The points came from the review of the premises of step 20,
from the table of [`given-functions.md`](given-functions.md), from the reader's check of 20 November 2026, and from
the stages of [`synchronous-dispatch.md`](synchronous-dispatch.md).

## Decided with a change

- **A state is current only once its keys are.** A defect of `subscriptions` left the new state current, told no
  listener, and offered no job: `model()` gave a state that no listener was told of, against the rule of "Running"
  that a listener is told of each new state once it is the current one. The state now stays as it was, as a defect of
  `onApplied` leaves it (value 1, and value 4: the four defects of the pure half of a step alike). Telling the
  listeners of that state was weighed and left: a renderer would draw a state whose subscriptions never start, in a
  run that dies. So was a sentence that states the exception: an exception where none is needed. `stepped` tells a
  testing tool an applied step only once its state is current, so the stage no longer asks whether its keys were
  reconciled.
- **One channel run again is a premise** ([`premises.md`](../premises.md)), with a test of Effect alone. Asking every
  `listen` to make its channel anew was weighed and left ([`rejected.md`](../rejected.md)).
- **The bridge to snabbdom draws `class`, `attrs` and `dataset`**, with snabbdom's modules of each. Leaving them out
  dropped what a view wrote, in silence (value 1); both readers of the check wrote them. Promising that it draws none
  was weighed and left: a promise of a silent drop.
- **"What is left to you" names an `Equal` and a `Hash` that keep Effect's rules**, under the item of flags and keys,
  merged with it rather than added beside it (value 7). Nothing can check one (value 2: the last kind of refusal).
- **"What is left to you" names a listener of the `App` that sends at every notice**, under "Nothing is bounded, and
  nothing times out". A bound with a defect past it was left ([`rejected.md`](../rejected.md)).
- **The skill names that the state is ahead of its effects**, among the rules that nothing checks: the trap a test
  with `drive` meets first.
- **"Testing tools" says that `hearNext`, `run` and `runAll` ask for the services of all the subscriptions or all the
  commands**, whichever they run. "Writing a bridge" says that whether a handler of a stopped snabbdom bridge still
  sends is unspecified.

## Decided with no change

- **A tool that keeps the table of the functions a user gives**, or a line of `change-api`: neither
  ([`rejected.md`](../rejected.md)).
- **A subscription from an API of callbacks**: "Subscriptions" has had its section since step 36. A feed that never
  ends needs none: hiding the end of a source behind `Channel.never` would end in silence.
- **What is drawn outside the root**: "View" has said since the reader's check that plain code over the handle draws
  it, beside the bridge.
- **`Fiber.interrupt` in "Running"**: named already, in "How the run ends".
- **The test of the timer's buttons**, which no mutation of the library kills: it holds the example's view, and fails
  once the "−" loses its key. Kept, with a comment that says so.
- **The whole pure step in the event that sends it**: measured, on Bun, for 2,000 dispatches after 200, each read by a
  listener. A step costs 0.12 ms with 1,000 string keys and 1.9 ms with 10,000; 1 ms with 1,000 keys of a
  `Data.TaggedEnum` made anew on each state, and 12 ms with 10,000; a model of 1,000 labels adds 0.01 to 0.3 ms. The
  cost grows with the keys the program lists, each compared on each new state: needed, so no bug by value 6, and
  nothing to optimize before a user's case.
