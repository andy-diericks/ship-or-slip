# ADR 0002 — Design system (FROZEN)

Status: accepted · Date: 2026-08-06

All tokens live in `src/index.css`. Nothing outside that file defines a colour,
a radius or a font.

## Tokens

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0B1120` | `#F6F8FC` |
| `--surface` | `#131C31` | `#FFFFFF` |
| `--surface-2` | `#1A2740` | `#EEF2F9` |
| `--border` | `#22304D` | `#DCE3EE` |
| `--text` | `#E6EDF7` | `#0F1B2E` |
| `--muted` | `#93A4BE` | `#5A6B85` |
| `--accent` | `#38BDF8` | `#0C7FB8` |

Event tones — the one place meaning is attached to colour:

| Tone | Meaning | Dark | Light |
|---|---|---|---|
| `--slip` | a date moved later | `#F87171` | `#DC2626` |
| `--pull` | a date moved earlier | `#34D399` | `#059669` |
| `--ship` | it actually shipped | `#34D399` | `#047857` |
| `--drop` | dropped or cancelled | `#94A3B8` | `#64748B` |
| `--add` | newly announced | `#FBBF24` | `#B45309` |
| `--retire` | a retirement | `#C084FC` | `#7C3AED` |

Radius: 8px cards, 6px controls. Spacing: 4, 8, 12, 16, 24, 32, 48px only.
Fonts: system UI stack for text, system mono for dates and magnitudes.

## Principles

- **Both themes are first-class.** The OS preference decides by default and the
  header toggle overrides it via `[data-theme]` on `:root`, persisted in
  `localStorage` and applied before first paint by an inline script in
  `index.html` so a light-theme reader never sees a dark flash. Retrofitting a
  second theme is miserable; carrying both from the start is nearly free.
- **Colour never carries meaning alone.** Every badge states its verdict in
  words. A colour-blind reader and a greyscale screenshot lose nothing.
- **Dense but calm.** This is a data product. The feed is the hero; nothing
  animates for longer than 150ms and nothing pulses for decoration.
- **Mobile is not an afterthought.** Layouts adapt below 640px, touch targets
  are at least 44px on interactive controls, and no information is
  hover-only — tooltips do not exist on touch, so `title` may only ever add
  detail, never carry it.

## Consequences

New colours, fonts, sizes or spacing values require updating this ADR first.
