import type { Project } from "@fs-explorer/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useProjectsStore } from "./projects"

const mocks = vi.hoisted(() => ({
  renameProject: vi.fn(),
  reorderProjects: vi.fn(),
}))

vi.mock("@/lib/ipc", () => ({
  ipc: {
    renameProject: mocks.renameProject,
    reorderProjects: mocks.reorderProjects,
  },
}))

function project(name: string): Project {
  return {
    path: `/repos/${name}`,
    name,
    addedAt: "2026-01-01T00:00:00Z",
    isGitRepo: true,
  }
}

const first = project("first")
const second = project("second")
const third = project("third")
const originalProjects = [first, second, third]

function projectNames() {
  return useProjectsStore.getState().projects.map((p) => p.name)
}

describe("项目拖拽排序", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectsStore.setState({
      projects: originalProjects,
      selectedPath: second.path,
      statuses: {},
      statusLoading: {},
    })
  })

  it("立即更新列表，并把完整路径顺序保存到后端", async () => {
    let finishSave!: () => void
    mocks.reorderProjects.mockImplementation(() => new Promise<void>((resolve) => {
      finishSave = resolve
    }))

    const saving = useProjectsStore.getState().reorder([third, first, second])

    expect(projectNames()).toEqual(["third", "first", "second"])
    expect(mocks.reorderProjects).toHaveBeenCalledWith([
      third.path,
      first.path,
      second.path,
    ])
    expect(useProjectsStore.getState().selectedPath).toBe(second.path)

    finishSave()
    await saving
    expect(projectNames()).toEqual(["third", "first", "second"])
  })

  it("保存失败时恢复拖拽前顺序", async () => {
    mocks.reorderProjects.mockRejectedValue(new Error("磁盘不可写"))

    await expect(useProjectsStore.getState().reorder([third, first, second]))
      .rejects.toThrow("磁盘不可写")

    expect(projectNames()).toEqual(["first", "second", "third"])
    expect(useProjectsStore.getState().selectedPath).toBe(second.path)
  })

  it("旧请求失败不会撤销随后发起的新排序", async () => {
    let rejectFirst!: (error: Error) => void
    mocks.reorderProjects
      .mockImplementationOnce(() => new Promise<void>((_, reject) => {
        rejectFirst = reject
      }))
      .mockResolvedValueOnce(undefined)

    const firstSave = useProjectsStore.getState().reorder([third, first, second])
    const secondSave = useProjectsStore.getState().reorder([second, third, first])
    rejectFirst(new Error("第一次保存失败"))

    await expect(firstSave).rejects.toThrow("第一次保存失败")
    await secondSave
    expect(projectNames()).toEqual(["second", "third", "first"])
  })
})

describe("项目重命名", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectsStore.setState({
      projects: originalProjects,
      selectedPath: second.path,
      statuses: {},
      statusLoading: {},
    })
  })

  it("保存后端返回的显示名，并保持项目顺序和选择", async () => {
    const renamed = { ...second, name: "后端服务" }
    mocks.renameProject.mockResolvedValue(renamed)

    const result = await useProjectsStore.getState().rename(second.path, renamed.name)

    expect(mocks.renameProject).toHaveBeenCalledWith(second.path, "后端服务")
    expect(result).toEqual(renamed)
    expect(projectNames()).toEqual(["first", "后端服务", "third"])
    expect(useProjectsStore.getState().selectedPath).toBe(second.path)
    expect(useProjectsStore.getState().projects[1].path).toBe(second.path)
  })

  it("保存失败时保留原显示名", async () => {
    mocks.renameProject.mockRejectedValue(new Error("磁盘不可写"))

    await expect(useProjectsStore.getState().rename(second.path, "新名称"))
      .rejects.toThrow("磁盘不可写")

    expect(projectNames()).toEqual(["first", "second", "third"])
  })
})
