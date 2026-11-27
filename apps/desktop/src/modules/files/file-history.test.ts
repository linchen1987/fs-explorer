import { describe, expect, it } from "vitest"
import { EMPTY_FILE_HISTORY, moveFileHistory, pushFileHistory, removeDeletedPath } from "./file-history"

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

  it("删除当前文件时清空失效的查看与导航状态", () => {
    const history = { paths: ["README.md", "src/main.ts"], index: 1 }

    expect(removeDeletedPath(history, "src/main.ts", "file")).toBe(EMPTY_FILE_HISTORY)
    expect(removeDeletedPath(history, "missing.txt", "file")).toBe(history)
  })

  it("删除其他历史文件时保留当前文件并修正索引", () => {
    const history = {
      paths: ["deleted.txt", "keep.txt", "deleted.txt", "current.txt", "future.txt"],
      index: 3,
    }

    expect(removeDeletedPath(history, "deleted.txt", "file")).toEqual({
      paths: ["keep.txt", "current.txt", "future.txt"],
      index: 1,
    })
  })

  it("删除目录时清除其中所有文件历史，当前文件在目录内则关闭查看器", () => {
    const history = {
      paths: ["src/old.txt", "README.md", "src/nested/file.txt", "current.txt", "src-other/keep.txt"],
      index: 3,
    }

    expect(removeDeletedPath(history, "src", "directory")).toEqual({
      paths: ["README.md", "current.txt", "src-other/keep.txt"],
      index: 1,
    })
    expect(removeDeletedPath({ ...history, index: 2 }, "src", "directory")).toBe(EMPTY_FILE_HISTORY)
  })
})
