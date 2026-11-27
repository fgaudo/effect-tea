---
name: effect-tea
description: How to write, compose, run and test programs with @fgaudo/effect-tea, the Elm architecture on Effect v4, from the guide, the tutorial and the examples of the version installed. Use when code imports @fgaudo/effect-tea or @fgaudo/effect-tea/testing, or when a program, a view, a bridge to a renderer, or the tests of a program are to be written with it.
---

# @fgaudo/effect-tea

This package holds its documentation, at the version installed. Read it here. The site and the repository show other
versions. The paths below are relative to this file.

This file is an index of the guide. It states no rule: it names each one by its title, under the page and the section
that hold it, in the order of the page. A rule is the paragraph or the item that its title starts. Read it on its page
before you rely on it.

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
- **The bridges**, entries of the package. The library draws nothing: a bridge connects it to a renderer, which is
  installed beside the package, in the range that [`package.json`](../../package.json) gives.
  - `@fgaudo/effect-tea/snabbdom` ([`bridges/snabbdom.ts`](../../bridges/snabbdom.ts)), with `drawInto`, and
    `messagesSentBy` in `@fgaudo/effect-tea/snabbdom/testing`.
  - `@fgaudo/effect-tea/react` ([`bridges/react.ts`](../../bridges/react.ts)), with `Host`, which starts a program and
    runs it while it is mounted, and `Draw`, which draws a program that you start yourself, with React DOM or with
    React Native.
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

Before a design, read the table of what kind of thing each part of a program is. The guide, "Structuring a program",
"What kind of thing is it". Where a design needs a state outside the program, or a parameter of a view, to work, go
back to that table.

## The rules, page by page

What is left to you comes first: no type refuses a break of it, and most often the run goes on, so check each one by
reading the code. What the compiler refuses is in the doc comments of `program`, `Program`, `child`, `childWhen` and
`childById`. Advice binds nothing: each piece gives its reason, and the case where it does not hold.

### [Guarantees](../../site/guide/guarantees.md), "What is left to you"

- Whoever starts a program runs it
- Commands run to their end, or to the end of the run
- Nothing is bounded, and nothing times out
- The program runs on the stack of whoever sends the message
- A subscription that sends faster than the screen refreshes holds the run back
- The model holds what `update` accepts, all of it but what it withholds on purpose, and no control that does
  nothing but what it holds on purpose
- A view sends only what its model holds
- The advice of structuring a program
- Flags, and what `key` gives, made of values that `Equal` compares by value
- A parent starts elsewhere from a state that it made
- What must stay private is in a service, not in a key
- `update`, `external`, `makeModel`, `output` and `subscriptions` are pure, and no value is ever mutated
- A function of the program never interrupts the fiber it runs in

### [Guarantees](../../site/guide/guarantees.md), "What you can rely on"

- One message at a time, in the order they were sent
- Outdated clicks are harmless
- A parent's children are those its own state lists
- An answer reaches the instance that asked for it, or is rejected
- A child was last told what its parent's state gives
- Subscriptions follow their keys
- Nothing outlives what acquired it
- Logs do not pile up in a span
- Nothing ends in silence
- A model is made only when it is read

### [Anatomy of a program](../../site/guide/anatomy-of-a-program.md), "Rules"

- Its types are named first, then it is made
- Its type lists the types it is made of
- The view is not part of it
- A program that cannot start the same way every time declares `flags`
- The types need `strict`

### [Update](../../site/guide/update.md), "Rules"

- Keep it pure
- It may be called at any time
- Never mutate the state
- A message that cannot arrive is a defect

### [Model](../../site/guide/model.md), "Rules"

- Messages live in the model
- Pick the case from the state, as `update` reads it
- A model is data

### [Model](../../site/guide/model.md), "Advice"

- Give the model a case for each state that the view tells apart
- Export `Message` as a type only

### [View](../../site/guide/view.md), "Rules"

- `dispatch` is a plain function
- Sending applies the message
- What the program draws comes from its model
- Each bridge says what it draws beside the model

### [Commands](../../site/guide/commands.md), "Rules"

- An execution cannot fail
- An expected failure becomes a message, as the success does
- A command carries everything it needs
- Commands run concurrently
- What must outlive a command belongs in a service, or in a subscription
- Commands cannot be cancelled
- Work that should stop is a subscription

### [Commands](../../site/guide/commands.md), "Advice"

- Retry within the execution

### [Subscriptions](../../site/guide/subscriptions.md), "Rules"

- Keys are compared by value, after every change of state
- A subscription is made from its key alone
- A parent lists its own keys from its own state and its children's outputs
- A subscription never ends in silence
- Work that should stop is a subscription

### [Subscriptions](../../site/guide/subscriptions.md), "Advice"

- Split in three a connection that stays open while a value it uses changes

### [Rejections and defects](../../site/guide/rejections-and-defects.md), "Rules"

- `defect` makes a bug loud
- What the view draws never rules a message out
- Nothing is cancelled when the state moves on
- What "cannot arrive" rests on
- An event keeps the timing of its cause

### [Composition](../../site/guide/composition.md), "Rules"

- When a child is there
  - `child(program)` is always there
  - `childWhen(program, { there })`
  - A program that has flags starts from them
  - `key`
  - A child that the state no longer lists is dropped
  - Other flags, or another value of `key`, are another child
  - `listening`
  - `tell`
- How a parent and its children start
  - A parent's `init` is a step of its own state
  - A step that lists a child anew starts it
  - A child is given what it starts from by its flags
  - A parent with flags of its own
  - The order of the starts
