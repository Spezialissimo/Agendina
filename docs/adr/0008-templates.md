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
current template and is only saved, with its template revision, once the user edits it.

## Consequences

- Reuses the merge engine from ADR 0002.
- Structural table changes (e.g. adding a column) conflict with ticked rows until the per-cell
  merge exists.
