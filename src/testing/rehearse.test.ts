import { describe, expect, expectTypeOf, test } from "bun:test"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Hash from "effect/Hash"
import * as Metric from "effect/Metric"
import * as Opt from "effect/Option"
import type * as Scope from "effect/Scope"
import { prioritizedSchedules, scheduled } from "../../test/scheduled.test_scheduler.ts"
import { program } from "../compose.ts"
import { ProgramDefect } from "../defect.ts"
import type { MessageOf, Program } from "../program.ts"
import type { Subscription } from "../subscription.ts"
import { reject, type Update } from "../update.ts"
import { type Rehearsal, rehearse } from "./rehearse.ts"

describe("rehearse", () => {
  class Storage extends Context.Service<Storage, { readonly store: (text: string) => Effect.Effect<void> }>()(
    "Storage"
  ) {}

  // A note of one line, stored by `Store`, after which `Announce` tells the world and the parent hears `Stored`.
  // It listens to pings only while it is not saving.
  type Note = Readonly<{ text: string; isSaving: boolean; saved: Opt.Option<string>; pings: number }>
  type Edit =
    | Readonly<{ _tag: "Typed"; text: string }>
    | Readonly<{ _tag: "Save" }>
    | Readonly<{ _tag: "Saved"; text: string }>
    | Readonly<{ _tag: "Pinged" }>
  type NoteCommand = Readonly<{ _tag: "Store"; text: string }> | Readonly<{ _tag: "Announce" }>

  const editNote: Update<Note, Edit, NoteCommand, "Stored"> = (message) => (note) => {
    switch (message._tag) {
      case "Typed":
        return message.text.includes("\n") ? reject : { state: { ...note, text: message.text } }
      case "Save":
        return note.isSaving || note.text === ""
          ? reject
          : { state: { ...note, isSaving: true }, commands: [{ _tag: "Store", text: note.text }] }
      case "Saved":
        return note.isSaving
          ? {
            state: { ...note, isSaving: false, saved: Opt.some(message.text) },
            commands: [{ _tag: "Announce" }],
            events: ["Stored"]
          }
          : reject
      case "Pinged":
        return { state: { ...note, pings: note.pings + 1 } }
    }
  }

  type NoteModel =
    | Readonly<{ _tag: "Saving"; note: Note }>
    | Readonly<{ _tag: "Empty"; note: Note; changeText: (text: string) => Edit }>
    | Readonly<{ _tag: "Drafted"; note: Note; changeText: (text: string) => Edit; save: Edit }>

  const announced: Array<string> = []

  const editor: Program<
    {
      state: Note
      model: NoteModel
      message: Edit
      command: NoteCommand
      commandServices: Storage
      event: "Stored"
      key: "ping"
    }
  > = {
    init: { state: { text: "", isSaving: false, saved: Opt.none(), pings: 0 } },
    update: editNote,
    runCommand: (command) =>
      command._tag === "Store"
        ? Effect.flatMap(Effect.service(Storage), (storage) => storage.store(command.text)).pipe(
          Effect.as(Opt.some<Edit>({ _tag: "Saved", text: command.text }))
        )
        : Effect.sync(() => {
          announced.push("announced")
          return Opt.none()
        }),
    subscriptions: (note) => note.isSaving ? [] : ["ping" as const],
    listen: () => Channel.never,
    makeModel: (note): NoteModel => {
      if (note.isSaving) return { _tag: "Saving", note }
      const changeText = (text: string): Edit => ({ _tag: "Typed", text })
      return note.text === ""
        ? { _tag: "Empty", note, changeText }
        : { _tag: "Drafted", note, changeText, save: { _tag: "Save" } }
    }
  }

  const typing = (text: string) => (model: NoteModel) =>
    model._tag === "Saving" ? Opt.none() : Opt.some(model.changeText(text))

  const saving = (model: NoteModel) => model._tag === "Drafted" ? Opt.some(model.save) : Opt.none()

  const isStore = (command: NoteCommand) => command._tag === "Store"

  const stored: Array<string> = []

  const withStorage = <A, E>(effect: Effect.Effect<A, E, Storage>) =>
    effect.pipe(Effect.provideService(Storage, { store: (text) => Effect.sync(() => stored.push(text)) }))

  const failureOf = async (effect: Effect.Effect<unknown, never, Storage>) => {
    const exit = await Effect.runPromiseExit(withStorage(effect))
    return Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
  }

  test("a command waits until the test runs it, while the editor goes on", async () => {
    stored.length = 0
    const result = await Effect.runPromise(withStorage(rehearse(
      editor,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(typing("milk"))
        yield* rehearsal.send(saving)
        const whileSaving = yield* rehearsal.model
        expect(whileSaving._tag).toBe("Saving")
        expect(yield* rehearsal.pending).toEqual([{ _tag: "Store", text: "milk" }])
        expect(stored).toEqual([])
        const ran = yield* rehearsal.run(isStore)
        yield* rehearsal.runAll
        return { ran, state: yield* rehearsal.state, events: yield* rehearsal.events }
      })
    )))
    expect(stored).toEqual(["milk"])
    expect(result).toEqual({
      ran: { _tag: "Store", text: "milk" },
      state: { text: "milk", isSaving: false, saved: Opt.some("milk"), pings: 0 },
      events: ["Stored"]
    })
  })

  test("a editor with flags starts from the flags the test gives it, or from the step of another init", async () => {
    const seeded: Program<
      {
        state: Note
        model: NoteModel
        message: Edit
        command: NoteCommand
        commandServices: Storage
        event: "Stored"
        flags: string
        key: "ping"
      }
    > = { ...editor, init: (text) => ({ state: { text, isSaving: false, saved: Opt.none(), pings: 0 } }) }
    const text = await Effect.runPromise(withStorage(rehearse(
      seeded,
      (rehearsal) => Effect.map(rehearsal.state, (note) => note.text),
      { flags: "eggs" }
    )))
    expect(text).toBe("eggs")
    const from = { state: { text: "milk", isSaving: false, saved: Opt.none(), pings: 0 } }
    // As the run starts elsewhere: a editor whose init is that step, and which then has no flags.
    const fromStep = await Effect.runPromise(withStorage(rehearse(
      { ...seeded, init: from },
      (rehearsal) => Effect.map(rehearsal.state, (note) => note.text)
    )))
    expect(fromStep).toBe("milk")
    // @ts-expect-error: it has nothing to start from.
    expect(() => rehearse(seeded, () => Effect.void)).toBeDefined()
    // @ts-expect-error: nor from options without flags.
    expect(() => rehearse(seeded, () => Effect.void, {})).toBeDefined()
    // @ts-expect-error: and an editor without flags starts without them.
    expect(() => rehearse({ ...seeded, init: from }, () => Effect.void, { flags: "eggs" })).toBeDefined()
    // @ts-expect-error: it starts from its init, given its flags.
    expect(() => rehearse(seeded, () => Effect.void, { flags: "eggs", from })).toBeDefined()
  })

  class Pings extends Context.Service<Pings, { readonly pings: Subscription<Edit, never> }>()("Pings") {}

  // The note, whose pings come from a service of the subscriptions.
  const pinged: Program<
    {
      state: Note
      model: NoteModel
      message: Edit
      command: NoteCommand
      commandServices: Storage
      subscriptionServices: Pings
      event: "Stored"
      key: "ping"
    }
  > = {
    ...editor,
    listen: () => Channel.unwrap(Effect.map(Effect.service(Pings), (pings) => pings.pings))
  }

  test("asks for the services of what its scenario runs: those of the commands for run, of the subscriptions for hearNext", () => {
    // Unlike two `extends`, it tells `any` and `unknown` from the services named.
    type Exactly<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
    const reading = rehearse(pinged, (rehearsal) => rehearsal.state)
    const none: Exactly<Effect.Services<typeof reading>, never> = true
    expect(none).toBe(true)
    const running = rehearse(pinged, (rehearsal) => rehearsal.runAll)
    const commands: Exactly<Effect.Services<typeof running>, Storage> = true
    expect(commands).toBe(true)
    const hearing = rehearse(pinged, (rehearsal) => rehearsal.hearNext("ping"))
    const subscriptions: Exactly<Effect.Services<typeof hearing>, Pings> = true
    expect(subscriptions).toBe(true)
  })

  test("runs a command with the services provided around run, and a subscription with those around the hearNext that starts it", async () => {
    const kept: Array<string> = []
    const storage = Storage.of({ store: (text) => Effect.sync(() => void kept.push(text)) })
    const pings = Pings.of({
      pings: Channel.succeed<Edit>({ _tag: "Pinged" }).pipe(Channel.concatWith(() => Channel.never))
    })
    // Nothing is provided around `rehearse`: each call gets only what the test gives it.
    const note = await Effect.runPromise(rehearse(
      pinged,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext("ping").pipe(Effect.provideService(Pings, pings))
        yield* rehearsal.send(typing("milk"))
        yield* rehearsal.send(saving)
        yield* rehearsal.runAll.pipe(Effect.provideService(Storage, storage))
        return yield* rehearsal.state
      })
    ))
    expect(note.pings).toBe(1)
    expect(note.saved).toEqual(Opt.some("milk"))
    expect(kept).toEqual(["milk"])
  })

  test("a editor written as a plain object, without commands, needs no runCommand", async () => {
    const plain = {
      init: { state: { count: 0 } },
      update: () => ({ count }: Readonly<{ count: number }>) => ({ state: { count: count + 1 } }),
      subscriptions: () => [],
      makeModel: ({ count }: Readonly<{ count: number }>) => count
    }
    expect(await Effect.runPromise(rehearse(plain, (rehearsal) => rehearsal.state))).toEqual({ count: 0 })
  })

  test("a scenario made with Effect.fnUntraced, of a program without commands, keeps its errors and services", () => {
    type Count = Readonly<{ count: number }>
    const counting: Program<{ state: Count; model: number; message: "Increment" }> = {
      init: { state: { count: 0 } },
      update: () => ({ count }) => ({ state: { count: count + 1 } }),
      subscriptions: () => [],
      makeModel: ({ count }) => count
    }
    const rehearsed = rehearse(
      counting,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some("Increment"))
        return rehearsal
      })
    )
    expectTypeOf(rehearsed).toEqualTypeOf<
      Effect.Effect<Rehearsal<Count, number, "Increment", never, never, never, never>, never, never>
    >()
  })

  test("runAll runs the commands that the commands it runs start", async () => {
    announced.length = 0
    const pending = await Effect.runPromise(withStorage(rehearse(
      {
        ...editor,
        init: {
          state: { ...editor.init.state, text: "tea", isSaving: true },
          commands: [{ _tag: "Store", text: "tea" }]
        }
      },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.runAll
        return yield* rehearsal.pending
      })
    )))
    expect(pending).toEqual([])
    expect(announced).toEqual(["announced"])
  })

  test("a command's answer that no longer applies is ignored, and listed", async () => {
    const ignored = await Effect.runPromise(withStorage(rehearse(
      { ...editor, init: { state: editor.init.state, commands: [{ _tag: "Store", text: "old" }] } },
      Effect.fnUntraced(function*(rehearsal) {
        // Answered while nothing is saving.
        yield* rehearsal.run(isStore)
        return yield* rehearsal.ignored
      })
    )))
    expect(ignored).toEqual([{ _tag: "Saved", text: "old" }])
  })

  // `Saved` applies only while the note is saving: heard while it is not, it no longer applies.
  test("a subscription's message that no longer applies is ignored, and listed, heard by hear or by hearNext", async () => {
    const late: Edit = { _tag: "Saved", text: "late" }
    const played = await Effect.runPromise(withStorage(rehearse(
      editor,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hear("ping", late)
        return { state: yield* rehearsal.state, ignored: yield* rehearsal.ignored }
      })
    )))
    expect(played).toEqual({ state: editor.init.state, ignored: [late] })
    const sending: typeof editor = {
      ...editor,
      listen: () => Channel.succeed(late).pipe(Channel.concatWith(() => Channel.never))
    }
    const heard = await Effect.runPromise(withStorage(rehearse(
      sending,
      Effect.fnUntraced(function*(rehearsal) {
        const message = yield* rehearsal.hearNext("ping")
        return { message, state: yield* rehearsal.state, ignored: yield* rehearsal.ignored }
      })
    )))
    expect(heard).toEqual({ message: late, state: editor.init.state, ignored: [late] })
  })

  test("a subscription's message is heard while its key is in the state, and fails the test otherwise", async () => {
    const pings = await Effect.runPromise(withStorage(rehearse(
      editor,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hear("ping", { _tag: "Pinged" })
        return (yield* rehearsal.state).pings
      })
    )))
    expect(pings).toBe(1)
    const failure = await failureOf(rehearse(
      editor,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(typing("milk"))
        yield* rehearsal.send(saving)
        yield* rehearsal.hear("ping", { _tag: "Pinged" })
      })
    ))
    expect(String(failure)).toContain("Nothing listens under ping in the current state")
    // Keys may hold any value a `HashSet` compares, JSON or not.
    const unheard = await failureOf(rehearse(editor, (rehearsal) => rehearsal.hear(["Row", 1n], { _tag: "Pinged" })))
    expect(String(unheard)).toContain("Nothing listens under [\"Row\",\"1n\"] in the current state")
  })

  test("hear takes any message of the program, typed as the whole message, a child's too", async () => {
    type Typed = Readonly<{ _tag: "Typed"; value: string }>
    type Field = Readonly<{ text: string; pings: number }>
    const Field = program<{ state: Field; message: "Pinged" | Typed; key: "ping" }>()
    const field = Field.make({
      init: { state: { text: "", pings: 0 } },
      update: (message) => (state) => ({
        state: message === "Pinged" ? { ...state, pings: state.pings + 1 } : { ...state, text: message.value }
      }),
      subscriptions: () => ["ping" as const],
      listen: () => Channel.never,
      makeModel: (state) => state
    })
    type Form = Readonly<{ name: string; pings: number }>
    const Form = program<{ state: Form; message: "Pinged" | Typed; key: "ping" }>()
    const form = Form.withChildren({ Field: Form.child(field) }).make({
      init: { state: { name: "", pings: 0 } },
      update: (message) => (state) => ({
        state: message === "Pinged" ? { ...state, pings: state.pings + 1 } : { ...state, name: message.value }
      }),
      subscriptions: () => ["ping" as const],
      listen: () => Channel.never,
      makeModel: (state) => state
    })
    const typed = { _tag: "Typed", value: "Ada" } as const
    const heard: ReadonlyArray<MessageOf<typeof form>> = [
      "Pinged",
      { _tag: "Field", message: "Pinged" },
      typed,
      { _tag: "Field", message: typed }
    ]
    const state = await Effect.runPromise(rehearse(
      form,
      Effect.fnUntraced(function*(rehearsal) {
        for (const message of heard) {
          yield* rehearsal.hear(
            // The child's subscription is lifted under its instance, the first the parent started.
            typeof message === "object" && message._tag === "Field"
              ? { _tag: "Field", instance: 1, key: "ping" }
              : "ping",
            message
          )
        }
        return yield* rehearsal.state
      })
    ))
    expect(state.own).toEqual({ name: "Ada", pings: 1 })
    expect(Opt.map(state.children.Field, (kept) => kept.state)).toEqual(Opt.some({ text: "Ada", pings: 1 }))
  })

  describe("hearNext", () => {
    // Pings once at once, and holds a resource while it listens.
    const pinging = (log: Array<string>): typeof editor => ({
      ...editor,
      listen: () =>
        Channel.unwrap(
          Effect.acquireRelease(
            Effect.sync(() => log.push("acquire")),
            () => Effect.sync(() => log.push("release"))
          ).pipe(Effect.as(Channel.succeed<Edit>({ _tag: "Pinged" }).pipe(Channel.concatWith(() => Channel.never))))
        )
    })

    test("runs the subscription under the key to its first message, applies it, and releases it at the end", async () => {
      const log: Array<string> = []
      const { message, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          const message = yield* rehearsal.hearNext("ping")
          return { message, pings: (yield* rehearsal.state).pings }
        })
      )))
      expect(message).toEqual({ _tag: "Pinged" })
      expect(pings).toBe(1)
      expect(log).toEqual(["acquire", "release"])
    })

    test("called inside an uninterruptible region, hears, runs a command and ends, its fiber of effects stopped", async () => {
      const log: Array<string> = []
      const state = await Effect.runPromise(withStorage(Effect.uninterruptible(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ping")
          yield* rehearsal.send(typing("milk"))
          yield* rehearsal.send(saving)
          yield* rehearsal.run(isStore)
          yield* rehearsal.runAll
          return yield* rehearsal.state
        })
      ))))
      expect(state).toEqual({ text: "milk", isSaving: false, saved: Opt.some("milk"), pings: 1 })
      expect(log).toEqual(["acquire", "release"])
    })

    // Pings twice, writing down each ping as it makes it; the second waits for `gate`.
    const twice = (log: Array<string>, gate: Effect.Effect<void>): typeof editor => ({
      ...editor,
      subscriptions: () => ["ping" as const],
      listen: () =>
        Channel.unwrap(Effect.sync(() => {
          log.push("first")
          return Channel.succeed<Edit>({ _tag: "Pinged" })
        })).pipe(
          Channel.concatWith(() =>
            Channel.unwrap(Effect.as(
              Effect.andThen(
                gate,
                Effect.sync(() => log.push("second"))
              ),
              Channel.succeed<Edit>({ _tag: "Pinged" })
            ))
          ),
          Channel.concatWith(() => Channel.never)
        )
    })

    test("each call hears the next message, and the subscription waits between two of them", async () => {
      const log: Array<string> = []
      const pings = await Effect.runPromise(withStorage(rehearse(
        twice(log, Effect.void),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ping")
          // A window of absence, once the first ping is heard: a correct rehearsal makes no second one until asked.
          yield* Effect.sleep("20 millis")
          expect(log).toEqual(["first"])
          yield* rehearsal.hearNext("ping")
          return (yield* rehearsal.state).pings
        })
      )))
      expect(pings).toBe(2)
      expect(log).toEqual(["first", "second"])
    })

    test("a call interrupted while the subscription waits leaves its message to the next one", async () => {
      const log: Array<string> = []
      const pings = await Effect.runPromise(Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const waits = yield* Deferred.make<void>()
        return yield* withStorage(rehearse(
          twice(log, Effect.andThen(Deferred.succeed(waits, undefined), Deferred.await(gate))),
          Effect.fnUntraced(function*(rehearsal) {
            yield* rehearsal.hearNext("ping")
            // The subscription goes on to its second message only once a call asks for it.
            const call = yield* Effect.forkChild(rehearsal.hearNext("ping"))
            yield* Deferred.await(waits)
            yield* Fiber.interrupt(call)
            expect(Exit.hasInterrupts(yield* Fiber.await(call))).toBe(true)
            yield* Deferred.succeed(gate, undefined)
            yield* rehearsal.hearNext("ping")
            return (yield* rehearsal.state).pings
          })
        ))
      }))
      expect(pings).toBe(2)
      expect(log).toEqual(["first", "second"])
    })

    test("a subscription first heard in a fiber that has ended since keeps running while its key stays", async () => {
      const log: Array<string> = []
      const { second, pings } = await Effect.runPromise(withStorage(rehearse(
        twice(log, Effect.void),
        Effect.fnUntraced(function*(rehearsal) {
          // `timeoutOption` runs the call in a fiber of its own, which ends with it.
          yield* Effect.timeoutOption(rehearsal.hearNext("ping"), "1 second")
          const second = yield* Effect.exit(rehearsal.hearNext("ping"))
          return { second: Exit.isSuccess(second), pings: (yield* rehearsal.state).pings }
        })
      )))
      expect({ second, pings }).toEqual({ second: true, pings: 2 })
    })

    test("a subscription it started is released when whoever runs the rehearsal interrupts it", async () => {
      const log: Array<string> = []
      const ended = await Effect.runPromise(Effect.gen(function*() {
        const heard = yield* Deferred.make<void>()
        const fiber = yield* Effect.forkChild(withStorage(rehearse(
          pinging(log),
          (rehearsal) =>
            rehearsal.hearNext("ping").pipe(
              Effect.andThen(Deferred.succeed(heard, undefined)),
              Effect.andThen(Effect.never)
            )
        )))
        yield* Deferred.await(heard)
        yield* Fiber.interrupt(fiber)
        return yield* Fiber.await(fiber)
      }))
      expect(Exit.hasInterrupts(ended)).toBe(true)
      expect(log).toEqual(["acquire", "release"])
    })

    // The key goes away while a `hearNext` waits, in a fiber of the test's, for the message its subscription is about
    // to send: in the run, a message of a start whose key went away never reaches `update`. Which of the two applies
    // first is the scheduler's, and the assertion holds in either order: the message is applied before `Stop`,
    // or not at all. That one of a start gone is dropped is the core's ("a message of an earlier start of a key that
    // came back is dropped, dead after a death, calling nothing", `core.test.ts`).
    test("a message its subscription sends as its key goes away never reaches update after it", async () => {
      type Listening = Readonly<{ listening: boolean; late: number }>
      type Said = "Stop" | "Heard"
      const late = await Effect.runPromise(Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const listening: Program<{ state: Listening; model: Listening; message: Said; key: "k" }> = {
          init: { state: { listening: true, late: 0 } },
          update: (message) => (state) =>
            message === "Stop"
              ? { state: { ...state, listening: false } }
              : { state: { ...state, late: state.listening ? state.late : state.late + 1 } },
          subscriptions: ({ listening }) => listening ? ["k" as const] : [],
          listen: () => Channel.unwrap(Effect.as(Deferred.await(gate), Channel.end<Said>("Heard"))),
          makeModel: (state) => state
        }
        return yield* rehearse(
          listening,
          Effect.fnUntraced(function*(rehearsal) {
            // Started on this stack, the call is offered to the fiber of effects before `Stop` is.
            const waiting = yield* Effect.forkChild(rehearsal.hearNext("k"), { startImmediately: true })
            yield* Deferred.succeed(gate, undefined)
            yield* rehearsal.send(() => Opt.some("Stop"))
            yield* Fiber.await(waiting)
            return (yield* rehearsal.state).late
          })
        )
      }))
      expect(late).toBe(0)
    })

    // The call waits on the start once its job is done, which `Noop`, sent after it, waits for; one whose job comes
    // after `Stop` finds the key gone, and is told all the same.
    test("a call waiting when its key goes away fails the test, since nothing more arrives under it", async () => {
      const silent: Program<
        { state: Readonly<{ listening: boolean }>; model: boolean; message: "Stop" | "Noop"; key: "k" }
      > = {
        init: { state: { listening: true } },
        update: (message) => (state) => message === "Stop" ? { state: { listening: false } } : { state },
        subscriptions: ({ listening }) => listening ? ["k" as const] : [],
        listen: () => Channel.never,
        makeModel: ({ listening }) => listening
      }
      const exits = await Effect.runPromise(Effect.forEach([true, false], (waits) =>
        rehearse(
          silent,
          Effect.fnUntraced(function*(rehearsal) {
            // Started on this stack, the call has offered its job before `Noop` and `Stop` are sent.
            const waiting = yield* Effect.forkChild(rehearsal.hearNext("k"), { startImmediately: true })
            if (waits) yield* rehearsal.send(() => Opt.some<"Noop">("Noop"))
            yield* rehearsal.send(() => Opt.some<"Stop">("Stop"))
            // Bounded: a call that is never told waits only under a mutant.
            return yield* Effect.timeoutOption(Fiber.await(waiting), "2 seconds")
          })
        )))
      expect(
        exits.map((exit) => Opt.isSome(exit) && Exit.isFailure(exit.value) && String(Cause.squash(exit.value.cause)))
      )
        .toEqual(Array.from({ length: 2 }, () =>
          expect.stringContaining(
            "The subscription under k was stopped while hearNext waited for its message"
          )))
    })

    // A message that stops a subscription applies at once, and its job waits for the release, as the engine's fiber of
    // effects does: what arrives in the meantime applies at once too, and its job waits behind that one.
    type Counting = Readonly<{ listening: boolean; count: number }>
    type Counted = "Stop" | "Count"
    const counting = (
      answer: Effect.Effect<unknown>,
      release: Effect.Effect<unknown>
    ): Program<{ state: Counting; model: Counting; message: Counted; command: "Count"; key: "k" }> => ({
      init: { state: { listening: true, count: 0 }, commands: ["Count"] },
      update: (message) => (state) =>
        message === "Stop"
          ? { state: { ...state, listening: false } }
          : { state: { ...state, count: state.count + 1 } },
      runCommand: () => Effect.as(answer, Opt.some<Counted>("Count")),
      subscriptions: ({ listening }) => listening ? ["k" as const] : [],
      listen: () =>
        Channel.succeed<Counted>("Stop").pipe(
          Channel.concatWith(() => Channel.never),
          Channel.ensuring(release)
        ),
      makeModel: (state) => state
    })

    // The command answers once the release of `k` has begun, and the release waits for the answer.
    test("two messages that arrive together, one stopping a subscription, are both applied", async () => {
      const state = await Effect.runPromise(Effect.gen(function*() {
        const releasing = yield* Deferred.make<void>()
        const answered = yield* Deferred.make<void>()
        return yield* rehearse(
          counting(
            Effect.andThen(Deferred.await(releasing), Deferred.succeed(answered, undefined)),
            Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(answered))
          ),
          Effect.fnUntraced(function*(rehearsal) {
            // Started on this stack, the run starts the command before `hearNext` starts the subscription.
            const running = yield* Effect.forkChild(rehearsal.run(() => true), { startImmediately: true })
            yield* rehearsal.hearNext("k")
            yield* Fiber.join(running)
            return yield* rehearsal.state
          })
        )
      }))
      expect(state).toEqual({ listening: false, count: 1 })
    })

    test("a command run while the job of a message waits for a release leaves pending once", async () => {
      const { state, pending } = await Effect.runPromise(Effect.gen(function*() {
        const releasing = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        return yield* rehearse(
          counting(Effect.void, Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate))),
          Effect.fnUntraced(function*(rehearsal) {
            const hearing = yield* Effect.forkChild(rehearsal.hearNext("k"))
            yield* Deferred.await(releasing)
            // Started on this stack, the run takes its command while the release holds the fiber of effects.
            const running = yield* Effect.forkChild(rehearsal.run(() => true), { startImmediately: true })
            yield* Deferred.succeed(gate, undefined)
            yield* Fiber.join(hearing)
            yield* Fiber.join(running)
            return { state: yield* rehearsal.state, pending: yield* rehearsal.pending }
          })
        )
      }))
      expect({ state, pending }).toEqual({ state: { listening: false, count: 1 }, pending: [] })
    })

    test("a subscription that ends before sending anything is heard by its last message", async () => {
      const ending: typeof editor = {
        ...editor,
        subscriptions: () => ["ping" as const],
        listen: () => Channel.end<Edit>({ _tag: "Pinged" })
      }
      const message = await Effect.runPromise(withStorage(rehearse(ending, (rehearsal) => rehearsal.hearNext("ping"))))
      expect(message).toEqual({ _tag: "Pinged" })
    })

    // Saving makes the key go away, and its answer brings it back.
    const comingBack = Effect.fnUntraced(function*(
      rehearsal: Rehearsal<Note, NoteModel, Edit, NoteCommand, "Stored", Storage>
    ) {
      yield* rehearsal.send(typing("milk"))
      yield* rehearsal.send(saving)
      yield* rehearsal.runAll
    })

    const failingWith = <A, R>(effect: Effect.Effect<A, never, R>) =>
      Effect.map(Effect.exit(effect), (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "")

    test("a start it runs takes no message from hear, until the key goes away and comes back", async () => {
      const log: Array<string> = []
      const { failure, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ping")
          const failure = yield* failingWith(rehearsal.hear("ping", { _tag: "Pinged" }))
          yield* comingBack(rehearsal)
          yield* rehearsal.hear("ping", { _tag: "Pinged" })
          return { failure, pings: (yield* rehearsal.state).pings }
        })
      )))
      expect(failure).toContain("The subscription under ping runs under hearNext")
      expect(pings).toBe(2)
    })

    test("a start the test played with hear is not run, until the key goes away and comes back", async () => {
      const log: Array<string> = []
      const { failure, pings } = await Effect.runPromise(withStorage(rehearse(
        pinging(log),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hear("ping", { _tag: "Pinged" })
          yield* rehearsal.hear("ping", { _tag: "Pinged" })
          const failure = yield* failingWith(rehearsal.hearNext("ping"))
          yield* comingBack(rehearsal)
          yield* rehearsal.hearNext("ping")
          return { failure, pings: (yield* rehearsal.state).pings }
        })
      )))
      expect(failure).toContain("The test plays the subscription under ping with hear")
      expect(pings).toBe(3)
      expect(log).toEqual(["acquire", "release"])
    })

    test("fails the test when nothing listens under the key", async () => {
      const failure = await failureOf(rehearse(
        editor,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing("milk"))
          yield* rehearsal.send(saving)
          yield* rehearsal.hearNext("ping")
        })
      ))
      expect(String(failure)).toContain("Nothing listens under ping in the current state")
    })

    test("dies in subscriptions when a key's Equal throws, as the run does", async () => {
      class Key implements Equal.Equal {
        [Equal.symbol](): boolean {
          throw new Error("boom")
        }
        [Hash.symbol](): number {
          return 0
        }
      }
      const failure = await failureOf(rehearse(
        { ...editor, subscriptions: () => [new Key()], listen: () => Channel.never },
        (rehearsal) => rehearsal.hearNext(new Key())
      ))
      expect(failure instanceof ProgramDefect && failure.where).toBe("subscriptions")
    })
  })

  describe("fails the test", () => {
    test("when the model does not show what the test sends", async () => {
      expect(String(await failureOf(rehearse(editor, (rehearsal) => rehearsal.send(saving)))))
        .toContain("does not show")
    })

    test("when update rejects what the model of the same state shows: a control that does nothing", async () => {
      expect(String(await failureOf(rehearse(editor, (rehearsal) => rehearsal.send(typing("a\nb"))))))
        .toContain("a control that does nothing")
      // A tap on a model drawn before is a message applied to a later state: `send` is not the way to test it.
      const failure = await failureOf(rehearse(
        editor,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing("milk"))
          const written = yield* rehearsal.model
          yield* rehearsal.send(saving)
          yield* rehearsal.send(() => saving(written))
        })
      ))
      expect(String(failure)).toContain("test it with applyAll")
    })

    test("when no pending command matches", async () => {
      expect(String(await failureOf(rehearse(editor, (rehearsal) => rehearsal.run(isStore)))))
        .toContain("No pending command matches (pending: none)")
    })

    test("when a command is still pending at the end, since its answer would still arrive", async () => {
      const failure = await failureOf(rehearse(
        editor,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing("milk"))
          yield* rehearsal.send(saving)
        })
      ))
      expect(String(failure)).toContain("Commands still pending when the scenario ended: Store")
    })

    // Commands cannot be cancelled: in the run, a command once started still answers.
    test("when a run interrupted while its command runs leaves the command unanswered", async () => {
      const started = Deferred.makeUnsafe<void>()
      const failure = await failureOf(rehearse(
        { ...editor, runCommand: () => Effect.andThen(Deferred.succeed(started, undefined), Effect.never) },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing("milk"))
          yield* rehearsal.send(saving)
          const running = yield* Effect.forkChild(rehearsal.run(isStore))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(running)
        })
      ))
      expect(String(failure)).toContain("Commands whose run was interrupted before they answered: Store")
    })

    test("when a command is still under way at the end, since its answer would still arrive", async () => {
      const started = Deferred.makeUnsafe<void>()
      const failure = await failureOf(rehearse(
        { ...editor, runCommand: () => Effect.andThen(Deferred.succeed(started, undefined), Effect.never) },
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(typing("milk"))
          yield* rehearsal.send(saving)
          yield* Effect.forkChild(rehearsal.run(isStore))
          yield* Deferred.await(started)
        })
      ))
      expect(String(failure)).toContain("Commands still under way when the scenario ended: Store")
    })
  })

  // Each release waits a while for the other to have begun, as the run's do ("keys that go away together release
  // their subscriptions together", `engine.test.ts`): released one after the other, the first would wait in vain.
  test("keys that go away together release the subscriptions hearNext started together, as the run does", async () => {
    type Listening = Readonly<{ names: ReadonlyArray<string> }>
    const waited: Array<"together" | "alone"> = []
    const released = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      let begun = 0
      const release = Effect.suspend(() => {
        begun += 1
        return begun === 2
          ? Effect.asVoid(Deferred.succeed(releasing, undefined))
          : Deferred.await(releasing).pipe(
            Effect.timeoutOption("1 second"),
            Effect.map((met) => {
              waited.push(Opt.isSome(met) ? "together" : "alone")
            })
          )
      })
      const holding = Channel.unwrap(
        Effect.acquireRelease(Effect.void, () => release).pipe(
          Effect.as(Channel.succeed<"Tick">("Tick").pipe(Channel.concatWith(() => Channel.never)))
        )
      )
      const listening: Program<{ state: Listening; model: Listening; message: "Tick" | "Clear"; key: string }> = {
        init: { state: { names: ["a", "b"] } },
        update: (message) => (state) => message === "Clear" ? { state: { names: [] } } : { state },
        subscriptions: ({ names }) => Array.from(names),
        listen: () => holding,
        makeModel: (state) => state
      }
      return yield* rehearse(
        listening,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("a")
          yield* rehearsal.hearNext("b")
          yield* rehearsal.send(() => Opt.some("Clear"))
          return begun
        })
      )
    }))
    expect(released).toBe(2)
    expect(waited).toEqual(["together"])
  })
})

