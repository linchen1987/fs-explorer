//! 项目列表持久化（保存在应用配置目录的 projects.json）。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

fn default_is_git_repo() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// 项目目录绝对路径（同时作为唯一 id）；Git 项目会规范化到仓库根目录
    pub path: String,
    /// 展示名（初始为目录名，可由用户自定义）
    pub name: String,
    /// 添加时间（RFC3339 UTC）
    pub added_at: String,
    /// 是否为 Git 仓库；旧版本配置中的项目都经过 Git 校验，因此缺省为 true
    #[serde(default = "default_is_git_repo")]
    pub is_git_repo: bool,
}

#[derive(Serialize, Deserialize)]
struct ProjectFile {
    version: u32,
    projects: Vec<Project>,
}

pub struct AppState {
    config_path: PathBuf,
    pub projects: Mutex<Vec<Project>>,
}

impl AppState {
    /// 初始化：读取配置目录中的 projects.json（不存在或损坏时从空列表开始）。
    #[cfg(test)]
    pub fn init(dir: PathBuf) -> Self {
        Self::init_with_legacy(dir, None)
    }

    /// 新配置尚不存在时导入更名前的项目列表，并立即写入新配置目录。
    pub fn init_with_legacy(dir: PathBuf, legacy_dir: Option<PathBuf>) -> Self {
        let _ = fs::create_dir_all(&dir);
        let config_path = dir.join("projects.json");
        let legacy_path = legacy_dir.map(|dir| dir.join("projects.json"));
        let (projects, needs_migration) = match Self::load(&config_path) {
            Some(projects) => (projects, false),
            None if !config_path.exists() => match legacy_path.as_deref().and_then(Self::load) {
                Some(projects) => (projects, true),
                None => (Vec::new(), false),
            },
            None => (Vec::new(), false),
        };
        let state = AppState {
            config_path,
            projects: Mutex::new(projects),
        };
        if needs_migration {
            let projects = state.projects.lock().unwrap();
            if let Err(error) = state.save(&projects) {
                eprintln!("[fs-explorer] 旧项目列表迁移失败: {error}");
            }
        }
        state
    }

    fn load(path: &Path) -> Option<Vec<Project>> {
        let raw = fs::read_to_string(path).ok()?;
        match serde_json::from_str::<ProjectFile>(&raw) {
            Ok(f) => Some(f.projects),
            Err(e) => {
                eprintln!("[fs-explorer] projects.json 解析失败({e})，已忽略");
                None
            }
        }
    }

    pub fn save(&self, projects: &[Project]) -> Result<(), String> {
        let file = ProjectFile {
            version: 1,
            projects: projects.to_vec(),
        };
        let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
        // 原子写入：先写临时文件再 rename
        let tmp = self.config_path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| format!("写入配置失败: {e}"))?;
        fs::rename(&tmp, &self.config_path).map_err(|e| format!("写入配置失败: {e}"))?;
        Ok(())
    }
}

/// 当前时间的 RFC3339 UTC 字符串（不引第三方时间库的最小实现）。
pub fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    format_unix_rfc3339(secs)
}

/// days-from-civil 逆算法（Howard Hinnant），把 unix 秒转为 UTC 日期。
pub fn format_unix_rfc3339(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097); // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let month = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let year = if month <= 2 { y + 1 } else { y };

    format!("{year:04}-{month:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        {
            let state = AppState::init(dir.path().to_path_buf());
            let mut projects = state.projects.lock().unwrap();
            projects.push(Project {
                path: "/tmp/some-repo".into(),
                name: "some-repo".into(),
                added_at: "2026-01-01T00:00:00Z".into(),
                is_git_repo: true,
            });
            state.save(&projects).unwrap();
        }
        let state2 = AppState::init(dir.path().to_path_buf());
        let loaded = state2.projects.lock().unwrap().clone();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "some-repo");
        assert_eq!(loaded[0].path, "/tmp/some-repo");
    }

    #[test]
    fn load_preserves_saved_project_order() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("projects.json"),
            r#"{
                "version": 1,
                "projects": [
                    { "path": "/tmp/oldest", "name": "oldest", "addedAt": "2025-01-01T00:00:00Z" },
                    { "path": "/tmp/first", "name": "first", "addedAt": "2026-02-01T00:00:00Z" },
                    { "path": "/tmp/newest", "name": "newest", "addedAt": "2026-03-01T00:00:00Z" },
                    { "path": "/tmp/second", "name": "second", "addedAt": "2026-02-01T00:00:00Z" }
                ]
            }"#,
        )
        .unwrap();

        let state = AppState::init(dir.path().to_path_buf());
        let projects = state.projects.lock().unwrap();
        let names = projects.iter().map(|p| p.name.as_str()).collect::<Vec<_>>();
        assert_eq!(names, ["oldest", "first", "newest", "second"]);
        assert!(projects.iter().all(|p| p.is_git_repo));
    }

    #[test]
    fn migrates_legacy_projects_when_current_config_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let current = dir.path().join("current");
        let legacy = dir.path().join("legacy");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(
            legacy.join("projects.json"),
            r#"{
                "version": 1,
                "projects": [
                    { "path": "/tmp/legacy-repo", "name": "legacy-repo", "addedAt": "2026-01-01T00:00:00Z" }
                ]
            }"#,
        )
        .unwrap();

        let state = AppState::init_with_legacy(current.clone(), Some(legacy));
        let projects = state.projects.lock().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "legacy-repo");
        assert!(current.join("projects.json").is_file());
    }

    #[test]
    fn rfc3339_formatting() {
        assert_eq!(format_unix_rfc3339(0), "1970-01-01T00:00:00Z");
        // 闰年：2000-02-29 00:00:00 UTC
        assert_eq!(format_unix_rfc3339(951782400), "2000-02-29T00:00:00Z");
        assert_eq!(format_unix_rfc3339(86399), "1970-01-01T23:59:59Z");
    }
}
