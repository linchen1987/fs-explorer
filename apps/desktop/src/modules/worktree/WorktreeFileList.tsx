import { useMemo, useState } from "react"
import { ChevronRight, FileCode2, Folder, FolderOpen, Minus, Plus } from "lucide-react"
import { buildStatusTree, flattenVisiblePathTree } from "@fs-explorer/core"
import type { StatusEntry, StatusTreeNode } from "@fs-explorer/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { FileListViewMode } from "@/components/FileChangeList"
import { FilePath, StatusBadge } from "@/components/StatusBadge"
import { VirtualizedRows } from "@/components/VirtualizedRows"

export type WorktreeKind = "staged" | "changes" | "untracked"

export interface WorktreeSelection {
  repo: string
  path: string
  kind: WorktreeKind
}

const GROUP_TITLE: Record<WorktreeKind, string> = {
  staged: "已暂存的更改",
  changes: "更改",
  untracked: "未跟踪的文件",
}

function EntryRow({
  entry,
  kind,
  selected,
  onSelect,
  onAction,
  onOpen,
  displayName,
  depth = 0,
}: {
  entry: StatusEntry
  kind: WorktreeKind
  selected: boolean
  onSelect: (entry: StatusEntry, kind: WorktreeKind) => void
  onAction: (entries: StatusEntry[]) => void
  onOpen: (entry: StatusEntry) => void
  displayName?: string
  depth?: number
}) {
  const isStaged = kind === "staged"
  const statusChar = isStaged
    ? entry.indexStatus
    : kind === "changes"
      ? entry.worktreeStatus
      : "?"

  return (
    <div
      onClick={() => onSelect(entry, kind)}
      className={cn(
        "group/row flex h-9 cursor-pointer items-center gap-2 pr-3 text-sm transition-colors hover:bg-accent/60",
        selected && "bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--primary)]",
      )}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      title={entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
    >
      <StatusBadge status={statusChar} />
      {displayName == null ? (
        <FilePath path={entry.path} className="min-w-0 flex-1 truncate" />
      ) : (
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
      )}
      <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          title="在文件中打开"
          aria-label={`在文件中打开 ${entry.path}`}
          onClick={(event) => {
            event.stopPropagation()
            onOpen(entry)
          }}
        >
          <FileCode2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={isStaged ? "取消暂存" : "暂存"}
          onClick={(event) => {
            event.stopPropagation()
            onAction([entry])
          }}
        >
          {isStaged ? <Minus /> : <Plus />}
        </Button>
      </div>
    </div>
  )
}

type DirectoryNode = Extract<StatusTreeNode, { kind: "directory" }>

type WorktreeRow =
  | { key: string; type: "group"; kind: WorktreeKind; entries: StatusEntry[] }
  | {
      key: string
      type: "file"
      kind: WorktreeKind
      entry: StatusEntry
      displayName?: string
      depth: number
    }
  | { key: string; type: "directory"; kind: WorktreeKind; node: DirectoryNode; depth: number }

export function WorktreeFileList({
  staged,
  changes,
  untracked,
  viewMode,
  selection,
  onSelect,
  onOpen,
  onStage,
  onUnstage,
}: {
  staged: StatusEntry[]
  changes: StatusEntry[]
  untracked: StatusEntry[]
  viewMode: FileListViewMode
  selection: WorktreeSelection | null
  onSelect: (entry: StatusEntry, kind: WorktreeKind) => void
  onOpen: (entry: StatusEntry) => void
  onStage: (entries: StatusEntry[]) => void
  onUnstage: (entries: StatusEntry[]) => void
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<WorktreeKind>>(new Set())
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<WorktreeKind, Set<string>>>({
    staged: new Set(),
    changes: new Set(),
    untracked: new Set(),
  })

  const rows = useMemo<readonly WorktreeRow[]>(() => {
    const next: WorktreeRow[] = []
    const groups: Array<[WorktreeKind, StatusEntry[]]> = [
      ["staged", staged],
      ["changes", changes],
      ["untracked", untracked],
    ]

    for (const [kind, entries] of groups) {
      if (entries.length === 0) continue
      next.push({ key: `group:${kind}`, type: "group", kind, entries })
      if (collapsedGroups.has(kind)) continue

      if (viewMode === "flat") {
        for (const entry of entries) {
          next.push({
            key: `file:${kind}:${entry.path}`,
            type: "file",
            kind,
            entry,
            depth: 0,
          })
        }
        continue
      }

      const tree = buildStatusTree(entries)
      for (const { node, depth } of flattenVisiblePathTree(tree, collapsedDirectories[kind])) {
        if (node.kind === "file") {
          next.push({
            key: `file:${kind}:${node.path}`,
            type: "file",
            kind,
            entry: node.entry,
            displayName: node.name,
            depth,
          })
        } else {
          next.push({
            key: `directory:${kind}:${node.path}`,
            type: "directory",
            kind,
            node,
            depth,
          })
        }
      }
    }
    return next
  }, [changes, collapsedDirectories, collapsedGroups, staged, untracked, viewMode])

  function toggleGroup(kind: WorktreeKind) {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  function toggleDirectory(kind: WorktreeKind, path: string) {
    setCollapsedDirectories((current) => {
      const next = new Set(current[kind])
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { ...current, [kind]: next }
    })
  }

  return (
    <VirtualizedRows
      rows={rows}
      getRowKey={(row) => row.key}
      estimateRowHeight={(row) => row.type === "group" ? 40 : 36}
      className="min-h-0 flex-1 py-1"
      renderRow={(row) => {
        if (row.type === "group") {
          const open = !collapsedGroups.has(row.kind)
          const isStaged = row.kind === "staged"
          return (
            <div className="group flex h-10 items-center hover:bg-accent/50">
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm font-medium"
                aria-expanded={open}
                onClick={() => toggleGroup(row.kind)}
              >
                <ChevronRight className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )} />
                <span className="truncate">{GROUP_TITLE[row.kind]}</span>
                <span className="text-muted-foreground">{row.entries.length}</span>
              </button>
              <div className="mr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={isStaged ? "全部取消暂存" : "全部暂存"}
                  onClick={() => isStaged ? onUnstage(row.entries) : onStage(row.entries)}
                >
                  {isStaged ? <Minus /> : <Plus />}
                </Button>
              </div>
            </div>
          )
        }

        if (row.type === "directory") {
          const open = !collapsedDirectories[row.kind].has(row.node.path)
          return (
            <button
              type="button"
              className="flex h-9 w-full items-center gap-1.5 pr-3 text-left text-sm transition-colors hover:bg-accent/60"
              style={{ paddingLeft: `${12 + row.depth * 14}px` }}
              title={row.node.path}
              aria-label={`${open ? "收起" : "展开"}目录 ${row.node.path}`}
              aria-expanded={open}
              onClick={() => toggleDirectory(row.kind, row.node.path)}
            >
              <ChevronRight className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )} />
              {open ? (
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{row.node.name}</span>
              <span className="text-xs text-muted-foreground">{row.node.fileCount}</span>
            </button>
          )
        }

        return (
          <EntryRow
            entry={row.entry}
            kind={row.kind}
            selected={selection?.path === row.entry.path && selection.kind === row.kind}
            onSelect={onSelect}
            onAction={row.kind === "staged" ? onUnstage : onStage}
            onOpen={onOpen}
            displayName={row.displayName}
            depth={row.depth}
          />
        )
      }}
    />
  )
}
