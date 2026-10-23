# Application review 2026-10-22 — report, self-challenge and remediation backlog

Archived record of the pre-release audit run on `develop` @ `1f0145a` and the fixes that followed (see `CHANGELOG.md` entries dated 2026-10-22). Code comments cite findings as `F-xx` and backlog items as `B-xx` against this file. The categorised copy lives in the Google Sheet "Solvro Application Review 2026-10-22" (tracking only; this file is canonical).

---

# Solvro — Pre-release Application Review

Date: 2026-10-22 · Branch reviewed: `claude/bold-brown-sbr7cz` @ `1f0145a` (same head as `develop`) · Mode: read-only audit. No repository file was changed.

Method: full read of the backend bootstrap, auth, HTTP, public and secret-handling layers; four parallel source audits (core routes, iTop/Pipeline, frontend, schema + UX); typecheck, unit, backend integration, production build and Playwright runs against a throwaway local stack; screenshots at 1440 px and 375 px. Every finding below was verified by reading the cited lines; "suspected" marks the few that were not fully traced.

---

## A. Executive summary

Solvro is in better shape than most internal tools of its size (113 k lines, 1,150 backend + 958 frontend tests, a closed external pentest, documented guardrails). The auth core, visibility helpers, secret handling, public routes and iTop write path are sound. Typechecks, unit tests, integration tests and the production build all pass.

It is **not yet ready for an unattended production release**. Three problems need fixing first:

1. **Data loss by script.** `setup.sh` deletes the Postgres volume whenever `~/solvro/.env` is missing, with no prompt (F-01).
2. **Admin security edits silently revert.** The seed rewrites the six built-in roles' permissions on every container start (F-02).
3. **A zero-permission account can read internal notes and post comments** once a TAM adds it as member or assignee, because project/task reads and comment writes are visibility-scoped but not permission-gated (F-03). This is the same class as pentest finding H1.

Below those sit a set of P2 items: no login rate limit, unpatched `express`/`proxy-addr`/`xlsx` advisories, no browser security headers, no React error boundary, a cross-account cache leak on shared browsers, three race/consistency bugs in ordering and deal assignment, and an iTop sync that reports success when time entries failed.

Overall grade: **B**. Fix the three P1 items and the first five P2 items (about 2–3 engineer-days) and this is releasable for an internal, tunnel-fronted deployment.

---

## B. Architecture overview

| Layer | Stack | Notes |
|---|---|---|
| Frontend | React 18, Vite 5, Tailwind v4 (CSS-first), TanStack Query 5, react-router 6, Base-UI, vendored ReUI (Gantt, Kanban, Data Grid, Filters), vite-plugin-pwa | Single SPA; one 2.1 MB main chunk; JWT in `localStorage`; all server state in one 5.3 k-line `queries.ts` |
| Backend | Express 4, Prisma 5, PostgreSQL 15, Zod, pino, helmet, bcrypt, jsonwebtoken, google-auth-library | Stateless; JWT `{sub, ver}` + per-request account lookup; permission-based RBAC; visibility filters as a single source of truth |
| Integrations | Google Identity (ID-token verify), iTop REST (read with app token, write with per-user personal token), iTop webhook nudge | Secrets sealed with AES-256-GCM (`SECRETS_KEY`) |
| Ops | Docker images on GHCR, `setup.sh` one-shot deploy (nginx → Express, Postgres private), GitHub Actions CI (typecheck, backend vitest on Postgres, Playwright desktop+mobile), publish gated on green CI on `main` | Plain HTTP; TLS expected from a tunnel/reverse proxy in front |

Data flow: browser → nginx `/api/*` → Express routers (`requireAuth` → `requirePermission` → visibility filter → Prisma). Public surface is exactly two routes (guest share view, iTop webhook), both outside the authed routers and rate-limited.

Strengths: clear invariants in `CLAUDE.md` and enforced by `gates.sh`; visibility logic centralised with a tested pure twin; secrets never serialised; uniform 404 on hidden resources; migrations match the schema exactly (`prisma migrate diff` returned an empty migration); honest, dated engineering history in `docs/`.

Weaknesses: permission gates are applied on writes only; several multi-step writes rely on app-level ordering rather than DB constraints or transactions; the frontend has no error boundary, no request timeouts and no code splitting; CHANGELOG.md is 890 KB and `docs/ISSUES.md` 213 KB, which makes "what is still open" hard to see.

---

## C. Findings ranked by severity

Confidence: **C** = confirmed by reading the cited code (and by test/run where stated); **S** = suspected.

### P1 — High

**F-01 · `setup.sh` deletes the production database volume on any run without `~/solvro/.env` · C**
`setup.sh:187-191` branches on `[[ -f "$ENV_FILE" ]]`; the fresh-install path runs `docker compose down` and `docker volume rm solvro_pgdata` (`setup.sh:376-379`) with no confirmation. Trigger: an operator re-runs the script from a different user account, after a home-directory move, after restoring a server without `.env`, or with `DEPLOY_DIR` on a fresh host that reuses the same Docker daemon. Impact: total loss of all project, customer, pipeline and iTop data. Fix: before removing the volume, check `docker volume inspect solvro_pgdata`; if it exists, abort unless `FORCE_WIPE=1` is set and print the backup command that is already in the script's epilogue. Verification: run the script twice with `.env` removed between runs on a scratch host.

**F-02 · Seed overwrites built-in role permissions on every container start · C**
`backend/prisma/seed.ts:38-42` upserts each built-in role with `update: { permissions: ROLE_PERMISSIONS[roleName] }`; the prod compose command (`setup.sh:184`) and CI compose run `prisma db seed` before every boot. The sibling `authConfig` upsert correctly uses `update: {}` (line 48-52). Trigger: an admin removes `task:write` from TAM, or adds `project:view-all` to STAKEHOLDER (the UI and the seed comment both invite this); the next restart or image pull silently reverts it. Impact: security hardening and access grants disappear without an audit trail; the pentest remediation itself relied on this behaviour, so it is partly intentional but undocumented and surprising. Fix: `update: {}` for roles, or seed only when the row is missing, and add a one-line note in Admin › Roles that built-in roles are code-owned if the reset is kept. Test: a backend test that edits a role, re-runs `main()` from seed, and asserts the edit survives.

**F-03 · Project/task reads and comment writes are visibility-scoped but not permission-gated · C**
`projectsRouter`, `tasksRouter`, `epicsRouter`, `overviewRouter`, `searchRouter` apply only `router.use(requireAuth)` (`routes/projects.ts:157`, `tasks.ts:212`, `epics.ts:103`, `overview.ts:20`, `search.ts:26`); `requirePermission` is used on writes only. `POST /tasks/:id/comments` (`tasks.ts:639-648`) has no permission check at all. `ensureAssigneeIsMember` (`lib/projectMembers.ts:297-306`) and `POST /projects/:id/members` (`projectMembers.ts:114-129`) accept any `active` user, including PENDING. Trigger: a TAM assigns a task to, or adds as member, a freshly auto-provisioned Google user (role PENDING, zero permissions). That user then reads the project, every task, every INTERNAL note (`GET /projects/:id/notes`, `projects.ts:867`), all comments, and can post comments and @mentions. A STAKEHOLDER (`project:read`) can likewise comment. Impact: reopens the pentest H1 class for the one role the H2 fix was meant to exclude; INTERNAL notes guardrail bypass via membership. Fix: `requireAnyPermission("project:read", "task:read")` on the read routers and `requirePermission("task:write")` (or `project:read`) on comment creation; refuse PENDING in member/assignee validation. Test: extend `pentestRemediation.test.ts` with a PENDING member hitting `GET /projects/:id/notes` and `POST /tasks/:id/comments`.

