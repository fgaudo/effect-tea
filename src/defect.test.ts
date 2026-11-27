import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Match from "effect/Match"
import { CompositionDefect, defect, InvariantDefect, ProgramDefect } from "./defect.ts"

describe("defect", () => {
  test("throws an InvariantDefect that carries its reason, as its message too", () => {
    const thrown = (() => {
      try {
        return defect("A save completed while nothing was saving")
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(InvariantDefect)
    expect(thrown).toMatchObject({
      _tag: "InvariantDefect",
      reason: "A save completed while nothing was saving",
      message: "A save completed while nothing was saving"
    })
  })

  test("is an expression of type never, for a branch of a ternary or a Match", () => {
    expectTypeOf(defect).returns.toBeNever()
    const saved = (saving: boolean): number => saving ? 1 : defect("A save completed while nothing was saving")
    expect(saved(true)).toBe(1)
  })
})

describe("the defect classes", () => {
  // A private constructor fails both checks: the `toThrow` of jest's types asks for the first.
  test("are taken where a class is asked for, by a public construct signature and by Match.instanceOf", () => {
    type Constructable = new(...args: Array<any>) => any
    expectTypeOf(InvariantDefect).toExtend<Constructable>()
    expectTypeOf(ProgramDefect).toExtend<Constructable>()
    expectTypeOf(CompositionDefect).toExtend<Constructable>()
    const where = Match.type<unknown>().pipe(
      Match.when(Match.instanceOf(ProgramDefect), (died) => died.where),
      Match.when(Match.instanceOf(CompositionDefect), (died) => died.child),
      Match.when(Match.instanceOf(InvariantDefect), (died) => died.reason),
      Match.orElse(() => "elsewhere")
    )
    const thrown = (() => {
      try {
        return defect("A save completed while nothing was saving")
      } catch (error) {
        return error
      }
    })()
    expect(where(thrown)).toBe("A save completed while nothing was saving")
  })
})
