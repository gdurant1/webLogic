/**
 * shapes.js — Custom JointJS Shapes
 * ---------------------------------------------------------------------------
 * Every gate and control is a `joint.dia.Element` subclass built on
 * `joint.dia.Element` directly (JointJS's own current, open-source base —
 * NOT the old `joint.shapes.logic` demo bundle, which is tied to the
 * deprecated pre-4.0 `jointjs` package and isn't part of `@joint/core`).
 *
 * Every shape uses the SAME 60x40 local coordinate box the original palette
 * icons used, and gate bodies reuse those icons' exact SVG path `d` strings.
 *
 * FLIP / PORT MIRRORING (Phase A, Task 3)
 * ----------------------------------------------------------------------
 * All visual markup lives inside an inner `<g selector="flipGroup">`, never
 * on `root` — `root`'s own transform is how JointJS positions the element
 * in the world (`cell.position()`), so a flip transform placed there would
 * fight that and teleport the shape to (0,0) (the original bug). `flipGroup`
 * carries ONLY the mirror transform, scoped to the shape's own 60x40 local
 * box, so the two never collide.
 *
 * Ports are NOT inside the markup tree (JointJS renders them as a sibling
 * layer), so mirroring them is a separate, explicit step: every port is
 * created with `baseSide` ('left'/'right'/'top'/'bottom'), `baseIndex` and
 * `baseTotal` (its position among same-side siblings), and absolute
 * `args: {x, y}`. `layoutPorts(cell)` recomputes every port's actual side
 * and (x, y) from those base values plus the cell's current `flipH`/`flipV`
 * (stored as cell props so they survive copy/paste and Save/Load):
 *   - flipH swaps left<->right; flipV swaps top<->bottom.
 *   - flipV also REVERSES the physical order of ports that share a left/right
 *     edge (so index 0 — "top", e.g. the 4-bit digit's MSB — moves to the
 *     bottom, exactly like flipping a real chip upside down keeps a pin's
 *     number attached to the same physical pin).
 * `layoutPorts` also stamps each port's resolved side as a literal
 * `data-side` attribute on its rendered DOM node (via `stampPortSides`,
 * called separately once the cell has a view), which `sideAwareConnector`
 * (registered as Wire's `connector`) reads directly off the live DOM to
 * decide whether a wire should leave/enter horizontally or vertically —
 * exactly the old pre-JointJS `data-side` idea, just read from the actual
 * rendered port instead of a static template.
 *
 * Text inside flipGroup (constant/digit/custom-gate labels) gets its own
 * counter-transform (`counterFlipText`) so a flip mirrors the shape without
 * also mirroring its letters/numbers backwards.
 */

// AUTHORED_SIZE is the fixed 60x40 coordinate space every hand-authored path
// and attrs number below (GATE_PATHS, track/face/glass x/y/width/height,
// etc.) is drawn in — it never changes. SIZE_SCALE enlarges every gate,
// source, and sink by this factor WITHOUT touching any of those numbers:
// `wrapScaledFlipGroup` wraps the actual content in an outer `scaleGroup`
// with a static `scale(SIZE_SCALE)` CSS transform, and the shape's real
// `size` (what ports/layoutPorts/restrictTranslate/etc. all see) is set to
// AUTHORED_SIZE * SIZE_SCALE — so the enlarged content and the enlarged
// port positions grow from the same (0,0) origin and line up exactly,
// without hand-editing a single path coordinate.
//
// Correction requested: gates/sources/sinks felt small, and the 4-bit
// digit's 4 input ports visually overlapped (PORT_EDGE_PADDING is a fixed
// 7px regardless of shape size, so on the original 40px-tall box the 4
// ports landed ~8.7px apart — less than their own 12px diameter). 1.5x
// makes that box 60px tall, giving ~15.3px between port centers — a clear
// gap — and is applied uniformly to every other scaled shape too, per the
// request that the increase be the same % everywhere. Custom gates (sized
// dynamically per their own port count, not from AUTHORED_SIZE) are
// deliberately NOT scaled by this — they weren't part of the request, and
// already don't suffer from the fixed-padding overlap problem gates do,
// since their own height already grows with how many ports they have.
const SIZE_SCALE = 1.5;
const AUTHORED_SIZE = { width: 60, height: 40 };
const GATE_SIZE = { width: AUTHORED_SIZE.width * SIZE_SCALE, height: AUTHORED_SIZE.height * SIZE_SCALE };
const PORT_EDGE_PADDING = 7; // px in from each end of an edge before the first/last port — a fixed value, not scaled, so bigger shapes get MORE relative breathing room between ports, not less

