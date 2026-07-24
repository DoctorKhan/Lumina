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
    LITERAL_DOLLAR_TOKEN,
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
            countElementTokens,
            diffTokenRange,
            SINGLE_ELEMENT_TOKEN_TYPES,
            tokensAreDomMappable
        } from './previewIncremental.js';
        import {
            renderFrontmatterHtml,
            splitYamlFrontmatter
        } from './previewFrontmatter.js';
        import {
            appendUserTurn,
            chatStatusLabel,
            createChatState,
            describeTool,
            parseChatLine,
            reduceChatEvent
        } from './claudeChatParse.js';
        import {
            appendUserTurn as appendAgentUserTurn,
            appendQueuedUserTurn as appendAgentQueuedUserTurn,
            activateQueuedUserTurn,
            createChatState as createAgentChatState,
            describeAgentTool,
            parseChatLine as parseAgentChatLine,
            reduceAgentChatEvent
        } from './agentChatParse.js';
        import {
            autosaveDebounceMs,
            isDocumentDirty as documentIsDirty,
            recoveryDebounceMs,
            recoveryPathForDocument,
            shouldBlockExternalReload,
            shouldOfferRecovery,
            UNTITLED_RECOVERY_PATH
        } from './documentRecovery.js';
        import { Terminal } from '@xterm/xterm';
        import { FitAddon } from '@xterm/addon-fit';
        import { Unicode11Addon } from '@xterm/addon-unicode11';
        import '@xterm/xterm/css/xterm.css';

        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const charCount = document.getElementById('char-count');
const fixLatexBtn = document.getElementById('fix-latex-btn');
const reloadFileBtn = document.getElementById('reload-file-btn');
const documentAlertBanner = document.getElementById('document-alert-banner');
const documentAlertMessage = document.getElementById('document-alert-message');
const documentAlertPrimaryBtn = document.getElementById('document-alert-primary-btn');
const documentAlertSecondaryBtn = document.getElementById('document-alert-secondary-btn');
const documentAlertDismissBtn = document.getElementById('document-alert-dismiss-btn');
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
const findInputWrap = findInput.closest('.find-input-wrap');
const findOptCaseBtn = document.getElementById('find-opt-case');
const findOptWordBtn = document.getElementById('find-opt-word');
const findOptRegexBtn = document.getElementById('find-opt-regex');
const editorHighlightLayer = document.getElementById('editor-highlight-layer');
const editorInputWrap = editorHighlightLayer?.parentElement;
const editorScrollMeasure = document.createElement('div');
editorScrollMeasure.className = 'editor-scroll-measure p-6 leading-relaxed';
editorScrollMeasure.setAttribute('aria-hidden', 'true');
editorInputWrap?.appendChild(editorScrollMeasure);
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
        const toggleAiWrap = document.getElementById('ai-toggle-wrap');
        const toggleAiBtn = document.getElementById('toggle-ai-btn');
        const toggleAiMenuBtn = document.getElementById('toggle-ai-menu-btn');
        const toggleAiMenu = document.getElementById('toggle-ai-menu');
const claudeSendContextBtn = document.getElementById('claude-send-context-btn');
const claudePresetsBtn = document.getElementById('claude-presets-btn');
const claudeApplyMenuBtn = document.getElementById('claude-apply-menu-btn');
const claudeApplyMenu = document.getElementById('claude-apply-menu');
const claudePullFileBtn = document.getElementById('claude-pull-file-btn');
const claudeReplaceSelectionBtn = document.getElementById('claude-replace-selection-btn');
const claudeDevelopLuminaBtn = document.getElementById('claude-develop-lumina-btn');
const agentDevelopLuminaBtn = document.getElementById('agent-develop-lumina-btn');
const agentRebuildLuminaBtn = document.getElementById('agent-rebuild-lumina-btn');
const agentAutoRebuildWrap = document.getElementById('agent-auto-rebuild-wrap');
const agentAutoRebuildCheckbox = document.getElementById('agent-auto-rebuild-checkbox');
const claudeRebuildLuminaBtn = document.getElementById('claude-rebuild-lumina-btn');
const claudeAutoRebuildWrap = document.getElementById('claude-auto-rebuild-wrap');
const claudeAutoRebuildCheckbox = document.getElementById('claude-auto-rebuild-checkbox');
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
        const closeAgentBtn = document.getElementById('close-agent-btn');
        const agentPane = document.getElementById('agent-pane');
        const agentTranscript = document.getElementById('agent-transcript');
        const agentEmpty = document.getElementById('agent-empty');
        const agentStatus = document.getElementById('agent-status');
        const agentWorkspaceStatus = document.getElementById('agent-workspace-status');
        const agentInputBar = document.getElementById('agent-input-bar');
        const agentInput = document.getElementById('agent-input');
        const agentStopBtn = document.getElementById('agent-stop-btn');
        const agentNewBtn = document.getElementById('agent-new-btn');
        const agentModeSelect = document.getElementById('agent-mode');
        const agentForceCheckbox = document.getElementById('agent-force');
        const agentForceLabel = document.getElementById('agent-force-label');
        const agentProviderNameEl = document.getElementById('agent-provider-name');
        const agentSendContextBtn = document.getElementById('agent-send-context-btn');
        const agentPresetsBtn = document.getElementById('agent-presets-btn');
        const agentApplyMenuBtn = document.getElementById('agent-apply-menu-btn');
        const agentApplyMenu = document.getElementById('agent-apply-menu');
        const agentPullFileBtn = document.getElementById('agent-pull-file-btn');
        const agentReplaceSelectionBtn = document.getElementById('agent-replace-selection-btn');
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
            document.getElementById('side-split-resizer-4'),
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
        const paneWeights = { terminal: 1, claude: 1, agent: 1, files: 1, git: 1 };
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
        let agentVisible = false;
        const activeAiProviderKey = 'lumina:active-ai-provider';
        const storedAiProvider = localStorage.getItem(activeAiProviderKey);
        // Hermes is the default assistant; a stored last-used choice still wins.
        let activeAiProvider =
            storedAiProvider === 'agent' || storedAiProvider === 'claude' ? storedAiProvider : 'hermes';
        // CLI backing the current/last Agent-pane run ('cursor' | 'hermes'); the
        // chat listener uses it to decide how to interpret stdout lines.
        let agentRunProvider = 'cursor';
        let agentChatUnlisten = null;
        let agentChatState = null;
        let agentRenderRaf = null;
        let agentTurnEls = [];
        let agentFooterEl = null;
        let agentMessageQueue = [];
        let agentWorkspaceFilePath = null;
        let luminaSourceDir = null;
        let developLuminaMode = false;
        const autoRebuildLuminaKey = 'lumina:auto-rebuild-lumina';
        const autoRebuildDebounceMs = 8000;
        let autoRebuildLumina = localStorage.getItem(autoRebuildLuminaKey) === 'true';
        let autoRebuildTimer = null;
        let sourceWatchUnlisten = null;
        // Resolving the source checkout probes ~/Documents, which trips the macOS
        // "access your Documents folder" prompt. Defer it until the Claude pane is
        // actually opened (where the Develop Lumina feature lives), and only once.
        let sourceCheckoutInfoLoaded = false;
        let latestReleaseTag = null;
        let updateCheckInProgress = false;
        let currentCheckoutInstallCommand = null;
        let currentFilePath = null;
        let currentFileMtime = 0;
        let autosaveTimer = null;
        let recoveryTimer = null;
        let autosaveInFlight = false;
        let pendingExternalFile = null;
        let pendingRecoverySnapshot = null;
        let documentAlertMode = null;
        let fileChangedUnlisten = null;
        let filePollIntervalId = null;
        // Fallback poll cadence for catching on-disk edits the native watcher misses.
        const filePollIntervalMs = 3000;
        const lastOpenedFilePathKey = 'lumina:last-opened-file-path';
const recentFilePathsKey = 'lumina:recent-file-paths';
const maxRecentFilePaths = 10;
        const releaseApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/releases/latest';
        const tagsApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/tags?per_page=100';
        const publicInstallerUrl = 'https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh';
let currentVersion = appVersionBadge.textContent.trim().replace(/^v/i, '');

        const initialValue = exampleMarkdown;

        editor.value = initialValue;
        let lastPersistedContent = editor.value;

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
        let previewInputIdleHandle = null;
        let lastInputRenderedSource = null;
        const previewInputDebounceMs = 500;
        const previewInputIdleTimeoutMs = 1000;

        // Cache backing incremental preview rendering: the normalized source that
        // produced the current preview DOM and its top-level lexer tokens. The
        // tokens map 1:1 (skipping `space`) to preview.children, so a later edit
        // can diff tokens and patch only the blocks that actually changed instead
        // of rebuilding the whole document. Cleared (null) whenever the preview
        // DOM is replaced out from under the cache.
        let prevPreviewNormalized = null;
        let prevPreviewTokens = null;

        function schedulePreviewUpdate() {
            preview.innerHTML = '<p class="text-slate-500">Rendering preview...</p>';
            // The placeholder replaced the rendered DOM, so the incremental cache
            // no longer describes what's on screen.
            prevPreviewTokens = null;
            prevPreviewNormalized = null;
            requestAnimationFrame(() => {
                void updatePreview();
            });
        }

        // Re-rendering the whole document while the user is mid-keystroke makes
        // typing feel laggy: the trailing debounce fires during the brief pauses
        // between words and the full innerHTML rebuild + reflow competes with the
        // textarea for the main thread. Debounce, then run the heavy render in an
        // idle gap (bounded by a timeout so the preview never stalls), and skip it
        // entirely when the source hasn't actually changed since the last render.
        function cancelScheduledInputPreviewRender() {
            clearTimeout(previewInputDebounceTimer);
            previewInputDebounceTimer = null;
            if (previewInputIdleHandle != null && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(previewInputIdleHandle);
            }
            previewInputIdleHandle = null;
        }

        function scheduleInputPreviewRender() {
            cancelScheduledInputPreviewRender();
            previewInputDebounceTimer = setTimeout(() => {
                previewInputDebounceTimer = null;
                if (editor.value === lastInputRenderedSource) return;
                const run = () => {
                    previewInputIdleHandle = null;
                    if (editor.value === lastInputRenderedSource) return;
                    // executePreviewRender updates lastInputRenderedSource once
                    // the render actually runs, so it always reflects the source
                    // the preview shows.
                    void updatePreview();
                };
                if ('requestIdleCallback' in window) {
                    previewInputIdleHandle = window.requestIdleCallback(run, {
                        timeout: previewInputIdleTimeoutMs
                    });
                } else {
                    run();
                }
            }, previewInputDebounceMs);
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
            // Assigning .value moves the caret to the end; reset it so a
            // subsequent focus() doesn't scroll the textarea to the bottom.
            editor.setSelectionRange(0, 0);
            editor.scrollTop = 0;
            setFilenameLabel(label, fullPath);
            charCount.textContent = `${content.length} chars`;
            resetEditorHistory();
            schedulePreviewUpdate();
        }

        function loadExampleGuide() {
            hideDocumentAlertBanner();
            currentFilePath = null;
            currentFileMtime = 0;
            stopFileWatcher();
            setEditorContent(exampleMarkdown, 'Example Guide (Lumina Help)');
            markDocumentPersisted(exampleMarkdown);
            delete filenameDisplay.dataset.fullPath;
            filenameDisplay.title = 'Bundled Lumina example guide';
            setUpdateStatus('Loaded the Lumina example guide.');
            notifyActiveFileChanged();
            editor.focus();
        }

        function newUntitledDocument() {
            hideDocumentAlertBanner();
            currentFilePath = null;
            currentFileMtime = 0;
            stopFileWatcher();
            editor.value = '';
            setFilenameLabel('Editor (Markdown + LaTeX)');
            resetEditorHistory();
            markDocumentPersisted('');
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
            claudeShown: claudeVisible,
            agentShown: agentVisible
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
            // Reload only makes sense for a file that exists on disk.
            reloadFileBtn.classList.toggle('hidden', !currentFilePath);
            if (typeof highlightCurrentFileRow === 'function') highlightCurrentFileRow();
            updateClaudeWorkspaceLabel();
            updateAgentWorkspaceLabel();
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

        function updateAgentWorkspaceLabel() {
            if (!agentWorkspaceStatus) return;
            agentWorkspaceFilePath = currentFilePath;
            if (developLuminaMode && luminaSourceDir) {
                agentWorkspaceStatus.textContent = `Editing Lumina source · ${basename(luminaSourceDir)}`;
                agentWorkspaceStatus.title = luminaSourceDir;
                return;
            }
            agentWorkspaceStatus.textContent = currentFilePath
                ? `Editing ${basename(currentFilePath)}`
                : 'No file attached';
            agentWorkspaceStatus.title = currentFileDirectory() || currentFilePath || '';
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

function agentBaseContext() {
    const context = currentCursorContext();
    const sourceLabel = currentFilePath || 'Unsaved Lumina document';
    const selectionBlock = context.hasSelection
        ? `\n\nCurrent selection:\n\`\`\`markdown\n${context.selection}\n\`\`\``
        : '';

    return `You are helping edit a Markdown document in Lumina.

File: ${agentWorkspaceFilePath || sourceLabel}
Cursor line: ${context.lineNumber}
Nearest heading: ${context.heading}

This file is in your workspace — read and edit it directly on disk. Keep edits valid Markdown.${selectionBlock}`;
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
        applyExternalFileUpdate(event.payload);
    });
}

