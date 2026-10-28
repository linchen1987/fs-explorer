import { useCallback, useEffect, useRef, useState } from "react"

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export function errText(e: unknown): string {
  if (typeof e === "string") return e
  if (e instanceof Error) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/**
 * 带竞态保护的数据获取 hook。
 * deps 变化或调用 reload() 时重新请求；组件卸载/依赖变更后到达的旧响应会被丢弃。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  })
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ data: s.data, error: null, loading: true }))
    fnRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      },
      (error) => {
        if (!cancelled)
          setState({ data: null, error: errText(error), loading: false })
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
