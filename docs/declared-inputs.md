# What reaches `update`, declared as data

**Status:** suspended by the owner, 14 November 2026, the day it was proposed: suspended, not revoked. Nothing of it
is done, and nothing of it is to be done now. This is a short record, rewritten the same day after the contract of the
library became the model's with `update` ([`boundary.md`](boundary.md), item 1). The record in full, with every
finding of its three spikes, is `docs/declared-inputs.md` on the branch `claude/declared-inputs-spike-8af3b8`. The
spikes' code is on `spike/declared-inputs`, `spike/dispatch-offers` and `spike/offer-check`, each cut from the one
before, never to be merged. Everything under "What was proposed", "What the spikes showed" and "What the owner
decided" is carried over from that record and was not run again; "What still makes sense" was read against the
code today, at `1d0ccc9`.

## Context

The discussion began from three things the tools could not do:

- **A message with input is not data.** A model holds `changeName: (name: string) => Message`, a new function for
  each model, so a model is never equal to another, and `Inert`, as [`inert-steps.md`](inert-steps.md) proposes it,
  depends on the value typed: `NameChanged` with the text the field has does nothing, and asks for an exemption.
- **No tool can ask a key what it will send.** A subscription is a `Channel` that makes its messages as it runs.
- **The states a test checks are those its generator invents**, not those the program reaches.

Their one cause: what can reach `update` in a state is known only by running the view, the streams and the commands.

## What was proposed

**In every state, everything that can reach `update` is declared as data, with the schema of what the outside
supplies.** The transport stays: `dispatch` for a view, a key for a subscription, `runCommand` for a command.

1. **One shape for a message that is offered**, an `Offer`: `{ message }` where nothing fills it, and
   `{ message, at, schema }` where a value of a `Schema` fills one field.
2. **A model holds offers**, and no function written by hand, so it is data, equal by `Equal` to another of its state.
3. **A subscription's entry declares the stream of its values and the message made of each**; the library applies
   the one to the other, so `Subscription` becomes the library's.
4. **A command declares its answers** the same way.
5. **The tools read the declarations**: `Rejected`, `Missing` and `Inert` judge every message offered in a state,
   and `Inert` and `ActsTwice` judge the control, never the value.
6. **A tool explores the program from `init`** by what each state offers. It was since spiked alone, on the API as
   it is: [`exploration.md`](exploration.md).

Weighed before it and refused, in three forms: **input through a subscription**. A keystroke through a
subscription is queued when its fiber resumes and a click at once, so "typed, then Save" would rest on scheduling;
a typed message would be checked by nothing; a key that goes away drops what it sent; and the renderer would feed
the run by a service. The proposal kept the aim, data the tools validate, and left the transport.

## What the spikes showed

**The first, `spike/declared-inputs`: points 2, 3 and 5 on `form`, `timer` and `list`.** An offer serves an input
and a key, a child's lifted entry included, and `form`'s test passes with no exemption of `Inert`. Around a button's
message it buys nothing. With a key's message judged as a view's, every tick acts twice. A schema is equal only to
itself, so it is a constant of the module. With a `Stream` of values the type no longer says whether a subscription
ends; an answer with a `Channel` of values was proposed and not built. A command's answers fit no single offer, and
which can arrive is no function of the state: they are reachable only through an exploration that carries the
commands under way. Settled as a premise: the values of a `Schema.Literals` are listed by stable APIs at Effect
4.1.4. Run on it: `typecheck`, `lint`, `test` (565), `test:node` (502), `interleavings` (14); eleven checks taken out
by hand, each killed.

**The second, `spike/dispatch-offers`: a `dispatch` that takes an offer**, `dispatch(model.save)` and
`dispatch(model.changeName, text)`. It stands through the bridges, `dispatchTo`, `drive` and `rehearse`; no view of
the three examples changed; a bridge keeps nothing; `dispatchTo` lifts a child's offer as data. Refuted: that a view
cannot build a message, by the type. `dispatch({ message: Message.SaveClicked() })` compiles, since an offer is data
written by hand. Run on it: the same checks (577, 511, 14); eleven checks taken out, each killed.

**The third, `spike/offer-check`: the tool holds a view to its model.** A constructor `offer(...)` marks what it
makes, beside it (a `WeakSet`: a mark inside breaks `Equal` with an offer written by hand); a walk, `offersOf(model)`,
finds the marked offers in a model of any shape, and lifts a child's by a wrapper `compose` keeps for each child
model; two violations, `Unoffered` (the view sends what the model does not offer) and `Undrawn` (the converse). With
them `Rejected`, `ActsTwice` and `Inert` can be asked of the model alone. Its limits: a copy of an offer or of a
child's model is not recognised, a state two places share is known under the first, a schema made apart is
`Unoffered`. Run on it: the same checks (594, 528, 14); fifteen checks taken out, fourteen killed and one removed
as superfluous.

