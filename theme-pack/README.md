# Command Center Theme Pack

Portable CSS theme extracted from this project for reuse in other apps.

## Files
- `theme-pack/THEME_PHILOSOPHY.md`: canonical visual direction and agent guardrails.
- `theme-pack/css/00-tokens.css`: tokens, reset, ambient background, shared button styles.
- `theme-pack/css/10-shell.css`: app shell, sidebar tabs, content pane.
- `theme-pack/css/20-gates.css`: gate portal styles.
- `theme-pack/css/30-engine.css`: engine dashboard styles.
- `theme-pack/css/40-dropzones.css`: dropzones + drawer/viewer/transfer styles.
- `theme-pack/css/50-home-legacy.css`: legacy home/hero/cards/stats styles.
- `theme-pack/css/command-center-theme.css`: import entrypoint for all modules.

## Quick Use
1. Include the stylesheet:
```html
<link rel="stylesheet" href="/theme-pack/css/command-center-theme.css" />
```
2. Load the Inter font (or replace in `00-tokens.css`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;900&display=swap" rel="stylesheet" />
```
3. Keep class names consistent with the existing markup (`tab-sidebar`, `engine-panel`, `zone-tile`, etc.).

## Notes
- This pack intentionally keeps the current class names so migration can be mostly copy/paste.
- Utility classes used by the shell markup (`flex`, `flex-1`, `min-h-screen`, `w-screen`) are included in `00-tokens.css`.
- If you only need specific views, import only the matching module files.
