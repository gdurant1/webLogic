/**
 * canvas.js — Paper Setup, Palette & Pan/Zoom
 * ---------------------------------------------------------------------------
 * Owns the one `joint.dia.Paper` for the app, built on `joint.dia.Graph`
 * (both JointJS open-source core — see shapes.js's header for why this
 * isn't `joint.shapes.logic` or Rappid). Everything else (wires.js,
 * selection.js, logic.js, tables.js) talks to the graph only through
 * app.js's API, never to `joint` directly, except this file and wires.js.
 *
 * Palette drag-and-drop: JointJS core has no ready-made stencil panel (that
 * is a Rappid widget, `ui.Stencil`), so the left-panel `.palette-item`s stay
 * plain HTML with native HTML5 drag/drop, same as before — dropping one
 * creates the matching JointJS element instead of cloning an HTML
 * `<template>`.
 *
 * Pan & zoom are built on JointJS's own core primitives, per the "use
 * JointJS's own pan/zoom" instruction:
 *   - `paper.scale()` / `paper.translate()` — the actual zoom and pan state.
 *   - Dragging empty canvas pans by adjusting `paper.translate()` (core has
 *     no built-in drag-to-pan either — that's Rappid's `ui.PaperScroller` —
 *     so this part is still hand-rolled, just against the paper instead of
 *     a CSS transform on a hand-built world div).
 *   - The mouse wheel zooms toward the cursor: the standard JointJS
 *     recipe of reading the cursor's LOCAL point before rescaling, then
 *     nudging `paper.translate()` so that same local point stays under the
 *     cursor afterward.
 */
import * as App from './app.js';
import * as Shapes from './shapes.js';
import * as Limits from './limits.js';

const ZOOM_STEP = 0.1; // 10%, matching the old slider's step
const PAN_THRESHOLD_PX = 3;

const host = document.getElementById('paper-host');
const leftPanel = document.getElementById('left-panel');

// JointJS writes options.width/height onto paper.el as literal inline CSS
// pixels, so it must NOT be handed #paper-host (a flex item whose size the
// layout owns). Instead the paper mounts on an inner #paper div that is
// absolutely positioned to fill #paper-host and sized 100% x 100% — the
// paper is then always exactly the visible viewport, no ResizeObserver
// needed (so no feedback loop with the flex layout). The "infinite" world
// is purely the model coordinate space, moved via translate()/scale();
// App.WORLD_SIZE is only used to clamp where controls may be placed.
const paperEl = document.createElement('div');
paperEl.id = 'paper';
host.appendChild(paperEl);

