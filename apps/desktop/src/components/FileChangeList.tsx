import { useMemo, useState } from "react"
import { ChevronRight, FileCode2, Folder, FolderOpen, List, ListTree } from "lucide-react"
import { buildFileChangeTree, flattenVisiblePathTree } from "@fs-explorer/core"
import type { FileChange, FileChangeTreeNode } from "@fs-explorer/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { FilePath, StatDelta, StatusBadge } from "@/components/StatusBadge"
import { VirtualizedRows } from "@/components/VirtualizedRows"

export type FileListViewMode = "flat" | "tree"

export function FileListViewModeToggle({
  value,
  onChange,
}: {
  value: FileListViewMode
  onChange: (mode: FileListViewMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="文件展示形式">
      <Button
        variant={value === "tree" ? "secondary" : "ghost"}
        size="xs"
        title="树形展示"
        aria-pressed={value === "tree"}
        onClick={() => onChange("tree")}
      >
        <ListTree /> 树形
      </Button>
      <Button
        variant={value === "flat" ? "secondary" : "ghost"}
        size="xs"
        title="平铺展示"
        aria-pressed={value === "flat"}
        onClick={() => onChange("flat")}
      >
        <List /> 平铺
      </Button>
    </div>
  )
}

function FileChangeRow({
  file,
  active,
  onSelect,
  onOpenFile,
  displayName,
  depth = 0,
}: {
  file: FileChange
  active: boolean
  onSelect: (path: string) => void
  onOpenFile?: (path: string) => void
  displayName?: string
  depth?: number
}) {
  const selectButton = (
    <button
      type="button"
      onClick={() => onSelect(file.newPath)}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center gap-2 text-left text-sm transition-colors hover:bg-accent/60",
        onOpenFile ? "pr-9" : "pr-3",
        active && "bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--primary)]",
      )}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      title={file.oldPath ? `${file.oldPath} → ${file.newPath}` : file.newPath}
    >
      <StatusBadge status={file.status} />
      {displayName == null ? (
        <FilePath path={file.newPath} className="min-w-0 flex-1 truncate" />
      ) : (
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
      )}
      <StatDelta additions={file.additions} deletions={file.deletions} />
    </button>
  )

  if (!onOpenFile) return selectButton
  return (
    <div className="group/row relative">
      {selectButton}
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
        title="在文件中打开"
        aria-label={`在文件中打开 ${file.newPath}`}
        onClick={() => onOpenFile(file.newPath)}
      >
        <FileCode2 />
      </Button>
    </div>
  )
}

type DirectoryNode = Extract<FileChangeTreeNode, { kind: "directory" }>

type FileChangeListRow =
  | {
      key: string
      kind: "file"
      file: FileChange
      displayName?: string
      depth: number
    }
  | { key: string; kind: "directory"; node: DirectoryNode; depth: number }

function FileChangeDirectoryRow({
  node,
  depth,
  open,
  onToggle,
}: {
  node: DirectoryNode
  depth: number
  open: boolean
  onToggle: (path: string) => void
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-1.5 pr-3 text-left text-sm transition-colors hover:bg-accent/60"
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      title={node.path}
      aria-label={`${open ? "收起" : "展开"}目录 ${node.path}`}
      aria-expanded={open}
      onClick={() => onToggle(node.path)}
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90",
        )}
      />
      {open ? (
        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="text-xs text-muted-foreground">{node.fileCount}</span>
    </button>
  )
}

export function FileChangeList({
  files,
  viewMode,
  selectedPath,
  onSelect,
  onOpenFile,
}: {
  files: readonly FileChange[]
  viewMode: FileListViewMode
  selectedPath: string | null
  onSelect: (path: string) => void
  onOpenFile?: (path: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(
    () => viewMode === "tree" ? buildFileChangeTree(files) : [],
    [files, viewMode],
  )
  const rows = useMemo<readonly FileChangeListRow[]>(() => {
    if (viewMode === "flat") {
      return files.map((file) => ({
        key: `file:${file.status}:${file.newPath}`,
        kind: "file",
        file,
        depth: 0,
      }))
    }
    return flattenVisiblePathTree(tree, collapsed).map(({ node, depth }): FileChangeListRow => (
      node.kind === "file"
        ? {
            key: `file:${node.path}`,
            kind: "file",
            file: node.entry,
            displayName: node.name,
            depth,
          }
        : { key: `directory:${node.path}`, kind: "directory", node, depth }
    ))
  }, [collapsed, files, tree, viewMode])

  function toggleDirectory(path: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <VirtualizedRows
      rows={rows}
      getRowKey={(row) => row.key}
      className="py-1"
      renderRow={(row) => row.kind === "file" ? (
        <FileChangeRow
          file={row.file}
          active={selectedPath === row.file.newPath}
          onSelect={onSelect}
          onOpenFile={onOpenFile}
          displayName={row.displayName}
          depth={row.depth}
        />
      ) : (
        <FileChangeDirectoryRow
          node={row.node}
          depth={row.depth}
          open={!collapsed.has(row.node.path)}
          onToggle={toggleDirectory}
        />
      )}
    />
  )
}
