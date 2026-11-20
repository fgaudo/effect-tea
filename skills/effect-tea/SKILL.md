---
name: effect-tea
description: How to write, compose, run and test programs with @fgaudo/effect-tea, the Elm architecture on Effect v4, from the guide, the tutorial and the examples of the version installed. Use when code imports @fgaudo/effect-tea or @fgaudo/effect-tea/testing, or when a program, a view, a bridge to a renderer, or the tests of a program are to be written with it.
---

# @fgaudo/effect-tea

This package holds its documentation, at the version installed. Read it here. The site and the repository show other
versions. The paths below are relative to this file.

## Where things are

- **The guide**, [`site/guide/`](../../site/guide/index.md): what the library does and promises, one concept a page.
  It is the specification. What it does not say, the library does not promise. Start with its index. Most pages have
  the same sections, in this order: "In short", "An example", "Rules", "Do and don't" on some pages, and "Precisely",
  whose details are promises too.
- **The tutorial**, [`site/tutorial/`](../../site/tutorial/index.md): one application, built step by step. A line
  `{@includeCode <file>#<name>}` in a page stands for the code between `// #region <name>` and `// #endregion` in
  that file.
- **The examples**, [`examples/`](../../examples): complete programs, each with its tests. The README lists what each
  one shows.
- **The bridges**, entries of the package: `@fgaudo/effect-tea/snabbdom`
  ([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), with `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`,
  and `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)). The library draws nothing. A bridge
  needs its renderer installed beside the package: `snabbdom`, or `react` and `react-dom`. Import a bridge, or write
  one for another renderer ("Writing a bridge" in the guide). Their tests are
  [`bridges/snabbdom.test.ts`](../../bridges/snabbdom.test.ts),
  [`bridges/react.test.ts`](../../bridges/react.test.ts) and the suite both run,
  [`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts). snabbdom reads the global
  `window` when it loads. So a test file that imports snabbdom before a DOM is registered must first load a file that
  sets `window` to `undefined`, as [`bridges/snabbdom-preload.ts`](../../bridges/snabbdom-preload.ts) does. This holds
  for a file that registers a DOM in `beforeAll` too: its imports run first. The preload's comment says how. The
  examples import their own files with the `.ts` extension. If your `tsconfig.json` does not set
  `allowImportingTsExtensions`, write `.js` instead under `moduleResolution` `nodenext`, or remove the extension under
  `bundler`.
- **The API**: the declarations in `dist/`, with their doc comments. A line `@see The guide, "<page>", "<section>".`
  names a page of the guide by its title, and a heading or a bold title in that page.

## Which page to read

| To…                                         | read in the guide                             |
| ------------------------------------------- | --------------------------------------------- |
| write a first program                       | "Anatomy of a program", then the tutorial     |
| decide what `update` does with a message    | "Update", "Rejections and defects"            |
| shape the state, the messages and the model | "Structuring a program", "Model"              |
| draw a view and send messages from it       | "View"                                        |
| talk to the world                           | "Commands", "Subscriptions"                   |
| split a program into children               | "Composition", "Events and external messages" |
| keep what the user types                    | "Inputs the user types into"                  |
| start the program and handle its defects    | "Running"                                     |
| test it                                     | "Testing", "Testing tools"                    |
| connect a renderer                          | "Writing a bridge"                            |
| know what is promised, and what is not      | "Guarantees"                                  |

## What kind of thing is it

A design answers this question for each part of a program. Each line below is a summary: the section it names rules
where the summary says less.

| The thing                                                       | What it is                                       |
| --------------------------------------------------------------- | ------------------------------------------------ |
| something happened: a click, an answer, a tick                  | a message; `update` decides what it means        |
| a text that the user types                                      | an input; no `update` sees it                    |
| work whose answer must arrive, even if the state has moved on   | a command: data, which `runCommand` runs         |
| listening, or work that stops when the state no longer wants it | a subscription, under a key                      |
| what stays open while a value it uses changes, as a connection  | a service, from a layer provided to `run`        |
| what follows from the state                                     | computed in `makeModel`, not kept in the state   |
| what the platform keeps by itself: a hover, the focus           | not a state of the program                       |
| a message that may arrive, and does not apply in the state      | `reject`                                         |
| a message that only a bug can bring                             | `defect`                                         |
| an expected failure of a command                                | a message, as the success is                     |
| a part that the parent reads, or enables from its own state     | not a child: the parent's state, or its input    |
| what a child asks of its parent                                 | an event                                         |
| a fact that several children must see as one                    | an external message, which the parent sends down |

The guide, "Structuring a program", "What kind of thing is it": its rows name the page of each.

## Rules that nothing checks

The library does not enforce these rules: no type refuses a break of them, and the run goes on. So check each one by
reading the code. The guide, "Guarantees", "What is left to you". The guide, "Structuring a program", "In short".

- **`update`, `makeModel` and `subscriptions` are pure, and a state is never mutated.** `update` may be called at any
  time: never assume it runs once per message. The library reuses a child's model and subscriptions while the child's
  state is the same object. The guide, "Update", "Keep it pure". The guide, "Update", "It may be called at any time".
  The guide, "Update", "Never mutate the state".
- **One state machine per concern, and no flags.** Each concern is a union with a case per state. Each case holds only
  what exists in it. What follows from the state is computed in `makeModel`, not kept. The guide, "Structuring a
  program", "One state machine per concern, no flags". The guide, "Structuring a program", "No derived data in the
  state".
