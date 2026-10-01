/**
 * saveLoad.js — Save / Load + Back / Forward (Phase B)
 * ---------------------------------------------------------------------------
 * Save/Load, per the owner's design (NOT fixPrompt.md's original tabs-based
 * v2 format or separate #btn-load — both superseded once tabs were dropped
 * in favor of Custom Gates):
 *   - Save (#btn-save) writes a full snapshot to localStorage on click only
 *     — nothing autosaves.
 *   - That snapshot is restored automatically at startup (main.js calls
 *     loadAtStartup() once). No separate Load button.
 *   - The snapshot captures everything needed to rebuild the circuit
 *     exactly: every control's saved id (so wires, built from those same
 *     ids, resolve), position, flips, group, note, input count, the
 *     gate-limit approval flags (so restoring an already-over-the-cap
 *     circuit doesn't re-trigger that dialog), and — for toggle switches —
 *     their on/off state. Clock phase is NOT saved (clocks always start low,
 *     same as a fresh placement) and an SR latch's held bit is NOT saved
 *     (owner decision: a reload is a cold restart, not an uninterrupted
 *     session — see logic.js's own note on this).
 *
 * Back / Forward (the existing "<"/">" buttons, repurposed — this is a
 * single-save-point revert, not a conventional multi-step undo/redo stack):
 *   - Back reverts the canvas's STRUCTURE (controls, wires, positions,
 *     flips, custom-gate instances) to the last Save. Before doing so, it
 *     snapshots the CURRENT state in memory only (cleared on refresh) so
 *     Forward can return to it. If nothing has ever been saved, Back shows
 *     an info message instead of doing anything.
 *   - Forward restores that in-memory snapshot. Making ANY structural edit
 *     after a Back invalidates the snapshot — Forward does nothing further
 *     until the next Back.
 *   - Toggle-switch on/off state is explicitly EXCLUDED from Back/Forward
 *     (owner decision): whatever the switches are currently set to stays
 *     untouched by a revert, even though a plain Save/Load DOES include
 *     switch state. This is implemented by snapshotting live switch state
 *     by control id immediately before a Back-driven restore and
 *     reapplying it immediately after, overriding whatever the restored
 *     data says for any switch id that still exists.
 */
import * as App from './app.js';
import * as Shapes from './shapes.js';
import * as Logic from './logic.js';
import * as Tables from './tables.js';
import * as Limits from './limits.js';
import * as CustomGates from './customGates.js';
import * as Popups from './popups.js';
import { getGraphInstance, getPaperInstance, placeControl, setRestoring, registerWire } from './canvas.js';

const STORAGE_KEY = 'logic-sim-save';
const SAVE_VERSION = 1;

const graph = getGraphInstance();
const paper = getPaperInstance();

const backButton = document.getElementById('btn-undo'); // "<" — see index.html's title attr
const forwardButton = document.getElementById('btn-redo'); // ">"

// ---------------- Serialize ----------------

const isCustomType = (type) => typeof type === 'string' && type.startsWith('custom:');

/** Everything needed to rebuild the canvas exactly — see file header. */
const buildSaveData = () => ({
    version: SAVE_VERSION,
    controls: App.allControls().map((control) => ({
        id: control.id,
        type: control.type,
        x: control.x,
        y: control.y,
        inputCount: control.inputCount,
        flipH: !!control.cell.get('flipH'),
        flipV: !!control.cell.get('flipV'),
        groupId: control.groupId || null,
        note: control.note || null,
        capApproved: !!control.capApproved,
        tableCapApproved: !!control.tableCapApproved,
        checked: control.type === 'toggle-switch' ? control.el.classList.contains('checked') : undefined,
        halfPeriodMs: control.type === 'clock' ? control.halfPeriodMs : undefined, // correction: adjustable clock speed persists like everything else does
    })),
    wires: App.allWires().map((wire) => ({ fromNodeId: wire.fromNodeId, toNodeId: wire.toNodeId })),
});

// ---------------- Restore ----------------