- The parent's own pieces
  - `makeModel: (state, children) => …`
  - `update: (message, children) => (state) => …`
- What the library derives
  - The parent's state
  - Each start of a child is an instance
  - The parent's messages
  - A child's commands, and the keys of its subscriptions, are wrapped as its messages are
  - A child's model is kept
- Children's views
  - A child's view gets a dispatch of its own
  - That dispatch is the same function in every draw
  - A dispatch may name the instance of its child
- Children by id
  - `ids` lists the ids of the children that are there
  - A row is read by its id
  - Ids are compared by value
  - Ids that come back

### [Composition](../../site/guide/composition.md), "Advice"

- Where the screen may show an older draw, give a child's view the number of its instance, in its dispatch and as
  its key
- Read a child declared with `childWhen` as one `Option`

### [Events and external messages](../../site/guide/events-and-external-messages.md), "Rules"

- Events
  - A child raises an event
  - The parent handles an event in `onEvent`
  - An event to pass on
- External messages
  - A child answers its external messages in every state
  - A parent sends an external message
  - What a step tells arrives after the step
  - A parent passes an external message on
- Outputs
  - A child may declare an `output`
  - A parent reads it as `children.Row.output(id)`
- Combining steps
  - Do not take a step's `.state` by hand to make the next step

### [Events and external messages](../../site/guide/events-and-external-messages.md), "Advice"

- Read a condition of a child, do not copy it
- A child that must wait for its parent

### [What an element gives](../../site/guide/what-an-element-gives.md), "Rules"

- What an element gives is a message of the program
- The view fills the value as the element gives it
- A message that an element fills is a plain tagged one
- A lock is a case of the state
- The element on screen
  - The view draws an element that holds a value as a controlled element
- What an element reports
  - A value that the program keeps is a message
  - What is there whatever is drawn is a subscription
- In each row

### [What an element gives](../../site/guide/what-an-element-gives.md), "Advice"

- Where an element reports a value at each of its events, send it once, as the events end
- Hold a value that an element reports in the model only where the view draws by it
- Keep what the user types in the case of the state where it can be typed
- Store the text as it is typed, and say what it means where the program reads it

### [Structuring a program](../../site/guide/structuring-a-program.md), "Advice"

- State and messages
  - Decide a condition once, from the state
  - Let a message sent twice from one model act once
  - Prefer one union for each concern to flags that combine
  - Compute what follows from the state, and do not keep it
- Model and view
  - Do not reject a message by its value
  - Let the view draw, and `makeModel` decide
  - Leave to the platform what it keeps by itself
  - Move by equal steps an animation that the program decides by
- Splitting a program
  - Split by concern, not by kind
  - Split the parts that read each other into modules of one program
  - Keep in the parent what spans the children
  - Give a child what it needs, not its parent's state
  - Make one child of children that read each other's state
  - Not every part is a child
  - A value that the user writes belongs to the program whose rules use it

### [Running](../../site/guide/running.md), "Rules"

- A program is started, then run
- The renderer gets an `App`
- A renderer reads the model when it draws
- A program starts elsewhere from another first step
- What is done does not pile up
- Options
  - `flags`
  - `onApplied`
  - `onIgnored`
  - The run calls `onApplied` and `onIgnored` as it calls `update`
- When a defect happens
  - The run never recovers from a defect, and does not log it
  - The app around the run chooses what leaves the device
- What the run still does after a defect
- How the run ends
  - Plain code stops a run, and waits for it
- The defects in the cause

### [Running](../../site/guide/running.md), "Advice"

- Give slow work to a queue
- Work that must wait goes to the effects of the program

### [Testing](../../site/guide/testing.md), "Rules"

- How a program is tested
- The model of any state
  - That the model is data
- The number of an instance
- The reader
  - The reader is the test's own
  - A message held without its value
  - Children
  - The reader is complete only as far as the candidates go
- The view
  - That the view draws what its model holds
  - A program run under its renderer, in a DOM

### [Testing](../../site/guide/testing.md), "Advice"

- Keep the candidates in a record that the compiler checks

### [Testing tools](../../site/guide/testing-tools.md), "Rules"

- When a rejected message fails the test
- dispatchViolations
  - `candidates`
  - `repeatable`
  - `inert`
  - `withheld`
- simulate
- rehearse
  - A command left at the end fails the test
  - A subscription is heard one way
- drive
  - Time is real
  - The state is ahead of its effects

### [Testing tools](../../site/guide/testing-tools.md), "Advice"

- Hold a command of `drive` with a service of the test's
- Under Effect's `TestClock`, move the clock while `hearNext` waits

### [Writing a bridge](../../site/guide/writing-a-bridge.md), "Rules"

- What a bridge does
  - It draws the model of the current state, and says what else it draws
  - A handler calls `dispatch` itself
  - A controlled element is drawn with the value its model holds
  - After each draw, the element shows the value of its model
  - Each new state is drawn before the browser handles the next event
  - The renderer keeps an element drawn in the same place from one draw to the next
- The package's bridges
  - snabbdom never removes a prop
  - With the bridge to React, the run lives as long as the effect that starts it
  - With the bridge to React, a run that dies is thrown to the nearest error boundary
  - With the bridge to React, `Host` and `Draw` draw the first model on a server
  - With the bridge to React, a new state is drawn at once, in a transition too

### [Writing a bridge](../../site/guide/writing-a-bridge.md), "Advice"

- On Android, start a program that must outlive a change of configuration yourself
