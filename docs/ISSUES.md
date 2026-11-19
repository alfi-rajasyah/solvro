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

### ISS-008 · P3 · Rate limiter is in-process only

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** createRateLimiter in backend/src/http/rateLimit.ts
- **Problem:** Counters live in memory per backend instance and reset on restart, so with more than one instance the effective limit multiplies.
- **Why deferred / fix direction:** Fine for the single-instance deployment; needs a shared store if the backend is ever scaled out.
- **Source:** snapshot line 2285, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

### ISS-009 · P3 · Secrets at rest: no AAD, no key rotation

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-19 @ `bfae8f7`
- **Where:** seal/open in backend/src/lib/secretBox.ts
- **Problem:** No additional data binds a sealed value to its column, and rotating SECRETS_KEY makes every sealed value unreadable until re-entered. Both need DB write access to exploit. The tag-length half was fixed on 2026-11-19 (16-byte tags required).
- **Why deferred / fix direction:** Bind AAD per column and add a key id for rotation; both need a read-old/write-new migration of stored secrets.
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

### ISS-023 · P3 · Activity feed orders by id while the index is (project_id, created_at desc)

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** activity list query in backend/src/lib/activity.ts (line ~278); ActivityEvent indexes in backend/prisma/schema.prisma (line ~360)
- **Problem:** Ordering by id does not match the created_at index; measured under 1 ms at 200k rows so no action needed now.
- **Why deferred / fix direction:** Add a (project_id, id desc) index only if feed latency ever matters (trigger: slow feed query at larger row counts).
- **Source:** snapshot line 2278, section "Collaboration & sharing — activity log, notifications, @mentions — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Backend/API

### ISS-031 · P3 · Offboarding a TAM with more than 500 projects is refused

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** offboardSchema in backend/src/routes/admin.ts (line ~291); project loop in backend/src/lib/offboarding.ts
- **Problem:** The project list is capped at 500 because the per-project writes (activity events, notifications) are heavy and share the 30 s transaction timeout.
- **Why deferred / fix direction:** Needs a measurement first: time a large handover, batch per-project writes, then raise the cap.
- **Source:** snapshot line 293, section "Tech debt / follow-ups from recent work"

### ISS-033 · P3 · Three narrow task selects omit isCriticalPath

- **Type:** watch · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** task selects in backend/src/routes/dailyReview.ts (~237), routes/search.ts (~58), lib/portfolio.ts (~34)
- **Problem:** Daily Review, global search and the portfolio roll-up select tasks without isCriticalPath, so the mark cannot be shown there.
- **Why deferred / fix direction:** Not needed today; widen the three selects only if the mark is ever surfaced on those surfaces.
- **Source:** snapshot line 1717, section "Critical Path mark — deferred findings (2026-09-02)"

### ISS-036 · P3 · CORS config has no exposedHeaders (X-Total-Count)

- **Type:** watch · **Found:** 2026-09-29 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** cors() in backend/src/app.ts (line ~62)
- **Problem:** Cross-origin callers cannot read X-Total-Count; the same-origin /api proxy is unaffected.
- **Why deferred / fix direction:** Add exposedHeaders: ['X-Total-Count'] only if the API is ever called cross-origin.
- **Source:** snapshot line 2256, section "Professional UI pass — deferred findings (2026-09-29, ported 2026-10-05)"

## Open — Frontend UI

### ISS-045 · P3 · Section-color parity gap on non-Gantt surfaces (no fallback resolver)

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** section.color uses in ProjectList.tsx (line ~727), Executive.tsx (~329), TaskPanel.tsx (~728)
- **Problem:** Uncustomized sections render vivid presets on the Gantt but legacy slate #94a3b8 in the List tab, Executive roll-up chips and the task-panel dot.
- **Why deferred / fix direction:** Export a shared resolver from lib/gantt/palette.ts or centralize the fallback server-side in the Section query.
- **Source:** snapshot line 383, section "Tech debt / follow-ups from recent work"

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

### ISS-059 · P3 · CriticalPathMark chip padding coupled to Chip's DOM shape

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** CriticalPathMark in frontend/src/components/CriticalPathMark.tsx (line ~56)
- **Problem:** The compact variant reaches into Chip's root span via `[&>span]:px-1.5`; padding breaks silently if Chip gains a wrapper element.
- **Why deferred / fix direction:** If Chip's markup changes, grep `[&>span]:px-1.5` and move the override to the new root.
- **Source:** snapshot line 1709, section "Critical Path mark — deferred findings (2026-09-02)"

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

