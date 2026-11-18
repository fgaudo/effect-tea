# Roadmap

Open problems and possible improvements, found in a review of the project (November 2026). Nothing here is a
promise: each item is decided before it is done, against the rules of [`AGENTS.md`](AGENTS.md). Remove an item
when it is done, with the reason in the commit. An item rejected is removed and added to
[`docs/rejected.md`](docs/rejected.md), with why and on what evidence, in the same commit: read it before adding one.
An item deferred or suspended leaves too, for "Parked, not rejected" there, with what would reopen it: this list
holds only what is to be done or decided now.

## Open problems

A lead of the search (`bun run interleavings`) goes here with its seed and path, until a fix leaves a deterministic
test of it. None is open.

Found in a review of 18 November 2026, each reproduced:

- **`rehearse` drops a step's commands from `pending` when `makeModel` dies on its state.** `applyNow`
  (`src/testing/rehearse.ts`, case `Applied`) owes the commands after `draw`, in one chain, so a defect in `'render'`
  skips `Ledger.owe`, and the release of the keys that went away. The run starts those commands, as a step goes on
  whole ("Defects always die", `docs/invariants.md`), and the guide says `pending` is read after a defect. The rehearsal
  still fails with the right `ProgramDefect`. A case for `contract.test.ts` compares the commands after a render defect
  on a step that has some; then owe them whatever the draw's exit, with a mutation.
- **An own message or command whose `_tag` is `string` gets past `NoClash`** (`src/compose.ts`):
  `Extract<TagOf<Own>, keyof C>` is `never` for `string` (and a template tag), so `{ _tag: 'Page' }` reaches the child
  `Page` with no `message`, and a command's answer `{ _tag: 'Name', message: … }` is stored as a write into the
  program's own input, which "Composition" ("What does not compile") says does not compile. Turning the test around,
  `Extract<keyof C, TagOf<Own>>`, as `ExternalWritten` does, would refuse them; whether it refuses a correct program
  (`message: any`) is for the inference matrix.
- **A parent's subscriptions cannot send a child's external messages, though its commands can**: `runCommand` answers
  `Own | ChildExternals<C>`, `subscriptions` only `Own`. Every program can still be written, through an own message
  and `children.<child>.update`, and both are sources of messages the run handles alike. To decide: allow it, or say
  in "Composition" why the two differ.
- **The readers of a program's services promise a rule the guide does not hold**: `CommandServicesOf` and
  `SubscriptionServicesOf` (`src/program.ts`) say they are `unknown` when the program's type does not say which
  services it needs, and then whoever runs it is told so. No section states it, and the type readers (`StateOf`,
  `ModelOf`, `CommandOf`, `FlagsOf`, `ExternalOf`, `EventOf` and those two) have no `@see`. Either the rule goes into
  "Anatomy of a program" ("Precisely") with the `@see` lines, or it leaves the comments.
- **`simulate`'s declaration spells out `Simulation` and `Step`**: it has no return type written, so
  `api/effect-tea-testing.api.md` writes its `from` and its result inline, though `Simulation` is exported
  (`change-api`, "Report it").
- **The failure of `drive`'s `patience` carries an `Option` of the model** as its `cause`, not the model: say so where
  the guide describes it, or give the model itself.

## Possible improvements

- **A benchmark that runs in the CI** (many children, many messages per second), to keep "frames cost only what is
  drawn" from regressing. `bun run bench` (`tools/bench/subscriptions.ts`) measures a parent's subscriptions only, and
  `tools/bench/writes.ts`, run by hand, what a write into an input and a bridge's frame cost; neither runs in the CI.

## Ideas, to be decided

- **Bridges as packages of their own** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`): the library
  stays free of renderers, and users stop copying `examples/bridges/snabbdom.ts` and `examples/bridges/react.ts`.
- **A devtools bridge over `onApplied`** (e.g. Redux DevTools), with time travel through `init: { state }` and
  replay through `applyAll`.
- **An example of routing**: flags from the URL, `popstate` as a subscription, navigation as a command.
- **An example of hot module reloading** that keeps the state, which the guide hints at (the view lives in a
  module of its own) without showing.
- **What 1.0 needs**: the API looks close to stable; what `docs/rejected.md` parks would change it, and is weighed
  before freezing it.
