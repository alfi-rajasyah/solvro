# Backend / Schema / Ops / Docs port plan (INTERNAL <- CUST)
_Complete (2026-10-02)._

Paths: INTERNAL=`/home/solvro-internal/solvro`, CUST=`/home/solvro-internal/solvro-cust`. "+" = CUST-only line, "-" = INTERNAL-only line (diff -u INTERNAL CUST).

## 1. Differing backend/src files — hunk walk

### 1.1 backend/src/app.ts (6 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 | SECURITY/SHARE | `import type { Logger } from "pino"`; `logger as defaultLogger`; `createRequestLogger` from `http/requestLogger.js` | `import { pinoHttp } from "pino-http"`; `logger` | Port: replace bare pinoHttp (token-logging fix, see §2.4). |
| 2 | MEMBERS/SHARE/ACTIVITY/NOTIF | imports projectMembersRouter, shareLinksRouter, publicShareRouter, activityRouter, notificationsRouter | — | Port with feature PRs. |
| 3 | EPIC | import epicsRouter | — | Port. |
| 4 | ITOP/UTIL | imports itopAdminRouter, itopRouter, itopUserRouter, utilizationRouter, webhookRouter | — | Port. |
| 5 | **PIPELINE-REMOVAL** | (removed) | `import { opportunitiesRouter }`, `import { opportunityItemsRouter }` + mounts `app.use("/opportunities", opportunitiesRouter); app.use("/opportunities", opportunityItemsRouter);` with comment (INTERNAL app.ts ~L28-29, L65-69) | **INTERNAL lines MUST survive.** |
| 6 | SECURITY/SHARE | `createApp(opts: { logger?: Logger } = {})`; `app.set("trust proxy", env.TRUST_PROXY)` + comment | `createApp(): Express` | Port (needed for share rate-limit; `opts.logger` used by test/requestLogger.test.ts). |
| 7 | SECURITY | `app.use(createRequestLogger(opts.logger ?? defaultLogger))` | `app.use(pinoHttp({ logger }))` | Port. |
| 8 | ITOP/SHARE | `/webhook` (webhookRouter) and `/public/share` (publicShareRouter) mounted BEFORE `express.json` | — | Port; ordering matters (webhook must not 400 on malformed body; public share must not hit requireAuth). |
| 9 | MEMBERS/SHARE/ACTIVITY/NOTIF/EPIC/ITOP/UTIL | mounts `/projects`×3 (members, shareLinks, activity), `/notifications`, `/epics`, `/admin/itop`, `/itop/me` (before `/itop`), `/utilization` | — | Port; keep `/itop/me` mounted before `/itop`. `/admin/itop` after `/admin` (admin router must not swallow `/admin/itop/*` — verified CUST order works). |

### 1.2 backend/src/env.ts (2 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 | SECURITY | `import { parseTrustProxy } from "./http/trustProxy.js"` | — | Port. |
| 2a | ITOP (secretBox) | `SECRETS_KEY` required, base64 → exactly 32 bytes (`/^[A-Za-z0-9+/]{43}=$/`) | — | Port with iTop PR. **REQUIRED var: boot fails without it** → setup.sh must generate it (CUST setup.sh does, §7), test/env.ts sets it, CI env must set it, docs/CONFIGURATION.md. Upgrade path for existing prod INTERNAL deploys: `.env` lacks it → backend crash-loops after pull. Needs release note or setup.sh `--upgrade` handling (verify CUST setup.sh idempotent re-run appends missing key). |
| 2b | SECURITY | `TRUST_PROXY` default "1", validated via parseTrustProxy (hop count 0-10 or named/CIDR list; bare "true" rejected) | — | Port. |
| 2c | ITOP | `ITOP_SYNC_DISABLED` boolean-ish ("true/false/1/0/yes/no"), default false | — | Port. |

No PIPELINE/SA hunks in env.ts (INTERNAL has no Velora-specific env vars in env.ts — verified: diff shows only additions).

### 1.3 backend/src/index.ts (1 hunk)
| Tag | CUST | INTERNAL | Note |
|---|---|---|---|
| ITOP + ACTIVITY | import + call `startItopScheduler()` / `startActivityCleanup()` in listen callback; `stopItopScheduler()`/`stopActivityCleanup()` in `shutdown()` | — | Port: activity cleanup with ACTIVITY PR, scheduler with ITOP PR (separately). |

### 1.4 backend/src/lib/duplicate.ts (3 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 | ITOP/MEMBERS/EPIC | comment: itopTicketRef never copied; duplication never adds ProjectMember rows; epicId carried verbatim (cites docs/archive/plans/itop-integration.md Task 4.2, docs/archive/plans/epics-spec.md §4) | — | Port; comment cites plan docs → those must be ported to docs/archive/plans/. |
| 2 | EPIC | `epicId: true` in TASK_SELECT | — | Port with EPIC. |
| 3 | EPIC | `epicId: source.epicId` in create data | — | Port with EPIC. |

