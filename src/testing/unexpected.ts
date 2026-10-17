import { describeByTag } from '../log.ts'

/** What fails a test when `update` rejects the message at `index` of the ones the test sends. */
export const unexpectedRejection = (index: number, message: unknown): Error =>
  new Error(`update rejected message ${index} (${String(describeByTag(message))})`)
