# Feedback round — lifecycle, hold, offboarding, help: plan

**Status:** PR #214 open, waiting for CI and review — see [Progress](#progress) (last updated 2026-11-10)
**Spec:** `docs/plans/feedback-round-lifecycle-spec.md` — requirements, contracts, copy, decisions. This file is only the task breakdown.
**Branch / PR:** `feat/feedback-round-lifecycle` → one PR into `develop`. Tasks = commits.

## Progress

Last updated 2026-11-10. `[x]` = done, `[~]` = in progress, `[ ]` = not started. Everything is committed and pushed on `feat/feedback-round-lifecycle`.

### Tasks

| | Task | Wave | State |
|---|---|---|---|
| [x] | T0 — `Project.onHoldSince` migration | 0 | Done, reviewed |
| [x] | B1 — Project lifecycle writes (cancel cascade, hold, date shift) | 1 | Done, reviewed |
| [x] | B2 — On-hold read rule + Pipeline Hold idle fix | 1 | Done, reviewed |
| [x] | B3 — Offboarding API | 1 | Done, reviewed |
| [x] | B4 — "All tasks are closed" event | 2 | Done, reviewed |
| [x] | F1 — Projects status filter | 2 | Done, reviewed |
| [x] | F2 — Lifecycle UI (cancel and reactivation dialogs, overdue rule) | 2 | Done, reviewed |
| [x] | F3 — Event and notification text | 3 | Done, reviewed |
| [x] | F4 — Handover modal | 3 | Done, reviewed, review fixes applied |
| [x] | F5 — "How to use Solvro" Help page | 4 | Done; unit tests, typecheck and help spec pass. Not yet looked at in a browser; waits for the phase review |
| [x] | E1 — End-to-end coverage | 4 | Done; 38 runs pass on the dev stack (desktop + mobile), no product bugs found. Waits for the phase review |

### Phase close

| | Step | State |
|---|---|---|
| [x] | Changelog entries for waves 1–4 | In `CHANGELOG.md` under `[Unreleased]` |
| [x] | Gates, waves 1–3 | All pass except the smoke test's console-error check, which fails only on the dev stack (its Google sign-in setting rejects `localhost`; not caused by this branch) |
| [x] | Full end-to-end suite | Ran against a throwaway stack (existing dev images, empty `solvro_e2e` database, port 5199, no Google sign-in): 329 passed, 113 skipped, 6 passed on retry (existing drag-and-drop and iTop specs), 6 failed. All 6 failures are in `pwa.spec.ts` and `security-headers.spec.ts`, which need the built frontend behind nginx and cannot pass on a dev server; CI on the PR covers them. Every new spec passed first time |
| [x] | Gates, wave 4 (smoke pointed at the throwaway stack) | All gates pass, smoke included |
| [x] | Help page screenshots (desktop and 375px) | Taken in the phase review; no overflow at 375px, light and dark render correctly |
| [x] | Phase review on the combined diff | No blockers. Three should-fix items, all in the Help page (topic list taller than the screen on desktop; two sentences that overstate who is notified), plus small nits. The Gantt and list drag tests that passed only on retry were judged unrelated: the Gantt changes are display-only |
| [x] | Fixes from the phase review | All done: Help page (5 items), handover cache refresh, end-to-end spec tidy-ups, one changelog sentence |
| [x] | Deferred findings filed in `docs/ISSUES.md` | 14 findings filed under "Project lifecycle and handover — deferred findings (2026-11-10)". Changelog checked, no edits needed |
| [x] | Commits, rebase check against `origin/develop` | Five commits (API, Help page, frontend, end-to-end tests, docs) — grouped by area because several files are shared between tasks. The branch base was level with `origin/develop` |
| [x] | Push and one PR into `develop`, assigned | PR #214. Final gate run: all pass; new and changed end-to-end specs: 54 runs pass without retries |
| [x] | Throwaway stack and `solvro_e2e` database removed | Also removed the per-task test databases |
| [x] | CI green on PR #214 | Typecheck, backend tests and all four desktop e2e shards passed on the first push, including `pwa.spec.ts` and `security-headers.spec.ts`. CI runs desktop only; mobile rests on local runs |
| [x] | Follow-up: a handover also notifies people who receive only epics | Added after review feedback; gates pass, offboarding and help specs pass (24 runs) |
| [ ] | Decision: notify a new customer owner | Needs a customer scope on notifications (a migration); waiting for a decision — see `docs/ISSUES.md` |
| [ ] | Decision: export guardrail path fix | Edit prepared on branch `chore/export-guardrail-path`, not committed; waiting for a go-ahead on a separate PR or folding it into #214 |

