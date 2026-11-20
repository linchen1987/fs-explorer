import type { Project } from "@fs-explorer/core"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MainArea } from "./MainArea"

const mocks = vi.hoisted(() => ({
  project: null as Project | null,
  refreshStatus: vi.fn(),
}))

vi.mock("@/stores/projects", () => ({
  useProjectsStore: (selector: (state: unknown) => unknown) => selector({
    projects: mocks.project ? [mocks.project] : [],
    selectedPath: mocks.project?.path ?? null,
    statuses: {},
    statusLoading: {},
    refreshStatus: mocks.refreshStatus,
  }),
  useSelectedProject: () => mocks.project,
}))

vi.mock("@/modules/registry", () => ({
  MODULES: [
    { id: "worktree", title: "工作区", icon: () => null, component: () => null, requiresGit: true },
    { id: "files", title: "文件", icon: () => null, component: () => null, requiresGit: false },
    { id: "history", title: "提交历史", icon: () => null, component: () => null, requiresGit: true },
    { id: "branch-compare", title: "分支对比", icon: () => null, component: () => null, requiresGit: true },
  ],
}))

const project: Project = {
  path: "/tmp/plain-directory",
  name: "plain-directory",
  addedAt: "2026-01-01T00:00:00Z",
  isGitRepo: false,
}

function renderMainArea() {
  return renderToString(
    <TooltipProvider>
      <MainArea />
    </TooltipProvider>,
  )
}

function moduleTrigger(html: string, title: string) {
  const trigger = html.match(/<button\b[^>]*>.*?<\/button>/g)
    ?.find((item) => item.includes("data-slot=\"tabs-trigger\"") && item.includes(title))
  expect(trigger, `缺少模块页签：${title}`).toBeDefined()
  return trigger!
}

describe("MainArea 普通目录", () => {
  beforeEach(() => {
    mocks.project = project
    mocks.refreshStatus.mockReset()
  })

  it("禁用 Git 模块并激活文件模块", () => {
    const html = renderMainArea()

    for (const title of ["工作区", "提交历史", "分支对比"]) {
      const trigger = moduleTrigger(html, title)
      expect(trigger).toContain("disabled=\"\"")
      expect(trigger).toContain("data-state=\"inactive\"")
    }
    const files = moduleTrigger(html, "文件")
    expect(files).not.toContain("disabled=\"\"")
    expect(files).toContain("data-state=\"active\"")
  })

  it("Git 仓库保留所有模块", () => {
    mocks.project = { ...project, isGitRepo: true }

    const html = renderMainArea()

    for (const title of ["工作区", "文件", "提交历史", "分支对比"]) {
      expect(moduleTrigger(html, title)).not.toContain("disabled=\"\"")
    }
    expect(moduleTrigger(html, "工作区")).toContain("data-state=\"active\"")
  })
})
