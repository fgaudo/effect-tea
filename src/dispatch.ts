// A dispatch is a plain function, which applies its message before it returns, or, where another message is being
// applied, right after that one. A view draws a model and sends its program's messages through `dispatch`. A parent's
// view gives each child's view a dispatch of its own, which wraps the child's messages as the parent receives them,
// with the instance they are for where the view names it. Kept while anyone holds it, it is the same function every
// time it is asked for, so that a renderer can skip a child whose model has not changed.
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"

/**
 * Applies a message to the running program before it returns, or, where another message is being applied, right after
 * that one, and returns nothing.
 *
 * - It needs no services. A handler of any renderer calls it as it is. Effect code calls it in an `Effect.sync`.
 * - When a handler returns, `update` has seen its message, and the model is the new one. What the message starts, its
 *   commands and its subscriptions, starts in the run, after the step: whether before the handler returns or after it
 *   is unspecified.
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
 * @see The guide, "View".
 */
export type Dispatch<Message> = (message: Message) => void

/**
 * A parent's messages that carry a child's: `{ _tag: <child>, message }`, with `id` for children by id, the optional
 * `instance` that it is for, and nothing else. A message of the parent's own that has a `message` field among others is
 * not one: wrapping only that field would leave the rest out.
 */
type Routed<Message> = Message extends Readonly<{ _tag: string; message: unknown }>
  ? [Exclude<keyof Message, "_tag" | "message" | "id" | "instance">] extends [never] ? Message : never
  : never

type ChildOf<Message, Name> = Extract<Routed<Message>, Readonly<{ _tag: Name }>>

/** The id a child by id is addressed with; nothing for a child alone, or for a name that is no child's. */
type IdOf<Message, Name> = [ChildOf<Message, Name>] extends [never] ? []
  : ChildOf<Message, Name> extends Readonly<{ id: infer Id }> ? [id: Id]
  : []

/**
 * A child's message without its `message`, which names the instance it is for: what `forwardTo` takes in place of a
 * name.
 */
type OfInstance = Readonly<{ _tag: string; instance: number; id?: unknown }>

/** The name of the child that `forwardTo` is given: the name itself, or the `_tag` of what names an instance. */
type NameOf<To> = [To] extends [string] ? To : To extends Readonly<{ _tag: infer Name extends string }> ? Name : never

/** Whether a name is one of several: the messages of the children it could name would be mixed up. */
type IsUnion<Name, Whole = Name> = Name extends unknown ? [Whole] extends [Name] ? false : true : never

// An id written in the call is inferred under `const`, readonly at every depth, where the type of the child's id may
// not say `readonly`. No value is ever mutated, so it is compared with that type made readonly alike.
type Frozen<Id> = Id extends (...args: never) => unknown ? Id
  : Id extends object ? { readonly [K in keyof Id]: Frozen<Id[K]> }
  : Id

/**
 * The dispatch of a child, or a value that cannot be called and says why: for a name that is no child's, or that is
 * any string or one of several names; for an instance named without the id of a child by id, or with an id where its
 * child is alone; and for an instance of a message that names none, where nothing would read it.
 */
type ChildDispatch<Message, To extends string | OfInstance> = string extends NameOf<To>
  ? Readonly<{ "is not the literal name of a child": NameOf<To> }>
  : IsUnion<NameOf<To>> extends true ? Readonly<{ "is not the literal name of a child": NameOf<To> }>
  : [ChildOf<Message, NameOf<To>>] extends [never] ? Readonly<{ "is not a child": NameOf<To> }>
  : [To] extends [string] ? Dispatch<ChildOf<Message, NameOf<To>>["message"]>
  : "instance" extends keyof ChildOf<Message, NameOf<To>>
    ? IdOf<Message, NameOf<To>> extends [id: infer Id]
      ? [To] extends [Readonly<{ id: Frozen<Id> }>] ? Dispatch<ChildOf<Message, NameOf<To>>["message"]>
      : Readonly<{ "is a child by id, and its instance is named with its id": NameOf<To> }>
    : "id" extends keyof To ? Readonly<{ "is a child alone, and its instance is named with no id": NameOf<To> }>
    : Dispatch<ChildOf<Message, NameOf<To>>["message"]>
  : Readonly<{ "is a message that names no instance": NameOf<To> }>

