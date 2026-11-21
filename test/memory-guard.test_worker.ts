// The worker of `memory-guard.test_hook.ts`. A file of the suite holds well under the bound: under a gigabyte, the
// heaviest. `TEST_MEMORY_MB` gives another bound, as the test of the guard does.
const megabyte = 1024 * 1024
const bound = Number(process.env["TEST_MEMORY_MB"] ?? "2048")

setInterval(() => {
  const held = Math.round(process.memoryUsage().rss / megabyte)
  if (held <= bound) return
  // `tools/mutations/mutate.ts` reads this line: a run of the tests that ends with it ran away.
  console.error(`memory guard: the tests hold ${held} MB, past ${bound} MB: one of them loops in one call?`)
  process.kill(process.pid, "SIGKILL")
}, 50)
