# DESIGN — Atelier Product Demo (30s / 1920×1080)

## Style Prompt
Data Drift: deep black canvas, iridescent electric purple and cyan.
Thin weightless Inter + JetBrains Mono. Simplified UI surfaces coalesce
from particles and light traces. Smooth sine.inOut / power2.out motion.
Nothing snaps. Scenes cross-fade with a subtle radial-blur feel.

## Colors
- bg:        #0a0a0f   canvas
- panel:     #141421   surfaces
- panel-2:   #1b1b2b   sunken
- line:      #2a2a3c   hairlines
- line-2:    #3a3a54   stronger divider
- ink:       #f4f4fa   primary text
- ink-2:     #a9abc4   secondary text
- ink-3:     #6b6d88   tertiary / meta
- accent:    #8b5cf6   electric purple (primary)
- accent-2:  #06b6d4   cyan (data, links, highlights)
- accent-3:  #c4b5fd   soft violet (halos)
- ok:        #34d399   success dot

## Typography
- Headings: Inter 300–500, negative letter-spacing at ≥80px
- Body/UI : Inter 400–500
- Numbers : JetBrains Mono, tabular-nums
- 中文   : Noto Sans SC 300–500 (paired with Inter)

## Motion
- Entrances: `sine.inOut`, `power2.out`, 0.5–0.9s
- Staggers : 80–140ms peer-to-peer
- Scene cross-fade: 0.5s, sine.inOut (container-level opacity)
- Ambient : halo pulse, particle drift, hairline glow — slow, finite repeats
- NEVER: back.out / elastic / snappy steps

## Scenes (30s)
1. 0.0 – 4.5s  · Opening title (Atelier)
2. 4.5 – 10.0s · Chat 3-column
3. 10.0 – 15.5s · Kanban board
4. 15.5 – 21.0s · Agent topology (nodes + links)
5. 21.0 – 26.5s · Management cards
6. 26.5 – 30.0s · Closing logo + slogan

Captions (bottom band) cross-fade with each scene change.

## What NOT to Do
- No `#000` / `#fff` — tint toward accent hue
- No corporate blue (#3b82f6) — purples/cyans only
- No full-screen linear gradients (H.264 banding) — radial or solid+glow
- No emoji / decorative illustrations
- No hard cuts, no overshoot easing
- No infinite repeats (`repeat: -1`)
