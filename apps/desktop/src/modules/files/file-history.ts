export interface FileHistory {
  paths: string[]
  index: number
}

export const EMPTY_FILE_HISTORY: FileHistory = { paths: [], index: -1 }

/** 打开新位置时丢弃前进记录；重复打开当前文件不产生新记录。 */
export function pushFileHistory(history: FileHistory, path: string): FileHistory {
  if (history.paths[history.index] === path) return history
  const paths = [...history.paths.slice(0, history.index + 1), path]
  return { paths, index: paths.length - 1 }
}

export function moveFileHistory(history: FileHistory, offset: number): FileHistory {
  const index = history.index + offset
  if (index < 0 || index >= history.paths.length || index === history.index) return history
  return { ...history, index }
}

/** 删除文件或目录时清理失效历史；当前查看项被删除则关闭查看器。 */
export function removeDeletedPath(
  history: FileHistory,
  path: string,
  kind: "file" | "directory",
): FileHistory {
  const removed = (item: string) => (
    item === path || (kind === "directory" && item.startsWith(`${path}/`))
  )
  if (!history.paths.some(removed)) return history
  if (removed(history.paths[history.index])) return EMPTY_FILE_HISTORY

  const removedBefore = history.paths.slice(0, history.index).filter(removed).length
  return {
    paths: history.paths.filter((item) => !removed(item)),
    index: history.index - removedBefore,
  }
}
