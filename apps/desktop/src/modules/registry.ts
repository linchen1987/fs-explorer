import type { LucideIcon } from "lucide-react"
import { FileDiff, GitCompare, History } from "lucide-react"
import type { Project } from "@git-gui/core"
import { WorktreeModule } from "./worktree/WorktreeModule"
import { HistoryModule } from "./history/HistoryModule"
import { BranchCompareModule } from "./branch-compare/BranchCompareModule"

export interface ModuleProps {
  project: Project
}

export interface ModuleDef {
  id: string
  title: string
  icon: LucideIcon
  component: React.ComponentType<ModuleProps>
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
  },
  {
    id: "history",
    title: "提交历史",
    icon: History,
    component: HistoryModule,
  },
  {
    id: "branch-compare",
    title: "分支对比",
    icon: GitCompare,
    component: BranchCompareModule,
  },
]
