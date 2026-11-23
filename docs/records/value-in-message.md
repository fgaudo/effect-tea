# A message with one value left for the element to give: the spike

**Status:** taken by the owner, 23 November 2026, with the conditions of a second opinion ("Decided", at the end), to
be written as steps 41 to 43 of [`ROADMAP.md`](../../ROADMAP.md). Spiked the same day as step 40, by a session of
Opus 5.5, and reviewed by a session of Fable 5.2, at the owner's request ("The second opinion"). The findings below are
as corrected after that review. It is the part of [`declared-inputs.md`](declared-inputs.md) that "Weighed again" took
to a spike. The spike's code is on the branch `spike/value-in-message` at `ed70b94`, never to be merged. The library
did not change. Read against the code at `c21e637`.

## In short

The form works, with no export and no change of the library. The model holds the message without its value, as
data, and the view fills the value that the element gives:

```ts
const makeModel = (state: State) => ({
  items: state.items,
  more: state.more._tag === "Idle"
    ? { _tag: "Idle", scrollEnded: { _tag: "ScrollEnded" } } as const
    : { _tag: state.more._tag }
})

// In the view, where the model is idle: the handler of the list's `scrollend`.
const onScrollEnd = (event: Event) => dispatch({ ...more.scrollEnded, offset: offsetOf(event) })
```

Against today's form, a write and then a message, it costs one step for each fact in place of two. It keeps no place
in the state for a value read once. A scroll end that means nothing leaves the very state, and the renderer is told
nothing. A view that sends the message and forgets the value does not compile, where today a view that forgets the
write compiles, and `update` decides on a stale value. A test of the model costs the same in both forms: an exemption
of `Inert` for the values at which the message means nothing.

What it takes is a border with inputs. Unrestricted, the form is a message for what the user types, which the guide
refuses ("Against it"). So it holds only for a value that the program cannot give back to the element.

Found beside it: `messagesSentBy` gives a handler that reads `scrollTop` nothing, in either form. What the tool would
need is what the event and its target hold, a shape not decided here.

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

The feed needs one value only because its `update` holds the pixels of its CSS. A real list reads `scrollTop`,
`scrollHeight` and `clientHeight` from the element.

## What the roadmap asked

### 1. The reader, `dispatchViolations`, and whether a value is a reason to reject

**The reader takes the value as a parameter.** `messagesOf(model, offset)` fills it into each message that the model
holds without it. The test chooses the value.

**A test that fills one value proves less than it seems.** `feed.test.ts` fills the offset at which the list has
scrolled to its end, the one value at which the message acts in every idle state. So `Rejected`, `Inert` and
`ActsTwice` pass with no exemption. But an `update` that rejects a scroll end short of the end passes that test too,
as the review found. With the offset drawn by fast-check, that `update` is found, and a correct one is reported
`Inert` for the offsets short of the end, unless the test exempts them with `inert`. The exemption writes the
program's geometry again, as today's form does: there, the state is generated with any offset, and the fixed message
does nothing wherever the offset held is short of the end. On this, the two forms cost the same.

**`Missing` compares whole messages, the value too** (`src/testing/dispatch-violations.ts`). A candidate is missing
unless it carries a value that the reader filled. A candidate that acts at another offset is `Missing`. So a test
fills held messages and candidates with the same values. The tool needs no change for this.

**A value is never a reason to reject**, but not for the reason of "Input is never a reason to reject". That rule
rests on the element: it already shows the value, and the library stores it. This one rests on the model. The model
holds the message wherever the view gives the element its handler, so it cannot pick its case by a value it does not
have. If `update` rejected some values, the model would show more than `update` accepts, against "Show less than
`update` accepts, never more" ("Structuring a program", "Model and view"). The tools hold it too: `Rejected` has no
exemption, and `rehearse` fails on a rejection of a message that the model of the same state shows. So the state
decides whether the message applies, and the value decides what it means. A value that means nothing is a step that
does nothing, the very state, as `as-message.ts` returns. A test then asserts the same state, a weaker assertion than
a rejection, as it does in today's form.

### 2. `messagesSentBy`

