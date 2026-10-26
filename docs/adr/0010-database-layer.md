# 0010 — Kysely on node:sqlite and Postgres

Date: 2026-10-26 · Status: Accepted · Amends: 0001, 0003 (Drizzle)

## Context

ADR 0001/0003 planned Drizzle for SQLite (self-host) and Postgres (hosted). Drizzle needs a
separate schema definition per dialect (`sqliteTable` vs `pgTable`), so every table and query
would exist twice. The self-host image bundles the server into one file, which rules out native
modules such as better-sqlite3.

## Decision

- **Kysely** as the query builder: one set of table types (`packages/db/src/schema.ts`) and one
  set of queries for both databases.
- **SQLite via Node's built-in `node:sqlite`** (no native module, no build step), through a small
  adapter to Kysely's SQLite dialect (`sqlite-adapter.ts`). WAL mode, foreign keys on.
- **Postgres via `pg`** (pure JavaScript).
- Portable schema: text UUID ids, ISO-8601 text timestamps, integers, JSON stored as text.
- Migrations are defined in code (bundle-safe) and run on start. Released migrations are never
  edited.
- Tests touching the database run on both engines (`testDatabases()` from `@agendina/db/testing`);
  CI provides Postgres and fails if it is missing.

## Consequences

- No ORM-level relations; queries are explicit SQL-shaped builder calls.
- `node:sqlite` requires Node ≥ 24 (already our baseline).
