/**
 * selection.js — Selection & Transformations (JointJS-native)
 * ---------------------------------------------------------------------------
 * Click-select and rubber-band now run off the Paper's own cell/blank
 * pointer events instead of raw DOM listeners on a hand-built canvas div:
 *   - `element:pointerclick` / `link:pointerclick` / `blank:pointerclick`
 *     for single/Ctrl-click selection.
 *   - `blank:pointerdown` starts either the rubber-band (when
 *     #btn-multiselect is armed) or a pan (canvas.js's beginPan) — same
 *     branching as before, just off a Paper event instead of a hand-rolled
 *     mousedown router.
 *   - The rubber-band itself uses `paper.findViewsInArea()`, a built-in
 *     JointJS core method, in place of the old manual bounding-box math.
 *
 * Dragging a MULTI-selection (more than one control selected) is still
 * hand-rolled here, because moving several cells together as one gesture is
 * a Rappid SelectionView feature, not part of open-source core: canvas.js's
 * `interactive` option already declines JointJS's own single-element drag
 * for that case, so `element:pointerdown` below picks it up instead. A
 * single selected (or unselected) control still uses JointJS's normal
 * built-in per-element drag untouched.
 *
 * Flip is a cosmetic mirror of the shape's own markup (`root/transform`);
 * it does not relocate which side a port renders on the way the old
 * DOM version's `data-side` flip did, so a flipped control's wires keep
 * leaving from their original side. Noted as a known simplification.
 */
import * as App from './app.js';
import * as Shapes from './shapes.js';
import { getGraphInstance, getPaperInstance, beginPan, placeControl } from './canvas.js';

const graph = getGraphInstance();
const paper = getPaperInstance();
const multiselectButton = document.getElementById('btn-multiselect');

let multiSelectMode = false;
let clipboard = [];
let nextGroupId = 1;

const controlKey = (id) => `c:${id}`;
const wireKey = (id) => `w:${id}`;

export const isMultiSelectMode = () => multiSelectMode;

// ---------------- Visual sync ----------------

App.events.addEventListener('selection:change', () => {
    document.querySelectorAll('.control.selected, .wire.selected').forEach((el) => el.classList.remove('selected'));
    App.getSelection().forEach((key) => {
        if (key.startsWith('c:')) {
            const control = App.getControl(key.slice(2));
            if (control && control.el) control.el.classList.add('selected');
        } else if (key.startsWith('w:')) {
            const wire = App.getWire(key.slice(2));
            if (wire && wire.pathEl) wire.pathEl.classList.add('selected');
        }
    });
});

// ---------------- Click-to-select ----------------

const selectControl = (id, additive) => {
    const control = App.getControl(id);
    const ids = control && control.groupId
        ? App.allControls().filter((other) => other.groupId === control.groupId).map((other) => other.id)
        : [id];

    if (additive) {
        ids.forEach((controlId) => {
            const key = controlKey(controlId);
            if (App.isSelected(key)) App.removeFromSelection(key);
            else App.addToSelection(key);
        });
    } else {
        App.setSelection(ids.map(controlKey));
    }
};

paper.on('element:pointerclick', (elementView, event) => {
    selectControl(elementView.model.id, event.ctrlKey || event.metaKey);
});

paper.on('link:pointerclick', (linkView, event) => {
    const key = wireKey(linkView.model.id);
    if (event.ctrlKey || event.metaKey) {
        if (App.isSelected(key)) App.removeFromSelection(key);
        else App.addToSelection(key);
    } else {
        App.setSelection([key]);
    }
});

paper.on('blank:pointerclick', () => App.clearSelection());

// ---------------- Multiselect toggle ----------------
// Correction: give the active tool a persistent, visible cursor cue
// (`.tool-multiselect`, see style.css) until the user presses Escape,
// right-clicks, or picks a different tool — not just while a button is
// mid-click. `host` here is paper.el (#paper-host) — see getPaperInstance.

const setMultiSelectMode = (enabled) => {
    multiSelectMode = enabled;
    if (multiselectButton) multiselectButton.classList.toggle('selected', enabled);
    // NOT paper.el — that's an inner wrapper div JointJS creates itself
    // (class "joint-paper", id "paper"), nested INSIDE #paper-host; the CSS
    // tool-cursor rules (style.css) target #paper-host specifically, same
    // element toolbar.js's pan-tool cursor already uses. Confirmed directly:
    // the class was being added to the wrong element, so the multiselect
    // cursor never actually appeared.
    document.getElementById('paper-host').classList.toggle('tool-multiselect', enabled);
};

