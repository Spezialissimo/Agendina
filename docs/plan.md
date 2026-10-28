# Agendina — Development Plan

## Context
Agendina is a standalone planner/journal web app (mobile later). It replaces a workflow of a weekly
markdown page (daily notes + weekly objectives + a workout table with checkboxes) next to a
separate calendar. Guiding principle: **as close as possible to a paper journal, with infinitely
many digital pages** — no habit trackers or widgets for now. No integrations with other apps for
now. Personal project, but built as a product: self-hostable server, free hosted version with some
features gated later. Development is test-driven and mostly carried out by AI, so the foundation
(tooling, tests, rules) matters as much as the features.

The project directory is empty apart from `First moc.png` (the first layout sketch, now superseded
by layout A below).

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
  and Firefox. Shortcut editor UI right after the MVP.
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
or a merge result, or `409 {conflict: base/mine/theirs}` · `GET /changes?since=cursor`.

## AI-driven TDD workflow
- **Per feature**: short spec with acceptance criteria → AI writes **failing tests first** → a
  human reviews the tests (cheaper than reviewing code, and the tests are the spec) → implement →
  refactor → all gates green → small PR.
- **Test layers**:
  - `core`: Vitest unit tests + property-based tests (fast-check) for merge and date math, e.g.
    "merging non-overlapping edits keeps both" and "next(prev(x)) = x across year boundaries";
    high coverage threshold, mutation testing (Stryker) on merge later.
  - `server`: Hono `app.request` integration tests on in-memory SQLite; the same suite runs on
    Postgres (Testcontainers) in CI.
  - `web`: Vitest + Testing Library for components; Vitest browser mode for CodeMirror behaviour.
  - `e2e`: Playwright user journeys on 3 browsers + screenshot tests for the layout.
- **Gates**: TS strict, ESLint, Prettier, typecheck + tests + e2e in GitHub Actions, conventional
  commits.
- **CLAUDE.md rules**: tests first; never weaken or delete a test to make it pass without saying
  so; run lint, typecheck and tests before claiming done; record new architectural choices as
  ADRs; keep `core` pure.

## Roadmap
**Phase 0 — Foundation** ✅: monorepo, tooling, CI, CLAUDE.md, ADRs for the decisions above, health
endpoint, a Playwright smoke test, Dockerfile skeleton.
**Phase 1 — Core domain** ✅: period keys and week math (configurable week start), focus navigation,
diff3 merge, layout tree + resolver, keymap matching + reserved combos, template propagation logic.
**Phase 2 — Server** ✅ (PRs #9–#15): schema + migrations (SQLite + PG), auth (first user = admin, signup toggle),
notes API with revisions/merge/409, changes feed, settings, entitlements stub, export as a .md zip.
**Phase 3 — Web shell** ✅ (PRs #16–#21): login, layout A renderer, week strip + month popover, command registry
+ default cmd shortcuts + palette, autosave (debounced) with revision handling, conflict resolve UI.
**Phase 4 — Editor** ✅ (PRs #22–#28): CodeMirror live-preview steps (see Decisions).
**Phase 5 — Templates** ✅ (PRs #31–#35): day/week templates, auto-apply on new pages, "Edit template" button +
propagation to current and existing future pages + conflict list.
**Phase 6 — MVP release** ✅ (PRs #36–#40): week-start setting (old week pages stay visible), export
and sign-ups in Settings, Docker image released to GHCR on `v*` tags (amd64 + arm64, smoke-tested
across a container replacement), self-hosting guide (`docs/self-hosting.md`). Next: daily use.
**Post-MVP (rough order)**: shortcut editor UI → extra layout presets + layout editor → mobile
view (journal scroll, week header ↔ day footer) + PWA → offline sync with client-side merge →
Capacitor app → freemium entitlements + hosted deployment → table-aware merge → E2E encryption;
license decision before public launch.

## Verification
- Each phase ends with green `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` in CI.
- MVP acceptance (Playwright + manual): sign up as the first user (becomes admin) → week template
  with workout table appears on a new week → write today's note, tick boxes, reload → content
  persists → cmd-shortcuts move day/week → edit the template on the current page → the change
  appears on the current page and existing future pages, with ticks preserved → edit the same
  line in two tabs → resolve prompt → export a zip of .md files → `docker run` a fresh instance
  with a SQLite volume and repeat the smoke test.
