# Registers: what the outside writes into a program's state

**Status:** being explored, 14 November 2026. Nothing of it is decided, and no file of the library has changed. It
records a discussion with the owner, two reviews by Fable 5.2 (one of a design, one asked for ideas), and one spike,
kept on the branch `spike/field-register` (commit `0c6a357`, cut from `beaba6f`, never to be merged), on Effect
4.1.4 and Bun 1.4.4, the six checks that followed, each on a branch of its own ("What the checks found"), and a
third review by Fable 5.2, asked what to adopt, with a spike of its own ("An independent opinion"), and a fourth, on
how that spike derives a revision ("A second opinion"). What the spikes ran is marked **run**; what was read in the
code at `beaba6f`, **checked**; what was only argued, **reasoned**. It reopens the aim of
[`declared-inputs.md`](declared-inputs.md), suspended the same day, by another way, and leans on
[`inert-steps.md`](inert-steps.md), which it would simplify.

## Context

A model holds a function for every control that carries a value the user gives: `changeName: (name: string) =>
Message` (`examples/form/form.ts:102`), which the view calls with the text typed. The owner wants none:

- **No function in a model.** A model is data, as the state is.
- **The tools of the model judge only what the program fixes.** `Rejected`, `Missing`, `ActsTwice` and `Inert`, the
  last proposed, are asked of messages the model holds, deterministically, with no value invented by the test.
- **What comes from outside is judged on its own terms**, apart from the model.

Today a test reads `changeName(typed)` with a text it draws (`examples/form/form.test.ts`), the form needs a
`withheld` for typing while saving, and `Inert` would need an exemption for a text equal to the field's. The owner
calls these patches: a value decided by an external component (a text, a native slider, a pointer, a paste, a file)
is, to him, an external event, uncontrollable as a clock tick is.

## What was settled in the discussion

- **Every message of a view is external in its timing.** A button is an impure component too: whether and when it
  is pressed is the user's. What tells a button from a text field is who decides the *content* of the message: the
  program (a button, a select over options of the state, a calendar the program draws) or the component (a text, a
  pointer, a file).
- **The line between the model and the subscriptions is whether a source exists only in a drawn frame.** A control
  exists only where it is drawn, so what it sends belongs to the frame it was drawn in. A clock, a socket, the
  device's back button, `popstate`, a shortcut on `document`, exist whatever is drawn, and belong to a subscription,
  bound to the state by its key. A drag is both: its start is a fixed message of the model, its moves a subscription
  keyed by the state of dragging, as an animation's frames are.
- **A typed value is not a message: it is a write into a place of the state that the outside owns.** That is a
  register, in the theory of register automata: a finite control, which the program fixes and the tools judge, and
  registers, which the environment writes and the automaton reads to decide. It is a *behavior* in FRP, `assign` to
  the context in XState, a `Var` in Bonsai.
- **What ties a write to what was drawn is the generation of the place, not the identity of the frame.** A field
  already has one, `revision` (`examples/field.ts`), which grows when the program replaces the text; the engine
  already tells the generations of a subscription apart in the same way (`src/core.ts`, checked).

## The spike: a field as a leaf child, on the API as it is

**What changed**, in `examples/` only, five files:

- `field.ts` became a program of its own. Its state and its model are the `Field`, `{ text, revision }`; its one
  message is `Typed`, `{ _tag: 'Typed', text, revision }`, made by `typedInto(field, text)` from the field drawn.
  Its `update` stores the text when the revision is the state's, and rejects it otherwise: the input it was typed
  into has been replaced, and the new one does not show it.
- `form/form.ts` became a `compose` with one child, `Name`, placed at `Optic.id<State>().key('name')`. Its own
  messages are those the program fixes: `SaveClicked`, and the answers of its command, `SaveSucceeded` and
  `SaveFailed`. Its model holds `name`, the field, and `save`, a fixed message: no function.
- The two views send what is typed with `onInput((text) => Field.typedInto(model.name, text), dispatchTo(dispatch,
  'Name'))`. The bridges did not change.
- The form's test reads `[save]` from the model, or nothing; its contract has `[SaveClicked]` as its only
  candidate, no `withheld`, and draws no text. The rules of what is typed are tested on `update`, as before.

**What it showed:**

