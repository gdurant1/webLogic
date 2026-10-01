# Master Prompt: Structure for the Logic Gate Simulator

> Matches the current `index.html` / `style.css` (the files win where they
> and this document disagree). Structural markup only: no inline styling and
> no JS in the HTML.

## 1. `#app-header` (top bar)

Left to right:
- `.header-side` (empty spacer, keeps `#logo` centered)
- `#logo` ("Logic Gate Simulator")
- `.header-side#header-right`, right-aligned:
  - `#account` wrapping `#btn-login` ("Sign In")
  - `#close-btn` (×)

There is no `#menu` nav, `#doc-title` or "Guest" name stack.

## 2. `#tabs` (circuit tab bar)

`.tab` contains an editable `.tab-name-input` plus a `.tab-close` (×);
followed by `#add-tab` ("+").

## 3. `#toolbar`

Unchanged: save, print, clear-all, undo, redo, select, pan, play, stop,
multiselect, cut, copy, paste, delete, flip-h, flip-v, group, grid, note (✎),
help. Each logic-gate `.palette-item` carries `data-min-inputs` /
`data-default-inputs` (Buffer and NOT = 1, every other gate = 2; Buffer and
NOT never change their count).

## 4. `#main-content` (three-column body)

`#left-panel` | `#canvas-wrapper` | `#right-panel`.

### 4a. `#left-panel`

Input Controls / Output Controls / Logic Gates palettes. Input and Output
palette items get a colored top border (teal / golden-yellow). **The side
panels have no collapse/expand buttons** (`#btn-collapse-left/right` and the
`.collapsed` styles were removed). Individual truth-table circuits still
collapse through their own `<details>`/`<summary>`.

### 4b. `#canvas-wrapper` — the "infinite" canvas

```
#canvas            scrolling viewport (scrollbars stay visible)
  #canvas-sizer    resized by JS to (world size x zoom): sets the scroll area
    #canvas-world  WORLD_SIZE x WORLD_SIZE px (20000), scaled by zoom as ONE layer
      controls...  cloned here, positioned in world coordinates
      svg#wire-layer  fills the world; one outline + colored <path> per wire
```

- The canvas is a very large scrollable world (a practical limit, not truly
  unbounded). Move around by dragging empty space (either tool), by the pan
  tool, or with the scrollbars.
- Zoom (status-bar slider, 50%-200% in 10% steps) scales the **whole world as
  one layer**. Every control keeps its original size relative to the others,
  new or old. The zoom keeps the middle of the view in place.
- The dot grid is the background of `#canvas-world`, so it pans and zooms
  with the content; the grid toolbar button toggles it.
- The old `#canvas-controls` box (step back, step forward, eraser) was
  **removed**. Wires and controls are deleted by selecting them and pressing
  Delete (or `#btn-delete`).

#### 4b1. Canvas control `<template>`s

One `<template>` per draggable thing: `#tpl-toggle-switch`, `#tpl-push-button`,
`#tpl-clock`, `#tpl-high-constant`, `#tpl-low-constant`, `#tpl-light-bulb`,
`#tpl-four-bit-digit`, and one shared `#tpl-logic-gate` (JS sets `data-type`
and builds the `.node.node-in` rows from `data-default-inputs`).

**Light bulb:** the bulb comes first and its single input node comes after it,
centered **below** the bulb. That node has `data-side="bottom"`, which tells
`wires.js` the wire enters vertically, from below. Flip-vertical moves the
node (and its wire) to the top.

#### 4b2. Wires and nodes

- Dragging starts on an **output** node. Outputs may have any number of
  wires; an input node has at most one.
- Wires leave outputs to the right and enter inputs from the left, except a
  node with `data-side` (the bulb: bottom). Flips mirror the sides.
- While a wire is dragged, unoccupied input nodes show `.drop-target`
  (cleared when the drag ends); a rejected drop flashes `.reject-flash`.
- Wire endpoints are computed from stored control coordinates plus cached node
  offsets, and only the wires attached to moved controls are redrawn (batched
  with `requestAnimationFrame`).

#### 4b3. Selection

A click on a control or wire selects it (`.selected`); Ctrl/Cmd adds. With
`#btn-multiselect` armed, dragging empty space draws a rubber-band (Ctrl/Cmd
adds to the selection). With it off, dragging empty space pans. A drag never
ends in a stray click that would clear the selection.

### 4c. `#right-panel`

Truth Tables: `#truth-tables-list` plus `#logic-circuit-template`. Circuits
with more than 10 switch inputs show a `.table-cap-message` instead of the
table (see limits in javascript.md).

## 5. `#status-bar`

`#status-dot`, zoom out/slider/zoom in (`min=50 max=200 step=10 value=100`),
and `#dark-mode-switch`/`#dark-mode-toggle` (adds `dark-mode` to `<body>`;
remembered in `localStorage`).

## 6. Popups / dialogs

All are centered, fixed, and dim the page with a `body:has(...)::before` backdrop.

- `#note-popup` — title, note, and (gates only) `#note-input-count-section`.
  Opens with the ✎ tool then a click, or by double-click on any control
  **except the Push Button**, which opens only through ✎.
- `#input-count-popup` — count-only alternative; no trigger assigned yet.
- `#clear-all-confirm` — Yes / No confirmation before erasing the canvas.
- `#limit-popup` — shared warning dialog (title, message, cancel/confirm)
  with a severity class: `limit-notice`, `limit-warning`, `limit-dire`.
- `#login-popup` is styled in the CSS but has no markup yet.

## 7. Scripts

A single `<script type="module" src="main.js">` — `main.js` imports every
other module. The pages must be served over http (Live Server / Codespaces);
ES modules do not load from a `file://` URL.

## General constraints

Structural markup only (no inline styling, no JS in the HTML).
