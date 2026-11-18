# Design Drift Fixes 01–13 — Spec

Status: **approved 2026-11-02 (user)** — §11 decisions are settled; plan and tasks in `docs/archive/plans/design-drift-fixes-plan.md`.
Branch: `fix/design-drift` off `origin/develop`.
Visual source: Doop canvas `RRWCRKA9N7`, page **06 · Design fixes — before / after** (index frame + Fix 01–13). Each frame shows the current render, the proposed render and the class diff; this spec is the contract those frames illustrate.
Code comments citing this work use `docs/archive/plans/design-drift-fixes-spec.md`.

## 1. Objective

Bring every screen back in line with `docs/DESIGN.md` ("Technical Precision") and make DESIGN.md describe the code as it really is. The drift was found by auditing `frontend/src` against DESIGN.md on 2026-11-01 (vendored `components/ui/` and `components/reui/` excluded).

Users: TAMs, SAs and admins working in the canonical **dark** theme, and anyone using light mode. Success means:

- No surface renders a light-only colour in dark mode (Fix 01, 02).
- Every status / success / warning colour in app code comes from a token (Fix 01–08).
- No text below 12px; one named role per typographic job (Fix 09, 10, 12).
- Every form control shows the one sanctioned focus ring (Fix 10, 11).
- DESIGN.md matches the code (Fix 13).

## 2. Assumptions (correct these before approval)

