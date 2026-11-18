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

To be done first. Found in a review of the exported types, 18 November 2026, each tried on a copy of the repository
outside git, not kept, with TypeScript 7.0.2, unless it says otherwise:

- **`make` returns a `Program<…>` that names six types as `never`** (`command: never; commandServices: never;
  subscriptionServices: never; event: never; external: never; flags: never`), in the hover and the declarations of every
  program, where the program named three. Tried: `MakeProgram` (`src/compose.ts`) returning `Program<{ state; model;
  message } & Having<{ command; commandServices; subscriptionServices; event; external; flags }>>`, with `type Having<T>
  = { [K in keyof T as [T[K]] extends [never] ? never : K]: T[K] }`. The types hold (typecheck, tests and the inference
  matrix passed), and a counter reads `Program<{ state: …; model: …; message: … }>`; but a program with more reads as an
  intersection of two object types. To do: a form that prints one object type (a mapped type over all nine was not
  tried: `Program` asks that `state` be an object, which may not hold for it), then the API report and the smoke test.
- **`DeclareChild`, `DeclareChildById`, `DeclareInput` and `DeclareInputById` take all the types a program declares
  and use only its state** (`Field<T, 'state'>`, `src/compose.ts`): a consumer's declaration reads
  `DeclareChild<{ state: State; message: ResetAll }>`. `DeclareChild<State>` would say what each depends on; only
  `MakeProgram` needs the rest. Not tried.
- **`RunOptions<Message, State, Command>` and `DriveOptions` order their parameters unlike every other type**, which
  starts from the state (`Applied<State, Message, Command>`, `Ignored<State, Message>`,
  `Update<State, Message, Command, Event>`). Changing the order breaks whoever annotates options: to decide before 1.0.
  Not tried.

Found in a review of 18 November 2026, each reproduced:

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
- **`drive`'s declaration spells out `DriveOptions` for a program with flags** (`change-api`, "Report it"):
  `DriveOptions` is an alias of an intersection, and intersected again with `FlagsOption` it reads
  `RunOptions<…> & { readonly patience?: … } & …` in `api/effect-tea-testing.api.md`.
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
