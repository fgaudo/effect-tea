import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive, rehearse, simulate } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { Command, Draft, form, type Message, type Model, type State, update } from "./form.ts"
import { Storage, StorageError } from "./storage.ts"
import { view } from "./view-snabbdom.ts"

const empty = form.init.state

// What may be typed: any text, blank ones among them.
const text = fc.oneof(fc.string(), fc.constant("   "))

// A name that a save takes, as typed, and as it is saved: trimmed.
const savable = fc.tuple(fc.constantFrom("", " "), fc.string(), fc.constantFrom("", " ")).map(([before, name, after]) =>
  `${before}${name.trim() === "" ? "Ada" : name}${after}`
)
const trimmed = savable.map((name) => name.trim())

// Any valid state, made anew on each draw, so that two states drawn alike share no object. Only a name that is not
// blank is saved, and a save, failed or done, names it trimmed.
const state = (): fc.Arbitrary<State> =>
  fc.record({
    draft: fc.oneof(
      fc.record({ name: text, failed: fc.option(trimmed, { nil: undefined }) }).map(({ name, failed }) =>
        Draft.Editing({ name, failed: Opt.fromUndefinedOr(failed) })
      ),
      fc.record({ name: savable }).map((saving) => Draft.Saving(saving))
    ),
    saved: fc.array(trimmed, { maxLength: 3 })
  })

/** An editing draft with this name, and no failure. */
const editing = (name: string): State => ({ ...empty, draft: Draft.Editing({ name, failed: Opt.none() }) })

// What the model holds, in the order the view draws it: what is typed, filled with the text given, where the model shows
// an editor, then Save.
const messagesOf = ({ editor }: Model, text: string): ReadonlyArray<Message> =>
  editor._tag === "Saving" ? [] : [
    { ...editor.typed, value: text },
    ...(editor._tag === "Named" ? [editor.save] : [])
  ]

// What a user could ask of the form, a tag at a time, so that a new message does not compile here until the test
// says what a user could ask with it: the save's answers are its command's. What is typed is the text given, in every
// state, so that a field that takes it where the model shows no editor is missing.
const candidatesOf = (text: string): ReadonlyArray<Message> =>
  Object.values(
    {
      NameTyped: [{ _tag: "NameTyped", value: text }],
      SaveClicked: [{ _tag: "SaveClicked" }],
      SaveSucceeded: [],
      SaveFailed: []
    } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
  ).flat()

/** What the user types, where the model shows an editor, as the view sends it. */
const typing = (model: Model, text: string): Opt.Option<Message> =>
  model.editor._tag === "Saving" ? Opt.none() : Opt.some({ ...model.editor.typed, value: text })

const working = Storage.of({ save: () => Effect.void })
const failing = Storage.of({ save: (name) => Effect.fail(new StorageError({ cause: name })) })

