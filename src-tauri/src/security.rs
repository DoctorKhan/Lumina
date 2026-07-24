//! Deterministic policy checks for IPC boundaries (Serenus One executor model).
//! Model output and webview requests are untrusted proposals; these checks run
//! before any side effect and are ordered: allowlist → schema → ownership/scope.

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_PATH_LEN: usize = 4096;
const MAX_MODEL_NAME_LEN: usize = 64;

/// Paths whose components must never be written via IPC (even if the OS user could).
const SENSITIVE_DIR_NAMES: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".aws",
    ".kube",
    "Keychains",
];

/// File names that must not be overwritten through silent IPC writes.
const SENSITIVE_FILE_NAMES: &[&str] = &[
    ".zshrc",
    ".bashrc",
    ".bash_profile",
    ".profile",
    ".zprofile",
    ".npmrc",
    ".gitconfig",
    "id_rsa",
    "id_ed25519",
    "authorized_keys",
    "known_hosts",
];

const CLAUDE_MODES: &[&str] = &["acceptEdits", "plan", "default", "dontAsk"];
const CLAUDE_BYPASS_MODE: &str = "bypassPermissions";

const ALLOWED_EXTERNAL_URL: &str = "https://github.com/DoctorKhan/Lumina";

#[derive(Debug, Clone)]
pub struct AuditEntry {
    pub timestamp_ms: u64,
    pub action: String,
    pub detail: String,
    pub allowed: bool,
}

static AUDIT_LOG: Mutex<Vec<AuditEntry>> = Mutex::new(Vec::new());
const MAX_AUDIT_ENTRIES: usize = 500;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Append-only audit trail for high-risk IPC. Denials are logged, not just allows.
pub fn audit_ipc(action: &str, detail: &str, allowed: bool) {
    let entry = AuditEntry {
        timestamp_ms: now_ms(),
        action: action.to_string(),
        detail: detail.to_string(),
        allowed,
    };
    if let Ok(mut log) = AUDIT_LOG.lock() {
        log.push(entry);
        if log.len() > MAX_AUDIT_ENTRIES {
            let drain = log.len() - MAX_AUDIT_ENTRIES;
            log.drain(0..drain);
        }
    }
}

pub fn audit_entries_for_test() -> Vec<AuditEntry> {
    AUDIT_LOG
        .lock()
        .map(|log| log.clone())
        .unwrap_or_default()
}

pub fn clear_audit_for_test() {
    if let Ok(mut log) = AUDIT_LOG.lock() {
        log.clear();
    }
}

/// Reject malformed path strings before filesystem access.
pub fn validate_path_input(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        audit_ipc("path-input", "empty path", false);
        return Err("Path is empty.".to_string());
    }
    if trimmed.len() > MAX_PATH_LEN {
        audit_ipc("path-input", "path too long", false);
        return Err("Path is too long.".to_string());
    }
    if trimmed.contains('\0') {
        audit_ipc("path-input", "null byte in path", false);
        return Err("Path contains invalid characters.".to_string());
    }
    Ok(())
}

fn is_system_root(path: &Path) -> bool {
    for prefix in ["/etc", "/usr", "/bin", "/sbin", "/var", "/System"] {
        if path.starts_with(prefix) {
            return true;
        }
    }
    false
}

fn has_sensitive_component(path: &Path) -> bool {
    for component in path.components() {
        if let Component::Normal(name) = component {
            let name = name.to_string_lossy();
            if SENSITIVE_DIR_NAMES.iter().any(|blocked| name.eq_ignore_ascii_case(blocked)) {
                return true;
            }
            if SENSITIVE_FILE_NAMES
                .iter()
                .any(|blocked| name.eq_ignore_ascii_case(blocked))
            {
                return true;
            }
        }
    }
    false
}

pub fn is_sensitive_path(path: &Path) -> bool {
    is_system_root(path) || has_sensitive_component(path)
}

pub fn is_supported_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md")
                || extension.eq_ignore_ascii_case("markdown")
                || extension.eq_ignore_ascii_case("txt")
        })
}

/// Read targets must exist, be regular files, use supported extensions, and avoid
/// sensitive locations that should never be loaded into the webview pipeline.
pub fn validate_read_path(path: &Path) -> Result<(), String> {
    validate_path_input(&path.to_string_lossy())?;
    if is_sensitive_path(path) {
        audit_ipc("read-path", &path.display().to_string(), false);
        return Err("Reading this path is not allowed.".to_string());
    }
    if !path.is_file() {
        audit_ipc("read-path", "not a file", false);
        return Err("Path is not a file.".to_string());
    }
    if !is_supported_document_path(path) {
        audit_ipc("read-path", "unsupported extension", false);
        return Err("Only Markdown and plain-text files can be opened.".to_string());
    }
    audit_ipc("read-path", &path.display().to_string(), true);
    Ok(())
}

