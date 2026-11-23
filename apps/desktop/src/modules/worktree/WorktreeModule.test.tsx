import type { WorktreeStatus } from "@fs-explorer/core"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  status: {
    data: null as WorktreeStatus | null,
    error: null as string | null,
    loading: true,
    reload: vi.fn(),
  },
  openFile: vi.fn(),
}))

vi.mock("@/stores/projects", () => ({
  useProjectStatus: () => mocks.status,
}))

vi.mock("@/stores/file-navigation", () => ({
  useFileNavigationStore: (selector: (state: { openFile: typeof mocks.openFile }) => unknown) =>
    selector({ openFile: mocks.openFile }),
}))

vi.mock("@/lib/events", () => ({
  useRefreshListener: () => {},
}))

vi.mock("@/lib/async", async (importActual) => ({
  ...await importActual<typeof import("@/lib/async")>(),
  useAsync: () => ({ data: null, error: null, loading: false, reload: vi.fn() }),
}))

import { WorktreeModule } from "./WorktreeModule"

const statusWithFile: WorktreeStatus = {
  branch: "main",
  headSha: "abcdef1",
  detached: false,
  upstream: null,
  ahead: null,
  behind: null,
  entries: [{
    path: "src/existing-file.ts",
    oldPath: null,
    indexStatus: ".",
    worktreeStatus: "M",
    untracked: false,
    conflicted: false,
  }],
}

function renderModule() {
  return renderToString(
    <WorktreeModule
      project={{ path: "/repo", name: "repo", addedAt: "2026-01-01", isGitRepo: true }}
      active
    />,
  )
}

describe("WorktreeModule 刷新", () => {
  beforeEach(() => {
    mocks.status.error = null
    mocks.status.loading = true
    mocks.status.data = statusWithFile
  })

  it("已有数据的后台刷新保留列表并显示轻量状态", () => {
    const html = renderModule()

    expect(html).toContain("existing-file.ts")
    expect(html).toContain("animate-spin")
    expect(html).not.toContain("data-slot=\"skeleton\"")
  })

  it("仅首次加载显示整页骨架屏", () => {
    mocks.status.data = null

    const html = renderModule()

    expect(html).toContain("data-slot=\"skeleton\"")
  })
})
