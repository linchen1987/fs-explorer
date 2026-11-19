import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { listen } from "@tauri-apps/api/event"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import type { ITheme } from "@xterm/xterm"
import { SquareTerminal, X } from "lucide-react"
import { useTheme } from "next-themes"
import "@xterm/xterm/css/xterm.css"
import { errText } from "@/lib/async"
import { ipc } from "@/lib/ipc"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const DEFAULT_HEIGHT = 260
const MIN_HEIGHT = 160

type TerminalStatus = "connecting" | "running" | "exited" | "error"

interface TerminalOutput {
  id: string
  data: string
}

interface TerminalExit {
  id: string
  code: number | null
}

const darkTheme: ITheme = {
  background: "#111214",
  foreground: "#d7d7d7",
  cursor: "#f2f2f2",
  selectionBackground: "#264f78",
}

const lightTheme: ITheme = {
  background: "#f8f8f8",
  foreground: "#252526",
  cursor: "#252526",
  selectionBackground: "#add6ff",
}

function decodeOutput(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function clampHeight(height: number): number {
  return Math.min(Math.max(height, MIN_HEIGHT), Math.round(window.innerHeight * 0.75))
}

interface TerminalSessionProps {
  repo: string
  visible: boolean
  onStatusChange: (status: TerminalStatus) => void
  onExit: () => void
}

function TerminalSession({ repo, visible, onStatusChange, onExit }: TerminalSessionProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== "light"

  useEffect(() => {
    const terminal = terminalRef.current
    if (terminal) terminal.options.theme = dark ? darkTheme : lightTheme
  }, [dark])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let running = false
    let sessionId: string | null = null
    let fitFrame = 0
    let unlistenOutput: (() => void) | undefined
    let unlistenExit: (() => void) | undefined
    const pendingOutput: TerminalOutput[] = []
    const pendingExit: TerminalExit[] = []

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      scrollback: 3000,
      theme: dark ? darkTheme : lightTheme,
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminalRef.current = terminal
    fitRef.current = fit

    const writeExit = (event: TerminalExit) => {
      if (event.id !== sessionId || disposed) return
      running = false
      terminal.options.disableStdin = true
      const code = event.code == null ? "" : `，退出码 ${event.code}`
      terminal.writeln(`\r\n\x1b[90m[进程已退出${code}]\x1b[0m`)
      onStatusChange("exited")
      onExit()
    }

    const writeOutput = (event: TerminalOutput) => {
      if (event.id === sessionId && !disposed) {
        terminal.write(decodeOutput(event.data))
      }
    }

    const input = terminal.onData((data) => {
      if (!running || !sessionId) return
      void ipc.writeTerminal(sessionId, data).catch(() => {
        // 进程退出与最后一次输入可能竞争，exit 事件会呈现最终状态。
      })
    })
    const resize = terminal.onResize(({ cols, rows }) => {
      if (!running || !sessionId) return
      void ipc.resizeTerminal(sessionId, cols, rows).catch(() => {})
    })

    const fitTerminal = () => {
      if (disposed || host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
    }
    const scheduleFit = () => {
      cancelAnimationFrame(fitFrame)
      fitFrame = requestAnimationFrame(fitTerminal)
    }
    fitTerminal()

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(host)

    async function connect() {
      try {
        // 先注册事件并暂存早期输出，避免 shell 启动提示在 invoke 返回前丢失。
        const stopOutput = await listen<TerminalOutput>("terminal-output", ({ payload }) => {
          if (disposed) return
          if (sessionId) writeOutput(payload)
          else pendingOutput.push(payload)
        })
        if (disposed) {
          stopOutput()
          return
        }
        unlistenOutput = stopOutput

        const stopExit = await listen<TerminalExit>("terminal-exit", ({ payload }) => {
          if (disposed) return
          if (sessionId) writeExit(payload)
          else pendingExit.push(payload)
        })
        if (disposed) {
          stopExit()
          return
        }
        unlistenExit = stopExit

        fitTerminal()
        const id = await ipc.openTerminal(repo, terminal.cols, terminal.rows)
        if (disposed) {
          await ipc.closeTerminal(id).catch(() => {})
          return
        }
        sessionId = id
        running = true
        terminal.options.disableStdin = false
        onStatusChange("running")

        for (const event of pendingOutput) writeOutput(event)
        for (const event of pendingExit) writeExit(event)
        pendingOutput.length = 0
        pendingExit.length = 0
        fitTerminal()
        terminal.focus()
      } catch (error) {
        unlistenOutput?.()
        unlistenExit?.()
        unlistenOutput = undefined
        unlistenExit = undefined
        if (disposed) return
        onStatusChange("error")
        terminal.writeln(`\x1b[31m终端启动失败：${errText(error)}\x1b[0m`)
      }
    }
    void connect()

    return () => {
      disposed = true
      running = false
      cancelAnimationFrame(fitFrame)
      observer.disconnect()
      input.dispose()
      resize.dispose()
      unlistenOutput?.()
      unlistenExit?.()
      if (sessionId) void ipc.closeTerminal(sessionId).catch(() => {})
      sessionId = null
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
    // 每个 TerminalSession 绑定当前 repo；主题由单独 effect 更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, onExit, onStatusChange])

  useEffect(() => {
    if (!visible) return
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit()
      terminalRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [visible])

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[#f8f8f8] px-2 py-1 dark:bg-[#111214]">
      <div ref={hostRef} className="h-full w-full" aria-label="交互式终端" />
    </div>
  )
}

interface TerminalPanelProps {
  repo: string
  projectName: string
  visible: boolean
  onHide: () => void
}

export default function TerminalPanel({
  repo,
  projectName,
  visible,
  onHide,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [status, setStatus] = useState<TerminalStatus>("connecting")
  const [started, setStarted] = useState(visible)
  const dragRef = useRef<{ y: number; height: number } | null>(null)

  useEffect(() => {
    if (visible) setStarted(true)
  }, [visible])

  const handleExit = useCallback(() => {
    // 自然退出后关闭并重置；下次打开时创建一个全新的 shell。
    setStarted(false)
    setStatus("connecting")
    onHide()
  }, [onHide])

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    dragRef.current = { y: event.clientY, height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragRef.current
    if (!start) return
    setHeight(clampHeight(start.height + start.y - event.clientY))
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const statusText = status === "connecting"
    ? "连接中"
    : status === "running"
      ? projectName
      : status === "exited"
        ? "已退出"
        : "启动失败"

  return (
    <section
      aria-label="终端面板"
      className={cn("relative flex shrink-0 flex-col border-t bg-background", !visible && "hidden")}
      style={{ height }}
    >
      <div
        role="separator"
        aria-label="调整终端高度"
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={Math.round(window.innerHeight * 0.75)}
        aria-valuenow={height}
        tabIndex={0}
        className="absolute inset-x-0 top-0 z-10 h-1 -translate-y-1/2 cursor-row-resize touch-none focus-visible:bg-primary focus-visible:outline-none"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            setHeight((value) => clampHeight(value + (event.key === "ArrowUp" ? 20 : -20)))
          }
        }}
      />
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <SquareTerminal className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">终端</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn(
            "size-1.5 shrink-0 rounded-full bg-muted-foreground/50",
            status === "running" && "bg-emerald-500",
            status === "error" && "bg-destructive",
          )} />
          <span className="truncate">{statusText}</span>
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onHide} aria-label="隐藏终端">
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>隐藏面板，保留进程（⌘J / Ctrl+J）</TooltipContent>
          </Tooltip>
        </div>
      </header>
      {started && (
        <TerminalSession
          key={repo}
          repo={repo}
          visible={visible}
          onStatusChange={setStatus}
          onExit={handleExit}
        />
      )}
    </section>
  )
}
