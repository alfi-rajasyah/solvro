# antislop audit 001 (2026-11-10)

Status: shipped 2026-11-10 in PR #220 (all 23 items plus owner-review items 24–28). Deferred findings: `docs/ISSUES.md`, section "Antislop audit 001 fixes — deferred findings".

Scope: `frontend/src` app code (vendored `components/ui` and `components/reui` read only where app code depends on them), checked against antislop 3.2.27 rules R-01 to R-40 with `docs/DESIGN.md` as the design direction.

Location note: antislop's default is an `anti-slop/` folder at the repo root. This file sits in `docs/plans/` because the root `CLAUDE.md` puts every plan in `docs/plans/` and rules out tool-named folders.

## How it was checked

- **Live run.** Headless Chromium against the local dev stack (`localhost:5173`), signed in as the QA admin, 23 routes, desktop 1440x900 and phone 375x812, dark and light. Each page was measured for horizontal overflow, text contrast, cursor, target size, accessible names, headings and landmarks. Every route loaded in at least one viewport and theme; some individual loads failed with a browser resource error in the container, which is a test-rig limit, not an app fault.
- **Code inspection.** Pattern scans over app code for the copy, decoration, focus and semantics rules.
- **Not exercised.** No form was submitted and no modal, drawer or drag was driven (the run was read-only against shared dev data). `/pipeline/:id` (no opportunity id was found through the API), `/share/:token`, the PWA install banner, and a phone keyboard pass are unverified. Disabled buttons measure 2.2 to 2.9:1; WCAG exempts disabled controls, so they are not listed.

Priority follows the rule tier: Hard Gate = HIGH, Purpose-Gate = MEDIUM, Quality Lock = LOW. Within a tier the order is my view of impact.

## HIGH (Hard Gate)

### 1. Light-theme green fails AA as text on every tinted surface (R-25)

`primary` light is `#25823a`. It was tuned for white (4.85:1) and the contrast test only pins it there. Measured on the surfaces it actually sits on: 4.32:1 on `surface-container-low`, 4.06:1 on `surface-container`, 3.80:1 on `surface-container-high` (the hover tint). Seen live on the Help guide links (4.32:1). Every `text-primary` link, count and active label inside a card or panel in light mode is affected.

Remediation: darken light `primary` (for example `#1f7533` gives 5.75 on white and 4.51 on `surface-container-high`), then extend `lib/tokenContrast.test.ts` to pin `primary` against each surface it is allowed on. Token change, so `docs/DESIGN.md` syncs with it. Owner decision on the exact value.

### 2. White initials on green avatars fail AA in dark mode (R-25)

`text-white` on dark `primary` `#3aae51` is 2.86:1. The token pair is `on-primary` (`#0f2b16`, 5.34:1). Sites: `components/layout/TopBar.tsx:224`, `components/AssigneeAvatar.tsx:59`, `components/kanban-v2/MobileMoveSheet.tsx:51`. Visible on every page (top-bar user avatar).

Remediation: `text-white` to `text-on-primary` at the three sites.

### 3. Amber "PoC" column title fails AA in light mode (R-25)

`text-chip-amber-text` (`#b45309`) used as a heading on `surface-container` measures 4.20:1 (`components/pipeline/SolvroPipelineKanban.tsx:372`). The chip text tones are only guaranteed on their own chip background and on white.

Remediation: keep the amber signal on the column border that already carries it and set the title in `text-on-surface`, or render the stage as its `StageChip`.

### 4. Inactive admin rows are dimmed with opacity, taking text below AA (R-25)

`pages/Admin.tsx:188-222` applies `opacity-60` to inactive users. Measured: the "Password" chip 2.80:1 light and 3.07:1 dark; the email 3.10:1 light and 3.64:1 dark.

Remediation: drop the opacity; mark inactive rows with an "Inactive" chip (gray tone) and leave text at token colours.

### 5. Em dashes in user-facing copy (R-02)

