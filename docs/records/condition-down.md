# A condition that goes down from a parent to its children

**Status:** decided on 25 November 2026, as step 79 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md), and read by a session of Opus 5.5 that wrote none of it: a
`tell` declared from the parent's own state is taken, as step 80, which holds its form. Nothing of the library was
changed. The spike is `79a984e` on `spike/condition-down`, never to be merged. What follows was **run** there (Bun
1.4.5, Windows, TypeScript 7.0.2, Effect 4.1.5), but where it says reasoned.

## The program, and the pattern by hand

A condition of a parent that its children must know while they live is handed down by hand ("Events and external
messages", "A child that must wait for its parent"). `examples/cart/` is such a parent: its rows, children by id with
a command of their own, are locked from the payment on. A cart may start while paying, and a row may start while a
payment runs. One suite reads each form through its model: five cases, and a property over random histories, that
every row shows its controls, and takes what they send, exactly where the cart is not locked.

By hand the cart keeps three rules: it tells every row at each change of the lock, it tells each row that starts
later, and, since a first step tells nothing, it keeps the first value of the lock in a field that never changes, for
the rows' flags. Each rule broken compiles, and fails only the property and the cases that name it.

## The four forms

| On the same program                 | Rules left to the cart | The row                   | Lines of the cart |
| ----------------------------------- | ---------------------- | ------------------------- | ----------------- |
| By hand                             | three                  | a copy, flags, `external` | 50                |
| 1. A `tell` declared from the state | none                   | a copy, `external`        | 29                |
| 2. A value that the row reads       | none                   | no copy, a parameter      | as form 1         |
| 3. A first step that tells          | two, of telling        | a copy, `external`        | 45                |

**1. A `tell` declared from the state**: one line of the cart, and 113 lines of `src/compose.ts`, 45 of them the
telling (`sync`). The tests of the library pass with it, unchanged.

- **One value for the children of a declaration.** With the id of each child, a step of the parent's own that changes
  nothing costs a call and a comparison for each: 1 ms at 10,000 children where `tell` gives a constant, 9 ms where it
  gives a literal. With one value it costs two calls of `tell`, 0.6 µs to 2.4 µs at every size, for 0.3 µs to 0.6 µs by
  hand. A change of the value costs what telling by hand costs, and a step that starts 10,000 children 4.8 ms to
  6.0 ms, for 2.4 ms where they are told nothing (`spike/bench-tell.txt`).
- **No field of the state.** Within a call, the call keeps what it told. Between two calls every child was told what
  the own state gives, where the program made that state. So a child is told a value only where it is another than
  the last it was told, also where its answer makes the parent change the value again, or back: a property of the
  reviewer's, over histories where each answer raises an event, found no hole. Read from the own state of before
  alone, it was not exact. Kept in each instance, it was, and set right a state that another program made.
- **The types.** As a plain function type, the literal that `tell` returns loses its tag (`_tag: string`). Under a
  conditional type it keeps it, with TypeScript 5.9.3, 6.0.3 and 7.0.2 (`examples/cart/tell-types.ts`).
- **Found by the review, and left to step 80:** `stateOf` runs the handlers of `onEvent`, and may give another own
  state than the one it was given; a child of any name that starts makes every name tell again, 750 µs for 2.5 µs at
  10,000 children; and an event of the parent's own, raised as the program starts, has nowhere to go.

**2. A value that the row reads**, the mirror of `output` (`examples/cart/given.ts`): no copy, and a change of the
lock at 10,000 rows costs 2 ms, for 23 ms told. The row was written as an object and cast: each reader of a program's
types refuses a piece of two parameters. Reasoned, from the code: a name in `program`, a parameter on five pieces, an
option in `start` and in three tools, and a child that cannot answer a change with a step.

**3. A first step that tells** (`examples/cart/init-tells.ts`, two lines of the engine) removes the field kept apart,
and neither rule of telling.

## Decided

- **Form 1 is taken**, by value 3 over value 5. A condition goes down one way, and a user keeps three rules less, for
  an option of two declarations and no piece of a program: a child stays a program like any other. Value 2 asks for
  nothing here, since a rule broken leaves only a user's own bug. It costs the engine 113 lines, a defect, an
  invariant and a limit: a state that another program made is not set right.
- **It reopens "`init` tells nothing"** ([`kept-children.md`](kept-children.md)): a first step still lists no `tell`,
  but its state tells, so a child's `external` and the parent's `onEvent` run in it. The new fact is this form. It
  does not reopen `listening`, which asks nothing of the child: here only a child that must know keeps a copy.
- **The word is `tell`**, in a step and in a declaration: one concept, an external message that a child is told, from
  two places.
- **An event of the parent's own raised as the program starts is a `CompositionDefect`.** A first step that carries
  events would let that program run, and changes `init` for every program and each tool that starts one: reasoned,
  not run, and parked. The defect becomes that later with no break.
- **Forms 2 and 3, the id and the field are refused** (`docs/rejected.md`). Form 2 leaves two ways, since a child that
  must answer a change is told by hand again, and its symmetry with `output` is of form, not of cost.
