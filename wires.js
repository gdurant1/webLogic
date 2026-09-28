/**
 * wires.js — Wire Management
 * ---------------------------------------------------------------------------
 * Per javascript.md §3 / htmlPromptForCSS.md §4b2:
 *   - A wire drag starts on mousedown over a .node-out (main.js's router calls
 *     beginWireDrag()). Output nodes accept unlimited outgoing wires.
 *   - Input nodes accept at most one wire; a drop on an occupied input is
 *     rejected (the node gets a brief red .reject-flash).
 *   - While dragging, every not-yet-occupied .node-in gets .drop-target; it
 *     is cleared the moment the drag ends.
 *   - Connections are checked against the circuit gate limit (limits.js)
 *     before the wire is created.
 *   - Each wire = a dark outline <path> under the colored <path>, drawn into
 *     the #wire-layer SVG inside the canvas world.
 *
 * Performance: wire endpoints are computed from STORED coordinates —
 * control.x / control.y plus each node's cached offset inside its control —
 * so dragging never reads layout per wire. Offsets are measured once
 * (placement, input-count change, flip, fonts loaded). Moves mark controls
 * dirty and one requestAnimationFrame updates only the wires attached to
 * them.
 *
 * Wire direction: outputs leave to the right and inputs enter from the left,
 * except a node with data-side="..." (the light bulb's input is "bottom").
 * flipH / flipV mirror those sides.
 */
import * as App from './app.js';
import * as Limits from './limits.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('wire-layer');

const DIRECTIONS = {
    left: [-1, 0],
    right: [1, 0],
    top: [0, -1],
    bottom: [0, 1],
};

// ---------------- Cached node geometry ----------------

const nodeOffsets = new Map(); // nodeId -> { x, y } node center inside its control (unscaled px)

/** Measure every node of one control. Call after anything that moves nodes. */
export const measureControl = (control) => {
    const zoom = App.getZoom();
    const controlRect = control.el.getBoundingClientRect();
    control.el.querySelectorAll('[data-node-id]').forEach((nodeEl) => {
        const rect = nodeEl.getBoundingClientRect();
        nodeOffsets.set(nodeEl.dataset.nodeId, {
            x: (rect.left + rect.width / 2 - controlRect.left) / zoom,
            y: (rect.top + rect.height / 2 - controlRect.top) / zoom,
        });
    });
};

const measureAll = () => {
    App.allControls().forEach(measureControl);
    App.allWires().forEach(updateWirePath);
};

const flipSide = (side, control) => {
    if (control.flipH && side === 'left') return 'right';
    if (control.flipH && side === 'right') return 'left';
    if (control.flipV && side === 'top') return 'bottom';
    if (control.flipV && side === 'bottom') return 'top';
    return side;
};

/** World-space center of a node plus the side its wire leaves/enters from. */
const nodePoint = (nodeId) => {
    const info = App.getNode(nodeId);
    if (!info) return null;
    const control = App.getControl(info.controlId);
    if (!control) return null;
    if (!nodeOffsets.has(nodeId)) measureControl(control);
    const offset = nodeOffsets.get(nodeId);
    if (!offset) return null;
    const baseSide = info.el.dataset.side || (info.kind === 'in' ? 'left' : 'right');
    return { x: control.x + offset.x, y: control.y + offset.y, side: flipSide(baseSide, control) };
};

// ---------------- Path geometry ----------------

const buildPath = (from, fromSide, to, toSide) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const handle = Math.max(40, Math.min(distance / 2, 240));
    const [ax, ay] = DIRECTIONS[fromSide];
    const [bx, by] = DIRECTIONS[toSide];
    return `M ${from.x} ${from.y} C ${from.x + ax * handle} ${from.y + ay * handle}, ${to.x + bx * handle} ${to.y + by * handle}, ${to.x} ${to.y}`;
};

const makePath = (className) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    svg.appendChild(path);
    return path;
};

function updateWirePath(wire) {
    const from = nodePoint(wire.fromNodeId);
    const to = nodePoint(wire.toNodeId);
    if (!from || !to) return;
    const d = buildPath(from, from.side, to, to.side);
    wire.pathEl.setAttribute('d', d);
    wire.outlineEl.setAttribute('d', d);
}

// ---------------- requestAnimationFrame batching ----------------

const dirtyControlIds = new Set();
let frameQueued = false;

const flushWireUpdates = () => {
    frameQueued = false;
    const dirtyWires = new Set();
    dirtyControlIds.forEach((id) => App.getWiresForControl(id).forEach((wire) => dirtyWires.add(wire)));
    dirtyControlIds.clear();
    dirtyWires.forEach(updateWirePath);
};

