//! 仓库文件列表、读取与文本保存。

use base64::{Engine as _, engine::general_purpose};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

const TEXT_LIMIT: u64 = 2 * 1024 * 1024;
const MEDIA_LIMIT: u64 = 32 * 1024 * 1024;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub size: u64,
    pub kind: String,
    pub text: Option<String>,
    pub data: Option<String>,
    pub mime: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileTreePage {
    pub nodes: Vec<FileTreeNode>,
    pub total: usize,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    pub paths: Vec<String>,
    pub total: usize,
}

/// 只读取一个目录的直接子节点；ignored 文件与目录不做过滤，仅排除 .git。
pub fn list_directory(repo: &str, parent: &str, limit: usize) -> Result<FileTreePage, String> {
    let directory = resolve_directory(repo, parent)?;
    let prefix = if parent.is_empty() {
        String::new()
    } else {
        format!("{parent}/")
    };
    let mut directories = Vec::new();
    let mut files = Vec::new();

    for entry in fs::read_dir(&directory)
        .map_err(|e| format!("无法读取目录 {}: {e}", display_parent(parent)))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败 {}: {e}", display_parent(parent)))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.eq_ignore_ascii_case(".git") {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|e| format!("无法读取文件类型 {prefix}{name}: {e}"))?;
        let kind = if file_type.is_dir() {
            "directory"
        } else {
            "file"
        };
        let node = FileTreeNode {
            path: format!("{prefix}{name}"),
            name,
            kind: kind.to_string(),
        };
        if kind == "directory" {
            directories.push(node);
        } else {
            files.push(node);
        }
    }

    directories.sort_unstable_by(|a: &FileTreeNode, b| a.name.cmp(&b.name));
    files.sort_unstable_by(|a: &FileTreeNode, b| a.name.cmp(&b.name));
    let total = directories.len() + files.len();
    directories.extend(files);
    directories.truncate(limit);
    Ok(FileTreePage {
        nodes: directories,
        total,
    })
}

/// 主动筛选时才遍历工作区；后端只向前端传输需要渲染的结果。
pub fn search_files(repo: &str, query: &str, limit: usize) -> Result<FileSearchResult, String> {
    let normalized = query.trim().to_lowercase();
    if normalized.is_empty() {
        return Ok(FileSearchResult {
            paths: Vec::new(),
            total: 0,
        });
    }

    let root = repo_root(repo)?;
    let mut pending = vec![root.clone()];
    let mut matches = Vec::new();
    let mut total = 0;

    while let Some(directory) = pending.pop() {
        let mut entries = fs::read_dir(&directory)
            .map_err(|e| format!("无法搜索目录 {}: {e}", directory.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("无法读取搜索结果: {e}"))?;
        entries.sort_unstable_by_key(|entry| entry.file_name());

        for entry in entries.iter().rev() {
            let name = entry.file_name();
            if name.to_string_lossy().eq_ignore_ascii_case(".git") {
                continue;
            }
            let file_type = entry
                .file_type()
                .map_err(|e| format!("无法读取文件类型 {}: {e}", entry.path().display()))?;
            if file_type.is_dir() {
                pending.push(entry.path());
            }
        }

        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.eq_ignore_ascii_case(".git") {
                continue;
            }
            let file_type = entry
                .file_type()
                .map_err(|e| format!("无法读取文件类型 {}: {e}", entry.path().display()))?;
            if file_type.is_dir() {
                continue;
            }
            let path = entry
                .path()
                .strip_prefix(&root)
                .map_err(|e| format!("无法解析文件路径 {}: {e}", entry.path().display()))?
                .to_string_lossy()
                .replace('\\', "/");
            if path.to_lowercase().contains(&normalized) {
                total += 1;
                if matches.len() < limit {
                    matches.push(path);
                }
            }
        }
    }

    Ok(FileSearchResult {
        paths: matches,
        total,
    })
}

fn display_parent(parent: &str) -> &str {
    if parent.is_empty() {
        "项目根目录"
    } else {
        parent
    }
}