if (multiselectButton) {
    multiselectButton.addEventListener('click', () => {
        if (!multiSelectMode) App.emit('tool:cancel'); // disarm any other overlay (e.g. the note tool) first
        setMultiSelectMode(!multiSelectMode);
    });
}

App.events.addEventListener('tool:cancel', () => setMultiSelectMode(false));

// ---------------- Rubber-band (paper.findViewsInArea) ----------------

const beginRubberBand = (event) => {
    // Two separate coordinate systems are needed here, and the old version
    // of this function conflated them — the actual bug behind "the
    // multi-select box isn't visible": `bounds` (WORLD/model coordinates,
    // from clientToLocalPoint) is exactly right for findViewsInArea() below,
    // but was ALSO being used directly as the visual band's CSS pixel
    // position. World coordinates only equal screen pixels at exactly 100%
    // zoom with no pan — any other view state put the band far off in some
    // unrelated part of the (very large) world, in practice invisible.
    // `startClient`/a `position: fixed` box track real screen pixels for
    // the VISUAL overlay instead, independent of pan/zoom entirely; `bounds`
    // (world space) is kept only for the final hit-test.
    const start = paper.clientToLocalPoint(event.clientX, event.clientY);
    const startClient = { x: event.clientX, y: event.clientY };
    const additive = event.ctrlKey || event.metaKey;
    const previous = additive ? App.getSelection() : [];

    const band = document.createElement('div');
    band.className = 'rubber-band';
    band.style.left = `${startClient.x}px`;
    band.style.top = `${startClient.y}px`;
    document.body.appendChild(band);

    let bounds = { x: start.x, y: start.y, width: 0, height: 0 };
    let moved = false;

    const onMove = (moveEvent) => {
        const point = paper.clientToLocalPoint(moveEvent.clientX, moveEvent.clientY);
        bounds = {
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
        };

        const clientLeft = Math.min(startClient.x, moveEvent.clientX);
        const clientTop = Math.min(startClient.y, moveEvent.clientY);
        const clientWidth = Math.abs(moveEvent.clientX - startClient.x);
        const clientHeight = Math.abs(moveEvent.clientY - startClient.y);
        if (clientWidth > 2 || clientHeight > 2) moved = true;
        band.style.left = `${clientLeft}px`;
        band.style.top = `${clientTop}px`;
        band.style.width = `${clientWidth}px`;
        band.style.height = `${clientHeight}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        band.remove();
        if (!moved) return; // a plain click on empty space clears the selection via blank:pointerclick

        const picked = paper.findViewsInArea(bounds)
            .filter((view) => view.model.isElement())
            .map((view) => controlKey(view.model.id));

        App.setSelection([...new Set([...previous, ...picked])]);
        App.swallowNextClick();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

paper.on('blank:pointerdown', (event) => {
    if (multiSelectMode) beginRubberBand(event);
    else beginPan(event);
});

// ---------------- Dragging a multi-selection together ----------------
// Only reached for a control that IS part of a >1-member selection —
// canvas.js's `interactive` option already left JointJS's own per-element
// drag in place for every other case.

paper.on('element:pointerdown', (elementView, event) => {
    const id = elementView.model.id;
    const selected = App.getSelection();
    const controlKeys = selected.filter((key) => key.startsWith('c:'));
    if (controlKeys.length < 2 || !selected.includes(controlKey(id))) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const starts = controlKeys
        .map((key) => App.getControl(key.slice(2)))
        .filter(Boolean)
        .map((control) => ({ control, ...control.cell.position() }));
    let moved = false;

    const onMove = (moveEvent) => {
        const scale = paper.scale().sx;
        let dx = (moveEvent.clientX - startX) / scale;
        let dy = (moveEvent.clientY - startY) / scale;
        if (!moved && Math.hypot(dx, dy) < 1) return;
        moved = true;

        // Real world bounds (Task 6.10): dx/dy must keep EVERY member of the
        // selection inside the world rectangle, not just whichever one the
        // user happens to be dragging. Each control's own size implies an
        // allowed [min, max] range for dx (and separately for dy); the
        // group's allowed range is the intersection of all of them.
        let dxMin = -Infinity;
        let dxMax = Infinity;
        let dyMin = -Infinity;
        let dyMax = Infinity;
        starts.forEach((start) => {
            const { width, height } = start.control.cell.size();
            dxMin = Math.max(dxMin, -start.x);
            dxMax = Math.min(dxMax, App.WORLD_SIZE - width - start.x);
            dyMin = Math.max(dyMin, -start.y);
            dyMax = Math.min(dyMax, App.WORLD_SIZE - height - start.y);
        });
        dx = Math.min(dxMax, Math.max(dxMin, dx));
        dy = Math.min(dyMax, Math.max(dyMin, dy));

        starts.forEach((start) => start.control.cell.position(start.x + dx, start.y + dy));
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) App.swallowNextClick();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
});

// ---------------- Delete ----------------

export const deleteSelection = () => {
    App.getSelection().forEach((key) => {
        if (key.startsWith('c:')) App.removeControl(key.slice(2));
        else if (key.startsWith('w:')) App.removeWire(key.slice(2));
    });
    App.clearSelection();
};

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    deleteSelection();
});

// ---------------- Cut / copy / paste ----------------

const selectedControls = () =>
    App.getSelection()
        .filter((key) => key.startsWith('c:'))
        .map((key) => App.getControl(key.slice(2)))
        .filter(Boolean);

export const copySelection = () => {
    clipboard = selectedControls().map((control) => ({
        type: control.type, x: control.x, y: control.y, inputCount: control.inputCount,
    }));
};

export const cutSelection = () => {
    copySelection();
    deleteSelection();
};

export const pasteClipboard = () => {
    if (clipboard.length === 0) return;
    const keys = clipboard
        .map((item) => placeControl(item.type, item.x + 40, item.y + 40, item.inputCount))
        .filter(Boolean)
        .map((control) => controlKey(control.id));
    App.setSelection(keys);
};

// ---------------- Flip (Phase A, Task 3 — full port mirroring) ----------------
// Flip state lives on the CELL (cell.prop('flipH'/'flipV')), not only on the
// plain `control` object, so it survives copy/paste and (Phase B) Save/Load.
// The visual mirror is scoped to shapes.js's `flipGroup` inner <g>, never to
// `root` (root's own transform is how JointJS positions the element in the
// world — overwriting it, the original bug, teleported the shape to (0,0)).
// Ports are mirrored separately (layoutPorts) since they render outside the
// markup tree, and any text label gets a counter-transform so it stays
// readable instead of mirroring backwards.

// Dynamic state applied via raw classList (not part of the model's own
// declared attrs) — a toggle switch's .checked, a push button's .pushed, a
// clock's .on, and the generic .selected every control can carry. Confirmed
// by testing: Shapes.applyFlipTransform's `cell.attr('flipGroup/transform',
// ...)` call makes JointJS reapply the model's DECLARED root class to the
// DOM, discarding any of these if present — and for .checked/.pushed/.on
// specifically, that isn't just a cosmetic flicker: those classes ARE the
// control's actual state, stored nowhere else, so losing them silently
// loses real simulation state (e.g. a flipped toggle switch going from "on"
// to "off" with no click ever happening). Snapshotting before the flip
// transform and reapplying right after is the fix, not avoiding
// applyFlipTransform — the mirror itself still needs to happen.
const DYNAMIC_CLASSES = ['checked', 'pushed', 'on', 'selected'];

export const flip = (axis) => {
    selectedControls().forEach((control) => {
        const cell = control.cell;
        const flipH = axis === 'h' ? !cell.get('flipH') : !!cell.get('flipH');
        const flipV = axis === 'v' ? !cell.get('flipV') : !!cell.get('flipV');
        cell.prop('flipH', flipH);
        cell.prop('flipV', flipV);
        control.flipH = flipH; // kept in sync for any code that still reads it off the control
        control.flipV = flipV;

        const preserved = DYNAMIC_CLASSES.filter((cls) => control.el.classList.contains(cls));

        Shapes.applyFlipTransform(cell);
        Shapes.layoutPorts(cell);
        Shapes.stampPortSides(cell, paper);

        preserved.forEach((cls) => control.el.classList.add(cls));

        const labelX = cell.attr('label/x');
        if (labelX !== undefined) Shapes.counterFlipText(cell, 'label', labelX, cell.attr('label/y'));

        App.emit('control:flip', control);
    });
};

// ---------------- Group ----------------

export const group = () => {
    const controls = selectedControls();
    if (controls.length < 2) return;
    const groupId = `grp-${nextGroupId++}`;
    controls.forEach((control) => { control.groupId = groupId; });
};

// ---------------- Toolbar bindings ----------------

const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
};

bind('btn-delete', deleteSelection);
bind('btn-cut', cutSelection);
bind('btn-copy', copySelection);
bind('btn-paste', pasteClipboard);
bind('btn-flip-h', () => flip('h'));
bind('btn-flip-v', () => flip('v'));
bind('btn-group', group);
