# Frontend components + e2e porting plan (CUST -> INTERNAL)

Scope: `frontend/src/components/**` and `e2e/`.
INTERNAL = `/home/solvro-internal/solvro` (target). CUST = `/home/solvro-internal/solvro-cust` (source).
Research only: nothing was edited, built, type-checked or run. Every statement below comes from `diff`, `grep`, `cmp` and file reads; anything else is marked **unverified**.

## 0. Method and the one fact that shapes the merge

- Fork base is commit `9f5fc20` (CUST CHANGELOG, "copied as of commit 9f5fc20"). That commit exists in INTERNAL, so a three-way view was possible.
- `git diff --stat 9f5fc20 HEAD -- frontend/src/components e2e` in INTERNAL touches **only**: Pipeline files (`pipeline/**`, `CloseDealDialog`, `DealCard`, `MoveReasonModal`, `PipelineFlagChips`, `PipelineImportDialog`, `StageChip`), the two pipeline specs, `e2e/CLAUDE.md`, and **one shared file: `StatusChip.tsx`** (6 lines: `CHIP_BASE` became an export).
- Consequence: for 46 of the 47 differing components, INTERNAL == fork base, so the whole diff is CUST's change. The merge is never a real three-way conflict except in `StatusChip.tsx`. The only work beyond "take CUST" is re-adding the hunks CUST deleted for SA / Pipeline (4 component files, 2 e2e files) and adapting CUST-only code so SA and Pipeline keep working.
- Line ranges are CUST line numbers taken from `diff -U1` / `-U2` hunk headers (so +/- 1-2 lines of context).
- `frontend/package.json` dependency lines are identical in both repos (checked with `diff` on the dependency lines) — no new npm dependency is needed for anything in this scope.

## 1. Guardrail checks (INTERNAL `CLAUDE.md`)

| # | Check | Result |
|---|---|---|
| 1 | `frontend/src/components/reui/` byte-identical | **PASS.** `diff -rq solvro/frontend/src/components/reui solvro-cust/frontend/src/components/reui` prints nothing. CUST-only code consumes `reui/alert`, `reui/kanban`, `reui/sortable`, `reui/badge`, `reui/data-grid/*` as-is. No vendored file needs touching. |
| 2 | `StatusChip` / `PriorityBadge` / `LabelChip` stay bespoke, not rebased on `reui/badge` | **PASS.** None of the three imports `reui/badge` in CUST. `StatusChip` and `PriorityBadge` keep their own `TONE_CLASS` bg+text pairs; only the label maps moved to `lib/labels.ts` and `text-[11px]` became `text-meta`. `LabelChip` changed its visual (solid pill -> dot + 14% `color-mix` tint, `text-on-surface`) but is still a hand-written `<span>`. New `EpicChip` is bespoke in the same way. `reui/badge` is used only on new surfaces (`customer/AccountOverview.tsx` L706-709, variants `success-light` / `warning-light` / `outline` — the same light variants `daily-review/SyncField.tsx` already uses). Note for the reviewer: the `LabelChip` restyle is a signature-visual change and needs a `docs/DESIGN.md` sync. |
| 3 | Date-contract spine: `DateField.tsx`, `DateRangeField.tsx`, `InlineDateRangeEditor.tsx` | `InlineDateRangeEditor.tsx`: **identical** (`cmp`). `DateField.tsx`: 1 hunk, class-only (CUST L153: Clear button `text-label-caps uppercase tracking-wider` -> `text-sm ... font-semibold`). `DateRangeField.tsx`: 7 hunks — new optional prop `emptyLabel?: string` (L31-32, L159), `formatRangeDisplay` gains a third param defaulting to the em dash (L93-100), trigger gets muted classes when both sides are unset (L265-270), trigger text passes `emptyLabel` (L272), and two footer-button class changes (L91, L331). **No change to parsing, normalisation, commit or emitted values** — presentation only. Still spine: instant review required. |
| 4 | Kanban / Gantt spine: `kanban-v2/adapter.ts`, `kanban-v2/commitMapper.ts`, `gantt-v2/` | `adapter.ts` and `commitMapper.ts`: **identical** (`cmp`). Only their tests differ: the task factory gains `itopTicketRef: null, epicId: null` (adapter.test L25-26, commitMapper.test L30-31) because the `Task` type grew. `gantt-v2/`: `adapter.ts`, `connector-paths.ts`, `GanttOverlay.tsx` identical; 4 files differ — `SolvroGantt.tsx` (15 hunks: live-refresh drag guard, epics fed to the Excel export, skeleton, date format, classes, `danger` tone; **no change to bar geometry, drag math, ordering or dependency logic**), `TreeCells.tsx` (`isTaskOverdue` moved to `lib/formatDate.ts` and re-exported; Dates cell font class), `TreeCells.test.ts` (+5 tests for `fmtDateRangeDDMM`), `SolvroBar.tsx` (2 class hunks). Details in section 3. |

Other guardrail observations:

- **`WorkLogs.tsx` standing decision** ("placeholder for a future iTop API integration; don't wire it up until that spec exists"): CUST replaced Work Logs with Utilization and built the full iTop integration. Porting ITOP / UTIL needs an explicit user decision (and the specs `docs/archive/plans/itop-integration.md` and `itop-integration-spec.md`, which exist only in CUST).
- **Plan citations**: CUST-only components cite `docs/archive/plans/itop-integration.md`, `itop-integration-spec.md`, `epics-spec.md`, `collaboration-and-sharing.md`. None of these exist in INTERNAL `docs/archive/plans/`. They must be ported with the code or the citations dangle.
- **`Tasks.tsx` / Timeline tab**: nothing in this scope removes them. `sidebar.spec.ts` asserts `/tasks` is not in the rail, which matches the guardrail (hidden from the sidebar only).
- **No new drag / Gantt / board npm library**: confirmed, the iTop board uses vendored `reui/kanban`.

## 2. Prerequisites outside this scope (components will not compile without them)

Missing in INTERNAL today (checked by file existence):

| Needed by | File | Tag |
|---|---|---|
| nearly every UIPASS hunk | `frontend/src/index.css` `--text-meta` token (CUST L114-116), `lib/utils.ts` class-merger registration | UIPASS |
| chips, forms, kanban, daily-review | `lib/labels.ts` | UIPASS |
| TaskPanel, cards, TreeCells, PortfolioCalendar, RightSidebar, SolvroGantt, daily-review, customer/, itop/ | `lib/formatDate.ts` | UIPASS |
| Modal | `hooks/useDialogFocus.ts` | UIPASS |
| TaskPanel, TaskFormModal, TaskConflictDialog | `lib/taskConflict.ts` | CONFLICT |
| CommentMentions | `lib/mentions.ts` | MENTION |
| TaskPanel, AssigneeMembershipNotice, ProjectMembers | `lib/useAssigneeMembership.ts`, `lib/projectMembers.ts` | MEMBERS |
| ProjectFormModal, CustomerFormModal, ProjectMembers, ProjectShare | `lib/ownerAccess.ts` | MEMBERS |
| SolvroKanban, SolvroGantt | `lib/dragActivity.ts` | LIVE |
| TopBar | `lib/routeMeta.ts` | UIPASS |
| CommandPalette | `lib/paletteActions.ts`, `hooks/useNewParam.ts` | PALETTE |
| Sidebar | `lib/navCommands.ts` `NAV_GROUPS` + `group` on every entry; `useNavBadges` in `lib/queries.ts` | SIDEBAR |
| NotificationBell | `lib/notificationText.ts` | NOTIF |
| ProjectActivity | `lib/activityText.ts` | ACTIVITY |
| ProjectShare | `lib/shareLinks.ts` | SHARE |
| guards | `userVerified` on `useAuth()` in `lib/auth.tsx` (grep: no hit in INTERNAL) | SIGNIN |
| many | new hooks / types in `lib/queries.ts` (`useProjectEpics`, `useEpic`, `useProjectMembers`, `useItopStatus`, `useNotifications`, `useProjectActivity`, `useShareLinks`, `Epic`, `UpdateTaskInput`, `DailyItopCustomer`, `Task.epicId`, `Task.itopTicketRef`, `ProjectDetail.health`, `useAddComment(taskId, projectId)` new signature, ...) | several |

