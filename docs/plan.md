# Agendina — Development Plan

## Context
Agendina is a standalone planner/journal web app (mobile later). It replaces a workflow of a weekly
markdown page (daily notes + weekly objectives + a workout table with checkboxes) next to a
separate calendar. Guiding principle: **as close as possible to a paper journal, with infinitely
many digital pages** — no habit trackers or widgets for now. No integrations with other apps for
now. Personal project, but built as a product: self-hostable server, free hosted version with some
features gated later. Development is test-driven and mostly carried out by AI, so the foundation
(tooling, tests, rules) matters as much as the features.

The first layout sketch ([`docs/first-mockup.png`](first-mockup.png)) is superseded by layout A below.

## Decisions
- **Storage**: the database is the source of truth; note content is stored verbatim as markdown.
  SQLite (built-in `node:sqlite`) for self-host, Postgres for hosted, behind one Kysely schema
  (ADR 0010).
- **Merging / offline**: revisions + line-based three-way merge (git-like). No CRDT.
  Edits in different places merge automatically; overlapping edits keep both versions and show a
  resolve UI — the app never invents text.
- **Stack**: full TypeScript pnpm monorepo. React + Vite frontend, Node + Hono backend, Kysely (ADR 0010),
  Zod-typed API contract shared by client and server, Vitest + Playwright.
- **Editor**: CodeMirror 6 live preview (markdown rendered inline; raw syntax only on the cursor
  line). Built in steps: inline rendering → clickable checkboxes (lists + table cells) → table
  widget + Tab navigation + add row/column → slash menu.
- **Default layout = "Open planner" (A)**: week strip on top (‹ Week 43 › · Mo–Su with content
  dots, click to open a day, hover to peek, 📅 month popover); left page = week note, right page =
  focused day note; both editable; draggable splitter, sizes remembered. Layouts are a JSON tree
  of row/column splits with panels relative to the focus `(date, granularity)`, so other presets
  (weekly spread, original mockup) and a user layout editor come later without rework.
  Mobile later: journal-scroll style (C); tapping the week header opens the week note, with the
  current day selectable in a footer.
- **Weeks**: week start and numbering are a user setting; default Monday / ISO weeks.
- **Shortcuts**: command registry (id, title, context, handler, default bindings) + per-user
  overrides stored in settings + command palette (cmd+K). Match on `event.code`. Defaults use
  **cmd** (opt is taken by AeroSpace). Combos the browser/OS keeps (cmd+T/W/N/Q/H) can't be bound;
  risky ones (cmd+L, cmd+[ ]) show a warning. Defaults verified by Playwright in Chromium, WebKit
  and Firefox.
- **Templates (MVP)**: a template is a note (`kind=template`, one each for day and week) with
  revisions. Pages record `templateId + templateRevision` when created from a template; an empty new
  page gets the template applied. An "Edit template" button on every page → save → three-way merge
  (base = old template, theirs = new template, mine = page) applied to the **current page and
  every future page that already exists**; past pages are untouched. Clean merges apply silently;
  conflicts are collected into one resolve list. Later: a table-aware per-cell merge.
- **Accounts**: multi-user data model from day 1; email + password, httpOnly session cookies,
  argon2. The first user becomes admin; the admin can disable signup.
- **Product**: an entitlements/feature-flag module from day 1, no billing yet. The free/paid
  split and the license (likely AGPL) are decided before public launch.
- **E2E encryption**: future goal. Keep the design ready for it: merge is client-capable (shared
  `core`), and no server feature may depend on reading note content.