- **A view draws its model, and decides nothing.** A view is a function `(model, dispatch) => Node`. It matches tags
  and formats values. What it would decide, `makeModel` decides, as a case of the model. The guide, "View", "In short".
  The guide, "Structuring a program", "A view draws, it never decides".
- **What the program draws comes from its model.** It comes from nowhere else, with one exception: what the platform
  keeps by itself, as a hover or the focus. An element with a value of its own, as a text field, shows what the user
  typed into it only for the length of its own event. The guide, "View", "What the program draws comes from its
  model". The guide, "Inputs the user types into", "The element on screen".
- **Each bridge says what it draws beside the model.** The bridge to snabbdom keeps no state beside the program's,
  except the value a model gave each controlled element. With the bridge to React, the application's components may
  keep state of their own, which the testing tools do not see. The guide, "View", "Each bridge says what it draws
  beside the model".
- **With React, the run lives as long as `Host`'s effect.** `<Activity>`, a remount, a new `key` and StrictMode start
  the program again from `init`. For a state that outlives a component, start the run yourself and draw it with
  `Draw`. A run that dies is thrown to the nearest error boundary, or given to `reportError` once `Host` has
  unmounted. The guide, "Guarantees", "With the bridge to React, the run lives as long as the effect that starts it".
  The guide, "Guarantees", "With the bridge to React, a run that dies is thrown to the nearest error boundary".
- **A parent never reads a child's state to decide.** A child gets what it needs from its own services and
  subscriptions. The guide, "Structuring a program", "A parent never reads a child's state to decide".
- **Whatever a subscription depends on is in its key.** A new subscription under a kept key is not used. A value that
  stays the same while the key is kept, as a child's own id, can stay out. The guide, "Subscriptions", "A subscription
  sees the state only through its key". The guide, "Subscriptions", "A value that stays the same while the key is kept
  can stay out of the key".
- **A function of the program never interrupts the fiber it runs in.** `init` runs in the fiber of whoever runs the
  program. `update`, `subscriptions` and the options run where the message was sent, and `makeModel` where the model is
  read. Each could reach that fiber with `Fiber.getCurrent`. An interruption of the fiber of whoever runs the program
  is no defect, so no defect says it happened. The guide, "Guarantees", "A function of the program never interrupts
  the fiber it runs in".

## Rules that a test checks

The run does not check these. A test does, with the tool named.

- **The model holds what `update` accepts, all of it**, but what it withholds on purpose: `dispatchViolations`. The
  guide, "Testing tools", "dispatchViolations".
- **A message sent twice from one model acts once**, unless it is marked `repeatable`: `dispatchViolations`, with
  `ActsTwice`. The guide, "Testing tools", "Each message must act once when sent twice".
- **A view sends only the messages its model holds**: your renderer's tools, as `messagesSentBy` for snabbdom. The
  guide, "Testing", "The view". The guide, "Model", "Precisely".
- **A rejection is asserted as `reject` itself**, with `toBe(reject)`. The guide, "Testing", "Do and don't".

## What the compiler refuses

A break of these rules does not compile, so they need no remembering. A state is always an object, never a number or a
string. A program names its types, then is made, and a type it does not name is one it does not have. An execution
cannot fail: an expected failure becomes a message. A subscription is a `Channel` whose end value is a message. A
parent passes on only the external messages of a child, never one the child keeps to itself. The guide lists the rest:
The guide, "Anatomy of a program", "What does not compile". The guide, "Composition", "Precisely". The guide, "Anatomy
of a program", "Its state is always an object". The guide, "Anatomy of a program", "Its types are named first, then it
is made". The guide, "Commands", "An execution cannot fail". The guide, "Subscriptions", "The type says all of it".
The guide, "Events and external messages", "A parent that passes on an external message of a child".

## Signs that the design went wrong

Each sign breaks the rule named after it.

- A view that takes more than its model and its dispatch, or reads a clock or a global. The guide, "View", "In
  short". The guide, "Structuring a program", "No derived data in the state".
- A boolean such as `isSaving` in the state. The guide, "Structuring a program", "One state machine per concern, no
  flags".
- A condition on data in a view, such as `items.length === 0`. The guide, "Structuring a program", "A view draws, it
  never decides".
- A variable outside the state that the screen depends on, or a service that the renderer reads. The guide, "View",
  "What the program draws comes from its model".
- A renderer written for one program, in place of a bridge's renderer. The guide, "View", "What the program draws
  comes from its model".
- A message built in a view, or `Message` exported as a value. The guide, "Model", "Messages live in the model".
- A message for each keystroke. The guide, "Inputs the user types into", "What the user gives an input is no message
  of the program".
- `defect` on a message of the view. The guide, "Rejections and defects", "What the view draws never rules a message
  out".
- A child's `init` read by hand, as `Clock.clock.init.state`: it leaves the child's commands behind. The guide,
  "Composition", "Do and don't".
- The `.state` of a step taken by hand: it drops that step's commands and its events. The guide, "Events and external
  messages", "Combining steps".
- A parent that reads a child's state. The guide, "Structuring a program", "A parent never reads a child's state to
  decide".
- A rejection asserted as "the state did not change". The guide, "Testing", "Do and don't".
- An attempt to cancel a command. The guide, "Commands", "Commands cannot be cancelled".
- A `main` that runs the program and does not report its failure. A defect ends the run, and the run does not log it:
  reporting it is the job of the app around the run. The guide, "Running", "When a defect happens".

At such a sign, stop, and go back to the table of "What kind of thing is it". To make the design work, do not add a
state outside the program, a renderer, or a parameter of a view.
