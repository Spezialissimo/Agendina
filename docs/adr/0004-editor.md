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

## Consequences

- What the user types is exactly what is stored.
- Table editing is custom work.
