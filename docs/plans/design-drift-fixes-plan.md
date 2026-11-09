# Design Drift Fixes — Implementation Plan

Status: **approved 2026-11-02 (user)** — run unattended end to end; one PR into `develop`.
Spec: `docs/plans/design-drift-fixes-spec.md` (approved 2026-11-02). Branch: `fix/design-drift` off `origin/develop`.
Visual reference: Doop canvas `RRWCRKA9N7`, page **06 · Design fixes — before / after**.
Phase = branch = one PR into `develop`; each task below = one commit. Every commit and the PR wait for explicit user approval (CLAUDE.md).

## Overview

Thirteen class/token fixes plus one token-level contrast change (F-1), delivered in five slices: tokens → colour call-sites → typography → focus → guards & docs. Each task changes ≤ 5 files (the two 6-file tasks touch one or two lines per file) and leaves the app working. The guard greps land last so `gates.sh` never goes red mid-phase.

## Architecture decisions

- **Tokens first.** `--warning-solid`/`--on-warning` and the F-1 light values land in `index.css` before any call-site uses them; every later task consumes tokens by name.
- **Contrast is tested, not eyeballed.** A pure Vitest test parses the light/dark RGB triples from `index.css` and asserts ≥ 4.5:1 for every chip pair, `on-primary`/`primary` and `on-warning`/`warning-solid` in both themes. It guards F-1 and Fix 05 for good.
- **One focus constant.** `FIELD_FOCUS` in `frontend/src/lib/utils.ts` (beside `cn()`); Fix 11 tasks replace hand-rolled `focus:border-primary` with it, grouped by area.
- **Same-file tasks are sequential.** `Settings.tsx`, `Admin.tsx` and `ProjectRisks.tsx` are each touched by up to three tasks (colour, caps, focus) — those tasks run in the order listed, never in the same wave.
- **Spine tasks get an instant opus review** (`gates.sh` enforces it): Task 10 (`gantt-v2/`), Task 19 (`DateField`/`DateRangeField`, `gantt-v2/`).
- **Docs at the end.** Touching `index.css` triggers `solvro-docs-keeper`, which writes the DESIGN.md changes (Fix 13) from spec §4 and syncs the token tables.

## Dependency graph

```
T1 tokens + contrast test
 ├── T6 ConfirmModal (warning pair)
 └── T3–T9 colour call-sites (light values visible in review)
T10–T14 typography        (independent)
T15 FIELD_FOCUS constant ── T16–T19 focus call-sites
all ── T20 guard greps ── T21 docs (docs-keeper) ── phase review ── PR
```

## Task list

### Phase 1 — Foundation (`tokens`)

#### Task 1: Light-contrast tokens, warning pair and contrast test
**Description:** Add `--warning-solid`/`--on-warning` (light `180 83 9`/`255 255 255`, dark `120 53 15`/`253 230 138`) wired as `--color-warning-solid`/`--color-on-warning` in the primary `@theme inline` block. Change light `--emerald-text` → `21 128 61`, `--amber-text` → `180 83 9`, `--primary` → `37 130 58`. Add a contrast test over the parsed triples.
**Acceptance criteria:**
- [ ] `bg-warning-solid` / `text-on-warning` resolve in both themes; dark values of every existing token unchanged.
- [ ] Contrast test asserts ≥ 4.5:1 for emerald/amber/rose/violet chip pairs, `on-primary`/`primary`, `on-warning`/`warning-solid`, light and dark — and fails on today's light values (proves it bites).
**Verification:** `docker compose exec frontend npm test -- tokenContrast` · `docker compose exec frontend npm run typecheck` · manual: light mode chip text visibly darker.
**Dependencies:** None
**Files:** `frontend/src/index.css`, `frontend/src/lib/tokenContrast.test.ts`
**Scope:** S

### Checkpoint A — after Task 1
- [ ] Vitest green, typecheck green, full `gates.sh` (orchestrator)
- [ ] Light-mode spot check: Overview chips, primary buttons

### Phase 2 — Colour call-sites (`colour-callsites`)

