# Known Issues

Open issues, sorted by area and then by severity. Each issue has an ID (`ISS-NNN`) that never changes and is never reused. Code comments and plans cite an issue by its ID.

Last full triage: 2026-11-18 @ `4bb01a4`. The file before the restructure is kept verbatim at `docs/archive/ISSUES-2026-11-18-phase-log.md`; the mapping from every old entry to its ID, or to the reason it closed, is the ledger in `docs/archive/plans/issues-restructure.md`.

## How to use this file

- **Severity.** P1: wrong data, a security or privacy exposure, or a break with no workaround; deferring one needs the user's explicit note. P2: a defect with a workaround, a correctness gap, a missing test on a risky path, or a gap in a gate or process. P3: polish, cosmetic issues, stale comments, hygiene.
- **Type.** `bug` · `debt` · `test-gap` · `watch` (no action until the stated trigger) · `decision` (waits on a user decision; the entry states the question).
- **Areas**, in this order: Security & auth · Data & performance · Backend/API · Frontend UI · Accessibility & tokens · Gantt · Boards & drag · Pipeline · iTop · Exports & sharing · Tests & CI · Dev env & ops · Docs & process.
- **New issue:** the next ID is the highest existing ID plus one. Search for an entry with the same root cause first, and update it instead of adding a second one. Keep the body to six lines or fewer.
- **Closing:** when shipped work fixes or moots an issue (checked against the code, never assumed), delete its body and add one line under `## Closed`: ID, date, commit or CHANGELOG reference, title.
- **Where** names a symbol and a file; the line number is a hint only. **Verified** shows when the location was last checked.

## Open — Security & auth

### ISS-002 · P2 · Token-ownership check: residual risk on some iTop installs

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** PUT /itop/me/token ownership check in backend/src/routes/itopUser.ts (PersonalToken read, line ~215)
- **Problem:** On installs where a profile can read other users' PersonalToken rows (over-readable), a foreign token that can read Persons still passes the ownership check (impersonation with a stolen credential, not escalation). An unreadable PersonalToken class is refused since ISS-004 closed (fail closed).
- **Why deferred / fix direction:** Grant PersonalToken read to the TAM profile or add an iTop-side whoami extension; verify the code-100 path against the real install and record it. Also check there: a profile without read rights may get an empty PersonalToken result instead of an error, which shows `itop_token_not_yours` where `itop_token_unverified` would tell the admin what to fix (still fails closed).
- **Source:** snapshot line 2048, section "iTop integration (personal tokens, ticket actions) — deferred findings (ported 2026-10-04)"; merged duplicates at snapshot lines 2233

### ISS-003 · P2 · GET /itop/services returns every organisation's services, unscoped

- **Type:** decision · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** itopRouter.get('/services') in backend/src/routes/itop.ts (line ~987)
- **Problem:** Question for the user: scope services to the target customer's organisation (lnkCustomerContractToService), or accept and document org-wide visibility? Today any signed-in user can read every iTop organisation name via providerName.
- **Why deferred / fix direction:** Filter by the target customer's org once a customerId is known, or document the accepted visibility before the endpoint is reused.
- **Source:** snapshot line 2117, section "iTop integration (board, new tickets) — deferred findings (ported 2026-10-04)"

### ISS-005 · P2 · Product decisions: STAKEHOLDER/SA task comments; built-in role policy

- **Type:** decision · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** task comment routes in backend/src/routes/tasks.ts; built-in roles in backend/prisma/seed.ts
- **Problem:** Two product questions are unanswered: may STAKEHOLDER (project:read) and the SA role (pipeline:view) post task comments, and should built-in roles stay admin-editable (policy A) or become code-owned and read-only in the Roles UI (policy B).
- **Why deferred / fix direction:** Needs a user ruling. Until then comments stay open to both roles and built-ins stay editable.
- **Source:** snapshot line 2368, section "Application review 2026-10-22 — remaining open items"

### ISS-006 · P3 · POST /tasks/:id/duplicate needs task:write, create needs project:write

- **Type:** decision · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** duplicate route in backend/src/routes/tasks.ts (line ~635) vs create in backend/src/routes/projects.ts (line ~598)
- **Problem:** A custom role holding task:write without project:write can duplicate tasks it could not create. Settled as plan Decision 11 (record only); seeded roles never split the two.
- **Why deferred / fix direction:** No fix unless a custom-role split becomes real; revisit if the user wants duplicate to require project:write.
- **Source:** snapshot line 1789, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-007 · P3 · No pino redact configuration for the iTop token

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** pino() call in backend/src/logger.ts (line ~4)
- **Problem:** The shared logger has no redact paths for token / Auth-Token; no current code path logs the token, so it is defence in depth only.
- **Why deferred / fix direction:** Add a redact array (token, Auth-Token, personal-token fields) to the pino() options.
- **Source:** snapshot line 1927, section "iTop integration (connection, snapshot, Tickets tab) — deferred findings (ported 2026-10-04)"

### ISS-008 · P3 · Rate limiter is in-process only

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** createRateLimiter in backend/src/http/rateLimit.ts
- **Problem:** Counters live in memory per backend instance and reset on restart, so with more than one instance the effective limit multiplies.
- **Why deferred / fix direction:** Fine for the single-instance deployment; needs a shared store if the backend is ever scaled out.
- **Source:** snapshot line 2285, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-009 · P3 · Secrets at rest: no tag-length check, no AAD, no key rotation

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** seal/open in backend/src/lib/secretBox.ts (lines ~27-60)
- **Problem:** Node accepts truncated GCM tags; no additional data binds a sealed value to its column; rotating SECRETS_KEY makes every sealed value unreadable until re-entered. All need DB write access.
- **Why deferred / fix direction:** Pass authTagLength: 16, bind AAD per column, and add a key id for rotation.
- **Source:** snapshot line 2298, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-010 · P3 · GET /users still returns email to every project:read / pipeline:view caller

- **Type:** debt · **Found:** 2026-10-06 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** GET /users in backend/src/routes/users.ts (lines ~12-45)
- **Problem:** Pickers need the email to tell people apart, so it goes to every caller with those permissions. The PENDING exposure (M2) is closed by the gate.
- **Why deferred / fix direction:** Minimising further needs a picker-specific response shape. Low priority.
- **Source:** snapshot line 2352, section "Penetration-test remediation (September 2026 report) — follow-ups (2026-10-06)"

### ISS-011 · P3 · Sign-in failure counters share the client address with the guest-link limiter

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** assertSignInAllowed in backend/src/routes/auth.ts (line ~56)
- **Problem:** Behind a CDN with public edge addresses and a hop-count TRUST_PROXY that does not cover it, all users share one address bucket, so 50 failures from anyone block password sign-in for everyone for up to 15 minutes.
- **Why deferred / fix direction:** Only matters if that topology is used (documented in docs/CONFIGURATION.md 2.13). Fix then: per-account-only fallback when the address is a known proxy.
- **Source:** snapshot line 2380, section "Application review 2026-10-22 — remaining open items"

### ISS-012 · P3 · Cross-tab sign-out leaves the other tab on cached pages

- **Type:** bug · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** 401 guard in frontend/src/lib/api.ts (line ~158); frontend/src/lib/auth.tsx
- **Problem:** After tab A signs out, tab B sends requests with no Authorization, the 401 guard never fires UNAUTHENTICATED_EVENT, and tab B shows cached pages over failing requests until reload.
- **Why deferred / fix direction:** Add a window 'storage' listener in AuthProvider that signs the tab out when the token key is cleared.
- **Source:** snapshot line 2382, section "Application review 2026-10-22 — remaining open items"

## Open — Data & performance

### ISS-013 · P2 · GET /users is unpaginated

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** GET / handler in backend/src/routes/users.ts (line ~15)
- **Problem:** Every user is returned and rendered as an <option> in the assignee select.
- **Why deferred / fix direction:** Paginate or add search-filter/cap to the endpoint and pickers.
- **Source:** snapshot line 567, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-014 · P2 · GET /tasks has a 200-row window

- **Type:** bug · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** GET / handler in backend/src/routes/tasks.ts (line ~328)
- **Problem:** On a large DB the /tasks page silently shows only the first 200 rows; only the count line tells the user.
- **Why deferred / fix direction:** Add project/customer/date filters or real pagination.
- **Source:** snapshot line 575, section "Kanban → ReUI swap — deferred findings (2026-07-27)"; merged duplicates at snapshot lines 2257

### ISS-015 · P2 · Admin Project Overrides reassign select renders every candidate per row

- **Type:** debt · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** reassign column cell in frontend/src/pages/Admin.tsx (line ~1693)
- **Problem:** Each row renders an unfiltered select of all active users with no pagination. Harmless at 8 users, heavy at production scale.
- **Why deferred / fix direction:** Replace with a searchable picker or paginate; shares its root with the unpaginated GET /users entry.
- **Source:** snapshot line 1426, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-017 · P3 · Offboarding and user delete update customers one at a time

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** offboard customer loop and reassignOwnedCustomers in backend/src/lib/offboarding.ts (lines ~349, ~463)
- **Problem:** Each customer costs about 3 ms (an active-user check and an update), which is what holds the cap at 2,000.
- **Why deferred / fix direction:** Check each distinct newOwnerId once and use one updateMany per new owner.
- **Source:** snapshot line 301, section "Tech debt / follow-ups from recent work"

### ISS-018 · P3 · ensureTaskVisible adds a second DB round-trip per task mutation

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ensureTaskVisible in backend/src/lib/visibility.ts (line ~129)
- **Problem:** Visibility check then write costs two round-trips; Prisma update accepts only a unique where so the filter cannot be folded in.
- **Why deferred / fix direction:** Trigger: profiling against the sub-200ms NFR. Then use updateMany with a visibility filter and inspect the count.
- **Source:** snapshot line 320, section "Tech debt / follow-ups from recent work"

### ISS-019 · P3 · pg_trgm GIN index for /search

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ILIKE queries in backend/src/routes/search.ts
- **Problem:** Seq scans are fine today (0.6-2.6ms at 4k tasks) but grow linearly.
- **Why deferred / fix direction:** Trigger: task rows near 50k or /search p95 above 100ms. Schema change is ask-first.
- **Source:** snapshot line 649, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-020 · P3 · GET /notes/recent has no index leading with noteDate

- **Type:** watch · **Found:** 2026-08-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** GET /recent in backend/src/routes/notes.ts (line ~61)
- **Problem:** The route range-scans project and customer notes by noteDate with no index leading on it, so it plans a seq scan. Fast at dev volume.
- **Why deferred / fix direction:** Add @@index([noteDate]) on both models via migration when volume grows (about 10k notes a year is the stated horizon).
- **Source:** snapshot line 1662, section "Daily Review collapse & Recent notes — deferred findings (2026-08-31)"

### ISS-021 · P3 · useCreateTask omits the Daily Review invalidation

