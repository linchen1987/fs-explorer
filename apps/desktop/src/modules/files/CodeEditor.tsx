import { useEffect, useRef } from "react"
import { Compartment, EditorState } from "@codemirror/state"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark"
import {
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view"
import { useTheme } from "next-themes"

const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
    paddingLeft: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--primary) 20%, transparent)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
})

interface CodeEditorProps {
  path: string
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onSave?: () => void
}

/** 轻量 CodeMirror 封装：语言按需加载，查看与编辑共用高亮。 */
export function CodeEditor({
  path,
  value,
  readOnly = false,
  onChange,
  onSave,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!hostRef.current) return
    const language = new Compartment()
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          dark
            ? syntaxHighlighting(oneDarkHighlightStyle, { fallback: true })
            : syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          baseTheme,
          language.of([]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({
            "aria-label": readOnly ? "文件内容" : "编辑文件",
          }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                onSaveRef.current?.()
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view

    const description = LanguageDescription.matchFilename(languages, path)
    let cancelled = false
    if (description) {
      void description.load().then((support) => {
        if (!cancelled && viewRef.current === view) {
          view.dispatch({ effects: language.reconfigure(support) })
        }
      }).catch(() => {
        // 语言包加载失败时保留纯文本查看/编辑能力。
      })
    }

    return () => {
      cancelled = true
      if (viewRef.current === view) viewRef.current = null
      view.destroy()
    }
    // value 由下方受控同步，其他配置变化时重建轻量编辑器实例。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly, dark])

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />
}
