import { useState } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
  CircleAlert,
  FolderGit2,
  GitBranch,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { Project } from "@git-gui/core"
import logoUrl from "@/assets/logo.svg"
import { errText } from "@/lib/async"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ModeToggle } from "@/components/mode-toggle"
import { useProjectsStore, type StatusResult } from "@/stores/projects"

function StatusLine({ status }: { status: StatusResult }) {
  if ("err" in status) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-red-500">
            <CircleAlert className="size-3" />
            无法读取
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{status.err}</TooltipContent>
      </Tooltip>
    )
  }
  const s = status.ok
  const dirty = s.entries.length > 0
  const conflicted = s.entries.some((e) => e.conflicted)
  return (
    <span className="flex min-w-0 items-center gap-1">
      <GitBranch className="size-3 shrink-0" />
      <span className="truncate">
        {s.detached
          ? `分离头指针 ${s.headSha?.slice(0, 7) ?? ""}`
          : s.branch ?? "—"}
      </span>
      {conflicted ? (
        <span className="size-1.5 shrink-0 rounded-full bg-red-500" title="有冲突" />
      ) : dirty ? (
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="有未提交改动" />
      ) : null}
    </span>
  )
}

function ProjectListItem({
  project,
  onAskRemove,
}: {
  project: Project
  onAskRemove: (p: Project) => void
}) {
  const selected = useProjectsStore((s) => s.selectedPath === project.path)
  const select = useProjectsStore((s) => s.select)
  const status = useProjectsStore((s) => s.statuses[project.path])

  return (
    <div
      onClick={() => select(project.path)}
      className={cn(
        "group cursor-pointer rounded-lg px-2 py-1.5",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-2">
        <FolderGit2
          className={cn(
            "size-4 shrink-0",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {project.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal />
              <span className="sr-only">项目操作</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem variant="destructive" onSelect={() => onAskRemove(project)}>
              <Trash2 /> 从列表移除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
        {status ? (
          <StatusLine status={status} />
        ) : (
          <span className="text-muted-foreground/60">读取中…</span>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const projects = useProjectsStore((s) => s.projects)
  const add = useProjectsStore((s) => s.add)
  const remove = useProjectsStore((s) => s.remove)
  const refreshStatuses = useProjectsStore((s) => s.refreshStatuses)
  const gitVersion = useProjectsStore((s) => s.gitVersion)
  const gitVersionError = useProjectsStore((s) => s.gitVersionError)
  const [removing, setRemoving] = useState<Project | null>(null)
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (adding) return
    setAdding(true)
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        title: "选择一个 git 仓库目录",
      })
      if (typeof dir === "string" && dir.length > 0) {
        const p = await add(dir)
        toast.success(`已添加项目「${p.name}」`)
      }
    } catch (e) {
      toast.error("添加项目失败", { description: errText(e) })
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove() {
    if (!removing) return
    const p = removing
    setRemoving(null)
    try {
      await remove(p.path)
      toast.success(`已移除项目「${p.name}」`)
    } catch (e) {
      toast.error("移除项目失败", { description: errText(e) })
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <img src={logoUrl} alt="" draggable={false} className="size-5 shrink-0 select-none" />
        <span className="text-sm font-semibold tracking-tight">Git GUI</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => refreshStatuses()}>
                <RefreshCw />
                <span className="sr-only">刷新所有项目状态</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新所有项目状态</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleAdd}>
                <Plus />
                <span className="sr-only">添加项目</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>添加项目（本地 git 仓库目录）</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">
        项目 · {projects.length}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {projects.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
              还没有项目
              <br />
              点击右上角 <Plus className="inline size-3" /> 添加一个
              <br />
              本地 git 仓库目录
            </div>
          ) : (
            projects.map((p) => (
              <ProjectListItem key={p.path} project={p} onAskRemove={setRemoving} />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex h-10 shrink-0 items-center gap-1 border-t border-sidebar-border px-3 text-[11px] text-muted-foreground">
        <ModeToggle />
        <span className="ml-1 truncate" title={gitVersionError ?? gitVersion ?? ""}>
          {gitVersionError ? (
            <span className="text-red-500">git 不可用</span>
          ) : (
            gitVersion?.replace("git version ", "git ")
          )}
        </span>
      </div>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除项目「{removing?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              只会从 Git GUI 的项目列表中移除，不会删除磁盘上的任何文件或仓库。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemove}>
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
