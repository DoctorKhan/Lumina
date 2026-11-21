//! Document windows: one window per open document, grouped into native macOS
//! tabs (`tabbingIdentifier`). Each window runs its own copy of the webview, so
//! the backend only has to know which window is which:
//!
//! - which document each window shows (reported by the webview), so opening a
//!   file that is already open focuses its tab instead of loading a second copy;
//! - which paths are waiting to be opened in a window that is still loading;
//! - how to create a new tab or window, and the native title-bar state
//!   (title, file proxy icon, unsaved-changes dot).

use crate::WindowEmitter;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, PoisonError,
    },
};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Windows sharing this identifier can be merged into one tab group.
pub const TABBING_IDENTIFIER: &str = "lumina-documents";
const DOCUMENT_LABEL_PREFIX: &str = "doc-";
const DEFAULT_WIDTH: f64 = 1200.0;
const DEFAULT_HEIGHT: f64 = 800.0;
const CASCADE_OFFSET: f64 = 24.0;

#[derive(Clone, Default)]
struct WindowDocument {
    path: Option<String>,
    /// Untitled, empty, and unchanged: safe to load a file into instead of
    /// opening a new tab.
    pristine: bool,
}

#[derive(Default)]
pub struct DocumentWindows {
    next_id: AtomicUsize,
    documents: Mutex<HashMap<String, WindowDocument>>,
    pending: Mutex<HashMap<String, Vec<String>>>,
}

impl DocumentWindows {
    fn next_label(&self) -> String {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        format!("{DOCUMENT_LABEL_PREFIX}{id}")
    }

    fn queue(&self, label: &str, path: String) {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .entry(label.to_string())
            .or_default()
            .push(path);
    }

    fn take_pending(&self, label: &str) -> Vec<String> {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(label)
            .unwrap_or_default()
    }

    fn window_for_path(&self, path: &str) -> Option<String> {
        self.documents
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .iter()
            .find(|(_, doc)| doc.path.as_deref() == Some(path))
            .map(|(label, _)| label.clone())
    }

    /// A window that has not reported yet is still starting up with nothing
    /// loaded, so it counts as pristine.
    fn is_pristine(&self, label: &str) -> bool {
        self.documents
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(label)
            .is_none_or(|doc| doc.pristine)
    }

    fn set_document(&self, label: &str, doc: WindowDocument) {
        self.documents
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(label.to_string(), doc);
    }

    /// Drops everything known about a closed window.
    pub fn forget(&self, label: &str) {
        self.documents
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(label);
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(label);
        #[cfg(target_os = "macos")]
        macos::forget(label);
    }
}

fn normalize_path(path: &str) -> String {
    let path = path.trim();
    fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .to_string()
}

/// The window the user is working in: the focused one, else `main`, else any.
pub fn active_window(app: &AppHandle) -> Option<WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .cloned()
        .or_else(|| windows.get("main").cloned())
        .or_else(|| windows.into_values().next())
}

