import { useState, type FormEvent } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
  CircleAlert,
  Folder,
  FolderGit2,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react"
import type { Project } from "@fs-explorer/core"
import logoUrl from "@/assets/logo.svg"
import { errText } from "@/lib/async"
import { ipc } from "@/lib/ipc"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
          <span className="flex items-center gap-1 text-destructive">
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
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" title="有冲突" />
      ) : dirty ? (
        <span className="size-1.5 shrink-0 rounded-full bg-warning" title="有未提交改动" />
      ) : null}
    </span>
  )
}

function ProjectListItem({
  project,
  onAskRename,
  onAskRemove,
}: {
  project: Project
  onAskRename: (p: Project) => void
  onAskRemove: (p: Project) => void
}) {
  const selected = useProjectsStore((s) => s.selectedPath === project.path)
  const select = useProjectsStore((s) => s.select)
  const status = useProjectsStore((s) => s.statuses[project.path])
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.path })
  const ProjectIcon = project.isGitRepo ? FolderGit2 : Folder

  return (
    <div
      ref={setNodeRef}
      data-project-path={project.path}
      {...attributes}
      {...listeners}
      onClick={() => select(project.path)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group cursor-grab touch-none select-none rounded-lg px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        selected
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
          : "hover:bg-sidebar-accent/60",
        isDragging && "z-10 opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <ProjectIcon
          className={cn(
            "size-4 shrink-0",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={project.path}>
          {project.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal />
              <span className="sr-only">项目操作</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => onAskRename(project)}>
              <Pencil /> 重命名
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onAskRemove(project)}>
              <Trash2 /> 从列表移除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-6 text-xs leading-5 text-muted-foreground">
        {!project.isGitRepo ? (
          <span className="text-muted-foreground/60">非 Git 目录</span>
        ) : status ? (
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
  const rename = useProjectsStore((s) => s.rename)
  const reorder = useProjectsStore((s) => s.reorder)
  const refreshStatuses = useProjectsStore((s) => s.refreshStatuses)
  const gitVersion = useProjectsStore((s) => s.gitVersion)
  const gitVersionError = useProjectsStore((s) => s.gitVersionError)
  const [removing, setRemoving] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renameSaving, setRenameSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const oldIndex = projects.findIndex((p) => p.path === active.id)
    const newIndex = projects.findIndex((p) => p.path === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const nextProjects = arrayMove(projects, oldIndex, newIndex)
    void reorder(nextProjects).catch((e) => {
      toast.error("保存项目顺序失败", { description: errText(e) })
    })
  }

  async function handleAdd() {
    if (adding) return
    setAdding(true)
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        title: "选择一个本地目录",
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

  function handleAskRename(project: Project) {
    setRenaming(project)
    setRenameInput(project.name)
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renaming || renameSaving) return
    const name = renameInput.trim()
    if (!name) return

    setRenameSaving(true)
    try {
      const project = await rename(renaming.path, name)
      toast.success(`项目已重命名为「${project.name}」`)
      setRenaming(null)
    } catch (e) {
      toast.error("重命名项目失败", { description: errText(e) })
    } finally {
      setRenameSaving(false)
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

  async function handleRestart() {
    try {
      await ipc.restartApp()
    } catch (e) {
      toast.error("重启应用失败", { description: errText(e) })
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-13 shrink-0 items-center gap-2.5 px-4">
        <img src={logoUrl} alt="" draggable={false} className="size-5.5 shrink-0 select-none" />
        <span className="text-[15px] font-semibold tracking-tight">FS Explorer</span>
        <div className="ml-auto flex items-center gap-1">
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
            <TooltipContent>添加项目（本地目录）</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="px-4 pt-1 pb-2 text-xs font-medium tracking-[0.03em] text-muted-foreground">
        项目 · {projects.length}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: "按空格键或回车键开始排序，使用方向键移动，再按一次确认，按 Escape 取消。",
            },
          }}
        >
          <SortableContext
            items={projects.map((p) => p.path)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1 px-2.5 pb-3">
              {projects.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                  还没有项目
                  <br />
                  点击右上角 <Plus className="inline size-3" /> 添加一个
                  <br />
                  本地目录（支持普通目录）
                </div>
              ) : (
                projects.map((p) => (
                  <ProjectListItem
                    key={p.path}
                    project={p}
                    onAskRename={handleAskRename}
                    onAskRemove={setRemoving}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      <div className="flex h-11 shrink-0 items-center gap-1.5 border-t border-sidebar-border px-3 text-xs text-muted-foreground">
        <ModeToggle />
        <span
          className="ml-1 min-w-0 flex-1 truncate"
          title={gitVersionError ?? gitVersion ?? ""}
        >
          {gitVersionError ? (
            <span className="text-destructive">git 不可用</span>
          ) : (
            gitVersion?.replace("git version ", "git ")
          )}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="xs" onClick={handleRestart}>
              <RotateCcw /> 重启
            </Button>
          </TooltipTrigger>
          <TooltipContent>关闭并重新打开应用</TooltipContent>
        </Tooltip>
      </div>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open && !renameSaving) setRenaming(null)
        }}
      >
        <DialogContent showCloseButton={!renameSaving}>
          <form className="contents" onSubmit={handleRename}>
            <DialogHeader>
              <DialogTitle>重命名项目</DialogTitle>
              <DialogDescription>
                自定义名称只影响应用内显示，不会修改磁盘目录。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="project-name">项目名称</Label>
              <Input
                id="project-name"
                value={renameInput}
                onChange={(event) => setRenameInput(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                maxLength={80}
                autoComplete="off"
                autoFocus
                disabled={renameSaving}
                required
              />
              <p className="truncate text-xs text-muted-foreground" title={renaming?.path}>
                {renaming?.path}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={renameSaving}
                onClick={() => setRenaming(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={renameSaving || !renameInput.trim()}>
                {renameSaving ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除项目「{removing?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              只会从 FS Explorer 的项目列表中移除，不会删除磁盘上的任何文件或仓库。
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
