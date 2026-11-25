// The bridges' tests in real browsers, Chromium, Firefox and WebKit, by Vitest's browser mode over Playwright:
// `bun run test:browsers`. The tests are those `bun test` runs on happy-dom, unchanged: `bun:test` is Vitest, whose
// `describe`, `test` and `expect` they use alike, and happy-dom's registrator is one that registers nothing.
import { playwright } from "@vitest/browser-playwright"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const path = (relative: string) => fileURLToPath(new URL(`../../${relative}`, import.meta.url))

export default defineConfig({
  root: path(""),
  resolve: {
    alias: [
      { find: /^bun:test$/, replacement: "vitest" },
      { find: /^@happy-dom\/global-registrator$/, replacement: path("tools/browser/happy-dom.ts") },
      { find: /^@fgaudo\/effect-tea$/, replacement: path("src/index.ts") },
      { find: /^@fgaudo\/effect-tea\/testing$/, replacement: path("src/testing/index.ts") },
      { find: /^@fgaudo\/effect-tea\/snabbdom$/, replacement: path("bridges/snabbdom.ts") },
      { find: /^@fgaudo\/effect-tea\/snabbdom\/testing$/, replacement: path("bridges/snabbdom-testing.ts") },
      { find: /^@fgaudo\/effect-tea\/react$/, replacement: path("bridges/react.ts") }
    ]
  },
  test: {
    include: [
      "bridges/snabbdom.test.ts",
      "bridges/react.test.ts",
      "bridges/browser.test.ts",
      "bridges/fast-refresh.test.ts"
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }]
    }
  }
})
