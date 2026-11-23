import type { StatusEntry } from "@fs-explorer/core"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WorktreeFileList } from "./WorktreeFileList"

function statusEntry(index: number): StatusEntry {
  return {
    path: `src/file-${index}.ts`,
    oldPath: null,
    indexStatus: ".",
    worktreeStatus: "M",
    untracked: false,
    conflicted: false,
  }
}

describe("WorktreeFileList 大量变更", () => {
  it("保留分组标题且只挂载可见文件行", () => {
    const changes = Array.from({ length: 10_000 }, (_, index) => statusEntry(index))
    const html = renderToString(
      <WorktreeFileList
        staged={[]}
        changes={changes}
        untracked={[]}
        viewMode="flat"
        selection={null}
        onSelect={() => {}}
        onOpen={() => {}}
        onStage={() => {}}
        onUnstage={() => {}}
      />,
    )

    expect(html).toContain("更改")
    expect(html).toContain("10000")
    expect(html).toContain("file-0.ts")
    expect(html).not.toContain("file-9999.ts")
    expect((html.match(/data-index=/g) ?? []).length).toBeLessThan(50)
  })
})
