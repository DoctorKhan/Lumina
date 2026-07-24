export const UNTITLED_RECOVERY_PATH = '__lumina_untitled__';
export const autosaveDebounceMs = 5000;
export const recoveryDebounceMs = 2000;

export function isDocumentDirty(editorContent, persistedContent) {
    return editorContent !== persistedContent;
}

export function shouldBlockExternalReload(isDirty, externalContent, editorContent) {
    if (!isDirty) return false;
    return externalContent !== editorContent;
}

export function shouldOfferRecovery({ recoveryContent, diskContent }) {
    if (!recoveryContent) return false;
    return recoveryContent !== diskContent;
}

export function recoveryPathForDocument(filePath) {
    return filePath || UNTITLED_RECOVERY_PATH;
}
