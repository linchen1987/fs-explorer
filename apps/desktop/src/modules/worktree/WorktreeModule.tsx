import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FileCode2,
  FileDiff as FileDiffIcon,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  Minus,
  Plus,
} from "lucide-react"
import { buildStatusTree } from "@git-gui/core"
import type { StatusEntry, StatusTreeNode } from "@git-gui/core"
import { errText, useAsync } from "@/lib/async"
import { useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { useProjectStatus } from "@/stores/projects"
import { useFileNavigationStore } from "@/stores/file-navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { CenterHint } from "@/components/CenterHint"
import { FileListViewModeToggle } from "@/components/FileChangeList"
import type { FileListViewMode } from "@/components/FileChangeList"
import { FilePath, StatusBadge } from "@/components/StatusBadge"
import { DiffViewer } from "@/components/diff/DiffViewer"
import type { ModuleProps } from "@/modules/registry"
import { ConflictFileView } from "./ConflictFileView"

type Kind = "staged" | "changes" | "untracked"

interface Selection {
  repo: string
  path: string
  kind: Kind
}

const GROUP_TITLE: Record<Kind, string> = {
  staged: "已暂存的更改",
  changes: "更改",
  untracked: "未跟踪的文件",
}

function EntryRow({
  entry,
  kind,
  sel,
  onSelect,
  onAction,
  onOpen,
  displayName,
  depth = 0,
}: {
  entry: StatusEntry
  kind: Kind
  sel: Selection | null
  onSelect: (entry: StatusEntry, kind: Kind) => void
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
        "group/row flex h-8 cursor-pointer items-center gap-2 pr-3 text-[13px] hover:bg-accent/50",
        sel?.path === entry.path && sel.kind === kind && "bg-accent text-accent-foreground",
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

function StatusTreeNodes({
  nodes,
  kind,
  depth,
  collapsed,
  onToggle,
  ...entryProps
}: {
  nodes: StatusTreeNode[]
  kind: Kind
  depth: number
  collapsed: ReadonlySet<string>
  onToggle: (path: string) => void
  sel: Selection | null
  onSelect: (entry: StatusEntry, kind: Kind) => void
  onAction: (entries: StatusEntry[]) => void
  onOpen: (entry: StatusEntry) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          return (
            <EntryRow
              key={node.path}
              entry={node.entry}
              kind={kind}
              displayName={node.name}
              depth={depth}
              {...entryProps}
            />
          )
        }

        const open = !collapsed.has(node.path)
        return (
          <div key={node.path}>
            <button
              type="button"
              className="group flex h-8 w-full items-center gap-1.5 pr-3 text-left text-[13px] hover:bg-accent/50"
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
              <StatusTreeNodes
                nodes={node.children}
                kind={kind}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                {...entryProps}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function Group({
  kind,
  entries,
  viewMode,
  collapsed,
  onToggleDirectory,
  sel,
  onSelect,
  onAction,
  onOpen,
  onActionAll,
}: {
  kind: Kind
  entries: StatusEntry[]
  viewMode: FileListViewMode
  collapsed: ReadonlySet<string>
  onToggleDirectory: (path: string) => void
  sel: Selection | null
  onSelect: (e: StatusEntry, kind: Kind) => void
  onAction: (entries: StatusEntry[]) => void
  onOpen: (entry: StatusEntry) => void
  onActionAll: (entries: StatusEntry[]) => void
}) {
  const tree = useMemo(() => buildStatusTree(entries), [entries])
  if (entries.length === 0) return null
  const isStaged = kind === "staged"

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="group w-full hover:bg-accent/50">
        <div className="flex h-9 items-center gap-1.5 px-2 text-xs font-medium">
          <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span>{GROUP_TITLE[kind]}</span>
          <span className="text-muted-foreground">{entries.length}</span>
          <div className="ml-auto pr-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              title={isStaged ? "全部取消暂存" : "全部暂存"}
              onClick={(e) => {
                e.stopPropagation()
                onActionAll(entries)
              }}
            >
              {isStaged ? <Minus /> : <Plus />}
            </Button>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-1">
          {viewMode === "flat" ? (
            entries.map((entry) => (
              <EntryRow
                key={`${kind}:${entry.path}`}
                entry={entry}
                kind={kind}
                sel={sel}
                onSelect={onSelect}
                onAction={onAction}
                onOpen={onOpen}
              />
            ))
          ) : (
            <StatusTreeNodes
              nodes={tree}
              kind={kind}
              depth={0}
              collapsed={collapsed}
              onToggle={onToggleDirectory}
              sel={sel}
              onSelect={onSelect}
              onAction={onAction}
              onOpen={onOpen}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function WorktreeModule({ project }: ModuleProps) {
  const repo = project.path
  const status = useProjectStatus(repo)
  const openFile = useFileNavigationStore((s) => s.openFile)
  useRefreshListener(() => {
    status.reload()
  })

  const [sel, setSel] = useState<Selection | null>(null)
  const [viewMode, setViewMode] = useState<FileListViewMode>("tree")
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<Kind, Set<string>>>({
    staged: new Set(),
    changes: new Set(),
    untracked: new Set(),
  })

  function toggleDirectory(kind: Kind, path: string) {
    setCollapsedDirectories((current) => {
      const next = new Set(current[kind])
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { ...current, [kind]: next }
    })
  }

  const st = status.data
  const staged = useMemo(
    () =>
      st?.entries.filter(
        (e) => !e.untracked && !e.conflicted && e.indexStatus !== ".",
      ) ?? [],
    [st],
  )
  const changes = useMemo(
    () => st?.entries.filter((e) => !e.untracked && e.worktreeStatus !== ".") ?? [],
    [st],
  )
  const untracked = useMemo(
    () => st?.entries.filter((e) => e.untracked) ?? [],
    [st],
  )

  // status 变化后校正选中项（文件可能换了分组或消失）
  const effSel = useMemo<Selection | null>(() => {
    if (!sel || sel.repo !== repo || !st) return null
    const path = sel.path
    const inStaged = staged.some((e) => e.path === path)
    const inChanges = changes.some((e) => e.path === path)
    const inUntracked = untracked.some((e) => e.path === path)
    if (sel.kind === "staged" && inStaged) return sel
    if (sel.kind === "changes" && inChanges) return sel
    if (sel.kind === "untracked" && inUntracked) return sel
    if (inStaged) return { repo, path, kind: "staged" }
    if (inChanges) return { repo, path, kind: "changes" }
    if (inUntracked) return { repo, path, kind: "untracked" }
    return null
  }, [sel, st, repo, staged, changes, untracked])

  const selectedEntry = effSel
    ? st?.entries.find((entry) => entry.path === effSel.path)
    : undefined

  const diff = useAsync(() => {
    if (!effSel || !st) return Promise.resolve(null)
    const entry = st.entries.find((e) => e.path === effSel.path)
    if (entry?.conflicted) return Promise.resolve(null)
    if (effSel.kind === "staged") {
      return ipc.diffWorktreeFile(repo, effSel.path, true, entry?.oldPath ?? null)
    }
    if (effSel.kind === "untracked") {
      return ipc.diffUntrackedFile(repo, effSel.path)
    }
    return ipc.diffWorktreeFile(repo, effSel.path, false, entry?.oldPath ?? null)
  }, [repo, effSel?.path, effSel?.kind, st])

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
      status.reload()
    } catch (e) {
      toast.error("操作失败", { description: errText(e) })
    }
  }
  const stage = (entries: StatusEntry[]) =>
    run(() => ipc.stagePaths(repo, entries.map((e) => e.path)))
  const unstage = (entries: StatusEntry[]) =>
    run(() => ipc.unstagePaths(repo, entries.map((e) => e.path)))

  if (status.loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-6 w-56" />
      </div>
    )
  }

  if (status.error) {
    return (
      <CenterHint icon={FileDiffIcon} title="无法读取工作区状态" desc={errText(status.error)} />
    )
  }

  const total = staged.length + changes.length + untracked.length
  const empty = total === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 头部：分支与跟踪状态 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
        {st && (
          <>
            <GitBranch className="size-3.5 text-muted-foreground" />
            <span className="font-medium">
              {st.detached
                ? `分离头指针 ${st.headSha?.slice(0, 7) ?? ""}`
                : st.branch ?? "—"}
            </span>
            {st.upstream && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                {st.upstream}
              </Badge>
            )}
            {st.ahead != null && st.ahead > 0 && (
              <span
                className="flex items-center gap-0.5 text-muted-foreground"
                title="领先上游"
              >
                <ArrowUp className="size-3" />
                {st.ahead}
              </span>
            )}
            {st.behind != null && st.behind > 0 && (
              <span
                className="flex items-center gap-0.5 text-muted-foreground"
                title="落后上游"
              >
                <ArrowDown className="size-3" />
                {st.behind}
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {st?.headSha == null && st?.branch && (
            <Badge variant="secondary" className="h-5 text-[10px] font-normal">
              尚无提交
            </Badge>
          )}
          {changes.length + untracked.length > 0 && (
            <Button variant="outline" size="xs" onClick={() => stage([...changes, ...untracked])}>
              <Plus /> 全部暂存
            </Button>
          )}
          {staged.length > 0 && (
            <Button variant="outline" size="xs" onClick={() => unstage(staged)}>
              <Minus /> 全部取消暂存
            </Button>
          )}
          {status.loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {empty ? (
        <CenterHint
          icon={FileDiffIcon}
          title="工作区干净"
          desc="没有已暂存或未暂存的改动。"
        />
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="32%" minSize="20%" maxSize="50%">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
                <span className="pl-1 text-xs text-muted-foreground">{total} 项更改</span>
                <div className="ml-auto">
                  <FileListViewModeToggle value={viewMode} onChange={setViewMode} />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto pt-1">
                <Group
                  kind="staged"
                  entries={staged}
                  viewMode={viewMode}
                  collapsed={collapsedDirectories.staged}
                  onToggleDirectory={(path) => toggleDirectory("staged", path)}
                  sel={effSel}
                  onSelect={(e, kind) => setSel({ repo, path: e.path, kind })}
                  onAction={unstage}
                  onOpen={(entry) => openFile(repo, entry.path)}
                  onActionAll={unstage}
                />
                <Group
                  kind="changes"
                  entries={changes}
                  viewMode={viewMode}
                  collapsed={collapsedDirectories.changes}
                  onToggleDirectory={(path) => toggleDirectory("changes", path)}
                  sel={effSel}
                  onSelect={(e, kind) => setSel({ repo, path: e.path, kind })}
                  onAction={stage}
                  onOpen={(entry) => openFile(repo, entry.path)}
                  onActionAll={stage}
                />
                <Group
                  kind="untracked"
                  entries={untracked}
                  viewMode={viewMode}
                  collapsed={collapsedDirectories.untracked}
                  onToggleDirectory={(path) => toggleDirectory("untracked", path)}
                  sel={effSel}
                  onSelect={(e, kind) => setSel({ repo, path: e.path, kind })}
                  onAction={stage}
                  onOpen={(entry) => openFile(repo, entry.path)}
                  onActionAll={stage}
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="68%">
            {effSel && selectedEntry?.conflicted ? (
              <ConflictFileView repo={repo} path={effSel.path} />
            ) : (
              <DiffViewer
                text={diff.data}
                loading={diff.loading}
                emptyHint="选择左侧文件查看差异"
                badges={
                  effSel && (
                    <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                      {effSel.kind === "staged"
                        ? "已暂存"
                        : effSel.kind === "untracked"
                          ? "未跟踪"
                          : "未暂存"}
                    </Badge>
                  )
                }
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
