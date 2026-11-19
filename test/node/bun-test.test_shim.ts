// What the tests import of `bun:test`, over Node's own runner: `bun run test:node` resolves `bun:test` to this
// module (`register.test_hook.ts`), so that the same test files run on V8. Only what the tests use is here: a test that
// needs more of `bun:test` fails on Node until it is added.
import * as NodeTest from 'node:test'
import { inspect } from 'node:util'
import type { expectTypeOf as BunExpectTypeOf } from 'bun:test'
import { expect } from 'expect'

type Body<Args extends ReadonlyArray<unknown>> = (...args: Args) => unknown

// `node:test` waits for a test forever by default: a test that catches a regression only by hanging would hold the
// run for good. The default is `bun:test`'s.
const defaultTimeout = 5_000

// A body is never given Node's own arguments (its context, or a callback when it declares two parameters).
const test = (name: string, body: Body<[]>, timeout = defaultTimeout): void => {
  void NodeTest.test(name, { timeout }, async () => {
    await body()
  })
}

// A test that reproduces an open finding: it passes while its body fails, and fails once the body passes, as
// `bun:test`'s does.
test.failing = (name: string, body: Body<[]>, timeout?: number): void =>
  test(name, async () => {
    const failed = await Promise.resolve().then(body).then(() => false, () => true)
    if (!failed) throw new Error('This test is marked as failing, and it passed: remove the mark')
  }, timeout)

// `%p` as `bun:test` prints a value: a string in double quotes, anything else as Node inspects it, which differs from
// Bun's own printer only in the layout of objects and arrays.
const pretty = (value: unknown) => typeof value === 'string' ? JSON.stringify(value) : inspect(value, { depth: null })

const at = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>(
    (on, key) => typeof on === 'object' && on !== null && key in on ? (on as Record<string, unknown>)[key] : undefined,
    value,
  )

// A test's name as `bun:test` (1.4.4) makes it from a row's arguments, read in order: `%s` takes a string, `%d` and
// `%f` a number, `%i` an integer, `%j` and `%o` any value as JSON, `%p` any value printed; each takes the next
// argument, and leaves itself as it is when the argument is of another type. `%#` is the row's index and `%%` a
// percent sign, taking none; a `%` before any other character is dropped. Once the arguments run out, the rest of
// the name stays as it is. `$a.b` is that path of the first argument, when it is an object and holds it.
const nameOf = (name: string, args: ReadonlyArray<unknown>, index: number) => {
  let next = 0
  const placed = name.replace(/%(.)/gs, (placeholder, kind: string) => {
    if (next >= args.length) return placeholder
    if (kind === '#') return String(index)
    if (kind === '%') return '%'
    if (!'sdifjop'.includes(kind)) return kind
    const value = args[next++]
    switch (kind) {
      case 's':
        return typeof value === 'string' ? value : placeholder
      case 'd':
      case 'f':
        return typeof value === 'number' ? String(value) : placeholder
      case 'i':
        return Number.isInteger(value) ? String(value) : placeholder
      case 'p':
        return pretty(value)
      default:
        return JSON.stringify(value)
    }
  })
  const [first] = args
  if (typeof first !== 'object' || first === null) return placed
  return placed.replace(/\$([\w$]+(?:\.[\w$]+)*)/g, (path, on: string) => {
    const value = at(first, on)
    // oxlint-disable-next-line typescript/no-base-to-string -- an object is printed by `pretty`
    return value === undefined ? path : typeof value === 'object' && value !== null ? pretty(value) : String(value)
  })
}

// A row that is an array is spread into the body's arguments, as `bun:test` does.
const rowsOf = <Row>(rows: ReadonlyArray<Row>) =>
  rows.map((row, index) => {
    const args: Array<unknown> = Array.isArray(row) ? row : [row]
    return { args, index }
  })

test.each =
  <Row>(rows: ReadonlyArray<Row>) =>
  (name: string, body: Body<Array<unknown>>, timeout?: number): void => {
    for (const { args, index } of rowsOf(rows)) test(nameOf(name, args, index), () => body(...args), timeout)
  }

const describe = (name: string, body: () => void): void => {
  void NodeTest.describe(name, body)
}

describe.each =
  <Row>(rows: ReadonlyArray<Row>) =>
  (name: string, body: Body<Array<unknown>>): void => {
    for (const { args, index } of rowsOf(rows)) describe(nameOf(name, args, index), () => void body(...args))
  }

// What `expectTypeOf` checks, the compiler checks: at run time, as in `bun:test`, every assertion of it does nothing
// and returns what chains on.
const typeOnly: unknown = new Proxy(() => typeOnly, { get: () => typeOnly, apply: () => typeOnly })

const expectTypeOf = (() => typeOnly) as unknown as typeof BunExpectTypeOf

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

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, test }
