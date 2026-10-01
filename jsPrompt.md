# Master Prompt: Behavior & Architecture Spec

> Specification for the modular JavaScript implementation. The code is the
> source of truth where the two disagree. This revision covers the full
> JointJS rewrite plus Phase A (bug fixes, flip/port-mirroring, world
> bounds, the Create Gate feature) and Phase B (Save/Load + Back/Forward,
> latch/feedback evaluation), plus a later correction pass (size increase,
> tool cursors, note badges, wider wire hit-area, adjustable clock speed,
> truth-table titles). **Touch/pointer-event support and the header's
> `#close-btn` are not implemented** — both remain open work; everywhere
> else below describes what actually exists and has been browser-tested.

## How it runs

Every module is an **ES module** (`import` / `export`). `index.html` loads
`joint.js` (the JointJS UMD build, sitting directly next to `index.html` —
**not** in a `lib/` subfolder) as a plain classic `<script>` first, so its
`joint`/`g`/`V` globals exist before `<script type="module" src="main.js">`
runs; `main.js` then imports the rest. The page must still be **served over
http**; ES modules do not load from a `file://` URL.

Two small inline scripts run in `<head>`, right after the `joint.js` tag:
- A **load guard**: if `joint.js` failed to load for any reason (wrong path,
  missing file), `typeof joint === 'undefined'`, and a red banner is shown
  explaining the simulator can't run — rather than every module silently
  failing with no visible symptom.
- A **font fallback**: `document.fonts.check("12px 'JetBrains Mono'")`
  decides whether the font is already available locally; only if it isn't
  does the page inject one request to Google Fonts. No unconditional
  `@import` — fully offline if the font is installed.

### Why JointJS core, not `joint.shapes.logic` or Rappid

Two deliberate exclusions:
- **`joint.shapes.logic`** (a bundled demo shape library) is tied to the old,
  now-deprecated `jointjs` npm package, and JointJS's own actively-maintained
  "Logic Circuits" demo is built with **JointJS+** (a separate paid product),
  not open-source core. `shapes.js` instead defines every gate/control as a
  plain `joint.dia.Element`, reusing the project's own original SVG icon
  paths so the look is unchanged (just larger — see §2).
