import type { Project } from "@fs-explorer/core"
import { create } from "zustand"

interface TerminalSession {
  repo: string
  projectName: string
}

interface TerminalState {
  /** 全局唯一的 shell；普通项目切换不改变其工作目录。 */
  session: TerminalSession | null
  visible: boolean
  toggle: (project: Project | null) => void
  hide: () => void
  /** cd 写入现有 shell 后，更新会话显示的项目。 */
  switchProject: (project: Project) => void
  /** shell 退出后清空会话；下次打开时按当前项目重新创建。 */
  reset: () => void
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  session: null,
  visible: false,

  toggle: (project) => {
    const session = get().session ?? (project
      ? { repo: project.path, projectName: project.name }
      : null)
    if (!session) return

    set((state) => ({ session, visible: !state.visible }))
  },

  hide: () => set({ visible: false }),

  switchProject: (project) => {
    const session = get().session
    if (session?.repo === project.path) {
      set({ visible: true })
      return
    }

    set({
      session: { repo: project.path, projectName: project.name },
      visible: true,
    })
  },

  reset: () => set({ session: null, visible: false }),
}))
