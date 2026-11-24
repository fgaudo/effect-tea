# The API reviewed, by its names and its surface

**Status:** decided on 24 November 2026, as step 59 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md); step 60 applies it. It takes two pages where a record takes
one: a table gives each of the 84 exports its decision, and step 60 needs the exact words of each change. What was
weighed and left is not repeated here: each has its entry of this step in [`rejected.md`](../rejected.md), under "The
API" and under "Parked, not rejected". Each probe ran with TypeScript 7.0.2, on a copy of `src/` outside the repository,
and is not kept: step 60 runs the checks.

Step 61 added changes 9 to 11 the same day, when it weighed the decisions taken before the charter
([`decisions-weighed.md`](decisions-weighed.md), which gives their reasons), and took change 5 into change 9. Each of
the three changes the engine and the guide too, so a step of its own applies it: step 60 applies changes 1 to 4 and 6
to 8. Their exact words take the record to a third page.

## What changes

Changes 1 to 4 break a program written for 0.8.0: each has a `**Breaking**:` entry in the unreleased section of the
changelog, whose `Upgrade:` gives the old spelling and the new. No consumer's code can notice 5 to 8, which have none.
That section also follows the names of change 3 and the words of change 8, as each says. Changes 9 to 11 break too:
9 removes an export and withdraws a promise of the guide, an entry each, 10 removes a field, and 11 the inputs.

1. **The tools that fold messages are called in one step**, as every other tool is. `applyAll(update)(messages, from)`
   becomes `applyAll(update, messages, from)`, and `simulate(program)(messages, from)` becomes
   `simulate(program, messages, from)`. The first parameter, the type parameters and what is returned in the end are as
   they are today. The types still come from `update`, or from the program, alone: `messages` is a
   `ReadonlyArray<NoInfer<Message>>`, and `from` a `NoInfer<State>` for `applyAll`, a
   `Step<NoInfer<State>, NoInfer<Command>>` for `simulate`. Probed on the 64 calls of `examples/`: a literal message
   keeps its tags with no `as const`, and a wrong message, state or first command is refused.
2. **`Simulation` is `Simulated`**: what `simulate` returns, as `Folded` is what `applyAll` returns.
3. **A piece that a program has only when it has its type is named `With<Piece>`**, all four alike. `Interpreter` is
   `WithRunCommand` and `Listener` is `WithListen`, exported, since `compose.ts` names them. `ExternalHandler` is
   `WithExternal`, and the `output` that `Shape` wrote in place is `WithOutput`: both are kept to `src/program.ts` and
   not exported, since no module but their own names them. `Shape` ends with `& WithOutput<Output, State>`. `WithOutput`
   stands before `WithExternal`, with the doc comment "A program's `output`, required exactly when `Output` has values:
   what its parent reads of it.", and is written on one line, whose last part two mutations quote:
   `type WithOutput<Output, State> = [Output] extends [never] ? object : { readonly output: (state: State) => Output }`.
   Probed: `src/` and its tests typecheck with it, and without the export of `ExternalHandler` the declarations of the
   smoke test's consumer are the same file. `ExternalHandlerOf`, of `compose.ts`, keeps its name: it is not exported,
   and is the twin there of `OutputHandlerOf`. In the changelog, the breaking entry names two types: `Interpreter`, now
   `WithRunCommand`, and `ExternalHandler`, no longer exported, which `Pick<typeof program, 'external'>` stands for
   where a type named it. `Listener` is in no release, so its rename breaks nothing: the unreleased entry that brought
   it, "a subscription is made from its key alone", reads `WithListen` in its place.

   Three new facts reopen the owner's choice of `ExternalHandler`, of 20 November 2026
   ([`external-handler.md`](external-handler.md), "Decided"), which weighed the name of the function, `external`, and
   not the type's beside its twins: value 3 of "Deciding" came after it (`59791a2`, 24 November), and asks the same form
   for the same role; `Listener` is also the guide's word for what an `App` tells of each new state, so it leaves
   whatever is chosen; and a handler, in the glossary, is of a view, of a service or of `onEvent`, never of `external`.
4. **`Host` takes its view as `view`**, where it took it as `children`: `<Host program={counter}>{view}</Host>` becomes
   `<Host program={counter} view={view} />`, and `HostProps` has `view` in place of `children`. No precedent is
   reopened: point 3 of "Decided", in [`hosted-react.md`](hosted-react.md), settled the shape, a component with a render
   prop that takes `program`, its options and `fork`, and not the prop's name. By value 3 of "Deciding", the same role
   has the same form: the view is `view` in `drawInto` and in `Draw`, so it is `view` in `Host` too.
