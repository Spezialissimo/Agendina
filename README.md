# Agendina

A planner/journal that feels like a paper journal, with infinitely many digital pages: a week
page and day pages in markdown, side by side. Self-hostable.

> Status: Phase 5 (templates) done: day and week templates, edited from any page. Next: the MVP
> release (week-start setting, Docker image). See [docs/plan.md](docs/plan.md).

## Using it

| Action                       | Mac         | Windows / Linux      |
| ---------------------------- | ----------- | -------------------- |
| Previous / next day          | ⇧⌘, / ⇧⌘.   | Ctrl+Shift+, / .     |
| Previous / next week         | ⌥⇧⌘, / ⌥⇧⌘. | Ctrl+Alt+Shift+, / . |
| Today                        | ⌥⌘T         | Ctrl+Alt+T           |
| Command palette (everything) | ⌘K          | Ctrl+K               |
| Toggle / create a to-do      | ⌘↩          | Ctrl+Enter           |
| Add a table row              | ⌥⌘↩         | Ctrl+Alt+Enter       |

Pages are markdown, rendered as you write: the syntax shows only on the line you are editing.
Type `/` at the start of a line for headings, to-dos, tables or a **week tracker** (a checkbox
per day). Checkboxes, also in tables, are clickable; Tab moves between table cells.

New pages start from a **template**, like a pre-printed planner page: one for weeks, one for
days. "Edit week template" on a page opens it (the first one starts as a copy of that page).
Saving it also updates that page and every later page made from the template, keeping what you
wrote and ticked; earlier pages stay as they are. Where a page changed the same lines as the
template, you decide per page.

Pages save themselves as you type. If another device changed the same lines meanwhile, the page
asks which version to keep (keeping both is the default, so nothing is ever lost).

## Self-hosting

```sh
docker compose up -d     # then open http://localhost:3000
```

The first account you create becomes the **admin**; after that, sign-ups are closed until the
admin opens them in Settings. Pages live in the `agendina-data` volume (a single SQLite database)
and migrations run automatically on start. HTTPS, backups, upgrades and configuration:
[docs/self-hosting.md](docs/self-hosting.md).

## Development

Requires Node 24+ and pnpm 11.

```sh
pnpm install
pnpm dev          # http://localhost:5173 (web) with the API on :3000 (data in apps/server/data)
pnpm check        # format, lint, typecheck, unit tests
pnpm e2e          # Playwright (first run: pnpm exec playwright install)
```

Database tests run on SQLite by default; see `CLAUDE.md` to also run them on Postgres.
