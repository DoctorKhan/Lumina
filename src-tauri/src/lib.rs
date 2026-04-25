use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, PoisonError},
    thread,
};
use tauri::{
    menu::{AboutMetadata, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime, State, Wry,
};

const MENU_OPEN_FILE: &str = "lumina_open_file";
const MENU_OPEN_LAST_FILE: &str = "lumina_open_last_file";
const MENU_OPEN_RECENT_FILE_PREFIX: &str = "lumina_open_recent_file:";
const MENU_NO_RECENT_FILES: &str = "lumina_no_recent_files";
const MENU_SAVE: &str = "lumina_save";
const MENU_SAVE_AS: &str = "lumina_save_as";
const MENU_UNDO: &str = "lumina_undo";
const MENU_REDO: &str = "lumina_redo";
const MENU_COPY_HTML: &str = "lumina_copy_html";
const MENU_CHECK_UPDATES: &str = "lumina_check_updates";
const MENU_INSTALL_UPDATE: &str = "lumina_install_update";
const MENU_INSTALL_CHECKOUT: &str = "lumina_install_checkout";
const MENU_TOGGLE_SOURCE: &str = "lumina_toggle_source";
const MENU_TOGGLE_TERMINAL: &str = "lumina_toggle_terminal";
const MENU_TOGGLE_CLAUDE: &str = "lumina_toggle_claude";
const MENU_CLAUDE_CONTEXT: &str = "lumina_claude_context";
const MENU_CLAUDE_PROMPTS: &str = "lumina_claude_prompts";
const MENU_CLAUDE_PULL_FILE: &str = "lumina_claude_pull_file";
const MENU_CLAUDE_APPLY_CLIPBOARD: &str = "lumina_claude_apply_clipboard";
const MENU_OPEN_EXAMPLE_GUIDE: &str = "lumina_open_example_guide";
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

/// Paths passed in from the OS (`open -a Lumina.app file.md` on macOS, argv elsewhere)
/// until the webview drains them.
#[derive(Default)]
struct PendingOpenPaths(Mutex<Vec<String>>);

fn is_supported_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md")
                || extension.eq_ignore_ascii_case("markdown")
                || extension.eq_ignore_ascii_case("txt")
        })
}

fn collect_cli_document_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        // macOS delivers `open -a App path` via `RunEvent::Opened`, not argv.
        return vec![];
    }
    #[cfg(not(target_os = "macos"))]
    {
        let mut paths = Vec::new();
        for arg in env::args_os().skip(1) {
            let path = PathBuf::from(arg);
            if path.is_file() && is_supported_document_path(&path) {
                if let Ok(canonical) = fs::canonicalize(&path) {
                    paths.push(canonical.to_string_lossy().to_string());
                }
            }
        }
        paths
    }
}

fn notify_open_paths_pending(app: &AppHandle<Wry>, mut paths: Vec<String>) {
    paths.retain(|path| !path.trim().is_empty());
    if paths.is_empty() {
        return;
    }

    {
        let pending = app.state::<PendingOpenPaths>();
        let mut guard = pending
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        guard.append(&mut paths);
    }

    let _ = app.emit("lumina-pending-open-files", ());
}

#[tauri::command]
fn drain_pending_open_paths(state: State<'_, PendingOpenPaths>) -> Result<Vec<String>, String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Pending open paths lock poisoned.".to_string())?;
    Ok(std::mem::take(&mut *guard))
}

