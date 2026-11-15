// Preloaded by `bun test` (bunfig.toml): snabbdom reads the global `window` when it is loaded, and tests run
// without a DOM, but for the bridges' tests, `snabbdom.test.ts` and `react.test.ts`, which register one of their own.
Object.assign(globalThis, { window: undefined })
