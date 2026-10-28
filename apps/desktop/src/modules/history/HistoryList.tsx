import { useMemo } from "react"
import { Loader2 } from "lucide-react"
import type { CommitGraphRow, HistoryCommit } from "@git-gui/core"
import { layoutCommitGraph, timeAgo } from "@git-gui/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const ROW_HEIGHT = 56
const LANE_WIDTH = 15
const LANE_COLORS = [
  "#8b5cf6",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
]

function laneX(lane: number) {
  return 12 + lane * LANE_WIDTH
}

function GraphCell({ row, width }: { row: CommitGraphRow; width: number }) {
  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 select-none"
      aria-hidden="true"
    >
      {row.segments.map((segment, index) => {
        const x1 = laneX(segment.fromLane)
        const x2 = laneX(segment.toLane)
        const y1 = segment.fromY * ROW_HEIGHT
        const y2 = segment.toY * ROW_HEIGHT
        const colorLane =
          segment.kind === "outgoing" ? segment.toLane : segment.fromLane
        const props = {
          stroke: LANE_COLORS[colorLane % LANE_COLORS.length],
          strokeWidth: 1.7,
          fill: "none",
          strokeLinecap: "round" as const,
        }
        return x1 === x2 ? (
          <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} {...props} />
        ) : (
          <path
            key={index}
            d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
            {...props}
          />
        )
      })}
      <circle
        cx={laneX(row.nodeLane)}
        cy={ROW_HEIGHT / 2}
        r={4}
        fill="var(--background)"
        stroke={LANE_COLORS[row.nodeLane % LANE_COLORS.length]}
        strokeWidth={2.2}
      />
    </svg>
  )
}

function RefLabels({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null
  const visible = refs.slice(0, 2)
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={refs.join("\n")}
    >
      {visible.map((ref) => (
        <span
          key={ref}
          className={cn(
            "max-w-28 truncate rounded border border-violet-500/25 bg-violet-500/10 px-1 py-px text-[10px] leading-3 text-violet-700 dark:text-violet-300",
            ref.startsWith("tag:") &&
              "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {ref}
        </span>
      ))}
      {refs.length > visible.length && (
        <span className="text-[10px] text-muted-foreground">+{refs.length - 2}</span>
      )}
    </span>
  )
}

export function HistoryList({
  commits,
  selectedSha,
  onSelect,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
}: {
  commits: HistoryCommit[]
  selectedSha: string | null
  onSelect: (sha: string) => void
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
}) {
  const graph = useMemo(() => layoutCommitGraph(commits), [commits])
  const graphWidth = Math.max(36, 20 + graph.laneCount * LANE_WIDTH)

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div
        className="min-h-full w-full"
        style={{ minWidth: graphWidth + 290 }}
      >
        {commits.map((commit, index) => {
          const row = graph.rows[index]
          const active = commit.sha === selectedSha
          const fullDate = new Date(commit.timestamp * 1000).toLocaleString("zh-CN")
          return (
            <button
              type="button"
              key={commit.sha}
              onClick={() => onSelect(commit.sha)}
              aria-pressed={active}
              className={cn(
                "flex h-14 w-full min-w-0 cursor-pointer items-stretch border-b text-left hover:bg-accent/50",
                active && "bg-accent text-accent-foreground",
              )}
              title={commit.subject}
            >
              <GraphCell row={row} width={graphWidth} />
              <span className="min-w-0 flex-1 px-2 py-1.5">
                <span className="flex h-6 min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {commit.subject}
                  </span>
                  <RefLabels refs={commit.refs} />
                </span>
                <span className="flex h-5 min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 font-mono text-violet-600 dark:text-violet-400">
                    {commit.shortSha}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="min-w-0 truncate">{commit.authorName}</span>
                  <span className="ml-auto shrink-0" title={fullDate}>
                    {timeAgo(commit.timestamp)}
                  </span>
                </span>
              </span>
            </button>
          )
        })}

        {loadMoreError && (
          <div className="border-b px-3 py-2 text-xs break-all text-destructive">
            {loadMoreError}
          </div>
        )}
        {hasMore ? (
          <div className="flex h-12 items-center justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore && <Loader2 className="animate-spin" />}
              {loadingMore ? "正在加载…" : "加载更早的 80 条提交"}
            </Button>
          </div>
        ) : (
          <div className="flex h-10 items-center justify-center text-[11px] text-muted-foreground/70">
            已到达最早提交
          </div>
        )}
      </div>
    </div>
  )
}