#[derive(Serialize)]
struct OpenedFile {
    path: String,
    name: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppMenuParams {
    paths: Vec<String>,
    source_shown: bool,
    terminal_shown: bool,
    claude_shown: bool,
}

#[derive(Serialize)]
struct CheckoutInstallInfo {
    available: bool,
    command: Option<String>,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeWorkspaceInfo {
    workspace_path: String,
    file_path: String,
}

fn menu_item<R: Runtime, M: Manager<R>>(
    manager: &M,
    id: &'static str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let mut item = MenuItemBuilder::with_id(id, text);
    if let Some(accelerator) = accelerator {
        item = item.accelerator(accelerator);
    }
    item.build(manager)
}

fn check_menu_item<R: Runtime, M: Manager<R>>(
    manager: &M,
    id: &'static str,
    text: &str,
    checked: bool,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::CheckMenuItem<R>> {
    let mut item = CheckMenuItemBuilder::with_id(id, text).checked(checked);
    if let Some(accelerator) = accelerator {
        item = item.accelerator(accelerator);
    }
    item.build(manager)
}

fn recent_file_label(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn build_recent_files_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    recent_file_paths: &[String],
) -> tauri::Result<tauri::menu::Submenu<R>> {
    let mut recent_files_menu = SubmenuBuilder::new(manager, "Open Recent");

    if recent_file_paths.is_empty() {
        let no_recent_files = MenuItemBuilder::with_id(MENU_NO_RECENT_FILES, "No Recent Files")
            .enabled(false)
            .build(manager)?;
        recent_files_menu = recent_files_menu.item(&no_recent_files);
    } else {
        for (index, path) in recent_file_paths.iter().enumerate() {
            let recent_file = MenuItemBuilder::with_id(
                format!("{MENU_OPEN_RECENT_FILE_PREFIX}{index}"),
                recent_file_label(path),
            )
            .build(manager)?;
            recent_files_menu = recent_files_menu.item(&recent_file);
        }
    }

    recent_files_menu.build()
}

fn build_app_menu<R: Runtime, M: Manager<R>>(
    manager: &M,
    recent_file_paths: &[String],
    source_shown: bool,
    terminal_shown: bool,
    claude_shown: bool,
) -> tauri::Result<Menu<R>> {
    let open_file = menu_item(manager, MENU_OPEN_FILE, "Open…", Some("CmdOrCtrl+O"))?;
    let open_last_file = menu_item(
        manager,
        MENU_OPEN_LAST_FILE,
        "Reopen Last File",
        None,
    )?;
    let recent_files_menu = build_recent_files_menu(manager, recent_file_paths)?;
    let save = menu_item(manager, MENU_SAVE, "Save", Some("CmdOrCtrl+S"))?;
    let save_as = menu_item(
        manager,
        MENU_SAVE_AS,
        "Save As…",
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let undo = menu_item(manager, MENU_UNDO, "Undo", Some("CmdOrCtrl+Z"))?;
    let redo = menu_item(manager, MENU_REDO, "Redo", Some("CmdOrCtrl+Shift+Z"))?;
    let copy_html = menu_item(
        manager,
        MENU_COPY_HTML,
        "Copy HTML",
        Some("CmdOrCtrl+Shift+C"),
    )?;
    let check_updates = menu_item(manager, MENU_CHECK_UPDATES, "Check for Updates", None)?;
    let install_update = menu_item(manager, MENU_INSTALL_UPDATE, "Install Update", None)?;
    let install_checkout = menu_item(
        manager,
        MENU_INSTALL_CHECKOUT,
        "Install from Local Build…",
        None,
    )?;
    let toggle_source = check_menu_item(manager, MENU_TOGGLE_SOURCE, "Source", source_shown, None)?;
    let toggle_terminal = check_menu_item(
        manager,
        MENU_TOGGLE_TERMINAL,
        "Terminal",
        terminal_shown,
        Some("CmdOrCtrl+`"),
    )?;
    let toggle_claude = check_menu_item(manager, MENU_TOGGLE_CLAUDE, "Claude", claude_shown, None)?;
    let claude_context = menu_item(manager, MENU_CLAUDE_CONTEXT, "Send Context to Claude", None)?;
    let claude_prompts = menu_item(
        manager,
        MENU_CLAUDE_PROMPTS,
        "Prompt Presets…",
        None,
    )?;
    let claude_pull_file = menu_item(
        manager,
        MENU_CLAUDE_PULL_FILE,
        "Open Claude-Edited File",
        None,
    )?;
    let claude_apply_clipboard = menu_item(
        manager,
        MENU_CLAUDE_APPLY_CLIPBOARD,
        "Replace Selection with Clipboard",
        None,
    )?;
    let open_github = menu_item(manager, MENU_OPEN_GITHUB, "Lumina on GitHub", None)?;
    let open_example_guide = menu_item(manager, MENU_OPEN_EXAMPLE_GUIDE, "Lumina Help", None)?;

    let app_menu = SubmenuBuilder::new(manager, "Lumina")
        .about(Some(AboutMetadata {
            name: Some("Lumina".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            comments: Some("Markdown + LaTeX editor".to_string()),
            website: Some("https://github.com/DoctorKhan/Lumina".to_string()),
            website_label: Some("GitHub".to_string()),
            ..Default::default()
        }))
        .separator()
        .item(&open_github)
        .separator()
        .item(&check_updates)
        .item(&install_update)
        .item(&install_checkout)
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(manager, "File")
        .item(&open_file)
        .item(&open_last_file)
        .item(&recent_files_menu)
        .separator()
        .item(&save)
        .item(&save_as)
        .build()?;

    let edit_menu = SubmenuBuilder::new(manager, "Edit")
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

    let view_menu = SubmenuBuilder::new(manager, "View")
        .item(&toggle_source)
        .item(&toggle_terminal)
        .item(&toggle_claude)
        .build()?;

    let claude_menu = SubmenuBuilder::new(manager, "Claude")
        .item(&claude_context)
        .item(&claude_prompts)
        .separator()
        .item(&claude_pull_file)
        .item(&claude_apply_clipboard)
        .build()?;

    let help_menu = SubmenuBuilder::new(manager, "Help")
        .item(&open_example_guide)
        .build()?;

    MenuBuilder::new(manager)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&claude_menu)
        .item(&help_menu)
        .build()
}

fn is_lumina_menu_id(id: &str) -> bool {
    id.starts_with(MENU_OPEN_RECENT_FILE_PREFIX)
        || matches!(
            id,
            MENU_OPEN_FILE
                | MENU_OPEN_LAST_FILE
                | MENU_SAVE
                | MENU_SAVE_AS
                | MENU_UNDO
                | MENU_REDO
                | MENU_COPY_HTML
                | MENU_CHECK_UPDATES
                | MENU_INSTALL_UPDATE
                | MENU_INSTALL_CHECKOUT
                | MENU_TOGGLE_SOURCE
                | MENU_TOGGLE_TERMINAL
                | MENU_TOGGLE_CLAUDE
                | MENU_CLAUDE_CONTEXT
                | MENU_CLAUDE_PROMPTS
                | MENU_CLAUDE_PULL_FILE
                | MENU_CLAUDE_APPLY_CLIPBOARD
                | MENU_OPEN_EXAMPLE_GUIDE
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

    let app_hangup = app.clone();
    let hangup_name = "terminal-pty-hangup";
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
        // Read side of the master closed (shell usually exited). Front end
        // should call `terminal_kill` + `terminal_spawn` to attach a new shell.
        let _ = app_hangup.emit(hangup_name, true);
    });

    Ok(())
}

fn should_reap_pty_on_write_error(err: &std::io::Error) -> bool {
    if matches!(
        err.kind(),
        std::io::ErrorKind::BrokenPipe | std::io::ErrorKind::ConnectionReset
    ) {
        return true;
    }
    #[cfg(unix)]
    if err.raw_os_error() == Some(5) {
        // EIO: write to a master whose slave (shell) has gone away.
        return true;
    }
    false
}

fn write_pty_session(session: &PtySession, data: String) -> Result<(), String> {
    let io_result: std::io::Result<()> = (|| {
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "PTY state is unavailable"))?;
        let writer = writer.as_mut().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "Terminal is not running")
        })?;
        writer.write_all(data.as_bytes())?;
        writer.flush()
    })();

    if let Err(ref e) = io_result {
        if should_reap_pty_on_write_error(e) {
            let _ = kill_pty_session(session);
        }
    }

    io_result.map_err(|e| e.to_string())
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
    file_path: Option<String>,
    cwd: Option<String>,
) -> Result<Option<ClaudeWorkspaceInfo>, String> {
    let command = CommandBuilder::new("claude");
    let mut workspace_info = None;
    let cwd = if let Some(file_path) = file_path {
        let file_path = fs::canonicalize(expand_user_path(file_path.trim(), None))
            .map_err(|error| error.to_string())?;
        let metadata = fs::metadata(&file_path).map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            return Err("Claude can only open a single file path.".to_string());
        }
        let cwd = file_path
            .parent()
            .ok_or_else(|| "Unable to resolve file directory.".to_string())?
            .to_path_buf();
        let info = ClaudeWorkspaceInfo {
            workspace_path: cwd.to_string_lossy().to_string(),
            file_path: file_path.to_string_lossy().to_string(),
        };
        workspace_info = Some(info);
        cwd
    } else if let Some(cwd) = cwd {
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
    )?;

    Ok(workspace_info)
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

