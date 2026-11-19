import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { languageForPath, monaco, monacoTheme } from "./monaco"

interface CodeEditorProps {
  path: string
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
}

/** VS Code 编辑器内核的薄 React 封装；实例只持有当前文件的 model。 */
export function CodeEditor({
  path,
  value,
  readOnly = false,
  onChange,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const applyingValueRef = useRef(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language: languageForPath(path),
      theme: monacoTheme(dark),
      readOnly,
      domReadOnly: readOnly,
      readOnlyMessage: { value: "此视图仅用于查看文件内容" },
      ariaLabel: readOnly ? "文件内容" : "编辑文件",
      // WebKit 会在 IME 组合输入时自动滚动 textarea；使用短文本避免与 Monaco 相互拉扯。
      // https://github.com/microsoft/monaco-editor/issues/4796
      accessibilitySupport: "off",
      automaticLayout: true,
      fixedOverflowWidgets: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 21,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      minimap: { enabled: true },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: "active" },
    })
    editorRef.current = editor
    const model = editor.getModel()
    const changeSubscription = editor.onDidChangeModelContent(() => {
      if (!applyingValueRef.current && model) onChangeRef.current?.(model.getValue())
    })

    return () => {
      changeSubscription.dispose()
      if (editorRef.current === editor) editorRef.current = null
      editor.dispose()
      model?.dispose()
    }
    // value、主题和只读能力由下方 Effect 增量同步，避免重建导致撤销栈丢失。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly,
      domReadOnly: readOnly,
      ariaLabel: readOnly ? "文件内容" : "编辑文件",
    })
  }, [readOnly])

  useEffect(() => {
    monaco.editor.setTheme(monacoTheme(dark))
  }, [dark])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model || model.getValue() === value) return
    applyingValueRef.current = true
    try {
      model.setValue(value)
    } finally {
      applyingValueRef.current = false
    }
  }, [value])

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden bg-background" />
}
