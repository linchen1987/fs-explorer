import { lazy } from "react"
import type { LucideIcon } from "lucide-react"
import { FileDiff, FolderTree, GitCompare, History } from "lucide-react"
import type { Project } from "@fs-explorer/core"
import { WorktreeModule } from "./worktree/WorktreeModule"
import { HistoryModule } from "./history/HistoryModule"
import { BranchCompareModule } from "./branch-compare/BranchCompareModule"

const FilesModule = lazy(() =>
  import("./files/FilesModule").then((module) => ({ default: module.FilesModule })),
)

export interface ModuleProps {
  project: Project
  active: boolean
}

export interface ModuleDef {
  id: string
  title: string
  icon: LucideIcon
  component: React.ComponentType<ModuleProps>
  /** 普通目录中的 Git 模块保留展示，但不可激活。 */
  requiresGit: boolean
}

/**
 * 主区域的模块注册表。
 * 新增模块：在 modules/ 下新建目录与组件，然后在这里注册即可。
 */
export const MODULES: ModuleDef[] = [
  {
    id: "worktree",
    title: "工作区",
    icon: FileDiff,
    component: WorktreeModule,
    requiresGit: true,
  },
  {
    id: "files",
    title: "文件",
    icon: FolderTree,
    component: FilesModule,
    requiresGit: false,
  },
  {
    id: "history",
    title: "提交历史",
    icon: History,
    component: HistoryModule,
    requiresGit: true,
  },
  {
    id: "branch-compare",
    title: "分支对比",
    icon: GitCompare,
    component: BranchCompareModule,
    requiresGit: true,
  },
]
