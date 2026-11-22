# What an application's upgrade to 0.8.0 found

**Status:** proposed, 22 November 2026, at commit `ac24824`, by a session of Fable 5.2 that the owner asked to weigh a
report. Steps 22 to 27 of [`ROADMAP.md`](../../ROADMAP.md) come from it, with a point of its steps 16 and 26 and two
items of its "Any time". Nothing of the library, of the guide or of the examples was changed. Points 1 to 3 were
decided by the owner the same day, with another session of Fable 5.2: "What the owner decided", below. Points 4 and 5
are steps 25 and 26, not decided yet.

## Where the report came from

An application on React Native was upgraded to 0.8.0 by coding agents. The owner briefed them as a reader's check
briefs its reader ([`guide-reader`](../../.agents/skills/guide-reader/SKILL.md), in the mode of the package): they read
the package as it is installed, never its `src/` nor the repository, and reported what the documentation did not say.
It differs from a reader's check in two things: the requirement was an application that exists, and its renderer is one
the package has no example of.

The report listed seven points. This session read each against the guide, the code and
[`rejected.md`](../rejected.md), and ran a probe where the report said that an agent had to find out by a script. A
probe was a throwaway file under `examples/`, typechecked with `tsc -p examples`, run with Bun, and deleted. Each point
is weighed below on the library's own terms, as `AGENTS.md` asks of the API: what one application uses decides nothing.

## In short

