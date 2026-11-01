import { describe, expect, it } from "vitest"
import { listFileTreeChildren, searchFilePaths } from "./file-tree"

const paths = [
  "README.md",
  "package10.json",
  "package2.json",
  "src/components/Button.tsx",
  "src/main.ts",
  "src/main.ts",
]

describe("listFileTreeChildren", () => {
  it("只构造直接子节点，去重并将目录排在文件前", () => {
    const root = listFileTreeChildren(paths)
    expect(root.total).toBe(4)
    expect(root.nodes).toEqual([
      { name: "src", path: "src", kind: "directory" },
      { name: "README.md", path: "README.md", kind: "file" },
      { name: "package10.json", path: "package10.json", kind: "file" },
      { name: "package2.json", path: "package2.json", kind: "file" },
    ])

    expect(listFileTreeChildren(paths, "src")).toEqual({
      total: 2,
      nodes: [
        { name: "components", path: "src/components", kind: "directory" },
        { name: "main.ts", path: "src/main.ts", kind: "file" },
      ],
    })
  })

  it("限制返回节点数但保留直接子节点总数", () => {
    const page = listFileTreeChildren(paths, "", 2)
    expect(page.total).toBe(4)
    expect(page.nodes.map((node) => node.path)).toEqual(["src", "README.md"])
    expect(listFileTreeChildren(paths, "", 0).nodes).toEqual([])
  })
})

describe("searchFilePaths", () => {
  it("按完整路径进行大小写不敏感搜索", () => {
    expect(searchFilePaths(paths, "BUTTON")).toEqual({
      paths: ["src/components/Button.tsx"],
      total: 1,
    })
    expect(searchFilePaths(paths, "没有匹配")).toEqual({ paths: [], total: 0 })
    expect(searchFilePaths(paths, "  ")).toEqual({ paths: [], total: 0 })
  })

  it("限制渲染结果并保留全部命中数", () => {
    expect(searchFilePaths([...new Set(paths)], "src/", 1)).toEqual({
      paths: ["src/components/Button.tsx"],
      total: 2,
    })
  })
})
