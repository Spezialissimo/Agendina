# 0008 — Templates as versioned notes

Date: 2026-10-24 · Status: Accepted

## Context

Like a pre-printed planner page: every new week should start with, e.g., the objectives heading
and an empty workout table. Users want to change the template from the page they are on.

## Decision

A template is a note (`kind = template`, one for days and one for weeks) with revisions. A page
created from a template records `templateId + templateRevision`. An "Edit template" button on
every page saves a new template revision, then runs a three-way merge (base = old template,
theirs = new template, mine = page) on the current page and every future page that already
exists. Past pages are never touched. Clean merges apply silently; conflicts are collected into
one resolve list. Pages already on the new revision, and pages not created from a template, are
skipped (merging into the latter would paste the whole template in). Implemented as
`propagateTemplate` in `packages/core/src/templates.ts`. Later: a table-aware, per-cell merge to
avoid conflicts on table rows.

Templates are applied on the client, not the server: the server stores templates and their
revisions (`/api/templates/:kind`), records which revision a page was made from, and lists the
pages made from a template, but never merges template text into pages. That keeps the server
independent of note content (E2E encryption stays possible). A page nobody wrote yet shows the
template that applies to it (see below) and is only saved, with its template revision, once the user edits it.

Refinement (template pop-up, 2026-11): with neighbour pages written in too (ADR 0005), the
template editor no longer takes the place of a page. It opens in a pop-up from Settings or the
command palette, for either kind whatever the layout shows; meanwhile the planner stays where it
is (no navigation, no shortcuts, focus mode paused). Escape closes it like Cancel, unless it
closes the slash menu. A first template starts empty: no page is copied or linked to it. The save
button reads "Save and apply from …": the change reaches the pages made from the template from
the selected page on (the selected day, or the week of the selected day), or from a day or week
picked in the calendar of its arrow, which need not be on screen (for the week template, a month
whose rows are its weeks: one picks a whole week). The pages needing a decision
are listed in the pop-up. No message is left on the pages afterwards: they show the change.

"Apply from" holds for pages nobody wrote yet too, which are not stored and so show a template:
each template revision records the first page it applies to (`note_revisions.applies_from`,
sent as `appliesFrom` with the save), and such a page shows the latest revision applied from it
or an earlier page (`GET /api/templates/:kind/for/:key`), or nothing when none is. Pages before
the chosen one stay as they were: written ones untouched, empty ones showing what they showed.
The same text applied from another page is a new revision. Revisions saved before this (and by
the previous release while a deploy rolls out, ADR 0012) have no first page and apply from the
start. The server only compares keys; it still never reads the text.

## Consequences

- Reuses the merge engine from ADR 0002.
- Structural table changes (e.g. adding a column) conflict with ticked rows until the per-cell
  merge exists.
