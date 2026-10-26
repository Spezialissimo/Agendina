# Agendina

A planner/journal web app that should feel as close as possible to a paper journal, with
infinitely many digital pages: a week page and day pages written in markdown. Self-hostable.
The full plan and roadmap live in `docs/plan.md`; architectural decisions in `docs/adr/`.

## Commands

- `pnpm dev`: server (http://localhost:3000) + Vite dev server with `/api` proxied
- `pnpm test`: all unit/integration tests (Vitest projects); `pnpm vitest run --project server`
  for one project
- Postgres tests: `docker run -d --name agendina-test-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17-alpine`
  then `TEST_POSTGRES_URL=postgres://postgres:test@localhost:54329/postgres pnpm test`. Without
  the variable, database tests run on SQLite only (CI always runs both).
- `pnpm e2e`: Playwright against the production build in Chromium, Firefox and WebKit
- `pnpm check`: format check + lint + typecheck + unit tests. **Must pass before work is done.**
- `pnpm format`: Prettier write

## Layout

- `apps/server`: Hono API. `createApp(options)` builds the app (tests use `app.request`);
  `main.ts` is the only file that touches `process`. Also serves the built web app.
- `apps/web`: React + Vite SPA. API calls go through `src/api.ts` and are validated with the
  contract schemas.
- `packages/contract`: Zod schemas + inferred types for every API request/response. Each schema
  and its type share one name (`export const X = z.object(...)`, `export type X = z.infer<...>`).
- `packages/db`: Kysely database layer (node:sqlite + Postgres), table types, migrations, and
  `testDatabases()` for running a suite on both engines (ADR 0010).
- `packages/core`: pure domain logic used by web and server. No I/O, no DOM, no clock
  or randomness except via parameters.
- `e2e/`: Playwright specs.

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
- When adding a guard (security, validation), prove the test catches the bug by temporarily
  removing the guard.
- Property-based tests (fast-check) for algorithmic code in `core` (merge, date math).
- Tests describe behaviour, not implementation: `it('falls back to index.html for client-side
routes')`, not `it('calls readWebFile twice')`.
- A new architectural choice (library, data format, protocol) gets an ADR in `docs/adr/`.

## Conventions

- TypeScript strict, ES modules, relative imports with explicit `.ts`/`.tsx` extensions.
- Prettier: no semicolons, single quotes, width 100.
- Validate all external input (HTTP bodies, env, stored JSON) with Zod at the boundary.
- Comments only for the non-obvious "why".
- TypeScript is pinned to 6.x until typescript-eslint supports 7 (ADR 0003).
- When upgrading `@playwright/test`, update the Playwright container tag in `.github/workflows/ci.yml`.

## Product guardrails

- Paper-journal first: no habit trackers or widgets unless the plan says so.
- Notes are stored verbatim as markdown; never rewrite user text on save.
- Keep E2E encryption possible: no server feature may depend on reading note content.
- Default shortcuts use cmd, never opt.
