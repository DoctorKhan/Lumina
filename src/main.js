        import exampleMarkdown from './example.md?raw';
        import { getVersion } from '@tauri-apps/api/app';
        import { invoke } from '@tauri-apps/api/core';
        import { listen } from '@tauri-apps/api/event';
        import { relaunch } from '@tauri-apps/plugin-process';
        import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { compareVersions, parseVersion, selectLatestUpdateTag } from './update.js';
        import {
            createInstallProgressState,
            processInstallProgressLine
        } from './installProgressParse.js';
import { createInstallProgressViewModel, displayPercentFromInstallProgress } from './installProgressView.js';
import {
    createInstallProgressAnchorState,
    refreshInstallProgressAnchor,
    getInterpolatedInstallPercent,
    getCountdownSecondsRemaining
} from './installProgressAnimate.js';
import {
    extractMathForMarkdown,
    normalizeEscapedLatexDelimiters,
    normalizeMathBlocks,
    restoreMathFromMarkdownHtml
} from './previewMath.js';
        import {
            applyKatexToPreview,
            highlightCodeBlocksIn,
            marked,
            renderMermaidInPreview
        } from './previewLoaders.js';
        import {
            appendUserTurn,
            createChatState,
            describeTool,
            parseChatLine,
            reduceChatEvent
        } from './claudeChatParse.js';
        import { Terminal } from '@xterm/xterm';
        import { FitAddon } from '@xterm/addon-fit';
        import { Unicode11Addon } from '@xterm/addon-unicode11';
        import '@xterm/xterm/css/xterm.css';

        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const charCount = document.getElementById('char-count');
const fixLatexBtn = document.getElementById('fix-latex-btn');
const findReplaceBar = document.getElementById('find-replace-bar');
const findReplaceReplaceRow = document.getElementById('find-replace-replace-row');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const findMatchStatus = document.getElementById('find-match-status');
const findNextBtn = document.getElementById('find-next-btn');
const findPrevBtn = document.getElementById('find-prev-btn');
const replaceBtn = document.getElementById('replace-btn');
const replaceAllBtn = document.getElementById('replace-all-btn');
const findReplaceCloseBtn = document.getElementById('find-replace-close-btn');
        const fileInput = document.getElementById('file-input');
        const filenameDisplay = document.getElementById('filename-display');
const filenameName = document.getElementById('filename-name');
const filenameDir = document.getElementById('filename-dir');
const filenameCopyBtn = document.getElementById('filename-copy-btn');
const filenamePathView = document.getElementById('filename-path-view');
const filenamePathEditor = document.getElementById('filename-path-editor');
const filenamePathInput = document.getElementById('filename-path-input');
const filenamePathOpenBtn = document.getElementById('filename-path-open-btn');
const filenamePathCancelBtn = document.getElementById('filename-path-cancel-btn');
const filenamePathSuggestions = document.getElementById('filename-path-suggestions');
const filenamePathToast = document.getElementById('filename-path-toast');
const appVersionBadge = document.getElementById('app-version-badge');
const installUpdateBadge = document.getElementById('install-update-badge');
        const updateStatus = document.getElementById('update-status');
        const toggleSourceBtn = document.getElementById('toggle-source-btn');
        const toggleTerminalBtn = document.getElementById('toggle-terminal-btn');
        const toggleClaudeBtn = document.getElementById('toggle-claude-btn');
const claudeSendContextBtn = document.getElementById('claude-send-context-btn');
const claudePresetsBtn = document.getElementById('claude-presets-btn');
const claudeApplyMenuBtn = document.getElementById('claude-apply-menu-btn');
const claudeApplyMenu = document.getElementById('claude-apply-menu');
const claudePullFileBtn = document.getElementById('claude-pull-file-btn');
const claudeReplaceSelectionBtn = document.getElementById('claude-replace-selection-btn');
const claudeDevelopLuminaBtn = document.getElementById('claude-develop-lumina-btn');
const claudeRebuildLuminaBtn = document.getElementById('claude-rebuild-lumina-btn');
        const closeTerminalBtn = document.getElementById('close-terminal-btn');
        const closeClaudeBtn = document.getElementById('close-claude-btn');
        const terminalPane = document.getElementById('terminal-pane');
        const terminalElement = document.getElementById('terminal');
        const terminalStatus = document.getElementById('terminal-status');
        const claudePane = document.getElementById('claude-pane');
        const claudeTranscript = document.getElementById('claude-transcript');
        const claudeEmpty = document.getElementById('claude-empty');
        const claudeStatus = document.getElementById('claude-status');
const claudeWorkspaceStatus = document.getElementById('claude-workspace-status');
        const claudeInputBar = document.getElementById('claude-input-bar');
        const claudeInput = document.getElementById('claude-input');
        const claudeModeSelect = document.getElementById('claude-mode');
        const claudeStopBtn = document.getElementById('claude-stop-btn');
        const installProgressRoot = document.getElementById('install-progress');
        const installProgressFill = document.getElementById('install-progress-fill');
        const installProgressDetail = document.getElementById('install-progress-detail');
        const installProgressPercent = document.getElementById('install-progress-percent');
        const installProgressDismiss = document.getElementById('install-progress-dismiss');
        const editorContainer = document.querySelector('.editor-container');
        const workspacePanes = document.getElementById('workspace-panes');
        const sidePane = document.getElementById('side-pane');
        const sidePaneResizer = document.getElementById('side-pane-resizer');
        const sideSplitResizers = [
            document.getElementById('side-split-resizer-1'),
            document.getElementById('side-split-resizer-2'),
            document.getElementById('side-split-resizer-3'),
        ];
        const toggleGitBtn = document.getElementById('toggle-git-btn');
        const gitPane = document.getElementById('git-pane');
        const toggleFilesBtn = document.getElementById('toggle-files-btn');
        const filesPane = document.getElementById('files-pane');
        const filesRootLabel = document.getElementById('files-root');
        const filesTree = document.getElementById('files-tree');
        const filesMessage = document.getElementById('files-message');
        const filesUpBtn = document.getElementById('files-up-btn');
        const filesChooseBtn = document.getElementById('files-choose-btn');
        const filesRefreshBtn = document.getElementById('files-refresh-btn');
        const closeFilesBtn = document.getElementById('close-files-btn');
        const gitBranch = document.getElementById('git-branch');
        const gitTracking = document.getElementById('git-tracking');
        const gitSections = document.getElementById('git-sections');
        const gitMessage = document.getElementById('git-message');
        const gitDiff = document.getElementById('git-diff');
        const gitCommitMessage = document.getElementById('git-commit-message');
        const gitCommitBtn = document.getElementById('git-commit-btn');
        const gitGenerateBtn = document.getElementById('git-generate-btn');
        const gitPullBtn = document.getElementById('git-pull-btn');
        const gitPushBtn = document.getElementById('git-push-btn');
        const gitRefreshBtn = document.getElementById('git-refresh-btn');
        const closeGitBtn = document.getElementById('close-git-btn');
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');
        const paneResizer = document.getElementById('pane-resizer');
        let sourceCollapsed = false;
        let isResizing = false;
        let isResizingSidePane = false;
        let sidePanePercent = 34;
        // Relative flex weights for the vertically stacked side panes. Equal weights
        // reproduce the old even split; the split-resizers below adjust these.
        const paneWeights = { terminal: 1, claude: 1, files: 1, git: 1 };
        let terminal = null;
        let fitAddon = null;
        let terminalVisible = false;
        let terminalStarted = false;
        let terminalOutputUnlisten = null;
        let terminalResizeFrame = null;
        let terminalScrollBottomRaf = null;
        let terminalLastFitCols = 0;
        let terminalLastFitRows = 0;
        let terminalInputBuffer = '';
        let terminalPtyHangupUnlisten = null;
        let terminalShellRespawnPromise = null;
        let installProgressTracking = false;
        let installProgressState = null;
        let installProgressLineBuffer = '';
        let installProgressEndTimer = null;
        let installProgressAnchor = createInstallProgressAnchorState();
        let installProgressTickTimer = null;
        const installProgressTickMs = 400;
        let claudeVisible = false;
        let claudeStarted = false;
        // Auto-context-on-focus: remember the file we last fed Claude so we only
        // re-send when you actually switch documents — refocusing the pane (or
        // moving the cursor / changing the selection within the same file) no
        // longer re-pastes the block. `undefined` so the first send always fires,
        // even for an unsaved doc (whose path is null). We also suppress the focus
        // our own programmatic sends trigger.
        let lastClaudeContextPath;
        let suppressClaudeFocusContext = false;
        let gitVisible = false;
        let filesVisible = false;
        let filesRootPath = null;
        let filesExpanded = new Set();
        const filesRootKey = 'lumina:files-root-path';
        const filesExpandedKey = 'lumina:files-expanded-paths';
        let claudeChatUnlisten = null;
        let claudeChatState = null;
        let claudeRenderRaf = null;
let claudeWorkspaceFilePath = null;
        let luminaSourceDir = null;
        let developLuminaMode = false;
        // Resolving the source checkout probes ~/Documents, which trips the macOS
        // "access your Documents folder" prompt. Defer it until the Claude pane is
        // actually opened (where the Develop Lumina feature lives), and only once.
        let sourceCheckoutInfoLoaded = false;
        let latestReleaseTag = null;
        let updateCheckInProgress = false;
        let currentCheckoutInstallCommand = null;
        let currentFilePath = null;
        let currentFileMtime = 0;
        let fileChangedUnlisten = null;
        const lastOpenedFilePathKey = 'lumina:last-opened-file-path';
const recentFilePathsKey = 'lumina:recent-file-paths';
const maxRecentFilePaths = 10;
        const releaseApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/releases/latest';
        const tagsApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/tags?per_page=100';
        const publicInstallerUrl = 'https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh';
let currentVersion = appVersionBadge.textContent.trim().replace(/^v/i, '');

        const initialValue = exampleMarkdown;

        editor.value = initialValue;

        const editorHistoryLimit = 200;
        let editorHistory = [];
        let editorHistoryIndex = -1;
        let restoringEditorHistory = false;
        let editorHistoryTimeout = null;

        function editorSnapshot() {
            return {
                value: editor.value,
                selectionStart: editor.selectionStart,
                selectionEnd: editor.selectionEnd
            };
        }

        function resetEditorHistory() {
            editorHistory = [editorSnapshot()];
            editorHistoryIndex = 0;
            clearTimeout(editorHistoryTimeout);
        }

        function pushEditorHistory() {
            if (restoringEditorHistory) return;

            const snapshot = editorSnapshot();
            const current = editorHistory[editorHistoryIndex];
            if (current?.value === snapshot.value &&
                current.selectionStart === snapshot.selectionStart &&
                current.selectionEnd === snapshot.selectionEnd) {
                return;
            }

            editorHistory = editorHistory.slice(0, editorHistoryIndex + 1);
            editorHistory.push(snapshot);

            if (editorHistory.length > editorHistoryLimit) {
                editorHistory.shift();
            }

            editorHistoryIndex = editorHistory.length - 1;
        }

        function scheduleEditorHistory() {
            clearTimeout(editorHistoryTimeout);
            editorHistoryTimeout = setTimeout(pushEditorHistory, 250);
        }

        function restoreEditorHistory(index) {
            const snapshot = editorHistory[index];
            if (!snapshot) return false;

            restoringEditorHistory = true;
            editor.value = snapshot.value;
            editor.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            editorHistoryIndex = index;
            restoringEditorHistory = false;
            schedulePreviewUpdate();
            return true;
        }

        function undoEditor() {
            clearTimeout(editorHistoryTimeout);
            pushEditorHistory();
            return restoreEditorHistory(editorHistoryIndex - 1);
        }

        function redoEditor() {
            clearTimeout(editorHistoryTimeout);
            return restoreEditorHistory(editorHistoryIndex + 1);
        }

        resetEditorHistory();

        let previewPipelineBusy = false;
        let previewPipelinePending = false;
        let previewInputDebounceTimer = null;
        const previewInputDebounceMs = 160;

        function schedulePreviewUpdate() {
            preview.innerHTML = '<p class="text-slate-500">Rendering preview...</p>';
            requestAnimationFrame(() => {
                void updatePreview();
            });
        }

        function updateEditorMetrics() {
            const rawValue = editor.value;
            const wordCount = rawValue.trim() ? rawValue.trim().split(/\s+/).length : 0;
            charCount.textContent = `${rawValue.length} chars • ${wordCount} words`;
        }

        let homeDirectory = null;
        let filenamePathToastTimer = null;
        let filenamePathNavigatorOpen = false;
        let filenamePathSuggestionsList = [];
        let filenamePathSuggestionIndex = -1;
        let filenamePathCompletionTimer = null;

        async function getHomeDirectory() {
            if (homeDirectory) return homeDirectory;
            try {
                homeDirectory = await invoke('home_dir_path');
            } catch (_) {
                homeDirectory = '';
            }
            return homeDirectory;
        }

        function resolveFilenamePath(label, fullPath = '') {
            if (fullPath) return fullPath;
            if (label.startsWith('Editing: ')) return label.slice('Editing: '.length);
            if (label.startsWith('Opening: ')) return label.slice('Opening: '.length);
            return '';
        }

        function formatPathForDisplay(path) {
            if (!path) return '';
            if (homeDirectory && path.startsWith(homeDirectory)) {
                return `~${path.slice(homeDirectory.length)}`;
            }
            return path;
        }

        function showFilenamePathToast(message) {
            if (!message) return;
            filenamePathToast.textContent = message;
            filenamePathToast.classList.remove('hidden');
            clearTimeout(filenamePathToastTimer);
            filenamePathToastTimer = setTimeout(() => {
                filenamePathToast.classList.add('hidden');
            }, 5000);
        }

        function setFilenameLabel(label, fullPath = '') {
            const path = resolveFilenamePath(label, fullPath);
            void getHomeDirectory().then(() => {
                if (path) {
                    // Lead with the filename (bold, never truncated) so the open
                    // file is obvious at a glance; trail the directory dimmed.
                    filenameName.textContent = basename(path);
                    filenameDir.textContent = formatPathForDisplay(dirname(path));
                    filenameDisplay.dataset.fullPath = path;
                    filenameDisplay.title = `${path}\n\nClick to open another file · ⎘ copies path`;
                    filenameCopyBtn.classList.remove('hidden');
                } else {
                    filenameName.textContent = label;
                    filenameDir.textContent = '';
                    delete filenameDisplay.dataset.fullPath;
                    filenameDisplay.title = label || '';
                    filenameCopyBtn.classList.add('hidden');
                }
            });
        }

        async function copyFilenamePath() {
            const path = filenameDisplay.dataset.fullPath;
            if (!path) return;

            try {
                await navigator.clipboard.writeText(path);
                showFilenamePathToast(`Copied: ${path}`);
                setUpdateStatus('Path copied to clipboard.');
            } catch {
                showFilenamePathToast(path);
                setUpdateStatus('Unable to copy path to clipboard.');
            }
        }

        function hideFilenamePathSuggestions() {
            filenamePathSuggestions.classList.add('hidden');
            filenamePathSuggestions.innerHTML = '';
            filenamePathSuggestionsList = [];
            filenamePathSuggestionIndex = -1;
        }

        function renderFilenamePathSuggestions(paths) {
            filenamePathSuggestionsList = paths;
            filenamePathSuggestionIndex = paths.length ? 0 : -1;
            filenamePathSuggestions.innerHTML = paths
                .map(
                    (path, index) =>
                        `<li role="option" data-index="${index}" class="${index === 0 ? 'is-active' : ''}" title="${path}">${formatPathForDisplay(path)}</li>`
                )
                .join('');
            filenamePathSuggestions.classList.toggle('hidden', paths.length === 0);
        }

        async function refreshFilenamePathSuggestions() {
            const query = filenamePathInput.value.trim();
            const recentMatches = readRecentFilePaths().filter(
                (path) => !query || path.toLowerCase().includes(query.toLowerCase())
            );

            let directoryMatches = [];
            if (query) {
                try {
                    directoryMatches = await invoke('complete_file_path', { query, limit: 20 });
                } catch (_) {
                    directoryMatches = [];
                }
            }

            const merged = [...new Set([...directoryMatches, ...recentMatches])].slice(0, 20);
            renderFilenamePathSuggestions(merged);
        }

        function scheduleFilenamePathSuggestions() {
            clearTimeout(filenamePathCompletionTimer);
            filenamePathCompletionTimer = setTimeout(() => {
                void refreshFilenamePathSuggestions();
            }, 120);
        }

        function closeFilenamePathNavigator({ restoreFocus = true } = {}) {
            filenamePathNavigatorOpen = false;
            filenamePathEditor.classList.add('hidden');
            filenamePathView.classList.remove('hidden');
            hideFilenamePathSuggestions();
            if (restoreFocus) {
                editor.focus();
            }
        }

        function openFilenamePathNavigator() {
            const path = filenameDisplay.dataset.fullPath || '';
            if (!path) {
                void openFileWithDialog();
                return;
            }

            filenamePathNavigatorOpen = true;
            filenamePathView.classList.add('hidden');
            filenamePathEditor.classList.remove('hidden');
            filenamePathInput.value = formatPathForDisplay(path);
            hideFilenamePathSuggestions();
            requestAnimationFrame(() => {
                filenamePathInput.focus();
                filenamePathInput.select();
                void refreshFilenamePathSuggestions();
            });
        }

        async function submitFilenamePathNavigator() {
            const raw = filenamePathInput.value.trim();
            if (!raw) return;

            closeFilenamePathNavigator({ restoreFocus: false });
            try {
                await openFilePath(raw);
            } catch (error) {
                setUpdateStatus(`Unable to open ${raw}: ${error?.message || error}`);
                editor.focus();
            }
        }

        function highlightFilenamePathSuggestion(index) {
            const path = filenamePathSuggestionsList[index];
            if (!path) return;
            filenamePathSuggestionIndex = index;
            filenamePathInput.value = formatPathForDisplay(path);
            [...filenamePathSuggestions.querySelectorAll('[data-index]')].forEach((item) => {
                item.classList.toggle('is-active', Number(item.dataset.index) === index);
            });
        }

        function applyFilenamePathSuggestion(index) {
            highlightFilenamePathSuggestion(index);
            hideFilenamePathSuggestions();
            filenamePathInput.focus();
        }

        filenameDisplay.addEventListener('click', (event) => {
            event.preventDefault();
            openFilenamePathNavigator();
        });

        filenameCopyBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            void copyFilenamePath();
        });

        filenamePathOpenBtn.addEventListener('click', () => {
            void submitFilenamePathNavigator();
        });

        filenamePathCancelBtn.addEventListener('click', () => {
            closeFilenamePathNavigator();
        });

        filenamePathInput.addEventListener('input', scheduleFilenamePathSuggestions);

        filenamePathInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeFilenamePathNavigator();
                return;
            }

            if (event.key === 'Tab' && filenamePathSuggestionsList.length) {
                event.preventDefault();
                const nextIndex =
                    (filenamePathSuggestionIndex + 1 + filenamePathSuggestionsList.length) %
                    filenamePathSuggestionsList.length;
                highlightFilenamePathSuggestion(nextIndex);
                return;
            }

            if (event.key === 'ArrowDown' && filenamePathSuggestionsList.length) {
                event.preventDefault();
                const nextIndex = Math.min(
                    filenamePathSuggestionsList.length - 1,
                    Math.max(0, filenamePathSuggestionIndex + 1)
                );
                highlightFilenamePathSuggestion(nextIndex);
                return;
            }

            if (event.key === 'ArrowUp' && filenamePathSuggestionsList.length) {
                event.preventDefault();
                const nextIndex = Math.max(0, filenamePathSuggestionIndex - 1);
                highlightFilenamePathSuggestion(nextIndex);
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                if (
                    filenamePathSuggestionIndex >= 0 &&
                    filenamePathSuggestionsList[filenamePathSuggestionIndex]
                ) {
                    filenamePathInput.value = formatPathForDisplay(
                        filenamePathSuggestionsList[filenamePathSuggestionIndex]
                    );
                }
                void submitFilenamePathNavigator();
            }
        });

        filenamePathSuggestions.addEventListener('mousedown', (event) => {
            const item = event.target.closest('[data-index]');
            if (!item) return;
            event.preventDefault();
            applyFilenamePathSuggestion(Number(item.dataset.index));
        });

        function setEditorContent(content, label, fullPath = '') {
            editor.value = content;
            setFilenameLabel(label, fullPath);
            charCount.textContent = `${content.length} chars`;
            resetEditorHistory();
            schedulePreviewUpdate();
        }

        function loadExampleGuide() {
            currentFilePath = null;
            setEditorContent(exampleMarkdown, 'Example Guide (Lumina Help)');
            delete filenameDisplay.dataset.fullPath;
            filenameDisplay.title = 'Bundled Lumina example guide';
            setUpdateStatus('Loaded the Lumina example guide.');
            notifyActiveFileChanged();
            editor.focus();
        }

        function newUntitledDocument() {
            currentFilePath = null;
            currentFileMtime = 0;
            stopFileWatcher();
            editor.value = '';
            setFilenameLabel('Editor (Markdown + LaTeX)');
            resetEditorHistory();
            updateEditorMetrics();
            schedulePreviewUpdate();
            setUpdateStatus('New document.');
            notifyActiveFileChanged();
            editor.focus();
        }

        function dirname(path) {
            const cleanPath = String(path || '').replace(/\/+$/, '');
            const index = cleanPath.lastIndexOf('/');
            if (index <= 0) return index === 0 ? '/' : null;
            return cleanPath.slice(0, index);
        }