- **Type:** bug · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useCreateTask in frontend/src/lib/queries.ts (line ~2172)
- **Problem:** Creating an overdue TODO task leaves Daily Review attention lists stale until staleTime elapses; sibling mutations invalidate dailyReviewRoot.
- **Why deferred / fix direction:** Add `qc.invalidateQueries({ queryKey: queryKeys.dailyReviewRoot })` to onSuccess.
- **Source:** snapshot line 1770, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-022 · P3 · useDuplicateTask/Section isPending includes inactive-query refetches

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useDuplicateTask / useDuplicateSection in frontend/src/lib/queries.ts (line ~2200)
- **Problem:** isPending waits on inactive queries too; near-zero cost since inactive queries refetch lazily. Considered, not taken.
- **Why deferred / fix direction:** Optionally await only projectTasks and fire the rest un-awaited.
- **Source:** snapshot line 1820, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-023 · P3 · Activity feed orders by id while the index is (project_id, created_at desc)

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** activity list query in backend/src/lib/activity.ts (line ~278); ActivityEvent indexes in backend/prisma/schema.prisma (line ~360)
- **Problem:** Ordering by id does not match the created_at index; measured under 1 ms at 200k rows so no action needed now.
- **Why deferred / fix direction:** Add a (project_id, id desc) index only if feed latency ever matters (trigger: slow feed query at larger row counts).
- **Source:** snapshot line 2278, section "Collaboration & sharing — activity log, notifications, @mentions — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-024 · P3 · Members backfill also inserts project:view-all holders

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** migration 20261004120700_project_members (line ~31)
- **Problem:** Users whose role already sees every project (e.g. STAKEHOLDER) got redundant member rows that show in the Members list. Harmless.
- **Why deferred / fix direction:** Optional: a one-off cleanup deleting rows for roles with project:view-all or *; otherwise accept.
- **Source:** snapshot line 2318, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-025 · P3 · Section duplicate does one INSERT per copied task under a 30 s transaction

- **Type:** debt · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** duplicateTaskTree in backend/src/lib/duplicate.ts (line ~63); duplicate route in backend/src/routes/sections.ts (line ~166)
- **Problem:** Duplicating a large section inserts task by task and records one activity event per copied top-level task while holding the project lock.
- **Why deferred / fix direction:** Batch with createMany to shorten the lock.
- **Source:** snapshot line 2386, section "Application review 2026-10-22 — remaining open items"

## Open — Backend/API

### ISS-030 · P2 · Offboarding endpoint accepts a receiver whose role has zero permissions

- **Type:** bug · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** offboard receivers in backend/src/lib/offboarding.ts (line ~236); filter in frontend/src/lib/handover.ts:84
- **Problem:** POST /admin/users/:id/offboard accepts a receiver with no useful permissions or a PENDING account; only the UI filters them.
- **Why deferred / fix direction:** Reject PENDING and zero-permission receivers server-side.
- **Source:** snapshot line 2399, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-031 · P3 · Offboarding a TAM with more than 500 projects is refused

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** offboardSchema in backend/src/routes/admin.ts (line ~291); project loop in backend/src/lib/offboarding.ts
- **Problem:** The project list is capped at 500 because the per-project writes (activity events, notifications) are heavy and share the 30 s transaction timeout.
- **Why deferred / fix direction:** Needs a measurement first: time a large handover, batch per-project writes, then raise the cap.
- **Source:** snapshot line 293, section "Tech debt / follow-ups from recent work"

### ISS-032 · P3 · Inactive services can still be assigned to projects and customers

- **Type:** decision · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ServiceMappingList.tsx (line ~329) and ProjectServices.tsx missingSubscribed (line ~34)
- **Problem:** Question for the user: should active:false services block new assignments? Today the picker shows them dimmed but toggleable and 'Add customer's services' carries inactive subscriptions over.
- **Why deferred / fix direction:** Blocked on a product call; if yes, filter in the picker and in the bulk add, and reject on the PUT routes.
- **Source:** snapshot line 315, section "Tech debt / follow-ups from recent work"

### ISS-033 · P3 · Three narrow task selects omit isCriticalPath

- **Type:** watch · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** task selects in backend/src/routes/dailyReview.ts (~237), routes/search.ts (~58), lib/portfolio.ts (~34)
- **Problem:** Daily Review, global search and the portfolio roll-up select tasks without isCriticalPath, so the mark cannot be shown there.
- **Why deferred / fix direction:** Not needed today; widen the three selects only if the mark is ever surfaced on those surfaces.
- **Source:** snapshot line 1717, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-034 · P3 · A task cannot be created with an iTop ticket ref pre-set

- **Type:** decision · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** createTaskSchema in backend/src/routes/projects.ts (POST /:id/tasks, line ~598)
- **Problem:** Question for the user: should create-time pinning of an iTop ticket ref be supported (e.g. from a create-iTop-ticket flow), or is PATCH-only fine indefinitely?
- **Why deferred / fix direction:** Add itopTicketRef to the create schema if approved; otherwise record PATCH-only as settled.
- **Source:** snapshot line 1985, section "iTop integration (webhook, task ticket links) — deferred findings (ported 2026-10-04)"

### ISS-035 · P3 · Epic ownerId not validated against the project's people

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** epic ownerId handling in backend/src/routes/epics.ts (line ~161) and routes/projects.ts (line ~805)
- **Problem:** Any existing user can own an epic regardless of the project's TAM/SA/members (ported as is by user decision). The FK 500 and misleading 404 symptoms were fixed in 2275683.
- **Why deferred / fix direction:** Validate the owner against the project's people (400 owner_not_in_project) if the rule is wanted.
- **Source:** snapshot line 2215, section "Epics — deferred findings (ported 2026-10-05)"; merged duplicates at snapshot lines 2314

### ISS-036 · P3 · CORS config has no exposedHeaders (X-Total-Count)

- **Type:** watch · **Found:** 2026-09-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** cors() in backend/src/app.ts (line ~62)
- **Problem:** Cross-origin callers cannot read X-Total-Count; the same-origin /api proxy is unaffected.
- **Why deferred / fix direction:** Add exposedHeaders: ['X-Total-Count'] only if the API is ever called cross-origin.
- **Source:** snapshot line 2256, section "Professional UI pass — deferred findings (2026-09-29, ported 2026-10-05)"

### ISS-037 · P3 · Ordinary edit routes still accept an inactive user as assignee/TAM/SA/owner

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** assertActiveUser(... { requireActive: false }) calls in backend/src/routes/projects.ts, customers.ts, epics.ts
- **Problem:** Only the offboarding path requires active receivers; ordinary edits can assign work to a deactivated account.
- **Why deferred / fix direction:** Needs a decision on whether to tighten; existing tests pin the tolerance for PATCH /projects/:id.
- **Source:** snapshot line 2400, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-038 · P3 · A handover does not notify a new customer owner

- **Type:** decision · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** logCustomerOwnerChanges in backend/src/lib/offboarding.ts (line ~506)
- **Problem:** Should a new customer owner be notified? It needs a customer scope on ActivityEvent (migration plus an arm in routes/notifications.ts).
- **Why deferred / fix direction:** Waiting for a user decision on whether the schema change is worth it.
- **Source:** snapshot line 2401, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-040 · P3 · Backend-produced text with em dashes still reaches the interface

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** backend/src/lib/projectHealth.ts (line ~143), routes/opportunities.ts (~629), routes/itop.ts, routes/itopUser.ts (~114)
- **Problem:** Backend strings with em dashes (and a '—' empty mark) reach the UI; the em-dash gate does not scan the backend.
- **Why deferred / fix direction:** Rewrite the strings and return the empty mark as null for the client to render.
- **Source:** snapshot line 2418, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-183 · P3 · Task create accepts a due date before the start date

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `39af8f6`
- **Where:** POST /projects/:id/tasks in backend/src/routes/projects.ts (line ~597); createTaskSchema refine (line ~145)
- **Problem:** PATCH /tasks/:id refuses an effective due date before the start date since ISS-028 closed, but POST /projects/:id/tasks has no such check, so a new task can start inverted.
- **Why deferred / fix direction:** Found at the end of the ISS-028 fix. Add the same check (400 `invalid_date_range`) to create, with a test.

### ISS-184 · P3 · Pipeline stage re-pack and offboarding lock deals in different orders

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `de9ae4a`
- **Where:** insertAtStage / closeGapInStage UPDATEs in backend/src/routes/opportunities.ts (lines ~374, ~394) vs the deal reassignment in backend/src/lib/offboarding.ts (line ~390)
- **Problem:** The set-based re-pack locks sibling rows in scan order; offboarding locks deals ORDER BY id and takes no stage lock. A re-pack and a PIC reassignment on overlapping deals can deadlock. The old per-row loop had the same exposure.
- **Why deferred / fix direction:** Rare (needs a concurrent offboarding). Lock the stage's rows with SELECT id ... ORDER BY id FOR NO KEY UPDATE before the UPDATE.

## Open — Frontend UI

### ISS-043 · P2 · Material Symbols stylesheet overrides icon size/display utilities

- **Type:** bug · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Material Symbols <link> in frontend/index.html (line ~19)
- **Problem:** The unlayered Google stylesheet sets display:inline-block and font-size:24px on .material-symbols-outlined, so it beats Tailwind v4 utilities: hidden/sm:inline do not hide an icon and text-base/text-[20px] on icons are likely no-ops.
- **Why deferred / fix direction:** Load the stylesheet into a layer below utilities or wrap icons in sized elements, then re-check every icon size class.
- **Source:** snapshot line 2378, section "Application review 2026-10-22 — remaining open items"; merged duplicates at snapshot lines 1685

### ISS-044 · P3 · Service-mapping mutations lack optimistic updates

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useUpdateProjectServices / useUpdateCustomerServices in frontend/src/lib/queries.ts (lines ~1774, ~1789)
- **Problem:** The service-mapping checkboxes and tool chips disable while saving; correct but not instant.
- **Why deferred / fix direction:** Add onMutate snapshot, optimistic services[] patch, onError rollback and onSettled invalidate to both hooks together.
- **Source:** snapshot line 308, section "Tech debt / follow-ups from recent work"

### ISS-045 · P3 · Section-color parity gap on non-Gantt surfaces (no fallback resolver)

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** section.color uses in ProjectList.tsx (line ~727), Executive.tsx (~329), TaskPanel.tsx (~728)
- **Problem:** Uncustomized sections render vivid presets on the Gantt but legacy slate #94a3b8 in the List tab, Executive roll-up chips and the task-panel dot.
- **Why deferred / fix direction:** Export a shared resolver from lib/gantt/palette.ts or centralize the fallback server-side in the Section query.
- **Source:** snapshot line 383, section "Tech debt / follow-ups from recent work"

### ISS-046 · P3 · TaskPanel section chip stale during cross-section drag

- **Type:** bug · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** reorderTasksLocally in frontend/src/lib/queries.ts (line ~1871); TaskPanel.tsx section chip (line ~725)
- **Problem:** During a cross-section move's optimistic window, a TaskPanel open on the dragged task shows the old section chip until the refetch settles.
- **Why deferred / fix direction:** Transient and self-healing. Fix: recompute nested section from the sections cache inside reorderTasksLocally.
- **Source:** snapshot line 407, section "Tech debt / follow-ups from recent work"

### ISS-047 · P3 · Comment composer is a single-line input

- **Type:** debt · **Found:** 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** CommentComposer in frontend/src/components/CommentMentions.tsx (line ~196)
- **Problem:** Task comments are typed into a single-line input that scrolls horizontally for long text (max 5000 chars).
- **Why deferred / fix direction:** Switch the non-note variant to an auto-growing textarea.
- **Source:** snapshot line 506, section "Gantt GH #58 deferred findings (2026-07-24)"

### ISS-048 · P3 · Popovers can clip near scroll container bottoms

