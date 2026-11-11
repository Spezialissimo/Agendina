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
week containing the focused day), `note(week, 1)` (the next week). Offset 0 is the selected
page; the others are its neighbours, written in too since 2026-11 (see below). Split sizes are
fractions, at least `MIN_PANE_SIZE` each, addressed by split id when the user drags a splitter. The week strip is
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

Refinement (named layouts, 2026-11): settings keep several layouts (`layouts` in the user
settings, `packages/core/src/layouts.ts`): the presets, which are data in `core` and never
change, and the user's custom layouts, each with an id, a name and its own tree. There is one
active layout per type of screen (desktop, phone), so every desktop shows the same one.

- A preset stores nothing but the splitter sizes the user chose for it (`presetSizes`, by split
  id; sizes that no longer fit the preset are ignored), so moving a splitter never turns it into
  a custom layout. A preset is not edited but duplicated ("Duplicate and edit"): saving makes
  a new custom layout, even unchanged. A custom layout is edited in place.
- Settings shows each layout as a card with a miniature of its pages; clicking it shows that
  layout, its buttons edit or delete it. The name is edited in the layout editor, with the
  arrangement. The editor's "Reset to Open planner" is gone: choosing Open planner does that.
- New layouts start from the one on show and are named "Custom layout N", one past the highest
  number in a name; ids are `custom-N` the same way. Deleting a layout (after a confirmation)
  shows the default preset on the screens that showed it. A user keeps at most 100 custom
  layouts (`MAX_CUSTOM_LAYOUTS`); at the limit, Settings offers no new layout or duplicate.
- A template edit whose page the active layout no longer shows is closed whenever the active
  layout changes (editor, Settings, another device), so it never comes back stale.
- Migration (ADR 0012): the single `layout` setting stays, always filled by the server with the
  active desktop layout, so the previous release keeps working. Settings saved without `layouts`
  (stored before this change, or saved by a tab still running the previous release, which has
  no reload prompt) are taken in by `adoptLegacyLayout`. Such a tab may show a layout another tab
  has switched away from, so its layout only updates the sizes of the layout with the same
  arrangement (the active one first), and an arrangement no layout has becomes a new custom
  layout (dropped at the limit); no layout's arrangement is ever replaced. The server validates
  the merged result before storing it. Drop `layout` a release later, once no tab can still run
  the old code.

Refinement (editable neighbours, 2026-11): neighbours are no longer read-only. Every note page
is written in where it is, and clicking one no longer selects its day. Offset 0 is still the
selected page (`NoteView.selected`, `selectedNote`): a layout needs one (`layoutProblems` is
unchanged), it is marked (`aria-current`, a darker edge), a navigation puts the cursor in it (the
one of the kind the user was writing in) and never in a neighbour, and a template change is
applied from it by default (ADR 0008). A shortcut to move the cursor between panels is still to
come.

Still to come: more presets, the date selector as a panel, collapsible panels, one visible
panel on mobile.

## Consequences

- The layout resolver is pure and lives in `core`.
- New layouts need no new rendering code, only new panel types when content types are added.
