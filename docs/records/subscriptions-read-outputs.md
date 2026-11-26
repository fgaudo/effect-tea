# A parent's subscriptions given its children's outputs

**Status:** decided on 26 November 2026, as step 95 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Each claim is **run**, by a test that the text names, or
**reasoned**.

## The question

A parent read its children's outputs in `update`, `external`, `onEvent`, `makeModel` and `output`, and not in
`subscriptions`. So it could not list a key by what a child says of itself, as a back button listened to only while a
page has something to go back to ([`application-report-0.9.md`](application-report-0.9.md), point 5), unless it kept
a copy of the child's condition in its own state, which "Events and external messages" advises against.

## Decided

**A parent's own `subscriptions` takes its children's outputs last: `subscriptions: (state, children) => …`.**

- **One role, one form** (reasoned, value 3). The functions of a parent that read its state read its children's
  outputs too, and `subscriptions` is one of them. A program without children takes nothing more, as its `update`
  does not (**run**: "a program has an output exactly when it names one, and one without children reads none").
- **The outputs are of the children of the state given**, as `makeModel` and `output` read them, and a child's step
  that leaves the parent's own state the very same changes what the parent lists (**run**: "subscriptions reads the
  outputs of the children of the state it is given"). The engine reads the keys of the whole state after every change
  of it, so no premise is taken.
- **Not breaking.** A function of the own state alone still fits. The `subscriptions` of the program that `make`
  gives stays a function of the whole state, as every program's.
- **The cost** (**run**, `bun run bench` and a parent of a thousand rows with a key of its own, 2,001 states, median
  of 7 rounds): the outputs are read lazily, by name, so a call builds one object for the children that declare an
  output, whatever their number. A thousand rows: 54 to 66 µs per change of state before, 40 to 56 µs after, in the
  noise of the machine; a parent's own key read from a row's output, 42 to 45 µs, against 41 to 43 µs for one read
  from its own state.

## The declarations stay functions of the parent's own state

- **`there`, `key`, `flags` and `ids`** say which children are there, and are read as the children are reconciled,
  in the order of their names. One that read a child's output would read a child that this reconciliation has not
  reached yet, or one it has just started: the order of the names would become a rule of what is there, and a child
  there by its own output would have no meaning.
- **`tell`** is read as each child is told, each to its end. One that read an output would give a child another value
  as a sibling answers, and a child's answer could change what it is told: the order of the names, again, would decide
  what each child hears, and a child could loop on itself.
- **`listening`** is read with the keys, once every child is in place, so it could read outputs with no order. It
  stays a function of the own state, as the other options of a declaration, for no program has shown a need for it:
  `rejected.md`, "Parked, not rejected", says what would reopen it.
