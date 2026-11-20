---
title: Guide
children:
  - ./anatomy-of-a-program.md
  - ./update.md
  - ./model.md
  - ./view.md
  - ./commands.md
  - ./subscriptions.md
  - ./rejections-and-defects.md
  - ./composition.md
  - ./events-and-external-messages.md
  - ./inputs-the-user-types-into.md
  - ./structuring-a-program.md
  - ./running.md
  - ./guarantees.md
  - ./testing.md
  - ./testing-tools.md
  - ./writing-a-bridge.md
  - ./coming-from-elm-or-react.md
  - ./glossary.md
---

# Guide

Welcome. The guide says what the library does and what it promises, one concept a page. It is the specification: each
sentence of a page is a promise you can rely on. Where a page describes something without promising it, the page says
so.

This page is a map. It is a summary: the page each line links rules where the line says less.

## Where to start

- **New to the library?** Start with the [tutorial](../tutorial/index.md). It builds one application in five steps, and
  shows how the pieces fit.
- **Coming from Elm or React?** Read [coming from Elm or React](./coming-from-elm-or-react.md). It maps what you know
  to the words of this library.
- **Looking for a word?** The [glossary](./glossary.md) defines each word in one line.
- **Looking for a rule?** Open the page of its concept, in the list below.

## How a page is laid out

Most pages have the same sections, in this order:

- **In short**: the concept in a few sentences. It is enough for a first reading.
- **An example**: the concept in code, usually from the examples.
- **Rules**: what you follow when you write a program.
- **Do and don't**: on some pages, the rules summed up as pairs. The rules themselves are above it.
- **Precisely**: the exact details and the edge cases, for when you need them. They are promises too.

## The pages

The pieces of a program:

- [Anatomy of a program](./anatomy-of-a-program.md): a program is a plain object with up to six pieces, made with
  `program`. The pieces connect in a loop.
- [Update](./update.md): `update` takes a message, then the state, and returns the next step, or `reject`.
- [Model](./model.md): `makeModel(state)` turns the state into what the view reads: what it shows, and the messages
  its controls send.
- [View](./view.md): a view draws the model. Its controls send the program's messages with `dispatch`.

Its effects:

- [Commands](./commands.md): how `update` asks for work in the world, such as a save, and how the answer comes back to
  `update` as a message.
- [Subscriptions](./subscriptions.md): how a program listens to the world for as long as its state wants, as a clock
  that ticks while a timer runs.
- [Rejections and defects](./rejections-and-defects.md): what `update` does with a message that does not apply, and how
  to choose between `reject` and `defect`.

A larger program:

- [Composition](./composition.md): a parent declares its children and its inputs, and says where each child lives in
  its state. The library does the routing.
- [Events and external messages](./events-and-external-messages.md): a child raises an event to ask its parent for
  something. A parent sends a child an external message.
- [Inputs the user types into](./inputs-the-user-types-into.md): values that come from the user, such as the text of a
  field. The library stores each write, or rejects it, and no `update` is involved.
- [Structuring a program](./structuring-a-program.md): how to shape the state, the messages, the model and the
  children. The library does not enforce these rules, and the examples follow them.

Running and testing it:

- [Running](./running.md): how you start a program, what the run gives your renderer, and what to do when the run
  dies.
- [Guarantees](./guarantees.md): what the library promises about a running program, and what it leaves to you.
- [Testing](./testing.md): how a program is tested. Most of a program is pure, so most tests need no runtime.
- [Testing tools](./testing-tools.md): the five tools of `@fgaudo/effect-tea/testing`, what fails the test in each,
  and what each ignores.
- [Writing a bridge](./writing-a-bridge.md): how to connect the library to your renderer. A bridge draws the model of
  the current state, sends messages from the handlers of the view, and draws each controlled element with the value
  its model holds.

Finding your way:

- [Coming from Elm or React](./coming-from-elm-or-react.md): what you already know, and what this library calls it.
- [Glossary](./glossary.md): the words the guide uses, each in one line, with the page that defines it.
