/**
 * popups.js — Dialog & Note Handlers
 * ---------------------------------------------------------------------------
 * Per javascript.md §7 / htmlPromptForCSS.md §6:
 *   - #note-popup opens via #btn-note (arm it, then click a control) or by
 *     double-clicking a control. EXCEPTION: a Push Button ignores double-click
 *     (a double-click is two quick presses) and can only open its note
 *     through the pencil. Its #note-input-count-section only shows for logic
 *     gates.
 *   - #clear-all-confirm handles its own yes/no.
 *   - #limit-popup is the shared warning dialog for limits.js (gate limit,
 *     speed guard, big truth tables). It is registered as limits.js's prompt
 *     handler below.
 *   - The pencil tool (#btn-note) also disarms on a blank-canvas click and
 *     on Escape (Task 6.2), and shows its armed state via the toolbar's own
 *     .selected style.
 *   - Create Gate's own popups (#create-gate-name-popup,
 *     #create-gate-remove-confirm, #custom-gate-message, #custom-gate-view,
 *     #custom-gate-delete-confirm) are wired up in customGates.js, not here
 *     — they're specific to that one feature.
 *   - Sign In was removed entirely (Task 6.8); #login-popup's CSS was left
 *     alone per instructions, but nothing opens it any more.
 */
import * as App from './app.js';
import * as Logic from './logic.js';
import * as Limits from './limits.js';
import * as Shapes from './shapes.js';
import { getPaperInstance } from './canvas.js';

const paper = getPaperInstance();

// ---------------- Note popup ----------------

const notePopup = document.getElementById('note-popup');
const noteTitle = document.getElementById('note-title');
const noteBody = document.getElementById('note-body');
const noteInputSection = document.getElementById('note-input-count-section');
const noteInputCount = document.getElementById('note-input-count');
const noteInputDec = document.getElementById('note-input-count-decrease');
const noteInputInc = document.getElementById('note-input-count-increase');

let noteTarget = null;
let noteToolArmed = false;

export const openNotePopup = (control) => {
    noteTarget = control;
    noteTitle.value = (control.note && control.note.title) || '';
    noteBody.value = (control.note && control.note.body) || '';
    const isGate = App.GATE_TYPES.has(control.type);
    noteInputSection.hidden = !isGate;
    if (isGate) {
        noteInputCount.value = String(control.inputCount);
        const fixed = App.FIXED_INPUT_TYPES.has(control.type);
        noteInputInc.disabled = fixed;
        noteInputDec.disabled = fixed;
    }
    notePopup.hidden = false;
};

const closeNotePopup = () => {
    if (noteTarget) noteTarget.note = { title: noteTitle.value, body: noteBody.value };
    notePopup.hidden = true;
    noteTarget = null;
};

noteTitle.addEventListener('change', () => {
    if (noteTarget) noteTarget.note = { ...noteTarget.note, title: noteTitle.value };
});
noteBody.addEventListener('change', () => {
    if (noteTarget) noteTarget.note = { ...noteTarget.note, body: noteBody.value };
});

document.addEventListener('click', (event) => {
    if (!notePopup.hidden && !notePopup.contains(event.target) && !event.target.closest('.control')) closeNotePopup();
});

const noteButton = document.getElementById('btn-note');

const setNoteToolArmed = (armed) => {
    noteToolArmed = armed;
    if (noteButton) noteButton.classList.toggle('selected', armed); // visible armed state
};

if (noteButton) {
    noteButton.addEventListener('click', () => setNoteToolArmed(true));
}

// Pencil (#btn-note) then click: works for EVERY control, push buttons
// included. Runs alongside selection.js's own 'element:pointerclick'
// listener (both fire on the same click, same as the old dual-purpose
// click handling).
paper.on('element:pointerclick', (elementView) => {
    if (!noteToolArmed) return;
    setNoteToolArmed(false);
    const control = App.getControl(elementView.model.id);
    if (control) openNotePopup(control);
});

// Disarm on a blank-canvas click (Task 6.2) — runs alongside selection.js's
// own 'blank:pointerclick' listener, which separately clears the selection.
paper.on('blank:pointerclick', () => setNoteToolArmed(false));

// Disarm on Escape (Task 6.2).
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && noteToolArmed) setNoteToolArmed(false);
});