### ISS-068 · P3 · Filters popover keeps stealing focus after a filter is chosen

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** Filters popover (vendored filters component) on /tasks; workaround in e2e/tests/task-conflict.spec.ts (openEditForm, line ~326)
- **Problem:** After picking a filter and pressing Escape, the popover's focus manager pulls focus back into its search input for a short time, so quick typing into a task form can land in the wrong field.
- **Why deferred / fix direction:** Not reproduced in code review; investigate the popover close/focus-return path if users report it.
- **Source:** snapshot line 2272, section "Collaboration & sharing — stale-edit warning — deferred findings (2026-09-30, ported 2026-10-05)"

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

### ISS-193 · P3 · The icon stylesheet now loads after the app stylesheet

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `be6a448`
- **Where:** `@import url(...Material+Symbols...)` in frontend/src/index.css (line ~8)
- **Problem:** Moving the icon stylesheet from a `<link>` in index.html to a CSS `@import` chains the requests (app CSS, then the Google CSS, then the font) and holds the app stylesheet on a third-party fetch on a first visit (antislop R-40; not measured). Repeat visits hit the Workbox cache.
- **Why deferred / fix direction:** Measure first. If it matters, load the font CSS with a `<link>` again and keep the class rules in `@layer base` (they hold without the layer).

### ISS-200 · P3 · Vendored select trigger changes its border on focus

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `8fd10ee`
- **Where:** SelectTrigger classes in frontend/src/components/ui/select.tsx (line ~59); also ui/input.tsx and ui/textarea.tsx
- **Problem:** `focus-visible:border-primary` breaks DESIGN.md §4's reduced focus form (border never changes on focus). Daily Review ProjectCard.tsx (~247) tries to override it and does not.
- **Why deferred / fix direction:** Predates this work; the ring stays visible. Drop the border change from the vendored classes, keep the primary ring, and re-check every consumer.

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

### ISS-090 · P3 · Dark primary on dark surface-container-high is 4.4986:1

- **Type:** decision · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** dark tokens in frontend/src/index.css (lines ~251, ~259)
- **Problem:** Dark brand green falls 0.0014 short of 4.5:1 on hovered rows and tinted cards. Question: may the brand green be adjusted, or is the gap accepted?
- **Why deferred / fix direction:** Brand value deliberately untouched; needs a user ruling.
- **Source:** snapshot line 2420, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

## Open — Gantt

### ISS-094 · P3 · Gantt tree pane narrowed below 356px clips fixed columns (accepted)

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** TREE_FIXED_COLUMNS_WIDTH / TREE_NAME_COLUMN_MIN_WIDTH in frontend/src/components/gantt-v2/SolvroGantt.tsx (line ~244)
- **Problem:** Deliberately narrowing the tree pane below 356px (256 fixed columns + 100 name floor) clips the fixed columns; the row scrolls horizontally.
- **Why deferred / fix direction:** Accepted behavior, no fix planned; revisit only if users report it.
- **Source:** snapshot line 31, section "Known bugs / inconsistencies"

### ISS-096 · P3 · #94a3b8 section-color sentinel duplicated between schema and frontend

- **Type:** debt · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** DEFAULT_SECTION_COLOR in frontend/src/lib/gantt/palette.ts (line ~33); Section.color default in backend/prisma/schema.prisma (line ~561)
- **Problem:** The frontend constants are now one, but the Prisma default must still match it byte-for-byte or legacy uncustomized sections stop being recognized as unset and render the new default.
- **Why deferred / fix direction:** Narrowed to frontend/backend duplication. Fix: migrate to an isCustom boolean on Section or share the constant via an API field.
- **Source:** snapshot line 392, section "Tech debt / follow-ups from recent work"

### ISS-099 · P3 · Per-bar ResizeObserver in SolvroBar

- **Type:** watch · **Found:** 2026-07-25 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** useLabelFits in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~105)
- **Problem:** One ResizeObserver per rendered bar; fine at current scale.
- **Why deferred / fix direction:** Trigger: a project rendering low hundreds of bars at once. Then share a single observer.
- **Source:** snapshot line 519, section "Plan B Task 9 deferred findings — ReUI Gantt swap (2026-07-25)"

### ISS-105 · P3 · Dark-theme Gantt bar ring contrast for the Critical Path mark

- **Type:** decision · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** critical-path ring in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~328)
- **Problem:** Question for the user: keep `chip-violet-text` (near-white `#ddd6fe` in dark mode, close to the selection outline) or use a fixed violet in both themes for the Gantt ring only?
- **Why deferred / fix direction:** Awaiting the user's call; option (b) mirrors CRITICAL_PATH_HEX used by the exports.
- **Source:** snapshot line 1738, section "Critical Path mark — deferred findings (2026-09-02)"

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

### ISS-202 · P3 · Unmapping an iTop org during a running sync can re-attach its tickets