About 158 em dashes sit in strings and JSX text across 58 files (comments excluded). Roughly 75 are the lone `—` used as the "no value" glyph in tables and fact rows; the rest are sentence punctuation in labels, tooltips, errors, toasts and help text. Heaviest files: `pages/Admin.tsx` (13), `lib/helpContent.ts` (12), `components/PipelineImportDialog.tsx` (9), `components/itop/TicketPanel.tsx` (7), `pages/OpportunityDetail.tsx` (7), `pages/Executive.tsx` (6).

Remediation: rewrite the sentences with a comma, colon or full stop (for example the WIP field label becomes "WIP limit (leave empty for none)"). The empty-value glyph needs one owner decision: keep `—` as a recorded exception, or switch to a single shared constant using an en dash or a hyphen. Either way route it through one constant so it is a one-line choice. A `gates.sh` design guard can then hold the line.

### 6. Login shows a hardcoded version and build number (R-17, R-38)

`pages/Login.tsx:184` renders the literal "v1.4.0 · build 2305". `frontend/package.json` says `0.1.0` and nothing in the build produces 2305.

Remediation: read the real version or commit from the build, or remove the line.

### 7. Login hero describes a product that no longer matches (R-38)

`pages/Login.tsx:152-167`: "Manage projects. Ship on time.", "One place to track projects, log updates, and report to customers.", and a "Customer reports" pill. The Reports page and its export packet were removed on 2026-08-03 by standing decision, and the hero never mentions the Pipeline module that SAs sign in for.

Remediation: rewrite the hero to what Solvro does today for both roles. This is owner copy; I can draft two options for you to choose from.

### 8. Icon ligature text is exposed to screen readers (R-39)

By code inspection, 174 of 237 `material-symbols-outlined` elements in app code have no `aria-hidden`. The icon is a text ligature, so a screen reader reads its name ahead of the label ("dashboard Overview", "folder_managed Projects").

Remediation: a small shared `Icon` component that always sets `aria-hidden="true"`, migrate the call sites, and add a guard so a bare icon span cannot return. Icon-only buttons keep their existing `aria-label`.

### 9. Buttons do not show a pointer cursor; disabled ones do not show not-allowed (R-39)

Tailwind v4 no longer gives buttons `cursor: pointer`, and `index.css` has no base rule. Measured: 113 distinct enabled controls render the default arrow (351 of 370 on `/admin`, 725 on `/daily-review`, every top-bar button). Only 19 of 124 `disabled:` sites set `cursor-not-allowed`.

Remediation: one rule in the base layer of `index.css` covering `button`, `summary`, `select`, `[role=button]`, `[role=tab]`, `[role=switch]`, `label[for]` with `cursor: pointer`, and their disabled forms with `cursor: not-allowed`. The search trigger's deliberate `cursor-text` keeps working because utilities beat the base layer.

### 10. Inline-edit inputs remove the focus outline with no replacement (R-32)

`outline-hidden focus:outline-hidden` with no ring on the element or wrapper: task title (`components/TaskPanel.tsx:527`), subtask title (`TaskPanel.tsx:897`), epic task input (`components/EpicPanel.tsx:357`). `components/CommentMentions.tsx:203` does the same inside a bordered wrapper; I could not confirm that wrapper has a focus-within ring.

Remediation: put `FIELD_FOCUS_WITHIN` on the wrapper (or `FIELD_FOCUS` on the input), the app-wide treatment `docs/DESIGN.md` already prescribes.

### 11. Row clicks that have no keyboard path (R-32, R-39)

The vendored data grid's `onRowClick` puts the handler on a bare `<tr>` (no `tabIndex`, no key handler). `components/pipeline/PipelineAnalyticsSection.tsx:401` (click a PIC row to filter) has no in-row control doing the same thing. `pages/Tasks.tsx:397` (click a row to edit) needs checking for an equivalent in-row button. `pages/Customers.tsx:393` is fine because the name is a real link.

