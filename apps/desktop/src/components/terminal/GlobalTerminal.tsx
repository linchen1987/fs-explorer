import { Suspense, lazy } from "react"
import { useTerminalStore } from "@/stores/terminal"

const TerminalPanel = lazy(() => import("@/components/terminal/TerminalPanel"))

/** 与项目工作区平级，项目切换时保留面板、输出和 shell 进程。 */
export function GlobalTerminal() {
  const session = useTerminalStore((s) => s.session)
  const visible = useTerminalStore((s) => s.visible)
  const hide = useTerminalStore((s) => s.hide)

  if (!session) return null

  return (
    <Suspense fallback={visible ? <div className="flex h-[260px] shrink-0 items-center justify-center border-t text-xs text-muted-foreground">正在加载终端…</div> : null}>
      <TerminalPanel
        repo={session.repo}
        projectName={session.projectName}
        visible={visible}
        onHide={hide}
      />
    </Suspense>
  )
}
