# Restructure `docs/ISSUES.md` into a triaged ledger

Status: in progress (2026-11-18), branch `docs/issues-restructure`. Archive path once shipped: `docs/archive/plans/issues-restructure.md`.

## Goal

Turn `docs/ISSUES.md` from a log of deferred findings, one section per phase, into a file of open issues sorted by area and severity, each with an ID that never changes. The old file is kept verbatim in `docs/archive/`. Every old entry is classified as open, fixed or obsolete, and each verdict needs evidence that can be checked.

## Current state (measured at `develop` @ `121c023`)

- The file has 2,421 lines and 60 `##` sections. Most are titled "<phase> — deferred findings (date)" and run from 2026-07-24 to 2026-11-18.
- There are about 302 top-level entries: 297 `- ` bullets and 5 numbered items. 65 entries are already struck through (`- ~~…~~ **Resolved/Obsolete …**`). A few more are resolved only in an italic note inside an entry that was never struck, e.g. "Task attachments": `*Resolved 2026-11-12*`.
- The header's "Last whole-list code check: 2026-09-02" is out of date.
- No gate reads the file's structure. `grep -ci issues .claude/scripts/gates.sh` returns 0. The only rule that touches it is `guardrail-local-only-tracked`, which requires `docs/` to stay tracked by git.
- Inbound references:
  - Root `CLAUDE.md`, lines 5, 22, 43 and 47.
  - `solvro-docs-keeper.md`: duty 5 and the guardrail "ISSUES entries are append/strike only".
  - 15 code and test comments cite entries by title, e.g. `filters.tsx:1815` cites the "Duplicate-chip mouse race" entry and `search.spec.ts:226` cites "Ledger item 7".
  - `solvro-reviewer.md` and `solvro-implementor.md` do not mention the file.
- The same issue is often filed more than once. Pairs found so far:
  - The backend `tsconfig` `include` excludes `scripts/`: lines 1042 and 1529.
  - The Material Symbols stylesheet overrides the icon size utilities: line 1681 and the Application review section.
  - The smoke gate needs `npx` on the host: the Lifecycle and Antislop sections.
  - The smoke console check fails because of the Google client origin: the same two sections.

## 1. Target structure

```
# Known Issues
<header: purpose, entry format, severity and type definitions, area list,
 "Last full triage: <date> @ <sha>">

## Open — Security & auth
### ISS-007 · P1 · <title>
- **Type:** bug · **Found:** 2026-10-22 (application review) · **Verified:** 2026-11-18 @ 121c023
- **Where:** `backend/src/routes/tasks.ts`, the `tasksRouter.delete("/:id")` handler (line ~600)
- **Problem:** what is wrong, in one to three lines.
- **Why deferred / fix direction:** one to three lines.
- **Source:** archive snapshot, section "<old heading>" (only for migrated entries)
## Open — Backend/API
…
## Closed
- ISS-031 · Resolved 2026-11-25 · fcde2c6, CHANGELOG "…" · ConfirmModal warning tone used raw amber
```

**Areas** (a fixed list in the header, in this order): Security & auth · Data & performance · Backend/API · Frontend UI · Accessibility & tokens · Gantt · Boards & drag (Kanban, Sortable, Data Grid) · Pipeline · iTop · Exports & sharing · Tests & CI · Dev env & ops · Docs & process.

**Severity:**

| Level | Meaning |
|---|---|
| P1 | Wrong data, a security or privacy exposure, or a user-facing break with no workaround. Deferring one needs the user's explicit note. |
| P2 | A defect with a workaround, a correctness gap, a missing test on a risky path, or a gap in a gate or process. |
| P3 | Polish, cosmetic issues, stale comments, hygiene. |

**Type:** `bug` · `debt` · `test-gap` · `watch` (no action until a stated trigger: a row count, a flake recurring, an upstream release) · `decision` (blocked on a user decision; the entry states the question).

Why this shape:
- **Headings instead of a table.** Entries need file:line, the reason for deferral and a fix direction, which don't fit table cells. Headings also give stable anchors (`#iss-042`).
- **The file order is the triage view.** Open entries are grouped by area with P1 first. `grep '^### ISS-' docs/ISSUES.md` prints one line per issue with its severity, and `grep '· P1 ·'` lists the urgent ones.
- **No separate index or count block.** It would be cached state that drifts, which the repo's Docs Discipline rule already forbids.
- **IDs are `ISS-NNN`**, numbered upward and never reused or renumbered. There is no "next ID" line, because it would conflict between parallel branches; the next ID is the highest existing one plus one.
- **Closed issues become one line each and stay in the file**, so ID citations in code and plans always resolve. When the Closed section passes about 100 lines, the docs-keeper appends the oldest lines to `docs/archive/ISSUES-closed.md` with their IDs unchanged.
- **Entry bodies stay at six lines or fewer.** Longer history stays in the archive snapshot, which the `Source:` line points to.

## 2. Migration method

### How to classify (no guessing)

| Verdict | Evidence required, checked at the recorded base sha |
|---|---|
| **Already closed** (the 65 struck entries) | Accepted as is: the docs-keeper verified them when it struck them. They are carried into the migration ledger only, with no new ID. |
| **Open** | The cited code still shows the problem. Read the file and find it by symbol, not by line number, since line numbers have drifted (e.g. `tasks.ts` `take: 200` moved from line 111 to 328). Record the new location. |
| **Fixed** | The code no longer shows the problem, **and** the change that fixed it is identified: a commit from `git log -S'<symbol>' -- <file>` or `git log -L`, or a `CHANGELOG.md` entry that names this exact symptom. Record the commit sha or quote the CHANGELOG line. |
| **Obsolete** | The cited file or feature was deleted or rewritten (`git log --diff-filter=D`, or the surface was rebuilt), or a standing decision in `CLAUDE.md` supersedes the entry (e.g. Reports removed, ingestion cancelled). |
| **Duplicate** | Same root cause and same file as another entry. Merge them into one ID that lists both sources. |
| **Unverifiable** | Depends on the environment: "observed once", flaky tests, real-install iTop behaviour, dev-host disk space. Do not decide alone: mark it `watch` with a "last observed" date, or list it for the user to rule on in T8. |
| **Decision pending** | Stays open with type `decision`, e.g. "Product decisions still open", the dark-theme Gantt ring contrast. |

These do **not** count as evidence: the entry's age, "probably fixed by phase X", or a CHANGELOG entry that touched the same area without naming the symptom.

### Sample: 27 entries that were not struck, checked against the code at `121c023`

| # | Entry (snapshot line) | Verdict | Evidence |
|---|---|---|---|
| 1 | Kanban keyboard drag unreachable (~551) | Open | `reui/kanban.tsx:796` spreads `attributes`; `:838` puts `listeners` only on the handle |
| 2 | `GET /users` unpaginated (~564) | Open | `routes/users.ts:15` `findMany` has no `take` |
| 3 | `GET /tasks` 200-row window (~572) | Open (moved) | `routes/tasks.ts:328` `take: 200` |
| 4 | No subtask promote/re-parent in the panel (~585) | Open | `TaskPanel.tsx` has no parent field |
| 5 | `kanban-v2` copied non-token styles (~593) | **Fixed** | Grep finds no `emerald-500`, `text-white` or `text-[15px]`; pickaxe shows commit `477c2e0` |
| 6 | Subtask DONE checkbox has no `canEdit` gate (~603) | Open | `TaskFormModal.tsx:736`: `disabled` checks only CANCELLED |
| 7 | `pg_trgm` index for `/search` (645) | Open (`watch`) | No trigram index in `prisma/`; the trigger is about 50k tasks |
| 8 | `GanttDatePicker` uses `shadow-md` and may be dead code (800) | Open | Still defined at `gantt-nav.tsx:358`; nothing outside the file uses it |
| 9 | Backend `tsconfig` `include` (1042) | Open, **duplicate** of line 1529 | `tsconfig.json:17` is `src/**/*.ts` |
| 10 | `SectionReorderModal` has no permission check (1072) | Open | No `canEdit` or permission reference in the file |
| 11 | Sortable items in the tab order for read-only users (1094) | Open | `reui/sortable.tsx:359` `...attributes` |
| 12 | `IconTile` outline invisible in dark theme (1161) | Open (P3 note) | `icon-tile.tsx:37` unchanged |
| 13 | Nested anchors in `Customers.tsx` (1283) | **Obsolete** | The page is now a DataGrid, and its links don't nest (`Customers.tsx:211,248`) |
| 14 | `text-[10px]` "Needs role" chip (1341) | **Fixed** | `Admin.tsx:266` now uses `text-label-caps`; its code comment is stale |
| 15 | Create-mode parent picker offers subtasks (1454) | Open | `TaskFormModal.tsx:194-195`: `!editingTask \|\|` is always true in create mode |
| 16 | `/notes/recent` has no index that leads with `noteDate` (1658) | Open | Only `[projectId, noteDate]` and `[customerId, noteDate]` exist |
| 17 | Material Symbols size utilities don't apply (1681) | Open, **duplicate** of the Application review entry | `index.html:20` still loads the stylesheet unlayered |
| 18 | Stale `chip-violet` comment in `index.css` (1729) | Open | `index.css:160` |
| 19 | `useCreateTask` doesn't invalidate Daily Review (1766) | Open | No `dailyReview` in `useCreateTask` (`queries.ts:2172+`) |
| 20 | `DELETE /tasks/:id` doesn't re-pack positions (1774) | Open | `tasks.ts:613` is a bare `tx.task.delete` |
| 21 | `gates.sh` runs only the smoke spec (1809) | Open | `gates.sh:93` |
| 22 | `ConfirmModal` warning tone raw amber (1618) | **Fixed** | Now `bg-warning-solid rounded-sm`; commit `fcde2c6` |
| 23 | `InstallBanner` `role="button"` inside a button (antislop) | Open | `InstallBanner.tsx:86` |
| 24 | `text-[14px]` Modal and Drawer titles (antislop) | Open | `Modal.tsx:58`, `Drawer.tsx:119` |
| 25 | `DealCard` reads the full deal list (1522) | Open (`watch`) | `DealCard.tsx:82` |
| 26 | Object spread into `where.project` in `tasks.ts` (lifecycle) | Open (moved) | `tasks.ts:264` |
| 27 | Inline operator strings in `Projects.tsx` (lifecycle) | Open | `Projects.tsx:94,101` |

**Ratio:** 4 of 27 (about 15%) were fixed or made obsolete without the file being updated, and 2 of the 27 are duplicates.

**Projection:**
- 65 already struck, plus about 15% of the roughly 237 not struck (about 35), gives **about 100 closed (about one third)**.
- That leaves **about 200 open**. After merging duplicates, expect about **175–185 IDs**.

**Caveat:** the sample leans towards sections from 2026-07 to 2026-09 and towards frontend entries. The July sections are probably resolved more often than 15%, because later phases rebuilt those screens (the Customers DataGrid, the antislop token fixes). The real number comes out of T1–T6.

## 3. Where the old log goes

- `git mv docs/ISSUES.md docs/archive/ISSUES-2026-11-18-phase-log.md`. This follows the naming of `CLAUDE-2026-07-28-full.md`, and `git log --follow` keeps the file's history.
- The only edit to the snapshot is a three-line banner at the top: it is a frozen snapshot, open items now live in `docs/ISSUES.md`, and the old-to-new mapping is in this plan's ledger.
- The **migration ledger** goes in an appendix to this plan: one row per old entry, giving the snapshot line and title, the verdict, the evidence, and the new ID (if any) or the duplicate it merged into. It is archived with this plan, so it remains the audit trail.

## 4. Rules going forward (proposed wording; none of it applied yet)

**Root `CLAUDE.md`, the Map row (line 43).** This is not part of the Guardrails block:
> `| docs/ISSUES.md | Open issues by area and severity (ids ISS-NNN, never reused), closed one-liners at the end; format defined in its header — docs-keeper-owned |`

