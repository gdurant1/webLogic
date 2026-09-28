# Master Prompt: Behavior & Architecture Spec

> Specification for the modular JavaScript implementation. Assumes the current `index.html` (including the `<template>`s, the `#canvas` → `#canvas-sizer` → `#canvas-world` structure, the `#wire-layer` SVG and the popup elements) and `style.css` (custom properties and `body.dark-mode`). The code is the source of truth where the two disagree.

## How it runs

All modules are **ES modules** (`import` / `export`). `index.html` loads a single `<script type="module" src="main.js">`, and `main.js` imports the rest. The page must be **served over http** (VS Code Live Server, Codespaces, `python -m http.server`); ES modules do not load from `file://`.

Cross-module communication goes through `app.js` (shared state) and its `events` EventTarget, so the import graph has no cycles:

```
app.js ← limits.js ← logic.js, wires.js, tables.js, popups.js
app.js ← canvas.js ← selection.js, popups.js
logic.js ← tables.js, popups.js, toolbar.js        popups.js ← toolbar.js
main.js imports everything (and owns the mousedown router)
```

## Module Architecture Overview

The application logic is partitioned into 11 decoupled modules:

1. **`app.js`**: Shared data model — controls, wires, node registry, selection, zoom, circuit grouping, coordinate conversion. Single source of truth.
2. **`limits.js`**: §1b — circuit gate limit, truth-table input cap, speed guard, and the prompt queue. Decides and remembers; `popups.js` draws the dialog.
3. **`canvas.js`**: §2 — palette drag-and-drop, cloning `<template>`s into `#canvas-world`, dragging placed controls.
4. **`wires.js`**: §3 — wire drawing/attachment in `#wire-layer`, 1-wire-per-input rule, cached node geometry, batched redraws.
5. **`selection.js`**: §4 — click-select, rubber-band, delete, cut/copy/paste, flip, group.
6. **`logic.js`**: §5 — gate evaluation, sources/sinks, shared clock timer, play/stop.
7. **`tables.js`**: §6 — single-gate and circuit truth tables, with the input cap.
8. **`popups.js`**: §7 — note popup, input-count popups, clear-all, lonly, and the limit dialog.
9. **`toolbar.js`**: §8 — toolbar buttons, zoom, pan, viewport setup.
10. **`theme.js`**: §9 — dark mode + `localStorage`.
11. **`main.js`**: §10 — entry point and the single mousedown router.

The **dating sim** (`datingSimIndex.html`) is a separate page with its own modules (`datingSimMain.js`, `datingSimRender.js`, `datingSimDialogue.js`, `datingSimAudio.js`, `datingSimCircuit.js`) — see `dateSim.md`.

---

## Detailed Module Specifications

### 1. `app.js` (Shared Data Model)
- Constants: `WORLD_SIZE` (20000), `MIN_ZOOM`/`MAX_ZOOM` (0.5 / 2), `GATE_TYPES`, `FIXED_INPUT_TYPES` (Buffer, NOT).
- State: `controls` (Map), `wires` (Map), `nodeIndex` (Map: nodeId → `{ el, controlId, kind, index }`), plus lookup indexes: wires by control, wires from an output node, and the one wire into an input node. Selection is a Set of `"c:<id>"` / `"w:<id>"` keys.
- A **control** is `{ id, type, el, x, y, inputCount, note?, groupId?, flipH?, flipV?, clockValue?, capApproved?, tableCapApproved? }`. `x`/`y` are **world** coordinates (unscaled pixels).
- API: `addControl/removeControl`, `registerNode/getNode`, `addWire/removeWire`, `getWireInto`, `getWiresFromNode`, `getWiresForControl`, `isNodeOccupied`, `getConnectedControlIds`, `getComponents`, selection functions, `getZoom/setZoom`, `clientToWorld`, `swallowNextClick`.
- Notifications on `events`: `control:add`, `control:placed`, `control:move`, `control:remove`, `control:inputcount`, `control:flip`, `wire:add`, `wire:remove`, `selection:change`, `zoom:change`, `simulation:update`.

