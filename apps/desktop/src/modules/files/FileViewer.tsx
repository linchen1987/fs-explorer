import type { ProjectFileContent } from "@fs-explorer/core"
import { ArrowLeft, ArrowRight, Code2, Copy, Eye, FileCode2 } from "lucide-react"
import { toast } from "sonner"
import { errText } from "@/lib/async"
import { CenterHint } from "@/components/CenterHint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileContentView, isMarkdown, isSvg, type FileViewMode } from "./FileContentView"

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

interface FileViewerProps {
  repo: string
  selectedPath: string | null
  conflicted: boolean
  file: ProjectFileContent | null
  loading: boolean
  error: string | null
  text: string
  dirty: boolean
  saving: boolean
  mode: FileViewMode
  onModeChange: (mode: FileViewMode) => void
  onChange: (value: string) => void
  onOpenFile: (path: string) => void
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
}

export function FileViewer({
  repo,
  selectedPath,
  conflicted,
  file,
  loading,
  error,
  text,
  dirty,
  saving,
  mode,
  onModeChange,
  onChange,
  onOpenFile,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: FileViewerProps) {
  if (!selectedPath) {
    return (
      <CenterHint
        icon={FileCode2}
        title="选择一个文件"
        desc="查看文本、代码、Markdown、SVG、图片或视频。"
      />
    )
  }

  const currentPath = file?.path ?? selectedPath
  const canPreview = file?.kind === "text" && (isMarkdown(file.path) || isSvg(file.path))

  async function copyPath() {
    const absolutePath = `${repo.replace(/\/+$/, "")}/${currentPath}`
    try {
      await navigator.clipboard.writeText(absolutePath)
      toast.success("文件路径已复制", { description: absolutePath })
    } catch (error) {
      toast.error("复制文件路径失败", { description: errText(error) })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b bg-card/20 px-4">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="后退"
            title="后退"
            disabled={!canGoBack || saving}
            onClick={onBack}
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="前进"
            title="前进"
            disabled={!canGoForward || saving}
            onClick={onForward}
          >
            <ArrowRight />
          </Button>
        </div>
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 flex-1 cursor-text select-text truncate text-sm font-medium"
          title={currentPath}
        >
          {currentPath}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="复制文件路径"
          title="复制文件路径"
          onClick={() => void copyPath()}
        >
          <Copy />
        </Button>
        {conflicted && (
          <Badge variant="destructive" className="shrink-0 px-1.5 font-normal">
            合并冲突
          </Badge>
        )}
        {dirty && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-warning" />
            未保存
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {file && <span className="text-xs tabular-nums text-muted-foreground">{formatSize(file.size)}</span>}
          {canPreview && (
            <Tabs value={mode} onValueChange={(value) => onModeChange(value as FileViewMode)} className="gap-0">
              <TabsList className="h-7">
                <TabsTrigger value="code" className="gap-1 px-2 text-xs">
                  <Code2 /> 代码
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-1 px-2 text-xs">
                  <Eye /> 预览
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {!file ? (
          loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 12 }, (_, index) => (
                <Skeleton key={index} className="h-3.5" style={{ width: `${82 - (index % 4) * 13}%` }} />
              ))}
            </div>
          ) : error ? (
            <CenterHint icon={FileCode2} title="无法读取文件" desc={error} />
          ) : (
            <CenterHint icon={FileCode2} title="文件不可用" desc="请刷新文件列表后重试。" />
          )
        ) : (
          <FileContentView
            repo={repo}
            file={file}
            text={text}
            mode={mode}
            onChange={onChange}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  )
}
