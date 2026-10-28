# Self-hosting Agendina

Agendina is one container: the web app, the API and a SQLite database in a volume. It uses well
under 100 MB of memory, and released images run on amd64 and arm64.

## Start

With Docker Compose, from a checkout of this repository:

```sh
docker compose up -d     # then open http://localhost:3000
```

Compose uses the released image `ghcr.io/spezialissimo/agendina` when it can pull it, and
otherwise builds one from the checkout. Without Compose:

```sh
docker run -d --name agendina -p 3000:3000 -v agendina-data:/data \
  --restart unless-stopped ghcr.io/spezialissimo/agendina:latest
```

Released images are tagged with their version (`0.1.0`, `0.1`) and `latest`. While the
repository is private, `docker login ghcr.io` first, with a GitHub token that can read packages.

## Accounts

The **first account** created on a fresh instance becomes the **admin**. After that, sign-ups are
closed: to let someone else in, the admin ticks **Settings → Anyone can create an account**, and
unticks it once they have signed up.

## HTTPS

Agendina speaks plain HTTP; put it behind a reverse proxy that terminates TLS. The proxy must pass
the original `Host` and send `X-Forwarded-Proto: https`, so session cookies are marked `Secure`.

[Caddy](https://caddyserver.com) does all of this, certificates included, with:

```
journal.example.com {
	reverse_proxy localhost:3000
}
```

With nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Backups

Two kinds, both worth having:

- **Your pages as markdown**: **Settings → Download all pages** gives a zip with one `.md` file
  per day, week and template. Readable anywhere, but it holds one account's pages only, without
  history or settings.
- **The whole instance**: every account, page, revision and setting is in the `/data` volume.
  Stop the container while copying, so the database is not changing underneath the copy:

  ```sh
  docker compose stop
  docker compose run --rm --no-deps --user root -v "$PWD:/backup" agendina \
    tar czf /backup/agendina-backup.tgz -C /data .
  docker compose start
  ```

To restore, into an empty volume:

```sh
docker compose stop
docker compose run --rm --no-deps --user root -v "$PWD:/backup" agendina \
  sh -c 'tar xzf /backup/agendina-backup.tgz -C /data && chown -R node:node /data'
docker compose start
```

(With plain `docker run`, use the same commands with `docker run --rm --user root -v
agendina-data:/data -v "$PWD:/backup" ghcr.io/spezialissimo/agendina …`.)

## Upgrades

Back up first, then:

```sh
docker compose pull && docker compose up -d
```

Database migrations run automatically when the new version starts. Going back to an older version
after a migration is not supported: restore the backup instead.

## Configuration

| Variable                | Default (image)            | Meaning                                           |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `PORT`                  | `3000`                     | HTTP port inside the container                    |
| `HOST`                  | `0.0.0.0`                  | Bind address                                      |
| `AGENDINA_DATABASE_URL` | `sqlite:/data/agendina.db` | `sqlite:<path>` or `postgres://user:pass@host/db` |
| `AGENDINA_WEB_DIR`      | `/app/web`                 | Directory of the built web app to serve           |

**Postgres** instead of SQLite: set `AGENDINA_DATABASE_URL` to a `postgres://` URL of an empty
database; the volume is then unused. Back up with `pg_dump`.

**A host directory** instead of a named volume (`-v ./data:/data`): the container runs as user
1000, so the directory must belong to it (`sudo chown 1000:1000 ./data`).

**Health**: `GET /api/health` answers `{"status":"ok","version":"…"}`; the image's Docker health
check uses it.

## Without Docker

Node 24 or later and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm build
AGENDINA_WEB_DIR=apps/web/dist AGENDINA_DATABASE_URL=sqlite:./data/agendina.db \
  node apps/server/dist/main.js
```

`apps/server/dist/main.js` is a single file with every dependency bundled; together with
`apps/web/dist` it is all a server needs.
