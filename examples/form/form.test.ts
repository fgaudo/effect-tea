import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive, rehearse, simulate } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as fc from "fast-check"
import { Command, form, type Message, type Model, Save, type State, update } from "./form.ts"
import { Storage, StorageError } from "./storage.ts"
import { view } from "./view-snabbdom.ts"

const empty = form.init.state

// Made anew on each draw, so that two states drawn alike share no object.
const state = (): fc.Arbitrary<State> =>
  fc.record({
    name: fc.oneof(fc.string(), fc.constant("   ")),
    save: fc.oneof(
      fc.constant(null).map(() => Save.Idle()),
      fc.constant(null).map(() => Save.Saving()),
      fc.record({ name: fc.string() }).map((failed) => Save.Failed(failed))
    ),
    saved: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 })
  })

// What the model holds: the messages of its controls, a case at a time. What is typed is none of them.
const messagesOf = ({ editor }: Model): ReadonlyArray<Message> => editor._tag === "Named" ? [editor.save] : []

// What a user could ask of the form, a tag at a time, so that a new message does not compile here until the test
// says what a user could ask with it: the save's answers are its command's, and what is typed is the input's.
const userMessages: ReadonlyArray<Message> = Object.values(
  {
    SaveClicked: [{ _tag: "SaveClicked" }],
    SaveSucceeded: [],
    SaveFailed: [],
    Name: []
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()

/** What the user types into the input, as the view sends it. */
const typing = (text: string): Message => ({ _tag: "Name", message: { _tag: "Written", value: text } })

const working = Storage.of({ save: () => Effect.void })
const failing = Storage.of({ save: (name) => Effect.fail(new StorageError({ cause: name })) })

describe("form", () => {
  // `update` alone: the rules, without running anything.
  describe("update", () => {
    test("saves a name that is not blank, trimmed", () => {
      const { state, commands } = applyAll(update)([{ _tag: "SaveClicked" }], { ...empty, name: " Ada " })
      expect(state.save).toEqual(Save.Saving())
      expect(commands).toEqual([Command.Save({ name: "Ada" })])
    })

    test("rejects saving a blank name, and a second save", () => {
      const saving = { ...empty, name: "Ada", save: Save.Saving() }
      expect(update({ _tag: "SaveClicked" })({ ...empty, name: "  " })).toBe(reject)
      expect(update({ _tag: "SaveClicked" })(saving)).toBe(reject)
    })

    // Only the save in progress can complete: a completion anywhere else is a bug, not a message to ignore.
    test("dies on a completion with nothing saving", () => {
      const failed = { ...empty, save: Save.Failed({ name: "Ada" }) }
      expect(() => update({ _tag: "SaveSucceeded", name: "Ada" })(empty)).toThrow(InvariantDefect)
      expect(() => update({ _tag: "SaveFailed", name: "Ada" })(failed)).toThrow(InvariantDefect)
    })

    // Written while saving, as a script may write into the disabled input: it is stored, for when the save fails.
    test("a write while saving is kept, for when the save fails", () => {
      const { state } = applyAll(update)(
        [{ _tag: "SaveClicked" }, typing(" Ada x"), { _tag: "SaveFailed", name: "Ada" }],
        { ...empty, name: " Ada " }
      )
      expect(state.name).toBe(" Ada x")
      expect(state.save).toEqual(Save.Failed({ name: "Ada" }))
    })

    // An input keeps nothing of its own: the state stored is the state the form wrote, which a test compares whole.
    test("a completed save leaves the form as it starts, with the name listed", () => {
      const { state } = applyAll(update)([{ _tag: "SaveClicked" }, { _tag: "SaveSucceeded", name: "Ada" }], {
        ...empty,
        name: "Ada"
      })
      expect(state).toEqual({ ...empty, saved: ["Ada"] })
    })

    test("has nothing to type into while saving", () => {
      expect(form.makeModel({ ...empty, name: "Ada", save: Save.Saving() }).editor._tag).toBe("Saving")
    })
  })

  // The model, for any state: every message it holds is accepted, a double click saves once, and nothing
  // `update` accepts is missing. No text is drawn: what is typed is no message of the model's.
  test("the model holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(state(), (before) => {
      expect(dispatchViolations(update, {
        state: before,
        held: messagesOf(form.makeModel(before)),
        candidates: userMessages
      })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once, and the input over the
  // name the model holds. `messagesSentBy`, beside the snabbdom bridge, is its way to see it without a DOM: the input's
  // write holds the value its element is drawn with, so it is written over that value, with that value.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(state(), (before) => {
      const model = form.makeModel(before)
      expect(messagesSentBy<Model, Message>(view, model)).toEqual([typing(model.name), ...messagesOf(model)])
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
    const typedAndSaved: ReadonlyArray<Message> = [typing(" Ada "), { _tag: "SaveClicked" }]

    test("a saved name is listed, trimmed, and the form empties its input", async () => {
      const { state, ignored } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, working))
      )
      expect(state).toEqual({ name: "", save: Save.Idle(), saved: ["Ada"] })
      // The save's completion reached `update`: a rejected one would mean a form stuck saving.
      expect(ignored).toEqual([])
    })

    test("a failure gives the form back, as it was, and says so", async () => {
      const { state } = await Effect.runPromise(
        simulate(form)(typedAndSaved, form.init).pipe(Effect.provideService(Storage, failing))
      )
      expect(state).toEqual({ name: " Ada ", save: Save.Failed({ name: "Ada" }), saved: [] })
    })

    // The save waits until the test runs it: what the user can do meanwhile, and what its answer finds.
    test("while saving, the form has nothing to do; a failure gives it back, to save again", async () => {
      const save = ({ editor }: Model) => editor._tag === "Named" ? Opt.some(editor.save) : Opt.none()
      const { whileSaving, afterFailure } = await Effect.runPromise(
        rehearse(
          form,
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.send((model) => model.editor._tag === "Saving" ? Opt.none() : Opt.some(typing(" Ada ")))
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
          yield* driver.send((model) => model.editor._tag === "Saving" ? Opt.none() : Opt.some(typing("Ada")))
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
