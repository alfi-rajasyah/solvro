# Spec — Port the Help page (CUST → INTERNAL)

Research date 2026-10-02. Read-only. CUST = /home/solvro-internal/solvro-cust (HEAD 127f316), INTERNAL = /home/solvro-internal/solvro (HEAD 154b42f, develop).
Paths below are relative to each repo root unless prefixed. "UNVERIFIED" marks anything not confirmed in code.

## 1. How Help works in CUST

### 1.1 History
- 5caef7f (2026-09-24) "Add an in-app Help page" — 7 files: CHANGELOG.md (+6), e2e/tests/help.spec.ts (47), frontend/src/App.tsx (+2), frontend/src/components/layout/TopBar.tsx (+10), frontend/src/lib/helpContent.test.ts (57), frontend/src/lib/helpContent.ts (488), frontend/src/pages/Help.tsx (130). Merged as CUST PR #12.
- 8b9fa3a (2026-09-25, Epics, PR #14) — +1 bullet in `projects` topic ("Epics: group top-level tasks…").
- 489b0a4 (2026-09-29, UI pass, PR #15) — helpContent: palette actions sentence (getting-started), Overview tiles rewritten (3 tiles + attention-list counts), Kanban column casing "To do / In progress", shortcut "search results or actions"; Help.tsx kbd `text-[11px]` → `text-meta`; added `help: "Help"` to new lib/routeMeta.ts.
- NOT reflected in CUST help (shipped after, 2026-09-29/30): Copy link buttons (3a19e75), deep links through sign-in (fc02e6f), project members (af9a362, PR #18), conflict warning (2d9b0a8, PR #19), activity log + notifications + @mentions (476288e, PR #20), guest links (eadc065, PR #22). CUST's own Help is therefore stale for those; INTERNAL must write those topics fresh (see §3.B).

- Fork context: CUST = "Initial import" 10c0b16 (2026-09-21) of a pre-Pipeline-redesign snapshot, then 1a3e905 (2026-09-22) **removed the Pipeline module AND the project SA owner** (`Project.saId`, SA arm of projectVisibilityFilter, SA seed role). INTERNAL kept both and rebuilt Pipeline on 2026-09-25 (6034514, PR #182). Everything CUST shipped 09-22..10-01 (iTop, Utilization, Help, Epics, UI pass, collaboration) is absent from INTERNAL.
- CUST help is itself already stale in places: e.g. it quotes `"+ Label"` (helpContent.ts:205) but CUST's LabelPicker now says "Add label" (CUST LabelPicker.tsx:83, changed by the UI pass); it quotes `"View projects →"` which no longer exists in CUST code (0 hits) but does in INTERNAL (pages/Customers.tsx). Port from the code, not blindly from CUST strings.

### 1.2 Help.tsx (CUST frontend/src/pages/Help.tsx, 130 lines)
- Imports (Help.tsx:1-5): `react` (useEffect, useState), `react-router-dom` (Link, useLocation), `@/components/EmptyState`, `@/lib/auth` (hasPermission, useAuth), `@/lib/helpContent` (filterHelpTopics, HelpTopic). **Only `@/lib/helpContent` is missing in INTERNAL**; INTERNAL's EmptyState (frontend/src/components/EmptyState.tsx:6-11, props icon/title/message/action) and auth (lib/auth.tsx:59 `hasPermission`) are signature-compatible.
- Header comment (Help.tsx:7-10): "Reached from the TopBar's help button only (no sidebar or ⌘K entry, by user decision)."
- Layout: `mx-auto max-w-5xl space-y-6` wrapper; H1 `font-display text-2xl font-bold text-on-surface` "Help" + subtitle "How to use Solvro — every page and feature available to you." (Help.tsx:24-31).
- **Search** (Help.tsx:14-15, 32-39): local `useState` query; `<input type="search" aria-label="Search help" placeholder="Search help…">`; topics = `filterHelpTopics((p) => hasPermission(user, p), query)` recomputed every render (no debounce, no URL sync). Empty result → `<EmptyState icon="search_off" message={`No help topics match "${query.trim()}".`}>` (Help.tsx:42-43).
- **TOC** (Help.tsx:46-60): `<nav aria-label="Help topics" className="hidden w-48 shrink-0 md:block">`, sticky list of `<a href="#id">` with Material Symbol icon + title. Hidden below `md` (phone has no TOC).
- **Deep link** (Help.tsx:17-21): `useLocation().hash`; `useEffect(() => document.getElementById(hash.slice(1))?.scrollIntoView(), [hash])` because sections render after mount, so the browser's native hash scroll misses. Sections carry `scroll-mt-4`.
- **HelpSection** (Help.tsx:73-130): `<section id aria-labelledby>` card `rounded-sm border border-outline-variant bg-surface-container-low p-5`; icon (`text-primary`) + H2 `text-lg font-semibold`; optional `Open {title} →` `<Link to={route}>` (Help.tsx:87-94); summary `<p>`; each entry = H3 `text-label-caps uppercase text-on-surface-variant` + `list-disc` bullets; optional shortcuts `<dl>` with `<kbd>` chips `font-mono text-meta` (was `text-[11px]` before 489b0a4).
- No markdown, no links inside bullet text (plain strings), no per-topic deep-link anchor buttons.

### 1.3 Shell wiring in CUST
- Route: CUST App.tsx:11 `import { Help } from "@/pages/Help";` and App.tsx:83 `<Route path="help" element={<Help />} />` inside the AuthGuard+Shell layout route; **no guard** (every signed-in user, incl. PENDING).
- TopBar button: CUST components/layout/TopBar.tsx:147-154 — `<Link to="/help" aria-label="Help" title="Help" className="flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><span className="material-symbols-outlined text-[20px]">help</span></Link>`, placed after the mobile search icon button and before `<NotificationBell />` and the theme toggle. Original 5caef7f placed it before the theme toggle (no bell then). TopBar.tsx:69 comment notes the 375px cluster "search/help/theme/user".
- routeMeta: CUST lib/routeMeta.ts:35-48 `STATIC_TITLES` has `help: "Help"` (added by the UI pass 489b0a4, not by the Help commit); routeMeta.test.ts:60 `expect(routeTitle("/help")).toBe("Help")`. 5caef7f itself did NOT touch any title map — in CUST at that time the TopBar title for /help would have been the TopBar fallback (UNVERIFIED what it was in CUST pre-UI-pass; in INTERNAL today it would be "Solvro", see §4.2).
- navCommands / palette: **no entry** (deliberate). CUST lib/navCommands.ts:23-40 has no /help. CommandPalette has no help action.
- Sidebar: no entry.

### 1.4 Permission gating (exact mechanism)
- `HelpTopic.requires?: string` — "Permission required to see the topic; "*" restricts to admin wildcard." (helpContent.ts:30-31).
- `filterHelpTopics(has, query)` (helpContent.ts:473-489): `if (t.requires && !has(t.requires)) return false;` BEFORE the query match, so a query can never reveal a gated topic. Help.tsx injects `(p) => hasPermission(user, p)`; `hasPermission` returns true for `"*"` holders on any string, and since the check is `perms.includes("*") || perms.includes(permission)`, `requires: "*"` passes only for users who literally hold `"*"` — i.e. "admin only".
- Gated topics in CUST: `executive` (`requires: "report:executive"`) and `admin` (`requires: "*"`). Everything else ungated. Gating is topic-level only — no entry- or bullet-level gating.
- Query match: case-insensitive substring over title, summary, every entry title + point, and shortcut actions (not keys, not icon/id).
- Gating mirrors the sidebar: the unit test forces each routed topic's `requires` to equal the NAV_COMMANDS entry for the same `to`.

### 1.5 helpContent.ts data shape (CUST frontend/src/lib/helpContent.ts:11-34, quoted)
```ts
export interface HelpEntry {
  title: string;
  /** Rendered as a bullet list. */
  points: string[];
}

export interface HelpShortcut {
  keys: string[];
  action: string;
}

export interface HelpTopic {
  /** Anchor id — /help#<id> deep-links to the topic. */
  id: string;
  title: string;
  icon: string;
  summary: string;
  /** Page the topic describes; rendered as an "Open …" link. */
  route?: string;
  /** Permission required to see the topic; "*" restricts to admin wildcard. */
  requires?: string;
  entries: HelpEntry[];
  shortcuts?: HelpShortcut[];
}
export const HELP_TOPICS: readonly HelpTopic[] = [ ... ];
```
- Pure module, no React import (header helpContent.ts:1-5) so it runs in the node-env Vitest config; same pattern as navCommands.ts. Rule in header: "Keep every UI string quoted here identical to the label in the code it describes — when a feature's label changes, update its entry in the same change."
- Deliberately absent (helpContent.ts:7-9): the /tasks page, note visibility, backend-only operations, customer page placeholder tabs (Topology, Organization Structure, Documents).
- **There is no `group` field** — topics are a flat ordered list (the "group" column in §2 is my descriptive grouping only).

### 1.6 helpContent.test.ts invariants (CUST, 57 lines, 8 tests)
`describe("filterHelpTopics")`:
1. none-permission user: ids exclude `executive`, `admin`; include `getting-started`.
2. wildcard user sees all: `toHaveLength(HELP_TOPICS.length)`.
3. `report:executive` only: includes `executive`, excludes `admin`.
4. query `"RISK REGISTER"` (no perms) returns exactly `["projects"]`; `"zzz-no-match"` returns `[]`. (Brittle: any new topic mentioning "risk register" breaks it.)
5. query `"Project Override"` with no perms returns `[]` (query never reveals a gated topic).
`describe("HELP_TOPICS")`:
6. unique ids.
7. every topic with `route` links to a NAV_COMMANDS entry (`nav` defined) AND `t.requires === nav.requires`.
8. every NAV_COMMANDS entry has a topic whose route equals `nav.to`.
→ Tests 7+8 couple Help to the sidebar mechanically: in INTERNAL, NAV_COMMANDS contains `/pipeline` (`requires: "pipeline:view"`, INTERNAL lib/navCommands.ts:24), so **a Pipeline topic with `route: "/pipeline", requires: "pipeline:view"` is mandatory from day one**. Any later PR that adds a sidebar page (e.g. Utilization) must add its topic in the same PR or test 8 fails.

### 1.7 e2e/tests/help.spec.ts (CUST, 47 lines, 4 tests; runs on desktop + mobile projects → 8 executions)
Uses `test, expect, loginViaUi` from `../fixtures/test` (exists in INTERNAL: e2e/fixtures/test.ts:12,23,40). Seeded QA user is admin, so gated topics render.
1. "the TopBar help button opens the Help page": click `getByRole("link", {name:"Help"})` → URL `/\/help$/`; H1 "Help" visible; H2 "Getting started" and H2 "Admin" visible.
2. "help search narrows the topics and shows an empty state": fill searchbox "Search help" with "personal token" → H2 "iTop tickets" visible, H2 "Weekly Sync" count 0; fill "zzz-no-match" → text `No help topics match "zzz-no-match".` visible.
3. "a /help#<topic> link scrolls to that topic": goto `/help#itop` → H2 "iTop tickets" in viewport, H2 "Getting started" not in viewport.
4. "the topic list shows on desktop and hides on a phone": on `mobile` project the `navigation "Help topics"` is hidden; on desktop clicking TOC link "Weekly Sync" → URL `/help#weekly-sync$` and that H2 in viewport.
→ Tests 2 and 3 depend on the iTop topic. For an INTERNAL early ship, retarget to a Pipeline topic (e.g. search "Waiting Sales input" → H2 "Pipeline" visible, "Weekly Sync" hidden; deep link `/help#pipeline`). The Pipeline topic must sit far enough down the page that "Getting started" leaves the viewport.

## 2. Topic inventory — every topic in CUST lib/helpContent.ts (15 topics)

Verdict key: **KEEP** = true in INTERNAL today, copy as-is. **DEPENDS(x)** = true once CUST feature x is ported; land the text with that PR. **EDIT** = will still differ after the full port (Pipeline, SA/SALES, SA ≠ owner, role list, sidebar). **DROP** = customer-packaging only.
Most topics are mixed at bullet level, so each row gives a topic verdict plus a bullet ledger. Line numbers are CUST helpContent.ts.

| # | id | Title | Group (descriptive) | Gating | Documents | Verdict |
|---|---|---|---|---|---|---|
| 1 | getting-started (37-77) | Getting started | Basics | none | sign-in, navigation, appearance/PWA, roles | **EDIT** (+ DEPENDS UI-pass, Members) |
| 2 | overview (78-96) | Overview | Workspace page `/overview` | none (nav: none) | Overview page | **DEPENDS(UI pass)** + **EDIT** (Pipeline panel) |
| 3 | projects (97-133) | Projects | Workspace page `/projects` | none | project CRUD, tabs, Context panel, baseline, export | **KEEP** core + DEPENDS(Epics, Members) + **EDIT** (SA field / owner rules) |
| 4 | project-views (134-177) | Project views | Project | none, no route | List/Kanban/Gantt/Timeline | **KEEP** + DEPENDS(UI pass) for Kanban casing |
| 5 | tasks (178-211) | Tasks | Project | none, no route | task form, task panel, subtasks, labels, comments | **KEEP** + DEPENDS(iTop, UI pass, collab) |
| 6 | risks (212-229) | Risks | Project | none, no route | risk register | **KEEP** |
| 7 | customers (230-262) | Customers | Workspace page `/customers` | none | customers, customer page, services | **KEEP** + DEPENDS(iTop, UI pass customer redesign) + EDIT(owner wording post-Members) |
| 8 | daily-review (263-297) | Daily Review | Cadence page `/daily-review` | none | daily notes, week nav, sync entry points, iTop strip | **KEEP** + DEPENDS(iTop, Members) |
| 9 | weekly-sync (298-324) | Weekly Sync | Cadence page `/weekly-sync` | none | mid-week + reflection updates, tables | **KEEP** |
| 10 | itop (325-357) | iTop tickets | Integration | none, no route | tokens, ticket table/board/panel, timer, task links | **DEPENDS(iTop)** |
| 11 | utilization (358-375) | Utilization | Insights page `/utilization` | none (nav: none) | hours per customer/day from iTop | **DEPENDS(iTop Utilization; Work Logs → Utilization)** |
| 12 | executive (376-393) | Executive | Insights page `/executive` | `report:executive` | org roll-up | **EDIT** (Pipeline analytics) + DEPENDS(UI pass wording check) |
| 13 | settings (394-418) | Settings | System page `/settings` | none | appearance, profile, password, iTop token, catalogue | **KEEP** + DEPENDS(iTop) |
| 14 | admin (419-452) | Admin | System page `/admin` | `*` | users/roles, sign-in, override, iTop | **EDIT** (Pipeline tab, reserved roles, SALES) + DEPENDS(iTop) |
| 15 | shortcuts (453-466) | Keyboard shortcuts | Basics | none | keyboard shortcuts | **KEEP** + DEPENDS(UI pass, iTop) |

Counts (topic-level primary verdict): KEEP 6 (project-views, tasks, risks, weekly-sync, settings, shortcuts — each with small DEPENDS bullets) · DEPENDS 3 (overview, itop, utilization) · EDIT 4 (getting-started, projects, executive, admin) · mixed KEEP/DEPENDS 2 (customers, daily-review) · DROP 0. Bullet-level DROP: none required; nothing in CUST help is customer-packaging-only (the "delivery workspace for TAMs" framing is EDIT, not DROP).

### 2.1 Bullet ledger per topic (INTERNAL evidence)

**1 getting-started — EDIT**
- summary "Solvro is the delivery workspace for TAMs: projects, tasks, daily notes, and weekly customer updates" → EDIT: add SAs and the sales Pipeline (root CLAUDE.md Product: "TAMs (delivery) and SAs (sales pipeline …)").
- Sign in (3 bullets) → KEEP: "Admin sign-in (password)" and "This account has been deactivated" in INTERNAL pages/Login.tsx; "Needs role" in pages/Admin.tsx; PENDING auto-provisioning in backend/prisma/seed.ts:9-12.
- Find your way around: sidebar collapse → KEEP (layout/Sidebar.tsx:55 "Collapse sidebar"/"Expand sidebar"); ⌘K bullet → **DEPENDS(UI pass palette actions)** — INTERNAL CommandPalette has no actions (no "New project"/"New customer"/"Add task" hits in components/CommandPalette.tsx); the pre-UI-pass wording (5caef7f) "jump to a page, project, task, or customer. Type at least 2 characters." is KEEP today (CommandPalette.tsx:62 `length >= 2`). Breadcrumb "Projects / <project name>" + status → KEEP (layout/TopBar.tsx:62-75). Avatar menu Settings + "Sign out" → KEEP (TopBar.tsx:155-176).
- Appearance and install → KEEP ("Install Solvro" components/InstallBanner.tsx:84; "Add to Home Screen" :101).
- Who can do what → **EDIT**: (a) "Manage projects"/"Manage tasks" labels KEEP (lib/auth.tsx:41,43); (b) add Pipeline permissions (auth.tsx:44-49); (c) visibility sentence "You see projects where you are the TAM and every project of a customer you own" is WRONG for INTERNAL today — INTERNAL also matches `saId` (backend/src/lib/visibility.ts:21-29: tamId, saId, customer.tamId); after Members port add "or a member"; (d) add a role list: ADMIN, SA, SALES, TAM, STAKEHOLDER, PENDING (backend/prisma/seed.ts:13-29) — note frontend `BUILTIN_ROLES` (lib/auth.tsx:16) omits SALES (cosmetic gap, see open questions).

**2 overview — DEPENDS(UI pass) + EDIT**
- "Three tiles: Overdue and Due this week … Open risks opens the Daily Review" → DEPENDS(UI pass "overview tiles"). INTERNAL today shows 4 KPIs: "Active Projects", "Open Tasks", "Completed", "Total tasks" (pages/Overview.tsx:66-87) = the 5caef7f wording "Counters for Active Projects, Open Tasks, Completed, and Total tasks." → use that until the UI pass lands.
- "Projects needing attention … with overdue-task and open-risk counts" → DEPENDS(UI pass); INTERNAL today: up to 6, overdue first, "Nd overdue", "View all →" (Overview.tsx:123-160) = 5caef7f wording, KEEP.
- "Portfolio timeline" year calendar → KEEP (Overview.tsx:98). "Recent notes" last 7 days → KEEP (Overview.tsx:175, 243). Administrative project exclusion → KEEP (ProjectFormModal "Administrative project").
- **EDIT (INTERNAL-only)**: add bullet for the Pipeline panel shown only with `pipeline:view` (Overview.tsx:50; components/pipeline/PipelineOverviewPanel.tsx:37-96): header "Pipeline" + "View pipeline →", tiles "Pipeline Value", "Active Deals", "Won This Month", "On Hold", plus a per-stage distribution bar.

**3 projects — KEEP core**
- Create/edit: "New project", Name + Customer required → KEEP (ProjectFormModal.tsx:183,204 `required`). **EDIT**: INTERNAL form also has "Solution Architect" and "Technical Account Manager" pickers and Status (ProjectFormModal.tsx:226,241,257) — mention the SA field; CUST removed SA from projects. WIP limit → KEEP ("WIP limit — leave empty for none", :273). Administrative project → KEEP. "Edit project"/"Delete project" → KEEP (pages/ProjectDetail.tsx:163,172) — after Members port, **EDIT**: delete and TAM/customer changes are owner-only, and an SA on the project is not an owner (user decision 2026-10-02). Customer filter chip → KEEP (Projects.tsx:48-59 "Customer" field on vendored reui filters, operator "is", reui/filters.tsx:169 — rendered text "Customer is …" UNVERIFIED by eye) and "View projects →" on a customer card → KEEP in INTERNAL (pages/Customers.tsx), but CUST's UI-pass customer redesign removed it → re-check when the UI pass ports.
- Project tabs: Overview/List/Kanban/Gantt/Timeline/Risks/Services → KEEP (ProjectDetail.tsx:25-31). Overview panels "Needs attention", "Status breakdown", "Top open risks", "Notes", Progress S-Curve (views/ProjectOverview.tsx:118-357) → KEEP. "Epics: …" bullet → **DEPENDS(Epics)** (0 "Epics" hits in INTERNAL src).
- Context panel/baseline: "Context" (ProjectDetail.tsx:191), "Lock baseline", "Baseline as-of date", "Reset baseline", "Export schedule" with Excel / PDF / "View" (layout/RightSidebar.tsx:225-251) → KEEP. Slip → KEEP (ProjectOverview.tsx).
- Add after ports (not in CUST help): Copy link (DEPENDS collab quick-wins 3a19e75), members avatars/dialog (DEPENDS Members), Share/guest links (DEPENDS guest links), Recent activity (DEPENDS activity log).

**4 project-views — KEEP**
- List: "Add section", "Add task", "Reorder sections" (views/ProjectList.tsx; SectionReorderModal) KEEP; priority flag cycles Low→Medium→High (ProjectList.tsx:45,53,243, title "Click to cycle priority" :813) KEEP; Urgent from form KEEP.
- Kanban: columns → **DEPENDS(UI pass)** for casing: INTERNAL "To Do"/"In Progress" (kanban-v2/SolvroKanban.tsx:59-60), CUST "To do"/"In progress". "Filter" assignee/priority (SolvroKanban.tsx:163-229), "Add task here", WIP amber, "Card options" + "Move to" sheet (kanban-v2/cards.tsx, MobileMoveSheet.tsx) KEEP.
- Gantt: Day/Week/Month/Quarter (gantt-v2/SolvroGantt.tsx:131-134), "Color by", "Baseline", "+ Task", dependency drag, row menu with Add subtask/Duplicate/Critical Path (SolvroGantt.tsx:100,1592) KEEP; holiday shading KEEP (backend routes/holidays.ts; exact gantt shading UNVERIFIED by eye).
- Timeline: sorted by start, one-click status buttons (views/ProjectTimeline.tsx:50,228) KEEP.

**5 tasks — KEEP**
- Create: "+ Task" in Gantt, only title required KEEP. Panel: Esc closes (TaskPanel.tsx:143), Type Task/Milestone (:533-543), "Task options" with "Duplicate task"/"Delete task" (:364-383), Critical Path KEEP.
- Subtasks drag-reorder (TaskPanel.tsx:15 Sortable) KEEP. Label: INTERNAL button is "+ Label" (LabelPicker.tsx:82) — KEEP now; **DEPENDS(UI pass)** → "Add label". "Write a comment…" (TaskPanel.tsx) KEEP; comment counts on Kanban cards (kanban-v2/cards.tsx:157-162) KEEP.
- "Link an iTop ticket …" → **DEPENDS(iTop)**.
- Add after ports: Copy task link, conflict dialog "Someone changed this task after you opened it" (DEPENDS conflict warning 2d9b0a8), @mentions (DEPENDS activity/notifications PR), Epic select (DEPENDS Epics), assigning adds the assignee as a member (DEPENDS Members).

**6 risks — KEEP**: "Add risk" (views/ProjectRisks.tsx, RiskFormModal.tsx), score bands ≤8 Low / ≤15 Medium (RiskFormModal.tsx:268-274; ProjectRisks.tsx:106), Mitigation/Contingency plans, Open/Mitigated/Closed (RiskFormModal.tsx:22).

**7 customers — KEEP + DEPENDS**
- Create: "New customer", Name + Description required, Account Manager free text, Solution Architect user picker (CustomerFormModal.tsx:109-220) KEEP. TAM owns customer + access-loss warning KEEP (visibility.ts:60-80). Delete keeps projects KEEP (UNVERIFIED in code; shared pre-fork behavior).
- Customer page: Overview checklist + services + 52-week weekly updates + projects (pages/CustomerDetail.tsx:568-612, 825-851) KEEP; Services KEEP; "Tickets" → **DEPENDS(iTop)**. INTERNAL tabs also include placeholders Topology/Organization Structure/Documents (CustomerDetail.tsx:43-47) — omitted by design. **DEPENDS(UI pass)**: CUST redesigned the customer account page (AccountHeader/AccountOverview) — re-verify bullet wording then.
- Services and tools: "Add all subscribed" (views/ProjectServices.tsx) KEEP; catalogue in Settings KEEP.
- Post-Members EDIT: owner-only customer changes (changing owner, delete) — SA is not an owner.

**8 daily-review — KEEP + DEPENDS**: "Save note" (WeekNotesEditor.tsx), ⌘/Ctrl+Enter (:397), "Mark reviewed" (ProjectCard.tsx), "Operations" card, "Show week", day strip (WeekStrip.tsx), auto-collapse (CustomerGroup.tsx:50), "No customer" (UnassignedGroup.tsx), "Mid-week sync"/"Reflection sync" (WeeklySyncRow.tsx) KEEP. "iTop today" strip + "Add to note" → **DEPENDS(iTop)**. Scope note: INTERNAL Daily Review lists only the caller's TAM projects + owned customers (SA-only projects are excluded, backend/src/routes/dailyReview.ts:225-240); after Members port add "and projects you are a member of" (CUST CHANGELOG "Daily Review includes member projects").

**9 weekly-sync — KEEP**: "Draft from Mon–Wed notes" (MidweekSyncModal.tsx), "Draft from this week", "Save draft", "Mark done" (ReflectionSyncModal.tsx), "Save mid-week", Health, achievements/highlights (migrations 20260909030050_weekly_highlights, 20260909180922_weekly_achievements present in INTERNAL), default table by weekday (pages/WeeklySync.tsx:55-75), "Needs a manager decision", "Copy as table" — all present.

**10 itop — DEPENDS(iTop)** whole topic (0 hits in INTERNAL for "Refresh from iTop", "Open in iTop ↗", "New ticket", "Start timer", "Actions from Solvro").

**11 utilization — DEPENDS(Utilization / Work Logs → Utilization)** whole topic; route `/utilization` must be added to NAV_COMMANDS in the same PR (test 8). INTERNAL today: `/work-logs` placeholder outside NAV_COMMANDS (navCommands.ts:20-23) — no topic needed until then (CUST help also omits placeholders).

**12 executive — EDIT**: "Overdue Projects" (pages/Executive.tsx), "Portfolio Timelines" Calendar/List (Executive.tsx:199-200), administrative excluded → KEEP. **EDIT**: add Pipeline analytics (only with `pipeline:view`, Executive.tsx:57-89): "Pipeline analytics" heading, Conversion funnel, Top PIC by won value, PIC performance (PIC, Active value, Won, Won value, Lost / Cancelled, Win rate), Created vs. won (12 months), Workload heatmap, Close reasons by stage — <year>, Win rate — <year> (components/pipeline/PipelineAnalyticsSection.tsx:92-658). Topic gate stays `report:executive` (ExecutiveGuard.tsx:7). After Utilization port: "By TAM"/"By customer" mention belongs in the Utilization topic, not here.

**13 settings — KEEP + DEPENDS**: Appearance, Profile ("Username, email, and role can only be changed by an Admin."), "Change password", "Service Catalogue" gated on `project:write` (pages/Settings.tsx:55-100) KEEP. iTop token → **DEPENDS(iTop)**.

**14 admin — EDIT**: INTERNAL tabs "Users", "Roles", "Sign-in", "Project Override", **"Pipeline"** (pages/Admin.tsx:48-52). Add a bullet: Pipeline tab = read-only history of every Excel/CSV import run (Admin.tsx:1749-1938, "Every Excel/CSV import run against the Pipeline board, newest first."). Roles bullet "Built-in roles are reserved" is **wrong for INTERNAL**: only PENDING is protected (backend/src/routes/admin.ts:26 `PROTECTED_ROLES = new Set(["PENDING"])`; Admin.tsx:797 "Reserved" badge) → say "The PENDING role is reserved". Project Override: in INTERNAL it reassigns TAM (and SA? UNVERIFIED — check Admin.tsx Project Override columns before writing). iTop entry → **DEPENDS(iTop)**.

**15 shortcuts — KEEP**: ⌘K, ↑↓Enter "Move through and open search results" (5caef7f wording; "or actions" DEPENDS UI pass), Esc "Close a dialog, the search, or the task panel" ("or ticket panel" DEPENDS iTop), ⌘Enter, Enter adds subtask/label/tool. Possible INTERNAL addition: none verified for Pipeline (no pipeline keyboard shortcuts found).

## 3. New topics INTERNAL needs

### 3.A Pipeline / SA topics (INTERNAL-only; all facts verified in INTERNAL code unless marked)

Proposed structure (fits the existing flat `HelpTopic` shape, no type change):
- `pipeline` — "Pipeline" — `route: "/pipeline"`, `requires: "pipeline:view"` (mandatory: matches NAV_COMMANDS navCommands.ts:24; test 7/8).
- `deals` — "Deals" (or "Opportunities", open question) — no route, `requires: "pipeline:view"` — detail page, moving, flags, closing, PIC, handoff.
- Pipeline permissions/roles go into `getting-started` › "Who can do what" (ungated, short) plus a `pipeline` entry "Who can change a deal" (gated with the topic).
- Analytics go into existing `overview` and `executive` topics as EDIT bullets (§2.1).
Place `pipeline` + `deals` after `weekly-sync` (before `executive`), mirroring the sidebar order (Pipeline sits before Executive in NAV_COMMANDS).

**T-P1 Stages, sub-status, status tag, outcome** (entry in `pipeline`)
- 6 stages, left to right: Assessment, Technical Clarification, PoC, RFP, Delivered Proposal, Waiting Response (lib/pipelineFormat.ts:18-46 `STAGE_LABELS`/`STAGE_ORDER`). Note label is "Delivered Proposal" (enum DELIVER_PROPOSAL).
- Won/Lost/Cancelled and Hold are NOT stages: a closed or held deal keeps the stage it stalled in (pipelineFormat.ts:12-16, 75-83).
- Sub-status: "In progress" or "Waiting Sales input" (pipelineFormat.ts:117-120); toggled with "Waiting for Sales input" / "Input received" on the card menu (components/pipeline/OpportunityCard.tsx:259-262) and detail page (OpportunityDetail.tsx:338, ~483).
- Status tag: "Hold" or "Delayed" — one at a time (shared column): "Hold"/"Release hold", "Mark delayed"/"Clear delayed" (pipelineFormat.ts:122-125; OpportunityDetail.tsx ~487-512).
- Outcome: "Won", "Lost", "Cancelled" (pipelineFormat.ts:127-131); set only by Close deal.
- Owner of the next move: "Client" while in Waiting Response, SA otherwise (pipelineFormat.ts:170-179; OwnerChip per DESIGN.md flag-chip table).

**T-P2 Views: Kanban, List, Swimlane, Quarter + Active/Closed** (entry in `pipeline`)
- View switcher "Kanban", "List", "Swimlane", "Quarter", persisted as `?view=` (pages/Pipeline.tsx:38-43, 106-121). Switch "Active · N" / "Closed · N" persisted as `?deals=closed` (Pipeline.tsx:48-51, 207-228).
- Kanban (Active): 6 stage columns, drag to move; horizontal scroll at every width (components/pipeline/SolvroPipelineKanban.tsx header). Clicking a funnel bar in the KPI strip scrolls to that column (Pipeline.tsx:267-274). Card "More actions" menu: "Open deal", sub-status and Hold/Delayed toggles (OpportunityCard.tsx:246-262).
- **"Closed" is not a fourth view**: on the Kanban tab, Closed shows three columns Won / Lost / Cancelled with summary tiles for this year, read-only (pages/views/PipelineClosed.tsx header). On List, Closed adds a "Closed" column (PipelineList.tsx header).
- List: data grid with Opportunity (title + customer), full IDR value, request date, Outcome, Tag, Sub-status, Idle columns; row click opens the deal (views/PipelineList.tsx header).
- Swimlane: one row per PIC plus an "Unassigned" lane, one column per stage, active deals only, read-only (views/PipelineSwimlane.tsx header; swimlaneLogic.ts:56). Quarter: Q1–Q4 of the current year by request date plus a catch-all bucket, active deals only, read-only (views/PipelineQuarter.tsx header). Both always show active deals regardless of the switch (caption "Active deals").
- KPI bar above every view: "Total Pipeline", "Deadline ≤ 7d", "Won this month", "Active PICs", "Idle alerts" (components/pipeline/PipelineKpiBar.tsx:27-64).

**T-P3 Creating a deal** (entry in `pipeline`)
- "New opportunity" button, shown only with `pipeline:create` (Pipeline.tsx:83, 241-250); empty board has a "+ Opportunity" CTA (SolvroPipelineKanban.tsx header).
- Fields: Title*, Customer* (required), "Deal value (IDR)", "Win probability (%)", Stage, PIC, "Request date", Deadline, "Product / solution", "Lead source", Description (components/OpportunityFormModal.tsx:203-320). Customer is a free-text name (`customerName`), not a link to a Customer record (UNVERIFIED wording — check form control type).
- Default PIC / default stage on create: UNVERIFIED.

**T-P4 Moving stages and required reasons** (entry in `deals`)
- Drag a card on the Kanban, or use the stage menu on the deal page (OpportunityDetail.tsx:752).
- Only Technical Clarification → RFP (skipping PoC) asks for a reason: dialog "Move to RFP and skip PoC?", reason "Saved in the activity log" (lib/pipelineFormat.ts:164-168 `isSkipJump`; components/MoveReasonModal.tsx:45,90; backend routes/opportunities.ts:88-96, reason ≤500 chars).
- Closed deals cannot be moved (boardLogic.ts:35-39 `canDragDeal` needs `outcome === null`).

**T-P5 Closing a deal (Won / Lost / Cancelled) and reopening** (entry in `deals`)
- "Close deal" button on the deal page (OpportunityDetail.tsx:519-526) opens "Close deal": pick Outcome; Lost/Cancelled require "Reason category" ("Select a reason…"); optional "Note (optional)"; submit "Close as Won/Lost/Cancelled"; the deal "stays in" its current stage (components/CloseDealDialog.tsx:91-188).
- Reasons: Lost → Price, Competitor, Technical, Other; Cancelled → Budget withdrawn, Project cancelled, Lost contact, Other; Won takes none (pipelineFormat.ts:133-154). Backend 400s a reason on Won (`reason_not_allowed`, per comment pipelineFormat.ts:143-149).
- Closing clears Hold/Delayed (PipelineOverviewPanel.tsx:58-60 comment). "Reopen" appears for a closed deal that has no linked project (boardLogic.ts:101-105; OpportunityDetail.tsx:529-537).

**T-P6 Assigning a PIC / unassigned deals** (entry in `deals`)
- An unassigned deal shows "Assign PIC" on its page (OpportunityDetail.tsx:305, 541-548; dialog "Assign PIC", components/AssignPicModal.tsx:80-126).
- Who: `pipeline:edit_all` can assign any time; `pipeline:edit_own` only when the deal has no PIC (boardLogic.ts:73-80; backend lib/pipelineAccess.ts). Whether edit_own may pick someone other than themselves: UNVERIFIED (plan docs/archive/plans/claim-unassigned-deals.md D1/D4 — read before writing).
- Reassigning an already-assigned deal goes through Edit, not Assign PIC (OpportunityDetail.tsx:18-24, 304).
- Unassigned deals show in the Swimlane's "Unassigned" lane.

**T-P7 Won-deal handoff to a TAM project** (entry in `deals`)
- After closing as Won an inline offer appears; a persistent "Create project" button stays on the deal page while the deal is Won and not yet linked (OpportunityDetail.tsx:248-255, 463-470, 614-620).
- Requires BOTH `project:write` and edit rights on the deal (`canHandoffDeal`, boardLogic.ts:120-125; backend routes/opportunities.ts:1094+ checks edit access, then `project:write`, then 409 `not_won` / `already_linked`). **Fact to surface: the seeded SA role lacks `project:write` (seed.ts:15-21), so by default an SA cannot hand off — a TAM/Admin with pipeline edit rights does.** (Open question for the user.)
- The handoff form is the project form prefilled from the deal: name = deal title; description = deal description + "From pipeline deal: {title} — {product_solution} — Rp {value}"; SA = the deal's PIC; customer matched by exact name (lib/handoffDefaults.ts header; HandoffProjectModal in components/DealCard.tsx:199+).
- Once linked, the deal can no longer be reopened (boardLogic.ts:101-105).

**T-P8 SLA, working days, holidays, idle alerts** (entry in `deals` or `pipeline`)
- Idle level none/warning/critical computed by the server on every read from last activity / waiting-since (pipelineFormat.ts:97-115; backend lib/pipelineSla.ts).
- Counted in working days: Mon–Fri minus Indonesian public holidays (backend lib/workingDays.ts:1-4).
- Per-stage SLA (pipelineFormat.ts:199-206): waiting-for-Sales-input warns after 2 wd (Assessment, Tech Clarification, RFP) or 3 wd (PoC, Delivered Proposal); idle warning 5 or 7 wd; Waiting Response has no waiting SLA, idle warning 7 wd, critical 14 wd.
- Deal page caption "Last activity … · SLA for this stage: …" (OpportunityDetail.tsx:171-213). Chips: "Waiting Sales input · N wd", idle chip (PipelineFlagChips.tsx:63-89). KPI tile "Idle alerts".

**T-P9 Importing deals** (entry in `pipeline`; plus Admin bullet)
- "Import" button next to "New opportunity", shown with `pipeline:create` (NOT admin-only) (Pipeline.tsx:230-239; backend POST /opportunities/import requires pipeline:create, routes/opportunities.ts:498).
- Dialog "Import opportunities": download template `solvro-pipeline-import-template.xlsx`, upload .xlsx or .csv, preview with per-row errors, "Import N valid rows" (components/PipelineImportDialog.tsx:87-358). Only the 6 stage names are accepted (importParse.ts header); row cap per request (IMPORT_ROW_CAP, value UNVERIFIED).
- Admin › Pipeline tab: import history (Admin.tsx:1749-1938).
- The one-time Velora data copy is a backend script (backend/scripts/import-velora.ts) with no UI → **do not document in Help** (backend-only operation, same exclusion rule as CUST helpContent.ts:7-9).

**T-P10 Deal page: activity notes and links** (entry in `deals`)
- "Activity · N" feed with "Add note…" / "Add note" (OpportunityDetail.tsx:853-960). Posting needs only `pipeline:view` (backend routes/opportunityItems.ts:87-90) — this is how SALES replies (seed.ts:22-25 comment). Move reasons and close notes land here.
- Links section with "Label (e.g. Proposal)" + URL (OpportunityDetail.tsx:965-1050); write gate UNVERIFIED (POST /:opportunityId/links has no requirePermission in the route signature, so it's checked inside — read before writing).
- "Edit" (stays available after close), "Delete" → "Delete opportunity" confirm (OpportunityDetail.tsx:558-677).

**T-P11 Pipeline permissions** (entry "Who can change a deal" in `pipeline`, short form in getting-started)
- From PERMISSION_CATALOG (lib/auth.tsx:44-49), quote the labels: "View pipeline", "Create opportunities", "Edit own opportunities", "Edit all opportunities", "Delete own opportunities", "Delete all opportunities". "Own" = you are the deal's PIC (boardLogic.ts:18-23, 52-59).
- Edit rights gate drag/move, flags, Close, Reopen, Edit, handoff (boardLogic.ts:35-138).

**T-P12 SA and SALES roles; SA project visibility** (getting-started › Who can do what)
- SA default: project:read + pipeline view/create/edit_own/delete_own. SALES default: pipeline:view only (reads the board, posts activity notes, no deal edits). TAM: project + task read/write. STAKEHOLDER: project:read + See all projects. PENDING: nothing. ADMIN: "*" (backend/prisma/seed.ts:13-29). Admins can change these in Admin › Roles, so phrase as "by default".
- An SA sees projects where they are the project's Solution Architect (visibility.ts:21-29) but they are not shown in the SA's Daily Review (dailyReview.ts:225-240). After Members port: an SA is NOT an owner (cannot delete or change TAM/customer) — user decision 2026-10-02.

**T-P13 Executive / Overview pipeline analytics** — see §2.1 rows 2 and 12 (EDIT bullets, gated by the page + `pipeline:view` in prose; the Help filter cannot gate a single bullet, so phrase "If you have Pipeline access, …").

### 3.B Topics/entries to write fresh when the collaboration features port (not in CUST help either)
| Feature (CUST commit/PR) | Help change | Facts source |
|---|---|---|
| Copy link + deep links through sign-in (3a19e75, fc02e6f; PR #17) | projects/customers/tasks bullets: "Copy link", "Copy task link" | CUST CHANGELOG 2026-09-29 |
| Project members (af9a362; PR #18) | new entry "Members" in projects; getting-started visibility; owner-only rule ("Only the project's TAM or the customer's owner can do this"); assigning adds member; Daily Review includes member projects. INTERNAL EDIT: SA is not an owner | CUST CHANGELOG 2026-09-30 §Project members, §Ownership |
| Conflict warning (2d9b0a8; PR #19) | tasks bullet: "Someone changed this task after you opened it" | CUST CHANGELOG |
| Activity log + notifications + @mentions (476288e; PR #20) | projects: "Recent activity" on project Overview (filter by person, "Load more"); new topic or getting-started entry for the notifications bell ("Mark all as read"); tasks: "@" picker. INTERNAL EDIT: activity extended to Pipeline — reconcile with the existing deal "Activity" feed | CUST CHANGELOG |
| Guest links (eadc065; PR #22) | projects entry "Share": label, 7/30/90-day expiry, copy once, revoke; what the `/share/<link>` page shows | CUST CHANGELOG |
| Saved task views (UI pass) | Tasks page stays hidden from the sidebar; Overview tiles open its views — mention only via Overview tiles | CUST CHANGELOG line 117 |
| Epics (8b9fa3a; PR #14) | projects tab bullet + optionally a full "Epics" entry (chip, filter, Add story) | CUST helpContent.ts:119 |

## 4. File list

### 4.1 New files (INTERNAL)
| File | Source | Notes |
|---|---|---|
| frontend/src/pages/Help.tsx | CUST pages/Help.tsx (130 lines) | Copy verbatim except kbd class `text-meta` → `text-[11px]` (5caef7f variant) until the UI pass adds the `text-meta` token (§5). Update the subtitle only if desired. |
| frontend/src/lib/helpContent.ts | CUST lib/helpContent.ts | Same interfaces + `filterHelpTopics` verbatim; `HELP_TOPICS` rewritten per §2/§3 (INTERNAL-today wording). Keep the header rule "update its entry in the same change". |
| frontend/src/lib/helpContent.test.ts | CUST (57 lines) | Keep all 8 tests. Adapt: test 1 also asserts a no-permission user does NOT see `pipeline`/`deals`; add a `pipeline:view`-only case (sees pipeline + deals, not executive/admin); test 4's "RISK REGISTER" → still exactly `["projects"]` (make sure no Pipeline text says "risk register"); test 5 add `"Waiting Sales input"` → `[]` for no-perms (gated topic not revealed). Tests 7/8 unchanged (they force the Pipeline topic). |
| e2e/tests/help.spec.ts | CUST (47 lines) | Tests 1 and 4 verbatim. Test 2: search a Pipeline-only phrase (e.g. "Waiting Sales input") → H2 "Pipeline" visible, H2 "Weekly Sync" count 0; then empty state. Test 3: `/help#pipeline` (or `#deals`) in viewport, "Getting started" not. Swap back to iTop targets is unnecessary later. Consider one test with a non-admin role is NOT possible with the current fixture (single admin QA user) — leave gating to the unit test. |

### 4.2 Edited shared files
| File | Change | Conflict notes |
|---|---|---|
| frontend/src/App.tsx | `import { Help } from "@/pages/Help";` + `<Route path="help" element={<Help />} />` inside the AuthGuard/Shell layout (next to `settings`, App.tsx:85). No guard. | Every port PR edits App.tsx — trivial merge. |
| frontend/src/components/layout/TopBar.tsx | Add the CUST `<Link to="/help" aria-label="Help" title="Help">` icon button between the mobile search button (TopBar.tsx:98-105) and the theme toggle (:107). **Title fix**: INTERNAL derives the bar title from a local `PAGE_TITLES` map (TopBar.tsx:9-14: overview "Overview", projects "My Projects", customers "Customers", tasks "Tasks") with fallback `"Solvro"` (TopBar.tsx:31-32); project pages render the "Projects / <name>" crumb instead (:62-75). There is no `document.title` handling anywhere in INTERNAL src. Minimal change if Help ships before the UI pass: add `help: "Help"` to `PAGE_TITLES` (one line). Do NOT build routeMeta.ts in the Help PR — the UI pass ports CUST lib/routeMeta.ts (+ routeMeta.test.ts, which already asserts `routeTitle("/help") === "Help"`, CUST routeMeta.test.ts:60) and replaces PAGE_TITLES wholesale; when it does, its STATIC_TITLES must include INTERNAL's `pipeline: "Pipeline"` (and handle `/pipeline/:id` → deal title crumb — new work, CUST has no Pipeline). | UI-pass PR touches the same lines; the 1-line PAGE_TITLES addition is disposable. Notification bell (activity PR) also lands next to the help button — order in CUST: search, help, bell, theme, avatar. |
| CHANGELOG.md | `### Added — <date> — Help page` under [Unreleased] (public wording, no pipeline vocabulary). | Mandatory (Guardrails › Changelog Discipline). |
| (later PRs) frontend/src/lib/helpContent.ts | Each feature PR updates its topics (§6). | Serial edits to one array — prefer one topic object per feature to minimise conflicts. |

NOT edited: lib/navCommands.ts (no Help entry by design, mirrors CUST), CommandPalette.tsx, Sidebar.tsx, any backend file, docs/DESIGN.md (no new token in the early ship).

### 4.3 Imports of Help.tsx that INTERNAL lacks
- `@/lib/helpContent` — new file (above). Everything else exists: `@/components/EmptyState` (INTERNAL EmptyState.tsx, same props), `@/lib/auth` `hasPermission`/`useAuth`, react-router `Link`/`useLocation`.
- Tailwind class `text-meta` (Help.tsx:118) — token missing in INTERNAL index.css (CUST index.css:114-116 `--text-meta`); without it the class silently emits nothing. Use `text-[11px]` or port the token with the UI pass.
- helpContent.test.ts imports `./navCommands` — exists (INTERNAL lib/navCommands.ts; INTERNAL NavCommand has no `group` field, test doesn't use it).
- e2e help.spec.ts imports `../fixtures/test` (`test`, `expect`, `loginViaUi`) — exist (INTERNAL e2e/fixtures/test.ts:12,23,40). QA user is admin by fixture convention (ADMIN_EMAIL qa@solvro.test, fixtures/seed.ts:10) — wildcard assumed (UNVERIFIED that the seeded role is ADMIN "*", but CUST relies on the same fixture shape).

## 5. Design-system notes
- Tokens used by Help.tsx: `font-display`, `text-2xl`, `text-lg`, `text-sm`, `text-[13px]`, `text-label-caps`, `text-meta`, `text-on-surface`, `text-on-surface-variant`, `text-primary`, `bg-surface-container-low/-lowest`, `bg-surface-container` (hover), `border-outline-variant`, `rounded-sm`, `focus-visible:ring-primary/30`, `marker:text-on-surface-variant`, Material Symbols Outlined. All exist in INTERNAL index.css/DESIGN.md **except `text-meta`** (CUST DESIGN.md adds row "`text-meta` | 12px | 500 | 1.35 | chips, badges, secondary meta"; INTERNAL DESIGN.md:245-249 lists six roles, no meta). → Use `text-[11px]` (INTERNAL's own CHIP_BASE uses `text-[11px]`, DESIGN.md:321) — no DESIGN.md change, no docs-keeper trigger.
- H1 convention: INTERNAL pages split between `font-display text-2xl font-bold` (Overview, Projects, Customers, Settings, Executive, Daily Review, Weekly Sync, Tasks) and `font-display text-h2` (Pipeline.tsx:173, OpportunityDetail.tsx:411, WorkLogs.tsx:9). Help's `text-2xl font-bold` matches the majority — fine.
- Surfaces: section cards are 1px `outline-variant` borders on tonal surfaces, no shadow — compliant with DESIGN.md:272 ("hierarchy from 1px outline-variant borders and tonal surface shifts — not drop shadows").
- Radius: `rounded-sm` = 0.25rem in v4 (DESIGN.md:266) — same as the rest of INTERNAL.
- Icons for new topics (Material Symbols): pipeline → `monetization_on` (matches NAV_COMMANDS navCommands.ts:24); deals → `handshake` (suggestion).
- The TOC is `hidden md:block` — phones get no TOC; mobile e2e asserts this. Search input is `w-full sm:w-80`.
- Chips/badges: Help renders none, so the StatusChip/PriorityBadge/LabelChip bespoke-chip guardrail is untouched. Do not render live StageChip/flag chips inside Help text (plain strings only, matching CUST).
- The TopBar button adds a 32px target to the mobile cluster; INTERNAL e2e/tests/smoke.spec.ts:39 checks no horizontal overflow — CUST fits search+help+bell+theme+avatar at 375px, INTERNAL will have one fewer (no bell) → low risk, verify via gates' Playwright smoke.
- No `reui/badge`, no new deps, no spine files touched (TopBar, App.tsx, pages/, lib/helpContent are not on the spine list) → no instant opus review needed; phase review only.

## 6. Task breakdown and sequencing

### 6.1 Can Help ship early and grow per feature PR? — Yes (recommended)
- The page, data shape, filter and tests are feature-agnostic; topic text is the only coupling. The unit test (§1.6 tests 7/8) already enforces "sidebar page ⇒ help topic" mechanically, so every later PR that adds a nav page is forced to add its topic. Add a one-line rule to each port plan's acceptance criteria: "help topics updated for any changed UI label" (CUST helpContent.ts header rule).
- Ship order: Help early (before or alongside the first port PR), written against INTERNAL **today** (5caef7f-era wording where the UI pass hasn't landed). Each port PR then edits only its own topics.

### 6.2 Tasks
**H1 — Help shell + core topics (one PR; M, ~0.5–1 day)**
Files: new pages/Help.tsx, lib/helpContent.ts, lib/helpContent.test.ts, e2e/tests/help.spec.ts; edit App.tsx, layout/TopBar.tsx (button + `help: "Help"` in PAGE_TITLES), CHANGELOG.md.
Topics: getting-started (EDITed: SA/SALES, pipeline perms, SA visibility arm, pre-UI-pass palette sentence), overview (5caef7f wording + Pipeline panel bullet), projects (minus Epics, plus SA field), project-views (INTERNAL Kanban casing "To Do"/"In Progress"), tasks (minus iTop, "+ Label"), risks, customers (minus Tickets), daily-review (minus iTop strip), weekly-sync, executive (+ Pipeline analytics), settings (minus iTop token), admin (+ Pipeline tab, "PENDING is reserved", minus iTop), shortcuts (minus "actions"/"ticket panel").
Acceptance:
- `/help` renders for any signed-in user; TopBar "Help" link opens it; bar title reads "Help" (not "Solvro").
- No-permission user sees no executive/admin/pipeline/deals topics; `pipeline:view`-only sees pipeline+deals; wildcard sees all (unit tests).
- Each routed topic's `requires` equals its NAV_COMMANDS entry; every NAV_COMMANDS page (incl. /pipeline) has a topic (unit tests).
- Every quoted UI string in helpContent.ts greps to the INTERNAL source (manual check list in PR description; optional extra unit test is NOT feasible without React render — keep manual).
- e2e help.spec.ts green on desktop + mobile; smoke no-overflow green at 375px.
- No mention of iTop, Utilization, Epics, members, notifications, guest links.
- CHANGELOG entry present.
**H2 — Pipeline + Deals topics (can be the same PR as H1; M, ~0.5 day)**
Topics `pipeline` (T-P1, T-P2, T-P3, T-P9, T-P11) and `deals` (T-P4..T-P8, T-P10); getting-started role list (T-P12). Resolve every UNVERIFIED item in §3.A first (default PIC on create, edit_own assignee scope, links write gate, import row cap). Acceptance: each fact cites a code path in the PR description; the SA-handoff `project:write` fact is either documented or the user decides to change the seed (open question 3).
→ Recommendation: merge H1+H2 as one "Help page" PR (unit test 8 forces a Pipeline topic anyway; a stub would be throwaway).

**H3..Hn — per-feature help deltas (each S, 15–60 min, inside the feature PR)**
| Port PR (user's list) | Help edits |
|---|---|
| iTop + Utilization (Work Logs → Utilization) | add topics `itop`, `utilization` (route `/utilization`, NAV_COMMANDS added in same PR — test 8); tasks "iTop ticket" bullet; customers "Tickets" bullet; daily-review "iTop today"/"Add to note"; settings iTop token; admin iTop entry; shortcuts "or ticket panel". Restore CUST e2e search/deep-link targets optional. Verify utilization "By TAM"/"By customer" gating for SALES/SA roles. |
| Project members | getting-started visibility ("…or a member"); projects "Members" entry; owner-only rule with INTERNAL EDIT "an SA on the project is not an owner"; tasks "assigning adds a member"; daily-review member projects; customers owner-only changes. |
| Activity log (extended to Pipeline) + notifications + @mentions | projects "Recent activity"; new notifications entry (getting-started › "Find your way around" or a `notifications` topic); tasks "@" mentions; deals: reconcile the existing "Activity" feed wording with the extended log. |
| Guest links | projects "Share" entry. |
| Epics | projects tab bullet (CUST helpContent.ts:119) + Kanban/List Epic filter. |
| Shared UX: wording/date pass, saved task views, overview tiles, sidebar groups, palette actions, routeMeta | overview tiles + attention counts (CUST 489b0a4 text); palette actions sentence; Kanban "To do"/"In progress"; "Add label"; shortcut "or actions"; Help.tsx kbd `text-meta` (token ported with the pass); replace TopBar PAGE_TITLES with lib/routeMeta.ts incl. `help` and INTERNAL `pipeline`; re-check every customers bullet against the account-page redesign; sidebar group names if Help mentions them (it doesn't today). |
| Copy link / deep links / conflict warning (if ported) | projects/customers/tasks bullets (§3.B). |

### 6.3 Estimate
H1+H2 together: M (≈1 day incl. fact-checking Pipeline strings and e2e). Each later delta: S. Total help-specific effort across the port ≈ 1.5–2 days.

### 6.4 Open questions for the user
1. Ship Help first (against today's INTERNAL wording) and let each port PR update it — or wait until after the UI pass to avoid rewriting overview/Kanban/label wording twice? (Recommend: ship first; the rewrites are a few strings.)
2. Pipeline topic naming: "Deals" vs "Opportunities" — the UI mixes both ("New opportunity", "Import opportunities", "Delete opportunity" vs "Close deal", "Open deal", "Active Deals").
3. SA handoff: the seeded SA role lacks `project:write`, so an SA cannot use "Create project" on their own Won deal (boardLogic.ts:120-125 + routes/opportunities.ts handoff). Document as-is ("ask a TAM") or is this a seed bug to fix?
4. Should SALES-only users (pipeline:view, no project:read) still see the TAM topics (projects, daily review, weekly sync…)? CUST gates only on the sidebar rule, and INTERNAL's sidebar shows Projects/Customers/Daily Review to everyone. Adding `requires: "project:read"` to TAM topics would break test 7 for routed topics (sidebar entries are ungated) unless the sidebar is gated too.
5. Keep CUST's decision: Help reachable from the TopBar only (no sidebar entry, no ⌘K entry)?
6. Document the Admin › Pipeline import history and the board's "Import" (pipeline:create, not admin) — yes; document the one-time Velora script — no (backend-only). Agree?
7. Frontend `BUILTIN_ROLES` (lib/auth.tsx:16) and Admin's custom-role count filter (Admin.tsx:456) omit SALES — out of scope for Help, but the role list in Help will name SALES. File in docs/ISSUES.md?
8. After the Members port, should Help say anything about SA access beyond "SA is not an owner" (e.g. is the SA auto-added as a member at handoff)? Depends on the Members plan.
