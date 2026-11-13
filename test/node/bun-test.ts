// What the tests import of `bun:test`, over Node's own runner: `bun run test:node` resolves `bun:test` to this
// module (`register.ts`), so that the same test files run on V8. Only what the tests use is here: a test that
// needs more of `bun:test` fails on Node until it is added.
import * as NodeTest from 'node:test'
import { format } from 'node:util'
import { expect } from 'expect'

type Body<Args extends ReadonlyArray<unknown>> = (...args: Args) => unknown

// A body is never given Node's own arguments (its context, or a callback when it declares two parameters).
const test = (name: string, body: Body<[]>, timeout?: number): void => {
  void NodeTest.test(name, timeout === undefined ? {} : { timeout }, async () => {
    await body()
  })
}

const placeholders = /%[sdifjoOp#]/g

// A row that is an array is spread into the body's arguments, as `bun:test` does, and a name takes only as many
// of them as it has placeholders.
test.each =
  <Row>(rows: ReadonlyArray<Row>) =>
  (name: string, body: Body<Array<unknown>>, timeout?: number): void => {
    for (const row of rows) {
      const args: Array<unknown> = Array.isArray(row) ? row : [row]
      const named = args.slice(0, name.match(placeholders)?.length ?? 0)
      test(format(name, ...named), () => body(...args), timeout)
    }
  }

const describe = (name: string, body: () => void): void => {
  void NodeTest.describe(name, body)
}

const hook =
  (register: (body: () => Promise<void>) => void) =>
  (body: Body<[]>): void =>
    register(async () => {
      await body()
    })

const beforeAll = hook(NodeTest.before)
const afterAll = hook(NodeTest.after)
const beforeEach = hook(NodeTest.beforeEach)
const afterEach = hook(NodeTest.afterEach)

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test }
