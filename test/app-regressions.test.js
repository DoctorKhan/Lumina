import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Help menu exposes the bundled example guide as Lumina Help", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /MENU_OPEN_EXAMPLE_GUIDE/);
  assert.match(rust, /Lumina Help/);
  assert.match(main, /case 'lumina_open_example_guide':/);
  assert.match(main, /loadExampleGuide\(\)/);
});

test("Lumina on GitHub uses the native external URL command", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="share-repo-link"/);
  assert.match(html, /https:\/\/github\.com\/DoctorKhan\/Lumina/);
  assert.match(rust, /Lumina on GitHub/);
  assert.match(rust, /fn open_external_url/);
  assert.match(rust, /https:\/\/github\.com\/DoctorKhan\/Lumina/);
  assert.match(main, /const repoUrl = 'https:\/\/github\.com\/DoctorKhan\/Lumina'/);
  assert.match(main, /invoke\('open_external_url', \{ url: repoUrl \}/);
  assert.match(main, /window\.open\(repoUrl/);
});

test("app menu sync and native save are wired for standard File menu", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /fn sync_app_menu/);
  assert.match(rust, /fn write_document/);
  assert.match(rust, /CheckMenuItemBuilder/);
  assert.match(rust, /MENU_NEW_FILE/);
  assert.match(main, /invoke\('sync_app_menu',\s*\{\s*params:\s*\{/);
  assert.match(main, /'lumina_new_file'/);
  assert.match(main, /'lumina_save'/);
  assert.match(main, /'lumina_save_as'/);
});

test("PDF export avoids the native print panel and times out hung renderers", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.doesNotMatch(main, /window\.print\(/);
  assert.match(main, /await exportToPdfAs\(\)/);
  assert.match(main, /Export to PDF failed:/);
  assert.match(rust, /PDF_RENDER_TIMEOUT/);
  assert.match(rust, /\.spawn\(\)/);
  assert.match(rust, /try_wait\(\)/);
  assert.match(rust, /child\.kill\(\)/);
  assert.match(rust, /PDF renderer timed out/);
});

test("CLI and Open With pass file paths into the editor via pending open queue", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(rust, /RunEvent::Opened/);
  assert.match(rust, /fn drain_pending_open_paths/);
  assert.match(main, /invoke\('drain_pending_open_paths'/);
  assert.match(main, /listen\('lumina-pending-open-files'/);
});

test("startup update check is quiet and exposes an install badge", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const capabilities = fs.readFileSync("src-tauri/capabilities/default.json", "utf8");

  assert.match(main, /from '@tauri-apps\/plugin-process'/);
  assert.match(main, /\brelaunch\b/);
  assert.match(capabilities, /"process:default"/);
  assert.match(html, /id="install-update-badge"/);
  assert.match(main, /checkForUpdate\(\{ background = false, force = false \} = \{\}\)/);
  assert.match(main, /checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /runUpdateCheckFromMenu/);
  assert.match(main, /runInstallUpdateFromMenu/);
  assert.match(rust, /emit_lumina_menu_command/);
  assert.match(main, /handleVersionBadgeClick/);
  const versionBadgeClickFn = main.match(/async function handleVersionBadgeClick\(\) \{[\s\S]*?\n\s*\}/);
  assert.ok(versionBadgeClickFn, 'handleVersionBadgeClick should be defined');
  assert.doesNotMatch(versionBadgeClickFn[0], /installDetectedUpdate/);
  assert.match(main, /latest_lumina_repo_tag/);
  assert.match(main, /resolveLatestUpdateTag/);
  assert.match(html, /id="app-version-badge"/);
  assert.match(css, /\.app-version-badge/);
  assert.match(rust, /fn latest_lumina_repo_tag/);
  assert.match(main, /getVersion/);
  assert.match(main, /refreshAppVersionBadge/);
  assert.match(main, /void bootstrap\(\)/);
  assert.match(main, /requestIdleCallback/);
  assert.doesNotMatch(main, /setTimeout\(\(\) => \{\s*checkForUpdate\(\{ background: true \}\)/);
  assert.match(main, /appVersionBadge\.addEventListener\('click'/);
  assert.match(main, /installUpdateBadge\.addEventListener\('click', installDetectedUpdate\)/);
  assert.match(main, /showInstallUpdateBadge\(latestTag\)/);
  assert.match(main, /isInstallableFromGitHub\(latestTag, currentVersion\)/);
  assert.match(main, /Latest \$\{source\} is \$\{latestTag\}; click Install to rebuild from GitHub\./);
  assert.match(html, /id="install-progress"/);
  assert.match(main, /feedInstallProgressFromTerminal/);
  assert.match(main, /trackInstallProgress: true/);
});

test("install.sh force-fetches managed checkout so rewritten tags do not abort", () => {
  const install = fs.readFileSync("install.sh", "utf8");
  assert.match(install, /fetch_managed_checkout\(\)/);
  assert.match(install, /fetch --all --force --tags --prune --progress/);
  assert.doesNotMatch(install, /git -C "\$INSTALL_DIR" fetch --all --tags --progress/);
  assert.doesNotMatch(install, /git fetch --all --tags --progress/);
});

test("macOS folder permission prompts explain Claude and file access", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  // Only the standard user folders a Markdown editor actually reaches into.
  for (const key of [
    "NSDesktopFolderUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
  ]) {
    assert.match(plist, new RegExp(`<key>${key}</key>`));
  }

  // Network/removable volumes are intentionally NOT declared: they prompted for
  // access most users never need. Re-add only if a real network/USB flow exists.
  for (const key of [
    "NSNetworkVolumesUsageDescription",
    "NSRemovableVolumesUsageDescription",
  ]) {
    assert.doesNotMatch(plist, new RegExp(`<key>${key}</key>`));
  }

  assert.match(plist, /Claude pane edits the current file's folder/);
  // The chat pane starts Claude in the open file's folder and tells the user it
  // can read/edit there (folder access is requested on first read/write).
  assert.match(main, /Claude can read and edit files in \$\{directory\}/);
});

test("macOS bundle plist does not request legacy Carbon launch mode", () => {
  const plist = fs.readFileSync("src-tauri/Info.plist", "utf8");

  assert.match(plist, /<key>LSRequiresCarbon<\/key>\s*<false\/>/);
  assert.doesNotMatch(plist, /<key>LSRequiresCarbon<\/key>\s*<true\/>/);
});

test("app top chrome and pane layout are locked in app CSS, not only Tailwind", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");

  assert.match(css, /html\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /body > header/);
  assert.match(css, /body > header[^}]*flex:\s*0 0 auto/);
  assert.match(css, /body > header[^}]*min-height:\s*4rem/);
  assert.match(css, /max-height:\s*100dvh/);
  assert.match(css, /\.editor-container[^}]*overflow:\s*hidden/);
  assert.match(css, /\.workspace-panes[^}]*min-height:\s*0/);
});