// The run applies each message whole, in one thunk, whoever sent it, and its effects in one fiber: so does `rehearse`,
// however the fibers of the test's, and whoever runs it, interleave and interrupt. The first five cases were found by the second premise
// review of November 2026.
describe("rehearse, under fibers of the test's and of whoever runs it", () => {
  // Listens under `k` while `listening`, sending `first` at once, and tells `releasing` when its release starts, which
  // then waits for `gate`. `Drop` stops it and counts one; `Set` counts to the next number only; `Go` starts a command
  // whose answer is `Drop`.
  type Gated = Readonly<{ listening: boolean; count: number }>
  type GatedMessage =
    | Readonly<{ _tag: "Tick" }>
    | Readonly<{ _tag: "Drop" }>
    | Readonly<{ _tag: "Set"; to: number }>
    | Readonly<{ _tag: "Go" }>
  const gated = (
    releasing: Deferred.Deferred<void>,
    gate: Effect.Effect<void>,
    first: GatedMessage = { _tag: "Tick" }
  ): Program<{ state: Gated; model: Gated; message: GatedMessage; command: "Answer"; key: "k" }> => ({
    init: { state: { listening: true, count: 0 } },
    update: (message) => (state) =>
      message._tag === "Tick"
        ? { state }
        : message._tag === "Go"
        ? { state, commands: ["Answer"] }
        : message._tag === "Drop"
        ? state.listening ? { state: { listening: false, count: state.count + 1 } } : reject
        : message.to === state.count + 1
        ? { state: { ...state, count: message.to } }
        : reject,
    runCommand: () => Effect.succeedSome<GatedMessage>({ _tag: "Drop" }),
    subscriptions: ({ listening }) => listening ? ["k" as const] : [],
    listen: () =>
      Channel.succeed<GatedMessage>(first).pipe(
        Channel.concatWith(() => Channel.never),
        Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), gate))
      ),
    makeModel: (state) => state
  })

  // A `send` made while the job of the message before it waits for a release selects on the state that message made,
  // the current one, which it applies to: selected on an older one, it would say that `update` rejected what the same
  // state shows.
  test("send selects on the model of the state its message is applied to", async () => {
    const count = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Deferred.await(gate)),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: "Drop" })))
          yield* Deferred.await(releasing)
          // Started on this stack, the send has applied its message once the fork returns, while the release holds the
          // fiber of effects.
          const setting = yield* Effect.forkChild(
            rehearsal.send(({ count }) => Opt.some({ _tag: "Set", to: count + 1 })),
            { startImmediately: true }
          )
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(dropping)
          yield* Fiber.join(setting)
          return (yield* rehearsal.state).count
        })
      )
    }))
    expect(count).toBe(2)
  })

  // Interrupted while the subscriptions its message stopped release, a `send` still writes the state that stopped
  // them: written by no one, the state would list `k` with nothing listening under it.
  test("a send interrupted while its message stops a subscription leaves the state that stopped it", async () => {
    const listening = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Deferred.await(gate)),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: "Drop" })))
          yield* Deferred.await(releasing)
          // Started on this stack, the interruption has reached the call once the fork returns.
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(dropping), { startImmediately: true })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(interrupting)
          // The call left at once: `Tick`, which leaves the state as it is, returns once the job before its own is done.
          yield* rehearsal.send(() => Opt.some({ _tag: "Tick" }))
          return (yield* rehearsal.state).listening
        })
      )
    }))
    expect(listening).toBe(false)
  })

  // Pings twice, then waits forever.
  type Pings = Readonly<{ pings: number }>
  const pingingTwice: Program<{ state: Pings; model: Pings; message: "Pinged"; key: "k" }> = {
    init: { state: { pings: 0 } },
    update: () => ({ pings }) => ({ state: { pings: pings + 1 } }),
    subscriptions: () => ["k" as const],
    listen: () =>
      Channel.succeed<"Pinged">("Pinged").pipe(
        Channel.concatWith(() => Channel.succeed<"Pinged">("Pinged")),
        Channel.concatWith(() => Channel.never)
      ),
    makeModel: (state) => state
  }

  // Each waiting call asks for a message of its own: asked for once by both, the second would wait for one nobody
  // asked for.
  test("two calls of hearNext at once on one key each hear a message of their own", async () => {
    const heard = await Effect.runPromise(rehearse(
      pingingTwice,
      Effect.fnUntraced(function*(rehearsal) {
        const both = yield* Effect.timeoutOption(
          Effect.all([rehearsal.hearNext("k"), rehearsal.hearNext("k")], { concurrency: "unbounded" }),
          "1 second"
        )
        return { both: Opt.isSome(both), pings: (yield* rehearsal.state).pings }
      })
    ))
    expect(heard).toEqual({ both: true, pings: 2 })
  })

  // Ticks once, telling `started`, and dies as it releases what it holds; `Go` starts a command whose answer, `Done`,
  // makes its key go away.
  type Still = Readonly<{ listening: boolean }>
  type StillMessage = "Tick" | "Go" | "Done"
  const dying = (
    started: Deferred.Deferred<void>
  ): Program<{ state: Still; model: Still; message: StillMessage; command: "Answer"; key: "ticks" }> => ({
    init: { state: { listening: true } },
    update: (message) => (state) =>
      message === "Go"
        ? { state, commands: ["Answer"] }
        : message === "Done"
        ? { state: { listening: false } }
        : { state },
    runCommand: () => Effect.succeedSome<StillMessage>("Done"),
    subscriptions: ({ listening }) => listening ? ["ticks" as const] : [],
    listen: () =>
      Channel.unwrap(Effect.as(Deferred.succeed(started, undefined), Channel.succeed<StillMessage>("Tick"))).pipe(
        Channel.concatWith(() => Channel.never),
        Channel.onExit(() => Effect.die("release"))
      ),
    makeModel: (state) => state
  })

  const diesOfRelease = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit)
    && exit.cause.reasons.some((reason) =>
      Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect && reason.defect.where === "subscription"
      && reason.defect.cause === "release"
    )

  // As the run interrupted by whoever runs it keeps such a defect in its cause ("a subscription that dies while an
  // interrupted run releases it is in the cause", `run.test.ts`): the end stops what `hearNext` started however the
  // rehearsal ends, and a scope that closed over the subscription would discard its exit.
  test("interrupted by whoever runs it, it fails on a defect of what a subscription releases", async () => {
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const fiber = yield* Effect.forkChild(
        rehearse(dying(started), (rehearsal) => Effect.andThen(rehearsal.hearNext("ticks"), Effect.never))
      )
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      return yield* Fiber.await(fiber)
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // A defect of the program fails the rehearsal as it ends the run, whichever fiber of the test's it reached: had it
  // reached only the fiber that applied the message, one the scenario does not join would lose it, and the rehearsal
  // would succeed where the run dies.
  test("a defect of what a subscription releases fails it, in a fiber of the test's that nobody joins", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      return yield* rehearse(
        dying(started),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("ticks")
          yield* rehearsal.send(() => Opt.some("Go"))
          // Awaited, never joined: what the call ends with does not reach the scenario.
          yield* Fiber.await(yield* Effect.forkChild(rehearsal.run(() => true)))
        })
      )
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // Counts each message; `Boom` makes `update` throw. Listens under `k` to a subscription that dies after `after`,
  // sending nothing.
  type Counted = "Tick" | "Boom"
  const counting = (
    after: Effect.Effect<void>
  ): Program<{ state: Gated; model: Gated; message: Counted; key: "k" }> => ({
    init: { state: { listening: true, count: 0 } },
    update: (message) => (state) => {
      if (message === "Boom") throw new Error("boom")
      return { state: { ...state, count: state.count + 1 } }
    },
    subscriptions: () => ["k" as const],
    listen: () =>
      Channel.unwrap(Effect.andThen(after, Effect.die("late")).pipe(Effect.as(Channel.end<Counted>("Tick")))),
    makeModel: (state) => state
  })

  const defectsOf = (exit: Exit.Exit<unknown>) =>
    Exit.isFailure(exit) ? exit.cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect] : []) : []

  // Nothing happens in a run that died: what the test asks the program for after a defect fails with it, though the
  // defect reached none of its calls, and what it reads of the state stays readable. No call applies anything: a
  // `hear` under a key nothing listens under fails with the defect, never with the key it did not look up. The
  // `hearNext` that starts the subscription leaves once it has started, and before it dies: one that left before the
  // fiber of effects took its job would start nothing.
  test("after a defect of the program, what the test asks for fails with it, and the state is still read", async () => {
    let after: Opt.Option<
      Readonly<{ sent: Exit.Exit<void>; heard: Exit.Exit<void>; model: Exit.Exit<Gated>; count: number }>
    > = Opt.none()
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        counting(Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(gate))),
        Effect.fnUntraced(function*(rehearsal) {
          const hearing = yield* Effect.forkChild(rehearsal.hearNext("k"))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(hearing)
          yield* Deferred.succeed(gate, undefined)
          // A call under `k` waits until the subscription has died.
          yield* Effect.exit(rehearsal.hearNext("k"))
          after = Opt.some({
            sent: yield* Effect.exit(rehearsal.send(() => Opt.some("Tick"))),
            heard: yield* Effect.exit(rehearsal.hear("nobody", "Tick")),
            model: yield* Effect.exit(rehearsal.model),
            count: (yield* rehearsal.state).count
          })
        })
      )
    }))
    const [died] = defectsOf(exit)
    expect(died).toBeInstanceOf(ProgramDefect)
    expect(
      Opt.map(after, ({ sent, heard, model, count }) => [defectsOf(sent), defectsOf(heard), defectsOf(model), count])
    ).toEqual(Opt.some([[died], [died], [died], 0]))
  })

  // Every call that asks the program for something fails with the defect, none of them already waiting; what the test
  // reads of the state keeps what the steps before the defect made: a command owed, an event, an answer ignored.
  test("after a defect, send, run, runAll, hear, hearNext and model fail with it, and state, pending, events and ignored stay readable", async () => {
    type Entry = "Go" | "Late" | "Boom"
    const entered: Program<
      { state: Gated; model: Gated; message: Entry; command: "Answer"; event: "Went"; key: "k" }
    > = {
      init: { state: { listening: true, count: 0 } },
      update: (message) => (state) => {
        if (message === "Boom") throw new Error("boom")
        return message === "Go"
          ? { state: { ...state, count: state.count + 1 }, commands: ["Answer"], events: ["Went"] }
          : reject
      },
      runCommand: () => Effect.succeedNone,
      subscriptions: () => ["k" as const],
      listen: () => Channel.never,
      makeModel: (state) => state
    }
    let after: Opt.Option<
      Readonly<{
        calls: ReadonlyArray<Exit.Exit<unknown>>
        read: Readonly<{
          state: Gated
          pending: ReadonlyArray<"Answer">
          events: ReadonlyArray<"Went">
          ignored: ReadonlyArray<Entry>
        }>
      }>
    > = Opt.none()
    const exit = await Effect.runPromiseExit(rehearse(
      entered,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some("Go"))
        yield* rehearsal.hear("k", "Late")
        yield* Effect.exit(rehearsal.send(() => Opt.some("Boom")))
        after = Opt.some({
          calls: [
            yield* Effect.exit(rehearsal.send(() => Opt.some("Go"))),
            yield* Effect.exit(rehearsal.run(() => true)),
            yield* Effect.exit(rehearsal.runAll),
            yield* Effect.exit(rehearsal.hear("k", "Go")),
            yield* Effect.exit(rehearsal.hearNext("k")),
            yield* Effect.exit(rehearsal.model)
          ],
          read: {
            state: yield* rehearsal.state,
            pending: yield* rehearsal.pending,
            events: yield* rehearsal.events,
            ignored: yield* rehearsal.ignored
          }
        })
      })
    ))
    const [died] = defectsOf(exit)
    expect(died instanceof ProgramDefect && died.where).toBe("update")
    expect(Opt.map(after, ({ calls, read }) => ({ calls: calls.map(defectsOf), read }))).toEqual(Opt.some({
      calls: Array.from({ length: 6 }, () => [died]),
      read: { state: { listening: true, count: 1 }, pending: ["Answer"], events: ["Went"], ignored: ["Late"] }
    }))
  })

  // A test that asserts a defect wraps `rehearse`, never the call: caught by the scenario, it fails the rehearsal at
  // the end all the same, first in its cause, before what the scenario ended with.
  test("a defect the scenario catches fails it all the same, first, and once", async () => {
    const caught = await Effect.runPromiseExit(
      rehearse(
        counting(Effect.never),
        (rehearsal) => Effect.exit(rehearsal.send(() => Opt.some("Boom"))).pipe(Effect.andThen(Effect.die("after")))
      )
    )
    const kept = await Effect.runPromiseExit(
      rehearse(counting(Effect.never), (rehearsal) => rehearsal.send(() => Opt.some("Boom")))
    )
    const [died, ...rest] = defectsOf(caught)
    expect(died instanceof ProgramDefect && died.where).toBe("update")
    expect(rest).toEqual(["after"])
    expect(defectsOf(kept)).toHaveLength(1)
  })

  // An interruption by the scenario is no defect, but what the interrupted command releases may die: that defect is
  // the rehearsal's, and the rehearsal that died of it checks nothing more.
  test("a defect of what a command the scenario interrupts releases fails it, alone", async () => {
    const acquired = Deferred.makeUnsafe<void>()
    const exit = await Effect.runPromiseExit(rehearse(
      {
        ...dying(Deferred.makeUnsafe()),
        runCommand: () =>
          Effect.acquireRelease(Effect.void, () => Effect.die("release")).pipe(
            Effect.andThen(Deferred.succeed(acquired, undefined)),
            Effect.andThen(Effect.never)
          )
      },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some("Go"))
        const running = yield* Effect.forkChild(rehearsal.run(() => true))
        yield* Deferred.await(acquired)
        yield* Fiber.interrupt(running)
      })
    ))
    const defects = defectsOf(exit)
    expect(defects.map((defect) => defect instanceof ProgramDefect && [defect.where, defect.cause])).toEqual([
      ["command", "release"]
    ])
  })

  // The scenario returns while the job of a message it sent waits for the release it started: the end waits for that release
  // before it reads what the fibers died of.
  test("a defect of a release still under way when the scenario returns fails it", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const returned = yield* Deferred.make<void>()
      // The release goes on until the scenario has returned.
      return yield* rehearse(
        gated(releasing, Effect.andThen(Deferred.await(returned), Effect.die("release"))),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: "Drop" })))
          yield* Deferred.await(releasing)
        }, Effect.ensuring(Deferred.succeed(returned, undefined)))
      )
    }))
    expect(diesOfRelease(exit)).toBe(true)
  })

  // The scenario returns while the job waits for the release, and the key has already left the state: the fiber of
  // effects finishes the job, and the rehearsal returns once the release has ended.
  test("it returns once a release under way when the scenario returns has ended, its key already gone", async () => {
    let released = false
    await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const returned = yield* Deferred.make<void>()
      // The release goes on until the scenario has returned.
      return yield* rehearse(
        gated(
          releasing,
          Effect.andThen(
            Deferred.await(returned),
            Effect.sync(() => {
              released = true
            })
          )
        ),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          yield* Effect.forkChild(rehearsal.send(() => Opt.some({ _tag: "Drop" })))
          yield* Deferred.await(releasing)
        }, Effect.ensuring(Deferred.succeed(returned, undefined)))
      )
    }))
    expect(released).toBe(true)
  })

  // A message once sent is applied whole, whichever call sent it: interrupting the call while the job of its message
  // waits for a release leaves the job to end as it would have.
  test("a run interrupted while its answer stops a subscription has answered, and leaves its state", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Deferred.await(gate)),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          yield* rehearsal.send(() => Opt.some({ _tag: "Go" }))
          const running = yield* Effect.forkChild(rehearsal.run(() => true))
          yield* Deferred.await(releasing)
          // Started on this stack, the interruption has reached the call once the fork returns.
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(running), { startImmediately: true })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(interrupting)
          // The call left at once: `Tick`, which leaves the state as it is, returns once the job before its own is done.
          yield* rehearsal.send(() => Opt.some({ _tag: "Tick" }))
          return (yield* rehearsal.state).listening
        })
      )
    }))
    expect(exit).toEqual(Exit.succeed(false))
  })

  test("a hearNext interrupted while its message stops a subscription leaves the state the message made", async () => {
    const listening = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        gated(releasing, Deferred.await(gate), { _tag: "Drop" }),
        Effect.fnUntraced(function*(rehearsal) {
          const hearing = yield* Effect.forkChild(rehearsal.hearNext("k"))
          yield* Deferred.await(releasing)
          // Started on this stack, the interruption has reached the call once the fork returns.
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(hearing), { startImmediately: true })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(interrupting)
          // The call left at once: `Tick`, which leaves the state as it is, returns once the job before its own is done.
          yield* rehearsal.send(() => Opt.some({ _tag: "Tick" }))
          return (yield* rehearsal.state).listening
        })
      )
    }))
    expect(listening).toBe(false)
  })
})

