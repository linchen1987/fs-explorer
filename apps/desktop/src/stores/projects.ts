import type { Project, WorktreeStatus } from "@git-gui/core"
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
  gitVersion: string | null
  gitVersionError: string | null
  initialized: boolean

  init: () => Promise<void>
  add: (path: string) => Promise<Project>
  remove: (path: string) => Promise<void>
  select: (path: string) => void
  refreshStatuses: () => Promise<void>
  refreshStatus: (path: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  selectedPath: null,
  statuses: {},
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
    const { selectedPath, statuses } = get()
    const nextStatuses = { ...statuses }
    delete nextStatuses[path]
    set({
      projects,
      statuses: nextStatuses,
      selectedPath: selectedPath === path ? projects[0]?.path ?? null : selectedPath,
    })
  },

  select: (path) => {
    set({ selectedPath: path })
    get().refreshStatus(path)
  },

  refreshStatuses: async () => {
    const { projects } = get()
    await Promise.allSettled(projects.map((p) => get().refreshStatus(p.path)))
  },

  refreshStatus: async (path) => {
    try {
      const status = await ipc.getWorktreeStatus(path)
      set((s) => ({ statuses: { ...s.statuses, [path]: { ok: status } } }))
    } catch (e) {
      set((s) => ({ statuses: { ...s.statuses, [path]: { err: errText(e) } } }))
    }
  },
}))

/** 当前选中的项目 */
export function useSelectedProject(): Project | null {
  return useProjectsStore((s) =>
    s.projects.find((p) => p.path === s.selectedPath) ?? null,
  )
}
