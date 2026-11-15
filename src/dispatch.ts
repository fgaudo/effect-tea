// A view draws a model and sends its program's messages through `dispatch`. A parent's view gives each child's
// view a dispatch of its own, which wraps the child's messages as the parent receives them. Kept while anyone
// holds it, it is the same function in every frame, so that a renderer can skip a child whose model has not
// changed.
import type * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Hash from 'effect/Hash'

/**
 * Sends a message to the running program: `update` decides what it means in the state it finds. Running it needs
 * no services and completes synchronously, whatever runs it: it only hands the message to the run, which handles
 * it in its own fiber, with the services and the scheduler it started with. A renderer whose handlers are plain
 * callbacks runs it at once with `Effect.runSync`, or with a runtime of its own. It returns the number of the
 * message among those dispatched, from 1, in the order the run takes them: a frame whose `seen` is below it
 * was made before the run took the message.
 */
export type Dispatch<Message> = (message: Message) => Effect.Effect<number>

/**
 * A parent's messages that carry a child's: `{ _tag: <child>, message }`, with `id` for children by id, and
 * nothing else. A message of the parent's own that has a `message` field among others is not one: wrapping only
 * that field would leave the rest out.
 */
type Routed<Message> = Message extends Readonly<{ _tag: string; message: unknown }>
  ? [Exclude<keyof Message, '_tag' | 'message' | 'id'>] extends [never] ? Message : never
  : never

type ChildOf<Message, Name> = Extract<Routed<Message>, Readonly<{ _tag: Name }>>

/** The id a child by id is addressed with; nothing for a child that is alone, or for a name that is no child's. */
type IdOf<Message, Name> = [ChildOf<Message, Name>] extends [never] ? []
  : ChildOf<Message, Name> extends Readonly<{ id: infer Id }> ? [id: Id]
  : []

/**
 * A child's dispatch, or, for a name that is no child's or that is any string, a value that cannot be called
 * and says why.
 */
type ChildDispatch<Message, Name extends string> = string extends Name
  ? Readonly<{ 'is not the literal name of a child': Name }>
  : [ChildOf<Message, Name>] extends [never] ? Readonly<{ 'is not a child': Name }>
  : Dispatch<ChildOf<Message, Name>['message']>

/**
 * The dispatches made for one child of one parent dispatch, by id, compared with `Equal` as the engine compares
 * subscription keys, in buckets by the id's `Hash`. Each is held weakly: a function nobody holds can be made anew,
 * since nobody can tell it from the old one, while one that a renderer keeps to compare with stays the same. Once one
 * is collected, its entry goes too, so that ids nobody shows any more cost nothing.
 */
type Entry = Readonly<{ key: unknown; ref: WeakRef<Dispatch<unknown>> }>

type Made = Map<number, Array<Entry>>

const alone = Symbol('alone')

const made = new WeakMap<object, Map<string, Made>>()

const drop = (byId: Made, hash: number, entry: Entry) => {
  const bucket = byId.get(hash)
  const at = bucket?.indexOf(entry) ?? -1
  if (bucket === undefined || at === -1) return
  bucket.splice(at, 1)
  if (bucket.length === 0) byId.delete(hash)
}

// Run in a host job, outside any run, where an id's `Equal` or `Hash` that throws would be no defect of a run: the
// entry is found by its hash, computed as it was made, and by its identity, so that no id is compared here.
const forgotten = new FinalizationRegistry<Readonly<{ byId: Made; hash: number; entry: Entry }>>(
  ({ byId, hash, entry }) => drop(byId, hash, entry),
)

const madeFor = (dispatch: object, name: string): Made => {
  let byName = made.get(dispatch)
  if (byName === undefined) {
    byName = new Map()
    made.set(dispatch, byName)
  }
  let byId = byName.get(name)
  if (byId === undefined) {
    byId = new Map()
    byName.set(name, byId)
  }
  return byId
}

/** How many entries `dispatchTo` keeps for the children `name` of `dispatch`: for the tests of its cleanup only. */
export const entriesOf = (dispatch: object, name: string): number => {
  let count = 0
  for (const bucket of made.get(dispatch)?.get(name)?.values() ?? []) count += bucket.length
  return count
}

/**
 * The dispatch of a child, or of an input, for its view: `dispatchTo(dispatch, 'Clock')`, or
 * `dispatchTo(dispatch, 'Row', id)` for children by id. It wraps each message as the composed program receives it,
 * and is the same function every time it is asked for with the same dispatch, so that a view drawn with it can be
 * memoized.
 */
// `Name` is checked by the result rather than by a constraint on `Message`: with such a constraint, a dispatch that
// is itself a call of `dispatchTo` (a grandchild's) would make `Message` be inferred as `unknown`.
export const dispatchTo = <Message, Name extends string>(
  dispatch: Dispatch<Message>,
  name: Name,
  ...id: IdOf<Message, Name>
): ChildDispatch<Message, Name> => {
  const byId = madeFor(dispatch, name)
  const key = id.length === 0 ? alone : id[0]
  const hash = Hash.hash(key)
  const old = byId.get(hash)?.find((entry) => Equal.equals(key, entry.key))
  const found = old?.ref.deref()
  if (found !== undefined) return found as ChildDispatch<Message, Name>
  // The entry of a collected dispatch whose callback has not run yet: the new one takes its place, and the callback
  // finds nothing to drop.
  if (old !== undefined) drop(byId, hash, old)
  const wrapping: Dispatch<unknown> = (message) =>
    dispatch((id.length === 0 ? { _tag: name, message } : { _tag: name, id: id[0], message }) as never)
  const entry: Entry = { key, ref: new WeakRef(wrapping) }
  const bucket = byId.get(hash)
  if (bucket === undefined) byId.set(hash, [entry])
  else bucket.push(entry)
  forgotten.register(wrapping, { byId, hash, entry })
  return wrapping as ChildDispatch<Message, Name>
}
