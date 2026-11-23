// The spike's tests: each form of a scroll end, as a test of a program would check it, and the probes the roadmap's
// step 40 asks for, each named by its point.
import { reject, start } from "@fgaudo/effect-tea"
import type { View } from "@fgaudo/effect-tea/snabbdom"
import { messagesSentBy } from "@fgaudo/effect-tea/snabbdom/testing"
import { applyAll, dispatchViolations, stateOf } from "@fgaudo/effect-tea/testing"
import { describe, expect, test } from "bun:test"
import * as Equal from "effect/Equal"
import * as fc from "fast-check"
import type { On, VNode } from "snabbdom"
import * as AsMessage from "./as-message.ts"
import * as AsWrite from "./as-write.ts"
import * as Parent from "./parent.ts"
import { nearEnd, PAGE, pageFrom, ROW, TOTAL, VIEWPORT } from "./shared.ts"
import { viewAsMessage, viewAsWrite } from "./view-snabbdom.ts"

/** The offset at which a list of `count` rows has scrolled to its end. */
const endOf = (count: number) => Math.max(0, count * ROW - VIEWPORT)

const items: fc.Arbitrary<ReadonlyArray<string>> = fc.constantFrom(PAGE, 2 * PAGE, TOTAL).map((count) =>
  Array.from({ length: count }, (_, index) => `Row ${index + 1}`)
)

const writeState: fc.Arbitrary<AsWrite.State> = fc.record({
  items,
  more: fc.oneof(
    fc.nat(TOTAL * ROW).map((offset) => AsWrite.More.Idle({ offset })),
    fc.constant(AsWrite.More.Loading()),
    fc.constant(AsWrite.More.Exhausted())
  )
})

const messageState: fc.Arbitrary<AsMessage.State> = fc.record({
  items,
  more: fc.constantFrom(AsMessage.More.Idle(), AsMessage.More.Loading(), AsMessage.More.Exhausted())
})

// Today's form: the reader returns the fixed message, and the test lists the writes beside it.
const write = (value: number): AsWrite.Message => ({ _tag: "Offset", message: { _tag: "Written", value } })

const messagesAsWrite = (model: AsWrite.Model): ReadonlyArray<AsWrite.Message> =>
  model.more._tag === "Idle" ? [model.more.scrollEnded] : []

// The spike's form: the reader is given the value that the element would report, and fills it.
const messagesAsMessage = (model: AsMessage.Model, offset: number): ReadonlyArray<AsMessage.Message> =>
  model.more._tag === "Idle" ? [{ ...model.more.scrollEnded, offset }] : []

type Listener = Extract<NonNullable<On[string]>, (...args: never) => unknown>

