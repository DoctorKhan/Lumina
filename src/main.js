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
        import { Terminal } from '@xterm/xterm';
        import { FitAddon } from '@xterm/addon-fit';
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
const filenameDisplayText = document.getElementById('filename-display-text');
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
        const claudeElement = document.getElementById('claude-terminal');
        const claudeStatus = document.getElementById('claude-status');
const claudeWorkspaceStatus = document.getElementById('claude-workspace-status');
        const installProgressRoot = document.getElementById('install-progress');
        const installProgressFill = document.getElementById('install-progress-fill');
        const installProgressDetail = document.getElementById('install-progress-detail');
        const installProgressPercent = document.getElementById('install-progress-percent');
        const installProgressDismiss = document.getElementById('install-progress-dismiss');
        const editorContainer = document.querySelector('.editor-container');
        const workspacePanes = document.getElementById('workspace-panes');
        const sidePane = document.getElementById('side-pane');
        const sidePaneResizer = document.getElementById('side-pane-resizer');
        const toggleGitBtn = document.getElementById('toggle-git-btn');
        const gitPane = document.getElementById('git-pane');
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
        let claudeTerminal = null;
        let claudeFitAddon = null;
        let claudeVisible = false;
        let claudeStarted = false;
        let gitVisible = false;
        let claudeOutputUnlisten = null;
        let claudeResizeFrame = null;
        let claudeScrollBottomRaf = null;
        let claudeLastFitCols = 0;
        let claudeLastFitRows = 0;
