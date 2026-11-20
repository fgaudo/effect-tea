// Checks the doc comments of `src/` and of the bridges, which are written by hand and read in the hover of whoever
// installs the package. It fails on what would ship a note meant for the implementation to them: a doc comment right
// after another, which
// the declarations keep though the hover shows only the last, or `@privateRemarks`, which TypeDoc hides and the hover
// shows. It fails on a link to the site, whose pages are those of the latest release and not of the version installed.
// It fails on a block copied from the guide, as the comments once held. And a comment names the part of the guide it
// follows with a line of its own:
//
//   * @see The guide, "Inputs the user types into", "Settling an element".
//
// where the first name is the page's `title`, and the second, which may be left out, a heading of that page or the
// bold title a list item or a paragraph starts with, without its final period. It fails when the guide has no such
// page, or no such section, or has it more than once: a renamed section shows here, and whoever changes one finds the
// comments that follow it by its name.
//
//   bun tools/comments.ts
//   bun tools/comments.ts --help     the same, as the command describes itself
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Failed, main, repository } from "./cli.ts"

// How many sections of a page have the title: its headings, and the list items and paragraphs that start with it in
// bold.
const sectionsOf = (lines: ReadonlyArray<string>, title: string) =>
  lines.filter((line) => {
    const [, heading] = /^#{2,6} (.+)$/.exec(line) ?? []
    if (heading !== undefined) return heading === title
    const [, spaces = "", dash, bold] = /^(\s*)(- )?\*\*(.+?)\*\*/.exec(line) ?? []
    return bold?.replace(/\.$/, "") === title && (dash !== undefined || spaces === "")
  }).length

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
  {},
  Effect.fnUntraced(function*() {
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
    if (problems.length > 0) return yield* new Failed({ message: problems.join("\n") })
  })
)

main(command)