### 1.5 backend/src/lib/visibility.ts (spine; 6 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 | MEMBERS + **SA-REMOVAL** | header comment: "assigned TAM on the project row … members (ProjectMember, user decision 2026-09-29, collaboration-and-sharing.md)" | "assigned TAM **or SA** on the project row" | Merge: keep SA wording, add member arm wording. |
| 2 | MEMBERS + **SA-REMOVAL** | `VisibilityOptions {viaMembership?}`; `projectVisibilityFilter(user, opts)` arms `[tamId, customer.tamId]` + member arm unless `viaMembership:false` | arms `[{tamId}, {saId: user.sub}, {customer:{tamId}}]` | **INTERNAL `{ saId: user.sub }` arm MUST survive.** Per user decision "SA is NOT a project owner": SA arm belongs to the *visibility* set but NOT to the owner set. CUST conflates "owner" with "`viaMembership:false`" → in INTERNAL the option must become something like `{ ownerOnly: true }` which drops BOTH the member arm and the saId arm. Otherwise an SA could change TAM/customer/delete. |
| 3 | NOTIF/MEMBERS + **SA** | `ProjectVisibilityFacts {tamId, customerTamId, memberIds:Set}` + `canUserSeeProject()` pure predicate (used by lib/notifications.ts) | — | Port, but **add `saId` to the facts + predicate**, and extend test/notifications.test.ts parity test with the SA arm (CUST's comment explicitly demands both representations stay in step). Also lib/notifications.ts loaders must select `saId`. |
| 4 | MEMBERS | `ensureProjectOwnerAccess()` → 404 then 403 `owner_only` "Only the project's TAM can do this" | — | Port with SA-excluding owner filter. |
| 5 | MEMBERS + SA wording | customerVisibilityFilter comment "a project's TAM (or member)" | "an SA or a project TAM" | Merge wording (SA, TAM, member). |
| 6 | MEMBERS | `customerVisibilityFilter(user, opts)` threads opts | single-arg | Port. |
| 7 | **PIPELINE-REMOVAL** | isCustomerVisible comment drops "the opportunity handoff" | "(POST /projects, PATCH /projects/:id, the opportunity handoff)" | Keep INTERNAL wording. |
| 8 | MEMBERS | `ensureCustomerOwnerAccess()` (403 owner_only) | — | Port; owner filter must exclude SA arm as well (SA reaching a customer through a project they're SA of must not be able to re-own/delete the customer). |

### 1.6 backend/src/routes/admin.ts (spine; 7 hunks — ALL SA-REMOVAL)
Every hunk removes SA: comment "ADMIN/SA/TAM/STAKEHOLDER" (L22), `_count.projectsAsSA` in GET /admin/users select + response field `projectsAsSA` (L59, L73), POST /admin/users response `projectsAsSA: 0` (L128), DELETE user blocker count + `"N project(s) as SA"` message (L220, L240-241), `/admin/projects` include `sa` (L538) and PATCH tam-reassign include `sa` (L573). **Nothing to port; all INTERNAL lines survive.** Note: CUST admin.ts has NO membership-related change — user delete with ProjectMember rows relies on the FK cascade (verify in schema §5: `ProjectMember.user onDelete: Cascade`).

### 1.7 backend/src/routes/customers.ts (8 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 (L6) | HEALTH/MEMBERS | imports `overdueBoundary`, `parseWeekKey`, `weekKeyOf`, `computeProjectHealth`, `ensureCustomerOwnerAccess` | narrower imports | Port. |
| 2 (L169) | HEALTH/CUSTOMERS | `GET /customers` gains optional `?today=yyyy-MM-dd` (validated) | no query schema | Port. |
| 3 (L183) | HEALTH/CUSTOMERS | `GET /customers` response: each customer gets `health: { overdueCount, openRiskCount, weeklyUpdate: {weekStart,status,health} \| null }`; fixed 5 queries (visible projects of these customers → groupBy tasks/risks + weeklyUpdate for current ISO week) | `res.json(customers)` | Port (additive field; frontend Customers page consumes). Uses `projectVisibilityFilter(user)` → in INTERNAL the SA arm makes SA-visible projects count — correct (visibility, not ownership). |
| 4 (L197) | **SA-REMOVAL** | removes `sa: { select: {id, username} }` from nested projects include | INTERNAL keeps it | **Keep INTERNAL line.** |
| 5 (L210) | HEALTH | `GET /customers/:id` gains `?today` | — | Port. |
| 6 (L219) | HEALTH | `GET /customers/:id` nested `projects[].health` (ProjectHealth: progress{done,total}, overdueCount, openRiskCount, startDate, endDate) via `computeProjectHealth` | plain customer | Port. |
| 7 (L345) | MEMBERS | PATCH /customers/:id — changing `tamId` (to a different value) requires `ensureCustomerOwnerAccess` (403 owner_only) | none | Port (owner check must exclude SA arm — §1.5). |
| 8 (L387) | MEMBERS | DELETE /customers/:id uses `ensureCustomerOwnerAccess` | `ensureCustomerVisible` | Port. |

### 1.8 backend/src/routes/dailyReview.ts (4 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 (L1) | OVERVIEW/MEMBERS refactor | imports `resolveDailyReviewScope`, `computeSlipDays/currentPhase` from lib/projectHealth; drops Prisma/hasPermission/visibility imports | inline | Port (pure refactor + member arm). |
| 2 (L29) | refactor | removes inline `currentPhase()` + `computeSlipDays()` (moved verbatim to lib/projectHealth.ts) | inline helpers | Port. |
| 3 (L118) | refactor | removes `viewAll` local | — | Port. |
| 4 (L138) | OVERVIEW + MEMBERS + SA | entire customer/project scope block (customerWhere, owned/attached split, projectWhere, attached prune) replaced by `resolveDailyReviewScope(user)`; inside the new lib, "mine" = `tamId = me OR members.some(userId=me)` | "mine" = `tamId: user.sub` only; comment notes customers reached *purely as SA* are pruned | Port. SA semantics preserved: SA-only reach is still pruned (SA is not in `mine`), which matches "SA is not a project owner". Update the lib comment to keep INTERNAL's sentence about the saId arm (the CUST lib comment dropped "an SA or" wording). |

### 1.9 backend/src/routes/holidays.ts (1 hunk) — PIPELINE refactor, keep INTERNAL
CUST has the original inline `date-holidays("ID")` instance + per-year cache + `getHolidaysForYear` in the route. INTERNAL moved it to `lib/holidays.ts` (opportunity-flow-redesign D8) so `lib/workingDays.ts` (Pipeline SLA working-day math) shares the same source; the route imports it. Behaviour identical (same `type === "public"` filter + `{date,name,type}` shape — verify §3). **No port; keep INTERNAL.** Tag: PIPELINE-REMOVAL (CUST simply never had the refactor because it was forked before / reverted it).

### 1.10 backend/src/routes/overview.ts (4 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 (L6) | OVERVIEW | imports overdueBoundary, utcMidnightOfDayString, parseWeekKey, weekKeyOf, resolveDailyReviewScope | — | Port. |
| 2 (L39) | OVERVIEW | work-count window (today → Sunday of ISO week, exclusive next Monday); `taskListScope` = project visibility; `resolveDailyReviewScope` for risks | — | Port. |
| 3 (L53) | OVERVIEW | 3 extra counts in the Promise.all: overdue top-level non-DONE tasks (dueDate < today), dueThisWeek, openRisks (in Daily Review scope) | — | Port. |
| 4 (L67) | OVERVIEW | `GET /overview` response adds `workCounts: { overdue, dueThisWeek, openRisks }`; NEW endpoint `GET /overview/badges?today=` → `{ dailyReviewPending: number }` (customers in DR scope with ≥1 ACTIVE project not reviewed today by caller) | — | Port. In INTERNAL the sidebar may also want Pipeline badges — out of scope; note the endpoint shape is extensible. |

### 1.11 backend/src/routes/risks.ts (3 hunks) — ACTIVITY
| # | CUST | INTERNAL | Note |
|---|---|---|---|
| 1 (L6) | import `diffRiskChanges, recordActivity, shortLabel` from lib/activity | — | Port with ACTIVITY. |
| 2 (L37) | PATCH /risks/:id → `$transaction`: `SELECT … FROM risks … FOR NO KEY UPDATE`, re-read `before`, update, `recordActivity(risk, updated, diffRiskChanges)` | plain update | Port. Response unchanged. |
| 3 (L53) | DELETE /risks/:id selects `description` too; delete + `recordActivity(risk, deleted)` in a tx | plain delete | Port. |

### 1.12 backend/src/routes/sections.ts (2 hunks) — ACTIVITY
| # | CUST | INTERNAL | Note |
|---|---|---|---|
| 1 (L8) | import recordActivity | — | Port. |
| 2 (L211) | section-duplicate: one `task created` event per copied top-level task (subtasks unlogged), in the same tx | — | Port. |

### 1.13 backend/src/routes/users.ts (2 hunks) — MEMBERS/MENTION (UIPASS)
`GET /users` select + response add `active` and `avatarUrl`. Consumed by member pickers/mention autocomplete/avatars. Port (additive). Check: INTERNAL `User` has `active` + `avatarUrl` columns already (schema diff §5 shows no User column change other than relations → yes, both exist in INTERNAL).

### 1.14 backend/src/routes/tasks.ts (spine — 13 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 (L6) | TASKVIEWS/CONFLICT | imports `utcMidnightOf`, `utcMidnightOfDayString` | — | Port. |
| 2 (L16) | EPIC/MEMBERS/ACTIVITY/NOTIF/CONFLICT | imports epics asserts, `ensureAssigneeIsMember`, `diffTaskChanges/recordActivity`, `filterActiveUsersWhoCanSeeProject/notifyForEvent`; new `expectedTaskSchema`; shared `taskResponseInclude` const | — | Port; split per feature PR is painful because PATCH is one hunk — see note below. |
| 3 (L39) | EPIC/ITOP/CONFLICT | `updateTaskSchema` adds `epicId`, `itopTicketRef` (`/^[A-Z]{1,3}-\d{4,8}$/`, nullable), `expected` | — | Port. |
| 3b | TASKVIEWS | `tasksListQuerySchema` adds `open`, `dueFrom`, `dueTo`, `sort: position\|due`, refine dueFrom ≤ dueTo | — | Port. |
| 3c | MENTION | `createCommentSchema.mentionedUserIds` (≤20, dedup) | — | Port. |
| 3d | CONFLICT | `findStaleFields()` + `dayOf()` comparator (scalar fields, dates as UTC days, labelIds as set) | — | Port. |
| 4 (L84) | TASKVIEWS | GET /tasks destructures new params; builds `and[]` list so filters intersect | — | Port. |
| 5 (L97) | TASKVIEWS | `status`/`open`/`overdue`/`dueFrom`/`dueTo` all pushed to `and`; `sort=due` → `dueDate asc nulls last, id`; parallel `count` → **`X-Total-Count` response header** | old overdue/status special-case | Port. Header must be exposed to the browser? Same-origin via nginx in prod → fine; dev CORS `exposedHeaders` not set — verify the frontend reads it via the vite proxy (same-origin) (unverified). |
| 6 (L151) | CONFLICT/ACTIVITY/MEMBERS/EPIC/NOTIF | PATCH /tasks/:id restructured: `derive(cur)` closure; inside tx: `SELECT … FROM tasks … FOR NO KEY UPDATE` row lock (comment explains FOR UPDATE deadlocked 40P01 with FK KEY SHARE); read `before` with `taskResponseInclude`; if `expected` present → `findStaleFields` → **409 `stale_write`** with `details: { conflicts: [{field, expected, current}], task: before }`; `finish()` records `task updated` activity with `diffTaskChanges` + `notifyForEvent` (assignment notification); epicId validation (`epic_on_subtask`, `epic_not_found`, implicit clear on re-parent); assignee-change → `ensureAssigneeIsMember` + `member added` activity | pre-read outside tx (`findUniqueOrThrow` select) | Port. Single biggest spine change. Request: + `epicId`, `itopTicketRef`, `expected`. Response: unchanged shape on 200; new 409 `stale_write`; new 400 `epic_on_subtask`/`epic_not_found`. |
| 7 (L206) | ITOP | `data.itopTicketRef` | — | Port. |
| 8 (L230) | EPIC | `data.epic` connect/disconnect | — | Port. |
| 9 (L252) | refactor | both returns go through `finish()` + `taskResponseInclude` | inline include | Port. |
| 10 (L288) | ACTIVITY | DELETE /tasks/:id → tx: find (404), delete, `task deleted` activity | plain delete | Port. |
| 11 (L326) | ACTIVITY | POST /tasks/:id/duplicate records `task created` for the copy | — | Port. |
| 12 (L363) | MENTION/ACTIVITY/NOTIF | POST /tasks/:id/comments → tx: load task, filter `mentionedUserIds` to active users who can see the project (`filterActiveUsersWhoCanSeeProject`), persist `Comment.mentionedUserIds`, `comment created` activity (changes `{taskId}`, never body), `notifyForEvent(…, { taskAssigneeId, mentionedUserIds })` | plain create | Port. Response: comment now includes `mentionedUserIds: number[]`. `filterActiveUsersWhoCanSeeProject` must include the SA arm (§1.5). |

Endpoints in tasks.ts (spine summary):
- `GET /tasks` — query + `open`, `dueFrom`, `dueTo`, `sort`; response header `X-Total-Count`; body unchanged.
- `PATCH /tasks/:id` — body + `epicId`, `itopTicketRef`, `expected{…}`; new 409 `stale_write` (details `{conflicts, task}`), 400 `epic_on_subtask`/`epic_not_found`; side effects: ProjectMember insert, ActivityEvent, Notification.
- `DELETE /tasks/:id` — now 404s inside tx; activity.
- `POST /tasks/:id/duplicate` — activity only.
- `POST /tasks/:id/comments` — body + `mentionedUserIds`; response + `mentionedUserIds`; activity + notifications.
- No new routes in tasks.ts (itop-ticket lookups live in routes/itop.ts).

### 1.15 backend/src/routes/projects.ts (spine — 22 hunks)
| # | Tag | CUST | INTERNAL | Note |
|---|---|---|---|---|
| 1 (L14) | MEMBERS | import `ensureProjectOwnerAccess` | — | Port. |
| 2 (L30) | EPIC/HEALTH/MEMBERS/ACTIVITY/NOTIF | imports epics, projectHealth, projectMembers, activity, notifications | — | Port. |
| 3 (L45) | **SA-REMOVAL** | drops `saId` from `createProjectSchema` | `saId: z.number().int().positive().optional()` (INTERNAL L48) | **Keep INTERNAL.** |
| 4 (L57) | **SA-REMOVAL** + HEALTH | drops `saId` from updateProjectSchema (INTERNAL L60); adds `healthTodaySchema`, `today` on list query, `projectDetailQuerySchema` | — | Keep saId; port today schemas. |
| 5 (L77) | **SA-REMOVAL** + MEMBERS/UIPASS | `projectDetailInclude`: drops `sa` (INTERNAL L77); `tam` select + `avatarUrl`; `customer` select + `tamId` | — | Keep `sa` include (consider adding `avatarUrl` to `sa` too for parity); port tam.avatarUrl + customer.tamId (frontend uses customer.tamId to decide owner-only UI). |
| 6 (L99) | EPIC | create-task schema + `epicId` | — | Port. |
| 7 (L111) | EPIC | `createEpicSchema` | — | Port. |
| 8 (L123) | HEALTH | GET /projects reads `today` | — | Port. |
| 9 (L131) | **SA-REMOVAL** + HEALTH | GET /projects drops `sa` include (INTERNAL L134); response items + `health` (computeProjectHealth batch) | — | Keep `sa`; port health. |
| 10 (L154) | **SA-REMOVAL** | POST /projects drops `saId: body.saId` (INTERNAL L157) | — | Keep. |
| 11 (L166) | HEALTH | GET /projects/:id + `?today`; comment re filter shape (INTERNAL L173 names `{saId}` arm) | — | Port; keep comment listing tamId / **saId** / customer-owner / member arms. |
| 12 (L179) | HEALTH | GET /projects/:id response + `health: {progress, overdueCount, openRiskCount, startDate, endDate, slipDays}` | — | Port. |
| 13 (L301) | MEMBERS + **SA-REMOVAL** + ACTIVITY | PATCH /projects/:id: owner-only check when tamId/customerId actually change; removes saId connect/disconnect (INTERNAL L308-310); tx + `FOR NO KEY UPDATE` + `project updated` activity with `diffProjectChanges(name,status,customerId)` | — | Keep saId handling. **Decision needed:** should changing `saId` be owner-only too? Recommend YES (it changes who can see the project; SA is not an owner, so an SA must not be able to re-assign SA either). Consider adding `saId`/`tamId` to `diffProjectChanges` so SA re-assignment shows in the activity log. |
| 14 (L333) | MEMBERS + **PIPELINE-REMOVAL** | DELETE /projects/:id → `ensureProjectOwnerAccess`; comment drops the "won deal linked through Opportunity.projectId … SetNull" sentence | `ensureProjectVisible` + Opportunity sentence | Port owner check; **keep Opportunity comment**. |
| 15 (L399) | EPIC/MEMBERS/ACTIVITY | POST /projects/:id/tasks: epic validation; assignee → `ensureAssigneeIsMember` + `member added` activity | — | Port. |
| 16 (L406) | ACTIVITY | `return tx.task.create` → `const created` | — | Port. |
| 17 (L425) | EPIC | `epicId: body.epicId ?? null` | — | Port. |
| 18 (L437) | ACTIVITY/NOTIF | `task created` activity with `taskCreatedChanges(created)` + `notifyForEvent` (assignment) | — | Port. |
| 19 (L481) | EPIC | NEW `GET /projects/:id/epics` (epics ordered by position + owner + `progress{done,total}` over top-level tasks, single groupBy) and NEW `POST /projects/:id/epics` (`project:write`, max(position)+1) | — | Port. |
| 20 (L517) | ACTIVITY | POST /projects/:id/risks → tx + `risk created` activity | — | Port. |
| 21 (L538) | **PIPELINE-REMOVAL** | comment "routes/tasks.ts uses" | "routes/tasks.ts and routes/opportunities.ts use" | Keep INTERNAL. |
| 22 (L613/647/676) | ACTIVITY (notes) | POST/PATCH/DELETE `/projects/:id/notes…` → tx + `note created/updated/deleted` activity, `changes: { visibility }` only — **never the body** | — | Port. GUARDRAIL-relevant: activity rows carry note id + visibility only, so INTERNAL notes never leak through the activity feed (see §9). PATCH logs only when body actually changed. |

Endpoints in projects.ts (spine summary):
- `GET /projects` — query + `today`; items + `health`.
- `GET /projects/:id` — query + `today`; body + `health{…, slipDays}`; `tam.avatarUrl`, `customer.tamId`.
- `PATCH /projects/:id` — new 403 `owner_only` when tamId/customerId change by a non-owner.
- `DELETE /projects/:id` — 403 `owner_only` for members.
- `POST /projects/:id/tasks` — body + `epicId`; 400 `epic_on_subtask`/`epic_not_found`; auto-membership.
- NEW `GET/POST /projects/:id/epics`.
- `POST /projects/:id/risks`, notes POST/PATCH/DELETE — activity only, response unchanged.
- Members/share/activity sub-routes are NOT in projects.ts — separate routers mounted on `/projects` (projectMembers.ts, shareLinks.ts, activity.ts).

## 2. CUST-only backend files not owned by feature specs

| File | Purpose | Callers (CUST) | Tag | Adaptation for INTERNAL |
|---|---|---|---|---|
| `backend/src/lib/projectHealth.ts` (≈150 lines) | `computeProjectHealth(ids, today?)` → Map<id, {progress{done,total}, overdueCount, openRiskCount, startDate, endDate}> in 4 groupBy queries (never N+1); plus `currentPhase()` / `computeSlipDays()` moved verbatim out of routes/dailyReview.ts | routes/projects.ts (GET /, GET /:id), routes/customers.ts (GET /:id), routes/dailyReview.ts | HEALTH | Port as-is (no SA impact: callers pass already-scoped ids). |
| `backend/src/lib/dailyReviewScope.ts` | `resolveDailyReviewScope(user)` → `{customers, projects}` — extracted Daily Review Decisions 8-10 scope, shared with `/overview` workCounts.openRisks and `/overview/badges`; "mine" = TAM **or member** | routes/dailyReview.ts, routes/overview.ts | OVERVIEW (+MEMBERS arm) | Port. Without MEMBERS PR first, drop the `members.some` arm (else it won't compile). Keep SA excluded from "mine" (INTERNAL's existing Decision-9 fix explicitly prunes SA-only reach); restore INTERNAL's comment wording that names the saId arm. |
| `backend/scripts/seed-demo.ts` (989 lines) | DESTRUCTIVE demo seeder: truncates every public table except `_prisma_migrations, roles, auth_config, itop_config`; creates 6 users (admin, 4 TAM, 1 STAKEHOLDER, pw `password123`), 4 customers, 6 projects, sections, epics, labels, tasks/subtasks/deps, risks, notes, weekly updates, dates relative to today. Guards: `DEMO_SEED_CONFIRM=wipe` and `NODE_ENV !== "production"`. Not wired into package.json (run via `npx tsx scripts/seed-demo.ts`) | docs (ui-ux-professional-pass plan, CHANGELOG) | UIPASS/OTHER (dev tooling) | Port optional. Adapt: add an SA user + `saId` on some projects; optionally seed a few Opportunities (incl. one WON linked to a project) so Pipeline screens aren't empty; email domain `@solvro-cust.com` → neutral domain; KEEP_TABLES list is fine (INTERNAL has no extra singleton tables — Pipeline tables would be truncated, which is the intent). It truncates `users` → run only on dev DBs. Requires EPIC migration (seeds epics). |
| `backend/src/http/rateLimit.ts` | In-memory fixed-window per-IP limiter (no npm dep), 10k-key cap with sweep + oldest-eviction; IPv6 bucketed by /56, v4-mapped collapsed; throws 429 `rate_limited` + `Retry-After` | routes/publicShare.ts only | SHARE/SECURITY | Port with SHARE PR. |
| `backend/src/http/requestLogger.ts` | `createRequestLogger(logger)` = pinoHttp with custom `serializers.req` that redacts `authorization` header and `/share/<token>` in url + referer; adds `clientIp` (req.ip under TRUST_PROXY) | src/app.ts | SECURITY (+SHARE) | **Port immediately, independent of SHARE** — fixes bearer-token logging in INTERNAL today (§2.4). The `/share/` redaction is harmless before SHARE lands. |
| `backend/src/http/trustProxy.ts` | `parseTrustProxy(raw)` — hop count 0-10 or named/IP/CIDR list, validated by actually calling `express().set("trust proxy", …)`; rejects bare `true` | src/env.ts | SECURITY/SHARE | Port with the request-logger PR (it feeds `clientIp`) or SHARE PR. Default "1" = nginx only; INTERNAL's tunnel deployment (memory: solvro-internal.bapi.my.id tunnel → nginx) may need `TRUST_PROXY=2` — **verify topology before rate-limit lands** (otherwise every guest shares the tunnel's bucket). |

### 2.4 Token-logging verdict (verified)
**Yes — INTERNAL logs bearer JWTs today.** Evidence:
- `/home/solvro-internal/solvro/backend/src/app.ts:44` — `app.use(pinoHttp({ logger }))`, no `serializers`, no `redact`.
- `/home/solvro-internal/solvro/backend/src/logger.ts` — `pino({ level: env.LOG_LEVEL, … })`, no `redact` option (grep for "redact" in backend/src returns nothing).
- pino-http 10.5.0 (`node_modules/pino-http/logger.js:30`) falls back to `pino-std-serializers` `req`, whose output includes `headers: req.headers` (`node_modules/pino-std-serializers/lib/req.js:35,88`) — i.e. the full `authorization: Bearer <JWT>` header.
- pino-http emits the "request completed" line at `info`; `LOG_LEVEL` defaults to `info` (env.ts) → every authenticated request writes its JWT (valid for `JWT_EXPIRES_IN`, default 8h) to stdout/docker logs.
Fix = port `http/requestLogger.ts` (+ `test/requestLogger.test.ts`). Low-risk, should be the first PR.

## 3. INTERNAL-only backend files (all Pipeline/SA — keep)
| File | Confirmed scope |
|---|---|
| `src/lib/holidays.ts` | Shared `date-holidays("ID")` instance + caches: `getHolidaysForYear` (used by routes/holidays.ts) and `getWeekdayHolidayDatesForYear` (used by lib/workingDays.ts). Generic, but extracted only for Pipeline (opportunity-flow-redesign D8). Callers: routes/holidays.ts, lib/workingDays.ts. |
| `src/lib/workingDays.ts` | Mon-Fri minus ID holidays counter for `lib/pipelineSla.ts` `computeIdle`. Pipeline-only. (Utilization in CUST does NOT use holidays — grep of solvro-cust/backend/src for holiday only hits routes/holidays.ts/app.ts — so no shared need.) |
| `src/lib/pipelineSla.ts` | Pipeline idle/SLA computation. Pipeline-only. |
| `src/lib/pipelineAccess.ts` | Ownership gate + `PIC_SELECT` shared by opportunities/opportunityItems. Pipeline-only. |
| `src/routes/opportunities.ts`, `src/routes/opportunityItems.ts` | Pipeline CRUD/move/close/reopen/handoff + activities/links. Pipeline-only; mounted at `/opportunities` (app.ts). Handoff uses `isCustomerVisible` (visibility.ts comment). |
| `scripts/import-velora.ts` | One-time Velora data import. Pipeline-only. |
| `prisma/migrations/20260925140000_opportunity_flow_redesign` | Pipeline enum/column redesign. Pipeline-only. |
| tests: importVelora, opportunities, opportunityClose, opportunityHandoff, opportunityImport, opportunityItems, pipelineSla, pipelineWonFixture (helper), workingDays (Pipeline); projectSaOptional (SA) | Keep. |

routes/holidays.ts difference explained in §1.9: INTERNAL imports `getHolidaysForYear` from lib/holidays.ts; CUST keeps the original inline copy. Same output. Keep INTERNAL.

Permission strings: INTERNAL uses `pipeline:view/create/edit_own/edit_all` (Pipeline) — absent in CUST. CUST introduces **no new permission strings** (only `*`, `project:read/write/view-all`, `task:write`, `report:executive`); new routes gate on `project:read` (members list, activity, share-link list) / `project:write` (members add/remove, share create/revoke, epics) / `report:executive` (utilization tam/customer scope). INTERNAL's SA role = `project:read` + pipeline perms → SA can read activity/members/share links of projects it sees, but cannot add members/share/edit epics. Matches "SA is not an owner". iTop admin routes gate — see the iTop spec (not verified here).

## 4. Backend tests

Totals (grep of `it(`/`test(` lines, approximate): INTERNAL 33 files / ~464 cases; CUST 55 files / ~777 cases.

### 4.1 CUST-only tests (port with their feature)
| Tag | File (cases) |
|---|---|
| ACTIVITY | activity.test.ts (22) |
| HEALTH/CUSTOMERS | customersHealth.test.ts (5), projectHealth.test.ts (17) |
| EPIC | epics.test.ts (29) |
| ITOP | itopAdmin.test.ts (31), secretBox.test.ts (12), itop/caseLog (6), itop/client (14), itop/daily (23), itop/itopToken (14), itop/sync (36), itop/taskTicketRef (10), itop/ticketActions (16), itop/ticketCreate (13), itop/tickets (20), itop/ticketTime (16), itop/timezone (12), itop/webhook (11); helpers itop/fakeItop.ts, itop/run-fake-itop.ts (standalone fake on :8484) |
| UTIL | itop/utilization.test.ts (15) |
| OVERVIEW | navBadges.test.ts (6), overviewWorkCounts.test.ts (10) |
| NOTIF/MENTION | notifications.test.ts (29) — includes the `projectVisibilityFilter` ⇔ `canUserSeeProject` parity test; **must add SA arm case** |
| MEMBERS | projectMembers.test.ts (25), projectOwnership.test.ts (12), taskAssigneeMembers.test.ts (12) — ownership tests must gain SA cases (SA sees but cannot change TAM/customer/delete) |
| SHARE/SECURITY | shareLinks.test.ts (23), rateLimit.test.ts (7), requestLogger.test.ts (4), trustProxy.test.ts (4) |
| TASKVIEWS | tasksFilters.test.ts (15) |
| CONFLICT | taskStaleWrite.test.ts (15) |

Totals by tag ≈ ITOP 237 (incl. secretBox/itopAdmin) · UTIL 15 · EPIC 29 · NOTIF 29 · ACTIVITY 22 · MEMBERS 49 · SHARE+SECURITY 38 · HEALTH 22 · OVERVIEW 16 · TASKVIEWS 15 · CONFLICT 15.
CUST-only tests that use `createUserWithRole("SA")` or saId: none (SA removed) — so every ported test that creates projects via POST without saId still works in INTERNAL (saId optional, see INTERNAL test/projectSaOptional.test.ts).

### 4.2 Differing tests
| File | Tag | Difference | Port action |
|---|---|---|---|
| dailyReview.test.ts | SA-REMOVAL (+MEMBERS) | INTERNAL test "a customer reached only via the caller's SA assignment … is absent" replaced in CUST by "an unowned customer whose only ACTIVE project belongs to a different TAM is absent" | Keep INTERNAL SA test; add CUST's variant too (and a member-arm case). |
| portfolioCustomer / portfolioOverdue / portfolioRouteToday / sections / taskOrdering / tasksOverdue | SA-REMOVAL | INTERNAL fixtures set `saId: ownerId` on prisma.project.create | Keep INTERNAL. |
| projectCustomerLink.test.ts | PIPELINE-REMOVAL | INTERNAL covers `POST /opportunities/:id/handoff` customer_not_found + uses pipelineWonFixture | Keep INTERNAL. |
| projectDelete.test.ts | PIPELINE-REMOVAL | INTERNAL "clears the handoff link on a won deal but keeps the deal" | Keep INTERNAL; add CUST-side owner-only delete cases (they live in projectOwnership.test.ts). |
| projectNotes.test.ts | SA-REMOVAL (comment only) | "neither tamId nor saId" | Keep INTERNAL. |
| projectServices.test.ts / projectWipLimits.test.ts | SA-REMOVAL | helpers send `saId` | Keep INTERNAL. |
| taskDuplicate.test.ts | EPIC | adds `epicId` to fixture type + `createEpic` helper + "keeps epicId on the copy" | Port the additions. |
| test/env.ts | ITOP | sets `SECRETS_KEY` default `c29sdnJvLXRlc3Qtc2VjcmV0cy1rZXktMzItYnl0ZXM=` | Port with ITOP (needed as soon as env.ts requires SECRETS_KEY — i.e. this lands in the same PR as env.ts change, or every test boot fails). |
| test/testAuth.ts | SA/PIPELINE-REMOVAL | INTERNAL ROLE_PERMISSIONS mirror includes SA + SALES | Keep INTERNAL. |

### 4.3 Test infra
- `backend/vitest.config.ts`, `test/globalSetup.ts`, isolated test DB setup: **identical** (diff -rq lists no difference). `fileParallelism: false` — +313 serial cases will lengthen the backend gate run noticeably (CUST ran them in CI; verify the CI timeout, §7).
- Only infra deltas: `test/env.ts` (SECRETS_KEY) and `test/testAuth.ts` (role mirror).
- `test/itop/fakeItop.ts` is the only new helper; `run-fake-itop.ts` is a dev convenience.

## 5. Prisma

### 5.1 schema.prisma diff (INTERNAL → CUST), every element tagged
| Element | Change in CUST | Tag | Port? |
|---|---|---|---|
| enums `PipelineStage`, `PipelineSubStatus`, `PipelineStatusTag`, `PipelineOutcome`, `PipelineOutcomeReason`, `PipelineImportStatus` (+ long comments) | removed | PIPELINE-REMOVAL | **Keep INTERNAL.** |
| `User.projectsAsSA` (`@relation("ProjectSA")`) | removed | SA-REMOVAL | Keep. |
| `User.opportunitiesAsPic`, `opportunityActivities`, `pipelineImportLogs` | removed | PIPELINE-REMOVAL | Keep. |
| `User.epicsOwned Epic[]` | added | EPIC | Port. |
| `User.itopConfigUpdates`, `itopPersonId Int? @unique`, `itopUserId Int? @unique`, `itopTimeEntries`, `itopTokenEnc`, `itopTokenCheckedAt`, `itopTokenPersonName`, `itopTokenExpiresAt` | added | ITOP | Port. |
| `User.projectMemberships` ("ProjectMemberUser"), `projectMembersAdded` ("ProjectMemberAddedBy") | added | MEMBERS | Port. |
| `User.activityEvents`, `User.notifications` | added | ACTIVITY / NOTIF | Port. |
| `User.shareLinksCreated` | added | SHARE | Port. |
| model `ItopConfig` (singleton id "default": baseUrl, appTokenEnc, webhookSecretEnc, timezone default "UTC", refreshMinutes 5, readClasses [UserRequest,Incident], capacityHoursPerWeek 40, actionsEnabled false, lastSync*, updatedBy SetNull) → `itop_config` | added | ITOP | Port. |
| `Project.saId Int? @map("sa_id")`, `Project.sa` relation, `@@index([saId])` | removed | SA-REMOVAL | **Keep.** |
| `Project.opportunity Opportunity?` + comment | removed | PIPELINE-REMOVAL | **Keep.** |
| `Project.epics`, `members`, `activityEvents`, `shareLinks` | added | EPIC/MEMBERS/ACTIVITY/SHARE | Port. |
| model `ProjectMember` (PK [projectId,userId], index userId, project Cascade, user Cascade, addedBy SetNull, createdAt) → `project_members` | added | MEMBERS | Port. |
| model `ActivityEvent` (projectId Cascade, actorId SetNull, entityType/entityId/action strings, entityLabel, `changes Json? @db.JsonB`, idx [projectId, createdAt desc], [createdAt]) → `activity_events` | added | ACTIVITY | Port. |
| model `Notification` (userId Cascade, activityEventId Cascade, reason string, readAt, idx [userId, readAt, createdAt desc], [activityEventId]) → `notifications` | added | NOTIF | Port (depends on ActivityEvent). |
| `Customer.itopOrgId Int? @unique`, `itopOrgName`, `itopTickets`, `itopTimeEntries` | added | ITOP | Port. |
| `Task.itopTicketRef String?` + `@@index([itopTicketRef])` | added | ITOP | Port. |
| `Task.epicId Int?` + `epic Epic? onDelete SetNull` + `@@index([epicId])` | added | EPIC | Port. |
| model `Epic` (projectId Cascade, title, description, status TaskStatus default TODO, color default #94a3b8, owner User? (no onDelete → migration SQL says SET NULL), startDate, dueDate, position, timestamps; idx [projectId], [projectId, position]) → `epics` | added | EPIC | Port. Fix its comment's stale `docs/plans/epics-spec.md` → `docs/archive/plans/epics-spec.md` (INTERNAL citation rule). |
| `Comment.mentionedUserIds Int[] @default([])` | added | MENTION | Port. |
| models `Opportunity`, `OpportunityActivity`, `OpportunityLink`, `PipelineImportLog` | removed | PIPELINE-REMOVAL | **Keep.** |
| model `ItopTicket` (id = iTop key, class, ref @unique, title, status, operationalStatus, priority, agent*, team/service/caller names, orgId, customer SetNull, startDate, lastUpdate, tto/ttr (deadlines), slaTto/TtrPassed, resolutionDate, publicLog/privateLog Json, syncedAt; idx [customerId,status], [lastUpdate], [agentPersonId], [orgId]) | added | ITOP | Port. |
| model `ItopTimeEntry` (id = iTop key, itopUserId, user SetNull, orgId, customer SetNull, ticket SetNull, ticketRef, start/end, durationMinutes, title, syncedAt; idx [userId,startDate], [customerId,startDate], [itopUserId], [ticketId], [startDate]) | added | ITOP/UTIL | Port. |
| model `ShareLink` (projectId Cascade, tokenHash @unique (SHA-256 hex), label, createdBy SetNull, createdAt, expiresAt, revokedAt, lastUsedAt; idx [projectId]) | added | SHARE | Port. |

Seed (`prisma/seed.ts`): only difference — CUST drops roles `SA` (`project:read`, `pipeline:view/create/edit_own/delete_own`) and `SALES` (`pipeline:view`), and says "four built-in roles". **Keep INTERNAL seed unchanged** (no new roles or permissions are needed by any CUST feature). Consider documenting that a SA who should add members/share links needs `project:write` — by design they don't get it.

### 5.2 Migrations side by side
- Common prefix: 33 migrations up to and including **`20260909180922_weekly_achievements`** (last common).
- INTERNAL-only: `20260925140000_opportunity_flow_redesign` (Pipeline).
- CUST-only, in order:

| # | CUST migration | Tag | SQL summary |
|---|---|---|---|
| 1 | 20260922034304_remove_pipeline_module | PIPELINE/SA-REMOVAL | drops FKs, `projects.sa_id` + index, tables opportunities/opportunity_activities/opportunity_links/pipeline_import_logs, types PipelineImportStatus/PipelineStage. **MUST NEVER be applied to INTERNAL** (destroys all Pipeline data + SA assignments). Do not copy the directory. |
| 2 | 20260922075353_itop_snapshot | ITOP | customers +itop_org_id/+itop_org_name (unique org id); users +itop_person_id/+itop_user_id (unique); CREATE itop_config, itop_tickets (+ indexes incl. status, customer_id); FKs |
| 3 | 20260922182346_itop_time_entries | ITOP/UTIL | DROP itop_tickets_status_idx; CREATE itop_time_entries + 3 indexes; ADD itop_tickets(customer_id,status) idx; 3 FKs SetNull |
| 4 | 20260922185807_itop_time_entry_indexes | ITOP | DROP itop_tickets_customer_id_idx; ADD time_entries ticket_id, start_date idx |
| 5 | 20260923024304_task_itop_ticket_ref | ITOP | tasks +itop_ticket_ref TEXT + index |
| 6 | 20260923035039_itop_write_path | ITOP | itop_tickets +public_log/+private_log JSONB; users +itop_token_enc/checked_at/expires_at/person_name |
| 7 | 20260924063858_itop_timezone | ITOP | itop_config +timezone TEXT NOT NULL DEFAULT 'UTC' |
| 8 | 20260924131112_epics | EPIC | CREATE epics (+2 idx, project Cascade, owner SetNull); tasks +epic_id + idx + FK SetNull |
| 9 | 20260930090000_project_members | MEMBERS | CREATE project_members (PK project_id,user_id; idx user_id; FKs Cascade/Cascade/SetNull) |
| 10 | 20260930120000_activity_events | ACTIVITY | CREATE activity_events (+2 idx; project Cascade, actor SetNull) |
| 11 | 20260930130000_notifications | NOTIF | CREATE notifications (+2 idx; user Cascade, event Cascade) |
| 12 | 20260930140000_comment_mentions | MENTION | comments +mentioned_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[] |
| 13 | 20260930150000_share_links | SHARE | CREATE share_links (unique token_hash, idx project_id; project Cascade, created_by SetNull) |

All of #2–#13 are purely additive (the only DROPs are of indexes those same migrations created). None touch `projects.sa_id` or Pipeline tables.

### 5.3 Proposed INTERNAL migration sequence (fresh timestamps, one group per feature PR)
Rules: timestamps must sort **after** `20260925140000_opportunity_flow_redesign` (Prisma `migrate dev` treats out-of-order history as drift); do not copy CUST migration dirs verbatim — regenerate each with `prisma migrate dev --create-only` against INTERNAL's schema so the SQL is computed from INTERNAL's state, then diff it against the CUST SQL above (expect identical apart from names). Collapse the iTop index churn (#2–#4) into a single migration with the end-state indexes.

| Order | PR | Migration name (example timestamp) | Content |
|---|---|---|---|
| 1 | Security/logging PR | — | no schema |
| 2 | EPIC PR | `20261005000000_epics` | = CUST #8 |
| 3 | MEMBERS PR | `20261006000000_project_members` | = CUST #9 |
| 4 | ACTIVITY PR | `20261007000000_activity_events` | = CUST #10 |
| 5 | NOTIF+MENTION PR | `20261008000000_notifications`, `20261008000100_comment_mentions` | = CUST #11, #12 (could be one migration) |
| 6 | SHARE PR | `20261009000000_share_links` | = CUST #13 |
| 7 | ITOP PR(s) | `20261012000000_itop_snapshot` (end state of CUST #2+#3+#4+#7: itop_config incl. timezone, itop_tickets with final indexes, itop_time_entries, customer/user itop columns), `20261012000100_task_itop_ticket_ref` (#5), `20261012000200_itop_write_path` (#6) | ITOP + UTIL share these tables; UTIL routes need no extra migration |
Order 2–7 can be re-sequenced; dependencies: NOTIF needs ACTIVITY; ITOP has none on the others (but `lib/duplicate.ts` comment mentions both). Each PR touches `schema.prisma` + migrations → spine (instant opus review). No data backfill is needed by any of them.
**Never apply / copy `20260922034304_remove_pipeline_module`.** Add a gates.sh guard (§8) that fails if any migration in INTERNAL contains `DROP TABLE "opportunities"` or `DROP COLUMN "sa_id"`.

## 6. package.json / lockfiles
- `backend/package.json`, `frontend/package.json`, `e2e/package.json`: **byte-identical** between INTERNAL and CUST (all fields: name, version, scripts, deps, devDeps, engines, prisma.seed).
- `backend/package-lock.json`, `frontend/package-lock.json`, `e2e/package-lock.json`: **byte-identical**.
- No root `package.json`/lockfile in either repo.
- ⇒ The whole CUST feature set needs **no new npm dependency** (date-holidays, pino-http, etc. already present; iTop client uses native fetch; rate limiter hand-rolled; secretBox uses node:crypto). The container-written-lockfile trap is not triggered by the port. `seed-demo.ts` is not wired as a script (CUST runs it via `npx tsx`).
- CUST adds a root `VERSION` file (PACKAGING) — skip.

## 7. Ops

### 7.1 setup.sh (9 hunks)
| # | Tag | CUST | Port? |
|---|---|---|---|
| 1 (L23) | SECURITY/SHARE | header doc for `TRUST_PROXY` env | Port. |
| 2 (L71) | SECURITY | `is_trust_proxy()` bash validator | Port. |
| 3 (L129) | **PACKAGING** | backend image `ghcr.io/alfi-rajasyah/solvro-cust-backend:latest` | **Skip** (INTERNAL keeps `solvro-backend`). |
| 4 (L142) | ITOP + SECURITY | compose env `SECRETS_KEY: ${SECRETS_KEY}`, `TRUST_PROXY: "${TRUST_PROXY:-1}"` | Port (SECRETS_KEY with ITOP PR at latest — but env.ts makes it required, so setup.sh must ship in the same release as env.ts). |
| 5 (L154) | **PACKAGING** | frontend image `solvro-cust-frontend` | **Skip.** |
| 6 (L176) | ITOP | update path: if sourced `.env` lacks `SECRETS_KEY`, generate `openssl rand -base64 32` and append (never overwrite) | **Port — critical upgrade path** for existing INTERNAL prod installs. |
| 7 (L242) | SECURITY | `TRUST_PROXY="${TRUST_PROXY:-}"` input var | Port. |
| 8 (L285) | SECURITY | validate TRUST_PROXY, exit 1 on bad value | Port. |
| 9 (L289-L305) | ITOP + SECURITY | generate SECRETS_KEY on fresh install; write it to `.env`; append quoted `TRUST_PROXY` | Port. |
INTERNAL setup.sh has no Pipeline/Velora-specific hunks vs CUST (diff shows only the hunks above) — Velora services are dev-only.

### 7.2 ci/
- `ci/docker-compose.ci.yml` (2 hunks, ITOP): comment + `SECRETS_KEY: ${SECRETS_KEY:?SECRETS_KEY is required}` in backend env. Port with env.ts change.
- `ci/.env.ci.example` (1 hunk, ITOP): `SECRETS_KEY=run "openssl rand -base64 32" and paste here`. Port.

### 7.3 .github/workflows/ci.yml (2 hunks, ITOP)
- L124 job: "Generate ephemeral JWT secret" → "Generate ephemeral secrets" also writing `SECRETS_KEY=$(openssl rand -base64 32)` to `$GITHUB_ENV`.
- L185 job (e2e stack): adds `SECRETS_KEY` to the generated env block.
Backend vitest job needs nothing (test/env.ts defaults SECRETS_KEY). Port both with the env.ts change. No timeout change in CUST despite +313 serial tests (unverified whether INTERNAL's job timeout has headroom — check CI duration after the port).

### 7.4 .github/workflows/docker-publish.yml (2 hunks)
| # | Tag | CUST | INTERNAL | Port? |
|---|---|---|---|---|
| 1 (L17) | **PACKAGING** | `IMAGE_NAME: ${{ github.repository }}` (images named `<owner>/<repo>-<service>` → `solvro-cust-backend`) | `IMAGE_OWNER: ${{ github.repository_owner }}` → `<owner>/solvro-<service>` | **Skip.** |
| 2 (L66) | OTHER (bugfix, 2026-10-01 "Release image tags", CUST commit 3ad5731 / PR #25) | `type=ref,event=branch,enable=${{ github.event_name != 'workflow_run' }}` + `type=raw,value=${{ github.event.workflow_run.head_branch }},enable=${{ github.event_name == 'workflow_run' }}` + explanatory comment | `type=ref,event=branch` (INTERNAL docker-publish.yml ~L70) | **Port the tags part (keep `IMAGE_OWNER` images line).** |

**The bug:** publishing for `main` is triggered by `workflow_run` (CI completed on main). On `workflow_run` events GitHub sets `github.ref` to the **default branch** (`develop` in this repo), not the branch CI ran on. `docker/metadata-action`'s `type=ref,event=branch` reads `github.ref`, so every `main` release image was **also tagged `develop`** (overwriting the develop tag with release content). **INTERNAL's docker-publish.yml has this bug today** (it already handles the analogous `github.sha` problem via `head_sha` checkout + computed short SHA, and `latest` via `head_branch`, but not the branch tag). Also needs a CHANGELOG "Fixed" entry.

### 7.5 Dockerfiles, .dockerignore
`backend/Dockerfile`, `frontend/Dockerfile`, all `.dockerignore`: identical (not listed by diff -rq). Nothing to port.

### 7.6 frontend/nginx.conf (1 hunk, SHARE/SECURITY) — spine (nginx.conf)
Adds `location ^~ /api/public/share/` (proxy to backend `/public/share/`, `access_log off`, same XFF headers) and `location ^~ /share/` (`access_log off`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `rewrite ^ /index.html break`). Port with SHARE PR. Triggers docs-keeper (nginx.conf).

### 7.7 frontend/vite.config.ts (2 hunks)
- SHARE: `navigateFallbackDenylist: [/^\/api\//, /^\/share\//]` — port with SHARE (PWA must not serve the cached shell for guest links).
- OTHER: `server.allowedHosts` from `VITE_ALLOWED_HOSTS` env. INTERNAL currently solves the tunnel 403 with an **untracked `frontend/vite.config.local.ts`** (only in INTERNAL). Porting the env-based approach is optional and cleaner; if adopted, the local file + its memory note can be retired. Triggers docs-keeper (vite.config.ts).

### 7.8 .gitignore (3 hunks)
- Moves the `New UI/` block up (cosmetic) — skip/either.
- Comment "workflow files in .claude/ are tracked in this repo" vs INTERNAL's "…every CLAUDE.md and docs/ are tracked (see CLAUDE.md Map)" — **keep INTERNAL** (reflects INTERNAL's 2026-10-01 tracking decision).
- Adds `docs/archive/plans/ui-ux-qa-run/shots/` (UIPASS) — port **if** the ui-ux-qa-run folder is ported to docs/archive.

### 7.9 Env examples
- `backend/.env.example`: + `# openssl rand -base64 32` / `SECRETS_KEY=` (ITOP). Port.
- Dev `docker-compose.yml` / root `.env.example` are untracked in INTERNAL (local-only). The orchestrator must add a fixed dev `SECRETS_KEY` to the local `docker-compose.yml` backend env when env.ts lands (CUST CONFIGURATION.md: "a fixed dev-only SECRETS_KEY"), or the dev backend crash-loops. This is a local operator step, not a PR diff — call it out in the PR description.

### 7.10 docs/CONFIGURATION.md env/ops differences
CUST additions to port (tag): `SECRETS_KEY` row + requirement note + "rotate it invalidates tokens" (ITOP); `TRUST_PROXY` row + setup.sh section (SECURITY/SHARE); `ITOP_SYNC_DISABLED` row (ITOP); **"Rotate JWT_SECRET once after upgrading to the release that redacts request logs"** (SECURITY — adopt verbatim, it applies to INTERNAL); "Redaction" bullet describing requestLogger (SECURITY); nginx guest-link section incl. the warning that nginx `error_log` can still contain the token (SHARE); PWA denylist note (SHARE); setup.sh auto-generates SECRETS_KEY + re-run appends it (ITOP); CI env list + SECRETS_KEY (ITOP); whole new §2.16 iTop integration (connection, sync interval, time tracking, outbound-only, secrets, webhook `POST /api/webhook/itop`, actions/personal tokens, new ticket, log time) (ITOP/UTIL).
CUST removals NOT to port (PIPELINE-REMOVAL/SA-REMOVAL/PACKAGING): Dockerised-dev row's velora-app/velora-cron + :3001; "Pipeline module is native code" callout; `### The Pipeline module` section; velora reference DB paragraph; velora-app/velora-cron service rows; `velora_uploads` volume row; port 3001 row; "Five built-in roles" incl. SA → "Four"; §2.16 Pipeline module + import-velora cutover (INTERNAL's §2.16 must be renumbered so iTop becomes §2.17 or similar); image names `solvro-cust-*`.

## 8. Docs & agent workflow

### 8.1 Root CLAUDE.md (INTERNAL vs CUST)
| Hunk | CUST | Verdict |
|---|---|---|
| Product | TAM-only product statement | **Skip** (PIPELINE/SA-REMOVAL). Optionally extend INTERNAL's sentence: "…replaces Asana, Google Docs, the standalone Velora app, and (with iTop) the separate time-tracking view". |
| Guardrail: no drag libs | adds "and the iTop ticket board `itop/board/` — approved by the user 2026-09-24" to the sanctioned Solvro layers | **Adopt** (ITOP board reuses vendored `reui/kanban`; reui dirs are byte-identical between repos, SOLVRO PATCH counts identical). |
| Guardrail: changelog | "process history lives in `docs/`, not the changelog" vs INTERNAL "in the local docs, not the tracked changelog" | Keep INTERNAL (cosmetic). |
| Guardrail: AI attribution | CUST: "No AI attribution in commits or PRs (user decision 2026-09-24)… no model name or other AI mention — in commit messages, PR titles, PR bodies, and the drafts shown for approval" | INTERNAL already has "No Claude/AI attribution anywhere (user rule, 2026-10-02)" (covers reviews/comments too). Merge: keep INTERNAL's, optionally add CUST's "PR titles … and the drafts shown for approval" clause. User-owned block → propose only. |
| Guardrail: iTop writes | **NEW**: "iTop writes never use the application token (user decision 2026-09-24)… personal token `User.itopTokenEnc` accepted only when it resolves to the iTop Person with that user's Solvro email… app token only reads" | **Adopt with the ITOP PR** (user-owned → propose). |
| Guardrail: Pipeline | CUST "Pipeline module is REMOVED (2026-09-22)" | **Never port.** Keep INTERNAL "NATIVE PORT" guardrail. |
| Standing decisions | CUST: SA role/saId removed, "a project is owned by its TAM alone (members share access, not ownership)", `Customer.solutionArchitect` free-text stays; WorkLogs sentence deleted | Do not port the SA removal. **Propose new INTERNAL wording** (see §9). |
| Map: tracked decision date | 2026-09-29 | Keep INTERNAL (2026-10-01). |
| Trap: VeloraApp sibling | removed in CUST | Keep INTERNAL. |
| Trap: **Vite HMR does not survive the dev tunnel** (2026-09-22) | NEW | **Adopt** — INTERNAL also runs behind a tunnel (solvro-internal.bapi.my.id). Adjust text if INTERNAL keeps `vite.config.local.ts` rather than `VITE_ALLOWED_HOSTS`. |
| Trap: frontend container has no `pgrep` (2026-09-25) | absent in CUST (post-fork INTERNAL addition) | Keep INTERNAL. |

### 8.2 backend/CLAUDE.md
| Hunk | Verdict |
|---|---|
| Visibility bullet: member arm, `canUserSeeProject` twin + parity test rule, AND-compose rule, **owner-only** helpers with `{ viaMembership: false }`, Daily Review counts member projects | **Adopt, rewritten for SA**: arms = tamId OR **saId** OR customer.tamId OR member; owner-only check must drop BOTH member and saId arms (rename option to e.g. `{ ownerOnly: true }`); keep "a customerId taken as a body field (a project **or handoff link**)". |
| NEW "Public (unauthenticated) surface" convention (publicShare.ts only; rate-limited; uniform 404; no-store + noindex; allow-listed `select`) | **Adopt** with SHARE. Should also mention `routes/webhook.ts` (`/webhook/itop`) as the second unauthenticated surface (CUST text omits it even though webhook.ts calls itself "the first unauthenticated non-health route") — fix wording on port. |
| NEW "Request logging" convention (requestLogger redaction; never log raw URL/Referer/headers) | **Adopt** with the logging PR. |
| NEW trap: never point `--shadow-database-url` at the dev DB (2026-09-24 wiped dev DB) | **Adopt** (generic, high value). |
| INTERNAL trap: enum value removal needs a hand-written migration | Keep INTERNAL (absent in CUST because Pipeline redesign is post-fork). |

### 8.3 frontend/CLAUDE.md
| Hunk | Verdict |
|---|---|
| Server state: CUST drops `pipelineKeys` | Keep INTERNAL's pipelineKeys sentence; adopt CUST's generic "Mutations invalidate exactly what they touch" phrasing. |
| NEW "Display dates and words": `lib/formatDate.ts` only, `lib/labels.ts` for enum display text, `text-meta` 12px role, no sub-12px `text-[Npx]` | **Adopt with UIPASS** (Pipeline enum labels must be added to labels.ts — frontend agent scope). |
| Navigation: + `src/lib/routeMeta.ts` for top-bar titles/breadcrumbs | **Adopt with UIPASS.** |
e2e/CLAUDE.md: identical.

### 8.4 .claude/
- `agents/*`, `hooks/*`, other scripts: identical.
- `reply-style.md`, `settings.local.json`: INTERNAL is newer (portable `command -v node` hook path, extra allow entries). **Keep INTERNAL.**
- `scripts/gates.sh`: **only one hunk — a comment** (L146-149: CUST "Inverted for the customer distribution (2026-09-21)" vs INTERNAL "Inverted 2026-10-01"). Keep INTERNAL. **No new guardrail checks, no allowlist change, identical `EXPECTED_*_PATCHES` (kanban 0, sortable 0, filters 18, data-grid 40, badge 5)**; verified the actual SOLVRO PATCH counts and the whole `frontend/src/components/reui/` tree are identical in both repos. The INTERNAL-notes consumer set (`queries.ts`, `Overview.tsx`, `views/ProjectOverview.tsx`) is identical in CUST — so the allowlist passes unchanged after the port.
- **gates.sh changes worth adding for the port** (proposals, not in CUST):
  1. Extend `SPINE` with `^backend/src/routes/publicShare\.ts$|^backend/src/lib/shareLinks\.ts$|^backend/src/routes/webhook\.ts$|^backend/src/http/(rateLimit|requestLogger|trustProxy)\.ts$|^backend/src/lib/secretBox\.ts$|^backend/src/lib/(activity|notifications|projectMembers)\.ts$|^backend/src/lib/itop/(config|scheduler)\.ts$|^frontend/vite\.config\.ts$` (unauthenticated surfaces, secrets, visibility twins).
  2. `guardrail-pipeline-intact`: fail if `backend/src/routes/opportunities.ts` is missing, if any migration SQL contains `DROP TABLE "opportunities"` / `DROP COLUMN "sa_id"`, or if `projectVisibilityFilter` no longer contains `saId`.
  3. `guardrail-public-no-notes`: fail if `routes/publicShare.ts` / `lib/shareLinks.ts` reference `projectNote`/`ProjectNote`/`notes`, and if `lib/activity.ts` callers pass a note `body` (grep `recordActivity` blocks in projects.ts for `body`).
  4. `guardrail-itop-writes-personal-token`: grep that write paths in `lib/itop/` never call `getItopAppClient` (mechanical backing for the new guardrail) — exact pattern to be set by the iTop spec owner (unverified).

### 8.5 docs/DESIGN.md (39 changed lines)
CUST adds: `meta` typography role (12px/500/1.35) in frontmatter + table + "seven named roles" tailwind-merge note; Ticket detail panel (`TicketPanel.tsx`) and Epic detail panel (`EpicPanel.tsx`) rows; NotificationBell popover in Dropdown menus row; iTop `TicketCard.tsx` drag-overlay row; `CHIP_BASE` uses `text-meta` instead of `text-[11px]`; `LabelChip`/`EpicChip` colour-dot rule; compact data-grid mode row tweak. CUST removes/changes INTERNAL's Pipeline chip section (StageChip 6 stages, OwnerChip, SubStatusChip, TagChip, IdleChip, OutcomeChip, `pipeline/OpportunityCard.tsx` drag overlay) and shows an OLDER 9-stage StageChip table (WON/DROP/HOLD rows) because CUST forked before the 2026-09-25 opportunity-flow redesign. **Port the additions; keep INTERNAL's current Pipeline chip section verbatim** (do not take CUST's stage rows). Also note `CHIP_BASE` "exported so other bespoke chips can compose it" in INTERNAL — Pipeline chips compose it; keep the export when switching to `text-meta`. Docs-keeper trigger (index.css touched by UIPASS).

### 8.6 docs/plans, archive, ISSUES, reference — CUST material INTERNAL lacks
Plan docs **cited by CUST code** (counts of citations in backend/src, frontend/src, e2e, prisma, test) — must be copied to INTERNAL `docs/archive/plans/` with the code (INTERNAL citation rule):
- `docs/archive/plans/itop-integration.md` (85 cites) — ITOP/UTIL
- `docs/archive/plans/collaboration-and-sharing.md` (53) — MEMBERS/ACTIVITY/NOTIF/MENTION/CONFLICT/SHARE/LIVE
- `docs/archive/plans/epics-spec.md` (31) — EPIC
- `docs/archive/plans/itop-integration-spec.md` (19) — ITOP
- (weekly-sync-*, customer-visibility-spec, date-contract, etc. already exist in INTERNAL.) Note CUST code also contains stale bare `docs/plans/…` citations (duplicate-tasks-sections ×7, customer-visibility-spec ×5, reui-data-grid ×4, daily-review-v2-spec ×3, critical-path-mark ×2, …) — pre-existing in both repos; fix opportunistically, and fix the `Epic` model comment's `docs/plans/epics-spec.md`.
Other CUST-only docs:
- `docs/archive/plans/ui-ux-implementor-brief.md`, `ui-ux-professional-pass.md`, `ui-ux-progress.md`, `ui-ux-qa-run/` (+ `.gitignore` for its `shots/`), `docs/archive/ideas/ui-ux-proposal.html` — UIPASS; port as reference.
- `docs/reference/itop-integration-guide.md` — ITOP operator/dev guide (fake iTop, setup); port.
- `docs/ideas/outline-knowledge-base.md` — OTHER (research; user rejected sidecar) — optional.
- `docs/plans/setup-sh-hardening.md` — "proposed 2026-09-18, not approved", written for the first **customer** install (pin tags, CORS, registry login, pgdata wipe guard) — PACKAGING-flavoured but the pgdata-wipe and CORS points apply to INTERNAL too; surface to user, don't port as approved.
- `docs/reference/customer-repo-guardrails-draft.md` — PACKAGING, skip.
- CUST archived the Pipeline plans (`claim-unassigned-deals`, `pipeline-native-port-plan`, `velora-integration-plan/prd`) — INTERNAL keeps them active in `docs/plans/`; **do not copy CUST's archive copies**. INTERNAL-only `docs/archive/plans/opportunity-flow-redesign.md` stays.
- docs/ISSUES.md sections in CUST only: "Pipeline module and SA project owner removed (2026-09-22)" + "Deferred — the Daily Review empty-group prune may now be dead code" (**skip** — in INTERNAL the prune is live because of the SA arm); iTop Phase 1/3/4/5/6/7 deferred findings + "iTop integration — real-install findings (2026-09-24)" (ITOP — port); "Professional UI pass — deferred findings (2026-09-29)" (UIPASS — port); Collaboration & sharing Phase 1 "Quick wins", Phase 3 "Conflict warning", Phase 4 "Activity and notifications", Phase 6 "Guest links" deferred findings (MEMBERS/CONFLICT/ACTIVITY/NOTIF/SHARE — port). Port each section with its feature PR.
- CHANGELOG: CUST post-fork entries (40 headings) — do **not** copy verbatim; write fresh INTERNAL entries per PR. Skip CUST's "Removed — Pipeline module and the SA project owner", "Velora reference stack retired", "Customer distribution builds…", "Customer repository: source, installer…", "Development agent models" (INTERNAL has its own). Reusable wording: "Security — Tokens kept out of logs", "Fixed — Release image tags", "Added — Demo data script", etc.
- README: CUST removes SA/Pipeline paragraphs (skip) and adds an "iTop integration" feature section, Utilization (`/work-logs` → `/utilization` redirect), domain-helper table without `pipelineAccess.ts` (skip that). Port the iTop/Utilization/collaboration feature bullets; keep Pipeline sections.
- Root `INSTALL.md`, `OPERATIONS.md`, `SUPPORT.md`, `LICENSE.md`, `VERSION`, `notes/TEMPLATE.md`: PACKAGING — skip (OPERATIONS.md may hold generic ops advice; unverified, skim before discarding).

### 8.7 e2e fixtures (for the frontend agents; noted here for completeness)
`e2e/fixtures/seed.ts`: CUST drops `saId: userId` (SA-REMOVAL — keep INTERNAL) and adds `SeededEpic` + `createEpic()` (EPIC — port). `e2e/fixtures/test.ts`: extracts `submitLoginForm()` from the login helper (SIGNIN deep-link tests — port).

## 9. Guardrail audit (INTERNAL CLAUDE.md Guardrails + Standing decisions vs CUST changes)

| Guardrail / decision | CUST status | Port action / proposed wording |
|---|---|---|
| **INTERNAL notes never in exports** | Not violated. Frontend note-consumer set identical to INTERNAL's allowlist (`lib/queries.ts`, `pages/Overview.tsx`, `pages/views/ProjectOverview.tsx`) → gates.sh `guardrail-internal-notes` passes unchanged. Backend ProjectNote readers identical set (admin, customers, dailyReview, notes, projects, search; + INTERNAL opportunities). New CUST paths: (a) **activity log** — note events store only `entityId` + `changes:{visibility}`, `entityLabel` null, never the body (`lib/activity.ts:9-10`, projects.ts note POST/PATCH/DELETE); in-app only, gated by project visibility. (b) **guest link** (`lib/shareLinks.ts` buildPublicSharePayload L88-104) selects only project name, customer name, section/task status+dates, milestone title/status/dates — **no notes**. (c) iTop write paths (ticket logs, new tickets, time entries) take user-typed text, never ProjectNote rows (grep: no projectNote reference in itop routes/libs). | No violation. **Proposed wording update** (user-owned): "…only `CUSTOMER_FACING` notes may reach any export or customer-facing output — **including guest links (`/share/<token>`) and anything Solvro writes to iTop**. The activity log records note id + visibility only, never the body." Add gates.sh `guardrail-public-no-notes` (§8.4). |
| **Tasks.tsx + `/tasks` + Timeline tab never deleted** | Kept: `frontend/src/pages/Tasks.tsx` exists; `App.tsx:71` `path="tasks"`; `App.tsx:63` `path="timeline"`. CUST extends GET /tasks (filters/sort/X-Total-Count). | No violation. |
| **No gantt/board/drag npm libs** | `package.json`/lockfiles byte-identical; iTop board (`components/itop/board/TicketBoard.tsx`) composes vendored `reui/kanban`; reui tree identical. | No violation. Adopt CUST's wording adding `itop/board/` as a sanctioned Solvro layer (user approval 2026-09-24 in CUST — confirm the user re-affirms for INTERNAL). |
| **DESIGN.md binding** | CUST updated DESIGN.md alongside UIPASS/EPIC/ITOP/NOTIF. | Port DESIGN.md additions per §8.5; keep Pipeline chip section. |
| **Changelog discipline** | CUST has entries for every feature (40 post-fork headings). | Every port PR writes fresh INTERNAL entries; never copy CUST's Pipeline-removal / packaging entries. |
| **Docs discipline** | CUST CLAUDE.md edits are conventions (visibility, public surface, logging, traps) — compliant. | Adopt per §8.1-8.3. |
| **Branch & PR flow / assign / no self-commit / no AI attribution** | Same rules (CUST attribution wording dated 2026-09-24). | Keep INTERNAL; optional merge of wording. Note the harness reminder in this session asks for `Co-Authored-By` lines — INTERNAL's guardrail overrides it. |
| **Pipeline is a NATIVE PORT** | CUST *replaced* it with "Pipeline REMOVED"; deleted routes/models/migrations. | **Never port** the removal: skip migration `20260922034304_remove_pipeline_module`, all PIPELINE-REMOVAL hunks (§1, §5), CUST's guardrail text, README/CONFIGURATION removals. gates.sh `guardrail-pipeline-intact` proposed. |
| **Standing: SA role, `Project.saId`, SA visibility stay** | CUST removed all three. | Keep. **Proposed addition** (per user decision 2026-10-02): "SA is not a project owner. `saId` is a visibility arm only: owner-only actions (changing a project's TAM, customer or SA; deleting a project; changing a customer's owner or deleting it) use `ensureProjectOwnerAccess`/`ensureCustomerOwnerAccess`, whose owner filter excludes both the member arm and the saId arm. `canUserSeeProject` must include saId." |
| **Standing: SA-blueprint ingestion `/webhook/blueprint` cancelled** | CUST adds `POST /webhook/itop` (`routes/webhook.ts:84`) — unauthenticated, mounted before `express.json`, **ignores the body entirely**, verifies `X-Solvro-Webhook-Secret` against the sealed `ItopConfig.webhookSecretEnc` (timing-safe), double sliding-window rate limit (6 accepted / 60 total per minute), only triggers `requestSync()` (a pull using Solvro's own app token). | Not the cancelled feature (no ingestion, no AI breakdown, no payload trust). **Proposed wording**: "…cancelled… The iTop webhook (`POST /webhook/itop`) is a different, approved surface: a secret-checked, body-ignoring nudge that only schedules an iTop pull — it must never parse or persist the request body." |
| **Standing: StatusChip/PriorityBadge/LabelChip bespoke** | CUST keeps them bespoke; `CHIP_BASE` → `text-meta` (UIPASS); new `EpicChip` follows LabelChip's dot pattern. | Compliant. |
| **Standing: Network diagram never / critical-path deferred / Reporting removed** | No CUST change (critical-path *mark* already existed). Utilization page uses `report:executive` for team scopes but is not the removed Reports page. | Compliant. Consider a one-line clarification that Utilization ≠ Reporting. |
| **Standing: `WorkLogs.tsx` placeholder until iTop spec exists** | CUST deleted `WorkLogs.tsx`; `/work-logs` → `<Navigate to="/utilization">` (`App.tsx:73`); spec exists (`docs/archive/plans/itop-integration.md`). | Lifted by user decision 2026-10-02. **Proposed wording**: "`WorkLogs.tsx` is superseded by the Utilization page (iTop time tracking, `docs/archive/plans/itop-integration.md`, user decision 2026-10-02); `/work-logs` redirects to `/utilization`." |
| **New guardrail to adopt**: iTop writes never use the application token | CUST guardrail 2026-09-24. | Adopt with ITOP PR (propose to user). |
| **Map/tracking** | Same rule, different date. | Keep INTERNAL. |

## 10. Summary — every non-frontend difference

| Area | Difference | Tag | Decision |
|---|---|---|---|
| app.ts | requestLogger instead of bare pinoHttp; trust proxy; createApp(opts) | SECURITY | **Port first** |
| app.ts | new routers + mounts (members, share, publicShare, activity, notifications, epics, itop×3, utilization, webhook) | MEMBERS/SHARE/ACTIVITY/NOTIF/EPIC/ITOP/UTIL | Port per feature |
| app.ts | opportunities routers removed | PIPELINE-REMOVAL | Keep INTERNAL |
| env.ts | TRUST_PROXY | SECURITY/SHARE | Port |
| env.ts | SECRETS_KEY (required), ITOP_SYNC_DISABLED | ITOP | Port (with setup.sh/CI/test env same PR) |
| index.ts | iTop scheduler + activity cleanup start/stop | ITOP/ACTIVITY | Port |
| lib/duplicate.ts | epicId carried; comments | EPIC | Port |
| lib/visibility.ts | member arm, owner-only helpers, canUserSeeProject | MEMBERS/NOTIF | Port, **adapted: keep saId arm; owner filter excludes saId; twin includes saId** |
| lib/visibility.ts | saId arm + handoff comment removed | SA/PIPELINE-REMOVAL | Keep INTERNAL |
| routes/admin.ts | projectsAsSA / sa includes removed (7 hunks) | SA-REMOVAL | Keep INTERNAL |
| routes/customers.ts | health roll-up + `today`; owner-only tamId change/delete | HEALTH/CUSTOMERS/MEMBERS | Port |
| routes/customers.ts | `sa` include removed | SA-REMOVAL | Keep INTERNAL |
| routes/dailyReview.ts | scope → lib/dailyReviewScope (member arm); helpers → lib/projectHealth | OVERVIEW/MEMBERS | Port |
| routes/holidays.ts | inline vs lib/holidays.ts | PIPELINE (refactor) | Keep INTERNAL |
| routes/overview.ts | workCounts + GET /overview/badges | OVERVIEW | Port |
| routes/risks.ts, sections.ts | activity events | ACTIVITY | Port |
| routes/users.ts | `active`, `avatarUrl` | MEMBERS/MENTION/UIPASS | Port |
| routes/tasks.ts | filters/sort/X-Total-Count | TASKVIEWS | Port |
| routes/tasks.ts | row lock + `expected` → 409 stale_write | CONFLICT | Port |
| routes/tasks.ts | epicId, itopTicketRef, auto-membership, activity, notifications, mentions | EPIC/ITOP/MEMBERS/ACTIVITY/NOTIF/MENTION | Port |
| routes/projects.ts | health, epics endpoints, owner-only, activity, notifications, auto-membership | HEALTH/EPIC/MEMBERS/ACTIVITY/NOTIF | Port |
| routes/projects.ts | saId schema/include/connect removed; Opportunity comments removed | SA/PIPELINE-REMOVAL | Keep INTERNAL (+ decide saId owner-only) |
| lib/projectHealth.ts | new | HEALTH | Port |
| lib/dailyReviewScope.ts | new | OVERVIEW | Port |
| http/requestLogger.ts | new | SECURITY | **Port first** |
| http/trustProxy.ts | new | SECURITY | Port |
| http/rateLimit.ts | new | SHARE | Port |
| lib/activity*.ts, notifications.ts, projectMembers.ts, shareLinks.ts, secretBox.ts, epics.ts, itop/, routes (activity, epics, itop*, notifications, projectMembers, publicShare, shareLinks, utilization, webhook) | new (feature specs own details) | ACTIVITY/NOTIF/MEMBERS/SHARE/ITOP/EPIC/UTIL | Port |
| scripts/seed-demo.ts | new demo seeder | OTHER/UIPASS | Optional port, adapt (SA user, saId, maybe opportunities) |
| scripts/import-velora.ts, lib/holidays/workingDays/pipelineSla/pipelineAccess, routes/opportunit*, migration opportunity_flow_redesign | INTERNAL-only | PIPELINE | Keep |
| prisma/schema.prisma | +ItopConfig/ItopTicket/ItopTimeEntry, +Epic, +ProjectMember, +ActivityEvent, +Notification, +ShareLink, +User/Customer/Task/Comment columns | ITOP/EPIC/MEMBERS/ACTIVITY/NOTIF/SHARE/MENTION | Port via fresh migrations |
| prisma/schema.prisma | Pipeline enums/models, saId removed | PIPELINE/SA-REMOVAL | Keep INTERNAL |
| migrations | 12 additive CUST migrations | various | Re-generate with fresh timestamps (§5.3) |
| migrations | 20260922034304_remove_pipeline_module | PIPELINE/SA-REMOVAL | **Never apply** |
| prisma/seed.ts | SA/SALES roles removed | SA/PIPELINE-REMOVAL | Keep INTERNAL |
| backend tests | 31 new files (+fake iTop) ≈313 cases | all features | Port with features (+SA cases) |
| backend tests | 13 differing files | SA/PIPELINE-REMOVAL, EPIC, ITOP | Keep INTERNAL versions; add EPIC bits + test/env SECRETS_KEY |
| package.json ×3, lockfiles | identical | — | Nothing |
| backend/.env.example | SECRETS_KEY | ITOP | Port |
| setup.sh | TRUST_PROXY (doc, validator, input, env, .env) | SECURITY/SHARE | Port |
| setup.sh | SECRETS_KEY generate + upgrade-append | ITOP | Port (critical for upgrades) |
| setup.sh | `solvro-cust-*` image names | PACKAGING | Skip |
| ci/docker-compose.ci.yml, ci/.env.ci.example, ci.yml | SECRETS_KEY | ITOP | Port |
| docker-publish.yml | branch-tag fix for workflow_run | OTHER (bugfix) | **Port (bug present in INTERNAL)** |
| docker-publish.yml | IMAGE_NAME = repo | PACKAGING | Skip |
| Dockerfiles, .dockerignore | identical | — | Nothing |
| frontend/nginx.conf | guest-link locations, no access log | SHARE | Port |
| frontend/vite.config.ts | `/share/` SW denylist | SHARE | Port |
| frontend/vite.config.ts | VITE_ALLOWED_HOSTS | OTHER | Optional (replaces untracked vite.config.local.ts) |
| .gitignore | ui-ux-qa-run/shots; comment; New UI/ move | UIPASS/OTHER | Port shots line if QA docs ported; keep INTERNAL comment |
| docs/CONFIGURATION.md | SECRETS_KEY/TRUST_PROXY/ITOP_SYNC_DISABLED rows, rotate-JWT note, redaction, guest-link nginx, iTop §2.16 | ITOP/SECURITY/SHARE | Port (renumber around INTERNAL's Pipeline §2.16) |
| docs/CONFIGURATION.md | velora/pipeline/SA removals, cust image names | PIPELINE/SA/PACKAGING | Skip |
| CLAUDE.md (root) | itop/board drag layer, iTop-writes guardrail, Vite HMR trap | ITOP/OTHER | Adopt (propose guardrail edits) |
| CLAUDE.md (root) | Product/Pipeline/SA/WorkLogs changes | PIPELINE/SA-REMOVAL | Skip; new SA-owner + WorkLogs + webhook wording (§9) |
| backend/CLAUDE.md | visibility/owner-only, public surface, request logging, shadow-DB trap | MEMBERS/SHARE/SECURITY/OTHER | Adopt (SA-adapted) |
| frontend/CLAUDE.md | formatDate/labels/text-meta, routeMeta | UIPASS | Adopt; keep pipelineKeys |
| .claude/ gates.sh | comment only | — | Keep INTERNAL; add proposed checks (§8.4) |
| .claude/ reply-style, settings.local | INTERNAL newer | — | Keep INTERNAL |
| docs/DESIGN.md | text-meta, panels, EpicChip, NotificationBell, TicketCard; older Pipeline chips | UIPASS/EPIC/ITOP/NOTIF | Port additions; keep INTERNAL Pipeline chips |
| docs/archive/plans | itop-integration, itop-integration-spec, collaboration-and-sharing, epics-spec, ui-ux-* | ITOP/MEMBERS…/EPIC/UIPASS | Port (cited by code) |
| docs/reference/itop-integration-guide.md | new | ITOP | Port |
| docs/ISSUES.md | iTop, UI pass, collaboration deferred findings | ITOP/UIPASS/… | Port; skip Pipeline-removal section |
| docs/plans/setup-sh-hardening.md | unapproved proposal | PACKAGING/OTHER | Surface to user only |
| README.md | iTop/Utilization sections; SA/Pipeline removed | ITOP/UTIL; PIPELINE | Port additions only |
| INSTALL/OPERATIONS/SUPPORT/LICENSE/VERSION/notes/, customer-repo-guardrails-draft | distribution files | PACKAGING | Skip |

## 11. Top risks
1. **Visibility/ownership with SA** — CUST's `viaMembership:false` = "owner" assumes no SA arm. Porting verbatim into INTERNAL either drops SA visibility (if saId arm is lost in the merge) or lets SAs perform owner-only actions (if the owner filter keeps saId). `canUserSeeProject` twin must add `saId` or SAs silently miss @mention filtering/notifications (`filterActiveUsersWhoCanSeeProject`) — parity test only covers arms CUST knew about.
2. **SECRETS_KEY is boot-required** — env.ts, test/env.ts, ci.yml (2 jobs), ci compose, setup.sh (fresh + upgrade path), local dev docker-compose.yml, and docs must land together, or prod/CI/dev crash-loop.
3. **Migration ordering** — CUST timestamps (2026-09-22…30) predate INTERNAL's 2026-09-25 Pipeline migration; copying dirs verbatim interleaves history. Regenerate with fresh timestamps; never copy `remove_pipeline_module`.
4. **tasks.ts PATCH rewrite** (spine) bundles CONFLICT + ACTIVITY + NOTIF + MEMBERS + EPIC + ITOP in one hunk — hard to split across feature PRs; land the row-lock/`derive`/`finish` skeleton first, then layer features, or accept one larger PR.
5. **Token logging today** — bearer JWTs are in INTERNAL's existing logs; after porting the redaction, rotate `JWT_SECRET` once (CUST CONFIGURATION.md note).
6. **TRUST_PROXY default 1** vs INTERNAL's tunnel → nginx topology: wrong hop count puts all guests in one rate-limit bucket (or allows spoofing). Verify before SHARE.
7. Backend gate runtime: +≈313 serial vitest cases (`fileParallelism:false`).
8. Unverified: iTop admin route permission gating, CI job timeouts, OPERATIONS.md content, whether frontend reads `X-Total-Count` via same-origin only.
