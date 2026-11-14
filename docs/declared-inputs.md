# What reaches `update`, declared as data

**Status:** proposed, 14 November 2026. Nothing of it is done: no file of the library, of its tests or of its examples
has changed, and nothing was spiked. It records a discussion of one day and four reviews of two earlier forms of the
idea (Fable 5.2 twice, Opus 5.5 twice, each reading the code alone). "What it rests on" says what was checked and
what was only reported. It builds on [`inert-steps.md`](inert-steps.md), whose decision it does not replace.

## Context

A test asks a view what it sends (`messagesSentBy`, of each bridge) and `dispatchViolations` judges it against
`update`. Three things the tools cannot do today:

- **A message with input is not data.** A model holds `changeName: (name: string) => Message` (`examples/form`), a
  new function for each model, so a model is never equal to another, and the test gives the bridge the text to type.
  `Inert`, as `inert-steps.md` proposes it, then depends on the value typed and not on the control: `NameChanged` with
  the text the field has does nothing, and asks for an exemption.
- **No tool can ask a key what it will send.** A subscription is a `Channel` that makes its messages as it runs. A
  key that is listed and whose message `update` rejects, or that does nothing, is found by no tool (`inert-steps.md`,
  "A key whose message does nothing").
- **The states a test checks are those its generator invents.** The README's "Testing" asks for a generator that
  produces only valid states, written by hand. Nothing says they are the states the program reaches.

The three have one cause: what can reach `update` in a state is known only by running the view, the streams and the
commands.

## What was weighed: input through a subscription

The idea began as a rule: `dispatch` only takes messages that `makeModel` fixed; a widget with an input is external,
and its messages come from a subscription, with the controls that depend on it in time ("Save") as events of the
same subscription. It was weighed in three forms, and refused in each for the same reasons.

| Form | What it added | Why it was left |
| --- | --- | --- |
| An advice of the README: input through a subscription | nothing in the API | the reasons below |
| `subscriptions(model)`, one model for the view and the sources | the key in the model, so a view can mark its widget | the model is made for every state, drawn or not, and a child's lifted subscriptions leave its state object |
| `subscriptions(state)` whose entries list their fixed messages | the tools ask a key what it sends | the reasons below; the list is a promise the stream does not keep by construction |

The reasons, on which the four reviews agree:

- **The order is the run's today, and a second way in breaks it.** What a view sends and what a subscription emits
  enter one queue, each as it is sent or emitted (README, "Guarantees"). A keystroke through a subscription is queued
  when its fiber resumes, a click through `dispatch` at once, so "typed, then Save" rests on scheduling. Putting
  "Save" in the same subscription mends what moving the text broke, and every control that depends on an input
  follows it there.
- **Typed messages are checked today.** `Rejected` finds "a value typed that `update` does not store", which is what
  holds the README's rule that `update` accepts an input's messages wherever the input exists. A message declared
  external is checked by nothing.
- **A key that goes away drops what it sent.** `form` accepts `NameChanged` while saving so that a key typed before
  the input was disabled is stored. Through a subscription it would be dropped in silence, and so would a "Save".
- **The renderer would feed the run by a service.** The program's subscriptions would need what only a bridge
  provides, and `drive`, `rehearse` and `simulate` a stand-in for it.

What the idea was right about is its aim: what the program can fix beforehand should be data the tools validate, and
`Inert` should never depend on a value from outside. The proposal keeps the aim and leaves the transport.

## Decision

Proposed.

**In every state, everything that can reach `update` is declared as data, with the schema of what the outside
supplies.** The transport stays as it is: `dispatch` for a view, a key for a subscription, `runCommand` for a
command.

1. **One shape for a message that is offered**, whatever offers it: the message `update` gets, made from a value of
   a `Schema`. "Fixed" and "with input" are not two kinds, but how many values the schema has:

   | What the outside supplies | The schema | The tools |
   | --- | --- | --- |
   | nothing (a button, a tick) | none | try the one message |
   | one of a few (a select, a checkbox) | `Schema.Literals` | try each |
   | one of many (a text, a payload, a time) | `Schema.String`, … | sample, from values the test gives |

2. **A view's model holds such declarations**, and no function written by hand. A model is then data, equal by
   `Equal` to another of the same state, and a bridge finds what a view can send without a text to type.
3. **A subscription's entry declares the stream of its values and the message made of each.** The library applies
   the one to the other, so the declaration is true by construction, and a tick that carries a time is no second
   kind of subscription: its schema has many values. `Subscription` moves to the library's side, by the rule of
   `AGENTS.md`: the library must inspect it in tests without running it.
