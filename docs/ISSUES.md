# Known Issues

Open issues, sorted by area and then by severity. Each issue has an ID (`ISS-NNN`) that never changes and is never reused. Code comments and plans cite an issue by its ID.

Last full triage: 2026-11-20 @ `cdac38f`. The file before the restructure is kept verbatim at `docs/archive/ISSUES-2026-11-18-phase-log.md`; the mapping from every old entry to its ID, or to the reason it closed, is the ledger in `docs/archive/plans/issues-restructure.md`.

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

### ISS-005 · P2 · Block task comments for STAKEHOLDER and SA; built-in roles stay admin-editable

- **Type:** debt · **Found:** 2026-10-22 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** task comment routes in backend/src/routes/tasks.ts; built-in roles in backend/prisma/seed.ts
- **Problem:** Two product questions are unanswered: may STAKEHOLDER (project:read) and the SA role (pipeline:view) post task comments, and should built-in roles stay admin-editable (policy A) or become code-owned and read-only in the Roles UI (policy B).
- **Why deferred / fix direction:** User decision 2026-11-20. Comment routes need task:write (or project:write); STAKEHOLDER (project:read) and SA (pipeline:view) are refused. Built-in roles stay editable (policy A), no change there.
- **Source:** snapshot line 2368, section "Application review 2026-10-22 — remaining open items"

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

### ISS-011 · P3 · Rate limits and client address depend on the proxy topology

- **Type:** watch · **Found:** 2026-09-30 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** createRateLimiter in backend/src/http/rateLimit.ts; assertSignInAllowed in routes/auth.ts (line ~56); TRUST_PROXY default written by setup.sh (docs/CONFIGURATION.md §2.13)
- **Problem:** Counters are in memory per instance. Behind a public CDN with a hop count that misses it, all users share one address bucket (50 failures block sign-in for 15 min). The private-address TRUST_PROXY default lets a LAN/VPN client forge its address for the guest-link bucket and logged clientIp.
- **Why deferred / fix direction:** Fine for the single-instance tunnel to nginx to backend deploy. Trigger: scale-out or a public CDN. Then add a shared store, a per-account fallback, and CIDR trust. Merged ISS-008, 173.

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

### ISS-054 · P3 · Move Overview and Executive KPI stat cards into the vendored Frame

- **Type:** debt · **Found:** 2026-07-31 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** KPI stat cards in pages/Overview.tsx and pages/Executive.tsx
- **Problem:** Whether the KPI stat cards should adopt the vendored Frame was never decided. Question for the user: adopt Frame for stat cards, or close this as not needed?
- **Why deferred / fix direction:** User decision 2026-11-20. Migrate both pages' stat cards to Frame. Visible change: Delivery Gate.
- **Source:** snapshot line 1161, section "ReUI Presentation Set — deferred findings (2026-07-31)"

### ISS-055 · P3 · Pointer-dependent initial submenu highlight

- **Type:** watch · **Found:** 2026-07-31 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** submenu highlight in frontend/src/components/reui/filters.tsx (lines ~1496, 1521)
- **Problem:** Whichever row lands under the cursor when a submenu opens wins the highlight, so a blind Enter can pick another row. Upstream hover-follows-highlight behavior.
- **Why deferred / fix direction:** Not worth a vendored patch; revisit only if reported.
- **Source:** snapshot line 1231, section "ReUI Filters phase — deferred findings (2026-07-31)"

### ISS-056 · P3 · Filter toolbar rows: align text to the uniform 12-13px density

- **Type:** debt · **Found:** 2026-07-31 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** filter toolbar rows in frontend/src/components/reui/filters.tsx
- **Problem:** Migrated filter rows mix 15px, 13px and 12px text where the old dropdowns used a uniform 12-13px. Question for the user: match the old uniform density or keep the mixed scale?
- **Why deferred / fix direction:** User decision 2026-11-20. Align every migrated filter row to the old uniform 12-13px scale.
- **Source:** snapshot line 1255, section "ReUI Filters phase — deferred findings (2026-07-31)"

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

### ISS-193 · P3 · The icon stylesheet now loads after the app stylesheet

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `be6a448`
- **Where:** `@import url(...Material+Symbols...)` in frontend/src/index.css (line ~8)
- **Problem:** Moving the icon stylesheet from a `<link>` in index.html to a CSS `@import` chains the requests (app CSS, then the Google CSS, then the font) and holds the app stylesheet on a third-party fetch on a first visit (antislop R-40; not measured). Repeat visits hit the Workbox cache.
- **Why deferred / fix direction:** Measure first. If it matters, load the font CSS with a `<link>` again and keep the class rules in `@layer base` (they hold without the layer).