pub fn read_file(repo: &str, path: &str) -> Result<FileContent, String> {
    let full_path = resolve_file(repo, path)?;
    let metadata = fs::metadata(&full_path).map_err(|e| format!("无法读取文件信息 {path}: {e}"))?;

    if let Some((kind, mime)) = media_type(path) {
        if metadata.len() > MEDIA_LIMIT {
            return Err(format!("媒体文件超过 32 MiB 上限，无法读取: {path}"));
        }
        let bytes = fs::read(&full_path).map_err(|e| format!("读取文件失败 {path}: {e}"))?;
        let size = bytes.len() as u64;
        if size > MEDIA_LIMIT {
            return Err(format!("媒体文件超过 32 MiB 上限，无法读取: {path}"));
        }
        return Ok(FileContent {
            path: path.to_string(),
            size,
            kind: kind.to_string(),
            text: None,
            data: Some(general_purpose::STANDARD.encode(bytes)),
            mime: Some(mime.to_string()),
        });
    }

    if metadata.len() > TEXT_LIMIT {
        return Err(format!("非媒体文件超过 2 MiB 上限，无法读取: {path}"));
    }
    let bytes = fs::read(&full_path).map_err(|e| format!("读取文件失败 {path}: {e}"))?;
    let size = bytes.len() as u64;
    match std::str::from_utf8(&bytes) {
        Ok(text) if !text.contains('\0') => {
            if size > TEXT_LIMIT {
                return Err(format!("文本文件超过 2 MiB 上限，无法读取: {path}"));
            }
            Ok(FileContent {
                path: path.to_string(),
                size,
                kind: "text".to_string(),
                text: Some(text.to_string()),
                data: None,
                mime: None,
            })
        }
        _ => Ok(FileContent {
            path: path.to_string(),
            size,
            kind: "binary".to_string(),
            text: None,
            data: None,
            mime: None,
        }),
    }
}

/// 保存已存在的 UTF-8 文本文件；`fs::write` 不会更改现有文件权限。
pub fn save_file(repo: &str, path: &str, content: &str) -> Result<(), String> {
    if content.as_bytes().len() as u64 > TEXT_LIMIT {
        return Err(format!("文本内容超过 2 MiB 上限，无法保存: {path}"));
    }
    let current = read_file(repo, path)?;
    if current.kind != "text" || current.text.is_none() {
        return Err(format!("只能保存 UTF-8 文本文件: {path}"));
    }

    // 写入前重新解析，确保最终写入路径仍位于仓库内且为普通文件。
    let full_path = resolve_file(repo, path)?;
    fs::write(&full_path, content).map_err(|e| format!("保存文件失败 {path}: {e}"))
}

fn repo_root(repo: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(repo).map_err(|e| format!("无法访问仓库 {repo}: {e}"))?;
    if !root.is_dir() {
        return Err(format!("仓库路径不是目录: {repo}"));
    }
    Ok(root)
}

/// 校验目录路径，防止通过 .. 或符号链接访问仓库及 .git 之外的内容。
fn resolve_directory(repo: &str, parent: &str) -> Result<PathBuf, String> {
    let root = repo_root(repo)?;
    if parent.is_empty() {
        return Ok(root);
    }
    let relative = Path::new(parent);
    if relative.is_absolute() {
        return Err(format!("目录路径必须是仓库内相对路径: {parent}"));
    }
    for component in relative.components() {
        match component {
            Component::Normal(part) if part.to_string_lossy().eq_ignore_ascii_case(".git") => {
                return Err(format!("目录路径不能包含 .git 组件: {parent}"));
            }
            Component::Normal(_) => {}
            Component::ParentDir => {
                return Err(format!("目录路径不能包含 .. 组件: {parent}"));
            }
            _ => {
                return Err(format!("目录路径必须是仓库内普通相对路径: {parent}"));
            }
        }
    }

    let full_path = fs::canonicalize(root.join(relative))
        .map_err(|e| format!("目录不存在或无法访问 {parent}: {e}"))?;
    if !full_path.starts_with(&root) {
        return Err(format!("目录路径超出仓库根目录: {parent}"));
    }
    let git_dir = fs::canonicalize(root.join(".git")).unwrap_or_else(|_| root.join(".git"));
    if full_path.starts_with(&git_dir) {
        return Err(format!("目录路径不能指向 .git 内容: {parent}"));
    }
    if !full_path.is_dir() {
        return Err(format!("路径不是目录: {parent}"));
    }
    Ok(full_path)
}