const graph = new joint.dia.Graph({}, { cellNamespace: Shapes.namespace });
const paper = new joint.dia.Paper({
    el: paperEl,
    model: graph,
    width: '100%',
    height: '100%',
    gridSize: 1,
    background: { color: 'transparent' }, // the dot grid is drawn by CSS on #paper-host, see style.css
    cellViewNamespace: Shapes.namespace,
    defaultLink: () => new Shapes.Wire(),
    defaultConnectionPoint: { name: 'boundary' },
    linkPinning: false, // an incomplete drag (not dropped on a valid port) just vanishes
    // Real bounds (Task 6.10): a single-element drag can never leave the
    // world rectangle. Group-drag (selection.js, hand-rolled) clamps itself
    // the same way using App.clampToWorldBounds.
    restrictTranslate: { x: 0, y: 0, width: App.WORLD_SIZE, height: App.WORLD_SIZE },
    // Links aren't draggable by their body (only via their tools). A control
    // that is part of a multi-selection also skips JointJS's own single-
    // element drag — selection.js moves the whole selection together by
    // hand in that case. A single selected (or unselected) control still
    // uses JointJS's normal built-in drag.
    //
    // IMPORTANT, two things verified directly against this project's actual
    // joint.js, neither assumed:
    //   1. `options.interactive(cellView)` is called with ONE argument
    //      (`isFunction(this.options.interactive) ? this.options.
    //      interactive(this) : ...`, where `this` is the cellView) — there
    //      is no second `method` parameter, ever, in this version. An
    //      `(cellView, method) => ... method === 'elementMove'` check (the
    //      previous shape of this function) silently never matched, so
    //      every exception below used to be dead code.
    //   2. `can(feature)` — what actually gates elementMove, addLinkFromMagnet,
    //      etc. — accepts an interactive value that is EITHER a plain
    //      boolean OR a per-feature object: `(isObject(interactive) &&
    //      interactive[feature] !== false) || (isBoolean(interactive) &&
    //      interactive !== false)`. Returning a blanket `false` for a
    //      ToggleSwitch/PushButton — this function's first working version —
    //      disabled EVERY feature on it, including dragging a wire out of
    //      its own output port (addLinkFromMagnet), not just elementMove —
    //      a real, caught-by-testing bug, not a guess. Returning
    //      `{ elementMove: false }` instead disables only that one feature;
    //      every other key (addLinkFromMagnet included) is simply absent,
    //      and an absent key reads as "not false", i.e. still allowed.
    interactive: (cellView) => {
        if (cellView.model.isLink()) return false;

        // Toggle switches and push buttons stay fully interactive, elementMove
        // included: a plain click (no real movement) resolves to
        // element:pointerclick regardless of whether elementMove is enabled
        // — JointJS's own move-threshold is what decides click vs. drag, not
        // this option — so there is no actual race to prevent here, and
        // Task 2 explicitly requires both "click anywhere toggles it" AND
        // "can still be dragged to a new position" to be true at once. (An
        // earlier version of this function disabled elementMove for these
        // two types specifically to "protect" the click, which was based on
        // a mistaken assumption and, caught by testing, broke dragging them
        // entirely — corrected here.)

        const selected = App.getSelection();
        const controlKeys = selected.filter((key) => key.startsWith('c:'));
        if (controlKeys.length > 1 && selected.includes(`c:${cellView.model.id}`)) return { elementMove: false };

        return true;
    },
    validateConnection: (sourceView, sourceMagnet, targetView, targetMagnet, end, linkView) => {
        if (!sourceMagnet || !targetMagnet) return false;
        if (sourceView === targetView) return false; // no self-loops
        const fromId = sourceMagnet.getAttribute('port');
        const toId = targetMagnet.getAttribute('port');
        if (!fromId || !toId) return false;
        // Wires run output -> input only, and an input accepts at most one.
        // Uses App.getNode()'s own id parsing (kind: 'in' | 'out') rather than
        // a plain `fromId.endsWith('-out')` string check — a custom gate's
        // output ids are indexed ("<id>-out-0", for when there's more than
        // one), which don't end in the bare "-out" every other source uses,
        // so that check silently rejected every connection out of a custom
        // gate's output (caught by testing: the drag just fizzled with no
        // wire and no error, since validateConnection fails silently by
        // design).
        const fromNode = App.getNode(fromId);
        const toNode = App.getNode(toId);
        if (!fromNode || !toNode || fromNode.kind !== 'out' || toNode.kind !== 'in') return false;
        if (App.isNodeOccupied(toId)) return false;
        return true;
    },
});

App.setGraph(graph);
App.setPaper(paper);

// ---------------- Dot-grid background & sizing ----------------
// Drawn with CSS on #paper-host (see style.css) instead of Paper's own grid
// renderer, so it keeps the exact look (and dark-mode color token) the
// hand-built canvas used.

export const getGraphInstance = () => graph;
export const getPaperInstance = () => paper;

// ---------------- Placing controls ----------------

const GATE_DEFAULT_INPUTS = {
    buffer: 1, not: 1, and: 2, nand: 2, or: 2, nor: 2, xor: 2, xnor: 2, 'tri-state': 2,
};

/**
 * Create one control (gate or otherwise) of `type` at world (left, top) and
 * register it with app.js. Mirrors the old canvas.js's placeControl(),
 * minus the DOM-template cloning — a JointJS cell is the "el" now.
 *
 * `customGateId` is used only for type === 'custom': the id of a definition
 * registered by customGates.js (see that file for the definition shape).
 */
