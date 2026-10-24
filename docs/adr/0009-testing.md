# 0009 — AI-driven test-driven development

Date: 2026-10-24 · Status: Accepted

## Context

Most code is written by AI. Reviewing tests is cheaper than reviewing implementation, and tests
are the most precise spec.

## Decision

Per feature: acceptance criteria → failing tests first → human review of the tests → implement →
refactor → all gates green → small PR. Test layers: `core` unit + property-based tests
(fast-check); server integration tests via `app.request` on SQLite and Postgres; web component
tests (Testing Library, Vitest browser mode for the editor); Playwright e2e in Chromium, Firefox
and WebKit against the production build. Gates in CI: Prettier, ESLint (strict type-checked),
typecheck, unit tests, e2e, Docker image smoke test. Rules for the AI live in `CLAUDE.md`.

## Consequences

- Slower first steps, a safer base for AI-written changes.
