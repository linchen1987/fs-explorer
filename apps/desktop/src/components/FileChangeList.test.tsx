import type { FileChange } from "@fs-explorer/core"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FileChangeList } from "./FileChangeList"

function changedFile(index: number): FileChange {
  return {
    status: "M",
    oldPath: null,
    newPath: `src/file-${index}.ts`,
    additions: 1,
    deletions: 0,
  }
}

describe("FileChangeList 大量文件", () => {
  it("历史与分支对比共用的列表只挂载可见文件", () => {
    const files = Array.from({ length: 10_000 }, (_, index) => changedFile(index))
    const html = renderToString(
      <FileChangeList
        files={files}
        viewMode="flat"
        selectedPath={null}
        onSelect={() => {}}
      />,
    )

    expect(html).toContain("file-0.ts")
    expect(html).not.toContain("file-9999.ts")
    expect((html.match(/data-index=/g) ?? []).length).toBeLessThan(50)
  })

  it("树形模式同样只挂载可见目录和文件", () => {
    const files = Array.from({ length: 1_000 }, (_, index) => changedFile(index))
    const html = renderToString(
      <FileChangeList
        files={files}
        viewMode="tree"
        selectedPath={null}
        onSelect={() => {}}
      />,
    )

    expect(html).toContain("src")
    expect(html).toContain("file-0.ts")
    expect(html).not.toContain("file-999.ts")
  })
})