#### Task 2: Fix 01 — Risks pills & counters
**Description:** `STATUS_TONE` Mitigated/Closed and `Stat` medium/low → chip pairs; `Stat` label → `text-label-caps uppercase`.
**Acceptance criteria:**
- [ ] No `amber-`/`emerald-` palette class in `ProjectRisks.tsx`.
- [ ] Dark mode: Mitigated `#78350F/#FDE68A`, Closed `#064E3B/#A7F3D0`.
**Verification:** typecheck · extend the existing Risks e2e spec (or `customer-account`/project spec that opens the Risks tab) with a dark-theme class assertion on a Mitigated pill · manual vs Doop Fix 01 After.
**Dependencies:** Task 1
**Files:** `frontend/src/pages/views/ProjectRisks.tsx`, one e2e spec
**Scope:** S

#### Task 3: Fix 02 — Settings banner, theme tiles, headings
**Description:** Success banner → `Alert variant="success"`; theme preview tiles → token surfaces (sidebar dark in both previews); 7 section/label caps → `text-label-caps` (Fix 12 sites in this file).
**Acceptance criteria:**
- [ ] No palette class or hex in `Settings.tsx`.
- [ ] Banner readable in both themes; tiles match the Doop Fix 02 After.
**Verification:** typecheck · e2e smoke (Settings) · manual both themes.
**Dependencies:** Task 1
**Files:** `frontend/src/pages/Settings.tsx`
**Scope:** S

#### Task 4: Fix 03 + Fix 04 — success/warning accents
**Description:** Project Overview legend swatch, slip text, KPI accent → `success` (rename accent value `"emerald"` → `"success"`); Admin Users-tab KPI icons → `text-warning` / `text-success`.
**Acceptance criteria:**
- [ ] No `emerald-`/`amber-` palette class in either file.
- [ ] Completed (success) visibly distinct from the green current S-curve line.
**Verification:** typecheck · manual both themes.
**Dependencies:** Task 1
**Files:** `frontend/src/pages/views/ProjectOverview.tsx`, `frontend/src/pages/Admin.tsx`
**Scope:** S

