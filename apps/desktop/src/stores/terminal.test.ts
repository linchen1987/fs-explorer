import type { Project } from "@fs-explorer/core"
import { beforeEach, describe, expect, it } from "vitest"
import { useTerminalStore } from "./terminal"

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

describe("global terminal", () => {
  beforeEach(() => {
    useTerminalStore.setState({ session: null, visible: false })
  })

  it("在其他项目中隐藏并重新显示时保留原 shell 会话", () => {
    const { toggle } = useTerminalStore.getState()
    toggle(firstProject)
    const session = useTerminalStore.getState().session

    expect(useTerminalStore.getState().visible).toBe(true)
    expect(session).toEqual({ repo: firstProject.path, projectName: firstProject.name })

    toggle(secondProject)
    expect(useTerminalStore.getState().visible).toBe(false)
    expect(useTerminalStore.getState().session).toBe(session)

    toggle(secondProject)
    expect(useTerminalStore.getState().visible).toBe(true)
    expect(useTerminalStore.getState().session).toBe(session)
  })

  it("首次打开需要项目，已有会话后不依赖当前项目", () => {
    const { toggle } = useTerminalStore.getState()
    toggle(null)
    expect(useTerminalStore.getState().session).toBeNull()
    expect(useTerminalStore.getState().visible).toBe(false)

    toggle(firstProject)
    const session = useTerminalStore.getState().session
    toggle(null)

    expect(useTerminalStore.getState().visible).toBe(false)
    expect(useTerminalStore.getState().session).toBe(session)
  })

  it("手动切换项目时更新会话目录并保持终端打开", () => {
    const { toggle, switchProject } = useTerminalStore.getState()
    toggle(firstProject)
    const firstSession = useTerminalStore.getState().session

    switchProject(secondProject)

    expect(useTerminalStore.getState().visible).toBe(true)
    expect(useTerminalStore.getState().session).toEqual({
      repo: secondProject.path,
      projectName: secondProject.name,
    })
    expect(useTerminalStore.getState().session).not.toBe(firstSession)
  })

  it("重复切换到相同项目不会重复更新会话", () => {
    const { toggle, switchProject } = useTerminalStore.getState()
    toggle(firstProject)
    const session = useTerminalStore.getState().session
    useTerminalStore.getState().hide()

    switchProject(firstProject)

    expect(useTerminalStore.getState().visible).toBe(true)
    expect(useTerminalStore.getState().session).toBe(session)
  })

  it("shell 退出后清空会话，切换项目再打开时绑定当前项目", () => {
    const { toggle, reset } = useTerminalStore.getState()
    toggle(firstProject)
    expect(useTerminalStore.getState().session?.repo).toBe(firstProject.path)

    // shell 自然退出后面板调用 reset
    reset()

    expect(useTerminalStore.getState().session).toBeNull()
    expect(useTerminalStore.getState().visible).toBe(false)

    toggle(secondProject)
    expect(useTerminalStore.getState().session).toEqual({
      repo: secondProject.path,
      projectName: secondProject.name,
    })
    expect(useTerminalStore.getState().visible).toBe(true)
  })
})