### P2 — Medium

**F-04 · No rate limit or lockout on `POST /auth/login` and `POST /auth/google` · C**
`createRateLimiter` is used only by the share route (`grep createRateLimiter src` → `routes/publicShare.ts` only). bcrypt cost 10 slows guessing but does not stop it; a user that does not exist skips `bcrypt.compare` (`auth.ts:43-46`), so response time reveals account existence, and the `google_only` code (`auth.ts:35-41`) confirms it outright. Trigger: the API port is published directly (`setup.sh` compose, `BACKEND_PORT` on `BIND_ADDR`) and `BIND_ADDR=0.0.0.0` is a documented option. Impact: credential stuffing against a known email list. Fix: reuse `createRateLimiter` keyed on IP + email (e.g. 10/min), add a dummy `bcrypt.compare` on the unknown-user path, and consider folding `google_only` into the generic 401 after a successful password check only.

**F-05 · Vulnerable production dependencies with fixes available · C**
Backend (`npm audit --omit=dev`): `proxy-addr 2.0.7` critical (GHSA-jqcg-44mw-7w3h, IP spoofing via IPv4-mapped IPv6 trust subnet — directly relevant because `TRUST_PROXY` uses subnet names and the share rate limiter keys on `req.ip`), `qs 6.15.3` moderate ×2, `js-yaml` high (transitive, likely dev-only path), `express 4.22.2` → 4.22.3 fixes the first two. Frontend: `xlsx 0.18.5` high ×2 with **no npm fix** and it parses user-supplied workbooks (`PipelineImportDialog.tsx:150-157`); `dompurify` ≤3.4.16 high (via jspdf; only the `html()` path uses it, which Solvro does not call); `fflate`, `uuid` moderate (via exceljs/jspdf). Fix: `npm install express@4.22.3` and `npm audit fix` inside the container; move `xlsx` to the SheetJS CDN 0.20.x tarball or parse imports server-side; re-run `npm audit` in CI with `--audit-level=high` as a gate.

**F-06 · SPA is served without browser security headers while the token lives in `localStorage` · C**
`frontend/nginx.conf` sets no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` (except on `/share/`), or `Strict-Transport-Security`; `helmet()` only covers API responses. `src/lib/api.ts` reads the bearer from `localStorage["solvro.token"]`. The codebase has zero `dangerouslySetInnerHTML`/`innerHTML` and all link hrefs are scheme-checked, so no XSS sink was found — but any future one, or a compromised third-party script, yields an 8-hour account token with no mitigation. Fix: add a CSP (`default-src 'self'; script-src 'self'; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; img-src 'self' data: https://lh3.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, and HSTS once TLS terminates in front. Longer term, move the token to an `HttpOnly` cookie.

**F-07 · No React error boundary: any render exception blanks the whole app · C**
`grep ErrorBoundary|componentDidCatch src` → 0. `main.tsx:25-37` mounts `<App/>` with no boundary; unguarded non-null assertions on server dates exist (`ProjectOverview.tsx:193,612`, `Tasks.tsx:290` `dayFromIso(...)!`). Trigger: one malformed row or a chunk-load failure after a deploy. Impact: white page, no recovery path except a manual reload. Fix: wrap the root and the `Shell` outlet in a boundary that shows "Something went wrong — reload" and logs the error.

