import { describe, expect, it } from "vitest"
import type { FileChange, StatusEntry } from "./types"
import { buildFileChangeTree, buildStatusTree, flattenVisiblePathTree } from "./status-tree"

function statusEntry(path: string): StatusEntry {
  return {
    path,
    oldPath: null,
    indexStatus: ".",
    worktreeStatus: "M",
    untracked: false,
    conflicted: false,
  }
}

describe("buildStatusTree", () => {
  it("按目录归组文件，目录优先并保持同组原有顺序", () => {
    const entries = [
      statusEntry("README.md"),
      statusEntry("src/main.ts"),
      statusEntry("src/components/Button.tsx"),
      statusEntry("src/components/Dialog.tsx"),
      statusEntry("package.json"),
    ]

    const tree = buildStatusTree(entries)
    expect(tree.map((node) => node.path)).toEqual(["src", "README.md", "package.json"])

    const src = tree[0]
    if (src?.kind !== "directory") throw new Error("src 应为目录")
    expect(src.fileCount).toBe(3)
    expect(src.children.map((node) => node.path)).toEqual(["src/components", "src/main.ts"])

    const components = src.children[0]
    if (components?.kind !== "directory") throw new Error("components 应为目录")
    expect(components.fileCount).toBe(2)
    expect(components.children.map((node) => node.path)).toEqual([
      "src/components/Button.tsx",
      "src/components/Dialog.tsx",
    ])
  })

  it("保留原始状态条目，不复制或丢失文件元数据", () => {
    const entry = {
      ...statusEntry("src/new-name.ts"),
      oldPath: "src/old-name.ts",
      indexStatus: "R",
      worktreeStatus: ".",
    }
    const tree = buildStatusTree([entry])
    const src = tree[0]
    if (src?.kind !== "directory") throw new Error("src 应为目录")
    const file = src.children[0]

    expect(file?.kind).toBe("file")
    if (file?.kind !== "file") throw new Error("文件节点缺失")
    expect(file.name).toBe("new-name.ts")
    expect(file.entry).toBe(entry)
    expect(buildStatusTree([])).toEqual([])
  })
})

describe("flattenVisiblePathTree", () => {
  it("保留树形顺序和深度，并跳过折叠目录的后代", () => {
    const tree = buildStatusTree([
      statusEntry("src/components/Button.tsx"),
      statusEntry("src/main.ts"),
      statusEntry("README.md"),
    ])

    expect(flattenVisiblePathTree(tree, new Set()).map(({ node, depth }) => [node.path, depth])).toEqual([
      ["src", 0],
      ["src/components", 1],
      ["src/components/Button.tsx", 2],
      ["src/main.ts", 1],
      ["README.md", 0],
    ])

    expect(flattenVisiblePathTree(tree, new Set(["src"])).map(({ node }) => node.path)).toEqual([
      "src",
      "README.md",
    ])
  })
})

describe("buildFileChangeTree", () => {
  it("使用变更后的路径构树并保留完整文件信息", () => {
    const file: FileChange = {
      status: "R",
      oldPath: "src/old-name.ts",
      newPath: "docs/new-name.ts",
      additions: 4,
      deletions: 2,
    }
    const tree = buildFileChangeTree([file])
    const docs = tree[0]
    if (docs?.kind !== "directory") throw new Error("docs 应为目录")
    const child = docs.children[0]

    expect(docs.fileCount).toBe(1)
    expect(child).toMatchObject({ kind: "file", name: "new-name.ts", path: "docs/new-name.ts" })
    if (child?.kind !== "file") throw new Error("文件节点缺失")
    expect(child.entry).toBe(file)
  })
})
