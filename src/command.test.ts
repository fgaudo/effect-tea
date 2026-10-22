import { describe, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Opt from 'effect/Option'
import { attempt } from './command.ts'

const handlers = { onSuccess: (value: number) => `got ${value}`, onFailure: (error: string) => `failed: ${error}` }

describe('attempt', () => {
  test('a success becomes the success message', async () => {
    expect(await Effect.runPromise(attempt(Effect.succeed(1), handlers))).toEqual(Opt.some('got 1'))
  })

  test('an expected failure becomes the failure message', async () => {
    expect(await Effect.runPromise(attempt(Effect.fail('offline'), handlers))).toEqual(Opt.some('failed: offline'))
  })

  test('given the handlers alone, it answers in a pipe as it does called directly', async () => {
    const succeeded = Effect.succeed(1).pipe(attempt(handlers))
    const failed = Effect.fail('offline').pipe(attempt(handlers))
    expect(await Effect.runPromise(succeeded)).toEqual(Opt.some('got 1'))
    expect(await Effect.runPromise(failed)).toEqual(Opt.some('failed: offline'))
  })

  test('given the handlers alone, it ends an Effect.fn, which infers what they receive', async () => {
    const save = Effect.fn('save')(
      function*(name: string) {
        if (name === '') {
          return yield* Effect.fail('empty' as const)
        }
        return name.length
      },
      attempt({ onSuccess: (length) => `saved ${length}`, onFailure: (error) => `failed: ${error}` }),
    )
    expect(await Effect.runPromise(save('Ada'))).toEqual(Opt.some('saved 3'))
    expect(await Effect.runPromise(save(''))).toEqual(Opt.some('failed: empty'))
  })
})