// Exact path data lifted from style.css's `.logic-gate[data-type="…"] .gate-body`
// icons, so gate bodies look identical to the original design.
const GATE_PATHS = {
    buffer: ["M12 8 L12 32 L42 20 Z"],
    not: ["M10 8 L10 32 L38 20 Z"],
    and: ["M14 6 H22 A14 14 0 0 1 22 34 H14 Z"],
    nand: ["M12 6 H20 A14 14 0 0 1 20 34 H12 Z"],
    or: ["M10 6 Q24 6 40 20 Q24 34 10 34 Q19 20 10 6 Z"],
    nor: ["M8 6 Q22 6 38 20 Q22 34 8 34 Q17 20 8 6 Z"],
    xor: ["M12 6 Q26 6 42 20 Q26 34 12 34 Q21 20 12 6 Z", "M6 6 Q15 20 6 34"],
    xnor: ["M10 6 Q24 6 40 20 Q24 34 10 34 Q19 20 10 6 Z", "M4 6 Q13 20 4 34"],
    'tri-state': ["M12 10 L12 30 L36 20 Z"],
};

// Negation "bubble" (small circle at the output) for the inverting gates.
const NEGATION_BUBBLE = { not: 41.5, nand: 39.5, nor: 41.5, xnor: 43.5 };

const PORT_MAGNET_ATTRS = { magnet: true, class: 'node' };

// ---------------- Port layout / mirroring ----------------

/** `count` evenly-spaced positions along an edge of length `length`. */
const distributeEdge = (count, length) => {
    if (count <= 0) return [];
    if (count === 1) return [length / 2];
    const usable = length - 2 * PORT_EDGE_PADDING;
    return Array.from({ length: count }, (_, i) => PORT_EDGE_PADDING + (usable * i) / (count - 1));
};

const swapSide = (side, flipH, flipV) => {
    if (flipH && side === 'left') return 'right';
    if (flipH && side === 'right') return 'left';
    if (flipV && side === 'top') return 'bottom';
    if (flipV && side === 'bottom') return 'top';
    return side;
};

/**
 * Recompute every port's resolved side + (x, y) from its stored base values
 * and the cell's current flipH/flipV. Call this once at creation and again
 * every time flipH/flipV changes (see selection.js's flip()).
 */
export const layoutPorts = (cell) => {
    const flipH = !!cell.get('flipH');
    const flipV = !!cell.get('flipV');
    const { width, height } = cell.size();
    const ports = cell.getPorts();

    const bySide = {};
    ports.forEach((port) => {
        (bySide[port.baseSide] = bySide[port.baseSide] || []).push(port);
    });
    Object.keys(bySide).forEach((side) => bySide[side].sort((a, b) => a.baseIndex - b.baseIndex));

    ports.forEach((port) => {
        const siblings = bySide[port.baseSide];
        const total = siblings.length;
        const isHorizontalEdge = port.baseSide === 'left' || port.baseSide === 'right';
        const reverseOrder = isHorizontalEdge && flipV;
        const effectiveIndex = reverseOrder ? total - 1 - port.baseIndex : port.baseIndex;
        const positions = distributeEdge(total, isHorizontalEdge ? height : width);
        const along = positions[effectiveIndex];

        const side = swapSide(port.baseSide, flipH, flipV);
        let x;
        let y;
        if (side === 'left') { x = 0; y = along; } else if (side === 'right') { x = width; y = along; } else if (side === 'top') { x = along; y = 0; } else { x = along; y = height; }

        cell.portProp(port.id, 'args', { x, y });
        cell.portProp(port.id, 'side', side);
    });
};