describe("rehearse, while a fiber of the test's waits for what nothing will send", () => {
  // `Go` starts `Dies`, a command that dies once `waited` is done, and `Waits`, one that does it as it starts and never
  // answers; every other message counts. Listens under `k` to `subscription`.
  type Counter = Readonly<{ count: number }>
  type Waited = "Tick" | "Go" | "Last"
  const waiting = (
    subscription: Channel.Channel<Waited, never, Waited>,
    waited: Deferred.Deferred<void> = Deferred.makeUnsafe()
  ): Program<{ state: Counter; model: Counter; message: Waited; command: "Dies" | "Waits"; key: "k" }> => ({
    init: { state: { count: 0 } },
    update: (message) => ({ count }) =>
      message === "Go" ? { state: { count }, commands: ["Dies", "Waits"] } : { state: { count: count + 1 } },
    runCommand: (command) =>
      command === "Dies"
        ? Effect.andThen(Deferred.await(waited), Effect.die("boom"))
        : Effect.andThen(Deferred.succeed(waited, undefined), Effect.never),
    subscriptions: () => ["k" as const],
    listen: () => subscription,
    makeModel: (state) => state
  })

  // What the rehearsal ended with, or `hung` when it had not ended after a second.
  const outcomeOf = <A, E>(rehearsal: Effect.Effect<A, E>) =>
    Effect.runPromise(
      Effect.map(Effect.timeoutOption(Effect.exit(rehearsal), "1 second"), Opt.getOrElse(() => "hung" as const))
    )

  const whereDied = (outcome: Exit.Exit<unknown, unknown> | "hung") =>
    outcome === "hung"
      ? "hung"
      : Exit.isFailure(outcome)
      ? outcome.cause.reasons.flatMap((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? [reason.defect.where] : []
      )
      : []

  // The run dies as soon as one of its fibers dies, and interrupts what still waits: a call of the test's that waits
  // for a message nothing will send ends with the defect, or the rehearsal never ends where the run has died.
  test("a hearNext waiting on its subscription fails as soon as another fiber of the test's dies", async () => {
    // `Dies` dies once the call has started the subscription, and waits on it.
    const waited = Deferred.makeUnsafe<void>()
    const listening = Channel.unwrap(Effect.as(Deferred.succeed(waited, undefined), Channel.never))
    const outcome = await outcomeOf(rehearse(
      waiting(listening, waited),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some("Go"))
        yield* Effect.forkChild(rehearsal.run((command) => command === "Dies"))
        yield* rehearsal.hearNext("k")
      })
    ))
    expect(whereDied(outcome)).toEqual(["command"])
  })

  test("a run waiting for its command fails as soon as another fiber of the test's dies", async () => {
    const outcome = await outcomeOf(rehearse(
      waiting(Channel.never),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some("Go"))
        yield* Effect.forkChild(rehearsal.run((command) => command === "Dies"))
        yield* rehearsal.run((command) => command === "Waits")
      })
    ))
    expect(whereDied(outcome)).toEqual(["command"])
  })

  // Two calls wait when the subscription ends: one hears its last message, after which it sends nothing, so the
  // other fails, as a call made after the end does; waiting for a message that cannot come, it would never return.
  test("of two hearNext waiting as the subscription ends, one hears its end, the other fails", async () => {
    const outcome = await outcomeOf(
      rehearse(
        waiting(Channel.end<Waited>("Last")),
        (rehearsal) =>
          Effect.all([Effect.exit(rehearsal.hearNext("k")), Effect.exit(rehearsal.hearNext("k"))], {
            concurrency: "unbounded"
          })
      )
    )
    expect(
      outcome !== "hung" && Exit.isSuccess(outcome) &&
        outcome.value.map(Exit.isSuccess).sort((a, b) => Number(a) - Number(b))
    ).toEqual([
      false,
      true
    ])
  })

  // The end stops the subscription, which sends nothing more: a call still waiting in a fiber that outlives the
  // scenario would wait for ever.
  test("a hearNext still waiting in a fiber the scenario did not join fails as the rehearsal ends", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const silent = Channel.unwrap(Effect.as(Deferred.succeed(started, undefined), Channel.never))
      const call = yield* rehearse(
        waiting(silent),
        Effect.fnUntraced(function*(rehearsal) {
          const call = yield* Effect.forkDetach(rehearsal.hearNext("k"))
          // Started by the call, which waits on it from then on.
          yield* Deferred.await(started)
          return call
        })
      )
      return yield* Effect.timeoutOption(Fiber.await(call), "1 second")
    }))
    expect(Opt.isSome(outcome) && Exit.isFailure(outcome.value) && String(Cause.squash(outcome.value.cause))).toContain(
      "The subscription under k was stopped while hearNext waited for its message"
    )
  })
})

