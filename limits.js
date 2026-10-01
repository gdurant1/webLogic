/**
 * limits.js — Circuit limits & speed guard
 * ---------------------------------------------------------------------------
 * Two staged protections against circuits that would slow (or freeze) the
 * page. Neither one hard-blocks the user for good: each asks first, then lets
 * the user proceed.
 *
 * 1. GATE LIMIT (per circuit; a "circuit" = controls wired together)
 *    - Up to CIRCUIT_GATE_LIMIT (10) gates per circuit: no prompts.
 *    - A wire that would join gates into a circuit of MORE than 10 asks the
 *      user to approve removing the limit for that circuit. Declined = the
 *      wire is not made. Approved = that circuit is uncapped.
 *    - Once uncapped, the speed guard below watches how long a simulator
 *      update takes and asks again as it degrades.
 *
 * 2. SPEED GUARD (assumption: "100% speed" = a 60 fps frame budget, 16.7 ms)
 *    Update cost = median evaluate() time + median truth-table rebuild time
 *    (medians of the last 5 samples, so one garbage-collection spike does not
 *    trigger a prompt). Prompts fire each time the cost crosses a stage
 *    upward:
 *       20% slower  (~20.8 ms, about 48 fps)  -> notice
 *       35% slower  (~25.6 ms, about 39 fps)  -> warning
 *       50% slower  (~33.3 ms, about 30 fps)  -> DIRE warning
 *    "Keep going" accepts that stage; "Stop adding gates" revokes every
 *    approval, so the 10-gate limit applies again to new connections.
 *
 * 3. TRUTH-TABLE INPUT CAP (tables.js): a circuit's master table has 2^n
 *    rows for n switch inputs. Up to TABLE_INPUT_LIMIT (10) it is built
 *    automatically; above that the user must approve it per circuit; above
 *    TABLE_INPUT_HARD_LIMIT (14) it is never built (16k+ rows).
 *
 * This module only decides and remembers. The dialog itself is drawn by
 * popups.js, which registers a handler through setPromptHandler().
 */
import * as App from './app.js';

export const CIRCUIT_GATE_LIMIT = 10;
export const TABLE_INPUT_LIMIT = 10;
export const TABLE_INPUT_HARD_LIMIT = 14;

const FRAME_BUDGET_MS = 1000 / 60;
const SAMPLE_COUNT = 5;
const MIN_SAMPLES = 3;

export const SPEED_STAGES = [
    { reduction: 0.2, severity: 'notice', title: 'Simulator is slowing down' },
    { reduction: 0.35, severity: 'warning', title: 'Simulator is running slowly' },
    { reduction: 0.5, severity: 'dire', title: 'Simulator is at half speed' },
];

/** Update cost (ms) at which a stage starts. */
export const stageThresholdMs = (stage) => FRAME_BUDGET_MS / (1 - SPEED_STAGES[stage - 1].reduction);

// ---------------- Prompt plumbing ----------------

let promptHandler = null;
let promptQueue = Promise.resolve();

export const setPromptHandler = (handler) => {
    promptHandler = handler;
};

/**
 * Ask the user something. Resolves true (confirm) / false (cancel).
 * Prompts are queued so two can never be on screen at once. With no handler
 * registered it resolves false, i.e. the safe answer.
 */
export const confirm = (options) => {
    const run = () => {
        if (!promptHandler) {
            console.warn('limits.js: no prompt handler registered; treating as "cancel".', options.title);
            return Promise.resolve(false);
        }
        return promptHandler(options);
    };
    const result = promptQueue.then(run);
    promptQueue = result.catch(() => false);
    return result;
};

// ---------------- Gate limit ----------------

/**
 * A built-in gate counts as 1. A custom gate (customGates.js) counts as
 * ceil(gates used to create it / 2) — stored directly on its control as
 * `gateWeight` at placement time, so this file needs no dependency on
 * customGates.js's own registry to read it (owner decision: round UP).
 */
const countGates = (controlIds) => {
    let count = 0;
    controlIds.forEach((id) => {
        const control = App.getControl(id);
        if (!control) return;
        if (control.gateWeight !== undefined) count += control.gateWeight;
        else if (App.GATE_TYPES.has(control.type)) count += 1;
    });
    return count;
};

const anyApproved = (controlIds, flag) =>
    [...controlIds].some((id) => {
        const control = App.getControl(id);
        return Boolean(control && control[flag]);
    });

/**
 * Would wiring fromNodeId -> toNodeId break the gate limit?
 * Returns { needsApproval, gateCount?, controlIds? }.
 */
