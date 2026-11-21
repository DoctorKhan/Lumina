// Which OS the webview runs on. The source installer (install.sh) and the
// in-app update/rebuild flow only work on macOS; other platforms download
// release builds instead.

export const isMacOS: boolean =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent || '');

export function releasePageUrl(tag: string): string {
    return `https://github.com/DoctorKhan/Lumina/releases/tag/${encodeURIComponent(tag)}`;
}
