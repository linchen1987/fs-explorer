//! git 命令执行封装。
//!
//! 统一通过系统 git 执行命令（`git -C <repo> ...`），
//! 输出以 lossy UTF-8 解码（配合 `-z` 格式解析，路径不会被 munge）。

use std::process::Command;
use std::sync::OnceLock;

pub mod diff;
pub mod refs;
pub mod status;

/// 解析 git 可执行文件位置。
///
/// GUI 应用在 macOS 上从 Finder/Spotlight 启动时 PATH 很短，
/// 可能找不到 Homebrew 安装的 git，因此做常见路径回退。
fn git_binary() -> &'static str {
    static BIN: OnceLock<String> = OnceLock::new();
    BIN.get_or_init(|| {
        if Command::new("git").arg("--version").output().is_ok() {
            return "git".to_string();
        }
        for cand in [
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
            "/usr/local/git/bin/git",
        ] {
            if std::path::Path::new(cand).exists() {
                return cand.to_string();
            }
        }
        "git".to_string()
    })
}

fn build_command(repo: Option<&str>) -> Command {
    let mut cmd = Command::new(git_binary());
    if let Some(repo) = repo {
        cmd.arg("-C").arg(repo);
    }
    // 不弹凭据提示、不写 index（status 等只读命令更安全）
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_OPTIONAL_LOCKS", "0");
    cmd
}

/// 执行 git 命令，非零退出码视为错误（stderr 优先作为错误信息）。
pub fn run_git(repo: Option<&str>, args: &[&str]) -> Result<String, String> {
    run_git_ext(repo, args, &[])
}

/// 同 [run_git]，但允许指定额外的“正常”退出码（如 `diff --no-index` 有差异时退出 1）。
pub fn run_git_ext(repo: Option<&str>, args: &[&str], ok_codes: &[i32]) -> Result<String, String> {
    let out = build_command(repo).args(args).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 git 命令，请先安装 git（macOS 可安装 Xcode Command Line Tools）".to_string()
        } else {
            format!("无法启动 git: {e}")
        }
    })?;
    let code = out.status.code().unwrap_or(-1);
    if !out.status.success() && !ok_codes.contains(&code) {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(if detail.is_empty() {
            format!("git {} 执行失败 (exit {code})", args.first().unwrap_or(&""))
        } else {
            detail
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub fn git_version() -> Result<String, String> {
    run_git(None, &["--version"]).map(|s| s.trim().to_string())
}
