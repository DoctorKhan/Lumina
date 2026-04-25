import { parseTimeRemainingToSeconds } from './installProgressParse.js';
import { displayPercentFromInstallProgress } from './installProgressView.js';

/** @returns {{ anchorMs: number, anchorPercent: number, etaSeconds: number, targetCap: number }} */
export function createInstallProgressAnchorState() {
    return {
        anchorMs: 0,
        anchorPercent: 0,
        etaSeconds: 120,
        /** Upper bound for interpolation (step ceiling or 99). */
        targetCap: 99
    };
}

function stepHighPercent(state) {
    if (
        !Number.isFinite(state.currentStep) ||
        !Number.isFinite(state.totalSteps) ||
        state.currentStep <= 0 ||
        state.totalSteps <= 0
    ) {
        return 99;
    }
    return Math.min(99, Math.round((state.currentStep / state.totalSteps) * 100));
}

function fallbackEtaSeconds(state, terminalPercent) {
    const p = Number.isFinite(terminalPercent) ? terminalPercent : 0;
    const hi = stepHighPercent(state);
    if (hi > p + 0.25) {
        const gap = hi - p;
        return Math.max(25, Math.min(480, gap * 4));
    }
    return 90;
}

/**
 * install.sh "remaining" is time to ~100% done; we only interpolate to targetCap (end of
 * current step or 99%). Scale so countdown matches that segment instead of full install.
 * @param {number} remainingSeconds — parsed shell ETA (total install remaining)
 * @param {number} anchorPercent
 * @param {number} targetCap
 */
function scaleEtaToProgressSegment(remainingSeconds, anchorPercent, targetCap) {
    const R = remainingSeconds;
    const p = anchorPercent;
    const c = targetCap;
    if (!Number.isFinite(R) || R <= 0 || !Number.isFinite(p) || !Number.isFinite(c)) {
        return Math.max(1, R);
    }
    const span = c - p;
    if (span <= 0.25) {
        return Math.max(1, Math.min(30, Math.round(R * 0.1)));
    }
    const denom = 100 - p;
    if (denom <= 0.25) {
        return Math.max(1, Math.round(R));
    }
    const scaled = (R * span) / denom;
    return Math.max(5, Math.round(scaled));
}

/**
 * Call when install.sh emits a new progress line so ETA / percent anchors stay fresh.
 * @param {import('./installProgressParse.js').InstallProgressState} state
 */
export function refreshInstallProgressAnchor(anchor, state) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const terminalP = displayPercentFromInstallProgress(state);
    const p = terminalP == null ? 0 : terminalP;

    anchor.anchorMs = now;
    anchor.anchorPercent = p;

    let eta = parseTimeRemainingToSeconds(state.timeRemaining);
    if (eta == null || eta <= 0) {
        eta = fallbackEtaSeconds(state, p);
    }
    eta = Math.max(1, eta);

    const hi = stepHighPercent(state);
    anchor.targetCap = Math.max(p, Math.min(99, hi));
    anchor.etaSeconds = scaleEtaToProgressSegment(eta, p, anchor.targetCap);
}

/**
 * Linearly interpolate from the anchor percent toward `targetCap` using elapsed / ETA,
 * never below the latest terminal-derived percent.
 * @param {import('./installProgressParse.js').InstallProgressState} state
 */
export function getInterpolatedInstallPercent(anchor, state, nowMs) {
    const terminalP = displayPercentFromInstallProgress(state);
    if (terminalP == null) {
        return null;
    }
    if (terminalP >= 100) {
        return 100;
    }

    const elapsed = Math.max(0, (nowMs - anchor.anchorMs) / 1000);
    const eta = anchor.etaSeconds > 0 ? anchor.etaSeconds : 1;
    const ratio = Math.min(1, elapsed / eta);
    const cap = Number.isFinite(anchor.targetCap) ? anchor.targetCap : 99;
    const span = Math.max(0, cap - anchor.anchorPercent);
    const smooth = anchor.anchorPercent + span * ratio;
    const displayed = Math.max(terminalP, Math.min(cap, Math.round(smooth)));
    return displayed;
}

/** Seconds remaining for live countdown (from anchor ETA). */
export function getCountdownSecondsRemaining(anchor, nowMs) {
    const elapsed = Math.max(0, (nowMs - anchor.anchorMs) / 1000);
    return Math.max(0, Math.ceil(anchor.etaSeconds - elapsed));
}
