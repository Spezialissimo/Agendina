# 0013 — Crisp monochrome theme, bundled fonts, focus mode

Date: 2026-10-29 · Status: Accepted

## Context

The warm paper look (beige desk, cream pages, a blue accent, system fonts) felt dated. The goal is
the calm of distraction-free writing apps such as scrivi.la: a good font, nothing competing with
the page, controls that only show up when you reach for them. Three directions were mocked up
(soft shadowed sheets, one borderless sheet, crisp bordered cards); the crisp cards were chosen.
Layout stays as in ADR 0005; this is about the theme only.

## Decision

- **Monochrome tokens** on `:root`, following the system light/dark setting: grey desk
  (`#ededed` / `#1a1a1a`), white or charcoal pages (`#ffffff` / `#222222`) with a 1px border
  instead of a shadow, near-black or near-white ink. `--accent` is the ink colour: there is no
  brand colour; "today" and the current day are marked by weight and a grey chip. Only
  `--danger` keeps a colour, so problems stand out. Shadows remain only on what floats above the
  pages (popovers, dialogs).
- **Bundled fonts:** Inter (interface, headings) and Source Serif 4 (the text you write, read-only
  pages, editor headings), both variable fonts from the `@fontsource-variable` npm packages,
  imported in `main.tsx`, so Vite emits the `.woff2` files into the build and the instance serves
  them. Both are under the **SIL Open Font License 1.1**: bundling and redistribution are allowed,
  the licence text ships in each package, the fonts are used unmodified. This replaces the earlier
  rule "system fonts only" with the rule it protected: **a self-hosted instance makes no
  third-party requests** (checked by an e2e test).
- **Icon buttons** for the top bar actions: small inline SVGs, no icon library. Each keeps its
  accessible name and has a matching tooltip.
- **Focus mode:** a key pressed in a page's editor (any key, arrows included), keyboard focus
  moving into a page, or a mouse that has
  rested for 3 seconds while the cursor blinks in a page, dims and desaturates everything but that
  page and hides every button and the mouse pointer; a real mouse movement, a pointer
  down, focus leaving the editor, Escape, or opening the palette or settings brings everything
  back. "Real" movement means the pointer moved on screen: browsers fire `mousemove` under a still
  pointer when the page scrolls under it (CodeMirror scrolling to the caret while you type), and
  that must not end focus mode. Errors, offline/conflict states and the conflict resolver are
  never dimmed; the template editor's Save and Cancel stay visible.

## Consequences

- The fonts add about 100 kB (Latin Inter and Source Serif, regular) to the first visit; the
  browser only downloads the subsets a page uses (`unicode-range`), so Greek, Cyrillic and
  Vietnamese files are fetched only for text that needs them.
- A theme change is a token change in `styles.css`; components carry no colours.
- Focus mode is a document-level listener on the planner. CSS keys off
  `.planner[data-focus-mode]` and finds the page you work in with `:focus-within`, so pages need no
  knowledge of it.
