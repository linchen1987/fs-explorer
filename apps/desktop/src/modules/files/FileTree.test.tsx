/** @vitest-environment happy-dom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FileTree } from "./FileTree"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  listProjectDirectory: vi.fn(),
  searchProjectFiles: vi.fn(),
  getProjectPathSize: vi.fn(),
  deleteProjectPath: vi.fn(),
  copyFilesToClipboard: vi.fn(),
  confirm: vi.fn(),
  onSelect: vi.fn(),
  onRefresh: vi.fn(),
  onPathDeleted: vi.fn(),
}))

vi.mock("@/lib/ipc", () => ({
  ipc: {
    listProjectDirectory: mocks.listProjectDirectory,
    searchProjectFiles: mocks.searchProjectFiles,
    getProjectPathSize: mocks.getProjectPathSize,
    deleteProjectPath: mocks.deleteProjectPath,
    copyFilesToClipboard: mocks.copyFilesToClipboard,
  },
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: mocks.confirm,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

let container: HTMLDivElement
let root: Root

function row(path: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[title="${path}"]`)
  if (!button) throw new Error(`找不到文件行: ${path}`)
  return button
}

function menuItem(label: string) {
  const item = Array.from(document.body.querySelectorAll<HTMLElement>("[role='menuitem']"))
    .find((candidate) => candidate.textContent?.includes(label))
  if (!item) throw new Error(`找不到菜单项: ${label}`)
  return item
}

async function openContextMenu(path: string) {
  await act(async () => {
    row(path).dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    }))
  })
}

async function click(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.listProjectDirectory.mockImplementation((_repo: string, parent: string) => Promise.resolve(
    parent === "src"
      ? {
          nodes: [
            { name: "nested", path: "src/nested", kind: "directory" },
            { name: "main.ts", path: "src/main.ts", kind: "file" },
          ],
          total: 2,
        }
      : {
          nodes: [
            { name: "src", path: "src", kind: "directory" },
            { name: "README.md", path: "README.md", kind: "file" },
          ],
          total: 2,
        },
  ))
  mocks.searchProjectFiles.mockResolvedValue({ paths: [], total: 0 })
  mocks.deleteProjectPath.mockResolvedValue(undefined)
  mocks.copyFilesToClipboard.mockResolvedValue(undefined)
  mocks.confirm.mockResolvedValue(true)

  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(
    <FileTree
      repo="/repo"
      revision={0}
      selectedPath={null}
      conflictedPaths={new Set()}
      onSelect={mocks.onSelect}
      onRefresh={mocks.onRefresh}
      onPathDeleted={mocks.onPathDeleted}
    />,
  ))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  document.body.querySelectorAll("[data-slot='context-menu-content']").forEach((node) => node.remove())
})

describe("FileTree 层级对齐", () => {
  it("同层目录和文件使用相同缩进及单个前导图标", () => {
    const directoryRow = row("src")
    const fileRow = row("README.md")

    expect(directoryRow.style.paddingLeft).toBe(fileRow.style.paddingLeft)
    expect(directoryRow.querySelectorAll("svg")).toHaveLength(1)
    expect(fileRow.querySelectorAll("svg")).toHaveLength(1)
    expect(directoryRow.querySelector(".lucide-chevron-right")).not.toBeNull()
    expect(directoryRow.querySelector(".lucide-folder, .lucide-folder-open")).toBeNull()
  })
})

describe("FileTree 按需大小统计", () => {
  it("从文件右键菜单计算并显示大小，打开目录时不自动统计", async () => {
    expect(mocks.getProjectPathSize).not.toHaveBeenCalled()
    mocks.getProjectPathSize.mockResolvedValue({
      path: "README.md",
      kind: "file",
      size: 1536,
      children: null,
    })

    await openContextMenu("README.md")
    await click(menuItem("查看大小"))

    expect(mocks.getProjectPathSize).toHaveBeenCalledWith("/repo", "README.md")
    expect(row("README.md").textContent).toContain("1.5 KB")

    await click(row("src"))
    expect(mocks.listProjectDirectory).toHaveBeenCalledWith("/repo", "src", 200)
    expect(mocks.getProjectPathSize).toHaveBeenCalledTimes(1)
  })

  it("查看目录大小会同时展开并展示一级子项", async () => {
    mocks.getProjectPathSize.mockResolvedValue({
      path: "src",
      kind: "directory",
      size: 4096,
      children: [
        { path: "src/nested", kind: "directory", size: 3072 },
        { path: "src/main.ts", kind: "file", size: 1024 },
      ],
    })

    await openContextMenu("src")
    await click(menuItem("查看大小"))

    expect(mocks.getProjectPathSize).toHaveBeenCalledWith("/repo", "src")
    expect(row("src").textContent).toContain("4.0 KB")
    expect(row("src/nested").textContent).toContain("3.0 KB")
    expect(row("src/main.ts").textContent).toContain("1.0 KB")
  })

  it("项目入口一次显示项目总大小和一级子项大小", async () => {
    mocks.getProjectPathSize.mockResolvedValue({
      path: "",
      kind: "directory",
      size: 2 * 1024 ** 3,
      children: [
        { path: "src", kind: "directory", size: 1024 ** 3 },
        { path: "README.md", kind: "file", size: 1024 ** 3 },
      ],
    })
    const trigger = container.querySelector("button[aria-label='查看项目及一级子项大小']")!

    await click(trigger)

    expect(mocks.getProjectPathSize).toHaveBeenCalledWith("/repo", "")
    expect(container.textContent).toContain("2.0 GB")
    expect(row("src").textContent).toContain("1.0 GB")
    expect(row("README.md").textContent).toContain("1.0 GB")
  })

  it("目录可以复制到系统剪贴板，并提供目录删除操作", async () => {
    await openContextMenu("src")
    expect(document.body.textContent).toContain("复制目录")
    expect(document.body.textContent).toContain("删除目录")
    expect(document.body.textContent).not.toContain("删除文件")
    await click(menuItem("复制目录"))

    expect(mocks.copyFilesToClipboard).toHaveBeenCalledWith("/repo", ["src"])
  })

  it("文件经确认后删除，并通知父组件清理查看状态", async () => {
    await openContextMenu("README.md")
    await click(menuItem("删除文件"))

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining("README.md"),
      expect.objectContaining({ kind: "warning", okLabel: "永久删除" }),
    )
    expect(mocks.deleteProjectPath).toHaveBeenCalledWith("/repo", "README.md")
    expect(mocks.onPathDeleted).toHaveBeenCalledWith("README.md", "file")
  })

  it("目录经明确提示全部内容后递归删除，并通知父组件", async () => {
    await openContextMenu("src")
    await click(menuItem("删除目录"))

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining("全部内容"),
      expect.objectContaining({ title: "删除目录？", kind: "warning", okLabel: "永久删除" }),
    )
    expect(mocks.deleteProjectPath).toHaveBeenCalledWith("/repo", "src")
    expect(mocks.onPathDeleted).toHaveBeenCalledWith("src", "directory")
  })

  it("取消确认不会删除文件", async () => {
    mocks.confirm.mockResolvedValue(false)
    await openContextMenu("README.md")
    await click(menuItem("删除文件"))

    expect(mocks.deleteProjectPath).not.toHaveBeenCalled()
    expect(mocks.onPathDeleted).not.toHaveBeenCalled()
  })
})
