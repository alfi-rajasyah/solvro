# Known Issues

Open issues, sorted by area and then by severity. Each issue has an ID (`ISS-NNN`) that never changes and is never reused. Code comments and plans cite an issue by its ID.

Last full triage: 2026-11-24 @ `8cc44b8`. The file before the restructure is kept verbatim at `docs/archive/ISSUES-2026-11-18-phase-log.md`; the mapping from every old entry to its ID, or to the reason it closed, is the ledger in `docs/archive/plans/issues-restructure.md`.

## How to use this file

- **Severity.** P1: wrong data, a security or privacy exposure, or a break with no workaround; deferring one needs the user's explicit note. P2: a defect with a workaround, a correctness gap, a missing test on a risky path, or a gap in a gate or process. P3: polish, cosmetic issues, stale comments, hygiene.
- **Type.** `bug` · `debt` · `test-gap` · `watch` (no action until the stated trigger) · `decision` (waits on a user decision; the entry states the question).
- **Areas**, in this order: Security & auth · Data & performance · Backend/API · Frontend UI · Accessibility & tokens · Gantt · Boards & drag · Pipeline · iTop · Exports & sharing · Tests & CI · Dev env & ops · Docs & process.
- **New issue:** the next ID is the highest existing ID plus one. Search for an entry with the same root cause first, and update it instead of adding a second one. Keep the body to six lines or fewer.
- **Closing:** when shipped work fixes or moots an issue (checked against the code, never assumed), delete its body and add one line under `## Closed`: ID, date, commit or CHANGELOG reference, title.
- **Where** names a symbol and a file; the line number is a hint only. **Verified** shows when the location was last checked.

## Open — Security & auth

### ISS-002 · P2 · Token-ownership check: residual risk on some iTop installs

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** PUT /itop/me/token ownership check in backend/src/routes/itopUser.ts (PersonalToken read, line ~215)
- **Problem:** On installs where a profile can read other users' PersonalToken rows (over-readable), a foreign token that can read Persons still passes the ownership check (impersonation with a stolen credential, not escalation). An unreadable PersonalToken class is refused since ISS-004 closed (fail closed).
- **Why deferred / fix direction:** Grant PersonalToken read to the TAM profile or add an iTop-side whoami extension; verify the code-100 path against the real install and record it. Also check there: a profile without read rights may get an empty PersonalToken result instead of an error, which shows `itop_token_not_yours` where `itop_token_unverified` would tell the admin what to fix (still fails closed).
- **Source:** snapshot line 2048, section "iTop integration (personal tokens, ticket actions) — deferred findings (ported 2026-10-04)"; merged duplicates at snapshot lines 2233

### ISS-009 · P3 · Secrets at rest: no AAD, no key rotation

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** seal/open in backend/src/lib/secretBox.ts
- **Problem:** No additional data binds a sealed value to its column, and rotating SECRETS_KEY makes every sealed value unreadable until re-entered. Both need DB write access to exploit. The tag-length half was fixed on 2026-11-19 (16-byte tags required).
- **Why deferred / fix direction:** Bind AAD per column and add a key id for rotation; both need a read-old/write-new migration of stored secrets.

### ISS-010 · P3 · GET /users still returns email to every project:read / pipeline:view caller

- **Type:** debt · **Found:** 2026-10-06 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** GET /users in backend/src/routes/users.ts (lines ~12-45)
- **Problem:** Pickers need the email to tell people apart, so it goes to every caller with those permissions. The PENDING exposure (M2) is closed by the gate.
- **Why deferred / fix direction:** Minimising further needs a picker-specific response shape. Low priority.
- **Source:** snapshot line 2352, section "Penetration-test remediation (September 2026 report) — follow-ups (2026-10-06)"

### ISS-011 · P3 · Rate limits and client address depend on the proxy topology

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** createRateLimiter in backend/src/http/rateLimit.ts; assertSignInAllowed in routes/auth.ts (line ~56); TRUST_PROXY default written by setup.sh (docs/CONFIGURATION.md §2.13)
- **Problem:** Counters are in memory per instance. Behind a public CDN with a hop count that misses it, all users share one address bucket (50 failures block sign-in for 15 min). The private-address TRUST_PROXY default lets a LAN/VPN client forge its address for the guest-link bucket and logged clientIp.
- **Why deferred / fix direction:** Fine for the single-instance tunnel to nginx to backend deploy. Trigger: scale-out or a public CDN. Then add a shared store, a per-account fallback, and CIDR trust. Merged ISS-008, 173.

### ISS-206 · P3 · Shipped frontend dependencies carry 9 audit advisories

- **Type:** debt · **Found:** 2026-11-24 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** `react-router-dom` (frontend/package.json); `dompurify`, `fflate` under `jspdf`; `uuid`, `tmp`, `brace-expansion` under `exceljs` (frontend/package-lock.json)
- **Problem:** `npm audit --omit=dev` reports 9 (2 high, 7 moderate). React Router has open-redirect advisories; the only redirect from user input, Login's `from`, goes through safeRedirectPath (frontend/src/lib/safeRedirect.ts), which rejects `//`, backslashes and other origins. The rest sit in export libraries on paths Solvro does not feed with untrusted input.
- **Why deferred / fix direction:** No exploit path found. React Router, `dompurify` and `fflate` have in-range fixes: `npm update` in the container. For `exceljs`, npm offers only a major downgrade to 3.4.0; wait for an upstream release.