1. **Proposals, not redesigns.** Each fix changes classes/tokens only — no layout, copy, behaviour or data change, except where a row in §4 says otherwise.
2. **Tokens before call sites.** New or changed tokens land in `frontend/src/index.css` (primary `@theme inline` block + `:root`/`.dark`) first; components consume them by name. No arbitrary hex in components (frontend/CLAUDE.md).
3. **Vendored code is untouched.** `components/ui/` and `components/reui/` are out of scope; where a fix reaches a vendored component (the Alert's `rounded-lg`), it is noted, not patched.
4. **The chip components stay bespoke.** `StatusChip` / `PriorityBadge` / `LabelChip` are not rebased onto `reui/badge` (CLAUDE.md standing decision).
5. **One phase, one PR** into `develop`; tasks = commits. Touches `index.css` → docs-keeper trigger (DESIGN.md sync) at phase end.

## 3. Capability map

The 13 fixes cluster into five independently testable modules. Build order follows dependency direction.

| Module id | Fixes | Responsibility | Depends on |
|---|---|---|---|
| `tokens` | 05 (new pair), F-1 | Add `--warning-solid`/`--on-warning`; darken light `emerald-text`, `amber-text` and `primary` | — |
| `colour-callsites` | 01, 02, 03, 04, 05, 06, 07, 08, 14 | Replace raw Tailwind palette / hex with tokens | `tokens` |
| `focus` | 10 (input), 11 | One focus treatment on every form control | — |
| `typography` | 09, 10 (labels), 12 | Remove sub-12px text; hand-rolled caps → `text-label-caps` | — |
| `docs` | 13 | DESIGN.md corrections + guard greps | all of the above |

Build order: `tokens` → `colour-callsites`; `focus` and `typography` in parallel; `docs` last.

## 4. Requirements per fix

Line numbers are from `develop` as audited on 2026-11-01; re-grep at implementation time.

### Fix 01 · Risks — status pills & counters (`views/ProjectRisks.tsx`)
- `STATUS_TONE.MITIGATED` `bg-amber-100 text-amber-800` → `bg-chip-amber-bg text-chip-amber-text`.
- `STATUS_TONE.CLOSED` `bg-emerald-100 text-emerald-700` → `bg-chip-emerald-bg text-chip-emerald-text`.
- `Stat` tone medium/low: `border-amber-300 bg-amber-50 text-amber-800` / `border-emerald-300 bg-emerald-50 text-emerald-700` → same chip pair, border = chip bg.
- `Stat` label `text-[12px] font-bold uppercase tracking-wider` → `text-label-caps uppercase` (pixel-identical; moves to the named role).
- **Accept:** in dark mode Mitigated/Closed/Medium/Low render `#78350F/#FDE68A` and `#064E3B/#A7F3D0`; light mode unchanged in feel.

### Fix 02 · Settings (`pages/Settings.tsx`)
- Success banner (`:111`, `border-emerald-300 bg-emerald-50 text-emerald-800 rounded-lg`) → the vendored `Alert` with `variant="success"` (same component as the error banner below it).
- Theme preview tiles (`:357–365`, `#0F1623` / `#D1D6E2`) → real theme surfaces via tokens: dark tile `background` / `surface` / `primary`; light tile `#f9f9f7` / `#ffffff` / `outline-variant`; the sidebar stays dark in the light preview. (`#D1D6E2` never rendered — the element has no border width.)
- Section headings `text-[13px] font-bold uppercase tracking-wider text-on-surface` → `text-label-caps uppercase text-on-surface` (covered with Fix 12's site list).
- **Accept:** no raw palette class or hex left in `Settings.tsx`; banner readable in both themes.

### Fix 03 · Project Overview — success accents (`views/ProjectOverview.tsx`)
- `:158` Legend2 swatch `bg-emerald-500` → `bg-success`; `:161` slip `text-emerald-600` → `text-success`; `:447/:457` KPI accent `text-emerald-600` → `text-success`. Rename the KPI `accent` value `"emerald"` → `"success"`.
- `success` (not `primary`) so "completed" stays distinct from the green "current" S-curve line.
- **Accept:** no `emerald-*` in the file; dark-mode success text is `#A7F3D0`.

### Fix 04 · Admin — KPI icon tones (`pages/Admin.tsx:663–665`)
- Users-tab KPI strip icons: Pending `text-amber-600` → `text-warning`; Custom roles `text-emerald-600` → `text-success`. Tone names align with the Overview KPI tiles.
- Low severity (icons only).

### Fix 05 · Confirm dialog — warning tone (`components/ConfirmModal.tsx:29`)
- Today: white on `bg-amber-500` = **2.2:1**.
- New token pair (module `tokens`), built like `error`/`on-error`:
  - dark: `--warning-solid` = amber chip bg `#78350F`, `--on-warning` = `#FDE68A` (7.3:1);
  - light: `--warning-solid` = **`#B45309` (new value)**, `--on-warning` = `#FFFFFF` (5.0:1).
- Warning button → `bg-warning-solid text-on-warning`; all ConfirmModal buttons `rounded-lg` → `rounded-sm`, `font-bold` → `font-semibold` (DESIGN.md §2 sentence-case semibold buttons). Danger tone keeps the error family.
- **Accept:** warning button ≥ 4.5:1 in both themes.

### Fix 06 · Done checkbox (`views/ProjectList.tsx:1096`, `kanban-v2/cards.tsx:249`, `TaskPanel.tsx:867`)
- Checked state `border-emerald-500 bg-emerald-500 text-white` → `border-primary bg-primary text-on-primary`.
- Add the missing focus treatment `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`.
- **Accept:** identical look in all three contexts; keyboard focus visible.

### Fix 07 · Sidebar — nav text ramp (`components/layout/Sidebar.tsx`)
- Idle `text-slate-400` → `text-on-surface-variant`; hover `hover:bg-white/5 hover:text-slate-100` → `hover:bg-surface-container-high hover:text-on-surface`; active `text-white` → `text-on-surface`; aside `text-slate-300` → `text-on-surface-variant`; wordmark `text-white` → `text-on-surface`; collapse toggle same as idle.
- The rail keeps its `dark` pin, so these resolve to the dark values in both themes.
- **Accept:** no `slate-*` / `text-white` in `Sidebar.tsx`; rail visually unchanged except warmer greys.

### Fix 08 · Projects — avatar palette (`pages/Projects.tsx:264`)
- Replace `AVATAR_PALETTE` hex (incl. sky blue `#0ea5e9`) with four token-pair classes: violet, amber, emerald chip pairs + neutral (`bg-secondary-container text-on-secondary-container`). Initials take the pair's text colour, not white.
- Exclude `primary` (the TAM avatar beside it is green) and rose (reads as error).
- `components/LabelPicker.tsx` presets are user-chosen colours → **unchanged** (dropping its two blue presets is optional, low priority).
- **Accept:** no hex in `Projects.tsx`; no blue anywhere in app chrome.

### Fix 09 · Gantt toolbar — 11.5px text (`gantt-v2/SolvroGantt.tsx`)
- Seven `text-[11.5px]` sites (lines 1085, 1106, 1117, 1153, 1190, 1213, 1241) → `text-meta`; update the line-148 comment; drop `tracking-wide` on the zoom pills.
- Spine file (`gantt-v2/`) → instant opus review.
- **Accept:** `grep -c 'text-\[11.5px\]' SolvroGantt.tsx` = 0; toolbar still fits at 1280px.

### Fix 10 · Login — small labels & input focus (`pages/Login.tsx`)
- Four inline `fontSize: 10` labels (eyebrow, feature pills, version line, footer) → eyebrow/pills `text-label-caps uppercase`, version/footer `text-meta`; version line opacity 20% (≈1.4:1) → 60%.
- Field wrappers `focus-within:shadow-[0_0_0_3px_rgba(58,174,81,0.15)]` (`:352`, `:372`) → `focus-within:ring-2 focus-within:ring-primary/30`.
- Login stays dark-pinned.
- **Accept:** no `fontSize` below 12 and no `shadow-[` in `Login.tsx`.

### Fix 11 · Form focus treatment (94 sites in 29 files)
- Most fields use `focus:border-primary focus:outline-hidden` → **no ring at all**. Replace with the DESIGN.md §4 reduced form `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`, no border change (`focus-within:` variant where the focusable element is wrapped).
- Introduce one shared field class constant (e.g. `FIELD_FOCUS` in `lib/utils.ts` or a `fieldClass()` helper) so the 29 files stop hand-rolling it.
- `SolvroGantt.tsx` is included (DESIGN.md already marks it for alignment).
- **Accept:** `grep -rE 'focus(-visible|-within)?:border-primary' frontend/src --include=*.tsx | grep -v components/(ui|reui)/` = 0.

### Fix 12 · Hand-rolled caps labels (24 sites in 10 files)
- `text-[12|13|15px] font-bold uppercase tracking-wider` → `text-label-caps uppercase` (size drift is the issue: 12px ×12, 13px ×6, 15px ×2, `text-meta` ×1, inherited ×3; `tracking-wider` already equals 0.05em).
- Section headings keep `text-on-surface`; field labels keep `text-on-surface-variant`.
- Exceptions: the status/role selects (`Admin.tsx:541`, `ProjectRisks.tsx:465`) → `text-meta font-semibold` sentence case, matching chips.
- Files: Settings ×7, ProjectRisks ×5, AccountOverview ×3, Admin ×2, ProjectFormModal ×2, CustomerFormModal, itop/ActionSheet, itop/NewTicketSheet, services/ServiceMappingList, views/ProjectServices.
- **Accept:** `grep -rE 'uppercase[^"]*tracking-wider|tracking-wider[^"]*uppercase'` over app code = 0.

### Fix 13 · DESIGN.md corrections (docs only, `docs/DESIGN.md`)
- §2 page titles (decided, §11 #1): the `text-h1` token becomes 25px / 700 (what 11 pages render today) and those pages switch to `text-h1`; only `PublicShare.tsx`'s title shrinks (32 → 25px). The token change itself is code (module `typography`); DESIGN.md records it.
- §2: mark `text-body-lg` as defined-but-unused (or remove it).
- §3 radii: `rounded-sm` (4px) default; `rounded-xl` only for board column wells; `rounded-lg` legacy, converging to `rounded-sm`.
- §4 focus: replace "only SolvroGantt carries the old form" with the post-Fix-11 state.
- §5 sidebar: the rail's text uses on-surface tokens (post-Fix-07).
- New tokens from module `tokens` documented in the frontmatter and §1 tables.
- Written by `solvro-docs-keeper` at phase end (CLAUDE.md roster) — this spec only defines the content.

### Fix 14 · Portfolio timeline — Planning / On-hold bars (`components/portfolio/PortfolioCalendar.tsx:46`)
- Found while building the light-mode screen frames (2026-11-02). `CALENDAR_TONE.planning` = `bg-chip-amber-bg`: a chip *background* used as a solid bar. Light: `#FEF3C7` on a white track — nearly invisible; dark: `#78350F` on `#1A1A18` — readable but dim.
- Change: `planning: "bg-chip-amber-text"` (light `#B45309` after F-1, dark `#FDE68A`). The legend dot follows automatically (`CALENDAR_LEGEND` reuses the tone). Affects Overview and Executive.
- **Accept:** Planning/On-hold bars clearly visible on the track in both themes.

### F-1 · Light-theme contrast (token-level, in scope — user 2026-11-02)
- Today: light `chip-amber` text `#D97706` on `#FEF3C7` ≈ 2.9:1; light `chip-emerald` text `#16A34A` on `#DCFCE7` ≈ 3:1; white on light `primary` `#2D9042` ≈ 4.05:1 and `primary` text on `background` ≈ 3.85:1 — below WCAG AA (4.5:1) for 12–13px text, app-wide.
- Change (light `:root` only; dark values untouched):

| Token | Before | After | Measured after |
|---|---|---|---|
| `--emerald-text` | `22 163 74` (#16A34A) | `21 128 61` (#15803D) | 4.57:1 on chip bg · 5.02:1 on white |
| `--amber-text` | `217 119 6` (#D97706) | `180 83 9` (#B45309) | 4.51:1 on chip bg · 5.02:1 on white |
| `--primary` | `45 144 66` (#2D9042) | `37 130 58` (#25823A) | white on it 4.85:1 · as text on `background` 4.6:1 |
| `--rose-text` | `220 38 38` (#DC2626) | `185 28 28` (#B91C1C) | 5.3:1 on chip bg — found by the contrast test at implementation (3.95:1 before); required by this section's acceptance, so in scope |

- `--inverse-primary` (dark) and `primary-container` keep their values. Light `--warning-solid` reuses `#B45309` (Fix 05), so one new hex serves both.
- **Accept:** a contrast unit test (Vitest, pure function over the light/dark token triples parsed from `index.css`) asserts every chip text/bg pair, `on-primary`/`primary` and `on-warning`/`warning-solid` ≥ 4.5:1 in both themes.

## 5. Tech stack & commands

React 18 + Vite + Tailwind v4 (CSS-first, `index.css`), Base-UI primitives, Vitest, Playwright.

```bash
docker compose exec frontend npm run typecheck   # serialise — one tsc at a time (CLAUDE.md trap)
docker compose exec frontend npm test            # vitest
cd e2e && npm test                               # playwright, desktop + mobile
.claude/scripts/gates.sh                         # orchestrator-owned full gates, serial
```

## 6. Project structure touched

```
frontend/src/index.css                 → tokens (module tokens)
frontend/src/lib/utils.ts              → shared field-focus class (Fix 11)
frontend/src/pages/                    → Settings, Admin, Projects, Login, views/ProjectRisks|Overview|List|Services
frontend/src/components/               → ConfirmModal, TaskPanel, kanban-v2/cards, layout/Sidebar, gantt-v2/SolvroGantt, form modals, customer/, itop/, services/
docs/DESIGN.md                         → Fix 13 (docs-keeper)
.claude/scripts/gates.sh               → design guard greps (§7)
CHANGELOG.md                           → one entry per task, public-reader wording
```

## 7. Code style

Tokens by name, never palette or hex:

```tsx
// before
MITIGATED: "bg-amber-100 text-amber-800",
// after
MITIGATED: "bg-chip-amber-bg text-chip-amber-text",

// shared focus (Fix 11)
export const FIELD_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";
```

Named type roles (`text-label-caps`, `text-meta`) instead of `text-[Npx]`; no `tracking-wider` next to `text-label-caps`.

## 8. Testing strategy

- **Guard greps in `gates.sh`** (new standing checks, app code only, vendored dirs excluded) — the regression net for this whole class of drift:
  - no raw Tailwind palette colour classes (`(bg|text|border|ring)-(slate|gray|…|rose)-\d{2,3}`), with an explicit allowlist if any survive;
  - no `text-[N px]` with N < 12, no inline `fontSize` < 12;
  - no `focus(-visible|-within)?:border-primary`;
  - no `uppercase … tracking-wider` pairs.
- **Vitest:** unit-test the `FIELD_FOCUS` helper usage only if it carries logic (a plain constant needs none); keep existing tests green.
- **Playwright:** extend existing specs rather than add new ones — a dark-mode screenshot/class assertion on the Risks tab (Fix 01) and keyboard-focus ring visibility on one form modal (Fix 11). Smoke runs on every frontend diff via `gates.sh`.
- **Manual:** both themes on every touched screen, compared with the Doop "After" frames; contrast spot-checks for Fix 05 and F-1.

## 9. Boundaries

- **Always:** tokens from `index.css`; scoped typecheck per task; CHANGELOG entry per change; re-grep line numbers before editing; compare against the Doop After frame.
- **Ask first:** any token value beyond those settled in §11; touching vendored `ui/`/`reui/`.
- **Never:** rebase chips onto `reui/badge`; add a dependency; change layout, copy or behaviour beyond §4; commit or open a PR without explicit user approval.

## 10. Success criteria

1. All four guard greps in §8 pass on `develop` after merge.
2. Every Doop After frame (Fix 01–12) matches the running app in both themes.
3. Warning button (Fix 05) and every form focus ring (Fix 11) meet their contrast/visibility targets; the F-1 contrast test passes (all chip pairs, primary and warning pairs ≥ 4.5:1 in both themes).
4. `docs/DESIGN.md` describes the shipped code (Fix 13) — reviewer finds no doc/code disagreement on §2–§5.
5. `gates.sh` green; phase review clean.

## 11. Decisions (settled 2026-11-02, user — do not re-litigate)

| # | Question | Decision |
|---|---|---|
| 1 | Fix 13 page titles | `text-h1` becomes 25px / 700; the 11 pages switch to `text-h1`; `PublicShare.tsx` title shrinks 32 → 25px |
| 2 | Fix 05 warning pair | Approved: `--warning-solid` / `--on-warning`, light `#B45309` on white, dark `#78350F` / `#FDE68A` |
| 3 | Light-theme contrast | In this phase (F-1), including light `--primary` → `#25823A` |
| 4 | Fix 08 avatars | Four token-pair tones (violet, amber, emerald, neutral) |
| 5 | Fix 11 | Shared class constant, not a wrapper component |
| 6 | Branch | `fix/design-drift` off `origin/develop` |
