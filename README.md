# Solvro — Solution-to-Project Lifecycle Engine

Solvro is a project management platform for **Technical Account Managers (TAMs)** and **Solution Architects (SAs)**. It covers the full solution-to-project lifecycle in one high-density workspace and replaces three tools: a task tracker, a shared notes document, and a standalone opportunity tracker.

## Overview

The lifecycle Solvro is built around:

1. An SA tracks an **opportunity** through the sales pipeline — six stages from Assessment to Waiting Response on a drag-and-drop board — and closes it as Won, Lost, or Cancelled.
2. A **won deal hands off** in one step: Solvro creates the delivery project from the deal inside a single database transaction, pre-filled and linked both ways.
3. A TAM runs the delivery — Kanban, Gantt, risks, and **daily notes** per project and per customer — and rolls the week up into **Weekly Sync** tables for Monday's read.
4. Leadership reads the **Executive** dashboard: every project across every TAM, plus pipeline analytics.

Everything is multi-user and permission-gated. What a person sees and can change is decided by their role's permission list, never by a hard-coded role name.

## Features

### Delivery workspace (per project)

Eight tabs under `/projects/:id`: Overview, List, Kanban, Gantt, Epics, Timeline, Risks, Services.

- **One task order, three views.** List, Kanban, and Gantt render the same manual order. A status change never moves a task's slot.
- **List** — sortable, filterable table with drag reorder, inline date-range editing, subtasks, labels, and comments.
- **Kanban** — drag-and-drop across To do / In progress / Done with per-column WIP limits (the count pill turns amber over the limit). On phones the columns become a swipeable pager with a "move to" sheet.
- **Gantt** — four zoom levels, weekend shading and Indonesian public holidays, collapsible phase rows, hard/soft dependency arrows drawn by drag, milestones, a manual critical-path flag, and a **baseline lock** that shows planned-vs-actual slip. Exports to Excel and PDF. Desktop-only; phones fall back to the List.
- **Timeline** — phase-level linear view, distinct from the task-level Gantt.
- **Phases (sections)** with colour, reorder, and duplicate; task duplicate (subtasks included); project-scoped labels.
- **Epics** — project-scoped groupings across phases with an owner, a colour, a status and a target date; a top-level task carries at most one epic (shown as a chip in every view), and the Epics tab rolls up each epic's task count and done percentage. Removing an epic unlinks its tasks and never deletes them.
- **Risk register** — category, probability × impact score, mitigation and contingency plans, open / mitigated / closed.
- **Services** — a service catalogue with assignments at both the customer and the project level, each tagged with the tools in use.
- **Header and Context panel** — the project header shows customer, dates, SA and TAM, a progress bar, and health (overdue tasks, schedule slip, open risks). The Context panel holds the baseline lock, the schedule export, and the project's **document links** (label + `http(s)` URL), which anyone with `project:write` who can see the project may edit.

### Customers, notes, and the weekly rhythm

- **Customer directory** (`/customers`) — a sortable table with each customer's AM, TAM, project count, overdue tasks, open risks, and latest weekly update. Each customer has an owning TAM, an account manager and SA of record, service assignments, its projects, and a **Links** tab of document links.
- **Daily Review** (`/daily-review`) — a weekly, per-customer page: dated notes per project, operations notes per customer for issues outside any project, an explicit "Mark reviewed" stamp, and actionable overdue-task and open-risk lists. One request loads the whole page.
- **Weekly Sync** (`/weekly-sync`) — two tables for Monday's read. **Mid-week**: one row per highlight with its own risk and action. **Reflection**: one row per achievement with its outstanding issue, lesson learned, next-week focus, and manager decision (rows that need a decision pin to the top). Each customer carries a Green / Amber / Red health and a Draft / Done status. Both forms draft themselves from the week's notes, and "Copy as table" puts the rows on the clipboard as TSV and HTML for pasting into a document.
- **Recent notes** — a seven-day feed of project and operations notes on the Overview page.
- Notes are internal. No note reaches an export, a search result, or a guest link. Project and customer document links are internal too: they never reach a guest link or an export.

### Collaboration