function basename(path) {
    const cleanPath = String(path || '').replace(/\/+$/, '');
    const index = cleanPath.lastIndexOf('/');
    return index === -1 ? cleanPath : cleanPath.slice(index + 1);
}

function readRecentFilePaths() {
    try {
        const value = JSON.parse(localStorage.getItem(recentFilePathsKey) || '[]');
        return Array.isArray(value) ? value.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function syncAppMenu(paths = readRecentFilePaths()) {
    invoke('sync_app_menu', {
        params: {
            paths,
            sourceShown: !sourceCollapsed,
            terminalShown: terminalVisible,
            claudeShown: claudeVisible
        }
    }).catch((error) => {
        setUpdateStatus(`Unable to update menu: ${error?.message || error}`);
    });
}

function writeRecentFilePaths(paths) {
    const recentPaths = [...new Set(paths)].slice(0, maxRecentFilePaths);
    localStorage.setItem(recentFilePathsKey, JSON.stringify(recentPaths));
    syncAppMenu(recentPaths);
}

        function rememberOpenedPath(path) {
            currentFilePath = path;
            localStorage.setItem(lastOpenedFilePathKey, path);
    writeRecentFilePaths([
        path,
        ...readRecentFilePaths().filter((recentPath) => recentPath !== path)
    ]);

            const directory = dirname(path);
            if (directory) {
                invoke('terminal_set_cwd', { path: directory }).catch(() => {});
            }
            notifyActiveFileChanged();
        }

        // Side effects to run whenever the active file path changes (open, switch,
        // save-as, new doc). Keeps the Files-pane highlight, the Claude header
        // label, and Claude's own context in sync without each call site needing
        // to know about all three.
        function notifyActiveFileChanged() {
            if (typeof highlightCurrentFileRow === 'function') highlightCurrentFileRow();
            updateClaudeWorkspaceLabel();
            void maybeAutoSendClaudeFileSwitch();
        }

        function updateClaudeWorkspaceLabel() {
            if (!claudeWorkspaceStatus) return;
            if (developLuminaMode && luminaSourceDir) return;
            // Reflect the editor's current file as the file Claude is editing,
            // even before the user clicks Send Context — the label was lagging
            // until the next spawn before.
            claudeWorkspaceFilePath = currentFilePath;
            claudeWorkspaceStatus.textContent = currentFilePath
                ? `Editing ${basename(currentFilePath)}`
                : 'No file attached';
            claudeWorkspaceStatus.title = currentFilePath || '';
        }

        async function maybeAutoSendClaudeFileSwitch() {
            if (!claudeStarted) return;
            if (currentFilePath === lastClaudeContextPath) return;
            if (!currentFilePath) {
                lastClaudeContextPath = currentFilePath;
                return;
            }
            const message = `Now editing: ${currentFilePath}\n(Replaces any previous file context.)`;
            suppressClaudeFocusContext = true;
            try {
                await submitClaudeMessage(message);
                lastClaudeContextPath = currentFilePath;
            } catch (_) {
                // Best-effort — Claude may not be ready to accept input yet.
            } finally {
                setTimeout(() => { suppressClaudeFocusContext = false; }, 0);
            }
        }

        function forgetOpenedPath(path) {
            if (localStorage.getItem(lastOpenedFilePathKey) === path) {
                localStorage.removeItem(lastOpenedFilePathKey);
            }
    writeRecentFilePaths(readRecentFilePaths().filter((recentPath) => recentPath !== path));
            if (currentFilePath === path) {
                currentFilePath = null;
                notifyActiveFileChanged();
            }
        }

        function currentFileDirectory() {
            return dirname(currentFilePath);
        }

function currentSelectionText() {
    return editor.value.slice(editor.selectionStart, editor.selectionEnd);
}

function currentCursorContext() {
    const value = editor.value;
    const beforeCursor = value.slice(0, editor.selectionStart);
    const lineNumber = beforeCursor.split('\n').length;
    const headingMatch = [...beforeCursor.matchAll(/^#{1,6}\s+(.+)$/gm)].pop();
    return {
        lineNumber,
        heading: headingMatch?.[1] || 'Document start',
        hasSelection: editor.selectionStart !== editor.selectionEnd,
        selection: currentSelectionText()
    };
}

function claudeBaseContext() {
    const context = currentCursorContext();
    const sourceLabel = currentFilePath || 'Unsaved Lumina document';
    const selectionBlock = context.hasSelection
        ? `\n\nCurrent selection:\n\`\`\`markdown\n${context.selection}\n\`\`\``
        : '';

    return `You are helping edit a Markdown document in Lumina.

File: ${claudeWorkspaceFilePath || sourceLabel}
Cursor line: ${context.lineNumber}
Nearest heading: ${context.heading}

This file is in your working folder — read and edit it directly on disk. Keep edits valid Markdown.${selectionBlock}`;
}

// The backend pushes `lumina-file-changed` whenever the open file is modified on
// disk (native filesystem events, debounced ~200ms). We attach the listener once
// and let it run for the app's lifetime; watch/unwatch just (de)register which
// file the backend reports on.
async function ensureFileChangeListener() {
    if (fileChangedUnlisten) return;
    fileChangedUnlisten = await listen('lumina-file-changed', (event) => {
        const file = event.payload;
        // Ignore events for a file we're no longer showing (stale backend watch).
        if (!file || !currentFilePath || file.path !== currentFilePath) return;
        // Skip echoes of our own save (content already matches the editor).
        if (file.content === editor.value) {
            currentFileMtime = file.modifiedMs ?? currentFileMtime;
            return;
        }
        currentFileMtime = file.modifiedMs ?? currentFileMtime;
        editor.value = file.content;
        updateEditorMetrics();
        void updatePreview();
    });
}

function stopFileWatcher() {
    invoke('unwatch_file').catch(() => {});
}

async function startFileWatcher(path) {
    await ensureFileChangeListener();
    try {
        await invoke('watch_file', { path: path || currentFilePath });
    } catch (_) {
        // Watching is best-effort; the document is still fully usable without it.
    }
}

async function openFilePath(path) {
    setFilenameLabel(`Opening: ${path}`, path);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const file = await invoke('open_file_path', { path });
    currentFileMtime = file.modifiedMs ?? 0;
    setEditorContent(file.content, `Editing: ${file.path}`, file.path);
    rememberOpenedPath(file.path);
    startFileWatcher(file.path, currentFileMtime);
    editor.focus();
}

async function flushPendingOpenPathsFromBackend() {
    let paths;
    try {
        paths = await invoke('drain_pending_open_paths');
    } catch (error) {
        setUpdateStatus(`Unable to read pending files: ${error?.message || error}`);
        return false;
    }

    if (!Array.isArray(paths) || paths.length === 0) {
        return false;
    }

    for (const path of paths) {
        try {
            await openFilePath(path);
        } catch (error) {
            setUpdateStatus(`Unable to open ${path}: ${error?.message || error}`);
        }
    }
    return true;
}

async function openLastOpenedFile() {
    const path = localStorage.getItem(lastOpenedFilePathKey) || readRecentFilePaths()[0];
    if (!path) {
        setUpdateStatus('No recent file to reopen.');
        return false;
    }

    try {
        await openFilePath(path);
        return true;
    } catch (error) {
        forgetOpenedPath(path);
        setFilenameLabel('Editor (Markdown + LaTeX)');
        setUpdateStatus(`Unable to reopen ${basename(path)}: ${error?.message || error}`);
        return false;
    }
}

async function openRecentFile(recentIndex = null) {
    const recentPaths = readRecentFilePaths();
    if (recentPaths.length === 0) {
        setUpdateStatus('No recent files yet.');
        return;
    }

    let index = Number(recentIndex);
    if (!Number.isInteger(index)) {
        const options = recentPaths
            .map((path, optionIndex) => `${optionIndex + 1}. ${basename(path)}\n   ${path}`)
            .join('\n');
        const choice = window.prompt(`Open recent file:\n\n${options}\n\nEnter a number:`);
        if (!choice) return;
        index = Number(choice.trim()) - 1;
    }

    const path = recentPaths[index];
    if (!path) {
        setUpdateStatus('Recent file selection was not recognized.');
        return;
    }

    try {
        await openFilePath(path);
    } catch (error) {
        setFilenameLabel('Editor (Markdown + LaTeX)');
        const message = String(error?.message || error);
        if (/no such file|os error 2|cannot find|not found/i.test(message)) {
            // The file moved or was renamed. Tell the user plainly and keep the
            // entry in the list rather than silently dropping it, so they can
            // see what's missing instead of watching recents quietly disappear.
            setUpdateStatus(
                `"${basename(path)}" can’t be found — it may have been moved or renamed (${path}).`
            );
        } else {
            setUpdateStatus(`Unable to open ${basename(path)}: ${message}`);
        }
    }
}

        async function openFileWithDialog() {
            try {
                const selectedPath = await openDialog({
                    multiple: false,
                    filters: [
                        {
                            name: 'Markdown Documents',
                            extensions: ['md', 'markdown', 'txt']
                        }
                    ]
                });
                if (!selectedPath || Array.isArray(selectedPath)) return;

        await openFilePath(selectedPath);
            } catch (error) {
                setFilenameLabel('Editor (Markdown + LaTeX)');
                setUpdateStatus(`Open failed: ${error?.message || error}`);
                fileInput.click();
            }
        }

        function applySmartOutlineStyles() {
            const orderedLists = Array.from(preview.querySelectorAll('ol'));
            orderedLists.forEach((list) => list.classList.remove('outline-list'));

            for (const list of orderedLists) {
                if (!list.querySelector('ol')) continue;

                let root = list;
                let parentList = root.parentElement?.closest('ol');
                while (parentList) {
                    root = parentList;
                    parentList = root.parentElement?.closest('ol');
                }

                root.classList.add('outline-list');
            }
        }

        // Shared markdown pipeline: math-protect -> marked -> math-restore ->
        // highlight/mermaid/katex. Used by the editor preview and the Claude chat
        // bubbles so both render code, diagrams, and LaTeX identically.
        async function renderMarkdownInto(element, markdownText) {
            const normalizedValue = normalizeEscapedLatexDelimiters(
                normalizeMathBlocks(markdownText || "")
            );
            const protectedValue = extractMathForMarkdown(normalizedValue);
            element.innerHTML = restoreMathFromMarkdownHtml(
                marked.parse(protectedValue.markdown),
                protectedValue.math
            );
            await highlightCodeBlocksIn(element);
            await renderMermaidInPreview(element);
            await applyKatexToPreview(element, normalizedValue);
        }

        async function executePreviewRender() {
            const rawValue = editor.value;
            updateEditorMetrics();
            await renderMarkdownInto(preview, rawValue);
            applySmartOutlineStyles();
            syncPreviewScrollToEditor();
        }

        function getEditorFirstVisibleLine() {
            const style = getComputedStyle(editor);
            const lineHeight = parseFloat(style.lineHeight);
            if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 0;
            return Math.max(0, Math.floor(editor.scrollTop / lineHeight));
        }

        function syncPreviewScrollToEditor() {
            const blocks = [...preview.children];
            if (!blocks.length) {
                const editorRange = editor.scrollHeight - editor.clientHeight;
                const scrollPercentage = editorRange > 0 ? editor.scrollTop / editorRange : 0;
                const previewRange = Math.max(0, preview.scrollHeight - preview.clientHeight);
                preview.scrollTop = scrollPercentage * previewRange;
                return;
            }

            const sourceLineCount = Math.max(1, editor.value.split('\n').length);
            const firstLine = getEditorFirstVisibleLine();
            const lineRatio =
                sourceLineCount > 1 ? Math.min(1, firstLine / (sourceLineCount - 1)) : 0;
            const blockIndex = Math.min(
                blocks.length - 1,
                Math.max(0, Math.round(lineRatio * (blocks.length - 1)))
            );
            const target = blocks[blockIndex];
            const targetTop =
                target.getBoundingClientRect().top -
                preview.getBoundingClientRect().top +
                preview.scrollTop;
            preview.scrollTop = Math.max(0, targetTop - 12);
        }

        async function updatePreview() {
            if (previewPipelineBusy) {
                previewPipelinePending = true;
                return;
            }
            previewPipelineBusy = true;
            try {
                do {
                    previewPipelinePending = false;
                    await executePreviewRender();
                } while (previewPipelinePending);
            } finally {
                previewPipelineBusy = false;
            }
        }

        async function saveDocument() {
            if (!currentFilePath) {
                await saveDocumentAs();
                return;
            }
            try {
                const file = await invoke('write_document', {
                    path: currentFilePath,
                    content: editor.value
                });
                const pathChanged = currentFilePath !== file.path;
                currentFilePath = file.path;
                currentFileMtime = file.modifiedMs ?? currentFileMtime;
                setFilenameLabel(`Editing: ${file.path}`, file.path);
                setUpdateStatus('Saved.');
                if (pathChanged) notifyActiveFileChanged();
                if (gitVisible) void refreshGitStatus();
            } catch (error) {
                setUpdateStatus(`Save failed: ${error?.message || error}`);
            }
        }

        async function saveDocumentAs() {
            const defaultPath = currentFilePath || undefined;
            try {
                const path = await saveDialog({
                    title: 'Save',
                    defaultPath,
                    filters: [
                        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }
                    ]
                });
                if (!path) return;
                const file = await invoke('write_document', { path, content: editor.value });
                currentFilePath = file.path;
                currentFileMtime = file.modifiedMs ?? 0;
                setFilenameLabel(`Editing: ${file.path}`, file.path);
                rememberOpenedPath(file.path);
                startFileWatcher(file.path, currentFileMtime);
                setUpdateStatus('Saved.');
            } catch (error) {
                setUpdateStatus(`Save failed: ${error?.message || error}`);
            }
        }

        async function copyToClipboard(button = null) {
            try {
                await navigator.clipboard.writeText(preview.innerHTML);
            } catch (_) {
                const fallback = document.createElement('textarea');
                fallback.value = preview.innerHTML;
                document.body.appendChild(fallback);
                fallback.select();
                document.execCommand('copy');
                document.body.removeChild(fallback);
            }

            if (!button) return;

            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.classList.add('bg-green-600');
            button.classList.remove('bg-indigo-600');

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.add('bg-indigo-600');
                button.classList.remove('bg-green-600');
            }, 2000);
        }

        function setUpdateStatus(message) {
            updateStatus.textContent = message;
            updateStatus.title = message;
        }

function showInstallUpdateBadge(tagName) {
    installUpdateBadge.textContent = `Install ${tagName}`;
    installUpdateBadge.title = `Install Lumina ${tagName}`;
    installUpdateBadge.classList.remove('hidden');
}

function hideInstallUpdateBadge() {
    installUpdateBadge.textContent = '';
    installUpdateBadge.title = '';
    installUpdateBadge.classList.add('hidden');
}

        function beginInstallProgressSession() {
            clearTimeout(installProgressEndTimer);
            installProgressEndTimer = null;
            clearInterval(installProgressTickTimer);
            installProgressTickTimer = null;
            installProgressTracking = true;
            installProgressState = createInstallProgressState();
            installProgressLineBuffer = '';
            installProgressAnchor = createInstallProgressAnchorState();
            updateStatus.classList.add('hidden');
            installProgressRoot.classList.remove('hidden');
            installProgressFill.style.width = '0%';
            if (installProgressPercent) {
                installProgressPercent.textContent = '—';
            }
            installProgressDetail.textContent = 'Waiting for the installer in the terminal…';
            installProgressDetail.title = '';
            installProgressTickTimer = setInterval(() => {
                if (!installProgressTracking || !installProgressState) {
                    return;
                }
                syncInstallProgressView();
            }, installProgressTickMs);
        }

        function endInstallProgressSession() {
            clearTimeout(installProgressEndTimer);
            installProgressEndTimer = null;
            clearInterval(installProgressTickTimer);
            installProgressTickTimer = null;
            installProgressTracking = false;
            installProgressState = null;
            installProgressLineBuffer = '';
            installProgressRoot.classList.add('hidden');
            updateStatus.classList.remove('hidden');
        }

        function scheduleEndInstallAfterComplete() {
            if (installProgressEndTimer) {
                return;
            }
            installProgressEndTimer = setTimeout(() => {
                installProgressEndTimer = null;
                endInstallProgressSession();
                const target = latestReleaseTag
                    ? String(latestReleaseTag).trim()
                    : 'the new build';
                setUpdateStatus(`Install finished (${target}). Relaunching…`);
                void (async () => {
                    try {
                        await relaunch();
                    } catch (_) {
                        setUpdateStatus(
                            `Install finished (${target}). Quit Lumina completely and open it again (e.g. from /Applications) to load the new version. The title bar shows the version after relaunch.`
                        );
                    }
                })();
            }, 2000);
        }

        function syncInstallProgressView() {
            if (!installProgressState) {
                return;
            }
            const now = performance.now();
            const terminalP = displayPercentFromInstallProgress(installProgressState);
            // When the shell printed a real progress bar, use that percent and `about … left`
            // as-is. Interpolation + scaled countdown were for the old step-floor mismatch and
            // disagree with install.sh (and the terminal).
            const hasBarLine = Number.isFinite(installProgressState.percent);
            const live =
                installProgressTracking &&
                !hasBarLine &&
                terminalP != null &&
                terminalP < 100
                    ? {
                          interpolatedPercent: getInterpolatedInstallPercent(
                              installProgressAnchor,
                              installProgressState,
                              now
                          ),
                          countdownSeconds: getCountdownSecondsRemaining(
                              installProgressAnchor,
                              now
                          )
                      }
                    : null;
            const view = createInstallProgressViewModel(installProgressState, live);
            installProgressFill.style.width = `${view.width}%`;
            if (installProgressPercent) {
                installProgressPercent.textContent = view.percentText;
            }
            installProgressDetail.textContent = view.subtitle;
            installProgressDetail.title = view.title;
        }

        function feedInstallProgressFromTerminal(raw) {
            if (!installProgressTracking || !installProgressState) {
                return;
            }
            installProgressLineBuffer += raw;
            const parts = installProgressLineBuffer.split(/\r\n|\n|\r/);
            installProgressLineBuffer = parts.pop() || '';
            for (const part of parts) {
                const { changed, done, failed } = processInstallProgressLine(installProgressState, part);
                if (changed || done) {
                    refreshInstallProgressAnchor(installProgressAnchor, installProgressState);
                    syncInstallProgressView();
                }
                if (done && failed) {
                    // Installer/build failed or was interrupted — close the card and
                    // surface the error rather than relaunching into a stale build.
                    endInstallProgressSession();
                    setUpdateStatus('Install/rebuild failed — see the terminal for details.');
                    return;
                }
                if (done) {
                    scheduleEndInstallAfterComplete();
                }
            }
        }

        function shellQuote(value) {
            return `'${String(value).replaceAll("'", "'\\''")}'`;
        }

        function releaseInstallCommand(tagName) {
            return `echo "Downloading the Lumina installer (build steps can take many minutes)…" && curl -fL --connect-timeout 30 --retry 2 ${publicInstallerUrl} | GIT_REF=${shellQuote(tagName)} bash`;
        }

        function waitForTerminalToSettle(ms) {
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(resolve, ms);
                    });
                });
            });
        }

        function isPtyOrShellWriteErrorMessage(message) {
            const m = String(message);
            return (
                m.includes('os error 5') ||
                m.includes('Input/output error') ||
                m.includes('Broken pipe') ||
                m.includes('not running') ||
                m.includes('Not connected') ||
                m.includes('not connected')
            );
        }

        async function respawnShellProcess() {
            if (terminalShellRespawnPromise) {
                return terminalShellRespawnPromise;
            }
            terminalShellRespawnPromise = (async () => {
                try {
                    if (!terminal) {
                        return;
                    }
                    await invoke('terminal_kill');
                    await invoke('terminal_spawn', { cols: terminal.cols, rows: terminal.rows });
                    terminalStarted = true;
                    terminalStatus.textContent = 'Running';
                    terminal.write(
                        '\r\n\x1b[33m[Shell restarted: previous process ended or the PTY closed (common after Ctrl+C or EIO).]\x1b[0m\r\n'
                    );
                    scheduleTerminalScrollToBottom();
                } catch (e) {
                    terminalStarted = false;
                    const msg = e?.message || String(e);
                    terminal?.write(`\r\n\x1b[31mFailed to start shell: ${msg}\x1b[0m\r\n`);
                    scheduleTerminalScrollToBottom();
                    terminalStatus.textContent = 'Error';
                } finally {
                    terminalShellRespawnPromise = null;
                }
            })();
            return terminalShellRespawnPromise;
        }

        async function writeToTerminalPtyWithRetry(data) {
            try {
                await invoke('terminal_write', { data });
            } catch (error) {
                const message = error?.message || String(error);
                if (!isPtyOrShellWriteErrorMessage(message)) {
                    throw error;
                }
                await respawnShellProcess();
                await invoke('terminal_write', { data });
            }
        }

        /**
         * Injects a full line into the shell. Sends a single `terminal_write` with
         * the command and carriage return so the PTY line discipline gets one
         * atomic line (xterm's `paste` path and split `onData` → invoke chains
         * were racing and the shell could miss or mangle the line).
         * Echoes the same line in the buffer so the full command is visible even
         * before the host shell echoes.
         */
        async function runCommandInTerminal(
            command,
            label,
            { trackInstallProgress: trackInstall = false } = {}
        ) {
            const shellReadyBefore = terminalStarted;
            await toggleTerminal(true);
            if (trackInstall) {
                beginInstallProgressSession();
            }
            terminalInputBuffer = '';
            terminal?.write(`\r\n\x1b[1m${label}\x1b[0m\r\n`);
            terminal?.write(`\x1b[2m${command}\x1b[0m\r\n`);
            scheduleTerminalScrollToBottom();

            const settleMs = shellReadyBefore && terminalStarted ? 180 : 600;
            await waitForTerminalToSettle(settleMs);

            try {
                await writeToTerminalPtyWithRetry(`${command}\r`);
            } catch (e) {
                if (trackInstall) {
                    endInstallProgressSession();
                }
                setUpdateStatus(`Terminal: ${e?.message || e}`);
                terminal?.write(`\r\n\x1b[31m${e?.message || e}\x1b[0m\r\n`);
                scheduleTerminalScrollToBottom();
            }
            terminal?.focus();
        }

