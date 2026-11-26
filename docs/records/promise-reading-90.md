# The first reading of the promises by the skill

**Status:** done, 26 November 2026, as step 90 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5 at
`high`, by [`promise-reading`](../../.agents/skills/promise-reading/SKILL.md). It read everything: the guide, every doc
comment that names a page, the examples, the README's code, the tutorial and the skill. Nine readers took the pages,
three the examples, and the session the diff of the API's reports since `v0.8.0`. Seven fixers, each in a worktree of
its own, wrote the tests, the sentences and the examples; the session merged them. The reading before it is
[`promises-and-tests.md`](promises-and-tests.md), of the guide alone.

## In short

Of 707 sentences of promise, 605 had a test that would fail if the sentence were false, and 102 had none, or one of a
part only: about 30 with no test, 66 of one case of several, two that only `bun run interleavings` checked, and two
that only the smoke test did. A sentence that two pages state is counted on each. Each gap was checked by its fixer,
and each got its test, seen to fail once with the code made false, but four that a test already held. No test found a
bug: there is no `test.failing`.

Five sentences were false of the code, and the sentence changed: the testing tools compare no models ("Model"), a
`CompositionDefect` has four cases and not three, a subscription sends no late message once its key is gone
("Rejections and defects"), `Draw` renders once a task and not for each new state, and an element given its value back
keeps its focus, not its caret. About twenty sentences said one thing in two places, or a thing outside the places
of promise; they were set to the place that rules.

The examples broke the rules of "Testing" most: no example but two checked that its model is data, few generated only
valid states, and several asserted a step in part. They now follow every rule. Making `bounce`'s states valid showed
one control that does nothing in some states, now exempted with `inert`.

## The API's reports

Each line removed or narrowed since `v0.8.0` has its test of the types, and each check of the types of `program.ts`
and `compose.ts` has its mutation, or the reason it has none in `tools/mutations/mutations.ts`.

## Decisions

- `program<{ … }>()` refuses `commandServices` and `subscriptionServices`: it took them and ignored them, a form taken
  wrongly ("What belongs here", the rules of the types). A breaking change. A service named `never` or `any` still
  compiles: refusing it would ask a conditional over the keys of the types, which stays undecided in a function over a
  type parameter, and `never` says only "none".
- When the effects of a step start, against the return of the call that sent its message, is unspecified, as
  "Guarantees" said: "View" and `Dispatch` said "later". A promise withdrawn, with its breaking entry.
- The first bullet of the second step of "Testing" goes: the types give "a step or `reject`", and "the same each time"
  is the axiom of purity. "That the model is data" stays, and every example checks it.
- Where `update` and `makeModel` test one condition, the examples write it once, as a function of the state that both
  call ("Decide a condition once").
- Advice now names three cases that the examples had and no page gave: a handler decides from its event alone what
  the platform does with it (`preventDefault`); a fraction of a step that only the view reads; a text field locked
  with `readOnly`, not `disabled`, which keeps the focus.
- Tests that pin what the guide leaves unspecified, and hold no invariant, are marked as alarms, as `src/start.test.ts`
  marked the first.

Left, as low: `bounce` keeps the height beside a ball at rest, which "one union for each concern" would put in the
case; the sketch of "Running", "In short", forks `run` with no report of a crash, which its next paragraph gives.
