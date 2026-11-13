// One mutation for each check an invariant rests on (docs/invariants.md), each with the tests
// that must fail under it. `mutate.ts` applies them one at a time.

export type Mutation = Readonly<{
  /** The check the mutation takes out. */
  name: string
  /** The file it changes, from the root of the repository. */
  file: string
  /** What it replaces, which the file must hold exactly once, and with what. */
  from: string
  to: string
  /** The tests that must fail under it, by file and by name. */
  killedBy: ReadonlyArray<readonly [file: string, test: string]>
}>

export const mutations: ReadonlyArray<Mutation> = [
  {
    name: 'update is called after the first defect',
    file: 'src/core.ts',
    from: '  if (died()) return dead\n',
    to: '',
    killedBy: [
      ['src/core.test.ts', 'once the run has died, update is not called'],
      ['src/engine.test.ts', 'no update is called on a message taken once a command has died'],
    ],
  },
  {
    name: 'a message is dropped before the register is read',
    file: 'src/core.ts',
    from: '  if (died()) return dead\n'
      + "  if (source._tag === 'Subscription' && !active.starts.has(source.generation)) return dropped\n",
    to: "  if (source._tag === 'Subscription' && !active.starts.has(source.generation)) return dropped\n"
      + '  if (died()) return dead\n',
    killedBy: [
      [
        'src/core.test.ts',
        'a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing',
      ],
      [
        'src/core.test.ts',
        'under any history of listings, arrivals and a death, update is called exactly when it applies',
      ],
      ['src/engine.test.ts', 'a message of a stopped subscription, taken once a command has died, is not described'],
    ],
  },
  {
    name: 'a message of a stopped start reaches update',
    file: 'src/core.ts',
    from: "source._tag === 'Subscription' && !active.starts.has(source.generation)",
    to: 'false',
    killedBy: [
      [
        'src/core.test.ts',
        'a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing',
      ],
      ['src/engine.test.ts', 'a message left by an earlier start of a key that came back does not reach update'],
      ['src/run.test.ts', 'what a subscription leaves in the queue after its key went away does not reach update'],
      ['src/run.test.ts', 'a Logger that throws on the log of a dropped message is one defect, in the log'],
    ],
  },
  {
    name: 'a message applies by its key, not by its start',
    file: 'src/core.ts',
    from: "source._tag === 'Subscription' && !active.starts.has(source.generation)",
    to: "source._tag === 'Subscription' && !HashMap.has(active.keys, source.key)",
    killedBy: [
      [
        'src/core.test.ts',
        'a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing',
      ],
      ['src/engine.test.ts', 'a message left by an earlier start of a key that came back does not reach update'],
    ],
  },
  {
    name: 'keys start before the gone keys are released',
    file: 'src/engine.ts',
    from: 'onSome: stopping })),',
    to: 'onSome: (fiber) => Effect.forkDetach(stopping(fiber)) })),',
    killedBy: [
      ['src/engine.test.ts', 'a key that changes stops the old subscription and starts the new one'],
    ],
  },
  {
    name: 'the gone keys are released one after the other',
    file: 'src/engine.ts',
    from: "      { concurrency: 'unbounded', discard: true },\n",
    to: '      { discard: true },\n',
    killedBy: [
      [
        'src/engine.test.ts',
        'keys that go away together release their subscriptions together, not one after the other',
      ],
    ],
  },
  {
    name: 'the same state makes a new frame',
    file: 'src/core.ts',
    from: 'const changed = result.state !== current.state',
    to: 'const changed = true',
    killedBy: [
      ['src/core.test.ts', 'the very same state keeps its revision, and its commands still run'],
      ['src/engine.test.ts', 'a message that keeps the same state makes no new revision'],
      ['src/engine.test.ts', 'its commands still run'],
      ['src/run.test.ts', 'a message that leaves the very same state is heard too, with an unchanged revision'],
    ],
  },
  {
    name: 'scopedIn wraps again what it wrapped',
    file: 'src/engine.ts',
    from: '(defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),',
    to: '() => false,',
    killedBy: [
      ['src/run.test.ts', 'every defect of the cause is kept, each with where it happened'],
      ['src/run.test.ts', 'after the command died, is a second defect of the command, after the first'],
      [
        'src/run.test.ts',
        'a command that dies under a release of its own dies once it has released, applying messages meanwhile',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a run whose command dies, then dies again as it slowly releases, fails with both',
      ],
      [
        'src/testing/contract.test.ts',
        'in the run, a defect of what a stopped subscription releases is all the cause holds',
      ],
    ],
  },
  {
    name: 'scopedIn tells what it wrapped by the register',
    file: 'src/engine.ts',
    from: '(defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),',
    to: 'deaths.has,',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a release that dies with a defect already recorded elsewhere fails it with a second one',
      ],
    ],
  },
  {
    name: 'a defect is recorded after the release of its scope',
    file: 'src/engine.ts',
    from: '        deaths.recorded,\n      )).pipe(\n',
    to: '      )).pipe(\n',
    killedBy: [
      ['src/run.test.ts', 'a renderer that dies before a command is the first defect of the cause'],
      [
        'src/run.test.ts',
        'a command that dies before another, which its release lets die, is the first defect of the cause',
      ],
      ['src/run.test.ts', 'a subscription that dies before another, which its release lets die, is the first defect'],
      [
        'src/run.test.ts',
        'a subscription dying in a scope of its channel, before one its release lets die, is the first defect',
      ],
      [
        'src/run.test.ts',
        'a subscription dying in a scope of its channel lets no message apply as the channel releases',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a command that dies before another, which its release lets die, fails it first',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a subscription that dies before another, which its release lets die, fails it first',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a subscription dying in a scope of its channel, before one its release lets die, fails it first',
      ],
    ],
  },
  {
    name: "a subscription's channel releases its scopes before its defect is recorded",
    file: 'src/engine.ts',
    from: 'Channel.toPull(subscription).pipe(\n'
      + '    Effect.flatMap((pull) => Effect.forever(Effect.flatMap(pull, send), { disableYield: true })),\n'
      + '    Pull.catchDone(Effect.succeed),\n'
      + '  )',
    to: 'Channel.runForEach(subscription, send)',
    killedBy: [
      [
        'src/run.test.ts',
        'a subscription dying in a scope of its channel, before one its release lets die, is the first defect',
      ],
      [
        'src/run.test.ts',
        'a subscription dying in a scope of its channel lets no message apply as the channel releases',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a subscription dying in a scope of its channel, before one its release lets die, fails it first',
      ],
    ],
  },
  {
    name: 'a self-interruption is no defect',
    file: 'src/engine.ts',
    from: 'const own = Core.otherwiseDefect(cause, Exit.isFailure(received) ? received.cause : Cause.empty)',
    to: 'const own = cause as Cause.Cause<never>',
    killedBy: [
      ['src/run.test.ts', 'a command that interrupts itself is a defect, where it happened'],
      [
        'src/run.test.ts',
        'a command that joins an interrupted fiber that interrupts itself is a defect, where it happened',
      ],
      ['src/run.test.ts', 'a subscription that interrupts itself is a defect, where it happened'],
      ['src/run.test.ts', 'onApplied that interrupts itself is a defect, where it happened'],
      ['src/run.test.ts', 'the renderer that interrupts itself is a defect, where it happened'],
      [
        'src/run.test.ts',
        'a command that fails without a defect, which its type rules out, is a defect in the command',
      ],
      ['src/run.test.ts', 'after the command died, is a second defect of the command, after the first'],
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect, as the run dies, on a command interrupting itself',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect, as the run dies, on a command interrupting itself',
      ],
      ['src/testing/contract.test.ts', 'the run dies with a defect of a command interrupting itself'],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect, as the run dies, on a subscription interrupting itself',
      ],
      [
        'src/testing/rehearse.test.ts',
        'rehearse fails on a release that interrupts itself after its command died, with two defects',
      ],
    ],
  },
  {
    name: 'an interruption the fiber received is taken for its own',
    file: 'src/engine.ts',
    from: 'Exit.isFailure(received) ? received.cause : Cause.empty',
    to: 'Cause.empty',
    killedBy: [
      ['src/run.test.ts', 'a run interrupted by whoever runs it is no defect'],
      ['src/run.test.ts', 'a subscription stopped inside an uninterruptible region is no defect'],
    ],
  },
  {
    name: 'a self-interruption beside one the fiber received is no defect',
    file: 'src/core.ts',
    from: 'interrupters.some(({ fiberId, mark }) => fiberId === reason.fiberId && mark === markOf(reason))',
    to: 'interrupters.length > 0',
    killedBy: [
      [
        'src/core.test.ts',
        'an interruption the fiber received is kept as it is, beside the defect its own interruption is',
      ],
      [
        'src/run.test.ts',
        'a renderer that interrupts itself as whoever runs the run interrupts it is a defect in the renderer',
      ],
      [
        'src/run.test.ts',
        'a command that interrupts itself as whoever runs the run interrupts it is a defect in the command',
      ],
      ['src/run.test.ts', 'a subscription that interrupts itself as the run stops it is a defect in the subscription'],
      [
        'src/testing/contract.test.ts',
        'the run dies with a defect of a command interrupting itself as whoever runs it interrupts it',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it',
      ],
      [
        'src/testing/contract.test.ts',
        'the run dies with a defect of a subscription interrupting itself as the run stops it',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription interrupting itself as it stops it',
      ],
    ],
  },
  {
    name: 'a defect is recorded once for each fiber it ends',
    file: 'src/core.ts',
    from: 'keeps(reason.defect) && !holds(deaths, reason.defect)',
    to: 'keeps(reason.defect)',
    // The rest of the suite: `rehearse.test.ts` hangs under it.
    killedBy: [
      ['src/core.test.ts', 'keeps each defect once, by its identity, in the order the fibers died'],
      ['src/core.test.ts', 'is the same register when nothing new died, so that the shell signals only a new death'],
      ['src/run.test.ts', 'every defect of the cause is kept, each with where it happened'],
      ['src/run.test.ts', 'a Logger that throws on what a command logs is a defect in the command'],
      ['src/run.test.ts', 'a renderer that dies before a command is the first defect of the cause'],
      [
        'src/testing/contract.test.ts',
        'in the run, a defect of what a stopped subscription releases is all the cause holds',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with the defect alone, as the run dies, though a hearNext waited',
      ],
    ],
  },
  {
    name: "the run's queue is bounded",
    file: 'src/engine.ts',
    from: 'Queue.unbounded<Envelope<Message, K>>()',
    to: 'Queue.bounded<Envelope<Message, K>>(1)',
    killedBy: [
      ['src/engine.test.ts', 'a message left by an earlier start of a key that came back does not reach update'],
    ],
  },
  {
    name: "the run's fibers log into the span of whoever runs it",
    file: 'src/engine.ts',
    from: "if (span === undefined || span._tag === 'ExternalSpan') return context",
    to: 'return context',
    killedBy: [
      [
        'src/run.test.ts',
        'what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans',
      ],
    ],
  },
  {
    name: 'a message is described while debug logs are disabled',
    file: 'src/engine.ts',
    from: "        if (debugging) {\n          yield* log('Message',",
    to: "        if (true) {\n          yield* log('Message',",
    killedBy: [
      ['src/run.test.ts', 'messages and commands are described only while debug logs are enabled'],
    ],
  },
  {
    name: 'the run ends with what it ended with, not with its defects first',
    file: 'src/core.ts',
    from: 'deaths.length === 0 ? exit :',
    to: 'true ? exit :',
    killedBy: [
      ['src/core.test.ts', 'a run that died ends with its defects first, then the rest of what it ended with'],
      [
        'src/run.test.ts',
        'an interrupted run whose renderer dies as it releases has the defect first, then the interruption',
      ],
      ['src/testing/contract.test.ts', 'rehearse fails, as the run dies, on a command that dies in a fiber nobody joins'],
      [
        'src/testing/contract.test.ts',
        'drive fails, as rehearse does, with the defect first, then with what the scenario ended with',
      ],
    ],
  },
  {
    name: 'a defect the run died of is in its cause again, among the rest of what it ended with',
    file: 'src/core.ts',
    from: '!(Cause.isDieReason(reason) && holds(deaths, reason.defect))',
    to: 'true',
    killedBy: [
      ['src/core.test.ts', 'a run that died ends with its defects first, then the rest of what it ended with'],
      ['src/core.test.ts', 'a defect is left out of the rest by its identity, never by Equal'],
      ['src/run.test.ts', 'every defect of the cause is kept, each with where it happened'],
      ['src/testing/rehearse.test.ts', 'a defect the scenario catches fails it all the same, first, and once'],
    ],
  },
  {
    name: 'the run does not stop the renderer',
    file: 'src/run.ts',
    from: '    const renderer = yield* Effect.acquireRelease(\n'
      + '      Effect.forkChild(rendering),\n'
      + '      (renderer) =>\n'
      + '        engine.stop.pipe(Effect.andThen(Engine.stopping(renderer))),\n'
      + '    )\n',
    to: '    const renderer = yield* Effect.forkChild(rendering)\n',
    killedBy: [
      ['src/run.test.ts', 'a renderer that dies while an interrupted run releases it is in the cause'],
      [
        'src/run.test.ts',
        'an interrupted run whose renderer dies as it releases has the defect first, then the interruption',
      ],
      ['src/run.test.ts', 'a renderer that dies as a run that died elsewhere releases it is in the cause'],
      [
        'src/run.test.ts',
        'a makeModel that dies as a run that died releases the renderer is the second defect, in render',
      ],
      ['src/run.test.ts', 'a command that dies once the renderer of an interrupted run has ended ends the run with it'],
      ['src/run.test.ts', 'a command that dies while an interrupted run releases the renderer ends the run with it'],
      [
        'src/run.test.ts',
        'a subscription that dies while an interrupted run releases the renderer ends the run with it',
      ],
      ['src/run.test.ts', 'a command that dies while a run that died elsewhere releases the renderer is in the cause'],
      [
        'src/run.test.ts',
        'a subscription that dies while a run that died elsewhere releases the renderer is in the cause',
      ],
      ['src/run.test.ts', 'a renderer that dies before a command is the first defect of the cause'],
      [
        'src/run.test.ts',
        'a renderer that interrupts itself as whoever runs the run interrupts it is a defect in the renderer',
      ],
    ],
  },
  {
    name: 'an interruption with the fiber id of one the fiber received is no defect, whatever its mark',
    file: 'src/core.ts',
    from: ' && mark === markOf(reason)',
    to: '',
    killedBy: [
      ['src/core.test.ts', 'an interruption with the fiber id of one received, and not its mark, is a defect'],
      [
        'src/run.test.ts',
        'a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the renderer',
      ],
    ],
  },
  {
    name: 'the run stops its fibers with no mark of its own',
    file: 'src/engine.ts',
    from: 'Fiber.interruptAs(fiber, id, Context.make(Core.Stopped, {}))',
    to: 'Fiber.interruptAs(fiber, id)',
    killedBy: [
      [
        'src/run.test.ts',
        'a renderer that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the renderer',
      ],
    ],
  },
  {
    name: 'the end of the run stops the renderer before the loop',
    file: 'src/run.ts',
    from: 'engine.stop.pipe(Effect.andThen(Engine.stopping(renderer)))',
    to: 'Engine.stopping(renderer)',
    killedBy: [
      ['src/run.test.ts', 'a message the renderer sends as the run releases it does not reach update'],
    ],
  },
  {
    name: "dispatchTo holds a child's dispatch strongly",
    file: 'src/dispatch.ts',
    from: 'MutableHashMap.set(byId, key, new WeakRef(wrapping))',
    to: 'MutableHashMap.set(byId, key, { deref: () => wrapping } as never)',
    killedBy: [
      ['src/dispatch.test.ts', 'keeps nothing for the ids nobody holds'],
      ['src/dispatch.test.ts', 'lets go of what a long list held once the list is no longer drawn'],
      ['src/dispatch.test.ts', 'lets go of collected dispatches without comparing ids again'],
    ],
  },
  {
    name: 'dispatchTo lets go of an entry whose dispatch is alive',
    file: 'src/dispatch.ts',
    from: 'if (Opt.isSome(entry) && entry.value.deref() === undefined)',
    to: 'if (Opt.isSome(entry))',
    killedBy: [
      ['src/dispatch.test.ts', 'keeps the entry of a new dispatch made for the id of a collected one'],
    ],
  },
  {
    name: "dispatchTo makes a child's dispatch anew each time",
    file: 'src/dispatch.ts',
    from: '  if (Opt.isSome(found)) return found.value as ChildDispatch<Message, Name>\n',
    to: '',
    killedBy: [
      [
        'src/dispatch.test.ts',
        'gives a function someone holds every time it is asked for, through collections and new ids',
      ],
      ['src/dispatch.test.ts', 'keeps the entry of a new dispatch made for the id of a collected one'],
      ['src/dispatch.test.ts', 'tells ids apart by value, as subscription keys are'],
      ['src/compose.test.ts', 'one dispatch for every frame, and the same dispatch for a child in every frame'],
    ],
  },
  {
    name: "a child's model is made anew for a state it was made for",
    file: 'src/compose.ts',
    from: '    if (kept.has(childState)) return kept.get(childState)\n',
    to: '',
    killedBy: [
      ['src/compose.test.ts', 'one program as two children, in the very same state object, has one model'],
      ['src/compose.test.ts', 'children that share one state object share its model, and their dispatch adds their id'],
      ['src/compose.test.ts', 'in a run, a nested child that did not change keeps its model from frame to frame'],
    ],
  },
  {
    name: "a child's lifted subscriptions are kept without their place",
    file: 'src/compose.ts',
    from: 'kept !== undefined && kept.place.name === place.name && Equal.equals(kept.place.id, place.id)',
    to: 'kept !== undefined',
    killedBy: [
      ['src/compose.test.ts', 'each child listens under its name and id, alone ones under their name'],
      [
        'src/compose.test.ts',
        'children that share one state object each listen with their own id, however often they are asked',
      ],
    ],
  },
  {
    // Both checks: the second dies on an own key too, since the lifted keys are set among the own ones.
    name: 'an own key equal to a lifted one is no defect',
    file: 'src/compose.ts',
    from: '                if (HashMap.has(own, key)) {\n'
      + '                  throw defectAt(place, `An own subscription key is the key of a subscription of "${name}"`)\n'
      + '                }\n'
      + '                if (HashMap.has(keyed, key)) {',
    to: '                if (false) {',
    killedBy: [
      [
        'src/compose.test.ts',
        "an own subscription key that is the lifted key of a child's is a defect, never a silent replacement",
      ],
      [
        'src/compose.test.ts',
        'subscribed children that list one id twice are a defect that says so, not a clash with an own key',
      ],
    ],
  },
  {
    // The first check alone: the second still dies on an own key, but says that a list names one id twice.
    name: 'an own key equal to a lifted one is the defect of an id listed twice',
    file: 'src/compose.ts',
    from: '                if (HashMap.has(own, key)) {\n'
      + '                  throw defectAt(place, `An own subscription key is the key of a subscription of "${name}"`)\n'
      + '                }\n',
    to: '',
    killedBy: [
      [
        'src/compose.test.ts',
        "an own subscription key that is the lifted key of a child's is a defect, never a silent replacement",
      ],
    ],
  },
  {
    name: "rehearse's loop applies a step after the first defect",
    file: 'src/testing/rehearse.ts',
    from: 'recorded(deadOr(step))',
    to: 'recorded(step)',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'after a defect of the program, what the test asks for fails with it, and the state is still read',
      ],
    ],
  },
  {
    name: 'rehearse calls update after the first defect',
    file: 'src/testing/rehearse.ts',
    from: 'Core.arrive(program.update, before, active, source, message, dead)',
    to: 'Core.arrive(program.update, before, active, source, message, () => false)',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'send calls no update once a read of the model has died in its select'],
    ],
  },
  {
    name: 'rehearse runs a command after the first defect',
    file: 'src/testing/rehearse.ts',
    from: '        if (dead()) return deadOr(Effect.never)\n        if (loop.ended()) return Effect.interrupt\n',
    to: '        if (loop.ended()) return Effect.interrupt\n',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'run calls no runCommand once a command has died'],
    ],
  },
  {
    name: 'rehearse runs a command once it has ended',
    file: 'src/testing/rehearse.ts',
    from: '        if (loop.ended()) return Effect.interrupt\n',
    to: '',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'a run made once the rehearsal has ended calls no runCommand'],
    ],
  },
  {
    name: 'rehearse reads the model after the first defect',
    file: 'src/testing/rehearse.ts',
    from: '      dead()\n'
      + '        ? deadOr(Effect.never)\n'
      + "        : calling(() => Effect.succeed(program.makeModel(state))).pipe(diesIn('render'))\n",
    to: "      calling(() => Effect.succeed(program.makeModel(state))).pipe(diesIn('render'))\n",
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'after a defect of the program, what the test asks for fails with it, and the state is still read',
      ],
      ['src/testing/rehearse.test.ts', 'model calls no makeModel once a command has died'],
    ],
  },
  {
    name: "a call of rehearse's waits on through another fiber's death",
    file: 'src/testing/rehearse.ts',
    from: 'Effect.raceFirst(waiting, Effect.andThen(register.died, deadOr(Effect.never)))',
    to: 'waiting',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies",
      ],
      [
        'src/testing/rehearse.test.ts',
        "a run waiting for its command fails as soon as another fiber of the test's dies",
      ],
    ],
  },
  {
    name: "rehearse lets a command's interrupted run go unanswered",
    file: 'src/testing/rehearse.ts',
    from: '              ledger = Ledger.cancel(ledger, taking.ticket)\n',
    to: '',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'when a run interrupted while its command runs leaves the command unanswered'],
    ],
  },
  {
    name: 'rehearse leaves the command of an interrupted run running',
    file: 'src/testing/rehearse.ts',
    from: '            stopFiber(taking.fiber),\n',
    to: '            Effect.void,\n',
    killedBy: [['src/testing/rehearse.test.ts', 'the command is released before the interrupted call returns']],
  },
  {
    name: 'rehearse stops the command of an interrupted run with no mark of its own',
    file: 'src/testing/rehearse.ts',
    from: '            stopFiber(taking.fiber),\n',
    to: '            Fiber.interrupt(taking.fiber),\n',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command joining, as its run is stopped, a fiber its caller interrupted',
      ],
    ],
  },
  {
    name: 'rehearse stops a subscription with no mark of its own',
    file: 'src/testing/rehearse.ts',
    from: 'Effect.andThen(stopFiber(fiber), Fiber.await(fiber))',
    to: 'Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber))',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription interrupting itself as the fiber that stops it',
      ],
    ],
  },
  {
    name: 'rehearse leaves the commands under way to the close of its scope',
    file: 'src/testing/rehearse.ts',
    from: "    yield* Effect.forEach(commands, stopFiber, { concurrency: 'unbounded', discard: true })\n",
    to: '',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command joining, as its end stops it, a fiber its caller interrupted',
      ],
    ],
  },
  {
    name: 'simulate runs a command in the fiber of whoever runs it',
    file: 'src/testing/simulate.ts',
    from: 'const message = yield* runOne(command)',
    to: "const message = yield* Effect.suspend(() => runCommand(command)).pipe(Effect.scoped, diesIn('command'))",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted',
      ],
    ],
  },
  {
    name: 'rehearse offers the loop a step once it has ended',
    file: 'src/testing/loop.ts',
    from: 'if (!ended && Queue.offerUnsafe(',
    to: 'if (Queue.offerUnsafe(',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'a fiber the scenario did not join is offered nothing once it returned'],
      [
        'src/testing/loop.test.ts',
        'is offered nothing once its end is marked: the call is interrupted, or waits when quiet',
      ],
    ],
  },
  {
    name: "rehearse's loop interrupts a quiet call refused once it has ended",
    file: 'src/testing/loop.ts',
    from: 'return quiet ? Effect.never : Effect.interrupt',
    to: 'return Effect.interrupt',
    killedBy: [
      [
        'src/testing/loop.test.ts',
        'is offered nothing once its end is marked: the call is interrupted, or waits when quiet',
      ],
    ],
  },
  {
    name: "rehearse's loop finishes before it has done what it was offered",
    file: 'src/testing/loop.ts',
    from: 'Effect.andThen(Queue.offer(requests, { step: Effect.void, done }), Deferred.await(done))',
    to: 'Effect.void',
    killedBy: [
      ['src/testing/loop.test.ts', 'finishes once it has done what it was offered before'],
      ['src/testing/rehearse.test.ts', 'the message is applied, or fails the rehearsal'],
      [
        'src/testing/rehearse.test.ts',
        'a message sent as the scenario returns is applied, and the command it starts fails the rehearsal',
      ],
    ],
  },
  {
    name: "rehearse's loop leaves what it did not deliver waiting once stopped",
    file: 'src/testing/loop.ts',
    from: '    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })\n',
    to: '',
    killedBy: [
      ['src/testing/loop.test.ts', 'interrupts at its stop what it has not delivered, its step under way included'],
      ['src/testing/rehearse.test.ts', 'a scenario that failed stops the loop at once, its step under way included'],
    ],
  },
  {
    name: 'rehearse lets the loop finish after a scenario that failed',
    file: 'src/testing/rehearse.ts',
    from: 'Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void',
    to: 'Effect.exit(loop.finish)',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'a scenario that failed stops the loop at once, its step under way included'],
    ],
  },
  {
    name: "rehearse's take leaves its command pending",
    file: 'src/testing/ledger.ts',
    from: 'pending: Arr.remove(ledger.pending, index),',
    to: 'pending: ledger.pending,',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'a take takes the oldest pending command the selection matches, under way under a ticket of its own',
      ],
    ],
  },
  {
    name: "rehearse's hearNext asks again for a message asked for and not heard",
    file: 'src/testing/ledger.ts',
    from: 'return hearing.asked >= waiting.length',
    to: 'return false',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'a call asks for a message, unless one asked for by a call that left is not heard yet',
      ],
    ],
  },
  {
    name: "rehearse's hearNext tells no call waiting as its start ends",
    file: 'src/testing/ledger.ts',
    from: 'ended: sent.last ? waiting : []',
    to: 'ended: []',
    killedBy: [
      ['src/testing/ledger.test.ts', 'the last message tells the calls still waiting, and only the last'],
    ],
  },
  {
    name: "rehearse's hearNext tells no call waiting on a start whose key went away",
    file: 'src/testing/ledger.ts',
    from: '      stopped.push(...hearing.waiting)\n',
    to: '',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'a start whose key went away is stopped and forgotten, and the calls waiting on it are told',
      ],
    ],
  },
  {
    name: "rehearse's hearNext starts a subscription for a call that left",
    file: 'src/testing/ledger.ts',
    from: "  if (!ledger.asking.has(call)) return { _tag: 'Left' }\n",
    to: '',
    killedBy: [
      ['src/testing/ledger.test.ts', 'a call that left before the loop made it wait starts nothing, and waits on nothing'],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext that left before the loop took its step starts nothing, and hear plays its key',
      ],
    ],
  },
  {
    name: "rehearse's hearNext makes a call that left wait",
    file: 'src/testing/ledger.ts',
    from: '  if (!ledger.asking.has(call)) return [false, ledger]\n',
    to: '',
    killedBy: [
      ['src/testing/ledger.test.ts', 'a call that left before the loop made it wait starts nothing, and waits on nothing'],
    ],
  },
  {
    name: "rehearse's hearNext keeps a call that left waiting",
    file: 'src/testing/ledger.ts',
    from: "    if (hearing._tag === 'Opened' && hearing.waiting.includes(call)) {",
    to: '    if (false) {',
    killedBy: [
      ['src/testing/ledger.test.ts', 'a message is heard by the first call waiting, and waits for a call when none does'],
    ],
  },
  {
    name: 'rehearse stops the gone keys one after the other',
    file: 'src/testing/rehearse.ts',
    from: "      concurrency: 'unbounded',\n",
    to: '',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'keys that go away together release the subscriptions hearNext started together, as the run does',
      ],
    ],
  },
  {
    name: 'a kept key starts again',
    file: 'src/core.ts',
    from: 'if (Opt.isSome(running)) {',
    to: 'if (false) {',
    // The rest of the suite hangs under it.
    killedBy: [
      ['src/core.test.ts', 'a kept key keeps its start, and a gone key stops with its start'],
      ['src/core.test.ts', 'a key equal by value, made anew, keeps its start'],
      ['src/engine.test.ts', 'a key equal by value keeps its subscription running, untouched'],
      ['src/compose.test.ts', 'a child whose state changes, under the same key, keeps its subscription running'],
      [
        'src/testing/contract.test.ts',
        "rehearse's hearNext hears it as the run does, and nothing more until its key comes back",
      ],
      [
        'src/testing/rehearse.test.ts',
        'each call hears the next message, and the subscription waits between two of them',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a start the test played with hear is not run, until the key goes away and comes back',
      ],
    ],
  },
  {
    name: 'an ended start is heard again while its key stays',
    file: 'src/testing/ledger.ts',
    from: 'ended: hearing.ended || sent.last,',
    to: 'ended: hearing.ended,',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'an opened start whose last message is heard has ended, and says so to hear and to hearNext',
      ],
      ['src/testing/ledger.test.ts', 'an ended start stays ended while its key stays, and its key comes back not ended'],
      [
        'src/testing/contract.test.ts',
        "rehearse's hearNext hears it as the run does, and nothing more until its key comes back",
      ],
    ],
  },
  {
    name: 'a gone key keeps running',
    file: 'src/core.ts',
    from: '([key]) => !HashMap.has(listed, key))',
    to: '() => false)',
    killedBy: [
      ['src/core.test.ts', 'a kept key keeps its start, and a gone key stops with its start'],
      ['src/engine.test.ts', 'a key that changes stops the old subscription and starts the new one'],
      ['src/testing/contract.test.ts', 'in the run, the subscription whose key went away is interrupted'],
    ],
  },
  {
    name: 'simulate reconciles the keys of a state with none of the state before',
    file: 'src/testing/simulate.ts',
    from: 'Core.reconcile(listening.active, subscriptions(listening.current.state))',
    to: 'Core.reconcile(Core.noneActive, subscriptions(listening.current.state))',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, on a key whose Equal throws against the key of the state before',
      ],
    ],
  },
  {
    name: 'simulate reads no subscriptions of a new state',
    file: 'src/testing/simulate.ts',
    from: 'return arrived.changed ? Effect.as(listen(listening), Opt.some(applied))',
    to: 'return false ? Effect.as(listen(listening), Opt.some(applied))',
    killedBy: [
      ['src/testing/contract.test.ts', 'simulate fails, as the run dies, on a state whose subscriptions are a defect'],
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, on a key whose Equal throws against the key of the state before',
      ],
    ],
  },
  {
    name: "simulate takes a defect of what a command's scope releases for one of its own",
    file: 'src/testing/simulate.ts',
    from: "effect.pipe(Effect.scoped, diesIn('command'))",
    to: "effect.pipe(diesIn('command'), Effect.scoped)",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in a command on a release of a command that dies',
      ],
    ],
  },
  {
    name: 'dispatchViolations takes a message that changes the state again for one that acts once',
    file: 'src/testing/dispatch-violations.ts',
    from: '(!Equal.equals(second.state, first.state)\n        || ',
    to: '(',
    killedBy: [
      ['src/testing/dispatch-violations.test.ts', 'reports a message that changes the state again when sent twice'],
    ],
  },
  {
    name: 'dispatchViolations takes a message that starts a command again for one that acts once',
    file: 'src/testing/dispatch-violations.ts',
    from: '\n        || (second.commands?.length ?? 0) > 0',
    to: '',
    killedBy: [
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a message that starts a command again when sent twice, though the state stays the same',
      ],
    ],
  },
  {
    name: 'dispatchViolations takes a message that raises an event again for one that acts once',
    file: 'src/testing/dispatch-violations.ts',
    from: '\n        || (second.events?.length ?? 0) > 0)',
    to: ')',
    killedBy: [
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a message that raises an event again when sent twice, unless it repeats on purpose',
      ],
    ],
  },
  {
    name: 'drive calls the scenario outside the effect whose end is guarded',
    file: 'src/testing/drive.ts',
    from: 'Effect.suspend(() => scenario(driver))',
    to: 'scenario(driver)',
    killedBy: [['src/testing/drive.test.ts', 'nothing of the program happens once drive has ended']],
  },
  {
    name: 'drive keeps no defect of makeModel the scenario caught',
    file: 'src/testing/drive.ts',
    from: "diesIn('render'), deaths.recorded)",
    to: "diesIn('render'))",
    killedBy: [
      ['src/testing/contract.test.ts', 'drive fails in render all the same, as rehearse does'],
      ['src/testing/drive.test.ts', 'fails with the defects in the order they happened'],
    ],
  },
  {
    name: 'drive goes on after a defect of makeModel until the scenario ends',
    file: 'src/testing/drive.ts',
    from: '    deaths,\n  ).pipe(',
    to: '    { ...deaths, died: Effect.never },\n  ).pipe(',
    killedBy: [['src/testing/contract.test.ts', 'drive ends on the defect a scenario that goes on caught']],
  },
  {
    name: 'rehearse calls the scenario outside the effect whose end is guarded',
    file: 'src/testing/rehearse.ts',
    from: 'Effect.suspend(() => scenario(rehearsal))',
    to: 'scenario(rehearsal)',
    killedBy: [['src/testing/rehearse.test.ts', 'what a hearNext it started holds is released']],
  },
  {
    name: 'rehearse reads the commands under way once the end has waited',
    file: 'src/testing/rehearse.ts',
    from: 'const { cancelled, underWay } = owed',
    to: 'const { cancelled, underWay } = ledger',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a command that answers while the end releases a subscription fails it, as one under way',
      ],
    ],
  },
  {
    name: 'rehearse stops the loop at once after a scenario that returned',
    file: 'src/testing/rehearse.ts',
    from: '      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void),\n',
    to: '',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'the message is applied, or fails the rehearsal'],
      [
        'src/testing/rehearse.test.ts',
        'a message sent as the scenario returns is applied, and the command it starts fails the rehearsal',
      ],
    ],
  },
  {
    name: 'rehearse reads the commands pending as the scenario ends',
    file: 'src/testing/rehearse.ts',
    from: 'const { pending } = ledger',
    to: 'const { pending } = owed',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a message sent as the scenario returns is applied, and the command it starts fails the rehearsal',
      ],
    ],
  },
]
