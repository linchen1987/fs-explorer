import { describe, expect, it } from "vitest"
import { EMPTY_FILE_HISTORY, moveFileHistory, pushFileHistory } from "./file-history"

describe("file history", () => {
  it("记录新文件并避免重复记录当前文件", () => {
    const first = pushFileHistory(EMPTY_FILE_HISTORY, "README.md")
    const second = pushFileHistory(first, "docs/guide.md")

    expect(pushFileHistory(second, "docs/guide.md")).toBe(second)
    expect(second).toEqual({ paths: ["README.md", "docs/guide.md"], index: 1 })
  })

  it("支持后退和前进且不添加新记录", () => {
    const history = {
      paths: ["README.md", "docs/guide.md", "src/main.ts"],
      index: 2,
    }
    const back = moveFileHistory(history, -1)
    const forward = moveFileHistory(back, 1)

    expect(back).toEqual({ ...history, index: 1 })
    expect(forward).toEqual(history)
    expect(moveFileHistory(history, 1)).toBe(history)
    expect(moveFileHistory(EMPTY_FILE_HISTORY, -1)).toBe(EMPTY_FILE_HISTORY)
  })

  it("后退后打开新文件会截断前进记录", () => {
    const history = {
      paths: ["README.md", "docs/guide.md", "src/main.ts"],
      index: 2,
    }
    const back = moveFileHistory(history, -1)

    expect(pushFileHistory(back, "docs/new.md")).toEqual({
      paths: ["README.md", "docs/guide.md", "docs/new.md"],
      index: 2,
    })
  })
})