5. **Taken in by change 9.** `ObjectState` goes whole, so its four places in `AlwaysPlace`, `DeclareChild` and
   `DeclareChildById` go with it, and step 60 applies nothing under this number.
6. **The reference lists what a user writes first.** `site/typedoc.json` gets
   `"groupOrder": ["Functions", "Variables", "Classes", "Interfaces", "Type Aliases", "*", "Types of the signatures"]`,
   and the doc comment of each type marked "signatures" in the table gets a line `@group Types of the signatures` before
   its `@see` lines, which stay last, or as its last line where it has none. The module comment of `src/index.ts` says
   of that group: "The types under 'Types of the signatures' name what the functions take and return, for a package's
   declarations: the code of a program does not write them." `change-api`, in "Document it", gets one sentence at the
   end of the item on doc comments: "A type that only names what signatures take and return (`ProgramMaker`,
   `DeclareChild`, `WithRunCommand`) has `@group Types of the signatures` before its `@see` lines: the reference lists
   that group last."
7. **The glossary gets two rows, and one row a sentence.** Under "Messages that do not fit": "**Ignored**: what a
   message that `update` rejects is, where its rejection fails nothing: the state stays as it was. `onIgnored` hears
   each one in a run, and `simulate` and `rehearse` list them in `ignored`", linked to "Rejections and defects" and to
   the rules of "Testing tools". Under "A program made of programs", after **Instance**: "**`key`** (of `child`): a
   value from the parent's state, `child(program, { key })`. Where `key` gives another value, by `Equal`, the child
   starts again. A child with flags has no `key` beside them: other flags start it again", linked to "When a child is
   there". The row is titled by the option, in code form, as the row **`at`** is. The row **Rehearsal** ends with: "Its
   `run` runs a pending command: it is not the run that `start` gives".
8. **In prose, a key is a subscription's**: the row **Key** of the glossary, which stays as it is. The guide gave the
   word to two other things, and "a child's key" to both. Each gets words of its own, and each sentence changes its
   words alone, no weaker and no stronger. The comments that are no doc comments, the names of the tests and
   [`invariants.md`](../invariants.md) keep their words: the code beside them shows which key it is.
   - **What `key` gives for a child** is said with the option's name: "another value of `key`", "what `key` gives". In
     "Guarantees": "Other flags, or another value of `key`, by `Equal`, start a child again, as another instance"; and
     "**Flags, and what `key` gives, made of values that `Equal` compares by value.** Other flags, or another value of
     `key`, start a child again", with "for a key, what `key` gives, an id, flags or a value that an input stores" under
     it. In "Composition", "Children by id": "Keys, flags and what `key` gives are compared the same way". The skill's
     rule: "**Flags, and what `key` gives, are compared with `Equal`.** Other flags, or another value of `key`, start a
     child again, as another instance", and "for a key, what `key` gives, an id, flags or a stored value". In the
     changelog's unreleased section: "a child whose flags, or what its `key` gives, change starts again".
   - **The keys that a child's subscriptions list** are "the keys of a child's subscriptions", as in the tutorial, never
     "a child's keys"; and "a child with keys" reads as one declared with `key`. In "Composition": "A message of one of
     the child's subscriptions does not reach the parent's `update` once that subscription's key is gone"; "The keys of
     a child's subscriptions are wrapped as its commands are", which ends "The parent's `listen` makes the subscription
     of such a key with the child's own `listen`"; and "a child whose subscriptions list keys, with no `listen`" for "a
     child with keys and no `listen`", under "What does not compile" and under "What is a defect". In "Testing tools":
     "A key of a child's subscriptions names the child's instance, as". In "Testing": "The keys of a child's
     subscriptions are listed as". In "Anatomy of a program": "A parent lists the keys of each child's subscriptions
     as". In the changelog's unreleased section: "the key of a child's subscription, `[<child>, instance, key]`,
     becomes". In the doc comments, whose other words stay: of `KeyOf` (`src/program.ts`), "A parent's keys are its own,
     and the keys of its children's subscriptions, each of these as"; in `src/compose.ts`, of `At`, "Where a child's
     messages and commands, and the keys of its subscriptions, carry its id", of `ChildKeys`, "A key of a child's
     subscriptions, as its parent lists it", and of `Lifted`, "The keys of a child's subscriptions as its parent lists
     them"; and in the `@param key` of `hear` (`src/testing/rehearse.ts`), "A key of a child's subscriptions names the
     child and its instance".
   - **The `key` of an `Instance` and of a `Child` keeps its name**, and its doc comment says what it holds, which is
     the flags of a child with flags. Of `Instance`: "What the parent's state gave as the child started: the child's
     flags, or what the `key` of its declaration gave. Another one starts another child." Of `Child`: "What a state
     gives the child as it starts: its flags, or what the `key` of its declaration gives. `None` where the child is not
     there." The doc comment of the option `key`, on a child that is always there: "A value from the parent's state:
     another value, by `Equal`, starts the child again"; beside `there`: "A value from the parent's state, in a state
     where the child is there: another value, by `Equal`, starts the child again". The type `Child` says: "Another value
     of `key`, or other flags, start the child again, as another instance."
