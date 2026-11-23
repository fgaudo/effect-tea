# A library for others to adopt, and its bridges as entries of the package

**Status:** decided by the owner, 20 November 2026, and done in part the same day: the library is meant to be adopted
by others, for two readers; the bridge to React is hosted by React ([`hosted-react.md`](hosted-react.md)); the bridges
are entries of the package. What is left, in the order the review set, is in [`ROADMAP.md`](../../ROADMAP.md). Moved
here from `ROADMAP.md` on 20 November 2026, as it stood at commit `b7ae083`.

## Decided: adopted by others, for two readers

The owner decided on 20 November 2026 that the library is meant to be adopted by others, not only to be the owner's
own tool. What follows from it, by the same review, reasoned:

- The bridges become something a user installs: nobody adopts code to copy.
- The changes that break the API are taken first (what `docs/rejected.md` parks), then 1.0: a user asks that the API
  stays.
- The README says what the library is and for whom, and names Foldkit.

Two readers were named. One starts a new application. The other has an application already, most often in React, and
rewrites none of it: this library has no renderer, so it can be the state of a part of such an application. That reader
needs a bridge to React that works with what React does (components with state, `memo`, Suspense), which the owner had
declined on 16 November 2026 (`docs/rejected.md`, "The bridges").

The owner, the same day: both readers. Reasoned from there: two bridges, not three. A view of the library's own over
snabbdom ("A wider form", below) would take the place of the snabbdom bridge. The one for React is hosted by React,
and the rules of the guide's "View" that every renderer kept (no state beside the program's, frames and nothing else,
a frame whole and at once) became what each bridge promises: done, in [`hosted-react.md`](hosted-react.md). The order
proposed: the element of an input under the search (done); a spike of the hosted React bridge (done, then decided);
the bridges as entries (done); the breaking changes and 1.0; then the view of the library's own, the largest.

## The bridges as entries of the package

**Why.** Users copied `bridges/snabbdom.ts` and `bridges/react.ts`. A fix of a bridge, as those of 16 and 19 November
2026, did not reach a copy, and what a screen shows of an input was promised through code that no version named.

**The contract** stays as narrow as it was (a frame drawn whole and at once, a native text field, and the list of the
guide's "What is left out"): the entries add no feature of a renderer.

**Packages apart** (`@fgaudo/effect-tea-snabbdom`, `@fgaudo/effect-tea-react`, in a workspace) were weighed against
**entries of this package** (`@fgaudo/effect-tea/snabbdom`, `/react`, as `./testing` is one, with each renderer an
optional peer). Entries: no workspace, one version and one release, and a bridge always checked with the library it is
published with, which matters while the rule a bridge calls still changes; but a bridge that breaks raises the version
of the whole package, and the rule "`effect` is its only dependency" holds of `.` and `./testing` alone. Packages apart
are for a bridge that needs releases of its own: an entry moves to one later by a breaking change that only renames an
import.

**Decided by the owner, 20 November 2026: entries of this package**, the snabbdom bridge as it was. Done the same day:
`@fgaudo/effect-tea/snabbdom`, `@fgaudo/effect-tea/snabbdom/testing` (`messagesSentBy`) and `@fgaudo/effect-tea/react`,
built into `dist/bridges/`. The preload is no entry: the guide's "Testing" says what it does.

**The ranges of the renderers**, decided by the owner the same day: a caret from the versions of the lockfile
(`^3.6.4`, `^19.3.1`), not Effect's tilde. With the entries in one package, npm refuses the whole package to an
application whose React is out of the range, whether it uses the bridge or not. The premises of the bridges rest on
what the renderers do not document, so `.github/workflows/renderers-latest.yml` runs the bridges' tests at the newest
versions the ranges accept.

## A wider form, not decided

Weighed with the owner on 20 November 2026, on the question whether the library should draw too; reasoned, not
decided. The package is no bridge to snabbdom but the view's own vocabulary, as data, over snabbdom's `patch`:

- a node's handler holds a message, not a function, so a walk of the tree finds every message a view can send, with
  any test and no DOM, as `messagesSentBy` does today for snabbdom alone;
- a child's view is lifted by a node that wraps its messages, as Elm's `Html.map`, so a view is `(model) => Node` and
  takes no dispatch, and its views need no dispatch that stays the same function (`forwardTo`'s cache);
- a node of an input names its input, and the renderer keeps its element by `edited` and `drawn`: no user writes or
  copies that part.

It costs a second product to keep, with the DOM's own cases, and "views are generic over their node type" (`AGENTS.md`)
stays true only of the library, with the view apart. Weighed with it and not proposed: a `patch` of the library's own,
whose cases of the DOM are not what the library is for, while snabbdom is small enough to keep a copy of; and another
renderer under the bridges, where lit-html's `render` is the one that fits beside snabbdom (drawn at once, no
component), but its templates are no tree a test can walk. It would have a name of its own; whether `/snabbdom` stays
beside it is open.

Rejected by the owner on 23 November 2026, on the advice of the review of the architecture: the entry of
[`rejected.md`](../rejected.md), "A view of the library's own", says why.
