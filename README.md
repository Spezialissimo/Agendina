# Agendina

A planner/journal that feels like a paper journal, with infinitely many digital pages: a week
page and day pages in markdown, side by side. Self-hostable.

> Status: Phase 0 (foundation). See [docs/plan.md](docs/plan.md) for the roadmap.

## Development

Requires Node 24+ and pnpm 11.

```sh
pnpm install
pnpm dev          # http://localhost:5173 (web) with the API on :3000
pnpm check        # format, lint, typecheck, unit tests
pnpm e2e          # Playwright (first run: pnpm exec playwright install)
```

## Self-hosting

```sh
docker build -t agendina .
docker run -d -p 3000:3000 -v agendina-data:/data agendina
```

| Variable           | Default      | Meaning                                 |
| ------------------ | ------------ | --------------------------------------- |
| `PORT`             | `3000`       | HTTP port                               |
| `HOST`             | `0.0.0.0`    | Bind address                            |
| `AGENDINA_WEB_DIR` | (image: set) | Directory of the built web app to serve |