/// Strips a trailing `:line` or `:line:col` (compiler / ripgrep style) only when it
/// appears immediately after a known text extension. Do **not** use `split` on
/// the first `:` in the string — that breaks paths that accidentally include
/// time fragments (e.g. `23:15...`) and turns `...TOUR...` into nonsense.
fn strip_editor_line_column_suffix(s: &str) -> &str {
    for ext in [".markdown", ".md", ".txt"] {
        if let Some(i) = s.rfind(ext) {
            if i + ext.len() > s.len() {
                continue;
            }
            if s.get(i..i + ext.len()) != Some(ext) {
                continue;
            }
            let after = &s[i + ext.len()..];
            if after.is_empty() {
                return s;
            }
            if !after.starts_with(':') {
                continue;
            }
            // Remaining must be :digits or :digits:digits
            let after_colon = &after[1..];
            if after_colon.is_empty() {
                return s;
            }
            if let Some((line, col_or_tail)) = after_colon.split_once(':') {
                if !line.chars().all(|c: char| c.is_ascii_digit()) {
                    return s;
                }
                if col_or_tail.is_empty() {
                    return s;
                }
                if col_or_tail.chars().all(|c: char| c.is_ascii_digit()) {
                    return s.get(..i + ext.len()).unwrap_or(s);
                }
            } else if after_colon.chars().all(|c: char| c.is_ascii_digit()) {
                return s.get(..i + ext.len()).unwrap_or(s);
            }
        }
    }
    s
}

