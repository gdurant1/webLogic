/**
 * selection.js — Selection & Transformations
 * ---------------------------------------------------------------------------
 * Per javascript.md §4:
 *   - Click on a .control sets the single active selection and toggles
 *     .selected. Ctrl/Cmd-click adds/removes from the selection.
 *   - #btn-multiselect arms a rubber-band: drag over empty canvas to select
 *     every intersecting control (hold Ctrl/Cmd to ADD to the selection).
 *     main.js's mousedown router calls beginRubberBand().
 *   - Delete / Backspace and #btn-delete remove selected controls/wires (and,
 *     via app.js, any wires attached to a removed control).
 *   - Cut/copy/paste, flip-h/flip-v and group are implemented here.
 *
 * Grouping is deliberately lightweight: a shared control.groupId makes a
 * later click on any member re-select the whole group, and canvas.js already
 * moves the entire current selection together when one member is dragged.
 */
import * as App from './app.js';
import * as Canvas from './canvas.js';

const viewport = document.getElementById('canvas');
const world = document.getElementById('canvas-world');
const multiselectButton = document.getElementById('btn-multiselect');

let multiSelectMode = false;
let clipboard = [];
let nextGroupId = 1;

const controlKey = (id) => `c:${id}`;

export const isMultiSelectMode = () => multiSelectMode;

// ---------------- Visual sync ----------------

App.events.addEventListener('selection:change', () => {
    document.querySelectorAll('.control.selected, .wire.selected').forEach((el) => el.classList.remove('selected'));
    App.getSelection().forEach((key) => {
        if (key.startsWith('c:')) {
            const control = App.getControl(key.slice(2));
            if (control) control.el.classList.add('selected');
        } else if (key.startsWith('w:')) {
            const wire = App.getWire(key.slice(2));
            if (wire) wire.pathEl.classList.add('selected');
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

viewport.addEventListener('click', (event) => {
    const controlEl = event.target.closest('.control');
    if (controlEl) {
        selectControl(controlEl.dataset.id, event.ctrlKey || event.metaKey);
        return;
    }
    if (event.target.closest('.wire')) return; // wires handle their own click
    App.clearSelection();
});

// ---------------- Rubber-band multi-select ----------------

if (multiselectButton) {
    multiselectButton.addEventListener('click', () => {
        multiSelectMode = !multiSelectMode;
        multiselectButton.classList.toggle('selected', multiSelectMode);
    });
}

export const beginRubberBand = (event) => {
    event.preventDefault();
    const start = App.clientToWorld(event.clientX, event.clientY);
    const additive = event.ctrlKey || event.metaKey;
    const previous = additive ? App.getSelection() : [];

    const band = document.createElement('div');
    band.style.cssText =
        'position:absolute;z-index:50;pointer-events:none;' +
        'border:1px dashed var(--color-selected, #2979ff);background:rgba(41,121,255,0.12);';
    band.style.left = `${start.x}px`;
    band.style.top = `${start.y}px`;
    world.appendChild(band);

    let bounds = { left: start.x, top: start.y, right: start.x, bottom: start.y };
    let moved = false;

    const onMove = (moveEvent) => {
        const point = App.clientToWorld(moveEvent.clientX, moveEvent.clientY);
        bounds = {
            left: Math.min(start.x, point.x),
            top: Math.min(start.y, point.y),
            right: Math.max(start.x, point.x),
            bottom: Math.max(start.y, point.y),
        };
        if (bounds.right - bounds.left > 2 || bounds.bottom - bounds.top > 2) moved = true;
        band.style.left = `${bounds.left}px`;
        band.style.top = `${bounds.top}px`;
        band.style.width = `${bounds.right - bounds.left}px`;
        band.style.height = `${bounds.bottom - bounds.top}px`;
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        band.remove();
        if (!moved) return; // a plain click on empty space clears the selection via the click handler

        // Compare in world coordinates: x/y are stored, offsetWidth/Height are unscaled.
        const picked = App.allControls()
            .filter((control) =>
                control.x < bounds.right && control.x + control.el.offsetWidth > bounds.left &&
                control.y < bounds.bottom && control.y + control.el.offsetHeight > bounds.top)
            .map((control) => controlKey(control.id));

        App.setSelection([...new Set([...previous, ...picked])]);
        App.swallowNextClick();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

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
        .map((item) => Canvas.placeControl(item.type, item.x + 40, item.y + 40, item.inputCount))
        .filter(Boolean)
        .map((control) => controlKey(control.id));
    App.setSelection(keys);
};

// ---------------- Flip ----------------

export const flip = (axis) => {
    selectedControls().forEach((control) => {
        if (axis === 'h') control.flipH = !control.flipH;
        else control.flipV = !control.flipV;
        control.el.style.transform = `scale(${control.flipH ? -1 : 1}, ${control.flipV ? -1 : 1})`;
        App.emit('control:flip', control); // wires.js re-measures nodes and redraws attached wires
    });
};

// ---------------- Group ----------------

export const group = () => {
    const controls = selectedControls();
    if (controls.length < 2) return;
    const groupId = `grp-${nextGroupId++}`;
    controls.forEach((control) => {
        control.groupId = groupId;
    });
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
