// Copies the guide's promises into the doc comments of the public API, so that each promise is written once, in the
// guide (`site/guide/`), and still reaches whoever reads the declarations of the version they installed. A comment
// asks for a promise with a line of its own after `@remarks`:
//
//   * @remarks
//   * From the guide, "Guarantees", "A frame says what it has seen":
//
// where the first name is the page's `title`, and the second a heading of that page, or the bold title a list item
// or a paragraph starts with, without its final period. Everything from the first such line to the end of the comment
// is this script's, so `@remarks` comes last, and the comment ends with `*/` on a line of its own: it writes, under
// each line, the text the guide gives there, with its links as plain text and wrapped to 120 columns. The comments are
// committed, as `src/` is what a consumer under Bun reads. `--check` writes nothing, and fails when a comment differs
// from the guide, names what the guide does not have, or links the site, whose pages are those of the latest release
// and not of the version installed. Both fail, writing nothing, on what would ship a note meant for the implementation
// to whoever installs the package: a doc comment right after another, or `@privateRemarks`.
//
//   bun quotes/quote.ts [--check]
import { Glob } from 'bun'
import { basename, join, relative } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..')
const width = 120
const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } })
const problems: Array<string> = []

const pages = new Map<string, ReadonlyArray<string>>()
// A page by its file, for a link: `inputs-the-user-types-into.md`.
const titles = new Map<string, string>()
for await (const path of new Glob('site/guide/*.md').scan({ cwd: root })) {
  const lines = (await Bun.file(join(root, path)).text()).split(/\r?\n/)
  const title = lines.find((line) => line.startsWith('title: '))?.slice('title: '.length)
  if (title === undefined) problems.push(`${path} has no title.`)
  else {
    pages.set(title, lines)
    titles.set(basename(path), title)
  }
}

const indentOf = (line: string) => line.length - line.trimStart().length

