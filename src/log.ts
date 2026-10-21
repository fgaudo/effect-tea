const tagOf = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && '_tag' in value && typeof value._tag === 'string'
    ? value._tag
    : undefined

// A parent wraps a child's message as `{ _tag: <child>, message }`, and its command as `{ _tag, command }`. A
// program's own value may have a field of that name too, holding data: only a tagged value is followed.
const wrappedOf = (value: object): unknown =>
  'message' in value && tagOf(value.message) !== undefined
    ? value.message
    : 'command' in value && tagOf(value.command) !== undefined
    ? value.command
    : undefined

/**
 * By default a message or a command is described by its `_tag`, or itself if it is a string: never its data.
 * One a parent wrapped is described by the tags on its way, e.g. `Home › Products › Deleted`.
 */
export const describeByTag = (value: unknown): unknown => {
  if (typeof value === 'string') return value
  const tag = tagOf(value)
  if (tag === undefined) return typeof value
  const wrapped = wrappedOf(value as object)
  return wrapped === undefined ? tag : `${tag} › ${String(describeByTag(wrapped))}`
}