### ISS-200 · P3 · Vendored select trigger changes its border on focus

- **Type:** debt · **Found:** 2026-11-19 · **Verified:** 2026-11-19 @ `8fd10ee`
- **Where:** SelectTrigger classes in frontend/src/components/ui/select.tsx (line ~59); also ui/input.tsx, ui/textarea.tsx and the other vendored ui/* and reui/* files with the fuller focus form (merged ISS-087)
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

### ISS-086 · P3 · Badge solid-tone variants not for use until chip rebase

- **Type:** debt · **Found:** 2026-08-01 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** tone variants in frontend/src/components/reui/badge.tsx (lines ~31-52)
- **Problem:** The solid tone variants render white on tint at about 1.2-2.8:1 contrast. They have no consumers and are constrained by an in-file comment.
- **Why deferred / fix direction:** Fix contrast or delete the variants before anyone wires one up; chips stay bespoke per standing decision.
- **Source:** snapshot line 1272, section "ReUI Data Grid phase — deferred findings (2026-08-01)"

### ISS-090 · P3 · Dark primary contrast 4.4986:1: nudge the dark token to 4.5:1

- **Type:** debt · **Found:** 2026-11-10 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** dark tokens in frontend/src/index.css (lines ~251, ~259)
- **Problem:** Dark brand green falls 0.0014 short of 4.5:1 on hovered rows and tinted cards. Question: may the brand green be adjusted, or is the gap accepted?
- **Why deferred / fix direction:** User decision 2026-11-20. Lighten the dark primary token by the minimum that reaches 4.5:1; sync docs/DESIGN.md.
- **Source:** snapshot line 2420, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

## Open — Gantt

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

### ISS-105 · P3 · Gantt Critical Path ring: fixed violet in both themes

- **Type:** debt · **Found:** 2026-09-02 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** critical-path ring in frontend/src/components/gantt-v2/SolvroBar.tsx (line ~328)
- **Problem:** Question for the user: keep `chip-violet-text` (near-white `#ddd6fe` in dark mode, close to the selection outline) or use a fixed violet in both themes for the Gantt ring only?
- **Why deferred / fix direction:** User decision 2026-11-20. Use CRITICAL_PATH_HEX (the export colour) for the bar ring in both themes; chips keep chip-violet-text.
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

### ISS-120 · P2 · iTop go-live checks: TimeSpent, User class, lifecycle stimuli

- **Type:** watch · **Found:** 2026-09-24 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** ITOP_TIME_SPENT_* in backend/src/lib/itop/types.ts; syncTimeEntries / upsertTimeEntry in lib/itop/sync.ts; user matching in routes/itopUser.ts; TRANSITIONS in frontend/src/components/itop/board/dropMapper.ts
- **Problem:** Six assumptions are unverified on the real install: TimeSpent duration in seconds (wrong by 60x if minutes); the TimeSpent.ticket_ref name and writability; the application token cannot read User, so User.itopUserId stays unset and time logging refuses; the drop graph assumes default stimuli; Time Tracking is not bundled with iTop Community; blank-duration entries are skipped every tick.
- **Why deferred / fix direction:** Blocks go-live, not code. Install Time Tracking from iTop Hub, run the TimeSpent probes, check User read rights and the state machine, then flip the constants or adjust the graph. Merged ISS-121, 122, 125, 127, 135.

### ISS-126 · P3 · Mobile iTop board is a single stacked column with touch drag

- **Type:** watch · **Found:** 2026-10-04 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** KanbanBoard grid in frontend/src/components/itop/board/TicketBoard.tsx (line ~263)
- **Problem:** Below md the five columns stack vertically with touch drag; long scroll to a distant column and touch precision are unevaluated.
- **Why deferred / fix direction:** Evaluate on a real phone before treating it as the phone-usable Board.
- **Source:** snapshot line 2101, section "iTop integration (board, new tickets) — deferred findings (ported 2026-10-04)"

### ISS-134 · P3 · Deployment note: itopUserId matching needs REST read rights on iTop's User class

- **Type:** watch · **Found:** 2026-10-05 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** POST /itop/tickets/:id/time error path in backend/src/routes/itop.ts (line ~1303)
- **Problem:** Without read rights on User, time logging fails with 'Your iTop user account is not linked yet'. A setup requirement, not a code bug.
- **Why deferred / fix direction:** Document the required profile rights in docs/CONFIGURATION.md; otherwise nothing to fix in code.
- **Source:** snapshot line 2303, section "Customer-edition port — deferred findings (2026-10-05)"

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

### ISS-140 · P3 · Gantt Excel export: add an iTop ticket column

- **Type:** debt · **Found:** 2026-10-04 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** buildTasksSheet in frontend/src/lib/gantt/exportExcel.ts (line ~87)
- **Problem:** Question for the user: should the Gantt Excel export show a task's pinned itopTicketRef? It needs the field threaded through the Gantt row adapter; the ref is customer-safe but exports are customer-facing.
- **Why deferred / fix direction:** User decision 2026-11-20. Thread t.itopTicketRef onto Row and add the column in buildTasksSheet (spine: Gantt exports).
- **Source:** snapshot line 2006, section "iTop integration (webhook, task ticket links) — deferred findings (ported 2026-10-04)"

### ISS-141 · P3 · Guest page still loads Google Fonts from Google

- **Type:** debt · **Found:** 2026-09-30 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** frontend/index.html (lines 13-20), served at /share/<token> via frontend/nginx.conf
- **Problem:** A guest opening a share link makes their browser contact Google; Referrer-Policy: no-referrer keeps the token out of those requests.
- **Why deferred / fix direction:** Self-host the fonts; deferred because it changes the whole app shell.
- **Source:** snapshot line 2283, section "Collaboration & sharing — guest links — deferred findings (2026-09-30, ported 2026-10-05)"

## Open — Tests & CI

### ISS-145 · P2 · Flaky e2e drag specs and backend concurrency test

- **Type:** watch · **Found:** 2026-07-28 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** list-dnd.spec.ts, kanban-dnd.spec.ts (R3 parity, mobile touch-reorder), gantt-parity.spec.ts (connector-hover case c); backend/test/taskReorderConcurrency.test.ts (line ~114)
- **Problem:** First-attempt flakes absorbed by retries; one 30 s backend timeout in a loaded gates run.
- **Why deferred / fix direction:** Trigger: a case fails through its retry, or a new case joins. Then tighten the wait or fixture isolation; for the backend test capture pg_locks joined to pg_stat_activity during the stall. Merged ISS-160, 167.

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

### ISS-168 · P3 · Verification gap: /pipeline/:id, /share/:token and PWA banner not exercised

- **Type:** watch · **Found:** 2026-11-10 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** /pipeline/:id, /share/:token, InstallBanner
- **Problem:** The audit's live run skipped these three surfaces.
- **Why deferred / fix direction:** Check them in a browser at 375px in both themes.
- **Source:** snapshot line 2425, section "Antislop audit 001 fixes — deferred findings (2026-11-10)"

## Open — Dev env & ops

### ISS-171 · P3 · Delete backend/scripts/import-velora.ts; Velora stack retired

- **Type:** debt · **Found:** 2026-08-15 · **Verified:** 2026-11-20 @ `cdac38f`
- **Where:** external /opt/velora deploy (not in repo); backend/scripts/import-velora.ts still present
- **Problem:** The remaining cutover step is retiring the standalone Velora production stack, which cannot be verified from code.
- **Why deferred / fix direction:** User decision 2026-11-20. The standalone Velora stack is retired (user confirmation 2026-11-20). Delete the one-time import script and any package.json script entry.
- **Source:** snapshot line 1539, section "Pipeline native port — accepted risks & deferred items (2026-08-15)"

### ISS-175 · P3 · Bundle budget headroom is about 43 kB

- **Type:** watch · **Found:** 2026-10-22 · **Verified:** 2026-11-18 @ `4bb01a4`
- **Where:** LIMIT_BYTES in frontend/scripts/check-bundle-size.mjs (line ~12)
- **Problem:** The entry chunk sits close to the 1 MB budget enforced by check:bundle-size; Overview, Projects and ProjectDetail are still eager.
- **Why deferred / fix direction:** Watch trigger: the budget check fails. Then lazy-load more pages.
- **Source:** snapshot line 2384, section "Application review 2026-10-22 — remaining open items"

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
