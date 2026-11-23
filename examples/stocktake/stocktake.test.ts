import { InvariantDefect, reject } from "@fgaudo/effect-tea"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, drive, placeViolations, rehearse, simulate } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"
import * as fc from "fast-check"
import {
  Command,
  type Counted,
  Counts,
  counts,
  Listening,
  Load,
  type Message,
  type Model,
  Scanner,
  Server,
  ServerError,
  type ServerItem,
  Sheet,
  type State,
  stocktake
} from "./stocktake.ts"
import { view } from "./view.ts"

const flags = { aisle: "A3" }

const items: ReadonlyArray<ServerItem> = [
  { id: "i1", code: "C-BOLT", name: "Bolts", expected: 10 },
  { id: "i2", code: "C-NUT", name: "Nuts", expected: 4 }
]

const update = stocktake.update

const start = stocktake.init(flags)

const loaded = applyAll(update)([{ _tag: "Loaded", items }], start.state).state

/** What the counter types into the field of an item, where the model shows one. */
const typing = (model: Model, id: string, value: string): Opt.Option<Message> => {
  if (model._tag !== "Counting") return Opt.none()
  return Opt.flatMap(
    Opt.fromNullishOr(model.items.find((line) => line.id === id)),
    ({ model: item }) =>
      item.entry._tag === "Editable"
        ? Opt.some<Message>({ _tag: "Count", id, message: { _tag: "Written", value } })
        : Opt.none()
  )
}

/** The Submit the model holds, once every count is a whole number. */
const submitOf = (model: Model): Opt.Option<Message> =>
  model._tag === "Counting" && model.submit._tag === "Ready" ? Opt.some(model.submit.submit) : Opt.none()

const write = (state: State, id: string, value: string): Message =>
  Opt.getOrThrow(typing(stocktake.makeModel(state), id, value))

const counting = (model: Model) => {
  if (model._tag !== "Counting") throw new Error(`Not counting: ${model._tag}`)
  return model
}

const textOf = (model: Model, id: string) =>
  model._tag === "Loading" || model._tag === "LoadFailed"
    ? undefined
    : model.items.find((line) => line.id === id)?.model.entry.text

const typed = (state: State, texts: Readonly<Record<string, string>>): State =>
  Object.entries(texts).reduce((state, [id, value]) => applyAll(update)([write(state, id, value)], state).state, state)

