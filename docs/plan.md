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
(planning, sizing, review). Every phase starts from its acceptance criteria, and gets an ADR when
it makes an architectural choice.

## Status
**MVP released** (Phases 0–6, 2026-10): monorepo and CI, core domain (week math, diff3 merge,
layout resolver), server (auth, notes with revisions/merge/409, changes feed, export), web shell
and live-preview editor, day/week templates with propagation, week-start setting, Docker image
on GHCR, self-hosting guide (`docs/self-hosting.md`). History: `git log` and `docs/adr/`.

Since then: daily use. Small fixes and wishes are logged and triaged in `docs/feedback.md`;
they do not belong here. Only features big enough to need acceptance criteria get a phase.

## Roadmap
Phases are done in this order. Each one is detailed below.

- **Phase 7 — Layout editor** (in progress: done, to try)
- **Phase 8 — Several named layouts** (in progress: done, to try)
- **Phase 9 — Week strip panel and collapsible panels**
- **Phase 10 — Mobile view and PWA**, then remove focus mode
- **Phase 11 — Layout presets**
- **Phase 12 — Offline sync with client-side merge**
- **Phase 13 — Shortcut editor UI**
- **Phase 14 — Table-aware merge**
- **Phase 15 — E2E encryption**
- **Phase 16 — License decision**
- **Phase 17 — Freemium entitlements and hosted deployment**
- **Phase 18 — Capacitor app** (only if the PWA turns out not to be enough)

### Phase 7 — Layout editor
Layouts are already data (ADR 0005): a JSON tree stored in the user's settings and validated by
`LayoutSchema`. Keep it small: a minimal editor, not a general design tool.

Acceptance criteria:
- A minimal editor can change a split's direction, replace a panel's content (kind and offset),
  add and remove panels, and reset to Open planner. Invalid trees are impossible to build in the
  UI and still rejected by `LayoutSchema` on the server.
- Every layout has at least one editable page and at most one per kind (day, week), so a note
  never has two editors. Layouts without a day page or without a week page stay valid, as today.
- The editor opens from a button in Settings and takes the place of the pages, like the template
  editor (Cancel / Save layout): panels are placeholders with their controls, and nothing else
  can be done meanwhile (no navigation, no shortcuts).

Done (PR #58): the layout editor (ADR 0005, `packages/core/src/layoutEdit.ts`). A layout shows
no page twice and at most 6 pages. Pages are added and moved with buttons on their four sides,
or dragged, with a live preview. Also a calendar panel: the month of the selected day, always
open (ADR 0005). Next: try it.

### Phase 8 — Several named layouts
Settings hold one layout tree today, with the splitter sizes inside it. This phase lets users
keep several, which the phone (Phase 10) and the presets (Phase 11) both need.

Acceptance criteria (decided 2026-11-10):
- Settings keep several layouts, each with a name and its own splitter sizes, so switching never
  loses an arrangement.
- Users can create as many custom layouts as they like, named "Custom layout 1",
  "Custom layout 2", … by default. A layout list in Settings shows them all; users can rename
  and delete their own layouts. Deleting the active one switches to the default layout.
- Presets (Open planner for now) cannot be changed: editing one saves the result as a new
  custom layout.
- There is one active layout per screen type (phone, desktop), saved in the settings, so every
  desktop shows the same layout and, from Phase 10, every phone too.
- Constraint (ADR 0012): while a deploy rolls out, the previous release still reads the single
  `layout` setting, so the new code keeps it filled with the active desktop layout until a
  release later.

Done (branch `feat/named-layouts`): named layouts (ADR 0005, `packages/core/src/layouts.ts`):
layout cards in Settings with a miniature of each (choose, Edit, Delete with confirmation, New
layout; presets offer "Duplicate and edit"), the name edited in the layout editor, Open planner
as the only preset. Next: try it; a release later, drop the single `layout` setting.

Right after it, a small PR: **neighbour pages become editable**. The days and weeks before and
after the selected one (offset ≠ 0) are no longer read-only, and clicking one no longer selects
its day: it is written in where it is, like the selected page. To decide in that PR: what
"Edit template" and "focus follows navigation" do with several editable pages of one kind, and
updating ADR 0005 ("Offset 0 is editable; other panels are read-only").

### Phase 9 — Week strip panel and collapsible panels
Panels the mobile view needs, useful on desktop too.

Acceptance criteria (to be refined before writing tests):
- The week strip on top becomes a panel, placed and moved like the others, so a layout with the
  calendar panel needs no top bar. On the phone it is the day footer.
- To decide: what layouts saved before this show where the strip was, and how a panel as tall
  as its content fits splits sized by fractions.
- Collapsible panels, e.g. a week page that stays hidden until clicked.
- Both stay expressible in the same layout tree.

### Phase 10 — Mobile view and PWA
Acceptance criteria (to be refined before writing tests):
- Journal-scroll style: tapping the week header opens the week note, the current day is
  selectable in a footer (the week strip panel, Phase 9).
- Only one panel visible at a time.
- Ideally a layout (Phases 7–9), not a special case: the phone shows its own active layout
  (Phase 8), never the desktop one.
- The phone shows neither the desktop presets nor the layout editor.
- Installable, works as a standalone app (PWA).

Right after it: remove focus mode (ADR 0013).

### Phase 11 — Layout presets
Today only Open planner is offered. Keep it small: a few desktop presets, built on the layout
editor and the named layouts (Phase 8).

Acceptance criteria (to be refined with the user before writing tests):
- Settings lists the available presets (Open planner plus a few more, chosen when this phase
  starts; a seven-day weekly spread would need a new panel type, see ADR 0005); choosing one
  applies immediately and is kept after reload and on other devices.
- A preset needs no new rendering code unless it introduces a new panel type; presets live in
  `packages/core` as data, with tests that each resolves for any focus day and week rule.
- The layout editor can reset to any preset, not only Open planner.
- Switching presets never loses note content.

### Phases 12–18
- **Phase 12 — Offline sync with client-side merge**: needs an ADR first; must say how merging
  would work under E2E encryption (the server cannot merge what it cannot read). Before
  starting: review merge correctness (property tests in `core`), as merges become far more
  frequent.
- **Phase 13 — Shortcut editor UI**: per-user overrides already exist in settings (ADR 0007).
- **Phase 14 — Table-aware merge**: per-cell merge for tables, also for template propagation.
- **Phase 15 — E2E encryption**. Before starting: check that no server feature reads note
  content.
- **Phase 16 — License decision** (likely AGPL), before any public launch.
- **Phase 17 — Freemium entitlements and hosted deployment**. Before starting: a security review
  of auth, sessions and export.
- **Phase 18 — Capacitor app**: only if the PWA turns out not to be enough.