// Double-click: every control EXCEPT the push button.
paper.on('element:pointerdblclick', (elementView) => {
    const control = App.getControl(elementView.model.id);
    if (!control || control.type === 'push-button') return;
    openNotePopup(control);
});

// ---------------- Shared input-count mutation ----------------

export const setGateInputCount = (control, requested) => {
    if (!control || !App.GATE_TYPES.has(control.type)) return;
    if (App.FIXED_INPUT_TYPES.has(control.type)) return; // Buffer / NOT never change

    const source = document.querySelector(`.palette-item[data-type="${control.type}"]`);
    const min = source ? parseInt(source.dataset.minInputs, 10) : 1;
    const target = Math.max(min, requested);
    const current = control.inputCount;

    if (target > current) {
        for (let i = current; i < target; i++) {
            control.cell.addPort({ id: `${control.id}-in-${i}`, group: 'in' });
        }
    } else if (target < current) {
        for (let i = current - 1; i >= target; i--) {
            const nodeId = `${control.id}-in-${i}`;
            const wire = App.getWireInto(nodeId);
            if (wire) App.removeWire(wire.id);
            control.cell.removePort(nodeId);
        }
    }
    if (target !== current) {
        Shapes.layoutPorts(control.cell);
        Shapes.stampPortSides(control.cell, getPaperInstance());
    }
    control.inputCount = target;
    App.emit('control:inputcount', control);
    Logic.evaluate();
};

/**
 * Clamp `requested` to the gate's real minimum and write the RESULT back to
 * the field (Task 6.1) — needed because setGateInputCount silently re-clamps
 * internally too, so without this the field could show a value (e.g. an AND
 * gate's minus button driving the field to 1) that doesn't match the gate's
 * actual input count (which the min already held at 2), a real
 * display/data mismatch.
 */
const applyNoteInputCount = (requested) => {
    if (!noteTarget) return;
    setGateInputCount(noteTarget, requested);
    noteInputCount.value = String(noteTarget.inputCount);
};

noteInputInc.addEventListener('click', () => applyNoteInputCount(parseInt(noteInputCount.value, 10) + 1));
noteInputDec.addEventListener('click', () => applyNoteInputCount(parseInt(noteInputCount.value, 10) - 1));

// Typing a value directly into the field (Task 6.1's "also when typed into
// the number field") previously did nothing at all — only the +/- buttons
// worked.
noteInputCount.addEventListener('change', () => {
    const typed = parseInt(noteInputCount.value, 10);
    applyNoteInputCount(Number.isNaN(typed) ? (noteTarget ? noteTarget.inputCount : 1) : typed);
});

// ---------------- Clear All ----------------

const clearAllConfirm = document.getElementById('clear-all-confirm');

export const openClearAllConfirm = () => {
    clearAllConfirm.hidden = false;
};

document.getElementById('clear-all-yes').addEventListener('click', () => {
    App.allControls().forEach((control) => App.removeControl(control.id));
    clearAllConfirm.hidden = true;
});
document.getElementById('clear-all-no').addEventListener('click', () => {
    clearAllConfirm.hidden = true;
});

// ---------------- Limit / warning dialog (used by limits.js) ----------------

const limitPopup = document.getElementById('limit-popup');
const limitTitle = document.getElementById('limit-title');
const limitMessage = document.getElementById('limit-message');
const limitConfirm = document.getElementById('limit-confirm');
const limitCancel = document.getElementById('limit-cancel');

/** Show the dialog and resolve true (confirm) or false (cancel / Escape). */
const showLimitDialog = (options) =>
    new Promise((resolve) => {
        limitPopup.className = `limit-${options.severity || 'warning'}`;
        limitTitle.textContent = options.title;
        limitMessage.textContent = options.message;
        limitConfirm.textContent = options.confirmLabel || 'OK';
        limitCancel.textContent = options.cancelLabel || 'Cancel';
        limitPopup.hidden = false;

        const finish = (result) => {
            limitPopup.hidden = true;
            limitConfirm.removeEventListener('click', onConfirm);
            limitCancel.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey, true);
            resolve(result);
        };
        const onConfirm = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            finish(false);
        };

        limitConfirm.addEventListener('click', onConfirm);
        limitCancel.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey, true);

        // The dire dialog defaults focus to the safe choice.
        (options.severity === 'dire' ? limitCancel : limitConfirm).focus();
    });

Limits.setPromptHandler(showLimitDialog);