- **Type:** watch · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** absolute-positioned dropdowns in List rows, Kanban column menu, Risks selects
- **Problem:** Absolute-positioned popovers near the bottom of internally scrolling containers can be clipped instead of flipping.
- **Why deferred / fix direction:** Revisit if a user reports it; fix by portalling the popovers.
- **Source:** snapshot line 517, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

### ISS-049 · P3 · Only a 512 maskable icon declared

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** manifest icons in frontend/vite.config.ts (line ~36)
- **Problem:** Low-DPI Android launchers downscale the 512 maskable icon.
- **Why deferred / fix direction:** Generate icon-maskable-192.png and add a manifest entry.
- **Source:** snapshot line 546, section "PWA icon regeneration — deferred findings (2026-07-25/26)"

### ISS-050 · P3 · No board-adjacent subtask promote/re-parent

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TaskPanel.tsx; TaskFormModal Parent field (line ~589)
- **Problem:** Promoting or re-parenting a subtask requires the modal round-trip.
- **Why deferred / fix direction:** Revisit if usage shows the modal is friction (Promote to task row-menu action).
- **Source:** snapshot line 586, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-052 · P3 · Palette visual polish

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** CommandPalette.tsx (lines ~201, ~247); layout/TopBar.tsx (lines ~164, ~175)
- **Problem:** Dead classes, a search trigger with no hover/focus affordance, and a Mac-only shortcut glyph.
- **Why deferred / fix direction:** Delete dead classes, add hover/focus styles, show Ctrl K off macOS.
- **Source:** snapshot line 708, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-053 · P3 · dropdown-menu SubContent shares popover's z-index-on-Popup gap

- **Type:** debt · **Found:** 2026-07-28 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** DropdownMenuSubContent in frontend/src/components/ui/dropdown-menu.tsx (line ~264)
- **Problem:** A submenu cannot outrank a z-100+ Modal/Drawer host; latent because none is mounted there today.
- **Why deferred / fix direction:** Port positionerClassName to SubContent when a real collision appears.
- **Source:** snapshot line 788, section "ReUI DateField swap — deferred findings (2026-07-28)"

### ISS-054 · P3 · Stat-card Frame evaluation for Overview and Executive deferred

- **Type:** decision · **Found:** 2026-07-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** KPI stat cards in pages/Overview.tsx and pages/Executive.tsx
- **Problem:** Whether the KPI stat cards should adopt the vendored Frame was never decided. Question for the user: adopt Frame for stat cards, or close this as not needed?
- **Why deferred / fix direction:** Decide, then either migrate or drop the entry.
- **Source:** snapshot line 1161, section "ReUI Presentation Set — deferred findings (2026-07-31)"

### ISS-055 · P3 · Pointer-dependent initial submenu highlight

- **Type:** watch · **Found:** 2026-07-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** submenu highlight in frontend/src/components/reui/filters.tsx (lines ~1496, 1521)
- **Problem:** Whichever row lands under the cursor when a submenu opens wins the highlight, so a blind Enter can pick another row. Upstream hover-follows-highlight behavior.
- **Why deferred / fix direction:** Not worth a vendored patch; revisit only if reported.
- **Source:** snapshot line 1231, section "ReUI Filters phase — deferred findings (2026-07-31)"

### ISS-056 · P3 · Toolbar text-size drift in migrated filter rows

- **Type:** decision · **Found:** 2026-07-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** filter toolbar rows in frontend/src/components/reui/filters.tsx
- **Problem:** Migrated filter rows mix 15px, 13px and 12px text where the old dropdowns used a uniform 12-13px. Question for the user: match the old uniform density or keep the mixed scale?
- **Why deferred / fix direction:** Decide the density, then align or close.
- **Source:** snapshot line 1255, section "ReUI Filters phase — deferred findings (2026-07-31)"

### ISS-057 · P3 · Duplicate-chip guard uses === and misses object-valued options

- **Type:** watch · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** findFilterMatch in frontend/src/components/reui/filters.tsx (line ~2329)
- **Problem:** Correct for every current string-valued filter field, but a future object-valued field would not be deduplicated.
- **Why deferred / fix direction:** Deepen the equality check when such a field is added.
- **Source:** snapshot line 1412, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-058 · P3 · ProjectRisks inline cells use plain select instead of ui/select

- **Type:** debt · **Found:** 2026-08-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** probability, impact and status cells in frontend/src/pages/views/ProjectRisks.tsx (lines ~378, 409, 457)
- **Problem:** Risk editors use hand-rolled selects while the Daily Review lists use the vendored ui/select.
- **Why deferred / fix direction:** Align on ui/select the next time the file is touched.
- **Source:** snapshot line 1631, section "Daily Review v2 — deferred findings (2026-08-29)"

### ISS-059 · P3 · CriticalPathMark chip padding coupled to Chip's DOM shape

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** CriticalPathMark in frontend/src/components/CriticalPathMark.tsx (line ~56)
- **Problem:** The compact variant reaches into Chip's root span via `[&>span]:px-1.5`; padding breaks silently if Chip gains a wrapper element.
- **Why deferred / fix direction:** If Chip's markup changes, grep `[&>span]:px-1.5` and move the override to the new root.
- **Source:** snapshot line 1709, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-060 · P3 · Tasks.tsx grid and kanban-v2 SubtaskRow show no Critical Path mark

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** PriorityBadge cell in frontend/src/pages/Tasks.tsx (line ~294); SubtaskRow in frontend/src/components/kanban-v2/cards.tsx (line ~224)
- **Problem:** Two task surfaces outside the mark's per-surface table do not show the Critical Path flag, unlike every other surface.
- **Why deferred / fix direction:** Add CriticalPathMark (glyph/chip) beside the priority indicator if either surface is revisited.
- **Source:** snapshot line 1724, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-061 · P3 · TaskPanel header-menu failure alert renders below the subtasks

- **Type:** bug · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** error Alert in frontend/src/components/TaskPanel.tsx (line ~991)
- **Problem:** A failed Delete/Duplicate from the header menu shows its error below a long subtasks list, off-screen with no feedback.
- **Why deferred / fix direction:** Render the Alert at the top of the scroll container or scroll to top when a header-menu action sets the error.
- **Source:** snapshot line 1761, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-062 · P3 · ProjectList section-header actions gate on task:write; routes need project:write

- **Type:** bug · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** canEdit in frontend/src/pages/views/ProjectList.tsx (line ~119); section routes in backend/src/routes/sections.ts
- **Problem:** A custom role with task:write only sees Rename/Duplicate/Delete/Add section and gets a 403 in the action alert.
- **Why deferred / fix direction:** Introduce `canEditSections = hasPermission(user,'project:write')` and apply to the whole header action group.
- **Source:** snapshot line 1800, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-063 · P3 · Missing-title banner doesn't name the offending card

- **Type:** bug · **Found:** 2026-09-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** setError in frontend/src/components/daily-review/MidweekSyncModal.tsx (line ~171) and ReflectionSyncModal.tsx (line ~202)
- **Problem:** A blocked save shows one banner at the top, with no marker on the achievement/highlight card missing its title.
- **Why deferred / fix direction:** Mark the offending card (error-tone border) or scroll/focus it when save is blocked.
- **Source:** snapshot line 1863, section "Weekly Sync achievement rows — deferred findings (2026-09-10)"

### ISS-064 · P3 · GET /customers/:id itopOrgId/itopOrgName not typed or used on frontend

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** CustomerDetail type in frontend/src/lib/queries.ts (line ~157); frontend/src/pages/CustomerDetail.tsx (lines ~50, ~206)
- **Problem:** The backend returns itopOrgId/itopOrgName (include without select) but the frontend neither types nor reads them, and a code comment wrongly blames a select.
- **Why deferred / fix direction:** Type and use the fields directly, or trim the response with a real select; fix the comment either way.
- **Source:** snapshot line 1910, section "iTop integration (connection, snapshot, Tickets tab) — deferred findings (ported 2026-10-04)"

### ISS-065 · P3 · useItopTicket utcOffsetMinutes isn't part of its query key

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useItopTicket in frontend/src/lib/queries.ts (line ~3663)
- **Problem:** The 'x h this week' figure can read stale-by-timezone after a DST change or timezone switch until staleTime elapses.
- **Why deferred / fix direction:** Fold utcOffsetMinutes into the key only if the shared setQueryData/invalidate sites are updated; the in-code comment accepts the staleness today.
- **Source:** snapshot line 2180, section "iTop integration (time tracking, task-to-ticket) — deferred findings (ported 2026-10-04)"

### ISS-066 · P3 · Legacy exceptions to the binding UI-pass rules (animate-pulse, text sizes)

- **Type:** debt · **Found:** 2026-09-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** bare `animate-pulse` placeholders across the frontend pages/components listed in the entry
- **Problem:** Carried-over sites still use bare animate-pulse instead of components/skeletons/; the Gantt toolbar 11.5px labels and most text-[12px] sites have since been cleaned up.
- **Why deferred / fix direction:** Sweep the remaining animate-pulse sites onto components/skeletons/; verify the DESIGN.md §2 'counts' wording.
- **Source:** snapshot line 2240, section "Professional UI pass — deferred findings (2026-09-29, ported 2026-10-05)"

### ISS-067 · P3 · TaskPanel shows 'Loading task…' forever when the tasks fetch fails

- **Type:** bug · **Found:** 2026-09-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TaskPanel (the `!task` branch) in frontend/src/components/TaskPanel.tsx (line ~218)
- **Problem:** When the project-tasks query errors, tasks stays undefined and the panel spins on 'Loading task…' with no error state or retry.
- **Why deferred / fix direction:** Minor; add an error branch driven by the tasks query's isError.
- **Source:** snapshot line 2262, section "Collaboration & sharing — live refresh, copy links, deep links — deferred findings (2026-09-29, ported 2026-10-05)"

### ISS-068 · P3 · Filters popover keeps stealing focus after a filter is chosen

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Filters popover (vendored filters component) on /tasks; workaround in e2e/tests/task-conflict.spec.ts (openEditForm, line ~326)
- **Problem:** After picking a filter and pressing Escape, the popover's focus manager pulls focus back into its search input for a short time, so quick typing into a task form can land in the wrong field.
- **Why deferred / fix direction:** Not reproduced in code review; investigate the popover close/focus-return path if users report it.
- **Source:** snapshot line 2272, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-069 · P3 · Mention chips resolve against the whole directory, including deactivated users

- **Type:** debt · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** taskMentionPeople `known` list in frontend/src/lib/mentions.ts (line ~190)
- **Problem:** A mentioned person later deactivated or removed still renders as an ordinary chip; the UI gives no hint they are inactive.
- **Why deferred / fix direction:** Fine for history; add a tooltip or muted style for inactive users.
- **Source:** snapshot line 2276, section "Collaboration & sharing — activity log, notifications, @mentions — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-070 · P3 · Members button count and avatars exclude the SA

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ProjectMembersButton in frontend/src/components/ProjectMembers.tsx (line ~35)
- **Problem:** By design the SA is not a member, but the Members count and avatars read as a mismatch against the dialog.
- **Why deferred / fix direction:** Cosmetic; add a label or tooltip, or leave as is.
- **Source:** snapshot line 2320, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-071 · P3 · Frontend built-in role list omits SALES