// Point 2: `messagesSentBy` with one more argument, what the target of an event holds beyond the props the view drew.
// A copy of the tool, not kept: the only change is `targetOf`.
const messagesSentByWith = <Model, Message>(
  view: View<Model, Message>,
  model: Model,
  targetOf: (node: VNode, event: string) => object
): ReadonlyArray<Message> => {
  const sent: Array<Message> = []
  const eventOf = (node: VNode, name: string): Event => {
    const props = node.data?.props ?? {}
    const target = {
      ...("value" in props ? { value: props["value"] } : {}),
      ...("checked" in props ? { checked: props["checked"] } : {}),
      ...targetOf(node, name)
    }
    return { target } as unknown as Event
  }
  const visit = (node: VNode | string): void => {
    if (typeof node === "string") return
    for (const [name, listeners] of Object.entries(node.data?.on ?? {})) {
      for (
        const listener of Array.isArray(listeners)
          ? listeners as ReadonlyArray<Listener>
          : [listeners as Listener]
      ) {
        listener.call(node, eventOf(node, name), node)
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(view(model, (message) => void sent.push(message)))
  return sent
}

describe("a scroll end as a write, then a message (today)", () => {
  test("a scroll end at the end loads the next page, and one short of it does nothing", () => {
    const { feed } = AsWrite
    const loaded = applyAll(feed.update)([write(endOf(PAGE)), { _tag: "ScrollEnded" }], feed.init.state)
    expect(loaded.state.more._tag).toBe("Loading")
    expect(loaded.commands).toEqual([{ _tag: "Load", from: PAGE }])
    const { state: tenRows } = applyAll(feed.update)([{ _tag: "PageLoaded", items: pageFrom(PAGE) }], loaded.state)
    // Two steps, and the second does nothing: but the state has moved, since the offset is kept.
    const short = applyAll(feed.update)([write(0), { _tag: "ScrollEnded" }], tenRows)
    expect(short.commands).toEqual([])
    expect(short.state).toEqual(tenRows)
    const stopped = applyAll(feed.update)([write(37), { _tag: "ScrollEnded" }], tenRows)
    expect(stopped.state).not.toEqual(tenRows)
  })

  // Point 1. The fixed message does nothing where the offset held is short of the end, which a state generated with any
  // offset is: it needs an exemption of `Inert`, with the geometry written again in the test.
  test("the model holds what update accepts, with an exemption of Inert for an offset short of the end", () => {
    fc.assert(fc.property(writeState, (state) => {
      const model = AsWrite.feed.makeModel(state)
      const end = endOf(state.items.length)
      const held = state.more._tag === "Idle" ? state.more.offset === end ? end - 1 : end : end
      expect(dispatchViolations(AsWrite.feed.update, {
        state,
        held: [...messagesAsWrite(model), ...(state.more._tag === "Idle" ? [write(held)] : [])],
        candidates: [{ _tag: "ScrollEnded" }, write(held)],
        inert: (message, state) =>
          message._tag === "ScrollEnded" && state.more._tag === "Idle"
          && !nearEnd(state.more.offset, state.items.length)
      })).toEqual([])
    }))
  })

  test("without the exemption, Inert is found", () => {
    const state: AsWrite.State = { items: pageFrom(0).concat(pageFrom(PAGE)), more: AsWrite.More.Idle({ offset: 0 }) }
    expect(dispatchViolations(AsWrite.feed.update, { state, held: messagesAsWrite(AsWrite.feed.makeModel(state)) }))
      .toEqual([{ _tag: "Inert", message: { _tag: "ScrollEnded" } }])
  })
})

describe("a scroll end as one message with its offset (the spike)", () => {
  test("a scroll end at the end loads the next page, and one short of it leaves the very state", () => {
    const { feed } = AsMessage
    const loaded = applyAll(feed.update)([{ _tag: "ScrollEnded", offset: endOf(PAGE) }], feed.init.state)
    expect(loaded.state.more._tag).toBe("Loading")
    expect(loaded.commands).toEqual([{ _tag: "Load", from: PAGE }])
    const { state: tenRows } = applyAll(feed.update)([{ _tag: "PageLoaded", items: pageFrom(PAGE) }], loaded.state)
    const short = feed.update({ _tag: "ScrollEnded", offset: 37 })(tenRows)
    expect(short).not.toBe(reject)
    expect(short !== reject && short.state).toBe(tenRows)
  })

  // Point 1. The reader fills one value, at which the message acts: no exemption, but the test chooses the value by
  // the geometry, and a candidate is missing unless it carries the very value the reader filled.
  test("the model holds what update accepts, filled at the end of the list", () => {
    fc.assert(fc.property(messageState, (state) => {
      const end = endOf(state.items.length)
      expect(dispatchViolations(AsMessage.feed.update, {
        state,
        held: messagesAsMessage(AsMessage.feed.makeModel(state), end),
        candidates: [0, end].map((offset): AsMessage.Message => ({ _tag: "ScrollEnded", offset }))
      })).toEqual([])
    }))
  })

  test("filled at every value a test gives, the values short of the end are Inert", () => {
    const state: AsMessage.State = { items: pageFrom(0).concat(pageFrom(PAGE)), more: AsMessage.More.Idle() }
    const model = AsMessage.feed.makeModel(state)
    expect(dispatchViolations(AsMessage.feed.update, {
      state,
      held: [0, endOf(2 * PAGE)].flatMap((offset) => messagesAsMessage(model, offset))
    })).toEqual([{ _tag: "Inert", message: { _tag: "ScrollEnded", offset: 0 } }])
  })

  test("a candidate that acts at a value other than the reader's is Missing", () => {
    const state: AsMessage.State = { items: pageFrom(0).concat(pageFrom(PAGE)), more: AsMessage.More.Idle() }
    const end = endOf(2 * PAGE)
    expect(dispatchViolations(AsMessage.feed.update, {
      state,
      held: messagesAsMessage(AsMessage.feed.makeModel(state), end),
      candidates: [{ _tag: "ScrollEnded", offset: end - 10 }]
    })).toEqual([{ _tag: "Missing", message: { _tag: "ScrollEnded", offset: end - 10 } }])
  })

  test("the model is data: equal states built apart have equal models, and a filled message equals one written", () => {
    const a = AsMessage.feed.makeModel({ items: pageFrom(0), more: AsMessage.More.Idle() })
    const b = AsMessage.feed.makeModel({ items: pageFrom(0), more: AsMessage.More.Idle() })
    expect(Equal.equals(a, b)).toBe(true)
    const [filled] = messagesAsMessage(a, 3)
    expect(Equal.equals(filled, { _tag: "ScrollEnded", offset: 3 })).toBe(true)
  })

  test("the types refuse the message without its value, or with a value of another type", () => {
    const model = AsMessage.feed.makeModel(AsMessage.feed.init.state)
    const sent: Array<AsMessage.Message> = []
    const dispatch = (message: AsMessage.Message) => void sent.push(message)
    if (model.more._tag === "Idle") {
      // @ts-expect-error the offset is missing
      dispatch(model.more.scrollEnded)
      // @ts-expect-error the offset is a number
      dispatch({ ...model.more.scrollEnded, offset: "0" })
      // Written whole by hand, it compiles, as any message does today.
      dispatch({ _tag: "ScrollEnded", offset: 0 })
    }
    expect(sent).toHaveLength(3)
  })
})

describe("point 2: messagesSentBy", () => {
  test("gives a handler that reads scrollTop nothing, in both forms", () => {
    expect(messagesSentBy(viewAsWrite, AsWrite.feed.makeModel(AsWrite.feed.init.state)) as ReadonlyArray<unknown>)
      .toEqual([
        { _tag: "Offset", message: { _tag: "Written", value: undefined } },
        { _tag: "ScrollEnded" }
      ])
    expect(messagesSentBy(viewAsMessage, AsMessage.feed.makeModel(AsMessage.feed.init.state)) as ReadonlyArray<unknown>)
      .toEqual([
        { _tag: "ScrollEnded", offset: undefined }
      ])
  })

  test("with what the target holds, each form sends what its reader returns", () => {
    fc.assert(fc.property(writeState, messageState, fc.nat(400), (stateA, stateB, scrollTop) => {
      const targetOf = (_: VNode, event: string) => event === "scrollend" ? { scrollTop } : {}
      const modelA = AsWrite.feed.makeModel(stateA)
      expect(messagesSentByWith(viewAsWrite, modelA, targetOf)).toEqual(
        modelA.more._tag === "Idle" ? [write(scrollTop), ...messagesAsWrite(modelA)] : []
      )
      const modelB = AsMessage.feed.makeModel(stateB)
      expect(messagesSentByWith(viewAsMessage, modelB, targetOf)).toEqual(messagesAsMessage(modelB, scrollTop))
    }))
  })
})

describe("point 3: a parent", () => {
  test("a parent's view forwards the filled message as it forwards any, and its reader wraps it", () => {
    const targetOf = (_: VNode, event: string) => event === "scrollend" ? { scrollTop: 7 } : {}
    const modelB = Parent.parentAsMessage.makeModel(Parent.parentAsMessage.init.state as Parent.StateAsMessage)
    expect(messagesSentByWith(Parent.parentViewAsMessage, modelB, targetOf)).toEqual(
      messagesAsMessage(modelB.feed, 7).map((message) => ({ _tag: "Feed", message }))
    )
    const modelA = Parent.parentAsWrite.makeModel(Parent.parentAsWrite.init.state as Parent.StateAsWrite)
    expect(messagesSentByWith(Parent.parentViewAsWrite, modelA, targetOf)).toEqual(
      [write(7), ...messagesAsWrite(modelA.feed)].map((message) => ({ _tag: "Feed", message }))
    )
  })

  test("the filled message reaches the child, and loads its page", () => {
    const { parentAsMessage } = Parent
    const init = stateOf(parentAsMessage, { title: "Rows" }, {})
    const { state, commands } = applyAll(parentAsMessage.update)([{
      _tag: "Feed",
      message: { _tag: "ScrollEnded", offset: endOf(PAGE) }
    }], init)
    expect(parentAsMessage.makeModel(state).feed.more._tag).toBe("Loading")
    expect(commands).toHaveLength(1)
  })
})

describe("point 5: what each form costs in a run", () => {
  // One scroll end short of the end, then one at it, on the first page: what is applied, and what a renderer is told.
  const measure = <Model>(
    started: Readonly<{ app: Readonly<{ model: () => Model; subscribe: (listener: () => void) => () => void }> }>,
    send: (model: Model, offset: number) => void
  ) => {
    let notices = 0
    const models = new Set<Model>()
    started.app.subscribe(() => {
      notices += 1
      models.add(started.app.model())
    })
    const before = started.app.model()
    send(before, 30)
    const short = { notices, models: models.size }
    send(started.app.model(), endOf(PAGE))
    return { short, atEnd: { notices: notices - short.notices, models: models.size - short.models } }
  }

  test("counted", () => {
    const applied = { write: 0, message: 0 }
    const asWrite = start(AsWrite.feed, { onApplied: () => void (applied.write += 1) })
    const resultWrite = measure(asWrite, (model: AsWrite.Model, offset) => {
      if (model.more._tag !== "Idle") return
      asWrite.app.dispatch(write(offset))
      asWrite.app.dispatch(model.more.scrollEnded)
    })
    const asMessage = start(AsMessage.feed, { onApplied: () => void (applied.message += 1) })
    const resultMessage = measure(asMessage, (model: AsMessage.Model, offset) => {
      if (model.more._tag !== "Idle") return
      asMessage.app.dispatch({ ...model.more.scrollEnded, offset })
    })
    console.log(JSON.stringify({ applied, asWrite: resultWrite, asMessage: resultMessage }))
    expect(applied.message).toBeLessThan(applied.write)
  })
})
