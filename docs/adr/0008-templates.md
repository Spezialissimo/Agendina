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
one resolve list. Later: a table-aware, per-cell merge to avoid conflicts on table rows.

## Consequences

- Reuses the merge engine from ADR 0002.
- Structural table changes (e.g. adding a column) conflict with ticked rows until the per-cell
  merge exists.