## What the owner decided, and on what condition

Each stands as what was decided **if the proposal is taken up again**, and is not to be built until then.

- **One shape for every message a model offers, a button's too, with a `dispatch` that takes an offer.** Decided on
  the condition that a spike of that `dispatch` held. It held in part, and the owner let the decision stand all the
  same, for what it gave beside: a bridge keeps nothing, there is one way to send, a view and a key are asked alike.
- **`ActsTwice` never judges a key's message**: a double tap is a matter of a control. Whether it judges a command's
  answer was not asked.
- **What the type cannot hold, a tool holds**: agreed as a direction, not decided in its form. The owner was not
  convinced by recognising an offer by identity, and asked what the walk is for.
- **The end of a subscription**: the answer with a `Channel` of values was agreed to be recorded, not decided.

## Why it was suspended

As the owner agreed to it. The discussion began from something small: an exemption of `Inert` for an input, in 4 and
7 states of 2,000, and keys no tool validates. It reached a design that rewrites every program and adds many
concepts (an offer of two shapes, a path `at`, schemas in a model, `dispatch(offer, value)`, declared entries, `end`,
a constructor or a closed type), where the API of today has few. Three spikes show that it can be done, not that it
is worth it. And `schema: Schema.String` beside a text field says nothing its type does not.

## What still makes sense

Under the rules as they are now: messages live in the model, a view builds none (README, "Model"), and a test
reads them with a function of its own.

- **Point 1, the one shape and its `dispatch`: its second motive is gone.** "A view never holds a message and cannot
  build one" is now the README's rule, kept by exporting `Message` as a type only, which no spike had tried. What is
  left of the shape is point 2's.
- **Point 2, a model that is data: valid, and worth less.** A model still holds `changeName`, so two models of one
  state are not equal. Nothing built since needs them to be: a reader calls the function with the text the test
  gives, and the exploration compares states, never models. What is left is `Inert` and a value, which a one-line
  `inert` answers.
- **The third spike's walk: overtaken, but for one thing.** It was built to do two things.
  - *To ask the rules of the model alone, with no view.* That is what a reader of 1 to 12 lines does today, in
    every example, with no constructor, no mark and nothing kept by `compose`.
  - *To hold the view to its model* (`Unoffered`, `Undrawn`). That is now checked with the renderer's tools, and
    `list` shows it with snabbdom's `messagesSentBy`, compared with what the reader returns.

  What is left of it is the one thing a reader cannot give: **that it is complete**. A walk finds every marked
  message of a model, where a reader that forgets a field is found only by `Missing`, with candidates. That is "who
  checks the reader" (`boundary.md`, "Open questions"), and its price is the spike's: a constructor every model
  calls, and the limits of identity.
- **Point 3: what a key sends is not data, and stands as it was.** The contract of the model says nothing of a
  key. No tool asks a subscription what it will send; a key that is listed and whose message `update` rejects, or
  that does nothing, is found by none. The exploration found it to be what its walk trusts most blindly. Short of a
  declaration, a test can list a key's messages and give them to `dispatchViolations` as it is, with every one
  `repeatable`, and so have `Rejected` asked of them: read in `dispatch-violations.ts`, not run. `Inert` would be
  asked of them too, once it exists.
- **Point 4, a command's answers: stands, and is the least pressing.** A test already stands in for `runCommand` in
  `simulate` and `rehearse`.
- **Point 5: half done by other means.** The tools judge the model's messages, read by the test. A key's and a
  command's are still judged by nothing.
- **"The smaller design"**, the first step both later reviews proposed: its first half, *a bridge tells an input's
  messages from the others*, is overtaken, since a bridge owes nothing now; the reader is where an input's messages
  are told, as it is where the text is given. Its second half, *a test lists the fixed messages of each key*, is
  the point above.
- **The owner's decision on `ActsTwice` and a key** needs no proposal to stand: it says how a key's messages are
  given to the tool, whoever lists them.

## Open questions

Only what is still asked once the proposal is suspended. The questions of the design itself (the shape's names, the
end of a subscription, a schema in a bridge, a key that changes its message) are in the full record.

- **Whether a key's messages are listed by the test, exported by the program, or declared.** The first costs no
  API and is trusted; only the last is true by construction.
- **Whether the reader's completeness is worth a mark.** See above.
- **Whether it is taken up again.** The owner named one case: if exploring on today's API were awkward because a
  model's functions do not compare. The spike found them no obstacle (`exploration.md`).
