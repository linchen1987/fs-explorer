import { useState } from "react"
import { Check, ChevronsUpDown, GitBranch, Network } from "lucide-react"
import type { Branch } from "@fs-explorer/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/** 可搜索的分支选择器（本地/远程分组） */
export function BranchCombobox({
  value,
  branches,
  onChange,
  onAll,
  allLabel = "所有分支",
  placeholder = "选择分支",
  className,
}: {
  value: string | null
  branches: Branch[]
  onChange: (name: string) => void
  /** 提供后，在选择器顶部显示“所有分支”选项（以 null 表示） */
  onAll?: () => void
  allLabel?: string
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const locals = branches.filter((b) => !b.isRemote)
  const remotes = branches.filter((b) => b.isRemote)

  const renderItem = (b: Branch) => (
    <CommandItem
      key={b.refName}
      value={`${b.name} ${b.refName}`}
      onSelect={() => {
        onChange(b.name)
        setOpen(false)
      }}
    >
      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{b.name}</span>
      {b.isHead && (
        <Badge variant="secondary" className="px-1.5 font-normal">
          当前
        </Badge>
      )}
      <Check
        className={cn(
          "size-3.5 shrink-0",
          value === b.name ? "opacity-100" : "opacity-0",
        )}
      />
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("w-52 justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {value ?? (onAll ? allLabel : placeholder)}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索分支…" />
          <CommandList>
            <CommandEmpty>未找到分支</CommandEmpty>
            {onAll && (
              <CommandGroup heading="范围">
                <CommandItem
                  value={allLabel}
                  onSelect={() => {
                    onAll()
                    setOpen(false)
                  }}
                >
                  <Network className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{allLabel}</span>
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="本地">{locals.map(renderItem)}</CommandGroup>
            {remotes.length > 0 && (
              <CommandGroup heading="远程">{remotes.map(renderItem)}</CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
