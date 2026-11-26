# A `Child` and a `ChildById` made only by `child` and `childById`

**Status:** decided on 26 November 2026, as step 105 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Each claim is **run**, by a test that the text names, or
**reasoned**.

## The question

A `Child` and a `ChildById` had their declaration as members: `_tag`, `program`, `there` and `key`, or `listed` and
`flagged`. A program could write one, and the types took it. `{ _tag: 'Child', program: leaf, there: 'always', key:
(state) => state.on ? Opt.some(undefined) : Opt.none() }`, typed `Child<Own, Leaf, 'always'>` and given to
`withChildren`, compiled with no cast, and `children.Liar()` in `makeModel`, typed as a model, threw a
`CompositionDefect` that none of its four cases named. Children by id said to be listed without flags, for a program of
flags, compiled too, and started each child from no flags, in silence. It broke "No broken combination can" ("What
belongs here").

## Decided

**`Child` and `ChildById` are classes whose constructor is private, with one member, `protected` and typed alone. What
`child` and `childById` made is kept by the library, in a `WeakMap` of the object they made, and `make` reads it
there.**

- **Refused by the types** (reasoned, value 2). An object written with the members of a declaration, one that writes
  the member itself, a spread of a real child, a `new` and a class that extends one do not compile: a `protected`
  member is told by the class that declares it, not by its shape, as `CompositionDefect` refuses a `new` (**run**: "a
  child alone is made only by child, and children by id only by childById", and the smoke test's consumer).
- **What the types cannot refuse is a defect as the parent is made** (value 2). `Object.assign({}, child(p))` is typed
  as the child it copies, and makes a plain object: it has no declaration in the `WeakMap`, and `make` throws a
  `CompositionDefect` that names it, the fifth case of its doc comment (**run**: "a child that child or childById did
  not make, as a copy of one, is a CompositionDefect as its parent is made"). A `WeakMap`, and not a `#private` field:
  the class stays empty, and holds nothing that a copy could take.
- **`There` and `Id` are invariant** (`in out`, value 1). Covariant, `There` let a child always there be typed as one
  that may not be, whose model then read as an `Option` and was not one; contravariant, `Id` let children by id be
  typed with fewer ids than theirs, which their messages carry. Both refusals are in the test above.
- **Not a member under a string key alone**, which the step first took (reasoned, value 2): a program that wrote the
  key made the very lie of the question. Nor a `unique symbol` that the package does not export: the report of the API
  refuses one, which a consumer's declarations could not spell out.
- **What it costs** (reasoned, value 5). `child` and `childById` make an instance through a cast, as
  `compositionDefect` does. The two are nominal: two copies of the package do not mix their children, as they do not
  mix their defects. The index exports them as types, so a program reaches the constructor only through an `any`, as
  `always.constructor`: what a parent does then is unspecified, as the doc comment of `CompositionDefect` says of a
  cast or an `any`.
- **The types of a parent read the classes' parameters.** Their constraint takes any program, which `child` and
  `childById` checked, and `ChildById<…, never, …>` beside `ChildById<…, any, …>`: an invariant `any` fits every id but
  `never`, which `ids: () => []` gives (**run**: the typecheck of `src/run.test.ts`).
- **One member's name for both**, `~@fgaudo/effect-tea/Child/declaration`, as `Child` is the concept that both
  declare: a `protected` member of one class is never that of the other. Its type is a type alias of the module's own,
  `ChildDeclaration` and `ChildByIdDeclaration`, which the report of the API spells out. Each refusal above has a
  mutation, killed by its test.
- **Breaking**, for a program that wrote, copied or read a `Child` or a `ChildById`, or typed one with another `There`
  or `Id`; the changelog says it. None of the examples or the tools did.