4. **A command declares its answers the same way.** It is the third way a message reaches `update`, and what makes
   the alphabet of a state complete.
5. **The tools read the declarations.** `Rejected`, `ActsTwice`, `Missing` and `Inert` judge every message offered
   in a state, a key's and a command's answer too. `Inert` and `ActsTwice` judge the control, not the value: they
   leave out a message whose schema has many values, with no exemption to write.
6. **A tool explores the program from `init`**, by the messages each state offers, to a bound. The states it checks
   are those the program reaches, and the generator written by hand is no longer needed for them.

Points 2 and 5 can be done without 3, 4 and 6, and give what the discussion was after. The smaller design both
later reviews proposed is their first step: a bridge tells the messages of an input's handler from the others, so
that `Inert` skips them, and a test lists the fixed messages of each key and gives them to `dispatchViolations`. It
changes no type, and is what to do if the rest is refused.

## What it rests on

- That `Schema` is stable and `Arbitrary` is not: **checked** at Effect 4.1.4. `effect/Schema` is marked
  `@stability stable` as a module, and `Schema.Literals` as a function; the exports of `effect/Arbitrary` read are
  each marked `@stability unstable`. So the tools cannot draw values from a schema themselves: the test gives them,
  as it gives the text today.
- That the values of a `Schema.Literals` can be listed from the schema by a stable API: **not checked**.
- That a model is made when the renderer reads it: **checked** (`lazyFrame` in `src/run.ts`; `docs/invariants.md`,
  "Frames cost only what is drawn"). It is why `subscriptions(model)` was left.
- That what a view sends is queued as it is sent and a subscription's message as it is emitted: **checked** in the
  README's "Guarantees". That `dispatch` is an offer to the run's one queue, and that a subscription's message is
  offered when its fiber runs: **reported** by all four reviews, from `src/engine.ts`, not read again.
- That Effect's default scheduler resumes a fiber in a task of its own, so that a click could overtake a keystroke:
  **reported** by one review, read and not run. Whether a browser reorders them is established by nobody.
- That a message of a start that is no longer active is dropped: **reported** by three reviews (`Core.arrive`).
- That the test of `form` checks `Rejected` and `Missing` with a text drawn at random: **reported** by two reviews.
- That exploring from `init` ends, to a bound, on programs larger than the examples: **not checked**.

## Alternatives

- **Input through a subscription**, in its three forms. Above.
- **The fixed messages of a key listed beside its stream**, as a promise. The stream may send what the list leaves
  out, and the tools would trust it. The same list in the test costs no API.
- **The stream emits the name of an event, and the engine takes the message from the entry of the state it applies
  it to.** True by construction, with no restart when a message changes. An event emitted in one state and applied
  in the next sends the message of the other ("Start" seen, "Pause" sent): a misfire, where today there is a
  rejection. Point 3 keeps the message of the entry the stream started with, and a key that changes it starts anew.
- **A constructor as a tag in the model**, completed by the view (`dispatch({ ...model.changeName, name })`). The
  model is data, and the view builds a message again.
- **The program exports its fixed messages as constants**, used by `subscriptions` and by the test. No API, and the
  message is written once; the test still says which key sends which. It is what a program can do today.

## What a consumer could notice

Every program changes: a model that holds a function for an input, each subscription, and each command with an
answer. It is a breaking change of most of the API, with changelog entries and the versions `release` asks for, one
for each step that is released.

## Open questions

- **The shape itself.** What a declaration is called and how it is written, for a message of a `Data.TaggedEnum`
  whose constructor takes a record, and whether one type serves the view, a key and a command.
- **What a bridge does with a schema.** Whether it decodes what the widget gives, and what a value that does not
  decode is: a defect, by the rule of defects, or nothing sent.
- **The end of a subscription.** It ends with a message today. Whether the end is a value of the stream as any
  other, with a message of its own in the entry.
- **A command's answers.** `runCommand` is an Effect the program writes. What declares its answers, and whether
  `rehearse`, where the test decides when a command answers, is asked for less.
- **Children.** How `compose` lifts a child's declarations, as it lifts its channels (`subscriptionsAt`).
- **`Missing`.** With the alphabet of a state as data, whether its `candidates` are still listed by the test.
- **The exploration.** Its bound, what it does of a schema with many values, and whether it is a tool of its own or
  what the others are given.
- **The order of the work.** A spike on `form`, `timer` and `list` for points 2, 3 and 5, before anything is
  decided; the premise on `Schema.Literals` before the spike.