Remediation: give each such row a real button or link in its first cell for the same action; keep the row click as a mouse convenience.

### 12. Touch targets below 44px on phone (R-03)

At 375px nearly every control is under 44px: top-bar search, help, bell, theme and user buttons are 32x32, the navigation button 36x36, project tabs 36px tall, week arrows 32x32, the close-context button 28x28, section collapse 24x32. Counts: 199 of 220 controls on `/tasks`, 168 of 171 on `/overview`.

This collides with the stated direction (a high-density desktop tool), so it is an owner decision. Suggested remediation that keeps desktop density: enlarge the hit area only under `@media (pointer: coarse)` (a 44px minimum on top-bar buttons, tabs and row menus, using padding or a pseudo-element so visuals do not move).

### 13. Pages without an h1, skipped heading levels, login without landmarks (R-39)

- No `h1`: all eight project sub-views (the project name is not a heading), the Not found page, and Login on phone (the hero `h1` is hidden, leaving only the "Sign in" `h2`).
- `h1` followed directly by `h3`: Overview, Projects, Customers, Pipeline.
- Login has no `main` landmark.

Remediation: make the project name the `h1` in `ProjectDetail`, give Not found and phone Login an `h1`, change the card titles on the four list pages to `h2`, wrap Login in `main`.

### 14. Fields named only by `aria-label` or placeholder (R-39)

No visible label: the Help search, the Risks search, the per-user role selects on Admin, the note fields on Daily Review. All have an accessible name, so this is the mildest Hard Gate item. Search boxes with a search icon and cells under a column header are commonly accepted.

Remediation: owner call. Either record those two patterns as accepted exceptions, or add visible labels (the Daily Review notes are the ones most worth labelling).

## MEDIUM (Purpose-Gate)

### 15. Login eyebrow and capsule pills (R-09)

"PROJECT OPERATIONS" sits above the headline as an uppercase eyebrow, and three uppercase bordered pills ("Project tracking", "Daily notes", "Customer reports") follow the body. None is a status or a control. `docs/DESIGN.md` reserves the pill shape for status chips and avatars.

Remediation: fold into the hero rewrite (item 7); drop the pills, or turn them into plain text.

### 16. Decorative circles on the login hero (R-07)

Three absolutely positioned bordered circles (`pages/Login.tsx:111-121`) with no written purpose; they are not part of the identity `docs/DESIGN.md` describes (borders and tonal shifts).

Remediation: remove, or record a one-line reason in `docs/DESIGN.md`.

### 17. Coloured left stripe on rows (R-31, "colored left stripe" pattern)

`pages/Overview.tsx:152,361-363` (attention rows: red overdue, green active, gray other) and `pages/views/PipelineSwimlane.tsx:264`. On Overview the stripe repeats what the "N overdue" and status chips already say. It is not in `docs/DESIGN.md`.

Remediation: drop it on Overview, or write it into `docs/DESIGN.md` as the "needs attention" mark and use it only where no chip carries the same fact.

### 18. Arrows on link-buttons (R-08)

"View all →" on Overview and "Open Overview →" style links on every Help guide card (19 occurrences in JSX text). No written purpose.

Remediation: keep the arrow only where the link leaves the current page context, and say so in `docs/DESIGN.md`; remove it elsewhere.

### 19. Backdrop blur on four overlay kinds (R-10)

Scrims of `Modal`, `CommandPalette`, `MobileMoveSheet` (`backdrop-blur-sm`), the `RightSidebar` panel itself (`backdrop-blur-md`), plus two 1px phone scrims. The elevation doctrine in `docs/DESIGN.md` names borders and tonal shifts only, and notes the sidebar blur as an implementation gap.

Remediation: either remove blur and rely on the scrim tint, or record blur as the single scrim treatment. Not urgent.

## LOW (Quality Locks)

### 20. Radius drift (R-11)