### ISS-207 · P3 · Backend zod 3 has a high memory-exhaustion advisory

- **Type:** debt · **Found:** 2026-11-24 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** `zod` ^3.23.8 in backend/package.json; express.json limit in backend/src/app.ts (line ~83)
- **Problem:** `npm audit --omit=dev` in backend reports 1 high: validation of oversized constrained collections can exhaust memory. The 1 MB body limit (app and nginx) caps the input size, so the exposure is bounded.
- **Why deferred / fix direction:** The fix is zod 4, a major upgrade that touches every route schema. Plan it as its own change; until then keep the 1 MB limit.

## Open — Data & performance

### ISS-013 · P2 · GET /users is unpaginated

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** GET / handler in backend/src/routes/users.ts (line ~15)
- **Problem:** Every user is returned and rendered as an <option> in the assignee select.
- **Why deferred / fix direction:** Paginate or add search-filter/cap to the endpoint and pickers.
- **Source:** snapshot line 567, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-014 · P2 · GET /tasks has a 200-row window

- **Type:** bug · **Found:** 2026-07-27 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** GET / handler in backend/src/routes/tasks.ts (line ~328)
- **Problem:** On a large DB the /tasks page silently shows only the first 200 rows; only the count line tells the user.
- **Why deferred / fix direction:** Add project/customer/date filters or real pagination.
- **Source:** snapshot line 575, section "Kanban → ReUI swap — deferred findings (2026-07-27)"; merged duplicates at snapshot lines 2257

### ISS-018 · P3 · ensureTaskVisible adds a second DB round-trip per task mutation

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** ensureTaskVisible in backend/src/lib/visibility.ts (line ~129)
- **Problem:** Visibility check then write costs two round-trips; Prisma update accepts only a unique where so the filter cannot be folded in.
- **Why deferred / fix direction:** Trigger: profiling against the sub-200ms NFR. Then use updateMany with a visibility filter and inspect the count.
- **Source:** snapshot line 320, section "Tech debt / follow-ups from recent work"

### ISS-019 · P3 · pg_trgm GIN index for /search

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** ILIKE queries in backend/src/routes/search.ts
- **Problem:** Seq scans are fine today (0.6-2.6ms at 4k tasks) but grow linearly.
- **Why deferred / fix direction:** Trigger: task rows near 50k or /search p95 above 100ms. Schema change is ask-first.
- **Source:** snapshot line 649, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-020 · P3 · GET /notes/recent has no index leading with noteDate

- **Type:** watch · **Found:** 2026-08-31 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** GET /recent in backend/src/routes/notes.ts (line ~61)
- **Problem:** The route range-scans project and customer notes by noteDate with no index leading on it, so it plans a seq scan. Fast at dev volume.
- **Why deferred / fix direction:** Add @@index([noteDate]) on both models via migration when volume grows (about 10k notes a year is the stated horizon).
- **Source:** snapshot line 1662, section "Daily Review collapse & Recent notes — deferred findings (2026-08-31)"

### ISS-023 · P3 · Activity feed orders by id while the index is (project_id, created_at desc)

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** activity list query in backend/src/lib/activity.ts (line ~278); ActivityEvent indexes in backend/prisma/schema.prisma (line ~360)
- **Problem:** Ordering by id does not match the created_at index; measured under 1 ms at 200k rows so no action needed now.
- **Why deferred / fix direction:** Add a (project_id, id desc) index only if feed latency ever matters (trigger: slow feed query at larger row counts).
- **Source:** snapshot line 2278, section "Collaboration & sharing — activity log, notifications, @mentions — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Backend/API

### ISS-203 · P3 · Offboarding cap of 5000 projects meets the 1 MB request body limit

- **Type:** watch · **Found:** 2026-11-20 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** MAX_OFFBOARD_PROJECTS in backend/src/routes/admin.ts; express.json limit in backend/src/app.ts (line ~83); client_max_body_size in frontend/nginx.conf
- **Problem:** A 5000-project handover body leaves about 140 characters of note per project on average; a larger body gets a 413.
- **Why deferred / fix direction:** Notes are typed by hand per project, so a full-cap handover with long notes is unrealistic. Trigger: a 413 on offboarding. Then raise the JSON limit for that route only.

### ISS-033 · P3 · Three narrow task selects omit isCriticalPath

- **Type:** watch · **Found:** 2026-09-02 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** task selects in backend/src/routes/dailyReview.ts (~237), routes/search.ts (~58), lib/portfolio.ts (~34)
- **Problem:** Daily Review, global search and the portfolio roll-up select tasks without isCriticalPath, so the mark cannot be shown there.
- **Why deferred / fix direction:** Not needed today; widen the three selects only if the mark is ever surfaced on those surfaces.
- **Source:** snapshot line 1717, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-036 · P3 · CORS config has no exposedHeaders (X-Total-Count)

- **Type:** watch · **Found:** 2026-09-29 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** cors() in backend/src/app.ts (line ~62)
- **Problem:** Cross-origin callers cannot read X-Total-Count; the same-origin /api proxy is unaffected.
- **Why deferred / fix direction:** Add exposedHeaders: ['X-Total-Count'] only if the API is ever called cross-origin.
- **Source:** snapshot line 2256, section "Professional UI pass — deferred findings (2026-09-29, ported 2026-10-05)"

