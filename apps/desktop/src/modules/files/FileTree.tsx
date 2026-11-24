import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ChevronRight,
  Copy,
  File,
  FileCode2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image,
  Link2,
  RefreshCw,
  Search,
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
  ...treeProps
}: TreeNodeProps) {
  const directory = node.kind === "directory"
  const conflicted = !directory && conflictedPaths.has(node.path)
  const open = directory && expanded.has(node.path)
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
      onPointerDown={(event) => {
        // WKWebView 点击按钮不一定自动聚焦，而原生 copy 事件需要从列表内派发。
        event.currentTarget.focus()
      }}
      onClick={() => directory ? onToggle(node.path) : onSelect(node.path)}
    >
      {directory ? (
        <>
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          {open ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </>
      ) : (
        <FileTypeIcon path={node.path} />
      )}
      <span className="min-w-0 truncate">{node.name}</span>
      {conflicted && <StatusBadge status="U" className="ml-auto" />}
    </button>
  )
  return (
    <>
      {directory ? row : (
        <ContextMenu>
          <ContextMenuTrigger asChild onContextMenu={() => onSelect(node.path)}>
            {row}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onCopyFile(node.path)}>
              <Copy />
              复制文件
              <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCopyPath(node.path)}>
              <Link2 />
              复制文件路径
              <ContextMenuShortcut>⌥⌘C</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
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
}: FileTreeProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rootLoading, setRootLoading] = useState(true)
  const normalizedQuery = query.trim()
  const searching = normalizedQuery.length > 0

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

  // keydown 与原生 copy 事件可能都触发一次复制，300ms 内去重。
  const lastCopyAtRef = useRef(0)
  const copyFile = useCallback(async (path: string) => {
    if (Date.now() - lastCopyAtRef.current < 300) return
    lastCopyAtRef.current = Date.now()
    try {
      await ipc.copyFilesToClipboard(repo, [path])
      toast.success("已复制文件，可在 Finder 等处粘贴", { description: path })
    } catch (error) {
      toast.error("复制文件失败", { description: errText(error) })
    }
  }, [repo])

  const copyPath = useCallback(async (path: string) => {
    const absolutePath = `${repo.replace(/\/+$/, "")}/${path}`
    try {
      await navigator.clipboard.writeText(absolutePath)
      toast.success("文件路径已复制", { description: absolutePath })
    } catch (error) {
      toast.error("复制文件路径失败", { description: errText(error) })
    }
  }, [repo])

  // macOS 上 ⌘C 被原生菜单（Edit → Copy）拦截，keydown 收不到；
  // WebKit 会转而派发原生 copy 事件。只在文件列表内接管该事件，
  // 避免覆盖 Markdown 预览等区域的文本复制。
  function handleTreeCopy(event: React.ClipboardEvent<HTMLDivElement>) {
    if (!selectedPath) return
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return
    }
    event.preventDefault()
    void copyFile(selectedPath)
  }

  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "c") return
    if (!selectedPath) return
    const target = event.target as HTMLElement | null
    if (!target || target === event.currentTarget) return
    if (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return
    }
    // 非 macOS 平台没有原生菜单拦截，keydown 里直接处理；
    // macOS 上若 copy 事件也触发，由 copyFile 内部节流去重。
    event.preventDefault()
    if (event.altKey) void copyPath(selectedPath)
    else void copyFile(selectedPath)
  }

  const treeProps: TreeViewProps = {
    repo,
    revision,
    selectedPath,
    conflictedPaths,
    expanded,
    onToggle: toggle,
    onSelect,
    onCopyFile: (path) => void copyFile(path),
    onCopyPath: (path) => void copyPath(path),
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <span className="text-sm font-medium">项目文件</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          title="刷新文件列表"
          onClick={onRefresh}
        >
          <RefreshCw className={cn((rootLoading || (searching && search.loading)) && "animate-spin")} />
          <span className="sr-only">刷新文件列表</span>
        </Button>
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
        className="min-h-0 flex-1 overflow-auto py-1"
        aria-busy={searchWaiting}
        onCopy={handleTreeCopy}
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
