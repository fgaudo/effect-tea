// Preloaded by `bun test` (bunfig.toml): snabbdom reads the global `window` when it is loaded, and tests run
// without a DOM, but for the bridges' tests, `snabbdom.test.ts`, `snabbdom-testing.test.ts` and `react.test.ts`, which
// register one of their own.
// A project whose tests import snabbdom before a DOM is registered preloads it too, those that register one in
// `beforeAll` included, since their imports run first: `preload = ["./snabbdom-preload.ts"]` under `[test]` in its
// `bunfig.toml`.
Object.assign(globalThis, { window: undefined })
