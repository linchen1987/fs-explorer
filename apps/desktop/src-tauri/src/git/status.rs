//! `git status --porcelain=v2 --branch -z` 的执行与解析。
//!
//! 记录格式（NUL 分隔）：
//! - `# branch.oid <sha>|（initial）`
//! - `# branch.head <name>|（detached）`
//! - `# branch.upstream <upstream>`
//! - `# branch.ab +<ahead> -<behind>`
//! - `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
//! - `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <score> <newPath>\0<oldPath>`
//! - `u <XY> <sub> ... <path>`（合并冲突）
//! - `? <path>`（未跟踪）

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub path: String,
    pub old_path: Option<String>,
    pub index_status: char,
    pub worktree_status: char,
    pub untracked: bool,
    pub conflicted: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: Option<i64>,
    pub behind: Option<i64>,
    pub entries: Vec<StatusEntry>,
}

pub fn status(repo: &str) -> Result<WorktreeStatus, String> {
    let raw = super::run_git(
        Some(repo),
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    parse_status_v2(&raw)
}

pub fn parse_status_v2(raw: &str) -> Result<WorktreeStatus, String> {
    let mut st = WorktreeStatus::default();
    let tokens: Vec<&str> = raw.split('\0').collect();
    let mut i = 0usize;
    while i < tokens.len() {
        let t = tokens[i];
        i += 1;
        if t.is_empty() {
            continue;
        }
        if let Some(rest) = t.strip_prefix("# branch.oid ") {
            st.head_sha = if rest == "(initial)" {
                None
            } else {
                Some(rest.to_string())
            };
        } else if let Some(rest) = t.strip_prefix("# branch.head ") {
            if rest == "(detached)" {
                st.detached = true;
                st.branch = None;
            } else {
                st.branch = Some(rest.to_string());
            }
        } else if let Some(rest) = t.strip_prefix("# branch.upstream ") {
            st.upstream = Some(rest.to_string());
        } else if let Some(rest) = t.strip_prefix("# branch.ab ") {
            let mut parts = rest.split_whitespace();
            st.ahead = parts
                .next()
                .and_then(|s| s.trim_start_matches('+').parse::<i64>().ok());
            st.behind = parts
                .next()
                .and_then(|s| s.trim_start_matches('-').parse::<i64>().ok());
        } else if t.starts_with("# ") {
            // 其他 header（如 stash.count）忽略
            continue;
        } else if t.starts_with("1 ") || t.starts_with("2 ") || t.starts_with("u ") {
            let bytes = t.as_bytes();
            if bytes.len() < 4 {
                continue;
            }
            let x = bytes[2] as char;
            let y = bytes[3] as char;
            let is_rename = bytes[0] == b'2';
            let is_unmerged = bytes[0] == b'u';
            // 路径可能包含空格：按固定字段数切分，最后一段整体作为路径
            let n = match bytes[0] {
                b'1' => 9,
                b'2' => 10,
                _ => 11,
            };
            let parts: Vec<&str> = t.splitn(n, ' ').collect();
            let path = parts.last().copied().unwrap_or_default().to_string();
            if path.is_empty() {
                continue;
            }
            // rename 记录的 old_path 在下一个 NUL token 中
            let old_path = if is_rename {
                let op = tokens.get(i).copied().unwrap_or_default();
                i += 1;
                if op.is_empty() {
                    None
                } else {
                    Some(op.to_string())
                }
            } else {
                None
            };
            let (ix, wt) = if is_unmerged { ('U', 'U') } else { (x, y) };
            st.entries.push(StatusEntry {
                path,
                old_path,
                index_status: ix,
                worktree_status: wt,
                untracked: false,
                conflicted: is_unmerged,
            });
        } else if let Some(rest) = t.strip_prefix("? ") {
            st.entries.push(StatusEntry {
                path: rest.to_string(),
                old_path: None,
                index_status: '?',
                worktree_status: '?',
                untracked: true,
                conflicted: false,
            });
        }
        // "! "（ignored）默认不会出现，忽略
    }
    Ok(st)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 真实输出样本（git 2.50，见仓库 fixture）
    #[test]
    fn parse_normal_and_headers() {
        let raw = "# branch.oid e38f877e504c330e4b38fb7971d4e8adf8ec6864\
\0# branch.head feature\
\0# branch.upstream origin/feature\
\0# branch.ab +2 -1\
\0# stash.count 1\
\01 M. N... 100644 100644 100644 aaa bbb new.txt\
\01 .M N... 100644 100644 100644 ccc ccc src/b.txt\
\0? untracked.txt\0";
        let st = parse_status_v2(raw).unwrap();
        assert_eq!(st.branch.as_deref(), Some("feature"));
        assert_eq!(st.head_sha.as_deref(), Some("e38f877e504c330e4b38fb7971d4e8adf8ec6864"));
        assert_eq!(st.upstream.as_deref(), Some("origin/feature"));
        assert_eq!(st.ahead, Some(2));
        assert_eq!(st.behind, Some(1));
        assert_eq!(st.entries.len(), 3);
        let e0 = &st.entries[0];
        assert_eq!(e0.path, "new.txt");
        assert_eq!(e0.index_status, 'M');
        assert_eq!(e0.worktree_status, '.');
        assert!(!e0.untracked);
        let e2 = &st.entries[2];
        assert!(e2.untracked);
        assert_eq!(e2.path, "untracked.txt");
    }

    #[test]
    fn parse_rename_and_initial_and_detached() {
        // staged rename: `2` 记录新路径在前，旧路径在下一个 NUL token
        let raw = "# branch.oid (initial)\0# branch.head main\0\
2 R. N... 100644 100644 100644 aaa bbb R100 new.txt\0old.txt\0";
        let st = parse_status_v2(raw).unwrap();
        assert_eq!(st.head_sha, None);
        assert_eq!(st.branch.as_deref(), Some("main"));
        assert_eq!(st.entries.len(), 1);
        let e = &st.entries[0];
        assert_eq!(e.path, "new.txt");
        assert_eq!(e.old_path.as_deref(), Some("old.txt"));
        assert_eq!(e.index_status, 'R');

        let raw2 = "# branch.oid abc123\0# branch.head (detached)\0\
u UU N... 100644 100644 100644 100644 100644 aaa bbb ccc f.txt\0";
        let st2 = parse_status_v2(raw2).unwrap();
        assert!(st2.detached);
        assert_eq!(st2.branch, None);
        assert_eq!(st2.entries.len(), 1);
        assert!(st2.entries[0].conflicted);
        assert_eq!(st2.entries[0].index_status, 'U');
    }

    #[test]
    fn parse_path_with_spaces() {
        let raw = "1 .M N... 100644 100644 100644 aaa bbb my file with space.txt\0";
        let st = parse_status_v2(raw).unwrap();
        assert_eq!(st.entries[0].path, "my file with space.txt");
    }
}
