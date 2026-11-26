/**
 * Tauri IPC 的类型化封装。
 * 与 src-tauri/src/commands.rs 一一对应。
 */
import { invoke } from "@tauri-apps/api/core"
import type {
  BranchList,
  CommitChanges,
  CompareResult,
  FileSearchResult,
  FileTreePage,
  HistoryPage,
  Project,
  ProjectFileContent,
  WorktreeStatus,
} from "@fs-explorer/core"

const projectDirectoryRequests = new Map<string, Promise<FileTreePage>>()

/** React 开发模式的双重 Effect 与连续展开共享同一目录请求。 */
function listProjectDirectory(repo: string, parent: string, limit: number): Promise<FileTreePage> {
  const key = JSON.stringify([repo, parent, limit])
  const existing = projectDirectoryRequests.get(key)
  if (existing) return existing
  const request = invoke<FileTreePage>("list_project_directory", { repo, parent, limit }).finally(() => {
    projectDirectoryRequests.delete(key)
  })
  projectDirectoryRequests.set(key, request)
  return request
}


export const ipc = {
  gitVersion: () => invoke<string>("git_version"),
  restartApp: () => invoke<void>("restart_app"),

  openTerminal: (repo: string, cols: number, rows: number) =>
    invoke<string>("open_terminal", { repo, cols, rows }),
  writeTerminal: (id: string, data: string) =>
    invoke<void>("write_terminal", { id, data }),
  changeTerminalDirectory: (id: string, path: string) =>
    invoke<void>("change_terminal_directory", { id, path }),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { id, cols, rows }),
  closeTerminal: (id: string) => invoke<void>("close_terminal", { id }),

  listProjects: () => invoke<Project[]>("list_projects"),
  addProject: (path: string) => invoke<Project>("add_project", { path }),
  removeProject: (path: string) => invoke<void>("remove_project", { path }),
  renameProject: (path: string, name: string) =>
    invoke<Project>("rename_project", { path, name }),
  reorderProjects: (paths: string[]) => invoke<void>("reorder_projects", { paths }),

  listProjectDirectory,
  searchProjectFiles: (repo: string, query: string, limit: number) =>
    invoke<FileSearchResult>("search_project_files", { repo, query, limit }),
  readProjectFile: (repo: string, path: string) =>
    invoke<ProjectFileContent>("read_project_file", { repo, path }),
  saveProjectFile: (repo: string, path: string, content: string) =>
    invoke<void>("save_project_file", { repo, path, content }),
  copyFilesToClipboard: (repo: string, paths: string[]) =>
    invoke<void>("copy_files_to_clipboard", { repo, paths }),

  getWorktreeStatus: (repo: string) =>
    invoke<WorktreeStatus>("get_worktree_status", { repo }),
  listBranches: (repo: string) => invoke<BranchList>("list_branches", { repo }),

  compareRefs: (repo: string, base: string, head: string) =>
    invoke<CompareResult>("compare_refs", { repo, base, head }),

  /** revision=null 表示所有本地及远程跟踪分支 */
  listCommits: (
    repo: string,
    revision: string | null,
    skip: number,
    limit: number,
  ) => invoke<HistoryPage>("list_commits", { repo, revision, skip, limit }),
  getCommitChanges: (repo: string, sha: string) =>
    invoke<CommitChanges>("get_commit_changes", { repo, sha }),
  diffCommitFile: (
    repo: string,
    sha: string,
    path: string,
    oldPath: string | null,
  ) => invoke<string>("diff_commit_file", { repo, sha, path, oldPath }),

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
