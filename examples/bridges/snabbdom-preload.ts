// Preloaded by `bun test` (bunfig.toml): snabbdom reads the global `window` when it is loaded, and tests run
// without a DOM, but for the bridges' tests, `snabbdom.test.ts` and `react.test.ts`, which register one of their own.
// A project that tests a snabbdom view without a DOM preloads it too, with `preload = ["./snabbdom-preload.ts"]`
// under `[test]` in its `bunfig.toml`.
Object.assign(globalThis, { window: undefined })
