# The form of a value out of `set`, and a check of a place's laws: the spike

**Status:** spiked, 22 November 2026, by a session of Fable 5.2, on the branch `claude/spike-set-form` at `d647b52`,
never to be merged. It was step 29 of [`ROADMAP.md`](../../ROADMAP.md), which the owner took from
[`application-report.md`](application-report.md), "What the owner decided". Taken by the owner the same day, both
parts ("Decided", at the end), to be done as step 37. Done, 23 November 2026: part 1 as stage 37a, `store`, and part 2
as `placeViolations`, both on `main`. Last read against the code at `78d6b11`.

## In short

Both parts work, on no new premise, and neither needs the other's code. They need each other's rule:

- **Part 1, the form of a value.** `input` and `inputById` take a field `store`, a function of the value alone, beside
  `at` or beside `get` and `set`: `input({ at, store: (note) => note.toUpperCase() })`. A write stores `store(value)`,
  and a `set` is given exactly what is stored. It is some forty lines of `src/compose.ts` and `src/input.ts`, most of
  them types, and no line of a bridge.
- **Part 2, the check.** `placeViolations`, in `./testing`, is given what `input` or `inputById` returns, with states,
  values, and ids for inputs by id. It checks the three laws of a lens wherever `get` gives `Some`. It found every
  broken `set` the spike wrote but one, and for that one a fourth check was added.
- **The two together.** A `set` that stores another form, which 0.8.0 allows, breaks exactly one law, the second. So
  the check cannot be taken while that exception stands, unless it is told the form. With part 1 the laws are of `get`
  and `set` alone, and the check reads no form.

What the spike found that the roadmap did not expect:

- What `input` returns has the `set` too, not the `get` alone: the check is given the input as it is.
- The laws hold on the states that a test draws, and no further. A `set` that writes every row passes the three laws
  on a sheet whose rows hold one value, such as an empty one. A fourth check, of what `get` gives at the other ids,
  finds it there.
- A `set` that marks the state only when the value differs passes the laws as they are usually drawn. It fails once
  the value held is written back, so the check adds that write itself.
- A form that is not idempotent leaves the behaviour defined, so no law of the form is needed.

## What was built

On the branch, with tests of each:

- **`src/input.ts`.** `written(message, store)` stores `store(message.value)`, or the value as it is without a form. A
  form equal, by `Equal`, to the value held leaves the very same value.
- **`src/compose.ts`.** `Placement` and `PlacementById` take `store?: (value: A) => A` in both of their forms. `Input`
  and `InputById` hold it beside `get` and `set`, and a write gives it to `written`. The `set` that `input` returns is
  the place's own: it applies no form.
- **`src/testing/place-violations.ts`**, exported by `./testing` as `placeViolations` and `PlaceViolation`.
- **`src/spike-store.test.ts`** and **`src/spike-order.test.ts`**: what the types infer, and what a write does.
- **`src/testing/place-violations.test.ts`**: sixteen tests, of places right and wrong.
- **`bridges/bridge.test_suite.ts`.** The note stored in capitals is declared with `at` and `store`, and a new test
  types a key whose form is the value held.
- **`tools/inference/generate.ts`.** Every input the matrix generates has a form, its parameter annotated or not as
  the case's other parameters are.
- **`examples/stocktake/stocktake.ts`** exports its `counts`, so that the check reaches them.

## Part 1: the form of a value

Each point the roadmap asked the spike to decide.

**Its name.** The spike wrote `store`, as the roadmap did. It reads as what the library does with the value, which is
the guide's own verb ("the library stores what is written"). As a noun, the guide has it for React's store alone: the
store of the children is a word of the records. Weighed, not written:

- `normalize`, the name that `docs/rejected.md` gave it on 18 November 2026. It says that the result is a normal form,
  so that the function is idempotent, which the library does not need (below).
- `form`, the guide's word in "What is typed, in another form". It reads as a noun, and the first example of an input
  is a form.
- `stored`, which reads well with its parameter, `stored: (written) => …`, and badly beside `set`.

**Whether it may read the state.** Reasoned, not run: it should not. A form `(value, state) => value` still returns the
value alone, so it changes nothing else. But it decides on a write by the state, which is what the guide says an input
does not do. `store: (value, state) => state.locked ? state.note : value` is a lock that no `get` shows and that no
test of the model sees: `dispatchViolations` reports as `Rejected` a write that a model holds and that has no place,
and this write has its place, is accepted, and does nothing. The case the roadmap names, a maximum that the state
holds, has three ways already: the element's own `max`, a parse where the value is read, and an `update` that leaves
the value in range when the maximum changes, which a form could not do. A second parameter can be added later without
a break. Taken away later, it breaks.

