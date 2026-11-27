# What an application's move to 0.10.0 found

**Status:** weighed on 27 November 2026, at commit `bc850fb`, by a session of Fable 5.2 that the owner asked to weigh
a report. Steps 111 to 113 of [`ROADMAP.md`](../../ROADMAP.md) come from it, with four entries of
[`rejected.md`](../rejected.md). Nothing of the library, of the guide or of the examples was changed. Each step
decides its point, by "Deciding" in [`AGENTS.md`](../../AGENTS.md).

## Where the report came from

The application of [`application-report-0.9.md`](application-report-0.9.md), on React Native, was moved from 0.9.0 to
0.10.0 by a coding agent, which read the package as it is installed. Of its five requests of 0.9.0, four were taken
and used, and the guide answered the fifth. Its report found no bug. This session read each point against the guide,
the code and `rejected.md`, read the application's code where the report speaks of it, and ran one probe, a throwaway
file under `examples/`. Each point is weighed on the library's own terms: what one application uses decides nothing.

## In short

- **No point is a bug of the engine.** One is not the library's (2).
- **One is of the types as they print** (1), **one of the examples** (10), and **six of the guide, the doc comments
  and the changelog** (3 to 8), each in part.
- **What the report asks beyond that is left**, each request by a precedent or by a rule of `AGENTS.md`: of points 3,
  5, 6 and 7, and points 9 and 11 whole.
- **Three rules were questioned, and stand**: a child answers its external messages in every state (6), a child that
  may not be there is read as an `Option` (5), and a message of a view names an instance only where its dispatch is
  given one (7). No premise is touched.

## The points

1. **The error of `child` given flags that it does not take.** True. `flags` that give an `Option` of the child's
   flags, the form of 0.9.0, print `TS2769`, "The last overload gave the following error", and that the function "is
   not assignable to type 'never'": the compiler reports the overload that takes no `flags`. A wrong `there` prints
   the right line, since the last overload is its own. Whoever writes `flags` for a child that may not be there meets
   it, not only an upgrade. Step 111.
2. **The error of `hear` given a key.** Not the library's: it is `TS2353`, one line, which says that a function is
   wanted. The union of keys that the report saw is printed by a function of the application's tests, which wraps
   `hear`.
3. **bun installs an Effect below the peer range, with no warning.** True, and found twice: the check of step 109 met
   it too. The entry of the peer range is the last of the breaking ones. A check of Effect's version by the library is
   rejected. Step 113 puts such an entry first.
4. **A change that the compiler does not find.** An `Option` is flags too where they are typed `unknown`, and
   `stateOf` changed its order where every test of the application passed. Both are defined, and the changelog says
   both. What is missing is how to find the places. Step 113.
5. **One reading of a child declared with `there`.** Its model, its output and its instance are three `Option`s of one
   fact. `Opt.all` makes one of them. Where a case of the parent's state goes with the child, the parent writes a
   defect that no state reaches. A reading that throws is rejected: it would compile and then die where the `Option`
   refuses. Step 113 says the advice.
6. **A message down a chain of children.** A back button goes from the root to a page and to a list: each level
   writes an `output` that joins its child's, an `external` that passes the press on, and a defect where it is told
   what its output ruled out. Which child takes the press, and in what order, is the logic of each parent. A route that
   a declaration gives, and a `reject` in `external`, are rejected. But the three defects rest on what the guide does
   not say: "Rejections and defects" says that nothing else makes a message unable to arrive. Step 113.
7. **A function of the tests that wraps as `forwardTo` does.** No new fact for its entry. The number that a test made
   up, for a child that is not there, is avoided: such a message names no instance. "Testing" led to it. Step 113.
8. **A `Step` whose lists are always there.** `applyAll` takes `external` as it takes `update`, and gives both lists.
   No page says so. Step 113.
9. **A `tell` made in a `Match` loses its tags.** TypeScript widens the literal that a branch returns. Where the tags
   of the state are the children's names, `{ _tag: page._tag, message }` compiles with no annotation. Nothing of the
   library, as point 1 of the report on 0.9.0.
10. **The advice of "Composition" has no code.** True: no example reads `children.X.instance()`, and none gives the
    number to React as a `key`. It waited in "Any time" for an application's report. Step 112, whose example also
    shows a child declared with `there` and a back button. Nothing of the report ran on a device.
11. **The compiler's error beside each `Upgrade:`.** Rejected: step 111 makes the error say it.

## What the probe found

A file of [`pages`](../../examples/pages/app.ts), compiled with `tsc -p examples`, and deleted.

- `child(About.about, { flags: (state) => state.about })` prints the error of point 1. `{ there: () => true }`
  prints "Type 'boolean' is not assignable to type 'Option<…>'".
- `rehearsal.hear({ _tag: 'Clock', instance: 1, key: 'ticks' }, message)` prints the one line of point 2.
- `applyAll(stopwatch.external, [{ _tag: 'Halted' }], state)` compiles, and its `commands` and `events` are arrays.
- A `tell` whose item is a `Match.valueTags` of two branches does not compile, with `_tag: string`. The item
  `{ _tag: state.page._tag, message: { _tag: 'Halted' } }` compiles.
