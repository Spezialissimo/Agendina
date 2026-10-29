# Developer guide

How we keep developing Agendina with Claude Code. `CLAUDE.md` holds the rules every session must
follow; this guide is the process around them: how to pick work, how big a session should be,
when to plan, and how to review what comes out. The roadmap lives in [plan.md](plan.md),
decisions in [adr/](adr/).

## The core idea

Quality comes from separating **deciding what to build** from **building it**, and from keeping
each piece of work small enough to review properly. Claude writes good code when the spec is
clear and the context is clean; most bad results trace back to a vague request or a long session
that drifted across topics.

## Where to start: daily use

The MVP is done, and the next step in the plan is to use it. Keep a plain list of every friction
and bug you hit while journaling (in `docs/plan.md` or the issue tracker). Those items are small,
well-defined and exactly what Claude does best, and they are the best evidence for reordering
the post-MVP roadmap: if writing on the phone hurts every day, the mobile view comes before the
shortcut editor.

## One session, one PR

- Start every topic with a fresh context (`/clear` or a new session). It then works from
  `CLAUDE.md`, the plan and the code, not from a long conversation about something else.
- One topic per PR, branched from `main`, no stacked PRs. A CI fix found on the way gets its own
  PR. You merge.
- If a session starts going in circles, stop: `/clear`, then restate the task with what you
  learned. A fresh start with a better prompt beats repeated corrections.

## Match the process to the size of the work

| Size   | Examples                                      | Process                                     |
| ------ | --------------------------------------------- | ------------------------------------------- |
| Small  | bugs and polish from daily use                | Describe it; failing test first; fix        |
| Medium | shortcut editor, layout presets               | Plan mode; review plan and tests; implement |
| Large  | mobile + PWA, offline sync, entitlements, E2E | Design session → spec + ADR; then PR by PR  |

**Small.** No plan mode. Describe the behaviour you saw and the behaviour you want. Claude
reproduces it with a failing test, fixes it, runs `pnpm check`.

**Medium.** Use plan mode (shift+tab). Ask for acceptance criteria, the files it will touch and
the split into PRs. Push back on the plan before approving it: this is the cheapest moment to
change direction. Then review the failing tests before any implementation (`CLAUDE.md`, "How we
work"). Reading tests is the fastest way to check that Claude understood the spec, and much
cheaper than reviewing an implementation built on a misunderstanding.

**Large.** Not a single plan-mode session. First a design session whose only output is a written
spec in `docs/` (acceptance criteria, data formats, protocol, migration path, PR breakdown) and
an ADR for each new architectural choice. Nothing gets built in it. Then one session per PR, each
pointing at the spec ("implement PR 2 of `docs/offline-sync.md`"). Update the spec when reality
disagrees with it, in the PR that discovers it.

## Features that must be designed together

**Offline sync and E2E encryption.** They are far apart in the roadmap but constrain each other.
Once notes are encrypted the server cannot read them, so it cannot merge them: merging must
happen on the client. That is exactly what offline sync with client-side merge introduces. Write
one ADR covering both before starting offline sync, so the sync protocol (revisions, change
feed, conflict handling, what metadata the server may see) already works with ciphertext. The
guardrail "no server feature may depend on reading note content" exists for this reason.

**Entitlements and hosting.** The freemium plans touch auth, settings and the hosted deployment
(ADR 0006, ADR 0012); design them as one spec. Remember the license decision before a public
launch.

## Before opening a PR

1. `pnpm check` passes, and `pnpm e2e` for UI or server changes.
2. Run `/code-review` on the diff, ideally in a fresh session, so the review is not anchored on
   the reasoning of the session that wrote the code.
3. Read the diff yourself. Look for weakened or deleted tests, behaviour not covered by a test,
   and changes outside the PR's topic.
4. For new guards (security, validation, concurrency), check that the PR says the test was seen
   failing with the guard removed.

## Keeping Claude's instructions sharp

- **Correct twice, write it down.** When you correct Claude the same way twice, add the rule to
  `CLAUDE.md`. Most rules there (`useCurrentDay`, the user-event quirks, warming the Postgres pool)
  came from this, and they are why the later phases went smoothly.
- Keep `CLAUDE.md` short and about rules, not history. Anything Claude can read from the code
  does not belong there; pointers to the right docs do.
- Personal preferences (how you like to be asked questions, PR habits) go in Claude's memory, not
  in the repository.
- New library, data format or protocol: an ADR, written in the same PR.
- Keep `docs/plan.md` current: mark phases done with their PR numbers and record the next step,
  so a fresh session knows where the project stands.

## Prompting

- State the outcome and the acceptance criteria, not the implementation. "Ticking a box on the
  week page while offline survives a reload" is better than "add a queue to the autosave hook".
- Name the relevant files or docs when you know them; it saves exploration and keeps context
  clean.
- Ask for options only when the choice is genuinely yours (product, UX, cost). For engineering
  defaults, let Claude pick and explain.
- Say what is out of scope. Claude tends to fix what it notices on the way; one topic per PR
  means those findings become a note for later, not part of the diff.

## Parallel work

- Independent small fixes can run as background sessions, each in its own worktree and PR from
  `main`.
- Do not run two features in parallel that touch the same area (the editor, sync, templates):
  the merge cost eats the gain.
- Multi-agent workflows are worth it for broad, read-heavy work (an audit, a review across many
  files), not for implementing a feature.

## Effort and models

Use high effort for design sessions, tricky bugs and anything in `packages/core` (merge, date
math, sync). Routine changes, docs and small fixes do not need it.
