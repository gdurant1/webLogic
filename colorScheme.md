# Logic Circuit Design System - Color Scheme

> Matches the current `style.css` / `index.html` / `shapes.js` (these files
> are the source of truth; this document follows them). Every token below is
> a real CSS custom property defined in `style.css`'s `:root` block.
>
> **Rendering change (JointJS rewrite):** gates/controls/wires on the canvas
> are now JointJS SVG shapes (see `shapes.js`), not HTML boxes — so their
> color rules use SVG presentation properties (`fill`/`stroke`) instead of
> `background`/`border`, but they read the exact same custom properties as
> before. The **palette items** in the left panel are unchanged plain HTML
> with baked-hex `background-image` icons (see the dark-mode note below) —
> only the versions dropped onto the canvas changed.

## Light mode (default)

| Token | Value | Used for |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', 'Courier New', monospace` | All text |
| `--color-header-bg` | `#212529` | `#app-header` |
| `--color-header-text` | `#f8f9fa` | Header text |
| `--color-toolbar-bg` | `#343a40` | `#tabs`, `#toolbar`, `#status-bar` |
| `--color-toolbar-text` | `#f8f9fa` | Toolbar/status text |
| `--color-canvas-bg` | `#f4f5f7` | `#paper-host` (the JointJS Paper's container) background |
| `--color-grid-dot` | `rgba(33,37,41,0.14)` | Dot grid, a CSS background on `#paper-host` itself (not JointJS's own grid renderer), so it's always directly behind the paper regardless of pan/zoom |
| `--color-gate-bg` | `#ffffff` | Gate/control body `fill` |
| `--color-gate-border` | `#212529` | Gate/control `stroke`, node ring `stroke`, wire-outline `stroke`, default wire `stroke` |
| `--color-true` | `#ff6f00` (bright orange) | Signal = 1 / High |
| `--color-false` | `#5c6b73` (blue-gray, reasonable-guess shade) | Dark-mode toggle "off" track |
| `--color-error` | `#ff1744` (bright neon red) | DIRE warning dialog |
| `--color-input` | `#008080` (teal, reasonable-guess shade) | Top accent border on `#input-controls .palette-item`; notice-level dialog accent |
| `--color-output` | `#ffc107` (golden-yellow, reasonable-guess shade) | Top accent border on `#output-controls .palette-item`; also reused as `--color-focus` |
| `--color-panel-header-bg` | `#191970` (dark cobalt/purple) | `.panel h3`, popup title bars |
| `--color-panel-header-text` | `#ffffff` | Panel header text |
| `--color-panel-bg` | `#d0e1fd` (pale cornflower blue) | `.panel-items`, `#truth-tables-list` backgrounds |
| `--color-node-unattached` | `#2e7d32` (green) | Reserved for a live "you can drop here" cue on an unoccupied input node — not currently applied (see the node-states note below) |
| `--color-selected` | `#2979ff` (blue) | `stroke` on a selected control's body / a selected wire; rubber-band box |
| `--color-wire` | `var(--color-gate-border)` | Default wire `stroke` |
| `--color-wire-clock` | `#9e9e9e` | A wire carrying a Clock's output (`.signal-clock`) |
| `--color-signal-on` | `var(--color-true)` | Toggle/push-button/constant/clock/bulb "on" fill |
| `--color-signal-off` | `#ffffff` | Same controls' "off" fill; low (0) wires |
| `--color-stepper` / `--color-stepper-hover` | `#1a8f8f` / `#147373` | The input-count `+` / `-` stepper buttons (plain HTML, embedded in `#note-popup`) |
| `--color-bg` / `--color-text` / `--color-border` | `#ffffff` / `#212529` / `#ccc` | Generic page neutrals |

**Node color states — changed in the JointJS rewrite.** Nodes (ports) stay
plain white/dark-outline (`--color-gate-bg`/`--color-gate-border`) at rest.
The old `.drop-target` (green, while dragging a wire toward an open input)
and `.reject-flash` (red, on a rejected drop) cues are **not currently
wired up**: JointJS's own `validateConnection` now refuses an invalid
connection outright while dragging, rather than allowing the drop and then
flashing a rejection after the fact, so there is no longer a moment where
those classes would apply. The CSS rules for both (`.node-in.drop-target`,
`.node.reject-flash`) are left in `style.css` in case live drag-highlighting
is added back later, but nothing currently applies them.

**Note on input/output color-coding:** "Teal for inputs, Golden-Yellow for
outputs" is applied to the **palette items** (a colored top border, plain
HTML/CSS, unchanged by the rewrite), not to the section headers, which share
the cobalt/purple treatment.

## Wire colors

Each wire is a JointJS `Wire` link (see `shapes.js`) whose markup is two
stacked `<path>`s: a thicker `.wire-outline` (`--color-gate-border`)
underneath and the colored `.wire` on top, so a white (low) wire stays
visible against the canvas — same visual as before, just rendered by
JointJS's link view instead of hand-drawn SVG.

| State | Color |
|---|---|
| high (1) | `--color-true` (orange) |
| low (0) | `--color-signal-off` (white) |
| floating (Tri-State disabled) / no signal | no signal class: `--color-wire` |
| driven by a Clock | `--color-wire-clock` (gray) |
| selected | `--color-selected`, thicker |

The old dashed `.wire.pending` preview (while a wire was still being
dragged) isn't implemented for the JointJS version — the in-progress link
JointJS draws during a drag renders with the `Wire` type's normal colors
from the start, rather than a separate dashed style. Worth adding back if
the plain look during a drag reads as confusing in testing.

## Dark mode — "Tokyo Night"

Inspired by the lights of downtown Tokyo after dark: deep dark-blue tones
with vibrant neon accents. Applied by JS adding a `dark-mode` class to
`<body>` (via `#dark-mode-toggle`, remembered in `localStorage`; this logic
now lives in `toolbar.js`, folded in from the old separate `theme.js`).
Because every rule in `style.css` reads from the tokens above, overriding
them under `body.dark-mode` re-themes the entire app.

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

**Improved by the JointJS rewrite:** gate bodies on the canvas are now real
`<path>` elements styled with `fill: var(--color-gate-bg)` / `stroke:
var(--color-gate-border)`, so they now correctly re-theme in dark mode.

**Known limitation, unchanged:** the **left-panel palette items'**
`--icon` thumbnails are still literal-hex inline SVG `background-image` data
URIs (white fill / dark stroke, baked in at authoring time) — CSS custom
properties can't reach inside a data URI, so those specific icons stay
white-on-dark-outline in dark mode too, by design (a "chip on a dark canvas"
look). A true dark icon set for the palette would need a second,
hand-authored batch of those same SVGs.

## Limit / warning dialog (`#limit-popup`)

One dialog serves the circuit gate limit, the speed warnings and the
oversized-truth-table prompt. JS sets a severity class on it:

| Class | Left border | Meaning |
|---|---|---|
| `limit-notice` | `--color-input` | Simulator ~20% slower |
| `limit-warning` | `--color-true` | Gate limit, ~35% slower, big table |
| `limit-dire` | `--color-error` (title, border, glow and confirm button too) | ~50% slower or worse |
