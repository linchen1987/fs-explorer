import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  FolderGit2,
  GitBranch,
  Plus,
  RefreshCw,
  SquareTerminal,
} from "lucide-react"
import { open } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { errText } from "@/lib/async"
import { emitRefresh } from "@/lib/events"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CenterHint } from "@/components/CenterHint"
import { MODULES } from "@/modules/registry"
import { useProjectsStore, useSelectedProject } from "@/stores/projects"
import { useFileNavigationStore } from "@/stores/file-navigation"

const TerminalPanel = lazy(() => import("@/components/terminal/TerminalPanel"))

function Welcome() {
  const add = useProjectsStore((s) => s.add)
  const projects = useProjectsStore((s) => s.projects)

  async function handleAdd() {
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
    }
  }

  return (
    <CenterHint
      icon={FolderGit2}
      title={
        projects.length === 0 ? "开始使用 Git GUI" : "从左侧选择一个项目"
      }
      desc={
        projects.length === 0
          ? "添加一个包含 .git 的本地目录作为项目；项目会并列展示在左侧，同一时间管理一个。"
          : "或添加新项目。"
      }
      className="gap-4"
    >
      {projects.length === 0 && (
        <Button onClick={handleAdd}>
          <Plus /> 添加项目
        </Button>
      )}
    </CenterHint>
  )
}

export function MainArea() {
  const project = useSelectedProject()
  const status = useProjectsStore((s) => project ? s.statuses[project.path] : undefined)
  const refreshStatus = useProjectsStore((s) => s.refreshStatus)
  const [active, setActive] = useState<string>(MODULES[0].id)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalMounted, setTerminalMounted] = useState(false)
  const [mounted, setMounted] = useState<{ repo: string | null; ids: string[] }>({
    repo: null,
    ids: [MODULES[0].id],
  })
  const openFileRequest = useFileNavigationStore((s) => s.request)
  const repo = project?.path ?? null

  const refresh = useCallback(() => {
    if (!repo) return
    emitRefresh()
    void refreshStatus(repo)
  }, [repo, refreshStatus])

  const toggleTerminal = useCallback(() => {
    if (!repo) return
    setTerminalMounted(true)
    setTerminalOpen((value) => !value)
  }, [repo])

  const hideTerminal = useCallback(() => setTerminalOpen(false), [])

  const activateModule = useCallback((id: string) => {
    if (!repo) return
    setActive(id)
    setMounted((current) => ({
      repo,
      ids: [...new Set([
        ...(current.repo === repo ? current.ids : [active]),
        id,
      ])],
    }))
  }, [active, repo])

  useEffect(() => {
    if (openFileRequest?.repo === repo && repo) activateModule("files")
  }, [activateModule, openFileRequest, repo])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.code === "Backquote" || event.key.toLowerCase() === "j")
        && !event.altKey
        && !event.shiftKey
        && !event.repeat
        && (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        event.stopPropagation()
        toggleTerminal()
        return
      }

      if (
        event.key.toLowerCase() !== "r"
        || event.altKey
        || event.shiftKey
        || (!event.metaKey && !event.ctrlKey)
      ) return

      // 阻止 WebView 整页重载，只刷新当前项目的数据。
      event.preventDefault()
      refresh()
    }
    // 使用捕获阶段，确保编辑器获得焦点时也能响应快捷键。
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [refresh, toggleTerminal])

  if (!project) {
    return (
      <div className="h-full bg-background">
        <Welcome />
      </div>
    )
  }

  const mountedIds = mounted.repo === repo ? mounted.ids : [active]
  const st = status && "ok" in status ? status.ok : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* 项目头部 */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-sm font-semibold">{project.name}</span>
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={project.path}
        >
          {project.path}
        </span>
        {st && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            {st.detached
              ? `分离头指针 ${st.headSha?.slice(0, 7) ?? ""}`
              : st.branch ?? "—"}
            {st.ahead != null && st.ahead > 0 && (
              <span className="flex items-center">
                <ArrowUp className="size-3" />
                {st.ahead}
              </span>
            )}
            {st.behind != null && st.behind > 0 && (
              <span className="flex items-center">
                <ArrowDown className="size-3" />
                {st.behind}
              </span>
            )}
            {st.entries.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {st.entries.length} 项改动
              </Badge>
            )}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={terminalOpen ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={toggleTerminal}
                aria-keyshortcuts="Meta+J Control+J Meta+` Control+`"
                aria-pressed={terminalOpen}
              >
                <SquareTerminal />
                <span className="sr-only">切换终端</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>终端（⌘J / Ctrl+J）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={refresh}
                aria-keyshortcuts="Meta+R Control+R"
              >
                <RefreshCw />
                <span className="sr-only">刷新</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新当前数据（⌘R / Ctrl+R）</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* 模块页签 */}
        <Tabs
          value={active}
          onValueChange={activateModule}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="shrink-0 border-b px-3 py-1">
            <TabsList className="h-8 gap-1">
              {MODULES.map((m) => (
                <TabsTrigger key={m.id} value={m.id} className="gap-1.5 px-3">
                  <m.icon className="size-3.5" />
                  {m.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {MODULES.map((m) => (
            <TabsContent
              key={m.id}
              value={m.id}
              forceMount
              className={cn("min-h-0 flex-1 outline-none data-[state=inactive]:hidden")}
            >
              {/* 切换项目时重挂载模块，避免旧仓库的异步数据和选择状态串入新仓库。 */}
              {mountedIds.includes(m.id) && (
                <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载模块…</div>}>
                  <m.component key={project.path} project={project} active={active === m.id} />
                </Suspense>
              )}
            </TabsContent>
          ))}
        </Tabs>
        {terminalMounted && (
          <Suspense fallback={terminalOpen ? <div className="flex h-[260px] shrink-0 items-center justify-center border-t text-xs text-muted-foreground">正在加载终端…</div> : null}>
            <TerminalPanel
              key={project.path}
              repo={project.path}
              projectName={project.name}
              visible={terminalOpen}
              onHide={hideTerminal}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
