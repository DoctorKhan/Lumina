mod security;

use security::{
    audit_ipc, extract_pasted_image_paths, is_supported_document_path, validate_agent_message,
    validate_claude_permission_mode, validate_cursor_agent_mode, validate_external_url,
    validate_model_name, validate_pasted_image_attachment_path, validate_path_input,
    validate_read_path, validate_write_path,
};
use notify_debouncer_full::{
    new_debouncer,
    notify::{EventKind, RecursiveMode, Watcher},
    DebounceEventResult,
};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, PoisonError},
    thread,
    time::{Duration, Instant},
};
use std::collections::hash_map::DefaultHasher;
use tauri::{
    menu::{
        AboutMetadata, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder,
    },
    AppHandle, Emitter, Manager, Runtime, State, Wry,
};

const MENU_NEW_FILE: &str = "lumina_new_file";
const MENU_OPEN_FILE: &str = "lumina_open_file";
const MENU_OPEN_LAST_FILE: &str = "lumina_open_last_file";
const MENU_OPEN_RECENT_FILE_PREFIX: &str = "lumina_open_recent_file:";
const MENU_NO_RECENT_FILES: &str = "lumina_no_recent_files";
const MENU_SAVE: &str = "lumina_save";
const MENU_SAVE_AS: &str = "lumina_save_as";
const MENU_EXPORT_PDF: &str = "lumina_export_pdf";
const MENU_EXPORT_PDF_AS: &str = "lumina_export_pdf_as";
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
const MENU_TOGGLE_AGENT: &str = "lumina_toggle_agent";
// One "Assistant" menu covers Claude, Cursor Agent, and Hermes; the webview
// routes each action to whichever provider is active.
const MENU_AI_CONTEXT: &str = "lumina_ai_context";
const MENU_AI_PROMPTS: &str = "lumina_ai_prompts";
const MENU_AI_PULL_FILE: &str = "lumina_ai_pull_file";
const MENU_AI_APPLY_CLIPBOARD: &str = "lumina_ai_apply_clipboard";
const MENU_OPEN_EXAMPLE_GUIDE: &str = "lumina_open_example_guide";
const MENU_OPEN_GITHUB: &str = "lumina_open_github";
const PDF_RENDER_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
struct PtySession {
    child: Mutex<Option<Box<dyn Child + Send + Sync>>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
}

/// The headless `claude` chat session. Unlike the terminal it is not a PTY: we
/// drive the CLI in bidirectional `stream-json` mode over plain pipes and parse
/// the newline-delimited JSON in the webview. `child` keeps the process alive
/// (one long-lived process == one multi-turn conversation); `stdin` is the
/// cloned writer we push user messages into.
#[derive(Default)]
struct ClaudeChat {
    child: Mutex<Option<std::process::Child>>,
    stdin: Mutex<Option<std::process::ChildStdin>>,
}

/// One-shot `cursor agent --print` invocations per user turn. Follow-up turns use
/// `--continue` so the CLI keeps conversation context without a long-lived stdin.
#[derive(Default)]
struct CursorAgentChat {
    child: Mutex<Option<std::process::Child>>,
    has_session: Mutex<bool>,
}

#[derive(Default)]
struct TerminalState {
    tabs: Mutex<HashMap<String, PtySession>>,
    claude_chat: ClaudeChat,
    cursor_agent: CursorAgentChat,
    cwd: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    tab_id: String,
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalHangupEvent {
    tab_id: String,
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

/// Recursive watch on the Lumina source checkout for auto-rebuild. Kept separate
/// from [`FileWatchState`] so document watches and source watches do not clobber
/// each other.
#[derive(Default)]
struct SourceWatchState {
    debouncer: Mutex<Option<Box<dyn std::any::Any + Send>>>,
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
        let mut guard = pending.0.lock().unwrap_or_else(PoisonError::into_inner);
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
    agent_shown: bool,
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
    agent_shown: bool,
) -> tauri::Result<Menu<R>> {
    let new_file = menu_item(manager, MENU_NEW_FILE, "New", Some("CmdOrCtrl+N"))?;
    let open_file = menu_item(manager, MENU_OPEN_FILE, "Open…", Some("CmdOrCtrl+O"))?;
    let open_last_file = menu_item(manager, MENU_OPEN_LAST_FILE, "Reopen Last File", None)?;
    let recent_files_menu = build_recent_files_menu(manager, recent_file_paths)?;
    let save = menu_item(manager, MENU_SAVE, "Save", Some("CmdOrCtrl+S"))?;
    let save_as = menu_item(manager, MENU_SAVE_AS, "Save As…", Some("CmdOrCtrl+Shift+S"))?;
    let export_pdf = menu_item(
        manager,
        MENU_EXPORT_PDF,
        "Export to PDF…",
        Some("CmdOrCtrl+P"),
    )?;
    let export_pdf_as = menu_item(
        manager,
        MENU_EXPORT_PDF_AS,
        "Export PDF As…",
        Some("CmdOrCtrl+Shift+P"),
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
    let toggle_agent = check_menu_item(manager, MENU_TOGGLE_AGENT, "Agent", agent_shown, None)?;
    let ai_context = menu_item(manager, MENU_AI_CONTEXT, "Send Context", None)?;
    let ai_prompts = menu_item(manager, MENU_AI_PROMPTS, "Prompt Presets…", None)?;
    let ai_pull_file = menu_item(manager, MENU_AI_PULL_FILE, "Open Edited File", None)?;
    let ai_apply_clipboard = menu_item(
        manager,
        MENU_AI_APPLY_CLIPBOARD,
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
        .separator()
        .item(&export_pdf)
        .item(&export_pdf_as)
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
        .item(&toggle_agent)
        .build()?;

    // Actions apply to whichever assistant is active (Claude, Cursor Agent, or
    // Hermes); the webview routes them, so one menu serves all three.
    let assistant_menu = SubmenuBuilder::new(manager, "Assistant")
        .item(&ai_context)
        .item(&ai_prompts)
        .separator()
        .item(&ai_pull_file)
        .item(&ai_apply_clipboard)
        .build()?;

    let help_menu = SubmenuBuilder::new(manager, "Help")
        .item(&open_example_guide)
        .build()?;

    MenuBuilder::new(manager)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&assistant_menu)
        .item(&help_menu)
        .build()
}

fn emit_lumina_menu_command(app: &AppHandle, id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("lumina-menu", id);
        return;
    }
    if let Some(window) = app.webview_windows().into_values().next() {
        let _ = window.emit("lumina-menu", id);
        return;
    }
    let _ = app.emit("lumina-menu", id);
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
                | MENU_EXPORT_PDF
                | MENU_EXPORT_PDF_AS
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
                | MENU_TOGGLE_AGENT
                | MENU_AI_CONTEXT
                | MENU_AI_PROMPTS
                | MENU_AI_PULL_FILE
                | MENU_AI_APPLY_CLIPBOARD
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
    if let Ok(tabs) = state.tabs.lock() {
        for session in tabs.values() {
            if let Some(cwd) = session_live_cwd(session) {
                return Some(cwd);
            }
        }
    }
    state.cwd.lock().ok().and_then(|cwd| cwd.clone())
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
    tab_id: String,
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
    let hangup_tab_id = tab_id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let output = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutputEvent {
                            tab_id: tab_id.clone(),
                            data: output,
                        },
                    );
                }
                Err(error) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutputEvent {
                            tab_id: tab_id.clone(),
                            data: format!("\r\nTerminal closed: {error}\r\n"),
                        },
                    );
                    break;
                }
            }
        }
        // Read side of the master closed (shell usually exited). Front end
        // should call `terminal_kill` + `terminal_spawn` to attach a new shell.
        let _ = app_hangup.emit(
            "terminal-pty-hangup",
            TerminalHangupEvent {
                tab_id: hangup_tab_id,
            },
        );
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
        let mut writer = session.writer.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "PTY state is unavailable")
        })?;
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