**A write whose stored form is equal to the value held.** Run. It leaves the very same state, so it makes no model and
no notice (`src/spike-store.test.ts`). The element is still given its value back, by both bridges
(`bridges/bridge.test_suite.ts`, "a key whose stored form is the value held makes no new state, and the element is given
its value back"): a bridge draws after every message that its view sends, whether or not the state changed, as it does
after a write that is rejected. No line of a bridge changed. With the `set` of 0.8.0 the same key makes a new state,
equal to the old one (run, by a scratch probe that is not kept), and so a notice: the form apart makes fewer models.

**What the types infer.** Run with TypeScript 5.9, 6.0 and 7.0, which agree:

- With `at`, the parameter of the form needs no annotation, wherever the form stands, for `input` and `inputById`.
- With `get` and `set`, it needs none where the form stands after `get`. Before `get`, the value's type is not known
  yet, and the parameter is `unknown`. This is the limit that a `set` written before its `get` has on `main` today
  (`src/spike-order.test.ts`).
- A form that returns another type than the place's does not compile.
- The messages of a program with such inputs are inferred as before.
- The inference matrix, with a form in every input it generates: no lead in 56,351 cases, with TypeScript 5.9.3, 6.0.3
  and 7.0.2 under `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and with 7.0.2 without
  `exactOptionalPropertyTypes`. The other eight of its twelve configurations were not run: one takes from two to
  fourteen minutes.

**A form that is not idempotent.** Run, with `store: (note) => note + '!'`. The behaviour is defined: each write stores
the form of what is written. The same write sent twice from one model does not act twice, since the form reads the
value alone: `dispatchViolations` reports no `ActsTwice`. So the form needs no law. One promise of the guide changes
its words: "a value equal, by `Equal`, to the one the place holds leaves the very same state" becomes a value whose
stored form is equal. Without a form it is the same promise.

**Where the form runs.** In `update`, after `get` gave `Some`: a write with no place is rejected before the form is
called. It is called once a write. A throw is a defect in `'update'`, as for a `get` and a `set`. It is pure, as they
are.

**What it takes back.** "A `set` may store another value than the one written" ("Inputs", "What is typed, in another
form"), a promise of 0.8.0. A `set` then stores exactly what it is given, for every place. Nothing refuses a `set`
that still changes the form: the write is stored, and `placeViolations` reports `StoresAnother` in a test. To upgrade,
the change of the form moves from `set` into `store`, and a place that was written by hand only for it becomes its
optic again.

**Weighed, and not advised: a defect on each write.** The run could compare `get` after `set` with the value given,
and die where they differ. It would hold the second law alone, at the cost of a `get` and an `Equal` on every key, and
it would not see a `set` that changes more than its place, which is the rule this step is about. A defect as the
program is made sees the first state alone ([`given-functions.md`](given-functions.md)).

## Part 2: a check of a place's laws

```ts
expect(placeViolations(counts, { states, ids: ["a", "b", "missing"], values: ["", "3", "x"] })).toEqual([])
```

**How it is given a place.** By what `input` or `inputById` returns, which has `kind`, `get` and `set`. So a program
declares the input beside `make`, as the guide says already for a model that reads the place, and exports it for its
test: the stock-take's `counts` is exported on the branch. An input declared inside `make` cannot be reached. That
is no loss for an optic composed of Effect's own, which keeps the laws by construction.

**What it checks**, in each state and at each id where `get` gives `Some`. It checks nothing where `get` gives `None`,
since the library calls no `set` there. Each violation has the state, the id for inputs by id, and the values:

| `_tag`           | The check                                                                           | A `set` that fails it                                                                     |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Changes`        | A `set` of the value that `get` gives leaves an equal state.                        | Marks the state at each write. Counts the writes. Writes every row.                       |
| `StoresAnother`  | After a `set` of a value, `get` gives that value.                                   | Writes another row. Stores another form. Its `get` reads another place.                   |
| `Remembers`      | A `set` of a value, then of another, leaves the state that the second alone leaves. | Keeps the value that was there. Marks the state only on another value. Counts the writes. |
| `ReachesAnother` | A `set` at an id leaves what `get` gives at each other id given. Inputs by id only. | Writes every row, in a state whose rows hold one value.                                   |

The names are the spike's, for what the `set` does wrong, as `Rejected`, `ActsTwice` and `Missing` are. States and
values are compared with `Equal`, as `dispatchViolations` compares them.

**The value held is a second write.** For `Remembers`, the second value is each value given, and the value held too. A
`set` that marks the state only where the value differs, `dirty: state.dirty || note !== state.note`, passes the three
laws on any values that do not hold the value held: it is found by writing back what was there. A test would not think
of giving that value, so the check adds it.

**The fourth check.** The three laws say that a `set` changes its place alone, over all states. Over the states that a
test gives, a `set` that writes every row passes all three where the rows hold one value: there it is a lawful lens
onto that value. The state a test writes first, an empty sheet, is such a state. `ReachesAnother` finds it, by reading
`get` at the other ids given. On rows that hold different values `Changes` finds it too.

**An optic made by hand.** `input({ at })` over an optic made with `Optic.makeLens` whose `replace` does more is found
as a `set` is: the check is given the input, whatever its place was written as. No second way is needed.

**How the ids are drawn.** The test gives them, as it gives the states and the values, and may name one that is no
row's: it is skipped where `get` gives `None`. An `at` of an id runs in each `get` and `set`, so it is checked with
them.

**The types.** `State`, `A` and `Id` are inferred from the input alone (`NoInfer` on the options). Without it, a state
written as a literal is widened, `_tag: string`, and the call does not compile.

**What it lets pass.** It is a check and no proof, as `dispatchViolations` is:

- a `set` that breaks a law only in a state, at an id or for a value that the test did not give;
- a call in which no state has the place at any id: it checks nothing and returns no violation. To decide, below;
- a `get` or a `set` that is not pure, which is an axiom.

**The stock-take's `counts` pass**, over sheets open, open with an error, locked, and not loaded.

**Without part 1.** A `set` that stores capitals fails `StoresAnother` alone, and passes on values that are their own
form. So with the exception of 0.8.0 kept, the check would take the form as an option, and a test would state it a
second time.

## What was run

On the branch: `typecheck`, `lint`, `test` (1077), `test:node` (846), `interleavings` (22 properties), and
`inference` in the four configurations above. The bridges' tests run on happy-dom. Not run: `mutations` (the mutation
of `written` no longer matches its text, and a step that takes part 1 updates it and adds one for the form), `smoke`,
`api`, `comments`, the site's build, and a real browser: where the caret goes after a key whose form differs is the
browser's, as before.