- **Project members** — anyone who can see a project and holds `project:write` can add members, who get the same access as the TAM except ownership changes (reassigning the TAM, customer or SA, deleting the project, and guest links stay owner-only). Assigning a task to someone who cannot see the project adds them as a member in the same transaction, and the picker says so. A one-off backfill added the active open-task assignees who were not already the TAM, the SA or the customer's owner.
- **Activity log** — every project keeps a 180-day event feed (fields changed, tasks and risks added, members and guest links) and every opportunity a feed of deal changes (stage moves, assignment, closing, handoff) that is kept for the life of the deal; note bodies are never stored. A daily job removes project events older than 180 days.
- **Notifications and @mentions** — a bell in the top bar lists what happened on the caller's own items: tasks assigned to them, comments and deal notes that @mention them, deals closed or handed off. The mention picker in task comments and deal notes offers only people who can see the item.
- **Stale-edit warning** — a task-panel save sends the field value the editor last saw; when someone else changed that field in between, the server refuses the save and a dialog shows both values with "Use theirs" / "Keep mine". Board and Gantt drags stay last-write-wins.
- **Live refresh, copy links, deep links** — list and board views refetch every 30 seconds and on focus; every task, project, customer and deal has a copyable link that opens straight to it.
- **Guest links** — a project owner shares a read-only timeline (phases, milestones, status — never tasks, notes, people or risks) through a tokenised `/share/<token>` page that needs no sign-in, with an optional label and a 7, 30 or 90 day expiry, listed and revocable from the project header. The public endpoint is rate-limited per client address and answers every failure with the same 404.

### Pipeline module (for SAs)

