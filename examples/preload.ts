// Preloaded by `bun test` (bunfig.toml): snabbdom reads the global `window` when it is loaded, and tests run
// without a DOM, but for `snabbdom.test.ts`, which registers one of its own.
Object.assign(globalThis, { window: undefined })
