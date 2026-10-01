# Master Prompt: Structure for the Logic Gate Simulator

> Matches the current `index.html` / `style.css` (the files win where they
> and this document disagree). Structural markup only: no inline styling
> and no JS in the HTML, except the two small, unavoidable `<head>` scripts
> noted in §0 — both are tiny, environment-detection one-offs, not app
> logic.
>
> This revision replaces the pre-JointJS version of this document: the
> `#canvas-sizer`/`#canvas-world`/`svg#wire-layer` DOM structure, the
> `#tpl-*` `<template>`s, and the tab bar it described no longer exist —
> the canvas is a JointJS `Paper` now (§4b), there is no tab bar (§1), and
> controls are built directly as JointJS shapes (`shapes.js`), not cloned
> from HTML templates.

## 0. `<head>`

`style.css`, then `joint.js` (sitting directly next to `index.html` — not
in a `lib/` subfolder) as a plain classic `<script>`, so its `joint` global
exists before any ES module runs. Two small inline scripts follow it:
- A **load guard**: shows a red banner if `joint.js` failed to load
  (`typeof joint === 'undefined'`), rather than every module silently
  failing with no visible symptom.
- A **font fallback**: checks `document.fonts.check("12px 'JetBrains
  Mono'")` and only injects a Google Fonts request if the font isn't
  already available locally — no unconditional `@import`.

## 1. `#app-header` (top bar)

Left to right:
- `.header-side` (empty spacer, keeps `#logo` centered)
- `#logo` ("Logic Gate Simulator")
- `.header-side#header-right`, right-aligned: `#close-btn` (×) only.

There is no `#menu` nav, `#doc-title`, "Guest" name stack, `#account`, or
`#btn-login` — Sign In was removed entirely. **`#close-btn` has no
behavior wired up yet** — it's a plain stub, open work, not a finished
confirm-and-close affordance.

Directly below the header is `#project-title` — a plain, **non-interactive**
static bar (just the text "Main"). There is no tab bar: no editable name
field, no close (×), no "+" to add another. The app works on a single
canvas; multiple independent circuits are handled by the Create Gate
feature (§3, §4a) instead of by switching between tabs.

## 2. `#toolbar`

save, print, clear-all, **`<`** ("Back to last save"), **`>`** ("Forward")
— repurposed from a conventional undo/redo pair into `saveLoad.js`'s
single-save-point revert, not a multi-step history — select, pan, play,
stop, multiselect, cut, copy, paste, delete, flip-h, flip-v, group,
**`#btn-create-gate`** ("create gate" — new), grid, note (✎), help. Each
logic-gate `.palette-item` carries `data-min-inputs` / `data-default-inputs`
(Buffer and NOT = 1, every other gate = 2; Buffer and NOT never change
their count).

## 3. `#main-content` (three-column body)

`#left-panel` | `#canvas-wrapper` | `#right-panel`.

### 3a. `#left-panel`

Input Controls / Output Controls / Logic Gates palettes, same as before,
plus a new fourth section:

- **`#custom-gates`** — "Custom Gates". Its `.panel-items` container
  (`#custom-gates-items`) starts empty in the markup; `customGates.js`
  populates it, both at startup (from its own `localStorage` key) and
  whenever a new custom gate is created. Each item it adds is a
  `.palette-item.custom-gate-item` carrying `data-type="custom:<id>"`, plus
  two small buttons of its own: a delete (×) and a "view configuration"
  (ⓘ, ascii `i`) — see §6.

Input and Output palette items get a colored top border (teal /
golden-yellow); Custom Gates items get their own accent border instead
(blue, `--color-selected`) to read as visually distinct from both. The
side panels have no collapse/expand buttons. Individual truth-table
circuits still collapse through their own `<details>`/`<summary>`.

### 3b. `#canvas-wrapper` — the canvas

```
#canvas-wrapper
  #paper-host      JointJS renders its own <svg> directly inside this div
```

There is no `#canvas-sizer`/`#canvas-world`/`svg#wire-layer` structure, and
no `#tpl-*` `<template>` elements — a JointJS `joint.dia.Paper` owns the
`<svg>` it creates inside `#paper-host`, and every gate/control/wire is
built directly as a `shapes.js` element/link, not cloned from a template.

- The canvas is a large (20000×20000 model-px) but not truly unbounded
  world — `app.js`'s `WORLD_SIZE`. Dragging an element, and panning, are
  both clamped to stay inside it (with a small overscroll margin for
  panning). Move around by dragging empty space (either tool), by the pan
  tool, or by scrolling the mouse wheel to zoom toward the cursor.
- Zoom (status-bar slider, 50%–200% in 10% steps) scales the whole paper as
  one layer via `paper.scale()`. The zoom keeps either the viewport center
  (slider/buttons) or the cursor (wheel) in place.
- The dot grid is a CSS background directly on `#paper-host` (not a
  JointJS-rendered grid), so it's always directly behind the content
  regardless of pan/zoom; the grid toolbar button toggles it.
- Wires and controls are deleted by selecting them and pressing Delete (or
  `#btn-delete`). There is no step-back/step-forward/eraser control.

#### 3b1. Gates, controls, and ports

