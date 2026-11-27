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

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathSizeEntry {
    pub path: String,
    pub kind: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathSize {
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub children: Option<Vec<PathSizeEntry>>,
}

/// 按需统计文件字节数；目录始终带一级子项，目录项自身和任意层级的 .git 内容均不计入。
pub fn path_size(repo: &str, path: &str) -> Result<PathSize, String> {
    let target = resolve_existing_path(repo, path)?;
    let metadata = fs::symlink_metadata(&target)
        .map_err(|e| format!("无法读取文件信息 {}: {e}", display_parent(path)))?;

    if !metadata.is_dir() {
        return Ok(PathSize {
            path: path.to_string(),
            kind: "file".to_string(),
            size: metadata.len(),
            children: None,
        });
    }

    let measurement = measure_directory(&target, Path::new(path), true)?;
    Ok(PathSize {
        path: path.to_string(),
        kind: "directory".to_string(),
        size: measurement.size,
        children: Some(measurement.children),
    })
}

struct DirectoryMeasurement {
    size: u64,
    children: Vec<PathSizeEntry>,
}

/// 一次递归同时累加当前目录总量；只有被请求的目录才保留一级子项结果。
fn measure_directory(
    directory: &Path,
    relative: &Path,
    collect_children: bool,
) -> Result<DirectoryMeasurement, String> {
    let display_path = relative.to_string_lossy().replace('\\', "/");
    let entries = fs::read_dir(directory)
        .map_err(|e| format!("无法读取目录 {}: {e}", display_parent(&display_path)))?;
    let mut size = 0_u64;
    let mut children = Vec::new();

    for entry in entries {
        let entry =
            entry.map_err(|e| format!("读取目录项失败 {}: {e}", display_parent(&display_path)))?;
        let name = entry.file_name();
        if name.to_string_lossy().eq_ignore_ascii_case(".git") {
            continue;
        }

        let child_relative = relative.join(&name);
        let child_path = child_relative.to_string_lossy().replace('\\', "/");
        let file_type = entry
            .file_type()
            .map_err(|e| format!("无法读取文件类型 {child_path}: {e}"))?;
        let (kind, child_size) = if file_type.is_dir() {
            (
                "directory",
                measure_directory(&entry.path(), &child_relative, false)?.size,
            )
        } else {
            // DirEntry::file_type 不跟随符号链接；链接和其他文件一样只计自身长度。
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|e| format!("无法读取文件信息 {child_path}: {e}"))?;
            ("file", metadata.len())
        };
        size = checked_size_sum(size, child_size, &child_relative)?;

        if collect_children {
            children.push(PathSizeEntry {
                path: child_path,
                kind: kind.to_string(),
                size: child_size,
            });
        }
    }

    if collect_children {
        children.sort_unstable_by(|a, b| {
            let a_is_directory = a.kind == "directory";
            let b_is_directory = b.kind == "directory";
            b_is_directory
                .cmp(&a_is_directory)
                .then_with(|| a.path.cmp(&b.path))
        });
    }
    Ok(DirectoryMeasurement { size, children })
}

fn checked_size_sum(total: u64, size: u64, path: &Path) -> Result<u64, String> {
    total
        .checked_add(size)
        .ok_or_else(|| format!("路径大小统计溢出 {}: 超出 u64 上限", path.display()))
}

fn validate_relative_path(path: &str, allow_empty: bool) -> Result<(), String> {
    if path.is_empty() {
        return if allow_empty {
            Ok(())
        } else {
            Err("路径不能为空".to_string())
        };
    }

    let relative = Path::new(path);
    if relative.is_absolute() {
        return Err(format!("路径必须是仓库内相对路径: {path}"));
    }
    for component in relative.components() {
        match component {
            Component::Normal(part) if part.to_string_lossy().eq_ignore_ascii_case(".git") => {
                return Err(format!("路径不能包含 .git 组件: {path}"));
            }
            Component::Normal(_) => {}
            Component::ParentDir => {
                return Err(format!("路径不能包含 .. 组件: {path}"));
            }
            _ => {
                return Err(format!("路径必须是仓库内普通相对路径: {path}"));
            }
        }
    }
    Ok(())
}

/// 确认解析后的目标没有逃逸，也没有通过符号链接进入任意大小写形式的 .git。
fn ensure_resolved_path_safe(root: &Path, resolved: &Path, path: &str) -> Result<(), String> {
    if !resolved.starts_with(root) {
        return Err(format!("路径超出仓库根目录: {path}"));
    }
    let resolved_relative = resolved
        .strip_prefix(root)
        .map_err(|e| format!("无法解析路径 {path}: {e}"))?;
    if resolved_relative.components().any(|component| {
        matches!(component, Component::Normal(part) if part.to_string_lossy().eq_ignore_ascii_case(".git"))
    }) {
        return Err(format!("路径不能指向 .git 内容: {path}"));
    }
    Ok(())
}

