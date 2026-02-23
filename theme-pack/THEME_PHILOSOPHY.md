# Command Center Theme Philosophy

## Design Intent
This UI is intentionally styled like a modern operations console: calm, tactical, and information-dense.  
The visual language should feel like a control surface, not a generic SaaS dashboard.

## Primary Inspirations
- Mission control / NOC interfaces
- Industrial instrument panels
- Frosted glass layered over metal enclosures
- Warning accent systems (single highlight color, high signal value)

## Visual DNA
- Palette direction: neutral graphite and steel grays, with one high-contrast yellow accent.
- Surfaces: stacked translucent panels, subtle gradient shifts, restrained texture.
- Geometry: clipped corners, angular panel cuts, technical framing lines.
- Typography: uppercase metadata, compact tracking, bold utility labels, monospace for metrics/IDs.
- Density: compact spacing and frequent small labels to reinforce a systems-interface tone.

## Color Philosophy
- Base surfaces stay desaturated and dark-to-mid neutral.
- Accent yellow is reserved for focus, active states, critical affordances, and progress emphasis.
- Success/warning/error colors are secondary status channels, never the primary brand language.

## Motion Philosophy
- Motion is short and functional, never decorative.
- Use hover and active transitions to indicate state and direction (slide, reveal, fill).
- Keep durations tight (`150ms` to `350ms`) and avoid large springy animations.
- Continuous animation is only used for ambient signals (subtle pulse/float/rotation).

## Layout Philosophy
- Two-zone shell:
1. Left command rail (navigation, mode switching)
2. Right mission workspace (task-specific panels)
- Workspaces should feel framed and contained, with clear panel boundaries.
- Primary actions should be immediately visible near context, not hidden in menus.

## Component Philosophy
- Buttons: pill controls for tactical actions, with clear light/muted/accent variants.
- Cards/panels: hard-edged modules with layered fills and border hierarchy.
- Data rows: compressed, scan-friendly, with monospace metadata where useful.
- Status indicators: explicit textual labels plus color signal (never color-only).

## Copy Tone
- Labels and metadata should be short, uppercase, and operational.
- Prefer words like `Status`, `Zone`, `Snapshot`, `Transfer`, `Engine`, `Standby`.
- Avoid playful marketing language inside core console views.

## Rules For Future Codex Agents
1. Keep the neutral + yellow scheme as the backbone; do not introduce a second dominant accent.
2. Preserve clipped-corner/hard-edge geometry across new major components.
3. Keep panel depth subtle (soft gradients + thin borders), not glossy or neon.
4. Use uppercase micro-labels and monospace for IDs/paths/timestamps/percentages.
5. Favor compact, high-information layouts over oversized whitespace.
6. Add motion only if it communicates state, hierarchy, or progress.
7. Match existing interaction semantics: hover brightens, active locks, disabled desaturates.
8. For new pages, reuse existing shell and token variables before inventing new visual primitives.

## Migration Guardrail
If a redesign request conflicts with this theme, preserve:
- token palette behavior (neutral base + yellow accent),
- panel geometry style,
- interaction language (hover/active/status clarity),
- and the overall control-room tone.