/**
 * DOM-level follow-up to layoutPorts(): stamps the resolved `data-side` onto
 * each port's actual rendered node, which sideAwareConnector reads directly.
 * Declarative `attrs/portBody/data-side` updates via portProp should also
 * reach the DOM on re-render, but this does it immediately and directly so
 * wires drawn right after a flip are never one frame stale. Call after the
 * cell has a view (i.e. after cell.addTo(graph)).
 */
export const stampPortSides = (cell, paper) => {
    const view = paper.findViewByModel(cell);
    if (!view) return;
    cell.getPorts().forEach((port) => {
        const node = view.el.querySelector(`[port="${CSS.escape(port.id)}"]`);
        if (node) node.setAttribute('data-side', port.side || port.baseSide);
    });
};

const basePortGroup = (markupSelector, extraAttrs) => ({
    position: { name: 'absolute', args: { x: 0, y: 0 } }, // overridden per-port by layoutPorts()
    attrs: { [markupSelector]: { ...PORT_MAGNET_ATTRS, r: 6, ...extraAttrs } },
    markup: [{ tagName: 'circle', selector: markupSelector }],
});

const IN_PORT_GROUP = () => basePortGroup('portBody', { class: 'node node-in unattached' });
const OUT_PORT_GROUP = () => basePortGroup('portBody', { class: 'node node-out' });

/** Add one port with the base-geometry bookkeeping layoutPorts() needs. */
const addPort = (el, id, group, baseSide, baseIndex, baseTotal) => {
    el.addPort({ id, group, baseSide, baseIndex, baseTotal, side: baseSide, args: { x: 0, y: 0 } });
};

/**
 * Public helper canvas.js uses for every non-gate, non-custom shape: adds
 * `count` ports of `group` ('in' | 'out'), named "<id>-<group>[-<i>]", with
 * the base-geometry bookkeeping layoutPorts() needs, then lays them out
 * immediately (otherwise they'd sit at their (0,0) placeholder until some
 * other trigger, like a flip, happened to recompute them). There is only
 * ever one output port, so `count` (default 1) only matters for 'in' —
 * today only FourBitDigit passes 4. The light bulb's single input starts on
 * the BOTTOM edge (the old design's "wire enters from below"); every other
 * shape's inputs start on the left.
 */
export const addPorts = (el, group, count = 1) => {
    if (group === 'out') {
        addPort(el, `${el.id}-out`, 'out', 'right', 0, 1);
    } else {
        const baseSide = el.get('type') === 'logic.LightBulb' ? 'bottom' : 'left';
        for (let i = 0; i < count; i++) addPort(el, `${el.id}-in-${i}`, 'in', baseSide, i, count);
    }
    layoutPorts(el);
    return el;
};

// ---------------- Side-aware wire connector (Task 6.5) ----------------

const SIDE_DIRECTIONS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

const readPortSide = (paper, graph, endRef, fallback) => {
    if (!endRef || !endRef.id || !endRef.port) return fallback;
    const cell = graph.getCell(endRef.id);
    if (!cell) return fallback;
    const view = paper.findViewByModel(cell);
    const node = view && view.el.querySelector(`[port="${CSS.escape(endRef.port)}"]`);
    const side = node && node.getAttribute('data-side');
    return side || fallback;
};

/**
 * A wire leaves/enters in the direction implied by each endpoint's current
 * `data-side` (stamped by stampPortSides): horizontal for left/right ports,
 * vertical for top/bottom ports (the light bulb, or any port after a
 * flip-v). Falls back to the old fixed "output right, input left" behavior
 * if a side can't be determined (e.g. mid-drag, before a wire exists yet).
 * Registered directly as Wire's `connector` function — JointJS calls a
 * function-valued connector with (sourcePoint, targetPoint, route, opt,
 * linkView), `this` also bound to linkView (verified against this project's
 * actual joint.js — `connectorFn.call(this, sourcePoint, targetPoint, route,
 * args, this)` inside LinkView.findPath — not assumed).
 */
