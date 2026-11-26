---
name: effect-tea
description: How to write, compose, run and test programs with @fgaudo/effect-tea, the Elm architecture on Effect v4, from the guide, the tutorial and the examples of the version installed. Use when code imports @fgaudo/effect-tea or @fgaudo/effect-tea/testing, or when a program, a view, a bridge to a renderer, or the tests of a program are to be written with it.
---

# @fgaudo/effect-tea

This package holds its documentation, at the version installed. Read it here. The site and the repository show other
versions. The paths below are relative to this file.

This file sums up the guide. Each rule names the page that rules it, as `The guide, "<page>", "<section>"`: a page by
its title, and a heading or a bold title of that page. Where this file says less than the page, the page rules.

## Where things are

- **The guide**, [`site/guide/`](../../site/guide/index.md): one concept a page. Start with its index. A page has "In
  short", "An example", "Rules", and "Advice" on some pages. The library promises four things: what stands under
  "Rules", what stands under "What you can rely on" in "Guarantees", what the doc comment of an export says, and what
  the types accept and refuse. The rest explains, and binds nothing. What is not promised is unspecified, and may
  change in any release. The guide, "Guide", "What a page promises".
- **The tutorial**, [`site/tutorial/`](../../site/tutorial/index.md): one application, built in five steps. A line
  `{@includeCode <file>#<name>}` stands for the code between `// #region <name>` and `// #endregion` in that file.
- **The examples**, [`examples/`](../../examples): complete programs, each with its tests. The README lists what each
  one shows. They import their own files with the `.ts` extension. Without `allowImportingTsExtensions` in your
  `tsconfig.json`, write `.js` under `moduleResolution` `nodenext`, or no extension under `bundler`.
- **The API**: the declarations in `dist/`, with their doc comments. A doc comment says what the export is, how it is
  called, what does not compile, and the defect it throws. Its line `@see The guide, "<page>".` names the page that
  teaches its concept.
