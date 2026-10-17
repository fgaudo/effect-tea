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

## 0.1.0 (2026-10-17)

First release.