async function checkForUpdate({ background = false } = {}) {
            if (updateCheckInProgress) return;
            updateCheckInProgress = true;
            latestReleaseTag = null;
    hideInstallUpdateBadge();
    if (!background) {
        setUpdateStatus('Checking GitHub releases and tags...');
    }

            try {
                const [releaseResponse, tagsResponse] = await Promise.all([
                    fetch(releaseApiUrl, {
                        headers: { Accept: 'application/vnd.github+json' },
                        cache: 'no-store'
                    }),
                    fetch(tagsApiUrl, {
                        headers: { Accept: 'application/vnd.github+json' },
                        cache: 'no-store'
                    })
                ]);

                let latestReleaseTagName = null;
                if (releaseResponse.ok) {
                    const release = await releaseResponse.json();
                    latestReleaseTagName = release.tag_name;
                } else if (releaseResponse.status !== 404) {
                    throw new Error(`GitHub releases returned ${releaseResponse.status}`);
                }

                if (!tagsResponse.ok) {
                    throw new Error(`GitHub tags returned ${tagsResponse.status}`);
                }

                const latestTagInfo = selectLatestUpdateTag({
                    latestReleaseTag: latestReleaseTagName,
                    tags: await tagsResponse.json()
                });

                if (!latestTagInfo) {
                    setUpdateStatus('No semver GitHub releases or tags found.');
                    return;
                }

                const { tag: latestTag, source } = latestTagInfo;
                if (compareVersions(latestTag, currentVersion) > 0) {
                    latestReleaseTag = latestTag;
            showInstallUpdateBadge(latestTag);
                    setUpdateStatus(`Update available: ${latestTag} (${source})`);
                } else {
            hideInstallUpdateBadge();
            if (!background) {
                setUpdateStatus(`Up to date: v${currentVersion}; latest ${source} is ${latestTag}`);
            }
                }
            } catch (error) {
        hideInstallUpdateBadge();
        if (!background) {
            setUpdateStatus(`Update check failed: ${error?.message || error}`);
        }
            } finally {
                updateCheckInProgress = false;
            }
        }

        async function installDetectedUpdate() {
            if (!latestReleaseTag) {
                setUpdateStatus('Check for updates first.');
                return;
            }

            const confirmed = window.confirm(
                `Install Lumina ${latestReleaseTag} from GitHub?\n\n` +
                    'This runs the public install.sh and rebuilds the app locally. ' +
                    'The first build often takes many minutes; wait until it finishes (do not treat a quiet terminal as a hang).'
            );
            if (!confirmed) return;

            await runCommandInTerminal(
                releaseInstallCommand(latestReleaseTag),
                `Installing Lumina ${latestReleaseTag} from GitHub releases...`,
                { trackInstallProgress: true }
            );
        hideInstallUpdateBadge();
        }

        async function loadCurrentCheckoutInstaller() {
            try {
                const info = await invoke('current_checkout_install_info');
                if (!info.available || !info.command) return;

                currentCheckoutInstallCommand = info.command;
            } catch (_) {
                currentCheckoutInstallCommand = null;
            }
        }

        async function installCurrentCheckout() {
            if (!currentCheckoutInstallCommand) {
                setUpdateStatus('Local checkout install is only available in development builds.');
                return;
            }

            const confirmed = window.confirm(
                'Install the current local checkout into /Applications?\n\nUse this only for development and local testing, not normal user updates.'
            );
            if (!confirmed) return;

            await runCommandInTerminal(
                currentCheckoutInstallCommand,
                'Installing the current local checkout...',
                { trackInstallProgress: true }
            );
        }

        function cleanTerminalPath(path) {
            return path
                .trim()
                .replace(/^[<("'`]+/, '')
                .replace(/[>)"'`,;.]+$/, '');
        }

        function handleTerminalCommandInput(data) {
            if (data === '\u0003') {
                terminalInputBuffer = '';
                return;
            }

            if (data === '\u007f') {
                terminalInputBuffer = terminalInputBuffer.slice(0, -1);
                return;
            }

            if (data === '\r') {
                const command = terminalInputBuffer.trim();
                terminalInputBuffer = '';
                const cdMatch = command.match(/^cd(?:\s+(.+))?$/);
                if (cdMatch) {
                    const target = cdMatch[1]?.trim() || '~';
                    invoke('terminal_set_cwd', { path: target }).catch(() => {});
                }
                return;
            }

            if (/^[\x20-\x7e]+$/.test(data)) {
                terminalInputBuffer += data;
            }
        }

        function clearTerminalSelectionAfterLink() {
            if (!terminal) return;
            const run = () => {
                try {
                    terminal.clearSelection();
                } catch {
                    // ignore
                }
            };
            run();
            queueMicrotask(run);
            requestAnimationFrame(() => {
                run();
                requestAnimationFrame(run);
            });
        }

        async function openClickedTerminalFile(path) {
            try {
                const cleanPath = cleanTerminalPath(path);
                if (!cleanPath) return;

                try {
                    setFilenameLabel(`Opening: ${cleanPath}`, cleanPath);
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    const file = await invoke('open_file_path', { path: cleanPath });
                    setEditorContent(file.content, `Editing: ${file.path}`, file.path);
                    rememberOpenedPath(file.path);
                    editor.focus();
                } catch (error) {
                    setFilenameLabel('Editor (Markdown + LaTeX)');
                    terminal?.write(`\r\nUnable to open ${cleanPath}: ${error}\r\n`);
                    scheduleTerminalScrollToBottom();
                }
            } finally {
                clearTerminalSelectionAfterLink();
            }
        }

        function activateTerminalFileLink(event, path) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            clearTerminalSelectionAfterLink();
            setTimeout(() => {
                openClickedTerminalFile(path).catch((error) => {
                    terminal?.write(`\r\nUnable to open ${path}: ${error}\r\n`);
                    scheduleTerminalScrollToBottom();
                });
            }, 0);
        }

        function provideTerminalFileLinks(bufferLineNumber, callback) {
            const line = terminal?.buffer.active.getLine(bufferLineNumber - 1);
            if (!line) {
                callback(undefined);
                return;
            }

            const text = line.translateToString(true);
            const filePathPattern = /(?:~|\/|\.\.?\/)?[A-Za-z0-9._@%+-][^\s"'<>]*(?:\.md|\.markdown|\.txt)(?::\d+(?::\d+)?)?/gi;
            const links = [];
            let match = null;

            while ((match = filePathPattern.exec(text)) !== null) {
                const rawPath = cleanTerminalPath(match[0]);
                if (!rawPath || rawPath.endsWith('/')) continue;

                links.push({
                    text: rawPath,
                    range: {
                        start: { x: match.index + 1, y: bufferLineNumber },
                        end: { x: match.index + match[0].length, y: bufferLineNumber }
                    },
                    activate: (event) => activateTerminalFileLink(event, rawPath)
                });
            }

            callback(links.length > 0 ? links : undefined);
        }

        function scheduleTerminalScrollToBottom() {
            if (!terminal) return;
            if (terminalScrollBottomRaf != null) return;
            terminalScrollBottomRaf = requestAnimationFrame(() => {
                terminalScrollBottomRaf = null;
                terminal.scrollToBottom();
                // Second frame: xterm viewport height can settle after FitAddon / flex layout.
                requestAnimationFrame(() => {
                    terminal.scrollToBottom();
                });
            });
        }

        // True when the chat transcript is scrolled (near) the bottom, so new
        // messages keep tailing only while the user is already at the latest.
        function isClaudeTranscriptAtBottom() {
            if (!claudeTranscript) return true;
            const slack = 28;
            return (
                claudeTranscript.scrollHeight -
                    claudeTranscript.scrollTop -
                    claudeTranscript.clientHeight <=
                slack
            );
        }

        function scheduleClaudeScrollToBottom() {
            if (!claudeTranscript) return;
            requestAnimationFrame(() => {
                claudeTranscript.scrollTop = claudeTranscript.scrollHeight;
            });
        }

        // True when the viewport is scrolled to the bottom. xterm's `viewportY` is the
        // top line of the current viewport and `baseY` is that value when fully scrolled
        // down, so equal (or greater) means we're tailing the latest output. When the
        // user has scrolled up to read, this returns false and we leave the view alone.
        function isTermAtBottom(term) {
            if (!term) return true;
            const buffer = term.buffer.active;
            return buffer.viewportY >= buffer.baseY;
        }

        function applyTerminalFit() {
            if (!terminalVisible || !fitAddon || !terminal) return;
            fitAddon.fit();
            scheduleTerminalScrollToBottom();
            if (!terminal.cols || !terminal.rows) return;
            if (terminal.cols === terminalLastFitCols && terminal.rows === terminalLastFitRows) return;
            terminalLastFitCols = terminal.cols;
            terminalLastFitRows = terminal.rows;
            invoke('terminal_resize', {
                cols: terminal.cols,
                rows: terminal.rows
            }).catch(() => {});
        }

        function resizeTerminal({ settle = true } = {}) {
            if (!terminalVisible || !terminal || !fitAddon) return;

            cancelAnimationFrame(terminalResizeFrame);
            terminalResizeFrame = requestAnimationFrame(() => {
                applyTerminalFit();
                // xterm’s FitAddon reads parent size; a second pass runs after this pane’s flex layout is final.
                if (settle) requestAnimationFrame(applyTerminalFit);
            });
        }

        // The Claude pane is now a flex chat view (no xterm), so only the embedded
        // terminal needs PTY refitting on layout changes.
        function resizeTerminals(options) {
            resizeTerminal(options);
        }

        // Live drag path: fitAddon.fit() reflows the whole xterm scrollback, which is
        // far too expensive to run on every mousemove (~60fps). The panes still resize
        // visually via CSS at full frame rate; we only reflow the terminals a few times
        // per second during the drag, then let the mouseup handlers run a final fit.
        let liveResizeAt = 0;
        const LIVE_RESIZE_INTERVAL_MS = 90;
        function resizeTerminalsLive() {
            const now = performance.now();
            if (now - liveResizeAt < LIVE_RESIZE_INTERVAL_MS) return;
            liveResizeAt = now;
            resizeTerminals({ settle: false });
        }

// Core send: make sure the chat session is live, append the user turn to the
// transcript, and hand it to the CLI over stream-json. A no-op for blank text or
// while a reply is still streaming (use Stop to interrupt first).
async function submitClaudeMessage(text) {
    const message = String(text ?? '').replace(/\s+$/, '');
    if (!message.trim()) return;
    if (claudeChatState && claudeChatState.busy) return;
    suppressClaudeFocusContext = true;
    try {
        await toggleClaude(true);
        if (!claudeStarted || !claudeChatState) return;
        appendUserTurn(claudeChatState, message);
        renderClaudeChat();
        updateClaudeBusyUI();
        await invoke('claude_chat_send', { text: message });
    } catch (error) {
        if (claudeChatState) claudeChatState.error = `Send failed: ${error?.message || error}`;
        renderClaudeChat();
    } finally {
        lastClaudeContextPath = currentFilePath;
        setTimeout(() => { suppressClaudeFocusContext = false; }, 0);
    }
}

// sendClaudeContext / presets funnel through here so a "prompt" is just a message.
async function writeClaudePrompt(prompt) {
    await submitClaudeMessage(prompt);
}

// Pasted-image tracking: the textarea shows `[Image #N]` placeholders while the
// real file paths live here, keyed by N. Resolved into the message at send time.
const claudePastedImagePaths = new Map();
let claudePastedImageCounter = 0;

function resolveClaudePastedImages(text) {
    if (!claudePastedImagePaths.size) return text;
    return text.replace(/\[Image #(\d+)\]/g, (match, n) => {
        const path = claudePastedImagePaths.get(Number(n));
        return path ? `[Image #${n}: ${path}]` : match;
    });
}

// Composer send: resolve any pasted-image placeholders, then submit.
async function sendClaudeMessage(text) {
    const resolved = resolveClaudePastedImages(text);
    claudePastedImagePaths.clear();
    claudePastedImageCounter = 0;
    await submitClaudeMessage(resolved);
}

// ----- Chat transcript rendering --------------------------------------------
// Incremental renderer: each turn gets one element, built once and then frozen
// ("finalized"). Only the live (last, still-streaming) turn re-renders per frame.
// While streaming, text blocks use a fast synchronous markdown parse; on finalize
// they get the full pipeline (highlight + mermaid + KaTeX) via renderMarkdownInto.
let claudeTurnEls = [];

function resetClaudeTranscript() {
    claudeTurnEls = [];
    if (claudeTranscript) {
        claudeTranscript.innerHTML = '';
        if (claudeEmpty) claudeTranscript.appendChild(claudeEmpty);
    }
    if (claudeEmpty) claudeEmpty.classList.remove('hidden');
}

function renderClaudeChat() {
    if (claudeRenderRaf != null) return;
    claudeRenderRaf = requestAnimationFrame(() => {
        claudeRenderRaf = null;
        flushClaudeChat();
    });
}

function flushClaudeChat() {
    if (!claudeTranscript || !claudeChatState) return;
    const state = claudeChatState;
    const stick = isClaudeTranscriptAtBottom();

    if (claudeEmpty) claudeEmpty.classList.toggle('hidden', state.turns.length > 0);

    for (let i = 0; i < state.turns.length; i += 1) {
        const turn = state.turns[i];
        let entry = claudeTurnEls[i];
        if (!entry) {
            entry = createTurnEl(turn);
            claudeTurnEls[i] = entry;
            claudeTranscript.appendChild(entry.root);
        }
        if (entry.finalized) continue;

        // A turn stops changing once a newer turn exists or the run is idle.
        const shouldFinalize = turn.role === 'user' || i < state.turns.length - 1 || !state.busy;
        updateTurnEl(entry, turn, shouldFinalize);
        if (shouldFinalize) entry.finalized = true;
    }

    renderClaudeFooter(state);
    if (stick) scheduleClaudeScrollToBottom();
}

function createTurnEl(turn) {
    const root = document.createElement('div');
    root.className = `claude-msg claude-msg-${turn.role}`;
    if (turn.role === 'user') {
        const bubble = document.createElement('div');
        bubble.className = 'claude-bubble';
        root.appendChild(bubble);
        return { root, bubble, finalized: false };
    }
    const blocks = document.createElement('div');
    blocks.className = 'claude-blocks';
    root.appendChild(blocks);
    return { root, blocks, finalized: false };
}

function updateTurnEl(entry, turn, final) {
    if (turn.role === 'user') {
        entry.bubble.textContent = turn.text || '';
        return;
    }
    const blocks = entry.blocks;
    blocks.innerHTML = '';
    for (const block of turn.blocks || []) {
        if (!block) continue;
        if (block.kind === 'thinking') {
            blocks.appendChild(buildThinkingBlock(block));
        } else if (block.kind === 'tool') {
            blocks.appendChild(buildToolBlock(block));
        } else {
            blocks.appendChild(buildTextBlock(block, final));
        }
    }
}

function buildTextBlock(block, final) {
    const el = document.createElement('div');
    el.className = 'claude-text markdown-body';
    const text = block.text || '';
    if (final) {
        // Full pipeline (async); fine to fire-and-forget into this stable element.
        void renderMarkdownInto(el, text);
    } else {
        el.innerHTML = marked.parse(text);
    }
    return el;
}

function buildThinkingBlock(block) {
    const details = document.createElement('details');
    details.className = 'claude-think';
    const summary = document.createElement('summary');
    summary.textContent = 'Thinking';
    const body = document.createElement('div');
    body.className = 'claude-think-body';
    body.textContent = block.text || '';
    details.appendChild(summary);
    details.appendChild(body);
    return details;
}

function buildToolBlock(block) {
    const details = document.createElement('details');
    details.className = 'claude-tool';
    if (block.isError) details.classList.add('claude-tool-error');
    const summary = document.createElement('summary');
    const icon = block.result == null && !block.done ? '⚙️' : block.isError ? '⚠️' : '🔧';
    summary.textContent = `${icon} ${describeTool(block)}`;
    details.appendChild(summary);

    const inputText = block.input != null ? safeStringify(block.input) : block.inputJson || '';
    if (inputText) {
        const pre = document.createElement('pre');
        pre.className = 'claude-tool-input';
        pre.textContent = inputText;
        details.appendChild(pre);
    }
    if (block.result != null && block.result !== '') {
        const pre = document.createElement('pre');
        pre.className = 'claude-tool-result';
        pre.textContent = block.result;
        details.appendChild(pre);
    }
    return details;
}

function safeStringify(value) {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function renderClaudeFooter(state) {
    // Footer + error live after all turns; cheap to rebuild each flush.
    if (claudeFooterEl && claudeFooterEl.parentNode) claudeFooterEl.remove();
    claudeFooterEl = null;

    const parts = [];
    if (state.error) parts.push({ cls: 'claude-error', text: state.error });
    if (state.result && !state.busy) {
        const bits = [];
        if (typeof state.result.durationMs === 'number') {
            bits.push(`${(state.result.durationMs / 1000).toFixed(1)}s`);
        }
        if (typeof state.result.costUsd === 'number') {
            bits.push(`$${state.result.costUsd.toFixed(4)}`);
        }
        if (state.result.isError) bits.unshift('error');
        if (bits.length) parts.push({ cls: 'claude-result', text: bits.join(' · ') });
    }
    if (!parts.length) return;

    claudeFooterEl = document.createElement('div');
    claudeFooterEl.className = 'claude-footer';
    for (const part of parts) {
        const span = document.createElement('div');
        span.className = part.cls;
        span.textContent = part.text;
        claudeFooterEl.appendChild(span);
    }
    claudeTranscript.appendChild(claudeFooterEl);
}

let claudeFooterEl = null;

// Reflect run state in the header: status text, Stop button, composer hint.
function updateClaudeBusyUI() {
    const busy = Boolean(claudeChatState && claudeChatState.busy);
    if (claudeStatus) claudeStatus.textContent = !claudeStarted ? 'Stopped' : busy ? 'Thinking…' : 'Ready';
    if (claudeStopBtn) claudeStopBtn.classList.toggle('hidden', !busy);
    if (claudeInput) claudeInput.classList.toggle('claude-input-busy', busy);
}

async function stopClaudeChat() {
    try {
        await invoke('claude_chat_stop');
    } catch (_) {
        /* ignore */
    }
    if (claudeChatState) {
        claudeChatState.busy = false;
        claudeChatState.exited = true;
    }
    renderClaudeChat();
    updateClaudeBusyUI();
}

// Save a pasted-image File to disk via Tauri and insert an `[Image #N]` marker
// at the cursor. The actual path is substituted in at send time so the visible
// composer text stays short — matches the regular Claude CLI paste UX.
async function handleClaudeImagePaste(file) {
    if (!file || !claudeInput) return;
    const buffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    const mime = file.type || 'image/png';
    const extension = mime.split('/')[1] || 'png';
    let path;
    try {
        path = await invoke('claude_save_pasted_image', { bytes, extension });
    } catch (error) {
        setUpdateStatus(`Could not save pasted image: ${error}`);
        return;
    }
    const n = ++claudePastedImageCounter;
    claudePastedImagePaths.set(n, path);

    const marker = `[Image #${n}]`;
    const start = claudeInput.selectionStart ?? claudeInput.value.length;
    const end = claudeInput.selectionEnd ?? claudeInput.value.length;
    const before = claudeInput.value.slice(0, start);
    const after = claudeInput.value.slice(end);
    const needsLead = before.length > 0 && !/\s$/.test(before);
    const needsTail = after.length > 0 && !/^\s/.test(after);
    const insert = `${needsLead ? ' ' : ''}${marker}${needsTail ? ' ' : ''}`;
    claudeInput.value = `${before}${insert}${after}`;
    const caret = before.length + insert.length;
    claudeInput.setSelectionRange(caret, caret);
    autoSizeClaudeInput();
}

// Grows the input box with its content up to the CSS max-height. The transcript
// above is a flex child, so it shrinks to make room automatically.
function autoSizeClaudeInput() {
    if (!claudeInput) return;
    claudeInput.style.height = 'auto';
    claudeInput.style.height = `${claudeInput.scrollHeight}px`;
}

function wireClaudeInputBar() {
    if (!claudeInputBar || !claudeInput) return;

    claudeInput.addEventListener('input', autoSizeClaudeInput);

    claudeInput.addEventListener('focus', () => {
        void maybeAutoSendClaudeContext();
    });

    claudeInput.addEventListener('paste', (event) => {
        const items = event.clipboardData?.items;
        if (!items) return;
        const images = [];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) images.push(file);
            }
        }
        if (!images.length) return;
        event.preventDefault();
        (async () => {
            for (const file of images) {
                await handleClaudeImagePaste(file);
            }
        })();
    });

    // Enter sends; Shift+Enter inserts a newline.
    claudeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            const text = claudeInput.value;
            claudeInput.value = '';
            autoSizeClaudeInput();
            void sendClaudeMessage(text);
        }
    });

    claudeInputBar.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = claudeInput.value;
        claudeInput.value = '';
        autoSizeClaudeInput();
        void sendClaudeMessage(text);
    });
}