## What the guide would say

Each by the rule of `AGENTS.md`: one section at a time, checked against the code.

- **"Inputs", "Rules".** "A `set` changes its place, and nothing else" loses its exception. A new rule says that the
  form of a value is a field of the input, a function of the value alone. "The library stores what is written,
  whatever it is" says: in the form that the input declares. Its second sentence says: a value whose stored form is
  equal to the one held.
- **"Inputs", "What is typed, in another form".** The third way is the field, on an optic. What it says of the caret
  stays.
- **"Guarantees".** "An input stores what is written, where its place is there" names the form. In "What is left to
  you", the rule of a `set` moves to what a test checks, and the item on what is pure names the form.
- **"Testing tools"** and **"Testing"**: `placeViolations`, beside `dispatchViolations`.
- **"Composition"**, "The parent's inputs" and "The rule of an input": the form.
- **The skill**: the rule of a `set` moves from "Rules that nothing checks" to "Rules that a test checks".
- **The doc comments** of `Written`, `Input`, `InputById`, `input` and `inputById`, and of the new exports.
- **The changelog**: `**Breaking**:` a `set` no longer stores another form; a field `store`; `placeViolations`.

Besides: `docs/invariants.md` on the rule of a write, a mutation for the form, the smoke test's consumer, the reports
of the API, a dimension of the inference matrix, and the export of the stock-take's `counts` with a test of it.

## What it reverses in `rejected.md`

- **"A value changed as the library stores it"** ends: "Whether `normalize` as an option of `input` earns a place is not
  reopened, since a `set` does it." Part 1 reopens it, for the reason that entry did not have: a `set` that does it
  cannot be told from a `set` that does more. It is a field of a declaration, not a function of the library's.
- **"A place as an optic alone"** names this step as what was taken in its place: it gets the outcome.

## What is left for the owner to decide

1. **Part 1: take the form as a field, or keep the exception of 0.8.0.** Advised: take it. With it, "a `set` stores
   exactly what it is given" has no exception, and an input on a plain field keeps its optic.
2. **Its name.** Advised: `store`.
3. **Whether the form reads the state.** Advised: the value alone.
4. **Part 2: take `placeViolations`, or leave the rule of a `set` to the user.** Advised: take it, with part 1. It is
   the one place where the rule of a `set` is applied, and it found each broken `set` above.
5. **The fourth check, `ReachesAnother`.** Advised: keep it. Without it, the most likely first test, on an empty sheet,
   passes a `set` that writes every row.
6. **A call that checks nothing.** Advised: return no violation, as `dispatchViolations` does for no message held, and
   say in the guide that a test gives at least one state where the place is there. The other way is a failure of the
   call, which no other tool of `./testing` has for an empty input.
7. **The names** `placeViolations`, `Changes`, `StoresAnother`, `Remembers`, `ReachesAnother`.

If taken, one step for `ROADMAP.md`, for Opus 5.5, `high` (`change-api`): the two parts in one change, since the rule
of a `set` is stated once, without its exception and with what checks it, and one release takes what breaks.

## Decided

By the owner, 22 November 2026, each as advised:

1. **Part 1 is taken.** The form of a value is a field of `input` and of `inputById`, and "a `set` may store another
   value than the one written" is taken back.
2. **Its name is `store`.**
3. **It is given the value alone**, never the state.
4. **Part 2 is taken**: `placeViolations`, in `./testing`.
5. **With the fourth check**, `ReachesAnother`.
6. **A call that checks nothing returns no violation**, and the guide says that a test gives at least one state where
   the place is there.
7. **The names stay**: `placeViolations`, `Changes`, `StoresAnother`, `Remembers`, `ReachesAnother`.

It is step 37 of `ROADMAP.md`, in two stages where the advice above was one change: the form first, then the check.
Each fits one session and leaves every check green, and one release takes both. After the first, the rule of a `set`
has no exception, and is still left to the user until the second.
