mod commands;
mod files;
mod git;
mod state;
mod terminal;

use state::AppState;
use tauri::Manager;
use terminal::TerminalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 支持通过 FS_EXPLORER_CONFIG_DIR 覆盖配置目录（保留旧变量兼容便携化配置）。
            let config_override = std::env::var("FS_EXPLORER_CONFIG_DIR")
                .ok()
                .filter(|dir| !dir.is_empty())
                .or_else(|| {
                    std::env::var("GIT_GUI_CONFIG_DIR")
                        .ok()
                        .filter(|dir| !dir.is_empty())
                });
            let (config_dir, legacy_config_dir) = match config_override {
                Some(dir) => (std::path::PathBuf::from(dir), None),
                None => {
                    let dir = app.path().app_config_dir()?;
                    let legacy = dir.parent().map(|parent| parent.join("com.gitgui.desktop"));
                    (dir, legacy)
                }
            };
            app.manage(AppState::init_with_legacy(config_dir, legacy_config_dir));
            app.manage(TerminalState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::git_version,
            commands::restart_app,
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
            commands::open_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
