# @fgaudo/effect-tea

[![CI](https://github.com/fgaudo/effect-tea/actions/workflows/ci.yml/badge.svg)](https://github.com/fgaudo/effect-tea/actions/workflows/ci.yml)

The Elm architecture on [Effect](https://effect.website) v4, for any renderer.

Your interface is one pure program. Its state, the messages that change it and the effects it asks for are all data.
So most of its tests are plain function calls: no runtime, no DOM, nothing to mock.

**[Try the timer](https://fgaudo.github.io/effect-tea/examples/timer/)** in the browser,
**[build it](https://fgaudo.github.io/effect-tea/documents/Tutorial.html)** in five short steps, or read the
**[documentation](https://fgaudo.github.io/effect-tea/)**: the guide, the API in full and every example running.

## A taste

A form saves a name. The user taps "Save" twice, before the screen shows the first tap: a slow frame or a frozen app is
enough. Here is a test that the second tap does nothing, adapted from the tests of [`examples/form`](examples/form):

```ts
test("a second tap while saving does nothing", () => {
  const { state, commands } = applyAll(update)([{ _tag: "SaveClicked" }], { ...empty, name: " Ada " })
  expect(commands).toEqual([Command.Save({ name: "Ada" })])
  expect(update({ _tag: "SaveClicked" })(state)).toBe(reject)
})
```

Nothing ran, and nothing was mocked. The first tap moved the form to "saving". It also decided a command, which is a
value the test compares. Once the screen shows the saving state, the model holds no save to send. But a second tap can
still arrive before that. The second tap makes no sense while the form is saving. So `update` rejects it, and the
running program ignores it. The rule lives in `update` alone: the view has no `isSaving` flag to remember.

## Why

The Elm architecture keeps the state in one place and changes it only through messages. This library adds:

- **Stale taps and late answers do no harm.** `update` may **reject** a message that makes no sense in the current
  state, and the run ignores it. Such a message is a second tap from a screen the state has moved past, or an answer
  that arrives when nothing waits for it any longer.
- **Effects are data you can assert.** Elm's `Cmd` is opaque: a test cannot see what `update` decided. Here a command
  is a value of your own type. `runCommand` turns it into an Effect, and a test asserts it by value.
- **A test checks the screen against the rules.** For any state a test generates, the testing tools check two things:
  that the model holds only what `update` accepts, and that it leaves out only what the test says it withholds. So no
  button does nothing, and none is missing.
- **A bug is loud.** A message that cannot arrive is a bug. `update` throws `defect` on it, and the run dies instead of
  hiding the bug. The app around the run decides what the user sees next: a crash screen, or the program started
  again (see [running](https://fgaudo.github.io/effect-tea/documents/Guide.Running.html)).
- **Composition is declared, not wired.** A parent says where each child lives in its state, and the library routes
  the children's messages, commands, subscriptions and models.
- **Any renderer.** The library draws nothing, and a view is a function of its model. The examples draw the same
  programs with [snabbdom](https://github.com/snabbdom/snabbdom) and with React.

## How it works

You keep one **state**. A pure **`update`** changes it in response to messages. Effects never run inside `update`:
they are described as data (**commands**), or listened to (**subscriptions**). The view draws a **model**, which is
made from the state, and sends the messages the model holds. The guide draws the loop in
[anatomy of a program](https://fgaudo.github.io/effect-tea/documents/Guide.Anatomy_of_a_program.html).

Coming from Elm? Elm's `Model` is the **state** here. The **model** is what the view reads: what to show, and the
message each control sends. The guide maps the rest, for Elm and for React, in
[coming from Elm or React](https://fgaudo.github.io/effect-tea/documents/Guide.Coming_from_Elm_or_React.html),
and lists its words in a [glossary](https://fgaudo.github.io/effect-tea/documents/Guide.Glossary.html).

## Is it for you?

It fits when:

- your application is written with Effect, and you want its interface held to the same standard;
- you like the Elm architecture, and miss it in TypeScript;
- the rules of a screen are worth testing: what can be tapped when, and what happens to an answer that comes late.

It probably does not when:

- you want state in your components. Here the state is the program's, and a view is a plain function of its model
  ([view](https://fgaudo.github.io/effect-tea/documents/Guide.View.html)). What the platform keeps by itself, such as
  a hover, the focus or an animation, is fine;
- you want a renderer integration from npm. The bridges to snabbdom and to React are files of `bridges/`, about 150
  lines each, to copy and own
  ([writing a bridge](https://fgaudo.github.io/effect-tea/documents/Guide.Writing_a_bridge.html) explains one);
- you are not on Effect 4.

It is at version 0.x, so the API still changes. [`CHANGELOG.md`](CHANGELOG.md) says how to upgrade over each breaking
change.

## Installation

```sh
bun add @fgaudo/effect-tea effect
```

```sh
npm install @fgaudo/effect-tea effect
```

`effect` is a peer dependency: 4.1.4, or a newer 4.1.x. The package ships JavaScript with declarations. Use
`moduleResolution` `nodenext` or `bundler`, and TypeScript 5.9 or newer, as Effect 4 does. Keep the compiler option
`strict` on: the library's types are checked under it alone. Under Bun, the `bun` export condition loads the TypeScript
sources instead.

## Quick start

A counter that cannot go below zero, in one file you can run as it is. There is no screen yet: the "renderer" here
only logs each frame, and clicks "increment" until the count reaches 3.

```ts
import { program, reject, run, type Update } from "@fgaudo/effect-tea"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

type State = Readonly<{ count: number }>

type Message = "Increment" | "Decrement"

const update: Update<State, Message> = (message) => ({ count }) => {
  if (message === "Increment") return { state: { count: count + 1 } }
  if (count === 0) return reject // nothing to decrement
  return { state: { count: count - 1 } }
}

// At zero there is no `decrement`: the model's shape says so.
type Model =
  | Readonly<{ _tag: "AtZero"; count: number; increment: Message }>
  | Readonly<{
    _tag: "Counting"
    count: number
    increment: Message
    decrement: Message
  }>

const counter = program<{ state: State; model: Model; message: Message }>().make({
  init: { state: { count: 0 } },
  update,
  makeModel: ({ count }) =>
    count > 0
      ? {
        _tag: "Counting",
        count,
        increment: "Increment",
        decrement: "Decrement"
      }
      : { _tag: "AtZero", count, increment: "Increment" }
})

const main = run(counter, (frames) =>
  frames.pipe(
    Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
      yield* Effect.log(model.count)
      if (model.count < 3) yield* dispatch(model.increment)
    })),
    Stream.take(4),
    Stream.runDrain
  ))

Effect.runFork(main) // logs 0, 1, 2, 3
```

### With a view

The same program on a screen, in React ([`examples/counter`](examples/counter)). The view gets the model,
draws it, and sends the messages the model holds. It decides nothing: at zero the model has no `decrement`, so there
is nothing to send.

```tsx
const view: View<Model, Message> = (model, dispatch) => (
  <main className="counter">
    {model._tag === "Counting"
      ? <button type="button" onClick={onClick(model.decrement, dispatch)}>−</button>
      : <button type="button" disabled>−</button>}
    <output>{model.count}</output>
    <button type="button" onClick={onClick(model.increment, dispatch)}>+</button>
  </main>
)

Effect.runFork(run(counter, renderInto(root, view)))
```

`View`, `onClick` and `renderInto` are the examples' bridge to React,
[`bridges/react.ts`](bridges/react.ts). [`examples/counter`](examples/counter) draws the same program
with snabbdom.

### With its tests

The tests need neither the view nor a runtime ([`examples/counter`](examples/counter)). The second one checks, for
any count, that every message the model holds is accepted, and that nothing `update` accepts is missing from it:

```ts
test("rejects going below zero", () => {
  expect(update("Decrement")({ count: 0 })).toBe(reject)
})

// What the model holds: the messages of its controls, a case at a time.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]

test("the model holds what update accepts, all of it", () => {
  fc.assert(fc.property(fc.nat(1_000), (count) => {
    const state = { count }
    expect(dispatchViolations(update, {
      state,
      held: messagesOf(counter.makeModel(state)),
      candidates: ["Increment", "Decrement"],
      repeatable: () => true
    })).toEqual([])
  }))
})
```

What each piece is, and what else a program may have, is in the
[Guide](https://fgaudo.github.io/effect-tea/documents/Guide.html). The
[tutorial](https://fgaudo.github.io/effect-tea/documents/Tutorial.html)
builds a larger application the same way, a step at a time.

## Examples

[`examples/`](examples) holds complete programs, each with its tests. Each is drawn with
[snabbdom](https://github.com/snabbdom/snabbdom), and two of them with React too, in the same run. Try one in the
browser, or run it: `bun run build`, then `bun examples/<name>/index.html`. The bridges they are drawn with are in
[`bridges/`](bridges), for you to copy into your project. [`examples/README.md`](examples/README.md)
says where to start.

| Example                           | What it is                   | What it shows                                                                                                                                                                                                                                                                   | Try it                                                          |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`counter`](examples/counter)     | the quick start, with a view | The smallest program, tested with `applyAll`, `dispatchViolations` and `drive`. One run, drawn by snabbdom and by React, one under the other. A click in either is drawn by both                                                                                                | [live](https://fgaudo.github.io/effect-tea/examples/counter/)   |
| [`form`](examples/form)           | a form that saves a name     | A text input declared in `make`. A save through a service, its failure as a message, and a saving state that only the save's answer leaves. Tested with `rehearse`, and drawn by both renderers: in React, the input is `Shows`, an uncontrolled `<input>` with no `value` prop | [live](https://fgaudo.github.io/effect-tea/examples/form/)      |
| [`volume`](examples/volume)       | two sliders, side by side    | Sliders the program draws itself, because their bounds narrow. A drag is a subscription keyed by the slider. Tested with `drive`, and with `dispatchViolations` given a key's messages                                                                                          | [live](https://fgaudo.github.io/effect-tea/examples/volume/)    |
| [`bounce`](examples/bounce)       | a ball that bounces to rest  | An animation moved by equal steps of the state. A subscription sends a step for each `dt` of the screen's frames, then the part of the next step, which the state keeps to draw between two steps. Tested with `applyAll`, `dispatchViolations` and `drive`                     | [live](https://fgaudo.github.io/effect-tea/examples/bounce/)    |
| [`pages`](examples/pages)         | a clock and an About page    | Two pages under a parent, with `program`, optics, `forwardTo`, events and `subscribed`. A page started from flags. Tested with `simulate`                                                                                                                                       | [live](https://fgaudo.github.io/effect-tea/examples/pages/)     |
| [`list`](examples/list)           | stopwatches by id            | Children by id with `childById`, and `forEach`. A subscription for each stopwatch that runs. A test with a `TestClock`                                                                                                                                                          | [live](https://fgaudo.github.io/effect-tea/examples/list/)      |
| [`stocktake`](examples/stocktake) | the count of an aisle        | Inputs by id with `inputById`, and an input that is not always there. A scanner as a subscription whose end is a message. Tested with `simulate`, `rehearse` and `drive`                                                                                                        | [live](https://fgaudo.github.io/effect-tea/examples/stocktake/) |
| [`timer`](examples/timer)         | the tutorial's application   | Named timers by id. Each name is an input, each timer ticks only while it runs, and the bell is a command. Tested with `rehearse`: `hear`, and a write with `send`                                                                                                              | [live](https://fgaudo.github.io/effect-tea/examples/timer/)     |

## Documentation

- The [tutorial](https://fgaudo.github.io/effect-tea/documents/Tutorial.html) builds an application step by step.
  Start here.
- The [Guide](https://fgaudo.github.io/effect-tea/documents/Guide.html) says what the library does and promises, one
  concept a page:
  - the pieces of a program:
    [anatomy](https://fgaudo.github.io/effect-tea/documents/Guide.Anatomy_of_a_program.html),
    [update](https://fgaudo.github.io/effect-tea/documents/Guide.Update.html),
    [model](https://fgaudo.github.io/effect-tea/documents/Guide.Model.html),
    [view](https://fgaudo.github.io/effect-tea/documents/Guide.View.html);
  - its effects:
    [commands](https://fgaudo.github.io/effect-tea/documents/Guide.Commands.html),
    [subscriptions](https://fgaudo.github.io/effect-tea/documents/Guide.Subscriptions.html),
    [rejections and defects](https://fgaudo.github.io/effect-tea/documents/Guide.Rejections_and_defects.html);
  - a larger program:
    [composition](https://fgaudo.github.io/effect-tea/documents/Guide.Composition.html),
    [events and external messages](https://fgaudo.github.io/effect-tea/documents/Guide.Events_and_external_messages.html),
    [structuring](https://fgaudo.github.io/effect-tea/documents/Guide.Structuring_a_program.html),
    [inputs](https://fgaudo.github.io/effect-tea/documents/Guide.Inputs_the_user_types_into.html);
  - running and testing it:
    [running](https://fgaudo.github.io/effect-tea/documents/Guide.Running.html),
    [testing](https://fgaudo.github.io/effect-tea/documents/Guide.Testing.html),
    [testing tools](https://fgaudo.github.io/effect-tea/documents/Guide.Testing_tools.html),
    [guarantees](https://fgaudo.github.io/effect-tea/documents/Guide.Guarantees.html),
    [writing a bridge](https://fgaudo.github.io/effect-tea/documents/Guide.Writing_a_bridge.html);
  - finding your way:
    [coming from Elm or React](https://fgaudo.github.io/effect-tea/documents/Guide.Coming_from_Elm_or_React.html),
    [glossary](https://fgaudo.github.io/effect-tea/documents/Guide.Glossary.html).
- The [API](https://fgaudo.github.io/effect-tea/modules.html) documents each export in full.

## How it is checked

What the library promises about a running program is written down, in the guide's
[guarantees](https://fgaudo.github.io/effect-tea/documents/Guide.Guarantees.html), and checked:

- **Under random histories.** A property test draws clicks, command answers, subscription messages and ends, releases
  and defects, among others, in random orders, and checks the guarantees on each. The guarantees list all that it
  draws. It runs every day in the CI, from a new seed.
- **By mutation.** Each check a guarantee rests on is taken out of the engine, one at a time, and a test must fail
  without it.
- **On two engines.** The tests run on JavaScriptCore, under Bun, and on V8, under Node.
- **As a consumer gets it.** A smoke test checks the packed package as Node and TypeScript consumers get it, and the
  report of the public API is committed, so no export changes unnoticed.

## Related

[effect-tea-persistent](https://fgaudo.github.io/effect-tea-persistent/) brings the same architecture to long-lived
entities on a server, whose state a database keeps. It is experimental, and not published yet.

## Development

- `bun run typecheck`, `bun run lint` and `bun run test` check the package and the examples.
- `bun run build` compiles the package into `dist/`.
- `bun run smoke` checks the packed package as Node and TypeScript consumers get it.
- `bun run api` writes the report of the public API into `api/`, from `dist/`. The report is committed, and the CI
  fails when it differs from the declarations.
- `bun run test:node` runs the library's tests on Node, whose engine is V8. `bun run test` runs them on
  JavaScriptCore.
- `bun run mutations` takes out each check that the engine's invariants rest on, one at a time. It fails when a test
  that must catch the missing check passes.
- `bun run interleavings` runs `src/interleaving.test.ts`, which `bun run test` leaves out. It searches random
  histories from a seed drawn on each run, and the CI runs it every day.
- `bun run comments` checks the doc comments of `src/`, and that each section of the guide that they and the skill
  name exists, once.
- `bun run inference` checks the types of programs written in each way they can be, with each supported TypeScript.
  It runs by hand, after a change of the types of `src/program.ts` or `src/compose.ts`.

Changes are in [`CHANGELOG.md`](CHANGELOG.md). Open problems and possible improvements are in
[`ROADMAP.md`](ROADMAP.md). The rules for contributors and coding agents are in [`AGENTS.md`](AGENTS.md). The
procedures are in [`.agents/skills/`](.agents/skills): changing the API, adding an example, upgrading Effect, releasing,
and building the documentation site.

## License

[MIT](LICENSE) © Francesco Gaudenzi

## For coding agents

The package holds its documentation, at the version installed: the guide, the tutorial and the examples. Read
`skills/effect-tea/SKILL.md` in the package (`node_modules/@fgaudo/effect-tea/skills/effect-tea/SKILL.md`) first: it
says where each thing is. The rules for changing the library itself are in [`AGENTS.md`](AGENTS.md).
