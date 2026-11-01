import { isValidElement, useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ipc } from "@/lib/ipc"
import { MermaidDiagram } from "./MermaidDiagram"
import { ZoomableImage } from "./ZoomableImage"
import "./MarkdownPreview.css"

function isRemoteSource(src: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)
}

function resolveLocalPath(filePath: string, source: string) {
  const clean = source.split(/[?#]/, 1)[0]
  const base = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ""
  const parts = clean.startsWith("/") ? [] : base.split("/").filter(Boolean)
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (parts.length > 0) parts.pop()
      else parts.push("..")
    } else parts.push(part)
  }
  return parts.join("/")
}

function MarkdownPre({
  children,
  node: _node,
  ...props
}: React.ComponentProps<"pre"> & { node?: unknown }) {
  if (isValidElement<{ className?: string; children?: unknown }>(children)) {
    const { className = "", children: code } = children.props
    if (/(?:^|\s)language-mermaid(?:\s|$)/.test(className)) {
      return <MermaidDiagram code={String(code ?? "").replace(/\n$/, "")} />
    }
  }
  return <pre {...props}>{children}</pre>
}

function MarkdownImage({
  repo,
  filePath,
  src,
  alt,
  node: _node,
  ...props
}: React.ComponentProps<"img"> & { repo: string; filePath: string; node?: unknown }) {
  const source = typeof src === "string" ? src : ""
  const local = source.length > 0 && !isRemoteSource(source)
  const [resolved, setResolved] = useState(local ? "" : source)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!local) {
      setResolved(source)
      setFailed(false)
      return
    }
    let cancelled = false
    setResolved("")
    setFailed(false)
    ipc.readProjectFile(repo, resolveLocalPath(filePath, source)).then((file) => {
      if (cancelled) return
      if (file.kind === "image" && file.data && file.mime) {
        setResolved(`data:${file.mime};base64,${file.data}`)
      } else if (file.path.toLocaleLowerCase().endsWith(".svg") && file.text !== null) {
        const bytes = new TextEncoder().encode(file.text)
        let binary = ""
        bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
        setResolved(`data:image/svg+xml;base64,${btoa(binary)}`)
      } else {
        setFailed(true)
      }
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => { cancelled = true }
  }, [repo, filePath, source, local])

  if (failed) {
    return <span className="text-xs text-muted-foreground">[无法加载图片：{alt || source}]</span>
  }
  if (!resolved) {
    return <span className="inline-block h-20 w-full max-w-md animate-pulse rounded-md bg-muted" />
  }
  return <ZoomableImage {...props} src={resolved} alt={alt ?? ""} loading="lazy" />
}

export function MarkdownPreview({
  repo,
  path,
  text,
}: {
  repo: string
  path: string
  text: string
}) {
  return (
    <div className="h-full overflow-auto">
      <article className="markdown-preview mx-auto w-full max-w-6xl px-8 py-7">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre: MarkdownPre,
            img: (props) => <MarkdownImage {...props} repo={repo} filePath={path} />,
            a: ({ href, children, node: _node, ...props }) => {
              const external = href ? isRemoteSource(href) : false
              return (
                <a
                  {...props}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  onClick={(event) => { if (!external) event.preventDefault() }}
                >
                  {children}
                </a>
              )
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </article>
    </div>
  )
}