9. **A program's state is any value**, applied by step 62. `ObjectState` is removed, with `Fielded` and `Primitive`
   (`src/program.ts`): from `Shape`, from `ProgramChecked`, whose `state` is `StateOf<P>` with no `& object`, from the
   places of `child` and `childById`, from the configs of `MakeProgram` and `MakeParent`, and from `simulate`. The
   `state` of `ProgramTypes`, of `DeclaredTypes` and of the `Extract` of `Present` is `unknown`. `State extends object`
   is `State` in `partsOf`, `startWith`, `start`, `drive`, `rehearse` and its `rehearsing`, `HostProps` and `Host`. A
   parent keeps a child's model by the child's instance, as it keeps its lifted keys. The changelog has two entries,
   both breaking. "**Breaking**: `ObjectState` is removed: a program's state is any value, a number or a string too, and
   a state that is a type parameter compiles in `make`. Upgrade: drop `ObjectState` where a signature names it." And
   "**Breaking**: a child's model is kept while the child keeps the very same state, and no longer by its state object:
   two children in the very same state object make a model each, and a child started again in the state object it had
   makes its model anew. Upgrade: a view changes nothing, and draws such a child once more. A test that expected the
   very same model of the two compares them by value." The second is breaking by `release`, as a promise that no longer
   holds: "Composition", "A child's model is kept", said "It is the same object while the child's state is the same
   object", and a child whose `init` gives one constant state object is started again in it.
10. **`Applied` has no `revision`**, applied by step 63. The field leaves `Applied` (`src/engine.ts`), with `Revision`
    and `Revisioned` (`src/core.ts`): the engine's `current` gives the state. In "Running", "Options", the item "the
    `revision` of the state after the message" goes, and the two sentences on revisions become one: "When `update`
    returns the very state it was given, `after` is `before`." The example of "Logs" logs
    `Effect.logDebug("Message", message._tag)`. In the changelog: "**Breaking**: `Applied` has no `revision`. Upgrade:
    an `onApplied` that reads it counts, from 0, the messages it hears whose `after` is not `before`."
11. **Inputs go: what an element gives is a message that the model holds without it**, applied by step 64. Removed from
    `.`: `Input`, `InputById`, `DeclareInput`, `DeclareInputById` and `Written`; `input` and `inputById` of
    `ProgramMaker`; and `inputs` in the config of `make`, with the type parameter `I` of `MakeProgram` and of
    `MakeParent`. Removed from `./testing`: `placeViolations` and `PlaceViolation`. A program's messages are its own and
    its children's, and `forwardTo` names a child alone. Its parameters, and what it returns for a child, stay. Its two
    refusals (`ChildDispatch`, `src/dispatch.ts`) name no input: `"is not the literal name of a child"` for a name that
    is any string, and `"is not a child"` for a name that is no child's. Its doc comment, and those of `IdOf` and of
    `ChildDispatch`, say it of a child alone, with no line on `Written` and no `@see` of "Inputs". The guide promises
    the words of neither refusal, so they have no changelog line: the entry below says what becomes of a `forwardTo`
    that named an input. A program names the message of each value itself, as the examples name `NameTyped { value }`,
    held as `{ _tag: 'NameTyped' } as const`. In the changelog: "**Breaking**: inputs are removed: `input`, `inputById`,
    `Input`, `InputById`, `DeclareInput`, `DeclareInputById`, `Written`, `placeViolations` and `PlaceViolation`. What an
    element holds or reports is a message that the model holds without its value, and that the view fills. Upgrade: an
    input `Name` becomes a message of the program, as `NameTyped { value }`. `update` stores the value where the input's
    place was there, in the form that `store` gave it, and rejects the message elsewhere. The model holds
    `{ _tag: 'NameTyped' } as const` in each case where its view draws the field to be typed into. A write sent
    through `forwardTo(dispatch, 'Name')` becomes `dispatch({ ...model.nameTyped, value })`. An input by id becomes a
    message with its `id`. A test that called `placeViolations` tests `update`." The unreleased entries on `store`, on
    `placeViolations` and on what a `set` changes are in no release, and go.

