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
    time::Duration,
};
use notify_debouncer_full::{
    new_debouncer,
    notify::{EventKind, RecursiveMode, Watcher},
    DebounceEventResult,
};
use tauri::{
    menu::{AboutMetadata, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime, State, Wry,
};

const MENU_NEW_FILE: &str = "lumina_new_file";
const MENU_OPEN_FILE: &str = "lumina_open_file";
const MENU_OPEN_LAST_FILE: &str = "lumina_open_last_file";
const MENU_OPEN_RECENT_FILE_PREFIX: &str = "lumina_open_recent_file:";
const MENU_NO_RECENT_FILES: &str = "lumina_no_recent_files";
const MENU_SAVE: &str = "lumina_save";
const MENU_SAVE_AS: &str = "lumina_save_as";
const MENU_UNDO: &str = "lumina_undo";
const MENU_REDO: &str = "lumina_redo";
const MENU_FIND: &str = "lumina_find";
const MENU_FIND_REPLACE: &str = "lumina_find_replace";
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

/// Holds the live filesystem watcher for the currently open document. The
/// debouncer is boxed as `Any` so we don't have to name its generic watcher/cache
/// types; keeping it here keeps the background watch thread alive, and replacing
/// or clearing it stops the previous watch.
#[derive(Default)]
struct FileWatchState {
    debouncer: Mutex<Option<Box<dyn std::any::Any + Send>>>,
}

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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenedFile {
    path: String,
    name: String,
    content: String,
    modified_ms: u64,
}

fn file_modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Reads a file into the `OpenedFile` shape the frontend already understands.
/// Returns `None` for transient failures (e.g. the file is mid-write during an
/// atomic save) so the watcher can simply skip that event.
fn read_opened_file(path: &Path) -> Option<OpenedFile> {
    let content = fs::read_to_string(path).ok()?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled")
        .to_string();
    Some(OpenedFile {
        modified_ms: file_modified_ms(path),
        path: path.to_string_lossy().to_string(),
        name,
        content,
    })
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
struct SourceDirInfo {
    available: bool,
    path: Option<String>,
    label: String,
}

fn looks_like_lumina_source(dir: &Path) -> bool {
    dir.join("run.sh").is_file()
        && dir.join("src-tauri").join("Cargo.toml").is_file()
        && dir.join("package.json").is_file()
}

fn find_lumina_source_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(root) = manifest_dir.parent() {
            if looks_like_lumina_source(root) {
                if let Ok(canonical) = fs::canonicalize(root) {
                    return Some(canonical);
                }
                return Some(root.to_path_buf());
            }
        }
    }

    let home = env::var_os("HOME").map(PathBuf::from)?;
    for candidate in [
        home.join("Documents/Projects/Lumina"),
        home.join("Projects/Lumina"),
        home.join("dev/Lumina"),
        home.join("src/Lumina"),
        home.join("code/Lumina"),
    ] {
        if looks_like_lumina_source(&candidate) {
            if let Ok(canonical) = fs::canonicalize(&candidate) {
                return Some(canonical);
            }
            return Some(candidate);
        }
    }
    None
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
    let new_file = menu_item(manager, MENU_NEW_FILE, "New", Some("CmdOrCtrl+N"))?;
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
    let find = menu_item(manager, MENU_FIND, "Find…", Some("CmdOrCtrl+F"))?;
    let find_replace = menu_item(
        manager,
        MENU_FIND_REPLACE,
        "Find and Replace…",
        Some("CmdOrCtrl+Alt+F"),
    )?;
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
        .item(&new_file)
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
        .item(&find)
        .item(&find_replace)
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
            MENU_NEW_FILE
                | MENU_OPEN_FILE
                | MENU_OPEN_LAST_FILE
                | MENU_SAVE
                | MENU_SAVE_AS
                | MENU_UNDO
                | MENU_REDO
                | MENU_FIND
                | MENU_FIND_REPLACE
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

/// Reads the working directory of a live process straight from the OS. This is
/// the source of truth for "where is the shell now" — far more reliable than
/// reconstructing it from `cd` keystrokes, which silently miss zoxide/`z` jumps,
/// tab-completion, aliases, `pushd`/`popd`, and history recall. Returns `None`
/// when the process is gone or the platform is unsupported.
fn process_cwd(pid: u32) -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        fs::read_link(format!("/proc/{pid}/cwd")).ok()
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::ffi::OsStrExt;
        let mut info: libc::proc_vnodepathinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_vnodepathinfo>() as libc::c_int;
        // proc_pidinfo returns the number of bytes written, or -1 on error.
        let written = unsafe {
            libc::proc_pidinfo(
                pid as libc::c_int,
                libc::PROC_PIDVNODEPATHINFO,
                0,
                (&mut info as *mut libc::proc_vnodepathinfo).cast::<libc::c_void>(),
                size,
            )
        };
        if written < size {
            return None;
        }
        // `vip_path` is a fixed MAXPATHLEN buffer holding a NUL-terminated path;
        // libc models it as `[[c_char; 32]; 32]`, so read it as one flat slice.
        let raw = &info.pvi_cdir.vip_path;
        let bytes = unsafe {
            std::slice::from_raw_parts(raw.as_ptr().cast::<u8>(), std::mem::size_of_val(raw))
        };
        let len = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
        if len == 0 {
            return None;
        }
        Some(PathBuf::from(std::ffi::OsStr::from_bytes(&bytes[..len])))
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = pid;
        None
    }
}

