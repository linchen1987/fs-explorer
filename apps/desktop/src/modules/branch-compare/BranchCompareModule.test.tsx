import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  refreshListeners: [] as Array<() => void>,
  useAsync: vi.fn(),
  reloads: {
    branches: vi.fn(),
    compare: vi.fn(),
    diff: vi.fn(),
  },
}))

vi.mock("@/lib/events", () => ({
  useRefreshListener: (callback: () => void) => {
    mocks.refreshListeners.push(callback)
  },
}))

vi.mock("@/lib/async", () => ({
  errText: String,
  useAsync: mocks.useAsync,
}))

import { BranchCompareModule } from "./BranchCompareModule"

function asyncState(loading: boolean, reload: () => void) {
  return { data: null, error: null, loading, reload }
}

describe("BranchCompareModule refresh", () => {
  beforeEach(() => {
    mocks.refreshListeners.length = 0
    Object.values(mocks.reloads).forEach((reload) => reload.mockReset())
    mocks.useAsync.mockReset()
    mocks.useAsync
      .mockImplementationOnce(() => asyncState(true, mocks.reloads.branches))
      .mockImplementationOnce(() => asyncState(false, mocks.reloads.compare))
      .mockImplementationOnce(() => asyncState(false, mocks.reloads.diff))
  })

  it("全局刷新同时重新请求分支、对比结果和当前文件 Diff", () => {
    renderToString(
      <BranchCompareModule
        project={{ path: "/repo", name: "repo", addedAt: "2026-01-01", isGitRepo: true }}
        active
      />,
    )

    expect(mocks.refreshListeners.length).toBeGreaterThan(0)
    mocks.refreshListeners.forEach((callback) => callback())

    expect(mocks.reloads.branches).toHaveBeenCalledOnce()
    expect(mocks.reloads.compare).toHaveBeenCalledOnce()
    expect(mocks.reloads.diff).toHaveBeenCalledOnce()
  })
})
