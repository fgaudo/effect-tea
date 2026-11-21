// Run by `memory-guard.test.ts` under the guard, with a low bound: a loop that allocates in one call, and never yields.
// It stops by itself at four times that bound, so that a guard that failed leaves the machine its memory.
const limit = Number(process.env["TEST_MEMORY_MB"]) * 4 * 1024 * 1024
const kept: Array<Array<number>> = []
while (process.memoryUsage().rss < limit) kept.push(Array.from({ length: 100_000 }, () => 1))
console.log(`not stopped, at ${kept.length} arrays`)