- **Type:** bug · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** BUILTIN_ROLES in frontend/src/lib/auth.tsx (line 17); custom-role filter in frontend/src/pages/Admin.tsx (line ~514)
- **Problem:** SALES is treated as a custom role in Admin > Roles (shown as editable and deletable) although it is seeded as built-in.
- **Why deferred / fix direction:** Add SALES to both lists, or derive them from the server's builtIn flag (admin.ts already sends it).
- **Source:** snapshot line 2325, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-072 · P3 · Loading states without SkeletonRegion in ported iTop/customer/utilization UI

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** loading branches in the listed files under frontend/src/components/itop, components/customer, pages/
- **Problem:** These loading states use bare Skeletons or 'Loading…' text instead of SkeletonRegion with its 150 ms delay (DESIGN.md §2).
- **Why deferred / fix direction:** Presentation-only; wrap each in SkeletonRegion in one pass.
- **Source:** snapshot line 2339, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-073 · P3 · A lazy page chunk that fails twice stays failed

- **Type:** debt · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** lazyPage in frontend/src/lib/lazyPage.ts (line ~25)
- **Problem:** If a page chunk fails both attempts, 'Try again' on the page boundary re-throws the cached rejection until the user reloads.
- **Why deferred / fix direction:** Accepted limitation; a fix would remount with a fresh lazy() per retry.
- **Source:** snapshot line 2383, section "Application review 2026-10-22 — remaining open items"

### ISS-074 · P3 · Tasks page makes an extra GET /projects request per visit

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useProjects in frontend/src/pages/Tasks.tsx (line ~122)
- **Problem:** The page fetches the whole project list only to know which projects are on hold.
- **Why deferred / fix direction:** Return an on-hold flag with the task or reuse a cached list.
- **Source:** snapshot line 2404, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-075 · P3 · Inline 'is'/'is any of' operator strings in Projects.tsx

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** filter fields in frontend/src/pages/Projects.tsx (lines ~94, ~101)
- **Problem:** Operator labels are inline strings instead of a shared constant.
- **Why deferred / fix direction:** Extract a shared constant.
- **Source:** snapshot line 2406, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-076 · P3 · Stale preview in the handover dialog

- **Type:** bug · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** HandoverModal submit in frontend/src/components/admin/HandoverModal.tsx (line ~160)
- **Problem:** If the leaver stops being a project's TAM while the dialog is open, the required TAM select may still show until a submit fails with stale.
- **Why deferred / fix direction:** Refetch the preview when the dialog regains focus, or accept.
- **Source:** snapshot line 2407, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-185 · P2 · Task form scrolls sideways at 375px when the label creator opens

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `1fd2bd1`
- **Where:** the creating row (input, Add, Cancel, colour swatches) in frontend/src/components/LabelPicker.tsx (line ~98) inside the TaskFormModal body (`flex-1 overflow-y-auto px-5 py-4`)
- **Problem:** At 375px the modal body's scrollWidth is 458 against a clientWidth of 374; the autofocused label input scrolls the body 38px sideways, cutting off the field labels on the left. Seen during the wave 1 Delivery Gate; not caused by its changes.
- **Why deferred / fix direction:** Let the creating row wrap (flex-wrap, min-w-0 on the input) and check the Assignee row, whose chevron also sits past the panel edge.

## Open — Accessibility & tokens

### ISS-078 · P2 · Light-theme hover contrast: hover:bg-primary-container with text-on-primary

- **Type:** bug · **Found:** 2026-08-15 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** hover:bg-primary-container sites across frontend/src (27 matches; Admin, Settings, Pipeline, gantt, DateRangeField)
- **Problem:** The white label on pale green hover background reads about 1.3:1 in light theme, below AA, on 27 sites.
- **Why deferred / fix direction:** One global fix to the hover token pairing rather than per-feature edits.
- **Source:** snapshot line 1521, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

### ISS-079 · P2 · About 30 primary buttons use hover:bg-primary-container with white text

- **Type:** bug · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** hover:bg-primary-container buttons across frontend/src/components (e.g. DateRangeField.tsx line ~332)
- **Problem:** On hover the button turns pale green while text stays white, about 1.4:1 contrast in light mode.
- **Why deferred / fix direction:** Pair each with hover:text-on-primary-container (as the update banner does) or add a shared button class.
- **Source:** snapshot line 2379, section "Application review 2026-10-22 — remaining open items"

### ISS-080 · P2 · text-on-surface-variant/60 on empty marks and the Login footer is about 3.6:1

- **Type:** bug · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Login.tsx (lines ~305, ~353, ~373); Admin.tsx (lines ~846, ~1838, ~1938)
- **Problem:** Text at 60% opacity of on-surface-variant measures about 3.6:1, under AA 4.5:1.
- **Why deferred / fix direction:** Use the full text-on-surface-variant token.
- **Source:** snapshot line 2419, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-081 · P2 · InstallBanner nests a role=button span inside a <button>

- **Type:** bug · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** dismiss control in frontend/src/components/InstallBanner.tsx (line ~86)
- **Problem:** Invalid interactive nesting, and the dismiss target is a 16px icon.
- **Why deferred / fix direction:** Split into two sibling buttons.
- **Source:** snapshot line 2422, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-082 · P3 · Favicon is on-light mark only; weak on dark tab strips

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** favicon link in frontend/index.html (line ~6), frontend/public/favicon.png
- **Problem:** The flat on-light mark's arc ink #5b5b5d is 2.38:1 against Chrome's dark tab background #202124.
- **Why deferred / fix direction:** Add a prefers-color-scheme-aware SVG favicon or a second <link media="(prefers-color-scheme: dark)"> with an on-dark mark.
- **Source:** snapshot line 339, section "Tech debt / follow-ups from recent work"

### ISS-083 · P3 · Overview.tsx off-token styling (remaining: raw font-mono P- id)

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** project id span in frontend/src/pages/Overview.tsx (line ~167)
- **Problem:** Most of the listed off-token styling is gone; the P- id still uses raw font-mono instead of the data-mono token.
- **Why deferred / fix direction:** Narrowed to one line; fold into the next token pass.
- **Source:** snapshot line 348, section "Tech debt / follow-ups from recent work"

### ISS-084 · P3 · PortfolioCalendar: rounded-full bar and raw font-mono year switcher

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** PortfolioCalendar timeline bar and year switcher in frontend/src/components/portfolio/PortfolioCalendar.tsx (lines ~263, ~118)
- **Problem:** The timeline bar uses rounded-full (reserved for pills/avatars) and the year display uses raw font-mono, carried over verbatim from an extraction.
- **Why deferred / fix direction:** Fix once in the shared component; benefits Executive and Overview.
- **Source:** snapshot line 378, section "Tech debt / follow-ups from recent work"

### ISS-085 · P3 · IconTile outline variant invisible by default in dark theme on lowest surface

- **Type:** debt · **Found:** 2026-07-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** outline variant in frontend/src/components/reui/icon-tile.tsx (line ~37)
- **Problem:** The variant's base fill equals surface-container-lowest in dark theme, so the tile only shows through its dark:bg-input/32 layer. Reusing it on another surface may read inconsistently.
- **Why deferred / fix direction:** Verify contrast before reusing the variant on a differently toned surface.
- **Source:** snapshot line 1165, section "ReUI Presentation Set — deferred findings (2026-07-31)"

### ISS-086 · P3 · Badge solid-tone variants not for use until chip rebase

- **Type:** debt · **Found:** 2026-08-01 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** tone variants in frontend/src/components/reui/badge.tsx (lines ~31-52)
- **Problem:** The solid tone variants render white on tint at about 1.2-2.8:1 contrast. They have no consumers and are constrained by an in-file comment.
- **Why deferred / fix direction:** Fix contrast or delete the variants before anyone wires one up; chips stay bespoke per standing decision.
- **Source:** snapshot line 1272, section "ReUI Data Grid phase — deferred findings (2026-08-01)"

### ISS-087 · P3 · Vendored ui/* and reui/* still carry the fuller focus form

