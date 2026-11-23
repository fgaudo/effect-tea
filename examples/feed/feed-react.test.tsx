// Point 3, the bridge to React: both forms drawn by React in a DOM (happy-dom), a scroll end fired on the list.
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, expect, test } from "bun:test"

beforeAll(() => GlobalRegistrator.register())

afterAll(() => GlobalRegistrator.unregister())

test("React gives each form's handler the offset of the list, and the bridge plays no part", async () => {
  const { act } = await import("react")
  const { createRoot } = await import("react-dom/client")
  const AsMessage = await import("./as-message.ts")
  const AsWrite = await import("./as-write.ts")
  const { ViewAsMessage, ViewAsWrite } = await import("./view-react.tsx")
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const sentB: Array<unknown> = []
  const sentA: Array<unknown> = []
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <>
        <ViewAsMessage
          model={AsMessage.feed.makeModel(AsMessage.feed.init.state)}
          dispatch={(message) => void sentB.push(message)}
        />
        <ViewAsWrite
          model={AsWrite.feed.makeModel(AsWrite.feed.init.state)}
          dispatch={(message) => void sentA.push(message)}
        />
      </>
    )
  )
  const [listB, listA] = Array.from(host.querySelectorAll("ul"))
  if (listA === undefined || listB === undefined) throw new Error("no list drawn")
  listB.scrollTop = 64
  listA.scrollTop = 64
  act(() => {
    listB.dispatchEvent(new Event("scrollend"))
    listA.dispatchEvent(new Event("scrollend"))
  })
  expect(sentB).toEqual([{ _tag: "ScrollEnded", offset: 64 }])
  expect(sentA).toEqual([{ _tag: "Offset", message: { _tag: "Written", value: 64 } }, { _tag: "ScrollEnded" }])
  act(() => root.unmount())
})
