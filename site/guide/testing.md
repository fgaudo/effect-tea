---
title: Testing
---

# Testing

Most of a program is pure, so most tests need no runtime.

## How a program is tested

A program's tests follow its shape:

1. **Generate its states** with a property-testing library (fast-check in the examples): one arbitrary that
   produces only valid states, every case of each state machine among them.
2. **Check, for any of them,** that `update` answers every message with a step or `reject`, the same each time,
   that the model holds what `update` accepts (`dispatchViolations`), that the model is data, and what the program
   listens to (`subscriptionsOf`).
3. **Write one test per message**, asserting the next state, the commands and the events by value, the inputs
   included, which hold what the program wrote. Assert a rejection as `reject` itself, `toBe(reject)`, never as
   "the state did not change", which a step that keeps the state would pass too.
4. **Check the defects apart.** The pairs of state and message that the invariants rule out (see
   [rejections and defects](./rejections-and-defects.md)) are skipped above, and checked as defects:
   `expect(() => update(message)(state)).toThrow(InvariantDefect)`.

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

- `program.makeModel(state)` makes a model as `run` does, so a property test can read the model of any state,
  and `subscriptionsOf(program)(state)` says what the program listens to there.
- **That the model is data** is checked on two equal states built apart, which the same seed drawn twice gives:
  `fc.sample(states, { seed, numRuns: 1 })` twice, and `Equal.equals` of their models, as
  [`form`](https://github.com/fgaudo/effect-tea/tree/main/examples/form/form.test.ts) does. A state reused would pass
  whatever its model holds: a parent keeps a child's model for each state object.
- **The reader is the test's own**: a function from a model to the messages it holds (`messagesOf` above), a case of the
  model at a time. What the user writes into an input is none of them: the library keeps its rule, the same for every
  input, and a test writes into an input as the view does, `{ _tag: 'Name', message: { _tag: 'Written', was: model.name,
  value: 'Ada' } }`. A parent's reader calls its children's, and wraps what they return as the parent receives it (`{
  _tag: 'Clock', message }`, with the `id` for children by id), as
  [`pages`](https://github.com/fgaudo/effect-tea/tree/main/examples/pages/app.test.ts) and
  [`list`](https://github.com/fgaudo/effect-tea/tree/main/examples/list/list.test.ts) do. The library cannot write it: a
  message in a model is a value like any other.
- **The reader is complete only as far as the candidates go.** One that forgets a field of the model passes `Rejected`
  and `ActsTwice`, which judge only what it returns. `Missing` finds the field, in a state where `update` accepts its
  message, the message would do something, and the test lists it among the `candidates`. The examples whose messages are
  tagged list theirs a tag of `Message` at a time, in a record the compiler checks against the type (`satisfies`), as
  [`timer`](https://github.com/fgaudo/effect-tea/tree/main/examples/timer/timer.test.ts) does: a new message does not
  compile there until the test says what a user could ask with it, nothing included. It is their way to keep the list,
  and nothing the library asks.
- **That the view draws what its model holds is not checked here**: each control once, through the right dispatch. It is
  checked with your renderer's tools. For snabbdom,
  [`examples/snabbdom-testing.test_messages.ts`](https://github.com/fgaudo/effect-tea/tree/main/examples/snabbdom-testing.test_messages.ts)
  has one, `messagesSentBy`, which finds what a view sends without a DOM, for a test to compare with what its reader
  returns, as the examples' tests do, each with a reader in the order its view draws. It is an example, and nothing a
  bridge must have.

## The tools

From `@fgaudo/effect-tea/testing`:

| Tool                 | Use it to test                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| `applyAll`           | `update`'s rules: apply messages, check the state, commands and events            |
| `dispatchViolations` | that the model holds what `update` accepts, all of it, and a double tap acts once |
| `simulate`           | a flow with its commands answered at once, without a runtime                      |
| `rehearse`           | a user's scenario without a runtime, the test deciding when each command runs     |
| `drive`              | a user's scenario on the running program, subscriptions included                  |

Where the test decides when each message arrives, a rejected message fails it if the test, or the view through
it, sent it. What arrives by itself is ignored, as when the program runs. In `drive` time is real, so every
rejection is ignored:

| Rejected…                           | a message the test or the view sends | a command's answer    | a subscription's message      |
| ----------------------------------- | ------------------------------------ | --------------------- | ----------------------------- |
| `applyAll`                          | fails the test                       | (commands do not run) | (the test sends it: it fails) |
| `simulate`                          | fails the test                       | ignored, in `ignored` | (the test sends it: it fails) |
| `rehearse`                          | fails the test                       | ignored, in `ignored` | ignored, in `ignored`         |
| `drive`, and the program as it runs | ignored                              | ignored               | ignored                       |

A tap on a frame that the state has since moved past is a message applied to a later state: test what it does
there with `applyAll`, or with `update` itself.

- **`applyAll`** takes only the test's messages, and fails when `update` rejects one of them.
- **`dispatchViolations`** checks both ways:
  - each message the model holds must be accepted (`Rejected`), and act once when sent twice (`ActsTwice`): sent
    again from the same frame, it is rejected or changes nothing, the same state by `Equal` with no commands and
    no events. Keep states data, since a value without structural equality compares by reference. Actions meant
    to repeat (a "+1") are marked `repeatable`;
  - of the `candidates` the test lists (what a user could ask for, the program's fixed messages), each one
    `update` accepts must be among those held (`Missing`), unless its step does nothing, by the rule above: a
    control that would do nothing is no control missing. Those `withheld` on purpose are excepted, e.g. the
    controls of a page that another covers, which would act on its hidden state.

  Without candidates, it checks only the messages it is given.
- **`simulate`** takes the test's messages and those a subscription would send among them, and fails when
  `update` rejects one of them. Each command runs after those started before it, so the commands of one step all
  answer before those their answers start, as when the program runs commands that answer at once. The command
  answers that `update` rejected are listed in `ignored`: assert it when one being dropped would be a bug. Its
  subscriptions do not run, but it reads them on each new state, as the run does, and fails on a state whose
  subscriptions are a defect, as the run dies of one, a key whose `Equal` throws against a key of the state before
  included.
- **`rehearse`** acts through what the current model shows, as `drive` does, but nothing reaches `update` by itself.
  Each command waits until the test runs it (`run`, `runAll`), through the program's `runCommand` with the services
  provided. A subscription's message is one the test says was heard (`hear`), or the next one the subscription
  itself sends (`hearNext`), only while its key is in the state. `hearNext` starts the subscription the first time
  it hears its key, the one listed when the key appeared, as the run starts that one, and keeps it, as the run
  does, for as long as the key stays, whichever fiber of the test's first heard it: each call hears its next
  message, which waits for the call, and the last one is its end value, after which neither `hearNext` nor `hear`
  hears that key until it goes away and comes back: a `hearNext` that was waiting with the one that heard the end
  fails the test. A key that goes away interrupts its subscription, and so does
  the end of the scenario, or of the rehearsal however it ends: a defect in what it releases fails the test. What it
  sent that `update` has not seen is dropped, as the run drops it, and a `hearNext` still waiting for it fails the
  test. Each start of a key is heard one way, as the run hears one subscription for each: once `hearNext` runs it,
  `hear` fails the test on that key, and once `hear` has played it, `hearNext` does, until the key goes away and
  comes back. `hear` runs nothing: the test answers for what it says was heard, and for whether the subscription had
  ended. So a test says what the user does while a save is under way, and when its answer arrives:

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

  It fails when `send` finds nothing to send on the model, when `update` rejects what it sends (a control the
  model shows and its own state rejects), and when a command is still pending or under way at the end, or its
  `run` was interrupted before it answered: commands cannot be cancelled, and its answer would still arrive. A
  command is under way at the end if it is as the scenario ends, and pending if it is once what the test sent before
  is applied. It
  also fails, as the run dies, on a state whose subscriptions are a defect, which it reads on each new state, a key
  whose `Equal` throws against a key of the state before included, on a state whose model is a defect, which it
  makes on each new state, as a renderer that pulls every frame, and on a command or a subscription that interrupts
  itself. A defect of the program fails it whichever fiber of the test's it reached, one that nobody
  joins included, and however the rehearsal ends, once what it stopped has released what it held: the defect comes
  first in the cause, before what the scenario ended with, and a rehearsal that died checks nothing more of its
  commands. A scenario that catches the defect, with `Effect.exit` say, does not keep it from failing the
  rehearsal: a test that expects a defect wraps `rehearse` itself. A call that fails the test (a `send` the model
  does not show or `update` rejects, a `run` that matches nothing, a `hearNext` stopped while it waited) fails the
  fiber that made it: a call forked from the scenario is joined, or its failure is lost, as in any effect. After a
  defect, `send`, `run`, `runAll`, `hear`, `hearNext` and `model` fail with it, and so do a `hearNext` and a `run`
  already waiting for their subscription or their command, as nothing happens in a run that died, while `state`,
  `pending`, `events` and `ignored` stay readable. A fiber that the test detaches from the scenario
  (`Effect.forkDetach`) is beyond its reach: what such a
  fiber asks for after the rehearsal ended is interrupted, and a defect it meets then is lost. A command's or a
  subscription's message that no longer applies is ignored, as when the program runs, and listed in
  `ignored`. Messages that arrive together, from fibers of the test's, are applied one at a time, as the run takes
  them: each waits for the state the one before left, the release of the subscriptions it stopped included, and
  `send` selects on the model of that state. A message once sent is applied whole, even if the fiber that sent it
  is interrupted meanwhile, or the scenario returns: a rehearsal whose scenario returned applies what was sent
  before, and one whose scenario failed or was interrupted does not. It starts from the program's `init`, and a
  program with flags gets them as `run` does, in the options.
- **`drive`** sends what the frames show, through the run's dispatch, and fails on a wait longer than
  `patience` (2 seconds). Its time is real: a frame may be past by the time its message arrives. So, as when
  the program runs, a rejected message is ignored, and a scenario checks what it expects to see. A program with
  flags gets them as `run` does, in the options. Once the scenario ends, or whoever runs `drive` interrupts it, it
  interrupts the run and waits for it, and fails, as the run dies, on a defect of what the program releases as it
  stops: the defect comes first in the cause, before what the scenario ended with. Its commands run as soon as they
  start: to hold one, give the program a service of the test's that waits on a `Deferred` the scenario completes.

A defect of the program fails `simulate`, `rehearse` and `drive` as it ends the run when the program runs: with the
`ProgramDefect` the run dies with, in the same `where`, with the same `on` or `key`, wherever the tool calls the
program (`init`, `update`, `makeModel`, `subscriptions`, a subscription, `runCommand`): `simulate` starts from the
step it is given, and calls no `init`. `applyAll` and
`dispatchViolations` call `update` without a run, and fail with the defect itself.
