import type { ProjectFileContent } from "@git-gui/core"
import { splitPath } from "@git-gui/core"
import { Code2, Eye, FileCode2, Loader2, Pencil, Save } from "lucide-react"
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
  editing: boolean
  dirty: boolean
  saving: boolean
  mode: FileViewMode
  onModeChange: (mode: FileViewMode) => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onChange: (value: string) => void
}

export function FileViewer({
  repo,
  selectedPath,
  conflicted,
  file,
  loading,
  error,
  text,
  editing,
  dirty,
  saving,
  mode,
  onModeChange,
  onEdit,
  onCancel,
  onSave,
  onChange,
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

  const path = splitPath(file?.path ?? selectedPath)
  const canPreview = file?.kind === "text" && (isMarkdown(file.path) || isSvg(file.path))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-sm font-medium">{path.base}</span>
        {path.dir && (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={file?.path ?? selectedPath}>
            {path.dir}
          </span>
        )}
        {conflicted && (
          <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px] font-normal">
            合并冲突
          </Badge>
        )}
        {dirty && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-orange-500" />
            未保存
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {file && <span className="text-[11px] text-muted-foreground">{formatSize(file.size)}</span>}
          {canPreview && !editing && (
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
          {file?.kind === "text" && (editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                取消
              </Button>
              <Button size="sm" onClick={onSave} disabled={!dirty || saving} title="保存（⌘/Ctrl + S）">
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                保存
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil /> 编辑
            </Button>
          ))}
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
            editing={editing}
            mode={mode}
            onChange={onChange}
            onSave={onSave}
          />
        )}
      </div>
    </div>
  )
}