describe("rehearse, as the release of what died lets another fiber die", () => {
  // Dies of `first`, then releases, which lets `second` die; uninterruptible, so that the end of the rehearsal, which
  // `first` starts, lets it.
  const diesThenReleases = (released: Deferred.Deferred<void>) =>
    Effect.addFinalizer(() => Deferred.succeed(released, undefined)).pipe(
      Effect.andThen(Effect.yieldNow),
      Effect.andThen(Effect.die("first"))
    )
  const diesOnceReleased = (released: Deferred.Deferred<void>) =>
    Effect.uninterruptible(Deferred.await(released).pipe(Effect.andThen(Effect.die("second"))))

  type Still = Readonly<{ still: true }>
  // `First` and the subscription under `first` die of `first`; `Second` and the one under `second`, of `second`.
  const ordered = (
    released: Deferred.Deferred<void>
  ): Program<
    {
      state: Still
      model: Still
      message: "Heard"
      command: "First" | "Second"
      commandServices: Scope.Scope
      subscriptionServices: Scope.Scope
      key: "first" | "second"
    }
  > => ({
    init: { state: { still: true }, commands: ["First", "Second"] },
    update: () => (state) => ({ state }),
    runCommand: (command) => command === "First" ? diesThenReleases(released) : diesOnceReleased(released),
    subscriptions: () => ["first", "second"],
    listen: (key) =>
      key === "first"
        ? Channel.fromEffectDone(diesThenReleases(released))
        : Channel.fromEffectDone(diesOnceReleased(released)),
    makeModel: (state) => state
  })

  const defectsOf = (exit: Exit.Exit<unknown, unknown>) =>
    Exit.isFailure(exit)
      ? exit.cause.reasons.flatMap((reason) =>
        Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect ? [reason.defect.cause] : []
      )
      : []

  test("a command that dies before another, which its release lets die, fails it first", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      return yield* rehearse(
        ordered(released),
        Effect.fnUntraced(function*(rehearsal) {
          // Started on this stack, the run has started its command once the fork returns.
          yield* Effect.forkChild(rehearsal.run((command) => command === "Second"), { startImmediately: true })
          yield* rehearsal.run((command) => command === "First")
        })
      )
    }))
    expect(defectsOf(exit)).toEqual(["first", "second"])
  })

  test("a subscription that dies before another, which its release lets die, fails it first", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      return yield* rehearse(
        { ...ordered(released), init: { state: { still: true } } },
        Effect.fnUntraced(
          function*(rehearsal) {
            // Started on this stack, the call is offered to the fiber of effects before the next one is.
            yield* Effect.forkChild(rehearsal.hearNext("second"), { startImmediately: true })
            yield* rehearsal.hearNext("first")
          }
        )
      )
    }))
    expect(defectsOf(exit)).toEqual(["first", "second"])
  })

  test("a subscription dying in a scope of its channel, before one its release lets die, fails it first", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const released = yield* Deferred.make<void>()
      const dying = yield* Deferred.make<void>()
      const program: Program<
        {
          state: Still
          model: Still
          message: "Heard"
          subscriptionServices: Scope.Scope
          key: "first" | "second"
        }
      > = {
        init: { state: { still: true } },
        update: () => (state) => ({ state }),
        subscriptions: () => ["first", "second"],
        listen: (key) =>
          key === "first"
            // Dies inside a scope of the channel's own, whose release lets `second` die, and ends once it has.
            ? Channel.unwrap(
              Effect.addFinalizer(() =>
                Deferred.succeed(released, undefined).pipe(
                  Effect.andThen(Deferred.await(dying)),
                  Effect.andThen(Effect.yieldNow)
                )
              ).pipe(Effect.as(Channel.fromEffectDone(Effect.yieldNow.pipe(Effect.andThen(Effect.die("first"))))))
            )
            : Channel.fromEffectDone(Effect.uninterruptible(
              Deferred.await(released).pipe(
                Effect.andThen(Deferred.succeed(dying, undefined)),
                Effect.andThen(Effect.die("second"))
              )
            )),
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          // Started on this stack, the call is offered to the fiber of effects before the next one is.
          yield* Effect.forkChild(rehearsal.hearNext("second"), { startImmediately: true })
          yield* rehearsal.hearNext("first")
        })
      )
    }))
    expect(defectsOf(exit)).toEqual(["first", "second"])
  })

  // `run` loses its race with the death of its own command, and interrupts it while it still releases what it holds:
  // the race waits for that release, which then dies too.
  const diesThenDiesInItsRelease = Effect.addFinalizer(() =>
    Effect.sleep("20 millis").pipe(Effect.andThen(Effect.die("release")))
  ).pipe(Effect.andThen(Effect.die("first")))

  test("a run whose command dies, then dies again as it slowly releases, fails with both", async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      {
        init: { state: { still: true }, commands: ["First"] },
        update: () => (state: Still) => ({ state }),
        runCommand: () => diesThenDiesInItsRelease,
        subscriptions: () => [],
        makeModel: (state: Still) => state
      },
      (rehearsal) => rehearsal.run(() => true)
    ))
    expect(defectsOf(exit)).toEqual(["first", "release"])
  })

  // The scenario catches the defect `run` fails with and hands it to the program, whose other command, interrupted
  // as the rehearsal dies, dies with that very defect as it releases: its own, a second one, though the same object
  // is already among the defects.
  test("a release that dies with a defect already recorded elsewhere fails it with a second one", async () => {
    let caught: unknown
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const handed = yield* Deferred.make<void>()
      const holding = yield* Deferred.make<void>()
      const program: Program<{
        state: Still
        model: Still
        message: "Done"
        command: "Held" | "Dies"
        commandServices: Scope.Scope
      }> = {
        init: { state: { still: true }, commands: ["Held", "Dies"] },
        update: () => (state) => ({ state }),
        runCommand: (command) =>
          command === "Held"
            ? Effect.addFinalizer(() =>
              Deferred.await(handed).pipe(Effect.andThen(Effect.suspend(() => Effect.die(caught))))
            ).pipe(Effect.andThen(Deferred.succeed(holding, undefined)), Effect.andThen(Effect.never))
            : Effect.die("first"),
        subscriptions: () => [],
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.run((command) => command === "Held"))
          yield* Deferred.await(holding)
          const failed = yield* Effect.exit(rehearsal.run((command) => command === "Dies"))
          caught = Exit.isFailure(failed)
            ? failed.cause.reasons.find(Cause.isDieReason)?.defect
            : undefined
          yield* Deferred.succeed(handed, undefined)
        })
      )
    }))
    expect(caught).toBeInstanceOf(ProgramDefect)
    expect(defectsOf(exit)).toEqual(["first", caught])
  })
})