- **Type:** debt · **Found:** 2026-08-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** focus classes in frontend/src/components/ui/*.tsx and reui/*.tsx (listed files)
- **Problem:** DESIGN.md states the reduced focus form, but vendored primitives still change the border on focus. The design-focus-ring gate excludes vendored files.
- **Why deferred / fix direction:** Align opportunistically when each file is next touched, with SOLVRO PATCH markers.
- **Source:** snapshot line 1652, section "Daily Review v2 — deferred findings (2026-08-29)"

### ISS-088 · P3 · Shared dialog focus trap only wraps from the last focusable element

- **Type:** bug · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** onKeyDown in useDialogFocus (frontend/src/hooks/useDialogFocus.ts, line ~62)
- **Problem:** Focus sitting on a non-tabbable element (e.g. a programmatically focused heading) can Tab out of the dialog when nothing tabbable follows it; ProjectShare works around it locally.
- **Why deferred / fix direction:** Fix once in the shared hook: wrap when focus is not on a tabbable item and Tab would leave the dialog.
- **Source:** snapshot line 2287, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-089 · P3 · LinksSection departs from the DESIGN.md §4 focus treatment (buttons lack focus-v

- **Type:** bug · **Found:** 2026-10-12 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** buttons in frontend/src/components/LinksSection.tsx (lines ~134-190, ~331-377)
- **Problem:** The Add link, Cancel/Save and edit/delete icon buttons show no keyboard focus ring on the deal page, project Context panel and customer Links tab (the input half of this finding is fixed).
- **Why deferred / fix direction:** Add the shared focus-visible ring classes once in the component.
- **Source:** snapshot line 2358, section "Project & customer document links — deferred findings (2026-10-12)"

### ISS-090 · P3 · Dark primary on dark surface-container-high is 4.4986:1

- **Type:** decision · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** dark tokens in frontend/src/index.css (lines ~251, ~259)
- **Problem:** Dark brand green falls 0.0014 short of 4.5:1 on hovered rows and tinted cards. Question: may the brand green be adjusted, or is the gap accepted?
- **Why deferred / fix direction:** Brand value deliberately untouched; needs a user ruling.
- **Source:** snapshot line 2420, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-091 · P3 · Two text sizes have no matching type role

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Modal.tsx (line 58), Drawer.tsx (line 119), pages/views/ProjectList.tsx (line 1077)
- **Problem:** Off-scale arbitrary font sizes bypass the type roles in DESIGN.md.
- **Why deferred / fix direction:** Add a role or move them onto an existing one.
- **Source:** snapshot line 2421, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-092 · P3 · Epic colour swatches are 16px targets 4px apart

- **Type:** bug · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** color picker in frontend/src/pages/views/ProjectEpics.tsx (line ~419)
- **Problem:** Swatches are too small and tightly spaced for touch; tap-target would make their 44px areas overlap.
- **Why deferred / fix direction:** Use a larger swatch or a different picker on touch.
- **Source:** snapshot line 2423, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

## Open — Gantt

### ISS-093 · P3 · Gantt tree pane: engine container clamp can re-clip fixed columns

- **Type:** bug · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** clampContainer in frontend/src/components/reui/gantt/gantt-view.tsx (line ~976); nameColumnWidth in gantt-v2/SolvroGantt.tsx (line ~453)
- **Problem:** On roughly 768-850px viewports a wide persisted tree width makes the engine render the pane narrower than treeWidth without reporting it, so the Dates/Status columns clip past the pane edge (the #118 symptom).
- **Why deferred / fix direction:** Deferred as rare on a desktop-first Gantt. Fix: clamp nameColumnWidth by the measured pane width (ResizeObserver) or patch the engine to surface the clamped width with a SOLVRO PATCH marker.
- **Source:** snapshot line 19, section "Known bugs / inconsistencies"; merged duplicates at snapshot lines 59

### ISS-094 · P3 · Gantt tree pane narrowed below 356px clips fixed columns (accepted)

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TREE_FIXED_COLUMNS_WIDTH / TREE_NAME_COLUMN_MIN_WIDTH in frontend/src/components/gantt-v2/SolvroGantt.tsx (line ~244)
- **Problem:** Deliberately narrowing the tree pane below 356px (256 fixed columns + 100 name floor) clips the fixed columns; the row scrolls horizontally.
- **Why deferred / fix direction:** Accepted behavior, no fix planned; revisit only if users report it.
- **Source:** snapshot line 31, section "Known bugs / inconsistencies"

### ISS-095 · P3 · Gantt splitter drag: fixed columns clip until pointerup

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** splitter drag handler in frontend/src/components/reui/gantt/gantt-view.tsx (line ~1055-1082)
- **Problem:** During a narrowing drag the engine updates the pane width in the DOM but notifies the consumer only on pointerup, so the name column does not follow and the fixed columns clip, then snap back on release.
- **Why deferred / fix direction:** Pre-existing engine behavior; fix would need a live width callback (a SOLVRO PATCH) or throttled onWidthChange.
- **Source:** snapshot line 35, section "Known bugs / inconsistencies"

### ISS-096 · P3 · #94a3b8 section-color sentinel duplicated between schema and frontend

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** DEFAULT_SECTION_COLOR in frontend/src/lib/gantt/palette.ts (line ~33); Section.color default in backend/prisma/schema.prisma (line ~561)
- **Problem:** The frontend constants are now one, but the Prisma default must still match it byte-for-byte or legacy uncustomized sections stop being recognized as unset and render the new default.
- **Why deferred / fix direction:** Narrowed to frontend/backend duplication. Fix: migrate to an isCustom boolean on Section or share the constant via an API field.
- **Source:** snapshot line 392, section "Tech debt / follow-ups from recent work"

### ISS-097 · P3 · Redundant double-sort in legendEntries section branch

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** legendEntries in frontend/src/lib/gantt/palette.ts (line ~270)
- **Problem:** The Section branch re-sorts an array that resolveSectionColors already sorted; negligible cost.
- **Why deferred / fix direction:** Flagged for awareness only; fix by returning the sorted order from the resolver.
- **Source:** snapshot line 459, section "Tech debt / follow-ups from recent work"

### ISS-098 · P3 · Milestone connector endpoints anchor at day-box edge

- **Type:** bug · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** milestone branch in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~295); measureBars in GanttOverlay.tsx
- **Problem:** Dependency arrows for milestone tasks end at the day-box edge, leaving a visible gap (30-40px at Week zoom) from the diamond.
- **Why deferred / fix direction:** Cosmetic. Anchor connector rects to the diamond glyph for milestone bars.
- **Source:** snapshot line 516, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

### ISS-099 · P3 · Per-bar ResizeObserver in SolvroBar

- **Type:** watch · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useLabelFits in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~105)
- **Problem:** One ResizeObserver per rendered bar; fine at current scale.
- **Why deferred / fix direction:** Trigger: a project rendering low hundreds of bars at once. Then share a single observer.
- **Source:** snapshot line 519, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

### ISS-100 · P3 · Section-id parse/format logic split across files

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** section-id parsing in frontend/src/components/gantt-v2/SolvroGantt.tsx (lines ~300, ~611, ~855)
- **Problem:** Section id parsing lives in SolvroGantt instead of next to sectionNodeId in adapter.ts.
- **Why deferred / fix direction:** Add parseSectionId to adapter.ts. Coupling hygiene, no defect.
- **Source:** snapshot line 529, section "Final whole-branch review additions (2026-07-25)"

### ISS-101 · P3 · handleResourceReorder is ~130 lines

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** handleResourceReorder in frontend/src/components/gantt-v2/SolvroGantt.tsx (line ~605)
- **Problem:** Single callback with three branches, kept to mirror the old engine for diffability.
- **Why deferred / fix direction:** Split into named helpers in a readability pass.
- **Source:** snapshot line 530, section "Final whole-branch review additions (2026-07-25)"

### ISS-102 · P3 · GanttDatePicker uses shadow-md and may be dead code

- **Type:** debt · **Found:** 2026-07-28 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** GanttDatePicker in frontend/src/components/reui/gantt/gantt-nav.tsx (line ~358)
- **Problem:** Probably unused vendored component with an off-token shadow.
- **Why deferred / fix direction:** Confirm dead and remove, or align to shadow-overlay when mounted.
- **Source:** snapshot line 804, section "ReUI DateField swap — deferred findings (2026-07-28)"

### ISS-103 · P3 · Gantt tree Dates cell shows range text twice while editing

- **Type:** bug · **Found:** 2026-07-28 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TaskDatesCell in frontend/src/components/gantt-v2/TreeCells.tsx (line ~49)
- **Problem:** While editing, the same date range text appears twice.
- **Why deferred / fix direction:** Hide the cell button while editing, or render only the editor's trigger.
- **Source:** snapshot line 939, section "DateRangeField — deferred findings (2026-07-28, Task 3.5)"

### ISS-104 · P3 · Gantt drag-clone keeps shadow-lg without a SOLVRO PATCH marker

- **Type:** debt · **Found:** 2026-08-03 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** drag clone in frontend/src/components/reui/gantt/gantt-dnd.tsx (line ~310)
- **Problem:** The vendored drag clone uses a shadow outside the DESIGN.md elevation whitelist. The other holdout (toast shadow-md) is gone.
- **Why deferred / fix direction:** Drop the shadow with a SOLVRO PATCH marker; vendored reui/ is a spine file.
- **Source:** snapshot line 1470, section "Gantt visual refresh — deferred findings (2026-08-03)"

### ISS-105 · P3 · Dark-theme Gantt bar ring contrast for the Critical Path mark

- **Type:** decision · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** critical-path ring in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~328)
- **Problem:** Question for the user: keep `chip-violet-text` (near-white `#ddd6fe` in dark mode, close to the selection outline) or use a fixed violet in both themes for the Gantt ring only?
- **Why deferred / fix direction:** Awaiting the user's call; option (b) mirrors CRITICAL_PATH_HEX used by the exports.
- **Source:** snapshot line 1738, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-106 · P3 · Per-call mutate onError callbacks can be lost in SolvroGantt.tsx

- **Type:** bug · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** SolvroGantt.tsx critical-path ContextMenuItem (line ~1640) and section reorder (line ~642)
- **Problem:** TanStack Query v5 fires per-call callbacks only for the latest mutate on a hook, so a failure is silently swallowed when another update follows; the section reorder fires several in a row.
- **Why deferred / fix direction:** Convert the remaining sites to mutateAsync(...).catch(...), as the other Gantt paths already do.
- **Source:** snapshot line 2271, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Boards & drag

### ISS-109 · P3 · Vendored Kanban: drop on displaced card can cancel a one-slot move

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** same-container branch in frontend/src/components/reui/kanban.tsx (lines ~403, ~527)
- **Problem:** handleDragEnd recomputes indexes against the already-previewed order, so a precise drop can undo the preview move. Not reproduced under a fixed e2e assertion.
- **Why deferred / fix direction:** Dogfood watch only; revisit if a user reports a lost reorder.
- **Source:** snapshot line 610, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-110 · P3 · TaskPanel subtask drag may flicker back before reorder commits

- **Type:** watch · **Found:** 2026-07-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** onValueChange no-op in components/TaskPanel.tsx (line ~833)
- **Problem:** Subtask list is derived from the tasks query, so the DOM keeps the pre-drop order until the optimistic update lands. A snap-back flicker is possible in that window.
- **Why deferred / fix direction:** Only act if the flicker is seen in practice; direction is a local order mirror like SectionReorderModal.
- **Source:** snapshot line 1064, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

### ISS-111 · P3 · SectionReorderModal has no permission check of its own

- **Type:** debt · **Found:** 2026-07-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** SectionReorderModal in components/SectionReorderModal.tsx (whole file)
- **Problem:** The modal relies wholly on ProjectList's canEdit gate on the button that opens it. A second entry point would inherit no protection.
- **Why deferred / fix direction:** Add a canEdit/permission guard inside the modal or accept the single gated mount; low risk today.
- **Source:** snapshot line 1076, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

### ISS-112 · P3 · useUpdateSection scope can diverge from server after a failed PATCH

- **Type:** bug · **Found:** 2026-07-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useUpdateSection in frontend/src/lib/queries.ts (line ~2302)
- **Problem:** If a queued drop's predecessor PATCH fails, its onError rollback discards optimistic writes of later queued drops, and those then run against a server that never applied the first. The modal shows a diverged order until reopened.
- **Why deferred / fix direction:** Reachable only on a mid-session PATCH failure. Fix by refetching or re-seeding local order on error.
- **Source:** snapshot line 1086, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

### ISS-113 · P3 · SectionReorderModal drag guard can strand the modal

- **Type:** bug · **Found:** 2026-07-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** handleModalClose in components/SectionReorderModal.tsx (line ~69)
- **Problem:** If a drag never fires end/cancel (lost pointerup), every close route stays blocked, and the reset effect cannot rerun while the modal is open.
- **Why deferred / fix direction:** Exempt the header X from the guard so one exit always works.
- **Source:** snapshot line 1112, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

### ISS-114 · P3 · data-grid-column-header hasControls branch ignores right-align

- **Type:** watch · **Found:** 2026-08-01 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** hasControls branch in frontend/src/components/reui/data-grid/data-grid-column-header.tsx (line ~434)
- **Problem:** The move/pin/visibility header path does not honor meta.headerClassName text-right. Unreachable today because no grid enables those controls.
- **Why deferred / fix direction:** Teach the branch alignEnd when the first right-aligned column enables controls.
- **Source:** snapshot line 1300, section "ReUI Data Grid phase — deferred findings (2026-08-01)"

### ISS-115 · P3 · Sortable DataGrid header cannot center-align

- **Type:** debt · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** alignEnd in frontend/src/components/reui/data-grid/data-grid-column-header.tsx (line ~107)
- **Problem:** The sortable header path supports left and right alignment only, so ProjectRisks Probability and Impact columns cannot be sorted and centered.
- **Why deferred / fix direction:** Add alignCenter to the vendored header with a SOLVRO PATCH marker.
- **Source:** snapshot line 1392, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-187 · P3 · Drag handles are not registered as the dnd-kit activator node

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `65a6c77`
- **Where:** KanbanItem / KanbanItemHandle in frontend/src/components/reui/kanban.tsx (line ~760); SortableItem in reui/sortable.tsx
- **Problem:** After a keyboard drop that remounts a card, dnd-kit restores focus to the first focusable element in the row. Today that is the handle in every card, so it works by chance.
- **Why deferred / fix direction:** Pass setActivatorNodeRef through the context and set it on the handle (one more SOLVRO PATCH per file, counters bumped).

### ISS-188 · P3 · Kanban drag handles are 16px touch targets

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `65a6c77`
- **Where:** handles in frontend/src/components/itop/board/TicketCard.tsx, pipeline/OpportunityCard.tsx, kanban-v2/cards.tsx
- **Problem:** The grip has no padding to enlarge its hit area (antislop R-03); on touch it is hard to hit.
- **Why deferred / fix direction:** Pad the handle to a 24px or larger target without changing the icon size.

### ISS-189 · P3 · Two drag-handle buttons use a different focus style from FIELD_FOCUS

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `65a6c77`
- **Where:** handle buttons in frontend/src/components/SectionReorderModal.tsx and TaskPanel.tsx (`focus-visible:outline-ring`)
- **Problem:** The Kanban handles now use FIELD_FOCUS (DESIGN.md §4); these two do not.
- **Why deferred / fix direction:** Switch both to FIELD_FOCUS.

## Open — Pipeline

### ISS-118 · P3 · DealCard reads the full deal list client-side

- **Type:** watch · **Found:** 2026-08-15 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** DealCardInner in frontend/src/components/DealCard.tsx (line ~82)
- **Problem:** Every project Overview tab loads the whole opportunity list to find one deal. Fine at hundreds of deals.
- **Why deferred / fix direction:** Revisit at the PRD's ~2k-deal trigger, e.g. with a by-project endpoint.
- **Source:** snapshot line 1526, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

## Open — iTop

### ISS-120 · P2 · TimeSpent duration unit assumed to be seconds

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ITOP_TIME_SPENT_DURATION_IN_SECONDS in backend/src/lib/itop/types.ts (line ~177), used by syncTimeEntries
- **Problem:** Durations are divided by 60 assuming seconds; if the real install reports minutes, every imported time entry is wrong by 60x.
- **Why deferred / fix direction:** Verify with the probe's TimeSpent field dump against the real install before go-live; flip the one constant if needed.
- **Source:** snapshot line 1940, section "iTop integration (Utilization) — deferred findings (ported 2026-10-04)"

### ISS-121 · P2 · TimeSpent.ticket_ref attribute name unverified on the real install

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ITOP_TIME_SPENT_TICKET_REF_FIELD in backend/src/lib/itop/types.ts (line ~163)
- **Problem:** If the real attribute differs or is not writable, logged entries still count in Utilization but never link to the ticket, so the panel's weekly-on-ticket figure stays 0.
- **Why deferred / fix direction:** Before go-live the iTop admin confirms the attribute name and REST writability (same probe discipline as the duration unit).
- **Source:** snapshot line 2191, section "iTop integration (time tracking, task-to-ticket) — deferred findings (ported 2026-10-04)"

### ISS-122 · P2 · Application/personal token cannot read iTop's User class

- **Type:** watch · **Found:** 2026-09-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** user matching / time logging in backend/src/lib/itop/ and routes/itopUser.ts
- **Problem:** User matching sets the Person link but never User.itopUserId, so time logging answers 'Your iTop user account is not linked yet'.
- **Why deferred / fix direction:** Once Time Tracking is installed: check whether TimeSpent.user_id can be omitted, or grant the application token a profile that can read User.
- **Source:** snapshot line 2232, section "iTop integration — real-install findings (2026-09-24, ported 2026-10-04)"

### ISS-123 · P3 · Personal-token expiry is best-effort, not guaranteed

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** PUT /itop/me/token in backend/src/routes/itopUser.ts (line ~204)
- **Problem:** On installs where PersonalToken is unreadable to the TAM profile, expiresAt is always null so Settings cannot warn before expiry.
- **Why deferred / fix direction:** No code change proposed; revisit if an install exposes PersonalToken or a warning UX is wanted.
- **Source:** snapshot line 2022, section "iTop integration (personal tokens, ticket actions) — deferred findings (ported 2026-10-04)"

### ISS-124 · P3 · A token's write capability can't be verified up front

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** write-capability probe in backend/src/routes/itopUser.ts (line ~168)
- **Problem:** A TAM can save a token lacking a write profile and only learns at the first action (403 itop_token_invalid / 409 itop_refused).
- **Why deferred / fix direction:** Working as designed; consider a trial apply_stimulus dry run only if iTop ever supports one.
- **Source:** snapshot line 2035, section "iTop integration (personal tokens, ticket actions) — deferred findings (ported 2026-10-04)"

### ISS-125 · P3 · Drop lifecycle graph assumes iTop's default stimuli

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TRANSITIONS in frontend/src/components/itop/board/dropMapper.ts (line ~40)
- **Problem:** A custom or narrower iTop state machine will reject drags the admin expects, or accept ones iTop then refuses (409 itop_refused with iTop's text).
- **Why deferred / fix direction:** Verify decision 10 against the real install before relying on Board drag-and-drop there; make the graph configurable only if an install differs.
- **Source:** snapshot line 2090, section "iTop integration (board, new tickets) — deferred findings (ported 2026-10-04)"

### ISS-126 · P3 · Mobile iTop board is a single stacked column with touch drag

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** KanbanBoard grid in frontend/src/components/itop/board/TicketBoard.tsx (line ~263)
- **Problem:** Below md the five columns stack vertically with touch drag; long scroll to a distant column and touch precision are unevaluated.
- **Why deferred / fix direction:** Evaluate on a real phone before treating it as the phone-usable Board.
- **Source:** snapshot line 2101, section "iTop integration (board, new tickets) — deferred findings (ported 2026-10-04)"

### ISS-127 · P3 · Time Tracking extension is not bundled with iTop Community

- **Type:** watch · **Found:** 2026-09-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** backend/src/lib/itop/sync.ts syncTimeEntries and routes/itop.ts time logging
- **Problem:** The TimeSpent class is absent until the extension is installed from iTop Hub, blocking the verification of the two TimeSpent assumptions.
- **Why deferred / fix direction:** Install the extension on the iTop side, then run the TimeSpent probes.
- **Source:** snapshot line 2235, section "iTop integration — real-install findings (2026-09-24, ported 2026-10-04)"

### ISS-128 · P3 · pending_reason assumed to be free text

- **Type:** watch · **Found:** 2026-09-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** pending action schema in backend/src/routes/itop.ts (line ~762)
- **Problem:** An install that turns pending_reason into a list of values will refuse free text; the user sees iTop's message.
- **Why deferred / fix direction:** No action until an install differs.
- **Source:** snapshot line 2236, section "iTop integration — real-install findings (2026-09-24, ported 2026-10-04)"

### ISS-132 · P3 · A failed iTop sync keeps half its work

- **Type:** bug · **Found:** 2026-10-05 · **Verified:** 2026-11-19 @ `50e3a4f`
- **Where:** upsertTicket and the page loop in syncTickets (backend/src/lib/itop/sync.ts, line ~403, ~880)
- **Problem:** Rows written before a crash stay and the full-sync cleanup never runs. Since 2026-11-19 GET /itop/status returns `lastSyncFailed`, but no screen shows it yet.
- **Why deferred / fix direction:** Wrap each page's upserts in a transaction, and decide whether the Tickets tab shows a failed-sync notice.
### ISS-134 · P3 · Deployment note: itopUserId matching needs REST read rights on iTop's User class

- **Type:** watch · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** POST /itop/tickets/:id/time error path in backend/src/routes/itop.ts (line ~1303)
- **Problem:** Without read rights on User, time logging fails with 'Your iTop user account is not linked yet'. A setup requirement, not a code bug.
- **Why deferred / fix direction:** Document the required profile rights in docs/CONFIGURATION.md; otherwise nothing to fix in code.
- **Source:** snapshot line 2303, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-135 · P3 · iTop time entries with blank duration are skipped every sync tick

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** upsertTimeEntry in backend/src/lib/itop/sync.ts (line ~523)
- **Problem:** Time entries with a blank duration (likely still-running entries) are skipped and re-evaluated every tick.
- **Why deferred / fix direction:** Confirm on a real iTop install that blank durations are transient; if they persist, decide how to store them.
- **Source:** snapshot line 2385, section "Application review 2026-10-22 — remaining open items"

### ISS-136 · P3 · iTop full-sync prune can exceed Postgres bind-parameter limit

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** full-sync prune in backend/src/lib/itop/sync.ts (lines ~752, ~913)
- **Problem:** A class with more than about 32,000 rows makes the NOT IN list exceed Postgres's 32,767-parameter limit and the prune fails.
- **Why deferred / fix direction:** Trigger: an install with that many rows. Fix: prune via a temp table or unnest($1::int[]).
- **Source:** snapshot line 2390, section "Application review 2026-10-22 — remaining open items"

### ISS-186 · P3 · A full sync already running can undo the full-sync reset of a new org mapping

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `50e3a4f`
- **Where:** setCustomerOrgMapping in backend/src/routes/itopAdmin.ts (line ~616); lastFullSyncAt write in backend/src/lib/itop/sync.ts (line ~786)
- **Problem:** A full sync that read the customers before the mapping changed finishes and writes lastFullSyncAt, so the new org's older tickets wait up to a day again. The same run's removal pass deletes that org's tickets (older behavior).
- **Why deferred / fix direction:** Self-heals within 24h. Write lastFullSyncAt only if it is unchanged since the run started, or request a sync after the mapping commits.

## Open — Exports & sharing

### ISS-137 · P3 · Gantt Excel/PDF downloads blocked by Chromium on http prod origin

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** deployment origin (http://solvro.elitery.local), download helpers in frontend/src/lib/gantt/exportExcel.ts and exportPdf.ts
- **Problem:** Chromium-family browsers show 'blocked this download' for files from a non-secure origin; the user can keep the file from the download overflow menu, so it is friction not data loss.
- **Why deferred / fix direction:** Not fixable by changing format. Options: reach app via localhost forward/reverse proxy, HTTPS with internal CA (declined), or PDF View -> Save as PDF. Last observed 2026-07-31.
- **Source:** snapshot line 70, section "Known bugs / inconsistencies"; merged duplicates at snapshot lines 77, 86, 92

### ISS-138 · P3 · Download helpers revoke object URL synchronously after click

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** downloadWorkbook tail in frontend/src/lib/gantt/exportExcel.ts (line ~388); template download in components/PipelineImportDialog.tsx (line ~101)
- **Problem:** The object URL is revoked in the same tick as a.click(); strictly the revoke belongs on a later task. Not the cause of the blocked-download bug.
- **Why deferred / fix direction:** Hygiene only; works in practice. Defer the revoke with setTimeout and share one download helper.
- **Source:** snapshot line 101, section "Known bugs / inconsistencies"

### ISS-139 · P3 · Screen and PDF Gantt export diverge on bar treatments

- **Type:** debt · **Found:** 2026-08-03 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** progress overlay and rollup drawing in frontend/src/lib/gantt/exportPdf.ts (lines ~729, 843)
- **Problem:** The live Gantt hatches the incomplete portion and squares rollup caps; the PDF export still uses the old flat overlay and rounded pill. Documented as accepted, unscheduled.
- **Why deferred / fix direction:** Port both treatments to exportPdf.ts if parity matters; export builder is on the spine.
- **Source:** snapshot line 1445, section "Gantt visual refresh — deferred findings (2026-08-03)"

### ISS-140 · P3 · Gantt Excel export has no iTop ticket column

- **Type:** decision · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** buildTasksSheet in frontend/src/lib/gantt/exportExcel.ts (line ~87)
- **Problem:** Question for the user: should the Gantt Excel export show a task's pinned itopTicketRef? It needs the field threaded through the Gantt row adapter; the ref is customer-safe but exports are customer-facing.
- **Why deferred / fix direction:** Add a column and thread t.itopTicketRef onto Row if approved (spine: Gantt exports).
- **Source:** snapshot line 2006, section "iTop integration (webhook, task ticket links) — deferred findings (ported 2026-10-04)"

### ISS-141 · P3 · Guest page still loads Google Fonts from Google

- **Type:** debt · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** frontend/index.html (lines 13-20), served at /share/<token> via frontend/nginx.conf
- **Problem:** A guest opening a share link makes their browser contact Google; Referrer-Policy: no-referrer keeps the token out of those requests.
- **Why deferred / fix direction:** Self-host the fonts; deferred because it changes the whole app shell.
- **Source:** snapshot line 2283, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-142 · P3 · Guest links use the address the owner is browsing from

- **Type:** bug · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ProjectShare copy-link handler in frontend/src/components/ProjectShare.tsx (line ~247)
- **Problem:** An owner signed in through an SSH tunnel or localhost copies a link a guest cannot open, since the origin comes from the browser.
- **Why deferred / fix direction:** Add a PUBLIC_BASE_URL setting and build the link from it.
- **Source:** snapshot line 2286, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Tests & CI

### ISS-143 · P2 · No ESLint config; exhaustive-deps disable comment is inert

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** reset-effect deps in frontend/src/components/TaskFormModal.tsx (line ~176); no lint config in frontend/
- **Problem:** Nothing mechanically stops a future edit from reintroducing the whole props object into the reset-effect dependencies (second root cause of GH #56).
- **Why deferred / fix direction:** Add an ESLint config with react-hooks/exhaustive-deps and an npm run lint gate in CI.
- **Source:** snapshot line 449, section "Tech debt / follow-ups from recent work"; merged duplicates at snapshot lines 2263

### ISS-144 · P2 · No e2e spec asserts Login/Sidebar always-dark pin

- **Type:** test-gap · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Login.tsx root wrapper and Sidebar.tsx rail; no spec in e2e/tests
- **Problem:** A future @theme change could silently re-break the dark pin that already regressed once.
- **Why deferred / fix direction:** Add a spec forcing light theme and asserting computed dark backgrounds on /login and the sidebar.
- **Source:** snapshot line 538, section "Login/Sidebar always-dark-pin fix — deferred findings (2026-07-25)"

### ISS-145 · P2 · e2e drag-reorder first-attempt flakes (list-dnd/kanban-dnd/gantt-parity)

- **Type:** watch · **Found:** 2026-07-28 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** list-dnd.spec.ts, kanban-dnd.spec.ts, gantt-parity.spec.ts
- **Problem:** Four-case first-attempt flake class absorbed by retries: 1; likely much reduced by the per-file seededProject change.
- **Why deferred / fix direction:** Trigger: a fifth case joins or any case fails through its retry. Re-count flakes over the next CI runs.
- **Source:** snapshot line 869, section "ReUI DateField swap — deferred findings (2026-07-28)"; merged duplicates at snapshot lines 518

### ISS-146 · P2 · backend tsconfig include never reaches scripts/ or test/

- **Type:** debt · **Found:** 2026-07-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** include in backend/tsconfig.json (line 17)
- **Problem:** The typecheck gate never covers backend/scripts/ or backend/test/.
- **Why deferred / fix direction:** Broaden include or add a second tsconfig run by the gate.
- **Source:** snapshot line 1046, section "Date contract UTC-midnight unification — deferred findings (2026-07-29)"; merged duplicates at snapshot lines 1533

### ISS-147 · P2 · gates.sh exercises only one e2e spec

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** smoke_gate in .claude/scripts/gates.sh (line ~94)
- **Problem:** New e2e suites (e.g. duplicate.spec.ts) never run in the mechanical gate unless run by hand.
- **Why deferred / fix direction:** Add a gate step that also runs specs touched by the diff (git diff --name-only -- e2e/tests).
- **Source:** snapshot line 1813, section "Duplicate tasks, subtasks, and sections — deferred findings (2026-09-02)"

### ISS-148 · P2 · No component tests for ProjectStatusChangeDialogs and HandoverModal

- **Type:** test-gap · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** frontend/src/components/project/ProjectStatusChangeDialogs.tsx; frontend/src/components/admin/HandoverModal.tsx
- **Problem:** The handover and status-change dialogs, which move users' work, have no component or browser tests for the PIC/SA sections or holds longer than a day.
- **Why deferred / fix direction:** Add component tests and an e2e for the handover dialog.
- **Source:** snapshot line 2405, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-149 · P3 · pwa.spec.ts fails against the Vite dev server

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/pwa.spec.ts (manifest and service worker tests); frontend/vite.config.ts (vite-plugin-pwa devOptions)
- **Problem:** vite-plugin-pwa emits the manifest link and service worker only in build mode, so pwa.spec.ts fails at BASE_URL=http://localhost:5173 and passes on the CI stack at :8080.
- **Why deferred / fix direction:** Accepted and documented in e2e/CLAUDE.md. Fix: gate the spec on a build-mode BASE_URL or set devOptions: true.
- **Source:** snapshot line 161, section "Known bugs / inconsistencies"

### ISS-150 · P3 · No e2e coverage for colorBy persistence across page reload

- **Type:** test-gap · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/gantt-legend.spec.ts
- **Problem:** Spec only switches Status/Section/Priority in-session; it never asserts that the choice in localStorage survives a full reload.
- **Why deferred / fix direction:** Add a step: pick a mode, reload, then assert the select value and legend are restored.
- **Source:** snapshot line 467, section "Tech debt / follow-ups from recent work"

### ISS-151 · P3 · E2E fixed-timeout (waitForTimeout) convention

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** waitForTimeout calls throughout e2e/tests/*.spec.ts
- **Problem:** Many specs use fixed sleeps instead of condition-based waits.
- **Why deferred / fix direction:** Dedicated e2e-hardening pass converting to waitForResponse/expect.poll.
- **Source:** snapshot line 523, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"; merged duplicates at snapshot lines 520

### ISS-152 · P3 · Typecheck gate does not cover vite.config.ts

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** typecheck script in frontend/package.json (line 11); frontend/tsconfig.node.json (line 17)
- **Problem:** vite.config.ts is never typechecked and tsconfig.node.json lists deleted files.
- **Why deferred / fix direction:** Add `tsc -p tsconfig.node.json --noEmit` to the script and prune the stale include entries.
- **Source:** snapshot line 544, section "PWA icon regeneration — deferred findings (2026-07-25/26)"

### ISS-153 · P3 · /search contract-test gaps

- **Type:** test-gap · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** backend/test/search.test.ts (lines ~121, ~200)
- **Problem:** Four contract assertions missing; the LIKE-escape test name overclaims `_` coverage.
- **Why deferred / fix direction:** Add the three assertions plus a literal `_` case, or rename the test.
- **Source:** snapshot line 636, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-154 · P3 · search.spec.ts polish and listener-ready guard

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/search.spec.ts (lines ~31, ~85, ~97, ~75)
- **Problem:** Four minor spec issues, the main one a missing listener-ready guard behind a flake seen once under CI load.
- **Why deferred / fix direction:** Assert the TopBar trigger is visible before pressing the shortcut; check res.ok; anchor the regex; fix the comment pointer.
- **Source:** snapshot line 759, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-155 · P3 · No e2e spec for the Reorder sections modal drag

- **Type:** test-gap · **Found:** 2026-07-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests (no spec for SectionReorderModal)
- **Problem:** The Reorder sections modal has no Playwright drag spec. The subtask half of the original entry has since been covered.
- **Why deferred / fix direction:** Add a section-reorder case alongside kanban-dnd/list-dnd specs.
- **Source:** snapshot line 1125, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

### ISS-156 · P3 · filters-duplicate-chip e2e spec is an invariant net, not a discriminating test

- **Type:** watch · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/filters-duplicate-chip.spec.ts (header comment)
- **Problem:** The spec cannot reproduce the upstream Base UI double-fire; it only asserts no more than one chip per field survives.
- **Why deferred / fix direction:** Accept as is unless the upstream race becomes reproducible.
- **Source:** snapshot line 1403, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-157 · P3 · filters.test.ts colocated in vendored reui/ and imports a patched export

- **Type:** debt · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** frontend/src/components/reui/filters.test.ts (line ~2)
- **Problem:** A shadcn/ReUI re-pull of filters.tsx would delete findFilterMatch and silently break this test's import. The patch counter does not protect the test.
- **Why deferred / fix direction:** Move the test outside reui/ or add a gate for it.
- **Source:** snapshot line 1418, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-158 · P3 · createTask helper duplicated across e2e specs

- **Type:** debt · **Found:** 2026-08-03 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** createTask in e2e/tests/gantt-parity.spec.ts and date-picker.spec.ts
- **Problem:** Two specs keep private copies of a helper that now lives in fixtures/seed.ts.
- **Why deferred / fix direction:** Fold both into the shared helper; costs re-running two slow specs.
- **Source:** snapshot line 1499, section "Gantt visual refresh — deferred findings (2026-08-03)"

### ISS-159 · P3 · daily-review.spec.ts leaves a new ACTIVE project and customer per run

- **Type:** debt · **Found:** 2026-08-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** cleanup in e2e/tests/daily-review.spec.ts (header ~25-36)
- **Problem:** The spec flips its project ACTIVE and its customer's tamId to admin and never deletes them, so junk rows grow in the shared dev DB each run. The header comment's premise is outdated.
- **Why deferred / fix direction:** Add an afterAll that calls the existing DELETE routes and correct the comment.
- **Source:** snapshot line 1638, section "Daily Review v2 — deferred findings (2026-08-29)"

### ISS-160 · P3 · Three pre-existing flaky e2e tests retried clean (gantt-parity, kanban-dnd)

- **Type:** watch · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** gantt-parity.spec.ts connector-hover case (c); kanban-dnd.spec.ts R3 cross-view parity and mobile touch-reorder (lines ~1073, ~1110-1200)
- **Problem:** Three e2e tests passed only on retry in one gate run; the mobile touch-reorder depends on the seeded project's task count staying contiguous.
- **Why deferred / fix direction:** No action until one fails consistently; then tighten the wait (case c) or fixture isolation (the other two).
- **Source:** snapshot line 1698, section "Critical Path mark — deferred findings (2026-09-02)"; merged duplicates at snapshot lines 2253

### ISS-161 · P3 · Flaky backend test: taskOrdering 'orders GET /tasks (cross-project)'

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** test 'orders GET /tasks (cross-project) by position asc, then id asc' in backend/test/taskOrdering.test.ts (line ~104)
- **Problem:** The test occasionally failed in a full run and passed alone, since it reads the 200-row window of GET /tasks.
- **Why deferred / fix direction:** Observed once; no repro. Watch for recurrence (and note that files now run serially); fix by scoping the query to the test's project.
- **Source:** snapshot line 2269, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-162 · P3 · Recipient concurrency tests never shown to fail without the row lock

- **Type:** test-gap · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** tests in backend/test/activity.test.ts (line ~204) and backend/test/notifications.test.ts (line ~128)
- **Problem:** The concurrency tests cannot fail spuriously but nobody confirmed they fail when the task row lock is removed, so they may not guard it.
- **Why deferred / fix direction:** Temporarily remove the lock and confirm both tests go red; if not, strengthen them.
- **Source:** snapshot line 2277, section "Collaboration & sharing — activity log, notifications, @mentions — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-163 · P3 · Backfill test checks a copy of the migration SELECT, not the file

- **Type:** test-gap · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** migration-backfill describe in backend/test/taskAssigneeMembers.test.ts (line ~234)
- **Problem:** The test's SQL copy and the migration can drift without the test failing.
- **Why deferred / fix direction:** Read the SELECT out of the migration file in the test. Low value: the migration is already applied.
- **Source:** snapshot line 2319, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-164 · P3 · list-dnd 'cross-status reorder in one section sticks' failed locally

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/list-dnd.spec.ts (line 89)
- **Problem:** The test failed 2 of 2 locally against the vite dev server.
- **Why deferred / fix direction:** Cause was shared seeded project state across spec files, fixed by per-file seeding.
- **Source:** snapshot line 2381, section "Application review 2026-10-22 — remaining open items"

### ISS-165 · P3 · accessibleNames.test pairs id/htmlFor by whole-file text search

- **Type:** test-gap · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** source guard in frontend/src/components/accessibleNames.test.ts (line ~170)
- **Problem:** A label with that htmlFor anywhere in the file, even empty or for another control, satisfies the guard.
- **Why deferred / fix direction:** Match htmlFor per label element and require non-empty label text.
- **Source:** snapshot line 2389, section "Application review 2026-10-22 — remaining open items"

### ISS-167 · P3 · taskReorderConcurrency.test.ts:114 timed out once in a loaded gates run

- **Type:** watch · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** backend/test/taskReorderConcurrency.test.ts (line ~114)
- **Problem:** One 30 s timeout during a full gates run on a loaded shared host.
- **Why deferred / fix direction:** If it recurs, capture pg_locks joined to pg_stat_activity during the stall.
- **Source:** snapshot line 2412, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-168 · P3 · Verification gap: /pipeline/:id, /share/:token and PWA banner not exercised

- **Type:** watch · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** /pipeline/:id, /share/:token, InstallBanner
- **Problem:** The audit's live run skipped these three surfaces.
- **Why deferred / fix direction:** Check them in a browser at 375px in both themes.
- **Source:** snapshot line 2425, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

### ISS-190 · P3 · No DOM test environment for focus and keyboard behaviour

- **Type:** decision · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `65a6c77`
- **Where:** frontend/vitest.config.ts (node environment, `src/**/*.test.ts` only)
- **Problem:** Question for the user: add jsdom and @testing-library as devDependencies? Today focus and keyboard behaviour can only be checked through static markup or Playwright, and hooks such as useCustomerTickets have no unit tests.
- **Why deferred / fix direction:** New devDependencies need approval. With them, add hook and focus tests.

## Open — Dev env & ops

### ISS-169 · P3 · nginx has no Cache-Control for /icons/ or /favicon.png

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** frontend/nginx.conf (location blocks, lines 52-80)
- **Problem:** Icon and favicon requests fall through to `/` with no explicit caching directive.
- **Why deferred / fix direction:** Add a short Cache-Control for /icons/ and = /favicon.png.
- **Source:** snapshot line 545, section "PWA icon regeneration — deferred findings (2026-07-25/26)"

### ISS-170 · P3 · Backend tsx watch inotify staleness observed once

- **Type:** watch · **Found:** 2026-08-15 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** backend dev script in backend/package.json (line 8)
- **Problem:** File edits were once silently not picked up until the backend container restarted.
- **Why deferred / fix direction:** Restart the backend container before debugging deeper; record a last-observed date if it recurs.
- **Source:** snapshot line 1530, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

### ISS-171 · P3 · Pipeline cutover checklist: retire standalone Velora stack

- **Type:** watch · **Found:** 2026-08-15 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** external /opt/velora deploy (not in repo); backend/scripts/import-velora.ts still present
- **Problem:** The remaining cutover step is retiring the standalone Velora production stack, which cannot be verified from code.
- **Why deferred / fix direction:** Confirm with the user that the standalone stack is retired, then close; delete import-velora.ts if never needed.
- **Source:** snapshot line 1539, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

### ISS-172 · P3 · Dev backend container can serve stale routes/tasks.ts after an edit (tsx watch)

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** dev backend container (`tsx watch src/index.ts`, backend/package.json)
- **Problem:** Once, after an edit, tsx watch did not reload and the container served the old file until restart.
- **Why deferred / fix direction:** Observed once, cause unknown. Restart backend before trusting a change; revisit if it recurs.
- **Source:** snapshot line 2270, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-173 · P3 · setup.sh TRUST_PROXY default trusts every private address

- **Type:** watch · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TRUST_PROXY default in the compose file written by setup.sh (docs/CONFIGURATION.md §2.13)
- **Problem:** A LAN/VPN client, or a hop rewriting the source to a private address without X-Forwarded-For, can forge its address; the effect is limited to the guest-link rate-limit bucket and logged clientIp.
- **Why deferred / fix direction:** Documented trade-off for the tunnel to nginx to backend topology; use a hop count or CIDRs behind a public CDN.
- **Source:** snapshot line 2329, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-174 · P3 · Dev stack: client reaching :5173 directly can forge clientIp

- **Type:** watch · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** dev stack TRUST_PROXY=1 (docker-compose.yml, untracked; docs/CONFIGURATION.md §2.13)
- **Problem:** In the dev stack a client that reaches the Vite port directly can forge clientIp. Dev only.
- **Why deferred / fix direction:** Accept; no production exposure.
- **Source:** snapshot line 2330, section "Customer-edition port — deferred findings (2026-10-05)"

### ISS-175 · P3 · Bundle budget headroom is about 43 kB

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** LIMIT_BYTES in frontend/scripts/check-bundle-size.mjs (line ~12)
- **Problem:** The entry chunk sits close to the 1 MB budget enforced by check:bundle-size; Overview, Projects and ProjectDetail are still eager.
- **Why deferred / fix direction:** Watch trigger: the budget check fails. Then lazy-load more pages.
- **Source:** snapshot line 2384, section "Application review 2026-10-22 — remaining open items"

### ISS-176 · P3 · gates.sh needs Node/npx on the host PATH for the smoke gate

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** playwright-smoke gate in .claude/scripts/gates.sh (line ~94)
- **Problem:** The gate fails with 'npx: command not found' on a host without Node.
- **Why deferred / fix direction:** Skip with a clear message or run in a container.
- **Source:** snapshot line 2409, section "Project lifecycle and handover — deferred findings (2026-11-10)"; merged duplicates at snapshot lines 2424

### ISS-177 · P3 · CI stack could not be built locally (disk space)

- **Type:** watch · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ci/docker-compose.ci.yml; e2e/tests/pwa.spec.ts; e2e/tests/security-headers.spec.ts
- **Problem:** Those two specs fail against a vite dev server and were not run locally.
- **Why deferred / fix direction:** Rely on CI or free disk space.
- **Source:** snapshot line 2410, section "Project lifecycle and handover — deferred findings (2026-11-10)"

## Open — Docs & process

### ISS-178 · P3 · DESIGN.md theme_default: dark vs code default 'system'

- **Type:** debt · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** theme_default frontmatter in docs/DESIGN.md (line 3, 141)
- **Problem:** DESIGN.md says dark is the default theme but the app defaults to the OS preference.
- **Why deferred / fix direction:** Docs-only: correct theme_default to 'system' (code is source of truth) and reword line 141.
- **Source:** snapshot line 536, section "Login/Sidebar always-dark-pin fix — deferred findings (2026-07-25)"

### ISS-179 · P3 · Vendored reui/autocomplete fidelity gaps

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** header of frontend/src/components/reui/autocomplete.tsx; AutocompleteInput className in CommandPalette.tsx (line ~201)
- **Problem:** Vendor header lacks exact patch count, no registry hashes pinned, and palette input overrides are untested.
- **Why deferred / fix direction:** Name the exact count, pin registry hashes in one manifest, add a computed-style e2e assertion.
- **Source:** snapshot line 658, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-180 · P3 · index.css chip-violet comment is stale

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** comment above the Alert tone tokens in frontend/src/index.css (line ~160)
- **Problem:** The comment claims chip-violet has no meaning elsewhere, but Critical Path now uses it (SolvroBar.tsx:328, CriticalPathMark).
- **Why deferred / fix direction:** Reword the comment on the next index.css touch; no behaviour effect.
- **Source:** snapshot line 1733, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-181 · P3 · Go-live: personal_tokens_allowed_profiles setting not documented

- **Type:** debt · **Found:** 2026-09-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** iTop section of docs/CONFIGURATION.md (line ~412)
- **Problem:** Personal tokens only work for profiles in the authent-token module setting personal_tokens_allowed_profiles (admins only by default), and the deploy doc does not say so.
- **Why deferred / fix direction:** Add the setting to the per-TAM prerequisites in CONFIGURATION.md.
- **Source:** snapshot line 2234, section "iTop integration — real-install findings (2026-09-24, ported 2026-10-04)"

### ISS-182 · P3 · Spine list prose in CLAUDE.md and the SPINE regex in gates.sh are maintained by

- **Type:** debt · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** SPINE regex in .claude/scripts/gates.sh (line 354) and the Spine paragraph in CLAUDE.md
- **Problem:** Two hand-maintained copies of the spine list can drift apart with nothing checking that they agree.
- **Why deferred / fix direction:** Add a gates.sh check, or generate one from the other. Note CLAUDE.md is user-owned wording.
- **Source:** snapshot line 2334, section "Customer-edition port — deferred findings (2026-10-05)"

## Closed

Entries closed during the 2026-11-18 restructure are in the ledger in `docs/archive/plans/issues-restructure.md`, not here.

- ISS-004 · Resolved 2026-11-18 · CHANGELOG "An iTop personal token is saved only when iTop proves it is yours" · Personal-token ownership check is best-effort, not fail-closed
- ISS-026 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Pipeline stage reorder re-packs one row per sibling
- ISS-027 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · DELETE /tasks/:id never re-packs sibling positions
- ISS-028 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Panel date edits can leave a task with due date before start date
- ISS-039 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · tasks.ts object-spreads into where.project
- ISS-041 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Duplicate-label-name 409 shows raw DB message
- ISS-042 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Create-mode parent picker offers subtasks the server rejects
- ISS-051 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · TaskFormModal subtask DONE checkbox lacks canEdit gate
- ISS-116 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Concurrent DELETE of two same-stage opportunities can deadlock (40P01)
- ISS-117 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Pipeline import preview queue has no length cap
- ISS-119 · Resolved 2026-11-19 · CHANGELOG "Fixes in task delete, task dates, Pipeline ordering and import, and the task form" · Import parse silently defaults unparseable Win Probability to 50
- ISS-001 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Label-route permission asymmetry
- ISS-016 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Full-sync removal passes bind one parameter per row (notIn)
- ISS-029 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Section and epic create compute max(position)+1 outside the project lock
- ISS-077 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Every SortableItem is in the tab order, even for read-only viewers
- ISS-107 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Vendored Kanban keyboard DnD unreachable
- ISS-108 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · iTop ticket board is not wired into the drag guard
- ISS-129 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · iTop client follows redirects, forwarding the application token
- ISS-130 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Webhook rate limit is global, not per IP
- ISS-131 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Older tickets of a newly mapped iTop organisation wait for the next full sync
- ISS-133 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · 'Test connection' reports ok:false whenever TimeSpent is missing
- ISS-166 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · Missing tests: withDeadlockRetry and baseline lock reorder