fn focus_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Creates a document window. With `as_tab`, it joins `parent`'s tab group;
/// otherwise it opens as a separate window cascaded from `parent`. A `path`
/// is queued for the new window to open once its webview has loaded.
pub fn create_document_window(
    app: &AppHandle,
    path: Option<String>,
    parent: Option<WebviewWindow>,
    as_tab: bool,
) -> Result<WebviewWindow, String> {
    let state = app.state::<DocumentWindows>();
    let label = state.next_label();
    if let Some(path) = path {
        state.queue(&label, path);
    }

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Lumina")
        .inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT)
        .resizable(true);

    if let Some(parent) = parent.as_ref() {
        if let Ok(scale) = parent.scale_factor() {
            if let Ok(size) = parent.inner_size() {
                let size = size.to_logical::<f64>(scale);
                builder = builder.inner_size(size.width, size.height);
            }
            if !as_tab {
                if let Ok(position) = parent.outer_position() {
                    let position = position.to_logical::<f64>(scale);
                    builder = builder
                        .position(position.x + CASCADE_OFFSET, position.y + CASCADE_OFFSET);
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.tabbing_identifier(TABBING_IDENTIFIER);
        // Shown by `attach_as_tab`, so it never flashes as a separate window.
        if as_tab && parent.is_some() {
            builder = builder.visible(false);
        }
    }

    let window = builder.build().map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        macos::enable_new_tab_button(app, &window);
        if as_tab {
            if let Some(parent) = parent {
                macos::attach_as_tab(&parent, &window);
            }
        }
    }

    Ok(window)
}

/// Sends paths from the OS (Finder double-click, `open -a`, argv) to windows:
/// a path that is already open focuses its tab; the first new path loads into
/// the active window if it is still pristine; the rest open in new tabs.
pub fn route_open_paths(app: &AppHandle, paths: Vec<String>) {
    let paths: Vec<String> = paths
        .iter()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(normalize_path)
        .collect();
    if paths.is_empty() {
        return;
    }

    let app = app.clone();
    // Window creation waits on the event loop, so it must not run on it.
    tauri::async_runtime::spawn(async move {
        let state = app.state::<DocumentWindows>();
        let mut reusable = active_window(&app).filter(|window| state.is_pristine(window.label()));
        for path in paths {
            if let Some(window) = state
                .window_for_path(&path)
                .and_then(|label| app.get_webview_window(&label))
            {
                focus_window(&window);
                continue;
            }
            if let Some(window) = reusable.take() {
                state.queue(window.label(), path.clone());
                state.set_document(
                    window.label(),
                    WindowDocument {
                        path: Some(path),
                        pristine: false,
                    },
                );
                let _ = WindowEmitter::new(&app, window.label()).emit("lumina-pending-open-files", ());
                focus_window(&window);
                continue;
            }
            let _ = create_document_window(&app, Some(path), active_window(&app), true);
        }
    });
}

#[tauri::command]
pub fn drain_pending_open_paths(
    window: WebviewWindow,
    state: State<'_, DocumentWindows>,
) -> Result<Vec<String>, String> {
    Ok(state.take_pending(window.label()))
}

/// Opens a new tab (or, with `tab: false`, a new window) next to the calling
/// window, optionally loading `path` into it.
#[tauri::command(async)]
pub fn open_document_window(
    app: AppHandle,
    window: WebviewWindow,
    path: Option<String>,
    tab: Option<bool>,
) -> Result<(), String> {
    let path = path
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .map(|path| normalize_path(&path));
    create_document_window(&app, path, Some(window), tab.unwrap_or(true)).map(|_| ())
}

/// Focuses the window that already has `path` open. Returns false when no
/// window does (including the calling one, which the caller handles itself).
#[tauri::command]
pub fn focus_document_window(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, DocumentWindows>,
    path: String,
) -> bool {
    let path = normalize_path(&path);
    match state.window_for_path(&path) {
        Some(label) if label != window.label() => match app.get_webview_window(&label) {
            Some(target) => {
                focus_window(&target);
                true
            }
            None => false,
        },
        _ => false,
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowDocumentParams {
    path: Option<String>,
    title: String,
    dirty: bool,
    pristine: bool,
}

/// Records which document the calling window shows and mirrors it into the
/// native title bar: the title (which also labels the tab), the file proxy
/// icon, and the unsaved-changes dot in the close button.
#[tauri::command]
pub fn set_window_document(
    window: WebviewWindow,
    state: State<'_, DocumentWindows>,
    params: WindowDocumentParams,
) -> Result<(), String> {
    let path = params
        .path
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .map(|path| normalize_path(&path));
    state.set_document(
        window.label(),
        WindowDocument {
            path: path.clone(),
            pristine: params.pristine,
        },
    );
    window
        .set_title(params.title.trim())
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    macos::set_document(&window, path.as_deref().unwrap_or(""), params.dirty);
    #[cfg(not(target_os = "macos"))]
    let _ = params.dirty;
    Ok(())
}

#[cfg(target_os = "macos")]
mod macos {
    use super::create_document_window;
    use objc2::{
        ffi,
        runtime::{AnyClass, AnyObject, Sel},
        sel,
    };
    use objc2_app_kit::{NSWindow, NSWindowOrderingMode};
    use objc2_foundation::NSString;
    use std::{
        collections::HashMap,
        sync::{Mutex, Once, OnceLock, PoisonError},
    };
    use tauri::{AppHandle, Manager, WebviewWindow};

    static APP: OnceLock<AppHandle> = OnceLock::new();
    /// NSWindow pointer -> window label, so the `+` button handler can find
    /// its window without calling back into Tauri from inside AppKit.
    static WINDOW_LABELS: OnceLock<Mutex<HashMap<usize, String>>> = OnceLock::new();

    fn window_labels() -> &'static Mutex<HashMap<usize, String>> {
        WINDOW_LABELS.get_or_init(Default::default)
    }

    pub fn forget(label: &str) {
        window_labels()
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .retain(|_, existing| existing != label);
    }

    /// AppKit shows the `+` button in the tab bar only when the window responds
    /// to `newWindowForTab:`. tao's window class doesn't, so add it once.
    pub fn enable_new_tab_button(app: &AppHandle, window: &WebviewWindow) {
        static INSTALL: Once = Once::new();
        let _ = APP.set(app.clone());
        let Ok(ns_window) = window.ns_window() else {
            return;
        };
        window_labels()
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(ns_window as usize, window.label().to_string());
        INSTALL.call_once(|| unsafe {
            let class = ffi::object_getClass(ns_window as *const AnyObject) as *mut AnyClass;
            if class.is_null() {
                return;
            }
            let imp: unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) =
                new_window_for_tab;
            ffi::class_addMethod(
                class,
                sel!(newWindowForTab:),
                std::mem::transmute::<
                    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject),
                    objc2::runtime::Imp,
                >(imp),
                c"v@:@".as_ptr(),
            );
        });
    }

    unsafe extern "C-unwind" fn new_window_for_tab(
        this: *mut AnyObject,
        _cmd: Sel,
        _sender: *mut AnyObject,
    ) {
        let Some(app) = APP.get().cloned() else {
            return;
        };
        let label = window_labels()
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&(this as usize))
            .cloned();
        tauri::async_runtime::spawn(async move {
            let parent = label.and_then(|label| app.get_webview_window(&label));
            let _ = create_document_window(&app, None, parent, true);
        });
    }

    /// Adds `child` to `parent`'s tab group and selects it.
    pub fn attach_as_tab(parent: &WebviewWindow, child: &WebviewWindow) {
        let parent = parent.clone();
        let child_handle = child.clone();
        let _ = child.run_on_main_thread(move || {
            let (Ok(parent_ptr), Ok(child_ptr)) = (parent.ns_window(), child_handle.ns_window())
            else {
                let _ = child_handle.show();
                return;
            };
            unsafe {
                let parent_window = &*(parent_ptr as *const NSWindow);
                let child_window = &*(child_ptr as *const NSWindow);
                parent_window.addTabbedWindow_ordered(child_window, NSWindowOrderingMode::Above);
                child_window.makeKeyAndOrderFront(None);
            }
        });
    }

    pub fn set_document(window: &WebviewWindow, path: &str, dirty: bool) {
        let handle = window.clone();
        let path = path.to_string();
        let _ = window.run_on_main_thread(move || {
            let Ok(ptr) = handle.ns_window() else {
                return;
            };
            unsafe {
                let ns_window = &*(ptr as *const NSWindow);
                ns_window.setRepresentedFilename(&NSString::from_str(&path));
                ns_window.setDocumentEdited(dirty);
            }
        });
    }

    /// Registers the config-created `main` window for the `+` button.
    pub fn register_existing(app: &AppHandle) {
        for window in app.webview_windows().values() {
            enable_new_tab_button(app, window);
        }
    }
}

/// Called once at startup for windows created from `tauri.conf.json`.
pub fn register_existing_windows(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    macos::register_existing(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