## Open — Frontend UI

### ISS-048 · P3 · Popovers can clip near scroll container bottoms

- **Type:** watch · **Found:** 2026-07-25 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** absolute-positioned dropdowns in List rows, Kanban column menu, Risks selects
- **Problem:** Absolute-positioned popovers near the bottom of internally scrolling containers can be clipped instead of flipping.
- **Why deferred / fix direction:** Revisit if a user reports it; fix by portalling the popovers.
- **Source:** snapshot line 517, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

### ISS-050 · P3 · No board-adjacent subtask promote/re-parent

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** TaskPanel.tsx; TaskFormModal Parent field (line ~589)
- **Problem:** Promoting or re-parenting a subtask requires the modal round-trip.
- **Why deferred / fix direction:** Revisit if usage shows the modal is friction (Promote to task row-menu action).
- **Source:** snapshot line 586, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-055 · P3 · Pointer-dependent initial submenu highlight

- **Type:** watch · **Found:** 2026-07-31 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** submenu highlight in frontend/src/components/reui/filters.tsx (lines ~1496, 1521)
- **Problem:** Whichever row lands under the cursor when a submenu opens wins the highlight, so a blind Enter can pick another row. Upstream hover-follows-highlight behavior.
- **Why deferred / fix direction:** Not worth a vendored patch; revisit only if reported.
- **Source:** snapshot line 1231, section "ReUI Filters phase — deferred findings (2026-07-31)"

### ISS-068 · P3 · Filters popover keeps stealing focus after a filter is chosen

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** Filters popover (vendored filters component) on /tasks; workaround in e2e/tests/task-conflict.spec.ts (openEditForm, line ~326)
- **Problem:** After picking a filter and pressing Escape, the popover's focus manager pulls focus back into its search input for a short time, so quick typing into a task form can land in the wrong field.
- **Why deferred / fix direction:** Not reproduced in code review; investigate the popover close/focus-return path if users report it.
- **Source:** snapshot line 2272, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Accessibility & tokens

### ISS-205 · P3 · Faint /60 and /40 secondary text on placeholders and row marks

- **Type:** bug · **Found:** 2026-11-20 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** `text-on-surface-variant/60` placeholders in EpicPanel.tsx (~328, ~374), TaskPanel.tsx (~1002), CommentMentions.tsx (~225); icon marks in TaskPanel.tsx, kanban-v2/cards.tsx, OpportunityCard.tsx, TicketCard.tsx, ProjectEpics.tsx, SectionReorderModal.tsx; `/40` in TaskFormModal.tsx (~437, ~634) and ProjectList.tsx (~1103)
- **Problem:** Placeholder text at 60% (or 40%) opacity reads about 3.1:1 or lower, under 4.5:1; Login now uses the full token, so placeholders differ across the app.
- **Why deferred / fix direction:** Outside ISS-080's named sites. Use the full `text-on-surface-variant` token for text placeholders; icons need 3:1 non-text contrast only.

## Open — Gantt

### ISS-099 · P3 · Per-bar ResizeObserver in SolvroBar

- **Type:** watch · **Found:** 2026-07-25 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** useLabelFits in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~105)
- **Problem:** One ResizeObserver per rendered bar; fine at current scale.
- **Why deferred / fix direction:** Trigger: a project rendering low hundreds of bars at once. Then share a single observer.
- **Source:** snapshot line 519, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

## Open — Boards & drag

### ISS-109 · P3 · Vendored Kanban: drop on displaced card can cancel a one-slot move

- **Type:** watch · **Found:** 2026-07-27 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** same-container branch in frontend/src/components/reui/kanban.tsx (lines ~403, ~527)
- **Problem:** handleDragEnd recomputes indexes against the already-previewed order, so a precise drop can undo the preview move. Not reproduced under a fixed e2e assertion.
- **Why deferred / fix direction:** Dogfood watch only; revisit if a user reports a lost reorder.
- **Source:** snapshot line 610, section "Kanban → ReUI swap — deferred findings (2026-07-27)"

### ISS-110 · P3 · TaskPanel subtask drag may flicker back before reorder commits

- **Type:** watch · **Found:** 2026-07-30 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** onValueChange no-op in components/TaskPanel.tsx (line ~856)
- **Problem:** Subtask list is derived from the tasks query, so the DOM keeps the pre-drop order until the optimistic update lands. A snap-back flicker is possible in that window.
- **Why deferred / fix direction:** Only act if the flicker is seen in practice; direction is a local order mirror like SectionReorderModal.
- **Source:** snapshot line 1064, section "Sortable reorder (sections + subtasks) — deferred findings (2026-07-30)"

## Open — Pipeline

### ISS-118 · P3 · DealCard reads the full deal list client-side

- **Type:** watch · **Found:** 2026-08-15 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** DealCardInner in frontend/src/components/DealCard.tsx (line ~82)
- **Problem:** Every project Overview tab loads the whole opportunity list to find one deal. Fine at hundreds of deals.
- **Why deferred / fix direction:** Revisit at the PRD's ~2k-deal trigger, e.g. with a by-project endpoint.
- **Source:** snapshot line 1526, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

## Open — iTop

### ISS-120 · P2 · iTop go-live checks: TimeSpent, User class, lifecycle stimuli

