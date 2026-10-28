/** unix 秒 → 人类可读的相对时间 */
export function timeAgo(unixSeconds: number, now: number = Math.floor(Date.now() / 1000)): string {
  const diff = Math.max(0, now - unixSeconds)
  if (diff < 60) return "刚刚"
  const min = Math.floor(diff / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day} 天前`
  if (day < 30) {
    const week = Math.floor(day / 7)
    return week <= 1 ? "1 周前" : `${week} 周前`
  }
  if (day < 365) {
    const month = Math.floor(day / 30)
    return month <= 1 ? "1 个月前" : `${month} 个月前`
  }
  const year = Math.floor(day / 365)
  return year <= 1 ? "1 年前" : `${year} 年前`
}

/** 把路径拆成目录（灰显）与文件名（高亮） */
export function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf("/")
  if (idx === -1) return { dir: "", base: path }
  return { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) }
}