/// The live working directory of a PTY session's shell, if it can be read.
fn session_live_cwd(session: &PtySession) -> Option<PathBuf> {
    let pid = session.child.lock().ok()?.as_ref()?.process_id()?;
    let cwd = process_cwd(pid)?;
    cwd.is_dir().then_some(cwd)
}

/// Best-effort base directory for resolving relative paths the user clicks in
/// the terminal or types into the open-file box. Prefers the terminal shell's
/// *actual* working directory (read from the OS), falling back to the cwd we
/// track from `cd` keystrokes when that lookup is unavailable.
fn resolve_relative_base(state: &TerminalState) -> Option<PathBuf> {
    if let Some(cwd) = session_live_cwd(&state.terminal) {
        return Some(cwd);
    }
    state
        .cwd
        .lock()
        .ok()
        .and_then(|cwd| cwd.clone())
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
fn home_dir_path() -> Result<String, String> {
    env::var_os("HOME")
        .map(|home| home.to_string_lossy().to_string())
        .ok_or_else(|| "HOME is not set.".to_string())
}

#[tauri::command]
fn complete_file_path(
    state: State<'_, TerminalState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<String>, String> {
    let limit = limit.unwrap_or(25).min(50);
    let base = resolve_relative_base(&state);
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let expanded = expand_user_path(query, base.as_ref());
    let (dir, prefix) = if query.ends_with('/') {
        (
            if expanded.is_dir() {
                expanded
            } else {
                expanded
                    .parent()
                    .map(|parent| parent.to_path_buf())
                    .unwrap_or(expanded)
            },
            String::new(),
        )
    } else {
        let prefix = expanded
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();
        let parent = expanded
            .parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("/"));
        (parent, prefix)
    };

    let mut matches = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|error| format!("{}: {error}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_supported_document_path(&path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if prefix.is_empty() || name.to_lowercase().starts_with(&prefix.to_lowercase()) {
            matches.push(path.to_string_lossy().to_string());
        }
    }

    matches.sort();
    matches.truncate(limit);
    Ok(matches)
}

#[tauri::command]
fn open_file_path(state: State<'_, TerminalState>, path: String) -> Result<OpenedFile, String> {
    let path = path
        .trim()
        .trim_matches(|character| matches!(character, '"' | '\'' | '`' | '<' | '>' | ')' | '('));
    let path = path.trim_end_matches(|character: char| matches!(character, ',' | ';' | '.'));
    let path = strip_editor_line_column_suffix(path);
    let base = resolve_relative_base(&state);
    let path = expand_user_path(path, base.as_ref());
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
        modified_ms: file_modified_ms(&path),
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
        modified_ms: file_modified_ms(&path),
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
        modified_ms: file_modified_ms(&path),
        path: path.to_string_lossy().to_string(),
        name,
        content,
    })
}