129 `rounded-lg` / `rounded-xl` uses remain in app code next to the `rounded-sm` standard. `docs/DESIGN.md` already calls these legacy; the project toolbar buttons are the most visible mix (two radii in one row).

Remediation: converge in passing, or one sweep; a guard for new uses.

### 21. Arbitrary pixel type sizes (R-31)

247 `text-[12px]` to `text-[19px]` literals bypass the named type roles (for example `TopBar.tsx:224`, `itop/TicketsTable.tsx:146`, `CommandPalette.tsx:240`). None is under the 12px floor.

Remediation: map to `text-meta`, `text-xs`, `text-sm` as files are touched.

### 22. Project names truncate to a few characters on phone (C-4)

Overview attention rows at 375px show "FarPast …", "Gate muv…": the id, two chips and the name share one line.

Remediation: let the row wrap to two lines under `md:` so the name gets the full width.

### 23. Mixed language on the sign-in button (R-16, consistency)

The Google button renders "Login dengan Google" in an otherwise English interface (no `locale` is passed, so Google picks from the browser).

Remediation: pass `locale: "en"` to the button, if English is the intended interface language.

## What passed

- No horizontal overflow on any of the 23 routes at 375px. Smallest text measured is 12px.
- Both themes render on every route; the toggle works; reduced motion is honoured globally.
- No fake statistics, testimonials, trust claims, generic CTAs or marketing buzzwords in app copy. No dead `href="#"` links. No gradients as colour, no glow, no shadows outside the `shadow-overlay` whitelist.
- Loading, empty and error handling is present on the data pages (by code inspection). A skip link exists and keyboard focus shows a visible ring on shell navigation.
- Uppercase tracked labels, pill status chips, the dark default and the monospace id tags are all written into `docs/DESIGN.md`, so they are direction, not findings.

## Going forward: antislop "during" mode

Applied 2026-11-10 on the owner's approval (uncommitted at the time of writing).

- `docs/reference/antislop.md`: the 3.2.27 single file, unmodified. Not imported into any `CLAUDE.md`, so it costs nothing until a UI task reads it. Update by replacing the file.
- Root `CLAUDE.md`: a Guardrails line (the filter applies after `docs/DESIGN.md`, mode fixed to "during", precedence Guardrails then DESIGN then antislop, no mode question, no install wizard), a Map entry, the reviewer's role line, the phase flow, and a paragraph giving the Delivery Gate to the orchestrator once per phase.
- `frontend/CLAUDE.md`: the repo-specific scoping (what DESIGN overrides, which rules do not apply to an internal tool, where the em dash ban stops, where audits go).
- `.claude/agents/solvro-implementor.md`, `.claude/agents/solvro-reviewer.md`: the matching instructions.
- `docs/DESIGN.md`: `dial: ENERGY 1 / RHYTHM 1 / MOTION 1` in the frontmatter and a line in section 0.
- `~/.config/antislop/settings.json` on the owner's machine: `{"mode":"during"}`.

Why the single file and not only the plugin: the plugin lives on one machine and reaches only agents that have the Skill tool. The reviewer agent has none, and other contributors and CI have no plugin. A file in the repo is the only form every agent can read.

Why not the stock pointer block: appended as written it would tell every session, including agents that cannot ask, to stop and ask "during or after"; apply to backend and docs work; point at `skills/` paths that do not exist here; send audits to a tool-named folder; and leave unclear which wins against `docs/DESIGN.md`.

One scoping choice in `frontend/CLAUDE.md` goes beyond what was explicitly approved and is the owner's to strike: the 44px touch target is read as applying to touch input only, so desktop density stays (see item 12).

Still to do, each tied to its fix landing first, because the guard would fail on today's code: `gates.sh` guards for no `text-white` on `bg-primary` (item 2), no em dash in app strings (item 5), and no icon element without `aria-hidden` (item 8).

## Fix plan (all 23 items, one PR)

