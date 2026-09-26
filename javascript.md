# Master Prompt: Behavior & Architecture Spec

> Specification for the modular JavaScript implementation. Assumes the current `index.html` (including `<template>`s, `#wire-layer` SVG, and popup elements) and `style.css` (including custom properties and `body.dark-mode`).

## Module Architecture Overview

The application logic is partitioned into 10 decoupled modules:

1. **`app.js`**: Shared data model — tracks placed controls, unique IDs, wire connection graph, and active selection sets. Serves as the single source of truth for all other modules.
2. **`canvas.js`**: §1 — handles drag-and-drop from sidebar palette, cloning HTML `<template>`s onto the canvas, and dragging placed controls to reposition them.
3. **`wires.js`**: §2 — manages wire drawing, attachment, and detachment in `#wire-layer` SVG, enforcing the 1-wire-max per input node rule and unlimited wires for output nodes.
4. **`selection.js`**: §3 — implements single click-select, rubber-band multi-select, copy/cut/paste clipboard actions, flipping (horizontal/vertical), and grouping semantics.
5. **`logic.js`**: §4 + §6 — houses component evaluation logic (gate truth tables, active-low enable Tri-State logic, clock timing loops, play/stop/step simulation engine).
6. **`tables.js`**: §7 — constructs and updates single-gate and circuit-level truth tables in `#truth-tables-list`, cloning `#logic-circuit-template` as needed.
7. **`popups.js`**: §5 — controls `#note-popup` (including embedded node stepper), `#input-count-popup`, `#clear-all-confirm`, `#lonly-prompt`, and `#login-popup`.
8. **`toolbar.js`**: §8 — handles global action buttons (save, print, undo, redo, grid toggle, clear-all, zoom slider, zoom buttons, pan).
9. **`theme.js`**: §9 — handles `#dark-mode-toggle`, applying `dark-mode` class to `<body>`, and persisting state via `localStorage`.
10. **`main.js`**: Application entry point that initializes event listeners, binds module interactions, and bootstraps the initial state on load.

---

## Detailed Module Specifications

### 1. `app.js` (Shared Data Model)
- Maintains state structures for:
    - `controls`: Map of unique IDs to placed control metadata (type, position, input/output values, custom note titles/text).
    - `wires`: Array/Set of connections `{ id, sourceNodeId, targetNodeId, signalState }`.
    - `selection`: Set of currently selected control or wire IDs.
- Provides getter/setter API methods (`addControl`, `removeControl`, `addWire`, `removeWire`, `setSelection`, etc.) that fire change notifications to notify reactive updates across modules.

### 2. `canvas.js` (Palette & Canvas Interaction)
- **Palette Drag-and-Drop:**
    - Reads `data-type` from dragged `.palette-item`.
    - Clones `#tpl-<data-type>` (or `#tpl-logic-gate` for logic gates) upon drop on `#canvas`.
    - For logic gates, reads `data-min-inputs`/`data-default-inputs` to generate corresponding `.node.node-in.unattached` elements inside `.gate-inputs`.
- **Control Positioning:**
    - Moves single or grouped `.control` elements when dragged across `#canvas`. Updates coordinate positions in `app.js`.

### 3. `wires.js` (Wire Management)
- **Creation:** Initiated by `mousedown` on a `.node-out`. Draws a live `<path class="wire pending">` following cursor coordinates.
- **Constraints:**
    - Output nodes accept unlimited outgoing wires.
    - Input nodes accept **at most one** wire. Drops onto an occupied input node are rejected without modifying existing connections.
- **Visual Behavior:** No drop-target class or hover effect is added to target nodes while dragging. Upon valid drop, removes `.pending` from the wire and `.unattached` from the input node.
- **Signal Rendering:** Toggles `.signal-high` or `.signal-low` on wire paths based on current evaluation state from `logic.js`.

### 4. `selection.js` (Selection & Transformations)
- **Selection Modes:**
    - Click on `#canvas` element sets single active target in `app.js` and toggles `.selected`.
    - `#btn-multiselect` or click-drag draws bounding box selecting intersecting elements. Holding `Ctrl` adds to current selection.
- **Actions:**
    - `#btn-delete` / `Delete` key removes selected items and associated connected wires.
    - `#btn-cut`, `#btn-copy`, `#btn-paste` manipulate selection clipboard data.
    - `#btn-flip-h` / `#btn-flip-v` apply CSS transform mirrors to selected items.
    - `#btn-group` bundles selected items into a cohesive unit for collective dragging.

### 5. `logic.js` (Simulation & Gate Logic)
- **Evaluations:**
    - Standard gates: Buffer, NOT, AND, NAND, OR, NOR, XOR, XNOR truth table evaluation.
    - **Tri-State Gate:** 2 inputs — `data` (index 0) and `enable` (index 1, active-low). When `enable` = 0, output = `data`. When `enable` = 1, output is high-impedance (floating, no signal class applied to outgoing wire).
    - **Inputs/Outputs:** Checkbox toggles for switches; press-hold signals for push buttons; synced JS clock loops for clock controls (1.6s cycle); display updates for 4-bit digit controls.
- **Playback Control:**
    - `#btn-play`: Iterates through all input combinations across canvas items.
    - `#btn-stop`: Stops iteration loop.
    - `#btn-step-forward` / `#btn-step-back`: Advances or reverses one step combination.

### 6. `tables.js` (Truth Table Generator)
- Renders truth table `<table>` elements for each component on the canvas in `#truth-tables-list`.
- Clones `#logic-circuit-template` for connected sub-circuits, populating full multi-input/multi-output circuit tables inside `.logic-circuit-body`.
- Binds `click` handlers to table rows to manually jump simulation playback to specific state combinations.

### 7. `popups.js` (Dialog & Note Handlers)
- Binds `#btn-note` or double-clicking placed elements to open `#note-popup`.
- Pre-fills saved note titles and body text.
- Shows `#note-input-count-section` only if the target is a logic gate, adjusting input node count and dynamically attaching/detaching node elements in DOM without destroying unaffected wire connections.
- Manages visibility and responses for `#input-count-popup`, `#clear-all-confirm`, `#lonly-prompt`, and `#login-popup`.

### 8. `toolbar.js` (Toolbar Controls & Zoom)
- Binds `#btn-save`, `#btn-print`, `#btn-undo`, `#btn-redo`, `#btn-grid`, and `#btn-pan`.
- `#btn-clear-all` triggers `#clear-all-confirm` prompt via `popups.js`.
- Binds `#zoom-slider`, `#btn-zoom-in`, and `#btn-zoom-out` (50%–200%, 10% steps) to apply CSS `scale` transforms to `#canvas`.

### 9. `theme.js` (Theme Persistence)
- Listens to `#dark-mode-toggle` checkbox changes, toggling `.dark-mode` on `<body>`.
- Stores user preference under `localStorage` key (`darkMode`).
- Reads `localStorage` state safely on startup inside a `try/catch` block, restoring theme setting and checkbox state.

### 10. `main.js` (Entry Point)
- Imports and coordinates initialization across all sub-modules upon DOM load.