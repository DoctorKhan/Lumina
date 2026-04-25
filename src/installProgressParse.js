/**
 * Parses install.sh / `curl | bash` log lines for the in-app update progress card.
 * Must match install.sh: install_progress_line(), start_step(), and legacy
 *   [6/9] label (elapsed X, ETA Y, Z%)
 * Input may include ANSI (24-bit SGR, etc.); this module strips it before matching.
 */
// Bar: [#---], [██░], with optional ANSI; then spaces and "12%".
const RE_BAR = /\[[^\]]*]\s*(\d+)%/;
// " |  about 4m 12s left  |" or " |  about 0s left  |" (install.sh, plain + TTY)
const RE_ETA = /\|\s*about\s+(.+?)\s+left\s*\|/i;
// [6/9] Building (elapsed 4s, ETA 7m 17s, 0%)
const RE_COMBINED = /^\[(\d+)\/(\d+)\]\s+(.+?)\s+\(elapsed\s*([^,]+),\s*ETA\s*([^,]+),\s*(\d+)%\)\s*$/;
// [6/9] Building...   (new format, no parenthetical)
const RE_STEP = /^\[(\d+)\/(\d+)\]\s+(.+)$/;

/**
 * @typedef {Object} InstallProgressState
 * @property {number | null} percent
 * @property {string | null} timeRemaining
 * @property {string | null} label
 * @property {number | null} currentStep
 * @property {number | null} totalSteps
 */

/** @returns {InstallProgressState} */
export function createInstallProgressState() {
    return {
        percent: null,
        /** Human-readable, e.g. "7m 17s" */
        timeRemaining: null,
        /** High-level step, e.g. "Building macOS app bundle" */
        label: null,
        currentStep: null,
        totalSteps: null
    };
}

