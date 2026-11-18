// A ball that falls, bounces lower each time, and comes to rest; "Throw" sends it up to the top, in flight too. It moves
// by equal steps of `dt`, its flags: a subscription, while the ball flies, sends one `Stepped` for each `dt` of time the
// screen's frames have gone through, and `update` advances the ball by `dt`. The messages carry no time, so the same
// steps give the same flight, in a test as in the browser. The renderer draws between the step before and the current
// one, by how far the loop of steps is into the next step: that is the renderer's business, and the state holds no
// clock (`interpolated.ts`).
import { defect, program, type Subscription, type Update } from '@fgaudo/effect-tea'
import * as Channel from 'effect/Channel'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'

/** The length of a step, in milliseconds: 1000 / 60 for 60 steps a second. */
export type Flags = Readonly<{ dt: number }>

/**
 * How far the loop of steps has gone, as it tells the renderer after each frame of the screen: the steps it has sent
 * since the flight began, and `alpha`, the part of the next step it has gone through, from 0 up to 1.
 */
export type Lead = Readonly<{ step: number; alpha: number }>

/**
 * The screen: the instants of its frames, in milliseconds, and where the loop of steps tells how far it has gone. The
 * program knows only this interface: `main.ts` and the tests provide it.
 */
export class Screen extends Context.Service<Screen, {
  readonly frames: Stream.Stream<number>
  readonly reached: (lead: Lead) => Effect.Effect<void>
}>()('examples/bounce/Screen') {}

/** The ball, at rest on the floor, or in flight: the steps of the flight so far, and its height at the step before. */
export type Ball = Data.TaggedEnum<{
  Resting: object
  Flying: { velocity: number; step: number; previous: number }
}>

export const Ball = Data.taggedEnum<Ball>()

/** The height is from 0, the floor, to 100, the top, and the velocity is in heights a second, upwards. */
export type State = Readonly<{ dt: number; height: number; ball: Ball }>

export type Message = Data.TaggedEnum<{
  ThrowClicked: object
  Stepped: object
}>

// Not exported, as the guide's "Model" says: a view sends only the messages its model holds, and builds none.
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

// One step of `dt` milliseconds, velocity first (semi-implicit Euler). A ball that reaches the floor bounces there.
const stepped = (state: State, velocity: number, step: number): State => {
  const seconds = state.dt / 1000
  const falling = velocity - gravity * seconds
  const height = state.height + falling * seconds
  const flight = (velocity: number) => Ball.Flying({ velocity, step: step + 1, previous: state.height })
  if (height > 0) return { ...state, height, ball: flight(falling) }
  const bounce = -falling * restitution
  return { ...state, height: 0, ball: bounce < settling ? Ball.Resting() : flight(bounce) }
}

export const update: Update<State, Message> = (message) => (state) => {
  switch (message._tag) {
    // A throw in flight keeps the steps of the flight: the loop that counts them goes on.
    case 'ThrowClicked':
      return {
        state: {
          ...state,
          ball: state.ball._tag === 'Flying'
            ? Ball.Flying({ ...state.ball, velocity: toTheTop(state.height) })
            : Ball.Flying({ velocity: toTheTop(state.height), step: 0, previous: state.height }),
        },
      }
    // A step arrives only in flight: the subscription that sends it stops when the ball rests, and the run drops what
    // it sent after. One anywhere else is a bug, and the run dies with it.
    case 'Stepped':
      return state.ball._tag === 'Flying'
        ? { state: stepped(state, state.ball.velocity, state.ball.step) }
        : defect('A step while the ball was at rest')
  }
}

/** What the loop of steps keeps between two frames of the screen. */
export type Loop = Readonly<{ last: Opt.Option<number>; accumulator: number; step: number }>

export const started: Loop = { last: Opt.none(), accumulator: 0, step: 0 }

/**
 * One frame of the screen, at `now`: the time since the frame before, at most `longestFrame`, is added to the
 * accumulator, and each whole `dt` in it is a step to send. The first frame only starts the clock.
 */
export const accumulate = (loop: Loop, now: number, dt: number): Readonly<{ loop: Loop; steps: number }> => {
  const elapsed = Opt.match(loop.last, {
    onNone: () => 0,
    onSome: (last) => Math.min(Math.max(now - last, 0), longestFrame),
  })
  let accumulator = loop.accumulator + elapsed
  let steps = 0
  while (accumulator >= dt) {
    accumulator -= dt
    steps += 1
  }
  return { loop: { last: Opt.some(now), accumulator, step: loop.step + steps }, steps }
}

/**
 * How far between the step before and the current one the renderer draws a ball at `step` of its flight, from where
 * the loop has gone: by `alpha` when the state has every step the loop sent, and at the current step when the state is
 * behind the loop, so that the ball never goes back. It is never below 0 nor above 1.
 */
export const alphaOf = (step: number, lead: Lead): number => Math.min(Math.max(lead.step - step + lead.alpha, 0), 1)

// The loop of steps, from the screen's frames: a step for each `dt`, and how far it has gone after each frame. It
// starts with each flight, as the key does, so it counts the flight's steps from 0. A screen's frames never end: frames
// that do are a broken `Screen`, not a broken rule of the program, and the run dies with it, rather than leave the ball
// in the air.
const steps = (dt: number): Subscription<Message, Screen> =>
  Channel.unwrap(
    Effect.map(Effect.service(Screen), (screen) =>
      Stream.toChannel(
        screen.frames.pipe(
          Stream.mapAccum(() => started, (loop, now) => {
            const next = accumulate(loop, now, dt)
            return [next.loop, [next]] as const
          }),
          Stream.tap(({ loop }) => screen.reached({ step: loop.step, alpha: loop.accumulator / dt })),
          // Not `Arr.replicate` nor `Arr.makeBy`: both return at least one element, and a frame shorter than `dt` sends
          // no step.
          Stream.map(({ steps }) => Array.from({ length: steps }, () => Message.Stepped())),
          Stream.flattenIterable,
        ),
      ).pipe(
        Channel.flattenArray,
        Channel.concatWith(() => Channel.die(new Error('The frames of the screen ended'))),
      )),
  )

/** Whether the ball moves: the program listens to the screen exactly then. */
export const flying = (state: State): boolean => state.ball._tag === 'Flying'

export type Model = Readonly<{
  throw: Message
  ball:
    | Readonly<{ _tag: 'Resting'; height: number }>
    | Readonly<{ _tag: 'Flying'; step: number; from: number; to: number }>
}>

export const bounce = program<{ state: State; model: Model; message: Message; flags: Flags }>().make({
  init: ({ dt }) => ({ state: { dt, height: 100, ball: Ball.Flying({ velocity: 0, step: 0, previous: 100 }) } }),
  update,
  // The key stays while the ball flies, so the subscription made from the state where it appeared keeps running: `dt`
  // never changes, so any state's would do.
  subscriptions: (state) => flying(state) ? HashMap.make(['steps', steps(state.dt)]) : HashMap.empty(),
  makeModel: (state) => ({
    throw: Message.ThrowClicked(),
    ball: state.ball._tag === 'Flying'
      ? { _tag: 'Flying', step: state.ball.step, from: state.ball.previous, to: state.height }
      : { _tag: 'Resting', height: state.height },
  }),
})
