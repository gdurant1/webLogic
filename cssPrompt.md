# Logic Circuit Design System - Color Scheme

> Matches the current `style.css` / `index.html` / `shapes.js` (these files
> are the source of truth; this document follows them). Every token below is
> a real CSS custom property defined in `style.css`'s `:root` block.
>
> Gates/controls/wires on the canvas are JointJS SVG shapes (`shapes.js`),
> not HTML boxes — so their color rules use SVG presentation properties
> (`fill`/`stroke`) instead of `background`/`border`, but they read the
> exact same custom properties as before. Every gate, source, and the light
> bulb now render 50% larger (`shapes.js`'s `SIZE_SCALE`) — a pure CSS
> transform scale, so none of the colors or tokens below changed, only the
> rendered size. The **palette items** in the left panel are unchanged
> plain HTML with baked-hex `background-image` icons (see the dark-mode
> note below) — only the versions dropped onto the canvas changed.
>
> There is no `#tabs` bar any more — the project title area is a plain,
> non-interactive static bar (`#project-title`), styled with the same
> `--color-toolbar-bg`/`--color-toolbar-text` tokens the toolbar itself
> uses. Sign In / `#login-popup` were removed entirely.

## Light mode (default)

| Token | Value | Used for |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', 'Courier New', monospace` | All text |
| `--color-header-bg` | `#212529` | `#app-header` |
| `--color-header-text` | `#f8f9fa` | Header text |
| `--color-toolbar-bg` | `#343a40` | `#project-title`, `#toolbar`, `#status-bar` |
| `--color-toolbar-text` | `#f8f9fa` | Toolbar/status/title-bar text |
| `--color-canvas-bg` | `#f4f5f7` | `#paper-host` (the JointJS Paper's container) background |
| `--color-grid-dot` | `rgba(33,37,41,0.14)` | Dot grid, a CSS background on `#paper-host` itself (not JointJS's own grid renderer), so it's always directly behind the paper regardless of pan/zoom |
| `--color-gate-bg` | `#ffffff` | Gate/control body `fill`, including a custom gate's box |
| `--color-gate-border` | `#212529` | Gate/control `stroke`, node ring `stroke`, wire-outline `stroke`, default wire `stroke`, a custom gate's box `stroke` and label `fill` |
| `--color-true` | `#ff6f00` (bright orange) | Signal = 1 / High |
| `--color-false` | `#5c6b73` (blue-gray, reasonable-guess shade) | Dark-mode toggle "off" track |
| `--color-error` | `#ff1744` (bright neon red) | DIRE warning dialog; an unstable (non-settling feedback) wire |
| `--color-input` | `#008080` (teal, reasonable-guess shade) | Top accent border on `#input-controls .palette-item`; notice-level dialog accent |
| `--color-output` | `#ffc107` (golden-yellow, reasonable-guess shade) | Top accent border on `#output-controls .palette-item`; also reused as `--color-focus` |
| `--color-panel-header-bg` | `#191970` (dark cobalt/purple) | `.panel h3`, popup title bars, a control's note badge |
| `--color-panel-header-text` | `#ffffff` | Panel header text |
| `--color-panel-bg` | `#d0e1fd` (pale cornflower blue) | `.panel-items`, `#truth-tables-list` backgrounds |
| `--color-node-unattached` | `#2e7d32` (green) | Reserved for a live "you can drop here" cue on an unoccupied input node — not currently applied (see the node-states note below) |
| `--color-selected` | `#2979ff` (blue) | `stroke` on a selected control's body / a selected wire; rubber-band box; a custom-gate palette item's accent border; the "view configuration" (ⓘ) button's hover |
| `--color-wire` | `var(--color-gate-border)` | Default wire `stroke` |
| `--color-wire-clock` | `#9e9e9e` | A wire carrying a Clock's output (`.signal-clock`) |
| `--color-signal-on` | `var(--color-true)` | Toggle/push-button/constant/clock/bulb "on" fill |
| `--color-signal-off` | `#ffffff` | Same controls' "off" fill; low (0) wires |
| `--color-stepper` / `--color-stepper-hover` | `#1a8f8f` / `#147373` | The input-count `+` / `-` stepper buttons (plain HTML, embedded in `#note-popup`) |
| `--color-bg` / `--color-text` / `--color-border` | `#ffffff` / `#212529` / `#ccc` | Generic page neutrals; a note badge's own `stroke` is `--color-bg`, so it reads as a clean dot against the control |

**Node color states.** Nodes (ports) stay plain white/dark-outline
(`--color-gate-bg`/`--color-gate-border`) at rest. The `.drop-target`
(green, while dragging a wire toward an open input) and `.reject-flash`
(red, on a rejected drop) cues are **not currently wired up**: JointJS's own
`validateConnection` refuses an invalid connection outright while dragging,
rather than allowing the drop and then flashing a rejection after the fact,
so there is no longer a moment where those classes would apply. The CSS
rules for both are left in `style.css` in case live drag-highlighting is
added back later, but nothing currently applies them.

**Note on input/output color-coding:** "Teal for inputs, Golden-Yellow for
outputs" is applied to the **palette items** (a colored top border), not to
the section headers, which share the cobalt/purple treatment. Custom gates'
palette items get their own accent border instead (`--color-selected`,
blue), to read as visually distinct from both built-in categories.

## Wire colors

Each wire is a JointJS `Wire` link (`shapes.js`) with THREE stacked paths,
not two: `.wire-outline` (thick, `--color-gate-border`, behind), `.wire`
(the colored, thin VISIBLE line on top of it), and `.wire-hit-area`
(invisible, 14px wide — a wider click target than the visible line itself;
a correction request, since the original 2px line was hard to click).
`.wire`'s own `pointer-events` are off; `.wire-hit-area` carries the real
click handling now.

| State | Color |
|---|---|
| high (1) | `--color-true` (orange) |
| low (0) | `--color-signal-off` (white) |
| floating (Tri-State disabled) / no signal | no signal class: `--color-wire` |
| driven by a Clock | `--color-wire-clock` (gray) |
| **unstable** (a feedback loop that never settled — e.g. a NOT gate wired to its own input) | `--color-error`, dashed (`.wire.signal-unstable`) |
| selected | `--color-selected`, thicker |

The old dashed `.wire.pending` preview (while a wire was still being
dragged) isn't implemented — the in-progress link JointJS draws during a
drag renders with the `Wire` type's normal colors from the start. Its
pointer-events are disabled for the duration of the drag instead (a
`.wire-hit-area.connecting` class, toggled declaratively), which matters
for a short connection — notably a self-loop, now allowed — whose own
endpoint can otherwise sit exactly on the port being dropped onto.

## Note badges

A small filled dot, top-right corner of any control, shown whenever it has
a note with a title or body (`.note-badge`, `--color-panel-header-bg` fill,
`--color-bg` stroke). The simplest marker that actually solves "which
objects have notes attached" — a correction request. Hidden by default;
toggled via `popups.js`'s `updateNoteBadge`, kept correct across edits and
Save/Load restore.

## Tool cursors

A correction request: the active tool now shows a persistent, canvas-wide
cursor cue, via a class on `#paper-host` (`tool-select` is the baseline —
no special rule needed beyond the per-control defaults below; `tool-pan` →
`grab`; `tool-multiselect`/`tool-note` → `crosshair`), with enough CSS
specificity (`#paper-host.tool-pan *`, etc.) to override any individual
control's own cursor rule, including a switch/button's pointer-hand. Stays
active until Escape, right-click, or a different tool is picked.

Outside of an active pan/multiselect/note tool, a control itself shows a
plain `default` arrow (previously a four-way "move" cross-arrows cursor,
changed by a correction request — the move cursor read as visually noisy,
and controls are still draggable regardless of which cursor they show).
Toggle switches and push buttons keep their own `pointer` (hand) cursor as
a *different*, legitimate signal — "clicking this does something" — not a
drag affordance.

## Dark mode — "Tokyo Night"

Inspired by the lights of downtown Tokyo after dark: deep dark-blue tones
with vibrant neon accents. Applied by JS adding a `dark-mode` class to
`<body>` (via `#dark-mode-toggle`, remembered in `localStorage`;
`toolbar.js`). Because every rule in `style.css` reads from the tokens
above, overriding them under `body.dark-mode` re-themes the entire app,
including the note badge, tool cursors (cursor keywords aren't colors, so
nothing to re-theme there), and the custom-gate box.

| Token | Dark value |
|---|---|
| `--color-header-bg` | `#16161e` |
| `--color-header-text` | `#c0caf5` |
| `--color-toolbar-bg` | `#1a1b26` |
| `--color-toolbar-text` | `#c0caf5` |
| `--color-canvas-bg` | `#1f2335` |
| `--color-grid-dot` | `rgba(122,162,247,0.18)` |
| `--color-gate-border` | `#7aa2f7` (neon blue) |
| `--color-true` | `#ff9e64` |
| `--color-false` | `#414868` |
| `--color-error` | `#f7768e` |
| `--color-input` | `#7dcfff` |
| `--color-output` | `#e0af68` |
| `--color-panel-header-bg` | `#2b2440` |
| `--color-panel-header-text` | `#bb9af7` |
| `--color-panel-bg` | `#1f2335` |
| `--color-bg` | `#1a1b26` |
| `--color-text` | `#c0caf5` |
| `--color-border` | `#414868` |
| `--color-stepper` / `--color-stepper-hover` | `#7dcfff` / `#5ab8e6` |
| `--color-signal-off` | `#24283b` (dark surface, so "off" doesn't glow) |
| `--color-node-unattached` | `#9ece6a` |
| `--color-selected` | `#c0caf5` |
| `--color-wire-clock` | `#565f89` |

**Known limitation, unchanged:** the **left-panel palette items'**
`--icon` thumbnails are still literal-hex inline SVG `background-image` data
URIs (white fill / dark stroke, baked in at authoring time) — CSS custom
properties can't reach inside a data URI, so those specific icons stay
white-on-dark-outline in dark mode too, by design (a "chip on a dark canvas"
look). A true dark icon set for the palette would need a second,
hand-authored batch of those same SVGs. Custom-gate palette items are plain
HTML/CSS (no baked icon), so they re-theme normally.

## Limit / warning dialog (`#limit-popup`)

One dialog serves the circuit gate limit, the speed warnings, the
oversized-truth-table prompt, Save/Load's corrupt-data warning, and Back's
"nothing to go back to yet" message. JS sets a severity class on it:

| Class | Left border | Meaning |
|---|---|---|
| `limit-notice` | `--color-input` | Simulator ~20% slower; Back with nothing saved yet |
| `limit-warning` | `--color-true` | Gate limit, ~35% slower, big table; a corrupt saved circuit |
| `limit-dire` | `--color-error` (title, border, glow and confirm button too) | ~50% slower or worse |

## Create Gate's own popups

`customGates.js` wires up five of its own small dialogs (name prompt,
remove-originals confirm, a plain info/alert message, a read-only
"view configuration" display, and a delete confirm) — all share the same
generic fixed/centered/backdrop treatment as every other popup in this app
(`#note-popup`, `#limit-popup`, etc.), with plain neutral button styling
(`--color-bg`/`--color-border`), not a distinct color family of their own.
