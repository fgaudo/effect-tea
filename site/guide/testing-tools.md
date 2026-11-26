---
title: Testing tools
---

# Testing tools

## In short

This page says which tool of `@fgaudo/effect-tea/testing` answers which question, and how each one sees time. The doc
comment of each tool says what it does, what fails the test and what it ignores. [Testing](./testing.md) says how a
program is tested with them.

| Tool                 | Use it to test                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `applyAll`           | `update`'s rules: apply messages, check the state, commands and events                                              |
| `dispatchViolations` | that the model holds what `update` accepts, all of it, that each control does something, and a double tap acts once |
| `simulate`           | a flow with its commands answered at once, without running the program                                              |
| `rehearse`           | a user's scenario without running the program, the test deciding when each message arrives                          |
| `drive`              | a user's scenario on the running program, subscriptions included                                                    |

`applyAll` and `dispatchViolations` call `update` alone, and fail with its defect itself. `simulate` and `rehearse` do
not call `start`: each calls the program's functions itself, in an order that the tool or the test decides, and is an
effect that the test runs, with the services of what it runs. A defect of the program fails `simulate`, `rehearse` and
`drive` with the `ProgramDefect` that the run dies with.

## An example

The counter's user clicks +, + and −, on the running program (`examples/counter/counter.test.ts`):

{@includeCode ../../examples/counter/counter.test.ts#drive}

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

Assert `ignored` where dropping one of those messages would be a bug. A tap on a model that the state has since moved
past is a message applied to a later state: to test what it does there, use `applyAll`, or `update` itself.

### dispatchViolations

`dispatchViolations` checks a model against `update` in one state, both ways. Each message the model holds must be
accepted (`Rejected`), must do something (`Inert`), and must act once when sent twice (`ActsTwice`). Each candidate that
`update` accepts must be among those held (`Missing`). To do nothing is to leave the state equal by `Equal`, with no
commands and no events: so keep states data. What the test gives it says what is meant:

- **`candidates`** are what a user could ask for: the program's fixed messages. Without them, only the messages held
  are checked.
- **`repeatable`** marks, by the message and the state, the messages meant to act again when sent twice, as a "+1".
- **`inert`** marks, by the message and the state, a message held on purpose though it does nothing: a tab already
  selected, where a tab bar shows every tab, or the messages of a key, which no control sends.
  [`volume`](../../examples/volume/volume.test.ts) gives the tool those of its drag, and a move to where the slider is
  does nothing.
- **`withheld`** marks a candidate left out on purpose, as the controls of a page that another page covers, which would
  act on the hidden state of the covered page.

### simulate

`simulate` plays a flow without running the program, each command answered as soon as it runs. It starts from the step
it is given, in place of the program's `init`, which it never calls, and takes the test's messages, those that a
subscription would send among them: the subscriptions do not run, so it asks only for the services of the commands.

```ts
const { state, commands, ignored } = yield * simulate(form, typedAndSaved, form.init).pipe(
  Effect.provideService(Storage, working)
)
```

### rehearse

`rehearse` plays a user's scenario without running the program, and nothing reaches `update` by itself. It starts from
the program's `init`, and the scenario acts through a rehearsal: `send` sends what the current model shows, `run` and
`runAll` run the pending commands, and `hear` and `hearNext` apply a subscription's message. A message is applied at
once, in the call that sends it, as in the run. So a test says what the user does while a save is under way, and when
the save's answer arrives:

```ts
rehearse(
  form,
  Effect.fnUntraced(function*(rehearsal) {
    yield* rehearsal.send(({ editor }) =>
      editor._tag === "Saving" ? Opt.none() : Opt.some({ ...editor.typed, value: "Ada" })
    )
    yield* rehearsal.send(({ editor }) => editor._tag === "Named" ? Opt.some(editor.save) : Opt.none())
    expect((yield* rehearsal.model).editor._tag).toBe("Saving")
    yield* rehearsal.run((command) => command._tag === "Save")
  })
)
```

- **A command left at the end fails the test.** A command cannot be cancelled, and its answer would still arrive: run
  it, or `runAll`.
- **A subscription is heard one way.** `hear` runs nothing: the test says what was heard, and answers for it.
  `hearNext` runs the subscription, for as long as its key stays in the state, and hears its next message. A start of a
  key is heard by one or the other, not both. Each takes a `select` of the keys of the current state, and fails the
  test where it matches no key, or more than one. A key of a child names its
  instance, as its parent lists it (see [the number of an instance](./testing.md#the-number-of-an-instance)).

### drive

`drive` runs the program and plays a scenario on its models, subscriptions included. `send` waits for a model that
shows the message and sends it, and `waitFor` waits for a model, the current one or a later one. A wait fails after
`patience`, 2 seconds by default.

- **Time is real.** A model may be past by the time its message arrives. So a rejected message is ignored, as in a run,
  and a scenario checks what it expects to see.
- **The state is ahead of its effects.** A step's commands start after it, so a scenario that ends once a model shows a
  step may end the run before they start. To check what a command does, wait for a model that shows its answer.

## Advice

**Hold a command of `drive` with a service of the test's.** Its commands run as soon as they start, and a model shows
neither that a command has started nor that a subscription has. A service written by the test that waits on a
`Deferred` holds a command until the scenario completes it, and one that completes a `Deferred` when it is called tells
the scenario that it started. Where the order of the answers is what the test is about, `rehearse` says it with no
service.

**Under Effect's `TestClock`, move the clock while `hearNext` waits.** A subscription that sleeps waits for the test to
move the clock, and time moved before it starts to sleep does not count: the test would wait until it times out. So
race the call against a clock that keeps moving, as [`list`](../../examples/list/list.test.ts) races a run under
`TestClock`. A subscription that does not sleep needs none of it.

```ts
const message = yield * rehearsal.hearNext((key) => key === "ticks").pipe(
  Effect.raceFirst(Effect.forever(TestClock.adjust("1 second").pipe(Effect.andThen(Effect.yieldNow))))
)
```
