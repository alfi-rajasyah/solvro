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
