import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GitCommitHorizontal, History as HistoryIcon } from "lucide-react"
import type { HistoryCommit, HistoryPage } from "@fs-explorer/core"
import { errText, useAsync } from "@/lib/async"
import { useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { CenterHint } from "@/components/CenterHint"
import { BranchCombobox } from "@/components/branch-combobox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { ModuleProps } from "@/modules/registry"
import { CommitDetail } from "./CommitDetail"
import { HistoryList } from "./HistoryList"

const PAGE_SIZE = 80

interface HistoryState {
  commits: HistoryCommit[]
  hasMore: boolean
  nextSkip: number
  loading: boolean
  loadingMore: boolean
  error: string | null
}

const EMPTY_HISTORY: HistoryState = {
  commits: [],
  hasMore: false,
  nextSkip: 0,
  loading: false,
  loadingMore: false,
  error: null,
}

function HistorySkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[45%] flex-col gap-1 border-r p-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-3">
            <Skeleton className="h-full w-8" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-4 h-32 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  )
}

export function HistoryModule({ project }: ModuleProps) {
  const repo = project.path
  const branches = useAsync(() => ipc.listBranches(repo), [repo])
  // undefined=尚未从分支列表初始化；null=所有分支；string=指定分支。
  const [revision, setRevision] = useState<string | null | undefined>(undefined)
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const [fileSelPath, setFileSelPath] = useState<string | null>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    const data = branches.data
    if (!data || revision !== undefined) return
    setRevision(
      data.branches.length === 0 ? null : (data.current ?? "HEAD"),
    )
  }, [branches.data, revision])

  const loadFirst = useCallback(async () => {
    if (revision === undefined) return
    const version = ++requestVersion.current
    setSelectedSha(null)
    setFileSelPath(null)
    setHistory({ ...EMPTY_HISTORY, loading: true })
    try {
      const page: HistoryPage = await ipc.listCommits(repo, revision, 0, PAGE_SIZE)
      if (requestVersion.current !== version) return
      setHistory({
        commits: page.commits,
        hasMore: page.hasMore,
        nextSkip: page.nextSkip,
        loading: false,
        loadingMore: false,
        error: null,
      })
    } catch (error) {
      if (requestVersion.current !== version) return
      setHistory({
        ...EMPTY_HISTORY,
        error: errText(error),
      })
    }
  }, [repo, revision])

  useEffect(() => {
    void loadFirst()
    return () => {
      // 组件卸载或 revision 变化后，忽略尚未返回的 git 结果。
      requestVersion.current += 1
    }
  }, [loadFirst])

  useRefreshListener(() => {
    branches.reload()
    void loadFirst()
  })

  async function loadMore() {
    if (
      revision === undefined ||
      history.loading ||
      history.loadingMore ||
      !history.hasMore
    ) {
      return
    }
    const version = requestVersion.current
    setHistory((s) => ({ ...s, loadingMore: true, error: null }))
    try {
      const page = await ipc.listCommits(
        repo,
        revision,
        history.nextSkip,
        PAGE_SIZE,
      )
      if (requestVersion.current !== version) return
      setHistory((s) => {
        const seen = new Set(s.commits.map((c) => c.sha))
        return {
          commits: [...s.commits, ...page.commits.filter((c) => !seen.has(c.sha))],
          hasMore: page.hasMore,
          nextSkip: page.nextSkip,
          loading: false,
          loadingMore: false,
          error: null,
        }
      })
    } catch (error) {
      if (requestVersion.current !== version) return
      setHistory((s) => ({
        ...s,
        loadingMore: false,
        error: errText(error),
      }))
    }
  }

  const selectedCommit = useMemo(
    () =>
      history.commits.find((c) => c.sha === selectedSha) ??
      history.commits[0] ??
      null,
    [history.commits, selectedSha],
  )
  const selectedShaEffective = selectedCommit?.sha ?? null

  // 把 sha 包进响应，防止 useAsync 保留的上一条提交数据被误用于新选择。
  const changesRequest = useAsync(
    () =>
      selectedShaEffective
        ? ipc
            .getCommitChanges(repo, selectedShaEffective)
            .then((data) => ({ sha: selectedShaEffective, data }))
        : Promise.resolve(null),
    [repo, selectedShaEffective],
  )
  const changes =
    changesRequest.data?.sha === selectedShaEffective
      ? changesRequest.data.data
      : null
  const files = useMemo(() => changes?.files ?? [], [changes])
  const selectedFile = useMemo(() => {
    if (files.length === 0) return null
    return files.find((f) => f.newPath === fileSelPath) ?? files[0]
  }, [files, fileSelPath])

  const diffKey = selectedCommit && selectedFile
    ? `${selectedCommit.sha}:${selectedFile.oldPath ?? ""}:${selectedFile.newPath}`
    : null
  const diffRequest = useAsync(
    () =>
      selectedCommit && selectedFile && diffKey
        ? ipc
            .diffCommitFile(
              repo,
              selectedCommit.sha,
              selectedFile.newPath,
              selectedFile.oldPath,
            )
            .then((text) => ({ key: diffKey, text }))
        : Promise.resolve(null),
    [repo, selectedCommit?.sha, selectedFile?.newPath, selectedFile?.oldPath],
  )
  const diffText = diffRequest.data?.key === diffKey ? diffRequest.data.text : null

  function selectCommit(sha: string) {
    setSelectedSha(sha)
    setFileSelPath(null)
  }

  if (branches.loading && !branches.data) {
    return <HistorySkeleton />
  }
  if (branches.error) {
    return (
      <CenterHint
        icon={HistoryIcon}
        title="无法读取分支"
        desc={branches.error}
      />
    )
  }
  if (!branches.data || branches.data.branches.length === 0) {
    return (
      <CenterHint
        icon={GitCommitHorizontal}
        title="该仓库还没有提交"
        desc="创建第一个提交后，即可在这里查看提交历史。"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <BranchCombobox
          value={revision ?? null}
          branches={branches.data.branches}
          onChange={setRevision}
          onAll={() => setRevision(null)}
        />
        <span className="text-xs text-muted-foreground">
          {revision === null ? "所有本地及远程分支" : "指定分支历史"}
        </span>
        <div className="ml-auto text-xs text-muted-foreground">
          {history.commits.length > 0 && (
            <span>
              已加载 {history.commits.length}
              {history.hasMore ? "+" : ""} 条提交
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {history.loading && history.commits.length === 0 ? (
          <HistorySkeleton />
        ) : history.error && history.commits.length === 0 ? (
          <CenterHint
            icon={HistoryIcon}
            title="读取提交历史失败"
            desc={history.error}
          />
        ) : history.commits.length === 0 ? (
          <CenterHint
            icon={GitCommitHorizontal}
            title="没有提交记录"
            desc={revision === null ? "所有分支均无提交。" : `分支 ${revision ?? ""} 没有提交。`}
          />
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel defaultSize="45%" minSize="30%" maxSize="70%">
              <HistoryList
                commits={history.commits}
                selectedSha={selectedCommit?.sha ?? null}
                onSelect={selectCommit}
                hasMore={history.hasMore}
                loadingMore={history.loadingMore}
                loadMoreError={history.error}
                onLoadMore={loadMore}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="55%">
              {selectedCommit ? (
                <CommitDetail
                  commit={selectedCommit}
                  changes={changes}
                  changesLoading={changesRequest.loading}
                  changesError={changesRequest.error}
                  selectedFile={selectedFile}
                  onSelectFile={setFileSelPath}
                  diffText={diffText}
                  diffLoading={diffRequest.loading && selectedFile !== null}
                  diffError={diffRequest.error}
                />
              ) : (
                <CenterHint
                  icon={GitCommitHorizontal}
                  title="选择一条提交"
                  desc="查看提交的文件变化与 Diff。"
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