describe("update", () => {
  test("starts loading the aisle", () => {
    expect(start.commands).toEqual([Command.Load({ aisle: "A3" })])
    expect(stocktake.makeModel(start.state)._tag).toBe("Loading")
  })

  test("a failed load shows the error, and Retry loads again", () => {
    const { state, commands } = applyAll(update)(
      [{ _tag: "LoadFailed", error: "offline" }, { _tag: "RetryClicked" }],
      start.state
    )
    expect(state.load).toEqual(Load.Loading())
    expect(commands).toEqual([Command.Load({ aisle: "A3" })])
    expect(update({ _tag: "RetryClicked" })(state)).toBe(reject)
  })

  test("the loaded items start empty, and the count cannot be submitted", () => {
    const model = counting(stocktake.makeModel(loaded))
    expect(model.items.map(({ id, model }) => [id, model.name, model.expected, model.entry])).toEqual([
      ["i1", "Bolts", 10, { _tag: "Editable", text: "" }],
      ["i2", "Nuts", 4, { _tag: "Editable", text: "" }]
    ])
    expect(model.total).toBe(0)
    expect(model.submit._tag).toBe("Blocked")
    expect(update({ _tag: "SubmitClicked" })(loaded)).toBe(reject)
  })

  test("a typed whole number is counted in the total; anything else stays as typed and is invalid", () => {
    const state = typed(loaded, { i1: "7", i2: "3x" })
    const model = counting(stocktake.makeModel(state))
    expect(textOf(model, "i2")).toBe("3x")
    expect(model.items.map(({ model }) => model.count._tag)).toEqual(["Valid", "Invalid"])
    expect(model.total).toBe(7)
    expect(model.submit._tag).toBe("Blocked")
    expect(update({ _tag: "SubmitClicked" })(state)).toBe(reject)
    expect(counting(stocktake.makeModel(typed(state, { i2: "-1" }))).submit._tag).toBe("Blocked")
    expect(counting(stocktake.makeModel(typed(state, { i2: "2" }))).total).toBe(9)
  })

  test("a scan adds one to its item, replacing the text", () => {
    const scan: Message = { _tag: "Scanned", code: "C-BOLT" }
    const once = applyAll(update)([scan], loaded).state
    expect(textOf(stocktake.makeModel(once), "i1")).toBe("1")
    const twice = applyAll(update)([scan], typed(once, { i1: "41" })).state
    expect(textOf(stocktake.makeModel(twice), "i1")).toBe("42")
    // A scan over a text that is no whole number starts the count at one.
    const over = applyAll(update)([scan], typed(loaded, { i1: "abc" })).state
    expect(textOf(stocktake.makeModel(over), "i1")).toBe("1")
    expect(counting(stocktake.makeModel(twice)).total).toBe(42)
  })

  test("unknown scans are listed newest first, at most five", () => {
    const codes = ["u1", "u2", "u3", "u4", "u5", "u6"]
    const { state } = applyAll(update)(codes.map((code): Message => ({ _tag: "Scanned", code })), loaded)
    expect(counting(stocktake.makeModel(state)).unknown).toEqual(["u6", "u5", "u4", "u3", "u2"])
  })

  test("the scanner is listened to while open, and its end shows Reconnect, which listens again", () => {
    expect(stocktake.subscriptions(start.state)).toEqual([])
    expect(stocktake.subscriptions(loaded)).toEqual(["scanner"])
    const ended = applyAll(update)([{ _tag: "ScannerDisconnected" }], loaded).state
    expect(stocktake.subscriptions(ended)).toEqual([])
    expect(counting(stocktake.makeModel(ended)).scanner._tag).toBe("Disconnected")
    const again = applyAll(update)([{ _tag: "ReconnectClicked" }], ended).state
    expect(stocktake.subscriptions(again)).toEqual(["scanner"])
    expect(update({ _tag: "ReconnectClicked" })(again)).toBe(reject)
  })

  test("submit sends every count and locks the fields; a second submit and a scan meanwhile are rejected", () => {
    const ready = typed(loaded, { i1: "10", i2: "5" })
    const { state, commands } = applyAll(update)([{ _tag: "SubmitClicked" }], ready)
    expect(commands).toEqual([
      Command.Submit({ aisle: "A3", counts: [{ id: "i1", counted: 10 }, { id: "i2", counted: 5 }] })
    ])
    const model = counting(stocktake.makeModel(state))
    expect(model.submit._tag).toBe("Submitting")
    expect(model.items.map(({ model }) => model.entry._tag)).toEqual(["ReadOnly", "ReadOnly"])
    expect(update({ _tag: "SubmitClicked" })(state)).toBe(reject)
    expect(update({ _tag: "Scanned", code: "C-BOLT" })(state)).toBe(reject)
    // A key typed into the field drawn before the lock finds no place to write into.
    expect(update(write(ready, "i1", "11"))(state)).toBe(reject)
  })

  test("a failed submit shows the error and gives the fields back", () => {
    const ready = typed(loaded, { i1: "10", i2: "5" })
    const { state } = applyAll(update)([{ _tag: "SubmitClicked" }, { _tag: "SubmitFailed", error: "refused" }], ready)
    const model = counting(stocktake.makeModel(state))
    expect(model.error).toEqual(Opt.some("refused"))
    expect(model.items.map(({ model }) => model.entry._tag)).toEqual(["Editable", "Editable"])
    expect(model.submit._tag).toBe("Ready")
    expect(textOf(stocktake.makeModel(typed(state, { i1: "9" })), "i1")).toBe("9")
  })

  test("a successful submit closes the stock-take, stops the scanner, and counts the items that differ", () => {
    const ready = typed(loaded, { i1: "10", i2: "5" })
    const { state } = applyAll(update)([{ _tag: "SubmitClicked" }, { _tag: "SubmitSucceeded" }], ready)
    const model = stocktake.makeModel(state)
    expect(model).toMatchObject({ _tag: "Closed", total: 15, differing: 1 })
    expect(stocktake.subscriptions(state)).toEqual([])
    expect(update(write(ready, "i1", "11"))(state)).toBe(reject)
  })

  test("dies on an answer or a scan that cannot arrive", () => {
    const closed = applyAll(update)(
      [{ _tag: "SubmitClicked" }, { _tag: "SubmitSucceeded" }],
      typed(loaded, { i1: "1", i2: "1" })
    ).state
    expect(() => update({ _tag: "Scanned", code: "C-BOLT" })(closed)).toThrow(InvariantDefect)
    expect(() => update({ _tag: "Loaded", items })(loaded)).toThrow(InvariantDefect)
    expect(() => update({ _tag: "SubmitSucceeded" })(loaded)).toThrow(InvariantDefect)
    const ended = applyAll(update)([{ _tag: "ScannerDisconnected" }], loaded).state
    expect(() => update({ _tag: "Scanned", code: "C-BOLT" })(ended)).toThrow(InvariantDefect)
  })
})

