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
      [
        'src/testing/rehearse.test.ts',
        'a message its subscription sends after its key went away does not reach update',
      ],
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
    from: 'Effect.andThen(FiberMap.remove(subscriptionFibers, generation))',
    to: 'Effect.andThen(Effect.forkDetach(FiberMap.remove(subscriptionFibers, generation)))',
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
    from: '!(Cause.isInterruptReason(reason) && interrupters.includes(reason.fiberId))',
    to: '!(Cause.isInterruptReason(reason) && interrupters.length > 0)',
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
    file: 'src/run.ts',
    from: 'if (!Arr.isReadonlyArrayNonEmpty(dies)) return exit',
    to: 'if (true) return exit',
    killedBy: [
      [
        'src/run.test.ts',
        'an interrupted run whose renderer dies as it releases has the defect first, then the interruption',
      ],
    ],
  },
  {
    name: 'the run does not stop the renderer',
    file: 'src/run.ts',
    from: '    const renderer = yield* Effect.acquireRelease(\n'
      + '      Effect.forkChild(rendering),\n'
      + '      (renderer) =>\n'
      + '        engine.stop.pipe(Effect.andThen(Fiber.interrupt(renderer)), Effect.andThen(Fiber.await(renderer))),\n'
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
      [
        'src/testing/contract.test.ts',
        'drive fails, as the run dies, on a defect of what a subscription releases when the scenario ends',
      ],
    ],
  },
  {
    name: 'the end of the run stops the renderer before the loop',
    file: 'src/run.ts',
    from: 'engine.stop.pipe(Effect.andThen(Fiber.interrupt(renderer)), Effect.andThen(Fiber.await(renderer)))',
    to: 'Fiber.interrupt(renderer).pipe(Effect.andThen(Fiber.await(renderer)))',
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
    from: '        if (dead()) return deadOr(Effect.never)\n        const taking = Ledger.take(ledger, select)\n',
    to: '        const taking = Ledger.take(ledger, select)\n',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'run calls no runCommand once a command has died'],
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
    from: '              ledger = Ledger.cancel(ledger, ticket)\n',
    to: '',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'when a run interrupted while its command runs leaves the command unanswered'],
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
    from: 'return hearing.asked >= waiting',
    to: 'return false',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'each call asks for a message, unless one asked for by a call that left is not heard yet',
      ],
    ],
  },
  {
    name: "rehearse's hearNext tells no call waiting as its start ends",
    file: 'src/testing/ledger.ts',
    from: 'last ? hearing.waiting : 0',
    to: '0',
    killedBy: [
      ['src/testing/ledger.test.ts', 'the last message tells the calls still waiting, and only the last'],
    ],
  },
  {
    name: 'rehearse forgets an opened start whose key went away while calls wait on it',
    file: 'src/testing/ledger.ts',
    from: '      if (hearing.waiting > 0) {',
    to: '      if (false) {',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'a start whose key went away is stopped, and kept only while calls wait on it',
      ],
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
    file: 'src/core.ts',
    from: 'active.starts.has(generation) && !active.ended.has(generation)',
    to: 'false',
    killedBy: [
      [
        'src/core.test.ts',
        'an ended start keeps its key and stays ended while it stays, and its key comes back not ended',
      ],
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
    from: 'Core.reconcile(listening.active, subscriptions(state))',
    to: 'Core.reconcile(Core.noneActive, subscriptions(state))',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, on a key whose Equal throws against the key of the state before',
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
    from: '      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(finish) : Effect.void),\n',
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