**F-08 · `logout()` does not clear the React Query cache · C**
`src/lib/auth.tsx:208-217` clears token, user and iTop-timer keys only; `queryClient.clear()` is never called (only one `removeQueries` in `queries.ts:1566`). Trigger: user A signs out (or is 401'd), user B signs in within `gcTime` (5 min) on the same tab. Impact: B sees A's projects, overview, notifications from cache until refetch; queries with `staleTime: 30_000` do not refetch at all. Server-side visibility still holds, so this is a client-side cross-account leak on shared machines. Fix: `queryClient.clear()` in `logout` and when the signed-in user id changes.

**F-09 · Deal claim race lets an `edit_own` holder overwrite another SA's claim · C**
`routes/opportunities.ts:1094-1141`: `assertCanAssignOpportunity` runs on the pre-lock snapshot; inside the transaction only `before.picId === pic.id` is re-checked. Two SAs clicking Claim on the same unassigned deal: the second transaction sees PIC = A and overwrites to B. The handoff route (`:1268-1285`) shows the correct conditional-update pattern. Fix: re-run `assertCanAssignOpportunity(req.user!, before)` after the lock, or `updateMany({ where: { id, picId: current.picId } })` and 409 on count 0. The same TOCTOU shape, with lower impact, exists in PATCH/move/close/delete (`:725-726, 853-857, 944-949, 1174-1178`).

**F-10 · Task/section/epic reorder is O(n) sequential UPDATEs with no list-level lock · C**
`lib/taskOrdering.ts:47-49, 81-83, 134-136`, `sections.ts:63-65, 109-111`, `epics.ts:76-78` issue one `tx.*.update` per sibling, unconditionally; `PATCH /tasks/:id` locks only the moved row (`tasks.ts:360`). The sections duplicate route already raises its transaction budget to 30 s for this (`sections.ts:237-243`), against the sub-200 ms requirement in `backend/CLAUDE.md`. Two users moving different tasks in the same project interleave writes and leave duplicate/skipped positions (tolerated by `orderBy position, id`, but drift accumulates). Related: dependency cycle check outside the transaction (`projects.ts:1136-1178`, two concurrent inserts can form a cycle) and section/epic position computed by `aggregate(_max)` before `create` without a transaction (`projects.ts:663-675, 738-756`). Fix: one `UPDATE … FROM (VALUES …)` per re-pack, skip unchanged rows, and `SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE` at the top of every ordering/dependency transaction.

**F-11 · iTop sync reports success when the time-entry pass failed · C**
`lib/itop/sync.ts:888-909`: `syncTimeEntries` returns its error in `timeEntryResult.error`; `syncTickets` logs it and then calls `writeConfigResult(startedAt, true, nonFatalNote, full)` — `lastSyncOk` stays `true` and `lastSyncError` carries only a skipped-rows note. Trigger: TimeSpent class unreadable by the app token, OQL rejected, profile change. Impact: Admin › iTop shows green, Utilization serves a stale snapshot indefinitely with `syncedAt` advancing. Fix: fold `timeEntriesError` into `lastSyncError` and set `lastSyncOk: false` (or add a dedicated column).

**F-12 · `POST /admin/itop/test` pairs the stored application token with a caller-supplied `baseUrl` · C**
`routes/itopAdmin.ts:423-436`: `baseUrl = body.baseUrl ?? config.baseUrl`, `token = body.appToken ?? open(config.appTokenEnc)`; `client.ts:161-169` then sends `Auth-Token: <plaintext>` to that host. `PATCH /settings { baseUrl }` (`:316`) likewise repoints every TAM's personal write token on their next action. Impact: an admin (or a stolen admin JWT) exfiltrates the read token and every user's write-capable iTop credential — credentials for a system Solvro's admin does not own. Gated by `requireAdmin`, hence P2. Fix: accept a body `baseUrl` on `/test` only together with a body `appToken`; when `baseUrl`'s host changes, null every `User.itopTokenEnc` and log it.

**F-13 · Email uniqueness is case-sensitive and only the Google path lowercases · C**
`schema.prisma:163` `email String @unique`; `routes/admin.ts:80, 105` and `routes/auth.ts:27` store/compare as typed; `auth.ts:125` lowercases. Trigger: admin creates `Alice@Corp.com`; Alice signs in with Google → by-email link misses → a second PENDING account; password login with `alice@corp.com` → 401. Fix: `.transform(s => s.trim().toLowerCase())` on both email schemas plus a guarded `UPDATE users SET email = lower(email)` migration.

**F-14 · An API outage during boot signs a valid user out · C**
`src/lib/auth.tsx:132-156`: any non-401 failure of `/auth/me` (15 s timeout, network error) sets `status: "unauthenticated"` while leaving the token stored; `AuthGuard` redirects to `/login`, where sign-in also fails. Fix: on non-401 failure keep the session, mark `userVerified: false`, and show a "Can't reach the server — retry" banner.

**F-15 · No request timeout on any query except `/auth/me` · C**
`src/lib/api.ts:48-58` forwards `signal` only when supplied; `grep AbortSignal.timeout src` → `auth.tsx` only. With `retry: 1` a hung backend leaves every page on its skeleton with no `isError`. Fix: default to `AbortSignal.any([callerSignal, AbortSignal.timeout(30_000)])` in `apiRequestWithHeaders`.

**F-16 · Main bundle is 2.10 MB (584 KB gzip) with no route splitting · C (measured)**
`vite build`: `assets/index-*.js` 2,102.76 kB. `grep "lazy(" src` → 0; `App.tsx:8-33` imports every page statically; `recharts` is pulled into the shell by `ProjectOverview.tsx:14` and `PipelineAnalyticsSection.tsx:39`. Export libraries are already lazy (good). `vite.config.ts:46-51` raised the PWA precache ceiling to 3 MiB to accommodate this. Impact: the login page alone ships Admin, Gantt engine, Pipeline and iTop board. Fix: `React.lazy` for Admin, Pipeline, Executive, Gantt and the two recharts consumers; `build.rollupOptions.output.manualChunks` for the vendored ReUI engines.

**F-17 · `Drawer.tsx` is a dialog without focus trap, `aria-modal`, or focus return · C**
`components/Drawer.tsx:86-87` sets `role="dialog" aria-label` only and never calls `useDialogFocus`, while `Modal.tsx:26, 48-52` does. Keyboard and screen-reader users tab out into the page behind; focus is lost on close. Fix: wire `useDialogFocus(open)`, `aria-modal="true"`, `tabIndex={-1}` exactly as Modal.

**F-18 · Kanban drag failures roll back silently · C**
`kanban-v2/SolvroKanban.tsx:398, 407, 420` call `updateTask.mutate(...)` with no `onError`; the hook's `onError` (`queries.ts:1965-1971`) only restores the cache. A 403, 409 `stale_write` or network failure snaps the card back with no message; there is no toast system in the app. The Gantt does this correctly via `setActionError` (`SolvroGantt.tsx:561-562, 616-617`), though it uses mutate-level callbacks, so only the latest of two quick drags reports (`:560-564`; `TaskPanel.tsx:245-249` documents the `mutateAsync` pattern). Fix: the same `actionError` banner in SolvroKanban, `TaskConflictDialog` on `stale_write`, and `mutateAsync().catch()` in the Gantt.

**F-19 · A fresh Google user (PENDING) lands on a blank app · C (source) / visually verified for ADMIN only**
`App.tsx:57` → `/overview`; `Overview.tsx:24-48` renders heading + date; `Sidebar.tsx:112-116` filters every nav entry by `requires`, so the sidebar is empty. The only explanation lives in Help (`lib/helpContent.ts:48`). Fix: when `user.permissions.length === 0`, render "Your account is awaiting role assignment — ask an admin" on Overview and in the Sidebar.

### P3 — Low

| ID | Finding | Where | Fix |
|---|---|---|---|
| F-20 | `DELETE /admin/users/:id` is check-then-delete outside a transaction; a note/comment created in between turns the friendly 400 into a P2003 500 | `routes/admin.ts:236-285` | wrap in `$transaction`, map P2003 → 400 |
| F-21 | `create-admin.ts` derives `username` from the email local part without the lower-case clash rule, and silently promotes an existing email's row to ADMIN | `scripts/create-admin.ts:32-48` | check clash via the same raw query; refuse existing non-admin rows without `--force` |
| F-22 | P2002 handler returns Prisma `err.meta` (column names, model) to clients | `http/errors.ts:40-46`; reachable via `POST /projects/:id/labels`, `PATCH /labels/:id`, admin user email race | drop `details` or emit `{ target }` only |
| F-23 | FK-violating ids on create surface as 500 (P2003 unmapped): `POST /projects` `tamId`/`saId`, task `assignedToId`, epic `ownerId`; `PATCH /projects/:id` connects inactive users | `projects.ts:204-214, 608, 749`; `customers.ts:53-58` has `assertTamExists`, projects does not | map P2003 → 400; shared `assertActiveUser` |
| F-24 | Global service catalogue (create/edit/delete, cascades to every customer/project link) needs only `project:write` | `routes/services.ts:28-76`; `schema.prisma:428-444` | `requireAdmin` or a dedicated permission |
| F-25 | `PUT /admin/projects/reassign` bypasses `recordActivity`/`notifyForEvent` | `admin.ts:579-607` vs `projects.ts:443-488` | route through the same transaction block |
| F-26 | `_count.tasks` includes CANCELLED, contradicting "Cancelled drops out of every total" (every other aggregate is consistent) | `projects.ts:105,169`, `customers.ts:306`, `admin.ts:568`; consumer `ProjectDetail.tsx:331` delete confirm | `tasks: { where: COUNTED_TASK_STATUS_FILTER }` or decide the delete-confirm should show raw count |
| F-27 | `POST /opportunities/:id/activities` needs only `pipeline:view` and bumps `lastActivityAt`, so any viewer clears an idle SLA flag on any deal | `opportunityItems.ts:385-409`, `pipelineSla.ts:142` | bump only when the author passes `assertCanWriteOpportunity` |
| F-28 | iTop `getAll` holds every page (incl. `public_log`/`private_log`) in memory with no response-size cap; advisory lock lives in a 10-min interactive transaction and a longer full sync loses it and overlaps the next | `lib/itop/client.ts:227-264`, `types.ts:223-227`, `sync.ts:784-932` | stream per page; `pg_try_advisory_lock` on a dedicated connection |
| F-29 | Sync stores invented values on unparseable iTop fields (`lastUpdate ?? new Date()`, `durationSeconds ?? 0`), against the "never store what iTop has not confirmed" rule | `sync.ts:431, 515` | skip the row and count it in `skipped` |
| F-30 | `SecretBoxError` from `getItopAppClient()` surfaces as raw 500 on four routes after a `SECRETS_KEY` rotation | `itop.ts:972, 1007, 1146`, `itopAdmin.ts:657` | route through `callItop`/`mapItopReadError` |
| F-31 | Validation gaps: `dealValue` has no upper bound (`1e30` → BigInt overflow → 500); `labelIds`, `assignments[]`, `tools[]` arrays have no `.max()`; `GET /opportunities/:id/activities` has no `take`; `Role.permissions` accepts any string (typos grant nothing silently); 17 route schemas use bare `z.string()` for names | `opportunities.ts:59/82`, `tasks.ts:80`, `projects.ts:125,330-337`, `customers.ts:347-354`, `opportunityItems.ts:350`, `admin.ts:338/374` | add bounds; validate permissions against a shared list |
| F-32 | Missing indexes on filtered columns: `ActivityEvent.actorId` (filtered in `lib/activity.ts:266-273`), `ShareLink.createdById`, `ProjectMember.addedById`; `GET /tasks` filters `projectId + status/dueDate` with single-column indexes only | `schema.prisma:361-363, 1012, 326, 515-520` | add the three indexes; consider `(projectId, status)` |
| F-33 | Backend container runs as root (no `USER` in the runtime stage) | `backend/Dockerfile` runtime stage | `USER node` after `npm ci` |
| F-34 | Server Zod `details` never reach form fields; modals show `err.message` only | `http/errors.ts:32-35`, `api.ts:63-76`, `ProjectFormModal.tsx:171`, `TaskFormModal.tsx:268`, `CloseDealDialog.tsx:84` | shared `fieldErrorsFrom(err)` reading `body.details.fieldErrors` |
| F-35 | No per-route `document.title` (only `PublicShare.tsx:50-53` sets it) | `lib/routeMeta.ts:92-96`, `TopBar.tsx:7` | set it in `TopBar` from `routeTitle()` |
| F-36 | Kanban keyboard sensor exists, but Gantt drag is pointer-only (bars have no `role`/`tabIndex`; only Escape is handled) | `reui/gantt/gantt-dnd.tsx:767-771, 857` | document keyboard alternatives; arrow-key nudging on a focused bar |
| F-37 | 44 placeholder-only `<input>`s with no accessible name (e.g. `LinksSection.tsx:160-166`, `TaskFormModal.tsx:397`, subtask checkboxes `:600-612`); no `prefers-reduced-motion`; no skip link; `lib/contrast.ts` `pickContrast` is dead code | various | `aria-label`s; a reduced-motion rule in `index.css`; delete or wire `contrast.ts` |
| F-38 | Reset-password temp password has no copy button although `copyText` is imported in the file | `pages/Admin.tsx:482-500` | reuse the `ProjectShare.tsx:258-271` copy affordance |
| F-39 | Offline is undetected (API is `NetworkOnly`; every query fails with a generic fetch error) | `vite.config.ts:59-65` | `online/offline` listener → banner |
| F-40 | SW `autoUpdate` with no reload prompt; `downloadTemplate` lazy import has no `.catch` → uncaught `ChunkLoadError` after a deploy | `main.tsx:14`, `PipelineImportDialog.tsx:45` | `onNeedRefresh` toast; `.catch` with a message |
| F-41 | Session expiry (8 h, no refresh) has no pre-emptive warning; an in-progress form is lost on the first 401 | `auth.tsx`, `api.ts` | decode `exp` and warn 5 min before |
| F-42 | Top-bar page title truncates to "O…"/"Pr…"/"D…" at 375 px · **visually verified** | `components/layout/TopBar.tsx` | hide the title below `md:` or give it `min-w-0 truncate` with more room |
| F-43 | Daily Review loads every task of every in-scope ACTIVE project with no `take`/status filter (org-wide for a view-all caller) · S | `dailyReview.ts:88-99` | status filter + cap |
| F-44 | `ProjectList.tsx` (1,340 lines), `Tasks.tsx`, `SolvroKanban` render unvirtualised, unmemoised rows · S | — | virtualise once projects exceed a few hundred tasks |
| F-45 | Catch-all route redirects every unknown URL to Overview with no "not found" page · **visually verified** | `App.tsx:124` | render a 404 panel with a link home; keep the redirect only for legacy paths |

---

## D. Security assessment

**Verified sound:** JWT `{sub, ver}` with per-request DB lookup and revocation on password change/reset (M3 closed); permission-based RBAC with `*` wildcard; admin self-lockout guards inside transactions; visibility filter and its pure twin tested for every arm; owner-only gates for TAM/SA/customer change, delete, guest links; uniform 404 for hidden resources; share tokens hashed, shown once, rate-limited, `no-store` + `noindex`, never access-logged; webhook secret compared in constant time, 404 when unset, two sliding windows; AES-256-GCM secret box with no plaintext in any error; request logger redacts `Authorization`, webhook secret, cookies and share tokens; no `dangerouslySetInnerHTML`; link hrefs restricted to http/https on both sides; open-redirect guard on login; OQL interpolation limited to validated ints and an escaped email; iTop writes provably use the personal token only; no token or hash in any API response.

**Confirmed gaps:** F-03 (zero-permission reads/comments via membership), F-04 (login brute force, enumeration), F-05 (vulnerable deps incl. `proxy-addr` spoofing relevant to `TRUST_PROXY`), F-06 (no CSP/headers with a `localStorage` token), F-08 (cross-account cache on shared browsers), F-12 (admin can exfiltrate iTop credentials by repointing `baseUrl`), F-22 (Prisma meta in 409 bodies), F-24 (service catalogue writable by any TAM), F-27 (SLA reset by viewers).

**Missing controls:** no audit log for admin actions beyond `customer.owner_changed`; no CSRF concern today (bearer header, `credentials: false`) but moving to cookies would need one; no TLS in the stack itself (documented, tunnel expected); no dependency scanning in CI; no security.txt/contact. Google sign-in: ID token verified server-side with audience, `email_verified` and domain allowlist — correct.

---

## E. Quality and maintainability

- **Conventions are strong and enforced** (`validate()` on every handler, `.int().positive()` on every id, `select` everywhere, `// SOLVRO PATCH` markers on vendored code, zero `as any`/`@ts-ignore` in app code). Only 56 `!` assertions, mostly on known-valid inputs.
- **Oversized modules:** `frontend/src/lib/queries.ts` 5,346 lines (all hooks, keys and DTOs), `pages/Admin.tsx` 2,010, `routes/itop.ts` 1,357, `routes/opportunities.ts` 1,335. Split `queries.ts` by domain (tasks, projects, pipeline, itop, admin) keeping the key namespaces; split Admin into one file per tab.
- **Duplicated logic:** the O(n) re-pack appears three times (`taskOrdering.ts`, `sections.ts`, `epics.ts`); the TOCTOU-then-lock pattern appears in five pipeline handlers; `assertTamExists` exists in customers but not projects.
- **Dead/inconsistent surface:** `ProjectNote.visibility` and its API field are dead (recorded); `lib/contrast.ts` is unused; `SyncSummary.timeEntriesError` was "to be surfaced later" and never was.
- **Documentation debt:** `CHANGELOG.md` is 890 KB and `docs/ISSUES.md` 213 KB with 45 dated sections; several items in ISSUES are already fixed or superseded. A quarterly prune, or moving per-phase deferred findings to `docs/archive/`, would restore signal.
- **Tests:** excellent backend integration coverage (70 files); frontend tests are pure logic only — `vitest.config.ts` runs in `node` with no component or hook tests, so `auth.tsx`, `api.ts`, the guards and every optimistic hook are untested outside Playwright.

---

## F. Performance and scalability

Measured: main JS chunk 2,102.76 kB (584.36 kB gzip), CSS 167.76 kB; backend test suite 86 s; typecheck ~50 s. No load test was run.

Likely bottlenecks (verify with `EXPLAIN ANALYZE` on a seeded database of ~50 projects × 300 tasks):
1. Reorder re-pack: N sequential `UPDATE`s per drag inside an interactive transaction (F-10) — the 30 s budget in `sections.ts:237-243` is the smoking gun.
2. Daily Review full task load (F-43) and `GET /tasks` without a composite index (F-32).
3. iTop full sync memory (F-28): every ticket with both case logs in one array.
4. First paint: 2.1 MB shell on every cold visit (F-16); PWA precache masks it on repeat visits only.
5. Per-request account lookup is one PK read — fine; `authConfig` is cached 30 s — fine.

Rate limiter and webhook windows are in-process; a second backend replica would need a shared store, which the docs already state.

---

## G. UI/UX assessment

**Visually verified (screenshots at 1440×900 and 375×812, admin user):** login page, wrong-password error banner, Overview, Projects, Customers, Daily Review, Pipeline, Utilization, Weekly Sync, Admin, Settings, Notifications, Tasks. Layouts hold at 375 px; cards stack; tables scroll inside `overflow-x-auto`; the only visual defect found is the truncated top-bar title (F-42). Console errors during the walk: one expected 401 from the pre-login `/auth/me` probe, nothing else. Project views (overview header, Gantt with week/day grid, baseline and colour-by controls, list, timeline, risks, tickets, activity) were re-captured after the suite finished and render correctly at 1440 px. One extra visually verified nit: an unknown URL (`/projects/:id/board`, a typo, or a deleted-project link) redirects silently to Overview because `App.tsx:124` maps `*` to `/` — there is no "page not found" state (F-45).

**Source-code observations (not visually verified):** F-07 (blank page on render error), F-14 (outage at boot → login), F-17 (Drawer a11y), F-18 (silent Kanban rollback), F-19 (PENDING user blank landing), F-34 (field errors), F-35 (document titles), F-36 (Gantt keyboard), F-37 (unlabelled inputs, reduced motion, skip link), F-38 (copy affordance), F-39 (offline), F-41 (session expiry).

**Good:** Modal focus management is complete; login maps every backend error code to specific copy; status chips carry text, never colour alone; every icon-only button has an accessible name; polling intervals are modest and pause in background; guest-link copy has success/failure feedback; close-deal and handoff gates mirror the backend.

---

## H. Test and build results

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend) | pass |
| Frontend typecheck | `npx tsc --noEmit` (frontend) | pass |
| Frontend unit | `npx vitest run` (frontend) | 50 files, 958 tests, all pass, 12 s |
| Backend integration | `npx vitest run` against local Postgres 16 `solvro_test` (50 migrations applied) | 70 files, 1,150 tests, all pass, 86 s |
| Production build | `vite build` | pass; main chunk 2.10 MB |
| Dependency audit | `npm audit --omit=dev` | backend 7 (1 critical, 1 high, 4 moderate, 1 low); frontend 10 (4 high, 6 moderate) — see F-05 |
| Playwright desktop | 45 specs against vite dev + tsx backend, Chromium r1194 via `executablePath` (pinned Playwright 1.61.1 wants r1228) | 172 passed, 6 failed, 10 skipped (mobile-only cases), 19.9 min. Failures: `pwa.spec.ts` ×2 (expected: manifest/SW exist only in build mode); `itop-ticket-panel.spec.ts:335` strict-mode violation — the new log text matches both the rendered entry and the still-filled textarea (test or UI bug: the textarea is not cleared after "Add entry"); `gantt-parity.spec.ts` "Delete dependency" button not visible; `itop-task-ref.spec.ts:241` "Create in iTop" button not visible; `list-dnd.spec.ts:89` cross-status reorder landed after Alpha instead of before. Re-run of those three specs (22 tests): `gantt-parity` and `itop-task-ref` passed (flaky under the dev server with retries off); `list-dnd.spec.ts:89` failed again (2/2) — reproducible here, cause not isolated (candidates: Chromium r1194 vs the pinned r1228 pointer-event timing, or a real insert-after regression in `ProjectList.tsx` `handleDragEnd`; verify on the CI stack). The `itop-ticket-panel` strict-mode failure is a test race: `TicketLog.tsx:40-66` clears the textarea only in the `onSuccess` callback, and the assertion ran before it. |
| Playwright mobile | — | not run (time; same stack) |
| Lint | — | no ESLint/Prettier config exists in the repo; nothing to run |

