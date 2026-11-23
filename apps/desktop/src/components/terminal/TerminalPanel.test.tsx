import type { Project } from "@fs-explorer/core"
import { renderToString } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import TerminalPanel from "./TerminalPanel"

const mocks = vi.hoisted(() => ({
  project: null as Project | null,
}))

vi.mock("@/stores/projects", () => ({
  useSelectedProject: () => mocks.project,
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

const firstProject: Project = {
  path: "/repos/first",
  name: "first",
  addedAt: "2026-01-01T00:00:00Z",
  isGitRepo: true,
}

const secondProject: Project = {
  path: "/repos/second",
  name: "second",
  addedAt: "2026-01-02T00:00:00Z",
  isGitRepo: true,
}

function renderPanel() {
  return renderToString(
    <TooltipProvider>
      <TerminalPanel
        repo={firstProject.path}
        projectName={firstProject.name}
        visible
        onHide={() => {}}
      />
    </TooltipProvider>,
  )
}

vi.stubGlobal("window", { innerHeight: 800 })

afterAll(() => {
  vi.unstubAllGlobals()
})

describe("TerminalPanel 项目切换入口", () => {
  beforeEach(() => {
    mocks.project = secondProject
  })

  it("当前项目与终端项目不同时显示切换按钮", () => {
    const html = renderPanel()

    expect(html).toContain("将终端切换到second")
    expect(html).toMatch(/切换到 (?:<!-- -->)?second/)
  })

  it("当前项目与终端项目相同时不显示切换按钮", () => {
    mocks.project = firstProject

    expect(renderPanel()).not.toContain("将终端切换到")
  })

  it("没有选中项目时不显示切换按钮", () => {
    mocks.project = null

    expect(renderPanel()).not.toContain("将终端切换到")
  })
})