describe("form", () => {
  // `update` alone: the rules, without running anything.
  describe("update", () => {
    test("saves a name that is not blank, trimmed", () => {
      const { state, commands } = applyAll(update, [{ _tag: "SaveClicked" }], editing(" Ada "))
      expect(state.draft).toEqual(Draft.Saving({ name: " Ada " }))
      expect(commands).toEqual([Command.Save({ name: "Ada" })])
    })

    test("rejects saving a blank name, and a second save", () => {
      const saving = { ...empty, draft: Draft.Saving({ name: "Ada" }) }
      expect(update({ _tag: "SaveClicked" })(editing("  "))).toBe(reject)
      expect(update({ _tag: "SaveClicked" })(saving)).toBe(reject)
    })

    // Only the save in progress can complete: a completion anywhere else is a bug, not a message to ignore.
    test("dies on a completion with nothing saving", () => {
      const failed = { ...empty, draft: Draft.Editing({ name: "Ada", failed: Opt.some("Ada") }) }
      expect(() => update({ _tag: "SaveSucceeded", name: "Ada" })(empty)).toThrow(InvariantDefect)
      expect(() => update({ _tag: "SaveFailed", name: "Ada" })(failed)).toThrow(InvariantDefect)
    })

    test("stores what is typed, as it is typed, and keeps the name a save failed on", () => {
      const failed = { ...empty, draft: Draft.Editing({ name: "Ada", failed: Opt.some("Ada") }) }
      const { state } = applyAll(update, [{ _tag: "NameTyped", value: " Ada x" }], failed)
      expect(state.draft).toEqual(Draft.Editing({ name: " Ada x", failed: Opt.some("Ada") }))
    })

    // While saving, the name cannot be typed into: what is typed, as a script may send it into the read-only field, is
    // rejected, so the failure gives back the name that was saved.
    test("rejects what is typed while saving", () => {
      expect(update({ _tag: "NameTyped", value: " Ada x" })({ ...empty, draft: Draft.Saving({ name: " Ada " }) }))
        .toBe(reject)
    })

    test("a completed save leaves the form as it starts, with the name listed", () => {
      const { state } = applyAll(
        update,
        [{ _tag: "SaveClicked" }, { _tag: "SaveSucceeded", name: "Ada" }],
        editing("Ada")
      )
      expect(state).toEqual({ ...empty, saved: ["Ada"] })
    })

    test("has nothing to type into while saving", () => {
      expect(form.makeModel({ ...empty, draft: Draft.Saving({ name: "Ada" }) }).editor._tag).toBe("Saving")
    })
  })

  // The model, for any state: every message it holds is accepted, a double click saves once, and nothing `update`
  // accepts is missing. What is typed is filled with a text drawn, other than the one the model shows: the same text
  // would change nothing.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state(), text, (before, typed) => {
      const model = form.makeModel(before)
      fc.pre(typed !== model.name)
      expect(dispatchViolations(update, {
        state: before,
        held: messagesOf(model, typed),
        candidates: candidatesOf(typed)
      })).toEqual([])
    }))
  })

  // The view draws what its model holds, each control once: `messagesSentBy` finds what it sends without a DOM, and the
  // test compares it with the reader. The field is drawn with the name the model holds, and sends the text it holds.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state(), text, (before, typed) => {
      const model = form.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual(messagesOf(model, model.name))
      expect(messagesSentBy<Model, Message>(view, model, () => ({ element: { value: typed } })))
        .toEqual(messagesOf(model, typed))
    }))
  })

  // Two equal states built apart, by the same seed drawn twice, give two equal models, which a function in a model
  // would break, being made anew by each `makeModel`.
  test("the model is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(state(), { seed, numRuns: 1 })
      const [other] = fc.sample(state(), { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(form.makeModel(one), form.makeModel(other))).toBe(true)
    }))
  })

  // `update` and the commands, with the storage provided: what each outcome leaves.
  describe("saving", () => {
    const typedAndSaved: ReadonlyArray<Message> = [{ _tag: "NameTyped", value: " Ada " }, { _tag: "SaveClicked" }]

    test("a saved name is listed, trimmed, and the form empties its field", async () => {
      const { state, ignored } = await Effect.runPromise(
        simulate(form, typedAndSaved, form.init).pipe(Effect.provideService(Storage, working))
      )
      expect(state).toEqual({ draft: Draft.Editing({ name: "", failed: Opt.none() }), saved: ["Ada"] })
      // The save's completion reached `update`: a rejected one would mean a form stuck saving.
      expect(ignored).toEqual([])
    })

    test("a failure gives the form back, as it was, and says so", async () => {
      const { state } = await Effect.runPromise(
        simulate(form, typedAndSaved, form.init).pipe(Effect.provideService(Storage, failing))
      )
      expect(state).toEqual({ draft: Draft.Editing({ name: " Ada ", failed: Opt.some("Ada") }), saved: [] })
    })

    // The save waits until the test runs it: what the user can do meanwhile, and what its answer finds.
    test("while saving, the form has nothing to do; a failure gives it back, to save again", async () => {
      const save = ({ editor }: Model) => editor._tag === "Named" ? Opt.some(editor.save) : Opt.none()
      const { whileSaving, afterFailure } = await Effect.runPromise(
        rehearse(
          form,
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.send((model) => typing(model, " Ada "))
            yield* rehearsal.send(save)
            const whileSaving = (yield* rehearsal.model).editor._tag
            yield* rehearsal.run((command) => command._tag === "Save")
            const afterFailure = yield* rehearsal.model
            yield* rehearsal.send(save)
            yield* rehearsal.runAll
            return { whileSaving, afterFailure }
          })
        ).pipe(Effect.provideService(Storage, failing))
      )
      expect(whileSaving).toBe("Saving")
      expect(afterFailure.editor._tag).toBe("Named")
      expect(afterFailure.failed).toEqual(Opt.some("Ada"))
    })
  })

  // The program as it runs, driven like a user would.
  test("a user types a name and saves it", async () => {
    const saved = await Effect.runPromise(
      drive(
        form,
        Effect.fnUntraced(function*(driver) {
          yield* driver.send((model) => typing(model, "Ada"))
          yield* driver.send(({ name, editor }) =>
            name === "Ada" && editor._tag === "Named" ? Opt.some(editor.save) : Opt.none()
          )
          return yield* driver.waitFor((model) => model.saved.length > 0 ? Opt.some(model.saved) : Opt.none())
        })
      ).pipe(Effect.provideService(Storage, working))
    )
    expect(saved).toEqual(["Ada"])
  })
})