Environment limits: no Docker daemon in this sandbox, so the CI compose stack (`ci/docker-compose.ci.yml`) and `gates.sh` were not executed; a throwaway Postgres 16 (CI uses 15) was started under the `postgres` user instead. `pwa.spec.ts` is expected to fail against the dev server by design.

Coverage gaps worth closing (from the audits): a PENDING/`project:read`-only user against `GET /projects`, `GET /projects/:id/notes`, `GET /tasks`, `POST /tasks/:id/comments`, `GET /overview`, `GET /search`; concurrent reorder/dependency/assign (no `Promise.all` test anywhere); admin guards (`would_lock_out`, `self_demote`, role CRUD, reassign); `/admin/itop/test` with body `baseUrl` and no token; sync with a failed time-entry pass; seed re-run after a role edit; frontend `auth.tsx`/`api.ts`/guards/`useUpdateTask` rollback/cache-clear-on-logout.

---

## I. Prioritised remediation plan

**1. Fix immediately (before the next deploy) — ~1.5 days**
- F-01 volume-wipe guard in `setup.sh` (S).
- F-02 seed `update: {}` for roles + test (S).
- F-03 permission gates on read routers and comment POST; refuse PENDING as member/assignee; regression test (M). Depends on deciding whether STAKEHOLDER may comment.
- F-05 `express@4.22.3` + `npm audit fix` in the container, lock committed from the container (S).

