import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { VirtualizedRows } from "./VirtualizedRows"

describe("VirtualizedRows", () => {
  it("大量行只渲染视口与 overscan 范围内的内容", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => `file-${index}.ts`)
    const html = renderToString(
      <VirtualizedRows
        rows={rows}
        getRowKey={(row) => row}
        renderRow={(row) => <div className="h-9">{row}</div>}
      />,
    )

    expect(html).toContain("file-0.ts")
    expect(html).not.toContain("file-9999.ts")
    expect((html.match(/data-index=/g) ?? []).length).toBeLessThan(50)
  })

  it("动态行高使用测量后的实际高度", () => {
    const html = renderToString(
      <VirtualizedRows
        rows={[{ key: "header", height: 40 }, { key: "file", height: 36 }]}
        getRowKey={(row) => row.key}
        estimateRowHeight={(row) => row.height}
        renderRow={(row) => <div>{row.key}</div>}
      />,
    )

    expect(html).toContain("header")
    expect(html).toContain("file")
  })
})
