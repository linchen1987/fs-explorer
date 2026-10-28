import { useState } from "react"
import { Check, ChevronsUpDown, GitBranch } from "lucide-react"
import type { Branch } from "@git-gui/core"
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
  placeholder = "选择分支",
  className,
}: {
  value: string | null
  branches: Branch[]
  onChange: (name: string) => void
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
        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
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
            <span className="truncate">{value ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索分支…" />
          <CommandList>
            <CommandEmpty>未找到分支</CommandEmpty>
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
