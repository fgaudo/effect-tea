// Preloaded by `bun test` (bunfig.toml): snabbdom reads the global `window` when it is loaded, and tests run
// without a DOM.
Object.assign(globalThis, { window: undefined })