## Architecture
```
apps/web        React + Vite SPA (layout renderer, editor, week strip, settings)
apps/server     Hono API, auth, sync endpoints, export, serves the built web app
packages/core   pure domain: periods/week math, focus navigation, merge (diff3), layout tree
                resolver, keymap matching, template propagation — no I/O, used by web + server
packages/contract  Zod schemas + types for every API request/response
packages/db     Kysely table types, migrations, test databases (node:sqlite + Postgres)
e2e/            Playwright tests (Chromium, WebKit, Firefox)
docs/adr/       one ADR per decision above
```
**Data model (first cut)**
- `users(id, email, password_hash, role, created_at)`, `sessions(...)`
- `notes(id uuid, user_id, kind day|week|template, period_key, content, revision,
  template_id?, template_revision?, updated_at, deleted_at?, change_seq)`
  — unique `(user_id, kind, period_key)`; keys like `2026-10-24` (day), `2026-10-19` (week = its first day, see ADR 0005), `template:week`
- `note_revisions(note_id, revision, content, created_at, device_id)`
- `user_settings(user_id, week_start, keymap json, layout json)`
- `entitlements(user_id, feature, ...)`

**Sync-shaped API** (used by the web app now, by offline mobile later):
`GET /notes?kind&from&to` · `PUT /notes/:kind/:periodKey {content, baseRevision}` → `200 {revision}`,
or a merge result, or `409 {conflict: base/mine/theirs}` · `GET /changes?since=cursor` (without
`since`: only the current cursor). The web app polls it while visible to show edits from other
devices (ADR 0014).

## How we work
Test-driven, small PRs: see `CLAUDE.md` (rules and commands) and `docs/developer-guide.md`
(planning, sizing, review). Every roadmap item below starts from its acceptance criteria, and
gets an ADR when it makes an architectural choice.

## Status
**MVP released** (Phases 0–6, 2026-10): monorepo and CI, core domain (week math, diff3 merge,
layout resolver), server (auth, notes with revisions/merge/409, changes feed, export), web shell
and live-preview editor, day/week templates with propagation, week-start setting, Docker image
on GHCR, self-hosting guide (`docs/self-hosting.md`). History: `git log` and `docs/adr/`.

Since then: daily use. Small fixes and wishes are logged and triaged in `docs/feedback.md`;
they do not belong here. Only features big enough to need acceptance criteria get a roadmap item.

## Roadmap (in this order)
1. **Layout presets and a layout editor** (next, detailed below)
2. **Mobile view and PWA**: journal-scroll style, tapping the week header opens the week note,
   the current day is selectable in a footer; installable, works as a standalone app. Ideally a
   layout (item 1), not a special case.
3. **Offline sync with client-side merge**: needs an ADR first; must say how merging would work
   under E2E encryption (the server cannot merge what it cannot read).
4. **Shortcut editor UI**: per-user overrides already exist in settings (ADR 0007).
5. **Table-aware merge**: per-cell merge for tables, also for template propagation.
6. **E2E encryption**
7. **License decision** (likely AGPL), before any public launch
8. **Freemium entitlements and hosted deployment**
9. **Capacitor app**: only if the PWA turns out not to be enough

### 1. Layout presets and a layout editor
Layouts are already data (ADR 0005): a JSON tree stored in the user's settings and validated by
`LayoutSchema`; today only `OPEN_PLANNER` is offered. Keep it small: a few presets and a minimal
editor, not a general design tool.

Acceptance criteria (to be refined with the user before writing tests):
- Settings lists the available presets (Open planner, plus at least a weekly spread and a
  day-only focus view); choosing one applies immediately and is kept after reload and on other
  devices.
- A preset needs no new rendering code unless it introduces a new panel type; presets live in
  `packages/core` as data, with tests that each resolves for any focus day and week rule.
- A minimal editor can change a split's direction, replace a panel's content (kind and offset),
  add and remove panels, and reset to a preset. Invalid trees are impossible to build in the UI
  and still rejected by `LayoutSchema` on the server.
- Exactly one editable day panel and at most one editable week panel remain in any layout, so
  autosave and focus-follows-navigation keep working (to decide: the exact rule).
- Splitter sizes are remembered per layout; switching presets never loses note content.
- Open questions: does the editor live in Settings or in place on the page? Can users save
  several named layouts, or only one custom layout?
