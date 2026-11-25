# The names of the API, read whole

**Status:** decided on 25 November 2026, as step 86 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md); step 87 applied it. Read: every name that a user writes, or
reads in a hover, in the five reports of `api/` at `3ca814c`, against the glossary: the exports, their members, the
options, the literal values, the parameters and the type parameters. [`api-review.md`](api-review.md) decided the
exports, and read a member only where a change touched one: no export is reopened here. One probe ran, of change 2, on
`src/compose.ts`: the typecheck and the 426 tests of `src/compose.test.ts` and `src/testing/` pass with it. It is not
kept: step 87 runs the checks.

## What changes

Changes 1 and 2 break: 2 has a `**Breaking**:` entry in the changelog, and 1 is taken into the unreleased entry that
names `Simulated`, as one change of one kind. Change 3 adds, and has an entry. No consumer's code can notice 4 and 5,
which have none.

1. **`Simulated` lists the messages that `update` accepted as `applied`**, where it listed them as `messages`. In one
   call, `messages` named two lists: what the test gives, `simulate(program, messages, from)`, and what `update`
   accepted, the commands' answers among them. A message that `update` accepts is applied, in `Applied` and in
   `onApplied`, as one that it rejects is ignored: `applied` stands beside `ignored` as the two options do, and the
   contract test already compares the field with what `onApplied` heard. It lists messages, not records of the type
   `Applied`, as `ignored` lists messages and not records of `Ignored`. The changelog's entry on `Simulated` becomes:
   "**Breaking**: `Simulation`, what `simulate` succeeds with, is `Simulated`, as `Folded` is what `applyAll` returns,
   and it lists the messages that `update` accepted as `applied`, where it listed them as `messages`. Upgrade:
   `Simulation<State, Message>` becomes `Simulated<State, Message>`, and a test reads its `applied` where it read its
   `messages`."
2. **A declaration of a child is told by `_tag`, the name of its type**: `_tag: 'Child'` where a `Child` had
   `kind: 'one'`, and `_tag: 'ChildById'` where a `ChildById` had `kind: 'byId'`. Every other tagged value of the
   library is told by `_tag` (an `Origin`, a `DispatchViolation`, the defects), as Effect's are, and `'one'` was no
   word of the guide, which says "a child alone". The comment of `ChildByIdOf` becomes "Told by `_tag` and the id
   `listening` takes, which the type declares whether or not the child has one." Changelog: "**Breaking**: a
   `Child` has `_tag: 'Child'` in place of `kind: 'one'`, and a `ChildById` has `_tag: 'ChildById'` in place of
   `kind: 'byId'`. Upgrade: no program writes either. Code that read `kind` reads `_tag`."
3. **`repeatable` is given the state**, `(message: Message, state: State) => boolean`, as `inert` and `withheld` are:
   the three marks of `dispatchViolations` have one role, and now one form. The state is the one that the call checks
   in. In the `@param` of the doc comment: "`repeatable`, the messages meant to act again in a state when sent twice
   (a "+1"), which must still do something". In "Testing tools", the item of `repeatable` starts "marks, by the message
   and the state,", as the item of `inert` does. A test of the tool gives a `repeatable` that reads the state.
   Changelog, under "Added": "`repeatable`, of `dispatchViolations`, is given the state too, `(message, state)`, as
   `inert` and `withheld` are."
4. **What `child` and `childById` take is `options`**, where the parameter was `place`: the word is from before the
   library kept the children, when a declaration said where a child's state was in its parent's. The same role is
   labelled `options` in `start`, `drive` and `rehearse`, and is the prop `options` of `Host`, flags among them. The
   types that only signatures print follow: `AlwaysPlace` is `AlwaysOptions`, `SometimesPlace` is `SometimesOptions`,
   `IdsPlace` is `IdsOptions`, and `FlagsPlace` is `FlaggedIdsOptions`, which stands apart from the exported
   `FlagsOption`. The labels of the tuples, the parameters `place` of the two functions that `program` gives, the
   `@param` lines, and the comments that say "place" of what a declaration takes follow. The other meaning of the word
   stays, where a child or its state is put: the type `Place`, the name and the id of a child, with its values;
   `Placer`, `placer` and `statesKey` with its string, in `src/compose.ts`; and `place` in `src/testing/state-of.ts`.