// Send fresh context when the user focuses into the Claude pane — but only once
// per document, when you switch files. Refocusing to read/scroll/continue a
// conversation, or moving the cursor and selecting within the same file, no
// longer re-pastes the block.
async function maybeAutoSendClaudeContext() {
    if (!claudeStarted || suppressClaudeFocusContext) return;
    if (currentFilePath === lastClaudeContextPath) return;
    await sendClaudeContext();
}

async function sendClaudeContext(extraInstruction = '') {
    const prompt = `${claudeBaseContext()}${extraInstruction ? `\n\nTask: ${extraInstruction}` : ''}`;
    await writeClaudePrompt(prompt);
}

async function sendClaudePreset() {
    const presets = [
        ['Improve writing', 'Improve the clarity, flow, and tone of this Markdown. Preserve meaning and structure.'],
        ['Summarize', 'Summarize this document into concise bullet points.'],
        ['Fix Markdown', 'Fix Markdown formatting, list hierarchy, task lists, tables, Mermaid, and LaTeX issues.'],
        ['Explain math', 'Explain any LaTeX/math content in plain language and flag notation problems.'],
        ['Create outline', 'Create a clean hierarchical outline for this document.']
    ];
    const choice = window.prompt(
        `Send Claude prompt:\n\n${presets.map(([label], index) => `${index + 1}. ${label}`).join('\n')}\n\nEnter a number:`
    );
    if (!choice) return;

    const preset = presets[Number(choice.trim()) - 1];
    if (!preset) {
        setUpdateStatus('Claude prompt selection was not recognized.');
        return;
    }

    await sendClaudeContext(preset[1]);
}

