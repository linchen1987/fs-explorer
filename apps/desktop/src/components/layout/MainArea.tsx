import { useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  FolderGit2,
  GitBranch,
  Plus,
  RefreshCw,
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
  const statuses = useProjectsStore((s) => s.statuses)
  const refreshStatuses = useProjectsStore((s) => s.refreshStatuses)
  const [active, setActive] = useState<string>(MODULES[0].id)

  if (!project) {
    return (
      <div className="h-full bg-background">
        <Welcome />
      </div>
    )
  }

  const status = statuses[project.path]
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
        <div className="ml-auto shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  emitRefresh()
                  refreshStatuses()
                }}
              >
                <RefreshCw />
                <span className="sr-only">刷新</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新当前数据</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* 模块页签 */}
      <Tabs
        value={active}
        onValueChange={setActive}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b px-3">
          <TabsList className="h-10 gap-4 bg-transparent p-0">
            {MODULES.map((m) => (
              <TabsTrigger
                key={m.id}
                value={m.id}
                className="gap-1.5 rounded-none border-b-2 border-transparent px-1 pb-px data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:text-foreground"
              >
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
            <m.component project={project} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
