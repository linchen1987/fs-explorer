import { describe, expect, it } from "vitest"
import { isRemoteSource, resolveLocalPath } from "./markdown-links"

describe("Markdown links", () => {
  it("解析相对路径、仓库根路径和上级目录", () => {
    expect(resolveLocalPath("docs/guide/start.md", "./next.md")).toBe("docs/guide/next.md")
    expect(resolveLocalPath("docs/guide/start.md", "../api.md")).toBe("docs/api.md")
    expect(resolveLocalPath("docs/guide/start.md", "/README.md")).toBe("README.md")
  })

  it("忽略查询参数与锚点并解码 URL 路径", () => {
    expect(resolveLocalPath("docs/start.md", "./Hello%20World.md?draft=1#usage"))
      .toBe("docs/Hello World.md")
    expect(resolveLocalPath("docs/start.md", "#usage")).toBe("")
  })

  it("区分站外链接和本地链接", () => {
    expect(isRemoteSource("https://example.com")).toBe(true)
    expect(isRemoteSource("mailto:dev@example.com")).toBe(true)
    expect(isRemoteSource("../README.md")).toBe(false)
  })
})
