import { useMemo, useState } from "react"
import {
  ChevronRight,
  File,
  FileCode2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import {
  buildFileTree,
  filterFileTree,
  type FileTreeNode,
} from "@git-gui/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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

function TreeNode({
  node,
  depth,
  selectedPath,
  expanded,
  searching,
  onToggle,
  onSelect,
}: {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  expanded: Set<string>
  searching: boolean
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  const directory = node.kind === "directory"
  const open = searching || expanded.has(node.path)
  return (
    <>
      <button
        type="button"
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 pr-2 text-left text-[13px] hover:bg-accent/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-1 focus-visible:outline-ring",
          !directory && selectedPath === node.path && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={node.path}
        aria-expanded={directory ? open : undefined}
        aria-current={!directory && selectedPath === node.path ? "page" : undefined}
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
      </button>
      {directory && open && node.children.map((child) => (
        <TreeNode
          key={`${child.kind}:${child.path}`}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expanded={expanded}
          searching={searching}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

interface FileTreeProps {
  paths: string[]
  selectedPath: string | null
  loading: boolean
  onSelect: (path: string) => void
  onRefresh: () => void
}

export function FileTree({
  paths,
  selectedPath,
  loading,
  onSelect,
  onRefresh,
}: FileTreeProps) {
  const [query, setQuery] = useState("")
  const [expanded, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => buildFileTree(paths), [paths])
  const visible = useMemo(() => filterFileTree(tree, query), [tree, query])

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-xs font-medium">项目文件</span>
        <span className="text-[11px] text-muted-foreground">{paths.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          title="刷新文件列表（不含被 Git 忽略的文件）"
          onClick={onRefresh}
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
          <span className="sr-only">刷新文件列表</span>
        </Button>
      </div>
      <div className="relative shrink-0 border-b p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="筛选文件"
          className="h-7 pr-7 pl-7 text-xs"
          aria-label="筛选文件"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-3 size-5 -translate-y-1/2"
            title="清除筛选"
            onClick={() => setQuery("")}
          >
            <X />
            <span className="sr-only">清除筛选</span>
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {visible.length > 0 ? visible.map((node) => (
          <TreeNode
            key={`${node.kind}:${node.path}`}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            expanded={expanded}
            searching={query.trim().length > 0}
            onToggle={toggle}
            onSelect={onSelect}
          />
        )) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query ? "没有匹配的文件" : loading ? "正在读取文件…" : "没有可显示的文件"}
          </p>
        )}
      </div>
    </div>
  )
}