**Root `CLAUDE.md`, the citation paragraph after the Map table.** Add:
> Code comments and plans cite a known issue by id (`docs/ISSUES.md` ISS-042), never by section heading or entry title.

**`solvro-docs-keeper.md`, duty 5.** Replace it with:
> **docs/ISSUES.md filing and closing.** File each user-deferred finding as a new `ISS-NNN` entry (next id = highest existing + 1) under its area's `## Open` section, in the header's format: severity, type, Found, Verified @ sha, Where (symbol + file, line as a hint), problem, why deferred / fix direction. Before filing, grep for an existing entry on the same root cause; if one exists, update it instead. When shipped work verifiably resolves or moots an open entry, verified against the diff or the current tree and never guessed, delete its body and add one line under `## Closed`: id, date, commit or CHANGELOG reference, short title. When `## Closed` passes about 100 lines, append the oldest lines to `docs/archive/ISSUES-closed.md`.

**`solvro-docs-keeper.md`, hard guardrail.** Replace "CHANGELOG and ISSUES entries are append/strike only" with:
> CHANGELOG entries are append-only. An ISSUES entry leaves `## Open` only by becoming a `## Closed` line; ids are never reused or renumbered.

This changes an agent duty, so the user has to approve it (the docs-keeper's own duty 6 says so).

**`solvro-reviewer.md`, output format.** Add:
> For a finding you judge deferrable, also give it in ISSUES form: area, severity (P1–P3), type, file:line, why it can wait, fix direction. Cite existing ISS ids when a finding matches one.

**`solvro-implementor.md`, final report.** Add:
> A problem you noticed outside your task's scope goes in your report as an `ISSUE CANDIDATE:` line (area, severity, file:line, one-line fix direction). If your change fixes an open ISS entry, say `closes ISS-NNN` with the evidence. Never edit docs/ISSUES.md.

**No Guardrails-block edit is needed.** Line 22 ("Status goes to … `docs/ISSUES.md`") still holds.

## 5. Tasks

Phase = branch `docs/issues-restructure`, cut from an up-to-date `origin/develop`; one PR into `develop`.

**Avoiding edit conflicts:**
- Only one writer, the orchestrator, touches `docs/ISSUES.md`, the snapshot and the ledger.
- The classifier subagents are read-only. They return results through SendMessage in a fixed schema and use provisional keys such as `S3-07`.
- IDs are assigned once, at assembly.
- Any change to the old file on `develop` during the work is ported when the branch is rebased.

| Task | Who | Work | Acceptance criteria |
|---|---|---|---|
| **T0** | Orchestrator, serial | Record the base sha. Count the snapshot's entries per slice. Tell the user that `docs/ISSUES.md` is frozen until merge. | Base sha and the per-slice entry counts are written in this plan. |
| **T1–T6** | 6 read-only classifiers in parallel (reviewer-type agents, no Write) | Classify one slice of the snapshot by line range. Slices are balanced by entry count, about 50 entries each: T1 lines 1–277 · T2 278–491 · T3 492–1051 · T4 1052–1501 · T5 1502–2134 · T6 2135–2421. For each entry: verdict, evidence, proposed area, severity and type, duplicate candidates (title and file), and a drafted entry body (6 lines or fewer) for open items. | Exactly one row per top-level entry in the slice, matching T0's count. Every "fixed" row has a sha or a CHANGELOG quote plus the current-code observation. Every "open" row has a location re-checked at the base sha. No verdict rests on age. No file writes. |
| **T7** | Orchestrator | Merge duplicates across slices (start with the known pairs above). Assign IDs in area and severity order. Write the new `docs/ISSUES.md`, the snapshot with its banner, and the ledger appendix. | Ledger rows equal the snapshot entry count. Every open row maps to exactly one ID. Every entry has Where and a fix direction. `grep -c '^### ISS-'` matches the ledger's open count. |
| **T8** | User | Rule in one batch on the unverifiable rows, the proposed closures of stale entries, and every P1. | Each ruling is applied in the file and in the ledger. |
| **T9** | Orchestrator, after user approval | Apply the section 4 wording to `CLAUDE.md`, `solvro-docs-keeper.md`, `solvro-reviewer.md` and `solvro-implementor.md`. | The text matches the approved wording, and a `gates.sh` run passes. |
| **T10** (optional) | One implementor | Point the 15 code and test comments that cite entries by title at IDs, or at the archive snapshot when the entry is closed (e.g. "Duplicate-chip mouse race" was struck). Comments only. | `grep -rn "ISSUES.md" frontend/src backend/src e2e` shows only ID or archive citations. One CHANGELOG line, since code files change. |
| **T11** | Fresh reviewer | Re-check 20 random ledger rows against the base sha. | At least 19 of 20 verdicts agree; any disagreement is fixed and its slice spot-checked again. |
| **Close** | Orchestrator | Rebase onto `origin/develop`. Port any `ISSUES.md` changes made since the base sha (e.g. the 2026-11-18 entries from #238). Stage the work, draft the commit and PR, and stop for user approval. | `git diff <base>..origin/develop -- docs/ISSUES.md` is fully reflected in the new file. |

## T0 record (2026-11-18)

- Base commit: `4bb01a4`. `docs/ISSUES.md` is frozen until this PR merges.
- 305 top-level entries, 65 of them struck. The planned line slices were unbalanced (26 to 118 entries), so the slices were re-cut at `##` headings by entry count:

| Slice | Lines | Entries |
|---|---|---|
| S1 | 1–473 | 49 |
| S2 | 474–1051 | 53 |
| S3 | 1052–1672 | 50 |
| S4 | 1673–2254 | 51 |
| S5 | 2255–2355 | 51 |
| S6 | 2356–2421 | 51 |

- Classifiers write one JSON Lines file per slice outside the repository and return only counts; the orchestrator is the only writer of repository files.

## 6. Risks

- **A real bug is closed by mistake.** Mitigations: the evidence rule (a fix needs a commit or CHANGELOG reference), the verbatim snapshot, the per-row ledger, and the T11 audit.
- **Other PRs edit the old file during the work.** Mitigations: the freeze notice, then porting with a diff from the base sha at rebase.
- **Line numbers drift.** "Where" cites a symbol and file, with the line only as a hint. "Verified @ sha" shows how old the location is.
- **Code citations by title stop resolving.** Titles are kept as the new headings, so text search still finds them. T10 moves the citations to IDs.
- **The docs-keeper refuses to delete entry bodies** under its current append/strike guardrail until T9 is approved. T7 is a one-time, user-approved migration, not a docs-keeper run.
- **Two branches take the same ID.** This is rare because phases merge serially. The later branch renumbers at rebase, since its new IDs are cited only inside that PR.
- **Severity is a judgment call.** Classifiers propose it, and the user reviews every P1 in T8.
- **Entries could bloat again.** The six-line body cap and the `Source:` pointer keep history in the archive, not in the entry.

### Critical files for implementation
- `docs/ISSUES.md`
- `.claude/agents/solvro-docs-keeper.md`
- `CLAUDE.md`
- `.claude/agents/solvro-reviewer.md`
- `.claude/agents/solvro-implementor.md`

## T7 record (2026-11-18)

- 305 snapshot entries: 151 open, 26 unverifiable (now `watch`), 6 decision, 30 fixed, 9 obsolete, 68 already closed, 16 duplicates merged into their canonical entry. Counts include the two T11 corrections.
- 182 IDs, no P1. Duplicate cycle resolved by hand: the two backend `tsconfig` `include` entries pointed at each other; the earlier one is canonical.
- The snapshot entry on the smoke console check failing on the Google client ID is closed by PR #244.
- Line numbers below and in `docs/ISSUES.md` `Source:` lines are lines of the archived snapshot, banner included.

## T11 record (2026-11-18)

- A fresh agent re-checked 20 random entries (8 fixed, 4 obsolete, 6 open, 2 unverifiable) without seeing the verdicts. It agreed on 18 of 20, below the 19 of 20 target.
- Both disagreements were resolved toward keeping the issue open: snapshot line 2381 (claimed fixed) and line 1403 (claimed open, not watch) are now `watch`.
- One agreed closure (snapshot line 324) had evidence the audit could not find; `git log -S` confirms the classifier's commit `1da4f67`.

## Appendix: migration ledger

One row per entry of the snapshot `docs/archive/ISSUES-2026-11-18-phase-log.md` (base `4bb01a4`), in snapshot order.

| Snapshot line | Old entry | Verdict | New ID or target | Evidence |
|---|---|---|---|---|
| 19 | Gantt tree pane: engine container clamp can re-clip fixed columns | open | ISS-093 | reui/gantt/gantt-view.tsx:976-987 clampContainer still clamps without reporting; SolvroGantt.tsx:453 nameColumnWidth still derives from own treeWidth state; TREE_PANEL_DEFAULT_WIDTH=498 (SolvroGantt.tsx:206) |
| 31 | Gantt tree pane narrowed below 356px clips fixed columns (accepted) | open | ISS-094 | SolvroGantt.tsx:244-248 TREE_FIXED_COLUMNS_WIDTH=256, TREE_NAME_COLUMN_MIN_WIDTH=100 -> clip below 356px; entry itself records 'accepted, not planned' |
| 35 | Gantt splitter drag: fixed columns clip until pointerup | open | ISS-095 | gantt-view.tsx:1055-1082: pane width written to DOM during drag, onWidthChange fired only in finish() on pointerup |
| 41 | Updated 2026-08-03 Gantt figures stale note (struck, obsolete 2026-09-02) | already-closed | — | struck in the snapshot |
| 59 | Update note: Gantt fixed columns now 256px, panel 498/774 (re-weigh clamp fix) | duplicate | ISS-093 | Same root cause as the entry at line 15; figures verified current: SolvroGantt.tsx:206,212 (498/774), :244 (256) |
| 70 | Gantt Excel/PDF downloads blocked by Chromium on http prod origin | unverifiable | ISS-137 | Environment-dependent: prod served at http://solvro.elitery.local; block is scheme-based (insecure-download blocking), observed in Dia 2026-07-31; HTTPS with internal CA declined by user 2026-07-31 |
| 77 | Safe Browsing diagnosis superseded (falsified) | duplicate | ISS-137 | Diagnosis note belonging to the Chromium download-block entry at line 66; no code involved |
| 86 | Changing export format cannot avoid the download block | duplicate | ISS-137 | Analysis sub-bullet of the line-66 entry (Chromium FULL_PING vs SAMPLED_PING file types; block is scheme-based) |
| 92 | Download block fix directions: localhost forward, internal-CA HTTPS, PDF view | duplicate | ISS-137 | Fix-direction sub-bullet of the line-66 entry; RightSidebar View action still opens a blob URL |
| 101 | Download helpers revoke object URL synchronously after click | open | ISS-138 | frontend/src/lib/gantt/exportExcel.ts:388 and frontend/src/components/PipelineImportDialog.tsx:101 both call URL.revokeObjectURL right after a.click(); projectExport.ts deleted; exportPdf.ts has no revoke |
| 118 | DESIGN.md is gitignored and untracked (resolved 2026-07-21) | already-closed | — | struck in the snapshot |
| 123 | DESIGN.md Cyrillic typo (resolved 2026-07-21) | already-closed | — | struck in the snapshot |
| 128 | Tailwind config changes need container restart (obsolete 2026-07-25) | already-closed | — | struck in the snapshot |
| 134 | Backend test-DB isolation broken (resolved 2026-08-02) | already-closed | — | struck in the snapshot |
| 161 | pwa.spec.ts fails against the Vite dev server | open | ISS-149 | vite.config.ts has no devOptions; e2e/tests/pwa.spec.ts:6-13 manifest test unguarded, :27 SW skip allows localhost:5173; e2e/CLAUDE.md:4 records it as 'fails there by design' |
| 170 | e2e/fixtures/test.ts stale comment about fixture isolation | fixed | — | Commit 2acec79 'Seed one e2e project per spec file to fix the drag test failures (#228)': e2e/fixtures/test.ts:4-13 now says one seeded project per spec file via a worker-held cache keyed by file |
| 180 | taskOrdering.test.ts still flakes on isolated solvro_test (resolved 2026-08-02) | already-closed | — | struck in the snapshot |
| 200 | opportunities.test.ts flakes in full gates run (resolved 2026-09-25) | already-closed | — | struck in the snapshot |
| 201 | Concurrent DELETE of two same-stage opportunities can deadlock (40P01) | open | ISS-116 | backend/src/routes/opportunities.ts:376-381 closeGapInStage still updates siblings one by one in tx; delete handler :1260-1268 unchanged; stageSiblingIds orders by stageOrder,id (:339-345) which mutates between txs; e2e/tests/pipeline-board.spec.ts:308 still deletes sequentially to avoid it; no concurrent-DELETE test (backend/test/opportunities.test.ts:1020 Promise.all is another case) |
| 207 | Secure Ingestion Port (cancelled 2026-08-03) | already-closed | — | struck in the snapshot |
| 218 | Reports screen revamp (resolved/stale 2026-07-25) | already-closed | — | struck in the snapshot |
| 224 | Work Logs / Utilization placeholder (resolved 2026-10-04) | already-closed | — | struck in the snapshot |
| 231 | Task attachments not built (settled as links only) | fixed | — | Commit c3b13fe 'Add document links on tasks (#230)'; CHANGELOG 2026-11-12 'Document links on tasks': 'This settles task attachments as links only: Solvro stores no uploaded files.' |
| 250 | Critical-path highlighting: computed path deferred | obsolete | — | Root CLAUDE.md standing decisions: 'Critical-path highlighting: deferred'; manual mark shipped (backend/prisma/schema.prisma:473 Task.isCriticalPath, CHANGELOG 'Critical Path mark on tasks') |
| 267 | Network Diagram tab: never build (unused sourceHandle/targetHandle fields) | obsolete | — | Root CLAUDE.md standing decisions: 'Network Diagram view: never build (TaskDependency.sourceHandle/targetHandle stay unused by design)'; backend/prisma/schema.prisma:544 sourceHandle kept; .diagram-* CSS and @xyflow/react already removed |
| 277 | Native AI summarisation inside Solvro: deferred indefinitely | obsolete | — | Root CLAUDE.md standing decisions: Reporting (Reports page, export packet, any AI summarisation, native or external) removed 2026-08-03, not to be rebuilt without a new user decision |
| 284 | Pipeline import preview queue has no length cap | open | ISS-117 | backend/src/lib/pipelineImport/offThread.ts:56-80 createImportParser keeps an unbounded `waiting` array; limiter is importPreviewLimiter 10/min (routes/opportunities.ts:529) |
| 293 | Offboarding a TAM with more than 500 projects is refused | open | ISS-031 | backend/src/routes/admin.ts:291 offboardSchema projects .max(500); customers cap MAX_CUSTOMER_OWNER_CHOICES=2000 (:277) |
| 301 | Offboarding and user delete update customers one at a time | open | ISS-017 | backend/src/lib/offboarding.ts:354-356 and :487-490 call assertActiveUser + customer.update per customer |
| 308 | Service-mapping mutations lack optimistic updates | open | ISS-044 | frontend/src/lib/queries.ts:1774-1802 useUpdateCustomerServices and useUpdateProjectServices use plain onSuccess invalidate |
| 315 | Inactive services can still be assigned to projects and customers | decision | ISS-032 | frontend/src/components/services/ServiceMappingList.tsx:329-339 inactive rows only dimmed and still toggleable; frontend/src/pages/views/ProjectServices.tsx:34-38 missingSubscribed does not filter active |
| 320 | ensureTaskVisible adds a second DB round-trip per task mutation | open | ISS-018 | backend/src/lib/visibility.ts:129-138 ensureTaskVisible does a findFirst before the write; called from routes/tasks.ts:349,606,639,698,717 and taskLinks.ts:29 |
| 324 | Sidebar nav text used cool slate greys | fixed | — | Commit 1da4f67 'fix(ui): sidebar text on the theme's warm greys'; CHANGELOG 2026-11-02: 'nav items, hover states, the wordmark and the collapse toggle use the theme's surface text colours instead of Tailwind slate and white'; Sidebar.tsx has no slate-* |
| 328 | Admin active-status pill lost its hover colour | obsolete | — | frontend/src/pages/Admin.tsx:305-313 pill is chip-emerald tokens with no hover; entry itself concludes 'status pills arguably shouldn't have a hover state' (no defect recorded) |
| 331 | Caps-label variants not migrated to text-label-caps | fixed | — | grep of frontend/src for `text-[11px]` returns 0 hits; commit 186892a / CHANGELOG 2026-10-05: 'Every hard-coded 9, 10 and 11px text size outside the Pipeline pages now uses a shared role' (Pipeline pages in 493075f) |
| 335 | ProjectOverview KPI value uses font-body (noted as intended) | obsolete | — | frontend/src/pages/views/ProjectOverview.tsx:466 still font-body text-3xl; entry says 'Working as intended - noted in case a future review re-flags it' (no defect) |
| 339 | Favicon is on-light mark only; weak on dark tab strips | open | ISS-082 | frontend/index.html:6 single <link rel=icon href=/favicon.png>; no prefers-color-scheme variant; frontend/public holds only favicon.png and icons/ |
| 348 | Overview.tsx off-token styling (remaining: raw font-mono P- id) | open | ISS-083 | frontend/src/pages/Overview.tsx:167 `font-mono` on the P- id; the KPI emerald/amber tones, healthColor() hexes, AVATAR_PALETTE and text-[11px] captions are no longer present (grep finds none) |
| 368 | ActivityFeed empty-state edge case (moot 2026-08-31) | already-closed | — | struck in the snapshot |
| 378 | PortfolioCalendar: rounded-full bar and raw font-mono year switcher | open | ISS-084 | frontend/src/components/portfolio/PortfolioCalendar.tsx:263 timeline bar `rounded-full`; :118 year switcher `font-mono` |
| 383 | Section-color parity gap on non-Gantt surfaces (no fallback resolver) | open | ISS-045 | frontend/src/pages/views/ProjectList.tsx:727, frontend/src/pages/Executive.tsx:329, frontend/src/components/TaskPanel.tsx:728 use section.color directly; Gantt resolves via lib/gantt/palette.ts resolveSectionColors |
| 392 | #94a3b8 section-color sentinel duplicated between schema and frontend | open | ISS-096 | frontend/src/lib/gantt/palette.ts:33 DEFAULT_SECTION_COLOR (geometry.ts now imports it, commit 3cd27d3) vs backend/prisma/schema.prisma:561 Section.color @default; compare at palette.ts:239; palette.ts:31 comment still cites a --phase CSS fallback |
| 407 | TaskPanel section chip stale during cross-section drag | open | ISS-046 | frontend/src/lib/queries.ts reorderTasksLocally (line ~1871-1888) sets sectionId only, not nested section; TaskPanel.tsx:392,550,725-728 read task.section |
| 418 | Stale Task.position doc comment (resolved 2026-09-02) | already-closed | — | struck in the snapshot |
| 428 | Missing DELETE /projects/:id route (resolved 2026-08-31) | already-closed | — | struck in the snapshot |
| 439 | GanttFrame vs ProjectList dnd-kit collision strategies (obsolete 2026-09-02) | already-closed | — | struck in the snapshot |
| 449 | No ESLint config; exhaustive-deps disable comment is inert | open | ISS-143 | no frontend/eslint config or lint script (frontend/package.json has no "lint"; backend none); frontend/src/components/TaskFormModal.tsx:176 still carries `eslint-disable-next-line react-hooks/exhaustive-deps` |
| 459 | Redundant double-sort in legendEntries section branch | open | ISS-097 | frontend/src/lib/gantt/palette.ts:235 resolveSectionColors sorts, then :271-272 legendEntries sorts again with the same comparator |
| 467 | No e2e coverage for colorBy persistence across page reload | open | ISS-150 | e2e/tests/gantt-legend.spec.ts has no reload()/localStorage assertion; key solvro.gantt.colorBy defined at frontend/src/components/gantt-v2/SolvroGantt.tsx:157 |
| 480 | Visual sign-off pending | already-closed | — | struck in the snapshot |
| 489 | Reorder repack is N sequential UPDATEs | fixed | — | 281b17c 'Set-based reorder with a project lock...' introduced writePositions: one UPDATE ... FROM (VALUES ...) in backend/src/lib/positionRepack.ts:41-53; taskOrdering.ts closeGap/insertAt (lines 42-84) call repackToOrder, which writes only changed rows. |
| 490 | Unswept prose-overflow surfaces | already-closed | — | struck in the snapshot |
| 491 | E2E fixture pollution: shared seeded state | already-closed | — | struck in the snapshot |
| 498 | Gantt label measurement caches pre-font-load metrics | already-closed | — | struck in the snapshot |
| 500 | PDF export bar-label rule diverges from screen | already-closed | — | struck in the snapshot |
| 502 | Label-route permission asymmetry | open | ISS-001 | backend/src/routes/projects.ts:1276-1277 POST /:id/labels uses requirePermission('project:write'); backend/src/routes/labels.ts:37,53 use 'task:write'. |
| 504 | Duplicate-label-name 409 shows raw DB message | open | ISS-041 | backend/src/http/errors.ts:68-71 returns error 'Unique constraint violated' for P2002; frontend/src/components/LabelPicker.tsx:147-149 renders createLabel.error.message verbatim. |
| 506 | Comment composer is a single-line input | open | ISS-047 | frontend/src/components/CommentMentions.tsx:196-201: non-note composer is <input type='text'>; only the note variant (isNote) uses a <textarea rows=3> at :190. |
| 508 | Outside Gantt label can create dead horizontal scroll | already-closed | — | struck in the snapshot |
| 516 | Milestone connector endpoints anchor at day-box edge | open | ISS-098 | frontend/src/components/gantt-v2/SolvroBar.tsx:295-345 renders the milestone diamond as a size-2.5 span inside the bar slot; connector-paths.ts works on the measured [data-slot=gantt-bar] rect, unchanged since the entry. |
| 517 | Popovers can clip near scroll container bottoms | unverifiable | ISS-048 | Behavioural/visual, depends on viewport and container sizes; the entry itself says 'revisit if user-reported'. No code defect to cite. |
| 518 | Connector hover-delete e2e test rare flake | duplicate | ISS-145 | Same test as the gantt-parity.spec.ts:330 'connector create via dot-drag + delete via hover' case in the list-dnd/gantt flake entry (S2-46); gantt-parity.spec.ts:330 still present. |
| 519 | Per-bar ResizeObserver in SolvroBar | open | ISS-099 | frontend/src/components/gantt-v2/SolvroBar.tsx:105 `new ResizeObserver(check)` per bar inside useLabelFits. |
| 520 | Row-reorder e2e spec lacks waitForResponse | duplicate | ISS-151 | e2e/tests/list-dnd.spec.ts has no waitForResponse; asserts after drag via polling. Entry itself calls this one instance of the waitForTimeout pattern (S2-17). |
| 521 | shadcn CLI strips vendor edits on re-pull | obsolete | — | Expected behaviour, not a defect; the rule now lives in frontend/CLAUDE.md:9 (mark every hand-touched site // SOLVRO PATCH). Patch markers now total 126 under frontend/src/components. |
| 523 | E2E fixed-timeout (waitForTimeout) convention | open | ISS-151 | grep finds 143 waitForTimeout uses across 20+ files in e2e/tests (kanban-dnd, gantt-parity, list-dnd, itop-*, daily-review, etc.). |
| 524 | Junk 'Diag ...' projects in dev DB | already-closed | — | struck in the snapshot |
| 528 | Baseline-locked toast uses raw emerald-* utilities | already-closed | — | struck in the snapshot |
| 529 | Section-id parse/format logic split across files | open | ISS-100 | frontend/src/components/gantt-v2/SolvroGantt.tsx:300,611,855 still use id.startsWith('section-') ad hoc; adapter.ts:13-15 owns sectionNodeId/parseTaskId only. |
| 530 | handleResourceReorder is ~130 lines | open | ISS-101 | frontend/src/components/gantt-v2/SolvroGantt.tsx:605-728 (useCallback, ~124 lines). |
| 536 | DESIGN.md theme_default: dark vs code default 'system' | open | ISS-178 | docs/DESIGN.md:3 `theme_default: dark` and :141 'DARK is the default'; frontend/src/lib/theme.tsx:27-30 readStoredChoice returns 'system'. User decision 2026-07-25 kept 'system'. |
| 537 | index.css carries ~180 lines of dead Network Diagram CSS | already-closed | — | struck in the snapshot |
| 538 | No e2e spec asserts Login/Sidebar always-dark pin | open | ISS-144 | grep of e2e/tests: only project-header.spec.ts:38 sets solvro.theme (to dark); no spec forces light and checks the Login root or sidebar rail stay dark. |
| 544 | Typecheck gate does not cover vite.config.ts | open | ISS-152 | frontend/package.json:11 `typecheck` is `tsc --noEmit`; frontend/tsconfig.json:24 include ['src']; frontend/tsconfig.node.json:17 still lists tailwind.config.ts and postcss.config.js. |
| 545 | nginx has no Cache-Control for /icons/ or /favicon.png | open | ISS-169 | frontend/nginx.conf has location blocks for /assets/, = /index.html, = /sw.js, = /manifest.webmanifest, and `/`; none for /icons/ or /favicon.png. |
| 546 | Only a 512 maskable icon declared | open | ISS-049 | frontend/vite.config.ts:36-39 manifest has exactly one purpose 'maskable' entry (icon-maskable-512.png). |
| 555 | Vendored Kanban keyboard DnD unreachable | open | ISS-107 | frontend/src/components/reui/kanban.tsx:796 spreads ...attributes on the KanbanItem wrapper; :838 puts ...listeners only on the handle, which has no tabIndex/role. |
| 567 | GET /users is unpaginated | open | ISS-013 | backend/src/routes/users.ts:15 prisma.user.findMany has no take/skip; TaskFormModal assignee <select> consumes the full list. |
| 575 | GET /tasks has a 200-row window | open | ISS-014 | backend/src/routes/tasks.ts:328 `take: 200`; mitigated only by X-Total-Count + frontend/src/pages/Tasks.tsx:459 'Showing N of total'. |
| 586 | No board-adjacent subtask promote/re-parent | open | ISS-050 | frontend/src/components/TaskPanel.tsx has no parent-edit control (only breadcrumb/retarget, lines 81-136); re-parenting needs TaskFormModal's Parent field. |
| 594 | kanban-v2 copied non-token styles | fixed | — | grep for emerald\|text-white\|text-[15px] in frontend/src/components/kanban-v2/ returns nothing; pickaxe: 477c2e0 'adopt the antislop UI filter, fix its first audit...' removed text-[15px] and 69b8e68 'primary-coloured done checkbox with a focus ring' removed emerald-500. |
| 603 | TaskFormModal subtask DONE checkbox lacks canEdit gate | open | ISS-051 | frontend/src/components/TaskFormModal.tsx:736-745 checkbox `disabled={s.status === 'CANCELLED'}` only; the sibling reorder buttons are gated on canEdit. |
| 610 | Vendored Kanban: drop on displaced card can cancel a one-slot move | open | ISS-109 | frontend/src/components/reui/kanban.tsx:403 (handleDragOver arrayMove) and :527 (handleDragEnd arrayMove) both still apply arrayMove on the same container. |
| 636 | /search contract-test gaps | open | ISS-153 | backend/test/search.test.ts has no q>100 chars test (search.ts:13 caps at 100), no ordering assertion, the 8-cap test (:121-136) only checks customers, and the 'escapes LIKE metacharacters' test (:200) seeds only the % case. |
| 649 | pg_trgm GIN index for /search | open | ISS-019 | No trigram index in backend/prisma (grep pg_trgm\|gin_trgm returns nothing); projects/tasks ILIKE still sequential scans in backend/src/routes/search.ts. |
| 658 | Vendored reui/autocomplete fidelity gaps | open | ISS-179 | frontend/src/components/reui/autocomplete.tsx:7 header says 'a handful' of edits while grep -c 'SOLVRO PATCH' = 6; no registry hash recorded in any vendored ReUI header (only 'Retrieved' date); CommandPalette.tsx:201 still overrides input base styles with no test. |
| 688 | Palette result-state machine: error vs empty | already-closed | — | struck in the snapshot |
| 708 | Palette visual polish | open | ISS-052 | frontend/src/components/CommandPalette.tsx:247 still sets data-highlighted:bg-surface-container; :201 input still has inert flex-1; frontend/src/components/layout/TopBar.tsx:164-165 search trigger has no hover/focus classes; TopBar.tsx:175 hardcodes '⌘K'. |
| 729 | Shared body-scroll-lock helper needed | already-closed | — | struck in the snapshot |
| 742 | Cmd-K toggle-close effectively unreachable | already-closed | — | struck in the snapshot |
| 759 | search.spec.ts polish and listener-ready guard | open | ISS-154 | e2e/tests/search.spec.ts:97 `res.json()` without res.ok check; :85 task=${target.id} regex unanchored; :31 comment cites tasks.ts:22; no TopBar-visible guard before any page.keyboard.press('ControlOrMeta+k') (lines 75,101,135,168). |
| 788 | dropdown-menu SubContent shares popover's z-index-on-Popup gap | open | ISS-053 | frontend/src/components/ui/dropdown-menu.tsx:272 `<Positioner>` in DropdownMenuSubContent has no positionerClassName and Popup hardcodes z-50 (:276). Tooltip is already patched (ui/tooltip.tsx:39-54). |
| 804 | GanttDatePicker uses shadow-md and may be dead code | open | ISS-102 | frontend/src/components/reui/gantt/gantt-nav.tsx:358 defines GanttDatePicker, :394 PopoverContent has no shadow override (popover.tsx default shadow-md); no import/JSX use elsewhere in frontend/src (grep). |
| 819 | Display mismatch between collapsed DATES row and opened editor | already-closed | — | struck in the snapshot |
| 869 | e2e drag-reorder first-attempt flakes (list-dnd/kanban-dnd/gantt-parity) | unverifiable | ISS-145 | Last observed 2026-08-07 (CI 31143153025). CHANGELOG.md:89 (seededProject now per spec file) names list-dnd 'Gamma onto Alpha', kanban-dnd R3 and gantt-parity connectors as caused by shared seeded state, but mobile touch reorder (kanban-dnd) and list-dnd gantt row drag are not named and no post-fix run is recorded. e2e/playwright.config.ts:10 retries: 1. |
| 908 | Baseline as-of default derives today in UTC | already-closed | — | struck in the snapshot |
| 939 | Gantt tree Dates cell shows range text twice while editing | open | ISS-103 | frontend/src/components/gantt-v2/TreeCells.tsx:54-84: the trigger button stays rendered while editing is true and InlineDateRangeEditor mounts below it. |
| 952 | React warning: CalendarDayButton function component refs | already-closed | — | struck in the snapshot |
| 971 | East-of-UTC display quirk in local-midnight editors | already-closed | — | struck in the snapshot |
| 1003 | /tasks?overdue=true filters by instant, not calendar day | already-closed | — | struck in the snapshot |
| 1025 | Portfolio rollup overdue compares server local midnight | already-closed | — | struck in the snapshot |
| 1046 | backend tsconfig include never reaches scripts/ or test/ | open | ISS-146 | backend/tsconfig.json:17 `"include": ["src/**/*.ts"]` still; gates.sh:98 runs `npx tsc --noEmit` only. Same root cause as the later Application-review tsconfig entry (ISSUES.md ~line 1529). |
| 1064 | TaskPanel subtask drag may flicker back before reorder commits | open | ISS-110 | TaskPanel.tsx:833 onValueChange={() => {}} still a no-op; queries.ts:1998 useUpdateTask.onMutate still awaits cancelQueries before the optimistic re-pack |
| 1076 | SectionReorderModal has no permission check of its own | open | ISS-111 | components/SectionReorderModal.tsx has no canEdit/permission reference; only mount is pages/views/ProjectList.tsx:630, whose entry button is gated by canEdit at :487 |
| 1086 | useUpdateSection scope can diverge from server after a failed PATCH | open | ISS-112 | queries.ts:2310 scope sections-${projectId} and onError rollback at :2347 unchanged; SectionReorderModal re-seeds only on [open] (:56) |
| 1098 | Every SortableItem is in the tab order, even for read-only viewers | open | ISS-077 | reui/sortable.tsx:359 still spreads ...attributes (role=button, tabIndex=0) on every item; gates.sh EXPECTED_SORTABLE_PATCHES=0 (:194) so no patch exists |
| 1112 | SectionReorderModal drag guard can strand the modal | open | ISS-113 | SectionReorderModal.tsx:37-56,69-70: isDraggingRef blocks handleModalClose; reset effect depends only on [open]; reset only in onDragEnd/onDragCancel (:88,:91) |
| 1125 | No e2e spec for the Reorder sections modal drag | open | ISS-155 | Subtask drag is now covered (e2e/tests/kanban-dnd.spec.ts:226, commit 5847527); grep finds no spec for the 'Reorder sections' modal in e2e/tests |
| 1144 | Form-error Alert migration covers 5 of 26 callout sites | already-closed | — | struck in the snapshot |
| 1161 | Stat-card Frame evaluation for Overview and Executive deferred | decision | ISS-054 | Overview.tsx and Executive.tsx contain no Frame usage; the owning plan docs/archive/plans/reui-component-migration.md:36 records it as a future one-off |
| 1165 | IconTile outline variant invisible by default in dark theme on lowest surface | open | ISS-085 | reui/icon-tile.tsx:37 outline variant unchanged (bg-background dark:bg-input/32); file last touched by 129ec72, its original vendoring commit |
| 1174 | Dev-DB residue from visual verification | already-closed | — | struck in the snapshot |
| 1193 | Duplicate-chip mouse race | already-closed | — | struck in the snapshot |
| 1231 | Pointer-dependent initial submenu highlight | open | ISS-055 | reui/filters.tsx:1521 setHighlightedIndex(0) effect unchanged alongside onMouseEnter highlight (:1496) |
| 1237 | Old focus/shadow style survivors after unification | already-closed | — | struck in the snapshot |
| 1255 | Toolbar text-size drift in migrated filter rows | decision | ISS-056 | index.css:81,83 maps text-xs=13px, text-sm=15px; filters.tsx rows still mix text-xs/text-sm sizes |
| 1272 | Badge solid-tone variants not for use until chip rebase | open | ISS-086 | reui/badge.tsx:31-52 info/success/warning/destructive still bg-{tone} text-white with the NOT FOR USE comment; no consumer found for these variants |
| 1287 | Nested anchors in Customers.tsx | obsolete | — | Customers.tsx is now a DataGrid; links at pages/Customers.tsx:211 and :248 are sibling cell links, not nested in an outer card Link |
| 1300 | data-grid-column-header hasControls branch ignores right-align | open | ISS-114 | reui/data-grid/data-grid-column-header.tsx:434-439 KNOWN GAP marker, branch returns -ms-2 justify-between with no alignEnd |
| 1309 | Four hand-rolled tables remain un-migrated | already-closed | — | struck in the snapshot |
| 1318 | Admin Users tab grid container tone mismatch | already-closed | — | struck in the snapshot |
| 1332 | Admin KPI strip renders zeros during load | already-closed | — | struck in the snapshot |
| 1345 | text-[10px] Needs role chip has no scale token | fixed | — | Commit 186892a (2026-10-05) removed all text-[10px] from Admin.tsx; the chip now uses text-label-caps at Admin.tsx:266 |
| 1352 | personNameSortingFn typed SortingFn<any> | already-closed | — | struck in the snapshot |
| 1365 | Backend /tasks?overdue=true compares a server instant | already-closed | — | struck in the snapshot |
| 1392 | Sortable DataGrid header cannot center-align | open | ISS-115 | data-grid-column-header.tsx:107 alignEnd only; ProjectRisks.tsx:374,405 still enableSorting:false to keep headers centered |
| 1403 | filters-duplicate-chip e2e spec is an invariant net, not a discriminating test | unverifiable | ISS-156 | Audit 2026-11-18: the spec approximates an upstream race that cannot be reproduced on demand; a limit of the test, kept as watch. |
| 1412 | Duplicate-chip guard uses === and misses object-valued options | open | ISS-057 | reui/filters.tsx:2329-2340 findFilterMatch compares values with === |
| 1418 | filters.test.ts colocated in vendored reui/ and imports a patched export | open | ISS-157 | reui/filters.test.ts imports findFilterMatch (a SOLVRO PATCH export); gates.sh:211 EXPECTED_FILTERS_PATCHES=18 matches filters.tsx's 18 markers, no guard on the test import |
| 1426 | Admin Project Overrides reassign select renders every candidate per row | open | ISS-015 | pages/Admin.tsx:1586-1590 tamCandidates = all active users, :1693 one <option> per candidate in every row; GET /users still has no take (backend/src/routes/users.ts:15) |
| 1445 | Screen and PDF Gantt export diverge on bar treatments | open | ISS-139 | lib/gantt/exportPdf.ts:843-845 still draws flat black progress overlay; :729 rollup still fillRoundedRect radius 1.5; SolvroBar.tsx still has progressHatchBackground and data-rollup |
| 1458 | Create-mode parent picker offers subtasks the server rejects | open | ISS-042 | TaskFormModal.tsx:194-195 possibleParents filter `!editingTask \|\| (...)` is always true in create mode, so subtasks are listed |
| 1470 | Gantt drag-clone keeps shadow-lg without a SOLVRO PATCH marker | open | ISS-104 | reui/gantt/gantt-dnd.tsx:310 barEl.className still includes shadow-lg, no marker; SolvroGantt.tsx has no shadow-md left (first holdout moot) |
| 1487 | Sortable row accessible name concatenates children; nested button in role=button | duplicate | ISS-077 | Same root as S3-04: reui/sortable.tsx:359 spreads dnd-kit attributes (role=button, tabIndex=0) onto the row |
| 1499 | createTask helper duplicated across e2e specs | open | ISS-158 | e2e/tests/gantt-parity.spec.ts:51 and e2e/tests/date-picker.spec.ts:151 still define private createTask; shared one at e2e/fixtures/seed.ts:173 |
| 1511 | xlsx@0.18.5 npm-audit advisories accepted | already-closed | — | struck in the snapshot |
| 1517 | PRD 2.7 per-PIC Overview summary cards omitted | obsolete | — | Recorded as a deliberate spec deviation, not a defect; per-PIC drill-down shipped via components/pipeline/PicDrillDownModal.tsx and analytics.ts per-PIC functions |
| 1521 | Light-theme hover contrast: hover:bg-primary-container with text-on-primary | open | ISS-078 | 27 lines in frontend/src still pair hover:bg-primary-container with text-on-primary; index.css:211 primary-container is 200 230 207 against on-primary 255 255 255 |
| 1526 | DealCard reads the full deal list client-side | open | ISS-118 | components/DealCard.tsx:82 useOpportunities({ live: false }) then find by projectId |
| 1530 | Backend tsx watch inotify staleness observed once | unverifiable | ISS-170 | backend/package.json:8 dev script is still `tsx watch src/index.ts`; observed once on a dev host, not reproducible from code |
| 1533 | backend/tsconfig.json excludes scripts/ from the typecheck | duplicate | ISS-146 | backend/tsconfig.json include is ["src/**/*.ts"] with rootDir src |
| 1536 | Import parse silently defaults unparseable Win Probability to 50 | open | ISS-119 | backend/src/lib/pipelineImport/parseRow.ts:221-222 Number.parseInt NaN falls back to 50; the range check at :223 only fires for parsed numbers |
| 1539 | Pipeline cutover checklist: retire standalone Velora stack | unverifiable | ISS-171 | Repo-side acts are done (docker-compose.yml:26 'No Velora services'); the remaining act, retiring /opt/velora and its GitLab CI, is external to this repo |
| 1564 | Phase-2 requirement: Velora middleware accepts any shared-secret JWT | already-closed | — | struck in the snapshot |
| 1578 | velora-cron auto-hold runs on a UTC crontab | already-closed | — | struck in the snapshot |
| 1586 | Velora's own GitLab CI still deploys a standalone stack | already-closed | — | struck in the snapshot |
| 1605 | Declined nit: no compose profile gates the Velora services | obsolete | — | docker-compose.yml:26 says 'No Velora services: the Pipeline module is native Solvro code'; the services were removed, so the profile question is moot |
| 1622 | ConfirmModal warning tone used raw amber and rounded-lg | fixed | — | Commit fcde2c6 'fix(ui): accessible warning tone in confirm dialogs'; ConfirmModal.tsx:36-37 now uses rounded-sm bg-warning-solid text-on-warning, no rounded-lg or amber left |
| 1631 | ProjectRisks inline cells use plain select instead of ui/select | open | ISS-058 | pages/views/ProjectRisks.tsx:378,409,457 are plain <select> elements; the file does not import ui/select |
| 1638 | daily-review.spec.ts leaves a new ACTIVE project and customer per run | open | ISS-159 | e2e/tests/daily-review.spec.ts header lines 25-36 still claim no DELETE route and the file has no afterAll/afterEach cleanup, though DELETE /projects/:id and /customers/:id exist (routes/projects.ts:330, customers.ts:308) |
| 1652 | Vendored ui/* and reui/* still carry the fuller focus form | open | ISS-087 | ui/input.tsx:39, button.tsx:8, checkbox.tsx:17, select.tsx:59, textarea.tsx:38, scroll-area.tsx:26, reui/badge.tsx:22, autocomplete.tsx:32, gantt-bar.tsx:296, gantt-view.tsx:2283 all keep focus-visible:border-primary; DESIGN.md:327 now prescribes ring-only |
| 1662 | GET /notes/recent has no index leading with noteDate | open | ISS-020 | prisma/schema.prisma:663-665 ProjectNote indexes [projectId,createdAt],[authorId],[projectId,noteDate]; :685-686 CustomerNote [customerId,noteDate],[authorId]; routes/notes.ts:61-71 filters by noteDate alone |
| 1685 | Material Symbols size utilities are inert app-wide | duplicate | ISS-043 | frontend/index.html:20 still loads the Google stylesheet unlayered; index.css:345-349 only sets font-variation-settings in @layer components; CriticalPathMark.tsx:34,63 still needs text-[Npx]! |
| 1698 | Three pre-existing flaky e2e tests retried clean (gantt-parity, kanban-dnd) | unverifiable | ISS-160 | Flake observed once during a gate run; still-present specs: e2e/tests/gantt-parity.spec.ts:247,(c) hover case; e2e/tests/kanban-dnd.spec.ts:1069-1073 (R3), :1110+ (mobile touch). Cannot be reproduced statically. |
| 1709 | CriticalPathMark chip padding coupled to Chip's DOM shape | open | ISS-059 | CriticalPathMark.tsx:56 `[&>span]:px-1.5`; StatusChip.tsx Chip (line ~72) still a single <span>, comment at CriticalPathMark.tsx:50 documents the coupling |
| 1717 | Three narrow task selects omit isCriticalPath | open | ISS-033 | grep isCriticalPath finds nothing in backend/src/routes/dailyReview.ts, routes/search.ts or lib/portfolio.ts |
| 1724 | Tasks.tsx grid and kanban-v2 SubtaskRow show no Critical Path mark | open | ISS-060 | pages/Tasks.tsx:294 renders PriorityBadge compact, no CriticalPathMark (grep 'Critical' in the file is empty); kanban-v2/cards.tsx SubtaskRow (line 224+) has neither PriorityBadge nor CriticalPathMark |
| 1733 | index.css chip-violet comment is stale | open | ISS-180 | frontend/src/index.css:160 still says chip-violet is 'the only chip hue with no status meaning assigned elsewhere' |
| 1738 | Dark-theme Gantt bar ring contrast for the Critical Path mark | open | ISS-105 | SolvroBar.tsx:328 still uses outline-chip-violet-text for the mark; palette.ts:25-30 CRITICAL_PATH_HEX is light-only; no decision recorded |
| 1761 | TaskPanel header-menu failure alert renders below the subtasks | open | ISS-061 | TaskPanel.tsx:991-995 renders the error Alert after the Document links block, below the subtasks list; handleDuplicate/delete set it via setError (lines ~361-387) |
| 1770 | useCreateTask omits the Daily Review invalidation | open | ISS-021 | queries.ts useCreateTask (line 2172-2197) invalidates projectTasks, tasks, overview, health, activity, members, epics but not queryKeys.dailyReviewRoot |
| 1778 | DELETE /tasks/:id never re-packs sibling positions | open | ISS-027 | backend/src/routes/tasks.ts:600-625: bare tx.task.delete, no closeGap/re-pack |
| 1789 | POST /tasks/:id/duplicate needs task:write, create needs project:write | open | ISS-006 | tasks.ts:635 duplicate requires task:write; projects.ts:598 POST /:id/tasks requires project:write; plan Decision 11 records it as settled |
| 1800 | ProjectList section-header actions gate on task:write; routes need project:write | open | ISS-062 | ProjectList.tsx:119 `canEdit = hasPermission(user,"task:write")`; sections.ts:117,167,253 requirePermission('project:write') |
| 1813 | gates.sh exercises only one e2e spec | open | ISS-147 | .claude/scripts/gates.sh:94 runs only tests/smoke.spec.ts |
| 1820 | useDuplicateTask/Section isPending includes inactive-query refetches | open | ISS-022 | queries.ts useDuplicateTask (line ~2200-2228) still Promise.all's every invalidation; useDuplicateSection analogous |
| 1839 | Material Symbols glyphs fold into accessible names | fixed | — | Commit 477c2e0 (antislop audit 001) plus CHANGELOG line 209: 'Icons across the app are hidden from screen readers...'; scan of frontend/src finds 232 icon spans, only 5 without aria-hidden and all are labelled role=img/button controls; gates.sh design-icon-hidden guard (CHANGELOG line 176) |
| 1863 | Missing-title banner doesn't name the offending card | open | ISS-063 | MidweekSyncModal.tsx:171 and ReflectionSyncModal.tsx:202 still set a single form-level error string |
| 1886 | itop_tickets low-cardinality @@index([status]) | already-closed | — | struck in the snapshot |
| 1897 | iTop datetimes are parsed as UTC | already-closed | — | struck in the snapshot |
| 1910 | GET /customers/:id itopOrgId/itopOrgName not typed or used on frontend | open | ISS-064 | queries.ts CustomerDetail (line 157) lacks the fields; CustomerDetail.tsx:50 comment and line 206 still derive itopOrgName from the tickets endpoint |
| 1927 | No pino redact configuration for the iTop token | open | ISS-007 | backend/src/logger.ts has no redact option; grep redact in backend/src only finds http/requestLogger.ts URL/header scrubbing |
| 1940 | TimeSpent duration unit assumed to be seconds | unverifiable | ISS-120 | types.ts:177 ITOP_TIME_SPENT_DURATION_IN_SECONDS = true; real-install Time Tracking extension not probed (still listed as not bundled, S4-44) |
| 1949 | Full-sync removal passes bind one parameter per row (notIn) | open | ISS-016 | backend/src/lib/itop/sync.ts:752 (`id: { notIn: [...seenIds] }` in time-entry removal) and :913 (ticket removal) |
| 1973 | Duplicating a task or section drops its pinned iTop ticket ref | fixed | — | Commit 0e6351b: backend/src/lib/duplicate.ts:16-18 now documents the decision that itopTicketRef is never copied ('a copy must not pin the same iTop ticket as its source'); behaviour unchanged and now explicit |
| 1985 | A task cannot be created with an iTop ticket ref pre-set | open | ISS-034 | createTaskSchema in backend/src/routes/projects.ts has no itopTicketRef (grep empty); only tasks.ts:91 PATCH accepts it |
| 1993 | Focus treatment sweep (focus:border-primary sites) | fixed | — | Commits 14e72e8 and 4b99d9c (a11y focus ring on iTop sheets, admin, settings); CHANGELOG line 324/354 'One focus treatment'. grep 'focus:border-primary' in frontend/src now finds only ui/calendar.tsx:75 (has-focus, sanctioned by DESIGN.md) |
| 2006 | Gantt Excel export has no iTop ticket column | open | ISS-140 | frontend/src/lib/gantt/exportExcel.ts buildTasksSheet columns (lines 87-95) have no iTop column; grep itop in the file is empty |
| 2022 | Personal-token expiry is best-effort, not guaranteed | unverifiable | ISS-123 | backend/src/routes/itopUser.ts:204-232 stores expiresAt null on any PersonalToken read failure; documented limitation, behaviour depends on the install's profile |
| 2035 | A token's write capability can't be verified up front | unverifiable | ISS-124 | itopUser.ts:168-177 list_operations probe is logger.debug only and never rejects the token; iTop gives no way to test profile rights |
| 2048 | Token-ownership check: residual risk on some iTop installs | unverifiable | ISS-002 | itopUser.ts:195-232 falls back to the email check when PersonalToken is unreadable or readable beyond the token's own user; real-install behaviour (code 100 path) not recorded |
| 2064 | rounded-full on iTop filter/tab pills vs DESIGN.md Radius | fixed | — | TicketFilters.tsx:20 and TicketLog.tsx:16 now use rounded-sm; grep rounded-full in both files is empty; TicketLog's rounded-full was removed by ea7d8f6 (git show ea7d8f6:.../TicketLog.tsx has 0) |
| 2079 | Scope chips visible but inert in Board view | already-closed | — | struck in the snapshot |
| 2090 | Drop lifecycle graph assumes iTop's default stimuli | unverifiable | ISS-125 | dropMapper.ts:40-48 TRANSITIONS table still hard-codes ev_assign/pending/resolve/close/reopen; no per-install config; depends on the real install's lifecycle |
| 2101 | Mobile iTop board is a single stacked column with touch drag | unverifiable | ISS-126 | TicketBoard.tsx:180,263 still `grid gap-3 md:grid-cols-5`; never evaluated against real phone use |
| 2109 | Services pick-list cache is busted on admin settings change | fixed | — | Commit ea7d8f6 introduced bustItopServicesCache(); routes/itopAdmin.ts:405,428,440 call it next to every config bust; routes/itop.ts:983 |
| 2117 | GET /itop/services returns every organisation's services, unscoped | open | ISS-003 | backend/src/routes/itop.ts:987-1009: `SELECT Service` with no WHERE via the application token, no customer visibility check |
| 2145 | Running timer shared across users on one browser profile | already-closed | — | struck in the snapshot |
| 2154 | Stop-timer response myMinutesThisWeek is UTC-week bucketed | already-closed | — | struck in the snapshot |
| 2180 | useItopTicket utcOffsetMinutes isn't part of its query key | open | ISS-065 | queries.ts:3663-3685: key is queryKeys.itopTicket(id) only; the code comment (3664-3673) explains it is deliberately not folded in because other hooks share the key |
| 2191 | TimeSpent.ticket_ref attribute name unverified on the real install | unverifiable | ISS-121 | types.ts:163 ITOP_TIME_SPENT_TICKET_REF_FIELD = 'ticket_ref'; only backend/test/itop/fakeItop.ts enforces it; Time Tracking extension not available on the install |
| 2215 | Epic ownerId not validated against the project's people | open | ISS-035 | epics.ts:161-162 and projects.ts:805-806 now call assertActiveUser (users.ts:20) and errors.ts:75 maps P2003, but nothing checks owner membership of the project |
| 2232 | Application/personal token cannot read iTop's User class | unverifiable | ISS-122 | Real iTop 3.2.2 observation (Support Agent profile); not reproducible without the install; code path leaves User.itopUserId unset |
| 2233 | PersonalToken not readable by a Support Agent token | duplicate | ISS-002 | Same observation as the personal-token ownership/expiry entries; itopUser.ts:195-232 falls back to email match |
| 2234 | Go-live: personal_tokens_allowed_profiles setting not documented | open | ISS-181 | grep personal_tokens_allowed_profiles in docs/CONFIGURATION.md and backend/src finds nothing; CONFIGURATION.md:412 documents other iTop prerequisites |
| 2235 | Time Tracking extension is not bundled with iTop Community | unverifiable | ISS-127 | Environment fact about the iTop install; TimeSpent checks (duration unit, ticket_ref) cannot run until it is installed |
| 2236 | pending_reason assumed to be free text | unverifiable | ISS-128 | routes/itop.ts:762-768 requires fields.pending_reason as a free-text string; install-dependent |
| 2240 | Legacy exceptions to the binding UI-pass rules (animate-pulse, text sizes) | open | ISS-066 | animate-pulse still present in CustomerDetail, Overview(5), Projects, ProjectTimeline, ProjectRisks, Executive, AccountOverview(2), TicketsTab, TicketBoard, TicketPanel, TaskPanel(2), ServiceMappingList; SolvroGantt text-[11.5px] now 0; text-[12px] now 5 sites (was ~169) |
| 2253 | e2e flakes that pass on retry (list-dnd, kanban-dnd, gantt-parity) | duplicate | ISS-160 | Same specs as S4-02 (kanban-dnd R3 cross-view parity ~:1073, mobile touch ~:1110; gantt-parity drag-move :247; list-dnd.spec.ts:89); cause (sidebar width) unconfirmed |
| 2254 | Drawer has no focus management | fixed | — | Commit 1fd97ed: Drawer.tsx:3,51 uses useDialogFocus (trap, restore); CHANGELOG line 549-551 'The slide-in Drawer now traps focus like Modal does' |
| 2255 | contrast.ts pickContrast has no callers left | fixed | — | frontend/src/lib/contrast.ts no longer exists; deleted in c2e5389 (git log --diff-filter=D); grep pickContrast in frontend/src is empty |
| 2256 | CORS config has no exposedHeaders (X-Total-Count) | open | ISS-036 | backend/src/app.ts:62-68 cors({origin, credentials}) has no exposedHeaders; tasks.ts:333 still sets X-Total-Count |
| 2257 | GET /tasks still caps at 200 rows | duplicate | ISS-014 | backend/src/routes/tasks.ts:328 `take: 200`; Tasks.tsx:457-459 shows 'Showing N of total'; same root cause as docs/ISSUES.md line 571 |
| 2261 | Flaky e2e: auth.spec 'admin page right after sign-in' fails on mobile | fixed | — | Commit 4486833 (2026-10-16) 'Keep the session when a page is left right after sign-in'; CHANGELOG: 'A reload or a page opened right after sign-in keeps the session... any failed check used to delete the stored session token, so the next page opened on the sign-in form.' Regression test 'leaving the page while /auth/me is in flight keeps the session' at e2e/tests/auth.spec.ts:~90. |
| 2262 | TaskPanel shows 'Loading task…' forever when the tasks fetch fails | open | ISS-067 | frontend/src/components/TaskPanel.tsx:~218-230: notFound = tasks !== undefined, so a failed fetch (tasks undefined) still renders 'Loading task…'; no isError branch for the tasks query. |
| 2263 | eslint-disable exhaustive-deps comments are inert: frontend has no ESLint config | duplicate | ISS-143 | No eslint config under frontend/ or repo root (ls finds none; frontend/package.json has no lint script); 24 'react-hooks/exhaustive-deps' occurrences under frontend/src. Entry itself names the earlier Tech-debt entry 'ESLint exhaustive-deps disable comment is inert; repo has no lint config' as the same root cause. |
| 2267 | Hung PATCH /tasks/:id blocks later saves of the same task (no apiRequest timeout | fixed | — | frontend/src/lib/api.ts:~38-48 DEFAULT_REQUEST_TIMEOUT_MS = 30_000 with requestSignal; commit 1fd97ed; CHANGELOG 'Every API request now times out after 30 seconds (frontend/src/lib/api.ts, requestSignal)'. The entry's own suggested fix; the save chain resumes after the timeout. |
| 2268 | Panel date edits can leave a task with due date before start date | open | ISS-028 | backend/src/routes/tasks.ts PATCH handler (~515-535) only writes dates and applies the milestone lockstep; the only date refine (~line 100) is milestone-needs-due-date. No start <= due check anywhere in the route. |
| 2269 | Flaky backend test: taskOrdering 'orders GET /tasks (cross-project)' | unverifiable | ISS-161 | backend/test/taskOrdering.test.ts:104 still asserts against the GET /tasks list, which is still `take: 200` (backend/src/routes/tasks.ts:328). vitest.config.ts has fileParallelism:false since commit 3d06d10, so the described 'parallel run' cause cannot be confirmed from code; flake is run-dependent. |
| 2270 | Dev backend container can serve stale routes/tasks.ts after an edit (tsx watch) | unverifiable | ISS-172 | Environment-specific observation (Docker bind mount + `tsx watch`, backend/package.json dev script); not reproducible from code. Cause never investigated. |
| 2271 | Per-call mutate onError callbacks can be lost in SolvroGantt.tsx | open | ISS-106 | frontend/src/components/gantt-v2/SolvroGantt.tsx:~1640 (updateTask.mutate(..., {onError}) on the critical-path menu item) and ~642 (updateSection.mutate per section inside patches.forEach). Drag and reorder paths were moved to mutateAsync (CHANGELOG 'A refused Kanban move now says why'), but these two sites remain. |
| 2272 | Filters popover keeps stealing focus after a filter is chosen | unverifiable | ISS-068 | Timing-dependent focus behavior seen as CI-only failures on the production build; e2e/tests/task-conflict.spec.ts:~325-345 still works around it by waiting for the popover to hide. Cause in the vendored filters component never investigated. |
| 2276 | Mention chips resolve against the whole directory, including deactivated users | open | ISS-069 | frontend/src/lib/mentions.ts:~176-200 taskMentionPeople: `known` (chip source) deliberately includes everyone in the directory plus project people, so a deactivated user still renders as a normal chip; candidates are filtered to active only. No muted/tooltip treatment. |
| 2277 | Recipient concurrency tests never shown to fail without the row lock | open | ISS-162 | backend/test/activity.test.ts:~204 ('two simultaneous identical assignee PATCHes record exactly one assignee change') and backend/test/notifications.test.ts:128 are unchanged; no record anywhere that they were mutation-checked against a removed lock. |
| 2278 | Activity feed orders by id while the index is (project_id, created_at desc) | open | ISS-023 | backend/src/lib/activity.ts:278 orderBy { id: 'desc' }; backend/prisma/schema.prisma:~360 indexes are [projectId, createdAt desc], [opportunityId, createdAt desc], [createdAt], [actorId] — no (project_id, id desc). |
| 2279 | Admin TAM reassignment is not in the activity log | fixed | — | Commit 7b45f7b (B-19 part 2); CHANGELOG 'Project handovers through the admin reassign endpoint (PUT /admin/projects/reassign) now appear in the project activity feed with the old and new TAM and send the new TAM an assigned notification'. Test: backend/test/notifications.test.ts:149 'admin project reassign (F-25)'. |
| 2283 | Guest page still loads Google Fonts from Google | open | ISS-141 | frontend/index.html:13-20 still preconnects to and loads fonts.googleapis.com (Source Sans 3 and Material Symbols); frontend/security-headers.conf allows fonts.gstatic.com in font-src. |
| 2284 | Global errorHandler returns 500 for malformed JSON bodies | fixed | — | backend/src/http/errors.ts:~25-45 isBodyParserError maps entity.parse.failed to 400 and entity.too.large to 413; commit 2275683 (B-19 part 1); CHANGELOG 'A request with a malformed JSON body now gets 400 invalid_json, and a body over the size limit gets 413 payload_too_large, instead of a 500 error.' |
| 2285 | Rate limiter is in-process only | open | ISS-008 | backend/src/http/rateLimit.ts header comment: 'In-process only: one backend instance, no shared store'; still a Map-backed limiter. |
| 2286 | Guest links use the address the owner is browsing from | open | ISS-142 | frontend/src/components/ProjectShare.tsx:247 absoluteShareUrl(link.url, window.location.origin); no PUBLIC_BASE_URL setting in backend/src or docs/CONFIGURATION.md. |
| 2287 | Shared dialog focus trap only wraps from the last focusable element | open | ISS-088 | frontend/src/hooks/useDialogFocus.ts:~62-70: Tab wraps only when document.activeElement === last (Shift+Tab: first or the dialog itself); focus on a tabIndex={-1} element mid-dialog is neither, so Tab can leave. |
| 2295 | POST /admin/itop/test sends the stored application token to a new host | fixed | — | backend/src/routes/itopAdmin.ts:~473 now throws 400 token_required_for_new_host when body.baseUrl is given without body.appToken; commit 1fd97ed (review finding F-12). |
| 2296 | Personal-token ownership check is best-effort, not fail-closed | open | ISS-004 | backend/src/routes/itopUser.ts:~177-225: User and PersonalToken lookup failures are logged and the token is still accepted ('Neither failure rejects the token itself'; 'accepting the token, expiresAt left null'). |
| 2297 | iTop client follows redirects, forwarding the application token | open | ISS-129 | backend/src/lib/itop/client.ts:172-180: fetchImpl(endpoint, {method, headers incl. Auth-Token, body, signal}) passes no `redirect` option (default follow). |
| 2298 | Secrets at rest: no tag-length check, no AAD, no key rotation | open | ISS-009 | backend/src/lib/secretBox.ts: createDecipheriv(ALGORITHM, key, iv) at ~52 has no authTagLength option; no setAAD in seal/open; single SECRETS_KEY, format prefix FORMAT_VERSION only. |
| 2299 | Webhook rate limit is global, not per IP | open | ISS-130 | backend/src/routes/webhook.ts:22-24,90,129: RATE_LIMIT_MAX_ALL_CALLS = 60 per 60 s sliding windows module-level; does not use http/rateLimit.ts. |
| 2300 | Older tickets of a newly mapped iTop organisation wait for the next full sync | open | ISS-131 | backend/src/lib/itop/sync.ts:~874-879 incremental pull filters `last_update > lastSyncAt - 60s` for all orgs; backend/src/routes/itopAdmin.ts setCustomerOrgMapping (~591) re-links the existing snapshot but does not force a full sync. |
| 2301 | A failed iTop sync keeps half its work | open | ISS-132 | backend/src/lib/itop/sync.ts:403,~463 upsertTicket calls the global `prisma.itopTicket.upsert` (no transaction); backend/src/routes/itop.ts:206 deliberately withholds lastSyncError from /status for non-admins. |
| 2302 | 'Test connection' reports ok:false whenever TimeSpent is missing | open | ISS-133 | backend/src/lib/itop/client.ts:~102 PROBE_CLASSES includes TimeSpent; ~327 a failed class pushes ok:false; backend/src/routes/itopAdmin.ts:~493 `ok: probes.every(p => p.ok)`. |
| 2303 | Deployment note: itopUserId matching needs REST read rights on iTop's User class | unverifiable | ISS-134 | Depends on the iTop profile of a real install (not code). backend/src/routes/itop.ts:1303 still answers 'Your iTop user account is not linked yet'; not documented in docs/CONFIGURATION.md (grep finds no mention). |
| 2307 | TicketPanel: Escape in the Resolve/Team sheet also closes the panel | fixed | — | frontend/src/components/itop/TicketPanel.tsx:88-93 `sheetOpen = actionSheet !== null` and `if (e.key === 'Escape' && !sheetOpen) onClose()`; introduced by commit ea7d8f6 (2026-10-05, iTop port fixes). The 'mid-write unmount' remark is not separately evidenced. |
| 2308 | TaskTicketField: draft never reset after Clear/commit | fixed | — | frontend/src/components/itop/TaskTicketField.tsx: setDraft('') on commit (~147, 'Reset so a later focus-then-blur on the bare input can't re-pin this value'), on Clear (~210) and after create (~254); commit ea7d8f6. |
| 2309 | TicketLog: composer clears before iTop answers; PILL_BASE uses rounded-full | fixed | — | frontend/src/components/itop/TicketLog.tsx:42,68 onAdd(..., () => setText('')) clears only on success; PILL_BASE (line 15) is now `rounded-sm`; commit ea7d8f6. |
| 2310 | useTicketAction/useAddTicketLog do not invalidate itopTicketByRefRoot | fixed | — | frontend/src/lib/queries.ts:~3836 and ~3877 `qc.invalidateQueries({ queryKey: queryKeys.itopTicketByRefRoot })` in both useTicketActionFor and useAddTicketLog; added in commit ea7d8f6. |
| 2314 | Unchecked epic ownerId (pointer to the Epics section) | duplicate | ISS-035 | The line is only a cross-reference: 'filed in full under Epics — deferred findings (ported 2026-10-05) above (port plan §10, E-4); not repeated here' (heading at docs/ISSUES.md:2209). No separate problem recorded here. |
| 2318 | Members backfill also inserts project:view-all holders | open | ISS-024 | backend/prisma/migrations/20261004120700_project_members/migration.sql:31 SELECT DISTINCT over open-task assignees with no role filter; the migration is applied and unchanged. |
| 2319 | Backfill test checks a copy of the migration SELECT, not the file | open | ISS-163 | backend/test/taskAssigneeMembers.test.ts:~231-270 re-states the SELECT ('Same SELECT as prisma/migrations/20261004120700_project_members') instead of reading the migration file. |
| 2320 | Members button count and avatars exclude the SA | open | ISS-070 | frontend/src/components/ProjectMembers.tsx:35 `count = (members?.length ?? 0) + 1` (TAM + members) and avatars from TAM + members; SA appears only in the dialog and header facts. |
| 2324 | Seed resets built-in roles' permissions on every container start | fixed | — | backend/prisma/seed.ts:9 and :49 `update: {}, // never overwrite admin-edited permissions on re-seed`; commit 1fd97ed ('Close the review's P1 and first P2 findings: deploy wipe guard, seed...'). |
| 2325 | Frontend built-in role list omits SALES | open | ISS-071 | frontend/src/lib/auth.tsx:17 BUILTIN_ROLES = SA, TAM, ADMIN, STAKEHOLDER, PENDING; frontend/src/pages/Admin.tsx:514 filters custom roles with the same five names; backend/prisma/seed.ts:31 seeds SALES: ['pipeline:view']. |
| 2329 | setup.sh TRUST_PROXY default trusts every private address | open | ISS-173 | docs/CONFIGURATION.md:89,323 still document `loopback, uniquelocal` as the setup.sh default and the LAN/VPN spoofing caveat; unchanged. |
| 2330 | Dev stack: client reaching :5173 directly can forge clientIp | open | ISS-174 | docs/CONFIGURATION.md:89 states the dev stack uses TRUST_PROXY=1 (backend default); no change to this. |
| 2334 | Spine list prose in CLAUDE.md and the SPINE regex in gates.sh are maintained by | open | ISS-182 | .claude/scripts/gates.sh:354 holds the SPINE regex; root CLAUDE.md 'Spine' paragraph lists the same areas in prose; no check compares them (gates.sh has no consistency step). |
| 2338 | Personal-token acceptance looser than the iTop-writes guardrail | duplicate | ISS-004 | Same root cause and file as the 'Personal-token ownership is checked best-effort' entry (backend/src/routes/itopUser.ts:~177-225, still accepting on lookup failure). This entry is the decision framing of that one. |
| 2339 | Loading states without SkeletonRegion in ported iTop/customer/utilization UI | open | ISS-072 | grep SkeletonRegion = 0 in TicketsTab.tsx, TicketPanel.tsx, itop/board/TicketBoard.tsx, customer/AccountOverview.tsx (7 bare <Skeleton>), pages/Utilization.tsx (1 bare Skeleton), ProjectMembers.tsx, Overview.tsx, CustomerDetail.tsx, Executive.tsx; component exists at frontend/src/components/skeletons/SkeletonRegion.tsx. |
| 2340 | iTop ticket board is not wired into the drag guard | open | ISS-108 | frontend/src/components/itop/board/TicketBoard.tsx:238 onDragStart/onDragEnd/onDragCancel only set local state; no useDragActivityGuard (used by SolvroKanban.tsx:221, SolvroPipelineKanban.tsx:126); the refetchInterval in useCustomerTickets (frontend/src/lib/queries.ts:~3528) is not gated on shouldPauseRefresh; comment 'The first refetchInterval in the app' still present. |
| 2341 | Arbitrary text-[12px] instead of named roles in the ported iTop UI | fixed | — | grep 'text-\[12px\]' finds none in frontend/src/components/itop/** or pages/Settings.tsx (remaining hits are icon spans in Admin.tsx/kanban-v2/cards.tsx). Commits 1712304 'refactor(type): caps labels in forms and iTop sheets' and 477c2e0 (Settings redesign). |
| 2342 | backend/src/routes/itop.ts cites a date-contract plan path that does not exist | fixed | — | backend/src/routes/itop.ts:432 cites docs/archive/plans/date-contract-utc-midnight.md and that file exists (added by commit 4d6e9d0 'Archive shipped plans...'); the entry's trigger ('fix the comment when the plan is archived') is met. |
| 2343 | Root CLAUDE.md INTERNAL-notes guardrail points at nonexistent frontend/src/lib/e | fixed | — | CLAUDE.md Guardrails now say `frontend/src/lib/gantt/export*.ts`; grep finds no 'lib/export/' in CLAUDE.md; ls frontend/src/lib/export fails. Commit 34cfcf9 'chore: point agent instructions at the code that exists'. |
| 2344 | Main frontend bundle just over 2 MiB | already-closed | — | struck in the snapshot |
| 2350 | DELETE /customers/:id accepts a TAM who owns one project under the customer | already-closed | — | struck in the snapshot |
| 2351 | A customer becomes unowned when its owner is deleted | already-closed | — | struck in the snapshot |
| 2352 | GET /users still returns email to every project:read / pipeline:view caller | open | ISS-010 | backend/src/routes/users.ts:12 requireAnyPermission('project:read','pipeline:view'); :19,:40 select and return `email` for every user. |
| 2358 | LinksSection departs from the DESIGN.md §4 focus treatment (buttons lack focus-v | open | ISS-089 | frontend/src/components/LinksSection.tsx: inputs now use FIELD_FOCUS (line 7; CHANGELOG 'Fields in ... the links section drop the green focus border and use the shared focus ring', commit 14e72e8), but the buttons at lines 134, 170, 180, 331-338, 369-377 carry no focus-visible class and frontend/src/index.css has no global focus-visible rule. |
| 2364 | Backend dependency advisories (B-04) | already-closed | — | struck in the snapshot |
| 2365 | Malformed JSON bodies answer 500, not 400 | already-closed | — | struck in the snapshot |
| 2366 | xlsx 0.18.5 parses user workbooks (B-18) | already-closed | — | struck in the snapshot |
| 2367 | Browser security headers on the SPA (B-06) | already-closed | — | struck in the snapshot |
| 2368 | Product decisions: STAKEHOLDER/SA task comments; built-in role policy | decision | ISS-005 | No CHANGELOG or code change records either choice; entry still states both questions open. Policy A is in force (CHANGELOG 'The database seed no longer overwrites built-in roles'). |
| 2369 | No server-side logout (B-12) | already-closed | — | struck in the snapshot |
| 2370 | setup.sh aborts non-interactively when /dev/tty cannot be opened (B-13) | already-closed | — | struck in the snapshot |
| 2371 | No scheduled backup or tested restore (B-14) | already-closed | — | struck in the snapshot |
| 2372 | Request logs keep /search query strings (B-15) | already-closed | — | struck in the snapshot |
| 2373 | Reorder re-pack is O(n) UPDATEs with no lock (B-16) | already-closed | — | struck in the snapshot |
| 2374 | Main bundle 2.10 MB with no route splitting (B-17) | already-closed | — | struck in the snapshot |
| 2375 | Backend hardening set (B-19) | already-closed | — | struck in the snapshot |
| 2376 | UX set (B-20) | already-closed | — | struck in the snapshot |
| 2377 | Gantt drag is pointer-only (F-36) | already-closed | — | struck in the snapshot |
| 2378 | Material Symbols stylesheet overrides icon size/display utilities | open | ISS-043 | frontend/index.html:19-22 still links the Material Symbols stylesheet as an unlayered <link>; index.css:345-349 only sets font-variation-settings in @layer components. No later fix found. The earlier entry near line 1681 is the same root cause (this one carries the measurement). |
| 2379 | About 30 primary buttons use hover:bg-primary-container with white text | open | ISS-079 | grep finds 24 class lists with hover:bg-primary-container and no hover:text-on-primary-container, e.g. DateRangeField.tsx:332, LabelPicker.tsx:113, CommentMentions.tsx:212, admin/ItopTab.tsx:423, pipeline/SolvroPipelineKanban.tsx:316. index.css:210-211 light on-primary 255 255 255 over primary-container 200 230 207. |
| 2380 | Sign-in failure counters share the client address with the guest-link limiter | open | ISS-011 | backend/src/routes/auth.ts:35-44,56-64: loginAddressLimiter (50 per 15 min) keys on rateLimitKey(req.ip) and blocks every account from that address; no per-account-only fallback exists. |
| 2381 | list-dnd 'cross-status reorder in one section sticks' failed locally | unverifiable | ISS-164 | Audit 2026-11-18: the commit that fixed a related flake (2acec79) does not prove this failure gone; reopened as watch until a CI run shows it. |
| 2382 | Cross-tab sign-out leaves the other tab on cached pages | open | ISS-012 | frontend/src/lib/api.ts:158 still guards the 401 handler with 'token && getToken() === token'; grep finds no 'storage' listener in frontend/src/lib/auth.tsx. |
| 2383 | A lazy page chunk that fails twice stays failed | open | ISS-073 | frontend/src/lib/lazyPage.ts: importWithRetry retries once after 400 ms, but React.lazy caches the second rejection; the doc comment names 'Reload page' as the way out. |
| 2384 | Bundle budget headroom is about 43 kB | open | ISS-175 | frontend/scripts/check-bundle-size.mjs:11 still states a 1 MB budget and ~957 kB entry. Actual current size needs a build and was not measured. |
| 2385 | iTop time entries with blank duration are skipped every sync tick | unverifiable | ISS-135 | backend/src/lib/itop/sync.ts:523-529 still skips a TimeSpent row with unparseable duration, now logged as one aggregate warn (:713). Whether blanks are transient needs a real iTop install. |
| 2386 | Section duplicate does one INSERT per copied task under a 30 s transaction | open | ISS-025 | backend/src/lib/duplicate.ts:63 tx.task.create per task; backend/src/routes/sections.ts:239-243 still sets timeout 30_000 and says duplicateTaskTree INSERTs per copied task. |
| 2387 | Section and epic create compute max(position)+1 outside the project lock | open | ISS-029 | backend/src/routes/projects.ts:724-732 (sections) and :799-803 (epics) run prisma.aggregate then create with no lockProject; lockProject is called only at :336, :612, :1199. |
| 2388 | Pipeline stage reorder re-packs one row per sibling | open | ISS-026 | backend/src/routes/opportunities.ts:350-380: insertAtStage and closeGapInStage loop tx.opportunity.update per sibling (stageOrder = i). |
| 2389 | accessibleNames.test pairs id/htmlFor by whole-file text search | open | ISS-165 | frontend/src/components/accessibleNames.test.ts: the id check is source.includes(`htmlFor="${id}"`) over the whole file and does not check the label has text (only the enclosing-label path does). |
| 2390 | iTop full-sync prune can exceed Postgres bind-parameter limit | open | ISS-136 | backend/src/lib/itop/sync.ts:752 and :913 still delete with { id: { notIn: [...seenIds] } }. |
| 2391 | Borderless inline-edit inputs show no keyboard focus indicator | fixed | — | Commit 3a081bb added FIELD_FOCUS/FIELD_FOCUS_WITHIN (frontend/src/lib/utils.ts:50-58). CHANGELOG 2026-11-02 'Visible keyboard focus in panels and the comment box' and 'in form dialogs'. Code now: TaskPanel.tsx:532,902,979 and TaskFormModal.tsx:438-592 carry ${FIELD_FOCUS}; EpicPanel.tsx:357 too; CommentMentions.tsx:186 wrapper has FIELD_FOCUS_WITHIN. |
| 2393 | White text on primary in three places | already-closed | — | struck in the snapshot |
| 2399 | Offboarding endpoint accepts a receiver whose role has zero permissions | open | ISS-030 | backend/src/lib/offboarding.ts: assertActiveUser at :236, :256, :269, :354, :487 only check active; only the deal PIC path (:366-375) checks canUserSeePipeline. frontend/src/lib/handover.ts:84-88 filters PENDING client-side only. |
| 2400 | Ordinary edit routes still accept an inactive user as assignee/TAM/SA/owner | open | ISS-037 | requireActive:false at backend/src/routes/projects.ts:506,509,633,806; customers.ts:429,510; epics.ts:162. Tolerance is intentional and noted in routes/projects.ts. |
| 2401 | A handover does not notify a new customer owner | decision | ISS-038 | backend/src/lib/offboarding.ts:506-516 logCustomerOwnerChanges only logs. activity_events_one_scope CHECK (migration 20261004121100) allows only project or opportunity scope. |
| 2402 | Missing tests: withDeadlockRetry and baseline lock reorder | open | ISS-166 | withDeadlockRetry now has backend/test/withDeadlockRetry.test.ts (commit 121c023, CHANGELOG 'Tests for ... the deadlock retry'). CHANGELOG notes the baseline route takes the project lock first (routes/projects.ts:324-336), but no test asserts the lock order (grep of backend/test finds only baseline date fixtures). |
| 2403 | tasks.ts object-spreads into where.project | open | ISS-039 | backend/src/routes/tasks.ts:264 still `where.project = { ...(where.project as object \| undefined), customerId }`. |
| 2404 | Tasks page makes an extra GET /projects request per visit | open | ISS-074 | frontend/src/pages/Tasks.tsx:122 still calls useProjects() to build projectStatusById for on-hold overdue handling (:316). |
| 2405 | No component tests for ProjectStatusChangeDialogs and HandoverModal | open | ISS-148 | grep of frontend/src and e2e finds no test importing either component; only pure-logic tests (lib/handover.test.ts, lib/projectStatusChange.test.ts) exist. No e2e covers the Pipeline PIC/SA handover sections or hold-days. |
| 2406 | Inline 'is'/'is any of' operator strings in Projects.tsx | open | ISS-075 | frontend/src/pages/Projects.tsx:94 `label: "is"` and :101 `label: "is any of"`. |
| 2407 | Stale preview in the handover dialog | open | ISS-076 | frontend/src/components/admin/HandoverModal.tsx:149-170: the preview reloads only when the server returns a stale error (reloadPreview after submit). |
| 2408 | Smoke test console-error check fails when the Google client ID rejects localhost | fixed | — | PR #244: the smoke console check ignores errors from Google's sign-in script |
| 2409 | gates.sh needs Node/npx on the host PATH for the smoke gate | open | ISS-176 | `.claude/scripts/gates.sh:94` runs `npx playwright test` on the host. |
| 2410 | CI stack could not be built locally (disk space) | unverifiable | ISS-177 | ci/docker-compose.ci.yml exists; e2e/tests/pwa.spec.ts and security-headers.spec.ts still need the built stack. Failure was a host disk shortage, not code. |
| 2411 | Six existing specs passed only on retry | already-closed | — | struck in the snapshot |
| 2412 | taskReorderConcurrency.test.ts:114 timed out once in a loaded gates run | unverifiable | ISS-167 | Observed once on 2026-11-12; the entry reports 5 passing reruns. backend/test/taskReorderConcurrency.test.ts present. Not reproducible from code. |
| 2418 | Backend-produced text with em dashes still reaches the interface | open | ISS-040 | backend/src/lib/projectHealth.ts:143 still returns "—"; opportunities.ts:629 'Invalid stage ... — must be one of'; itop.ts:686,801,834,948,1105,1303 and itopUser.ts:114 user-facing messages contain em dashes. design-no-em-dash (gates.sh:336) scans frontend/src only. |
| 2419 | text-on-surface-variant/60 on empty marks and the Login footer is about 3.6:1 | open | ISS-080 | frontend/src/pages/Login.tsx:305 (footer), :353,:373 (placeholders) and Admin.tsx:846,1838,1938 (EMPTY_VALUE spans) still use text-on-surface-variant/60. Line numbers in the entry have moved. |
| 2420 | Dark primary on dark surface-container-high is 4.4986:1 | decision | ISS-090 | frontend/src/lib/tokenContrast.test.ts:91-97 documents the 4.4986:1 gap and pins light only; index.css:259 dark --primary 58 174 81 on :251 surface-container-high 50 50 48. |
| 2421 | Two text sizes have no matching type role | open | ISS-091 | frontend/src/components/Modal.tsx:58 and Drawer.tsx:119 still use text-[14px]; frontend/src/pages/views/ProjectList.tsx:1077 text-[12.5px]. |
| 2422 | InstallBanner nests a role=button span inside a <button> | open | ISS-081 | frontend/src/components/InstallBanner.tsx:84-92: a <span role="button" ... text-[16px]> inside the outer <button> at :80. |
| 2423 | Epic colour swatches are 16px targets 4px apart | open | ISS-092 | frontend/src/pages/views/ProjectEpics.tsx:419 swatch buttons are h-4 w-4 in a gap-1 row with no tap-target (other icon buttons in the file at :488,:525,:548 have it). |
| 2424 | Smoke gate environment gaps (npx on host, Google origin 403) | duplicate | ISS-176 | Restates the entries at 2404 (Google client ID origin) and 2405 (npx on host); the entry says 'Same causes as the two entries under Project lifecycle'. |
| 2425 | Verification gap: /pipeline/:id, /share/:token and PWA banner not exercised | unverifiable | ISS-168 | A manual browser check at 375px in both themes; nothing in code to verify. |