/** Re-apply a restored control's flip state (port mirroring + text counter-flip). */
const applyRestoredFlip = (control, flipH, flipV) => {
    if (!flipH && !flipV) return;
    const cell = control.cell;
    cell.prop('flipH', flipH);
    cell.prop('flipV', flipV);
    control.flipH = flipH;
    control.flipV = flipV;
    Shapes.applyFlipTransform(cell);
    Shapes.layoutPorts(cell);
    Shapes.stampPortSides(cell, paper);
    const labelX = cell.attr('label/x');
    if (labelX !== undefined) Shapes.counterFlipText(cell, 'label', labelX, cell.attr('label/y'));
};

/**
 * Rebuild the canvas from `data` (the shape buildSaveData() produces).
 * `preserveSwitchStates`: when true (a Back/Forward revert), every restored
 * toggle switch's checked state is taken from its CURRENT live value (by
 * id) instead of the saved value — switches are explicitly excluded from
 * Back/Forward (owner decision), even though a plain restore includes them.
 * Returns `{ skippedCount }` — controls/wires that couldn't be restored
 * (e.g. a custom gate definition that no longer exists) are silently
 * dropped rather than crashing the whole restore.
 */
const restoreFromData = (data, preserveSwitchStates) => {
    const liveSwitchStates = new Map();
    if (preserveSwitchStates) {
        App.allControls().forEach((control) => {
            if (control.type === 'toggle-switch') liveSwitchStates.set(control.id, control.el.classList.contains('checked'));
        });
    }

    App.allControls().forEach((control) => App.removeControl(control.id));

    let skippedCount = 0;
    const restoredIds = new Set();

    (data.controls || []).forEach((saved) => {
        let placeType = saved.type;
        let customGateId;
        if (isCustomType(saved.type)) {
            customGateId = saved.type.slice('custom:'.length);
            if (!CustomGates.getDefinition(customGateId)) { skippedCount += 1; return; } // definition no longer exists
            placeType = 'custom';
        }
        const control = placeControl(placeType, saved.x, saved.y, saved.inputCount, customGateId, saved.id);
        if (!control) { skippedCount += 1; return; }
        restoredIds.add(control.id);

        applyRestoredFlip(control, !!saved.flipH, !!saved.flipV);
        if (saved.groupId) control.groupId = saved.groupId;
        if (saved.note) {
            control.note = saved.note;
            Popups.updateNoteBadge(control);
        }
        control.capApproved = !!saved.capApproved;
        control.tableCapApproved = !!saved.tableCapApproved;

        if (control.type === 'toggle-switch') {
            const checked = preserveSwitchStates && liveSwitchStates.has(saved.id)
                ? liveSwitchStates.get(saved.id)
                : !!saved.checked;
            control.el.classList.toggle('checked', checked);
        }
        // placeControl's own 'control:placed' listener already started this
        // clock's timer at the default speed — setClockSpeed (not a plain
        // property assignment) is needed to actually restart it at the
        // saved rate, not just remember the number.
        if (control.type === 'clock' && saved.halfPeriodMs) Logic.setClockSpeed(control, saved.halfPeriodMs);
    });

    // Wires are constructed directly (source/target already final in the
    // Link's initial attributes) rather than dragged into place — which
    // turns out to mean canvas.js's own `change:target`-driven registration
    // never runs for them at all: Backbone-style models (this joint.js's
    // Cell included) don't fire `change:` events for a brand-new model's
    // very first attribute value, only for an actual change afterward, the
    // way a user's drag produces one. Confirmed directly (a restored link's
    // cell existed fine in the graph — ports resolved — but never reached
    // App's wire registry). So this calls canvas.js's registerWire directly
    // instead of relying on that event; setRestoring(true) is kept anyway,
    // both as a defensive no-op if that assumption is ever wrong on some
    // other joint.js build, and because it ALSO still needs to suppress the
    // gate-limit approval dialog if change:target ever did fire (restored
    // capApproved flags, above, cover any LATER edit to an already-over-
    // the-cap circuit).
    setRestoring(true);
    (data.wires || []).forEach((w) => {
        const fromNode = App.getNode(w.fromNodeId);
        const toNode = App.getNode(w.toNodeId);
        if (!fromNode || !toNode) { skippedCount += 1; return; } // referenced a control that failed to restore
        const link = new Shapes.Wire({
            source: { id: fromNode.controlId, port: w.fromNodeId },
            target: { id: toNode.controlId, port: w.toNodeId },
        });
        link.addTo(graph);
        if (!App.getWire(link.id)) registerWire(link); // see comment above — the event path can't be relied on here
    });
    setRestoring(false);

    Logic.evaluate();
    Tables.rebuild();
    return { skippedCount };
};