fn terminal_tab_session<'a>(
    state: &'a TerminalState,
) -> Result<std::sync::MutexGuard<'a, HashMap<String, PtySession>>, String> {
    state
        .tabs
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())
}

fn get_pty_tab_mut<'a>(
    tabs: &'a mut HashMap<String, PtySession>,
    tab_id: &str,
) -> Result<&'a mut PtySession, String> {
    tabs.get_mut(tab_id)
        .ok_or_else(|| format!("Terminal tab '{tab_id}' is not running."))
}

#[tauri::command(async)]
fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    tab_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let tab_id = tab_id.trim().to_string();
    if tab_id.is_empty() {
        return Err("Terminal tab id is required.".to_string());
    }

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

    let mut tabs = terminal_tab_session(&state)?;
    if !tabs.contains_key(&tab_id) {
        tabs.insert(tab_id.clone(), PtySession::default());
    }
    let session = tabs
        .get(&tab_id)
        .ok_or_else(|| "Unable to create terminal tab.".to_string())?;

    spawn_pty_session(
        app,
        session,
        tab_id,
        command,
        cwd,
        rows,
        cols,
    )
}

/// Resolves the working directory for a Claude session from an optional single
/// file path (we open its parent folder) or an explicit directory, falling back
/// to the shared terminal cwd. Returns the resolved cwd and, when a file was
/// given, the workspace info the webview shows in the pane header.
fn resolve_claude_cwd(
    state: &State<'_, TerminalState>,
    file_path: Option<String>,
    cwd: Option<String>,
) -> Result<(PathBuf, Option<ClaudeWorkspaceInfo>), String> {
    if let Some(file_path) = file_path {
        let file_path = fs::canonicalize(expand_user_path(file_path.trim(), None))
            .map_err(|error| error.to_string())?;
        let metadata = fs::metadata(&file_path).map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            return Err("Claude can only open a single file path.".to_string());
        }
        let dir = file_path
            .parent()
            .ok_or_else(|| "Unable to resolve file directory.".to_string())?
            .to_path_buf();
        let info = ClaudeWorkspaceInfo {
            workspace_path: dir.to_string_lossy().to_string(),
            file_path: file_path.to_string_lossy().to_string(),
        };
        Ok((dir, Some(info)))
    } else if let Some(cwd) = cwd {
        let cwd = expand_user_path(cwd.trim(), None);
        let cwd = fs::canonicalize(&cwd).map_err(|error| error.to_string())?;
        if !cwd.is_dir() {
            return Err("Claude cwd is not a directory.".to_string());
        }
        Ok((cwd, None))
    } else {
        let cwd = state
            .cwd
            .lock()
            .map_err(|_| "Terminal state is unavailable.".to_string())?
            .clone()
            .unwrap_or_else(default_cwd);
        Ok((cwd, None))
    }
}

