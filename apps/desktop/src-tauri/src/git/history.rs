//! 提交历史、提交涉及文件及单文件 patch。

use super::diff::{Commit, FileChange, parse_name_status_z, parse_numstat_z, verify_ref};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommit {
    #[serde(flatten)]
    pub commit: Commit,
    /// 完整父提交 sha，按 git 的顺序排列；第一个为 first parent。
    pub parent_shas: Vec<String>,
    /// 指向该提交的分支/tag/HEAD 装饰（短名）。
    pub refs: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub commits: Vec<HistoryCommit>,
    pub has_more: bool,
    pub next_skip: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitChanges {
    pub files: Vec<FileChange>,
    pub total_additions: i64,
    pub total_deletions: i64,
}

fn parse_decorations(raw: &str) -> Vec<String> {
    raw.split(", ")
        .filter_map(|s| {
            let s = s.trim().strip_prefix("HEAD -> ").unwrap_or(s.trim());
            (!s.is_empty()).then(|| s.to_string())
        })
        .collect()
}

pub fn parse_history_log(raw: &str) -> Vec<HistoryCommit> {
    raw.split('\x1e')
        .map(|rec| rec.trim_matches(['\r', '\n']))
        .filter(|rec| !rec.is_empty())
        .filter_map(|rec| {
            let f: Vec<&str> = rec.splitn(8, '\x1f').collect();
            if f.len() != 8 {
                return None;
            }
            Some(HistoryCommit {
                commit: Commit {
                    sha: f[0].to_string(),
                    short_sha: f[1].to_string(),
                    author_name: f[3].to_string(),
                    author_email: f[4].to_string(),
                    timestamp: f[5].parse().ok()?,
                    subject: f[6].to_string(),
                },
                parent_shas: f[2]
                    .split_whitespace()
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect(),
                refs: parse_decorations(f[7]),
            })
        })
        .collect()
}

/// 分页读取提交历史。revision=None 时读取所有本地及远程跟踪分支。
pub fn list_commits(
    repo: &str,
    revision: Option<&str>,
    skip: usize,
    limit: usize,
) -> Result<HistoryPage, String> {
    let take = limit.clamp(1, 200);
    let fmt = "%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%D%x1e";
    let format_arg = format!("--format={fmt}");
    let max_count = format!("--max-count={}", take + 1);
    let skip_arg = format!("--skip={skip}");
    let mut args = vec![
        "log",
        "--no-color",
        "--date-order",
        "--decorate=short",
        &format_arg,
        &max_count,
        &skip_arg,
    ];
    if let Some(rev) = revision.filter(|r| !r.is_empty()) {
        verify_ref(repo, rev)?;
        args.push(rev);
    } else {
        args.push("--all");
    }
    // 明确分隔 revision 与路径，避免仓库中的同名文件造成歧义。
    args.push("--");

    let raw = super::run_git(Some(repo), &args)?;
    let mut commits = parse_history_log(&raw);
    let has_more = commits.len() > take;
    commits.truncate(take);
    Ok(HistoryPage {
        next_skip: skip + commits.len(),
        commits,
        has_more,
    })
}

fn first_parent(repo: &str, sha: &str) -> Result<Option<String>, String> {
    let raw = super::run_git(Some(repo), &["rev-list", "--parents", "-n", "1", sha])?;
    Ok(raw.split_whitespace().nth(1).map(str::to_string))
}

fn commit_diff_args<'a>(sha: &'a str, first_parent: Option<&'a str>, patch: bool) -> Vec<&'a str> {
    let mut args = if first_parent.is_some() {
        // 普通及合并提交显式与第一父提交比较。diff-tree -m --first-parent
        // 仍会输出所有 parent 的记录，不能用于这里。
        vec!["diff", "--no-color", "-M", "-z"]
    } else {
        // 根提交没有可比较的 parent，与空树比较。
        vec![
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--no-color",
            "-r",
            "-M",
            "-z",
        ]
    };
    if patch {
        args.extend(["-p", "--unified=3"]);
    }
    if let Some(parent) = first_parent {
        args.push(parent);
    }
    args.push(sha);
    args
}

fn commit_changes(repo: &str, sha: &str) -> Result<CommitChanges, String> {
    verify_ref(repo, sha)?;
    let parent = first_parent(repo, sha)?;
    let mut ns_args = commit_diff_args(sha, parent.as_deref(), false);
    ns_args.extend(["--name-status", "--"]);
    let mut stat_args = commit_diff_args(sha, parent.as_deref(), false);
    stat_args.extend(["--numstat", "--"]);
    let ns = super::run_git(Some(repo), &ns_args)?;
    let stats = super::run_git(Some(repo), &stat_args)?;

    let mut stat_map: HashMap<String, (Option<i64>, Option<i64>)> = HashMap::new();
    for (a, d, _old, new) in parse_numstat_z(&stats) {
        stat_map.insert(new, (a, d));
    }

    let mut files = Vec::new();
    let mut total_additions = 0;
    let mut total_deletions = 0;
    for (status, old_path, new_path) in parse_name_status_z(&ns) {
        let (additions, deletions) = stat_map.get(&new_path).copied().unwrap_or((None, None));
        total_additions += additions.unwrap_or(0);
        total_deletions += deletions.unwrap_or(0);
        files.push(FileChange {
            status,
            old_path,
            new_path,
            additions,
            deletions,
        });
    }
    Ok(CommitChanges {
        files,
        total_additions,
        total_deletions,
    })
}

pub fn get_commit_changes(repo: &str, sha: &str) -> Result<CommitChanges, String> {
    commit_changes(repo, sha)
}

/// 单个提交中某文件的 patch。rename 同时传入新旧 pathspec。
pub fn diff_commit_file(
    repo: &str,
    sha: &str,
    path: &str,
    old_path: Option<&str>,
) -> Result<String, String> {
    verify_ref(repo, sha)?;
    let parent = first_parent(repo, sha)?;
    let mut args = commit_diff_args(sha, parent.as_deref(), true);
    args.extend(["--", path]);
    if let Some(old) = old_path {
        if old != path {
            args.push(old);
        }
    }
    super::run_git(Some(repo), &args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_history_with_parents_and_decorations() {
        let raw = concat!(
            "aaaabbbb\x1faaaa\x1fcccc dddd\x1fT\x1ft@t.t\x1f1793176148\x1fmerge feature\x1fHEAD -> main, tag: v1.0\x1e\n",
            "ccccdddd\x1fcccc\x1f\x1fT\x1ft@t.t\x1f1793176140\x1froot\x1f\x1e\n",
        );
        let commits = parse_history_log(raw);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].commit.short_sha, "aaaa");
        assert_eq!(commits[0].parent_shas, ["cccc", "dddd"]);
        assert_eq!(commits[0].refs, ["main", "tag: v1.0"]);
        assert!(commits[1].parent_shas.is_empty());
        assert!(commits[1].refs.is_empty());
    }

    #[test]
    fn history_and_commit_diff_on_real_repo() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        let run = |args: &[&str]| super::super::run_git(Some(repo), args).unwrap();
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "t@t.t"]);
        run(&["config", "user.name", "T"]);
        std::fs::write(dir.path().join("a.txt"), "root\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "root"]);

        run(&["checkout", "-qb", "feature"]);
        std::fs::write(dir.path().join("feature.txt"), "feature\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "feature"]);
        run(&["checkout", "-q", "main"]);
        std::fs::write(dir.path().join("main.txt"), "main\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "main work"]);
        run(&["merge", "-q", "--no-ff", "feature", "-m", "merge feature"]);

        let first = list_commits(repo, Some("HEAD"), 0, 2).unwrap();
        assert_eq!(first.commits.len(), 2);
        assert!(first.has_more);
        assert_eq!(first.next_skip, 2);
        let second = list_commits(repo, Some("HEAD"), first.next_skip, 2).unwrap();
        assert_eq!(second.commits.len(), 2);
        assert!(!second.has_more);
        let all = list_commits(repo, None, 0, 20).unwrap();
        let merge = all
            .commits
            .iter()
            .find(|c| c.commit.subject == "merge feature")
            .unwrap();
        assert_eq!(merge.parent_shas.len(), 2);
        assert!(merge.refs.iter().any(|r| r == "main" || r == "HEAD"));
        let merge_changes = get_commit_changes(repo, &merge.commit.sha).unwrap();
        assert_eq!(merge_changes.files.len(), 1);
        assert_eq!(merge_changes.files[0].new_path, "feature.txt");
        let merge_patch = diff_commit_file(repo, &merge.commit.sha, "feature.txt", None).unwrap();
        assert!(merge_patch.contains("+feature"));

        let root = all
            .commits
            .iter()
            .find(|c| c.commit.subject == "root")
            .unwrap();
        let changes = get_commit_changes(repo, &root.commit.sha).unwrap();
        assert_eq!(changes.files.len(), 1);
        assert_eq!(changes.files[0].status, 'A');
        assert_eq!(changes.total_additions, 1);
        let patch = diff_commit_file(repo, &root.commit.sha, "a.txt", None).unwrap();
        assert!(patch.contains("new file mode"));
        assert!(patch.contains("+root"));

        run(&["mv", "a.txt", "renamed.txt"]);
        run(&["commit", "-qm", "rename root file"]);
        let renamed = list_commits(repo, Some("HEAD"), 0, 1).unwrap();
        let sha = &renamed.commits[0].commit.sha;
        let rename_changes = get_commit_changes(repo, sha).unwrap();
        assert_eq!(rename_changes.files[0].status, 'R');
        assert_eq!(rename_changes.files[0].old_path.as_deref(), Some("a.txt"));
        let rename_patch = diff_commit_file(repo, sha, "renamed.txt", Some("a.txt")).unwrap();
        assert!(rename_patch.contains("rename from a.txt"));
        assert!(rename_patch.contains("rename to renamed.txt"));

        assert!(list_commits(repo, Some("missing-ref"), 0, 20).is_err());
    }
}
