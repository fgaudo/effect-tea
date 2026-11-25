---
title: Testing
---

# Testing

## In short

This page shows how a program is tested, step by step. Most of a program is pure, so most of its tests need no
runtime: `update` and the model are tested as plain functions, with `applyAll` and `dispatchViolations`. A flow is
played without running the program, with `simulate` and `rehearse`, and a scenario on the running program with
`drive`. [Testing tools](./testing-tools.md) says which tool answers which question.

## An example

The counter's tests (`examples/counter/counter.test.ts`). The reader lists the messages that a model holds, one case
of the model at a time:

{@includeCode ../../examples/counter/counter.test.ts#reader}

Then `update` is tested with `applyAll`, a rejection with `toBe(reject)`, and the model of any count with
`dispatchViolations`:

{@includeCode ../../examples/counter/counter.test.ts#update}

## Rules

### How a program is tested

The tests of a program follow its shape, in four steps:

1. **Generate its states** with a property-testing library (fast-check in the examples). Use one arbitrary. It
   produces only valid states, and every case of each state machine is among them.
2. **Check, for any of them:**
   - that `update` answers every message with a step or `reject`, the same each time;
   - that the model holds what `update` accepts, and no control that does nothing (`dispatchViolations`);
   - that the model is data;
   - what the program listens to (`program.subscriptions`).
3. **Write one test per message.** Assert the next state, the commands and the events by value. Assert a rejection as
   `reject` itself, with `toBe(reject)`. Never assert it as "the state did not change": a step that keeps the state
   would pass that test too.
4. **Check the defects apart.** The invariants rule out some pairs of state and message (see
   [rejections and defects](./rejections-and-defects.md)). The steps above skip those pairs. Check them as defects:
   `expect(() => update(message)(state)).toThrow(InvariantDefect)`.

### The model of any state

`program.makeModel(state)` makes a model as the run does. So a property test can read the model of any state.
`program.subscriptions(state)` lists the keys of what the program listens to in that state, and `program.listen(key)`
gives the subscription of a key. `program.output(state)` is what a parent would read of it.

**That the model is data** is checked on two equal states built apart, drawn from the same seed, as
[`form`](../../examples/form/form.test.ts) does. One state object used twice passes whatever its model holds, because a
parent keeps each child's model while the child keeps its state:

```ts
const [one] = fc.sample(states, { seed, numRuns: 1 })
const [other] = fc.sample(states, { seed, numRuns: 1 })
if (one === undefined || other === undefined) throw new Error("nothing sampled")
expect(Equal.equals(counter.makeModel(one), counter.makeModel(other))).toBe(true)
```

### The number of an instance

A state of a parent holds its own state and the children that the library keeps (see
[what the library derives](./composition.md#what-the-library-derives)). A test makes one with `stateOf`, of
`@fgaudo/effect-tea/testing`, or folds messages from `init` with `applyAll`:
`stateOf(app, { about: Opt.none() }, { Clock: clock })`.

A child's commands, as its parent's `update` returns them, name the instance that asked:
`{ _tag: 'About', instance: 2, command }`. The keys of a child's subscriptions are `{ _tag: <child>, instance, key }`,
and `{ _tag: <child>, id, instance, key }` for children by id. The instances are numbered in the order the library
starts them, from 1 (see [the order of the starts](./composition.md#how-a-parent-and-its-children-start)). In
[`pages`](../../examples/pages/app.test.ts), the Clock that `init` starts is 1, and the About that a step opens next is
2. A test that needs only the child reads the key's `_tag`, as `pages` does.

### The reader

**The reader is the test's own**: a function from a model to the messages that the model holds (`messagesOf` above),
written one case of the model at a time. The library cannot write it, because a message in a model is a value like any
other.

**A message held without its value.** The reader takes the value as a parameter, `messagesOf(model, offset)`, and
fills it into each message that the model holds without it, as the view does (see
[what an element gives](./what-an-element-gives.md)).

- For what is typed, fill a text other than the one the model shows, as that text with a letter more: the text that
  the field holds already changes nothing, which `Inert` finds. [`form`](../../examples/form/form.test.ts) and
  [`stocktake`](../../examples/stocktake/stocktake.test.ts) do this.
- Draw a value that the model does not show, with fast-check. A test that fills one value, as the one at which the
  message always acts, also passes an `update` that rejects the other values.
- Give the same values to the test of the view (see [the view](#the-view)).
- Exempt with `inert` the values at which the message means nothing.
- Fill the held messages and the `candidates` with the same values: `Missing` compares whole messages.

[`volume`](../../examples/volume/volume.test.ts) does this, for a press with the point of the pointer and the place of
its track.

**Children.** A parent's reader calls the readers of its children, and wraps what they return as the parent receives
it: `{ _tag: 'Clock', message }`, with the `id` for children by id, as [`pages`](../../examples/pages/app.test.ts) and
[`list`](../../examples/list/list.test.ts) do. A value that a child's reader takes is a parameter of the parent's
reader too.

**The reader is complete only as far as the candidates go.** A reader that forgets a field of the model still passes
`Rejected`, `Inert` and `ActsTwice`, which judge only what the reader returns. `Missing` finds the forgotten field when
`update` accepts its message in the state, the message would do something, and the test lists it among the
`candidates`.

### The view

**That the view draws what its model holds**, each control once and through the right dispatch, is checked with your
renderer's tools. For snabbdom, `messagesSentBy`, of `@fgaudo/effect-tea/snabbdom/testing`, finds what a view sends
without a DOM, and a test compares it with what its reader returns, in the order the view draws them. Where a handler
reads what its element or its event reports, the test gives `messagesSentBy` the values that it gives its reader.

**A program run under its renderer, in a DOM,** is run as the app runs it. The test file registers a DOM, as happy-dom's
`GlobalRegistrator.register()` does in a `beforeAll`. With snabbdom, which reads `window` as it loads, a file that sets
`window` to `undefined` is loaded before the test's imports: with Bun, a `preload` of `bunfig.toml`, as
[`bridges/snabbdom-preload.ts`](../../bridges/snabbdom-preload.ts) is for the package's own tests. `react-dom/client`
reads the DOM as it loads too, and Bun loads it before the body of a module imported ahead of it: the DOM is registered
by a `preload`, or before an `await import(…)` of what imports it, or a text field sends no `onChange`. Then the test:

1. starts the program with `start`, draws `app` into a `root`, and forks `run`, with its services provided;
2. acts on the page, then waits until the page shows what it expects. The bridge to snabbdom draws in a microtask after
   each new state, and React as React schedules it. A message of a subscription or the answer of a command may come
   later (see [guarantees](./guarantees.md#what-is-left-to-you)): so the test looks at the page again after each turn
   of the event loop (`setTimeout(resolve, 0)`), with a bound that only a failing test reaches;
3. at the end, stops the bridge, interrupts the run's fiber, and waits for it (see
   [how the run ends](./running.md#how-the-run-ends)).

## Advice

**Keep the candidates in a record that the compiler checks.** The examples whose messages are tagged list their
candidates one tag of `Message` at a time, in a record checked against the type with `satisfies`, as
[`timer`](../../examples/timer/timer.test.ts) does. A new message then does not compile until the test says what a user
could ask for with it, even if that is nothing. A program of a few messages that seldom change can list them in an
array, as the counter does.
