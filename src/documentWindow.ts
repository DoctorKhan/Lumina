// Glue between this webview and its native document window. Every open
// document is its own window (grouped into native macOS tabs), so this module
// covers what one window needs to know about the others: events addressed to
// it, opening files in new tabs, and reporting its document to the title bar.

import { invoke } from '@tauri-apps/api/core';
import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { documentWindowTitle } from './documentTitle.ts';

const currentWindow = getCurrentWebviewWindow();

/** The window created from tauri.conf.json; only it restores the last session. */
export const isPrimaryWindow: boolean = currentWindow.label === 'main';

/**
 * Listens for events sent to this window, plus app-wide broadcasts. The plain
 * `listen` from `@tauri-apps/api/event` also receives events addressed to
 * other windows, which would mix their terminal output and chats into this one.
 */
export function listenToWindow<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    return currentWindow.listen<T>(event, handler);
}

export interface WindowDocumentState {
    path: string | null;
    fallbackName?: string;
    dirty: boolean;
    /** Untitled, empty, and unchanged: a file can load here instead of a new tab. */
    pristine: boolean;
}

let lastReported = '';

/** Mirrors the document into the native title bar and the backend's registry. */
export function reportWindowDocument(state: WindowDocumentState): void {
    const params = {
        path: state.path,
        title: documentWindowTitle(state),
        dirty: state.dirty,
        pristine: state.pristine
    };
    const key = JSON.stringify(params);
    if (key === lastReported) return;
    lastReported = key;
    invoke('set_window_document', { params }).catch(() => {
        lastReported = '';
    });
}

/** Opens a new tab (or a separate window) next to this one, optionally loading `path`. */
export function openDocumentWindow(
    options: { path?: string | null; tab?: boolean } = {}
): Promise<void> {
    return invoke('open_document_window', {
        path: options.path ?? null,
        tab: options.tab ?? true
    });
}

/** Focuses another window that already shows `path`. False if none does. */
export async function focusWindowWithDocument(path: string): Promise<boolean> {
    try {
        return await invoke<boolean>('focus_document_window', { path });
    } catch {
        return false;
    }
}

/**
 * Runs `canClose` before this window closes (⌘W, the close button, or the
 * tab's ×); resolving to false keeps it open.
 */
export function guardWindowClose(canClose: () => Promise<boolean>): void {
    void currentWindow.onCloseRequested(async (event) => {
        let allowed = true;
        try {
            allowed = await canClose();
        } catch {
            allowed = true;
        }
        if (!allowed) event.preventDefault();
    });
}
