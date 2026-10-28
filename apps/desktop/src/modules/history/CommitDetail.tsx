import { useMemo } from "react"
import { toast } from "sonner"
import { Copy, FileDiff, GitCommitHorizontal } from "lucide-react"
import type { CommitChanges, FileChange, HistoryCommit } from "@git-gui/core"
import { timeAgo } from "@git-gui/core"
import { errText } from "@/lib/async"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CenterHint } from "@/components/CenterHint"
import { DiffViewer } from "@/components/diff/DiffViewer"
import { FilePath, StatDelta, StatusBadge } from "@/components/StatusBadge"

function CommitFileRow({
  file,
  active,
  onClick,
}: {
  file: FileChange
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-2 px-3 text-left text-[13px] hover:bg-accent/50",
        active && "bg-accent text-accent-foreground",
      )}
      title={file.oldPath ? `${file.oldPath} → ${file.newPath}` : file.newPath}
    >
      <StatusBadge status={file.status} />
      <FilePath path={file.newPath} className="min-w-0 flex-1 truncate" />
      <StatDelta additions={file.additions} deletions={file.deletions} />
    </button>
  )
}

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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={copySha}
            className="flex items-center gap-1 rounded font-mono text-violet-600 hover:underline dark:text-violet-400"
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

      <div className="flex max-h-44 min-h-20 shrink-0 flex-col border-b">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-[11px] text-muted-foreground">
          <span>
            变更文件{" "}
            <span className="font-medium text-foreground">{files.length}</span>
          </span>
          {changes && (
            <div className="ml-auto flex gap-2">
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                +{changes.totalAdditions}
              </span>
              <span className="font-mono text-red-600 dark:text-red-400">
                −{changes.totalDeletions}
              </span>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
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
            files.map((file) => (
              <CommitFileRow
                key={`${file.status}:${file.newPath}`}
                file={file}
                active={selectedFile?.newPath === file.newPath}
                onClick={() => onSelectFile(file.newPath)}
              />
            ))
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  )
}
