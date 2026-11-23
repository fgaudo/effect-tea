// Both forms drawn with React, which reports the end of a scroll as `onScrollEnd`: the bridge sees nothing of it.
import { type Dispatch, forwardTo } from "@fgaudo/effect-tea"
import type * as AsMessage from "./as-message.ts"
import type * as AsWrite from "./as-write.ts"

export const ViewAsWrite = ({ model, dispatch }: { model: AsWrite.Model; dispatch: Dispatch<AsWrite.Message> }) => {
  const { more } = model
  return (
    <main>
      <ul
        className="feed"
        {...(more._tag === "Idle"
          ? {
            onScrollEnd: (event: React.UIEvent<HTMLUListElement>) => {
              forwardTo(dispatch, "Offset")({ _tag: "Written", value: event.currentTarget.scrollTop })
              dispatch(more.scrollEnded)
            }
          }
          : {})}
      >
        {model.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {more._tag === "Loading" ? <p>Loading…</p> : null}
    </main>
  )
}

export const ViewAsMessage = (
  { model, dispatch }: { model: AsMessage.Model; dispatch: Dispatch<AsMessage.Message> }
) => {
  const { more } = model
  return (
    <main>
      <ul
        className="feed"
        {...(more._tag === "Idle"
          ? {
            onScrollEnd: (event: React.UIEvent<HTMLUListElement>) =>
              dispatch({ ...more.scrollEnded, offset: event.currentTarget.scrollTop })
          }
          : {})}
      >
        {model.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {more._tag === "Loading" ? <p>Loading…</p> : null}
    </main>
  )
}
