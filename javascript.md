# Master Prompt: Behavior & Architecture Spec

> Specification for the modular JavaScript implementation. Rewritten for the
> JointJS-based rewrite: gates, controls and wires are now `@joint/core`
> (JointJS open-source, MPL-2.0) elements/links instead of hand-built DOM and
> hand-drawn SVG. The code is the source of truth where the two disagree.

## How it runs

Every module is an **ES module** (`import` / `export`). `index.html` loads
`lib/joint.js` (the JointJS UMD build — see "Offline / vendoring" below) as a
plain classic `<script>` first, so its `joint`/`g`/`V` globals exist before
`<script type="module" src="main.js">` runs; `main.js` then imports the rest.
The page must still be **served over http**; ES modules do not load from a
`file://` URL.

### Why JointJS core, not `joint.shapes.logic` or Rappid

Two deliberate exclusions:
- **`joint.shapes.logic`** (a bundled demo shape library) is tied to the old,
  now-deprecated `jointjs` npm package, and JointJS's own actively-maintained
  "Logic Circuits" demo is built with **JointJS+** (a separate paid product),
  not open-source core. `shapes.js` instead defines every gate/control as a
  plain `joint.dia.Element`, reusing the project's own original SVG icon
  paths so the look is unchanged.
- **Rappid** (JointJS+'s UI toolkit — Halo, Stencil, PaperScroller,
  SelectionView, Inspector) isn't open source either. Anywhere the old plan
  called for a Rappid widget, this app either uses the open-source
  equivalent building block instead (`paper.scale()`/`paper.translate()` in
  place of `ui.PaperScroller`; `paper.findViewsInArea()` in place of
  `ui.SelectionView`'s rubber-band) or hand-rolls the small remaining gap
  (drag-to-pan, multi-selection group-drag) directly against the Paper.

### Offline / vendoring

`index.html`'s `<script src="lib/joint.js">` expects that file to exist
locally (`npm install @joint/core`, then copy
`node_modules/@joint/core/dist/joint.js` in) — no CDN, no network access at
runtime once it's there. No `joint.css` is loaded or needed: none of this
app's UI is a Rappid widget, so every visual is still styled by this
project's own `style.css`.

## Module Architecture Overview

The application logic is partitioned into **8 decoupled modules** (down from
11 in the pre-JointJS version — two were folded into the files whose Paper/
graph they were really extensions of; see each module's own note below):

```
app.js ← limits.js ← canvas.js, logic.js, tables.js, popups.js
app.js ← canvas.js ← selection.js, popups.js, toolbar.js
shapes.js ← canvas.js
logic.js ← tables.js, popups.js, toolbar.js        popups.js ← toolbar.js
main.js imports everything, and runs the first render pass
```

1. **`app.js`**: §1 — shared data model: controls, wires, selection, zoom —
   now backed by a `joint.dia.Graph` instead of hand-rolled Maps, but with
   the SAME public functions as before (`addControl`, `getWireInto`,
   `getComponents`, ...), which is why limits.js/tables.js/logic.js/popups.js
   needed almost no changes when the rendering layer underneath them changed.
2. **`shapes.js`**: §2 — every gate/control as a custom `joint.dia.Element`
   subclass (see §2 below), plus the two-path `Wire` link type.
3. **`canvas.js`**: §3 — creates the one `joint.dia.Paper` and
   `joint.dia.Graph` for the app; palette drag-and-drop; placing controls;
   pan and wheel-zoom-toward-cursor via `paper.scale()`/`paper.translate()`;
   **and** (folded in from the old, separate `wires.js`) the code that turns
   a completed drag-to-connect gesture into a registered wire, since that is
   really just more of the same Paper's own event wiring, and needs
   `graph`/`paper` from right here. (It couldn't live in app.js instead —
   app.js is imported *by* limits.js, and this code needs limits.js's
   gate-count approval check, so putting it in app.js would create an import
   cycle.)
4. **`limits.js`**: §4 — circuit gate limit, truth-table input cap, speed
   guard, prompt queue. Unchanged from the pre-JointJS version — it only
   ever talked to app.js's public API, never to the rendering layer, so the
   whole rewrite didn't touch it.
5. **`selection.js`**: §5 — click-select and rubber-band now run off the
   Paper's own `element:pointerclick` / `link:pointerclick` /
   `blank:pointerdown` events; the rubber-band itself uses the built-in
   `paper.findViewsInArea()` in place of the old manual bounding-box math.
   Delete/cut/copy/paste/flip/group are otherwise the same idea as before.
6. **`logic.js`**: §6 — gate evaluation, sources/sinks, the shared clock
   timer, Play/Stop. Behavior is unchanged; only *how a source's value is
   read* changed, since a toggle switch/push button is an SVG shape now, not
   a real `<input>`/`<button>` (see §6 below).
7. **`tables.js`**: §7 — truth tables. Unchanged except the master-table
   row-click handler, which sets a `.checked` class instead of a checkbox's
   `.checked` property (same reason as logic.js).
8. **`popups.js`**: §8 — note popup, input-count popups, clear-all, the
   limit dialog. `setGateInputCount` now calls `cell.addPort()`/
   `removePort()` instead of building/removing DOM nodes by hand, and the
   note-tool click / double-click handlers moved from raw DOM listeners to
   `paper.on('element:pointerclick'/'element:pointerdblclick', ...)`.
9. **`toolbar.js`**: §9 — toolbar buttons, and the zoom slider/buttons
   (delegating the actual math to canvas.js's `zoomTo()` so the slider, the
   +/- buttons and the mouse wheel all agree). **Also** (folded in from the
   old, separate `theme.js`) dark mode: `#dark-mode-toggle` lives in the
   same `#status-bar` this file already owns and shares no graph/paper state
   with anything else, so it didn't need its own file.
10. **`main.js`**: §10 — entry point; import order plus the first
    `evaluate()`/`Tables.rebuild()` pass.

---

## Detailed Module Specifications

### 1. `app.js` (Shared Data Model)
- Constants: `WORLD_SIZE` (20000 — the Paper's model-space size, a practical
  "infinite canvas" limit), `MIN_ZOOM`/`MAX_ZOOM` (0.5 / 2), `GATE_TYPES`,
  `FIXED_INPUT_TYPES` (Buffer, NOT).
- `setGraph()`/`setPaper()` are called once by canvas.js; everything else
  reaches the graph/paper only through app.js's functions.
- A **control** is `{ id, type, cell, el, x, y, inputCount, note?, groupId?,
  flipH?, flipV?, clockValue?, capApproved?, tableCapApproved? }`. `cell` is
  the `joint.dia.Element`; `el` is that cell's rendered SVG `<g>`
  (`cellView.el`) — existing class-based code (`.classList.toggle`,
  `.querySelector(...)`) keeps working unchanged against it, because
  `SVGElement` supports the same DOM APIs as HTML elements.
- A **wire** is `{ id, cell, fromNodeId, toNodeId, fromControlId,
  toControlId, pathEl, outlineEl, signal }`. `cell` is the `joint.dia.Link`;
  `pathEl`/`outlineEl` are the two `<path>`s its own markup renders (see
  §2's Wire).
- **Node ids** (`"<controlId>-out"`, `"<controlId>-in-<i>"`) are literally
  the JointJS **port ids** (see §2), so there is no separate node registry
  to keep in sync: `getNode(nodeId)` parses the id, finds the cell, and
  looks its port magnet up on demand via `[port="…"]` — the literal
  attribute JointJS itself renders on every port.
- API otherwise unchanged: `addControl/removeControl`, `getWireInto`,
  `getWiresFromNode`, `getWiresForControl`, `isNodeOccupied`,
  `getConnectedControlIds`, `getComponents`, the selection functions,
  `getZoom/setZoom`, `swallowNextClick`.

### 2. `shapes.js` (Custom JointJS Shapes)
- Every shape uses the same 60×40 local coordinate box the original palette
  icons used, and gate bodies reuse those icons' exact SVG path `d` strings,
  so gates look identical to the pre-rewrite design.
- `Gate` — one element type shared by all 9 gates; `createGate(type,
  inputCount)` sets `data-type`, builds the right path markup, and adds
  `in`/`out` ports named with the cell's own id (valid immediately at
  construction, before the cell is ever added to a graph).
- `ToggleSwitch`, `PushButton`, `Clock`, `HighConstant`, `LowConstant` —
  single-output sources. `LightBulb` — single input, positioned **below**
  the glass (the old design's "wire enters from below" bulb orientation).
  `FourBitDigit` — 4 inputs, index 0 = top = most significant bit.
- Every shape's root `<g>` carries the SAME top-level classes the old DOM
  version used (`.control.toggle-switch`, `.control.logic-gate`, ...), so
  `style.css`'s color rules apply with `fill`/`stroke` in place of
  `background`/`border`, reading the same custom properties as before (dark
  mode keeps working unchanged).
- `Wire` — a `joint.dia.Link` subclass whose markup is two stacked
  `<path>`s (`.wire-outline` under `.wire`), matching the old hand-drawn
  wire look exactly.

### 3. `canvas.js` (Paper, Palette, Pan/Zoom, Wire Creation)
- Creates the one `joint.dia.Graph` + `joint.dia.Paper` for the app.
  `defaultLink: () => new Shapes.Wire()` and `validateConnection` (output-
  only sources, one wire per input, no self-loops) are JointJS's own
  built-in "drag from a magnet to create a link" mechanism — there is no
  hand-rolled wire-dragging code any more.
- `interactive` (a Paper option, not a separate handler) declines: link-body
  dragging entirely (wires are fixed once connected); a ToggleSwitch's or
  PushButton's own `elementMove`, since their whole visible face is the
  press/click target (logic.js); and any control's `elementMove` while it is
  part of a >1-member selection, so selection.js can move the group by hand.
  Every other control still uses JointJS's own built-in single-element drag,
  completely unmodified.
- **Palette drag-and-drop**: `.palette-item`s stay plain HTML with native
  HTML5 drag/drop (JointJS core has no ready-made stencil panel — that's
  Rappid's `ui.Stencil`); `placeControl(type, x, y)` creates the matching
  shapes.js element instead of cloning an HTML `<template>`.
- **Pan**: dragging empty canvas adjusts `paper.translate()` by hand — core
  has no drag-to-pan built in either (Rappid's `ui.PaperScroller` does) — but
  it's still "JointJS's own pan", just driven manually against the paper
  instead of a CSS transform on a hand-built world div.
- **Zoom**: `zoomTo(scale, clientX, clientY)` rescales via `paper.scale()`,
  keeping the given SCREEN point fixed (the standard JointJS "read the local
  point, rescale, re-translate" recipe) — with no point given, it zooms
  toward the viewport's center, which is what the slider and +/- buttons
  use. The mouse **wheel** zooms toward the **cursor**, in the same 10%
  steps as the buttons (`zoomInStep`/`zoomOutStep`).
- **Wire creation** (folded in from the old, separate `wires.js` — see the
  Module Architecture Overview above for why): `graph.on('change:target',
  ...)` fires once a dragged link's loose end lands on a real port; the
  gate-limit approval (limits.js) runs here, since `validateConnection` must
  answer synchronously and can't await a dialog — the link is removed again
  if the user declines.

### 4. `limits.js` (Circuit limits & speed guard)
Unchanged. Still the shared gate-count cap (10 per circuit, with an approval
dialog above that), the speed guard (20% / 35% / 50%-slower staged warnings
once a circuit has been uncapped), and the truth-table input cap (10 / 14).
See the file's own header comment for the full numbers — none of them
changed with the rendering rewrite.

### 5. `selection.js` (Selection & Transformations)
- Click-select and Ctrl-click use `paper.on('element:pointerclick', ...)` /
  `'link:pointerclick'` / `'blank:pointerclick'`.
- `#btn-multiselect` arms a rubber-band on `'blank:pointerdown'`, using the
  built-in `paper.findViewsInArea(bounds)` in place of the old manual
  bounding-box comparison; with it off, dragging empty space pans instead
  (canvas.js's `beginPan`).
- Dragging a **multi**-selection is still hand-rolled (`element:pointerdown`
  + manual `mousemove`/`mouseup`, moving every selected cell's `position()`
  by the same delta) — moving several cells as one gesture is a Rappid
  `SelectionView` feature, not part of open-source core. A single selected
  (or unselected) control still uses JointJS's own built-in drag untouched,
  since canvas.js's `interactive` option only declines it for the
  multi-selected case.
- Delete/Backspace, cut/copy/paste, group are the same idea as before.
- **Flip is now cosmetic only**: it mirrors the shape's own markup via
  `cell.attr('root/transform', 'translate(...) scale(±1,±1)')`, but does
  **not** relocate which side a port renders on the way the old DOM
  version's light-bulb top/bottom flip did — a flipped control's wires keep
  leaving from their original side. (Known, deliberate simplification —
  the port-relocation API needed to do this properly wasn't something this
  rewrite could verify safely without a live browser test.)

### 6. `logic.js` (Simulation & Gate Logic)
Gate truth tables, Tri-State, the shared clock timer, and Play/Stop are
**unchanged in behavior**. What changed is only how a source's value is read
and toggled, since controls are SVG shapes now, not real HTML form controls:
- **Toggle switch**: no real `<input type="checkbox">` any more. Clicking
  the switch's track toggles a `.checked` class on the cell's root `<g>`;
  `getSourceValue` reads that class instead of `.checked`. canvas.js's
  `interactive` option keeps this click from being mistaken for an element
  drag, and selection.js's own click listener still runs too — a click both
  toggles AND selects the switch, same dual effect as before.
- **Push button**: press/release toggles `.pushed` on the `.push-button-
  inner` circle — same class name as before, just queried from a flat SVG
  shape instead of a nested HTML one, so `style.css` targets
  `.push-button-inner.pushed` directly rather than a descendant selector.
- Everything else reads `control.el`/`wire.pathEl` exactly as it always did,
  because `SVGElement` supports `classList`/`querySelector` like any HTML
  element.

### 7. `tables.js` (Truth Table Generator)
Unchanged except the master-table row-click handler, which now does
`control.el.classList.toggle('checked', ...)` instead of setting a
checkbox's `.checked` property (same reason as logic.js §6).

### 8. `popups.js` (Dialog & Note Handlers)
- `#note-popup`'s open triggers moved from raw DOM `click`/`dblclick`
  listeners to `paper.on('element:pointerclick'/'element:pointerdblclick',
  ...)` — same pencil-then-click / double-click-except-Push-Button behavior
  as before, just driven by the Paper's own cell events instead of a
  hand-rolled `event.target.closest('.control')` check.
- `setGateInputCount` now calls `control.cell.addPort({...})` /
  `control.cell.removePort(nodeId)` to grow/shrink a gate's inputs, instead
  of creating/removing DOM nodes by hand; any wire on a removed input is
  still deleted first, same as before.
- `#clear-all-confirm`, `#limit-popup` (registered as limits.js's prompt
  handler) are otherwise unchanged. `#input-count-popup` and
  `openInputCountPopup()` were removed: they were a dead, never-triggered
  standalone alternative to `#note-popup`'s own embedded input-count
  stepper, which is the only input-count UI actually wired up.

### 9. `toolbar.js` (Toolbar Controls, Zoom & Theme)
- Binds the toolbar buttons; `#btn-clear-all` opens the confirm via
  popups.js; Play/Stop call logic.js.
- The zoom slider and +/- buttons call canvas.js's `zoomTo()`-family
  functions and keep the slider's displayed value in sync via app.js's
  `'zoom:change'` event — the same math the mouse wheel uses, so all three
  always agree.
- `#btn-select`/`#btn-pan` just record which tool a drag on empty canvas
  means (`Canvas.setPanTool`); the actual pan is `canvas.js`'s `beginPan`.
- **Dark mode** (folded in from the old, separate `theme.js` — see the
  Module Architecture Overview above for why): toggles `.dark-mode` on
  `<body>` and persists the choice under the `localStorage` key `darkMode`,
  read back inside `try/catch`.

### 10. `main.js` (Entry Point)
Imports every module (which starts each one — see the import-order note in
the Module Architecture Overview above) and runs the first pass: size/center
the paper, `Logic.evaluate()`, `Tables.rebuild()`.
