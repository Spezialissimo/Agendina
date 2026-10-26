# Agendina

A planner/journal that feels like a paper journal, with infinitely many digital pages: a week
page and day pages in markdown, side by side. Self-hostable.

> Status: Phase 2 (server) done: accounts, notes with revisions and merging, sync feed,
> settings, export. The web UI comes in Phase 3. See [docs/plan.md](docs/plan.md).

## Self-hosting

```sh
docker compose up -d     # then open http://localhost:3000
```

The first account you create becomes the **admin**; after that, signup is closed until the
admin opens it. Notes live in the `agendina-data` volume (a single SQLite database).

**Backups**: download a zip of all your pages as markdown from `GET /api/export` (a button in the
UI later), or back up the volume.

**HTTPS**: put Agendina behind a reverse proxy that terminates TLS and sends
`X-Forwarded-Proto: https`, so session cookies are marked `Secure`.

| Variable                | Default (image)            | Meaning                                           |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `PORT`                  | `3000`                     | HTTP port                                         |
| `HOST`                  | `0.0.0.0`                  | Bind address                                      |
| `AGENDINA_DATABASE_URL` | `sqlite:/data/agendina.db` | `sqlite:<path>` or `postgres://user:pass@host/db` |
| `AGENDINA_WEB_DIR`      | `/app/web`                 | Directory of the built web app to serve           |

Migrations run automatically on start.

## Development

Requires Node 24+ and pnpm 11.

```sh
pnpm install
pnpm dev          # http://localhost:5173 (web) with the API on :3000 (data in apps/server/data)
pnpm check        # format, lint, typecheck, unit tests
pnpm e2e          # Playwright (first run: pnpm exec playwright install)
```

Database tests run on SQLite by default; see `CLAUDE.md` to also run them on Postgres.