- **Rappid** (JointJS+'s UI toolkit — Halo, Stencil, PaperScroller,
  SelectionView, Inspector) isn't open source either. Anywhere the old plan
  called for a Rappid widget, this app either uses the open-source
  equivalent building block instead (`paper.scale()`/`paper.translate()` in
  place of `ui.PaperScroller`; `paper.findViewsInArea()` in place of
  `ui.SelectionView`'s rubber-band) or hand-rolls the small remaining gap
  (drag-to-pan, multi-selection group-drag) directly against the Paper.

### Offline / vendoring

`index.html`'s `<script src="joint.js">` expects that file to sit directly
next to `index.html` (`npm install @joint/core`, then copy
`node_modules/@joint/core/dist/joint.js` in, or download it from a CDN once
and save it locally) — no CDN reference at runtime, no network access once
it's there. No `joint.css` is loaded or needed: none of this app's UI is a
Rappid widget, so every visual is still styled by this project's own
`style.css`.

## Module Architecture Overview

The application logic is partitioned into **12 modules**:

```
app.js ← limits.js ← canvas.js, logic.js, tables.js, popups.js, customGates.js
app.js ← canvas.js ← selection.js, popups.js, toolbar.js, customGates.js, saveLoad.js
shapes.js ← canvas.js, selection.js, popups.js, customGates.js, saveLoad.js
logic.js ← tables.js, popups.js, toolbar.js, customGates.js, saveLoad.js
tables.js ← popups.js, saveLoad.js
popups.js ← saveLoad.js
customGates.js ← logic.js, canvas.js (late-bound resolvers — see §9)
main.js imports everything, and runs the first render pass
```

1. **`app.js`** (§1) — shared data model: controls, wires, selection, zoom,
   world-bounds clamping — backed by a `joint.dia.Graph`, with the SAME
   public functions as the pre-JointJS version.
2. **`shapes.js`** (§2) — every gate/control as a custom `joint.dia.Element`
   subclass; flip/port-mirroring; the size-up scale wrapper; note badges;
   the side-aware `Wire` link type with its wider click target.
3. **`canvas.js`** (§3) — the one `joint.dia.Paper`/`joint.dia.Graph`;
   palette drag-and-drop; placing controls (including from a saved circuit,
   with a preserved id); pan/zoom; world-bounds restriction; the tool
   cursor's `interactive` option; wire creation and the z-ordering fix that
   keeps ports clickable even once a wire is attached.
4. **`limits.js`** (§4) — circuit gate limit (now custom-gate-weight-aware),
   truth-table input cap, speed guard, prompt queue.
5. **`selection.js`** (§5) — click-select, rubber-band (now correctly
   screen-space), multi-select group-drag (world-bounds clamped), cut/copy/
   paste (deliberately excluding flip state and notes), group, and **full**
   flip (not just cosmetic — see §5).
6. **`logic.js`** (§6) — gate evaluation with **latch/feedback support**
   (persisted state, oscillation detection), sources/sinks, per-clock
   timers with adjustable speed, Play/Stop.
7. **`tables.js`** (§7) — truth tables, including custom-gate tables, the
   same latch/oscillation-aware evaluation (without cross-row memory), and
   note-title-overridden captions.
8. **`popups.js`** (§8) — note popup (now with a clock-speed selector and
   note-badge upkeep), input-count stepper (now clamp-and-write-back
   correct), clear-all, the limit dialog, and the shared `tool:cancel`
   listener for the pencil tool.
9. **`customGates.js`** (§9) — the "Create Gate" feature: packaging a wired
   sub-circuit into a reusable custom gate with a precomputed truth table.
10. **`toolbar.js`** (§10) — toolbar buttons, zoom, the select/pan tool
    cursor system (and the shared `tool:cancel` event other modules listen
    for), dark mode.
11. **`saveLoad.js`** (§11) — Save/Load (automatic restore at startup) and
    Back/Forward (a single-save-point revert, not a conventional undo
    stack).
12. **`main.js`** (§12) — entry point; import order; the first
    `evaluate()`/`Tables.rebuild()` pass.

---

## Detailed Module Specifications

### 1. `app.js` (Shared Data Model)
- Constants: `WORLD_SIZE` (20000 — the Paper's model-space size, a practical
  "infinite canvas" limit), `MIN_ZOOM`/`MAX_ZOOM` (0.5 / 2), `GATE_TYPES`,
  `FIXED_INPUT_TYPES` (Buffer, NOT).
- A **control** is `{ id, type, cell, el, x, y, inputCount, note?, groupId?,
  flipH?, flipV?, capApproved?, tableCapApproved?, gateWeight?,
  halfPeriodMs?, clockValue?, lastOutput?, lastOutputs? }`. `type` for a
  custom-gate instance is `"custom:<definitionId>"`. `cell` is the
  `joint.dia.Element`; `el` is that cell's rendered SVG `<g>` — existing
  class-based code (`.classList.toggle`, `.querySelector(...)`) works
  unchanged against it, since `SVGElement` supports the same DOM APIs as
  HTML elements.
- A **wire** is `{ id, cell, fromNodeId, toNodeId, fromControlId,
  toControlId, pathEl, outlineEl, signal }`.
- **Node ids**: `"<controlId>-out"` (single-output sources/gates),
  `"<controlId>-in-<i>"` (any input), and `"<controlId>-out-<i>"` (a custom
  gate's possibly-multiple outputs). `getNode()`'s regex tries the indexed
  `-out-<N>` form before the bare `-out`, so both resolve correctly.
- `getWireInto`/`getWiresFromNode`/`getWiresForControl` are backed by
  maintained `Map` indexes (`wireIntoNode`, `wiresFromNode`,
  `wiresForControl`), not a linear scan — O(1)/O(k) instead of O(total
  wires), same public API as before.
- `clampToWorldBounds(x, y, width, height)` clamps a box's top-left so it
  stays fully inside `[0, WORLD_SIZE]` on both axes, using the box's REAL
  size (not a flat margin approximation) — used by `canvas.js`'s placement
  and `restrictTranslate`, and by `selection.js`'s group-drag.
- API otherwise unchanged: `addControl/removeControl`, `isNodeOccupied`,
  `getConnectedControlIds`, `getComponents`, the selection functions,
  `getZoom/setZoom`, `swallowNextClick`.

### 2. `shapes.js` (Custom JointJS Shapes)

**Size.** Every gate/source/sink shape is authored in a fixed 60×40 local
coordinate box (`AUTHORED_SIZE`) — unchanged, so none of the hand-written
path/attrs coordinates (`GATE_PATHS`, track/face/glass dimensions, etc.)
needed editing. A correction request enlarged every one of these shapes by
`SIZE_SCALE = 1.5` (50%) — gates, sources, and the light bulb all got
visibly bigger, and the 4-bit digit's 4 input ports, which previously sat
~8.7px apart (less than their own 12px diameter — a real visual overlap),
now sit ~15px apart. This is done with **no coordinate rewriting**: an
outer `scaleGroup` wraps each shape's real content with a static CSS
`transform: scale(1.5)`, while the shape's actual `size` (what ports and
everything else sees) is `AUTHORED_SIZE * SIZE_SCALE` — enlarged content
and enlarged port positions grow from the same (0,0) origin and line up
exactly. Custom gates are NOT scaled by this (their own height already
grows with port count, so they never had the overlap problem, and they
weren't part of the request).

**Flip is now FULL, not cosmetic.** All visual markup lives inside an inner
`flipGroup` (never on `root`, whose own transform is how JointJS positions
the element in the world). Ports are mirrored explicitly — they render
outside the markup tree, as a JointJS sibling layer — via `layoutPorts(cell)`:
every port carries `baseSide`/`baseIndex`/`baseTotal`, and flipping
recomputes each port's actual side (`flipH` swaps left↔right, `flipV` swaps
top↔bottom) and absolute `(x, y)`, with `flipV` also REVERSING the physical
order of ports sharing a left/right edge (so a 4-bit digit's MSB moves from
top to bottom, exactly like flipping a real chip). `stampPortSides` then
writes each port's resolved side as a literal `data-side` DOM attribute,
which the Wire's connector reads to decide whether to route horizontally or
vertically. A label inside a flipped shape gets a counter-transform
(`counterFlipText`) so text stays readable instead of mirroring backwards.

One non-obvious bug, found and fixed during this work: `applyFlipTransform`'s
`cell.attr('flipGroup/transform', ...)` call makes JointJS reapply the
model's *declared* root class to the DOM on that re-render — discarding any
class added via raw `classList` that isn't part of the model (a toggle
switch's `.checked`, a push button's `.pushed`, a clock's `.on`, or
`.selected`). Since those first three ARE the control's actual state with
no other backing, losing them on flip wasn't just cosmetic — a flipped
"on" switch would silently read as off. `selection.js`'s `flip()` now
snapshots which of these classes are present immediately before the flip
transform, and reapplies them immediately after.

