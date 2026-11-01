import { useEffect, useId, useRef, useState } from "react"
import { useTheme } from "next-themes"

export function MermaidDiagram({ code }: { code: string }) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const renderSequence = useRef(0)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    const renderId = `markdown-mermaid-${baseId}-${++renderSequence.current}`
    setSvg("")
    setError("")

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import("mermaid")
        if (!active) return
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: dark ? "dark" : "neutral",
        })
        const result = await mermaid.render(renderId, code)
        if (active) setSvg(result.svg)
      } catch (reason) {
        if (!active) return
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(message || "未知渲染错误")
      }
    }

    void renderDiagram()
    return () => { active = false }
  }, [baseId, code, dark])

  if (error) {
    return (
      <div className="markdown-mermaid markdown-mermaid-error" role="alert">
        <strong>Mermaid 图表渲染失败</strong>
        <span>{error}</span>
      </div>
    )
  }
  if (!svg) {
    return (
      <div className="markdown-mermaid markdown-mermaid-message" role="status">
        正在渲染 Mermaid 图表…
      </div>
    )
  }
  return (
    <div
      className="markdown-mermaid"
      aria-label="Mermaid 图表"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