Every gate/control is built directly by `shapes.js` as a
`joint.dia.Element` subclass, authored in a 60×40 local coordinate box and
then uniformly enlarged 50% (`shapes.js`'s `SIZE_SCALE`) via a CSS
transform — not by hand-editing any shape's coordinates. A custom gate
(§3a, §6) is the one shape NOT scaled this way; its box grows dynamically
with however many ports it ends up with instead.

**Ports** are JointJS ports, not DOM nodes with a `data-side` attribute —
each one carries a `baseSide`, and `data-side` is now a literal attribute
`shapes.js` stamps onto the port's own rendered DOM circle, reflecting its
CURRENT (post-flip) side, read by the wire's connector to decide routing
direction.

**Light bulb:** its single input starts below the glass (`baseSide:
'bottom'`); flip-vertical moves it to the top, same idea as before, now
implemented as real port repositioning (see `shapes.js`/`jsPrompt.md`
§2), not just a cosmetic mirror.

#### 3b2. Wires and nodes

- Dragging starts on an **output** port. Outputs may have any number of
  wires; an input accepts at most one. A gate's own output may now feed
  one of its own inputs (a self-loop) — previously blocked outright, now
  allowed, since the simulator can detect and report a non-settling
  feedback loop as unstable rather than needing to prevent the wiring that
  could cause one.
- Wires leave/enter in the direction each endpoint's current side implies
  (horizontal for a left/right port, vertical for top/bottom — e.g. the
  bulb, or any port after a flip-v).
- `validateConnection` refuses an invalid drop outright while dragging —
  there is no `.drop-target`/`.reject-flash` flash-after-the-fact cue (the
  CSS for both still exists, unused, in case that's added back later).
- A wire has a much wider invisible click target than its own visible
  line (14px vs. 2px) — a correction request, since the original line was
  hard to click.

#### 3b3. Selection

A click on a control or wire selects it (`.selected`); Ctrl/Cmd adds. With
`#btn-multiselect` armed, dragging empty space draws a rubber-band
(Ctrl/Cmd adds to the selection); with it off, dragging empty space pans.
A drag never ends in a stray click that would clear the selection.
Whichever tool/overlay is active (pan, multiselect, or the note tool, §5)
shows a matching cursor across the whole canvas, persisting until Escape,
right-click, or a different tool is picked.

### 3c. `#right-panel`

Truth Tables: `#truth-tables-list` plus `#logic-circuit-template`,
unchanged. Circuits with more than 10 switch inputs show a
`.table-cap-message` instead of the table. A custom-gate instance gets a
table the same way a built-in gate does; a gate's table caption uses its
note title instead of its type/definition name if one is set.

## 4. `#status-bar`

`#status-dot`, zoom out/slider/zoom in (`min=50 max=200 step=10
value=100`), and `#dark-mode-switch`/`#dark-mode-toggle`, unchanged.

## 5. Popups / dialogs

All are centered, fixed, and dim the page with a `body:has(...)::before`
backdrop.

- **`#note-popup`** — title, note, (gates only) `#note-input-count-section`,
  and now **`#note-clock-speed-section`** (clocks only — a `<select>`
  populated from `Logic.CLOCK_SPEED_PRESETS`, a correction request to let
  the user choose a clock's speed). Opens with the ✎ tool then a click
  (which now also disarms on a blank-canvas click, Escape, right-click, or
  picking a different tool), or by double-click on any control except the
  Push Button.
- `#clear-all-confirm` — unchanged.
- `#limit-popup` — the shared warning dialog; now also used by
  `saveLoad.js` for a corrupt-save warning and Back's "nothing to go back
  to yet" message, in addition to the gate limit / speed / big-table
  prompts.
- `#input-count-popup` and `#login-popup` no longer exist — both were dead
  (never triggered, or never given markup).

**New, all owned by `customGates.js`** (§6):
- `#create-gate-name-popup` — name prompt after a valid selection.
- `#create-gate-remove-confirm` — "remove the original gates?" Yes/No,
  shown after a successful create.
- `#custom-gate-message` — a plain info/alert (invalid selection, or a
  duplicate-behavior block, naming the existing gate).
- `#custom-gate-view` — read-only display of an existing custom gate's
  captured configuration (name, gate list, internal connection count) —
  it cannot be edited after creation, only viewed or deleted.
- `#custom-gate-delete-confirm` — deleting a definition also removes every
  placed instance (and its wires); the confirmation names how many.

## 6. Create Gate

Triggered by `#btn-create-gate`: select 3+ connected built-in gates (no
sources/sinks, no nesting an existing custom gate), name it, optionally
remove the originals from the canvas, and it appears as a new
`#custom-gates` palette item (§3a) backed by a precomputed truth table.
See `jsPrompt.md` §9 for the full mechanics (boundary-port derivation,
duplicate detection, the gate-limit weight, persistence).

## 7. Scripts

A single `<script type="module" src="main.js">` — `main.js` imports every
other module (12 total now — see `jsPrompt.md`). The page must be served
over http (Live Server / Codespaces, etc.); ES modules do not load from a
`file://` URL.

## General constraints

Structural markup only (no inline styling, no JS in the HTML) — except the
two small `<head>` scripts noted in §0, which are environment detection,
not application logic.
