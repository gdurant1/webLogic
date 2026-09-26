# Master Prompt: Structure for the Logic Gate Simulator

> Rewritten to match the current `index.html` / `style.css` exactly —
> where this document and the files disagreed, the files won. Sections
> below are unchanged unless noted; changed/added sections are marked.

## 1. `#app-header` (top bar) — UPDATED to match actual markup

Actual structure, left to right:
- `.header-side` (empty spacer, keeps `#logo` visually centered)
- `#logo` ("Logic Gate Simulator")
- `.header-side#header-right`, right-aligned:
  - `#account` wrapping `#btn-login` ("Sign In")
  - `#btn-lonly` ("Lonly?")
  - `#close-btn` (×)

There is **no** `#menu` nav, `#doc-title`, or `#account-name`/"Guest"
stack — an earlier draft of this spec called for them, but they were
never built and the sign-in-button version is what exists. If a
Project/Circuit/Tools/Help menu bar or a logged-in "Guest" name display
is still wanted, that's new scope, not a correction.

## 2. `#tabs` (circuit tab bar)

Unchanged. `.tab` contains an editable `.tab-name-input` (not static
text) plus a `.tab-close` (×); followed by `#add-tab` ("+").

## 3. `#toolbar` — UPDATED (per-gate input defaults)

Order and behavior unchanged from the original 20-button spec. New:
each Logic Gates `.palette-item` now carries
`data-min-inputs`/`data-default-inputs` (Buffer, NOT = 1; AND, NAND,
OR, NOR, XOR, XNOR, Tri-State = 2), so the input-count stepper — now
embedded in `#note-popup` as well as the standalone
`#input-count-popup` (see §6) — has a real per-gate minimum to read
instead of a single global `min="1"`. Tri-State moved from 1 to 2
inputs because it's a standard tri-state buffer (data + enable), not a
single-input gate like Buffer/NOT — see javaScript.md §4.

## 4. `#main-content` (three-column body)

Unchanged: `#left-panel` | `#canvas-wrapper` | `#right-panel`.

### 4a. `#left-panel`

Unchanged. Input Controls / Output Controls palette items each get a
colored top border (teal / golden-yellow — see colorScheme.md); Logic
Gates palette items don't.

### 4b. `#canvas-wrapper`

Unchanged (`#canvas-controls` overlay + `#canvas`), plus:

#### 4b1. Canvas control `<template>`s — NEW

`index.html` now defines one `<template>` per draggable thing, so JS
has real markup to clone onto `#canvas` on drop instead of building DOM
from scratch:

- `#tpl-toggle-switch`, `#tpl-push-button`, `#tpl-clock`,
  `#tpl-high-constant`, `#tpl-low-constant`, `#tpl-light-bulb`,
  `#tpl-four-bit-digit` — one shape each, matching their existing
  `style.css` classes (`.toggle-switch`, `.push-button`, `.clock`,
  `.high-constant`/`.low-constant`, `.light-bulb`, `.four-bit-digit`).
- `#tpl-logic-gate` — one shared template for every gate type; JS sets
  `data-type` on the clone (which drives the icon via CSS) and
  populates `.gate-inputs` with one `.node.node-in.unattached` per
  input, per that gate's `data-default-inputs`.

Every node starts as `class="node node-in unattached"` or
`class="node node-out"`. JS removes `unattached` once a wire attaches —
and must **not** add any other node class while a wire is being dragged
toward it but hasn't landed yet (see §4b2).

#### 4b2. Wires and nodes — NEW

- `#canvas` now contains an empty `<svg id="wire-layer">` positioned
  over the dropped controls; JS draws one `<path class="wire">` per
  connection into it.
- Dragging starts from an **output** node (mousedown-and-hold, then
  drag); output nodes may have any number of wires. Input nodes may
  have **at most one**.
- While a wire is being dragged and hasn't attached yet, nodes it
  passes over do **not** change appearance — no hover/target-highlight
  state exists in CSS on purpose (see colorScheme.md's node note).
  `.wire.pending` (dashed) is the only in-progress visual, on the wire
  itself.
- Once attached, `.wire.signal-high`/`.signal-low` reflect the value
  it's carrying.

#### 4b3. Selection ("highlighted") — NEW

"Highlighted" = selected, meaning the user clicked a gate, a switch/
control, or a wire, and it can now be dragged (repositioned within, or
dropped onto, the canvas). JS toggles a `.selected` class on the
clicked `.control` or `.wire`; `#btn-multiselect`'s rubber-band (or
Ctrl-click) can select more than one at once. The visual itself
(`.control.selected`, `.wire.selected`) is fully defined in
`style.css` — see colorScheme.md's `--color-selected` token.

### 4c. `#right-panel`

Unchanged.

### 4d. Collapsing the side panels

Unchanged.

## 5. `#status-bar` (footer) — UPDATED (zoom range)

Unchanged otherwise, including `#dark-mode-switch`/`#dark-mode-toggle`
(checking it adds a `dark-mode` class to `<body>`, which now has a real
theme behind it — "Tokyo Night" (see colorScheme.md) — rather than an
empty hook; the checked state now also persists across reloads via
`localStorage`, per javaScript.md §9). New: `#zoom-slider` carries
`min="50" max="200" step="10" value="100"` directly in the markup —
50%–200% zoom, 10% per step — so `#btn-zoom-out`/`#btn-zoom-in` have a
real increment to move the slider by instead of an unspecified one.

## 6. Popups / dialogs — UPDATED (Note tool ⇄ input-count merge)

`#note-popup` and `#input-count-popup` are no longer fully separate
concerns:

- `#note-popup` now ends with `#note-input-count-section` — the same
  kind of `.stepper` markup as `#input-count-popup`, under its own ids
  (`#note-input-count`, `#note-input-count-increase`/`-decrease`) so
  both dialogs can coexist without id collisions. JS shows this
  section only when the note tool's target is a logic gate, and hides
  it otherwise (switches, buttons, clocks, constants, bulbs, and the
  4-bit digit have no adjustable input count).
- The Note tool itself now opens on **double-click** of a gate/control,
  in addition to the existing `#btn-note`-then-click flow — both open
  `#note-popup`. This resolves the earlier open question about
  double-click's role.
- `#input-count-popup` is unchanged structurally and still exists as a
  count-only alternative, but since double-click now opens
  `#note-popup` instead, it currently has no assigned trigger of its
  own (flagged in javaScript.md's open questions).

Everything else in this section (the note/clear-all/lonly popups'
own fields, `#clear-all-confirm`, `#lonly-prompt`) is unchanged.

## General constraints

Unchanged, plus: the canvas-control templates in §4b1 are structural
markup only (no inline styling, no JS) — same rule as everything else
in this document.
