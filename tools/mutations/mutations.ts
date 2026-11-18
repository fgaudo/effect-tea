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
    name: 'a defect of update in the run has no site',
    file: 'src/engine.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: '(self) => self,',
    killedBy: [
      ['src/run.test.ts', 'a defect in update ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'defect in update dies in update, on its message, with the InvariantDefect as its cause'],
      ['src/testing/contract.test.ts', 'the run dies in update, with its message, on an update that throws'],
    ],
  },
  {
    name: 'a defect of update in the run does not say its message',
    file: 'src/engine.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: "diesIn('update'),",
    killedBy: [
      ['src/run.test.ts', 'a defect in update says which message it was given, by its tags, in its message too'],
      ['src/run.test.ts', 'defect in update dies in update, on its message, with the InvariantDefect as its cause'],
      ['src/testing/contract.test.ts', 'the run dies in update, with its message, on an update that throws'],
    ],
  },
  {
    name: 'a defect of init in the run has no site',
    file: 'src/run.ts',
    from: "Shell.diesIn('init'), deaths.recorded)",
    to: 'deaths.recorded)',
    killedBy: [
      ['src/run.test.ts', 'an init that throws on its flags dies in init'],
      ['src/testing/contract.test.ts', 'the run dies in init on an init that throws on its flags'],
    ],
  },
  {
    name: 'a defect of update in rehearse has no site',
    file: 'src/testing/rehearse.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: '(self) => self,',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in update, with its message, on an update that throws',
      ],
      ['src/testing/rehearse.test.ts', 'a defect the scenario catches fails it all the same, first, and once'],
    ],
  },
  {
    name: 'a defect of update in rehearse does not say its message',
    file: 'src/testing/rehearse.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: "diesIn('update'),",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in update, with its message, on an update that throws',
      ],
    ],
  },
  {
    name: 'a defect of init in rehearse has no site',
    file: 'src/testing/rehearse.ts',
    from: ".pipe(diesIn('init'))",
    to: '',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in init, on an init that throws on its flags',
      ],
    ],
  },
  {
    name: 'a defect of makeModel on a later state in rehearse has no site',
    file: 'src/testing/rehearse.ts',
    from: "      shown = program.makeModel(state)\n    }).pipe(diesIn('render'))",
    to: '      shown = program.makeModel(state)\n    })',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in render, on a makeModel that throws on a later state',
      ],
    ],
  },
  {
    name: 'a runCommand that throws before its effect in rehearse is no defect of its command',
    file: 'src/testing/rehearse.ts',
    from: 'calling(() => runCommand(command))',
    to: 'runCommand(command)',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in a command on a runCommand that throws before its effect',
      ],
    ],
  },
  {
    name: 'a defect of update in simulate has no site',
    file: 'src/testing/simulate.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: '(self) => self,',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in update, with its message, on an update that throws',
      ],
    ],
  },
  {
    name: 'a defect of update in simulate does not say its message',
    file: 'src/testing/simulate.ts',
    from: "diesIn('update', () => ({ on: describeByTag(message) })),",
    to: "diesIn('update'),",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in update, with its message, on an update that throws',
      ],
    ],
  },
  {
    name: 'scopedIn wraps again what it wrapped',
    file: 'src/shell.ts',
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
    file: 'src/shell.ts',
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
    file: 'src/shell.ts',
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
    // The context a command, a subscription or the renderer runs in holds the run's scope.
    name: 'a fiber of the run acquires into the scope of the run',
    file: 'src/shell.ts',
    from: '      return Effect.scoped(self.pipe(\n',
    to: '      return (self.pipe(\n',
    killedBy: [
      ['src/engine.test.ts', 'what a command acquires is released when it ends, before update hears its message'],
      ['src/engine.test.ts', 'a fiber that a command forks in its scope is interrupted when the command ends'],
      ['src/engine.test.ts', 'what a subscription acquires (Channel.fromEffect) is released when its key goes away'],
      [
        'src/run.test.ts',
        'what a command and the renderer acquire is theirs: no scope to provide, released after they stop',
      ],
      [
        'src/testing/rehearse.test.ts',
        'runs the subscription under the key to its first message, applies it, and releases it at the end',
      ],
      ['src/testing/drive.test.ts', 'a program whose commands acquire needs no scope: each command has its own'],
    ],
  },
  {
    name: "a subscription's channel releases its scopes before its defect is recorded",
    file: 'src/shell.ts',
    from: 'Channel.toPull(subscription).pipe(\n'
      + '    // No yield of its own after each message, which made a pull of messages taken one by one three times slower: the\n'
      + '    // budget of operations of the runtime still yields the fiber (`Scheduler.MaxOpsBeforeYield`), and no invariant\n'
      + '    // rests on either.\n'
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
    file: 'src/shell.ts',
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
    file: 'src/shell.ts',
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
        'simulate fails with a defect of a command interrupting itself as whoever runs it interrupts it',
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
      [
        'src/run.test.ts',
        'dispatches run one after the other in one callback, before the run takes any, are all applied in order',
      ],
    ],
  },
  {
    name: "the run's fibers log into the span of whoever runs it",
    file: 'src/shell.ts',
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
    name: 'an ignored message is described while debug logs are disabled',
    file: 'src/engine.ts',
    from: "        if (debugging) {\n          yield* log('Ignored a rejected message',",
    to: "        if (true) {\n          yield* log('Ignored a rejected message',",
    killedBy: [
      ['src/run.test.ts', 'a message ignored as rejected is described only while debug logs are enabled'],
    ],
  },
  {
    name: 'a dropped message is described while debug logs are disabled',
    file: 'src/engine.ts',
    from: "if (debugging && source._tag === 'Subscription') {",
    to: "if (source._tag === 'Subscription') {",
    killedBy: [
      [
        'src/run.test.ts',
        'a message dropped as its subscription stopped is described only while debug logs are enabled',
      ],
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
      [
        'src/testing/drive.test.ts',
        'a defect of what the program releases as it stops comes first, before what the scenario failed with',
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
  // A frame's model, made only for the frames the renderer pulls.
  {
    name: 'the run makes a model for every state, before the buffer drops it',
    file: 'src/run.ts',
    from: "      Stream.buffer({ capacity: 1, strategy: 'sliding' }),\n"
      + "      // After the buffer, so that a model is made only for the frames the renderer pulls, in the renderer's fiber.\n"
      + '      Stream.map(({ state, seen }) => ({ model: program.makeModel(state), dispatch: engine.dispatch, seen })),\n',
    to: '      Stream.map(({ state, seen }) => ({ model: program.makeModel(state), dispatch: engine.dispatch, seen })),\n'
      + "      Stream.buffer({ capacity: 1, strategy: 'sliding' }),\n",
    killedBy: [
      ['src/run.test.ts', 'a model is made only for the frames the renderer pulls, never for a state the buffer dropped'],
    ],
  },
  // The numbering of the dispatched messages, and what a frame has seen of them.
  {
    name: 'a dispatched message is numbered as its dispatch is made, not as it is queued',
    file: 'src/engine.ts',
    from: '  const send = (message: Message) =>\n'
      + '    Effect.sync(() => {\n'
      + '      sent += 1\n'
      + '      Queue.offerUnsafe(queue, { message, source: Core.fromDispatch })\n'
      + '      return sent\n'
      + '    })\n',
    to: '  const send = (message: Message) => {\n'
      + '    const number = (sent += 1)\n'
      + '    return Effect.sync(() => {\n'
      + '      Queue.offerUnsafe(queue, { message, source: Core.fromDispatch })\n'
      + '      return number\n'
      + '    })\n'
      + '  }\n',
    killedBy: [['src/run.test.ts', 'a dispatch is numbered each time it runs, as it runs, not as it is made']],
  },
  {
    name: 'a description follows a wrapping that comes back to a value on its way',
    file: 'src/log.ts',
    from: "on.includes(wrapped) ? '…' :",
    to: "false ? '…' :",
    killedBy: [
      [
        'src/log.test.ts',
        'one whose wrapping comes back to a value on its way, by the tags on its way until then',
      ],
    ],
  },
  {
    name: 'the loop logs a message as it is by default',
    file: 'src/engine.ts',
    from: '  describeMessage = describeByTag,\n',
    to: '  describeMessage = (message) => message,\n',
    killedBy: [
      ['src/engine.test.ts', 'by default, the loop logs the tags of a message and of its commands, never their data'],
    ],
  },
  {
    name: 'the loop logs a command as it is by default',
    file: 'src/engine.ts',
    from: '  describeCommand = describeByTag,\n',
    to: '  describeCommand = (command) => command,\n',
    killedBy: [
      ['src/engine.test.ts', 'by default, the loop logs the tags of a message and of its commands, never their data'],
    ],
  },
  {
    name: 'the run stops the subscriptions of a state before it publishes the state',
    file: 'src/engine.ts',
    from: '        if (changed) yield* SubscriptionRef.set(stateRef, { ...next, seen })\n'
      + '        const nextActive = changed ? yield* reconcile(active, next.state) : active\n',
    to: '        const nextActive = changed ? yield* reconcile(active, next.state) : active\n'
      + '        if (changed) yield* SubscriptionRef.set(stateRef, { ...next, seen })\n',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'in the run, a stopped subscription releases once the state that stopped it is published',
      ],
    ],
  },
  {
    name: "a frame's seen leaves out the message that made its state",
    file: 'src/engine.ts',
    from: 'SubscriptionRef.set(stateRef, { ...next, seen })',
    to: "SubscriptionRef.set(stateRef, { ...next, seen: source._tag === 'Dispatch' ? seen - 1 : seen })",
    killedBy: [
      ['src/run.test.ts', 'counts every dispatched message the run has taken, a rejected one too'],
      ['src/run.test.ts', 'the frame of the state a message made has seen that message'],
    ],
  },
  {
    name: "a frame's seen counts the states made, not the dispatched messages taken",
    file: 'src/engine.ts',
    from: 'SubscriptionRef.set(stateRef, { ...next, seen })',
    to: 'SubscriptionRef.set(stateRef, { ...next, seen: next.revision })',
    killedBy: [
      ['src/run.test.ts', 'counts every dispatched message the run has taken, a rejected one too'],
      ['src/run.test.ts', 'the messages of a command are not counted among those dispatched'],
    ],
  },
  {
    name: "a frame's seen counts the messages of commands and subscriptions",
    file: 'src/engine.ts',
    from: "if (source._tag === 'Dispatch') seen += 1",
    to: 'seen += 1',
    killedBy: [
      ['src/run.test.ts', 'the messages of a command are not counted among those dispatched'],
      [
        'src/testing/contract.test.ts',
        "drive's frames say how many of the messages sent through them the run has taken, as the run's do",
      ],
    ],
  },
  {
    name: "a frame's seen is read as the frame is drawn, not with its state",
    file: 'src/engine.ts',
    from: 'SubscriptionRef.set(stateRef, { ...next, seen })',
    to: 'SubscriptionRef.set(stateRef, {\n          ...next,\n          get seen() {\n            return seen\n          },\n        })',
    killedBy: [
      ['src/run.test.ts', 'a frame drawn once the run has taken more messages says what its own state had seen'],
    ],
  },
  {
    name: 'the run does not stop the renderer',
    file: 'src/run.ts',
    from: '    const renderer = yield* Effect.acquireRelease(\n'
      + '      Effect.forkChild(rendering),\n'
      + '      (renderer) =>\n'
      + '        engine.stop.pipe(Effect.andThen(Shell.stopping(renderer))),\n'
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
    file: 'src/shell.ts',
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
    name: 'the end of the engine does not stop its loop first',
    file: 'src/engine.ts',
    from: '    Effect.andThen(\n      stop,\n',
    to: '    Effect.andThen(\n      Effect.void,\n',
    killedBy: [
      ['src/engine.test.ts', 'the end of the engine lets its loop end before it interrupts its commands'],
    ],
  },
  {
    name: 'the end of the engine leaves its fibers to the close of their sets',
    file: 'src/engine.ts',
    from: "return Effect.forEach(running, stopping, { concurrency: 'unbounded', discard: true }).pipe(",
    to: 'return Effect.void.pipe(',
    killedBy: [
      [
        'src/run.test.ts',
        'a command that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the command',
      ],
      [
        'src/run.test.ts',
        'a subscription that joins a fiber the fiber of the run interrupted, as the run ends, is a defect in the '
          + 'subscription',
      ],
      ['src/engine.test.ts', 'what a command dies of as the end of the engine interrupts it is what the end dies of'],
      [
        'src/engine.test.ts',
        'a subscription interrupting itself as the end of the engine stops it, its key gone, is a defect',
      ],
    ],
  },
  {
    name: 'the end of the engine stops its fibers one after the other',
    file: 'src/engine.ts',
    from: "Effect.forEach(running, stopping, { concurrency: 'unbounded', discard: true })",
    to: 'Effect.forEach(running, stopping, { discard: true })',
    killedBy: [
      ['src/engine.test.ts', 'the end of the engine interrupts its commands and its subscriptions at once'],
    ],
  },
  {
    name: 'the end of the engine does not report what its fibers died of',
    file: 'src/engine.ts',
    from: '          Effect.andThen(report),\n',
    to: '',
    killedBy: [
      ['src/engine.test.ts', 'what a command dies of as the end of the engine interrupts it is what the end dies of'],
    ],
  },
  {
    name: 'the end of the run stops the renderer before the loop',
    file: 'src/run.ts',
    from: 'engine.stop.pipe(Effect.andThen(Shell.stopping(renderer)))',
    to: 'Shell.stopping(renderer)',
    killedBy: [
      ['src/run.test.ts', 'the run stops its loop before it releases the renderer'],
    ],
  },
  {
    name: "forwardTo holds a child's dispatch strongly",
    file: 'src/dispatch.ts',
    from: 'const entry: Entry = { key, ref: new WeakRef(wrapping) }',
    to: 'const entry: Entry = { key, ref: { deref: () => wrapping } as never }',
    killedBy: [
      ['src/dispatch.test.ts', 'keeps nothing for the ids nobody holds'],
      ['src/dispatch.test.ts', 'lets go of what a long list held once the list is no longer drawn'],
      ['src/dispatch.test.ts', 'lets go of collected dispatches without comparing ids again'],
    ],
  },
  {
    name: 'forwardTo lets go of an entry whose dispatch is alive',
    file: 'src/dispatch.ts',
    from: 'const at = bucket?.indexOf(entry) ?? -1',
    to: 'const at = bucket === undefined ? -1 : 0',
    killedBy: [
      ['src/dispatch.test.ts', 'keeps the entry of a new dispatch made for the id of a collected one'],
    ],
  },
  {
    name: "forwardTo makes a child's dispatch anew each time",
    file: 'src/dispatch.ts',
    from: '  if (found !== undefined) return found as ChildDispatch<Message, Name>\n',
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
    name: 'a tag that the children inherit is routed to a child',
    file: 'src/compose.ts',
    from: "typeof tag === 'string' && Object.hasOwn(children, tag)",
    to: "typeof tag === 'string' && tag in children",
    killedBy: [
      [
        'src/compose.test.ts',
        'an own message or command whose tag a plain object inherits is the parent\'s own, not a child\'s',
      ],
    ],
  },
  {
    name: 'a child that the children inherit gets a handle and a model',
    file: 'src/compose.ts',
    from: '  Object.fromEntries(Object.entries(record).map(([name, value]) => [name, f(value, name)]))',
    to: '  Object.fromEntries([...(function*() { for (const name in record) yield [name, f(record[name] as A, name)] })()])',
    killedBy: [
      [
        'src/compose.test.ts',
        'a child that the children object inherits is no child: it has no handle, no model and no subscriptions',
      ],
    ],
  },
  {
    name: 'a child that the children inherit has its subscriptions lifted',
    file: 'src/compose.ts',
    from: '  const names = Object.keys(programs)\n',
    to: '  const names = [...(function*() { for (const name in programs) yield name })()]\n',
    killedBy: [
      [
        'src/compose.test.ts',
        'a child that the children object inherits is no child: it has no handle, no model and no subscriptions',
      ],
    ],
  },
  {
    name: "a child's lifted subscriptions are kept without their place",
    file: 'src/compose.ts',
    from: 'at !== undefined && at[0].name === place.name && Equal.equals(at[0].id, place.id)',
    to: 'at !== undefined',
    killedBy: [
      ['src/compose.test.ts', 'a child that takes the place of another in a shared state listens with its own id'],
    ],
  },
  {
    name: 'a shared state keeps the places it no longer holds',
    file: 'src/compose.ts',
    from: '      kept.places.length = kept.met\n',
    to: '',
    killedBy: [
      [
        'src/compose.test.ts',
        'a place that a shared state no longer holds is let go of by the next call that meets the state',
      ],
    ],
  },
  {
    name: "a child's lifted subscriptions are looked for past the places of the last call",
    file: 'src/compose.ts',
    from: '      kept.met = 0\n',
    to: '',
    killedBy: [
      [
        'src/compose.test.ts',
        "a child's subscriptions are kept while its state is the same object, and made again for a new one",
      ],
      ['src/compose.test.ts', 'children that share one state object are lifted once while they keep sharing it'],
      [
        'src/input.test.ts',
        "a write into it keeps every subscription the same object, the children's lifted ones included",
      ],
    ],
  },
  {
    name: "a child's state that is not an object dies of the WeakMap's TypeError",
    file: 'src/compose.ts',
    from: '    if (Predicate.isObjectKeyword(childState)) return childState\n',
    to: '    return childState as object\n',
    killedBy: [
      [
        'src/compose.test.ts',
        'a child whose state is not an object is a defect that names it, in its model and in its subscriptions',
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
    name: "a child's event that nothing handles dies of a TypeError",
    file: 'src/compose.ts',
    from: '    if (handle === undefined) {\n',
    to: '    if (false) {\n',
    killedBy: [
      [
        'src/compose.test.ts',
        'a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on',
      ],
    ],
  },
  {
    name: 'an external message to a missing child is taken for one it rejects',
    file: 'src/compose.ts',
    from: '    if (Opt.isNone(getAt(place, state))) {\n',
    to: '    if (false) {\n',
    killedBy: [
      ['src/compose.test.ts', 'a child that rejects what its parent gives it, or is not there to take it, is a defect'],
    ],
  },
  {
    name: 'an external message a child rejects is a rejection of the parent',
    file: 'src/compose.ts',
    from: '    const result = updateAt(place, message)(state)\n    if (result === reject) {\n',
    to: '    const result = updateAt(place, message)(state)\n    if (false) {\n',
    killedBy: [
      ['src/compose.test.ts', 'a child that rejects what its parent gives it, or is not there to take it, is a defect'],
      [
        'src/compose.test.ts',
        'a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on',
      ],
    ],
  },
  {
    name: "a child's command with no runCommand dies of a TypeError",
    file: 'src/compose.ts',
    from: '        if (run === undefined) {\n',
    to: '        if (false) {\n',
    killedBy: [
      ['src/compose.test.ts', "a child's command that nothing interprets is a CompositionDefect naming the child"],
    ],
  },
  {
    name: 'a write into an input is stored whatever it was written over',
    file: 'src/input.ts',
    from: '  !Equal.equals(message.was, held)\n    ? reject',
    to: '  false\n    ? reject',
    killedBy: [
      ['src/input.test.ts', 'is rejected when it was written over another value than the place holds'],
      ['src/input.test.ts', 'typed before the desk started the draft again, it is rejected by the new draft'],
      [
        'src/input.test.ts',
        'typed before the desk brought a kept draft back, it is rejected by the draft brought back',
      ],
      ['src/input.test.ts', 'typed into a row, it is rejected by another row that came to its id'],
      [
        'src/input.test.ts',
        'rejects what was written over another text, and what was written into a note that is gone',
      ],
      [
        'src/input.test.ts',
        "that puts a subscription's value into an input rejects what was typed over the value before",
      ],
      [
        'src/input.test.ts',
        'rejects a write at an id the state does not hold, and one over another value than its row holds',
      ],
      [
        'src/input.test.ts',
        'rejects a late write by another row that came to its id, unless that row holds the value written over',
      ],
      [
        'src/input.test.ts',
        'an input by id stores a write at its id through set, and rejects one at an id get does not find',
      ],
    ],
  },
  {
    name: 'a write into an input by id goes to its place without its id',
    file: 'src/compose.ts',
    from: "  inputById: (place) => ({ kind: 'byId', ...placedById(place) }),\n",
    to: "  inputById: (place) => ({ kind: 'one', ...placedById(place) }),\n",
    killedBy: [
      ['src/input.test.ts', 'stores a write at its id, and leaves the other rows and inputs as they are'],
      [
        'src/input.test.ts',
        'rejects a late write by another row that came to its id, unless that row holds the value written over',
      ],
      [
        'src/input.test.ts',
        'an input by id stores a write at its id through set, and rejects one at an id get does not find',
      ],
    ],
  },
  {
    name: 'a write of the value an input holds makes a new state',
    file: 'src/input.ts',
    from: '    : Equal.equals(message.value, held)\n    ? { state: held }\n',
    to: '',
    // A primitive value equal to the one held is the very same: only a structure tells the two apart.
    killedBy: [['src/input.test.ts', 'compares the value it was written over by Equal, whatever it is made of']],
  },
  {
    name: "what a write was written over is compared by identity, not by Equal",
    file: 'src/input.ts',
    from: '  !Equal.equals(message.was, held)\n    ? reject',
    to: '  message.was !== held\n    ? reject',
    killedBy: [['src/input.test.ts', 'compares the value it was written over by Equal, whatever it is made of']],
  },
  {
    name: 'an element records what it showed after its write, not before',
    file: 'src/input.ts',
    from: '{ sent: number, was: held.value }',
    to: '{ sent: number, was: value }',
    killedBy: [
      ['src/input.test.ts', 'edited, the write names what the element showed, as the element records it'],
      ['src/input.test.ts', 'a frame older than the keys typed since leaves the element as it is'],
    ],
  },
  {
    name: 'a write names what the element shows after it, not what it showed',
    file: 'src/input.ts',
    from: "  write: { _tag: 'Written', was: held.value, value },",
    to: "  write: { _tag: 'Written', was: value, value },",
    killedBy: [['src/input.test.ts', 'edited, the write names what the element showed, as the element records it']],
  },
  {
    name: 'a frame keeps the writes it has seen among those to come',
    file: 'src/input.ts',
    from: '(write) => write.sent > seen',
    to: '(write) => write.sent >= seen',
    killedBy: [['src/input.test.ts', 'a frame older than the keys typed since leaves the element as it is']],
  },
  {
    name: "a frame is compared with what the element shows, not with what it showed before its first unseen write",
    file: 'src/input.ts',
    from: 'first === undefined ? held.value : first.was',
    to: 'held.value',
    killedBy: [
      ['src/input.test.ts', 'a frame older than the keys typed since leaves the element as it is'],
      ['src/input.test.ts', 'compares the frame by Equal, so that a copy of what the element showed keeps it'],
    ],
  },
  {
    name: 'a frame is compared with what the element showed by identity, not by Equal',
    file: 'src/input.ts',
    from: '  if (!Equal.equals(value, first === undefined ? held.value : first.was)) {\n',
    to: '  if (value !== (first === undefined ? held.value : first.was)) {\n',
    killedBy: [
      ['src/input.test.ts', 'an element that stays is not taken, though the frame holds an equal copy'],
      ['src/input.test.ts', 'compares the frame by Equal, so that a copy of what the element showed keeps it'],
    ],
  },
  {
    name: "an element that stays takes the frame's value",
    file: 'src/input.ts',
    from: '  const shown = unseen.length === held[Unseen].length ? held : { value: held.value, [Unseen]: unseen }\n',
    to: '  const shown = { value, [Unseen]: unseen }\n',
    killedBy: [
      ['src/input.test.ts', 'a frame older than the keys typed since leaves the element as it is'],
      ['src/input.test.ts', 'an element that stays is not taken, though the frame holds an equal copy'],
    ],
  },
  {
    name: "a new element does not take the frame's value",
    file: 'src/input.ts',
    from: '  if (held === undefined) return { shown: shownOf(value), taken: true }\n',
    to: '  if (held === undefined) return { shown: shownOf(value), taken: false }\n',
    killedBy: [
      ['src/input.test.ts', "a new element takes the frame's very value"],
    ],
  },
  {
    name: 'an element the state moved on without is taken though it shows the very value of the frame',
    file: 'src/input.ts',
    from: '    return { shown: shownOf(value), taken: !Object.is(value, held.value) }\n',
    to: '    return { shown: shownOf(value), taken: true }\n',
    killedBy: [
      [
        'src/input.test.ts',
        'a frame of a state that moved on to the very value the element shows does not write it again',
      ],
    ],
  },
  {
    name: "an element the state moved on without tells the frame's value from what it shows by ===",
    file: 'src/input.ts',
    from: '    return { shown: shownOf(value), taken: !Object.is(value, held.value) }\n',
    to: '    return { shown: shownOf(value), taken: value !== held.value }\n',
    killedBy: [
      [
        'src/input.test.ts',
        'a frame of a state that moved on to NaN, the very value the element shows, does not write it again',
      ],
      [
        'src/input.test.ts',
        'a frame of a state that moved on to 0, where the element shows -0, gives the element its value',
      ],
    ],
  },
  {
    name: "an element the state moved on without does not take the frame's value",
    file: 'src/input.ts',
    from: '    return { shown: shownOf(value), taken: !Object.is(value, held.value) }\n',
    to: '    return { shown: shownOf(value), taken: false }\n',
    killedBy: [
      ['src/input.test.ts', 'a frame that has seen every key and holds another value gives the element that value'],
      [
        'src/input.test.ts',
        "a frame that holds neither the element's past nor its present gives the element its value at once",
      ],
      ['src/input.test.ts', 'a frame of a state brought back to one the element has left gives the element its value'],
      [
        'examples/bridges/snabbdom.test.ts',
        'a name the program empties is emptied in the input on screen, which stays and keeps the focus',
      ],
      [
        'examples/bridges/react.test.ts',
        'a name the program empties is emptied in the input on screen, which stays and keeps the focus',
      ],
      ['examples/bridges/snabbdom.test.ts', 'is rejected, and the input on screen is emptied, as the save left it'],
      ['examples/bridges/react.test.ts', 'is rejected, and the input on screen is emptied, as the save left it'],
    ],
  },
  {
    name: 'an element that stays is taken',
    file: 'src/input.ts',
    from: '  return { shown, taken: false }\n',
    to: '  return { shown, taken: true }\n',
    killedBy: [
      ['src/input.test.ts', 'edited, the write names what the element showed, as the element records it'],
      ['src/input.test.ts', 'a frame older than the keys typed since leaves the element as it is'],
      ['src/input.test.ts', 'an element that stays is not taken, though the frame holds an equal copy'],
      [
        'examples/bridges/snabbdom.test.ts',
        'a frame drawn while the user types does not take back what they typed since',
      ],
      [
        'examples/bridges/react.test.ts',
        'a frame drawn while the user types does not take back what they typed since',
      ],
    ],
  },
  {
    name: 'rehearse writes a state once the subscriptions it stops are released',
    file: 'src/testing/rehearse.ts',
    from: '                return Effect.sync(() => {\n'
      + '                  now = { ...before, ...next, events: [...before.events, ...events] }\n'
      + '                }).pipe(\n'
      + '                  Effect.andThen(\n'
      + '                    changed\n'
      + '                      ? Effect.flatMap(listen(next.state), (release) => Effect.andThen(draw(next.state), release))\n'
      + '                      : Effect.void,\n'
      + '                  ),\n'
      + '                  Effect.andThen(Effect.sync(() => {\n'
      + '                    ledger = Ledger.owe(ledger, commands)\n',
    to: '                return Effect.void.pipe(\n'
      + '                  Effect.andThen(changed ? Effect.flatten(listen(next.state)) : Effect.void),\n'
      + '                  Effect.andThen(changed ? draw(next.state) : Effect.void),\n'
      + '                  Effect.andThen(Effect.sync(() => {\n'
      + '                    now = { ...before, ...next, events: [...before.events, ...events] }\n'
      + '                    ledger = Ledger.owe(ledger, commands)\n',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse writes the state that stops a subscription before its release, as the run publishes it',
      ],
      ['src/testing/contract.test.ts', 'rehearse keeps the state whose subscriptions are a defect, as the run publishes it'],
    ],
  },
  {
    name: 'rehearse makes the model of a state before it reads its subscriptions',
    file: 'src/testing/rehearse.ts',
    from: 'Effect.flatMap(listen(next.state), (release) => Effect.andThen(draw(next.state), release))',
    to: 'Effect.andThen(draw(next.state), Effect.flatten(listen(next.state)))',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails in subscriptions first, as the run dies, on a state whose model is a defect too',
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
      ['src/testing/rehearse.test.ts', 'send calls no update once a command run in its select has died'],
    ],
  },
  {
    name: 'rehearse runs a command after the first defect',
    file: 'src/testing/rehearse.ts',
    from: '          if (dead()) return deadOr(Effect.never)\n          if (loop.ended()) return Effect.interrupt\n',
    to: '          if (loop.ended()) return Effect.interrupt\n',
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
    from: 'model: deadOr(Effect.sync(() => shown)),',
    to: 'model: Effect.sync(() => shown),',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'after a defect of the program, what the test asks for fails with it, and the state is still read',
      ],
    ],
  },
  {
    name: "a call of rehearse's waits on through another fiber's death",
    file: 'src/testing/rehearse.ts',
    from: '    Effect.raceFirst(waiting, Effect.andThen(register.died, deadOr(Effect.never)))',
    to: '    waiting',
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
    from: '({ fiber }) => stopFiber(fiber)',
    to: '({ fiber }) => Fiber.interrupt(fiber)',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription interrupting itself as the fiber that stops it',
      ],
    ],
  },
  {
    name: 'rehearse fails a step on a defect of the release it awaited',
    file: 'src/testing/rehearse.ts',
    from: "Effect.forEach(stopping, ({ fiber }) => stopFiber(fiber), { concurrency: 'unbounded', discard: true })",
    to: 'Effect.forEach(stopping, ({ fiber }) => Effect.andThen(stopFiber(fiber), Fiber.await(fiber)), {\n'
      + "      concurrency: 'unbounded',\n"
      + '    }).pipe(Effect.flatMap((exits) => {\n'
      + '      const dies = exits.flatMap((exit) =>\n'
      + '        Exit.isFailure(exit) ? exit.cause.reasons.filter(Cause.isDieReason) : []\n'
      + '      )\n'
      + '      return Arr.isArrayNonEmpty(dies) ? Effect.failCause(Cause.fromReasons<never>(dies)) : Effect.void\n'
      + '    }))',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse applies the message whose release dies whole, as the run does, its commands owed',
      ],
    ],
  },
  {
    name: 'rehearse leaves the subscriptions hearNext started to the close of its scope',
    file: 'src/testing/rehearse.ts',
    from: "    yield* Effect.forEach(listeners, stopFiber, { concurrency: 'unbounded', discard: true })\n",
    to: '',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription joining, as its end stops it, a fiber its caller interrupted',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a subscription that interrupts itself as the end stops it, its key gone, is a defect',
      ],
    ],
  },
  {
    name: 'the end of rehearse stops only the subscriptions its ledger still hears',
    file: 'src/testing/rehearse.ts',
    from: "Effect.forEach(listeners, stopFiber, { concurrency: 'unbounded', discard: true })",
    to: 'stop(\n'
      + '      Arr.fromIterable(ledger.hearings.values())\n'
      + "        .flatMap((each) => each._tag === 'Opened' ? [each.handle] : []),\n"
      + '    )',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a subscription that interrupts itself as the end stops it, its key gone, is a defect',
      ],
    ],
  },
  {
    name: 'rehearse leaves a hearNext waiting as its end stops the subscription',
    file: 'src/testing/rehearse.ts',
    from: '    yield* tellStopped(Arr.fromIterable(ledger.calls))\n',
    to: '',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a hearNext still waiting in a fiber the scenario did not join fails as the rehearsal ends',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext waiting on a start whose key went away fails, though the scenario failed',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext whose message was stopping a subscription as the scenario failed fails as one waiting',
      ],
    ],
  },
  {
    name: 'the end of rehearse tells only the calls still waiting on a start',
    file: 'src/testing/rehearse.ts',
    from: 'tellStopped(Arr.fromIterable(ledger.calls))',
    to: 'tellStopped(\n'
      + '      Arr.fromIterable(ledger.hearings.values())\n'
      + "        .flatMap((each) => each._tag === 'Opened' ? each.waiting : []),\n"
      + '    )',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a hearNext waiting on a start whose key went away fails, though the scenario failed',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext whose message was stopping a subscription as the scenario failed fails as one waiting',
      ],
    ],
  },
  {
    name: "a call of rehearse's hearNext is not among those its end tells",
    file: 'src/testing/ledger.ts',
    from: '  calls: new Set([...ledger.calls, call]),\n',
    to: '',
    killedBy: [
      [
        'src/testing/ledger.test.ts',
        'a call is among the calls from its offer until it leaves, whatever the loop has made of it',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext still waiting in a fiber the scenario did not join fails as the rehearsal ends',
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
    from: 'const message = yield* runOne(deaths, command)',
    to: "const message = yield* Effect.suspend(() => runCommand(command)).pipe(scopedIn(deaths, 'command'))",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted',
      ],
    ],
  },
  {
    name: 'simulate forks a command without beginning it',
    file: 'src/testing/simulate.ts',
    from: "Effect.forkChild(effect.pipe(scopedIn(deaths, 'command')), { startImmediately: true })",
    to: "Effect.forkChild(effect.pipe(scopedIn(deaths, 'command')))",
    killedBy: [
      ['src/testing/contract.test.ts', 'begins its effect in simulate, as in the run'],
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
    name: "rehearse's loop runs a step without the services of the fiber that offers it",
    file: 'src/testing/loop.ts',
    from: '{ step: Effect.provideContext(step, context), done }',
    to: '{ step, done }',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'runs a command with the services provided around run, and a subscription with those around the hearNext that starts it',
      ],
    ],
  },
  {
    name: "rehearse's loop lets a call refused once it has ended wait",
    file: 'src/testing/loop.ts',
    from: 'return quiet ? Effect.never : Effect.interrupt',
    to: 'return Effect.never',
    killedBy: [
      [
        'src/testing/loop.test.ts',
        'is offered nothing once its end is marked: the call is interrupted, or waits when quiet',
      ],
      ['src/testing/contract.test.ts', 'in rehearse, it reaches no update, and its call is interrupted'],
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
    name: "rehearse's loop leaves its step under way to the close of its scope",
    file: 'src/testing/loop.ts',
    from: '    yield* stopping(loop)\n',
    to: '',
    killedBy: [['src/testing/loop.test.ts', 'interrupts its step under way before its stop returns']],
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
    name: "rehearse's hearNext lets no call leave as it ends",
    file: 'src/testing/rehearse.ts',
    from: '        Effect.ensuring(Effect.sync(() => {\n'
      + '          ledger = Ledger.leave(ledger, call)\n'
      + '        })),\n',
    to: '',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'a call interrupted while the subscription waits leaves its message to the next one'],
      [
        'src/testing/rehearse.test.ts',
        'a hearNext that left before the loop took its step starts nothing, and hear plays its key',
      ],
    ],
  },
  {
    name: "rehearse's hearNext leaves a call waiting on a start whose key went away",
    file: 'src/testing/rehearse.ts',
    from: 'Effect.andThen(stop(stopping), tellStopped(stopped))',
    to: 'stop(stopping)',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'a call waiting when its key goes away fails the test, since nothing more arrives under it',
      ],
    ],
  },
  {
    name: 'rehearse stops the gone keys one after the other',
    file: 'src/testing/rehearse.ts',
    from: "stopFiber(fiber), { concurrency: 'unbounded', discard: true }",
    to: 'stopFiber(fiber), { discard: true }',
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
      ['src/engine.test.ts', 'it does not start again while its key stays'],
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
      ['src/engine.test.ts', 'a key that goes away interrupts its subscription, which releases what it holds'],
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
    name: "simulate closes a command's scope before its defect says where",
    file: 'src/testing/simulate.ts',
    from: "effect.pipe(scopedIn(deaths, 'command'))",
    to: "effect.pipe(Effect.scoped, diesIn('command'))",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate gives, as the run does, what a command that dies releases its defect, in a command',
      ],
      [
        'src/testing/contract.test.ts',
        'simulate gives, as the run does, what a command that interrupts itself releases a defect',
      ],
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, of two defects on a release that dies of that of its command',
      ],
    ],
  },
  {
    name: "simulate takes a defect of what a command's scope releases for one of its own",
    file: 'src/testing/simulate.ts',
    from: "effect.pipe(scopedIn(deaths, 'command'))",
    to: "effect.pipe(diesIn('command'), Effect.scoped)",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in a command on a release of a command that dies',
      ],
    ],
  },
  {
    name: 'dispatchViolations takes a step that changes the state for one that does nothing',
    file: 'src/testing/dispatch-violations.ts',
    from: 'Equal.equals(step.state, state)\n  && ',
    to: '',
    killedBy: [
      ['src/testing/dispatch-violations.test.ts', 'reports a message that changes the state again when sent twice'],
      ['src/testing/dispatch-violations.test.ts', 'reports what update accepts and the model does not hold'],
    ],
  },
  {
    name: 'dispatchViolations takes a step that starts a command for one that does nothing',
    file: 'src/testing/dispatch-violations.ts',
    from: '\n  && (step.commands?.length ?? 0) === 0',
    to: '',
    killedBy: [
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a message that starts a command again when sent twice, though the state stays the same',
      ],
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a candidate that starts a command or raises an event, though the state stays the same',
      ],
    ],
  },
  {
    name: 'dispatchViolations takes a step that raises an event for one that does nothing',
    file: 'src/testing/dispatch-violations.ts',
    from: '\n  && (step.events?.length ?? 0) === 0',
    to: '',
    killedBy: [
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a message that raises an event again when sent twice, unless it repeats on purpose',
      ],
      [
        'src/testing/dispatch-violations.test.ts',
        'reports a candidate that starts a command or raises an event, though the state stays the same',
      ],
    ],
  },
  {
    name: 'dispatchViolations takes a candidate whose step does nothing for a control missing',
    file: 'src/testing/dispatch-violations.ts',
    from: ' && !doesNothing(step, state) && ',
    to: ' && ',
    killedBy: [
      [
        'src/testing/dispatch-violations.test.ts',
        'leaves out a candidate whose step does nothing: the same state by Equal, a copy included',
      ],
      [
        'examples/pages/app.test.ts',
        'the model holds what update accepts, all of it, and each acts once when sent twice',
      ],
    ],
  },
  {
    name: 'dispatchViolations compares a candidate with what the model holds by reference',
    file: 'src/testing/dispatch-violations.ts',
    from: '(each) => Equal.equals(each, message)',
    to: '(each) => each === message',
    killedBy: [
      ['src/testing/dispatch-violations.test.ts', 'ignores what update rejects, and what the model holds, compared by value'],
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
    name: 'drive goes on after a defect of the program until the scenario ends',
    file: 'src/testing/drive.ts',
    from: '    deaths,\n  ).pipe(',
    to: '    { ...deaths, died: Effect.never },\n  ).pipe(',
    killedBy: [
      ['src/testing/drive.test.ts', 'a defect of the program fails the scenario'],
      [
        'src/testing/drive.test.ts',
        'a subscription of init that dies fails a scenario waiting for a frame, before its patience',
      ],
    ],
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
  // Each place a defect is told where it happened (`diesIn`, and `scopedIn`, which calls it) has a mutation that takes
  // its site out, or gives it another, in the engine and in each testing tool alike (`docs/invariants.md`).
  {
    name: 'a defect of subscriptions in the run has no site',
    file: 'src/engine.ts',
    from: "yield* call(\n      'subscriptions',\n      () =>",
    to: 'yield* Effect.sync(\n      () =>',
    killedBy: [
      ['src/run.test.ts', 'a defect in subscriptions ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a key whose Equal throws dies in subscriptions'],
      ['src/run.test.ts', 'a key whose Hash throws dies in subscriptions'],
      [
        'src/testing/contract.test.ts',
        'the run dies in subscriptions on the subscriptions of the state it starts from',
      ],
      ['src/testing/contract.test.ts', 'the run dies in subscriptions first, on a state whose model is a defect too'],
    ],
  },
  {
    name: 'a defect of describeMessage in the run has no site',
    file: 'src/engine.ts',
    from: "call('describeMessage', () => describeMessage(message))",
    to: 'Effect.sync(() => describeMessage(message))',
    killedBy: [
      ['src/run.test.ts', 'a defect in describeMessage ends the run, which dies with it and with where it happened'],
    ],
  },
  {
    name: 'a defect of describeCommand in the run has no site',
    file: 'src/engine.ts',
    from: "call('describeCommand', () => commands.map(describeCommand))",
    to: 'Effect.sync(() => commands.map(describeCommand))',
    killedBy: [
      ['src/run.test.ts', 'a defect in describeCommand ends the run, which dies with it and with where it happened'],
    ],
  },
  {
    name: "a defect of the run's own logs has no site",
    file: 'src/engine.ts',
    from: "Effect.logDebug(...message).pipe(diesIn('log'))",
    to: 'Effect.logDebug(...message)',
    killedBy: [
      ['src/run.test.ts', 'a Logger that throws on the log of an accepted message is one defect, in the log'],
      ['src/run.test.ts', 'a Logger that throws on the log of a rejected message is one defect, in the log'],
      ['src/run.test.ts', 'a Logger that throws on the log of a dropped message is one defect, in the log'],
      [
        'src/run.test.ts',
        'a Logger that throws on the log of a subscription started by init is one defect, in the log',
      ],
      [
        'src/run.test.ts',
        'a Logger that throws on the log of a subscription started by a message is one defect, in the log',
      ],
    ],
  },
  {
    name: 'a defect of onApplied has no site',
    file: 'src/engine.ts',
    from: "Effect.suspend(() => onApplied(applied)).pipe(diesIn('onApplied'))",
    to: 'Effect.suspend(() => onApplied(applied))',
    killedBy: [
      ['src/run.test.ts', 'a defect in onApplied ends the run, which dies with it and with where it happened'],
      [
        'src/run.test.ts',
        'a defect in onApplied, before it returns its effect ends the run'
          + ', which dies with it and with where it happened',
      ],
      ['src/run.test.ts', 'onApplied that interrupts itself is a defect, where it happened'],
    ],
  },
  {
    name: 'a defect of onIgnored has no site',
    file: 'src/engine.ts',
    from: "Effect.suspend(() => onIgnored(ignored)).pipe(diesIn('onIgnored'))",
    to: 'Effect.suspend(() => onIgnored(ignored))',
    killedBy: [
      ['src/run.test.ts', 'a defect in onIgnored ends the run, which dies with it and with where it happened'],
      [
        'src/run.test.ts',
        'a defect in onIgnored, before it returns its effect ends the run'
          + ', which dies with it and with where it happened',
      ],
    ],
  },
  {
    name: "a defect of a command in the run is a subscription's",
    file: 'src/engine.ts',
    from: "scopedIn(deaths, 'command'),",
    to: "scopedIn(deaths, 'subscription'),",
    killedBy: [
      ['src/engine.test.ts', 'what a command dies of as the end of the engine interrupts it is what the end dies of'],
      ['src/run.test.ts', 'a defect in a command ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a defect in runCommand ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a command that interrupts itself is a defect, where it happened'],
      [
        'src/run.test.ts',
        'a command that joins an interrupted fiber that interrupts itself is a defect, where it happened',
      ],
    ],
  },
  {
    name: "a defect of a subscription in the run is a command's",
    file: 'src/engine.ts',
    from: "scopedIn(deaths, 'subscription', () => ({ key })),",
    to: "scopedIn(deaths, 'command', () => ({ key })),",
    killedBy: [
      [
        'src/engine.test.ts',
        'a subscription interrupting itself as the end of the engine stops it, its key gone, is a defect',
      ],
      ['src/run.test.ts', 'a defect in a subscription ends the run, which dies with it and with where it happened'],
      [
        'src/run.test.ts',
        'a defect in what a subscription the run stopped releases ends the run'
          + ', which dies with it and with where it happened',
      ],
      ['src/run.test.ts', 'a subscription that interrupts itself is a defect, where it happened'],
      ['src/run.test.ts', 'a subscription that dies as the end of the run releases it ends the run with it'],
    ],
  },
  {
    name: 'a defect of a subscription in the run does not say its key',
    file: 'src/engine.ts',
    from: "scopedIn(deaths, 'subscription', () => ({ key })),",
    to: "scopedIn(deaths, 'subscription'),",
    killedBy: [
      ['src/run.test.ts', 'a defect in a subscription carries its key'],
      ['src/testing/contract.test.ts', 'the run dies in a subscription, with its key, on a subscription that throws'],
    ],
  },
  {
    name: "a defect of the renderer is a command's",
    file: 'src/run.ts',
    from: "Shell.scopedIn(deaths, 'render'),",
    to: "Shell.scopedIn(deaths, 'command'),",
    killedBy: [
      ['src/run.test.ts', 'a defect in makeModel ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a defect in the view ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a renderer that throws before it returns its effect dies in the renderer'],
      ['src/run.test.ts', 'the renderer that interrupts itself is a defect, where it happened'],
      ['src/run.test.ts', 'a renderer that dies while it releases what it holds ends the run with that defect'],
    ],
  },
  {
    name: 'scopedIn leaves what its effect dies of without a site',
    file: 'src/shell.ts',
    from: '        diesIn(where, details),\n        Effect.onExit((exit) =>\n',
    to: '        Effect.onExit((exit) =>\n',
    killedBy: [
      ['src/engine.test.ts', 'what a command dies of as the end of the engine interrupts it is what the end dies of'],
      ['src/run.test.ts', 'a defect in makeModel ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a defect in the view ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a defect in a subscription ends the run, which dies with it and with where it happened'],
      ['src/run.test.ts', 'a defect in a command ends the run, which dies with it and with where it happened'],
    ],
  },
  {
    name: 'scopedIn leaves what the release dies of without a site',
    file: 'src/shell.ts',
    from: '      )).pipe(\n        diesIn(\n          where,\n          details,\n'
      + '          (defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),\n'
      + '        ),\n',
    to: '      )).pipe(\n',
    killedBy: [
      ['src/run.test.ts', 'a renderer that dies while it releases what it holds ends the run with that defect'],
      ['src/run.test.ts', 'a renderer that dies while an interrupted run releases it is in the cause'],
      ['src/run.test.ts', 'a renderer that dies as a run that died elsewhere releases it is in the cause'],
      [
        'src/run.test.ts',
        'a makeModel that dies as a run that died releases the renderer is the second defect, in render',
      ],
      ['src/run.test.ts', 'a subscription whose release dies applies messages until its scope has released all'],
    ],
  },
  {
    name: 'a defect of subscriptions in rehearse has no site',
    file: 'src/testing/rehearse.ts',
    from: "      diesIn('subscriptions'),\n      Effect.map(([stopping, stopped])",
    to: '      Effect.map(([stopping, stopped])',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse keeps the state whose subscriptions are a defect, as the run publishes it',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, on a key whose Equal throws against the key of the state before',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in subscriptions on those of the state it starts from',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails in subscriptions first, as the run dies, on a state whose model is a defect too',
      ],
    ],
  },
  {
    name: 'a defect of makeModel on the first state in rehearse has no site',
    file: 'src/testing/rehearse.ts',
    from: "program.makeModel(started.current.state)).pipe(diesIn('render'))",
    to: 'program.makeModel(started.current.state))',
    killedBy: [
      ['src/testing/contract.test.ts', 'rehearse fails, as the run dies, in render, on a makeModel that throws'],
      ['src/testing/contract.test.ts', 'rehearse fails in render, as the run dies'],
      [
        'src/testing/contract.test.ts',
        'drive fails, as rehearse does, in render alone: the scenario that would catch it never meets it',
      ],
    ],
  },
  {
    name: "a defect of a key's Equal in rehearse's hear has no site",
    file: 'src/testing/rehearse.ts',
    from: "Effect.sync(() => HashMap.get(active.keys, key)).pipe(\n        diesIn('subscriptions'),\n",
    to: 'Effect.sync(() => HashMap.get(active.keys, key)).pipe(\n',
    killedBy: [
      ['src/testing/rehearse.test.ts', "dies in subscriptions when a key's Equal throws, as the run does"],
    ],
  },
  {
    name: "a defect of a subscription in rehearse is a command's",
    file: 'src/testing/rehearse.ts',
    from: "scopedIn(register, 'subscription', () => ({ key }))",
    to: "scopedIn(register, 'command', () => ({ key }))",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, on a defect of what a subscription releases when the scenario ends',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect, as the run dies, on a subscription interrupting itself',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription interrupting itself as it stops it',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription joining, as its end stops it, a fiber its caller interrupted',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a subscription interrupting itself as the fiber that stops it',
      ],
    ],
  },
  {
    name: 'a defect of a subscription in rehearse does not say its key',
    file: 'src/testing/rehearse.ts',
    from: "scopedIn(register, 'subscription', () => ({ key }))",
    to: "scopedIn(register, 'subscription')",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails, as the run dies, in a subscription, with its key, on a subscription that throws',
      ],
    ],
  },
  {
    name: "a defect of a command in rehearse is a subscription's",
    file: 'src/testing/rehearse.ts',
    from: "scopedIn(register, 'command')",
    to: "scopedIn(register, 'subscription')",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect, as the run dies, on a command interrupting itself',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command joining, as its run is stopped, a fiber its caller interrupted',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command joining, as its run is stopped, a fiber its interrupter interrupted',
      ],
      [
        'src/testing/contract.test.ts',
        'rehearse fails with a defect of a command joining, as its end stops it, a fiber its caller interrupted',
      ],
    ],
  },
  {
    name: 'a defect of subscriptions in simulate has no site',
    file: 'src/testing/simulate.ts',
    from: "    }).pipe(diesIn('subscriptions'))",
    to: '    })',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, on a key whose Equal throws against the key of the state before',
      ],
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in subscriptions on those of the state it starts from',
      ],
    ],
  },
  {
    name: 'a runCommand that throws before its effect in simulate has no site',
    file: 'src/testing/simulate.ts',
    from: "      Effect.sync(() => runCommand(command)).pipe(\n        diesIn('command'),\n",
    to: '      Effect.sync(() => runCommand(command)).pipe(\n',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in a command on a runCommand that throws before its effect',
      ],
    ],
  },
  {
    name: "a defect of a command in simulate is a subscription's",
    file: 'src/testing/simulate.ts',
    from: "effect.pipe(scopedIn(deaths, 'command'))",
    to: "effect.pipe(scopedIn(deaths, 'subscription'))",
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect, as the run dies, on a command interrupting itself',
      ],
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect of a command interrupting itself as whoever runs it interrupts it',
      ],
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted',
      ],
      ['src/testing/contract.test.ts', 'simulate fails, as the run dies, in a command on a command that dies'],
      [
        'src/testing/contract.test.ts',
        'simulate fails, as the run dies, in a command on a release of a command that dies',
      ],
    ],
  },
  {
    name: "a parent makes a new state for a child's message that keeps the child's",
    file: 'src/compose.ts',
    from: 'state: result.state === childState ? state : setAt(place, state, result.state),',
    to: 'state: setAt(place, state, result.state),',
    killedBy: [
      [
        'src/compose.test.ts',
        "a child's message that keeps its state keeps the parent's, its commands and events still going",
      ],
      ['src/input.test.ts', 'leaves the very same state when the place holds it already'],
      ['src/input.test.ts', 'compares the value it was written over by Equal, whatever it is made of'],
    ],
  },
  {
    name: 'rehearse lets a command whose run was interrupted go',
    file: 'src/testing/rehearse.ts',
    from: '  if (cancelled.length > 0) {\n',
    to: '  if (false) {\n',
    killedBy: [
      ['src/testing/rehearse.test.ts', 'when a run interrupted while its command runs leaves the command unanswered'],
      [
        'src/testing/rehearse.test.ts',
        'a run interrupted once its command has answered applies the answer, or fails the rehearsal',
      ],
      ['src/testing/rehearse.test.ts', 'a run interrupted before the effect of its command begins fails the rehearsal'],
    ],
  },
  {
    name: 'rehearse lets a command still under way at the end go',
    file: 'src/testing/rehearse.ts',
    from: '  if (underWay.size > 0) {\n',
    to: '  if (false) {\n',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'when a command is still under way at the end, since its answer would still arrive',
      ],
      [
        'src/testing/rehearse.test.ts',
        'a command that answers while the end releases a subscription fails it, as one under way',
      ],
    ],
  },
  {
    name: 'rehearse lets a command still pending at the end go',
    file: 'src/testing/rehearse.ts',
    from: '  if (pending.length > 0) {\n',
    to: '  if (false) {\n',
    killedBy: [
      [
        'src/testing/rehearse.test.ts',
        'when a command is still pending at the end, since its answer would still arrive',
      ],
      ['src/testing/rehearse.test.ts', 'a run interrupted before the effect of its command begins fails the rehearsal'],
      [
        'src/testing/rehearse.test.ts',
        'a message sent as the scenario returns is applied, and the command it starts fails the rehearsal',
      ],
    ],
  },
  {
    name: 'a report leaves the defects it reported to be reported again',
    file: 'src/core.ts',
    from: '[Opt.some(Cause.fromReasons<never>(dies)), { ...register, reported: register.deaths.length }]',
    to: '[Opt.some(Cause.fromReasons<never>(dies)), register]',
    killedBy: [
      ['src/core.test.ts', 'reports each defect once, those since the last report, in order'],
    ],
  },
  {
    name: 'a death recorded signals nobody',
    file: 'src/shell.ts',
    from: 'return register !== before ? Deferred.succeed(died, undefined) : Effect.void',
    to: 'return Effect.void',
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
    name: 'simulate stops an interrupted command with no mark of its own',
    file: 'src/testing/simulate.ts',
    from: 'Effect.andThen(stopping(fiber), ',
    to: 'Effect.andThen(Fiber.interrupt(fiber), ',
    killedBy: [
      [
        'src/testing/contract.test.ts',
        'simulate fails with a defect of a command joining, as it is stopped, a fiber its caller interrupted',
      ],
    ],
  },
  {
    name: 'a description follows a wrapped message that is not tagged',
    file: 'src/log.ts',
    from: "Predicate.hasProperty(value, 'message') && tagOf(value.message) !== undefined",
    to: "Predicate.hasProperty(value, 'message')",
    killedBy: [
      ['src/log.test.ts', 'never by a field named message that holds data'],
    ],
  },
  {
    name: 'a description follows a wrapped command that is not tagged',
    file: 'src/log.ts',
    from: "Predicate.hasProperty(value, 'command') && tagOf(value.command) !== undefined",
    to: "Predicate.hasProperty(value, 'command')",
    killedBy: [
      ['src/log.test.ts', 'never by a field named command that holds data'],
    ],
  },
]