/**
 * The dispatches made for one child of one parent dispatch, by id and by the instance they name, the id compared with
 * `Equal` as the engine compares subscription keys, in buckets by the id's `Hash`. Each is held weakly: a function
 * nobody holds can be made anew, since nobody can tell it from the old one, while one that a renderer keeps to compare
 * with stays the same. Once one is collected, its entry goes too, so that ids and instances nobody shows any more cost
 * nothing.
 */
type Entry = Readonly<{ key: unknown; instance: number | undefined; ref: WeakRef<Dispatch<unknown>> }>

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

// The entry is found by its hash, computed as it was made, and by its identity: the entries of a bucket may hold ids
// equal by `Equal`, which differ by their instance alone.
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
 * The dispatch of a child, for its view: it forwards each message to `dispatch`, wrapped.
 *
 * - Given the child's name, each message reaches the instance that is there when it is sent.
 * - Given an instance, `{ _tag: name, instance }`, with `id` for children by id, each message names that instance, as
 *   the answer of a command does: once the child has started again, `update` rejects it. In `makeModel`,
 *   `children.About.instance()` gives the number.
 * - It is the same function every time it is asked for with the same dispatch, name, id and instance. So a view
 *   memoized on its model and its dispatch is drawn again only when its model changes.
 * - Ids are compared by value, with `Equal`.
 * - A grandchild's dispatch is made from its parent's: `forwardTo(forwardTo(dispatch, 'Home'), 'Products')`.
 *
 * @param dispatch - The dispatch of the program that declares the child.
 * @param to - The child's name, as a literal, or an instance of the child: its name, the number of the instance, and
 * its id for children by id.
 * @param id - The id, for children by id given by their name, and nothing otherwise.
 * @returns A dispatch of the child's own messages, which wraps each as the program receives it. A name that is no
 * child's, or that is not one literal, as a union of two names, gives a value that cannot be called and says why,
 * unless a message of the program's own has the shape `{ _tag: name, message }`. So does an instance named without
 * the id of a child by id, or with an id where its child is alone, and an instance of a message whose type has no
 * `instance`.
 *
 * @example
 * ```ts
 * thunk('main', 'clock', clockView, [model.clock, forwardTo(dispatch, 'Clock')])
 * ```
 *
 * @example
 * ```ts
 * const { instance, model } = page.about
 * thunk('main', instance, aboutView, [model, forwardTo(dispatch, { _tag: 'About', instance })])
 * ```
 *
 * @see The guide, "Composition".
 */
// What `to` names is checked by the result rather than by a constraint on `Message`: with such a constraint, a
// dispatch that is itself a call of `forwardTo` (a grandchild's) would make `Message` be inferred as `unknown`. `const`
// keeps the tag of an instance written in the call a literal.
export const forwardTo = <Message, const To extends string | OfInstance>(
  dispatch: Dispatch<Message>,
  to: To,
  ...id: [To] extends [string] ? IdOf<Message, To> : []
): ChildDispatch<Message, To> => {
  // Read with no object made: a view asks for its children's dispatches in every draw.
  const named: OfInstance | undefined = typeof to === "string" ? undefined : to
  const name = named === undefined ? to as string : named._tag
  const hasId = named === undefined ? id.length > 0 : Object.hasOwn(named, "id")
  const key = !hasId ? alone : named === undefined ? id[0] : named.id
  const instance = named?.instance
  const byId = madeFor(dispatch, name)
  const hash = Hash.hash(key)
  const old = byId.get(hash)?.find((entry) => entry.instance === instance && Equal.equals(key, entry.key))
  const found = old?.ref.deref()
  if (found !== undefined) return found as ChildDispatch<Message, To>
  // The entry of a collected dispatch whose callback has not run yet: the new one takes its place, and the callback
  // finds nothing to drop.
  if (old !== undefined) drop(byId, hash, old)
  // What each message is wrapped in: the child's name, its id for a child by id, and the instance where one is named,
  // and nothing else of an object that names an instance.
  const wrap = { _tag: name, ...(hasId ? { id: key } : {}), ...(instance === undefined ? {} : { instance }) }
  const wrapping: Dispatch<unknown> = (message) => dispatch({ ...wrap, message } as never)
  const entry: Entry = { key, instance, ref: new WeakRef(wrapping) }
  const bucket = byId.get(hash)
  if (bucket === undefined) byId.set(hash, [entry])
  else bucket.push(entry)
  forgotten.register(wrapping, { byId, hash, entry })
  return wrapping as ChildDispatch<Message, To>
}
