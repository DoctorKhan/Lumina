import {
    formatInstallProgressSubtitle,
    formatInstallProgressTitle
} from './installProgressParse.js';

function clampPercent(value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    return Math.min(100, Math.max(0, Math.round(value)));
}

export function displayPercentFromInstallProgress(state) {
    const rawPercent = clampPercent(state.percent);
    let stepFloor = null;

    if (
        Number.isFinite(state.currentStep) &&
        Number.isFinite(state.totalSteps) &&
        state.currentStep > 0 &&
        state.totalSteps > 0
    ) {
        stepFloor = clampPercent(((state.currentStep - 1) / state.totalSteps) * 100);
    }

    if (rawPercent == null) {
        return stepFloor;
    }
    if (stepFloor == null) {
        return rawPercent;
    }
    return Math.max(rawPercent, stepFloor);
}

export function createInstallProgressViewModel(state) {
    const percent = displayPercentFromInstallProgress(state);

    return {
        percent,
        percentText: percent == null ? '—' : `${percent}%`,
        width: percent == null ? 0 : percent,
        subtitle: formatInstallProgressSubtitle(state),
        title: formatInstallProgressTitle(state)
    };
}
