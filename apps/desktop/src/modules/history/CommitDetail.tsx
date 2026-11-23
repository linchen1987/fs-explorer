import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, FileDiff, GitCommitHorizontal } from "lucide-react"
import type { CommitChanges, FileChange, HistoryCommit } from "@fs-explorer/core"
import { timeAgo } from "@fs-explorer/core"
import { errText } from "@/lib/async"
import { Button } from "@/components/ui/button"
import { CenterHint } from "@/components/CenterHint"
import { FileChangeList, FileListViewModeToggle } from "@/components/FileChangeList"
import type { FileListViewMode } from "@/components/FileChangeList"
import { DiffViewer } from "@/components/diff/DiffViewer"
import { StatDelta } from "@/components/StatusBadge"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export function CommitDetail({
  commit,
  changes,
  changesLoading,
  changesError,
  selectedFile,
  onSelectFile,
  diffText,
  diffLoading,
  diffError,
}: {
  commit: HistoryCommit
  changes: CommitChanges | null
  changesLoading: boolean
  changesError: string | null
  selectedFile: FileChange | null
  onSelectFile: (path: string) => void
  diffText: string | null
  diffLoading: boolean
  diffError: string | null
}) {
  const files = useMemo(() => changes?.files ?? [], [changes])
  const [viewMode, setViewMode] = useState<FileListViewMode>("tree")
  const fullDate = new Date(commit.timestamp * 1000).toLocaleString("zh-CN")

  async function copySha() {
    try {
      await navigator.clipboard.writeText(commit.sha)
      toast.success("已复制完整提交 SHA")
    } catch (e) {
      toast.error("复制失败", { description: errText(e) })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex items-start gap-2">
          <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 break-words text-sm font-medium">
            {commit.subject}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-6 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={copySha}
            className="-my-1 flex min-h-7 items-center gap-1.5 rounded-md px-1.5 font-mono text-commit transition-colors hover:bg-accent hover:underline"
            title={`复制完整 SHA：${commit.sha}`}
          >
            {commit.shortSha}
            <Copy className="size-3" />
          </button>
          <span aria-hidden>·</span>
          <span>{commit.authorName}</span>
          <span aria-hidden>·</span>
          <span title={fullDate}>{timeAgo(commit.timestamp)}</span>
          {commit.parentShas.length > 1 && (
            <>
              <span aria-hidden>·</span>
              <span title={commit.parentShas.join("\n")}>
                {commit.parentShas.length} 个父提交
              </span>
            </>
          )}
        </div>
      </div>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="30%" minSize="80px" maxSize="70%">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-panel px-3 text-xs text-muted-foreground">
              <span>
                变更文件{" "}
                <span className="font-medium text-foreground">{files.length}</span>
              </span>
              <div className="ml-auto flex items-center gap-2">
                {files.length > 0 && (
                  <FileListViewModeToggle value={viewMode} onChange={setViewMode} />
                )}
                {changes && (
                  <StatDelta
                    additions={changes.totalAdditions}
                    deletions={changes.totalDeletions}
                  />
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {changesError ? (
                <div className="px-3 py-2 text-xs break-all text-destructive">
                  {changesError}
                </div>
              ) : changesLoading && !changes ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  正在读取变更文件…
                </div>
              ) : files.length === 0 ? (
                <div className="flex h-full items-center justify-center px-3 py-2 text-center text-xs text-muted-foreground">
                  {commit.parentShas.length > 1
                    ? "相对第一父提交没有文件变化"
                    : "该提交没有文件变化"}
                </div>
              ) : (
                <FileChangeList
                  key={commit.sha}
                  files={files}
                  viewMode={viewMode}
                  selectedPath={selectedFile?.newPath ?? null}
                  onSelect={onSelectFile}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="70%" minSize="120px">
          {diffError ? (
            <CenterHint icon={FileDiff} title="读取提交 Diff 失败" desc={diffError} />
          ) : (
            <DiffViewer
              text={diffText}
              loading={diffLoading}
              emptyHint={
                files.length === 0 ? "该提交没有文件差异" : "选择上方文件查看差异"
              }
              badges={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={copySha}
                  title="复制提交 SHA"
                >
                  <Copy />
                </Button>
              }
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
