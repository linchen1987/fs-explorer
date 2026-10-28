//! 分支列表：`git for-each-ref refs/heads refs/remotes`。

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub ref_name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub sha: String,
    pub last_timestamp: i64,
    pub last_subject: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BranchList {
    pub current: Option<String>,
    pub default_branch: Option<String>,
    pub branches: Vec<Branch>,
}

pub fn list_branches(repo: &str) -> Result<BranchList, String> {
    let fmt = "%(HEAD)%00%(refname)%00%(refname:short)%00%(objectname:short)%00%(committerdate:unix)%00%(subject)";
    let format_arg = format!("--format={fmt}");
    let raw = super::run_git(
        Some(repo),
        &["for-each-ref", &format_arg, "refs/heads", "refs/remotes"],
    )?;
    let mut list = BranchList::default();
    for line in raw.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = line.split('\0').collect();
        if f.len() != 6 {
            continue;
        }
        let is_head = f[0].contains('*');
        let ref_name = f[1].to_string();
        let is_remote = ref_name.starts_with("refs/remotes/");
        let name = f[2].to_string();
        // 跳过 refs/remotes/origin/HEAD 这类符号引用
        if is_remote && name.ends_with("/HEAD") {
            continue;
        }
        list.branches.push(Branch {
            name,
            ref_name,
            is_remote,
            is_head,
            sha: f[3].to_string(),
            last_timestamp: f[4].parse().unwrap_or(0),
            last_subject: f[5].to_string(),
        });
    }
    list.current = list
        .branches
        .iter()
        .find(|b| b.is_head && !b.is_remote)
        .map(|b| b.name.clone());

    // 推荐基准分支：origin/HEAD → main → master → 首个本地分支
    list.default_branch = default_branch(repo, &list);
    Ok(list)
}

fn default_branch(repo: &str, list: &BranchList) -> Option<String> {
    let origin_head = super::run_git_ext(
        Some(repo),
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        &[1, 128],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

    let has = |name: &str| list.branches.iter().any(|b| b.name == name);
    if let Some(oh) = origin_head.filter(|s| has(s)) {
        return Some(oh);
    }
    for cand in ["main", "master", "trunk", "develop"] {
        if has(cand) {
            return Some(cand.to_string());
        }
    }
    list.branches.iter().find(|b| !b.is_remote).map(|b| b.name.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_for_each_ref_output() {
        // 真实输出样本：`%(HEAD)` 为 "* " 或 "  "，字段以 \0 分隔，记录以 \n 分隔
        let raw = "* \0refs/heads/feature\0feature\0e38f877\01793176148\0feature work: add stuff\n  \0refs/heads/main\0main\0b1bd789\01793176148\0init\n";
        // parse 逻辑在 list_branches 中与命令耦合，这里测试关键切分
        let lines: Vec<&str> = raw.split('\n').filter(|l| !l.trim().is_empty()).collect();
        assert_eq!(lines.len(), 2);
        let f: Vec<&str> = lines[0].split('\0').collect();
        assert_eq!(f.len(), 6);
        assert!(f[0].contains('*'));
        assert_eq!(f[2], "feature");
    }
}
