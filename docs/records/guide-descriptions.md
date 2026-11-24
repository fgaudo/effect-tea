# The guide's descriptions, sorted by what they hold

**Status:** sorted on 24 November 2026 by a read-only session of Opus 5.5 that the owner asked for, after the answer of
Effect-TS/effect PR 10878 showed how Effect documents what it does not promise: it says briefly that something "is
unspecified", and does not describe it. Its four findings that do not match were checked against the code by the
session that wrote this record, the fourth on one of its cases; the rest is the review's reading, to be checked item
by item by step 48 of [`ROADMAP.md`](../../ROADMAP.md) before it is applied. Nothing is decided yet. Last read against
the code at `635fcff`.

## In short

Of the 87 descriptions of the guide (each `Precisely` section, and each sentence elsewhere that says it is described
and not promised, "What is left to you" aside), 69 stay, 10 could say only that the behaviour is unspecified, and 8 may
deserve to be promises. Most of "Precisely" is not how the engine works inside: it is what a testing tool fails on,
what a defect reports, advice, what a renderer does, or a promise of another page said again. The ten would take about
11 of the 488 lines of "Precisely". What they free is mutations and tests, not prose, and the review found four places
where the guide's strength and what checks it do not match.

## Four that do not match

1. **Four mutations name a guarantee for what the guide describes.** In `tools/mutations/mutations.ts`, each names an
   item of "What you can rely on" in `guarantees`, for a behaviour that `running.md` describes and does not promise:
   - "a listener added during a notice is told of it", which names "One message at a time, in the order they were
     sent";
   - "a listener that throws keeps the others from being told", which names "Nothing ends in silence";
   - "a self-interruption beside one the fiber received is no defect", which names "Nothing ends in silence", and
     whose killer is the case that `running.md` and `guarantees.md` describe;
   - "what a fiber with a scope of its own ends with tells defects apart by value", which names "Nothing ends in
     silence", for the two equal defects that `running.md` describes ("The defects in the cause").

   Either the guarantee covers the case, which makes it a promise, or the tag is wrong.
2. **A promise rests on a description.** `testing.md`, "The number of an instance", promises that the instances are
   numbered "in the order the library starts them", and shows tests that write `instance: 2`. When one state lists
   several children anew, that order is the one `composition.md` gives under "The order of the starts", which says
   "This is described, not promised". A test written by the guide breaks if the order changes.
3. **"What does not compile" sits under "Precisely"**, in `anatomy-of-a-program.md` and `composition.md`, so the guide
   makes it a description. But the second rule of the types in `AGENTS.md` owes every refusal it lists, and the
   `refuses` field of the mutations, with `bun run comments`, checks each item as a guarantee is checked.
4. **Several items of "Precisely" say again a promise of another page**, so their place gives them no strength of
   their own: `update.md` (a message that makes no new model), as `running.md` promises; the keys of
   `anatomy-of-a-program.md`, as `testing.md` promises; a defect met as the run ends, in `running.md`, as the same page
   promises in "Rules"; the dropped messages of `subscriptions.md` and the release of `commands.md`, as
   `guarantees.md` promises. Nothing needs to change for them; a change of the promise rereads them.

## Unspecified (10)

Each with the sentence that would replace it, and what checks it today, as the review found them.

