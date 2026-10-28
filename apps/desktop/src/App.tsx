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
        <ResizablePanel defaultSize={19} minSize={14} maxSize={32} className="min-w-0 border-r">
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={81} className="min-w-0">
          <MainArea />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  )
}