## Each export

"Kept" is kept as it is, and "Signatures" is kept with the tag of change 6. The six leads of the step are decided with
them: the stages of `program` keep their names, listed last (change 6); the testing tools are called alike, and keep
their names (changes 1 and 2); `Interpreter` and `ExternalHandler` are named as their twins are (change 3); `reject` and
`onIgnored` stay, with a row of the glossary (change 7); `ObjectState` goes (change 9, which took in change 5); and a
`key` beside the `flags` of a child is parked.

| Entry                | Exports                                                                                                                                                | Decision                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `.`                  | `program`, `Program`, `AnyProgram`, `Step`, `Transition`, `Rejected`, `Folded`, `reject`, `andThen`                                                    | Kept                                                        |
| `.`                  | `StateOf`, `ModelOf`, `MessageOf`, `CommandOf`, `EventOf`, `ExternalOf`, `FlagsOf`, `OutputOf`, `KeyOf`, `CommandServicesOf`, `SubscriptionServicesOf` | Kept: each is a name of `Program<{ … }>`, with `Of`         |
| `.`                  | `Init`, `Update`, `RunCommand`, `Listen`, `Subscriptions`                                                                                              | Kept: the type of a piece has the piece's name              |
| `.`                  | `Execution`, `Subscription`, `Dispatch`, `ChildById`, `Kept`                                                                                           | Kept                                                        |
| `.`                  | `forwardTo`                                                                                                                                            | Kept; its refusals name a child alone (change 11)           |
| `.`                  | `Written`, `Input`, `InputById`                                                                                                                        | Removed (change 11)                                         |
| `.`                  | `Child`, `Instance`                                                                                                                                    | Kept, with the name of their `key` (change 8)               |
| `.`                  | `start`, `Started`, `App`, `RunOptions`, `Ignored`, `Origin`, `defect`, `InvariantDefect`, `ProgramDefect`, `CompositionDefect`, `DefectSite`          | Kept                                                        |
| `.`                  | `Applied`                                                                                                                                              | Changed: no `revision` (change 10)                          |
| `.`                  | `ProgramMaker`, `ParentMaker`, `MakeProgram`, `MakeParent`, `DeclareChild`, `DeclareChildById`, `DeclareChildren`                                      | Signatures; no `input`, `inputById` or `inputs` (change 11) |
| `.`                  | `DeclareInput`, `DeclareInputById`                                                                                                                     | Signatures, until change 11 removes them                    |
| `.`                  | `Field`, `FlagsOption`                                                                                                                                 | Signatures                                                  |
| `.`                  | `ObjectState`                                                                                                                                          | Signatures, until change 9 removes it                       |
| `.`                  | `Interpreter`, `Listener`                                                                                                                              | Changed: `WithRunCommand`, `WithListen`; signatures         |
| `.`                  | `ExternalHandler`                                                                                                                                      | Changed: `WithExternal`, no longer exported                 |
| `./testing`          | `applyAll`, `simulate`                                                                                                                                 | Changed: called in one step (change 1)                      |
| `./testing`          | `Simulation`                                                                                                                                           | Changed: `Simulated`                                        |
| `./testing`          | `rehearse`, `Rehearsal`, `drive`, `Driver`, `DriveOptions`, `stateOf`, `dispatchViolations`, `DispatchViolation`                                       | Kept                                                        |
| `./testing`          | `placeViolations`, `PlaceViolation`                                                                                                                    | Removed (change 11)                                         |
| `./snabbdom`         | `drawInto`, `View`                                                                                                                                     | Kept                                                        |
| `./snabbdom/testing` | `messagesSentBy`                                                                                                                                       | Kept                                                        |
| `./react`            | `Draw`, `Host`, `Fork`, `View`                                                                                                                         | Kept; `Host` is given its view as `view`                    |
| `./react`            | `HostProps`                                                                                                                                            | Changed: `view` in place of `children`                      |
