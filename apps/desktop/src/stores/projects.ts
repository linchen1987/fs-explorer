import { useCallback, useEffect } from "react"
import type { Project, WorktreeStatus } from "@fs-explorer/core"
import { create } from "zustand"
import { errText } from "@/lib/async"
import { ipc } from "@/lib/ipc"

export type StatusResult =
  | { ok: WorktreeStatus }
  | { err: string }

interface ProjectsState {
  projects: Project[]
  /** 同时只选中一个项目 */
  selectedPath: string | null
  /** 各项目的状态（侧栏角标用），path -> 结果 */
  statuses: Record<string, StatusResult>
  statusLoading: Record<string, boolean>
  gitVersion: string | null
  gitVersionError: string | null
  initialized: boolean

  init: () => Promise<void>
  add: (path: string) => Promise<Project>
  remove: (path: string) => Promise<void>
  rename: (path: string, name: string) => Promise<Project>
  reorder: (projects: Project[]) => Promise<void>
  select: (path: string) => void
  refreshStatuses: () => Promise<void>
  refreshStatus: (path: string) => Promise<void>
}

/** 同一项目的并发刷新共享一个 Git 请求。 */
const statusRequests = new Map<string, Promise<void>>()
/** 较旧的保存失败时，不覆盖用户随后完成的新排序。 */
let reorderRevision = 0

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  selectedPath: null,
  statuses: {},
  statusLoading: {},
  gitVersion: null,
  gitVersionError: null,
  initialized: false,

  init: async () => {
    try {
      const projects = await ipc.listProjects()
      set({ projects, initialized: true })
      // 恢复上次选择（若仍存在）
      const prev = get().selectedPath
      if (prev && projects.some((p) => p.path === prev)) {
        // keep
      } else {
        set({ selectedPath: projects[0]?.path ?? null })
      }
      get().refreshStatuses()
    } catch (e) {
      set({ initialized: true })
      throw e
    }
    try {
      const version = await ipc.gitVersion()
      set({ gitVersion: version, gitVersionError: null })
    } catch (e) {
      set({ gitVersion: null, gitVersionError: errText(e) })
    }
  },

  add: async (path) => {
    const project = await ipc.addProject(path)
    const projects = await ipc.listProjects()
    set({ projects, selectedPath: project.path })
    get().refreshStatus(project.path)
    return project
  },

  remove: async (path) => {
    await ipc.removeProject(path)
    const projects = await ipc.listProjects()
    const { selectedPath, statuses, statusLoading } = get()
    const nextStatuses = { ...statuses }
    const nextLoading = { ...statusLoading }
    delete nextStatuses[path]
    delete nextLoading[path]
    set({
      projects,
      statuses: nextStatuses,
      statusLoading: nextLoading,
      selectedPath: selectedPath === path ? projects[0]?.path ?? null : selectedPath,
    })
  },

  rename: async (path, name) => {
    const renamed = await ipc.renameProject(path, name)
    set((state) => ({
      projects: state.projects.map((project) =>
        project.path === path ? renamed : project,
      ),
    }))
    return renamed
  },

  reorder: async (nextProjects) => {
    const previousProjects = get().projects
    const revision = ++reorderRevision
    set({ projects: nextProjects })
    try {
      await ipc.reorderProjects(nextProjects.map((p) => p.path))
    } catch (e) {
      if (revision === reorderRevision) set({ projects: previousProjects })
      throw e
    }
  },

  select: (path) => {
    set({ selectedPath: path })
    get().refreshStatus(path)
  },

  refreshStatuses: async () => {
    const { projects } = get()
    await Promise.allSettled(projects.map((p) => get().refreshStatus(p.path)))
  },

  refreshStatus: (path) => {
    const project = get().projects.find((p) => p.path === path)
    if (project && !project.isGitRepo) return Promise.resolve()

    const existing = statusRequests.get(path)
    if (existing) return existing

    const request = (async () => {
      set((s) => ({ statusLoading: { ...s.statusLoading, [path]: true } }))
      try {
        const status = await ipc.getWorktreeStatus(path)
        set((s) => ({ statuses: { ...s.statuses, [path]: { ok: status } } }))
      } catch (e) {
        set((s) => ({ statuses: { ...s.statuses, [path]: { err: errText(e) } } }))
      } finally {
        set((s) => ({ statusLoading: { ...s.statusLoading, [path]: false } }))
        statusRequests.delete(path)
      }
    })()
    statusRequests.set(path, request)
    return request
  },
}))

/** 当前选中的项目 */
export function useSelectedProject(): Project | null {
  return useProjectsStore((s) =>
    s.projects.find((p) => p.path === s.selectedPath) ?? null,
  )
}

/** 侧栏与各模块共享同一项目的状态，避免重复执行 Git status。 */
export function useProjectStatus(path: string) {
  const result = useProjectsStore((s) => s.statuses[path])
  const loading = useProjectsStore((s) => s.statusLoading[path] ?? false)
  const isGitRepo = useProjectsStore((s) =>
    s.projects.find((p) => p.path === path)?.isGitRepo ?? true,
  )
  const refresh = useProjectsStore((s) => s.refreshStatus)

  useEffect(() => {
    if (isGitRepo && !result && !loading) void refresh(path)
  }, [path, result, loading, isGitRepo, refresh])

  const reload = useCallback(() => {
    void refresh(path)
  }, [path, refresh])

  return {
    data: result && "ok" in result ? result.ok : null,
    error: result && "err" in result ? result.err : null,
    loading: isGitRepo && (loading || !result),
    reload,
  }
}
