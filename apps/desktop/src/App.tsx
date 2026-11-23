import { useEffect } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Sidebar } from "@/components/layout/Sidebar"
import { MainArea } from "@/components/layout/MainArea"
import { GlobalTerminal } from "@/components/terminal/GlobalTerminal"
import { useProjectsStore } from "@/stores/projects"

export default function App() {
  const init = useProjectsStore((s) => s.init)
  const initialized = useProjectsStore((s) => s.initialized)

  useEffect(() => {
    init().catch(() => {
      // list_projects 失败极少见（配置目录不可写），错误通过空列表体现
    })
  }, [init])

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        正在加载…
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <ResizablePanelGroup orientation="horizontal" className="h-screen">
        {/* v4：数字表示像素；百分比必须使用字符串，如 "19%"。 */}
        <ResizablePanel defaultSize="20%" minSize="15%" maxSize="32%" className="min-w-0">
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle className="bg-sidebar-border" />
        <ResizablePanel defaultSize="80%" className="min-w-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <MainArea />
            </div>
            <GlobalTerminal />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  )
}
