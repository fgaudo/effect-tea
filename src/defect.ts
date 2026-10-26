import * as Data from 'effect/Data'

/**
 * Where a defect happened: in one of the program's functions (`update`, `subscriptions`, `describeMessage`,
 * `describeCommand`, `onApplied`, `onIgnored`), in a command (its `runCommand` included), in a subscription, or in
 * the renderer (its view and `makeModel` included, since a frame's model is made when the renderer reads it).
 */
export type DefectSite =
  | 'update'
  | 'subscriptions'
  | 'subscription'
  | 'command'
  | 'describeMessage'
  | 'describeCommand'
  | 'onApplied'
  | 'onIgnored'
  | 'render'

const described: Readonly<Record<DefectSite, string>> = {
  update: 'update',
  subscriptions: 'subscriptions',
  subscription: 'a subscription',
  command: 'a command',
  describeMessage: 'describeMessage',
  describeCommand: 'describeCommand',
  onApplied: 'onApplied',
  onIgnored: 'onIgnored',
  render: 'the renderer, its view or makeModel',
}

type Fields = Readonly<{
  where: DefectSite
  /** The defect itself: what was thrown, or given to `Effect.die`. */
  cause: unknown
  /** The subscription's key, for a defect in a subscription. It may hold data, as a key may. */
  key?: unknown
  /**
   * The message `update` was given, for a defect in `update`, by its tags as the logs describe it by default
   * (`Home › Products › Deleted`): never its data.
   */
  on?: unknown
}>

/**
 * The defect a run dies with: the one that happened, as its `cause`, and where it happened, which only the run
 * knows, with the message it happened on for one in `update`. The run logs nothing about it: reporting it is
 * the job of whoever runs the program.
 */
export class ProgramDefect extends Data.TaggedError('ProgramDefect')<Fields & Readonly<{ message: string }>> {
  constructor(fields: Fields) {
    super({
      ...fields,
      message: `A defect in ${described[fields.where]}${fields.on === undefined ? '' : ` on ${String(fields.on)}`}`,
    })
  }
}

/**
 * A parent breaking what it declared of a child, raised as it happens (in `update`, `makeModel`, `subscriptions`
 * or `runCommand`, which the run then dies in): an external message to a child that is not there, or that
 * rejects it; the model of a child that is not there; an event, a command or a subscription key that nothing
 * handles. `child` names the child, and `id` its id for a child by id.
 */
export class CompositionDefect extends Data.TaggedError('CompositionDefect')<
  Readonly<{ message: string; child: string; id?: unknown }>
> {}
