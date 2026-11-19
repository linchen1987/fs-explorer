import * as monaco from "monaco-editor"
// Monaco 0.56+ 的 exports 映射已省略旧路径中的 esm/vs 前缀。
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker"
import CssWorker from "monaco-editor/language/css/css.worker.js?worker"
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker"
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker"
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker"

// 所有 worker 都由 Vite 本地打包，桌面应用离线运行时不请求 CDN。
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new JsonWorker()
    if (["css", "scss", "less"].includes(label)) return new CssWorker()
    if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker()
    if (["typescript", "javascript"].includes(label)) return new TsWorker()
    return new EditorWorker()
  },
}

// IME 组合输入层依赖实色背景遮住正文，透明背景会导致中英文输入重影。
monaco.editor.defineTheme("git-gui-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: { "editor.background": "#FFFFFF" },
})
monaco.editor.defineTheme("git-gui-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: { "editor.background": "#0A0A0A" },
})

export function monacoTheme(dark: boolean) {
  return dark ? "git-gui-dark" : "git-gui-light"
}

/** 使用 Monaco 自带的语言元数据识别扩展名及 Dockerfile 等特殊文件名。 */
export function languageForPath(path: string) {
  const normalized = path.toLowerCase()
  const filename = normalized.split(/[\\/]/).pop() ?? normalized
  const languages = monaco.languages.getLanguages()

  const exactFilename = languages.find((language) =>
    language.filenames?.some((candidate) => candidate.toLowerCase() === filename)
  )
  if (exactFilename) return exactFilename.id

  let match: { id: string; extensionLength: number } | null = null
  for (const language of languages) {
    for (const extension of language.extensions ?? []) {
      const normalizedExtension = extension.toLowerCase()
      if (
        normalized.endsWith(normalizedExtension)
        && normalizedExtension.length > (match?.extensionLength ?? -1)
      ) {
        match = { id: language.id, extensionLength: normalizedExtension.length }
      }
    }
  }
  return match?.id ?? "plaintext"
}

export { monaco }