async function pullClaudeWorkspaceFile() {
    claudeApplyMenu.classList.add('hidden');
    claudeApplyMenuBtn.setAttribute('aria-expanded', 'false');
    if (!claudeWorkspaceFilePath) {
        setUpdateStatus('Claude workspace file is not available yet.');
        return;
    }

    try {
        const file = await invoke('open_file_path', { path: claudeWorkspaceFilePath });
        pushEditorHistory();
        editor.value = file.content;
        resetEditorHistory();
        schedulePreviewUpdate();
        editor.focus();
        setUpdateStatus('Pulled Claude workspace file into the editor.');
    } catch (error) {
        setUpdateStatus(`Unable to pull Claude file: ${error?.message || error}`);
    }
}

async function replaceSelectionFromClipboard() {
    claudeApplyMenu.classList.add('hidden');
    claudeApplyMenuBtn.setAttribute('aria-expanded', 'false');
    try {
        const text = await navigator.clipboard.readText();
        if (!text) {
            setUpdateStatus('Clipboard is empty.');
            return;
        }
        replaceEditorRange(editor.selectionStart, editor.selectionEnd, text, editor.selectionStart + text.length);
        editor.focus();
        setUpdateStatus('Applied clipboard text to the editor.');
    } catch (error) {
        setUpdateStatus(`Unable to read clipboard: ${error?.message || error}`);
    }
}

        function terminalTheme() {
            return {
                background: '#070b16',
                foreground: '#d9e2ef',
                cursor: '#38bdf8',
                selectionBackground: '#1e3a8a',
                black: '#020617',
                red: '#fb7185',
                green: '#34d399',
                yellow: '#facc15',
                blue: '#60a5fa',
                magenta: '#c084fc',
                cyan: '#22d3ee',
                white: '#e2e8f0',
                brightBlack: '#475569',
                brightRed: '#fda4af',
                brightGreen: '#86efac',
                brightYellow: '#fde047',
                brightBlue: '#93c5fd',
                brightMagenta: '#d8b4fe',
                brightCyan: '#67e8f9',
                brightWhite: '#f8fafc'
            };
        }

        async function ensureTerminal() {
            if (terminalStarted) return;

            terminal = new Terminal({
                cursorBlink: true,
                // No convertEol: the PTY already emits CRLF for cooked output, and
                // full-screen TUIs (Claude Code) send bare \n as a same-column line
                // feed plus their own cursor control. Converting \n→\r\n forces the
                // cursor to column 0 mid-frame and corrupts the redraw (overlapping
                // spinner frames, leftover characters from the previous frame).
                fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Apple Symbols", "Apple Color Emoji", monospace',
                fontSize: 13,
                // Required by the Unicode 11 addon below: without it xterm uses
                // Unicode 6 character widths, so emoji/symbols in TUIs like Claude
                // Code drift out of alignment and overdraw the input border.
                allowProposedApi: true,
                theme: terminalTheme()
            });
            fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);
            terminal.loadAddon(new Unicode11Addon());
            terminal.unicode.activeVersion = '11';
            terminal.open(terminalElement);
            terminal.registerLinkProvider({ provideLinks: provideTerminalFileLinks });
            terminal.onData((data) => {
                handleTerminalCommandInput(data);
                void writeToTerminalPtyWithRetry(data).catch((error) => {
                    terminal.write(`\r\nTerminal write failed: ${error?.message || error}\r\n`);
                    scheduleTerminalScrollToBottom();
                });
            });

            if (terminalPtyHangupUnlisten == null) {
                terminalPtyHangupUnlisten = await listen('terminal-pty-hangup', () => {
                    void respawnShellProcess();
                });
            }

            terminalStatus.textContent = 'Starting';
            terminal.write('Starting shell...\r\n');
            scheduleTerminalScrollToBottom();
            terminalOutputUnlisten = await listen('terminal-output', (event) => {
                const payload = event.payload;
                feedInstallProgressFromTerminal(payload);
                const stick = isTermAtBottom(terminal);
                terminal.write(payload);
                if (stick) scheduleTerminalScrollToBottom();
            });

            fitAddon.fit();
            await invoke('terminal_spawn', {
                cols: terminal.cols,
                rows: terminal.rows
            });
            terminalStarted = true;
            terminalStatus.textContent = 'Running';
            resizeTerminal();
            setTimeout(resizeTerminal, 80);
        }

        async function ensureClaude() {
            if (claudeStarted) return;

            // Drop any listener left over from a prior (exited) session so a
            // restart doesn't stack duplicate handlers onto `claude-chat`.
            claudeChatUnlisten?.();
            claudeChatUnlisten = null;

            claudeChatState = createChatState();
            resetClaudeTranscript();
            claudeStatus.textContent = 'Starting';

            // Subscribe before spawning so the init event isn't missed. The reader
            // thread forwards one JSON line per event on `claude-chat`.
            claudeChatUnlisten = await listen('claude-chat', (event) => {
                const evt = parseChatLine(event.payload);
                if (!evt) return;
                reduceChatEvent(claudeChatState, evt);
                renderClaudeChat();
                updateClaudeBusyUI();
                if (evt.type === '__exit') {
                    claudeStarted = false;
                    updateClaudeBusyUI();
                }
            });

            const startArgs = { permissionMode: claudeModeSelect?.value || 'acceptEdits' };
            if (developLuminaMode && luminaSourceDir) {
                setUpdateStatus(`Claude is editing Lumina source at ${luminaSourceDir}.`);
                startArgs.cwd = luminaSourceDir;
            } else if (currentFilePath) {
                const directory = currentFileDirectory();
                setUpdateStatus(`Claude can read and edit files in ${directory}.`);
                // Persist the buffer first so Claude reads the latest content, then
                // keep the watcher live so its on-disk edits flow back to the editor.
                const savedFile = await invoke('write_document', {
                    path: currentFilePath,
                    content: editor.value
                });
                currentFileMtime = savedFile.modifiedMs ?? currentFileMtime;
                startArgs.filePath = currentFilePath;
                startArgs.cwd = currentFileDirectory();
                startFileWatcher(currentFilePath, currentFileMtime);
            }

            let workspaceInfo = null;
            try {
                workspaceInfo = await invoke('claude_chat_start', startArgs);
            } catch (error) {
                claudeStatus.textContent = 'Error';
                if (claudeChatState) {
                    claudeChatState.error = `Claude failed to start: ${error?.message || error}`;
                }
                renderClaudeChat();
                claudeChatUnlisten?.();
                claudeChatUnlisten = null;
                throw error;
            }

            if (developLuminaMode && luminaSourceDir) {
                claudeWorkspaceFilePath = null;
                claudeWorkspaceStatus.textContent = `Editing Lumina source · ${basename(luminaSourceDir)}`;
                claudeWorkspaceStatus.title = luminaSourceDir;
            } else {
                claudeWorkspaceFilePath = workspaceInfo?.filePath || currentFilePath;
                claudeWorkspaceStatus.textContent = claudeWorkspaceFilePath
                    ? `Editing ${basename(claudeWorkspaceFilePath)}`
                    : 'Using terminal directory';
                claudeWorkspaceStatus.title = claudeWorkspaceFilePath || 'Claude is using the current terminal directory';
            }
            claudeStarted = true;
            // Suppress the focus auto-context for the file we just opened with.
            lastClaudeContextPath = currentFilePath;
            updateClaudeBusyUI();
        }

        // Run the Documents-touching source-checkout probes once, on first need.
        async function ensureSourceCheckoutInfo() {
            if (sourceCheckoutInfoLoaded) return;
            sourceCheckoutInfoLoaded = true;
            await loadCurrentCheckoutInstaller();
            await loadLuminaSourceDir();
        }

        async function loadLuminaSourceDir() {
            try {
                const info = await invoke('source_dir_info');
                if (info?.available && info.path) {
                    luminaSourceDir = info.path;
                } else {
                    luminaSourceDir = null;
                }
            } catch (_) {
                luminaSourceDir = null;
            }
            updateDevelopLuminaUi();
        }

        function updateDevelopLuminaUi() {
            const hasSource = Boolean(luminaSourceDir);
            claudeDevelopLuminaBtn.classList.toggle('hidden', !hasSource);
            claudeRebuildLuminaBtn.classList.toggle('hidden', !hasSource || !developLuminaMode);
            claudeDevelopLuminaBtn.setAttribute('aria-pressed', String(developLuminaMode));
            claudeDevelopLuminaBtn.classList.toggle('claude-action-primary', developLuminaMode);
            claudeDevelopLuminaBtn.title = developLuminaMode
                ? 'Stop editing Lumina source (next Claude session goes back to the open document)'
                : `Edit Lumina source code with Claude (${luminaSourceDir || 'no source detected'})`;
        }

        async function toggleDevelopLuminaMode() {
            if (!luminaSourceDir) {
                setUpdateStatus('No Lumina source checkout found.');
                return;
            }
            const turningOn = !developLuminaMode;
            if (claudeStarted) {
                const message = turningOn
                    ? `Restart Claude in the Lumina source directory?\n\n${luminaSourceDir}\n\nThis will end the current Claude session.`
                    : 'End the Lumina source Claude session and return to editing the open document?';
                if (!window.confirm(message)) return;
                try {
                    await invoke('claude_chat_stop');
                } catch (_) {
                    // best effort
                }
                claudeChatUnlisten?.();
                claudeChatUnlisten = null;
                claudeStarted = false;
                claudeChatState = null;
                resetClaudeTranscript();
                updateClaudeBusyUI();
            }
            developLuminaMode = turningOn;
            updateDevelopLuminaUi();
            if (!claudeVisible) {
                toggleClaude(true);
            } else {
                await ensureClaude();
            }
        }

        async function rebuildLumina() {
            if (!currentCheckoutInstallCommand) {
                setUpdateStatus('No installable Lumina checkout was detected.');
                return;
            }
            const confirmed = window.confirm(
                `Rebuild Lumina from source and reinstall?\n\n${luminaSourceDir || ''}\n\nThe app will rebuild (may take several minutes) and relaunch.`
            );
            if (!confirmed) return;
            await runCommandInTerminal(
                currentCheckoutInstallCommand,
                'Rebuilding Lumina from the source checkout...',
                { trackInstallProgress: true }
            );
        }

        function setPaneToggleState(button, active, activeClasses) {
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('bg-slate-800', active);
            button.classList.toggle('text-white', active);
            for (const className of activeClasses) {
                button.classList.toggle(className, active);
            }
        }

        function syncPaneToggleButtons() {
            setPaneToggleState(toggleSourceBtn, !sourceCollapsed, ['ring-1', 'ring-sky-500/40']);
            setPaneToggleState(toggleTerminalBtn, terminalVisible, ['ring-1', 'ring-sky-500/40']);
            setPaneToggleState(toggleClaudeBtn, claudeVisible, ['bg-violet-700', 'ring-1', 'ring-violet-400/50']);
            setPaneToggleState(toggleGitBtn, gitVisible, ['ring-1', 'ring-emerald-500/40']);
            setPaneToggleState(toggleFilesBtn, filesVisible, ['ring-1', 'ring-sky-500/40']);
            toggleSourceBtn.title = sourceCollapsed ? 'Show source pane' : 'Hide source pane';
            toggleTerminalBtn.title = terminalVisible ? 'Hide terminal' : 'Show terminal';
            toggleClaudeBtn.title = claudeVisible ? 'Hide Claude' : 'Show Claude';
            toggleGitBtn.title = gitVisible ? 'Hide Git' : 'Show Git';
            toggleFilesBtn.title = filesVisible ? 'Hide Files' : 'Show Files';
            syncAppMenu();
        }

        function visibleSidePaneCount() {
            return (terminalVisible ? 1 : 0)
                + (claudeVisible ? 1 : 0)
                + (filesVisible ? 1 : 0)
                + (gitVisible ? 1 : 0);
        }

        function syncSidePaneLayout() {
            const visibleCount = visibleSidePaneCount();
            const sidePaneVisible = visibleCount > 0;
            if (!sidePane) {
                resizeTerminals();
                return;
            }
            sidePane.classList.toggle('hidden', !sidePaneVisible);
            sidePaneResizer?.classList.toggle('hidden', !sidePaneVisible);
            sidePane.classList.toggle('side-pane-split', visibleCount > 1);
            sidePane.style.flexBasis = sidePaneVisible ? `${sidePanePercent}%` : '';
            applyVerticalPaneSizing();
            resizeTerminals();
        }

        // Apply the relative flex weights to the visible stacked panes and show a
        // drag handle between each adjacent visible pair.
        function applyVerticalPaneSizing() {
            const split = visibleSidePaneCount() > 1;
            terminalPane.style.flex = split ? `${paneWeights.terminal} 1 0` : '';
            claudePane.style.flex = split ? `${paneWeights.claude} 1 0` : '';
            filesPane.style.flex = split ? `${paneWeights.files} 1 0` : '';
            gitPane.style.flex = split ? `${paneWeights.git} 1 0` : '';

            // Stack order top→bottom: terminal, claude, files, git. Each resizer is
            // active only when the pane directly above it is visible and at least
            // one pane below it is, so each real gap gets one handle.
            const order = [
                ['terminal', terminalVisible],
                ['claude', claudeVisible],
                ['files', filesVisible],
                ['git', gitVisible],
            ];
            let prevVisibleKey = null;
            let resizerIndex = 0;
            for (let i = 0; i < order.length; i += 1) {
                const [key, visible] = order[i];
                if (!visible) continue;
                if (prevVisibleKey !== null) {
                    configureSplitResizer(sideSplitResizers[resizerIndex], prevVisibleKey, key);
                    resizerIndex += 1;
                }
                prevVisibleKey = key;
            }
            for (; resizerIndex < sideSplitResizers.length; resizerIndex += 1) {
                configureSplitResizer(sideSplitResizers[resizerIndex], null, null);
            }
        }

        function configureSplitResizer(resizer, aboveKey, belowKey) {
            if (!resizer) return;
            const active = Boolean(aboveKey && belowKey);
            resizer.classList.toggle('hidden', !active);
            if (active) {
                resizer.dataset.above = aboveKey;
                resizer.dataset.below = belowKey;
            } else {
                delete resizer.dataset.above;
                delete resizer.dataset.below;
            }
        }

        async function toggleTerminal(forceVisible) {
            terminalVisible = typeof forceVisible === 'boolean' ? forceVisible : !terminalVisible;
            terminalPane.classList.toggle('hidden', !terminalVisible);
            syncSidePaneLayout();
            syncPaneToggleButtons();

            if (terminalVisible) {
                try {
                    await ensureTerminal();
                    resizeTerminal();
                    terminal.focus();
                } catch (error) {
                    terminalStatus.textContent = 'Error';
                    terminal?.write(`\r\nTerminal failed to start: ${error}\r\n`);
                    scheduleTerminalScrollToBottom();
                }
            }
        }

        async function toggleClaude(forceVisible) {
            claudeVisible = typeof forceVisible === 'boolean' ? forceVisible : !claudeVisible;
            claudePane.classList.toggle('hidden', !claudeVisible);
            syncSidePaneLayout();
            syncPaneToggleButtons();

            if (claudeVisible) {
                void ensureSourceCheckoutInfo();
                try {
                    await ensureClaude();
                    claudeInput?.focus();
                } catch (error) {
                    claudeStatus.textContent = 'Error';
                    if (claudeChatState) {
                        claudeChatState.error = `Claude failed to start: ${error?.message || error}`;
                        renderClaudeChat();
                    }
                }
            }
        }

        async function toggleGit(forceVisible) {
            gitVisible = typeof forceVisible === 'boolean' ? forceVisible : !gitVisible;
            gitPane.classList.toggle('hidden', !gitVisible);
            syncSidePaneLayout();
            syncPaneToggleButtons();
            if (gitVisible) {
                await refreshGitStatus();
            }
        }

        async function toggleFiles(forceVisible) {
            filesVisible = typeof forceVisible === 'boolean' ? forceVisible : !filesVisible;
            filesPane.classList.toggle('hidden', !filesVisible);
            syncSidePaneLayout();
            syncPaneToggleButtons();
            if (filesVisible) {
                await ensureFilesRoot();
                await refreshFilesTree();
            }
        }

        function setFilesMessage(text, isError = false) {
            if (!filesMessage) return;
            if (!text) {
                filesMessage.classList.add('hidden');
                filesMessage.textContent = '';
                return;
            }
            filesMessage.textContent = text;
            filesMessage.classList.remove('hidden');
            filesMessage.classList.toggle('git-message-error', isError);
        }

        function readFilesExpanded() {
            try {
                const raw = localStorage.getItem(filesExpandedKey);
                if (!raw) return new Set();
                const list = JSON.parse(raw);
                return Array.isArray(list) ? new Set(list) : new Set();
            } catch (_) {
                return new Set();
            }
        }

        function persistFilesExpanded() {
            try {
                localStorage.setItem(filesExpandedKey, JSON.stringify([...filesExpanded]));
            } catch (_) {}
        }

        async function ensureFilesRoot() {
            if (filesRootPath) return;
            const stored = localStorage.getItem(filesRootKey);
            if (stored) {
                filesRootPath = stored;
                filesExpanded = readFilesExpanded();
                return;
            }
            // Prefer the directory of the currently open file; fall back to $HOME.
            const fileDir = currentFileDirectory();
            if (fileDir) {
                filesRootPath = fileDir;
            } else {
                try {
                    filesRootPath = await invoke('home_dir_path');
                } catch (_) {
                    filesRootPath = null;
                }
            }
            filesExpanded = readFilesExpanded();
        }

        async function listDir(path) {
            return invoke('list_directory', { path });
        }

        async function setFilesRoot(path) {
            filesRootPath = path;
            filesExpanded = new Set();
            persistFilesExpanded();
            try {
                localStorage.setItem(filesRootKey, path);
            } catch (_) {}
            await refreshFilesTree();
        }

        async function chooseFilesRoot() {
            try {
                const selected = await openDialog({
                    directory: true,
                    multiple: false,
                    defaultPath: filesRootPath || currentFileDirectory() || undefined,
                    title: 'Choose folder to browse'
                });
                if (!selected) return;
                await setFilesRoot(selected);
            } catch (error) {
                setFilesMessage(`Unable to open folder: ${error?.message || error}`, true);
            }
        }

        async function goUpFilesRoot() {
            if (!filesRootPath) return;
            try {
                const listing = await listDir(filesRootPath);
                if (!listing.parent) {
                    setFilesMessage('Already at filesystem root.');
                    return;
                }
                await setFilesRoot(listing.parent);
            } catch (error) {
                setFilesMessage(`Unable to go up: ${error?.message || error}`, true);
            }
        }

        async function refreshFilesTree() {
            if (!filesRootPath) {
                filesTree.innerHTML = '';
                filesRootLabel.textContent = 'No folder selected';
                filesRootLabel.title = '';
                setFilesMessage('Choose a folder to browse.');
                return;
            }
            setFilesMessage('');
            filesRootLabel.textContent = basename(filesRootPath) || filesRootPath;
            filesRootLabel.title = filesRootPath;
            try {
                const listing = await listDir(filesRootPath);
                filesRootPath = listing.path;
                filesTree.innerHTML = '';
                const children = await buildFilesTreeChildren(listing.entries, 0);
                if (children.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'files-empty';
                    empty.textContent = 'No editable files in this folder.';
                    filesTree.appendChild(empty);
                } else {
                    for (const node of children) filesTree.appendChild(node);
                }
                highlightCurrentFileRow();
            } catch (error) {
                filesTree.innerHTML = '';
                setFilesMessage(error?.message || String(error), true);
            }
        }

        async function buildFilesTreeChildren(entries, depth) {
            const nodes = [];
            for (const entry of entries) {
                const li = document.createElement('li');
                li.dataset.path = entry.path;
                li.dataset.kind = entry.isDir ? 'dir' : 'file';

                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'files-row';
                row.dataset.path = entry.path;
                row.dataset.kind = entry.isDir ? 'dir' : 'file';

                const indent = document.createElement('span');
                indent.className = 'files-row-indent';
                indent.style.width = `${depth * 14}px`;
                row.appendChild(indent);

                const icon = document.createElement('span');
                icon.className = 'files-row-icon';
                icon.textContent = entry.isDir
                    ? (filesExpanded.has(entry.path) ? '▾' : '▸')
                    : '·';
                row.appendChild(icon);

                const name = document.createElement('span');
                name.className = 'files-row-name';
                name.textContent = entry.name;
                row.appendChild(name);

                row.addEventListener('click', () => handleFilesRowClick(entry, row));
                li.appendChild(row);

                if (entry.isDir && filesExpanded.has(entry.path)) {
                    try {
                        const sub = await listDir(entry.path);
                        const subList = document.createElement('ul');
                        subList.className = 'files-tree';
                        const subNodes = await buildFilesTreeChildren(sub.entries, depth + 1);
                        for (const n of subNodes) subList.appendChild(n);
                        li.appendChild(subList);
                    } catch (_) {
                        // If the directory can't be read (perms etc.), collapse it
                        // silently — the row stays visible at the parent level.
                        filesExpanded.delete(entry.path);
                    }
                }

                nodes.push(li);
            }
            return nodes;
        }

        async function handleFilesRowClick(entry, row) {
            if (entry.isDir) {
                if (filesExpanded.has(entry.path)) filesExpanded.delete(entry.path);
                else filesExpanded.add(entry.path);
                persistFilesExpanded();
                await refreshFilesTree();
                return;
            }
            try {
                await openFilePath(entry.path);
            } catch (error) {
                setFilesMessage(`Unable to open ${entry.name}: ${error?.message || error}`, true);
            }
        }

        function highlightCurrentFileRow() {
            if (!filesTree) return;
            for (const row of filesTree.querySelectorAll('.files-row')) {
                row.setAttribute('aria-selected', String(row.dataset.path === currentFilePath));
            }
        }

        function gitCwd() {
            return currentFileDirectory() || undefined;
        }

        function gitErrorText(error) {
            return String(error?.message || error || 'Unknown error');
        }

        let gitStagedCount = 0;
        let autoCommitMessageTimer = null;
        const autoCommitMessageDelayMs = 700;

        // After staging, draft a commit message with Claude automatically — but only
        // when the box is empty (never clobber what the user typed) and something is
        // actually staged. Debounced so staging several files yields one message for
        // the whole staged set rather than a draft per partial diff.
        function scheduleAutoCommitMessage() {
            if (autoCommitMessageTimer !== null) clearTimeout(autoCommitMessageTimer);
            autoCommitMessageTimer = setTimeout(() => {
                autoCommitMessageTimer = null;
                if (!gitVisible) return;
                if (gitStagedCount <= 0) return;
                if (gitCommitMessage.value.trim()) return;
                if (gitGenerateBtn.disabled) return; // a generation is already running
                void generateCommitMessage();
            }, autoCommitMessageDelayMs);
        }

        function setGitMessage(text, isError = false) {
            if (!gitMessage) return;
            if (!text) {
                gitMessage.classList.add('hidden');
                gitMessage.textContent = '';
                return;
            }
            gitMessage.textContent = text;
            gitMessage.classList.remove('hidden');
            gitMessage.classList.toggle('git-message-error', isError);
        }

        async function refreshGitStatus() {
            setGitMessage('Loading…');
            try {
                const status = await invoke('git_status', { cwd: gitCwd() });
                renderGitStatus(status);
                setGitMessage('');
            } catch (error) {
                gitSections.innerHTML = '';
                gitBranch.textContent = '';
                gitBranch.title = '';
                gitTracking.textContent = '';
                hideGitDiff();
                setGitMessage(gitErrorText(error), true);
            }
        }

        const GIT_STATUS_LABELS = {
            M: 'Modified',
            A: 'Added',
            D: 'Deleted',
            R: 'Renamed',
            C: 'Copied',
            U: 'Unmerged',
            T: 'Type changed',
            '?': 'Untracked'
        };

        function renderGitStatus(status) {
            gitStagedCount = (status.staged && status.staged.length) || 0;
            gitBranch.textContent = status.branch || '';
            gitBranch.title = status.repoRoot || '';
            gitTracking.textContent = status.upstream
                ? `↑${status.ahead} ↓${status.behind}`
                : '';

            gitSections.innerHTML = '';
            if (status.clean) {
                hideGitDiff();
                const empty = document.createElement('div');
                empty.className = 'git-empty';
                empty.textContent = 'Working tree clean';
                gitSections.appendChild(empty);
                return;
            }
            if (status.staged.length) {
                gitSections.appendChild(renderGitSection('Staged', status.staged, 'unstage'));
            }
            if (status.unstaged.length) {
                gitSections.appendChild(renderGitSection('Changes', status.unstaged, 'stage'));
            }
            if (status.untracked.length) {
                gitSections.appendChild(renderGitSection('Untracked', status.untracked, 'stage'));
            }
        }

        function renderGitSection(title, files, action) {
            const section = document.createElement('div');
            section.className = 'git-section';

            const head = document.createElement('div');
            head.className = 'git-section-head';
            const label = document.createElement('span');
            label.textContent = `${title} (${files.length})`;
            head.appendChild(label);

            const allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.className = 'git-section-action';
            allBtn.textContent = action === 'stage' ? 'Stage all' : 'Unstage all';
            allBtn.addEventListener('click', () => {
                const paths = files.map((file) => file.path);
                if (action === 'stage') stagePaths(paths);
                else unstagePaths(paths);
            });
            head.appendChild(allBtn);
            section.appendChild(head);

            for (const file of files) {
                section.appendChild(renderGitRow(file, action));
            }
            return section;
        }

        function renderGitRow(file, action) {
            const row = document.createElement('div');
            row.className = 'git-row';

            const code = file.status === '??' ? '?' : file.status;
            const badge = document.createElement('span');
            badge.className = 'git-badge';
            badge.dataset.status = code;
            badge.textContent = code;
            badge.title = GIT_STATUS_LABELS[code] || file.status;
            row.appendChild(badge);

            const name = document.createElement('button');
            name.type = 'button';
            name.className = 'git-row-path';
            name.textContent = file.path;
            name.title = file.path;
            name.addEventListener('click', () => showGitDiff(file));
            row.appendChild(name);

            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = 'git-row-action';
            actionBtn.textContent = action === 'stage' ? '+' : '−';
            actionBtn.title = action === 'stage' ? 'Stage' : 'Unstage';
            actionBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (action === 'stage') stagePaths([file.path]);
                else unstagePaths([file.path]);
            });
            row.appendChild(actionBtn);
            return row;
        }

        async function stagePaths(paths) {
            if (!paths.length) return;
            try {
                await invoke('git_stage', { paths, cwd: gitCwd() });
                await refreshGitStatus();
                scheduleAutoCommitMessage();
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            }
        }

        async function unstagePaths(paths) {
            if (!paths.length) return;
            try {
                await invoke('git_unstage', { paths, cwd: gitCwd() });
                await refreshGitStatus();
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            }
        }

        async function showGitDiff(file) {
            try {
                const diff = await invoke('git_diff', {
                    path: file.path,
                    staged: !!file.staged,
                    untracked: !!file.untracked,
                    cwd: gitCwd()
                });
                renderGitDiff(file.path, diff);
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            }
        }

        function renderGitDiff(path, diff) {
            gitDiff.innerHTML = '';

            const head = document.createElement('div');
            head.className = 'git-diff-head';
            const title = document.createElement('span');
            title.textContent = path;
            title.title = path;
            head.appendChild(title);
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'git-diff-close';
            closeBtn.textContent = '×';
            closeBtn.title = 'Close diff';
            closeBtn.addEventListener('click', hideGitDiff);
            head.appendChild(closeBtn);
            gitDiff.appendChild(head);

            const pre = document.createElement('pre');
            pre.className = 'git-diff-body';
            const lines = diff && diff.length ? diff.replace(/\n$/, '').split('\n') : ['(no changes)'];
            for (const line of lines) {
                const span = document.createElement('span');
                span.className = 'git-diff-line';
                const first = line.charAt(0);
                if (line.startsWith('+++') || line.startsWith('---')) {
                    span.classList.add('git-diff-meta');
                } else if (line.startsWith('@@')) {
                    span.classList.add('git-diff-hunk');
                } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
                    span.classList.add('git-diff-meta');
                } else if (first === '+') {
                    span.classList.add('git-diff-add');
                } else if (first === '-') {
                    span.classList.add('git-diff-del');
                }
                span.textContent = line.length ? line : ' ';
                pre.appendChild(span);
            }
            gitDiff.appendChild(pre);
            gitDiff.classList.remove('hidden');
        }

        function hideGitDiff() {
            gitDiff.classList.add('hidden');
            gitDiff.innerHTML = '';
        }

        async function generateCommitMessage() {
            gitGenerateBtn.disabled = true;
            const previousLabel = gitGenerateBtn.textContent;
            gitGenerateBtn.textContent = 'Generating…';
            setGitMessage('Asking Claude to draft a commit message…');
            try {
                const message = await invoke('git_generate_commit_message', { cwd: gitCwd() });
                gitCommitMessage.value = message;
                gitCommitMessage.focus();
                setGitMessage('');
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            } finally {
                gitGenerateBtn.disabled = false;
                gitGenerateBtn.textContent = previousLabel;
            }
        }

        async function commitStaged() {
            const message = gitCommitMessage.value.trim();
            if (!message) {
                setGitMessage('Enter a commit message first.', true);
                gitCommitMessage.focus();
                return;
            }
            gitCommitBtn.disabled = true;
            try {
                const output = await invoke('git_commit', { message, cwd: gitCwd() });
                gitCommitMessage.value = '';
                hideGitDiff();
                await refreshGitStatus();
                const summary = output.trim().split('\n').find((line) => line.trim());
                setGitMessage(summary || 'Committed.');
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            } finally {
                gitCommitBtn.disabled = false;
            }
        }

        async function runGitSync(command, busyLabel, doneLabel) {
            setGitMessage(busyLabel);
            gitPullBtn.disabled = true;
            gitPushBtn.disabled = true;
            try {
                const output = await invoke(command, { cwd: gitCwd() });
                await refreshGitStatus();
                const summary = output
                    .trim()
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .pop();
                setGitMessage(summary || doneLabel);
            } catch (error) {
                setGitMessage(gitErrorText(error), true);
            } finally {
                gitPullBtn.disabled = false;
                gitPushBtn.disabled = false;
            }
        }

        function toggleSource() {
            sourceCollapsed = !sourceCollapsed;
            editorContainer.classList.toggle('editor-collapsed', sourceCollapsed);
            resizeTerminals();
            syncPaneToggleButtons();
        }

        async function openGithub() {
            try {
                await invoke('open_external_url', { url: 'https://github.com/DoctorKhan/Lumina' });
            } catch (error) {
                setUpdateStatus(`Unable to open GitHub: ${error?.message || error}`);
            }
        }

        function handleMenuCommand(command) {
            if (command.startsWith('lumina_open_recent_file:')) {
                openRecentFile(Number(command.slice('lumina_open_recent_file:'.length)));
                return;
            }

            switch (command) {
                case 'lumina_new_file':
                    newUntitledDocument();
                    break;
                case 'lumina_open_file':
                    openFileWithDialog();
                    break;
            case 'lumina_open_last_file':
                openLastOpenedFile();
                break;
            case 'lumina_open_recent_file':
                openRecentFile();
                break;
                case 'lumina_save':
                    void saveDocument();
                    break;
                case 'lumina_save_as':
                    void saveDocumentAs();
                    break;
                case 'lumina_undo':
                    undoEditor();
                    break;
                case 'lumina_redo':
                    redoEditor();
                    break;
                case 'lumina_find':
                    openFindBar({ replace: false });
                    break;
                case 'lumina_find_replace':
                    openFindBar({ replace: true });
                    break;
                case 'lumina_copy_html':
                    copyToClipboard();
                    break;
                case 'lumina_check_updates':
                    checkForUpdate();
                    break;
                case 'lumina_install_update':
                    installDetectedUpdate();
                    break;
                case 'lumina_install_checkout':
                    installCurrentCheckout();
                    break;
                case 'lumina_toggle_source':
                    toggleSource();
                    break;
                case 'lumina_toggle_terminal':
                    toggleTerminal();
                    break;
                case 'lumina_toggle_claude':
                    toggleClaude();
                    break;
            case 'lumina_claude_context':
                sendClaudeContext();
                break;
            case 'lumina_claude_prompts':
                sendClaudePreset();
                break;
            case 'lumina_claude_pull_file':
                pullClaudeWorkspaceFile();
                break;
            case 'lumina_claude_apply_clipboard':
                replaceSelectionFromClipboard();
                break;
                case 'lumina_open_example_guide':
                    loadExampleGuide();
                    break;
                case 'lumina_open_github':
                    openGithub();
                    break;
            }
        }

        listen('lumina-menu', (event) => handleMenuCommand(event.payload)).catch((error) => {
            setUpdateStatus(`Menu unavailable: ${error?.message || error}`);
        });
        listen('lumina-pending-open-files', () => {
            flushPendingOpenPathsFromBackend();
        }).catch((error) => {
            setUpdateStatus(`Open-file events unavailable: ${error?.message || error}`);
        });
        syncAppMenu();