/// Starts a headless Claude chat in bidirectional `stream-json` mode. A reader
/// thread forwards each newline-delimited JSON event to the webview on the
/// `claude-chat` event; user turns are written via `claude_chat_send`. A no-op
/// if a session is already running.
#[tauri::command(async)]
fn claude_chat_start(
    app: AppHandle,
    state: State<'_, TerminalState>,
    file_path: Option<String>,
    cwd: Option<String>,
    open_file_path: Option<String>,
    permission_mode: Option<String>,
    model: Option<String>,
) -> Result<Option<ClaudeWorkspaceInfo>, String> {
    if state
        .claude_chat
        .child
        .lock()
        .map_err(|_| "Claude chat state is unavailable.".to_string())?
        .is_some()
    {
        return Ok(None);
    }

    let (cwd, workspace_info) = resolve_claude_cwd(&state, file_path, cwd)?;

    // In "Develop Lumina" mode the cwd is the Lumina source tree, so `file_path`
    // is not set and `workspace_info` is None — yet the user may have an unrelated
    // document (e.g. a Markdown file with diagrams) open in the editor. Thread that
    // path through here so Claude can read it even though it lives outside cwd.
    let open_doc = open_file_path
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .and_then(|p| {
            validate_path_input(&p).ok()?;
            fs::canonicalize(expand_user_path(&p, None)).ok()
        })
        .filter(|p| validate_read_path(p).is_ok());
    let mode = validate_claude_permission_mode(permission_mode.as_deref())?;

    let mut command = Command::new("claude");
    command
        .arg("-p")
        .arg("--input-format")
        .arg("stream-json")
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--permission-mode")
        .arg(&mode);
    if let Some(model) = model {
        let model = model.trim();
        if !model.is_empty() {
            validate_model_name(model)?;
            command.arg("--model").arg(model);
        }
    }
    // Tell Claude which file is the open document so a bare "fix this" or "the
    // document" resolves to it by default, without the webview re-pasting file
    // content on every turn. Mid-session file switches are handled by the
    // "Now editing:" note the webview sends.
    if let Some(info) = workspace_info.as_ref() {
        command.arg("--append-system-prompt").arg(format!(
            "The user is editing the file `{}` in the Lumina Markdown editor. \
When they say \"this file\", \"this document\", \"the doc\", or give an \
instruction without naming a file, they mean that file. Read and edit it \
directly on disk and keep it valid Markdown.",
            info.file_path
        ));
    }
    // Pasted images are saved under `~/.lumina/image-cache/` (see
    // `claude_save_pasted_image`), which lives outside the project `cwd`. Grant
    // read access to that dir so Claude can open pasted-image paths without a
    // permission prompt.
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        let image_cache = home.join(".lumina").join("image-cache");
        command.arg("--add-dir").arg(&image_cache);
    }
    // Grant read access to the open document's directory and tell Claude what
    // "this file" means, for the Develop-Lumina case where it sits outside cwd.
    if let Some(doc) = open_doc.as_ref() {
        if let Some(dir) = doc.parent() {
            command.arg("--add-dir").arg(dir);
        }
        command.arg("--append-system-prompt").arg(format!(
            "The user has the document `{}` open in the Lumina editor. When they \
say \"this file\", \"this document\", \"the doc\", or paste content without \
naming a file, they mean that document — read it directly from disk.",
            doc.to_string_lossy()
        ));
    }
    command.current_dir(&cwd);
    command.env("PATH", terminal_path());
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        format!("Unable to run claude: {error}. Install the Claude Code CLI to use the chat pane.")
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Claude stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Claude stdout is unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Claude stderr is unavailable.".to_string())?;

    // Forward each JSON line verbatim; parsing lives in the webview so it stays
    // unit-testable. An empty `__exit` marker tells the UI the process ended.
    let app_out = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if !line.trim().is_empty() => {
                    let _ = app_out.emit("claude-chat", line);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = app_out.emit("claude-chat", "{\"type\":\"__exit\"}".to_string());
    });

    // Surface stderr as a synthetic event so failures (bad flags, auth) show up
    // in the transcript instead of vanishing.
    let app_err = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let payload = serde_json::json!({ "type": "__stderr", "text": line }).to_string();
            let _ = app_err.emit("claude-chat", payload);
        }
    });

    *state
        .claude_chat
        .child
        .lock()
        .map_err(|_| "Claude chat state is unavailable.".to_string())? = Some(child);
    *state
        .claude_chat
        .stdin
        .lock()
        .map_err(|_| "Claude chat state is unavailable.".to_string())? = Some(stdin);

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
fn terminal_write(
    state: State<'_, TerminalState>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    let tab_id = tab_id.trim().to_string();
    let mut tabs = terminal_tab_session(&state)?;
    let session = get_pty_tab_mut(&mut tabs, &tab_id)?;
    write_pty_session(session, data)
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, TerminalState>,
    tab_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let tab_id = tab_id.trim().to_string();
    let mut tabs = terminal_tab_session(&state)?;
    let session = get_pty_tab_mut(&mut tabs, &tab_id)?;
    resize_pty_session(session, rows, cols)
}

#[tauri::command]
fn terminal_kill(state: State<'_, TerminalState>, tab_id: String) -> Result<(), String> {
    let tab_id = tab_id.trim().to_string();
    let mut tabs = terminal_tab_session(&state)?;
    if let Some(session) = tabs.get(&tab_id) {
        kill_pty_session(session)?;
    }
    tabs.remove(&tab_id);
    Ok(())
}

#[tauri::command]
fn terminal_kill_all(state: State<'_, TerminalState>) -> Result<(), String> {
    let mut tabs = state
        .tabs
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?;
    for (_, session) in tabs.drain() {
        let _ = kill_pty_session(&session);
    }
    Ok(())
}

/// Sends one user turn to the running Claude chat as a `stream-json` line.
#[tauri::command]
fn claude_chat_send(state: State<'_, TerminalState>, text: String) -> Result<(), String> {
    let mut guard = state
        .claude_chat
        .stdin
        .lock()
        .map_err(|_| "Claude chat state is unavailable.".to_string())?;
    let stdin = guard
        .as_mut()
        .ok_or_else(|| "Claude chat is not running.".to_string())?;
    let message = serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": text }
    })
    .to_string();
    stdin
        .write_all(message.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|error| error.to_string())
}

/// Stops the running Claude chat (kills the process, drops the stdin writer).
#[tauri::command]
fn claude_chat_stop(state: State<'_, TerminalState>) -> Result<(), String> {
    if let Ok(mut guard) = state.claude_chat.stdin.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.claude_chat.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    Ok(())
}

