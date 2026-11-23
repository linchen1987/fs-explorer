import { useRef } from "react"
import type { ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"

const DEFAULT_ROW_HEIGHT = 36

/**
 * 单一滚动容器的虚拟行列表。只挂载视口及 overscan 范围内的行，
 * 支持动态行高，避免大量文件同时产生 React 元素与 DOM 节点。
 */
export function VirtualizedRows<T>({
  rows,
  getRowKey,
  renderRow,
  estimateRowHeight,
  className,
}: {
  rows: readonly T[]
  getRowKey: (row: T) => string
  renderRow: (row: T) => ReactNode
  estimateRowHeight?: (row: T) => number
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => getRowKey(rows[index]),
    estimateSize: (index) => estimateRowHeight?.(rows[index]) ?? DEFAULT_ROW_HEIGHT,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 12,
    initialRect: { width: 0, height: 600 },
  })

  return (
    <div ref={scrollRef} className={cn("h-full min-h-0 overflow-auto", className)}>
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderRow(row)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
