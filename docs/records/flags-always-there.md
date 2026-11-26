# A child with flags that is always there

**Status:** decided on 26 November 2026, as step 94 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Each claim is **run**, by a test that the text names, or
**reasoned**.

## The question

`child(program, { flags })` was there where `flags` gave `Some`, so its model, its output and the number of its
instance were an `Option` also for a parent whose every state gave the flags. That parent unwrapped them with a defect
that no state reaches ([`application-report-0.9.md`](application-report-0.9.md), point 4).

## Decided

**`flags` gives the flags of a child that is always there, and `there` gives `Some` of them for one that may not be.**

| Child                                                  | Without flags                      | With flags                              |
| ------------------------------------------------------ | ---------------------------------- | --------------------------------------- |
| always there                                           | `child(p)`, `child(p, { key })`    | `child(p, { flags: (state) => F })`     |
| there in some states                                   | `child(p, { there: (s) => bool })` | `child(p, { there: (s) => Option<F> })` |
| started again where it gives another value, by `Equal` | `key`                              | `flags`, or what `there` gives          |

- **No new word** (reasoned, value 3). `there` keeps one role, the states where a child is there, and `flags` keeps
  one, what a child starts from. `flags` of `child` now does what `flags` of `childById` does, the flags of each child
  that is there, and what `key` does for a child without flags. An option of its own for the always-there form, as
  the step proposed, would have been a second word for flags.
- **Each form has an option of its own** (reasoned, value 1): flags may be an `Option` themselves, so the return type
  of one option could not tell the two forms apart. `flags` with `there`, or either with `key`, does not compile,
  with options written as a literal or not (**run**: "a child with flags is declared with them", "a child with flags
  takes no key beside them, …").
- **Breaking.** `child(p, { flags })` that gave an `Option` becomes `child(p, { there })`. The old call does not
  compile, unless the flags are a type that an `Option` fits, as `unknown`: such a child is then always there, and
  starts from the `Option`. The changelog says the upgrade.
- **The cost: `there` gives a boolean or an `Option` of flags**, as the program's type says, and the runtime tells the
  two by what they give: a boolean is never an `Option` (`Opt.isOption`), so no premise of how a program is written
  is taken.
- **Not `child(p, { there: (s) => bool, flags: (s) => F })`**, which keeps `there` a boolean (reasoned, value 1): a
  state that holds an `Option` of the flags would unwrap them in `flags` with a defect that no state reaches, the
  very problem of the step.
- **The old call, on a program of flags typed `number`, is refused by the last overload**, whose message says that
  `flags` is `never` there, and not that `there` gives the `Option` now. A refusal named by a key, as other checks
  have, was weighed and left: the changelog says the upgrade, and the message points at the field.

**Run**: "a child with flags that is always there is read with no Option, and other flags start it again"; the
inference matrix crosses a child with flags in each of the three forms (`plain`, `there`, `listening`).