// Apply an OpenedFile reported from disk (by the native watcher or the poll
// fallback) onto the editor, if it's still the file we're showing.
function applyExternalFileUpdate(file) {
    // Ignore events for a file we're no longer showing (stale backend watch).
    if (!file || !currentFilePath || file.path !== currentFilePath) return;
    // Skip echoes of our own save (content already matches the editor).
    if (file.content === editor.value) {
        currentFileMtime = file.modifiedMs ?? currentFileMtime;
        return;
    }
    if (shouldBlockExternalReload(isDocumentDirty(), file.content, editor.value)) {
        pendingExternalFile = file;
        showDocumentAlertBanner('disk-changed', file);
        return;
    }
    currentFileMtime = file.modifiedMs ?? currentFileMtime;
    editor.value = file.content;
    markDocumentPersisted(file.content);
    updateEditorMetrics();
    void updatePreview();
}

function isDocumentDirty() {
    return documentIsDirty(editor.value, lastPersistedContent);
}

function currentRecoveryPath() {
    return recoveryPathForDocument(currentFilePath);
}

function refreshDirtyIndicator() {
    const path = filenameDisplay.dataset.fullPath;
    if (!path) return;
    const name = basename(path);
    filenameName.textContent = isDocumentDirty() ? `${name} •` : name;
}

function markDocumentPersisted(content = editor.value) {
    lastPersistedContent = content;
    refreshDirtyIndicator();
    if (!isDocumentDirty()) {
        hideDocumentAlertBanner();
        void deleteRecoveryForCurrentFile();
    }
}

async function deleteRecoveryForCurrentFile() {
    try {
        await invoke('delete_recovery_snapshot', { path: currentRecoveryPath() });
    } catch (_) {}
    pendingRecoverySnapshot = null;
}

async function writeRecoverySnapshot() {
    if (!isDocumentDirty()) return;
    try {
        await invoke('write_recovery_snapshot', {
            path: currentRecoveryPath(),
            content: editor.value,
            diskMtimeMs: currentFileMtime ?? 0
        });
    } catch (_) {}
}

function scheduleRecoverySnapshot() {
    clearTimeout(recoveryTimer);
    if (!isDocumentDirty()) return;
    recoveryTimer = setTimeout(() => {
        void writeRecoverySnapshot();
    }, recoveryDebounceMs);
}

async function performAutosave({ silent = true } = {}) {
    if (!currentFilePath || !isDocumentDirty() || autosaveInFlight) return;
    autosaveInFlight = true;
    try {
        const file = await invoke('write_document', {
            path: currentFilePath,
            content: editor.value
        });
        currentFilePath = file.path;
        currentFileMtime = file.modifiedMs ?? currentFileMtime;
        markDocumentPersisted(editor.value);
        setUpdateStatus(silent ? 'Autosaved.' : 'Saved.');
        await deleteRecoveryForCurrentFile();
        if (gitVisible) void refreshGitStatus();
    } catch (error) {
        setUpdateStatus(`Autosave failed: ${error?.message || error}`);
        void writeRecoverySnapshot();
    } finally {
        autosaveInFlight = false;
    }
}

function scheduleDocumentPersistence() {
    refreshDirtyIndicator();
    scheduleRecoverySnapshot();
    if (!isDocumentDirty()) return;
    if (!currentFilePath) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        void performAutosave({ silent: true });
    }, autosaveDebounceMs);
}

async function flushDocumentPersistence() {
    clearTimeout(autosaveTimer);
    clearTimeout(recoveryTimer);
    if (currentFilePath && isDocumentDirty()) {
        await performAutosave({ silent: true });
        return;
    }
    if (isDocumentDirty()) {
        await writeRecoverySnapshot();
    }
}

function hideDocumentAlertBanner() {
    documentAlertMode = null;
    pendingExternalFile = null;
    pendingRecoverySnapshot = null;
    documentAlertBanner?.classList.add('hidden');
}

function showDocumentAlertBanner(mode, payload) {
    if (!documentAlertBanner || !documentAlertMessage) return;
    documentAlertMode = mode;
    if (mode === 'disk-changed') {
        pendingExternalFile = payload;
        const label = basename(payload?.path || currentFilePath || 'this file');
        documentAlertMessage.textContent =
            `"${label}" changed on disk while you have unsaved edits. Reloading will discard your in-editor changes.`;
        documentAlertPrimaryBtn.textContent = 'Reload from disk';
        documentAlertSecondaryBtn.textContent = 'Keep editing';
        documentAlertSecondaryBtn.classList.remove('hidden');
    } else if (mode === 'recovery') {
        pendingRecoverySnapshot = payload;
        const label = basename(payload?.path || currentFilePath || 'this document');
        documentAlertMessage.textContent =
            `Unsaved recovery data is available for "${label}". Restore it to continue where you left off.`;
        documentAlertPrimaryBtn.textContent = 'Restore recovery';
        documentAlertSecondaryBtn.textContent = 'Keep disk version';
        documentAlertSecondaryBtn.classList.remove('hidden');
    }
    documentAlertBanner.classList.remove('hidden');
}

async function applyPendingExternalFile() {
    const file = pendingExternalFile;
    if (!file) return;
    hideDocumentAlertBanner();
    currentFileMtime = file.modifiedMs ?? currentFileMtime;
    setEditorContent(file.content, `Editing: ${file.path}`, file.path);
    markDocumentPersisted(file.content);
    editor.focus();
    setUpdateStatus(`Reloaded ${basename(file.path)} from disk.`);
}

async function applyPendingRecoverySnapshot() {
    const recovery = pendingRecoverySnapshot;
    if (!recovery) return;
    hideDocumentAlertBanner();
    editor.value = recovery.content;
    resetEditorHistory();
    updateEditorMetrics();
    schedulePreviewUpdate();
    editor.focus();
    setUpdateStatus('Restored unsaved recovery data.');
}

async function dismissRecoverySnapshot() {
    await deleteRecoveryForCurrentFile();
    hideDocumentAlertBanner();
    setUpdateStatus('Kept the on-disk version.');
}

async function maybeOfferRecoveryRestore(path, diskContent) {
    try {
        const recovery = await invoke('read_recovery_snapshot', {
            path: recoveryPathForDocument(path)
        });
        if (!recovery) return;
        if (!shouldOfferRecovery({
            recoveryContent: recovery.content,
            diskContent
        })) {
            await invoke('delete_recovery_snapshot', { path: recoveryPathForDocument(path) });
            return;
        }
        showDocumentAlertBanner('recovery', recovery);
    } catch (_) {}
}

async function maybeOfferUntitledRecovery() {
    if (currentFilePath) return;
    await maybeOfferRecoveryRestore(UNTITLED_RECOVERY_PATH, editor.value);
}

// Native filesystem events can be dropped (network/synced volumes, editors that
// rename-replace in ways the watcher misses), so we also poll the open file's
// mtime as a safety net. The backend only returns content when it's actually
// newer than what we last saw, so an unchanged file costs just a stat.
function startFilePoll() {
    stopFilePoll();
    filePollIntervalId = setInterval(() => {
        if (!currentFilePath) return;
        invoke('poll_file_for_changes', { path: currentFilePath, knownModifiedMs: currentFileMtime })
            .then((file) => { if (file) applyExternalFileUpdate(file); })
            .catch(() => {});
    }, filePollIntervalMs);
}

function stopFilePoll() {
    if (filePollIntervalId !== null) {
        clearInterval(filePollIntervalId);
        filePollIntervalId = null;
    }
}

function stopFileWatcher() {
    stopFilePoll();
    invoke('unwatch_file').catch(() => {});
}

async function startFileWatcher(path) {
    await ensureFileChangeListener();
    startFilePoll();
    try {
        await invoke('watch_file', { path: path || currentFilePath });
    } catch (_) {
        // Watching is best-effort; the document is still fully usable without it.
    }
}