describe("rehearse after the first defect", () => {
  // The order no yield of the scheduler needs: `send` checks the register in the thunk that applies its message, and
  // the death is recorded after its check of the end, in that thunk, by a command that the test's `select` runs and
  // that dies at once, its fiber started as it is forked, before `update`.
  test("send calls no update once a command run in its select has died", async () => {
    type Count = Readonly<{ n: number }>
    let late = 0
    let died = false
    const program: Program<{ state: Count; model: Count; message: "Go"; command: "Die" }> = {
      init: { state: { n: 0 }, commands: ["Die"] },
      update: () => ({ n }) => {
        if (died) late += 1
        return { state: { n: n + 1 } }
      },
      runCommand: () => Effect.die("boom"),
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = await Effect.runPromiseExit(rehearse(program, (rehearsal) =>
      rehearsal.send(() => {
        died = Exit.isFailure(Effect.runSync(Effect.exit(rehearsal.run(() => true))))
        return Opt.some("Go")
      })))
    expect(died).toBe(true)
    expect(late).toBe(0)
    expect(Exit.isFailure(exit)).toBe(true)
  })

  // `run` checks the register, takes its command and calls `runCommand` in one thunk, with no check in front of it:
  // a run that follows the death reaches the check with no schedule, and leaves its command pending.
  test("run calls no runCommand once a command has died", async () => {
    type Count = Readonly<{ n: number }>
    let died = false
    let late = 0
    let left: ReadonlyArray<"Die" | "Start"> = []
    const program: Program<{ state: Count; model: Count; message: "Go"; command: "Die" | "Start" }> = {
      init: { state: { n: 0 }, commands: ["Die", "Start"] },
      update: () => (state) => ({ state }),
      runCommand: (command) => {
        if (died) late += 1
        return command === "Die" ? Effect.die("boom") : Effect.succeedNone
      },
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = await Effect.runPromiseExit(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        died = Exit.isFailure(yield* Effect.exit(rehearsal.run((command) => command === "Die")))
        yield* Effect.exit(rehearsal.run((command) => command === "Start"))
        left = yield* rehearsal.pending
      })
    ))
    expect(died).toBe(true)
    expect(late).toBe(0)
    expect(left).toEqual(["Start"])
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

// A release that interrupts itself after its command died is a second defect, as in the run ("a release that
// interrupts itself", `run.test.ts`): never a bare interruption in the cause.
const quitting = "rehearse fails on a release that interrupts itself after its command died, with two defects"

test(quitting, async () => {
  type Still = Readonly<{ still: boolean }>
  const exit = await Effect.runPromiseExit(rehearse(
    {
      init: { state: { still: true }, commands: ["Boom"] },
      update: () => (state: Still) => ({ state }),
      runCommand: () => Effect.addFinalizer(() => Effect.interrupt).pipe(Effect.andThen(Effect.die("boom"))),
      subscriptions: () => [],
      makeModel: (state: Still) => state
    },
    (rehearsal) => rehearsal.run(() => true)
  ))
  const said = Exit.isFailure(exit)
    ? exit.cause.reasons.map((reason) =>
      Cause.isDieReason(reason) && reason.defect instanceof ProgramDefect
        ? reason.defect.cause instanceof Error ? reason.defect.cause.message : reason.defect.cause
        : reason._tag
    )
    : []
  expect(said).toEqual(["boom", "It was interrupted by the program, which only the run may do"])
})

// Found by the sixth premise review of November 2026: the end of the rehearsal stops its fiber of effects and what
// `hearNext` started, but not the calls of `run` in fibers of the test's that the scenario does not join, which go on
// while it ends and after it. The ledger is read only once the end has waited for every release.
describe("rehearse, as a fiber of the test's runs a command while it ends", () => {
  type Count = Readonly<{ count: number }>
  type Counted = "Go" | "Tick" | "Answered"

  type Listening = Readonly<{ listening: boolean; count: number }>
  type Dropped = "Tick" | "Drop" | "Answered"

  // The call that sent `Drop` waits for the job of its step, which the release of the subscription holds, when the
  // scenario fails. The end stops the fiber of effects and interrupts the completion of that job: the call, resumed on
  // the stack of the end (`docs/premises.md`), lets the command answer before the end stops it, and nothing is left to
  // apply its answer. Resumed later, it would let go of a command the end has stopped already: no defect either way.
  test("a command that answers as the end tells a call that its job was not done is no defect", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const opened = yield* Deferred.make<void>()
      const program: Program<{ state: Listening; model: Listening; message: Dropped; command: "Answer"; key: "k" }> = {
        init: { state: { listening: true, count: 0 }, commands: ["Answer"] },
        update: (message) => (state) =>
          message === "Drop"
            ? { state: { ...state, listening: false } }
            : { state: { ...state, count: state.count + 1 } },
        runCommand: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(opened)),
            Effect.as(Opt.some<Dropped>("Answered"))
          ),
        subscriptions: ({ listening }) => listening ? ["k" as const] : [],
        listen: () =>
          Channel.succeed<Dropped>("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            // Holds the job of the step that stops it until the call that sent `Drop` has ended.
            Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(released)))
          ),
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("k")
          yield* Effect.forkChild(rehearsal.run(() => true))
          yield* Deferred.await(started)
          // Started on this stack, the call waits for its job before the scenario goes on.
          yield* Effect.forkChild(
            rehearsal.send(() => Opt.some<Dropped>("Drop")).pipe(
              Effect.ensuring(
                Effect.andThen(Deferred.succeed(opened, undefined), Deferred.succeed(released, undefined))
              )
            ),
            { startImmediately: true }
          )
          yield* Deferred.await(releasing)
          return yield* Effect.fail("failed" as const)
        })
      )
    }))
    expect(Exit.isFailure(exit) && exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail"])
  })

  // The call that sent `Tick` waits for the job of its step, behind that of `run`, when the scenario fails. The end
  // marks itself, then stops the fiber of effects and interrupts the completion of that job: the call, resumed on the
  // stack of the end (`docs/premises.md`), lets the subscription send before the end stops it. Refused, what it sends
  // waits for the end to stop it, where a subscription that interrupted itself would be a defect.
  test("a subscription that sends as the end tells a call that its job was not done is no defect", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const listening = yield* Deferred.make<void>()
      const opened = yield* Deferred.make<void>()
      const ticked = yield* Deferred.make<void>()
      const program: Program<{ state: Listening; model: Listening; message: Dropped; command: "Answer"; key: "k" }> = {
        init: { state: { listening: true, count: 0 }, commands: ["Answer"] },
        update: () => (state) => ({ state: { ...state, count: state.count + 1 } }),
        runCommand: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(opened)),
            Effect.as(Opt.some<Dropped>("Answered"))
          ),
        subscriptions: () => ["k" as const],
        listen: () =>
          Channel.fromEffect(
            Deferred.succeed(listening, undefined).pipe(
              Effect.andThen(Deferred.await(ticked)),
              Effect.as<Dropped>("Tick")
            )
          ).pipe(Channel.concatWith(() => Channel.never)),
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.hearNext("k"), { startImmediately: true })
          yield* Effect.forkChild(rehearsal.run(() => true))
          yield* Deferred.await(started)
          yield* Deferred.await(listening)
          // Resumed on the stack of the subscription, the scenario gives it back, so that the subscription waits.
          yield* Effect.yieldNow
          // Started on this stack, the call waits for its job, behind that of `run`.
          yield* Effect.forkChild(
            rehearsal.send(() => Opt.some<Dropped>("Tick")).pipe(
              Effect.ensuring(
                Effect.andThen(Deferred.succeed(ticked, undefined), Deferred.succeed(opened, undefined))
              )
            ),
            { startImmediately: true }
          )
          return yield* Effect.fail("failed" as const)
        })
      )
    }))
    expect(Exit.isFailure(exit) && exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail"])
  })

  // The rehearsal has ended, failing on its pending command, when a fiber the scenario did not join asks to run it:
  // nothing is left to apply its answer. The call is recorded, not the effect, which a scope already closed would not
  // run.
  test("a run made once the rehearsal has ended calls no runCommand", async () => {
    const ran: Array<"Answer"> = []
    await Effect.runPromise(Effect.gen(function*() {
      const ended = yield* Deferred.make<void>()
      let late: Fiber.Fiber<unknown, unknown> | undefined
      const program: Program<{ state: Count; model: Count; message: Counted; command: "Answer" }> = {
        init: { state: { count: 0 }, commands: ["Answer"] },
        update: () => ({ count }) => ({ state: { count: count + 1 } }),
        runCommand: (command) => {
          ran.push(command)
          return Effect.succeedSome<Counted>("Answered")
        },
        subscriptions: () => [],
        makeModel: (state) => state
      }
      yield* Effect.exit(rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          late = yield* Effect.forkChild(Effect.andThen(Deferred.await(ended), rehearsal.run(() => true)))
        })
      ))
      yield* Deferred.succeed(ended, undefined)
      if (late !== undefined) yield* Fiber.await(late)
    }))
    expect(ran).toEqual([])
  })
})

