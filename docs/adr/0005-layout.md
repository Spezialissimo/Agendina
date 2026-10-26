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

Layouts are data: a JSON tree of row/column splits whose panels are relative to the focused
day, e.g. `note(day, 0)` (the focused day), `note(day, -1)` (the day before), `note(week, 0)` (the
week containing the focused day), `note(week, 1)` (the next week). Offset 0 is editable; other
panels are read-only and clicking one moves the focus there. Split sizes are fractions, at least
`MIN_PANE_SIZE` each, addressed by split id when the user drags a splitter. The week strip is
fixed chrome above the tree, not a panel. Implemented in `packages/core/src/layout.ts`.

Refinement (Phase 1): the focus is just a day. The day/week "granularity swap" of the first
mockup is not needed for the Open planner; it can return as a preset later. Later: more presets (weekly spread, the original
mockup), a user layout editor, and a mobile journal-scroll view (week header ↔ day footer).

Week start and numbering are a user setting (default Monday, ISO weeks), modelled as a
`WeekRule { firstDay, minimalDays }` (the CLDR / java.time model; ISO = Monday/4, US = Sunday/1).

A week note is identified by the **first day of the week** (`2026-10-19`), not by its number
(`2026-W43`): the number depends on the user's rule, so a number-based key would point to
different days after a settings change. The week number is a display label only.

## Consequences

- The layout resolver is pure and lives in `core`.
- New layouts need no new rendering code, only new panel types when content types are added.
