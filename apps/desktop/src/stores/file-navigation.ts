import { create } from "zustand"

interface OpenFileRequest {
  id: number
  repo: string
  path: string
}

interface FileNavigationState {
  request: OpenFileRequest | null
  openFile: (repo: string, path: string) => void
  consume: (id: number) => void
}

let nextRequestId = 1

/** 跨模块请求打开文件；文件模块消费请求，避免切回页签时重复跳转。 */
export const useFileNavigationStore = create<FileNavigationState>((set) => ({
  request: null,
  openFile: (repo, path) => {
    set({ request: { id: nextRequestId++, repo, path } })
  },
  consume: (id) => {
    set((state) => state.request?.id === id ? { request: null } : state)
  },
}))