// Found by the sixth premise review of November 2026. `run` and `hearNext` take what their command or their
// subscription gives inside `restore`, in a child fiber of `Effect.raceFirst` (`orDead`), and once gave it to the loop
// only once the call resumed: an interruption that reached the call in between found nothing to hold it. Each runs under
// prioritized schedules, with the resumptions Effect's own scheduler makes (`inline`), and a failure names its seed.
// What holds them now are regions that hold no code of the program, so these are alarms of the search, and no
// mutation names them ("one thunk" in `docs/invariants.md`).
describe("rehearse, as a call is interrupted between what it took and its job", () => {
  type Answering = Readonly<{ answered: boolean }>
  type Answered = "Answered" | "Noop"
  // The command answers once `gate` opens; a fiber opens it and interrupts the `run`, wherever the schedule lets it.
  // `Noop` returns once the job of whatever the `run` gave is done, so that the state read is the one it left.
  const interrupted = Effect.gen(function*() {
    const gate = yield* Deferred.make<void>()
    const seen: Array<"called" | "started" | "answered"> = []
    const program: Program<{ state: Answering; model: Answering; message: Answered; command: "Answer" }> = {
      init: { state: { answered: false }, commands: ["Answer"] },
      update: (message) => (state) => message === "Noop" ? { state } : { state: { answered: true } },
      runCommand: () => {
        seen.push("called")
        return Effect.sync(() => seen.push("started")).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(Effect.sync(() => seen.push("answered"))),
          Effect.as(Opt.some<Answered>("Answered"))
        )
      },
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = yield* Effect.exit(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        const running = yield* Effect.forkChild(rehearsal.run(() => true))
        const interrupting = yield* Effect.forkChild(
          Effect.andThen(Deferred.succeed(gate, undefined), Fiber.interrupt(running))
        )
        yield* Fiber.await(running)
        yield* Fiber.await(interrupting)
        yield* rehearsal.send(() => Opt.some("Noop"))
        return (yield* rehearsal.state).answered
      })
    ))
    return { seen, unanswered: Exit.isSuccess(exit) && !exit.value }
  })

  const runs = { runs: 1000, depth: 3, first: 1, resumptions: "inline" } as const

  // The command has answered when the interruption reaches the call: its answer is given to nobody, and it is
  // neither under way nor cancelled.
  test("a run interrupted once its command has answered applies the answer, or fails the rehearsal", () => {
    prioritizedSchedules(interrupted, { ...runs, pinned: [10, 11, 14, 26] }, (exit) => {
      if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
      expect(exit.value.unanswered && exit.value.seen.includes("answered")).toBe(false)
    })
  })

  // `runCommand` has been called, and its effect has not begun when the interruption reaches the call: the fiber
  // that would run it ends before `Effect.onInterrupt` is entered, so nothing cancels the command.
  test("a run interrupted before the effect of its command begins fails the rehearsal", () => {
    prioritizedSchedules(interrupted, { ...runs, pinned: [8, 17, 29, 44] }, (exit) => {
      if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
      expect(exit.value.unanswered && !exit.value.seen.includes("started")).toBe(false)
    })
  })

  type Count = Readonly<{ count: number }>
  type Counted = "Tick" | "Noop"
  // The subscription sends `Tick` once `gate` opens, and nothing more. The call interrupted applied it, or left it
  // to the next call: lost, the next call waits for a message nobody asked for, and the run under the schedule
  // does not end.
  const heard = Effect.gen(function*() {
    const gate = yield* Deferred.make<void>()
    const program: Program<{ state: Count; model: Count; message: Counted; key: "k" }> = {
      init: { state: { count: 0 } },
      update: (message) => (state) => message === "Noop" ? { state } : { state: { count: state.count + 1 } },
      subscriptions: () => ["k" as const],
      listen: () =>
        Channel.unwrap(Effect.as(Deferred.await(gate), Channel.succeed<Counted>("Tick"))).pipe(
          Channel.concatWith(() => Channel.never)
        ),
      makeModel: (state) => state
    }
    return yield* rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        const hearing = yield* Effect.forkChild(rehearsal.hearNext("k"))
        const interrupting = yield* Effect.forkChild(
          Effect.andThen(Deferred.succeed(gate, undefined), Fiber.interrupt(hearing))
        )
        yield* Fiber.await(hearing)
        yield* Fiber.await(interrupting)
        yield* rehearsal.send(() => Opt.some("Noop"))
        if ((yield* rehearsal.state).count === 0) yield* rehearsal.hearNext("k")
        return (yield* rehearsal.state).count
      })
    )
  })

  test("a message hearNext took is applied, or heard by the next call, though the call is interrupted", () => {
    prioritizedSchedules(heard, { ...runs, pinned: [35, 52, 98, 158] }, (exit) => {
      expect(exit).toEqual(Exit.succeed(1))
    })
  })
})

// The fiber of effects is kept in a release, of `a`, by a gate: the job of a `hearNext` asked meanwhile waits in its
// queue.
describe("rehearse, as a call leaves while the fiber of effects is in a release", () => {
  type Listening = Readonly<{ listening: boolean; count: number }>
  type Message = "Stop" | "Tick" | "Done"

  test("a hearNext that left before the fiber of effects took its job starts nothing, and hear plays its key", async () => {
    let started = 0
    const state = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const program: Program<{ state: Listening; model: Listening; message: Message; key: "k" | "a" }> = {
        init: { state: { listening: true, count: 0 } },
        update: (message) => (state) =>
          message === "Stop"
            ? { state: { ...state, listening: false } }
            : { state: { ...state, count: state.count + 1 } },
        subscriptions: ({ listening }) => ["k", ...(listening ? ["a" as const] : [])],
        listen: (key) =>
          key === "k"
            ? Channel.unwrap(Effect.sync(() => {
              started += 1
              return Channel.never
            }))
            : Channel.succeed<Message>("Tick").pipe(
              Channel.concatWith(() => Channel.never),
              Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate)))
            ),
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("a")
          const stopping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(releasing)
          // Started on this stack, the call waits in the queue of the jobs once the fork returns.
          const hearing = yield* Effect.forkChild(rehearsal.hearNext("k"), { startImmediately: true })
          yield* Fiber.interrupt(hearing)
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(stopping)
          // Returns once the job of the call that left is done: a job that started `k` would have it run by then.
          yield* rehearsal.send(() => Opt.some<Message>("Tick"))
          yield* rehearsal.hear("k", "Tick")
          return yield* rehearsal.state
        })
      )
    }))
    expect(started).toBe(0)
    expect(state).toEqual({ listening: false, count: 3 })
  })

  // The command's effect runs in a fiber of the rehearsal's scope, not in the fiber of effects: the release it opens
  // ends.
  test("a command run while a release waits for what the command gives ends", async () => {
    const state = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const program: Program<{ state: Listening; model: Listening; message: Message; command: "Open"; key: "a" }> = {
        init: { state: { listening: true, count: 0 }, commands: ["Open"] },
        update: (message) => (state) =>
          message === "Stop" ?
            { state: { ...state, listening: false } }
            : message === "Done" ?
            { state: { ...state, count: -1 } }
            : { state: { ...state, count: state.count + 1 } },
        runCommand: () => Effect.as(Deferred.succeed(gate, undefined), Opt.some<Message>("Done")),
        subscriptions: ({ listening }) => listening ? ["a" as const] : [],
        listen: () =>
          Channel.succeed<Message>("Tick").pipe(
            Channel.concatWith(() => Channel.never),
            Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate)))
          ),
        makeModel: (state) => state
      }
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("a")
          const stopping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(releasing)
          yield* rehearsal.run(() => true)
          yield* Fiber.join(stopping)
          return yield* rehearsal.state
        })
      )
    }))
    expect(state).toEqual({ listening: false, count: -1 })
  })
})

// Found by the sixth premise review of November 2026, of the form of a command that answers while the rehearsal
// ends: the request was in the queue of the fiber of effects when the scenario returned, and the end interrupted it. A
// scenario that returned lets the fiber of effects finish what it was offered before.
describe("rehearse, as a fiber of the test's has sent a message when the scenario returns", () => {
  type Count = Readonly<{ count: number }>

  // The commands pending are read once the fiber of effects has finished, not as the scenario's exit is taken.
  test("a message sent as the scenario returns is applied, and the command it starts fails the rehearsal", async () => {
    let applied = 0
    const program: Program<{ state: Count; model: Count; message: "Go"; command: "Fetch" }> = {
      init: { state: { count: 0 } },
      update: () => ({ count }) => {
        applied += 1
        return { state: { count: count + 1 }, commands: ["Fetch"] }
      },
      runCommand: () => Effect.succeedNone,
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = await Effect.runPromiseExit(rehearse(
      program,
      (rehearsal) => Effect.forkChild(rehearsal.send(() => Opt.some("Go")), { startImmediately: true })
    ))
    expect(applied).toBe(1)
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("Commands still pending")
  })

  test("the message is applied, or fails the rehearsal", async () => {
    let applied = 0
    const program: Program<{ state: Count; model: Count; message: "Tick" }> = {
      init: { state: { count: 0 } },
      update: () => ({ count }) => {
        applied += 1
        return { state: { count: count + 1 } }
      },
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = await Effect.runPromiseExit(rehearse(
      program,
      (rehearsal) => Effect.forkChild(rehearsal.send(() => Opt.some("Tick")), { startImmediately: true })
    ))
    expect(Exit.isFailure(exit) || applied === 1).toBe(true)
  })
})

// Found by the sixth premise review of November 2026, of the form of `drive` and a scenario that throws: the throw
// skips the end of the rehearsal, which leaves its fiber of effects running and the scope of what `hearNext` starts
// open.
describe("rehearse and a scenario that throws before it returns its effect", () => {
  type Count = Readonly<{ count: number }>

  test("what a hearNext it started holds is released, and the call ends", async () => {
    const log: Array<"acquire" | "release"> = []
    const program: Program<{ state: Count; model: Count; message: "Tick"; key: "k" }> = {
      init: { state: { count: 0 } },
      update: () => ({ count }) => ({ state: { count: count + 1 } }),
      subscriptions: () => ["k" as const],
      listen: () =>
        Channel.unwrap(
          Effect.acquireRelease(Effect.sync(() => log.push("acquire")), () => Effect.sync(() => log.push("release")))
            .pipe(Effect.as(Channel.succeed<"Tick">("Tick").pipe(Channel.concatWith(() => Channel.never))))
        ),
      makeModel: (state) => state
    }
    let call: Fiber.Fiber<"Tick"> | undefined
    const exit = await Effect.runPromiseExit(rehearse(program, (rehearsal) => {
      call = Effect.runFork(rehearsal.hearNext("k"))
      throw new Error("boom")
    }))
    // Bounded, so that a call left waiting still lets the test end.
    const ended = call === undefined
      ? Opt.none()
      : await Effect.runPromise(Effect.timeoutOption(Fiber.await(call), "1 second"))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("boom")
    expect(Opt.isSome(ended) && Exit.isFailure(ended.value)).toBe(true)
    expect(log.filter((each) => each === "acquire").length).toBe(log.filter((each) => each === "release").length)
  })
})

// What holds the fiber of effects in a job as the scenario ends: a message that stops a subscription whose release
// waits for a gate. The test opens the gate only once a fiber of its own has seen what the end did, so that an end that
// waited for the fiber of effects, or offered it a job, would wait for itself, and the test would never end.
describe("rehearse, as the scenario ends while its fiber of effects waits for a release", () => {
  type Listening = Readonly<{ listening: boolean; late: number }>
  type Message = "Stop" | "Tick" | "Late"

  type Holding = Program<{ state: Listening; model: Listening; message: Message; key: "a" }>
  const holding = (gate: Deferred.Deferred<void>, releasing: Deferred.Deferred<void>): Holding => ({
    init: { state: { listening: true, late: 0 } },
    update: (message) => (state) =>
      message === "Stop" ?
        { state: { ...state, listening: false } }
        : message === "Late" ?
        { state: { ...state, late: state.late + 1 } }
        : { state },
    subscriptions: ({ listening }) => listening ? ["a" as const] : [],
    listen: () =>
      Channel.succeed<Message>("Tick").pipe(
        Channel.concatWith(() => Channel.never),
        Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate)))
      ),
    makeModel: (state) => state
  })

  // A `runAll` with nothing pending is interrupted once the rehearsal has ended, and does nothing before: the fiber
  // asks until it is.
  const untilEnded = (rehearsal: Rehearsal<Listening, Listening, Message>) =>
    Effect.exit(rehearsal.runAll).pipe(
      Effect.tap(() => Effect.yieldNow),
      Effect.repeat({ until: Exit.isFailure })
    )

  test("a fiber the scenario did not join is offered nothing once it returned", async () => {
    let late: Exit.Exit<unknown> | undefined
    const state = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const program = holding(gate, releasing)
      return yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("a")
          yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(releasing)
          yield* Effect.forkChild(Effect.gen(function*() {
            yield* untilEnded(rehearsal)
            late = yield* Effect.exit(rehearsal.send(() => Opt.some<Message>("Late")))
            yield* Deferred.succeed(gate, undefined)
          }))
          return rehearsal
        })
      ).pipe(Effect.flatMap((rehearsal) => rehearsal.state))
    }))
    expect(late !== undefined && Exit.hasInterrupts(late)).toBe(true)
    expect(state).toEqual({ listening: false, late: 0 })
  })

  test("a scenario that failed stops the fiber of effects at once, its job under way included", async () => {
    let stopped: Exit.Exit<unknown> | undefined
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      return yield* rehearse(
        holding(gate, releasing),
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.hearNext("a")
          const stopping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(releasing)
          yield* Effect.forkChild(Effect.gen(function*() {
            stopped = yield* Fiber.await(stopping)
            yield* Deferred.succeed(gate, undefined)
          }))
          return yield* Effect.fail("boom")
        })
      )
    }))
    expect(stopped !== undefined && Exit.hasInterrupts(stopped)).toBe(true)
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe("boom")
  })

  // The calls are made from the test's own fiber, which the interruption does not reach: only the end of the rehearsal
  // can stop the job that the release holds, and the gate opens once it has.
  test("a scenario interrupted by whoever runs it stops the fiber of effects at once, its job under way included", async () => {
    const { stopped, exit } = await Effect.runPromise(Effect.gen(function*() {
      const gate = yield* Deferred.make<void>()
      const releasing = yield* Deferred.make<void>()
      const handed = yield* Deferred.make<Rehearsal<Listening, Listening, Message>>()
      const rehearsing = yield* Effect.forkChild(
        rehearse(
          holding(gate, releasing),
          (rehearsal) => Effect.andThen(Deferred.succeed(handed, rehearsal), Effect.never)
        )
      )
      const rehearsal = yield* Deferred.await(handed)
      yield* rehearsal.hearNext("a")
      const stopping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
      yield* Deferred.await(releasing)
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(rehearsing))
      const stopped = yield* Fiber.await(stopping)
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(interrupting)
      return { stopped, exit: yield* Fiber.await(rehearsing) }
    }))
    expect(Exit.hasInterrupts(stopped)).toBe(true)
    expect(Exit.hasInterrupts(exit)).toBe(true)
  })
})

