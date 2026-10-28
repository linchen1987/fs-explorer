//! ref 之间的对比（PR 视角）、单文件 diff、暂存/取消暂存。

use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// A/M/D/R/C/T
    pub status: char,
    pub old_path: Option<String>,
    pub new_path: String,
    /// 二进制文件为 None
    pub additions: Option<i64>,
    pub deletions: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompareResult {
    pub merge_base: Option<String>,
    pub commits: Vec<Commit>,
    pub files: Vec<FileChange>,
    pub total_additions: i64,
    pub total_deletions: i64,
}

fn verify_ref(repo: &str, rev: &str) -> Result<(), String> {
    let spec = format!("{rev}^{{commit}}");
    super::run_git_ext(Some(repo), &["rev-parse", "--verify", "--quiet", &spec], &[1])
        .map(|_| ())
        .map_err(|_| format!("无效的分支或引用: {rev}"))
}

/// 对比两个 ref：merge-base、独有提交（base..head）、文件变更（base...head）。
pub fn compare_refs(repo: &str, base: &str, head: &str) -> Result<CompareResult, String> {
    verify_ref(repo, base)?;
    verify_ref(repo, head)?;

    let merge_base = super::run_git_ext(Some(repo), &["merge-base", base, head], &[1])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let commits = log_range(repo, base, head)?;
    let (files, total_additions, total_deletions) = changed_files(repo, base, head)?;

    Ok(CompareResult {
        merge_base,
        commits,
        files,
        total_additions,
        total_deletions,
    })
}

pub fn log_range(repo: &str, base: &str, head: &str) -> Result<Vec<Commit>, String> {
    let range = format!("{base}..{head}");
    let fmt = "%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s";
    let format_arg = format!("--format={fmt}");
    let raw = super::run_git(Some(repo), &["log", "--no-color", &format_arg, &range])?;
    Ok(parse_log(&raw))
}

pub fn parse_log(raw: &str) -> Vec<Commit> {
    raw.split('\n')
        .filter(|l| !l.is_empty())
        .filter_map(|rec| {
            let f: Vec<&str> = rec.split('\x1f').collect();
            if f.len() != 6 {
                return None;
            }
            Some(Commit {
                sha: f[0].to_string(),
                short_sha: f[1].to_string(),
                author_name: f[2].to_string(),
                author_email: f[3].to_string(),
                timestamp: f[4].parse().ok()?,
                subject: f[5].to_string(),
            })
        })
        .collect()
}

/// 解析 `git diff --name-status -z`。
/// 记录形如 `M\0path\0`、`A\0path\0`，rename/copy 为 `R100\0<旧路径>\0<新路径>\0`（旧路径在前）。
pub fn parse_name_status_z(raw: &str) -> Vec<(char, Option<String>, String)> {
    let tokens: Vec<&str> = raw.split('\0').collect();
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let t = tokens[i];
        i += 1;
        if t.is_empty() {
            continue;
        }
        let status = t.chars().next().unwrap_or('M');
        if status == 'R' || status == 'C' {
            let old = tokens.get(i).copied().unwrap_or_default();
            i += 1;
            let new = tokens.get(i).copied().unwrap_or_default();
            i += 1;
            if new.is_empty() {
                continue;
            }
            out.push((status, Some(old.to_string()), new.to_string()));
        } else {
            let path = tokens.get(i).copied().unwrap_or_default();
            i += 1;
            if path.is_empty() {
                continue;
            }
            out.push((status, None, path.to_string()));
        }
    }
    out
}

/// 解析 `git diff --numstat -z`。
/// 普通记录 `adds\tdels\tpath\0`；rename 记录 `adds\tdels\t\0<旧>\0<新>\0`；二进制为 `-`。
pub fn parse_numstat_z(raw: &str) -> Vec<(Option<i64>, Option<i64>, Option<String>, String)> {
    let tokens: Vec<&str> = raw.split('\0').collect();
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let t = tokens[i];
        i += 1;
        if t.is_empty() {
            continue;
        }
        let mut parts = t.splitn(3, '\t');
        let adds = parts.next().unwrap_or("-");
        let dels = parts.next().unwrap_or("-");
        let path = parts.next().unwrap_or("");
        let parse = |s: &str| if s == "-" { None } else { s.parse::<i64>().ok() };
        let (a, d) = (parse(adds), parse(dels));
        if path.is_empty() {
            // rename：后两个 token 是 旧路径、新路径
            let old = tokens.get(i).copied().unwrap_or_default();
            i += 1;
            let new = tokens.get(i).copied().unwrap_or_default();
            i += 1;
            if new.is_empty() {
                continue;
            }
            out.push((a, d, Some(old.to_string()), new.to_string()));
        } else {
            out.push((a, d, None, path.to_string()));
        }
    }
    out
}

fn changed_files(repo: &str, base: &str, head: &str) -> Result<(Vec<FileChange>, i64, i64), String> {
    let range = format!("{base}...{head}");
    let ns = super::run_git(
        Some(repo),
        &["diff", "--no-color", "--name-status", "-M", "-z", &range],
    )?;
    let stats = super::run_git(Some(repo), &["diff", "--no-color", "--numstat", "-M", "-z", &range])?;

    let mut stat_map: HashMap<String, (Option<i64>, Option<i64>)> = HashMap::new();
    for (a, d, _old, new) in parse_numstat_z(&stats) {
        stat_map.insert(new, (a, d));
    }

    let mut files = Vec::new();
    let mut ta = 0i64;
    let mut td = 0i64;
    for (status, old, new) in parse_name_status_z(&ns) {
        let (a, d) = stat_map.get(&new).copied().unwrap_or((None, None));
        ta += a.unwrap_or(0);
        td += d.unwrap_or(0);
        files.push(FileChange {
            status,
            old_path: old,
            new_path: new,
            additions: a,
            deletions: d,
        });
    }
    Ok((files, ta, td))
}

