import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, GitCompareArrows, Loader2 } from "lucide-react"
import { timeAgo } from "@fs-explorer/core"
import { errText, useAsync } from "@/lib/async"
import { useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { CenterHint } from "@/components/CenterHint"
import { FileChangeList, FileListViewModeToggle } from "@/components/FileChangeList"
import type { FileListViewMode } from "@/components/FileChangeList"
import { BranchCombobox } from "@/components/branch-combobox"
import { DiffViewer } from "@/components/diff/DiffViewer"
import { StatDelta } from "@/components/StatusBadge"
import { useCompareStore } from "@/stores/compare"
import { useFileNavigationStore } from "@/stores/file-navigation"
import type { ModuleProps } from "@/modules/registry"

interface Selection {
  repo: string
  base: string | null
  head: string | null
}

export function BranchCompareModule({ project }: ModuleProps) {
  const repo = project.path
  const branches = useAsync(() => ipc.listBranches(repo), [repo])
  const saved = useCompareStore((s) => s.selections[repo])
  const setSelection = useCompareStore((s) => s.setSelection)
  const openFile = useFileNavigationStore((s) => s.openFile)

  const [sel, setSel] = useState<Selection | null>(null)
  const [fileSelPath, setFileSelPath] = useState<string | null>(null)
  const [listTab, setListTab] = useState<"files" | "commits">("files")
  const [viewMode, setViewMode] = useState<FileListViewMode>("tree")

  useRefreshListener(() => {
    branches.reload()
  })

  // 分支列表加载后初始化 base/head（优先恢复该仓库上次的选择）
  useEffect(() => {
    const bl = branches.data
    if (!bl || sel?.repo === repo) return
    const names = new Set(bl.branches.map((b) => b.name))
    const valid = (x?: string | null) => (x && names.has(x) ? x : null)
    const firstLocal = bl.branches.find((b) => !b.isRemote)?.name ?? null
    setSel({
      repo,
      base: valid(saved?.base) ?? valid(bl.defaultBranch) ?? firstLocal,
      head: valid(saved?.head) ?? valid(bl.current) ?? firstLocal,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.data, repo, sel])

  const effSel = sel?.repo === repo ? sel : null
  const base = effSel?.base ?? null
  const head = effSel?.head ?? null

  const compare = useAsync(
    () =>
      base && head
        ? ipc.compareRefs(repo, base, head)
        : Promise.resolve(null),
    [repo, base, head],
  )

  const files = useMemo(() => compare.data?.files ?? [], [compare.data])
  const commits = useMemo(() => compare.data?.commits ?? [], [compare.data])

  const selectedFile = useMemo(() => {
    if (files.length === 0) return null
    const hit = files.find((f) => f.newPath === fileSelPath)
    return hit ?? files[0]
  }, [files, fileSelPath])

  const diff = useAsync(
    () =>
      selectedFile && base && head
        ? ipc.diffRefsFile(
            repo,
            base,
            head,
            selectedFile.newPath,
            selectedFile.oldPath,
          )
        : Promise.resolve(null),
    [repo, base, head, selectedFile?.newPath, selectedFile?.oldPath],
  )
  useRefreshListener(() => {
    compare.reload()
    // 分支名和文件路径不变时，也必须重新读取当前文件的 Diff。
    diff.reload()
  })

  function update(next: { base?: string; head?: string }) {
    const nb = next.base ?? base
    const nh = next.head ?? head
    setSel({ repo, base: nb, head: nh })
    setSelection(repo, nb, nh)
  }

  function swap() {
    if (base && head) update({ base: head, head: base })
  }

  useEffect(() => {
    if (compare.error) {
      toast.error("对比分支失败", { description: errText(compare.error) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compare.error])

  // ---- 渲染 ----

  const bl = branches.data
  if (branches.loading && !bl) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-7 w-96" />
        <div className="flex flex-1 gap-2 pt-6">
          <Skeleton className="h-full w-64" />
          <Skeleton className="h-full flex-1" />
        </div>
      </div>
    )
  }

  if (branches.error) {
    return (
      <CenterHint
        icon={GitCompareArrows}
        title="无法读取分支"
        desc={errText(branches.error)}
      />
    )
  }

  if (!bl || bl.branches.length === 0) {
    return (
      <CenterHint
        icon={GitCompareArrows}
        title="该仓库还没有分支"
        desc="创建第一个提交后即可在分支之间对比差异。"
      />
    )
  }

  const r = compare.data
  const sameBranch = base !== null && base === head

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具栏：base ... head */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2.5 border-b bg-card/20 px-4 py-2">
        <BranchCombobox
          value={base}
          branches={bl.branches}
          onChange={(v) => update({ base: v })}
        />
        <span className="text-xs text-muted-foreground">…</span>
        <BranchCombobox
          value={head}
          branches={bl.branches}
          onChange={(v) => update({ head: v })}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={swap}
          title="交换 base 与 head"
        >
          <ArrowLeftRight />
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {compare.loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : r ? (
            <>
              <span>
                <span className="font-medium text-foreground">{r.files.length}</span>{" "}
                个文件
              </span>
              <StatDelta additions={r.totalAdditions} deletions={r.totalDeletions} />
              <span className="text-muted-foreground/60">·</span>
              <span>{r.commits.length} 个提交</span>
              {r.mergeBase && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span
                    className="font-mono"
                    title={`merge-base: ${r.mergeBase}`}
                  >
                    merge-base {r.mergeBase.slice(0, 7)}
                  </span>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      {compare.error ? (
        <CenterHint
          icon={GitCompareArrows}
          title="对比失败"
          desc={errText(compare.error)}
        />
      ) : sameBranch ? (
        <CenterHint
          icon={GitCompareArrows}
          title="两个分支相同"
          desc="base 与 head 是同一个分支，交换或重新选择后再试。"
        />
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="30%" minSize="20%" maxSize="50%" className="bg-panel">
            <Tabs
              value={listTab}
              onValueChange={(v) => setListTab(v as "files" | "commits")}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
                <TabsList className="h-8">
                  <TabsTrigger value="files">文件 {files.length}</TabsTrigger>
                  <TabsTrigger value="commits">提交 {commits.length}</TabsTrigger>
                </TabsList>
                {listTab === "files" && files.length > 0 && (
                  <FileListViewModeToggle value={viewMode} onChange={setViewMode} />
                )}
              </div>
              <TabsContent
                value="files"
                forceMount
                className="min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                {files.length === 0 ? (
                  <CenterHint
                    icon={GitCompareArrows}
                    title="没有文件差异"
                    desc="两个分支的内容完全一致。"
                  />
                ) : (
                  <FileChangeList
                    key={`${base}:${head}`}
                    files={files}
                    viewMode={viewMode}
                    selectedPath={selectedFile?.newPath ?? null}
                    onSelect={setFileSelPath}
                    onOpenFile={(path) => openFile(repo, path)}
                  />
                )}
              </TabsContent>
              <TabsContent
                value="commits"
                className="min-h-0 flex-1 overflow-y-auto p-1"
              >
                {commits.length === 0 ? (
                  <CenterHint
                    icon={GitCompareArrows}
                    title="没有提交"
                    desc={`head 相对 base 没有新提交${r?.mergeBase ? "（从 merge-base 起）" : "（两分支无共同祖先，尝试交换方向）"}。`}
                  />
                ) : (
                  commits.map((c) => (
                    <div
                      key={c.sha}
                      className="border-b border-border/60 px-3 py-2.5 text-sm last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-commit">
                          {c.shortSha}
                        </span>
                        <span className="truncate">{c.authorName}</span>
                        <span className="ml-auto shrink-0">{timeAgo(c.timestamp)}</span>
                      </div>
                      <div className="mt-0.5 break-all">{c.subject}</div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="70%">
            <DiffViewer
              text={diff.data}
              loading={diff.loading}
              emptyHint={
                files.length === 0 ? "无文件差异" : "选择左侧文件查看差异"
              }
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
