# 0014 — Live updates by polling the changes feed

Date: 2026-11-06 · Status: Accepted

## Context

With two laptops side by side, an edit on one only showed on the other after switching windows:
pages reloaded on window focus only. The sync-shaped API already has a changes feed
(`GET /api/changes?since=cursor`) built for offline clients.

## Decision

- **Polling, not WebSockets or server-sent events.** While the tab is visible, the web app asks
  the changes feed every 5 seconds (`POLL_INTERVAL_MS`), and right away when the tab becomes
  visible or the window gets focus. A hidden tab sends nothing. One request per poll, however many
  pages are on screen; it pages through `hasMore` only after a long absence.
- **The feed only says what changed; the pages reload themselves.** Each changed note or
  template is reloaded through its usual query (one loading path), unless this tab already has
  that revision (its own saves). Lists of pages covering the changed day (the week strip) reload
  too. This replaces reloading every page on window focus.
- **Where to start:** `GET /api/changes` without `since` returns no changes, only the current
  cursor (the user's change sequence number). The planner takes it before loading its pages, so
  a change saved while they load is not missed. If that fails (offline at start), the first
  successful poll reloads everything instead. The cursor only moves forward.
- **Edits in progress are untouched:** a page with unsaved typing keeps its text; the next
  autosave merges as before (ADR 0002). A clean page takes the new text as a minimal editor
  change, so the cursor stays where it was.
- **The query cache holds the newest revision known, which may be ahead of what a page shows.**
  The poll skips notes whose cached revision is current, so a page that was not clean when a newer
  revision arrived (unsaved typing, an open conflict) checks the cache again as soon as it becomes
  clean (saved, typed and erased, conflict discarded or resolved) and adopts the newer revision.
  A save's answer never replaces a newer cached revision.
- A failed poll (offline, server error) is silent; the next tick tries again. No back-off: one
  small request every 5 seconds is cheap.

## Consequences

- Nothing new to run or proxy for self-hosting: plain HTTP requests, no long-lived connections.
- Opening the planner costs one extra round trip (the cursor) before the pages load; it runs in
  parallel with loading the settings, which the pages wait for anyway.
- Changes from elsewhere show within about 5 seconds, not instantly.
- Each visible tab costs one small request every 5 seconds; idle feeds return an empty list.
- The server reads no note content to serve the cursor, so E2E encryption stays possible.