const sideAwareConnector = function sideAwareConnector(sourcePoint, targetPoint, route, opt, linkView) {
    const paper = linkView.paper;
    const graph = paper.model;
    const link = linkView.model;
    const sourceSide = readPortSide(paper, graph, link.get('source'), 'right');
    const targetSide = readPortSide(paper, graph, link.get('target'), 'left');

    const distance = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
    const handle = Math.max(40, Math.min(distance / 2, 240));
    const [ax, ay] = SIDE_DIRECTIONS[sourceSide] || SIDE_DIRECTIONS.right;
    const [bx, by] = SIDE_DIRECTIONS[targetSide] || SIDE_DIRECTIONS.left;

    return `M ${sourcePoint.x} ${sourcePoint.y} C ${sourcePoint.x + ax * handle} ${sourcePoint.y + ay * handle}, ${targetPoint.x + bx * handle} ${targetPoint.y + by * handle}, ${targetPoint.x} ${targetPoint.y}`;
};

// ---------------- Text counter-flip (Task 3) ----------------

/**
 * Keep a text label inside flipGroup readable (not mirrored) regardless of
 * the shape's current flip state, while leaving it anchored at the same
 * (tx, ty) flipGroup already moved it to. See the file header for the
 * translate(2*t) scale(-1) derivation.
 */
export const counterFlipText = (cell, selector, tx, ty) => {
    const flipH = !!cell.get('flipH');
    const flipV = !!cell.get('flipV');
    if (!flipH && !flipV) { cell.attr(`${selector}/transform`, ''); return; }
    const sx = flipH ? -1 : 1;
    const sy = flipV ? -1 : 1;
    const ox = flipH ? 2 * tx : 0;
    const oy = flipV ? 2 * ty : 0;
    cell.attr(`${selector}/transform`, `translate(${ox},${oy}) scale(${sx},${sy})`);
};

/**
 * Apply/refresh the flipGroup mirror transform from the cell's flip props.
 * Uses the shape's AUTHORED (pre-scale) size, not `cell.size()` — for a
 * scaled shape (see wrapScaledFlipGroup) flipGroup lives INSIDE scaleGroup,
 * mirroring the same un-scaled content scaleGroup will enlarge afterward,
 * so it must mirror within that same un-scaled box. `cell.size()` IS the
 * right thing for a shape that was never wrapped in a scale transform
 * (CustomGate, whose real content size varies with its own port count) —
 * `authoredSize` is only set on the cell for the shapes this file scales.
 */
export const applyFlipTransform = (cell) => {
    const flipH = !!cell.get('flipH');
    const flipV = !!cell.get('flipV');
    const { width, height } = cell.get('authoredSize') || cell.size();
    const sx = flipH ? -1 : 1;
    const sy = flipV ? -1 : 1;
    const tx = flipH ? width : 0;
    const ty = flipV ? height : 0;
    cell.attr('flipGroup/transform', `translate(${tx},${ty}) scale(${sx},${sy})`);
};

// A small corner marker shown on any control with a note attached (see
// popups.js's updateNoteBadge) — a simple, cheap-to-toggle visual: a filled
// dot in the top-right corner, hidden by default via the declarative
// `display: 'none'` below (toggled through cell.attr(), never raw classList
// — see the flip-state-wiping bug this file's header warns about elsewhere;
// the same JointJS behavior applies here, so the declarative path is used
// from the start). Placed as a sibling of flipGroup (inside scaleGroup, so
// it still grows with the shape) rather than inside it, so flipping a
// control doesn't also flip which corner the badge sits in.
const noteBadgeMarkup = (cx) => ({
    tagName: 'circle',
    selector: 'noteBadge',
    attributes: { cx, cy: 4, r: 3, class: 'note-badge', display: 'none' },
});

/**
 * Wrap a shape's real content for both the uniform size-up scale and flip
 * mirroring, plus the note badge (see above). `authoredWidth` positions the
 * badge in that shape's own top-right corner.
 */
const wrapScaledFlipGroup = (children, authoredWidth = AUTHORED_SIZE.width) => [{
    tagName: 'g',
    selector: 'scaleGroup',
    attributes: { transform: `scale(${SIZE_SCALE})` },
    children: [
        { tagName: 'g', selector: 'flipGroup', children },
        noteBadgeMarkup(authoredWidth - 4),
    ],
}];

