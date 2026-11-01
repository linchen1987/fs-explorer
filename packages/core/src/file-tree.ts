export interface FileTreeNode {
  name: string
  path: string
  kind: "file" | "directory"
}

export interface FileTreePage {
  nodes: FileTreeNode[]
  total: number
}

export interface FileSearchResult {
  paths: string[]
  total: number
}

/**
 * 只计算一个目录的直接子节点，避免为大仓库预先构造完整文件树。
 * Git 返回的路径已排序；同一组内保持该顺序，目录统一排在文件前。
 */
export function listFileTreeChildren(
  paths: string[],
  parentPath = "",
  limit = 200,
): FileTreePage {
  const prefix = parentPath ? `${parentPath}/` : ""
  const cap = Math.max(0, Math.floor(limit))
  const directories = new Set<string>()
  const files = new Set<string>()
  const directoryNodes: FileTreeNode[] = []
  const fileNodes: FileTreeNode[] = []

  for (const path of paths) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    if (!rest) continue
    const slash = rest.indexOf("/")
    const name = slash === -1 ? rest : rest.slice(0, slash)
    const nodePath = `${prefix}${name}`
    const directory = slash !== -1
    const seen = directory ? directories : files
    if (seen.has(nodePath)) continue
    seen.add(nodePath)

    const nodes = directory ? directoryNodes : fileNodes
    if (nodes.length < cap) nodes.push({ name, path: nodePath, kind: directory ? "directory" : "file" })
  }

  return {
    nodes: [...directoryNodes, ...fileNodes].slice(0, cap),
    total: directories.size + files.size,
  }
}

/** 按完整路径搜索，保留总数但只返回需要渲染的前 limit 条。 */
export function searchFilePaths(
  paths: string[],
  query: string,
  limit = 200,
): FileSearchResult {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return { paths: [], total: 0 }

  const cap = Math.max(0, Math.floor(limit))
  const matches: string[] = []
  let total = 0
  for (const path of paths) {
    if (!path.toLocaleLowerCase().includes(normalized)) continue
    total++
    if (matches.length < cap) matches.push(path)
  }
  return { paths: matches, total }
}
