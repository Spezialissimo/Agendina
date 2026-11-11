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

Bindings are stored as canonical strings, `Mod+Ctrl+Alt+Shift+<KeyboardEvent.code>` (e.g.
`Mod+Shift+KeyJ`), where `Mod` is Cmd on Mac and Ctrl elsewhere. A binding is classified as
`ok`, `reserved`, `risky` or `types-text`. `types-text` covers keys without a command modifier,
and on Mac also Option+key, because Option types characters on many layouts (`@ # [ ]` on
Italian keyboards). Pure logic lives in `packages/core/src/keymap.ts`; handlers and the recorder
UI live in the web app.

Default bindings (Phase 3), chosen to avoid macOS text editing (⌘⇧←/→ selects to line edges,
⌥←/→ moves by word), Mission Control (⌃←/→), VoiceOver (⌃⌥) and browser menus:

| Command                           | Binding                                        | Mac                          |
| --------------------------------- | ---------------------------------------------- | ---------------------------- |
| Previous / next day               | `Mod+Shift+Comma` / `Mod+Shift+Period`         | ⇧⌘, / ⇧⌘. (the `<` `>` keys) |
| Previous / next week              | `Mod+Alt+Shift+Comma` / `Mod+Alt+Shift+Period` | ⌥⇧⌘, / ⌥⇧⌘.                  |
| Today                             | `Mod+Alt+KeyT`                                 | ⌥⌘T                          |
| Command palette                   | `Mod+KeyK`                                     | ⌘K                           |
| Page left / below / above / right | `Ctrl+Shift+KeyH` / `KeyJ` / `KeyK` / `KeyL`   | ⌃⇧H / J / K / L (vim)        |

The page moves (added 2026-11-11) are the one exception to "defaults use cmd": they are Ctrl+Shift
on every platform, by the user's choice, so on a Mac they leave ⌘ to the browser and the editor.
Off a Mac they replace CodeMirror's Ctrl+Shift+K "delete line" (a Mac keeps it on ⇧⌘K). There,
Ctrl+Shift+J opens Chrome's developer tools and Ctrl+Shift+K Firefox's console before a page can
take them, so they are checked by hand too and remain rebindable.

Automated browser tests prove the page receives these keys; they cannot prove that no browser or
OS menu claims one first on a given machine, so defaults are also checked by hand on a Mac.
Form fields other than page editors (e.g. the palette search) keep every key to themselves.

## Consequences

- Matching on physical keys means bindings follow key position, not the printed character, on
  non-US keyboard layouts.