**Note badges.** A small filled dot (`.note-badge`, top-right corner of
every shape, sized to its own authored width) shows whenever a control has
a note with a title or body — `popups.js`'s `updateNoteBadge(control)`
toggles it via `cell.attr('noteBadge/display', ...)`, never raw `classList`
(same re-render-wipes-it risk as flip state, above), called after every
place a note gets written (the popup's save/live-edit paths, and
`saveLoad.js`'s restore).

**`Wire`** is a `joint.dia.Link` subclass with THREE stacked paths, not
two: `.wire-outline` (thick, dark, behind), `.wire` (the colored, thin
visible line, `pointer-events: none`), and `.wire-hit-area` (invisible,
14px wide, `pointer-events: stroke` — the actual click target now, added so
selecting a wire is easier than clicking its own thin 2px line).
`connector: sideAwareConnector` — a function value, not a `{name}`
descriptor, verified directly against this project's `joint.js` to be
accepted that way — reads each endpoint's live `data-side` to decide
whether to leave/enter horizontally or vertically.

**Self-loops are allowed.** A gate's own output may feed one of its own
inputs — necessary for the oscillation-detection case in §6 — unlike an
earlier version of `canvas.js`'s `validateConnection` which blocked all
self-loops outright.

### 3. `canvas.js` (Paper, Palette, Pan/Zoom, Wire Creation, World Bounds)
- Creates the one `joint.dia.Graph` + `joint.dia.Paper`.
  `defaultLink: () => new Shapes.Wire()` and `validateConnection` (output→
  input only, one wire per input — verified via `App.getNode()`'s own kind
  parsing, not a brittle `id.endsWith('-out')` string check, since a custom
  gate's indexed output ids don't end in a bare `-out`) are JointJS's own
  "drag from a magnet to create a link" mechanism.
- `interactive` declines link-body dragging entirely, and any control's
  `elementMove` while it's part of a >1-member selection (so
  `selection.js` can move the group by hand) — returned as a per-feature
  **object** (`{ elementMove: false }`), not a blanket boolean, since this
  joint.js's `can(feature)` treats a plain `false` as disabling EVERY
  feature on that cell, including dragging a wire out of its own output
  port (confirmed by testing: an earlier version that returned `false` for
  toggle switches/push buttons broke wiring from their output entirely).
  Toggle switches and push buttons are otherwise fully interactive,
  `elementMove` included — a plain click still resolves to
  `element:pointerclick` regardless, since JointJS's own move-threshold (not
  this option) is what decides click vs. drag.
