# External messages with a handler of their own: the spike

**Status:** spiked, 20 November 2026, by a session of Opus 5.5, on the branch `claude/spike-external-handler` at
`6f93071`, never to be merged. Not decided: the owner decides on this record (step 3 of
[`ROADMAP.md`](../../ROADMAP.md)). It answers part 3 of [`architecture-review.md`](architecture-review.md), which says
why a child's rejection of an external message is in doubt, and its "Open, for the spike". Last read against the code at
`3917346`.

## In short

A program that names `external` messages in its type has a function `external`, apart from `update`, which answers
them. It returns a `Step`, never `reject`. It is required exactly when the program names external messages, as
`runCommand` is when it has commands. An external message is none of the program's messages: no view, command or
subscription sends one, and a parent sends one only by calling the child's handle, now `children.<child>.external`.

```ts
// The child: a halt applies in every state.
external: (_: Halted) => (state) => ({ state: halted(state) }),

// Its parent, which sends it, or passes on one of its own.
update: (_: StopAllClicked, children) => (state) =>
  forEach({ state }, state.entries, ({ id }) => children.Stopwatch.external(id, { _tag: "Halted" })),
external: (message, children) => children.Page.external(message),
```

So "the child answers in every state" holds by the types, where only a `CompositionDefect` held it. The five checks of
the review go, with the key of the external messages in the type of a program, the check of a rejection in `tell`, and
the routing of an external message by its tag. What stays a defect is an external message to a child that is not there,
which depends on the state.

Every check passes on the branch, the matrix of inference with each supported TypeScript too (27 129 cases, no lead),
and so do the mutations (211, all killed).

## What was built

- **`src/program.ts`.** `ExternalHandler<External, State, Command, Event>`, exported, as `Interpreter` is: `object`
  for a program without external messages, and `{ readonly external: (message) => (state) => Step }` otherwise. `Shape`
  takes it in place of the key `~@fgaudo/effect-tea/Program/external`. `ExternalOf` reads the parameter of `external`.
  `ExternalAmong` and `Unboxed` go.
- **`src/compose.ts`.** `make`'s config has `external: (message, children) => (state) => step`, required exactly when
  `program` names external messages and refused otherwise (`ExternalHandlerOf`), as `update` is. A handle's `update` is
  `external`. `tell` calls the child's `external`, and lifts its step as `updateAt` lifts a step of `update`, through
  one function, `liftAt`. The program `make` returns has `external` only where its config has one. `ExternalTaken`,
  `ExternalPassed` with `Unsent` and `Unpassed`, and `ExternalWritten` go, and `CheckedChild` keeps one check, that of
  `runCommand`.
- **What a cast still reaches.** A handle called past the types, for a child with no `external`, is a
  `CompositionDefect` that names the child (`which has no external`), as a child's command with no `runCommand` is. A
  rejection that an `external` returns past the types is not checked any more: the cast takes that risk.
- **`examples/list`.** `Halted` leaves the stopwatch's `Message`: `External` is its own type, and `external` answers
  it. The list calls `children.Stopwatch.external(id, { _tag: "Halted" })`. Its test no longer lists a halt among what
  a user could not ask of a stopwatch, with a comment saying why: the types now say it.
- **`examples/pages`** is unchanged: it has no external message. Its parent tells its children nothing but `init`.
  The step asked for it written with the handler; there was nothing to write.
- **The tests.** `src/compose.test.ts`: 92 tests became 91. The four of the routing by tag go: a parent's `external`
  that names a message its child keeps to itself, the same with a wide tag, an external message that writes into an
  input, and an external message among the program's messages. Three take their place: an external message tagged like
  an input is the program's to answer, never a write; a program has an `external` exactly when it has external
  messages, and it never rejects (four `@ts-expect-error`); and a parent passes one on in its own `external`, to a
  grandchild. The tests of a rejection become a `@ts-expect-error`. The counter, the page and the page that is left
  have an `external`; the page and the page that is left show the message that both the view and the parent send, two
  entries for one function.
- **`tools/`.** The child of the inference's prelude takes `KReset` in `external`, and `KReset` leaves its messages.
  The generator writes an `external` wherever a case names external messages, in the form of its `update` (or
  contextual without one); a parent passes one on from its `external` as well as from its `update`. Its broken rules
  `externalNotAmong` go, for five: `missingExternal`, `externalUnnamed` (refused, harmless), `externalRejects`,
  `wrongExternal` and `externalToChild`. The specials of the routing by tag become four of a parent's `external` that
  passes on what the child takes, or not, under a literal and a `string` tag, and two of a wide `external`, `any` and
  `unknown`. The smoke test's consumer has a program with external messages and none of its own (`relay`), and one
  that answers an external message tagged like its input (`filled`), which did not compile before.
- **The mutations.** "An external message a child rejects is a rejection of the parent" goes, with its check. "An
  external message to a child that is not there" is kept on the new `tell`. One is added: "an external message to a
  child without external dies of a TypeError".
