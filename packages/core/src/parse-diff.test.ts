import { describe, expect, it } from "vitest"
import { diffStats, parseUnifiedDiff } from "./parse-diff"
import { splitPath, timeAgo } from "./utils"

describe("parseUnifiedDiff", () => {
  it("解析普通修改（含上下文与行号）", () => {
    const text = [
      "diff --git a/new.txt b/new.txt",
      "index d5a09df..0fe3216 100644",
      "--- a/new.txt",
      "+++ b/new.txt",
      "@@ -1 +1,2 @@",
      " brand new",
      "+staged edit",
      "",
    ].join("\n")

    const files = parseUnifiedDiff(text)
    expect(files).toHaveLength(1)
    const f = files[0]
    expect(f.oldPath).toBe("new.txt")
    expect(f.newPath).toBe("new.txt")
    expect(f.hunks).toHaveLength(1)
    const h = f.hunks[0]
    expect(h.oldStart).toBe(1)
    expect(h.newStart).toBe(1)
    expect(h.lines).toHaveLength(2)
    expect(h.lines[0]).toMatchObject({ type: "context", content: "brand new", oldNumber: 1, newNumber: 1 })
    expect(h.lines[1]).toMatchObject({ type: "add", content: "staged edit", oldNumber: null, newNumber: 2 })
    expect(diffStats(f)).toEqual({ additions: 1, deletions: 0 })
  })

  it("解析新文件（/dev/null）", () => {
    const text = [
      "diff --git a/untracked.txt b/untracked.txt",
      "new file mode 100644",
      "index 0000000..3f4c56d",
      "--- /dev/null",
      "+++ b/untracked.txt",
      "@@ -0,0 +1 @@",
      "+untracked content",
      "",
    ].join("\n")

    const f = parseUnifiedDiff(text)[0]
    expect(f.isNewFile).toBe(true)
    expect(f.oldPath).toBeNull()
    expect(f.newPath).toBe("untracked.txt")
    expect(f.hunks[0].lines[0]).toMatchObject({ type: "add", oldNumber: null, newNumber: 1 })
    // @@ -0,0 表示旧侧从 0 开始且无行
    expect(f.hunks[0].oldStart).toBe(0)
  })

  it("解析删除文件", () => {
    const text = [
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "index 3f4c56d..0000000",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-untracked content",
      "",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.isDeletedFile).toBe(true)
    expect(f.newPath).toBeNull()
    expect(f.hunks[0].lines[0]).toMatchObject({ type: "del", oldNumber: 1, newNumber: null })
  })

  it("解析重命名（similarity + rename from/to）", () => {
    const text = [
      "diff --git a/a.txt b/src/a.txt",
      "similarity index 100%",
      "rename from a.txt",
      "rename to src/a.txt",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.rename).toEqual({ from: "a.txt", to: "src/a.txt", similarity: 100 })
    expect(f.hunks).toHaveLength(0)
  })

  it("解析带内容修改的重命名", () => {
    const text = [
      "diff --git a/old.md b/new.md",
      "similarity index 95%",
      "rename from old.md",
      "rename to new.md",
      "index 1111111..2222222 100644",
      "--- a/old.md",
      "+++ b/new.md",
      "@@ -1,2 +1,2 @@",
      " # Title",
      "-old body",
      "+new body",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.rename?.similarity).toBe(95)
    expect(f.oldPath).toBe("old.md")
    expect(f.newPath).toBe("new.md")
    expect(diffStats(f)).toEqual({ additions: 1, deletions: 1 })
  })

  it("解析二进制文件", () => {
    const text = [
      "diff --git a/bin.dat b/bin.dat",
      "new file mode 100644",
      "index 0000000..e158ec5",
      "Binary files /dev/null and b/bin.dat differ",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.isBinary).toBe(true)
    expect(f.hunks).toHaveLength(0)
  })

  it("解析末尾无换行标记", () => {
    const text = [
      "diff --git a/f.txt b/f.txt",
      "index 1111111..2222222 100644",
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1 +1 @@",
      "-x",
      "\\ No newline at end of file",
      "+y",
      "\\ No newline at end of file",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    const lines = f.hunks[0].lines
    expect(lines[0].noNewline).toBe(true)
    expect(lines[1].noNewline).toBe(true)
  })

  it("解析模式变更（无内容 hunk）", () => {
    const text = [
      "diff --git a/run.sh b/run.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.oldMode).toBe("100644")
    expect(f.newMode).toBe("100755")
    expect(f.hunks).toHaveLength(0)
    expect(f.isBinary).toBe(false)
  })

  it("解析多个文件", () => {
    const text = [
      "diff --git a/a.txt b/a.txt",
      "index 111..222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/c.txt b/c.txt",
      "index 333..444 100644",
      "--- a/c.txt",
      "+++ b/c.txt",
      "@@ -1 +1 @@",
      "-c",
      "+d",
    ].join("\n")
    const files = parseUnifiedDiff(text)
    expect(files).toHaveLength(2)
    expect(files[0].newPath).toBe("a.txt")
    expect(files[1].newPath).toBe("c.txt")
  })

  it("解析带引号的路径（包含空格）", () => {
    const text = [
      'diff --git "a/spa ce.txt" "b/spa ce.txt"',
      "index 111..222 100644",
      '--- "a/spa ce.txt"',
      '+++ "b/spa ce.txt"',
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.oldPath).toBe("spa ce.txt")
    expect(f.newPath).toBe("spa ce.txt")
  })

  it("no-index diff（+++ 无 b/ 前缀）", () => {
    const text = [
      "diff --git a/plain.txt b/plain.txt",
      "index 0000000..1234567 100644",
      "--- /dev/null",
      "+++ plain.txt",
      "@@ -0,0 +1 @@",
      "+content",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.newPath).toBe("plain.txt")
  })

  it("hunk 头中的函数上下文", () => {
    const text = [
      "diff --git a/x.ts b/x.ts",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -10,3 +10,4 @@ export function foo() {",
      "   let a = 1",
      "+  let b = 2",
      "   return a",
    ].join("\n")
    const f = parseUnifiedDiff(text)[0]
    expect(f.hunks[0].context).toBe("export function foo() {")
    expect(f.hunks[0].oldStart).toBe(10)
    expect(f.hunks[0].lines[0].oldNumber).toBe(10)
    expect(f.hunks[0].lines[0].newNumber).toBe(10)
    expect(f.hunks[0].lines[1].newNumber).toBe(11)
  })
})

describe("utils", () => {
  it("timeAgo", () => {
    const now = 1790000000
    expect(timeAgo(now - 10, now)).toBe("刚刚")
    expect(timeAgo(now - 300, now)).toBe("5 分钟前")
    expect(timeAgo(now - 7200, now)).toBe("2 小时前")
    expect(timeAgo(now - 3 * 86400, now)).toBe("3 天前")
  })

  it("splitPath", () => {
    expect(splitPath("src/lib/foo.ts")).toEqual({ dir: "src/lib/", base: "foo.ts" })
    expect(splitPath("foo.ts")).toEqual({ dir: "", base: "foo.ts" })
  })
})
