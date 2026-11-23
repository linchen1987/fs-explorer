use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::OsString,
    io::{Read, Write},
    path::Path,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
};
use tauri::{AppHandle, Emitter};

type Sessions = Arc<Mutex<HashMap<String, TerminalSession>>>;

pub(crate) struct TerminalState {
    sessions: Sessions,
    next_id: AtomicU64,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Clone, Serialize)]
struct TerminalOutput {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: String,
    code: Option<u32>,
}

impl TerminalState {
    pub(crate) fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
        }
    }

    fn sessions(&self) -> MutexGuard<'_, HashMap<String, TerminalSession>> {
        lock_sessions(&self.sessions)
    }
}

impl Drop for TerminalState {
    fn drop(&mut self) {
        let sessions = std::mem::take(&mut *self.sessions());
        for (_, mut session) in sessions {
            let _ = terminate(&mut session);
        }
    }
}

pub(crate) fn open(
    app: AppHandle,
    state: &TerminalState,
    repo: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let path = Path::new(&repo);
    if !path.is_dir() {
        return Err(format!("终端工作目录不存在或不是目录: {repo}"));
    }
    let size = pty_size(cols, rows)?;

    let pair = native_pty_system()
        .openpty(size)
        .map_err(|e| format!("创建终端失败: {e}"))?;
    // 在启动子进程前取得 reader/writer，失败时不会有进程需要清理。
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("读取终端初始化失败: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("写入终端初始化失败: {e}"))?;

    let mut command = shell_command();
    command.cwd(path.as_os_str());
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("启动系统 shell 失败: {e}"))?;
    // 父进程不能保留 slave，否则 shell 退出后 reader 收不到 EOF。
    drop(pair.slave);

    let sequence = state.next_id.fetch_add(1, Ordering::Relaxed);
    let id = format!("{}-{sequence}", child.process_id().unwrap_or(0));
    let session = TerminalSession {
        master: pair.master,
        writer,
        child,
    };
    state.sessions().insert(id.clone(), session);

    let sessions = Arc::clone(&state.sessions);
    let reader_id = id.clone();
    let spawn_result = std::thread::Builder::new()
        .name(format!("terminal-reader-{id}"))
        .spawn(move || read_output(app, sessions, reader_id, &mut reader));
    if let Err(e) = spawn_result {
        let session = state.sessions().remove(&id);
        if let Some(mut session) = session {
            let _ = terminate(&mut session);
        }
        return Err(format!("启动终端读取线程失败: {e}"));
    }

    Ok(id)
}

pub(crate) fn write(state: &TerminalState, id: &str, data: &str) -> Result<(), String> {
    let mut sessions = state.sessions();
    let session = sessions
        .get_mut(id)
        .ok_or_else(|| "终端会话不存在或已关闭".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|()| session.writer.flush())
        .map_err(|e| format!("写入终端失败: {e}"))
}

pub(crate) fn change_directory(state: &TerminalState, id: &str, path: &str) -> Result<(), String> {
    if !Path::new(path).is_dir() {
        return Err(format!("终端工作目录不存在或不是目录: {path}"));
    }
    write(state, id, &change_directory_input(path))
}

#[cfg(unix)]
fn change_directory_input(path: &str) -> String {
    // 单引号保护空格与 shell 元字符；路径中的单引号用 '"'"' 安全闭合后重开。
    format!("cd -- '{}'\r", path.replace('\'', "'\"'\"'"))
}

#[cfg(windows)]
fn change_directory_input(path: &str) -> String {
    // Windows 文件名不允许双引号；/d 同时处理跨盘符切换。
    format!("cd /d \"{path}\"\r")
}

pub(crate) fn resize(state: &TerminalState, id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let size = pty_size(cols, rows)?;
    let sessions = state.sessions();
    let session = sessions
        .get(id)
        .ok_or_else(|| "终端会话不存在或已关闭".to_string())?;
    session
        .master
        .resize(size)
        .map_err(|e| format!("调整终端大小失败: {e}"))
}

pub(crate) fn close(app: &AppHandle, state: &TerminalState, id: &str) {
    // 只有成功移除会话的一方发送 exit，从而与 reader 的退出路径互斥。
    let session = state.sessions().remove(id);
    if let Some(mut session) = session {
        let code = terminate(&mut session);
        emit_exit(app, id.to_string(), code);
    }
}

fn read_output(app: AppHandle, sessions: Sessions, id: String, reader: &mut dyn Read) {
    let mut buffer = [0u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                let payload = TerminalOutput {
                    id: id.clone(),
                    data: BASE64.encode(&buffer[..n]),
                };
                let _ = app.emit("terminal-output", payload);
            }
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }

    let session = lock_sessions(&sessions).remove(&id);
    if let Some(mut session) = session {
        // 异常 read 错误也可能发生在 shell 仍存活时，确保等待前将其终止。
        let code = terminate(&mut session);
        emit_exit(&app, id, code);
    }
}

fn terminate(session: &mut TerminalSession) -> Option<u32> {
    let status = match session.child.try_wait() {
        Ok(Some(status)) => Some(status),
        _ => {
            let _ = session.child.kill();
            session.child.wait().ok()
        }
    };
    status.and_then(|status| {
        if status.signal().is_some() {
            None
        } else {
            Some(status.exit_code())
        }
    })
}

fn emit_exit(app: &AppHandle, id: String, code: Option<u32>) {
    let _ = app.emit("terminal-exit", TerminalExit { id, code });
}

fn pty_size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if cols == 0 || rows == 0 {
        return Err("终端列数和行数必须大于 0".to_string());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

#[cfg(unix)]
fn shell_command() -> CommandBuilder {
    let shell = std::env::var_os("SHELL")
        .filter(|shell| !shell.is_empty())
        .unwrap_or_else(|| OsString::from("/bin/sh"));
    let mut command = CommandBuilder::new(shell);
    // 独立 argv 参数，不拼接或解析用户提供的 shell 字符串。
    command.args(["-l", "-i"]);
    command
}

#[cfg(windows)]
fn shell_command() -> CommandBuilder {
    let shell = std::env::var_os("COMSPEC")
        .filter(|shell| !shell.is_empty())
        .unwrap_or_else(|| OsString::from("cmd.exe"));
    CommandBuilder::new(shell)
}

fn lock_sessions(
    sessions: &Mutex<HashMap<String, TerminalSession>>,
) -> MutexGuard<'_, HashMap<String, TerminalSession>> {
    sessions.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(all(test, unix))]
mod tests {
    use super::change_directory_input;

    #[test]
    fn quotes_unix_cd_paths_and_shell_metacharacters() {
        assert_eq!(
            change_directory_input("/tmp/it's fine; $HOME"),
            "cd -- '/tmp/it'\"'\"'s fine; $HOME'\r"
        );
    }
}
