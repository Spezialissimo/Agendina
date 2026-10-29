# Crisp theme and focus mode

Date: 2026-10-29 · Status: Draft

## Intent

Agendina should look more modern and get out of the way while you write, in the spirit of
[scrivi.la](https://scrivi.la/): sleek, a good font, full attention on the page, buttons that only
come back when you move the mouse. This round changes the **theme and the focus behaviour only**.
Layout changes (moving or regrouping panels, new chrome) come later and are out of scope.

The direction was chosen from browser mockups: "C, Crisp cards" (neutral greys, thin borders, sans
UI, serif writing). The other two (soft shadowed sheets, one borderless sheet) were rejected.

## Goals

1. Replace the warm paper palette with a neutral, monochrome light/dark theme.
2. Bundle two open fonts: a sans for the interface and a serif for the text you write.
3. Show icons instead of text for the top bar actions.
4. Add focus mode: while you work in a page with the keyboard, everything else dims and loses
   colour and every button disappears, until you move the mouse.

## Non-goals

- Layout changes: panel arrangement, the week strip position, sizes and spacing between regions
  stay as they are (only padding/radius inside components may change to fit the new style).
- A manual light/dark switch. The theme keeps following the system setting.
- Settings for the theme. (Focus mode got settings later: on/off and the resting time.)

## Anti-goals (it fails if…)

- The app makes a request to a third-party host (fonts must be served by the instance itself).
- A keyboard or touch user can end up with buttons hidden and no way to bring them back.
- Focus mode hides a problem the user must see: an error, an offline or conflict state.
- Note text is changed in any way (theme only; notes stay verbatim).

## Look

Colours (as CSS custom properties on `:root`, dark values under `prefers-color-scheme: dark`):

| Token                    | Light     | Dark      |
| ------------------------ | --------- | --------- |
| background (`--paper`)   | `#ededed` | `#1a1a1a` |
| page (`--page`)          | `#ffffff` | `#222222` |
| text (`--ink`)           | `#1f1f1f` | `#ececec` |
| secondary (`--ink-soft`) | `#696969` | `#9a9a9a` |
| lines (`--rule`)         | `#e0e0e0` | `#2e2e2e` |
| hover/chip               | `#e2e2e2` | `#2c2c2c` |

- **Contrast:** `--ink-soft` passes WCAG AA for small text (≥ 4.5:1) on both page and desk
  colours; the first values (`#8a8a8a` / `#7a7a7a`, about 3:1) were too faint.
- **No blue accent.** The theme is monochrome. `--accent` becomes the ink colour (dark grey in
  light mode, near-white in dark mode) so buttons like "Sign in" are dark with light text, the
  focus outline is ink, "today" in the week strip and month calendar is marked by weight (and the
  selected day by a grey chip), the "written" dot is ink. `--danger` stays red: errors must stand
  out.
- **Pages:** a 1px `--rule` border and no shadow, radius about 6px. Popovers (month calendar,
  command palette) keep a subtle shadow so they float above the pages.
- **Fonts:** Inter for headings, the top bar and all interface text; Source Serif 4 for the text
  inside editors and read-only page content (replaces the monospace used for read-only pages
  today). Both are SIL Open Font License 1.1, bundled from the `@fontsource` npm packages (or
  `@fontsource-variable`), so Vite serves them from the instance. Only Latin subsets and the
  weights used (regular, medium/semibold for Inter; regular and italic for Source Serif) to keep
  the bundle small. The system font stacks stay as fallbacks.
- **Icons:** the top bar's "Settings" and "Sign out" become icon buttons (gear, door/arrow out).
  Inline SVGs in the style of the ones already in `WeekStrip`/`MonthPicker` (stroke icons, 1.6px,
  currentColor); no icon library. Each keeps its accessible name (`aria-label="Settings"`,
  `"Sign out"`) and gets a matching `title` tooltip, so tests and screen readers find them by the
  same name. The week strip arrows (‹ ›) become matching SVG chevrons.
- Every screen gets the new theme: sign-in and setup, the planner, settings, the template editor,
  the conflict resolver, the month calendar and the command palette.

## Focus mode

- **Starts** on any key pressed while keyboard focus is inside an editable page's editor: typing,
  arrows, Shift-selection, Enter, Backspace. "Looking at the page with the keyboard" is the signal,
  not only changing the text.
- **While on:**
  - The page that holds the focus stays fully visible.
  - Everything else (top bar, week strip, the other pages) fades to low opacity (about 0.35–0.4)
    and is desaturated (`grayscale(1)`).
  - Every button disappears entirely (opacity 0 and not clickable), including the top bar icons,
    the week strip controls and the focused page's own "Edit … template" button.
  - The save status ("Saved", "Saving…") fades with the chrome, but the states that need
    attention (`offline`, `conflict`) and any `role="alert"` message stay fully visible.
  - A conflict resolver (`ConflictResolver`), in any page, stays fully visible and clickable:
    it is a problem the user must see. _(Builder-check call.)_
- **Ends** (everything returns to normal, buttons fade back in) on:
  - a real mouse movement: the pointer's screen position changes by more than a few pixels.
    Browsers fire `mousemove` under a still pointer when the page scrolls or the layout shifts
    (CodeMirror scrolling to the caret while typing), and that must not end focus mode.
    _(Builder-check call.)_
  - a touch or pointer down anywhere;
  - keyboard focus leaving the editor (Tab to a button, clicking elsewhere);
  - Escape in the editor: it ends focus mode and the caret stays where it is (no new
    "leave the editor" binding). If the slash menu is open, Escape closes the menu first, as
    today. _(Builder-check call.)_
  - opening the command palette or settings (they run outside focus mode).
- **Template editor:** typing in the template editor (opened with "Edit … template") also
  starts focus mode and dims everything else, but its own Save and Cancel buttons stay visible
  and clickable at all times.
- **Also starts at once** when keyboard focus moves into a page (a click or Tab into it). A click
  in the page that already has the cursor does not start it. _(Added after the first review
  round.)_
- **Also starts after 1.5 seconds** (a setting: 1–10 s; focus mode can also be turned off) in which the mouse has not moved while the typing cursor
  blinks in a page (an editor has keyboard focus and the window is in front). Any mouse movement,
  tap, key or focus change starts the wait again; after Escape, focus mode returns after the wait
  unless the mouse moves or focus leaves the page. _(Added after the first review round.)_
- **The mouse pointer hides** while focus mode is on, however it started, and comes back with
  the buttons.
- **Motion:** fades of about 0.4–0.6s. With `prefers-reduced-motion: reduce` the change is
  instant.
- Hidden buttons must not be reachable while invisible: when focus mode ends because keyboard focus
  moves to a button, that button is already visible when it receives focus.
- Read-only pages keep their existing dimmer look outside focus mode.

## Constraints

- System-font-only rule changes to "no third-party font requests": fonts are bundled. Record this
  in a new ADR (`docs/adr/0013-theme-and-fonts.md`) together with the monochrome theme and focus
  mode, including the font licences.
- The self-hosting Docker image and the Cloud Run build must include the font files (they come
  through the Vite build; check `scripts/docker-smoke-test.sh` still passes).
- Test-driven as in `CLAUDE.md`: focus mode is behaviour and gets app tests (jsdom: a key in the
  editor turns focus mode on, a mouse move/pointer down/focus leaving turns it off, buttons are
  hidden from interaction while on, alerts stay visible) and at least one e2e journey. The icon
  buttons keep their accessible names so existing tests keep finding them; if a test relied on
  visible text it is updated explicitly, not weakened.
- `pnpm check` and `pnpm e2e` must pass.

## Left to the builder

- Where the focus-mode state lives (a small hook/context on the planner, a `data-focus-mode`
  attribute on `.planner`) and how CSS keys off it.
- Exact icon artwork, exact opacity and timing values within the ranges above.
- Whether to use the variable or static `@fontsource` packages.
- Small spacing/radius tweaks inside components so the crisp style looks right, without moving
  regions.