- **Placement** (`placeControl(type, left, top, defaultInputs, customGateId,
  savedId)`): `savedId` (used by `saveLoad.js`'s restore) preserves a
  cell's id across reload, so saved wires — built from those same ids —
  still resolve; passing `{ id: savedId }` in the shape's constructor
  attributes is sufficient on its own (traced through this joint.js's Cell
  constructor to confirm — no second "options" argument needed, despite
  `initialize(options)`'s parameter name actually binding to the first
  constructor argument). Every placement clamps to the real world bounds
  via `App.clampToWorldBounds` (the control's actual size, not a flat
  margin), and stamps port sides immediately after adding the cell to the
  graph.
- **World bounds**: `restrictTranslate` keeps a single-element drag inside
  `[0, WORLD_SIZE]`; panning is clamped to a 200px overscroll margin beyond
  the world edge (`clampPanTranslate`, applied to the initial view, drag-to-
  pan, and wheel-zoom's own translate nudge alike).
- **Wire registration & the z-ordering fix**: `graph.on('change:target', ...)`
  fires once a dragged link's loose end lands on a real port (skipped
  entirely during `saveLoad.js`'s restore — see §11 — via the `setRestoring`
  flag, so a previously-approved over-the-cap circuit doesn't re-trigger the
  gate-limit dialog). Newly-registered wires are pushed behind every
  element (`setTimeout(() => link.toBack(), 0)`, deferred by one tick) —
  without this, a wire renders in front of the elements it connects
  (JointJS has one shared cells layer, not separate elements/links layers,
  ordered by insertion), and once a port already has one outgoing wire, a
  second wire's wider click target (see §2) sits exactly on top of that
  port, making it impossible to drag a new connection from it at all. The
  deferral matters: a synchronous `toBack()` call gets silently overwritten
  by JointJS's own "bring the just-connected link to front" step later in
  the same tick — confirmed directly by testing, not assumed.
- A dragged link's own preview path has its `pointer-events` disabled for
  as long as it remains a preview (`setWireHitTestable`, via
  `link.attr('hitArea/class', ...)` — declarative, not `classList`, for the
  same re-render reason as flip state above) — otherwise, for a short
  connection (notably a self-loop), the preview's own endpoint sitting
  exactly at the cursor can shadow the very port being dropped onto.
- **Palette drag-and-drop** is delegated (one listener on `#left-panel`,
  not one per `.palette-item`), so custom-gate palette items — added and
  removed at any time by `customGates.js` — work without re-registering
  anything. A dragged item's `data-type` of `"custom:<id>"` is parsed and
  routed to `placeControl('custom', ..., id)`.
- **Zoom**: `zoomTo(scale, clientX, clientY)` rescales via `paper.scale()`,
  keeping the given screen point fixed; no point given zooms toward the
  viewport center (slider, +/- buttons); the mouse **wheel** zooms toward
  the cursor, same 10% steps as the buttons.

### 4. `limits.js` (Circuit limits & speed guard)
Same shared gate-count cap (10 per circuit, with an approval dialog above
that), speed guard (20%/35%/50%-slower staged warnings), and truth-table
input cap (10/14) as before. `countGates` is now **custom-gate-weight
aware**: a control with a `gateWeight` (set at placement — a custom gate's
weight is `ceil(gates used to build it / 2)`, computed once at creation and
carried on every instance) contributes that weight instead of a flat 1.

### 5. `selection.js` (Selection & Transformations)
- Click-select, rubber-band, multi-select group-drag, delete, cut/copy/
  paste, group — same shape as before, with two real fixes:
  - **Rubber-band visibility**: the box was being positioned using WORLD
    (model) coordinates as if they were screen pixels — correct for the
    final `paper.findViewsInArea()` hit-test, but at any non-default zoom
    or pan the VISUAL box rendered far off-screen, effectively invisible.
    Now tracks real screen coordinates separately (`position: fixed`,
    appended to `<body>`), independent of pan/zoom entirely.
  - **Group-drag world bounds**: dragging a multi-selection clamps dx/dy to
    the intersection of every selected control's own allowed range, so no
    member can be dragged outside `[0, WORLD_SIZE]`.
- **Flip** (see §2 for the full mechanism) is exported here as `flip(axis)`:
  toggles `flipH`/`flipV` on the cell (so it survives copy/paste — though
  paste itself does NOT carry flip state or notes, an explicit owner
  decision), calls `Shapes.applyFlipTransform`/`layoutPorts`/
  `stampPortSides`, counter-flips any label, and restores any
  classList-based dynamic state the flip transform would otherwise wipe.
- Multi-select arming now also sets/clears a `tool-multiselect` class on
  `#paper-host` (not `paper.el`, which is a different, inner wrapper div
  JointJS creates itself — confirmed directly after an earlier version
  targeted the wrong element and the cursor cue silently never appeared),
  giving it a persistent crosshair cursor (`style.css`) until the user
  presses Escape, right-clicks, or picks a different tool — all funneled
  through a shared `App.events` `'tool:cancel'` event that `popups.js`'s
  note tool and `toolbar.js`'s pan tool also listen for, so one Escape or
  right-click clears whichever overlay is actually active.

### 6. `logic.js` (Simulation & Gate Logic, Feedback/Latches, Clocks)

**Sources**: toggle switch (`.checked` class), push button (`.pushed` on
`.push-button-inner`), clock, constants — reading/toggling logic unchanged
from the pre-JointJS version, now via `element:pointerclick`/`pointerdown`
Paper events (covering touch for free, since this joint.js binds both
`mousedown` and `touchstart` to the same internal handler — verified
directly) instead of per-control DOM listeners, which also removes a
leaked per-control `mouseup` listener the old version had.

**Feedback / latches.** `evaluate()` no longer leaves a gate's output
`undefined` until something computes it — each gate's output is SEEDED from
its own **persisted** last value (`control.lastOutput`/`lastOutputs`): 0 the
very first time it exists, otherwise whatever it last settled to. This is
what lets a feedback loop (e.g. two cross-coupled NOR gates forming an SR
latch) settle at all — with no seed, two gates each reading the other's
`undefined` output can only ever produce `undefined`, forever — and
persisting rather than reseeding to 0 every call is what makes it an actual
latch: it holds its state across unrelated evaluations until a real input
change flips it. Verified end-to-end with a real SR latch built from two
NOR gates: SET, HOLD, RESET, HOLD all produced exactly the right output at
each step.

The shared logic lives in an exported `runFixedPoint(gates, evaluateGate,
values)` (also used by `tables.js`, §7): it iterates every gate to a fixed
point (cap: `FEEDBACK_PASS_CAP = 50` passes), and any node that never
settles within that cap is flagged `UNSTABLE` (a sentinel value, exported
as `Logic.UNSTABLE`) instead of 0/1/undefined — e.g. a NOT gate wired to
feed its own input, which has no stable state. `UNSTABLE` behaves as
"unknown" wherever it's read as an input (so it doesn't contaminate
unrelated parts of a circuit), but renders distinctly: a dashed,
error-colored wire (`.wire.signal-unstable`), and a `⚠` in a truth-table
cell.

