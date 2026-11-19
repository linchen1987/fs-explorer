//! 暴露给前端的 Tauri commands（薄封装，逻辑都在 files/git/state/terminal 模块中）。

use crate::state::{AppState, Project, now_rfc3339, sort_projects_newest_first};
use crate::terminal::TerminalState;
use tauri::{AppHandle, State};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[tauri::command]
pub async fn git_version() -> Result<String, String> {
    crate::git::git_version()
}

/// 保存窗口状态后重启当前应用；调用成功后当前进程会退出，不会返回前端。
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    if let Err(error) = app.save_window_state(StateFlags::all()) {
        eprintln!("[git-gui] 重启前保存窗口状态失败: {error}");
    }
    app.restart()
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    Ok(state.projects.lock().unwrap().clone())
}

/// 添加项目：目录必须是 git 仓库（自动规范化到仓库根目录）。
#[tauri::command]
pub async fn add_project(state: State<'_, AppState>, path: String) -> Result<Project, String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err(format!("目录不存在: {path}"));
    }
    let toplevel = crate::git::run_git(Some(&path), &["rev-parse", "--show-toplevel"])
        .map_err(|_| format!("不是一个 git 仓库: {path}"))?
        .trim()
        .to_string();
    if toplevel.is_empty() {
        return Err(format!("不是一个 git 仓库: {path}"));
    }
    let name = std::path::Path::new(&toplevel)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| toplevel.clone());

    let mut projects = state.projects.lock().unwrap();
    if let Some(existing) = projects.iter().find(|p| p.path == toplevel) {
        return Err(format!("项目已存在: {}", existing.name));
    }
    let project = Project {
        path: toplevel,
        name,
        added_at: now_rfc3339(),
    };
    // 新项先放在最前，配合稳定排序，确保同一秒内后添加的项目也排在前面。
    projects.insert(0, project.clone());
    sort_projects_newest_first(&mut projects);
    state.save(&projects)?;
    Ok(project)
}

#[tauri::command]
pub async fn remove_project(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let mut projects = state.projects.lock().unwrap();
    let before = projects.len();
    projects.retain(|p| p.path != path);
    if projects.len() == before {
        return Err("项目不存在".to_string());
    }
    state.save(&projects)
}

#[tauri::command]
pub async fn list_project_directory(
    repo: String,
    parent: String,
    limit: usize,
) -> Result<crate::files::FileTreePage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::files::list_directory(&repo, &parent, limit)
    })
    .await
    .map_err(|e| format!("读取项目目录任务失败: {e}"))?
}

#[tauri::command]
pub async fn search_project_files(
    repo: String,
    query: String,
    limit: usize,
) -> Result<crate::files::FileSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || crate::files::search_files(&repo, &query, limit))
        .await
        .map_err(|e| format!("搜索项目文件任务失败: {e}"))?
}

#[tauri::command]
pub async fn read_project_file(
    repo: String,
    path: String,
) -> Result<crate::files::FileContent, String> {
    crate::files::read_file(&repo, &path)
}

#[tauri::command]
pub async fn save_project_file(repo: String, path: String, content: String) -> Result<(), String> {
    crate::files::save_file(&repo, &path, &content)
}

#[tauri::command]
pub async fn get_worktree_status(
    repo: String,
) -> Result<crate::git::status::WorktreeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || crate::git::status::status(&repo))
        .await
        .map_err(|e| format!("读取工作区状态任务失败: {e}"))?
}

#[tauri::command]
pub async fn list_branches(repo: String) -> Result<crate::git::refs::BranchList, String> {
    crate::git::refs::list_branches(&repo)
}

#[tauri::command]
pub async fn compare_refs(
    repo: String,
    base: String,
    head: String,
) -> Result<crate::git::diff::CompareResult, String> {
    crate::git::diff::compare_refs(&repo, &base, &head)
}

#[tauri::command]
pub async fn list_commits(
    repo: String,
    revision: Option<String>,
    skip: usize,
    limit: usize,
) -> Result<crate::git::history::HistoryPage, String> {
    crate::git::history::list_commits(&repo, revision.as_deref(), skip, limit)
}

#[tauri::command]
pub async fn get_commit_changes(
    repo: String,
    sha: String,
) -> Result<crate::git::history::CommitChanges, String> {
    crate::git::history::get_commit_changes(&repo, &sha)
}

#[tauri::command]
pub async fn diff_commit_file(
    repo: String,
    sha: String,
    path: String,
    old_path: Option<String>,
) -> Result<String, String> {
    crate::git::history::diff_commit_file(&repo, &sha, &path, old_path.as_deref())
}

#[tauri::command]
pub async fn diff_refs_file(
    repo: String,
    base: String,
    head: String,
    path: String,
    old_path: Option<String>,
) -> Result<String, String> {
    crate::git::diff::diff_refs_file(&repo, &base, &head, &path, old_path.as_deref())
}

#[tauri::command]
pub async fn diff_worktree_file(
    repo: String,
    path: String,
    staged: bool,
    old_path: Option<String>,
) -> Result<String, String> {
    crate::git::diff::diff_worktree_file(&repo, &path, staged, old_path.as_deref())
}

#[tauri::command]
pub async fn diff_untracked_file(repo: String, path: String) -> Result<String, String> {
    crate::git::diff::diff_untracked_file(&repo, &path)
}

#[tauri::command]
pub async fn stage_paths(repo: String, paths: Vec<String>) -> Result<(), String> {
    crate::git::diff::stage_paths(&repo, &paths)
}

#[tauri::command]
pub async fn unstage_paths(repo: String, paths: Vec<String>) -> Result<(), String> {
    crate::git::diff::unstage_paths(&repo, &paths)
}

#[tauri::command]
pub fn open_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    repo: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    crate::terminal::open(app, state.inner(), repo, cols, rows)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    crate::terminal::write(state.inner(), &id, &data)
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    crate::terminal::resize(state.inner(), &id, cols, rows)
}

#[tauri::command]
pub fn close_terminal(app: AppHandle, state: State<'_, TerminalState>, id: String) {
    crate::terminal::close(&app, state.inner(), &id);
}
