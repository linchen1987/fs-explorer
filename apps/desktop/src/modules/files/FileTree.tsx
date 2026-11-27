import { useEffect, useRef, useState } from "react"
import { confirm } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import {
  Calculator,
  ChevronRight,
  Copy,
  File,
  FileCode2,
  FileText,
  Film,
  HardDrive,
  Image,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react"
import type { FileSearchResult, FileTreeNode } from "@fs-explorer/core"
import { errText, useAsync } from "@/lib/async"
import { ipc } from "@/lib/ipc"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { StatusBadge } from "@/components/StatusBadge"
import { exactFileSize, formatFileSize } from "./file-size"
import { useFileSizes } from "./useFileSizes"
import { useFileTreeCopy } from "./useFileTreeCopy"

const PAGE_SIZE = 200
const SEARCH_DEBOUNCE_MS = 300
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"])
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv", "ogg"])
const CODE_EXTENSIONS = new Set([
  "c", "cc", "cpp", "css", "go", "h", "hpp", "html", "java", "js", "jsx",
  "json", "kt", "php", "py", "rb", "rs", "sh", "sql", "svg", "ts", "tsx",
  "vue", "xml", "yaml", "yml",
])

function extension(path: string) {
  return path.split(".").pop()?.toLocaleLowerCase() ?? ""
}

function FileTypeIcon({ path }: { path: string }) {
  const ext = extension(path)
  const className = "size-3.5 shrink-0 text-muted-foreground"
  if (IMAGE_EXTENSIONS.has(ext)) return <Image className={className} />
  if (VIDEO_EXTENSIONS.has(ext)) return <Film className={className} />
  if (CODE_EXTENSIONS.has(ext)) return <FileCode2 className={className} />
  if (ext === "md" || ext === "txt") return <FileText className={className} />
  return <File className={className} />
}

interface TreeViewProps {
  repo: string
  revision: number
  selectedPath: string | null
  conflictedPaths: ReadonlySet<string>
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onCopyFile: (path: string) => void
  onCopyPath: (path: string) => void
  sizes: ReadonlyMap<string, number>
  isMeasuring: (path: string) => boolean
  onMeasure: (path: string) => void
  deletingPath: string | null
  onDeletePath: (path: string, kind: FileTreeNode["kind"]) => void
}

interface TreeNodeProps extends TreeViewProps {
  node: FileTreeNode
  depth: number
}

function TreeNode({
  node,
  depth,
  selectedPath,
  conflictedPaths,
  expanded,
  onToggle,
  onSelect,
  onCopyFile,
  onCopyPath,
  sizes,
  isMeasuring,
  onMeasure,
  deletingPath,
  onDeletePath,
  ...treeProps
}: TreeNodeProps) {
  const directory = node.kind === "directory"
  const conflicted = !directory && conflictedPaths.has(node.path)
  const open = directory && expanded.has(node.path)
  const size = sizes.get(node.path)
  const measuring = isMeasuring(node.path)
  const deleting = deletingPath === node.path
  const row = (
    <button
      type="button"
      className={cn(
        "group flex h-8 w-full items-center gap-2 pr-2 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-1 focus-visible:outline-ring",
        !directory && selectedPath === node.path && "bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--primary)]",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      title={conflicted ? `${node.path}（合并冲突）` : node.path}
      aria-expanded={directory ? open : undefined}
      aria-current={!directory && selectedPath === node.path ? "page" : undefined}
      onMouseDown={(event) => {
        // WKWebView 点击按钮不一定自动聚焦，显式聚焦以支持键盘复制和焦点恢复。
        event.currentTarget.focus()
      }}
      onClick={() => directory ? onToggle(node.path) : onSelect(node.path)}
    >
      {directory ? (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      ) : (
        <FileTypeIcon path={node.path} />
      )}
      <span className="min-w-0 truncate">{node.name}</span>
      {(conflicted || measuring || deleting || size !== undefined) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {(measuring || deleting) && (
            <LoaderCircle
              className="size-3.5 animate-spin text-muted-foreground"
              aria-label={deleting ? `正在删除${directory ? "目录" : "文件"}` : "正在计算大小"}
            />
          )}
          {size !== undefined && (
            <span
              className="text-xs tabular-nums text-muted-foreground"
              title={exactFileSize(size)}
              aria-label={`${node.name}大小 ${exactFileSize(size)}`}
            >
              {formatFileSize(size)}
            </span>
          )}
          {conflicted && <StatusBadge status="U" />}
        </span>
      )}
    </button>
  )
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={() => { if (!directory) onSelect(node.path) }}>
          {row}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled={measuring} onSelect={() => onMeasure(node.path)}>
            <Calculator />
            {size === undefined ? "查看大小" : "重新计算大小"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopyFile(node.path)}>
            <Copy />
            {directory ? "复制目录" : "复制文件"}
            {!directory && <ContextMenuShortcut>⌘C</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopyPath(node.path)}>
            <Link2 />
            {directory ? "复制目录路径" : "复制文件路径"}
            {!directory && <ContextMenuShortcut>⌥⌘C</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            disabled={deleting}
            onSelect={() => onDeletePath(node.path, node.kind)}
          >
            <Trash2 />
            {directory ? "删除目录" : "删除文件"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {directory && open && (
        <DirectoryNodes
          parentPath={node.path}
          depth={depth + 1}
          selectedPath={selectedPath}
          conflictedPaths={conflictedPaths}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          onCopyFile={onCopyFile}
          onCopyPath={onCopyPath}
          sizes={sizes}
          isMeasuring={isMeasuring}
          onMeasure={onMeasure}
          deletingPath={deletingPath}
          onDeletePath={onDeletePath}
          {...treeProps}
        />
      )}
    </>
  )
}

interface DirectoryNodesProps extends TreeViewProps {
  parentPath: string
  depth: number
  onLoadingChange?: (loading: boolean) => void
}

function DirectoryNodes({
  repo,
  revision,
  parentPath,
  depth,
  onLoadingChange,
  ...treeProps
}: DirectoryNodesProps) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const page = useAsync(
    () => ipc.listProjectDirectory(repo, parentPath, limit),
    [repo, parentPath, limit, revision],
  )

  useEffect(() => {
    onLoadingChange?.(page.loading)
  }, [page.loading, onLoadingChange])

  if (page.error) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground" style={{ paddingLeft: `${8 + depth * 14}px` }}>
        <p className="text-destructive">目录读取失败</p>
        <p className="mt-1 break-all" title={page.error}>{page.error}</p>
        <button type="button" className="mt-1 underline hover:text-foreground" onClick={page.reload}>
          重试
        </button>
      </div>
    )
  }

  if (!page.data) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground" style={{ paddingLeft: `${8 + depth * 14}px` }}>
        正在读取目录…
      </p>
    )
  }

  return (
    <>
      {page.data.nodes.map((node) => (
        <TreeNode
          key={`${node.kind}:${node.path}`}
          node={node}
          depth={depth}
          repo={repo}
          revision={revision}
          {...treeProps}
        />
      ))}
      {page.data.total > page.data.nodes.length && (
        <button
          type="button"
          className="flex h-7 w-full items-center pr-2 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
        >
          显示更多（剩余 {page.data.total - page.data.nodes.length} 项）
        </button>
      )}
      {page.data.total === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground" style={{ paddingLeft: `${8 + depth * 14}px` }}>
          {parentPath ? "空目录" : "没有可显示的文件"}
        </p>
      )}
    </>
  )
}

