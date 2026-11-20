# Feedback round — lifecycle, hold, offboarding, help: spec

**Status:** approved design, ready to build (2026-11-10)
**Branch:** `feat/feedback-round-lifecycle` (off `origin/develop`) — one PR into `develop`
**Plan:** `docs/archive/plans/feedback-round-lifecycle-plan.md`
**Visual source:** Doop canvas `RRWCRKA9N7`, page "Feedback round — lifecycle, hold, offboarding, help" (frames: index `dYT7YSwFPx`, F2 `TuDZ9AkBm2`, F4 `Y0ch7rkgqK`, F1 `lMfRG5wSMW`, F7 `VjlsqsKuWi`, F3 `wSFv6w_7az`, F5 `VXyRaKS4ih`, F6 `RdIwK_3LIB`). Where a mockup and this spec disagree on behaviour or copy, this spec wins; `docs/DESIGN.md` wins on visuals.

Code comments that cite this document use `docs/archive/plans/feedback-round-lifecycle-spec.md`.

## 1. Objective

Seven pieces of user feedback, shipped together:

| # | Feedback | Outcome |
|---|---|---|
| F1 | Cancelling a project should cancel its tasks | Cascade open tasks to Cancelled, after a confirmation |
| F2 | Projects page filters by customer only | Add a Status filter |
| F3 | Nudge to complete a project when all tasks are closed | In-app notification |
| F4 | A deal on Hold still turns idle | Hold suppresses idle |
| F5 | Somebody leaves — what happens to their tasks | Handover step when an admin deactivates a user |
| F6 | Help should explain how to use the product | Help becomes "How to use Solvro": task-oriented guides + reference |
| F7 | On-hold projects pollute Overdue; timeline is stale on reactivation | On-hold tasks leave overdue counts; reactivation offers a date shift |

## 2. Assumptions

- No new task status and no new project status. `TaskStatus` and `ProjectStatus` enums are unchanged.
- One schema change only: `Project.onHoldSince`.
- "Open task" = status `TODO` or `IN_PROGRESS` (`OPEN_TASK_STATUS_FILTER`); "closed" = `DONE` or `CANCELLED`. Subtasks are tasks.
- No new npm dependency in any package.
- Every new control works down to 375px and in both themes.

## 3. Capability map

| # | Backend | Frontend | Schema |
|---|---|---|---|
| F1 | `PATCH /projects/:id` cascade; `GET /projects/:id/lifecycle-preview` | Confirm dialog on cancel | — |
| F2 | — | `pages/Projects.tsx` filter | — |
| F3 | Hook in task status writes; new activity action + notification reason | Notification + activity sentence | — |
| F4 | `lib/pipelineSla.ts` | — (Help text in F6) | — |
| F5 | `GET /admin/users/:id/handover-preview`, `POST /admin/users/:id/offboard`, guard on deactivate | Handover modal in Admin › Users | — |
| F6 | — | `lib/helpContent.ts`, `pages/Help.tsx` | — |
| F7 | Shared on-hold rule in every overdue query; `onHoldSince` stamping; date shift on reactivation | Overdue tile hint; client overdue styling; reactivation dialog | `Project.onHoldSince DateTime?` |

## 4. Requirements

### F4 — Hold suppresses idle (Pipeline)

- `computeIdle` (`backend/src/lib/pipelineSla.ts`) returns `{ level: "none", days: 0, basis: null }` when the deal's `statusTag` is `HOLD`. Add `statusTag` to `IdleInputDeal`.
- `DELAYED` is unchanged — a delayed deal still goes idle.
- Releasing a hold already stamps `lastActivityAt` (the PATCH does so for any change), so the idle clock restarts from the release. Add a test that pins this.
- **Accept:** a HOLD deal past every idle threshold serialises `idle.level === "none"`; the same deal with `statusTag: null` or `DELAYED` keeps its level; a deal released from hold reports 0 idle days at release time.

### F2 — Status filter on Projects

