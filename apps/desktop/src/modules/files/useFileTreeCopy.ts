import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { toast } from "sonner"
import { errText } from "@/lib/async"
import { ipc } from "@/lib/ipc"

const COPY_DEDUP_MS = 300
const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"])

interface UseFileTreeCopyOptions {
  repo: string
  selectedPath: string | null
}

/**
 * 文件树复制兼容层。WKWebView 的 activeElement 和原生 copy.target 都可能指向
 * Monaco 等其他区域，因此复制作用域只跟随用户的实际鼠标/键盘输入。
 */
export function useFileTreeCopy({ repo, selectedPath }: UseFileTreeCopyOptions) {
  const treeRef = useRef<HTMLDivElement>(null)
  const treeCopyActiveRef = useRef(false)
  const lastCopyRef = useRef<{ repo: string; path: string; at: number } | null>(null)

  const copyFile = useCallback((path: string) => {
    const now = Date.now()
    const lastCopy = lastCopyRef.current
    // keydown 与原生 copy 可能重复触发；不同文件的主动复制不能互相节流。
    if (lastCopy?.repo === repo && lastCopy.path === path && now - lastCopy.at < COPY_DEDUP_MS) return
    lastCopyRef.current = { repo, path, at: now }

    void ipc.copyFilesToClipboard(repo, [path]).then(() => {
      toast.success("已复制，可在 Finder 等处粘贴", { description: path })
    }).catch((error) => {
      toast.error("复制失败", { description: errText(error) })
    })
  }, [repo])

  const copyPath = useCallback((path: string) => {
    const absolutePath = `${repo.replace(/\/+$/, "")}/${path}`
    void navigator.clipboard.writeText(absolutePath).then(() => {
      toast.success("路径已复制", { description: absolutePath })
    }).catch((error) => {
      toast.error("复制路径失败", { description: errText(error) })
    })
  }, [repo])

  useEffect(() => {
    function isTreeTarget(target: EventTarget | null) {
      return target instanceof Node && Boolean(treeRef.current?.contains(target))
    }

    function updateMouseScope(event: MouseEvent) {
      treeCopyActiveRef.current = isTreeTarget(event.target)
    }

    function updateKeyboardScope(event: KeyboardEvent) {
      if (event.key === "Tab" || MODIFIER_KEYS.has(event.key)) return
      // ⌘C 可能已被原生菜单接管，不能用其事件发生时的焦点反推用户操作区域。
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") return
      treeCopyActiveRef.current = isTreeTarget(event.target)
    }

    function restoreTreeScope(event: FocusEvent) {
      // Monaco 加载文件后会自动聚焦 textarea。程序聚焦其他区域不代表用户主动切换，
      // 因此这里只恢复树内作用域，树外作用域由实际鼠标/键盘输入清除。
      if (isTreeTarget(event.target)) treeCopyActiveRef.current = true
    }

    function finishTabNavigation(event: KeyboardEvent) {
      if (event.key === "Tab") treeCopyActiveRef.current = isTreeTarget(document.activeElement)
    }

    // capture 阶段可在 Monaco 等组件停止事件传播前记录用户的实际输入区域。
    document.addEventListener("mousedown", updateMouseScope, true)
    document.addEventListener("keydown", updateKeyboardScope, true)
    document.addEventListener("focusin", restoreTreeScope, true)
    document.addEventListener("keyup", finishTabNavigation, true)
    return () => {
      document.removeEventListener("mousedown", updateMouseScope, true)
      document.removeEventListener("keydown", updateKeyboardScope, true)
      document.removeEventListener("focusin", restoreTreeScope, true)
      document.removeEventListener("keyup", finishTabNavigation, true)
    }
  }, [treeRef])

  useEffect(() => {
    function onCopy(event: ClipboardEvent) {
      // macOS 原生 Edit → Copy 可能没有 keydown，且 copy.target 不一定位于文件树。
      if (!selectedPath || !treeCopyActiveRef.current) return
      event.preventDefault()
      copyFile(selectedPath)
    }
    document.addEventListener("copy", onCopy)
    return () => document.removeEventListener("copy", onCopy)
  }, [selectedPath, copyFile, treeRef])

  const handleTreeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "c") return
    if (!selectedPath) return
    const target = event.target as HTMLElement | null
    if (!target || target === event.currentTarget) return
    if (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return
    }
    // 非 macOS 平台没有原生菜单拦截，keydown 里直接处理；
    // macOS 上若 copy 事件也触发，由 copyFile 对同一文件去重。
    event.preventDefault()
    if (event.altKey) copyPath(selectedPath)
    else copyFile(selectedPath)
  }, [selectedPath, copyFile, copyPath])

  return { treeRef, copyFile, copyPath, handleTreeKeyDown }
}