#### Task 5: Fix 05 — ConfirmModal warning tone
**Description:** Warning button → `bg-warning-solid text-on-warning`; all buttons `rounded-lg` → `rounded-sm`, `font-bold` → `font-semibold`; danger keeps the error family.
**Acceptance criteria:**
- [ ] Warning button ≥ 4.5:1 both themes (covered by Task 1's test + manual).
- [ ] Destructive confirmations unchanged in behaviour and focus handling.
**Verification:** typecheck · existing ConfirmModal-using e2e specs pass · manual.
**Dependencies:** Task 1
**Files:** `frontend/src/components/ConfirmModal.tsx`
**Scope:** XS

#### Task 6: Fix 06 — done checkbox
**Description:** Checked state → `border-primary bg-primary text-on-primary`; add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`.
**Acceptance criteria:**
- [ ] Identical treatment in List, Kanban card and Task panel; keyboard focus ring visible.
**Verification:** typecheck · `kanban-dnd.spec.ts`, `list-dnd.spec.ts` pass · manual keyboard tab-through.
**Dependencies:** Task 1
**Files:** `frontend/src/pages/views/ProjectList.tsx`, `frontend/src/components/kanban-v2/cards.tsx`, `frontend/src/components/TaskPanel.tsx`
**Scope:** S

#### Task 7: Fix 07 — sidebar text ramp
**Description:** `slate-*` / `text-white` / `bg-white/5` → on-surface tokens and `surface-container-high` hover; `dark` pin kept.
**Acceptance criteria:**
- [ ] No `slate-` or `text-white` in `Sidebar.tsx`; rail identical in light and dark app themes.
**Verification:** typecheck · manual collapsed + expanded rail, tooltip offset unchanged.
**Dependencies:** None
**Files:** `frontend/src/components/layout/Sidebar.tsx`
**Scope:** XS

#### Task 8: Fix 08 — avatar palette
**Description:** `AVATAR_PALETTE` hex → four token-pair classes (violet, amber, emerald chip pairs; neutral `secondary-container`), initials in the pair's text colour.
**Acceptance criteria:**
- [ ] No hex in `Projects.tsx`; deterministic colour per user preserved.
**Verification:** typecheck · manual both themes.
**Dependencies:** Task 1
**Files:** `frontend/src/pages/Projects.tsx`
**Scope:** XS

#### Task 8b: Fix 14 — portfolio timeline Planning / On-hold bars
**Description:** `CALENDAR_TONE.planning` `bg-chip-amber-bg` → `bg-chip-amber-text` (legend follows).
**Acceptance criteria:**
- [ ] Planning/On-hold bars visible on the track in both themes (Overview and Executive).
**Verification:** typecheck · `overview.spec.ts` passes · manual light + dark.
**Dependencies:** Task 1
**Files:** `frontend/src/components/portfolio/PortfolioCalendar.tsx`
**Scope:** XS

### Checkpoint B — after Tasks 2–8b
- [ ] Full `gates.sh` green (orchestrator, serial)
- [ ] Every touched screen compared with its Doop After frame in both themes
- [ ] User review before typography/focus waves

### Phase 3 — Typography (`typography`)

#### Task 9: Fix 09 — Gantt toolbar to 12px
**Description:** Seven `text-[11.5px]` → `text-meta`; update the line-148 comment; drop `tracking-wide` on zoom pills.
**Acceptance criteria:**
- [ ] Zero `text-[11.5px]`; toolbar fits at 1280px without wrapping.
**Verification:** typecheck · `gantt-*.spec.ts` pass · **instant opus review (spine)**.
**Dependencies:** None
**Files:** `frontend/src/components/gantt-v2/SolvroGantt.tsx`
**Scope:** XS

#### Task 10: Fix 10 — Login labels & focus
**Description:** Four inline `fontSize: 10` labels → `text-label-caps` (eyebrow, pills) / `text-meta` (version at 60% opacity, footer); field-wrapper glow → `focus-within:ring-2 focus-within:ring-primary/30`.
**Acceptance criteria:**
- [ ] No `fontSize` < 12 and no `shadow-[` in `Login.tsx`; still dark-pinned.
**Verification:** typecheck · `auth.spec.ts` pass · manual keyboard focus.
**Dependencies:** None
**Files:** `frontend/src/pages/Login.tsx`
**Scope:** XS

#### Task 11: Fix 12 (part A) — caps labels in views and customer
**Description:** Hand-rolled caps → `text-label-caps uppercase`; status/role selects (`ProjectRisks.tsx:465`, `Admin.tsx:541`) → `text-meta font-semibold` sentence case.
**Acceptance criteria:**
- [ ] No `uppercase … tracking-wider` pair in these files.
**Verification:** typecheck · manual.
**Dependencies:** Task 2 (ProjectRisks), Task 4 (Admin)
**Files:** `frontend/src/pages/views/ProjectRisks.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/components/customer/AccountOverview.tsx`, `frontend/src/pages/views/ProjectServices.tsx`, `frontend/src/components/services/ServiceMappingList.tsx`
**Scope:** M

#### Task 12: Fix 12 (part B) — caps labels in forms and iTop sheets
**Description:** Same replacement in form modals and iTop sheets.
**Acceptance criteria:**
- [ ] App-wide grep for `uppercase … tracking-wider` returns 0.
**Verification:** typecheck · manual open each modal/sheet.
**Dependencies:** None
**Files:** `frontend/src/components/ProjectFormModal.tsx`, `frontend/src/components/CustomerFormModal.tsx`, `frontend/src/components/itop/ActionSheet.tsx`, `frontend/src/components/itop/NewTicketSheet.tsx`
**Scope:** S

#### Task 13: `text-h1` token + page titles (part A)
**Description:** `--text-h1` → 25px / 700 / 1.2 in `index.css`; switch the first page titles from `text-2xl font-bold` to `text-h1`.
**Acceptance criteria:**
- [ ] Rendered title size/weight unchanged on switched pages (25px/700); `PublicShare` title now 25px.
**Verification:** typecheck · `routeMeta.test.ts`, `overview.spec.ts`, `guest-links.spec.ts` pass.
**Dependencies:** Task 1 (same file — sequential)
**Files:** `frontend/src/index.css`, `frontend/src/pages/Overview.tsx`, `frontend/src/pages/Projects.tsx`, `frontend/src/pages/Customers.tsx`, `frontend/src/pages/PublicShare.tsx`
**Scope:** S

#### Task 14: Page titles (part B)
**Description:** Remaining page `<h1>`s on `text-2xl font-bold` (and the `text-xl`/`text-h2` page titles where they are the page heading) → `text-h1`.
**Acceptance criteria:**
- [ ] Every page-level `<h1>` uses `text-h1`; in-card headings untouched.
**Verification:** typecheck · e2e smoke.
**Dependencies:** Task 13
**Files:** `pages/Tasks.tsx`, `pages/Utilization.tsx`, `pages/Executive.tsx`, `pages/DailyReview.tsx`, `pages/Pipeline.tsx` — then a second commit for `pages/WeeklySync.tsx`, `pages/Help.tsx`, `pages/OpportunityDetail.tsx`, `pages/Admin.tsx`, `pages/Settings.tsx`, `components/customer/AccountHeader.tsx` (split into 14a/14b to stay ≤ 6 files)
**Scope:** M ×2

### Checkpoint C — after Tasks 9–14
- [ ] Full `gates.sh` green; Gantt spine review clean
- [ ] Grep: no `text-[<12px]`, no `fontSize` < 12, no `uppercase…tracking-wider`

### Phase 4 — Focus (`focus`)

#### Task 15: `FIELD_FOCUS` constant + form modals
**Description:** Export `FIELD_FOCUS` from `lib/utils.ts`; replace `focus:border-primary focus:outline-hidden` (and variants) in the main form modals; add a Playwright assertion that a focused modal input shows the ring.
**Acceptance criteria:**
- [ ] Zero `border-primary` focus classes in these files; ring visible on keyboard focus, not on mouse click.
**Verification:** typecheck · new e2e focus assertion · manual Tab through Add risk / New opportunity.
**Dependencies:** None
**Files:** `frontend/src/lib/utils.ts`, `components/OpportunityFormModal.tsx`, `components/RiskFormModal.tsx`, `components/CustomerFormModal.tsx`, `components/ProjectFormModal.tsx`, one e2e spec
**Scope:** M

#### Task 16: Focus — panels and inline editors
**Files:** `components/TaskPanel.tsx`, `components/EpicPanel.tsx`, `components/DealCard.tsx`, `components/CommentMentions.tsx`, `components/TaskFormModal.tsx`
**Acceptance / verification:** as Task 15 (grep 0 in these files; `comments.spec.ts`, `mentions.spec.ts`, `epics.spec.ts` pass).
**Dependencies:** Task 15, Task 6 (TaskPanel)
**Scope:** M

#### Task 17: Focus — admin, settings, services
**Files:** `pages/Admin.tsx`, `pages/Settings.tsx`, `components/admin/ItopTab.tsx`, `components/services/ServiceCatalogueManager.tsx`, `components/services/ServiceMappingList.tsx`
**Acceptance / verification:** grep 0 in these files; e2e smoke; manual Tab through Admin forms.
**Dependencies:** Task 15, Tasks 3/4/11/14 (shared files — sequential)
**Scope:** M

#### Task 18: Focus — iTop, links, pickers, project views
**Files:** `components/itop/ActionSheet.tsx`, `components/itop/NewTicketSheet.tsx`, `components/itop/TaskTicketField.tsx`, `components/itop/TicketLog.tsx`, `components/LinksSection.tsx` — then `components/LabelPicker.tsx`, `components/AssignPicModal.tsx`, `pages/views/ProjectEpics.tsx`, `pages/views/ProjectList.tsx`, `pages/views/ProjectRisks.tsx` (18a/18b)
**Acceptance / verification:** grep 0 in these files; `itop-*.spec.ts` pass.
**Dependencies:** Task 15, Tasks 2/6/11/12 (shared files)
**Scope:** M ×2

#### Task 19: Focus — date pickers and boards (spine)
**Description:** Align `DateField`, `DateRangeField`, `SolvroKanban`, `SolvroGantt` to the reduced form (DESIGN.md already flags SolvroGantt).
**Acceptance criteria:**
- [ ] App-wide grep `focus(-visible|-within)?:border-primary` (vendored excluded) returns 0.
**Verification:** typecheck · `date-picker.spec.ts`, `gantt-*.spec.ts`, `kanban-dnd.spec.ts` pass · **instant opus review (spine: date contract, gantt-v2)**.
**Dependencies:** Task 15, Task 9
**Files:** `components/DateField.tsx`, `components/DateRangeField.tsx`, `components/kanban-v2/SolvroKanban.tsx`, `components/gantt-v2/SolvroGantt.tsx`
**Scope:** S

### Checkpoint D — after Tasks 15–19
- [ ] Full `gates.sh` green; spine review clean
- [ ] Keyboard pass: every form control shows the ring

### Phase 5 — Guards & docs (`docs`)

#### Task 20: Design guard greps in `gates.sh`
**Description:** Four standing checks over app code (vendored excluded): raw Tailwind palette colour classes, sub-12px text (class and inline `fontSize`), `border-primary` focus, `uppercase…tracking-wider`.
**Acceptance criteria:**
- [ ] All four pass on the branch; each fails when a violation is reintroduced (tested by a temporary local edit, reverted).
**Verification:** `.claude/scripts/gates.sh` (orchestrator).
**Dependencies:** Tasks 1–19
**Files:** `.claude/scripts/gates.sh`
**Scope:** S

#### Task 21: DESIGN.md corrections (Fix 13) — docs-keeper
**Description:** `solvro-docs-keeper` (triggered by `index.css` + `gates.sh` changes) updates DESIGN.md frontmatter and §1–§5 per spec §4 Fix 13 and F-1; files nothing in ISSUES.md unless a finding is deferred.
**Acceptance criteria:**
- [ ] DESIGN.md token tables match `index.css`; §2 page titles, §3 radii, §4 focus, §5 sidebar describe the shipped code.
**Verification:** phase review finds no doc/code disagreement.
**Dependencies:** Task 20
**Files:** `docs/DESIGN.md`
**Scope:** S

### Checkpoint E — phase close
- [ ] Full `gates.sh` green
- [ ] One `solvro-reviewer` phase review on the combined diff (design lens)
- [ ] CHANGELOG `[Unreleased]` entries appended serially by the orchestrator, public-reader wording
- [ ] Doop After frames match the app (both themes)
- [ ] User approves commits, then the PR into `develop` (assigned to alfi-rajasyah)

## Parallel waves

| Wave | Tasks | Notes |
|---|---|---|
| 1 | T1 | foundation, alone |
| 2 | T2, T3, T4, T5 (+T7) | distinct files |
| 3 | T6, T8, T8b, T9, T10, T12 | distinct files |
| 4 | T11, T13 | T11 after T2/T4; T13 after T1 (index.css) |
| 5 | T14a, T15 | |
| 6 | T14b, T16, T18a | |
| 7 | T17, T18b, T19 | shared-file order respected |
| 8 | T20 → T21 | sequential |

Max 2–3 implementors per wave; frontend typechecks serialised via `/tmp/tsc.lock` (CLAUDE.md trap).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Light `--primary` darkening shifts brand perception | Med | Value is the minimum that passes (4.85:1); review light screens against the Doop light frames at Checkpoint A before proceeding |
| Same file edited by 3 tasks causes merge pain in parallel waves | Med | Shared-file tasks are sequential by design (wave table) |
| Focus change breaks a mouse-click visual some users rely on | Low | `focus-visible` only shows on keyboard; border stays as today for mouse |
| Palette guard grep too broad (false positives in chart libs, tests) | Low | Exclude vendored dirs and `*.test.ts`; explicit allowlist in `gates.sh` |
| `text-h1` token change hits an unexpected consumer | Low | Only one current consumer (`PublicShare.tsx`); grep before Task 13 |

## Open questions

None — spec §11 settled all decisions.