export const checkConnection = (fromNodeId, toNodeId) => {
    const from = App.getNode(fromNodeId);
    const to = App.getNode(toNodeId);
    if (!from || !to) return { needsApproval: false };

    const fromIds = App.getConnectedControlIds(from.controlId);
    // A wire inside one existing circuit adds no gates.
    if (fromIds.has(to.controlId)) return { needsApproval: false };

    const merged = new Set([...fromIds, ...App.getConnectedControlIds(to.controlId)]);
    const gateCount = countGates(merged);
    const needsApproval = gateCount > CIRCUIT_GATE_LIMIT && !anyApproved(merged, 'capApproved');
    return { needsApproval, gateCount, controlIds: [...merged] };
};

export const requestCircuitApproval = async (gateCount, controlIds) => {
    const approved = await confirm({
        severity: 'warning',
        title: `Circuit limit: ${CIRCUIT_GATE_LIMIT} gates`,
        message:
            `This connection would join ${gateCount} gates into one circuit. ` +
            `Circuits with more than ${CIRCUIT_GATE_LIMIT} gates can slow the simulator and its truth tables, ` +
            'and adding more may cause problems. Remove the limit for this circuit?',
        confirmLabel: 'Remove limit',
        cancelLabel: 'Cancel',
    });
    if (approved) {
        controlIds.forEach((id) => {
            const control = App.getControl(id);
            if (control) control.capApproved = true;
        });
    }
    return approved;
};

const revokeApprovals = () => {
    App.allControls().forEach((control) => {
        control.capApproved = false;
    });
};

// ---------------- Truth-table cap ----------------

export const isTableApproved = (controlIds) => anyApproved(controlIds, 'tableCapApproved');

export const requestTableApproval = async (inputCount, controlIds) => {
    const approved = await confirm({
        severity: inputCount >= 13 ? 'dire' : 'warning',
        title: 'Large truth table',
        message:
            `This circuit has ${inputCount} inputs, so its master truth table needs ` +
            `${(2 ** inputCount).toLocaleString()} rows and may freeze the page while it builds. Show it anyway?`,
        confirmLabel: 'Show table',
        cancelLabel: 'Cancel',
    });
    if (approved) {
        controlIds.forEach((id) => {
            const control = App.getControl(id);
            if (control) control.tableCapApproved = true;
        });
    }
    return approved;
};

// ---------------- Speed guard ----------------

const evaluateSamples = [];
const rebuildSamples = [];
let acknowledgedStage = 0;
let speedPromptOpen = false;

const pushSample = (list, ms) => {
    list.push(ms);
    if (list.length > SAMPLE_COUNT) list.shift();
};

const median = (list) => {
    if (list.length === 0) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

export const getUpdateCostMs = () => median(evaluateSamples) + median(rebuildSamples);

const stageForCost = (cost) => {
    let stage = 0;
    SPEED_STAGES.forEach((_, index) => {
        if (cost >= stageThresholdMs(index + 1)) stage = index + 1;
    });
    return stage;
};

const promptSpeed = async (stage) => {
    const info = SPEED_STAGES[stage - 1];
    const percent = Math.round(info.reduction * 100);
    speedPromptOpen = true;

    let message = `The simulator is about ${percent}% slower than normal because of large circuits. `;
    let confirmLabel = 'Keep going';
    if (info.severity === 'dire') {
        message =
            `DANGER: the simulator has slowed by ${percent}% or more. Continuing can freeze or crash this tab ` +
            'and you may lose unsaved work. Removing gates or splitting the circuit is strongly recommended.';
        confirmLabel = 'Continue at my own risk';
    } else if (info.severity === 'warning') {
        message += 'Editing will start to feel sluggish. Adding more gates will make it worse.';
    } else {
        message += 'It is still usable, but adding more gates will slow it further.';
    }

    const keepGoing = await confirm({
        severity: info.severity,
        title: info.title,
        message,
        confirmLabel,
        cancelLabel: 'Stop adding gates',
    });

    speedPromptOpen = false;
    acknowledgedStage = stage;
    // Declining puts the 10-gate limit back in force for new connections.
    if (!keepGoing) revokeApprovals();
};

const checkSpeed = () => {
    if (speedPromptOpen) return;
    if (evaluateSamples.length < MIN_SAMPLES) return;

    // Only watch speed once someone has removed a limit.
    const hasApproved = App.allControls().some((control) => control.capApproved);
    if (!hasApproved) {
        acknowledgedStage = 0;
        return;
    }

    const stage = stageForCost(getUpdateCostMs());
    if (stage < acknowledgedStage) acknowledgedStage = stage; // recovered: allow re-prompting later
    if (stage > acknowledgedStage) promptSpeed(stage);
};

export const recordEvaluate = (ms) => {
    pushSample(evaluateSamples, ms);
    checkSpeed();
};

export const recordRebuild = (ms) => {
    pushSample(rebuildSamples, ms);
    checkSpeed();
};