export const placeControl = (type, left, top, defaultInputs, customGateId) => {
    const isGate = App.GATE_TYPES.has(type);
    let cell;
    let inputCount = 0;
    let customGateWeight; // set only when type === 'custom'; read by limits.js's countGates via control.gateWeight

    if (isGate) {
        const source = document.querySelector(`.palette-item[data-type="${type}"]`);
        const min = source ? parseInt(source.dataset.minInputs, 10) : 1;
        const fallback = (source && parseInt(source.dataset.defaultInputs, 10)) || GATE_DEFAULT_INPUTS[type] || 2;
        inputCount = Math.max(min, defaultInputs || fallback);
        cell = Shapes.createGate(type, inputCount);
    } else if (type === 'toggle-switch') {
        cell = Shapes.addPorts(new Shapes.ToggleSwitch(), 'out');
    } else if (type === 'push-button') {
        cell = Shapes.addPorts(new Shapes.PushButton(), 'out');
    } else if (type === 'clock') {
        cell = Shapes.addPorts(new Shapes.Clock(), 'out');
    } else if (type === 'high-constant') {
        cell = Shapes.addPorts(new Shapes.HighConstant(), 'out');
    } else if (type === 'low-constant') {
        cell = Shapes.addPorts(new Shapes.LowConstant(), 'out');
    } else if (type === 'light-bulb') {
        cell = Shapes.addPorts(new Shapes.LightBulb(), 'in');
        inputCount = 1;
    } else if (type === 'four-bit-digit') {
        cell = Shapes.addPorts(new Shapes.FourBitDigit(), 'in', 4);
        inputCount = 4;
    } else if (type === 'custom') {
        // customGates.js owns the actual definition registry; canvas.js
        // never imports it directly (that file imports THIS one, for
        // getGraphInstance/getPaperInstance, so a static import back here
        // would be circular). It registers this resolver once at its own
        // module-load time instead — see setCustomDefinitionResolver below.
        const definition = resolveCustomDefinition && resolveCustomDefinition(customGateId);
        if (!definition) return null;
        cell = Shapes.createCustomGate(definition.id, definition.name, definition.inputCount, definition.outputCount);
        inputCount = definition.inputCount;
        customGateWeight = definition.gateWeight; // read by limits.js's countGates, below
    } else {
        return null;
    }

    const { width, height } = cell.size();
    const clamped = App.clampToWorldBounds(left, top, width, height);
    cell.position(clamped.x, clamped.y);
    cell.addTo(graph);

    const control = { id: cell.id, type: type === 'custom' ? `custom:${customGateId}` : type, cell, el: null, x: clamped.x, y: clamped.y, inputCount };
    if (customGateWeight !== undefined) control.gateWeight = customGateWeight;
    App.addControl(control);

    // The view only exists once the cell is in the graph and the paper has
    // rendered it; Paper renders synchronously on 'add' for a graph it's
    // already listening to, so this is already true by the next line.
    const view = paper.findViewByModel(cell);
    control.el = view ? view.el : null;
    Shapes.stampPortSides(cell, paper);

    App.emit('control:placed', control);
    return control;
};

// ---------------- Keep control.x/y and .el in sync with the model ----------------

graph.on('change:position', (cell) => {
    const control = App.getControl(cell.id);
    if (!control) return;
    const pos = cell.position();
    control.x = pos.x;
    control.y = pos.y;
    App.emit('control:move', control);
});

// ---------------- Palette drag source ----------------

// Delegated (not one listener per item) so palette items added later —
// custom gates, created and deleted at any time by customGates.js — work
// identically to the built-in ones without re-registering anything.
leftPanel.addEventListener('dragstart', (event) => {
    const item = event.target.closest('.palette-item');
    if (!item) return;
    event.dataTransfer.setData('text/plain', item.dataset.type);
    event.dataTransfer.effectAllowed = 'copy';
});

host.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
});

let resolveCustomDefinition = null;
export const setCustomDefinitionResolver = (fn) => { resolveCustomDefinition = fn; };

host.addEventListener('drop', (event) => {
    event.preventDefault();
    const dragged = event.dataTransfer.getData('text/plain');
    if (!dragged) return;
    const point = paper.clientToLocalPoint(event.clientX, event.clientY);
    if (dragged.startsWith('custom:')) {
        placeControl('custom', point.x - 30, point.y - 20, undefined, dragged.slice('custom:'.length));
    } else {
        placeControl(dragged, point.x - 30, point.y - 20);
    }
});

