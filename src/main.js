        import exampleMarkdown from './example.md?raw';
        import { invoke } from '@tauri-apps/api/core';
        import { listen } from '@tauri-apps/api/event';
        import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { compareVersions, parseVersion, selectLatestUpdateTag } from './update.js';
        import {
            createInstallProgressState,
            formatInstallProgressSubtitle,
            formatInstallProgressTitle,
            processInstallProgressLine
        } from './installProgressParse.js';
        import { Terminal } from '@xterm/xterm';
        import { FitAddon } from '@xterm/addon-fit';
        import '@xterm/xterm/css/xterm.css';

        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const charCount = document.getElementById('char-count');
        const fileInput = document.getElementById('file-input');
        const filenameDisplay = document.getElementById('filename-display');
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
        const editorContainer = document.querySelector('.editor-container');
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');
        const paneResizer = document.getElementById('pane-resizer');
        let mermaidInitialized = false;
        let sourceCollapsed = false;
        let isResizing = false;
        let terminal = null;
        let fitAddon = null;
        let terminalVisible = false;
        let terminalStarted = false;
        let terminalOutputUnlisten = null;
        let terminalResizeFrame = null;
        let terminalInputBuffer = '';
        let terminalPtyHangupUnlisten = null;
        let terminalShellRespawnPromise = null;
        let installProgressTracking = false;
        let installProgressState = null;
        let installProgressLineBuffer = '';
        let installProgressEndTimer = null;
        let claudeTerminal = null;
        let claudeFitAddon = null;
        let claudeVisible = false;
        let claudeStarted = false;
        let claudeOutputUnlisten = null;
        let claudeResizeFrame = null;
let claudeWorkspaceFilePath = null;
        let latestReleaseTag = null;
        let updateCheckInProgress = false;
        let currentCheckoutInstallCommand = null;
        let currentFilePath = null;
        const lastOpenedFilePathKey = 'lumina:last-opened-file-path';
const recentFilePathsKey = 'lumina:recent-file-paths';
const maxRecentFilePaths = 10;
        const releaseApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/releases/latest';
        const tagsApiUrl = 'https://api.github.com/repos/DoctorKhan/Lumina/tags?per_page=100';
        const publicInstallerUrl = 'https://raw.githubusercontent.com/DoctorKhan/Lumina/main/install.sh';
