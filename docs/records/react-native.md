# The bridge to React on React Native

**Status:** decided on 25 November 2026, as step 82 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md), and read by a session of Opus 5.5 that wrote none of it.
Nothing of the library was changed: step 83 does what it decides. The spike is `89217b6` on `spike/react-native`,
never to be merged, with a README of its commands. It ran outside the repository, on the package packed at `6eca988`:
React Native 0.88.1, React 19.3.1, Effect 4.1.5, Metro 0.87.3, Hermes 1.0.0, `@testing-library/react-native` 14.1.0,
jest 29.7.0, TypeScript 5.9, Node 24.14.1, Windows. Each claim is **run**, **read** in the sources of `react-native`
0.88.1, named by their path in that package, or **reasoned**. Nothing ran on a device, or on a Hermes.

## Decided

**1. `./react` is the bridge to every renderer of React. There is no entry `./react-native`, and no new peer.** Run:
six tests draw `counter` and `form` with `Host` and `Draw` under React Native's jest preset, their views written with
`Pressable`, `Text` and `TextInput`, which typecheck against React Native's types. A press is drawn, under StrictMode
too; a program started apart is drawn; a name is typed, saved and emptied; and a run that dies reaches an error
boundary. Nothing that React Native needs is code that `./react` cannot hold.

**2. Of "What a bridge does", the guide promises on React Native what React gives, and nothing of the element.**

- **Holds, as React's own** (run): the model of the current state is drawn, a handler calls `dispatch`, and the state
  has changed when it returns.
- **"Each new state is drawn before the next event" does not hold** (read). The events queued together reach
  JavaScript in one task (`ReactCommon/react/renderer/core/EventQueueProcessor.cpp`, `flushEvents`), and React renders
  a store's change in a microtask after it (`Libraries/Renderer/implementations/ReactFabric-prod.js`,
  `forceStoreRerender`, and `batchedUpdatesImpl`, which flushes legacy roots alone): the second handler of a task is
  that of the view before the first. A commit is mounted after its task, by the UI thread
  (`ReactCommon/react/renderer/scheduler/Scheduler.cpp`, `uiManagerDidFinishTransaction`): the user acts on a screen
  older than the state. And the text of a `TextInput` is the native view's, which changes it before JavaScript hears
  of the key.
- **"After each draw, the element shows the value of its model" does not hold at once** (read). The native view drops
  a value from JavaScript whose count of events is behind its own: `!=` in `setTextAndSelection` of iOS's
  `RCTTextInputComponentView.mm`, `>=` in `canUpdateWithEventCount` of Android's `ReactEditText.kt`. So a key typed
  over a value that the program replaced wins: its event brings the old text with the key, and its message stores it,
  as the guide says. After a key that the state rejects, `TextInput` gives the native view its prop back by itself
  (`Libraries/Components/TextInput/TextInput.js`, `useTextInputStateSynchronization`): the key shows, and goes a round
  trip later, or at the next event where another key came since.
- **A lock by the shape of the state holds** (run): a text that the handler of the view before Save sends while the
  form saves is rejected, and the field keeps the model's value.
- **An element kept in its place** is React's reconciliation, as with React DOM (reasoned).

No test without a device reaches what the native view holds: the jest preset draws `TextInput` as a host element with
the props it was given (`@react-native/jest-preset`, `jest/mocks/TextInput.js`). So no premise is taken, since none
would have a test that fails without it ([`premises.md`](../premises.md), "The rule"): what a `TextInput` shows until
the native view takes the model's value is left out. The guide names React Native at both rules, with what to do
there: lock by the shape of the state.

**3. What runs it is a tool outside the lockfile**, `bun run test:react-native`, made as `bun run smoke` is. It packs
the package, installs React Native, its jest preset and the testing library in a project of its own, typechecks the
views, runs their tests with jest, bundles an application with Metro for both platforms, and compiles the bundles with
`hermesc`. A job of the CI runs it, and the daily job of the renderers at the newest React Native. Not taken:

- **The same as `devDependencies`**: 494 packages under the lockfile and `bun audit`, for six tests (value 7).
- **`bun:test`**: React Native's sources are Flow, which its Babel preset alone strips (reasoned).
- **`bridges/bridge.test_suite.ts`**: it is written on `document` and the DOM's events, and what it checks of a
  controlled element is what no test here reaches.

**4. The report of a dead run stays as it is.** Read: React Native has no `reportError` and no `ErrorEvent`
(`src/private/setup/setUpDOM.js`), and its `process` has `env` alone (`Libraries/Core/setUpGlobals.js`). So `report`
calls `console.error`, as React's own `reportGlobalError` does there: the device's log, with LogBox in development,
and in a release build an exception that is not fatal on the native side (`Libraries/Core/ExceptionsManager.js`). It
does not reach a handler set with `ErrorUtils.setGlobalHandler`. A run that dies while `Host` is mounted reaches the
boundary, and with none React Native's `onUncaughtError`, which is fatal
(`src/private/renderer/errorhandling/ErrorHandlers.js`). The doc comment of `Host` is true as written.

**5. The package needs nothing under Metro and Hermes.** Run: Metro resolves `.` and `./react` to `dist/`, by the
condition `default`, and bundles the application for iOS and Android, with its default profile and with
`hermes-stable`; `hermesc` compiles the four bundles. Metro gives `dist/` to React Native's Babel preset first, which
is what refuses a `static {}` block; `hermesc` compiles one. The bytecode was not run. Under jest, Effect and the
package are ES modules, which `transformIgnorePatterns` must let through, or the tests fail to parse: the README says
so.

**6. The example is two views and their tests**, of `counter` and of `form`, in `examples/react-native/`: packed, and
checked by the tool of 3 alone. The typecheck and the lint of the repository leave the folder out, each by one glob.

## Found beside

The renderer of React Native 0.88.1 is React 19.3.0, and asks for `react ^19.3.0`; the bridge's range starts at
19.3.1. npm installs 19.3.1 beside it with no conflict (run), and the renderer checks no equal version (read). An
application that pins 19.3.0 is outside the range: step 83 runs the bridge's tests at 19.3.0, and starts the range
there where they pass.