- **Type:** bug · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `8fd10ee`
- **Where:** setCustomerOrgMapping (clears lastFullSyncAt only when a mapping is set) and the sync's orgIdToCustomerId snapshot in backend/src/lib/itop/sync.ts
- **Problem:** A running sync can set customerId again on tickets just detached from an unmapped customer. The next sync corrects them; no ticket moves to a wrong customer.
- **Why deferred / fix direction:** Predates this work and self-heals. Apply the same updatedAt compare-and-set to the ticket writes, or re-read the mapping per page.

## Open — Exports & sharing

### ISS-137 · P3 · Gantt Excel/PDF downloads blocked by Chromium on http prod origin

- **Type:** watch · **Found:** before 2026-07-24 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** deployment origin (http://solvro.elitery.local), download helpers in frontend/src/lib/gantt/exportExcel.ts and exportPdf.ts
- **Problem:** Chromium-family browsers show 'blocked this download' for files from a non-secure origin; the user can keep the file from the download overflow menu, so it is friction not data loss.
- **Why deferred / fix direction:** Not fixable by changing format. Options: reach app via localhost forward/reverse proxy, HTTPS with internal CA (declined), or PDF View -> Save as PDF. Last observed 2026-07-31.
- **Source:** snapshot line 70, section "Known bugs / inconsistencies"; merged duplicates at snapshot lines 77, 86, 92

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

## Open — Tests & CI

### ISS-145 · P2 · e2e drag-reorder first-attempt flakes (list-dnd/kanban-dnd/gantt-parity)

- **Type:** watch · **Found:** 2026-07-28 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** list-dnd.spec.ts, kanban-dnd.spec.ts, gantt-parity.spec.ts
- **Problem:** Four-case first-attempt flake class absorbed by retries: 1; likely much reduced by the per-file seededProject change.
- **Why deferred / fix direction:** Trigger: a fifth case joins or any case fails through its retry. Re-count flakes over the next CI runs.
- **Source:** snapshot line 869, section "ReUI DateField swap — deferred findings (2026-07-28)"; merged duplicates at snapshot lines 518

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

### ISS-154 · P3 · search.spec.ts polish and listener-ready guard

- **Type:** debt · **Found:** 2026-07-27 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/search.spec.ts (lines ~31, ~85, ~97, ~75)
- **Problem:** Four minor spec issues, the main one a missing listener-ready guard behind a flake seen once under CI load.
- **Why deferred / fix direction:** Assert the TopBar trigger is visible before pressing the shortcut; check res.ok; anchor the regex; fix the comment pointer.
- **Source:** snapshot line 759, section "Global search & ⌘K command palette — deferred findings (2026-07-27)"

### ISS-156 · P3 · filters-duplicate-chip e2e spec is an invariant net, not a discriminating test

- **Type:** watch · **Found:** 2026-08-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** e2e/tests/filters-duplicate-chip.spec.ts (header comment)
- **Problem:** The spec cannot reproduce the upstream Base UI double-fire; it only asserts no more than one chip per field survives.
- **Why deferred / fix direction:** Accept as is unless the upstream race becomes reproducible.
- **Source:** snapshot line 1403, section "Issues Sweep #1 — residuals (2026-08-02)"

### ISS-160 · P3 · Three pre-existing flaky e2e tests retried clean (gantt-parity, kanban-dnd)

- **Type:** watch · **Found:** 2026-09-02 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** gantt-parity.spec.ts connector-hover case (c); kanban-dnd.spec.ts R3 cross-view parity and mobile touch-reorder (lines ~1073, ~1110-1200)
- **Problem:** Three e2e tests passed only on retry in one gate run; the mobile touch-reorder depends on the seeded project's task count staying contiguous.
- **Why deferred / fix direction:** No action until one fails consistently; then tighten the wait (case c) or fixture isolation (the other two).
- **Source:** snapshot line 1698, section "Critical Path mark — deferred findings (2026-09-02)"; merged duplicates at snapshot lines 2253

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

## Open — Dev env & ops

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

### ISS-177 · P3 · CI stack could not be built locally (disk space)

- **Type:** watch · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** ci/docker-compose.ci.yml; e2e/tests/pwa.spec.ts; e2e/tests/security-headers.spec.ts
- **Problem:** Those two specs fail against a vite dev server and were not run locally.
- **Why deferred / fix direction:** Rely on CI or free disk space.
- **Source:** snapshot line 2410, section "Project lifecycle and handover — deferred findings (2026-11-10)"

### ISS-201 · P3 · Frontend lint dev tools add moderate audit advisories

- **Type:** watch · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `07bd7af`
- **Where:** `minimatch` under eslint and typescript-eslint in frontend/package-lock.json
- **Problem:** The ESLint packages add 7 moderate advisories (ReDoS in `minimatch`), dev-only; total went from 24 to 31.
- **Why deferred / fix direction:** Dev-only, not shipped. Trigger: a high advisory, or an upstream release that fixes it; then bump in the container.

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