1. **`anatomy-of-a-program.md`, "What does not compile": which function refuses each kind of program** (`make`, or a
   function that takes the program). The first words of each item stay, since `refuses` matches items by them, and
   after the list: "Which function refuses it, `make` or one that takes the program, is unspecified." It frees
   nothing: the rules of the types still owe a refusal by every form. Tests: `compose.test.ts` ("a state without
   fields holds a number too: refused as written, by make, and where a program is a child"), and `formsRefused` of the
   inference matrix.
2. **`composition.md`, "When the children are compared"**: "When the library compares them is unspecified. Flags or a
   key made anew at each call start the child again (see what is left to you)." Tests: `compose.test.ts` ("children
   by id whose ids give the very same object are left as they are, and others are reconciled"), and the mutation
   "children by id are reconciled when their ids are the very same object".
3. **`subscriptions.md`, "Where `listen` runs"**: "When and in which fiber `listen` is called is unspecified", and the
   sentence on what it throws stays. No test of the fiber was found; the defect's place, which stays, is held by
   `engine.test.ts` and `contract.test.ts`, and the mutation "a listen that throws in the engine is no defect of its
   subscription".
4. **`running.md`, a listener added while the listeners are told**: "Whether a listener added while the listeners are
   told of a state is told of that state is unspecified. The notice still ends." The second sentence may deserve to
   be a promise: without it, a listener that adds another each time it is told loops. Tests: `engine.test.ts` ("a
   listener stopped during a notice is not told of it, and one added during a notice is told from the next"), and the
   first mutation of "Four that do not match".
5. **`running.md`, "A listener that throws"**: "A listener that throws is a defect, in `'render'`. Whether the other
   listeners are told of that state is unspecified." Tests: `engine.test.ts` ("defects are recorded in the order they
   happened, and a listener that throws leaves the others told"), and the second mutation of "Four that do not match".
6. **`running.md`, the numbered order in which the run ends**: "When the run ends, because of a defect or of an
   interruption, it stops applying messages first, and stops its commands and its subscriptions. The order of the rest
   is unspecified." Tests: `engine.test.ts` ("once the end has stopped the engine, nothing sent is applied", "the end
   stops the fiber of effects held by a release…"), whose mutations hold promises too: it likely frees none.
7. **`running.md`, on which stack the end begins**: "On which stack the end begins is unspecified. It never begins
   inside a step." The second half stays, held by the mutation "the end of the run may begin inside a step", which
   names "One message at a time", and may deserve to be a promise. No test of the first half was found.
8. **`running.md`, "The defects in the cause", their order**: "The order of the defects in the cause is unspecified."
   `docs/rejected.md` already says that this order is no promise. `rehearse` and `drive`, whose page says that the
   defect comes first, keep it. Tests: `engine.test.ts`, `run.test.ts` ("a command that dies before another, which its
   release lets die, is the first defect of the cause"), and the mutation "a defect is recorded after the release of
   its scope".
9. **`running.md`, "The defects in the cause", a self-interruption as the run stops it**: "Whether a command or a
   subscription that interrupts itself while the run stops it dies of a defect is unspecified."
10. **`guarantees.md`, the same case under "Nothing ends in silence"**: "Whether one that interrupts itself while the
    run stops it is a defect too is unspecified (see the defects in the cause)." Items 9 and 10 are the case that step
    46 weighs. Tests: `run.test.ts` ("a subscription that interrupts itself as the run stops it is a defect in the
    subscription", `describe("a release that interrupts itself")`), `engine.test.ts`, and the third mutation of "Four
    that do not match"; the mutation "a self-interruption is no defect" holds the promise and stays.

With items 8 and 9, the sentence of `running.md` "Two cases of this are described" would say that they are
unspecified. Up to five mutations would go, with the cases of their tests: the first three of "Four that do not match",
"a defect is recorded after the release of its scope" where no other test holds it, and "children by id are reconciled
when their ids are the very same object".

## Promote? (8)

What users may already build on. The review decided none.

1. **"What does not compile"**, in `anatomy-of-a-program.md` and in `composition.md`: the third of "Four that do not
   match". Tests: the mutations with `refuses`, and the tests of the types in `compose.test.ts` and `program.test.ts`.
2. **`events-and-external-messages.md`, "The order inside a step"**: a handler of `onEvent` reads the outputs after the
   child's step. A handler that reads what the child just saved is written on it. Tests: `compose.test.ts` ("a handler
   of onEvent reads the outputs as the child's step left them"), and the mutation "a handler of onEvent reads the
   outputs of before the child's step".
3. **`events-and-external-messages.md`**: an external message never writes into an input, whatever its `_tag`. Test:
   `compose.test.ts` ("an external message tagged like an input is the program's to answer, never a write"). No
   mutation was found.
4. **`composition.md`, "The order of the starts"**: the second of "Four that do not match". Test: `compose.test.ts`
   ("init starts each child its first state lists, with its first commands, by the order of the names, then of the
   ids"); the mutation "init starts no child" does not check the order.
5. **`running.md`: plain code stops a run, and waits for it, with `Fiber.interrupt`**, the run ending once its commands
   and subscriptions are stopped and released. Applications build their `stop()` on it. Tests: `engine.test.ts` ("when
   the run ends, what still runs is interrupted before its resources are released"), `describe("the end of the run")`
   in `run.test.ts`.
6. **`writing-a-bridge.md`: the bridges draw any native controlled element.** The promise of `guarantees.md` on what a
   screen shows sends the reader there. Tests: `bridges/bridge.test_suite.ts`, in Bun and in the browsers.
7. **`writing-a-bridge.md`: what `messagesSentBy` gives**, `target` and `currentTarget` its element, `reports` laid over
   the view, a field not given `undefined`. It is the behaviour of an export, `./snabbdom/testing`, that users' tests
   are built on. Tests: `bridges/snabbdom-testing.test.ts`.

The first is counted twice, once a page.

## Stays

The 69 others, by kind: what a testing tool fails on or what a test sees (all of `testing-tools.md`), what a defect
reports and where, advice that a user acts on (a type parameter in a field, `strict`, what outlives a command), how to
use Effect's API (a `Stream` or a source of callbacks as a subscription), what a renderer or React does, a reason, and
a promise said again. One was weighed between unspecified and a promise and kept: two releases of one scope that die of
defects equal by `Equal` are two (`running.md`), which "Every defect is in the cause" may already promise; its mutation
is the fourth of "Four that do not match".
