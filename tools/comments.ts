// Checks the doc comments of `src/` and of the bridges, which are written by hand and read in the hover of whoever
// installs the package. It fails on what would ship a note meant for the implementation to them: a doc comment right
// after another, which
// the declarations keep though the hover shows only the last, or `@privateRemarks`, which TypeDoc hides and the hover
// shows. It fails on a link to the site, whose pages are those of the latest release and not of the version installed.
// It fails on a block copied from the guide, as the comments once held. And a comment names the part of the guide it
// follows with a line of its own:
//
//   * @see The guide, "Inputs", "Settling an element".
//
// where the first name is the page's `title`, and the second, which may be left out, a heading of that page or the
// bold title a list item or a paragraph starts with, without its final period. It fails when the guide has no such
// page, or no such section, or has it more than once: a renamed section shows here, and whoever changes one finds the
// comments that follow it by its name.
//
// It checks the titles the mutations (`tools/mutations/mutations.ts`) give of the items of "What you can rely on", in
// "Guarantees": it fails on a title the list does not have, and on an item that no mutation names. That is a tripwire
// for an item added, and no more: a title is written by hand, and says that a check of the item has a mutation, not
// that each sentence of the item has one. With `--guarantees`, it prints each item with the mutations that name it and
// the tests that kill them, beside the search (`src/interleaving.test.ts`), which checks each item and is the killer of
// no mutation (`change-engine`). Likewise for the items of "What does not compile", in "Anatomy of a program" and
// "Composition", which have no bold title: a mutation of the types names each by its page and the words it starts with.
//
//   bun tools/comments.ts
//   bun tools/comments.ts --guarantees
//   bun tools/comments.ts --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Failed, main, repository } from "./cli.ts"
import { mutations } from "./mutations/mutations.ts"

// How many sections of a page have the title: its headings, and the list items and paragraphs that start with it in
// bold.
const sectionsOf = (lines: ReadonlyArray<string>, title: string) =>
  lines.filter((line) => {
    const [, heading] = /^#{2,6} (.+)$/.exec(line) ?? []
    if (heading !== undefined) return heading === title
    const [, spaces = "", dash, bold] = /^(\s*)(- )?\*\*(.+?)\*\*/.exec(line) ?? []
    return bold?.replace(/\.$/, "") === title && (dash !== undefined || spaces === "")
  }).length

// The bold titles of the items of "What you can rely on", without their final period.
const reliedOn = (lines: ReadonlyArray<string>) => {
  const start = lines.indexOf("## What you can rely on")
  const end = lines.findIndex((line, at) => at > start && line.startsWith("## "))
  return start === -1 ? [] : lines.slice(start, end).flatMap((line) => {
    const [, bold] = /^- \*\*(.+?)\*\*/.exec(line) ?? []
    return bold === undefined ? [] : [bold.replace(/\.$/, "")]
  })
}

const naming = (item: string) => mutations.filter(({ guarantees = [] }) => guarantees.includes(item))

// The pages whose list "What does not compile" the mutations of the types name, as `refuses`.
const refusing = ["Anatomy of a program", "Composition"]

// The items of the list that follows the paragraph "What does not compile" of a page, each with its lines joined, and
// the items under it held in it.
const refusedIn = (lines: ReadonlyArray<string>) => {
  const start = lines.findIndex((line) => /^\*\*What does not compile[.:]\*\*/.test(line))
  const items: Array<string> = []
  if (start === -1) return items
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("- ")) items.push(line.slice(2))
    else if (line.startsWith("  ") && items.length > 0) items[items.length - 1] += ` ${line.trim()}`
    else if (items.length > 0) break
  }
  return items
}

// What the mutations of the types break, by the items of "What does not compile": each names an item by the words it
// starts with, which start that item alone, and each item is named.
const problemsOfRefusals = (pages: ReadonlyMap<string, ReadonlyArray<string>>) => {
  const problems: Array<string> = []
  const named = new Set<string>()
  for (const { name, refuses = [] } of mutations) {
    for (const [page, start] of refuses) {
      const items = refusing.includes(page) ? refusedIn(pages.get(page) ?? []) : []
      const found = items.filter((item) => item.startsWith(start))
      if (found.length === 1) named.add(`${page}\n${found[0]}`)
      else {
        problems.push(
          `tools/mutations/mutations.ts: "${name}" names "${start}", which starts ${found.length} items of "What does not compile" in "${page}".`
        )
      }
    }
  }
  for (const page of refusing) {
    const items = refusedIn(pages.get(page) ?? [])
    if (items.length === 0) problems.push(`The guide, "${page}": no list "What does not compile" is found.`)
    for (const item of items) {
      if (!named.has(`${page}\n${item}`)) {
        problems.push(
          `The guide, "${page}": no mutation names "${
            item.slice(0, 60)
          }…" of "What does not compile": name it in the mutations of the checks that hold it.`
        )
      }
    }
  }
  return problems
}

// What the titles of the mutations break, by the items of "What you can rely on".
const problemsOfMutations = (items: ReadonlyArray<string>) => [
  ...(items.length === 0 ? ["site/guide/guarantees.md has no item under \"What you can rely on\"."] : []),
  ...mutations.flatMap(({ guarantees = [], name }) =>
    guarantees.filter((title) => !items.includes(title)).map((title) =>
      `tools/mutations/mutations.ts: "${name}" names "${title}", which "What you can rely on" does not have.`
    )
  ),
  ...items.filter((item) => naming(item).length === 0).map((item) =>
    `site/guide/guarantees.md: no mutation names "${item}": name it in the mutations of the checks that hold it.`
  )
]