/// 校验相对路径，并解析符号链接后确认目标仍为仓库内普通文件。
fn resolve_file(repo: &str, path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let relative = Path::new(path);
    if relative.is_absolute() {
        return Err(format!("文件路径必须是仓库内相对路径: {path}"));
    }
    for component in relative.components() {
        match component {
            Component::Normal(part) if part.to_string_lossy().eq_ignore_ascii_case(".git") => {
                return Err(format!("文件路径不能包含 .git 组件: {path}"));
            }
            Component::Normal(_) => {}
            Component::ParentDir => {
                return Err(format!("文件路径不能包含 .. 组件: {path}"));
            }
            _ => {
                return Err(format!("文件路径必须是仓库内普通相对路径: {path}"));
            }
        }
    }

    let root = fs::canonicalize(repo).map_err(|e| format!("无法访问仓库 {repo}: {e}"))?;
    if !root.is_dir() {
        return Err(format!("仓库路径不是目录: {repo}"));
    }
    let full_path = fs::canonicalize(root.join(relative))
        .map_err(|e| format!("文件不存在或无法访问 {path}: {e}"))?;
    if !full_path.starts_with(&root) {
        return Err(format!("文件路径超出仓库根目录: {path}"));
    }
    let git_dir = fs::canonicalize(root.join(".git")).unwrap_or_else(|_| root.join(".git"));
    if full_path.starts_with(&git_dir) {
        return Err(format!("文件路径不能指向 .git 内容: {path}"));
    }
    if !fs::metadata(&full_path)
        .map_err(|e| format!("无法读取文件信息 {path}: {e}"))?
        .is_file()
    {
        return Err(format!("路径不是普通文件: {path}"));
    }
    Ok(full_path)
}