- **The bridges**, entries of the package. The library draws nothing: a bridge connects it to a renderer.
  - `@fgaudo/effect-tea/snabbdom` ([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), with `drawInto`, and
    `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`. It needs `snabbdom` 3.6.4 or a newer 3.x installed
    beside the package.
  - `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), with `Host`, which starts a program and
    runs it while it is mounted, and `Draw`, which draws a program that you start yourself. It needs `react` 19.3.0 or a
    newer 19.x, and imports nothing else of React: it draws with React DOM, and with React Native. On React Native, a
    handler may run on a view older than the state: lock what is typed by the shape of the state. The guide,
    "Writing a bridge", "What a bridge does".
  - For another renderer, write a bridge. The guide, "Writing a bridge", "What a bridge does". Its tests can start
    from those of the package, [`bridges/bridge.test_suite.ts`](../../bridges/bridge.test_suite.ts).

## Which page to read

| To…                                         | read in the guide                             |
| ------------------------------------------- | --------------------------------------------- |
| write a first program                       | "Anatomy of a program", then the tutorial     |
| decide what `update` does with a message    | "Update", "Rejections and defects"            |
| shape the state, the messages and the model | "Structuring a program", "Model"              |
| draw a view and send messages from it       | "View"                                        |
| talk to the world                           | "Commands", "Subscriptions"                   |
| split a large program into modules          | "Structuring a program"                       |
| split a program into children               | "Composition", "Events and external messages" |
| hold what an element holds or reports       | "What an element gives"                       |
| start the program and handle its defects    | "Running"                                     |
| test it                                     | "Testing", "Testing tools"                    |
| connect a renderer                          | "Writing a bridge"                            |
| know what is promised, and what is not      | "Guarantees"                                  |

## What kind of thing is it

A design answers this question for each part of a program. The guide, "Structuring a program", "What kind of thing is
it": each of its rows names the page that rules it.

| The thing                                                        | What it is                                          |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| something happened: a click, an answer, a tick                   | a message; `update` decides what it means           |
| a value that an element holds or reports: a text, a scroll's end | a message held without the value; the view fills it |
| work whose answer must arrive, even if the state has moved on    | a command: data, which `runCommand` runs            |
| listening, or work that stops when the state no longer wants it  | a subscription, under a key                         |
| what stays open while a value it uses changes, as a connection   | a service, from a layer provided to `run`           |
| what follows from the state                                      | computed in `makeModel`, not kept in the state      |
| what the platform keeps by itself: a hover, the focus            | not a state of the program                          |
| a message that may arrive, and does not apply in the state       | `reject`                                            |
| a message that only a bug can bring                              | `defect`                                            |
| an expected failure of a command                                 | a message, as the success is                        |
| a part of a large program that its other parts read              | a module of the program: functions of the state     |
| a part whose controls the parent enables from its own state      | most often the parent's own state and messages      |
| a value that the user types, and a parent reads                  | a message of the program whose rules use it         |
| what holds in a child, that its parent reads                     | the child's `output`                                |
| what a child asks of its parent                                  | an event                                            |
| a fact that several children must see as one                     | `tell` in their declaration, an external message    |

## Rules that nothing checks

No type refuses a break of these, and most often the run goes on. So check each one by reading the code. The guide,
"Guarantees", "What is left to you".

- **The functions of a program are pure, and no value is ever mutated.** `update`, `external`, `makeModel`, `output`,
  `subscriptions`, an `init` that takes flags, the handlers of `onEvent`, and `there`, `key`, `flags`, `ids`,
  `listening` and `tell` are pure. The library calls them when it chooses: never assume that `update` runs once per
  message. No value given to the library, or taken from it, by a program or a test, is mutated once made, nested
  objects included. A copy of the state shares its nested objects, so copy each one you change. The guide, "Update",
  "Keep it pure". The guide, "Update", "It may be called at any time". The guide, "Update", "Never mutate the state".
- **A model is data.** It holds no function, and the models of two equal states are equal by `Equal`. A control that
  picks among fixed values holds one message for each value, never a function `(digit) => Message`. The guide,
  "Model", "A model is data".
- **A view sends only the messages its model holds.** It never builds one. What an element gives, as the text of a
  field or the offset of a scroll, is a message that the model holds without the value, as
  `{ _tag: 'NameTyped' } as const`. The view fills each field left with one value that the element or its event gives,
  copied as it is: it combines none, compares none and converts none. It copies the numbers of a browser object, as a
  `DOMRect`. A message that an element fills is a plain tagged one, never a class. The guide, "Model", "Messages live
  in the model". The guide, "What an element gives", "Rules".
- **What the program draws comes from its model.** The exceptions: what the platform keeps by itself, as a hover, the
  focus, an animation it runs; what the user typed into a text field, for the length of its own event; and, with the
  bridge to React, the state of the application's own components. A part of the page outside the bridge's `root`, as
  its title, is drawn from the model by code over the handle, beside the bridge. The guide, "View", "What the program
  draws comes from its model".
- **Whoever starts a program runs it.** `start` gives `{ app, run }`, and nothing checks that `run` runs. A program
  never run still applies its messages, and does nothing else: no effect starts, and no defect is reported. Only
  `model()` throws a defect of `makeModel` or `init`, and from a defect on no message is applied. Leave it unrun only on
  a server. Write `const { app, run } = start(program)`, so that a linter can report a `run` left unused.
  The guide, "Guarantees", "Whoever starts a program runs it".
- **Commands run to their end, or to the end of the run.** No change of state stops one. `update` decides whether its
  answer still applies. The guide, "Commands", "Commands cannot be cancelled".
- **Nothing is bounded, and nothing times out.** The effects may lag behind the state without a bound, and when they
  start is unspecified: a step's commands may start after later messages, and a subscription may start, and be
  stopped, for a key already gone. A listener of the `App` that answers each new state with a message that makes
  another never lets the call return. A release that never ends holds up the program. No defect says so. The guide,
  "Guarantees", "Nothing is bounded, and nothing times out".
- **The program runs on the stack of whoever sends the message.** A slow `update`, option or listener holds up the
  handler, command or subscription that sent the message. An element that reports at each of its events, as a scroll,
  runs a step at each: send its value once, as the events end, unless the program follows each value. The guide,
  "Guarantees", "The program runs on the stack of whoever sends the message".
- **A subscription that sends faster than the screen refreshes holds the run back.** The bridges draw once for each
  task, or listener that the browser calls, that brings a new state. Let such a subscription send its messages by
  batches (`Stream.groupedWithin`). The guide, "Guarantees", "A subscription that sends faster than the screen
  refreshes holds the run back".
- **Flags, and what `key` gives, are compared with `Equal`.** Other flags, or another value of `key`, start a child
  again. A function made anew in `flags` or `key` is another value each time, and the child loses its state at each
  step: give plain values. An `Equal` and a `Hash` written by hand keep Effect's rules, or what the library does with
  that value is undefined. The guide, "Guarantees", "What is left to you".
- **What must stay private is in a service, not in a key.** A key is shown whole, in a defect of its subscription and
  to `onApplied` and `onIgnored`. The guide, "Guarantees", "What must stay private is in a service, not in a key".
- **A state that starts a program elsewhere is one that the program made.** A state given as `init: { state }` is one
  that this program made, by every function of its declarations, or one that `stateOf` made for it. What the library
  does with another, as one kept across a reload after a declaration changed, is unspecified. The guide, "Guarantees",
  "A state that starts a program elsewhere is one that the program made".
- **A function of the program never interrupts the fiber it runs in.** It runs where the library calls it: in the call
  of `start` or `make`, where a message is sent, or where the model is read. That may be any fiber, or none. One that
  interrupts the fiber of a command or a subscription is a defect of it; another fiber's interruption no defect
  reports. The guide, "Guarantees", "A function of the program never interrupts the fiber it runs in".

## What a program builds on

The library promises these, and a program that forgets them goes wrong.

- **A message is applied in the call that sends it.** When `dispatch` returns, `update` has seen the message, and the
  model is the new one. Messages are applied one at a time, in the order they were sent. The guide, "View", "Sending
  applies the message". The guide, "Guarantees", "One message at a time, in the order they were sent".
- **The state is ahead of its effects.** A step's commands, and the subscriptions it starts, start in the run, after
  the step: whether before `dispatch` returns or after it is unspecified. So a test that checks what a command does
  waits for a model that shows its answer. The guide, "Testing tools", "The state is ahead of its effects".
- **A message may arrive in any state.** A tap may come from a model drawn before. A command's answer arrives even if
  the state has moved on, and answers come in the order the commands end. `update` rejects what no longer applies, and
  a message that must not apply to a later state says what it was for, as the id of a row. The guide, "Rejections and
  defects", "What the view draws never rules a message out". The guide, "Commands", "Commands run concurrently".
- **Subscriptions follow their keys.** A new key starts its subscription, a missing key stops it, and what it sent
  after its key went away never reaches `update`. A subscription never ends in silence: it runs forever, or ends with
  one last message. `listen` takes the key alone, so the key carries what the subscription needs. The guide,
  "Subscriptions", "A subscription never ends in silence". The guide, "Guarantees", "Subscriptions follow their keys".
- **A parent's children are those its state lists.** `child(program, { flags })` is always there, and
  `child(program, { there })` where `there` holds, or gives `Some` of the child's flags. A child dropped loses its
  state, and one listed again starts from its `init`, as another instance. An answer reaches the instance that asked,
  or is rejected. A message of a view reaches the instance that is there, unless its dispatch names one:
  `children.X.instance()` in `makeModel` gives the number, and `forwardTo(dispatch, { _tag: 'X', instance })` the
  dispatch. Where the screen may show an older draw, give a child's view that dispatch, and the number as its key. The
  guide, "Composition", "Children's views". The guide, "Composition", "Advice".
- **A child declared with `tell` was last told what its parent's state gives.** It is told the value as it starts,
  and again only where the state gives another value, by `Equal`, than the one the declaration last told it: a step
  that gives an equal value tells it nothing. The guide, "Guarantees", "A child was last told what its parent's state
  gives".
- **A defect ends the run, and the run does not log it.** The run dies with a `ProgramDefect`, whose `cause` is the
  defect and whose `where` says where. Reporting it, and what the user sees next, are the job of the app around the
  run. The guide, "Running", "The run never recovers from a defect, and does not log it".
- **With React, the run lives as long as `Host`'s effect.** An unmount, or `<Activity>` hiding it, ends the run, and the
  next effect starts the program again from `init`, as does an edit that Fast Refresh draws by remounting `Host`, or a
  new `key`, which starts it with the props of that render. To wait for the run to end, keep the fiber `fork` returns
  (`Host`'s doc comment). For a state that outlives a component, start the program yourself and draw it with `Draw`.
  A new state is drawn at once, in a transition too: a slow part of the view reads `useDeferredValue`. `hydrateRoot`
  keeps what `Host` drew on a server, where the client makes the same first model. A run that dies is thrown to the
  nearest error boundary, or, once `Host` can no longer throw it, as it unmounts, given to `reportError` where there
  is one. The application's components may keep state of their own. The guide, "Writing a bridge", "With the bridge
  to React, the run lives as long as the effect that starts it", and the rules after it. The guide, "View", "Each
  bridge says what it draws beside the model".
- **snabbdom never removes a prop.** A view of the bridge to snabbdom gives a prop it changes in every state,
  `disabled: false` too. The guide, "Writing a bridge", "snabbdom never removes a prop".

## Rules that a test checks

The run does not check these. A test does, with the tool named.

- **The model holds what `update` accepts, all of it, each control it holds does something, and acts once when sent
  twice**: `dispatchViolations`, with `candidates`. The test marks a message meant to act twice `repeatable`, one held
  on purpose though it does nothing `inert`, and a candidate left out on purpose `withheld`. The guide, "Testing tools",
  "dispatchViolations".
- **A view sends what its model holds**: your renderer's tools, as `messagesSentBy` for snabbdom, or for React the view
  drawn by its renderer's testing library with a dispatch that records, compared with what the test's reader returns.
  The guide, "Testing", "The view".
- **A message held without its value is filled by the reader too**: with a text other than the one the model shows,
  and with values that fast-check draws. The guide, "Testing", "The reader".
- **A rejection is asserted as `reject` itself**, with `toBe(reject)`, never as "the state did not change". The guide,
  "Testing", "How a program is tested".
- **A defect is checked apart**: `expect(() => update(message)(state)).toThrow(InvariantDefect)`. The guide,
  "Testing", "How a program is tested".
- **That the model is data** is checked on two equal states built apart, never on one state used twice. The guide,
  "Testing", "The model of any state".
- **A rejected message fails the test where the test decides when it arrives.** In `applyAll`, `simulate` and
  `rehearse`, a rejected message that the test sends, or that the view sends through the test, fails the test. What
  arrives by itself is ignored, and listed in `ignored`. In `drive`, time is real, and every rejection is ignored.
  Assert `ignored` where dropping a message would be a bug. The guide, "Testing tools", "When a rejected message fails
  the test".

A program run under its renderer in a DOM: snabbdom reads `window` as it loads, so a test file that imports it first
loads a file that sets `window` to `undefined`, as [`bridges/snabbdom-preload.ts`](../../bridges/snabbdom-preload.ts)
does. The guide, "Testing", "The view".

## What the compiler refuses

A break of these does not compile, so they need no remembering. A program names its types, then is made, and a type it
does not name is one it does not have. An execution cannot fail: an expected failure becomes a message. A subscription
is made from its key alone. A child answers an external message in `external`, in every state, never with `reject`. A
parent is given no child's state: it reads what a child declares as its `output`, in its `update`, `external`,
`onEvent`, `makeModel`, `output` and `subscriptions`, and the child's model in `makeModel` alone. The doc comments of
`program`, `Program`, `child` and `childById` say what else the compiler refuses. The guide, "Anatomy of a program",
"Its types are named first, then it is made". The guide, "Commands", "An execution cannot fail". The guide, "Events
and external messages", "A child answers its external messages in every state".

## Signs that the design went wrong

Each sign goes against the rule or the advice named after it.

- A view that takes more than its model and its dispatch. The guide, "View", "In short".
- A view or a `makeModel` that reads the clock, in place of a `now` that a subscription keeps in the state. The guide,
  "Structuring a program", "State and messages".
- A boolean such as `isSaving` in the state. The guide, "Structuring a program", "State and messages".
- A condition on data in a view, such as `items.length === 0`. The guide, "Structuring a program", "Model and view".
- A variable outside the state that the screen depends on. The guide, "View", "What the program draws comes from its
  model".
- A message built in a view. The guide, "Model", "Messages live in the model".
- An application in React that learns what the program does through `onApplied`, in place of a command whose service
  it gives in `fork`. The guide, "Coming from Elm or React".
- `Message` exported as a value, whose constructors a view could call. The guide, "Model", "Advice".
- A message rejected by its value. The guide, "Structuring a program", "Model and view".
- `defect` on a message of the view. The guide, "Rejections and defects", "What the view draws never rules a message
  out".
- A copy in the parent's state of what holds in a child. The guide, "Events and external messages", "Read a condition
  of a child, do not copy it".
- The `.state` of a step taken by hand: it drops that step's commands, its events and what it tells. Combine steps with
  `andThen`. The guide, "Events and external messages", "Combining steps".
- A parent's function written apart from `make` that spells out by hand what it reads of its children, or what it
  tells them, in place of `OutputsOf` and `TellOf`. The guide, "Structuring a program", "Splitting a program".
- An `output` that gives a child's text for its parent to parse. The guide, "Structuring a program", "A value that the
  user writes belongs to the program whose rules use it".
- An attempt to cancel a command. The guide, "Commands", "Commands cannot be cancelled".
- A `start` whose `run` is never run, outside a server. The guide, "Running", "A program is started, then run".
- A `main` that runs the program and does not report its failure. The guide, "Running", "When a defect happens".

At such a sign, stop, and go back to the table of "What kind of thing is it". Do not add a state outside the program,
or a parameter of a view, to make the design work.
