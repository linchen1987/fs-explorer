import { useMemo } from "react"
import { Binary, FileDiff as FileDiffIcon } from "lucide-react"
import type { FileDiff } from "@git-gui/core"
import { diffStats, parseUnifiedDiff } from "@git-gui/core"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CenterHint } from "@/components/CenterHint"
import { FilePath, StatDelta } from "@/components/StatusBadge"

/** 单个 hunk 渲染行数上限，防止超大 diff 卡死渲染 */
const MAX_LINES_PER_HUNK = 2000

function FileDiffBody({ file }: { file: FileDiff }) {
  if (file.isBinary) {
    return (
      <CenterHint
        icon={Binary}
        title="二进制文件"
        desc="该文件是二进制格式，无法展示文本差异。"
      />
    )
  }

  if (file.hunks.length === 0) {
    if (file.rename) {
      return (
        <CenterHint
          icon={FileDiffIcon}
          title={
            <span className="font-mono text-xs">
              <FilePath path={file.rename.from} /> → <FilePath path={file.rename.to} />
            </span>
          }
          desc={`文件重命名（相似度 ${file.rename.similarity ?? "?"}%），内容无变化。`}
        />
      )
    }
    if (file.oldMode && file.newMode && file.oldMode !== file.newMode) {
      return (
        <CenterHint
          icon={FileDiffIcon}
          title="仅文件模式变更"
          desc={`mode ${file.oldMode} → ${file.newMode}，内容无变化。`}
        />
      )
    }
    return <CenterHint icon={FileDiffIcon} title="无内容差异" />
  }

  return (
    <div className="min-w-full font-mono text-[12.5px] leading-[1.55]">
      {file.hunks.map((hunk, hi) => (
        <div key={hi} className="border-b border-border/60 last:border-b-0">
          <div className="sticky top-0 z-10 bg-muted/95 px-3 py-1 text-[11px] whitespace-pre-wrap break-all text-muted-foreground backdrop-blur">
            <span className="text-sky-600 dark:text-sky-400">
              @@ -{hunk.oldStart} @@ +{hunk.newStart} @@
            </span>
            {hunk.context && <span className="ml-2 opacity-70">{hunk.context}</span>}
          </div>
          {hunk.lines.slice(0, MAX_LINES_PER_HUNK).map((line, li) => (
            <div
              key={li}
              className={cn(
                "flex min-w-max items-start px-1",
                line.type === "add" &&
                  "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                line.type === "del" &&
                  "bg-red-500/10 text-red-800 dark:text-red-300",
              )}
            >
              <span className="w-11 shrink-0 select-none px-1 text-right text-muted-foreground/50">
                {line.oldNumber ?? ""}
              </span>
              <span className="w-11 shrink-0 select-none px-1 text-right text-muted-foreground/50">
                {line.newNumber ?? ""}
              </span>
              <span
                className={cn(
                  "w-4 shrink-0 select-none text-center opacity-70",
                  line.type === "context" && "text-muted-foreground/40",
                )}
              >
                {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
              </span>
              <span className="whitespace-pre-wrap break-all px-1">
                {line.content}
                {line.noNewline && (
                  <span className="ml-2 rounded bg-amber-500/15 px-1 py-px text-[10px] text-amber-600 dark:text-amber-400">
                    无换行符
                  </span>
                )}
              </span>
            </div>
          ))}
          {hunk.lines.length > MAX_LINES_PER_HUNK && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              … 内容过长，仅显示前 {MAX_LINES_PER_HUNK} 行（共{" "}
              {hunk.lines.length} 行）
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Unified diff 查看器：解析 git diff 文本并渲染为带行号与配色的差异视图。
 */
export function DiffViewer({
  text,
  loading,
  emptyHint = "选择一个文件查看差异",
  badges,
}: {
  text: string | null
  loading?: boolean
  emptyHint?: React.ReactNode
  badges?: React.ReactNode
}) {
  const files = useMemo(() => (text ? parseUnifiedDiff(text) : []), [text])
  const file = files[0] ?? null

  const headerPath = useMemo(() => {
    if (!file) return null
    if (file.rename) return { from: file.rename.from, to: file.rename.to }
    return null
  }, [file])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {loading ? (
        <div className="flex h-full flex-col gap-2 p-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : !file ? (
        <CenterHint icon={FileDiffIcon} title={emptyHint} />
      ) : (
        <>
          <div className="flex min-h-9 flex-wrap items-center gap-2 border-b px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {headerPath ? (
                <>
                  <span className="text-muted-foreground">{headerPath.from}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span>{headerPath.to}</span>
                </>
              ) : (
                <FilePath path={file.newPath ?? file.oldPath ?? ""} />
              )}
            </span>
            {file.isNewFile && <Badge variant="secondary">新文件</Badge>}
            {file.isDeletedFile && <Badge variant="secondary">已删除</Badge>}
            {file.rename && (
              <Badge variant="secondary">
                重命名 {file.rename.similarity ?? "?"}%
              </Badge>
            )}
            {!file.isBinary && <StatDelta {...diffStats(file)} />}
            {badges}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <FileDiffBody file={file} />
          </div>
        </>
      )}
    </div>
  )
}
