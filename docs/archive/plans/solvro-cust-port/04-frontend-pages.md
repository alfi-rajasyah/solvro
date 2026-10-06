# Frontend pages port plan — CUST → INTERNAL (`frontend/src/pages/**`)

Scope: `frontend/src/pages/*.tsx` and `frontend/src/pages/views/*.tsx`.
INTERNAL = `/home/solvro-internal/solvro` (HEAD `154b42f`, branch `develop`).
CUST = `/home/solvro-internal/solvro-cust` (HEAD `127f316`).
Method: plain `diff INTERNAL CUST` per file, every hunk walked. Line ranges below are **CUST line numbers** unless prefixed `INT`.
"after CUST n" = a pure deletion in CUST located after CUST line n (the INTERNAL lines are given as `INT a-b`).

---

## 0. Headline findings (read first)

1. **The 17 shared pages in INTERNAL are byte-identical to the fork base.** `git diff --stat 9f5fc20 HEAD -- frontend/src/pages` in INTERNAL touches only the 6 Pipeline pages (`OpportunityDetail.tsx`, `Pipeline.tsx`, `views/PipelineClosed.tsx` (new), `views/PipelineList.tsx`, `views/PipelineQuarter.tsx`, `views/PipelineSwimlane.tsx`; commits `957e83e`, `20252e9`). CUST's changelog says it was copied "as of commit 9f5fc20". So **every hunk in the 17 diffs is a CUST-side change** — there is no INTERNAL-side drift to reconcile in these files. This makes "take the CUST file, re-add the PIPELINE/SA hunks" safe for every page.
2. **Only 6 of the 17 pages contain PIPELINE-REMOVAL / SA-REMOVAL hunks**: `Admin.tsx`, `Executive.tsx`, `Overview.tsx`, `Projects.tsx`, `ProjectDetail.tsx`, `views/ProjectOverview.tsx`. `CustomerDetail.tsx` has one SA-REMOVAL (the project grid's SA column) but the grid moved into a new component, so the re-add lands in `components/customer/AccountOverview.tsx`, not in the page. The other 10 pages can be taken from CUST verbatim.
3. **No page can be ported alone.** CUST pages import 25 modules that do not exist in INTERNAL and ~20 symbols missing from existing INTERNAL modules (section 1). Pages must land after (or with) their lib/component/hook dependencies.
4. **Guardrails hold in CUST**: `Tasks.tsx` and `<Route path="tasks">` exist (CUST `App.tsx:71`); `/tasks` is still absent from the sidebar nav (`lib/navCommands.ts` has no `/tasks` entry); the Timeline tab and route exist (CUST `ProjectDetail.tsx:51`, `App.tsx:63`). No npm Gantt/board/dnd library is imported by any CUST page.
5. **`WorkLogs.tsx` standing decision is affected.** INTERNAL CLAUDE.md says "`WorkLogs.tsx`: placeholder for a future iTop API integration; don't wire it up until that spec exists." CUST built that iTop integration and replaced the page with `Utilization.tsx` (`/work-logs` redirects to `/utilization`). Porting ITOP + UTIL retires `WorkLogs.tsx` — this needs an explicit user decision and a CLAUDE.md standing-decision edit (user-owned block).
6. **INTERNAL-only Pipeline pages are untouched by the UIPASS** and will look inconsistent after the port (uppercase/tracking-wider buttons, 10/11px text, mono dates). Counts in section 5.

---

## 1. Dependency matrix (what the CUST pages need that INTERNAL lacks)

### 1.1 Modules missing in INTERNAL entirely (verified by file-existence check)

| Module (under `frontend/src/`) | Tag | Imported by CUST pages |
|---|---|---|
| `lib/formatDate` (`fmtDay`, `fmtDayLong`, `fmtDayFull`, `fmtRange`, `fmtDateTime`, `fmtDue`, `fmtAgo`, `fmtTime`) | UIPASS | Tasks, WeeklySync, Admin, Overview, Projects, DailyReview, Executive, Settings, Utilization, PublicShare, views/ProjectList, views/ProjectEpics, views/ProjectOverview, views/ProjectTimeline |
| `lib/labels` (`TASK_STATUS_LABEL`, `taskStatusOptions`, `priorityOptions`, `RISK_CATEGORY_LABEL`, `RISK_STATUS_LABEL`, `WEEKLY_HEALTH_LABEL`, `WEEKLY_STATUS_LABEL`, `PHASE_STATUS_LABEL`, `MILESTONE_UPCOMING_LABEL`) | UIPASS | Tasks, Customers, WeeklySync, PublicShare, views/ProjectTimeline, views/ProjectRisks, views/ProjectList |
| `components/skeletons` (`TableSkeleton`, `CardGridSkeleton`, `ProjectPageSkeleton`) | SKELETON | ProjectDetail, Customers, Settings, views/ProjectServices, views/ProjectEpics |
| `hooks/useNewParam` | PALETTE | ProjectDetail, Customers, Projects |
| `lib/ownerAccess` (`canOwnProject`, `canOwnCustomer`, `saveErrorMessage`) | MEMBERS | ProjectDetail, Customers, CustomerDetail |
| `lib/safeRedirect` | SIGNIN | Login |
| `components/CopyLinkButton` | COPYLINK | ProjectDetail |
| `components/ProjectHeaderFacts` | HEALTH | ProjectDetail |
| `components/ProjectMembers` (`ProjectMembersButton`) | MEMBERS | ProjectDetail |
| `components/ProjectShare` (`ProjectShareButton`) | SHARE | ProjectDetail |
| `components/ProjectActivity` | ACTIVITY | views/ProjectOverview |
| `components/EpicChip`, `components/EpicPanel` | EPIC | views/ProjectList, views/ProjectEpics |
| `components/customer/AccountHeader`, `components/customer/AccountOverview` | CUSTOMERS | CustomerDetail |
| `components/itop/TicketPanel`, `components/itop/TicketsTab` | ITOP | CustomerDetail |
| `components/admin/ItopTab` | ITOP | Admin |
| `components/utilization/UtilizationTable`, `UtilizationTiles` | UTIL | Utilization |
| `lib/dragActivity` (`useDragActivityGuard`) | LIVE | views/ProjectList |
| `lib/projectMembers` (`ASSIGN_ADDS_MEMBER_NOTICE`), `lib/useAssigneeMembership` | MEMBERS | views/ProjectList |
| `lib/helpContent` (`filterHelpTopics`, `HelpTopic`) | HELP | Help |
| `lib/shareLinks` (`PHASE_STATUS_TONE`, `phaseStatusOf`, `timelineLayout`) | SHARE | PublicShare |

### 1.2 Symbols missing from modules that exist in INTERNAL (verified by grep)

| INTERNAL file | Missing symbol(s) | Tag | Needed by |
|---|---|---|---|
| `components/StatusChip.tsx` | `TASK_STATUS_TONE_CLASS` | UIPASS | views/ProjectList |
| `components/ConfirmModal.tsx` | `confirmTone="danger"` (INTERNAL `Tone = "primary" \| "warning"`) | UIPASS | ProjectDetail, Customers, CustomerDetail, Admin, views/ProjectList, views/ProjectRisks, views/ProjectEpics |
| `components/ProjectFormModal.tsx` | prop `canChangeOwnership` | MEMBERS | ProjectDetail |
| `components/CustomerFormModal.tsx` | prop `canChangeOwner` | MEMBERS | Customers, CustomerDetail |
| `components/portfolio/PortfolioCalendar.tsx` | (reverse) CUST **removed** the `fmtDate` export that INTERNAL `Executive.tsx:5` imports | UIPASS | Executive |
| `components/daily-review/*` (the customer card rendered at `DailyReview.tsx`) | prop `itop` | ITOP | DailyReview |
| `lib/auth.tsx` | `userVerified` on `useAuth()` | SIGNIN | Utilization |
| `lib/queries.ts` | `useTasksWithTotal` (TASKVIEWS); `useProjectEpics`, `useCreateEpic`, `useUpdateEpic`, `useDeleteEpic`, `type Epic`, `Task.epicId` (EPIC); `type ProjectHealth`, `ProjectSummary.health`, `CustomerSummary.health`, `OverviewData.workCounts` (HEALTH/OVERVIEW/CUSTOMERS); `useItopDaily`, `DailyItopCustomer`, `useItopStatus`, `useCustomerTickets`, `useMyItopToken`, `useSaveMyItopToken`, `useRemoveMyItopToken`, `useRequestItopRefresh` (ITOP); `useUtilization`, `UtilizationScope` (UTIL); `usePublicShare`, `PublicShare` (SHARE); `useCustomerNotes` (CUSTOMERS, used inside AccountOverview) | various | many |
| `index.css` + `lib/utils.ts` | `text-meta` type role and its tailwind-merge registration | UIPASS | nearly every page (class name `text-meta`) |

Present in INTERNAL and compatible (verified): `ui/dropdown-menu.tsx` (`positionerClassName`, `variant="destructive"`), `components/Tabs.tsx`, `components/BrandMark.tsx`, `components/EmptyState.tsx`, `lib/isoWeek.ts` (`parseWeekKey`, `weekKeyOf`, `shiftWeek`, `formatWeekRange`), `lib/dailyReviewStats.ts` (`weekNumberLabel`), `lib/gantt/palette.ts` (`SECTION_COLOR_PRESETS`), `components/StatusChip.tsx` (`Chip`, `TaskStatusChip`, `ProjectStatusChip`), `lib/tableSort.ts`, vendored `reui/data-grid/*`, `ui/skeleton.tsx`.

Unverified: whether each new hook's backend endpoint exists in INTERNAL (backend scope, not checked here).

---

## 2. Per-page analysis — differing pages

Legend for (e): **TAKE-CUST+N** = copy the CUST file, then re-add N INTERNAL hunks. **APPLY-M** = apply M CUST hunks onto the INTERNAL file.

### 2.1 `pages/Login.tsx` (INT 404 lines → CUST 407)

(a) User-visible: after signing in from a deep link the user lands on the exact page including `?query` and `#hash`; only in-app paths are accepted as the destination. Submit button and micro-labels are sentence case / no letter-spacing.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 11 | SIGNIN | `import { safeRedirectPath } from "@/lib/safeRedirect"` |
| 44-46 | SIGNIN | `from = safeRedirectPath(location.state?.from)` (was `?? "/overview"`), shared by password, Google and already-signed-in paths |
| 254 | UIPASS | `text-[11px] uppercase tracking-wider` → `text-label-caps uppercase` |
| 349, 369 | UIPASS | drop `tracking-wider` on field labels |
| 401 | UIPASS | submit button `font-bold uppercase tracking-wider` → `font-semibold` |

(c) PIPELINE/SA hunks: none.
(d) New imports: `@/lib/safeRedirect`.
(e) **TAKE-CUST+0.** Depends on `lib/safeRedirect.ts` and (for the full SIGNIN feature) CUST `components/AuthGuard.tsx` keeping query+hash.

### 2.2 `pages/WeeklySync.tsx` (678 → 673)

(a) "Saved …" stamp on the mid-week table uses the shared day-first 24h format; week range is body font, not mono; health pill text size via `text-meta`. Health words are unchanged (Green/Amber/Red in both — INTERNAL `lib/weeklySyncTable.ts:39 HEALTH_LABEL`, CUST re-exports it from `lib/labels.ts:78`).

(b) Hunks — all UIPASS
| CUST lines | What |
|---|---|
| 12, 14 | imports `fmtDateTime`, `WEEKLY_HEALTH_LABEL` |
| after 21 (INT 21) | drops `HEALTH_LABEL` from the `@/lib/weeklySyncTable` import |
| after 29 (INT 30-35) | removes local `MIDWEEK_SAVED_FMT` |
| 218, 221 | week header: `text-label-caps`, no `font-mono` |
| 411 | table section header class |
| 555-556, 649-650 | health pill `text-meta` + `WEEKLY_HEALTH_LABEL[health]` |
| 568 | `Saved ${fmtDateTime(update.midweekSavedAt)}` |

(c) none. (d) `@/lib/formatDate`, `@/lib/labels`. (e) **TAKE-CUST+0.**

### 2.3 `pages/DailyReview.tsx` (175 → 187)

(a) Each customer card that is mapped to an iTop organisation shows an "iTop today" strip (counts + 3 latest tickets). Today's date reads "Monday 28 September 2026" style; week range is body font.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 12 | UIPASS | import `fmtDayLong` |
| 14 | ITOP + UIPASS | import becomes `{ type DailyItopCustomer, useDailyReview, useItopDaily }`; local `TODAY_FMT` (INT 15-20) removed |
| 50-66 | ITOP | `useItopDaily(data?.today ?? …, { enabled: Boolean(data) })` + `itopByCustomer` map |
| 89 | UIPASS | `fmtDayLong(dateToDay(new Date()))` |
| 105, 108 | UIPASS | `text-label-caps`, drop `font-mono` |
| 158 | ITOP | `itop={itopByCustomer.get(customer.id)}` on the customer card |

(c) none. (d) `@/lib/formatDate`; `useItopDaily`, `DailyItopCustomer` from queries. (e) **TAKE-CUST+0.** If ITOP lands in a later phase than UIPASS, apply only the 4 UIPASS hunks first (the ITOP hunks are 3 self-contained additions).

### 2.4 `pages/views/ProjectTimeline.tsx` (262 → 253)

(a) Task date ranges read `22 – 28 Aug` in body font instead of mono `Aug 22 → Aug 28`; status filter buttons are sentence case with "To do / In progress / Done" instead of raw `IN PROGRESS`.

(b) Hunks — all UIPASS: 13-15 (imports; `dayToDate` dropped), 185, 187 (`fmtRange`), 233, 239 (`TASK_STATUS_LABEL[s]`), after 246 (INT 245-255 local `fmt` removed).

(c) none. (d) `@/lib/formatDate`, `@/lib/labels`. (e) **TAKE-CUST+0.** Guardrail check: CUST keeps this file and its route — the Timeline tab stays.

### 2.5 `pages/views/ProjectServices.tsx` (92 → 97)

(a) A card-grid skeleton shows while the customer's services load, instead of the mapping list flashing in.
(b) All SKELETON: 4 (import `CardGridSkeleton`), 20 (`isLoading: customerLoading`), 81-93 (conditional skeleton).
(c) none. (d) `@/components/skeletons`. (e) **TAKE-CUST+0.**

### 2.6 `pages/Executive.tsx` (355 → 334)

(a) Dates are day-first, body font; the view switch buttons are sentence case; "last updated" time is 24h. In CUST the pipeline analytics section is gone.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| after 4 (INT 5) | UIPASS | `fmtDate` no longer imported from `PortfolioCalendar` |
| after 7 (INT 9) | **PIPELINE-REMOVAL** | `PipelineAnalyticsSection` import removed |
| 10 (INT 12) | UIPASS + **PIPELINE-REMOVAL** | line replaced: `hasPermission, useAuth` import dropped, `fmtDateTime, fmtDay, fmtRange` import added |
| after 51 (INT 54) | **PIPELINE-REMOVAL** | `const { user } = useAuth()` removed |
| after 53 (INT 57-62) | **PIPELINE-REMOVAL** | `canViewPipeline` block removed |
| after 62 (INT 72), after 78 (INT 89) | **PIPELINE-REMOVAL** | two `{canViewPipeline && <PipelineAnalyticsSection />}` render sites removed |
| 100 | UIPASS | `text-meta` |
| 148-149, 171 | UIPASS | `fmtDay(p.end) \|\| "—"`, no mono |
| 220 | UIPASS | sentence-case toggle |
| 249, 303, 313 | UIPASS | `text-xs` / `text-meta` |
| 298-299 | UIPASS | `fmtRange(p.start, p.end)` |
| after 330 (INT 342-351) | UIPASS | local `fmtDateTime` removed |

(c) Keep as INTERNAL: INT 9, INT 12 (the auth import), INT 54, INT 57-62, INT 72, INT 89.
(d) `@/lib/formatDate`.
(e) **TAKE-CUST+5** (re-add: PipelineAnalyticsSection import; `hasPermission, useAuth` import; `const { user } = useAuth()`; `canViewPipeline`; the two render sites). Follow-up: `components/pipeline/PipelineAnalyticsSection.tsx` itself gets no UIPASS from CUST (unverified how much it needs).

### 2.7 `pages/views/ProjectOverview.tsx` (689 → 669)

(a) A "Recent activity" section appears at the bottom of the project Overview (one sentence per change, filter by person, load more). Dates day-first; risk score chips lose mono. In CUST the linked-deal card is gone.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| after 16 (INT 17) | **PIPELINE-REMOVAL** | `DealCard` import removed |
| 19 | ACTIVITY | import `ProjectActivity` |
| 22 | UIPASS | import `fmtDay` |
| 36 | ACTIVITY | `taskIds` memo (lets activity rows link only to tasks that still exist) |
| after 64 (INT 63-71) | **PIPELINE-REMOVAL** | `<DealCard projectId={project.id} />` and its comment removed |
| 100 | UIPASS | baseline-locked date via `fmtDay(dateToDay(new Date(project.baselineLockedAt)))` |
| 167-168 | ACTIVITY | `<ProjectActivity projectId tam taskIds />` |
| 176, 318, 324, 440 | UIPASS | drop `tracking-wider` / `font-mono`, `text-label-caps` |
| 371-372, 634 | UIPASS | `fmtDay(...)` replaces `fmtDateShort` |
| after 668 (INT 674-688) | UIPASS | local `fmtDate`, `fmtDateShort` removed |

(c) Keep as INTERNAL: INT 17, INT 63-71.
(d) `@/components/ProjectActivity`, `@/lib/formatDate`.
(e) **TAKE-CUST+2.** Adaptation: `ProjectActivity` receives only `tam` (`ProjectActivity.tsx:22-41` builds the person filter from TAM + members). In INTERNAL the project SA should also be offered in that filter — component-side change, flag to the components plan.

### 2.8 `pages/views/ProjectRisks.tsx` (715 → 702)

(a) Risk category/status words come from the shared label map (same words as before: External…, Open/Mitigated/Closed); the delete confirmation button is red (danger) instead of amber; score chips are body font; "Clear filters" is sentence case.

(b) All UIPASS: 23 (import labels), after 32 (INT 32-45 local `CATEGORY_LABEL`/`STATUS_LABEL` removed), 40, 150, 159, 170, 257 (`confirmTone="danger"`), 341, 349, 435, 441, 465, 467, 474, 478, 592, 601, 608, 612.

(c) none. (d) `@/lib/labels`. (e) **TAKE-CUST+0.** Needs `ConfirmModal` `danger` tone.

### 2.9 `pages/Projects.tsx` (262 → 286)

(a) Each project card's footer shows a progress bar with `NN% · done of total` (or "No tasks yet"), red "N overdue" and amber "N open risks" chips when non-zero, "Baseline locked", and the project's date range. `/projects?new=1` (from the ⌘K "New project" action) opens the create form. "New project" button is sentence case. In CUST the SA avatar on the card is gone and the subtitle no longer mentions SA.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 5 | HEALTH | import `Chip` |
| 12, 32 | PALETTE | `useNewParam("1", canCreate, () => setCreateOpen(true))` |
| 14 | HEALTH | import `fmtRange` |
| 100 | **SA-REMOVAL** (wording) | subtitle "All projects you own as a TAM, plus those you lead as an SA." → "All projects where you're the TAM, plus those for customers you own." |
| 107 | UIPASS | sentence-case button |
| after 159 (INT 157) | **SA-REMOVAL** | `saInit` removed |
| 162-168 | HEALTH | `health`, `done`, `total`, `pct`, `overdue`, `openRisks`, `hasDates` |
| 177, 192, 199 | UIPASS | `text-meta` |
| after 196 (INT 188-196) | **SA-REMOVAL** | SA avatar bubble removed from the avatar stack |
| 206-247 | HEALTH | progress + health footer replaces the task-count strip (INT 206-216) |
| after 251 (INT 221-227) | **SA-REMOVAL** | `AVATAR_PALETTE` / `avatarColor` removed (only the SA avatar used it) |

(c) Keep as INTERNAL: INT 157, INT 188-196, INT 221-227. Subtitle: do **not** take CUST's text verbatim — INTERNAL visibility (`backend/src/lib/visibility.ts:25-27`) is TAM **or SA** or customer owner; write e.g. "All projects where you're the TAM or SA, plus those for customers you own." (and mention membership once MEMBERS lands).
(d) `Chip` from `StatusChip`, `@/hooks/useNewParam`, `@/lib/formatDate`; `project.health` on `ProjectSummary`.
(e) **TAKE-CUST+3** plus the reworded subtitle. When re-adding the SA avatar, change its `text-[10px]` to `text-meta` to match the TAM avatar (CUST line 199).

### 2.10 `pages/Overview.tsx` (340 → 330)

(a) The page opens with a slim "Overview" heading and today's date (no "Welcome back, <name>"). Three linked tiles replace the four KPI tiles: **Overdue** (red when > 0, opens `/tasks?view=overdue`), **Due this week** (`/tasks?view=week`), **Open risks** (`/daily-review`). "Projects needing attention" moves above the portfolio timeline, full width, with "N overdue" and "N risks" chips per row and token-coloured left accents. "Recent notes" is a full-width panel below the timeline. In CUST the pipeline panel is gone.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| after 1 (INT 2) | **PIPELINE-REMOVAL** | `PipelineOverviewPanel` import removed |
| after 7 (INT 9) | **PIPELINE-REMOVAL** + OVERVIEW | `hasPermission, useAuth` import removed (was used by the pipeline gate and the welcome heading) |
| 9-10 | OVERVIEW/UIPASS | `dateToDay`, `fmtDayLong` |
| 13, 17 | OVERVIEW/HEALTH | `type ProjectHealth`, `useProjects` |
| after 21 (INT 21) | **PIPELINE-REMOVAL** + OVERVIEW | `const { user } = useAuth()` removed |
| 26-28 | OVERVIEW | slim header + date |
| after 39 (INT 44-50) | **PIPELINE-REMOVAL** | `{hasPermission(user, "pipeline:view") && <PipelineOverviewPanel />}` removed |
| 45-52 | OVERVIEW | `data.workCounts` + `healthById` from `useProjects()` |
| 56-83 | OVERVIEW | three linked tiles |
| 87-150 | OVERVIEW/HEALTH | "Projects needing attention" block (moved up, chips, `healthBorder`) |
| 155, 268 | UIPASS | `text-xs` / `text-meta` |
| 171-180 | OVERVIEW | Recent notes panel (comment notes `daily-review.spec.ts` depends on the heading's DOM position) |
| 191-217 | OVERVIEW | `Kpi` becomes a `<Link>` with `to`, `ariaLabel`, `error` tone; value no longer mono |
| 306-313 | OVERVIEW | loading skeleton reshaped (3 tiles) |
| after 317 (INT 317-328) | OVERVIEW | `firstNameOf` removed |
| 319-329 | OVERVIEW/UIPASS | `healthColor` hex → `healthBorder` token classes |

(c) Keep as INTERNAL: INT 2, INT 9, INT 21, INT 44-50.
(d) `@/lib/formatDate`; `useProjects`, `ProjectHealth`, `workCounts` from queries; depends on TASKVIEWS (`/tasks?view=`) for the tile links to work.
(e) **TAKE-CUST+4** (re-add PipelineOverviewPanel import, auth import, `user`, panel render after `<OverviewBody>`). Follow-up: `components/pipeline/PipelineOverviewPanel.tsx` should get the same header/typography treatment (unverified).

### 2.11 `pages/Tasks.tsx` (394 → 453) — guardrail page

**Guardrail confirmed:** CUST keeps `pages/Tasks.tsx` and `<Route path="tasks" element={<Tasks />} />` (CUST `App.tsx:71`); `/tasks` remains absent from `lib/navCommands.ts` (hidden from sidebar). Overview tiles now deep-link into it.

(a) A row of saved-view tabs — All open (default), My open, Overdue, This week, All — synced to `?view=`. The page opens on open work sorted soonest-due first (server-side `sort=due`). The "Overdue only" checkbox is gone (replaced by the Overdue view). Due cells read `Today`, `Tomorrow`, `3d late` (plain date for Done tasks) instead of `Aug 21 · OVERDUE`. "Showing N of TOTAL" appears when more tasks match than are loaded. Status/priority filter options read "In progress"/"Medium" instead of `IN PROGRESS`/`MEDIUM`. Reset also returns to the default view.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 2, 14 | TASKVIEWS | `useSearchParams`, `Tabs` imports |
| 17-21 | TASKVIEWS + UIPASS | `useAuth` (My open), `fmtDay`/`fmtDue`, `parseWeekKey`/`weekKeyOf`, `priorityOptions`/`taskStatusOptions`; `dayToDate` dropped |
| 39 | TASKVIEWS | `useTasksWithTotal` replaces `useTasks` |
| after 43 (INT 39) | UIPASS | local `PRIORITIES` removed |
| 59-94 | TASKVIEWS | `VIEWS`, `parseView`, `viewFilter` |
| after 98 (INT 59) | TASKVIEWS | `overdue` state removed |
| 100-106 | TASKVIEWS | `sorting` starts empty; `searchParams`, `view`, `user` |
| 119, 126 | UIPASS | filter options from `lib/labels` |
| 149-153, 161-174 | TASKVIEWS | `todayDay` hoist; filter merges view base with chips (Status chip overrides `open`, Assignee chip overrides My open) |
| 176-190 | TASKVIEWS | `useTasksWithTotal`, `total`, `setView` |
| 199, 249, 287-288 | UIPASS | `text-label-caps` / `text-meta`, no mono on due |
| 291 | UIPASS | `fmt(task.dueDate, task.status === "DONE")` (drops `· OVERDUE` suffix) |
| 327 | TASKVIEWS | page blurb |
| 331-334 | TASKVIEWS | `<Tabs items={VIEWS} active={view} onChange={setView} />` |
| after 345 (INT 281-289) | TASKVIEWS | "Overdue only" checkbox removed |
| 357, 359 | TASKVIEWS + UIPASS | reset → `setView(DEFAULT_VIEW)`; sentence-case button |
| 422-427 | TASKVIEWS | "Showing N of TOTAL" |
| 441-443 | UIPASS | `fmt` via `fmtDay`/`fmtDue` |

(c) none. (d) `Tabs`, `useAuth`, `@/lib/formatDate`, `@/lib/isoWeek`, `@/lib/labels`, `useTasksWithTotal`; backend `GET /tasks` needs `open`, `dueFrom`, `dueTo`, `sort`, `X-Total-Count`.
(e) **TAKE-CUST+0.** e2e specs that tick "Overdue only" will break (unverified which).

### 2.12 `pages/Settings.tsx` (247 → 390)

(a) A new "iTop" section (only when iTop is configured on the install) where each user pastes, validates and removes their personal iTop token; shows "Valid · <person> · checked 5 min ago · expires …". Username/email are body font; buttons sentence case.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 3 | SKELETON | import `CardGridSkeleton` (used at ~182 while the token status loads) |
| 7-13 | ITOP + UIPASS | `fmtAgo`, `fmtDateTime`; `useMyItopToken`, `useSaveMyItopToken`, `useRemoveMyItopToken` |
| 71, 74, 78 | UIPASS | drop `font-mono` / `tracking-wider` |
| 88-89 | ITOP | `<ItopTokenSection />` |
| 155 | UIPASS | sentence-case Save |
| 166-299 | ITOP | `ItopTokenSection` |
| 363 | UIPASS | `text-xs` |

(c) none. (d) `@/components/skeletons`, `@/lib/formatDate`, three iTop hooks. (e) **TAKE-CUST+0.** If ITOP is phased later, apply the 5 UIPASS hunks first. Note: the remove-token flow uses an inline "Confirm / Cancel" link pair (CUST 258-279), not `ConfirmModal`.

### 2.13 `pages/ProjectDetail.tsx` (258 → 370) — guardrail page

**Tab sets**
| # | INTERNAL (`ProjectDetail.tsx:24-32`) | CUST (`ProjectDetail.tsx:45-54`) |
|---|---|---|
| 1 | Overview | Overview |
| 2 | List | List |
| 3 | Kanban | Kanban |
| 4 | Gantt (hidden below `md`) | Gantt (hidden below `md`) |
| 5 | — | **Epics** (new) |
| 6 | Timeline | Timeline |
| 7 | Risks | Risks |
| 8 | Services | Services |

Timeline stays in CUST (guardrail satisfied). Routes: CUST `App.tsx:57-65` adds `epics` and replaces the index redirect with `ProjectIndexRedirect` (keeps `?task=`).

(a) Header row now shows a facts strip (customer, dates, TAM, progress bar, overdue / slip / open-risk health) instead of the "SA x → TAM y · N tasks" line; member avatars + Members dialog; Share (guest link) button for owners; Copy link button; "Edit" (desktop); a ⋯ menu holding Delete project (and, on phones, Edit and the Context toggle); Context is an icon toggle. Delete uses the in-app danger dialog. A page skeleton replaces grey blocks. A 404 says "This project doesn't exist or isn't shared with you. Ask the project's TAM to add you as a member." The Epics tab exists and the content shifts when the epic panel is open. `?new=task` opens the create-task form. Tab row gets a right-edge fade on phones.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 10, 72 | EPIC | `useLocation` |
| 12 | UIPASS | `ConfirmModal` |
| 13 | COPYLINK | `CopyLinkButton` |
| 16 | HEALTH | `ProjectHeaderFacts` |
| 17 | MEMBERS | `ProjectMembersButton` |
| 18 | SHARE | `ProjectShareButton` |
| 19, 69, 340-346 | PALETTE | `TaskFormModal` create mode, `newTaskOpen` |
| 21, 127 | SKELETON | `ProjectPageSkeleton` |
| 22-27 | UIPASS | `DropdownMenu*` imports |
| 30, 124 | PALETTE | `useNewParam("task", hasPermission(user,"task:write"), …)` |
| 33, 118-123, 155, 323 | MEMBERS | `canOwnProject`, `saveErrorMessage`; `customerOwnerId`, `isOwner`, `canDelete`; `canChangeOwnership={isOwner}` on `ProjectFormModal` |
| 40-44, 134-138 | NOACCESS | `PROJECT_BLOCKED_MESSAGE`, used for `ApiError` 404 |
| 50 | EPIC | Epics tab |
| 67, 149, 325-338 | UIPASS | `confirmDeleteOpen`, modal-based delete (`confirmTone="danger"`) |
| 83-89, 164 | EPIC | `epicPanelOpen` → `md:mr-[380px]` |
| 167-177 | HEALTH + **SA-REMOVAL** | `<ProjectHeaderFacts project={project} />` replaces the meta line INT 137-153 (which showed `SA <name> → TAM <name> · N tasks`) |
| 179 | MEMBERS | `<ProjectMembersButton project canManage={canEdit} />` |
| 182 | SHARE | `{canEdit && isOwner && <ProjectShareButton project />}` |
| 183-186 | COPYLINK | `<CopyLinkButton label="Copy link" …/>` |
| 188-195 | UIPASS | Edit button `md:inline-flex`, label "Edit" |
| 197-256 | UIPASS | ⋯ actions menu (Edit/Context on mobile; Delete when `canDelete`) |
| 262-272 | UIPASS | Context becomes an icon toggle with `title` |
| 283-309 | UIPASS | tab row wrapper + scroll fade |
| 331-333 | **PIPELINE-REMOVAL** (wording) | delete-confirm body drops ", and unlinks any won deal" (INT 117) |

(c) Keep as INTERNAL:
- SA display (INT 143-148). The new header delegates to `components/ProjectHeaderFacts.tsx`, which has no SA (grep verified) → add an SA fact there for INTERNAL.
- "and unlinks any won deal" in the delete confirmation body (INT 117) → re-add to the `ConfirmModal` body at CUST 331-333.
- Decision needed: should the project's **SA** count as an owner in `canOwnProject` (`lib/ownerAccess.ts:21-30`, currently view-all / TAM / customer owner)? It gates Delete, Share and the ownership fields. Must match whatever the backend `ensureProjectOwnerAccess` port decides.
(d) See table; 8 new component/hook/lib imports.
(e) **TAKE-CUST+2** (delete wording; SA via ProjectHeaderFacts) + 1 decision (SA ownership). Applying CUST hunks onto INTERNAL would be ~25 hunks rewriting >60% of the JSX — not recommended. If features are phased, stub order inside the header action row is independent: Members (179), Share (182), CopyLink (183-186) can each be omitted without touching the rest.

### 2.14 `pages/views/ProjectList.tsx` (1173 → 1336)

(a) Rows show an epic chip; a Filter button opens an Epic filter (All / No epic / one epic). Due dates read `Today`/`Tomorrow`/`Nd late` (plain date when Done). The inline status chip reads "In progress" (INTERNAL reads **"Active"**) with shared tone classes. The assignee picker is wider and marks people who are not on the project yet ("adds them to the project" notice). Section delete uses the in-app danger dialog. Row/section drags pause the 30 s live refresh. Buttons sentence case.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 1 | EPIC | `useCallback` |
| 22, 148, 260, 562, 627-637 | UIPASS | `ConfirmModal` for section delete (`deletingSection`) |
| 25, 39, 47 | EPIC | `EpicChip`, `type Epic`, `useProjectEpics` |
| 28, after 69 (INT 60-69), 1001-1005, 1239-1245, 1273 | UIPASS | `TASK_STATUS_TONE_CLASS` + `TASK_STATUS_LABEL` replace local maps |
| 32-37 | LIVE + UIPASS + MEMBERS | `useDragActivityGuard`; `fmtDay`/`fmtDue`; `ASSIGN_ADDS_MEMBER_NOTICE`, `useAssigneeMembership`; `dayToDate` dropped |
| 120, 127-136 | EPIC | `epics`, `epicMap` |
| 149-153, 170-177, 180-199 | EPIC | filter state, `isTaskVisible`, `visibleGrouped` (render-only; drag math still reads unfiltered `tasks`) |
| 155-157, 307, 529-536 | LIVE | `dragActivity.begin/end` on `DndContext` `onDragStart`/`onDragCancel` and at the end of `handleDragEnd` |
| 423-479 | EPIC | Filter popover |
| 536 | EPIC | `visibleGrouped.map` |
| 544, 648, 675, 798, 833, 845, 855, 910, 989-993 | EPIC | `epicMap` threading + `<EpicChip>` on desktop and mobile rows |
| 593, 603, 733, 737, 751, 1092 | UIPASS | sentence case / `text-meta` |
| 917, 1107, 1113, 1132-1140, 1147-1191 | MEMBERS | `projectId` into the assignee picker; new `AssigneeOptions` with membership notice |
| 928, 997, 1196, 1202-1203, 1207, 1219-1220, 1331-1335 | UIPASS | `done` flag + `fmt(iso, done)` |

(c) none. (d) See table. (e) **TAKE-CUST+0.** If phased: UIPASS, EPIC, LIVE and MEMBERS hunks are separable (EPIC is the largest: ~15 hunks). Not on the spine list by path, but it drives task reordering — treat with spine-level care.

### 2.15 `pages/Customers.tsx` (250 → 412)

(a) The card grid becomes a sortable table: Customer, AM, TAM, Projects (count links to `/projects?customerId=`), Overdue (red when > 0), Risks, Weekly update (None this week / Draft / Done chip), and a ⋯ row menu with Edit and (owners only) Delete. Row click opens the customer. Table skeleton while loading. Delete uses the in-app danger dialog. `/customers?new=1` opens the create form. The card's description text and "SA lead" line are no longer shown in the list.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 1-9, 14-17, 171-410 | CUSTOMERS | TanStack table + `DataGrid*`; `CustomersTable`, `WEEKLY_RANK`, `weeklyKind`, `initialsOf` replace `CustomerCard`, `avatarColor`, `SkeletonGrid` |
| 10, 47, 69, 157-165 | UIPASS | `ConfirmModal` delete |
| 18, 30 | CUSTOMERS | `Chip`, `WEEKLY_STATUS_LABEL` |
| 19-20, 107-113 | SKELETON | `TableSkeleton`, `Skeleton` |
| 21-26 | CUSTOMERS | `DropdownMenu*` |
| 27, 66 | PALETTE | `useNewParam("1", canMutate, …)` |
| 29, 35, 42-44, 50-63, 74, 155, 191-198, 357 | MEMBERS | `canOwnCustomer`, `saveErrorMessage`, `useProjects` → `projectTamIdsByCustomer`, `ownsCustomer`, `canChangeOwner` on the form, Delete only where `canOwn` |
| 93 | UIPASS | sentence-case button |
| 141-147 | CUSTOMERS | `<CustomersTable …/>` |

(c) No PIPELINE/SA-REMOVAL. Note: the removed "SA lead" line (INT 180-187) was `customer.solutionArchitect` — the free-text customer contact, which CUST keeps on the model and shows in `AccountHeader.tsx:120`; its disappearance from the list is a CUSTOMERS redesign choice, not SA-REMOVAL. Optional INTERNAL add: an "SA" column next to AM/TAM.
(d) `@tanstack/react-table`, `reui/data-grid/*` (sanctioned), `ConfirmModal`, `Chip`, skeletons, `ui/skeleton`, `ui/dropdown-menu`, `useNewParam`, `ownerAccess`, `labels`, `useProjects`; `CustomerSummary.health` from `GET /customers`. The `reui/frame` import is dropped.
(e) **TAKE-CUST+0.** e2e note: the name stays an `<h3>` on purpose (comment at CUST 219-220 cites `customer-visibility.spec.ts`).

### 2.16 `pages/CustomerDetail.tsx` (970 → 294)

Diff hunk headers: `1,9c1,5 12,17c8,9 19d10 21d11 24,25c14 28,32d16 33a18 35a21 38d23 40c25 42,48d26 59a38 61a41,73 68c80,84 75c91 86a103,160 96c170,172 101a178,185 104,109c188 115c194 119c198,201 122,216c204,215 228c227 234,255c233,239 263a248 265,267d249 269,283c251,259 286,901c262,266 903,944c268`. The file shrinks by 676 lines because the overview UI moved to two new components.

**Tab sets**: INTERNAL `overview | services | topology | org ("Organization Structure") | documents` (`CustomerDetail.tsx:40-48`). CUST `overview | services | tickets` — Tickets only when iTop is configured and the customer is mapped (`CustomerDetail.tsx:25, 68-72`).

(a) The customer page is an account page: a header strip (name, AM / SA / TAM / iTop org, one-line health roll-up: active projects, overdue tasks, open risks, latest weekly update; Copy link, Edit, ⋯ → Delete); Overview lists the customer's projects with status/progress/health/dates/TAM, the latest weekly update (earlier weeks on demand), recent customer notes, a collapsed profile. The Topology / Organization Structure / Documents placeholder tabs, the "Soon" sections, the two KPI tiles and the "‹ Customers" back link are gone. A Tickets tab (table/board, `?view=board`) and a right-side ticket panel (`?ticket=<id>`) appear for iTop-mapped customers. 404 reads "This customer doesn't exist or isn't shared with you." Delete uses the danger dialog and is offered only to owners.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 3-4, 198, 204-215, 227-231 | CUSTOMERS | `AccountHeader` (+ `sumProjectHealth`), `AccountOverview` replace the identity card, KPI tiles, `OverviewTab` (INT 122-216, 269-363), `ProjectsDataGrid` (INT 372-490), `CustomerKpi`, `avatarColor`, `ResourceSection`, `WeeklyUpdatesList/Row/Field`, `healthChip`, `statusBadge`, `ProfileCompletionCard` (INT 492-947) |
| 5, 38, 188, 251-260 | UIPASS | `ConfirmModal` delete |
| 8-9, 18, 21, 42-62, 71, 80-91, 103-159, 199-200, 233-241, 262-268 | ITOP | `TicketPanel`, `TicketsTab`, `useItopStatus`, `useCustomerTickets` gate (`poll: false`), `ticketsAvailable`, `?ticket=` and `?view=` handling, `itopOrgName` |
| 14, 178-184, 194, 211, 248 | MEMBERS | `canOwnCustomer`, `saveErrorMessage`, `canOwn` → `canDelete`, `canChangeOwner` |
| 25, 68-72 | CUSTOMERS + ITOP | tab type/list (placeholders removed; `TAB_ITEMS` moves inside the component) |
| 64-66 | CUSTOMERS | `latestUpdate = useCustomerWeeklyUpdates(customerId, 1)` for the header |
| 170-172 | NOACCESS | 404 message |
| (in `AccountHeader.tsx`) | COPYLINK | Copy link button — not in the page file |

(c) **SA-REMOVAL**: the project grid's `sa` column (INT 418-429, `row.sa?.username`) is gone; CUST's grid (`components/customer/AccountOverview.tsx:161-280`, columns Project / Status / Progress / Health / Dates / TAM) has no SA column. For INTERNAL re-add an SA column **in `AccountOverview.tsx`** (after the TAM column at `:229`), with `personNameSortingFn`. Nothing to re-add in the page file itself. `customer.solutionArchitect` (free-text) is still shown — `AccountHeader.tsx:120`.
(d) `AccountHeader`, `AccountOverview`, `ConfirmModal`, `TicketPanel`, `TicketsTab`, `ownerAccess`, `useCustomerTickets`, `useItopStatus`. Dropped: `@tanstack/react-table`, `reui/badge`, `reui/data-grid/*`, `EmptyState`, `StatusChip`, `ui/skeleton`, `dateField`, `isoWeek`, `tableSort`.
(e) **TAKE-CUST+0** in the page; +1 SA column in `AccountOverview.tsx`. If ITOP is phased after CUSTOMERS, the page can ship without the ITOP hunks by dropping CUST lines 8-9, 42-62, 103-159, 234-241, 262-268 and passing `itopOrgName={null}`.
Bug to fix while porting (present in **both** repos): `components/layout/RightSidebar.tsx` (INTERNAL `:268`, CUST `:263`) links to `/customers/<id>?tab=documents`; in CUST that tab no longer exists, so the link silently lands on Overview.

### 2.17 `pages/Admin.tsx` (1975 → 1757)

**Tab sets**
| # | INTERNAL (`Admin.tsx:45-53`) | CUST (`Admin.tsx:45-53`) |
|---|---|---|
| 1 | `users` — "Users" | `users` — "Users" |
| 2 | `roles` — "Roles" | `roles` — "Roles" |
| 3 | `signin` — "Sign-in" | `signin` — "Sign-in" |
| 4 | `projects` — "Project Override" | `projects` — "Project Override" |
| 5 | `pipeline` — "Pipeline" (import history, `PipelineTab`, INT 1749-1975) | `itop` — "iTop" (`components/admin/ItopTab.tsx`) |

INTERNAL target: **six tabs** — keep `pipeline`, add `itop`.

(a) An iTop tab (connection, org mapping, user matching, timezone, actions switch, webhook secret — all inside `ItopTab`). Delete user, Reset password, Delete role and Disconnect Google use in-app dialogs instead of browser `confirm()`. Action buttons are sentence case; names/emails/counters body font; project status in Project Override is a status chip; "Last updated" uses the 24h day-first format. In CUST the Pipeline tab, the SA column, the "/ SA" project count and the SA built-in role are gone.

(b) Hunks
| CUST lines | Tag | What |
|---|---|---|
| 9 (INT 9) | UIPASS + **PIPELINE-REMOVAL** | `ConfirmModal` import added; `AssigneeAvatar` import removed (only `PipelineTab` used it) |
| 11 (INT 11) | UIPASS + **PIPELINE-REMOVAL** | `ProjectStatusChip` import added; `Chip` import removed (only `PipelineTab` used it) |
| 13 | ITOP | `import { ItopTab }` |
| after 18 (INT 18), after 31 (INT 32) | **PIPELINE-REMOVAL** | `PipelineImportLogEntry`, `usePipelineImports` imports removed |
| 37 | UIPASS | `fmtDateTime` |
| 45, 52, 89 | **PIPELINE-REMOVAL** + ITOP | `Tab` union, `TAB_ITEMS`, render switch: `pipeline` → `itop` |
| after 66 (INT 67-69) | **PIPELINE-REMOVAL** | `EMPTY_IMPORTS` |
| 114-115, 327, 334, 420, 430, 600-620 | UIPASS | user delete / reset-password `ConfirmModal`s |
| 164 (INT 165) | **SA-REMOVAL** | comment "TAM/SA columns" |
| 189, 240, 255, 291, 320, 328, 336 | UIPASS | typography / sentence case |
| after 266 (INT 268-272), 269, 273 | **SA-REMOVAL** | "Projects (TAM/SA)" → "Projects (TAM)"; `projectsAsSA` dropped |
| 444 (INT 456) | **SA-REMOVAL** | built-in role list loses `"SA"` |
| 486, 497, 509, 522, 534 | UIPASS | typography |
| 628, 635, 669, 673-674 | UIPASS | chips `text-meta`; counters lose `font-mono` |
| 755, 911, 1008, 1106-1116 | UIPASS | role delete `ConfirmModal` |
| 806, 844, 888, 895, 905, 913 | UIPASS | typography / sentence case |
| 1025-1026 (INT 1015-1016) | **SA-REMOVAL** (wording) | "…they're the assigned SA or TAM." → "…assigned TAM, or that belong to a customer they own." |
| 1042, 1055, 1181, 1206, 1216, 1233, 1264, 1270 | UIPASS | typography |
| 1239 | UIPASS | `fmtDateTime(data.updatedAt)` |
| 1308, 1370, 1383-1389, 1397, 1543-1553 | UIPASS | Disconnect-Google `ConfirmModal` (form `onClose` is a no-op while the confirm is open, wrapped in a fragment) |
| 1399, 1408, 1416, 1456, 1462, 1480, 1489, 1535 | UIPASS | typography |
| 1613-1614 (INT 1585-1586) | **SA-REMOVAL** | comment |
| after 1623 (INT 1596-1611) | **SA-REMOVAL** | `sa` column of the Project Override grid |
| 1631 | UIPASS | `<ProjectStatusChip status=… />` |
| after 1757 (INT 1748-1975) | **PIPELINE-REMOVAL** | whole `PipelineTab` |

(c) Keep as INTERNAL: INT 9 (`AssigneeAvatar`), INT 11 (`Chip`), INT 18, INT 32, INT 45+52+92 (pipeline tab), INT 67-69, INT 165, INT 268-279, INT 456, INT 1015-1016 (merge wording: "assigned SA or TAM, or that belong to a customer they own"), INT 1585-1586, INT 1596-1611, INT 1748-1975.
(d) `ConfirmModal`, `ProjectStatusChip`, `components/admin/ItopTab`, `@/lib/formatDate`.
(e) **TAKE-CUST+12** (the 12 items in (c); `PipelineTab` is one contiguous block appended at the end, the rest are 1-15 line re-insertions). The alternative is applying ~75 CUST hunks onto INTERNAL — far more error-prone. After re-adding, give `PipelineTab` the UIPASS treatment by hand (`font-mono` + `toLocaleString()` at INT 1787-1790 → `fmtDateTime`; counters at INT 1820-1880 lose `font-mono`) — CUST has no reference for this block.

---

## 3. CUST-only pages

### 3.1 `pages/Help.tsx` (130 lines) — tag HELP
- Purpose: searchable how-to guide for every page/feature the signed-in user can reach; topics gated by permission are hidden with the same rule as the sidebar; `/help#<topic>` deep-links.
- Route: `<Route path="help" element={<Help />} />` inside the Shell (CUST `App.tsx:83`). Reached only from the TopBar help button (no sidebar or ⌘K entry — comment at `Help.tsx:7-10`).
- Imports: `EmptyState`, `hasPermission`/`useAuth`, `filterHelpTopics`/`HelpTopic` from `@/lib/helpContent`.
- Adaptation: the page is generic; the work is in `lib/helpContent.ts` (CUST topics: getting-started, overview, projects, project-views, tasks, risks, customers, daily-review, weekly-sync, itop, utilization, executive, settings, admin, shortcuts). It has **no Pipeline topic and no project-SA wording** (grep: only `:240` mentions the customer Solution Architect). INTERNAL needs a Pipeline topic gated on `pipeline:view`, SA wording in the projects/visibility topics, and `helpContent.test.ts`'s "gate matches sidebar page" check updated for the Pipeline entry.

### 3.2 `pages/PublicShare.tsx` (295 lines) — tag SHARE
- Purpose: read-only guest view of a project timeline (name, customer, status, phases with dates and Done / In progress / Not started, milestones); friendly states for expired, revoked or rate-limited links; sets `noindex` and `no-referrer`.
- Route: `<Route path="/share/:token" element={<PublicShare />} />` **outside** `AuthGuard` and `Shell` (CUST `App.tsx:43-44`).
- Imports: `BrandMark`, `Chip`/`ProjectStatusChip`, `ApiError`, `dateToDay`, `formatDate` (`fmtAgo`, `fmtDay`, `fmtDayFull`, `fmtRange`), `labels` (`MILESTONE_UPCOMING_LABEL`, `PHASE_STATUS_LABEL`, `TASK_STATUS_LABEL`), `usePublicShare`, `lib/shareLinks`.
- Adaptation: none in the page (no TAM/SA/pipeline references — grep verified). Coupled non-page changes: `frontend/vite.config.ts` `navigateFallbackDenylist: [/^\/api\//, /^\/share\//]` (CUST `:53`), `frontend/nginx.conf`, backend public route. Guardrail check: the payload carries no notes (changelog + page renders only project/phase/milestone fields), so the INTERNAL-notes export rule is not engaged — unverified against the backend serializer.

### 3.3 `pages/Utilization.tsx` (227 lines) — tags UTIL, ITOP
- Purpose: hours per customer per day for an ISO week from iTop Time Tracking; week switcher, three tiles, Customer × Mon–Sun matrix; "Me" for everyone, "By TAM"/"By customer" for `report:executive`; refresh-from-iTop button; "iTop is not connected" empty state.
- Route: `<Route path="utilization" element={<Utilization />} />` plus `<Route path="work-logs" element={<Navigate to="/utilization" replace />} />` (CUST `App.tsx:72-73`). Sidebar entry `/utilization` in group "Insights" (`navCommands.ts:30`).
- Imports: `EmptyState`, `reui/alert`, `ui/skeleton`, `components/utilization/UtilizationTable` + `UtilizationTiles`, `ApiError`, `hasPermission`/`useAuth` (**uses `userVerified`**), `weekNumberLabel`, `dateToDay`, `fmtTime`, `isoWeek`, `useUtilization`, `useRequestItopRefresh`, `UtilizationScope`.
- Adaptation: replaces INTERNAL `pages/WorkLogs.tsx` and its `/work-logs` route — **conflicts with the CLAUDE.md standing decision** on `WorkLogs.tsx`; needs the user's go-ahead and a guardrail-text update. Requires `lib/auth.tsx` `userVerified` (SIGNIN). No SA/pipeline content.

### 3.4 `pages/views/ProjectEpics.tsx` (564 lines) — tag EPIC
- Purpose: Epics tab — table (cards on mobile) of a project's epics with colour, title, status, owner, due date, done/total progress; inline create, rename, colour pick, delete (danger dialog); row click opens `EpicPanel` via `?epic=<id>`.
- Route: `<Route path="epics" element={<ProjectEpics />} />` under `projects/:id` (CUST `App.tsx:62`); tab entry at CUST `ProjectDetail.tsx:50`.
- Imports: `useProjectContext` (from `../ProjectDetail`), `ConfirmModal` (danger), `EpicPanel`, `reui/alert`, `CardGridSkeleton`/`TableSkeleton`, `TaskStatusChip`, `ApiError`, auth, `fmtDay`, `SECTION_COLOR_PRESETS`, `useProjectEpics`/`useCreateEpic`/`useUpdateEpic`/`useDeleteEpic`/`type Epic`.
- Adaptation: none in the page (no TAM/SA references — grep verified). Epic owner picker lives in `EpicPanel` (component scope).

---

## 4. INTERNAL-only pages (must survive the port)

| File | Status | Port impact |
|---|---|---|
| `pages/Pipeline.tsx` (311) | keep | route `pipeline` behind `PipelineGuard` must stay in `App.tsx` (INT `App.tsx:61-68`) |
| `pages/OpportunityDetail.tsx` (1244) | keep | route `pipeline/:id`; uses `AssigneeAvatar` (`:793`, `:916`), `ConfirmModal confirmTone="warning"` (`:678`, `:1113`) — both stay API-compatible with the CUST versions (verified: `size` prop unchanged; `warning` tone kept) |
| `pages/views/PipelineClosed.tsx` (339), `PipelineList.tsx` (363), `PipelineQuarter.tsx` (182), `PipelineSwimlane.tsx` (308) | keep | no CUST counterpart |
| `pages/WorkLogs.tsx` (20) | **decision** | CUST replaced it with `Utilization.tsx`; see 3.3 |

UIPASS debt in these files (CUST never touched them), counted by grep:

| File | `text-[9/10/11px]` | `tracking-wider` | `toLocale*String` | `font-mono` |
|---|---|---|---|---|
| Pipeline.tsx | 0 | 2 | 0 | 0 |
| OpportunityDetail.tsx | 1 | 16 | 1 | 3 |
| views/PipelineClosed.tsx | 2 | 1 | 0 | 1 |
| views/PipelineList.tsx | 0 | 0 | 0 | 5 |
| views/PipelineQuarter.tsx | 0 | 0 | 0 | 0 |
| views/PipelineSwimlane.tsx | 5 | 0 | 0 | 7 |
| WorkLogs.tsx | 0 | 1 | 0 | 0 |

No browser `confirm()` calls in any of them. A hand-done UIPASS follow-up for the Pipeline pages (plus `components/pipeline/*`, `PipelineTab` in Admin) is needed if the user wants one consistent look; `lib/pipelineFormat.ts` has its own date formatter (`formatPipelineDate`) that should be reconciled with `lib/formatDate.ts` (unverified how they differ).

`App.tsx` merge (not a page, but it owns the routes): keep INT imports/routes for `PipelineGuard`, `Pipeline`, `OpportunityDetail`; add CUST's `Help`, `PublicShare`, `Utilization`, `ProjectEpics`, `ProjectIndexRedirect` (SIGNIN/COPYLINK deep-link fix), `/share/:token`, `epics`, `utilization`, `work-logs` redirect, `help`.

---

## 5. Merge-strategy summary

| Page | Strategy | INTERNAL hunks to re-add | Tags carried |
|---|---|---|---|
| Login.tsx | TAKE-CUST+0 | — | SIGNIN, UIPASS |
| WeeklySync.tsx | TAKE-CUST+0 | — | UIPASS |
| DailyReview.tsx | TAKE-CUST+0 | — | ITOP, UIPASS |
| Tasks.tsx | TAKE-CUST+0 | — | TASKVIEWS, UIPASS |
| Settings.tsx | TAKE-CUST+0 | — | ITOP, SKELETON, UIPASS |
| Customers.tsx | TAKE-CUST+0 | — (optional SA column) | CUSTOMERS, MEMBERS, PALETTE, SKELETON, UIPASS |
| CustomerDetail.tsx | TAKE-CUST+0 | 0 in page; SA column in `AccountOverview.tsx` | CUSTOMERS, ITOP, MEMBERS, NOACCESS, UIPASS |
| views/ProjectList.tsx | TAKE-CUST+0 | — | EPIC, LIVE, MEMBERS, UIPASS |
| views/ProjectRisks.tsx | TAKE-CUST+0 | — | UIPASS |
| views/ProjectServices.tsx | TAKE-CUST+0 | — | SKELETON |
| views/ProjectTimeline.tsx | TAKE-CUST+0 | — | UIPASS |
| views/ProjectOverview.tsx | TAKE-CUST+2 | DealCard import + render | ACTIVITY, UIPASS |
| Projects.tsx | TAKE-CUST+3 (+ reworded subtitle) | `saInit`, SA avatar, `avatarColor` | HEALTH, PALETTE, UIPASS |
| Overview.tsx | TAKE-CUST+4 | pipeline import, auth import, `user`, panel render | OVERVIEW, HEALTH, UIPASS |
| Executive.tsx | TAKE-CUST+5 | pipeline import, auth import, `user`, `canViewPipeline`, 2 render sites | UIPASS |
| ProjectDetail.tsx | TAKE-CUST+2 (+1 decision) | "unlinks any won deal" wording; SA via `ProjectHeaderFacts` | EPIC, MEMBERS, SHARE, COPYLINK, HEALTH, PALETTE, SKELETON, NOACCESS, UIPASS |
| Admin.tsx | TAKE-CUST+12 | see 2.17(c) | ITOP, UIPASS |

If the plan phases features instead of taking whole files, the cheapest first slice is UIPASS + SKELETON (touches all 17 pages, needs only `lib/formatDate`, `lib/labels`, `text-meta`, `ConfirmModal` danger tone, `components/skeletons`, `StatusChip.TASK_STATUS_TONE_CLASS`). But because UIPASS hunks are interleaved with feature hunks in ProjectDetail, ProjectList, Customers, CustomerDetail and Overview, splitting those five by tag costs more than landing them whole once their dependencies exist.

---

## 6. DESIGN.md differences (INTERNAL `docs/DESIGN.md` 365 lines vs CUST 360 lines)

Frontmatter (lines 1-130): **one** difference — CUST adds a type role at `:116`:
`meta: { fontSize: 12px, fontWeight: '500', lineHeight: '1.35' }`. Colours, radii, shadows, scale and all other roles are identical.

Body differences:
1. **New named role `text-meta`** (CUST `:247`): "12px / 500 / 1.35 — chips, badges, secondary meta — sentence case, no uppercase transform". The roles paragraph says "seven named roles" registered in `lib/utils.ts`'s tailwind-merge config (INTERNAL: six). Every ported page uses `text-meta`; without the `index.css` token and the `cn()` registration the class is a no-op / can be evicted by a colour class.
2. **`font-mono` scope narrowed** (CUST `:222`): mono is for IDs, counts and build tags and inside the date-picker trigger inputs; the Gantt tree's date columns use the body font. INTERNAL (`:221`) still says mono is used ad hoc for dates. This is the rule behind every "drop `font-mono` on dates/names/counters" hunk above.
3. **Compact data-grid mode** (CUST `:320`): names `text-meta` as the sanctioned 12px sentence-case token (INTERNAL `:316` says no 12px body token exists).
4. **`CHIP_BASE`** (CUST `:325`): `text-meta` instead of `text-[11px]`; the "exported so other bespoke chips can compose it" note is dropped (INTERNAL's `PipelineFlagChips.tsx` composes it — keep the export).
5. **Elevation table** (CUST `:294-299`): adds rows/entries for the Ticket detail panel (`TicketPanel.tsx`), Epic detail panel (`EpicPanel.tsx`), the NotificationBell popover, the `ui/dropdown-menu.tsx` ⋯ menus on `pages/ProjectDetail.tsx`, `pages/Customers.tsx` and `AccountHeader.tsx` (all `shadow-overlay!`), `CommentMentions.tsx`'s picker, `ProjectEpics.tsx`'s `ColorDot` popover, and the iTop `TicketCard.tsx` drag overlay. The Drag overlay row drops the Pipeline `OpportunityCard.tsx` mention — **keep INTERNAL's mention**.
6. **Chip docs** (CUST `:345`): new paragraph — `LabelChip`/`EpicChip` are not tone chips (8px colour dot + 14% `color-mix` tint, text always `text-on-surface`).
7. **Pipeline chip docs — do NOT take CUST's version.** CUST `:338-343` still documents a stale `StageChip` table (RFP / POC / …, WON, DROP, HOLD) for a component CUST deleted. INTERNAL `:334-350` documents the current 6-stage funnel plus `PipelineFlagChips.tsx` (`OwnerChip`, `SubStatusChip`, `TagChip`, `IdleChip`, `OutcomeChip`). INTERNAL's text is newer and correct for INTERNAL.

Rules implied by the UIPASS but **not written into CUST's DESIGN.md** (grep found no mention of "sentence case" for buttons, the day-first date format, or skeleton timing): sentence-case buttons/tabs with `font-semibold` instead of `uppercase tracking-wider`; `tracking-wider` dropped next to `text-label-caps` (the role already carries 0.05em); day-first 24h dates through `lib/formatDate.ts`; skeletons with a 150 ms delay; `ConfirmModal` `danger` tone for destructive confirmations. These live only in CUST's CHANGELOG and code. If INTERNAL wants them binding, the docs-keeper should add them to DESIGN.md (the port touches `index.css`, which is a docs-keeper trigger anyway).

Guardrail cross-check: no CUST page rebases `StatusChip`/`PriorityBadge`/`LabelChip` onto `reui/badge`; CUST `CustomerDetail.tsx` actually drops its `reui/badge` import.

---

## 7. Risks and open decisions

1. **SA as project owner** — `canOwnProject` (CUST `lib/ownerAccess.ts:21-30`) knows only view-all / TAM / customer owner. INTERNAL must decide whether the project SA can delete, share and change ownership; frontend and backend must agree or SAs will see buttons that 403 (or lose buttons they should have).
2. **SA display has no home in three new components**: `ProjectHeaderFacts.tsx` (project header), `AccountOverview.tsx` project grid, `ProjectActivity.tsx` person filter. Each needs an INTERNAL-only addition; taking the CUST pages verbatim silently drops SA from the project header and the customer's project grid.
3. **`WorkLogs.tsx` standing decision vs Utilization** (section 3.3).
4. **Status wording change**: List view's inline status reads "Active" in INTERNAL (`ProjectList.tsx:62`) and "In progress" after the port; Tasks filter options change from `IN PROGRESS`/`MEDIUM` to "In progress"/"Medium". e2e specs asserting the old strings will fail (unverified which specs).
5. **Removed UI that tests or links may reference**: Tasks "Overdue only" checkbox; Customers card grid (now a table; name kept as `<h3>`); CustomerDetail Topology / Organization Structure / Documents tabs (`RightSidebar.tsx` still links `?tab=documents` in both repos); Overview "Welcome back" heading and the four KPI tiles; Project header "Delete project" button (now in the ⋯ menu) and "Edit project" label (now "Edit").
6. **Pipeline surfaces get no UIPASS from CUST** — visual inconsistency until a hand pass (section 4).
7. **Order dependency**: Overview tiles link to `/tasks?view=…` (TASKVIEWS); Overview/Projects/Customers/CustomerDetail read `health` blocks that the backend must already return; DailyReview/Settings/CustomerDetail/Admin/Utilization need the iTop backend. Pages landed before their backend fall back to zeros/empty (`health?.… ?? 0`) for HEALTH, but `data.workCounts` in `Overview.tsx:45` is destructured without a fallback and will throw if the backend lacks it.
8. **Delete-project copy**: CUST dropped "and unlinks any won deal"; INTERNAL must keep it (the won-deal handoff link still exists).

## 8. Verification status

Verified by direct diff/read: every hunk of all 17 differing pages; CUST `App.tsx` routes; both Admin tab lists; both ProjectDetail tab lists; Tasks route retention; module/symbol existence in INTERNAL; INTERNAL pages unchanged since fork commit `9f5fc20` except Pipeline pages; DESIGN.md full diff.
Unverified: backend endpoint availability in INTERNAL for the new hooks; which e2e specs depend on changed strings/DOM; internal behaviour of the new CUST components beyond the props the pages pass and the SA/TAM greps noted; how much UIPASS the INTERNAL `components/pipeline/*` files need; whether `formatPipelineDate` and `lib/formatDate` produce the same format.
