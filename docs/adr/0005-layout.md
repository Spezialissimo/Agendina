# 0005 — "Open planner" layout, layouts as data

Date: 2026-10-24 · Status: Accepted

## Context

Daily use: write today's page each morning, consult and tick the week page (which holds a wide
workout table), glance at yesterday occasionally. The first mockup (three day columns + narrow
week sidebar) wasted space on mostly empty neighbour days and squeezed the widest content.

## Decision

Default layout "Open planner": a week strip on top (‹ week › and Mo–Su with content dots; click
to open a day, hover to peek; a month popover), the week page on the left, the focused day on the
right, both editable, with a draggable splitter whose size is remembered.

Layouts are data: a JSON tree of row/column splits whose panels are relative to the focus
`(date, granularity)`, e.g. `note(day, 0)`, `note(week, containing)`. Non-focused neighbour panels
are read-only; clicking one moves the focus. Later: more presets (weekly spread, the original
mockup), a user layout editor, and a mobile journal-scroll view (week header ↔ day footer).

Week start and numbering are a user setting (default Monday, ISO weeks).

## Consequences

- The layout resolver is pure and lives in `core`.
- New layouts need no new rendering code, only new panel types when content types are added.