- **Type:** watch · **Found:** 2026-09-24 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** ITOP_TIME_SPENT_* in backend/src/lib/itop/types.ts; syncTimeEntries / upsertTimeEntry in lib/itop/sync.ts; user matching in routes/itopUser.ts; TRANSITIONS in frontend/src/components/itop/board/dropMapper.ts
- **Problem:** Six assumptions are unverified on the real install: TimeSpent duration in seconds (wrong by 60x if minutes); the TimeSpent.ticket_ref name and writability; the application token cannot read User, so User.itopUserId stays unset and time logging refuses; the drop graph assumes default stimuli; Time Tracking is not bundled with iTop Community; blank-duration entries are skipped every tick.
- **Why deferred / fix direction:** Blocks go-live, not code. Install Time Tracking from iTop Hub, run the TimeSpent probes, check User read rights and the state machine, then flip the constants or adjust the graph. Merged ISS-121, 122, 125, 127, 135.

### ISS-126 · P3 · Mobile iTop board is a single stacked column with touch drag

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** KanbanBoard grid in frontend/src/components/itop/board/TicketBoard.tsx (line ~263)
- **Problem:** Below md the five columns stack vertically with touch drag; long scroll to a distant column and touch precision are unevaluated.
- **Why deferred / fix direction:** Evaluate on a real phone before treating it as the phone-usable Board.
- **Source:** snapshot line 2101, section "iTop integration (board, new tickets) — deferred findings (ported 2026-10-04)"

## Open — Exports & sharing