**2. Fix before production release — ~3 days**
- F-04 login rate limit + dummy compare (S).
- F-06 nginx security headers / CSP (S; verify Google sign-in iframe and fonts still load).
- F-07 error boundary (S), F-08 cache clear on logout (S), F-14 boot-outage handling (S), F-15 default timeout (S).
- F-09 assign race + the four sibling TOCTOUs (M).
- F-11 sync result honesty (S), F-12 `/test` baseUrl/token pairing (S).
- F-13 email normalisation + migration (M; coordinate with existing mixed-case rows).
- F-17 Drawer focus trap (S), F-18 Kanban error banner (S), F-19 PENDING landing panel (S).
- F-20–F-25 admin/backend hardening (S each).

**3. Next development cycle — ~1 week**
- F-10 single-statement re-pack + project-row lock; concurrency tests (M).
- F-16 route-level code splitting (M); F-05 `xlsx` replacement or server-side parse (M).
- F-26–F-32 consistency, validation and index items (S each).
- F-34, F-35, F-37 field errors, titles, labels, reduced motion (S–M).
- Add `npm audit --audit-level=high` and a frontend component test layer (jsdom + Testing Library) to CI (M).

**4. Optional**
- F-33 non-root container, F-36 Gantt keyboard, F-38–F-44, `HttpOnly` cookie session, split `queries.ts`/`Admin.tsx`, prune `docs/ISSUES.md` and archive old CHANGELOG years, admin audit log.

Dependencies: F-06 CSP should land after F-16 only if chunk names change the asset policy (they do not with `'self'`); F-13 must precede any login rate-limit keyed on email; F-03 and the seed change (F-02) both touch role semantics and are best shipped together with a release note that existing stakeholders see nothing until attached.

---

## J. Final verdict

