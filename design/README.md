# Design — the Things look

Since 2026-09-24 the site (`site/`) and, phase by phase, the POS (`pos/`) are drawn in the visual language of
[Things](https://culturedcode.com/things/) by Cultured Code: their whites and greys, their font, icons in their
style. The accents stay ours. The plan and the board of approved variants are
<https://claude.ai/artifact/G8qUredUyMf9dyu1roEMyA>.

## Colours

| | Hex | Where from |
|---|---|---|
| Page | `#F2F5F7` | Things' site background |
| Sidebar / quiet panel | `#F4F5F7` | Things' app sidebar |
| Surface (cards, content) | `#FFFFFF` | |
| Selected row | `#DFE2E7` | Things' app selection |
| Line | `#DFE3E8` | |
| Text / heading / lead / secondary / tertiary | `#303336` / `#2C3138` / `#44474B` / `#55606E` / `#8E9196` | |
| Card shadow | `0 2px 8px rgba(0,0,0,.1), 0 0 2px rgba(0,0,0,.1)` | |
| Card radius | 18 px | |
| **Ours, unchanged** | POS `#006AFF`/`#0058D6`, LIVE `#FF3D7A`/`#D8215F`, vertical tints, the 8 tag colours, black-only print | |

## Font

SF on Mac, iPhone and iPad (it is what Things is set in); Inter everywhere else, self-hosted from
`@fontsource-variable/inter` (the `opsz` build, so big headings get Inter's display cut the way SF switches to SF
Display). It is **not** one font stack: Chrome resolves `BlinkMacSystemFont` as `system-ui`, which on Windows is
Segoe UI, so a stack that leads with the system font never reaches Inter there. Instead Inter is the default and an
inline script adds `html.apple` on Apple platforms, where `index.css` switches to the system font — and Inter is then
never downloaded. Prices use `tabular-nums` of the same font; there is no separate mono face.

## Glyphs — `design/icons/`

Hand-drawn in Things' style, not copied from it: one hue per icon, a heavy rounded 2 px line, a light fill of the same
hue inside.

- `color/` — 24 px grid, own colours (`data-hue` names the hue). Navigation, section marks, feature cards.
- `ui/` — 20 px grid, `currentColor`. Buttons and actions.
- Names follow lucide's (`Package`, `ShieldCheck`, …) because the POS stores nav icons by name in
  `pos_stores.nav_overrides` and `module_remotes`.

`node scripts/gen-icons.mjs` writes the React components (`site/src/components/glyphs.tsx`; the POS target comes with
its phase). `--check` (CI) fails on a `<rect>` off whole pixels, a path or circle off the quarter-pixel grid, a
fractional stroke width, or a stale generated file. Render a glyph at its grid size or twice it.

## App icon — `design/app-icon/app-icon.svg`

Concept A «Чек»: a white receipt on the POS-blue squircle. `cd site && node scripts/gen-app-icon.mjs` renders the
favicon set into `public/`; `site/src/components/AppIcon.tsx` draws the same shapes inline.