// ---------------- localStorage access ----------------

const readStorage = () => {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        console.error(`Could not read the saved circuit (localStorage unavailable): ${error}`);
        return { data: null, corrupt: false };
    }
    if (!raw) return { data: null, corrupt: false };
    try {
        return { data: JSON.parse(raw), corrupt: false };
    } catch (error) {
        console.error('Saved circuit data is corrupt.', error);
        return { data: null, corrupt: true };
    }
};

const writeStorage = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error(`Save failed (localStorage unavailable): ${error}`);
        return false;
    }
};

// ---------------- Startup load ----------------

/** Called once by main.js, before the first evaluate()/rebuild(). */
export const loadAtStartup = async () => {
    const { data, corrupt } = readStorage();
    if (corrupt) {
        // Shown, but the corrupt data itself is left alone in storage — the
        // owner may want to recover it by hand; this app never deletes it.
        await Limits.confirm({
            severity: 'warning',
            title: 'Saved circuit could not be loaded',
            message: 'The saved circuit data is corrupt and could not be restored. Starting with an empty canvas. The stored data has not been deleted.',
            confirmLabel: 'OK',
            cancelLabel: 'OK',
        });
        return;
    }
    if (!data) return; // nothing saved yet — empty canvas, as normal
    restoreFromData(data, false);
};

// ---------------- Save button ----------------

document.getElementById('btn-save').addEventListener('click', () => {
    writeStorage(buildSaveData());
});

// ---------------- Back / Forward ----------------

let tempSnapshot = null; // in-memory only — the pre-revert state a Back created, for Forward to return to
let suppressChangeTracking = false; // true while THIS module is itself restoring, so that doesn't look like a user edit

const invalidateForward = () => {
    if (suppressChangeTracking || tempSnapshot === null) return;
    tempSnapshot = null;
    forwardButton.disabled = true;
};

// Any structural change (not a switch toggle — those are explicitly outside
// Back/Forward) invalidates a pending Forward, per the owner's "if the user
// makes changes the temporary save is removed" rule.
['control:add', 'control:remove', 'control:inputcount', 'control:move', 'control:flip', 'wire:add', 'wire:remove']
    .forEach((name) => App.events.addEventListener(name, invalidateForward));

const restoreQuietly = (data, preserveSwitchStates) => {
    suppressChangeTracking = true;
    const result = restoreFromData(data, preserveSwitchStates);
    suppressChangeTracking = false;
    return result;
};

backButton.addEventListener('click', async () => {
    const { data, corrupt } = readStorage();
    if (corrupt) {
        await Limits.confirm({
            severity: 'warning',
            title: 'Saved circuit could not be loaded',
            message: 'The saved circuit data is corrupt. The stored data has not been deleted.',
            confirmLabel: 'OK',
            cancelLabel: 'OK',
        });
        return;
    }
    if (!data) {
        await Limits.confirm({
            severity: 'notice',
            title: 'Nothing to go back to',
            message: 'There is no saved point to go back to yet — use Save first.',
            confirmLabel: 'OK',
            cancelLabel: 'OK',
        });
        return;
    }
    tempSnapshot = buildSaveData(); // the pre-revert state, for Forward
    restoreQuietly(data, true); // true: keep current switch states, per owner decision
    forwardButton.disabled = false;
});

forwardButton.addEventListener('click', () => {
    if (tempSnapshot === null) return; // button is disabled in this state anyway
    restoreQuietly(tempSnapshot, false); // a full restore back to that exact moment, switches included
});

forwardButton.disabled = true; // nothing to move forward to until a Back happens