**Is the application ready for production?** Not yet. It is close for an internal, tunnel-fronted deployment: the core security model holds and the test base is real. The blockers are operational and policy gaps, not architectural ones.

**Three biggest risks**
1. Irreversible data loss from `setup.sh` on a run without `.env` (F-01).
2. A zero-permission account reading INTERNAL notes and posting comments through membership/assignment, plus admin role edits silently reverting on restart (F-03 + F-02 together undermine the RBAC the pentest fixes rely on).
3. Unpatched request-path dependencies (`proxy-addr`, `qs`, `xlsx`) and an unthrottled login endpoint on an API port that can be bound to all interfaces (F-04, F-05).

**What to fix first:** F-01, F-02, F-03, F-05 — about a day and a half, no design decisions needed except "may STAKEHOLDER comment".

**Evidence still missing before a confident release decision**
- A run of the full CI stack (`gates.sh`, Playwright desktop + mobile on the built nginx image) — not possible in this sandbox.
- A load/`EXPLAIN` pass on a realistic dataset for reorder, Daily Review and `GET /tasks`.
- A real iTop instance test of a full sync with case logs (memory) and a forced time-entry failure (F-11).
- Confirmation of the production TLS/tunnel topology and that `BIND_ADDR` is `127.0.0.1` in the live deployment.
- A backup/restore drill of `solvro_pgdata` (the script prints the backup command but nothing verifies restores work).


---

# Solvro — Self-challenge of the review and final remediation backlog

Date: 2026-10-22 · Companion to the report above · Still read-only: no repository file changed; nothing implemented.

## 1. Re-examination of every P1

There were no P0 findings. Each P1 was re-tested on a throwaway local stack (Postgres 16 on :5433, `tsx` backend on :3000, seeded admin). Transcripts are summarised below; the raw outputs are in the session log.

### F-01 · `setup.sh` wipes the database volume on any run without `~/solvro/.env` — **CONFIRMED, stays P1**

Reproduction (safe): `docker` and `curl` replaced by logging shims on `PATH`; `HOME` pointed at an empty directory (no `.env`); the shim answered `docker volume inspect solvro_pgdata` with an existing volume; script run under a pseudo-terminal with env-provided inputs.

Observed call sequence from the shim log:
```
DOCKER compose down
DOCKER volume rm solvro_pgdata
DOCKER compose pull
DOCKER compose up -d
```
`volume inspect` / `volume ls` were called 0 times. The script printed "Clearing any prior stack and database volume..." and continued to a successful "Solvro is running". Nothing asked for confirmation.

Challenge: the header comment documents the wipe ("Wipes any prior solvro_pgdata volume"), so this is by design for a *fresh* server. The defect is that "fresh" is inferred from a file in one user's `$HOME`, while the volume and container names are global to the Docker daemon. Running the one-liner as a different user, after a home-directory restore, or after `.env` is lost, destroys production data with no prompt and no backup. Severity stays P1 (irreversible data loss, one command, documented trigger paths).

Side note found during the reproduction: without a controlling terminal the `read … </dev/tty` for the Postgres-port prompt fails and `set -e` aborts the script even when every input is supplied by env vars (`[[ -r /dev/tty ]]` is true for the device node but the open fails). Low; recorded as B-13.

### F-02 · Seed rewrites built-in role permissions on every boot — **CONFIRMED, P1 with a stated alternative**

Reproduction:
```
UPDATE roles SET permissions='["project:read"]' WHERE role_name='TAM';   -- simulate an admin edit
before seed: ["project:read"]
npx prisma db seed
after seed:  ["project:read","project:write","task:read","task:write"]
```
The prod compose command (`setup.sh` → `npx prisma migrate deploy && npx prisma db seed && node dist/index.js`) runs that seed on every container start, so the revert happens on every restart, pull, or host reboot.

Challenge: the pentest remediation deliberately relied on this to push the STAKEHOLDER narrowing to existing installs, and the seed comment says an admin "can add it back in Admin › Roles" — which is exactly what does not survive. Two valid policies exist: (a) built-in roles are admin-editable (then the seed must not overwrite), or (b) built-in roles are code-owned (then the Roles UI must mark them read-only and the docs must say so). Either way the current state is a silent, unaudited authorization change on every deploy. Severity: P1 under policy (a); P2 under policy (b) with the UI/docs fix. The backlog item below implements (a) because it matches the shipped UI and the seed's own comment.

### F-03 · Project reads and comment writes are not permission-gated — **CONFIRMED, stays P1**

Reproduction as the seeded admin, then as a PENDING account created through `POST /admin/users` (`role: "PENDING"` is accepted on create; only role *change* to PENDING is blocked):

| Step | Actor | Call | Result |
|---|---|---|---|
| create user | admin | `POST /admin/users {role:"PENDING"}` | 201 |
| add member | admin | `POST /projects/33/members {userId:45}` | 201 |
| assign task | admin | `PATCH /tasks/235 {assignedToId:45}` | 200 |
| read INTERNAL note | PENDING | `GET /projects/33/notes` | **200**, body `"INTERNAL secret note"`, `visibility:"INTERNAL"` |
| list projects / tasks | PENDING | `GET /projects`, `GET /projects/33/tasks` | **200** |
| search | PENDING | `GET /search?q=Repro` | **200**, project and task returned |
| post comment | PENDING | `POST /tasks/235/comments` | **201** |
| control: feed | PENDING | `GET /notes/recent` | 403 (pentest H2 gate) |
| control: write | PENDING | `PATCH /tasks/235` | 403 |
| comment | STAKEHOLDER (`project:read` only, member) | `POST /tasks/235/comments` | **201** |

`GET /auth/me` for the PENDING account returned `"permissions":[]`.

Challenge: exploitation needs a TAM to add or assign the account, so the CVSS privileges-required factor is higher than pentest H1. Against that: PENDING users appear in the member/assignee pickers (`GET /users` lists them to any `project:read` holder), the UI gives no warning, and the exposure is the INTERNAL-notes guardrail plus a write (comments and @mentions that trigger notifications) from an account the product defines as "no access". Severity stays P1.

## 2. Downgrades and removals

| ID | Was | Now | Reason |
|---|---|---|---|
| F-05 dependency advisories | P2 | **P3** (hygiene) | `proxy-addr` GHSA-jqcg-44mw-7w3h only lets a client that can already reach the API choose its own rate-limit bucket on the guest route and the logged `clientIp`; `qs` issues need attacker-controlled query parsing at scale; `xlsx` runs on a file the SA opens themselves in their own browser; `dompurify` is reached only through jsPDF `html()`, which Solvro never calls. Fix is still one command for the backend and should ship, but it is not a release blocker. |
| F-16 bundle size | P2 | **P2** (kept) | Measured 2.10 MB; no exploit, but it is the single largest first-load cost and the PWA ceiling was raised to accommodate it. |
| F-19 PENDING blank landing | P2 | **P3** | After F-03 is fixed, a PENDING user sees only an empty Overview; that is confusing, not harmful. |
| F-43 Daily Review full load | P3 suspected | **removed from backlog** | Not measured; keep as a note in the review only. |
| F-44 unvirtualised lists | P3 suspected | **removed from backlog** | No evidence of a problem at current sizes. |

