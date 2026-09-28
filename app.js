/**
 * app.js — Shared Data Model
 * ---------------------------------------------------------------------------
 * Single source of truth for the simulator (javascript.md §1). Every other
 * module reads/writes state through the functions exported here and reacts to
 * change notifications via `events` (a plain EventTarget) instead of touching
 * another module's internals.
 *
 * Data shapes:
 *   control: { id, type, el, x, y, inputCount, note?, groupId?, flipH?, flipV?,
 *              clockValue?, capApproved?, tableCapApproved? }
 *              x / y are WORLD coordinates (unscaled canvas pixels).
 *   wire:    { id, fromNodeId, toNodeId, fromControlId, toControlId,
 *              pathEl, outlineEl, signal }
 *   node registry entry: { el, controlId, kind: 'in' | 'out', index }
 *
 * Node IDs are deterministic strings: "<controlId>-out", "<controlId>-in-<i>".
 *
 * Events fired on `events` (all CustomEvents, payload in `detail`):
 *   control:add / control:placed / control:move / control:remove
 *   control:inputcount / control:flip
 *   wire:add / wire:remove
 *   selection:change / zoom:change / simulation:update
 */

// ---------------- Constants shared across modules ----------------

/** Practical size limit of the "infinite" canvas, in unscaled pixels. */
export const WORLD_SIZE = 20000;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;