describe("rehearse, as a run is interrupted while its command runs", () => {
  type Count = Readonly<{ count: number }>

  // The call stops the command's fiber and waits for it: what the command holds is released before the call returns,
  // not at the end of the rehearsal.
  test("the command is released before the interrupted call returns", async () => {
    const log: Array<"released" | "returned"> = []
    const started = Deferred.makeUnsafe<void>()
    const program: Program<{ state: Count; model: Count; message: "Go"; command: "Wait" }> = {
      init: { state: { count: 0 }, commands: ["Wait"] },
      update: () => (state) => ({ state }),
      runCommand: () =>
        Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
          Effect.ensuring(Effect.sync(() => log.push("released")))
        ),
      subscriptions: () => [],
      makeModel: (state) => state
    }
    await Effect.runPromiseExit(rehearse(
      program,
      Effect.fnUntraced(function*(rehearsal) {
        const running = yield* Effect.forkChild(rehearsal.run(() => true))
        yield* Deferred.await(started)
        yield* Fiber.interrupt(running)
        log.push("returned")
      })
    ))
    expect(log).toEqual(["released", "returned"])
  })
})

describe("rehearse, as a scenario that failed stops its fiber of effects in the release of a key that went away", () => {
  type Listening = Readonly<{ listening: boolean }>
  type Message = "Stop" | "Tick"

  // How many interruptions the fiber has received, asked where it is uninterruptible.
  const received = Effect.map(
    Effect.exit(Effect.interruptible(Effect.void)),
    (exit) => Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isInterruptReason).length : 0
  )
  // The gate is the fiber's own: it waits until it has received `count` interruptions, or gives up after a while.
  const untilReceived = (count: number, tries = 10_000): Effect.Effect<void> =>
    Effect.flatMap(
      received,
      (seen) =>
        seen >= count || tries === 0 ? Effect.void : Effect.andThen(Effect.yieldNow, untilReceived(count, tries - 1))
    )

  // Its subscription, stopped as `Stop` takes its key away, waits for a second interruption, the close of the
  // rehearsal's scope, then joins a fiber the scenario interrupted: it interrupts itself, a defect, as the run says.
  const joining = (
    stopped: Deferred.Deferred<void>,
    stale: Deferred.Deferred<Fiber.Fiber<never>>
  ): Program<{ state: Listening; model: Listening; message: Message; key: "a" }> => ({
    init: { state: { listening: true } },
    update: (message) => (state) => message === "Stop" ? { state: { listening: false } } : { state },
    subscriptions: ({ listening }) => listening ? ["a" as const] : [],
    listen: () =>
      Channel.fromEffectDone(Effect.uninterruptible(Effect.gen(function*() {
        yield* untilReceived(1)
        yield* Deferred.succeed(stopped, undefined)
        yield* untilReceived(2)
        return yield* Fiber.join(yield* Deferred.await(stale))
      }))),
    makeModel: (state) => state
  })

  test("a subscription that interrupts itself as the end stops it, its key gone, is a defect", async () => {
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const stopped = yield* Deferred.make<void>()
      const stale = yield* Deferred.make<Fiber.Fiber<never>>()
      return yield* rehearse(
        joining(stopped, stale),
        Effect.fnUntraced(function*(rehearsal) {
          // Interrupted by the fiber the scenario runs in, which ends the rehearsal.
          const fiber = yield* Effect.forkDetach(Effect.never)
          yield* Fiber.interrupt(fiber)
          yield* Deferred.succeed(stale, fiber)
          // Started on this stack, the call is offered to the fiber of effects before `Stop` is.
          yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
          yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(stopped)
          return yield* Effect.fail("boom")
        })
      )
    }))
    const defect = Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isDieReason)?.defect : undefined
    expect(defect instanceof ProgramDefect && defect.where).toBe("subscription")
  })

  // Sends nothing, and releases once the end of the rehearsal has interrupted it too.
  const lingers = (stopped: Deferred.Deferred<void>) =>
    Channel.fromEffectDone(Effect.uninterruptible(Effect.gen(function*() {
      yield* untilReceived(1)
      yield* Deferred.succeed(stopped, undefined)
      yield* untilReceived(2)
      return "Tick" as const
    })))

  const lingering = (
    stopped: Deferred.Deferred<void>
  ): Program<{ state: Listening; model: Listening; message: Message; key: "a" }> => ({
    ...joining(stopped, Deferred.makeUnsafe()),
    listen: () => lingers(stopped)
  })

  test("a hearNext waiting on a start whose key went away fails, though the scenario failed", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const stopped = yield* Deferred.make<void>()
      let call: Fiber.Fiber<Message> | undefined
      yield* Effect.exit(rehearse(
        lingering(stopped),
        Effect.fnUntraced(function*(rehearsal) {
          // Started on this stack, the call is offered to the fiber of effects before `Stop` is.
          call = yield* Effect.forkDetach(rehearsal.hearNext("a"), { startImmediately: true })
          yield* Effect.forkChild(rehearsal.send(() => Opt.some<Message>("Stop")))
          yield* Deferred.await(stopped)
          return yield* Effect.fail("boom")
        })
      ))
      const ended = call === undefined ? Opt.none() : yield* Effect.timeoutOption(Fiber.await(call), "1 second")
      return Opt.match(ended, {
        onNone: () => "hung",
        onSome: (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "heard"
      })
    }))
    expect(outcome).toContain("The subscription under a was stopped while hearNext waited for its message")
  })

  // Under `a`, `Stop` and nothing more; under `b`, a subscription that lingers. The call that hears `Stop` is out
  // of its start, to be told once the job of the message is done, while that job waits for the release of `b`.
  const stoppingBoth = (
    stopped: Deferred.Deferred<void>
  ): Program<{ state: Listening; model: Listening; message: Message; key: "a" | "b" }> => ({
    ...joining(stopped, Deferred.makeUnsafe()),
    subscriptions: ({ listening }) => listening ? ["a", "b"] : [],
    listen: (key) =>
      key === "a" ? Channel.succeed<Message>("Stop").pipe(Channel.concatWith(() => Channel.never)) : lingers(stopped)
  })

  test("a hearNext whose message was stopping a subscription as the scenario failed fails as one waiting", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const stopped = yield* Deferred.make<void>()
      let call: Fiber.Fiber<Message> | undefined
      yield* Effect.exit(rehearse(
        stoppingBoth(stopped),
        Effect.fnUntraced(function*(rehearsal) {
          // Started on this stack, the call is offered to the fiber of effects before the next one is.
          yield* Effect.forkChild(rehearsal.hearNext("b"), { startImmediately: true })
          call = yield* Effect.forkDetach(rehearsal.hearNext("a"))
          yield* Deferred.await(stopped)
          return yield* Effect.fail("boom")
        })
      ))
      const ended = call === undefined ? Opt.none() : yield* Effect.timeoutOption(Fiber.await(call), "1 second")
      return Opt.match(ended, {
        onNone: () => "hung",
        onSome: (exit) => Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "heard"
      })
    }))
    expect(outcome).toContain("The subscription under a was stopped while hearNext waited for its message")
  })
})

describe("rehearse, interrupted by whoever runs it as it sets up", () => {
  type Count = Readonly<{ count: number }>
  const program: Program<{ state: Count; model: Count; message: "Tick" }> = {
    init: { state: { count: 0 } },
    update: () => (state) => ({ state: { count: state.count + 1 } }),
    subscriptions: () => [],
    makeModel: (state) => state
  }
  // The rehearsal yields at its `step`th step, where a fiber of the caller's interrupts it, and no fiber it forked
  // may outlive it: each is counted as it starts and as it ends. Past the steps of its setup, the interruption meets
  // the scenario.
  const interruptedAt = (step: number) => {
    let started = 0
    let live = 0
    const metrics: Metric.FiberRuntimeMetricsService = {
      recordFiberStart: () => {
        started += 1
        live += 1
      },
      recordFiberEnd: () => {
        live -= 1
      }
    }
    let asked = 0
    const run = scheduled(
      Effect.gen(function*() {
        const rehearsing = yield* Effect.forkChild(rehearse(program, () => Effect.never))
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(rehearsing))
        yield* Fiber.await(interrupting)
      }).pipe(Effect.provideService(Metric.FiberRuntimeMetrics, metrics)),
      { pick: () => 0, preempt: (fiber) => fiber === 1 && ++asked === step },
      "inline"
    )
    return { ended: run.exit !== undefined && Exit.isSuccess(run.exit), started, live }
  }

  test("leaves no fiber of its own running, wherever the interruption reaches it", () => {
    const runs = Array.from({ length: 200 }, (_, index) => ({ step: index + 1, ...interruptedAt(index + 1) }))
    expect(runs.filter(({ ended, live }) => !ended || live !== 0)).toEqual([])
    // Some step meets the scenario, once the rehearsal has forked its fiber of effects.
    expect(Math.max(...runs.map(({ started }) => started))).toBeGreaterThan(2)
  })
})

