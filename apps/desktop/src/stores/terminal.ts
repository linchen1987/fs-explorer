import type { Project } from "@fs-explorer/core"
import { create } from "zustand"

interface TerminalSession {
  repo: string
  projectName: string
}

interface TerminalState {
  /** 全局唯一的 shell；工作目录固定在首次打开终端的项目。 */
  session: TerminalSession | null
  visible: boolean
  toggle: (project: Project | null) => void
  hide: () => void
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

  reset: () => set({ session: null, visible: false }),
}))