// Any valid state: any text in an open sheet, whole numbers in one that is submitted or closed.
const text = fc.oneof(fc.constant(""), fc.nat(30).map(String), fc.constantFrom("3x", " 2", "-1"))
const whole = fc.nat(30).map(String)

const lines = (texts: ReadonlyArray<string>) => items.map((item, index) => ({ ...item, text: texts[index] ?? "" }))

const states = (): fc.Arbitrary<State> => {
  const scanner = fc.constantFrom("Listening", "Disconnected").map((tag) =>
    tag === "Listening" ? Listening.Listening() : Listening.Disconnected()
  )
  const unknown = fc.array(fc.constantFrom("u1", "u2", "u3"), { maxLength: 5 })
  const wholes = fc.array(whole, { minLength: 2, maxLength: 2 })
  const open = fc.record({ texts: fc.array(text, { minLength: 2, maxLength: 2 }), error: fc.option(fc.string()) })
    .map(({ texts, error }) => Counts.Open({ lines: lines(texts), error: Opt.fromNullishOr(error) }))
  const locked = wholes.map((texts) => Counts.Locked({ lines: lines(texts) }))
  const counting = fc.record({ scanner, unknown, counts: fc.oneof(open, locked) }).map(Sheet.Counting)
  const closed = wholes.map((texts) => Sheet.Closed({ lines: lines(texts) }))
  return fc.oneof(
    fc.constant(null).map(() => Load.Loading()),
    fc.string().map((error) => Load.Failed({ error })),
    fc.oneof(counting, closed).map((sheet) => Load.Loaded({ sheet }))
  ).map((load) => ({ aisle: "A3", load }))
}

// What the model holds, a case at a time, in the order the view draws it. What is typed is no message of the model's.
const messagesOf = (model: Model): ReadonlyArray<Message> => {
  switch (model._tag) {
    case "Loading":
    case "Closed":
      return []
    case "LoadFailed":
      return [model.retry]
    case "Counting":
      return [
        ...(model.scanner._tag === "Disconnected" ? [model.scanner.reconnect] : []),
        ...(model.submit._tag === "Ready" ? [model.submit.submit] : [])
      ]
  }
}

// A write over each count the model shows, of a value that differs from it: those of the editable counts are held, so
// a count drawn editable takes a write, and those of every count are candidates, so a write that has a place where the
// count is drawn read-only is missing.
const writeOver = (id: string, text: string): Message => ({
  _tag: "Count",
  id,
  message: { _tag: "Written", value: `${text}1` }
})

const writesOf = (model: Model, editable: boolean): ReadonlyArray<Message> =>
  model._tag === "Counting" || model._tag === "Closed"
    ? model.items.flatMap(({ id, model: { entry } }) =>
      !editable || entry._tag === "Editable" ? [writeOver(id, entry.text)] : []
    )
    : []

const userMessages: ReadonlyArray<Message> = Object.values(
  {
    RetryClicked: [{ _tag: "RetryClicked" }],
    // The answers of the server, to the commands.
    Loaded: [],
    LoadFailed: [],
    // The scanner's feed, a subscription.
    Scanned: [],
    ScannerDisconnected: [],
    ReconnectClicked: [{ _tag: "ReconnectClicked" }],
    SubmitClicked: [{ _tag: "SubmitClicked" }],
    SubmitSucceeded: [],
    SubmitFailed: [],
    // A write into a count, which the library stores: no message of the model's.
    Count: []
  } satisfies { [Tag in Message["_tag"]]: ReadonlyArray<Extract<Message, { _tag: Tag }>> }
).flat()