/// 校验并解析已存在的文件或目录；大小统计遍历内部条目时才不跟随符号链接。
fn resolve_existing_path(repo: &str, path: &str) -> Result<PathBuf, String> {
    validate_relative_path(path, true)?;
    let root = repo_root(repo)?;
    let full_path = if path.is_empty() {
        root.clone()
    } else {
        fs::canonicalize(root.join(Path::new(path)))
            .map_err(|e| format!("路径不存在或无法访问 {path}: {e}"))?
    };
    ensure_resolved_path_safe(&root, &full_path, path)?;
    Ok(full_path)
}

/// 复制目标可为仓库内文件或目录；空路径安全地表示整个项目目录。
pub(crate) fn resolve_copy_target(repo: &str, path: &str) -> Result<PathBuf, String> {
    resolve_existing_path(repo, path)
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

/// 删除仓库内文件、目录或最终符号链接；实际目录递归删除，链接只删除自身。
pub fn delete_path(repo: &str, path: &str) -> Result<(), String> {
    validate_relative_path(path, false)?;
    let root = repo_root(repo)?;
    let relative = Path::new(path);
    let name = relative
        .file_name()
        .ok_or_else(|| format!("删除路径必须包含文件或目录名称: {path}"))?;
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let canonical_parent = fs::canonicalize(root.join(parent))
        .map_err(|e| format!("删除路径的父目录不存在或无法访问 {path}: {e}"))?;
    ensure_resolved_path_safe(&root, &canonical_parent, path)?;

    // 不 canonicalize 最终组件，避免跟随外部、损坏或指向目录的符号链接。
    let full_path = canonical_parent.join(name);
    let metadata = fs::symlink_metadata(&full_path)
        .map_err(|e| format!("无法读取待删除路径信息 {path}: {e}"))?;
    let file_type = metadata.file_type();

    if file_type.is_symlink() {
        // Windows 的目录符号链接需要 RemoveDirectory；仍只删除链接，不删除目标目录。
        #[cfg(windows)]
        if fs::metadata(&full_path).is_ok_and(|target| target.is_dir()) {
            return fs::remove_dir(&full_path).map_err(|e| format!("删除符号链接失败 {path}: {e}"));
        }
        return fs::remove_file(&full_path).map_err(|e| format!("删除符号链接失败 {path}: {e}"));
    }

    if metadata.is_dir() {
        // remove_dir_all 不跟随目录内部的符号链接，外部目标不会被递归删除。
        return fs::remove_dir_all(&full_path).map_err(|e| format!("删除目录失败 {path}: {e}"));
    }
    fs::remove_file(&full_path).map_err(|e| format!("删除文件失败 {path}: {e}"))
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
pub(crate) fn resolve_file(repo: &str, path: &str) -> Result<PathBuf, String> {
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

    fn size_fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("docs/nested")).unwrap();
        fs::create_dir(dir.path().join("empty")).unwrap();
        fs::write(dir.path().join("root.txt"), "root").unwrap();
        fs::write(dir.path().join("z.txt"), "zz").unwrap();
        fs::write(dir.path().join("docs/a.txt"), "abc").unwrap();
        fs::write(dir.path().join("docs/nested/b.bin"), [0_u8; 5]).unwrap();
        dir
    }

    #[test]
    fn computes_project_directory_and_file_sizes_without_git() {
        let dir = size_fixture();
        let repo = dir.path().to_str().unwrap();

        let project = path_size(repo, "").unwrap();
        assert_eq!(project.path, "");
        assert_eq!(project.kind, "directory");
        assert_eq!(project.size, 14);
        assert_eq!(project.children.as_ref().unwrap().len(), 4);

        let directory = path_size(repo, "docs").unwrap();
        assert_eq!(directory.path, "docs");
        assert_eq!(directory.kind, "directory");
        assert_eq!(directory.size, 8);
        assert_eq!(directory.children.as_ref().unwrap().len(), 2);

        let file = path_size(repo, "docs/a.txt").unwrap();
        assert_eq!(file.path, "docs/a.txt");
        assert_eq!(file.kind, "file");
        assert_eq!(file.size, 3);
        assert_eq!(file.children, None);
    }

    #[test]
    fn includes_sorted_first_level_sizes_matching_directory_totals() {
        let dir = size_fixture();
        let repo = dir.path().to_str().unwrap();

        let project = path_size(repo, "").unwrap();
        let children = project.children.as_ref().unwrap();
        let summary = children
            .iter()
            .map(|child| (child.path.as_str(), child.kind.as_str(), child.size))
            .collect::<Vec<_>>();
        assert_eq!(
            summary,
            vec![
                ("docs", "directory", 8),
                ("empty", "directory", 0),
                ("root.txt", "file", 4),
                ("z.txt", "file", 2),
            ]
        );
        assert_eq!(
            children.iter().map(|child| child.size).sum::<u64>(),
            project.size
        );

        let docs = path_size(repo, "docs").unwrap();
        let children = docs.children.as_ref().unwrap();
        let paths = children
            .iter()
            .map(|child| child.path.as_str())
            .collect::<Vec<_>>();
        assert_eq!(paths, ["docs/nested", "docs/a.txt"]);
        assert_eq!(
            children.iter().map(|child| child.size).sum::<u64>(),
            docs.size
        );

        let empty = path_size(repo, "empty").unwrap();
        assert_eq!(empty.children, Some(Vec::new()));
    }

    #[test]
    fn excludes_git_entries_at_every_depth_and_case() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::create_dir_all(dir.path().join("nested/.GiT")).unwrap();
        fs::write(dir.path().join(".git/config"), vec![b'x'; 100]).unwrap();
        fs::write(dir.path().join("nested/.GiT/secret"), vec![b'x'; 50]).unwrap();
        fs::write(dir.path().join("nested/keep.txt"), "ok").unwrap();
        fs::write(dir.path().join("visible.txt"), "data").unwrap();

        let project = path_size(repo, "").unwrap();
        assert_eq!(project.size, 6);
        let children = project.children.unwrap();
        assert_eq!(
            children
                .iter()
                .map(|child| child.path.as_str())
                .collect::<Vec<_>>(),
            ["nested", "visible.txt"]
        );
        assert!(!children.iter().any(|child| child.path.contains(".git")));

        let nested = path_size(repo, "nested").unwrap();
        assert_eq!(nested.size, 2);
        assert_eq!(nested.children.unwrap()[0].path, "nested/keep.txt");
    }

    #[test]
    fn rejects_invalid_size_paths_and_reports_overflow_in_chinese() {
        let dir = size_fixture();
        let repo = dir.path().to_str().unwrap();
        let absolute = dir.path().join("root.txt").to_str().unwrap().to_string();

        for path in [
            "../outside.txt",
            ".git",
            ".GIT/config",
            "docs/.git/config",
            ".",
            absolute.as_str(),
        ] {
            assert!(path_size(repo, path).is_err(), "path should fail: {path}");
        }
        let error = path_size(repo, "missing.txt").unwrap_err();
        assert!(error.contains("路径不存在或无法访问"), "actual: {error}");

        let error = checked_size_sum(u64::MAX, 1, Path::new("root.txt")).unwrap_err();
        assert!(error.contains("溢出"), "actual: {error}");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_root_symlink_escape_and_does_not_follow_links_while_measuring() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let repo_path = dir.path();
        let repo = repo_path.to_str().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(repo_path.join("inside")).unwrap();
        fs::create_dir(repo_path.join(".git")).unwrap();
        fs::write(repo_path.join("visible.txt"), "visible").unwrap();
        fs::write(repo_path.join("inside/file.txt"), "abc").unwrap();
        fs::write(repo_path.join(".git/config"), "metadata").unwrap();
        fs::write(outside.path().join("secret.txt"), "outside-secret").unwrap();

        symlink(
            outside.path().join("secret.txt"),
            repo_path.join("escape-file"),
        )
        .unwrap();
        symlink(outside.path(), repo_path.join("escape-dir")).unwrap();
        symlink(repo_path.join(".git"), repo_path.join("git-link")).unwrap();
        symlink(repo_path.join("inside"), repo_path.join("inside-link")).unwrap();
        symlink("loop-b", repo_path.join("loop-a")).unwrap();
        symlink("loop-a", repo_path.join("loop-b")).unwrap();

        for path in [
            "escape-file",
            "escape-dir",
            "escape-dir/secret.txt",
            "git-link",
            "git-link/config",
            "loop-a",
        ] {
            assert!(path_size(repo, path).is_err(), "path should fail: {path}");
        }
        let internal_target = path_size(repo, "inside-link").unwrap();
        assert_eq!(internal_target.kind, "directory");
        assert_eq!(internal_target.size, 3);

        let link_size = |name: &str| fs::symlink_metadata(repo_path.join(name)).unwrap().len();
        let expected = 7
            + 3
            + [
                "escape-file",
                "escape-dir",
                "git-link",
                "inside-link",
                "loop-a",
                "loop-b",
            ]
            .into_iter()
            .map(link_size)
            .sum::<u64>();
        let project = path_size(repo, "").unwrap();
        assert_eq!(project.size, expected);
        let children = project.children.unwrap();
        for name in ["escape-file", "escape-dir", "git-link", "inside-link"] {
            let child = children.iter().find(|child| child.path == name).unwrap();
            assert_eq!(child.kind, "file");
            assert_eq!(child.size, link_size(name));
        }
        assert_eq!(
            fs::read_to_string(outside.path().join("secret.txt")).unwrap(),
            "outside-secret"
        );
    }

    #[test]
    fn resolves_copy_targets_for_files_and_directories() {
        let dir = size_fixture();
        let repo = dir.path().to_str().unwrap();
        let root = dir.path().canonicalize().unwrap();

        assert_eq!(
            resolve_copy_target(repo, "docs").unwrap(),
            root.join("docs")
        );
        assert_eq!(
            resolve_copy_target(repo, "docs/a.txt").unwrap(),
            root.join("docs/a.txt")
        );
        assert_eq!(resolve_copy_target(repo, "").unwrap(), root);
        assert!(resolve_copy_target(repo, "../outside").is_err());
        assert!(resolve_copy_target(repo, ".git/config").is_err());
    }

    #[test]
    fn deletes_files_and_nested_nonempty_directories_and_rejects_invalid_paths() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_str().unwrap();
        fs::create_dir_all(dir.path().join("nested/deeper")).unwrap();
        fs::write(dir.path().join("delete.txt"), "delete").unwrap();
        fs::write(dir.path().join("nested/deeper/item.txt"), "nested").unwrap();
        fs::write(dir.path().join("keep.txt"), "keep").unwrap();

        delete_path(repo, "delete.txt").unwrap();
        assert!(!dir.path().join("delete.txt").exists());

        delete_path(repo, "nested").unwrap();
        assert!(!dir.path().join("nested").exists());

        let absolute = dir.path().join("keep.txt").to_str().unwrap().to_string();
        for path in [
            "",
            "../outside.txt",
            ".git/config",
            ".GIT",
            "nested/.git/file.txt",
            ".",
            absolute.as_str(),
        ] {
            assert!(delete_path(repo, path).is_err(), "path should fail: {path}");
        }
        assert!(delete_path(repo, "missing.txt").is_err());
        assert!(dir.path().join("keep.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn deletes_only_final_symlinks_and_rejects_intermediate_escape() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let repo_path = dir.path();
        let repo = repo_path.to_str().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(repo_path.join(".git")).unwrap();
        fs::write(repo_path.join(".git/config"), "metadata").unwrap();
        fs::write(outside.path().join("secret.txt"), "secret").unwrap();

        symlink(outside.path(), repo_path.join("escape-parent")).unwrap();
        symlink(repo_path.join(".git"), repo_path.join("git-parent")).unwrap();
        for path in ["escape-parent/secret.txt", "git-parent/config"] {
            assert!(delete_path(repo, path).is_err(), "path should fail: {path}");
        }
        assert_eq!(
            fs::read_to_string(outside.path().join("secret.txt")).unwrap(),
            "secret"
        );
        assert_eq!(
            fs::read_to_string(repo_path.join(".git/config")).unwrap(),
            "metadata"
        );

        symlink(
            outside.path().join("secret.txt"),
            repo_path.join("external-file-link"),
        )
        .unwrap();
        delete_path(repo, "external-file-link").unwrap();
        assert!(fs::symlink_metadata(repo_path.join("external-file-link")).is_err());
        assert_eq!(
            fs::read_to_string(outside.path().join("secret.txt")).unwrap(),
            "secret"
        );

        symlink(outside.path(), repo_path.join("external-dir-link")).unwrap();
        delete_path(repo, "external-dir-link").unwrap();
        assert!(fs::symlink_metadata(repo_path.join("external-dir-link")).is_err());
        assert!(outside.path().is_dir());
        assert!(outside.path().join("secret.txt").is_file());

        symlink("missing-target", repo_path.join("broken-link")).unwrap();
        delete_path(repo, "broken-link").unwrap();
        assert!(fs::symlink_metadata(repo_path.join("broken-link")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn recursive_directory_delete_does_not_follow_internal_symlinks() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let repo_path = dir.path();
        let repo = repo_path.to_str().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir_all(repo_path.join("tree/nested")).unwrap();
        fs::write(repo_path.join("tree/nested/item.txt"), "item").unwrap();
        fs::write(outside.path().join("secret.txt"), "secret").unwrap();
        symlink(outside.path(), repo_path.join("tree/external-dir-link")).unwrap();
        symlink(
            outside.path().join("secret.txt"),
            repo_path.join("tree/nested/external-file-link"),
        )
        .unwrap();

        delete_path(repo, "tree").unwrap();

        assert!(!repo_path.join("tree").exists());
        assert!(outside.path().is_dir());
        assert_eq!(
            fs::read_to_string(outside.path().join("secret.txt")).unwrap(),
            "secret"
        );
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
