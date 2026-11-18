import { describe, expect, test } from 'bun:test'
import { CompositionDefect, defect, InvariantDefect, ProgramDefect } from './defect.ts'

describe('defect', () => {
  test('throws an InvariantDefect that carries its reason, as its message too', () => {
    const thrown = (() => {
      try {
        return defect('A save completed while nothing was saving')
      } catch (error) {
        return error
      }
    })()
    expect(thrown).toBeInstanceOf(InvariantDefect)
    expect(thrown).toMatchObject({
      _tag: 'InvariantDefect',
      reason: 'A save completed while nothing was saving',
      message: 'A save completed while nothing was saving',
    })
  })
})

describe('the defect classes', () => {
  // Never called: a constructor's privacy is a rule of the types alone.
  test('are built by the library alone: a consumer can neither construct one nor extend it', () => {
    const constructed = () => [
      // @ts-expect-error: only `defect` builds an InvariantDefect.
      new InvariantDefect('A save completed while nothing was saving'),
      // @ts-expect-error: only the run builds a ProgramDefect.
      new ProgramDefect({ where: 'update', cause: 'boom' }),
      // @ts-expect-error: only `program` builds a CompositionDefect.
      new CompositionDefect({ message: 'Broken', child: 'Page' }),
    ]
    const extended = () => [
      // @ts-expect-error: nor does a subclass of one.
      class extends InvariantDefect {},
      // @ts-expect-error: likewise.
      class extends ProgramDefect {},
      // @ts-expect-error: likewise.
      class extends CompositionDefect {},
    ]
    expect([constructed, extended]).toHaveLength(2)
  })
})