async function openFilePath(path) {
    hideDocumentAlertBanner();
    setFilenameLabel(`Opening: ${path}`, path);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const file = await invoke('open_file_path', { path });
    currentFileMtime = file.modifiedMs ?? 0;
    setEditorContent(file.content, `Editing: ${file.path}`, file.path);
    markDocumentPersisted(file.content);
    rememberOpenedPath(file.path);
    startFileWatcher(file.path, currentFileMtime);
    await maybeOfferRecoveryRestore(file.path, file.content);
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

        // Shared markdown pipeline: frontmatter -> math-protect -> marked ->
        // math-restore -> highlight/mermaid/katex. Used by the editor preview
        // and the Claude chat bubbles so both render code, diagrams, and LaTeX
        // identically.
        async function renderMarkdownInto(element, markdownText) {
            const { metadata, body } = splitYamlFrontmatter(markdownText || "");
            const normalizedValue = normalizeEscapedLatexDelimiters(
                normalizeMathBlocks(body)
            );
            const protectedValue = extractMathForMarkdown(normalizedValue);
            let html = restoreMathFromMarkdownHtml(
                marked.parse(protectedValue.markdown),
                protectedValue.math
            );
            if (metadata) {
                html = renderFrontmatterHtml(metadata) + html;
            }
            element.innerHTML = html;
            await highlightCodeBlocksIn(element);
            await renderMermaidInPreview(element);
            await applyKatexToPreview(element, normalizedValue);
            restoreLiteralDollars(element);
        }

        // Convert protected escaped-dollar sentinels back to literal `$`. Runs
        // after KaTeX so its auto-render pass never sees these as math
        // delimiters. Walks text nodes only, leaving rendered math/SVGs intact.
        function restoreLiteralDollars(element) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodes = [];
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.includes(LITERAL_DOLLAR_TOKEN)) {
                    nodes.push(node);
                }
            }
            for (const textNode of nodes) {
                textNode.nodeValue = textNode.nodeValue.split(LITERAL_DOLLAR_TOKEN).join('$');
            }
        }

        // SINGLE_ELEMENT_TOKEN_TYPES, tokensAreDomMappable, countElementTokens,
        // and diffTokenRange live in ./previewIncremental.js (pure + unit-tested).

        // Patch only the preview blocks that changed since the last render.
        // Returns true when it handled the render, false to fall back to a full
        // rebuild. Conservative by design: anything that could break the
        // token<->DOM correspondence (HTML blocks, reference-link definitions
        // resolved across blocks, mermaid which needs in-document layout, or an
        // active find overlay) declines the fast path.
        async function tryIncrementalPreviewRender(normalizedValue) {
            if (
                prevPreviewTokens == null ||
                prevPreviewNormalized == null ||
                findBarVisible ||
                normalizedValue.includes('```mermaid') ||
                // Link reference definitions are resolved across the whole
                // document, so re-parsing an isolated block could drop them.
                /^ {0,3}\[[^\]]+\]:/m.test(normalizedValue)
            ) {
                return false;
            }

            let newTokens;
            try {
                newTokens = marked.lexer(normalizedValue);
            } catch {
                return false;
            }

            const oldTokens = prevPreviewTokens;
            if (!tokensAreDomMappable(oldTokens) || !tokensAreDomMappable(newTokens)) {
                return false;
            }

            // Common prefix / suffix of unchanged tokens, compared by raw source.
            const { prefix, suffix } = diffTokenRange(oldTokens, newTokens);

            // Whole document changed: no savings over a full render.
            if (
                oldTokens.length - prefix - suffix === oldTokens.length &&
                newTokens.length - prefix - suffix === newTokens.length
            ) {
                return false;
            }

            const children = preview.children;
            // Verify the cache still matches the live DOM before mutating it.
            if (countElementTokens(oldTokens, 0, oldTokens.length) !== children.length) {
                return false;
            }

            const domSkip = countElementTokens(newTokens, 0, prefix);
            const oldRemove = countElementTokens(oldTokens, prefix, oldTokens.length - suffix);
            const changedTokens = newTokens.slice(prefix, newTokens.length - suffix);
            const sliceRaw = changedTokens.map((token) => token.raw).join('');

            // Render just the changed blocks through the shared pipeline in a
            // detached container, then splice the resulting nodes into place.
            const scratch = document.createElement('div');
            await renderMarkdownInto(scratch, sliceRaw);
            const newNodes = Array.from(scratch.children);

            for (let i = 0; i < oldRemove; i += 1) {
                const child = children[domSkip];
                if (!child) break;
                child.remove();
            }
            const anchor = children[domSkip] || null;
            for (const node of newNodes) {
                preview.insertBefore(node, anchor);
            }

            prevPreviewTokens = newTokens;
            prevPreviewNormalized = normalizedValue;
            return true;
        }

        async function executePreviewRender() {
            const rawValue = editor.value;
            // Records what the preview currently reflects so the input-path
            // render can skip redundant full rebuilds. Set here (the single
            // choke point for every render path) so it stays accurate after
            // opening files, undo/redo, and external file updates too.
            lastInputRenderedSource = rawValue;
            updateEditorMetrics();

            // Abort the moment the user resumes typing: an in-flight render's
            // heavy async work (full rebuild, KaTeX, highlighting) otherwise keeps
            // competing with the textarea for the main thread even though its output
            // is already stale. Bailing is safe — the input handler has re-armed the
            // debounce, so a fresh render for the new source is already queued. Clear
            // the render-source marker so that queued render can't be skipped as a
            // redundant rebuild of a preview we only half-built.
            const renderSuperseded = () => editor.value !== rawValue;
            const bailIfSuperseded = () => {
                if (!renderSuperseded()) return false;
                lastInputRenderedSource = null;
                return true;
            };

            const { metadata, body } = splitYamlFrontmatter(rawValue || '');
            const normalizedValue = normalizeEscapedLatexDelimiters(
                normalizeMathBlocks(body)
            );
            let handledIncrementally = false;
            try {
                // Frontmatter renders as a separate preview header, so skip the
                // token<->DOM incremental path that assumes one child per token.
                handledIncrementally = metadata
                    ? false
                    : await tryIncrementalPreviewRender(normalizedValue);
            } catch {
                handledIncrementally = false;
            }
            if (bailIfSuperseded()) return;
            if (!handledIncrementally) {
                await renderMarkdownInto(preview, rawValue);
                if (bailIfSuperseded()) return;
                try {
                    prevPreviewTokens = marked.lexer(normalizedValue);
                    prevPreviewNormalized = normalizedValue;
                } catch {
                    prevPreviewTokens = null;
                    prevPreviewNormalized = null;
                }
            }

            applySmartOutlineStyles();
            // Reuse the tokens just lexed for the render when normalization
            // didn't touch the source, so the scroll map doesn't re-lex the
            // whole document a second time on every keystroke pause.
            rebuildPreviewLineMap(
                normalizedValue === rawValue ? prevPreviewTokens : null
            );
            if (findBarVisible && findNeedle()) {
                const matches = collectFindMatches();
                const index = findMatchIndex >= 0 ? findMatchIndex : activeFindMatchIndex(matches);
                applyPreviewFindHighlights(matches, index);
            } else {
                clearPreviewFindHighlights();
                syncPreviewScrollToEditor();
            }
        }

        let editorVisualLineMap = [];
        let editorVisualLineMapText = null;
        let editorVisualLineMapWidth = 0;
        let editorVisualLineMapDirty = true;

        function markEditorVisualLineMapDirty() {
            editorVisualLineMapDirty = true;
        }

        // Textarea scrollTop moves through wrapped visual rows, not Markdown
        // source lines. Build a hidden pre-wrap mirror with markers at every
        // hard-line start so scroll sync can recover the fractional source line
        // at the top of the editor viewport.
        function rebuildEditorVisualLineMapIfNeeded() {
            const value = editor.value;
            const width = editor.clientWidth;
            if (
                !editorVisualLineMapDirty &&
                editorVisualLineMapText === value &&
                editorVisualLineMapWidth === width
            ) {
                return editorVisualLineMap;
            }

            const style = getComputedStyle(editor);
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const fragment = document.createDocumentFragment();
            let cursor = 0;
            let line = 0;

            function appendMarker(sourceLine) {
                const marker = document.createElement('span');
                marker.className = 'editor-line-start-marker';
                marker.dataset.line = String(sourceLine);
                marker.textContent = '\u200b';
                fragment.appendChild(marker);
            }

            appendMarker(0);
            for (let index = 0; index < value.length; index += 1) {
                if (value[index] !== '\n') continue;
                fragment.appendChild(document.createTextNode(value.slice(cursor, index + 1)));
                line += 1;
                appendMarker(line);
                cursor = index + 1;
            }
            if (cursor < value.length) {
                fragment.appendChild(document.createTextNode(value.slice(cursor)));
            }

            editorScrollMeasure.replaceChildren(fragment);
            editorVisualLineMap = [...editorScrollMeasure.querySelectorAll('.editor-line-start-marker')]
                .map((marker) => ({
                    line: Number(marker.dataset.line) || 0,
                    top: Math.max(0, marker.offsetTop - paddingTop),
                }))
                .filter((entry, index, map) => index === 0 || entry.top >= map[index - 1].top);
            if (!editorVisualLineMap.length) {
                editorVisualLineMap = [{ line: 0, top: 0 }];
            }

            editorVisualLineMapText = value;
            editorVisualLineMapWidth = width;
            editorVisualLineMapDirty = false;
            return editorVisualLineMap;
        }

        // Pixel offset of a source character index in the editor viewport, accounting
        // for soft-wrapped visual rows (hard newline count alone is not enough).
        function measureEditorOffsetTop(offset) {
            const value = editor.value;
            const clamped = Math.max(0, Math.min(offset, value.length));
            const paddingTop = parseFloat(getComputedStyle(editor).paddingTop) || 0;
            const fragment = document.createDocumentFragment();

            if (clamped > 0) {
                fragment.appendChild(document.createTextNode(value.slice(0, clamped)));
            }
            const marker = document.createElement('span');
            marker.className = 'editor-offset-marker';
            marker.textContent = '\u200b';
            fragment.appendChild(marker);
            if (clamped < value.length) {
                fragment.appendChild(document.createTextNode(value.slice(clamped)));
            }

            editorScrollMeasure.replaceChildren(fragment);
            markEditorVisualLineMapDirty();
            return Math.max(0, marker.offsetTop - paddingTop);
        }

        // Fractional source line currently sitting at the top of the editor
        // viewport. Fractional (not floored) so the preview tracks smoothly
        // through soft-wrapped prose as well as hard newline-delimited text.
        function getEditorAnchorLine() {
            const map = rebuildEditorVisualLineMapIfNeeded();
            if (!map.length) return 0;

            const targetTop = Math.max(0, editor.scrollTop);
            if (targetTop <= map[0].top) return map[0].line;
            const last = map[map.length - 1];
            if (targetTop >= last.top) return last.line;

            let low = 0;
            let high = map.length - 1;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                if (map[mid].top <= targetTop) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            const before = map[Math.max(0, high)];
            const after = map[Math.min(map.length - 1, high + 1)];
            const span = after.top - before.top;
            if (span <= 0) return before.line;

            return before.line + ((targetTop - before.top) / span) * (after.line - before.line);
        }

        // Maps source lines to rendered preview offsets. marked's lexer reports
        // the same top-level blocks (in the same order) as the rendered DOM
        // children, so we pair them by index and accumulate `raw` text to learn
        // each block's start line. For every block we record TWO points: its
        // top at the first content line and its bottom (top + offsetHeight) at
        // the line just past its last content line. This keeps the blank lines
        // separating blocks from soaking up vertical travel they don't occupy —
        // their tiny pixel gap (the block margin) maps to the blank source lines
        // instead of stretching across the block, which previously made the
        // preview lag behind the editor through long prose paragraphs.
        let previewLineMap = [];
        // `sourceTokens`, when supplied, are the top-level lexer tokens the
        // caller already computed for the current source — reused verbatim so a
        // render doesn't lex the whole document a second time just to build the
        // scroll map. Only pass them when they were lexed from the *raw* editor
        // value (i.e. preview normalization was a no-op); otherwise their `raw`
        // newline counts wouldn't line up with the editor's source lines.
        function rebuildPreviewLineMap(sourceTokens = null) {
            const map = [];
            const children = preview.children;
            // offsetTop is preview-content-relative (paddingP + contentOffset).
            // The editor anchor renders its line editorPaddingTop below the top
            // edge, so offsetting the preview by the editor's padding makes the
            // synced line land at the same screen Y in both panes (cancelling
            // the p-6 vs p-8 padding difference between the two).
            const editorPaddingTop = parseFloat(getComputedStyle(editor).paddingTop) || 0;
            const { metadata, body, frontmatterLineCount } = splitYamlFrontmatter(editor.value);
            let line = 0;
            let childIndex = 0;
            let tokens;
            try {
                const markdownBody = metadata
                    ? normalizeEscapedLatexDelimiters(normalizeMathBlocks(body))
                    : editor.value;
                tokens = sourceTokens || marked.lexer(markdownBody);
            } catch {
                previewLineMap = [];
                return;
            }
            if (metadata && children[0]?.classList.contains('document-frontmatter')) {
                const el = children[0];
                const top = el.offsetTop - editorPaddingTop;
                map.push({ line: 0, top });
                map.push({ line: frontmatterLineCount, top: top + el.offsetHeight });
                line = frontmatterLineCount;
                childIndex = 1;
            }
            {
                for (const token of tokens) {
                    const startLine = line;
                    const raw = token.raw || '';
                    let newlines = 0;
                    for (let i = 0; i < raw.length; i += 1) {
                        if (raw[i] === '\n') newlines += 1;
                    }
                    line += newlines;
                    if (token.type === 'space') continue;
                    const el = children[childIndex];
                    childIndex += 1;
                    if (!el) break;
                    // Newlines inside the block once trailing blank lines are
                    // stripped: the count of source lines the block's content
                    // actually spans.
                    const trimmed = raw.replace(/\s+$/, '');
                    let contentNewlines = 0;
                    for (let i = 0; i < trimmed.length; i += 1) {
                        if (trimmed[i] === '\n') contentNewlines += 1;
                    }
                    const top = el.offsetTop - editorPaddingTop;
                    map.push({ line: startLine, top });
                    map.push({ line: startLine + contentNewlines + 1, top: top + el.offsetHeight });
                }
            }
            // Keep the map strictly increasing in both line and top so the
            // bracketing interpolation in previewTopForLine stays well-defined
            // when blocks abut with no blank line between them.
            previewLineMap = map.filter(
                (entry, index) =>
                    index === 0 ||
                    (entry.line > map[index - 1].line && entry.top >= map[index - 1].top)
            );
        }

        // Convert a source line into a preview scrollTop by interpolating
        // between the two mapped blocks that bracket it.
        function previewTopForLine(anchorLine) {
            const map = previewLineMap;
            if (!map.length) return null;
            if (anchorLine <= map[0].line) return map[0].top;
            const last = map[map.length - 1];
            if (anchorLine >= last.line) return last.top;
            for (let i = 0; i < map.length - 1; i += 1) {
                const a = map[i];
                const b = map[i + 1];
                if (anchorLine >= a.line && anchorLine < b.line) {
                    const span = b.line - a.line || 1;
                    const fraction = (anchorLine - a.line) / span;
                    return a.top + fraction * (b.top - a.top);
                }
            }
            return last.top;
        }

        function syncPreviewScrollToEditor(sourceOffset = null) {
            const anchorLine =
                sourceOffset != null && Number.isFinite(sourceOffset)
                    ? Math.max(0, editor.value.slice(0, sourceOffset).split('\n').length - 1)
                    : getEditorAnchorLine();

            const maxScroll = Math.max(0, preview.scrollHeight - preview.clientHeight);
            const targetTop = previewTopForLine(anchorLine);

            if (targetTop == null) {
                // No block map (e.g. empty document): fall back to proportional.
                const editorRange = editor.scrollHeight - editor.clientHeight;
                const ratio = editorRange > 0 ? editor.scrollTop / editorRange : 0;
                preview.scrollTop = ratio * maxScroll;
                return;
            }

            preview.scrollTop = Math.max(0, Math.min(targetTop, maxScroll));
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
            clearTimeout(autosaveTimer);
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
                markDocumentPersisted(editor.value);
                setFilenameLabel(`Editing: ${file.path}`, file.path);
                setUpdateStatus('Saved.');
                await deleteRecoveryForCurrentFile();
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
                markDocumentPersisted(editor.value);
                setFilenameLabel(`Editing: ${file.path}`, file.path);
                rememberOpenedPath(file.path);
                startFileWatcher(file.path, currentFileMtime);
                setUpdateStatus('Saved.');
                await deleteRecoveryForCurrentFile();
            } catch (error) {
                setUpdateStatus(`Save failed: ${error?.message || error}`);
            }
        }

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        // Serialize every same-origin stylesheet into one CSS string, then inline
        // any font files it references as data URIs. This makes the exported HTML
        // fully self-contained so the headless browser renders it identically
        // (KaTeX math fonts in particular) when opening it from a temp file.
        async function collectInlinedCss() {
            let css = '';
            for (const sheet of document.styleSheets) {
                let rules;
                try {
                    rules = sheet.cssRules;
                } catch (_) {
                    continue; // cross-origin sheet — its rules aren't readable
                }
                for (const rule of rules) css += rule.cssText + '\n';
            }
            const fontUrlRe = /url\((['"]?)([^'")]+\.(?:woff2?|ttf|otf|eot))(\?[^'")]*)?\1\)/gi;
            const urls = new Set();
            let match;
            while ((match = fontUrlRe.exec(css))) urls.add(match[2]);
            const replacements = new Map();
            await Promise.all([...urls].map(async (url) => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) return;
                    replacements.set(url, await blobToDataUrl(await response.blob()));
                } catch (_) { /* leave the original url in place */ }
            }));
            return css.replace(fontUrlRe, (full, _quote, url) =>
                replacements.has(url) ? `url("${replacements.get(url)}")` : full);
        }

        async function buildExportHtml() {
            const css = await collectInlinedCss();
            const rawName = currentFilePath ? basename(currentFilePath) : 'Untitled';
            const title = rawName.replace(/\.(md|markdown|txt)$/i, '')
                .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
            // Reuse the live preview's rendered markup and classes so the PDF
            // matches the on-screen document; force a clean white page and let
            // the normally-clipped content flow across pages.
            return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${css}</style>
<style>
  @page { margin: 16mm; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; }
  #preview { padding: 0 !important; max-width: none !important;
             height: auto !important; max-height: none !important;
             overflow: visible !important; color: #000 !important; background: #fff !important; }
</style>
</head>
<body>
${preview.outerHTML}
</body>
</html>`;
        }

        // Renders the live preview to a PDF at `outPath` and reveals it in the OS
        // file manager. Returns true on a successful direct export.
        async function renderPdfTo(outPath) {
            setUpdateStatus('Exporting to PDF…');
            try {
                const html = await buildExportHtml();
                const saved = await invoke('export_pdf', { html, outPath });
                setUpdateStatus(`Exported to ${saved}`);
                invoke('reveal_in_file_manager', { path: saved }).catch(() => {});
                return true;
            } catch (error) {
                setUpdateStatus(`Export to PDF failed: ${error?.message || error}`);
                return false;
            }
        }

        function defaultPdfPath() {
            return currentFilePath
                ? currentFilePath.replace(/\.(md|markdown|txt)$/i, '') + '.pdf'
                : null;
        }

        async function exportToPdf() {
            // Without a saved source path, ask for the destination explicitly.
            // Avoid the native print API: on some macOS/WebKit/Tauri combinations the
            // native print panel can abort the app while mutating window styles.
            const outPath = defaultPdfPath();
            if (!outPath) {
                await exportToPdfAs();
                return;
            }
            await renderPdfTo(outPath);
        }

        // "Export PDF As…": let the user choose the destination via a save dialog,
        // defaulting next to the source document.
        async function exportToPdfAs() {
            const suggested = defaultPdfPath();
            let chosen;
            try {
                chosen = await saveDialog({
                    title: 'Export PDF As',
                    defaultPath: suggested || 'Untitled.pdf',
                    filters: [{ name: 'PDF', extensions: ['pdf'] }],
                });
            } catch (error) {
                setUpdateStatus(`Export PDF As failed: ${error?.message || error}`);
                return;
            }
            if (!chosen) return; // user cancelled
            await renderPdfTo(chosen);
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

function updateTurnEl(entry, turn, final, describeToolFn = describeTool) {
    if (turn.role === 'user') {
        entry.bubble.textContent = turn.text || '';
        entry.bubble.classList.toggle('claude-bubble-queued', Boolean(turn.queued));
        return;
    }
    const blocks = entry.blocks;
    const list = turn.blocks || [];

    // On the one-time finalize pass, rebuild everything so text blocks pick up
    // the full markdown pipeline (highlight/mermaid/KaTeX). While still
    // streaming, a done block's DOM can't change again, so skip it — without
    // this, a long agentic turn re-parses markdown and rebuilds every prior
    // tool/text block on every animation frame, which was stealing enough main
    // -thread time to make composer typing feel laggy during a live response.
    if (final || !entry.blockEls) {
        blocks.innerHTML = '';
        entry.blockEls = [];
    }
    while (entry.blockEls.length > list.length) {
        const stale = entry.blockEls.pop();
        if (stale && stale.parentNode) stale.remove();
    }
    for (let i = 0; i < list.length; i += 1) {
        const block = list[i];
        if (!block) continue;
        const existing = entry.blockEls[i];
        // Skip only if this exact block object was already rendered done — a
        // reconciled snapshot can replace the object at an index with a newer,
        // longer one that's also `done`, which still needs a rebuild.
        if (existing && existing._srcBlock === block && block.done) continue;
        const el = buildBlockEl(block, final, describeToolFn);
        el._srcBlock = block;
        if (existing) {
            blocks.replaceChild(el, existing);
        } else {
            blocks.appendChild(el);
        }
        entry.blockEls[i] = el;
    }
}

function buildBlockEl(block, final, describeToolFn) {
    if (block.kind === 'thinking') return buildThinkingBlock(block);
    if (block.kind === 'tool') return buildToolBlock(block, describeToolFn);
    return buildTextBlock(block, final);
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
    const preview = String(block.text || '').trim();
    const details = document.createElement('details');
    details.className = 'claude-think';
    if (!block.done) details.classList.add('claude-think-live');
    const summary = document.createElement('summary');
    summary.textContent = block.done ? 'Thinking' : 'Thinking…';
    const body = document.createElement('div');
    body.className = 'claude-think-body';
    if (preview) {
        body.textContent = block.text;
    } else if (!block.done) {
        body.textContent = 'Reasoning in progress…';
    } else {
        body.textContent = 'No reasoning details were returned for this step.';
    }
    details.appendChild(summary);
    details.appendChild(body);
    if (block._open) details.open = true;
    details.addEventListener('toggle', () => {
        block._open = details.open;
    });
    return details;
}

function buildToolBlock(block, describeToolFn = describeTool) {
    const details = document.createElement('details');
    details.className = 'claude-tool';
    if (block.isError) details.classList.add('claude-tool-error');
    const summary = document.createElement('summary');
    const icon = block.result == null && !block.done ? '⚙️' : block.isError ? '⚠️' : '🔧';
    summary.textContent = `${icon} ${describeToolFn(block)}`;
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
    const stalled = Boolean(claudeChatState && claudeChatState.stalled);
    if (claudeStatus) {
        claudeStatus.textContent = chatStatusLabel({ started: claudeStarted, busy, stalled });
    }
    // Keep Stop reachable while stalled so the user can always recover.
    if (claudeStopBtn) claudeStopBtn.classList.toggle('hidden', !busy && !stalled);
    if (claudeInput) claudeInput.classList.toggle('claude-input-busy', busy);
    armClaudeWatchdog(busy && !stalled);
}

// Watchdog: a persistent `claude` session only terminates a turn with a `result`
// line, so a stalled CLI (network hang, dropped/garbled result) would otherwise
// leave the pane stuck on "Thinking…" forever. If no `claude-chat` event arrives
// for CLAUDE_STALL_MS while busy, flip to a recoverable "Stalled" status.
const CLAUDE_STALL_MS = 90_000;
let claudeWatchdogTimer = null;

function armClaudeWatchdog(active) {
    if (claudeWatchdogTimer != null) {
        clearTimeout(claudeWatchdogTimer);
        claudeWatchdogTimer = null;
    }
    if (!active) return;
    claudeWatchdogTimer = setTimeout(() => {
        claudeWatchdogTimer = null;
        if (claudeChatState && claudeChatState.busy && !claudeChatState.stalled) {
            claudeChatState.stalled = true;
            updateClaudeBusyUI();
        }
    }, CLAUDE_STALL_MS);
}

async function stopClaudeChat() {
    try {
        await invoke('claude_chat_stop');
    } catch (_) {
        /* ignore */
    }
    if (claudeChatState) {
        claudeChatState.busy = false;
        claudeChatState.stalled = false;
        claudeChatState.exited = true;
    }
    renderClaudeChat();
    updateClaudeBusyUI();
}

// ----- Cursor Agent chat ----------------------------------------------------

function isAgentTranscriptAtBottom() {
    if (!agentTranscript) return true;
    const slack = 28;
    return (
        agentTranscript.scrollHeight -
            agentTranscript.scrollTop -
            agentTranscript.clientHeight <=
        slack
    );
}

function scheduleAgentScrollToBottom() {
    if (!agentTranscript) return;
    requestAnimationFrame(() => {
        agentTranscript.scrollTop = agentTranscript.scrollHeight;
    });
}

function resetAgentTranscript() {
    agentTurnEls = [];
    if (agentTranscript) {
        agentTranscript.innerHTML = '';
        if (agentEmpty) agentTranscript.appendChild(agentEmpty);
    }
    if (agentEmpty) agentEmpty.classList.remove('hidden');
}

function renderAgentChat() {
    if (agentRenderRaf != null) return;
    agentRenderRaf = requestAnimationFrame(() => {
        agentRenderRaf = null;
        flushAgentChat();
    });
}

function flushAgentChat() {
    if (!agentTranscript || !agentChatState) return;
    const state = agentChatState;
    const stick = isAgentTranscriptAtBottom();

    if (agentEmpty) agentEmpty.classList.toggle('hidden', state.turns.length > 0);

    for (let i = 0; i < state.turns.length; i += 1) {
        const turn = state.turns[i];
        let entry = agentTurnEls[i];
        if (!entry) {
            entry = createTurnEl(turn);
            agentTurnEls[i] = entry;
            agentTranscript.appendChild(entry.root);
        }
        if (entry.finalized) continue;
        const shouldFinalize =
            turn.role === 'user'
                ? !turn.queued
                : i < state.turns.length - 1 || !state.busy;
        updateTurnEl(entry, turn, shouldFinalize, describeAgentTool);
        if (shouldFinalize) entry.finalized = true;
    }

    renderAgentFooter(state);
    if (stick) scheduleAgentScrollToBottom();
}

function renderAgentFooter(state) {
    if (agentFooterEl && agentFooterEl.parentNode) agentFooterEl.remove();
    agentFooterEl = null;
    const parts = [];
    if (state.error) parts.push({ cls: 'claude-error', text: state.error });
    if (state.busy && !state.stalled) {
        const lastTurn = state.turns[state.turns.length - 1];
        if (!lastTurn || lastTurn.role === 'user') {
            parts.push({ cls: 'claude-live', text: `Waiting for ${agentProviderName()}…` });
        }
    }
    if (state.result) {
        const bits = [];
        if (state.result.durationMs != null) bits.push(`${(state.result.durationMs / 1000).toFixed(1)}s`);
        if (state.result.costUsd != null) bits.push(`$${state.result.costUsd.toFixed(4)}`);
        if (bits.length) parts.push({ cls: 'claude-result', text: bits.join(' · ') });
    }
    if (!parts.length) return;
    agentFooterEl = document.createElement('div');
    agentFooterEl.className = 'claude-footer';
    for (const part of parts) {
        const span = document.createElement('span');
        span.className = part.cls;
        span.textContent = part.text;
        agentFooterEl.appendChild(span);
    }
    agentTranscript.appendChild(agentFooterEl);
}

function formatAgentStatus(state, queueLen) {
    const busy = Boolean(state && state.busy);
    const stalled = Boolean(state && state.stalled);
    const hasTurns = Boolean(state && state.turns.length);
    let label = chatStatusLabel({ started: hasTurns || busy || queueLen > 0, busy, stalled });
    if (!busy && !stalled && !queueLen) {
        label = hasTurns ? 'Ready' : 'Idle';
    }
    if (queueLen > 0) {
        const queued = queueLen === 1 ? '1 queued' : `${queueLen} queued`;
        label = `${label} · ${queued}`;
    }
    return label;
}

function updateAgentBusyUI() {
    const busy = Boolean(agentChatState && agentChatState.busy);
    const stalled = Boolean(agentChatState && agentChatState.stalled);
    if (agentStatus) {
        agentStatus.textContent = formatAgentStatus(agentChatState, agentMessageQueue.length);
        agentStatus.classList.toggle('agent-status-busy', busy && !stalled);
        agentStatus.classList.toggle('agent-status-stalled', stalled);
    }
    if (agentStopBtn) agentStopBtn.classList.toggle('hidden', !busy && !stalled);
    if (agentInput) agentInput.classList.toggle('claude-input-busy', busy);
    armAgentWatchdog(busy && !stalled);
}

const AGENT_STALL_MS = 90_000;
let agentWatchdogTimer = null;

function armAgentWatchdog(active) {
    if (agentWatchdogTimer != null) {
        clearTimeout(agentWatchdogTimer);
        agentWatchdogTimer = null;
    }
    if (!active) return;
    agentWatchdogTimer = setTimeout(() => {
        agentWatchdogTimer = null;
        if (agentChatState && agentChatState.busy && !agentChatState.stalled) {
            agentChatState.stalled = true;
            updateAgentBusyUI();
        }
    }, AGENT_STALL_MS);
}

async function ensureAgentChatListener() {
    if (agentChatUnlisten) return;
    agentChatUnlisten = await listen('cursor-agent-chat', async (event) => {
        let evt = parseAgentChatLine(event.payload);
        // Hermes prints plain text rather than stream-json; surface those lines
        // as assistant output instead of dropping them.
        if (!evt && agentRunProvider === 'hermes' && typeof event.payload === 'string' && event.payload.trim()) {
            evt = { type: 'plain_text', text: event.payload };
        }
        if (!evt) return;
        if (!agentChatState) agentChatState = createAgentChatState();
        const wasBusy = agentChatState.busy;
        reduceAgentChatEvent(agentChatState, evt);
        const turnEnded = wasBusy && !agentChatState.busy;
        if (turnEnded && agentMessageQueue.length) {
            await drainAgentMessageQueue();
        }
        renderAgentChat();
        updateAgentBusyUI();
    });
}

async function drainAgentMessageQueue() {
    if (!agentMessageQueue.length || (agentChatState && agentChatState.busy)) return;
    const message = agentMessageQueue.shift();
    if (!message) return;
    await dispatchAgentMessage(message, { fromQueue: true });
}

async function dispatchAgentMessage(message, { fromQueue = false } = {}) {
    await toggleAgent(true);
    await ensureAgentChatListener();
    if (!agentChatState) agentChatState = createAgentChatState();
    if (fromQueue) {
        if (!activateQueuedUserTurn(agentChatState)) {
            appendAgentUserTurn(agentChatState, message);
        }
    } else {
        appendAgentUserTurn(agentChatState, message);
    }
    renderAgentChat();
    updateAgentBusyUI();
    if (currentFilePath) {
        try {
            const savedFile = await invoke('write_document', {
                path: currentFilePath,
                content: editor.value
            });
            currentFileMtime = savedFile.modifiedMs ?? currentFileMtime;
            startFileWatcher(currentFilePath, currentFileMtime);
        } catch (_) {
            /* best effort */
        }
    }
    const isHermes = activeAiProvider === 'hermes';
    agentRunProvider = isHermes ? 'hermes' : 'cursor';
    try {
        await invoke('cursor_agent_send', {
            text: message,
            filePath: currentFilePath || null,
            mode: isHermes ? null : agentModeSelect?.value || null,
            force: isHermes ? false : Boolean(agentForceCheckbox?.checked),
            provider: agentRunProvider,
            cwd: developLuminaMode && luminaSourceDir ? luminaSourceDir : null
        });
    } catch (error) {
        if (agentChatState) {
            agentChatState.error = `Send failed: ${error?.message || error}`;
            agentChatState.busy = false;
            agentChatState.stalled = false;
        }
        renderAgentChat();
        updateAgentBusyUI();
        if (agentMessageQueue.length) {
            await drainAgentMessageQueue();
        }
    }
}

async function submitAgentMessage(text) {
    const message = String(text ?? '').replace(/\s+$/, '');
    if (!message.trim()) return;
    if (agentChatState && agentChatState.busy) {
        agentMessageQueue.push(message);
        appendAgentQueuedUserTurn(agentChatState, message);
        renderAgentChat();
        updateAgentBusyUI();
        return;
    }
    await dispatchAgentMessage(message);
}

async function sendAgentMessage(text) {
    await submitAgentMessage(text);
}

async function stopAgentChat() {
    try {
        await invoke('cursor_agent_stop');
    } catch (_) {
        /* ignore */
    }
    agentMessageQueue = [];
    if (agentChatState) {
        agentChatState.turns = agentChatState.turns.filter((t) => !(t.role === 'user' && t.queued));
        agentChatState.busy = false;
        agentChatState.stalled = false;
        agentChatState.exited = true;
    }
    renderAgentChat();
    updateAgentBusyUI();
}

async function newAgentChat() {
    await stopAgentChat();
    agentMessageQueue = [];
    agentChatState = createAgentChatState();
    resetAgentTranscript();
    updateAgentBusyUI();
    agentInput?.focus();
}

async function sendAgentContext(extraInstruction = '') {
    const prompt = `${agentBaseContext()}${extraInstruction ? `\n\nTask: ${extraInstruction}` : ''}`;
    await submitAgentMessage(prompt);
}

async function sendAgentPreset() {
    const presets = [
        ['Improve writing', 'Improve the clarity, flow, and tone of this Markdown. Preserve meaning and structure.'],
        ['Summarize', 'Summarize this document into concise bullet points.'],
        ['Fix Markdown', 'Fix Markdown formatting, list hierarchy, task lists, tables, Mermaid, and LaTeX issues.'],
        ['Explain math', 'Explain any LaTeX/math content in plain language and flag notation problems.'],
        ['Create outline', 'Create a clean hierarchical outline for this document.']
    ];
    const choice = window.prompt(
        `Send ${agentProviderName()} prompt:\n\n${presets.map(([label], index) => `${index + 1}. ${label}`).join('\n')}\n\nEnter a number:`
    );
    if (!choice) return;

    const preset = presets[Number(choice.trim()) - 1];
    if (!preset) {
        setUpdateStatus('Agent prompt selection was not recognized.');
        return;
    }

    await sendAgentContext(preset[1]);
}

async function pullAgentWorkspaceFile() {
    agentApplyMenu?.classList.add('hidden');
    agentApplyMenuBtn?.setAttribute('aria-expanded', 'false');
    if (!agentWorkspaceFilePath) {
        setUpdateStatus('Agent workspace file is not available yet.');
        return;
    }

    try {
        const file = await invoke('open_file_path', { path: agentWorkspaceFilePath });
        pushEditorHistory();
        editor.value = file.content;
        editor.setSelectionRange(0, 0);
        editor.scrollTop = 0;
        resetEditorHistory();
        schedulePreviewUpdate();
        editor.focus();
        setUpdateStatus('Pulled Agent workspace file into the editor.');
    } catch (error) {
        setUpdateStatus(`Unable to pull Agent file: ${error?.message || error}`);
    }
}

async function replaceAgentSelectionFromClipboard() {
    agentApplyMenu?.classList.add('hidden');
    agentApplyMenuBtn?.setAttribute('aria-expanded', 'false');
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

function autoSizeAgentInput() {
    if (!agentInput) return;
    agentInput.style.height = 'auto';
    agentInput.style.height = `${agentInput.scrollHeight}px`;
}

function wireAgentInputBar() {
    if (!agentInputBar || !agentInput) return;
    agentInput.addEventListener('input', autoSizeAgentInput);
    agentInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            const text = agentInput.value;
            agentInput.value = '';
            autoSizeAgentInput();
            void sendAgentMessage(text);
        }
    });
    agentInputBar.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = agentInput.value;
        agentInput.value = '';
        autoSizeAgentInput();
        void sendAgentMessage(text);
    });
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
        editor.setSelectionRange(0, 0);
        editor.scrollTop = 0;
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
                // Even while editing Lumina source, let Claude see the document
                // open in the editor. Persist the buffer first so it reads the
                // latest content, and keep the watcher live for write-back.
                if (currentFilePath) {
                    const savedFile = await invoke('write_document', {
                        path: currentFilePath,
                        content: editor.value
                    });
                    currentFileMtime = savedFile.modifiedMs ?? currentFileMtime;
                    startArgs.openFilePath = currentFilePath;
                    startFileWatcher(currentFilePath, currentFileMtime);
                }
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
            if (developLuminaMode) {
                void syncAutoRebuildWatch();
            }
        }

        function updateDevelopLuminaUi() {
            const hasSource = Boolean(luminaSourceDir);
            claudeDevelopLuminaBtn.classList.toggle('hidden', !hasSource);
            claudeRebuildLuminaBtn.classList.toggle('hidden', !hasSource || !developLuminaMode);
            claudeAutoRebuildWrap?.classList.toggle('hidden', !hasSource || !developLuminaMode);
            if (claudeAutoRebuildCheckbox) {
                claudeAutoRebuildCheckbox.checked = autoRebuildLumina;
            }
            claudeDevelopLuminaBtn.setAttribute('aria-pressed', String(developLuminaMode));
            claudeDevelopLuminaBtn.classList.toggle('claude-action-primary', developLuminaMode);
            claudeDevelopLuminaBtn.title = developLuminaMode
                ? 'Stop editing Lumina source (next Claude session goes back to the open document)'
                : `Edit Lumina source code with Claude (${luminaSourceDir || 'no source detected'})`;
            if (agentDevelopLuminaBtn) {
                agentDevelopLuminaBtn.classList.toggle('hidden', !hasSource);
                agentDevelopLuminaBtn.setAttribute('aria-pressed', String(developLuminaMode));
                agentDevelopLuminaBtn.classList.toggle('claude-action-primary', developLuminaMode);
                agentDevelopLuminaBtn.title = developLuminaMode
                    ? 'Stop editing Lumina source (next agent turn goes back to the open document)'
                    : `Edit Lumina source code with ${agentProviderName()} (${luminaSourceDir || 'no source detected'})`;
            }
            agentRebuildLuminaBtn?.classList.toggle('hidden', !hasSource || !developLuminaMode);
            agentAutoRebuildWrap?.classList.toggle('hidden', !hasSource || !developLuminaMode);
            if (agentAutoRebuildCheckbox) {
                agentAutoRebuildCheckbox.checked = autoRebuildLumina;
            }
            updateAgentWorkspaceLabel();
        }

        function clearAutoRebuildTimer() {
            if (autoRebuildTimer == null) return;
            clearTimeout(autoRebuildTimer);
            autoRebuildTimer = null;
        }

        function scheduleAutoRebuild() {
            if (!autoRebuildLumina || !developLuminaMode || installProgressTracking) return;
            clearAutoRebuildTimer();
            setUpdateStatus(
                `Source changed — auto-rebuild in ${Math.round(autoRebuildDebounceMs / 1000)}s…`
            );
            autoRebuildTimer = setTimeout(() => {
                autoRebuildTimer = null;
                void rebuildLumina({ auto: true });
            }, autoRebuildDebounceMs);
        }

        async function ensureSourceWatchListener() {
            if (sourceWatchUnlisten) return;
            sourceWatchUnlisten = await listen('lumina-source-changed', () => {
                scheduleAutoRebuild();
            });
        }

        async function syncAutoRebuildWatch() {
            await ensureSourceWatchListener();
            if (developLuminaMode && autoRebuildLumina && luminaSourceDir) {
                try {
                    await invoke('watch_source_checkout', { path: luminaSourceDir });
                } catch (error) {
                    setUpdateStatus(`Source watch failed: ${error?.message || error}`);
                }
                return;
            }

            clearAutoRebuildTimer();
            try {
                await invoke('unwatch_source_checkout');
            } catch (_) {
                /* ignore */
            }
        }

        function setAutoRebuildLumina(enabled) {
            autoRebuildLumina = enabled;
            localStorage.setItem(autoRebuildLuminaKey, String(enabled));
            if (claudeAutoRebuildCheckbox) {
                claudeAutoRebuildCheckbox.checked = enabled;
            }
            if (agentAutoRebuildCheckbox) {
                agentAutoRebuildCheckbox.checked = enabled;
            }
            void syncAutoRebuildWatch();
        }

        async function toggleDevelopLuminaMode({ pane = 'claude' } = {}) {
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
            // Drop the Agent pane conversation context too: a `cursor agent
            // --continue` turn would otherwise resume in the old workspace.
            if (agentChatState) {
                await stopAgentChat();
            }
            developLuminaMode = turningOn;
            updateDevelopLuminaUi();
            await syncAutoRebuildWatch();
            if (pane === 'agent') {
                if (!agentVisible) {
                    toggleAgent(true);
                }
                return;
            }
            if (!claudeVisible) {
                toggleClaude(true);
            } else {
                await ensureClaude();
            }
        }

        async function rebuildLumina({ auto = false } = {}) {
            if (!currentCheckoutInstallCommand) {
                setUpdateStatus('No installable Lumina checkout was detected.');
                return;
            }
            if (installProgressTracking) return;
            clearAutoRebuildTimer();
            if (!auto) {
                const confirmed = window.confirm(
                    `Rebuild Lumina from source and reinstall?\n\n${luminaSourceDir || ''}\n\nThe app will rebuild (may take several minutes) and relaunch.`
                );
                if (!confirmed) return;
            }
            await runCommandInTerminal(
                currentCheckoutInstallCommand,
                auto
                    ? 'Auto-rebuilding Lumina from the source checkout…'
                    : 'Rebuilding Lumina from the source checkout...',
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

        // 'agent' (Cursor) and 'hermes' share the Agent pane; only the CLI differs.
        function isAgentPaneProvider(provider) {
            return provider === 'agent' || provider === 'hermes';
        }

        function agentProviderName() {
            return activeAiProvider === 'hermes' ? 'Hermes' : 'Cursor Agent';
        }

        function syncAgentPaneLabels() {
            const name = agentProviderName();
            const isHermes = activeAiProvider === 'hermes';
            if (agentProviderNameEl) agentProviderNameEl.textContent = name;
            if (agentEmpty) agentEmpty.textContent = `Ask ${name} about your project — replies render as formatted chat.`;
            if (agentInput) agentInput.placeholder = `Message ${name}…  (Enter to send · Shift+Enter for newline)`;
            // Mode and Force map to cursor-agent CLI flags, so hide them for Hermes.
            agentModeSelect?.classList.toggle('hidden', isHermes);
            agentForceLabel?.classList.toggle('hidden', isHermes);
        }

        function syncAiToggleButton() {
            if (!toggleAiBtn || !toggleAiWrap) return;
            const isAgent = isAgentPaneProvider(activeAiProvider);
            const label = activeAiProvider === 'hermes' ? 'H' : isAgent ? 'A' : 'C';
            const name = isAgent ? agentProviderName() : 'Claude';
            const paneOpen = isAgent ? agentVisible : claudeVisible;

            toggleAiBtn.textContent = label;
            toggleAiWrap.classList.toggle('ai-provider-agent', isAgent);
            toggleAiWrap.classList.toggle('ai-provider-claude', !isAgent);
            toggleAiBtn.classList.toggle('ai-toggle-active', paneOpen);
            toggleAiMenuBtn?.classList.toggle('ai-toggle-active', paneOpen);
            toggleAiBtn.setAttribute('aria-pressed', String(paneOpen));
            toggleAiBtn.title = paneOpen ? `Hide ${name}` : `Show ${name}`;

            if (toggleAiMenu) {
                for (const item of toggleAiMenu.querySelectorAll('[data-ai-provider]')) {
                    const selected = item.dataset.aiProvider === activeAiProvider;
                    item.setAttribute('aria-checked', String(selected));
                }
            }
        }

        function closeAiPickerMenu() {
            if (!toggleAiMenu) return;
            toggleAiMenu.classList.add('hidden');
            toggleAiMenuBtn?.setAttribute('aria-expanded', 'false');
        }

        function openAiPickerMenu() {
            if (!toggleAiMenu) return;
            toggleAiMenu.classList.remove('hidden');
            toggleAiMenuBtn?.setAttribute('aria-expanded', 'true');
        }

        function toggleAiPickerMenu() {
            if (!toggleAiMenu) return;
            if (toggleAiMenu.classList.contains('hidden')) openAiPickerMenu();
            else closeAiPickerMenu();
        }

        async function setActiveAiProvider(provider) {
            if (provider !== 'claude' && provider !== 'agent' && provider !== 'hermes') return;
            if (provider === activeAiProvider) {
                closeAiPickerMenu();
                return;
            }
            const wasClaude = claudeVisible;
            const wasAgent = agentVisible;
            const sameAgentPane = isAgentPaneProvider(provider) && isAgentPaneProvider(activeAiProvider);
            activeAiProvider = provider;
            localStorage.setItem(activeAiProviderKey, provider);
            if (sameAgentPane) {
                // Same pane, different CLI: the old backend's conversation cannot
                // continue, so start fresh.
                if (agentChatState?.turns?.length || agentMessageQueue.length) {
                    await newAgentChat();
                }
                syncAgentPaneLabels();
                syncAiToggleButton();
            } else if (wasClaude || wasAgent) {
                if (provider === 'claude') {
                    if (wasAgent) await toggleAgent(false);
                    if (!wasClaude) await toggleClaude(true);
                } else {
                    if (wasClaude) await toggleClaude(false);
                    if (!wasAgent) await toggleAgent(true);
                }
            } else {
                syncAiToggleButton();
            }
            closeAiPickerMenu();
        }

        function toggleActiveAiPane() {
            if (isAgentPaneProvider(activeAiProvider)) void toggleAgent();
            else void toggleClaude();
        }

        function syncPaneToggleButtons() {
            setPaneToggleState(toggleSourceBtn, !sourceCollapsed, ['ring-1', 'ring-sky-500/40']);
            setPaneToggleState(toggleTerminalBtn, terminalVisible, ['ring-1', 'ring-sky-500/40']);
            syncAiToggleButton();
            setPaneToggleState(toggleGitBtn, gitVisible, ['ring-1', 'ring-emerald-500/40']);
            setPaneToggleState(toggleFilesBtn, filesVisible, ['ring-1', 'ring-sky-500/40']);
            toggleSourceBtn.title = sourceCollapsed ? 'Show source pane' : 'Hide source pane';
            toggleTerminalBtn.title = terminalVisible ? 'Hide terminal' : 'Show terminal';
            toggleGitBtn.title = gitVisible ? 'Hide Git' : 'Show Git';
            toggleFilesBtn.title = filesVisible ? 'Hide Files' : 'Show Files';
            syncAppMenu();
        }

        function visibleSidePaneCount() {
            return (terminalVisible ? 1 : 0)
                + (claudeVisible ? 1 : 0)
                + (agentVisible ? 1 : 0)
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
            agentPane.style.flex = split ? `${paneWeights.agent} 1 0` : '';
            filesPane.style.flex = split ? `${paneWeights.files} 1 0` : '';
            gitPane.style.flex = split ? `${paneWeights.git} 1 0` : '';

            // Stack order top→bottom: terminal, claude, files, git. Each resizer is
            // active only when the pane directly above it is visible and at least
            // one pane below it is, so each real gap gets one handle.
            const order = [
                ['terminal', terminalVisible],
                ['claude', claudeVisible],
                ['agent', agentVisible],
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
                activeAiProvider = 'claude';
                localStorage.setItem(activeAiProviderKey, 'claude');
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

        async function toggleAgent(forceVisible) {
            agentVisible = typeof forceVisible === 'boolean' ? forceVisible : !agentVisible;
            agentPane.classList.toggle('hidden', !agentVisible);
            if (agentVisible && !isAgentPaneProvider(activeAiProvider)) {
                activeAiProvider = 'agent';
            }
            syncSidePaneLayout();
            syncPaneToggleButtons();
            if (agentVisible) {
                localStorage.setItem(activeAiProviderKey, activeAiProvider);
                syncAgentPaneLabels();
                updateAgentWorkspaceLabel();
                await ensureAgentChatListener();
                agentInput?.focus();
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
                case 'lumina_export_pdf':
                    void exportToPdf();
                    break;
                case 'lumina_export_pdf_as':
                    void exportToPdfAs();
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
                case 'lumina_toggle_agent':
                    toggleAgent();
                    break;
            // The single Assistant menu routes to whichever provider is active
            // (Claude gets its own pane; Cursor Agent and Hermes share the Agent pane).
            case 'lumina_ai_context':
                if (activeAiProvider === 'claude') sendClaudeContext();
                else sendAgentContext();
                break;
            case 'lumina_ai_prompts':
                if (activeAiProvider === 'claude') sendClaudePreset();
                else sendAgentPreset();
                break;
            case 'lumina_ai_pull_file':
                if (activeAiProvider === 'claude') pullClaudeWorkspaceFile();
                else pullAgentWorkspaceFile();
                break;
            case 'lumina_ai_apply_clipboard':
                if (activeAiProvider === 'claude') replaceSelectionFromClipboard();
                else void replaceAgentSelectionFromClipboard();
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
        toggleAiBtn?.addEventListener('click', () => toggleActiveAiPane());
        toggleAiBtn?.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            toggleAiPickerMenu();
        });
        toggleAiMenuBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleAiPickerMenu();
        });
        toggleAiMenu?.querySelectorAll('[data-ai-provider]').forEach((item) => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                void setActiveAiProvider(item.dataset.aiProvider);
            });
        });
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
wireAgentInputBar();
agentStopBtn?.addEventListener('click', () => { void stopAgentChat(); });
agentNewBtn?.addEventListener('click', () => { void newAgentChat(); });
agentSendContextBtn?.addEventListener('click', () => { void sendAgentContext(); });
agentPresetsBtn?.addEventListener('click', () => { void sendAgentPreset(); });
agentApplyMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isHidden = agentApplyMenu.classList.toggle('hidden');
    agentApplyMenuBtn.setAttribute('aria-expanded', String(!isHidden));
});
agentPullFileBtn?.addEventListener('click', () => { void pullAgentWorkspaceFile(); });
agentReplaceSelectionBtn?.addEventListener('click', () => { void replaceAgentSelectionFromClipboard(); });
closeAgentBtn?.addEventListener('click', () => toggleAgent(false));
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
agentDevelopLuminaBtn?.addEventListener('click', () => { void toggleDevelopLuminaMode({ pane: 'agent' }); });
claudeRebuildLuminaBtn.addEventListener('click', () => { void rebuildLumina(); });
agentRebuildLuminaBtn?.addEventListener('click', () => { void rebuildLumina(); });
claudeAutoRebuildCheckbox?.addEventListener('change', () => {
    setAutoRebuildLumina(Boolean(claudeAutoRebuildCheckbox.checked));
});
agentAutoRebuildCheckbox?.addEventListener('change', () => {
    setAutoRebuildLumina(Boolean(agentAutoRebuildCheckbox.checked));
});
claudeStopBtn?.addEventListener('click', () => { void stopClaudeChat(); });
// Switching permission mode restarts on the next message; tell the user.
claudeModeSelect?.addEventListener('change', () => {
    if (claudeStarted) {
        void stopClaudeChat().then(() => {
            setUpdateStatus(`Claude permission mode set to ${claudeModeSelect.value}. It applies on your next message.`);
        });
    }
});
async function reloadCurrentFile() {
    if (!currentFilePath) {
        setUpdateStatus('No file to reload.');
        return;
    }
    const path = currentFilePath;
    try {
        const file = await invoke('open_file_path', { path });
        if (file.content === editor.value) {
            currentFileMtime = file.modifiedMs ?? currentFileMtime;
            markDocumentPersisted(editor.value);
            setUpdateStatus('Already up to date with disk.');
            return;
        }
        // The editor differs from disk — confirm before throwing away in-editor
        // edits, since reload is a one-way discard.
        if (!window.confirm(`Reload "${basename(path)}" from disk?\n\nUnsaved changes in the editor will be lost.`)) {
            return;
        }
        hideDocumentAlertBanner();
        currentFileMtime = file.modifiedMs ?? 0;
        setEditorContent(file.content, `Editing: ${file.path}`, file.path);
        markDocumentPersisted(file.content);
        await deleteRecoveryForCurrentFile();
        editor.focus();
        setUpdateStatus(`Reloaded ${basename(path)} from disk.`);
    } catch (error) {
        setUpdateStatus(`Unable to reload ${basename(path)}: ${error?.message || error}`);
    }
}

