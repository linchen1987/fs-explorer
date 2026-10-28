import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** 居中提示（空状态 / 错误 / 加载占位共用） */
export function CenterHint({
  icon: Icon,
  title,
  desc,
  className,
  children,
}: {
  icon?: LucideIcon
  title?: React.ReactNode
  desc?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-8 opacity-50" />}
      {title && <div className="text-sm font-medium">{title}</div>}
      {desc && <div className="max-w-sm text-xs leading-relaxed">{desc}</div>}
      {children}
    </div>
  )
}