#[tauri::command]
fn current_checkout_install_info() -> CheckoutInstallInfo {
    let Some(root_dir) = find_lumina_source_dir() else {
        return CheckoutInstallInfo {
            available: false,
            command: None,
            label: "No Lumina source checkout was found in the usual locations.".to_string(),
        };
    };

    let root_dir = root_dir.to_string_lossy().to_string();
    CheckoutInstallInfo {
        available: true,
        command: Some(format!(
            "cd {} && LUMINA_LOCAL_BUILD=1 bash install.sh",
            shell_quote(&root_dir)
        )),
        label: format!("Install current checkout from {root_dir}"),
    }
}

#[tauri::command]
fn source_dir_info() -> SourceDirInfo {
    match find_lumina_source_dir() {
        Some(dir) => {
            let path = dir.to_string_lossy().to_string();
            SourceDirInfo {
                available: true,
                label: format!("Lumina source at {path}"),
                path: Some(path),
            }
        }
        None => SourceDirInfo {
            available: false,
            path: None,
            label: "No Lumina source checkout found".to_string(),
        },
    }
}

#[tauri::command]
fn poll_file_for_changes(path: String, known_modified_ms: u64) -> Result<Option<OpenedFile>, String> {
    let path = PathBuf::from(path.trim());
    let path = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let mtime = file_modified_ms(&path);
    if mtime <= known_modified_ms {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|_| "File is not valid UTF-8 text.".to_string())?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();
    Ok(Some(OpenedFile {
        modified_ms: mtime,
        path: path.to_string_lossy().to_string(),
        name,
        content,
    }))
}

/// Starts watching `path` for external changes and emits `lumina-file-changed`
/// (an `OpenedFile`) whenever it is modified. Replaces any previous watch.
///
/// We watch the file's *parent directory* (non-recursive) and match by file name
/// rather than watching the file inode directly: editors and Claude commonly save
/// atomically by writing a temp file and renaming it over the target, which would
/// silently break an inode-level watch. Matching by name in the parent dir keeps
/// the watch alive across those rename-replace saves, like VS Code does.
#[tauri::command]
fn watch_file(
    app: AppHandle<Wry>,
    state: State<'_, FileWatchState>,
    path: String,
) -> Result<(), String> {
    let path = fs::canonicalize(PathBuf::from(path.trim())).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Watched file has no parent directory.".to_string())?
        .to_path_buf();
    let target_name = path.file_name().map(|name| name.to_os_string());

    let app_handle = app.clone();
    let watched = path.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };
            let touched_target = events.iter().any(|event| {
                matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_))
                    && event
                        .paths
                        .iter()
                        .any(|changed| changed.file_name() == target_name.as_deref())
            });
            if touched_target {
                if let Some(file) = read_opened_file(&watched) {
                    let _ = app_handle.emit("lumina-file-changed", file);
                }
            }
        },
    )
    .map_err(|error| error.to_string())?;

    debouncer
        .watcher()
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|error| error.to_string())?;

    let mut guard = state
        .debouncer
        .lock()
        .map_err(|_| "File watch state is unavailable.".to_string())?;
    *guard = Some(Box::new(debouncer));
    Ok(())
}

/// Stops watching the current document, if any. Dropping the stored debouncer
/// shuts down its background watch thread.
#[tauri::command]
fn unwatch_file(state: State<'_, FileWatchState>) -> Result<(), String> {
    let mut guard = state
        .debouncer
        .lock()
        .map_err(|_| "File watch state is unavailable.".to_string())?;
    *guard = None;
    Ok(())
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitFileEntry {
    path: String,
    status: String,
    staged: bool,
    untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusInfo {
    repo_root: String,
    branch: String,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    staged: Vec<GitFileEntry>,
    unstaged: Vec<GitFileEntry>,
    untracked: Vec<GitFileEntry>,
    clean: bool,
}

fn git_repo_root(start: &Path) -> Result<PathBuf, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(start)
        .output()
        .map_err(|error| format!("Unable to run git: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Not a git repository.".to_string()
        } else {
            stderr
        });
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err("Not a git repository.".to_string());
    }
    Ok(PathBuf::from(path))
}

fn resolve_git_root(
    state: &State<'_, TerminalState>,
    cwd_override: Option<&str>,
) -> Result<PathBuf, String> {
    let start = if let Some(path) = cwd_override.map(str::trim).filter(|p| !p.is_empty()) {
        let expanded = expand_user_path(path, None);
        fs::canonicalize(&expanded).unwrap_or(expanded)
    } else {
        state
            .cwd
            .lock()
            .map_err(|_| "Terminal state is unavailable.".to_string())?
            .clone()
            .unwrap_or_else(default_cwd)
    };
    git_repo_root(&start)
}

