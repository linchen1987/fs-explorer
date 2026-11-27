const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const

/** 使用紧凑的二进制单位展示文件字节数，精确值可由调用方放在 title 中。 */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${SIZE_UNITS[unit]}`
}

export function exactFileSize(bytes: number) {
  return `${bytes.toLocaleString()} 字节`
}