**It gives a handler that reads `scrollTop` nothing, in both forms.** The tool gives each listener an event whose
`target` holds the `value` and the `checked` of the element's props alone (`bridges/snabbdom-testing.ts`). So today's
form records `{ _tag: "Offset", message: { _tag: "Written", value: undefined } }`, then the message. The spike's form
records `{ _tag: "ScrollEnded", offset: undefined }`. Neither equals what a reader returns. The guide says what the
target holds ("Writing a bridge", "Their tests"), but not what a handler that reads another property gets, and the
tool does not tell the test. The gap is the same with the guide's own form.

**What the tool would need.** A copy of the tool on the branch takes `targetOf: (node, event) => object` and spreads it
into the target. With it, each form sends what its reader returns, for any offset that fast-check draws, the parent's
view too. But that is not enough: a click at a point reads the event's own properties (`offsetX`, `clientX`), which no
target holds. And the copy leaves out the tool's handling of a `thunk`. The shape is a decision of its own
(`change-api`).

### 3. A parent's view, `forwardTo`, the bridge to React, and the other tools

**A parent's view changes nothing.** A child's view fills its message and sends it through the dispatch that
`forwardTo` gives, which wraps it as it wraps any. Applied to the parent, the message reaches the child and loads its
page. That `forwardTo`'s cache and a `thunk` work as they do for any model is reasoned, not run: no view on the branch
uses a `thunk`.

**A parent's reader does change.** It wraps the filled messages as it wraps any,
`{ _tag: "Feed", message: { _tag: "ScrollEnded", offset } }`, but it takes the values of every message without its
value below it, as parameters, and gives them to the readers of its children.

**The bridge to React plays no part.** React 19.3.1 reports the end of a scroll as `onScrollEnd`. In happy-dom, a
`scrollend` fired on the list gives each form's handler `event.currentTarget.scrollTop`. The bridge sees neither
handler.

**The other tools.** `rehearse` and `drive` send a message picked from the model, `(model) => Option<Message>`. So a
scenario fills the value as a view does: the review ran it with `rehearse`. A message filled from a model that the
state has since moved past is judged in the new state, as any: rejected there, it reaches `onIgnored`.

