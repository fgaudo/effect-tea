// A view draws a model and sends its program's messages through `dispatch`. A parent's view gives each child's
// view a dispatch of its own, which wraps the child's messages as the parent receives them. Kept while anyone
// holds it, it is the same function in every frame, so that a renderer can skip a child whose model has not
// changed.
import type * as Effect from 'effect/Effect'

/**
 * Sends a message to the running program: `update` decides what it means in the state it finds. Running it needs
 * no services and completes synchronously, whatever runs it: it only hands the message to the run, which handles
 * it in its own fiber, with the services and the scheduler it started with. A renderer whose handlers are plain
 * callbacks runs it at once with `Effect.runSync`, or with a runtime of its own.
 */
export type Dispatch<Message> = (message: Message) => Effect.Effect<void>

/** A pure view, independent of the renderer: `Node` is what the renderer draws. */
export type View<Model, Message, Node> = (model: Model, dispatch: Dispatch<Message>) => Node

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
 * The dispatches made for one child of one parent dispatch, by id. Each is held weakly: a function nobody holds
 * can be made anew, since nobody can tell it from the old one, while one that a renderer keeps to compare with
 * stays the same. The dead references are swept once every as many calls as there were live ones after the last
 * sweep (64 at least): the entries stay fewer than twice the live ones, the sweeps cost a constant time per call,
 * and what a list showed at its longest is let go once it is shorter, since showing it again counts too.
 */
type Made = { readonly byId: Map<unknown, WeakRef<Dispatch<unknown>>>; calls: number; sweepAt: number }

const alone = Symbol('alone')

const made = new WeakMap<object, Map<string, Made>>()

const madeFor = (dispatch: object, name: string): Made => {
  let byName = made.get(dispatch)
  if (byName === undefined) {
    byName = new Map()
    made.set(dispatch, byName)
  }
  let child = byName.get(name)
  if (child === undefined) {
    child = { byId: new Map(), calls: 0, sweepAt: 64 }
    byName.set(name, child)
  }
  return child
}

const sweep = (child: Made) => {
  child.calls += 1
  if (child.calls < child.sweepAt) return
  child.calls = 0
  for (const [key, ref] of child.byId) if (ref.deref() === undefined) child.byId.delete(key)
  child.sweepAt = Math.max(64, child.byId.size)
}

/**
 * The dispatch of a parent's child, for its view: `dispatchTo(dispatch, 'Clock')`, or
 * `dispatchTo(dispatch, 'Row', id)` for children by id. It wraps each message as the parent receives it, and is
 * the same function every time it is asked for with the same parent dispatch, so that a view drawn with it can
 * be memoized.
 */
// `Name` is checked by the result rather than by a constraint on `Message`: with such a constraint, a dispatch that
// is itself a call of `dispatchTo` (a grandchild's) would make `Message` be inferred as `unknown`.
export const dispatchTo = <Message, Name extends string>(
  dispatch: Dispatch<Message>,
  name: Name,
  ...id: IdOf<Message, Name>
): ChildDispatch<Message, Name> => {
  const child = madeFor(dispatch, name)
  sweep(child)
  const key = id.length === 0 ? alone : id[0]
  const found = child.byId.get(key)?.deref()
  if (found !== undefined) return found as ChildDispatch<Message, Name>
  const wrapping: Dispatch<unknown> = (message) =>
    dispatch((id.length === 0 ? { _tag: name, message } : { _tag: name, id: id[0], message }) as never)
  child.byId.set(key, new WeakRef(wrapping))
  return wrapping as ChildDispatch<Message, Name>
}
