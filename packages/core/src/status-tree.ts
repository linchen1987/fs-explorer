import type { FileChange, StatusEntry } from "./types"

export interface PathTreeFile<T> {
  name: string
  path: string
  kind: "file"
  entry: T
}

export interface PathTreeDirectory<T> {
  name: string
  path: string
  kind: "directory"
  children: PathTreeNode<T>[]
  fileCount: number
}

export type PathTreeNode<T> = PathTreeFile<T> | PathTreeDirectory<T>

export type StatusTreeFile = PathTreeFile<StatusEntry>
export type StatusTreeDirectory = PathTreeDirectory<StatusEntry>
export type StatusTreeNode = PathTreeNode<StatusEntry>

export type FileChangeTreeFile = PathTreeFile<FileChange>
export type FileChangeTreeDirectory = PathTreeDirectory<FileChange>
export type FileChangeTreeNode = PathTreeNode<FileChange>

/** 将一组带路径的条目构造目录树，目录优先并保持同组原有路径顺序。 */
export function buildPathTree<T>(
  entries: readonly T[],
  getPath: (entry: T) => string,
): PathTreeNode<T>[] {
  const roots: PathTreeNode<T>[] = []
  const directories = new Map<string, PathTreeDirectory<T>>()

  for (const entry of entries) {
    const entryPath = getPath(entry)
    const segments = entryPath.split("/")
    let siblings = roots
    let parentPath = ""

    for (let index = 0; index < segments.length - 1; index++) {
      const name = segments[index]
      const path = parentPath ? `${parentPath}/${name}` : name
      let directory = directories.get(path)
      if (!directory) {
        directory = { name, path, kind: "directory", children: [], fileCount: 0 }
        directories.set(path, directory)
        siblings.push(directory)
      }
      directory.fileCount++
      siblings = directory.children
      parentPath = path
    }

    siblings.push({
      name: segments[segments.length - 1],
      path: entryPath,
      kind: "file",
      entry,
    })
  }

  sortDirectoriesFirst(roots)
  return roots
}

export function buildStatusTree(entries: readonly StatusEntry[]): StatusTreeNode[] {
  return buildPathTree(entries, (entry) => entry.path)
}

export function buildFileChangeTree(files: readonly FileChange[]): FileChangeTreeNode[] {
  return buildPathTree(files, (file) => file.newPath)
}

export interface VisiblePathTreeNode<T> {
  node: PathTreeNode<T>
  depth: number
}

/** 只展开当前可见的目录，为虚拟列表提供扁平行；迭代实现避免深目录递归。 */
export function flattenVisiblePathTree<T>(
  nodes: readonly PathTreeNode<T>[],
  collapsed: ReadonlySet<string>,
): VisiblePathTreeNode<T>[] {
  const rows: VisiblePathTreeNode<T>[] = []
  const pending: VisiblePathTreeNode<T>[] = []
  for (let index = nodes.length - 1; index >= 0; index--) {
    pending.push({ node: nodes[index], depth: 0 })
  }

  while (pending.length > 0) {
    const row = pending.pop()!
    rows.push(row)
    if (row.node.kind !== "directory" || collapsed.has(row.node.path)) continue
    for (let index = row.node.children.length - 1; index >= 0; index--) {
      pending.push({ node: row.node.children[index], depth: row.depth + 1 })
    }
  }
  return rows
}

function sortDirectoriesFirst<T>(nodes: PathTreeNode<T>[]) {
  nodes.sort((a, b) => {
    if (a.kind === b.kind) return 0
    return a.kind === "directory" ? -1 : 1
  })
  for (const node of nodes) {
    if (node.kind === "directory") sortDirectoriesFirst(node.children)
  }
}