/** Same note badge, no scale wrapper — for CustomGate, sized dynamically per its own port count rather than from AUTHORED_SIZE. */
const wrapInFlipGroup = (children, width = AUTHORED_SIZE.width) => [
    { tagName: 'g', selector: 'flipGroup', children },
    noteBadgeMarkup(width - 4),
];

// ---------------- Logic gates ----------------

const buildGateMarkup = (type) => {
    const body = GATE_PATHS[type].map((d, i) => ({
        tagName: 'path',
        selector: i === 0 ? 'gateBody' : `gateBodyExtra${i}`,
        attributes: { d, class: i === 0 ? 'gate-body' : 'gate-body-extra' },
    }));
    const bubbleCx = NEGATION_BUBBLE[type];
    if (bubbleCx) {
        body.push({
            tagName: 'circle',
            selector: 'gateBubble',
            attributes: { cx: bubbleCx, cy: 20, r: 3.5, class: 'gate-bubble' },
        });
    }
    return wrapScaledFlipGroup([{ tagName: 'g', selector: 'gateGroup', children: body }]);
};

export const Gate = joint.dia.Element.define('logic.Gate', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: { root: { magnetSelector: 'gateGroup', class: 'control logic-gate' } },
    ports: { groups: { in: IN_PORT_GROUP(), out: OUT_PORT_GROUP() } },
}, {
    // Placeholder only — createGate() always immediately replaces this via
    // el.prop('markup', buildGateMarkup(gateType)), since the real markup
    // depends on which of the 9 gate types this instance actually is.
    markup: wrapScaledFlipGroup([{ tagName: 'g', selector: 'gateGroup', children: [] }]),
});

/**
 * Create one gate element of `gateType` with `inputCount` input ports.
 * A JointJS cell's `id` is assigned at construction time (before it is ever
 * added to a graph), so it is already safe to use here for the port ids
 * that the rest of the app addresses as node ids ("<id>-in-0", "<id>-out").
 *
 * `savedId` (Phase B Save/Load): pass the id a saved circuit recorded, so
 * restored wires — built from THOSE ids — still resolve. Verified directly
 * against this project's joint.js: passing `{ id }` in the constructor's
 * attributes object is sufficient on its own; Cell's `initialize(options)`
 * is invoked via `apply(this, arguments)` with only one declared parameter,
 * so `options` inside it is actually bound to the FIRST constructor
 * argument (the attributes object) — `options[idAttribute] === undefined`
 * is really checking `attrs.id === undefined` — so the normal
 * single-argument `new Gate({ id })` already skips auto-generation. No
 * second "options" argument is needed, despite the parameter's name.
 */
export const createGate = (gateType, inputCount, savedId) => {
    const el = new Gate(savedId ? { id: savedId } : {});
    el.attr('gateType', gateType);
    el.attr('root/data-type', gateType);
    el.prop('markup', buildGateMarkup(gateType));
    for (let i = 0; i < inputCount; i++) addPort(el, `${el.id}-in-${i}`, 'in', 'left', i, inputCount);
    addPort(el, `${el.id}-out`, 'out', 'right', 0, 1);
    layoutPorts(el);
    return el;
};

// ---------------- Toggle switch (source) ----------------

export const ToggleSwitch = joint.dia.Element.define('logic.ToggleSwitch', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'track', class: 'control toggle-switch' },
        track: { x: 8, y: 10, width: 20, height: 20, class: 'switch-track' },
        knob: { x: 14, y: 16, width: 8, height: 8, class: 'switch-knob' },
    },
    ports: { groups: { out: OUT_PORT_GROUP() } },
}, {
    markup: wrapScaledFlipGroup([
        { tagName: 'rect', selector: 'track' },
        { tagName: 'rect', selector: 'knob' },
    ]),
});

// ---------------- Push button (source) ----------------

export const PushButton = joint.dia.Element.define('logic.PushButton', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'face', class: 'control push-button' },
        face: { cx: 20, cy: 20, r: 13, class: 'push-button-face' },
        inner: { cx: 20, cy: 20, r: 6, class: 'push-button-inner' },
    },
    ports: { groups: { out: OUT_PORT_GROUP() } },
}, {
    markup: wrapScaledFlipGroup([
        { tagName: 'circle', selector: 'face' },
        { tagName: 'circle', selector: 'inner' },
    ]),
});