**Per-clock speed.** Each clock now runs its OWN `setInterval` at its own
`control.halfPeriodMs`, instead of every clock sharing one timer at one
fixed rate. `CLOCK_SPEED_PRESETS` (0.25 Hz/0.5 Hz/0.625 Hz "Default"/1 Hz/
2 Hz) are offered in the note popup's clock-speed dropdown (§8);
`setClockSpeed(control, halfPeriodMs)` restarts that one clock's timer at
the new rate without touching any other clock or its current on/off phase.
The speed is persisted through Save/Load (§11) like everything else.

### 7. `tables.js` (Truth Table Generator)
- Every gate table (standalone or nested inside a circuit's master table)
  and every circuit's master-table sink column uses `Logic.runFixedPoint`
  too — same seed-and-settle-or-flag-`UNSTABLE` logic as `evaluate()` — with
  one deliberate difference: a pure truth table has no "last time", so it
  seeds every gate output fresh at 0 on EVERY row, never persisting between
  rows the way a live evaluation persists between calls. This is a
  documented limitation, not a bug: an SR latch's table can only show what
  it does from a cold start for each input combination, not which state it
  would actually be holding on the real canvas.
- **Truth-table titles**: if a gate (built-in or custom) has a note title
  set, its table caption — and its column label inside a larger circuit's
  master table — uses that title instead of the type name/definition name.
- Custom-gate instances get their own table (standalone or nested) exactly
  like a built-in gate, built from the definition's own precomputed rows
  rather than recomputed live.

### 8. `popups.js` (Dialog & Note Handlers)
- `#note-popup` opens via the pencil tool then a click, or double-click
  (except on a Push Button). The pencil tool now also disarms on a
  blank-canvas click, Escape, right-click, or picking a different tool —
  the last three via the shared `'tool:cancel'` event (§5) — and shows a
  persistent crosshair cursor (`.tool-note` on `#paper-host`) while armed.
- **Input-count stepper**: clamps to the gate's real minimum and writes the
  clamped RESULT back to the field — previously the field could show a
  value (e.g. an AND gate's minus button driving the displayed count to 1)
  that didn't match the gate's actual input count (silently re-clamped
  internally to 2), a real display/data mismatch. Typing a number directly
  into the field now also works (previously did nothing at all).
- **Clock speed**: a `<select>` (`#note-clock-speed`), shown only when the
  popup's target is a clock, populated from `Logic.CLOCK_SPEED_PRESETS`;
  changing it calls `Logic.setClockSpeed`.
- `updateNoteBadge(control)` (exported, see §2) is called after every write
  to a control's note — the live title/body edits, closing the popup, and
  `saveLoad.js`'s restore.
- `#clear-all-confirm`, `#limit-popup` (limits.js's prompt handler)
  unchanged. Sign In / `#login-popup` were removed entirely (Phase A).

### 9. `customGates.js` ("Create Gate")
Packages a selection of 3+ wired-together **built-in gates only** (no
sources/sinks, no nesting an existing custom gate) into one reusable,
labeled box:
- **Boundary ports**: an input becomes a port if it's unconnected or fed
  from outside the selection; an output becomes a port if it's unconnected
  or feeds anything outside the selection (even if it ALSO feeds something
  inside). Ordered top-to-bottom by the originating gate's canvas position,
  inputs and outputs independently.
- **Truth table**: computed once at creation by simulating the captured
  sub-circuit (the same `Logic.GATE_FUNCS`, not `Logic.runFixedPoint` —
  nesting is disallowed, so a captured sub-circuit can never itself contain
  a feedback loop through another custom gate) across every input
  combination, stored as a definition's `truthTable` (a plain `Map`, not a
  live function, since definitions persist to `localStorage`).
- **Duplicate detection**: same input/output counts AND an identical truth
  table blocks creation with a named message ("a gate with this exact
  behavior already exists").
- **Gate-limit weight**: `ceil(gates used / 2)`, stored on the definition
  and copied onto every placed instance as `control.gateWeight` (read by
  `limits.js`, §4).
- **Persistence**: definitions live in their OWN `localStorage` key,
  `logic-sim-custom-gates`, independent of §11's circuit Save/Load format;
  loaded once at startup (`main.js`) before anything might try to restore
  an instance of one.
- **Deletion**: removes the definition, its palette entry, its
  `localStorage` entry, AND every placed instance (with its wires) from the
  canvas.
- Registers itself with `canvas.js` (`setCustomDefinitionResolver`) and
  `logic.js` (`setCustomGateLookup`) via late-bound resolvers, rather than
  either of those files importing this one directly — this file already
  imports both of THEM (for `GATE_FUNCS`/`evaluate` and for
  `getGraphInstance`/`getPaperInstance`), so a two-way static import would
  be circular.

### 10. `toolbar.js` (Toolbar, Zoom, Tool Cursors, Theme)
- Zoom slider/buttons delegate to `canvas.js`'s `zoomTo()`-family functions.
- **Select/Pan tool cursor**: `setTool` toggles `tool-select`/`tool-pan`
  classes on `#paper-host` (not inline `style.cursor`, which an earlier
  version used — that only ever set the cursor on the host container
  itself, which every control's OWN `cursor` CSS rule then silently
  overrode the instant the mouse was actually over one, so the pan tool's
  "grab" cursor never appeared while hovering a gate). The CSS class
  approach, with `#paper-host.tool-pan *` in `style.css`, has enough
  specificity to win over any individual control's own cursor rule.
  Escape or a right-click anywhere reverts to select and emits
  `'tool:cancel'` (clearing the multiselect/note overlays too, §5/§8);
  picking select or pan explicitly does the same.
- **Dark mode**: toggles `.dark-mode` on `<body>`, persisted under the
  `localStorage` key `darkMode`.

### 11. `saveLoad.js` (Save/Load + Back/Forward)
Replaces the project's earlier, simpler save-only code. Per the owner's
design — NOT the original spec's tabs-based v2 format or a separate
`#btn-load` button, both superseded once tabs were dropped for Custom
Gates:

- **Save** (`#btn-save`) writes a full snapshot to `localStorage`
  (`logic-sim-save`) on click only — nothing autosaves. The snapshot
  captures every control's saved id (so wires resolve on restore),
  position, `flipH`/`flipV`, `groupId`, `note`, `inputCount`,
  `capApproved`/`tableCapApproved` (so restoring an already-over-the-cap
  circuit doesn't re-trigger that dialog), a toggle switch's checked state,
  and a clock's `halfPeriodMs`. Clock phase and a latch's held bit are
  deliberately NOT saved (an owner decision — a reload is a cold restart).
- **Automatic restore at startup** (`loadAtStartup`, called once by
  `main.js`, after `customGates.js`'s definitions are loaded): silently
  restores a saved circuit if one exists; starts empty if not; on corrupt
  data, shows a warning (`limits.js`'s dialog) and starts empty WITHOUT
  deleting the corrupt data.
- **Restoring wires directly**, not via the normal drag flow, surfaced a
  real Backbone-model quirk: a link constructed with `source`/`target`
  already set in its initial attributes never fires `change:target` — that
  event only fires for an actual change from one value to another
  afterward, which is how a user's drag produces it, but not how
  construction-time assignment works. `canvas.js`'s own
  `change:target`-driven registration (§3) therefore never runs for a
  restored wire; `saveLoad.js` calls `canvas.js`'s exported `registerWire`
  directly instead.
- **Back** (`#btn-undo`, the "<" button) reverts the canvas's STRUCTURE
  (controls, wires, positions, flips, custom-gate instances) to the last
  Save. Before doing so, it snapshots the CURRENT state in memory only
  (cleared on refresh) so Forward can return to it; if nothing has ever
  been saved, it shows an info message instead. Toggle-switch on/off state
  is explicitly EXCLUDED from a Back/Forward revert (an owner decision,
  even though a plain Save/Load DOES include it) — implemented by
  snapshotting live switch state by control id immediately before a
  Back-driven restore and reapplying it immediately after, for any switch
  id that still exists.
- **Forward** (`#btn-redo`, the ">" button) restores that in-memory
  snapshot (switches included this time — it's a full restore to an exact
  prior moment, not a structural-only revert). Any structural edit after a
  Back invalidates the snapshot and disables Forward until the next Back.
  This is a single-save-point revert, not a conventional multi-step undo
  stack.

### 12. `main.js` (Entry Point)
Import order: `canvas.js` first (everything else needs its exports),
`customGates.js` loads its palette/definitions before `saveLoad.js` tries
to restore anything that might reference one, then the first pass:
`Toolbar.initViewport()`, `Logic.evaluate()`, `Tables.rebuild()`.
