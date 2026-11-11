import { parseDocument, stringify } from "yaml"

export interface FrontMatterEntry {
  name: string
  value: string
}

export interface MarkdownFrontMatter {
  raw: string
  entries: FrontMatterEntry[] | null
}

export interface MarkdownWithFrontMatter {
  body: string
  frontMatter: MarkdownFrontMatter | null
}

function parseEntries(raw: string): FrontMatterEntry[] | null {
  const document = parseDocument(raw)
  if (document.errors.length > 0) return null

  const value = document.toJS() as unknown
  if (value === null) return []
  if (typeof value !== "object" || Array.isArray(value)) return null

  return Object.entries(value).map(([name, entryValue]) => ({
    name,
    value: typeof entryValue === "string" ? entryValue : stringify(entryValue).trimEnd(),
  }))
}

export function parseMarkdownFrontMatter(markdown: string): MarkdownWithFrontMatter {
  const opening = /^(?:\uFEFF)?---[\t ]*(?:\r\n|\n|\r)/.exec(markdown)
  if (!opening) return { body: markdown, frontMatter: null }

  const closing = /^---[\t ]*(?:\r\n|\n|\r|$)/gm
  closing.lastIndex = opening[0].length
  const end = closing.exec(markdown)
  if (!end) return { body: markdown, frontMatter: null }

  const raw = markdown.slice(opening[0].length, end.index)
  return {
    body: markdown.slice(end.index + end[0].length),
    frontMatter: { raw, entries: parseEntries(raw) },
  }
}