// ---------------- Clock (source) ----------------

export const Clock = joint.dia.Element.define('logic.Clock', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'face', class: 'control clock' },
        face: { x: 8, y: 7, width: 26, height: 26, rx: 2, class: 'clock-face' },
        zigzag: { d: 'M12 24 h4 v-8 h4 v8 h4 v-8 h4', class: 'clock-zigzag', fill: 'none' },
    },
    ports: { groups: { out: OUT_PORT_GROUP() } },
}, {
    markup: wrapScaledFlipGroup([
        { tagName: 'rect', selector: 'face' },
        { tagName: 'path', selector: 'zigzag' },
    ]),
});

// ---------------- High / low constants (sources) ----------------

const buildConstant = (typeName, value) =>
    joint.dia.Element.define(`logic.${typeName}`, {
        size: GATE_SIZE,
        authoredSize: AUTHORED_SIZE,
        flipH: false,
        flipV: false,
        attrs: {
            root: { magnetSelector: 'face', class: `control ${typeName === 'HighConstant' ? 'high-constant' : 'low-constant'}` },
            face: { x: 9, y: 7, width: 24, height: 26, rx: 2, class: `constant-face ${typeName === 'HighConstant' ? 'high-constant-face' : 'low-constant-face'}` },
            label: { text: String(value), x: 21, y: 25, class: 'constant-label', textAnchor: 'middle' },
        },
        ports: { groups: { out: OUT_PORT_GROUP() } },
    }, {
        markup: wrapScaledFlipGroup([
            { tagName: 'rect', selector: 'face' },
            { tagName: 'text', selector: 'label' },
        ]),
    });

export const HighConstant = buildConstant('HighConstant', 1);
export const LowConstant = buildConstant('LowConstant', 0);

// ---------------- Light bulb (sink) ----------------

export const LightBulb = joint.dia.Element.define('logic.LightBulb', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'glass', class: 'control light-bulb' },
        glass: { cx: 24, cy: 16, r: 11, class: 'bulb-glass' },
        filament: { d: 'M19 11 l5 8 5-8', class: 'bulb-filament', fill: 'none' },
        base: { x1: 24, y1: 33, x2: 24, y2: 38, class: 'bulb-base-line' },
        baseCap: { cx: 24, cy: 38, r: 2.5, class: 'bulb-base-cap' },
    },
    // The bulb's single input starts BELOW the glass (baseSide 'bottom');
    // layoutPorts() moves it to 'top' on flip-v like any other port.
    ports: { groups: { in: IN_PORT_GROUP() } },
}, {
    markup: wrapScaledFlipGroup([
        { tagName: 'circle', selector: 'glass' },
        { tagName: 'path', selector: 'filament' },
        { tagName: 'line', selector: 'base' },
        { tagName: 'circle', selector: 'baseCap' },
    ]),
});

// ---------------- 4-bit digit display (sink) ----------------

export const FourBitDigit = joint.dia.Element.define('logic.FourBitDigit', {
    size: GATE_SIZE,
    authoredSize: AUTHORED_SIZE,
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'face', class: 'control four-bit-digit' },
        face: { x: 16, y: 6, width: 24, height: 28, rx: 2, class: 'digit-face' },
        label: { text: '0', x: 28, y: 25, class: 'digit-display', textAnchor: 'middle' },
    },
    ports: { groups: { in: IN_PORT_GROUP() } }, // 4 inputs added explicitly below; index 0 = top = MSB
}, {
    markup: wrapScaledFlipGroup([
        { tagName: 'rect', selector: 'face' },
        { tagName: 'text', selector: 'label' },
    ]),
});