### 1b. `limits.js` (Circuit limits & speed guard)
- **Gate limit (per circuit).** A circuit is a group of wired-together controls. Up to `CIRCUIT_GATE_LIMIT` = 10 gates: no prompt. A wire that would join gates into a circuit of more than 10 opens a warning dialog ("adding more gates will cause issues"); the user must approve removing the limit for that circuit. Declined = the wire is not made. Approved = every control in that circuit gets `capApproved`, and more gates can be added.
- **Speed guard.** Only runs once some circuit has been approved. It takes the median of the last 5 `evaluate()` times plus the median of the last 5 truth-table rebuild times, and compares that "update cost" with a 60 fps frame budget (16.7 ms). Each time the cost crosses a stage upward the user is prompted again:

  | Stage | Slower than 60 fps by | Update cost | Dialog |
  |---|---|---|---|
  | 1 | 20% | ≈ 20.8 ms | notice |
  | 2 | 35% | ≈ 25.6 ms | warning |
  | 3 | 50% | ≈ 33.3 ms | **DIRE** (red, focus on the safe button) |

  "Keep going" accepts that stage. "Stop adding gates" (or Escape) revokes every approval, so the 10-gate limit applies to new connections again. If the cost falls back below a stage, that stage can prompt again later. These numbers are best assumptions and are easy to change (`SPEED_STAGES`).
- **Truth-table cap.** A circuit's master table has 2ⁿ rows for n switch inputs. Up to `TABLE_INPUT_LIMIT` = 10 it is built automatically; above that a message with a **Show anyway** button (per circuit, behind a warning dialog) appears; above `TABLE_INPUT_HARD_LIMIT` = 14 it is never built.
- **Prompt queue.** `confirm(options)` queues dialogs so two are never on screen at once. `popups.js` registers the drawing function with `setPromptHandler()`.

### 2. `canvas.js` (Palette & Canvas Interaction)
- **Palette drag-and-drop:** reads `data-type` from the dragged `.palette-item`, clones `#tpl-<data-type>` (or `#tpl-logic-gate` for gates) into `#canvas-world` at the drop point (converted with `clientToWorld`, so it is correct at any zoom or scroll). For gates, reads `data-min-inputs`/`data-default-inputs` to build the `.node.node-in.unattached` elements.
- **Positioning:** `beginControlDrag()` moves one control, or the whole selection if the control is part of it. Movement is divided by the zoom level, clamped to the world, and started only after a 3 px threshold. Each move fires `control:move`.
- Cleans up a control's DOM element and node registrations when `control:remove` fires.

