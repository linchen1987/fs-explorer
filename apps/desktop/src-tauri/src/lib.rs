mod commands;
mod files;
mod git;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 支持通过 GIT_GUI_CONFIG_DIR 覆盖配置目录（调试 / 便携化）
            let config_dir = match std::env::var("GIT_GUI_CONFIG_DIR") {
                Ok(dir) if !dir.is_empty() => std::path::PathBuf::from(dir),
                _ => app.path().app_config_dir()?,
            };
            app.manage(AppState::init(config_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::git_version,
            commands::list_projects,
            commands::add_project,
            commands::remove_project,
            commands::list_project_directory,
            commands::search_project_files,
            commands::read_project_file,
            commands::save_project_file,
            commands::get_worktree_status,
            commands::list_branches,
            commands::compare_refs,
            commands::list_commits,
            commands::get_commit_changes,
            commands::diff_commit_file,
            commands::diff_refs_file,
            commands::diff_worktree_file,
            commands::diff_untracked_file,
            commands::stage_paths,
            commands::unstage_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