test("editor metadata bar leads with the filename, then dimmed dir, with toast and path navigator", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(html, /filename-display-wrap/);
  assert.match(html, /id="filename-name"/);
  assert.match(html, /id="filename-dir"/);
  assert.match(html, /id="filename-copy-btn"/);
  assert.match(html, /id="filename-path-input"/);
  assert.match(html, /id="filename-path-toast"/);
  // Filename leads bold and never shrinks; the directory is what truncates.
  assert.match(css, /\.filename-name\s*\{[\s\S]*flex:\s*0 0 auto;/);
  assert.match(css, /\.filename-dir\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(css, /\.filename-path-toast\s*\{[\s\S]*word-break:\s*break-all;/);
  assert.match(css, /\.filename-display-btn\s*\{[\s\S]*text-transform:\s*none;/);
  assert.match(main, /filenameName\.textContent = basename\(path\)/);
  assert.match(main, /function openFilenamePathNavigator/);
  assert.match(main, /complete_file_path/);
  assert.match(main, /showFilenamePathToast/);
  assert.match(rust, /fn complete_file_path/);
});

test("terminal and Claude share a resizable right-side rail", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

  assert.match(html, /id="workspace-panes"/);
  assert.match(html, /id="side-pane-resizer"/);
  assert.match(html, /id="side-pane"[\s\S]*id="terminal-pane"[\s\S]*id="claude-pane"[\s\S]*id="agent-pane"/);
  assert.match(html, /id="toggle-ai-btn"/);
  assert.match(html, /id="toggle-ai-menu"/);
  assert.match(main, /function setActiveAiProvider\(/);
  assert.match(main, /function toggleActiveAiPane\(/);
  assert.match(main, /cursor-agent-chat/);
  assert.match(main, /reduceAgentChatEvent/);
  assert.match(rust, /cursor_agent_send/);
  assert.match(rust, /--continue/);
  assert.match(main, /case 'lumina_toggle_agent':/);
  // One "Assistant" menu serves Claude, Cursor Agent, and Hermes; the webview
  // routes each action to the active provider.
  assert.match(rust, /SubmenuBuilder::new\(manager, "Assistant"\)/);
  assert.match(main, /case 'lumina_ai_context':/);
  assert.doesNotMatch(rust, /lumina_claude_context|lumina_agent_context/);
  assert.match(main, /submitAgentMessage/);
  assert.match(css, /\.side-pane\s*\{[\s\S]*flex:\s*0 0 34%;[\s\S]*min-width:/);
  assert.match(css, /\.side-pane-split \.terminal-pane\s*\{[\s\S]*flex-basis:\s*50%;/);
  assert.match(css, /\.editor-collapsed #pane-resizer/);
  assert.match(main, /function syncSidePaneLayout\(\)/);
  // Hermes rides the same Agent pane as Cursor Agent, selected from the AI menu,
  // and is the default assistant when no last-used choice is stored.
  assert.match(html, /data-ai-provider="hermes"/);
  assert.match(main, /storedAiProvider === 'agent' \|\| storedAiProvider === 'claude' \? storedAiProvider : 'hermes'/);
  assert.match(html, /id="agent-provider-name"/);
  assert.match(main, /function isAgentPaneProvider\(/);
  assert.match(main, /function syncAgentPaneLabels\(/);
  assert.match(main, /type: 'plain_text'/);
  assert.match(rust, /Command::new\("hermes"\)/);
  assert.match(main, /sidePane\.classList\.toggle\('side-pane-split', visibleCount > 1\)/);
  assert.match(main, /sidePanePercent = Math\.min\(65, Math\.max\(24, rawPercent\)\)/);
  assert.match(main, /editorPane\.style\.flex = `1 1 \$\{editorPercent\}%`/);
  assert.match(html, /id="terminal-tab-bar"/);
  assert.match(html, /id="terminal-new-tab-btn"/);
  assert.match(html, /id="terminal-host"/);
  assert.match(main, /createTerminalTab\(/);
  assert.match(main, /runCommandInTerminal\([\s\S]*createTerminalTab/);
  assert.match(main, /tab\.lastFitCols/);
  assert.match(main, /tab\.terminal\.cols === tab\.lastFitCols && tab\.terminal\.rows === tab\.lastFitRows/);
  assert.match(main, /resizeTerminals\(\{ settle: false \}\)/);
  assert.match(main, /sidePaneResizer\?\.addEventListener/);
  assert.match(main, /\(workspacePanes \|\| editorContainer\)\.getBoundingClientRect\(\)/);
});

test("editor find and replace is wired with hotkeys and Edit menu items", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="find-replace-bar"/);
  assert.match(html, /id="find-input"/);
  assert.match(html, /id="replace-input"/);
  assert.match(rust, /MENU_FIND/);
  assert.match(rust, /MENU_FIND_REPLACE/);
  assert.match(rust, /Find…/);
  assert.match(rust, /Find and Replace…/);
  assert.match(rust, /CmdOrCtrl\+F/);
  assert.match(rust, /CmdOrCtrl\+Alt\+F/);
  assert.match(main, /function openFindBar/);
  assert.match(main, /function replaceAllMatches/);
  assert.match(main, /function expandReplaceText/);
  assert.match(main, /function syncFindReplaceRowVisibility/);
  assert.match(html, /id="find-replace-toggle-btn"/);
  assert.match(main, /case 'lumina_find':/);
  assert.match(main, /case 'lumina_find_replace':/);
  assert.match(main, /event\.key\.toLowerCase\(\) === 'f'/);
  assert.match(main, /event\.key\.toLowerCase\(\) === 'g'/);
  assert.match(main, /function shouldFocusEditorForFind/);
  assert.match(main, /function syncPreviewScrollToEditor/);
  // Preview scroll sync maps source lines to rendered blocks via the lexer
  // rather than estimating a block index proportionally (which drifted on
  // documents with unevenly sized blocks).
  assert.match(main, /function rebuildPreviewLineMap/);
  assert.match(main, /splitYamlFrontmatter\(editor\.value\)/);
  assert.match(main, /marked\.lexer\(markdownBody\)/);
  assert.match(main, /function rebuildEditorVisualLineMapIfNeeded/);
  // Preview edits patch only the changed top-level blocks (diffing lexer
  // tokens) instead of rebuilding the whole document on every keystroke.
  assert.match(main, /function tryIncrementalPreviewRender/);
  assert.match(main, /from '\.\/previewIncremental\.js'/);
  assert.match(main, /diffTokenRange/);
  // The incremental fast path must keep a correct full-render fallback.
  assert.match(main, /handledIncrementally/);
  assert.match(css, /\.editor-scroll-measure/);
  assert.doesNotMatch(main, /lineRatio \* \(blocks\.length - 1\)/);
  assert.doesNotMatch(main, /editor\.scrollTop \/ lineHeight/);
  assert.match(main, /function revealMatchAtCursor/);
  assert.match(main, /function measureEditorOffsetTop/);
  assert.match(main, /function applyPreviewFindHighlights/);
  assert.match(main, /function updateFindActiveVisual/);
  assert.match(main, /find-active/);
  assert.match(css, /\.editor-input-wrap\.find-active #editor/);
  assert.match(css, /preview-find-match/);
  assert.match(main, /function toggleFindOption/);
  assert.match(main, /find-opt-case/);
  assert.match(main, /from '\.\/documentOutline\.js'/);
  assert.match(main, /documentDirtyFlag/);
  assert.match(main, /editorEditGeneration/);
  assert.match(main, /function markEditorEdited/);
  assert.match(main, /function updateOutlineActiveItem/);
  assert.match(main, /function getOutlineViewportLine/);
  assert.match(main, /function previewLineForTop/);
  assert.match(html, /id="toggle-outline-btn"/);
  assert.match(main, /from '\.\/editorPerf\.js'/);
  assert.match(main, /function setEditorPerfEnabled/);
  assert.match(html, /id="editor-perf-panel"/);
  assert.match(main, /editor\.find\.select_skipped/);
  assert.match(main, /outlinePaneReduce/);
  assert.match(main, /initialOutlineState/);
  assert.match(main, /from '\.\/outlineViewport\.js'/);
  assert.match(main, /from '\.\/previewWindowState\.js'/);
  assert.match(main, /from '\.\/scrollSync\.js'/);
  assert.match(main, /from '\.\/largeDocument\.js'/);
  assert.match(main, /function renderWindowedPreview/);
  assert.match(main, /preview-window-spacer/);
  assert.match(main, /function scheduleWindowedPreviewRefresh/);
  assert.match(main, /shouldRefreshWindow/);
  assert.match(main, /function estimateFocusLineFromPreviewScroll/);
  assert.match(main, /shouldIgnorePreviewScroll/);
  assert.match(main, /function scheduleFindRefresh/);
  assert.match(main, /findRefreshDebounceMs/);
  assert.match(main, /flushScheduledFindRefresh/);
  assert.match(main, /editorMetricsDebounceMsForSize/);
  assert.match(main, /countWords/);
  assert.match(main, /function resizeComposerInput/);
  assert.match(main, /composerSupportsNativeFieldSizing/);
  assert.match(main, /existing\.textContent !== text/);
  assert.match(css, /field-sizing:\s*content/);
  assert.doesNotMatch(css, /scroll-behavior:\s*smooth/);
});

test("develop-Lumina mode lets Claude edit the source checkout and rebuild from the UI", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");

  assert.match(html, /id="claude-develop-lumina-btn"/);
  assert.match(html, /id="claude-rebuild-lumina-btn"/);
  assert.match(html, /id="claude-auto-rebuild-checkbox"/);

  assert.match(rust, /fn source_dir_info/);
  assert.match(rust, /fn find_lumina_source_dir/);
  assert.match(rust, /fn watch_source_checkout/);
  assert.match(rust, /fn unwatch_source_checkout/);
  assert.match(rust, /lumina-source-changed/);
  assert.match(rust, /fn looks_like_lumina_source/);
  assert.match(rust, /"Documents\/Projects\/Lumina"/);
  assert.doesNotMatch(rust, /Local checkout install is only shown in development builds/);

  assert.match(main, /invoke\('source_dir_info'\)/);
  assert.match(main, /function toggleDevelopLuminaMode/);
  assert.match(main, /async function rebuildLumina/);
  assert.match(main, /function syncAutoRebuildWatch/);
  assert.match(main, /function scheduleAutoRebuild/);
  assert.match(main, /autoRebuildLuminaKey/);
  assert.match(main, /developLuminaMode/);
  assert.match(main, /luminaSourceDir/);
  assert.match(main, /claudeDevelopLuminaBtn\.addEventListener\('click'/);
  assert.match(main, /claudeRebuildLuminaBtn\.addEventListener\('click'/);

  // The Agent pane (Cursor Agent / Hermes) shares the same develop-Lumina mode:
  // its own "Lumina src" button, and each turn runs in the source checkout.
  assert.match(html, /id="agent-develop-lumina-btn"/);
  assert.match(html, /id="agent-rebuild-lumina-btn"/);
  assert.match(html, /id="agent-auto-rebuild-checkbox"/);
  assert.match(main, /agentDevelopLuminaBtn\?\.addEventListener\('click'/);
  assert.match(main, /agentRebuildLuminaBtn\?\.addEventListener\('click'/);
  assert.match(main, /agentAutoRebuildCheckbox\?\.addEventListener\('change'/);
  assert.match(main, /toggleDevelopLuminaMode\(\{ pane: 'agent' \}\)/);
  assert.match(main, /cwd: developLuminaMode && luminaSourceDir \? luminaSourceDir : null/);
  assert.match(rust, /Agent cwd is not a directory/);
});

test("assistant composers accept pasted screenshots", () => {
  const main = fs.readFileSync("src/main.js", "utf8");
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const security = fs.readFileSync("src-tauri/src/security.rs", "utf8");

  assert.match(rust, /fn claude_save_pasted_image/);
  assert.match(main, /function wireComposerImagePaste/);
  assert.match(main, /function resolvePastedImages/);
  assert.match(main, /wireComposerImagePaste\(claudeInput, claudePastedImagePaths/);
  assert.match(main, /wireComposerImagePaste\(agentInput, agentPastedImagePaths/);
  assert.match(main, /resolveAgentPastedImages/);
  assert.match(main, /agentPastedImagePaths\.clear\(\)/);
  assert.match(security, /fn extract_pasted_image_paths/);
  assert.match(security, /fn validate_pasted_image_attachment_path/);
  assert.match(rust, /extract_pasted_image_paths\(&text\)/);
  assert.match(rust, /validate_pasted_image_attachment_path\(&path\)/);
  assert.match(rust, /\.arg\("--image"\)/);
});

test("example guide documents the app features that have regressed before", () => {
  const guide = fs.readFileSync("src/example.md", "utf8");

  for (const requiredSection of [
    "Mermaid Diagrams",
    "Lists And Outlines",
    "Task Lists",
    "Claude Pane",
    "Useful Menus",
  ]) {
    assert.match(guide, new RegExp(`## \\d+\\. ${requiredSection}`));
  }
});

test("autosave, recovery snapshots, and safe external reload are wired", () => {
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const main = fs.readFileSync("src/main.js", "utf8");
  const html = fs.readFileSync("index.html", "utf8");

  assert.match(rust, /fn write_recovery_snapshot/);
  assert.match(rust, /fn read_recovery_snapshot/);
  assert.match(rust, /fn delete_recovery_snapshot/);
  assert.match(main, /from '\.\/documentRecovery\.js'/);
  assert.match(main, /scheduleDocumentPersistence\(\)/);
  assert.match(main, /shouldBlockExternalReload\(/);
  assert.match(main, /flushDocumentPersistence\(\)/);
  assert.match(main, /maybeOfferRecoveryRestore\(/);
  assert.match(main, /function showDocumentConflictBanner/);
  assert.match(main, /from '\.\/documentDiff\.js'/);
  assert.match(html, /id="document-alert-diff"/);
  assert.match(main, /function refreshEditorFromDisk/);
});

test("main.js relative imports resolve to files in src/", () => {
  const main = fs.readFileSync("src/main.js", "utf8");
  const imports = [...main.matchAll(/from '\.\/([^']+\.js)'/g)].map((match) => match[1]);
  assert.ok(imports.length > 0, "expected main.js to import local modules");

  for (const relativePath of imports) {
    const absolutePath = `src/${relativePath}`;
    assert.ok(
      fs.existsSync(absolutePath),
      `missing ${absolutePath} imported from src/main.js`
    );
  }
});