### Notes

- The built CI stack could not be used locally: building its images filled the disk. The build was torn down and the Docker build cache cleared (about 2 GB free afterwards). Roughly 6.4 GB is held by images no running container uses (an older Openship set, a Playwright image); they were left alone.
- **Needs a decision from the project owner (not applied):** root `CLAUDE.md` Guardrails and the spine list cite `frontend/src/lib/export/`, which no longer exists — exports live in `frontend/src/lib/gantt/export*.ts`. The `gates.sh` spine pattern and its INTERNAL-notes check point at the old path too, so the Gantt exports are currently outside both. Proposed: point all three at `frontend/src/lib/gantt/export*.ts`.
- Known coverage gaps in the end-to-end tests: the Pipeline PIC and SA parts of the handover dialog, and hold lengths longer than a day.

## Overview

Eleven tasks in five waves. The interactive session orchestrates only: it dispatches `solvro-implementor` agents, runs `gates.sh`, calls reviews, appends `CHANGELOG.md`, and stages. It writes no feature code.

## Architecture decisions

- **Shared working tree, disjoint file ownership — no worktrees.** Checks run inside the Docker stack, which mounts the main checkout only, so a worktree's code can't be typechecked or tested. Each task below lists the files it owns; an implementor that needs a file outside its list stops and reports.
- **One schema writer, alone.** T0 runs by itself: it migrates, regenerates the client, and restarts the backend, which would kill any other agent's test run.
- **One `frontend/src/lib/queries.ts` owner per wave** (F2 in wave 2, F4 in wave 3).
- **Backend tests: one database per task.** Concurrent vitest runs on `solvro_test` truncate each other. Each backend implementor uses `solvro_<task>_test` (e.g. `solvro_b1_test`): create it with `docker compose exec -T postgres createdb -U solvro <name>` if missing, then run only the test files it touched with `DATABASE_URL` pointing at it. The name must end in `_test`.
- **Frontend typecheck is serial.** Take `/tmp/tsc.lock` inside the frontend container (`mkdir`-style lock, poll until free, remove in a trap) around every `npm run typecheck`.
- **E2E is its own task at the end** (plus `help.spec.ts` with F5), against the finished UI.

## Dependency graph

```
T0 schema ──┬─► B1 project lifecycle ──┐
            │                          ├─► F2 lifecycle UI ──┐
            ├─► B2 on-hold rule + F4 ──┤                     │
            │        │                 │                     ├─► F5 help ──┐
            │        └─► B4 all-closed ─► F3 event text ─────┤             ├─► review ─► PR
            └─► B3 offboarding ────────► F4 handover UI ─────┘   E1 e2e ───┘
F1 status filter (no dependencies, rides wave 2)
```

## Waves

| Wave | Tasks | Spine touched → instant review |
|---|---|---|
| 0 | T0 | `schema.prisma`, migration |
| 1 | B1, B2, B3 | `routes/projects.ts`, `routes/tasks.ts`, `routes/admin.ts` |
| 2 | B4, F1, F2 | `routes/tasks.ts`, `lib/queries.ts`, `gantt-v2/` |
| 3 | F3, F4 | `lib/queries.ts` |
| 4 | F5, E1 | — |

After each wave: verify from the working tree → instant `solvro-reviewer` on each spine-touching task's diff → findings back to the same implementor → one `gates.sh --performed-review=opus` run → append the wave's CHANGELOG entries.

