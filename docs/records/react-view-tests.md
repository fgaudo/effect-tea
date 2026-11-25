# Whether a test can find what a view of React sends

**Status:** decided on 25 November 2026, as step 84 of [`ROADMAP.md`](../../ROADMAP.md), by a session of Fable 5.2, by
the values of "Deciding" in [`AGENTS.md`](../../AGENTS.md), and read by a session of Opus 5.5 that wrote none of it.
Nothing of the library was changed. The spike is `a147721` on `spike/react-view-tests`, never to be merged, with a
`SPIKE.md` of its commands. It ran with Bun 1.4.5 in the repository, and under React Native's jest preset in the
project that `bun run test:react-native --keep` leaves: React 19.3.0, React Native 0.88.1, `test-renderer` 1.3.1,
`react-reconciler` 0.34.0, `@testing-library/react-native` 14.1.0, jest 29.7.0, Effect 4.1.5, Node 24.14.1, Windows.
Each claim is **run**, **read** in the sources of a package, named by their path in it, or **reasoned**.

## Decided

**1. A view of React has no `messagesSentBy`, and the package no entry `./react/testing`.** The owner asked whether
React and React Native can have one. Neither way to make one is correct on both (2, 3), so no new peer is asked of the
owner. The removal of 14 November 2026 ([`boundary.md`](boundary.md), item 1) stands, with its two new facts weighed: a
render by a renderer of tests (3), and the two bridges that differ (5).

**2. A walk that calls no component is not taken: it misses in silence, or refuses views that are right.** The walk
calls the function props named `on…` of the elements that the view returns, and of their `children`, with React's
public API alone (`isValidElement`, `Fragment`, an element's `type` and `props`).

- **Run, where it finds all**: `counter` and `form`, drawn for React DOM in every state that fast-check draws, and for
  React Native, where it reads `onPress` and `onChangeText` as the view wrote them; a child's view called as a
  function, through `forwardTo`; a component that is given its handlers as `on…` props, hooks or not.
- **Run, where it finds nothing**: a row drawn as a `memo` that is given its dispatch, and each row of a `FlatList`,
  which a function prop draws (`renderItem`), as React Native draws a long list.
- **Run, where it is wrong in silence**: a component given `onSave`, and an object that holds a second function, sends
  two messages, and the walk finds one. A test that compares with its reader then passes a view that sends a message
  which its model does not hold: what the check is for.
- **Run, why it cannot refuse aloud**: to refuse every function prop that is no handler refuses a `Pressable` whose
  `style` or `children` is a function, and a list's `keyExtractor` and `getItemLayout`, which hide nothing. A rule that
  sees the function in the object above, by reading props deeply, refuses those views too.
- **Reasoned**: a third parameter by which the test says what each component draws would make the test write each
  component again, and the verdict would be of that copy.

**3. A render by a renderer of tests is not taken: it is right for React DOM alone, at the cost of a peer.**
`test-renderer` draws the view, components and hooks too, and gives its host elements with their props.

- **Run, on the views of React DOM**: each host element holds the handler that the view wrote. `counter`, `form`, a
  component with hooks and a row drawn as a `memo` with its dispatch are all found.
- **Run, on React Native**: the host element of a `Pressable` holds nine handlers of `Pressability`, and no `onPress`.
  Called each with a plain event, three throw and none sends. `onClick` alone sends, for an event whose `target` is
  its `currentTarget`: the path of an accessibility click, which calls `onPress` and nothing else (read,
  `Libraries/Pressability/Pressability.js`). So the `onLongPress` of a `Pressable` is not found, and to call `onClick`
  is to know what `Pressable` is made of. A `Switch` is an `RCTSwitch` with `onChange`, and no `onValueChange`. A
  `TextInput` holds `onChangeText`: the jest preset draws a mock of it, with the props it was given
  ([`react-native.md`](react-native.md), 2). A `FlatList` of 30 rows draws 10.
- **Run and read**: the handler that the view wrote, `onPress` or `onLongPress`, is on a fiber above the host element.
  The testing library finds it there, through `unstable_fiber`, `return` and `memoizedProps`
  (`dist/events/propagation.js`, `findEventHandlerFromFiber`): React's internals, which "Only stable APIs" refuses.
- **Read**: `test-renderer` 1.3.1 depends on `react-reconciler ~0.34.0`, whose peer is `react ^19.3.0`, and whose
  README says that its API is not stable and follows no common versioning. A new reconciler waits for a release of
  `test-renderer`.
- **Reasoned, not run**: it is not the application's renderer, so a view that draws with `react-dom`, as a portal,
  is not drawn. React's own `react-test-renderer` is deprecated, as the README of `test-renderer` says, and was not
  tried.

So the tool would serve one renderer of React, under the entry of the bridge to all of them
([`react-native.md`](react-native.md), 1), and React Native would have none.

**4. No one form of `reports` serves a handler of React.** What a handler is called with is the DOM's for an element
of the browser, an event with a `target`, and each component's own for a component: a string for `onChangeText`, a
boolean for `onValueChange`, an event with a `nativeEvent` for `onChange`. Run: with nothing reported, the walk calls
`onChangeText` with nothing, and the message holds no value. A `reports` that returns the arguments serves them all,
and is another form than snabbdom's `{ element, event }`.

**5. The two bridges differ because their renderers do, and snabbdom's `messagesSentBy` stays an entry.** A view of
snabbdom returns its whole tree as data, and a `thunk` is drawn by a call of its function. A view of React returns
elements whose components React alone calls. What a view sends, found without its renderer, is a role that exists
only where the view is data: it is not one role with two forms (value 3).

**6. The check is made with the tools that a user of React has, and step 85 shows it.** A view is a function, so a
test needs no program and no `Host`. Run, with React Native's testing library:
`render(<>{view(model, record)}</>)`, a `fireEvent.press` of each control and a `fireEvent.changeText`, then what
`record` received compared with the messages that the model holds, written out for `form`. Three tests pass, of
`counter` in both cases of its model and of `form`. It finds only the controls that the test acts on: a control that
the test does not name is not found, which `messagesSentBy` finds.

## Not run

Nothing ran on React DOM's own renderer: its views were drawn by `test-renderer`, and by the walk. Step 85 runs the
check of 6 there.
