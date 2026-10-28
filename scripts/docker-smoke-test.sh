#!/bin/sh
# Smoke-tests a built image the way a self-hoster uses it: start it on a fresh volume, create the
# first account and a page, then replace the container (as an upgrade does) and check that the
# account and the page are still there.
#
#   scripts/docker-smoke-test.sh [image]     (default: agendina:local)
set -eu

IMAGE=${1:-agendina:local}
NAME=agendina-smoke
VOLUME=agendina-smoke-data
PORT=${SMOKE_PORT:-3999}
URL=http://localhost:$PORT
COOKIES=$(mktemp)
ACCOUNT='{"email":"smoke@example.com","password":"correct horse battery"}'

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -f "$COOKIES"
}
trap cleanup EXIT
cleanup

fail() {
  echo "FAIL: $1" >&2
  docker logs "$NAME" >&2 || true
  exit 1
}

start() {
  docker run -d --name "$NAME" -p "$PORT:3000" -v "$VOLUME:/data" "$IMAGE" >/dev/null
  for _ in $(seq 1 30); do
    curl -sf "$URL/api/health" >/dev/null && return
    sleep 1
  done
  fail 'the server did not become healthy'
}

post() {
  curl -sf -b "$COOKIES" -c "$COOKIES" -H 'content-type: application/json' -H "origin: $URL" "$@"
}

start
echo 'Creating the first account (bundled database drivers, migrations, password hashing)'
post -d "$ACCOUNT" "$URL/api/auth/signup" >/dev/null || fail 'signup failed'
post -X PUT -d '{"content":"# Survives upgrades","baseRevision":0}' \
  "$URL/api/notes/day/2026-10-26" >/dev/null || fail 'saving a page failed'
curl -sf "$URL/day/2026-10-26" | grep -q '<div id="root">' || fail 'the web app is not served'

echo 'Replacing the container, keeping the volume'
docker rm -f "$NAME" >/dev/null
rm -f "$COOKIES"
start
post -d "$ACCOUNT" "$URL/api/auth/login" >/dev/null || fail 'the account is gone'
curl -sf -b "$COOKIES" "$URL/api/notes/day/2026-10-26" | grep -q 'Survives upgrades' ||
  fail 'the page is gone'
curl -sf "$URL/api/auth/state" | grep -q '"signupOpen":false' ||
  fail 'sign-ups should stay closed after the first account'

echo 'OK'
