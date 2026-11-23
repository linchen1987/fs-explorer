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
monaco.editor.defineTheme("fs-explorer-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#F7F8FA",
    "editor.foreground": "#2B303B",
    "editorLineNumber.foreground": "#9AA3B2",
    "editorLineNumber.activeForeground": "#667085",
    "editorCursor.foreground": "#5962BD",
    "editor.selectionBackground": "#DDE2F6",
    "editor.inactiveSelectionBackground": "#E8EBF2",
    "editor.lineHighlightBackground": "#EFF1F5",
    "editorIndentGuide.background1": "#E0E4EA",
    "editorIndentGuide.activeBackground1": "#C3C9D6",
    "editorWhitespace.foreground": "#C6CCD7",
    "editorWidget.background": "#FCFDFE",
    "editorWidget.border": "#DEE2E9",
    "minimap.background": "#F3F5F8",
  },
})
monaco.editor.defineTheme("fs-explorer-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#17191F",
    "editor.foreground": "#D7DBE5",
    "editorLineNumber.foreground": "#6F7787",
    "editorLineNumber.activeForeground": "#A2AABD",
    "editorCursor.foreground": "#A6ADF5",
    "editor.selectionBackground": "#3A405D",
    "editor.inactiveSelectionBackground": "#2C303B",
    "editor.lineHighlightBackground": "#20242C",
    "editorIndentGuide.background1": "#303541",
    "editorIndentGuide.activeBackground1": "#4A5262",
    "editorWhitespace.foreground": "#4A5262",
    "editorWidget.background": "#22252E",
    "editorWidget.border": "#303541",
    "minimap.background": "#1B1E25",
  },
})

export function monacoTheme(dark: boolean) {
  return dark ? "fs-explorer-dark" : "fs-explorer-light"
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