No finding was a false positive on re-read. Everything else keeps its severity and its cited lines (each was re-opened during this pass: F-04 `grep createRateLimiter` → share route only; F-07 `grep ErrorBoundary` → 0; F-08 `auth.tsx:208-217`; F-09 `opportunities.ts:1094-1141`; F-10 `taskOrdering.ts:47-49`, `sections.ts:237-243`; F-11 `sync.ts:888-909`; F-12 `itopAdmin.ts:423-436`; F-13 `admin.ts:80,105`, `auth.ts:27,125`; F-14 `auth.tsx:132-156`; F-15 `api.ts:44-58`; F-17 `Drawer.tsx:86`; F-18 `SolvroKanban.tsx:398,407,420`).

## 3. Areas overlooked in the first pass

- **No server-side logout.** There is no `POST /auth/logout`; "Sign out" only clears `localStorage`. A token copied before sign-out stays valid for the rest of its 8 h. Per-device revocation needs a session table; a cheap interim is a logout route that bumps `tokenVersion` (ends all of that user's sessions). Added as B-12 (P3).
- **`jwt.verify` without an explicit `algorithms` list** (`http/auth.ts:67`). With a string secret, jsonwebtoken 9 already limits to HS256/384/512 and rejects `none`, so this is hardening only. Folded into B-04.
- **No backup or restore procedure is automated or tested.** The deploy script prints a `tar` one-liner; nothing schedules it and nothing verifies a restore. Added as B-14 (ops, P2 given F-01).
- **Request logs carry full URLs including search terms** (`requestLogger.ts:40` redacts only share tokens). Search queries can contain customer names or ticket text. P3, folded into B-15.
- Checked and clean: no `$queryRawUnsafe`/`$executeRawUnsafe`/`Prisma.raw`; no tokens in URLs outside the guest route; no credential literals in tracked files; CORS `*` is harmless with header-borne tokens and `credentials: false`.

## 4. Final remediation backlog

Ordered by priority. "Fix" is the smallest safe change; "Test" is the regression test to add in the same change; "Done when" is the acceptance criterion. Effort: S < 2 h, M ≤ 1 day, L > 1 day.

### Tier 1 — fix before the next deploy

**B-01 · Guard the volume wipe in `setup.sh` (F-01) · S**
- Fix: in the fresh-install branch, before `docker compose down`/`docker volume rm`, run `docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1`; if it exists, print the backup command and exit 1 unless `FORCE_WIPE=1` is set (or the operator types the volume name at a `/dev/tty` prompt). Leave the update branch untouched.
- Test: a bash test (`ci/` or `backend/test/setup-sh.test.ts` driving `bash setup.sh` with a `docker` shim on `PATH`, as in this reproduction): (1) volume absent → `volume rm` is called; (2) volume present, no `FORCE_WIPE` → exit 1, `volume rm` not called; (3) volume present, `FORCE_WIPE=1` → `volume rm` called.
- Done when: the three shim cases pass and `docs/CONFIGURATION.md` §2.13 documents `FORCE_WIPE`.

**B-02 · Stop the seed from overwriting edited roles (F-02) · S**
- Fix: `backend/prisma/seed.ts` role upsert → `update: {}` (create-only), matching the `authConfig` upsert. If a future permission must be pushed to existing installs, ship it as a Prisma data migration, not the seed.
- Test: `backend/test/seed.test.ts`: run the seed's `main()` twice around an `UPDATE roles SET permissions = '["project:read"]' WHERE role_name = 'TAM'`; assert the edit survives; assert a deleted built-in role is re-created with defaults.
- Done when: the test passes; `CHANGELOG.md` notes that built-in role edits now persist across restarts; the Admin › Roles help text no longer implies otherwise.

**B-03 · Permission-gate project reads and comment writes; keep PENDING out of memberships (F-03) · M**
- Fix (backend only, no UI change):
  - `routes/projects.ts:157`, `tasks.ts:212`, `epics.ts:103`, `overview.ts:20`, `search.ts:26`: `router.use(requireAuth, requireAnyPermission("project:read", "task:read"))` (SALES must keep `pipeline:view`-only access to its own routes — these routers do not serve it).
  - `routes/tasks.ts` `POST /:id/comments`: add `requirePermission("task:write")`. Decision needed: if STAKEHOLDER should be able to comment, use `requireAnyPermission("task:write", "project:read")` instead and record the decision.
  - `lib/projectMembers.ts` `ensureAssigneeIsMember` and `routes/projectMembers.ts` `POST /:id/members`: refuse a user whose role has no permissions (`permissionsOf(role.permissions).length === 0`) with 400 `user_has_no_access`.
  - `routes/users.ts`: exclude zero-permission users from `GET /users` unless the caller is admin (keeps them out of pickers).
- Test: extend `backend/test/pentestRemediation.test.ts` with the reproduction table above: PENDING member → 403 on `GET /projects`, `/projects/:id/notes`, `/projects/:id/tasks`, `/search`, `POST /tasks/:id/comments`; `POST /projects/:id/members` and `PATCH /tasks/:id {assignedToId}` with a PENDING user → 400; STAKEHOLDER member → 200 on reads, and the chosen answer on comments; TAM member unaffected.
- Done when: all new cases pass, the existing 1,150 tests still pass, and the release note says existing PENDING memberships are refused at read time (no data migration needed).

**B-04 · Patch backend dependencies and pin JWT algorithms (F-05 part, hardening) · S**
- Fix: inside the backend container `npm install express@4.22.3 && npm audit fix` (lock committed from the container per the repo trap); `jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] })` and `jwt.sign(..., { algorithm: "HS256" })`.
- Test: existing `sessionRevocation.test.ts` covers signing/verification; add one case: a token signed with HS512 is rejected.
- Done when: `npm audit --omit=dev` reports no critical/high in `backend/`; CI green.

### Tier 2 — fix before production release

**B-05 · Rate-limit login and remove the timing/`google_only` enumeration (F-04) · S**
- Fix: reuse `createRateLimiter({ limit: 10, windowMs: 60_000 })` on `POST /auth/login` and `POST /auth/google`, keyed by `rateLimitKey(req.ip)` (a second limiter keyed by lower-cased email is optional); on the unknown-user path run `bcrypt.compare(password, DUMMY_HASH)` before answering 401.
- Test: `backend/test/authRateLimit.test.ts`: 11th failed login in a minute → 429 with `Retry-After`; a correct login on the 11th attempt → 429 too (limit is per IP, not per outcome); after `reset()` → 200.
- Done when: tests pass; `docs/CONFIGURATION.md` lists the limit next to the guest-route limit.

**B-06 · Browser security headers (F-06) · S**
- Fix: `frontend/nginx.conf` `location /` and `= /index.html`: `Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`. HSTS only once TLS is confirmed in front (`add_header` is per-location in nginx — put the set in a shared `include` so `/share/` keeps its own stricter headers).
- Test: `e2e/tests/security-headers.spec.ts` on the built stack (`:8080`): assert the four headers on `/`, `/login`, `/share/x`; assert Google sign-in still renders when configured (existing `auth.spec.ts`) and that the Gantt PDF export (blob URL) still opens — CSP must allow `blob:` in `frame-src`/`object-src` if the export opens in an iframe.
- Done when: the e2e spec passes on CI's built image and no CSP violation appears in the browser console during the smoke suite.

**B-07 · Error boundary, cache clear on logout, boot-outage handling, default timeout (F-07, F-08, F-14, F-15) · M**
- Fix: (a) `src/components/AppErrorBoundary.tsx` (class component) wrapping `<App/>` in `main.tsx` and the `Shell` outlet, rendering a "Something went wrong — reload" panel; (b) `auth.tsx` `logout` → `queryClient.clear()` (pass the client via `useQueryClient()`), also when `login` returns a different user id than the cached one; (c) `auth.tsx:132-156`: on non-401 failure keep `status: "authenticated"`, set `userVerified: false`, expose `bootError` for a banner with Retry; (d) `api.ts`: `signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)`.
- Test: add a jsdom component test layer (`vitest` `environment: "jsdom"` for `*.test.tsx`, `@testing-library/react`): boundary renders the fallback on a throwing child; `logout()` empties `queryClient.getQueryCache()`; `/auth/me` network error keeps the token and shows the banner; a request that never resolves rejects within 30 s (fake timers).
- Done when: the four component tests pass in CI alongside the 958 node tests; `e2e/tests/auth.spec.ts` gains "sign out then sign in as another user shows no stale project list".

**B-08 · Deal-assign race and sibling TOCTOUs (F-09) · S**
- Fix: in `routes/opportunities.ts` `/assign`, after the row lock re-run `assertCanAssignOpportunity(req.user!, before)`; in PATCH/move/close/delete re-check `outcome`/`picId` on the locked row and answer 409 `stale_write` on mismatch (the handoff route's conditional `updateMany` pattern).
- Test: `backend/test/opportunities.test.ts`: two `edit_own` SAs `Promise.all` two `/assign` calls on one unassigned deal → exactly one 200 and one 403/409; the row's `picId` is the first winner.
- Done when: the concurrent test passes 20× in a loop locally.

**B-09 · Honest sync status and `/test` token pairing (F-11, F-12) · S**
- Fix: `sync.ts:888-909` → if `timeEntriesError`, call `writeConfigResult(startedAt, false, \`Time entries: ${message}\`, full)`; `itopAdmin.ts:423-436` → if `body.baseUrl` is present and `body.appToken` is absent, 400 `token_required_for_new_host`; in `PATCH /settings`, when the `baseUrl` host changes, `updateMany({ data: { itopTokenEnc: null, itopPersonId: null } })` on users and log `itop.base_url_changed`.
- Test: `backend/test/itop/sync.test.ts`: stub `syncTimeEntries` to return `{ error }` → `lastSyncOk === false`; `itopAdmin.test.ts`: `/test` with body `baseUrl` only → 400 and no outbound call; `PATCH /settings` host change → every `itopTokenEnc` is null.
- Done when: tests pass; Admin › iTop shows red after a failed time-entry pass (manual check on a real iTop).

**B-10 · Email normalisation (F-13) · M**
- Fix: `.transform(s => s.trim().toLowerCase())` on `loginSchema.email` and `createUserSchema.email`; migration `lowercase_user_emails`: `UPDATE users SET email = lower(email)` guarded by a pre-check that `SELECT lower(email), count(*) … HAVING count(*) > 1` is empty (abort with a clear message otherwise).
- Test: create `Alice@Corp.com` via admin → login with `alice@corp.com` → 200; Google sign-in with `alice@corp.com` links to the same row (no second account).
- Done when: tests pass; the migration applies on the dev stack and on a copy of production data.

**B-11 · Drawer focus trap and Kanban error banner (F-17, F-18) · S**
- Fix: `Drawer.tsx` → `useDialogFocus(open)`, `aria-modal="true"`, `tabIndex={-1}`, `onKeyDown`; `SolvroKanban.tsx` → `updateTask.mutateAsync(...).catch(err => setActionError(...))` with the same banner as the Gantt and `TaskConflictDialog` on `stale_write`.
- Test: e2e `kanban-dnd.spec.ts`: intercept `PATCH /api/tasks/:id` with 409 → the card returns and an error banner is visible; `date-picker.spec.ts` drawer case: Tab from the last control wraps to the first; Escape returns focus to the opener.
- Done when: both e2e cases pass on desktop.

### Tier 3 — next development cycle

**B-12 · Server-side logout (overlooked) · S** — `POST /auth/logout` increments `tokenVersion`; the frontend calls it before clearing storage. Test: old token → 401 after logout. Done when the e2e sign-out test asserts a stale token is refused.

**B-13 · `setup.sh` non-interactive run aborts on `/dev/tty` (found during F-01 repro) · S** — replace `[[ -r /dev/tty ]]` with `exec 3<>/dev/tty 2>/dev/null` guarded test. Test: shim run with `setsid` and all env vars → exit 0.

**B-14 · Scheduled backup and tested restore (overlooked, ops) · M** — a `backup.sh` next to `setup.sh` (`pg_dump` from the container to a dated file, 14-day retention) and a documented restore drill. Done when a restore into a fresh stack brings back a known project.

**B-15 · Log hygiene (overlooked) · S** — strip the query string from `url` in `requestLogger.ts` for `/search`. Done when a search request logs `/search?[redacted]`.

**B-16 · Single-statement reorder with a project lock (F-10) · M** — one `UPDATE … FROM (VALUES …)` per re-pack, skip unchanged rows, `SELECT … FOR NO KEY UPDATE` on the project row at the top of every ordering and dependency transaction; drop the 30 s budget in `sections.ts`. Test: `Promise.all` of two moves in one project → positions are a dense `0..n-1`; a 300-task reorder completes under 200 ms locally.

**B-17 · Route-level code splitting (F-16) · M** — `React.lazy` for Admin, Pipeline, Executive, Gantt, iTop board and the two recharts consumers; `manualChunks` for `reui/`. Done when the main chunk is under 1 MB and the PWA ceiling can return to the 2 MiB default.

**B-18 · `xlsx` replacement (F-05 part) · M** — SheetJS CDN 0.20.x tarball pin, or move pipeline import parsing to the backend behind `pipeline:edit`. Done when `npm audit` is clean in `frontend/` or the parser no longer runs in the browser.

**B-19 · Backend hardening set (F-20–F-25, F-30, F-31, F-32) · M total, S each** — user delete in a transaction with P2003 → 400; `create-admin.ts` clash check and `--force`; drop `err.meta` from 409 bodies; `assertActiveUser` on `tamId`/`saId`/`ownerId`/`assignedToId`; `requireAdmin` on service-catalogue writes; admin reassign through the activity/notification path; `dealValue.max(Number.MAX_SAFE_INTEGER)`, array `.max()`s, `take` on activities; permission vocabulary validated against a shared list; three missing indexes. One test per item in the existing suites.

**B-20 · UX set (F-26, F-34, F-35, F-37, F-38, F-39, F-40, F-45) · M total** — cancelled-aware `_count.tasks`; field-level server errors; `document.title` per route; `aria-label`s on placeholder-only inputs and subtask checkboxes; reduced-motion rule; copy button on the reset-password result; offline banner; SW "new version" toast and `.catch` on the template import; a real 404 page.

### Not scheduled (decision needed from you)

- F-27 SLA reset by any viewer's note — product rule, not a bug.
- F-19 PENDING landing panel — only worth doing if PENDING accounts are expected to log in before role assignment.
- F-28/F-29 iTop memory and invented values — need a real-install measurement first.
- `HttpOnly` cookie session instead of `localStorage` — larger change; B-06 reduces the exposure enough for an internal tool.

## 5. What this pass did not do

- No fix was implemented and no test file was written into the repository (your instruction).
- `gates.sh`, the Docker CI stack and the mobile Playwright project still could not run here (no Docker daemon).
- The `list-dnd.spec.ts:89` failure (2/2 locally) remains unexplained; it needs one run on the CI stack with the pinned Chromium before it is called a regression.