/// Persists clipboard image bytes under `~/.lumina/image-cache/` so the path can
/// be referenced in a Claude prompt. Returns the absolute file path.
#[tauri::command(async)]
fn claude_save_pasted_image(bytes: Vec<u8>, extension: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("Pasted image is empty.".to_string());
    }
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set.".to_string())?;
    let dir = home.join(".lumina").join("image-cache");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

    let ext = extension
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    let ext = if ext.is_empty() {
        "png".to_string()
    } else {
        ext
    };

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let name = format!("img-{stamp}-{}.{ext}", std::process::id());
    let path = dir.join(name);

    fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn kill_cursor_agent_turn(state: &TerminalState) {
    if let Ok(mut guard) = state.cursor_agent.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn cursor_agent_cwd(
    state: &State<'_, TerminalState>,
    file_path: Option<String>,
    cwd: Option<String>,
) -> Result<PathBuf, String> {
    if let Some(cwd) = cwd {
        let cwd = fs::canonicalize(expand_user_path(cwd.trim(), None))
            .map_err(|error| error.to_string())?;
        if !cwd.is_dir() {
            return Err("Agent cwd is not a directory.".to_string());
        }
        return Ok(cwd);
    }
    if let Some(file_path) = file_path {
        let file_path = fs::canonicalize(expand_user_path(file_path.trim(), None))
            .map_err(|error| error.to_string())?;
        if file_path.is_file() {
            if let Some(dir) = file_path.parent() {
                return fs::canonicalize(dir).map_err(|error| error.to_string());
            }
        }
    }
    let cwd = state
        .cwd
        .lock()
        .map_err(|_| "Terminal state is unavailable.".to_string())?
        .clone()
        .unwrap_or_else(default_cwd);
    fs::canonicalize(&cwd).map_err(|error| error.to_string())
}

/// Runs one Cursor Agent turn via `cursor agent --print --output-format stream-json`.
/// The first turn starts a fresh session; later turns pass `--continue`.
#[tauri::command(async)]
fn cursor_agent_send(
    app: AppHandle,
    state: State<'_, TerminalState>,
    text: String,
    file_path: Option<String>,
    mode: Option<String>,
    force: Option<bool>,
    provider: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let text = validate_agent_message(&text)?;
    validate_cursor_agent_mode(mode.as_deref())?;

    let is_hermes = provider.as_deref() == Some("hermes");

    kill_cursor_agent_turn(&state);

    let cwd = cursor_agent_cwd(&state, file_path, cwd)?;
    let continue_session = *state
        .cursor_agent
        .has_session
        .lock()
        .map_err(|_| "Cursor Agent state is unavailable.".to_string())?;

    let mut command;
    if is_hermes {
        command = Command::new("hermes");
        // `hermes chat` takes no positional message (argparse rejects one with
        // "unrecognized arguments"); it reads the message from stdin, and end of
        // input ends the turn.
        command.arg("chat");
        for path in extract_pasted_image_paths(&text) {
            let validated = validate_pasted_image_attachment_path(&path)?;
            command.arg("--image").arg(validated);
        }
        command.stdin(Stdio::piped());
    } else {
        command = Command::new("cursor");
        command
            .arg("agent")
            .arg("--print")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--trust")
            .arg("--stream-partial-output")
            .arg("--workspace")
            .arg(&cwd);
        if let Some(mode) = mode {
            let mode = mode.trim();
            if mode == "plan" || mode == "ask" {
                command.arg("--mode").arg(mode);
            }
        }
        if force.unwrap_or(false) {
            command.arg("--force");
        }
        if continue_session {
            command.arg("--continue");
        }
        command.arg(&text);
    }
    command.current_dir(&cwd);
    command.env("PATH", terminal_path());
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        if is_hermes {
            format!("Unable to run hermes: {error}. Install the Hermes CLI to use the Agent pane.")
        } else {
            format!(
                "Unable to run cursor agent: {error}. Install the Cursor CLI to use the Agent pane."
            )
        }
    })?;
    if is_hermes {
        // Deliver the message on stdin and close it so hermes ends the turn at EOF.
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Hermes stdin is unavailable.".to_string())?;
        let message = text.clone();
        thread::spawn(move || {
            let _ = stdin.write_all(message.as_bytes());
            let _ = stdin.write_all(b"\n");
        });
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cursor Agent stdout is unavailable.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cursor Agent stderr is unavailable.".to_string())?;

    let app_out = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if !line.trim().is_empty() => {
                    let _ = app_out.emit("cursor-agent-chat", line);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        // `--continue` only exists for the cursor CLI, so a Hermes run must not
        // mark the session as resumable.
        if !is_hermes {
            if let Ok(mut guard) = app_out
                .state::<TerminalState>()
                .cursor_agent
                .has_session
                .lock()
            {
                *guard = true;
            }
        }
        let _ = app_out.emit("cursor-agent-chat", "{\"type\":\"__exit\"}".to_string());
    });

    let app_err = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            let payload = serde_json::json!({ "type": "__stderr", "text": line }).to_string();
            let _ = app_err.emit("cursor-agent-chat", payload);
        }
    });

    *state
        .cursor_agent
        .child
        .lock()
        .map_err(|_| "Cursor Agent state is unavailable.".to_string())? = Some(child);

    Ok(())
}

/// Stops the in-flight Cursor Agent turn and clears conversation context.
#[tauri::command]
fn cursor_agent_stop(state: State<'_, TerminalState>) -> Result<(), String> {
    kill_cursor_agent_turn(&state);
    if let Ok(mut guard) = state.cursor_agent.has_session.lock() {
        *guard = false;
    }
    Ok(())
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

#[tauri::command(async)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirListing {
    path: String,
    parent: Option<String>,
    entries: Vec<DirEntryInfo>,
}

/// Lists immediate children of a directory. Hidden entries (dotfiles), as well
/// as common heavyweight folders (`node_modules`, `.git`, `target`, `dist`), are
/// filtered out. Files are limited to supported document extensions so the Files
/// pane only shows things the editor can actually open.
#[tauri::command(async)]
fn list_directory(
    state: State<'_, TerminalState>,
    path: Option<String>,
) -> Result<DirListing, String> {
    let base = resolve_relative_base(&state);
    let raw = path.as_deref().map(|p| p.trim()).filter(|p| !p.is_empty());

    let target = match raw {
        Some(p) => expand_user_path(p, base.as_ref()),
        None => env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "HOME is not set.".to_string())?,
    };

    let target = fs::canonicalize(&target).map_err(|error| error.to_string())?;
    if !target.is_dir() {
        return Err("Path is not a directory.".to_string());
    }

    let mut entries: Vec<DirEntryInfo> = Vec::new();
    let read = fs::read_dir(&target).map_err(|error| error.to_string())?;
    for entry in read.flatten() {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry_path.is_dir();
        if is_dir {
            if matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
                continue;
            }
        } else if !is_supported_document_path(&entry_path) {
            continue;
        }
        entries.push(DirEntryInfo {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirListing {
        parent: target.parent().map(|p| p.to_string_lossy().to_string()),
        path: target.to_string_lossy().to_string(),
        entries,
    })
}

