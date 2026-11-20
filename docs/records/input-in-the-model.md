# An input in the model: an entry, which a view writes through

**Status:** rejected by the owner, 20 November 2026, on the spike this file records: stage 4 of
[`synchronous-dispatch.md`](synchronous-dispatch.md) does not take it, its views write `Written` by hand, and
[`rejected.md`](../rejected.md) has the entry, "An entry of each input in the model, which a view writes through", with
what would reopen it. The spike is of the same day, by a session of Opus 5.5, briefed by the session that runs that
plan, whose R4 it is. On the branch `claude/spike-input-in-model`, cut from `bb253e0` (stages 0 to 3 committed), never
to be merged. Read against the code at `bb253e0`. What follows is as it was written before the decision.

What was run is marked **run**; what was read in code or documentation, **checked**; what was only argued,
**reasoned**.

**Read by the session that briefed it** (Fable 5.2), the same day, at `17534ff`, and brought to `main` as it was
written: its links to `src/next/entry.ts` and to `examples/spike-entry/` are to files of its branch. Run again there:
`typecheck`, `lint`, `test` (1,330) and `test:node` (995) pass. That session's advice to the owner is not to take it in
stage 4, for the reasons of "The case against it", and for one more: the cache of the entries is looked up, by `Hash`
and `Equal`, for each input in every `makeModel`, which now runs in the event that sends the message, and with React
for every state (`ROADMAP.md`, the sixth point of the review of the design).

## The question

After stages 1 to 3, a view draws a controlled element and builds each write by hand:
`forwardTo(dispatch, 'Name')({ _tag: 'Written', was: model.name, value })`. Three things are then left to whoever
writes the model and the view: that the write is over the value the model holds (`was`); that it goes to the input
that value came from (its name, and the id of an input by id); and that the model shows an editor only where a write
has a place. The idea, from the plan's R4: the model holds, for each input, a value that the library makes, with what
it shows and what a write needs, and the view writes `dispatch(write(model.name, text))` with the program's own
dispatch.

