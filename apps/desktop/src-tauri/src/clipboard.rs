//! 将文件以「文件本体」形式写入系统剪贴板（可像 Finder 一样粘贴）。

use std::path::PathBuf;

/// macOS：通过 NSPasteboard 写入文件 URL（public.file-url），
/// 之后即可在 Finder、桌面等处直接粘贴该文件。
#[cfg(target_os = "macos")]
pub fn copy_files_to_clipboard(paths: &[PathBuf]) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{NSPasteboard, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSString, NSURL};

    if paths.is_empty() {
        return Ok(());
    }

    let board = NSPasteboard::generalPasteboard();
    board.clearContents();

    let objects: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = paths
        .iter()
        .map(|path| {
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
            ProtocolObject::from_retained(url)
        })
        .collect();
    let objects = NSArray::from_retained_slice(&objects);

    if board.writeObjects(&objects) {
        Ok(())
    } else {
        Err("写入系统剪贴板失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
pub fn copy_files_to_clipboard(_paths: &[PathBuf]) -> Result<(), String> {
    Err("当前平台暂不支持复制文件到剪贴板".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_paths_is_a_no_op() {
        assert!(copy_files_to_clipboard(&[]).is_ok());
    }
}