- `parent`, `child`, an optic, `dispatchTo`, `reject`, `applyAll`, `simulate`, `rehearse`, `drive` and
  `dispatchViolations` held the field as they are. **Run:** `bun run typecheck`, `bun run lint`, `bun run test`
  (540 tests, 13 of the form's, one of them new).
- One friction of types: `parent` needs `command: Command` named, or the inference of the parent's own messages
  falls to `never`, with an error that does not say why. **Run.**
- **A hazard of today's form is closed.** On `main`, a `NameChanged` that arrives after `SaveSucceeded` is stored by
  `Field.typed` under the new revision, while the input on screen is the new, empty one: **checked** in the code.
  That it can happen (a command that ends before a keystroke from an older frame is queued) is **reasoned**. The new
  test, "a key typed into an input the form has since replaced is rejected", fails when the check of the revision is
  taken out (1 of 13), and passes with it. **Run.**
- `rehearse` and `drive` write into the field with a message the test builds, `typing(name, 'Ada')`, in place of
  `editor.changeName('Ada')`: no clumsier.
- Not run on the spike: `bun run test:node`, `bun run interleavings`, `bun run mutations`. Not tried: two fields in a
  form, a field inside a child, a register that is not text.

**What it gives**, against the owner's three wishes:

- No function in the model: the model is the field, the fixed messages and data read from the state.
- The tools of the model judge fixed messages only. The sampling of the text, `withheld` and the exemption of `Inert`
  for an unchanged text are gone, since what is typed is no message of the form.
- "What is typed is accepted wherever the input exists" (the README's "Inputs the user types into") becomes a rule
  of one place, the field's `update`, tested once, instead of a rule each program states and samples.

**What it does not give:**

- **The function still exists, in the view.** `(text) => Field.typedInto(model.name, text)` is `changeName` a step
  further on. What moved is that the message it makes is generic, the same for every field, and made in one place.
- **A value from outside still reaches an `update`**: the field's, whose rule is trivial and the same for all, not
  the form's.
- **The view builds a message**, against the README's "A view sends only what the model holds, and builds no
  message itself" ("Messages live in the model").
- **The form reads its field's state**, against "A parent never reads a child's state to decide" ("Structuring a
  program"). See the next section.

## A register is not a child

The README goes on, under the same rule: "A child whose controls the parent would enable from its state, or whose
state the parent would copy down and back up, is not one." The field of the spike is exactly that: the form shows
"Save" from its text, and saves its text. By the README, it is no child. The rule is not wrong; the spike borrows
`child` for what is not one.

The theory says the same. A register belongs to the automaton that reads it, not to a sub-automaton: reading it is
reading one's own state. The rule about children is about sub-automata with rules of their own, and holds for them.

What was missing is a concept, not a premise. Today a value from outside enters a program in one of two ways:

- **a message of the program**, made by a function in the model (`changeName`);
- **a child**, with rules of its own and a state its parent does not read.

A third, **a register**, a place of the program's state that the outside writes, with its generation, has no name.
The spike emulates it with a child, and the conflict with the README comes from there.

## What a model is: data, not serializable

A sentence of the README could say what the owner wants: **a model is data: it holds no function, and compares by
value with `Equal`.** That is what the tools need: they compare a model's messages with `Equal` already
(`src/testing/dispatch-violations.ts`, `Missing`), and it is what a test can check (below). It admits all a model
holds today: `Option`, `Data.TaggedEnum`, arrays, plain objects.

**Serializable** was weighed and is a stronger, other promise. It would leave out `Map`, `HashMap` and instances of
classes; an `Option` becomes JSON but does not come back an `Option` without a schema; a `Date` becomes a string. It
would buy what does not exist (devtools, a first frame on the server, both in `ROADMAP.md` as ideas), and restrict
now for nothing. If one of them comes, it is a promise of its own, with its schema.

The sentence is a rule applications will cite, so a changelog entry. It comes with the register: without a way for
an input to enter with no function, it would forbid `changeName` and offer nothing instead.

## What can be enforced, and what is advice

| What | How |
| --- | --- |
| A model holds no function | a property a test checks: two equal states give two equal models |
| `replace` makes a new generation | an opaque type, in the example or as a primitive of the library |
| A view builds no message of the program | advice, as today |
| An input goes through a register | a consequence of the first two, and advice |
| A program reads its registers | a sentence of the README, once a register is a concept |

- **By a type, no.** "No function at any depth of the model" would refuse `Option`: Effect's `Some` and `None`
  extend `Pipeable` and `Inspectable`, so their type has `pipe` and `toJSON` (`node_modules/effect/dist/Option.d.ts`,
  checked). It would need a list of exceptions for Effect's types: a patch.
- **By a test, yes.** A function in a model is a new closure at every `makeModel`, compared by reference, so two
  models of two equal states differ. `Option` and `Data` compare by value. It costs the run nothing, so "frames cost
  only what is drawn" still holds. One trap: `compose` keeps a model for each state object, so two calls of
  `makeModel` on the same state return the same model and pass whatever it holds; the test must build two equal
  states apart. **Reasoned**, not written.
- **A view that builds a message** cannot be refused: an object written by hand always compiles, as the second spike
  of `declared-inputs.md` found. The README already says the library does not enforce it.

## The ways forward

They are not exclusive; each is weighed alone.

### 1. The register as an example's own, as spiked

The field stays a program of `examples/field.ts`, composed with `child`. Two sentences of the README are rewritten:
"Messages live in the model" learns that a model may hold registers, which the view writes into; "A parent never
reads a child's state to decide" learns that a register is not a child. No API changes.

- *For:* nothing new to learn, nothing in the library.
- *Against:* the README would explain, with an exception, a concept the library does not name; every application
  copies `field.ts`, as it copies the bridges today; a register is a child to `compose`, its logs and its defects.

### 2. An opaque `Field` in the example

The same, with `Field` a type only `make` and `replace` can make, so that no program writes `{ text, revision }` by
hand and forgets the revision. It decides whether the library is needed to enforce the generation.

### 3. A primitive of the library, `input(at)`

`parent()` gives `input` beside `child` and `each`, or a program declares its registers without being a parent. The
library's `Field<A>` (`{ value, revision }`) is written by the program only through `replace`, and by the outside only
through the register's message.

- *For:* the concept has a name, and the rule about children stays whole; the generation is enforced at construction,
  one of the reasons `AGENTS.md` gives for a type to be the library's; a typed writer for the tests; a pointer, a
  slider, a file are `Field<A>` alike.
- *Against:* new exports, a changelog entry, the README's "Inputs the user types into" rewritten; it reverses
  [`boundary.md`](boundary.md), item 4 ("the remedy is the examples'"); a program with one input becomes a parent,
  or the library has a second way to declare one.
- *To be asked:* whether a register needs `compose` at all. A register has no `update` of its own to route to but the
  library's one rule; it could be a field of the program's shape, with `dispatchTo` addressing it by name.

### 4. The property "a model is data" as a check

A check of the testing tools, or a recipe in the README's "Testing": for any state, `makeModel` of two equal states,
built apart, gives two models equal by `Equal`. It is what turns the sentence of the README from a preference into a
rule a test holds. It must fail on `main`'s form, whose model holds `changeName`, and pass on the spike's.

### 5. A typed writer for the tools

`drive`, `simulate` and `rehearse` write into a register with a message the test builds. A writer, `write(at, value)`
or the register's own, would keep the tools symmetric: what a view can write, a test can ask about.

## The subscriptions, after this

They do what they do today. The line above takes from them the temptation of input: no control drawn on screen goes
through a key. What stays open is what it was: a key's messages are judged by no tool, and whether the test lists
them, the program exports them or the subscription declares them is still the question of `ROADMAP.md` ("What a key
sends is not data"). It now concerns only sources that exist whatever is drawn.

## Alternatives weighed the same day

The second review by Fable, asked for ideas free to depart from the library's model, ranked five: the field as a
leaf child on today's API (the spike), the same as a primitive `input(at)` (way 3), a symbolic alphabet, the value
read when a fixed message is sent, and the identity of the frame in every message, the last two refuted. The first
review judged the push source, and named the data slot as cheaper and exact on the frame drawn. Each is below, or
above for the first two.

- **Input through a subscription, with every control that depends on it.** Refused before
  ([`rejected.md`](rejected.md)), and weighed again with the owner's answer to the order: the text field and its Save
  go together into one subscription. The order holds then, by construction. What it costs:
  - "depends on the text" spreads: Cancel, Enter, a reset race with a keystroke as Save does, so a form, or a page,
    becomes one subscription;
  - no tool can check that a dependent control is in the stream, and the race comes back in silence if one is not;
  - the tools of the model lose the whole form, Save included;
  - a *long frame*: a stream resolves its declared message when it starts, so a fixed Save may be sent in any later
    state while the key lives. `ActsTwice` is the double tap within one frame, a message applied twice in a row
    (`src/testing/dispatch-violations.ts`): it still applies to a declared message, but not to Save, a keystroke,
    Save. Restarting the stream when its declaration changes loses the events in flight;
  - a key that follows the component's existence, not its being enabled, keeps the keystroke typed before saving.
  **Reasoned.**
- **A push source**: `sources(state)`, holding `key -> (value) => Message`, with `send(key, value)` from the bridge,
  resolved against the published state and queued at once. Proposed to remove the costs above, all of which come
  from a subscription being pulled through a fiber. Reviewed by Fable 5.2 and left:
  - the run does not know which frame is drawn: frames reach the renderer through a sliding buffer of one, with
    models made lazily (`src/run.ts`, checked), so the published state may be ahead of the screen;
  - the keystroke is dropped again: `Saving` is published, the old frame is on screen, `send` finds no key;
  - model and sources are two declarations to keep in step, which needs a tool;
  - it breaks "Every message a view can send is in the model it draws";
  - it is `dispatch` with a lookup, and needs a `sendTo`, lifted keys with their collisions, and a gate of its own.
  The diagnosis it gave: a tick exists whatever is drawn, an input only within a drawn frame. **Reasoned.**
- **The identity of the frame in every message**, a compare-and-swap: `dispatch` carries the revision of the frame
  it was drawn in, and the run drops a message whose frame is not the current one; a model could then hold steps
  computed in advance in place of messages. It would answer "the run does not know what is drawn", and the long
  frame. Any unrelated change, a tick of a clock, would kill every click from a frame one revision old, where a
  rejection by the state is finer and right; and `dispatch` would no longer be one function for every frame
  (`src/dispatch.ts`), so the cache of `dispatchTo` and a renderer's memoization would go. The experiment that
  refutes it: `pages` with a clock of one second and a renderer late by two, where About never opens. What survives
  of it is the generation of a place, which is the register. **Reasoned** by Fable.
- **The value read when a fixed message is sent** (HTML's submit, FRP's `event <@ behavior`, a query in Halogen): the
  text stays in the renderer, as the README allows for what lives only on screen; Save declares what it reads, and
  the bridge reads the component in the handler, in the frame drawn by construction. It removes the traffic of every
  keystroke and the function in the model. But the sampling moves into every message that reads, and `Rejected` for
  Save depends on a value again; validity could no longer be model data, so "Save only for a name that is not blank"
  is not expressible, and Save would be rejected because of input; and nothing live can be drawn by the program, a
  slider's label or a drag. **Reasoned** by Fable, refuted by reading.
- **A symbolic alphabet**: the program declares the classes of a value it tells apart, with one representative each,
  and the tools try those. It leaves the function in the model, and trusts the partition: a mutant `isBlank` that
  tests `name === ''` survives representatives `''` and `'x'`, where a drawn text and `'   '` kill it. **Reasoned**
  by Fable. At most a note in "Testing".
- **As it is, with the exemption of `Inert`**: `changeName` stays, and the one case it costs, a text equal to the
  field's, is answered by a one-line `inert`, as `inert-steps.md` proposes. The recommendation of the first review
  by Fable, if a function in the model is acceptable. The owner left it: he wants none.
- **The principle in the tests alone**: `changeName` stays, the reader calls it with no text, and the tools judge
  fixed messages only; "what is typed is accepted" is held by the property test of `update` the form already has.
  No API changes. The owner left it for the same reason.
- **A data slot in the model**, `{ message: { _tag: 'NameChanged' }, at: 'name' }`, sent with `dispatch(slot,
  text)`: spiked in `declared-inputs.md` (`spike/dispatch-offers`), where it held and was suspended for what it adds.
  A register is close to it, with the place in the state rather than in the message, and the generation that a slot
  does not have.

## Open questions

- **A register is a child, a primitive, or a part of the program's shape** (ways 1 and 3).
- **How the README says it.** "Messages live in the model" and "A parent never reads a child's state" are rewritten
  or kept, and a register is named or not. Each sentence is checked against the old one.
- **A view that writes into a register builds a message.** Whether the rule becomes "a view builds no message of the
  program; it writes into the registers its model holds", and whether that is advice, as today.
- **A register that is not text.** A slider holds a number. A file does not compare by value, against "a state is
  data": whether a register holds a reference, a description of the file, or files go through a command.
- **What else a register keeps.** A selection, a composition by an IME, a scroll: they stay in the renderer, as the
  README allows for screen-only state, or a register holds them.
- **A reaction to every keystroke** that is neither a state derived in `makeModel` nor a subscription keyed by the
  text (an autosave, say): whether a register raises an event to its program, which `onEvent` takes without
  rejecting.
- **A register inside a child**, addressed by nested `dispatchTo`, and **several registers in one form**: not tried.
- **What a stale write is.** The spike rejects a write into a replaced revision, so `onIgnored` hears it. Whether that
  is the rejection of "the message does not apply in the state", or a third way for what arrives too late
  (`ROADMAP.md`, "Two ways for what arrives too late").
- **The testing tools.** A typed writer (way 5), and whether `dispatchViolations` is asked anything of a register:
  that it exists where `update` would read it, say.
- **`inert-steps.md`.** Its decision holds and loses the exemption for an unchanged text; its open question on
  `Field.typed` depends on this document, and the one on a key whose message does nothing moves to the
  subscriptions.

## What must be checked before deciding

1. `bun run test:node`, `bun run interleavings` and `bun run mutations` on `spike/field-register`.
2. **The hazard of the late keystroke on `main`**, through a run: a command that ends before a keystroke from an
   older frame is queued, with the text stored under the new revision. A premise, so a test that fails, not an
   argument.
3. **The property "a model is data"** (way 4): written, seen to fail on `main`'s form and to pass on the spike's,
   with two equal states built apart past the cache of `compose`.
4. **The spike on other shapes**: two fields in one form, and a field in a child of a parent.
5. **Whether the library is needed**: an opaque `Field` in the example (way 2), and whether it holds the generation
   with no help.
6. **A register that is not text**: a numeric slider in an example, with its bridge.

All six were done the same day, each on a branch of its own, none to be merged; what they found is next.

## What the checks found

### 1. The engine's checks on the spike

`test:node` (481), `interleavings` (14) and `mutations` (89 of 89 killed) pass on `0c6a357`. **Run.** They say
little: the spike changes `examples/` only, and none of them runs the examples' tests. The spike breaks nothing of
the engine; it is not checked by them.

### 2. The late keystroke on `main` is real, and worse than argued

Branch `claude/spike-register-late-key-6cb914`, `examples/form/late-key.test.ts`: two tests through `run`, with a
renderer that draws synchronously and then waits for an animation frame, as the bridges do. **Run**, and seen to
fail when `update` rejects the late key. The order needs only that the save ends, and `SaveSucceeded` is applied,
within one animation frame of the click: the sliding buffer of one in `src/run.ts` then drops `Saving`, the input of
revision 0 stays on screen, enabled, and a key typed into it is queued by `dispatch` with nothing that ties it to its
frame. `Field.typed` stores it under revision 1. Two orders follow, both reached by the test:

- **the loop wakes before the next render**: the input of revision 1 is created showing the late text. Screen and
  state agree, but the clearing the save did is undone;
- **the browser renders between the key's task and the loop's**: a dispatch wakes the loop through the scheduler,
  while `Effect.callback` resumes the renderer at once, in the frame's callback (read in Effect's
  `callbackOptions`, and asserted by the test). The input of revision 1 is created empty, then the state becomes
  `{ text: 'Ada x', revision: 1 }`; `initialValue` counts only at creation, so the input stays empty, and Save is
  offered for, and saves, a text nobody sees.

It is not the form's bug alone: it holds for every input on `main` whose text the program replaces, since neither
the run nor the engine ties a dispatch to the frame drawn. A write that carries the revision it was typed into, as
the spike's `Typed` does, rejects it in both orders.

### 3. "A model is data" holds as a test, and the trap is narrower than argued

Branch `claude/spike-register-model-data-52ba83`, in `examples/form/form.test.ts`: for states drawn by fast-check,
two deep copies built apart give two models equal by `Equal`. It passes on the spike's form and fails at once on
`main`'s (`Idle` with a name `''`, whose model holds `changeName`). **Run.**

The trap of the cache was argued wrong in one respect: `main`'s form is not composed, so two calls of `makeModel`
on the same state fail too. The trap is real for a composed program only, and goes deeper than the outer state:
`compose` keeps a model for each state object, a child's included, so `{ form: d }` built twice around one `d`
passes with a function in the model. The copy must reach every child's state. **Run.**

As a check of the tools it would need a copy the library cannot make (`structuredClone` loses the prototypes of
`Data`, of classes and of `Option`): at most `modelViolations(program, copy)`, which would earn its place only by
saying where two models differ. A walk of a model's own properties for functions needs no copy, but checks "holds
no function" and not "compares by value": a `Date` or a `Map` passes it. The recipe in "Testing" is the cheaper
form, and comes only with the sentence of the README.

### 4. Two fields, and a field in a child

Branch `claude/spike-register-shapes-ea38c5`: `examples/contact` (Name and Email, two `Field` children) and
`examples/notes` (a list by id, each note a parent of its own field). **Run**, and the check of the revision seen
to be needed by three of their tests.

- Both held on the library as it is: four lines for each field (the `child` and its optic, the initial value, the
  field in `makeModel`, the `dispatchTo` in the view), and a writer for each program in the tests. The logs read
  `Name › Typed` and `Note › Text › Typed`, never the text. A late write is rejected through two levels, after a
  discard and after the note is removed. `parent` still needs `command: Command` named; a parent with messages of
  its own and no commands infers them with nothing named.
- **Two children placed at the same optic compile and run with no error**, and a write sent to the wrong field is
  stored when the revisions coincide: the revision belongs to a field, not to the place the view took it from.
- **A replacement is never idempotent.** `replace` always grows the revision, so "Clear" on two empty fields acted
  twice, and `dispatchViolations` found it (`ActsTwice`): every control that replaces must be rejected, and absent
  from the model, where the replacement would change nothing but the revision.
- A note became a `compose` only to hold a field: with way 1, every program with an input is a parent. Writing into
  a nested field from a test is the clumsiest part: the path written by hand, and in `rehearse` and `drive` a lookup
  of the note by id before each write.
- `simulate`, `rehearse` and `drive` accept no late write from a view, by design: it is tested on `update`, or with
  `applyAll`.

The shapes argue weakly for `input(at)` under `parent` (way 3), more for a typed writer (way 5) and for a register
declared in the program's shape, so that a note need not become a parent. Neither way 1 nor way 3 closes the wrong
optic or the replacement that acts twice.

### 5. An opaque `Field` is not enough

Branch `claude/spike-register-opaque-3fc182`: `Field` a class with a private constructor and a private member, so
the compiler tells it apart by name while the object holds only `text` and `revision`; `Equal` still compares it by
its keys, as Effect 4 does for an instance of a class, and the logs and the tools are unchanged. **Run.**

| Attempt | Caught by |
| --- | --- |
| `{ text, revision }` by hand, `{ ...old, text }`, `new Field(...)`, `name.text = ...` | the compiler |
| `make('')` in place of `replace` | the form's tests and the bridges' |
| a field taken from an earlier state | the tests |
| `replace(oldField, '')` | only a new property: a step never takes the field to an older revision |
| a `Typed` built by hand | the tests |

The type closes the slips of writing; it cannot stop a program from returning a valid field taken from elsewhere,
since the field lives in the parent's state, which the parent returns whole. Only the library could: by checking,
around every step, that the revision at the register's place never decreases and that its text changes at the same
revision only by a write; or by never giving the program the field as a value to write. That is the reason
`AGENTS.md` gives for a type to be the library's.

### 6. A slider, and the field generic over its value

Branch `claude/spike-register-slider-f36368`: `Field<A>`, `{ value, revision }`, with `Written<A>`, and
`examples/volume`, a level that Mute takes to 0 by a `replace`, Unmute gives back, and Quiet hours caps at 30, on
the snabbdom and React bridges (`onSlide`, reading `valueAsNumber`), tested in happy-dom. **Run**, and seen to fail
without the check of the revision and without the `replace` described next.

- **One rule for every type.** The field compares revisions only, never values, so `A` needs no `Equal`.
- **Bounds are nobody's.** A write goes to the child, so the program cannot reject it, and the generic field
  accepts any number. A program that **narrows** the bounds must `replace`, even when the value is within them, or a
  slider drawn with a maximum of 100 writes 80 under a maximum of 30. Widening needs none, and a drag goes on. A
  register that holds its bounds would break the one rule.
- **Parsing.** A range input's `valueAsNumber` is never `NaN`: the browser clamps it to its bounds and step. `NaN`
  comes from an empty `<input type="number">`, another register: a `Field<string>`, or a `Field<Option<number>>`.
- **A stale write during a drag** is still right to reject: Mute recreates the slider, the bridges drop the old
  listener, and only a write sent before Mute and handled after it is stale. Mute wins.
- **Where it does not hold**, **reasoned**: a progress bar the program moves on every tick. Each tick is a
  `replace`, which recreates the slider under the pointer and rejects the drag: it needs a state of dragging, with
  fixed messages for its start and end, as the line above about drags says.
- **A file**, **reasoned**: the rule of the revision holds, but a `File` compares by reference, against "a model is
  data". The cleanest way seen is a register holding an id, with the `File` in a service the upload's command
  reads. A `replace` can only empty the input: a new key is a new, empty input, since a script cannot give one a
  file.

### What it changes in the open questions

- **The late keystroke** is a bug of `main`, held by a test through a run, and closed by a write that carries its
  generation. It is a reason for registers of its own, apart from the owner's wish for no function in a model.
- **The generation needs the library to be enforced** (check 5), by a check around every step or by a register the
  program never writes as a value: the condition `AGENTS.md` sets for a type of the library holds.
- **A child is the wrong vehicle** (checks 4 and 5): it makes every program with an input a parent, lets two
  children share an optic, and gives the program the field as a value. It points to the third answer of the first
  open question, a register as a part of the program's shape.
- **Two new rules**, whatever the way: a replacement that changes nothing is rejected, or it acts twice; a program
  that narrows a register's bounds replaces it.
- **"A model is data"** holds as a test, at the cost of a copy of the state written by the user that reaches every
  child.

## An independent opinion: an input declared in `compose`, its revision derived

After the checks, a third review by Fable 5.2 was asked which design to adopt, free to change the invariants, with
the owner's aim: elegant, pure, coherent, and confined to what the library should give its users. It spiked its
answer on the branch `worktree-agent-a999dbf34f0675ed0` (commit `6b97cb6`, cut from `c263478`, never to be merged).
It reports `bun run typecheck`, `lint`, `test` (556), `test:node` (496) and `interleavings` (14) green, and
`mutations` printing 88 of 88 killed with its exit code not captured; typecheck and the 31 tests of `src/input.test.ts`
and `examples/form` were run again apart, green. **Run.**

### The design

- **Added**: `Field<A>`, `{ value, revision }`, a type of the library read by hand; `field(value)`, what a program
  starts or replaces an input with; `write(field, value)`, the message `Written<A>`, `{ _tag: 'Written', value,
  revision }`; `parent().input(at)` and `inputs` in `compose`, beside `children`, which becomes optional. About 100
  lines, in `src/input.ts` and `compose.ts`.
- **Removed**: `examples/field.ts`, `replace`, and the functions of a model such as `changeName`.
- **The rule, the library's**: a write at the revision held is stored, whatever its value, and a write of the value
  held returns the same state; a write at another revision is rejected, so `onIgnored` hears it; after any other
  step, an input whose place holds another object gets the revision before it plus one. The program never handles a
  revision: it replaces a field by putting `field('')` in its place.

```ts
const { input, compose } = parent<{ state: State; command: Command }>()
export const form = compose({
  init: () => ({ state: { name: field(''), save: Save.Idle(), saved: [] } }),
  inputs: { Name: input(Optic.id<State>().key('name')) },
  update: (message: Own) => (state) => { /* SaveSucceeded returns { ...state, name: field('') } */ },
  runCommand,
  makeModel: (state) => ({ name: state.name, editor: /* fixed messages only */ }),
})
// view: key: model.name.revision, initialValue(model.name.value), onWrite(model.name, dispatchTo(dispatch, 'Name'))
// test: { _tag: 'Name', message: write(model.name, 'Ada') }
```

A field in a child by id is an input of the child's own `compose`, reached by nested `dispatchTo`.

### Why, by the review

- **Pure**: a write is an ordinary message of the composed program, so the state stays the fold of `update` over the
  messages. The engine, `core.ts`, `applyAll`, `simulate`, `rehearse`, `drive` and `dispatchViolations` do not change.
- **The library's own idiom**: another object means changed, as for frames and for a child's model.
- **Nothing to get wrong**: no opaque type, no `replace`, no check that can fail, no defect.
- **Not a child**: the field is the program's own state, so "a parent never reads a child's state" stays whole.
- "Nothing new in the library" was weighed at its best, a message with a hole held as data that the bridge fills,
  which closes the late key at no cost of API. It was left because the rule would be the same in every program, which
  is what a function of the library is for, and because only the library can make the revision impossible to get
  wrong.

### Evidence

- **Run**: the late key, `late-key.test.ts` ported from its branch, is ignored in both orders, the new input stays
  empty and no Save is offered.
- **Run**: five checks of `compose` taken out by hand one at a time, each seen to fail tests: no check of the revision
  on a write (6, both of the late key), a replacement keeping the revision the program gave (11), a write of the value
  held making a new field (1), a child's step or an `onEvent` counted as a replacement (1), a write counted as one
  (10).
- **Run**, in `src/input.test.ts` (17 tests): two inputs in one program, one a `Field<number>`; an input at an
  optional place; an input in a child by id; an undo that restores an older state, where the revision still grows and
  the old write is rejected; the types refusing a value of the wrong type, the wrong input's name, an own message
  named as an input, `input` at a place that holds no field.
- **Run**: `examples/form` on both bridges, with the property "a model is data" (the same seed drawn twice gives two
  equal states built apart, with no copy written by hand) and a `dispatchViolations` test that draws no text and needs
  no `withheld`.
- A finding of types: with no `children`, a command returned was inferred as a child's; inferring the children and
  the inputs only from `children` and `inputs` fixes it.
- **Not done**: the five checks in `mutations/mutations.ts`; `build`, `smoke` and the report of the API; a slider on a
  bridge, the generic `A` being covered by the unit tests alone.

### What it would change for users

- Additive as API. Breaking only through the README's rule: a model that holds `changeName` breaks "a model is data".
- "Messages live in the model": a value the user gives is no message; the model holds the field of an input and the
  view writes into it with `write`; a model holds no function and compares by `Equal`.
- "Inputs the user types into": the library keeps the rule for a declared input, and rejects what was written into an
  input since replaced; `initialValue` and `key` stay the bridges'.
- "Testing": readers and candidates hold fixed messages only.
- `docs/invariants.md`: an input's revision is the library's; a step that leaves another object in its place gets the
  next; a write is stored at the revision it carries or rejected; a program never chooses or restores a revision.
- "`reject` means one thing" holds: a stale write does not apply in the state, and no third way for what arrives too
  late is added. No guarantee of the run changes.

### Where it departs from "What it changes in the open questions"

- **`compose` is the home, not the engine.** A register applied by the engine changes the state with no `update`: it
  breaks replay with `applyAll`, and needs `Core`, `Applied`, `Ignored` and `Origin`, the three tools, the contracts,
  and a lifting of a child's registers. In `compose` it is about 60 lines.
- **The generation is derived**, a third way beside a check around every step, which can only fail (a defect on an
  undo by snapshot), and a replacement asked in the `Step`, which adds a shape.
- **The two rules are not new**: a replacement that changes nothing is "show less than `update` accepts" and
  `ActsTwice`; narrowed bounds are "validity is model data", by a new field in its place or a value clamped in
  `makeModel`.
- **"A model is data" needs no copy** written by the user: a seed drawn twice gives two states built apart.

### Against, by the review itself

- **`update` returns a state the program did not write**: `compose` stamps the revision, so the function given to it
  and `form.update` differ, and a test of the former sees revision 0. It is the first time `compose` changes a
  parent's own state.
- **A program with one input is made with `parent()`**, a word that is wrong for it; judged cheaper than a second way
  to declare one, or than teaching the engine.
- **Re-initialisation is not covered**: a parent that replaces a child's whole state restarts its fields at revision
  0, and a stale write at 0 can land, as with ids that come back. No design with the revision in the state closes it.
- **Identity, not value**: `field('')` over an empty field is a new revision, so `ActsTwice` still finds a Clear always
  shown. By `Equal` it would be idempotent, but a new input could not be forced, which narrowed bounds need.
- **A write sent through the wrong input's dispatch** lands when the two have the same type and revision: the class of
  a wrong `dispatchTo` for a child today.
- **Open**: a `File`; a reaction to every keystroke, which it would make a subscription keyed by the value; whether
  `inputs` takes a `get` and `set`, or a form like `each`.

## A second opinion: the revision derived by value, not by identity

The owner asked whether `compose` may alter the state a parent's `update` returns, by deriving the revision from the
identity of the object in the input's place. A fourth review by Fable 5.2 was given three concerns to test, not to
accept, and three alternatives: (a) the program raises the revision itself, under a check; (b) a replacement asked as
data in the `Step`; (c) a derivation by `Equal`. It worked on the branch `review-input-identity`, cut from `6b97cb6`
(commits `11ea804`, the concerns on the spike as it was, and `c445a5b`, its answer, never to be merged). It reports
`bun run typecheck`, `lint`, `test` (570), `test:node` (510) and `interleavings` (14) green on `c445a5b`;
`mutations` was not run. Typecheck and the 45 tests of `src/input-identity.test.ts`, `src/input.test.ts` and
`examples/form` were run again apart, green. **Run.**

### Verdict

Deriving the revision in `compose` is right; deriving it from identity is not. A design that enforces the generation
either checks, and fails with a defect, or corrects, and alters the revision: the state stored differs from the state
written in either case but the first, and enforcement is the only reason `Field` is the library's. What can be
avoided is identity made semantic.

### The concerns, by tests on the spike

| Concern | Result |
| --- | --- |
| 1. The state stored is not the state written | **Confirmed**, and it stays under the answer: the `update` given to `compose` returns revision 0, the program stores 4 |
| 2. Identity becomes semantic | **Confirmed**: a spread copy, a round trip through JSON and a `trim()` that changes nothing each raise the revision and reject the write in flight, though the steps are equal to the one that leaves the field alone |
| 3a. `init` is not stamped | **Confirmed**, no hazard alone: nothing is drawn before `init` |
| 3b. An optional place that goes and comes back | **Confirmed**: it restarts at revision 0, and a late write at 0 is stored |
| 3c. A child re-initialised by its parent | **Confirmed**, and a class that exists today: a fixed message drawn for the old child reaches the new one too, since a message names a place, not an instance |

### The answer: by value, with a new input asked as data

After a step that writes nothing, for an input whose place holds a field before and after:

```ts
after === before || after.revision > before.revision ? after   // untouched, or raised by the program: as written
: Equal.equals(after.value, before.value) ? before             // the same value: the same input
: { value: after.value, revision: before.revision + 1 }        // another value: a new input
```

- What the user writes does not change: `field('')` in the place, `write(model.name, text)` in the view. The form and
  both orders of the late key pass untouched.
- One export more, `renewed(field)`, `{ value, revision + 1 }` as plain data, for the one case a value cannot say: a
  new input that holds the same value, as when a slider's bounds narrow. It is stored as written.
- What the library owns: a revision never stands still under a value the program changed, and never goes back. The
  program may only raise it.

Why, by the review:

- **Over identity**: two `update`s that return states equal by `Equal` are the same program; a write was already
  compared by `Equal`, and a replacement now follows the same rule; `field('')` over an empty field changes nothing,
  so a Clear always shown no longer acts twice, and the first of the "two new rules" of the checks goes. A replacement
  by the same value keeps the input on screen, so a write in flight is one typed a moment later, and screen and state
  agree: **reasoned**.
- **Over (b)**: it does not replace a derivation. A program can still put a field there by hand, or restore a
  snapshot: with explicit requests only, 16 tests fail, "a field of an older state is a new input" among them
  (**run**). It would still need a check or a derivation, and add a shape of `Step` that `andThen` and `forEach` merge;
  `renewed` does its job as data in the state.
- **Over (a)**: the one design where the state stored is always the state written, at the cost of a
  `CompositionDefect` on a pure and legitimate step, an undo by snapshot, perhaps found only in production. About ten
  lines in the same function: **reasoned**, not spiked. It is the way if concern 1 ranks above the rest.

The sentences planned for `docs/invariants.md` would read "a step that leaves another value in its place, by `Equal`,
gets the next revision; one that leaves the value it held leaves the same input", and "a program never lowers a
revision: it may raise one, with `renewed`, for a new input that holds the same value". An input's value compares by
`Equal`, as "a model is data" already asks. Identity stays an optimisation everywhere: a frame, the cache of a
child's model.

### Against, by the review itself

- **Concern 1 stands**, and the rule has three cases where the spike had one. `field(v)` means "the value is now v",
  not "a new input": who wants a new input for an equal value and forgets `renewed` gets none, silently. Identity
  erred towards a spurious new input; value errs towards a missing one.
- **"The program never handles a revision"** becomes "may only raise one": any larger number is honoured, harmless for
  monotonicity.
- **Concern 3 stays open.** An optional place has a recipe, not a guarantee: the field outside the option,
  `Field<Option<A>>`. For a child restarted by its parent, no rule of before and after can tell a restart from typing:
  **reasoned**. The remedies are a restart through a message of the child's own, or a generation of a child's
  instances, a larger design.
- **Cost**: an `Equal` on every step that leaves another object in an input's place, linear in a large value:
  **reasoned**. A `File` compares by reference, as noted above.
- **Not done**: `mutations`, `build`, `smoke`, a slider on a bridge, the README's text.

### What is left to decide

Between a derivation by value with `renewed`, where the state stored differs from the state written only in the
revision and only when the value changes, and a revision the program keeps under a check that dies on a break, where
they never differ and an undo by snapshot is a defect. Concern 3 is apart from both, and exists today for fixed
messages.

## To explore

Ideas that an input declared in `compose` would open, weighed with the owner after the second opinion. None is
checked: each is **reasoned**, and is spiked or measured before it is proposed.

- **Frames skipped by the equality of models.** A model that holds a closure is never equal to the one before, so a
  renderer's `thunk` or `memo` cannot tell it unchanged. With no function in it, the models of two equal states are
  `Equal`, and a bridge could skip the drawing. To be measured with the benchmark (`bench/`), and decided whether it
  is the bridge's or the run's, under "frames cost only what is drawn".
- **`dispatchViolations` knows where the inputs are.** They are declared, so the tool could leave writes aside by
  itself, or check that every input the model holds exists in the state, with nothing said by the test.
- **The recipe "a model is data"** in the README's "Testing", with the way of the second opinion: the same seed drawn
  twice gives two equal states built apart, with no copy written by hand.
- **A better name than `parent()`** for a program that has inputs and no children. It is decided before a release,
  since it stays in the API.
- **`withheld` reviewed.** With typing gone from the candidates, what is left of its uses (the clock of `pages`) is
  counted in the tests, and whether it still earns its place is asked.
- **The revision a program did not write.** With a derivation, a program writes `field('')`, whose revision reads 0,
  and its state holds another: `expect(state.name).toEqual(field(''))` fails on a revision of 4. It harms no
  determinism and no replay; it surprises whoever compares whole states, or reads an `update` as "it returns exactly
  this". It is unseen in the view, which keys the input by the revision stored, and in the program's logic, which
  reads `value` only. Three ways, to be tried:
  - **document it**: the revision is the library's, a key and nothing else, and a test compares `value`. The
    cheapest;
  - **hide it from whoever makes a field**: `field(v)` returns a type of its own, which says "a new value here, its
    revision the library's", so that no program seems to have written 0. Whether the state stays plain to type with
    it is to be checked;
  - **the program keeps the revision under a check** ("A second opinion", way (a)), where the state stored is always
    the state written, at the cost of a `replace` at every change of value and of a defect on an undo by snapshot.

## What a consumer could notice

Nothing, while it stays in the examples (way 1), but the two sentences of the README, which applications cite as
rules. With way 3, new exports and a changelog entry; with the sentence "a model is data", a rule that a model
holding `changeName` breaks, so every program with an input changes: a breaking change of what the README promises,
with the version `release` asks for.
