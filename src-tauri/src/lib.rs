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
use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, State, Wry,
};

const MENU_OPEN_FILE: &str = "lumina_open_file";
const MENU_DOWNLOAD_MARKDOWN: &str = "lumina_download_markdown";
const MENU_UNDO: &str = "lumina_undo";
const MENU_REDO: &str = "lumina_redo";
const MENU_COPY_HTML: &str = "lumina_copy_html";
const MENU_CHECK_UPDATES: &str = "lumina_check_updates";
const MENU_INSTALL_UPDATE: &str = "lumina_install_update";
const MENU_INSTALL_CHECKOUT: &str = "lumina_install_checkout";
const MENU_TOGGLE_SOURCE: &str = "lumina_toggle_source";
const MENU_TOGGLE_TERMINAL: &str = "lumina_toggle_terminal";
const MENU_TOGGLE_CLAUDE: &str = "lumina_toggle_claude";
const MENU_OPEN_GITHUB: &str = "lumina_open_github";

#[derive(Default)]
struct PtySession {
    child: Mutex<Option<Box<dyn Child + Send + Sync>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
}

#[derive(Default)]
struct TerminalState {
    terminal: PtySession,
    claude: PtySession,
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

fn menu_item(
    app: &tauri::App<Wry>,
    id: &'static str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<Wry>> {
    let mut item = MenuItemBuilder::with_id(id, text);
    if let Some(accelerator) = accelerator {
        item = item.accelerator(accelerator);
    }
    item.build(app)
}

fn build_app_menu(app: &tauri::App<Wry>) -> tauri::Result<Menu<Wry>> {
    let open_file = menu_item(app, MENU_OPEN_FILE, "Open...", Some("CmdOrCtrl+O"))?;
    let download_markdown = menu_item(
        app,
        MENU_DOWNLOAD_MARKDOWN,
        "Download Markdown",
        Some("CmdOrCtrl+S"),
    )?;
    let undo = menu_item(app, MENU_UNDO, "Undo", Some("CmdOrCtrl+Z"))?;
    let redo = menu_item(app, MENU_REDO, "Redo", Some("CmdOrCtrl+Shift+Z"))?;
    let copy_html = menu_item(
        app,
        MENU_COPY_HTML,
        "Copy Preview HTML",
        Some("CmdOrCtrl+Shift+C"),
    )?;
    let check_updates = menu_item(app, MENU_CHECK_UPDATES, "Check Updates", None)?;
    let install_update = menu_item(app, MENU_INSTALL_UPDATE, "Install Update", None)?;
    let install_checkout = menu_item(app, MENU_INSTALL_CHECKOUT, "Install Current Checkout", None)?;
    let toggle_source = menu_item(app, MENU_TOGGLE_SOURCE, "Show/Hide Source", None)?;
    let toggle_terminal = menu_item(
        app,
        MENU_TOGGLE_TERMINAL,
        "Show/Hide Terminal",
        Some("CmdOrCtrl+`"),
    )?;
    let toggle_claude = menu_item(app, MENU_TOGGLE_CLAUDE, "Show/Hide Claude", None)?;
    let open_github = menu_item(app, MENU_OPEN_GITHUB, "Contribute on GitHub", None)?;

    let app_menu = SubmenuBuilder::new(app, "Lumina")
        .about(Some(AboutMetadata {
            name: Some("Lumina".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            comments: Some("Markdown + LaTeX editor".to_string()),
            website: Some("https://github.com/DoctorKhan/Lumina".to_string()),
            website_label: Some("GitHub".to_string()),
            ..Default::default()
        }))
        .separator()
        .item(&check_updates)
        .item(&install_update)
        .item(&install_checkout)
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&download_markdown)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .item(&copy_html)
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_source)
        .item(&toggle_terminal)
        .item(&toggle_claude)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&open_github)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()
}

