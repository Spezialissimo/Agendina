# Daily-use feedback

Complaints and wishes from using the MVP day to day. Write them down as they happen, rough is
fine; we triage them later into fixes, plan items (`docs/plan.md`) or "won't do".

One line per item is enough. Optional tags: `bug`, `annoying`, `missing`, `idea`, plus where it
happened (`editor`, `week strip`, `focus mode`, `mobile`, …).

## Inbox

## Triaged

<!-- Moved here from the inbox once decided, with the outcome:
- [fix] … (PR #)
- [plan] … (added to docs/plan.md)
- [won't do] … — reason
-->

### 2026-11-06

- [fix] Day name follows the browser language (Italian in an English UI). Day pages get a header
  like week pages: "Friday" as the title, "Nov 6, 2026" below in the subtitle style. All dates
  (titles, week strip, month picker, week range) are formatted in English, set in one place so a
  language setting can replace it later.
- [fix] Page titles (date, week number) use the notes' serif font, not the UI sans.
- [fix] Shortcuts don't move keyboard focus. After a day/week shortcut the cursor lands in the
  new page's editor where it was last left. Positions (and selections) are kept per device in
  local storage for the last 3 day pages and the last 3 week pages; otherwise the cursor goes to
  the end of the page, clamped if the text changed. A week shortcut keeps focus on the side you
  were typing in; when no editor had focus, the day page gets it.
- [fix] On a to-do line the "- " stays hidden while the cursor is on the line; it shows only when
  the cursor is right next to it, like the checkbox brackets.
- [fix] Tab: nests/un-nests list items and to-dos (Shift+Tab), moves between cells in tables,
  does nothing elsewhere (no accidental code blocks) and no longer leaves the editor; Esc then
  Tab still does.
- [fix] On mobile, tapping a checkbox raises the keyboard. Ticking must not focus the editor.
- [fix] No updates across devices while both are open. While the tab is visible, poll the
  `/changes` feed every 5 s and reload only the changed pages; a clean page updates in place
  (cursor kept), unsaved typing merges on the next save as today. Polling, not websockets, for
  now.
- [fix] Quick font size: an "Aa" button in the page header cycling Small / Medium (today) /
  Large, plus a palette entry. Separate sizes for the week page and the day page, per device.
  Scales the page text and titles, not the rest of the UI.
- [fix] Settings feel disorganized: section titles are faint uppercase captions with a stray left
  offset (default legend padding, checkbox margins). Make them real headings, align everything
  on the left, more space between sections than within.
- [fix] "Edit template" is used rarely: move it from the page headers to a "Templates" section in
  Settings ("Edit day template", "Edit week template") plus palette entries. Clicking closes
  Settings and opens the existing in-place template editor on the current page.
- [plan] Show the shortcuts: comes with the shortcut editor (`docs/plan.md`).
- [plan] Mobile version asap: next design session (journal scroll + PWA per `docs/plan.md`).
- [plan] Tables stay tables while editing: needs a design; answer it with a throwaway prototype
  after the mobile design.
