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
  - ./what-an-element-gives.md
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

Welcome. The guide teaches the library, one concept a page, at the version of the package it comes with.

This page is a map. It is a summary: the page each line links rules where the line says less.

## What a page promises

The library promises four things, and nothing else:

- what stands under "Rules", on any page: the rules that you keep, or build on, as you write a program;
- what stands under "What you can rely on", in [guarantees](./guarantees.md): what holds of a running program;
- what the doc comment of an export says, in your editor and in the API reference: what the export is, what it
  refuses, and the defect it throws;
- what the types of the API accept and refuse.

A promise is what you can build on. The library means to keep it, and its tests check it. A change of a promise is a
breaking change: before 1.0 it raises the minor version, and the changelog says how to upgrade. Under "Rules", a
sentence says what the library does, which is a promise, or what your program must do, which is a rule it keeps. The
rules that nothing checks are listed under "What is left to you", in guarantees.

The rest of a page explains, and binds nothing: a summary, an example, advice, a reason. Where it seems to say more
than the rules, the rules rule. What is not promised is unspecified: it may change in any release, and the changelog
does not say so. Where a page names something unspecified, it says so in a few words.

The library is at version 0.x, so its API still changes: a promise holds for the version you have installed, until a
release that raises the minor version changes it.

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
- **Rules**: what the library does, and what your program must do. It is all that the page promises.
- **Advice**: on some pages, how to design with the concept. It binds nothing: each piece gives its reason, and the
  case where it does not hold, where there is one.

Some pages end with a section of more examples, or of a reason. It explains, as the first two do.

## The pages

The pieces of a program:

- [Anatomy of a program](./anatomy-of-a-program.md): a program is a plain object with up to seven pieces, made with
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

- [Composition](./composition.md): a parent declares its children, and says where each child lives in its state. The
  library does the routing.
- [Events and external messages](./events-and-external-messages.md): a child raises an event to ask its parent for
  something. A parent sends a child an external message.
- [What an element gives](./what-an-element-gives.md): values that an element holds or reports, such as the text of a
  field or the offset of a scroll. Each is a message that the model holds without its value, and that the view fills.
- [Structuring a program](./structuring-a-program.md): advice on how to shape the state, the messages, the model and
  the children. It binds nothing, and the examples follow it.

Running and testing it:

- [Running](./running.md): how you start a program, what your renderer reads, and what to do when the run dies.
- [Guarantees](./guarantees.md): what the library promises about a running program, and what it leaves to you.
- [Testing](./testing.md): how a program is tested. Most of a program is pure, so most tests need no runtime.
- [Testing tools](./testing-tools.md): which tool of `@fgaudo/effect-tea/testing` answers which question. The doc
  comment of each tool says what fails the test.
- [Writing a bridge](./writing-a-bridge.md): how to connect the library to your renderer. A bridge draws the model of
  the current state, sends messages from the handlers of the view, and draws each controlled element with the value
  its model holds.

Finding your way:

- [Coming from Elm or React](./coming-from-elm-or-react.md): what you already know, and what this library calls it.
- [Glossary](./glossary.md): the words the guide uses, each in one line, with the page that defines it.
