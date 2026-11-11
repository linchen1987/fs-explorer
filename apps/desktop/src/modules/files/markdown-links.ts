export function isRemoteSource(source: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)
}

/** 将 Markdown 中相对于当前文档的链接解析为仓库内路径。 */
export function resolveLocalPath(filePath: string, source: string) {
  const clean = source.split(/[?#]/, 1)[0]
  if (!clean) return ""
  const base = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ""
  const parts = clean.startsWith("/") ? [] : base.split("/").filter(Boolean)
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (parts.length > 0) parts.pop()
      else parts.push("..")
    } else parts.push(part)
  }
  const path = parts.join("/")
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
