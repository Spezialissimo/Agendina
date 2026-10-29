# Crisp Theme and Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the web app as a monochrome "crisp cards" theme with bundled fonts and icon
buttons, and add a focus mode that dims everything but the page you are working in until the
mouse moves.

**Architecture:** The theme is CSS only (`apps/web/src/styles.css` tokens + selectors) plus two
`@fontsource-variable` packages imported in `main.tsx`. Icons are small inline-SVG React
components. Focus mode is one hook, `useFocusMode`, that listens on `document` and returns a
boolean; `PlannerPage` puts it on `.planner` as `data-focus-mode`, and CSS does the rest (the
focused page is found with `:focus-within`, so no page needs to know about focus mode).

**Tech Stack:** React 19, Vite 8, CodeMirror 6, Vitest (jsdom), Playwright, `@fontsource-variable/inter`,
`@fontsource-variable/source-serif-4`.

**Spec:** `docs/superpowers/specs/2026-10-29-crisp-theme-and-focus-design.md`

## Global Constraints

- No request to any third-party host: fonts are bundled and served by the instance.
- Monochrome: no blue accent anywhere; `--danger` stays red.
- Layout does not change: no panel, strip or region moves or resizes.
- Notes are never rewritten; this work touches no note text.
- Icon buttons keep their accessible names (`Settings`, `Sign out`, `Previous week`, `Next week`)
  and get a matching `title`.
- Focus mode never hides an error: `role="alert"`, `.save-status[data-status='offline'|'conflict']`
  and `.conflict` stay fully visible and clickable.
- Template editor Save/Cancel (`.template-editor .conflict-actions button`) are always visible.
- `prefers-reduced-motion: reduce` → no transitions.
- Prettier: no semicolons, single quotes, width 100; relative imports with explicit `.ts`/`.tsx`.
- Work on a branch from `main` (`feat/crisp-theme`), one PR. Do not touch the unrelated local
  changes to `CLAUDE.md` and `docs/developer-guide.md`.
- `pnpm check` and `pnpm e2e` pass before the work is called done.

## Review Focus

1. Typing near the bottom of a long page scrolls the editor; Chrome/WebKit fire `mousemove` under
   a still pointer, so focus mode must stay on → Task 3 test "ignores mouse events that do not move
   the pointer".
2. Escape while the slash menu is open must close the menu and keep focus mode → Task 4 e2e step
   "Escape closes the slash menu first".
3. A keyboard user Tabbing out of the editor reaches a button that must be visible when it gets
   focus → Task 3 test "ends when keyboard focus leaves the editor" + Task 4 e2e opacity check.
4. A save failing while focus mode is on (offline) must show its status at full opacity → Task 4
   e2e step "offline status stays visible".
5. A tap on a touch screen while in focus mode only reveals the UI, it does not press an invisible
   button → Task 3 test "ends on pointer down" + Task 4 CSS `pointer-events: none` on hidden
   buttons.

---

### Task 1: Monochrome palette, bundled fonts, ADR

**Files:**
- Modify: `apps/web/package.json` (add the two font packages via `pnpm --filter @agendina/web add`)
- Modify: `apps/web/src/main.tsx` (import the font CSS)
- Modify: `apps/web/src/styles.css` (tokens, fonts per selector, shadows → borders)
- Modify: `apps/web/src/editor/PageEditor.tsx:31-60` (slash-menu theme: border instead of shadow
  only if it looks wrong; it reads tokens, so it may need no change)
- Create: `docs/adr/0013-theme-and-fonts.md`; add it to `docs/adr/README.md`
- Modify: `.gitignore` (add `.superpowers/`)
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: CSS tokens used by Tasks 2 and 4: `--paper --page --ink --ink-soft --rule --chip
  --accent --accent-ink --danger --shadow --radius --font-body --font-serif --font-mono`.

- [ ] **Step 1: Write the failing e2e test** in `e2e/smoke.spec.ts`

