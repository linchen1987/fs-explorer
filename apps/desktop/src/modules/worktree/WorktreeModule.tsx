import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  FileDiff as FileDiffIcon,
  GitBranch,
  Loader2,
  Minus,
  Plus,
} from "lucide-react"
import type { StatusEntry } from "@fs-explorer/core"
import { errText, useAsync } from "@/lib/async"
import { useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { useProjectStatus } from "@/stores/projects"
import { useFileNavigationStore } from "@/stores/file-navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { CenterHint } from "@/components/CenterHint"
import { FileListViewModeToggle } from "@/components/FileChangeList"
import type { FileListViewMode } from "@/components/FileChangeList"
import { DiffViewer } from "@/components/diff/DiffViewer"
import type { ModuleProps } from "@/modules/registry"
import { ConflictFileView } from "./ConflictFileView"
import { WorktreeFileList } from "./WorktreeFileList"
import type { WorktreeKind, WorktreeSelection } from "./WorktreeFileList"

type Kind = WorktreeKind
type Selection = WorktreeSelection

export function WorktreeModule({ project }: ModuleProps) {
  const repo = project.path
  const status = useProjectStatus(repo)
  const openFile = useFileNavigationStore((s) => s.openFile)
  useRefreshListener(() => {
    status.reload()
  })

  const [sel, setSel] = useState<Selection | null>(null)
  const [viewMode, setViewMode] = useState<FileListViewMode>("tree")

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

  if (status.loading && !st) {
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
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2.5 border-b bg-card/20 px-4 py-2 text-sm">
        {st && (
          <>
            <GitBranch className="size-3.5 text-muted-foreground" />
            <span className="font-medium">
              {st.detached
                ? `分离头指针 ${st.headSha?.slice(0, 7) ?? ""}`
                : st.branch ?? "—"}
            </span>
            {st.upstream && (
              <Badge variant="outline" className="px-1.5 font-normal">
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
            <Badge variant="secondary" className="font-normal">
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
          <ResizablePanel defaultSize="32%" minSize="20%" maxSize="50%" className="bg-panel">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
                <span className="text-xs text-muted-foreground">{total} 项更改</span>
                <div className="ml-auto">
                  <FileListViewModeToggle value={viewMode} onChange={setViewMode} />
                </div>
              </div>
              <WorktreeFileList
                staged={staged}
                changes={changes}
                untracked={untracked}
                viewMode={viewMode}
                selection={effSel}
                onSelect={(entry, kind: Kind) => setSel({ repo, path: entry.path, kind })}
                onOpen={(entry) => openFile(repo, entry.path)}
                onStage={stage}
                onUnstage={unstage}
              />
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
                    <Badge variant="secondary" className="font-normal">
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