// Each item with the mutations that name it and the tests that kill them.
const index = (items: ReadonlyArray<string>) =>
  items.map((item) =>
    [
      `${item}.`,
      `  The search checks it, killing no mutation. ${naming(item).length} checks with a mutation name it:`,
      ...naming(item).flatMap(({ file, killedBy, name }) => [
        `  - ${name} (${file})`,
        ...killedBy.map(([file, test]) => `      ${file}: ${test}`)
      ])
    ].join("\n")
  ).join("\n\n")

const reference = /^\s*\* @see The guide, "([^"]+)"(?:, "([^"]+)")?\.$/

// What one file of `src/` or of `bridges/` breaks of the rules of the doc comments, by the pages of the guide.
const problemsOfSource = (name: string, text: string, pages: ReadonlyMap<string, ReadonlyArray<string>>) => {
  const problems: Array<string> = []
  // Whether the last line that is not blank closes a doc comment, and whether one is open.
  let closed = false
  let open = false
  text.split(/\r?\n/).forEach((line, at) => {
    const trimmed = line.trim()
    if (!open && trimmed.startsWith("/**")) {
      if (closed) problems.push(`${name}:${at + 1} is a doc comment right after another: make them one.`)
      open = !trimmed.includes("*/")
      closed = !open
    } else if (open) {
      if (trimmed.includes("*/")) {
        open = false
        closed = true
      }
    } else if (trimmed !== "" && !trimmed.startsWith("//")) closed = false
    if (line.includes("@privateRemarks")) {
      problems.push(`${name}:${at + 1} has \`@privateRemarks\`, which the declarations ship: write a \`//\` comment.`)
    }
    if (line.includes("fgaudo.github.io/effect-tea/")) {
      problems.push(`${name}:${at + 1} links the site, which shows the latest release: name the guide's section.`)
    }
    if (line.includes("From the guide")) {
      problems.push(`${name}:${at + 1} copies the guide: say it in the comment's own words, and name the section.`)
    }
    if (!/@see\b.*\bguide\b/i.test(line)) return
    const [, page = "", section] = reference.exec(line) ?? []
    const guide = pages.get(page)
    if (guide === undefined) {
      problems.push(`${name}:${at + 1} names the guide, but not as \`* @see The guide, "<page>", "<section>".\`.`)
      return
    }
    if (section === undefined) return
    const found = sectionsOf(guide, section)
    if (found !== 1) {
      problems.push(
        `${name}:${at + 1}: "${page}", "${section}" is ${found === 0 ? "not there" : "there more than once"}.`
      )
    }
  })
  return problems
}

// The skill the package ships names the sections of the guide its rules sum up the same way, `The guide, "<page>",
// "<section>"`, within its prose, where a name may be wrapped onto the next line. Inline code only shows the form.
const problemsOfSkill = (name: string, text: string, pages: ReadonlyMap<string, ReadonlyArray<string>>) => {
  const problems: Array<string> = []
  const prose = text.replace(/`[^`\n]*`/g, "``").replace(/\s+/g, " ")
  for (const [, page = "", section] of prose.matchAll(/The guide, "([^"]+)"(?:, "([^"]+)")?/g)) {
    const guide = pages.get(page)
    const found = guide === undefined || section === undefined ? 1 : sectionsOf(guide, section)
    if (guide === undefined) problems.push(`${name}: the guide has no page "${page}".`)
    else if (found !== 1) {
      problems.push(`${name}: "${page}", "${section}" is ${found === 0 ? "not there" : "there more than once"}.`)
    }
  }
  return problems
}

const command = Command.make(
  "comments",
  {
    guarantees: Flag.Boolean("guarantees").pipe(
      Flag.withDescription(
        "Prints each item of \"What you can rely on\" with the mutations that name it and the tests that kill them"
      ),
      Flag.withDefault(false)
    )
  },
  Effect.fnUntraced(function*({ guarantees }) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* repository
    const read = (file: string) => fs.readFileString(path.join(root, file))
    const problems: Array<string> = []
    const pages = new Map<string, ReadonlyArray<string>>()
    for (const name of yield* fs.glob("site/guide/*.md", { root })) {
      const lines = (yield* read(name)).split(/\r?\n/)
      const title = lines.find((line) => line.startsWith("title: "))?.slice("title: ".length)
      if (title === undefined) problems.push(`${name} has no title.`)
      else pages.set(title, lines)
    }
    for (const name of yield* fs.glob("{src/**,bridges}/*.ts", { root })) {
      if (!/\.test(_\w+)?\.ts$/.test(name)) problems.push(...problemsOfSource(name, yield* read(name), pages))
    }
    for (const name of yield* fs.glob("skills/*/SKILL.md", { root })) {
      problems.push(...problemsOfSkill(name, yield* read(name), pages))
    }
    const items = reliedOn(pages.get("Guarantees") ?? [])
    problems.push(...problemsOfMutations(items), ...problemsOfRefusals(pages))
    if (problems.length > 0) return yield* new Failed({ message: problems.join("\n") })
    if (guarantees) yield* Console.log(index(items))
  })
)

main(command)