// The two halves of the engine: a call applies its message at once, in its thunk, and the job of the step, in the fiber
// of effects, stops what the step stopped and owes its commands. The fiber of effects is held in the release of `a`,
// which waits for `gate`: `Swap` stops `a` and adds `b`, whose start is logical until the job of `Swap` is done. `Go`
// counts, owes `Note` and raises `Went`; `DropB` and `AddB` move `b` alone; `Bad` makes a state whose subscriptions are
// a defect, and owes `Note`; `Boom` is a defect of `update`.
describe("rehearse, as the job of a message waits for a release", () => {
  type Swapping = Readonly<{ a: boolean; b: boolean; bad: boolean; count: number }>
  type Swap = "Swap" | "Go" | "DropB" | "AddB" | "Tick" | "Bad" | "Boom"
  const swapping = (
    releasing: Deferred.Deferred<void>,
    gate: Deferred.Deferred<void>,
    log: Array<string> = []
  ): Program<{ state: Swapping; model: Swapping; message: Swap; command: "Note"; event: "Went"; key: "a" | "b" }> => ({
    init: { state: { a: true, b: false, bad: false, count: 0 } },
    update: (message) => (state) => {
      switch (message) {
        case "Swap":
          return { state: { ...state, a: false, b: true } }
        case "Go":
          return { state: { ...state, count: state.count + 1 }, commands: ["Note"], events: ["Went"] }
        case "DropB":
          return { state: { ...state, b: false } }
        case "AddB":
          return { state: { ...state, b: true } }
        case "Tick":
          return { state: { ...state, count: state.count + 1 } }
        case "Bad":
          return { state: { ...state, bad: true }, commands: ["Note"] }
        case "Boom":
          throw new Error("boom")
      }
    },
    runCommand: () => Effect.succeedNone,
    subscriptions: ({ a, b, bad }) => {
      if (bad) throw new Error("bad")
      return [...(a ? ["a" as const] : []), ...(b ? ["b" as const] : [])]
    },
    listen: (key) =>
      key === "a"
        ? Channel.never.pipe(
          Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(gate)))
        )
        : Channel.unwrap(Effect.sync(() => {
          log.push("b acquired")
          return Channel.succeed<Swap>("Tick").pipe(Channel.concatWith(() => Channel.never))
        })),
    makeModel: (state) => state
  })
  // Starts `a` under `hearNext`, which then waits for ever, and holds the fiber of effects in its release with `Swap`.
  const holding = Effect.fnUntraced(function*(
    rehearsal: Rehearsal<Swapping, Swapping, Swap, "Note", "Went">,
    releasing: Deferred.Deferred<void>
  ) {
    yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
    const swapping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("Swap")))
    yield* Deferred.await(releasing)
    return swapping
  })

  test("a message applied meanwhile shows in state, model and events at once, and owes its commands once the release has ended", async () => {
    const seen = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          // Started on this stack, the send has applied its message once the fork returns.
          const going = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("Go")), { startImmediately: true })
          const meanwhile = [
            (yield* rehearsal.state).count,
            (yield* rehearsal.model).count,
            yield* rehearsal.events,
            yield* rehearsal.pending
          ]
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(swapped)
          yield* Fiber.join(going)
          const after = yield* rehearsal.pending
          yield* rehearsal.runAll
          return { meanwhile, after }
        })
      )
    }))
    expect(seen).toEqual({ meanwhile: [1, 1, ["Went"], []], after: ["Note"] })
  })

  test("hear on a key whose start's job a release holds applies once the release has ended", async () => {
    const counts = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          // Started on this stack: a `hear` that did not wait would have applied its message once the fork returns.
          const hearing = yield* Effect.forkChild(rehearsal.hear("b", "Tick"), { startImmediately: true })
          const meanwhile = (yield* rehearsal.state).count
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(swapped)
          yield* Fiber.join(hearing)
          return [meanwhile, (yield* rehearsal.state).count]
        })
      )
    }))
    expect(counts).toEqual([0, 1])
  })

  test("hear on a key that goes away while it waits for its start's job fails the test, and reaches no update", async () => {
    const [exit, count] = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          const hearing = yield* Effect.forkChild(rehearsal.hear("b", "Tick"), { startImmediately: true })
          const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("DropB")), {
            startImmediately: true
          })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(swapped)
          yield* Fiber.join(dropping)
          return [yield* Fiber.await(hearing), (yield* rehearsal.state).count] as const
        })
      )
    }))
    expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("Nothing listens under b")
    expect(count).toBe(0)
  })

  test("hear on a key that goes away and comes back while it waits plays the new start, once its job is done", async () => {
    const count = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          const hearing = yield* Effect.forkChild(rehearsal.hear("b", "Tick"), { startImmediately: true })
          // Each applies its message on this stack, while the release holds the fiber of effects.
          const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("DropB")), {
            startImmediately: true
          })
          const adding = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("AddB")), {
            startImmediately: true
          })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(swapped)
          yield* Fiber.join(dropping)
          yield* Fiber.join(adding)
          yield* Fiber.join(hearing)
          return (yield* rehearsal.state).count
        })
      )
    }))
    expect(count).toBe(1)
  })

  test("a hearNext whose key goes away before its job fails as stopped, and starts nothing", async () => {
    const log: Array<string> = []
    const exit = await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate, log),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          // Started on this stack, the call has offered its job, behind that of `Swap`, once the fork returns.
          const hearing = yield* Effect.forkChild(rehearsal.hearNext("b"), { startImmediately: true })
          const dropping = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("DropB")), {
            startImmediately: true
          })
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(swapped)
          yield* Fiber.join(dropping)
          // Bounded: a call that is never told waits only under a mutant.
          return yield* Effect.timeoutOption(Fiber.await(hearing), "2 seconds")
        })
      )
    }))
    expect(Opt.isSome(exit) && Exit.isFailure(exit.value) && String(Cause.squash(exit.value.cause))).toContain(
      "The subscription under b was stopped while hearNext waited"
    )
    expect(log).toEqual([])
  })

  test("a hearNext whose job comes after a defect starts no subscription", async () => {
    const log: Array<string> = []
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate, log),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          const hearing = yield* Effect.forkChild(rehearsal.hearNext("b"), { startImmediately: true })
          yield* Effect.exit(rehearsal.send(() => Opt.some<Swap>("Boom")))
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.await(swapped)
          yield* Fiber.await(hearing)
        })
      )
    }))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(log).toEqual([])
  })

  test("the job of a step applied before the first defect goes on whole: its commands are owed", async () => {
    let pending: ReadonlyArray<"Note"> = []
    await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          const swapped = yield* holding(rehearsal, releasing)
          const going = yield* Effect.forkChild(rehearsal.send(() => Opt.some<Swap>("Go")), { startImmediately: true })
          yield* Effect.exit(rehearsal.send(() => Opt.some<Swap>("Boom")))
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.await(swapped)
          yield* Fiber.await(going)
          pending = yield* rehearsal.pending
        })
      )
    }))
    expect(pending).toEqual(["Note"])
  })

  test("a state whose subscriptions are a defect owes no command, as the run starts none", async () => {
    let pending: ReadonlyArray<"Note"> = ["Note"]
    const exit = await Effect.runPromiseExit(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      return yield* rehearse(
        swapping(releasing, gate),
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.exit(rehearsal.send(() => Opt.some<Swap>("Bad")))
          pending = yield* rehearsal.pending
        })
      )
    }))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(pending).toEqual([])
  })
})

// A job offered before the scenario returned runs once it has, as the fiber of effects finishes: what it would apply or
// start, a call of the test's no longer asks for. The fiber of effects is held in the release of `a` until the scenario
// has returned.
describe("rehearse, as the job of a hearNext comes once the scenario has returned", () => {
  type Listening = Readonly<{ a: boolean }>
  test("the job of a hearNext that comes once the scenario has returned starts nothing", async () => {
    const log: Array<string> = []
    await Effect.runPromise(Effect.gen(function*() {
      const releasing = yield* Deferred.make<void>()
      const returned = yield* Deferred.make<void>()
      const program: Program<{ state: Listening; model: Listening; message: "Stop"; key: "k" | "a" }> = {
        init: { state: { a: true } },
        update: () => () => ({ state: { a: false } }),
        subscriptions: ({ a }) => ["k", ...(a ? ["a" as const] : [])],
        listen: (key) =>
          key === "k"
            ? Channel.unwrap(Effect.sync(() => {
              log.push("k acquired")
              return Channel.never
            }))
            : Channel.never.pipe(
              Channel.ensuring(Effect.andThen(Deferred.succeed(releasing, undefined), Deferred.await(returned)))
            ),
        makeModel: (state) => state
      }
      yield* rehearse(
        program,
        Effect.fnUntraced(function*(rehearsal) {
          yield* Effect.forkChild(rehearsal.hearNext("a"), { startImmediately: true })
          yield* Effect.forkChild(rehearsal.send(() => Opt.some<"Stop">("Stop")))
          yield* Deferred.await(releasing)
          // Detached, so that the call is still asking when its job comes; started on this stack, it has offered it.
          yield* Effect.forkDetach(rehearsal.hearNext("k"), { startImmediately: true })
        }, Effect.ensuring(Deferred.succeed(returned, undefined)))
      )
    }))
    expect(log).toEqual([])
  })
})

// The form of what the review of the testing tools found in `drive` (`drive.test.ts`, "drive's send, made by a wait
// that a step wakes"), looked for here: `rehearse` tells a call of `hearNext` what it heard in the job of the message,
// so a call of the scenario that it wakes may go on inside that job, never inside the thunk that applied the message.
describe("rehearse's send, made by a hearNext that a job wakes", () => {
  type Heard = Readonly<{ heard: ReadonlyArray<string> }>
  const heard: Program<{ state: Heard; model: Heard; message: "Ping" | "Go"; key: "k" }> = {
    init: { state: { heard: [] } },
    update: (message) => (state) => ({ state: { heard: [...state.heard, message] } }),
    subscriptions: () => ["k" as const],
    listen: () => Channel.succeed<"Ping" | "Go">("Ping").pipe(Channel.concatWith(() => Channel.never)),
    makeModel: (state) => state
  }

  test("returns once update has seen its message, as it promises", async () => {
    const after = await Effect.runPromise(rehearse(
      heard,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext("k")
        yield* rehearsal.send(() => Opt.some<"Ping" | "Go">("Go"))
        return yield* rehearsal.state
      })
    ))
    expect(after).toEqual({ heard: ["Ping", "Go"] })
  })

  // The waiting fiber is forked at once, so that it waits before the scenario goes on.
  test("returns once update has seen its message, sent by a fiber of the scenario's", async () => {
    const after = await Effect.runPromise(rehearse(
      heard,
      Effect.fnUntraced(function*(rehearsal) {
        const waiting = yield* Effect.forkChild(
          rehearsal.hearNext("k").pipe(
            Effect.andThen(rehearsal.send(() => Opt.some<"Ping" | "Go">("Go"))),
            Effect.andThen(rehearsal.state)
          ),
          { startImmediately: true }
        )
        return yield* Fiber.join(waiting)
      })
    ))
    expect(after).toEqual({ heard: ["Ping", "Go"] })
  })
})

// Found by the reviews of step 20: the fiber of effects told a call of `hearNext` with an error that printed its key
// (`Inspectable.toStringUnknown`, which falls back to `String`), so a key whose `toString` throws ended that fiber, and
// every call that waited for a job waited for ever; and a tag that threw as a tool named its message took the place of
// the tool's error. A call is told data, and makes its error in its own fiber, naming each value by one function: what
// a value throws as it is named is the error's cause, the tool's error first.
describe("rehearse, with a value that throws as it is named", () => {
  type Shown = Readonly<{ on: boolean }>
  type Said = "Off" | "Done"
  class Unprintable implements Equal.Equal {
    [Equal.symbol](that: Equal.Equal): boolean {
      return that instanceof Unprintable
    }
    [Hash.symbol](): number {
      return 0
    }
    toJSON(): never {
      throw new Error("toJSON")
    }
    toString(): never {
      throw new Error("toString")
    }
  }
  const key = new Unprintable()
  const shown = (subscription: Subscription<Said>): Program<
    { state: Shown; model: Shown; message: Said; key: Unprintable }
  > => ({
    init: { state: { on: true } },
    update: (message) => (state) => message === "Off" ? { state: { on: false } } : { state },
    subscriptions: ({ on }) => on ? [key] : [],
    listen: () => subscription,
    makeModel: (state) => state
  })
  const unnamed = "<a value that threw as it was named: see the cause>"
  const untilItComesBack = "until its key goes away and comes back"
  // What a call failed with: the text of the tool's error, and what was thrown as it named a value, its cause.
  const failedWith = (exit: Exit.Exit<unknown>) => {
    if (Exit.isSuccess(exit)) return "succeeded"
    const error = Cause.squash(exit.cause)
    if (!(error instanceof Error)) return String(error)
    const { cause } = error
    return [error.message, cause instanceof AggregateError ? cause.errors.map(String) : String(cause)]
  }
  // The scenario returns the exit of the call it checks: one that waits for ever is cut short.
  const bounded = (rehearsal: Effect.Effect<Exit.Exit<unknown>>) =>
    Effect.runPromise(Effect.map(
      Effect.timeoutOption(rehearsal, "1 second"),
      Opt.match({ onNone: () => "hung", onSome: failedWith })
    ))

  test("a hearNext stopped as its key goes away fails the test, and the rehearsal ends", async () => {
    const outcome = await bounded(rehearse(
      shown(Channel.never),
      Effect.fnUntraced(function*(rehearsal) {
        const waiting = yield* Effect.forkChild(rehearsal.hearNext(key), { startImmediately: true })
        yield* rehearsal.send(() => Opt.some<Said>("Off"))
        return yield* Effect.exit(Fiber.join(waiting))
      })
    ))
    expect(outcome).toEqual([
      `The subscription under ${unnamed} was stopped while hearNext waited for its message: its key went away, or the `
      + "scenario ended",
      "Error: toString"
    ])
  })

  test("a hearNext whose job finds its start ended fails the test, and the rehearsal ends", async () => {
    const outcome = await bounded(rehearse(
      shown(Channel.end<Said>("Done")),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hearNext(key)
        return yield* Effect.exit(rehearsal.hearNext(key))
      })
    ))
    expect(outcome).toEqual([
      `The subscription under ${unnamed} has ended: it sends nothing ${untilItComesBack}`,
      "Error: toString"
    ])
  })

  test("a hearNext whose job finds its start played by hear fails the test, and the rehearsal ends", async () => {
    const outcome = await bounded(rehearse(
      shown(Channel.never),
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.hear(key, "Done")
        return yield* Effect.exit(rehearsal.hearNext(key))
      })
    ))
    expect(outcome).toEqual([
      `The test plays the subscription under ${unnamed} with hear: hearNext would start it again, which the run does `
      + `not do ${untilItComesBack}`,
      "Error: toString"
    ])
  })

  test("a hearNext still waiting as the rehearsal ends fails, and the rehearsal returns", async () => {
    const outcome = await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const call = yield* rehearse(
        shown(Channel.unwrap(Effect.as(Deferred.succeed(started, undefined), Channel.never))),
        Effect.fnUntraced(function*(rehearsal) {
          const call = yield* Effect.forkDetach(rehearsal.hearNext(key))
          // Started by the call, which waits on it from then on.
          yield* Deferred.await(started)
          return call
        })
      )
      return yield* Effect.timeoutOption(Fiber.await(call), "1 second")
    }))
    expect(Opt.map(outcome, failedWith)).toEqual(Opt.some([
      `The subscription under ${unnamed} was stopped while hearNext waited for its message: its key went away, or the `
      + "scenario ended",
      "Error: toString"
    ]))
  })

  type Unnamed = Readonly<{ _tag: string }>
  const tagless: Unnamed = {
    get _tag(): string {
      throw new Error("tag")
    }
  }

  test("a send that update rejects, of a message whose tag throws, fails with the tool's error", async () => {
    const refusing: Program<{ state: Shown; model: Shown; message: Unnamed }> = {
      init: { state: { on: true } },
      update: () => () => reject,
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const exit = await Effect.runPromiseExit(rehearse(refusing, (rehearsal) => rehearsal.send(() => Opt.some(tagless))))
    expect(failedWith(exit)).toEqual([
      expect.stringContaining(`update rejected ${unnamed}, which the model of the same state shows`),
      "Error: tag"
    ])
  })

  test("a run that matches nothing, and the commands left, whose tags throw, fail with the tool's error", async () => {
    const owing: Program<{ state: Shown; model: Shown; message: "Owe"; command: Unnamed }> = {
      init: { state: { on: true } },
      update: () => (state) => ({ state, commands: [tagless, tagless] }),
      runCommand: () => Effect.succeedNone,
      subscriptions: () => [],
      makeModel: (state) => state
    }
    const ran: Array<ReturnType<typeof failedWith>> = []
    const exit = await Effect.runPromiseExit(rehearse(
      owing,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send(() => Opt.some<"Owe">("Owe"))
        ran.push(failedWith(yield* Effect.exit(rehearsal.run(() => false))))
      })
    ))
    expect(ran).toEqual([[`No pending command matches (pending: ${unnamed}, ${unnamed})`, [
      "Error: tag",
      "Error: tag"
    ]]])
    expect(failedWith(exit)).toEqual([
      `Commands still pending when the scenario ended: ${unnamed}, ${unnamed}`,
      ["Error: tag", "Error: tag"]
    ])
  })
})
