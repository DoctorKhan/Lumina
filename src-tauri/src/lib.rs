use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashSet,
    env, fs,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
    thread,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct TerminalState {
    child: Mutex<Option<Box<dyn Child + Send + Sync>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    cwd: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
struct OpenedFile {
    path: String,
    name: String,
    content: String,
}

#[derive(Serialize)]
struct CheckoutInstallInfo {
    available: bool,
    command: Option<String>,
    label: String,
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn expand_user_path(path: &str, base_dir: Option<&PathBuf>) -> PathBuf {
    if path == "~" {
        if let Some(home) = env::var_os("HOME") {
            return PathBuf::from(home);
        }
    }

    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }

    let path = PathBuf::from(path);
    if path.is_relative() {
        if let Some(base_dir) = base_dir {
            return base_dir.join(path);
        }
    }

    path
}

fn terminal_path() -> String {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        for path in [
            home.join(".volta/bin"),
            home.join(".local/bin"),
            home.join(".cargo/bin"),
            home.join(".bun/bin"),
        ] {
            if path.is_dir() {
                let path = path.to_string_lossy().to_string();
                if seen.insert(path.clone()) {
                    paths.push(path);
                }
            }
        }
    }

    for path in [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        if seen.insert(path.to_string()) {
            paths.push(path.to_string());
        }
    }

    if let Ok(existing_path) = env::var("PATH") {
        for path in env::split_paths(&existing_path) {
            let path = path.to_string_lossy().to_string();
            if seen.insert(path.clone()) {
                paths.push(path);
            }
        }
    }

    paths.join(":")
}

#[tauri::command]
fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    if state
        .child
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .is_some()
    {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = CommandBuilder::new(shell);
    let cwd = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));
    command.cwd(&cwd);
    command.env("PATH", terminal_path());
    command.env("TERM", "xterm-256color");
    if let Ok(mut state_cwd) = state.cwd.lock() {
        *state_cwd = Some(cwd);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;

    *state
        .child
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())? = Some(child);
    *state
        .master
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())? = Some(pair.master);
    *state
        .writer
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())? = Some(writer);

    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let output = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app.emit("terminal-output", output);
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal-output",
                        format!("\r\nTerminal closed: {error}\r\n"),
                    );
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn terminal_set_cwd(state: State<'_, TerminalState>, path: String) -> Result<(), String> {
    let mut cwd = state
        .cwd
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?;
    let next = expand_user_path(path.trim(), cwd.as_ref());
    let next = fs::canonicalize(&next).map_err(|error| error.to_string())?;

    if !next.is_dir() {
        return Err("Path is not a directory.".to_string());
    }

    *cwd = Some(next);
    Ok(())
}

#[tauri::command]
fn terminal_write(state: State<'_, TerminalState>, data: String) -> Result<(), String> {
    let mut writer = state
        .writer
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?;
    let writer = writer
        .as_mut()
        .ok_or_else(|| "Terminal is not running.".to_string())?;

    writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_resize(state: State<'_, TerminalState>, rows: u16, cols: u16) -> Result<(), String> {
    let mut master = state
        .master
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?;
    let master = master
        .as_mut()
        .ok_or_else(|| "Terminal is not running.".to_string())?;

    master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_kill(state: State<'_, TerminalState>) -> Result<(), String> {
    if let Some(mut child) = state
        .child
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .take()
    {
        let _ = child.kill();
    }

    state
        .writer
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .take();
    state
        .master
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .take();

    Ok(())
}

#[tauri::command]
fn open_file_path(state: State<'_, TerminalState>, path: String) -> Result<OpenedFile, String> {
    let path = path
        .trim()
        .trim_matches(|character| matches!(character, '"' | '\'' | '`' | '<' | '>' | ')' | '('));
    let path = path
        .trim_end_matches(|character: char| matches!(character, ',' | ';' | '.'))
        .split_once(':')
        .map_or(path, |(candidate, _)| candidate);
    let cwd = state
        .cwd
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?;
    let path = expand_user_path(path, cwd.as_ref());
    let path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Clicked path is not a file.".to_string());
    }

    let content =
        fs::read_to_string(&path).map_err(|_| "File is not valid UTF-8 text.".to_string())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();

    Ok(OpenedFile {
        path: path.to_string_lossy().to_string(),
        name,
        content,
    })
}

#[tauri::command]
fn current_checkout_install_info() -> CheckoutInstallInfo {
    if !cfg!(debug_assertions) {
        return CheckoutInstallInfo {
            available: false,
            command: None,
            label: "Local checkout install is only shown in development builds.".to_string(),
        };
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let Some(root_dir) = manifest_dir.parent() else {
        return CheckoutInstallInfo {
            available: false,
            command: None,
            label: "Unable to resolve the current checkout path.".to_string(),
        };
    };
    let run_script = root_dir.join("run.sh");

    if !run_script.is_file() {
        return CheckoutInstallInfo {
            available: false,
            command: None,
            label: "Unable to find run.sh for this checkout.".to_string(),
        };
    }

    let root_dir = root_dir.to_string_lossy().to_string();
    CheckoutInstallInfo {
        available: true,
        command: Some(format!(
            "cd {} && ./run.sh install:app",
            shell_quote(&root_dir)
        )),
        label: format!("Install current checkout from {root_dir}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_set_cwd,
            open_file_path,
            current_checkout_install_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
