// Preloaded by `bunfig.toml` in every run of `bun test`. A test that loops in one call, as one may under a mutation of
// `tools/mutations/`, is past any timeout, which needs the loop to yield, and fills the memory of the machine. A worker,
// which no loop of the tests holds, watches the memory of the process instead, and ends it past a bound.
const guard = new Worker(new URL("./memory-guard.test_worker.ts", import.meta.url).href)
// It never keeps the process alive once the tests have ended.
guard.unref()
