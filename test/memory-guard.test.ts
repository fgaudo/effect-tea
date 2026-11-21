import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"

// In a process of its own, as `bun test` preloads the guard: on Node too, which runs no guard of its own.
test("the memory guard ends a process that loops in one call past its bound, and says so", () => {
  const ran = spawnSync(
    "bun",
    ["--preload", "./test/memory-guard.test_hook.ts", "./test/memory-guard.test_fixture.ts"],
    {
      env: { ...process.env, TEST_MEMORY_MB: "300" },
      encoding: "utf8",
      timeout: 30_000
    }
  )
  expect({ stopped: ran.status !== 0, said: ran.stderr.includes("memory guard: ") }).toEqual({
    stopped: true,
    said: true
  })
  expect(ran.stdout).not.toContain("not stopped")
})