export const GATE_TYPES = new Set(['buffer', 'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'tri-state']);

/** Buffer and NOT are single-input gates: their input count never changes. */
export const FIXED_INPUT_TYPES = new Set(['buffer', 'not']);

// ---------------- Events ----------------

export const events = new EventTarget();

export const emit = (name, detail) => {
    events.dispatchEvent(new CustomEvent(name, { detail }));
};

// ---------------- Internal state ----------------

let nextControlId = 1;
let nextWireId = 1;
let zoom = 1;

const controls = new Map();       // controlId -> control
const wires = new Map();          // wireId -> wire
const nodeIndex = new Map();      // nodeId -> { el, controlId, kind, index }
const wiresByControl = new Map(); // controlId -> Set<wire>
const wiresFromNode = new Map();  // output nodeId -> Set<wire>
const wireIntoNode = new Map();   // input nodeId -> wire (an input holds at most one)
const selection = new Set();      // "c:<id>" / "w:<id>" keys

export const genControlId = () => `ctrl-${nextControlId++}`;
export const genWireId = () => `wire-${nextWireId++}`;

// ---------------- Controls ----------------

export const addControl = (control) => {
    controls.set(control.id, control);
    emit('control:add', control);
    return control;
};

export const getControl = (id) => controls.get(id);

export const allControls = () => [...controls.values()];

export const removeControl = (id) => {
    const control = controls.get(id);
    if (!control) return;
    // Remove attached wires first so listeners (wires.js) can clean up paths
    // and the "unattached" state before the control and its nodes go away.
    getWiresForControl(id).forEach((wire) => removeWire(wire.id));
    controls.delete(id);
    wiresByControl.delete(id);
    selection.delete(`c:${id}`);
    emit('control:remove', control);
};

// ---------------- Node registry ----------------

export const registerNode = (nodeId, info) => {
    nodeIndex.set(nodeId, info);
};

export const unregisterNode = (nodeId) => {
    nodeIndex.delete(nodeId);
};

export const getNode = (nodeId) => nodeIndex.get(nodeId);

// ---------------- Wires ----------------

const indexWire = (map, key, wire) => {
    if (key === null || key === undefined) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(wire);
};

const unindexWire = (map, key, wire) => {
    if (key === null || key === undefined) return;
    const set = map.get(key);
    if (!set) return;
    set.delete(wire);
    if (set.size === 0) map.delete(key);
};

export const addWire = (wire) => {
    const from = nodeIndex.get(wire.fromNodeId);
    const to = nodeIndex.get(wire.toNodeId);
    wire.fromControlId = from ? from.controlId : null;
    wire.toControlId = to ? to.controlId : null;

    wires.set(wire.id, wire);
    wireIntoNode.set(wire.toNodeId, wire);
    indexWire(wiresFromNode, wire.fromNodeId, wire);
    indexWire(wiresByControl, wire.fromControlId, wire);
    indexWire(wiresByControl, wire.toControlId, wire);
    emit('wire:add', wire);
    return wire;
};

export const removeWire = (id) => {
    const wire = wires.get(id);
    if (!wire) return;
    wires.delete(id);
    if (wireIntoNode.get(wire.toNodeId) === wire) wireIntoNode.delete(wire.toNodeId);
    unindexWire(wiresFromNode, wire.fromNodeId, wire);
    unindexWire(wiresByControl, wire.fromControlId, wire);
    unindexWire(wiresByControl, wire.toControlId, wire);
    selection.delete(`w:${id}`);
    emit('wire:remove', wire);
};

export const getWire = (id) => wires.get(id);

export const allWires = () => [...wires.values()];

/** The single wire feeding an input node, or undefined. */
export const getWireInto = (nodeId) => wireIntoNode.get(nodeId);

/** Every wire leaving an output node. */
export const getWiresFromNode = (nodeId) => [...(wiresFromNode.get(nodeId) || [])];

/** Every wire touching any node of a control. */
export const getWiresForControl = (controlId) => [...(wiresByControl.get(controlId) || [])];

/** True when an INPUT node already has its one wire. */
export const isNodeOccupied = (nodeId) => wireIntoNode.has(nodeId);

// ---------------- Connected circuits ----------------

/** Ids of every control reachable from `startId` through wires (inclusive). */
export const getConnectedControlIds = (startId) => {
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length > 0) {
        const id = stack.pop();
        getWiresForControl(id).forEach((wire) => {
            [wire.fromControlId, wire.toControlId].forEach((other) => {
                if (other !== null && !seen.has(other)) {
                    seen.add(other);
                    stack.push(other);
                }
            });
        });
    }
    return seen;
};

/** Every group of 2+ wired-together controls, as arrays of controls. */
export const getComponents = () => {
    const visited = new Set();
    const groups = [];
    controls.forEach((control) => {
        if (visited.has(control.id)) return;
        const ids = getConnectedControlIds(control.id);
        ids.forEach((id) => visited.add(id));
        if (ids.size > 1) groups.push([...ids].map((id) => controls.get(id)).filter(Boolean));
    });
    return groups;
};

// ---------------- Selection ----------------

const emitSelection = () => emit('selection:change', [...selection]);

export const setSelection = (keys) => {
    selection.clear();
    keys.forEach((key) => selection.add(key));
    emitSelection();
};

export const addToSelection = (key) => {
    selection.add(key);
    emitSelection();
};

export const removeFromSelection = (key) => {
    selection.delete(key);
    emitSelection();
};

export const clearSelection = () => {
    if (selection.size === 0) return;
    selection.clear();
    emitSelection();
};

export const getSelection = () => [...selection];

export const isSelected = (key) => selection.has(key);

// ---------------- Zoom + viewport helpers ----------------

export const getZoom = () => zoom;

export const setZoom = (value) => {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    emit('zoom:change', zoom);
    return zoom;
};

/** Convert a mouse position (client px) into WORLD coordinates. */
export const clientToWorld = (clientX, clientY) => {
    const viewport = document.getElementById('canvas');
    const rect = viewport.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewport.clientLeft + viewport.scrollLeft) / zoom,
        y: (clientY - rect.top - viewport.clientTop + viewport.scrollTop) / zoom,
    };
};

/**
 * After a drag (pan / move / rubber-band) the browser still fires a click on
 * mouseup, which would clear or change the selection. Swallow that one click.
 */
export const swallowNextClick = () => {
    const viewport = document.getElementById('canvas');
    const handler = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };
    viewport.addEventListener('click', handler, { capture: true, once: true });
    setTimeout(() => viewport.removeEventListener('click', handler, true), 50);
};