## Tasks

### T0 — `Project.onHoldSince` (wave 0, alone)

- Add `onHoldSince DateTime? @map("on_hold_since")` to `Project`; migration `project_on_hold_since` backfills `on_hold_since = updated_at` where `status = 'ON_HOLD'`. Restart the backend afterwards.
- **Accept:** `migrate status` clean; backend typecheck passes; existing on-hold rows are backfilled.
- **Verify:** `docker compose exec backend npx tsc --noEmit`.
- **Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/*_project_on_hold_since/`.

### B1 — Project lifecycle writes (wave 1) — spec F1, F7 write side

- Cascade on cancel; `onHoldSince` stamping on PATCH and POST; `shiftOpenDatesByDays`; `GET /projects/:id/lifecycle-preview`; serialise `onHoldSince`. Put the logic in a new `backend/src/lib/projectLifecycle.ts`; keep the route thin.
- **Accept:** spec F1 and F7 (hold timestamp, reactivation) accept lines.
- **Verify:** backend typecheck; new `backend/test/projectLifecycle.test.ts` (cascade counts, DONE untouched, atomic rollback, stamp/clear, shift exactness, `shift_requires_reactivation`, preview numbers, 403/404).
- **Files:** `backend/src/routes/projects.ts`, `backend/src/lib/projectLifecycle.ts`, its test.

### B2 — On-hold read rule + Hold idle (wave 1) — spec F7 read side, F4

- Shared fragment in `lib/taskStatus.ts`; apply at every site in the spec table; `workCounts.onHoldExcluded`; `computeIdle` HOLD rule.
- **Accept:** spec F7 read-rule and F4 accept lines.
- **Verify:** backend typecheck; extend `overviewWorkCounts`, `portfolioOverdue`, `projectHealth`, `customersHealth`, `tasksOverdue`, `pipelineSla` tests.
- **Files:** `backend/src/lib/taskStatus.ts`, `lib/portfolio.ts`, `lib/projectHealth.ts`, `lib/pipelineSla.ts`, `routes/overview.ts`, `routes/customers.ts`, `routes/dailyReview.ts`, `routes/tasks.ts` (the list `overdue` filter only), those tests.

### B3 — Offboarding API (wave 1) — spec F5

- Preview and offboard endpoints, the 409 guard on deactivate, new notification reason `tasks_handed_over`. Logic in a new `backend/src/lib/offboarding.ts`.
- **Accept:** spec F5 accept lines (backend).
- **Verify:** backend typecheck; new `backend/test/offboarding.test.ts` (preview shape, `handover_incomplete`, `tam_required`, inactive/self targets, INTERNAL note, SA replace/clear, epic owner, customer owner, deal PIC incl. an ineligible receiver, single-transaction rollback, one notification per receiver per project, 409 guard, non-admin 403).
- **Files:** `backend/src/routes/admin.ts`, `backend/src/lib/offboarding.ts`, `backend/src/lib/notifications.ts`, its test. Customer and opportunity routes are read-only references — reuse their exported helpers; if one must be exported or extracted to be reused, stop and report rather than edit those files.

### B4 — "All tasks are closed" event (wave 2, after B2 and B3) — spec F3

- Helper + call sites in every task-status write; `lockProject` first when a write closes a task; new action and reason.
- **Accept:** spec F3 accept lines (backend), including the concurrency case.
- **Verify:** backend typecheck; new `backend/test/allTasksClosed.test.ts`; `notifications.test.ts` still green.
- **Files:** `backend/src/routes/tasks.ts`, `backend/src/lib/activity.ts`, `backend/src/lib/notifications.ts`, new `backend/src/lib/allTasksClosed.ts`, tests.

### F1 — Projects status filter (wave 2, no dependencies) — spec F2

- **Accept:** spec F2 accept lines.
- **Verify:** frontend typecheck (locked); unit test for the URL parse/serialise helper.
- **Files:** `frontend/src/pages/Projects.tsx`, a small helper + test under `frontend/src/lib/`.

### F2 — Lifecycle UI (wave 2, after B1 and B2) — spec F1 and F7 frontend

- Cancel confirm and reactivation dialog in one shared hook/component used by every project-status edit site; Overdue tile hint; shared client overdue helper applied to Tasks, Kanban cards, Gantt; types and hooks in `queries.ts` (`onHoldSince`, `onHoldExcluded`, `useProjectLifecyclePreview`, `shiftOpenDatesByDays` on the update input).
- **Accept:** spec F1 and F7 accept lines (frontend); 375px and both themes.
- **Verify:** frontend typecheck (locked); vitest for the overdue helper and dialog decision logic.
- **Files:** `frontend/src/lib/queries.ts`, `components/ProjectFormModal.tsx`, new `components/project/ProjectStatusChangeDialogs.tsx`, `pages/Overview.tsx`, `pages/Tasks.tsx`, `components/kanban-v2/cards.tsx`, `components/gantt-v2/TreeCells.tsx`, `components/gantt-v2/SolvroGantt.tsx`, any other caller of `useUpdateProject` that sends `status`, a helper + test under `lib/`.

### F3 — Event and notification text (wave 3, after B1, B3, B4)

- Sentences and links for `all_tasks_closed`, `tasks_handed_over`, and the project-event changes `cancelledTasks`, `shiftedDays`/`shiftedTasks`, `handover`.
- **Accept:** each new event renders the spec's sentence in the notification list and project activity; unknown shapes still fall back safely.
- **Verify:** frontend typecheck (locked); extend `notificationText` and `activityText` tests.
- **Files:** `frontend/src/lib/notificationText.ts`, `lib/activityText.ts`, their tests.

### F4 — Handover modal (wave 3, after B3) — spec F5 frontend

- **Accept:** spec F5 accept lines (frontend); 375px and both themes.
- **Verify:** frontend typecheck (locked); vitest for the form-validity logic.
- **Files:** `frontend/src/lib/queries.ts` (admin hooks), `pages/Admin.tsx`, new `components/admin/HandoverModal.tsx`, test.

### F5 — "How to use Solvro" (wave 4, after every UI task) — spec F6

- **Accept:** spec F6 accept lines; every quoted label checked against the code as merged in this branch.
- **Verify:** frontend typecheck (locked); `helpContent` unit tests; `e2e/tests/help.spec.ts` updated.
- **Files:** `frontend/src/lib/helpContent.ts`, its test, `pages/Help.tsx`, `e2e/tests/help.spec.ts`.

### E1 — End-to-end coverage (wave 4)

- New self-contained specs (own data via `e2e/fixtures/`, no reliance on other spec files): `project-lifecycle.spec.ts` (cancel cascade; hold → Overview hint → reactivate with shift), `projects-status-filter.spec.ts`, `offboarding.spec.ts`, and an all-tasks-closed case in `notifications.spec.ts`.
- **Accept:** specs pass on desktop and mobile projects; no existing spec changes behaviour.
- **Verify:** `cd e2e && npm test -- <the files> --trace off`.
- **Files:** `e2e/tests/` (those files), `e2e/fixtures/` additions only.

## Checkpoints

1. After wave 1 — backend contracts frozen; frontend tasks build against them.
2. After wave 3 — all behaviour in; run the full e2e suite once before wave 4.
3. Phase close — `gates.sh` green → one `solvro-reviewer` phase review on the combined diff (design lens on) → fixes to the owning implementors → docs-keeper if triggered (deferred findings → `docs/ISSUES.md`) → CHANGELOG complete → commit per task, push, open the PR into `develop` and assign it (pre-approved, spec §6 D4) → `TaskStop` every agent.

## Every implementor's brief includes

Its task block and the matching spec section; its file list as a hard boundary; "wave member: do not edit `CHANGELOG.md`, report the entry text"; the test-database and tsc-lock rules above; no git writes; no new dependencies; final action is the report.
