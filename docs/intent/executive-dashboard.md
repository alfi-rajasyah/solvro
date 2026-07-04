# Intent — Executive Dashboard & Overdue Projects Monitoring

**Status:** Confirmed (scope/behavior locked; timeline *visual* provisional, to review on-screen)
**Date:** 2026-07-03
**Origin:** Manager feature request — "Report & Project Tracking"

---

## Confirmed statement of intent

- **Outcome:** One new **read-only "Executive" page** aggregating *every* project across *all*
  TAMs into two blocks: (1) a portfolio of high-level project timelines, (2) a list of
  overdue projects.
- **User:** A **Manager** persona — gated by a new **`report:executive` permission**, not a
  hardcoded role. Whoever holds the permission sees the page; the sidebar entry appears only
  for them, exactly like the Admin page.
- **Why now:** Solvro is live on the TAM team; managers need portfolio oversight above the
  single-TAM view the app was originally built for.
- **Data scope:** Permission holders see **all projects org-wide**. The Executive endpoint
  ignores the per-assignment `projectVisibilityFilter` — the `report:executive` permission
  itself is the "see everything, here, read-only" grant. (One permission does both jobs: page
  access + data scope. No need to also grant `project:view-all`.)
- **Overdue rule (new, project-level):** A project is overdue when
  **`max(task.dueDate) < today` AND `project.status ∉ {COMPLETED, CANCELLED}`**.
  Derived from task due dates — TAMs commit deadlines by setting task dates. No new
  `Project.deadline` column, no baseline dependency.
- **Timeline block (provisional visual):** Per project, a **single-row** span from
  `min(task.startDate)` → `max(task.dueDate)` with a high-level progress indicator.
  *Assumption to review on-screen:* phase segments from the project's `Section`s (section
  color), progress from done/total tasks. No granular task rows.

## Out of scope

- No editing from this page (read-only, zero writes).
- No drill-down into granular tasks.
- No per-manager → TAM assignment scoping (all-or-nothing via the permission).
- No native AI summarization.
- No changes to the existing **task-level** overdue logic used elsewhere
  (`tasks.ts`, `ProjectOverview`, `DailyReview`, etc.).
- No Prisma migration / schema change.

## Refinement — 2026-07-04 — Portfolio Timelines: calendar view by default

The **Portfolio Timelines** block gets a **view toggle**: **Calendar (default)** and **List**
(the list is the row/progress-bar view already built).

- **Purpose:** a glance-level view for high-level management — "what projects are running,
  what is overdue" in one look, no reading required.
- **Calendar = horizontal year-roadmap:** months across a year axis, **one bar per project**
  spanning `start → end`. A **`‹ 2026 ›` year switcher** defaults to the **current year**.
- **Overlap-clipping:** only projects whose span overlaps the selected year appear; bars are
  clipped to the year edges with a small "continues" cue when a project spills beyond.
- **Color = state** (read health at a glance): overdue → red (`bg-error`);
  active/on-track → primary; completed → muted/neutral; planning/on-hold → amber.
- **Today line:** a vertical marker so "running now" is obvious.
- **Unscheduled projects** (null `start`/`end`): a single muted **footnote**
  ("N projects have no scheduled dates — see List view") — nothing hidden silently.
- **Scope:** frontend-only, reuses the existing `GET /reports/executive` payload
  (`start`, `end`, `status`, `isOverdue`) — **no backend change**; hand-rolled (percentage-based
  positioning), no new chart dependency, consistent with the existing hand-rolled Gantt.
- **Out of scope (calendar):** no task-level detail; no drag/edit; no day/week month-grid
  calendar; no per-section phase segments on the roadmap; one year visible at a time.

## Key codebase facts that shaped this

- "Overdue" today is **task-level only** (`tasks.ts`: `dueDate < now() AND status != DONE`);
  there is **no** project-level overdue concept yet. `Overview.tsx` carries standing
  `TODO(health-signal)` notes that per-project overdue counts don't exist.
- `Project` has **no** date columns (`startDate`/`endDate`/`deadline`); only `Task` carries
  dates. Project span must be derived from task dates.
- Visibility is permission-based: `projectVisibilityFilter` returns all projects for
  `project:view-all` or `*`, else only assigned (`tamId`/`saId`). STAKEHOLDER is **not**
  special-cased (CLAUDE.md is stale on that).
- Permission vocabulary for the Admin > Roles tick-box editor lives in
  `frontend/src/lib/auth.tsx` → `PERMISSION_CATALOG` (curated, not enforced server-side).
  `report:executive` must be added there to be grantable in the UI.
- UI gating pattern to mirror: `AdminGuard` + `Sidebar` `adminOnly` filter, both keyed on
  `hasPermission(user, "*")`.