const queueWireUpdate = (controlId) => {
    dirtyControlIds.add(controlId);
    if (!frameQueued) {
        frameQueued = true;
        requestAnimationFrame(flushWireUpdates);
    }
};

// ---------------- Keeping wires attached ----------------

App.events.addEventListener('control:placed', (event) => measureControl(event.detail));

App.events.addEventListener('control:move', (event) => queueWireUpdate(event.detail.id));

['control:inputcount', 'control:flip'].forEach((name) => {
    App.events.addEventListener(name, (event) => {
        measureControl(event.detail);
        queueWireUpdate(event.detail.id);
    });
});

App.events.addEventListener('control:remove', (event) => {
    const prefix = `${event.detail.id}-`;
    [...nodeOffsets.keys()].forEach((key) => {
        if (key.startsWith(prefix)) nodeOffsets.delete(key);
    });
});

App.events.addEventListener('wire:remove', (event) => {
    const wire = event.detail;
    wire.pathEl.remove();
    wire.outlineEl.remove();
    // An input node with no wire left goes back to its idle look.
    const to = App.getNode(wire.toNodeId);
    if (to && !App.isNodeOccupied(wire.toNodeId)) to.el.classList.add('unattached');
});

// Node sizes can shift once web fonts / layout settle, so measure again.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
window.addEventListener('load', measureAll);

// ---------------- Creating a permanent wire ----------------

export const createWire = (fromNodeId, toNodeId) => {
    const wireId = App.genWireId();
    // Two stacked paths: a thicker dark outline underneath keeps the wire
    // visible even when its signal color is white/low.
    const outlineEl = makePath('wire-outline');
    const pathEl = makePath('wire');

    pathEl.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = `w:${wireId}`;
        if (event.ctrlKey || event.metaKey) {
            if (App.isSelected(key)) App.removeFromSelection(key);
            else App.addToSelection(key);
        } else {
            App.setSelection([key]);
        }
    });

    const wire = { id: wireId, fromNodeId, toNodeId, pathEl, outlineEl, signal: undefined };
    App.addWire(wire);
    updateWirePath(wire);

    const toInfo = App.getNode(toNodeId);
    if (toInfo) toInfo.el.classList.remove('unattached');
    return wire;
};

// ---------------- Dragging a new wire out of an output node ----------------

const markDropTargets = (on) => {
    document.querySelectorAll('.node-in').forEach((node) => {
        const nodeId = node.dataset.nodeId;
        node.classList.toggle('drop-target', Boolean(on && nodeId && !App.isNodeOccupied(nodeId)));
    });
};

const flashReject = (nodeEl) => {
    nodeEl.classList.add('reject-flash');
    setTimeout(() => nodeEl.classList.remove('reject-flash'), 300);
};

const attemptConnect = async (fromNodeId, toNodeId) => {
    const check = Limits.checkConnection(fromNodeId, toNodeId);
    if (check.needsApproval) {
        const approved = await Limits.requestCircuitApproval(check.gateCount, check.controlIds);
        if (!approved) return;
    }
    // The dialog is modal, but re-check in case anything changed meanwhile.
    if (!App.getNode(fromNodeId) || !App.getNode(toNodeId) || App.isNodeOccupied(toNodeId)) return;
    createWire(fromNodeId, toNodeId);
};

/** Called by main.js's mousedown router when the press lands on a .node-out. */
export const beginWireDrag = (event, nodeEl) => {
    const fromNodeId = nodeEl.dataset.nodeId;
    if (!fromNodeId) return;
    const start = nodePoint(fromNodeId);
    if (!start) return;

    event.preventDefault(); // no text selection / native drag while wiring

    const pending = makePath('wire pending');
    pending.style.pointerEvents = 'none'; // never let the preview block the drop hit-test
    markDropTargets(true);

    const drawTo = (clientX, clientY) => {
        const point = App.clientToWorld(clientX, clientY);
        pending.setAttribute('d', buildPath(start, start.side, point, 'left'));
    };
    drawTo(event.clientX, event.clientY);

    const onMove = (moveEvent) => drawTo(moveEvent.clientX, moveEvent.clientY);

    const onUp = (upEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        pending.remove();
        markDropTargets(false);

        // elementsFromPoint (plural) so a wire lying across a node cannot hide it.
        const targetNode = document
            .elementsFromPoint(upEvent.clientX, upEvent.clientY)
            .find((el) => el.classList && el.classList.contains('node-in'));
        if (!targetNode) return;

        const toNodeId = targetNode.dataset.nodeId;
        if (!toNodeId) return;
        if (toNodeId !== fromNodeId && !App.isNodeOccupied(toNodeId)) {
            attemptConnect(fromNodeId, toNodeId);
        } else {
            flashReject(targetNode); // e.g. that input already has a wire
        }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};
