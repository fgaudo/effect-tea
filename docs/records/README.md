# Records of designs

Each file here records one design: what was proposed, the spikes and reviews it had, and what the owner decided. Its
status, at its head, says whether it was done, suspended, deferred or rejected, and at which commit it was last read
against the code. A record is history, not a rule: where it and the code differ, the code, the guide,
[`invariants.md`](../invariants.md) and [`premises.md`](../premises.md) rule. What was rejected, and what would reopen
it, is indexed in [`rejected.md`](../rejected.md).

| Record                                                   | Status                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| [`shared-core.md`](shared-core.md)                       | done: the core the run and the testing tools share       |
| [`single-owner.md`](single-owner.md)                     | done: a run that needs no test of the order of yields    |
| [`rehearse-owned-effects.md`](rehearse-owned-effects.md) | done: a rehearsal that owns what the test starts         |
| [`boundary.md`](boundary.md)                             | done, its last item rejected: where the library ends     |
| [`registers.md`](registers.md)                           | done, its frames replaced: what the outside writes       |
| [`inert-steps.md`](inert-steps.md)                       | done in part, `Inert` deferred: a step that does nothing |
| [`declared-inputs.md`](declared-inputs.md)               | suspended: what reaches `update`, declared as data       |
| [`exploration.md`](exploration.md)                       | rejected: exploring a program from `init`                |
| [`hosted-react.md`](hosted-react.md)                     | done, its store replaced: React hosts the program        |
| [`adoption.md`](adoption.md)                             | decided, done in part: for others to adopt, and entries  |
| [`synchronous-dispatch.md`](synchronous-dispatch.md)     | done: a dispatch that applies its message at once        |
| [`input-in-the-model.md`](input-in-the-model.md)         | rejected: an input as an entry in the model              |
| [`architecture-review.md`](architecture-review.md)       | proposed: what a dispatch that applies at once left      |
| [`write-without-was.md`](write-without-was.md)           | taken, to be done: a write without `was`                 |
| [`store-and-effects.md`](store-and-effects.md)           | taken, to be done: a program started by plain code       |
| [`external-handler.md`](external-handler.md)             | done: external messages in `external`                    |
| [`promises-and-tests.md`](promises-and-tests.md)         | done: each promise of the guide against the tests        |
| [`library-review.md`](library-review.md)                 | done: a review of the whole library, its findings open   |
| [`one-engine.md`](one-engine.md)                         | taken, to be done: `rehearse` over the engine itself     |
| [`application-report.md`](application-report.md)         | proposed: what an application's upgrade to 0.8.0 found   |
| [`kept-children.md`](kept-children.md)                   | taken, to be done: children that the library keeps       |
| [`given-functions.md`](given-functions.md)               | done: when the library calls what a program gives it     |
