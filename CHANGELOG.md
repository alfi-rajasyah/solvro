# Changelog

All notable changes to this repository are tracked here. This file is maintained by hand (and by Claude Code when assisting) and serves as the canonical configuration / change-history reference.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions:

- **Added** — new files, features, dependencies, or services.
- **Changed** — modifications to existing behavior, configuration, or structure.
- **Fixed** — bug fixes.
- **Removed** — deletions of files, features, or dependencies.

Entries are reverse-chronological. Each entry should record **what changed**, **where** (file path), and **why** when the reason isn't obvious from the change itself. Configuration-affecting decisions (env vars, Docker services, schema columns, etc.) must be captured here so this file can be used as a single source of truth for environment setup.

---

## [Unreleased]

### Changed — 2026-07-22 — Solid Gantt bar fills with progress overlay (plan Task 3)

- `frontend/src/components/gantt/GanttBar.tsx` + `frontend/src/lib/gantt/palette.ts`:
  rendering model inverted. Bars now render solid in their Color-by color
  (was: 28%-opacity track via `BAR_TRACK_OPACITY`, solid only as progress
  filled — the root cause of the washed-out Gantt). Progress is now a darker
  left-anchored overlay (`rgba(0,0,0, PROGRESS_OVERLAY_ALPHA)`, only when
  0% < progress < 100%). `BAR_TRACK_OPACITY` removed (GanttBar was its sole
  consumer); `PROGRESS_OVERLAY_ALPHA = 0.28` added. Bar radius 3px → 4px.
  Screen/export color parity unchanged — exports were already solid-fill.

### Changed — 2026-07-22 — Deterministic vivid fallback for uncustomized section colors (plan Task 2)

- `frontend/src/lib/gantt/geometry.ts`: section color resolution now treats
  `null` / legacy schema-default `#94a3b8` as "never customized" and assigns
  a vivid preset (`SECTION_COLOR_PRESETS[index % length]`) by section
  position instead of flat slate. Explicitly stored custom colors always
  win; rows without a section keep `DEFAULT_SECTION_COLOR`. Single
  resolution point within the Gantt — Gantt list dots, bars, section bands,
  and Excel/PDF exports all inherit. Non-Gantt surfaces (ProjectList,
  Executive, TaskPanel) resolve `section.color` directly and still show
  slate for uncustomized sections — parity gap tracked in ISSUES.md.
  Accepted trade-off
  (per `docs/ideas/gantt-bar-reskin.md`): fallback hues can shift if
  sections are reordered — cosmetic only.

### Changed — 2026-07-22 — Gantt palette re-skin values (plan Task 1)

- `frontend/src/lib/gantt/palette.ts`: `STATUS_FILL_HEX` pastels → solid-intent
  hues (TODO `#94a3b8`, IN_PROGRESS `#3b82f6`, DONE `#10b981`);
  `PRIORITY_BORDER_HEX.LOW` `#94a3b8` → `#64748b` so LOW-priority is
  distinguishable from TODO-status; `SECTION_COLOR_PRESETS` replaced with a
  vivid dark+light-safe set that deliberately omits slate `#94a3b8` (kept as
  the never-customized sentinel for the Task 2 fallback). Hex-value changes
  only — no renames; Excel/PDF exports inherit immediately via `barFillHex`;
  on-screen bars stay 28%-opacity tracks until plan Task 3.

### Added — 2026-07-22 — Gantt bar re-skin planning docs; shadcn adoption declined

- `docs/ideas/gantt-bar-reskin.md` — refined idea for the stale-bar fix. Root
  cause: `BAR_TRACK_OPACITY = 0.28` in `frontend/src/lib/gantt/palette.ts`
  renders 0%-progress bars as 28%-opacity ghosts (exports already render
  solid via the shared `barFillHex`). ReUI Gantt swap evaluated and rejected
  (no dependency lines/baselines/milestones/export in its API; frontend has
  no shadcn stack). Includes a 1:1 before/after mockup artifact as visual
  spec.
- `docs/plans/gantt-bar-reskin-plan.md` — six-task paint-only implementation
  plan: new palette hues → vivid fallback for uncustomized section colors in
  `geometry.ts` (schema default `#94a3b8` treated as "unset" sentinel) →
  solid fills + progress overlay in `GanttBar.tsx` → task labels on bars →
  section summary bars → QA sweep. No new dependencies; backend/DB untouched.
- `CLAUDE.md` Facts: recorded the shadcn/ReUI decision (declined 2026-07-22;
  per-component vendoring policy for future hard primitives) under
  deferred/not-built items.
- `docs/prompts/gantt-bar-reskin.md` — kickoff prompt for executing the plan
  in a fresh session: solvro-* agent pipeline per task, strict task order,
  `feat/gantt-bar-reskin` off `develop`, one commit per task after gates
  (pre-approved in the prompt), hard stop before PR creation.

### Changed — 2026-07-21 — CI/CD hardening (Prisma CLI pinning, Node 22, gated publishing, typecheck gate)

- `prisma` moved from `devDependencies` to `dependencies` in
  `backend/package.json` (+ lockfile). The `runtime` Docker image installs
  with `npm ci --omit=dev` but runs `npx prisma migrate deploy && npx prisma
  db seed` at container start (CI stack and prod via `setup.sh`) and `npx
  prisma generate` at build — with the CLI absent, `npx` fetched the
  **latest** prisma from the registry, an unpinned major-version skew
  against `@prisma/client` 5.22 and a network fetch at container start.
  Now the pinned 5.22 CLI ships in the image.
- `backend/Dockerfile` and `frontend/Dockerfile`: `node:20-slim` →
  `node:22-slim`; `.github/workflows/ci.yml`: `node-version: 20` → `22`
  (three places). Node 20 reached end-of-life April 2026. Both runtime
  images build-verified locally on 22.
- `.github/workflows/docker-publish.yml`: publishing for `main` is now
  gated on CI — trigger changed from `push: branches: [main]` (which ran
  in parallel with CI, so a red build could still ship `latest` to GHCR)
  to `workflow_run` on the CI workflow's success. Builds check out
  `workflow_run.head_sha` (the exact commit CI validated) and the `sha-*`
  image tag is computed from the checked-out commit for the same reason.
  Tag (`v*`) and `workflow_dispatch` publishes are unchanged.
- `.github/workflows/ci.yml`: new fast `typecheck` job (backend
  `tsc --noEmit` after `prisma generate`, frontend `npm run typecheck`,
  e2e `npm run typecheck`) — previously type errors only surfaced inside
  the e2e job's Docker builds, and the e2e suite's own typecheck never ran
  in CI at all. Also: top-level `permissions: contents: read` (least
  privilege for the default token), the `npm ci` retry extended to the e2e
  install (was backend-only), and the service container aligned to
  `postgres:15-alpine` matching both compose files.

### Added — 2026-07-21 — Dependabot configuration

- `.github/dependabot.yml`: weekly update PRs for npm (`/backend`,
  `/frontend`, `/e2e`), GitHub Actions, and the Docker base images in both
  Dockerfiles. All entries `target-branch: develop` — `main` is the release
  branch and only advances via release PRs.

### Changed — 2026-07-21 — README rewritten to match the shipped codebase

- `README.md` fully revised: it still described the original PRD (HTMX,
  "Node.js or Python (FastAPI)", port 8080, shipped ingestion webhook,
  success metrics / user stories). Now documents the real stack
  (React 18 + Vite + Tailwind / Express + Prisma / PostgreSQL 15), the real
  ports (5173 dev, 80/3000 prod defaults), shipped features vs. a Roadmap
  section (Secure Ingestion Port, iTop utilization), the `setup.sh`
  production path, and a native local-dev guide based on the tracked
  `backend/.env.example` — the root `docker-compose.yml` / `.env.example`
  are gitignored, so the old `docker compose` instructions did not work
  from a fresh clone. No links to local-only docs (CLAUDE.md, DESIGN.md,
  CONFIGURATION.md) since those are not in the public repo.

- `@xyflow/react` and `dagre` removed from `frontend/package.json` — never
  imported anywhere in `frontend/src` (verified against the current tree;
  frontend typecheck clean after removal). Leftovers from the shelved
  Network Diagram exploration, which stays not-built by decision. Dev-stack
  note: run `docker compose exec frontend npm install` after pulling this so
  the container's node_modules volume drops both packages.

### Removed — 2026-07-21 — Internal working documents

- Removed internal working documents from the repository: `tasks/`
  (`plan.md`, `todo.md`), `docs/ideas/`, `docs/intent/`, `docs/mockups/`,
  `ISSUES.md`, and `DESIGN.md`. These are maintenance/planning references
  kept locally; the repo now carries only what is needed to pull, run, and
  deploy Solvro. `.gitignore` extended so they cannot return. (Note:
  removed files remain in git history.)

### Fixed — 2026-07-21 — No stray "(No section)" Gantt header for subtask-only buckets

- `buildRows` (`frontend/src/lib/gantt/geometry.ts`) now emits the
  "(No section)" group only when the null-section bucket contains at least one
  top-level task. A subtask created with `sectionId: null` (possible via
  TaskFormModal when a parent is chosen but section left blank) renders nested
  under its parent regardless of its own section, so a subtask-only bucket
  previously produced an empty stray section header row. Verified with a
  `buildRows` simulation (dated parents + undated subtasks + null-section
  subtask): subtasks nest, chevron flags set, no stray header, collapse works.

### Fixed — 2026-07-21 — Gantt renders when tasks exist but none have dates

- `GanttFrame.tsx` (`frontend/src/components/gantt/`): `chartStart`/`chartEnd`
  now fall back to a today-centered window (reusing
  `computeChartStart`/`computeChartEnd`'s ±1-year padding) when `rowsDateRange`
  is null but rows exist. Previously the render guard required a non-null
  chart window while the empty state required `rows.length === 0`, so a
  project with tasks/sections but zero dated tasks fell between the two and
  rendered nothing at all. Undated tasks now appear as bar-less rows —
  `GanttBar` and `GanttConnectors` already null-guard — and can be scheduled
  by clicking the row to open the task editor.
- Reworded the Gantt empty state (same file): it only fires when the project
  has no tasks *and* no sections, but claimed "No tasks have start or due
  dates yet" — now points at the + Task / + Section toolbar actions.
- Excel/PDF export window fallback (same file): with no dated tasks it now
  anchors the tight ±7-day grid on today instead of the previously dead
  chartStart/chartEnd branch, which the render fix would otherwise have made
  live and produced a ±1-year grid of empty columns. The anchor resolves at
  export time (inside the handler closures), not when the registration effect
  runs, so a tab left open across day boundaries can't export a stale window.
- Filed the Phase 2 follow-up (drag-on-canvas to schedule undated tasks) as
  `docs/ideas/gantt-drag-to-schedule.md`.

- `buildRows` (`frontend/src/lib/gantt/geometry.ts`) now emits `subtask` rows
  (depth 2) nested under their parent task, always grouped by the parent's
  section even when the subtask's own `sectionId` diverged. Parent task rows
  gain a `hasChildren` flag + expand/collapse chevron
  (`frontend/src/components/gantt/GanttListRow.tsx`) reusing the existing
  `collapsed` row-id set. Only direct children render (depth caps at 2);
  deeper nesting rolls up into each subtask's `progressPct`. Renderers,
  connectors, and Excel/PDF exports already supported the `subtask` row kind
  — previously nothing emitted it (subtasks were invisible on the Gantt).

### Added — 2026-07-20 — `Project.excludeFromPortfolio` flag (admin containers)

- `Project.excludeFromPortfolio` boolean (`projects.exclude_from_portfolio`,
  default false), migration `project_exclude_from_portfolio` —
  `backend/prisma/schema.prisma`. Marks administrative container projects
  (e.g. per-TAM "Opty Timelines") that must not pollute portfolio roll-ups.
- `computePortfolioRows` (`backend/src/lib/portfolio.ts`) AND-merges
  `excludeFromPortfolio: false` into every caller's filter, covering
  `GET /reports/executive` (Portfolio Timelines, overdue monitoring).
  `GET /overview` (`backend/src/routes/overview.ts`) additionally applies the
  same filter to its own queries (KPI counts, recent projects/tasks) so
  flagged projects don't inflate any Overview roll-up. They stay fully
  usable and visible in the Projects list.
- `POST /projects` / `PATCH /projects/:id` accept `excludeFromPortfolio`
  (`backend/src/routes/projects.ts`); "Administrative project" checkbox in
  `frontend/src/components/ProjectFormModal.tsx`; types + executive-report
  invalidation in `frontend/src/lib/queries.ts`.

### Fixed — 2026-07-20 — Gantt dates column truncation

- Gantt task-list dates column truncated every range ("12 Jul – 1…"); widened
  `DATE_RANGE_COL_WIDTH` 92 → 118 in `frontend/src/lib/gantt/constants.ts` to
  fit the bounded "DD Mon – DD Mon" format (window/divider resizing feeds the
  flex name column, so the fixed sub-column could never grow).

### Added — 2026-07-20 — Explicit `Task.isMilestone` flag

- `Task.isMilestone` boolean (`tasks.is_milestone`, default false) with
  one-time backfill marking previously derived milestones (same-day range or
  due-only) — `backend/prisma/schema.prisma`, migration
  `task_is_milestone`. `POST /projects/:id/tasks` and `PATCH /tasks/:id`
  accept `isMilestone`; both enforce startDate = dueDate for milestones.

### Changed — 2026-07-20 — Gantt milestones follow the explicit flag

- Gantt milestone rendering now follows the explicit `isMilestone` flag
  (Task/Milestone toggle in TaskPanel) instead of inferring from same-day
  dates — `frontend/src/lib/gantt/geometry.ts`,
  `frontend/src/components/TaskPanel.tsx`, `frontend/src/lib/queries.ts`.
  Due-only non-milestone tasks render as 1-day bars.

### Fixed — 2026-07-20 — Milestones can start dependency drags

- Milestone diamonds can now initiate dependency drags (connector dots were
  unreachable in the milestone render branch) —
  `frontend/src/components/gantt/GanttBar.tsx`.

### Added — 2026-07-20 — Gantt "Color by" selector

- Gantt "Color by" selector (Status | Section | Priority) with legend,
  persisted in localStorage (`solvro.gantt.colorBy`), defaulting to Section
  so upgrade-day visuals are unchanged; shared `barFillHex` resolver drives
  live bars and both exports — `frontend/src/lib/gantt/palette.ts`,
  `GanttFrame.tsx`, `GanttBar.tsx`, `exportPdf.ts`, `exportExcel.ts`.

### Changed — 2026-07-20 — Exports color by the selected mode

- Excel/PDF Gantt exports now color by the selected mode instead of always
  status — in the default Section mode with unset section colors they render
  grey until a mode is chosen or colors are set (screen and export now
  always agree).

### Added — 2026-07-20 — Section color swatch picker

- Section color picker (8 preset swatches) on the Gantt section rows,
  feeding the existing sections PATCH `color` field —
  `frontend/src/components/gantt/GanttListRow.tsx`, `GanttListPane.tsx`,
  `GanttFrame.tsx`, `frontend/src/lib/queries.ts`.

### Fixed — 2026-07-20 — Clipboard copy on the HTTP prod origin

- Copy-to-clipboard (Reports export packet, Admin ID copy) failed on the
  plain-HTTP prod origin where `navigator.clipboard` is undefined; added
  `frontend/src/lib/clipboard.ts` fallback (textarea + execCommand).

### Added — 2026-07-20 — "View" opens the Gantt PDF in a browser tab

- "View" export action opening the Gantt PDF in a browser tab (bypasses the
  download pipeline that hangs on the HTTP-only prod origin) —
  `frontend/src/lib/gantt/exportContext.tsx`, `exportPdf.ts`,
  `GanttFrame.tsx`, `frontend/src/components/layout/RightSidebar.tsx`.

### Changed — 2026-07-20 — Review fixes: milestone validation + optimistic section updates

- `useUpdateSection` now uses the canonical optimistic-update pattern
  (snapshot/rollback/invalidate) so section color/rename/reorder feel
  instant — `frontend/src/lib/queries.ts`.
- Milestone validation guards: task create with `isMilestone: true` requires
  a due date; task patch rejects `isMilestone: true` combined with clearing
  the due date — `backend/src/routes/projects.ts`,
  `backend/src/routes/tasks.ts`.
- Section color popover uses the sanctioned `shadow-overlay` token instead
  of `shadow-lg` — `frontend/src/components/gantt/GanttListRow.tsx`.

### Changed — 2026-07-16 — Overview: fake "Portfolio progress" S-curve replaced by real Portfolio timeline

- **[frontend/src/pages/Overview.tsx](frontend/src/pages/Overview.tsx)** — the synthetic S-curve chart (**Removed**: `buildSCurve()` fake 6-bucket ramp, the recharts AreaChart card, and this file's recharts imports — the dep stays for `ProjectOverview.tsx`) is replaced by the shared `PortfolioCalendar` fed by the new `GET /overview` `portfolio` payload, so each user sees a real year-roadmap of exactly the projects they can see (TAMs: their own). Rendered as a full-width bare section (header + the calendar's own bordered container, mirroring Executive — no double-carding) titled "Portfolio timeline"; footnote copy drops "see List view" (Overview has none). "Projects needing attention" + "Recent activity" now sit in a two-up row below; the attention strip's local `ProjectStatusPill` was **Removed** in favor of the canonical `ProjectStatusChip` (it duplicated chip styling with off-token colors and wrong ON_HOLD/CANCELLED semantics). `SkeletonGrid` mirrors the new layout.

### Fixed — 2026-07-16 — Overview health signal is real (TODO(health-signal) resolved)

- **[frontend/src/pages/Overview.tsx](frontend/src/pages/Overview.tsx)** — "Projects needing attention" now sources **all** visible projects from `portfolio` (was the 5-capped `recentProjects`) and ranks by real schedule data: overdue (amber `#F59E0B` left border + `Nd overdue` label in `text-chip-amber-text`, most-overdue first) → ACTIVE on-track (green) → everything else, recency-sorted within the non-overdue tiers, top 6. The previously unreachable amber bucket documented by the three `TODO(health-signal)` comments is now live; the comments are gone. Green/gray border hexes unchanged (`#8DC63F`/`#6B7280`).
- **[ISSUES.md](ISSUES.md)** — logged deferred review findings as follow-ups: Overview's pre-existing off-token styling (KPI icon tones, `AVATAR_PALETTE` hexes incl. the reserved amber, raw `font-mono` for ids/KPI, ad-hoc caption sizes, healthColor hex→token migration), the `ActivityFeed` empty-state edge case, and the two `PortfolioCalendar` carried-over nits (`rounded-full` bar, `font-mono` year).

### Changed — 2026-07-16 — `PortfolioCalendar` extracted into a shared component

- **[frontend/src/components/portfolio/PortfolioCalendar.tsx](frontend/src/components/portfolio/PortfolioCalendar.tsx)** (new) — the Executive dashboard's calendar (month grid, bar positioning, `barTone` status coloring, year switcher, clip chevrons, Today line, legend, tooltips) plus `fmtDate` moved **verbatim** out of `Executive.tsx` so the Overview page can reuse it (next entry). Two additions: exported `sortPortfolioRows()` (the overdue-first → end-asc → name comparator previously inlined in `PortfolioTimelinesSection`) and an optional `unscheduledNote` prop for the footnote copy (default reproduces the Executive wording exactly — Overview has no List view to point at). Known pre-existing nits carried over deliberately to keep the extraction byte-identical: `rounded-full` on the timeline bar and raw `font-mono` for the year display.
- **[frontend/src/pages/Executive.tsx](frontend/src/pages/Executive.tsx)** — imports the shared component/helpers; inline sort replaced by `sortPortfolioRows()`. Zero behavior change (extraction mechanically verified line-by-line against the deleted block).
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — `ExecutiveProjectRow` renamed to `PortfolioProjectRow`, moved next to the overview types, gained `updatedAt: string` (mirrors `backend/src/lib/portfolio.ts`, same field order); `OverviewResponse` gained `portfolio: PortfolioProjectRow[]`; `ExecutiveReport.projects` re-pointed. No new hooks.

### Added — 2026-07-16 — Shared portfolio-row computation + `/overview` portfolio payload

- **[backend/src/lib/portfolio.ts](backend/src/lib/portfolio.ts)** (new) — `computePortfolioRows(where)` extracted verbatim from the `/reports/executive` handler: per-project `start` (min task startDate), `end` (max task dueDate), `totalTasks`/`doneTasks`/`progressPct`, `isOverdue`/`daysOverdue` (end before start-of-today and status not COMPLETED/CANCELLED), ordered `sections`. Row type `PortfolioProjectRow` = old `ExecutiveProjectRow` + `updatedAt` (needed by Overview's attention-strip recency sort). Single `findMany` with scalar task selects — no N+1, per the sub-200ms NFR.
- **[backend/src/routes/overview.ts](backend/src/routes/overview.ts)** — `GET /overview` response now carries `portfolio`: all visible projects (same `projectVisibilityFilter` scope as every other overview query, so TAMs get only their own projects) run through `computePortfolioRows`, added as a 6th member of the existing `Promise.all`. Why: real schedule/overdue data for the Overview "Portfolio timeline" replacing the synthetic S-curve (frontend lands in a follow-up entry).
- **[backend/src/routes/reports.ts](backend/src/routes/reports.ts)** — `/reports/executive` now delegates to `computePortfolioRows({})` (still intentionally org-wide, permission-gated). Output contract unchanged except rows additively gain `updatedAt`.

### Added — 2026-07-15 — `ProjectService` join model + start-fresh catalogue reset

- **[backend/prisma/schema.prisma](backend/prisma/schema.prisma)** — new `ProjectService` model mirroring `CustomerService` exactly: `(projectId, serviceId, tools[] String[], createdAt)`, `@@unique([projectId, serviceId])`, indexes on both FKs, `onDelete: Cascade` both sides, `@@map("project_services")`. Back-relations added: `Project.services` and `Service.projects`. This is the data layer for per-project service scoping (each project declares which catalogue services are in play for that engagement, independent of — and beyond — the customer's subscription set).
- **[backend/prisma/migrations/20260715221031_add_project_services/migration.sql](backend/prisma/migrations/20260715221031_add_project_services/migration.sql)** (new) — creates `project_services`, then **destructively resets the catalogue**: `DELETE FROM "customer_services"; DELETE FROM "services";`. This "start fresh" wipe was explicitly user-approved as part of retiring the admin-curated catalogue (existing mappings were dev-stage throwaway data). Any environment applying this migration loses existing service/customer-service rows by design.

### Fixed — 2026-07-15 — Clean 400 for nonexistent serviceIds on both mapping PUTs

- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)**, **[backend/src/routes/customers.ts](backend/src/routes/customers.ts)** — `PUT …/services` now pre-checks that every `assignments[].serviceId` exists (`prisma.service.count` on the deduped id set) and throws `HttpError(400, "service_not_found")` before the replace-set transaction. Previously a valid-but-nonexistent id (e.g. a service deleted concurrently) tripped the FK constraint → Prisma P2003 → raw 500 `internal_error` (the error mapper only handles P2025/P2002). Found by code review; the customers.ts gap predated this branch but shares the exact pattern, so both were fixed together. Regression tests added in [backend/test/projectServices.test.ts](backend/test/projectServices.test.ts) (project + customer routes).
- **[ISSUES.md](ISSUES.md)** — logged two deferred review findings: optimistic-update pattern for the service-mapping mutation hooks (inherited debt, both hooks together as follow-up), and the product call on whether `active: false` services should be blocked from new assignments (incl. "Add all subscribed" carry-over).

### Changed — 2026-07-15 — Service catalogue management moved from Admin to Settings

- **[frontend/src/components/services/ServiceCatalogueManager.tsx](frontend/src/components/services/ServiceCatalogueManager.tsx)** (new) — the catalogue management UI (add form, inline rename, active toggle, delete-with-confirm) extracted from `Admin.tsx`'s `ServicesTab` mostly verbatim. Copy updated: intro now says any TAM can add services inline from a customer's or project's Services tab and curate here; delete confirm now warns removal cascades to **customers and projects**.
- **[frontend/src/pages/Settings.tsx](frontend/src/pages/Settings.tsx)** — new "Service Catalogue" section card (between Profile and Change password) rendering the manager, visible only to users with `project:write` (`hasPermission` guard).
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — **Removed** the "Service Catalogue" tab, its render branch, the `ServicesTab` component, and all now-unused service imports (−261 lines). Catalogue curation is no longer an admin concern.

### Added — 2026-07-15 — Project "Services" tab (per-project service scoping UI)

- **[frontend/src/pages/views/ProjectServices.tsx](frontend/src/pages/views/ProjectServices.tsx)** (new) — project sub-view rendering `ServiceMappingList` with the project's assignments (`useUpdateProjectServices`). When the project has a customer, `useCustomer(project.customerId)` supplies `subscribedServiceIds` so customer-subscribed services are badged "Subscribed" and sorted first, plus an **"Add all subscribed"** bulk action (visible only when unassigned subscriptions exist) that merges the customer's remaining subscriptions into the project set, carrying over the customer's per-service tools while leaving already-assigned services' project-level tools untouched. Projects without a customer render an unbadged picker.
- **[frontend/src/App.tsx](frontend/src/App.tsx)** — registered `projects/:id/services` route; **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — added `Services` to the project tab list (after Risks), per the two-place registration convention.

### Added — 2026-07-15 — Shared `ServiceMappingList` component + inline service creation

- **[frontend/src/components/services/ServiceMappingList.tsx](frontend/src/components/services/ServiceMappingList.tsx)** (new) — the service-mapping UI (catalogue checkbox rows, per-assignment `ToolsEditor` chip input, full-replace `buildAssignments` logic) extracted verbatim from `CustomerDetail.tsx` into a reusable component consumed by both the customer Services tab and the upcoming project Services tab. Props: `assignments`, `onSave` (full-replace), `canMutate`, `saving`, optional `subscribedServiceIds` (project context: rows badged "Subscribed" and sorted first), `title`/`description` copy overrides. New capability: an inline **"Add service"** form (name + description, styled after the Admin add-form) that creates a catalogue entry via `useCreateService` and immediately auto-assigns it — TAMs no longer need the Admin screen to grow the catalogue. Empty-state copy now points at the inline form instead of the retiring Admin tab.
- **[frontend/src/pages/CustomerDetail.tsx](frontend/src/pages/CustomerDetail.tsx)** — `ServicesTab` reduced to a thin wrapper around `ServiceMappingList` (−231 lines); `ToolsEditor` and the mapping logic now live in the shared component. No behavior change beyond the inline add form.

### Added — 2026-07-15 — Project services query layer

- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — added `ProjectServiceAssignment` interface; `ProjectDetail` now carries `services: ProjectServiceAssignment[]` (matches the enriched `GET /projects/:id` payload); new `useUpdateProjectServices(projectId)` mutation hook mirroring `useUpdateCustomerServices` (`PUT /projects/:id/services`, invalidates the project detail + projects namespace). Also fixed stale-cascade invalidation: `useUpdateService`/`useDeleteService` now invalidate `["projects"]` too, since service renames/deletes cascade into project detail payloads.

### Added — 2026-07-15 — `PUT /projects/:id/services` + services in project detail payload

- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — new `PUT /projects/:id/services` endpoint (gated `requirePermission("project:write")` + `ensureProjectVisible`, so hidden projects 404 like every other project-scoped route). Body `{ assignments: [{ serviceId, tools[] }] }`; replaces the whole assignment set in one transaction (deleteMany rows not in the desired set, then upsert each `(serviceId, tools)` on the `projectId_serviceId` key) — the exact pattern of the customer-side mapping in `customers.ts`. Also extracted the previously triplicated full-detail `include` (GET `/:id` + both baseline branches) into a shared `projectDetailInclude` const and added `services: { include: { service } }` (ordered by service name) to it, so every project-detail response now carries the project's service assignments.
- **[backend/test/projectServices.test.ts](backend/test/projectServices.test.ts)** (new) — vitest/supertest coverage: assign + read-back on PUT and GET, replace-by-omission + tools upsert, TAM can `POST /services` (regression for the new permission gate), STAKEHOLDER gets 403 on both writes, unassigned TAM gets 404 (visibility), invalid serviceId → 400.
- **[backend/test/testAuth.ts](backend/test/testAuth.ts)** — generalized `createAdminAndToken` into `createUserWithRole(roleName)` (admin helper now delegates) so tests can mint TAM/STAKEHOLDER tokens.

### Changed — 2026-07-15 — Service catalogue writes opened to TAMs

- **[backend/src/routes/services.ts](backend/src/routes/services.ts)** — `POST /services`, `PATCH /services/:id`, `DELETE /services/:id` are now gated by `requirePermission("project:write")` instead of `requireAdmin`. The catalogue stays shared/global, but any TAM can curate it (create inline from pickers, rename, deactivate, delete) — the admin-only gate was a bottleneck in a solo-use tool. `GET /services` unchanged (any authenticated user). Admin UI relocation to Settings follows in a later change this cycle.

### Fixed — 2026-07-04 — PortfolioCalendar track-alignment bugs

- **[frontend/src/pages/Executive.tsx](frontend/src/pages/Executive.tsx)** — two alignment regressions in the new Calendar view. (1) The 12-month axis header spanned the full `min-w-[720px]` width while each project row indents its bar track behind a `w-48` label column + `gap-3`, so month labels sat ~192px left of the bars ("Jun" was not above the June bars). The header now mirrors the row structure — a `flex items-center gap-3 px-3` wrapper with a `w-48 shrink-0` spacer and the 12-col grid inside a `flex-1`, so its columns sit directly over the bar track. (2) The dashed "Today" line was positioned `left: todayFrac%` of the full `.relative` rows container, which includes the `w-48` label gutter, while bars are positioned as a % of the `flex-1` track only — so the line missed the bars. It's now rendered in a full-height `absolute inset-0` overlay that reuses the same `w-48` spacer + `flex-1` track, so `todayFrac%` is measured against the track and lines up with the bars. Header, per-row gridlines, bars, and today line now share one 12-column coordinate system. Today-line current-year gating and the Today pill are unchanged.

### Changed — 2026-07-04 — Portfolio Timelines: Calendar/List view toggle

- **[frontend/src/pages/Executive.tsx](frontend/src/pages/Executive.tsx)** — the "Portfolio Timelines" block now defaults to a **Calendar** horizontal year-roadmap view, with the previous progress-bar row-list preserved behind a **List** toggle (segmented buttons in the section header, styled after the Gantt's Scale switcher). `PortfolioList` is the extracted, visually-unchanged list view. `PortfolioCalendar` (new) renders a 12-equal-width-month axis for a switchable `‹ {year} ›`; project bars are positioned with percentage math (`leftFrac`/`rightFrac` clamped to `[0,1]` against `[Jan 1 year, Jan 1 year+1)`, min 1% width) so they align under the correct months without any pixel math; a `barTone(p)` helper colors bars `bg-error` (overdue) → `bg-primary` (active) → `bg-chip-amber-bg` (planning/on-hold) → `bg-on-surface-variant/40` (completed/cancelled), with a matching dot legend reusing the same tone constants; projects that start before or end on/after the visible year show a small `‹`/`›` clip chevron; a dashed `border-primary` "Today" marker renders only when the selected year is the current year; projects missing `start` or `end` are excluded from placement and rolled into a single muted footnote line ("N projects have no scheduled dates — see List view."); the roadmap sits in its own `overflow-x-auto` container (`min-w-[720px]`) so only that box scrolls horizontally, never the page body. Frontend-only — reuses the existing `GET /reports/executive` payload and `ExecutiveProjectRow` DTO unchanged; no backend, query-hook, or DTO edits. `npm run typecheck` passes clean.

### Added — 2026-07-03 — Executive dashboard page build-out

- **[frontend/src/pages/Executive.tsx](frontend/src/pages/Executive.tsx)** — replaced the placeholder wiring proof with the full dashboard: an "Overdue Projects" block (compact table, sorted by `daysOverdue` descending, desktop grid + mobile stacked cards, `EmptyState` when nothing is overdue) rendered first, followed by a "Portfolio Timelines" block (one row per project — status chip, TAM/customer, a single horizontal progress bar colored `bg-error` when overdue else `bg-primary`, `start → end` date range, and a subtle section-color dot legend for phases). Sort order for the timelines block is overdue-first (by `daysOverdue` desc), then scheduled projects by `end` ascending, then unscheduled projects last. All colors use existing theme tokens except `section.color`, which is data-driven and applied via inline `style` as instructed. Note: the timeline is intentionally a high-level progress-bar first pass — date-accurate phase segments would require per-section start/end dates from the backend (`ExecutiveProjectRow.sections` only carries `id`/`name`/`color` today), which is a future refinement, not implemented here.

### Added — 2026-07-03 — Executive dashboard frontend wiring

- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — added `report:executive` to `PERMISSION_CATALOG` (after `report:read`) so admins can tick it onto a role in Admin > Roles.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — added `queryKeys.executiveReport()`, exported `ExecutiveProjectRow`/`ExecutiveReport` interfaces matching the `GET /reports/executive` response shape, and `useExecutiveReport()` query hook (`apiRequest<ExecutiveReport>("/reports/executive")`).
- **[frontend/src/components/ExecutiveGuard.tsx](frontend/src/components/ExecutiveGuard.tsx)** (new) — route guard cloned from `AdminGuard.tsx`, gating on `hasPermission(user, "report:executive")` (wildcard `*` holders still pass) instead of the admin wildcard.
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — added optional `permission?: string` field to `NavItem`; added an "Executive" nav item (`/executive`, icon `leaderboard`) between Reports and Settings, gated via the new `permission` field; updated the nav filter predicate to account for either `adminOnly` (wildcard) or `permission` (specific permission) gates.
- **[frontend/src/pages/Executive.tsx](frontend/src/pages/Executive.tsx)** (new) — minimal placeholder page calling `useExecutiveReport()` and rendering a loading/error state plus a "N projects · M overdue" summary line, so the wiring is verifiable ahead of the full dashboard build-out.
- **[frontend/src/App.tsx](frontend/src/App.tsx)** — registered `executive` route inside the authed `<Shell/>` tree, wrapped in `ExecutiveGuard`, placed between `reports` and `settings`.

### Added — 2026-07-03 — Executive portfolio report endpoint

- **[backend/src/routes/reports.ts](backend/src/routes/reports.ts)** (new) — `GET /reports/executive`, an org-wide, read-only portfolio roll-up for an Executive/Manager dashboard. Gated by a new permission string `report:executive` (via `requirePermission`) rather than `projectVisibilityFilter` — the permission itself is the org-wide read grant, so this route intentionally queries ALL projects regardless of TAM/SA assignment. Single `prisma.project.findMany` (no N+1) selecting `tam.username`, `customer.name`, ordered `sections`, and lean per-task `{status, startDate, dueDate}`; aggregates in JS into a lean DTO (`ExecutiveProjectRow`): `start`/`end` derived from min(task.startDate)/max(task.dueDate), `progressPct` from done/total tasks, and a new derived `isOverdue`/`daysOverdue` project-level rule (committed end date before local midnight today, and status not COMPLETED/CANCELLED — there is no `Project.deadline` column, so this is computed, not stored).
- **[backend/src/app.ts](backend/src/app.ts)** — mounted `app.use("/reports", reportsRouter)` alongside the other routers (no `/api` prefix, per convention).
- Note: the `report:executive` permission string itself is not yet seeded onto any role — an admin must add it to a role's permissions array (e.g. a new "Executive" custom role) via the existing Admin > Roles UI for this endpoint to be reachable.

### Changed — 2026-06-03 — Track DESIGN.md (remove from .gitignore)

- **[.gitignore](.gitignore)** — removed `DESIGN.md` from the "design/product docs" ignore block so the canonical design source-of-truth is versioned. `PRD.md` and `UI Design/` stay local-only; `CLAUDE.md` remains gitignored (by request — its edits stay local).
- **[DESIGN.md](DESIGN.md)** — now tracked, committed at its current state (Elitery-green/charcoal palette, spec radius scale, body weight 450, body-sm 15px, label-caps 12px, `#ebebe7` typo fix).

### Changed — 2026-06-03 — CLAUDE.md: Daily Review marked SHIPPED

- **[CLAUDE.md](CLAUDE.md)** — Daily Review is built, so: canonical-decisions line changed from "NOT YET BUILT" to "SHIPPED" (keeping the `INTERNAL`-default / never-exported invariant); `DailyReview.tsx` added to the "Shipped pages" routing list; removed the Daily Review spec from "Features Not Yet Built" and renumbered the remaining items (1. Secure Ingestion Port, 2. Reports Screen Revamp).
- **[ISSUES.md](ISSUES.md)** — dropped the now-resolved "CLAUDE.md says Daily Review NOT YET BUILT" drift item.

### Added — 2026-06-03 — ISSUES.md tracking doc

- **[ISSUES.md](ISSUES.md)** (new, repo root) — known bugs / doc-drift, pending features, deferred decisions, tech debt, and verification debt, compiled from CLAUDE.md, this changelog, and session history.

### Fixed — 2026-06-03 — UI review: design-token compliance pass

Reviewer line numbers were stale; located each by content.

- **[ProjectKanban.tsx](frontend/src/pages/views/ProjectKanban.tsx)** — card hover `shadow-[…]` → `hover:border-primary` (border-color shift, per the no-card-shadows rule); `transition-shadow` → `transition-colors`.
- **[ProjectOverview.tsx](frontend/src/pages/views/ProjectOverview.tsx)** — stat value `font-mono` → `font-body` (kills the off-spec monospace stack; kept `text-3xl tabular-nums`). **Note:** did *not* apply the suggested `text-data-mono` here — that token carries a fixed 13px (and weight 500) that would shrink/de-bold the `text-3xl` KPI number; `font-body` + existing `tabular-nums` achieves the intent. Removed the stray `text-[11px]` on the hint (now inherits body size).
- **[Admin.tsx](frontend/src/pages/Admin.tsx)** — all 4 `bg-emerald-100 text-emerald-700` → `bg-chip-emerald-bg text-chip-emerald-text` (theme-aware tokens; dropped the now-redundant manual `dark:` emerald variants and a hardcoded `hover:bg-emerald-200`).
- **[Login.tsx](frontend/src/pages/Login.tsx)** — inline `rgba(255,255,255,0.45)` / `0.2` → `text-on-surface-variant/45` / `/20`; hero pills `borderRadius: 20` → `rounded-full`, `borderWidth: 0.5px` → `border`.
- **[Shell.tsx](frontend/src/components/layout/Shell.tsx)** / **[TopBar.tsx](frontend/src/components/layout/TopBar.tsx)** / **[Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** + **[tailwind.config.ts](frontend/tailwind.config.ts)** — extracted the hardcoded collapsed-rail `w-16`/`ml-16` into a shared `sidebar-collapsed` (4rem) spacing token (`w-sidebar-collapsed` / `ml-sidebar-collapsed`) so the rail width and canvas offset can't drift.
- **[Tasks.tsx](frontend/src/pages/Tasks.tsx)** / **[ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx)** — `rounded-lg` → `rounded` on the 3 action buttons (per the small-radius scale). Error banners / inputs left as-is (not buttons).
- **[index.css](frontend/src/index.css)** — diagram `--cp-stroke` hardcoded `#3aae51` → `rgb(var(--primary))` (now follows the theme primary).
- Verified: host typecheck clean; zero leftover hardcoded values for any item.

### Changed — 2026-06-03 — Migrate caps labels to the `text-label-caps` token (now the single source of truth)

Follow-up to the label-caps token bump: the token was previously unused (caps labels were hardcoded). Migrated all usages so the token actually drives card/section labels — they now render at the token's 12px.

- **96 occurrences across 21 files** — replaced the ad-hoc `text-[11px] font-bold uppercase` with `text-label-caps uppercase`. The token supplies font-size (12px), font-weight (700), and letter-spacing (0.05em); only `uppercase` (text-transform, not part of the token) is kept inline. Net visual change vs. before: 11px → 12px, plus the token's 0.05em tracking (≈ `tracking-wider`) and `line-height: 1`.
- Verified: `text-[11px] font-bold uppercase` now appears 0×; `.text-label-caps` compiles to `font-size:12px; font-weight:700; letter-spacing:0.05em`; no size-class collisions; typecheck clean.
- Not migrated (intentional variants, left as-is): 4× `text-[11px] uppercase` (no bold) and 1× `text-[11px] font-semibold uppercase` (lighter weight) — adopting the 700-weight token would change their look.

### Changed — 2026-06-03 — Bump body-sm 14→15px, label-caps 11→12px; login hero headline 26→40px

- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** + **[DESIGN.md](DESIGN.md)** — `body-sm` fontSize 14px → 15px; `label-caps` fontSize 11px → 12px (both files kept in sync). `body-sm` is live app-wide (inherited via `@apply text-body-sm` on `<body>`; confirmed 15px in served CSS). **Caveat:** the `text-label-caps` utility is referenced by **zero** components — the app's caps labels are hardcoded as `text-[11px] font-bold uppercase` (96 sites) — so the token bump is correct but has no rendered effect until those usages adopt the token (or are bumped to `text-[12px]`). Flagged for a follow-up decision.
- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — login hero headline `fontSize` 26 → 40px (`lineHeight` 1.25 → 1.1, `letterSpacing` -0.4px → -1px) so it reads as a proper hero, not body text. Hero copy stays vertically centered via the existing `my-auto`.

### Changed — 2026-06-03 — Login two-tone split (Direction A): hero #1a1a18 / form #232321

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — left hero panel `bg-ink` (#191919) → `bg-background` (#1a1a18, darker); right sign-in panel `bg-surface-container-lowest` → `bg-surface` (#232321, slightly lighter). The login is `dark`-pinned so these theme tokens resolve to the requested dark charcoal hexes (`--background` = 26 26 24, `--surface` = 35 35 33) in both app themes. Used the named DESIGN.md tokens rather than inline hex per the theme-token convention. The dark `bg-ink` CTA button and the `bg-surface-container-lowest` input wells now read as darker insets against the lighter form panel.

### Changed — 2026-06-03 — Body text weight 400 → 450 (variable font)

- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** + **[DESIGN.md](DESIGN.md)** — `body-lg` / `body-sm` typography tokens `fontWeight` 400 → 450 (DESIGN.md frontmatter updated too, so the canonical spec doesn't drift). Headings (600), `data-mono` (500), and `label-caps` (700) unchanged. Body weight is inherited app-wide via `@apply text-body-sm` on `<body>`.
- **[frontend/index.html](frontend/index.html)** — Source Sans 3 now loaded as the **variable** font (`wght@300..700` range) instead of discrete static instances (`wght@300;400;500;600;700`). Static instances would snap `font-weight:450` to the nearest available (500); the variable axis renders a true 450. Range covers all weights in use (300–700).
- **[frontend/src/index.css](frontend/src/index.css)** — added a comment at the `body` rule documenting the 450 weight + variable-font dependency.
- Two `font-normal` (400) usages (`DailyReview.tsx`, `GanttListRow.tsx`) are `font-mono` numeric labels — intentionally left at 400.

### Fixed — 2026-06-03 — Stop generated tailwind.config.js from shadowing the .ts source (root-caused the session's "stale CSS")

`npm run build` runs `tsc -b`, and `tsconfig.node.json` (`composite: true`) included `tailwind.config.ts` / `vite.config.ts`, so tsc emitted `tailwind.config.js` / `vite.config.js` **in the project root**. PostCSS/Tailwind (and Vite) resolve `.js` before `.ts`, so the stale compiled `tailwind.config.js` silently shadowed the real `tailwind.config.ts` — every `tailwind.config.ts` edit in dev had no effect until a build regenerated the `.js`. This caused repeated "stale CSS" misdiagnoses this session (ink/sidebar/radius/shadow/weight tokens appearing not to apply).

- **[frontend/tsconfig.node.json](frontend/tsconfig.node.json)** — added `"outDir": "./node_modules/.cache/tsconfig-node"` so `tsc -b` emits the compiled config artifacts into a cache dir instead of next to the sources. `composite` forces emit, so redirecting it is the fix.
- Deleted the stale generated `frontend/tailwind.config.js` and `frontend/vite.config.js`; added both to **[.gitignore](.gitignore)** (build artifacts, not sources — `postcss.config.js` is a real source and stays tracked).
- Verified: after `npm run build`, no `*.config.js` shadow reappears in root; dev server serves the live `tailwind.config.ts` (body weight 450 confirmed in served CSS); typecheck clean.

### Added — 2026-06-03 — Elitery brand mark assets + favicon

- **[frontend/src/assets/brand/](frontend/src/assets/brand/)** (new dir) — `elitery-mark-on-dark.png` (light-grey "e" for dark surfaces) and `elitery-mark-on-light.png` (dark-grey "e" for light surfaces). Renamed from the supplied `BRAND MARK E-0{1,2}.png` (spaces removed, role baked into the name) so they import cleanly via the `@/` alias.
- **[frontend/public/](frontend/public/)** (new dir) — `favicon.png` (copy of the on-light mark; dark ink reads on the usual light browser tab strip).

### Changed — 2026-06-03 — Theme-adaptive BrandMark component

- **[frontend/src/components/BrandMark.tsx](frontend/src/components/BrandMark.tsx)** (new) — renders both Elitery marks and toggles them via the `dark:` variant: dark-ink mark (`elitery-mark-on-light.png`) on light surfaces, light-ink mark (`elitery-mark-on-dark.png`) on dark surfaces. Keys off the nearest `.dark` context, so the mark is correct on any surface/theme without hardcoding a variant.
- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)**, **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — replaced the three hardcoded on-dark `<img>` uses with `<BrandMark>`; dropped the direct asset imports. Note: login + sidebar are `dark`-pinned surfaces, so `BrandMark` resolves to the light-ink mark on them in **both** app themes (correct — those surfaces are always dark). The adaptive swap only changes the mark where the surface itself follows the theme.

### Changed — 2026-06-03 — Wire Elitery logo into login + sidebar; set favicon

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — replaced the placeholder green `bg-primary` "SV" tiles (desktop hero wordmark + mobile wordmark) with the on-dark Elitery mark (`<img class="h-8 w-8 object-contain">`). Login is pinned dark so both sit on dark surfaces. "Solvro" product wordmark text kept alongside (Elitery = company, Solvro = product).
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — replaced the green `terminal`-icon tile in the expanded-rail wordmark with the on-dark mark. Collapsed rail unchanged (toggle button only).
- **[frontend/index.html](frontend/index.html)** — added `<link rel="icon" type="image/png" href="/favicon.png" />` (there was no favicon before).

### Fixed — 2026-06-03 — Login hero copy vertically centered in the left panel

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — the left brand panel used `flex-col justify-between` across three children (wordmark / hero copy / footer), which spread them by equal gaps and pushed the hero copy low. Dropped `justify-between` and added `my-auto` to the hero-copy block: the wordmark stays pinned top, the footer bottom, and the equal auto top/bottom margins center the hero in the remaining space. Layout only.

### Fixed — 2026-06-02 — Sidebar expansion now pushes the main canvas instead of overlaying it

The `fixed`-positioned sidebar expands from 64px (collapsed) to 260px (`w-sidebar`), but the main canvas and top bar had a hardcoded `md:ml-16` (64px) offset, so an expanded sidebar covered the content.

- **[frontend/src/components/layout/Shell.tsx](frontend/src/components/layout/Shell.tsx)** — extracted the layout into an inner `ShellLayout` component rendered *inside* `SidebarProvider` so it can read `useSidebar()`. The `<main>` left margin now tracks the live sidebar width on desktop: `md:ml-sidebar` (260px) when open, `md:ml-16` (64px) when collapsed; added `transition-[margin] duration-200 ease-out` to match the sidebar's width animation. Mobile is unchanged (no margin — the sidebar overlays as a drawer).
- **[frontend/src/components/layout/TopBar.tsx](frontend/src/components/layout/TopBar.tsx)** — `<header>` given the same open-state-driven left offset + transition so it stays aligned with the canvas (was also pinned at `md:ml-16`). Pulled `open` from `useSidebar()`.

### Changed — 2026-06-02 — Pin login + sidebar to dark; hide Work Logs from sidebar

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — login now always renders dark regardless of the user's theme preference. Added `dark` to the page root so every CSS-var token in the subtree resolves to its `.dark` value (the `.dark` rule in index.css sets the custom properties on the element and they cascade). No JS/theme-provider change.
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — added `dark` to the `<aside>` so the rail stays fully dark in light mode (fixed brand element per DESIGN.md). Previously only the background was fixed (`bg-sidebar`); token-based accents like `bg-primary`/`text-primary` still flipped to the lighter light-mode green. With `dark` pinned they resolve to the dark-mode Elitery green (`#3aae51`).
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — removed the "Work Logs" nav item (`WorkLogs.tsx` is an unbuilt iTop-integration placeholder). The `work-logs` route stays registered in `App.tsx` (same pattern as the hidden Tasks route). Nav now matches CLAUDE.md's canonical order exactly: Overview → Projects → Customers → Daily Review → Reports → Settings → Admin.

### Changed — 2026-06-02 — Sidebar background → DESIGN.md charcoal #232321

- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — added fixed (non-theme-flipping) `sidebar` color token (`#232321`).
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — `SIDEBAR_BG` was the old AProjectO blue-gray `bg-[#0F1623] dark:bg-[#060912]`; now `bg-sidebar`. Per DESIGN.md the rail stays charcoal in both themes, so there's no `dark:` variant. **Not changed**: the nav item text still uses Tailwind `slate-*` greys (cool-tinted vs the spec's warm `#888780` inactive). Migrating those needs a small set of fixed always-dark text tokens — deferred; contrast on the new charcoal is fine.

### Fixed — 2026-06-02 — Second IDOR review: live GET /projects/:id hole, baseline-field bypass, design-token violations

Follow-up review found a still-open IDOR plus assorted hardening/design items. (Two reported findings were verified as non-issues — see note.)

- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — **live IDOR fixed.** `GET /:id` guarded the result with `"tamId" in filter`, but `projectVisibilityFilter` returns `{ OR: [{tamId},{saId}] }` (or `{}`), so that key never exists and the guard was a dead no-op — any authed user could fetch any project by id. Replaced the `findUnique` + dead 403 guard with `findFirst({ where: { id, ...projectVisibilityFilter(user) } })` → 404. Also removes the 403-vs-404 existence leak (the old guard threw 403; every other swept route returns 404).
- **[backend/src/routes/tasks.ts](backend/src/routes/tasks.ts)** — stripped `baselineStartDate`/`baselineDueDate` from `updateTaskSchema`. These are server-set only (snapshotted by `POST /projects/:id/baseline`); accepting them from clients would let any `task:write` user overwrite the Gantt planned-vs-actual baseline. (The `data` mapping never actually wrote them, so this was latent, not live — but the schema shouldn't advertise them.)
- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — corrected stale comment: `requireAdmin` is permission-based (`"*"` wildcard), not a `role === "ADMIN"` name check (post-e3f1cbd).
- **[backend/src/routes/dependencies.ts](backend/src/routes/dependencies.ts)** — `loadVisibleDependency` now calls the shared `ensureProjectVisible` instead of hand-rolling the project-visibility query; dropped the now-unused `Prisma` import. Behaviour unchanged (still 404 on not-visible).
- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — added fixed (non-theme-flipping) brand tokens `ink` (`#191919`) / `ink-hover` (`#2e2e2e`) for always-dark brand chrome. Replaced the `card`/`sidebar` `boxShadow` tokens with a single `overlay` shadow (`0 4px 24px rgba(0,0,0,0.18)`): DESIGN.md mandates elevation via 1px outlines + tone, with one shadow allowed only on the floating overlay layer — so there is deliberately no `card` token.
- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — removed stale lime `#8DC63F` focus ring (old AProjectO palette) → `focus-within:border-primary`; recolored the focus glow rgba lime→Elitery green; replaced inlined `#191919`/`#2e2e2e` hex with `bg-ink`/`hover:bg-ink-hover`/`text-ink`.
- **Shadow sweep**: `shadow-card` removed from ~24 card/skeleton surfaces across 14 files (they already carry `border border-outline-variant`, the spec's elevation); genuine overlays — `Modal.tsx`, `Drawer.tsx`, `TopBar.tsx` dropdown — switched to `shadow-overlay`; `Sidebar.tsx` dropped `shadow-sidebar` (keeps its border). **Visual impact**: cards lose a very faint (~4–7% opacity) drop shadow, becoming flat-with-outline per DESIGN.md.
- **Verified non-issues (no change):** (1) reported risks.ts TOCTOU→500 — the global `errorHandler` ([backend/src/http/errors.ts](backend/src/http/errors.ts):40) already maps Prisma `P2025`→404 (and `P2002`→409), and `express-async-errors` routes async throws there, so a concurrent-delete race returns a clean 404, consistent with every sibling router (none carry local catches). (2) Suggestion to fold the visibility filter into `prisma.task.update`'s `where` — not applicable: `update` takes a unique `where` that can't carry a relation filter; `updateMany` would lose the included return record. Left `ensureTaskVisible` as-is.

### Changed — 2026-06-02 — Login hero copy: drop SA/TAM/blueprint framing for plain project-ops language

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — reworded the marketing hero. Tagline "TAM Operations Platform" → "Project Operations"; H1 "Bridge SAs and TAMs. / Ship projects on time." → "Manage projects. / Ship on time."; subtitle (Secure Ingestion Port / SA-blueprint wording) → "One place to track projects, log updates, and report to customers."; feature pills "Blueprint ingestion / Daily review / Progress export" → "Project tracking / Daily notes / Customer reports". Copy only — no layout/style changes. (Tagline source stays title-case; it's uppercased via CSS `textTransform`.)

### Changed — 2026-06-02 — Page title "Solvro Command Center" → "Solvro"

- **[frontend/index.html](frontend/index.html)** — `<title>` shortened to "Solvro" to match the canonical app name.

### Changed — 2026-06-02 — Migrate color system to DESIGN.md Elitery-Green/charcoal palette; label default → #3aae51

Completes the DESIGN.md alignment started in the tailwind-token re-sync. The actual color values live as CSS custom properties in `index.css` (the config only references them via `rgb(var(--token))`), so the palette swap happens there. Replaces the old blue-gray/lime "AProjectO" palette with DESIGN.md's warm-charcoal surfaces + Elitery Green primary.

- **[frontend/src/index.css](frontend/src/index.css)** — `.dark` block (canonical default) set to **exact** DESIGN.md dark frontmatter values: surfaces `#1a1a18`→`#3a3a37` charcoal ramp, `--primary` `#3aae51` (`58 174 81`), `--on-primary` `#0f2b16`, `--primary-container` `#2d9042`, neutral grey secondary/tertiary, softer red error family. Notably `--inverse-primary` was `0 88 190` (old Solvro Blue `#0058be`) → now `#2d9042`.
- **[frontend/src/index.css](frontend/src/index.css)** — `:root` (light) block set to DESIGN.md light overrides where defined: off-white surfaces (`#f9f9f7`/`#f2f2ee`/`#ffffff`), `--primary` `#2d9042` (darkened green for WCAG on white), text `#1a1a18`/`#4a4a47`, outlines `#9a9a97`/`#d0d0cc`. **Derived (not specified by DESIGN.md for light mode):** `inverse-surface/-on-surface`, `primary-container` (`#c8e6cf`), `on-primary-container`, `inverse-primary`, `secondary`/`-container`/`on-`, `tertiary`/`on-`, and the error family (kept the existing M3 light reds). These are reasonable palette-consistent fills; adjust if the spec later defines them. Note: DESIGN.md's light `surface-container` comment value `#ebebе7` contains a stray Cyrillic `е` — used the intended `#ebebe7` (`235 235 231`).
- **[frontend/src/index.css](frontend/src/index.css)** — Network Diagram critical-path accent migrated off blue to honor the single-accent rule: light-mode `--diagram-glow` `0, 88, 190` → `58, 174, 81` and `--cp-stroke` `#0058be` → `#3aae51`. Dark-mode diagram accent (white) unchanged.
- **Not changed**: chip/status tokens (`--emerald/amber/rose/violet-*`) — these are intentionally high-saturation status indicators per DESIGN.md "Semantic colors," independent of the brand primary. The `LabelPicker` swatch palette and customer `AVATAR_PALETTE` arrays still list `#0058be` as one selectable option among many — left as-is (palette choices, not the brand accent).
- **[backend/prisma/schema.prisma](backend/prisma/schema.prisma)** — `Label.color` default `#0058be` → `#3aae51`.
- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — label-create fallback `body.color ?? "#0058be"` → `"#3aae51"` (kept in lockstep with the schema default).
- **[backend/prisma/migrations/20260602223228_label_default_color_elitery_green/migration.sql](backend/prisma/migrations/20260602223228_label_default_color_elitery_green/migration.sql)** (new) — `ALTER TABLE "labels" ALTER COLUMN "color" SET DEFAULT '#3aae51'`. Generated via `prisma migrate diff` (non-interactive, per the migration gotcha), applied with `migrate deploy`, client regenerated; `migrate diff --exit-code` confirms zero remaining drift. Only changes the default for **new** labels — existing rows keep their stored color.

### Changed — 2026-06-02 — tailwind.config.ts: re-sync radius + typography tokens to DESIGN.md frontmatter

The literal-value tokens in the Tailwind theme had drifted larger than the canonical `DESIGN.md` frontmatter (`rounded` and `typography` blocks). Re-synced the two token groups that live as real values in the config; DESIGN.md frontmatter wins per CLAUDE.md.

- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — `borderRadius` scale reset to the spec: `sm 0.125 / DEFAULT 0.25 / md 0.375 / lg 0.5 / xl 0.75rem / full 9999px`. Previously `DEFAULT 0.5 / lg 1 / xl 1.5 / 2xl 2rem` — larger than spec, which forbids large radii. **Visual impact**: `rounded` (256 uses) 8px→4px, `rounded-lg` (39) 16px→8px, `rounded-xl` (8) 24px→12px. `2xl` key dropped (DESIGN.md defines none); the single `rounded-2xl` site falls back to Tailwind's built-in `2xl` (1rem). `rounded-full` (50, pills/avatars) unchanged.
- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — named `fontSize` roles reset to spec px: `h1 32 / h2 24 / body-lg 16 / body-sm 14 / data-mono 13 / label-caps 11`. Were inflated +1–2px. The generic `xs..4xl` scale (separate, deliberate +1px readability override, not a DESIGN.md token) is left untouched.
- **Not touched**: color tokens. They are CSS-var-indirected (`rgb(var(--token))`), so their literal values live in `src/index.css`, not the config — and that file currently does **not** match the new DESIGN.md palette (Elitery Green `#3aae51` + warm-charcoal surfaces). `index.css` still carries `--primary: 141 198 63` (`#8DC63F`) and blue-gray surfaces. Migrating colors to DESIGN.md requires a separate `index.css` edit and is left pending a decision (large visual change).

### Fixed — 2026-06-02 — IDOR follow-up: close remaining unguarded item routes; centralise visibility helpers

Review of the prior IDOR sweep found four resources still reachable by id without a visibility check, plus a duplicated helper and a 400-vs-404 oracle. Closed all of them and moved the shared helpers out of the route file.

- **[backend/src/lib/visibility.ts](backend/src/lib/visibility.ts)** (new) — canonical home for `projectVisibilityFilter`, `ensureProjectVisible`, `ensureTaskVisible`. Previously these lived in `routes/projects.ts` and were imported by sibling routers (`risks`, `tasks`, `dependencies`, `overview`), which is a latent circular-import hazard (projects.ts can't import a sibling route that imports it back). Lifting them to `lib/` removes that coupling. Behaviour identical.
- **[backend/src/routes/sections.ts](backend/src/routes/sections.ts)** — `PATCH /:id` and `DELETE /:id` were gated only by `requirePermission("project:write")`; any writer could mutate sections on projects they can't see by guessing the id. Added `ensureSectionVisible` (resolve `projectId` → `ensureProjectVisible`, 404 if not visible) to both.
- **[backend/src/routes/labels.ts](backend/src/routes/labels.ts)** — same IDOR on `PATCH /:id` / `DELETE /:id` (gated only by `task:write`). Added `ensureLabelVisible`.
- **[backend/src/routes/tasks.ts](backend/src/routes/tasks.ts)** — `PATCH /:id` ran `ensureTaskVisible` *after* the `parentTaskId === id` self-parent guard, so a caller could distinguish "task exists but not visible" (400) from "no such task" (404) — an existence oracle. Moved the visibility check ahead of all field validation. Import now from `../lib/visibility.js`.
- **[backend/src/routes/risks.ts](backend/src/routes/risks.ts)** — removed the local `ensureProjectVisible` copy (which carried a `req as never` cast hack) in favour of the canonical helper; calls now pass `req.user!` directly.
- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — `POST /:id/baseline` had `project:write` but no visibility check; added `ensureProjectVisible`. Replaced six inline find-or-404 visibility blocks (risks/notes/dependencies GET+POST) with `ensureProjectVisible` calls. Helper definitions removed (now imported from `lib/visibility.js`).
- **[backend/src/routes/dependencies.ts](backend/src/routes/dependencies.ts)**, **[backend/src/routes/overview.ts](backend/src/routes/overview.ts)** — import path updated to `../lib/visibility.js`; no logic change.
- No schema/migration changes. Backend `tsc --noEmit` clean.

### Fixed — 2026-05-20 — IDOR cluster on task/section/label/project-PATCH endpoints

A read-only audit found that `projectVisibilityFilter` was correctly applied on the routes added later (risks, notes, dependencies) but skipped on the older task/section/label routes and on the project PATCH route. As a result, any authed user with `task:write` or `project:write` (the default TAM role grants both globally) could read or mutate resources in any project by guessing the ID — the permission gate was the only thing scoping them, and permission ≠ visibility. Closed in one sweep across 11 routes.

- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — added `ensureProjectVisible(user, projectId)` and `ensureTaskVisible(user, taskId)` helpers right under `projectVisibilityFilter`. Both follow the existing find-or-404 pattern used at risks/notes/dependencies (return 404, not 403, so the caller can't probe project existence). Wired into: `PATCH /:id`, `GET /:id/tasks`, `POST /:id/tasks`, `GET /:id/sections`, `POST /:id/sections`, `GET /:id/labels`, `POST /:id/labels`. The collection POSTs (`/tasks`, `/sections`, `/labels`) and the project PATCH were the data-mutation holes; the GETs were enumeration holes.
- **[backend/src/routes/tasks.ts](backend/src/routes/tasks.ts)** — extended the `./projects.js` import to pull in `ensureTaskVisible`. Wired into: `PATCH /:id`, `DELETE /:id`, `GET /:id/comments`, `POST /:id/comments`. The task lookup is gated on the parent project's visibility filter, so a TAM with global `task:write` can no longer reach into tasks on projects they aren't assigned to.
- **Behaviour unchanged** for users with `project:view-all` or `*` (admin / STAKEHOLDER): `projectVisibilityFilter` short-circuits to `{}`, so the visibility lookup finds the row and the request proceeds. No schema/migration changes; the helpers are pure async functions added to existing files.

### Removed — 2026-05-20 — `blueprint:create` / `blueprint:read` permissions (dead — not enforced anywhere)

The two `blueprint:*` permission strings were placeholders for the Secure Ingestion Port (the planned SA blueprint → tasks webhook), which is not yet built. A repo-wide grep confirmed zero enforcement: no backend `requirePermission("blueprint:…")` or `hasPermission(user, "blueprint:…")` call sites, no `/webhook/blueprint` route, no frontend gate. Their only presence was the SA role seed and the PERMISSION_CATALOG tick-box, where they read as functional permissions but did nothing. Removed to stop confusing the editor; when the ingestion port is implemented they'll be re-introduced alongside the actual gate.

- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — dropped from `PERMISSION_CATALOG` (no more tick-boxes for them in Admin > Roles).
- **[backend/prisma/seed.ts](backend/prisma/seed.ts)** — `SA` role permissions reduced from `["blueprint:create", "blueprint:read", "project:read"]` to `["project:read"]`. Seed upserts on every deploy, so existing SA roles get the two strings stripped on next backend start. No behavior change (they weren't enforcing anything).

### Changed — 2026-05-20 — Admin > Roles: tidy the layout (visual only)

Polish pass on the Roles tab after Phase 1. No logic changes; typecheck clean.

- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — `PermissionPicker` is now a vertical **single-column list** (one permission per row, hairline dividers, hover highlight, `checkbox · mono-key · — label`), instead of a multi-column grid where short keys (`*`) sat next to wider ones (`project:view-all`) and made the layout look ragged. The create-role form is **stacked** (Role name on top, Permissions below, Add-role button right-aligned in a footer row) — no more side-by-side fields, and the Role-name input stretches to the full form width so it visually anchors with the permissions list. The help paragraph is trimmed to two short sentences with `code` highlights; the "Reserved" badge is recoloured to a neutral surface tone so it no longer competes with the green `*` chip; in the table, the permissions cell renders **per-permission chips** (mono pill each), with `*` shown as a "★ full access" primary-tone chip for scannability.

### Changed — 2026-05-20 — RBAC Phase 1: role-name teardown (visibility + admin/services + role rename + UI)

Follow-up to the scoped-safe RBAC change below. Operator decided the 5 "built-in" roles should no longer be special. Phase 1 (no schema migration) removes the role-name dependency from project visibility, the admin gate, services writes, project reassignment, and the frontend role-name gates; built-in protection collapses to PENDING only (Google first-login still finds it by name — Phase 2 turns that into a configurable default role on `AuthConfig`).

- **Backend visibility (the actual fix)** — [backend/src/routes/projects.ts](backend/src/routes/projects.ts) `projectVisibilityFilter` no longer switches on `STAKEHOLDER`/`TAM`/`SA`. New rule: `hasPermission(user, "project:view-all")` (which `"*"` also satisfies) → all projects; otherwise → `{ OR: [{ saId: user.sub }, { tamId: user.sub }] }` (you see what you're attached to). [backend/src/routes/overview.ts](backend/src/routes/overview.ts) now imports the same helper instead of its own switch — single source of truth.
- **Seed** — [backend/prisma/seed.ts](backend/prisma/seed.ts) adds `project:view-all` to `STAKEHOLDER` so it keeps seeing every project after the name-switch is gone (seed upserts on every deploy, so this lands automatically; existing STAKEHOLDER JWTs are stale until re-login, ≤8h).
- **Services + admin de-naming** — [backend/src/routes/services.ts](backend/src/routes/services.ts) replaces `requireRole("ADMIN")` with the permission-based `requireAdmin`. [backend/src/routes/admin.ts](backend/src/routes/admin.ts): `BUILTIN_ROLES` collapsed to `PROTECTED_ROLES = {"PENDING"}` (only PENDING is still reserved); ADMIN-immutable in `PATCH /roles/:id` removed (anti-lockout `ensureAdminsRemain` now protects); the "reassign target must be TAM/ADMIN" check on `PUT /projects/reassign` is gone (any active user is eligible).
- **Role rename** — `PATCH /admin/roles/:id` accepts an optional `roleName` (same uppercase regex as create, blocks renaming a reserved role or taking a reserved name, blocks collisions). [frontend/src/lib/queries.ts](frontend/src/lib/queries.ts) `useAdminUpdateRolePermissions` extended to send `roleName`; also invalidates the users query so the user-tab role labels refresh after a rename.
- **Frontend de-naming** — [frontend/src/components/ProjectFormModal.tsx](frontend/src/components/ProjectFormModal.tsx) + [frontend/src/components/CustomerFormModal.tsx](frontend/src/components/CustomerFormModal.tsx) SA/TAM dropdowns list all users (role-name filter dropped; auto-default of self-as-TAM removed). [frontend/src/pages/views/ProjectKanban.tsx](frontend/src/pages/views/ProjectKanban.tsx) drag-gate switched from `role === "TAM"||"ADMIN"` to `hasPermission(user, "task:write")`. [frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx): Roles tab now has an inline rename input (disabled for the reserved PENDING row); the "Built-in" badge becomes "Reserved" and only shows for PENDING; "Edit perms" → "Edit" (covers name + perms); reassign-target list (`tamCandidates`) drops the TAM/ADMIN name filter (lists all active users). Help text rewritten to explain `*` = admin and `project:view-all` = see-all. [frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx) PERMISSION_CATALOG gains `project:view-all`.

Known caveats (flagged, not fixed): (1) existing JWTs for STAKEHOLDER users won't have `project:view-all` until they re-login (≤8h token expiry); during the gap they will only see assigned projects. (2) `useUsers()` returns no `active` field, so the SA/TAM dropdowns list all users including deactivated; cleanup if it becomes a UX issue. (3) Phase 2 (deferred): replace the hardcoded `roleName: "PENDING"` in Google provisioning with `AuthConfig.defaultRoleId` (Prisma migration); PENDING stays reserved until then. (4) CLAUDE.md's "built-in roles are structural" architecture note is now partially stale (it's gitignored, not rewritten here).

### Changed — 2026-05-16 — RBAC: permission-based admin gate + tick-box permission editor

Admin requested roles/permissions to feel admin-managed rather than hardcoded, and the permissions field to be a picker. Scoped to the safe core (the user explicitly chose this over a full role-name teardown, which would have broken relational project visibility and risked admin lockout — SA/TAM/STAKEHOLDER/PENDING name-based logic is intentionally left intact).

- **[backend/src/http/auth.ts](backend/src/http/auth.ts)** — `requireAdmin` no longer checks `role === "ADMIN"`; it now requires the `*` wildcard permission (`hasPermission(req.user, "*")`). Any role granted `*` is an admin, so an admin can create their own admin-equivalent custom role.
- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — added `ensureAdminsRemain(tx)`: after a role-permission edit (`PATCH /roles/:id`) or a user role reassignment (`PATCH /users/:id/role`), a transaction-wrapped count asserts ≥1 active user still has a `*` role, else it rolls back with HTTP 409 `would_lock_out`. Prevents the new model's lockout (removing the last full-access admin would make `/admin` unreachable). Existing self-demote/self-deactivate guards retained. Built-in role rename/delete protections + ADMIN-immutable retained.
- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — added `PERMISSION_CATALOG` (curated vocabulary: `*`, `project:read|write`, `task:read|write`, `blueprint:create|read`, `report:read`) for the editor. Backend still stores permissions as a free string array; the catalogue is a UI affordance, not server-enforced.
- **[frontend/src/components/AdminGuard.tsx](frontend/src/components/AdminGuard.tsx)**, **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — admin route guard + sidebar "Admin" item now gate on `hasPermission(user, "*")` instead of `role === "ADMIN"`.
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — new `PermissionPicker` checkbox component replaces the comma-separated free-text input for both create-role and edit-perms; `*` supersedes (implies + disables the rest). Roles-tab help text rewritten to explain the permission-based admin model.

Known gap (flagged, not fixed): `PATCH /users/:id/deactivate` is not wrapped by `ensureAdminsRemain` — deactivating the last *other* admin user could still lock out (self-deactivate is already blocked). Lower-likelihood vector via the UI; can add the same guard if needed. No schema/migration changes.

### Changed — 2026-05-16 — Prod deploy: configurable bind address (BIND_ADDR)

Follow-up to the "configurable, local-only host ports" entry below. That change bound every published port to `127.0.0.1`, which the operator discovered makes the app unreachable from their machine (loopback only) — "local only" was meant as "our private network", not "loopback". `setup.sh` now exposes the bind interface as a knob; the secure `127.0.0.1` default is unchanged so nobody who doesn't set it is affected.

- **[setup.sh](setup.sh)** — adds `BIND_ADDR` (env var or interactive prompt, same intake pattern as the ports; default `127.0.0.1`). `0.0.0.0` publishes the website + API on all interfaces (reachable on the network); a specific IPv4 publishes on just that interface. Validated via a new `is_ipv4` helper (dotted-quad, octets 0–255; rejects hostnames/IPv6). Threaded into `write_compose_file` as `${BIND_ADDR:-127.0.0.1}:` on the frontend and backend mappings (literal in the single-quoted heredoc → resolved by compose from `~/solvro/.env`), persisted to `.env`, and reused on the update branch (it already sources `.env`). The readiness probe now targets a computed `HEALTH_HOST` (`127.0.0.1` for `127.0.0.1`/`0.0.0.0`, else the bind IP) so a specific-IP bind doesn't break the wait loop. Success/update banner, tunnel-vs-network guidance, and the Google-OAuth origin hint are now `BIND_ADDR`-aware.
- **Postgres stays loopback by design:** the conditional `postgres` `ports:` block remains hardcoded to `127.0.0.1` regardless of `BIND_ADDR` — exposing the database on the network just because the web app is exposed would be a footgun. Documented in-script. Security note: with `BIND_ADDR=0.0.0.0`/a LAN IP, only the in-app login protects the app at the network layer (CORS is `*`); keep it behind a trusted network/VPN/firewall.
- No application/image/schema changes; container ports (80/3000/5432) and the internal nginx→`backend:3000` proxy are untouched.

### Fixed — 2026-05-16 — Random Postgres password could break DATABASE_URL (P1013)

Surfaced while testing the configurable-ports change on the server (not caused by it — the lines below predate that commit). `POSTGRES_PASSWORD` was generated with `openssl rand -base64 24`, whose alphabet includes `/`. When the random draw contained a `/`, the backend's `DATABASE_URL` (`postgresql://solvro:<pw>@postgres:5432/...`) had its authority truncated at that `/`, so the parser read a bogus port and crash-looped with `P1013: invalid port number in database URL`. ~40% of fresh installs were affected (probabilistic — earlier installs drew safe passwords); Postgres itself was Healthy, only the URL string was mis-parsed.

- **[setup.sh](setup.sh)** — `POSTGRES_PASSWORD` is now `openssl rand -hex 24` (48 chars, 192 bits, alphabet `[0-9a-f]` only — URL-safe everywhere it is used), mirroring the adjacent `JWT_SECRET` hex generation. Single line changed; the fresh-install path already wipes `solvro_pgdata` and re-initialises Postgres with the new password, so there is no stale-credential mismatch. No change to `${POSTGRES_PASSWORD}` interpolation, the `.env` write, or the compose template.

### Changed — 2026-05-16 — Prod deploy: configurable, local-only host ports in setup.sh

Deploying onto a server with other containers (host port 80 already taken by another app; another Postgres on 127.0.0.1:5432). The prod stack had hardcoded `80:80` / `3000:3000` host publishes and no knob to change them. Ports are now configurable at install, and—per the operator's decision that this instance is accessed locally only—every port binds to `127.0.0.1` instead of `0.0.0.0`.

- **[setup.sh](setup.sh)** — adds `FRONTEND_PORT` (default 80), `BACKEND_PORT` (default 3000), and optional `POSTGRES_PORT` (default: **not published** — DB stays private as before). Each is taken from an env var or an interactive `/dev/tty` prompt with the default pre-filled (mirrors the existing `ADMIN_EMAIL`/`ADMIN_PASSWORD` intake; non-interactive runs fall back to defaults). Validated as integers 1–65535, must be distinct. Persisted to `~/solvro/.env`; frontend/backend resolve via compose `${VAR:-default}` interpolation so they can be changed later by editing `.env` + `docker compose up -d`. Compose generation moved into a `write_compose_file` function called **after** ports are known (both the fresh-install and update branches; the update branch sources `~/solvro/.env` first), because the Postgres `ports:` block is conditional (emitted only when `POSTGRES_PORT` is set) — interpolation can't express an optional key. Healthcheck wait, success/update messages, and the Google-OAuth origin hint now use the chosen ports and an SSH-tunnel note. Container ports (80/3000/5432) and the app images are unchanged; nginx still proxies `/api` to the internal `backend:3000`.
- **Behavior change to note:** all published ports now bind to `127.0.0.1` (local-only) instead of `0.0.0.0`. A *re-run/update of any existing install* therefore also flips it to localhost-only (reach it via SSH tunnel). Intended per the approved plan; no application code, schema, or image changes.

### Changed — 2026-05-16 — Overview: personalized welcome, project health signal, "needs attention" list

Three targeted UI fixes to the global Overview page (no other files touched; no new imports).

- **[frontend/src/pages/Overview.tsx](frontend/src/pages/Overview.tsx)** — (1) Heading is now `Welcome back, {firstName}.` via a new `firstNameOf` helper: `AuthUser` carries no name field, so the first name is derived from `username` (falling back to `email`) by splitting on `.`/`@` and capitalizing. (2) Each card in the recent-projects list gets a 3px health-signal left border (inline `borderLeft*` style — layout/padding unchanged): ACTIVE → `#8DC63F`, PLANNING/ON_HOLD/COMPLETED → `#6B7280`. (3) Section heading renamed "Recently updated projects" → "Projects needing attention"; the list is sorted by health rank (at-risk → on-track → neutral) then `updatedAt` desc within a bucket, before `slice(0, 6)`.

Limitation flagged in-code: the overview query (`OverviewProject`) returns no per-project overdue count, so the amber `#F59E0B` "at risk" state is unreachable and ACTIVE always reads as on-track. `TODO(health-signal)` comments on `healthColor`/`healthRank` mark where to re-rank ACTIVE+overdue once that data is exposed.

### Changed — 2026-05-16 — Login screen restyled to the Elitery split-panel design

Visual-only revamp of the sign-in screen. **No auth logic, handlers, API calls, or conditional rendering were touched** — `messageForApiError`, all state, `handleGoogleCredential`, `handlePasswordSubmit`, the authenticated redirect, the Google config ternary, and the `<details>` admin form are byte-for-byte unchanged.

- **[frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)** — split panel: dark `#191919` brand panel (left 44%, `md:grid-cols-[44%_1fr]`, `h-screen overflow-hidden`) with three decorative rings, "SV" wordmark, eyebrow/headline/body/pills hero block, and the version string; white right panel with a 280px-max centered column, restyled "Sign in" header, the existing Google block, the OR divider, the admin password `<details>`, and an "Internal use only · Elitery © 2026" footer. Greens are expressed via the `primary` token with alpha (`text-primary`, `border-primary/30`, `border-primary/[0.12]`) since `--primary` is already `#8DC63F` — keeps the screen themed per CLAUDE.md rather than hardcoding the brand hex. The bespoke dark surface (`#191919`/`#2e2e2e`) and white-overlay opacities have no token and are inline per the explicit spec. Admin inputs now use the spec focus ring (`focus-within:border-[#8DC63F]` + `0 0 0 3px rgba(141,198,63,0.15)` shadow); the admin submit button is `#191919` → `#2e2e2e` on hover.

Flagged deviation: the spec's custom green "Sign in with Google" button was **not** applied — the Google sign-in is the `@react-oauth/google` `<GoogleLogin>` iframe widget, which cannot be recolored without switching to `useGoogleLogin` (an auth-handler change explicitly forbidden by the task). The official widget + its surrounding block are kept verbatim. "No scrolling" is honored at the page level (`overflow-hidden`); the collapsed-by-default admin form fits typical viewports but is not independently scrollable if expanded on a very short screen.

### Fixed — 2026-05-15 — ADMIN (wildcard) users see all active projects on Daily Review & Reports

The Daily Review / Reports rework scoped the project list to `tamId === user.id`, which left built-in ADMIN (and any custom role with `*`) seeing an empty list — flagged at the time. Now wildcard-permission users see every `ACTIVE` project; a TAM stays scoped to the ones they own.

- **[frontend/src/pages/Reports.tsx](frontend/src/pages/Reports.tsx)**, **[frontend/src/pages/DailyReview.tsx](frontend/src/pages/DailyReview.tsx)** — filter is now `status === "ACTIVE" && (hasPermission(user, "*") || p.tamId === user.id)`, using the canonical `hasPermission` gate from `@/lib/auth` (the same wildcard convention used across the app and mirroring the backend `projectVisibilityFilter`). Empty-state copy de-assumes ownership ("No active projects to export/review"). Scope stays **ACTIVE-only** on both screens (they are active-project tools); wildcard users are not shown non-active projects here. STAKEHOLDER is not special-cased (request was ADMIN-specific); flag if it should also see all.

### Changed — 2026-05-15 — Daily Review reworked into a cross-project review console

UI + logic pass on the existing Daily Review page (not a rebuild). Replaced the two-column "note rows + notes-log pane" layout with a single scrollable cross-project view: a session stats bar plus one metric-rich card per active project. This makes it the morning review console described in CLAUDE.md "Daily Review screen".

- **[frontend/src/pages/DailyReview.tsx](frontend/src/pages/DailyReview.tsx)** — rewritten in place (named `export function DailyReview()` kept, so the `/daily-review` route is unchanged). Each `ProjectCard` pulls per-project data via the requested hooks (`useProjectTasks`/`useProjectRisks`/`useProjectNotes`/`useAddProjectNote`) and shows: name, customer, current phase, progress %, overdue count, open-risk count, and a schedule-variance chip. Cards lift their metrics to the parent, which aggregates the top stats bar (projects reviewed, notes written today, overdue total, open-risks total). The visibility toggle now makes **CUSTOMER_FACING visually prominent** (brand-accent fill + `campaign` icon + an explicit "will be included in the customer export" caption); INTERNAL stays the quiet default. Save still relies on the server's automatic `createdAt`; a transient "Saved HH:MM" confirms it.

Decisions / changes from prior behaviour (flagged): (1) Project scope tightened to `tamId === user.id && status === "ACTIVE"` — previously the page showed all `ACTIVE || PLANNING` projects to everyone with no TAM scoping; PLANNING is now excluded and non-TAM roles see an empty list, matching the Reports screen's scoping. (2) The right-hand **Notes-log / history pane was removed** — the new spec defines the page as the logging console (stats + cards) and doesn't include a history browser; per-project history still lives on the project pages. (3) "Current phase" / schedule variance reuse the same derivations as the Reports export (earliest unfinished section by `position`; max `dueDate` vs max `baselineDueDate`) — kept inline rather than imported from `lib/export/projectExport.ts` so that dynamically-imported export module stays out of the main bundle. (4) "Notes written today" / "projects reviewed" count only the logged-in user's own notes dated today (session-accurate), not all authors'.

### Changed — 2026-05-15 — Reports rebuilt as the customer export-packet screen

Replaced the Reports analytics dashboard (recharts pie charts + KPI strip) with the export flow from CLAUDE.md "Reports screen (revamp pending)". Reports is now the **output** screen of the core TAM loop: pick an active project → generate a structured markdown packet → copy/download → paste into an external AI tool. No native AI summarisation (deliberately deferred per CLAUDE.md).

- **[frontend/src/lib/export/projectExport.ts](frontend/src/lib/export/projectExport.ts)** (new) — pure, React-free builder `buildProjectExportMarkdown(input)` plus `downloadMarkdownFile()` / `exportFileName()` helpers. Packet sections: identity, health (progress %, schedule variance vs. baseline), phase breakdown, task signals (overdue/blocked/completed counts — not the task list), open risks with score = probability×impact, and customer-facing notes from the last 14 days. Loaded via dynamic `import()` at the call site so it stays out of the main bundle (same discipline as the Gantt export layer).
- **[frontend/src/pages/Reports.tsx](frontend/src/pages/Reports.tsx)** — rewritten. Lists the logged-in TAM's `ACTIVE` projects (`p.tamId === user.id && p.status === "ACTIVE"`); selecting one fetches its data via existing hooks (`useProjectTasks`/`useProjectRisks`/`useProjectSections`/`useProjectNotes`/`useProjectDependencies`), renders a live markdown preview, and offers Copy + Download .md. The notes hook is queried with `visibility: "CUSTOMER_FACING"` and the builder **re-filters** to `CUSTOMER_FACING` defensively, so INTERNAL notes cannot reach the export under any path. `recharts` is no longer imported by this page. Kept the named `export function Reports()` so the `App.tsx` `/reports` route is unchanged.

Decisions / limitations (flagged): (1) "blocked" has no first-class model field, so it is derived as a not-done task with a not-done predecessor — this required `useProjectDependencies`, one hook beyond the five named in the request, because the named hooks carry no blocked signal. (2) `Task` has no completion timestamp, so "completed" is cumulative DONE count, not a 14-day window — labelled as such in the packet. (3) "Current phase" has no model concept; derived as the earliest section (by `position`) with unfinished tasks. (4) Project scoping is `status === "ACTIVE"` only (PLANNING/ON_HOLD excluded) and `tamId === user.id`, so non-TAM roles (e.g. ADMIN) see an empty list on this screen by design.

### Changed — 2026-05-15 — Primary color rebranded to Elitery green

App primary action color changed from Solvro Blue (`#0058be`) to the Elitery brand green (`#8DC63F`), with the hover/active variant set to `#7AB52F`. Brand change only — surface, semantic status (success/warning/error/info), and chip tokens are untouched.

- **[frontend/src/index.css](frontend/src/index.css)** — `--primary` `0 88 190` → `141 198 63` (#8DC63F) and `--primary-container` `33 112 228` → `122 181 47` (#7AB52F) in **both** the `:root` (light) and `.dark` blocks so the brand is consistent across themes. `--primary-container` is the codebase's de-facto hover/active variant (the dominant button pattern is `hover:bg-primary-container`), so the requested "hover/active variant" maps onto it.
- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — no change required: `primary` / `primary-container` are defined as `rgb(var(--primary) / <alpha-value>)`, indirected through the CSS vars above, so they pick up the new ramp automatically (Tailwind opacity utilities like `bg-primary/90` still work).

Out of requested scope, flagged for follow-up: `--on-primary` stays white in light mode — white-on-`#8DC63F` is low-contrast (~1.8:1, fails WCAG AA); `--inverse-primary` and the `.diagram-canvas` `--cp-stroke` / `--diagram-glow` literals remain blue.

### Changed — 2026-05-15 — Task drawer slides out on close (exit animation)

Follow-up to the task-drawer change below. The drawer slid in but vanished instantly on close because every call site conditionally unmounts the form (`{editTask && <TaskFormModal …/>}`), so an exit animation couldn't be driven off `open` alone. Rather than touch the 7 call sites, the close is now orchestrated in `TaskFormModal` (it owns every close trigger) and `Drawer` defers the real unmount until the slide-out transition finishes.

- **[frontend/src/components/Drawer.tsx](frontend/src/components/Drawer.tsx)** — added a `closing` prop (drives the slide-out) and an `onClosed` callback (fired on the panel's `transitionend` for `transform`, with a 280ms fallback for reduced-motion / hidden-tab). Esc and click-outside call `onClose` so the owner can start the animated close instead of unmounting synchronously.
- **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — added a `closing` state + `requestClose()`; every close path (Cancel, header ×, Esc, click-outside, and post-submit / post-delete success) now calls `requestClose()` which sets `closing`. The parent's real `onClose` (which unmounts the component) is passed as `onClosed`, so it only runs after the slide-out completes. No call-site or `TaskFormModalProps` changes.

### Changed — 2026-05-15 — Task drawer offset below the TopBar

Follow-up to the task-drawer change below. The drawer (and its click-catcher) covered the full viewport including the TopBar. Now the whole overlay starts at `top-14` so the TopBar stays visible **and** interactive (search / notifications / account) above the drawer — matching the `RightSidebar` offset. Click-outside-closes now applies only to the board area below the TopBar.

- **[frontend/src/components/Drawer.tsx](frontend/src/components/Drawer.tsx)** — wrapper `fixed inset-0` → `fixed inset-x-0 bottom-0 top-14`. Panel `h-full` now fills the space between the TopBar and the viewport bottom (desktop + mobile).

### Changed — 2026-05-15 — Task form opens as a right-side drawer instead of a centered blurred modal

The Add/Edit task form was a centered modal with a `backdrop-blur-sm` scrim that hid the board. TAMs wanted to keep the List/Kanban/Gantt visible while creating or editing a task. Now it slides in from the right with no blur; the board stays visible behind it and a click outside the panel closes the drawer. Applies to **both** create and edit (one consistent flow — not a split where create is a drawer and edit a modal).

- **[frontend/src/components/Drawer.tsx](frontend/src/components/Drawer.tsx)** (new) — right-anchored slide-in panel mirroring the `RightSidebar` transform pattern (`translate-x-full` → `translate-x-0`, `duration-200 ease-out`). Transparent full-area click-catcher (`onMouseDown={onClose}`) — no dim, no blur, so the board behind reads normally but the first outside click dismisses. Esc closes. Mobile collapses to a full-screen sheet (`w-full`), matching the app's `md:` breakpoint convention. Same prop shape as `Modal` (`title` / `customHeader` / `footer` / `widthClass`) so it's a drop-in for form panels. No exit animation — call sites already conditionally unmount the form on close (parity with `Modal`).
- **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — swapped `Modal` → `Drawer` (import + open/close tags only). All props, the custom header, `widthClass="max-w-lg"`, and the 7 call sites are unchanged — `TaskFormModalProps` is untouched, so Tasks / ProjectGantt / ProjectKanban / ProjectTimeline / ProjectList need no edits.
- **[frontend/src/components/Modal.tsx](frontend/src/components/Modal.tsx)** — left as-is. `ConfirmModal` and the Admin Sign-in modal still want the centered/blur treatment; only the task form moved to a drawer.

Body scroll is intentionally **not** locked (unlike `Modal`) so the board stays usable until the click that closes the drawer. Frontend `npm run typecheck` clean.

### Fixed — 2026-05-15 — Gantt: connector hit-testing no longer shadows bar resize handles

Regression from the "deletable connectors" change immediately below (caught in testing — bar resize only worked on the left edge). The transparent 14px connector hit path sits above the bars and, near each endpoint, overlapped the bars' 6px resize handles; the invisible `opacity-0` connector dots were also still capturing pointer-downs at the bar edges.

- **[frontend/src/components/gantt/GanttConnectors.tsx](frontend/src/components/gantt/GanttConnectors.tsx)** — connector routes are now built as a point list; the visible path uses the full route while the **hit path is arc-length-trimmed `HIT_TRIM=14`px off both ends** (`trimPolyline` helper), keeping the fat hit strip clear of the resize handles + connector dots at each bar edge. Falls back to the full route only for pathologically short connectors (still deletable). Visible arrows are unchanged (axis-aligned `L` segments render identically to the prior `H`/`V`).
- **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** — both connector dots get `pointer-events-none` + `group-hover:pointer-events-auto`, so while a row isn't hovered the (invisible) dots don't intercept resize-handle pointer-downs; they only become interactive when revealed on hover.

Frontend `npm run typecheck` clean.

### Added — 2026-05-15 — Gantt: left+right hover-revealed dependency handles, deletable connectors

Two gaps in the Gantt dependency interaction. Frontend-only — no schema/API change; the `useDeleteDependency` hook and `DELETE /dependencies/:id` route already existed and were simply unwired.

- **Left-edge dependency handle** added alongside the existing right one. Right handle keeps today's semantics (grabbed task = predecessor, drop target = successor). Dragging from the **left** handle creates a *reverse* dependency: the drop target becomes the predecessor and the grabbed task the successor — the standard Gantt "this task depends on that one" gesture. Arrows still always render predecessor-right → successor-left, so left-handle deps render identically to right-handle ones and `GanttConnectors` path math is unchanged. The persisted `sourceHandle: "right-source"` / `targetHandle: "left-target"` is unchanged for the same reason.
- **Both handles are now hover-revealed per bar row** instead of sitting at a permanent `opacity-70` (visual noise). Gated via a `group` class on the `GanttRow` container + `group-hover:opacity-100` on the handle dots.
- **Connectors are now hover-highlightable and deletable.** Hovering a connector thickens/brightens it and shows an inline × button at the midpoint of its main run; one click removes the dependency. No confirm dialog — deletion is trivially redoable by re-dragging, and creation has no confirm either, so a modal would be inconsistent friction. A transparent 14px-wide hit path (`pointer-events: stroke`) makes the thin 1.5px line hoverable; the connector `<svg>` was raised to `zIndex: 5` (above bars at 2–3 and the rubber-band overlay at 4) with `pointer-events-none` retained on the `<svg>` so only the hit strip and × capture events — bars stay fully draggable.

Files: **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** (left handle, hover-gate, `side` arg on `onConnectStart`), **[frontend/src/components/gantt/GanttRow.tsx](frontend/src/components/gantt/GanttRow.tsx)** (`group` on row container, prop type), **[frontend/src/components/gantt/GanttChartPane.tsx](frontend/src/components/gantt/GanttChartPane.tsx)** (thread `onDeleteDependency`, prop type), **[frontend/src/components/gantt/GanttConnectors.tsx](frontend/src/components/gantt/GanttConnectors.tsx)** (hit paths, hover state, × control, anchor math, z-index), **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** (`useDeleteDependency`, `handleDeleteDependency`, directional predecessor/successor swap in `handleConnectStart`). Read-only users (`canEdit` false) see no handles and no × — connectors render but are non-interactive. Frontend `npm run typecheck` clean.

### Changed — 2026-05-15 — UI tidy-up: login placeholder, Network Diagram removal, Daily Review two-pane log

Three bundled cleanups after the OAuth work shipped.

**Login placeholder** ([frontend/src/pages/Login.tsx](frontend/src/pages/Login.tsx)) — admin sign-in disclosure's email input no longer prefills with `admin@solvro.local` (leaked the seeded admin's email to anyone hitting `/login`). Now `you@example.com`.

**Network Diagram feature removed.** It duplicated Gantt's dependency arrows and wasn't used in production. The `TaskDependency` model, its routes, and the dependency hooks are **kept**: Gantt actively renders connector arrows ([frontend/src/components/gantt/GanttConnectors.tsx](frontend/src/components/gantt/GanttConnectors.tsx)) and lets users create new dependencies via drag ([frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx) → `useCreateDependency`). Anyone reading the schema in the future shouldn't be confused by the orphan-looking model — it powers Gantt's arrows.

- Deleted: `frontend/src/pages/views/ProjectDiagram.tsx`, `frontend/src/lib/diagram/{autoLayout,criticalPath,colorUtils}.ts`, `frontend/src/lib/diagram/` directory.
- **[frontend/src/App.tsx](frontend/src/App.tsx)** — dropped `import { ProjectDiagram }` and `<Route path="diagram" element={<ProjectDiagram />} />`. Visiting `/projects/<id>/diagram` now falls through to the catch-all `Navigate to="/"`.
- **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — removed the `{ to: "diagram", label: "Diagram" }` entry from `TABS`. New tab order: Overview · List · Kanban · Gantt · Timeline · Risks.
- **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — stripped the `isMilestone` checkbox UI (FieldRow + label), the `isMilestone` state, and the field from both `useCreateTask`/`useUpdateTask` payloads. Existing tasks load and save without it.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — removed `isMilestone`, `diagramX`, `diagramY` from `Task`, `UpdateTaskInput`, and `CreateTaskInput`. `useProjectDependencies`, `useCreateDependency`, `useUpdateDependency`, `useDeleteDependency`, `TaskDependency`, `DependencyType` all stay (Gantt depends on them).
- **[backend/src/routes/tasks.ts](backend/src/routes/tasks.ts)** — removed `isMilestone`/`diagramX`/`diagramY` from `updateTaskSchema` and the PATCH handler's `data` block.
- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts)** — removed `isMilestone` from `createTaskSchema` and the create handler's `data`. Dependencies routes intact.
- **[backend/prisma/schema.prisma](backend/prisma/schema.prisma)** — dropped `Task.isMilestone`, `Task.diagramX`, `Task.diagramY` and the surrounding "Network Diagram fields" comment block. `predecessors`/`successors` relations on Task remain — Gantt reads them.
- **[backend/prisma/migrations/20260515120000_remove_diagram_task_fields/migration.sql](backend/prisma/migrations/20260515120000_remove_diagram_task_fields/migration.sql)** — `ALTER TABLE "tasks" DROP COLUMN ...` for the three columns. Non-rewriting Postgres DDL. Generated via `prisma migrate diff` (non-TTY shell, same workflow as the prior OAuth migrations).

**Daily Review two-pane layout** ([frontend/src/pages/DailyReview.tsx](frontend/src/pages/DailyReview.tsx)). Restructured the page into a `md:grid-cols-2` split: **left pane** is the existing per-project input cards (textarea + visibility toggle + save), **right pane** is a new `NotesLogPane` with a project `<select>` dropdown + date-grouped read view. The inline "Recent notes" sub-block under each project card is gone — replaced by the dedicated log pane that the user picks a project for. Mobile (`< md`) collapses to a single column with the log pane stacked below the input cards (per the established `md:` breakpoint pattern in CLAUDE.md). Notes are grouped under `Today` / `Yesterday` / locale-formatted dates (`Mon, May 13`) via a pure `groupNotesByDate` helper — no external deps. Each entry shows a visibility chip, author username, and `HH:MM`. The right pane is sticky on desktop (`md:sticky md:top-4 md:self-start`) so the log stays in view as the input list scrolls.

Where the persistent log lives, for the record: `project_notes` table in Postgres, indexed `(project_id, created_at)`, read via `GET /projects/:id/notes?limit=50` ([backend/src/routes/projects.ts](backend/src/routes/projects.ts)). The new Daily Review right pane is its canonical UI surface; the Reports export packet will read the same table later, filtered by visibility + last-14-days.

Backend `tsc --noEmit` and frontend `npm run typecheck` clean. No CHANGELOG-tracked compose/CI changes — pure code + schema + docs.

### Changed — 2026-05-15 — Admin > Sign-in: button + modal pattern, Client ID masked by default

The always-visible Client ID input and inline form felt like a configuration screen even when nothing was happening. Switched to a **connected-service summary**: status pill (Connected / Half configured / Not connected), domain count, a `Connect` / `Manage` button that opens a modal, and a read-only Client ID row with `123…xyz.apps.googleusercontent.com` masking + Reveal/Copy actions. The modal holds the actual edit form (Client ID with show/hide toggle, domain chip list with inline add) plus a `Disconnect` button in the footer that clears both fields in one PATCH. Form state resets on each open so reopening after Save reflects the latest server state.

The Client ID is still **not actually secret** — it ships in any Google sign-in button's HTML and is verifiable by anyone who inspects the network tab. Masking is purely a chrome decision: it stops the admin page from looking like a paste-bin and matches the user's expectation of how "connected identity provider" UIs typically present.

- **`frontend/src/pages/Admin.tsx`** — Replaced the inline `SignInTab` form with a status card (icon, status chip, domain count, `Connect` / `Manage` action). Added a `ClientIdField` component for the read-only display with masking + Reveal + Copy. Added a `SignInModal` component holding the actual edit form with show/hide on the Client ID input, domain chips, Cancel / Save / Disconnect actions. Added a `maskClientId()` helper that keeps the first 3 + last 3 chars of the project prefix and the full `.apps.googleusercontent.com` suffix. The modal resets its draft state on each open via a `useEffect` keyed off `open` so reopening doesn't surface stale edits.
- **`frontend/src/pages/Admin.tsx`** — Imported the existing `Modal` component (no new dep, no new abstraction).

No backend changes — the same `PATCH /admin/settings/auth` endpoint handles both fields, including `googleClientId: null` to clear it on Disconnect. Frontend `npm run typecheck` clean.

### Changed — 2026-05-14 — Google OAuth Client ID moved from env into DB-backed Admin > Sign-in

The hybrid model (Client ID in env, allowed-domains in DB) still required hardcoding the Client ID into compose/`.env`/CI build-args before any admin could turn on Google sign-in — and the frontend's build-time `VITE_GOOGLE_OAUTH_CLIENT_ID` forced a full rebuild every time the admin wanted to switch projects. Replaced with a fully **in-app** configuration model: both Client ID and allowed-domains live in the `AuthConfig` singleton, edited from `Admin > Sign-in`. Frontend fetches the Client ID at runtime from a new public endpoint and wraps `<GoogleOAuthProvider>` locally on the Login page when configured.

**Schema**

- **`backend/prisma/schema.prisma`** — `AuthConfig` gains `googleClientId String?`. Nullable so the singleton is valid before the admin configures it.
- **`backend/prisma/migrations/20260514130000_authconfig_google_client_id/migration.sql`** — single non-rewriting `ADD COLUMN`.

**Backend**

- **`backend/src/authConfig.ts`** — extended the in-process cache to include `googleClientId` and a **memoised `OAuth2Client` instance** keyed off it. Building a new `OAuth2Client` per request would re-derive the JWKS verifier cache; caching it means warm verification on every sign-in. Cache bust on PATCH propagates both the new ID and the new verifier together.
- **`backend/src/routes/auth.ts`** — removed the module-level `OAuth2Client` (was created from `env.GOOGLE_OAUTH_CLIENT_ID` at boot — dead now). `POST /auth/google` reads `googleClient` + `googleClientId` + `googleAllowedDomains` from the cached `AuthConfig` instead. Added `GET /auth/google/config` (public, no auth) returning `{ clientId, enabled }` so the Login page can decide whether to render the Google button.
- **`backend/src/routes/admin.ts`** — `GET/PATCH /admin/settings/auth` now read and write `googleClientId`. PATCH body schema accepts the field as `string | null | undefined`: `undefined` leaves it untouched, empty-string or `null` clears it, a non-empty string is validated against the Google Client ID format (`<digits>-<alnum>.apps.googleusercontent.com`). `googleAllowedDomains` is similarly optional in the body — admin can update either field independently. Each PATCH busts the in-process cache so changes take effect within the same request.
- **`backend/src/env.ts`** — removed `GOOGLE_OAUTH_CLIENT_ID` entirely. No env var, no Zod preprocess workaround, nothing to misconfigure.

**Frontend**

- **`frontend/src/lib/queries.ts`** — `AuthSettings.googleClientId: string | null`. New `useGoogleAuthConfig()` hook (public, `auth: false`) backed by `GET /auth/google/config`. `useUpdateAuthSettings` accepts partial updates (`UpdateAuthSettingsInput { googleClientId?, googleAllowedDomains? }`) and invalidates the public-config query so the Login page picks up changes immediately if it's currently mounted.
- **`frontend/src/main.tsx`** — removed `<GoogleOAuthProvider>` from the app root. It now lives inside the Login page, wrapped tightly around `<GoogleLogin>` and conditioned on `googleConfig.enabled`. No more empty-string client ID pollution at app boot.
- **`frontend/src/pages/Login.tsx`** — uses `useGoogleAuthConfig()` to decide rendering: skeleton while loading, `<GoogleOAuthProvider clientId={…}><GoogleLogin /></GoogleOAuthProvider>` when enabled, "Ask an admin to set it up in Admin → Sign-in" hint when not. Removed the `import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID` read.
- **`frontend/src/pages/Admin.tsx`** — Sign-in tab grew a Client ID input above the domain list, with `Clear` action, inline format validation matching the backend regex, and a unified Save/Cancel that ships both fields in one PATCH. "How to set up" disclosure rewritten — no env vars, no rebuild step. The empty-state banner now adapts based on whether Client ID, domains, or both are missing.
- **`frontend/src/vite-env.d.ts`** — dropped the `VITE_GOOGLE_OAUTH_CLIENT_ID` declaration.

**Stripped (no longer needed)**

- **`docker-compose.yml`** (dev) — removed `GOOGLE_OAUTH_CLIENT_ID` and `VITE_GOOGLE_OAUTH_CLIENT_ID` from both service env blocks.
- **`frontend/Dockerfile`** — removed the `ARG`/`ENV VITE_GOOGLE_OAUTH_CLIENT_ID` from the `build` stage.
- **`.github/workflows/docker-publish.yml`** — removed the `build-args:` block. No more dependency on a GitHub repo variable.
- **`setup.sh`** — removed the env line from the generated prod compose. Updated the post-install help text to point admins straight at `Admin → Sign-in`.
- **`.env.example`**, **`backend/.env.example`**, **`frontend/.env.example`** — removed the OAuth lines.

**Operational notes**

- Existing dev DB rows for `AuthConfig` get `google_client_id = NULL` (column default). Admin must visit Sign-in tab once to populate.
- The 30 s cache TTL still applies, but admin edits explicitly bust the cache, so the same admin session sees the new value instantly. Cross-replica propagation (if you ever run >1 backend) still bounded by TTL.
- Self-serve onboarding: a fresh deploy now needs only `setup.sh` + admin password — no Google Cloud step required ahead of time. Admin configures OAuth from the UI when they're ready.

### Fixed — 2026-05-14 — Backend wouldn't boot when GOOGLE_OAUTH_CLIENT_ID was unset

When the compose-wired `GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:-}` expands without a host value, Docker passes the empty string `""` to the container, not unset. The previous Zod schema `z.string().min(1).optional()` rejects empty strings (`.min(1)` fires before `.optional()` short-circuits), so the backend exited at env validation and every API call from the frontend returned 500 (proxied to a dead backend) — including the admin password login.

- **`backend/src/env.ts`** — Wrapped `GOOGLE_OAUTH_CLIENT_ID` in a `z.preprocess(v => v === "" ? undefined : v, …)` so empty-string compose input collapses to `undefined`, and `.optional()` accepts it cleanly. Same pattern should be applied to any future env var whose compose default is `${VAR:-}` and whose absence is meaningful at runtime.

### Changed — 2026-05-14 — Docs + compose plumbing aligned with actual dev workflow + Google OAuth env wiring

CLAUDE.md previously described the "Postgres-only-in-Docker, apps native" workflow and called the working-tree `docker-compose.yml` "prod-shaped, pulls GHCR images". Neither matches reality: the working-tree compose is a **dev** compose (gitignored) that builds local `dev` Dockerfile targets with hot-reload + bind mounts + named-volume `node_modules`; production gets its compose generated by [setup.sh](setup.sh) on the server with prebuilt GHCR images. Future Claude sessions kept tripping over this. Fixing the docs and wiring the Google OAuth env vars through both compose paths in the same pass so the feature actually works end-to-end.

- **`CLAUDE.md`** — Rewrote the "Repository status" compose paragraph: replaced the "single compose file, prod-shaped" claim with the two-compose-file reality (dev = working-tree gitignored, prod = generated by setup.sh). Added a "Container-aware tooling" note explaining that host-side `npm install` doesn't propagate into the running container's named-volume `node_modules` — must also run `docker compose exec <svc> npm install`. Rewrote "Common commands" so the Docker-dev path is canonical (with `docker compose exec` recipes for prisma, typecheck, db:seed) and native-host dev is positioned as a fallback. Added a "Migration generation gotcha" section covering the `prisma migrate dev` non-TTY-shell failure and the two workarounds (`exec -it` for a TTY, or host-side `migrate diff` + `migrate deploy`). Removed misleading mention of demo seeded accounts beyond `admin@solvro.local` (the others are referenced in old CHANGELOG entries but no longer auto-seeded). Removed the dangling "see CONFIGURATION.md" reference (file doesn't exist; flagged in this entry).
- **`docker-compose.yml`** (dev, gitignored) — Added `GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:-}` to the backend service and `VITE_GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:-}` to the frontend service. Both expand from the host shell environment or a sibling `.env` file. When unset, the backend boots fine (env is optional) and the frontend bundle ships without the Google button — both paths surface a "not configured" hint instead of crashing. Single source of truth (one var, two services) so dev configuration stays consistent.
- **`frontend/Dockerfile`** — Added `ARG VITE_GOOGLE_OAUTH_CLIENT_ID=""` + `ENV` line in the `build` stage. Vite resolves `import.meta.env.VITE_*` at build time, so for the **published GHCR image** the Client ID must be present during `npm run build`, not at container run. Backend Dockerfile is unaffected (no Vite, no `VITE_*` access).
- **`.github/workflows/docker-publish.yml`** — Added `build-args: VITE_GOOGLE_OAUTH_CLIENT_ID=${{ vars.VITE_GOOGLE_OAUTH_CLIENT_ID }}` to the build-push step. Reads from a **repository variable** (Settings → Secrets and variables → Actions → Variables), so admins can enable Google sign-in in prod by setting one variable and pushing a release — no code change. When unset, the variable expands to an empty string and the published frontend ships with the Google button disabled. Backend image silently ignores the build-arg (Vite-only concern).
- **`setup.sh`** — Added `GOOGLE_OAUTH_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID:-}` to the generated prod compose's backend env block (reads from `~/solvro/.env`). Updated the final help-text block to walk the admin through enabling Google sign-in: create OAuth client in Google Cloud Console → append `GOOGLE_OAUTH_CLIENT_ID=...` to `~/solvro/.env` → also set the `VITE_GOOGLE_OAUTH_CLIENT_ID` repo variable and re-run setup to pull a rebuilt frontend image → sign in as admin and add allowed domains under `Admin > Sign-in`.
- **Frontend container node_modules sync** — Because the dev compose stores `node_modules` in a named volume (`solvro_frontend_node_modules`), my earlier host-side `npm i @react-oauth/google` updated `frontend/package.json` but the container kept the stale lockfile-derived deps and Vite failed with `[plugin:vite:import-analysis] Failed to resolve import "@react-oauth/google"`. Fixed by running `docker compose exec frontend npm install`, then `docker compose restart frontend`. Same pattern applied to the backend container for `google-auth-library`. Documented in CLAUDE.md so future installs don't hit the same wall.

No app code changed in this entry — only docs, compose, Dockerfile build-args, and the CI workflow. Backend `tsc --noEmit` and frontend `npm run typecheck` were already clean from the prior commit.

### Added — 2026-05-14 — Google OAuth sign-in (primary auth) + admin-driven RBAC

New end-to-end sign-in flow. Anyone with an email on an admin-allowlisted Google domain can sign in via Google; on first sign-in they're auto-provisioned into a new built-in **PENDING** role with no permissions, and the admin promotes them from `Admin > Users`. Password auth stays as an admin-only break-glass path (`admin@solvro.local` keeps its password; every other user is created with `passwordHash = NULL` and rejected from `/auth/login`).

**Backend**

- **`backend/prisma/schema.prisma`** — `User.passwordHash` is now nullable (Google users have no password); added `User.googleSub @unique` (dedup key from the Google ID token's `sub` claim) and `User.avatarUrl` (from the `picture` claim). New singleton model `AuthConfig { id String @id @default("default"), googleAllowedDomains String[], updatedAt, updatedBy User? }` — the admin-editable allowlist of email domains that may sign in via Google.
- **`backend/prisma/migrations/20260514120000_add_google_oauth_and_pending_role/`** — generated via `prisma migrate diff` (interactive `migrate dev` blocks on the benign "new unique constraint on nullable column" warning in non-TTY shells). All `ALTER TABLE` operations are non-rewriting Postgres DDL; safe to apply via `prisma migrate deploy` against the running prod DB.
- **`backend/prisma/seed.ts`** — added `PENDING: []` to the built-in role map (5 roles total). Also upserts the `AuthConfig` singleton with an empty `googleAllowedDomains` array on every seed, so a fresh deploy forces the admin to make an explicit policy decision before Google sign-in becomes usable. The seed never overwrites admin-edited values on re-runs (`update: {}`).
- **`backend/src/env.ts`** — added optional `GOOGLE_OAUTH_CLIENT_ID`. Kept optional so existing dev environments continue to boot; when missing, `POST /auth/google` returns `503 oauth_not_configured` (same code as an empty domain allowlist). Allowed-domains list is *not* in env — it lives in `AuthConfig` so the in-app admin owns it without redeploys.
- **`backend/src/authConfig.ts`** (new) — in-process cache for the `AuthConfig` singleton with a 30 s TTL. Reads happen on every Google sign-in; the row rarely changes. Cache is busted explicitly from `PATCH /admin/settings/auth` so admin edits propagate immediately.
- **`backend/src/routes/auth.ts`** — added `POST /auth/google`: validates body `{ idToken }`, verifies via `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_OAUTH_CLIENT_ID })`, gates on `email_verified === true`, then on the `hd` claim or email-suffix against `AuthConfig.googleAllowedDomains`. Finds user by `googleSub`, then by `email` (account-linking case: existing email-matched row with null `googleSub` gets updated). New users are created with `roleId = (PENDING role).id`, `passwordHash: null`, `googleSub`, `avatarUrl`, and a username derived from the email local-part — `createWithUniqueUsername` retries `-2`, `-3`, … on `P2002` so two domains sharing a local-part don't collide. Mints the same `{ sub, role, permissions }` JWT as `/auth/login` (downstream `requireAuth` / `requirePermission` / `projectVisibilityFilter` can't distinguish the two auth paths — that's the design goal). `/auth/login` got a short-circuit before `bcrypt.compare` that returns `401 google_only` if `user.passwordHash === null`. `/auth/change-password` gained the same null-safety guard.
- **`backend/src/routes/admin.ts`** — `GET /admin/users` now selects `googleSub` + `avatarUrl` and maps to a derived `provider: "google" | "password"` field. `PATCH /admin/users/:id/role` rejects target `"PENDING"` with `400 pending_assign_blocked` — PENDING is provisioning-only; use `active: false` to revoke. Added `GET /admin/settings/auth` and `PATCH /admin/settings/auth` (both behind the existing `requireAdmin` router-level gate); the PATCH validates each domain against a hostname regex, deduplicates, caps at 32, sets `updatedById`, and busts the in-process `AuthConfig` cache so the new allowlist takes effect immediately. Added `"PENDING"` to the `BUILTIN_ROLES` set so it can't be deleted/renamed.
- **`backend/package.json`** — added `google-auth-library ^10.x` (server-side ID token verification).

**Frontend**

- **`frontend/src/main.tsx`** — wrapped the app tree in `<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ""}>` between `ThemeProvider` and `AuthProvider`. Provider sits above the router so any route can call `<GoogleLogin>` if needed later.
- **`frontend/src/vite-env.d.ts`** — declared `ImportMetaEnv.VITE_GOOGLE_OAUTH_CLIENT_ID?: string`.
- **`frontend/src/lib/auth.tsx`** — extended `AuthContext` with `loginWithGoogle(idToken)`; implementation mirrors `login()`, posts to `/auth/google`, stores the returned JWT in `localStorage["solvro.token"]` (no separate Google-vs-password storage — token shape is identical). Appended `PENDING` to the `BUILTIN_ROLES` tuple.
- **`frontend/src/lib/queries.ts`** — extended `AdminUser` with `provider: "google" | "password"` and `avatarUrl: string | null`. Added `AuthSettings` interface, `adminQueryKeys.authSettings`, `useAuthSettings`, and `useUpdateAuthSettings` (mutation `setQueryData`s the fresh row directly — no need to invalidate, since the row is singleton).
- **`frontend/src/pages/Login.tsx`** — restructured: Google button is the primary CTA (`<GoogleLogin theme="filled_blue" text="signin_with" />`). Password form moved behind a collapsible `<details>` labeled "Admin sign-in (password)". Removed the demo-accounts footer (misleading once Google is the canonical path). Tailored error messages by backend `code` (`domain_not_allowed`, `email_not_verified`, `oauth_not_configured`, `account_disabled`, `google_only`, `invalid_credentials`, `invalid_token`). When `VITE_GOOGLE_OAUTH_CLIENT_ID` is unset at build time, the page renders an amber "Google sign-in isn't set up" hint instead of the button, so the password form remains the only path in mis-configured dev environments.
- **`frontend/src/pages/Admin.tsx`** — added a new **Sign-in** tab between Roles and Project Override. Editable chip list of allowed domains with inline add input (regex-validated client-side; backend revalidates), Save/Cancel pair, "Last updated by … on …" footer, and a collapsed "How to set up Google sign-in" disclosure that documents the Google Cloud Console step (since that part can't be done from inside the app). Users tab gained a **Provider** column (Google chip with mail icon vs Password chip with key icon), a **"Needs role"** amber pill next to the role dropdown for `PENDING` users, and a 4-tile KPI strip (`Users` / `Pending` / `Custom roles` / `Inactive`). PENDING is filtered out of every user-facing role dropdown (it's provisioning-only — never selectable as a target). Roles tab description updated to list PENDING as the fifth built-in.
- **`frontend/package.json`** — added `@react-oauth/google ^0.13.x` (provider + `<GoogleLogin>` button — handles GSI script loading and returns the Google ID token via `credentialResponse.credential`).

**Env / config**

- **`.env.example`** (root), **`backend/.env.example`** — documented optional `GOOGLE_OAUTH_CLIENT_ID` and root-only `VITE_GOOGLE_OAUTH_CLIENT_ID` (same value as the backend var; shipped in the frontend bundle, not secret because Google verification is server-side).
- **`frontend/.env.example`** (new) — created with `VITE_GOOGLE_OAUTH_CLIENT_ID` + the existing `VITE_API_PROXY_TARGET` override documented for reference.

**Operational notes**

- The seeded admin (`admin@solvro.local`) is intentionally **exempt** from the Google domain allowlist because they sign in via password, not Google. Don't "fix" this by adding `solvro.local` to the allowlist — Google won't issue a verified ID token for that domain anyway.
- AuthConfig is cached in-process for 30 s. Admin edits via the Sign-in tab bust the cache immediately for the editing process, but with multiple backend replicas behind a load balancer, other replicas observe the change within 30 s. The UI surfaces this lag ("Changes take effect within ~30 seconds").
- Username collision on Google auto-provision: handled via P2002-retry with `-2`/`-3`/… suffixes up to 20 attempts.
- JWT remains provider-agnostic — no `provider` claim, no auth-event audit table. If per-session auditing becomes important, add a DB-side `AuthEvent` table rather than polluting the JWT.

Backend `tsc --noEmit` clean. Frontend `npm run typecheck` clean.

### Added — 2026-05-10 — Daily Review screen (TAM cross-project notes)

New top-level page where TAMs log a note per active project in a single morning session. This is the **input** side of the core SA-to-customer loop documented in CLAUDE.md → Reports will later consume `CUSTOMER_FACING` notes for the export packet.

- **`backend/prisma/schema.prisma`** — Added `NoteVisibility` enum (`INTERNAL` | `CUSTOMER_FACING`) and `ProjectNote` model. Note IDs are `Int @default(autoincrement())` to match every other model in this schema (the spec in CLAUDE.md showed `String @default(cuid())`, but the FK to `Project.id`/`User.id` requires `Int` — flagging as intentional deviation). Cascade-delete on project, plain FK on author. Indexes on `(project_id, created_at)` (chronological-per-project read) and `author_id`. Default visibility is `INTERNAL` so customer-facing is an explicit opt-in.
- **`backend/prisma/migrations/20260510022142_add_project_notes/`** — Generated via `prisma migrate dev --name add_project_notes`. Creates the `NoteVisibility` enum and `project_notes` table.
- **`backend/.env`** — Created from `.env.example` (`DATABASE_URL=postgresql://solvro:solvro_dev@localhost:5432/solvro?schema=public`) so `prisma migrate dev` can resolve the env var on host runs. Required first-time setup that wasn't committed.
- **`backend/src/routes/projects.ts`** — Added `GET /projects/:id/notes` (visibility + limit query params) and `POST /projects/:id/notes`. Both gate visibility through the existing `projectVisibilityFilter` so notes inherit the project's role-scoped access. Write requires `project:write`; read uses the same auth as other project-nested reads.
- **`frontend/src/lib/queries.ts`** — Added `NoteVisibility` type, `ProjectNote` interface, `queryKeys.projectNotes(id, visibility?)`, `useProjectNotes`, `useAddProjectNote`. The query key bucketizes by visibility filter; the `onSuccess` invalidator wipes every visibility bucket for the project (`["projects", id, "notes"]`) so all variants refetch.
- **`frontend/src/pages/DailyReview.tsx`** — New page. Lists TAM's `ACTIVE` + `PLANNING` projects (visibility-filtered backend-side) as a vertical stack of cards, each with project metadata, a textarea (⌘↵ to save), an `Internal | Customer-facing` segmented toggle defaulting to Internal, and a "Recent notes" panel showing the last 5 notes per project with a tone-coded visibility dot. Optimistic-feel: empties the textarea on success and keeps the visibility default.
- **`frontend/src/App.tsx`** — Registered `/daily-review` route. The `/tasks` route is left intact (CLAUDE.md says don't delete the page, only remove the sidebar link).
- **`frontend/src/components/layout/Sidebar.tsx`** — Removed `Tasks` (TAMs think in projects, not tasks; the per-project task views cover this). Added `Daily Review` (icon `edit_note`) between `Customers` and `Work Logs`. New order: Overview → Projects → Customers → Daily Review → Work Logs → Reports → Admin. Settings remains in the user menu (TopBar), as before.

Backend `tsc --noEmit` clean. Frontend `npm run typecheck` clean.

### Changed — 2026-05-10 — Align shared chrome (chips, sidebar, topbar, modal) with the static preview

Follow-up pass to the page-level alignment: the *shared* components used everywhere now match the preview's visual language, so the polish lands once and propagates.

- **`frontend/src/index.css`** — Added theme-aware chip color tokens (`--emerald-bg/text`, `--amber-bg/text`, `--rose-bg/text`, `--violet-bg/text`) under `:root` (light) and `.dark` (dark) using the same RGB triplets the preview HTML defines. Chips now flip with the theme automatically.
- **`frontend/tailwind.config.ts`** — Exposed those tokens as Tailwind colors (`bg-chip-emerald-bg`, `text-chip-emerald-text`, etc.) so any chip can be styled with utilities instead of inline hex.
- **`frontend/src/components/StatusChip.tsx`** — Rewrote chip styling to match the preview spec: `gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-[18px]`. Labels are now Title-cased ("Active", "On hold", "In progress", "To do") instead of UPPERCASED. Exports a generic `<Chip tone="emerald|amber|rose|violet|blue|gray">` for ad-hoc reuse without rebuilding the base styling per call site.
- **`frontend/src/components/PriorityBadge.tsx`** — Same chip shape; tones collapsed to gray (Low/Med), amber (High), rose (Urgent) per preview. Dropped the leading colored dot — the bg/text contrast carries enough signal at this size.
- **`frontend/src/components/LabelChip.tsx`** — Switched from `rounded` to `rounded-full` and weight 600 so user-defined labels read as the same chip family.
- **`frontend/src/components/layout/Sidebar.tsx`** — Restored DESIGN.md's "dark slate, recedes" intent: rail bg is now `#0F1623` (light) / `#060912` (dark), nav links are `text-slate-400` on `hover:bg-white/5`, active item is `bg-primary/20 text-white` with the icon tinted `text-primary`. Brand wordmark is `text-white text-lg font-extrabold tracking-tight`. Backdrop on mobile only (`md:hidden`) so it doesn't grey out the canvas on desktop. Nav icons updated to match the preview set (`folder_managed`, `groups`, `analytics`).
- **`frontend/src/components/layout/TopBar.tsx`** — Height dropped from `h-16` to `h-14` (preview spec). Search input moved into a filled pill (`bg-surface-container`) with a `⌘K` mono kbd hint. Added a notifications bell with a small error dot. User chip on the right pulls a left border separator like the preview. Theme toggle and avatar menu kept; sign-out / settings dropdown unchanged.
- **`frontend/src/components/layout/RightSidebar.tsx`** — Now uses `<ProjectStatusChip>` directly (was a bespoke `STATUS_TONE` map with rings — outdated after the chip refactor). Top offset changed from `top-16` to `top-14` to track the new TopBar height. Export buttons: dropped `uppercase tracking-wider` for a softer `font-semibold` to match the rest of the app's secondary buttons.
- **`frontend/src/components/layout/Shell.tsx`** — Main canvas height adjusted from `calc(100vh-64px)` to `calc(100vh-56px)` to match the new TopBar height.
- **`frontend/src/components/Modal.tsx`** — Switched from `rounded-xl … shadow-xl` to `rounded … shadow-card`, gave the header a real title (`text-[14px] font-semibold text-on-surface` instead of a tiny variant-text label) and removed the `bg-surface-container-low` band on header/footer — the bordered separators alone are enough at the new radius. Edge-to-edge mobile layout preserved (`rounded-none md:rounded`).

Typecheck clean.

### Changed — 2026-05-10 — Bring the real app's visual language up to the static preview

The static `solvro-app-preview.html` mockup set a higher visual bar than the actual app — KPI tiles, the avatar-tile + metric-grid customer card, the S-curve overview, the polished login split-panel, etc. This pass aligns the implementation to that target across every authed page (interactivity unchanged).

- **`frontend/src/pages/Login.tsx`** — Restyled the right form panel: outlined inputs with leading mail/lock icons + show-password toggle, "Remember me" / "Forgot password?" row, primary uppercase "Sign in" button, and a Demo accounts footer that autofills the form on click (password `password123`). Left brand panel keeps the gradient but uses a tighter chip + headline + version-stamp layout matching the preview.
- **`frontend/src/pages/Overview.tsx`** — Replaced the prior 2×2 quadrant tiles with a 4-KPI strip (Active Projects · Open Tasks · Completed · Total) + a Recharts area chart S-curve (Actual vs. Baseline) + an activity feed of recent tasks with seeded avatar colors + a "Recently updated projects" strip. Drops the donut + work-log placeholder.
- **`frontend/src/pages/Projects.tsx`** — Card now leads with a `P-NNN` mono-num ID badge + status chip, then title, description, customer + avatar stack (SA + TAM, both seeded from username), and a footer strip with task count and a baseline-locked badge when set. Filter row simplified to a customer dropdown + result count, no more shadow-card panel.
- **`frontend/src/pages/Customers.tsx`** — Card redesigned around a 40px seed-colored avatar tile + truncated AM line, optional description, then a 2-column metric grid (Projects count, SA lead). Shared seeded `avatarColor` palette mirrors the preview.
- **`frontend/src/pages/CustomerDetail.tsx`** — Header rebuilt as a 3-card strip: identity card with avatar tile + AM/SA + Edit/Delete actions, plus two KPI tiles (Active projects · Services subscribed). Existing tabs (Overview · Services · Topology · Org · Documents) and Services-tab tools editor unchanged.
- **`frontend/src/pages/Tasks.tsx`** — H1 sized `text-2xl font-bold`, filter panel switched from `rounded-xl shadow-card` to `rounded border border-outline-variant`, table container ditto. Sorting/filtering logic untouched.
- **`frontend/src/pages/Reports.tsx`** — Added a 4-KPI strip across the top (Total tasks · In progress · Completed · Backlog), reorganized chart cards into a 2-up layout, and reskinned the Recharts tooltip + legend to use CSS-variable surface colors so they read in dark mode. Pie charts kept.
- **`frontend/src/pages/Settings.tsx`** — Appearance card now shows visual theme-preview tiles (white / dark slate / split) for Light · Dark · System, with a check-circle marker when active. Other surfaces switched from `rounded-xl shadow-card` to `rounded border + shadow-card`.
- **`frontend/src/pages/Admin.tsx`** — Added a 3-KPI strip at the top of the Users tab (Users · Custom roles · Inactive accounts) derived from `users` + `roles` data; introduced a small shared `AdminKpi` component. Users CRUD form + table unchanged.
- **`frontend/src/pages/views/ProjectOverview.tsx`** — Reskinned the 4 KPI tiles (icon top-right, mono-num value, hint inline) and the S-curve section/empty-state/skeletons to use `rounded border border-outline-variant` instead of `rounded-xl shadow-card`. Recharts S-curve rendering logic unchanged.
- **`frontend/src/pages/views/ProjectList.tsx`** + **`ProjectKanban.tsx`** — Swapped the loading skeletons and outer table/card containers from `rounded-xl … shadow-card` to `rounded border border-outline-variant`. Kanban subtask checklist (added earlier today) carries through unchanged.

Typecheck clean across all changes.

### Added — 2026-05-10 — Full-app static UI preview (single shareable HTML)

A standalone HTML file that mirrors every major screen of the app, intended for design review and external sharing. No build, no backend, no auth — just open in a browser.

- **`New UI/solvro-app-preview.html`** — 16 screens covered: Login, Overview (dashboard), Projects, Project · Overview / List / Kanban (with subtask checklist) / Gantt / Timeline / Diagram / Risks tabs, Customers, Customer detail, Tasks (cross-project), Reports, Settings, Admin. Wired with:
  - Manual light/dark toggle (button in the sticky header) using a `darkMode: 'class'` Tailwind config + CSS variables for the M3 surface tokens. Initial state respects OS `prefers-color-scheme`. Chrome bar carries an in-page TOC linking to each screen anchor.
  - Faithful chrome: 64px sidebar rail (dark slate), 56px topbar with project breadcrumb on detail pages, and the same 7-tab order the app uses (Overview · List · Kanban · Gantt · Timeline · Diagram · Risks).
  - Visual fidelity for the load-bearing concepts: AI Breakdown amber glow on machine-generated cards, phase-color left rails on diagram nodes, S-curve baseline-vs-actual + forecast, Gantt grid with dependency arrows + parent-subtask dotted teal edges, Kanban subtask checklist nested inside parent cards, risk register with live-computed score cells, project-level Risks summary tiles.
  - Source Sans 3 + JetBrains Mono via Google Fonts CDN; Material Symbols via Google Fonts CDN; Tailwind via JIT CDN. Self-contained — no asset folder.



Each parent card on the Kanban now renders its subtasks as a compact, indented checklist inside the card (between the description and the meta row). The earlier `subtasksDone/total` badge in the bottom row is removed because the list itself is now the authoritative summary.

- **`frontend/src/pages/views/ProjectKanban.tsx`**:
  - Added `toggleSubtaskStatus` handler in the parent component (flips a subtask's status between `TODO` and `DONE` via the existing `useUpdateTask` mutation, which already does optimistic update + invalidate).
  - Threaded a new `onToggleSubtask: (Task) => void` prop and a `canToggleSubtasks: boolean` flag through `Column` → `TaskCard` (gated on the same `TAM/ADMIN` role check as the drag-to-move).
  - In `TaskCard`, when `subtasks.length > 0`, renders a list with a small status circle (clickable to toggle when permitted), the subtask title (line-through when done), and an optional assignee initial. Inline `onPointerDown` `stopPropagation` keeps the dnd-kit draggable on the parent card from intercepting the toggle click. Removed the redundant subtask-count badge from the meta row.

Subtasks intentionally don't drag independently — moving a parent moves the subtask group with it. To reorganize across statuses individually, use the per-row toggle or open the parent's edit modal (which still lists subtasks).

### Fixed — 2026-05-10 — Project tabs nav no longer shows a stray vertical scrollbar

The project sub-tab nav (`<nav className="… overflow-x-auto …">` in [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)) was rendering a thin vertical scrollbar along its right edge because of a CSS quirk: when `overflow-x` is set to a non-visible value, `overflow-y: visible` is computed to `auto`. Combined with the active tab's `-mb-px border-b-2` which overhangs the content box by 1px to overlap the nav's own bottom border, the nav had 1px of vertical overflow → vertical scrollbar appeared.

- **`frontend/src/pages/ProjectDetail.tsx`** — Added `overflow-y-clip` to the tabs nav so the y-axis is clipped (not scrolled). `overflow-x-auto` is retained for horizontal tab scroll on narrow viewports. `clip` doesn't make the element a scroll container, so no scrollbar is reserved on either axis when not needed; the 1px overhang is silently clipped (still indistinguishable visually since the active border sits flush against the nav's `border-b`).

### Fixed — 2026-05-10 — Gantt card sizes to its rows, no extra page scrollbar

The Gantt card was forcing a `h-full min-h-[460px]` fixed-fit and an internal `flex-1 overflow-auto` scroller, which (a) padded the card with empty rows below the last task whenever the data was sparse, and (b) on shorter viewports the 460px floor pushed total page height just past `<main>`, surfacing a stray page-level vertical scrollbar on top of the Gantt's own horizontal scroller.

The card should grow with the number of tasks — many rows = tall card and the page scrolls vertically; few rows = short card and nothing extra to scroll.

- **`frontend/src/components/gantt/GanttFrame.tsx`**:
  - Root: dropped `h-full min-h-[460px]` from the outer container so the card height = its natural content height (toolbar + axis + rows × ROW_HEIGHT).
  - Inner scroller: changed `min-h-0 min-w-0 flex-1 overflow-auto` to `min-w-0 overflow-x-auto`. Vertical scroll is now the page's job (`<main>` already has `overflow-y-auto`); the scroller still owns horizontal scrolling for wide date ranges. The inner content div's `minHeight: AXIS_HEIGHT + rows.length * ROW_HEIGHT` style still drives the card's height, so this is purely a wrapper change.

### Changed — 2026-05-10 — Network Diagram is read-only for dependencies

The diagram is now purely a visualization. All dependency creation/deletion goes through the Gantt chart's connector-handle drag.

- **`frontend/src/pages/views/ProjectDiagram.tsx`**:
  - Removed `onConnect` and `onEdgeDoubleClick` handlers, `useCreateDependency` / `useDeleteDependency` hook calls, the `error` state + dismissable error toast (only `onConnect` ever populated it), the `ApiError` import, and the unused `Connection` type import.
  - Added `nodesConnectable={false}` on `<ReactFlow>` so users can't initiate a connection drag.
  - Kept node dragging + position persistence so users can still arrange the canvas layout.
- **`frontend/src/index.css`** — `.diagram-handle` is now `width: 1px; height: 1px; opacity: 0; pointer-events: none;`. Existing edges still attach to the handles as anchor points, but the dots no longer render.

Auto-derived parent → subtask edges, the read-only critical-path toggle, hover/click selection highlight, double-click-to-open-task-modal, and Auto-layout all keep working — only manual edge create/delete is gone.

### Added — 2026-05-09 — Create dependencies directly in the Gantt chart

The Gantt becomes the primary place for managing dependencies. Each editable bar grows a small connector dot at its right edge — drag from there to another bar to create a `TaskDependency`. Both the Gantt's connector overlay and the Network Diagram update immediately because they share the TanStack Query cache.

- **`frontend/src/components/gantt/GanttBar.tsx`** — Added `data-task-id` attribute to every bar (used for hit-testing on pointer-up) plus a small primary-blue circular handle (12px, white-bordered, 70%/100% opacity on hover) anchored to the bar's right edge. `onPointerDown` on the handle calls a new `onConnectStart(sourceTaskId, clientX, clientY)` prop after stopping propagation so the bar's own drag-to-move pointer logic doesn't fire.
- **`frontend/src/components/gantt/GanttRow.tsx`** — Plumbed the `onConnectStart` prop through to `GanttBar`.
- **`frontend/src/components/gantt/GanttChartPane.tsx`** — Accepts a `connectDrag` prop (start/cursor coords in chart-body-local space). When non-null, renders a dashed primary-blue SVG `<line>` with a circle endpoint as a rubber-band that follows the cursor (`overflow: visible` so the line extends outside the SVG's viewBox if the cursor leaves the chart body). Mounted at `z-index: 4` so it sits above bars and the static connectors.
- **`frontend/src/components/gantt/GanttFrame.tsx`** — Added `useCreateDependency`, `connectDrag` state, and `handleConnectStart`. `handleConnectStart` converts client coords → chart-body-local using `scrollerRef.getBoundingClientRect() + scrollLeft/Top - LIST_PANE_WIDTH/AXIS_HEIGHT`, then attaches **window-level** `pointermove` / `pointerup` / `keydown` listeners imperatively (not via useEffect, so state updates during drag don't re-add listeners). On `pointerup`: walks up `document.elementFromPoint(...)` looking for the nearest `[data-task-id]` ancestor; if it differs from the source task, fires the create mutation with `sourceHandle: "right-source"` + `targetHandle: "left-target"` defaults so the new dep also looks natural in the Network Diagram. ESC cancels mid-drag. Errors surface via `setActionError`.

The earlier change that rendered existing TaskDependencies on the Gantt (via `GanttConnectors`) stays as-is — combined, you can both create AND view dependencies in the Gantt without leaving the tab.

### Added — 2026-05-09 — Render TaskDependency arrows on the Gantt chart

The same dependency edges drawn in the Network Diagram now render as stepped arrows on the Gantt chart, so users can see precedence relationships in either view without re-creating them.

- **`frontend/src/components/gantt/GanttConnectors.tsx`** (new) — SVG overlay sized to the chart body. For each `TaskDependency` row, finds the predecessor and successor `Row` (matched by `taskId`), computes their bar endpoints via `positionFor`, and draws a stepped path (`M…H…V…H…`). Forward layouts route forward → vertical → forward; backward dependencies (successor to the left of predecessor) route around with an extra leg above/below the source row. Arrowheads via SVG `<marker>` colored with `currentColor` so they match the path stroke. HARD = solid, SOFT = dashed (`stroke-dasharray="5 4"`).
- **`frontend/src/components/gantt/GanttChartPane.tsx`** — Accepts a new `dependencies: TaskDependency[]` prop and mounts `<GanttConnectors />` between the rows layer and the today-line (z-index: 2 so it sits above bars and grid but under the today line).
- **`frontend/src/components/gantt/GanttFrame.tsx`** — Added `useProjectDependencies(projectId)` and passes the result down. Subscribes to the same TanStack Query cache used by the Network Diagram, so creating/deleting a dep in either view propagates immediately to the other.

Connectors automatically skip dependencies whose endpoints aren't currently visible (e.g. either task is in a collapsed section). No layout adjustments needed when sections expand/collapse — connectors recompute via `useMemo` keyed on `rows`.

### Changed — 2026-05-09 — Two-phase auto-layout: subtasks stack below parents

Previous attempt fed parent → child edges into dagre's main LR graph, which simply pushed subtasks one rank to the **right** of the parent — not below. Now `autoLayout` runs in two phases.

- **`frontend/src/lib/diagram/autoLayout.ts`**:
  - Phase 1: dagre lays out only **top-level tasks** (those without a `parentTaskId`) using the dependency graph. Subtasks are excluded from dagre entirely.
  - Phase 2: subtasks are placed **directly below** their parent — horizontally centered on the parent, vertically stacked in id order with a 24px gap between siblings (`SUBTASK_VGAP`).
  - Stable id-sort means the layout is deterministic across runs.

To apply: click the **Auto-layout** toolbar button — existing diagram positions are persisted in `Task.diagramX/Y`, so they don't move automatically when this code changes.

### Added — 2026-05-09 — Auto-rendered parent → subtask edges in Network Diagram

The diagram now visualizes the existing `Task.parentTaskId` hierarchy. Every task that has a parent gets an auto-derived edge from the parent's bottom handle to its own top handle — distinct in style from real `TaskDependency` edges so the two relations are never confused.

- **`frontend/src/lib/diagram/autoLayout.ts`** — dagre now also receives parent → child edges (in addition to `TaskDependency` rows). Subtasks land one rank deeper than their parent, so the auto-layout reflects the task hierarchy when first opened.
- **`frontend/src/pages/views/ProjectDiagram.tsx`**:
  - `PhaseEdgeData` gained an optional `isParent: true` flag.
  - The edges memo iterates `tasks.filter(t => t.parentTaskId !== null)` after building dependency edges and appends a synthetic edge with id `parent-<childId>`, `sourceHandle: "bottom-source"`, `targetHandle: "top-target"`. The synthetic id namespace can't collide with numeric `TaskDependency` ids.
  - `PhaseEdge` checks `data.isParent` and short-circuits to a muted dotted line (`stroke-dasharray="2 4"`, ~50% opacity, no `markerEnd`) so it reads as a containment line, not an arrow.
  - `onEdgeDoubleClick` skips edges whose id starts with `parent-` — parent links can't be deleted from the diagram (clear `parentTaskId` from the task modal instead).
  - Parent edges aren't included in the critical-path computation (only `TaskDependency` rows are).

User-drawn `TaskDependency` edges and auto parent edges coexist; if a parent also has a real dependency to its subtask, both render and are visually distinct.

### Removed — 2026-05-09 — Comments section from TaskFormModal

- **`frontend/src/components/TaskFormModal.tsx`** — Removed the entire `Comments` section (cosmetic B/I/U toolbar + `CommentThread` embed) that only rendered in edit mode. Dropped the now-unused `CommentThread` import. The comment-thread component itself stays in `src/components/CommentThread.tsx` and the backend `/tasks/:id/comments` endpoints stay live — only the modal's mount of it is removed.

Why: the section made the edit modal substantially taller for marginal value (CommentThread isn't wired to a real toolbar; the BIU/etc buttons are cosmetic). User can re-introduce it later if comments become a primary workflow.

### Changed — 2026-05-09 — Cap modal height + tighten TaskFormModal spacing

The Task form modal was growing past viewport height because the panel container had `md:h-auto` with no `max-h`. Result: very tall content (esp. with comments) pushed the footer off-screen and made the whole page scroll.

- **`frontend/src/components/Modal.tsx`** — Panel now has `max-h-screen` (mobile) and `md:max-h-[calc(100vh-2rem)]` (desktop, accounting for the outer `md:p-4`). Combined with the existing `flex-1 overflow-y-auto` body, the modal is now capped at viewport height and the body scrolls internally; header + footer stay pinned. Affects every modal that uses this component.
- **`frontend/src/components/TaskFormModal.tsx`** — Tightened internal spacing: form `space-y-5` → `space-y-3.5`, field-rows-card `space-y-3 p-4` → `space-y-2 p-3`, all section header margins `mb-2` → `mb-1.5`. Net: ~40px less vertical content, fewer cases where scrolling kicks in at all.

### Changed — 2026-05-09 — Persist diagram handle IDs + render task IDs on nodes

Two fixes for the Network Diagram view.

**1. Edge handle persistence.** The bidirectional handles (added earlier today) let users drag connections from any side of any node, but the chosen sides were thrown away on reload — every edge re-rendered through the default right→left routing, turning a clean vertical drag into an L-shape after refresh. Now the source/target handle IDs travel with the dependency.

- **`backend/prisma/schema.prisma`** — `TaskDependency` gained `sourceHandle String?` and `targetHandle String?` columns (snake_case in SQL, nullable; null = "use defaults").
- **Migration**: `20260509110118_add_dependency_handle_ids` (or similar timestamp). Applied via `DATABASE_URL=… npm run prisma:migrate -- --name add_dependency_handle_ids`. After migration, `docker compose exec backend npx prisma generate && docker compose restart backend` to refresh the container's Prisma client.
- **`backend/src/routes/projects.ts`** `createDependencySchema` accepts optional `sourceHandle` / `targetHandle` strings; the POST handler stores them on insert.
- **`frontend/src/lib/queries.ts`** — `TaskDependency` and `CreateDependencyInput` interfaces gained the two fields.
- **`frontend/src/pages/views/ProjectDiagram.tsx`** — `onConnect` now passes through `params.sourceHandle` / `params.targetHandle`; the edge-mapping memo reads `d.sourceHandle ?? "right-source"` (and the target counterpart) so legacy rows fall back to the LR default while new rows preserve their original handles across reloads.

**2. Task IDs visible on nodes.** Each task and milestone card now shows its `T-NNN` ID in a small mono-font line above the title — matches the format already used in [`ProjectList.tsx`](frontend/src/pages/views/ProjectList.tsx).

- **`frontend/src/pages/views/ProjectDiagram.tsx`** — Inserted `<div className="diagram-task-id">T-{padded id}</div>` above the title in `TaskCardNode`; for `MilestoneNode` (single-line layout) the ID is prefixed inline before the milestone title.
- **`frontend/src/index.css`** — New `.diagram-task-id` rule: 10px JetBrains-Mono, weight 600, `--diagram-node-meta` color at 0.85 opacity. Plays cleanly in both light and dark canvas themes via the existing CSS variables.

### Changed — 2026-05-09 — Bidirectional handles in Network Diagram (4 sides)

Each diagram node now stacks a `source` AND a `target` handle at all four sides (left, right, top, bottom) — **8 handles total per node**. Users can initiate or receive a connection from any side. Top/bottom is especially useful for subtasks laid out vertically below their parent: a clean down-arrow instead of a long L-shape going around.

- **`frontend/src/pages/views/ProjectDiagram.tsx`** — Replaced the single-target/single-source handle pair on `TaskCardNode` and `MilestoneNode` with a shared `<BidirectionalHandles />` helper that renders 8 handles with unique IDs (`left-target`, `left-source`, `right-target`, `right-source`, `top-target`, `top-source`, `bottom-target`, `bottom-source`). Existing edges are explicitly pinned to `sourceHandle: "right-source"` + `targetHandle: "left-target"` so the LR-flow visual default is preserved on reload regardless of which sides the user originally dragged from.

The connection itself is still a `TaskDependency` row — top/bottom is purely a routing/ergonomics choice, not a new relation type.

Caveat: handle IDs aren't persisted on `TaskDependency`, so vertically-drawn edges re-render through the default right→left route after a refresh. Semantic dependency direction (predecessor → successor) is preserved.

### Changed — 2026-05-09 — Apply Projects-card treatment to all entity cards

Extended the compact-but-larger-text card treatment from the Projects grid to the rest of the app's card-style components.

- **`frontend/src/pages/Customers.tsx`** `CustomerCard`:
  - Padding `p-5` → `p-4`, gap `gap-3` → `gap-2.5`.
  - Avatar block `h-10 w-10 text-sm` → `h-9 w-9 text-[13px]`.
  - Title `text-sm font-semibold` → `text-base font-bold`, added `group-hover:text-primary`.
  - AM / SA / description / projects-count rows: `text-[12px]` → `text-[13px]`; description gained `leading-snug`.
  - Footer: collapsed the two stacked divider rows ("N projects" + "Edit/Delete") into a single row sharing one `border-t` — saves ~24px of vertical space and makes Edit/Delete inline-right of the project count.
  - Chevron now flips to primary color on hover.
- **`frontend/src/pages/Overview.tsx`** dashboard cards:
  - All four panels: `p-5` → `p-4`.
  - Card headings: `font-display text-sm font-semibold` → `font-display text-base font-semibold`.
- **`frontend/src/pages/views/ProjectKanban.tsx`** `TaskCard`:
  - Padding `p-4` → `p-3` (cards already feel dense; tightening to compensate for bigger text).
  - Title `text-sm` → `text-[15px]`.
  - Duration / count strip: `text-[12px]` → `text-[13px]` and icons `text-[14px]` → `text-[15px]`.
  - Description `text-[12px]` → `text-[13px]` + `leading-snug`.
  - `mb-2`/`mb-3` between sections trimmed to `mb-1.5`/`mb-2`.

### Changed — 2026-05-09 — Tighter, more readable Project cards on /projects

- **`frontend/src/pages/Projects.tsx`** `ProjectCard`:
  - Padding `p-5` → `p-4` (tighter card).
  - Title: `text-sm` → `text-base` (17px) + `leading-tight`. Edit icon `text-[14px]` → `text-[16px]` to keep parity.
  - Customer name: `text-[12px]` → `text-[13px]`.
  - Description: `text-xs` → `text-[13px]` + `leading-snug`; clamp `line-clamp-3` → `line-clamp-2`; `min-h-[3rem] mb-5` → `min-h-[2.4rem] mb-3`.
  - SA/TAM avatars: `h-7 w-7` → `h-6 w-6` (proportional with the smaller card).
  - "N issues" footer: `text-xs` → `text-[13px]`, icon `text-[15px]` → `text-[16px]`.

Net result: smaller card, larger body text — denser grid plus better readability.

### Changed — 2026-05-09 — Project context right sidebar defaults to closed

- **`frontend/src/pages/ProjectDetail.tsx`** — `contextOpen` state initialized to `false` instead of `true`. The 320px right sidebar (RightSidebar) now stays hidden until the user clicks the Context toggle in the header. Gives the canvas more horizontal room on first load — especially useful for the new Diagram view.

### Added — 2026-05-09 — Network Diagram (Dependency View) tab — full implementation

OmniPlan-style freeform DAG canvas of project tasks, mounted as the 7th project sub-tab at `projects/:id/diagram` (positioned **before** Risks). Tasks are draggable nodes (rectangle for regular, hex for milestone), connected by stepped SVG edges showing predecessor → successor dependencies, grouped into colored phases via `Section.color`, with a togglable critical-path highlight. Both light and dark theme variants honored.

**Backend** (`backend/`):
- **Schema** (`prisma/schema.prisma`):
  - New `DependencyType` enum: `HARD` | `SOFT` (drives solid vs dashed edges).
  - New `TaskDependency` model with `predecessorTaskId`, `successorTaskId`, `type`, `projectId` (denormalised for cascade + visibility), unique on `(predecessorTaskId, successorTaskId)`.
  - `Task` extended: `isMilestone Boolean @default(false)`, `diagramX Float?`, `diagramY Float?` (nullable so dagre auto-layout only runs for tasks the user hasn't manually placed).
  - `Section` extended: `color String @default("#94a3b8")`.
  - `Project` got `taskDependencies TaskDependency[]` back-relation for cascade.
- **Migration**: `20260509102543_add_task_dependencies_and_diagram_fields`. Run with `DATABASE_URL=… npm run prisma:migrate -- --name add_task_dependencies_and_diagram_fields` per CLAUDE.md.
- **Routes**:
  - New `src/routes/dependencies.ts` exporting `dependenciesRouter`. Mounts at `/dependencies` for item-scoped `PATCH /:id` (update type) + `DELETE /:id`. Visibility gated through the project the dep belongs to.
  - `src/routes/projects.ts`: added project-scoped `GET /:id/dependencies` and `POST /:id/dependencies` (with **cycle detection** via DFS reachability from the new successor back to predecessor before insert; rejects with HTTP 400 `cycle`). Also rejects self-deps and tasks not in the project. Extended `createSectionSchema` and `createTaskSchema` to accept `color` and `isMilestone` respectively. Added `color` to all `section: { select }` includes so the frontend gets it.
  - `src/routes/tasks.ts`: extended `updateTaskSchema` to accept `isMilestone`, `diagramX`, `diagramY`. PATCH now writes them.
  - `src/routes/sections.ts`: extended `updateSectionSchema` to accept `color` (validated `/^#[0-9a-fA-F]{6}$/`).
  - `src/app.ts`: mounted `dependenciesRouter` at `/dependencies`.

**Frontend** (`frontend/`):
- **Dependencies**: added `@xyflow/react` (^12.10.2), `dagre` (^0.8.5), `@types/dagre` (^0.7.54) in `package.json`.
- **Types & queries** (`src/lib/queries.ts`):
  - `Task` interface gained `isMilestone`, `diagramX`, `diagramY`. `Task.section` gained `color`.
  - `Section` interface gained `color`.
  - New `DependencyType`, `TaskDependency`, `CreateDependencyInput` types.
  - New hooks: `useProjectDependencies`, `useCreateDependency`, `useUpdateDependency`, `useDeleteDependency`. Added `queryKeys.projectDependencies`.
  - `useUpdateSection` invalidates `projectTasks` too (so section-color changes flow into the cached task data the diagram reads).
  - `UpdateTaskInput`/`CreateTaskInput` extended with `isMilestone` + diagram coordinates.
- **Diagram helpers** (`src/lib/diagram/`, new directory):
  - `autoLayout.ts` — runs `dagre` left-to-right, returns `taskId → {x,y}` top-left positions.
  - `criticalPath.ts` — Kahn topological sort + longest-path relaxation over `effortDays(task)`. Returns `{ taskIds: Set, edgeIds: Set }`. Pure function. Bails out with empty result on cycles (which the backend rejects anyway).
  - `colorUtils.ts` — `phaseColor(section)` falls back to a hash-derived palette when `Section.color` is missing/invalid.
- **New view** (`src/pages/views/ProjectDiagram.tsx`):
  - Wraps everything in `ReactFlowProvider`. Custom node types `task` (rectangle) + `milestone` (hex via clip-path). Custom edge type `phase` using `getSmoothStepPath`, with `strokeDasharray="6 4"` on SOFT and stroke colour from source's section.
  - Node positions seed from `Task.diagramX`/`diagramY`; tasks with null coords get auto-layout via dagre. `onNodeDragStop` PATCHes coords to the server.
  - `onConnect` (drag from right handle to left handle) creates a HARD dependency. Backend cycle rejection surfaced as a dismissible toast.
  - `onEdgeDoubleClick` confirms then deletes the edge.
  - `onNodeClick` selects + highlights upstream/downstream chain (edges fade to 20% for non-related, others stay full opacity). `onNodeDoubleClick` opens the existing `TaskFormModal` for full editing.
  - Floating toolbar (top-left): "Critical Path" toggle (on by default) + "Auto-layout" button (re-runs dagre and persists). Phase legend (top-right) lists every Section the project's tasks belong to with its color swatch + name. MiniMap (bottom-right) auto-colors nodes by phase.
- **Theme-aware canvas** (`src/index.css`): added `.diagram-canvas` block with CSS variables (`--diagram-canvas-bg`, `--diagram-node-bg`, `--diagram-grid`, `--diagram-glow`, `--cp-stroke`) that flip under `.dark` (the existing app-wide dark-mode toggle). Light mode = `#f8fafc` canvas with primary-blue critical-path halo. Dark mode = `#0d0d1a` canvas with white halo. `.diagram-task-node` (rectangle) and `.diagram-milestone-node` (hex via clip-path) styles plus `[data-cp]`/`[data-selected]`/`[data-faded]` highlight states. Also styled `.react-flow__minimap` and `.react-flow__controls` to match.
- **Wiring**:
  - `src/App.tsx`: imported `ProjectDiagram`, added `<Route path="diagram" />` under `projects/:id` (between `timeline` and `risks`).
  - `src/pages/ProjectDetail.tsx`: added `{ to: "diagram", label: "Diagram" }` to the `TABS` array between Timeline and Risks (text-only, no icon — matches the other tabs).
- **Form controls**:
  - `src/components/TaskFormModal.tsx`: added an "Is milestone" `FieldRow` (hex icon + checkbox) between Labels and the existing rows. Wired to the new `isMilestone` field; sends through both create and edit flows.
  - `src/pages/views/ProjectList.tsx`: added a small color-swatch + native `<input type="color">` to each section header (real sections only, not the synthetic No-section group). Plumbed via a new `onColorChange` prop on `SectionBlock`. Updates flow through the existing `useUpdateSection` hook.

Why: per the approved plan at `~/.claude/plans/refactored-sauteeing-bird.md`. The view gives PMs a visual schedule-logic surface that complements the Gantt — Gantt shows time, Diagram shows precedence. Phase colors via `Section.color` (rather than a new `Phase` model) keeps the data model lean. Critical path is computed client-side because typical project sizes (a few dozen tasks) stay well within JS performance.

### Added — 2026-05-09 — Network Diagram preview mockup (review artifact)

- **`New UI/network-diagram-preview.html`** — static, single-file HTML mockup of the planned Network Diagram (Dependency View) tab. Tailwind CDN + Source Sans 3 + Material Symbols + JetBrains Mono. Renders sample 9-task / 3-milestone DAG with phase-colored task nodes, hex-clipped milestone nodes, stepped SVG dependency edges (solid = HARD, dashed = SOFT), arrowheads, "Critical Path" toggle ON state with halo glow on the longest chain, "Implement revisions" shown in selected state, floating toolbar (top-left), phase legend (top-right), and minimap (bottom-right). No JS framework — pure SVG + CSS.
- **Theming**: follows OS appearance via `@media (prefers-color-scheme: dark)`. Canvas/nodes/toolbar/minimap/critical-path glow all flip — light mode uses a `#F8FAFC` canvas with white nodes and a primary-blue critical-path halo; dark mode uses `#0d0d1a` canvas with `#1a1a2e` nodes and a white halo. Tailwind config uses `darkMode: 'media'`. Critical-path arrowhead marker uses `currentColor` so the parent `<g style="color: var(--cp-stroke)">` flips marker fill in tandem with edge stroke.
- **Tab order**: Diagram is positioned **before** Risks (between Timeline and Risks) per user preference.

Why: per the approved plan at `~/.claude/plans/refactored-sauteeing-bird.md`, Deliverable 0 — visual sign-off before any backend schema or frontend code lands. Open the file directly in a browser; no build step.

### Changed — 2026-05-09 — Move project title into TopBar on project routes

The project breadcrumb + name + status chip were eating ~80px of vertical space at the top of every project view. Moved them into the TopBar so the canvas can use that real estate for actual work.

- **`frontend/src/components/layout/TopBar.tsx`** — On routes matching `/projects/:id/*`, the static `My Projects` title is replaced with `Projects / [project.name]` (link + name) plus the live `ProjectStatusChip`. Uses `useProject(id)` which hits the same TanStack Query cache populated by `ProjectDetail` — no extra network request.
- **`frontend/src/pages/ProjectDetail.tsx`** — Removed the in-page breadcrumb, `<h1>`, and status chip from the project header (now in TopBar). Removed the `Link` and `ProjectStatusChip` imports that became unused. Kept the description line, SA→TAM/tasks meta row, and the Edit/Context action buttons; reduced the header's bottom margin from `mb-4` → `mb-3` since it's much thinner.

### Added — 2026-05-09 — Project Overview tab with S-curve (baseline vs current)

New project sub-route `projects/:id/overview` becomes the default landing tab when entering a project (replaces the old default `list`).

- **`frontend/src/pages/views/ProjectOverview.tsx`** (new) — Overview view containing:
  - **KPI strip** (4 cards): total tasks (with top-level/subtask split), completion %, overdue count, baseline lock state.
  - **Progress S-Curve segment** (`recharts` LineChart) plotting cumulative tasks scheduled to complete over time. Two series: dashed gray "Baseline (planned)" using `task.baselineDueDate`, solid blue "Current (re-planned)" using `task.dueDate`. Includes a `ReferenceLine` at "today", a slip-days indicator (delta between baseline final date and current final date), and a custom legend strip.
  - **Empty / lock states**: when no baseline is locked, only the current curve is shown plus a "Lock baseline in Gantt" CTA. When no tasks have dates, an empty-state card replaces the chart.
- **`frontend/src/App.tsx`** — Registered `<Route path="overview" element={<ProjectOverview />} />` under `projects/:id`. Switched the index redirect from `list` → `overview`.
- **`frontend/src/pages/ProjectDetail.tsx`** — Added `Overview` as the first entry in the `TABS` array.

Why: gives TAMs a single-glance status surface — completion, overdue, and schedule-slip — without opening Gantt. The S-curve is the canonical PM view of planned-vs-actual progress; here "actual" is interpreted as the currently-scheduled timeline (since tasks don't carry a `completedAt` timestamp), which still reveals re-plans relative to the locked baseline.

### Changed — 2026-05-09 — Harmonize all modals with TaskFormModal styling

Make every modal in the app share the same chrome/footer language as the redesigned TaskFormModal.

- **`frontend/src/components/Modal.tsx`** — Default header (rendered when no `customHeader` is supplied) now uses the subtle breadcrumb style: `bg-surface-container-low`, `text-xs text-on-surface-variant`, `py-3` (was `text-base font-semibold text-on-surface`, `py-4`, no bg). All modals inheriting the default header now match the task modal's quieter top-bar style.
- **`frontend/src/components/ProjectFormModal.tsx`**, **`CustomerFormModal.tsx`**, **`RiskFormModal.tsx`**, **`ConfirmModal.tsx`** — Footer buttons unified to the TaskFormModal pattern:
  - Cancel: `rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container` (was a flat link-style `rounded` button with no border).
  - Primary action: `rounded-lg bg-primary … hover:bg-primary/90` (was `rounded bg-primary … hover:bg-primary-container` with `font-display`). Removed `font-display` since TaskFormModal doesn't use it on action buttons.
  - ConfirmModal warning tone updated to match: `rounded-lg`, no `font-display`.

### Changed — 2026-05-09 — Compact spacing in ProjectList (Task List view)

The font bump pushed task rows visually further apart; tightened vertical paddings to restore density.

- **`frontend/src/pages/views/ProjectList.tsx`**:
  - Section header row: `py-2` → `py-1.5`.
  - Task row (desktop grid): `py-3` → `py-1.5`.
  - Task row (mobile card): `py-3` → `py-2`.
  - Subtask row (desktop grid): `py-2` → `py-1`.
  - Subtask row (mobile card): `py-2` → `py-1.5`.
  - "Add task..." button (under section): `py-2` → `py-1`.
  - "Add subtask..." button (desktop, inline): `py-1.5` → `py-1`.
  - Empty-section message: `py-3` → `py-2`.
  - Title + ID-subtext column: removed `gap-0.5` (let line-height handle spacing).

### Changed — 2026-05-09 — Global font-size bump (+1px across the scale)

Default fonts felt too small at desktop viewport. Applied a uniform +1px bump.

- **`frontend/tailwind.config.ts`** — Overrode Tailwind's default `fontSize` scale via `theme.extend.fontSize`: `xs` 12→13, `sm` 14→15, `base` 16→17, `lg` 18→19, `xl` 20→21, `2xl` 24→25, `3xl` 30→31, `4xl` 36→37 (each with proportional `lineHeight`). Bumped app-specific tokens too: `h1` 32→34, `h2` 24→26, `body-lg` 16→17, `body-sm` 14→15, `data-mono` 13→14, `label-caps` 11→12.
- **Mass replacement of arbitrary `text-[Npx]` utilities across `frontend/src/`** (281 occurrences) — applied +1px to every bracket-syntax pixel size, largest-to-smallest order to avoid double-bumping: `[20px]→[21px]`, `[18px]→[19px]`, `[16px]→[17px]`, `[14px]→[15px]`, `[13px]→[14px]`, `[12px]→[13px]`, `[11px]→[12px]`, `[10px]→[11px]`, `[9px]→[10px]`. Scope: all `*.ts` / `*.tsx` files under `frontend/src/`.

Why: keeps the visual hierarchy and density intact while improving readability at default zoom. `npm run typecheck` passes.

### Changed — 2026-05-09 — Screen-by-screen refinement pass (Projects, List, Kanban, Task modal)

Iterated on the AProjectO design revamp per user review of rendered screens:

- **`frontend/src/components/Modal.tsx`** — Added `customHeader?: ReactNode` prop; when provided it replaces the default title/close header so callers can supply custom breadcrumb-style headers without changing shared modal behavior.
- **`frontend/src/pages/Projects.tsx`** — Rebuilt `ProjectCard`: title + hover-reveal edit icon, status chip top-right, 3-line description clamp, bottom row with SA/TAM avatar cluster (amber/blue, -6px overlap) + issues count. Removed the old TAM-text/border-t footer. Filter bar selects/buttons updated to `rounded-lg`.
- **`frontend/src/pages/views/ProjectKanban.tsx`** — Columns no longer have a card background; they float on the bg with a ring-2 ring-primary highlight on drag-over. Column header is bold name + `more_horiz` menu icon. Teal dashed `+` box replaces the bottom "Add task" button. `TaskCard` redesigned: title + duration (`X Days` from start→due diff), 2-label strip, description `line-clamp-2`, bottom row with 📎0/💬N counts + priority badge + assignee avatar. `AssigneeAvatar` and `startOfToday` helpers removed (unused). Added `getDuration` helper.
- **`frontend/src/pages/views/ProjectList.tsx`** — Desktop grid updated from 5 columns to 7: `[36px • 1fr • 190px • 170px • 80px • 48px • 28px]`. New columns: done-toggle | task title+ID subtext | status+priority chips | dates (calendar icon) | timer `--:--:--` placeholder | assignee avatar | comment count. Imported `TaskStatusChip` and `PriorityBadge`. `SubtaskRow` desktop grid and "Add subtask" button row updated to match. Mobile card layout unchanged.
- **`frontend/src/components/TaskFormModal.tsx`** — Full Screen 7 redesign. Modal now uses `customHeader` (breadcrumb `T-XXX` + close button on `bg-surface-container-low`). Form is single-column: large borderless title input + cosmetic timer row (edit mode only); icon field rows (Priority, Status, Assignee, Due Date, Start Date, Parent, Section, Labels) inside a rounded card; Attachments placeholder; Description textarea; Subtasks checklist; Comments section with cosmetic B/I/U toolbar strip above `CommentThread`. All create/edit/delete mutations and validation logic kept intact. Width reduced from `max-w-3xl` to `max-w-lg`.

### Added — 2026-05-09 — Frontend design revamp: AProjectO design language applied across all pages

Full visual overhaul of the Solvro frontend adopting the AProjectO design language (blue-gray base `#F0F4F9`, shadow-based white cards, larger radii, pill-shaped chips, light sidebar). All backend wiring kept intact. Dark mode preserved with a blue-gray dark palette.

**Design tokens** (`frontend/src/index.css`, `frontend/tailwind.config.ts`):
- `--background` and surface-container tokens shifted from lavender (`249 249 255`) to blue-gray (`240 244 249` = `#F0F4F9`) in both light and dark themes. Dark theme rebuilt with blue-gray hue family (`bg: 15 20 30`, surface: `22 28 40` etc.).
- `--outline-variant` lightened to `209 214 226`.
- Border radius scale bumped: `DEFAULT: 0.5rem` (was 0.25), `lg: 1rem` (was 0.5), `xl: 1.5rem` (was 0.75); added `2xl: 2rem`. `sm` kept as 0.25rem.

**Layout chrome** (`Shell.tsx`, `Sidebar.tsx`, `TopBar.tsx`):
- `Shell`: main area bg changed from `bg-surface-container-low` → `bg-background` (the new blue-gray).
- `Sidebar`: background changed from `bg-slate-950` (dark) → `bg-surface-container-lowest dark:bg-surface-container-low` (white/dark-blue-gray). All `slate-*` hardcoded classes removed; active nav item changed from `bg-primary/15 text-inverse-primary` → solid `bg-primary text-on-primary`. Bottom status border updated to `border-outline-variant`.
- `TopBar`: search input changed to `rounded-full` + `border border-outline-variant`; user block now shows a two-line name/role block instead of single username.

**Shared atoms** (`StatusChip.tsx`, `PriorityBadge.tsx`, `Modal.tsx`):
- `StatusChip`: `rounded` → `rounded-full` on both `ProjectStatusChip` and `TaskStatusChip`.
- `PriorityBadge`: `rounded` → `rounded-full`.
- `Modal`: desktop radius bumped `md:rounded-lg` → `md:rounded-xl`.

**Login** (`Login.tsx`): Two-column layout — left `bg-primary` panel with decorative rings + feature icon grid; right white form panel with bottom-border-only inputs and a black "Log in" button. Mobile shows only the form panel.

**Overview** (`Overview.tsx`): Replaced 4 stat cards + 2 list sections with 2×2 dashboard grid: Projects mini-card (count + link), Tasks donut (`recharts PieChart`), Work Log coming-soon placeholder, Performance line chart (`recharts LineChart`). All cards `rounded-xl shadow-sm`.

**Project pages** (`Projects.tsx`, `ProjectDetail.tsx`, `ProjectList.tsx`, `ProjectKanban.tsx`):
- Project cards: outlined → `rounded-xl shadow-sm` (no border). Hover: shadow intensifies instead of border color change.
- ProjectDetail: breadcrumb added above title (`Projects / {name}`); buttons rounded-lg; SA → TAM flow shown in subtitle.
- ProjectList: outer wrapper → `rounded-xl shadow-sm overflow-hidden`; toolbar buttons → `rounded-lg`.
- Kanban: columns `rounded-xl shadow-sm`, `ring-2 ring-primary` on drag-over; task cards `rounded-xl shadow-sm hover:shadow-md`; column count badge → `rounded-full`.

**Form modals** (`TaskFormModal.tsx`, `ProjectFormModal.tsx`): All inputs/selects/textareas → `rounded-lg`; footer buttons → `rounded-lg`; error alerts → `rounded-lg`; subtask list → `rounded-xl`.

**Remaining pages** (`Reports.tsx`, `Settings.tsx`, `Admin.tsx`, `Customers.tsx`): All card sections → `rounded-xl shadow-sm` (border removed); inputs → `rounded-lg`; error/success alerts → `rounded-lg`; theme choice buttons in Settings → `rounded-xl`; role badge → `rounded-full`.

**Work Logs preview** (`WorkLogs.tsx`): New page with "Coming Soon" empty state (icon + heading + description + "Preview only" badge). Route `/work-logs` added to `App.tsx` under `<AuthGuard><Shell/>`. "Work Logs" nav item (`work_history` icon) added to `Sidebar.tsx` between Tasks and Reports.

### Changed — 2026-05-08 — `CLAUDE.md` synced with subtasks, comments, baseline, admin query keys, and CONFIGURATION.md

Four gaps between current code and the orientation doc closed — no code or schema touched:

- **Data model paragraph** now calls out the self-referential `parentTaskId` subtask relation and the `topLevel` query param, the `Comment` entity and its `GET/POST /tasks/:id/comments` thread, and the baseline-locking mechanics (`POST /projects/:id/baseline` snapshot-copies task dates into `baselineStartDate`/`baselineDueDate` and stamps the project).
- **Routes inventory** documents `POST /projects/:id/baseline` — what it does, how `{ clear: true }` resets, and that it operates atomically.
- **Server state hooks** list extended to include sections, comments, and `useLockBaseline`; notes the separate `adminQueryKeys` namespace (distinct from `queryKeys`) and documents the optimistic-update pattern used by `useUpdateTask`/`useUpdateRisk` as the canonical model for instant-feeling inline mutations.
- **Repository status** now references `CONFIGURATION.md` as the env/port/deployment reference.

### Added — 2026-05-04 — `CONFIGURATION.md` reference document

New top-level [CONFIGURATION.md](CONFIGURATION.md) at the repo root — a two-layer (high-level + detailed) configuration reference covering the three deployment shapes (native dev / dockerised dev / prod), every backend/frontend/postgres/GHCR env var with defaults and validation rules, services + ports + volumes, the `/api` reverse-proxy pattern, migrations, seeded credentials, RBAC config, theme tokens, and the `setup.sh` prod bootstrap. User noted they will move it later (it's at the root for now). Documentation-only — no code, schema, or compose changes.

### Changed — 2026-05-04 — `CLAUDE.md` synced with Risk Management + Gantt export additions

[CLAUDE.md](CLAUDE.md) was drifting against recent commits (f44133e Risk Management view, 8c1b78c Gantt Excel/PDF export). Synced the orientation doc so future Claude sessions don't re-discover this from scratch:

- **Routes inventory** updated to include `risks` and explain the split (`PATCH/DELETE /risks/:id` lives in [backend/src/routes/risks.ts](backend/src/routes/risks.ts); creation is nested under `POST /projects/:id/risks` in [backend/src/routes/projects.ts](backend/src/routes/projects.ts)) — both gate via `requirePermission("project:write")` + `projectVisibilityFilter`.
- **Admin sub-tree** now called out explicitly: `/admin` carries user CRUD **and role CRUD** (custom roles with arbitrary permission arrays), which is what makes the project-wide `hasPermission`-not-role-name pattern load-bearing.
- **Project sub-views** updated from four to five (`{list,kanban,gantt,timeline,risks}`) with the wiring rule "register in both [App.tsx](frontend/src/App.tsx) and [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)".
- **Prisma data-model paragraph** now lists `Risk` (and the `Service` / `CustomerService` join) alongside the other domain models, with a one-line note that `riskScore` is derived (`probability × impact`) — not stored — so future agents don't try to add a column or trigger.
- **Server-state hooks** paragraph mentions `useProjectRisks` / `useCreateRisk` / `useUpdateRisk` / `useDeleteRisk` and the centralised `queryKeys` map.
- **Gantt export layer** added as its own bullet under Frontend conventions: [exportExcel.ts](frontend/src/lib/gantt/exportExcel.ts) (`exceljs`) + [exportPdf.ts](frontend/src/lib/gantt/exportPdf.ts) (`jspdf` + `jspdf-autotable`) + shared [exportContext.tsx](frontend/src/lib/gantt/exportContext.tsx). Documented the rule that the heavy export deps must stay behind dynamic `import()` so they don't enter the main bundle.

No code or schema touched — documentation-only sync.

### Added — 2026-05-03 — Risk Management view (Risk Register Table) on Project Detail

New project sub-view at `/projects/:id/risks`, sitting next to **Timeline** in the project tab nav. Implements a full risk register:

- **Schema** — [backend/prisma/schema.prisma](backend/prisma/schema.prisma): new `Risk` model (`description` text, `category` enum, `probability` 1–5, `impact` 1–5, `status` enum, `mitigationPlan` / `contingencyPlan` long text, timestamps) plus two enums `RiskCategory` (EXTERNAL / INTERNAL / TECHNICAL / ORGANIZATIONAL / FINANCIAL) and `RiskStatus` (OPEN / MITIGATED / CLOSED). `Risk` cascades on project delete. Indexed on `projectId`, `status`, `category`. Migration: [20260502185229_add_risks](backend/prisma/migrations/20260502185229_add_risks/). Score is **not stored** — it's a derived field (`probability × impact`) computed in the UI to keep the source of truth single.
- **Backend routes** — [backend/src/routes/risks.ts](backend/src/routes/risks.ts) for `PATCH /risks/:id` and `DELETE /risks/:id`; project-scoped `GET /projects/:id/risks` and `POST /projects/:id/risks` added to [backend/src/routes/projects.ts](backend/src/routes/projects.ts). Both project-scoped endpoints honour `projectVisibilityFilter` (so SAs/TAMs only see risks on projects they can already see). Item-scoped PATCH/DELETE re-resolve the parent project through the same filter to prevent cross-project access. Writes gated by `requirePermission("project:write")`. Mounted at `/risks` in [backend/src/app.ts](backend/src/app.ts).
- **Frontend data layer** — [frontend/src/lib/queries.ts](frontend/src/lib/queries.ts): `Risk`, `RiskCategory`, `RiskStatus` types; query key `projectRisks(id)`; hooks `useProjectRisks`, `useCreateRisk`, `useUpdateRisk` (with optimistic update for inline cell edits), `useDeleteRisk`.
- **Form modal** — [frontend/src/components/RiskFormModal.tsx](frontend/src/components/RiskFormModal.tsx): create/edit modal with description, category, status, probability/impact (1–5 selects with descriptive labels), live-computed score with color band, and the two long-text plans. Exports the `scoreClass` and `scoreLevel` helpers so the table view can reuse them.
- **View** — [frontend/src/pages/views/ProjectRisks.tsx](frontend/src/pages/views/ProjectRisks.tsx): summary tiles (count by High/Medium/Low + Open), search input (description + plans), category filter, status filter, plus a dense table with inline editable Probability / Impact / Status cells (uses `useUpdateRisk`'s optimistic update to keep the cell snappy). Score cell is color-coded: 1–8 emerald (Low), 9–15 amber (Medium), 16–25 error/red (High). Mobile fallback below `md:` is a stacked card list (matching the project-wide pattern). Tab/route wired in [frontend/src/App.tsx](frontend/src/App.tsx) and [frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx).

Why a derived `riskScore` instead of a stored column: any time prob/impact changes the cached score has to be recomputed; storing it would either require a trigger or risk drift between the inputs and the stored score. The UI computes it anywhere it's shown, so there's no source of staleness.

### Changed — 2026-05-03 — Task editor: drop baseline-date fields; List view shows task description under the title

Two unrelated UX trims to the task surface:

- **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — removed the entire "Baseline Dates" subsection (the dashed-border block with `baselineStartDate` / `baselineDueDate` inputs and the explanatory caption), along with the four supporting locals (`baselineStartDate`, `baselineDueDate` state, the two `setBaseline*` reset paths in the open-effect, and the `baselineStartIso` / `baselineDueIso` payload fields on the update mutation). Baseline planning is conceptually a *Gantt-only* concern — it's the visual delta between planned vs. actual that only makes sense in the bar-chart context. Mixing it into a per-task editor invited stale baselines and clutter. Schedule edits in the editor still use the regular `startDate` / `dueDate` fields. The backend still accepts `baselineStartDate` / `baselineDueDate` patches; the editor simply no longer writes to them. When a Gantt-side baseline UI is wired up (separate task), it can re-introduce these fields in the right place.
- **[frontend/src/pages/views/ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx)** — task description now renders **inline to the right** of the title (separated by an em-dash, single-line truncated) in all four row variants (top-level desktop, top-level mobile, subtask desktop, subtask mobile). Title is `shrink-0 truncate` so it never collapses; description gets the remaining space (`min-w-0 truncate`) and is clipped if the row is narrow. Picked inline over the original "stacked under title" layout because the row is already a single-line grid — stacking pushed the row height up and broke vertical rhythm with neighbouring rows. Description only renders when present, so empty-description rows look identical to before. Helps users scan the list view without needing to open every task to see what it's actually about.

### Removed — 2026-05-03 — `SOLV-XXX` ID badges everywhere; `T-XXX` from low-value sites

The `SOLV-XXX` and `T-XXX` strings were pure frontend renderings of the database autoincrement integer IDs (`String(id).padStart(3, "0")` with a hardcoded prefix). Audit confirmed they were never used in routing (URLs key off raw int), never sent to the backend API (purely cosmetic), not searchable (TopBar search non-functional), and not in PRD.md / DESIGN.md as product requirements. They came from the mockups as visual filler. Cleaned up the noise:

- **SOLV-XXX dropped everywhere** (4 sites). Users navigate projects by name + status + customer, not by autoincrement ID.
  - **[frontend/src/components/layout/RightSidebar.tsx](frontend/src/components/layout/RightSidebar.tsx)** — header now shows just the status chip + project name, no ID line.
  - **[frontend/src/pages/Projects.tsx](frontend/src/pages/Projects.tsx)** — project card shows status chip aligned right, no ID caption above the title. Status row uses `justify-end` since the ID was the only left-side element.
  - **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — page header drops the small SOLV-XXX caption above the H1.
  - **[frontend/src/pages/Overview.tsx](frontend/src/pages/Overview.tsx)** — recent-projects list shows just the status chip + name + meta, no ID.
- **T-XXX kept** in 2 sites where users actually reference tasks by short stable code:
  - [frontend/src/pages/Tasks.tsx](frontend/src/pages/Tasks.tsx) — the cross-project Tasks table's monospace ID column (canonical reference for standups/Slack/commits).
  - [frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx) Parent task dropdown — disambiguates two parents that happen to share a similar title.
- **T-XXX dropped** in 3 decoration-only sites:
  - **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — modal title bar now reads "Edit task" instead of "Edit task · T-008" (the modal is already scoped to one task).
  - **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — subtask list inside the edit modal drops the inline T-XXX next to each subtask title; collapsed the row from `flex items-center justify-between` to `flex items-center gap-2` since there's no longer a right-side element to balance.
  - **[frontend/src/pages/views/ProjectTimeline.tsx](frontend/src/pages/views/ProjectTimeline.tsx)** — timeline rows drop the leading T-XXX chip in front of status/priority; subtask sub-list drops T-XXX in front of titles.
- **No backend / schema / routing change** — purely UI. The mockup HTMLs in [UI Design/](UI Design/) still show SOLV-XXX, but per CLAUDE.md "DESIGN.md frontmatter wins" on drift; those are frozen reference assets.

### Changed — 2026-05-03 — Gantt PDF export rewritten as native vector drawing (no html2canvas)

After the previous "crop the html2canvas capture" attempt still produced 8 mostly-blank pages with no visible Gantt, the PDF export was rewritten end-to-end. The DOM-screenshot approach kept failing — likely a combination of CSS-variable resolution, sticky-positioned axis, and the chart's nested `overflow:auto` ancestor confusing html2canvas's layout pass. Symptoms ranged from blank pages to phantom transparent regions to the bars rendering as the wrong color. Replaced with a deterministic vector renderer.

- **[frontend/src/lib/gantt/exportPdf.ts](frontend/src/lib/gantt/exportPdf.ts)** — completely rewritten. Now draws the Gantt directly using `jspdf` primitives (`rect`, `line`, `text`, `setFillColor`, `setDrawColor`) from the same `rows`/`holidays` data the UI consumes. No html2canvas, no DOM read, no layout-dependent capture. Layout: a 160pt label column on the left + a date grid that auto-fits one A4-landscape page (or paginates if days × min-column-width exceeds the available width). Row height auto-scales to fit all rows on one page (clamped 11–18pt). Renders: month bands + day numbers in a 22pt axis, weekend/holiday tints across the body, a red today line, status-colored bars with priority-colored left borders, section headers with tinted full-row backgrounds, and bar labels inside bars when there's space. Bars that straddle a horizontal page boundary are clamped to the visible day range so they appear on each page they cover. Final page is the unchanged jspdf-autotable task table (Section · Title · Status · Priority · Start · Due).
- **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — `exportGanttToPdf` no longer needs `ganttContentEl`/`chartStart`/`viewMode`/`columnWidth`. Call site simplified to `{ projectName, rows, exportStart, exportEnd, holidays }`. Removed the now-unused `ganttContentRef` and the `bg-surface-container-lowest` class on the inner content div (was only added to make the html2canvas capture have a defined background — no longer relevant).
- **[frontend/package.json](frontend/package.json)** — uninstalled `html2canvas` from direct deps (no longer imported). It still appears as a transitive dep of jspdf (jspdf uses it internally for its `pdf.html()` API which we don't call), so a `html2canvas.esm-*.js` chunk still appears in `dist/assets/` — but it's never loaded at runtime.
- **Output is vastly smaller**: previous html2canvas-based PDFs were multi-MB rasterized; the new vector PDF for a typical project is <100KB. Also crisp at any zoom (vectors, not pixels) and the text is searchable.

### Fixed — 2026-05-03 — Gantt PDF export produced ~100 blank pages

- **[frontend/src/lib/gantt/exportPdf.ts](frontend/src/lib/gantt/exportPdf.ts), [frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — symptom: PDF export produced 102 pages, the Gantt screenshot was nowhere visible, and the only meaningful content (the task table) appeared on the last page. Root cause: the on-screen Gantt is padded ±1 year of empty columns on each side for natural scroll headroom (`PAD_YEARS = 1` in [geometry.ts](frontend/src/lib/gantt/geometry.ts)), so `ganttContentEl.scrollWidth` was ~45,000px. html2canvas captured the full 45k-pixel canvas; pagination sliced it into ~100 vertical slabs, each landing in the empty padding region (the actual task bars are in a thin slice ~1% of the way through). Fix: `exportGanttToPdf` now also receives `chartStart`/`viewMode`/`columnWidth` and an `exportStart`/`exportEnd` window (the same ±7-day window used by Excel). After the full canvas is captured, it's cropped to `[list_pane | tight_chart_slice]` via `positionFor()` mapping the export window into element pixels and then into canvas pixels via the html2canvas `scale` factor. Pagination then runs on the cropped canvas, producing typically 1–2 pages of dense Gantt followed by the task table page. Also switched html2canvas's `backgroundColor` from `null` (transparent) to `#ffffff` so blank slices, if any, are explicitly white instead of relying on whatever's underneath.

### Changed — 2026-05-03 — Gantt Excel export: trim Tasks sheet to 6 columns

- **[frontend/src/lib/gantt/exportExcel.ts](frontend/src/lib/gantt/exportExcel.ts)** — Sheet 1 ("Tasks") dropped Task ID, Baseline Start, Baseline Due, Assignee, and Labels. Final columns are Section · Title · Status · Priority · Start · Due. The Sheet 2 ("Gantt") date grid is unchanged.

### Fixed — 2026-05-03 — Gantt export: PDF `autoTable is not a function`; Excel grid spans ±1 year of empty columns

Two follow-up fixes to the Gantt export feature added the same day:

- **[frontend/src/lib/gantt/exportPdf.ts](frontend/src/lib/gantt/exportPdf.ts)** — `jspdf-autotable` v5 (the version pinned by `^5.0.7`) no longer monkey-patches the jsPDF prototype on side-effect import; the previous `(pdf as any).autoTable(opts)` call site threw `autoTable is not a function`. Switched to the canonical v3+ API: `import autoTable from "jspdf-autotable"` (via dynamic-import default export) and call as `autoTable(pdf, opts)`. Removed the obsolete `as unknown as { autoTable: … }` type cast.
- **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — the Excel export was being passed `chartStart` / `chartEnd`, which include the chart's `PAD_YEARS = 1` year of padding on each side ([geometry.ts](frontend/src/lib/gantt/geometry.ts)). For a project with tasks spanning a few weeks the resulting "Gantt" sheet was 700+ mostly-empty columns. Now computes a tight ±7-day window around `dateRange.min` / `dateRange.max` (the actual task date range, already memoized) and passes that into `exportGanttToExcel`. Falls back to `chartStart` / `chartEnd` when `dateRange` is null (no dated tasks). The on-screen Gantt visualization itself is unchanged — still uses the wide padding for natural scroll headroom.

### Added — 2026-05-03 — Export Gantt schedule to Excel / PDF

Two new export buttons in the project's right context sidebar (visible only while the Gantt sub-route is active) produce takeaway artefacts of the project schedule:

- **Excel (.xlsx)** — two-sheet workbook. Sheet 1 "Tasks" is a flat sortable table (Section, Task ID, Title, Status, Priority, Start, Due, Baseline Start, Baseline Due, Assignee, Labels). Sheet 2 "Gantt" is a date-grid emulation of the visual Gantt: one column per day from `chartStart` to `chartEnd`, weekends/holidays subtly shaded, today's column outlined in red, task rows with status-colored fills across `[startDate..dueDate]` and a priority-colored left border on the first day of each task.
- **PDF** — A4 landscape multi-page report. Page 1+ is a `html2canvas` screenshot of the **full** Gantt content (chart wider than viewport is auto-sliced into multiple horizontal pages so nothing is clipped); the final page is a `jspdf-autotable` task table.

**Why right sidebar instead of Gantt toolbar**: the toolbar is already busy (Today / Task / Section / Lock Baseline / Scale picker) and the export concept is project-level rather than tool-level. The buttons live next to the rest of the project context (Stakeholders, Documents) where stakeholder reporting actions naturally belong.

- **[frontend/package.json](frontend/package.json)** — added 4 deps: `exceljs` (chosen over `xlsx` because the date-grid sheet needs colored cell fills, which require ExcelJS's first-class style support), `html2canvas`, `jspdf`, `jspdf-autotable`.
- **All four are lazy-loaded** via dynamic `import()` from inside the export functions. Build output confirms separate chunks: `exceljs.min-*.js` (~938KB), `jspdf.es.min-*.js` (~390KB), `html2canvas.esm-*.js` (~201KB), `jspdf.plugin.autotable-*.js` (~31KB) — main bundle (`index-*.js`) grew only ~13KB for the wiring code, not the libs themselves.
- **[frontend/src/lib/gantt/exportContext.tsx](frontend/src/lib/gantt/exportContext.tsx)** — new `GanttExportProvider` + `useGanttExport()` hook. Stores `{ excel, pdf }` handlers in state. The handlers' presence is the gate: when `null`, the sidebar Export section is hidden. Bridges the Gantt sub-route (where data + DOM ref live) and the right sidebar (mounted by ProjectDetail, outside the routed Outlet).
- **[frontend/src/lib/gantt/exportExcel.ts](frontend/src/lib/gantt/exportExcel.ts)** — new. Builds the two-sheet workbook in pure JS, triggers download via Blob + `<a download>`. Filename: `${slug(projectName)}_gantt_${yyyy-mm-dd}.xlsx`.
- **[frontend/src/lib/gantt/exportPdf.ts](frontend/src/lib/gantt/exportPdf.ts)** — new. Renders the `ganttContentRef` element via html2canvas at full `scrollWidth` × `scrollHeight` (the DOM is laid out at full chart size; only the outer `overflow:auto` container crops the viewport, so html2canvas captures off-screen content too). Slices into per-page horizontal slabs with a fresh white-backed canvas per slab so wide projects span multiple pages without clipping. Final page rendered via `jspdf-autotable`.
- **[frontend/src/lib/gantt/palette.ts](frontend/src/lib/gantt/palette.ts)** — new. Single source of truth for status fill hex (sky-200 / blue-400 / emerald-400) and priority border hex (slate-400 / blue-500 / amber-500 / red-500). Used by [GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx) at the inline `borderLeft` style and by both export modules so the UI and the artefacts share one color table.
- **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** — refactor only. Replaced the inline `PRIORITY_BORDER_COLOR` map with the imported `PRIORITY_BORDER_HEX` from `palette.ts`. No behavior change.
- **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — added `projectName: string` prop, a `ganttContentRef` on the inner full-content `<div>` (the html2canvas target), and a `useEffect` that calls `useGanttExport().register({ excel, pdf })` whenever `chartStart`/`chartEnd`/`rows`/`holidays`/`projectName` change. Cleanup callback registers `null` so the sidebar section hides when the Gantt unmounts (e.g. user navigates to List/Kanban/Timeline). Errors thrown by either export bubble into the existing `setActionError` toast bar in addition to the per-button error state in the sidebar. Inner content `<div>` got `bg-surface-container-lowest` so the html2canvas capture has a defined background even on transparent themes.
- **[frontend/src/components/layout/RightSidebar.tsx](frontend/src/components/layout/RightSidebar.tsx)** — new "Export schedule" `<section>` block before the Documents section. Two buttons (Excel + PDF) with material icons (`table_view`, `picture_as_pdf`), local `exporting` state for "Exporting…" labels, an inline error block for failures. Reads handlers from `useGanttExport()` and conditionally renders the whole section only when handlers are non-null — so List/Kanban/Timeline sub-routes don't show export buttons that wouldn't have valid Gantt data behind them.
- **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — wrapped the project page tree (the existing `<div>`-with-context-margin and the trailing `<RightSidebar>`) in a single `<GanttExportProvider>`. Provider lifetime matches a single project's lifetime; no global state pollution.
- **[frontend/src/pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx)** — passes `projectName={project.name}` (already in scope from `useProjectContext()`) into `<GanttFrame>` for the export filename.
- **Permissions**: ungated. Anyone who can view the Gantt can export it (read-only data). STAKEHOLDER role works without `task:write`.
- **Theme**: PDF screenshot captures whatever theme is currently active. Forcing light mode at export time is a future tweak if dark-themed exports look bad on print.

### Added — 2026-05-03 — Delete tasks from the task editor

- Backend `DELETE /tasks/:id` (in [backend/src/routes/tasks.ts](backend/src/routes/tasks.ts), gated by `requirePermission("task:write")`) already existed; this commit only adds the frontend wiring.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — new `useDeleteTask(projectId)` mutation hook. Invalidates `projectTasks(projectId)`, the cross-project `["tasks"]` list, and the overview query on success so dependent panes (Kanban, Gantt, List, Tasks page, Overview cards) refresh immediately.
- **[frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)** — added a "Delete task" button in the modal footer, only rendered in edit mode and only for users with the `task:write` permission. Positioned left via `mr-auto` so Cancel and Save stay on the right of the existing footer flex row. Confirmation uses a native `window.confirm()` (matches the Admin → Users delete pattern from 2026-05-02). If the task has subtasks, the confirm message says how many will be cascade-deleted (the backend hard-deletes; child task FKs cascade per the schema). On success the modal closes; on backend error (e.g. FK constraint) the message surfaces in the existing `<div role="alert">` inside the form. The submit/cancel buttons disable while the delete is in flight via the existing `submitting` flag (now also OR'd with `remove.isPending`).
- **No schema or migration change.** Schema-level cascade behavior for subtasks/comments is whatever was already in [backend/prisma/schema.prisma](backend/prisma/schema.prisma); not touching it here.

### Changed — 2026-05-03 — Gantt task labels render outside the bar (right side)

- **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** — task names previously rendered inside the bar with `truncate` and a status-conditional text color (white on IN_PROGRESS/DONE, sky-900 on TODO). Now the label sits as an absolute, `pointer-events-none` sibling immediately after the bar's right edge (`left + width + 6px`), uses a single theme-aware `text-on-surface` color, and is `whitespace-nowrap` so it overflows naturally into adjacent columns instead of being clipped — matches the convention in the user's reference image. The progress fill inside the bar is unchanged. Removed the now-unused `STATUS_TEXT` mapping. Label position recomputes from `left` and `width` so it follows the ghost during drag/resize.

### Fixed — 2026-05-03 — Gantt weekend tint invisible in dark mode

- **[frontend/src/components/gantt/GanttColumnGrid.tsx](frontend/src/components/gantt/GanttColumnGrid.tsx)** — weekend columns used `bg-slate-900/[0.04]` with `mixBlendMode: "multiply"`, which multiplies a near-black tint onto whatever's underneath. On the dark theme background that produces ~zero visible contrast, so weekends rendered as plain dark cells indistinguishable from weekdays. Holidays (`bg-rose-500/10`) still showed because rose has enough chroma to survive the multiply. Fix: drop `mixBlendMode` entirely (multiply was working against the design-system's tonal layering anyway) and split the tint by theme — weekend is `bg-slate-900/[0.04] dark:bg-white/[0.05]` (subtle dark wash on light, subtle light wash on dark); holiday is `bg-rose-500/10 dark:bg-rose-400/15` (lighter rose hue on dark for the same perceived saturation). Both themes now render weekends and holidays at the same readability level.

### Fixed — 2026-05-03 — Gantt drag commit shifts dates back one day in positive-UTC timezones

The real cause of the "Gantt drag lands one day earlier than I dropped it" bug, superseding the `+1 day offset on move-drag` workaround from the earlier same-day Changed entry (which has now been reverted). The drag math was always correct; the bug was at the persistence boundary.

- **[frontend/src/lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts)** — new helper `toUtcMidnightISO(d: Date): string` that builds the ISO string for UTC midnight on the same calendar date as the input local Date. Plain `startOfDay(d).toISOString()` would shift the date backward in any positive-UTC timezone (e.g. UTC+7 local `2026-05-15T00:00:00+07:00` → `2026-05-14T17:00:00Z`), and `parseISODate` splits on `"T"` so the round-trip silently lost a day every drag commit — visible as the bar snapping back one column after release.
- **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — `handleCommit` now encodes both `startDate` and `dueDate` via `toUtcMidnightISO(...)` instead of `startOfDay(...).toISOString()`. Covers move-drag and both resize-drag paths since they all funnel through `handleCommit`. The optimistic ghost during drag was always correct (it operates on local Dates via `addDays`); only the post-commit rendered position was wrong because of the shifted persisted value.
- **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** — reverted the `deltaDays + 1` hack in the move-mode branch of `handlePointerMove`. Move-drag now shifts both edges by the raw rounded `deltaDays` again, matching resize-start and resize-end. With the timezone-encode fix in place the drag math is correct without any compensating offset.
- **`handleUpdateDates` in the same file** intentionally NOT touched — it accepts pre-formatted ISO strings from the inline date editor (`InlineDateRangeEditor`), which uses `<input type="date">` and emits `YYYY-MM-DD` strings that the backend interprets without timezone ambiguity. Only the drag path was building Dates in local time and then losing them through `toISOString()`.

### Fixed — 2026-05-03 — Gantt: don't snap-scroll back to today after a drag-reschedule

- **[frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)** — the "auto-scroll to today" effect was re-firing whenever `chartStart` changed, and `chartStart` is recomputed from the rows' date range (padded ±1 year) — so dragging a bar to a date that pushed the rows' min/max past the previous bound would silently yank the viewport back to today, losing the user's scroll position. Effect now gated by two refs: `didInitialScrollRef` (fires once on first paint) and `lastScrolledViewModeRef` (re-fires on view-mode swap because the axis coordinate system rebuilds). Plain data updates — including drag-reschedule that extends the chart range — no longer trigger a scroll. Also dropped `columnWidth` from the dep array (constant per view mode, redundant with the viewMode gate).

### Changed — 2026-05-03 — Gantt bar: square corners (move-drag offset reverted, see superseding Fixed entry)

- **[frontend/src/components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)** — bar corners squared from `rounded-full` → `rounded` (0.25rem default), on both the live bar and the baseline-ghost rect. Brings the visual in line with DESIGN.md's "Soft (0.25rem) roundedness... large radii are strictly forbidden" rule (CLAUDE.md design-drift section also flagged that the previous pill shape was a spec violation). The section bar (`GanttSectionBar`) was already a flat line with caps so it didn't need touching.
- **The same-turn `+1 day move-drag offset` was a misdiagnosis** of the off-by-one symptom and has been reverted in a later Fixed entry above. The real root cause was a timezone-shift in the drag-commit ISO encoding, not the drag math.

### Changed — 2026-05-03 — Switch all UI fonts to Source Sans 3 (Source Sans Pro family)

The two-typeface system (Space Grotesk for display + Inter for body) collapses to a single typeface across the entire app and reference mockups. The Tailwind alias structure (`font-display` / `font-body`) is preserved — both aliases now resolve to the same family — so the ~201 component sites using those classes pick up the new typeface with zero code changes.

- **Family loaded is "Source Sans 3"**, Adobe's rebrand of Source Sans Pro with a full 100–900 weight range. The legacy "Source Sans Pro" name on Google Fonts has no 500 weight, but the codebase uses `font-medium` (500) extensively; Source Sans 3 covers it natively without weight synthesis. The `font-family` literal in the Tailwind config is `"Source Sans 3"` to match the family name the Google Fonts response actually registers.
- **[DESIGN.md](DESIGN.md)** — frontmatter typography tokens (`h1`, `h2`, `body-lg`, `body-sm`, `data-mono`, `label-caps`) all switched from `Space Grotesk` / `Inter` → `Source Sans 3`. Typography prose section rewritten from the dual-font strategy paragraph to a one-typeface paragraph noting `data-mono` retains tabular numerics via `font-feature-settings: "tnum"` (the technique, not the typeface, is what aligns numbers). Components prose's button-label reference updated from "Space Grotesk for labels" → "Source Sans 3 for labels".
- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** — `extend.fontFamily` aliases `display` and `body` both point at `['"Source Sans 3"', "system-ui", "sans-serif"]`. No `mono` override added; `font-mono` keeps Tailwind's default monospace stack so the ~21 component sites using it for IDs/numerics retain columnar alignment via a true monospace.
- **[frontend/index.html](frontend/index.html)** — Google Fonts `<link>` now requests `family=Source+Sans+3:wght@300;400;500;600;700` (single family). Replaces the previous two-family request for `Space+Grotesk` + `Inter`. The two `preconnect` links and the separate Material Symbols `<link>` are unchanged.
- **[frontend/src/index.css](frontend/src/index.css)** — no edit required. `body { @apply font-body; }` and `h1–h4 { @apply font-display; }` automatically resolve to Source Sans 3 through the Tailwind alias indirection.
- **[UI Design/*/code.html](UI Design/)** — all 4 mockups (`solvro_command_center_updated_branding`, `solvro_project_view`, `solvro_settings`, `solvro_table_view`) updated alongside: each file's Google Fonts `<link>` rewritten to load Source Sans 3 only, and every `["Inter"]` / `["Space Grotesk"]` value in the inline Tailwind CDN config's `fontFamily` block replaced with `["Source Sans 3"]`. The 6 token keys (`h1`, `h2`, `body-lg`, `body-sm`, `data-mono`, `label-caps`) are unchanged. Mockup weight ranges per file were preserved as their own pre-existing patterns (300–700 for command_center / table_view; 400–700 for project_view / settings).
- **[CLAUDE.md](CLAUDE.md)** — "Two fonts, distinct roles" bullet in the Design system essentials section rewritten to "Single typeface app-wide", documenting the alias-points-at-one-family decision, the `font-feature-settings: "tnum"` mechanism for tabular numerics, and the explicit decision not to remap `font-mono`. Future Claude sessions reading the doc won't reintroduce a dual-font assumption.
- **No component edits.** The ~201 `.tsx` sites using `font-display` / `font-body` and ~21 sites using `font-mono` were intentionally not touched — the Tailwind alias indirection handles the swap. Backend has no font references.

### Changed — 2026-05-02 — CLAUDE.md: fix stale API base-URL description, add mobile responsiveness convention

- **[CLAUDE.md](CLAUDE.md)** — `/init` audit found two pieces of drift in the Frontend conventions section:
  - **API layer bullet** described `BASE_URL` as runtime-computed from `window.location` (`<protocol>//<hostname>:3000`). That hasn't been true since the 2026-05-02 same-origin nginx-proxy change — `BASE_URL` is the literal string `"/api"` and requests inherit `window.location.origin` via the nginx (prod) and Vite (dev) proxies. Rewrote the bullet to describe the actual proxy chain, the `/api` prefix stripping, and the `VITE_API_PROXY_TARGET` override for containerised dev. The earlier CHANGELOG entry that introduced the proxy explicitly flagged this doc bullet as stale; this is the followup.
  - Added a new bullet documenting the **`md:` (768px) mobile-responsiveness convention** that the 2026-05-02 mobile-support changes established (Sidebar drawer via `useSidebar()`, RightSidebar full-screen overlay, Modal edge-to-edge on phone, Gantt's `<ProjectList />` mobile fallback, ProjectList's two-layout-one-component pattern). Future Claude sessions adding new pages or modals now have a single source describing the desktop-first-then-gate-with-`md:` pattern instead of having to reverse-engineer it from the diff history.
- **No code change.** Pure doc update; no behavior, dependencies, or config affected.

### Changed — 2026-05-02 — Hide Gantt tab in ProjectDetail nav on phone

- **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — the Gantt tab in the project sub-nav is now `hidden md:inline-block`. Below 768px users see only List / Kanban / Timeline. Reason: the Gantt route already swaps to ProjectList on mobile (no real Gantt rendered), so showing a "Gantt" label on phone was misleading. The `/projects/:id/gantt` route still works for deep links and renders the list view as before.

### Added — 2026-05-02 — Mobile-browser support across the frontend (md:768px breakpoint)

Frontend is now usable on a 375px-wide phone viewport in mobile Safari / Chrome on Android, while desktop (≥768px) renders identically to before. Every change is gated behind Tailwind `md:` so the existing tri-panel layout is preserved.

- **[frontend/src/components/layout/Shell.tsx](frontend/src/components/layout/Shell.tsx)** — main reclaims full viewport on phone: `ml-16` → `md:ml-16`; `p-6` → `p-4 md:p-6`. Below 768px the collapsed sidebar rail is hidden so it no longer eats 64px of viewport.
- **[frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)** — when `!open` on mobile the rail is fully hidden (`hidden w-16 md:flex`); on desktop the icon-only rail behavior is unchanged. The existing backdrop + auto-close-on-nav now serve as the mobile drawer.
- **[frontend/src/components/layout/TopBar.tsx](frontend/src/components/layout/TopBar.tsx)** — added a hamburger button (`md:hidden`) before the title that calls `useSidebar().toggle()`; gated `ml-16` and `px-6` behind `md:`; hid the (currently non-functional) search input below `md:` to free up phone width.
- **[frontend/src/components/layout/RightSidebar.tsx](frontend/src/components/layout/RightSidebar.tsx)** — width is `w-full md:w-context-panel` so the project-context panel becomes a full-screen overlay on phone; added a tap-outside backdrop (`md:hidden`) mirroring Sidebar's. Z-index bumped above hamburger on mobile.
- **[frontend/src/pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)** — `mr-80` gated behind `md:` (no right-margin reservation on phone since RightSidebar overlays full-screen); header flex row stacks vertically below `md:`; tab nav wraps in `overflow-x-auto whitespace-nowrap` so the four tabs scroll horizontally if pinched.
- **[frontend/src/pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx)** — Gantt is hidden below `md:` (`hidden md:block`) and `<ProjectList />` is rendered as the mobile fallback. The Gantt is desktop-only by design (476px list pane + wide chart pane); the list view conveys the same task data in a phone-friendly shape. TaskFormModals stay outside both branches so create/edit flows work in either mode.
- **[frontend/src/pages/views/ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx)** — desktop 5-column grid (~752px wide) is preserved with `hidden md:grid`; below `md:` each task and subtask renders as a stacked card (title + status, then assignee + dates + overdue indicator). Same component, two layouts. Subtask expand/collapse and inline date editor work in both modes.
- **[frontend/src/components/Modal.tsx](frontend/src/components/Modal.tsx)** — modals go edge-to-edge full-screen on phone (`rounded-none`, no border, body scrolls independently via `flex-1 overflow-y-auto`); on `md:` the centered card with rounded corners and border returns. Single edit cascades to ConfirmModal, TaskFormModal, CustomerFormModal, ProjectFormModal, and the Gantt baseline-confirm modal — no per-modal pass needed.
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — three forms (Users, Roles, Services): every `<label className="flex-1 min-w-[…]">` becomes `w-full md:flex-1 md:min-w-[…]` so labels stack one-per-row on phone; submit buttons add `w-full md:w-auto`. Header and body padding gated behind `md:` (`px-4 md:px-6`, `p-4 md:p-6`). Tab strip wrapped in `overflow-x-auto`. Tables stay horizontal-scrolling on phone (existing `overflow-x-auto` is sufficient; stacked-card conversion deferred as future polish).
- **[frontend/src/components/Tabs.tsx](frontend/src/components/Tabs.tsx)** — added `whitespace-nowrap` so tab labels don't wrap inside the (now scrollable) container.
- **[frontend/src/pages/Settings.tsx](frontend/src/pages/Settings.tsx)** — Profile dl: `grid-cols-[140px_1fr]` → `grid-cols-1 md:grid-cols-[140px_1fr]` (label/value rows stack on phone). Theme picker: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` so the three theme cards stack on narrow phones.
- **[frontend/src/pages/CustomerDetail.tsx](frontend/src/pages/CustomerDetail.tsx)** — header flex-row → `flex-col md:flex-row md:items-start md:justify-between`, matching ProjectDetail's mobile treatment.

Reused existing primitives: `useSidebar()` for the mobile drawer toggle, the existing `Modal` component (single-file edit cascades to all callers), the existing Sidebar backdrop pattern (copied into RightSidebar). No new dependencies, no new hooks. CLAUDE.md note: `frontend/src/lib/api.ts` uses `BASE_URL = "/api"` (relative, with Vite proxy in dev and nginx in prod) — the runtime `window.location` description in the doc is stale, flag for separate update.

### Changed — 2026-05-02 — CLAUDE.md: refresh RBAC section to reflect permission gates

- **[CLAUDE.md](CLAUDE.md)** — "Auth & RBAC" and "Visibility filter" bullets in the Backend conventions section were describing the old role-name-only world. Updated to document `requirePermission("project:write" | "task:write" | …)` as the canonical action gate, the JWT `permissions[]` claim, the `hasPermission(user, "*")` wildcard short-circuit, the narrow remaining uses of `requireRole`/`requireAdmin`, and the fact that custom admin-defined roles without `*` only see projects they're directly assigned to. Brings the doc in line with commit `fcd8bd2` (RBAC permission-gate switch) so future Claude sessions don't fall back to stale role-name patterns.

### Fixed — 2026-05-02 — Stale cached user blocks UI permission gates after upgrade

- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — `AuthProvider` now calls `GET /auth/me` on boot whenever a token is present, and overwrites the cached user with the fresh response. Symptom this fixes: deployments upgraded from a pre-`permissions` bundle had `user` objects in localStorage without a `permissions` array, so `hasPermission(user, "project:write")` returned false and the "+ New Customer" / "+ New Project" buttons were hidden even for admins with `*`. Previously the only workaround was to log out and back in. If `/auth/me` 401s (token expired/invalid), the user is logged out cleanly.

### Added — 2026-05-02 — Admin can permanently delete users

- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — new `DELETE /admin/users/:id` endpoint. Refuses self-delete (admin cannot delete themselves). Pre-checks all FK relations: if the target user has any projects (as TAM or SA), locked baselines, assigned tasks, or comments, returns 400 with a list of blockers (e.g. `"3 project(s) as TAM, 12 assigned task(s)"`). Admin must reassign or clear those first. If clean, hard-deletes the row.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — new `useAdminDeleteUser` mutation hook. Invalidates both admin and global user queries plus the role list (so role user counts update).
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — added a "Delete" button to each row in Admin > Users (after Reset Password). Disabled for the current user (you can't delete yourself). Shows a `confirm()` dialog before firing. Backend errors (e.g. user-in-use) surface in the existing error banner above the table.

### Changed — 2026-05-02 — Customer form: AM is free text, SA stays as user dropdown

- **[frontend/src/components/CustomerFormModal.tsx](frontend/src/components/CustomerFormModal.tsx)** — Account Manager reverted to a free-text input. AMs are often external sales contacts who don't have user accounts in this system, so a hard dropdown of TAM-role users was the wrong shape. Solution Architect stays as a dropdown of literal SA-role users.

### Changed — 2026-05-02 — Customer form picks AM/SA from user dropdowns; wildcard users eligible for SA/TAM

- **[backend/src/routes/users.ts](backend/src/routes/users.ts)** — `GET /users` now returns each user's `permissions: string[]` alongside their role. Lets the frontend filter dropdowns by capability (e.g. "anyone with `*`") instead of only by literal role name.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — `UserSummary.permissions: string[]` added to match.
- **[frontend/src/components/CustomerFormModal.tsx](frontend/src/components/CustomerFormModal.tsx)** — replaced the free-text "Account Manager" and "Solution Architect" inputs with `<select>` dropdowns populated from `useUsers()`. AM list = users with `TAM` role OR `*` permission; SA list = users with `SA` role OR `*` permission. If the customer was created earlier with a free-text AM/SA value that doesn't match any current user, that legacy value is preserved as a `(current)` option so editing the customer doesn't silently lose it. Field still stored as a string (no schema change).
- **[frontend/src/components/ProjectFormModal.tsx](frontend/src/components/ProjectFormModal.tsx)** — SA and TAM dropdowns now include any user with `*` permission, not just literal SA/TAM-role users. So an admin (or any custom-role-with-`*`) user can be selected as the project's SA or TAM, and admins can self-assign when no SA/TAM-role users exist yet on a fresh deployment. `canPickTam` switched from `user.role === "ADMIN"` to `user.permissions.includes("*")` so DIRECTOR/MANAGER-equivalents can also reassign.

### Changed — 2026-05-02 — RBAC switched from role-name gates to permission gates

- **[backend/src/http/auth.ts](backend/src/http/auth.ts)** — `JwtPayload` now carries `permissions: string[]` alongside `role`. New helper `hasPermission(payload, perm)` returns `true` if the user has `*` (full access) or the specific permission. New middleware `requirePermission(perm)` for action-level authorization. `verifyToken` parses `permissions` from the JWT defensively (old tokens issued before this change get `[]` and re-acquire perms on next login). `requireRole` and `requireAdmin` are kept for the admin-only namespace.
- **[backend/src/routes/auth.ts](backend/src/routes/auth.ts)** — `/auth/login` and `/auth/me` now read `role.permissions` (a JSONB string[] in the DB) and return it both inside the JWT (so backend gates can see it) and in the user payload (so frontend gates can see it). Old logged-in sessions need to log out + log in to pick up the new shape.
- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts), [customers.ts](backend/src/routes/customers.ts), [sections.ts](backend/src/routes/sections.ts)** — six write routes in projects, four in customers, two in sections all swapped from `requireRole("TAM", "ADMIN")` to `requirePermission("project:write")`. Now any role with `project:write` (or `*`) can mutate, regardless of role name.
- **[backend/src/routes/labels.ts](backend/src/routes/labels.ts), [tasks.ts](backend/src/routes/tasks.ts)** — label and task write routes use `requirePermission("task:write")` instead of `requireRole("TAM", "ADMIN")`.
- **[backend/src/routes/services.ts](backend/src/routes/services.ts)** — kept as `requireRole("ADMIN")` (services catalogue stays admin-only by name).
- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — kept under `requireAdmin` (the entire `/admin` tree stays role-name-gated; only the literal ADMIN role manages users/roles).
- **Visibility filter (`projectVisibilityFilter` in projects.ts and `projectScope` in overview.ts)** — added an early check: any user with `*` permission sees all projects (so DIRECTOR/MANAGER-style custom roles with full perms work like ADMIN). Without `*`, the existing role-name switch handles built-ins (TAM sees own as TAM, SA sees own as SA, STAKEHOLDER sees all). The default branch (custom roles without `*`) now returns `{ OR: [{ tamId: user.sub }, { saId: user.sub }] }` so they at least see projects they're directly assigned to.
- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — `AuthUser.permissions: string[]` added. New `hasPermission(user, perm)` helper, defensive against stale localStorage users that pre-date the permissions field.
- **Frontend gate swaps (8 files)** — [Projects.tsx](frontend/src/pages/Projects.tsx), [Customers.tsx](frontend/src/pages/Customers.tsx), [CustomerDetail.tsx](frontend/src/pages/CustomerDetail.tsx), [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx) → `hasPermission(user, "project:write")`. [ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx), [ProjectTimeline.tsx](frontend/src/pages/views/ProjectTimeline.tsx), [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx) → `hasPermission(user, "task:write")`. The Sidebar admin nav gate, the SA/TAM dropdown filters in `ProjectFormModal`, and the Admin-page reassign-TAM filter remain role-name checks (those are structural — only literal SA/TAM-role users can be assigned to those columns; admin-only nav stays admin-only).
- **End result:** the four built-in roles still work as before (their seed permissions match the old behavior). Custom roles created in Admin > Roles now actually grant access matching their permissions list — a DIRECTOR or MANAGER with `*` works like ADMIN for everything except the admin-only routes; a custom role with just `project:write` can create/edit projects but not tasks; etc. **Existing logged-in users must log out and log back in** to get a fresh JWT with permissions.

### Fixed — 2026-05-02 — Vite dev proxy target is configurable for dockerised dev

- **[frontend/vite.config.ts](frontend/vite.config.ts)** — `server.proxy["/api"].target` now reads from `process.env.VITE_API_PROXY_TARGET`, defaulting to `http://localhost:3000` (native dev). When Vite runs *inside* the frontend container of a docker-compose dev stack, "localhost" resolves to the container itself (no backend listening), which surfaced as `Request failed with status 404` on login. Setting `VITE_API_PROXY_TARGET=http://backend:3000` in the frontend container's env makes the proxy forward to the backend container via the docker network. Native-dev workflow is unchanged because the default still works without setting anything.

### Added — 2026-05-02 — Admin can create custom roles (RoleName enum → free-text + CRUD)

- **Schema migration** — [backend/prisma/migrations/20260502140000_dynamic_roles/migration.sql](backend/prisma/migrations/20260502140000_dynamic_roles/migration.sql) converts `roles.role_name` from the `RoleName` Postgres enum to plain `TEXT` and drops the enum type. The four built-in role rows (ADMIN, SA, TAM, STAKEHOLDER) are preserved as text values, so no data loss. Migration is idempotent under `prisma migrate deploy`. **Why:** the old enum locked the role set to those four at schema-time; admins can now create custom roles at runtime.
- **[backend/prisma/schema.prisma](backend/prisma/schema.prisma)** — dropped the `RoleName` enum block; `Role.roleName` is now `String @unique`.
- **[backend/src/http/auth.ts](backend/src/http/auth.ts)** — `JwtPayload.role` is `string` instead of `RoleName`. JWT verifier no longer checks `role in RoleName` (just non-empty string). `requireRole(...roles: string[])` keeps working — string compare. `requireAdmin` keeps working (compares `role === "ADMIN"`).
- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — new endpoints under `/admin/roles`:
  - `GET /admin/roles` — list with `{ id, roleName, permissions, userCount, builtIn }`.
  - `POST /admin/roles` — create with `{ roleName, permissions: string[] }`. roleName must match `^[A-Z0-9_]+$` and not collide with built-ins.
  - `PATCH /admin/roles/:id` — update permissions only (name is immutable). Refuses to touch ADMIN (always full access).
  - `DELETE /admin/roles/:id` — refuses built-ins and any role with users still attached.
  - `createUserSchema` and `updateRoleSchema` switched from `z.nativeEnum(RoleName)` to `z.string().min(1).max(50)` and validate against the Role table at runtime.
- **[backend/src/routes/projects.ts](backend/src/routes/projects.ts), [backend/src/routes/overview.ts](backend/src/routes/overview.ts)** — `projectVisibilityFilter` and `projectScope` switches added a `default:` case returning `{ id: { in: [] } }` (no rows match) for custom roles. Built-in roles still get their existing visibility behavior. **Custom roles default to no project visibility**; admin grants access by assigning users as TAM/SA on specific projects.
- **[backend/prisma/seed.ts](backend/prisma/seed.ts)** — `Record<RoleName, string[]>` → `Record<string, string[]>`. Still upserts the four built-in roles on every container start (idempotent).
- **[frontend/src/lib/auth.tsx](frontend/src/lib/auth.tsx)** — `Role` type changed from `"SA" | "TAM" | "ADMIN" | "STAKEHOLDER"` to `string`. New `BUILTIN_ROLES` constant for code that needs to differentiate.
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — new `AdminRole` interface and four hooks: `useAdminRoles`, `useAdminCreateRole`, `useAdminUpdateRolePermissions`, `useAdminDeleteRole`. `adminQueryKeys.roles` added.
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — new "Roles" tab between Users and Project Override. Lists all roles with built-in badge and user count. Form to create role (name uppercased automatically, permissions as comma-separated input). Edit perms inline (disabled for ADMIN). Delete (disabled for built-ins or in-use roles). The Users tab's Add User form and the per-row role dropdown now read the role list dynamically via `useAdminRoles` instead of the previous hardcoded `ROLE_OPTIONS` constant — custom roles appear immediately.
- **Built-in protections** (enforced both in backend and visually in UI):
  - ADMIN, SA, TAM, STAKEHOLDER cannot be deleted or renamed.
  - ADMIN's permissions are always `["*"]` (PATCH refused).
  - Cannot delete a role that still has users attached.
  - Custom role names must match `^[A-Z0-9_]+$`.

### Changed — 2026-05-02 — Same-origin /api proxy (Cloudflare Tunnel / TLS-friendly)

- **[frontend/nginx.conf](frontend/nginx.conf)** — added a `location /api/ { proxy_pass http://backend:3000/; ... }` block (placed before the SPA fallback so it matches first). Forwards `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` headers; sets `proxy_http_version 1.1` and `client_max_body_size 1m` to match Express's `json({ limit: "1mb" })`. The trailing slash on `proxy_pass` strips the `/api` prefix so `/api/auth/login` → `http://backend:3000/auth/login` (backend routes don't have an `/api` prefix per CLAUDE.md). nginx is now the same-origin gateway: the browser only ever talks to whatever hostname serves the page.
- **[frontend/src/lib/api.ts](frontend/src/lib/api.ts)** — `BASE_URL` is now the literal string `"/api"`. Replaces the previous `${protocol}//${hostname}:3000` runtime computation. **Why:** the runtime-URL trick worked for direct LAN access but broke under any reverse proxy (Cloudflare Tunnel, future TLS terminator, k8s ingress) because port 3000 isn't exposed at the proxy edge AND mixed HTTPS-page → HTTP-backend is browser-blocked. Relative `/api` paths inherit `window.location.origin` and `window.location.protocol` automatically — works on `https://solvro-dev.bapi.my.id`, `http://10.10.1.10`, `http://localhost`, anywhere.
- **[frontend/vite.config.ts](frontend/vite.config.ts)** — added `server.proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } }`. Mirrors the nginx behaviour for the dev workflow (`npm run dev` on :5173 forwards `/api/*` to the host-side backend on :3000). Without this, the new `BASE_URL = "/api"` would 404 in dev because Vite has no backend behind `/api`.
- **No backend changes.** Routers stay mounted at `/auth`, `/projects`, etc. — the proxy strips `/api` before forwarding.
- **No setup.sh / docker-compose changes.** The compose file keeps the backend's `:3000` host port mapping (harmless leftover for LAN debugging; not used by the proxy path which goes container-to-container over the docker network).
- **Followups deferred:** (1) tighten `CORS_ORIGIN` from `*` to `https://solvro-dev.bapi.my.id` (now redundant for production since same-origin requests skip CORS preflight, but cleaner); (2) optionally drop the `:3000` host port mapping for tighter LAN attack surface; (3) add `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` to the nginx `/api/` block if/when the app adds WebSockets or SSE.

### Added — 2026-05-02 — Admin can create new users from the Admin → Users tab

- **[backend/src/routes/admin.ts](backend/src/routes/admin.ts)** — new `POST /admin/users` endpoint. Body: `{ email, username, password, role }`. Validates with Zod (email format, username 1–50 chars, password 8–200 chars, role from RoleName enum), rejects duplicate emails with 409, hashes the password with bcrypt, creates the user with the requested role. Returns the created user in the same shape `GET /admin/users` returns (so the frontend can drop it into the existing list cache).
- **[frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)** — new `useAdminCreateUser()` mutation hook. Invalidates both `adminQueryKeys.users` (admin user list) and `queryKeys.users` (the global lookup list used by assignee dropdowns) on success so the new user appears everywhere immediately.
- **[frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)** — added an "Add user" form at the top of the Users tab. Inputs: email, username, password, role (defaults to TAM). Submit button disables until all fields are filled and the password meets the 8-char minimum. Uses the same form layout pattern as the Service Catalogue's add-service form for visual consistency.

### Removed — 2026-05-02 — Untrack design/product docs from the repo

- **UI Design/, PRD.md, DESIGN.md, .env.example** — `git rm --cached` and added to [.gitignore](.gitignore). Local copies preserved on the maintainer's machine; just no longer tracked. **Why:** these are design/reference assets, not deploy artifacts. The repo is now closer to "just what's needed to build and ship the app." Anyone who actually deploys the app uses `bash <(curl ...setup.sh)` and never browses the file tree, so the trimming is purely cosmetic — but it keeps the repo focused.

### Fixed — 2026-05-02 — Runtime image now ships `scripts/create-admin.ts`

- **[backend/Dockerfile](backend/Dockerfile)** — added `COPY scripts ./scripts` to the runtime stage. Without it, `docker compose exec backend npx tsx scripts/create-admin.ts` (run by setup.sh after the backend is healthy) failed with `ERR_MODULE_NOT_FOUND` because the runtime image only had `prisma/` and `dist/`. The dev stage was unaffected (it does a full `COPY . .` for hot reload).

### Fixed — 2026-05-02 — Backend image's `dist/index.js` was at the wrong path (longstanding latent bug)

- **[backend/tsconfig.json](backend/tsconfig.json)** — `rootDir` changed from `"."` to `"src"`, and `include` reduced from `["prisma/**/*.ts", "src/**/*.ts"]` to `["src/**/*.ts"]`. **Why:** with the previous config, tsc preserved the project structure when emitting and produced `dist/src/index.js` + `dist/prisma/seed.js`. The Dockerfile's runtime `CMD ["node", "dist/index.js"]` looked at the wrong path — there was never a `dist/index.js` at the top of `dist/`. The container died at startup with `Error: Cannot find module '/app/dist/index.js'`. Earlier deploys never noticed because the backend was crashing earlier in its startup chain (P1000 from postgres password mismatch) before it ever reached `node dist/index.js`. Once setup.sh fixed the postgres state, this latent bug surfaced. After the fix, `npm run build` emits `dist/index.js` directly. **`prisma/seed.ts` and `scripts/create-admin.ts` are unaffected** — both run via `tsx` (which interprets TypeScript at runtime) and don't need to be in tsc's compile set.

### Changed — 2026-05-02 — setup.sh accepts env vars; docker-compose.yml untracked

- **[setup.sh](setup.sh)** — extended input handling: if `ADMIN_EMAIL` and/or `ADMIN_PASSWORD` are present in the environment, those are used directly and the prompt is skipped. If either is empty, the script falls back to `read ... </dev/tty` for an interactive prompt (so it still works behind `curl | bash`). If neither path is available (no env vars AND no `/dev/tty`), it errors out with the env-var invocation example. **Why:** the pure `/dev/tty` approach was inconsistent across some shells / SSH terminal setups and a user kept hitting "invalid email" because `read` returned empty without ever showing a prompt. The env-var path is a deterministic escape hatch:
  ```
  ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret bash <(curl -sSL <url>)
  ```
  README/docs should recommend `bash <(curl -sSL ...)` over `curl ... | bash` because the former leaves stdin attached to the terminal so the interactive prompts work without the `/dev/tty` dance.

### Removed — 2026-05-02 — docker-compose.yml no longer tracked in the repo

- **docker-compose.yml** — `git rm --cached` and added to [.gitignore](.gitignore). The canonical compose definition now lives **inside [setup.sh](setup.sh)** as a heredoc; tracking a separate copy in the repo was duplicated information that could drift from the script. Local overrides (`docker-compose.override.yml`) were already gitignored. Anyone who wants to inspect the compose file looks at the heredoc inside setup.sh, or grabs the rendered file from a deployed server at `~/solvro/docker-compose.yml` (which setup.sh writes there).

### Fixed — 2026-05-02 — setup.sh prompts now work under `curl | bash`

- **[setup.sh](setup.sh)** — all `read` calls now redirect from `/dev/tty` instead of stdin (`read ... </dev/tty`). When the script is invoked via `curl -sSL .../setup.sh | bash`, the script's stdin is the curl pipe, not the terminal — so the previous `read -p "Admin email: "` immediately returned empty and failed validation with `invalid email.`. Reading from `/dev/tty` bypasses stdin entirely and reaches the user's terminal directly. Added a guard at the top that prints a fallback instruction (`curl ... -o setup.sh && bash setup.sh`) if `/dev/tty` is also unavailable (rare — happens in some unattended/CI shells).

### Changed — 2026-05-02 — Per-deployment admin via setup.sh; demo seed users removed

- **[setup.sh](setup.sh)** — NEW. The one-shot deploy script. Pasted onto a fresh Ubuntu server (with Docker + Docker Compose installed), it prompts for an admin email and password, generates random `POSTGRES_PASSWORD` and `JWT_SECRET` via `openssl`, writes `~/solvro/.env` (`chmod 600`) and `~/solvro/docker-compose.yml`, wipes any prior `solvro_pgdata` volume to clear stale postgres state, brings the stack up, polls `/health` until ready, then runs the new `create-admin.ts` script to create the admin user. **Idempotent**: re-running on a server that already has `~/solvro/.env` skips prompts and just does `docker compose pull && up -d` — that's the update flow. Distributes via terminal paste — no scp, no git clone, no PAT required.
- **[backend/prisma/seed.ts](backend/prisma/seed.ts)** — stripped the `SEED_USERS` array and user-upsert loop. Seed now only upserts the four roles (ADMIN, SA, TAM, STAKEHOLDER). **Why:** users are tenant-specific and don't belong in a shared seed; a shared `admin@solvro.local` / `password123` was a security smell for "anyone can deploy this." Roles stay because RBAC checks (`requireRole`) reference them structurally.
- **backend/scripts/create-admin.ts** — NEW. Reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `process.env`, validates email format and 8-char password minimum, finds the ADMIN role, upserts the user. Idempotent — re-running with the same email updates the password (acts as the password reset flow until a proper one exists). Called by setup.sh via `docker compose exec`.
- **backend/scripts/create-temp-admin.ts** — DELETED. Replaced by `create-admin.ts` (which takes credentials via env vars instead of hardcoding them).
- **[backend/package.json](backend/package.json)** — renamed script `dev:admin` → `admin:create` (now `tsx scripts/create-admin.ts`). The `db:seed` script is unchanged but now creates only roles.
- **[docker-compose.yml](docker-compose.yml)** — removed the demo defaults for `POSTGRES_PASSWORD` and `JWT_SECRET`. They're now required env vars sourced from a sibling `.env` file (which setup.sh writes). The header comment tells anyone reading the file directly to use setup.sh instead of `docker compose up`. `CORS_ORIGIN: "*"`, `IMAGE_OWNER` hardcoded as `alfi-rajasyah`, and the auto-seed command line are unchanged.

**Recovery for the existing 10.10.1.10 server (chronic P1000):** SSH in, paste setup.sh, answer the two prompts. The script's wipe-then-init step replaces the corrupt postgres volume cleanly.

### Changed — 2026-05-02 — Plug-and-play single-file deployment

- **[docker-compose.yml](docker-compose.yml)** — every value is now hardcoded (no `.env` required). `IMAGE_OWNER` baked to `alfi-rajasyah`, `IMAGE_TAG` baked to `latest`, `POSTGRES_PASSWORD`/`JWT_SECRET` set to demo defaults documented in a banner comment, `CORS_ORIGIN: "*"`. Backend command extended to run `npx prisma db seed` between `migrate deploy` and `node dist/index.js`, so the admin user (`admin@solvro.local` / `password123`) exists on first boot. The seed in [backend/prisma/seed.ts](backend/prisma/seed.ts) is idempotent (uses `upsert`) so this is safe to re-run on every container start. **Why:** "anyone can `docker compose up -d` and the app works" was the actual goal; the multi-file `.env` setup kept producing avoidable config errors (P1000 password mismatches, CORS misconfigs). **Trade-off:** the demo secrets are public — this file is for private-LAN demos, not internet-facing production. The banner says so.
- **[backend/src/app.ts](backend/src/app.ts)** — `CORS_ORIGIN=*` is now interpreted as "allow all origins" (passed to the cors package as `origin: true`). Other values still work as before (comma-separated allowlist).
- **[backend/package.json](backend/package.json)** — moved `tsx` from `devDependencies` to `dependencies`. Production image runs `npm ci --omit=dev`; the seed script (`tsx prisma/seed.ts`) needs `tsx` at runtime.
- **[.gitignore](.gitignore)** — added `CLAUDE.md` and `.claude/` so Claude Code working files stay local. Existing tracked copies were untracked with `git rm --cached` (local files preserved).

### Changed — 2026-05-02 — Single compose file (prod-shaped); dev-in-Docker workflow removed

- **[docker-compose.yml](docker-compose.yml)** — replaced the previous dev-shaped file with the prod content (pulls images from GHCR, runs `prisma migrate deploy` on backend startup, exposes nginx on `:80`). Added one line vs. the previous prod file: `ports: - "${POSTGRES_PORT:-5432}:5432"` on postgres so the host-side dev workflow (`npm run dev` natively) can still connect. **Why:** two compose files (`docker-compose.yml` + `docker-compose.prod.yml`) forced everyone — humans and the docs — to remember which file to use where; one file with one shape is simpler. **Trade-off:** running the entire stack in Docker on a laptop with hot reload is no longer a one-liner; dev now means "Postgres in Docker, backend/frontend native via `npm run dev`." Anyone who needs full-stack-in-Docker for testing can `docker compose up` after setting `IMAGE_OWNER`/`IMAGE_TAG` in `.env` (pulls the published GHCR images), or reintroduce a `docker-compose.override.yml` later.
- **docker-compose.prod.yml** — deleted; merged into `docker-compose.yml`.
- **[CLAUDE.md](CLAUDE.md)** — updated the "Common commands" intro and the production-deployment paragraph in "Repository status" to reflect the single-file layout. The dev recipe is now `docker compose up -d postgres` + native `npm run dev`. The prior `docker compose up` one-liner that started everything dockerized has been removed because it would now try to pull from GHCR and fail without `IMAGE_OWNER` set — the new doc calls that out explicitly.
- **[.env.example](.env.example)** — rewrote the "Server-side" header to describe the GHCR image selectors (`IMAGE_OWNER`, `IMAGE_TAG`) as the variables `docker-compose.yml` reads when running the full stack, instead of as `docker-compose.prod.yml`-specific settings.
- **Server impact (manual step required, no push needed):** the compose file is local to each server, not baked into any image and not subject to the CI/GHCR cycle. To migrate an existing server, SSH in and run `mv ~/docker-compose.prod.yml ~/docker-compose.yml`. After that, `docker compose up -d` (no `-f` flag) is the canonical command.

### Changed — 2026-05-02 — Frontend API URL is now runtime-derived; `VITE_API_BASE_URL` removed

- **[frontend/src/lib/api.ts](frontend/src/lib/api.ts)** — `BASE_URL` is now computed at module load from `window.location` as `${protocol}//${hostname}:3000`, with a fallback to `http://localhost:3000` for SSR/test contexts where `window` is undefined. Previously read `import.meta.env.VITE_API_BASE_URL`, which baked the backend URL into the bundle at build time. **Why:** the deployed frontend now works on any host (LAN IP, Tailscale IP, public DNS, localhost) without rebuilding — the previous setup required republishing the GHCR image whenever the access URL changed (e.g. moving from `10.10.1.10` LAN to `100.96.187.78` Tailscale broke API calls). **Constraint introduced:** the backend must always be reachable on port 3000 of whatever host serves the frontend; if you ever put a reverse proxy in front that terminates the backend on a different port or path, this file needs to change again.
- **[frontend/Dockerfile](frontend/Dockerfile)** — removed `ARG VITE_API_BASE_URL` and `ENV VITE_API_BASE_URL=...` from the `build` stage; nothing consumes them anymore.
- **[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)** — removed the `build_args` matrix field and the `build-args` input on `docker/build-push-action`. The repo-level Actions variable `VITE_API_BASE_URL` is now unused — safe to delete from `https://github.com/<owner>/<repo>/settings/variables/actions` but leaving it costs nothing.
- **[docker-compose.yml](docker-compose.yml)** — removed the `VITE_API_BASE_URL` environment block from the dev `frontend` service. Vite dev server still works because the runtime computation gives `http://localhost:3000` when the page is on `localhost:5173`.
- **[.env.example](.env.example)** — removed the `VITE_API_BASE_URL=http://localhost:3000` line; replaced with a comment explaining the new runtime-derivation approach.
- **frontend/.env.example** — deleted; the file held only `VITE_API_BASE_URL` and is now empty of meaningful content. The frontend has no env vars.
- **[CLAUDE.md](CLAUDE.md)** — updated the "API layer" bullet under Frontend conventions to describe runtime URL derivation and call out the port-3000 constraint.

### Changed — 2026-05-02 — CLAUDE.md accuracy + coverage pass

- **[CLAUDE.md](CLAUDE.md)** — fixed `npm run typecheck` documentation (actual script is `tsc --noEmit`, not `tsc -b --noEmit`). Added a production-deployment paragraph in "Repository status" describing [docker-compose.prod.yml](docker-compose.prod.yml), the GHCR images published by [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml), the nginx-served frontend in prod, and the prod env contract — future Claudes touching env/Docker need this. Added a routes-inventory bullet to "Backend conventions" naming all twelve route files (incl. the previously undocumented `services.ts`) and a `prisma migrate dev --name <slug>` warning (it hangs without `--name` in non-interactive shells). Expanded the "Frontend conventions" routing bullet to enumerate all shipped pages (Customer is a first-class entity; Admin uses a separate `AdminGuard`). Added bullets for [frontend/src/lib/theme.tsx](frontend/src/lib/theme.tsx) (runtime theme provider) and the hand-rolled Gantt implementation in [frontend/src/components/gantt/](frontend/src/components/gantt/) — explicit drift from PRD §6's `gantt-task-react` claim, called out so a future Claude doesn't `npm install` the wrong library.

### Added — 2026-05-02 — Production Docker images, GHCR publish workflow, and server-side compose

- **Backend Dockerfile** ([backend/Dockerfile](backend/Dockerfile)) rewritten as a 4-stage build (`deps` / `dev` / `build` / `runtime`). The `dev` stage preserves today's `npm run dev` watch workflow (used by [docker-compose.yml](docker-compose.yml) via `target: dev`); the default last stage `runtime` produces a deployable image that runs `node dist/index.js` with prod-only `node_modules` (`npm ci --omit=dev`) plus the generated Prisma client and the compiled `dist/`. Final image ≈ 200–250 MB.
- **Frontend Dockerfile** ([frontend/Dockerfile](frontend/Dockerfile)) rewritten as a 4-stage build. The `dev` stage runs `vite --host 0.0.0.0`; the `runtime` stage is `nginx:1.27-alpine` serving the Vite-built `dist/`. `VITE_API_BASE_URL` is wired as a `--build-arg` because Vite inlines `import.meta.env.*` at build time.
- **frontend/nginx.conf** ([frontend/nginx.conf](frontend/nginx.conf)) — SPA fallback (`try_files ... /index.html`) so React Router deep links survive a refresh, long-cache headers for hashed `/assets/`, no-store on `index.html`, and gzip for text mimetypes.
- **GitHub Actions workflow** ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)) — builds backend + frontend in parallel via a matrix and pushes to GHCR (`ghcr.io/<owner>/solvro-{backend,frontend}`) on push to `main`, on `v*` tags, and on manual dispatch. Tags include `sha-<short>`, branch name, version, and `latest` (main only). Uses GitHub Actions cache (`type=gha`, scoped per service) so subsequent builds reuse layers. Reads `vars.VITE_API_BASE_URL` (a repo-level Actions variable) for the frontend build arg — set this to the server's public API URL before the first push.
- **docker-compose.prod.yml** ([docker-compose.prod.yml](docker-compose.prod.yml)) — server-side compose. No `build:` blocks; only `image:` references to GHCR with `pull_policy: always`. The backend container runs `npx prisma migrate deploy && node dist/index.js` so schema migrations apply automatically on first boot and on each upgrade. Frontend is exposed on `:80`. `IMAGE_OWNER` and `IMAGE_TAG` come from the host's `.env`. Designed to be the only compose file shipped to the server (no need to clone the repo there).
- **.env.example** ([.env.example](.env.example)) — appended a `Server-side (docker-compose.prod.yml)` section with `IMAGE_OWNER` and `IMAGE_TAG`. The dev compose ignores these vars; the prod compose requires them.

### Changed — 2026-05-02 — Compose dev target pin + ignore-file hygiene

- **[docker-compose.yml](docker-compose.yml)** — `backend` and `frontend` services now use `build: { context, target: dev }` instead of `build: ./backend`. Without this, a default `docker build ./backend` outside compose would still produce the dev container; pinning `target: dev` here makes the intent explicit and lets CI / GHCR workflows pick up the default last stage (`runtime`) for production.
- **[backend/.dockerignore](backend/.dockerignore), [frontend/.dockerignore](frontend/.dockerignore)** — tightened to exclude `dist`, `*.tsbuildinfo`, `.vite`, `coverage`, IDE folders, and the repo's `README.md` / `CHANGELOG.md`. Keeps the build context small and prevents stale local artifacts from sneaking into the image.
- **[.gitignore](.gitignore)** — added explicit `backend/dist/` and `frontend/dist/` paths (the existing root-anchored `dist/` doesn't recurse), plus `*.tsbuildinfo`, `.vite/`, and `docker-compose.override.yml`. Some build artifacts (`frontend/tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`) currently exist on disk and will be excluded from the first commit.

### Changed — 2026-05-02 — Customer field renames + clickable detail page with placeholder resource tabs

- **Schema** ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)) — Customer model rewritten:
  - Dropped: `industry`, `website`.
  - Renamed: `contactName` → `accountManager`, `contactEmail` → `solutionArchitect`, `notes` → `description`.
  - `description` is now NOT NULL (was nullable).
  - Per user direction, AM and SA stay as plain text strings — a structured Roles model + User FKs will land in a later turn.
- **Migration** ([backend/prisma/migrations/20260502123923_rename_customer_fields_drop_extras/migration.sql](backend/prisma/migrations/20260502123923_rename_customer_fields_drop_extras/migration.sql)) — **hand-written** because Prisma's auto-generated migration uses DROP+ADD for renames, which would null out existing data. The hand-written SQL uses `ALTER TABLE ... RENAME COLUMN` so all existing values for the three renamed fields are preserved. Backfills `description = ''` for any pre-existing NULL rows before adding the NOT NULL constraint. **Action required**: the sandbox blocked Claude from running `prisma migrate deploy`; the user must run it: `cd backend && DATABASE_URL='...' npx prisma migrate deploy && docker compose exec backend npx prisma generate && docker compose restart backend`. Without this, the customer endpoints will error at runtime even though `tsc` passes (host-side `prisma generate` was run for type-checking purposes).
- **Backend** ([backend/src/routes/customers.ts](backend/src/routes/customers.ts)) — `createCustomerSchema` and `updateCustomerSchema` rewritten with the new field names; `description` validated as `min(1).max(5000)` (required); AM/SA validated as `max(200).optional()`. Email format validation removed from SA since it's now a plain text name. POST/PATCH handlers updated to write the four new columns. Role gates unchanged.
- **Frontend types** ([frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)) — `CustomerSummary`, `CustomerDetail` (extends Summary), and `CustomerInput` updated to the new field shape; `description: string` (not nullable).
- **Modal** ([frontend/src/components/CustomerFormModal.tsx](frontend/src/components/CustomerFormModal.tsx)) — 4-field rewrite: Name (required) / Account Manager (text, optional) / Solution Architect (text, optional) / Description (textarea, required, ~5 rows). Client-side block on submit if either Name or Description is empty/whitespace.
- **List page** ([frontend/src/pages/Customers.tsx](frontend/src/pages/Customers.tsx)) — each card is now a `<Link to="/customers/:id">`. The Edit/Delete buttons stop event propagation so they don't trigger card navigation. Card body shows the 2-letter avatar, name, AM line ("AM: Alice Chen"), SA line, description excerpt, and project count link. Removed the industry badge and the external website link. Inline `EmptyState` extracted into a shared component.
- **New detail page** ([frontend/src/pages/CustomerDetail.tsx](frontend/src/pages/CustomerDetail.tsx)) at `/customers/:id`:
  - Header: back link to `/customers`, customer name, AM/SA + project count summary line, full description (whitespace-pre-line preserved). TAM/ADMIN see Edit/Delete buttons in the header.
  - Tabs (using the new shared `Tabs` primitive): **Overview** / **Topology** / **Documents** / **Organization Structure**.
  - Overview lists the customer's projects in a table with Project / Status / TAM / SA / Tasks columns, each row linking to `/projects/:id`. Empty state shown when no projects.
  - Topology / Documents / Organization Structure are placeholder tabs per user direction — each renders a styled `EmptyState` with an icon and a short "coming soon" message. Pages are accessible immediately even though there's no data model yet.
  - Edit button opens the same `CustomerFormModal` already used by the list. Delete uses `useDeleteCustomer`, navigates back to `/customers` on success.
- **New shared components**:
  - [frontend/src/components/Tabs.tsx](frontend/src/components/Tabs.tsx) — generic underline tab nav (`<Tabs items={[{key,label}]} active onChange />`). Extracted from the inline `TabButton` in `Admin.tsx` so it can be reused by the customer detail page (and any future tabbed surface).
  - [frontend/src/components/EmptyState.tsx](frontend/src/components/EmptyState.tsx) — generic empty state with icon, optional title, message, and optional action slot. Extracted from the inline `EmptyState` in `Customers.tsx`. Used by Customers list, CustomerDetail's three placeholder tabs, and CustomerDetail's Overview empty state.
- **Refactor** ([frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx)) — replaced the inline `TabButton` definition with the new shared `<Tabs>` primitive. Behavior identical.
- **Routing** ([frontend/src/App.tsx](frontend/src/App.tsx)) — new `<Route path="customers/:id" element={<CustomerDetail />} />` as a sibling of the existing `/customers` route, both inside the authed `Shell` block.
- **Project form** ([frontend/src/components/ProjectFormModal.tsx](frontend/src/components/ProjectFormModal.tsx)) — customer dropdown's secondary label changed from `· {industry}` (now removed from schema) to `· AM {accountManager}` so the AM is visible during project creation.
- **Verification**: `cd backend && npm run build` exits 0; `cd frontend && npm run typecheck` exits 0. End-to-end verification waits on the user-applied migration.
- **Out of scope this turn (flagged for follow-up)**:
  - Real Topology / Documents / Org Structure data models.
  - Roles model + User FKs replacing the AM/SA text fields.
  - Search / filter on the Customers list.

### Added — 2026-05-02 — Project Baseline: lock snapshot + per-task baseline date overrides

- **Schema**: new migration `20260502051432_add_project_baseline` ([backend/prisma/migrations/](backend/prisma/migrations/)) adding:
  - `Task.baselineStartDate DateTime?` and `Task.baselineDueDate DateTime?` — per-task snapshot of the locked schedule.
  - `Project.baselineLockedAt DateTime?` and `Project.baselineLockedById Int?` (FK to `User`) with relation `ProjectBaselineLockedBy` — single canonical anchor for "this project has a baseline locked at T by user U". A project-level flag was preferred over inferring from task data so the toolbar button state is one boolean check and survives manual edits that null individual task baselines.
- **Backend endpoint** ([backend/src/routes/projects.ts](backend/src/routes/projects.ts)): `POST /projects/:id/baseline` (gated by `requireRole("TAM", "ADMIN")`) — copies every task's live `start_date` / `due_date` into `baseline_*` columns via raw SQL inside a `prisma.$transaction` (Prisma's `updateMany` can't do column-to-column copies), then stamps `Project.baselineLockedAt = now()` and `baselineLockedById = req.user.sub`. Idempotent — same endpoint serves first-time lock and reset; the frontend distinguishes the two by reading `baselineLockedAt`. Returns the updated project including `baselineLockedBy: { id, username }` for tooltip rendering.
- **Backend manual edits** ([backend/src/routes/tasks.ts](backend/src/routes/tasks.ts)): extended `updateTaskSchema` with `baselineStartDate` and `baselineDueDate` (both `z.coerce.date().nullable().optional()`). No new endpoint — `PATCH /tasks/:id` already spreads the validated body into `prisma.task.update`. Permission gate unchanged.
- **`GET /projects/:id`** now `include`s `baselineLockedBy: { select: { id, username } }`.
- **Frontend types** ([frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)):
  - `Task` extended with `baselineStartDate / baselineDueDate: string | null`.
  - `ProjectSummary` + `ProjectDetail` extended with `baselineLockedAt / baselineLockedById`; `ProjectDetail` adds `baselineLockedBy: { id, username } | null`.
  - `UpdateTaskInput` accepts the two new baseline fields (flow through the existing `useUpdateTask` optimistic mutation untouched).
  - New `useLockBaseline(projectId)` mutation — POSTs the empty body, on success invalidates `queryKeys.project(id)`, `queryKeys.projectTasks(id)`, and `["projects"]` so toolbar restyles and any future ghost-bar visualization picks up fresh baselines.
- **New** [frontend/src/components/ConfirmModal.tsx](frontend/src/components/ConfirmModal.tsx) — small reusable wrapper over the existing [Modal.tsx](frontend/src/components/Modal.tsx). Props: `open / onClose / onConfirm / title / body / confirmLabel / confirmTone: "primary" | "warning" / busy`. Built on top of the existing modal so styling stays consistent and avoids `window.confirm()`'s jarring native dialog. Likely future reuse for delete confirmations.
- **Toolbar button** ([frontend/src/components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)):
  - New props `baselineLockedAt: string | null` and `baselineLockedBy: { id, username } | null` passed from [ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx) (which already had `project` in scope from `useProjectContext()`).
  - Two button states (canEdit-only block, after the "Section" button):
    - No baseline: **"Lock Baseline"** with `bookmark_add` icon, primary fill (`bg-primary text-on-primary border border-primary`) — stands out per the spec.
    - Baseline exists: **"Reset Baseline"** with `bookmark` icon, muted style (`border border-gray-300 text-on-surface-variant`) — less prominent so the user knows it overwrites. `title` attribute shows `"Baseline locked <timestamp> by <username>"`.
  - Click → `ConfirmModal`. First-lock copy is informational + primary tone; reset copy is a warning tone (amber) with explicit "previous snapshot will be replaced ... cannot be undone" language.
- **Per-task baseline edits** ([frontend/src/components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)): new "Baseline Dates" section in the right sidebar (edit mode only — create mode has no live dates yet, baseline makes no sense). Visually distinguished as a dashed-border block with a `bookmark` icon and a small footnote: "Override only if project scope officially changes — does not affect the live schedule." Two `<input type="date">` fields wired to local state and flowed through the same `useUpdateTask` patch as the live dates.
- **Container hygiene**: ran `docker compose exec backend npx prisma generate && docker compose restart backend` after the migration so the running container picks up both the regenerated client and the new `/projects/:id/baseline` route. Verified with `curl -X POST http://localhost:3000/projects/2/baseline` → 401 (route mounted, unauth as expected). Without these two commands the route would 404 because `node_modules` is a separate Docker named volume from the source mount.
- **Verification**: `cd backend && npm run build` exits 0; `cd frontend && npm run typecheck` exits 0. End-to-end (manual): log in as `tam.charlie@solvro.local` / `password123`, open `/projects/2/gantt` → primary "Lock Baseline" button visible → click → confirm modal → confirm → button switches to muted "Reset Baseline" with the lock-timestamp tooltip → open any task → "Baseline Dates" section shows snapshotted values → edit and save → values persist on reopen → "Reset Baseline" → amber warning modal → confirm → snapshot refreshed.
- **Follow-on — Reset feedback toast, "as-of date" picker, and "Clear baseline" action**: the user reported "Reset baseline still not working" — root cause was UX, not a bug: when live == baseline, `useLockBaseline` re-snapshots silently and the ghost stays hidden (because there's no diff), so the user sees nothing change. Fixes:
  - **Visible success feedback**: emerald pill toast at the bottom of the viewport ("Baseline locked as of 2026-05-02" / "Baseline overwritten — now anchored to ..." / "Baseline cleared"), auto-dismisses after 4s. Lives at `z-[110]` so it floats above the modal layer.
  - **Backend** ([backend/src/routes/projects.ts](backend/src/routes/projects.ts)): `POST /projects/:id/baseline` now accepts an optional body `{ asOfDate?: ISO date, clear?: boolean }`. Validated via new `lockBaselineSchema`. When `asOfDate` is provided, it's used as `Project.baselineLockedAt` instead of `new Date()` — lets a TAM backdate or anchor to a milestone date. When `clear: true`, both `Project.baselineLockedAt` / `baselineLockedById` are NULLed and every task's `baseline_start_date` / `baseline_due_date` are reset to NULL — actually removes the snapshot. Clear and lock are mutually exclusive paths inside the existing `$transaction`.
  - **Frontend** ([frontend/src/lib/queries.ts](frontend/src/lib/queries.ts)): `useLockBaseline` now takes `LockBaselineInput { asOfDate?, clear? }` and posts it as the body. Default-empty input still works (calls with `()` legal).
  - **Confirm modal redesign** ([GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx)): inside the `ConfirmModal` body — date input labelled "Baseline as-of date" defaulting to today, with explanatory help text ("Defaults to today. Use a different date to backdate the snapshot — e.g. 'May 1 baseline'."). When a baseline already exists, a small destructive "Clear baseline instead" link appears below the divider — fires the `clear: true` mutation directly from the modal without needing a separate menu.
- **Follow-on, same turn — visual baseline ghost bar** ([GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)): the user pushed back that locking without visual feedback is meaningless. Added an outline-only ghost bar at the baseline position, rendered behind the live bar (`zIndex: 1` vs the live bar's `zIndex: 2`). Style: dashed slate border (`border-dashed border-slate-500/70`) with a faint slate fill so it's visible but doesn't fight the colored live bar for attention. **Self-hiding when there's no slip** — if `baselineStartDate === startDate && baselineDueDate === dueDate`, the ghost is not rendered (matches an empty diff → no visual noise). When dates diverge, the ghost shows the original schedule and the live bar shows the new one — slip is the visual gap between them. Tooltip on the ghost: `"Baseline: 2026-05-12 → 2026-05-19 · slip: start +3d, end +5d"`. `pointer-events-none` so the ghost never blocks interaction with the live bar's drag handles. Re-renders on every drag (no special wiring — `row.task.baselineStartDate` flows through the existing optimistic mutation cache).
- **Remaining out of scope (flagged for follow-up)**:
  - Project-level bulk baseline edits (e.g. "all tasks in section X").
  - Baseline history / multiple baselines per project (only the latest snapshot is kept).
  - Baseline-aware reporting / overdue logic (e.g. "tasks slipping more than N days").

### Added — 2026-05-02 — Admin RBAC: strict gate, user management, project reassignment

- **Schema**: new `User.active Boolean @default(true)` column ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)). Migration name: `add_user_active`. **Action required**: run `cd backend && npx prisma migrate dev --name add_user_active` to apply — the sandbox blocked Claude from running it. The schema file change is staged; without applying, the new admin endpoints will fail at runtime even though `tsc` passes.
- **Backend middleware**: new `requireAdmin` in [backend/src/http/auth.ts](backend/src/http/auth.ts) — strict `role === "ADMIN"` check (rejects everything else with 403). Use as router-level middleware AFTER `requireAuth`, not per-route.
- **Backend login gate**: [backend/src/routes/auth.ts](backend/src/routes/auth.ts) `/login` now rejects deactivated users with 403 `account_disabled` even when credentials are correct, per the requirement that deactivated users cannot log in at all.
- **New router** [backend/src/routes/admin.ts](backend/src/routes/admin.ts) mounted at `/admin` (existing convention, not `/api/admin/` — the repo strips the `/api/` prefix everywhere). All endpoints sit behind `requireAuth + requireAdmin`:
  - `GET /admin/users` — full user list with `active`, role, created date, project counts (TAM/SA).
  - `PATCH /admin/users/:id/role` — change role; rejects self-demote (admins can't change their own role).
  - `PATCH /admin/users/:id/deactivate` — toggle `active`; rejects self-deactivate.
  - `POST /admin/users/:id/reset-password` — generates a 12-char URL-safe temp password (`crypto.randomBytes`), bcrypt-hashes and stores it, returns the plaintext **once** in the response (no mail infra in dev — admin relays out-of-band). Per the user's "Change password for now (Development)" decision, no forced-change-on-next-login flag was added; the user just logs in with the temp password.
  - `GET /admin/projects` — all projects, bypasses the standard visibility filter (admins see everything per the user's "Admins can CRUD all projects" decision).
  - `PUT /admin/projects/reassign` — body `{ projectId, newTamId }`; updates `Project.tamId`. Validates that the new TAM exists, is active, and has TAM or ADMIN role. This is the only path for *force-reassign by an admin*; regular TAMs can still PATCH their own projects via `/projects/:id` but cannot use `/admin/*` (403 from middleware).
- **Frontend**:
  - New types + queries/mutations in [frontend/src/lib/queries.ts](frontend/src/lib/queries.ts): `AdminUser`, `AdminProject`, `useAdminUsers`, `useAdminUpdateRole`, `useAdminSetActive`, `useAdminResetPassword`, `useAdminProjects`, `useAdminReassignProject`. All invalidate `adminQueryKeys.*` plus the relevant non-admin keys (so the regular `/users` and `/projects` queries also refresh).
  - New [frontend/src/components/AdminGuard.tsx](frontend/src/components/AdminGuard.tsx): redirects non-ADMIN users to `/overview`. Doesn't fight `AuthGuard` — it's a separate layer applied only on the `/admin` route.
  - New [frontend/src/pages/Admin.tsx](frontend/src/pages/Admin.tsx) with two tabs:
    - **Users**: data table with role dropdown (inline change), Deactivate/Reactivate toggle, Reset Password action. Self-row's role select + Deactivate are disabled. Reset Password shows the generated temp password ONCE in a banner the admin must dismiss.
    - **Project Override**: data table of all projects with a TAM dropdown next to each row that fires `useAdminReassignProject` on change. Candidate list filters to active TAM + ADMIN users. If a project's current TAM isn't in the candidates (deactivated or wrong role), they're appended as a "(current)" option so the dropdown shows reality rather than blanking.
  - **Skipped per user direction**: SA Webhook API Key (deferred — Secure Ingestion Port unimplemented), Global Holidays editor (keep `date-holidays` package as-is), System Logs.
  - New `/admin` route in [frontend/src/App.tsx](frontend/src/App.tsx) wrapped in `AdminGuard`.
  - Sidebar gets a sixth item "Admin" (icon: `admin_panel_settings`) in [frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx), filtered to `user.role === "ADMIN"` only.
- **Verification**: `cd backend && npm run build` exits 0; `cd frontend && npm run typecheck && npm run build` both exit 0 (754KB bundle, +10KB for the admin page). Runtime verification still requires the user-applied migration; once applied, log in as `admin@solvro.local` / `password123` → sidebar shows "Admin" → both tabs render and mutate correctly.

### Fixed — 2026-05-02 — Project-wide build/typecheck cleanup

- **Backend build was failing** on ~40 TS errors. Two root causes:
  1. `date-holidays` was declared in [backend/package.json:25](backend/package.json) but never installed — `npm install` resolved this and added the missing types.
  2. The generated Prisma client at `backend/node_modules/.prisma/client/` was 3 migrations stale (only knew Role/User/Project/Task; schema actually has Customer/Section/Label/Comment/Blueprint as well). `npx prisma generate` regenerated it. All `Property 'section' does not exist` / `Priority not exported` errors cleared.
  3. [backend/src/http/validate.ts](backend/src/http/validate.ts) generic signature `validate<T>(source, schema: ZodSchema<T>)` rejected schemas that use `z.transform()` (input ≠ output type) — affected the cross-project tasks list query schema's `overdue: "true"|"false" → boolean` coercion. Loosened to `validate(source: Source, schema: ZodTypeAny)` — the parsed value is still type-safe at the call site via the existing `as z.infer<typeof schema>` cast.
- **Frontend typecheck was failing** on 6 errors:
  1. `@types/node` was never installed → [vite.config.ts](frontend/vite.config.ts) couldn't resolve `node:path` / `__dirname`. Added with `npm install -D @types/node`.
  2. [frontend/tsconfig.node.json](frontend/tsconfig.node.json) had the invalid combo `composite: true` + `noEmit: true` (TS6310). Dropped `noEmit` from the node config; the `tsc -b --noEmit` build script also conflicted with composite-referenced projects, so changed [frontend/package.json](frontend/package.json) `typecheck` from `tsc -b --noEmit` to `tsc --noEmit` (typechecks src/ only — config files are still typechecked during `npm run build` via `tsc -b`).
  3. [GanttColumnGrid.tsx:69](frontend/src/components/gantt/GanttColumnGrid.tsx) unused `col` parameter → renamed `_`.
  4. [GanttFrame.tsx:224-232](frontend/src/components/gantt/GanttFrame.tsx) section-reorder dispatch used `.map(...).filter((p): p is Promise<unknown> => ...)` with an invalid type predicate (supertype not subtype) — refactored to `.flatMap((s, i) => skip ? [] : [promise])` which avoids the null-and-narrow dance entirely.
  5. [ProjectList.tsx:732](frontend/src/pages/views/ProjectList.tsx) `groups` array's inferred type was too narrow to accept `{ section: null, ... }` for the synthetic "(No section)" row → added explicit `: { section: Section | null; tasks: TaskNode[] }[]` type annotation matching the function's declared return.
- **Verification**: `cd backend && npm run build` exits 0; `cd frontend && npm run typecheck && npm run build` both exit 0 (vite reports `built in 1.77s`, 925 modules).

### Removed — 2026-05-02 — Unused `gantt-task-react` dependency

- The Gantt rewrite removed all imports of `gantt-task-react` from `frontend/src/`, but the dep stayed pinned in [frontend/package.json](frontend/package.json). `npm uninstall gantt-task-react` removed it (-1 package). `grep -r "gantt-task-react" frontend/src` now returns nothing.

### Changed — 2026-05-02 — DESIGN.md prose color now matches its frontmatter

- The frontmatter token at [DESIGN.md:19](DESIGN.md) defines `primary: '#0058be'` (correctly mirrored in [frontend/tailwind.config.ts:26](frontend/tailwind.config.ts)), but the prose at line 111 said "Solvro Blue (#3B82F6)" — Tailwind's default blue, a different shade. Updated the prose to `#0058be` so future contributors aren't misled by the contradiction. CLAUDE.md "Known design drift" notes that frontmatter wins; this aligns the prose with that rule.

### Changed — 2026-05-02 — InlineDateRangeEditor reworked as a popover with stacked fields

- **Problem**: the previous turn rendered the editor inline INSIDE the date cell, but two 110px date inputs + chevron + OK/✕ + paddings exceeded the Gantt list pane's 76+76=152px Start/Due column space, so the inputs visibly clipped each other (`01/05/2026 → 04/05/0226` — the "2026" got truncated and overlapped).
- **Fix**: [InlineDateRangeEditor.tsx](frontend/src/components/InlineDateRangeEditor.tsx) rewritten as a **220px popover panel** with Start and Due **stacked vertically** (each on its own line with a tiny `Start` / `Due` label), and Cancel + Save right-aligned at the bottom. Popover positioning is the consumer's responsibility via the new optional `className` prop (e.g. `"absolute right-0 top-full z-50 mt-1"`). The popover layer floats out of the cell — no clipping, no column-width contortions. Added `Escape` to cancel (was only click-outside before).
- **Consumer updates**:
  - [GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx): the Start and Due cells stay visible underneath; the editor anchors absolute-right under the Due cell. Both date cells stay clickable to open the editor.
  - [ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx) `TaskRow` and `SubtaskRow`: editor anchors absolute-left under the Start–Due text.
- **Verification**: `npm run typecheck` passes (only pre-existing config-file noise). Manual: open `/projects/2/gantt` → click any Start or Due cell → tidy popover appears below the cell with stacked inputs; date strings are no longer truncated.

### Added — 2026-05-02 — Editable "(No Section)" + click-to-edit dates in List and Gantt list pane

- **New shared component** [components/InlineDateRangeEditor.tsx](frontend/src/components/InlineDateRangeEditor.tsx): two native `<input type="date">` inputs (Start, Due) + OK / ✕ buttons, with click-outside dismiss and basic clamp (Due < Start auto-corrects to Start). Returns ISO strings via `onSave(startISO, dueISO)`. Used by both [ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx) and [GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx) so the inline edit UX is identical across views.
- **List view — edit "(No Section)"**:
  - The synthetic `(No section)` group's edit pencil is now enabled (was hidden because `section` was null). Clicking it opens the same inline rename input the real sections use, with placeholder "Name this section to promote it" and a "Create" button (real sections still say "Save").
  - Submitting the new name in [ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx#L80-L113) calls `useCreateSection` to create a real section, then PATCHes every orphan task (those with `sectionId === null`) into the new section in parallel via `useUpdateTask`. The synthetic row disappears (because no orphans remain) and the new real section appears in the list — a one-shot promotion.
  - Delete is still hidden for the synthetic row (nothing to delete in the DB).
  - State rename: `renamingSectionId: number | null` → `renamingSectionKey: number | "none" | null` so the same input flow keys both real sections and the synthetic one.
- **List view — click date to edit**: in [TaskRow](frontend/src/pages/views/ProjectList.tsx#L406-L525) and [SubtaskRow](frontend/src/pages/views/ProjectList.tsx#L527-L594) the Start–Due text is now a `<button>` (with hover affordance and "Click to edit dates" tooltip) that swaps to `<InlineDateRangeEditor>` on click. Save fires `useUpdateTask({ startDate, dueDate })` (existing optimistic mutation — date change is instantly visible in the list, the bar in any open Gantt view, etc.). Disabled for non-editors (STAKEHOLDER role).
- **Gantt list pane — click date to edit**: the Start and Due cells in [GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx) become buttons that, on click, swap into a single `<InlineDateRangeEditor>` spanning both columns. Same optimistic `useUpdateTask` mutation. New `onUpdateDates` prop chain: `GanttFrame.handleUpdateDates` → `GanttListPane` → `GanttListRow`.
- **Why this shape for "(No Section)"**: the synthetic row has no `Section` row in the DB, so "edit name + save in place" is meaningless. Promotion (create real section + migrate orphans) was the only behavior that maps cleanly to the existing schema and is what the user actually wants — they want unsectioned tasks to be organizable. Alternative considered: rename the synthetic row in the UI only (no DB write); rejected because it'd be cosmetic and would lose state on reload.
- **Files**: new [components/InlineDateRangeEditor.tsx](frontend/src/components/InlineDateRangeEditor.tsx); modified [pages/views/ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx), [components/gantt/GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx), [components/gantt/GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx), [components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx). No deletions.
- **Verification**: `npm run typecheck` passes (only pre-existing `vite.config.ts` / `tsconfig.json` config-file noise remains). Manual QA: as `tam.charlie@solvro.local` / `password123` — in `/projects/2/list`, click the edit pencil on `(No section)` → type a name → Create → orphan tasks (Test) move into the new section, synthetic row disappears. Click any task's Start–Due text → inline date editor opens → change a date → OK → list updates instantly and the Gantt bar (if open) reflects the new dates. Same in `/projects/2/gantt` list pane.

### Changed — 2026-05-02 — Gantt list pane: drop inline "+ Add task" rows; add drag-to-move tasks between sections and drag-to-reorder sections

- **Removed** the inline `+ Add task` row that appeared under each section in the list pane. The toolbar's `+ TASK` button is now the only entry point. Cleanup chain:
  - [lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts): dropped `"add-task"` from `RowKind`; removed the `add-task` row push in `buildRows`. `RowKind` is back to `"section" | "task" | "subtask"`.
  - [components/gantt/GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx): removed the `add-task` render branch and the `onAddTask` prop.
  - [components/gantt/GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx): removed the `onAddTask` prop pass-through.
  - [components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx): removed `handleAddTaskInSection`. The `onCreateTaskOpen(sectionId)` API still accepts a sectionId for forward compatibility, but every caller now passes `null`.
- **Added** drag-and-drop in the list pane via `@dnd-kit/core` (already a dep, used the same pattern as [ProjectKanban.tsx](frontend/src/pages/views/ProjectKanban.tsx)). Two affordances live on the same `DndContext` and dispatch by the dragged item's kind:
  - **Move a top-level task between sections**: grab the drag handle on a task row → drop on a section header → fires the existing optimistic [useUpdateTask](frontend/src/lib/queries.ts#L355-L381) mutation with `{ sectionId: target }`. Optimistic so the row jumps to its new section instantly.
  - **Reorder sections**: grab the drag handle on a section header → drop on another section header → moved section is inserted **before** the target. Then [useUpdateSection](frontend/src/lib/queries.ts#L481-L490) fires in parallel for every section whose `position` actually changed (renumbered to dense `0..N-1`). Sections without an `onMutate` optimistic path will briefly flicker; acceptable for MVP — promote to optimistic later if it bothers anyone.
  - **Subtasks are not draggable** (they always inherit their parent's section).
  - **The "(No section)" pseudo-row** is droppable (drop a task on it to clear the task's `sectionId`), but never draggable (it's not a real section).
  - **Drag handle**: a `drag_indicator` material-symbol icon appears in the leftmost slot of the name column for draggable rows; gray at rest, on-surface-variant on hover. Cursor: `grab` / `grabbing`. Drop target: 2px primary ring on the section header while a draggable hovers over it.
  - **PointerSensor activation distance = 6px**: clicks (toggle status, open editor, expand/collapse) still work cleanly because dnd-kit only activates after the pointer travels >6px.
  - **Permission gate**: drag is disabled entirely when `canEdit` is false (STAKEHOLDER role); handle icon is hidden.
- **New exported types** in `GanttListRow`: `RowDragData` (`{ kind: "task" | "section", taskId?, sectionId }`) and `RowDropData` (`{ kind: "section-target", sectionId }`). `GanttFrame.handleDragEnd` consumes them via `active.data.current` / `over.data.current`.
- **Files**: modified [lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts), [components/gantt/GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx), [components/gantt/GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx), [components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx). No new files; no deletions.
- **Verification**: `npm run typecheck` passes (only pre-existing `vite.config.ts` / `tsconfig.json` config-file noise remains). Manual QA path: log in as `tam.charlie@solvro.local` / `password123` → `/projects/2/gantt` → grab the Migration task's drag handle → drop on the Planning section header → Migration appears under Planning, both in the list and in the chart pane (the bar's vertical position shifts). Then grab the Closing section header → drop on the Pre-Implementation header → Closing appears above Pre-Implementation. As `stakeholder.evan@solvro.local` (STAKEHOLDER), drag handles are absent and drag-and-drop is no-ops.

### Fixed — 2026-05-02 — Gantt list pane was painted under the date axis (z-index inversion)

- [GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx): the list pane was `z-10` and its sticky header was `z-30`, while the chart's date axis ([GanttDateAxis.tsx](frontend/src/components/gantt/GanttDateAxis.tsx)) is `z-20`. With list pane < axis, the axis row painted ON TOP of the sticky list pane — so when scrolling horizontally the day numbers (01, 02, 03…) were visible bleeding under the Name/Start/Due/% columns.
- Fix: list pane → `z-30`, list-pane header → `z-40`. Now: axis (z-20) < list pane body (z-30) < list pane header / corner (z-40). The list pane's opaque white background hides the axis on the X axis; the corner header hides the axis on the Y axis.

### Added — 2026-05-02 — Gantt auto-scrolls to today on open and on scale change

- [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx): on initial mount of the chart and on every view-mode / column-width / chart-start change, the chart pane auto-scrolls so today's column is centered. Wrapped in a `requestAnimationFrame` so the scroll happens after the browser has laid out the new content (otherwise `scrollTo` can fire against a stale `scrollWidth`).
- Refactored: `scrollToToday` (button handler) is now a thin wrapper over `scrollToTodayPos(behavior)`. Button uses `"smooth"`; the auto-scroll effect uses `"auto"` (instant) so the chart doesn't visibly animate from `0` on load.
- **Why**: with the ±1 year padding from the previous turn, opening the Gantt would dump the user at Jan-of-(year-before-earliest-task), forcing a manual click on Today every time. Auto-scroll matches Instagantt / Asana / monday.com default behavior.

### Changed — 2026-05-02 — Gantt timeline pads ±1 year around the project's task range

- **Why**: at default zoom the chart axis previously hugged the task range with only one unit of breathing room (1 day in Day mode, 1 week in Week mode, 1 month in Month mode). For a project that runs May–June 2026, you couldn't scroll back to e.g. Jan 2026 or forward to Sep 2026 to plan around adjacent work — the chart simply ended.
- **Fix** — [computeChartStart / computeChartEnd in lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts): both helpers now subtract / add a `PAD_YEARS = 1` constant to the actual min/max task date, then snap to the appropriate unit boundary (start-of-day for Day, Monday for Week, first-of-month for Month). The chart spans `[earliest task − 1 year, latest task + 1 year]` at minimum.
- **Holiday fetch** — [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx): `yearsCovered` now derives from `chartStart` / `chartEnd` (post-padding) instead of `dateRange.min` / `dateRange.max`. So a project that visually spans 2025–2027 now triggers `useHolidays([2025, 2026, 2027])` — three parallel cached requests — and the holiday tints render across the full visible range, not just the un-padded task window.
- **Trade-off accepted**: more columns to render at default zoom (Day mode for a 1-month project becomes ~26 months × 30 days ≈ 780 columns at 60px each = ~47k px wide). The chart's own `overflow-auto` handles this; performance is fine for typical project sizes since each column is a tiny `<div>`. If a future project pushes 5+ years of tasks in Day mode, we'd want column virtualization — defer until it's an actual problem.

**Layout fix (the actual scroll bug — turns out it wasn't in the Gantt at all)**

- **Root cause**: in [pages/ProjectDetail.tsx:133](frontend/src/pages/ProjectDetail.tsx) the outlet wrapper `<div className="flex-1">` was a flex child without `min-w-0`. In flexbox, a child's default `min-width: auto` refuses to shrink below the content's intrinsic width. The Gantt's inner 2640px-wide content forced this flex child to be ≥2640px, which propagated up the chain (ProjectDetail outer flex → `<main>` → page `<div>`) and pushed the entire page wider than the viewport. Result: the **body** scrolled horizontally, not the Gantt's internal scroller. The previous turn's `columnWidth` stretch hack was masking, not fixing, this.
- **Fix** — three small changes to break the min-width-auto chain:
  - [Shell.tsx](frontend/src/components/layout/Shell.tsx): outer wrapper `min-h-screen` → `h-screen w-full overflow-hidden`. `<main>` `min-h-[...]` → `h-[calc(100vh-64px)] overflow-y-auto overflow-x-hidden`. The page is now strictly viewport-locked; non-Gantt pages still scroll vertically inside `<main>`.
  - [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx): outer flex container gets `min-w-0`; the outlet wrapper gets `min-h-0 min-w-0 flex-1` (was just `flex-1`). This is the load-bearing change — it lets the Gantt's wide inner content stay contained.
  - [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx): outer container `h-[calc(100vh-220px)]` → `h-full min-w-0 overflow-hidden`. The fixed `220px` magic-number assumption is gone; height now comes from the parent flex chain.
- **Why the previous turn's "fixed default columnWidth" patch wasn't enough**: it correctly made the Gantt's internal content wider than its scroller, but with the broken flex chain the scroller itself was also wider than the viewport — so the only scrollbar to appear was on the body, not on the Gantt.

**Visual redesign — Instagantt-style data grid**

- **Default scale**: `useState<ViewMode>("week")` → `"day"` in [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx). Day mode shows the month band on top + day numbers (just `"18"`, no day-of-week letter) on the bottom row.
- **List pane columns** ([GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx) + [GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx)): five columns now — `[◯ checkbox] [Name] [Start] [Due] [%]`. Total list pane width grows from 360px to `CHECKBOX(32) + NAME(220) + DATE(76) + DATE(76) + PCT(56) = 460px` (constants in [lib/gantt/constants.ts](frontend/src/lib/gantt/constants.ts)). Density tightened: row height `32 → 30`, padding reduced. Borders are `border-gray-200` per the spec.
- **Completion checkbox**: an interactive circular checkbox in the leftmost column for each task/subtask (sections have no checkbox). Click toggles `status` between `TODO ↔ DONE` via the existing [useUpdateTask](frontend/src/lib/queries.ts#L355-L381) mutation. Done tasks render with `line-through` on the name + filled emerald-500 check.
- **Section styling**: bold uppercase + `bg-gray-50` resting / `bg-gray-100` hover. Tasks/subtasks: `bg-white` / `bg-gray-50` hover.
- **Inline `+ Add task` per section**: a new `RowKind = "add-task"` pseudo-row is emitted from [buildRows](frontend/src/lib/gantt/geometry.ts) at the end of each non-collapsed section. The list pane renders a `+ Add task` button (only for `canEdit`); the chart pane renders an empty body row that keeps vertical alignment perfect. Click opens the existing `TaskFormModal` with `initialSectionId` pre-scoped — the create modal now accepts the sectionId from the originating row, so tasks land in the right section without manual reassignment.

**Visual redesign — bars + today marker**

- **GanttBar** ([GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx)): `rounded-full` (pill shape, was `rounded`). Fill color now driven by **status** (TODO=sky-200 / IN_PROGRESS=blue-400 / DONE=emerald-400) instead of priority. **Priority** is surfaced as a 3px left border (LOW=slate / MED=blue / HIGH=amber / URGENT=rose). Text auto-contrasts (light on dark fills, dark on the sky-200 TODO fill). IN_PROGRESS bars show a 50%-width darker overlay as a progress indicator.
- **GanttSectionBar** ([GanttSectionBar.tsx](frontend/src/components/gantt/GanttSectionBar.tsx)): rewritten from a thick rounded gray bar to the Instagantt summary look — a thin 2px slate-800 line with **downward bracket caps** (2px × 6px verticals) at both ends. Non-interactive.
- **Today marker** ([GanttTodayLine.tsx](frontend/src/components/gantt/GanttTodayLine.tsx) + [GanttDateAxis.tsx](frontend/src/components/gantt/GanttDateAxis.tsx)): the rose-500 vertical line is now centered exactly on today's column (was at the left edge) and topped with a **solid red 28px circle containing the day number in white** sitting on the date axis at the same X. The circle floats slightly above the bottom row of the axis so it reads as a marker, not part of the date label.

**Toolbar reorganization**

- The View toggle moves to the **right side** of the toolbar (relabeled `Scale: Day/Week/Month`), grouped as a segmented control. Today / Add task / Add section stay on the left. Per the user's choice in this turn, `Undo/Redo` and `Columns` buttons are **explicitly skipped** (not even rendered as placeholders) — they need real history-stack and persisted column-toggle infrastructure to be useful, deferred to a future turn. **Minimap** is also deferred (we removed `gantt-task-react` two turns ago and this would need a separate scaled-overview implementation).

**Files**

- Modified: [Shell.tsx](frontend/src/components/layout/Shell.tsx), [ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx), [pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx), [components/gantt/GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx), [components/gantt/GanttBar.tsx](frontend/src/components/gantt/GanttBar.tsx), [components/gantt/GanttSectionBar.tsx](frontend/src/components/gantt/GanttSectionBar.tsx), [components/gantt/GanttTodayLine.tsx](frontend/src/components/gantt/GanttTodayLine.tsx), [components/gantt/GanttDateAxis.tsx](frontend/src/components/gantt/GanttDateAxis.tsx), [components/gantt/GanttListRow.tsx](frontend/src/components/gantt/GanttListRow.tsx), [components/gantt/GanttListPane.tsx](frontend/src/components/gantt/GanttListPane.tsx), [components/gantt/GanttRow.tsx](frontend/src/components/gantt/GanttRow.tsx), [components/gantt/GanttChartPane.tsx](frontend/src/components/gantt/GanttChartPane.tsx), [lib/gantt/constants.ts](frontend/src/lib/gantt/constants.ts), [lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts).
- **No new files**. **No deletions**.

**Verification**

- `npm run typecheck` passes (only pre-existing `vite.config.ts` / `tsconfig.json` config-file noise remains).
- Manual QA: `cd frontend && npm run dev` → log in `tam.charlie@solvro.local` / `password123` → `/projects/2/gantt`. Day mode is default; chart overflows the viewport horizontally and **the Gantt's own scroller** scrolls (no body horizontal scrollbar). Today marker renders as a red circle with day number on the axis + a thin red line through the chart. Click a task's circle → toggles complete and the name strikes through. Click `+ Add task` under a section → modal opens pre-scoped to that section. As `stakeholder.evan@solvro.local` (STAKEHOLDER), checkboxes are disabled and `+ Add task` rows render as empty spacer rows.

### Changed — 2026-05-02 — Gantt: drop responsive column-width entirely; always use fixed defaults so the chart overflows

- **Bug recap**: the previous turn introduced a "stretch when natural-content < available" rule. For the GCP Migration project at Day mode, natural content (40px × 38 cols = 1520px) was 4px less than available (1524px), so the stretch branch fired, columns grew to exactly fill, and the chart still didn't scroll. The "stretch when small" rule turns out to be a footgun: any project that lands within a few px of viewport width silently collapses.
- **Fix**: removed the responsive computation in [GanttFrame.tsx](frontend/src/components/gantt/GanttFrame.tsx). `columnWidth` is now just `COLUMN_DEFAULT_WIDTH[viewMode]`. Bumped defaults in [constants.ts](frontend/src/lib/gantt/constants.ts) to `{ day: 60, week: 140, month: 220 }` — wider columns are also more legible per the user's "shrunk" complaint. `scrollerWidth` state and the ResizeObserver in `GanttFrame` are deleted (no consumer left); `scrollerRef` stays for the Today button's `scrollTo`. Dropped now-unused `useEffect`, `COLUMN_MIN_WIDTH` imports.
- **Trade-off accepted**: a project too small to fill the viewport at default width will leave empty space on the right of the chart. This is honest and matches Instagantt — better than a chart that silently collapses-or-scrolls based on column-count arithmetic.
- **Day-mode axis label**: also (carried from previous turn): dropped the day-of-week letter prefix (was `"M18"`, now `"18"`). Removed the unused `DAY_NAMES` constant from [GanttDateAxis.tsx](frontend/src/components/gantt/GanttDateAxis.tsx). Weekends are visually marked via the column tint.

### Changed — 2026-05-02 — Gantt view rewritten without `gantt-task-react` (Instagantt-style two-pane layout)

- **Why**: the user wants a project-management-grade Gantt — sticky list pane that never scrolls horizontally, scrollable timeline, dual-row date axis (month band + W##/day band), section/task/subtask hierarchy with section bars spanning their children's range. `gantt-task-react@0.3.9` couldn't deliver this without continuous fights against its internal layout (we'd already had to ship a scroll-sync hack against its `_CZjuD` / `_2B2zv` CSS-module hashes earlier today). Custom render makes the architecture cleaner and unblocks future PM features.
- **Architecture (Layout C — single outer scroller + `position: sticky` panes)**: the project Gantt now mounts a single scroll container; inside, the list pane is `position: sticky; left: 0`, the date axis is `position: sticky; top: 0`, and the top-left corner pins both. Vertical scroll moves both panes together for free (one scroll context = no JS sync). Horizontal scroll moves the chart content under the sticky list. This eliminates the entire class of overlay-drift bugs we hit earlier and is the canonical "frozen first column" pattern. Notable rejection: a chart-pane-only `overflow-x: auto` + `overflow-y: visible` setup was considered but doesn't work — the CSS spec promotes `visible` to `auto` whenever the orthogonal axis is non-`visible`, breaking the outer sticky context.
- **New geometry module** [frontend/src/lib/gantt/geometry.ts](frontend/src/lib/gantt/geometry.ts): typed `ViewMode = "day" | "week" | "month"` (replaces gantt-task-react's enum), `Row` interface (`section | task | subtask`, with `depth`, `parentRowId`, `taskId`, `start`/`end`), and the math: `computeChartStart` / `computeChartEnd` (per-mode unit snap with one unit of breathing room — the legacy `-7` Week snap from gantt-task-react's `preStepsCount=1` is gone), `positionFor` (preserved verbatim from the deleted `GanttHolidayOverlay`), `dateFromX` (NEW — inverse of `positionFor`, snaps to whole days, used by drag), `iterColumns` (per-mode column iterator with weekend + week-number annotations), `buildRows` (rewritten from the deleted `buildGanttRows` to emit a flat array — section row with aggregated start/end from descendants, then parent tasks, then subtasks; orphan-subtask fallback preserved). `parseISODate`, `addDays`, `startOfDay`, `startOfMondayWeek`, `isoWeekNumber`, `fmtDateDDMM`, `fmtDateRangeDDMM`, `fmtMonthYear` colocated as helpers.
- **New constants** [frontend/src/lib/gantt/constants.ts](frontend/src/lib/gantt/constants.ts): `LIST_PANE_WIDTH = 360`, `AXIS_HEIGHT = 56` (28+28 dual-row), `ROW_HEIGHT = 32`, `BAR_HEIGHT = 22`, `RESIZE_HANDLE_PX = 6`, `COLUMN_MIN_WIDTH = { day: 36, week: 80, month: 120 }`, `NAME_COL_WIDTH = 200`, `DATES_COL_WIDTH = 160`.
- **New components** under [frontend/src/components/gantt/](frontend/src/components/gantt/):
  - `GanttFrame` — page-level shell. Owns `viewMode`, `collapsedSections`, `actionError`, `addingSection` form state. Hooks `useProjectTasks`, `useProjectSections`, `useUpdateTask`, `useCreateSection`, `useHolidays`. Memos `rows`, `dateRange`, `chartStart`, `chartEnd`, `columnCount`, `columnWidth` (responsive: fits available width with `COLUMN_MIN_WIDTH[viewMode]` floor). Renders the toolbar (View Day/Week/Month + Today + Add task + Add section), the inline Add-section form, error banner, and the scroller.
  - `GanttListPane` — sticky `left: 0`, `width: 360px`, opaque background. Internal sticky-`top: 0` header row (Name | Start → Due) at z-30; rows below at z-10.
  - `GanttListRow` — chevron+collapse for sections, depth-indent for subtasks, name button (click → modal for tasks, toggle for sections), Start/Due via `fmtDateDDMM`.
  - `GanttChartPane` — composes `GanttDateAxis`, `GanttColumnGrid`, list of `GanttRow`s, `GanttTodayLine`.
  - `GanttDateAxis` — sticky `top: 0`, dual-row. Top row: month-label spans (computed from contiguous columns sharing the same `fmtMonthYear`). Bottom row: per-mode label (`Mon01` for day, `W##` for week, `Apr` for month).
  - `GanttColumnGrid` — replaces the deleted `GanttWeekendOverlay` + `GanttHolidayOverlay`. Renders one column-divider div per column + per-day weekend/holiday tints in normal flow (no scroll-sync needed; positions are content-relative). Holiday tooltip via native `title` attribute.
  - `GanttRow` — single horizontal strip; switches to `GanttSectionBar` (kind=section) or `GanttBar` (task | subtask).
  - `GanttBar` — draggable. `pointerdown` on body → `mode="move"`; on left 6px → `resize-start`; on right 6px → `resize-end`. `setPointerCapture` + `pointermove` updates a transient `ghost` rectangle (renders bar at new position, no commit yet). On `pointerup`, if movement crossed at least one day, calls `onCommit(taskId, start, end)` which fires the existing optimistic [useUpdateTask](frontend/src/lib/queries.ts#L355-L381) mutation (instant UI update + rollback on error). Click without drag opens the task editor modal. Escape cancels mid-drag. `clientX` deltas are viewport-relative for both endpoints, so scroll position never enters the drag math. Resize-start clamps at `<= origEnd`; resize-end at `>= origStart`. Section bars don't attach drag listeners. When `!canEdit`, listeners are no-ops and resize handles aren't rendered.
  - `GanttSectionBar` — non-draggable thin gray bar with end-caps; spans aggregated descendants' range.
  - `GanttTodayLine` — `position: absolute` 1-px rose line at `positionFor(today, ...).x`; full body height; only renders if today is within `[chartStart, chartEnd]`.
- **Modified** [frontend/src/pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx): collapsed from ~750 LOC to ~37 LOC. Just `useProjectContext` + `<GanttFrame>` + the two `TaskFormModal` slots. All Gantt logic moved into `GanttFrame`.
- **Deleted** (replaced by the new architecture): `frontend/src/components/GanttHolidayOverlay.tsx`, `frontend/src/components/GanttWeekendOverlay.tsx`, `frontend/src/lib/useGanttScrollSync.ts`, `frontend/src/lib/ganttConstants.ts` (replaced by `lib/gantt/constants.ts`). The CSS-module-class-hash assumption against `gantt-task-react` is gone with them.
- **Untouched**: `gantt-task-react` is still in [frontend/package.json](frontend/package.json) (no other view imported it, but `npm uninstall` is a destructive action — leaving for a separate user call). All other views (`ProjectKanban`, `ProjectList`, `ProjectTimeline`), the server, the schema, and DESIGN.md tokens are untouched. The design-system Tailwind tokens (`surface-*`, `outline-variant`, `on-surface-variant`, etc.) drive all styling — no inline hex.
- **What v1 ships vs. defers**: list pane v1 = Name (with hierarchy + collapse) + Start/Due dates only. Progress % column and Assignee avatar are deferred per user choice. View modes (Day/Week/Month), Today button, Add task / Add section, and drag-to-reschedule (move + resize) are all kept.
- **Verification**: typecheck passes (only the pre-existing `vite.config.ts` / `tsconfig.json` config-file noise remains, unrelated to this change). Manual QA path: `cd frontend && npm run dev` → log in `tam.charlie@solvro.local` / `password123` → `/projects/2/gantt` → scroll horizontally (list stays pinned), scroll vertically (both panes scroll together), toggle Day/Week/Month, click Today, drag a bar / resize an edge, collapse a section. As `stakeholder.evan@solvro.local` (STAKEHOLDER role), bars render but resize handles are absent and drag is disabled.

### Fixed — 2026-05-02 — Gantt holiday/weekend overlays drifting when chart scrolls

- **Problem**: the rose holiday strips and gray weekend strips painted at the correct positions only at scroll=0; horizontal scrolling caused a growing visible drift between the overlays and the column headers (verified via two user screenshots of `/projects/2/gantt` taken before vs. after dragging the chart's bottom scrollbar).
- **Root cause**: in [pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx) both overlays were mounted as `position:absolute` children of the OUTER `chartContainerRef` (with a static `left: listWidth`). gantt-task-react renders its calendar SVG and task bars inside its own internal scroll container — confirmed in [node_modules/gantt-task-react/dist/index.js](frontend/node_modules/gantt-task-react/dist/index.js) at line 2117: `styles$9 = {"ganttVerticalContainer":"_CZjuD","horizontalContainer":"_2B2zv", ...}`. `._CZjuD` owns `scrollLeft` (header SVG + body inherit), `._2B2zv` (nested) owns `scrollTop` for the body. Our overlays sat on a different element, so the chart scrolled under them and they stayed pinned.
- **Why not a public API**: `gantt-task-react@0.3.9` (`dist/index.d.ts` `GanttProps`) exposes no `onScroll` or `scrollX` — `EventOption | DisplayOption | StylingOption` carry no scroll-state callback. So we have to read scroll from the DOM.
- **Fix**:
  - **New** [frontend/src/lib/ganttConstants.ts](frontend/src/lib/ganttConstants.ts): single source of truth for `GANTT_HEADER_HEIGHT = 50` (deduped — was previously duplicated in both overlay files) and the two CSS-module class hashes `GTR_HORIZONTAL_SCROLL_SELECTOR = "._CZjuD"` / `GTR_VERTICAL_SCROLL_SELECTOR = "._2B2zv"`. Comment in the file documents the grep command to re-derive on a `gantt-task-react` upgrade.
  - **New** [frontend/src/lib/useGanttScrollSync.ts](frontend/src/lib/useGanttScrollSync.ts): `useGanttScrollSync(containerRef, deps)` — finds the two scroll elements via `querySelector`, attaches `passive: true` `scroll` listeners, coalesces updates with `requestAnimationFrame`, and returns `{ x, y }`. The `deps` arg lets callers force re-binding when gantt-task-react remounts its inner SVG (task list length, viewMode, columnWidth changes — these cause new DOM nodes and the listeners need to re-attach).
  - **Modified** [frontend/src/pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx): import and call `useGanttScrollSync(chartContainerRef, [ganttTasks.length, viewMode, dynamicColumnWidth])`; pass `scrollX` / `scrollY` props to both overlays.
  - **Modified** [frontend/src/components/GanttWeekendOverlay.tsx](frontend/src/components/GanttWeekendOverlay.tsx) and [frontend/src/components/GanttHolidayOverlay.tsx](frontend/src/components/GanttHolidayOverlay.tsx): import `GANTT_HEADER_HEIGHT` from `@/lib/ganttConstants` (was a duplicated local const); add `scrollX` / `scrollY` to props; apply `transform: translate3d(${-scrollX}px, ${-scrollY}px, 0)` + `willChange: "transform"` on the overlay root. Existing `positionFor` math is unchanged — only the mount/scroll-coupling was broken.
- **Why this approach over alternatives**:
  - Portal into `_2B2zv` was rejected: that container's child is an `<svg>`, while our overlays are HTML divs — would force a bigger overlay rewrite.
  - A controlled `scrollX` prop was rejected: not exposed by gantt-task-react v0.3.9.
  - Reading from the rendered DOM after each render was rejected: scroll-listener + `transform` is cheaper (no layout reads on the hot path) and naturally keeps strict alignment because we apply the *exact* `scrollLeft` value the library writes.
- **Coupling note**: the class-hash selectors are package-version-coupled. They live in the package's bundled `index.css` (which we already import in `ProjectGantt.tsx`), so they're stable for the pinned `0.3.9`. If the lib is bumped, re-derive via `grep -E "horizontalContainer|ganttVerticalContainer" frontend/node_modules/gantt-task-react/dist/index.js` and update [ganttConstants.ts](frontend/src/lib/ganttConstants.ts).

### Changed — 2026-05-02 — CLAUDE.md refresh to match shipped implementation

- [CLAUDE.md](CLAUDE.md): refreshed via `/init` to reflect the actual built state of the repo. Preserved the existing changelog discipline, product-domain orientation, design-system rules, and known mockup/spec drift notes. Added: (1) **Common commands** section with the Docker Compose flow, host-side `npm` scripts for backend (`prisma:generate`, `prisma:migrate`, `db:seed`, `dev`, `dev:admin`, `build`, `start`, `prisma:studio`, `db:reset`) and frontend (`dev`, `typecheck`, `build`, `preview`), seeded dev credentials, and an explicit note that **no test runner / linter / formatter is wired in** (so future Claude doesn't fabricate `npm test`); (2) **Backend conventions** capturing the no-`/api/`-prefix mount pattern, the Zod-via-`env.ts` rule, the shared Prisma client singleton, the `requireAuth` + `requireRole` middleware stack, the `projectVisibilityFilter` helper as the canonical role-scoping pattern, the `validate()` middleware contract, the `HttpError` + global error-handler model, pino logging, and migration discipline (`@map` snake_case ↔ camelCase TS); (3) **Frontend conventions** capturing the `App.tsx` route tree (auth-guarded `Shell` with nested project sub-routes for list/kanban/gantt/timeline), the `frontend/src/components/layout/` shell composition, the `@/` path alias, the `apiRequest`-only fetch rule, the centralized `lib/queries.ts` TanStack Query layer, and the Tailwind theme as the runtime port of DESIGN.md frontmatter; (4) updated **target architecture** notes to mention the additional shipped models (`Customer`, `Section`, `Label`, `Comment`) and the `(projectId, version)` blueprint uniqueness; (5) revised **working on this repo** to flag that the **Secure Ingestion Port webhook is not yet implemented** and to describe the expected shape (separate auth path, transactional blueprint→tasks fanout, preserved projectId↔blueprint linkage for AI Breakdown styling).
- **Why**: the previous CLAUDE.md said "when the user asks to start building, the natural first step is scaffolding..." — but the backend (Express + Prisma + ~10 route modules + JWT/RBAC + Zod validation) and frontend (Vite + React + TanStack Query + dnd-kit + gantt-task-react + recharts + four project views) are well-built. Future Claude needs the conventions of the *existing* code (visibility filter, validate middleware, queries.ts hook layer, no-/api-prefix mount, `@/` alias) to extend it correctly, plus accurate commands so it doesn't invent ones.

### Added — 2026-05-01 — Gantt: Today button, inline add task/section, weekend shading

- **Today button** in the toolbar: scrolls the chart container to today's column with `el.scrollTo({ left, behavior: "smooth" })`. Centering math: `target = positionFor(today, chartStart, viewMode, columnWidth).x − (clientWidth − listWidth) / 2`. Reuses `positionFor` (now exported from [GanttHolidayOverlay.tsx](frontend/src/components/GanttHolidayOverlay.tsx)) so the same axis math drives both holiday placement and Today scroll.
- **Add task / Add section** buttons (TAM/ADMIN only):
  - Add task → opens the existing `TaskFormModal` in `mode="create"` with no pre-set section/parent.
  - Add section → reveals an inline form (input + Add + Cancel) below the toolbar; submits via `useCreateSection`. Mirrors the pattern in [ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx) so the UX feels consistent.
- **Weekend shading**: new [components/GanttWeekendOverlay.tsx](frontend/src/components/GanttWeekendOverlay.tsx) iterates from `chartStart` to `taskDateRange.max`, picks Saturdays + Sundays, and paints them with `bg-slate-900/[0.06] mix-blend-multiply`. Rendered with `zIndex: 0` (below holidays at `z: 1`) so a holiday on a weekend reads as red, not gray. `aria-hidden`, `pointer-events-none` — purely decorative, doesn't block bar drag.

### Added — 2026-05-01 — Indonesian public holidays in the Gantt view

- **Backend dep**: added `date-holidays` to [backend/package.json](backend/package.json) (zero-runtime-config, ships full ID holiday calendar; queried by year).
- **Backend route**: [routes/holidays.ts](backend/src/routes/holidays.ts) — `GET /holidays?year=YYYY` (Zod-validated, defaults to current year, range 1970–2100). JWT-required via `requireAuth`. Returns `{ date: "YYYY-MM-DD", name, type }[]` filtered to `type === "public"`. In-process `Map<year, Holiday[]>` cache so each year is computed once per backend lifetime — holidays are static for a given year, no TTL needed. Mounted at `/holidays` in [app.ts](backend/src/app.ts) alongside other authed routes (no `/api/` prefix, matching the rest of the app).
- **Frontend hook**: `Holiday` type + `useHolidays(years: number[])` in [lib/queries.ts](frontend/src/lib/queries.ts). Uses `useQueries({ combine })` to fetch each year as a separate cache entry (24h `staleTime`) and flatten the results — so a Gantt that spans 2026–2027 makes two parallel requests, each independently cached.
- **Overlay component**: [components/GanttHolidayOverlay.tsx](frontend/src/components/GanttHolidayOverlay.tsx). Renders one absolutely-positioned `<div>` per holiday with `bg-rose-500/10` + `border-r border-rose-500/30 mix-blend-multiply`, sized and positioned per `viewMode`:
  - **Day**: `x = daysFromChartStart × columnWidth`, `width = columnWidth` (whole column tinted).
  - **Week**: `width = columnWidth / 7` (one slice of the week column).
  - **Month**: `width = columnWidth / daysInMonth` (a thin vertical strip in the month column).
  - Native `title` attribute = `"<holiday name> — <yyyy-mm-dd>"` so hover tooltip works without a tooltip lib. `pointer-events-auto` on each marker so the tooltip fires; outer wrapper is `pointer-events-none` so drag-to-reschedule is unaffected.
- **Wire-in** at [pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx):
  - New `taskDateRange` memo (min/max across all dated tasks) → `yearsCovered` array → `useHolidays(yearsCovered)`.
  - New `computeChartStart(minTaskStart, viewMode)` helper that mirrors `gantt-task-react`'s `preStepsCount=1` snap-back: Day → 1 day before; Week → previous Monday minus 7d; Month → 1st of previous month. The overlay's X math is anchored to this date.
  - Container div gains `relative` so the overlay's `absolute` positioning is scoped correctly. Overlay's `left` = `nameColWidth + datesColWidth` (the list panel) so markers only paint inside the chart pane, never under the list.
  - Overlay only renders when at least one holiday and a non-null `chartStart` exist; on view-mode swap or column-width drag, the X positions recompute via dependent `useMemo`s.
- **Why**: requested by user. Indonesian TAMs need to see holidays inline with task bars so they don't schedule work on `Hari Kemerdekaan` etc. Library has no native non-working-days API, so we recompute the date axis ourselves and overlay markers — small drift risk if `gantt-task-react` ever changes its `preStepsCount` default, mitigated by visual smoke-test in the verification block.

### Added — 2026-05-01 — Project context: right-side slideover (`RightSidebar`)

- **New** [components/layout/RightSidebar.tsx](frontend/src/components/layout/RightSidebar.tsx): a 320px (`w-80`) glassmorphic panel pinned to the right edge of the viewport (`fixed right-0 top-16 bottom-0 z-30 border-l border-outline-variant bg-surface-container-low/95 backdrop-blur-md`). Slides in/out via `transform translate-x-0 ↔ translate-x-full` with a 200ms ease-out transition.
  - **Project Context header**: small uppercase `PROJECT CONTEXT` title, then `SOLV-NNN` ID next to a status badge tinted by `ProjectStatus` (PLANNING amber / ACTIVE primary blue / ON_HOLD slate / COMPLETED emerald / CANCELLED rose). Project name + description below.
  - **Blueprint Reference** card: bordered `surface-container-lowest` block with a filled `schema` material icon, the version string (default `SA Blueprint v2.4`, override via prop), a one-line caption, and a `View source documentation` link with `open_in_new` icon. URL defaults to `https://docs.solvro.dev/blueprints/v2.4` and is overridable via `blueprintDocsUrl`.
  - **Stakeholders** mini-table: TAM, SA, Customer (when present), task count.
  - Close button (`×`) calls `onClose`.
- [pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx) integration:
  - Local `contextOpen` state (default `true`) — visible-by-default per the DESIGN.md tri-panel layout, still toggleable.
  - Outer container gets a dynamic right margin (`mr-80` when open, `mr-0` when closed) with `transition-[margin] duration-200 ease-out` so the main canvas resizes alongside the panel rather than being overlapped.
  - New **Context** toggle button in the project header (next to `Edit project`), icon swaps between `right_panel_close` / `right_panel_open` and styled with `border-primary bg-primary/10 text-primary` when active.
- **Why**: requested by user. Surfaces project metadata + blueprint linkage without leaving the project page; keeps the main table/Kanban/Gantt/Timeline canvas as the focal area while letting context recede.

### Changed — 2026-05-01 — Sidebar: collapsible icon rail + slideover panel

- **New** [components/layout/SidebarContext.tsx](frontend/src/components/layout/SidebarContext.tsx): tiny context (`open`, `toggle`, `close`) shared between `Sidebar`, `Shell`, and any consumer that needs sidebar state.
- [components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx): rewritten as a fixed left rail.
  - **Collapsed (default)**: 64px wide (`w-16`), icons only. Each `NavLink` becomes a centered 40×40 hit target with a `title` tooltip showing the label. Brand block hidden; only the menu/expand button remains in the header.
  - **Expanded**: animates to `w-sidebar` (260px) revealing labels, brand mark, and "Backend: UP" pill. A **backdrop** (`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]`) renders behind the sidebar; clicking it closes the panel. Clicking any nav link also closes (so navigation feels like a slideover dismiss).
  - Icon swap on the toggle: `menu` ↔ `menu_open`.
  - `transition-[width] duration-200 ease-out` so the slide is smooth.
- [components/layout/Shell.tsx](frontend/src/components/layout/Shell.tsx): wraps the page in `SidebarProvider`. Main content now uses a fixed `ml-16` regardless of sidebar state — so the open panel **slides over** the content rather than pushing it (true slideover).
- [components/layout/TopBar.tsx](frontend/src/components/layout/TopBar.tsx): switched `ml-sidebar` → `ml-16` to match the new rail width and dropped its z-index from `z-40` → `z-30` so the sidebar's backdrop (`z-40`) and panel (`z-50`) layer correctly over it.
- **Why**: user requested a slideover sidebar with only icons visible when closed. Replaces the previous always-expanded 260px sidebar.

### Changed — 2026-05-01 — Project Gantt view: full-screen, section-grouped, drag-editable

- [pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx): rewrote to mirror the Asana-style layout in the List view.
  - **Section grouping**: pulls `useProjectSections` and synthesizes a `type: "project"` row per section (auto-spanning min(start)…max(end) of its tasks). Tasks inside link via `project: "sec-{id}"`. A `(No section)` group catches tasks without a section.
  - **Subtasks**: rendered immediately after their parent within the section, name prefixed with `↳ ` so the indentation reads visually. Orphan subtasks (parent dateless or in another section) still show under their own section.
  - **Editable**: `onDateChange` calls `useUpdateTask` with `startDate` + `dueDate` (ISO) so dragging the bar moves the window and dragging an edge resizes it. Section rows have `isDisabled: true`. Errors surface in a banner above the chart.
  - **Click name → editor**: removed the bar-`onSelect` handler so dragging a bar only reschedules. Clicking the **task name** in the left list opens `TaskFormModal`; clicking a **section name** toggles its collapse. Custom `TaskListHeader` + `TaskListTable` props render the left column with our typography and explicit click targets, so the timeline bar is drag-only.
  - **Dates column**: the custom list now has two sub-columns (`Name` 200px + `Dates` 110px). Dates render as `dd Mmm – dd Mmm` (e.g. `01 May – 05 May`) in `font-mono`. Section rows display the auto-spanning range of their child tasks.
  - **Resizable columns**: each column header has a `ResizeHandle` (1px wide, full-height, `cursor-col-resize`) at its right edge. Drag to resize Name (clamped 120–480px) or Dates (clamped 80–240px). The total list width is fed back into `listCellWidth={(name+dates)/3}px` so the chart panel still starts in the right place. Width state lives in `ProjectGantt` so it survives HMR but resets on remount — fine for now.
  - **Collapsible sections**: `onExpanderClick` toggles `hideChildren` per section row, mirroring the List view's collapse behavior.
  - **View-mode toggle**: Day / Week / Month buttons in the toolbar.
  - **Dynamic columnWidth**: a `ResizeObserver` on the chart wrapper feeds its width into a `useMemo` that estimates column count from the task date range (days for Day mode, weeks for Week, months for Month) and computes `columnWidth = floor((containerWidth - listWidth - 16) / cols)`, clamped to a per-mode minimum (Day 36 / Week 60 / Month 120). Whenever the viewport, sidebar, or column widths change, the chart fills the available canvas instead of leaving whitespace on the right.
  - **Fills the screen**: outer container is `h-[calc(100vh-220px)] min-h-[420px] flex flex-col`, with the Gantt itself inside `flex-1 overflow-auto`. No more squashed 200px box.
  - Custom `TooltipContent` shows title + start–end range in the project's typography.
  - Bar fill still tinted by priority (LOW/MED/HIGH/URGENT); progress bar still keyed off status (TODO 0% / IN_PROGRESS 50% / DONE 100%).
- **Why**: previous Gantt was a fixed-height widget with no sectioning and no editing. User asked for an Asana-style Gantt that fills the canvas, groups by section, and supports drag/resize for rescheduling.

### Changed — 2026-05-01 — Project List view: due date column → start–due range

- [pages/views/ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx): renamed the rightmost column from "Due date" to "Start – Due" and widened it from `140px` to `220px` (header + `TaskRow` + `SubtaskRow` + "Add subtask…" grid templates) to fit two formatted dates side-by-side.
- New `fmtRange(start, end)` helper renders all four cases: `May 1 – May 20` (both), `May 1 – —` (start only), `— – May 20` (due only), `—` (neither). Replaces the per-row `fmt(task.dueDate)` call site for both top-level and subtask rows.
- `overdue` styling logic unchanged — still keyed on `dueDate < today && status !== "DONE"`. The "· OVERDUE" suffix on top-level rows is preserved.
- **Why**: surfaces both ends of a task's window in the List view (matches how Gantt/Timeline already render). User saw a single date and asked to expose the range.

### Added — 2026-05-01 — Project List view (Asana-style sections + tasks + subtasks)

- **Schema** ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)) and migration `20260501040932_add_sections`:
  - New `Section` model: `id`, `projectId` FK with `onDelete: Cascade`, `name`, `position Int @default(0)`, `createdAt`. Index `@@index([projectId])`.
  - `Task.sectionId Int?` (nullable) with `onDelete: SetNull` — deleting a section keeps the tasks but clears the link. Tasks with `sectionId === null` render under a synthetic "(No section)" group at the bottom.
  - Back-relation `Project.sections: Section[]`.
  - Index `@@index([sectionId])` on `tasks` for filter performance.
- **Backend routes**:
  - New [routes/sections.ts](backend/src/routes/sections.ts): `PATCH /sections/:id` (rename / reorder), `DELETE /sections/:id`. TAM/ADMIN only.
  - [routes/projects.ts](backend/src/routes/projects.ts): added nested `GET /projects/:id/sections` (any auth) and `POST /projects/:id/sections` (TAM/ADMIN). New section auto-positions to `max(position) + 1`. `createTaskSchema` accepts optional `sectionId`. `GET /projects/:id/tasks` and `POST /projects/:id/tasks` responses include `section: { id, name, position }`.
  - [routes/tasks.ts](backend/src/routes/tasks.ts): `updateTaskSchema` accepts `sectionId`; PATCH connects/disconnects via Prisma relation update. Response includes section.
  - [app.ts](backend/src/app.ts): mounted `/sections` router.
- **Frontend types + hooks** ([lib/queries.ts](frontend/src/lib/queries.ts)):
  - New `Section` type. `Task` now has `sectionId` and `section: { id, name, position } | null`.
  - `CreateTaskInput` / `UpdateTaskInput` accept `sectionId`.
  - New hooks: `useProjectSections`, `useCreateSection`, `useUpdateSection`, `useDeleteSection`. `queryKeys.projectSections(id)`.
- **Project detail tab** ([pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)) — added **List** as the first tab. Default landing route changed from `kanban` to `list` ([App.tsx](frontend/src/App.tsx) project-detail `<Route index>`).
- **ProjectList page** ([pages/views/ProjectList.tsx](frontend/src/pages/views/ProjectList.tsx)) — Asana-style grouped table (matches user's reference screenshot):
  - Toolbar: "Add task" (creates a top-level task with no section) and "Add section" (inline form), task/section counts on the right.
  - Column headers: `# / Name / Assignee / Due date` (with a chevron column for subtask expand).
  - Sections render as collapsible blocks (chevron toggle) with rename (inline form) and delete buttons (TAM/ADMIN, with confirm). Each section ends with an inline "Add task..." button that opens `TaskFormModal` with `initialSectionId` pre-set.
  - Tasks: clickable round status checkbox (toggles DONE/TODO via existing `useUpdateTask` optimistic update), title click opens `TaskFormModal` in edit mode, subtask count badge.
  - Subtasks render indented under the parent (expand chevron only enabled when subtasks exist). Inline "Add subtask…" button per expanded task opens `TaskFormModal` with `initialParentTaskId` + same `initialSectionId`.
  - Overdue due dates display in red bold (matches Kanban + Timeline overdue rule).
  - "(No section)" synthetic group catches tasks without a section assignment so legacy tasks remain visible.
- **TaskFormModal** ([components/TaskFormModal.tsx](frontend/src/components/TaskFormModal.tsx)) — added a **Section** dropdown field in the right sidebar (between Parent task and Labels). Accepts `initialSectionId` in create mode for inline-from-section flows.

### Added — 2026-05-01 — Customers tab + customer mapping & filtering

- **Schema** ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)) and migration `20260501035712_add_customer_model_and_link_projects`:
  - New `Customer` model: `id`, `name @unique`, `contactName?`, `contactEmail?`, `industry?`, `website?`, `notes? @db.Text`, `createdAt`. Back-relation `projects: Project[]`.
  - `Project.customerId Int? @map("customer_id")` with `onDelete: SetNull` — linking a project to a customer is **required at the API/UI layer**, but the column is **nullable in the DB** so existing pre-customer projects survive the migration without a backfill. Index `@@index([customerId])` for filter performance.
  - Why nullable in DB but required in app: enforces "customer required" for new/edited projects from day one without forcing a synthetic "Unassigned" customer to backfill historical rows. Pre-existing rows show `—` until reassigned through the UI.
- **Backend routes**:
  - New [routes/customers.ts](backend/src/routes/customers.ts): `GET /customers` (auth, includes `_count.projects`), `GET /customers/:id` (with linked projects), `POST/PATCH/DELETE` (TAM/ADMIN).
  - [routes/projects.ts](backend/src/routes/projects.ts): `createProjectSchema` makes `customerId` **required** via `z.number().int().positive()` (returns 400 `validation_error` when missing). `updateProjectSchema` accepts optional `customerId`. `GET /projects?customerId=` filters; response includes `customer: { id, name }`. `GET /projects/:id` includes the customer.
  - [routes/tasks.ts](backend/src/routes/tasks.ts): cross-project `GET /tasks` accepts `?customerId=` (filters via `project.customerId`); response shape adds `project.customer` so cards/rows can show the customer name.
  - [app.ts](backend/src/app.ts): mounted `/customers` router (before `/projects`).
- **Frontend types + hooks** ([lib/queries.ts](frontend/src/lib/queries.ts)):
  - New `CustomerSummary`, `CustomerDetail` types. Existing `ProjectSummary`/`ProjectDetail` gain `customerId` and `customer: { id, name } | null`. `TaskWithProject.project` includes the nested customer.
  - `TasksFilter` and new `ProjectsFilter` add `customerId`. `useProjects(filter)` accepts a customer filter; `useTasks(filter)` likewise.
  - New hooks: `useCustomers`, `useCustomer(id)`, `useCreateCustomer`, `useUpdateCustomer`, `useDeleteCustomer`. `queryKeys.projects` is now a function of filter (still backwards-compatible for invalidations via the `["projects"]` prefix).
  - `CreateProjectInput.customerId` is now **required** in the TS type (matches backend).
- **New components** under [frontend/src/components/](frontend/src/components/):
  - `CustomerFormModal.tsx` — create/edit modal with name (required), contact name/email, industry, website, notes.
- **Customers page** at [frontend/src/pages/Customers.tsx](frontend/src/pages/Customers.tsx) — card grid, "New Customer" CTA (TAM/ADMIN), inline Edit + Delete on each card with confirm prompt, "N projects" link that deep-links to `/projects?customerId=<id>`. Empty state with CTA.
- **ProjectFormModal** ([frontend/src/components/ProjectFormModal.tsx](frontend/src/components/ProjectFormModal.tsx)) — added **required Customer dropdown** as a top-level field (above SA + Status). Empty-state hint when no customers exist ("Create one in the Customers tab first"). Submit blocks with "Customer is required." until selected.
- **Projects page** ([frontend/src/pages/Projects.tsx](frontend/src/pages/Projects.tsx)) — new customer filter toolbar; reads `?customerId=` from URL (so customer cards' "N projects" links land filtered). Each project card now shows the customer name with a `business` icon. Header subtitle reflects active filter ("Filtered by customer: …").
- **Tasks page** ([frontend/src/pages/Tasks.tsx](frontend/src/pages/Tasks.tsx)) — added Customer filter to the toolbar (alongside status/priority/assignee).
- **Sidebar** ([frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)) — new **Customers** nav item with `business` icon, placed between Projects and Tasks. [TopBar.tsx](frontend/src/components/layout/TopBar.tsx) adds the "Customers" page title.
- **Routing** ([App.tsx](frontend/src/App.tsx)) — registered `/customers` inside the AuthGuard'd Shell.

### Added — 2026-05-01 — Enterprise PM features (priority, dueDate, subtasks, labels, comments, full task editor)

- **Schema** ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)) and migration `20260501033712_add_task_pm_fields_subtasks_labels_comments`:
  - New `enum Priority { LOW MEDIUM HIGH URGENT }`.
  - `Task`: **renamed `endDate` → `dueDate`** (column `end_date` → `due_date`); added `priority Priority @default(MEDIUM)` (existing rows backfill to MEDIUM via column default); added `parentTaskId Int?` self-FK with `onDelete: Cascade`; added `labels Label[]` (Prisma implicit M2M) and `comments Comment[]`. Indexes on `priority`, `dueDate`, `parentTaskId`.
  - New `Label` model: project-scoped (`@@unique([projectId, name])`), `color` defaults `#0058be`. Cascades on project delete.
  - New `Comment` model: append-only, `body @db.Text`, `authorId` FK to User, indexes on `taskId` and `authorId`.
  - Back-relations on `User.comments` and `Project.labels`.
- **Backend routes**:
  - [routes/projects.ts](backend/src/routes/projects.ts): `createTaskSchema` accepts `priority`, `dueDate` (renamed), `parentTaskId`, `labelIds`. `GET /projects/:id/tasks` includes `assignedTo`, `labels`, `_count.{subtasks,comments}`. New nested `GET/POST /projects/:id/labels`.
  - [routes/tasks.ts](backend/src/routes/tasks.ts): `updateTaskSchema` mirrors create with the same renames + `labelIds` (uses Prisma `set:` to replace label set). New `GET /tasks` cross-project endpoint with filters `?status=, ?priority=, ?assignedToId=, ?labelId=, ?overdue=true, ?topLevel=true`. New `GET/POST /tasks/:id/comments` (any auth user with task visibility can post).
  - New [routes/labels.ts](backend/src/routes/labels.ts): `PATCH /labels/:id` and `DELETE /labels/:id` for TAM/ADMIN.
  - [app.ts](backend/src/app.ts): mounted `/labels` router. Exported `projectVisibilityFilter` from projects.ts so the cross-project tasks endpoint shares the role-scope rule.
- **Frontend types + hooks** ([lib/queries.ts](frontend/src/lib/queries.ts)):
  - Added `Priority`, `Label`, `Comment`, `TaskWithProject`, `TasksFilter` types.
  - `Task` now has `priority`, `dueDate`, `parentTaskId`, `labels[]`, `_count.{subtasks,comments}`.
  - New hooks: `useTasks(filter)`, `useProjectLabels`, `useCreateLabel`, `useDeleteLabel`, `useComments`, `useAddComment`. `useUpdateTask` extended to invalidate cross-project task queries on settle.
- **Reusable components** under [frontend/src/components/](frontend/src/components/):
  - `PriorityBadge.tsx` — colored dot pill (LOW/MEDIUM grey, HIGH amber, URGENT red).
  - `AssigneeAvatar.tsx` — initials circle with `title` tooltip; size variants xs/sm/md; renders dashed-border placeholder for unassigned.
  - `LabelChip.tsx` — pill with auto-contrasted (black/white) text against `label.color`.
  - `LabelPicker.tsx` — multi-select with inline "+ Label" affordance (name + 8-color palette swatch).
  - `CommentThread.tsx` — fetches/renders comments with author avatar + relative timestamps; textarea+Post form with optimistic refetch.
  - `TaskFormModal.tsx` — the new core editor (3-col layout, `max-w-3xl`). Modes: `create` (takes `initialStatus` + `initialParentTaskId`) and `edit` (takes `task`). Sidebar fields: status (edit only), priority, start/due dates (`<input type="date">`), assignee, parent task, labels. Inline subtask checklist + `<CommentThread>` render only in edit mode. Validates title-required + dueDate≥startDate + cannot self-parent.
- **Removed**: `components/AddTaskInline.tsx` — replaced by `TaskFormModal` in create mode (Linear/Jira-style full-form path).
- **Kanban** ([pages/views/ProjectKanban.tsx](frontend/src/pages/views/ProjectKanban.tsx)): cards now show label chips (max 3 + `+N`), priority badge + assignee avatar, **red overdue due-date pill** when `dueDate < today && status !== "DONE"`, subtask progress (`✓ 2/5`) and comment count (`💬 3`). Clicking a card (without dragging) opens the editor. Top-level tasks only on the board; subtasks live inside their parent's edit modal. "+ Add task" per column opens the modal in create mode with that column's status.
- **Timeline** ([pages/views/ProjectTimeline.tsx](frontend/src/pages/views/ProjectTimeline.tsx)): sort by startDate → dueDate → priority. Each row shows priority badge, label chips, assignee avatar, overdue-styled date range. Subtasks render as an indented checklist under the parent. Click title → editor.
- **Gantt** ([pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx)): all `endDate` references renamed to `dueDate`. Tasks with subtasks render as `gantt-task-react` `type: "project"`; subtasks as nested `type: "task"` referencing the parent. Bar background tinted by **priority** (URGENT=red, HIGH=amber, MEDIUM=blue, LOW=slate).
- **Tasks tab** ([pages/Tasks.tsx](frontend/src/pages/Tasks.tsx)): replaced placeholder with a real cross-project list. Filter toolbar (status / priority / assignee / overdue / top-level only) and dense sortable table (ID · Title · Project · Labels · Priority · Assignee · Due · Status). Click row → opens editor. Project name links to its detail page.
- **Reports** ([pages/Reports.tsx](frontend/src/pages/Reports.tsx)): added second pie chart for **priority distribution** (per-project scope only — global priority counts aren't on `/overview`). Status pie remains.
- **Vite types**: created [frontend/src/vite-env.d.ts](frontend/src/vite-env.d.ts) with `declare module "*.css"` to silence the TS warning on the `gantt-task-react/dist/index.css` side-effect import.

### Changed — 2026-05-01

- **Backend container restart required after Prisma migration** (in addition to the named-volume `npm install` quirk noted earlier): `tsx watch` reloads on source changes but holds the previously-imported `PrismaClient` in memory. After `prisma migrate dev` regenerates `node_modules/@prisma/client`, the running process keeps using the old client and queries the renamed-away column (`tasks.end_date`) until the container is restarted. Workflow: `docker compose exec backend npx prisma migrate dev …` → `docker compose restart backend`.

### Added — 2026-05-01 — Project management (create/edit, Kanban, Gantt, Timeline, Reports)

- **Frontend deps** ([frontend/package.json](frontend/package.json)):
  - `@dnd-kit/core@^6.1.0` — Kanban drag-and-drop primitive (lighter and more accessible than `react-beautiful-dnd`).
  - `gantt-task-react@^0.3.9` — Gantt visualization (React 18 compatible; chosen over `frappe-gantt-react` for active maintenance).
  - `recharts@^2.13.0` — pie chart for Reports.
- **Reusable UI primitives**:
  - [components/Modal.tsx](frontend/src/components/Modal.tsx) — portal-based modal with backdrop click + Escape close, body-scroll lock.
  - [components/StatusChip.tsx](frontend/src/components/StatusChip.tsx) — `ProjectStatusChip` and `TaskStatusChip` factored out for reuse across Overview, Projects, Kanban, Timeline, Reports.
  - [components/ProjectFormModal.tsx](frontend/src/components/ProjectFormModal.tsx) — used for **both** create and edit. Validates name+saId required; ADMINs can pick the TAM, otherwise the current user is auto-assigned. Calls `POST /projects` or `PATCH /projects/:id` via TanStack Query mutations.
  - [components/AddTaskInline.tsx](frontend/src/components/AddTaskInline.tsx) — per-Kanban-column "Add task" input that POSTs to `/projects/:id/tasks` with the column's status pre-set.
- **Data hooks** in [lib/queries.ts](frontend/src/lib/queries.ts):
  - Queries: `useUsers`, `useProjects`, `useProject(id)`, `useProjectTasks(id)`, `useOverview` (existed).
  - Mutations: `useCreateProject`, `useUpdateProject`, `useCreateTask`, **`useUpdateTask`** (with optimistic update + rollback on error — drives Kanban drag-drop snappiness).
  - Centralized `queryKeys` for invalidation.
- **Projects page** ([pages/Projects.tsx](frontend/src/pages/Projects.tsx)) — replaces the placeholder. Card grid (3-up at xl, 2-up at sm), each card click-throughs to `/projects/:id`. "+ New Project" button (visible to TAM/ADMIN) opens the modal. Empty state with primary CTA.
- **Project detail** ([pages/ProjectDetail.tsx](frontend/src/pages/ProjectDetail.tsx)) now fetches the real project, renders a header (SOLV-ID + name + status chip + description + TAM/SA/task count), and exposes an **Edit project** button (TAM/ADMIN) that opens the same `ProjectFormModal` in edit mode. Tabs (Kanban / Gantt / Timeline) pass the project to nested views via `Outlet context`.
- **Kanban view** ([pages/views/ProjectKanban.tsx](frontend/src/pages/views/ProjectKanban.tsx)):
  - Three columns: To Do · In Progress · Done.
  - `@dnd-kit/core` `DndContext` + `useDraggable` (cards) / `useDroppable` (columns). PointerSensor with 6px activation distance to avoid accidental drags on click.
  - Drop fires `useUpdateTask.mutate({ id, patch: { status } })` → `PATCH /tasks/:id` → optimistic UI update, rollback on server error, refetch on settle.
  - Stakeholders see read-only cards; TAM/ADMIN can drag and use the inline "Add task" input per column.
- **Gantt view** ([pages/views/ProjectGantt.tsx](frontend/src/pages/views/ProjectGantt.tsx)) — `gantt-task-react` rendering tasks with `startDate`/`endDate`. Progress derived from status (`TODO=0, IN_PROGRESS=50, DONE=100`). Bar color tinted by status. Tasks lacking dates show an explanatory empty state instead of being silently dropped.
- **Timeline view** ([pages/views/ProjectTimeline.tsx](frontend/src/pages/views/ProjectTimeline.tsx)) — chronological vertical timeline (sorted by `startDate`, then id) with status dot indicator and inline status pills (TAM/ADMIN can change status directly per PRD §4.6).
- **Reports page** ([pages/Reports.tsx](frontend/src/pages/Reports.tsx)) — replaces the placeholder. Scope selector (All projects / specific project), `recharts` donut PieChart of TODO/IN_PROGRESS/DONE counts, plus a side panel with Completion % (= done / total), in-progress count, and backlog count. Uses `useOverview` for global stats and `useProjectTasks(id)` for per-project drill-down.

### Changed — 2026-05-01

- **Frontend `node_modules` volume re-synced**: after adding new deps, ran `docker compose exec frontend npm install` to populate `solvro_frontend_node_modules`, then `docker compose restart frontend` so Vite re-optimized. Same workflow as backend, documented earlier under Iteration 3 caveats.

### Added — 2026-05-01 — Overview tab

- **Sidebar** ([frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx)) now leads with **Overview** (`dashboard` icon), matching the first item in the [solvro_command_center_updated_branding](UI Design/solvro_command_center_updated_branding/code.html) mockup. Order: Overview → Projects → Tasks → Reports.
- **Overview page** at [frontend/src/pages/Overview.tsx](frontend/src/pages/Overview.tsx). Four stat cards (Projects total, Tasks In Progress, Tasks To Do, Completion %) plus two panels: Recent Projects (last 5 by `updatedAt`, click-through to `/projects/:id`) and Recent Tasks (last 5). Loading skeleton + error state included.
- **Backend `GET /overview`** ([backend/src/routes/overview.ts](backend/src/routes/overview.ts)) — JWT-gated, role-scoped (ADMIN/STAKEHOLDER see all; TAM filters by `tamId`; SA by `saId`). Returns `{ projectCount, projectStatusCounts, taskCounts, recentProjects, recentTasks }`. Wired into [app.ts](backend/src/app.ts) router mount table.
- **TanStack Query hook** [`useOverview`](frontend/src/lib/queries.ts) — first proper data layer; types for `OverviewResponse`, `OverviewProject`, `OverviewTask` defined in the same file.

### Changed — 2026-05-01

- **Default authenticated landing route** is now `/overview` (was `/projects`). Updated in [App.tsx](frontend/src/App.tsx) (root `<Route index>`) and [Login.tsx](frontend/src/pages/Login.tsx) (`from` fallback).
- **TopBar title** ([frontend/src/components/layout/TopBar.tsx](frontend/src/components/layout/TopBar.tsx)) now reflects the active route segment (Overview / My Projects / Tasks / Reports) instead of the static "My Projects" label.

### Added — 2026-05-01

- **CHANGELOG.md** created as the canonical change-history / configuration document source.
- **CLAUDE.md** updated with a "Changelog discipline (mandatory)" section so future Claude Code sessions in this repo append to CHANGELOG.md on every code/config/schema/dep/Docker change.

### Fixed — 2026-05-01

- **Backend no longer crashes on async route errors.** The first `prisma.user.findUnique` against an unmigrated database threw a `PrismaClientKnownRequestError`; Express 4 does not auto-forward async rejections, so the unhandled rejection killed the Node process and `tsx watch` did not restart it. Added [`express-async-errors`](https://www.npmjs.com/package/express-async-errors) (^3.1.1) and imported it as the first line of [backend/src/app.ts](backend/src/app.ts:1) so async errors flow into the central [errorHandler](backend/src/http/errors.ts).
- **Database initialized.** Ran first migration (`migrations/20260501024905_init`) inside the backend container — `public.users` and friends now exist; seed and temp-admin script work end-to-end.

### Changed — 2026-05-01

- **Backend container `node_modules` workflow noted.** The `solvro_backend_node_modules` named volume in [docker-compose.yml](docker-compose.yml) shadows the image's `/app/node_modules`, so adding a new dep requires either `docker compose exec backend npm install` (to populate the volume) or removing the volume before `docker compose up --build`. Documented here because the symptom (`Cannot find package …`) is non-obvious.

### Added — 2026-05-01 — Iteration 3: Full Docker stack + temp admin

- **Express backend (TAM-side).** New `backend/src/` tree:
  - Boot: [index.ts](backend/src/index.ts), [app.ts](backend/src/app.ts), [env.ts](backend/src/env.ts) (Zod-validated; requires `JWT_SECRET` ≥ 32 chars), [prisma.ts](backend/src/prisma.ts) singleton, [logger.ts](backend/src/logger.ts) pino instance.
  - Middleware: [http/auth.ts](backend/src/http/auth.ts) (JWT sign/verify, `requireAuth`, `requireRole`), [http/errors.ts](backend/src/http/errors.ts) (`HttpError`, error mapper for `ZodError` and `Prisma.PrismaClientKnownRequestError`), [http/validate.ts](backend/src/http/validate.ts) (Zod source validator).
  - Routes: [health](backend/src/routes/health.ts), [auth](backend/src/routes/auth.ts) (`POST /auth/login`, `GET /auth/me`), [users](backend/src/routes/users.ts), [projects](backend/src/routes/projects.ts) (CRUD + nested `/projects/:id/tasks`, role-scoped visibility), [tasks](backend/src/routes/tasks.ts) (PATCH/DELETE).
  - Mount order: helmet → cors → pino-http → json → routes → 404 → error mapper.
- **Backend deps** (in [backend/package.json](backend/package.json)): `express`, `cors`, `helmet`, `jsonwebtoken`, `pino`, `pino-http`, `zod` + `@types/*` for express/cors/jsonwebtoken. Scripts: `dev` (`tsx watch src/index.ts`), `build`, `start`, `dev:admin`.
- **Temporary admin script** at [backend/scripts/create-temp-admin.ts](backend/scripts/create-temp-admin.ts). Idempotent upsert keyed on `admin@solvro.local`; sets username `admin`, password `admin` (bcrypt). Run via `docker compose exec backend npm run dev:admin`. **Not** part of the seed — `npm run db:seed` reverts it to `password123`.
- **Docker images** for backend and frontend:
  - [backend/Dockerfile](backend/Dockerfile) — Node 20 slim, `openssl` for Prisma engines, `prisma generate` baked at build, `npm run dev` (tsx watch) at runtime.
  - [frontend/Dockerfile](frontend/Dockerfile) — Node 20 slim, Vite dev server with `--host 0.0.0.0` so the container is reachable from the host.
  - [.dockerignore](backend/.dockerignore) for both projects.
- **Compose stack** ([docker-compose.yml](docker-compose.yml)): added `backend` (port 3000, `depends_on: postgres { condition: service_healthy }`) and `frontend` (port 5173, `depends_on: backend`). Source bind-mounted on both for HMR; named volumes `solvro_backend_node_modules` / `solvro_frontend_node_modules` keep host/container Linux ABI separate.
- **Env additions** in [.env.example](.env.example): `JWT_SECRET`, `JWT_EXPIRES_IN` (default `8h`), `CORS_ORIGIN` (default `http://localhost:5173`), `LOG_LEVEL` (default `info`), `VITE_API_BASE_URL` (default `http://localhost:3000`).
- **Lockfiles generated** for both projects (`backend/package-lock.json`, `frontend/package-lock.json`) — required by `npm ci` inside both Dockerfiles.

### Added — 2026-05-01 — Iteration 2: Frontend scaffold

- **Vite + React 18 + TypeScript** under [frontend/](frontend/). Build: `vite`, `@vitejs/plugin-react`. Routing: `react-router-dom@6`. Server state: `@tanstack/react-query@5`. Styling: `tailwindcss@3`, `postcss`, `autoprefixer`.
- **Tailwind theme** ([frontend/tailwind.config.ts](frontend/tailwind.config.ts)) ports the [DESIGN.md](DESIGN.md) frontmatter as canonical tokens (primary `#0058be`, full surface palette, radius scale, Space Grotesk + Inter, sidebar/context-panel widths). **Deliberately diverges** from the static mockups under [UI Design/](UI Design/), whose inline Tailwind configs use defaults — see [CLAUDE.md](CLAUDE.md) "Known design drift."
- **Auth plumbing**:
  - [src/lib/api.ts](frontend/src/lib/api.ts) — typed `fetch` wrapper, attaches `Authorization: Bearer <jwt>` from `localStorage`, throws `ApiError` with `status` + parsed body.
  - [src/lib/auth.tsx](frontend/src/lib/auth.tsx) — `AuthProvider` + `useAuth`. `login()` POSTs to `${VITE_API_BASE_URL}/auth/login`; persists `token` and `user` in `localStorage`.
  - [src/components/AuthGuard.tsx](frontend/src/components/AuthGuard.tsx) — gates protected routes, redirects to `/login` preserving `from`.
- **Layout shell**: [Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx) (260px dark slate, links: Projects / Tasks / Reports), [TopBar.tsx](frontend/src/components/layout/TopBar.tsx) (search + user menu with logout), [Shell.tsx](frontend/src/components/layout/Shell.tsx) composes them around `<Outlet />`.
- **Routes** ([App.tsx](frontend/src/App.tsx)):
  - Public: `/login`.
  - Protected: `/projects`, `/projects/:id` (tabbed `ProjectDetail` with nested `/kanban`, `/gantt`, `/timeline`), `/tasks`, `/reports`. `/` redirects to `/projects`.
- **Pages**: [Login.tsx](frontend/src/pages/Login.tsx) (email + password form, distinguishes invalid-creds vs network errors), placeholder bodies for [Projects](frontend/src/pages/Projects.tsx), [Tasks](frontend/src/pages/Tasks.tsx), [Reports](frontend/src/pages/Reports.tsx), [ProjectDetail](frontend/src/pages/ProjectDetail.tsx), and the three view stubs under [pages/views/](frontend/src/pages/views/).
- Project detail explicitly supports **Kanban + Gantt + Timeline** as nested routes (Table view dropped per scope correction).

### Added — 2026-05-01 — Iteration 1: Foundation

- **Postgres 15 service** in [docker-compose.yml](docker-compose.yml) — `postgres:15-alpine`, named volume `solvro_pgdata`, healthcheck via `pg_isready`, env-driven via `${POSTGRES_USER}` etc.
- **Prisma schema** at [backend/prisma/schema.prisma](backend/prisma/schema.prisma):
  - Enums: `RoleName` (`SA / TAM / ADMIN / STAKEHOLDER`), `ProjectStatus` (`PLANNING / ACTIVE / ON_HOLD / COMPLETED / CANCELLED`), `TaskStatus` (`TODO / IN_PROGRESS / DONE`).
  - Models: `Role`, `User`, `Project`, `Task`, `Blueprint`. **`Blueprint.payload` is `Json @db.JsonB`** per PRD §6.4. **`@@unique([projectId, version])`** on `Blueprint` enforces the version-control requirement (PRD §4.3). Cascade delete from `Project → Tasks/Blueprints`. Snake-case via `@map`/`@@map`. Indexes on FK + status columns.
  - Added `User.passwordHash` beyond PRD §6.4 because seeded users need a credential to be usable with the planned JWT auth.
- **Seeder** at [backend/prisma/seed.ts](backend/prisma/seed.ts) — idempotent `upsert` of 4 Roles (with default permission arrays) and 6 Users (1 ADMIN, 2 SA, 2 TAM, 1 STAKEHOLDER). Dev password `password123`, bcrypt-hashed (cost 10). Wired via `prisma.seed` field in [backend/package.json](backend/package.json).
- **Backend project skeleton**: [backend/package.json](backend/package.json) (Prisma, bcrypt, dotenv, tsx, TypeScript), [backend/tsconfig.json](backend/tsconfig.json) (strict, NodeNext, ES2022), [backend/.env.example](backend/.env.example).
- **Repo hygiene**: root [.env.example](.env.example), [.gitignore](.gitignore) (node_modules, .env, dist, OS/editor cruft), [CLAUDE.md](CLAUDE.md) orienting future Claude to the spec sources, target architecture, and DESIGN.md ↔ mockup drift.
