import { cn } from "@/lib/utils"

/** 文件变更状态字母徽标（M/A/D/R/C/T/U/?） */
const STATUS_CLASS: Record<string, string> = {
  M: "text-amber-600 dark:text-amber-400",
  A: "text-emerald-600 dark:text-emerald-400",
  "?": "text-emerald-600 dark:text-emerald-400",
  D: "text-red-600 dark:text-red-400",
  R: "text-sky-600 dark:text-sky-400",
  C: "text-sky-600 dark:text-sky-400",
  T: "text-violet-600 dark:text-violet-400",
  U: "text-red-600 dark:text-red-400",
}

export const STATUS_LABEL: Record<string, string> = {
  M: "修改",
  A: "新增",
  D: "删除",
  R: "重命名",
  C: "复制",
  T: "类型变更",
  U: "冲突",
  "?": "未跟踪",
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const s = status === "." ? "?" : status
  return (
    <span
      title={STATUS_LABEL[s] ?? s}
      className={cn(
        "inline-flex w-4 shrink-0 justify-center font-mono text-[11px] font-bold",
        STATUS_CLASS[s] ?? "text-muted-foreground",
        className,
      )}
    >
      {s}
    </span>
  )
}

/** +/- 行数统计 */
export function StatDelta({
  additions,
  deletions,
}: {
  additions: number | null
  deletions: number | null
}) {
  if (additions == null && deletions == null) {
    return <span className="text-[11px] text-muted-foreground">二进制</span>
  }
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums">
      {additions != null && additions > 0 && (
        <span className="text-emerald-600 dark:text-emerald-400">
          +{additions}
        </span>
      )}
      {"\u2002"}
      {deletions != null && deletions > 0 && (
        <span className="text-red-600 dark:text-red-400">−{deletions}</span>
      )}
    </span>
  )
}

/** 路径展示：目录灰显 + 文件名正常 */
export function FilePath({
  path,
  className,
}: {
  path: string
  className?: string
}) {
  const idx = path.lastIndexOf("/")
  if (idx === -1) {
    return <span className={cn("min-w-0 break-all", className)}>{path}</span>
  }
  return (
    <span className={cn("min-w-0 break-all", className)}>
      <span className="text-muted-foreground">{path.slice(0, idx + 1)}</span>
      <span>{path.slice(idx + 1)}</span>
    </span>
  )
}
