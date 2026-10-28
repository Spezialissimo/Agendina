# 0012 — Hosting on Cloud Run + Neon, continuous deployment

Date: 2026-10-28 · Status: Accepted

## Context

The MVP is ready for daily use and needs a home that costs (close to) nothing, for one person,
and doubles as a way to learn continuous deployment. Self-hosters keep the Docker image with
SQLite (`docs/self-hosting.md`); this is the instance we run ourselves.

## Decision

- **Google Cloud Run** runs the same Docker image, scaled to zero when idle and to **at most one
  instance** (the login rate limit is in memory). **Neon** provides Postgres (Frankfurt, close to
  Cloud Run's `europe-west3`). Both have free tiers far above one person's use.
- **Continuous deployment** (`.github/workflows/deploy.yml`): every commit on `main` that passed
  CI is built once into an image tagged with the commit, smoke-tested, pushed to Artifact
  Registry, and started as a revision **without traffic**. Traffic moves to it only after it
  reports the right version and reads the database; otherwise the previous revision keeps
  serving.
- **No stored credentials**: GitHub Actions gets short-lived Google credentials through Workload
  Identity Federation, only for this repository's `production` environment. The database URL is
  in Secret Manager, readable only by the service's own identity.

Alternatives: a VPS (always on, ~€5/month, more to maintain, SQLite would do), Fly.io (simpler,
not free), Render's free tier (sleeps ~1 minute to wake).

## Consequences

- **Migrations must keep the previous release working** (expand, then contract a release
  later): the new revision migrates the shared database while the old one still serves, and a
  rollback brings back old code on the migrated database.
- The first request after an idle period waits for both Cloud Run and Neon to start (a second or
  two).
- Journal content is stored, unencrypted, at Neon. End-to-end encryption (ADR 0006) remains the
  long-term answer.
