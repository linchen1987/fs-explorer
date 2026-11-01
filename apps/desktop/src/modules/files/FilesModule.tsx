import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { errText, useAsync } from "@/lib/async"
import { emitRefresh, useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { useProjectStatus } from "@/stores/projects"
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

type PendingAction = { type: "select"; path: string } | { type: "cancel-edit" }

export function FilesModule({ project, active }: ModuleProps) {
  const repo = project.path
  const [filesRevision, setFilesRevision] = useState(0)
  const status = useProjectStatus(repo)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<FileViewMode>("code")
  const [original, setOriginal] = useState("")
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
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

  function activateSelection(path: string) {
    setSelectedPath(path)
    setEditing(false)
    setDraft(null)
    setOriginal("")
    setMode(isMarkdown(path) || isSvg(path) ? "preview" : "code")
  }

  function selectFile(path: string) {
    if (path === selectedPath || saving) return
    if (dirty) setPending({ type: "select", path })
    else activateSelection(path)
  }

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
