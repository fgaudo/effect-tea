// A view draws a model and sends its program's messages through `dispatch`. A parent's view gives each child's
// view a dispatch of its own, which wraps the child's messages as the parent receives them. Kept while anyone
// holds it, it is the same function in every frame, so that a renderer can skip a child whose model has not
// changed.
import type * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Hash from 'effect/Hash'

/**
 * Sends a message to the running program.
 *
 * @param message - One of the program's messages.
 * @returns An effect that sends it, and gives the message's number among those dispatched.
 *
 * @example
 * ```ts
 * button.addEventListener('click', () => Effect.runSync(dispatch({ _tag: 'Increment' })))
 * ```
 *
 * @remarks
 * From the guide, "View", "`dispatch` takes the program's messages":
 *
 * **`dispatch` takes the program's messages.** Sending one returns an `Effect<number>`. That effect needs no services
 * and completes synchronously.
 *
 * From the guide, "View", "A handler may run it either way":
 *
 * **A handler may run it either way.** A renderer whose handlers are plain callbacks, like snabbdom's, runs it at once
 * with `Effect.runSync(dispatch(message))`. It may also run it with a runtime of its own. Either is right.
 *
 * From the guide, "View", "Sending only hands the message to the run":
 *
 * **Sending only hands the message to the run.** The run handles the message in its own fiber, with its own services,
 * on the scheduler it started with. So a handler returns before `update` has seen its message.
 *
 * From the guide, "View", "The number a dispatch returns":
 *
 * **The number a dispatch returns.** It is the message's number among those dispatched. The numbers start from 1. They
 * follow the order in which the run takes the messages.
 *
 * From the guide, "View", "A frame's `seen`":
 *
 * **A frame's `seen`.** Each frame says in `seen` how many of the dispatched messages the run had taken when the
 * frame's state was made. So a frame whose `seen` is below a message's number was made before the run took that
 * message.
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

/** How many entries `forwardTo` keeps for the children `name` of `dispatch`: for the tests of its cleanup only. */
export const entriesOf = (dispatch: object, name: string): number => {
  let count = 0
  for (const bucket of made.get(dispatch)?.get(name)?.values() ?? []) count += bucket.length
  return count
}

/**
 * The dispatch of a child, or of an input, for its view: it forwards each message to `dispatch`, wrapped.
 *
 * @param dispatch - The dispatch of the program that declares the child or the input.
 * @param name - The child's or the input's name, as a literal.
 * @param id - The child's id, for children by id, and nothing otherwise.
 * @returns A dispatch of the child's own messages, or of what is written into the input, which wraps each as the
 * program receives it. A name that is no child's, or that is not a literal, gives a value that cannot be called and
 * says why.
 *
 * @example
 * ```ts
 * thunk('main', 'clock', clockView, [model.clock, forwardTo(dispatch, 'Clock')])
 * ```
 *
 * @remarks
 * From the guide, "Composition", "A child's view gets a dispatch of its own":
 *
 * **A child's view gets a dispatch of its own.** It sends the child's own messages: `forwardTo(dispatch, 'Clock')`
 * wraps them as the parent receives them.
 *
 * From the guide, "Composition", "That dispatch is the same function in every frame":
 *
 * **That dispatch is the same function in every frame.** It is the same every time it is asked for with the same
 * dispatch, name and id. So a view memoized on its model and its dispatch is drawn again only when its model changes.
 *
 * From the guide, "Composition", "A grandchild's dispatch is made from its parent's":
 *
 * **A grandchild's dispatch is made from its parent's**: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`. A view
 * usually writes it in two steps, each view taking the dispatch its parent gave it.
 *
 * From the guide, "Composition", "`children.Row(state, id)` is a row's model":
 *
 * **`children.Row(state, id)` is a row's model**, and `forwardTo(dispatch, 'Row', id)` its dispatch.
 *
 * From the guide, "Composition", "Ids are compared by value,":
 *
 * **Ids are compared by value,** with `Equal`, wherever they go (subscription keys, dispatches): strings, numbers, or
 * tuples and structs of them.
 *
 * From the guide, "Inputs the user types into", "The view writes over the value its model holds":
 *
 * **The view writes over the value its model holds**: `{ _tag: 'Written', was: model.name, value: text }`, through
 * `forwardTo(dispatch, 'Name')`.
 */
// `Name` is checked by the result rather than by a constraint on `Message`: with such a constraint, a dispatch that
// is itself a call of `forwardTo` (a grandchild's) would make `Message` be inferred as `unknown`.
export const forwardTo = <Message, Name extends string>(
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
