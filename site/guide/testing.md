---
title: Testing
---

# Testing

## In short

Most of a program is pure, so most tests need no runtime. `applyAll` and `dispatchViolations` test `update` and the
model as plain functions. `simulate` and `rehearse` play a flow without a runtime, and `drive` plays a scenario on the
running program. The tables under [the tools](#the-tools) say which tool answers which question.

## How a program is tested

A program's tests follow its shape:

1. **Generate its states** with a property-testing library (fast-check in the examples). Use one arbitrary that
   produces only valid states, with every case of each state machine among them.
2. **Check, for any of them:**
   - that `update` answers every message with a step or `reject`, the same each time;
   - that the model holds what `update` accepts (`dispatchViolations`);
   - that the model is data;
   - what the program listens to (`subscriptionsOf`).
3. **Write one test per message.** Assert the next state, the commands and the events by value. That includes the
   inputs, which hold what the program wrote. Assert a rejection as `reject` itself, `toBe(reject)`. Never assert it as
   "the state did not change": a step that keeps the state would pass that too.
4. **Check the defects apart.** The invariants rule out some pairs of state and message (see
   [rejections and defects](./rejections-and-defects.md)). The steps above skip those pairs, and they are checked as
   defects: `expect(() => update(message)(state)).toThrow(InvariantDefect)`.

```ts
test('counts up and down', () => {
  expect(
    applyAll(update)(['Increment', 'Increment', 'Decrement'], { count: 0 })
      .state,
  )
    .toEqual({ count: 1 })
})

// What the model holds: the messages of its controls, a case at a time.
const messagesOf = (model: Model): ReadonlyArray<Message> =>
  model._tag === 'Counting'
    ? [model.increment, model.decrement]
    : [model.increment]

// For any count, the model and `update` agree both ways.
test('the model holds what update accepts, all of it', () => {
  fc.assert(fc.property(fc.nat(1_000), (count) => {
    const held = messagesOf(counter.makeModel({ count }))
    const check = dispatchViolations(update, { repeatable: () => true })
    expect(check({ count }, held, ['Increment', 'Decrement'])).toEqual([])
  }))
})
```

### The model of any state

`program.makeModel(state)` makes a model as `run` does. So a property test can read the model of any state.
`subscriptionsOf(program)(state)` says what the program listens to there.

**That the model is data** is checked on two equal states built apart. The same seed drawn twice gives them: call
`fc.sample(states, { seed, numRuns: 1 })` twice, and compare their models with `Equal.equals`, as
[`form`](../../examples/form/form.test.ts) does. If one state object were used
twice, the check would pass whatever its model holds, because a parent keeps a child's model for each state object.

### The reader

**The reader is the test's own.** It is a function from a model to the messages the model holds (`messagesOf` above),
written one case of the model at a time. The library cannot write it: a message in a model is a value like any other.

- **Inputs.** What the user writes into an input is not one of those messages. The library keeps the rule for it, the
  same rule for every input. A test writes into an input as the view does:
  `{ _tag: 'Name', message: { _tag: 'Written', was: model.name, value: 'Ada' } }`.
- **Children.** A parent's reader calls its children's readers. It wraps what they return as the parent receives it:
  `{ _tag: 'Clock', message }`, with the `id` for children by id. So do
  [`pages`](../../examples/pages/app.test.ts) and
  [`list`](../../examples/list/list.test.ts).
- **The reader is complete only as far as the candidates go.** A reader that forgets a field of the model still passes
  `Rejected` and `ActsTwice`: they judge only what it returns. `Missing` finds the field when three things hold:
  `update` accepts its message in the state, the message would do something, and the test lists it among the
  `candidates`.
- **Keeping the candidates.** The examples whose messages are tagged list their candidates one tag of `Message` at a
  time. They keep them in a record the compiler checks against the type (`satisfies`), as
  [`timer`](../../examples/timer/timer.test.ts) does. There, a new message does
  not compile until the test says what a user could ask for with it, even if that is nothing. That is the examples' way
  to keep the list, and not something the library asks for.

### The view

**That the view draws what its model holds is not checked here**: that it draws each control once, through the right
dispatch. That is checked with your renderer's tools. For snabbdom,
[`examples/snabbdom-testing.test_messages.ts`][messages] has one, `messagesSentBy`. It finds what a view sends,
without a DOM, for a test to compare with what its reader returns. The examples' tests do this, each with a reader in
the order its view draws. `messagesSentBy` is an example, and not something a bridge must have.

**A program run under its renderer, in a DOM,** is tested as the examples' bridges are (see
[their tests](./writing-a-bridge.md#their-tests)): the test file registers a DOM, and a frame is drawn when the test
says, in place of the next animation frame.

[messages]: ../../examples/snabbdom-testing.test_messages.ts

## The tools

From `@fgaudo/effect-tea/testing`:

| Tool                 | Use it to test                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| `applyAll`           | `update`'s rules: apply messages, check the state, commands and events            |
| `dispatchViolations` | that the model holds what `update` accepts, all of it, and a double tap acts once |
| `simulate`           | a flow with its commands answered at once, without a runtime                      |
| `rehearse`           | a user's scenario without a runtime, the test deciding when each command runs     |
| `drive`              | a user's scenario on the running program, subscriptions included                  |

**When a rejected message fails the test.** In a tool where the test decides when each message arrives, a rejected
message fails the test if the test sent it, or if the view sent it through the test. What arrives by itself is ignored,
as when the program runs. In `drive` time is real, so every rejection is ignored:

| Rejected…                           | a message the test or the view sends | a command's answer    | a subscription's message      |
| ----------------------------------- | ------------------------------------ | --------------------- | ----------------------------- |
| `applyAll`                          | fails the test                       | (commands do not run) | (the test sends it: it fails) |
| `simulate`                          | fails the test                       | ignored, in `ignored` | (the test sends it: it fails) |
| `rehearse`                          | fails the test                       | ignored, in `ignored` | ignored, in `ignored`         |
| `drive`, and the program as it runs | ignored                              | ignored               | ignored                       |

A tap on a frame that the state has since moved past is a message applied to a later state. Test what it does there
with `applyAll`, or with `update` itself.

### `applyAll`

`applyAll` tests `update`'s rules, as `counts up and down` does in [how a program is tested](#how-a-program-is-tested).

- It takes only the test's messages.
- It fails when `update` rejects one of them.

### `dispatchViolations`

`dispatchViolations` tests that the model holds what `update` accepts, all of it, and that a double tap acts once, as
the second test of [how a program is tested](#how-a-program-is-tested) does. It checks both ways:

- **Each message the model holds must be accepted** (`Rejected`).
- **Each one must act once when sent twice** (`ActsTwice`). Sent again from the same frame, it is rejected or changes
  nothing: the same state by `Equal`, with no commands and no events. Keep states data, since a value without
  structural equality compares by reference. Actions meant to repeat (a "+1") are marked `repeatable`.
- **Each candidate `update` accepts must be among those held** (`Missing`), compared by `Equal`. The `candidates` are
  what the test lists: what a user could ask for, the program's fixed messages. A candidate whose step does nothing, by
  the rule of `ActsTwice`, is excepted: a control that would do nothing is not a missing control. The candidates
  `withheld` on purpose are excepted too, for example the controls of a page that another page covers, which would act
  on its hidden state.

Without candidates, it checks only the messages it is given.

### `simulate`

`simulate` tests a flow with its commands answered at once, without a runtime.

- It takes the test's messages, and among them those a subscription would send.
- It fails when `update` rejects one of them.
- Each command runs after those started before it. So all the commands of one step answer before the commands that
  their answers start, as when the program runs commands that answer at once. All of them run before the next of the
  test's messages is applied.
- Each command has a scope of its own, as when the program runs. The scope is closed before the command's message is
  applied.
- The command answers that `update` rejected are listed in `ignored`. Assert `ignored` when dropping one of them would
  be a bug.
- Its subscriptions do not run. What it reads from them is under [precisely](#precisely).
- Its type still asks for every service the program needs, those of its subscriptions too: a program names its
  services once. Provide those that no command uses with any value, since nothing calls them.
- It starts from the step it is given, and calls no `init`.
- It succeeds with the last `state` and with these lists, each in order:
  - `messages`: every message that `update` accepted, the test's and the commands' answers;
  - `commands`: every command started, including those of the step it started from;
  - `events`: every event that `update` raised;
  - `ignored`.

### `rehearse`

`rehearse` tests a user's scenario without a runtime: the test decides when each command runs. So a test says what the
user does while a save is under way, and when its answer arrives:

```ts
rehearse(
  form,
  Effect.fnUntraced(function*(rehearsal) {
    yield* rehearsal.send(({ name, editor }) =>
      editor._tag === 'Saving'
        ? Opt.none()
        : Opt.some({ _tag: 'Name', message: { _tag: 'Written', was: name, value: 'Ada' } })
    )
    yield* rehearsal.send(({ editor }) =>
      editor._tag === 'Named' ? Opt.some(editor.save) : Opt.none()
    )
    expect((yield* rehearsal.model).editor._tag).toBe('Saving')
    yield* rehearsal.run((command) => command._tag === 'Save')
  }),
)
```

- **It acts through what the current model shows**, as `drive` does.
- **Nothing reaches `update` by itself.**
- **Each command waits until the test runs it** (`run`, `runAll`). It runs through the program's `runCommand`, with the
  services provided, in a scope of its own. `run` runs the oldest pending command it matches. `runAll` runs the oldest
  pending command until none is left, including the commands that they start.
- **A subscription's message is one the test says was heard** (`hear`), or the next one the subscription itself sends
  (`hearNext`). Either is heard only while its key is in the state.
- **It starts from the program's `init`.** A program with flags gets them as `run` does, in the options.

### `drive`

`drive` tests a user's scenario on the running program, subscriptions included.

- It sends what the frames show, through the run's dispatch.
- It fails on a wait longer than `patience` (2 seconds).
- Its time is real: a frame may be past by the time its message arrives. So, as when the program runs, a rejected
  message is ignored, and a scenario checks what it expects to see.
- Its renderer keeps only the latest frame. A wait looks at that frame and at later ones.
- Its commands run as soon as they start. To hold one, give the program a service, written by the test, that waits on a
  `Deferred` that the scenario completes.
- A program with flags gets them as `run` does, in the options.

## Precisely

### `simulate`, as the run dies

- Its subscriptions do not run, but it reads them on each new state, as the run does.
- It fails on a state whose subscriptions are a defect, as the run dies of one. A key whose `Equal` throws against a key
  of the state before is such a defect too.
- It fails on a command that interrupts itself, as the run dies of one.

### `rehearse`, in detail

#### What fails the test

- A `send` that finds nothing to send on the model.
- A message that `send` sends and `update` rejects: a control that the model shows and that its own state rejects.
- A `run` that matches nothing.
- A command left at the end (see [commands at the end](#commands-at-the-end)).
- A misuse of `hear` and `hearNext` (see [how a subscription is heard](#how-a-subscription-is-heard)).
- A defect of the program (see [after a defect of the program](#after-a-defect-of-the-program)).

It also fails, as the run dies:

- on a state whose subscriptions are a defect. It reads them on each new state. A key whose `Equal` throws against a key
  of the state before is such a defect too;
- on a state whose model is a defect. It makes the model on each new state, as a renderer that pulls every frame does;
- on a command or a subscription that interrupts itself.

#### How a subscription is heard

- A subscription's message is heard only while its key is in the state. Keys compare by value, as the run compares
  them.
- `hear` runs nothing. The test answers for what it says was heard, and for whether the subscription had ended.
- `hearNext` runs the subscription:
  1. The first time it hears a key, it starts that key's subscription, with the services provided and in a scope of its
     own. The subscription it starts is the one listed when the key appeared, as the run starts that one.
  2. It keeps the subscription for as long as the key stays, as the run does, whichever fiber of the test first heard
     it.
  3. Each call hears the subscription's next message, and succeeds with it. That message waits for the call.
  4. The last message is the subscription's end value. After it, neither `hearNext` nor `hear` hears that key until the
     key goes away and comes back. A `hearNext` that was waiting at the same time as the one that heard the end fails
     the test.
- **Each start of a key is heard one way**, as the run hears one subscription for each. Once `hearNext` runs it, `hear`
  fails the test on that key. Once `hear` has played it, `hearNext` fails the test on that key. Both hold until the key
  goes away and comes back.
- **A key that goes away interrupts its subscription.** So does the end of the scenario, and the end of the rehearsal,
  however it ends. Then:
  - a defect in what the subscription releases fails the test;
  - what the subscription sent that `update` has not seen is dropped, as the run drops it, and a `hearNext` still
    waiting for it fails the test.
- A subscription's message that no longer applies is ignored, as when the program runs, and listed in `ignored`.
- **Under Effect's `TestClock`, move time while `hearNext` waits.** A subscription that sleeps does not wait for
  real time. It waits for the test to move the clock. But time moved before the subscription starts to sleep does
  not count, and the test then waits until it times out. So race the call against a clock that keeps moving, as
  [`list`](../../examples/list/list.test.ts) does with a run:

  ```ts
  const message = yield* rehearsal.hearNext('ticks').pipe(
    Effect.raceFirst(Effect.forever(TestClock.adjust('1 second').pipe(Effect.andThen(Effect.yieldNow)))),
  )
  ```

#### Commands at the end

- The test fails when a command is still pending or under way at the end, or its `run` was interrupted before it
  answered. Commands cannot be cancelled, and its answer would still arrive.
- A command is under way at the end if it is under way as the scenario ends.
- A command is pending at the end if it is pending once what the test sent before is applied.
- A command's message that no longer applies is ignored, as when the program runs, and listed in `ignored`.

#### After a defect of the program

1. A defect of the program fails the rehearsal whichever fiber of the test it reached, including a fiber that nobody
   joins.
2. It fails the rehearsal however the rehearsal ends, once what the defect stopped has released what it held.
3. The defect comes first in the cause, before what the scenario ended with.
4. A rehearsal that died checks nothing more about its commands.

A scenario that catches the defect, with `Effect.exit` for example, does not keep it from failing the rehearsal. A test
that expects a defect wraps `rehearse` itself.

After a defect, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with it. So do a `hearNext` and a `run`
already waiting for their subscription or their command, as nothing happens in a run that died. `state`, `pending`,
`events` and `ignored` stay readable.

#### Fibers the test forks or detaches

- A call that fails the test fails the fiber that made it: a `send` that the model does not show or that `update`
  rejects, a `run` that matches nothing, a `hearNext` stopped while it waited.
- So a call forked from the scenario must be joined, or its failure is lost, as in any effect.
- A fiber that the test detaches from the scenario (`Effect.forkDetach`) is beyond the rehearsal's reach. What such a
  fiber asks for after the rehearsal ended is interrupted, and a defect it meets then is lost.

#### Messages that arrive together

- Messages that arrive together, from fibers of the test, are applied one at a time, as the run takes them.
- Each waits for the state that the one before it left, including the release of the subscriptions that the one before
  stopped. `send` selects on the model of that state.
- A message once sent is applied whole, even if the fiber that sent it is interrupted meanwhile, or the scenario
  returns.
- A rehearsal whose scenario returned applies what was sent before. One whose scenario failed or was interrupted does
  not.

### How `drive` ends

Once the scenario ends, or whoever runs `drive` interrupts it:

1. it interrupts the run, and waits for it;
2. it fails, as the run dies, on a defect of what the program releases as it stops. The defect comes first in the
   cause, before what the scenario ended with.

### Defects of the program

A defect of the program fails `simulate`, `rehearse` and `drive`, as it ends the run when the program runs. They fail
with the `ProgramDefect` the run dies with, in the same `where`, with the same `on` or `key`. That holds wherever the
tool calls the program: `init`, `update`, `makeModel`, `subscriptions`, a subscription, `runCommand`. (`simulate` calls
no `init`.)

**`applyAll` and `dispatchViolations` call `update` without a run**, and fail with the defect itself.
