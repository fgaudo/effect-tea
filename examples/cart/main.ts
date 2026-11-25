import { start } from "@fgaudo/effect-tea"
import { drawInto } from "@fgaudo/effect-tea/snabbdom"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { cart, Shop } from "./cart.ts"
import { Prices } from "./row.ts"
import { view } from "./view.ts"

const root = document.getElementById("app")
if (root === null) throw new Error("index.html has no #app element")

// A slow shop, whose first payment is declined, so that the rows are seen to unlock. A reservation takes long
// enough for an item added just before "Pay" to arrive while the payment runs, and start locked.
let declined = false
const shop = Shop.of({
  reserve: () => Effect.sleep("1 second"),
  pay: Effect.sleep("2 seconds").pipe(Effect.andThen(Effect.sync(() => {
    const paid = declined
    declined = true
    return paid
  })))
})

const prices = Prices.of({ of: (quantity) => Effect.as(Effect.sleep("300 millis"), quantity * 4) })

const { app, run } = start(cart)
drawInto(root, { app, view })
Effect.runFork(
  run.pipe(
    Effect.provideService(Shop, shop),
    Effect.provideService(Prices, prices),
    // The failure of a program that dies is reported; an interruption is no crash.
    Effect.tapCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause)))
  )
)
