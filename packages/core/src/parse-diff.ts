/**
 * 解析 `git diff` 的 unified diff 文本输出。
 *
 * 支持：多文件、新增/删除文件、重命名(rename from/to + similarity)、
 * 二进制文件、模式变更、"\ No newline at end of file"、带引号的路径。
 */

export type DiffLineType = "context" | "add" | "del"

export interface DiffLine {
  type: DiffLineType
  /** 行内容（不含 +/- 前缀） */
  content: string
  /** 旧文件行号；新增行为 null */
  oldNumber: number | null
  /** 新文件行号；删除行为 null */
  newNumber: number | null
  /** 该行末尾没有换行符（`\ No newline at end of file`） */
  noNewline: boolean
}

export interface DiffHunk {
  /** 完整 hunk 头，如 `@@ -1,7 +1,9 @@ function foo()` */
  header: string
  /** hunk 头中的上下文文字（`@@ ... @@` 之后的部分，可为空） */
  context: string
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface FileDiff {
  oldPath: string | null
  newPath: string | null
  isNewFile: boolean
  isDeletedFile: boolean
  isBinary: boolean
  oldMode: string | null
  newMode: string | null
  rename: { from: string; to: string; similarity: number | null } | null
  hunks: DiffHunk[]
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** 去掉 git 可能添加的 C 骨架引号并做基本反转义 */
function unquotePath(s: string): string {
  if (!s.startsWith('"') || !s.endsWith('"') || s.length < 2) return s
  let out = ""
  const body = s.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === "\\") {
      const n = body[i + 1]
      if (n === undefined) break
      if (n === "n") out += "\n"
      else if (n === "t") out += "\t"
      else if (n === '"') out += '"'
      else if (n === "\\") out += "\\"
      else if (n >= "0" && n <= "7") {
        // 八进制转义，最多三位
        let oct = ""
        let j = i + 1
        while (j < body.length && oct.length < 3 && body[j] >= "0" && body[j] <= "7") {
          oct += body[j]
          j++
        }
        out += String.fromCodePoint(parseInt(oct, 8))
        i = j - 2
      } else out += n
      i++
    } else out += c
  }
  return out
}

/** 从 `--- a/x` / `+++ b/y` / `/dev/null` 行提取路径 */
function pathFromMarkerLine(line: string): string | null {
  const value = line.startsWith("--- ") || line.startsWith("+++ ")
    ? line.slice(4).trim()
    : null
  if (value == null) return null
  if (value === "/dev/null") return null
  const unquoted = unquotePath(value)
  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) return unquoted.slice(2)
  return unquoted
}

function newFileDiff(): FileDiff {
  return {
    oldPath: null,
    newPath: null,
    isNewFile: false,
    isDeletedFile: false,
    isBinary: false,
    oldMode: null,
    newMode: null,
    rename: null,
    hunks: [],
  }
}

/**
 * 解析 unified diff 文本，返回每个文件的解析结果（通常输入是单文件 diff）。
 */
export function parseUnifiedDiff(text: string): FileDiff[] {
  const files: FileDiff[] = []
  let cur: FileDiff | null = null
  let hunk: DiffHunk | null = null
  let oldNum = 0
  let newNum = 0

  const ensureCur = (): FileDiff => {
    if (cur === null) {
      cur = newFileDiff()
      files.push(cur)
    }
    return cur
  }

  const lines = text.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line === "") {
      // 文件 diff 末尾或文件之间的空行。
      // 注意：hunk 内真正的空上下文行 git 总是输出为一个空格 " "，走下面的分支，
      // 因此这里的空行直接忽略（避免把 diff 结尾的换行误判为上下文行）。
      continue
    }

    if (line.startsWith("diff --git ")) {
      cur = newFileDiff()
      files.push(cur)
      hunk = null
      continue
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      ensureCur().isBinary = true
      hunk = null
      continue
    }
    if (line.startsWith("old mode ")) {
      ensureCur().oldMode = line.slice("old mode ".length).trim()
      continue
    }
    if (line.startsWith("new mode ")) {
      ensureCur().newMode = line.slice("new mode ".length).trim()
      continue
    }
    if (line.startsWith("new file mode ")) {
      const f = ensureCur()
      f.isNewFile = true
      f.newMode = line.slice("new file mode ".length).trim()
      continue
    }
    if (line.startsWith("deleted file mode ")) {
      const f = ensureCur()
      f.isDeletedFile = true
      f.oldMode = line.slice("deleted file mode ".length).trim()
      continue
    }
    if (line.startsWith("similarity index ")) {
      const f = ensureCur()
      const pct = parseInt(line.slice("similarity index ".length).trim(), 10)
      if (f.rename) f.rename.similarity = Number.isNaN(pct) ? null : pct
      else f.rename = { from: "", to: "", similarity: Number.isNaN(pct) ? null : pct }
      continue
    }
    if (line.startsWith("rename from ")) {
      const f = ensureCur()
      const from = unquotePath(line.slice("rename from ".length))
      if (f.rename) f.rename.from = from
      else f.rename = { from, to: "", similarity: null }
      continue
    }
    if (line.startsWith("rename to ")) {
      const f = ensureCur()
      const to = unquotePath(line.slice("rename to ".length))
      if (f.rename) f.rename.to = to
      else f.rename = { from: "", to, similarity: null }
      continue
    }
    if (line.startsWith("copy from ") || line.startsWith("copy to ")) continue
    if (line.startsWith("index ")) continue
    if (line.startsWith("--- ")) {
      const f = ensureCur()
      f.oldPath = pathFromMarkerLine(line)
      continue
    }
    if (line.startsWith("+++ ")) {
      const f = ensureCur()
      f.newPath = pathFromMarkerLine(line)
      continue
    }

    const hunkMatch = HUNK_RE.exec(line)
    if (hunkMatch) {
      const f = ensureCur()
      hunk = {
        header: line,
        context: hunkMatch[5].trim(),
        oldStart: parseInt(hunkMatch[1], 10),
        newStart: parseInt(hunkMatch[3], 10),
        lines: [],
      }
      f.hunks.push(hunk)
      oldNum = hunk.oldStart
      newNum = hunk.newStart
      continue
    }

    if (line.startsWith("\\")) {
      // "\ No newline at end of file" —— 标记到前一行
      if (hunk && hunk.lines.length > 0) {
        hunk.lines[hunk.lines.length - 1].noNewline = true
      }
      continue
    }

    if (hunk !== null) {
      const first = line[0]
      if (first === "+") {
        hunk.lines.push({
          type: "add",
          content: line.slice(1),
          oldNumber: null,
          newNumber: newNum++,
          noNewline: false,
        })
      } else if (first === "-") {
        hunk.lines.push({
          type: "del",
          content: line.slice(1),
          oldNumber: oldNum++,
          newNumber: null,
          noNewline: false,
        })
      } else {
        // 上下文行（以空格开头）
        hunk.lines.push({
          type: "context",
          content: line.slice(1),
          oldNumber: oldNum++,
          newNumber: newNum++,
          noNewline: false,
        })
      }
    }
    // hunk 之外的行忽略（不应出现）
  }

  return files
}

/** 统计一个文件 diff 中的新增/删除行数 */
export function diffStats(file: FileDiff): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.type === "add") additions++
      else if (l.type === "del") deletions++
    }
  }
  return { additions, deletions }
}
