/**
 * popups.js — Dialog & Note Handlers
 * ---------------------------------------------------------------------------
 * Per javascript.md §7 / htmlPromptForCSS.md §6:
 *   - #note-popup opens via #btn-note (arm-then-click-a-control) OR by
 *     double-clicking a control directly — both routes now open the same
 *     popup. Its embedded #note-input-count-section only shows when the
 *     target is a logic gate (switches/buttons/clocks/constants/bulb/
 *     4-bit-digit have no adjustable input count).
 *   - #input-count-popup is unchanged structurally and still works as a
 *     count-only alternative, but per htmlPromptForCSS.md §6 nothing in
 *     this build's index.html currently triggers it (double-click now opens
 *     #note-popup instead) — it's wired up and ready for a future trigger
 *     (e.g. a dedicated toolbar action) via PopupsModule.openInputCountPopup.
 *   - #clear-all-confirm and #lonly-prompt handle their own yes/no.
 *   - #login-popup is referenced in style.css/spec but isn't present in
 *     this build's index.html, so #btn-login is left as a harmless stub.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const GATE_TYPES = new Set(['buffer', 'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'tri-state']);

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

    function openNotePopup(control) {
        noteTarget = control;
        noteTitle.value = (control.note && control.note.title) || '';
        noteBody.value = (control.note && control.note.body) || '';
        const isGate = GATE_TYPES.has(control.type);
        noteInputSection.hidden = !isGate;
        if (isGate) {
            noteInputCount.value = String(control.inputCount);
            const fixed = FIXED_INPUT_TYPES.has(control.type);
            noteInputInc.disabled = fixed;
            noteInputDec.disabled = fixed;
        }
        notePopup.hidden = false;
    }

    function closeNotePopup() {
        if (noteTarget) noteTarget.note = { title: noteTitle.value, body: noteBody.value };
        notePopup.hidden = true;
        noteTarget = null;
    }

    noteTitle.addEventListener('change', () => {
        if (noteTarget) noteTarget.note = Object.assign({}, noteTarget.note, { title: noteTitle.value });
    });
    noteBody.addEventListener('change', () => {
        if (noteTarget) noteTarget.note = Object.assign({}, noteTarget.note, { body: noteBody.value });
    });

    document.addEventListener('click', (e) => {
        if (!notePopup.hidden && !notePopup.contains(e.target) && !e.target.closest('.control')) closeNotePopup();
    });

    const btnNote = document.getElementById('btn-note');
    if (btnNote) btnNote.addEventListener('click', () => { noteToolArmed = true; });

    canvas.addEventListener('click', (e) => {
        if (!noteToolArmed) return;
        noteToolArmed = false;
        const controlEl = e.target.closest('.control');
        if (!controlEl) return;
        const control = App.getControl(controlEl.dataset.id);
        if (control) openNotePopup(control);
    });

    canvas.addEventListener('dblclick', (e) => {
        const controlEl = e.target.closest('.control');
        if (!controlEl) return;
        const control = App.getControl(controlEl.dataset.id);
        if (control) openNotePopup(control);
    });

    // Buffer and NOT are conceptually single-input gates: unlike every
    // other gate (whose input count IS adjustable), their input count
    // never changes.
    const FIXED_INPUT_TYPES = new Set(['buffer', 'not']);

    // ---------------- Shared input-count mutation ----------------
    function setGateInputCount(control, newCount) {
        if (!control) return;
        if (FIXED_INPUT_TYPES.has(control.type)) return;
        const paletteSource = document.querySelector('.palette-item[data-type="' + control.type + '"]');
        const min = paletteSource ? parseInt(paletteSource.dataset.minInputs, 10) : 1;
        newCount = Math.max(min, newCount);
        const current = control.inputCount;
        if (newCount === current) return;

        if (newCount > current) {
            const inputsWrap = control.el.querySelector('.gate-inputs');
            for (let i = current; i < newCount; i++) {
                window.CanvasModule.addGateInputNode(inputsWrap, control.id, i);
            }
        } else {
            for (let i = current - 1; i >= newCount; i--) {
                const nodeId = control.id + '-in-' + i;
                const wire = App.allWires().find(w => w.toNodeId === nodeId);
                if (wire) App.removeWire(wire.id);
                const node = App.getNode(nodeId);
                if (node) {
                    node.el.remove();
                    App.unregisterNode(nodeId);
                }
            }
        }
        control.inputCount = newCount;
        App.emit('control:inputcount', control);
        window.LogicModule.evaluate();
    }

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

    function openInputCountPopup(control) {
        inputCountTarget = control;
        inputCountGateName.textContent = control.type.toUpperCase();
        inputCountField.value = String(control.inputCount);
        const paletteSource = document.querySelector('.palette-item[data-type="' + control.type + '"]');
        inputCountField.min = paletteSource ? paletteSource.dataset.minInputs : '1';
        const fixed = FIXED_INPUT_TYPES.has(control.type);
        inputCountInc.disabled = fixed;
        inputCountDec.disabled = fixed;
        inputCountPopup.hidden = false;
    }
    function closeInputCountPopup() {
        inputCountPopup.hidden = true;
        inputCountTarget = null;
    }

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
    document.getElementById('clear-all-yes').addEventListener('click', () => {
        App.allControls().slice().forEach(c => App.removeControl(c.id));
        clearAllConfirm.hidden = true;
    });
    document.getElementById('clear-all-no').addEventListener('click', () => { clearAllConfirm.hidden = true; });
    function openClearAllConfirm() { clearAllConfirm.hidden = false; }

    // ---------------- Lonly? ----------------
    const lonlyPrompt = document.getElementById('lonly-prompt');
    const btnLonly = document.getElementById('btn-lonly');
    if (btnLonly) btnLonly.addEventListener('click', () => { lonlyPrompt.hidden = false; });
    document.getElementById('lonly-yes').addEventListener('click', () => {
        lonlyPrompt.hidden = true;
        // Hook for the "Connections" dating-sim mode described in
        // dateSim.md — that experience is a separate, much larger build
        // and isn't implemented here.
    });
    document.getElementById('lonly-no').addEventListener('click', () => { lonlyPrompt.hidden = true; });

    // ---------------- Sign-in stub ----------------
    // #login-popup is described in style.css's comments/spec but its
    // markup isn't part of this build's index.html, so there's nothing to
    // open yet.
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            console.info('Sign In clicked — #login-popup markup is not present in this index.html yet.');
        });
    }

    window.PopupsModule = { openNotePopup, openInputCountPopup, setGateInputCount, openClearAllConfirm };
})();
