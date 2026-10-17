import { describe, expect, test } from 'bun:test'
import { type Dispatch, mapDispatch, type Offer } from '@fgaudo/effect-tea'
import { applyAll, dispatchViolations, drive, simulate, tap } from '@fgaudo/effect-tea/testing'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import * as About from './about.ts'
import { app, Command, Message, type State, update } from './app.ts'
import * as Clock from './clock.ts'
import { view } from './view.ts'

const aboutClicked = Message.GotClock({ message: Clock.Message.AboutClicked() })
const backClicked = Message.GotAbout({ message: About.Message.BackClicked() })
const ticked = (millis: number) =>
  Message.GotClock({ message: Clock.Message.Ticked({ now: DateTime.makeUnsafe(millis) }) })

const maybe = <A>(value: fc.Arbitrary<A>): fc.Arbitrary<Opt.Option<A>> =>
  fc.oneof(fc.constant(Opt.none()), value.map(Opt.some))

const state: fc.Arbitrary<State> = fc.record({
  clock: fc.record({ maybeNow: maybe(fc.nat().map((millis) => DateTime.makeUnsafe(millis))) }),
  maybeAbout: maybe(fc.record({ maybeSaying: maybe(fc.string()) })),
})

// Actions on a page's offers, wrapped as the parent's view wraps them.
const onClock = (offer: Offer<Clock.Message>) =>
  Opt.map(
    tap(offer),
    (action) => (dispatch: Dispatch<Message>) =>
      action(mapDispatch(dispatch, (message) => Message.GotClock({ message }))),
  )

const onAbout = (offer: Offer<About.Message>) =>
  Opt.map(
    tap(offer),
    (action) => (dispatch: Dispatch<Message>) =>
      action(mapDispatch(dispatch, (message) => Message.GotAbout({ message }))),
  )

/** The pages whose subscriptions run, from the keys `embed` namespaces (`['Clock', 'ticks']`). */
const listening = (state: State) =>
  Array.from(HashMap.keys(app.subscriptions(state))).flatMap((key) => Array.isArray(key) ? [key[0]] : [])

describe('pages', () => {
  // The parent's `update`: the pages' events become navigation.
  describe('navigation', () => {
    test('the Clock asks for About, which opens over it and loads its saying', () => {
      const { state, commands } = applyAll(update)([aboutClicked], app.init.state)
      expect(state.maybeAbout).toEqual(Opt.some(About.about.init.state))
      expect(commands).toEqual([Command.About({ command: About.Command.PickSaying() })])
    })

    test('About asks to be left, and the Clock is back as it was', () => {
      const { state } = applyAll(update)([ticked(0), aboutClicked, backClicked], app.init.state)
      expect(state).toEqual({ clock: { maybeNow: Opt.some(DateTime.makeUnsafe(0)) }, maybeAbout: Opt.none() })
    })

    test('the Clock stops ticking while About is over it', () => {
      expect(listening(app.init.state)).toEqual(['Clock'])
      expect(listening(applyAll(update)([aboutClicked], app.init.state).state)).toEqual([])
    })
  })

  // The real view, for any state: whichever page is drawn, it sends only what the parent accepts.
  test('the view only sends what update accepts, and acts once when sent twice', () => {
    const check = dispatchViolations(update)
    fc.assert(fc.property(state, (before) => {
      expect(check(before, messagesSentBy(view, app.makeModel(before)))).toEqual([])
    }))
  })

  // The commands that `liftCommands` started reach About, wrapped by the parent.
  test('About receives its saying through the parent', async () => {
    const { state, messages } = await Effect.runPromise(simulate(app)([aboutClicked], app.init))
    expect(messages.map((message) => message._tag)).toEqual(['GotClock', 'GotAbout'])
    expect(Opt.isSome(Opt.flatMap(state.maybeAbout, (about) => about.maybeSaying))).toBe(true)
  })

  // The program as it runs: the clock ticks, and a user goes to About and back.
  test('a user opens About and goes back to the Clock', async () => {
    const time = await Effect.runPromise(drive(app, (driver) =>
      Effect.gen(function*() {
        yield* driver.send((model) =>
          model.page._tag === 'Clock' && model.page.model.time !== '' ? onClock(model.page.model.openAbout) : Opt.none()
        )
        yield* driver.waitFor((model) => model.page._tag === 'About' ? model.page.model.saying : Opt.none())
        yield* driver.send((model) => model.page._tag === 'About' ? onAbout(model.page.model.back) : Opt.none())
        return yield* driver.waitFor((model) =>
          model.page._tag === 'Clock' ? Opt.some(model.page.model.time) : Opt.none()
        )
      })))
    expect(time).not.toBe('')
  })
})
