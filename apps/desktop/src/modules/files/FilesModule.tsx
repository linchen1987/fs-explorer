import { useEffect, useMemo, useState } from "react"
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
import { EMPTY_FILE_HISTORY, moveFileHistory, pushFileHistory } from "./file-history"

type PendingAction =
  | { type: "select"; path: string }
  | { type: "history"; index: number }
  | { type: "cancel-edit" }

export function FilesModule({ project, active }: ModuleProps) {
  const repo = project.path
  const [filesRevision, setFilesRevision] = useState(0)
  const status = useProjectStatus(repo)
  const [history, setHistory] = useState(EMPTY_FILE_HISTORY)
  const selectedPath = history.paths[history.index] ?? null
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<FileViewMode>("code")
  const [original, setOriginal] = useState("")
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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

  useEffect(() => {
    if (file?.kind === "text") {
      const text = file.text ?? ""
      setOriginal(text)
      setDraft(text)
    } else {
      setOriginal("")
      setDraft(null)
    }
    setSaving(false)
  }, [file])

  const dirty = useMemo(
    () => editing && file?.kind === "text" && draft !== null && draft !== original,
    [editing, file?.kind, draft, original],
  )

  useRefreshListener(() => {
    if (!active) return
    setFilesRevision((current) => current + 1)
    status.reload()
    // 刷新不能覆盖正在编辑的内容；文件列表仍可正常更新。
    if (!dirty) content.reload()
  })

  function resetViewer(path: string) {
    setEditing(false)
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

  function cancelEditing() {
    if (dirty) {
      setPending({ type: "cancel-edit" })
      return
    }
    setEditing(false)
    setDraft(original)
  }

  function discardAndContinue() {
    const action = pending
    setPending(null)
    if (!action) return
    if (action.type === "select") activateSelection(action.path)
    else if (action.type === "history") activateHistory(action.index)
    else {
      setEditing(false)
      setDraft(original)
    }
  }

  async function save() {
    if (!file || file.kind !== "text" || !editing || !dirty || draft === null || saving) return
    setSaving(true)
    try {
      await ipc.saveProjectFile(repo, file.path, draft)
      setOriginal(draft)
      toast.success("文件已保存", { description: file.path })
      content.reload()
      emitRefresh()
    } catch (error) {
      toast.error("保存失败", { description: errText(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="26%" minSize="18%" maxSize="45%">
          <FileTree
            repo={repo}
            revision={filesRevision}
            selectedPath={selectedPath}
            conflictedPaths={conflictedPaths}
            onSelect={selectFile}
            onRefresh={() => setFilesRevision((current) => current + 1)}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="74%">
          <FileViewer
            repo={repo}
            selectedPath={selectedPath}
            conflicted={selectedPath ? conflictedPaths.has(selectedPath) : false}
            file={file}
            loading={content.loading}
            error={content.error}
            text={editing ? (draft ?? original) : original}
            editing={editing}
            dirty={dirty}
            saving={saving}
            mode={mode}
            onModeChange={setMode}
            onEdit={() => {
              setDraft(original)
              setMode("code")
              setEditing(true)
            }}
            onCancel={cancelEditing}
            onSave={() => void save()}
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