### ISS-137 · P3 · Gantt Excel/PDF downloads blocked by Chromium on http prod origin

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** deployment origin (http://solvro.elitery.local), download helpers in frontend/src/lib/gantt/exportExcel.ts and exportPdf.ts
- **Problem:** Chromium-family browsers show 'blocked this download' for files from a non-secure origin; the user can keep the file from the download overflow menu, so it is friction not data loss.
- **Why deferred / fix direction:** Not fixable by changing format. Options: reach app via localhost forward/reverse proxy, HTTPS with internal CA (declined), or PDF View -> Save as PDF. Last observed 2026-07-31.
- **Source:** snapshot line 70, section "Known bugs / inconsistencies"; merged duplicates at snapshot lines 77, 86, 92

### ISS-141 · P3 · Guest page still loads Google Fonts from Google

- **Type:** debt · **Found:** 2026-09-30 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** frontend/index.html (lines 13-20), served at /share/<token> via frontend/nginx.conf
- **Problem:** A guest opening a share link makes their browser contact Google; Referrer-Policy: no-referrer keeps the token out of those requests.
- **Why deferred / fix direction:** Self-host the fonts; deferred because it changes the whole app shell.
- **Source:** snapshot line 2283, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Tests & CI

### ISS-145 · P2 · Flaky e2e drag specs and backend concurrency test

- **Type:** watch · **Found:** 2026-07-28 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** list-dnd.spec.ts, kanban-dnd.spec.ts (R3 parity, mobile touch-reorder), gantt-parity.spec.ts (connector-hover case c); backend/test/taskReorderConcurrency.test.ts (line ~114)
- **Problem:** First-attempt flakes absorbed by retries; one 30 s backend timeout in a loaded gates run.
- **Why deferred / fix direction:** Trigger: a case fails through its retry, or a new case joins. Then tighten the wait or fixture isolation; for the backend test capture pg_locks joined to pg_stat_activity during the stall. Merged ISS-160, 167.

## Open — Dev env & ops

### ISS-175 · P3 · Bundle budget headroom is about 20 kB

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** LIMIT_BYTES in frontend/scripts/check-bundle-size.mjs (line ~12)
- **Problem:** The entry chunk is 980.44 kB against the 1000 kB budget enforced by check:bundle-size (CI run on `8774028`); headroom fell from about 43 kB to about 20 kB since 2026-10-22. Overview, Projects and ProjectDetail are still eager.
- **Why deferred / fix direction:** Watch trigger: the budget check fails, or headroom drops under 10 kB. Then lazy-load more pages.
- **Source:** snapshot line 2384, section "Application review 2026-10-22 — remaining open items"

### ISS-201 · P3 · Frontend dev tools carry high audit advisories; the trigger has fired

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-24 @ `8cc44b8`
- **Where:** `brace-expansion` under `minimatch` (eslint, typescript-eslint); `vite`, `source-map-js`, `nanoid`, `browserslist`, `fast-uri` in frontend/package-lock.json
- **Problem:** `npm audit` in the frontend container reports 31 advisories (7 high, 22 moderate, 2 low). The watch trigger "a high advisory" fired: `brace-expansion` (DoS) is now high in the `minimatch` chain. All are dev or build tools and do not ship.
- **Why deferred / fix direction:** Every one has an in-range fix. Run `npm update <pkg>` in the container (lock-file trap in the root CLAUDE.md; `npm audit fix` crashes in npm 10.9), then a committed lock. The `vite`/`vitest` bump touches the test runner, so give it its own commit.

## Open — Docs & process

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
- ISS-136 · Resolved 2026-11-19 · CHANGELOG "Fixes in project create locks, the iTop integration, and keyboard drag" · iTop full-sync prune can exceed Postgres bind-parameter limit (same defect as ISS-016)
- ISS-015 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Admin Project Overrides reassign select renders every candidate per row
- ISS-017 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Offboarding and user delete update customers one at a time
- ISS-021 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · useCreateTask omits the Daily Review invalidation
- ISS-030 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Offboarding endpoint accepts a receiver whose role has zero permissions
- ISS-043 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Material Symbols stylesheet overrides icon size/display utilities
- ISS-044 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Service-mapping mutations lack optimistic updates
- ISS-046 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · TaskPanel section chip stale during cross-section drag
- ISS-049 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Only a 512 maskable icon declared
- ISS-064 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · GET /customers/:id itopOrgId/itopOrgName not typed or used on frontend
- ISS-076 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Stale preview in the handover dialog
- ISS-081 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · InstallBanner nests a role=button span inside a <button>
- ISS-082 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · Favicon is on-light mark only; weak on dark tab strips
- ISS-112 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · useUpdateSection scope can diverge from server after a failed PATCH
- ISS-148 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · No component tests for ProjectStatusChangeDialogs and HandoverModal
- ISS-190 · Resolved 2026-11-19 · CHANGELOG "Fixes in offboarding, icon sizing and the app shell, and query hooks" · No DOM test environment for focus and keyboard behaviour
- ISS-061 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · TaskPanel header-menu failure alert renders below the subtasks
- ISS-062 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · ProjectList section-header actions gate on task:write; routes need project:write
- ISS-067 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · TaskPanel shows 'Loading task…' forever when the tasks fetch fails
- ISS-083 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Overview.tsx off-token styling (remaining: raw font-mono P- id)
- ISS-084 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · PortfolioCalendar: rounded-full bar and raw font-mono year switcher
- ISS-088 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Shared dialog focus trap only wraps from the last focusable element
- ISS-089 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · LinksSection departs from the DESIGN.md §4 focus treatment (buttons lack focus-v
- ISS-091 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Two text sizes have no matching type role
- ISS-092 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Epic colour swatches are 16px targets 4px apart
- ISS-093 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Gantt tree pane: engine container clamp can re-clip fixed columns
- ISS-095 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Gantt splitter drag: fixed columns clip until pointerup
- ISS-097 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Redundant double-sort in legendEntries section branch
- ISS-098 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Milestone connector endpoints anchor at day-box edge
- ISS-100 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Section-id parse/format logic split across files
- ISS-102 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · GanttDatePicker uses shadow-md and may be dead code
- ISS-103 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Gantt tree Dates cell shows range text twice while editing
- ISS-104 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Gantt drag-clone keeps shadow-lg without a SOLVRO PATCH marker
- ISS-106 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Per-call mutate onError callbacks can be lost in SolvroGantt.tsx
- ISS-111 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · SectionReorderModal has no permission check of its own
- ISS-113 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · SectionReorderModal drag guard can strand the modal
- ISS-155 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · No e2e spec for the Reorder sections modal drag
- ISS-189 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Two drag-handle buttons use a different focus style from FIELD_FOCUS
- ISS-192 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Section reorder modal keeps its own order after a failed save
- ISS-194 · Resolved 2026-11-19 · CHANGELOG "Fixes in the Gantt, the task panel and section dialog, and accessibility" · Modal cannot tell its close button from Escape or a backdrop click (filed and fixed in the same change)
- ISS-007 · Resolved 2026-11-19 · CHANGELOG "Log redaction, secret tags, and receivers without access" · No pino redact configuration for the iTop token
- ISS-012 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Cross-tab sign-out leaves the other tab on cached pages
- ISS-060 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Tasks.tsx grid and kanban-v2 SubtaskRow show no Critical Path mark
- ISS-063 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Missing-title banner doesn't name the offending card
- ISS-070 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Members button count and avatars exclude the SA
- ISS-071 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Frontend built-in role list omits SALES
- ISS-074 · Resolved 2026-11-19 · CHANGELOG "Project status in the task list" · Tasks page makes an extra GET /projects request per visit
- ISS-075 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Inline 'is'/'is any of' operator strings in Projects.tsx
- ISS-138 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Download helpers revoke object URL synchronously after click
- ISS-139 · Resolved 2026-11-19 · CHANGELOG "Fixes in exports, users and access, and small UI" · Screen and PDF Gantt export diverge on bar treatments
- ISS-191 · Resolved 2026-11-19 · CHANGELOG "Log redaction, secret tags, and receivers without access" and "Fixes in exports, users and access, and small UI" · Handover pickers still list receivers with zero permissions
- ISS-024 · Resolved 2026-11-19 · Accepted as is by user decision 2026-11-19, no change · Members backfill also inserts project:view-all holders
- ISS-025 · Resolved 2026-11-19 · CHANGELOG "Section duplicate speed, epic owners, deactivated users, backend messages" · Section duplicate does one INSERT per copied task under a 30 s transaction
- ISS-035 · Resolved 2026-11-19 · CHANGELOG "Section duplicate speed, epic owners, deactivated users, backend messages" · Epic ownerId not validated against the project's people
- ISS-037 · Resolved 2026-11-19 · CHANGELOG "Section duplicate speed, epic owners, deactivated users, backend messages" · Ordinary edit routes still accept an inactive user as assignee/TAM/SA/owner
- ISS-040 · Resolved 2026-11-19 · CHANGELOG "Section duplicate speed, epic owners, deactivated users, backend messages" · Backend-produced text with em dashes still reaches the interface
- ISS-146 · Resolved 2026-11-19 · CHANGELOG "Typecheck coverage and icon caching" · backend tsconfig include never reaches scripts/ or test/
- ISS-152 · Resolved 2026-11-19 · CHANGELOG "Typecheck coverage and icon caching" · Typecheck gate does not cover vite.config.ts
- ISS-169 · Resolved 2026-11-19 · CHANGELOG "Typecheck coverage and icon caching" · nginx has no Cache-Control for /icons/ or /favicon.png
- ISS-147 · Resolved 2026-11-19 · `.claude/scripts/gates.sh` gate `e2e-touched-specs` · gates.sh exercises only one e2e spec
- ISS-176 · Resolved 2026-11-19 · `.claude/scripts/gates.sh` npx SKIP in the smoke gates · gates.sh needs Node/npx on the host PATH for the smoke gate
- ISS-182 · Resolved 2026-11-19 · `.claude/scripts/gates.sh` gate `spine-list-agreement` · Spine list prose in CLAUDE.md and the SPINE regex in gates.sh are maintained by
- ISS-178 · Resolved 2026-11-19 · `docs/DESIGN.md` theme_default system · DESIGN.md theme_default: dark vs code default 'system'
- ISS-179 · Resolved 2026-11-19 · CHANGELOG "Vendored component record and palette input check"; remaining drift filed as ISS-196 and ISS-197 · Vendored reui/autocomplete fidelity gaps
- ISS-180 · Resolved 2026-11-19 · CHANGELOG "Vendored component record and palette input check" · index.css chip-violet comment is stale
- ISS-181 · Resolved 2026-11-19 · `docs/CONFIGURATION.md` iTop per-TAM prerequisites · Go-live: personal_tokens_allowed_profiles setting not documented
- ISS-183 · Resolved 2026-11-19 · CHANGELOG "Task dates on create, stage locks, epic owners, inactive services" · Task create accepts a due date before the start date
- ISS-184 · Resolved 2026-11-19 · CHANGELOG "Task dates on create, stage locks, epic owners, inactive services" · Pipeline stage re-pack and offboarding lock deals in different orders
- ISS-198 · Resolved 2026-11-19 · CHANGELOG "Task dates on create, stage locks, epic owners, inactive services" · Epic owner picker can offer a deactivated member, TAM or SA
- ISS-032 · Resolved 2026-11-19 · CHANGELOG "Task dates on create, stage locks, epic owners, inactive services" (user decision: block new adds) · Inactive services can still be assigned to projects and customers
- ISS-185 · Resolved 2026-11-19 · CHANGELOG "Task form at phone width, inactive mention chips, autocomplete" · Task form scrolls sideways at 375px when the label creator opens
- ISS-069 · Resolved 2026-11-19 · CHANGELOG "Task form at phone width, inactive mention chips, autocomplete" · Mention chips resolve against the whole directory, including deactivated users
- ISS-196 · Resolved 2026-11-19 · CHANGELOG "Task form at phone width, inactive mention chips, autocomplete" · Vendored autocomplete item class carries a mangled size rule
- ISS-197 · Resolved 2026-11-19 · CHANGELOG "Task form at phone width, inactive mention chips, autocomplete" · Vendored autocomplete lacks upstream's empty-list scroll fix
- ISS-144 · Resolved 2026-11-19 · CHANGELOG "Dark pin spec and tighter tests" · No e2e spec asserts Login/Sidebar always-dark pin
- ISS-153 · Resolved 2026-11-19 · CHANGELOG "Dark pin spec and tighter tests" · /search contract-test gaps
- ISS-163 · Resolved 2026-11-19 · CHANGELOG "Dark pin spec and tighter tests" · Backfill test checks a copy of the migration SELECT, not the file
- ISS-165 · Resolved 2026-11-19 · CHANGELOG "Dark pin spec and tighter tests" · accessibleNames.test pairs id/htmlFor by whole-file text search
- ISS-162 · Resolved 2026-11-19 · Verified 2026-11-19: with the task row lock removed, both concurrency tests failed 3 of 3 runs; with it restored they passed; no change needed · Recipient concurrency tests never shown to fail without the row lock
- ISS-006 · Resolved 2026-11-19 · Accepted as is by user decision 2026-11-19, no change · POST /tasks/:id/duplicate needs task:write, create needs project:write
- ISS-034 · Resolved 2026-11-19 · Accepted as is by user decision 2026-11-19 (ticket ref stays edit-only), no change · A task cannot be created with an iTop ticket ref pre-set
- ISS-038 · Resolved 2026-11-19 · Accepted as is by user decision 2026-11-19, no change · A handover does not notify a new customer owner
- ISS-195 · Resolved 2026-11-19 · CHANGELOG "Guest link address, iTop sync atomicity, cross-tab account switch" · A fast /auth/me reply can hide a cross-tab account switch
- ISS-132 · Resolved 2026-11-19 · CHANGELOG "Guest link address, iTop sync atomicity, cross-tab account switch" (user decision: no Tickets tab notice) · A failed iTop sync keeps half its work
- ISS-186 · Resolved 2026-11-19 · CHANGELOG "Guest link address, iTop sync atomicity, cross-tab account switch" · A full sync already running can undo the full-sync reset of a new org mapping
- ISS-142 · Resolved 2026-11-19 · CHANGELOG "Guest link address, iTop sync atomicity, cross-tab account switch" · Guest links use the address the owner is browsing from
- ISS-187 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · Drag handles are not registered as the dnd-kit activator node
- ISS-188 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · Kanban drag handles are 16px touch targets
- ISS-115 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · Sortable DataGrid header cannot center-align
- ISS-114 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · data-grid-column-header hasControls branch ignores right-align
- ISS-058 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · ProjectRisks inline cells use plain select instead of ui/select
- ISS-199 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · Vendored autocomplete changes its border on focus
- ISS-101 · Resolved 2026-11-19 · CHANGELOG "Drag handles, data-grid header alignment, risk cells, autocomplete focus" · handleResourceReorder is ~130 lines
- ISS-143 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" (user decision: hooks rules only) · No ESLint config; exhaustive-deps disable comment is inert
- ISS-157 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" · filters.test.ts colocated in vendored reui/ and imports a patched export
- ISS-158 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" · createTask helper duplicated across e2e specs
- ISS-159 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" · daily-review.spec.ts leaves a new ACTIVE project and customer per run
- ISS-161 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" · Flaky backend test: taskOrdering 'orders GET /tasks (cross-project)'
- ISS-022 · Resolved 2026-11-19 · CHANGELOG "Frontend lint and test cleanups" · useDuplicateTask/Section isPending includes inactive-query refetches
- ISS-164 · Resolved 2026-11-19 · Cause (shared seeded project state across spec files) already fixed by per-file seeding; closed 2026-11-19 · list-dnd 'cross-status reorder in one section sticks' failed locally
- ISS-073 · Resolved 2026-11-20 · Accepted as is in triage 2026-11-20 (reload clears it), no change · A lazy page chunk that fails twice stays failed
- ISS-094 · Resolved 2026-11-20 · Accepted as is in triage 2026-11-20, no change · Gantt tree pane narrowed below 356px clips fixed columns (accepted)
- ISS-124 · Resolved 2026-11-20 · Working as designed (iTop has no dry-run stimulus), closed in triage 2026-11-20 · A token's write capability can't be verified up front
- ISS-128 · Resolved 2026-11-20 · No install differs; iTop shows its own message if one does, closed in triage 2026-11-20 · pending_reason assumed to be free text
- ISS-156 · Resolved 2026-11-20 · Accepted as is in triage 2026-11-20, no change · filters-duplicate-chip e2e spec is an invariant net, not a discriminating test
- ISS-174 · Resolved 2026-11-20 · Dev stack only, no production exposure, closed in triage 2026-11-20 · Dev stack: client reaching :5173 directly can forge clientIp
- ISS-053 · Resolved 2026-11-20 · No defect today; fix when a submenu sits in a z-100+ host, closed in triage 2026-11-20 · dropdown-menu SubContent shares popover's z-index-on-Popup gap
- ISS-057 · Resolved 2026-11-20 · No defect today; every filter field is string-valued, closed in triage 2026-11-20 · Duplicate-chip guard uses === and misses object-valued options
- ISS-059 · Resolved 2026-11-20 · No defect today; the override follows Chip markup, closed in triage 2026-11-20 · CriticalPathMark chip padding coupled to Chip's DOM shape
- ISS-085 · Resolved 2026-11-20 · No defect today; the variant is used on one surface only, closed in triage 2026-11-20 · IconTile outline variant invisible by default in dark theme on lowest surface
- ISS-123 · Resolved 2026-11-20 · No defect today; expiry stays null where iTop hides PersonalToken, closed in triage 2026-11-20 · Personal-token expiry is best-effort, not guaranteed
- ISS-170 · Resolved 2026-11-20 · Observed once (2026-08-15), not recurred, closed in triage 2026-11-20 · Backend tsx watch inotify staleness observed once
- ISS-172 · Resolved 2026-11-20 · Observed once (2026-09-30), not recurred, closed in triage 2026-11-20 · Dev backend container can serve stale routes/tasks.ts after an edit (tsx watch)
- ISS-177 · Resolved 2026-11-20 · CI runs both specs on every PR, closed in triage 2026-11-20 · CI stack could not be built locally (disk space)
- ISS-087 · Resolved 2026-11-20 · Merged into ISS-200 in triage 2026-11-20 · Vendored ui/* and reui/* still carry the fuller focus form
- ISS-121 · Resolved 2026-11-20 · Merged into ISS-120 in triage 2026-11-20 · TimeSpent.ticket_ref attribute name unverified on the real install
- ISS-122 · Resolved 2026-11-20 · Merged into ISS-120 in triage 2026-11-20 · Application/personal token cannot read iTop's User class
- ISS-125 · Resolved 2026-11-20 · Merged into ISS-120 in triage 2026-11-20 · Drop lifecycle graph assumes iTop's default stimuli
- ISS-127 · Resolved 2026-11-20 · Merged into ISS-120 in triage 2026-11-20 · Time Tracking extension is not bundled with iTop Community
- ISS-135 · Resolved 2026-11-20 · Merged into ISS-120 in triage 2026-11-20 · iTop time entries with blank duration are skipped every sync tick
- ISS-160 · Resolved 2026-11-20 · Merged into ISS-145 in triage 2026-11-20 · Three pre-existing flaky e2e tests retried clean (gantt-parity, kanban-dnd)
- ISS-167 · Resolved 2026-11-20 · Merged into ISS-145 in triage 2026-11-20 · taskReorderConcurrency.test.ts:114 timed out once in a loaded gates run
- ISS-008 · Resolved 2026-11-20 · Merged into ISS-011 in triage 2026-11-20 · Rate limiter is in-process only
- ISS-173 · Resolved 2026-11-20 · Merged into ISS-011 in triage 2026-11-20 · setup.sh TRUST_PROXY default trusts every private address
- ISS-003 · Resolved 2026-11-20 · Accepted as is by user decision 2026-11-20, documented in docs/CONFIGURATION.md §2.17 · GET /itop/services returns every organisation's services, unscoped
- ISS-005 · Resolved 2026-11-20 · CHANGELOG "Task comment access, large offboardings, Velora import retired" · Block task comments for STAKEHOLDER and SA; built-in roles stay admin-editable
- ISS-202 · Resolved 2026-11-20 · CHANGELOG "Task comment access, large offboardings, Velora import retired" · Unmapping an iTop org during a running sync can re-attach its tickets
- ISS-031 · Resolved 2026-11-20 · CHANGELOG "Task comment access, large offboardings, Velora import retired" · Offboarding a TAM with more than 500 projects is refused
- ISS-171 · Resolved 2026-11-20 · CHANGELOG "Task comment access, large offboardings, Velora import retired" · Delete backend/scripts/import-velora.ts; Velora stack retired
- ISS-090 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" · Dark primary contrast 4.4986:1: nudge the dark token to 4.5:1
- ISS-105 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" · Gantt Critical Path ring: fixed violet in both themes
- ISS-140 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" · Gantt Excel export: add an iTop ticket column
- ISS-045 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" · Section-color parity gap on non-Gantt surfaces (no fallback resolver)
- ISS-096 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" · #94a3b8 section-color sentinel duplicated between schema and frontend
- ISS-054 · Resolved 2026-11-20 · CHANGELOG "Dark primary contrast, Critical Path ring, section colours, stat cards, Excel iTop column" (Overview only; Executive has no stat cards) · Move Overview and Executive KPI stat cards into the vendored Frame
- ISS-056 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" · Filter toolbar rows: align text to the uniform 12-13px density
- ISS-047 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" · Comment composer is a single-line input
- ISS-052 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" · Palette visual polish
- ISS-065 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" · useItopTicket utcOffsetMinutes isn't part of its query key
- ISS-149 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" · pwa.spec.ts fails against the Vite dev server
- ISS-193 · Resolved 2026-11-20 · CHANGELOG "Filter toolbar text, comment box, search trigger, iTop ticket hours, icon stylesheet" (preload keeps the icons layer, see frontend/index.html) · The icon stylesheet now loads after the app stylesheet
- ISS-078 · Resolved 2026-11-20 · CHANGELOG "Hover contrast, secondary text, focus borders, badge variants" · Light-theme hover contrast: hover:bg-primary-container with text-on-primary
- ISS-079 · Resolved 2026-11-20 · CHANGELOG "Hover contrast, secondary text, focus borders, badge variants" · About 30 primary buttons use hover:bg-primary-container with white text
- ISS-080 · Resolved 2026-11-20 · CHANGELOG "Hover contrast, secondary text, focus borders, badge variants" · text-on-surface-variant/60 on empty marks and the Login footer is about 3.6:1
- ISS-200 · Resolved 2026-11-20 · CHANGELOG "Hover contrast, secondary text, focus borders, badge variants" · Vendored select trigger changes its border on focus
- ISS-086 · Resolved 2026-11-20 · CHANGELOG "Hover contrast, secondary text, focus borders, badge variants" · Badge solid-tone variants not for use until chip rebase
- ISS-066 · Resolved 2026-11-20 · CHANGELOG "Loading placeholders, out-of-range iTop durations" · Legacy exceptions to the binding UI-pass rules (animate-pulse, text sizes)
- ISS-072 · Resolved 2026-11-20 · CHANGELOG "Loading placeholders, out-of-range iTop durations" · Loading states without SkeletonRegion in ported iTop/customer/utilization UI
- ISS-204 · Resolved 2026-11-20 · CHANGELOG "Loading placeholders, out-of-range iTop durations" · iTop time entry with a very large duration fails the INT4 column and is skipped
- ISS-134 · Resolved 2026-11-20 · docs/CONFIGURATION.md §2.17 (iTop User-class read right), wave 10 · Deployment note: itopUserId matching needs REST read rights on iTop's User class
- ISS-150 · Resolved 2026-11-20 · CHANGELOG "End-to-end waits, search spec, colour-by reload test" · No e2e coverage for colorBy persistence across page reload
- ISS-151 · Resolved 2026-11-20 · CHANGELOG "End-to-end waits, search spec, colour-by reload test" · E2E fixed-timeout (waitForTimeout) convention
- ISS-154 · Resolved 2026-11-20 · CHANGELOG "End-to-end waits, search spec, colour-by reload test" · search.spec.ts polish and listener-ready guard
- ISS-168 · Resolved 2026-11-20 · Checked at the wave 10 Delivery Gate (docs/archive/plans/issues-wave-10.md) · Verification gap: /pipeline/:id, /share/:token and PWA banner not exercised
