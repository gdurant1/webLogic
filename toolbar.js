/**
 * toolbar.js — Toolbar Controls, Zoom & Pan
 * ---------------------------------------------------------------------------
 * Per javascript.md §8, with zoom/pan now delegated to canvas.js, which owns
 * the JointJS Paper (`paper.scale()` / `paper.translate()`):
 *   - The zoom slider and +/- buttons zoom toward the CENTER of the
 *     viewport (no cursor position to aim at); the mouse wheel — wired up
 *     in canvas.js — zooms toward the cursor instead. Both go through the
 *     same `Canvas.zoomTo()` / 10%-step logic, so they always agree.
 *   - #btn-select / #btn-pan just set which tool a drag on empty canvas
 *     means (canvas.js's `beginPan` is what actually moves the paper);
 *     dragging empty space pans with either tool, same as before.
 */
import * as App from './app.js';
import * as Logic from './logic.js';
import * as Popups from './popups.js';
import * as Canvas from './canvas.js';

const host = document.getElementById('paper-host');
const LOCAL_STORAGE_KEY = 'logic-sim-save';

// ---------------- Zoom ----------------

const zoomSlider = document.getElementById('zoom-slider');

const syncSlider = () => { zoomSlider.value = String(Canvas.getZoomPercent()); };

zoomSlider.addEventListener('input', () => Canvas.zoomToPercent(parseInt(zoomSlider.value, 10)));
document.getElementById('btn-zoom-in').addEventListener('click', () => { Canvas.zoomInStep(); syncSlider(); });
document.getElementById('btn-zoom-out').addEventListener('click', () => { Canvas.zoomOutStep(); syncSlider(); });
App.events.addEventListener('zoom:change', syncSlider);

/** Size and center the initial view. Called once by main.js. */
export const initViewport = () => {
    Canvas.initViewport();
    syncSlider();
};

// ---------------- Select / Pan tool ----------------

const selectButton = document.getElementById('btn-select');
const panButton = document.getElementById('btn-pan');

export const getActiveTool = () => Canvas.getPanTool();

const setTool = (tool) => {
    Canvas.setPanTool(tool);
    selectButton.classList.toggle('selected', tool === 'select');
    panButton.classList.toggle('selected', tool === 'pan');
    host.style.cursor = tool === 'pan' ? 'grab' : '';
};

selectButton.addEventListener('click', () => setTool('select'));
panButton.addEventListener('click', () => setTool('pan'));
setTool('select');

// ---------------- Save / Print ----------------

document.getElementById('btn-save').addEventListener('click', () => {
    const data = {
        controls: App.allControls().map((control) => ({
            id: control.id,
            type: control.type,
            x: control.x,
            y: control.y,
            inputCount: control.inputCount,
            note: control.note || null,
        })),
        wires: App.allWires().map((wire) => ({ from: wire.fromNodeId, to: wire.toNodeId })),
    };
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error(`Save failed (localStorage unavailable): ${error}`);
    }
});

document.getElementById('btn-print').addEventListener('click', () => window.print());

// ---------------- Undo / Redo ----------------
// A history stack isn't implemented: app.js has no command log to replay, so
// these are stubbed rather than silently doing something misleading.

document.getElementById('btn-undo').addEventListener('click', () => {
    console.info('Undo: history stack not implemented.');
});
document.getElementById('btn-redo').addEventListener('click', () => {
    console.info('Redo: history stack not implemented.');
});

// ---------------- Grid toggle ----------------
// The dot grid is a CSS background on #paper-host (see style.css) rather
// than a JointJS-rendered grid, so it keeps the exact original look
// (including the dark-mode color token) — toggling it is just a class.

const gridButton = document.getElementById('btn-grid');
let gridOn = true;

gridButton.addEventListener('click', () => {
    gridOn = !gridOn;
    host.classList.toggle('grid-hidden', !gridOn);
    gridButton.classList.toggle('selected', !gridOn);
});

// ---------------- Clear All ----------------

document.getElementById('btn-clear-all').addEventListener('click', () => Popups.openClearAllConfirm());

// ---------------- Play / Stop ----------------

document.getElementById('btn-play').addEventListener('click', () => Logic.play());
document.getElementById('btn-stop').addEventListener('click', () => Logic.stop());

// ---------------- Help ----------------

document.getElementById('btn-help').addEventListener('click', () => {
    alert('Drag controls and gates from the left panel onto the canvas, wire them together from output to input nodes, ' +
        'and use the toolbar to select, edit and simulate your circuit. Drag empty space (or use the pan tool) to move around. ' +
        'Scroll the mouse wheel over the canvas to zoom toward the cursor.');
});

// ---------------- Theme (dark mode) ----------------
// Folded in from what used to be a separate theme.js: like the toolbar
// bindings above, this is just "a status-bar control's click handler plus
// where its state is kept" — #dark-mode-toggle lives in the same
// #status-bar as the zoom controls this file already owns, and it shares
// no state or graph/paper access with anything else, so it didn't need its
// own file.
//
// Toggles `.dark-mode` on <body>; every color in style.css already reads
// from custom properties, so this one class swap re-themes the entire app.
// Persisted under the localStorage key "darkMode", read back inside
// try/catch in case storage is unavailable (private browsing, etc.).

const THEME_STORAGE_KEY = 'darkMode';
const darkModeToggle = document.getElementById('dark-mode-toggle');

const applyTheme = (isDark) => document.body.classList.toggle('dark-mode', isDark);

darkModeToggle.addEventListener('change', () => {
    applyTheme(darkModeToggle.checked);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, darkModeToggle.checked ? '1' : '0');
    } catch (error) {
        // Storage unavailable: the choice just won't survive a reload.
    }
});

try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === '1') {
        darkModeToggle.checked = true;
        applyTheme(true);
    }
} catch (error) {
    // Storage unavailable: default to light mode.
}