```ts
test('serves its fonts itself and calls no other host', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Agendina' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const appOrigin = new URL(page.url()).origin
  expect(requests.filter((u) => !u.startsWith(appOrigin) && !u.startsWith('data:'))).toEqual([])
  expect(requests.some((u) => u.endsWith('.woff2'))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm e2e --project chromium e2e/smoke.spec.ts`
Expected: FAIL on the `.woff2` assertion (no font files today).

- [ ] **Step 3: Add fonts.** `pnpm --filter @agendina/web add @fontsource-variable/inter @fontsource-variable/source-serif-4`;
in `main.tsx` import `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4` and
`@fontsource-variable/source-serif-4/wght-italic.css` before `./styles.css`.

- [ ] **Step 4: Restyle `styles.css`.** Header comment: "a crisp, monochrome page; fonts bundled
(no third-party requests)". Tokens:

| Token | Light | Dark |
| --- | --- | --- |
| `--paper` | `#ededed` | `#1a1a1a` |
| `--page` | `#ffffff` | `#222222` |
| `--ink` | `#1f1f1f` | `#ececec` |
| `--ink-soft` | `#8a8a8a` | `#7a7a7a` |
| `--rule` | `#e0e0e0` | `#2e2e2e` |
| `--chip` (new, hover/selected) | `#e2e2e2` | `#2c2c2c` |
| `--accent` | `var(--ink)` | `var(--ink)` |
| `--accent-ink` | `var(--page)` | `var(--page)` |
| `--danger` | `#a23b2a` | `#e08a7a` |
| `--shadow` (popovers only) | `0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 8%)` | `0 1px 2px rgb(0 0 0 / 40%), 0 8px 24px rgb(0 0 0 / 35%)` |
| `--radius` | `6px` | |
| `--font-body` | `'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | |
| `--font-serif` | `'Source Serif 4 Variable', 'Iowan Old Style', Georgia, serif` | |

Then:
- Chrome headings move to the sans: `h1, h2, h3`, `.brand`, `.week-number`, `.month-header`,
  `.splash` and the other `font-family: var(--font-serif)` rules outside `.editor` use
  `var(--font-body)` (weight 600). `.editor .cm-content` and `.page-content` use `var(--font-serif)`
  (`.page-content` drops `--font-mono`); editor headings `.cm-h*` stay serif.
- `.page` and `.auth-card`: `border: 1px solid var(--rule)`, `box-shadow: none`. `.month-calendar`,
  `.palette`, the settings dialog and the slash menu keep `var(--shadow)`.
- Hover/selected backgrounds that used `var(--rule)` (`.icon:hover`, `.week-day:hover`,
  `.week-day[aria-current='date']`, month cells, palette selection) use `var(--chip)`.
- `.week-day[data-today]` and month `[data-today]`: `color: var(--ink); font-weight: 700` (no
  accent colour). Selection background: `color-mix(in srgb, var(--ink) 15%, transparent)`.
  `.cm-link`: `color: var(--ink); text-decoration: underline`.
- `.palette-backdrop`: `rgb(0 0 0 / 25%)`.

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm e2e --project chromium e2e/smoke.spec.ts`
Expected: PASS.

- [ ] **Step 6: Look at it.** `pnpm dev`, sign in, check planner, settings, month calendar,
palette, template editor, sign-in page, in light and dark (DevTools → Rendering → prefers-color-scheme).
No blue left: `grep -n '#3d5a80\|#8fb0d8' apps/web/src` → no matches.

- [ ] **Step 7: Write ADR 0013** (`docs/adr/0013-theme-and-fonts.md`, format of 0012): context
(scrivi.la-like focus, mockups A/B/C, C chosen), decision (monochrome tokens, Inter + Source
Serif 4 via `@fontsource-variable`, SIL OFL 1.1, licence files ship in the packages, replaces the
"system fonts only" rule with "no third-party requests"; focus mode summary and why it ends on
real mouse movement), consequences (≈ bundle size of the woff2 files, measured from `pnpm build`
output). Add the line to `docs/adr/README.md`. Add `.superpowers/` to `.gitignore`.

