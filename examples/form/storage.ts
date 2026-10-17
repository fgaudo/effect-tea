import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as Effect from 'effect/Effect'

export class StorageError extends Data.TaggedError('StorageError')<{ readonly cause: unknown }> {}

/** Where the form saves names. The program only knows this interface: `main.ts` and the tests provide it. */
export class Storage extends Context.Service<
  Storage,
  { readonly save: (name: string) => Effect.Effect<void, StorageError> }
>()('examples/form/Storage') {}
