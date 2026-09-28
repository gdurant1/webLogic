/**
 * toolbar.js — Toolbar Controls, Zoom & Pan
 * ---------------------------------------------------------------------------
 * Per javascript.md §8:
 *   - Binds #btn-save, #btn-print, #btn-undo, #btn-redo, #btn-grid,
 *     #btn-select, #btn-pan, #btn-clear-all (via popups.js), #btn-play,
 *     #btn-stop and #btn-help.
 *   - Zoom (#zoom-slider / #btn-zoom-in / #btn-zoom-out, 50%-200% in 10%
 *     steps) scales the WHOLE canvas as one layer: #canvas-world gets a CSS
 *     scale(), and #canvas-sizer is resized so the scrollbars always match
 *     the scaled world. Every control keeps its original size relative to
 *     the others; zooming keeps the middle of the view in place.
 *   - The canvas is a scrollable "infinite" world (WORLD_SIZE px square,
 *     a practical limit). beginPan() scrolls it by dragging; main.js's
 *     mousedown router calls it for a drag on empty space (either tool).
 *     Scrollbars stay visible.
 */
import * as App from './app.js';
import * as Logic from './logic.js';
import * as Popups from './popups.js';

const viewport = document.getElementById('canvas');
const sizer = document.getElementById('canvas-sizer');
const world = document.getElementById('canvas-world');

const LOCAL_STORAGE_KEY = 'logic-sim-save';
const ZOOM_STEP_PERCENT = 10;
const PAN_THRESHOLD_PX = 3;

// ---------------- Zoom / viewport ----------------

const zoomSlider = document.getElementById('zoom-slider');

/** Apply a zoom level (percent), keeping the center of the view fixed. */
export const applyZoom = (percent) => {
    const oldZoom = App.getZoom();
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / oldZoom;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / oldZoom;

    const zoom = App.setZoom(percent / 100);
    sizer.style.width = `${App.WORLD_SIZE * zoom}px`;
    sizer.style.height = `${App.WORLD_SIZE * zoom}px`;
    world.style.transform = `scale(${zoom})`;

    viewport.scrollLeft = centerX * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = centerY * zoom - viewport.clientHeight / 2;
    zoomSlider.value = String(Math.round(zoom * 100));
};

/** Size the world for the slider's zoom and center the view. Called once by main.js. */
export const initViewport = () => {
    world.style.width = `${App.WORLD_SIZE}px`;
    world.style.height = `${App.WORLD_SIZE}px`;
    const percent = parseInt(zoomSlider.value, 10) || 100;
    const zoom = App.setZoom(percent / 100);
    sizer.style.width = `${App.WORLD_SIZE * zoom}px`;
    sizer.style.height = `${App.WORLD_SIZE * zoom}px`;
    world.style.transform = `scale(${zoom})`;
    viewport.scrollLeft = (App.WORLD_SIZE * zoom - viewport.clientWidth) / 2;
    viewport.scrollTop = (App.WORLD_SIZE * zoom - viewport.clientHeight) / 2;
};

zoomSlider.addEventListener('input', () => applyZoom(parseInt(zoomSlider.value, 10)));
document.getElementById('btn-zoom-in').addEventListener('click', () => {
    applyZoom(parseInt(zoomSlider.value, 10) + ZOOM_STEP_PERCENT);
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
    applyZoom(parseInt(zoomSlider.value, 10) - ZOOM_STEP_PERCENT);
});

// ---------------- Select / Pan tool ----------------

const selectButton = document.getElementById('btn-select');
const panButton = document.getElementById('btn-pan');
let activeTool = 'select';

export const getActiveTool = () => activeTool;

const setTool = (tool) => {
    activeTool = tool;
    selectButton.classList.toggle('selected', tool === 'select');
    panButton.classList.toggle('selected', tool === 'pan');
    viewport.style.cursor = tool === 'pan' ? 'grab' : '';
};

selectButton.addEventListener('click', () => setTool('select'));
panButton.addEventListener('click', () => setTool('pan'));
setTool('select');

/** Drag-to-pan. Called by main.js's mousedown router. */
export const beginPan = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = viewport.scrollLeft;
    const startTop = viewport.scrollTop;
    const restCursor = activeTool === 'pan' ? 'grab' : '';
    let moved = false;
    viewport.style.cursor = 'grabbing';

    const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) > PAN_THRESHOLD_PX) moved = true;
        viewport.scrollLeft = startLeft - dx;
        viewport.scrollTop = startTop - dy;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        viewport.style.cursor = restCursor;
        if (moved) App.swallowNextClick(); // a pan must not clear the selection
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

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

const gridButton = document.getElementById('btn-grid');
let gridOn = true;

gridButton.addEventListener('click', () => {
    gridOn = !gridOn;
    world.style.backgroundImage = gridOn ? '' : 'none';
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
        'and use the toolbar to select, edit and simulate your circuit. Drag empty space (or use the pan tool) to move around.');
});
