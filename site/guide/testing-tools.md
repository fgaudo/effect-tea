---
title: Testing tools
---

# Testing tools

## In short

This page is the reference of the five tools of `@fgaudo/effect-tea/testing`. Come here with a question about one tool:
its section says what the tool does, what fails the test and what the tool ignores. [Testing](./testing.md) says how a
program is tested with them.

- `applyAll` and `dispatchViolations` test `update` and the model as plain functions.
- `simulate` and `rehearse` play a flow without a runtime.
- `drive` plays a scenario on the running program.

[Precisely](#precisely) gives the edge cases of `simulate`, `rehearse` and `drive`.

## Rules

**When a rejected message fails the test.** In some tools, the test decides when each message arrives. In those tools, a
rejected message fails the test if the test sent it, or if the view sent it through the test. What arrives by itself is
ignored, as when the program runs. In `drive`, time is real, so every rejection is ignored:

| Rejected…                           | a message the test or the view sends | a command's answer    | a subscription's message      |
| ----------------------------------- | ------------------------------------ | --------------------- | ----------------------------- |
| `applyAll`                          | fails the test                       | (commands do not run) | (the test sends it: it fails) |
| `simulate`                          | fails the test                       | ignored, in `ignored` | (the test sends it: it fails) |
| `rehearse`                          | fails the test                       | ignored, in `ignored` | ignored, in `ignored`         |
| `drive`, and the program as it runs | ignored                              | ignored               | ignored                       |

A tap on a frame that the state has since moved past is a message applied to a later state. To test what the tap does
in that later state, use `applyAll`, or `update` itself.

### applyAll

`applyAll` tests `update`'s rules. The test `counts up and down` in
[how a program is tested](./testing.md#how-a-program-is-tested) uses it.

- `applyAll` takes only the test's messages.
- `applyAll` fails when `update` rejects one of those messages.

### dispatchViolations

`dispatchViolations` tests two things: that the model holds what `update` accepts, all of it, and that a double tap
acts once. The test `the model holds what update accepts, all of it` in
[how a program is tested](./testing.md#how-a-program-is-tested) uses it. `dispatchViolations` checks both ways:

- **Each message the model holds must be accepted** (`Rejected`).
- **Each message must act once when sent twice** (`ActsTwice`). This means that a message sent again from the same frame is
  rejected, or changes nothing. Changing nothing means the same state by `Equal`, with no commands and no events.
  - Keep states data. A value without structural equality compares by reference.
  - Actions meant to repeat (a "+1") are marked `repeatable`.
- **Each candidate `update` accepts must be among those held** (`Missing`), compared by `Equal`. The `candidates` are
  what the test lists: what a user could ask for, the program's fixed messages. Two kinds of candidates are excepted:
  - A candidate whose step does nothing, by the rule of `ActsTwice`. A control that would do nothing is not a missing
    control.
  - The candidates `withheld` on purpose. An example is the controls of a page that another page covers: those
    controls would act on the hidden state of the covered page.

Without candidates, `dispatchViolations` checks only the messages it is given.

### simulate

`simulate` tests a flow with its commands answered at once, without a runtime. `simulate` takes the program first.
Then it takes the test's messages and the step to start from:

```ts
const { state, commands, ignored } = yield* simulate(form)(typedAndSaved, form.init).pipe(
  Effect.provideService(Storage, working),
)
```

- `simulate` starts from the step it is given, and calls no `init`.
- `simulate` takes the test's messages. Those include the messages a subscription would send.
- `simulate` asks only for the services of the commands. The subscriptions do not run, so `simulate` does not ask for
  their services.
- Each command runs after the commands started before it. So all the commands of one step answer before the commands
  that their answers start. The program does the same when it runs commands that answer at once. All these commands run
  before the next of the test's messages is applied.
- Each command has a scope of its own, as when the program runs. The scope is closed before the command's message is
  applied.
- The program's subscriptions do not run. What `simulate` reads from them is under [precisely](#precisely).
- `simulate` fails when `update` rejects one of the test's messages.
- The command answers that `update` rejected are listed in `ignored`. Assert `ignored` when dropping one of those
  answers would be a bug.
- `simulate` succeeds with the last `state` and with these lists, each in order:
  - `messages`: every message that `update` accepted, the test's and the commands' answers;
  - `commands`: every command started, including those of the step it started from;
  - `events`: every event that `update` raised;
  - `ignored`.

### rehearse

`rehearse` tests a user's scenario without a runtime. In a rehearsal, the test decides when each command runs. So a test
says what the user does while a save is under way, and when the save's answer arrives:

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

- **`rehearse` starts from the program's `init`.** A program with flags gets them as `run` does, in the options.
- **`rehearse` acts through what the current model shows**, as `drive` does.
- **Nothing reaches `update` by itself.**
- **Each command waits until the test runs it** (`run`, `runAll`). A command runs through the program's `runCommand`,
  with the services provided, in a scope of its own.
  - `run` runs the oldest pending command that it matches.
  - `runAll` runs the oldest pending command until none is left, including the commands that those commands start.
- **A subscription's message is one the test says was heard** (`hear`), or the next one the subscription itself sends
  (`hearNext`). Either message is heard only while the subscription's key is in the state.
- **`rehearse` asks for the services of what the test runs.**
  - `run` and `runAll` ask for the services of the commands.
  - `hearNext` asks for the services of the subscriptions.
  - A test that runs neither provides none.
- What fails the test is under [what fails the test](#what-fails-the-test).

### drive

`drive` tests a user's scenario on the running program, subscriptions included.

- A program with flags gets them as `run` does, in the options.
- `drive` sends what the frames show, through the run's dispatch.
- The program's commands run as soon as they start. To hold a command, give the program a service written by the
  test. The service waits on a `Deferred` that the scenario completes.
- The renderer of `drive` keeps only the latest frame. A wait looks at that frame and at later ones.
- `drive` fails on a wait longer than `patience` (2 seconds).
- Time in `drive` is real: a frame may be past by the time its message arrives. So, as when the program runs, a
  rejected message is ignored, and a scenario checks what it expects to see.
- How `drive` ends is under [precisely](#precisely).

## Precisely

### `simulate`, as the run dies

- The subscriptions do not run, but `simulate` reads them on each new state, as the run does.
- `simulate` fails on a state whose subscriptions are a defect, as the run dies of one. A key whose `Equal` throws
  against a key of the state before is such a defect too.
- `simulate` fails on a command that interrupts itself, as the run dies of one.

### `rehearse`, in detail

#### What fails the test

`rehearse` fails the test on:

- a `send` that finds nothing to send on the model;
- a message that `send` sends and `update` rejects: a control that the model shows and that its own state rejects;
- a `run` that matches nothing;
- a command left at the end (see [commands at the end](#commands-at-the-end));
- a misuse of `hear` and `hearNext` (see [how a subscription is heard](#how-a-subscription-is-heard));
- a defect of the program (see [after a defect of the program](#after-a-defect-of-the-program)).

`rehearse` also fails, as the run dies:

- on a state whose subscriptions are a defect. `rehearse` reads the subscriptions on each new state. A key whose `Equal`
  throws against a key of the state before is such a defect too;
- on a state whose model is a defect. `rehearse` makes the model on each new state, as a renderer that pulls every
  frame does;
- on a command or a subscription that interrupts itself.

#### How a subscription is heard

- A subscription's message is heard only while its key is in the state. Keys compare by value, as the run compares
  them.
- `hear` runs nothing. The test answers for what it says was heard, and for whether the subscription had ended.
- `hearNext` runs the subscription:
  1. The first time `hearNext` hears a key, it starts that key's subscription, with the services provided and in a
     scope of its own. The subscription it starts is the one listed when the key appeared, as the run starts that one.
  2. `hearNext` keeps the subscription for as long as the key stays, as the run does. It does not matter which fiber
     of the test heard the subscription first.
  3. Each call of `hearNext` hears the subscription's next message, and succeeds with that message. The message waits
     for the call.
  4. The last message is the subscription's end value. After it, `hearNext` and `hear` do not hear that key until the
     key goes away and comes back. A `hearNext` that was waiting at the same time as the one that heard the end fails
     the test.
- **Each start of a key is heard one way**, as the run hears one subscription for each. Both rules below hold until the
  key goes away and comes back:
  - Once `hearNext` runs the subscription of that start, `hear` fails the test on that key.
  - Once `hear` has played that start, `hearNext` fails the test on that key.
- **A key that goes away interrupts its subscription.** The end of the scenario interrupts the subscription too, and so
  does the end of the rehearsal, however the rehearsal ends. Then:
  - a defect in what the subscription releases fails the test;
  - what the subscription sent that `update` has not seen is dropped, as the run drops it, and a `hearNext` still
    waiting for it fails the test.
- A subscription's message that no longer applies is ignored, as when the program runs, and listed in `ignored`.
- **Under Effect's `TestClock`, move time while `hearNext` waits.** A subscription that sleeps does not wait for real
  time. It waits for the test to move the clock. But time moved before the subscription starts to sleep does not count.
  The test then waits until it times out. So race the call against a clock that keeps moving, as
  [`list`](../../examples/list/list.test.ts) does with a run:

  ```ts
  const message = yield* rehearsal.hearNext('ticks').pipe(
    Effect.raceFirst(Effect.forever(TestClock.adjust('1 second').pipe(Effect.andThen(Effect.yieldNow)))),
  )
  ```

#### Commands at the end

- The test fails when a command is still pending or under way at the end, or when its `run` was interrupted before the
  command answered. Commands cannot be cancelled, and the command's answer would still arrive.
- A command is under way at the end if it is under way as the scenario ends.
- A command is pending at the end if it is pending once what the test sent before is applied.
- A command's message that no longer applies is ignored, as when the program runs, and listed in `ignored`.

#### After a defect of the program

1. A defect of the program fails the rehearsal whichever fiber of the test the defect reached, including a fiber that
   nobody joins.
2. The defect fails the rehearsal however the rehearsal ends, once what the defect stopped has released what it held.
3. The defect comes first in the cause, before what the scenario ended with.
4. A rehearsal that died checks nothing more about its commands.

If the scenario catches the defect, with `Effect.exit` for example, the defect still fails the rehearsal. A test that
expects a defect wraps `rehearse` itself.

After a defect, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with the defect. A `hearNext` or a `run`
that is already waiting for its subscription or its command fails with it too, as nothing happens in a run that died.
`state`, `pending`, `events` and `ignored` stay readable.

#### Fibers the test forks or detaches

- A call that fails the test fails the fiber that made the call: a `send` that the model does not show or that
  `update` rejects, a `run` that matches nothing, a `hearNext` stopped while it waited.
- So a call forked from the scenario must be joined, or its failure is lost, as in any effect.
- A fiber that the test detaches from the scenario (`Effect.forkDetach`) is beyond the rehearsal's reach. What such a
  fiber asks for after the rehearsal ended is interrupted, and a defect it meets then is lost.

#### Messages that arrive together

- Messages that arrive together, from fibers of the test, are applied one at a time, as the run takes them.
- Each message waits for the state that the message before it left. That includes the release of the subscriptions
  that the message before stopped. `send` selects on the model of that state.
- A message once sent is applied whole, even if the fiber that sent it is interrupted meanwhile, or the scenario
  returns.
- A rehearsal whose scenario returned applies what was sent before. A rehearsal whose scenario failed or was interrupted
  does not.

### How `drive` ends

`drive` ends in two steps, once the scenario ends, or once whoever runs `drive` interrupts it:

1. `drive` interrupts the run, and waits for it;
2. `drive` fails, as the run dies, on a defect of what the program releases as it stops. The defect comes first in the
   cause, before what the scenario ended with.

### Defects of the program

A defect of the program fails `simulate`, `rehearse` and `drive`, as it ends the run when the program runs. These three
tools fail with the `ProgramDefect` the run dies with, in the same `where`, with the same `on` or `key`. That holds
wherever the tool calls the program: `init`, `update`, `makeModel`, `subscriptions`, a subscription, `runCommand`.
(`simulate` calls no `init`.)

**`applyAll` and `dispatchViolations` call `update` without a run**, and fail with the defect itself.