### 3. `wires.js` (Wire Management)
- **Creation:** the mousedown router calls `beginWireDrag()` for a press on a `.node-out`; a live `<path class="wire pending">` follows the cursor.
- **Constraints:** outputs accept unlimited wires; an input accepts **at most one** (a drop on an occupied input is rejected with a brief red `.reject-flash`). While dragging, unoccupied `.node-in` elements get `.drop-target`; it is cleared when the drag ends. The drop hit-test uses `elementsFromPoint`, so a wire lying across a node cannot hide it.
- **Limits:** before a wire is created, `limits.checkConnection()` may require the user's approval (§1b).
- **Geometry:** each node's offset inside its control is measured once (placement, input-count change, flip, fonts loaded) and cached. Wire endpoints = `control.x/y` + cached offset, so nothing reads layout per wire while dragging. Moves mark controls dirty and one `requestAnimationFrame` redraws only the wires attached to them.
- **Direction:** outputs leave to the right and inputs enter from the left, except a node with `data-side` (the light bulb's input is `bottom`, so its wire enters vertically from below). `flipH`/`flipV` mirror the sides.
- **Signal rendering:** `logic.js` toggles `.signal-high`, `.signal-low` and `.signal-clock`.

### 4. `selection.js` (Selection & Transformations)
- Click on a `.control` sets the single selection and toggles `.selected`; Ctrl/Cmd-click adds or removes. A click on empty canvas clears it. A wire click selects the wire.
- `#btn-multiselect` arms the rubber-band: dragging empty space draws a box in world coordinates and selects every intersecting control (hold Ctrl/Cmd to add to the current selection). With it off, dragging empty space pans (§8).
- Delete/Backspace and `#btn-delete` remove selected controls and wires (and any wire attached to a removed control). **Wires and controls are deleted only this way — the eraser tool was removed.**
- `#btn-cut/copy/paste`, `#btn-flip-h/v` (CSS `scale(±1)`, then `control:flip`), and `#btn-group` (shared `groupId`; clicking any member re-selects the group).
- After a pan, a control drag or a rubber-band, the browser's trailing click is swallowed (`swallowNextClick`) so it cannot clear or change the selection.

### 5. `logic.js` (Simulation & Gate Logic)
- **Gates:** Buffer, NOT, AND, NAND, OR, NOR, XOR, XNOR. **Tri-State:** `data` (index 0) + active-low `enable` (index 1); enable = 0 → output = data; enable = 1 → high-impedance (no signal class on the outgoing wire).
- **Evaluation** is an iterative pass over all controls that stops as soon as a pass changes nothing. Each run is timed and reported to `limits.js`. Bursts of events are coalesced with `scheduleEvaluate()`.
- **Sources:** toggle switch (checkbox), push button (press and hold), clock, high/low constant. **Sinks:** light bulb (`.on`), 4-bit digit (node 0 = most significant bit).
- **Clocks** share **one** timer (a 800 ms half-period). Each clock keeps its own value and **starts low when placed**, so clocks placed at different moments can be opposite each other. The indicator is the `.on` class (no CSS animation).
- **Playback:** `#btn-play` iterates through every combination of the canvas's toggle switches; `#btn-stop` stops it. (Step-forward/step-back were removed with the canvas control box.)

### 6. `tables.js` (Truth Table Generator)
- Every gate not wired into a larger circuit gets its own table; wired-together controls are grouped (`App.getComponents`) under a cloned `#logic-circuit-template` with a master table of all switch combinations against the outputs, plus each member gate's table.
- Clicking a master-table row sets the real switches to that combination.
- Over 10 switch inputs the master table is replaced by a message with **Show anyway**; over 14 it is never built (§1b). Rebuilds are coalesced and timed for the speed guard.

### 7. `popups.js` (Dialog & Note Handlers)
- `#btn-note` (then a click) or a double-click on a placed control opens `#note-popup`. **Exception: a Push Button ignores double-click** (a double-click is two quick presses) and opens its note **only** through the pencil.
- `#note-input-count-section` shows only for logic gates; changing the count adds/removes nodes without touching unaffected wires (Buffer and NOT are locked at 1; other gates have a minimum of their `data-min-inputs`).
- `#input-count-popup`, `#clear-all-confirm`, `#lonly-prompt` ("Yes" opens `datingSimIndex.html` in a **new tab**), and the `#login-popup` stub (no markup yet).
- `#limit-popup` is the shared warning dialog for `limits.js` (severity classes `limit-notice` / `limit-warning` / `limit-dire`; Escape cancels).

### 8. `toolbar.js` (Toolbar Controls, Zoom & Pan)
- Binds `#btn-save`, `#btn-print`, `#btn-undo`/`#btn-redo` (stubs — no history stack yet), `#btn-grid`, `#btn-select`, `#btn-pan`, `#btn-clear-all` (via `popups.js`), `#btn-play`, `#btn-stop`, `#btn-help`.
- **Zoom** (`#zoom-slider`, `#btn-zoom-in/out`, 50%–200%, 10% steps) scales `#canvas-world` as **one layer**, so every control keeps its original size relative to the others. `#canvas-sizer` is resized to (world × zoom) so the scrollbars match, and the middle of the view stays fixed.
- **The canvas is a scrollable world** of `WORLD_SIZE` × `WORLD_SIZE` pixels (a practical limit). The view starts centered; scrollbars stay visible. Panning: the pan tool, or dragging empty space with either tool (unless multi-select is armed).

### 9. `theme.js` (Theme Persistence)
- Listens to `#dark-mode-toggle`, toggling `.dark-mode` on `<body>`; stores the choice under the `localStorage` key `darkMode`; reads it safely on startup inside `try/catch`.

### 10. `main.js` (Entry Point)
- Imports every module (which starts each one) and runs the first pass: size and center the world, `evaluate()`, `Tables.rebuild()`.
- **Mousedown router** — one listener on `#canvas` (left button only) replaces the four separate mousedown handlers:
  1. press on a `.node-out` → `Wires.beginWireDrag`
  2. press on a control's body → `Canvas.beginControlDrag` (ignored by the pan tool; input nodes and a control's own inputs/buttons/switch are left alone)
  3. press on empty space with multi-select armed → `Selection.beginRubberBand`
  4. press on empty space otherwise → `Toolbar.beginPan`