- **The guide, on the branch, as a draft.** "Events and external messages": a rule "A child answers its external
  messages in every state" in place of the old two, the example in `external`, the handles as `external`, and three
  points of "Precisely" in place of four. "Anatomy of a program": three kinds of program that do not compile, not four,
  and `external` beside `runCommand`. "Composition" and the glossary lose the routing by tag. The skill, the doc
  comments, `docs/invariants.md` ("A parent and its children talk only through external messages and events") and the
  reports of the API follow. Not checked section by section, as `AGENTS.md` asks of the guide: a stage would.

## What the checks gave

All at the branch's commit: `bun run typecheck`, `bun run lint`, `bun run test` (917 tests), `bun run test:node` (711),
`bun run interleavings` (21 properties), `bun run comments`, `bun run build && bun run api` (the reports changed, as
below), `bun run smoke` with TypeScript 5.9.3, 6.0.3 and 7.0.2 under `nodenext` and `bundler`, `bun run inference`
(27 129 cases, 26 708 valid, no lead and no note with each of 5.9.3, 6.0.3 and 7.0.2, under
`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`; the scale of 1 to 64 children checks in 0.3 s with
7.0.2) and `bun run mutations` (211, all killed, the two new ones of `tell` among them).

## What the declarations and the hovers print

- **A program is still named.** In the consumer's declarations, `relay` and `filled` print as
  `Program<{ state: …; …; external: Readonly<{ _tag: "Reset" }> }>`, as every program did. The count of the state's
  spellings is 12, as before.
- **The smoke test needed a new mark** for a program spelled out: it counted the key of the external messages, which is
  gone. It counts `makeModel:` instead, once today, in `copied`.
- **The reports of the API** lose `ExternalAmong`, `ExternalTaken`, `ExternalPassed`, `ExternalWritten`, `Unboxed`
  and the key, and gain `ExternalHandler` and `ExternalHandlerOf`. `Shape` intersects `ExternalHandler`, `Handles` has
  `external` in place of `update`, and `Config` takes one more parameter. The report of the API shrinks by 20 lines.
- **The hovers** were not read in an editor: what they print is what the declarations print.

## The questions of the review, answered

- **The name of the handle's function.** `external`, as `init`: each function of a handle is named after the piece of
  the child it calls. `update` would name a function that no longer reaches the child's `update`; `tell` or `send` name
  what happens, where the other names of the library name the pieces.
- **Whether `make` still infers its children and its own messages** with one more function that takes its type from the
  signature: yes, under each supported TypeScript (the matrix). The function takes nothing to infer: its message is
  named in `program`, and its children are inferred from `children`, as for `update`.
- **What the declarations and the hovers print**: above.

## What it costs

- **A message that both the child's view and its parent send** has two entries that call one function, as the review
  said. The tests have two (the page with its menu, the page that is left).
- **A test of a program alone sends an external message by calling `program.external(message)(state)`**, as the review
  said: `applyAll`, `simulate`, `rehearse` and `drive` take messages, and an external message is none. A test that
  folds external messages and the program's own in one history folds by hand. Before, a test could send a child its
  external messages through `simulate`, since they were messages. Whether the testing tools should take them is not
  asked here: it would be a second channel into a program, beside its messages.
- **It is a breaking change.** A handle's `update` becomes `external`, an external message leaves `message`, and
  `Program<{ …; external }>` asks for the function. The changelog would say so under "Breaking", with how to upgrade,
  before the release of 0.8.0, by the reason of R2 of [`synchronous-dispatch.md`](synchronous-dispatch.md).

## Found on the way

- **A program may have external messages and none of its own.** Before, an external message had to be among its
  messages, so `program<{ state; external }>()` with no `message` did not compile anywhere it was used, and the matrix
  counted such a case invalid (`isValid`). Now it is a parent that only passes messages on, as `Home` in the tests.
- **A section of the guide named with inline code cannot be cited by the skill.** `bun run comments` reads the skill's
  prose with the inline code taken out, so a name with a backtick never matches. The rule is named "A child answers its
  external messages in every state" for that reason.
- **`examples/pages` has no external message**, so the step's ask for it written with the handler had nothing to show.

## If it is taken

One stage, Opus 5.5 `high` (the types of `program.ts` and `compose.ts`, and the guide, a specification), with the
skills `change-api`, `change-engine` and `release`. It brings the branch's code, tests, examples, tools and mutations
onto `main` as `main` is then, and writes the guide section by section, each sentence checked against the old one, with
the doc comments, the skill and `docs/invariants.md`. With it: the changelog's "Breaking" entry, the entry "Checking a
program's external messages in `make`" of `docs/rejected.md` closed with what became of it, and this record marked
done. It depends on no other step's outcome: it changes the types of a program and `tell`, which steps 4 and 2 leave as
they are.

## If it is refused

An entry of `docs/rejected.md` says why, beside "Checking a program's external messages in `make`", which stays as it
is, and this record is marked rejected.
