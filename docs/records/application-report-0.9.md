# What an application's rewrite on 0.9.0 found

**Status:** weighed on 26 November 2026, at commit `c0a3341`, by a session of Fable 5.2 that the owner asked to weigh
a report. Steps 91 to 98 of [`ROADMAP.md`](../../ROADMAP.md) come from it, with a lead of its "Open problems" and an
entry of "Parked, not rejected" in [`rejected.md`](../rejected.md). Nothing of the library, of the guide or of the
examples was changed. Each step decides its point, by "Deciding" in [`AGENTS.md`](../../AGENTS.md).

## Where the report came from

An application on React Native, of nine programs under one root, was written again on 0.9.0 by coding agents, which
read the package as it is installed. Its report listed ten points, and found no bug: the notes of "Upgrade" in the
changelog were exact. This session read each point against the guide, the code and `rejected.md`, as
[`application-report.md`](application-report.md) did for 0.8.0, and ran one probe, a throwaway file under `examples/`.
Each point is weighed on the library's own terms: what one application uses decides nothing.

## In short

- **No point is a misreading**, and none is a bug of the engine.
- **One point is of correctness** (3): a message of a view reaches an instance that it was not drawn for, and on a
  renderer that draws late a user's tap does it, not only a script.
- **Four are of the form of the API** (1, 4, 5, and 8 as it prints), **three of the testing tools** (6), and the rest
  of the guide.
- **Five are left as they are**, each by a precedent or by the guide, with no new fact.

## The points

1. **`Outputs` and `Tells` are not exported**, so a parent's handler written outside `make` declares by hand what it
   takes and what it tells. True: both are types of `compose.ts` that the module keeps. "Structuring a program" advises
   a program split by concern, each part asked for a `Step`, and a parent cannot follow it with the package's names.
   Step 97, after the steps that change those types. What `Match.typeTags` takes is a form of the program, and
   nothing of the library.
2. **A declared `tell` gives one message.** Parked. A declared `tell` is a condition, one value compared with `Equal`
   ([`condition-down.md`](condition-down.md)), and a message with a field for each fact says it at no cost. A list
   would keep what each child was last told by item, for one application's case.
3. **A message of a view names no instance.** True, and the guide says so ("Composition", "Ids that come back": use
   ids that are never reused). The engine already rejects a child's message that names an instance no longer there,
   and the type of a child's message already has `instance`: what is missing is how a view comes to know it. The new
   fact is the renderer that draws late, where the rule of a bridge, each state drawn before the next event, cannot
   be kept. Step 92.
4. **A child with flags is always an `Option`**, also where its parent's state always gives its flags, so a parent
   writes a defect that no state reaches. True: `child(program, { flags })` is `'sometimes'` by construction. Not
   weighed before. Step 94.
5. **A parent's `subscriptions` is given no output of its children**, where its `update`, `external`, `onEvent`,
   `makeModel` and `output` are. True, and no precedent says why. The case is a key that the parent lists only while a
   child says it has something to go back to. Step 95.
6. **The testing tools, on a parent.**
   - Nothing shows what a step tells: a parent's `update` gives its children's steps, and a test reads what was told
     from the child's state, or from a command of the child. Step 93.
   - `stateOf` puts a child in the state given for it after it has told the child, so it makes states that the
     declared `tell` would not leave, which "Guarantees" leaves to the user ("A state that starts a program
     elsewhere"). Step 93. It numbers the instances as a start does, which a run that reached that state need not:
     as designed, and the guide does not say it. Step 91.
   - `hear` and `hearNext` take a whole key, with its instance, where `run` takes a predicate. True: one role in two
     forms. Step 98.
   - A tap from a model that the state has moved past is no gap: "Testing tools" sends it to `applyAll`, or to
     `update` itself, with the state that `rehearsal.state` gives.
7. **The bridge to React, on React Native.**
   - `Host` starts again from `init` where Android makes the activity anew. `Host` says it of any remount, and the
     guide does not name the case. The application left `uiMode` out of its manifest's `configChanges`, so a change
     of theme makes its activity anew; that a change of the font's size does so with the template's manifest was
     reported and not run. Advice, in step 91.
   - A view that throws under `Draw` is an error of the application, as under `Host`, whose comment alone says it.
     Step 91.
   - A `messagesSentBy` for React was decided against twice, the second time after a spike (`rejected.md`, "The
     bridges"). No new fact.
8. **A type error of 967 KB.** Reproduced on the examples: the lead of "Open problems" in `ROADMAP.md` holds its case.
   The types that a parent's keys, messages and state are named by print the declarations of its children, and each
   holds its child's whole program. With the compiler's default it is cut to 1.4 KB, and says nothing of use but its
   last line. Step 96.
9. **The guide.**
   - That a declared `tell` tells again only a value that is another, by `Equal`, is what the code does and what no
     page says: "was last told" was read as "told after each step" by two agents. Step 91, as a promise.
   - An element that is not controlled shows what it holds, not the model: the application's choice, and a line of
     "What is left out". Step 91.
10. **Smaller, and left.** `init` as a value or a function was weighed twice (`rejected.md`, "The `init` of a parent
    without flags"). `inert` repeats a rule of `update` because a test says what is meant apart from the program;
    where it costs, the program exports the condition that both call. A program whose model holds no message has
    nothing for `dispatchViolations` to check, and does not call it.

## What the probe found

A parent of [`pages`](../../examples/pages/app.ts), [`list`](../../examples/list/list.ts) and
[`cart`](../../examples/cart/cart.ts), seven programs in all, with the report's mistake: an `Option` given to
`Arr.filterMap`, which takes a `Result`, over the keys of the root. One error, TS2375, in three lines: 1,459 bytes as
the compiler cuts it, and 62,010 with `--noErrorTruncation`, where `Program<{` is printed 54 times. Each level prints
its children's declarations in its state, its messages and its keys, so the size grows with the depth of the tree.
