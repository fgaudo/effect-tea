/** By default a message or a command is described by its `_tag`, or itself if it is a string: never its data. */
export const describeByTag = (value: unknown): unknown =>
  typeof value === 'string'
    ? value
    : typeof value === 'object' && value !== null && '_tag' in value
    ? value._tag
    : typeof value
