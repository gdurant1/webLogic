/**
 * popups.js — Dialog & Note Handlers
 * ---------------------------------------------------------------------------
 * Per javascript.md §7 / htmlPromptForCSS.md §6:
 *   - #note-popup opens via #btn-note (arm it, then click a control) or by
 *     double-clicking a control. EXCEPTION: a Push Button ignores double-click
 *     (a double-click is two quick presses) and can only open its note
 *     through the pencil. Its #note-input-count-section only shows for logic
 *     gates.
 *   - #input-count-popup is a count-only alternative; nothing in index.html
 *     currently triggers it, but openInputCountPopup() is exported.
 *   - #clear-all-confirm and #lonly-prompt handle their own yes/no.
 *     "Lonly? -> Yes" opens the dating-sim page in a new tab.
 *   - #limit-popup is the shared warning dialog for limits.js (gate limit,
 *     speed guard, big truth tables). It is registered as limits.js's prompt
 *     handler below.
 *   - #login-popup is referenced in the CSS/spec but has no markup in
 *     index.html, so #btn-login stays a harmless stub.
 */
import * as App from './app.js';
import * as Canvas from './canvas.js';
import * as Logic from './logic.js';
import * as Limits from './limits.js';

const DATING_SIM_URL = 'datingSimIndex.html';

const viewport = document.getElementById('canvas');

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
if (noteButton) {
    noteButton.addEventListener('click', () => {
        noteToolArmed = true;
    });
}

const controlFromEvent = (event) => {
    const controlEl = event.target.closest('.control');
    return controlEl ? App.getControl(controlEl.dataset.id) : undefined;
};

// Pencil (#btn-note) then click: works for EVERY control, push buttons included.
viewport.addEventListener('click', (event) => {
    if (!noteToolArmed) return;
    noteToolArmed = false;
    const control = controlFromEvent(event);
    if (control) openNotePopup(control);
});

// Double-click: every control EXCEPT the push button.
viewport.addEventListener('dblclick', (event) => {
    const control = controlFromEvent(event);
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
    if (target === current) return;

    if (target > current) {
        const inputsWrap = control.el.querySelector('.gate-inputs');
        for (let i = current; i < target; i++) Canvas.addGateInputNode(inputsWrap, control.id, i);
    } else {
        for (let i = current - 1; i >= target; i--) {
            const nodeId = `${control.id}-in-${i}`;
            const wire = App.getWireInto(nodeId);
            if (wire) App.removeWire(wire.id);
            const node = App.getNode(nodeId);
            if (node) {
                node.el.remove();
                App.unregisterNode(nodeId);
            }
        }
    }
    control.inputCount = target;
    App.emit('control:inputcount', control);
    Logic.evaluate();
};

noteInputInc.addEventListener('click', () => {
    const next = parseInt(noteInputCount.value, 10) + 1;
    noteInputCount.value = String(next);
    if (noteTarget) setGateInputCount(noteTarget, next);
});
noteInputDec.addEventListener('click', () => {
    const next = Math.max(1, parseInt(noteInputCount.value, 10) - 1);
    noteInputCount.value = String(next);
    if (noteTarget) setGateInputCount(noteTarget, next);
});

// ---------------- Standalone gate input-count popup ----------------

const inputCountPopup = document.getElementById('input-count-popup');
const inputCountGateName = document.getElementById('input-count-gate-name');
const inputCountField = document.getElementById('input-count');
const inputCountDec = document.getElementById('input-count-decrease');
const inputCountInc = document.getElementById('input-count-increase');
const inputCountClose = document.getElementById('input-count-close');

let inputCountTarget = null;

export const openInputCountPopup = (control) => {
    inputCountTarget = control;
    inputCountGateName.textContent = control.type.toUpperCase();
    inputCountField.value = String(control.inputCount);
    const source = document.querySelector(`.palette-item[data-type="${control.type}"]`);
    inputCountField.min = source ? source.dataset.minInputs : '1';
    const fixed = App.FIXED_INPUT_TYPES.has(control.type);
    inputCountInc.disabled = fixed;
    inputCountDec.disabled = fixed;
    inputCountPopup.hidden = false;
};

const closeInputCountPopup = () => {
    inputCountPopup.hidden = true;
    inputCountTarget = null;
};

inputCountInc.addEventListener('click', () => {
    const next = parseInt(inputCountField.value, 10) + 1;
    inputCountField.value = String(next);
    if (inputCountTarget) setGateInputCount(inputCountTarget, next);
});
inputCountDec.addEventListener('click', () => {
    const next = Math.max(1, parseInt(inputCountField.value, 10) - 1);
    inputCountField.value = String(next);
    if (inputCountTarget) setGateInputCount(inputCountTarget, next);
});
inputCountClose.addEventListener('click', closeInputCountPopup);

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

// ---------------- Lonly? ----------------

const lonlyPrompt = document.getElementById('lonly-prompt');
const lonlyButton = document.getElementById('btn-lonly');

if (lonlyButton) {
    lonlyButton.addEventListener('click', () => {
        lonlyPrompt.hidden = false;
    });
}
document.getElementById('lonly-yes').addEventListener('click', () => {
    lonlyPrompt.hidden = true;
    // New tab: the simulator (and whatever is on its canvas) stays untouched.
    window.open(DATING_SIM_URL, '_blank', 'noopener');
});
document.getElementById('lonly-no').addEventListener('click', () => {
    lonlyPrompt.hidden = true;
});

// ---------------- Sign-in stub ----------------
// #login-popup has no markup in this index.html yet, so there is nothing to open.

const loginButton = document.getElementById('btn-login');
if (loginButton) {
    loginButton.addEventListener('click', () => {
        console.info('Sign In clicked — #login-popup markup is not present in index.html yet.');
    });
}

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
