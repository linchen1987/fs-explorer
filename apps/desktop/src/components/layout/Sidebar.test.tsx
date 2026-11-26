/** @vitest-environment happy-dom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Project } from "@fs-explorer/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useProjectsStore } from "@/stores/projects"
import { Sidebar } from "./Sidebar"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  renameProject: vi.fn(),
  reorderProjects: vi.fn(),
}))

vi.mock("@/lib/ipc", () => ({
  ipc: {
    renameProject: mocks.renameProject,
    reorderProjects: mocks.reorderProjects,
  },
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))
vi.mock("@/components/mode-toggle", () => ({ ModeToggle: () => null }))

function project(name: string): Project {
  return {
    path: `/repos/${name}`,
    name,
    addedAt: "2026-01-01T00:00:00Z",
    isGitRepo: true,
  }
}

const projects = [project("first"), project("second"), project("third")]
let container: HTMLDivElement
let root: Root | undefined

function rect(top: number, height = 56): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 240,
    bottom: top + height,
    width: 240,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function item(path: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-project-path="${path}"]`)
  expect(element, `缺少项目节点：${path}`).not.toBeNull()
  return element!
}

async function key(target: HTMLElement, code: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: code === "Space" ? " " : code,
      code,
      bubbles: true,
      cancelable: true,
    }))
  })
}

async function pointer(target: HTMLElement, type: string, clientY: number) {
  await act(async () => {
    target.dispatchEvent(new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY,
      bubbles: true,
      cancelable: true,
    }))
  })
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", {
      button: 0,
      bubbles: true,
      cancelable: true,
    }))
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.reorderProjects.mockResolvedValue(undefined)
  useProjectsStore.setState({
    projects,
    selectedPath: projects[0].path,
    statuses: {},
    statusLoading: {},
    gitVersion: null,
    gitVersionError: null,
  })

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const path = this.getAttribute("data-project-path")
    const index = projects.findIndex((project) => project.path === path)
    return index >= 0 ? rect(index * 60) : rect(0, 600)
  })

  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(
    <TooltipProvider>
      <Sidebar />
    </TooltipProvider>,
  ))
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  container.remove()
  vi.restoreAllMocks()
})

describe("Sidebar 项目排序", () => {
  it("支持用鼠标拖拽项目并保存新顺序", async () => {
    const first = item(projects[0].path)

    await pointer(first, "pointerdown", 20)
    await pointer(first, "pointermove", 30)
    await pointer(first, "pointermove", 85)
    await pointer(first, "pointerup", 85)

    expect(mocks.reorderProjects).toHaveBeenCalledWith([
      projects[1].path,
      projects[0].path,
      projects[2].path,
    ])
    expect(useProjectsStore.getState().projects.map((project) => project.name))
      .toEqual(["second", "first", "third"])
  })

  it("支持用键盘移动项目并保存新顺序", async () => {
    const first = item(projects[0].path)
    act(() => first.focus())

    await key(first, "Space")
    // KeyboardSensor 在开始拖拽后的下一个任务中注册移动与结束监听。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await key(first, "ArrowDown")
    await key(first, "Space")

    expect(mocks.reorderProjects).toHaveBeenCalledWith([
      projects[1].path,
      projects[0].path,
      projects[2].path,
    ])
    expect(useProjectsStore.getState().projects.map((project) => project.name))
      .toEqual(["second", "first", "third"])
  })
})

describe("Sidebar 项目重命名", () => {
  it("从项目菜单修改显示名并保存", async () => {
    mocks.renameProject.mockImplementation(async (_path: string, name: string) => ({
      ...projects[0],
      name,
    }))
    const trigger = item(projects[0].path).querySelector("button")!

    await pointer(trigger, "pointerdown", 20)
    await pointer(trigger, "pointerup", 20)
    const renameItem = Array.from(document.body.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-item"]',
    )).find((element) => element.textContent?.includes("重命名"))
    expect(renameItem, "缺少重命名菜单项").toBeDefined()
    await click(renameItem!)

    const input = document.body.querySelector<HTMLInputElement>("#project-name")
    expect(input, "缺少项目名称输入框").not.toBeNull()
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
      setValue.call(input, "  客户端前端  ")
      input!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      input!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(mocks.renameProject).toHaveBeenCalledWith(projects[0].path, "客户端前端")
    expect(useProjectsStore.getState().projects.map((project) => project.name))
      .toEqual(["客户端前端", "second", "third"])
    expect(useProjectsStore.getState().selectedPath).toBe(projects[0].path)
  })
})