5. **The type parameters of the services have the names of `Program<{ … }>`**: `RC` is `CommandServices`, and `RS` is
   `SubscriptionServices`, wherever a parameter is what a program names so: in `Shape`, `start`, `startWith`,
   `partsOf` and `Needed` (`src/program.ts`, `src/run.ts`), in `drive` and its `Needed`, `rehearse`, `rehearsing`,
   `Rehearsal` and the stage (`src/testing/`), in `Host` and `HostProps` with their test (`bridges/`), and in
   `tools/inference/prelude.ts`. `RT`, the services of a scenario, is `R`: no list of type parameters that has it has
   another `R`. Where a signature has one set of services, it stays `R`, as Effect names the services of an effect:
   in `RunCommand`, `Listen`, `Started`, `Fork`, and in `simulate`, whose `R` is also what its effect asks for. Two
   local names follow: `RCOf` (`src/testing/stage.ts`) is `CommandNeeds`, and `RSOf` (`src/testing/rehearse.ts`) is
   `SubscriptionNeeds`, since `CommandServicesOf` is an export. In `src/shell.ts`, `RS` is the services of `send`, not
   those of the subscriptions: it becomes `RSend` there, beside `RL`, so that no `RS` is left to be read as them. A
   hover of `start`, of `Host` or of a `Rehearsal` then needs no legend. The doc comment of `Rehearsal` loses its
   sentence on `RC` and `RS`, and says: "`run` and `runAll` ask for `CommandServices`, the services that its commands
   need, and `hearNext` for `SubscriptionServices`, those that its subscriptions need."

## What was weighed and kept

Each lead of the step, and what else a reader would ask. Where [`rejected.md`](../rejected.md), "The API", has the
reason, an entry of this step is named by its first words.

| Names                                                                        | Kept, because                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ids`, `flags` of `childById`; `listed`, `flagged`, `there` in what it makes | Entry "What `child` and `childById` take, mirrored…"                                                                               |
| `before`, `after` of `Applied`; `state` of `Ignored`                         | Entry "One word for the state…"                                                                                                    |
| The literals of `DefectSite`; `where`, `on`, `cause`, `key`, `child`, `id`   | Entry "`'runCommand'` and `'listen'`…"; `key` is a subscription's, `cause` is JavaScript's word                                    |
| `Ran`, `Heard`; `T`, `P`, `C`; `A`, `E`                                      | Words, or the letters that TypeScript and Effect use; no program writes one                                                        |
| `send`, `dispatch`, `hear`, `hearNext`, `model` of the tools                 | Entry "Other names in a `Rehearsal`…"; `run`, `runAll` were kept in step 59                                                        |
| `held`, `candidates`, `inert`, `withheld`; the tags of `DispatchViolation`   | The glossary's words; `ActsTwice` says the bug; the tag `Rejected` says that `update` rejected it, which the type `Rejected` names |
| `select`, of `send`, `waitFor` and `run`                                     | What picks: a message of a model, or a pending command. The type of each says what it returns                                      |
| `...args`, the rest parameter of `drive` in a hover                          | The name that `Effect.fnUntraced` gives it; its label is `options`                                                                 |
| `patience`                                                                   | Entry "`timeout`, for the `patience`…"                                                                                             |
| `reports`; its `element`, `event`, `type`                                    | What the element and its event report, in the words of the doc comment; the rest is the DOM's                                      |
| `subscribe`, `die` of an `App`                                               | Entry "Another name for the `subscribe`…"; a run dies, in the guide and in Effect                                                  |
| `external`, `onEvent`; `tell` in a step                                      | Entry "`onExternal`, for `external`…"                                                                                              |
| `own`, `starts`, `children` of `Kept`; `instance` of `Instance`              | The guide's words; `instance` is the number wherever a message, a command or a key carries it                                      |
| `stateOf`, beside `StateOf`                                                  | One makes a value of the type that the other names, as `program` and `Program`                                                     |
| `DeclareChildren`, for the type of `withChildren`                            | `WithChildren` would read as a piece that a program may have, as `WithListen`                                                      |
