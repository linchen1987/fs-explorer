import { describe, expect, it } from "vitest"
import { parseMarkdownFrontMatter } from "./frontmatter"

describe("parseMarkdownFrontMatter", () => {
  it("将开头的 YAML Front Matter 解析为元数据并保留正文", () => {
    const result = parseMarkdownFrontMatter([
      "---",
      "title: FS Explorer",
      "published: true",
      "tags:",
      "  - git",
      "  - gui",
      "author:",
      "  name: Lin",
      "---",
      "# 正文",
      "",
    ].join("\n"))

    expect(result.body).toBe("# 正文\n")
    expect(result.frontMatter?.entries).toEqual([
      { name: "title", value: "FS Explorer" },
      { name: "published", value: "true" },
      { name: "tags", value: "- git\n- gui" },
      { name: "author", value: "name: Lin" },
    ])
  })

  it("支持 CRLF、BOM 和分隔线两侧的空格", () => {
    const result = parseMarkdownFrontMatter("\uFEFF--- \r\ntitle: Example\r\n---\t\r\nBody\r\n")

    expect(result.frontMatter?.entries).toEqual([{ name: "title", value: "Example" }])
    expect(result.body).toBe("Body\r\n")
  })

  it("只识别文档开头且闭合完整的 Front Matter", () => {
    const noOpening = "# Title\n---\ntitle: Not metadata\n---\n"
    expect(parseMarkdownFrontMatter(noOpening)).toEqual({ body: noOpening, frontMatter: null })

    const noClosing = "---\ntitle: Not closed\n"
    expect(parseMarkdownFrontMatter(noClosing)).toEqual({ body: noClosing, frontMatter: null })
  })

  it("只把独占一行的分隔线当作结束标记", () => {
    const result = parseMarkdownFrontMatter("---\ntitle: Example\n---not-a-delimiter\n---\nBody")

    expect(result.frontMatter?.raw).toBe("title: Example\n---not-a-delimiter\n")
    expect(result.body).toBe("Body")
  })

  it("YAML 无法解析或不是键值对象时保留原始内容", () => {
    const invalid = parseMarkdownFrontMatter("---\ntitle: [broken\n---\nBody")
    expect(invalid.frontMatter).toEqual({ raw: "title: [broken\n", entries: null })
    expect(invalid.body).toBe("Body")

    const list = parseMarkdownFrontMatter("---\n- one\n- two\n---\nBody")
    expect(list.frontMatter).toEqual({ raw: "- one\n- two\n", entries: null })
  })

  it("空的 Front Matter 不生成元数据行", () => {
    const result = parseMarkdownFrontMatter("---\n---\nBody")

    expect(result.frontMatter?.entries).toEqual([])
    expect(result.body).toBe("Body")
  })
})
