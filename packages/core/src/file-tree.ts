export interface FileTreeNode {
  name: string
  path: string
  kind: "file" | "directory"
  children: FileTreeNode[]
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

/** 将 Git 返回的扁平路径构造成目录优先、名称排序的文件树。 */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", kind: "directory", children: [] }
  const nodes = new Map<string, FileTreeNode>([["directory:", root]])

  for (const path of new Set(paths.filter(Boolean))) {
    const parts = path.split("/").filter(Boolean)
    let parent = root
    let parentPath = ""

    parts.forEach((name, index) => {
      const nodePath = parentPath ? `${parentPath}/${name}` : name
      const kind = index === parts.length - 1 ? "file" : "directory"
      const key = `${kind}:${nodePath}`
      let node = nodes.get(key)
      if (!node) {
        node = { name, path: nodePath, kind, children: [] }
        nodes.set(key, node)
        parent.children.push(node)
      }
      parent = node
      parentPath = nodePath
    })
  }

  function sort(node: FileTreeNode) {
    node.children.sort(compareNodes)
    node.children.forEach(sort)
  }
  sort(root)
  return root.children
}

/** 按完整路径过滤；命中的目录保留其子树，其他目录仅在后代命中时保留。 */
export function filterFileTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return nodes

  return nodes.flatMap((node) => {
    if (node.path.toLocaleLowerCase().includes(normalized)) return [node]
    if (node.kind === "file") return []
    const children = filterFileTree(node.children, normalized)
    return children.length > 0 ? [{ ...node, children }] : []
  })
}