#[tauri::command(async)]
fn open_file_path(state: State<'_, TerminalState>, path: String) -> Result<OpenedFile, String> {
    let path = path
        .trim()
        .trim_matches(|character| matches!(character, '"' | '\'' | '`' | '<' | '>' | ')' | '('));
    validate_path_input(path)?;
    let path = path.trim_end_matches(|character: char| matches!(character, ',' | ';' | '.'));
    let path = strip_editor_line_column_suffix(path);
    let base = resolve_relative_base(&state);
    let path = expand_user_path(path, base.as_ref());
    let path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
    validate_read_path(&path)?;

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

#[tauri::command(async)]
fn save_file_path(path: String, content: String) -> Result<OpenedFile, String> {
    validate_path_input(path.trim())?;
    let path = expand_user_path(path.trim(), None);
    let path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
    validate_write_path(&path)?;

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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecoverySnapshot {
    path: String,
    content: String,
    updated_ms: u64,
    disk_mtime_ms: u64,
}

const UNTITLED_RECOVERY_ID: &str = "__lumina_untitled__";

fn recovery_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("recovery");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn recovery_id_for_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == UNTITLED_RECOVERY_ID {
        return Ok(UNTITLED_RECOVERY_ID.to_string());
    }
    let expanded = expand_user_path(trimmed, None);
    let canonical = fs::canonicalize(&expanded).map_err(|error| error.to_string())?;
    let mut hasher = DefaultHasher::new();
    canonical.to_string_lossy().hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

fn recovery_file_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let id = recovery_id_for_path(path)?;
    Ok(recovery_storage_dir(app)?.join(format!("{id}.json")))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Persists unsaved editor content to app data so a crash or external overwrite
/// can be recovered without relying on the user pressing Save.
#[tauri::command(async)]
fn write_recovery_snapshot(
    app: AppHandle,
    path: String,
    content: String,
    disk_mtime_ms: u64,
) -> Result<(), String> {
    let snapshot = RecoverySnapshot {
        path: path.trim().to_string(),
        content,
        updated_ms: now_ms(),
        disk_mtime_ms,
    };
    let file_path = recovery_file_path(&app, &path)?;
    let json = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
    fs::write(file_path, json).map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn read_recovery_snapshot(app: AppHandle, path: String) -> Result<Option<RecoverySnapshot>, String> {
    let file_path = recovery_file_path(&app, &path)?;
    if !file_path.is_file() {
        return Ok(None);
    }
    let json = fs::read_to_string(&file_path).map_err(|error| error.to_string())?;
    let snapshot: RecoverySnapshot =
        serde_json::from_str(&json).map_err(|error| error.to_string())?;
    Ok(Some(snapshot))
}

#[tauri::command(async)]
fn delete_recovery_snapshot(app: AppHandle, path: String) -> Result<(), String> {
    let file_path = recovery_file_path(&app, &path)?;
    if file_path.is_file() {
        fs::remove_file(file_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Writes the document to the given path, creating the file and parent directories if needed.
#[tauri::command(async)]
fn write_document(path: String, content: String) -> Result<OpenedFile, String> {
    validate_path_input(path.trim())?;
    let path = expand_user_path(path.trim(), None);
    validate_write_path(&path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, &content).map_err(|error| error.to_string())?;
    audit_ipc("write-document", &path.display().to_string(), true);
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

/// Finds the first Chromium-based browser usable for headless PDF rendering.
/// Honors a `LUMINA_PDF_BROWSER` override, then probes the usual install
/// locations (Chrome, Chromium, Edge, Brave). Returns `None` if none is found,
/// which lets the frontend fall back to the OS print panel.
fn find_chromium_browser() -> Option<PathBuf> {
    if let Some(path) = env::var_os("LUMINA_PDF_BROWSER").map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }

    #[cfg(target_os = "macos")]
    let candidates: &[&str] = &[
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    #[cfg(not(target_os = "macos"))]
    let candidates: &[&str] = &[
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "brave-browser",
    ];

    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.is_absolute() {
            if path.is_file() {
                return Some(path);
            }
        } else if let Some(found) = which_in_path(candidate) {
            return Some(found);
        }
    }
    None
}

/// Resolves a bare executable name against `PATH` (used on non-macOS where the
/// browser candidates are command names rather than absolute app paths).
fn which_in_path(name: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Renders a self-contained HTML document to a PDF at `out_path` using a headless
/// Chromium browser. The frontend builds the HTML from the live preview with all
/// styles and fonts inlined, so the PDF matches what's on screen — no print
/// dialog, written straight to the given path. Returns the final PDF path.
#[tauri::command(async)]
fn export_pdf(html: String, out_path: String) -> Result<String, String> {
    let browser = find_chromium_browser().ok_or_else(|| {
        "No Chromium-based browser (Chrome, Edge, Brave, Chromium) was found for PDF export."
            .to_string()
    })?;

    let out = expand_user_path(out_path.trim(), None);
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    // Chrome loads the document over file://, so stage the HTML in a temp file.
    let tmp_html = env::temp_dir().join(format!("lumina-export-{stamp}-{pid}.html"));
    fs::write(&tmp_html, html.as_bytes()).map_err(|error| error.to_string())?;
    // A throwaway profile avoids colliding with a running browser instance, which
    // would otherwise make --print-to-pdf a no-op.
    let user_data = env::temp_dir().join(format!("lumina-export-profile-{stamp}-{pid}"));

    let render = (|| -> Result<(), String> {
        let mut child = Command::new(&browser)
            .arg("--headless=new")
            .arg("--disable-gpu")
            .arg("--disable-background-networking")
            .arg("--disable-extensions")
            .arg("--no-pdf-header-footer")
            .arg("--no-first-run")
            .arg(format!("--user-data-dir={}", user_data.to_string_lossy()))
            .arg("--virtual-time-budget=10000")
            .arg(format!("--print-to-pdf={}", out.to_string_lossy()))
            .arg(format!("file://{}", tmp_html.to_string_lossy()))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("Unable to run {}: {error}", browser.display()))?;

        let started = Instant::now();
        let status = loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|error| format!("Unable to wait for PDF renderer: {error}"))?
            {
                break status;
            }
            if started.elapsed() >= PDF_RENDER_TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "PDF renderer timed out after {} seconds.",
                    PDF_RENDER_TIMEOUT.as_secs()
                ));
            }
            thread::sleep(Duration::from_millis(100));
        };
        if !status.success() {
            return Err(format!("PDF renderer exited with {status}."));
        }
        if !out.is_file() {
            return Err("PDF renderer produced no output file.".to_string());
        }
        Ok(())
    })();

    let _ = fs::remove_file(&tmp_html);
    let _ = fs::remove_dir_all(&user_data);

    render.map(|_| out.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoVersionInfo {
    latest_tag: Option<String>,
    source: String,
}

fn parse_semver_tag(tag: &str) -> Option<(u32, u32, u32)> {
    let trimmed = tag.trim().trim_start_matches('v');
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn pick_newest_semver_tag(tags: impl IntoIterator<Item = String>) -> Option<String> {
    tags.into_iter()
        .filter_map(|tag| parse_semver_tag(&tag).map(|version| (version, tag)))
        .max_by(|(left, _), (right, _)| left.cmp(right))
        .map(|(_, tag)| tag)
}

fn git_newest_semver_tag_in_dir(dir: &Path) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["tag", "--sort=-v:refname"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("Unable to run git: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let tags = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    Ok(pick_newest_semver_tag(tags))
}

/// Latest semver tag from a local Lumina checkout or, failing that, `git ls-remote`.
#[tauri::command]
fn latest_lumina_repo_tag() -> Result<RepoVersionInfo, String> {
    if let Some(dir) = find_lumina_source_dir() {
        if let Some(tag) = git_newest_semver_tag_in_dir(&dir)? {
            return Ok(RepoVersionInfo {
                latest_tag: Some(tag),
                source: "local".to_string(),
            });
        }
    }

    let output = Command::new("git")
        .args([
            "ls-remote",
            "--tags",
            "https://github.com/DoctorKhan/Lumina.git",
        ])
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("Unable to run git: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git ls-remote failed.".to_string()
        } else {
            stderr
        });
    }

    let tags = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split('\t').nth(1))
        .map(|reference| {
            reference
                .trim_start_matches("refs/tags/")
                .trim_end_matches("^{}")
                .to_string()
        })
        .collect::<Vec<_>>();

    Ok(RepoVersionInfo {
        latest_tag: pick_newest_semver_tag(tags),
        source: "remote".to_string(),
    })
}

fn lumina_repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

/// Turn `git describe` output into a compact dev suffix (e.g. `git.abc1234`, `git.abc1234-dirty`).
fn dev_git_suffix(describe: &str) -> Option<String> {
    let mut s = describe.trim().trim_start_matches('v').to_string();
    if s.is_empty() {
        return None;
    }

    let dirty = s.ends_with("-dirty");
    if dirty {
        s.truncate(s.len() - "-dirty".len());
    }

    // Exact semver tag with no commits since tag — no dev suffix.
    if parse_semver_tag(&s).is_some() {
        return if dirty {
            Some("git.dirty".to_string())
        } else {
            None
        };
    }

    // Commits after tag: 0.3.19-4-gabc1234
    if let Some(g_idx) = s.rfind("-g") {
        let hash: String = s[g_idx + 2..]
            .chars()
            .take_while(|c| c.is_ascii_hexdigit())
            .take(7)
            .collect();
        if !hash.is_empty() {
            return Some(if dirty {
                format!("git.{hash}-dirty")
            } else {
                format!("git.{hash}")
            });
        }
    }

    // Detached HEAD / no tags: short commit hash only.
    if s.chars().all(|c| c.is_ascii_hexdigit()) {
        let short: String = s.chars().take(7).collect();
        return Some(if dirty {
            format!("git.{short}-dirty")
        } else {
            format!("git.{short}")
        });
    }

    None
}

fn git_describe_suffix(repo_root: &Path) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .args(["describe", "--tags", "--always", "--dirty"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let describe = String::from_utf8_lossy(&output.stdout).trim().to_string();
    dev_git_suffix(&describe)
}

/// Display label for the title-bar version badge. Dev builds append a git suffix.
#[tauri::command]
fn app_version_label() -> String {
    let base = env!("CARGO_PKG_VERSION").to_string();
    if !cfg!(debug_assertions) {
        return base;
    }

    match git_describe_suffix(&lumina_repo_root()) {
        Some(suffix) => format!("{base}+{suffix}"),
        None => base,
    }
}

#[cfg(test)]
mod version_label_tests {
    use super::dev_git_suffix;

    #[test]
    fn dev_git_suffix_from_exact_tag_is_none() {
        assert_eq!(dev_git_suffix("v0.3.19"), None);
        assert_eq!(dev_git_suffix("v0.3.19-dirty"), Some("git.dirty".to_string()));
    }

    #[test]
    fn dev_git_suffix_from_describe_includes_short_hash() {
        assert_eq!(
            dev_git_suffix("v0.3.19-4-gdeadbeef"),
            Some("git.deadbee".to_string())
        );
    }

    #[test]
    fn dev_git_suffix_from_commit_only() {
        assert_eq!(dev_git_suffix("abc1234"), Some("git.abc1234".to_string()));
    }
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

#[tauri::command(async)]
fn poll_file_for_changes(
    path: String,
    known_modified_ms: u64,
) -> Result<Option<OpenedFile>, String> {
    let path = PathBuf::from(path.trim());
    let path = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let mtime = file_modified_ms(&path);
    if mtime <= known_modified_ms {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&path).map_err(|_| "File is not valid UTF-8 text.".to_string())?;
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
#[tauri::command(async)]
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

fn source_watch_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".DS_Store" | "gen"
    )
}

fn is_relevant_source_change(root: &Path, changed: &Path) -> bool {
    let Ok(relative) = changed.strip_prefix(root) else {
        return false;
    };
    for component in relative.components() {
        if let std::path::Component::Normal(name) = component {
            if source_watch_skip_dir(name.to_str().unwrap_or("")) {
                return false;
            }
        }
    }
    if changed
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| matches!(name, "Cargo.lock" | "pnpm-lock.yaml"))
    {
        return false;
    }
    changed.is_file()
}

/// Watches a Lumina source checkout recursively and emits `lumina-source-changed`
/// when relevant files change (build artifacts and dependency dirs are ignored).
#[tauri::command(async)]
fn watch_source_checkout(
    app: AppHandle<Wry>,
    state: State<'_, SourceWatchState>,
    path: String,
) -> Result<(), String> {
    let root = fs::canonicalize(PathBuf::from(path.trim())).map_err(|error| error.to_string())?;
    if !looks_like_lumina_source(&root) {
        return Err("Path does not look like a Lumina source checkout.".to_string());
    }

    let app_handle = app.clone();
    let watched_root = root.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(1200),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else {
                return;
            };
            let changed = events.iter().any(|event| {
                matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_))
                    && event.paths.iter().any(|path| {
                        is_relevant_source_change(&watched_root, path)
                    })
            });
            if changed {
                let _ = app_handle.emit("lumina-source-changed", ());
            }
        },
    )
    .map_err(|error| error.to_string())?;

    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let mut guard = state
        .debouncer
        .lock()
        .map_err(|_| "Source watch state is unavailable.".to_string())?;
    *guard = Some(Box::new(debouncer));
    Ok(())
}