It reopens "Handles of the inputs in `makeModel`" of [`rejected.md`](../rejected.md), which weighed this value and did
not propose it, "at the cost of a type of the library's in every model, of `forwardTo` and of both bridges". Its
"Reopen if" (a program that cannot name the `get` of its place, or the parked "What reaches `update`, declared as
data") is not met: the plan reopened it, since no bridge settles an element any more, so "both bridges" is no cost now.

## The form chosen

**An `Entry<A, Name, Id>`, which `make` gives `makeModel` for each input it declares, and `write`, which makes the
write of a value through it.**

```ts
type Entry<A, Name extends string, Id = never> = {
  readonly value: A // what the view shows
  readonly ["~@fgaudo/effect-tea/Entry/route"]: Readonly<{ name: Name; id?: Id }> // what a write needs
}

declare const write: <A, Name extends string, Id = never>(
  entry: Entry<A, Name, Id>,
  value: NoInfer<A>
) => WriteOf<A, Name, Id>
// WriteOf: { _tag: Name, message: Written<A> }, or { _tag: Name, id: Id, message: Written<A> } for an input by id

makeModel: (state, children, inputs) => …
// inputs.Name(state): Option<Entry<string, 'Name'>>
// inputs.Count(state, id): Option<Entry<string, 'Count', string>>
```

The code is [`src/next/entry.ts`](../../src/next/entry.ts), and the one change of
[`src/compose.ts`](../../src/compose.ts): `makeModel` takes a third parameter, `inputs`, which `make` builds once for
each program from the `inputs` it is given.

What each decision was, and why:

- **What it holds, and what it hides.** `value`, public: the view shows it, and a test reads it. The route, the
  input's name and the id of an input by id, under a key of the library's: what a write needs and no view reads. The
  value the write is over, `was`, is `value` itself: there is nothing else to hold. The key is a string, as `Shown`'s
  is: a `unique symbol` that is not exported would make a consumer's declarations of a model that holds an entry
  fail to emit.
- **Plain data.** An entry is a frozen plain object, so `Equal` compares two by their value and their route (Effect's
  documentation of `Equal.equals`: plain objects compare their enumerable keys, recursively). Two equal states give
  equal models: the form's test of it passes unchanged. A model is no longer only what the view draws: it holds what a
  write needs, which a `toEqual` of a model prints.
- **The same object while an equal one is held.** Without that, every `makeModel` makes a new entry, and a snabbdom
  `thunk` or a React `memo` that compares an entry by identity draws again on every new state, where today it compares
  the value itself, a string, and skips. So an entry is kept as `forwardTo` keeps a dispatch: by its input, its id and
  its value, compared by `Equal` and hashed by `Hash`, held by a `WeakRef`, and forgotten with a
  `FinalizationRegistry` once nobody holds it. Taken out, two tests fail (below). A value equal to the one kept but not
  the same object gives the entry of the first one, whose `value` is that first object: equal by `Equal`, which is what
  the rule of an input compares.
- **Who makes it.** `make`, from the inputs it declares: the name is the key of `inputs`, so it is said once, and no
  other record of inputs can be given. A function of the library that a user calls on the record, beside `make`, lost
  to it (below).
- **An input by id** carries its id in the route, and `write` puts it in the message.
- **A child's input.** A child's `makeModel` is given its own entries, whose route is the child's. The parent's view
  gives the child's view `forwardTo(dispatch, 'Child')`, as for any message of the child, and the child's view calls
  `dispatch(write(model.text, value))` with it. Nothing is new for a child.
- **A place that is not there.** The handle gives `None`: an input alone on an optic that focuses nothing, an input by
  id whose row is gone, a row locked as a case of the state. So a model that draws an editor from an entry draws one
  only where a write has a place. For an input on a lens, which always focuses, the handle gives `Some` always, and the
  form matches a `None` that cannot happen (below, "The case against it").

### A handler, before and after

Before, the form's view in `bridges/next/snabbdom.test.ts`, written as stage 3 left a view:

```ts
h("input", {
  props: { value: model.name, disabled: editor._tag === "Saving", placeholder: "A name" },
  on: {
    input: (event: Event) =>
      forwardTo(dispatch, "Name")({ _tag: "Written", was: model.name, value: (event.target as HTMLInputElement).value })
  }
})
```

After, [`examples/spike-entry/form/view-snabbdom.ts`](../../examples/spike-entry/form/view-snabbdom.ts):

```ts
editor._tag === "Saving"
  ? h("input", { props: { value: editor.name, disabled: true, placeholder: "A name" } })
  : h("input", {
    props: { value: editor.name.value, disabled: false, placeholder: "A name" },
    on: { input: (event: Event) => dispatch(write(editor.name, text(event))) }
  })
```

With React, [`view-react.tsx`](../../examples/spike-entry/form/view-react.tsx):
`<input value={editor.name.value} onChange={(event) => dispatch(write(editor.name, event.target.value))} />`. An item
of the stock-take is drawn with the sheet's own dispatch: `dispatch(write(entry.count, text(event)))`, where the view
passed `forwardTo(dispatch, 'Count', id)` to each item before.

The form's model holds the entry only where there is something to type into:

```ts
makeModel: (state, _children, inputs) => ({
  editor: Opt.match(state.save._tag === "Saving" ? Opt.none() : inputs.Name(state), {
    onNone: () => Editor.Saving({ name: state.name }),
    onSome: (name) => isBlank(name.value) ? Editor.Blank({ name }) : Editor.Named({ name, save: Own.SaveClicked() })
  }),
  …
})
```

### A test's write, before and after

Before, `examples/form/form.test.ts`:

```ts
const typing = (model: Model, text: string): Message => ({
  _tag: "Name",
  message: { _tag: "Written", was: model.name, value: text }
})
```

After, [`examples/spike-entry/form/form.test.ts`](../../examples/spike-entry/form/form.test.ts):

```ts
const typing = (model: Model, text: string): Opt.Option<Message> => Opt.map(entryOf(model), (name) => write(name, text))
```

A test writes as the view does, through the model it read. Where the old test wrote into a state whose model it had
not made (the stock-take's `simulate`, from the start, of writes that apply once the sheet is loaded), the new one
makes the model of the state the writes arrive in: `typing(stocktake.makeModel(loaded), "i1", "10")`.

### The form that lost: a function of the record of inputs, beside `make`

`const entries = entriesOf(inputs)`, called by the user on the record that `make` is given too, and read in `makeModel`.
It is additive: `compose.ts` would not change. It lost on the second rule of the types (`AGENTS.md`, "The types of a
program keep three rules"): nothing ties the record given to it to the one given to `make`. A record that declares
`Name` at another place, of the same type, gives entries whose writes compile as the program's, and are stored at the
place `make` was given, over a value read from another. It also costs a declaration more for every program with an
input. Not built.

### Variants weighed and not built

- **An entry, not an `Option`, for an input on a lens.** The form would hold `Entry<string, 'Name'>`, with no `None`
  to match. The handle would have to know, as it runs, whether the optic is a lens. The types can tell (an overload of
  `input` on `Optic.Lens`), but the code cannot: Effect documents no way to tell a lens from an optional (no
  `Optic.isLens` in `Optic.d.ts`, **checked**), and what tells them apart in its source (a `get` on the class of a lens)
  is not documented, so it would be a new premise. Or the user would declare it otherwise, an option for what the optic
  says.
- **The entries in the `children` of `makeModel`**, one record of handles, since no input may take a child's name. It
  saves the `_children` of a program without children, and names inputs "children". Not built: a point for the owner.
- **A `Written` that only `write` makes**, hidden as the route is. Then no view could build a write, and "never builds
  a message itself" would hold for writes. Not built: a test of what the model leaves out (`Missing`) gives
  `dispatchViolations` a write into a count drawn read-only, which has no entry, so it builds that write by hand
  (below). A testing tool that makes such writes would be needed first.

## What was built

On the branch, with nothing added to the indexes:

- [`src/next/entry.ts`](../../src/next/entry.ts): `Entry`, `WriteOf`, `write`, `Entries` (the type of the third
  parameter, unexported as `Models` is), `entriesOf` (what `make` calls), and `keptOf`, for the test of the cache.
- **`src/compose.ts`, changed**, the one file that exists and changed: `Config`'s `makeModel` takes
  `inputs: Entries<State, I>`, and `make` builds it once and passes it. It cannot be additive: the handles are named by
  the keys of the `inputs` that `make` alone is given, and a wrapper of `make` would restate its types. Every program
  that exists ignores the parameter.
- [`src/next/entry.test.ts`](../../src/next/entry.test.ts), 13 tests: a write alone and by id, an entry exactly where
  the input has a place (an optional, a row gone, a locked case), stored and rejected writes, a child's entry through
  `forwardTo`, the cache (equal, the same object, two ids, two inputs of one value, forgotten once nobody holds it),
  and the types.
- [`examples/spike-entry/form/`](../../examples/spike-entry/form): the program, with `update` and its command from
  `examples/form/form.ts`; the views for both bridges of `bridges/next/`; its tests, ported (16); and
  [`dom.test.ts`](../../examples/spike-entry/form/dom.test.ts), the form drawn by each bridge in happy-dom, typed into
  twice, saved and emptied, in the same element. That file registers a DOM, which `AGENTS.md` keeps to the bridges'
  tests: a test of the spike's own.
- [`examples/spike-entry/stocktake/`](../../examples/spike-entry/stocktake): `stocktake.ts` copied, with only
  `makeModel` and the model's types changed (a `diff` with `examples/stocktake/stocktake.ts` shows eleven lines), its
  view for the snabbdom bridge, and its tests, copied and ported (19).

## What was run, checked and reasoned

**Run**, on Bun 1.4.5 and Node (Windows), Effect 4.1.4:

- `bun run typecheck` and `bun run lint` pass; `bun run test`: 1,330 pass, 0 fail; `bun run test:node`: 995 pass,
  0 fail.
- **Each check taken out by hand**, one at a time, with the tests named run under it (a script of the session, outside
  git):

  | Check taken out                                      | Tests that fail                                 |
  | ---------------------------------------------------- | ----------------------------------------------- |
  | `write` drops the id                                 | twelve: the write by id, the typed counts       |
  | `write` over the value written, not the value shown  | twenty-two                                      |
  | an entry where the input has no place                | four: the place, the lock, the counts, rehearse |
  | the cache (a new entry each time)                    | two: the same object, an equal name's entry     |
  | the cache keyed without the id                       | three: two rows of one value took one route     |
  | one cache for every input                            | two: two inputs of one value                    |
  | the cleanup of the cache                             | one: forgotten once nobody holds it             |
  | the form's view writes by hand, over another value   | one: the view writes through its entry          |
  | the stock-take's view writes by hand, to another id  | one: the same                                   |
  | the stock-take draws read-only where it has an entry | twelve, among them the test of `Missing`        |
  | the form's view, with snabbdom, draws another value  | one: the test in a DOM                          |
  | the form's view, with React, draws another value     | one: the test in a DOM                          |

  The cache keyed without the id is a bug of its own, found there: two rows whose counts are equal got one entry, so a
  write into the second went to the first.
- **The declarations**, emitted by hand (`tsc` with `emitDeclarationOnly`, outside git) of the spike's form and of a
  program whose model is inferred. Of the form, whose `Editor` names the type:

  ```ts
  export declare const form: import("@fgaudo/effect-tea").Program<{
      state: Readonly<{ name: string; save: Save; saved: ReadonlyArray<string>; }>;
      model: {
          editor: {
              readonly _tag: "Blank";
              readonly name: Entry<string, "Name">;
          } | {
              readonly _tag: "Named";
              readonly name: Entry<string, "Name">;
              readonly save: Own;
          } | {
              readonly _tag: "Saving";
              readonly name: string;
          };
          …
  ```

  Of a model inferred from `makeModel`, `{ name: inputs.Name(state), rows: state.rows.map((row) => inputs.Count(state,
  row.id)) }`:

  ```ts
  model: {
      name: Opt.Option<import("../../src/next/entry").Entry<string, "Name", never>>;
      rows: Opt.Option<import("../../src/next/entry").Entry<string, "Count", number>>[];
  };
  ```

  The entry prints by its name. Inferred, its default `never` is spelled out, and it is imported from the module it is
  declared in, which an export of the package's index would name in stage 4. The messages print as they do today:
  `Readonly<{ _tag: "Name"; message: Written<string> }>`.

**Checked**, by reading: `Equal.equals` compares plain objects and arrays by their contents, and `Hash.hash` hashes an
array by its contents (`node_modules/effect/dist/Equal.d.ts`, `Hash.d.ts`, documented and stable). `Optic.d.ts` has no
function that tells a lens from an optional. `CHANGELOG.md`: inputs and `Written` were never released (0.8.0 is
unreleased, and 0.7.1 has neither).

**Reasoned**, not run: a hover in an editor (taken to print as the declarations do); the inference matrix
(`bun run inference`), which a change of the types of `compose.ts` asks for; `bun run mutations` (the table above is
the spike's own); a real browser.

## The rules of the guide that would hold by construction

- "Its view then shows an editor only where a write has a place." ("Inputs the user types into", "The model can read
  the place through the input".) An editor needs an entry to write through, and the model is given one only where the
  input's place is. What is still left: the converse. A model may ignore an entry and draw a read-only count where a
  write has a place: it compiles, and `dispatchViolations` finds it as `Missing`, with candidates written by hand
  (the stock-take's test, killer of "draws read-only where it has an entry").
- "**The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
  `forwardTo(dispatch, 'Name')`." (Same page, "Rules".) `was` is the entry's own value, and the route its own. A view
  that holds an entry of an older model writes over the older value, which is rejected where the place moved on: what
  `was` does today.
- "**A write into an input by id names its id**: `{ _tag: 'Count', id, message: { _tag: 'Written', was, value } }`,
  through `forwardTo(dispatch, 'Count', id)`." (Same page, "Inputs by id".) The id is the entry's.
- "**A view sends only what its model holds.** It writes only over the values its model holds" ("Guarantees", "What
  is left to you"): for a view that writes through entries. The same sentence goes on "and never builds a message
  itself. The library does not enforce this", and that stays true: a view can still build
  `{ _tag: 'Name', message: { _tag: 'Written', was, value } }` by hand, since `Written` is a type a literal fits.

Left to the user, as today:

- **The route above the program.** An entry routes within the program whose model holds it. Above it, the parent's
  view chooses the dispatch: an entry of the child `Right`, given `forwardTo(dispatch, 'Left')` where both children
  are the same program, compiles and writes into `Left` (**reasoned**, as any message of a child).
- **Types are structural.** An entry of another program's input of the same name and type is a message of this one
  (a test of the types says it compiles), as a child's message of the same shape as a parent's is.

## What it costs

- **The exports.** Added: `Entry` and `write`, and the third parameter of `makeModel`. `Written` stays exported as a
  type: the program's `Message` names it, and a test of `Missing` builds one; its doc comment would say that a view
  makes one with `write`. `forwardTo` for an input stays as it is: an input's message has a child's shape, and its
  types cannot tell the two apart from `Message` alone. No view of the spike needs it; the guide would stop teaching
  it, and refusing it is a point for the owner. Nothing is removed beside what stage 4 removes already.
- **Every model with an input changes, and its view.** A field `name: string` becomes `Entry<string, 'Name'>` or an
  `Option` of one; a model's type written by hand names `Entry<string, 'Name'>` (a misspelled name does not compile:
  `makeModel` gives another type); `makeModel` takes `(state, _children, inputs)`; the view reads `.value` and writes
  through `write`. Nothing of it was released: inputs came after 0.7.1, so no user of a release upgrades from them. An
  upgrade asks this only of the repository's own examples, guide and tutorial.
- **What the types print**: as quoted above. One name for each input, and the messages as today.
- **A test of a program** writes through the model it read, and makes the model of a state it writes into. A model
  can no longer be written as a literal: a test that draws a view with a model built by hand, a fixture, must make it
  from a state with `makeModel`. The candidates of `Missing` are written by hand, as today.
- **A test of a view.** `messagesSentBy` is unchanged. With B6, each listener gets the value its element was drawn
  with, so a controlled field writes its entry's own value over it: the reader of what a view sends lists one write
  for each entry drawn, in the order of the tree (`sentOf` in the stock-take's test). It finds a view that writes by
  hand to another id or over another value (two killers above).
- **A second cache like `forwardTo`'s**, kept by `Equal` and `Hash` of the program's values in every `makeModel`, and
  weakly held. Its keys are often primitive values. "Never add a cache for primitive states" (`AGENTS.md`) is of the
  state of a child, not of this, but it is a cache of primitive values all the same.
- **The engine** changes by nothing; `compose.ts` by a parameter.

## What would change in the guide and in `docs/invariants.md`

Each sentence quoted, then how it would read. Stage 4 rewrites "The element on screen", "Settling an element" and
"Which elements and renderers this holds for" already, and they are not repeated here.

"Inputs the user types into":

- "In general, a view writes over the value its model holds, through the input's dispatch:
  `{ _tag: 'Written', was: model.name, value: text }`" would read: "The model holds an entry of the input. A view shows
  its value, and writes through it: `dispatch(write(model.name, text))`."
- "**The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
  `forwardTo(dispatch, 'Name')`." would read: "**The view writes through the entry its model holds**:
  `dispatch(write(model.name, text))`, with the program's own dispatch. The write is over the entry's value, to the
  input it came from."
- A rule added under "The program declares where it goes": "**`makeModel` is given an entry of each input**:
  `inputs.Name(state)`, and `inputs.Count(state, id)` for inputs by id. It is `None` where the input has no place."
- "**A write into an input by id names its id**: `{ _tag: 'Count', id, message: { _tag: 'Written', was, value } }`,
  through `forwardTo(dispatch, 'Count', id)`." would read: "**An entry of an input by id carries its id**: the write
  names it."
- "**The model can read the place through the input.** What `input` and `inputById` return has the `get` of the
  place. Declare the input beside `make`, and `makeModel` can call that `get`. `stocktake` draws a count as editable
  exactly where `counts.get(state, id)` is `Some`. Its view then shows an editor only where a write has a place. An
  input on an optic that always focuses is read from the state, as `state.name`." would read: "**The model holds an
  entry only where a write has a place.** `stocktake` draws a count as editable exactly where `inputs.Count(state, id)`
  is `Some`, with the entry. Its view then shows an editor only where a write has a place."
- In "Do and don't", a row: "Write through the entry the model holds" against "Build a write by hand".

"Model": "A view writes only over the values that the model holds." would read: "A view writes only through the
entries that the model holds." And "**A model is data.** A model holds no function." would add: "An entry of an input
is data too."

"Guarantees", "What is left to you": "It writes only over the values its model holds, and never builds a message
itself." would read: "It writes only through the entries its model holds, and never builds a message itself."

"Testing": "A test writes into an input as the view does:
`{ _tag: 'Name', message: { _tag: 'Written', was: model.name, value: 'Ada' } }`." would read: "A test writes into an
input as the view does, through the entry of the model it read: `write(model.name, 'Ada')`." And: "The writes over the
values the model shows as editable are `held`. The writes over all the values it shows are `candidates`." would add:
"A value shown read-only has no entry: its candidate is written by hand, `{ _tag: 'Count', id, message: { _tag:
'Written', was, value } }`."

"Testing tools", the example of `rehearse`: `Opt.some({ _tag: "Name", message: { _tag: "Written", was: name, value:
"Ada" } })` would read `Opt.some(write(editor.name, "Ada"))`. The glossary's "Write", "What the view sends into an
input: `{ _tag: 'Written', was, value }`", would read "What the view sends into an input, made by `write` from an
entry", and an "Entry" row would join it.

"Composition" keeps "`{ _tag: <input>, message: { _tag: 'Written', was, value } }` for each input": the messages a
parent's inputs bring do not change.

The doc comments of `input`, `inputById`, `Written`, `forwardTo` ("An input's view sends a `Written` through it") and
of `make`'s `makeModel` would follow.

`docs/invariants.md`, "A write is stored over the value it names, and only what is drawn writes into an input": the
sentences of the rule stay. It would add: "`make` gives `makeModel` an entry of each input where its `get` finds a
value, so a model holds one only where a write has a place, and `write` names the entry's value and its route." And a
section beside "A child's dispatch is the same while anyone holds it", which the cache of entries follows: "An entry is
the same while anyone holds an equal one (`entryOf` in `entry.ts`), so a view memoized on it is skipped as it was on
its value."

## What it rests on

No new premise. `Equal` and `Hash` of plain objects and arrays by their contents: documented, as above. The cleanup of
the cache rests on the premise `forwardTo`'s does already, "A collection reclaims what nobody holds, and a
`FinalizationRegistry` then calls back for each target it reclaimed" (`docs/premises.md`), with its test; the test of
the cleanup of entries rests on it too, as `entriesLeft` in `dispatch.test.ts` does.

## The case against it

- **It buys less than it seems.** The types already refuse a write with a wrong name, of a wrong type, or without the
  id of an input by id: `Message` says all three. What the entry adds is that `was` comes from the model, and that an
  editor is drawn only where a place is. A wrong `was` is a write rejected in a test, as it would be in the run, and an
  editor with no place is `Rejected` in a test of `dispatchViolations`. Both are found today, by the tools the
  examples already use.
- **A type of the library's in every model with an input**, with a hidden field in the user's data: a `toEqual` of a
  model, a snapshot and a log print the route, and a model can no longer be written as a literal, so a fixture of a
  view is made from a state.
- **`makeModel` takes a third positional parameter**, and a program without children writes `_children` to reach it.
- **An input on a lens gives an `Option`**, and the model matches a `None` that cannot happen. Closing it needs a
  premise or a second way to declare an input.
- **A second cache, a `WeakRef` and a `FinalizationRegistry`**, kept only so that a `thunk` or a `memo` on an entry
  skips as it did on the value. Without it a view memoizes on `Equal`, a rule to remember.
- **It does not close the hand-built write.** "Never builds a message itself" stays a rule the library does not
  enforce, unless `Written` is hidden too, which then needs a tool for the candidates of `Missing`.
- **It does not close the route above the program**: the parent's view still chooses which child an entry is written
  into.
- **Its reopening is the plan's, not the rejection's.** "Handles of the inputs in `makeModel`" was rejected as a second
  name over `get`, and the value of its own as costing "a type of the library's in every model, of `forwardTo` and of
  both bridges". The bridges are gone from that cost; the type in every model, `forwardTo` left as it was, and the
  views and tests rewritten are not. Its "Reopen if" is not met.
- **The rule "A type is Effect's or the library's"** is kept, and asks for it: the shape is hidden, and the library
  gives the function over it, `write`. But the reason a type moves to the library's side, "enforce at construction what
  the type cannot", is met only by `was` and by the place: the rest the types enforce already.

## What is left for the owner to decide

**Decided, 20 November 2026:** the first, by the owner. Stage 4 does not take the entry, and the six others go with
it.

1. Whether stage 4 takes the entry, or the views write `Written` by hand, as the spike's views of
   `synchronous-dispatch.md` and stage 3 do.
2. If it does: the third parameter of `makeModel`, or one record of handles for the children and the inputs.
3. Whether an input on a lens gives an entry, not an `Option`: by a new premise on Effect's optics, by a declaration of
   its own, or not at all.
4. Whether `Written` becomes the library's, made by `write` alone, so that no view can build a write; and if so, how a
   test writes the candidates of `Missing` into what the model shows read-only.
5. Whether entries are kept by value, as built, for a `thunk` and a `memo`, or are new objects, with a view memoized on
   `Equal`.
6. Whether `forwardTo` refuses the name of an input, now that no view needs it for one.
7. The names: `Entry`, `write` (a name removed once, as a function over a literal; this one is over a hidden shape),
   `inputs` for the parameter.
