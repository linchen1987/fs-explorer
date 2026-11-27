import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { confirm } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { errText, useAsync } from "@/lib/async"
import { emitRefresh, useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { useProjectStatus } from "@/stores/projects"
import { useFileNavigationStore } from "@/stores/file-navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { ModuleProps } from "@/modules/registry"
import { FileTree } from "./FileTree"
import { isMarkdown, isSvg, type FileViewMode } from "./FileContentView"
import { FileViewer } from "./FileViewer"
import { EMPTY_FILE_HISTORY, moveFileHistory, pushFileHistory, removeDeletedPath } from "./file-history"

type PendingAction =
  | { type: "select"; path: string }
  | { type: "history"; index: number }

export function FilesModule({ project, active }: ModuleProps) {
  const repo = project.path
  const [filesRevision, setFilesRevision] = useState(0)
  const status = useProjectStatus(repo)
  const [history, setHistory] = useState(EMPTY_FILE_HISTORY)
  const selectedPath = history.paths[history.index] ?? null
  const [mode, setMode] = useState<FileViewMode>("code")
  const [original, setOriginal] = useState("")
  const [draft, setDraft] = useState<string | null>(null)
  const [savedTextSize, setSavedTextSize] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const closePromptOpenRef = useRef(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const openFileRequest = useFileNavigationStore((s) => s.request)
  const consumeOpenFileRequest = useFileNavigationStore((s) => s.consume)
  const conflictedPaths = useMemo(
    () => new Set(
      status.data?.entries.filter((entry) => entry.conflicted).map((entry) => entry.path) ?? [],
    ),
    [status.data],
  )

  const requestKey = selectedPath ? `${repo}:${selectedPath}` : null
  const content = useAsync(
    () => selectedPath && requestKey
      ? ipc.readProjectFile(repo, selectedPath).then((file) => ({ key: requestKey, file }))
      : Promise.resolve(null),
    [repo, selectedPath],
  )
  const file = content.data?.key === requestKey ? content.data.file : null
  const displayFile = useMemo(
    () => file?.kind === "text" && savedTextSize !== null ? { ...file, size: savedTextSize } : file,
    [file, savedTextSize],
  )

  useEffect(() => {
    if (file?.kind === "text") {
      const text = file.text ?? ""
      setOriginal(text)
      setDraft(text)
      setSavedTextSize(file.size)
    } else {
      setOriginal("")
      setDraft(null)
      setSavedTextSize(null)
    }
    savingRef.current = false
    setSaving(false)
  }, [file])

  const dirty = useMemo(
    () => file?.kind === "text" && draft !== null && draft !== original,
    [file?.kind, draft, original],
  )
  dirtyRef.current = dirty

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | undefined

    void appWindow.onCloseRequested(async (event) => {
      if (closePromptOpenRef.current) {
        event.preventDefault()
        return
      }
      if (!dirtyRef.current) return

      event.preventDefault()
      closePromptOpenRef.current = true
      try {
        const confirmed = await confirm(
          "当前文件有尚未保存的修改，关闭应用后这些修改将无法恢复。",
          {
            title: "关闭应用？",
            kind: "warning",
            okLabel: "关闭应用",
            cancelLabel: "取消",
          },
        )
        if (confirmed) await appWindow.destroy()
      } catch (error) {
        toast.error("关闭应用失败", { description: errText(error) })
      } finally {
        closePromptOpenRef.current = false
      }
    }).then((stopListening) => {
      if (disposed) stopListening()
      else unlisten = stopListening
    }).catch((error) => {
      if (!disposed) toast.error("无法启用未保存关闭保护", { description: errText(error) })
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useRefreshListener(() => {
    if (!active) return
    setFilesRevision((current) => current + 1)
    status.reload()
    // 刷新不能覆盖尚未保存的内容；文件列表仍可正常更新。
    if (!dirty) content.reload()
  })

  function handlePathDeleted(path: string, kind: "file" | "directory") {
    setHistory((current) => removeDeletedPath(current, path, kind))
    emitRefresh()
  }

  function resetViewer(path: string) {
    setDraft(null)
    setOriginal("")
    setMode(isMarkdown(path) || isSvg(path) ? "preview" : "code")
  }

  function activateSelection(path: string) {
    setHistory((current) => pushFileHistory(current, path))
    resetViewer(path)
  }

  function activateHistory(index: number) {
    const path = history.paths[index]
    if (!path) return
    setHistory((current) => moveFileHistory(current, index - current.index))
    resetViewer(path)
  }

  function selectFile(path: string) {
    if (!path || path === selectedPath || saving) return
    if (dirty) setPending({ type: "select", path })
    else activateSelection(path)
  }

  function goHistory(offset: number) {
    const index = history.index + offset
    if (!history.paths[index] || saving) return
    if (dirty) setPending({ type: "history", index })
    else activateHistory(index)
  }

  useEffect(() => {
    if (!active || saving || openFileRequest?.repo !== repo) return
    selectFile(openFileRequest.path)
    consumeOpenFileRequest(openFileRequest.id)
  }, [active, consumeOpenFileRequest, dirty, openFileRequest, repo, saving, selectedPath])

  function discardAndContinue() {
    const action = pending
    setPending(null)
    if (!action) return
    if (action.type === "select") activateSelection(action.path)
    else activateHistory(action.index)
  }

  const save = useCallback(async () => {
    if (!file || file.kind !== "text" || !dirty || draft === null || savingRef.current) return
    const path = file.path
    const contentToSave = draft
    savingRef.current = true
    setSaving(true)
    try {
      await ipc.saveProjectFile(repo, path, contentToSave)
      // 不回读覆盖编辑器：保存期间产生的新输入仍保留为未保存草稿。
      setOriginal(contentToSave)
      setSavedTextSize(new TextEncoder().encode(contentToSave).byteLength)
      emitRefresh()
    } catch (error) {
      toast.error("保存失败", { description: errText(error) })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [dirty, draft, file, repo])

  useEffect(() => {
    if (!active || file?.kind !== "text") return
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "s"
        || event.altKey
        || event.shiftKey
        || (!event.metaKey && !event.ctrlKey)
      ) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) void save()
    }
    // 在编辑器内外（包括 Markdown 预览）都使用同一保存入口。
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [active, file?.kind, save])

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="26%" minSize="18%" maxSize="45%" className="bg-panel">
          <FileTree
            repo={repo}
            revision={filesRevision}
            selectedPath={selectedPath}
            conflictedPaths={conflictedPaths}
            onSelect={selectFile}
            onRefresh={() => setFilesRevision((current) => current + 1)}
            onPathDeleted={handlePathDeleted}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="74%">
          <FileViewer
            repo={repo}
            selectedPath={selectedPath}
            conflicted={selectedPath ? conflictedPaths.has(selectedPath) : false}
            file={displayFile}
            loading={content.loading}
            error={content.error}
            text={draft ?? original}
            dirty={dirty}
            saving={saving}
            mode={mode}
            onModeChange={setMode}
            onChange={setDraft}
            onOpenFile={selectFile}
            canGoBack={history.index > 0}
            canGoForward={history.index < history.paths.length - 1}
            onBack={() => goHistory(-1)}
            onForward={() => goHistory(1)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              「{selectedPath?.split("/").pop()}」有尚未保存的内容，继续后这些修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardAndContinue}>
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
