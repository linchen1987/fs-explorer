import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import type { ProjectFileContent } from "@fs-explorer/core"
import { FileWarning } from "lucide-react"
import { CenterHint } from "@/components/CenterHint"

const CodeEditor = lazy(() =>
  import("./CodeEditor").then((module) => ({ default: module.CodeEditor })),
)
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

function EditorLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      正在加载编辑器…
    </div>
  )
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

interface TextFileContentProps {
  repo: string
  file: ProjectFileContent
  text: string
  readOnly: boolean
  mode: FileViewMode
  onChange?: (value: string) => void
  onOpenFile: (path: string) => void
}

function TextFileContent({
  repo,
  file,
  text,
  readOnly,
  mode,
  onChange,
  onOpenFile,
}: TextFileContentProps) {
  const markdown = isMarkdown(file.path)
  const svg = isSvg(file.path)
  const showPreview = mode === "preview" && (markdown || svg)
  const [keepEditorMounted, setKeepEditorMounted] = useState(!showPreview)

  // 默认 Markdown 预览不加载 Monaco；进入过一次源码后保留撤销栈和视图状态。
  useEffect(() => {
    if (!showPreview) setKeepEditorMounted(true)
  }, [showPreview])

  const mountEditor = keepEditorMounted || !showPreview
  return (
    <div className="h-full min-h-0">
      {mountEditor && (
        <div className={showPreview ? "hidden" : "h-full min-h-0"}>
          <Suspense fallback={<EditorLoading />}>
            <CodeEditor
              path={file.path}
              value={text}
              readOnly={readOnly}
              onChange={onChange}
            />
          </Suspense>
        </div>
      )}
      {showPreview && markdown && (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载预览…</div>}>
          <MarkdownPreview repo={repo} path={file.path} text={text} onOpenFile={onOpenFile} />
        </Suspense>
      )}
      {showPreview && svg && <SvgPreview text={text} />}
    </div>
  )
}

interface FileContentViewProps {
  repo: string
  file: ProjectFileContent
  text: string
  readOnly?: boolean
  mode: FileViewMode
  onChange?: (value: string) => void
  onOpenFile?: (path: string) => void
}

export function FileContentView({
  repo,
  file,
  text,
  readOnly = false,
  mode,
  onChange,
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

  return (
    <TextFileContent
      key={`${repo}:${file.path}`}
      repo={repo}
      file={file}
      text={text}
      readOnly={readOnly}
      mode={mode}
      onChange={onChange}
      onOpenFile={onOpenFile}
    />
  )
}
