import * as Predicate from "effect/Predicate"

const tagOf = (value: unknown): string | undefined =>
  Predicate.hasProperty(value, "_tag") && typeof value._tag === "string" ? value._tag : undefined

// A parent wraps a child's message as `{ _tag: <child>, instance, message }`, and its command as
// `{ _tag, instance, command }`, with an `id` too for children by id. A program's own value may have a field of that
// name too, holding data: only a tagged value is followed.
const wrappedOf = (value: unknown): unknown =>
  Predicate.hasProperty(value, "message") && tagOf(value.message) !== undefined
    ? value.message
    : Predicate.hasProperty(value, "command") && tagOf(value.command) !== undefined
    ? value.command
    : undefined

// A description is made in the handler of a defect too, where one that threw would take the defect's place: a
// wrapping that comes back to a value on its way ends there.
const tagsOf = (value: unknown, tag: string, on: Array<unknown>): string => {
  const wrapped = wrappedOf(value)
  if (wrapped === undefined) return tag
  on.push(value)
  return `${tag} › ${on.includes(wrapped) ? "…" : tagsOf(wrapped, tagOf(wrapped) ?? "", on)}`
}

/**
 * By default a message or a command is described by its `_tag`, or itself if it is a string: never its data.
 * One a parent wrapped is described by the tags on its way, e.g. `Home › Products › Deleted`.
 */
export const describeByTag = (value: unknown): unknown => {
  if (typeof value === "string") return value
  const tag = tagOf(value)
  return tag === undefined ? typeof value : tagsOf(value, tag, [])
}