describe("the model", () => {
  test("holds what update accepts, all of it, and each acts once when sent twice", () => {
    fc.assert(fc.property(states(), (state) => {
      expect(dispatchViolations(update, {
        state,
        held: messagesOf(stocktake.makeModel(state)),
        candidates: userMessages
      })).toEqual([])
    }))
  })

  test("draws a count editable exactly where a write over it is stored, once", () => {
    fc.assert(fc.property(states(), (state) => {
      const model = stocktake.makeModel(state)
      expect(dispatchViolations(update, {
        state,
        held: writesOf(model, true),
        candidates: writesOf(model, false)
      })).toEqual([])
    }))
  })

  // A count is written by its `get` and `set`, not by an optic, so nothing but a test checks that the `set` changes its
  // place and nothing else. The open sheets drawn have counts at both ids, and an id that is no item's is skipped.
  test("its counts are a place: a set changes the count at its id, and nothing else", () => {
    fc.assert(fc.property(fc.array(states(), { minLength: 1 }), fc.array(text, { minLength: 1 }), (drawn, values) => {
      expect(placeViolations(counts, { states: drawn, ids: ["i1", "i2", "missing"], values })).toEqual([])
    }))
  })

  // Beyond what the library asks: that the view draws what its model holds, each control once, and each editable count
  // with the text the model holds. `messagesSentBy`, beside the snabbdom bridge, is its way to see it without a DOM: a
  // count's write holds the value its element is drawn with. The counts are drawn between the scanner's control and
  // the submit.
  test("the view sends what its model holds", () => {
    fc.assert(fc.property(states(), (state) => {
      const model = stocktake.makeModel(state)
      const counts = model._tag === "Counting" || model._tag === "Closed"
        ? model.items.flatMap(({ id, model: { entry } }): ReadonlyArray<Message> =>
          entry._tag === "Editable"
            ? [{ _tag: "Count", id, message: { _tag: "Written", value: entry.text } }]
            : []
        )
        : []
      const [reconnect, submit] = model._tag === "Counting"
        ? [
          model.scanner._tag === "Disconnected" ? [model.scanner.reconnect] : [],
          model.submit._tag === "Ready" ? [model.submit.submit] : []
        ]
        : [messagesOf(model), []]
      expect(messagesSentBy<Model, Message>(view, model)).toEqual([...reconnect, ...counts, ...submit])
    }))
  })

  test("is data: equal states, built apart, have equal models", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const [one] = fc.sample(states(), { seed, numRuns: 1 })
      const [other] = fc.sample(states(), { seed, numRuns: 1 })
      if (one === undefined || other === undefined) throw new Error("nothing sampled")
      expect(one).not.toBe(other)
      expect(Equal.equals(stocktake.makeModel(one), stocktake.makeModel(other))).toBe(true)
    }))
  })
})

const serverOf = (options: Readonly<{ loadFailures?: number; submitFailures?: number }> = {}) => {
  let loadFailures = options.loadFailures ?? 0
  let submitFailures = options.submitFailures ?? 0
  const submitted: Array<ReadonlyArray<Counted>> = []
  const server = Server.of({
    load: () =>
      Effect.suspend(() => {
        if (loadFailures === 0) return Effect.succeed(items)
        loadFailures -= 1
        return Effect.fail(new ServerError({ message: "the server is unreachable" }))
      }),
    submit: (_, counts) =>
      Effect.suspend(() => {
        submitted.push(counts)
        if (submitFailures === 0) return Effect.void
        submitFailures -= 1
        return Effect.fail(new ServerError({ message: "the count was refused" }))
      })
  })
  return { server, submitted }
}

describe("simulate", () => {
  test("loads, takes the typed counts and submits them", async () => {
    const { server, submitted } = serverOf()
    const { state, ignored, commands } = await Effect.runPromise(
      simulate(stocktake)([
        { _tag: "Count", id: "i1", message: { _tag: "Written", value: "10" } },
        { _tag: "Count", id: "i2", message: { _tag: "Written", value: "3" } },
        { _tag: "SubmitClicked" }
      ], start).pipe(Effect.provideService(Server, server))
    )
    expect(stocktake.makeModel(state)).toMatchObject({ _tag: "Closed", total: 13, differing: 1 })
    expect(commands.map((command) => command._tag)).toEqual(["Load", "Submit"])
    expect(submitted).toEqual([[{ id: "i1", counted: 10 }, { id: "i2", counted: 3 }]])
    expect(ignored).toEqual([])
  })
})