- [ ] **Step 8: Verify and commit**

Run: `pnpm check && docker build -t agendina:local . && scripts/docker-smoke-test.sh`
Expected: all pass.

```bash
git add .gitignore apps/web/package.json pnpm-lock.yaml apps/web/src/main.tsx apps/web/src/styles.css \
  docs/adr/0013-theme-and-fonts.md docs/adr/README.md e2e/smoke.spec.ts
git commit -m "feat(web): monochrome crisp theme with bundled Inter and Source Serif"
```

---

### Task 2: Icon buttons

**Files:**
- Create: `apps/web/src/app/icons.tsx`
- Modify: `apps/web/src/planner/PlannerPage.tsx:104-123` (Settings, Sign out)
- Modify: `apps/web/src/planner/WeekStrip.tsx` (‹ › → chevrons)
- Modify: `apps/web/src/planner/MonthPicker.tsx` (its text arrows, if any, → chevrons; keep its
  existing SVG calendar icon or swap to `CalendarIcon` for consistency)
- Modify: `apps/web/src/styles.css` (`.topbar-actions` gap ~0.25rem; `.icon` 30×30 grid-centred)
- Test: `apps/web/src/planner/planner.test.tsx`

**Interfaces:**
- Produces: `SettingsIcon`, `SignOutIcon`, `ChevronLeftIcon`, `ChevronRightIcon`,
  `CalendarIcon` — each `() => JSX.Element`, an `<svg viewBox="0 0 24 24" width="18" height="18"
  aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
  stroke-linejoin="round">`. Artwork: the gear, door-with-arrow and calendar from the mockup
  (`.superpowers/brainstorm/*/content/theme-directions.html`).
- Buttons use `className="icon"`, `aria-label` and `title` with the same text.

- [ ] **Step 1: Write the failing test** in `planner.test.tsx` (inside the existing per-database
`describe`, using `renderApp`):

```ts
it('shows the top bar actions as labelled icons', async () => {
  renderApp(server, '/day/2026-10-26')
  for (const name of ['Settings', 'Sign out', 'Previous week', 'Next week']) {
    const button = await screen.findByRole('button', { name })
    expect(button).toHaveAttribute('title', name)
    expect(button).not.toHaveTextContent(/\S/)
    expect(button.querySelector('svg')).not.toBeNull()
  }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run --project web apps/web/src/planner/planner.test.tsx -t "labelled icons"`
Expected: FAIL: Settings has text content / no `title`.

- [ ] **Step 3: Implement** `icons.tsx` and use it in `PlannerPage` and `WeekStrip` as above.