// ---------------- Zoom (paper.scale(), toward a given screen point) ----------------

const clampZoom = (value) => Math.min(App.MAX_ZOOM, Math.max(App.MIN_ZOOM, value));

/** Round to the nearest 10% step, same granularity as the old slider. */
const snapZoom = (value) => Math.round(value / ZOOM_STEP) * ZOOM_STEP;

/**
 * Rescale the paper, keeping the given SCREEN point (clientX/clientY) fixed
 * in place. With no point given, zooms toward the center of the viewport —
 * matching the old zoom-button/slider behavior.
 */
export const zoomTo = (rawScale, clientX, clientY) => {
    const scale = clampZoom(snapZoom(rawScale));
    const oldScale = paper.scale().sx;
    if (scale === oldScale) return scale;

    const viewportRect = host.getBoundingClientRect();
    const cx = clientX === undefined ? viewportRect.left + viewportRect.width / 2 : clientX;
    const cy = clientY === undefined ? viewportRect.top + viewportRect.height / 2 : clientY;

    const before = paper.clientToLocalPoint(cx, cy);
    paper.scale(scale, scale);
    const after = paper.clientToLocalPoint(cx, cy);

    const translate = paper.translate();
    const target = clampPanTranslate(
        translate.tx + (after.x - before.x) * scale,
        translate.ty + (after.y - before.y) * scale,
    );
    paper.translate(target.tx, target.ty);

    App.setZoom(scale);
    return scale;
};

export const getZoomPercent = () => Math.round(paper.scale().sx * 100);

export const zoomInStep = (clientX, clientY) => zoomTo(paper.scale().sx + ZOOM_STEP, clientX, clientY);
export const zoomOutStep = (clientX, clientY) => zoomTo(paper.scale().sx - ZOOM_STEP, clientX, clientY);
export const zoomToPercent = (percent, clientX, clientY) => zoomTo(percent / 100, clientX, clientY);

// ---------------- Pan bounds (Task 6.10) ----------------
// The viewport may overscroll past the world rectangle by at most this many
// WORLD px on any side — not unbounded, but not flush against the edge
// either. Applied everywhere paper.translate() is set directly: initial
// centering, drag-to-pan, and zoom-toward-cursor's own translate nudge.
const PAN_OVERSCROLL_MARGIN = 200;

const clampPanTranslate = (tx, ty) => {
    const scale = paper.scale().sx;
    const viewW = host.clientWidth;
    const viewH = host.clientHeight;
    const minTx = viewW - (App.WORLD_SIZE + PAN_OVERSCROLL_MARGIN) * scale;
    const maxTx = PAN_OVERSCROLL_MARGIN * scale;
    const minTy = viewH - (App.WORLD_SIZE + PAN_OVERSCROLL_MARGIN) * scale;
    const maxTy = PAN_OVERSCROLL_MARGIN * scale;
    return {
        tx: Math.min(maxTx, Math.max(minTx, tx)),
        ty: Math.min(maxTy, Math.max(minTy, ty)),
    };
};

/** Size the initial view and center it in the middle of the world. Called once by main.js. */
export const initViewport = () => {
    App.setZoom(1);
    const center = App.WORLD_SIZE / 2;
    paper.scale(1, 1);
    const target = clampPanTranslate(host.clientWidth / 2 - center, host.clientHeight / 2 - center);
    paper.translate(target.tx, target.ty);
};

// Mouse wheel zooms toward the cursor, in the same 10% steps as the buttons.
// Native wheel listener (not a paper API) since core has no built-in
// wheel-to-zoom — only the resulting paper.scale()/translate() calls are
// "JointJS's own pan/zoom".
host.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.deltaY < 0) zoomInStep(event.clientX, event.clientY);
    else if (event.deltaY > 0) zoomOutStep(event.clientX, event.clientY);
}, { passive: false });

// ---------------- Pan (drag empty canvas) ----------------
// JointJS core has no drag-to-pan built in (Rappid's ui.PaperScroller does),
// so this adjusts paper.translate() by hand — still "JointJS's own pan",
// just driven manually instead of by a plugin that isn't open source.

let panTool = 'select'; // toggled by toolbar.js's select/pan buttons
export const setPanTool = (tool) => { panTool = tool; };
export const getPanTool = () => panTool;

