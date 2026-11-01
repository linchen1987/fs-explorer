import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { ZoomableImage } from "./ZoomableImage"

function serializeSvg(svg: string) {
  const template = document.createElement("template")
  template.innerHTML = svg
  const element = template.content.querySelector("svg")
  // Mermaid 的 HTML 标签可能包含 <br>；内联 HTML 可解析，独立 SVG 图片必须先转为合法 XML。
  return element ? new XMLSerializer().serializeToString(element) : svg
}

export function MermaidDiagram({ code }: { code: string }) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const renderSequence = useRef(0)
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const svgUrl = useMemo(() => {
    if (!svg) return ""
    const bytes = new TextEncoder().encode(serializeSvg(svg))
    let binary = ""
    bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
    return `data:image/svg+xml;base64,${btoa(binary)}`
  }, [svg])

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
    <ZoomableImage
      src={svgUrl}
      alt="Mermaid 图表"
      className="markdown-mermaid w-full"
      preview={(
        <span
          className="contents"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    />
  )
}
