---
name: effect-tea
description: How to write, compose, run and test programs with @fgaudo/effect-tea, the Elm architecture on Effect v4, from the guide, the tutorial and the examples of the version installed. Use when code imports @fgaudo/effect-tea or @fgaudo/effect-tea/testing, or when a program, a view, a bridge to a renderer, or the tests of a program are to be written with it.
---

# @fgaudo/effect-tea

This package holds its documentation, at the version installed. Read it here. The site and the repository show other
versions. The paths below are relative to this file.

## Where things are

- **The guide**, [`site/guide/`](../../site/guide/index.md): what the library does and promises, one concept a page.
  It is the specification. What it does not say, the library does not promise. Start with its index.
- **The tutorial**, [`site/tutorial/`](../../site/tutorial/index.md): one application, built step by step. A line
  `{@includeCode <file>#<name>}` in a page stands for the code between `// #region <name>` and `// #endregion` in
  that file.
- **The examples**, [`examples/`](../../examples): complete programs, each with its tests. The README lists what each
  one shows.
- **The bridges**, [`examples/snabbdom.ts`](../../examples/snabbdom.ts) and
  [`examples/react.ts`](../../examples/react.ts): the library ships no renderer. Copy a bridge into the project, or
  write one ("Writing a bridge" in the guide). Their tests are
  [`examples/snabbdom.test.ts`](../../examples/snabbdom.test.ts),
  [`examples/react.test.ts`](../../examples/react.test.ts) and the suite both run,
  [`examples/bridge.test_suite.ts`](../../examples/bridge.test_suite.ts). snabbdom reads the global `window` when it
  loads. So a test that imports a snabbdom view and has no DOM must first load
  [`examples/preload.test_setup.ts`](../../examples/preload.test_setup.ts). Its comment says how. The examples import
  their own files with the `.ts` extension. If your `tsconfig.json` does not set `allowImportingTsExtensions`, remove
  the extension.
- **The API**: the declarations in `dist/`, with their doc comments. A line `@see The guide, "<page>", "<section>".`
  names a page of the guide by its title, and a heading or a bold title in that page.

## Which page to read

| To…                                         | read in the guide                         |
| ------------------------------------------- | ----------------------------------------- |
| write a first program                       | "Anatomy of a program", then the tutorial |
| decide what `update` does with a message    | "Update", "Rejections and defects"        |
| shape the state, the messages and the model | "Structuring a program", "Model"          |
| draw a view and send messages from it       | "View"                                    |
| talk to the world                           | "Commands", "Subscriptions"               |
| split a program into children               | "Composition"                             |
| keep what the user types                    | "Inputs the user types into"              |
| start the program and handle its defects    | "Running"                                 |
| test it                                     | "Testing"                                 |
| connect a renderer                          | "Writing a bridge"                        |
| know what is promised, and what is not      | "Guarantees"                              |

## Rules that are easy to break

Each rule is a summary. The section it names rules where the summary says less.

- **`update` may be called at any time.** Never assume it runs once per message. Keep it pure, and return a new state:
  never mutate one. The guide, "Update", "It may be called at any time". The guide, "Update", "Never mutate the state".
- **A state is always an object**, never a number or a string. The guide, "Anatomy of a program", "Its state is always
  an object".
- **Every program names its types first, then is made**: `program<{ state: State }>().make({ … })`. Its
  commands, events, external messages and flags are named there, or it has none. Its services are never named: they are
  inferred. The guide, "Anatomy of a program", "Its types are named first, then it is made".
- **`reject` is for a message that may arrive and does not apply in the state. `defect` is for one that cannot
  arrive.** What the view draws never rules a message out: a tap may come from an older frame. The guide, "Rejections
  and defects", "In short". The guide, "Rejections and defects", "What the view draws never rules a message out".
- **Every message a view can send is in its model, as a value.** A model is data: it holds no function. The guide,
  "Model", "Messages live in the model". The guide, "Model", "A model is data".
- **A command is data, and `runCommand` runs it.** An expected failure becomes a message, as the success does. A
  command cannot be cancelled: work that should stop is a subscription. The guide, "Commands", "An expected failure
  becomes a message, as the success does". The guide, "Commands", "Commands cannot be cancelled".
- **A subscription has a key, and never ends in silence.** Its end value is a message. The guide, "Subscriptions",
  "A subscription never ends in silence".
- **A parent and its children talk only through external messages and events.** The guide, "Composition", "Events and
  external messages".
- **What the user types into an input is no message of the program.** The program declares where it goes. The guide,
  "Inputs the user types into", "Rules".
- **A plain callback sends a message with `Effect.runSync(dispatch(message))`.** The guide, "View", "A handler may run
  it either way".
- **A defect ends the run.** The library does not log it or recover from it: reporting it is the application's job.
  The guide, "Running", "When a defect happens".
- **Each testing tool has its use.** The guide, "Testing", "The tools".
