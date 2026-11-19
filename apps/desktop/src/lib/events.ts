import { useEffect, useRef } from "react"

/** 全局刷新事件：主区域头部刷新按钮触发，各模块监听后重新拉取数据 */
export const REFRESH_EVENT = "fs-explorer:refresh"

export function emitRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useRefreshListener(callback: () => void) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener(REFRESH_EVENT, handler)
    return () => window.removeEventListener(REFRESH_EVENT, handler)
  }, [])
}