installUpdateBadge.addEventListener('click', installDetectedUpdate);
        installProgressDismiss?.addEventListener('click', () => {
            // Universal escape hatch: stop tracking and hide the card. Covers cases the
            // completion/failure markers don't (Ctrl-C, network hang, unrecognized output).
            endInstallProgressSession();
            setUpdateStatus('Dismissed install progress. The terminal command keeps running.');
        });
        toggleSourceBtn.addEventListener('click', toggleSource);
        toggleTerminalBtn.addEventListener('click', () => toggleTerminal());
        toggleClaudeBtn.addEventListener('click', () => toggleClaude());
        toggleGitBtn.addEventListener('click', () => { void toggleGit(); });
        closeGitBtn.addEventListener('click', () => { void toggleGit(false); });
        toggleFilesBtn.addEventListener('click', () => { void toggleFiles(); });
        closeFilesBtn.addEventListener('click', () => { void toggleFiles(false); });
        filesChooseBtn.addEventListener('click', () => { void chooseFilesRoot(); });
        filesUpBtn.addEventListener('click', () => { void goUpFilesRoot(); });
        filesRefreshBtn.addEventListener('click', () => { void refreshFilesTree(); });
        gitRefreshBtn.addEventListener('click', () => { void refreshGitStatus(); });
        gitPullBtn.addEventListener('click', () => { void runGitSync('git_pull', 'Pulling…', 'Pulled.'); });
        gitPushBtn.addEventListener('click', () => { void runGitSync('git_push', 'Pushing…', 'Pushed.'); });
        gitCommitBtn.addEventListener('click', () => { void commitStaged(); });
        gitGenerateBtn.addEventListener('click', () => { void generateCommitMessage(); });
        gitCommitMessage.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void commitStaged();
            }
        });