- **Board** (`/pipeline`) — six-stage opportunity Kanban: Assessment → Technical clarification → PoC → RFP → Delivered proposal → Waiting response. A deal's stage, sub-status (Progress / Waiting for Sales input), status tag (Hold / Delayed), and outcome (Won / Lost / Cancelled) are separate fields, so closing or parking a deal never erases the stage it reached. Drag is permission-gated; the Technical clarification → RFP jump that skips PoC asks for a reason. Each card shows the next **owner** (the client on Waiting response, else the SA) and an **idle alert** (warning / critical) computed on every read from working days since the last activity or the Sales request, against a per-stage SLA table. Each column sums its deal value and a KPI bar sits on top. **List**, **Swimlane** (PIC × stage), and **Quarter** (by request date) views share one switcher; an Active / Closed switch shows closed deals grouped by outcome with a win-rate tile and the top close reasons.
- **Opportunity detail** (`/pipeline/:id`) — stage menu, sub-status and tag actions, **Close deal** (outcome plus a reason category for Lost or Cancelled) and **Reopen**, reference links, an activity timeline with notes, win probability, lead source, and deadline. Edit and delete are gated by ownership (the deal's PIC). An unassigned deal can be claimed with **Assign PIC**. The `SALES` role reads the pipeline and answers in a deal's notes.
- **Won-deal handoff** — "Create project" on a deal closed as Won creates the delivery project, links the two records, and logs the activity in one transaction. The deal's links are not copied to the project.
- **Excel/CSV import** — template download, client-side validation preview, per-row server results, 500 rows per run, the six open stages only, and an import history in Admin.
- **Analytics** — an Overview panel plus Executive fold-ins: stage funnel, PIC leaderboard and performance table, 12-month trend, win rate, close reasons by stage, and a workload heatmap with per-PIC drill-down.

### Portfolio and leadership

- **Overview** (`/overview`) — the signed-in user's Overdue, Due this week, and Open risks tiles, projects needing attention, the portfolio calendar, recent notes, and a pipeline snapshot.
- **Projects** (`/projects`) — project cards with a progress bar, task counts, overdue and open-risk chips, a baseline marker, the date range, the TAM, and the SA.
- **Tasks** (`/tasks`, not in the sidebar) — every visible task with saved views (All open, My open, Overdue, This week, All) synced to `?view=`.
- **Executive** (`/executive`) — org-wide portfolio roll-up behind its own permission: an overdue-projects worklist, portfolio timelines for every project, and the pipeline analytics. Administrative container projects can be excluded from every roll-up.

### Platform

- **Authentication** — email/password (JWT, 8-hour default) and Google sign-in with an admin-managed domain allowlist. Unknown Google users are auto-provisioned into a zero-permission `PENDING` role until an admin promotes them. A password change ends the account's other sessions; an admin reset, deactivation, or deletion ends all of them. A role change applies to live sessions on the next request.
- **RBAC** — permission-based, with admin-managed custom roles. Built-in roles: `ADMIN`, `SA`, `SALES`, `TAM`, `STAKEHOLDER`, `PENDING`.
- **Admin** (`/admin`) — Users, Roles, Sign-in (Google client ID and allowed domains, editable without a redeploy), Projects (bulk reassign), Pipeline (import history), and iTop (connection, sync, organisation and person matching, webhook secret, actions switch).
- **Help** (`/help`) — in-app guide, one topic per page the caller can open; topics for pages the caller's permissions hide are hidden too.
- **Settings** (`/settings`) — theme, password, and the user's personal iTop token.
- **⌘K command palette** — page navigation plus search across projects, tasks, and customers, scoped to what the caller may see.
- **PWA & mobile** — installable, precached app shell, usable down to 375 px.
- **Design system** — "Technical Precision": dark-first charcoal surfaces with a single green accent, light mode included, Source Sans 3 and Material Symbols.

### iTop integration

Solvro connects to an external [iTop](https://www.itophub.io/) ITSM instance, configured once at Admin > iTop:

- **Tickets** — a customer's iTop tickets appear on that customer's page in a Tickets tab, with a Board view whose columns follow iTop's own lifecycle (New, Assigned, Pending, Resolved, Closed); dragging a card sends the matching lifecycle step to iTop, and a "New ticket" button creates a ticket directly in iTop. A task's panel can pin one iTop ticket by reference — showing its live status and an "Open in iTop" link once the ticket is in the local snapshot — or create a new ticket directly from the task, prefilled with its title and description.
- **Time** — **Utilization** (`/utilization`, the old `/work-logs` URL redirects here) shows hours per customer per week drawn from iTop's Time Tracking extension; every TAM sees their own hours, and holders of the Executive-report permission also get "By TAM" and "By customer" views. A Start/Stop timer on the ticket panel — one running timer per user, shown as a compact pill in the top bar — logs a Time Tracking entry in iTop under the user's own identity the moment it's stopped.
- **Live sync** — an optional per-install webhook secret lets iTop's own "on ticket update" trigger nudge Solvro into an immediate sync instead of waiting for the next scheduled pull.
- **Actions from Solvro** — opt-in per install (Admin > iTop) and per TAM (a personal iTop token saved in Settings): once both are on, a ticket can be assigned, set pending, resolved, closed, reopened, or given a log entry straight from Solvro's ticket panel. Every write happens under the acting TAM's own iTop identity — iTop stays the owner of what a ticket can do and who can do it.

## Architecture

### Three tiers, one Docker network

```
┌──────────────────────────────┐            ┌──────────────────────────────┐          ┌──────────────────┐
│ Frontend                     │  /api/*    │ Backend                      │          │ Database         │
│ React 18 SPA                 │───────────▶│ Express 4 + Prisma 5 (TS)    │─────────▶│ PostgreSQL 15    │
│ Vite dev server / nginx prod │  prefix    │ REST · JWT · Zod · pino      │  Prisma  │                  │
└──────────────────────────────┘  stripped  └──────────────────────────────┘          └──────────────────┘
```

**Request path.** The browser only ever calls same-origin `/api/*`. The Vite dev server (development) or nginx (production) strips the `/api` prefix and forwards the request to the backend, whose routers mount bare (`/auth`, `/projects`, …). The compiled bundle therefore contains no runtime configuration and can sit behind any TLS terminator or tunnel unchanged.

### Backend (`backend/src/`)

| Layer | Files | Role |
|---|---|---|
| Bootstrap | `index.ts`, `app.ts`, `env.ts` | `createApp()` is split from the listener for testability. Env is parsed once with Zod; the process exits on a bad config. |
| HTTP plumbing | `http/auth.ts`, `http/validate.ts`, `http/errors.ts`, `http/requestLogger.ts`, `http/rateLimit.ts`, `http/trustProxy.ts` | Bearer-token auth and permission gates, Zod validation of body / params / query, one error handler that renders every failure as `{ error, code, details }`, a request logger that redacts bearer tokens, guest-link tokens and the webhook secret, an in-memory per-client rate limiter for the public routes, and the `TRUST_PROXY` parser. |
| Routes | `routes/*.ts` | One router per resource. Every authenticated router calls `requireAuth` once at the top, then `requirePermission(...)` per mutating handler. |
| Domain helpers | `lib/visibility.ts`, `lib/pipelineAccess.ts`, `lib/pipelineSla.ts`, `lib/workingDays.ts`, `lib/portfolio.ts`, `lib/projectHealth.ts`, `lib/dailyReviewScope.ts`, `lib/taskOrdering.ts`, `lib/duplicate.ts`, `lib/dateBoundary.ts`, `lib/isoWeek.ts`, `lib/username.ts`, `lib/linkSchemas.ts` | Row-level visibility filters (see-level and owner-level), the Pipeline ownership gate, the per-stage SLA table and working-day counter behind the idle alerts, the portfolio roll-up shared by Overview and Executive, per-project health numbers, the Daily Review scope shared with the sidebar badge, dense sibling ordering for tasks, deep copy for tasks and sections, the caller-local "today" contract, the username rule, and the label + URL rule shared by deal, project, and customer links. |
| Collaboration & integrations | `lib/activity.ts`, `lib/opportunityActivity.ts`, `lib/notifications.ts`, `lib/projectMembers.ts`, `lib/shareLinks.ts`, `lib/secretBox.ts`, `lib/itop/` | Activity events and notification fan-out (assignments, @mentions, deal events) for projects and deals, the member list and the assign-adds-member rule, the allow-listed guest payload, AES-256-GCM secrets at rest (`SECRETS_KEY`), and the iTop REST client, snapshot sync, scheduler and config. |
| Data | `prisma.ts`, `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` | One shared Prisma client. Tables and columns are `@map`ped to snake_case; the TypeScript surface is camelCase. The seed upserts the six built-in roles and the auth-config singleton and creates no users. |

Security baseline: `helmet`, a CORS allowlist, a 1 MB JSON body limit, bcrypt password hashes, and structured request logging with pino. The API targets sub-200 ms responses. Page-level endpoints (Daily Review, Overview, Executive) fetch each sub-collection with one batched query keyed by the in-scope ids, so the query count stays flat as data grows.

### Frontend (`frontend/src/`)

| Layer | Files | Role |
|---|---|---|
| Routing & shell | `App.tsx`, `components/layout/` | React Router 6 routes under a persistent `Shell` (sidebar, top bar with ⌘K, and a project right-sidebar for the baseline lock and schedule export). `AuthGuard`, `AdminGuard`, `ExecutiveGuard`, `PipelineGuard`, and the generic `PermissionGuard` wrap the gated routes; the guest page `/share/:token` renders outside the shell and the auth guard. |
| Data access | `lib/api.ts`, `lib/queries.ts` | A single `apiRequest<T>` wrapper (bearer token from `localStorage`, base `/api`) and every TanStack Query hook in one module with namespaced query keys. Inline edits use optimistic updates with rollback. |
| Auth, theme, nav | `lib/auth.tsx`, `lib/theme.tsx`, `lib/navCommands.ts` | The signed-in user and `hasPermission`, the dark / light / system theme, and the single navigation catalogue that feeds both the sidebar and the command palette. |
| Pages | `pages/`, `pages/views/` | One component per route (including Help, Utilization, Settings and the guest `PublicShare`); project and pipeline sub-views live in `views/`. Titles and breadcrumbs come from `lib/routeMeta.ts`; dates render through `lib/formatDate.ts` and enum words through `lib/labels.ts`. |
| Feature components | `components/daily-review/`, `components/pipeline/`, `components/portfolio/`, `components/services/`, `components/itop/`, `components/utilization/`, `components/skeletons/` | Feature UIs (the iTop ticket board reuses the vendored Kanban engine). Board and analytics math lives in plain `.ts` modules (`boardLogic.ts`, `kpi.ts`, `analytics.ts`, `importParse.ts`, …) with unit tests beside them; components only render. |
| Drag engines | `components/reui/`, `components/gantt-v2/`, `components/kanban-v2/` | The Gantt, Kanban, Sortable, and Data Grid engines are vendored ReUI source (in-repo, not npm packages) on top of dnd-kit, TanStack Table, and TanStack Virtual. Solvro's adapters and commit mappers translate between engine events and the API's task contract. |
| Primitives | `components/ui/` | shadcn-style primitives built on Base UI (`@base-ui/react`). |
| Theme | `index.css` | Tailwind CSS 4, CSS-first: every token lives in two `@theme inline` blocks and dark mode is a `@custom-variant`. There is no `tailwind.config`. |

The PWA layer (vite-plugin-pwa / Workbox) precaches the app shell and serves `/api/*` network-only, so cached data can never outlive a session.

### Data model (`backend/prisma/schema.prisma`)

- **Identity** — `User` (with a `tokenVersion` that revokes older sessions), `Role` (a JSON permission list), `AuthConfig` (Google client ID and allowed domains, one row).
- **Delivery** — `Project` (TAM, optional SA, customer, status, WIP limits, baseline lock), `Section`, `Epic`, `Task` (status, priority, dates, milestone and critical-path flags, baseline dates, parent for subtasks, dense `position`, optional epic and iTop ticket reference), `TaskDependency` (HARD / SOFT), `Label`, `Comment` (with mentioned user ids), `Risk`, `ProjectReview`, `ProjectLink`.
- **Collaboration** — `ProjectMember`, `ActivityEvent` (scoped to exactly one project or one opportunity), `Notification`, `ShareLink` (SHA-256 of the token only).
- **iTop** — `ItopConfig` (one row: base URL, sealed application token and webhook secret, sync state, timezone, actions switch), `ItopTicket` (the local snapshot), `ItopTimeEntry`; `Customer` maps to an iTop organisation and `User` to an iTop person, user and sealed personal token.
- **Customers & services** — `Customer`, `CustomerLink`, `Service`, `CustomerService`, `ProjectService`.
- **Notes & weekly rhythm** — `ProjectNote`, `CustomerNote`, `WeeklyUpdate` with child `WeeklyHighlight` and `WeeklyAchievement` rows.
- **Pipeline** — `Opportunity` (stage, `subStatus` with `waitingInputSince`, `statusTag`, `outcome` with a reason category and note, `closedAt`, `wonAt`, `lastActivityAt`, PIC, deal value, win probability, optional link to the handed-off `Project`), `OpportunityActivity`, `OpportunityLink`, `PipelineImportLog`.

### Authorization model

- A sign-in returns a JWT whose payload is `{ sub, ver }` only. On every request `requireAuth` loads the account: it must exist, be active, and hold the token's `ver` (`User.tokenVersion`), else `401` (`token_revoked`, `account_disabled`, or `unauthenticated`). Role and permissions are read from the database on each request, never from the token. `*` is the wildcard that satisfies every check and is what makes a role an admin.
- **Permissions** — `project:view-all`, `project:read`, `project:write`, `task:read`, `task:write`, `pipeline:view`, `pipeline:create`, `pipeline:edit_own`, `pipeline:edit_all`, `pipeline:delete_own`, `pipeline:delete_all`, `report:executive`.
- **Built-in roles** — `ADMIN` = `*`. `TAM` = project read/write + task read/write. `SA` = project read + pipeline view / create / edit-own / delete-own. `SALES` = pipeline view. `STAKEHOLDER` = project read (only the projects it is attached to). `PENDING` = nothing. The seed upserts these permission lists on every start.
- **Project visibility** (`lib/visibility.ts`) — `project:view-all` sees everything. Everyone else sees a project where they are the TAM, the SA, the owning TAM of its customer, or a member. **Ownership** is narrower: only the TAM, the customer's owner, or a view-all user may reassign the TAM, customer or SA, delete the project, or manage guest links — a member or the SA gets `403 owner_only`. A **customer** is visible when the caller owns it, when nobody owns it, or when it has a visible project. A customer's owner (`tamId`) can be changed only by its current owner, on an unowned customer, or by a view-all user.
- **Directory reads need a permission.** `GET /users`, `GET /customers`, and `GET /customers/:id` need `project:read` or `pipeline:view`; `GET /users` returns a `pipelineAccess` flag, never a permission list. A `PENDING` account gets `403`.
- **Hidden means 404.** A resource outside the caller's visibility answers `404 not_found`, not `403`, so its existence is not revealed. A `customerId` sent as a body field answers `400 customer_not_found` instead.
- **Pipeline ownership** (`lib/pipelineAccess.ts`) — `pipeline:edit_all` / `delete_all` act on any deal. `edit_own` / `delete_own` act only on a deal whose PIC is the caller. A deal with no PIC is locked for every write except **assign**, which an `edit_own` holder may use to claim it.
- **Executive is org-wide by design.** `report:executive` is itself the grant, so the visibility filter is not applied to that report.

## API

The backend is a JSON REST API. Routers mount without an `/api` prefix; the frontend's proxy adds and strips it. Every route except `GET /health`, `POST /auth/login`, `GET /auth/google/config`, `POST /auth/google`, the guest view `GET /public/share/:token` (rate-limited, uniform 404) and the iTop nudge `POST /webhook/itop` (secret header, body ignored) needs an `Authorization: Bearer <jwt>` header.

### Conventions

- **Validation** — every body, params, and query object is parsed with a Zod schema declared at the top of the route file. A failure returns `400 validation_error` with the flattened Zod issues in `details`.
- **Errors** — always `{ error, code, details? }`. Prisma "record not found" maps to `404 not_found`, a unique-constraint hit maps to `409 conflict`, and anything unexpected is logged and returns `500 internal_error`.
- **Dates** — calendar-only columns (note dates, week starts, deadlines, request dates) travel as plain `yyyy-MM-dd` strings, never instants. Task start and due dates stay ISO instants. Routes that compute "overdue" or "this week" accept an optional `today=yyyy-MM-dd` query (the caller's local day) and fall back to the server's UTC day.
- **Partial saves** — `PATCH` routes and the weekly-update `PUT` follow one rule: a field that is present replaces, a field that is omitted stays, and an empty list clears.
- **Caps** — `GET /tasks` returns at most 200 rows, search returns 8 hits per group, and the Pipeline import takes at most 500 rows per call.

### Endpoints

| Mount | Endpoints | Gate |
|---|---|---|
| `/health` | `GET /` | public |
| `/auth` | `POST /login`, `GET /google/config`, `POST /google`, `GET /me`, `POST /change-password` | sign-in routes public; the rest any signed-in user |
| `/users` | `GET /` — user directory for assignee and PIC pickers | `project:read` or `pipeline:view` |
| `/overview` | `GET /?today=` — project and task counts plus the caller's portfolio rows; `GET /badges` — the sidebar's pending Daily Review count | signed in, visibility-scoped |
| `/notes` | `GET /recent?today=` — the last seven days of project and operations notes | `project:read`, visibility-scoped |
| `/daily-review` | `GET /?week=YYYY-Www&today=` — the whole Daily Review page in one payload: customers, projects, notes, overdue tasks, open risks, review stamps, weekly updates | `project:read`, visibility-scoped |
| `/search` | `GET /?q=` — projects, top-level tasks, and customers; notes are never searched | signed in, visibility-scoped |
| `/holidays` | `GET /?year=` — Indonesian public holidays for the Gantt | signed in |
| `/customers` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `PUT /:id/services`, `GET` / `POST /:id/notes`, `PATCH` / `DELETE /:id/notes/:noteId`, `GET /:id/weekly-updates`, `PUT /:id/weekly-updates/:weekStart`; `GET` / `POST /:id/links`, `PATCH` / `DELETE /:id/links/:linkId` | list and detail `project:read` or `pipeline:view`; other reads `project:read`; writes `project:write`; owner change owner-only |
| `/projects` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/baseline`, `PUT /:id/services`; nested `GET` / `POST` for `tasks`, `sections`, `risks`, `notes`, `dependencies`, `labels`; `PATCH` / `DELETE /:id/notes/:noteId`; `POST /:id/reviews`, `DELETE /:id/reviews/:reviewDate`; `GET` / `POST /:id/epics`; `GET` / `POST /:id/members`, `DELETE /:id/members/:userId`; `GET` / `POST /:id/share-links`, `DELETE /:id/share-links/:linkId`; `GET` / `POST /:id/links`, `PATCH` / `DELETE /:id/links/:linkId`; `GET /:id/activity` | reads visibility-scoped; writes `project:write` (`task:write` for dependencies); share links owner-only |
| `/epics` | `GET /:id`, `PATCH /:id`, `DELETE /:id` | read visibility-scoped; writes `project:write` |
| `/notifications` | `GET /`, `GET /unread-count`, `POST /read-all`, `POST /:id/read` | signed in, own rows only |
| `/tasks` | `GET /` (filters `status`, `priority`, `assignedToId`, `labelId`, `customerId`, `overdue`, `open`, `dueFrom`, `dueTo`, `topLevel`, `today`; `sort` = `position` or `due`; total in `X-Total-Count`), `PATCH /:id` (fields, status, labels, reorder, re-parent, move between sections), `DELETE /:id`, `POST /:id/duplicate`, `GET` / `POST /:id/comments` | writes `task:write` |
| `/sections` | `PATCH /:id`, `POST /:id/duplicate`, `DELETE /:id` | `project:write` |
| `/labels`, `/dependencies` | `PATCH /:id`, `DELETE /:id` | `task:write` |
| `/risks` | `PATCH /:id`, `DELETE /:id` | `project:write` |
| `/services` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` | writes `project:write` |
| `/opportunities` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/move`, `POST /:id/close`, `POST /:id/reopen`, `POST /:id/assign`, `DELETE /:id`, `POST /:id/handoff`, `POST /import`, `GET /imports`; `GET` / `POST /:id/activities`, `GET /:id/activity` (the structured event feed); `GET` / `POST /:id/links`, `PATCH` / `DELETE /:id/links/:linkId` | `pipeline:view` to read, `pipeline:create` to create or import, the ownership gate for edit / move / delete / links |
| `/reports` | `GET /executive?today=` — org-wide portfolio rows | `report:executive` |
| `/itop` | `GET /status`, `GET /daily`, `GET /services`, `GET /customers/:id/tickets`, `GET /customers/:id/contacts`, `GET /tickets/:id`, `GET /tickets/by-ref/:ref`, `POST /refresh`; writes `POST /tickets`, `POST /tickets/:id/actions`, `POST /tickets/:id/log`, `POST /tickets/:id/time` | reads `project:read` + customer visibility; writes `task:write` and the caller's own iTop token |
| `/itop/me` | `GET` / `PUT` / `DELETE /token` — the personal iTop token | `GET` any signed-in user; `PUT` / `DELETE` `task:write` |
| `/utilization` | `GET /?week=YYYY-Www&scope=` (`me`, `tam` or `customer`) — hours per customer per week from iTop time entries | `project:read`; the `tam` and `customer` scopes need `report:executive` |
| `/admin/itop` | `GET` / `PATCH /settings`, `POST` / `DELETE /webhook-secret`, `POST /test`, `POST /sync`, `GET /organizations`, `GET /customers`, `PATCH /customers/:id`, `POST /customers/automatch`, `GET /persons`, `POST /persons/match` | `*` (admin wildcard) |
| `/webhook` | `POST /itop` — iTop's "on update" trigger nudges an incremental sync | public; `X-Solvro-Webhook-Secret` header, global rate limit |
| `/public/share` | `GET /:token` — the guest timeline payload | public; per-client rate limit, uniform 404 |
| `/admin` | `GET` / `POST /users`, `PATCH /users/:id/role`, `PATCH /users/:id/deactivate`, `POST /users/:id/reset-password`, `DELETE /users/:id`; `GET` / `POST /roles`, `PATCH` / `DELETE /roles/:id`; `GET` / `PATCH /settings/auth`; `GET /projects`, `PUT /projects/reassign` | `*` (admin wildcard) |

### Key flows

**Sign-in.** `POST /auth/login` takes an email and password; `POST /auth/google` takes a Google ID token, which the server verifies against the admin-configured client ID and allowed domains, creating a `PENDING` user on first sight. Both return a JWT and the user's profile. The frontend stores the token in `localStorage` and sends it as a bearer header on every call; a `401` on any authenticated call signs the user out. `POST /auth/change-password` bumps `tokenVersion` and answers with a new token, so only the session that changed the password stays signed in.

**Task ordering.** Top-level tasks share one dense `0..n-1` `position` per project; subtasks share one per parent. A `PATCH /tasks/:id` that carries `position`, `parentTaskId`, or `sectionId` moves the task inside a single transaction: the old sibling list closes its gap and the new one opens a slot, so List, Kanban, and Gantt always agree. Baseline dates are not accepted on this route.

**Baseline.** `POST /projects/:id/baseline` copies every task's live start and due date into its baseline columns and stamps who locked the plan and when; `{ "clear": true }` resets both. The Gantt draws the baseline ghost bars, and the Daily Review reports the slip in days against it.

**Stage moves.** `POST /opportunities/:id/move` with `stage` and `stageOrder` re-packs both the old and the new column to dense order. The Technical clarification → RFP jump needs a `reason` (`400 skip_reason_required`), and a closed deal cannot move. Entering Waiting response clears the sub-status; leaving it restores Progress. Every real change writes an activity note and bumps `lastActivityAt`; a same-column reorder does not, so it never resets the idle alert.

**Close and reopen.** `POST /opportunities/:id/close` takes `{ outcome, reasonCategory?, reason? }`; Lost and Cancelled need a reason category, Won refuses one and stamps `wonAt`, and the stage stays. A second close answers `409 already_closed`. `POST /opportunities/:id/reopen` clears the outcome, except on a deal that became a project (`409 handed_off`).

**Won-deal handoff.** `POST /opportunities/:id/handoff` takes the same body as `POST /projects`. It needs the deal-edit gate plus `project:write`, a deal closed as Won, and no existing link. Inside one transaction it creates the project, links the deal with a conditional update that also settles the race between two concurrent handoffs, and writes an activity entry. Conflicts answer `409 not_won` or `409 already_linked`.

**Pipeline import.** The dialog parses the workbook in the browser for a preview. `POST /opportunities/import` re-validates every row on the server, matches the PIC by username, creates the valid rows, and writes one `PipelineImportLog` with valid / skipped / invalid counts, which the Admin Pipeline tab lists through `GET /opportunities/imports`.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind CSS 4 (CSS-first), TanStack Query 5, TanStack Table 8, TanStack Virtual 3, React Router 6, Base UI, dnd-kit, Recharts, date-fns, react-day-picker, ExcelJS + jsPDF (Gantt export), SheetJS `xlsx` (import dialog, lazy-loaded), vite-plugin-pwa |
| Backend | Node.js 22, Express 4, TypeScript 5, Prisma 5, Zod, jsonwebtoken + bcrypt, google-auth-library, helmet, pino, date-holidays |
| Database | PostgreSQL 15 |
| Testing | Vitest — backend with supertest against a real `_test` database, frontend pure-logic modules; Playwright — end-to-end on desktop (1440×900) and mobile (iPhone 13 viewport) |
| CI/CD | GitHub Actions — typecheck of all three packages (the frontend suite runs twice, once under `TZ=Asia/Jakarta`), the backend suite on a Postgres service, Playwright desktop and mobile on a built production-shaped stack; GHCR images publish from `main` only after CI passes, and on `v*` tags |
| Deployment | Docker Compose, prebuilt GHCR images (`solvro-backend`, `solvro-frontend`), one-shot `setup.sh` installer |

## Getting Started

### Production deployment

On a server with Docker Engine and the Docker Compose plugin:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/alfi-rajasyah/solvro/main/setup.sh)
```

The script prompts for an admin email and password and for the host ports (website `80`, API `3000`, both bound to `127.0.0.1` unless you choose otherwise; Postgres stays private). It generates `POSTGRES_PASSWORD`, `JWT_SECRET`, and `SECRETS_KEY` (the secrets-at-rest key for integration tokens — rotating it invalidates every stored token), writes `~/solvro/docker-compose.yml` and `~/solvro/.env`, pulls the GHCR images, starts the stack, and creates the admin. The backend container runs `prisma migrate deploy` and the seed on every start.

Every input can come from the environment instead of a prompt:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=change-me BIND_ADDR=0.0.0.0 FRONTEND_PORT=8090 \
  bash <(curl -sSL https://raw.githubusercontent.com/alfi-rajasyah/solvro/main/setup.sh)
```

To upgrade, re-run the same command: the script detects the existing install, pulls new images, and restarts without prompting.

### Local development

Prerequisites: Node.js 22 and PostgreSQL 15 (a local instance or a `postgres:15-alpine` container).

```bash
# Backend
cd backend
cp .env.example .env          # DATABASE_URL; set SECRETS_KEY (openssl rand -base64 32); add JWT_SECRET (32+ characters)
npm ci
npx prisma migrate dev        # apply migrations and generate the client
npm run db:seed               # six built-in roles, no users
npm run dev                   # API on http://localhost:3000

# Frontend (second terminal)
cd frontend
npm ci
npm run dev                   # app on http://localhost:5173, /api proxied to :3000
```

Create the first admin. The seed creates no users, so there is no default login:

```bash
cd backend
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=change-me npm run admin:create
```

Google sign-in is configured inside the app (Admin → Sign-in), not through environment variables.

To fill a development database with a readable demo workspace (customers, projects, tasks, notes, and Pipeline deals, dated relative to today), run the demo seed. It **empties every data table first** and refuses to run in production or without the confirmation variable:

```bash
cd backend
DEMO_SEED_CONFIRM=wipe npx tsx scripts/seed-demo.ts
```

### Run the production-shaped stack locally

`ci/docker-compose.ci.yml` is the stack CI tests against: built images, nginx on `:8080`, the API on `:3300`.

```bash
cp ci/.env.ci.example ci/.env   # set POSTGRES_PASSWORD and JWT_SECRET
docker compose --env-file ci/.env -f ci/docker-compose.ci.yml up --build
```

### Tests

```bash
cd backend && npm test                          # Vitest + supertest
cd frontend && npm run typecheck && npm test    # tsc + Vitest
cd e2e && npm ci && npx playwright install chromium && npm test   # desktop + mobile
```

The backend test setup refuses any database whose name does not end in `_test`, then migrates it and truncates every table before the run. Point `DATABASE_URL` at a dedicated database such as `solvro_test`. Playwright defaults to `BASE_URL=http://localhost:8080` (the stack above) and signs in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment, so create that admin with `admin:create` first. `npm run test:desktop` and `npm run test:mobile` run one project.

## Repository Layout

| Path | Contents |
|---|---|
| `backend/` | Express API (`src/routes`, `src/lib`, `src/http`), Prisma schema and migrations, seed, `scripts/` (`create-admin.ts`; `import-velora.ts`, the one-time copy from the previous standalone opportunity tracker; `normalize-day-dates.ts`; `seed-demo.ts`, the destructive demo-workspace loader), Vitest suite in `test/` |
| `frontend/` | React SPA: pages and views, feature components, vendored drag engines, Base UI primitives, the CSS-first theme, and `nginx.conf` for the production image |
| `e2e/` | Playwright suite — auth, Kanban and List drag, Gantt, date picker, Daily Review, Weekly Sync, Pipeline board and forms, epics, members, activity, mentions, notifications, guest links, the iTop board, tickets and timer, Utilization, Help, search, PWA, smoke |
| `ci/` | The production-shaped compose stack GitHub Actions builds and tests |
| `.github/workflows/` | `ci.yml` (merge gate) and `docker-publish.yml` (GHCR release) |
| `setup.sh` | One-shot production installer and updater |
| `CHANGELOG.md` | Running record of every change, Keep a Changelog style |

## Branches and releases

Work branches off `develop` and merges back by pull request; `develop` is the integration branch. `main` is the release branch: a merge into `main` runs CI, and only a green run publishes the `latest` images that `setup.sh` pulls. `v*` tags publish versioned images directly.
