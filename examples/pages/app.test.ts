// The messages of the pages are built by the test (the parent's are `{ _tag: <page>, message }`), and the
// view's offers are read with `messageOf`.
import { describe, expect, test } from 'bun:test'
import { applyAll, dispatchViolations, missingOffers, simulate } from '@fgaudo/effect-tea/testing'
import { modelOf, run, subscriptionsOf } from '@fgaudo/effect-tea'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Opt from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as fc from 'fast-check'
import { messagesSentBy } from '../snabbdom.ts'
import * as About from './about.ts'
import { app, type Message, type Model, type State } from './app.ts'
import * as Clock from './clock.ts'
import { view } from './view.ts'

const aboutClicked: Message = { _tag: 'Clock', message: Clock.Message.AboutClicked() }
const backClicked: Message = { _tag: 'About', message: About.Message.BackClicked() }
const ticked = (millis: number): Message => ({
  _tag: 'Clock',
  message: Clock.Message.Ticked({ now: DateTime.makeUnsafe(millis) }),
})

const maybe = <A>(value: fc.Arbitrary<A>): fc.Arbitrary<Opt.Option<A>> =>
  fc.oneof(fc.constant(Opt.none()), value.map(Opt.some))

const state: fc.Arbitrary<State> = fc.record({
  clock: fc.record({ maybeNow: maybe(fc.nat().map((millis) => DateTime.makeUnsafe(millis))) }),
  maybeAbout: maybe(fc.record({ maybeSaying: maybe(fc.string()) })),
})

/** The pages whose subscriptions run, from the keys the library namespaces (`['Clock', 'ticks']`). */
const listening = (state: State) =>
  Array.from(HashMap.keys(subscriptionsOf(app)(state))).flatMap((key) => Array.isArray(key) ? [key[0]] : [])

describe('pages', () => {
  describe('navigation', () => {
    test('the Clock asks for About, which opens over it and loads its saying', () => {
      const { state, commands } = applyAll(app.update)([aboutClicked], app.init.state)
      expect(state.maybeAbout).toEqual(Opt.some(About.about.init.state))
      expect(commands).toEqual([{ _tag: 'About', command: About.Command.PickSaying() }])
    })

    test('About asks to be left, and the Clock is back as it was', () => {
      const { state } = applyAll(app.update)([ticked(0), aboutClicked, backClicked], app.init.state)
      expect(state).toEqual({ clock: { maybeNow: Opt.some(DateTime.makeUnsafe(0)) }, maybeAbout: Opt.none() })
    })

    test('the Clock stops ticking while About is over it', () => {
      expect(listening(app.init.state)).toEqual(['Clock'])
      expect(listening(applyAll(app.update)([aboutClicked], app.init.state).state)).toEqual([])
    })
  })

  test('the view sends what update accepts, all of it, and acts once when sent twice', () => {
    const violations = dispatchViolations(app.update)
    const missing = missingOffers(app.update, {
      withheld: (message, state) => message._tag === 'Clock' && Opt.isSome(state.maybeAbout),
    })
    fc.assert(fc.property(state, (before) => {
      const sent = messagesSentBy<Model, Message>(view, modelOf(app)(before))
      expect(violations(before, sent)).toEqual([])
      expect(missing(before, sent, [aboutClicked, backClicked])).toEqual([])
    }))
  })

  test('About receives its saying through the parent', async () => {
    const { state, messages } = await Effect.runPromise(simulate(app)([aboutClicked], app.init))
    expect(messages.map((message) => message._tag)).toEqual(['Clock', 'About'])
    expect(Opt.isSome(Opt.flatMap(state.maybeAbout, (about) => about.maybeSaying))).toBe(true)
  })

  // As it runs: a user opens About, from the Clock's own offer sent through the run's one dispatch.
  test('a user opens About, and every frame has the same dispatch', async () => {
    const dispatches = new Set<unknown>()
    await Effect.runPromise(
      run(app, (frames) =>
        frames.pipe(
          Stream.tap(({ model, dispatch }) => {
            dispatches.add(dispatch)
            return model.page._tag === 'Clock' && model.page.model.time !== ''
              ? dispatch(model.page.model.openAbout)
              : Effect.void
          }),
          Stream.takeUntil(({ model }) => model.page._tag === 'About' && Opt.isSome(model.page.model.saying)),
          Stream.runDrain,
        ), { onRejectedInput: 'die' }).pipe(Effect.timeout('3 seconds')),
    )
    expect(dispatches.size).toBe(1)
  })
})
