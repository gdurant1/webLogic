# Logic Circuit Design System - Color Scheme

> Matches the current `style.css` / `index.html` (those two files are the
> source of truth; this document follows them). Every token below is a real
> CSS custom property defined in `style.css`'s `:root` block. The dating-sim
> page has its own separate palette — see the last section.

## Light mode (default)

| Token | Value | Used for |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', 'Courier New', monospace` | All text |
| `--color-header-bg` | `#212529` | `#app-header` |
| `--color-header-text` | `#f8f9fa` | Header text |
| `--color-toolbar-bg` | `#343a40` | `#tabs`, `#toolbar`, `#status-bar` |
| `--color-toolbar-text` | `#f8f9fa` | Toolbar/status text |
| `--color-canvas-bg` | `#f4f5f7` | `#canvas` (the scrolling viewport) background |
| `--color-grid-dot` | `rgba(33,37,41,0.14)` | Dot grid, drawn on `#canvas-world` so it pans and zooms with the content |
| `--color-gate-bg` | `#ffffff` | Gate/control body fill |
| `--color-gate-border` | `#212529` | Gate/control outlines, node rings, wire outline, default wire color |
| `--color-true` | `#ff6f00` (bright orange) | Signal = 1 / High |
| `--color-false` | `#5c6b73` (blue-gray, reasonable-guess shade) | Dark-mode toggle "off" track |
| `--color-error` | `#ff1744` (bright neon red) | Rejected drop flash, DIRE warning dialog |
| `--color-input` | `#008080` (teal, reasonable-guess shade) | Top accent border on `#input-controls .palette-item`; notice-level dialog accent |
| `--color-output` | `#ffc107` (golden-yellow, reasonable-guess shade) | Top accent border on `#output-controls .palette-item`; also reused as `--color-focus` |
| `--color-panel-header-bg` | `#191970` (dark cobalt/purple) | `.panel h3`, popup title bars |
| `--color-panel-header-text` | `#ffffff` | Panel header text |
| `--color-panel-bg` | `#d0e1fd` (pale cornflower blue) | `.panel-items`, `#truth-tables-list` backgrounds |
| `--color-node-unattached` | `#2e7d32` (green) | `.node-in.drop-target` only: the live "you can drop here" cue while a wire is being dragged |
| `--color-selected` | `#2979ff` (blue) | Outline on a selected `.control` or `.wire`; rubber-band box |
| `--color-wire` | `var(--color-gate-border)` | Default wire color |
| `--color-wire-clock` | `#9e9e9e` | A wire carrying a Clock's output (`.signal-clock`) |
| `--color-signal-on` | `var(--color-true)` | Toggle/push-button/constant/clock/bulb "on" face |
| `--color-signal-off` | `#ffffff` | Same controls' "off" face; low (0) wires |
| `--color-stepper` / `--color-stepper-hover` | `#1a8f8f` / `#147373` | The input-count `+` / `-` stepper buttons |
| `--color-bg` / `--color-text` / `--color-border` | `#ffffff` / `#212529` / `#ccc` | Generic page neutrals |
| `--node-stub` | `8px` | Length of the connector line between a node and its body (not a color) |

`--color-collapse-accent` / `-hover` were removed together with the side-panel
collapse buttons. The stepper buttons had been sharing those values, so they
were renamed `--color-stepper` / `--color-stepper-hover` (same colors).

**Note on input/output color-coding:** "Teal for inputs, Golden-Yellow for
outputs" is applied to the **palette items** (a colored top border), not to
the section headers, which share the cobalt/purple treatment. Nodes on the
canvas stay plain white/dark-outline at rest. Only two things recolor a node:
`.drop-target` (green, while a wire is being dragged, and only for input
nodes that have no wire yet) and `.reject-flash` (red, for 0.3 s after a
rejected drop).

## Wire colors

Each wire is two stacked `<path>`s in `#wire-layer`: a thicker
`.wire-outline` (`--color-gate-border`) underneath and the colored `.wire` on
top, so a white (low) wire stays visible against the canvas.

| State | Color |
|---|---|
| high (1) | `--color-true` (orange) |
| low (0) | `--color-signal-off` (white) |
| floating (Tri-State disabled) / no signal | no signal class: `--color-wire` |
| driven by a Clock | `--color-wire-clock` (gray) |
| selected | `--color-selected`, thicker |
| being dragged (`.pending`) | dashed `--color-gate-border` |

## Dark mode — "Tokyo Night"

Inspired by the lights of downtown Tokyo after dark: deep dark-blue tones
with vibrant neon accents. Applied by JS adding a `dark-mode` class to
`<body>` (via `#dark-mode-toggle`, remembered in `localStorage`). Because
every rule in `style.css` reads from the tokens above, overriding them under
`body.dark-mode` re-themes the entire app.

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

**Known limitation:** `--color-gate-bg` is intentionally left un-overridden
(stays white) because the gate/palette icons are literal-hex inline SVG data
URIs that can't read CSS variables. They stay white on the dark canvas by
design; a true dark icon set would need a second batch of hand-authored SVGs.

## Limit / warning dialog (`#limit-popup`)

One dialog serves the circuit gate limit, the speed warnings and the
oversized-truth-table prompt. JS sets a severity class on it:

| Class | Left border | Meaning |
|---|---|---|
| `limit-notice` | `--color-input` | Simulator ~20% slower |
| `limit-warning` | `--color-true` | Gate limit, ~35% slower, big table |
| `limit-dire` | `--color-error` (title, border, glow and confirm button too) | ~50% slower or worse |

## Dating-sim page

`datingSimStyle.css` has its **own placeholder palette** (`--ds-*` tokens) and
does not use `style.css`. Its values are placeholders until the game's art
direction is decided.