// ---------------- Wire (link) ----------------
// Three stacked paths: a thicker dark outline, the colored line on top of
// it (same as the original hand-drawn SVG wires), and — correction request
// — a third, WIDER, fully invisible `hitArea` path on top of both, so
// clicking to select a wire has a more forgiving target than its own thin
// 2px visual stroke. `hitArea` is the one with `pointer-events: stroke`
// now (style.css); `.wire`'s own pointer-events are off, since the visible
// line no longer needs to catch clicks itself. canvas.js's click handling
// and its "disable hit-testing while this link is still a drag preview"
// logic (setWireHitTestable) both move to targeting `.hit-area` instead of
// `.wire` for the same reason they applied to `.wire` before: this is now
// the element whose stroke actually receives pointer events.
// `connector` is sideAwareConnector itself (a function value — verified
// this joint.js accepts that directly, not just a {name} descriptor), so
// every wire leaves/enters in the direction its actual current port side
// implies.
export const Wire = joint.dia.Link.define('logic.Wire', {
    attrs: {
        line: { class: 'wire', connection: true },
        outline: { class: 'wire-outline', connection: true },
        hitArea: { class: 'wire-hit-area', connection: true },
    },
    router: { name: 'normal' },
    connector: sideAwareConnector,
}, {
    markup: [
        { tagName: 'path', selector: 'outline' },
        { tagName: 'path', selector: 'line' },
        { tagName: 'path', selector: 'hitArea' },
    ],
    toolMarkup: undefined,
});

// ---------------- Custom gates (Phase A: "Create Gate") ----------------
// A generic labeled box: inputs stacked on the left, outputs on the right,
// sized to fit however many ports it ends up with. Its behavior is a
// precomputed truth table (see customGates.js), looked up by logic.js the
// same way a built-in gate's GATE_FUNCS entry is — this shape only draws
// the box; it carries no logic of its own.
const CUSTOM_GATE_MIN_HEIGHT = 40;
const CUSTOM_GATE_PORT_SPACING = 16;
const CUSTOM_GATE_WIDTH = 110;

export const CustomGate = joint.dia.Element.define('logic.CustomGate', {
    size: { width: CUSTOM_GATE_WIDTH, height: CUSTOM_GATE_MIN_HEIGHT },
    flipH: false,
    flipV: false,
    attrs: {
        root: { magnetSelector: 'face', class: 'control custom-gate' },
        face: { x: 4, y: 4, width: CUSTOM_GATE_WIDTH - 8, height: CUSTOM_GATE_MIN_HEIGHT - 8, rx: 4, class: 'custom-gate-face' },
        label: { text: '', x: CUSTOM_GATE_WIDTH / 2, y: CUSTOM_GATE_MIN_HEIGHT / 2 + 4, class: 'custom-gate-label', textAnchor: 'middle' },
    },
    ports: { groups: { in: IN_PORT_GROUP(), out: OUT_PORT_GROUP() } },
}, {
    markup: wrapInFlipGroup([
        { tagName: 'rect', selector: 'face' },
        { tagName: 'text', selector: 'label' },
    ], CUSTOM_GATE_WIDTH),
});

/**
 * Create one instance of a custom gate definition `{ name, inputCount,
 * outputCount }` (see customGates.js for the full definition shape).
 * `customTypeId` is the definition's stable id (distinct from the instance
 * cell's own `el.id`), stored on the cell so logic.js can look the
 * definition's truth table back up at evaluation time. `savedId` (Phase B):
 * see createGate's comment — same mechanism.
 */
export const createCustomGate = (customTypeId, name, inputCount, outputCount, savedId) => {
    const el = new CustomGate(savedId ? { id: savedId } : {});
    const height = Math.max(CUSTOM_GATE_MIN_HEIGHT, PORT_EDGE_PADDING * 2 + Math.max(inputCount, outputCount, 1) * CUSTOM_GATE_PORT_SPACING);
    el.resize(CUSTOM_GATE_WIDTH, height);
    el.attr('face/height', height - 8);
    el.attr('label/y', height / 2 + 4);
    el.attr('label/text', name);
    el.prop('customTypeId', customTypeId);
    for (let i = 0; i < inputCount; i++) addPort(el, `${el.id}-in-${i}`, 'in', 'left', i, inputCount);
    for (let i = 0; i < outputCount; i++) addPort(el, `${el.id}-out-${i}`, 'out', 'right', i, outputCount);
    layoutPorts(el);
    return el;
};

export const namespace = {
    logic: { Gate, ToggleSwitch, PushButton, Clock, HighConstant, LowConstant, LightBulb, FourBitDigit, CustomGate, Wire },
};
