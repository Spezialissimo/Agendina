# 0002 — Revisions and three-way merge, no CRDT

Date: 2026-10-24 · Status: Accepted

## Context

A phone may edit offline while a laptop edits the same note. Options considered: last write wins
(loses text), revisions + three-way merge (git-like), CRDT (Yjs). A CRDT always converges but can
silently produce semantically wrong text after long offline edits ("Run 5km" edited to 10km and
8km on two devices becomes "Run 108km"), and makes a binary document the source of truth.

## Decision

Every note has a revision number and a revision history. Writes carry `baseRevision`. If the base
is stale, the server runs a line-based three-way merge (base, mine, theirs). Non-overlapping edits
merge automatically; overlapping edits keep both versions and the user resolves them. The app
never invents text.

Built from day 1: stable note identity `(user, kind, periodKey)`, revisions + history, tombstones,
a sync-shaped API (`PUT` with `baseRevision`, `GET /changes?since=`), and a pure
`merge(base, mine, theirs)` in `packages/core` so clients can merge too.

## Consequences

- Occasional conflict prompts instead of silent corruption.
- Revision history doubles as a version-history feature.
- Real-time collaborative editing would require revisiting this (Yjs could be adopted later).
