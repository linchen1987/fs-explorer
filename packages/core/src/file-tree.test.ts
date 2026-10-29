import { describe, expect, it } from "vitest"
import { buildFileTree, filterFileTree } from "./file-tree"

describe("buildFileTree", () => {
  it("构造去重文件树，并将目录排在文件前", () => {
    const tree = buildFileTree([
      "README.md",
      "src/main.ts",
      "src/components/Button.tsx",
      "src/main.ts",
      "package10.json",
      "package2.json",
    ])

    expect(tree.map((node) => node.name)).toEqual([
      "src",
      "package2.json",
      "package10.json",
      "README.md",
    ])
    expect(tree[0].children.map((node) => node.path)).toEqual([
      "src/components",
      "src/main.ts",
    ])
    expect(tree[0].children[0].children[0]).toMatchObject({
      name: "Button.tsx",
      path: "src/components/Button.tsx",
      kind: "file",
    })
  })

  it("支持按完整路径过滤并保留必要的父目录", () => {
    const tree = buildFileTree(["src/components/Button.tsx", "src/main.ts", "README.md"])
    const filtered = filterFileTree(tree, "button")

    expect(filtered).toHaveLength(1)
    expect(filtered[0].path).toBe("src")
    expect(filtered[0].children[0].children[0].path).toBe("src/components/Button.tsx")
    expect(filterFileTree(tree, "没有匹配")).toEqual([])
  })
})