Owner decisions, 2026-11-10: fix every item. Login becomes plain identification (the Solvro mark and one line: "Elitery's workspace for project delivery and the sales pipeline."), with no eyebrow, pills, circles or version line. It keeps its two-panel layout: the first pass collapsed it to a single column, and the owner asked for the layout back the same day. The empty-value mark is an en dash through `EMPTY_VALUE` in `frontend/src/lib/emptyValue.ts`. Visible labels are added to the Daily Review note boxes only; search boxes with a search icon and selects under a column header are accepted exceptions. Light `primary` becomes `#1f7533`. Touch targets grow on touch input only.

### Already in place (shared, do not edit)

- `frontend/src/index.css`: light `--primary` is `31 117 51`; a base rule gives every button-like control `cursor: pointer` and disabled ones `not-allowed`; a `tap-target` utility gives a control a 44px hit area on touch input without changing its look.
- `frontend/src/lib/emptyValue.ts`: `EMPTY_VALUE`.
- `frontend/src/lib/tokenContrast.test.ts`, `lib/themePreview.ts`, `lib/gantt/exportPdf.ts`: follow the new green.

### Sweeps: every task applies these inside its own files

- **S1, em dash (item 5).** No `—` in any string a user can read: JSX text, labels, titles, `aria-label`s, placeholders, toasts, errors, help text. Rewrite the sentence with a comma, colon, full stop or parentheses so it still reads naturally; do not just swap the character. A lone `—` standing for "no value" becomes `EMPTY_VALUE`. Leave code comments alone. When a changed string is asserted in a unit test or in `e2e/tests/`, update that assertion to match.
- **S2, icons (item 8).** Every `material-symbols-outlined` element that is decoration gets `aria-hidden="true"`. If the icon is the only content of a control, the control must carry an `aria-label`. If the element with the icon class is itself the button, it gets an `aria-label`, not `aria-hidden`.
- **S3, avatar and check contrast (item 2).** `text-white` on `bg-primary` becomes `text-on-primary`.
- **S4, radius (item 20).** `rounded-lg` becomes `rounded-sm`. `rounded-xl` stays only on Kanban-style board column wells (project Kanban, Pipeline Kanban, ticket board); elsewhere it becomes `rounded-sm`.
- **S5, type sizes (item 21).** On text, not on icon elements: `text-[12px]` to `text-meta`, `text-[13px]` to `text-xs`, `text-[15px]` to `text-sm`, `text-[17px]` to `text-base`, `text-[19px]` to `text-lg`. Keep any explicit weight or leading class that was there. Sizes with no matching role, and sizes on icon elements, stay; list them in the report.
- **S6, arrows (item 18).** Remove `→` and `↗` from link and button labels. Keep an arrow only where it states a change from one named thing to another (for example a stage move).
- **S7, blur (item 19).** Remove `backdrop-blur-*`; scrims keep their tint, and a panel that relied on blur gets an opaque background.
- **S8, focus (item 10).** An input that hides its outline must show the app focus ring: `FIELD_FOCUS` on the input or `FIELD_FOCUS_WITHIN` on its wrapper (`frontend/src/lib/utils.ts`).
- **S9, touch targets (item 12).** Add `tap-target` to controls under 44px that a phone user taps: top-bar buttons, the navigation toggle, tab links, week arrows, icon-only row and menu buttons, close buttons. Not on an element that is `absolute` or `fixed`, or that uses an `after:` utility.
- **S10, headings (item 13).** One `h1` per page, no level skipped.

### Tasks (disjoint files, run in parallel)

