# Restructure `docs/ISSUES.md` into a triaged ledger

Status: draft (2026-11-18), not started. Archive path once shipped: `docs/archive/plans/issues-restructure.md`.

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
