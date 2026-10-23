import * as Data from 'effect/Data'

/**
 * Where a defect happened: in one of the program's functions (`update`, `subscriptions`, `describeMessage`,
 * `describeCommand`, `onApplied`), in a command (its `runCommand` included), in a subscription, or in the
 * renderer (its view and `makeModel` included, since a frame's model is made when the renderer reads it).
 */
export type DefectSite =
  | 'update'
  | 'subscriptions'
  | 'subscription'
  | 'command'
  | 'describeMessage'
  | 'describeCommand'
  | 'onApplied'
  | 'render'

const described: Readonly<Record<DefectSite, string>> = {
  update: 'update',
  subscriptions: 'subscriptions',
  subscription: 'a subscription',
  command: 'a command',
  describeMessage: 'describeMessage',
  describeCommand: 'describeCommand',
  onApplied: 'onApplied',
  render: 'the renderer, its view or makeModel',
}

type Fields = Readonly<{
  where: DefectSite
  /** The defect itself: what was thrown, or given to `Effect.die`. */
  cause: unknown
  /** The subscription's key, for a defect in a subscription. It may hold data, as a key may. */
  key?: unknown
}>

/**
 * The defect a run dies with: the one that happened, as its `cause`, and where it happened, which only the run
 * knows. The run logs nothing about it: reporting it is the job of whoever runs the program.
 */
export class ProgramDefect extends Data.TaggedError('ProgramDefect')<Fields & Readonly<{ message: string }>> {
  constructor(fields: Fields) {
    super({ ...fields, message: `A defect in ${described[fields.where]}` })
  }
}
