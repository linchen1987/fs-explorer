import { describe, expect, it } from "vitest"
import { formatFileSize } from "./file-size"

describe("formatFileSize", () => {
  it("按二进制单位显示从字节到 PB 的大小", () => {
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(1023)).toBe("1023 B")
    expect(formatFileSize(1024)).toBe("1.0 KB")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(5 * 1024 ** 2)).toBe("5.0 MB")
    expect(formatFileSize(2 * 1024 ** 3)).toBe("2.0 GB")
    expect(formatFileSize(3 * 1024 ** 4)).toBe("3.0 TB")
    expect(formatFileSize(1024 ** 5)).toBe("1.0 PB")
  })
})
