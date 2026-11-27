# Roadmap

What is to be done now, and nothing else. Each step names its model and effort, what it depends on, and how to tell
that it is done, and its choices are made by "Deciding" in [`AGENTS.md`](AGENTS.md), without the owner. A step done
is removed, with the reason in the commit, and leaves its number unused. An item rejected goes to
[`docs/rejected.md`](docs/rejected.md), and one deferred to its "Parked, not rejected", with what would reopen it, in
the same commit. How an item came to be is in a record of [`docs/records/`](docs/records), or in the commits, not
here.

## How the steps run

One after another, in the order of "Next, in order", each in a context of its own (a workflow per step, or a session per
step), and with no question to the owner but those of "Deciding". An agent of the step's model and effort does the step.
Where the step changes what `change-engine` covers, or the types of an export, an agent that wrote none of it, on
Opus 5.5 at `high`, then runs the checks of its "Done when" and reads its diff against "Deciding" and the step, and the
step against `docs/invariants.md`; the first agent fixes what it finds, twice at most. A step of names, of documents or
of a tool of `tools/` is read so by the agent that did it. A step whose checks still fail stops the chain, with a
report. A step ends in one local commit, with its decisions in the body, and takes itself out of this file. Before each
step, the use of the owner's plan is read where a tool reports it: a step that the rest of the week cannot pay for waits
for the reset.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. A finding of a review goes here with its `test.failing`, until its fix removes the mark and the item. A
problem whose fix is due before a step of "Next, in order" leaves this list for a step of its own there.

## Leads