// 7-bit CSI: ESC [ params … m / H / f / ~ / etc. (incl. 24-bit 38;2;r;g;b)
const RE_CSI_7 = /\u001B\[[0-9:;!?"#$%&'()*+,\-.\/]*[A-Za-z~]/g;
// C1 (U+009B) — rare; strip if present
const RE_CSI_C1 = /\u009B[[0-9:;?]*[A-Za-z~]/g;
// BEL-terminated OSC (set title, hyperlinks) — to first bell only
const RE_OSC_BELL = /\u001B\][^\u0007]*\u0007/g;
// String-terminated OSC (8-bit clean)
const RE_OSC_ST = /\u001B\][\s\S]*?\u001B\\/g;

export function stripAnsi(text) {
    let s = String(text);
    s = s.replace(RE_OSC_BELL, '');
    s = s.replace(RE_OSC_ST, '');
    s = s.replace(RE_CSI_7, '');
    s = s.replace(RE_CSI_C1, '');
    s = s.replace(RE_CSI_7, '');
    return s;
}

/**
 * @param {InstallProgressState} state
 * @param {string} line — one logical line (may include ANSI)
 * @returns {{ changed: boolean, done: boolean }}
 */
export function processInstallProgressLine(state, line) {
    const t = stripAnsi(line).trim();
    if (!t) {
        return { changed: false, done: false };
    }

    let changed = false;

    const mBar = t.match(RE_BAR);
    if (mBar) {
        const p = Math.min(100, Math.max(0, parseInt(mBar[1], 10)));
        if (state.percent !== p) {
            state.percent = p;
            changed = true;
        }
        const mEta = t.match(RE_ETA);
        if (mEta) {
            const tr = mEta[1].trim();
            if (state.timeRemaining !== tr) {
                state.timeRemaining = tr;
                changed = true;
            }
        }
        if (p >= 100) {
            return { changed, done: true };
        }
        return { changed, done: false };
    }

    const mCombo = t.match(RE_COMBINED);
    if (mCombo) {
        if (state.currentStep !== +mCombo[1]) {
            state.currentStep = +mCombo[1];
            changed = true;
        }
        if (state.totalSteps !== +mCombo[2]) {
            state.totalSteps = +mCombo[2];
            changed = true;
        }
        if (state.label !== mCombo[3].trim()) {
            state.label = mCombo[3].trim();
            changed = true;
        }
        const tr = mCombo[5].trim();
        if (state.timeRemaining !== tr) {
            state.timeRemaining = tr;
            changed = true;
        }
        const p = Math.min(100, Math.max(0, parseInt(mCombo[6], 10)));
        if (state.percent !== p) {
            state.percent = p;
            changed = true;
        }
        return { changed, done: p >= 100 };
    }

    const mStep = t.match(RE_STEP);
    if (mStep) {
        if (state.currentStep !== +mStep[1]) {
            state.currentStep = +mStep[1];
            changed = true;
        }
        if (state.totalSteps !== +mStep[2]) {
            state.totalSteps = +mStep[2];
            changed = true;
        }
        if (state.label !== mStep[3].trim()) {
            state.label = mStep[3].trim();
            changed = true;
        }
        return { changed, done: false };
    }

    return { changed: false, done: false };
}

/**
 * @param {InstallProgressState} state
 * @param {{ displayPercent?: number | null, countdownSeconds?: number | null } | null} live
 */
export function formatInstallProgressTitle(state, live = null) {
    const bit = [];
    if (state.label) {
        bit.push(state.label);
    }
    if (state.currentStep && state.totalSteps) {
        bit.push(`Step ${state.currentStep} of ${state.totalSteps}`);
    }
    const pct =
        live != null && live.displayPercent != null
            ? live.displayPercent
            : state.percent;
    if (pct != null) {
        bit.push(`${pct}%`);
    }
    const timeLeft =
        live != null && live.countdownSeconds != null
            ? formatDurationRough(live.countdownSeconds)
            : state.timeRemaining;
    if (timeLeft) {
        bit.push(`~${timeLeft} left`);
    }
    return bit.length ? bit.join(' · ') : 'Installing…';
}

/**
 * Parse human ETA strings from install.sh ("7m 17s", "1h 2m", "0s").
 * @param {string | null | undefined} text
 * @returns {number | null} total seconds, or null if unparseable
 */
export function parseTimeRemainingToSeconds(text) {
    if (text == null || String(text).trim() === '') {
        return null;
    }
    const t = String(text).trim().toLowerCase();
    let h = 0;
    let m = 0;
    let s = 0;
    const hM = t.match(/(\d+)\s*h(?:our)?s?/);
    const mM = t.match(/(\d+)\s*m(?:in)?s?/);
    const sM = t.match(/(\d+)\s*s(?:ec)?s?/);
    if (hM) h = parseInt(hM[1], 10);
    if (mM) m = parseInt(mM[1], 10);
    if (sM) s = parseInt(sM[1], 10);
    if (!hM && !mM && !sM) {
        return null;
    }
    return h * 3600 + m * 60 + s;
}

/** Compact duration for progress copy (e.g. 437 -> "7m 17s"). */
export function formatDurationRough(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
        return '0s';
    }
    const sec = Math.max(0, Math.round(totalSeconds));
    if (sec < 60) {
        return `${sec}s`;
    }
    const m = Math.floor(sec / 60);
    const rs = sec % 60;
    if (m < 60) {
        return rs ? `${m}m ${rs}s` : `${m}m`;
    }
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
}

/** Shorter line for UI where percent is shown separately. */
export function formatInstallProgressSubtitle(state, live = null) {
    const bit = [];
    if (state.label) {
        bit.push(state.label);
    }
    if (state.currentStep && state.totalSteps) {
        bit.push(`Step ${state.currentStep} of ${state.totalSteps}`);
    }
    const timeLeft =
        live != null && live.countdownSeconds != null
            ? formatDurationRough(live.countdownSeconds)
            : state.timeRemaining;
    if (timeLeft) {
        bit.push(`~${timeLeft} left`);
    }
    return bit.length ? bit.join(' · ') : 'Preparing…';
}
