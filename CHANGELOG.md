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

- `embed` and `embedEach` return `liftCommands` instead of `init`. `init(step)` returned the child's state
  as it was given, with its commands wrapped: the parent only needs the commands. To upgrade, put the child's
  initial state in the parent's state yourself, and replace `init(step).commands` with
  `liftCommands(step.commands)` (`liftCommands(id, step.commands)` for `embedEach`).

## 0.1.0 (2026-10-17)

First release.
