import {
    formatInstallProgressSubtitle,
    formatInstallProgressTitle
} from './installProgressParse.js';

/** @typedef {{ interpolatedPercent?: number | null, countdownSeconds?: number | null } | null} InstallProgressLiveOptions */

function clampPercent(value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    return Math.min(100, Math.max(0, Math.round(value)));
}

export function displayPercentFromInstallProgress(state) {
    const rawPercent = clampPercent(state.percent);
    // A bar line is authoritative (install.sh already blends elapsed, remaining, and step
    // floor). Do not Math.max with a step "floor" here — that overrode the real ~40% with
    // ~55% and made the card disagree with the terminal.
    if (rawPercent != null) {
        return rawPercent;
    }
    if (
        Number.isFinite(state.currentStep) &&
        Number.isFinite(state.totalSteps) &&
        state.currentStep > 0 &&
        state.totalSteps > 0
    ) {
        return clampPercent(((state.currentStep - 1) / state.totalSteps) * 100);
    }
    return null;
}

/**
 * @param {import('./installProgressParse.js').InstallProgressState} state
 * @param {InstallProgressLiveOptions} [live]
 */
export function createInstallProgressViewModel(state, live = null) {
    const basePercent = displayPercentFromInstallProgress(state);
    const percent =
        live != null && live.interpolatedPercent != null
            ? clampPercent(live.interpolatedPercent)
            : basePercent;

    const useLive =
        live != null &&
        (live.interpolatedPercent != null || live.countdownSeconds != null);
    const liveFmt = useLive
        ? { displayPercent: percent, countdownSeconds: live.countdownSeconds }
        : null;

    return {
        percent,
        percentText: percent == null ? '—' : `${percent}%`,
        width: percent == null ? 0 : percent,
        subtitle: formatInstallProgressSubtitle(state, liveFmt),
        title: formatInstallProgressTitle(state, liveFmt)
    };
}
