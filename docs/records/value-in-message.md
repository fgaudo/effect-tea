# A message with one value left for the element to give: the spike

**Status:** proposed, 23 November 2026, as step 40 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5. The
owner decides on it before 0.9.0 is released ("For the owner", at the end). It is the part of
[`declared-inputs.md`](declared-inputs.md) that "Weighed again" took to a spike. The spike's code is on the branch
`spike/value-in-message` at `ed70b94`, never to be merged. The library did not change. Read against the code at
`c21e637`.

## In short

The form works, with no export and no change of the library. The model holds the message without its value, as
data, and the view fills the value that the element gives:

```ts
export type ScrollEnd = Omit<Extract<Own, { _tag: "ScrollEnded" }>, "offset">

const makeModel = (state: State): Model => ({
  items: state.items,
  more: state.more._tag === "Idle" ? { _tag: "Idle", scrollEnded: { _tag: "ScrollEnded" } } : { _tag: state.more._tag }
})

// In the view, where the model is idle: the handler of the list's `scrollend`.
const onScrollEnd = (event: Event) => dispatch({ ...more.scrollEnded, offset: offsetOf(event) })
```

Against today's form, a write and then a message, it costs one step for each fact in place of two. It keeps no place
in the state for a value read once. It needs no exemption of `Inert` in a test. A scroll end that means nothing leaves
the very state, and the renderer is told nothing. What it takes is one exception to a rule of "Model": a view fills
one value into a message that its model holds. The advice is to take it into the guide before 0.9.0, in place of "a
write, then a message", which it makes unneeded.

Found beside it: `messagesSentBy` gives a handler that reads `scrollTop` nothing, in either form. One argument, what
the target of an event holds, would be enough.

## What was built

An example that is not kept, `examples/feed/`: a list of rows that loads the next page as its scroll ends near the
bottom. It is written twice, over the same geometry (`shared.ts`: the height of a row, the height of the list, a
margin, pages of five rows, twelve rows in all):

- `as-write.ts`, as the guide says today. The idle case of the state holds an input `Offset`. The view writes the
  offset, then sends `ScrollEnded`, a fixed message. `update` reads the offset from the state.
- `as-message.ts`, the spike's form. `ScrollEnded` carries `{ offset }`. The model holds `{ _tag: "ScrollEnded" }`,
  and the view fills the offset. The state holds no offset.