#[tauri::command]
fn unwatch_source_checkout(state: State<'_, SourceWatchState>) -> Result<(), String> {
    let mut guard = state
        .debouncer
        .lock()
        .map_err(|_| "Source watch state is unavailable.".to_string())?;
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
        params.agent_shown,
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
    child.wait_with_output().map_err(|error| error.to_string())
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
    let output = run_git(
        &repo,
        &["status", "--porcelain=v1", "--branch", "-uall"],
        None,
    )?;
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

#[derive(Serialize, Clone)]
struct GeneratedCommitMessage {
    message: String,
    source: String,
    notice: Option<String>,
}

struct StagedPathChange {
    path: String,
}

fn parse_staged_name_status(raw: &str) -> Vec<StagedPathChange> {
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let path = line
                .split('\t')
                .last()
                .map(str::trim)
                .filter(|path| !path.is_empty())?;
            Some(StagedPathChange {
                path: path.to_string(),
            })
        })
        .collect()
}

fn recent_commit_prefix(recent: &str) -> &'static str {
    for line in recent.lines() {
        let subject = line.split_whitespace().skip(1).collect::<Vec<_>>().join(" ");
        for prefix in [
            "feat", "fix", "chore", "refactor", "test", "docs", "style", "perf",
        ] {
            if subject.starts_with(&format!("{prefix}:")) {
                return prefix;
            }
        }
    }
    "chore"
}

