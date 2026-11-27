/**
 * 领域模型类型。
 *
 * 这些类型与 `apps/desktop/src-tauri` 中 Rust 结构体的 serde 输出一一对应
 * （Rust 侧统一使用 `#[serde(rename_all = "camelCase")]`）。
 * 修改任意一侧时请保持两边同步。
 */

/** 一个 Project = 一个本地目录；Git 项目使用仓库根目录 */
export interface Project {
  /** 项目目录的绝对路径（同时作为唯一 id） */
  path: string
  /** 展示名（初始为目录名，可由用户自定义） */
  name: string
  /** 添加时间（RFC3339） */
  addedAt: string
  /** 是否为 Git 仓库；普通目录仅启用文件等非 Git 模块 */
  isGitRepo: boolean
}

/** 工作区状态条目（对应 `git status --porcelain=v2` 的一条变更） */
export interface StatusEntry {
  /** 当前路径（rename 时为新路径） */
  path: string
  /** rename/copy 时的原路径 */
  oldPath: string | null
  /** 暂存区状态字母：'.' 表示无暂存变更；'M'/'A'/'D'/'R'/'C'/'T'/'U' */
  indexStatus: string
  /** 工作区状态字母：'.' 表示无未暂存变更 */
  worktreeStatus: string
  /** 未跟踪文件 */
  untracked: boolean
  /** 合并冲突中 */
  conflicted: boolean
}

/** 工作区整体状态 */
export interface WorktreeStatus {
  /** 当前分支名；detached HEAD 时为 null */
  branch: string | null
  /** HEAD 提交 sha（短）；尚无提交时为 null */
  headSha: string | null
  detached: boolean
  /** 上游分支（如 origin/main） */
  upstream: string | null
  /** 领先上游的提交数（无上游时为 null） */
  ahead: number | null
  /** 落后上游的提交数 */
  behind: number | null
  entries: StatusEntry[]
}

/** 分支（本地或远程跟踪分支） */
export interface Branch {
  /** 短名：本地 `main`，远程 `origin/main` */
  name: string
  /** 完整 ref 名：`refs/heads/main` / `refs/remotes/origin/main` */
  refName: string
  isRemote: boolean
  /** 是否为当前分支 */
  isHead: boolean
  /** tip 提交短 sha */
  sha: string
  /** tip 提交时间（unix 秒） */
  lastTimestamp: number
  /** tip 提交标题 */
  lastSubject: string
}

export interface BranchList {
  /** 当前分支名（detached 或无分支时为 null） */
  current: string | null
  /** 推荐的对比基准分支（origin/HEAD → main → master → 首个本地分支） */
  defaultBranch: string | null
  branches: Branch[]
}

/** 提交记录 */
export interface Commit {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  /** unix 秒 */
  timestamp: number
  subject: string
}

/** 文件变更类型：新增/修改/删除/重命名/复制/类型变更 */
export type FileChangeStatus = "A" | "M" | "D" | "R" | "C" | "T"

/** 两个 ref 之间的一个文件变更 */
export interface FileChange {
  status: FileChangeStatus
  /** 旧路径（新增时为 null） */
  oldPath: string | null
  /** 新路径（删除时等于旧路径） */
  newPath: string
  /** 新增行数（二进制文件为 null） */
  additions: number | null
  /** 删除行数（二进制文件为 null） */
  deletions: number | null
}

/** 两个 ref 之间的对比结果（PR 视角） */
export interface CompareResult {
  /** merge-base 的完整 sha；无共同祖先时为 null */
  mergeBase: string | null
  /** head 相对 base 多出的提交（`git log base..head`） */
  commits: Commit[]
  files: FileChange[]
  totalAdditions: number
  totalDeletions: number
}

/** 历史记录中的提交，额外携带拓扑和 ref 装饰信息 */
export interface HistoryCommit extends Commit {
  /** 完整父提交 sha；根提交为空数组，合并提交通常包含两个或更多 */
  parentShas: string[]
  /** 指向该提交的分支、HEAD、tag 等短名 */
  refs: string[]
}

export interface HistoryPage {
  commits: HistoryCommit[]
  hasMore: boolean
  nextSkip: number
}

/** 单个提交相对第一父提交的文件变化；根提交相对空树 */
export interface CommitChanges {
  files: FileChange[]
  totalAdditions: number
  totalDeletions: number
}

/** 文件查看器读取结果；文本存放在 text，图片/视频使用 base64 data。 */
export interface ProjectFileContent {
  path: string
  size: number
  kind: "text" | "image" | "video" | "binary"
  text: string | null
  data: string | null
  mime: string | null
}

/** 按需计算的文件或目录大小；目录递归统计不包含 .git。 */
export interface ProjectPathSizeEntry {
  path: string
  kind: "file" | "directory"
  size: number
}

export interface ProjectPathSize extends ProjectPathSizeEntry {
  /** 目录始终返回全部一级子项；文件为 null。 */
  children: ProjectPathSizeEntry[] | null
}