- [ ] **Step 4: Run it to see it pass**, then `pnpm vitest run --project web` (the settings and
sign-out tests find the buttons by the same names). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/icons.tsx apps/web/src/planner apps/web/src/styles.css
git commit -m "feat(web): icon buttons for settings, sign out and week navigation"
```

---

### Task 3: Focus mode state

**Files:**
- Create: `apps/web/src/planner/useFocusMode.ts`
- Modify: `apps/web/src/planner/PlannerPage.tsx` (call the hook, set the attribute)
- Test: `apps/web/src/planner/focusMode.test.tsx`

**Interfaces:**
- Produces: `useFocusMode(enabled: boolean): boolean` and `<div className="planner"
  data-focus-mode={focusMode || undefined}>`. Task 4's CSS keys off `.planner[data-focus-mode]`.
- `PlannerPage` passes `enabled = !paletteOpen && !settingsOpen`.

Rules (all listeners on `document`, removed on unmount):
- `keydown` (bubble phase): if `event.key === 'Escape'` and `!event.defaultPrevented` → off
  (CodeMirror marks keys it handled, e.g. Escape closing the slash menu, as `defaultPrevented`).
  Otherwise, if the event target is inside a `.cm-content` → on. Any key counts (letters, arrows,
  Shift, Enter, Backspace).
- `mousemove`: compare `screenX/screenY` with the last seen position (kept across on/off); off
  only if a previous position exists and the distance is more than `3` px; always store the new
  position.
- `pointerdown` → off.
- `focusin` whose target is not inside a `.cm-content` → off.
- `enabled` false → off (and stays off while false).

- [ ] **Step 1: Write the failing tests** in `focusMode.test.tsx` (`describe.each(testDatabases())`
like the other app tests; `renderApp(server, '/day/2026-10-26')`; get the day editor with
`await screen.findByRole('textbox', { name: /26 October 2026/ })`, focus it with `placeCursor`;
`const planner = () => container.querySelector('.planner')`):

```ts
it('starts when a key is pressed in a page', ...)          // fireEvent.keyDown(editor, { key: 'a' }) → planner has data-focus-mode
it('starts on arrow keys too', ...)                        // { key: 'ArrowDown' } → on
it('does not start on keys outside a page', ...)           // fireEvent.keyDown(document.body, { key: 'a' }) → off
it('ends when the mouse moves', ...)                       // on; mouseMove(document,{screenX:100,screenY:100}); mouseMove(...{screenX:120,screenY:100}) → off
it('ignores mouse events that do not move the pointer', ...) // on; mouseMove at (100,100) twice → still on
it('ends on pointer down', ...)                            // on; fireEvent.pointerDown(document.body) → off
it('ends when keyboard focus leaves the editor', ...)      // on; act(() => settingsButton.focus()) → off
it('ends on Escape and keeps the cursor in the page', ...) // on; keyDown(editor,{key:'Escape'}) → off; document.activeElement inside editor
it('stays off after ending until the next key', ...)       // on; move mouse → off; mouse again → off; key → on
it('ends when the command palette opens', ...)             // on; press the palette shortcut (meta+k on 'mac') → off while open
it('starts in the template editor too', ...)               // click "Edit day template", key in its editor → on
```

Each asserts with `expect(planner()).toHaveAttribute('data-focus-mode')` / `.not.toHaveAttribute(...)`.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run --project web apps/web/src/planner/focusMode.test.tsx`
Expected: the "starts…" tests FAIL (no attribute); "does not start…" passes trivially.

- [ ] **Step 3: Implement** `useFocusMode` with the rules above and wire it into `PlannerPage`.