let claudeWorkspaceFilePath = null;
        let luminaSourceDir = null;
        let developLuminaMode = false;
        let latestReleaseTag = null;
        let updateCheckInProgress = false;
        let currentCheckoutInstallCommand = null;
        let currentFilePath = null;
        let currentFileMtime = 0;
        let fileWatcherTimer = null;
        const fileWatcherIntervalMs = 2000;
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

        function refreshFilenameMarquee() {
            const track = filenameDisplay.querySelector('.filename-marquee-track');
            if (!track || !filenameDisplayText) return;

            filenameDisplayText.classList.remove('is-overflowing');
            filenameDisplayText.style.removeProperty('--filename-marquee-shift');

            const overflow = filenameDisplayText.scrollWidth - track.clientWidth;
            if (overflow > 4) {
                filenameDisplayText.classList.add('is-overflowing');
                filenameDisplayText.style.setProperty('--filename-marquee-shift', `-${overflow}px`);
            }
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
                    filenameDisplayText.textContent = formatPathForDisplay(path);
                    filenameDisplay.dataset.fullPath = path;
                    filenameDisplay.title = `${path}\n\nClick to open another file · ⎘ copies path`;
                    filenameCopyBtn.classList.remove('hidden');
                } else {
                    filenameDisplayText.textContent = label;
                    delete filenameDisplay.dataset.fullPath;
                    filenameDisplay.title = label || '';
                    filenameCopyBtn.classList.add('hidden');
                }
                requestAnimationFrame(refreshFilenameMarquee);
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

        window.addEventListener('resize', () => {
            requestAnimationFrame(refreshFilenameMarquee);
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
        }

        function forgetOpenedPath(path) {
            if (localStorage.getItem(lastOpenedFilePathKey) === path) {
                localStorage.removeItem(lastOpenedFilePathKey);
            }
    writeRecentFilePaths(readRecentFilePaths().filter((recentPath) => recentPath !== path));
            if (currentFilePath === path) {
                currentFilePath = null;
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

Source: ${sourceLabel}
Claude file: ${claudeWorkspaceFilePath || sourceLabel}
Cursor line: ${context.lineNumber}
Nearest heading: ${context.heading}

Use the Claude file for full-document edits. If you propose replacement text, keep it concise and valid Markdown.${selectionBlock}`;
}

function stopFileWatcher() {
    if (fileWatcherTimer !== null) {
        clearInterval(fileWatcherTimer);
        fileWatcherTimer = null;
    }
}

function startFileWatcher(path, mtime) {
    stopFileWatcher();
    fileWatcherTimer = setInterval(async () => {
        if (!currentFilePath) {
            stopFileWatcher();
            return;
        }
        try {
            const changed = await invoke('poll_file_for_changes', {
                path: currentFilePath,
                knownModifiedMs: currentFileMtime
            });
            if (changed) {
                currentFileMtime = changed.modifiedMs;
                editor.value = changed.content;
                updateEditorMetrics();
                void updatePreview();
            }
        } catch (_) {
            // Ignore transient errors (e.g. mid-write by external editor or Claude).
            // The watcher keeps running; it only stops when the file is closed.
        }
    }, fileWatcherIntervalMs);
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
        forgetOpenedPath(path);
        setFilenameLabel('Editor (Markdown + LaTeX)');
        setUpdateStatus(`Unable to open ${basename(path)}: ${error?.message || error}`);
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

        async function executePreviewRender() {
            const rawValue = editor.value;
            updateEditorMetrics();
            const normalizedValue = normalizeEscapedLatexDelimiters(
                normalizeMathBlocks(rawValue)
            );
            const protectedValue = extractMathForMarkdown(normalizedValue);
            preview.innerHTML = restoreMathFromMarkdownHtml(
                marked.parse(protectedValue.markdown),
                protectedValue.math
            );
            applySmartOutlineStyles();
            await highlightCodeBlocksIn(preview);
            await renderMermaidInPreview(preview);
            await applyKatexToPreview(preview, normalizedValue);
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
                currentFilePath = file.path;
                currentFileMtime = file.modifiedMs ?? currentFileMtime;
                setFilenameLabel(`Editing: ${file.path}`, file.path);
                setUpdateStatus('Saved.');
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

        function scheduleClaudeScrollToBottom() {
            if (!claudeTerminal) return;
            if (claudeScrollBottomRaf != null) return;
            claudeScrollBottomRaf = requestAnimationFrame(() => {
                claudeScrollBottomRaf = null;
                claudeTerminal.scrollToBottom();
                requestAnimationFrame(() => {
                    claudeTerminal.scrollToBottom();
                });
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

        function applyClaudeFit() {
            if (!claudeVisible || !claudeFitAddon || !claudeTerminal) return;
            claudeFitAddon.fit();
            scheduleClaudeScrollToBottom();
            if (!claudeTerminal.cols || !claudeTerminal.rows) return;
            if (claudeTerminal.cols === claudeLastFitCols && claudeTerminal.rows === claudeLastFitRows) return;
            claudeLastFitCols = claudeTerminal.cols;
            claudeLastFitRows = claudeTerminal.rows;
            invoke('claude_resize', {
                cols: claudeTerminal.cols,
                rows: claudeTerminal.rows
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

        function resizeClaude({ settle = true } = {}) {
            if (!claudeVisible || !claudeTerminal || !claudeFitAddon) return;

            cancelAnimationFrame(claudeResizeFrame);
            claudeResizeFrame = requestAnimationFrame(() => {
                applyClaudeFit();
                if (settle) requestAnimationFrame(applyClaudeFit);
            });
        }

        function resizeTerminals(options) {
            resizeTerminal(options);
            resizeClaude(options);
        }

async function writeClaudePrompt(prompt) {
    await toggleClaude(true);
    if (!claudeStarted) return;

    claudeTerminal?.write(`\r\nSending prompt to Claude...\r\n`);
    scheduleClaudeScrollToBottom();
    await invoke('claude_write', { data: `\x1b[200~${prompt}\x1b[201~\r` });
    claudeTerminal?.focus();
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
                convertEol: true,
                fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
                theme: terminalTheme()
            });
            fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);
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

            claudeTerminal = new Terminal({
                cursorBlink: true,
                convertEol: true,
                fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
                theme: terminalTheme()
            });
            claudeFitAddon = new FitAddon();
            claudeTerminal.loadAddon(claudeFitAddon);
            claudeTerminal.open(claudeElement);
            claudeTerminal.onData((data) => {
                invoke('claude_write', { data }).catch((error) => {
                    claudeTerminal.write(`\r\nClaude write failed: ${error}\r\n`);
                    scheduleClaudeScrollToBottom();
                });
            });

            claudeStatus.textContent = 'Starting';
            claudeTerminal.write('Starting Claude...\r\n');
            scheduleClaudeScrollToBottom();
            claudeOutputUnlisten = await listen('claude-output', (event) => {
                const stick = isTermAtBottom(claudeTerminal);
                claudeTerminal.write(event.payload);
                if (stick) scheduleClaudeScrollToBottom();
            });

            claudeFitAddon.fit();
            scheduleClaudeScrollToBottom();
            const spawnArgs = {
                cols: claudeTerminal.cols,
                rows: claudeTerminal.rows
            };
            if (developLuminaMode && luminaSourceDir) {
                claudeTerminal.write(`Editing Lumina source. Claude is opening:\r\n${luminaSourceDir}\r\nAsk Claude to make changes, then use the Rebuild & Install button when ready.\r\n`);
                setUpdateStatus(`Claude is editing Lumina source at ${luminaSourceDir}.`);
                spawnArgs.cwd = luminaSourceDir;
            } else if (currentFilePath) {
                const directory = currentFileDirectory();
                const accessMessage = `Claude will open this file's folder so it can read and edit the current document:\r\n${directory}\r\nIf macOS asks for folder access, it is for this Claude editing session.\r\n`;
                claudeTerminal.write(accessMessage);
                setUpdateStatus(`Claude may ask macOS for access to ${directory}.`);
                claudeTerminal.write(`Saving and opening Claude in the file directory:\r\n${currentFilePath}\r\n`);
                const savedFile = await invoke('write_document', {
                    path: currentFilePath,
                    content: editor.value
                });
                currentFileMtime = savedFile.modifiedMs ?? currentFileMtime;
                spawnArgs.filePath = currentFilePath;
                spawnArgs.cwd = currentFileDirectory();
                // Ensure the watcher is live so Claude's edits flow back into the
                // editor and preview, even if this file was created via Save As.
                startFileWatcher(currentFilePath, currentFileMtime);
            } else {
                claudeTerminal.write('No saved file path is open; starting Claude in the current terminal directory.\r\n');
            }
            scheduleClaudeScrollToBottom();
            const workspaceInfo = await invoke('claude_spawn', spawnArgs);
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
            claudeStatus.textContent = 'Running';
            resizeClaude();
            setTimeout(resizeClaude, 80);
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
                    await invoke('claude_kill');
                } catch (_) {
                    // best effort
                }
                claudeOutputUnlisten?.();
                claudeOutputUnlisten = null;
                claudeStarted = false;
                if (claudeTerminal) {
                    claudeTerminal.dispose();
                    claudeTerminal = null;
                    claudeFitAddon = null;
                }
                claudeElement.innerHTML = '';
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
            toggleSourceBtn.title = sourceCollapsed ? 'Show source pane' : 'Hide source pane';
            toggleTerminalBtn.title = terminalVisible ? 'Hide terminal' : 'Show terminal';
            toggleClaudeBtn.title = claudeVisible ? 'Hide Claude' : 'Show Claude';
            toggleGitBtn.title = gitVisible ? 'Hide Git' : 'Show Git';
            syncAppMenu();
        }

        function syncSidePaneLayout() {
            const visibleCount =
                (terminalVisible ? 1 : 0) + (claudeVisible ? 1 : 0) + (gitVisible ? 1 : 0);
            const sidePaneVisible = visibleCount > 0;
            if (!sidePane) {
                resizeTerminals();
                return;
            }
            sidePane.classList.toggle('hidden', !sidePaneVisible);
            sidePaneResizer?.classList.toggle('hidden', !sidePaneVisible);
            sidePane.classList.toggle('side-pane-split', visibleCount > 1);
            sidePane.style.flexBasis = sidePaneVisible ? `${sidePanePercent}%` : '';
            resizeTerminals();
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
                try {
                    await ensureClaude();
                    resizeClaude();
                    claudeTerminal.focus();
                } catch (error) {
                    claudeStatus.textContent = 'Error';
                    claudeTerminal?.write(`\r\nClaude failed to start: ${error}\r\n`);
                    scheduleClaudeScrollToBottom();
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
            if (isResizing) {
                isResizing = false;
                paneResizer.classList.remove('dragging');
            }
            if (isResizingSidePane) {
                isResizingSidePane = false;
                sidePaneResizer?.classList.remove('dragging');
            }
            document.body.style.userSelect = '';
        });

        document.addEventListener('mousemove', (event) => {
            if (!isResizing || sourceCollapsed) return;
            const rect = (workspacePanes || editorContainer).getBoundingClientRect();
            const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
            const editorPercent = Math.min(80, Math.max(20, rawPercent));
            const previewPercent = 100 - editorPercent;
            editorPane.style.flex = `1 1 ${editorPercent}%`;
            previewPane.style.flex = `1 1 ${previewPercent}%`;
            resizeTerminals({ settle: false });
        });

        sidePaneResizer?.addEventListener('mousedown', () => {
            if (!terminalVisible && !claudeVisible) return;
            isResizingSidePane = true;
            sidePaneResizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (event) => {
            if (!sidePane || !isResizingSidePane || (!terminalVisible && !claudeVisible)) return;
            const rect = editorContainer.getBoundingClientRect();
            const rawPercent = ((rect.right - event.clientX) / rect.width) * 100;
            sidePanePercent = Math.min(65, Math.max(24, rawPercent));
            sidePane.style.flexBasis = `${sidePanePercent}%`;
            resizeTerminals({ settle: false });
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
            terminalOutputUnlisten?.();
            if (terminalStarted) {
                invoke('terminal_kill').catch(() => {});
            }
            claudeOutputUnlisten?.();
            if (claudeStarted) {
                invoke('claude_kill').catch(() => {});
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
            await loadCurrentCheckoutInstaller();
            await loadLuminaSourceDir();
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