Each has a view drawn with snabbdom (`view-snabbdom.ts`) and with React (`view-react.tsx`), and a parent that draws
it through `forwardTo` (`parent.ts`). The tests are `feed.test.ts`, without a DOM, and `feed-react.test.tsx`, with
happy-dom. Run on the branch: `typecheck`, `lint` and `test` (1094 tests, 15 of them the spike's).

## What the roadmap asked

### 1. The reader, `dispatchViolations`, and whether a value is a reason to reject

**The reader takes the value as a parameter.** `messagesOf(model, offset)` fills it into each message that the model
holds without it. The test chooses the value. `feed.test.ts` fills the offset at which the list has scrolled to its
end, the one value at which the message acts in every idle state. So `Rejected`, `Inert` and `ActsTwice` pass with no
exemption. A scroll end sent twice is rejected the second time, since the list is then loading.

**The test chooses the value by the program's rule.** This holds in both forms. In today's form, the state is
generated with any offset. So the fixed message does nothing wherever the offset held is short of the end. The test
then needs an exemption of `Inert` that writes the program's geometry again, `nearEnd(state.more.offset, …)`. A
write must also be of a value other than the one held, as "Testing", "The reader" asks. In the spike's form, the
geometry is in the one value that the test fills.

**`Missing` compares whole messages, the value too.** A candidate is missing unless it carries the very value that the
reader filled. A candidate that acts at another offset, near the end but not at it, is `Missing`. A held message
filled with an offset short of the end is `Inert`. Both are shown by a test. So a test fills held messages and
candidates with the same values. If it fills several values, it exempts those at which the message means nothing.
The tool needs no change for this. The guide's "The reader" would say it.

**A value is never a reason to reject.** The model holds the message wherever the view gives the element its
handler, so it cannot know the value. If `update` rejected a scroll end short of the end, the model would hold a
message that `update` rejects for most values that the element gives: `Rejected` for every such value that a test
fills. So the state decides whether the message applies, and the value decides what it means. A value that means
nothing is a step that does nothing: the very state, as `as-message.ts` returns. This is the rule "Input is never a
reason to reject" ("Structuring a program"), for the same reason: what the element gives is not the program's to
refuse.

### 2. `messagesSentBy`

**It gives a handler that reads `scrollTop` nothing, in both forms.** The tool gives each listener an event whose
`target` holds the `value` and the `checked` of the element's props alone. So today's form records
`{ _tag: "Offset", message: { _tag: "Written", value: undefined } }`, then the message. The spike's form records
`{ _tag: "ScrollEnded", offset: undefined }`. Neither equals what a reader returns. The guide says what the target
holds ("Writing a bridge", "Their tests"), but not what a handler that reads another property gets, and the tool does
not tell the test. The gap is the same with the guide's own form.

**What the tool would need: what the target of an event holds**, as one more argument. A copy of the tool on the branch
takes `targetOf: (node, event) => object` and spreads it into the target after `value` and `checked`. With it, each
form sends what its reader returns, for any offset that fast-check draws, the parent's view too. The name of the event
is needed, because one element may listen to several. The node is needed, because two elements may report different
values. This is an addition to the API of `./snabbdom/testing`, and a decision of its own (`change-api`).

### 3. A parent's view, `forwardTo`, and the bridge to React

**Nothing changes.** A child's view fills its message and sends it through the dispatch that `forwardTo` gives, which
wraps it as it wraps any. The parent's reader wraps the filled messages as it wraps any:
`{ _tag: "Feed", message: { _tag: "ScrollEnded", offset } }`. Applied to the parent, the message reaches the child
and loads its page. A child's kept model is data, so `forwardTo`'s cache and a `thunk` work as they do for any model.

**The bridge to React plays no part.** React 19.3.1 reports the end of a scroll as `onScrollEnd`. In happy-dom, a
`scrollend` fired on the list gives each form's handler `event.currentTarget.scrollTop`. The same element is drawn in
both forms. The bridge sees neither handler.

**The types hold the form.** A dispatch of the held message without its value does not compile, nor does one with a
value of another type. A message written whole by hand compiles, as it does today: exporting `Message` as a type
only does not prevent it, since the view writes a literal. The message that a view fills is equal, by `Equal`, to
one written whole. The models of two equal states built apart are equal.

### 4. What the guide would say

What changes, page by page. The wording is for the step that writes it.

- **"Structuring a program", the table.** "Something happened" stays a message, with a case added: "a fact that comes
  with a value, as the end of a scroll with its offset". The row of an input says "a value that an element holds",
  and "or reports" goes to the cases below.
- **"Inputs", "What an element reports".** Where an input ends and a message begins:
  - An **input** is for a value that the element holds and the program gives back (a text, a mark), or a value that the
    element reports with no fact to decide, which the program reads when something else happens.
  - A **message with its value** is for a fact that comes with a value, which `update` decides on when it happens: the
    end of a scroll, a click on a board at a point. The model holds the message without its value. The view fills the
    value that the element gives. If the program keeps the value, `update` stores it.
  - **"A write, then a message" goes.** It is never needed once a message carries its value: `update` stores the value
    where the program keeps it. And 0.9.0 is the first release that would say it.
- **"Model", "Messages live in the model".** "A view never builds a message of the program itself" becomes: a view
  never builds a message of the program itself. Where the model holds a message without its value, the view fills
  that value, as the element gives it, and nothing else. "Precisely" lists it as a fourth rule a view keeps to, which
  the library does not enforce.
- **"Structuring a program", "Input is never a reason to reject"** gains its case: nor is a value that an element gives
  with a message. The value says what the fact means, and a value that means nothing is a step that does nothing.
- **"Testing", "The reader".** A reader of such a message takes the value as a parameter. The test fills held messages
  and candidates with the same values, and exempts with `inert` the values at which the message does nothing.
- **"Guarantees", "What is left to you"**: that a view fills the value that the element gives, from the property that
  means it. Nothing checks it, not the compiler, not the run, not a tool: a test with `messagesSentBy` sees what the
  view sends only for a target that the test describes. The same holds of a write today, so this is a case of a rule
  that is there, not a new one.
- **The skill** (`skills/effect-tea/SKILL.md`) sums up the same rules.

What does not change: a model is data, a model holds no function, and every message that a view sends is in its model,
but for a value that the element gives. No promise of "Guarantees" changes.

### 5. What each form costs

Measured on the branch in a run started by `start`, from the first page, with no command run. Each fact is one scroll
end, short of the end and then at it:

| For one scroll end        | A write, then a message (today)  | One message with its value (spike) |
| ------------------------- | -------------------------------- | ---------------------------------- |
| Steps applied             | 2                                | 1                                  |
| Short of the end: notices | 1, with a new model made         | 0: the very state                  |
| At the end: notices       | 2, with two models made          | 1, with one model made             |
| Place in the state        | `offset` in the idle case        | none                               |
| When a page has loaded    | an offset to invent, `offset: 0` | nothing                            |
| In a test of the model    | an exemption of `Inert`          | a reader with a parameter          |
| What the model holds      | a fixed message                  | a message without its value        |

A scroll end short of the end changes the state in today's form, since the offset is kept. So the renderer is told,
and a model is made that equals the last one by `Equal` but is a new object. The spike's form leaves the very state.
When a page has loaded, today's form gives the input its place back with an offset that no element gave. No message
reads that offset before a write over it, but the state holds a value that is not true.

## Against it

- "A view never builds a message of the program itself" takes an exception. Today a view sends values that the
  program fixed and writes values that the element holds, and these are two different acts. With the form, one act
  is both.
- A user writes the type of the held message, `Omit<Extract<Own, { _tag: "ScrollEnded" }>, "offset">`, and a
  `satisfies` to build it. A name for it would be a type over a composition of TypeScript's own, which earns no place
  in the API (`AGENTS.md`, "What belongs here"). So the guide shows how to write it.
- The form is for one value. A message with two values that an element gives, as a point `{ x, y }`, holds one field
  for both. Two fields left for the element were not spiked. Nothing here needs them.

## Not run

- `test:node`, `interleavings` and the mutations: the spike changes no engine and no testing tool.
- A board clicked at a point, the roadmap's other case. The scroll end needs everything it would need.
- A browser: happy-dom alone fired the `scrollend`. That the bridges hand an event on as it is, is no premise of
  theirs.

## For the owner

Each point needs a decision before 0.9.0. The advice is given with each.

1. **The form goes into the guide**: a fact that comes with a value is one message, which the model holds without its
   value, and the view fills the value. With it, a value is never a reason to reject. _Advised: yes._ It is the
   guide's own table, a message for something that happened. It costs less in every row measured above, and it needs
   no export.
2. **"A write, then a message" leaves the guide** in the same step, before any release says it. _Advised: yes._ A
   message that carries its value makes it unneeded. Kept beside the form, it would be a second way with no case of
   its own.
3. **`messagesSentBy` takes what the target of an event holds**, as an optional argument, `targetOf(node, event)`.
   It is an addition to `./snabbdom/testing`, with a changelog entry. _Advised: yes, in a step of its own after the
   first._ It fills a gap that today's form has too, and the guide's "Testing", "The view" would show it with the new
   form.
4. **An example of the form**: the feed, kept small and drawn with snabbdom. _Advised: yes, in the step of the guide._
   No example of the library has a value that an element reports, and "an example never brings the rule that allows
   it" (`AGENTS.md`): the rule comes first, then the example in the same step.

If point 1 is refused, an entry of `docs/rejected.md` says why, and step 40 leaves the roadmap with it.
