# What reaches `update`, declared as data

**Status:** rejected by the owner, 23 November 2026 ("Weighed again", at the end), with one part of it taken to a
spike: a message with one value left for the element to give. It was suspended by the owner on 14 November 2026, the
day it was proposed, not revoked, and parked in [`rejected.md`](../rejected.md) until then. Nothing of it is done. But
for "Weighed again", the record is as it was while the proposal was suspended, and its words say so. This is a short
record, rewritten the same day after the contract of the library became the model's with `update`
([`boundary.md`](boundary.md), item 1). The record in full, with every finding of its three spikes, is
`docs/declared-inputs.md` on the branch `claude/declared-inputs-spike-8af3b8`. The spikes' code is on
`spike/declared-inputs`, `spike/dispatch-offers` and `spike/offer-check`, each cut from the one before, never to be
merged. Everything under "What was proposed", "What the spikes showed" and "What the owner decided" is carried over from
that record and was not run again; "What still makes sense" was read against the code today, at `1d0ccc9`, and again on
15 November 2026, at `7074b7a`, after the port of the plain input ([`registers.md`](registers.md)), which reached this
record's first aim by another way.

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
   it is, and rejected: [`exploration.md`](exploration.md).

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

Under the rules as they are now: messages live in the model, a view builds none (guide, "Model"), and a test
reads them with a function of its own.

- **Point 1, the one shape and its `dispatch`: its second motive is gone.** "A view never holds a message and cannot
  build one" is now the guide's rule, kept by exporting `Message` as a type only, which no spike had tried. What is
  left of the shape is point 2's.
- **Point 2, a model that is data: reached, by the port.** An input is declared in `composition`, its value lives in
  the state, and the view writes over the value its model holds (`write(was, value)`): no model holds `changeName`,
  and `form`'s test checks that equal states built apart have equal models. No offer, schema or mark was needed.
  `Inert` and a value are no longer a case: a write is no message of a model's, and one of the value held leaves the
  very value ([`inert-steps.md`](inert-steps.md), "Since the port").
- **The third spike's walk: overtaken, but for one thing.** It was built to do two things.
  - _To ask the rules of the model alone, with no view._ That is what a reader of 1 to 12 lines does today, in
    every example, with no constructor, no mark and nothing kept by `compose`.
  - _To hold the view to its model_ (`Unoffered`, `Undrawn`). That is now checked with the renderer's tools, and
    `list` shows it with snabbdom's `messagesSentBy`, compared with what the reader returns.

  What is left of it is the one thing a reader cannot give: **that it is complete**. A walk finds every marked
  message of a model, where a reader that forgets a field is found only by `Missing`, with candidates. That is "who
  checks the reader" (`boundary.md`, "Open questions"), and its price is the spike's: a constructor every model
  calls, and the limits of identity. Since the port it is asked of fixed messages alone, as an input's writes are no
  reader's.
- **Point 3: what a key sends is not data, and stands as it was.** The contract of the model says nothing of a
  key. No tool asks a subscription what it will send; a key that is listed and whose message `update` rejects, or
  that does nothing, is found by none. The exploration found it to be what its walk trusts most blindly. Short of a
  declaration, a test can list a key's messages and give them to `dispatchViolations` as it is, with every one
  `repeatable`, and so have `Rejected` asked of them: [`volume`](../../examples/volume/volume.test.ts)'s test does
  since 15 November 2026, with a reader of the keys as it has one of the model, and was seen to fail, alone of its
  file, on an `update` that rejects the release of a drag while muted. Nothing checks that the reader lists what the
  channel sends. `Inert` would be asked of them too, once it exists.
- **Point 4, a command's answers: stands, and is the least pressing.** A test already stands in for `runCommand` in
  `simulate` and `rehearse`.
- **Point 5: half done by other means.** The tools judge the model's messages, read by the test. A key's and a
  command's are still judged by nothing.
- **"The smaller design"**, the first step both later reviews proposed: its first half, _a bridge tells an input's
  messages from the others_, is overtaken, since a bridge owes nothing now; the reader is where an input's messages
  are told, as it is where the text is given. Its second half, _a test lists the fixed messages of each key_, is
  the point above.
- **The owner's decision on `ActsTwice` and a key** needs no proposal to stand: it says how a key's messages are
  given to the tool, whoever lists them.

## Open questions

Only what is still asked once the proposal is suspended. The questions of the design itself (the shape's names, the
end of a subscription, a schema in a bridge, a key that changes its message) are in the full record.

- **Whether a key's messages are listed by the test, exported by the program, or declared.** The first costs no
  API and is trusted; only the last is true by construction.