- [ ] **Step 4: Run them to see them pass**; then prove the scroll guard: temporarily make
`mousemove` end focus mode unconditionally, see "ignores mouse events that do not move the
pointer" fail, restore. Expected: all PASS after restoring.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/planner/useFocusMode.ts apps/web/src/planner/PlannerPage.tsx apps/web/src/planner/focusMode.test.tsx
git commit -m "feat(web): focus mode starts on keys in a page and ends on mouse, tap or leaving"
```

---

### Task 4: Focus mode look, and the journey

**Files:**
- Modify: `apps/web/src/styles.css` (new "Focus mode" section)
- Create: `e2e/focus.spec.ts`

**Interfaces:**
- Consumes: `.planner[data-focus-mode]` (Task 3), tokens (Task 1).

CSS (exact values):
- `.topbar, .page, .save-status, .topbar button, .page button` get
  `transition: opacity 0.5s, filter 0.5s`; inside `@media (prefers-reduced-motion: reduce)`
  `transition: none`.
- `.planner[data-focus-mode] .topbar` → `opacity: 0.35; filter: grayscale(1)`.
- `.planner[data-focus-mode] .page:not(:focus-within):not(:has([role='alert'], .conflict,
  .save-status[data-status='offline'], .save-status[data-status='conflict']))` →
  `opacity: 0.35; filter: grayscale(1)`.
- `.planner[data-focus-mode] :is(.topbar, .page) button:not(.template-editor button, .conflict button)`
  → `opacity: 0; pointer-events: none`.
- `.planner[data-focus-mode] .save-status:not([data-status='offline'], [data-status='conflict'])`
  → `opacity: 0`.

- [ ] **Step 1: Write the failing e2e journey** `e2e/focus.spec.ts` (use `enter(page)` from
`./helpers.ts`; a day far from other journeys, e.g. `2026-12-08`; `toHaveCSS` retries through the
transition):

```ts
test('focus mode dims everything but the page you are working in', async ({ page }) => {
  await enter(page)
  await page.goto('/day/2026-12-08')
  const day = page.getByRole('textbox', { name: /8 December 2026|December 8, 2026/ })
  const settings = page.getByRole('button', { name: 'Settings' })
  const week = page.locator('.page', { has: page.getByRole('textbox', { name: /^Week / }) })

  await test.step('typing hides the buttons and dims the rest', async () => {
    await day.click()
    await page.keyboard.type('Morning pages')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(week).toHaveCSS('opacity', '0.35')
    await expect(page.locator('.page', { has: day })).toHaveCSS('opacity', '1')
  })
  await test.step('moving the mouse brings them back', async () => {
    await page.mouse.move(10, 10)
    await page.mouse.move(200, 200)
    await expect(settings).toHaveCSS('opacity', '1')
    await expect(week).toHaveCSS('opacity', '1')
  })
  await test.step('Escape closes the slash menu first', async () => {
    await day.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' /')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden()
    await expect(settings).toHaveCSS('opacity', '0')
    await page.keyboard.press('Escape')
    await expect(settings).toHaveCSS('opacity', '1')
  })
  await test.step('Tab out of the editor reveals the button it lands on', async () => {
    await day.click()
    await page.keyboard.press('ArrowLeft')
    await expect(settings).toHaveCSS('opacity', '0')
    await settings.focus()
    await expect(settings).toHaveCSS('opacity', '1')
  })
  await test.step('the template editor keeps Save and Cancel visible', async () => {
    await page.mouse.move(300, 300)
    await page.locator('.page', { has: day }).getByRole('button', { name: /Edit day template/ }).click()
    const template = page.getByRole('textbox', { name: /template/i })
    await template.click()
    await page.keyboard.type('x')
    await expect(settings).toHaveCSS('opacity', '0')
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })
  await test.step('offline status stays visible', async () => {
    await page.route('**/api/notes/**', (route) =>
      route.request().method() === 'GET' ? route.continue() : route.abort(),
    )
    await day.click()
    await page.keyboard.type(' later')
    const status = page.locator('.page', { has: day }).locator('.save-status')
    await expect(status).toHaveAttribute('data-status', 'offline')
    await expect(status).toHaveCSS('opacity', '1')
  })
})
```

Adjust the textbox names to the ones the app really renders (see `e2e/editor.spec.ts`), the API
path to the real notes route, and the slash-menu role to what CodeMirror's autocomplete exposes
(`listbox`), without weakening what each step asserts.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm e2e --project chromium e2e/focus.spec.ts`
Expected: FAIL at the first `toHaveCSS('opacity', '0')`.

- [ ] **Step 3: Add the CSS** above to `styles.css`.

- [ ] **Step 4: Run it to see it pass in all browsers**

Run: `pnpm e2e e2e/focus.spec.ts`
Expected: PASS on chromium, firefox, webkit.

- [ ] **Step 5: Look at it** with `pnpm dev`: type in the day page, watch the fade; open the
template editor, type, check Save/Cancel stay; turn on reduce motion and check the change is
instant.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm check && pnpm e2e`
Expected: all pass.

```bash
git add apps/web/src/styles.css e2e/focus.spec.ts
git commit -m "feat(web): focus mode fades the chrome and other pages, keeps problems visible"
```
