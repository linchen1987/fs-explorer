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
        "flex h-full flex-col items-center justify-center gap-2.5 p-8 text-center text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="mb-1 size-9 stroke-[1.5] text-muted-foreground/65" />}
      {title && <div className="text-[15px] leading-6 font-medium text-foreground/90">{title}</div>}
      {desc && <div className="max-w-md text-xs leading-relaxed">{desc}</div>}
      {children}
    </div>
  )
}