#[tauri::command]
fn open_file_path(state: State<'_, TerminalState>, path: String) -> Result<OpenedFile, String> {
    let path = path
        .trim()
        .trim_matches(|character| matches!(character, '"' | '\'' | '`' | '<' | '>' | ')' | '('));
    let path = path.trim_end_matches(|character: char| matches!(character, ',' | ';' | '.'));
    let path = strip_editor_line_column_suffix(path);
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
fn save_file_path(path: String, content: String) -> Result<OpenedFile, String> {
    let path = expand_user_path(path.trim(), None);
    let path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;

    if !metadata.is_file() {
        return Err("Save target is not a file.".to_string());
    }

    fs::write(&path, content).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let content =
        fs::read_to_string(&path).map_err(|_| "File is not valid UTF-8 text.".to_string())?;

    Ok(OpenedFile {
        path: path.to_string_lossy().to_string(),
        name,
        content,
    })
}

/// Writes the document to the given path, creating the file and parent directories if needed.
#[tauri::command]
fn write_document(path: String, content: String) -> Result<OpenedFile, String> {
    let path = expand_user_path(path.trim(), None);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, &content).map_err(|error| error.to_string())?;
    let path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let content =
        fs::read_to_string(&path).map_err(|_| "File is not valid UTF-8 text.".to_string())?;

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
            "cd {} && ./run.sh install-app",
            shell_quote(&root_dir)
        )),
        label: format!("Install current checkout from {root_dir}"),
    }
}

#[tauri::command]
fn sync_app_menu(app: AppHandle<Wry>, params: AppMenuParams) -> Result<(), String> {
    let menu = build_app_menu(
        &app,
        &params.paths,
        params.source_shown,
        params.terminal_shown,
        params.claude_shown,
    )
    .map_err(|error| error.to_string())?;
    app.set_menu(menu)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if url != "https://github.com/DoctorKhan/Lumina" {
        return Err("External URL is not allowed.".to_string());
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&url).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", &url]).status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(&url).status();

    status
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("Unable to open URL; command exited with {status}"))
            }
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .manage(PendingOpenPaths::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_app_menu(app, &[], true, false, false)?;
            app.set_menu(menu)?;
            notify_open_paths_pending(app.handle(), collect_cli_document_paths());
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
            save_file_path,
            write_document,
            sync_app_menu,
            drain_pending_open_paths,
            open_external_url,
            current_checkout_install_info
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                let paths = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .filter(|path| path.is_file() && is_supported_document_path(path))
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>();
                notify_open_paths_pending(app, paths);
            }
            _ => {}
        });
}