Already present in both: `lib/clipboard.ts`, `lib/isoWeek.ts`, `lib/tableSort.ts`, `ui/skeleton`, `ui/popover`, `ui/select`, `ui/dropdown-menu`, `EmptyState`, `CriticalPathMark`, `Drawer`. `ui/` differs only in `tooltip.tsx` (changed) and `switch.tsx` (new).

SA / Pipeline adaptations these prerequisites need (flag for the lib-scope plan):

- `lib/navCommands.ts`: INTERNAL's `{ to: "/pipeline", label: "Pipeline", requires: "pipeline:view" }` entry (INTERNAL L24) needs a `group` or the new `Sidebar` filter (`visible.filter((i) => i.group === group)`) silently drops it. "Workspace" is the natural group.
- `lib/routeMeta.ts`: CUST has no `/pipeline` or `/pipeline/:id` route meta; the new `TopBar` reads titles and crumbs only from it. Pipeline pages need entries (INTERNAL's old `PAGE_TITLES` had no pipeline key either, so today they show "Solvro"; CUST's intent is that no page falls back to "Solvro").
- `lib/ownerAccess.ts` `canOwnProject`: checks view-all, `tamId`, customer owner. In INTERNAL an SA sees the project through `saId`. Decide whether the SA is an owner (may delete / change TAM / share) or member-level. This is a product decision; default suggestion is unverified.
- `lib/projectMembers.ts` `memberCandidates(users, tamId, members)`: excludes only the TAM. In INTERNAL the SA already has access, so the SA should be excluded from candidates too (otherwise an SA can be added as a redundant member).

## 3. Differing components — hunk walk

Legend: **take CUST** = copy CUST's file, then re-apply the listed INTERNAL hunks. Since INTERNAL == base for all but `StatusChip.tsx`, this is always safe and is the recommended direction unless stated.

### 3.1 Guards and auth

**`AdminGuard.tsx`** (3 hunks, L1-14) — SIGNIN. Imports `AuthLoading` from `@/components/AuthGuard`; reads `userVerified` from `useAuth()`; returns `<AuthLoading />` instead of redirecting while the user is unverified. Take CUST.

**`ExecutiveGuard.tsx`** (3 hunks, L1-13) — SIGNIN. Same change. Take CUST.

**`AuthGuard.tsx`** (3 hunks, L7-28) — SIGNIN. Loading branch uses the new exported `AuthLoading` component (L21-28); redirect state keeps `pathname + search + hash` (L11-15) so `/projects/6?task=42` survives sign-in. Take CUST.

**`PipelineGuard.tsx`** (INTERNAL-only, not in the diff) — SIGNIN **adaptation needed**. It has the same bug the two guards above fix: `if (!hasPermission(user, "pipeline:view")) return <Navigate to="/overview" replace />;` with no `userVerified` wait. Apply the same 3-line pattern by hand.

### 3.2 Shared primitives

**`Tabs.tsx`** (2 hunks, L19-26) — UIPASS. Adds `aria-current`; tab class `text-[13px] font-bold uppercase tracking-wider` -> `text-sm font-semibold` (sentence case). Take CUST. Affects Pipeline pages that use `Tabs` (visual only).

**`ConfirmModal.tsx`** (3 hunks, L4, L28-32, L42) — UIPASS. `Tone` gains `"danger"` (error colours); Cancel button gets `data-autofocus`. Take CUST.

**`Modal.tsx`** (3 hunks, L4, L26, L45-51) — UIPASS. New import `useDialogFocus` from `@/hooks/useDialogFocus`; dialog div gets `ref`, `tabIndex={-1}`, `onKeyDown` (focus trap + focus restore) and `focus:outline-hidden`. Take CUST. **Side effect on Pipeline:** `AssignPicModal`, `CloseDealDialog`, `MoveReasonModal`, `OpportunityFormModal`, `PipelineImportDialog`, `pipeline/PicDrillDownModal`, `pipeline/SolvroPipelineKanban` use `Modal` / `ConfirmModal` (grep) and will gain the focus trap and "focus moves into the dialog on open". `pipeline-board.spec.ts` / `pipeline-form.spec.ts` impact is **unverified** (not run).

**`ui/tooltip.tsx`** (4 hunks, L39, L46, L54, L65-66) — SIDEBAR. Adds `positionerClassName` prop passed to `TooltipPrimitive.Positioner`, and left/right arrow offset classes. All marked `// SOLVRO PATCH`. Take CUST. (This is `ui/`, not vendored `reui/`.)

**`InstallBanner.tsx`** (2 hunks, L81, L99) — UIPASS. `text-[11px]` -> `text-meta`. Take CUST.

**`DateField.tsx`**, **`DateRangeField.tsx`** — UIPASS, spine. See guardrail check 3. Take CUST. New consumer of `emptyLabel`: `TaskFormModal` L494.

**`PriorityBadge.tsx`** (4 hunks, L1, L17-20, L28-32) — UIPASS. Local `LABEL` map removed in favour of `PRIORITY_LABEL` from `@/lib/labels`; `text-[11px]` -> `text-meta`. Visible change: MEDIUM reads "Medium" (was "Med"). Take CUST.

**`LabelChip.tsx`** (whole file, L1-22) — UIPASS. Solid pill + `pickContrast()` replaced by dot + `color-mix(in srgb, <color> 14%, transparent)` tint with `text-on-surface`; `pickContrast` deleted. Take CUST. No INTERNAL-only importer of `pickContrast` (grep).

**`StatusChip.tsx`** (8 hunks) — UIPASS + PIPELINE-REMOVAL. **The one true three-way file.**
- UIPASS (take): L1 import `PROJECT_STATUS_LABEL, TASK_STATUS_LABEL` from `@/lib/labels`; local `PROJECT_LABEL` / `TASK_LABEL` maps removed (L21-27, L33); new export `TASK_STATUS_TONE_CLASS` (L35-41, used by `TaskPanel`); `CHIP_BASE` `text-[11px]` -> `text-meta` (L43-44); chips read the shared label maps (L49, L57).
- PIPELINE-REMOVAL (**do not port, keep INTERNAL**): CUST L4 turned `export type Tone` into a private `type Tone` and dropped its comment; CUST L43 has `const CHIP_BASE` un-exported. INTERNAL importers that break otherwise: `PipelineFlagChips.tsx:18` (`CHIP_BASE`, `Chip`, `Tone`), `StageChip.tsx:1`, `pipeline/kpi.ts:16`, `pipeline/analytics.ts:12`, `pages/views/PipelineClosed.tsx:32`.
- Direction: **apply CUST hunks onto INTERNAL** — keep `export type Tone` (with its comment) and `export const CHIP_BASE` (with its comment), take everything else. Pipeline chips move from 11px to 12px through `CHIP_BASE` (intended by UIPASS).

**`LabelPicker.tsx`** (6 hunks, L5-11, L81-83, L111, L122, L128, L146) — UIPASS. Palette swaps red `#ba1a1a` for teal `#0d9488`; "+ Label" -> "Add label"; class normalisation. Take CUST. (`task-form-labels.spec.ts` follows.)

