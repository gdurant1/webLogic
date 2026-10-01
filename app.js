/**
 * app.js — Shared Data Model (JointJS-backed)
 * ---------------------------------------------------------------------------
 * Same public API as the pre-JointJS version, so limits.js, tables.js,
 * logic.js and popups.js barely had to change: addControl/removeControl,
 * getWireInto/getWiresForControl/getComponents, selection helpers, zoom.
 * Internally, state now lives in a `joint.dia.Graph` (`graph`) instead of
 * hand-rolled Maps, and canvas.js owns the `joint.dia.Paper` that renders it
 * — it calls setGraph()/setPaper() once, before anything else runs.
 *
 * Node ids ("<controlId>-out", "<controlId>-in-<i>") are now literally the
 * JointJS port ids (see shapes.js), so there is no separate node registry:
 * getNode() parses the id and looks the port's DOM magnet up on demand via
 * the `port="…"` attribute JointJS itself renders — one less thing to keep
 * in sync by hand.
 *
 * `control.el` is the live SVG <g> for that cell's view (cellView.el).
 * Existing class-based DOM code elsewhere (logic.js's `.classList.toggle`,
 * `.querySelector('.digit-display')`, etc.) keeps working unchanged, because
 * SVGElement supports classList/querySelector exactly like HTML elements.
 */

export const WORLD_SIZE = 20000; // paper size in unscaled (model) px — a practical limit
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;

export const GATE_TYPES = new Set(['buffer', 'not', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'tri-state']);
export const FIXED_INPUT_TYPES = new Set(['buffer', 'not']);

// ---------------- Events (unchanged shape) ----------------

export const events = new EventTarget();
export const emit = (name, detail) => events.dispatchEvent(new CustomEvent(name, { detail }));

// ---------------- Graph / paper wiring (set once by canvas.js) ----------------

let graph = null;
let paper = null;

export const setGraph = (g) => { graph = g; };
export const setPaper = (p) => { paper = p; };
export const getGraph = () => graph;
export const getPaper = () => paper;

// ---------------- Controls ----------------
// controls: Map<id, control>. control.cell is the source of truth for
// position/ports; x/y are kept in sync by canvas.js's 'change:position'
// listener for code that reads them directly (tables.js's bounding checks
// were replaced by paper.findViewsInArea, so this is now mostly for logging).

const controls = new Map();
const selection = new Set(); // "c:<id>" / "w:<id>" keys

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
    getWiresForControl(id).forEach((wire) => removeWire(wire.id));
    controls.delete(id);
    selection.delete(`c:${id}`);
    if (control.cell && graph && graph.getCell(control.cell.id)) control.cell.remove();
    emit('control:remove', control);
};

// ---------------- Wires ----------------
// wires: Map<id, wire>. wire.cell is the joint.dia.Link.
//
// getWireInto/getWiresFromNode/getWiresForControl used to be a .filter() over
// every wire on every call — fine for a handful of wires, but evaluate() and
// tables.js's rebuild() each call these once per gate per pass, so it adds up
// on larger circuits. Three maintained indexes make all three O(1)/O(k)
// (k = results, not total wires) instead of O(total wires). Public API is
// unchanged — only addWire/removeWire's internals grew.

const wires = new Map();
const wireIntoNode = new Map();       // toNodeId -> wire (an input holds at most one)
const wiresFromNode = new Map();      // fromNodeId -> Set<wire>
const wiresForControl = new Map();    // controlId -> Set<wire>

const indexAdd = (map, key, wire) => {
    if (key === null || key === undefined) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(wire);
};

const indexRemove = (map, key, wire) => {
    if (key === null || key === undefined) return;
    const set = map.get(key);
    if (!set) return;
    set.delete(wire);
    if (set.size === 0) map.delete(key);
};

export const addWire = (wire) => {
    wires.set(wire.id, wire);
    wireIntoNode.set(wire.toNodeId, wire);
    indexAdd(wiresFromNode, wire.fromNodeId, wire);
    indexAdd(wiresForControl, wire.fromControlId, wire);
    indexAdd(wiresForControl, wire.toControlId, wire);
    emit('wire:add', wire);
    return wire;
};

export const getWire = (id) => wires.get(id);
export const allWires = () => [...wires.values()];

