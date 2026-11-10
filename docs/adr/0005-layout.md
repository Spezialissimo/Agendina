# 0005 — "Open planner" layout, layouts as data

Date: 2026-10-24 · Status: Accepted

## Context

Daily use: write today's page each morning, consult and tick the week page (which holds a wide
workout table), glance at yesterday occasionally. The [first mockup](../first-mockup.png) (three
day columns + narrow week sidebar) wasted space on mostly empty neighbour days and squeezed the
widest content.

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

Refinement (Phase 6): after a change of week start, week pages written before it begin on another
day of their week. A week shows the page keyed by its first day or, if there is none, the earliest
page keyed by another of its days; edits keep going to that page. Nothing is re-keyed, so changing
the setting back and forth never moves or merges pages.

Refinement (layout editor, 2026-11): users edit the tree themselves. The editor opens from
Settings (or the palette) and takes the place of the pages: each panel is a placeholder with its
controls, each split has a direction control and keeps its splitters. It works on a draft, saved
or cancelled as a whole like the template editor; meanwhile there is no navigation and no
shortcut, so no note is open while panels come and go.

- A panel has a list of what it shows, a delete button and, on each of its four sides, a button
  that adds a page there and one that moves the panel one step that way (past its neighbour, out
  of its group, or across that whole edge of the screen).
- A panel is also moved by dragging it, with pointer events rather than the browser's drag and
  drop: that one cannot show an opaque card, nor a preview, and does not work by touch. The
  panel follows the pointer as a card; the layout already shows the result, with an empty slot
  where the panel would land. The side is chosen against the places the panels had when the
  drag started, so a preview that moves them cannot flicker under a resting pointer.
- Every change glides: panels are animated from their previous box to the new one ("FLIP", the
  Web Animations API, in `apps/web/src/planner/layoutDrag.ts`), unless the system asks for
  reduced motion. View transitions were tried first and dropped: they freeze the page while
  they run, which does not suit a preview that follows the pointer.
- The operations are pure functions in `packages/core/src/layoutEdit.ts`. A usable layout
  (`layoutProblems`) has a page to write in (offset 0), shows no page twice, so a note never
  has two editors, and has at most `MAX_PANELS` (6) panels; the editor offers no change that
  breaks this and `LayoutSchema` rejects such trees on the server.

Refinement (calendar panel, 2026-11): a second panel type, `{ type: 'calendar' }`: the month
of the focused day, always open, where clicking a day focuses it and the arrows browse other
months until the focus changes. It shares its grid with the pop-up of the calendar button. A
layout shows it at most once and it is not a page to write in, so a layout still needs one. The
week strip stays fixed chrome above the tree for now. Settings saved with a calendar are not
valid for a release older than this one (it falls back to the default layout while it still
serves during a deploy, ADR 0012), which is acceptable for the minutes that lasts.

Still to come: presets, the date selector as a panel, collapsible panels, one visible panel on
mobile.

## Consequences

- The layout resolver is pure and lives in `core`.
- New layouts need no new rendering code, only new panel types when content types are added.
