# `hear` and `hearNext` by a predicate

**Status:** decided on 26 November 2026, as step 98 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Opus 5.5, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md). Each claim is **run**, by a test or a check that the text
names, or **reasoned**.

## The question

A rehearsal's `run` takes `(command) => boolean`, and `hear` and `hearNext` took a whole key, which for a child names
its instance: `{ _tag: 'Row', id, instance: 1, key: 'ticks' }`. A test of a parent counted the starts to hear a child,
and an application wrote a function that built the key
([`application-report-0.9.md`](application-report-0.9.md), point 6). One role had two forms.

## Decided

**`hear(select, message)` and `hearNext(select)`, with `select: (key: unknown) => boolean` over the keys of the
current state, as the program lists them. The test fails where `select` matches no key, and where it matches more than
one. The form by key goes, with a breaking change.**

- **One form for one role** (reasoned, value 3): a rehearsal's `run`, `hear` and `hearNext` each pick what the test
  acts on by a predicate over what the current state holds. A test reads a child's `_tag`, or its `id`, and counts no
  start.
- **No key matched, or two, fails the test** (**run**: "hear and hearNext fail the test when select matches more than
  one key, naming each", and the tests of "No key of the current state matches", in `src/testing/rehearse.test.ts`;
  the mutation "hear and hearNext take the first of the keys select matches"). `run` takes the oldest of the commands
  it matches, since pending commands have an order; the keys of a state have none, so a second match is ambiguous,
  and the error names each key matched, or every key of the state.
- **`select` takes `unknown`** (reasoned): a key of the program's type was rejected for `hear`
  ([`rejected.md`](../rejected.md), "A subscription made from its key alone, in other forms"), and a `Rehearsal` has
  no parameter for its keys. `(key) => key === 'ticks'` and `Predicate.isTagged(key, 'Clock')` narrow `unknown` with
  no annotation; `Equal.equals(key, …)` compares by value, as the run does.
- **What `select` throws is the test's** (**run**: "fails the test with what select throws, a key's Equal included").
  The lookup by key called the key's `Equal`, a defect of `subscriptions`, as in the run. The keys of the state are now
  read, not compared, and only the test's own predicate may call `Equal`. The mutation that recorded that defect in
  `update` went with its check.
- **The program's key, not the test's, from then on** (reasoned, value 5): the call carries the key it found, so the
  engine is given a subscription's message under the key the program listed, with no cast.