wireClaudeInputBar();
claudeSendContextBtn.addEventListener('click', () => sendClaudeContext());
claudePresetsBtn.addEventListener('click', sendClaudePreset);
claudeApplyMenuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isHidden = claudeApplyMenu.classList.toggle('hidden');
    claudeApplyMenuBtn.setAttribute('aria-expanded', String(!isHidden));
});
claudePullFileBtn.addEventListener('click', pullClaudeWorkspaceFile);
claudeReplaceSelectionBtn.addEventListener('click', replaceSelectionFromClipboard);
claudeDevelopLuminaBtn.addEventListener('click', () => { void toggleDevelopLuminaMode(); });
claudeRebuildLuminaBtn.addEventListener('click', () => { void rebuildLumina(); });
claudeStopBtn?.addEventListener('click', () => { void stopClaudeChat(); });
// Switching permission mode restarts on the next message; tell the user.
claudeModeSelect?.addEventListener('change', () => {
    if (claudeStarted) {
        void stopClaudeChat().then(() => {
            setUpdateStatus(`Claude permission mode set to ${claudeModeSelect.value}. It applies on your next message.`);
        });
    }
});
fixLatexBtn.addEventListener('click', () => {
    const fixed = normalizeEscapedLatexDelimiters(normalizeMathBlocks(editor.value));
    if (fixed === editor.value) {
        setUpdateStatus('No LaTeX formatting changes needed.');
        return;
    }
    const selStart = editor.selectionStart;
    const selEnd = editor.selectionEnd;
    pushEditorHistory();
    editor.value = fixed;
    editor.selectionStart = selStart;
    editor.selectionEnd = selEnd;
    schedulePreviewUpdate();
    setUpdateStatus('LaTeX delimiters normalized.');
});
        closeTerminalBtn.addEventListener('click', () => toggleTerminal(false));
        closeClaudeBtn.addEventListener('click', () => toggleClaude(false));