interface FileTreeProps {
  repo: string
  revision: number
  selectedPath: string | null
  conflictedPaths: ReadonlySet<string>
  onSelect: (path: string) => void
  onRefresh: () => void
  onPathDeleted: (path: string, kind: FileTreeNode["kind"]) => void
}

interface SearchResponse {
  query: string
  result: FileSearchResult
}

export function FileTree({
  repo,
  revision,
  selectedPath,
  conflictedPaths,
  onSelect,
  onRefresh,
  onPathDeleted,
}: FileTreeProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rootLoading, setRootLoading] = useState(true)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const deleteGeneration = useRef(0)
  const { sizes, measurePath, isMeasuring } = useFileSizes(repo, revision)
  const normalizedQuery = query.trim()
  const searching = normalizedQuery.length > 0

  useEffect(() => {
    deleteGeneration.current += 1
    setDeletingPath(null)
    return () => { deleteGeneration.current += 1 }
  }, [repo])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const search = useAsync<SearchResponse | null>(() => {
    const currentQuery = debouncedQuery.trim()
    if (!currentQuery) return Promise.resolve(null)
    return ipc.searchProjectFiles(repo, currentQuery, PAGE_SIZE).then((result) => ({
      query: currentQuery,
      result,
    }))
  }, [repo, debouncedQuery, revision])
  const currentSearch = search.data?.query === normalizedQuery ? search.data.result : null
  const searchWaiting = searching && !search.error && (
    debouncedQuery.trim() !== normalizedQuery || search.loading || !currentSearch
  )

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const { treeRef, copyFile, copyPath, handleTreeKeyDown } = useFileTreeCopy({ repo, selectedPath })

  async function measureAndReveal(path: string) {
    const result = await measurePath(path)
    if (result?.kind === "directory" && path) {
      setExpanded((current) => new Set(current).add(path))
    }
  }

  async function deletePath(path: string, kind: FileTreeNode["kind"]) {
    const directory = kind === "directory"
    const target = directory ? "目录" : "文件"
    const currentGeneration = ++deleteGeneration.current
    try {
      const confirmed = await confirm(
        directory
          ? `确定永久删除目录「${path}」及其全部内容吗？所有文件和子目录都不会移入废纸篓，此操作无法撤销。`
          : `确定永久删除文件「${path}」吗？文件不会移入废纸篓，此操作无法撤销。`,
        {
          title: `删除${target}？`,
          kind: "warning",
          okLabel: "永久删除",
          cancelLabel: "取消",
        },
      )
      if (!confirmed || deleteGeneration.current !== currentGeneration) return

      setDeletingPath(path)
      await ipc.deleteProjectPath(repo, path)
      if (deleteGeneration.current !== currentGeneration) return
      toast.success(`${target}已删除`, { description: path })
      onPathDeleted(path, kind)
    } catch (error) {
      if (deleteGeneration.current === currentGeneration) {
        toast.error(`删除${target}失败`, { description: `${path}：${errText(error)}` })
      }
    } finally {
      if (deleteGeneration.current === currentGeneration) setDeletingPath(null)
    }
  }

  const treeProps: TreeViewProps = {
    repo,
    revision,
    selectedPath,
    conflictedPaths,
    expanded,
    onToggle: toggle,
    onSelect,
    onCopyFile: copyFile,
    onCopyPath: copyPath,
    sizes,
    isMeasuring,
    onMeasure: (path) => { void measureAndReveal(path) },
    deletingPath,
    onDeletePath: (path, kind) => { void deletePath(path, kind) },
  }

  const projectSize = sizes.get("")
  const projectMeasuring = isMeasuring("")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">项目文件</span>
          {(projectSize !== undefined || projectMeasuring) && (
            <span
              className="truncate text-xs tabular-nums text-muted-foreground"
              title={projectSize === undefined ? "正在计算项目大小" : `项目大小（不含 .git）：${exactFileSize(projectSize)}`}
            >
              {projectSize === undefined ? "正在计算大小…" : formatFileSize(projectSize)}
            </span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="查看项目及一级子项大小"
            aria-label="查看项目及一级子项大小"
            disabled={projectMeasuring}
            onClick={() => treeProps.onMeasure("")}
          >
            {projectMeasuring ? <LoaderCircle className="animate-spin" /> : <HardDrive />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="刷新文件列表"
            onClick={onRefresh}
          >
            <RefreshCw className={cn((rootLoading || (searching && search.loading)) && "animate-spin")} />
            <span className="sr-only">刷新文件列表</span>
          </Button>
        </div>
      </div>
      <div className="relative shrink-0 border-b p-2.5">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文件"
          className="h-9 pr-9 pl-9 text-sm"
          aria-label="搜索文件"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-3 -translate-y-1/2"
            title="清除搜索"
            onClick={() => setQuery("")}
          >
            <X />
            <span className="sr-only">清除搜索</span>
          </Button>
        )}
      </div>
      <div
        ref={treeRef}
        className="min-h-0 flex-1 overflow-auto py-1"
        aria-busy={searchWaiting}
        onKeyDown={handleTreeKeyDown}
      >
        {searching ? (
          searchWaiting ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">正在搜索文件…</p>
          ) : search.error ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              <p className="text-destructive">搜索失败</p>
              <p className="mt-1 break-all">{search.error}</p>
              <button type="button" className="mt-2 underline hover:text-foreground" onClick={search.reload}>
                重试
              </button>
            </div>
          ) : currentSearch && currentSearch.total > 0 ? (
            <>
              {currentSearch.paths.map((path) => (
                <TreeNode
                  key={path}
                  node={{ name: path, path, kind: "file" }}
                  depth={0}
                  {...treeProps}
                />
              ))}
              <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                共 {currentSearch.total} 个匹配文件
                {currentSearch.total > currentSearch.paths.length &&
                  `，仅显示前 ${currentSearch.paths.length} 个，请继续输入以缩小范围。`}
              </p>
            </>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配的文件</p>
          )
        ) : (
          <DirectoryNodes
            parentPath=""
            depth={0}
            onLoadingChange={setRootLoading}
            {...treeProps}
          />
        )}
      </div>
    </div>
  )
}
