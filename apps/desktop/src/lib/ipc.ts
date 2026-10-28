/**
 * Tauri IPC 的类型化封装。
 * 与 src-tauri/src/commands.rs 一一对应。
 */
import { invoke } from "@tauri-apps/api/core"
import type {
  BranchList,
  CompareResult,
  Project,
  WorktreeStatus,
} from "@git-gui/core"

export const ipc = {
  gitVersion: () => invoke<string>("git_version"),

  listProjects: () => invoke<Project[]>("list_projects"),
  addProject: (path: string) => invoke<Project>("add_project", { path }),
  removeProject: (path: string) => invoke<void>("remove_project", { path }),

  getWorktreeStatus: (repo: string) =>
    invoke<WorktreeStatus>("get_worktree_status", { repo }),
  listBranches: (repo: string) => invoke<BranchList>("list_branches", { repo }),

  compareRefs: (repo: string, base: string, head: string) =>
    invoke<CompareResult>("compare_refs", { repo, base, head }),
  diffRefsFile: (
    repo: string,
    base: string,
    head: string,
    path: string,
    oldPath: string | null,
  ) => invoke<string>("diff_refs_file", { repo, base, head, path, oldPath }),

  diffWorktreeFile: (
    repo: string,
    path: string,
    staged: boolean,
    oldPath: string | null,
  ) => invoke<string>("diff_worktree_file", { repo, path, staged, oldPath }),
  diffUntrackedFile: (repo: string, path: string) =>
    invoke<string>("diff_untracked_file", { repo, path }),

  stagePaths: (repo: string, paths: string[]) =>
    invoke<void>("stage_paths", { repo, paths }),
  unstagePaths: (repo: string, paths: string[]) =>
    invoke<void>("unstage_paths", { repo, paths }),
}
