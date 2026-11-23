---
title: Testing
---

# Testing

## In short

This page shows you how to test a program, step by step, and which tool to use at each step. Most of a program is
pure, so most tests need no runtime:

- `applyAll` and `dispatchViolations` test `update` and the model as plain functions.
- `placeViolations` tests the place of an input as plain functions.
- `simulate` and `rehearse` play a flow without running the program.
- `drive` plays a scenario on the running program.

The table under [the tools](#the-tools) says which tool answers which question. [Testing tools](./testing-tools.md)
says what each tool does.

## How a program is tested

The tests of a program follow its shape, in four steps:

1. **Generate its states** with a property-testing library (fast-check in the examples). Use one arbitrary. It
   produces only valid states, and every case of each state machine is among them.
2. **Check, for any of them:**
   - that `update` answers every message with a step or `reject`, the same each time;
   - that the model holds what `update` accepts, and no control that does nothing (`dispatchViolations`);
   - that the model is data;
   - that the `set` of each input given as `get` and `set` changes its place, and nothing else (`placeViolations`);
   - what the program listens to (`program.subscriptions`).
3. **Write one test per message.** Assert the next state, the commands and the events by value. The state includes
   the inputs, which hold what the program wrote. Assert a rejection as `reject` itself, with `toBe(reject)`. Never
   assert it as "the state did not change": a step that keeps the state would pass that test too.
4. **Check the defects apart.** The invariants rule out some pairs of state and message (see
   [rejections and defects](./rejections-and-defects.md)). The steps above skip those pairs. Check them as defects:
   `expect(() => update(message)(state)).toThrow(InvariantDefect)`.

Here are two tests of a counter. The first test checks `update` with `applyAll`. The second test checks the model with
`dispatchViolations`, for any count:

```ts
// What the model holds: the messages of its controls, a case at a time, in the order the view draws them.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === "Counting" ? [model.decrement, model.increment] : [model.increment]

test("counts up and down", () => {
  expect(applyAll(update)(["Increment", "Increment", "Decrement"], { count: 0 }).state).toEqual({ count: 1 })
})

// The model, for any count: every message it holds is accepted, and nothing `update` accepts is missing from
// it. Both buttons are meant to repeat.
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

### The model of any state

`program.makeModel(state)` makes a model as the run does. So a property test can read the model of any state.
`program.subscriptions(state)` lists the keys of what the program listens to in that state, and `program.listen(key)`
gives the subscription of a key. `program.output(state)` is what its
parent would read of it: no tool reads the output of a program that has no parent.

**A state of a parent** holds its own state and the children that the library keeps (see
[what the library derives](./composition.md#what-the-library-derives)). A test makes one with `stateOf`, of
`@fgaudo/effect-tea/testing`: `stateOf(app, { about: Opt.none() }, { Clock: clock })`.

- It starts each child that the own state lists, as `init` starts it, and puts it in the state given for it. A child
  that is given no state is as it starts.
- A state given for a child that the own state does not list is an error.
- For a parent of parents, the state of a child that is a parent is itself made with `stateOf`.
- A test can also fold messages from `init`, with `applyAll`.

**The number of an instance.** A child's commands, as its parent's `update` returns them, name the instance that asked:
`{ _tag: 'About', instance: 2, command }`. A child's keys are listed as `{ _tag: <child>, instance, key }`,
and `{ _tag: <child>, id, instance, key }` for children by id. The instances are numbered in the order the library starts them,
from 1 (see [composition](./composition.md#precisely), which describes the order). In
[`pages`](../../examples/pages/app.test.ts), the Clock that `init` starts is 1, and the About that a step opens next is
2. A test that needs only the child reads the key's `_tag`, as `pages` does.

**That the model is data** is checked on two equal states built apart. To get them, draw the same seed twice: call
`fc.sample(states, { seed, numRuns: 1 })` two times. Then compare the two models with `Equal.equals`, as
[`form`](../../examples/form/form.test.ts) does. If you use one state object twice, the check passes whatever its model
holds, because a parent keeps a child's model for each state object.

### The reader

**The reader is the test's own.** The reader is a function from a model to the messages that the model holds
(`messagesOf` above). You write it one case of the model at a time. The library cannot write it, because a message in a
model is a value like any other.

**Inputs.** What the user writes into an input is not one of the messages that the model holds. The library keeps the
rule for it, and the rule is the same for every input. A test writes into an input as the view does:
`{ _tag: 'Name', message: { _tag: 'Written', value: 'Ada' } }`. Such writes can be checked with `dispatchViolations`
too. The reader does not return them: the test lists them, beside the messages of the reader in one call, or in a call
of their own. The writes into the values the model shows as editable are `held`. The writes into all the values it
shows are `candidates`. Each write is of a value other than the one the model shows: so its step does something, as
`Inert` asks, and the same write sent again does nothing. Then `Rejected` finds an editor with no place to write into, and `Missing`
finds a place that the model shows as read-only. [`stocktake`](../../examples/stocktake/stocktake.test.ts) does this.
A write into an input that an element reports, as the offset of a scroll, is of a value other than the one the state
holds, since the model does not show it (see [inputs](./inputs.md#a-value-that-an-element-reports)).

**A message held without its value.** The reader takes the value as a parameter, `messagesOf(model, offset)`, and
fills it into each message that the model holds without it, as the view does (see
[what an element reports](./inputs.md#what-an-element-reports)).

- Draw the value, with fast-check. A test that fills one value, as the one at which the message always acts, also
  passes an `update` that rejects the other values.
- Give the same values to the test of the view, which fills them as the element would report them (see
  [the view](#the-view)).
- Exempt with `inert` the values at which the message means nothing: there, its step does nothing.
- `Missing` compares whole messages, the value too. So fill the held messages and the `candidates` with the same
  values.

[`volume`](../../examples/volume/volume.test.ts) does this, for a press with the point of the pointer and the place of
its track.

**Children.** A parent's reader calls the readers of its children. The parent's reader wraps what they return as the
parent receives it: `{ _tag: 'Clock', message }`, with the `id` for children by id. The
[`pages`](../../examples/pages/app.test.ts) and [`list`](../../examples/list/list.test.ts) examples do this. Where a
child's model holds a message without its value, the parent's reader takes that value as a parameter too, and gives it
to the child's reader.

**The reader is complete only as far as the candidates go.** A reader that forgets a field of the model still passes
`Rejected`, `Inert` and `ActsTwice`, because those three judge only what the reader returns. `Missing` finds the forgotten field
when three things hold:

1. `update` accepts the field's message in the state;
2. the message would do something;
3. the test lists the message among the `candidates`.

**Keeping the candidates.** The examples whose messages are tagged list their candidates one tag of `Message` at a
time. They keep the candidates in a record that the compiler checks against the type (`satisfies`), as
[`timer`](../../examples/timer/timer.test.ts) does. With such a record, a new message does not compile until the test
says what a user could ask for with it, even if that is nothing. This is the examples' way to keep the list. The library
does not ask for it.

### The place of an input

**A `set` changes its place, and nothing else** (see [inputs](./inputs.md#rules)). An input given as `get` and `set`
needs a test of it, and `placeViolations` is that test:

```ts
test("its counts are a place: a set changes the count at its id, and nothing else", () => {
  fc.assert(fc.property(fc.array(states(), { minLength: 1 }), fc.array(text, { minLength: 1 }), (drawn, values) => {
    expect(placeViolations(counts, { states: drawn, ids: ["i1", "i2", "missing"], values })).toEqual([])
  }))
})
```

- The test is given the input itself. So the program declares it beside `make`, and exports it, as
  [`stocktake`](../../examples/stocktake/stocktake.ts) exports `counts`.
- The states are drawn from the arbitrary of the program's states. Among them, give at least one where the place is
  there: where `get` gives `None`, `placeViolations` checks nothing.
- For inputs by id, give ids of several rows, and one that no row has. Rows that hold different values find more than
  rows that hold the same.

What `placeViolations` checks is in [testing tools](./testing-tools.md#placeviolations).

### The view

**That the view draws what its model holds is not checked here.** This means that the view draws each control once,
through the right dispatch. You check it with your renderer's tools. For snabbdom, the package has one,
`messagesSentBy`, in `@fgaudo/effect-tea/snabbdom/testing` ([`bridges/snabbdom-testing.ts`][messages]). It finds what a
view sends, without a DOM. A test compares that with what its reader returns. The examples' tests do this, each with a
reader that lists the messages in the order its view draws them. Where a handler reads what its element or its event
reports, the test gives `messagesSentBy` the values that it gives its reader (see
[their tests](./writing-a-bridge.md#their-tests)). `messagesSentBy` is an example, and a bridge does not have to have
one.

**A program run under its renderer, in a DOM,** is run as the app runs it. First, the test file prepares the DOM:

- The test file registers a DOM, as happy-dom's `GlobalRegistrator.register()` does in a `beforeAll`.
- With snabbdom, a file that sets `window` to `undefined` is loaded before the test's imports, even when the test
  registers a DOM. The reason is that snabbdom reads `window` when it loads. With Bun, this is a `preload` of
  `bunfig.toml`, as [`bridges/snabbdom-preload.ts`][preload] is for the package's own tests.

Then the test does these steps:

1. It starts the program with `const { app, run } = start(program, options)`, draws `app` with
   `drawInto(root, { app, view })`, and forks `run` with `Effect.runFork`, with its services provided. `drawInto`
   empties `root` and draws the view into it, so the test finds what the view draws through `root`. The test may make
   `root` with no parent, and may draw a second program into the same `root`, once it has stopped the first bridge.
2. It acts on the page. Then it waits until the page shows what it expects, because a renderer may draw a new state
   later. The bridge to snabbdom draws in a microtask after each new state, a message of its view's included: so the
   test awaits a microtask after each event it dispatches. React renders as React schedules it. A message of a
   subscription or the answer of a command comes later, from a fiber of the run, after more than a microtask. So, for
   what they bring, the test looks at the page again after each turn of the event loop (`setTimeout(resolve, 0)`),
   with a bound that only a failing test reaches.
3. At the end, it stops the bridge, interrupts the run's fiber, and waits for it (see
   [how the run ends](./running.md#how-the-run-ends)).

The tests of the package's bridges go further (see [their tests](./writing-a-bridge.md#their-tests)). In those tests,
the run's fibers go on when the test says.

[preload]: ../../bridges/snabbdom-preload.ts
[messages]: ../../bridges/snabbdom-testing.ts

## Do and don't

Each pair sums up a rule of this page. The rule itself is above.

| Do                                                                              | Don't                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Assert a rejection with `toBe(reject)`.                                         | Assert a rejection as "the state did not change".                       |
| Check that the model is data on two equal states built apart.                   | Check that the model is data on one state object used twice.            |
| Check the pairs the invariants rule out apart, with `toThrow(InvariantDefect)`. | Expect a step or `reject` for a pair that the invariants rule out.      |
| List the candidates, so that `Missing` can find a field the reader forgot.      | Count on `Rejected`, `Inert` and `ActsTwice` to find a forgotten field. |

```ts
// Don't: one state object used twice passes whatever its model holds
const state = { count: 3 }
expect(Equal.equals(counter.makeModel(state), counter.makeModel(state))).toBe(true)

// Do: two equal states built apart, drawn from the same seed
const [one] = fc.sample(states, { seed, numRuns: 1 })
const [other] = fc.sample(states, { seed, numRuns: 1 })
if (one === undefined || other === undefined) throw new Error("nothing sampled")
expect(Equal.equals(counter.makeModel(one), counter.makeModel(other))).toBe(true)
```

## The tools

From `@fgaudo/effect-tea/testing`:

| Tool                                                          | Use it to test                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`applyAll`](./testing-tools.md#applyall)                     | `update`'s rules: apply messages, check the state, commands and events                                              |
| [`dispatchViolations`](./testing-tools.md#dispatchviolations) | that the model holds what `update` accepts, all of it, that each control does something, and a double tap acts once |
| [`placeViolations`](./testing-tools.md#placeviolations)       | that an input's `set` changes its place, and nothing else                                                           |
| [`simulate`](./testing-tools.md#simulate)                     | a flow with its commands answered at once, without running the program                                              |
| [`rehearse`](./testing-tools.md#rehearse)                     | a user's scenario without running the program, the test deciding when each command runs                             |
| [`drive`](./testing-tools.md#drive)                           | a user's scenario on the running program, subscriptions included                                                    |

What each tool does, what fails the test and what it ignores are in [testing tools](./testing-tools.md).
