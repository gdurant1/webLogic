# Logic Circuit Design System - Color Scheme

> Rewritten to match the current `style.css` / `index.html` exactly (these
> two files are the source of truth; this document follows them, not the
> other way around). Every token below is a real CSS custom property
> already defined in `style.css`'s `:root` block.

## Light mode (default)

| Token | Value | Used for |
|---|---|---|
| `--font-mono` | `'JetBrains Mono', 'Courier New', monospace` | All text |
| `--color-header-bg` | `#212529` | `#app-header` |
| `--color-header-text` | `#f8f9fa` | Header text |
| `--color-toolbar-bg` | `#343a40` | `#tabs`, `#toolbar`, `#status-bar` |
| `--color-toolbar-text` | `#f8f9fa` | Toolbar/status text |
| `--color-canvas-bg` | `#f4f5f7` | `#canvas` background + dot grid |
| `--color-grid-dot` | `rgba(33,37,41,0.14)` | Canvas grid dots |
| `--color-gate-bg` | `#ffffff` | Gate/control body fill |
| `--color-gate-border` | `#212529` | Gate/control outlines, node rings, default wire color |
| `--color-true` | `#ff6f00` (bright orange) | Signal = 1 / High |
| `--color-false` | `#5c6b73` (blue-gray, reasonable-guess exact shade) | Signal = 0 / Low |
| `--color-error` | `#ff1744` (bright neon red) | Fault/warning states |
| `--color-input` | `#008080` (teal, reasonable-guess exact shade) | Left accent border on `#input-controls .palette-item` only |
| `--color-output` | `#ffc107` (golden-yellow, reasonable-guess exact shade) | Left accent border on `#output-controls .palette-item`; also reused as `--color-focus` |
| `--color-panel-header-bg` | `#191970` (dark cobalt/purple) | `.panel h3` (Input/Output/Logic Gates/Truth Tables headers alike) |
| `--color-panel-header-text` | `#ffffff` | Panel header text |
| `--color-panel-bg` | `#d0e1fd` (pale cornflower blue) | `.panel-items`, `#truth-tables-list` backgrounds |
| `--color-node-unattached` | `#2e7d32` (green, reasonable-guess) | An input node that has never had a wire attached (idle state only — see note below) |
| `--color-selected` | `#2979ff` (blue, reasonable-guess) | Outline on a selected `.control` or `.wire` |
| `--color-wire` | `var(--color-gate-border)` | Default/no-signal wire color |
| `--color-signal-on` | `var(--color-true)` | Toggle/push-button/constant/clock "on" face |
| `--color-signal-off` | `#ffffff` | Same controls' "off" face |
| `--color-collapse-accent` / `-hover` | `#1a8f8f` / `#147373` | `#btn-collapse-left`/`#btn-collapse-right` |
| `--color-bg` / `--color-text` / `--color-border` | `#ffffff` / `#212529` / `#ccc` | Generic page neutrals |

**Note on input/output color-coding:** the spec line "Teal for inputs,
Golden-Yellow for outputs" is applied to the **palette items** in the
Input Controls / Output Controls sections (a colored top border), not to
the section headers — headers use the same cobalt/purple treatment as
every other panel per the adjoining spec sentence. Nodes on the canvas
(the small circles) stay plain white/dark-outline at rest; the only node
recoloring is `.node-in.unattached` (green), and only for a node that has
**never** had a wire attached — a node being targeted mid-drag by an
in-progress wire does **not** change color.

## Dark mode — "Tokyo Night"

Inspired by the lights of downtown Tokyo after dark: deep dark-blue
tones with vibrant neon accents (the same palette widely packaged as a
"Tokyo Night" theme for Windows, code editors, and browsers). Applied by
JS adding a `dark-mode` class to `<body>` (via `#dark-mode-toggle`).
Because every rule in `style.css` already reads from the tokens above,
overriding them under `body.dark-mode` re-themes the entire app — no
other CSS had to change.

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
| `--color-collapse-accent` / `-hover` | `#7dcfff` / `#5ab8e6` |
| `--color-signal-off` | `#24283b` (dark surface, so "off" doesn't glow) |
| `--color-node-unattached` | `#9ece6a` |
| `--color-selected` | `#c0caf5` |

**Known limitation:** `--color-gate-bg` is intentionally left un-overridden
(stays white), because the gate/palette-item icons are literal-hex inline
SVG data URIs (`fill='#fff' stroke='#212529'`) baked in at authoring time
— they can't read CSS variables, so they can't re-theme automatically.
Leaving the icons white keeps them legible as a deliberate "white chip on
a dark canvas" look; a true dark-mode icon set would need a second,
hand-authored batch of SVGs (not done in this pass).

## Wire colors

Wires aren't static markup — JS draws `<path class="wire">` into the
`#wire-layer` SVG. `.wire` defaults to `--color-wire`; JS toggles
`.signal-high` (`--color-true`) / `.signal-low` (`--color-false`) as the
value it carries changes, `.pending` (dashed, `--color-gate-border`)
while being dragged and not yet attached, and `.selected`
(`--color-selected`) when clicked.
