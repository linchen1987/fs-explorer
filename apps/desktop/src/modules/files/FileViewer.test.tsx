import type { ComponentProps } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FileViewer } from "./FileViewer"

const file: NonNullable<ComponentProps<typeof FileViewer>["file"]> = {
  path: "README.md",
  size: 8,
  kind: "text",
  text: "# Title\n",
  data: null,
  mime: null,
}

function renderViewer(overrides: Partial<ComponentProps<typeof FileViewer>> = {}) {
  return renderToString(
    <FileViewer
      repo="/repo"
      selectedPath="README.md"
      conflicted={false}
      file={file}
      loading={false}
      error={null}
      text="# Title\n"
      dirty={false}
      saving={false}
      mode="preview"
      onModeChange={() => {}}
      onChange={() => {}}
      onOpenFile={() => {}}
      canGoBack={false}
      canGoForward={false}
      onBack={() => {}}
      onForward={() => {}}
      {...overrides}
    />,
  )
}

describe("FileViewer editing model", () => {
  it("Markdown 保留预览和代码页签，不显示保存/编辑/取消按钮", () => {
    const html = renderViewer()
    expect(html).toContain("代码")
    expect(html).toContain("预览")
    expect(html).not.toContain("正在加载编辑器")
    expect(html).not.toContain("保存</button>")
    expect(html).not.toContain("编辑</button>")
    expect(html).not.toContain("取消</button>")
  })

  it("普通文本直接提供编辑器，不显示保存按钮", () => {
    const sourceFile = { ...file, path: "main.ts", text: "const value = 1\n" }
    const html = renderViewer({
      file: sourceFile,
      selectedPath: "main.ts",
      text: sourceFile.text,
      mode: "code",
    })
    expect(html).toContain("正在加载编辑器")
    expect(html).not.toContain("保存</button>")
    expect(html).not.toContain("编辑</button>")
    expect(html).not.toContain("取消</button>")
  })
})
