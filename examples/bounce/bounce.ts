// A ball that falls, bounces lower each time, and comes to rest; "Throw" sends it up to the top, in flight too. It moves
// by equal steps of `dt`, its flags: a subscription, while the ball flies, sends one `Stepped` for each `dt` of time the
// screen's frames have gone through, and `update` advances the ball by `dt`. The steps carry no time, so the same steps
// give the same flight, in a test as in the browser. After the steps of each frame, the subscription sends `Advanced`,
// the part of the next step the screen is into: the state keeps it, `update` decides nothing by it, and `makeModel`
// gives the height between the step before and the current one, by that part.
import { defect, program, type Subscription, type Update } from "@fgaudo/effect-tea"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Opt from "effect/Option"
import * as Stream from "effect/Stream"

/** The length of a step, in milliseconds: 1000 / 60 for 60 steps a second. */
export type Flags = Readonly<{ dt: number }>

/**
 * The screen: the instants of its frames, in milliseconds. The program knows only this interface: `main.ts` and the
 * tests provide it.
 */
export class Screen extends Context.Service<Screen, { readonly frames: Stream.Stream<number> }>()(
  "examples/bounce/Screen"
) {}

/**
 * The ball, at rest on the floor, or in flight: its height at the step before, and `alpha`, the part of the next step
 * the screen is into, from 0 up to 1.
 */
export type Ball = Data.TaggedEnum<{
  Resting: object
  Flying: { velocity: number; previous: number; alpha: number }
}>

export const Ball = Data.taggedEnum<Ball>()

/** The height is from 0, the floor, to 100, the top, and the velocity is in heights a second, upwards. */
export type State = Readonly<{ dt: number; height: number; ball: Ball }>

export type Message = Data.TaggedEnum<{
  ThrowClicked: object
  Stepped: object
  Advanced: { alpha: number }
}>

// Not exported, so that no view calls its constructors, as the guide's "Model" says.
const Message = Data.taggedEnum<Message>()

const gravity = 400
// What a bounce keeps of the velocity.
const restitution = 0.7
// A bounce slower than this leaves the ball at rest.
const settling = 40
// The longest time a frame of the screen adds to the loop: after a tab in the background, time is lost, rather than
// thousands of steps sent at once.
const longestFrame = 250

// The velocity that takes the ball from `height` up to the top.
const toTheTop = (height: number) => Math.sqrt(2 * gravity * Math.max(100 - height, 0))

// One step of `dt` milliseconds, velocity first (semi-implicit Euler). A ball that reaches the floor bounces there. The
// new step starts at `alpha` 0: a model drawn before the next `Advanced` shows the ball at the step before, never back.
const stepped = (state: State, velocity: number): State => {
  const seconds = state.dt / 1000
  const falling = velocity - gravity * seconds
  const height = state.height + falling * seconds
  const flight = (velocity: number) => Ball.Flying({ velocity, previous: state.height, alpha: 0 })
  if (height > 0) return { ...state, height, ball: flight(falling) }
  const bounce = -falling * restitution
  return { ...state, height: 0, ball: bounce < settling ? Ball.Resting() : flight(bounce) }
}

export const update: Update<State, Message> = (message) => (state) => {
  switch (message._tag) {
    // A throw in flight changes only the velocity: the ball is drawn from where it was.
    case "ThrowClicked":
      return {
        state: {
          ...state,
          ball: state.ball._tag === "Flying"
            ? Ball.Flying({ ...state.ball, velocity: toTheTop(state.height) })
            : Ball.Flying({ velocity: toTheTop(state.height), previous: state.height, alpha: 0 })
        }
      }
    // A step and a part of one arrive only in flight: the subscription that sends them stops when the ball rests, and
    // the run drops what it sent that `update` has not seen, such as the part sent after the last step (the guide's
    // "Subscriptions", "What a stopped subscription sent is dropped"). One anywhere else is a bug, and the run dies
    // with it.
    case "Stepped":
      return state.ball._tag === "Flying"
        ? { state: stepped(state, state.ball.velocity) }
        : defect("A step while the ball was at rest")
    // Where the ball is drawn, and nothing else: no case of `update` reads `alpha`.
    case "Advanced":
      return state.ball._tag === "Flying"
        ? { state: { ...state, ball: Ball.Flying({ ...state.ball, alpha: message.alpha }) } }
        : defect("A part of a step while the ball was at rest")
  }
}

/** What the loop of steps keeps between two frames of the screen. */
export type Loop = Readonly<{ last: Opt.Option<number>; accumulator: number }>

export const started: Loop = { last: Opt.none(), accumulator: 0 }

/**
 * One frame of the screen, at `now`: the time since the frame before, at most `longestFrame`, is added to the
 * accumulator, and each whole `dt` in it is a step to send. The first frame only starts the clock.
 */
export const accumulate = (loop: Loop, now: number, dt: number): Readonly<{ loop: Loop; steps: number }> => {
  const elapsed = Opt.match(loop.last, {
    onNone: () => 0,
    onSome: (last) => Math.min(Math.max(now - last, 0), longestFrame)
  })
  let accumulator = loop.accumulator + elapsed
  let steps = 0
  while (accumulator >= dt) {
    accumulator -= dt
    steps += 1
  }
  return { loop: { last: Opt.some(now), accumulator }, steps }
}

// The loop of steps, from the screen's frames: for each frame, a step for each `dt`, then the part of the next step
// that the accumulator keeps. It starts with each flight, as the key does. A screen's frames never end: frames that do
// are a broken `Screen`, not a broken rule of the program, and the run dies with it, rather than leave the ball in the
// air.
const steps = (dt: number): Subscription<Message, Screen> =>
  Channel.unwrap(
    Effect.map(Effect.service(Screen), (screen) =>
      Stream.toChannel(
        screen.frames.pipe(
          Stream.mapAccum(() => started, (loop, now) => {
            const next = accumulate(loop, now, dt)
            // Not `Arr.replicate` nor `Arr.makeBy`: both return at least one element, and a frame shorter than `dt`
            // sends no step.
            const due = Array.from({ length: next.steps }, () => Message.Stepped())
            return [next.loop, [...due, Message.Advanced({ alpha: next.loop.accumulator / dt })]] as const
          })
        )
      ).pipe(
        Channel.flattenArray,
        Channel.concatWith(() => Channel.die(new Error("The frames of the screen ended")))
      ))
  )

/** What the program listens to: the steps of a flight, with the length of a step, which its subscription needs. */
export type Key = Data.TaggedEnum<{ Steps: { dt: number } }>

export const Key = Data.taggedEnum<Key>()

/** Whether the ball moves: the program listens to the screen exactly then. */
export const flying = (state: State): boolean => state.ball._tag === "Flying"

/**
 * The throw, and the height to draw the ball at. The screen draws a ball at a height, at rest as in flight, so the
 * model tells them apart no more than the screen does.
 */
export type Model = Readonly<{ throw: Message; height: number }>

export const bounce = program<{ state: State; model: Model; message: Message; flags: Flags; key: Key }>().make({
  init: ({ dt }) => ({ state: { dt, height: 100, ball: Ball.Flying({ velocity: 0, previous: 100, alpha: 0 }) } }),
  update,
  subscriptions: (state) => flying(state) ? [Key.Steps({ dt: state.dt })] : [],
  listen: ({ dt }) => steps(dt),
  makeModel: (state) => ({
    throw: Message.ThrowClicked(),
    height: state.ball._tag === "Flying"
      ? state.ball.previous + (state.height - state.ball.previous) * state.ball.alpha
      : state.height
  })
})