fn path_summary(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn infer_local_commit_message(repo: &Path, recent: &str) -> Result<String, String> {
    let name_status = ok_git_output(run_git(
        repo,
        &["diff", "--cached", "--name-status"],
        None,
    )?)?;
    let entries = parse_staged_name_status(&name_status);
    if entries.is_empty() {
        return Err("Stage changes before generating a commit message.".to_string());
    }

    let prefix = recent_commit_prefix(recent);
    let primary = path_summary(&entries[0].path);
    let subject = if entries.len() == 1 {
        format!("{prefix}: update {primary}")
    } else {
        format!(
            "{prefix}: update {primary} and {} other staged file(s)",
            entries.len() - 1
        )
    };

    let body = if entries.len() <= 6 {
        entries
            .iter()
            .map(|entry| format!("- {}", entry.path))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        format!("- {} staged files changed", entries.len())
    };

    Ok(format!("{subject}\n\n{body}"))
}

/// Strip markdown fences and common preambles from a one-shot model response.
fn normalize_commit_message(raw: &str) -> String {
    let mut message = raw.trim().to_string();
    if message.starts_with("```") {
        if let Some(start) = message.find('\n') {
            message = message[start + 1..].to_string();
        }
        if let Some(end) = message.rfind("```") {
            message = message[..end].trim_end().to_string();
        }
    }
    for prefix in [
        "Here is the commit message:",
        "Here's the commit message:",
        "Commit message:",
        "Suggested commit message:",
    ] {
        if message.len() >= prefix.len()
            && message[..prefix.len()].eq_ignore_ascii_case(prefix)
        {
            message = message[prefix.len()..].trim_start().to_string();
            break;
        }
    }
    message.trim().to_string()
}

fn normalize_hermes_print_output(raw: &str) -> String {
    let filtered = raw
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with("session_id:")
                && !line.contains("Reached maximum iterations")
                && !line.starts_with("API call failed")
        })
        .collect::<Vec<_>>()
        .join("\n");
    normalize_commit_message(&filtered)
}

fn hermes_print_text(prompt: &str, cwd: &Path) -> Result<String, String> {
    use std::process::Stdio;

    // One-shot query mode: no toolsets, quiet output, bounded turns.
    let output = Command::new("hermes")
        .current_dir(cwd)
        .env("PATH", terminal_path())
        .arg("chat")
        .arg("-q")
        .arg(prompt)
        .arg("-Q")
        .arg("--max-turns")
        .arg("3")
        .arg("-t")
        .arg("")
        .arg("--yolo")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            format!(
                "Unable to run hermes: {error}. Install the Hermes CLI to generate messages."
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("hermes exited with {}", output.status)
        };
        return Err(detail);
    }

    let message = normalize_hermes_print_output(if stdout.is_empty() { &stderr } else { &stdout });
    if message.is_empty() {
        return Err("Hermes returned an empty commit message.".to_string());
    }
    Ok(message)
}