fn run_git(
    repo: &Path,
    args: &[&str],
    stdin: Option<&str>,
) -> Result<std::process::Output, String> {
    use std::process::Stdio;
    let mut command = Command::new("git");
    command
        .current_dir(repo)
        // Never let git block waiting for interactive credential or prompt input;
        // fail fast instead so the UI does not hang.
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if stdin.is_some() {
        command.stdin(Stdio::piped());
    } else {
        command.stdin(Stdio::null());
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to run git: {error}"))?;
    if let Some(data) = stdin {
        if let Some(mut writer) = child.stdin.take() {
            writer
                .write_all(data.as_bytes())
                .map_err(|error| error.to_string())?;
        }
    }
    child
        .wait_with_output()
        .map_err(|error| error.to_string())
}

fn ok_git_output(output: std::process::Output) -> Result<String, String> {
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git exited with {}", output.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_branch_line(line: &str) -> (String, Option<String>, u32, u32) {
    // "## main...origin/main [ahead 1, behind 2]"  or  "## main"  or  "## HEAD (no branch)"
    let rest = line.trim_start_matches("## ").trim();
    if rest.starts_with("HEAD (no branch)") {
        return ("HEAD (detached)".to_string(), None, 0, 0);
    }
    let (head_part, track_part) = match rest.find(" [") {
        Some(i) => (rest[..i].to_string(), Some(&rest[i + 2..rest.len() - 1])),
        None => (rest.to_string(), None),
    };
    let (branch, upstream) = match head_part.split_once("...") {
        Some((b, u)) => (b.to_string(), Some(u.to_string())),
        None => (head_part, None),
    };
    let mut ahead = 0;
    let mut behind = 0;
    if let Some(track) = track_part {
        for segment in track.split(", ") {
            if let Some(rest) = segment.strip_prefix("ahead ") {
                ahead = rest.parse().unwrap_or(0);
            } else if let Some(rest) = segment.strip_prefix("behind ") {
                behind = rest.parse().unwrap_or(0);
            }
        }
    }
    (branch, upstream, ahead, behind)
}

fn parse_porcelain_path(rest: &str) -> String {
    // For renames, porcelain v1 gives "newpath -> oldpath". Keep the new path.
    if let Some((new_path, _)) = rest.split_once(" -> ") {
        new_path.to_string()
    } else {
        rest.to_string()
    }
}

#[tauri::command]
async fn git_status(
    state: State<'_, TerminalState>,
    cwd: Option<String>,
) -> Result<GitStatusInfo, String> {
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let output = run_git(&repo, &["status", "--porcelain=v1", "--branch", "-uall"], None)?;
    let text = ok_git_output(output)?;

    let mut branch = String::from("(unknown)");
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for raw_line in text.lines() {
        if raw_line.starts_with("## ") {
            let parsed = parse_branch_line(raw_line);
            branch = parsed.0;
            upstream = parsed.1;
            ahead = parsed.2;
            behind = parsed.3;
            continue;
        }
        if raw_line.len() < 3 {
            continue;
        }
        let index_status = raw_line.chars().next().unwrap_or(' ');
        let worktree_status = raw_line.chars().nth(1).unwrap_or(' ');
        let path = parse_porcelain_path(&raw_line[3..]);

        if index_status == '?' && worktree_status == '?' {
            untracked.push(GitFileEntry {
                path,
                status: "??".to_string(),
                staged: false,
                untracked: true,
            });
            continue;
        }

        if index_status != ' ' && index_status != '?' {
            staged.push(GitFileEntry {
                path: path.clone(),
                status: index_status.to_string(),
                staged: true,
                untracked: false,
            });
        }
        if worktree_status != ' ' && worktree_status != '?' {
            unstaged.push(GitFileEntry {
                path,
                status: worktree_status.to_string(),
                staged: false,
                untracked: false,
            });
        }
    }

    let clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();
    Ok(GitStatusInfo {
        repo_root: repo.to_string_lossy().to_string(),
        branch,
        upstream,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        clean,
    })
}

#[tauri::command]
async fn git_diff(
    state: State<'_, TerminalState>,
    path: String,
    staged: bool,
    untracked: bool,
    cwd: Option<String>,
) -> Result<String, String> {
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    if untracked {
        // git diff doesn't show untracked files; emulate it by diffing against /dev/null.
        let output = run_git(
            &repo,
            &["diff", "--no-color", "--no-index", "--", "/dev/null", &path],
            None,
        )?;
        // git diff --no-index returns 1 when files differ, which is expected.
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&path);
    let output = run_git(&repo, &args, None)?;
    Ok(ok_git_output(output)?)
}

#[tauri::command]
async fn git_stage(
    state: State<'_, TerminalState>,
    paths: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let mut args: Vec<&str> = vec!["add", "--"];
    for path in &paths {
        args.push(path);
    }
    ok_git_output(run_git(&repo, &args, None)?)?;
    Ok(())
}

#[tauri::command]
async fn git_unstage(
    state: State<'_, TerminalState>,
    paths: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    for path in &paths {
        args.push(path);
    }
    ok_git_output(run_git(&repo, &args, None)?)?;
    Ok(())
}

#[tauri::command]
async fn git_commit(
    state: State<'_, TerminalState>,
    message: String,
    cwd: Option<String>,
) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message is empty.".to_string());
    }
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let output = run_git(&repo, &["commit", "-F", "-"], Some(&message))?;
    ok_git_output(output)
}