describe("rehearse", () => {
  test("a failed load, Retry, scans heard, an unplugged scanner, a failed submit, a closed stock-take", async () => {
    const { server, submitted } = serverOf({ loadFailures: 1, submitFailures: 1 })
    const scanner = Scanner.of({ scans: Stream.make("C-BOLT", "nope", "C-BOLT") })
    const result = await Effect.runPromise(
      rehearse(
        stocktake,
        Effect.fnUntraced(function*(rehearsal) {
          expect((yield* rehearsal.model)._tag).toBe("Loading")
          yield* rehearsal.run((command) => command._tag === "Load")
          const failed = yield* rehearsal.model
          expect(failed).toMatchObject({ _tag: "LoadFailed", error: "the server is unreachable" })
          yield* rehearsal.send((model) => model._tag === "LoadFailed" ? Opt.some(model.retry) : Opt.none())
          yield* rehearsal.run((command) => command._tag === "Load")
          // The feed, as the scanner sends it, then its end.
          const heard = [
            yield* rehearsal.hearNext("scanner"),
            yield* rehearsal.hearNext("scanner"),
            yield* rehearsal.hearNext("scanner"),
            yield* rehearsal.hearNext("scanner")
          ]
          expect(heard.map((message) => message._tag)).toEqual(["Scanned", "Scanned", "Scanned", "ScannerDisconnected"])
          const unplugged = counting(yield* rehearsal.model)
          expect(textOf(unplugged, "i1")).toBe("2")
          expect(unplugged.unknown).toEqual(["nope"])
          expect(unplugged.scanner._tag).toBe("Disconnected")
          yield* rehearsal.send((model) =>
            model._tag === "Counting" && model.scanner._tag === "Disconnected"
              ? Opt.some(model.scanner.reconnect)
              : Opt.none()
          )
          // Heard as the test says, without running the scanner again.
          yield* rehearsal.hear("scanner", { _tag: "Scanned", code: "C-NUT" })
          yield* rehearsal.send((model) => typing(model, "i1", "10"))
          yield* rehearsal.send((model) => typing(model, "i2", "4"))
          yield* rehearsal.send(submitOf)
          const submitting = counting(yield* rehearsal.model)
          expect(submitting.submit._tag).toBe("Submitting")
          // Nothing to type into while the counts are submitted.
          expect(Opt.isNone(typing(submitting, "i1", "11"))).toBe(true)
          yield* rehearsal.run((command) => command._tag === "Submit")
          const refused = counting(yield* rehearsal.model)
          expect(refused.error).toEqual(Opt.some("the count was refused"))
          yield* rehearsal.send((model) => typing(model, "i2", "5"))
          yield* rehearsal.send(submitOf)
          yield* rehearsal.runAll
          return { model: yield* rehearsal.model, ignored: yield* rehearsal.ignored }
        }),
        { flags }
      ).pipe(Effect.provideService(Server, server), Effect.provideService(Scanner, scanner))
    )
    expect(result.model).toMatchObject({ _tag: "Closed", total: 15, differing: 1 })
    expect(result.ignored).toEqual([])
    expect(submitted).toEqual([
      [{ id: "i1", counted: 10 }, { id: "i2", counted: 4 }],
      [{ id: "i1", counted: 10 }, { id: "i2", counted: 5 }]
    ])
  })
})

describe("drive", () => {
  test("a counter scans, types, submits, and sees the summary", async () => {
    const { server } = serverOf()
    const summary = await Effect.runPromise(
      drive(
        stocktake,
        Effect.fnUntraced(function*(driver) {
          // The scanner's feed is three scans, then it is unplugged.
          yield* driver.waitFor((model) =>
            model._tag === "Counting" && model.scanner._tag === "Disconnected" ? Opt.some(model) : Opt.none()
          )
          const scanned = yield* driver.waitFor((model) => Opt.fromNullishOr(textOf(model, "i1")))
          expect(scanned).toBe("2")
          yield* driver.send((model) => typing(model, "i2", "4"))
          yield* driver.send(submitOf)
          return yield* driver.waitFor((model) => model._tag === "Closed" ? Opt.some(model) : Opt.none())
        }),
        { flags }
      ).pipe(
        Effect.provideService(Server, server),
        Effect.provideService(Scanner, Scanner.of({ scans: Stream.make("C-BOLT", "C-BOLT", "mystery") }))
      )
    )
    expect(summary.total).toBe(6)
    expect(summary.differing).toBe(1)
  })
})