**`AssigneeAvatar.tsx`** (4 hunks, L1-8, L18-22, L41-60) — MEMBERS + UIPASS. Optional `avatarUrl` on the user shape; renders `<img referrerPolicy="no-referrer">` with a per-URL failure fallback to initials; `text-[10px]/[11px]` -> `text-meta`. New import `useState`. Take CUST. Backward compatible: every existing caller (including Pipeline's) passes no `avatarUrl`.

### 3.3 Layout

**`layout/SidebarContext.tsx`** (2 hunks, L1-32, L34-106) — SIDEBAR. Context value grows from `{open, toggle, close}` to `{open, expanded, isDesktop, toggle, close}`; desktop state persisted in `localStorage["solvro.sidebar"]`, default expanded at >= 1280px; `close()` only closes the mobile drawer. Take CUST. `Shell.tsx` is identical in both repos and keeps using `open` (the desktop state), so no Shell change.

**`layout/Sidebar.tsx`** (5 hunks, L1-10, L13-121, L133-151, L153-200) — SIDEBAR. New `NavItem` component (collapsed-rail tooltip, pending badge), groups from `NAV_GROUPS`, Daily Review badge from `useNavBadges().dailyReviewPending`, wordmark `<h1>` -> `<span>`. New imports: `Fragment`, `NAV_GROUPS`, `NavCommand`, `useNavBadges`, `Tooltip*`. Take CUST. No Pipeline hunk in this file (the Pipeline link comes from `NAV_COMMANDS`), but see section 2: the Pipeline nav entry needs a `group` or it vanishes.

**`layout/TopBar.tsx`** (7 hunks) — four features in one file:
- UIPASS: `PAGE_TITLES` removed, breadcrumbs from `matchRoute` / `buildCrumbs` (`@/lib/routeMeta`) with `useCustomer` (L4-7, L24-34, L64-104); status chip hidden below `md` (L101-105); class hunks L133, L183, L202.
- ITOP: `useRunningItopTimer` / `formatElapsed` import (L4), running-timer pill (L20-24, L108-118).
- HELP: `/help` link button (L147-154).
- NOTIF: `import { NotificationBell }` (L8), `<NotificationBell />` (L156).
- Direction: take CUST. The four features are separable hunks if the port is phased (e.g. HELP and NOTIF without ITOP: drop L4, L20-24, L108-118). No SA / Pipeline hunk.

**`layout/RightSidebar.tsx`** (9 hunks) — UIPASS + SA-REMOVAL.
- UIPASS (take): import `fmtDateTime, fmtDay` (L10); baseline timestamps via `fmtDateTime` / `fmtDay(dateToDay(...))` (L47-50, L303); class hunks L184, L245, L337, L351, L374-378.
- SA-REMOVAL (**do not port**): CUST dropped the SA row at L135-138. INTERNAL L136-141 (`{project.sa && (<div>...SA...{project.sa.username}</div>)}`) must stay.
- Direction: take CUST, re-insert the 6-line SA block after the TAM row.

**`CommandPalette.tsx`** (8 hunks) — PALETTE + UIPASS.
- PALETTE: `useLocation` (L3, L49), `buildPaletteActions` import (L19), `"Actions"` group in the type and `GROUP_ORDER` (L22-27, L45), action items (L93-104), deps (L130-131), desktop list max-height fix (L218-228).
- UIPASS: class hunks L196, L199, L231, L249.
- Take CUST. No Pipeline hunk here. Possible adaptation (optional): a "New opportunity" action in `lib/paletteActions.ts` for `pipeline:create` holders.

### 3.4 Task surfaces

**`TaskPanel.tsx`** (63 raw hunks, 914 -> 1090 lines). No SA / Pipeline hunk. Take CUST verbatim.

| Tag | CUST lines | What |
|---|---|---|
| CONFLICT | L14, L23-31 (imports), L37, L156-164, L173-181, L183-191, L205, L232-274, L277-287, L332-338, L524-527, L594-603, L610-613, L971-995 | `conflict` state; `patch()` rewritten to `mutateAsync` with `expected: buildExpected(...)`, 409 `stale_write` handling, `keepMine` / `discardMine`; settle-once title save (`titleSettledRef`); `editBase` snapshot for title and date edits; dates save only changed sides (`datePatchFromEdit`); Escape guard while a modal is open; `<TaskConflictDialog>` mount |
| LIVE | L176-181 | `editBase` exists because the 30 s refresh can land mid-edit (shared with CONFLICT) |
| EPIC | L10, L44 (`useProjectEpics`), L104, L129-143, L152, L200, L491-505 (parent breadcrumb + `parentEpic` chip), L717-768 (Epic row) | Epic select + chip; hidden on subtasks |
| ITOP | L15, L42-43 (`useItopStatus`, `useProject`), L90-100, L770-785 | "iTop ticket" row with `TaskTicketField` |
| MENTION | L1 (`useMemo`), L20, L46 (`useProjectMembers`), L966, L1026-1042, L1072, L1079-1088 | `PanelComments` takes `projectId`; `useAddComment(taskId, projectId)`; `people` list; `CommentBody` / `CommentComposer` replace the inline form |
| MEMBERS | L22, L106, L545-574 | Assignee options marked "(not on project)" + explanatory line |
| COPYLINK | L4, L430-435 | "Copy task link" button |
| SIGNIN | L207-220 | "Task not found" instead of an endless "Loading task…" |
| UIPASS | L12, L21, L23 (imports), L54-69 (removed `STATUS_LABEL`, `STATUS_TONE_CLASS`, `PRIORITY_LABEL`, `fmtShort`), L395-423, L535, L540, L588, L616, L621, L639, L659, L678, L790, L803, L852, L1013 (`danger`), L1044, L1070, L1090 (removed `relativeTime`) | Shared labels / dates / type roles. Visible change: the IN_PROGRESS status button was emerald (`STATUS_TONE_CLASS`), now blue via `TASK_STATUS_TONE_CLASS` |
| OTHER | L16 | `reui/sortable` import moved up (no behaviour change) |

New imports: `CopyLinkButton`, `EpicChip`, `TASK_STATUS_TONE_CLASS`, `TaskConflictDialog`, `TaskTicketField`, `CommentBody`, `CommentComposer`, `fmtAgo`, `fmtRange`, `useAssigneeMembership`, `PRIORITY_LABEL`, `TASK_STATUS_LABEL`, `buildExpected`, `datePatchFromEdit`, `formatConflictRows`, `isSupersededWrite`, `parseStaleWrite`, `withServerTask`, `StaleWrite`, `UpdateTaskInput`, `useItopStatus`, `useProject`, `useProjectEpics`, `useProjectLabels`, `useProjectMembers`.

Phasing note: the tags interleave inside single functions (`patch()`, the meta grid, `PanelComments`). Porting one feature at a time means hand-splitting; if all of CONFLICT / EPIC / ITOP / MENTION / MEMBERS are approved, copy the file once at the end of the last backend dependency. If ITOP is deferred, drop L15, L42 (`useItopStatus`), L90-100 (keep `useProject` only if MENTION is in), L770-785.

**`TaskFormModal.tsx`** (37 raw hunks, 547 -> 707 lines). No SA / Pipeline hunk. Take CUST verbatim.

| Tag | CUST lines | What |
|---|---|---|
| CONFLICT | L1 (`useRef`), L7, L19-27, L32, L35 (`useProjectLabels`), L86, L105-116, L124-126, L208-212, L217-251, L272-313, L359, L650-675 | Diff-only PATCH (`diffTaskForm`) with `expected`; `baseTaskRef`; `keepMine` / `discardMine` (`fieldsToAdopt`); dialog mount |
| EPIC | L5, L34, L85, L97, L137, L150, L165-174, L236 and L263 (`epicId` in payloads), L534-561 | Epic select; cleared and disabled when a parent is chosen |
| MEMBERS | L2, L473-479 | `<AssigneeMembershipNotice>` under the assignee select |
| UIPASS | L3 (`ConfirmModal`), L18, L45-50 (`STATUS_LABEL` removed; `PRIORITY_COLOR` neutral for Low / Medium, `text-chip-amber-text` for High), L104, L316-318, L344-355, L367-369, L419-437, L442, L492 (`emptyLabel="Pick start and due"`), L506, L525, L573, L590, L676-686 | In-app delete confirm replaces `window.confirm`; "Critical path", "Top level", "No section"; shared labels |

### 3.5 Forms

**`ProjectFormModal.tsx`** (21 raw hunks) — MEMBERS + LIVE + UIPASS + SA-REMOVAL.
- MEMBERS (take): `saveErrorMessage` import replaces `ApiError` (L4); new prop `canChangeOwnership = true` (L54-70); edit payload sends `tamId` / `customerId` only when allowed (L135-142); customer select disabled + fallback `<option>` + helper text (L220-242); TAM select gated (L258); error text (L160).
- LIVE (take): seed effect deps `[open, project?.id]` with eslint-disable (L106-112).
- UIPASS (take): `PROJECT_STATUS_LABEL`, `taskStatusOptions` (L5, L25, L253, L279-290), `text-xs` (L281, L311).
- SA-REMOVAL (**do not port; keep INTERNAL**): removed `const [saId, setSaId]` (INTERNAL L71); `setSaId(project.saId ?? "")` (INTERNAL L85); `setSaId("")` (INTERNAL L94); `const sas = users ?? []` and the "SA / TAM dropdowns" comment (INTERNAL L103-106); `saId` in the update payload (INTERNAL L127) and create payload (INTERNAL L139); the whole "Solution Architect" `<Field>` and its `grid grid-cols-2` wrapper around Status (INTERNAL L224-254; CUST L244-256 has Status alone).
- Direction: **apply CUST hunks onto INTERNAL** (the SA removals touch 7 places; re-adding them to a CUST copy is more error-prone than skipping them). Keep the two-column SA + Status grid and only swap `{s.replace("_", " ")}` for `{PROJECT_STATUS_LABEL[s]}`. Open question for the plan: under `canChangeOwnership === false`, is `saId` an ownership field (not sent) or a plain field? CUST gives no answer; the backend port decides (**unverified**).

**`CustomerFormModal.tsx`** (10 raw hunks) — MEMBERS + LIVE. `saveErrorMessage` (L5, L113); prop `canChangeOwner = true` (L18-26); seed deps `[open, customer?.id, user?.id, viewAll]` (L91-98, LIVE); `tamId` omitted for non-owners (L134); reassign confirm gated (L144); select disabled + helper (L237-256). Take CUST. `Customer.solutionArchitect` (free-text) is untouched in both repos.

**`RiskFormModal.tsx`** (9 raw hunks) — UIPASS. Local `CATEGORIES` / `STATUSES` replaced by `riskCategoryOptions` / `riskStatusOptions`; `scoreLevel` becomes a re-export of `riskLevelFromScore` (L257-259, so `daily-review/ProjectCard`, `ProjectOverview`, `ProjectRisks` keep working); `scoreClass` uses chip tokens (L263-268); class hunks. Take CUST.

### 3.6 Kanban (`kanban-v2/`)

**`cards.tsx`** (19 raw hunks) — KANBANPOLISH + EPIC + UIPASS.
- KANBANPOLISH: due label replaces the "N Days" duration (L59-65, L171-185); `getDuration` export deleted (old L226-241; no other importer in INTERNAL — grep); comment count hidden at 0 (L186-191); Critical Path as glyph + sr-only label (L194-203); MEDIUM priority badge hidden (L205); grip visible on hover / focus on fine pointers (L76, L95); card-options button restructure (L109-126).
- EPIC: `EpicChip` import (L21), `epicMap?: Map<number, Epic>` prop (L31, L41-45), chip in the labels row (L66, L128-132).
- UIPASS: `text-meta` / `text-label-caps` (L137, L153, L173, L244).
- New imports: `CRITICAL_PATH_LABEL`, `EpicChip`, `dateToDay`, `fmtDay`, `fmtDue`, `isTaskOverdue` (from `@/lib/formatDate`), `Epic`. Take CUST.

**`SolvroKanban.tsx`** (27 raw hunks) — EPIC + LIVE + SKELETON + UIPASS.
- EPIC: `Epic`, `useProjectEpics` (L45, L51, L158); `filterEpicId` state + `epicMap` (L165-178); filter predicate and `filterActive` (L241-252); badge count (L474-476); Epic select in the popover (L519-540); clear (L548); `epicMap` passed to `TaskCard` (L714, L756).
- LIVE: `useDragActivityGuard` (L44, L212-214); `dragActivity.begin()` / `.end()` in drag start / end / cancel (L323, L332, L342).
- SKELETON: `BoardSkeleton` (L57, L445).
- UIPASS: `COLUMN_LABELS` removed for `TASK_STATUS_LABEL` (L56, L62, L585, L605, L674); `priorityOptions` (L514-518); class hunks (L473, L486, L505, L586, L677).
- Spine note: drag commit math is untouched; the only additions inside the drag callbacks are the three `dragActivity` calls. `adapter.ts` / `commitMapper.ts` unchanged. Take CUST.

**`MobileMoveSheet.tsx`** (7 raw hunks) — UIPASS. `COLUMNS = taskStatusOptions` (shape `{value,label}` instead of `{id,label}`), class hunks. Take CUST.

**`adapter.test.ts`, `commitMapper.test.ts`** (1 hunk each) — EPIC + ITOP (type growth only). Take CUST once `Task` has both fields; if only one feature is ported, add only that field.

### 3.7 Gantt (`gantt-v2/`) — spine

**`SolvroGantt.tsx`** (15 raw hunks, 1756 -> 1767):
- LIVE: `usePointerPressActivity("[data-slot=gantt]", canEdit)` (L12, L349-352).
- EPIC: `useProjectEpics` (L32, L356-357); `epics` passed to the Excel export and added to the effect deps (L897, L950). Requires `lib/gantt/exportExcel.ts` to accept `epics` (lib scope, also spine: `lib/export/` — **INTERNAL-notes guardrail does not apply here, the Excel export has no notes; unverified beyond the diff**).
- SKELETON: `TableSkeleton` (L77, L1415).
- UIPASS: `fmtDateTime` for the baseline-locked time (L13, L497); class hunks (L1229, L1282, L1391, L1401); `confirmTone="danger"` (L1761).
- PIPELINE-REMOVAL (**keep INTERNAL**): comment at CUST L1216-1217 dropped "`OpportunityDetail.tsx`," from "house pattern — see OpportunityDetail.tsx, reui/gantt/gantt-nav.tsx". Comment only; keep INTERNAL's wording.
- Direction: take CUST, restore that one comment line.

**`TreeCells.tsx`** (4 raw hunks) — UIPASS / KANBANPOLISH. `isTaskOverdue` body moved to `lib/formatDate.ts`, re-exported here (L5, L11-13, deleted tail); Dates cell `font-mono text-[11px]` -> `text-meta` (L59). Take CUST.

**`TreeCells.test.ts`** (2 hunks) — UIPASS. Adds a `fmtDateRangeDDMM` describe block, 5 tests (L59-92). Depends on `lib/gantt/geometry.ts` being ported (output format changes from `05 Aug – 06 Aug` to `5 – 6 Aug`).

**`SolvroBar.tsx`** (2 hunks, L118, L441) — UIPASS. `text-[11px]` -> `text-meta` on the bar label and on the hidden measuring span. Both must change together (the measuring span decides label fit); CUST changed both. Take CUST.

### 3.8 Portfolio

**`portfolio/PortfolioCalendar.tsx`** (16 raw hunks) — UIPASS + OVERVIEW. `MONTH_LABELS` -> `MONTH_ABBR` from `lib/formatDate`; rows compacted to `h-8` with name and chip on one line (L209-249, OVERVIEW); tooltip via `fmtRange` (L262); **`fmtDate` export deleted**. INTERNAL `pages/Executive.tsx` imports `fmtDate` from this file (grep, L5) — the pages-scope port must switch it, as CUST's Executive did. Take CUST.

### 3.9 Daily review (`daily-review/`, 10 files)

| File | Hunks | Tags | Notes |
|---|---|---|---|
| `WeekNotesEditor.tsx` | 19 | ITOP + UIPASS | ITOP: `pendingInsert` / `onPendingInsertApplied` props (L62-76, L112-114), `todayTextareaRef` (L121), append effect (L170-190), `textareaRef` threaded into the today row (L375-377, L411-436), `Ref` type import (L16). UIPASS: class hunks, `confirmTone="danger"` (L392). The ITOP props are optional, so the file is safe to take even if ITOP is deferred. |
| `OperationsCard.tsx` | 10 | ITOP + UIPASS | ITOP: header comment (L4-17), `useState`, `DailyItopStrip`, `DailyItopCustomer` (L18-27), `itop?` prop (L36-39), `pendingInsert` state + `hasTodayRow` (L45-51), strip mount (L68-77), editor props (L125-126). UIPASS: L57, L63. If ITOP is deferred, take only the two class hunks. |
| `CustomerGroup.tsx` | 5 | ITOP + UIPASS | ITOP: `itop?` prop passed through (L26, L40-41, L52, L150). UIPASS: `WEEKLY_HEALTH_LABEL` (L25, L124-126). |
| `ProjectCard.tsx` | 18 | UIPASS | `fmtTime`, `riskStatusOptions`, `taskStatusOptions`; local option arrays and `TIME_FMT` removed; `<Select items={...}>` so the trigger shows labels (L240, L278); class hunks. |
| `WeeklySyncRow.tsx` | 6 | UIPASS | `fmtDateTime`, `WEEKLY_HEALTH_LABEL`, `WEEKLY_STATUS_LABEL`; wording "Reflection: Draft". |
| `SyncField.tsx` | 4 | UIPASS | Labels from `lib/labels` (NOT_STARTED reads "None this week" per CHANGELOG; value **unverified** in this scope). `Badge` usage unchanged. |
| `StatsBar.tsx` | 4 | UIPASS | "N / M" -> "N of M" (L25, L39); class hunks. `daily-review.spec.ts` follows. |
| `MidweekSyncModal.tsx` | 4 | UIPASS | class hunks |
| `ReflectionSyncModal.tsx` | 3 | UIPASS | class hunks |
| `WeekStrip.tsx` | 2 | UIPASS | class hunks |

All ten: take CUST. No SA / Pipeline hunk.

### 3.10 Services (`services/`)

**`ServiceCatalogueManager.tsx`** (11 hunks) — UIPASS. `ConfirmModal` replaces `confirm()` for delete (L9, L46, L187, L265, L358-368); class hunks. Take CUST.

**`ServiceMappingList.tsx`** (5 hunks) — UIPASS. Class hunks only. Take CUST.

### 3.11 INTERNAL-only components — stay, with follow-ups

`AssignPicModal`, `CloseDealDialog`, `DealCard`, `MoveReasonModal`, `OpportunityFormModal`, `pipeline/` (all files), `PipelineFlagChips`, `PipelineGuard`, `PipelineImportDialog`, `StageChip` — **PIPELINE-REMOVAL in CUST; all stay untouched by the port**. Follow-ups so they do not fall behind the ported surfaces:

1. `PipelineGuard.tsx`: apply the SIGNIN `userVerified` fix (section 3.1).
2. UIPASS extension (optional, OTHER): hard-coded small text sizes remain in `DealCard` (2), `PipelineImportDialog` (1), `pipeline/OpportunityCard` (1), `pipeline/PipelineAnalyticsSection` (7), `pipeline/PipelineKpiBar` (2), `pipeline/PipelineOverviewPanel` (3), `pipeline/SolvroPipelineKanban` (3) — 19 `text-[9|10|11px]` occurrences; and `uppercase tracking-wider` in 9 files (16 occurrences). No `window.confirm`, no `toLocale*String`, no `confirmTone="warning"` in these files (grep).
3. They import `Tone` / `CHIP_BASE` from `StatusChip` — see 3.2.

## 4. CUST-only components

"Verbatim" = copy unchanged once the listed lib prerequisites exist. "Adapt" = needs an SA / Pipeline-aware edit.

| Component | Tag | Purpose | Props | Mounted in | Deps on other CUST-only code | Copy |
|---|---|---|---|---|---|---|
| `AssigneeMembershipNotice.tsx` (28) | MEMBERS | Line under an assignee picker: "assigning adds this person to the project" | `projectId`, `assigneeId`, `className?` | `TaskFormModal` | `lib/projectMembers` (`ASSIGN_ADDS_MEMBER_NOTICE`), `lib/useAssigneeMembership` | Verbatim, but `useAssigneeMembership` must treat the SA as already on the project (lib scope) |
| `CommentMentions.tsx` (212) | MENTION | `CommentBody` (mention chips, text nodes only) and `CommentComposer` (ARIA combobox `@` picker) | `CommentBody{body, mentionedUserIds, users}`; `CommentComposer{candidates, isPending, error, onSend(body, ids)}` | `TaskPanel` (`PanelComments`) | `lib/mentions` | Verbatim. Adapt at the call site: `people` in `TaskPanel` L1036-1042 is TAM + members; add the project SA so an SA can be mentioned |
| `CopyLinkButton.tsx` (84) | COPYLINK | Icon button copying a URL with an inline live-region confirmation | `label?`, `getUrl?`, `className?` | `TaskPanel`, `customer/AccountHeader`, `pages/ProjectDetail` | `lib/clipboard` (exists in INTERNAL; CUST changed it — lib scope) | Verbatim. Could also be mounted on the opportunity detail page (optional) |
| `customer/AccountHeader.tsx` (208) | CUSTOMERS (+HEALTH, COPYLINK, MEMBERS owner-only) | Customer page header: name, AM / SA / TAM / iTop org, health roll-up, Edit, ⋯ Delete. Exports `sumProjectHealth`, `isProfileComplete`, `AccountHealthTotals` | `customer`, `itopOrgName`, `totals`, `lastUpdate`, `updatesLoaded`, `canMutate`, `canDelete`, `onEdit`, `onDelete`, `deleting` | `pages/CustomerDetail` | `CopyLinkButton`, `lib/formatDate`, `lib/labels`, `ProjectSummary.health` | Verbatim (its "SA" is the free-text `customer.solutionArchitect`, present in both repos). `itopOrgName` can be passed `null` if ITOP is deferred |
| `customer/AccountOverview.tsx` (710) | CUSTOMERS (+HEALTH) | Overview tab: projects data-grid (Project, Status, Progress, Health, Dates, TAM), weekly updates, recent notes, collapsed profile | `customer`, `canMutate`, `onEdit` | `pages/CustomerDetail` | `reui/data-grid/*`, `reui/badge`, `lib/formatDate`, `lib/labels`, `useCustomerNotes` | **Adapt (SA-REMOVAL inside):** INTERNAL's customer project grid has an `sa` column (`pages/CustomerDetail.tsx` L418-426); CUST's grid (L167-229) has none. Re-add an SA column next to TAM |
| `EpicChip.tsx` (33) | EPIC | Epic colour dot + tint chip, truncating | `epic: Pick<Epic,"id"|"title"|"color">`, `compact?`, `className?` | `kanban-v2/cards`, `TaskPanel`, `TaskFormModal`, `pages/views/ProjectList` | `Epic` type | Verbatim |
| `EpicPanel.tsx` (359) | EPIC | Epic detail side panel (`?epic=<id>`): description, status, owner, dates, story list, inline "Add story" | `projectId`, `epicId`, `onClose` | `pages/views/ProjectEpics` | `InlineDateRangeEditor` (spine consumer), `lib/formatDate`, `lib/labels`, `useEpic`, `useUpdateEpic` | Verbatim |
| `layout/NotificationBell.tsx` (206) | NOTIF | Top-bar bell: unread badge, popover list, mark read / all read, navigates to the task | none | `layout/TopBar` | `lib/notificationText`, notification hooks, `ui/popover` (`positionerClassName="z-101"` — prop already exists in INTERNAL's identical `popover.tsx`) | Verbatim |
| `ProjectActivity.tsx` (205) | ACTIVITY | "Recent activity" list with person filter and "Load more" | `projectId`, `tam{id,username}`, `taskIds: ReadonlySet<number>` | `pages/views/ProjectOverview` | `lib/activityText`, `useProjectActivity`, `useProjectMembers` | **Adapt (small):** the person filter options are "Everyone", the TAM, members (L33-38). Add the SA. Also `lib/activityText` should describe `saId` changes if the backend logs them (lib / backend scope) |
| `ProjectHeaderFacts.tsx` (129) | HEALTH | Facts row: Status (phone), Customer, Dates, TAM, Progress, Health | `project: ProjectDetail` | `pages/ProjectDetail` | `project.health`, `lib/formatDate` | **Adapt (SA-REMOVAL):** CUST removed the SA from the project meta row. Add an "SA" `Fact` after TAM (`hidden md:block`), shown when `project.sa` is set |
| `ProjectMembers.tsx` (307) | MEMBERS | `ProjectMembersButton`: TAM + member avatars, Members dialog (add / remove, confirm when the member has tasks, self-removal redirect) | `project`, `canManage` | `pages/ProjectDetail` | `lib/ownerAccess` (`canOwnProject`), `lib/projectMembers`, member hooks, `AssigneeAvatar.avatarUrl` | **Adapt:** show the SA beside the TAM (L50 avatar, L159-161 dialog row), exclude the SA from `memberCandidates` (L108), and decide `canOwnProject` for the SA (L135) |
| `ProjectShare.tsx` (411) | SHARE | `ProjectShareButton`: create / copy-once / list / revoke guest links | `project` | `pages/ProjectDetail` (owner-only) | `lib/shareLinks`, `lib/ownerAccess`, `lib/clipboard`, `SHARE_LINK_STATUS_LABEL`, share hooks, `Chip` from `StatusChip` | Verbatim. Who sees it is decided in `ProjectDetail` (`canOwnProject`) — SA question as above |
| `skeletons/` (7 files) | SKELETON | `BoardSkeleton`, `CardGridSkeleton`, `TableSkeleton`, `ProjectPageSkeleton`, `SkeletonRegion`, `useDelayedFlag` (150 ms delay), `index.ts` | `BoardSkeleton{columns?, cardsPerColumn?, className?, delayMs?}`; `CardGridSkeleton{count?, className?, gridClassName?, announce?, delayMs?}`; `TableSkeleton{rows?, columns?, widths?, className?, announce?, delayMs?}`; `ProjectPageSkeleton{delayMs?}` | `SolvroKanban`, `SolvroGantt`, `pages/Customers`, `ProjectEpics`, `Settings`, `ProjectServices`, `ProjectDetail` | `ui/skeleton` (exists) | Verbatim. Self-contained — the easiest first port. Could also replace the Pipeline board's loading block (optional) |
| `TaskConflictDialog.tsx` (76) | CONFLICT | "Someone changed this task after you opened it" dialog: Now / Yours rows, "Use theirs" / "Keep mine" | `open`, `rows: ConflictRow[]`, `onUseTheirs`, `onKeepMine`, `busy?` | `TaskPanel`, `TaskFormModal` | `Modal` (with `data-autofocus`, so needs the UIPASS `Modal`), `lib/taskConflict` | Verbatim |
| `ui/switch.tsx` (35) | ITOP (first consumer) | Base-UI switch wrapper | Base-UI `Switch.Root` props + `className?` | `admin/ItopTab` | `@base-ui/react/switch` (already a dependency) | Verbatim |
| `admin/ItopTab.tsx` (967) + `itopSettingsDiff.ts` (149) + `itopTimezones.ts` (90) + 2 tests (232, 63) | ITOP | Admin > iTop tab: connection, test, sync, customer->org mapping, user report, webhook secret, timezone, "Actions from Solvro" switch | none | `pages/Admin` | `ui/switch`, `lib/clipboard`, `lib/formatDate`, `adminQueryKeys` hooks | Verbatim. INTERNAL's Admin page keeps its **Pipeline** tab (CUST removed it — PIPELINE-REMOVAL in `pages/Admin.tsx`, pages scope) |
| `itop/` (19 source + 6 test files) | ITOP | Customer Tickets tab (`TicketsTab`, `TicketFilters`, `TicketsTable`, `SyncedAgo`), ticket panel (`TicketPanel`, `TicketLog`, `ActionSheet`, `TicketTimer`, `useTicketTimer`), board (`board/TicketBoard`, `TicketCard`, `boardAdapter`, `dropMapper`), `NewTicketSheet`, `TaskTicketField`, `DailyItopStrip`, presentation helpers | see below | `pages/CustomerDetail` (`TicketsTab`, `TicketPanel`), `TaskPanel` (`TaskTicketField`), `daily-review/OperationsCard` (`DailyItopStrip`), `layout/TopBar` (`useRunningItopTimer`) | `reui/kanban` (vendored, identical), `reui/alert`, `StatusChip` (`Chip`), `Modal`, `lib/formatDate`, iTop hooks in `lib/queries` | Verbatim. No SA / Pipeline reference found (grep of `customer/`; `itop/` **not grepped for SA** — unverified, but it has no project-ownership logic in its imports) |
| `utilization/` (`UtilizationTable` 159, `UtilizationTiles` 73, `utilizationPresentation.ts` 67 + test 71) | UTIL | Weekly Customer x Mon-Sun hours matrix and three tiles | `UtilizationTable{data: UtilizationResponse, scope}`; `UtilizationTiles{tiles, scope}` | `pages/Utilization` | `lib/queries` utilization types | Verbatim. Depends on ITOP time entries; conflicts with the `WorkLogs.tsx` standing decision until the user decides |

`itop/` props (for the pages-scope plan): `TicketsTab{customerId, view, onViewChange, onOpenTicket}`; `TicketPanel{customerId, ticketId, onClose}`; `TicketBoard{customerId, cls?, onOpenTicket}`; `TicketCard{ticket, canDrag, dragging?, onOpen, onAssignToMe?, assigning?}`; `TicketsTable{tickets, baseUrl, scope, onOpen}`; `TicketFilters{counts, scope, cls?, onScopeChange, onClsChange, showScope?}`; `TicketLog{publicLog, privateLog, canAct, onAdd, adding, error}`; `TicketTimer{ticket, myMinutesThisWeek, canAct}`; `ActionSheet{open, onClose, mode, ticketRef, ticketTitle, personName, teams?, busy, error, onConfirm}`; `NewTicketSheet{open, onClose, customerId, onCreated, initialTitle?, initialDescription?}`; `SyncedAgo{customerId, syncedAt, lastSyncOk}`; `TaskTicketField{itopTicketRef, canEdit, customerId, taskTitle, taskDescription, onSave}`; `DailyItopStrip{itop, onAddToNote?}`.

Unit tests that come with CUST-only directories (vitest, pure-function): `admin/itopSettingsDiff.test.ts`, `admin/itopTimezones.test.ts`, `itop/board/boardAdapter.test.ts`, `itop/board/dropMapper.test.ts`, `itop/dailyStripPresentation.test.ts`, `itop/ticketActions.test.ts`, `itop/ticketPresentation.test.ts`, `itop/useTicketTimer.test.ts`, `utilization/utilizationPresentation.test.ts`.

## 5. E2E

`e2e/package.json`, `playwright.config.ts`, `tsconfig.json`, `CLAUDE.md`: **identical** in both repos. INTERNAL has 21 specs, CUST 42. 19 specs are common (13 differ, 6 identical), 23 are CUST-only, 2 are INTERNAL-only.

### 5.1 INTERNAL-only specs — stay

`pipeline-board.spec.ts`, `pipeline-form.spec.ts` — PIPELINE-REMOVAL in CUST; **keep**. Risks from the port (all **unverified**, not run): (a) `Modal` focus trap changes focus on open for the Close-deal / move-reason / form dialogs; (b) the sidebar no longer collapses on desktop navigation and starts expanded at >= 1280px (desktop project is 1440px wide), which changes the main-area width the board renders in; (c) the Pipeline nav link needs a `group`. A grep of both specs for "In Progress", "+ Label", "My Projects", sidebar buttons and "N / M" found no dependence on the reworded strings.

### 5.2 Differing fixtures

**`fixtures/seed.ts`** (3 hunks):
- SA-REMOVAL (**do not port**): header comment about the `sa` id removed (INTERNAL L4-8); `saId: userId` dropped from the project-create body (INTERNAL L129). Keep both — INTERNAL's seeded project should keep an SA so SA visibility stays exercised (`saId` is optional in INTERNAL's `POST /projects` schema, `backend/src/routes/projects.ts:48`).
- EPIC (take): `SeededEpic` + `createEpic()` appended (CUST L235-256).
- Direction: apply the EPIC hunk onto INTERNAL.

**`fixtures/test.ts`** (2 hunks) — SIGNIN. `loginViaUi` split: new exported `submitLoginForm(page, email?, password?)` (CUST L50-71) used by `deep-link.spec.ts`. Take CUST.

### 5.3 Differing specs

| Spec | Hunks | Tag | Change |
|---|---|---|---|
| `auth.spec.ts` | 1 | SIGNIN | +2 tests, new describe "auth: admin guard on a fresh page load" (L48-88), `serviceWorkers: "block"`, routes `**/auth/me` with an 800 ms delay. Needs `localStorage["solvro.user"]` written at sign-in (lib/auth). Take CUST. Suggest a third test for `/pipeline` once `PipelineGuard` is fixed (OTHER) |
| `customer-visibility.spec.ts` | 1 | CUSTOMERS | Comment only (card -> data-grid row). The assertion text is unchanged; whether the locator still matches the new Customers table is **unverified** |
| `daily-review.spec.ts` | 5 | UIPASS + PIPELINE-REMOVAL | UIPASS (take): stat regex and expectations "N / M" -> "N of M" (L21, L62-64, L230, L282). PIPELINE-REMOVAL (keep INTERNAL): two header comments that cite `pipeline-board.spec.ts` as precedent (INTERNAL L26-28, L39-40) were reworded — comment only |
| `date-picker.spec.ts` | 5 | CONFLICT + UIPASS | CONFLICT: two cases now assert **no PATCH** when Apply changes nothing (L327-337, L381-391). UIPASS: comment (L84-85); List due label derived as Today / Tomorrow / "Nd late" / day-first (L787-804); Gantt tree text `5 – 6 <Mon>` instead of `05 <Mon> – 06 <Mon>` (L849). Take CUST. Spine-adjacent (date contract tests) |
| `filters-duplicate-chip.spec.ts` | 2 | UIPASS | Chip values "TODO" -> "To do", "HIGH" -> "High" |
| `gantt-legend.spec.ts` | 1 | UIPASS | "In Progress" -> "In progress" |
| `gantt-parity.spec.ts` | 5 | SA-REMOVAL | `createIsolatedProject` lost its `userId` param and `saId: userId` body field; 3 call sites updated. **Do not port — keep INTERNAL's file as is.** No other hunk in this spec |
| `kanban-dnd.spec.ts` | 5 | EPIC + UIPASS + COPYLINK | EPIC: `createEpic` import (L13), new test G11 (L836-917). UIPASS: "In Progress" -> "In progress" (L201). COPYLINK: live region located by `[id^="DndLiveRegion"]` instead of `getByRole("status")` because the panel now has a second status region (L255-258). One blank-line hunk (L96, OTHER). Take CUST |
| `list-dnd.spec.ts` | 5 | EPIC + UIPASS | EPIC: `createEpic` import, `apiPatchTask` + `closeFilterPopover` helpers (L57-78), new test (L251-304). UIPASS: `IN_PROGRESS` label "Active" -> "In progress" (L141, L159). Take CUST |
| `search.spec.ts` | 2 | PALETTE | Empty-query groups `["Pages"]` -> `["Pages", "Actions"]` (L186) + comment. Take CUST |
| `task-form-labels.spec.ts` | 2 | UIPASS | "+ Label" -> "Add label" |

Identical common specs (no action): the remaining 6 of the 19 shared specs.

### 5.4 CUST-only specs

Test counts are `grep` counts of `test(` declarations (conditional `test.skip(...)` calls inside tests or `beforeEach` are listed separately). Total: **73 tests in 23 specs**. Every spec uses `loginViaUi` (admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`). "seededProject" = the worker-scoped fixture in `fixtures/test.ts` (identical shape in both repos). None contains `saId`.

| Spec | Tag | Tests | Fixtures / seed it needs |
|---|---|---|---|
| `customer-account.spec.ts` | CUSTOMERS (+HEALTH) | 2 | seededProject (`customerId`, `customerName`, `projectId`); `data-testid="account-health-line"` |
| `deep-link.spec.ts` | SIGNIN + COPYLINK | 3 | seededProject; `submitLoginForm` (new fixture export); clipboard permissions via `context.grantPermissions`; clipboard test desktop-only |
| `epics.spec.ts` | EPIC | 1 | seededProject; `getTasks`; `PATCH /api/tasks/:id` |
| `guest-links.spec.ts` | SHARE (+MEMBERS) | 3 | Own setup: `login` (seed), creates users via `POST /api/admin/users` with `role: "TAM"`, customer, project, members, notes, risks, comments, `createSection`, `createTask`, `isoDateOffset`; clipboard permissions; public `/api/public/share/` |
| `help.spec.ts` | HELP | 4 | None beyond login; admin user so gated topics render; asserts an "iTop tickets" topic (**depends on ITOP being in the help content**) and "Weekly Sync"; 1 test branches on the `mobile` project |
| `itop-board.spec.ts` | ITOP | 7 | seededProject; all iTop endpoints mocked with `page.route` (`/api/itop/status`, `/me/token`, `/customers/*/tickets`, `/tickets/*/actions`, `/services`, `/contacts`); `serviceWorkers: "block"`; fixture helpers `center`, `gripFor`, `mouseDrag`, `touchDrag`; desktop-only and mobile-only describes |
| `itop-daily-review.spec.ts` | ITOP | 1 | seededProject; `apiBase`; mocks `/api/itop/status`, `/api/itop/daily`; `serviceWorkers: "block"`; `PATCH /api/projects/:id`, `/api/customers` |
| `itop-task-ref.spec.ts` | ITOP | 4 | seededProject; `createTask`; mocks status, token, by-ref, tickets, services, contacts |
| `itop-ticket-panel.spec.ts` | ITOP | 4 | seededProject; mocks status, token, tickets, ticket detail, actions, log; `serviceWorkers: "block"` |
| `itop-tickets.spec.ts` | ITOP | 2 | seededProject; mocks status + customer tickets; runs desktop + mobile |
| `itop-timer.spec.ts` | ITOP | 4 | seededProject; mocks status, token, tickets, ticket detail, `/time`; `serviceWorkers: "block"` |
| `mentions.spec.ts` | MENTION (+MEMBERS, NOTIF) | 2 | Own setup: `login`, users via `/api/admin/users` (`role: "TAM"`), customer, project, members, tasks |
| `notifications.spec.ts` | NOTIF | 2 | Own setup: `login`, users via `/api/admin/users`, customer, project, tasks, comments |
| `overview.spec.ts` | OVERVIEW (+TASKVIEWS) | 2 | None beyond login; asserts the three tiles and `/tasks?view=overdue` |
| `project-activity.spec.ts` | ACTIVITY (+MEMBERS) | 2 | Own setup: `login`, users via `/api/admin/users`, customer, project, members, tasks |
| `project-header.spec.ts` | HEALTH | 3 | seededProject; `apiBase`; `/api/projects/:id`; 1 test mobile-only |
| `project-members.spec.ts` | MEMBERS (+NOACCESS) | 5 | Own setup: `login`, 3 users via `/api/admin/users` (`role: "TAM"`), customer, project, members, tasks; 1 test skipped on mobile |
| `projects-list.spec.ts` | HEALTH | 1 | seededProject |
| `sidebar.spec.ts` | SIDEBAR | 1 | None beyond login; desktop-only; sets viewport 1440x900; asserts group labels Workspace / Cadence / Insights / System and that `/tasks` is not in the rail |
| `task-conflict.spec.ts` | CONFLICT | 11 | seededProject; `createTask`, `getTasks`; `/api/projects/:id/labels`; `page.route("**/api/tasks/*")` to delay / order saves; 2 describes desktop-only |
| `task-epic-select.spec.ts` | EPIC | 4 | seededProject; `createEpic`, `createTask`, `getTasks` |
| `tasks-views.spec.ts` | TASKVIEWS | 2 | seededProject; `createTask`, `isoDateOffset`; desktop-only |
| `utilization.spec.ts` | UTIL | 3 | None beyond login; mocks `/api/itop/status` and `/api/utilization`; `serviceWorkers: "block"` |

Adaptation notes for the CUST-only specs:
- `help.spec.ts` hard-codes the "iTop tickets" topic; if ITOP is deferred, those two tests must target another topic.
- `overview.spec.ts` only asserts the tiles; INTERNAL's Overview also renders `PipelineOverviewPanel` — no conflict expected (**unverified**).
- `sidebar.spec.ts` does not enumerate links, so a Pipeline link in "Workspace" does not break it.
- The member / share / mention specs create users with `role: "TAM"`; INTERNAL has that role. None exercises an SA, so SA + members interaction has **no e2e coverage** — worth one new INTERNAL-only test (OTHER).

## 6. Counts per tag (this scope)

Files touched, counted once per tag (a file with several features counts under each).

| Tag | Differing components | CUST-only component files | Differing e2e files | CUST-only specs (tests) |
|---|---|---|---|---|
| UIPASS | 38 | — | 7 | — |
| EPIC | 7 | 2 | 3 (incl. `seed.ts`) | 2 (5) |
| ITOP | 7 | 31 (admin 5, itop 25, `ui/switch`) | — | 6 (22) |
| CONFLICT | 2 | 1 | 1 | 1 (11) |
| MEMBERS | 5 | 2 | — | 1 (5) |
| MENTION | 1 | 1 | — | 1 (2) |
| NOTIF | 1 | 1 | — | 1 (2) |
| LIVE | 5 | — | — | — |
| SIGNIN | 4 (+ `PipelineGuard` adaptation) | — | 2 (`auth.spec`, `test.ts`) | 1 (3, shared with COPYLINK) |
| COPYLINK | 1 | 1 | 1 | (shared `deep-link`) |
| SIDEBAR | 3 | — | — | 1 (1) |
| PALETTE | 1 | — | 1 | — |
| SKELETON | 2 | 7 | — | — |
| KANBANPOLISH | 2 | — | — | — |
| HELP | 1 | — | — | 1 (4) |
| OVERVIEW | 1 | — | — | 1 (2) |
| HEALTH | — | 1 | — | 2 (4) |
| CUSTOMERS | — | 2 | 1 (comment) | 1 (2) |
| ACTIVITY | — | 1 | — | 1 (2) |
| SHARE | — | 1 | — | 1 (3) |
| UTIL | — | 4 | — | 1 (3) |
| TASKVIEWS | — | — | — | 1 (2) |
| NOACCESS | — | — | — | (inside `project-members`) |
| SA-REMOVAL (do not port) | 2 (`RightSidebar`, `ProjectFormModal`) + 3 CUST-only components to adapt (`AccountOverview`, `ProjectHeaderFacts`, `ProjectMembers`; smaller: `ProjectActivity`, `TaskPanel` mention list) | — | 2 (`seed.ts`, `gantt-parity.spec`) | — |
| PIPELINE-REMOVAL (do not port) | 2 (`StatusChip` exports, `SolvroGantt` comment) + 10 INTERNAL-only entries that stay | — | 1 (`daily-review.spec` comments) + 2 INTERNAL-only specs that stay | — |

## 7. Suggested order for this scope

1. **Foundations (UIPASS core):** `index.css` `text-meta`, `lib/labels`, `lib/formatDate`, `hooks/useDialogFocus` (lib scope), then the pure-UIPASS components: `Tabs`, `ConfirmModal`, `Modal`, `InstallBanner`, `PriorityBadge`, `LabelChip`, `StatusChip` (keep exports), `LabelPicker`, `MobileMoveSheet`, `RiskFormModal`, `SolvroBar`, `TreeCells`(+test), `PortfolioCalendar`, `services/*`, the 7 pure-UIPASS daily-review files, `DateField`, `DateRangeField` (spine review). Specs: `filters-duplicate-chip`, `gantt-legend`, `task-form-labels`, `daily-review`, UIPASS hunks of `date-picker` / `kanban-dnd` / `list-dnd`.
2. **SKELETON** (`skeletons/`), **SIGNIN** (3 guards + `PipelineGuard`, `auth.spec`, `fixtures/test.ts`), **SIDEBAR** (`SidebarContext`, `Sidebar`, `ui/tooltip`, `sidebar.spec`) — independent of the backend except `useNavBadges`.
3. **EPIC** (`EpicChip`, `EpicPanel`, kanban files, `SolvroGantt` epics hunk, test factories, `seed.ts` `createEpic`, `epics.spec`, `task-epic-select.spec`, G11, List test).
4. **MEMBERS / CONFLICT / LIVE / COPYLINK** (form modals, `AssigneeAvatar`, `AssigneeMembershipNotice`, `ProjectMembers`, `TaskConflictDialog`, `CopyLinkButton`, drag-activity hunks) — then `TaskPanel` and `TaskFormModal` are copied once.
5. **ACTIVITY / NOTIF / MENTION / SHARE / HELP / PALETTE** (`ProjectActivity`, `NotificationBell`, `CommentMentions`, `ProjectShare`, `TopBar`, `CommandPalette`).
6. **CUSTOMERS / HEALTH / OVERVIEW / TASKVIEWS** (`customer/`, `ProjectHeaderFacts`) — with the SA adaptations.
7. **ITOP / UTIL** last, after the user decision on the `WorkLogs.tsx` standing rule (`admin/`, `itop/`, `utilization/`, `ui/switch`, ITOP hunks in `TopBar`, `TaskPanel`, `OperationsCard`, `CustomerGroup`, `WeekNotesEditor`).

`TaskPanel.tsx`, `TaskFormModal.tsx` and `TopBar.tsx` carry several features each; if the phases above land separately, these three need hand-split intermediate versions. Copying each once, after its last feature's backend exists, avoids that.

## 8. Risks

1. **SA is absent from every new CUST surface.** Ownership (`canOwnProject`), member candidates, the Members dialog, the header facts row, the customer project grid, the activity filter and the mention list all assume "TAM + members". Without adaptation an SA loses visibility in the UI or is treated as a non-owner. Needs a product decision on SA-as-owner.
2. **Pipeline disappears from navigation / titles** unless `lib/navCommands` gives it a `group` and `lib/routeMeta` gets `/pipeline` entries — the new `Sidebar` and `TopBar` read only those.
3. **`StatusChip.tsx` exports** (`Tone`, `CHIP_BASE`): a verbatim copy of CUST's file breaks 5 INTERNAL Pipeline importers.
4. **Deleted exports with INTERNAL importers:** `fmtDate` from `PortfolioCalendar` (used by `pages/Executive.tsx`). `getDuration` (cards) and `pickContrast` have no other importer.
5. **iTop / Utilization vs. the `WorkLogs.tsx` standing decision** — 31 + 4 component files and 7 specs (25 tests) wait on a user decision; `help.spec.ts` and `TopBar` / `TaskPanel` / daily-review hunks are coupled to it.
6. **`Modal` focus trap reaches Pipeline dialogs**; the two pipeline specs were not run against it (unverified).
7. **Spine touches needing instant review:** `DateRangeField.tsx`, `DateField.tsx`, `gantt-v2/SolvroGantt.tsx`, `TreeCells.tsx`, `SolvroBar.tsx`, `kanban-v2` tests (adapter / commitMapper themselves are unchanged), plus `index.css` (DESIGN.md sync trigger). `reui/` is untouched.
8. **Visible wording / colour changes users will notice:** IN_PROGRESS status button in the task panel turns blue (was emerald); "Med" -> "Medium"; label chips become tinted; "+ Label" -> "Add label"; red removed from the label palette; Kanban cards lose the duration and the Medium badge.
9. **Plan documents cited in code comments** (`itop-integration*.md`, `epics-spec.md`, `collaboration-and-sharing.md`) are missing in INTERNAL `docs/archive/plans/`.
10. Nothing here was compiled or run. Type-level fit of CUST components against INTERNAL's `lib/queries.ts` (which keeps `saId` / `sa` and Pipeline hooks) is **unverified**.
