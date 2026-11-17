# @fgaudo/effect-tea

[![CI](https://github.com/fgaudo/effect-tea/actions/workflows/ci.yml/badge.svg)](https://github.com/fgaudo/effect-tea/actions/workflows/ci.yml)

The Elm architecture on [Effect](https://effect.website) v4, for any renderer.

Your interface is one pure program. Its state, the messages that change it and the effects it asks for are all data,
so most of its tests are plain function calls: no runtime, no DOM, nothing to mock.

**[Try the timer](https://fgaudo.github.io/effect-tea/examples/timer/)** in the browser,
**[build it](https://fgaudo.github.io/effect-tea/documents/Tutorial.html)** in five short steps, or read the
**[documentation](https://fgaudo.github.io/effect-tea/)**: the guide, the API in full and every example running.

## A taste

A form saves a name. The user taps "Save" twice before the screen has caught up: a slow frame, a frozen app. This is
the whole test that the second tap does nothing, from the tests of [`examples/form`](examples/form):

```ts
test('a second tap while saving does nothing', () => {
  const { state, commands } = applyAll(update)([{ _tag: 'SaveClicked' }], { ...empty, name: ' Ada ' })
  expect(commands).toEqual([Command.Save({ name: 'Ada' })])
  expect(update({ _tag: 'SaveClicked' })(state)).toBe(reject)
})
```

Nothing ran, and nothing was mocked. The first tap moved the form to "saving" and decided a command, which is a value
the test compares. Once the screen shows that state, its model holds no save to send. Until then a second tap can
still arrive: it makes no sense while saving, so `update` rejects it, and the running program ignores it. The rule
lives in `update` alone: no `isSaving` flag for the view to remember.

## Why

The Elm architecture keeps the state in one place and changes it only through messages. This library adds:

- **Stale taps and late answers do no harm.** `update` may **reject** a message that makes no sense in the current
  state, and the run ignores it: a second tap from a screen the state has moved past, or an answer that arrives once
  nothing waits for it.
- **Effects are data you can assert.** Elm's `Cmd` is opaque: a test cannot see what `update` decided. Here a command
  is a value of your own type, which `runCommand` turns into an Effect, so a test asserts it by value.
- **A test checks the screen against the rules.** For any state a test generates, the testing tools check that the
  model holds only what `update` accepts, and leaves out only what the test says it withholds. No button that does
  nothing, and none missing.
- **A bug is loud.** A message that cannot arrive is a bug. `update` throws `defect` on it, and the run dies instead of
  hiding it. The app, around the run, decides what the user sees next: a crash screen, or the program started again
  (see [running](https://fgaudo.github.io/effect-tea/documents/Guide.Running.html)).
- **Composition is declared, not wired.** A parent says where each child lives in its state, and the library routes
  the children's messages, commands, subscriptions and models.
- **Any renderer.** The library draws nothing, and a view is a function of its model. The examples draw the same
  programs with [snabbdom](https://github.com/snabbdom/snabbdom) and with React.

## How it works

You keep one **state**. A pure **`update`** changes it in response to messages. Effects are described as data
(**commands**) or listened to (**subscriptions**), never run inside `update`. The view draws a **model**, made from
the state, and sends the messages it holds. The guide draws the loop in
[anatomy of a program](https://fgaudo.github.io/effect-tea/documents/Guide.Anatomy_of_a_program.html).

Coming from Elm? Elm's `Model` is the **state** here. The **model** is what the view reads: what to show, and the
message each control sends.

## Is it for you?

It fits when:

- your application is written with Effect, and you want its interface held to the same standard;
- you like the Elm architecture, and miss it in TypeScript;
- the rules of a screen are worth testing: what can be tapped when, and what becomes of an answer that comes late.

It probably does not when:

- you want state in your components. Here the renderer draws frames and keeps no state beside the program's. What the
  platform keeps by itself, such as a hover, the focus or an animation, is fine;
- you want a renderer integration from npm. The bridges to snabbdom and to React are files of the examples, about 150
  lines each, to copy and own
  ([writing a bridge](https://fgaudo.github.io/effect-tea/documents/Guide.Writing_a_bridge.html) reads one);
- you are not on Effect 4.

It is at 0.x: the API still changes, and [`CHANGELOG.md`](CHANGELOG.md) says how to upgrade over each breaking change.

## Installation

```sh
bun add @fgaudo/effect-tea effect
```

```sh
npm install @fgaudo/effect-tea effect
```

`effect` is a peer dependency, 4.1.4 or a newer 4.x. The package ships JavaScript with declarations: use
`moduleResolution` `nodenext` or `bundler`, and TypeScript 5.9 or newer, as Effect 4 does. Under Bun, the `bun`
export condition loads the TypeScript sources instead.

## Quick start

A counter that cannot go below zero, in one file you can run as it is. There is no screen yet: the "renderer" here
only logs each frame, and clicks "increment" until the count reaches 3.

```ts
import { type Program, reject, run, type Update } from '@fgaudo/effect-tea'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

type State = Readonly<{ count: number }>

type Message = 'Increment' | 'Decrement'

const update: Update<State, Message> = (message) => ({ count }) => {
  if (message === 'Increment') return { state: { count: count + 1 } }
  if (count === 0) return reject // nothing to decrement
  return { state: { count: count - 1 } }
}

// At zero there is no `decrement`: the model's shape says so.
type Model =
  | Readonly<{ _tag: 'AtZero'; count: number; increment: Message }>
  | Readonly<{
    _tag: 'Counting'
    count: number
    increment: Message
    decrement: Message
  }>

const counter: Program<{ state: State; model: Model; message: Message }> = {
  init: { state: { count: 0 } },
  update,
  makeModel: ({ count }) =>
    count > 0
      ? {
        _tag: 'Counting',
        count,
        increment: 'Increment',
        decrement: 'Decrement',
      }
      : { _tag: 'AtZero', count, increment: 'Increment' },
}

const main = run(counter, (frames) =>
  frames.pipe(
    Stream.tap(Effect.fnUntraced(function*({ model, dispatch }) {
      yield* Effect.log(model.count)
      if (model.count < 3) yield* dispatch(model.increment)
    })),
    Stream.take(4),
    Stream.runDrain,
  ))

Effect.runFork(main) // logs 0, 1, 2, 3
```

### With a view

The same program on a screen, in React ([`examples/counter-react`](examples/counter-react)). The view gets the model,
draws it, and sends the messages the model holds. It decides nothing: at zero the model has no `decrement`, so there
is nothing to send.

```tsx
const view: View<Model, Message> = (model, dispatch) => (
  <main className="counter">
    {model._tag === 'Counting'
      ? <button type="button" onClick={onClick(model.decrement, dispatch)}>−</button>
      : <button type="button" disabled>−</button>}
    <output>{model.count}</output>
    <button type="button" onClick={onClick(model.increment, dispatch)}>+</button>
  </main>
)

Effect.runFork(run(counter, renderInto(root, view)))
```

`View`, `onClick` and `renderInto` are the examples' bridge to React, [`examples/react.ts`](examples/react.ts).
[`examples/counter`](examples/counter) draws the same program with snabbdom.

### With its tests

The tests need neither the view nor a runtime ([`examples/counter`](examples/counter)). The second one checks, for
any count, that every message the model holds is accepted, and that nothing `update` accepts is missing from it:

```ts
test('rejects going below zero', () => {
  expect(update('Decrement')({ count: 0 })).toBe(reject)
})

// What the model holds: the messages of its controls, a case at a time.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === 'Counting' ? [model.decrement, model.increment] : [model.increment]

test('the model holds what update accepts, all of it', () => {
  const violations = dispatchViolations(update, { repeatable: () => true })
  fc.assert(fc.property(fc.nat(1_000), (count) => {
    const held = messagesOf(counter.makeModel({ count }))
    expect(violations({ count }, held, ['Increment', 'Decrement'])).toEqual([])
  }))
})
```

What each piece is, and what else a program may have, is in the
[Guide](https://fgaudo.github.io/effect-tea/documents/Guide.html). The
[tutorial](https://fgaudo.github.io/effect-tea/documents/Tutorial.html)
builds a larger application the same way, a step at a time.

## Examples

[`examples/`](examples) holds complete programs, each with its tests, drawn with
[snabbdom](https://github.com/snabbdom/snabbdom), and two of them with React too. Try one in the browser, or run it
with `bun run build`, then `bun examples/<name>/index.html`.

| Example                                   | What it is                   | What it shows                                                                                                                                                        | Try it                                                              |
| ----------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`counter`](examples/counter)             | the quick start, with a view | The smallest program and its tests: `applyAll`, `dispatchViolations`, `drive`                                                                                        | [live](https://fgaudo.github.io/effect-tea/examples/counter/)       |
| [`counter-react`](examples/counter-react) | the same program, in React   | Swapping the renderer changes the view, `main.ts` and the bridge. The program stays as it is                                                                         | [live](https://fgaudo.github.io/effect-tea/examples/counter-react/) |
| [`form`](examples/form)                   | a form that saves a name     | A text input declared in `compose`, a save through a service, its failure as a message, and a saving state that only the save's answer leaves; `rehearse`            | [live](https://fgaudo.github.io/effect-tea/examples/form/)          |
| [`form-react`](examples/form-react)       | the form, in React           | The input drawn by `Shows` as an uncontrolled `<input>`: the bridge keeps it in step with the program, with no `value` prop                                          | [live](https://fgaudo.github.io/effect-tea/examples/form-react/)    |
| [`volume`](examples/volume)               | two sliders, side by side    | Sliders the program draws itself, because their bounds narrow; a drag is a subscription keyed by the slider. A key's messages given to `dispatchViolations`; `drive` | [live](https://fgaudo.github.io/effect-tea/examples/volume/)        |
| [`pages`](examples/pages)                 | a clock and an About page    | Two pages under a parent: `composition`, optics, `forwardTo`, events, `subscribed`, and a page started from flags; `simulate`                                        | [live](https://fgaudo.github.io/effect-tea/examples/pages/)         |
| [`list`](examples/list)                   | stopwatches by id            | Children by id with `childById`, a subscription for each one that runs, and `forEach`; a test with a `TestClock`                                                     | [live](https://fgaudo.github.io/effect-tea/examples/list/)          |
| [`stocktake`](examples/stocktake)         | the count of an aisle        | Inputs by id with `inputById`, an input that is not always there, and a scanner as a subscription whose end is a message; `simulate`, `rehearse`, `drive`            | [live](https://fgaudo.github.io/effect-tea/examples/stocktake/)     |
| [`timer`](examples/timer)                 | the tutorial's application   | Named timers by id: each name an input, each timer ticking only while it runs, and a bell as a command; `rehearse` with `hear`, and a write with `send`              | [live](https://fgaudo.github.io/effect-tea/examples/timer/)         |

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
    [structuring](https://fgaudo.github.io/effect-tea/documents/Guide.Structuring_a_program.html),
    [inputs](https://fgaudo.github.io/effect-tea/documents/Guide.Inputs_the_user_types_into.html);
  - running and testing it:
    [running](https://fgaudo.github.io/effect-tea/documents/Guide.Running.html),
    [testing](https://fgaudo.github.io/effect-tea/documents/Guide.Testing.html),
    [guarantees](https://fgaudo.github.io/effect-tea/documents/Guide.Guarantees.html),
    [writing a bridge](https://fgaudo.github.io/effect-tea/documents/Guide.Writing_a_bridge.html).
- The [API](https://fgaudo.github.io/effect-tea/modules.html) documents each export in full.

## How it is checked

What the library promises about a running program is written down, in the guide's
[guarantees](https://fgaudo.github.io/effect-tea/documents/Guide.Guarantees.html), and checked:

- **Under random histories.** A property test draws clicks, command answers, subscription messages and ends, releases
  and defects, in random orders, and checks the guarantees on each. It runs every day in the CI, from a new seed.
- **By mutation.** Each check a guarantee rests on is taken out of the engine, one at a time, and a test must fail
  without it.
- **On two engines.** The tests run on JavaScriptCore, under Bun, and on V8, under Node.
- **As a consumer gets it.** A smoke test checks the packed package as Node and TypeScript consumers get it, and the
  report of the public API is committed, so no export changes unnoticed.

## Related

[effect-tea-persistent](https://fgaudo.github.io/effect-tea-persistent/) brings the same architecture to long-lived
entities on a server, whose state a database keeps. It is experimental, and not published yet.

## Development

`bun run typecheck`, `bun run lint` and `bun run test` check the package and the examples; `bun run build`
compiles it into `dist/`, and `bun run smoke` checks the packed package as Node and TypeScript consumers get it.
`bun run api` writes the report of the public API into `api/`, from `dist/`: it is committed, and the CI fails when
it differs from the declarations.
`bun run test:node` runs the library's tests on Node, whose engine is V8, where `bun run test` runs them on
JavaScriptCore.
`bun run mutations` takes out each check the engine's invariants rest on, one at a time, and fails when a test that
must catch it passes. `bun run interleavings` runs `src/interleaving.test.ts`, which `bun run test` leaves out: it
searches random histories from a seed drawn on each run, and the CI runs it every day.
Changes are in [`CHANGELOG.md`](CHANGELOG.md), open problems and possible improvements in
[`ROADMAP.md`](ROADMAP.md). The rules for contributors and coding agents are in
[`AGENTS.md`](AGENTS.md), and the procedures (changing the API, adding an example, upgrading Effect, releasing and
building the documentation site) in [`.agents/skills/`](.agents/skills).

## License

[MIT](LICENSE) © Francesco Gaudenzi
