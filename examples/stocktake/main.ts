import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { Scanner, Server, ServerError, type ServerItem, stocktake } from "./stocktake.ts"
import { view } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

const items: ReadonlyArray<ServerItem> = [
  { id: "bolts", code: "C-BOLT", name: "Bolts", expected: 12 },
  { id: "nuts", code: "C-NUT", name: "Nuts", expected: 8 },
  { id: "washers", code: "C-WASHER", name: "Washers", expected: 20 }
]

// A slow server that refuses a count of more than 500 of one item, to show a failure.
const server = Server.of({
  load: () => Effect.as(Effect.sleep("600 millis"), items),
  submit: (_, counts) =>
    Effect.sleep("800 millis").pipe(
      Effect.andThen(
        Arr.some(counts, ({ counted }) => counted > 500)
          ? Effect.fail(new ServerError({ message: "The server refused a count of more than 500" }))
          : Effect.void
      )
    )
})

// A scanner that scans a few codes, one of them unknown, then is unplugged: each Reconnect gives a new feed.
const scanner = Scanner.of({
  scans: Stream.fromIterable(["C-BOLT", "C-NUT", "C-BOLT", "X-0042", "C-WASHER", "C-BOLT"]).pipe(
    Stream.mapEffect((code) => Effect.as(Effect.sleep("1500 millis"), code))
  )
})

const app = start(stocktake, { flags: { aisle: "A3" } })
drawInto(root, view)(app)
Effect.runFork(
  app.run.pipe(
    Effect.provideService(Server, server),
    Effect.provideService(Scanner, scanner),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
