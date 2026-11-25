/** @vitest-environment happy-dom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useFileTreeCopy } from "./useFileTreeCopy"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ copyFilesToClipboard: vi.fn() }))

vi.mock("@/lib/ipc", () => ({
  ipc: { copyFilesToClipboard: mocks.copyFilesToClipboard },
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function CopyHarness() {
  const { treeRef } = useFileTreeCopy({ repo: "/repo", selectedPath: "README.md" })
  return (
    <div ref={treeRef}>
      <button type="button">README.md</button>
    </div>
  )
}

let container: HTMLDivElement
let preview: HTMLParagraphElement
let editor: HTMLTextAreaElement
let search: HTMLInputElement
let root: Root | undefined

function fileRow() {
  return container.querySelector("button")!
}

function mouseDown(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }))
  })
}

function nativeCopy(target: EventTarget) {
  const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.copyFilesToClipboard.mockResolvedValue(undefined)

  container = document.createElement("div")
  preview = document.createElement("p")
  preview.textContent = "Markdown 预览文字"
  editor = document.createElement("textarea")
  editor.value = "Monaco 编辑文字"
  search = document.createElement("input")
  document.body.append(container, preview, editor, search)

  root = createRoot(container)
  await act(async () => root!.render(<CopyHarness />))
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  container.remove()
  preview.remove()
  editor.remove()
  search.remove()
  window.getSelection()?.removeAllRanges()
})

describe("useFileTreeCopy 原生复制作用域", () => {
  it("点击文件后兼容 body 目标，并对重复原生事件去重", () => {
    mouseDown(fileRow())

    const event = nativeCopy(document.body)
    nativeCopy(document.body)

    expect(event.defaultPrevented).toBe(true)
    expect(mocks.copyFilesToClipboard).toHaveBeenCalledTimes(1)
    expect(mocks.copyFilesToClipboard).toHaveBeenCalledWith("/repo", ["README.md"])
  })

  it("键盘聚焦文件行后同样支持原生 copy", () => {
    act(() => fileRow().focus())

    const event = nativeCopy(document.body)

    expect(event.defaultPrevented).toBe(true)
    expect(mocks.copyFilesToClipboard).toHaveBeenCalledWith("/repo", ["README.md"])
  })

  it("文件加载导致 Monaco 自动聚焦时不抢走文件复制上下文", () => {
    mouseDown(fileRow())
    act(() => editor.focus())

    const event = nativeCopy(editor)

    expect(event.defaultPrevented).toBe(true)
    expect(mocks.copyFilesToClipboard).toHaveBeenCalledWith("/repo", ["README.md"])
  })

  it("Monaco 自动聚焦后，键盘选择文字会切换到文本复制", () => {
    mouseDown(fileRow())
    act(() => editor.focus())
    act(() => {
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }))
    })

    const event = nativeCopy(editor)

    expect(event.defaultPrevented).toBe(false)
    expect(mocks.copyFilesToClipboard).not.toHaveBeenCalled()
  })

  it("点击预览后不再拦截 copy，重新回到文件行后恢复文件复制", () => {
    mouseDown(fileRow())
    mouseDown(preview)

    const previewEvent = nativeCopy(document.body)
    expect(previewEvent.defaultPrevented).toBe(false)
    expect(mocks.copyFilesToClipboard).not.toHaveBeenCalled()

    // 模拟点击文件行后仍残留的外部文本选区：操作焦点应优先于旧选区。
    const range = document.createRange()
    range.selectNodeContents(preview)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    mouseDown(fileRow())
    const fileEvent = nativeCopy(document.body)
    expect(fileEvent.defaultPrevented).toBe(true)
    expect(mocks.copyFilesToClipboard).toHaveBeenCalledWith("/repo", ["README.md"])
  })

  it("点击 Monaco 输入目标或文件搜索框后保留原生文本复制", () => {
    mouseDown(fileRow())
    mouseDown(editor)

    const editorEvent = nativeCopy(editor)
    expect(editorEvent.defaultPrevented).toBe(false)
    expect(mocks.copyFilesToClipboard).not.toHaveBeenCalled()

    mouseDown(fileRow())
    mouseDown(search)

    const searchEvent = nativeCopy(search)
    expect(searchEvent.defaultPrevented).toBe(false)
    expect(mocks.copyFilesToClipboard).not.toHaveBeenCalled()
  })
})