- Add a `status` field to the existing vendored `Filters` bar in `pages/Projects.tsx`, beside Customer: multi-select over the five project statuses, labels from `lib/labels.ts`.
- URL is the state: `?status=ACTIVE,ON_HOLD` (comma-separated, enum values; unknown values dropped silently), written with `{ replace: true }` like `customerId`. Combined with Customer as AND. Default: no status filter (every status shown).
- Filtering is client-side over the list `useProjects` already returns — no backend change.
- The empty state when filters match nothing names the filter and offers "Clear filters".
- **Accept:** selecting two statuses shows only those projects and survives reload and back/forward; clearing restores the full list; a customer + status combination intersects; works at 375px.

### F1 — Cancelling a project cancels its open tasks

- `PATCH /projects/:id` — when the write moves `status` from anything else to `CANCELLED`, the same transaction sets every open task of the project (subtasks included) to `CANCELLED`, applying whatever side fields a normal task cancel writes in `routes/tasks.ts` (mirror, don't diverge). `DONE` tasks are untouched. Epics are untouched.
- The project's `updated` activity event carries `cancelledTasks: <n>` in `changes` when n > 0. No per-task activity events and no notifications for the cascaded tasks.
- Reactivating a cancelled project restores nothing: tasks stay Cancelled (user decision).
- `GET /projects/:id/lifecycle-preview?today=yyyy-MM-dd` (`project:read`, `ensureProjectVisible`) returns `{ openTasks, doneTasks, cancelledTasks, onHoldSince, holdDays, pastDueOpenTasks }`. `holdDays` = whole calendar days from `onHoldSince` to `today` (null when not on hold); `pastDueOpenTasks` = open tasks with `dueDate` before `today`.
- Frontend: every place a user can set a project to Cancelled (`ProjectFormModal` and any other caller of `useUpdateProject` that sends `status`) first shows a `ConfirmModal`-style dialog when `openTasks > 0`:
  - Title: `Cancel project and its open tasks?`
  - Body: `<n> open task(s) will be marked Cancelled. <m> completed task(s) stay as they are. Reactivating the project later will not reopen them.`
  - Buttons: `Cancel project` (destructive) / `Keep project`.
  - With zero open tasks the save goes straight through.
- **Accept:** after confirming, no task in the project is `TODO`/`IN_PROGRESS`, `DONE` tasks keep their status, the project activity shows the count; the cascade and the status change commit or roll back together; a member without `project:write` still gets 403; setting ACTIVE again leaves the tasks Cancelled.

### F7 — On-hold projects

**Read rule (one definition, used everywhere):** a task in a project whose status is `ON_HOLD` is never overdue and never "due this week". Export one Prisma fragment (e.g. `TASK_PROJECT_NOT_ON_HOLD` beside `OPEN_TASK_STATUS_FILTER` in `backend/src/lib/taskStatus.ts`) and AND-compose it — never object-spread over an existing `project` key.

Sites that must apply it:

| Site | Change |
|---|---|
| `routes/overview.ts` `overdue`, `dueThisWeek` | exclude; add `workCounts.onHoldExcluded` = overdue-by-date open top-level tasks in on-hold projects, same visibility scope |
| `lib/portfolio.ts` `isOverdue` / `daysOverdue` | false / 0 for `ON_HOLD` projects |
| `lib/projectHealth.ts` `overdueCounts` | on-hold projects count 0 |
| `routes/customers.ts` health roll-up | on-hold projects contribute 0 |
| `routes/tasks.ts` `overdue` list filter | exclude |
| `routes/dailyReview.ts` | verify only (scope is ACTIVE projects); add the rule if any path can include an on-hold project |
| Frontend overdue styling (`pages/Tasks.tsx`, `kanban-v2/cards.tsx`, `gantt-v2/TreeCells.tsx`, `gantt-v2/SolvroGantt.tsx`, any other client-side `dueDate < today` check) | one shared helper that takes the project status; no overdue styling while on hold |

- Overview's Overdue tile hint, when `onHoldExcluded > 0`: `<n> in on-hold projects not counted`.

**Hold timestamp:** new column `Project.onHoldSince DateTime? @map("on_hold_since")`. `PATCH /projects/:id` sets it to now when status moves into `ON_HOLD`, clears it when status leaves `ON_HOLD`. `POST /projects` creating a project directly as `ON_HOLD` stamps it too. Migration backfills existing `ON_HOLD` rows with their `updated_at`. The field is serialised on project reads.

**Reactivation:** `PATCH /projects/:id` accepts `shiftOpenDatesByDays` (int, 1–3650). Valid only on a request that moves status from `ON_HOLD` to `ACTIVE` or `PLANNING`; otherwise 400 `shift_requires_reactivation`. In the same transaction it adds that many calendar days to `startDate` and `dueDate` of every open task (subtasks included) and of every epic that is not closed. Baseline dates, closed tasks, and dependencies are untouched. The project `updated` event carries `shiftedDays` and `shiftedTasks`.

Frontend: when a save moves an on-hold project to Active or Planning and the preview reports `pastDueOpenTasks > 0`, show a dialog before saving:

- Title: `Update the timeline?`
- Body: `This project was on hold for <holdDays> day(s). <n> open task(s) are now past due.`
- Option A (primary): `Shift open dates by [N] days` — N is a number input prefilled with `holdDays` (min 1), editable.
- Option B: `I'll update the timeline myself` — saves the status, then opens the project's Gantt view (List view on mobile, where Gantt is unavailable).
- `Cancel` leaves the project on hold.
- With no past-due open tasks the save goes straight through.

- **Accept:** a task due last week in an on-hold project is absent from every count and list above and has no overdue styling; the tile hint states how many are left out; moving the project back to Active brings the task back into the counts unless dates were shifted; a shift of N moves each open task's start and due by exactly N days, leaves DONE/CANCELLED tasks and baselines alone, and is atomic with the status change; `onHoldSince` is set on entering hold and null after leaving.

### F3 — "All tasks are closed" notification

- Trigger: a task status write that moves a task from open to closed, after which the project has zero open tasks, while the project is `ACTIVE`. Implemented as one helper called from every task-status write path in `routes/tasks.ts` (find them all — at minimum `PATCH /tasks/:id`, including any subtask/parent roll-up write).
- To make "last open task" race-free, a task write that sets a closed status takes `lockProject` first, before the task row lock (the existing lock-order rule).
- Does not fire: for a project that is not `ACTIVE`; when tasks close through project cancellation (F1); when the last open task is deleted; for a project with no tasks.
- It fires again if a task is reopened and closed again — once per open→all-closed transition.
- Records one activity event: `entityType: "project"`, new action `all_tasks_closed`, `entityLabel` = project name, `changes: { done, cancelled }`.
- Recipients: the project's TAM and every project member, filtered through `filterActiveUsersWhoCanSeeProject`. New `NotificationReason`: `all_tasks_closed`. The person who closed the last task is included when they are the TAM or a member (user decision D3) — this one reason bypasses the usual "never notify the actor" rule, through an explicit option on `notifyForEvent`, not by changing the default.
- Frontend sentence (notification and activity feed): `All tasks in <project> are closed — mark the project Completed?` Link: the project page. The project is never completed automatically.
- **Accept:** closing the last open task of an Active project creates exactly one event and one notification per recipient; closing a non-last task, closing the last task of a Planning/On-hold project, cancelling the project, and deleting the last open task create none; two concurrent closes of the last two tasks produce exactly one event.

### F5 — Offboarding handover (Admin › Users)

- The handover covers everything the leaver holds (user decision D2): open tasks, TAM seats, SA seats, epic ownership, customer ownership, and open Pipeline deals.
- `GET /admin/users/:id/handover-preview` (admin only) returns the leaver's footprint:
  - `projects[]` — every project where they have open assigned tasks, own an epic that is not closed, or hold the TAM or SA seat of a project that is not `COMPLETED`/`CANCELLED` — each `{ id, name, status, customerName, isTam, isSa, openTasks, openEpics }`;
  - `customers[]` — every customer they own (`Customer.tamId`) — each `{ id, name }`;
  - `openDeals` — count of deals still open in the Pipeline whose PIC they are.
- `POST /admin/users/:id/offboard` (admin only), body `{ projects: [{ projectId, assignTasksTo: number | null, newTamId?: number, newSaId?: number | null, note?: string }], customers: [{ customerId, newOwnerId: number | null }], dealsPicId?: number | null }`, one transaction:
  1. Recompute the preview inside the transaction; every project and customer in it must be present in the body, else 400 `handover_incomplete`.
  2. `newTamId` is required where the leaver is TAM (`tamId` is non-null), else 400 `tam_required`. `assignTasksTo` and `newTamId` must be active users other than the leaver (`assertActiveUser`), else 400.
  3. Open tasks assigned to the leaver in that project move to `assignTasksTo` (or become unassigned when null). Task status is untouched. The receiver gets access exactly the way a normal task assignment grants it (`ensureAssigneeIsMember`).
  4. TAM and SA changes go through the existing seat-change path (`diffProjectSeats` + `recordProjectUpdate`) so the new holder gets the usual seat notification. Where the leaver is SA, `newSaId` replaces them, or the seat is cleared when it is null or absent; a new SA is validated exactly as `PATCH /projects/:id` validates `saId`.
  4a. Epics the leaver owns that are not closed, in that project, go to `assignTasksTo` (owner cleared when null).
  4b. Each customer's owner becomes `newOwnerId` (cleared when null), validated and recorded the way the existing customer owner change is.
  4c. Every open deal whose PIC is the leaver gets `dealsPicId` as PIC (unassigned when null or absent, so it can be claimed). The receiver must be an active user allowed to be a PIC by the same rule the opportunity routes apply, else 400. Closed deals keep their PIC as history. The write stamps whatever a normal PIC change stamps.
  5. A non-empty `note` (max 2000 chars) creates a `ProjectNote` on that project authored by the admin, dated today, `visibility: INTERNAL` — set explicitly, never `CUSTOMER_FACING`.
  6. One project activity event per project: action `updated`, `changes: { handover: { from, to, tasks } }` (usernames and a count only — never the note body). A receiver of tasks who is not the new TAM gets one notification per project with new reason `tasks_handed_over` (`<admin> handed you <n> task(s) in <project>`), not one per task.
  7. The user is set `active: false` with the same side effects the existing deactivate path has.
  - Self-offboarding is refused exactly as self-deactivation is.
- `PATCH /admin/users/:id/deactivate` with `active: false` answers 409 `handover_required` when the preview is non-empty, so the handover cannot be bypassed through the API. Reactivation and deactivating a user with nothing to hand over are unchanged.
- Frontend: clicking Deactivate fetches the preview. Empty → today's behaviour. Otherwise a modal (`Hand over <username>'s work`) with up to three sections, each shown only when it has rows. **Projects**: per project an assignee picker for tasks and epics (active users, default `Unassigned`), a TAM picker where the leaver is TAM (required), an SA picker where the leaver is SA (default `No SA`), and an optional `Handover note (internal)` textarea; an "Apply to all" control sets the same assignee on every row. **Customers**: per customer an owner picker (default `No owner`). **Pipeline**: one PIC picker for all `<n>` open deals (default `Unassigned`), shown only to admins — every admin holds every permission, so no extra gate. The primary button `Hand over and deactivate` is disabled until every required TAM is chosen.
- **Accept:** after offboarding, the leaver has no open assigned tasks, owns no open epic or customer, is PIC of no open deal, and holds no TAM or SA seat on an open project; every note created is INTERNAL and appears in no export; the user is inactive; a failure in any project rolls the whole operation back and leaves the user active; a non-admin gets 403; direct deactivate of a user with open work answers 409.

### F6 — Help becomes "How to use Solvro"

- Route (`/help`), sidebar label, search box, permission filtering, deep-link anchors and the shortcuts tables all stay. The page heading becomes `How to use Solvro`.
- New primary section **Guides** — task-oriented walkthroughs, each `{ id, title, icon, summary, requires?, steps[{ title, points[] }], related[] }` where `related` are reference-topic ids rendered as links:
  1. Start your day — Overview, Daily Review, notifications
  2. Run a project — create, statuses (incl. hold and cancel behaviour from F1/F7), members, baseline
  3. Keep tasks moving — List/Kanban/Gantt, dependencies, the "all tasks are closed" nudge (F3)
  4. Handle a risk
  5. Prepare the Weekly Sync
  6. Work a deal — stages, Hold vs Delayed vs idle (F4), handoff to delivery (`pipeline:view`)
  7. Track hours and tickets — iTop, Utilization
  8. Offboard a teammate — the handover (F5) (admin only, `requires: "*"`)
- The existing topics remain below as **Reference**, updated where this round changed behaviour: Projects (status filter, cancel cascade, hold and reactivation), Overview (on-hold tasks not counted), Opportunities › Idle alerts (Hold never idles), Admin (handover), notifications.
- Search covers guides and reference; a guide is hidden when the viewer lacks its permission. Every quoted UI label matches the label in code.
- **Accept:** `/help` shows Guides above Reference; searching "hold" finds the project and pipeline guides; a non-admin never sees guide 8; existing `/help#<topic-id>` links still land; `helpContent` unit tests and `e2e/tests/help.spec.ts` are updated and pass.

## 5. Cross-cutting rules

- INTERNAL notes never reach exports — F5 notes are INTERNAL; nothing in `frontend/src/lib/export/` changes.
- SA is not an owner; "see" filters keep the `saId` arm. F5 changes TAM only through the existing seat path.
- Activity `changes` hold short scalars and counts only — never note or comment bodies.
- Enum display text comes from `lib/labels.ts`; chips stay `StatusChip`/`PriorityBadge`/`LabelChip`.
- `Tasks.tsx`, `/tasks`, and the Timeline tab stay.
- Sub-200ms: the F7 fragment rides existing queries; the F3 check is one indexed count, run only on an open→closed write.

## 6. Decisions

Settled (do not re-open during the build):

| | Decision |
|---|---|
| S1 | Cancelled tasks stay Cancelled when a project is reactivated |
| S2 | Reactivation offers a date shift, in calendar days, N editable and prefilled with the hold length |
| S3 | F3 notifies the TAM and every member; never auto-completes |
| S4 | F5 is a handover at deactivation, not an archive lane; task status is untouched |
| S5 | F6 reframes Help as guides + reference |
| S6 | F2 filters client-side; F7's shift rides the status PATCH (no separate endpoint) |
| S7 | Deleting the last open task does not fire F3 |
| S8 | Epics are not cancelled by F1; open epics are shifted by F7 |
| S9 | A TAM replacement is mandatory when the leaver is TAM, even if tasks are left unassigned; SA seat, customer owner, epic owner and deal PIC may be left empty |
| S10 | Open deals move to one chosen PIC (or unassigned) as a group, not deal by deal |

Answered by the user, 2026-11-10:

| | Question | Answer |
|---|---|---|
| D2 | Does F5 also hand over the leaver's SA seats, customer ownership, Pipeline PIC deals and epic ownership? | Yes — all of them, in the same handover |
| D3 | Is the person who closed the last task also notified in F3? | Yes |
| D4 | How are commits and the PR approved? | Pre-approved for this branch: once `gates.sh` and the phase review are green, commit per task, push, and open the PR into `develop` without asking again. Anything into `staging`/`main` still needs a separate request |

Settled during the build (gaps found in review, resolved closest to the spec's intent):

| | Gap | Resolution |
|---|---|---|
| B1 | The Overview "Due this week" tile leaves out on-hold tasks, but the list it opens (`/tasks?view=week`) did not | `GET /tasks` takes `excludeOnHold=true`; the week view sends it. A bare `dueFrom`/`dueTo` filter keeps its generic meaning |
| B2 | `holdDays` from `lifecycle-preview` compares a UTC day with the caller's local day and can be one day high ahead of UTC | The reactivation dialog pre-fills N from `onHoldSince` in local time; the server value stays as an approximate figure |
| B3 | F5 copied the normal edit routes, which let an inactive user take an SA seat or a customer | In a handover every receiver must be active, the new SA and the new customer owner included. The normal edit routes are unchanged |
| B4 | Nothing required the person taking over open deals to have Pipeline access | The deal receiver must hold `pipeline:view`; otherwise 400 `pic_no_pipeline_access` |
| B5 | One notification per reassigned deal, or one grouped notification? | One per deal, as in a normal PIC change — each links to its deal |

## 7. Out of scope

A new "Archived" task status or lane; auto-completing projects; restoring tasks on reactivation; working-day date shifts; bulk reassignment outside offboarding; any change to exports, guest links, iTop, or reporting.
