import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { errText } from "@/lib/async"
import { ipc } from "@/lib/ipc"

function isImmediateChild(candidate: string, parent: string) {
  const prefix = parent ? `${parent}/` : ""
  return candidate.startsWith(prefix)
    && candidate.length > prefix.length
    && !candidate.slice(prefix.length).includes("/")
}

/** 仅在用户主动操作时统计大小，并在项目或文件版本变化后丢弃旧结果。 */
export function useFileSizes(repo: string, revision: number) {
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(new Map())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const generation = useRef(0)
  const requests = useRef(new Map<string, symbol>())

  useEffect(() => {
    generation.current += 1
    requests.current.clear()
    setSizes(new Map())
    setPending(new Set())

    return () => {
      generation.current += 1
      requests.current.clear()
    }
  }, [repo, revision])

  const measurePath = useCallback(async (path: string) => {
    if (requests.current.has(path)) return null

    const currentGeneration = generation.current
    const token = Symbol(path)
    requests.current.set(path, token)
    setPending((current) => new Set(current).add(path))

    try {
      const result = await ipc.getProjectPathSize(repo, path)
      if (generation.current !== currentGeneration) return null

      setSizes((current) => {
        const next = new Map(current)
        if (result.children) {
          // 重新计算目录时移除已经消失的一级子项，但保留更深层级已计算的结果。
          for (const candidate of next.keys()) {
            if (candidate !== path && isImmediateChild(candidate, path)) next.delete(candidate)
          }
        }
        next.set(result.path, result.size)
        for (const child of result.children ?? []) next.set(child.path, child.size)
        return next
      })
      return result
    } catch (error) {
      if (generation.current === currentGeneration) {
        toast.error("大小计算失败", {
          description: `${path || "项目根目录"}：${errText(error)}`,
        })
      }
      return null
    } finally {
      if (requests.current.get(path) === token) {
        requests.current.delete(path)
        if (generation.current === currentGeneration) {
          setPending((current) => {
            const next = new Set(current)
            next.delete(path)
            return next
          })
        }
      }
    }
  }, [repo])

  const isMeasuring = useCallback((path: string) => pending.has(path), [pending])

  return { sizes, measurePath, isMeasuring }
}