#[tauri::command]
async fn git_pull(state: State<'_, TerminalState>, cwd: Option<String>) -> Result<String, String> {
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let output = run_git(&repo, &["pull", "--ff-only"], None)?;
    ok_git_output(output)
}

#[tauri::command]
async fn git_push(state: State<'_, TerminalState>, cwd: Option<String>) -> Result<String, String> {
    let repo = resolve_git_root(&state, cwd.as_deref())?;
    let output = run_git(&repo, &["push"], None)?;
    ok_git_output(output)
}

/// Cap diff text fed to Claude so the prompt stays a reasonable size.
fn truncate_for_prompt(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let mut end = limit;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n…(diff truncated)…\n", &text[..end])
}

#[tauri::command]
async fn git_generate_commit_message(
    state: State<'_, TerminalState>,
    cwd: Option<String>,
) -> Result<String, String> {
    let repo = resolve_git_root(&state, cwd.as_deref())?;

    let staged = ok_git_output(run_git(&repo, &["diff", "--cached", "--no-color"], None)?)?;
    if staged.trim().is_empty() {
        return Err("Stage changes before generating a commit message.".to_string());
    }
    let recent = run_git(&repo, &["log", "-8", "--oneline"], None)
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
        .unwrap_or_default();

    let mut prompt = String::new();
    prompt.push_str("Write a git commit message for the following staged changes.\n");
    prompt.push_str("Rules:\n");
    prompt.push_str("- Return ONLY the commit message text, with no markdown fences or preamble.\n");
    prompt.push_str("- First line must be <= 72 chars and in imperative mood.\n");
    prompt.push_str("- Add a blank line then optional body bullets only when useful.\n");
    prompt.push_str("- Focus on why the change exists. Do not invent changes absent from the diff.\n\n");
    prompt.push_str("Recent commit style:\n");
    prompt.push_str(&recent);
    prompt.push_str("\nStaged diff:\n");
    prompt.push_str(&truncate_for_prompt(&staged, 24_000));

    let output = Command::new("claude")
        .current_dir(&repo)
        .args(["-p", &prompt])
        .output()
        .map_err(|error| {
            format!(
                "Unable to run claude: {error}. Install the Claude Code CLI to generate messages."
            )
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("claude exited with {}", output.status)
        } else {
            stderr
        });
    }
    let message = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if message.is_empty() {
        return Err("Claude returned an empty commit message.".to_string());
    }
    Ok(message)
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
        .manage(FileWatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
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
            home_dir_path,
            complete_file_path,
            open_file_path,
            save_file_path,
            write_document,
            sync_app_menu,
            drain_pending_open_paths,
            poll_file_for_changes,
            watch_file,
            unwatch_file,
            open_external_url,
            current_checkout_install_info,
            source_dir_info,
            git_status,
            git_diff,
            git_stage,
            git_unstage,
            git_commit,
            git_pull,
            git_push,
            git_generate_commit_message
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