What a task or a review found that no failing test shows and no user met ("How a decision is taken and kept" in
`AGENTS.md`): a line each, with what would show it, as the test of the types that would hold a lead of the types, or
the case of the inference matrix (`bun run inference --filter <case>`). A form that no page shows is no lead ("What
the library owes, and to whom" in `AGENTS.md`). None is a step of its own: they are weighed together before a release,
and one not taken then goes to `docs/rejected.md`.

None is open: those found before 0.11.0 were weighed on 27 November 2026.

## Next, in order

0.11.0 is not released: the readings made for it, in commit `5f13b2b`, are made again before it, over what
came after them. The next reading of the promises reads the changes since that commit
(`git log --grep "the promises read for 0.11.0"`). The next review of the premises is step 121, over all of the code.
It reads nothing of an `Equal` or a `Hash` of the program that throws: step 107 dropped the three
premises that served that case alone, by the rule it left in `docs/premises.md` ("What no program that keeps the
guide's rules can see").

The owner's rule of 27 November 2026 says what the library owes, and to whom (`AGENTS.md`, "Deciding"): to a program
written as the guide teaches, and nothing to a form that no page shows. Steps 122 and 123 take out what the code holds
for such forms, before the review of step 121 reads the code.

### 122. The checks of the names of children go, with all that says them

Opus 5.5, `medium`. Depends on nothing. By `change-api`. `withChildren` refuses five forms that no page shows, each
found by a review and none by use (commits `73aeb05`, `a9c9747` and `c074855`): a name that is a number, a symbol or
`__proto__`, a union of objects of children, and an optional child. They are unspecified, and a check that stays is a
precedent that the next review makes wider.

- `compose.ts`: `NamedAsMakeReads`, `NamedOnce`, `Several` and `Optional` go, and `withChildren` takes `children: C`.
  Its doc comment loses its sentences from "A name is a string" on.
- `compose.test.ts`: the `describe` "a name of a child is refused by the types, or is one child to both the types and
  make" goes. One case of a plain name stays, only where no other test holds that a child's message, event, command,
  key and model are routed by its name.
- `CHANGELOG.md`: the entry of 0.11.0 on a child's name goes whole, since no release held the checks.
  `api/effect-tea.api.md` is written again.
- `docs/rejected.md`, "The API": one entry for the five, reasoned, reopened by a user's report of one. It says that
  the optional child, spread in by a condition (`{ ...(flag ? { b: … } : {}) }`), is the one of the five that a user is
  likeliest to write: it compiles, and its `makeModel` throws where the flag is off.

Done when the four types and the `describe` are gone, `grep -rn "__proto__" src CHANGELOG.md` finds nothing, and the
checks of `AGENTS.md` for `compose.ts` and for the API pass (`bun run inference`, `bun run smoke` and
`bun run api --check` among them).

### 123. What else the types, the tests and the comments hold only for a form that no page shows

Opus 5.5, `high`. Depends on 122. By `change-api`. Decided with the rule: a program is made by `make`, and one written
by hand as an object is no form of the guide, typed `Program<…>` or not, though the library's own tests write many
so, and may. Nor is a `Child`, a `ChildById` or a defect made otherwise than by the library's functions. Each item
below is read. What serves only such a form goes, where taking it out changes nothing for a program of `make`, which
`bun run inference` and the counts of the smoke test say. What also serves a form of the guide, or how a consumer's
types print, stays, and the commit says which and why.

- The check of a child written as an object: `ProgramChecked`, `Lacking` and the intersection of `CheckedChild`
  (`compose.ts`), its sentence in the doc comment of `child`, and its tests. `CheckedChild` also keeps the name
  `Program<…>` in a consumer's declarations (`change-api`, "No new type for how a consumer's types print").
- `TagsTaken` for a tag that is `string`, a template or `any`, or that the type lacks. An own message, command or key
  whose literal tag is the name of a child is a mistake, and stays refused.
- The sentences and the tests that say that the types refuse a `new`, an `extends` or an object written as a `Child`,
  a `ChildById` or a defect class (`compose.ts`, `defect.ts`). The classes stay as they are: they are how the types
  are opaque.
- The tests named "a program written as a plain object…" of `run`, `drive`, `rehearse` and `simulate`, and the sentence
  of the doc comment of `Program` on one written as an object without `subscriptions`: each stays only where no test
  of a program of `make` holds the same.
- Then every other `Refused<…>`, `@ts-expect-error` and "does not compile" of `src/`, read once against the rule: the
  commit lists each that goes. A refusal of a mistake stays.

Done when each item is taken out, or kept with its reason in the commit, the checks of `AGENTS.md` for `compose.ts`
and for the API pass, and the changelog says what a consumer can notice (`release`).

### 121. The review of the premises names the forms of this bug hunt, and reads all the code

Opus 5.5, `high`. Depends on 122 and 123. The bug hunt of 27 November 2026 found bugs in code that three reviews of
the premises had in their scope (21, 24 and 26 November): their brief named none of the hunt's forms, and read the
changes since the last review, of the engine and the testing tools alone.

- `premise-review`: its "THE KIND OF BUG" names three forms: an interruption by whoever runs the program at a yield of
  the scheduler; a cost that grows with the number of messages; a tool that imitates a dependency. Its reviewers read
  three areas apart: the engine, the testing tools, and the bridges. The types are no area of a review: the tests of
  the types and `bun run inference` hold them, for the forms of the guide. The hunt's fourth form, a name that the
  types drop and `make` does not, was a search of the ways to write a program, which a review does not make. It reads
  all of the code before the library is made known, as before 1.0.
- Then one review over all of the code, one reviewer for each form rather than each area, as the skill says otherwise:
  each finding an open problem with its `test.failing`, each fix by its form. It is the review of the premises due
  before 0.11.0. A review over all the code is made again while the last one confirmed a bug of a program written as
  the guide teaches.

Done when the skill names the three forms and the three areas, and a review over all of the code confirms no such
bug.

## For the owner

What leaves this machine, or decides what the project is ("Deciding" in `AGENTS.md`): an agent prepares it, and the
owner does it.

- **0.10.0** is published. It holds the first bug of the hunt of 27 November 2026, as 0.8.0 and 0.9.0 do: a `run`
  interrupted as it begins may leave a program that applies messages and reports none of their defects.
- **0.11.0** is not released: the bug hunt of 27 November 2026 reopened its section of `CHANGELOG.md`, and took out the
  tag `v0.11.0` that pointed to commit `acbada3`, before its fixes. It is released, by `release`, once step 121 and the
  reading of the promises are done.
- **1.0.** Not before the library has been made known and used by others for at least one or two months, as the owner
  decided on 20 November 2026: only then may 1.0 be decided, with what its users have asked of the API, after a
  reading of the promises and a review of the premises over everything. Until then, releases stay at 0.x.

## Any time

None of these waits for the steps above, nor holds them up, and "proceed with the roadmap" takes none of them: the
owner left them here on 25 November 2026, while the steps of "Next, in order" are done. Each is for Opus 5.5,
`medium`, but where it says otherwise.

- **What a real browser has not run of the bridges.** The bridges' tests run in Chromium, Firefox and WebKit
  (`bun run test:browsers`, a job of the CI). Firefox runs in the CI alone: on the owner's Windows machine, Playwright's
  Firefox does not start ("side-by-side configuration is incorrect"), so the tests of hydration, transitions and Fast
  Refresh that step 70 added ran in Chromium and WebKit, and run in Firefox after the owner's push. So do all the
  bridges' tests at React 19.3.0, which step 83 made the start of the peer range and the lockfile's version. An IME is
  driven in Chromium alone, through its protocol: Playwright drives none in Firefox or WebKit, so a composition there
  is not run.
- **A benchmark that runs in the CI.** Many children, many messages per second, to keep what a message costs the event
  that sends it, and a model made only when it is read, from regressing. `bun run bench`
  (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and `tools/bench/writes.ts`, run by hand,
  what a message that an element fills costs as a program stores its value, by its own `update`, through the `update`
  that `make` composes, and through a dispatch with its model read; neither runs in the CI. A CI machine's times
  vary, so what fails is a count that does not: how often `makeModel` runs, how many keys one message reconciles.
  What one step with many keys costs was measured by hand in step 57 ([`left-points.md`](docs/records/left-points.md),
  the last item): a start for its cases.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing. It says what it does with a kept state once a declaration changed, which the
  library leaves unspecified ("Guarantees", "What is left to you"): `stateOf` makes a state of the new program from an
  own state and its children's states, and is a testing tool today.
- **An example of saving each state before its commands start**, which the guide names ("Running", "Work that must
  wait goes to the effects of the program") without showing: `onApplied` offers the state to a queue, a fiber of
  whoever runs the program saves it, and a wrapped `runCommand` waits until the state its step heard is saved.