// The lines of a section, a list item or a paragraph, as the guide writes them, without its heading or its list marker.
const sectionOf = (lines: ReadonlyArray<string>, title: string): ReadonlyArray<string> | string => {
  const found: Array<ReadonlyArray<string>> = []
  lines.forEach((line, at) => {
    const [, hashes, heading] = /^(#{2,6}) (.+)$/.exec(line) ?? []
    if (hashes !== undefined && heading === title) {
      const end = lines.findIndex((next, i) => i > at && /^#{1,6} /.test(next) && next.indexOf(' ') <= hashes.length)
      found.push(lines.slice(at + 1, end === -1 ? lines.length : end))
      return
    }
    const [, spaces = '', dash, bold] = /^(\s*)(- )?\*\*(.+?)\*\*/.exec(line) ?? []
    if (bold?.replace(/\.$/, '') !== title) return
    const indent = spaces.length
    if (dash === undefined) {
      if (indent !== 0) return
      const end = lines.findIndex((next, i) => i > at && next.trim() === '')
      found.push(lines.slice(at, end === -1 ? lines.length : end))
      return
    }
    const after = lines.slice(at + 1)
    const ends = after.findIndex((next, i) => {
      if (next.trim() !== '') return indentOf(next) <= indent
      const later = after.slice(i).find((one) => one.trim() !== '')
      return later === undefined || indentOf(later) <= indent
    })
    const inner = indent + 2
    const dedent = (item: string, i: number) => item.slice(i === 0 ? inner : Math.min(inner, indentOf(item)))
    found.push(lines.slice(at, ends === -1 ? lines.length : at + 1 + ends).map(dedent))
  })
  const [section, ...others] = found
  if (section === undefined) return 'is not there'
  return others.length > 0 ? 'is there more than once' : section
}

// A link as plain text, since a comment is read where the guide is not: a link to a page of the guide as the page's
// title in quotes, as the lines that ask for a quote name it; one to a section of the same page as its text in quotes;
// one to anywhere else, or whose text is code, as its text.
const linked = (name: string, to: string) => {
  if (/^https?:/.test(to) || name.startsWith('`')) return name
  const page = titles.get(basename(to.replace(/#.*$/, '')))
  return page === undefined ? `"${name}"` : `"${page}"`
}

type Item = { indent: number; marker: string; text: string }

// The section as the lines of a comment: its links as their text, each paragraph and list item wrapped to `room`.
const reflow = (section: ReadonlyArray<string>, room: number): ReadonlyArray<string> | string => {
  const blocks: Array<Array<string>> = []
  let block: Array<string> = []
  for (const line of [...section, '']) {
    if (line.trim() !== '') block.push(line)
    else if (block.length > 0) {
      blocks.push(block)
      block = []
    }
  }
  const out: Array<string> = []
  for (const lines of blocks) {
    const items: Array<Item> = []
    for (const line of lines) {
      if (/^\s*(```|\||:::|#{1,6} |\[[^\]]+\]:)/.test(line) || line.includes('{@') || line.includes('*/')) {
        return `holds what a comment cannot quote: ${line.trim()}`
      }
      const [, spaces, marker, text] = /^(\s*)(- |\d+\. )(.*)$/.exec(line) ?? []
      const last = items.at(-1)
      if (spaces !== undefined && marker !== undefined && text !== undefined) {
        items.push({ indent: spaces.length, marker, text })
      } else if (last !== undefined) last.text += ` ${line.trim()}`
      else items.push({ indent: indentOf(line), marker: '', text: line.trim() })
    }
    if (out.length > 0) out.push('')
    for (const { indent, marker, text } of items) {
      const plain = text
        .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_, name: string, to: string) => linked(name, to))
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, (_, name: string) => linked(name, 'https:'))
      let line = ' '.repeat(indent) + marker
      let empty = true
      for (const word of plain.split(/\s+/)) {
        if (!empty && line.length + 1 + word.length > room) {
          out.push(line)
          line = ' '.repeat(indent + marker.length) + word
        } else line += (empty ? '' : ' ') + word
        empty = false
      }
      out.push(line)
    }
  }
  // A line of a comment that starts with `@` is a tag.
  const tag = out.find((line) => line.trimStart().startsWith('@'))
  return tag === undefined ? out : `would start a line with a tag: ${tag.trim()}`
}

const marker = /^(\s*)\* From the guide, "([^"]+)", "(.+)":$/
const stale: Array<string> = []
const changed = new Map<string, string>()
for await (const path of new Glob('src/**/*.ts').scan({ cwd: root })) {
  if (/\.test(_\w+)?\.ts$/.test(path)) continue
  const file = join(root, path)
  const text = await Bun.file(file).text()
  // As the file ends its lines, which a checkout may have turned into CRLF.
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const name = relative(root, file).replaceAll('\\', '/')
  // Whether the last line that is not blank closes a doc comment, and whether one is open.
  let closed = false
  let open = false
  lines.forEach((line, at) => {
    const trimmed = line.trim()
    if (!open && trimmed.startsWith('/**')) {
      // The declarations keep both, though the hover shows only the last: the first would ship unseen.
      if (closed) problems.push(`${name}:${at + 1} is a doc comment right after another: make them one.`)
      open = !trimmed.includes('*/')
      closed = !open
    } else if (open) {
      if (trimmed.includes('*/')) {
        open = false
        closed = true
      }
    } else if (trimmed !== '' && !trimmed.startsWith('//')) closed = false
    // The hover of whoever installs the package shows it: a note on the implementation is a `//` comment.
    if (line.includes('@privateRemarks')) {
      problems.push(`${name}:${at + 1} has \`@privateRemarks\`, which the declarations ship: write a \`//\` comment.`)
    }
    if (line.includes('fgaudo.github.io/effect-tea/')) {
      problems.push(`${name}:${at + 1} links the site, which shows the latest release: quote the guide instead.`)
    }
    if (line.includes('From the guide') && !marker.test(line)) {
      problems.push(`${name}:${at + 1} names the guide, but not as \`* From the guide, "<page>", "<title>":\`.`)
    }
  })
  const written: Array<string> = []
  let at = 0
  while (at < lines.length) {
    const line = lines[at] ?? ''
    const [, lead] = marker.exec(line) ?? []
    if (lead === undefined) {
      written.push(line)
      at++
      continue
    }
    if (lines[at - 1] !== `${lead}* @remarks`) problems.push(`${name}:${at + 1} does not follow a line \`@remarks\`.`)
    const end = lines.findIndex((next, i) => i > at && next.includes('*/'))
    if (end === -1 || !/^\s*\*\/\s*$/.test(lines[end] ?? '')) {
      problems.push(`${name}:${at + 1} is in a comment that does not end with \`*/\` on a line of its own.`)
      break
    }
    // Everything from the first line that asks for a quote is written again: a tag there would be lost.
    const lost = lines.slice(at, end).findIndex((next) => /^\s*\* @/.test(next))
    if (lost !== -1) problems.push(`${name}:${at + lost + 1} is a tag after the quotes: \`@remarks\` comes last.`)
    lines.slice(at, end).filter((asked) => marker.test(asked)).forEach((asked, i) => {
      const [, , page = '', title = ''] = marker.exec(asked) ?? []
      if (i > 0) written.push(`${lead}*`)
      written.push(asked, `${lead}*`)
      const guide = pages.get(page)
      const section = guide === undefined ? 'is in no page of the guide' : sectionOf(guide, title)
      const quoted = typeof section === 'string' ? section : reflow(section, width - lead.length - 2)
      if (typeof quoted === 'string') problems.push(`${name}: "${page}", "${title}" ${quoted}.`)
      else written.push(...quoted.map((quote) => (quote === '' ? `${lead}*` : `${lead}* ${quote}`)))
    })
    at = end
  }
  const result = written.join(eol)
  if (result === text) continue
  if (values.check) stale.push(name)
  else changed.set(file, result)
}
for (const name of stale) console.error(`${name} differs from the guide: run \`bun run quotes\` and commit it.`)
for (const problem of problems) console.error(problem)
if (problems.length > 0 || stale.length > 0) process.exit(1)
// Only once nothing is wrong: a quote that is missing writes nothing in its place.
for (const [file, result] of changed) await Bun.write(file, result)