const beginPan = (event) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const start = paper.translate();
    let moved = false;
    host.style.cursor = 'grabbing';

    const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) > PAN_THRESHOLD_PX) moved = true;
        const target = clampPanTranslate(start.tx + dx, start.ty + dy);
        paper.translate(target.tx, target.ty);
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        host.style.cursor = panTool === 'pan' ? 'grab' : '';
        if (moved) App.swallowNextClick();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

export { beginPan };

// ---------------- Wire creation (bridging JointJS's own link system) ----------------
// Folded in from what used to be a separate wires.js: the only thing that
// file did was listen for the paper's own `defaultLink`/`validateConnection`
// machinery (configured above, in this same Paper) finishing a connection,
// and register it in app.js's wire registry — genuinely part of "the paper's
// own event wiring," not a separate concern, once canvas.js already owns
// `graph`/`paper`. (It couldn't live in app.js instead: app.js is imported
// BY limits.js, and this code needs limits.js's gate-count approval check,
// so putting it in app.js would create an import cycle.)
//
//   - `change:target` fires once a dragged link's loose end lands on a real
//     port (JointJS-native equivalent of the old "mouseup on a node"
//     handler). Reconnecting an existing wire's endpoints is disabled
//     (`interactive` above returns false for every link interaction), so
//     this only ever fires once per link, at creation.
//   - The gate-limit check needs the user's async approval, which
//     `validateConnection` can't wait for (it must answer synchronously) —
//     so it runs here, after the link already exists, and the link is
//     removed again if declined.
//   - `pathEl`/`outlineEl` are the two `<path>`s Wire's own markup already
//     renders (see shapes.js) — nothing here draws SVG by hand.

const registerWire = (link) => {
    const source = link.get('source');
    const target = link.get('target');
    const fromNodeId = source && source.port;
    const toNodeId = target && target.port;
    if (!fromNodeId || !toNodeId) return;

    const from = App.getNode(fromNodeId);
    const to = App.getNode(toNodeId);
    const view = paper.findViewByModel(link);
    if (!view) return;

    const wire = {
        id: link.id,
        cell: link,
        fromNodeId,
        toNodeId,
        fromControlId: from ? from.controlId : null,
        toControlId: to ? to.controlId : null,
        pathEl: view.el.querySelector('.wire'),
        outlineEl: view.el.querySelector('.wire-outline'),
        signal: undefined,
    };
    App.addWire(wire);
    if (to) to.el.classList.remove('unattached');
};

graph.on('change:target', async (link) => {
    if (typeof link.isLink !== 'function' || !link.isLink()) return;
    if (App.getWire(link.id)) return; // already registered (defensive)

    const target = link.get('target');
    const source = link.get('source');
    if (!target || !target.id || !source || !source.id) return; // still being dragged

    const fromNodeId = source.port;
    const toNodeId = target.port;
    if (!fromNodeId || !toNodeId) return;

    const check = Limits.checkConnection(fromNodeId, toNodeId);
    if (check.needsApproval) {
        const approved = await Limits.requestCircuitApproval(check.gateCount, check.controlIds);
        if (!approved) {
            if (graph.getCell(link.id)) link.remove();
            return;
        }
    }
    // The dialog is modal, but re-check in case anything changed meanwhile.
    if (App.isNodeOccupied(toNodeId)) {
        if (graph.getCell(link.id)) link.remove();
        return;
    }
    registerWire(link);
});

// Safety net: a link removed by any route other than App.removeWire (e.g. a
// dangling in-progress link JointJS itself discards because linkPinning is
// false) never made it into App's registry, so this is a no-op for those —
// it only matters if something outside app.js ever calls link.remove()
// directly on a registered wire.
graph.on('remove', (cell) => {
    if (typeof cell.isLink !== 'function' || !cell.isLink()) return;
    if (App.getWire(cell.id)) App.removeWire(cell.id);
});

// An input node with no wire left goes back to its idle look.
App.events.addEventListener('wire:remove', (event) => {
    const wire = event.detail;
    const to = App.getNode(wire.toNodeId);
    if (to && !App.isNodeOccupied(wire.toNodeId)) to.el.classList.add('unattached');
});
