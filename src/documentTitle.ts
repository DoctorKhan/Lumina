// Native window/tab title for a document. Pure so it can be unit-tested.

export interface DocumentTitleInput {
    /** Absolute path of the open file, or null for an unsaved document. */
    path: string | null;
    /** Name to show when there is no path (e.g. "Lumina Help"). */
    fallbackName?: string;
}

function splitPath(path: string): string[] {
    return path.replace(/\/+$/, '').split('/').filter(Boolean);
}

/**
 * "notes.md — docs" for a file (the parent folder tells same-named tabs
 * apart), the fallback name or "Untitled" otherwise. The unsaved-changes
 * marker is not part of the title: macOS draws it in the close button.
 */
export function documentWindowTitle({ path, fallbackName }: DocumentTitleInput): string {
    if (!path) return fallbackName?.trim() || 'Untitled';
    const parts = splitPath(path);
    const name = parts[parts.length - 1] ?? path;
    const parent = parts[parts.length - 2];
    return parent ? `${name} — ${parent}` : name;
}