#[tauri::command]
async fn git_generate_commit_message(
    state: State<'_, TerminalState>,
    cwd: Option<String>,
) -> Result<GeneratedCommitMessage, String> {
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
    prompt
        .push_str("- Return ONLY the commit message text, with no markdown fences or preamble.\n");
    prompt.push_str("- First line must be <= 72 chars and in imperative mood.\n");
    prompt.push_str("- Add a blank line then optional body bullets only when useful.\n");
    prompt.push_str(
        "- Focus on why the change exists. Do not invent changes absent from the diff.\n\n",
    );
    prompt.push_str("Recent commit style:\n");
    prompt.push_str(&recent);
    prompt.push_str("\nStaged diff:\n");
    prompt.push_str(&truncate_for_prompt(&staged, 24_000));

    match hermes_print_text(&prompt, &repo) {
        Ok(message) => Ok(GeneratedCommitMessage {
            message,
            source: "hermes".to_string(),
            notice: None,
        }),
        Err(error) => {
            let message = infer_local_commit_message(&repo, &recent)?;
            let detail = error.lines().next().unwrap_or(&error).trim();
            Ok(GeneratedCommitMessage {
                message,
                source: "local".to_string(),
                notice: Some(format!(
                    "Hermes unavailable ({detail}) — using a local draft."
                )),
            })
        }
    }
}

#[tauri::command(async)]
fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;

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

/// Reveals a file in the OS file manager with the item selected (Finder on
/// macOS, Explorer on Windows, the containing folder via `xdg-open` elsewhere).
#[tauri::command(async)]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let path = expand_user_path(path.trim(), None);
    if !path.exists() {
        return Err("File does not exist.".to_string());
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg("-R").arg(&path).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = {
        // No portable "select the file" flag; open the containing directory.
        let target = path.parent().unwrap_or(&path).to_path_buf();
        Command::new("xdg-open").arg(&target).status()
    };

    status
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "Unable to reveal file; command exited with {status}"
                ))
            }
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .manage(PendingOpenPaths::default())
        .manage(FileWatchState::default())
        .manage(SourceWatchState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let menu = build_app_menu(app, &[], true, false, false, false)?;
            app.set_menu(menu)?;
            notify_open_paths_pending(app.handle(), collect_cli_document_paths());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if is_lumina_menu_id(id) {
                emit_lumina_menu_command(app, id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_kill_all,
            terminal_set_cwd,
            claude_chat_start,
            claude_chat_send,
            claude_chat_stop,
            claude_save_pasted_image,
            cursor_agent_send,
            cursor_agent_stop,
            home_dir_path,
            complete_file_path,
            list_directory,
            open_file_path,
            save_file_path,
            write_document,
            write_recovery_snapshot,
            read_recovery_snapshot,
            delete_recovery_snapshot,
            export_pdf,
            reveal_in_file_manager,
            sync_app_menu,
            drain_pending_open_paths,
            poll_file_for_changes,
            watch_file,
            unwatch_file,
            watch_source_checkout,
            unwatch_source_checkout,
            open_external_url,
            current_checkout_install_info,
            latest_lumina_repo_tag,
            app_version_label,
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

#[cfg(test)]
mod commit_message_tests {
    use super::{
        infer_local_commit_message, normalize_commit_message, normalize_hermes_print_output,
        parse_staged_name_status, recent_commit_prefix,
    };
    use std::fs;
    use std::process::Command;

    #[test]
    fn strips_markdown_fences() {
        let raw = "```\nfix: populate git commit message field\n\nBody line.\n```";
        assert_eq!(
            normalize_commit_message(raw),
            "fix: populate git commit message field\n\nBody line."
        );
    }

    #[test]
    fn strips_common_preamble() {
        let raw = "Commit message:\n\nfeat: add security policy layer";
        assert_eq!(
            normalize_commit_message(raw),
            "feat: add security policy layer"
        );
    }

    #[test]
    fn strips_hermes_session_metadata() {
        let raw = "session_id: abc123\n\nfeat: add GitHub share link\n";
        assert_eq!(
            normalize_hermes_print_output(raw),
            "feat: add GitHub share link"
        );
    }

    #[test]
    fn parses_name_status_lines() {
        let entries = parse_staged_name_status("M\tsrc/main.js\nA\ttest/new.test.js");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "src/main.js");
        assert_eq!(entries[1].path, "test/new.test.js");
    }

    #[test]
    fn recent_prefix_follows_repo_style() {
        assert_eq!(
            recent_commit_prefix("abc1234 feat: add widget\n"),
            "feat"
        );
    }

    #[test]
    fn local_commit_message_uses_staged_paths() {
        use std::path::PathBuf;
        use std::time::{SystemTime, UNIX_EPOCH};

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let repo: PathBuf = std::env::temp_dir().join(format!("lumina-commit-test-{stamp}"));
        fs::create_dir_all(&repo).expect("create temp repo dir");
        Command::new("git")
            .args(["init", "-q"])
            .current_dir(&repo)
            .output()
            .expect("git init");
        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&repo)
            .output()
            .expect("git config email");
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&repo)
            .output()
            .expect("git config name");
        fs::write(repo.join("notes.md"), "hello").expect("write file");
        Command::new("git")
            .args(["add", "notes.md"])
            .current_dir(&repo)
            .output()
            .expect("git add");

        let message = infer_local_commit_message(&repo, "abc feat: seed repo\n").expect("local message");
        assert!(message.starts_with("feat: update notes.md"));
        assert!(message.contains("- notes.md"));

        let _ = fs::remove_dir_all(&repo);
    }
}