reloadFileBtn.addEventListener('click', () => {
    void reloadCurrentFile();
});

documentAlertPrimaryBtn?.addEventListener('click', () => {
    if (documentAlertMode === 'disk-changed') {
        if (!window.confirm('Reload from disk and discard your unsaved edits?')) return;
        void applyPendingExternalFile();
        return;
    }
    if (documentAlertMode === 'recovery') {
        void applyPendingRecoverySnapshot();
    }
});

documentAlertSecondaryBtn?.addEventListener('click', () => {
    if (documentAlertMode === 'disk-changed') {
        if (pendingExternalFile?.modifiedMs) {
            currentFileMtime = pendingExternalFile.modifiedMs;
        }
        hideDocumentAlertBanner();
        setUpdateStatus('Kept your in-editor changes.');
        return;
    }
    if (documentAlertMode === 'recovery') {
        void dismissRecoverySnapshot();
    }
});

documentAlertDismissBtn?.addEventListener('click', () => {
    if (documentAlertMode === 'disk-changed' && pendingExternalFile?.modifiedMs) {
        currentFileMtime = pendingExternalFile.modifiedMs;
    }
    hideDocumentAlertBanner();
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
    if (toggleAiMenu && !toggleAiMenu.classList.contains('hidden')) {
        const inPicker = toggleAiMenu.contains(event.target)
            || toggleAiMenuBtn?.contains(event.target)
            || toggleAiBtn?.contains(event.target);
        if (!inPicker) closeAiPickerMenu();
    }
    if (!claudeApplyMenu.classList.contains('hidden')) {
        if (!claudeApplyMenu.contains(event.target) && !claudeApplyMenuBtn.contains(event.target)) {
            claudeApplyMenu.classList.add('hidden');
            claudeApplyMenuBtn.setAttribute('aria-expanded', 'false');
        }
    }
    if (agentApplyMenu && !agentApplyMenu.classList.contains('hidden')) {
        if (!agentApplyMenu.contains(event.target) && !agentApplyMenuBtn.contains(event.target)) {
            agentApplyMenu.classList.add('hidden');
            agentApplyMenuBtn.setAttribute('aria-expanded', 'false');
        }
    }
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
        const sidePaneElements = { terminal: terminalPane, claude: claudePane, agent: agentPane, files: filesPane, git: gitPane };
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
            markEditorVisualLineMapDirty();
            updateEditorMetrics();
            scheduleEditorHistory();
            refreshFindHighlights();
            scheduleInputPreviewRender();
            scheduleDocumentPersistence();
        });

        editor.addEventListener('select', () => {
            if (!findBarVisible || suppressFindSelectHandler) return;
            findMatchIndex = -1;
            updateFindMatchStatus();
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
        let suppressFindSelectHandler = false;
        const findOptions = { caseSensitive: false, wholeWord: false, regex: false };

        function findNeedle() {
            return findInput.value;
        }

        // Build a global RegExp from the needle honoring the active options.
        // Returns null for an empty needle or an invalid user regex.
        function buildFindRegex(needle = findNeedle()) {
            if (!needle) return null;
            let source = findOptions.regex ? needle : escapeRegExp(needle);
            if (findOptions.wholeWord) source = `\\b(?:${source})\\b`;
            const flags = `gm${findOptions.caseSensitive ? '' : 'i'}`;
            try {
                return new RegExp(source, flags);
            } catch (_) {
                return null;
            }
        }

        function escapeRegExp(value) {
            return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function collectFindMatches(needle = findNeedle(), haystack = editor.value) {
            const regex = buildFindRegex(needle);
            if (!regex) return [];

            const matches = [];
            let match;
            // Cap iterations as a guard against pathological regexes on big docs.
            while ((match = regex.exec(haystack)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (match[0].length > 0) {
                    matches.push({ start, end });
                }
                // Always advance to avoid infinite loops on zero-width matches.
                regex.lastIndex = Math.max(end, start + 1);
                if (matches.length > 50000) break;
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

            const containing = matches.findIndex(
                (match) => selectionStart >= match.start && selectionStart <= match.end
            );
            if (containing !== -1) return containing;

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

        function updateFindActiveVisual(hasMatches) {
            editorInputWrap?.classList.toggle(
                'find-active',
                findBarVisible && Boolean(findNeedle()) && hasMatches
            );
        }

        function clearPreviewFindHighlights() {
            preview.querySelectorAll('mark.preview-find-match').forEach((mark) => {
                mark.replaceWith(document.createTextNode(mark.textContent));
            });
            preview.normalize();
        }

        function previewFindSkipsTextNode(node) {
            const parent = node.parentElement;
            if (!parent) return true;
            return Boolean(
                parent.closest('script, style, svg, .katex, mark.preview-find-match')
            );
        }

        function sourceLineAtOffset(offset) {
            return Math.max(0, editor.value.slice(0, offset).split('\n').length - 1);
        }

        function topLevelPreviewChildFor(node) {
            let el = node instanceof Element ? node : node?.parentElement;
            while (el && el.parentElement && el.parentElement !== preview) {
                el = el.parentElement;
            }
            return el?.parentElement === preview ? el : null;
        }

        function previewLineForElement(element) {
            const topLevelChild = topLevelPreviewChildFor(element);
            if (!topLevelChild) return null;

            // previewLineMap now holds two breakpoints per block (top + bottom),
            // so it no longer aligns 1:1 with preview.children. Resolve the block
            // by its vertical offset: the last breakpoint at or above its top is
            // that block's start line.
            const map = previewLineMap;
            if (!map.length) return null;
            const top = topLevelChild.offsetTop;
            let line = null;
            for (const entry of map) {
                if (entry.top <= top + 1) line = entry.line;
                else break;
            }
            return line;
        }

        function scrollPreviewFindMarkIntoView(mark) {
            if (!mark) return;
            const previewRect = preview.getBoundingClientRect();
            const markRect = mark.getBoundingClientRect();
            const offset = markRect.top - previewRect.top + preview.scrollTop;
            const centered = offset - preview.clientHeight / 2 + Math.max(markRect.height, 1) / 2;
            preview.scrollTop = Math.max(
                0,
                Math.min(centered, preview.scrollHeight - preview.clientHeight)
            );
        }

        function markClosestPreviewFindMatch(marks, targetLine) {
            if (!marks.length) return null;
            if (targetLine < 0) return marks[0];

            let bestMark = marks[0];
            let bestDistance = Infinity;
            for (const mark of marks) {
                const blockLine = previewLineForElement(mark);
                if (blockLine == null) continue;
                const distance = Math.abs(blockLine - targetLine);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMark = mark;
                }
            }
            return bestMark;
        }

        function applyPreviewFindHighlights(sourceMatches = collectFindMatches(), currentIndex = findMatchIndex) {
            clearPreviewFindHighlights();
            if (!findBarVisible || !preview) return;

            const needle = findNeedle();
            if (!needle) return;

            const regex = buildFindRegex(needle);
            if (!regex) return;

            const textNodes = [];
            const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (previewFindSkipsTextNode(node)) continue;
                if (node.nodeValue) textNodes.push(node);
            }

            for (const textNode of textNodes) {
                const text = textNode.nodeValue;
                const localRegex = new RegExp(regex.source, regex.flags);
                const parts = [];
                let lastIndex = 0;
                let match;

                while ((match = localRegex.exec(text)) !== null) {
                    const start = match.index;
                    const end = start + match[0].length;
                    if (start > lastIndex) {
                        parts.push({ kind: 'text', value: text.slice(lastIndex, start) });
                    }
                    parts.push({ kind: 'mark', value: match[0] });
                    lastIndex = end;
                    if (match[0].length === 0) {
                        localRegex.lastIndex = Math.max(end, start + 1);
                    }
                }

                if (!parts.length) continue;
                if (lastIndex < text.length) {
                    parts.push({ kind: 'text', value: text.slice(lastIndex) });
                }

                const frag = document.createDocumentFragment();
                for (const part of parts) {
                    if (part.kind === 'text') {
                        frag.appendChild(document.createTextNode(part.value));
                    } else {
                        const mark = document.createElement('mark');
                        mark.className = 'preview-find-match';
                        mark.textContent = part.value;
                        frag.appendChild(mark);
                    }
                }
                textNode.parentNode.replaceChild(frag, textNode);
            }

            const marks = [...preview.querySelectorAll('mark.preview-find-match')];
            if (!marks.length) return;

            const targetLine =
                currentIndex >= 0 && sourceMatches[currentIndex]
                    ? sourceLineAtOffset(sourceMatches[currentIndex].start)
                    : -1;
            const currentMark = markClosestPreviewFindMatch(marks, targetLine);
            currentMark?.classList.add('preview-find-current');
            scrollPreviewFindMarkIntoView(currentMark);
        }

        function updateFindMatchStatus() {
            const needle = findNeedle();
            if (!needle) {
                findMatchStatus.textContent = '';
                findMatchStatus.classList.remove('is-error');
                findInputWrap.classList.remove('is-invalid');
                renderFindHighlights([], -1);
                clearPreviewFindHighlights();
                updateFindActiveVisual(false);
                return;
            }

            if (findOptions.regex && buildFindRegex(needle) === null) {
                findMatchStatus.textContent = 'Bad pattern';
                findMatchStatus.classList.add('is-error');
                findInputWrap.classList.add('is-invalid');
                renderFindHighlights([], -1);
                clearPreviewFindHighlights();
                updateFindActiveVisual(false);
                return;
            }
            findInputWrap.classList.remove('is-invalid');

            const matches = collectFindMatches(needle);
            if (!matches.length) {
                findMatchStatus.textContent = 'No results';
                findMatchStatus.classList.add('is-error');
                renderFindHighlights([], -1);
                clearPreviewFindHighlights();
                updateFindActiveVisual(false);
                return;
            }

            const index = activeFindMatchIndex(matches);
            findMatchIndex = index;
            findMatchStatus.textContent = `${index + 1} of ${matches.length}`;
            findMatchStatus.classList.remove('is-error');
            renderFindHighlights(matches, index);
            applyPreviewFindHighlights(matches, index);
            updateFindActiveVisual(true);
        }

        // VSCode-style "highlight every match" overlay. Rebuilds the mirror
        // layer's HTML with <mark> spans over each match; the current match gets
        // a stronger colour. Kept in sync with the textarea's scroll position.
        function renderFindHighlights(matches, currentIndex) {
            if (!findBarVisible || !matches.length) {
                editorHighlightLayer.textContent = '';
                return;
            }

            const value = editor.value;
            let html = '';
            let cursor = 0;
            for (let i = 0; i < matches.length; i += 1) {
                const { start, end } = matches[i];
                if (start < cursor) continue;
                html += escapeHtml(value.slice(cursor, start));
                const cls = i === currentIndex ? ' class="find-current"' : '';
                html += `<mark${cls}>${escapeHtml(value.slice(start, end))}</mark>`;
                cursor = end;
            }
            html += escapeHtml(value.slice(cursor));
            editorHighlightLayer.innerHTML = html;
            syncHighlightLayerScroll();
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function syncHighlightLayerScroll() {
            editorHighlightLayer.scrollTop = editor.scrollTop;
            editorHighlightLayer.scrollLeft = editor.scrollLeft;
            const scrollbarWidth = Math.max(0, editor.offsetWidth - editor.clientWidth);
            const scrollbarHeight = Math.max(0, editor.offsetHeight - editor.clientHeight);
            editorHighlightLayer.style.paddingRight = scrollbarWidth ? `${scrollbarWidth}px` : '';
            editorHighlightLayer.style.paddingBottom = scrollbarHeight ? `${scrollbarHeight}px` : '';
        }

        function refreshFindHighlights() {
            if (!findBarVisible) {
                editorHighlightLayer.textContent = '';
                return;
            }
            updateFindMatchStatus();
        }

        function shouldFocusEditorForFind() {
            if (!findBarVisible) return true;
            return !isFindReplaceTarget(document.activeElement);
        }

        function scrollEditorMatchIntoView(start, end = start) {
            const style = getComputedStyle(editor);
            const parsedLineHeight = parseFloat(style.lineHeight);
            const lineHeight =
                Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 26;

            const matchTop = measureEditorOffsetTop(start);
            const matchBottom = end > start ? measureEditorOffsetTop(end) : matchTop + lineHeight;
            const matchHeight = Math.max(matchBottom - matchTop, lineHeight);
            const targetTop = matchTop - editor.clientHeight / 2 + matchHeight / 2;
            const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
            editor.scrollTop = Math.min(maxScroll, Math.max(0, targetTop));
            syncHighlightLayerScroll();
            syncPreviewScrollToEditor(start);
        }

        function revealMatchAtCursor({ focusEditor } = {}) {
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

            const index = activeFindMatchIndex(matches);
            return selectFindMatch(matches[index], { focusEditor });
        }

        function selectFindMatch(match, { focusEditor } = {}) {
            if (!match) return false;

            const focus = focusEditor ?? shouldFocusEditorForFind();
            suppressFindSelectHandler = true;
            editor.setSelectionRange(match.start, match.end);
            suppressFindSelectHandler = false;
            if (focus) editor.focus();
            scrollEditorMatchIntoView(match.start, match.end);

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
                    revealMatchAtCursor({ focusEditor: false });
                } else {
                    updateFindMatchStatus();
                }
                requestAnimationFrame(() => refreshFindHighlights());
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
            findInputWrap.classList.remove('is-invalid');
            editorHighlightLayer.textContent = '';
            clearPreviewFindHighlights();
            updateFindActiveVisual(false);
            editor.focus();
        }

        function selectionMatchesFind() {
            const needle = findNeedle();
            if (!needle || editor.selectionStart === editor.selectionEnd) return false;
            const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
            const regex = buildFindRegex(needle);
            if (!regex) return false;
            regex.lastIndex = 0;
            const match = regex.exec(selected);
            return Boolean(match && match.index === 0 && match[0].length === selected.length);
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

            const matches = collectFindMatches(needle);
            if (!matches.length) {
                updateFindMatchStatus();
                return 0;
            }

            let rebuilt = '';
            let lastIndex = 0;
            for (const match of matches) {
                rebuilt += editor.value.slice(lastIndex, match.start) + replacement;
                lastIndex = match.end;
            }
            rebuilt += editor.value.slice(lastIndex);

            pushEditorHistory();
            editor.value = rebuilt;
            editor.setSelectionRange(0, 0);
            pushEditorHistory();
            schedulePreviewUpdate();
            findMatchIndex = -1;
            updateFindMatchStatus();
            return matches.length;
        }

        function syncFindOptionButtons() {
            findOptCaseBtn.setAttribute('aria-pressed', String(findOptions.caseSensitive));
            findOptWordBtn.setAttribute('aria-pressed', String(findOptions.wholeWord));
            findOptRegexBtn.setAttribute('aria-pressed', String(findOptions.regex));
        }

        function toggleFindOption(optionKey) {
            findOptions[optionKey] = !findOptions[optionKey];
            syncFindOptionButtons();
            findMatchIndex = -1;
            if (findNeedle()) {
                revealMatchAtCursor({ focusEditor: false });
            } else {
                updateFindMatchStatus();
            }
        }

        function isFindReplaceTarget(target) {
            return (
                target === findInput ||
                target === replaceInput ||
                target === findNextBtn ||
                target === findPrevBtn ||
                target === replaceBtn ||
                target === replaceAllBtn ||
                target === findReplaceCloseBtn ||
                target === findOptCaseBtn ||
                target === findOptWordBtn ||
                target === findOptRegexBtn
            );
        }

        findInput.addEventListener('input', () => {
            if (suppressFindInputHandler) return;
            findMatchIndex = -1;
            if (findInput.value) {
                revealMatchAtCursor({ focusEditor: false });
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

        findOptCaseBtn.addEventListener('click', () => {
            toggleFindOption('caseSensitive');
            findInput.focus();
        });
        findOptWordBtn.addEventListener('click', () => {
            toggleFindOption('wholeWord');
            findInput.focus();
        });
        findOptRegexBtn.addEventListener('click', () => {
            toggleFindOption('regex');
            findInput.focus();
        });
        syncFindOptionButtons();

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

            if (mod && event.altKey && findBarVisible) {
                const optionKey = { c: 'caseSensitive', w: 'wholeWord', r: 'regex' }[
                    event.key.toLowerCase()
                ];
                if (optionKey) {
                    event.preventDefault();
                    toggleFindOption(optionKey);
                    findInput.focus();
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
            stopFilePoll();
            fileChangedUnlisten?.();
            terminalOutputUnlisten?.();
            sourceWatchUnlisten?.();
            invoke('unwatch_source_checkout').catch(() => {});
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
                syncHighlightLayerScroll();
                if (editorScrollSyncFrame != null) return;
                editorScrollSyncFrame = requestAnimationFrame(() => {
                    editorScrollSyncFrame = null;
                    // Skip the resync while a debounced preview render is pending: it's
                    // the auto-scroll-while-typing case, rebuilding the visual line map
                    // here would force a full-document reflow on every keystroke that
                    // scrolls. executePreviewRender() calls syncPreviewScrollToEditor()
                    // itself once the pending render actually runs.
                    if (previewInputDebounceTimer != null || previewInputIdleHandle != null) return;
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

                await maybeOfferUntitledRecovery();
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

        window.addEventListener('blur', () => {
            void flushDocumentPersistence();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                void flushDocumentPersistence();
            }
        });
        window.addEventListener('beforeunload', () => {
            void flushDocumentPersistence();
        });
