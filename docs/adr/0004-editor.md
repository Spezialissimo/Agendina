# 0004 — CodeMirror 6 live-preview editor

Date: 2026-10-24 · Status: Accepted

## Context

Notes need headings, lists, checkboxes and tables, should be pleasant to write in, and are merged
line by line (ADR 0002). Several editors are visible at once.

## Decision

CodeMirror 6 with live preview: the text is the markdown, rendered inline, with raw syntax shown
only on the cursor line. Built in steps: inline rendering → clickable checkboxes (lists and table
cells) → table widget with Tab navigation and add row/column → slash command menu.

Rejected: rich-text editors (TipTap/ProseMirror) because the tree ↔ markdown conversion is not
exact, which rewrites untouched lines and causes spurious merge conflicts.

## Implementation (Phase 4)

- **Rules as data.** `livePreview(state, { focused })` walks the markdown syntax tree and returns
  plain instructions (hide, bullet, rule, line class, mark, checkbox, table); a state field turns
  them into decorations. Syntax shows only on lines holding the cursor of the _focused_ editor.
- **Checkboxes.** To-dos and table cells that are exactly `[ ]`/`[x]` render as checkboxes
  labelled by text or by "row, column". Clicking edits the text (`[ ]` ↔ `[x]`), so it saves and
  merges like typing. ⌘↩ toggles or creates a to-do on the line.
- **Tables.** A grid widget when the cursor is elsewhere; aligned monospace text while editing.
  Tab/Shift+Tab move between cells and align (Tab after the last cell adds a row); outside tables
  Tab keeps moving keyboard focus. Add row/column copy the checkbox pattern.
- **Slash menu.** "/" at the start of a line, via CodeMirror autocomplete.
- **Testing.** Pure functions on `EditorState` in Node; real typing and clicking in Vitest browser
  mode (Chromium); app tests drive the real editor through its API; e2e journeys in three engines.

## Consequences

- What the user types is exactly what is stored.
- Table editing is custom work.
- Controls inside the editor (checkboxes) are not separate accessible elements; keyboard and
  screen-reader users toggle to-dos with ⌘↩. Worth a dedicated accessibility pass.