fn is_lumina_menu_id(id: &str) -> bool {
    matches!(
        id,
        MENU_OPEN_FILE
            | MENU_DOWNLOAD_MARKDOWN
            | MENU_UNDO
            | MENU_REDO
            | MENU_COPY_HTML
            | MENU_CHECK_UPDATES
            | MENU_INSTALL_UPDATE
            | MENU_INSTALL_CHECKOUT
            | MENU_TOGGLE_SOURCE
            | MENU_TOGGLE_TERMINAL
            | MENU_TOGGLE_CLAUDE
            | MENU_OPEN_GITHUB
    )
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

fn default_cwd() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from("/")))
}

fn spawn_pty_session(
    app: AppHandle,
    session: &PtySession,
    event_name: &'static str,
    mut command: CommandBuilder,
    cwd: PathBuf,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    if session
        .child
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?
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

    command.cwd(&cwd);
    command.env("PATH", terminal_path());
    command.env("TERM", "xterm-256color");

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

    *session
        .child
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())? = Some(child);
    *session
        .master
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())? = Some(pair.master);
    *session
        .writer
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())? = Some(writer);

    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let output = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app.emit(event_name, output);
                }
                Err(error) => {
                    let _ = app.emit(event_name, format!("\r\nTerminal closed: {error}\r\n"));
                    break;
                }
            }
        }
    });

    Ok(())
}

fn write_pty_session(session: &PtySession, data: String) -> Result<(), String> {
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?;
    let writer = writer
        .as_mut()
        .ok_or_else(|| "Terminal is not running.".to_string())?;

    writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn resize_pty_session(session: &PtySession, rows: u16, cols: u16) -> Result<(), String> {
    let mut master = session
        .master
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?;
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

fn kill_pty_session(session: &PtySession) -> Result<(), String> {
    if let Some(mut child) = session
        .child
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?
        .take()
    {
        let _ = child.kill();
    }

    session
        .writer
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?
        .take();
    session
        .master
        .lock()
        .map_err(|_| "PTY state is unavailable.".to_string())?
        .take();

    Ok(())
}

#[tauri::command]
fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let command = CommandBuilder::new(shell);
    let cwd = state
        .cwd
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .clone()
        .unwrap_or_else(default_cwd);

    if let Ok(mut state_cwd) = state.cwd.lock() {
        *state_cwd = Some(cwd.clone());
    }

    spawn_pty_session(
        app,
        &state.terminal,
        "terminal-output",
        command,
        cwd,
        rows,
        cols,
    )
}

#[tauri::command]
fn claude_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    let command = CommandBuilder::new("claude");
    let cwd = if let Some(cwd) = cwd {
        let cwd = expand_user_path(cwd.trim(), None);
        let cwd = fs::canonicalize(&cwd).map_err(|error| error.to_string())?;
        if !cwd.is_dir() {
            return Err("Claude cwd is not a directory.".to_string());
        }
        cwd
    } else {
        state
            .cwd
            .lock()
            .map_err(|_| "Terminal state is unavailable.".to_string())?
            .clone()
            .unwrap_or_else(default_cwd)
    };

    spawn_pty_session(
        app,
        &state.claude,
        "claude-output",
        command,
        cwd,
        rows,
        cols,
    )
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
    write_pty_session(&state.terminal, data)
}

#[tauri::command]
fn terminal_resize(state: State<'_, TerminalState>, rows: u16, cols: u16) -> Result<(), String> {
    resize_pty_session(&state.terminal, rows, cols)
}

#[tauri::command]
fn terminal_kill(state: State<'_, TerminalState>) -> Result<(), String> {
    kill_pty_session(&state.terminal)
}

#[tauri::command]
fn claude_write(state: State<'_, TerminalState>, data: String) -> Result<(), String> {
    write_pty_session(&state.claude, data)
}

#[tauri::command]
fn claude_resize(state: State<'_, TerminalState>, rows: u16, cols: u16) -> Result<(), String> {
    resize_pty_session(&state.claude, rows, cols)
}

#[tauri::command]
fn claude_kill(state: State<'_, TerminalState>) -> Result<(), String> {
    kill_pty_session(&state.claude)
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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_app_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if is_lumina_menu_id(id) {
                let _ = app.emit("lumina-menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_set_cwd,
            claude_spawn,
            claude_write,
            claude_resize,
            claude_kill,
            open_file_path,
            current_checkout_install_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
