import { useMemo, useState } from "react"
import { ChevronRight, FileCode2, Folder, FolderOpen, List, ListTree } from "lucide-react"
import { buildFileChangeTree } from "@git-gui/core"
import type { FileChange, FileChangeTreeNode } from "@git-gui/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { FilePath, StatDelta, StatusBadge } from "@/components/StatusBadge"

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
        variant={value === "flat" ? "secondary" : "ghost"}
        size="xs"
        title="平铺展示"
        aria-pressed={value === "flat"}
        onClick={() => onChange("flat")}
      >
        <List /> 平铺
      </Button>
      <Button
        variant={value === "tree" ? "secondary" : "ghost"}
        size="xs"
        title="树形展示"
        aria-pressed={value === "tree"}
        onClick={() => onChange("tree")}
      >
        <ListTree /> 树形
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
        "flex h-8 w-full cursor-pointer items-center gap-2 text-left text-[13px] hover:bg-accent/50",
        onOpenFile ? "pr-9" : "pr-3",
        active && "bg-accent text-accent-foreground",
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

function FileChangeTreeNodes({
  nodes,
  depth,
  collapsed,
  onToggle,
  ...fileProps
}: {
  nodes: FileChangeTreeNode[]
  depth: number
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
  selectedPath: string | null
  onSelect: (path: string) => void
  onOpenFile?: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          return (
            <FileChangeRow
              key={node.path}
              file={node.entry}
              active={fileProps.selectedPath === node.path}
              onSelect={fileProps.onSelect}
              onOpenFile={fileProps.onOpenFile}
              displayName={node.name}
              depth={depth}
            />
          )
        }

        const open = !collapsed.has(node.path)
        return (
          <div key={node.path}>
            <button
              type="button"
              className="flex h-8 w-full items-center gap-1.5 pr-3 text-left text-[13px] hover:bg-accent/50"
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
              <span className="text-[11px] text-muted-foreground">{node.fileCount}</span>
            </button>
            {open && (
              <FileChangeTreeNodes
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                {...fileProps}
              />
            )}
          </div>
        )
      })}
    </>
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
  const tree = useMemo(() => buildFileChangeTree(files), [files])

  function toggleDirectory(path: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (viewMode === "flat") {
    return files.map((file) => (
      <FileChangeRow
        key={`${file.status}:${file.newPath}`}
        file={file}
        active={selectedPath === file.newPath}
        onSelect={onSelect}
        onOpenFile={onOpenFile}
      />
    ))
  }

  return (
    <FileChangeTreeNodes
      nodes={tree}
      depth={0}
      collapsed={collapsed}
      onToggle={toggleDirectory}
      selectedPath={selectedPath}
      onSelect={onSelect}
      onOpenFile={onOpenFile}
    />
  )
}
