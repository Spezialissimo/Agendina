# Agendina

A planner/journal web app that should feel as close as possible to a paper journal, with
infinitely many digital pages: a week page and day pages written in markdown. Self-hostable.
The full plan and roadmap live in `docs/plan.md`; architectural decisions in `docs/adr/`;
how we plan, size and review work with Claude Code in `docs/developer-guide.md`.

## Commands

- `pnpm dev`: server (http://localhost:3000) + Vite dev server with `/api` proxied
- `pnpm test`: all unit/integration tests (Vitest projects); `pnpm vitest run --project server`
  for one project
- Postgres tests: `docker run -d --name agendina-test-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17-alpine`
  then `TEST_POSTGRES_URL=postgres://postgres:test@localhost:54329/postgres pnpm test`. Without
  the variable, database tests run on SQLite only (CI always runs both).
- `pnpm test:browser`: editor component tests in real Chromium
- `pnpm e2e`: Playwright against the production build in Chromium, Firefox and WebKit
- `pnpm check`: format check + lint + typecheck + unit tests. **Must pass before work is done.**
- `pnpm format`: Prettier write
- Deploys: every green commit on `main` goes to Cloud Run (`docs/deploying.md`, ADR 0012).
- `docker build -t agendina:local . && scripts/docker-smoke-test.sh`: the self-hosting image, as CI
  checks it (also on release: pushing a `v*` tag publishes it to GHCR)

## Layout

- `apps/server`: Hono API. `createApp(options)` builds the app (tests use `createTestServer` from
  `src/testing.ts`, which calls it like a browser); `main.ts` is the only file that touches
  `process`. Also serves the built web app. One folder per feature (`auth/`, `notes/`,
  `settings/`, `export/`) with `routes.ts`, repository code and tests. Handlers throw
  `ApiError(status, code)`; every error response is `{ error: code }`.
- Server tests that touch the database use `describe.each(testDatabases())`, so they run on
  SQLite and Postgres. Inject the clock (`now`) instead of reading the time.
- `apps/web`: React + Vite SPA. API calls go through `src/api/client.ts` (validated with the
  contract). Tests render the whole app against the **real server in-process**
  (`src/test/server.ts`, `src/test/render.tsx`): no API mocks. `setOffline(true)` simulates a lost
  connection. Clock, locale, platform and current path are injected via `AppProviders`.
- Handlers that run on key presses or clicks must read the current day with `useCurrentDay`
  (the router's location at call time), not from rendered props: React renders a navigation
  slightly later, so a shortcut pressed right after a click would act on the previous day.
- `packages/contract`: Zod schemas + inferred types for every API request/response. Each schema
  and its type share one name (`export const X = z.object(...)`, `export type X = z.infer<...>`).
- `packages/db`: Kysely database layer (node:sqlite + Postgres), table types, migrations, and
  `testDatabases()` for running a suite on both engines (ADR 0010).
- `packages/core`: pure domain logic used by web and server. No I/O, no DOM, no clock
  or randomness except via parameters.
- `e2e/`: Playwright specs; each project (api, chromium, firefox, webkit) gets its own server
  and in-memory database, so every journey starts on a fresh instance. Wait for autosave by
  polling the API (`savedOnServer`), not for a "Saved" label that may already be showing.
  Journeys that change account-wide state (templates) sign in as their own account with
  `enterAs`, so the journeys running in parallel on the same server are not affected.
- The editor (CodeMirror) is tested in three layers: pure functions on `EditorState` (Node);
  real typing and clicking in `*.browser.test.tsx` (Vitest browser mode, Chromium:
  `pnpm test:browser`); app tests in jsdom drive it through CodeMirror's API with
  `src/test/editor.ts` (`typeInto`, `replaceText`, `editorText`), as jsdom cannot type into a
  contenteditable.
- When editing files with scripts, assert that each replacement matched: Prettier rewraps lines,
  so a text that was written one way may no longer be found; prefer exact-match edits.
- user-event quirks: type a literal `[` as `[[`; press `.`/`,` by code (`[Period]`, `[Comma]`).

## How we work: test-driven

1. Start from acceptance criteria (in the task or `docs/plan.md`).
2. Write the failing tests first and run them to see them fail for the right reason.
3. Show the tests to the user for review before implementing when a feature is new or the spec
   is ambiguous.
4. Implement the minimum to pass, then refactor with the tests green.
5. Run `pnpm check` (and `pnpm e2e` for UI/server changes) before saying the work is done.

Rules:

- Never delete, skip or weaken a test to make it pass. If a test is wrong, say so explicitly
  and explain why before changing it.
- When adding a guard (security, validation, concurrency), prove the test catches the bug by
  temporarily removing the guard. Vitest hides console output of passing tests; log to a file
  when debugging.
- Concurrency tests on Postgres: warm the pool first (one query per concurrent task), or the
  transactions will not actually overlap.
- Property-based tests (fast-check) for algorithmic code in `core` (merge, date math).
- Tests describe behaviour, not implementation: `it('falls back to index.html for client-side
routes')`, not `it('calls readWebFile twice')`.
- A new architectural choice (library, data format, protocol) gets an ADR in `docs/adr/`.

## Conventions

- TypeScript strict, ES modules, relative imports with explicit `.ts`/`.tsx` extensions.
- Migrations must keep the previous release working (production migrates while the old revision
  still serves, ADR 0012): add tables/columns; rename or drop only a release later.
- Prettier: no semicolons, single quotes, width 100.
- Validate all external input (HTTP bodies, env, stored JSON) with Zod at the boundary.
- Comments only for the non-obvious "why".
- TypeScript is pinned to 6.x until typescript-eslint supports 7 (ADR 0003).
- When upgrading `@playwright/test`, update the Playwright container tag in `.github/workflows/ci.yml`.

## Product guardrails

- Paper-journal first: no habit trackers or widgets unless the plan says so.
- Notes are stored verbatim as markdown; never rewrite user text on save.
- Keep E2E encryption possible: no server feature may depend on reading note content.
- Default shortcuts use cmd, never opt (exception: the page moves, ⌃⇧H/J/K/L, ADR 0007).
