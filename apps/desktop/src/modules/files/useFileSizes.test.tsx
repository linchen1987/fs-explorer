/** @vitest-environment happy-dom */
import type { ProjectPathSize } from "@fs-explorer/core"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useFileSizes } from "./useFileSizes"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  getProjectPathSize: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/ipc", () => ({
  ipc: { getProjectPathSize: mocks.getProjectPathSize },
}))

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}))

let state: ReturnType<typeof useFileSizes>

function Harness({ repo, revision }: { repo: string; revision: number }) {
  state = useFileSizes(repo, revision)
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Harness repo="/repo" revision={0} />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("useFileSizes", () => {
  it("不会自动统计，单个请求期间会去重并暴露加载状态", async () => {
    expect(mocks.getProjectPathSize).not.toHaveBeenCalled()
    const pending = deferred<ProjectPathSize>()
    mocks.getProjectPathSize.mockReturnValue(pending.promise)

    let first!: Promise<ProjectPathSize | null>
    let duplicate!: Promise<ProjectPathSize | null>
    act(() => {
      first = state.measurePath("src")
      duplicate = state.measurePath("src")
    })

    expect(mocks.getProjectPathSize).toHaveBeenCalledTimes(1)
    expect(mocks.getProjectPathSize).toHaveBeenCalledWith("/repo", "src")
    expect(state.isMeasuring("src")).toBe(true)
    expect(await duplicate).toBeNull()

    await act(async () => {
      pending.resolve({
        path: "src",
        kind: "directory",
        size: 4096,
        children: null,
      })
      expect(await first).toMatchObject({ path: "src", size: 4096 })
    })

    expect(state.sizes.get("src")).toBe(4096)
    expect(state.isMeasuring("src")).toBe(false)
  })

  it("目录结果同时更新总大小和一级子项，并在重算时清除消失的旧子项", async () => {
    mocks.getProjectPathSize.mockResolvedValue({
      path: "src",
      kind: "directory",
      size: 12,
      children: [
        { path: "src/old.txt", kind: "file", size: 4 },
        { path: "src/nested", kind: "directory", size: 8 },
      ],
    })
    await act(async () => { expect(await state.measurePath("src")).not.toBeNull() })
    expect(state.sizes.get("src")).toBe(12)
    expect(state.sizes.get("src/old.txt")).toBe(4)
    expect(state.sizes.get("src/nested")).toBe(8)

    mocks.getProjectPathSize.mockResolvedValueOnce({
      path: "src/nested/deep.txt",
      kind: "file",
      size: 8,
      children: null,
    })
    await act(async () => { await state.measurePath("src/nested/deep.txt") })

    mocks.getProjectPathSize.mockResolvedValueOnce({
      path: "src",
      kind: "directory",
      size: 8,
      children: [{ path: "src/nested", kind: "directory", size: 8 }],
    })
    await act(async () => { await state.measurePath("src") })

    expect(state.sizes.get("src/old.txt")).toBeUndefined()
    expect(state.sizes.get("src/nested/deep.txt")).toBe(8)
    expect(state.sizes.get("src")).toBe(8)
  })

  it("项目或文件版本变化后清除旧结果，并忽略仍在途中的旧请求", async () => {
    const pending = deferred<ProjectPathSize>()
    mocks.getProjectPathSize.mockReturnValue(pending.promise)
    let oldRequest!: Promise<ProjectPathSize | null>
    act(() => { oldRequest = state.measurePath("") })
    expect(state.isMeasuring("")).toBe(true)

    await act(async () => root.render(<Harness repo="/repo" revision={1} />))
    expect(state.isMeasuring("")).toBe(false)

    await act(async () => {
      pending.resolve({
        path: "",
        kind: "directory",
        size: 100,
        children: [{ path: "old.txt", kind: "file", size: 100 }],
      })
      expect(await oldRequest).toBeNull()
    })
    expect(state.sizes.size).toBe(0)
    expect(mocks.toastError).not.toHaveBeenCalled()

    mocks.getProjectPathSize.mockResolvedValueOnce({
      path: "new.txt",
      kind: "file",
      size: 7,
      children: null,
    })
    await act(async () => { expect(await state.measurePath("new.txt")).not.toBeNull() })
    expect(state.sizes.get("new.txt")).toBe(7)
  })

  it("失败时给出目标路径并恢复操作入口", async () => {
    mocks.getProjectPathSize.mockRejectedValue("permission denied")
    await act(async () => { expect(await state.measurePath("private")).toBeNull() })

    expect(mocks.toastError).toHaveBeenCalledWith("大小计算失败", {
      description: "private：permission denied",
    })
    expect(state.isMeasuring("private")).toBe(false)
    expect(state.sizes.size).toBe(0)
  })
})
