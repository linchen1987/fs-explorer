import { lazy, Suspense, useEffect, useMemo } from "react"
import type { ProjectFileContent } from "@git-gui/core"
import { FileWarning } from "lucide-react"
import { CenterHint } from "@/components/CenterHint"
import { CodeEditor } from "./CodeEditor"

const MarkdownPreview = lazy(() =>
  import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })),
)

export type FileViewMode = "code" | "preview"

export function isMarkdown(path: string) {
  return path.toLocaleLowerCase().endsWith(".md")
}

export function isSvg(path: string) {
  return path.toLocaleLowerCase().endsWith(".svg")
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function SvgPreview({ text }: { text: string }) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })),
    [text],
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-8">
      <img src={url} alt="SVG 预览" className="max-h-full max-w-full object-contain" />
    </div>
  )
}

interface FileContentViewProps {
  repo: string
  file: ProjectFileContent
  text: string
  editing: boolean
  mode: FileViewMode
  onChange: (value: string) => void
  onSave: () => void
  onOpenFile?: (path: string) => void
}

export function FileContentView({
  repo,
  file,
  text,
  editing,
  mode,
  onChange,
  onSave,
  onOpenFile = () => {},
}: FileContentViewProps) {
  if (file.kind === "image" && file.data && file.mime) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-6">
        <img
          src={`data:${file.mime};base64,${file.data}`}
          alt={file.path}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (file.kind === "video" && file.data && file.mime) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-black/95 p-4">
        <video
          src={`data:${file.mime};base64,${file.data}`}
          controls
          preload="metadata"
          className="max-h-full max-w-full"
        >
          当前环境无法播放此视频。
        </video>
      </div>
    )
  }

  if (file.kind !== "text") {
    return (
      <CenterHint
        icon={FileWarning}
        title="暂不支持预览此文件"
        desc={`${formatBytes(file.size)} · 二进制文件不能按文本查看或编辑。`}
      />
    )
  }

  if (!editing && mode === "preview" && isMarkdown(file.path)) {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载预览…</div>}>
        <MarkdownPreview repo={repo} path={file.path} text={text} onOpenFile={onOpenFile} />
      </Suspense>
    )
  }
  if (!editing && mode === "preview" && isSvg(file.path)) {
    return <SvgPreview text={text} />
  }

  return (
    <CodeEditor
      key={`${file.path}:${editing ? "edit" : "view"}`}
      path={file.path}
      value={text}
      readOnly={!editing}
      onChange={onChange}
      onSave={editing ? onSave : undefined}
    />
  )
}
