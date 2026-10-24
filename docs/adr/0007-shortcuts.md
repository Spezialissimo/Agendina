# 0007 — Command registry and cmd-based shortcuts

Date: 2026-10-24 · Status: Accepted

## Context

Users define their own shortcuts. The primary user's opt key is taken by a window manager
(AeroSpace), and on macOS opt+letter produces characters (opt+L = "¬"). Browsers and the OS keep
some cmd combos for themselves.

## Decision

Every action is a command (id, title, context, handler, default bindings) in one registry. Users
override bindings in their settings (synced across devices). A command palette (cmd+K) is
generated from the registry. Keys are matched on `KeyboardEvent.code`. Default bindings use cmd.
Combos the browser/OS reserves (cmd+T/W/N/Q/H) cannot be bound; risky ones (cmd+L, cmd+[ / ])
show a warning. Defaults are verified by Playwright in Chromium, Firefox and WebKit. The shortcut
editor UI comes right after the MVP.

## Consequences

- Matching on physical keys means bindings follow key position, not the printed character, on
  non-US keyboard layouts.
