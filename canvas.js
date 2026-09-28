/**
 * canvas.js — Palette & Canvas Interaction
 * ---------------------------------------------------------------------------
 * Per javascript.md §2:
 *   - Palette drag-and-drop: reads data-type, clones the matching <template>
 *     (#tpl-<type>, or the shared #tpl-logic-gate for the 9 gate types) into
 *     the canvas world and — for logic gates — reads data-min-inputs /
 *     data-default-inputs off the source .palette-item to build the right
 *     number of .node.node-in rows.
 *   - Control positioning: dragging a placed .control (or a selected group)
 *     around the world, updating x/y in app.js. main.js's mousedown router
 *     calls beginControlDrag(); this module registers no mousedown listener.
 *
 * Controls live in #canvas-world and are positioned in WORLD coordinates
 * (unscaled pixels, 0 .. WORLD_SIZE). Zoom scales the whole world as one
 * layer, so every control keeps its original size relative to the others.
 *
 * Also owns cleanup of a control's DOM element + node registrations when
 * app.js reports it removed (app.js only manages state, not the DOM).
 */
import * as App from './app.js';

const viewport = document.getElementById('canvas');
const world = document.getElementById('canvas-world');
const paletteItems = document.querySelectorAll('.palette-item');

const DRAG_THRESHOLD_PX = 3;
const CONTROL_MARGIN = 100; // keeps a control's top-left corner inside the world

const clampToWorld = (value) => Math.min(App.WORLD_SIZE - CONTROL_MARGIN, Math.max(0, Math.round(value)));

// ---------------- Palette drag source ----------------

paletteItems.forEach((item) => {
    item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', item.dataset.type);
        event.dataTransfer.effectAllowed = 'copy';
    });
});

viewport.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
});

viewport.addEventListener('drop', (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('text/plain');
    if (!type) return;
    const point = App.clientToWorld(event.clientX, event.clientY);
    // Land the control's top-left corner roughly under the cursor.
    placeControl(type, point.x - 30, point.y - 20);
});

// ---------------- Node registration helpers ----------------

const registerOutNode = (el, controlId) => {
    const node = el.querySelector('.node-out');
    if (!node) return;
    const nodeId = `${controlId}-out`;
    node.dataset.nodeId = nodeId;
    App.registerNode(nodeId, { el: node, controlId, kind: 'out', index: 0 });
};

const registerInNodes = (el, controlId) => {
    el.querySelectorAll('.node-in').forEach((node, index) => {
        const nodeId = `${controlId}-in-${index}`;
        node.dataset.nodeId = nodeId;
        App.registerNode(nodeId, { el: node, controlId, kind: 'in', index });
    });
};

/** Also used by popups.js to grow a gate's input count. */
export const addGateInputNode = (inputsWrap, controlId, index) => {
    const node = document.createElement('span');
    node.className = 'node node-in unattached';
    const nodeId = `${controlId}-in-${index}`;
    node.dataset.nodeId = nodeId;
    inputsWrap.appendChild(node);
    App.registerNode(nodeId, { el: node, controlId, kind: 'in', index });
    return node;
};

// ---------------- Placing a control ----------------

/**
 * Clone the right <template> into the world, register its nodes, and add it
 * to the data model. (left, top) is the control's top-left corner in WORLD
 * coordinates. Returns the new control, or null for an unknown type.
 */
export const placeControl = (type, left, top, defaultInputs) => {
    const isGate = App.GATE_TYPES.has(type);
    const template = document.getElementById(isGate ? 'tpl-logic-gate' : `tpl-${type}`);
    if (!template) return null;

    const el = template.content.cloneNode(true).querySelector('.control');
    const controlId = App.genControlId();
    el.dataset.id = controlId;
    el.style.position = 'absolute';
    el.style.left = `${clampToWorld(left)}px`;
    el.style.top = `${clampToWorld(top)}px`;

    let inputCount = 0;

    if (isGate) {
        el.dataset.type = type;
        const source = document.querySelector(`.palette-item[data-type="${type}"]`);
        const min = source ? parseInt(source.dataset.minInputs, 10) : 1;
        const fallback = source ? parseInt(source.dataset.defaultInputs, 10) : 2;
        inputCount = Math.max(min, defaultInputs || fallback);
        const inputsWrap = el.querySelector('.gate-inputs');
        for (let i = 0; i < inputCount; i++) addGateInputNode(inputsWrap, controlId, i);
        registerOutNode(el, controlId);
    } else if (type === 'four-bit-digit') {
        registerInNodes(el, controlId);
        inputCount = 4;
    } else if (type === 'light-bulb') {
        registerInNodes(el, controlId);
        inputCount = 1;
    } else {
        // toggle-switch, push-button, clock, high-constant, low-constant:
        // source controls with a single .node-out.
        registerOutNode(el, controlId);
    }

    world.appendChild(el);

    const control = {
        id: controlId,
        type,
        el,
        x: parseFloat(el.style.left),
        y: parseFloat(el.style.top),
        inputCount,
    };
    App.addControl(control);
    // Fired in addition to control:add so logic.js / wires.js can attach
    // behavior and measure geometry once the element is really in the DOM.
    App.emit('control:placed', control);
    return control;
};

// ---------------- DOM cleanup when app.js removes a control ----------------

App.events.addEventListener('control:remove', (event) => {
    const control = event.detail;
    control.el.querySelectorAll('[data-node-id]').forEach((node) => App.unregisterNode(node.dataset.nodeId));
    control.el.remove();
});

// ---------------- Repositioning placed controls ----------------

/**
 * Start dragging a control (or the whole selection if it is part of one).
 * Called by main.js's mousedown router.
 */
export const beginControlDrag = (event, controlEl) => {
    const id = controlEl.dataset.id;
    const startX = event.clientX;
    const startY = event.clientY;

    // Move the whole selection together if this control is part of one.
    const selectedIds = App.getSelection()
        .filter((key) => key.startsWith('c:'))
        .map((key) => key.slice(2));
    const movingIds = selectedIds.includes(id) ? selectedIds : [id];

    const starts = movingIds
        .map((controlId) => App.getControl(controlId))
        .filter(Boolean)
        .map((control) => ({ id: control.id, x: control.x, y: control.y }));

    let moved = false;

    const onMove = (moveEvent) => {
        const screenDx = moveEvent.clientX - startX;
        const screenDy = moveEvent.clientY - startY;
        if (!moved && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD_PX) return;
        moved = true;

        const zoom = App.getZoom();
        starts.forEach((start) => {
            const control = App.getControl(start.id);
            if (!control) return;
            control.x = clampToWorld(start.x + screenDx / zoom);
            control.y = clampToWorld(start.y + screenDy / zoom);
            control.el.style.left = `${control.x}px`;
            control.el.style.top = `${control.y}px`;
            App.emit('control:move', control);
        });
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) App.swallowNextClick();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};
