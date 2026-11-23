import { FileWarning, GitMerge } from "lucide-react"
import { useAsync } from "@/lib/async"
import { useRefreshListener } from "@/lib/events"
import { ipc } from "@/lib/ipc"
import { CenterHint } from "@/components/CenterHint"
import { FilePath, StatusBadge } from "@/components/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FileContentView } from "@/modules/files/FileContentView"

/** 冲突时不解析 combined diff，直接展示工作区中带有冲突标记的文件内容。 */
export function ConflictFileView({ repo, path }: { repo: string; path: string }) {
  const content = useAsync(() => ipc.readProjectFile(repo, path), [repo, path])
  useRefreshListener(content.reload)

  const file = content.data?.path === path ? content.data : null
  if (!file) {
    if (content.loading) {
      return (
        <div className="flex h-full flex-col gap-3 p-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )
    }
    return (
      <CenterHint
        icon={FileWarning}
        title="无法读取冲突文件"
        desc={content.error ?? "文件不可用，请刷新后重试。"}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <GitMerge className="size-4 shrink-0 text-destructive" />
        <FilePath path={path} className="min-w-0 flex-1 truncate font-mono text-xs" />
        <Badge variant="destructive" className="px-1.5 font-normal">
          <StatusBadge status="U" className="w-3" />
          合并冲突
        </Badge>
      </div>
      <div className="shrink-0 border-b bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
        当前显示工作区中的冲突内容。在“文件”模块中编辑并移除冲突标记后，回到此处暂存即可标记为已解决。
      </div>
      <div className="min-h-0 flex-1">
        <FileContentView
          repo={repo}
          file={file}
          text={file.text ?? ""}
          readOnly
          mode="code"
        />
      </div>
    </div>
  )
}
