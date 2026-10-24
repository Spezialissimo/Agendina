# 0001 — Storage: database with verbatim markdown

Date: 2026-10-24 · Status: Accepted

## Context

Notes are markdown pages per day and per week. The app must be self-hostable, support many users
on a hosted instance, and later sync with offline mobile clients. There is no requirement to
interoperate with other apps' file formats.

## Decision

The database is the source of truth. Each note's content is stored verbatim as markdown text.
SQLite for self-hosting (a single file in a volume), Postgres for the hosted service, behind one
Drizzle schema. A built-in export produces a zip of `.md` files for backups.

## Consequences

- Multi-user, revisions and sync are straightforward.
- Backups go through the app's export or the DB file, not a plain folder.
- Two DB engines: the server test suite runs against both in CI.
