// A dispatch is a plain function, which applies its message before it returns. A view draws a model and sends its
// program's messages through `dispatch`. A parent's view gives each child's view a dispatch of its own, which wraps the
// child's messages as the parent receives them. Kept while anyone holds it, it is the same function every time it is
// asked for, so that a renderer can skip a child whose model has not changed.
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"

/**
 * Applies a message to the running program, before it returns, and returns nothing.
 *
 * - It needs no services. A handler of any renderer calls it as it is. Effect code calls it in an `Effect.sync`.
 * - When a handler returns, `update` has seen its message, and the model is the new one. What the message starts, its
 *   commands and its subscriptions, runs later, in the run.
 * - One sent while another is being applied, as a renderer's listener sends one, is applied right after it, before
 *   the outer call returns.
 * - The program runs on the stack of whoever sends the message: a slow `update` holds up the handler that sent it.
 *
 * @param message - One of the program's messages.
 *
 * @example
 * ```ts
 * button.addEventListener('click', () => dispatch({ _tag: 'Increment' }))
 * ```
 *
 * @see The guide, "View", "`dispatch` takes the program's messages".
 * @see The guide, "View", "A handler calls it as it is".
 * @see The guide, "View", "Sending applies the message".
 */
export type Dispatch<Message> = (message: Message) => void

/**
 * A parent's messages that carry a child's: `{ _tag: <child>, message }`, with `id` for children by id, the optional
 * `instance` of an answer, and nothing else. A message of the parent's own that has a `message` field among others is
 * not one: wrapping only that field would leave the rest out.
 */
type Routed<Message> = Message extends Readonly<{ _tag: string; message: unknown }>
  ? [Exclude<keyof Message, "_tag" | "message" | "id" | "instance">] extends [never] ? Message : never
  : never

type ChildOf<Message, Name> = Extract<Routed<Message>, Readonly<{ _tag: Name }>>

/**
 * The id a child or an input by id is addressed with; nothing for one that is alone, or for a name that is neither a
 * child's nor an input's.
 */
type IdOf<Message, Name> = [ChildOf<Message, Name>] extends [never] ? []
  : ChildOf<Message, Name> extends Readonly<{ id: infer Id }> ? [id: Id]
  : []

/**
 * The dispatch of a child or of an input, or, for a name that is neither a child's nor an input's, or that is any
 * string, a value that cannot be called and says why.
 */
type ChildDispatch<Message, Name extends string> = string extends Name
  ? Readonly<{ "is not the literal name of a child or of an input": Name }>
  : [ChildOf<Message, Name>] extends [never] ? Readonly<{ "is not a child or an input": Name }>
  : Dispatch<ChildOf<Message, Name>["message"]>

/**
 * The dispatches made for one child of one parent dispatch, by id, compared with `Equal` as the engine compares
 * subscription keys, in buckets by the id's `Hash`. Each is held weakly: a function nobody holds can be made anew,
 * since nobody can tell it from the old one, while one that a renderer keeps to compare with stays the same. Once one
 * is collected, its entry goes too, so that ids nobody shows any more cost nothing.
 */
type Entry = Readonly<{ key: unknown; ref: WeakRef<Dispatch<unknown>> }>

type Made = Map<number, Array<Entry>>

const alone = Symbol("alone")

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
  ({ byId, hash, entry }) => drop(byId, hash, entry)
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
 * - It is the same function every time it is asked for with the same dispatch, name and id. So a view memoized on its
 *   model and its dispatch is drawn again only when its model changes.
 * - Ids are compared by value, with `Equal`.
 * - A grandchild's dispatch is made from its parent's: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`.
 * - An input's view sends a `Written` through it, with the value its element holds.
 *
 * @param dispatch - The dispatch of the program that declares the child or the input.
 * @param name - The child's or the input's name, as a literal.
 * @param id - The id, for children and inputs by id, and nothing otherwise.
 * @returns A dispatch of the child's own messages, or of what is written into the input, which wraps each as the
 * program receives it. A name that is neither a child's nor an input's, or that is not a literal, gives a value that
 * cannot be called and says why, unless a message of the program's own has the shape `{ _tag: name, message }`.
 *
 * @example
 * ```ts
 * thunk('main', 'clock', clockView, [model.clock, forwardTo(dispatch, 'Clock')])
 * ```
 *
 * @see The guide, "Composition", "A child's view gets a dispatch of its own".
 * @see The guide, "Composition", "That dispatch is the same function in every draw".
 * @see The guide, "Composition", "A grandchild's dispatch is made from its parent's".
 * @see The guide, "Composition", "`children.Row(id)` is a row's model".
 * @see The guide, "Composition", "Ids are compared by value".
 * @see The guide, "Inputs", "The view writes what the element holds".
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
