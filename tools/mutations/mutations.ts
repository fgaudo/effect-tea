// One mutation for each check an invariant rests on (docs/invariants.md), each with the tests
// that must fail under it. `mutate.ts` applies them one at a time.

export type Mutation = Readonly<{
  /** The check the mutation takes out. */
  name: string
  /**
   * The items of "What you can rely on", in the guide's "Guarantees", that the check holds a part of, each by its bold
   * title without its final period. Left out for a check that holds none of them, as those of the testing tools and of
   * the bridges. `bun run comments` fails on a title the list does not have, and on an item no mutation names.
   */
  guarantees?: ReadonlyArray<string>
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
    name: "update is called after the first defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "  if (died()) return dead\n",
    to: "",
    killedBy: [
      ["src/engine.test.ts", "from the first defect on, no update is called, on a subscription's message either"],
      ["src/core.test.ts", "once the run has died, update is not called"],
      [
        "src/run.test.ts",
        "a message the run does not apply after a defect starts no command and no subscription, and onApplied does not hear it"
      ],
      [
        "src/run.test.ts",
        "a run whose subscription of init dies as it starts applies no message after: an answer starts nothing, and onApplied does not hear it"
      ]
    ]
  },
  {
    name: "a message is dropped before the register is read",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "  if (died()) return dead\n"
      + "  if (source._tag === \"Subscription\" && !active.starts.has(source.generation)) return dropped\n",
    to: "  if (source._tag === \"Subscription\" && !active.starts.has(source.generation)) return dropped\n"
      + "  if (died()) return dead\n",
    killedBy: [
      [
        "src/core.test.ts",
        "a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing"
      ]
    ]
  },
  {
    name: "a message of a stopped start reaches update",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "source._tag === \"Subscription\" && !active.starts.has(source.generation)",
    to: "false",
    killedBy: [
      [
        "src/engine.test.ts",
        "a start whose key went away before the fiber of effects started it sends nothing that reaches update"
      ],
      [
        "src/core.test.ts",
        "a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing"
      ],
      [
        "src/run.test.ts",
        "what a subscription sends once its key went away, before it is stopped, does not reach update"
      ]
    ]
  },
  {
    name: "a message applies by its key, not by its start",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "source._tag === \"Subscription\" && !active.starts.has(source.generation)",
    to: "source._tag === \"Subscription\" && !HashMap.has(active.keys, source.key)",
    killedBy: [
      [
        "src/core.test.ts",
        "a message of an earlier start of a key that came back is dropped, dead after a death, calling nothing"
      ],
      [
        "src/engine.test.ts",
        "a start whose key went away before the fiber of effects started it sends nothing that reaches update"
      ]
    ]
  },
  {
    name: "as many keys are taken for the same keys",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "fresh.length === 0 && HashMap.size(listed) === HashMap.size(active.keys)",
    to: "HashMap.size(listed) === HashMap.size(active.keys)",
    killedBy: [
      ["src/core.test.ts", "a kept key keeps its start, and a gone key stops with its start"],
      [
        "src/engine.test.ts",
        "the stops of a state are awaited before any start of that state or a later one, and a key that comes back finds its old one released"
      ]
    ]
  },
  {
    name: "keys all active are taken for the same keys, though one went away",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "fresh.length === 0 && HashMap.size(listed) === HashMap.size(active.keys)",
    to: "fresh.length === 0",
    killedBy: [
      ["src/core.test.ts", "a key that comes back gets a new start"]
    ]
  },
  {
    name: "a rejected message is applied as a step that keeps the state",
    guarantees: ["Outdated clicks are harmless"],
    file: "src/core.ts",
    from: "  if (result === reject) return ignored\n",
    to:
      "  if (result === reject) return { _tag: \"Applied\", next: current, changed: false, commands: [], events: [] }\n",
    killedBy: [
      ["src/core.test.ts", "a message update rejects is ignored"],
      [
        "src/engine.test.ts",
        "a rejected message leaves the very same state, onIgnored hears it at once, and no listener is told"
      ],
      [
        "src/run.test.ts",
        "hears every message update rejects, with where it came from and the state it did not apply in"
      ],
      ["src/testing/rehearse.test.ts", "a command's answer that no longer applies is ignored, and listed"],
      ["src/testing/simulate.test.ts", "a command's message that update rejects is ignored, and listed"]
    ]
  },
  {
    name: "the very same state is taken for a new one",
    guarantees: ["A model is made only when it is read"],
    file: "src/core.ts",
    from: "const changed = result.state !== current.state",
    to: "const changed = true",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener is told of each new state, once it is current, never of the very same one, until it stops"
      ],
      ["src/core.test.ts", "the very same state keeps its revision, and its commands still run"],
      ["src/engine.test.ts", "a message that keeps the same state makes no new revision"],
      ["src/engine.test.ts", "its commands still run"],
      ["src/run.test.ts", "a message that leaves the very same state is heard too, with an unchanged revision"]
    ]
  },
  {
    name: "a defect of update in simulate has no site",
    file: "src/testing/simulate.ts",
    from: "diesIn(\"update\", () => ({ on: describeByTag(message) })),",
    to: "(self) => self,",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in update, with its message, on an update that throws"
      ]
    ]
  },
  {
    name: "a defect of update in simulate does not say its message",
    file: "src/testing/simulate.ts",
    from: "diesIn(\"update\", () => ({ on: describeByTag(message) })),",
    to: "diesIn(\"update\"),",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in update, with its message, on an update that throws"
      ]
    ]
  },
  {
    name: "scopedIn wraps again what it wrapped",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "(defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect)",
    to: "() => false",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "the run dies of one defect on a release that fails with the cause of its command"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of one defect on a release that fails with the cause of its command"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, of one defect on a release that fails with the cause of its command"
      ]
    ]
  },
  {
    name: "scopedIn tells what it wrapped by the register",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "(defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect)",
    to: "(defect) => deaths.has(defect)",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a release that dies with a defect already recorded elsewhere fails it with a second one"
      ]
    ]
  },
  {
    name: "scopedIn joins what its release died of to what its effect died of by Equal, as Effect.scoped does",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "return Scope.close(scope, exit).pipe(\n",
    to: "return Scope.close(scope, exit).pipe(\n"
      + "              Effect.catchCause((cause) => Effect.failCause(Cause.combine(own, cause))),\n",
    killedBy: [
      ["src/run.test.ts", "of a command that dies are each a defect of the command"],
      ["src/run.test.ts", "of a subscription the run stops are each a defect of the subscription"],
      [
        "src/testing/contract.test.ts",
        "the run dies of each of two equal defects of what a command that dies releases"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of each of two equal defects of what a command that dies releases"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, of each of two equal defects of what a command that dies releases"
      ]
    ]
  },
  {
    name: "scopedIn ends with what its effect and its release died of joined by Equal",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "Effect.failCause(Core.released(own, closed.cause))",
    to: "Effect.failCause(Cause.combine(own, closed.cause))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of two defects on a release that dies of that of its command"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of each of two equal defects of what a command that dies releases"
      ]
    ]
  },
  {
    name: "scopedIn keeps twice what its release dies of again",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "Effect.failCause(Core.released(own, closed.cause))",
    to: "Effect.failCause(Cause.fromReasons<E>([...own.reasons, ...closed.cause.reasons]))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of one defect on a release that fails with the cause of its command"
      ]
    ]
  },
  {
    name: "what a fiber with a scope of its own ends with tells defects apart by value",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "(Cause.isDieReason(one) && Cause.isDieReason(other) && one.defect === other.defect)",
    to: "(Cause.isDieReason(one) && Cause.isDieReason(other)"
      + " && JSON.stringify(one.defect) === JSON.stringify(other.defect))",
    killedBy: [
      ["src/core.test.ts", "two defects equal by Equal stay two, told apart by identity"]
    ]
  },
  {
    name: "what a fiber with a scope of its own ends with tells interruptions apart by their fiber alone",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "&& markOf(one) === markOf(other))",
    to: ")",
    killedBy: [
      [
        "src/core.test.ts",
        "an interruption of the release is left out when the effect has one by the same fiber, with its mark"
      ]
    ]
  },
  {
    name: "a defect is recorded after the release of its scope",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "self.pipe(diesIn(where, details, () => false, Core.byTheRun), deaths.recorded, Scope.provide(scope))",
    to: "self.pipe(diesIn(where, details, () => false, Core.byTheRun), Scope.provide(scope))",
    killedBy: [
      [
        "src/run.test.ts",
        "a command that dies before another, which its release lets die, is the first defect of the cause"
      ],
      ["src/run.test.ts", "a subscription that dies before another, which its release lets die, is the first defect"],
      [
        "src/run.test.ts",
        "a subscription dying in a scope of its channel, before one its release lets die, is the first defect"
      ],
      [
        "src/run.test.ts",
        "a subscription dying in a scope of its channel lets no message apply as the channel releases"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a command that dies before another, which its release lets die, fails it first"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a subscription that dies before another, which its release lets die, fails it first"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a subscription dying in a scope of its channel, before one its release lets die, fails it first"
      ]
    ]
  },
  {
    name: "a fiber of the run acquires into the scope of the run",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/shell.ts",
    from: "self.pipe(diesIn(where, details, () => false, Core.byTheRun), deaths.recorded, Scope.provide(scope))",
    to: "self.pipe(diesIn(where, details, () => false, Core.byTheRun), deaths.recorded)",
    killedBy: [
      ["src/engine.test.ts", "a command's scope closes before its answer is applied"],
      [
        "src/run.test.ts",
        "what a subscription acquires is released when its key goes away, apart from the next message"
      ],
      ["src/engine.test.ts", "a fiber that a command forks in its scope is interrupted when the command ends"],
      ["src/engine.test.ts", "what a subscription acquires (Channel.fromEffect) is released when its key goes away"],
      [
        "src/run.test.ts",
        "what a command acquires is its own: no scope to provide, released after it stops"
      ],
      [
        "src/testing/rehearse.test.ts",
        "runs the subscription under the key to its first message, applies it, and releases it at the end"
      ],
      ["src/testing/drive.test.ts", "a program whose commands acquire needs no scope: each command has its own"]
    ]
  },
  {
    name: "a subscription's channel releases its scopes before its defect is recorded",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/shell.ts",
    from: "Channel.toPull(subscription).pipe(\n"
      + "    // No yield of its own after each message, which made a pull of messages taken one by one three times slower: the\n"
      + "    // budget of operations of the runtime still yields the fiber (`Scheduler.MaxOpsBeforeYield`), and no invariant\n"
      + "    // rests on either.\n"
      + "    Effect.flatMap((pull) => Effect.forever(Effect.flatMap(pull, send), { disableYield: true })),\n"
      + "    Pull.catchDone(Effect.succeed)\n"
      + "  )",
    to: "Channel.runForEach(subscription, send)",
    killedBy: [
      [
        "src/run.test.ts",
        "a subscription dying in a scope of its channel, before one its release lets die, is the first defect"
      ],
      [
        "src/run.test.ts",
        "a subscription dying in a scope of its channel lets no message apply as the channel releases"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a subscription dying in a scope of its channel, before one its release lets die, fails it first"
      ]
    ]
  },
  {
    name: "a fiber the run forks takes an interruption without the run's mark for the run's",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "Cause.isInterruptReason(reason) && markOf(reason) !== undefined",
    to: "Cause.isInterruptReason(reason)",
    killedBy: [
      ["src/run.test.ts", "of a command, as its scope releases what it holds, is a defect in the command"],
      ["src/run.test.ts", "of a subscription, as its scope releases what it holds, is a defect in the subscription"],
      ["src/testing/contract.test.ts", "the run dies with a defect of a command a fiber of the program interrupts"]
    ]
  },
  {
    name: "a fiber the run forks keeps an interruption without the run's mark until its root",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "diesIn(where, details, () => false, Core.byTheRun)",
    to: "diesIn(where, details)",
    killedBy: [
      ["src/engine.test.ts", "no update is called on a message sent as a subscription the program interrupted releases"]
    ]
  },
  {
    name: "a self-interruption is no defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "const own = Core.otherwiseDefect(cause, kept(Exit.isFailure(received) ? received.cause : Cause.empty))",
    to: "const own = cause as Cause.Cause<never>",
    killedBy: [
      [
        "src/run.test.ts",
        "a command that joins an interrupted fiber that interrupts itself is a defect, where it happened"
      ],
      ["src/run.test.ts", "a subscription that interrupts itself is a defect, where it happened"],
      [
        "src/run.test.ts",
        "a command that fails without a defect, which its type rules out, is a defect in the command"
      ],
      ["src/run.test.ts", "after the command died, is a second defect of the command, after the first"],
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect, as the run dies, on a command interrupting itself"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, on a command interrupting itself"
      ],
      ["src/testing/contract.test.ts", "the run dies with a defect of a command interrupting itself"],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, on a subscription interrupting itself"
      ],
      [
        "src/testing/rehearse.test.ts",
        "rehearse fails on a release that interrupts itself after its command died, with two defects"
      ],
      ["src/run.test.ts", "a command that interrupts itself is a defect in the command"]
    ]
  },
  {
    name: "an interruption the fiber received is taken for its own",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "Exit.isFailure(received) ? received.cause : Cause.empty",
    to: "Cause.empty",
    killedBy: [
      ["src/run.test.ts", "a run interrupted by whoever runs it is no defect"],
      ["src/run.test.ts", "a subscription stopped inside an uninterruptible region is no defect"]
    ]
  },
  {
    name: "a self-interruption beside one the fiber received is no defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "interrupters.some(({ fiberId, mark }) => fiberId === reason.fiberId && mark === markOf(reason))",
    to: "interrupters.length > 0",
    killedBy: [
      [
        "src/core.test.ts",
        "an interruption the fiber received is kept as it is, beside the defect its own interruption is"
      ],
      [
        "src/run.test.ts",
        "a command that interrupts itself as whoever runs the run interrupts it is a defect in the command"
      ],
      ["src/run.test.ts", "a subscription that interrupts itself as the run stops it is a defect in the subscription"],
      [
        "src/testing/contract.test.ts",
        "the run dies with a defect of a command interrupting itself as whoever runs it interrupts it"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect of a command interrupting itself as whoever runs it interrupts it"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect of a command interrupting itself as whoever runs it interrupts it"
      ],
      [
        "src/testing/contract.test.ts",
        "the run dies with a defect of a subscription interrupting itself as the run stops it"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect of a subscription interrupting itself as it stops it"
      ]
    ]
  },
  {
    name: "a defect is recorded once for each fiber it ends",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "keeps(reason.defect) && !holds(deaths, reason.defect)",
    to: "keeps(reason.defect)",
    // The rest of the suite: `rehearse.test.ts` hangs under it.
    killedBy: [
      ["src/core.test.ts", "keeps each defect once, by its identity, in the order the fibers died"],
      ["src/core.test.ts", "is the same register when nothing new died, so that the shell signals only a new death"],
      ["src/run.test.ts", "every defect of the cause is kept, each with where it happened"],
      ["src/run.test.ts", "a Logger that throws on what a command logs is a defect in the command"],
      [
        "src/testing/contract.test.ts",
        "in the run, a defect of what a stopped subscription releases is all the cause holds"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with the defect alone, as the run dies, though a hearNext waited"
      ]
    ]
  },
  {
    name: "the run's fibers log into the span of whoever runs it",
    guarantees: ["Logs do not pile up in a span"],
    file: "src/shell.ts",
    from: "if (span === undefined || span._tag === \"ExternalSpan\") return context",
    to: "return context",
    killedBy: [
      [
        "src/run.test.ts",
        "what runs in a run logs nothing into the span of whoever runs it, which stays the parent of their spans"
      ]
    ]
  },
  {
    name: "the run ends with what it ended with, not with its defects first",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "deaths.length === 0 ? exit :",
    to: "true ? exit :",
    killedBy: [
      ["src/core.test.ts", "a run that died ends with its defects first, then the rest of what it ended with"],
      [
        "src/run.test.ts",
        "an interrupted run whose command dies as it releases has the defect first, then the interruption"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, on a command that dies in a fiber nobody joins"
      ],
      [
        "src/testing/contract.test.ts",
        "drive fails, as rehearse does, with the defect first, then with what the scenario ended with"
      ],
      [
        "src/testing/drive.test.ts",
        "a defect of what the program releases as it stops comes first, before what the scenario failed with"
      ]
    ]
  },
  {
    name: "a defect the run died of is in its cause again, among the rest of what it ended with",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "!(Cause.isDieReason(reason) && holds(deaths, reason.defect))",
    to: "true",
    killedBy: [
      ["src/core.test.ts", "a run that died ends with its defects first, then the rest of what it ended with"],
      ["src/core.test.ts", "a defect is left out of the rest by its identity, never by Equal"],
      ["src/run.test.ts", "every defect of the cause is kept, each with where it happened"],
      ["src/testing/rehearse.test.ts", "a defect the scenario catches fails it all the same, first, and once"]
    ]
  },
  {
    name: "a description follows a wrapping that comes back to a value on its way",
    file: "src/log.ts",
    from: "on.includes(wrapped) ? \"…\" :",
    to: "false ? \"…\" :",
    killedBy: [
      ["src/log.test.ts", "one whose wrapping comes back to a value on its way, by the tags on its way until then"]
    ]
  },
  {
    name: "an interruption with the fiber id of one the fiber received is no defect, whatever its mark",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: " && mark === markOf(reason)",
    to: "",
    killedBy: [
      ["src/core.test.ts", "an interruption with the fiber id of one received, and not its mark, is a defect"],
      [
        "src/run.test.ts",
        "a command that joins a fiber it interrupted as the fiber that stops it, as the run ends, is a defect in the command"
      ],
      [
        "src/run.test.ts",
        "a subscription that joins a fiber it interrupted as the fiber that stops it, as the run ends, is a defect in the subscription"
      ]
    ]
  },
  {
    name: "the run stops its fibers with no mark of its own",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/shell.ts",
    from: "Fiber.interruptAs(fiber, id, Context.make(Core.Stopped, {}))",
    to: "Fiber.interruptAs(fiber, id)",
    killedBy: [
      ["src/run.test.ts", "a run interrupted by whoever runs it is no defect"],
      ["src/engine.test.ts", "the next message does not wait for a release, which the effects of the next state do"]
    ]
  },
  {
    name: "a child's model is made anew for a state it was made for",
    guarantees: ["A model is made only when it is read"],
    file: "src/compose.ts",
    from: "    if (kept.has(childState)) return kept.get(childState)\n",
    to: "",
    killedBy: [
      ["src/compose.test.ts", "one program as two children, in the very same state object, has one model"],
      ["src/compose.test.ts", "children that share one state object share its model, and their dispatch adds their id"],
      ["src/compose.test.ts", "in a run, a nested child that did not change keeps its model from one state to the next"]
    ]
  },
  {
    name: "a tag that the children inherit is routed to a child",
    file: "src/compose.ts",
    from: "typeof tag === \"string\" && Object.hasOwn(programs, tag)",
    to: "typeof tag === \"string\" && tag in programs",
    killedBy: [
      [
        "src/compose.test.ts",
        "an own message or command whose tag a plain object inherits is the parent's own, not a child's"
      ]
    ]
  },
  {
    name: "a child that the children inherit is kept and gets a model",
    file: "src/compose.ts",
    from: "  Object.fromEntries(Object.entries(record).map(([name, value]) => [name, f(value, name)]))",
    to:
      "  Object.fromEntries([...(function*() { for (const name in record) yield [name, f(record[name] as A, name)] })()])",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child that the children object inherits is no child: it is not kept, and has no model and no subscriptions"
      ]
    ]
  },
  {
    name: "a child that the children inherit is reconciled and has its subscriptions lifted",
    file: "src/compose.ts",
    from: "  const names = Object.keys(programs)\n",
    to: "  const names = [...(function*() { for (const name in programs) yield name })()]\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child that the children object inherits is no child: it is not kept, and has no model and no subscriptions"
      ]
    ]
  },
  {
    name: "a child's lifted subscriptions are made again for the instance they were made for",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/compose.ts",
    from: "    if (found !== undefined) return found\n",
    to: "",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child's subscriptions are kept while its instance is the same object, and made again for a new state"
      ]
    ]
  },
  {
    name: "a child's state that is not an object dies of the WeakMap's TypeError",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "    if (!Predicate.isObjectKeyword(childState)) {\n",
    to: "    if (false) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child whose state is not an object is a defect that names it and its id, in its model"
      ],
      ["src/compose.test.ts", "a child alone whose state is not an object is a defect that names it, in its model"]
    ]
  },
  {
    name: "an own key equal to a lifted one is no defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "            if (HashMap.has(own, key)) {\n",
    to: "            if (false) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "an own subscription key that is the lifted key of a child's is a defect, never a silent replacement"
      ]
    ]
  },
  {
    name: "an id listed twice is no defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "if (HashMap.has(kept, id)) throw defectAt(",
    to: "if (false) throw defectAt(",
    killedBy: [
      ["src/compose.test.ts", "an id listed twice is a CompositionDefect, in update and in init"]
    ]
  },
  {
    name: "a child's event that nothing handles dies of a TypeError",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "    if (handle === undefined) {\n",
    to: "    if (false) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a CompositionDefect names the child, its id for a child by id, and the tags of what it happened on"
      ]
    ]
  },
  {
    name: "a message for a child that is not there is applied as a step that keeps the state",
    guarantees: ["Outdated clicks are harmless", "A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "      if (Opt.isNone(entry)) return reject\n",
    to: "      if (Opt.isNone(entry)) return { state }\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a message for a child that is not there is rejected, from its view or as the answer of a command"
      ],
      ["src/compose.test.ts", "the late message of a removed child is rejected"],
      [
        "src/compose.test.ts",
        "a message for a child sometimes there that a state written by hand does not hold is rejected"
      ]
    ]
  },
  {
    name: "a write whose place is not there is applied as a step that keeps the state",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/compose.ts",
    from: "    if (Opt.isNone(held)) return reject\n",
    to: "    if (Opt.isNone(held)) return { state }\n",
    killedBy: [
      ["src/input.test.ts", "is rejected where the input is not in the state"],
      ["src/input.test.ts", "rejects a write at an id the state does not hold"]
    ]
  },
  {
    name: "a child's rejection is applied by its parent as a step that keeps the state",
    guarantees: ["Outdated clicks are harmless"],
    file: "src/compose.ts",
    from: "      if (result === reject) return reject\n      childStep(",
    to: "      if (result === reject) return { state }\n      childStep(",
    killedBy: [
      ["src/input.test.ts", "a fixed message drawn for the old draft reaches the new one, and update decides"]
    ]
  },
  {
    name: "an answer for another instance at the place reaches the instance there",
    guarantees: ["An answer reaches the instance that asked for it, or is rejected"],
    file: "src/compose.ts",
    from: "      if (instance !== undefined && instance !== entry.value.instance) return reject\n",
    to: "",
    killedBy: [
      [
        "src/compose.test.ts",
        "an answer for a child alone closed and opened again is rejected, and one for the instance there applies"
      ],
      ["src/compose.test.ts", "an answer for a child alone started again in one step by a new key is rejected"],
      ["src/compose.test.ts", "an answer for a child by id started again in one step by other flags is rejected"],
      ["src/compose.test.ts", "an answer for a child by id removed and listed again at its id is rejected"],
      [
        "src/compose.test.ts",
        "closed, then opened again: the answer of the form before is rejected, and the run goes on"
      ],
      ["src/compose.test.ts", "started again in one step, by its key: the answer of the form before is rejected"]
    ]
  },
  {
    name: "every start has the same number",
    guarantees: ["An answer reaches the instance that asked for it, or is rejected"],
    file: "src/compose.ts",
    from: "    const instance = ++gathered.starts\n",
    to: "    const instance = gathered.starts\n",
    killedBy: [
      ["src/compose.test.ts", "a child's commands carry the number of its start, and so do their answers"],
      [
        "src/compose.test.ts",
        "closed, then opened again: the answer of the form before is rejected, and the run goes on"
      ]
    ]
  },
  {
    name: "a tell to a child that is not there is answered from no state",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "      if (Opt.isNone(entry)) {\n",
    to: "      if (false) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "telling a child that is not there once the step is reconciled is a CompositionDefect naming it and the message"
      ],
      ["src/compose.test.ts", "a child's external never rejects, and telling a child that is not there is a defect"]
    ]
  },
  {
    name: "a handler of onEvent reads the outputs of before the child's step",
    file: "src/compose.ts",
    from: "    if (!Object.is(result.state, entry.state)) {\n"
      + "      putAt(gathered, place, { instance: entry.instance, key: entry.key, state: result.state })\n"
      + "    }\n"
      + "    for (const command of result.commands ?? []) gathered.commands.push(wrapCommand(place, entry.instance)(command))\n"
      + "    for (const event of result.events ?? []) {\n"
      + "      ownStep(gathered, onEventAt(place, event, gathered.children)(gathered.own))\n",
    to: "    const read = gathered.children\n"
      + "    if (!Object.is(result.state, entry.state)) {\n"
      + "      putAt(gathered, place, { instance: entry.instance, key: entry.key, state: result.state })\n"
      + "    }\n"
      + "    for (const command of result.commands ?? []) gathered.commands.push(wrapCommand(place, entry.instance)(command))\n"
      + "    for (const event of result.events ?? []) {\n"
      + "      ownStep(gathered, onEventAt(place, event, read)(gathered.own))\n",
    killedBy: [["src/compose.test.ts", "a handler of onEvent reads the outputs as the child's step left them"]]
  },
  {
    name: "a child that an earlier item of the same step started again is told",
    file: "src/compose.ts",
    from: "      if (Opt.isNone(entry) || entry.value.instance !== instance) continue\n",
    to: "      if (Opt.isNone(entry)) continue\n",
    killedBy: [
      ["src/compose.test.ts", "a child that an earlier answer of the same step started again is told nothing"]
    ]
  },
  {
    name: "a child that an earlier item of the same step dropped is told, from no state",
    file: "src/compose.ts",
    from: "      if (Opt.isNone(entry) || entry.value.instance !== instance) continue\n",
    to: "      if (entry.value.instance !== instance) continue\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child that an earlier answer of the same step dropped is told nothing, and it is no defect"
      ]
    ]
  },
  {
    name: "what a step tells is given in the reverse order",
    file: "src/compose.ts",
    from: "    for (const [place, instance, message] of bound) {\n",
    to: "    for (const [place, instance, message] of [...bound].reverse()) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "children are told in order, each to its end: the events of one are handled before the next is told"
      ]
    ]
  },
  {
    name: "a step of the parent's own is not reconciled",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "    if (!Object.is(step.state, before)) reconcile(gathered, Opt.some(before))\n",
    to: "",
    killedBy: [
      ["src/compose.test.ts", "a child that the step lists anew is started before it is told"],
      [
        "src/compose.test.ts",
        "a child that a step lists anew is started, with its first commands lifted with its number"
      ]
    ]
  },
  {
    name: "a write into the parent's input is not reconciled",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "    reconcile(gathered, Opt.some(own))\n",
    to: "",
    killedBy: [
      ["src/compose.test.ts", "a write into the parent's input that changes what its state lists reconciles too"]
    ]
  },
  {
    name: "init starts no child",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "      events: []\n    }\n    reconcile(gathered, Opt.none())\n    return {\n",
    to: "      events: []\n    }\n    return {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "init starts each child its first state lists, with its first commands, by the order of the names, then of the ids"
      ]
    ]
  },
  {
    name: "a child alone that the state no longer lists is kept",
    guarantees: [
      "A parent's children are those its own state lists",
      "An answer reaches the instance that asked for it, or is rejected"
    ],
    file: "src/compose.ts",
    from: "          if (Opt.isSome(current)) gathered.children = { ...gathered.children, [name]: Opt.none() }\n",
    to: "",
    killedBy: [
      [
        "src/compose.test.ts",
        "an answer for a child alone closed and opened again is rejected, and one for the instance there applies"
      ]
    ]
  },
  {
    name: "a child by id that the state no longer lists is kept",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "      if (!same || HashMap.size(next) !== HashMap.size(current)) {\n",
    to: "      if (!same) {\n",
    killedBy: [
      ["src/compose.test.ts", "a child that the state no longer lists is dropped, and a message for it is rejected"]
    ]
  },
  {
    name: "a child alone is started again for a key equal by Equal",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "!Equal.equals(current.value.key, wanted.value)",
    to: "current.value.key !== wanted.value",
    killedBy: [
      [
        "src/compose.test.ts",
        "another key starts a child alone again, and a key equal by Equal, a struct made anew, keeps it"
      ]
    ]
  },
  {
    name: "a child by id is started again for flags equal by Equal",
    guarantees: ["A parent's children are those its own state lists"],
    file: "src/compose.ts",
    from: "Equal.equals(found.value.key, key)",
    to: "found.value.key === key",
    killedBy: [
      ["src/compose.test.ts", "flags equal by Equal, a struct made anew at each call, keep a child by id"]
    ]
  },
  {
    name: "children by id are reconciled when their ids are the very same object",
    file: "src/compose.ts",
    from: "      if (Opt.isSome(before) && Object.is(now, listed(before.value))) continue\n",
    to: "",
    killedBy: [
      [
        "src/compose.test.ts",
        "children by id whose ids give the very same object are left as they are, and others are reconciled"
      ]
    ]
  },
  {
    name: "a step that changes nothing makes a new state",
    guarantees: ["A model is made only when it is read"],
    file: "src/compose.ts",
    from: "    const same = Object.is(gathered.own, was.own) && gathered.children === was.children &&\n",
    to: "    const same = false && gathered.children === was.children &&\n",
    killedBy: [
      ["src/compose.test.ts", "a step that changes nothing leaves the very same state"]
    ]
  },
  {
    name: "a child's step that keeps its state replaces its instance",
    guarantees: ["A model is made only when it is read"],
    file: "src/compose.ts",
    from: "    if (!Object.is(result.state, entry.state)) {\n",
    to: "    if (true) {\n",
    killedBy: [
      [
        "src/compose.test.ts",
        "a child's message that keeps its state keeps the parent's, its commands and events still going"
      ]
    ]
  },
  {
    name: "a child listens where listening does not hold",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/compose.ts",
    from: "            listening !== undefined && !(",
    to: "            false && !(",
    killedBy: [
      ["src/compose.test.ts", "without listening every child listens, and with it those where it holds"],
      ["src/compose.test.ts", "a row where listening does not hold runs no subscription, and still takes its messages"]
    ]
  },
  {
    name: "an external message to a child without external dies of a TypeError",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "      if (answer === undefined) {\n",
    to: "      if (false) {\n",
    killedBy: [
      ["src/compose.test.ts", "a child without external takes no external message from its parent"]
    ]
  },
  {
    name: "a child's command with no runCommand dies of a TypeError",
    guarantees: ["Nothing ends in silence"],
    file: "src/compose.ts",
    from: "        if (run === undefined) {\n",
    to: "        if (false) {\n",
    killedBy: [
      ["src/compose.test.ts", "a child's command that nothing interprets is a CompositionDefect naming the child"]
    ]
  },
  {
    name: "a write into an input by id goes to its place without its id",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/compose.ts",
    from: "inputById: (place: PlacementById<unknown, unknown, unknown>) => ({ kind: \"byId\", ...placedById(place) }),",
    to: "inputById: (place: PlacementById<unknown, unknown, unknown>) => ({ kind: \"one\", ...placedById(place) }),",
    killedBy: [
      ["src/input.test.ts", "stores a write at its id, and leaves the other rows and inputs as they are"],
      [
        "src/input.test.ts",
        "rejects a write at an id that is gone, and stores it into another row that came to the id"
      ],
      [
        "src/input.test.ts",
        "an input by id stores a write at its id through set, and rejects one at an id get does not find"
      ]
    ]
  },
  {
    name: "a write of the value held makes a new state",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/compose.ts",
    from: "    if (Object.is(value, held.value)) return { state, commands: [], events: [] }\n",
    to: "",
    killedBy: [
      ["src/input.test.ts", "leaves the very same state when the place holds it already"],
      ["src/input.test.ts", "equal by Equal to the value held, whatever it is made of, leaves the very value held"]
    ]
  },
  {
    name: "a write compares the value it stores by ===, which NaN never is of itself",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/compose.ts",
    from: "Object.is(value, held.value)",
    to: "value === held.value",
    killedBy: [
      ["src/input.test.ts", "a write of NaN over NaN leaves the very same state"]
    ]
  },
  {
    name: "stateOf leaves each child as it starts",
    file: "src/compose.ts",
    from: "        putAt(gathered, place, { ...entry, state: childState })\n",
    to: "",
    killedBy: [
      ["src/compose.test.ts", "it puts each child in the state given, and the others as they start"]
    ]
  },
  {
    name: "a write of the value an input holds makes a new state",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/input.ts",
    from: "  return Equal.equals(value, held) ? { state: held } : { state: value }",
    to: "  return { state: value }",
    // A primitive value equal to the one held is the very same: only a structure tells the two apart.
    killedBy: [
      ["src/input.test.ts", "equal by Equal to the value held, whatever it is made of, leaves the very value held"]
    ]
  },
  {
    name: "a write stores the value written, not the form its input declares",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/input.ts",
    from: "store === undefined ? message.value : store(message.value)",
    to: "message.value",
    killedBy: [
      ["src/input.test.ts", "is what a write stores, and the rest of the state is the place's to keep"],
      ["src/input.test.ts", "is called once a write, with the value written, and set is given exactly what it returns"],
      [
        "src/input.test.ts",
        "of inputs by id is the form of the write at each id, through an optic and through get and set"
      ],
      ["src/input.test.ts", "in a parent, a write in its form is a step on the parent's own state"],
      [
        "bridges/snabbdom.test.ts",
        "a value stored in another form than the one typed is shown by the element at once, which keeps the focus"
      ],
      [
        "bridges/react.test.ts",
        "a value stored in another form than the one typed is shown by the element at once, which keeps the focus"
      ]
    ]
  },
  {
    name: "a write compares the value written with the one held, not its stored form",
    guarantees: ["An input stores what is written, where its place is there"],
    file: "src/input.ts",
    from: "  return Equal.equals(value, held) ? { state: held } : { state: value }",
    to: "  return Equal.equals(message.value, held) ? { state: held } : { state: value }",
    killedBy: [
      [
        "src/input.test.ts",
        "equal by Equal to the value held, a structure, leaves the very value held, whatever was written"
      ]
    ]
  },
  {
    name: "a call of rehearse's hearNext is not among those its end tells",
    file: "src/testing/ledger.ts",
    from: "  calls: new Set([...ledger.calls, call])\n",
    to: "",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a call is among the calls from its offer until it leaves, whatever the loop has made of it"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext still waiting in a fiber the scenario did not join fails as the rehearsal ends"
      ]
    ]
  },
  {
    name: "simulate runs a command in the fiber of whoever runs it",
    file: "src/testing/simulate.ts",
    from: "const message = yield* runOne(deaths, command)",
    to: "const message = yield* Effect.suspend(() => runCommand(command)).pipe(scopedIn(deaths, 'command'))",
    killedBy: [
      ["src/testing/contract.test.ts", "begins its effect in simulate, as in the run"]
    ]
  },
  {
    name: "simulate forks a command without beginning it",
    file: "src/testing/simulate.ts",
    from: "deaths.recorded), {\n            startImmediately: true\n          })",
    to: "deaths.recorded))",
    killedBy: [
      ["src/testing/contract.test.ts", "begins its effect in simulate, as in the run"]
    ]
  },
  {
    name: "the run takes no interruption a command gets once its scope has closed for a defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "        rootedIn(\"command\"),\n        Effect.provideContext(context),\n",
    to: "        Effect.provideContext(context),\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "the run dies with a defect of a command a fiber of the program interrupts as it releases"
      ]
    ]
  },
  {
    name: "rehearse gives what the root of a command dies of only to the run that awaits it",
    file: "src/testing/rehearse.ts",
    from: "            rootedIn(\"command\"),\n            recorded,\n",
    to: "            rootedIn(\"command\"),\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, though the scenario catches it"
      ]
    ]
  },
  {
    name: "rehearse takes no interruption a command gets once its scope has closed for a defect",
    file: "src/testing/rehearse.ts",
    from: "            rootedIn(\"command\"),\n            recorded,\n",
    to: "            recorded,\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, though the scenario catches it"
      ]
    ]
  },
  {
    name: "the run takes no interruption a subscription gets once its scope has closed for a defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "          rootedIn(\"subscription\", () => ({ key })),\n",
    to: "",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "the run dies with a defect of a subscription a fiber of the program interrupts as it releases"
      ]
    ]
  },
  {
    name: "the run does not record what the root of a subscription dies of",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from:
      "          Effect.provideContext(context),\n          recorded,\n          FiberMap.run(subscriptionFibers, generation)\n",
    to: "          Effect.provideContext(context),\n          FiberMap.run(subscriptionFibers, generation)\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "the run dies with a defect of a subscription a fiber of the program interrupts as it releases"
      ]
    ]
  },
  {
    name: "rehearse interrupts a subscription that sends once it has ended",
    file: "src/testing/rehearse.ts",
    from: "      }, Effect.never)\n",
    to: "      })\n",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a subscription that sends as the end tells a call that its job was not done is no defect"
      ]
    ]
  },
  {
    name: "rehearse takes no interruption a subscription gets once its scope has closed for a defect",
    file: "src/testing/rehearse.ts",
    from: "        rootedIn(\"subscription\", () => ({ key })),\n",
    to: "",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, of a subscription a fiber of the program interrupts as it releases, though the scenario catches it"
      ]
    ]
  },
  {
    name: "rehearse does not record what the root of a subscription dies of",
    file: "src/testing/rehearse.ts",
    from: "        rootedIn(\"subscription\", () => ({ key })),\n        recorded,\n",
    to: "        rootedIn(\"subscription\", () => ({ key })),\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, of a subscription a fiber of the program interrupts as it releases, though the scenario catches it"
      ]
    ]
  },
  {
    name: "rehearse interrupts a command whose answer comes once it has ended",
    file: "src/testing/rehearse.ts",
    from: "}, Effect.succeed<Effect.Effect<void>>(Effect.void))",
    to: "})",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a command that answers as the end tells a call that its job was not done is no defect"
      ]
    ]
  },
  {
    name: "simulate does not record what the root of a command dies of",
    file: "src/testing/simulate.ts",
    from: "rootedIn(\"command\"), deaths.recorded)",
    to: "rootedIn(\"command\"))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, as whoever runs it interrupts it"
      ]
    ]
  },
  {
    name: "simulate takes no interruption a command gets once its scope has closed for a defect",
    file: "src/testing/simulate.ts",
    from: "rootedIn(\"command\"), deaths.recorded)",
    to: "deaths.recorded)",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect, as the run dies, of a command a fiber of the program interrupts as it releases, as whoever runs it interrupts it"
      ]
    ]
  },
  {
    name: "die takes the defect of init a dead handle threw for a defect of its own",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "    thrownToReaders.add(defect)\n    const dead",
    to: "    const dead",
    killedBy: [
      [
        "src/run.test.ts",
        "by a handle whose init threw, takes the defect model() threw as it is, and the run dies of it alone"
      ],
      [
        "bridges/snabbdom.test.ts",
        "by an init that threw, ends the run with the one defect of init"
      ]
    ]
  },
  {
    name: "die keeps in silence what it is given once the run has ended",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "    if (ended !== undefined && !ended.some((death) => death.defect === defect)) throw defect\n",
    to: "",
    killedBy: [
      [
        "src/run.test.ts",
        "once the run has ended, throws back what it is given, a defect in render that no cause holds"
      ],
      [
        "src/run.test.ts",
        "a model's defect a renderer gives to die once the run has ended is thrown back as it is"
      ]
    ]
  },
  {
    name: "die throws back what the run's cause holds",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "ended !== undefined && !ended.some((death) => death.defect === defect)",
    to: "ended !== undefined",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "by makeModel, ends the run at once, with one defect, in render, and the handler gets nothing"
      ]
    ]
  },
  {
    name: "the run ends without telling die",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "        end(read)\n",
    to: "",
    killedBy: [
      [
        "src/run.test.ts",
        "once the run has ended, throws back what it is given, a defect in render that no cause holds"
      ]
    ]
  },
  {
    name: "Host throws to React the defect of a model after the first",
    file: "bridges/react.ts",
    from: "      if (last === undefined) throw thrown\n",
    to: "      throw thrown\n",
    killedBy: [
      [
        "bridges/react.test.ts",
        "a makeModel that throws reaches the nearest error boundary, and is not reported again"
      ]
    ]
  },
  {
    name: "Host reports nothing of a death no render threw as it unmounts",
    file: "bridges/react.ts",
    from: "        report(set.error)\n",
    to: "",
    killedBy: [
      [
        "bridges/react.test.ts",
        "that dies as its parent removes Host, in one batch, reaches the boundary or reportError"
      ],
      [
        "bridges/react.test.ts",
        "that dies as Activity hides Host, in one batch, is reported once, and shown again starts anew"
      ]
    ]
  },
  {
    name: "Host keeps a death it reported as Activity hides it",
    file: "bridges/react.ts",
    from: "        setDied(undefined)\n",
    to: "",
    killedBy: [
      [
        "bridges/react.test.ts",
        "that dies as Activity hides Host, in one batch, is reported once, and shown again starts anew"
      ]
    ]
  },
  {
    name: "Host reports again as it unmounts a death a render threw",
    file: "bridges/react.ts",
    from: "    thrown.current = died\n",
    to: "",
    killedBy: [
      [
        "bridges/react.test.ts",
        "a makeModel that throws reaches the nearest error boundary, and is not reported again"
      ]
    ]
  },
  {
    name: "Host draws nothing for a first model that throws",
    file: "bridges/react.ts",
    from: "      if (last === undefined) throw thrown\n      return last.model\n",
    to: "      return last?.model as Model\n",
    killedBy: [
      [
        "bridges/react.test.ts",
        "a first model that throws reaches the nearest error boundary, and the run never starts"
      ]
    ]
  },
  {
    name: "Host gives React the model it read itself",
    file: "bridges/react.ts",
    from: "{ app: drawn, view: props.children }",
    to: "{ app, view: props.children }",
    killedBy: [
      [
        "bridges/react.test.ts",
        "a makeModel that throws reaches the nearest error boundary, and is not reported again"
      ]
    ]
  },
  {
    name: "rehearse's take leaves its command pending",
    file: "src/testing/ledger.ts",
    from: "pending: Arr.remove(ledger.pending, index),",
    to: "pending: ledger.pending,",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a take takes the oldest pending command the selection matches, under way under a ticket of its own"
      ]
    ]
  },
  {
    name: "rehearse's hearNext asks again for a message asked for and not heard",
    file: "src/testing/ledger.ts",
    from: "return hearing.asked >= waiting.length",
    to: "return false",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a call asks for a message, unless one asked for by a call that left is not heard yet"
      ]
    ]
  },
  {
    name: "rehearse's hearNext tells no call waiting as its start ends",
    file: "src/testing/ledger.ts",
    from: "ended: sent.last ? waiting : []",
    to: "ended: []",
    killedBy: [
      ["src/testing/ledger.test.ts", "the last message tells the calls still waiting, and only the last"]
    ]
  },
  {
    name: "rehearse's hearNext tells no call waiting on a start whose key went away",
    file: "src/testing/ledger.ts",
    from: "      stopped.push(...hearing.waiting)\n",
    to: "",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a start whose key went away is stopped and forgotten, and the calls waiting on it are told"
      ]
    ]
  },
  {
    name: "rehearse's hearNext starts a subscription for a call that left",
    file: "src/testing/ledger.ts",
    from: "  if (!ledger.asking.has(call)) return { _tag: \"Left\" }\n",
    to: "",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a call that left before the loop made it wait starts nothing, and waits on nothing"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext that left before the loop took its job starts nothing, and hear plays its key"
      ]
    ]
  },
  {
    name: "rehearse's hearNext makes a call that left wait",
    file: "src/testing/ledger.ts",
    from: "  if (!ledger.asking.has(call)) return [false, ledger]\n",
    to: "",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a call that left before the loop made it wait starts nothing, and waits on nothing"
      ]
    ]
  },
  {
    name: "rehearse's hearNext keeps a call that left waiting",
    file: "src/testing/ledger.ts",
    from: "    if (hearing._tag === \"Opened\" && hearing.waiting.includes(call)) {",
    to: "    if (false) {",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "a message is heard by the first call waiting, and waits for a call when none does"
      ]
    ]
  },
  {
    name: "a kept key starts again",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "if (HashMap.has(active.keys, key)) continue",
    to: "if (false) continue",
    // The rest of the suite hangs under it.
    killedBy: [
      ["src/core.test.ts", "a kept key keeps its start, and a gone key stops with its start"],
      ["src/core.test.ts", "a key equal by value, made anew, keeps its start"],
      ["src/engine.test.ts", "a key equal by value keeps its subscription running, untouched"],
      ["src/engine.test.ts", "it does not start again while its key stays"],
      ["src/compose.test.ts", "a child whose state changes, under the same key, keeps its subscription running"],
      [
        "src/testing/contract.test.ts",
        "rehearse's hearNext hears it as the run does, and nothing more until its key comes back"
      ],
      [
        "src/testing/rehearse.test.ts",
        "each call hears the next message, and the subscription waits between two of them"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a start the test played with hear is not run, until the key goes away and comes back"
      ]
    ]
  },
  {
    name: "an ended start is heard again while its key stays",
    file: "src/testing/ledger.ts",
    from: "ended: hearing.ended || sent.last",
    to: "ended: hearing.ended",
    killedBy: [
      [
        "src/testing/ledger.test.ts",
        "an opened start whose last message is heard has ended, and says so to hear and to hearNext"
      ],
      [
        "src/testing/ledger.test.ts",
        "an ended start stays ended while its key stays, and its key comes back not ended"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse's hearNext hears it as the run does, and nothing more until its key comes back"
      ]
    ]
  },
  {
    name: "a gone key keeps running",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/core.ts",
    from: "([key]) => !HashMap.has(listed, key))",
    to: "() => false)",
    killedBy: [
      ["src/core.test.ts", "a kept key keeps its start, and a gone key stops with its start"],
      ["src/testing/contract.test.ts", "in the run, the subscription whose key went away is interrupted"],
      [
        "src/engine.test.ts",
        "the stops of a state are awaited before any start of that state or a later one, and a key that comes back finds its old one released"
      ],
      ["src/engine.test.ts", "the next message does not wait for a release, which the effects of the next state do"]
    ]
  },
  {
    name: "simulate reconciles the keys of a state with none of the state before",
    file: "src/testing/simulate.ts",
    from: "Core.reconcile(listening.active, subscriptions(listening.current.state))",
    to: "Core.reconcile(Core.noneActive, subscriptions(listening.current.state))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, on a key whose Equal throws against the key of the state before"
      ]
    ]
  },
  {
    name: "simulate reads no subscriptions of a new state",
    file: "src/testing/simulate.ts",
    from: "return arrived.changed ? Effect.as(listen(listening), Opt.some(applied))",
    to: "return false ? Effect.as(listen(listening), Opt.some(applied))",
    killedBy: [
      ["src/testing/contract.test.ts", "simulate fails, as the run dies, on a state whose subscriptions are a defect"],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, on a key whose Equal throws against the key of the state before"
      ]
    ]
  },
  {
    name: "simulate closes a command's scope before its defect says where",
    file: "src/testing/simulate.ts",
    from: "effect.pipe(scopedIn(deaths, \"command\"), rootedIn",
    to: "effect.pipe(Effect.scoped, diesIn(\"command\"), rootedIn",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate gives, as the run does, what a command that dies releases its defect, in a command"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate gives, as the run does, what a command that interrupts itself releases a defect"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, of two defects on a release that dies of that of its command"
      ]
    ]
  },
  {
    name: "simulate takes a defect of what a command's scope releases for one of its own",
    file: "src/testing/simulate.ts",
    from: "effect.pipe(scopedIn(deaths, \"command\"), rootedIn",
    to: "effect.pipe(diesIn(\"command\"), Effect.scoped, rootedIn",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in a command on a release of a command that dies"
      ]
    ]
  },
  {
    name: "dispatchViolations takes a step that changes the state for one that does nothing",
    file: "src/testing/dispatch-violations.ts",
    from: "Equal.equals(step.state, state)\n  && ",
    to: "",
    killedBy: [
      ["src/testing/dispatch-violations.test.ts", "reports a message that changes the state again when sent twice"],
      ["src/testing/dispatch-violations.test.ts", "reports what update accepts and the model does not hold"]
    ]
  },
  {
    name: "dispatchViolations takes a step that starts a command for one that does nothing",
    file: "src/testing/dispatch-violations.ts",
    from: "\n  && (step.commands?.length ?? 0) === 0",
    to: "",
    killedBy: [
      [
        "src/testing/dispatch-violations.test.ts",
        "reports a message that starts a command again when sent twice, though the state stays the same"
      ],
      [
        "src/testing/dispatch-violations.test.ts",
        "reports a candidate that starts a command or raises an event, though the state stays the same"
      ]
    ]
  },
  {
    name: "dispatchViolations takes a step that raises an event for one that does nothing",
    file: "src/testing/dispatch-violations.ts",
    from: "\n  && (step.events?.length ?? 0) === 0",
    to: "",
    killedBy: [
      [
        "src/testing/dispatch-violations.test.ts",
        "reports a message that raises an event again when sent twice, unless it repeats on purpose"
      ],
      [
        "src/testing/dispatch-violations.test.ts",
        "reports a candidate that starts a command or raises an event, though the state stays the same"
      ]
    ]
  },
  {
    name: "dispatchViolations takes a candidate whose step does nothing for a control missing",
    file: "src/testing/dispatch-violations.ts",
    from: " && !doesNothing(step, state) && ",
    to: " && ",
    killedBy: [
      [
        "src/testing/dispatch-violations.test.ts",
        "leaves out a candidate whose step does nothing: the same state by Equal, a copy included"
      ],
      [
        "examples/pages/app.test.ts",
        "the model holds what update accepts, all of it, and each acts once when sent twice"
      ]
    ]
  },
  {
    name: "dispatchViolations compares a candidate with what the model holds by reference",
    file: "src/testing/dispatch-violations.ts",
    from: "(each) => Equal.equals(each, message)",
    to: "(each) => each === message",
    killedBy: [
      [
        "src/testing/dispatch-violations.test.ts",
        "ignores what update rejects, and what the model holds, compared by value"
      ]
    ]
  },
  {
    name: "placeViolations lets a set that changes more than its place pass",
    file: "src/testing/place-violations.ts",
    from: "...(Equal.equals(set(state, held.value), state) ? [] : [{ _tag: \"Changes\" as const, state, ...named }]),",
    to: "",
    killedBy: [
      ["src/testing/place-violations.test.ts", "reports Changes for a set that marks the state at each write"],
      ["src/testing/place-violations.test.ts", "reports Changes and Remembers for a set that counts the writes"]
    ]
  },
  {
    name: "placeViolations lets a set that stores another value than it is given pass",
    file: "src/testing/place-violations.ts",
    from: "Equal.equals(get(after), Opt.some(value))",
    to: "true",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "reports StoresAnother for a set that stores another form, on the values that are not their own form"
      ],
      [
        "src/testing/place-violations.test.ts",
        "reports StoresAnother for a get that reads another place than its set writes"
      ],
      ["src/testing/place-violations.test.ts", "reports StoresAnother for a set that writes the row after"]
    ]
  },
  {
    name: "placeViolations lets a set at an id that changes another id pass",
    file: "src/testing/place-violations.ts",
    from: "...reached(state, after, value),",
    to: "",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "reports ReachesAnother for a set that writes every row, where the three laws pass on rows that hold one value"
      ]
    ]
  },
  {
    name: "placeViolations lets a set that keeps something of an earlier write pass",
    file: "src/testing/place-violations.ts",
    from: "Equal.equals(set(after, second), set(state, second))",
    to: "true",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "reports Remembers for a set that marks the state only on another value, by the write back of the value held"
      ],
      ["src/testing/place-violations.test.ts", "reports Remembers alone for a set that keeps the value that was there"],
      ["src/testing/place-violations.test.ts", "reports Changes and Remembers for a set that counts the writes"]
    ]
  },
  {
    name: "placeViolations writes back only the values given, not the value held",
    file: "src/testing/place-violations.ts",
    from: "? values : [...values, held.value]",
    to: "? values : values",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "reports Remembers for a set that marks the state only on another value, by the write back of the value held"
      ]
    ]
  },
  {
    name: "placeViolations checks a state where the place is not there",
    file: "src/testing/place-violations.ts",
    from: "if (Opt.isNone(held)) return []",
    to: "if (false) return []",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "checks nothing in a state where the place is not there, and returns no violation"
      ]
    ]
  },
  {
    name: "placeViolations takes an id equal to the one written for another, by reference",
    file: "src/testing/place-violations.ts",
    from: "!Equal.equals(other, id)",
    to: "other !== id",
    killedBy: [
      [
        "src/testing/place-violations.test.ts",
        "compares the ids with Equal: an id equal to the one written is no other"
      ]
    ]
  },
  {
    name: "placeViolations compares the state a set leaves by reference",
    file: "src/testing/place-violations.ts",
    from: "Equal.equals(set(state, held.value), state)",
    to: "set(state, held.value) === state",
    killedBy: [
      ["src/testing/place-violations.test.ts", "compares states and values with Equal, not by reference"],
      ["src/testing/place-violations.test.ts", "passes a get and a set that change the place alone"]
    ]
  },
  {
    name: "scopedIn leaves what its effect dies of without a site",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "self.pipe(diesIn(where, details, () => false, Core.byTheRun), deaths.recorded, Scope.provide(scope))",
    to: "self.pipe(deaths.recorded, Scope.provide(scope))",
    killedBy: [
      ["src/engine.test.ts", "what a command dies of as the end of the engine interrupts it is what the end dies of"],
      ["src/run.test.ts", "a defect in a subscription ends the run, which dies with it and with where it happened"],
      ["src/run.test.ts", "a defect in a command ends the run, which dies with it and with where it happened"]
    ]
  },
  {
    name: "scopedIn leaves what the release dies of without a site",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "return Scope.close(scope, exit).pipe(\n"
      + "              diesIn(\n"
      + "                where,\n"
      + "                details,\n"
      + "                (defect) => own.reasons.some((reason) => Cause.isDieReason(reason) && reason.defect === defect),\n"
      + "                Core.byTheRun\n"
      + "              ),\n",
    to: "return Scope.close(scope, exit).pipe(\n",
    killedBy: [
      ["src/run.test.ts", "a subscription whose release dies applies messages until its scope has released all"],
      ["src/run.test.ts", "a command whose release dies as an interrupted run stops it is in the cause, in command"],
      ["src/run.test.ts", "a command whose release dies as a run that died elsewhere stops it is in the cause"]
    ]
  },
  {
    name: "a defect of subscriptions in simulate has no site",
    file: "src/testing/simulate.ts",
    from: "    }).pipe(diesIn(\"subscriptions\"))",
    to: "    })",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, on a key whose Equal throws against the key of the state before"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in subscriptions on those of the state it starts from"
      ]
    ]
  },
  {
    name: "a runCommand that throws before its effect in simulate has no site",
    file: "src/testing/simulate.ts",
    from: "      Effect.sync(() => runCommand(command)).pipe(\n        diesIn(\"command\"),\n",
    to: "      Effect.sync(() => runCommand(command)).pipe(\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in a command on a runCommand that throws before its effect"
      ]
    ]
  },
  {
    name: "a defect of a command in simulate is a subscription's",
    file: "src/testing/simulate.ts",
    from: "effect.pipe(scopedIn(deaths, \"command\"), rootedIn",
    to: "effect.pipe(scopedIn(deaths, \"subscription\"), rootedIn",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect, as the run dies, on a command interrupting itself"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect of a command interrupting itself as whoever runs it interrupts it"
      ],
      [
        "src/testing/contract.test.ts",
        "simulate fails with a defect of a command joining, as it is stopped, a fiber its interrupter interrupted"
      ],
      ["src/testing/contract.test.ts", "simulate fails, as the run dies, in a command on a command that dies"],
      [
        "src/testing/contract.test.ts",
        "simulate fails, as the run dies, in a command on a release of a command that dies"
      ]
    ]
  },
  {
    name: "a report leaves the defects it reported to be reported again",
    guarantees: ["Nothing ends in silence"],
    file: "src/core.ts",
    from: "[Opt.some(Cause.fromReasons<never>(dies)), { ...register, reported: register.deaths.length }]",
    to: "[Opt.some(Cause.fromReasons<never>(dies)), register]",
    killedBy: [
      ["src/core.test.ts", "reports each defect once, those since the last report, in order"]
    ]
  },
  {
    name: "a death recorded signals nobody",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "    else Deferred.doneUnsafe(died, Exit.void)\n",
    to: "",
    killedBy: [
      ["src/run.test.ts", "a defect in a command ends the run, which dies with it and with where it happened"],
      [
        "src/run.test.ts",
        "a model read outside any fiber is recorded in render, and the reader gets the defect recorded"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a run waiting for its command fails as soon as another fiber of the test's dies"
      ]
    ]
  },
  {
    name: "a death recorded while a call applies signals nobody",
    guarantees: ["Nothing ends in silence"],
    file: "src/shell.ts",
    from: "      owed = false\n      Deferred.doneUnsafe(died, Exit.void)\n",
    to: "      owed = false\n",
    killedBy: [
      [
        "src/run.test.ts",
        "a defect of update in a dispatch is never thrown to the caller, and the run dies of it in update"
      ]
    ]
  },
  {
    name: "simulate stops an interrupted command with no mark of its own",
    file: "src/testing/simulate.ts",
    from: "                stopping(fiber),\n",
    to: "                Fiber.interrupt(fiber),\n",
    killedBy: [
      ["src/testing/simulate.test.ts", "interrupted while a command runs, it ends interrupted, with no defect"]
    ]
  },
  {
    name: "a description follows a wrapped message that is not tagged",
    file: "src/log.ts",
    from: "Predicate.hasProperty(value, \"message\") && tagOf(value.message) !== undefined",
    to: "Predicate.hasProperty(value, \"message\")",
    killedBy: [
      ["src/log.test.ts", "never by a field named message that holds data"]
    ]
  },
  {
    name: "a description follows a wrapped command that is not tagged",
    file: "src/log.ts",
    from: "Predicate.hasProperty(value, \"command\") && tagOf(value.command) !== undefined",
    to: "Predicate.hasProperty(value, \"command\")",
    killedBy: [
      ["src/log.test.ts", "never by a field named command that holds data"]
    ]
  },
  // The engine and the run (`docs/records/synchronous-dispatch.md`, stage 1): each check of the spike's table ("Each
  // check taken out by hand"), and each place a defect is told where it happened (`diesIn`, and `scopedIn`, which calls
  // it), which has a mutation that takes its site out, or gives it another, in each testing tool too
  // (`docs/invariants.md`).
  {
    name: "the thunk calls update after the first defect",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "() => Core.arrive(update, before, active, source, message, dead),",
    to: "() => Core.arrive(update, before, active, source, message, () => false),",
    killedBy: [
      ["src/engine.test.ts", "from the first defect on, no update is called, on a subscription's message either"],
      [
        "src/engine.test.ts",
        "a defect of update in a dispatch is recorded in update, never thrown to the caller, and no update follows"
      ]
    ]
  },
  {
    name: "the thunk drops a message against the starts the fiber of effects made, not the keys of the current state",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/engine.ts",
    from: "() => Core.arrive(update, before, active, source, message, dead),",
    to:
      "() => Core.arrive(update, before, { ...active, starts: new Set(Array.from(subscriptionFibers, ([generation]) => "
      + "generation)) }, source, message, dead),",
    killedBy: [
      [
        "src/engine.test.ts",
        "a start whose key went away before the fiber of effects started it sends nothing that reaches update"
      ]
    ]
  },
  {
    name: "a message sent while another is applied is applied inside it",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "    if (applying) return\n",
    to: "",
    killedBy: [
      [
        "src/engine.test.ts",
        "a message a listener sends is applied after every listener has been told of the step, before the dispatch returns"
      ]
    ]
  },
  {
    name: "the thunk goes on applying once the end has stopped the engine",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "while (!stopped && pending.length > 0)",
    to: "while (pending.length > 0)",
    killedBy: [
      [
        "src/run.test.ts",
        "a dispatch from a plain callback after the run has ended applies nothing, and throws nothing"
      ],
      ["src/engine.test.ts", "once the end has stopped the engine, nothing sent is applied"],
      ["src/run.test.ts", "a message a command sends as the run releases it does not reach update"]
    ]
  },
  {
    name: "a throw of the program in the thunk reaches whoever sent the message",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "      recordThrown(deaths, where, thrown, details, wrapped)\n      return Opt.none()\n",
    to: "      throw thrown\n",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of update in a dispatch is recorded in update, never thrown to the caller, and no update follows"
      ],
      [
        "src/engine.test.ts",
        "a defect of onApplied in a dispatch is recorded in onApplied, never thrown to the caller, and no update follows"
      ],
      [
        "src/run.test.ts",
        "a defect of update in a dispatch is never thrown to the caller, and the run dies of it in update"
      ]
    ]
  },
  {
    name: "what the thunk records of a throw has no site",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "const cause = Core.wrapDefects(Cause.die(thrown), where, said, wrapped)",
    to: "const cause = Cause.die(thrown)",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of update in a dispatch is recorded in update, never thrown to the caller, and no update follows"
      ],
      [
        "src/run.test.ts",
        "a model read outside any fiber is recorded in render, and the reader gets the defect recorded"
      ]
    ]
  },
  {
    name: "a defect of update in the thunk is one of subscriptions",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "      \"update\",\n",
    to: "      \"subscriptions\",\n",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of update in a dispatch is recorded in update, never thrown to the caller, and no update follows"
      ],
      ["src/engine.test.ts", "a defect of update in a subscription's message is in update, never in the subscription"],
      ["src/run.test.ts", "defect in update dies in update, on its message, with the InvariantDefect as its cause"]
    ]
  },
  {
    name: "a defect of update in the thunk does not say its message",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "      () => ({ on: describeByTag(message) })\n",
    to: "",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of update in a command's answer is in update, with the message, never in the command"
      ],
      ["src/run.test.ts", "a defect in update says which message it was given, by its tags, in its message too"]
    ]
  },
  {
    name: "a defect of onApplied in the thunk is one of onIgnored",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "attempt(\"onApplied\", () => onApplied(applied))",
    to: "attempt(\"onIgnored\", () => onApplied(applied))",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of onApplied in a dispatch is recorded in onApplied, never thrown to the caller, and no update follows"
      ]
    ]
  },
  {
    name: "a defect of onIgnored in the thunk is one of onApplied",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "attempt(\"onIgnored\", () => onIgnored(ignored))",
    to: "attempt(\"onApplied\", () => onIgnored(ignored))",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of onIgnored in a dispatch is recorded in onIgnored, never thrown to the caller, and no update follows"
      ]
    ]
  },
  {
    name: "the options hear a message dropped before update",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/engine.ts",
    from: "      case \"Dead\":\n      case \"Dropped\":\n        return\n      case \"Ignored\": {\n",
    to: "      case \"Dead\":\n        return\n      case \"Dropped\":\n      case \"Ignored\": {\n",
    killedBy: [
      ["src/run.test.ts", "neither onApplied nor onIgnored hears what a subscription sends once its key went away"]
    ]
  },
  {
    name: "a defect of subscriptions in the thunk is one of update",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "attempt(\"subscriptions\", () => Core.reconcile(active, subscriptions(next.state)))",
    to: "attempt(\"update\", () => Core.reconcile(active, subscriptions(next.state)))",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of subscriptions in a dispatch is recorded in subscriptions, never thrown to the caller, and no update follows"
      ],
      ["src/run.test.ts", "a key whose Equal throws dies in subscriptions"]
    ]
  },
  {
    name: "a defect of subscriptions on the first state is one of update",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "attempt(\"subscriptions\", () => Core.reconcile(Core.noneActive",
    to: "attempt(\"update\", () => Core.reconcile(Core.noneActive",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of subscriptions on the first state dies in subscriptions, as the engine is made"
      ],
      ["src/run.test.ts", "a key whose Hash throws dies in subscriptions"]
    ]
  },
  {
    name: "a defect of a listener is a command's",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "attempt(\"render\", listener, undefined, rendered)",
    to: "attempt(\"command\", listener, undefined, rendered)",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener that throws on a command's answer dies in render, and the command ends as it should"
      ],
      [
        "src/run.test.ts",
        "a listener that throws on a command's answer dies in render, and the command ends as it should"
      ]
    ]
  },
  {
    name: "the step goes on past a defect of onApplied",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "if (Opt.isNone(attempt(\"onApplied\", () => onApplied(applied)))) return",
    to: "attempt(\"onApplied\", () => onApplied(applied))",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of onApplied in a dispatch is recorded in onApplied, never thrown to the caller, and no update follows"
      ]
    ]
  },
  {
    name: "the step goes on past a defect of subscriptions",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "        if (Opt.isNone(reconciled)) return\n",
    to: "",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of subscriptions in a dispatch is recorded in subscriptions, never thrown to the caller, and no update follows"
      ]
    ]
  },
  {
    name: "the listeners are told before the new state is current",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "        current = next\n",
    to: "        if (changed) tell()\n        current = next\n",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener is told of each new state, once it is current, never of the very same one, until it stops"
      ],
      ["src/run.test.ts", "a listener is told of each new state, and a model read in it is of the latest state"]
    ]
  },
  {
    name: "a listener stopped is kept",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "        listeners.delete(entry)\n",
    to: "",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener is told of each new state, once it is current, never of the very same one, until it stops"
      ],
      ["src/run.test.ts", "of what a thousand rounds used, a collection leaves a few at most while the run goes on"]
    ]
  },
  {
    name: "the very same state tells the listeners",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "        if (!changed) return queue({ gone: [], fresh: [], commands })\n",
    to: "",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener is told of each new state, once it is current, never of the very same one, until it stops"
      ]
    ]
  },
  {
    name: "the fiber of effects starts the keys of a job before its gone keys are released",
    guarantees: ["Subscriptions follow their keys", "Nothing outlives what acquired it"],
    file: "src/engine.ts",
    from: "onSome: stopping }))",
    to: "onSome: (fiber) => Effect.forkDetach(stopping(fiber)) }))",
    killedBy: [
      [
        "src/engine.test.ts",
        "the stops of a state are awaited before any start of that state or a later one, and a key that comes back finds its old one released"
      ]
    ]
  },
  {
    name: "the fiber of effects releases the gone keys of a job one after the other",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/engine.ts",
    from: "      { concurrency: \"unbounded\", discard: true }\n",
    to: "      { discard: true }\n",
    killedBy: [
      ["src/engine.test.ts", "keys that go away together are stopped together, not one after the other"]
    ]
  },
  {
    name: "each job runs in a fiber of its own",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "while (true) yield* perform(yield* Queue.take(queued))",
    to: "while (true) yield* Effect.forkChild(perform(yield* Queue.take(queued)))",
    killedBy: [
      [
        "src/engine.test.ts",
        "takes the jobs one at a time, in the order of the states: none starts while the job before is held"
      ]
    ]
  },
  {
    name: "the queue of the jobs is bounded",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "Queue.unbounded<Job<Message, Command, R, K>>()",
    to: "Queue.bounded<Job<Message, Command, R, K>>(1)",
    killedBy: [
      [
        "src/engine.test.ts",
        "takes the jobs one at a time, in the order of the states: none starts while the job before is held"
      ]
    ]
  },
  {
    name: "a job starts its commands before it stops its gone keys",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "  const perform = Effect.fnUntraced(function*({ gone, fresh, commands }: Job<Message, Command, R, K>) {\n",
    to: "  const perform = Effect.fnUntraced(function*({ gone, fresh, commands }: Job<Message, Command, R, K>) {\n"
      + "    yield* Effect.forEach(commands, runCommand, { discard: true })\n",
    killedBy: [
      [
        "src/engine.test.ts",
        "the end stops the fiber of effects held by a release, which starts nothing after, nor any job it had not taken"
      ]
    ]
  },
  {
    name: "a step that only stops subscriptions offers no job",
    guarantees: ["Subscriptions follow their keys"],
    file: "src/engine.ts",
    from: "job.gone.length > 0 || job.fresh.length > 0",
    to: "job.fresh.length > 0",
    killedBy: [
      ["src/engine.test.ts", "keys that go away together are stopped together, not one after the other"],
      ["src/engine.test.ts", "what a subscription acquires (Channel.fromEffect) is released when its key goes away"]
    ]
  },
  {
    name: "a step that only starts commands offers no job",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/engine.ts",
    from: "job.fresh.length > 0 || job.commands.length > 0",
    to: "job.fresh.length > 0",
    killedBy: [
      ["src/engine.test.ts", "its commands still run"],
      ["src/engine.test.ts", "a command's scope closes before its answer is applied"]
    ]
  },
  {
    name: "a defect of a command of the engine is a subscription's",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "scopedIn(deaths, \"command\"),",
    to: "scopedIn(deaths, \"subscription\"),",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of a command dies in the command, and one of a subscription in the subscription, with its key"
      ],
      ["src/run.test.ts", "a command that interrupts itself is a defect in the command"]
    ]
  },
  {
    name: "a defect of a subscription of the engine is a command's",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "scopedIn(deaths, \"subscription\", () => ({ key })),",
    to: "scopedIn(deaths, \"command\", () => ({ key })),",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of a command dies in the command, and one of a subscription in the subscription, with its key"
      ]
    ]
  },
  {
    name: "a defect of a subscription of the engine does not say its key",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "scopedIn(deaths, \"subscription\", () => ({ key })),",
    to: "scopedIn(deaths, \"subscription\"),",
    killedBy: [
      [
        "src/engine.test.ts",
        "a defect of a command dies in the command, and one of a subscription in the subscription, with its key"
      ],
      ["src/run.test.ts", "a defect in a subscription carries its key"]
    ]
  },
  {
    name: "the end of the engine leaves its fibers to the close of their sets",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/engine.ts",
    from: "return Effect.forEach(running, stopping, { concurrency: \"unbounded\", discard: true }).pipe(",
    to: "return Effect.void.pipe(",
    killedBy: [
      ["src/run.test.ts", "a run interrupted by whoever runs it is no defect"]
    ]
  },
  {
    name: "the end of the engine stops its fibers one after the other",
    guarantees: ["Nothing outlives what acquired it"],
    file: "src/engine.ts",
    from: "Effect.forEach(running, stopping, { concurrency: \"unbounded\", discard: true })",
    to: "Effect.forEach(running, stopping, { discard: true })",
    killedBy: [
      ["src/engine.test.ts", "the end of the engine interrupts its commands and its subscriptions at once"]
    ]
  },
  {
    name: "the end of the engine does not report what its fibers died of",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "          Effect.andThen(report)\n",
    to: "",
    killedBy: [
      ["src/engine.test.ts", "what a command dies of as the end of the engine interrupts it is what the end dies of"]
    ]
  },
  {
    name: "a model is made again for the state it was made for",
    guarantees: ["A model is made only when it is read"],
    file: "src/run.ts",
    from: "Opt.isSome(last) && last.value.state === state ? last.value : make(state)",
    to: "make(state)",
    killedBy: [
      ["src/run.test.ts", "a model is made only when read, once for each state"],
      ["src/run.test.ts", "a second read of the same state throws the same defect, recorded once"]
    ]
  },
  {
    name: "a model is taken as made of a state that is undefined before any is made",
    guarantees: ["A model is made only when it is read"],
    file: "src/run.ts",
    from: "Opt.isSome(last) && last.value.state === state",
    to: "Opt.getOrUndefined(last)?.state === state",
    killedBy: [
      ["src/run.test.ts", "a model is made of a state that is undefined, as only a cast or plain JavaScript writes it"]
    ]
  },
  {
    name: "a model's defect is not recorded where the model is read",
    guarantees: ["Nothing ends in silence", "A model is made only when it is read"],
    file: "src/run.ts",
    from: "const defect = Engine.recordThrown(deaths, \"render\", thrown)",
    to: "const defect = thrown",
    killedBy: [
      [
        "src/run.test.ts",
        "a model read outside any fiber is recorded in render, and the reader gets the defect recorded"
      ]
    ]
  },
  {
    name: "a model's defect is recorded in another site than render",
    guarantees: ["Nothing ends in silence", "A model is made only when it is read"],
    file: "src/run.ts",
    from: "const defect = Engine.recordThrown(deaths, \"render\", thrown)",
    to: "const defect = Engine.recordThrown(deaths, \"update\", thrown)",
    killedBy: [
      [
        "src/run.test.ts",
        "a model read outside any fiber is recorded in render, and the reader gets the defect recorded"
      ],
      ["src/run.test.ts", "a model read before the run starts is one defect, in render, and the run dies of it"]
    ]
  },
  {
    name: "die wraps again the defect a model recorded",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "Engine.recordThrown(deaths, \"render\", thrown, undefined, isThrown)",
    to: "Engine.recordThrown(deaths, \"render\", thrown)",
    killedBy: [
      ["src/run.test.ts", "a model's defect a renderer gives to die is one defect, in render"]
    ]
  },
  {
    name: "what a renderer gives to die is a defect of a command",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "Engine.recordThrown(deaths, \"render\", thrown, undefined, isThrown)",
    to: "Engine.recordThrown(deaths, \"command\", thrown, undefined, isThrown)",
    killedBy: [
      [
        "src/run.test.ts",
        "what a renderer gives to die is a defect in render: the program applies nothing after, and its run dies of it"
      ]
    ]
  },
  {
    name: "a listener's site wraps again the defect a model recorded",
    guarantees: ["Nothing ends in silence", "A model is made only when it is read"],
    file: "src/run.ts",
    from: "    rendered: isThrown,\n",
    to: "",
    killedBy: [
      ["src/run.test.ts", "a listener that reads a model that throws, and throws it, is one defect, in render"]
    ]
  },
  {
    name: "a defect of init is one of update",
    guarantees: ["Nothing ends in silence"],
    file: "src/run.ts",
    from: "Engine.recordThrown(deaths, \"init\", thrown)",
    to: "Engine.recordThrown(deaths, \"update\", thrown)",
    killedBy: [
      [
        "src/start.test.ts",
        "in init: the handle is made, model() throws the defect in init, nothing is applied, and run dies of it"
      ]
    ]
  },
  {
    name: "forwardTo holds a child's dispatch strongly",
    file: "src/dispatch.ts",
    from: "const entry: Entry = { key, ref: new WeakRef(wrapping) }",
    to: "const entry: Entry = { key, ref: { deref: () => wrapping } as never }",
    killedBy: [
      ["src/dispatch.test.ts", "keeps nothing for the ids nobody holds"],
      ["src/dispatch.test.ts", "lets go of what a long list held once the list is no longer drawn"],
      ["src/dispatch.test.ts", "lets go of collected dispatches without comparing ids again"]
    ]
  },
  {
    name: "forwardTo lets go of an entry whose dispatch is alive",
    file: "src/dispatch.ts",
    from: "const at = bucket?.indexOf(entry) ?? -1",
    to: "const at = bucket === undefined ? -1 : 0",
    killedBy: [
      ["src/dispatch.test.ts", "keeps the entry of a new dispatch made for the id of a collected one"]
    ]
  },
  {
    name: "forwardTo makes a child's dispatch anew each time",
    file: "src/dispatch.ts",
    from: "  if (found !== undefined) return found as ChildDispatch<Message, Name>\n",
    to: "",
    killedBy: [
      [
        "src/dispatch.test.ts",
        "gives a function someone holds every time it is asked for, through collections and new ids"
      ],
      ["src/dispatch.test.ts", "keeps the entry of a new dispatch made for the id of a collected one"],
      ["src/dispatch.test.ts", "tells ids apart by value, as subscription keys are"],
      ["src/compose.test.ts", "one dispatch for the whole run, and the same dispatch for a child each time it is drawn"]
    ]
  },
  {
    name: "a dispatch applies its message after it returns",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "    dispatch: (message) => apply(message, Core.fromDispatch),",
    to: "    dispatch: (message) => void queueMicrotask(() => apply(message, Core.fromDispatch)),",
    killedBy: [
      ["src/engine.test.ts", "the next message does not wait for a release, which the effects of the next state do"],
      [
        "src/engine.test.ts",
        "when it returns, update and onApplied have heard it, and the current state is the one it made"
      ],
      [
        "src/run.test.ts",
        "model() is the model of the current state, at once after a dispatch, and a rejected message leaves it"
      ],
      [
        "src/run.test.ts",
        "hears every accepted message in order, with the states around it, before the dispatch returns"
      ],
      ["src/run.test.ts", "a message that update rejects is ignored, and the program goes on"]
    ]
  },
  {
    name: "a command's answer and a subscription's message are applied after the call that sends them",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "(message: Message) => Effect.sync(() => apply(message, source))",
    to: "(message: Message) => Effect.sync(() => void queueMicrotask(() => apply(message, source)))",
    killedBy: [
      ["src/engine.test.ts", "a command's answer and a subscription's message are applied in the call that sends them"]
    ]
  },
  {
    name: "a listener that throws keeps the others from being told",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "if (listeners.has(listener)) attempt(\"render\", listener, undefined, rendered)",
    to: "if (listeners.has(listener) && Opt.isNone(attempt(\"render\", listener, undefined, rendered))) return",
    killedBy: [
      [
        "src/engine.test.ts",
        "defects are recorded in the order they happened, and a listener that throws leaves the others told"
      ]
    ]
  },
  {
    name: "a listener stopped during a notice is still told of it",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "if (listeners.has(listener)) attempt(",
    to: "attempt(",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener stopped during a notice is not told of it, and one added during a notice is told from the next"
      ]
    ]
  },
  {
    name: "a listener added during a notice is told of it",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "for (const listener of Array.from(listeners)) {",
    to: "for (const listener of listeners) {",
    killedBy: [
      [
        "src/engine.test.ts",
        "a listener stopped during a notice is not told of it, and one added during a notice is told from the next"
      ]
    ]
  },
  // The engine in two halves (`docs/records/store-and-effects.md`): the register held while a call applies, the jobs
  // offered as the outermost call returns, the `catch` of its loop, and a program started that is run once.
  {
    name: "the end of the run may begin inside a step",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "    deaths.hold()\n",
    to: "",
    killedBy: [
      [
        "src/start.test.ts",
        "never begins inside a step: a defect a listener throws ends the run once every listener of the step is told"
      ]
    ]
  },
  {
    name: "the jobs of a call are not offered as it returns",
    guarantees: ["One message at a time, in the order they were sent"],
    file: "src/engine.ts",
    from: "      offer()\n      deaths.release()\n",
    to: "      deaths.release()\n",
    killedBy: [
      ["src/engine.test.ts", "a step applied before the first defect goes on whole: its commands still start"],
      [
        "src/run.test.ts",
        "what a subscription acquires is released when its key goes away, apart from the next message"
      ]
    ]
  },
  {
    name: "what the loop of apply meets thrown outside the program reaches whoever sent the message",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "      deaths.record(Cause.die(thrown))\n    } finally {",
    to: "      throw thrown\n    } finally {",
    killedBy: [
      [
        "src/start.test.ts",
        "what the thunk throws outside every site is recorded as it is, after the defect it was saying, never thrown to the sender, and ends the run"
      ]
    ]
  },
  {
    name: "a defect whose details throw is lost",
    guarantees: ["Nothing ends in silence"],
    file: "src/engine.ts",
    from: "    deaths.record(Core.wrapDefects(Cause.die(thrown), where, {}, wrapped))\n    throw failed\n",
    to: "    throw failed\n",
    killedBy: [
      [
        "src/start.test.ts",
        "what the thunk throws outside every site is recorded as it is, after the defect it was saying, never thrown to the sender, and ends the run"
      ]
    ]
  },
  {
    name: "a program started is run twice",
    file: "src/run.ts",
    from: "    if (begun) return Effect.die(",
    to: "    if (begun && false) return Effect.die(",
    killedBy: [
      ["src/start.test.ts", "is run once: a second run dies, and the first goes on"]
    ]
  },
  // The testing tools (`docs/records/synchronous-dispatch.md`, stage 2).
  {
    name: "the thunk of rehearse records a defect of update in subscriptions",
    file: "src/testing/rehearse.ts",
    from: "recordThrown(register, \"update\", thrown, () => ({ on: describeByTag(message) }))",
    to: "recordThrown(register, \"subscriptions\", thrown, () => ({ on: describeByTag(message) }))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in update, with its message, on an update that throws"
      ]
    ]
  },
  {
    name: "the thunk of rehearse records a defect of update without its message",
    file: "src/testing/rehearse.ts",
    from: "recordThrown(register, \"update\", thrown, () => ({ on: describeByTag(message) }))",
    to: "recordThrown(register, \"update\", thrown)",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in update, with its message, on an update that throws"
      ]
    ]
  },
  {
    name: "rehearse dies with no site for a defect of init",
    file: "src/testing/rehearse.ts",
    from: ".pipe(diesIn(\"init\"))",
    to: "",
    killedBy: [
      ["src/testing/contract.test.ts", "rehearse fails, as the run dies, in init, on an init that throws on its flags"]
    ]
  },
  {
    name: "the thunk of rehearse records a defect of a later model in update",
    file: "src/testing/rehearse.ts",
    from: "            recordThrown(register, \"render\", thrown)\n          }\n",
    to: "            recordThrown(register, \"update\", thrown)\n          }\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in render, on a makeModel that throws on a later state"
      ]
    ]
  },
  {
    name: "the thunk of rehearse stops its step at a defect of a later model",
    file: "src/testing/rehearse.ts",
    from: "            recordThrown(register, \"render\", thrown)\n          }\n",
    to: "            recordThrown(register, \"render\", thrown)\n            return deadOutcome\n          }\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse applies the message whose model dies whole, as the run does, its commands owed"
      ]
    ]
  },
  {
    name: "the thunk of rehearse makes the model before it reads the subscriptions",
    file: "src/testing/rehearse.ts",
    from: "          if (!changed) return queued(jobOf([], [], owed, hearer))\n",
    to: "          if (!changed) return queued(jobOf([], [], owed, hearer))\n"
      + "          try {\n"
      + "            shown = program.makeModel(next.state)\n"
      + "          } catch (thrown) {\n"
      + "            recordThrown(register, \"render\", thrown)\n"
      + "          }\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails in subscriptions first, as the run dies, on a state whose model is a defect too"
      ]
    ]
  },
  {
    name: "the thunk of rehearse records a defect of subscriptions in update",
    file: "src/testing/rehearse.ts",
    from: "            recordThrown(register, \"subscriptions\", thrown)\n            return deadOutcome",
    to: "            recordThrown(register, \"update\", thrown)\n            return deadOutcome",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, on a key whose Equal throws against the key of the state before"
      ]
    ]
  },
  {
    name: "the thunk of rehearse offers the job of a state whose subscriptions are a defect",
    file: "src/testing/rehearse.ts",
    from: "            recordThrown(register, \"subscriptions\", thrown)\n            return deadOutcome",
    to:
      "            recordThrown(register, \"subscriptions\", thrown)\n            return queued(jobOf([], [], owed, hearer))",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a state whose subscriptions are a defect owes no command, as the run starts none"
      ]
    ]
  },
  {
    name: "rehearse records a defect of a key's Equal, looked up for a call, in update",
    file: "src/testing/rehearse.ts",
    from: "        recordThrown(register, \"subscriptions\", thrown)\n        return deadOr(Effect.never)",
    to: "        recordThrown(register, \"update\", thrown)\n        return deadOr(Effect.never)",
    killedBy: [
      ["src/testing/rehearse.test.ts", "dies in subscriptions when a key's Equal throws, as the run does"]
    ]
  },
  {
    name: "rehearse dies with no site for a defect of the subscriptions of the first state",
    file: "src/testing/rehearse.ts",
    from: "    } catch (thrown) {\n      recordThrown(register, \"subscriptions\", thrown)\n    }\n",
    to: "    } catch (thrown) {\n      throw thrown\n    }\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in subscriptions on those of the state it starts from"
      ]
    ]
  },
  {
    name: "rehearse dies with no site for a defect of the first model",
    file: "src/testing/rehearse.ts",
    from: "      recordThrown(register, \"render\", thrown)\n      return Opt.none()\n",
    to: "      throw thrown\n",
    killedBy: [
      ["src/testing/contract.test.ts", "rehearse fails in render, as the run dies"]
    ]
  },
  {
    name: "rehearse stops at the keys of the first state, before its first model",
    file: "src/testing/rehearse.ts",
    from: "    } catch (thrown) {\n      recordThrown(register, \"subscriptions\", thrown)\n    }\n",
    to:
      "    } catch (thrown) {\n      recordThrown(register, \"subscriptions\", thrown)\n      return Opt.none()\n    }\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails in subscriptions, then in render, as the run dies, on a first state whose model is a defect too"
      ]
    ]
  },
  {
    name: "a runCommand that throws before its effect in rehearse is no defect of its command",
    file: "src/testing/rehearse.ts",
    from: "calling(() => runCommand(command))",
    to: "runCommand(command)",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in a command on a runCommand that throws before its effect"
      ]
    ]
  },
  {
    name: "the thunk of rehearse calls update after the first defect",
    file: "src/testing/rehearse.ts",
    from: "Core.arrive(program.update, before, active, source, message, dead)",
    to: "Core.arrive(program.update, before, active, source, message, () => false)",
    killedBy: [
      ["src/testing/rehearse.test.ts", "send calls no update once a command run in its select has died"]
    ]
  },
  {
    name: "rehearse plays a key nothing listens under after the first defect",
    file: "src/testing/rehearse.ts",
    from: "hear: (key, message) => deadOr(hear(key, message)),",
    to: "hear: (key, message) => hear(key, message),",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "after a defect of the program, what the test asks for fails with it, and the state is still read"
      ]
    ]
  },
  {
    name: "the job of a hearNext starts its subscription after the first defect",
    file: "src/testing/rehearse.ts",
    from: "          if (dead()) return deadOr(Effect.never)\n          const found = Ledger.opening",
    to: "          const found = Ledger.opening",
    killedBy: [
      ["src/testing/rehearse.test.ts", "a hearNext whose job comes after a defect starts no subscription"]
    ]
  },
  {
    name: "the job of a hearNext starts its subscription once the rehearsal has ended",
    file: "src/testing/rehearse.ts",
    from: "          if (loop.ended()) return Effect.void\n",
    to: "",
    killedBy: [
      ["src/testing/rehearse.test.ts", "the job of a hearNext that comes once the scenario has returned starts nothing"]
    ]
  },
  {
    name: "rehearse runs a command after the first defect",
    file: "src/testing/rehearse.ts",
    from: "          if (dead()) return deadOr(Effect.never)\n          if (loop.ended()) return Effect.interrupt\n",
    to: "          if (loop.ended()) return Effect.interrupt\n",
    killedBy: [
      ["src/testing/rehearse.test.ts", "run calls no runCommand once a command has died"]
    ]
  },
  {
    name: "rehearse runs a command once it has ended",
    file: "src/testing/rehearse.ts",
    from: "          if (loop.ended()) return Effect.interrupt\n",
    to: "",
    killedBy: [
      ["src/testing/rehearse.test.ts", "a run made once the rehearsal has ended calls no runCommand"]
    ]
  },
  {
    name: "rehearse reads the model after the first defect",
    file: "src/testing/rehearse.ts",
    from: "model: deadOr(Effect.sync(() => shown)),",
    to: "model: Effect.sync(() => shown),",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "after a defect of the program, what the test asks for fails with it, and the state is still read"
      ]
    ]
  },
  {
    name: "a call of rehearse waits on through another fiber's death",
    file: "src/testing/rehearse.ts",
    from: "    Effect.raceFirst(waiting, Effect.andThen(register.died, deadOr(Effect.never)))",
    to: "    waiting",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a hearNext waiting on its subscription fails as soon as another fiber of the test's dies"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a run waiting for its command fails as soon as another fiber of the test's dies"
      ]
    ]
  },
  {
    name: "rehearse lets a command's interrupted run go unanswered",
    file: "src/testing/rehearse.ts",
    from: "                ledger = Ledger.cancel(ledger, taking.ticket)\n",
    to: "",
    killedBy: [
      ["src/testing/rehearse.test.ts", "when a run interrupted while its command runs leaves the command unanswered"]
    ]
  },
  {
    name: "rehearse leaves the command of an interrupted run running",
    file: "src/testing/rehearse.ts",
    from: "              stopFiber(taking.fiber)\n",
    to: "              Effect.void\n",
    killedBy: [
      ["src/testing/rehearse.test.ts", "the command is released before the interrupted call returns"]
    ]
  },
  {
    name: "rehearse stops the command of an interrupted run with no mark of its own",
    file: "src/testing/rehearse.ts",
    from: "              stopFiber(taking.fiber)\n",
    to: "              Fiber.interrupt(taking.fiber)\n",
    killedBy: [
      ["src/testing/rehearse.test.ts", "when a run interrupted while its command runs leaves the command unanswered"]
    ]
  },
  {
    name: "the job of rehearse stops a subscription with no mark of its own",
    file: "src/testing/rehearse.ts",
    from: "            onSome: stopFiber\n",
    to: "            onSome: Fiber.interrupt\n",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "two messages that arrive together, one stopping a subscription, are both applied"
      ]
    ]
  },
  {
    name: "the job of rehearse fails on a defect of the release it awaited",
    file: "src/testing/rehearse.ts",
    from: "            onSome: stopFiber\n",
    to: "            onSome: (fiber) => Effect.andThen(stopFiber(fiber), Effect.flatten(Fiber.await(fiber)))\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse applies the message whose release dies whole, as the run does, its commands owed"
      ]
    ]
  },
  {
    name: "the job of rehearse tells the calls that waited on a start before its release",
    file: "src/testing/rehearse.ts",
    from: "            onSome: stopFiber\n",
    to: "            onSome: (fiber) => Effect.andThen(tellStopped(stopped), stopFiber(fiber))\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with the defect alone, as the run dies, though a hearNext waited"
      ]
    ]
  },
  {
    name: "the job of rehearse stops the gone keys one after the other",
    file: "src/testing/rehearse.ts",
    from:
      "        { concurrency: \"unbounded\", discard: true }\n      ).pipe(\n        Effect.andThen(tellStopped(stopped)),",
    to: "        { discard: true }\n      ).pipe(\n        Effect.andThen(tellStopped(stopped)),",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "keys that go away together release the subscriptions hearNext started together, as the run does"
      ]
    ]
  },
  {
    name: "the job of rehearse leaves a call waiting on a start whose key went away",
    file: "src/testing/rehearse.ts",
    from: "        Effect.andThen(tellStopped(stopped)),\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a call waiting when its key goes away fails the test, since nothing more arrives under it"
      ]
    ]
  },
  {
    name: "the thunk of rehearse owes a step's commands before its job",
    file: "src/testing/rehearse.ts",
    from: "          return queued(jobOf(generations, stopped, owed, hearer))",
    to: "          ledger = Ledger.owe(ledger, owed)\n          return queued(jobOf(generations, stopped, [], hearer))",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a message applied meanwhile shows in state, model and events at once, and owes its commands once the release has ended"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse applies it at once, as the run does, and owes its commands once the release has ended"
      ]
    ]
  },
  {
    name: "rehearse leaves the subscriptions hearNext started to the close of its scope",
    file: "src/testing/rehearse.ts",
    from: "        ...Arr.map(Arr.fromIterable(listeners), ([, fiber]) => fiber)\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "runs the subscription under the key to its first message, applies it, and releases it at the end"
      ]
    ]
  },
  {
    name: "rehearse leaves a hearNext waiting as its end stops the subscription",
    file: "src/testing/rehearse.ts",
    from: "      yield* tellStopped(Arr.fromIterable(ledger.calls))\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a hearNext still waiting in a fiber the scenario did not join fails as the rehearsal ends"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext waiting on a start whose key went away fails, though the scenario failed"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext whose message was stopping a subscription as the scenario failed fails as one waiting"
      ]
    ]
  },
  {
    name: "the end of rehearse tells only the calls still waiting on a start",
    file: "src/testing/rehearse.ts",
    from: "tellStopped(Arr.fromIterable(ledger.calls))",
    to: "tellStopped(\n      Arr.fromIterable(ledger.hearings.values())\n"
      + "        .flatMap((each) => each._tag === 'Opened' ? each.waiting : []),\n    )",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a hearNext waiting on a start whose key went away fails, though the scenario failed"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext whose message was stopping a subscription as the scenario failed fails as one waiting"
      ]
    ]
  },
  {
    name: "rehearse leaves the commands under way to the close of its scope",
    file: "src/testing/rehearse.ts",
    from: "        ...commands,\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "when a command is still under way at the end, since its answer would still arrive"
      ]
    ]
  },
  {
    name: "the end of rehearse stops its fibers one after the other",
    file: "src/testing/rehearse.ts",
    from: "Effect.forEach(running, stopFiber, { concurrency: \"unbounded\", discard: true })",
    to: "Effect.forEach(running, stopFiber, { discard: true })",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse ends too, as the run does, failing on the command still under way, whose release waits for the subscription's"
      ]
    ]
  },
  {
    name: "a defect of a subscription hearNext started carries the key the test gave",
    file: "src/testing/rehearse.ts",
    from: "listen(found.subscription.key, generation,",
    to: "listen(key, generation,",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, with the key the program listed, though hearNext was given another equal to it"
      ]
    ]
  },
  {
    name: "rehearse lets its loop finish after a scenario that failed",
    file: "src/testing/rehearse.ts",
    from: "Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void",
    to: "Effect.exit(loop.finish)",
    killedBy: [
      ["src/testing/rehearse.test.ts", "a scenario that failed stops the loop at once, its job under way included"]
    ]
  },
  {
    name: "rehearse stops its loop at once after a scenario that returned",
    file: "src/testing/rehearse.ts",
    from: "      Effect.tap((exit) => Exit.isSuccess(exit) ? Effect.exit(loop.finish) : Effect.void),\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a message sent as the scenario returns is applied, and the command it starts fails the rehearsal"
      ]
    ]
  },
  {
    name: "rehearse's hearNext lets no call leave as it ends",
    file: "src/testing/rehearse.ts",
    from: "        Effect.ensuring(Effect.sync(() => {\n          ledger = Ledger.leave(ledger, call)\n        }))\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a call interrupted while the subscription waits leaves its message to the next one"
      ],
      [
        "src/testing/rehearse.test.ts",
        "a hearNext that left before the loop took its job starts nothing, and hear plays its key"
      ]
    ]
  },
  {
    name: "rehearse calls the scenario outside the effect whose end is guarded",
    file: "src/testing/rehearse.ts",
    from: "Effect.suspend(() => scenario(rehearsal))",
    to: "scenario(rehearsal)",
    killedBy: [
      ["src/testing/rehearse.test.ts", "what a hearNext it started holds is released"]
    ]
  },
  {
    name: "rehearse reads the commands under way once the end has waited",
    file: "src/testing/rehearse.ts",
    from: "const { cancelled, underWay } = owed",
    to: "const { cancelled, underWay } = ledger",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "when a command is still under way at the end, since its answer would still arrive"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse ends too, as the run does, failing on the command still under way, whose release waits for the subscription's"
      ]
    ]
  },
  {
    name: "rehearse reads the commands pending as the scenario ends",
    file: "src/testing/rehearse.ts",
    from: "const { pending } = ledger",
    to: "const { pending } = owed",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a message sent as the scenario returns is applied, and the command it starts fails the rehearsal"
      ]
    ]
  },
  {
    name: "a defect of a subscription in rehearse is a command's",
    file: "src/testing/rehearse.ts",
    from: "scopedIn(register, \"subscription\", () => ({ key }))",
    to: "scopedIn(register, \"command\", () => ({ key }))",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, on a defect of what a subscription releases when the scenario ends"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, on a subscription interrupting itself"
      ]
    ]
  },
  {
    name: "a defect of a subscription in rehearse does not say its key",
    file: "src/testing/rehearse.ts",
    from: "scopedIn(register, \"subscription\", () => ({ key }))",
    to: "scopedIn(register, \"subscription\")",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails, as the run dies, in a subscription, with its key, on a subscription that throws"
      ]
    ]
  },
  {
    name: "a defect of a command in rehearse is a subscription's",
    file: "src/testing/rehearse.ts",
    from: "scopedIn(register, \"command\")",
    to: "scopedIn(register, \"subscription\")",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with a defect, as the run dies, on a command interrupting itself"
      ]
    ]
  },
  {
    name: "rehearse lets a command whose run was interrupted go",
    file: "src/testing/rehearse.ts",
    from: "    if (cancelled.length > 0) {\n",
    to: "    if (false) {\n",
    killedBy: [
      ["src/testing/rehearse.test.ts", "when a run interrupted while its command runs leaves the command unanswered"]
    ]
  },
  {
    name: "rehearse lets a command still under way at the end go",
    file: "src/testing/rehearse.ts",
    from: "    if (underWay.size > 0) {\n",
    to: "    if (false) {\n",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "when a command is still under way at the end, since its answer would still arrive"
      ]
    ]
  },
  {
    name: "rehearse lets a command still pending at the end go",
    file: "src/testing/rehearse.ts",
    from: "    if (pending.length > 0) {\n",
    to: "    if (false) {\n",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "when a command is still pending at the end, since its answer would still arrive"
      ]
    ]
  },
  {
    name: "hear plays a start whose job has not run yet",
    file: "src/testing/rehearse.ts",
    from: "        if (hearing?._tag === \"Unheard\" && !Deferred.isDoneUnsafe(hearing.subscription.begun)) {",
    to: "        if (false) {",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "hear on a key whose start's job a release holds applies once the release has ended"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse hears a key that appears meanwhile only once the release has ended, by hear and by hearNext"
      ]
    ]
  },
  {
    name: "hear plays, after the wait for its start's job, the start it found before",
    file: "src/testing/rehearse.ts",
    from: "Effect.andThen(Deferred.await(hearing.subscription.begun), hear(key, message))",
    to: "Effect.andThen(Deferred.await(hearing.subscription.begun), loop.submit(() => play(key, generation, message)))",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "hear on a key that goes away while it waits for its start's job fails the test, and reaches no update"
      ],
      [
        "src/testing/contract.test.ts",
        "rehearse lets no message of such a start reach update, by hear and by hearNext: the call fails"
      ]
    ]
  },
  {
    name: "a hearNext whose key went away before its job is never told",
    file: "src/testing/rehearse.ts",
    from: "              loop.offer(tellStopped([call]), Deferred.makeUnsafe<void>())\n",
    to: "",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a hearNext whose key goes away before its job fails as stopped, and starts nothing"
      ]
    ]
  },
  {
    name: "a hearNext whose key went away before its job is told before the release of its start",
    file: "src/testing/rehearse.ts",
    from:
      "              loop.offer(tellStopped([call]), Deferred.makeUnsafe<void>())\n              return Effect.void\n",
    to: "              return Effect.die(stoppedWhileWaiting(key))\n",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "rehearse fails with the defect alone, as the run dies, though a hearNext waited"
      ]
    ]
  },
  {
    name: "the job of a hearNext hears no message held for it",
    file: "src/testing/rehearse.ts",
    from: "              hearHeld(key, generation)\n              return asks",
    to: "              return asks",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "a call interrupted while the subscription waits leaves its message to the next one"
      ]
    ]
  },
  {
    name: "the job of a hearNext runs without the services of the call",
    file: "src/testing/rehearse.ts",
    from: "loop.offer(Effect.provideContext(opening(key, generation, call), context), done)",
    to: "loop.offer(opening(key, generation, call) as Effect.Effect<void>, done)",
    killedBy: [
      [
        "src/testing/rehearse.test.ts",
        "runs a command with the services provided around run, and a subscription with those around the hearNext that starts it"
      ]
    ]
  },
  {
    name: "the loop decides once its end is marked",
    file: "src/testing/loop.ts",
    from: "Effect.suspend(() => ended ? refused : decide())",
    to: "Effect.suspend(() => decide())",
    killedBy: [
      [
        "src/testing/loop.test.ts",
        "decides nothing once its end is marked: the call is interrupted, or is what it says when refused"
      ],
      ["src/testing/contract.test.ts", "in rehearse, it reaches no update, and its call is interrupted"]
    ]
  },
  {
    name: "the loop lets a call refused once it has ended wait",
    file: "src/testing/loop.ts",
    from: "refused: Effect.Effect<A, E, R> = Effect.interrupt",
    to: "refused: Effect.Effect<A, E, R> = Effect.never",
    killedBy: [
      [
        "src/testing/loop.test.ts",
        "decides nothing once its end is marked: the call is interrupted, or is what it says when refused"
      ],
      ["src/testing/contract.test.ts", "in rehearse, it reaches no update, and its call is interrupted"]
    ]
  },
  {
    name: "the loop interrupts a call refused once it has ended, whatever it says",
    file: "src/testing/loop.ts",
    from: "ended ? refused : decide()",
    to: "ended ? Effect.interrupt : decide()",
    killedBy: [
      [
        "src/testing/loop.test.ts",
        "decides nothing once its end is marked: the call is interrupted, or is what it says when refused"
      ]
    ]
  },
  {
    name: "the loop finishes before it has done what it was offered",
    file: "src/testing/loop.ts",
    from: "Effect.andThen(Queue.offer(requests, { job: Effect.void, done }), Deferred.await(done))",
    to: "Effect.void",
    killedBy: [
      ["src/testing/loop.test.ts", "finishes once it has done what it was offered before"],
      [
        "src/testing/rehearse.test.ts",
        "a message sent as the scenario returns is applied, and the command it starts fails the rehearsal"
      ]
    ]
  },
  {
    name: "the loop leaves its job under way to the close of its scope",
    file: "src/testing/loop.ts",
    from: "    yield* stopping(loop)\n",
    to: "",
    killedBy: [
      ["src/testing/loop.test.ts", "interrupts its job under way before its stop returns"]
    ]
  },
  {
    name: "the loop leaves what it did not deliver waiting once stopped",
    file: "src/testing/loop.ts",
    from: "    yield* Effect.forEach(undelivered, Deferred.interrupt, { discard: true })\n",
    to: "",
    killedBy: [
      ["src/testing/loop.test.ts", "interrupts at its stop what it has not delivered, its job under way included"],
      ["src/testing/rehearse.test.ts", "a scenario that failed stops the loop at once, its job under way included"]
    ]
  },
  {
    name: "drive wakes its waits inside the step",
    file: "src/testing/drive.ts",
    from: "    latest = app.model()\n    told = true\n  })",
    to: "    latest = app.model()\n    told = true\n    settled()\n  })",
    killedBy: [
      [
        "src/testing/drive.test.ts",
        "returns once update has seen its message, as it promises"
      ]
    ]
  },
  {
    name: "the engine never tells whoever runs it that a call has applied its messages",
    file: "src/engine.ts",
    from: "      deaths.release()\n      settled()\n",
    to: "      deaths.release()\n",
    killedBy: [
      [
        "src/testing/drive.test.ts",
        "returns once update has seen its message, as it promises"
      ]
    ]
  },
  {
    name: "drive goes on after a defect of the program until the scenario ends",
    file: "src/testing/drive.ts",
    from: "      deaths,\n      began,\n      settled\n    )",
    to: "      { ...deaths, died: Effect.never },\n      began,\n      settled\n    )",
    killedBy: [
      ["src/testing/drive.test.ts", "a defect of the program fails the scenario"],
      [
        "src/testing/drive.test.ts",
        "a subscription of init that dies fails a scenario waiting for a model, before its patience"
      ]
    ]
  },
  {
    name: "drive reads a model after the first defect",
    file: "src/testing/drive.ts",
    from: "Arr.isReadonlyArrayNonEmpty(dies)",
    to: "false",
    killedBy: [
      ["src/testing/drive.test.ts", "after a defect of the program, model fails with it"]
    ]
  },
  {
    name: "drive begins its scenario before the run has started the effects of the first state",
    file: "src/testing/drive.ts",
    from: "Effect.flatMap(began, () =>",
    to: "Effect.flatMap(Effect.void, () =>",
    killedBy: [
      [
        "src/testing/contract.test.ts",
        "drive fails, as the run dies, on a defect of what a subscription releases when the scenario ends"
      ],
      [
        "src/testing/contract.test.ts",
        "drive fails, as rehearse does, in render alone: the scenario that would catch it never meets it"
      ],
      ["src/testing/contract.test.ts", "in drive, through the run's dispatch, it reaches no update"]
    ]
  },
  {
    name: "drive ends with what the scenario ended with, before the defects",
    file: "src/testing/drive.ts",
    from: "    return yield* Core.endedWith(deaths.all(), Opt.getOrElse(outcome, () => stopped))\n",
    to: "    return yield* Opt.getOrElse(outcome, () => stopped)\n",
    killedBy: [
      [
        "src/testing/drive.test.ts",
        "a wait matches a model read before a defect of a later model, and drive ends with the defect first all the same"
      ]
    ]
  },
  // The bridges (`docs/records/synchronous-dispatch.md`, stage 3): each check of the bridges to snabbdom and to
  // React, and of `messagesSentBy`.
  {
    name: "the snabbdom bridge draws a notice at once, in the task that sent it",
    file: "bridges/snabbdom.ts",
    from: "    queueMicrotask(() => {\n",
    to: "    ;((draw: () => void) => draw())(() => {\n",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "a notice from a command is drawn in a microtask, once"
      ],
      ["bridges/snabbdom.test.ts", "is drawn once that patch is done, in a microtask of its own, and the run goes on"]
    ]
  },
  {
    name: "the snabbdom bridge draws a rejected message of its view's not at all",
    file: "bridges/snabbdom.ts",
    from: "    app.dispatch(message)\n    notice()\n",
    to: "    app.dispatch(message)\n",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "a key typed once it is locked is rejected, and the element shows the program's value again at once"
      ],
      [
        "bridges/snabbdom.test.ts",
        "once frozen, a key in the textarea and a click on the checkbox are rejected, and both show the model again"
      ]
    ]
  },
  {
    name: "the snabbdom bridge draws once it is stopped",
    file: "bridges/snabbdom.ts",
    from: "if (!stopped) attempt()",
    to: "attempt()",
    killedBy: [
      ["bridges/snabbdom.test.ts", "a draw asked for before the bridge is stopped is not made once it is stopped"]
    ]
  },
  {
    name: "the snabbdom bridge patches again the model it drew last",
    file: "bridges/snabbdom.ts",
    from: "if (Opt.isNone(last) || last.value !== model) {",
    to: "if (true) {",
    killedBy: [
      ["bridges/snabbdom.test.ts", "a rejected click draws no tree again, and the element keeps what was typed"],
      [
        "bridges/snabbdom.test.ts",
        "a key typed once it is locked is rejected, and the element shows the program's value again at once"
      ]
    ]
  },
  {
    name: "the snabbdom bridge gives no controlled element its prop back",
    file: "bridges/snabbdom.ts",
    from: "    giveBack(controlled)\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "a key typed once it is locked is rejected, and the element shows the program's value again at once"
      ],
      [
        "bridges/snabbdom.test.ts",
        "once frozen, a key in the textarea and a click on the checkbox are rejected, and both show the model again"
      ]
    ]
  },
  {
    name: "the snabbdom bridge keeps an element drawn without a value among the controlled ones",
    file: "bridges/snabbdom.ts",
    from: "    else controlled.delete(element)\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "drawn in the same place without a value, keeps what is typed into it through later draws"
      ]
    ]
  },
  {
    name: "the snabbdom bridge keeps a removed element among the controlled ones",
    file: "bridges/snabbdom.ts",
    from: "      if (vnode.elm instanceof Element) controlled.delete(vnode.elm)\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "removed, though the style module keeps it on screen as it fades, is left as it is through later draws"
      ]
    ]
  },
  {
    name: "the snabbdom bridge lets what a draw throws out of it",
    file: "bridges/snabbdom.ts",
    from: "    try {\n"
      + "      draw()\n"
      + "    } catch (error) {\n"
      + "      stop()\n"
      + "      app.die(error)\n"
      + "    }",
    to: "    draw()",
    killedBy: [
      ["bridges/snabbdom.test.ts", "by the view, ends the run at once, in render, and the handler gets nothing"],
      [
        "bridges/snabbdom.test.ts",
        "by makeModel, ends the run at once, with one defect, in render, and the handler gets nothing"
      ],
      ["bridges/snabbdom.test.ts", "by the view, ends the run, in render, and drawInto throws nothing"]
    ]
  },
  {
    name: "the snabbdom bridge does not die of what a draw throws",
    file: "bridges/snabbdom.ts",
    from: "      app.die(error)\n",
    to: "",
    killedBy: [
      ["bridges/snabbdom.test.ts", "by the view, ends the run at once, in render, and the handler gets nothing"],
      ["bridges/snabbdom.test.ts", "by the view, ends the run, in render, and drawInto throws nothing"]
    ]
  },
  {
    name: "the snabbdom bridge draws on once a draw threw",
    file: "bridges/snabbdom.ts",
    from: "      stop()\n      app.die(error)\n",
    to: "      app.die(error)\n",
    killedBy: [
      [
        "bridges/snabbdom.test.ts",
        "by the view, stops the bridge, which draws nothing more when a button on screen is clicked"
      ]
    ]
  },
  {
    name: "the snabbdom bridge lets what its first draw throws out of it",
    file: "bridges/snabbdom.ts",
    from: "  attempt()\n  return stop\n",
    to: "  draw()\n  return stop\n",
    killedBy: [
      ["bridges/snabbdom.test.ts", "by the view, ends the run, in render, and drawInto throws nothing"]
    ]
  },
  {
    name: "the React bridge reads the model without subscribing",
    file: "bridges/react.ts",
    from: "view(useSyncExternalStore(app.subscribe, app.model, app.model), app.dispatch)",
    to: "view(app.model(), app.dispatch)",
    killedBy: [
      ["bridges/react.test.ts", "a click on a drawn button reaches the program, and is drawn once the handler returns"]
    ]
  },
  {
    name: "the React bridge's Host does not throw what its run died of",
    file: "bridges/react.ts",
    from: "    thrown.current = died\n    throw died.error\n",
    to: "    thrown.current = died\n",
    killedBy: [
      ["bridges/react.test.ts", "throws its ProgramDefect as Host renders, for the nearest error boundary"]
    ]
  },
  {
    name: "the React bridge's Host leaves its run running as it unmounts",
    file: "bridges/react.ts",
    from: "      if (fiber !== undefined) Effect.runFork(Fiber.interrupt(fiber))\n",
    to: "",
    killedBy: [
      ["bridges/react.test.ts", "interrupts the run as it unmounts, and the run releases what it holds"],
      [
        "bridges/react.test.ts",
        "a program unmounted while a command is under way interrupts the command, and draws nothing after"
      ],
      ["bridges/react.test.ts", "hidden by Activity, the run ends; shown again, the program starts from init"],
      [
        "bridges/react.test.ts",
        "a view that throws reaches the nearest error boundary, which unmounts Host and interrupts the run"
      ]
    ]
  },
  {
    name: "the React bridge's Host does not report what its run dies of once unmounted",
    file: "bridges/react.ts",
    from: "          } else report(error)\n",
    to: "          }\n",
    killedBy: [
      ["bridges/react.test.ts", "gives what it dies of once Host has unmounted to reportError"]
    ]
  },
  {
    name: "the React bridge's Host sets the death of its run once unmounted",
    file: "bridges/react.ts",
    from: "          if (mounted) {\n",
    to: "          if (true) {\n",
    killedBy: [
      ["bridges/react.test.ts", "gives what it dies of once Host has unmounted to reportError"]
    ]
  },
  {
    name: "the React bridge's Host is never told it has unmounted",
    file: "bridges/react.ts",
    from: "      mounted = false\n",
    to: "",
    killedBy: [
      ["bridges/react.test.ts", "gives what it dies of once Host has unmounted to reportError"]
    ]
  },
  {
    name: "the React bridge's Host starts its run with the props of the render its effect ran after",
    file: "bridges/react.ts",
    from: "const { fork } = first.current",
    to: "const { fork } = props",
    killedBy: [
      ["bridges/react.test.ts", "shown again by Activity, starts the run with the fork of its first render"]
    ]
  },
  {
    name: "the React bridge's Host starts its program anew with the props of the render its effect ran after",
    file: "bridges/react.ts",
    from: "running = begin<Model, Message>(first.current)",
    to: "running = begin<Model, Message>(props)",
    killedBy: [
      ["bridges/react.test.ts", "shown again by Activity, starts the program anew with the options of its first render"]
    ]
  },
  {
    name: "the React bridge's Host starts its run in its effect, which StrictMode cleans up at once",
    file: "bridges/react.ts",
    from: "    queueMicrotask(() => {\n      if (!mounted) return\n",
    to: "    ;((start: () => void) => start())(() => {\n",
    killedBy: [
      [
        "bridges/react.test.ts",
        "in StrictMode, one run starts, which no cleanup interrupts, and it is drawn and typed into"
      ],
      ["bridges/react.test.ts", "in StrictMode, the commands of init start once"]
    ]
  },
  {
    name: "the React bridge's Host starts a run its cleanup cancelled",
    file: "bridges/react.ts",
    from: "      if (!mounted) return\n",
    to: "",
    killedBy: [
      ["bridges/react.test.ts", "in StrictMode, the commands of init start once"]
    ]
  },
  {
    name: "the React bridge's Host runs again a program whose run has ended",
    file: "bridges/react.ts",
    from: "if (ran.current) {",
    to: "if (false) {",
    killedBy: [
      ["bridges/react.test.ts", "hidden by Activity, the run ends; shown again, the program starts from init"],
      ["bridges/react.test.ts", "shown again by Activity, starts the run with the fork of its first render"]
    ]
  },
  {
    name: "the React bridge's Host throws an interruption",
    file: "bridges/react.ts",
    from: "if (!Exit.isFailure(exit) || Cause.hasInterruptsOnly(exit.cause)) return",
    to: "if (!Exit.isFailure(exit)) return",
    killedBy: [
      ["bridges/react.test.ts", "interrupts the run as it unmounts, and the run releases what it holds"]
    ]
  },
  {
    name: "the React bridge's Host hears how the run ends inside the fiber it forks",
    file: "bridges/react.ts",
    from: "      const forked = forkRun(running.run)\n",
    to: "      const forked = forkRun(Effect.onExit(running.run, (exit) =>\n"
      + "        Effect.sync(() => {\n"
      + "          if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) setDied({ error: Cause.squash(exit.cause) })\n"
      + "        })))\n",
    killedBy: [
      ["bridges/react.test.ts", "what the application handles around the run is not thrown again"]
    ]
  },
  {
    name: "the React bridge's Host starts its run with its latest props",
    file: "bridges/react.ts",
    from: "  const first = useRef(props)\n",
    to: "  const first = { current: props }\n",
    killedBy: [
      ["bridges/react.test.ts", "shown again by Activity, starts the run with the fork of its first render"]
    ]
  },
  {
    name: "messagesSentBy gives a listener no value",
    file: "bridges/snabbdom-testing.ts",
    from: "      ...(\"value\" in props ? { value: props[\"value\"] } : {}),\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom-testing.test.ts",
        "finds the writes of controlled elements, each with the value its model holds"
      ]
    ]
  },
  {
    name: "messagesSentBy gives a listener no checked",
    file: "bridges/snabbdom-testing.ts",
    from: "      ...(\"checked\" in props ? { checked: props[\"checked\"] } : {})\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom-testing.test.ts",
        "finds the writes of controlled elements, each with the value its model holds"
      ]
    ]
  },
  {
    name: "messagesSentBy does not draw a thunk",
    file: "bridges/snabbdom-testing.ts",
    from: "      visit(fn(...args))\n"
      + "      return\n",
    to: "",
    killedBy: [
      [
        "bridges/snabbdom-testing.test.ts",
        "draws each thunk, and records the message of a child as the root of the program receives it"
      ]
    ]
  }
]
