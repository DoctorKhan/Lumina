// Result dialog for File → Check for Updates. The status bar also shows the
// result, but an explicit check from the menu deserves a visible answer.
// Pure so it can be unit-tested; main.js shows it with the dialog plugin.

export type UpdateCheckOutcome =
    | { kind: 'available'; latestTag: string; currentVersion: string }
    | { kind: 'current'; latestTag: string; currentVersion: string }
    | { kind: 'none' }
    | { kind: 'failed'; error: string };

export interface UpdateCheckDialog {
    title: string;
    message: string;
    /** True when the dialog should offer Install / Later instead of OK. */
    offerInstall: boolean;
}

function bare(version: string): string {
    return version.replace(/^v/, '');
}

export function updateCheckDialog(outcome: UpdateCheckOutcome): UpdateCheckDialog {
    switch (outcome.kind) {
        case 'available':
            return {
                title: 'Update Available',
                message:
                    `Lumina ${bare(outcome.latestTag)} is available ` +
                    `(you have ${bare(outcome.currentVersion)}).\n\n` +
                    'Installing downloads the prebuilt app and restarts Lumina.',
                offerInstall: true
            };
        case 'current':
            return {
                title: 'You’re Up to Date',
                message: `Lumina ${bare(outcome.currentVersion)} is the latest version.`,
                offerInstall: false
            };
        case 'none':
            return {
                title: 'No Releases Found',
                message: 'No Lumina releases were found on GitHub.',
                offerInstall: false
            };
        case 'failed':
            return {
                title: 'Couldn’t Check for Updates',
                message: `${outcome.error || 'Unknown error'}\n\nCheck your internet connection and try again.`,
                offerInstall: false
            };
    }
}