**The types hold the form.** A dispatch of the held message without its value does not compile, nor does one with a
value of another type. The message that a view fills is equal, by `Equal`, to the one that the constructor of a
`Data.taggedEnum` makes, with a nested object or an array as the value too (the review's probe). The models of two
equal states built apart are equal. A message written whole by hand compiles, as it does today. So "Export `Message` as
a type only. Then no view can build a message" ("Model") is false today: a view writes a literal.

**Only a plain tagged message can be filled.** A message that is a class, as a `Data.TaggedClass`, is no plain
object: its held part needs `pipe`, and a spread is neither an instance of the class nor equal to one (the review's
probe). For such a message, a write and then a message is the only form.

**The held part needs no named type.** `{ _tag: "ScrollEnded" } as const` typechecks, and a misspelled tag is found
where the view dispatches (the review's probe). The branch's `satisfies ScrollEnd as ScrollEnd` holds a real `as`.

### 4. What the guide would say

What changes is listed under "Decided", with the places that state each rule.

### 5. What each form costs

Measured on the branch in a run started by `start`, from the first page, with no command run, and logged by the test,
not asserted but for the steps. Each fact is one scroll end, short of the end and then at it:

| For one scroll end        | A write, then a message (today)  | One message with its value (spike) |
| ------------------------- | -------------------------------- | ---------------------------------- |
| Steps applied             | 2                                | 1                                  |
| Short of the end: notices | 1, with a new model made         | 0: the very state                  |
| At the end: notices       | 2, with two models made          | 1, with one model made             |
| Place in the state        | `offset` in the idle case        | none                               |
| In a test of the model    | an exemption of `Inert`          | an exemption of `Inert`            |
| A view that forgets       | the write: compiles, stale value | the value: does not compile        |
| What the model holds      | a fixed message                  | a message without its value        |

A scroll end short of the end changes the state in today's form, since the offset is kept. So the renderer is told,
and a model is made that equals the last one by `Equal` but is a new object. The spike's form leaves the very state.
The branch's `as-write.ts` also gives the input its place back, once a page has loaded, with an offset that no element
gave, `offset: 0`. That comes from keeping the offset inside the idle case: an `Option`, or a place outside the case,
avoids it.

## Against it

- **Unrestricted, it is a message for what the user types.** `NameTyped { text }`, held without its text, is the same
  form. It is what `docs/rejected.md` refused as "A write that `update` sees and may reject", and it refutes the second
  reason of "Why what the user types is no message" ("Inputs"): a model can hold all of a message but the value. So
  the form needs a border: it is only for a value that the program cannot give back to the element. A value that the
  element holds stays an input, for the first reason, which still holds: there is nothing to decide.
- **"A view never builds a message of the program itself" takes a case.** It is less of an exception than it looks: a
  write already wraps a value of an element in a route that the view names. One rule covers both: a view adds nothing
  to what it sends but the value that an element or its event gives, as given.
- **Only a plain tagged message** can be filled ("The types hold the form", above).

## Not run

- `test:node`, `interleavings` and the mutations: the spike changes no engine and no testing tool.
- A board clicked at a point, the roadmap's other case. It reads the event, not the element, and needs more of
  `messagesSentBy` than the scroll end.
- A browser: happy-dom alone fired the `scrollend`.

## The second opinion

The owner asked for one, on 23 November 2026, from a session of Fable 5.2 at `high`, read only, which ran the spike's
tests and probes of its own. Its findings are carried into the sections above, each checked against the code where it
rests on it. What it found that the first version of this record had wrong:

- that the form needs no exemption of `Inert`: it does, as today's form does;
- the reason of "a value is never a reason to reject": it is the model's, not the input's;
- that "a write, then a message" is never needed: a message that is a class needs it, and "a value written once, as
  the scroll ends" (`inputs.md`) stays;
- that the held part needs a named type and a `satisfies`: `as const` is enough;
- that one value is enough, and that a click at a point needs nothing more: a real list reads three values, and a click
  reads the event;
- that no example of the library has such a value: `volume` has one. A press on its track is at a point, and its
  message cannot say where, so `examples/volume/main.ts` keeps where the pointer is pressed in variables of the module,
  filled by a listener on the document. It is a third form, a service that the subscription of a drag reads;
- that `targetOf(node, event)` is what `messagesSentBy` needs.

It found no better form. A service and a subscription, as `volume`'s, fits what is there whatever is drawn. A fact
with no value, as a row that comes into view, is better where there is one. One message for each value fits a board
of cells, by the rule of a keypad. And a value declared in `make` stays rejected: neither of the conditions that
reopen it is met.

## Decided

The owner took the four points on 23 November 2026, each with the conditions of the second opinion.

1. **The form goes into the guide, with its border** (step 41). It is for a fact that comes with a value that the
   program cannot give back to the element: the end of a scroll with its offset, a press at a point. A value that the
   element holds stays an input.
   - The second reason of "Why what the user types is no message" is rewritten: the first reason, that there is
     nothing to decide, is what makes a text an input.
   - "A value is never a reason to reject" goes under "Show less than `update` accepts, never more", as a case of it.
   - "Testing", "The reader" says to draw the value and to exempt with `inert` the values at which the message means
     nothing, and that a parent's reader takes the values of its children's.
   - The limits are stated: a plain tagged message, and a view that fills what the element or its event gives, as
     given, and computes nothing.
   - The examples write the held part with `as const`, with no cast.
2. **"A write, then a message" leaves the guide as the advised way** (step 41). It still holds by what the guide
   promises, and it stays the way for a message that is a class. "A value written once, as the scroll ends" stays,
   and what links to it. An entry of `docs/rejected.md` says why it left before any release said it.
3. **`messagesSentBy` gets what a handler reads beyond `value` and `checked`** (step 42), in a shape that gives what
   the event holds as well as its target, decided in that step (`change-api`). It is an addition, so 0.9.0 does not
   wait for it. Until then, "Writing a bridge", "Their tests" says what a handler that reads another property gets
   (step 41).
4. **An example of the form** (step 43), after step 42, with values that an element really reports, or `volume`'s
   press: not the feed as it stands, whose `update` holds the pixels of its CSS.

Beside them, for step 41: "Then no view can build a message" ("Model") is corrected; the unreleased entry of
`CHANGELOG.md` that makes a value that an element reports an input is edited; and whether a message may leave more than one value to
the element, and whether a view may compute a value from what the element gives, are asked of the owner before the
step writes the rule.