document.addEventListener('click', (event) => {
    if (claudeApplyMenu.classList.contains('hidden')) return;
    if (claudeApplyMenu.contains(event.target) || claudeApplyMenuBtn.contains(event.target)) return;
    claudeApplyMenu.classList.add('hidden');
    claudeApplyMenuBtn.setAttribute('aria-expanded', 'false');
});
        syncPaneToggleButtons();

        paneResizer.addEventListener('mousedown', () => {
            if (sourceCollapsed) return;
            isResizing = true;
            paneResizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mouseup', () => {
            let wasResizing = false;
            if (isResizing) {
                isResizing = false;
                paneResizer.classList.remove('dragging');
                wasResizing = true;
            }
            if (isResizingSidePane) {
                isResizingSidePane = false;
                sidePaneResizer?.classList.remove('dragging');
                wasResizing = true;
            }
            document.body.style.userSelect = '';
            // Throttling skips most live fits, so settle the terminals once on release.
            if (wasResizing) resizeTerminals();
        });

        document.addEventListener('mousemove', (event) => {
            if (!isResizing || sourceCollapsed) return;
            const rect = (workspacePanes || editorContainer).getBoundingClientRect();
            const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
            const editorPercent = Math.min(80, Math.max(20, rawPercent));
            const previewPercent = 100 - editorPercent;
            editorPane.style.flex = `1 1 ${editorPercent}%`;
            previewPane.style.flex = `1 1 ${previewPercent}%`;
            resizeTerminalsLive();
        });

        sidePaneResizer?.addEventListener('mousedown', () => {
            if (visibleSidePaneCount() === 0) return;
            isResizingSidePane = true;
            sidePaneResizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (event) => {
            if (!sidePane || !isResizingSidePane || visibleSidePaneCount() === 0) return;
            const rect = editorContainer.getBoundingClientRect();
            const rawPercent = ((rect.right - event.clientX) / rect.width) * 100;
            sidePanePercent = Math.min(65, Math.max(24, rawPercent));
            sidePane.style.flexBasis = `${sidePanePercent}%`;
            resizeTerminalsLive();
        });

        // Vertical drag between stacked side panes: shift weight from one neighbor to
        // the other while keeping their combined weight (and the panes below) fixed.
        const sidePaneElements = { terminal: terminalPane, claude: claudePane, files: filesPane, git: gitPane };
        const MIN_PANE_PX = 60;
        let splitDrag = null;

        for (const resizer of sideSplitResizers) {
            resizer?.addEventListener('mousedown', (event) => {
                const aboveKey = resizer.dataset.above;
                const belowKey = resizer.dataset.below;
                if (!aboveKey || !belowKey) return;
                const above = sidePaneElements[aboveKey];
                const below = sidePaneElements[belowKey];
                splitDrag = {
                    resizer,
                    aboveKey,
                    belowKey,
                    startY: event.clientY,
                    aboveStartPx: above.getBoundingClientRect().height,
                    belowStartPx: below.getBoundingClientRect().height,
                    combinedWeight: paneWeights[aboveKey] + paneWeights[belowKey],
                };
                resizer.classList.add('dragging');
                document.body.style.userSelect = 'none';
                event.preventDefault();
            });
        }

        document.addEventListener('mousemove', (event) => {
            if (!splitDrag) return;
            const { aboveStartPx, belowStartPx, combinedWeight, aboveKey, belowKey } = splitDrag;
            const total = aboveStartPx + belowStartPx;
            if (total <= 0 || combinedWeight <= 0) return;
            const delta = event.clientY - splitDrag.startY;
            const abovePx = Math.min(total - MIN_PANE_PX, Math.max(MIN_PANE_PX, aboveStartPx + delta));
            const aboveWeight = combinedWeight * (abovePx / total);
            paneWeights[aboveKey] = aboveWeight;
            paneWeights[belowKey] = combinedWeight - aboveWeight;
            sidePaneElements[aboveKey].style.flex = `${paneWeights[aboveKey]} 1 0`;
            sidePaneElements[belowKey].style.flex = `${paneWeights[belowKey]} 1 0`;
            resizeTerminalsLive();
        });

        document.addEventListener('mouseup', () => {
            if (splitDrag) {
                splitDrag.resizer.classList.remove('dragging');
                splitDrag = null;
                document.body.style.userSelect = '';
                resizeTerminals();
            }
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                currentFilePath = null;
                editor.value = event.target.result;
                setFilenameLabel(`Editing: ${file.name}`);
                resetEditorHistory();
                notifyActiveFileChanged();
                void updatePreview();
            };
            reader.readAsText(file);
        });

        editor.addEventListener('input', () => {
            updateEditorMetrics();
            scheduleEditorHistory();
            clearTimeout(previewInputDebounceTimer);
            previewInputDebounceTimer = setTimeout(() => {
                previewInputDebounceTimer = null;
                void updatePreview();
            }, previewInputDebounceMs);
        });

        function lineBoundsAt(value, position) {
            const start = value.lastIndexOf('\n', position - 1) + 1;
            const nextBreak = value.indexOf('\n', position);
            const end = nextBreak === -1 ? value.length : nextBreak;
            return { start, end };
        }

        function listMarkerForLine(line) {
            const match = line.match(/^(\s*)((?:[-*+])|(?:\d+|[A-Za-z]+)[.)])(\s+)(.*)$/);
            if (!match) return null;
            return {
                indent: match[1],
                marker: match[2],
                spacing: match[3],
                content: match[4]
            };
        }

        function romanToNumber(value) {
            const numerals = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
            const input = value.toLowerCase();
            let total = 0;
            for (let index = 0; index < input.length; index += 1) {
                const current = numerals[input[index]] || 0;
                const next = numerals[input[index + 1]] || 0;
                total += current < next ? -current : current;
            }
            return total || 1;
        }

        function numberToRoman(value) {
            const numerals = [
                [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
                [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
                [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
            ];
            let remainder = Math.max(1, value);
            let output = '';
            for (const [amount, numeral] of numerals) {
                while (remainder >= amount) {
                    output += numeral;
                    remainder -= amount;
                }
            }
            return output;
        }

        function nextListMarker(marker) {
            if (/^[-*+]$/.test(marker)) return marker;

            const delimiter = marker.endsWith(')') ? ')' : '.';
            const body = marker.slice(0, -1);

            if (/^\d+$/.test(body)) {
                return `${Number(body) + 1}${delimiter}`;
            }

            if (/^[ivxlcdm]+$/i.test(body)) {
                const nextRoman = numberToRoman(romanToNumber(body) + 1);
                return `${body === body.toLowerCase() ? nextRoman.toLowerCase() : nextRoman}${delimiter}`;
            }

            if (/^[a-z]$/i.test(body)) {
                const base = body === body.toLowerCase() ? 97 : 65;
                const nextCode = ((body.charCodeAt(0) - base + 1) % 26) + base;
                return `${String.fromCharCode(nextCode)}${delimiter}`;
            }

            return marker;
        }

        function replaceEditorRange(start, end, text, selectionStart, selectionEnd = selectionStart) {
            const value = editor.value;
            pushEditorHistory();
            editor.value = value.slice(0, start) + text + value.slice(end);
            editor.setSelectionRange(selectionStart, selectionEnd);
            pushEditorHistory();
            schedulePreviewUpdate();
        }

        let findBarVisible = false;
        let findBarShowsReplace = false;
        let findMatchIndex = -1;
        let suppressFindInputHandler = false;

        function findNeedle() {
            return findInput.value;
        }

        function collectFindMatches(needle = findNeedle(), haystack = editor.value) {
            if (!needle) return [];

            const lowerHaystack = haystack.toLowerCase();
            const lowerNeedle = needle.toLowerCase();
            const matches = [];
            let index = 0;

            while (index <= lowerHaystack.length - lowerNeedle.length) {
                const found = lowerHaystack.indexOf(lowerNeedle, index);
                if (found === -1) break;
                matches.push({ start: found, end: found + needle.length });
                index = found + Math.max(1, needle.length);
            }

            return matches;
        }

        function activeFindMatchIndex(matches) {
            if (!matches.length) return -1;

            const selectionStart = editor.selectionStart;
            const selectionEnd = editor.selectionEnd;
            const exact = matches.findIndex(
                (match) => match.start === selectionStart && match.end === selectionEnd
            );
            if (exact !== -1) return exact;

            if (findMatchIndex >= 0 && findMatchIndex < matches.length) {
                const tracked = matches[findMatchIndex];
                if (
                    tracked.start === selectionStart &&
                    (selectionEnd === tracked.end || selectionStart === selectionEnd)
                ) {
                    return findMatchIndex;
                }
            }

            const atOrAfter = matches.findIndex((match) => match.start >= selectionStart);
            return atOrAfter === -1 ? matches.length - 1 : atOrAfter;
        }

        function updateFindMatchStatus() {
            const needle = findNeedle();
            if (!needle) {
                findMatchStatus.textContent = '';
                findMatchStatus.classList.remove('is-error');
                return;
            }

            const matches = collectFindMatches(needle);
            if (!matches.length) {
                findMatchStatus.textContent = 'No results';
                findMatchStatus.classList.add('is-error');
                return;
            }

            const index = activeFindMatchIndex(matches);
            findMatchIndex = index;
            findMatchStatus.textContent = `${index + 1} of ${matches.length}`;
            findMatchStatus.classList.remove('is-error');
        }

        function shouldFocusEditorForFind() {
            if (!findBarVisible) return true;
            return !isFindReplaceTarget(document.activeElement);
        }

        function scrollEditorMatchIntoView(start) {
            const style = getComputedStyle(editor);
            const lineHeight = parseFloat(style.lineHeight);
            if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

            const line = editor.value.slice(0, start).split('\n').length - 1;
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const targetTop = line * lineHeight + paddingTop - editor.clientHeight * 0.25;
            const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
            editor.scrollTop = Math.min(maxScroll, Math.max(0, targetTop));
        }

        function selectFindMatch(match, { focusEditor } = {}) {
            if (!match) return false;

            const focus = focusEditor ?? shouldFocusEditorForFind();
            editor.setSelectionRange(match.start, match.end);
            if (focus) {
                editor.focus();
            } else {
                scrollEditorMatchIntoView(match.start);
            }

            findMatchIndex = collectFindMatches().findIndex(
                (candidate) => candidate.start === match.start && candidate.end === match.end
            );
            updateFindMatchStatus();
            return true;
        }

        function findNextMatch({ wrap = true, focusEditor } = {}) {
            const needle = findNeedle();
            if (!needle) {
                updateFindMatchStatus();
                return false;
            }

            const matches = collectFindMatches(needle);
            if (!matches.length) {
                findMatchIndex = -1;
                updateFindMatchStatus();
                return false;
            }

            const currentIndex = activeFindMatchIndex(matches);
            const nextIndex = currentIndex + 1;
            const targetIndex = nextIndex < matches.length ? nextIndex : wrap ? 0 : currentIndex;
            return selectFindMatch(matches[targetIndex], { focusEditor });
        }

        function findPreviousMatch({ wrap = true, focusEditor } = {}) {
            const needle = findNeedle();
            if (!needle) {
                updateFindMatchStatus();
                return false;
            }

            const matches = collectFindMatches(needle);
            if (!matches.length) {
                findMatchIndex = -1;
                updateFindMatchStatus();
                return false;
            }

            const currentIndex = activeFindMatchIndex(matches);
            const previousIndex = currentIndex - 1;
            const targetIndex =
                previousIndex >= 0 ? previousIndex : wrap ? matches.length - 1 : currentIndex;
            return selectFindMatch(matches[targetIndex], { focusEditor });
        }

        function openFindBar({ replace = false, seedFromSelection = true } = {}) {
            findBarVisible = true;
            findBarShowsReplace = replace;
            findReplaceBar.classList.remove('hidden');
            findReplaceReplaceRow.classList.toggle('hidden', !replace);

            if (seedFromSelection && editor.selectionStart !== editor.selectionEnd) {
                suppressFindInputHandler = true;
                findInput.value = editor.value.slice(editor.selectionStart, editor.selectionEnd);
                suppressFindInputHandler = false;
            }

            const focusTarget = replace && findBarShowsReplace ? replaceInput : findInput;
            requestAnimationFrame(() => {
                focusTarget.focus();
                focusTarget.select();
                if (findInput.value) {
                    findNextMatch({ wrap: false, focusEditor: false });
                } else {
                    updateFindMatchStatus();
                }
            });
        }

        function closeFindBar() {
            if (!findBarVisible) return;
            findBarVisible = false;
            findBarShowsReplace = false;
            findMatchIndex = -1;
            findReplaceBar.classList.add('hidden');
            findReplaceReplaceRow.classList.add('hidden');
            findMatchStatus.textContent = '';
            findMatchStatus.classList.remove('is-error');
            editor.focus();
        }

        function selectionMatchesFind() {
            const needle = findNeedle();
            if (!needle || editor.selectionStart === editor.selectionEnd) return false;
            return (
                editor.value
                    .slice(editor.selectionStart, editor.selectionEnd)
                    .toLowerCase() === needle.toLowerCase()
            );
        }

        function replaceCurrentMatch() {
            const needle = findNeedle();
            const replacement = replaceInput.value;
            if (!needle) return false;

            const keepFindFocus = shouldFocusEditorForFind() === false;
            if (!selectionMatchesFind() && !findNextMatch({ wrap: false, focusEditor: !keepFindFocus })) {
                return false;
            }

            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            replaceEditorRange(start, end, replacement, start + replacement.length);
            findMatchIndex = -1;
            findNextMatch({ focusEditor: !keepFindFocus });
            if (keepFindFocus) {
                (document.activeElement === replaceInput ? replaceInput : findInput).focus();
            }
            return true;
        }

        function replaceAllMatches() {
            const needle = findNeedle();
            const replacement = replaceInput.value;
            if (!needle) return 0;

            const value = editor.value;
            const lowerValue = value.toLowerCase();
            const lowerNeedle = needle.toLowerCase();
            let rebuilt = '';
            let lastIndex = 0;
            let count = 0;
            let index = 0;

            while (index <= lowerValue.length - lowerNeedle.length) {
                const found = lowerValue.indexOf(lowerNeedle, index);
                if (found === -1) break;
                rebuilt += value.slice(lastIndex, found) + replacement;
                lastIndex = found + needle.length;
                index = lastIndex;
                count += 1;
            }

            if (!count) {
                updateFindMatchStatus();
                return 0;
            }

            rebuilt += value.slice(lastIndex);
            pushEditorHistory();
            editor.value = rebuilt;
            editor.setSelectionRange(0, 0);
            pushEditorHistory();
            schedulePreviewUpdate();
            findMatchIndex = -1;
            updateFindMatchStatus();
            return count;
        }

        function isFindReplaceTarget(target) {
            return (
                target === findInput ||
                target === replaceInput ||
                target === findNextBtn ||
                target === findPrevBtn ||
                target === replaceBtn ||
                target === replaceAllBtn ||
                target === findReplaceCloseBtn
            );
        }

        findInput.addEventListener('input', () => {
            if (suppressFindInputHandler) return;
            findMatchIndex = -1;
            if (findInput.value) {
                findNextMatch({ wrap: false, focusEditor: false });
            } else {
                updateFindMatchStatus();
            }
        });
        replaceInput.addEventListener('input', updateFindMatchStatus);
        findNextBtn.addEventListener('click', () => findNextMatch());
        findPrevBtn.addEventListener('click', () => findPreviousMatch());
        replaceBtn.addEventListener('click', () => replaceCurrentMatch());
        replaceAllBtn.addEventListener('click', () => {
            const count = replaceAllMatches();
            setUpdateStatus(count ? `Replaced ${count} matches.` : 'No matches to replace.');
        });
        findReplaceCloseBtn.addEventListener('click', closeFindBar);

        findReplaceBar.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeFindBar();
                return;
            }

            if (event.key !== 'Enter') return;

            event.preventDefault();
            if (event.target === replaceInput || (findBarShowsReplace && event.shiftKey)) {
                replaceCurrentMatch();
                return;
            }

            if (event.shiftKey) {
                findPreviousMatch();
            } else {
                findNextMatch();
            }
        });

        function handleListEnter(event) {
            if (editor.selectionStart !== editor.selectionEnd) return false;

            const position = editor.selectionStart;
            const { start, end } = lineBoundsAt(editor.value, position);
            const line = editor.value.slice(start, end);
            const marker = listMarkerForLine(line);
            if (!marker) return false;

            event.preventDefault();

            if (marker.content.trim() === '') {
                replaceEditorRange(start, end, marker.indent, start + marker.indent.length);
                return true;
            }

            const nextMarker = nextListMarker(marker.marker);
            const insertion = `\n${marker.indent}${nextMarker}${marker.spacing}`;
            replaceEditorRange(position, position, insertion, position + insertion.length);
            return true;
        }

        function handleListIndent(event) {
            if (event.key !== 'Tab') return false;

            event.preventDefault();

            const indent = '   ';
            const value = editor.value;
            const selectionStart = editor.selectionStart;
            const selectionEnd = editor.selectionEnd;
            const firstLineStart = lineBoundsAt(value, selectionStart).start;
            const lastLineEnd = lineBoundsAt(value, Math.max(selectionStart, selectionEnd - 1)).end;
            const block = value.slice(firstLineStart, lastLineEnd);
            const lines = block.split('\n');
            let startDelta = 0;
            let endDelta = 0;

            const updatedLines = lines.map((line, index) => {
                if (event.shiftKey) {
                    const removed = line.startsWith(indent)
                        ? indent.length
                        : line.startsWith('  ')
                            ? 2
                            : line.startsWith(' ')
                                ? 1
                                : 0;
                    if (index === 0) startDelta -= Math.min(removed, selectionStart - firstLineStart);
                    endDelta -= removed;
                    return line.slice(removed);
                }

                if (!line) return line;
                if (index === 0 && selectionStart > firstLineStart) startDelta += indent.length;
                endDelta += indent.length;
                return indent + line;
            });

            const updatedBlock = updatedLines.join('\n');
            const nextSelectionStart = Math.max(firstLineStart, selectionStart + startDelta);
            const nextSelectionEnd = Math.max(nextSelectionStart, selectionEnd + endDelta);
            replaceEditorRange(firstLineStart, lastLineEnd, updatedBlock, nextSelectionStart, nextSelectionEnd);
            return true;
        }

        editor.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && handleListEnter(event)) return;
            handleListIndent(event);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && findBarVisible) {
                event.preventDefault();
                closeFindBar();
                return;
            }

            const mod = event.metaKey || event.ctrlKey;
            const editorFocused =
                document.activeElement === editor || isFindReplaceTarget(document.activeElement);

            if (mod && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                openFindBar({
                    replace: event.altKey,
                    seedFromSelection: document.activeElement === editor
                });
                return;
            }

            if (mod && event.key.toLowerCase() === 'h' && editorFocused) {
                event.preventDefault();
                openFindBar({ replace: true, seedFromSelection: document.activeElement === editor });
                return;
            }

            if (mod && event.key.toLowerCase() === 'g' && editorFocused && findBarVisible) {
                event.preventDefault();
                if (event.shiftKey) {
                    findPreviousMatch();
                } else {
                    findNextMatch();
                }
                return;
            }

            if (!mod) return;

            if (event.key.toLowerCase() === 'z' && document.activeElement === editor) {
                event.preventDefault();
                if (event.shiftKey) {
                    redoEditor();
                } else {
                    undoEditor();
                }
            } else if (event.key.toLowerCase() === 'n' && !event.shiftKey) {
                event.preventDefault();
                newUntitledDocument();
            } else if (event.key.toLowerCase() === 'o') {
                event.preventDefault();
                openFileWithDialog();
            } else if (event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (event.shiftKey) {
                    void saveDocumentAs();
                } else {
                    void saveDocument();
                }
            } else if (event.shiftKey && event.key.toLowerCase() === 'c') {
                event.preventDefault();
                copyToClipboard();
            } else if (event.key === '`') {
                event.preventDefault();
                toggleTerminal();
            }
        });

        window.addEventListener('resize', resizeTerminals);
        window.addEventListener('beforeunload', () => {
            fileChangedUnlisten?.();
            terminalOutputUnlisten?.();
            if (terminalStarted) {
                invoke('terminal_kill').catch(() => {});
            }
            claudeChatUnlisten?.();
            if (claudeStarted) {
                invoke('claude_chat_stop').catch(() => {});
            }
        });

        let editorScrollSyncFrame = null;
        editor.addEventListener(
            'scroll',
            () => {
                if (editorScrollSyncFrame != null) return;
                editorScrollSyncFrame = requestAnimationFrame(() => {
                    editorScrollSyncFrame = null;
                    syncPreviewScrollToEditor();
                });
            },
            { passive: true }
        );

        async function refreshAppVersionBadge() {
            try {
                const raw = await getVersion();
                if (!raw || !String(raw).trim()) {
                    return;
                }
                currentVersion = String(raw).trim().replace(/^v/i, '');
                appVersionBadge.textContent = `v${currentVersion}`;
            } catch (_) {
                /* Vite dev / non-Tauri: keep index.html placeholder for currentVersion */
            }
        }

        async function loadInitialContent() {
            const params = new URLSearchParams(window.location.search);
            const fileParam = params.get('file');
            const fileDisplayName = params.get('name');

            if (!fileParam) {
                if (await flushPendingOpenPathsFromBackend()) {
                    return;
                }
                if (await openLastOpenedFile()) {
                    return;
                }

                void updatePreview();
                return;
            }

            try {
                const response = await fetch(fileParam, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to load ${fileParam}`);
                }

                const text = await response.text();
                const displayName = fileDisplayName || fileParam;
                setEditorContent(text, `Editing: ${displayName}`, displayName);
                currentFilePath = null;
            } catch (_) {
                void updatePreview();
            }
        }

        async function bootstrap() {
            await refreshAppVersionBadge();
            await loadInitialContent();
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(
                    () => {
                        checkForUpdate({ background: true });
                    },
                    { timeout: 10000 }
                );
            } else {
                queueMicrotask(() => {
                    checkForUpdate({ background: true });
                });
            }
        }

        void bootstrap();