- **Task A, top-level pages:** `frontend/src/pages/*.tsx` (not `pages/views/`). Beyond the sweeps: Login (items 6, 7, 15, 16, 23: plain identification as decided, `main` landmark, an `h1` that exists on phone, `locale: "en"` on the Google button); Admin item 4 (no `opacity-60` on inactive rows, an "Inactive" gray chip instead); Overview items 17 and 22 (drop the left stripe, let the attention row wrap to two lines below `md:`); item 13 for Overview, Projects, Customers, Pipeline, Not found and `ProjectDetail` (the project name is the `h1`); Tasks item 11 (a real in-row button or link that opens the same edit as the row click).
- **Task B, feature areas:** `frontend/src/pages/views/**` and `frontend/src/components/{pipeline,itop,admin,daily-review,customer,services,portfolio}/**`. Beyond the sweeps: item 3 (the PoC column title in `text-on-surface`, amber stays on the border); item 11 in `PipelineAnalyticsSection` (a real button in the PIC cell for the filter); item 14 (visible labels on the Daily Review note boxes); item 17 in `PipelineSwimlane` (drop the stripe if another mark on the card already says overdue, otherwise keep it and say so in the report); item 13 where a card title in these files is the `h3` that follows a page `h1`.
- **Task C, shared components and lib:** every other file under `frontend/src` (`components/*.tsx`, `components/{layout,kanban-v2,gantt-v2,project,skeletons}/**`, `lib/**`, `hooks/**`). Beyond the sweeps: item 2 (`TopBar`, `AssigneeAvatar`, `MobileMoveSheet`); item 10 (`TaskPanel`, `EpicPanel`, `CommentMentions`); item 19 (`Modal`, `CommandPalette`, `MobileMoveSheet`, `RightSidebar`, `Sidebar`); item 12 on the shell (`TopBar`, `Sidebar`, `Tabs`). `gantt-v2/` is on the spine list: keep changes there to the mechanical sweeps.

Out of bounds for every task: `components/ui/`, `components/reui/`, `index.css`, `lib/emptyValue.ts`, `lib/tokenContrast.test.ts`, every `CLAUDE.md`, `docs/DESIGN.md`, `CHANGELOG.md` (report the entry text instead).

Typecheck is one at a time in the frontend container. Use the lock:
`docker compose exec -T frontend sh -c 'while ! mkdir /tmp/tsc.lock 2>/dev/null; do sleep 5; done; npm run typecheck; rc=$?; rmdir /tmp/tsc.lock; exit $rc'`

## After the first pass: owner review (2026-11-10 to 2026-11-11)

The owner reviewed the result on the running app. What changed as a result:

- **Login (items 7, 15, 16) partly reversed.** The first pass collapsed the page to a single column; the owner wanted the original desktop design. The two-panel layout, the eyebrow, the headline, the pills and the rings are back, as the owner's design and a recorded override of the style findings. What stays fixed is what was false: the body line and the third pill now describe the product as it is, and the hardcoded version line is gone (item 6). Lesson recorded in `frontend/CLAUDE.md`: fix the defect, keep the look.
- **24. Chips wrapped inside narrow table columns** (found by the owner on the Pipeline list): "Idle · 27 wd" and "Technical Clarification" became three-line blobs. `CHIP_BASE` is now single-line; columns grow instead.
- **25. Risks page used its own square, uppercase chips.** Score and read-only status now use the shared chip (`RiskScoreChip`, also on Project Overview and Daily Review). The first attempt also turned the four counters into small row chips, which was wrong for a toolbar and was replaced under item 26.
- **26. Toolbar buttons had drifted page by page**, and the Risks counters competed with the page's main action. One shared toolbar box (`TOOLBAR_*` in `lib/utils.ts`, 32px to match the Gantt toolbar) now carries every page's main "Add" button, the outlined secondary buttons, the Filter toggles and the read-only count cards.
- **27. Settings redesigned** at the owner's request: tabs (Account, Appearance, Integrations, Service catalogue), rows instead of boxed cards.
- **28. Services tab redesigned** at the owner's request: one grouped table with real checkboxes and the shared toolbar, on both the project and the customer tab, with the wording settled as "a customer subscribes to" and "in this project". The Settings catalogue uses the same toolbar and vocabulary.

## Delivery Gate

Recorded in the pull request for this phase, with the click-through evidence.
