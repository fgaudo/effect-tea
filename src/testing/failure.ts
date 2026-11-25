import * as Inspectable from "effect/Inspectable"
import { describeByTag } from "../log.ts"

/** How the text of a tool's error names a value: a key as it prints, a message or a command by its tags. */
export type Names = Readonly<{ key: (key: unknown) => string; tags: (value: unknown) => string }>

// What stands in the text for a value that threw as it was named.
const unnamed = "<a value that threw as it was named: see the cause>"

/**
 * The error a tool fails a test with, whose text names values of the program or of the test by `names`. A value that
 * throws as it is named is a failure of the test, no defect of the program, and neither is lost: the error comes
 * first, and what was thrown is its `cause`, all of it, in order. So it throws nothing, wherever it is made.
 */
export const failure = (text: (names: Names) => string): Error => {
  const thrown: Array<unknown> = []
  const guarded = (name: (value: unknown) => string) => (value: unknown): string => {
    try {
      return name(value)
    } catch (threw) {
      thrown.push(threw)
      return unnamed
    }
  }
  const said = text({
    key: guarded((key) => Inspectable.toStringUnknown(key, 0)),
    tags: guarded((value) => String(describeByTag(value)))
  })
  const [first] = thrown
  return thrown.length === 0
    ? new Error(said)
    : new Error(said, { cause: thrown.length === 1 ? first : new AggregateError(thrown, "What the values threw") })
}

/** What fails a test when `update` rejects the message at `index` of the ones the test sends. */
export const unexpectedRejection = (index: number, message: unknown): Error =>
  failure(({ tags }) => `update rejected message ${index} (${tags(message)})`)