export const removeWire = (id) => {
    const wire = wires.get(id);
    if (!wire) return;
    wires.delete(id);
    if (wireIntoNode.get(wire.toNodeId) === wire) wireIntoNode.delete(wire.toNodeId);
    indexRemove(wiresFromNode, wire.fromNodeId, wire);
    indexRemove(wiresForControl, wire.fromControlId, wire);
    indexRemove(wiresForControl, wire.toControlId, wire);
    selection.delete(`w:${id}`);
    if (wire.cell && graph && graph.getCell(wire.cell.id)) wire.cell.remove();
    emit('wire:remove', wire);
};

/** The single wire feeding an input node, or undefined. O(1). */
export const getWireInto = (nodeId) => wireIntoNode.get(nodeId);

/** Every wire leaving an output node. O(k). */
export const getWiresFromNode = (nodeId) => [...(wiresFromNode.get(nodeId) || [])];

/** Every wire touching any node of a control. O(k). */
export const getWiresForControl = (controlId) => [...(wiresForControl.get(controlId) || [])];

/** True when an INPUT node already has its one wire. O(1). */
export const isNodeOccupied = (nodeId) => wireIntoNode.has(nodeId);

// ---------------- Node lookup (computed on demand — see file header) ----------------
// Node ids come in three shapes: "<id>-out" (every built-in source has
// exactly one, unindexed output), "<id>-in-<i>" (any gate/sink input), and
// "<id>-out-<i>" (a custom gate's possibly-multiple outputs — see
// shapes.js's createCustomGate). The regex's alternation order matters:
// "out-(\d+)" must be tried before the bare "out", or "-out-0" would never
// match it (bare "out" would consume just "out" and leave "-0" unparsed,
// failing the full-string anchor).

const NODE_ID_RE = /^(.+)-(out-(\d+)|out|in-(\d+))$/;

export const getNode = (nodeId) => {
    const match = NODE_ID_RE.exec(nodeId);
    if (!match || !graph || !paper) return null;
    const controlId = match[1];
    const kind = match[2].startsWith('in') ? 'in' : 'out';
    const index = kind === 'in' ? Number(match[4]) : Number(match[3] || 0);
    const cell = graph.getCell(controlId);
    if (!cell) return null;
    const view = paper.findViewByModel(cell);
    if (!view) return null;
    const el = view.el.querySelector(`[port="${CSS.escape(nodeId)}"]`);
    if (!el) return null;
    return { el, controlId, kind, index };
};

// ---------------- Connected circuits ----------------

export const getConnectedControlIds = (startId) => {
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length > 0) {
        const id = stack.pop();
        getWiresForControl(id).forEach((wire) => {
            [wire.fromControlId, wire.toControlId].forEach((other) => {
                if (other !== null && other !== undefined && !seen.has(other)) {
                    seen.add(other);
                    stack.push(other);
                }
            });
        });
    }
    return seen;
};

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

export const setSelection = (keys) => { selection.clear(); keys.forEach((k) => selection.add(k)); emitSelection(); };
export const addToSelection = (key) => { selection.add(key); emitSelection(); };
export const removeFromSelection = (key) => { selection.delete(key); emitSelection(); };
export const clearSelection = () => { if (selection.size === 0) return; selection.clear(); emitSelection(); };
export const getSelection = () => [...selection];
export const isSelected = (key) => selection.has(key);

// ---------------- Zoom ----------------
// The actual scale lives on the Paper (paper.scale()); this just tracks the
// number for code that wants it without reaching into the paper.

let zoom = 1;
export const getZoom = () => zoom;
export const setZoom = (value) => {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    emit('zoom:change', zoom);
    return zoom;
};

// ---------------- World bounds (Task 6.10) ----------------
// The world is 0..WORLD_SIZE on both axes. Previously placement clamped
// only to >=0 and to a flat (WORLD_SIZE - 100) approximation regardless of
// a control's real size; this clamps to the control's ACTUAL width/height
// so nothing can ever be placed, dragged, or group-dragged with any part of
// its box outside the real world rectangle.

/** Clamp a top-left (x, y) so a box of (width, height) stays inside the world. */
export const clampToWorldBounds = (x, y, width, height) => ({
    x: Math.min(WORLD_SIZE - width, Math.max(0, x)),
    y: Math.min(WORLD_SIZE - height, Math.max(0, y)),
});

/**
 * After a drag (pan / move / rubber-band) the browser still fires a click,
 * which would clear or change the selection. Swallow that one click.
 */
export const swallowNextClick = () => {
    if (!paper) return;
    const handler = (event) => { event.stopPropagation(); event.preventDefault(); };
    paper.el.addEventListener('click', handler, { capture: true, once: true });
    setTimeout(() => paper.el.removeEventListener('click', handler, true), 50);
};
