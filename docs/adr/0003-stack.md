# 0003 — Full-TypeScript monorepo

Date: 2026-10-24 · Status: Accepted

## Context

The merge logic must run on the server and on clients. Development is mostly AI-driven, which
works best in a single language and toolchain. A mobile app comes later.

## Decision

pnpm workspace monorepo: React + Vite (web), Node + Hono (server), Drizzle (DB), Zod schemas in
`packages/contract` shared by client and server, pure domain code in `packages/core`. Vitest for
unit/integration tests, Playwright for e2e. Mobile later via Capacitor (or React Native reusing
`core`). The server is bundled into a single file (tsup) so the Docker image needs no
`node_modules`.

TypeScript is pinned to 6.x: typescript-eslint does not support TypeScript 7 yet. Revisit when it
does.

## Consequences

- One language, shared types and logic across all layers.
- Weaker runtime guarantees than Scala/Rust: compensated with Zod at every boundary and strict TS.
- Native Node modules (e.g. some SQLite drivers) cannot be bundled; choose drivers accordingly
  in Phase 2.