const currentVersion = appVersionBadge.textContent.trim().replace(/^v/i, '');

        marked.setOptions({
            // Keep default markdown line-break behavior so multiline KaTeX
            // blocks are not split by injected <br> nodes.
            breaks: false,
            gfm: true
        });

        const renderer = new marked.Renderer();
        renderer.code = (code, infostring) => {
            const language = (infostring || '').trim().toLowerCase();
            if (language === 'mermaid') {
                return `<pre class="mermaid">${code}</pre>`;
            }
            const escapedCode = code
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;');
            const className = language ? `language-${language}` : '';
            return `<pre><code class="${className}">${escapedCode}</code></pre>`;
        };
        marked.use({ renderer });

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

        function schedulePreviewUpdate() {
            preview.innerHTML = '<p class="text-slate-500">Rendering preview...</p>';
            requestAnimationFrame(() => {
                updatePreview();
            });
        }

        function setEditorContent(content, label) {
            editor.value = content;
            filenameDisplay.textContent = label;
            charCount.textContent = `${content.length} chars`;
            resetEditorHistory();
            schedulePreviewUpdate();
        }

        function loadExampleGuide() {
            currentFilePath = null;
            setEditorContent(exampleMarkdown, 'Example Guide (Lumina Help)');
            filenameDisplay.title = 'Bundled Lumina example guide';
            setUpdateStatus('Loaded the Lumina example guide.');
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

async function openFilePath(path) {
    filenameDisplay.textContent = `Opening: ${path}`;
    filenameDisplay.title = path;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const file = await invoke('open_file_path', { path });
    setEditorContent(file.content, `Editing: ${file.path}`);
    filenameDisplay.title = file.path;
    rememberOpenedPath(file.path);
    editor.focus();
}

async function flushPendingOpenPathsFromBackend() {
    let paths;
    try {
        paths = await invoke('drain_pending_open_paths');
    } catch (error) {
        setUpdateStatus(`Unable to read pending files: ${error?.message || error}`);
        return;
    }

    if (!Array.isArray(paths) || paths.length === 0) {
        return;
    }

    for (const path of paths) {
        try {
            await openFilePath(path);
        } catch (error) {
            setUpdateStatus(`Unable to open ${path}: ${error?.message || error}`);
        }
    }
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
        filenameDisplay.textContent = 'Editor (Markdown + LaTeX)';
        filenameDisplay.title = '';
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
        filenameDisplay.textContent = 'Editor (Markdown + LaTeX)';
        filenameDisplay.title = '';
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
                filenameDisplay.textContent = 'Editor (Markdown + LaTeX)';
                filenameDisplay.title = '';
                setUpdateStatus(`Open failed: ${error?.message || error}`);
                fileInput.click();
            }
        }

        function highlightCodeBlocks() {
            const blocks = preview.querySelectorAll('pre code:not(.language-mermaid)');
            blocks.forEach((block) => hljs.highlightElement(block));
        }

        async function renderMermaidBlocks() {
            const blocks = preview.querySelectorAll('pre.mermaid');
            if (blocks.length === 0) return;

            if (!mermaidInitialized) {
                mermaid.initialize({
                    startOnLoad: false,
                    securityLevel: 'loose',
                    theme: 'base',
                    flowchart: {
                        curve: 'basis',
                        htmlLabels: true,
                        padding: 24,
                        nodeSpacing: 56,
                        rankSpacing: 64
                    },
                    themeVariables: {
                        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                        primaryColor: '#eef2ff',
                        primaryTextColor: '#1e293b',
                        primaryBorderColor: '#6366f1',
                        lineColor: '#64748b',
                        secondaryColor: '#e0f2fe',
                        tertiaryColor: '#f8fafc',
                        clusterBkg: '#f8fafc',
                        clusterBorder: '#cbd5e1',
                        edgeLabelBackground: '#ffffff'
                    }
                });
                mermaidInitialized = true;
            }

            if (document.fonts?.ready) {
                await document.fonts.ready;
            }

            for (const block of blocks) {
                const source = block.textContent || '';
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                try {
                    const { svg } = await mermaid.render(id, source);
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mermaid';
                    wrapper.innerHTML = svg;
                    block.replaceWith(wrapper);
                } catch (error) {
                    const fallback = document.createElement('pre');
                    fallback.className = 'bg-rose-50 text-rose-700 p-3 rounded';
                    fallback.textContent = `Mermaid render error:\n${error?.message || String(error)}`;
                    block.replaceWith(fallback);
                }
            }
        }

        function looksLikeLatexBlock(lines) {
            const body = lines.join('\n').trim();
            if (!body) return false;

            // Heuristic signals for math/LaTeX content.
            return /\\[a-zA-Z]+/.test(body) ||          // \frac, \begin, \sum, ...
                /[_^]/.test(body) ||                    // x_i, x^2
                /\{.*\}/.test(body) ||                  // grouped LaTeX terms
                /\\begin\{.*\}|\\end\{.*\}/.test(body) ||
                /\\\\/.test(body) ||                    // line breaks in cases/aligned
                /\b(min|max|sin|cos|log)\b/.test(body); // common math tokens
        }

        function normalizeMathBlocks(input) {
            // Detect standalone bracket blocks that are likely LaTeX and
            // convert only those to $$...$$. Leaves non-math brackets unchanged.
            const lines = input.split('\n');
            const output = [];
            let inCodeFence = false;
            let bracketStart = -1;
            let bracketBody = [];

            for (const line of lines) {
                const trimmed = line.trim();

                if (trimmed.startsWith('```')) {
                    if (bracketStart !== -1) {
                        output.push('[');
                        output.push(...bracketBody);
                        bracketStart = -1;
                        bracketBody = [];
                    }
                    inCodeFence = !inCodeFence;
                    output.push(line);
                    continue;
                }

                if (inCodeFence) {
                    output.push(line);
                    continue;
                }

                if (bracketStart === -1 && trimmed === '[') {
                    bracketStart = output.length;
                    bracketBody = [];
                    continue;
                }

                if (bracketStart !== -1 && trimmed === ']') {
                    if (looksLikeLatexBlock(bracketBody)) {
                        output.push('$$');
                        output.push(...bracketBody);
                        output.push('$$');
                    } else {
                        output.push('[');
                        output.push(...bracketBody);
                        output.push(']');
                    }
                    bracketStart = -1;
                    bracketBody = [];
                    continue;
                }

                if (bracketStart !== -1) {
                    bracketBody.push(line);
                    continue;
                }

                output.push(line);
            }

            // Unclosed bracket block: keep original text verbatim.
            if (bracketStart !== -1) {
                output.push('[');
                output.push(...bracketBody);
            }

            return output.join('\n');
        }

        function normalizeEscapedLatexDelimiters(input) {
            // Convert escaped LaTeX delimiters into dollar delimiters before
            // Markdown parsing, so marked does not swallow the backslashes.
            // Display math: \[ ... \] -> $$ ... $$
            let output = input.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => {
                return `$$\n${expr.trim()}\n$$`;
            });

            // Inline math: \( ... \) -> $ ... $
            output = output.replace(/\\\((.*?)\\\)/g, (_, expr) => {
                return `$${expr.trim()}$`;
            });

            return output;
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

        async function updatePreview() {
            const rawValue = editor.value;
            const wordCount = rawValue.trim() ? rawValue.trim().split(/\s+/).length : 0;
            charCount.textContent = `${rawValue.length} chars • ${wordCount} words`;
            const normalizedValue = normalizeEscapedLatexDelimiters(
                normalizeMathBlocks(rawValue)
            );
            preview.innerHTML = marked.parse(normalizedValue);
            applySmartOutlineStyles();
            highlightCodeBlocks();
            await renderMermaidBlocks();

            renderMathInElement(preview, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
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
                filenameDisplay.textContent = `Editing: ${file.path}`;
                filenameDisplay.title = file.path;
                setUpdateStatus('Saved.');
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
                filenameDisplay.textContent = `Editing: ${file.path}`;
                filenameDisplay.title = file.path;
                rememberOpenedPath(file.path);
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
            installProgressTracking = true;
            installProgressState = createInstallProgressState();
            installProgressLineBuffer = '';
            updateStatus.classList.add('hidden');
            installProgressRoot.classList.remove('hidden');
            installProgressFill.style.width = '0%';
            if (installProgressPercent) {
                installProgressPercent.textContent = '—';
            }
            installProgressDetail.textContent = 'Waiting for the installer in the terminal…';
            installProgressDetail.title = '';
        }

        function endInstallProgressSession() {
            clearTimeout(installProgressEndTimer);
            installProgressEndTimer = null;
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
                setUpdateStatus(
                    'Update install finished. Check the terminal, then relaunch the app if a new /Applications build was created.'
                );
            }, 4500);
        }

        function syncInstallProgressView() {
            if (!installProgressState) {
                return;
            }
            const s = installProgressState;
            const w = s.percent == null ? 0 : s.percent;
            installProgressFill.style.width = `${Math.min(100, w)}%`;
            if (installProgressPercent) {
                installProgressPercent.textContent = s.percent != null ? `${s.percent}%` : '—';
            }
            const subtitle = formatInstallProgressSubtitle(s);
            const full = formatInstallProgressTitle(s);
            installProgressDetail.textContent = subtitle;
            installProgressDetail.title = full;
        }

        function feedInstallProgressFromTerminal(raw) {
            if (!installProgressTracking || !installProgressState) {
                return;
            }
            installProgressLineBuffer += raw;
            const parts = installProgressLineBuffer.split(/\r\n|\n|\r/);
            installProgressLineBuffer = parts.pop() || '';
            for (const part of parts) {
                const { changed, done } = processInstallProgressLine(installProgressState, part);
                if (changed || done) {
                    syncInstallProgressView();
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
                } catch (e) {
                    terminalStarted = false;
                    const msg = e?.message || String(e);
                    terminal?.write(`\r\n\x1b[31mFailed to start shell: ${msg}\x1b[0m\r\n`);
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
            terminal?.scrollToBottom();

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

        async function openClickedTerminalFile(path) {
            const cleanPath = cleanTerminalPath(path);
            if (!cleanPath) return;

            try {
                filenameDisplay.textContent = `Opening: ${cleanPath}`;
                filenameDisplay.title = cleanPath;
                await new Promise((resolve) => setTimeout(resolve, 0));
                const file = await invoke('open_file_path', { path: cleanPath });
                setEditorContent(file.content, `Editing: ${file.path}`);
                filenameDisplay.title = file.path;
                rememberOpenedPath(file.path);
                editor.focus();
            } catch (error) {
                filenameDisplay.textContent = 'Editor (Markdown + LaTeX)';
                filenameDisplay.title = '';
                terminal?.write(`\r\nUnable to open ${cleanPath}: ${error}\r\n`);
            }
        }

        function activateTerminalFileLink(event, path) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            setTimeout(() => {
                openClickedTerminalFile(path).catch((error) => {
                    terminal?.write(`\r\nUnable to open ${path}: ${error}\r\n`);
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

        function applyTerminalFit() {
            if (!terminalVisible || !fitAddon || !terminal) return;
            fitAddon.fit();
            invoke('terminal_resize', {
                cols: terminal.cols,
                rows: terminal.rows
            }).catch(() => {});
        }

        function applyClaudeFit() {
            if (!claudeVisible || !claudeFitAddon || !claudeTerminal) return;
            claudeFitAddon.fit();
            invoke('claude_resize', {
                cols: claudeTerminal.cols,
                rows: claudeTerminal.rows
            }).catch(() => {});
        }

        function resizeTerminal() {
            if (!terminalVisible || !terminal || !fitAddon) return;

            cancelAnimationFrame(terminalResizeFrame);
            terminalResizeFrame = requestAnimationFrame(() => {
                applyTerminalFit();
                // xterm’s FitAddon reads parent size; a second pass runs after this pane’s flex layout is final.
                requestAnimationFrame(applyTerminalFit);
            });
        }

        function resizeClaude() {
            if (!claudeVisible || !claudeTerminal || !claudeFitAddon) return;

            cancelAnimationFrame(claudeResizeFrame);
            claudeResizeFrame = requestAnimationFrame(() => {
                applyClaudeFit();
                requestAnimationFrame(applyClaudeFit);
            });
        }

        function resizeTerminals() {
            resizeTerminal();
            resizeClaude();
        }

async function writeClaudePrompt(prompt) {
    await toggleClaude(true);
    if (!claudeStarted) return;

    claudeTerminal?.write(`\r\nSending prompt to Claude...\r\n`);
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
                });
            });

            if (terminalPtyHangupUnlisten == null) {
                terminalPtyHangupUnlisten = await listen('terminal-pty-hangup', () => {
                    void respawnShellProcess();
                });
            }

            terminalStatus.textContent = 'Starting';
            terminal.write('Starting shell...\r\n');
            terminalOutputUnlisten = await listen('terminal-output', (event) => {
                const payload = event.payload;
                feedInstallProgressFromTerminal(payload);
                terminal.write(payload);
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
                });
            });

            claudeStatus.textContent = 'Starting';
            claudeTerminal.write('Starting Claude...\r\n');
            claudeOutputUnlisten = await listen('claude-output', (event) => {
                claudeTerminal.write(event.payload);
            });

            claudeFitAddon.fit();
            if (currentFilePath) {
                const directory = currentFileDirectory();
                const accessMessage = `Claude will open this file's folder so it can read and edit the current document:\r\n${directory}\r\nIf macOS asks for folder access, it is for this Claude editing session.\r\n`;
                claudeTerminal.write(accessMessage);
                setUpdateStatus(`Claude may ask macOS for access to ${directory}.`);
                claudeTerminal.write(`Saving and opening Claude in the file directory:\r\n${currentFilePath}\r\n`);
                await invoke('write_document', {
                    path: currentFilePath,
                    content: editor.value
                });
            } else {
                claudeTerminal.write('No saved file path is open; starting Claude in the current terminal directory.\r\n');
            }
            const workspaceInfo = await invoke('claude_spawn', {
                cols: claudeTerminal.cols,
                rows: claudeTerminal.rows,
                filePath: currentFilePath,
                cwd: currentFileDirectory()
            });
            claudeWorkspaceFilePath = workspaceInfo?.filePath || currentFilePath;
            claudeWorkspaceStatus.textContent = claudeWorkspaceFilePath
            ? `Editing ${basename(claudeWorkspaceFilePath)}`
            : 'Using terminal directory';
        claudeWorkspaceStatus.title = claudeWorkspaceFilePath || 'Claude is using the current terminal directory';
            claudeStarted = true;
            claudeStatus.textContent = 'Running';
            resizeClaude();
            setTimeout(resizeClaude, 80);
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
            toggleSourceBtn.title = sourceCollapsed ? 'Show source pane' : 'Hide source pane';
            toggleTerminalBtn.title = terminalVisible ? 'Hide terminal' : 'Show terminal';
            toggleClaudeBtn.title = claudeVisible ? 'Hide Claude' : 'Show Claude';
            syncAppMenu();
        }

        async function toggleTerminal(forceVisible) {
            terminalVisible = typeof forceVisible === 'boolean' ? forceVisible : !terminalVisible;
            terminalPane.classList.toggle('hidden', !terminalVisible);
            syncPaneToggleButtons();

            if (terminalVisible) {
                try {
                    await ensureTerminal();
                    resizeTerminal();
                    terminal.focus();
                } catch (error) {
                    terminalStatus.textContent = 'Error';
                    terminal?.write(`\r\nTerminal failed to start: ${error}\r\n`);
                }
            }
        }

        async function toggleClaude(forceVisible) {
            claudeVisible = typeof forceVisible === 'boolean' ? forceVisible : !claudeVisible;
            claudePane.classList.toggle('hidden', !claudeVisible);
            syncPaneToggleButtons();

            if (claudeVisible) {
                try {
                    await ensureClaude();
                    resizeClaude();
                    claudeTerminal.focus();
                } catch (error) {
                    claudeStatus.textContent = 'Error';
                    claudeTerminal?.write(`\r\nClaude failed to start: ${error}\r\n`);
                }
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
        flushPendingOpenPathsFromBackend();
        syncAppMenu();
installUpdateBadge.addEventListener('click', installDetectedUpdate);
        toggleSourceBtn.addEventListener('click', toggleSource);
        toggleTerminalBtn.addEventListener('click', () => toggleTerminal());
        toggleClaudeBtn.addEventListener('click', () => toggleClaude());
claudeSendContextBtn.addEventListener('click', () => sendClaudeContext());
claudePresetsBtn.addEventListener('click', sendClaudePreset);
claudeApplyMenuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isHidden = claudeApplyMenu.classList.toggle('hidden');
    claudeApplyMenuBtn.setAttribute('aria-expanded', String(!isHidden));
});
claudePullFileBtn.addEventListener('click', pullClaudeWorkspaceFile);
claudeReplaceSelectionBtn.addEventListener('click', replaceSelectionFromClipboard);
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
            if (!isResizing) return;
            isResizing = false;
            paneResizer.classList.remove('dragging');
            document.body.style.userSelect = '';
        });

        document.addEventListener('mousemove', (event) => {
            if (!isResizing || sourceCollapsed) return;
            const rect = editorContainer.getBoundingClientRect();
            const rawPercent = ((event.clientX - rect.left) / rect.width) * 100;
            const editorPercent = Math.min(80, Math.max(20, rawPercent));
            const previewPercent = 100 - editorPercent;
            editorPane.style.flex = `0 0 ${editorPercent}%`;
            previewPane.style.flex = `0 0 ${previewPercent}%`;
            resizeTerminals();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                currentFilePath = null;
                editor.value = event.target.result;
                filenameDisplay.textContent = `Editing: ${file.name}`;
                filenameDisplay.title = '';
                resetEditorHistory();
                updatePreview();
            };
            reader.readAsText(file);
        });

        let timeout = null;
        editor.addEventListener('input', () => {
            scheduleEditorHistory();
            clearTimeout(timeout);
            timeout = setTimeout(updatePreview, 50);
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
            const mod = event.metaKey || event.ctrlKey;
            if (!mod) return;

            if (event.key.toLowerCase() === 'z' && document.activeElement === editor) {
                event.preventDefault();
                if (event.shiftKey) {
                    redoEditor();
                } else {
                    undoEditor();
                }
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

        editor.onscroll = function () {
            const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
            preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight);
        };

        async function loadInitialContent() {
            const params = new URLSearchParams(window.location.search);
            const fileParam = params.get('file');
            const fileDisplayName = params.get('name');

            if (!fileParam) {
        if (await openLastOpenedFile()) {
            return;
                }

                updatePreview();
                return;
            }

            try {
                const response = await fetch(fileParam, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to load ${fileParam}`);
                }

                const text = await response.text();
                const displayName = fileDisplayName || fileParam;
                setEditorContent(text, `Editing: ${displayName}`);
                currentFilePath = null;
                filenameDisplay.title = displayName;
            } catch (_) {
                updatePreview();
            }
        }

        loadInitialContent();
        loadCurrentCheckoutInstaller();
if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
        checkForUpdate({ background: true });
    }, { timeout: 10000 });
} else {
    queueMicrotask(() => {
        checkForUpdate({ background: true });
    });
}