/// 按扩展名识别媒体；SVG 不在此处，仍按文本内容检测。
fn media_type(path: &str) -> Option<(&'static str, &'static str)> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some(("image", "image/png")),
        "jpg" | "jpeg" => Some(("image", "image/jpeg")),
        "gif" => Some(("image", "image/gif")),
        "webp" => Some(("image", "image/webp")),
        "bmp" => Some(("image", "image/bmp")),
        "ico" => Some(("image", "image/x-icon")),
        "avif" => Some(("image", "image/avif")),
        "mp4" => Some(("video", "video/mp4")),
        "webm" => Some(("video", "video/webm")),
        "mov" => Some(("video", "video/quicktime")),
        "m4v" => Some(("video", "video/x-m4v")),
        "ogv" | "ogg" => Some(("video", "video/ogg")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        crate::git::run_git(Some(repo), &["init", "-q"]).unwrap();
        let excludes = dir.path().join(".git/empty-excludes");
        fs::write(&excludes, "").unwrap();
        crate::git::run_git(
            Some(repo),
            &["config", "core.excludesFile", excludes.to_str().unwrap()],
        )
        .unwrap();
        dir
    }

    #[test]
    fn lists_tracked_untracked_and_ignored_files() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        fs::create_dir(dir.path().join("nested")).unwrap();
        fs::create_dir(dir.path().join("ignored-dir")).unwrap();
        fs::write(
            dir.path().join(".gitignore"),
            "ignored-by-repo.fixture\nignored-dir/\n",
        )
        .unwrap();
        fs::write(dir.path().join("tracked.txt"), "tracked").unwrap();
        fs::write(dir.path().join("nested/child.txt"), "child").unwrap();
        crate::git::run_git(
            Some(repo),
            &["add", "--", ".gitignore", "tracked.txt", "nested/child.txt"],
        )
        .unwrap();
        fs::write(dir.path().join("untracked.txt"), "untracked").unwrap();
        fs::write(dir.path().join("ignored-by-repo.fixture"), "ignored").unwrap();
        fs::write(dir.path().join("ignored-dir/child.txt"), "ignored").unwrap();

        let root = list_directory(repo, "", 200).unwrap();
        let entries: Vec<(&str, &str)> = root
            .nodes
            .iter()
            .map(|node| (node.path.as_str(), node.kind.as_str()))
            .collect();
        assert_eq!(
            entries,
            vec![
                ("ignored-dir", "directory"),
                ("nested", "directory"),
                (".gitignore", "file"),
                ("ignored-by-repo.fixture", "file"),
                ("tracked.txt", "file"),
                ("untracked.txt", "file"),
            ]
        );
        assert_eq!(root.total, 6);
        assert!(!root.nodes.iter().any(|node| node.path == ".git"));

        let nested = list_directory(repo, "nested", 200).unwrap();
        assert_eq!(nested.nodes[0].path, "nested/child.txt");
        assert_eq!(nested.nodes[0].kind, "file");
        let first = list_directory(repo, "", 1).unwrap();
        assert_eq!(first.total, 6);
        assert_eq!(first.nodes.len(), 1);
        assert_eq!(first.nodes[0].path, "ignored-dir");

        let search = search_files(repo, "CHILD", 200).unwrap();
        assert_eq!(search.total, 2);
        assert_eq!(
            search.paths,
            vec!["ignored-dir/child.txt", "nested/child.txt"]
        );
        let limited = search_files(repo, "child", 1).unwrap();
        assert_eq!(limited.total, 2);
        assert_eq!(limited.paths, vec!["ignored-dir/child.txt"]);
    }

    #[test]
    fn lists_and_reads_merge_conflicted_file() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        let run = |args: &[&str]| crate::git::run_git(Some(repo), args).unwrap();
        run(&["config", "user.email", "t@t.t"]);
        run(&["config", "user.name", "T"]);
        fs::write(dir.path().join("conflict.txt"), "base\n").unwrap();
        run(&["add", "conflict.txt"]);
        run(&["commit", "-qm", "base"]);
        let base = run(&["symbolic-ref", "--short", "HEAD"]);

        run(&["checkout", "-qb", "feature"]);
        fs::write(dir.path().join("conflict.txt"), "feature\n").unwrap();
        run(&["commit", "-qam", "feature"]);
        run(&["checkout", "-q", base.trim()]);
        fs::write(dir.path().join("conflict.txt"), "current\n").unwrap();
        run(&["commit", "-qam", "current"]);
        assert!(crate::git::run_git(Some(repo), &["merge", "feature"]).is_err());

        let root = list_directory(repo, "", 200).unwrap();
        assert_eq!(root.nodes.len(), 1);
        assert_eq!(root.nodes[0].path, "conflict.txt");
        let file = read_file(repo, "conflict.txt").unwrap();
        let text = file.text.as_deref().unwrap();
        assert!(text.contains("<<<<<<<"));
        assert!(text.contains("current"));
        assert!(text.contains("feature"));
        assert!(text.contains(">>>>>>>"));
        let status = crate::git::status::status(repo).unwrap();
        assert!(
            status
                .entries
                .iter()
                .any(|entry| { entry.path == "conflict.txt" && entry.conflicted })
        );
    }

    #[test]
    fn reads_and_saves_utf8_text() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        let path = dir.path().join("note.txt");
        fs::write(&path, "你好\nhello\n").unwrap();

        let file = read_file(repo, "note.txt").unwrap();
        assert_eq!(file.path, "note.txt");
        assert_eq!(file.size, "你好\nhello\n".len() as u64);
        assert_eq!(file.kind, "text");
        assert_eq!(file.text.as_deref(), Some("你好\nhello\n"));
        assert_eq!(file.data, None);
        assert_eq!(file.mime, None);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        }
        save_file(repo, "note.txt", "更新后的内容\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "更新后的内容\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o640
            );
        }

        fs::write(
            dir.path().join("vector.svg"),
            "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        )
        .unwrap();
        assert_eq!(read_file(repo, "vector.svg").unwrap().kind, "text");
    }

    #[test]
    fn identifies_image_and_binary_content() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        let png = [0x89, b'P', b'N', b'G', 0, 0xff];
        fs::write(dir.path().join("pixel.PNG"), png).unwrap();
        let image = read_file(repo, "pixel.PNG").unwrap();
        assert_eq!(image.kind, "image");
        assert_eq!(image.text, None);
        assert_eq!(
            image.data.as_deref(),
            Some(general_purpose::STANDARD.encode(png).as_str())
        );
        assert_eq!(image.mime.as_deref(), Some("image/png"));

        fs::write(dir.path().join("data.bin"), [0xff, 0x00, 0xfe]).unwrap();
        let binary = read_file(repo, "data.bin").unwrap();
        assert_eq!(binary.kind, "binary");
        assert_eq!(binary.text, None);
        assert_eq!(binary.data, None);
        assert_eq!(binary.mime, None);
        assert!(save_file(repo, "data.bin", "not binary").is_err());
    }

    #[test]
    fn rejects_oversized_text_and_media() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        fs::write(
            dir.path().join("large.txt"),
            vec![b'a'; TEXT_LIMIT as usize + 1],
        )
        .unwrap();
        let error = read_file(repo, "large.txt").unwrap_err();
        assert!(error.contains("2 MiB"), "actual: {error}");
        assert!(save_file(repo, "large.txt", "small").is_err());

        let media = fs::File::create(dir.path().join("large.mp4")).unwrap();
        media.set_len(MEDIA_LIMIT + 1).unwrap();
        let error = read_file(repo, "large.mp4").unwrap_err();
        assert!(error.contains("32 MiB"), "actual: {error}");

        let binary = fs::File::create(dir.path().join("large.bin")).unwrap();
        binary.set_len(TEXT_LIMIT + 1).unwrap();
        assert!(read_file(repo, "large.bin").is_err());

        fs::write(dir.path().join("small.txt"), "unchanged").unwrap();
        let oversized = "x".repeat(TEXT_LIMIT as usize + 1);
        let error = save_file(repo, "small.txt", &oversized).unwrap_err();
        assert!(error.contains("2 MiB"), "actual: {error}");
        assert_eq!(
            fs::read_to_string(dir.path().join("small.txt")).unwrap(),
            "unchanged"
        );
    }

    #[test]
    fn rejects_unsafe_paths_and_non_files() {
        let dir = temp_repo();
        let repo = dir.path().to_str().unwrap();
        fs::write(dir.path().join("note.txt"), "note").unwrap();
        fs::create_dir(dir.path().join("nested")).unwrap();
        let absolute = dir.path().join("note.txt").to_str().unwrap().to_string();

        for path in [
            "",
            "../outside.txt",
            ".git/config",
            ".GIT/config",
            "nested/.git/config",
            ".",
        ] {
            assert!(read_file(repo, path).is_err(), "path should fail: {path}");
        }
        assert!(read_file(repo, &absolute).is_err());
        assert!(read_file(repo, "missing.txt").is_err());
        assert!(read_file(repo, "nested").is_err());
        assert!(save_file(repo, "../outside.txt", "bad").is_err());
        for path in [
            "../outside",
            ".git",
            ".GIT",
            "nested/.git",
            ".",
            "note.txt",
            absolute.as_str(),
        ] {
            assert!(
                list_directory(repo, path, 200).is_err(),
                "directory path should fail: {path}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let dir = temp_repo();
        let outside = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        let secret = outside.path().join("secret.txt");
        fs::write(&secret, "secret").unwrap();
        symlink(&secret, dir.path().join("escape.txt")).unwrap();
        symlink(outside.path(), dir.path().join("escape-dir")).unwrap();
        symlink(
            dir.path().join(".git"),
            dir.path().join("git-metadata-link"),
        )
        .unwrap();

        assert!(read_file(repo, "escape.txt").is_err());
        assert!(read_file(repo, "escape-dir/secret.txt").is_err());
        assert!(read_file(repo, "git-metadata-link/config").is_err());
        assert!(save_file(repo, "escape.txt", "changed").is_err());
        assert!(list_directory(repo, "escape-dir", 200).is_err());
        assert_eq!(search_files(repo, "secret", 200).unwrap().total, 0);
        assert_eq!(fs::read_to_string(secret).unwrap(), "secret");
    }
}
