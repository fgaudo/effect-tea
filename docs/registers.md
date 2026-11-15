# Registers: what the outside writes into a program's state

**Status:** the ninth review adopted and ported, 15 November 2026, on `main` since `4305f7d`, made on the branch
`claude/port-plain-input` ("The port of the ninth review"): an input is a plain value, a write names the value it was
written over, and a frame says how many of the view's messages it has seen; `Field`, `field` and `renewed` are gone,
and the seventh and eighth reviews are in `docs/rejected.md`. What is left is in "The port of the ninth review" ›
"Left". The sections before it are the history that led there, in the order it happened.

The document records a discussion with the owner, two reviews by Fable 5.2 (one of a design, one asked for ideas),
and one spike, kept on the branch `spike/field-register` (commit `0c6a357`, cut from `beaba6f`, never to be merged),
on Effect 4.1.4 and Bun 1.4.4, the six checks that followed, each on a branch of its own ("What the checks found"),
and a third review by Fable 5.2, asked what to adopt, with a spike of its own ("An independent opinion"), and a
fourth, on how that spike derives a revision ("A second opinion"), and a spike of the three ways to keep the revision a
program did not write ("The revision a program did not write, spiked"), and a spike of the subscriptions of a program
with an input ("The subscriptions with an input, checked"), and a fifth review by Fable 5.2, on what may write into an
input ("Only what is drawn writes"), and a sixth, on the name of `parent` ("The name"), and the bridges tested in
happy-dom ("The bridges, in happy-dom"), and a recipe of a bridge for a source that belongs to the control, tested
there too ("A source that belongs to the control"), and a slider in an example ("A slider, in an example"), and a
seventh review by Fable 5.2, with a spike, on how to close concern 3 ("Whoever steps replaces what is below"), and an
eighth, with a spike, on how a parent applies its child's rule there ("The channel of a replacement, declared"), and a
ninth, with a spike and a free hand over the whole library, which replaces the revision with a plain input and a frame
that says what it has seen ("A plain input, and a frame that says what it has seen"), none yet decided, and two
spikes of the ninth, its React bridge and its numbering ("The ninth review, in React and in its numbering"), and a
spike of its slider and a measure of its writes, with what the owner accepts of it ("A slider, the cost of `was`, and
the bridges' part"), and a tenth review by Fable 5.2, on the shape of the rule a bridge calls ("The rule a bridge
calls").
What the spikes ran is marked **run**; what was read in the code at `beaba6f`, **checked**; what was only argued,
**reasoned**. It reopens the aim of [`declared-inputs.md`](declared-inputs.md), suspended the same day, by another way,
and leans on [`inert-steps.md`](inert-steps.md), which it would simplify.

The document is in the order things happened: what stands now is in the next section, and a section older than a
later one may be superseded by it ("Open questions" and "The ways forward" by the checks and the two opinions).

## Where it stands

### Open: an input whose history its parent cuts

**The question.** The rule of a revision is applied after each step of the program that holds the input, and a
hierarchical composition splits that ownership: a child's state lives in its parent's, while the rule lives in the
child's `compose`. So:

- a parent that starts a child again leaves the child's field at the revision of its `init`; where that is the
  revision it had, the bridge keeps the old element, which shows the old text over an empty state, and a late
  keystroke is stored into the new child. A chat whose Send empties its draft sends the text twice. `main` holds it as
  it is, in `src/input.test.ts` ("restarts its inputs at the revision of its init, and takes what was typed into the
  old one");
- an undo by snapshot above a child brings a revision back;
- an optional place, or a child by id, that leaves and comes back has no state before it to compare with;
- apart from inputs, a fixed message drawn for an old child reaches the new one, since a message names a place.

**What the owner asks of an answer**, 15 November 2026: no recipe that a user must remember for a reset or an undo,
whatever the examples; the loop of a program stays simple; no weak point that leads to a patch or to more API. A
review has a free hand over the whole library, its engine and its loop, its composition, its invariants, and any
feature that stands in the way, and Elm, the owner's reference, need not be the answer.

**The proposals**:

- **The seventh and eighth reviews** ("Whoever steps replaces what is below", "The channel of a replacement,
  declared"): the rule applied by whoever steps to every input below it, through a channel from a child to its
  parent, with `all` in `each`, an input's place a lens, and a generation for what is left. They close the reset and
  the undo, but patch the split; the owner judged that complexity of parents and children too much, and asked for
  another way. Not formally declined.
- **The ninth review** ("A plain input, and a frame that says what it has seen"): the candidate. It takes the
  revision out: an input is a plain value, a write names the value it was written over and is rejected when the place
  holds another, and a frame says how many of the view's messages it has seen, so that the bridge never replaces an
  element. It removes the split instead of bridging it, keeps the loop and the composition, and drops `Field`,
  `renewed` and rule (A). Spiked in Snabbdom, then in React, where it holds as a component, `Shows`, with its run's
  registry in a context, and in its numbering, which rests on no undocumented premise of Effect and has a test and a
  mutation for each check of the engine ("The ninth review, in React and in its numbering"). A slider ported to it
  needs a rule of its own only where its bounds narrow, which the owner puts outside what is guaranteed, and a write
  over the value held costs one `===` more than a write at a revision, the bridge's check on each frame under 0.3% of a
  frame for 1000 inputs, and a rejected write under 3 µs ("A slider, the cost of `was`, and the bridges' part").

**Accepted by the owner**, 15 November 2026, for the ninth review: a tie between the library and its bridges, as a
condition of the guarantees of inputs on the elements and the renderers, rather than a weak point in the library; a
native widget that does not meet it is replaced by one the program draws, as web applications do; the library gives a
frame and the renderer reads it and draws it, and nothing else is supported or advised; and the example of a slider
shows both, side by side ("A slider, the cost of `was`, and the bridges' part" › "What the owner accepts").

**The rule a bridge calls: (c), for now**, by the owner the same day, after a tenth review by Fable 5.2: `drawn(held |
undefined, value, seen)`, and `typed(held, value)`, which makes the write itself and returns it with a pure
continuation that takes its number; `Shown` opaque but for `value`; `shown` dropped ("The rule a bridge calls").

**Done since**: adopted by the owner and ported ("The port of the ninth review").

**Open too**: a `File`; the ideas of "To explore", each spiked or measured before it is proposed. A reaction to every
keystroke, a subscription keyed by the input's value, was run again on the plain input and is closed ("The port of
the ninth review").

### On `main`: decided

**The direction: decided**, by the owner on 14 November 2026: an input declared in `compose`, beside the children
(`inputs: { Name: input(at) }`), whose field `Field<A>`, `{ value, revision }`, lives in the program's own state; the
view sends `write(field, value)` through `dispatchTo(dispatch, 'Name')`; `compose` stores a write at the revision held
and rejects any other, so the late keystroke is closed for every input; no function is left in a model. Neither the
engine nor the testing tools change. See "An independent opinion" and "A second opinion".

**Who keeps the revision: decided, (A).** The owner chose, after the spike of the revision a program did not write, a
derivation by value with `renewed`, the one the second opinion recommends, with the sentences of way 1: the revision is
the library's, a key and nothing else, and a test compares `value`; neither a placeholder nor a brand ("The revision a
program did not write, spiked"). Accepted with it: the state stored differs from the state written in the revision once
a value changed, and a `toEqual(field(''))` fails after the first replacement. The direction as a whole was decided
after it ("The direction"). The ideas of "To explore" wait for the implementation. The writes in the search of
interleavings, the last check of the subscriptions, go to the implementation too, by the owner's choice: for the engine
a write is a message of the composed program like any other, so the search can find a fault of the rule of `compose`,
not of the shape of the API.

**Only what is drawn writes into an input: decided.** The owner accepted the rule of a fifth review by Fable 5.2
("Only what is drawn writes"): a subscription never writes into an input, nor does a command's answer. A value from
a source that exists whatever is drawn (a scanner, a dictation) is a message of the program, and its `update`
replaces the field or holds the value until it chooses to. A drag the program draws follows: its start is a fixed
message of the model, its moves are messages of a subscription keyed by the state of dragging, and no input is
involved; a native range stays an input. A source that streams while the user types, as a dictation sending partial
results, may belong to the control instead, which writes what it hears as the user types it, at the revision of the
frame on screen: a recipe of the bridges' tests, not of the examples nor of the README ("A source that belongs to the
control").

**The name: decided, `composition`.** The owner chose, after a sixth review by Fable 5.2 ("The name"), to rename
`parent` to `composition` (and `ParentTypes` to `CompositionTypes`), since a program with inputs and no children is
made with it too, and to keep every other name: `compose`, `child`, `each`, `input`, `inputs`, `children`, the
names of `input.ts`, `dispatchTo` and `CompositionDefect`. "Parent" stays the word of the prose for a program that
has children.

| | (A) Derived by value, with `renewed`: chosen | (B) Kept by the program, under a check |
| --- | --- | --- |
| Spiked | yes, `spike/register-input-by-value` | yes, `2c4f3b5` on `claude/spike-revision-unwritten-b1e290` |
| The state stored is the state written | not in the revision, when the value changes | always |
| Emptying after a save | `name: field('')` | `name: replace(state.name, '')` |
| A Clear on an empty field | changes nothing: it may stay shown | acts twice: rejected, and left out of the model |
| An undo by snapshot | the old state as it is | each input rebuilt with `replace`, or a `CompositionDefect` |
| A new input for the same value | `renewed(state.level)`, to be remembered | `replace(state.level, state.level.value)`, as always |
| A field written by hand, or an old one | corrected in silence | a `CompositionDefect`, perhaps first in production |

The column (B) is the sketch written before its spike, which confirmed it. Identity, the rule of the first spike, is
refuted by the second opinion: a copy equal by value would draw a new input and reject what is being typed.

**The late keystroke on `main`: closed by the implementation.** The owner chose not to fix it in `examples/form`
before the implementation, which rewrote the form and its inputs; `examples/form/late-key.test.ts`, ported from
`claude/spike-register-late-key-6cb914`, holds it.

**A command's answer: narrowed**, 15 November 2026 (`e95f10b`): a parent's command answers with its own messages or
its children's external ones, as its handles send them, so that it writes into no child's input, against "Only what
is drawn writes", and gives no child its own business. Found on the way to the seventh review ("Whoever steps
replaces what is below" › "What it does not close").

Also done on `main`, apart from the decisions above: the bridges tested in happy-dom ("The bridges, in happy-dom"), a
source that belongs to the control ("A source that belongs to the control"), a slider in `examples/volume` ("A slider,
in an example"), and `bench/keystrokes.ts` dropped ("The implementation").

### The branches

Local to this machine and never pushed, none to be merged: `spike/field-register`,
`claude/spike-register-checks-fd58e1` (no commit of its own), `claude/spike-register-late-key-6cb914`,
`claude/spike-register-model-data-52ba83`, `claude/spike-register-shapes-ea38c5`,
`claude/spike-register-opaque-3fc182`, `claude/spike-register-slider-f36368`, `spike/register-input-compose`,
`spike/register-input-by-value`, `claude/spike-revision-unwritten-b1e290`, `claude/spike-register-subscriptions`,
`worktree-agent-a144664c3ddf8f27a`, `worktree-agent-a04cfe354d300ce70`, `worktree-agent-a02816c77ebec330c`,
`claude/spike-react-plain-df66b2`, `claude/spike-seen-premise-4b91ce`, `claude/spike-volume-plain-031355` and
`claude/bench-write-was-b77d29`. The
first spike and the six checks are cut from `spike/field-register` or `main` before this document; the two opinions
from `c263478`; the spike of the revision a program did not write, and that of the subscriptions, from `c445a5b`; the
seventh review's from `9a58662`, and the eighth's from the seventh's, cherry-picked onto `9a58662`; the ninth's from
`b63a5b6`; its spikes of React, of the numbering and of the slider, and its measure, from the ninth's `4757546`. The
last seven live in worktrees under `.claude/worktrees/`, which a cleaning of the worktrees removes: their branches
stay.

## The implementation

Ported by hand from `spike/register-input-by-value` (`c445a5b`), with the sentences of way 1 (`50d5561`), the tests of
the subscriptions (`d686ddf`) and `late-key.test.ts`, on a branch cut from `main` at `479b2de`:

- `src/input.ts` (`Field`, `field`, `write`, `Written`, `renewed`, and the rule, `written` and `replaced`) and
  `compose.ts` (`input`, `inputs`, `children` optional); `runCommand`'s answers narrowed to `Own | ChildMessages<C>`.
  The two tests of types that refuse a write from an own subscription and from a command's answer annotate the state
  of `update`, so that the own messages are inferred from it alone: without that, `Own` was inferred from the write,
  and the tests failed to compile with the check or without it.
- Eight mutations in `mutations/mutations.ts`: the five of "An independent opinion", adapted to the derivation by
  value (a child's step and an `onEvent` replacing nothing, where the spike took them out as counted), a revision that
  stands still under a changed value, one lowered that comes back, and a value compared by identity.
- The search of interleavings draws writes into a note of the list, from the frame on screen and from an older one,
  which `Clear` replaces, with a search keyed by the note's text; three properties check the rule of a write, the
  revision of a replacement, and the search that follows the text.
- The README, `docs/invariants.md`, `docs/boundary.md` (item 4 reopened), the changelog, `examples/form` and
  `form-react`; `examples/field.ts` removed.
- Not done: a slider in an example, done since ("A slider, in an example"); the bridge's parting of screen and
  state, and the focus a replacement loses in snabbdom and React, which "Only what is drawn writes" asks to test,
  done since ("The bridges, in happy-dom"); `bench/keystrokes.ts` of the subscriptions' spike, not ported, and
  dropped: what it measures is the cost `bench/subscriptions.ts` measures, a `HashMap` of every key built on each
  change of state, since an input lifts no key, and the write itself is constant ("The subscriptions with an input,
  checked").

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

### What is to be checked of them, with an input declared in `compose`

Added after the two opinions. None is run; each is a test before it is a sentence. Five were checked since ("The
subscriptions with an input, checked").

- **An input lifts no subscription.** In `spike/register-input-by-value`, `compose` lifts the subscriptions of the
  names of `children` only, and an input's program has none (`src/compose.ts`, **checked**). A test is to hold it: a
  program with inputs and subscriptions of its own keeps its keys, and no key under an input's name appears.
- **A reaction to every keystroke as a subscription keyed by the value** (an autosave, a search as one types), as
  the first opinion would make it. Through a run: each write ends the subscription of the old value and starts one
  for the new, which debounces by itself; a value typed back ('a', 'ab', 'a') starts one anew, which is to be
  squared with "an ended one is never restarted automatically", since the key went away between; with (A), a
  replacement by an equal value, and `renewed`, restart nothing when the key is the value. Whether the key should be
  the value, the revision, or both, is to be decided from it.
- **The cost of a keystroke.** Every write is a new state, so `subscriptions(state)` and the reconciliation by key
  run on each: the lifted subscriptions of the children are kept by their state objects, which a write into the
  parent's input leaves alone. To be measured with `bench/`, under "frames cost only what is drawn".
- **A subscription that writes into an input** (a dictation, a scanner of codes). It would send `write(field, v)`
  with the field it started with, and after a replacement every write of it is rejected, unless it is keyed by the
  revision. Whether a subscription may write into an input at all, or sends a message of the program that puts a
  `field(v)` in the place, is to be decided, by a test of each.
- **The order of a write among the rest, searched.** The late key is held by two deterministic orders. The search of
  interleavings (`interleaving.test.ts`) draws clicks, answers and subscription messages, not writes: drawn writes,
  current and stale, would search the guarantees with inputs among them, the start and stop of a subscription once
  the new state is published included. A change of the search follows `change-engine`.
- **Where a drag falls now.** A native range is an input; a drag the program draws (a canvas, a sortable list) is a
  fixed start and a subscription keyed by the state of dragging. Whether its moves write into an input or are
  messages of the program is to be spiked on the input's design.
- **No control drawn still goes through a key.** The examples are to be read for a subscription that a control
  drawn on screen feeds, so that "What a key sends is not data" is left with sources that exist whatever is drawn.

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
  (the README's "Rejections and defects" now says the three as one choice).
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
answer on the branch `spike/register-input-compose` (commit `6b97cb6`, cut from `c263478`, never to be merged).
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
data in the `Step`; (c) a derivation by `Equal`. It worked on the branch `spike/register-input-by-value`, cut from
`6b97cb6` (commits `11ea804`, the concerns on the spike as it was, and `c445a5b`, its answer, never to be merged). It
reports
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
messages. The owner prefers the first, as the review recommends ("Where it stands").

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
  since it stays in the API. Decided since: `composition` ("The name").
- **`withheld` reviewed.** With typing gone from the candidates, what is left of its uses (the clock of `pages`) is
  counted in the tests, and whether it still earns its place is asked.
- **The revision a program did not write.** With a derivation, a program writes `field('')`, whose revision reads 0,
  and its state holds another: `expect(state.name).toEqual(field(''))` fails on a revision of 4. It harms no
  determinism and no replay; it surprises whoever compares whole states, or reads an `update` as "it returns exactly
  this". It is unseen in the view, which keys the input by the revision stored, and in the program's logic, which
  reads `value` only. Three ways, tried since ("The revision a program did not write, spiked"):
  - **document it**: the revision is the library's, a key and nothing else, and a test compares `value`. The
    cheapest;
  - **hide it from whoever makes a field**: `field(v)` returns a type of its own, which says "a new value here, its
    revision the library's", so that no program seems to have written 0. Whether the state stays plain to type with
    it is to be checked;
  - **the program keeps the revision under a check** ("A second opinion", way (a)), where the state stored is always
    the state written, at the cost of a `replace` at every change of value and of a defect on an undo by snapshot.

## The revision a program did not write, spiked

The three ways of "To explore" were spiked on the branch `claude/spike-revision-unwritten-b1e290`, cut from
`c445a5b`, one commit each (never to be merged). It reports `typecheck`, `lint` and `test` green on each; `test:node`
and `interleavings` on the two that change `compose.ts`; `mutations` on none. Each **run** finding has a test seen to
fail with its change taken out by hand. Typecheck and `test` (579) were run again apart on the last commit, green.

| Way | Commit | `test` | `test:node` | `interleavings` |
| --- | --- | --- | --- | --- |
| 1. Document it | `50d5561` | 571 | not run: `compose.ts` unchanged | not run |
| 2. Hide it from whoever makes a field | `6660965` | 576 | 515 | 14 |
| 3. The program keeps it, under a check | `2c4f3b5` | 579 | 518 | 14 |

### 1. Document it

- **Run**: the form's tests compare a whole field in three places. The two after a save, written as a user would
  (`field('')`), fail, with a diff of `revision: 0` against `1` that says why; the third, after a failed save, passes
  only because nothing replaced the input. The trap is met at the first replacement, not before.
- The sentences are written in the README and in `Field`'s doc comment: the revision is the library's, a key and
  nothing else, and a test compares `value`.
- **Reasoned**: `toMatchObject`, the recipe for a whole state, is weaker than `toEqual`: an extra key passes.

### 2. Hide it from whoever makes a field

`Revision` is a branded number no program can write; `field(v)` carries an unwritten revision (−1 at run time), which
`compose` stamps in `init`, where an input appears, and after each step.

- **Run**: the state keeps one type, written and read: nothing leaks into `parent`, `makeModel`, the bridges,
  `simulate`, `rehearse`, `drive` or `dispatchViolations`.
- **Run**: the leak is in the tests, 46 type errors: Bun types `toEqual` and `toBe` against the value received, so a
  literal revision in an assertion no longer compiles.
- **Run**: the trap moves and stays. `toEqual(field(''))` fails from `init` on, and still passes on a state a test
  built by hand with `field` and never replaced.

### 3. The program keeps it, under a check

`replace(field, value)` raises the revision; `compose` raises a `CompositionDefect` when a step lowers a revision, or
changes a value at the revision it held.

- **Run**: the state stored is the state written, so concern 1 is closed; the form and the late key port with one
  word.
- **Run**: the form left unported dies at its first save, and only the three tests that reach a save find it:
  `dispatchViolations` passes, since a command's answer is none of the model's messages.
- **Run**: an undo by snapshot is a defect; rebuilt, a line per input.
- **Run**: a Clear always shown acts twice again (`ActsTwice`).
- **Run**: a copy of a field equal by value is stored as a new object, so a renderer that skips by reference draws it
  again.

### Against "Where it stands"

| | (A), way 1 | (A), way 2 | (B), way 3 |
| --- | --- | --- | --- |
| The state stored is the state written | not in the revision, once a value changed | never, for a field made with `field` | always |
| `toEqual(field(v))` | passes until the first replacement | fails from `init` on; passes on a state built by hand | holds wherever the program wrote `field(v)` |
| A Clear on an empty field | changes nothing | changes nothing | acts twice |
| An undo by snapshot | the old state as it is | the same | a defect; rebuilt, a line per input |
| A field written by hand | corrected in silence | does not compile | does not compile |
| An old field, or `field()` in a step | corrected in silence | corrected in silence | a defect, found only by a test that reaches the step |
| Concern 3 (a place that comes back, a child restarted) | open | open | open |

### Recommendation, by the spike

(A) with the sentences of way 1, and neither the placeholder nor the brand of way 2:

- **Not way 2**: it moves the trap without removing it, and costs a stamp and a brand that breaks every literal
  revision in the tests. Under (A) the brand protects nothing, since a field written by hand is corrected anyway.
- **Not (B)**: it is the honest way, but a forgotten `replace` is a defect the tools of the model cannot find, and the
  Clear that acts twice comes back.
- **Against it**: concern 1 stays. A user's natural `toEqual(field(''))` fails after the first replacement, and the
  recipe on `value` that replaces it is weaker. If concern 1 ranks above the rest, (B) with the brand is the way, and
  the brand earns its place there.

## The subscriptions with an input, checked

The points of "What is to be checked of them" were taken on the branch `claude/spike-register-subscriptions`, cut
from `c445a5b` (commit `d686ddf`, never to be merged): `src/input-subscriptions.test.ts` (6 tests) and
`bench/keystrokes.ts`. It reports `typecheck`, `lint` and `test` (576) green; `test:node`, `interleavings` and
`mutations` were not run, since no file of `src/` but a test changed. Each **run** finding that rests on a check has
a test seen to fail with the check taken out by hand.

- **An input lifts no key**, **run**: a program with an input, a child that listens and a subscription of its own
  lists two keys, its own and `['Ticking', 'ticks']`. It holds by construction, not by a check: lifting the inputs
  too (`names` over every place) leaves the test green, since an input's program has no subscriptions, so it has no
  mutation. A write into the input leaves the child's state, and its lifted subscription, the same objects.
- **A reaction to every keystroke**, **run**, through a run, with a subscription that logs its starts and stops:
  - keyed by the value: each write that changes it stops the subscription before and starts one, a debounce by
    interruption; a value typed back (`'a'`, `'ab'`, `'a'`) starts one anew. That keeps "an ended one is never
    restarted automatically": the key went away between, which is when the README says a subscription starts again.
    `field(v)` over the value held, and `renewed`, start nothing;
  - keyed by the revision: writes start nothing, and each new input does, `renewed` included. Under identity in place
    of value (the first opinion's rule), `field(v)` over the value held starts it again: the test fails.
  - So the key says what the subscription reacts to: the value, for what is typed (a search, an autosave); the
    revision, for the input itself. It is the program's choice, as every key is, and the library adds nothing:
    **reasoned**.
- **A subscription cannot write into an input**, **run** as types: a parent's own subscriptions send its own messages
  (`Subscriptions<State, Own>` in `compose`), and an own message named as an input is refused (`NoClash`), so a
  `write` from a subscription does not compile. A dictation sends a message of the program, whose `update` puts the
  value in the place. That is a replacement, **run**: even a field written at the revision held gets the next, and
  what the user types into the old input at that moment is rejected (the test fails if the revision may stand still).
  Whether that is right (a scanner while the user types), or a subscription should write as the view does, which
  would widen what an own subscription sends, was decided since ("Only what is drawn writes").
- **The cost of a keystroke**, **run** with `bun bench/keystrokes.ts`: a list of children by id that each tick, and an
  input in the parent's state, on one machine (Bun 1.4.4, Windows):

  | Children | `subscriptions`, per tick | per keystroke | `update`, per tick | per keystroke |
  | --- | --- | --- | --- | --- |
  | 10 | 2.4 µs | 1.9 µs | 1.1 µs | 0.4 µs |
  | 1000 | 219 µs | 215 µs | 8.5 µs | 0.3 µs |
  | 10000 | 2490 µs | 2591 µs | 40.6 µs | 0.6 µs |

  A keystroke costs `subscriptions` what any change of state costs: linear in the children, each lifted from the
  cache of its state object, and the same as on `main` (`bench/subscriptions.ts`: 218 µs and 2266 µs there, 222 µs
  and 2274 µs on the spike). The write itself is constant. So the input adds nothing against "frames cost only what
  is drawn": what a keystroke pays is today's cost of building the `HashMap` of every key on each change, which a
  list of ten thousand children pays on a tick too.
- **No control drawn goes through a key**, **checked**: the examples' subscriptions are clocks (`list/stopwatch.ts`,
  `pages/clock.ts`, `timer/timer.ts`), which `pages/app.ts` and `timer/timers.ts` lift. None is fed by a control, so
  "What a key sends is not data" (`ROADMAP.md`) is left with sources that exist whatever is drawn.
- **Not done**: the writes in the search of interleavings, a change of `interleaving.test.ts` that follows
  `change-engine` and is a step of its own; and a drag, which no example draws, settled since by the rule of "Only
  what is drawn writes".

## Only what is drawn writes

A fifth review by Fable 5.2 was asked whether a subscription should write into an input as the view does, or send a
message of the program, which replaces the field, as the spike has it. It read the spike at `d686ddf` and left no
file. Its verdict, which the owner accepted: keep it, and refuse a command's answer too.

- **A write from elsewhere than the element breaks the premise the rule of a write rests on**, that the input on
  screen already shows it. The bridge sets an element's value only when it makes it (`initialValue`, keyed by the
  revision), so a write at the revision held from a subscription changes the state and not the screen, and the next
  keystroke sends what the element shows and erases the value in silence: **run** at the level of `update` (a write
  of `'SCAN'` over `'Hel'` stored at revision 0, then `'Help'` over it), **reasoned** in a DOM. To show it, the
  bridge would push the state's value into a live element, the controlled input the design avoids: "last write
  wins" is not on offer, only a new input or a value unseen until overwritten.
- **A write carries the revision of the frame its control was drawn in**; a subscription has no frame, so no honest
  revision: the one it started with is a stale capture, and one keyed by the revision restarts the source on each
  replacement to fake it (**reasoned**).
- **A program already gets what it wants without the library**: a pending value in the state, which a `Scanned`
  message sets while the field stays the very same object, so that what the user types is still stored, and a
  replacement with `field(pending)` when the program chooses (**run**). Widening what an own subscription sends
  would do nothing Effect cannot, for the sake of one kind of application, and add a kind of message `simulate` and
  `rehearse` would be asked about (**reasoned**).
- **`reject` keeps one meaning**: the keystroke rejected after a replacement was written into an input no longer on
  screen (**checked**, `src/input-subscriptions.test.ts`).
- **A finding**: in the spike, `runCommand`'s answers include the inputs' messages (`RunCommandOf<OwnCommand, Own |
  ChildMessages<C> | InputMessages<I>, R>`, `src/compose.ts:247`, **checked**, and **run** as types), so a
  subscription reaches an input in two hops, an own message and a command whose answer is a `write`, with the same
  fault. The implementation narrows it to `Own | ChildMessages<C>`, with a `@ts-expect-error` beside the
  subscription's.
- **Against, by the review itself**: a replacement is harsh on a source that streams, such as a dictation sending
  partial results while the user types: each one makes a new element, and focus, caret, selection and an IME
  composition are lost with what was in flight. Such a source belongs to the control (the component listens, the
  element changes, and it writes at the frame's revision), a recipe of a bridge, tested since ("A source that belongs
  to the control").
- **To be tested in the implementation**: the screen and the state parting in a bridge, in happy-dom; whether a
  replacement loses focus in snabbdom and in React, which weighs the argument against; narrowing `runCommand`'s
  answers breaking nothing in the examples and tests. The first two are tested since ("The bridges, in happy-dom").

## The name

A sixth review by Fable 5.2 was asked what `parent` should be called, now that a program with inputs and no children
(`examples/form/form.ts`) is made with it, and whether to swap it with another name or rename others with it. It read
`main` at `9a58662` and left no file; it compiled and ran nothing. Its verdict, which the owner accepted: rename the
entry function alone, `parent` to `composition`, and keep the rest.

- **For**, **checked**: the vocabulary of composition already covers inputs everywhere but the entry word (the
  README's "Composition" › "Declaring children", "`inputs` in `compose`" in the changelog, `CompositionDefect`); and
  `composition` was no identifier of any `.ts` or `.tsx` of the repository. **Reasoned**: as `Data.taggedEnum<T>()`,
  it names what is made, its types fixed first.
- **Weighed and refused**:
  - keeping `parent`: free, and right for 59 of the 66 calls, but the README had to excuse it ("is made with `parent`
    too"), three lines after "An input is no child";
  - `program<T>()`: 37 `const program` in the tests, which it would shadow (**checked**); its keys are not those of
    `Program<{ state; model; message }>`, and it would invite a program of no parts made with it, a second way to
    make the same thing (**reasoned**);
  - swapping it with `compose` (`compose<T>()`, then `make` or `program`): it touches the 84 calls of `compose(` too,
    and a word that changes role is the worst rename for whoever upgrades;
  - `composed`, `composing`, `define`, `declare`, `typed`, `withTypes`, `host`, `owner`, `container`: no precedent in
    Effect, a name of the mechanism and not of the concept, or a metaphor no document uses (**reasoned**);
  - renaming `child`, `each`, `children`, `inputs`, `input`, the names of `input.ts`, `dispatchTo` or
    `CompositionDefect`: they are exact, and with `composition` the last is more coherent, not less.
- **Against, by the review itself**: every user of 0.7 renames, in every program with children, for a case that is 7
  calls in 66; `composition<…>()` then `compose({…})` is nearly a tautology, and longer; "composition" is a wide word
  for a form of one input, less wrong than `parent` and not exact; whoever looks for `parent`, as in Elm, no longer
  finds it as a function.
- **Found in passing**, prose and no name: the doc comment of `dispatchTo` and its row in the README's "API
  reference" said only "a child's dispatch", though an input is written through it too, and are corrected with the
  rename; an internal helper `Field<T, K>` of `src/program.ts`, namesake of the public `Field<A>`, which `compose.ts`
  imports as `Input` to avoid it, is left as it is.

## The bridges, in happy-dom

What "Only what is drawn writes" left to test in a DOM, in the bridges' tests (`examples/snabbdom.test.ts` and
`examples/react.test.ts`, the same three tests in each), on a note of one input that the program replaces on a message
no control drawn sends, as a source that exists whatever is drawn would. **Run**, on happy-dom, snabbdom 3.6.4 and
React 19.3.1, and each test seen to fail on a view or a bridge that breaks what it checks: an input keyed by its value
in place of its revision, by a constant, or rewritten from the model (a snabbdom module that sets `value` on every
patch, React's `value` in place of `defaultValue`).

- **The screen and the state part**, as the fifth review reasoned: a write at the revision on screen, sent through the
  input's dispatch from elsewhere than the element, stores `'SCAN'` over `'Hel'`, the element keeps showing `'Hel'`,
  and the next key stores `'Help'` over it, in silence. A rewritten input shows `'SCAN'`, which is what fails the
  test: the parting is the price of an input the bridge does not control.
- **A frame drawn while the user types keeps the element**, and with it the focus, the caret and the selection.
- **A replacement loses all three**: the new input has no focus, and its caret and selection are at 0. The argument
  against the rule holds as the review put it, for a source that replaces while the user types.
- **Not checked**: a real browser, where focus and selection are the browser's and not happy-dom's; an IME
  composition, which happy-dom does not model. A recipe of a bridge for a source that belongs to the control is
  tested since ("A source that belongs to the control").

## A source that belongs to the control

The recipe the fifth review left unwritten ("Only what is drawn writes"), for a source that streams while the user
types, such as a dictation sending partial results: the control listens to it, not the program, puts each result
into the element on screen, and writes it into the input at the revision of the frame drawn, so that the element
stays and nothing is replaced. Tested in the bridges' tests (`examples/snabbdom.test.ts` and `examples/react.test.ts`,
the same two tests in each), on the note of "The bridges, in happy-dom", with a stand-in for the source that calls
its listeners at once. **Run**, on happy-dom, snabbdom 3.6.4 and React 19.3.1. By the owner's choice, it stays in the
tests of the bridges: neither the examples nor the README show it.

- **The recipe, in each renderer**, a view's code that changes neither the bridge nor the library. With snabbdom, the
  input starts listening in its `insert` hook and stops in its `destroy`, and each result sets the element's `value`
  and dispatches an `input` event, which `onWrite`, the listener of the frame on screen, writes at its revision. With
  React, a component listens in a `useEffect`, through a `useEffectEvent` that reads the latest field: each result
  sets the element's `value` through a ref and sends `write(field, text)`, and the input inside it is keyed by the
  revision.
- **The element stays, and the screen and the state never part**: two results, one after the other, are shown by the
  same element, which keeps the focus, and are stored; a key the user types next is stored over them.
- **After a replacement**, the results go to the new input, at its revision, and none to the one replaced.
- **Seen to fail**, each test, on a recipe that breaks what it checks: the element's text set and nothing written, or
  written and the text not set; in snabbdom, a listener never stopped, which writes into the element replaced; in
  React, the field captured when the component starts listening, whose writes are rejected after a replacement.
- **Not checked**: the caret, which a `value` set moves to the end in a browser, so that a source that inserts at
  the caret, rather than giving the whole text, needs more than this recipe; a real browser; an IME composition while
  a result arrives.
- **Found in passing, and no fault**: a refresh right after a dispatch, in the same turn, draws the state before
  it, and the next refresh the state after. A dispatch only queues its message, which the program applies in a later
  step of the scheduler: the refresh draws the latest state applied, as each `renderInto` says (**run**, by a session
  of its own, with a renderer gated by hand and without a DOM, and with the frames rebuilt in plain Effect, which
  behave alike). In a browser a screen refresh can land there too. The tests of the dictation let the program settle
  before they refresh.

## A slider, in an example

The slider of the sixth check ("A slider, and the field generic over its value"), ported to the implementation as
`examples/volume`: a level that Mute takes to 0, Unmute gives back, and Quiet hours caps at 30, drawn with snabbdom,
with `onSlide` in both bridges, which writes a range's `valueAsNumber` into the field drawn. **Run**, on happy-dom,
snabbdom 3.6.4 and React 19.3.1.

- **`renewed` where the value does not change.** The spike replaced the level on every Mute and every Quiet hours;
  by value, `field(v)` is a new slider only when `v` differs. Two cases keep it: Mute on a level already at 0, where
  a drag of the slider drawn before, handled after, would be stored into a muted volume, and Quiet hours on a level
  within the new bounds, where a slider drawn up to 100 would write 80 under a maximum of 30. The example gives a new
  slider for a value through one function of its own, `renewed(level)` when the value is the same and `field(v)`
  otherwise; each case is held by a test of the example, seen to fail without `renewed`.
- **Unmute needs none**: the muted slider cannot be dragged, and a drag from before Mute has an older revision.
- **Bounds before the value.** happy-dom keeps a range within the bounds it has when its value is set, and does not
  bring it back within bounds set after (**run**): snabbdom's `initialValue` is written after the props, so a new
  slider has its bounds first. A browser brings a range back within its bounds whenever they change (**reasoned**, by
  the HTML specification's sanitization of a range, not run in a browser).
- **The bridges' tests**, the same two in each: a drag writes its number and a frame drawn meanwhile keeps the
  slider; bounds that narrow draw a new slider within them, for a level within them and for one above. Seen to fail
  on an `onSlide` that writes nothing, and on a slider keyed by a constant. React's has no example: its test draws
  `volume` with a view of its own.
- **Left as it is, and said in its comment**: `messagesSentBy` records the writes of a view's inputs among its
  messages, which no model holds, so a test that compares them with the model's leaves the writes out first; and its
  stand-in of the event has only the text, so a slider's write holds `undefined` (**run**, on the views of `form` and
  `volume`). No test compares the messages of a view with inputs: a number for a slider, by an argument beside
  `typed`, waits for one that does.

## Whoever steps replaces what is below

A seventh review by Fable 5.2 was asked how to close concern 3 ("Where it stands" › "Open"), with a free hand to
change the design or the invariants, for a solution that is pure, clean, coherent and elegant. Its spike is on the
branch `worktree-agent-a144664c3ddf8f27a` (commit `2d2e77b`, cut from `9a58662`, never to be merged):
`src/compose.ts`, `src/input.test.ts` and `src/input-below.test.ts`. It reports `typecheck`, `lint`, `test` (589),
`test:node` (528) and `interleavings` (17) green; `typecheck` and `test` were run again on its commit, and its six
tests of a child replaced were seen to fail on the `compose.ts` of `9a58662` (**run**). `mutations` was not run, and
would fail: the mutation at `mutations/mutations.ts:711` names a line the spike rewrote. Not decided.

### The proposal

One idea in three parts: an input's history is never cut where the library can see it, and where it is cut, the
instance has a name.

1. **The rule of a replacement is applied by whoever steps, to every input below it.** After a step a program's own
   code makes (its `update`, or what its `onEvent` makes of a child's event), every input in its state that holds
   another value gets the next revision, its children's included, at any depth. What the library routes to a child
   is the child's step, and the child applies the rule to itself. It is rule (A) with its quantifier corrected: today
   it holds only for the inputs of the program that steps, because that is where `replacing` was written.
2. **An input's place is always there**: `input(at)` takes an `Optic.Lens`, stable in Effect 4.1.4 (**checked**),
   not an `Optional`. A value that may be missing is a `Field<Option<A>>`, and an input that may be missing is an
   input of a child that may be missing.
3. **What is left is one class, said once**: a message names a place, not an instance. A child that leaves and
   another that comes to its place are told apart by an id, as children by id already are: `each` keyed by a
   generation the parent keeps in its own state, with no new API.

Why, by the review:

- **Who stepped tells a restart from typing**, which "A second opinion" held no rule of before and after can: a write
  reaches a child as a routed message only, never through its parent's own code, so on a parent's own step another
  value below is always a replacement. Applied to routed steps too, the rule fails 12 tests, writes among them
  (**run**).
- **The premise holds by the types already**: a handle takes a child's external messages, which for a composed child
  are its own and none of its inputs', so a parent's own step cannot write into a child's input (**run**, a
  `@ts-expect-error`). A command's answer is routed, not a parent's own step, and does not confuse the rule.
- **No memory is added**: `update` stays pure, the state stays the fold of `update` over messages, the engine and the
  testing tools do not change, and `Field` stays the only state the library shapes (**reasoned**).
- **The residue is a theorem, not a gap of the design**: a revision survives only where a `Field` survives, a place
  that was empty has no before, and the library keeps nothing outside the state; so an instance across a gap can be
  named only by state the parent holds, and the id is that name (**reasoned**).

### What it found

- **A third hole, not in this record**: an undo by snapshot kept by a parent brings a child's revision back. Kept at
  `('Ada', 0)`, the child discards to `('', 1)`, the parent undoes to `('Ada', 0)`, and the element of revision 0 may
  still be on screen, showing a keystroke that was rejected: **run** in the state, **reasoned** on screen. It is the
  likeliest of the three, and "a revision never comes back" is false for it today.
- **Six tests red on `9a58662` and green on the spike** (**run**): a child restarted by its parent's `update`;
  restarted with the value it held; restarted by what `onEvent` makes of its event; the undo above; two levels down;
  a child by id restarted under its id, the other rows left the same objects.
- **Each check taken out by hand** (**run**): no recursion below fails 7 tests, `onEvent` left out 2, a child by id
  not looked up 1.
- **The recipe of a generation passes on `main` as it is** (**run**): a child placed with `each`, its `get` answering
  only for `state.generation`; a late write and a late fixed message for the old instance are both rejected.
- **A lens only** (**run**, as types): an input under `Optic.some()` does not compile; the form is unchanged.
- **The cost**, measured once (Bun 1.4.4, Windows): a parent's own step over children by id that hold inputs costs
  4 µs at 10, 53 µs at 1000 and 611 µs at 10000; with no input below, 0.1 µs, as before. A write into one child does
  not pay it, and `subscriptions` costs about 2.5 ms per change at 10000 already ("The subscriptions with an input,
  checked").

### What it would change

- **API**: `input(at)` takes a `Lens`, a breaking change. `each` must list every child: the spike adds `all?`, which
  defaults to `subscribed`; the clean form is `all` required and `subscribed` optional, defaulting to it, as `child`
  has it, which breaks every `each`.
- **Internal**: a composed program carries how it replaces its inputs under a hidden symbol, which its parent reads;
  about 70 lines of `compose.ts`.
- **One behaviour dropped**: a child's routed step no longer replaces its parent's own inputs; what `onEvent` makes
  of its events still does. Only a `set` that touches an input could notice; no test does.
- **README**: "Its inputs' revisions" and the sentence that rejects what was written into an input "since replaced"
  say "by the program, or one above it"; `at` is a lens; "Structuring a program" gives the rule of the id.
- **`docs/invariants.md`**: the sentence that a child its parent starts again, and an optional place that comes
  back, restart an input's revision gives way to the rule and its residue.
- **Mutations**: three new (below, `onEvent`, the lookup by id), and the one at line 711 retargeted. A changelog
  entry and a version.

### What it does not close

- **A child that leaves and comes back** (an optional child, an id reused) and **the class of fixed messages**: by
  the recipe only, which the library does not enforce.
- **A child by id that neither `all` nor `subscribed` lists** is skipped in silence: an argument for `all` required.
- **A command's answer that writes into a child's input**: `ChildMessages<C>` includes a child's writes (**checked**,
  in the types); the review's two attempts to compile one failed on the inference of `Own`, not on the write. It
  compiled on `main`, with the state of `update` annotated (**run**), against "Only what is drawn writes", and a
  child's own message did too, against "a parent and its children talk only through external messages and events".
  Closed since, apart from this proposal: a parent's command answers with its own messages or its children's
  external ones (`ChildExternals<C>`), as its handles send them, held by a `@ts-expect-error` in
  `src/input-subscriptions.test.ts` and one in `src/compose.test.ts`, each seen to pass on `main`.
- A wrong `dispatchTo`, `init`, a `File`: as before. Nothing of it ran in a bridge.

### Refused, by the review

- **Revisions that cannot collide**: a global counter makes `field` impure; one stamped by the engine breaks
  `applyAll` and the tools; one hidden in the state is the cache `AGENTS.md` forbids.
- **A generation of instances as a concept of the library**: it duplicates the id, and puts a shape of the library
  around every child's state.
- **A write that carries the value the input showed**, a compare and swap: it closes the late write with no memory,
  but not the key; the stale element stays, then rejects every keystroke, and `renewed` cannot be said.
- **A rule that a parent restarts a child only through a message of the child's**: unenforceable, since a parent
  returns its state whole, and an undo by snapshot is legitimate.
- **The recipe alone, or the lens alone**: either leaves the undo above a child open, in silence.
- Frame identity, and inputs outside the state: as weighed earlier in this record.

### Against, by the review itself

- **Concern 1 widens**: a parent that writes `children.Note.init.state` stores a child at revision 1; for the first
  time, a parent's `compose` rewrites a child's state.
- **It is still partial**: the recipe alone closes all three classes with no change, and the recursion may give a
  false sense of completeness.
- **By value across a restart**: a child restarted with the value it held keeps its element, its focus and its
  caret, and a parent cannot ask `renewed` for a child's field.
- **The symbol is lost in silence** by a program rebuilt by hand rather than spread.
- **A lens only** refuses a legitimate optional input, such as a search box that may not exist.
- **A linear cost** on a parent's own steps, for a list whose rows hold inputs.

### What is left to decide

Whether to adopt it; then `all` required or optional in `each`; and whether a lens only is worth the optional input it
refuses. If adopted, the port is written from `main`, following `change-engine`: the spike is seven commits behind it,
before `parent` was renamed `composition` and before `examples/volume`, and the mutations are run on the port.

## The channel of a replacement, declared

An eighth review by Fable 5.2 was asked how a parent should apply its child's rule of a replacement in the seventh
review's proposal, where the spike passes it through a hidden symbol ("Whoever steps replaces what is below"), which
that review held against itself: a program rebuilt by hand rather than spread loses it in silence. It was given the
spike and the question, not a conclusion. Its spike is on the branch `worktree-agent-a04cfe354d300ce70` (commit
`45da546`, over `8015729`, which is the seventh review's `2d2e77b` cherry-picked onto `9a58662`; never to be merged):
`src/program.ts`, `src/compose.ts` and `src/input-channel.test.ts`. It reports `typecheck`, `lint`, `test` (593),
`test:node` and `interleavings` (17) green; `typecheck` and the four tests of the channel were run again on its
commit, and two of them were seen to fail on the symbol's `compose.ts` (**run**). `mutations` was not run; the README,
`docs/invariants.md` and the API report are not brought in step. Not decided, and needed only if the seventh review's
proposal is.

### The proposal

How a program replaces its inputs is a piece of it, declared and optional as `runCommand` and `subscriptions` are:
`replacing: (before: State, after: State) => State`, read through an internal `replacingOf`, beside `runCommandOf`
and `subscriptionsOf`. The types require it exactly when the program's messages carry writes: `Replacer<State,
Message>` sits in `Shape` beside `Interpreter<Command, Message, R>`, and `child` and `each` ask it of their program as
they ask `Interpreter`. It is required when a `Written` lies under `{ message }` at any depth, which is how `compose`
types an input's write and a child's message; `any` is asked nothing. At run time nothing changes from the seventh
review's spike: `compose` sets the property only when the program has inputs, its own or below.

Why, by the review:

- **It is the precedent the library has**: a piece that may be missing, required by the types exactly when the
  program's types need it, read through an `…Of`. The symbol is a third kind of thing, a property of a program that no
  type mentions.
- **The silent loss becomes a compile error**: a program rebuilt by hand without `replacing` is refused at
  `child(...)`, with the property named as missing (**run**).
- **A program written by hand, without `compose`, can be a child with inputs**: it writes `replacing` with
  `replaced`, which would be exported. Under the symbol, or a `WeakMap`, it cannot take part at all (**run** for the
  symbol: its input keeps revision 0).
- **"A type is Effect's or the library's" holds**: a program is the library's type with a public shape written by
  hand, and a member keyed by a hidden symbol makes it half hidden.
- **The engine and the testing tools see nothing new**: `run`, `simulate`, `rehearse`, `drive`, `applyAll` and
  `dispatchViolations` call `update` only, and the rule is applied inside the parent's `update` (**checked**, in
  `run.ts`; **run**, the suites green).

### Refused, by the review

- **The symbol, as spiked**: lost in silence by a program rebuilt by hand, and kept by `{ ...program, update: other }`
  for an `update` that is gone (**run**, the two tests red on it); a program written by hand or a wrapper cannot carry
  it, and no type or document can name it.
- **A `WeakMap` of the module, keyed by the composed `update`** (**reasoned**): it survives a copy by hand, but is lost,
  in silence again, by any wrapped `update`, the commonest reason to rebuild a program; a program written by hand
  cannot register in it without a new export, the declared field with worse ergonomics; and it gives the identity of a
  function a meaning, where the `WeakMap` of models is a memo whose loss costs only a recomputation.
- **A reserved message that the child's `update` answers** (**reasoned**): the parent would send a message outside the
  child's type, and an `update` written by hand with an exhaustive `switch` returns `undefined` on it, not `reject`
  (**checked**: `isRejected` is `result === reject`); the parent would first have to know whether the child takes it,
  the same channel again, and `reject` would gain a second meaning ("it has no inputs").
- **Fields found by their shape in the child's state** (**reasoned**): a `Field` carries no brand, by (A), so it would
  be a guess over any data, and linear on every step of the parent.
- **A defect when the rule is missing** (**reasoned**): a program with no inputs and one that lost its rule are the same
  value; the only evidence is a write passing through the routing, which would inspect message data and die at the
  first keystroke, perhaps first in production.
- **No channel at all** (**reasoned**): a parent returns its state whole, so the library sees only before and after,
  and only the child's `compose` knows where its fields are. The recipe of a generation alone needs none, and leaves
  the undo by snapshot open.

### What it would change

- **API**: `Program` and `Shape` gain `replacing`, required exactly when the messages carry writes, and `replaced` is
  exported, for a program that holds a `Field` without `compose`. The name is open.
- **Breaking, narrowly**: a program whose messages carry writes, rebuilt by hand without `replacing`, no longer
  compiles, as a child or as `run`'s argument; a spread is unaffected. No example or test of the repository changed
  (**run**, by the typecheck).
- **Internal**: `Replacer` and `replacingOf` stay unexported, and the symbol goes.
- **README**: a sentence on `replacing` where a program's pieces are listed, and in "Structuring a program", that a
  child written by hand with a `Field` writes it with `replaced`.
- **`docs/invariants.md`**: the seventh review's rule gains that a parent applies its child's `replacing`, and that a
  child that declares none has no inputs, by the types; `AGENTS.md` reads `replacingOf` beside `runCommandOf` and
  `subscriptionsOf`.
- **Mutations**: one more, `replacingOf` returning nothing. A changelog entry.

### Against, by the review itself

- **The check of the types is structural**: it knows a write only as `compose` shapes it, so a wrapper written by
  hand that carries a child's messages under another key, or a program typed `any`, is asked nothing and loses the
  rule in silence. The guarantee holds for programs shaped as `compose` shapes them.
- **`run` asks for a piece it never uses**, since the requirement sits in `Shape`; asking it only in `child` and `each`
  avoids that, and breaks the symmetry with `Interpreter`.
- **It is public surface for a rule most users never write**: `replacing` and `replaced` are documented and kept
  stable, and a user can now write a wrong `replacing`, which the symbol made impossible.
- **The types and the run can disagree**: the property is required by the shape of the messages and set by "has
  inputs", and a cast can part them.
- **A recursive conditional type over every union of messages** costs the compiler what was not measured on a large
  application.
- **It makes the seventh review's proposal more visible, not smaller**: declined, the recipe of a generation alone needs
  no channel, and none of this is added.

## A plain input, and a frame that says what it has seen

The owner judged the seventh and eighth reviews out of hand: a recipe for a reset or an undo is one nobody remembers,
whatever the examples, and the program's loop must stay simple. The rule of a revision is trivial when one function
owns every transition of the state that holds an input, and a hierarchical composition splits that ownership, so each
fix patched the split. A ninth review by Fable 5.2 was given a free hand over the whole library, its engine and its
loop, its composition, its invariants and any feature in the way, for a solution stable, elegant and correct, with no
weak point that leads to a patch or to more API; it was told that composition came when the library ran a simpler
model, close to Elm's, and that Elm, the owner's reference, may not be the most general. Its spike is on the branch
`worktree-agent-a02816c77ebec330c` (commits `6dc6b3d` and `4757546`, over `main` at `b63a5b6`, never to be merged),
additive beside the inputs of `main` under the spike's names (`place`, `swap`, `swapped`, `shown`, `typed`, `drawn`,
`shows`). It reports `typecheck`, `lint`, `test` (628), `test:node` (538) and `interleavings` (17) green; `typecheck`
and `test` were run again on its commit, and its four histories written on `main`'s design, each a `test.failing`
there, were seen to fail as plain tests (**run**). `mutations`, `build`, `smoke` and the API report were not run. Not
decided.

### The proposal

Keep the loop of Elm and the composition as they are; change what an input is, and tell the renderer one fact the loop
already knows.

1. **An input is a plain value of the state**: `inputs: { Text: input(at) }`, with `at` any `Optional` to an `A`. No
   `Field`, no revision, no `renewed`, no rule (A).
2. **A write names what it was written over**, `write(was, value)`: stored when the place holds `was`, by `Equal`, and
   rejected otherwise. The rule reads the state and the message alone.
3. **A dispatch returns the number of its message** among those the view sent, and **a frame carries `seen`**, how
   many of them the run had taken when its state was made.
4. **The element is never replaced.** A pure rule of the library, `drawn` (five lines), says what a frame makes of an
   element: when the frame holds what the element showed before its first write the frame has not seen, the frame is
   the element's own past, and the element stays; otherwise the state moved on without it, and the element takes the
   frame's value.

Why, by the review:

- **The split of ownership is gone, not bridged**: the rule of a write keeps nothing between two writes, so there is
  no history that a reset, an undo, an optional place or an id that comes back can cut. No channel from a child to its
  parent, no `all`, no lens only, no recipe of a generation.
- **No revision in the state could close it** (**reasoned**): a frame that lags and a state brought back by a
  snapshot are the same state, so no function of the state tells them apart. Only the order of the loop does, and
  `seen` is that order.
- **`reject` keeps its one meaning**, and the state stored is the state written, so a `toEqual` holds again.

What a user writes, by the review:

```ts
// the draft's own composition
type Draft = Readonly<{ text: string }>
inputs: { Text: input(Optic.id<Draft>().key('text')) },
// the parent, on Sent: nothing to remember
draft: children.Draft.init.state
// an undo by snapshot, in the parent's update: nothing to remember
case 'Undone': return { state: { ...state, draft: kept } }
// rows by id: each(draft, { get, set, subscribed }) as today, no `all`
// the view (snabbdom): no key, no initialValue
h('input', shows(model.text, dispatchTo(dispatch, 'Text')))
// a test
{ _tag: 'Draft', message: { _tag: 'Text', message: write(model.draft.text, 'hello') } }
```

### What it found

- **Three histories that end with a late key** (`src/input-swap.test.ts`, **run**): a draft its parent starts again,
  a kept draft brought back, and a row whose id comes back store the late key on `main`'s `Field` and reject it with
  the plain input.
- **In happy-dom, through `run`** (`examples/snabbdom-plain.test.ts`, **run**): sent, the draft is emptied in the same
  element, which keeps the focus, where `main`'s design leaves "hello" on screen; a key typed after Send, before the
  emptied frame is drawn, is rejected, the element is emptied, and a second Send sends nothing; a kept draft brought
  back as the very same state object, which a `thunk` skips, is still shown; a frame that has not seen a key sent
  before it was drawn leaves the element alone.
- **Each check taken out by hand** (**run**): `was` not compared fails 5 tests; a frame taken to have seen everything
  eats a key on screen; a frame taken to have seen nothing fails 3.
- **The numbering** (`src/seen.test.ts`, **run**): dispatches return 1, 2 and 3, and the last frame has seen 3, the
  rejected one included. `Queue.offerUnsafe` is `@stability stable` in Effect 4.1.4 (**checked**), and the number and
  the offer are in one thunk, so the numbers follow the queue's order (**reasoned**).
- **Not run**: a React bridge, a slider, the sweep of inputs under models skipped by `Equal`.

### What it would change

- **API**: `Field`, `field` and `renewed` removed, and the internal `replaced` and `replacing`; `write(was, value)`;
  `Dispatch` returns `Effect<number>`; `Frame.seen`, and the rule of an element (`shown`, `typed`, `drawn`, or one
  function), the one place that rule is applied.
- **Engine**: about 10 lines of `engine.ts` and 3 of `run.ts`; the testing tools unchanged, `drive` getting `seen`
  through `run`.
- **Bridges**: about 45 lines each, a registry of the live inputs settled after every frame, and `shows` in place of
  `key`, `initialValue` and `onWrite`.
- **README**: "Inputs the user types into", the paragraph of the revisions in "Declaring children", "Model", "View",
  and a guarantee that a frame has seen the messages it counts. "Only what is drawn writes" stays.
- **`docs/invariants.md` and `AGENTS.md`**: the entry of an input rewritten, and a premise for the numbering.
- **Tests and examples**: the eight mutations of inputs replaced, the search of interleavings drawing `write(was,
  value)`, and `form`, `volume` and their tests rewritten. Medium in size, and breaking.
- **Dropped**: `renewed`, and with it a new input for the same value, which is not expressible: a drag from before
  bounds narrowed is stored, so a program reads an input through its own bounds. `volume` gets simpler, since Mute
  need not touch the level. The seventh and eighth reviews are not needed.

### Refused, by the review

- **One program, with its children as plain functions**: a large break that still leaves a place that comes back
  and the enumeration of rows, and moves about 400 lines of routing into every application.
- **Inputs declared by the root alone**: a child's view writes into what its root owns, and rows still need
  enumerating.
- **The limit documented**: a recipe.
- **Whoever steps, with a declared channel**: right for a reset and an undo, but the split patched, and a place that
  comes back left open.
- **A generation per place of a child, or the children's state kept by the library as a tree**: the first puts a
  shape of the library around every child's state and still needs the view to key the subtree; the second forbids a
  snapshot above a child and needs handles of its own, to restart and to take a snapshot.
- **A clock in the engine, or a lineage by the identity of objects**: impure, or a break of `applyAll`.
- **Acknowledgements kept in the state**: a frame skipped makes them ambiguous again.
- **A frame published for every message of the view**: a trivial bridge, at the cost of "the very same state draws no
  new frame".
- **Another loop**: none found more general; what was missing was one fact, not a model.

### What it does not close

- A fixed message, or a command's answer, drawn for an old instance still reaches the new one: a message names a
  place and `update` decides, and with the writes out of that class it corrupts nothing by itself.
- A `File`.
- The caret and an IME composition when the program replaces a value under the user; the focus stays.

### Against, by the review itself

- **The correctness of the screen lives in each bridge**: the rule is the library's, but the registry is copied into
  every bridge, and React is not spiked.
- **`Dispatch` changes type** for everything that implements it, and the numbering adds a premise on Effect's `Queue`.
- **A late drag after the bounds narrowed is stored**, where today `renewed` rejects it, when remembered.
- **`was` doubles a write**, and costs an `Equal` on every keystroke.
- **A program that sets a value equal to one the element already left lets an old write through**; the screen and the
  state still agree.

### What is left to decide

Whether to take this direction in place of the seventh and eighth reviews. Before a decision, the two points where it
could still break are spiked: a React bridge with its registry of inputs, and a test of the premise of the numbering
that fails without it, as `change-engine` asks. Both were, in the next section.

## The ninth review, in React and in its numbering

The two points where the ninth review could still break were spiked on 15 November 2026, each by a session of Opus 5.5
on a branch of its own cut from `4757546`, never to be merged: React on `claude/spike-react-plain-df66b2` (`b4b13be`
and `96268d0`), the numbering on `claude/spike-seen-premise-4b91ce` (`d11e89a`). Each reports `typecheck`, `lint` and
`test` green, the numbering `test:node`, `interleavings` (17) and `mutations` (102 of 102) too; the tests each added
were run again on its commit, 25 of the two React files and 6 of `src/seen.test.ts` (**run**). Not decided.

### React

- **It holds as a component, not as props** (`96268d0`, **run**): the view writes `createElement(Shows, { value,
  dispatch: dispatchTo(dispatch, 'Text') })`, any other prop going to the `<input>`, and `renderInto` provides by a
  context its run's registry of live inputs, settled with `drawn` after each frame. The 12 cases of
  `examples/react-plain.test.ts`, the five of the draft inside `StrictMode` among them, pass, and so do the 13 of
  `react.test.ts`.
- **As props it breaks** (`b4b13be`, **run**): `shows(value, dispatch)` returned a `ref` and an `onChange` and found
  its registry through a module variable set around the frame's `flushSync`, so an input that a component mounts from
  its own state, outside a frame, is in no registry and never writes; a `test.failing` holds it. A portal needs the
  context too.
- **What React forced and Snabbdom did not**: a component and a context, since a ref cannot tell which run its element
  belongs to (**run**); a ref callback new on each render, the only way a frame's value reaches the element, so an
  input in a memoized subtree keeps the value of the state it skipped (**checked**); the settling after `flushSync`
  returns, not inside its callback, where React has not committed the frame (**run**: moved inside, 2 tests fail); an
  uncontrolled `<input>`, since a controlled one would put its prop back after every `onChange` (**reasoned**); the
  value set by `element.value`, which React's value tracking hears (**run**).
- **Size**: about 57 lines of logic, against Snabbdom's 53; 83 lines added against 75.
- **Each check taken out by hand** (**run**): nine fail between 2 and 10 tests each. The value given to a new element
  failed none until the root draft started at `'draft'`; the cleanup of the ref fails none, and without it a removed
  input only stays in the registry for the rest of the run, left without a test since React's retained fibers would make
  one of collection flaky (**reasoned**).
- **Not run**: `test:node` and `interleavings` on this branch, a real browser, an IME composition, the caret, a
  `Suspense` or a `startTransition` in a view; an old React element attached again with an older value
  (**reasoned**).

### The numbering

- **A promise of the engine, on no undocumented premise of Effect** (**checked**): the number is taken in the thunk
  that offers the message, which `Effect.sync`, evaluated as the effect runs, and `Queue.offerUnsafe`, synchronous,
  document in Effect 4.1.4, and the queue hands its messages in the order offered, already cited in
  `docs/invariants.md`.
- **Five checks of the engine, each with a test and a mutation that only that test kills** (`src/seen.test.ts`,
  `mutations/mutations.ts`, **run**): a dispatch numbered each time it runs, not as it is made; the loop counting every
  message of the view it takes, a rejected one too, and none of a command or a subscription (two mutations); the count
  including a message before the state it makes is published; and `seen` published in the same object as its state,
  so that a frame drawn later says what its own state had seen.
- **One alarm without a mutation** (**run**): that nothing runs between the number and the offer is held by "follow the
  order update hears them in, under every schedule within two deviations", over 1604 schedules of `test/scheduled.ts`,
  red when the number is taken in an `Effect.sync` of its own before the offer; the rule "one thunk" of
  `docs/invariants.md` gives no mutation to a region that holds no code of the program.
- **Found** (**run**): a rejected message, or one that leaves the state as it was, draws no frame, so the last frame's
  `seen` may stay below the last number until another state comes; `drawn` does not wait for it, but a bridge that
  waited for `seen` to reach its last number would wait forever. After the run ends, a dispatch still returns a number,
  of a message the closed queue refused, which no frame reads. None of the five mutations fails a test of `examples/`:
  only `src/seen.test.ts` holds the numbering.
- **Proposed entries**, not written: none in the list of `docs/premises.md`, since what is documented stays out of it,
  at most a line after the entry of the unbounded `Queue`; in `docs/invariants.md`, under "What a program may rely on",
  "A view's message is numbered as it is queued, and a frame says how many of them it has seen", with the thunk of the
  number, the count and its publication, and the alarm in place of a mutation.

### What is left to decide

Whether to adopt the ninth review. Neither spike found where it breaks. What they add to it: React's bridge is a
component, `Shows`, where Snabbdom's `shows` returns props, so the README's "View" would show each bridge's form; and a
bridge must never wait for `seen` to reach the number of its last write. A slider and the cost of `was` were left
unchecked, in the next section.

## A slider, the cost of `was`, and the bridges' part

Two more points of the ninth review were left only reasoned: whether "a program reads an input through its own bounds"
stays simple in a slider whose bounds narrow, where `renewed` is dropped, and what `was` costs on each write. Each was
spiked on 15 November 2026 by a session of Opus 5.5 on a branch of its own cut from `4757546`, never to be merged: the
slider on `claude/spike-volume-plain-031355` (`a7b0faf` and `bf76814`), the measure on `claude/bench-write-was-b77d29`
(`f570872`, extended in `ac38db8` to a frame's check and to rejected writes). Each reports `typecheck` and `lint`
green, the slider `test` (648) too; the tests of the plain volume and of the plain bridge, 26, were run again on its
commit (**run**).

### The slider

`examples/volume-plain` beside `examples/volume`, with `slides(value, dispatch)` in the Snabbdom bridge, the slider's
`shows`, read back with `valueAsNumber`, and eight cases in happy-dom through `run`:

| | `volume`, on `main` | `volume-plain` |
| --- | --- | --- |
| Lines: program, view, tests | 117, 25, 113 | 87, 23, 122 (**checked**) |
| The level | a `Field<number>`, kept in `Muted` too | a plain number, which Mute and Full leave alone |
| What a user must remember | `renewed` when the value stays (Mute at 0, Quiet with the level under 30) | the level read through `heard`, and the slider drawn from the level held, never the one heard |
| A late drag after Mute | rejected; Unmute gives back 50 | stored, 80; the slider shows 0; Unmute gives back 80 (**run**) |
| A late drag from 20 to 80 after Quiet | rejected; 20 | stored, 80, above the maximum of 30; heard as 30; Full makes 80 heard (**run**) |
| A late drag from 80 to 90 after Quiet | rejected | rejected: Quiet had lowered the level to 30 (**run**) |
| Mute, then Unmute | a new slider at 0, then the level | the same slider, at 0 and disabled, then the level (**run**) |

- **Mute gets simpler**, as the review said: no level kept in `Muted`, no new slider, and the 0 case of `renewed` gone.
- **Narrowing bounds make a recipe of two rules** (**run**): every reader of the level goes through `heard`, one place
  here and a second for a command that set a device's volume; and the slider is drawn from the level held, since one
  drawn from the level heard rejects every drag for good, which nothing in the types or the checks catches.
- **The screen and the state** agree after a late Mute; after a late Quiet only because the model reads through
  `heard`: a browser brings a range back within bounds set after its value (**reasoned**), happy-dom does not
  (**run**).
- **Refused on the way**: Full storing the level heard rejects a drag in progress (**run**); an optic that refuses a
  value above the maximum makes the write a step that changes nothing, so no frame is drawn and the refused value stays
  on screen (**reasoned**).
- **Taken out by hand** (**run**): a frame taken to have seen everything fails 2 tests, one taken to have seen nothing
  1, the slider read as text 3.

### The cost of `was`

`bench/writes.ts`, run apart with `bun bench/writes.ts [writes] [rounds]` or on Node, applies the same 2000 writes with
each design: the rule alone, the composed `update`, and for two cases `run` with a trivial renderer; fresh values on
each pass, since `Equal` caches its hashes and its pairs, and the two designs' rounds alternated after a round each
thrown away, since the first measured paid for the JIT. Three runs on Bun 1.4.4 and three on Node 24.14.1, eleven
rounds each (**run**).

- **What the bridge sends costs one `===`** (**checked**, `examples/snabbdom.ts` and `Equal.ts` in Effect 4.1.4): `was`
  is the value the bridge sent before, as the state stored it, or the frame's own, so the comparison stops at its first
  line, `self === that`. Through `update` the two designs are within each other's ranges, about 220 ns a write for a
  short text, a long one, or a number; 8 to 9 ns more for the rule alone on Bun, nothing measurable on Node (**run**).
- **An equal copy costs more**, which a bridge that read the value back from the element, or a program that rebuilt an
  equal value, would send (**reasoned**): about 0.15 µs a KB of text, +0.7 µs at 4 to 6 KB; +2.3 to +3.1 µs for an
  array of 200 ids; +1.2 to +3.4 µs for a record of four fields (**run**), since a distinct structure is hashed, then
  compared (**checked**).
- **Against a frame**: a whole write through `run` takes 14 to 15 µs for one input, and 290 to 380 µs for a row among
  1000, where finding and replacing the row dominates (**run**); the worst copy measured is under 0.04% of a 16 ms
  frame (**reasoned**).
- **What a write weighs**: three properties in each design; `was` copies nothing, but holds the old value until the
  write is applied; a stored write makes one object fewer than a `Field` (**checked**).
- **What the bridge checks on each frame**: `drawn` for an input whose value is the one the state holds takes 60 to 80
  ns on Bun, 10 to 60 ns on Node, for any value, with or without a write pending (**run**); the value is the same one
  when `makeModel` passes it on, since `compose` keeps a child's model while its state is the same object and a write
  of an equal value leaves the state as it is (**checked**, `src/compose.ts`), and a copy only when `makeModel` or the
  view rebuilds it (**reasoned**). An equal copy costs 0.5 to 0.9 µs for 4 to 6 KB of text, 4 to 5 µs for 200 ids,
  1.6 to 4.3 µs for a record of four fields; a state gone ahead costs the hash of the new value, which `main` pays
  anyway when it stores it (**run**).
- **A whole frame's settle**, as the Snabbdom bridge at `4757546` does it without a DOM: 19 to 52 µs for 1000 inputs
  holding the same value, 0.1 to 0.3% of a 16 ms frame, the walk over the elements and not the comparison; 154 to 249
  µs, 1 to 1.5% of a frame, for 1000 texts of 4 KB copied (**run**). The patch of the DOM was not measured.
- **A rejected write costs more than `main`'s**, which compares two numbers in 12 to 33 ns for the rule alone, 120 to
  300 ns through `update` (**run**). The plain design rejects a short text or a number as fast; a text of 4 KB of the
  same length that differs near its end in up to 0.4 µs, one of another length at once; an array of 200 ids or a record
  in 0.7 to 2.8 µs wherever it differs, since `Equal` hashes `was` whole before it compares (**run**; **checked** in
  `Equal.ts` of Effect 4.1.4). On Bun, a long text that differs at its first character costs more than one that
  differs at its last, 0.6 µs against 0.15, which Node does not show: the JIT warming up is suspected, not verified.
- **Where it shows**: text from a few KB up, only when copied or rejected near its end, at about 0.1 to 0.2 µs a KB;
  structures from a few tens of elements up, at 2 to 3 µs per 200, for a copied `was` or a rejection; under 6 µs an
  event in every case, and under 0.04% of a frame but for the settle of 1000 long texts copied (**reasoned**). Strings
  are flattened in the bench, as an element gives them: a rope of 4 KB compared in 225 ns on Node against 5 for a flat
  one (**run**).
- **Not measured**: a browser, and the patch of the DOM.

### What the owner accepts

The owner, 15 November 2026, on these results:

- **A tie between the library and its bridges rather than a weak point in the library.** The guarantees of inputs are
  given for elements and renderers that meet a condition, stated as a property, not as a list of widgets. As this
  document words it, to be checked against the README when it is written: an element's value changes only by an edit
  of the user, which it reports with the whole value, or by the bridge; and a renderer, after each frame and before the
  user can act on it, lets the bridge reach each input's element with the frame's value and `seen`. A text field
  meets it, and so do Snabbdom and React through `flushSync`; a range whose bounds narrow does not, nor does concurrent
  rendering. "The correctness of the screen lives in each bridge", among the ninth review's weak points, becomes a
  cost accepted: the rule stays the library's, `drawn`, and the bridges keep only their registry.
- **A slider whose bounds narrow is out of the guarantees**, and nearly irrelevant: in rendering a widget that does
  not fit is often replaced by one drawn by hand. The recipe of two rules above is not the library's.
- **The example shows both**: a native slider as a plain input, with bounds that do not narrow, and beside it a slider
  the program draws, its start a fixed message and its moves a subscription keyed by the state of dragging, with no
  input, as "Only what is drawn writes" decided and no example showed yet; the quiet hours go to that one. The
  example, and the guide's "Inputs the user types into", say that a widget, native or not, that does not fit the
  bridge is replaced by a custom one.
- **A renderer only draws.** The library gives a frame, and the renderer reads it and draws it, and nothing else:
  anything else is neither supported nor advised, and the README says so, without a renderer's name, as `AGENTS.md`
  asks of the library. Drawing a frame includes settling its inputs by `drawn` with its `seen`, which is part of the
  frame. So concurrent React is irrelevant, and so is state kept in React's components: a hybrid makes sense for
  nobody, and React is named only as an example, in the bridge's guide. A question for the port
  (**reasoned**): the React spike needed `Shows` and a context because an input that a component mounts from its own
  state escaped the registry, a case this rule leaves unsupported; whether the props of `b4b13be` are then enough, or
  a portal still needs the context, is to be checked.

Also left as limits, not flaws, after a discussion with the owner the same day: a message names a place, so one drawn
for an old instance reaches the new one, and `update` decides, which no design of a loop avoids, since a click always
comes from a frame already past; and a write whose `was` equals a value come back is stored, which keeps a keystroke the
user typed over what they saw.

### What is left to decide

Whether to adopt the ninth review, now with nothing of it left only reasoned that a spike could check before the port.

## The rule a bridge calls

The ninth review's spike gives a bridge a type and three functions (`git show 4757546:src/input.ts`): `Shown<A>`, what
an element on screen holds of an input, its `value` and the writes it sent that no frame has seen, each with its number
and the value it was written over; `shown(value)`, an element just made; `typed(held, value, sent)`, the element after
the user's edit; and `drawn(held, value, seen)`, what a frame makes of it. The review leaves open "`shown`, `typed`,
`drawn`, or one function". Two shapes were weighed with the owner on 15 November 2026, and a tenth review by Fable 5.2,
given the code of the spike and of its three bridges, the two shapes and the rules of `AGENTS.md` but no preference,
asked which to take, or a third, added one. Read only, nothing spiked. The owner chose the third, for now.

### The shapes

- **(a) A type and two functions**: `shown` dropped, a new element being `drawn` from nothing; the bridge calls `typed`
  on an edit and `drawn` on a frame, and builds the write itself, `swap(held.value, value)`.
- **(b) One function, a reducer**: `element(held | undefined, event)`, the event `{ _tag: 'Typed', value, sent }` or
  `{ _tag: 'Drawn', value, seen }`, so that an element's history is a fold over events, as `update` is over messages.
- **(c) The write made by the library**: `drawn(held | undefined, value, seen)` as in (a), and `typed(held, value)`,
  which returns `{ write, sent }`, the write to dispatch and a pure continuation that takes its number:

```ts
const { write, sent } = typed(live.held, element.value)
live.held = sent(send(dispatch, write))
```

### By the review

- **(b) is no more functional than (a)** (**reasoned**): a function of a sum is a pair of functions, and both are
  pure; what looks imperative is the registry the bridge mutates, which neither removes. Each bridge already calls
  `typed` only in its handler of an edit and `drawn` only after a frame, and none queues or replays events
  (**checked**), so the tag of (b) is built only to be taken apart by the same function. `update` is a reducer because
  messages travel as data, through the queue, the logs and the search; the precedent here is `andThen` and `raise` over
  `Step`, whose caller knows which it calls. (b) adds a public type, written by hand, that promises nothing more, and
  its tag `Typed` is already the name of a message of an earlier design in this document.
- **`Shown` opaque but for `value`** (**checked**): every bridge reads `held.value`, to write over it and to decide
  whether to set the element, and never `unseen`, nor builds a `Shown` but by `shown`. `AGENTS.md` decides it: a type of
  the library's own is "hidden where it is not" meant to be written by hand, and the library's because it must
  "enforce at construction what the type cannot", the order of the writes and their values written over. Wholly opaque,
  it would need a function to read `value`.
- **The rule split between library and bridge, which (a) and (b) leave** (**checked**): each of the three bridges
  writes `swap(live.held.value, …)` beside `typed`, so the value a write names and the one the element records agree by
  a convention copied into every bridge; a bridge that names another, the last frame's, makes `drawn` judge on data
  that is false, and no test of the library sees it. (c) makes both from one value, so they cannot differ, and makes
  that property a test of a pure piece. The number comes after the dispatch, which only the bridge runs, so it is
  given to a continuation: a `typed` that ran the dispatch itself would break "Running a dispatch […] is the
  renderer's business, and the library exports no helper for it". By "the one place where a rule of the library is
  applied", the rules prefer (c), though they do not impose it.
- **A promise any shape needs** (**checked**): the bridge sets the element when `next.value !== held.value`
  (`examples/snabbdom.ts:92` at `4757546`), by identity where the library compares by `Equal`. It is right for a text
  and a number, and for a structure only because `drawn` returns the very `value` held when the element stays, which is
  true and not promised: `drawn`'s documentation promises it.
- **Its choice**: (c), then (a) if the continuation is too odd for the README, then (b), which adds a type and two tags
  and closes neither gap.

### What (c) costs

- **A shape the library has nowhere else** (**reasoned**, `src/` not searched in full): a function that returns half
  of its work and a function to finish it, which the README explains.
- **The convention moved, not gone**: the bridge calls `sent` once, with the number of that write; a bridge that
  forgets leaves the element unaware of its own write, which `drawn` may then replace under the user. Smaller, and
  harder to get wrong, than the same value named in two lines.
- **A closure per keystroke**, negligible against the 14 µs of a write through `run` ("The cost of `was`").
- **`swap`, or `write(was, value)`, stays exported**, for the tests of an `update`, and leaves only the bridges'
  imports. That `send` returns the number synchronously, which the continuation rests on, is `Effect.runSync` over the
  dispatch in each bridge (**checked**).

The shape without a continuation, `typed` returning the write and an element whose number is still missing with a
third function to give it, is three functions and the same convention.

## The port of the ninth review

Asked by the owner on 15 November 2026, after "The rule a bridge calls", and made by a session of Opus 5.5 on the
branch `claude/port-plain-input`, cut from `main` at `e8340d3`, in small commits; the spikes' branches were rewritten
on it, not merged.

### What it is

- **The numbering**, first and apart: a `Dispatch` returns `Effect<number>`, and a `Frame` has `seen`, as the spike
  of the numbering checked them, with its five mutations and its alarm. Its tests are in `run.test.ts` and
  `engine.test.ts`, its premises are documented parts of Effect alone (a line in `docs/premises.md`), and its entry
  in `docs/invariants.md` is the one proposed in "The ninth review, in React and in its numbering". Added by the
  port: a contract of `drive`'s frames with the run's (`contract.test.ts`), which `simulate` and `rehearse` have no
  frames to share, and a property of the search of interleavings, a frame's `seen` among the counts its states were
  made with, never going back, and the last frame's the count of the last state (**run**, seen to fail under two of
  the mutations by hand).
- **The plain input**: `input(at)` at any `Optional`, `write(was, value)` and its rule `written`, `typed` and `drawn`
  over a `Shown` whose writes are under a symbol the package does not export, shape (c); `Field`, `field`, `renewed`,
  `replaced` and `replacing` removed. Nine mutations of inputs in place of the eight of the revision, each with its
  killers (**run**); two killers named at first were dropped, since a primitive value equal to the one held is the
  very same, and only a structure tells the two apart.
- **The search** draws `write(was, value)` from the frame on screen and from an older one; its property of a write
  finds a write stored whatever it was written over in the first scenario (**run**, by hand). The property of a
  revision is gone with it.
- **The bridges**: `shows` and `slides` with snabbdom, `Shows` with React, both settling their registry after each
  frame; `onPress` in both, for a drag the program draws; snabbdom's `styleModule`, for the slider drawn. Both
  bridges' tests ported (22 with snabbdom, 21 with React, the draft in `StrictMode` too), and each seen to fail with
  `seen` taken as everything or nothing, with no settle, or with the element written on every frame, and in React
  with no context, or a settle inside `flushSync`'s callback (**run**).
- **The examples**: `form` and `form-react` on the plain input, with `late-key.test.ts` holding both histories of the
  late key on a screen that settles by `typed` and `drawn` (**run**, seen to fail without the rule of `was`); `volume`
  with a native slider over a plain input, whose bounds never change, beside a ringer the program draws, whose press
  is a fixed message and whose moves a subscription keyed by the state of dragging, through a `Pointer` service,
  with quiet hours that put each move within their bounds.
- **A reaction to every keystroke**, a subscription keyed by the input's value, run again through a run on the plain
  input (`input-subscriptions.test.ts`): each write that changes the value stops the search and starts another, a
  value typed back starts one anew, and a write of the value held or a step that keeps it starts nothing (**run**).
  The open point is closed; the key by revision has nothing to key now.
- **The README**, section by section: "View" (the number, the rule that a renderer draws frames and nothing else, a
  bridge's three duties), "Inputs the user types into" (the rule of `was`, `typed` and `drawn`, the condition on
  elements and renderers, a range whose bounds narrow outside the guarantees, a widget that does not fit replaced by
  one the program draws, the two limits of a message that names a place), "Model", "Declaring children", "Model and
  view", "Splitting a program", "Guarantees" (an input stores what is written over the value it holds; a frame says
  what it has seen), "Testing", the examples and the API reference.

### Left

- **A slider in React**: `Shows` is a text input over a string, so the React bridge has no counterpart of `slides`,
  and its tests have no native slider; `volume` has no React view, as before.
- **`Shows` and its context stay**, by the owner on 15 November 2026: what the context gives is not the case left
  unsupported ("What the owner accepts") but the run an element belongs to, since several runs may share a page, each
  with its own registry and `seen`. Props in the form of snabbdom's `shows` would have to find that run without it: a
  registry of the whole page settles one run's inputs with another's `seen`, and the element's ancestors miss a
  portal (**reasoned**, not spiked). The bridges keep their two forms; the README names `Shows` in its examples.
- **Not run**: a real browser, an IME composition, the caret when the program changes a value under the user; inputs
  under models skipped by `Equal` beyond the `thunk` and `memo` cases of the bridges' tests.
- **The two limits**, declared in the README and tested as pure pieces: a write over a value that came back is
  stored, and a fixed message drawn for an old instance reaches the new one.

## What a consumer could notice

With an input declared in `compose`, either way of keeping its revision:

- **New exports**: `Field`, `field`, `write`, `input` and `inputs` in `compose`, and `renewed` (A) or `replace` (B);
  `children` becomes optional. Additive as API, with a changelog entry. `parent` is renamed `composition`, a
  breaking change ("The name").
- **A breaking change of what the README promises**: "a model is data" is a rule that a model holding `changeName`
  breaks, so every program with an input changes, with the version `release` asks for.
- **Removed from what users copy**: `examples/field.ts`; in the bridges, `onInput` with a function of the model
  gives way to a writer of a field.
- **What a program's code loses**: a message and a case of `update` for each input, the function in its model, and,
  in its tests, the text drawn for the reader and the candidates, `withheld` for typing, and the property that
  what is typed is accepted in every state.
- **With (A) only**, a state stored that differs from the one written in the revision ("To explore").

While it stays in the examples (way 1), nothing but the sentences of the README, which applications cite as rules.