/// 两个 ref 之间单个文件的 diff 文本。
/// rename 时需要把新旧路径都作为 pathspec 传入，否则重命名会被显示为“新增+删除”。
pub fn diff_refs_file(
    repo: &str,
    base: &str,
    head: &str,
    path: &str,
    old_path: Option<&str>,
) -> Result<String, String> {
    let range = format!("{base}...{head}");
    let mut args: Vec<&str> = vec!["diff", "--no-color", "-M", "--unified=3", &range, "--", path];
    if let Some(op) = old_path {
        if op != path {
            args.push(op);
        }
    }
    super::run_git(Some(repo), &args)
}

/// 工作区单个文件的 diff 文本（staged=true 时为已暂存 vs HEAD，否则为工作区 vs 暂存区）。
pub fn diff_worktree_file(
    repo: &str,
    path: &str,
    staged: bool,
    old_path: Option<&str>,
) -> Result<String, String> {
    let mut args: Vec<&str> = vec!["diff", "--no-color", "-M", "--unified=3"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(path);
    if let Some(op) = old_path {
        if op != path {
            args.push(op);
        }
    }
    super::run_git(Some(repo), &args)
}

/// 未跟踪文件：用 `git diff --no-index /dev/null <path>` 生成“全新增”的 diff（有差异时退出码为 1）。
pub fn diff_untracked_file(repo: &str, path: &str) -> Result<String, String> {
    super::run_git_ext(
        Some(repo),
        &[
            "diff",
            "--no-index",
            "--no-color",
            "--unified=3",
            "--",
            "/dev/null",
            path,
        ],
        &[1],
    )
}

pub fn stage_paths(repo: &str, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    args.extend(paths.iter().map(|s| s.as_str()));
    super::run_git(Some(repo), &args).map(|_| ())
}

pub fn unstage_paths(repo: &str, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    args.extend(paths.iter().map(|s| s.as_str()));
    super::run_git(Some(repo), &args).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 真实输出样本（git 2.50）
    #[test]
    fn parse_name_status_with_rename() {
        let raw = "A\0bin2.dat\0A\0new.txt\0R100\0a.txt\0src/a.txt\0M\0src/b.txt\0";
        let out = parse_name_status_z(raw);
        assert_eq!(out.len(), 4);
        assert_eq!(out[0], ('A', None, "bin2.dat".to_string()));
        assert_eq!(
            out[2],
            ('R', Some("a.txt".to_string()), "src/a.txt".to_string())
        );
        assert_eq!(out[3], ('M', None, "src/b.txt".to_string()));
    }

    #[test]
    fn parse_numstat_with_rename_and_binary() {
        let raw = "-\t-\tbin2.dat\01\t0\tnew.txt\00\t0\t\0a.txt\0src/a.txt\01\t1\tsrc/b.txt\0";
        let out = parse_numstat_z(raw);
        assert_eq!(out.len(), 4);
        assert_eq!(out[0], (None, None, None, "bin2.dat".to_string()));
        assert_eq!(out[1], (Some(1), Some(0), None, "new.txt".to_string()));
        assert_eq!(
            out[2],
            (Some(0), Some(0), Some("a.txt".to_string()), "src/a.txt".to_string())
        );
        assert_eq!(out[3], (Some(1), Some(1), None, "src/b.txt".to_string()));
    }

    #[test]
    fn parse_log_records() {
        let raw = "e38f8770123\x1fe38f877\x1fT\x1ft@t.t\x1f1793176148\x1ffeature work: add stuff\nb1bd7890123\x1fb1bd789\x1fT\x1ft@t.t\x1f1793176140\x1finit";
        let commits = parse_log(raw);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].short_sha, "e38f877");
        assert_eq!(commits[0].subject, "feature work: add stuff");
        assert_eq!(commits[0].timestamp, 1793176148);
        assert_eq!(commits[1].subject, "init");
    }

    #[test]
    fn parse_log_empty() {
        assert!(parse_log("").is_empty());
    }

    /// 端到端：真实 git 仓库上的 compare（依赖系统 git）。
    #[test]
    fn compare_on_real_repo() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        let run = |args: &[&str]| super::super::run_git(Some(repo), args).unwrap();
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "t@t.t"]);
        run(&["config", "user.name", "T"]);
        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();
        std::fs::write(dir.path().join("b.txt"), "world\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "init"]);
        run(&["checkout", "-qb", "feature"]);
        run(&["mv", "a.txt", "moved.txt"]);
        std::fs::write(dir.path().join("b.txt"), "world\nmore\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "feature work"]);

        let result = compare_refs(repo, "main", "feature").unwrap();
        assert!(result.merge_base.is_some());
        assert_eq!(result.commits.len(), 1);
        assert_eq!(result.commits[0].subject, "feature work");
        assert_eq!(result.files.len(), 2);
        let moved = result.files.iter().find(|f| f.status == 'R').unwrap();
        assert_eq!(moved.old_path.as_deref(), Some("a.txt"));
        assert_eq!(moved.new_path, "moved.txt");
        assert_eq!(result.total_additions, 1);
        assert_eq!(result.total_deletions, 0);

        // rename 的单文件 diff 应包含 rename from/to 头
        let text = diff_refs_file(repo, "main", "feature", "moved.txt", moved.old_path.as_deref()).unwrap();
        assert!(text.contains("rename from a.txt"), "actual: {text}");
        assert!(text.contains("rename to moved.txt"));

        // verify_ref 对无效引用报错
        assert!(compare_refs(repo, "main", "no-such-branch").is_err());
    }
}