- **Whether the reader's completeness is worth a mark**: no, 15 November 2026; `Missing` is enough
  ([`rejected.md`](../rejected.md)).
- **Whether it is taken up again.** What is left of its context is the key and the command, since what the user
  types is no message now, and a model holds no function for it. The owner named one case: if exploring on today's
  API were awkward because a model's functions do not compare. The spike found them no obstacle (`exploration.md`).

## Weighed again, 23 November 2026

As step 9 of `ROADMAP.md`, by a session of Fable 5.2: each parked entry of [`rejected.md`](../rejected.md) that breaks
the API was weighed again with the owner, since a change that breaks the API costs less the fewer users the library
has. It was read against the code at `04eb7b4`, after a subscription was made from its key alone
([`subscription-from-key.md`](subscription-from-key.md)) and an input got the form it stores a value in
([`stored-form.md`](stored-form.md)). The owner decided each point as advised.

- **The proposal is rejected.** Of its six points, the second was reached by the plain input, the first lost its
  motive with it, and the sixth was rejected ([`exploration.md`](exploration.md)). What was left is the messages of a
  key and the answers of a command. To declare them rewrites every program, and a test lists the first and stands in
  for the second today. While it was parked, a rewrite of every program stayed open, and five entries of `rejected.md`
  named it as what reopens them: each has a condition of its own now.
- **A subscription that declares what it sends is rejected.** It makes `Subscription` a type of the library's own,
  where `AGENTS.md` keeps it Effect's. Since a subscription is made from its key alone, a test's list of what each
  key sends is a function of the type of the keys, which does not compile until it says what a new key sends.
  Nothing checks that the list holds what the channel sends: that stands, with what would reopen it.
- **A message with one value left for the element to give is taken to a spike**, as step 40 of `ROADMAP.md`. It is
  the narrower form that the second opinion of 22 November 2026 proposed
  ([`kept-children.md`](kept-children.md), "What was not taken from the second opinion").

### A message with one value left for the element to give

It is for a fact that comes with a value: the end of a scroll with its offset, a click on a board with its point. The
guide's answer is a write, then a message ("Inputs", "What an element reports"), decided on 22 November 2026
([`application-report.md`](application-report.md), point 1). That answer holds by what the guide promises already. It
costs two steps for one fact, and a place in the state for a value that is read once. By the guide's own table
("Structuring a program"), something that happened is a message, and `update` decides what it means. Of the two
reasons of "Why what the user types is no message", the first does not hold for such a fact: there is something to
decide. The second holds only for a whole message: a model cannot hold it as a value, but it can hold all of it but
the value.

**The form.** The model holds the message without its value, as data. The view fills the value that the element
gives, and sends the message. An input stays as it is, for a value that the element holds and the program gives back,
or that the program reads when something else happens.

```ts
type Model = { readonly scrollEnded: Omit<Extract<Message, { _tag: "ScrollEnded" }>, "offset"> }

const makeModel = (): Model => ({ scrollEnded: { _tag: "ScrollEnded" } })

dispatch({ ...model.scrollEnded, offset })
```

**A probe, run and not kept**, on Effect 4.1.4, TypeScript 7.0.2 and Bun 1.4.5, with `Message` a `Data.TaggedEnum`:

- It compiles with no export of the library. A dispatch of the message without its value does not compile, nor does
  one with a value of another type.
- The message that a view fills is equal, by `Equal`, to the one that the constructor makes, and the models of two
  states built apart are equal.
- No type refuses a view that writes the whole message by hand, as none does today.

**Against it.** "A view never builds a message of the program itself" ("Model") takes an exception: a view fills one
value. And no example of the library has a value that an element reports, so nothing on the library's own terms shows
what either form costs. As the second opinion reported, and not read here: in one application, three of six `set`s
were written to decide on a write. That decides nothing (`AGENTS.md`).

**When.** It breaks nothing, so it does not wait for the release that takes the breaking changes. But 0.9.0 is the
first release that says "a write, then a message": the owner decides on the spike before it is released.

**Found beside it**, by reading `bridges/snabbdom-testing.ts`: `messagesSentBy` gives a listener an event whose target
holds the `value` and the `checked` of its element alone. So a handler that reads another property, as `scrollTop`,
gets `undefined`, with an input today as with this form. The spike says what the tool would need.

**Weighed beside it, and refused**: the value declared in `make`, with a function of the program from the value to
the message, which a view writes into by its name as it writes into an input (`rejected.md`, "A value that an element
reports, declared in `make` with the message made of it").