- **Every point holds against the guide.** None is a misreading.
- **Nothing of the engine, nor of the rule of an input, is wrong.** The design answers each case. The guide says less
  than the design does: it speaks of an input as a text that is typed, where the code (`src/input.ts`, "a value a
  component of the renderer decides") and the bridges, which draw a checkbox and a range, already hold more.
- **Three points reach past the guide**: what `hear` refuses (point 4), what the package asks of a toolchain and of
  its peers (point 5), and a global of the browser that the bridge to React calls (point 5, a lead that was not run).
- **One example does what the guide's own test would report**, and does not say so: the form (point 3).

## The points

### 1. A value that an element reports

**The report.** A value that comes with an element's event, as the offset of a scroll or the height of a layout: the
guide describes an input for a typed text only. It does not say that an input is the answer, and some rules do not fit:
"A view writes only into the inputs that the model shows" ("Model"), and the writes "into the values the model shows as
editable" ("Testing"). The table of "Subscriptions" calls a scroll an "input", in the plain sense of the word.

**Checked.** True. The page's title and its "In short", the table of "Structuring a program" ("A text that the user
types"), the fourth page of the tutorial and the skill all speak of a text. The glossary is wider ("a value the user
gives"), and so are "Writing a bridge", which draws a select, a checkbox and a range as controlled elements, and the
comment at the head of `src/input.ts`.

**By the design.** The two reasons of "Why what the user types is no message" hold for any value known only as its
event comes: there is nothing to decide, and the model cannot hold the message without a function. "Structuring a
program" says what is state: what the program decides by. So an offset that the program decides by is state, and a
write is the one way a view has to bring it. The other ways were weighed already: a message that the view builds (the
rule of "Model"), and a subscription that the renderer feeds (`rejected.md`, "Input through a subscription"). An event
of the whole page is another case, a subscription to a service, which finding 3 of the reader's check of 20 November
2026 asks the guide to say (`ROADMAP.md`, "Waiting for the owner").

What does not carry over is the controlled element. An offset and a measure are reported: the package's bridges give
back `value` and `checked` alone, so a value that the program leaves in such a place is not shown. And such an input is
no editor, so the recipe of "Testing" for `held` and `candidates` has no word for it. A scroll also writes at each of
its events, and each write runs the whole pure step in that event (point 6 of the seven, in `ROADMAP.md`).

**Advised.** The page says the general rule, with the text as its first case, in a section of its own: an input is the
place of a value that an element holds or reports; for one the program cannot give back, the rule of an input is
promised and nothing of the element. The page keeps its title, which every `@see` names. The table of "Subscriptions"
takes another word for "input".

**With it, a fact that comes with a value** (the report's 7, first item), as the end of a scroll with its offset. A
handler writes the value, then sends the message that its model holds, and `update` reads the value from the state.
It holds by what the guide promises already: a message is applied in the call that sends it, and the second is a
message of a model that the state has moved past, which `update` judges. No page shows it.

### 2. The `get` and the `set` of an input

**Checked, by a probe.** A write equal, by `Equal`, to what `get` gives calls no `set`, and leaves the very same state
(`written` in `src/input.ts`, `liftAt` in `src/compose.ts`). `set` is called only where `get` gives `Some`
(`updateAt`). A `set` that changes another field of the state has that change stored. The guide promises the first
without naming `set` ("leaves the very same state"), and the second as a rejection. The paragraph on the stock-take,
"So `get` returns `None`, and `set` leaves the state as it is", reads as if `set` were called there. Nothing is said
of the third. No example shows `input({ get, set })` alone: both are of `inputById`.

**By the design.** `get` and `set` are "the two functions that an optic is" ("Composition"), and since the write
without `was` a `set` may store another form of the value. A `set` that changes more than its place is an `update`
under another name: it decides on a write, where the guide says that there is nothing to decide, no test of the model
sees it, and an equal write skips it. `rejected.md` refused its neighbours for the same reason ("A write that `update`
sees and may reject", "A write into a child's input that raises an event").

**To decide.** Either the guide promises that a `set` stores into its place alone, and that anything else is not
supported: what follows a write is then computed where the state is read, as an error shown only while the name is the
one that failed. Or it promises what the code does, a `set` called exactly on a write of another value that has a
place, free to change the state. The first is advised: with the second, each such input has a rule of its own to test,
and "the rule is the same for every input" goes. A message on each write is the parked "What reaches `update`,
declared as data", and is reopened there, not here.

### 3. The form, and a place shown read-only

**Checked.** `examples/form/form.ts` keeps the name's place while it saves, and its model shows nothing to type into
("Less than is accepted"). Its test lists no write among its candidates, so `Missing` is never asked. "Testing" says
that `Missing` finds a place that the model shows as read-only, the "Do and don't" of the inputs' page says not to
keep the rows' places while an operation runs, and "Structuring a program" says that a test lists as `withheld` what
a model leaves out on purpose. So the first example of an input does what the guide's own check would report, and
declares nothing. Its reason, a key typed before the input was disabled, is older than the dispatch that applies at
once: with both bridges no handler of the browser's runs on a view older than the state. What is left of it is a
script, and a renderer that draws late (point 5).

**To decide.** Either the form's test checks its writes, with those of a saving form `withheld`, and "Testing" says
that a place shown read-only on purpose is `withheld`. Or the form locks by the shape of its state, as the stock-take
does. The first is advised: an input on a lens is always there, which keeps the first example small, and it shows
`withheld` on a write. Either way "Testing" says that writes and the program's own messages may share one call of
`dispatchViolations`: "apart from the reader" was read both ways.

### 4. What `hear` refuses

**Checked, by a probe**, on a page with an input, under a parent. `hear` takes the constructors of the page's own
messages, those of `Data.taggedEnum` over the page's whole message, and a literal. It refuses a wrapper built by a
constructor of the parent's message, whose `message` is typed as the child's whole message, and any value typed as the
whole message of a program with an input, as what a helper of a test returns. The error prints an `Omit<…> &
Readonly<…>`, and names no rule. And only the doc comment says what `hear` takes: "Testing tools" does not, against the
rule that a doc comment promises nothing the guide does not.

**By the design.** `rejected.md` holds the exact form, "`hear` typed by what a program's subscriptions send", with a
known limit of the check by shape. This is a second cost of that check, and not the one that reopens the entry. What
the check buys is that a test cannot say that a subscription sent a write. It stops neither a click nor a command's
answer said as heard: "the test answers for what it says was heard". `applyAll` and `simulate` take any message.

**To decide.** Either `hear` takes any message of the program, and `Heard` goes with its known limit. Or it stays, the
guide says what `hear` takes and how a wrapper is written for it, and the error names the rule. The first is advised: a
partial check, for a mistake that is unlikely, which refuses tests that are right.

### 5. The entry for React outside a browser

- **`react-dom`.** `bridges/react.ts` imports `react` alone. `package.json` lists `react-dom` as an optional peer, and
  the README, "Writing a bridge", "Coming from Elm or React", the skill and the changelog of 0.8.0 ask for both. What
  is `react-dom`'s is the premise of a controlled input (`premises.md`) and the bridge's tests.
- **A global of the browser, not run.** The bridge gives `reportError` a run that dies once the effect of `Host` has
  ended (two calls in `bridges/react.ts`). React itself falls back where that global is missing. Where it is missing,
  the report of a dead run would be a `ReferenceError`. Whether React Native has it was not checked: a lead.
- **A renderer that draws late.** "Writing a bridge" gives the rule in the browser's words: each new state is drawn
  before the next event, or a key is typed over a value that the program has replaced, and the write stores the old
  value back. It has no word for a renderer that cannot keep it, as one whose elements live in another thread. By the
  rule of an input the state always holds the last write. A value that the program leaves in a place may then be
  written over by a key typed before its draw. A lock by the shape of the state holds whatever the renderer, and a
  place that is kept does not: point 3 weighs more there. Reasoned, and not run.
- **The syntax the package ships.** The build targets ES2022, and the README does not say so. The report says that
  Metro and Hermes needed a plugin of Babel for it. `src/defect.ts` has three `static {}` blocks, which give the module
  the private constructor of each defect. Effect's `dist/` (4.1.4) has class fields and private fields, and no
  `static {}` block: so the three blocks are the one syntax the package adds to what Effect asks of a toolchain.
  Advised: the README says the level, and the three blocks are written another way.

### 6. A choice among fixed values

A control that chooses among fixed values, as the digits of a keypad, holds one message for each: a list or a record of
messages, which is data. A function `(digit) => Message` in the model is what "A model holds no function" refuses.
It is a case of "Messages live in the model", which the clock of `pages` keeps with two messages. No page shows it.

### 7. Smaller

- **Plain data.** "Model", "Precisely", names an `Option`, a `Data` class and a `HashMap` as data, and not a plain
  object, an array or a record. `Equal.equals` compares them by their fields with Effect 4.1.4, by a probe: to be read
  in Effect's documentation of `Equal` before a sentence says it.
- **`children`.** "A program with inputs and no children leaves `children` out" ("Composition", "The parent's
  inputs") may be the key of `make`, the parameter of `init`, or both. It is both: `init` is then the first step.
- **Services.** No page says that a subscription written apart names its services in its type,
  `Subscription<Message, R>`, and that the program's subscriptions then need them (`SubscriptionServicesOf`).

## Why no check found them

Asked by the owner, the same day. Each check of the repository starts from what the repository wrote: the forms its
tests use, the sentences its guide has, the requirements chosen for a reader, and the engines and the renderer it
installs. An application brings forms, questions and a place to run that nobody here chose. It is what step 16 of
`ROADMAP.md` found of the types of a program, and it holds beyond them. Read in the code:

- **`hear`.** Three tests give `hear` a child's message, each as a literal. The examples use the constructors of
  `Data.taggedEnum` over the own messages of a program without children, never over a parent's. And a test of the types
  says what is refused, not in how many forms what is right is taken.
- **The syntax.** The package names no level, so nothing checks one. The smoke test runs Node and TypeScript, which
  take any.
- **`reportError` and `react-dom`.** `bridges/` is typechecked with `DOM`, where `src/` is not, so a global of the
  browser compiles. `premises.md` has no premise for it. The bridge's tests run with `react-dom` on happy-dom alone.
- **An input as a text.** The six requirements of `guide-reader` are each a page of a browser with a value that is
  typed, and those that were drawn are drawn with snabbdom. A requirement is chosen to need the pages checked, so it
  cannot find what no page holds.
- **What a `set` may do.** [`promises-and-tests.md`](promises-and-tests.md) reads the sentences the guide has. A
  question with no sentence has nothing to be read against.
- **The form.** No check reads an example against a "Don't" of the guide, and the rule that a change of a rule rereads
  every place that states it stops at the guide: the form's comment gives a reason older than the dispatch that
  applies at once.

So five checks were written into `ROADMAP.md`: each message in every form it is written, given to every function that
takes one (step 16, point 5); the syntax of `dist/` and the globals of the entry for React (step 26, points 4 and 5);
what the guide says of each function that a program gives the library (step 27); a reader's requirement chosen by what
no check has met, and an upgrade as a mode of the check; and the examples read against the guide (both under "Any
time"). The first three are checks that stay. The last two are readings, which find only while someone repeats them.
None shows that nothing else is left.

## What the owner decided

On 22 November 2026, as step 23 of `ROADMAP.md`, with a session of Fable 5.2 that read the points again against the
code and the guide. Nothing was written of the guide or of the examples: steps 24, 28 and 29 do it.

- **Point 1, as advised, and the page renamed.** The page says the general rule, and promises of a value that the
  program cannot give back the rule of an input and nothing of the element. Against the advice above, the page is
  renamed "Inputs": under the general rule, "Inputs the user types into" reads as a part of it, and the cost is each
  `@see`, which `bun run comments` checks. With the rule, the line between a write and a subscription: what is there
  whatever is drawn is a subscription. The session added what a model shows of a value that is reported, and what a
  write at each event costs, as descriptions (step 24).
- **A fact that comes with a value is shown**, as advised. It is also how a value is written once, as a scroll ends.
- **Point 2: a `set` changes its place and nothing else**, as advised, and the rule is of every place, a child's too.
  The owner then asked whether a signature of `set` could hold it by construction. None can, and a place as an optic
  alone moves the hole into a type of Effect's (`rejected.md`, "A place as an optic alone"). What can be done is two
  things, taken as a step with a spike (step 29): the form of a value as a function of the value alone, so that a
  `set` stores exactly what it is given; and a check of the three laws of a lens in `./testing`, which a `set` that
  does more than its place fails.
- **Point 3, against the advice: the form locks by the shape of its state** (step 28). The advice kept the first
  example small. But the form would do what the "Don't" of its own page says, the sentence on `withheld` would be a
  rule that an example brings to be allowed, and a lock by the shape holds whatever the renderer. Read in the code: a
  write that arrives while the form saves is stored, then lost when the save succeeds and kept when it fails; and the
  view gives the disabled input its handler in every state.
- **Asked last: whether a `set` is the last such hole.** It is not known to be. The rules that nothing checks are
  listed in "What is left to you", and a `set` was not among them until an application asked. Step 27 is the reading
  that looks for the others, a function of the user's at a time.

## Found beside the report

The skill `guide-reader` sends a choice of the API that a reader found awkward to "Ideas, to be decided" of
`ROADMAP.md`, a section that is gone: such a point is now under "Waiting for the owner".
