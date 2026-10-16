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
})
