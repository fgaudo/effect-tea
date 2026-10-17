# Changelog

Versions follow [semantic versioning](https://semver.org): before 1.0, a breaking change raises the minor
version.

## 0.2.0 (unreleased)

### Added

- `onApplied`, an option of `run`: hears every message `update` accepts, in order, with the states before and
  after it, its revision and how many commands it started, before its frame is drawn. For devtools, session
  recording or analytics. A defect in it is reported as the `OnApplied` bug.
- `simulate` in `@fgaudo/effect-tea/testing`: runs a flow without a runtime, commands included, and returns
  the final state, every accepted message and every event.
- `drive` in `@fgaudo/effect-tea/testing`: runs a program with `run`, subscriptions included, and lets a
  scenario act as its user through a `Driver` (`waitFor`, `send`, `latest`), with the actions `tap` and
  `input`. A rejected message is always fatal; a wait fails after `patience`, measured with the real clock.
- `applyAll` also returns the `events`, in order.

### Changed

- Commands are data. `update` returns values of the program's own `Command` type, and a new piece of the
  program, `runCommand`, turns each one into an `Execution<Message, R>` (the effect that used to be called
  `Command`). Tests assert the commands themselves instead of counting them, and `onApplied` receives them:
  `Applied.commands` is the list, no longer a count, and `describeCommand` says how they appear in the logs.
  `Step` and `Update` lose their services (`Step<State, Command, Event>`, `Update<State, Message, Command,
  Event>`), which only `runCommand` needs; `Program` gains a `Command` parameter
  (`Program<State, Model, Message, Command, R, Event, K>`). `embed` and `embedEach` take a `wrapCommand`
  when the child has commands, and return the child's `runCommand` with its messages wrapped, for the
  parent's interpreter. `simulate` takes the program (or its `update` and `runCommand`), so a test can pass
  an interpreter of its own, and its result lists the commands it ran. To upgrade: declare a command union,
  move each command's effect into `runCommand` (`absurd` from `effect/Function` for a program without
  commands), return the union's values from `update`, rename `Command` to `Execution`, add `wrapCommand` to
  the `embed` of a child with commands and delegate to the `runCommand` it returns, and pass the program to
  `simulate`.
- `Dispatch` returns an `Effect<void>` instead of sending at once, so a view or renderer built on Effect sends
  with `yield* dispatch(message)`. `dispatchUnsafe(dispatch)` is the callback that sends at once, for a
  renderer whose handlers are plain functions. To upgrade, wrap the dispatch your renderer's callbacks call
  with `dispatchUnsafe`, and yield it where you called it inside an Effect. `Action`s in `testing` return
  the effect too.
- `embed` and `embedEach` return `liftCommands` instead of `init`. `init(step)` returned the child's state
  as it was given, with its commands wrapped: the parent only needs the commands. To upgrade, put the child's
  initial state in the parent's state yourself, and replace `init(step).commands` with
  `liftCommands(step.commands)` (`liftCommands(id, step.commands)` for `embedEach`).

## 0.1.0 (2026-10-17)

First release.