/// Write targets must use supported extensions and must not hit sensitive paths.
pub fn validate_write_path(path: &Path) -> Result<(), String> {
    validate_path_input(&path.to_string_lossy())?;
    if is_sensitive_path(path) {
        audit_ipc("write-path", &path.display().to_string(), false);
        return Err("Writing to this path is not allowed.".to_string());
    }
    if !is_supported_document_path(path) {
        audit_ipc("write-path", "unsupported extension", false);
        return Err("Only Markdown and plain-text files can be saved.".to_string());
    }
    audit_ipc("write-path", &path.display().to_string(), true);
    Ok(())
}

/// Claude permission modes are allowlisted server-side; bypass requires an env flag.
pub fn validate_claude_permission_mode(mode: Option<&str>) -> Result<String, String> {
    let mode = mode
        .map(str::trim)
        .filter(|m| !m.is_empty())
        .unwrap_or("acceptEdits");

    if mode == CLAUDE_BYPASS_MODE {
        let allowed = env_flag_enabled("LUMINA_ALLOW_BYPASS_PERMISSIONS");
        if !allowed {
            audit_ipc("claude-permission-mode", mode, false);
            return Err(
                "bypassPermissions is disabled. Set LUMINA_ALLOW_BYPASS_PERMISSIONS=1 to enable."
                    .to_string(),
            );
        }
        audit_ipc("claude-permission-mode", mode, true);
        return Ok(mode.to_string());
    }

    if !CLAUDE_MODES.contains(&mode) {
        audit_ipc("claude-permission-mode", mode, false);
        return Err(format!("Unsupported Claude permission mode: {mode}"));
    }

    audit_ipc("claude-permission-mode", mode, true);
    Ok(mode.to_string())
}

pub fn validate_model_name(model: &str) -> Result<(), String> {
    let model = model.trim();
    if model.is_empty() {
        return Err("Model name is empty.".to_string());
    }
    if model.len() > MAX_MODEL_NAME_LEN {
        return Err("Model name is too long.".to_string());
    }
    if !model
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
    {
        audit_ipc("model-name", model, false);
        return Err("Model name contains invalid characters.".to_string());
    }
    audit_ipc("model-name", model, true);
    Ok(())
}

pub fn validate_external_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url != ALLOWED_EXTERNAL_URL {
        audit_ipc("external-url", url, false);
        return Err("External URL is not allowed.".to_string());
    }
    audit_ipc("external-url", url, true);
    Ok(())
}

pub fn validate_cursor_agent_mode(mode: Option<&str>) -> Result<(), String> {
    let Some(mode) = mode.map(str::trim).filter(|m| !m.is_empty()) else {
        return Ok(());
    };
    if mode == "plan" || mode == "ask" {
        Ok(())
    } else {
        audit_ipc("cursor-agent-mode", mode, false);
        Err(format!("Unsupported Cursor Agent mode: {mode}"))
    }
}

pub fn validate_agent_message(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        audit_ipc("agent-message", "empty", false);
        return Err("Message is empty.".to_string());
    }
    if text.len() > 200_000 {
        audit_ipc("agent-message", "too long", false);
        return Err("Message is too long.".to_string());
    }
    Ok(text.to_string())
}

fn env_flag_enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

/// Recovery snapshots live under app data; skip extension checks but still audit.
pub fn validate_recovery_storage_path(path: &Path) -> Result<(), String> {
    validate_path_input(&path.to_string_lossy())?;
    if is_sensitive_path(path) {
        audit_ipc("recovery-path", &path.display().to_string(), false);
        return Err("Recovery path is not allowed.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_sensitive_write_targets() {
        clear_audit_for_test();
        let path = PathBuf::from("/Users/alice/.ssh/id_rsa");
        assert!(validate_write_path(&path).is_err());
        assert!(audit_entries_for_test().iter().any(|e| !e.allowed));
    }

    #[test]
    fn rejects_unknown_claude_permission_mode() {
        clear_audit_for_test();
        assert!(validate_claude_permission_mode(Some("bypassPermissions")).is_err());
        assert!(validate_claude_permission_mode(Some("runShell")).is_err());
        assert!(validate_claude_permission_mode(Some("acceptEdits")).is_ok());
    }

    #[test]
    fn rejects_unsupported_document_extension_for_read() {
        clear_audit_for_test();
        let path = PathBuf::from("/tmp/evil.html");
        assert!(validate_read_path(&path).is_err());
    }

    #[test]
    fn allows_markdown_write_targets() {
        clear_audit_for_test();
        let path = PathBuf::from("/tmp/notes.md");
        assert!(validate_write_path(&path).is_ok());
    }

    #[test]
    fn external_url_is_allowlisted() {
        assert!(validate_external_url("https://evil.example").is_err());
        assert!(validate_external_url(ALLOWED_EXTERNAL_URL).is_ok());
    }

    #[test]
    fn rejects_path_traversal_strings_with_null_bytes() {
        assert!(validate_path_input("safe\0/path").is_err());
    }
}
