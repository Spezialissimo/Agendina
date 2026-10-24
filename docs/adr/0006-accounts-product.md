# 0006 — Accounts, entitlements and E2E-readiness

Date: 2026-10-24 · Status: Accepted

## Context

The app may become a product: self-hostable, plus a free hosted version where some features are
gated later. Journals are private, so end-to-end encryption is a future goal.

## Decision

- Multi-user data model from day 1. Email + password, httpOnly session cookies, argon2. The first
  user becomes admin; the admin can disable signup.
- An entitlements module (`isEnabled(user, feature)`) from day 1; no billing yet. The free/paid
  split and the license (likely AGPL) are decided before public launch.
- E2E-ready: merging is possible on clients (`core`), and no server feature may depend on reading
  note content.

## Consequences

- Server-side full-text search is not planned; search runs on the client.
