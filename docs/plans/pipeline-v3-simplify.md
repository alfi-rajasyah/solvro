# Agent pipeline v3: two lanes, less ceremony

Status: in progress (2026-11-18). Tasks 1–5, 9 and 10 are built on `chore/pipeline-v3`; task 6 (GitHub rulesets and the history repair) and task 8 (smoke noise) remain. The 3-lane flow, D1–D5 and G1–G5 are settled by the user (2026-11-18). Archive path once shipped: `docs/archive/plans/pipeline-v3-simplify.md`.

Prerequisite: the archive sweep on `chore/archive-shipped-plans` lands first (shipped plans and prompts moved into `docs/archive/`). This plan covers the recurring rule, not that backlog.

## Goal

Make daily work predictable. A small fix goes through a short, fixed lane, and a real phase keeps the v2 pipeline. All security, notes and iTop guardrails stay as strong as today. Several get stronger, through merge-method rulesets and `ask`-gated commits.

## 1. How the flow really runs (PRs #224–#238)

| Step | Owner | Cost | What happened in practice |
|---|---|---|---|
| Plan doc in `docs/plans/` | orchestrator | small | Only feature PRs had one (#230). Most fixes had none. |
| Implementor waves | `solvro-implementor` ×2–3 | sonnet contexts | 11 of 13 develop PRs were one concern with 1–5 commits. No visible use of waves. |
| Scoped checks | implementor | ~50s per tsc | As designed. |
| Full `gates.sh` | orchestrator | minutes (2× frontend vitest, backend vitest, smoke) | Ran in every PR. The local smoke fails on a Google sign-in origin setting in the dev DB (#238), which is noise. |
| Full local e2e, desktop and mobile | orchestrator | 340+ tests | Ran in #230 and #233. No rule asks for it, and CI already runs the desktop shards. |
| Opus phase review | `solvro-reviewer` | opus context | It is not visible in any PR. It is mandatory "per phase", but nothing says whether a one-commit fix counts as a phase. |
| Spine instant review | reviewer | opus | It is required often: schema and migrations (#229, #230), `queries.ts`. It is self-attested through `--performed-review=opus`. |
| Delivery Gate | orchestrator | runs the app in 2 themes × 375px | Required for any `frontend/` change. A small fix has no plan doc to record it in. |
| docs-keeper | sonnet, if triggered | small | Its triggers are listed in 3 places. |
| PR, assignee, user approval | orchestrator / user | — | Works. |
| Merge | user | — | Merge methods are mixed: #236 was a merge commit, the rest were squashed. **Release #237 was squash-merged into `main`.** |

### Friction found (verified 2026-11-18)

**Duplicated rules.** A change to one of these rules must be made in every listed place:
- The antislop rule is in 5 places: the Guardrails block, the Roster paragraph "antislop in the pipeline", `frontend/CLAUDE.md`, `solvro-implementor.md` and `solvro-reviewer.md`.
- The spine list is in 2 places: the CLAUDE.md prose and the `SPINE` regex in `gates.sh`, with a "keep in step" rule.
- The docs-keeper triggers are in 3 places: the CLAUDE.md roster row, the agent `description`, and the agent duties.
- The parallel-wave CHANGELOG rule is in 3 places: Guardrails, the implementor and the docs-keeper.
- The gates lock rationale is in 2 places: CLAUDE.md and the implementor.
- The `@theme inline` trap is in 2 places: `frontend/CLAUDE.md` and the reviewer.

**Heavy for small PRs.** The Delivery Gate fires on test-only `frontend/` diffs. The phase-review requirement is ambiguous for one-commit fixes. Full local e2e runs by habit.

**Contradictions:**
- **Release divergence (high).** #237 was squashed into `main` (`1f0a374` has one parent), so `git merge-base origin/main origin/develop` is still `803bd9f`, and each release PR re-diffs everything since then (#237 showed 89 files). `main`'s tree equals develop at `3c41ac1`, so merging `main` back into develop changes no content.
- The `gates.sh` header says "gates run per task". CLAUDE.md says "once at each wave integration".
- `docs/reference/claude-agent-architecture-design.md` says "local-only roster" still "stands". That decision was reversed on 2026-10-01, and `.claude/` is now tracked.
- The tracked `.claude/settings.local.json` allows `git commit *`, `git push *`, `gh pr create *` and `git push --force-with-lease *` without a prompt. So the "no commit without approval" guardrail relies on model behavior alone.
- The harness system-reminder asks for a `Co-Authored-By: Claude` trailer. The Guardrails forbid it, and the Guardrails win. PR bodies #226, #228 and #230 also carry a harness-inserted `<!-- claude-projects-attribution … -->` comment.
- The Changelog guardrail covers "configuration". `gates.sh` exempts `.claude/`, `docs/` and `CLAUDE.md`, which matches what #236 did, but the guardrail text doesn't say so.

**Stale references:**
- `docs/archive/plans/antislop-audit-001-2026-11-10.md` is cited in `gates.sh` and `frontend/CLAUDE.md`, but the file is still in `docs/plans/` (see D5).
- **Code comments cite live `docs/plans/` paths.** The root rule says comments cite the archive path from the start, but more than 30 comments in `backend/`, `frontend/` and `e2e/` cite `docs/plans/<x>.md`. Most of those plans were archived long ago (e.g. `kanban-reui-swap/`, `duplicate-tasks-sections.md`, `daily-review-v2-spec.md`, `reui-data-grid.md`, `opportunity-flow-redesign.md`). 12 files cite plans moved by the 2026-11-18 sweep. Some sit in spine files: `lib/visibility.ts`, `schema.prisma`, `lib/queries.ts`, `routes/tasks.ts`.
- `frontend/src/lib/export/` is missing on purpose: it is the re-arm branch of `guardrail-internal-notes`. That is fine.
- All other spine, guardrail and vendor paths exist. The note allowlist and the SOLVRO PATCH counts (0, 0, 18, 40, 5) match.
- The agent files say "(v2, phase-based)".
- `docs/reference/agent-workflow*.html` draw the v2 wave flow. They were last touched on 2026-10-01 and nothing references them.
- There is a local remote-tracking ref `cust/develop`, but no `cust` remote exists.

**Branches.** The remote is clean: only `develop` and `main`, and `deleteBranchOnMerge: true`. Three gaps remain:
- A branch pushed without a PR, such as `claude/project-thread-*`, is never auto-deleted (5 such branches were removed by hand on 2026-11-18).
- The SessionStart fetch has no `--prune`, so stale refs like `cust/develop` stay.
- The rulesets `protect-main` and `protect-develop` allow merge, squash and rebase.

**Plan lifecycle.** The Map section says plans move to `docs/archive/` when they ship, but it names no owner and no step. Nothing checks it, so 19 shipped plans and 4 prompts piled up until the 2026-11-18 sweep.

## 2. Tiered flow

### Lane criteria

The orchestrator picks the lane at the start and states it in one line ("Lane: S"). If any criterion fails, the work is Lane P.

| Lane | Applies when **all** hold |
|---|---|
| **D (docs/agent)** | The diff is only `docs/`, `.claude/`, `CLAUDE.md` files or `README.md`. |
| **S (small fix)** | One defect or one small behavior change, deliverable in at most 3 commits, by one writer. No new Prisma model, route, page or dependency. No restyle or relayout of an existing screen. No plan doc needed. |
| **P (phase)** | Anything else: features, multi-task work, migrations that add models, new public surfaces. |

A spine touch does **not** force Lane P. It forces the instant opus review in any lane, and `gates.sh` still enforces that mechanically.

### Steps per lane

| Step | D | S | P |
|---|---|---|---|
| Branch off fresh `origin/develop` | yes | yes | yes |
| Plan doc | no | no (the PR body is the record) | yes, with `Status:` and `Archive path` lines |
| Writer | orchestrator | orchestrator or 1 implementor | implementor waves, only when there are ≥2 independent tasks |
| `gates.sh` | once (area gates skip by diff) | once before staging | per wave integration plus at close |
| Local e2e | none | the touched specs plus smoke; full suite only on request | the touched specs plus smoke; CI runs the shards |
| Reviewer | none, unless the Guardrails block changed | **only on a spine touch** (instant mode) | one phase review, plus spine instants |
| Delivery Gate | no | only if the change is visible; recorded in the PR body | if visible; recorded in the plan |
| docs-keeper | no | only if a trigger fires | only if a trigger fires |
| Plan archive | — | — | `git mv` into `docs/archive/plans/` in the PR that completes the plan |
| User-approved commit/PR, assignee | yes | yes | yes |

`gates.sh` scope does not change: it is already diff-scoped, so there is no new lane flag. The one gates change for lanes is that smoke skips when the `frontend/` diff is test-only (see §3).

## 3. Edits per file

### 3a. Agent-editable, on approval of this plan

**Root `CLAUDE.md`, outside Guardrails**
- **Roster, "Phase flow":** replace the paragraph with the lane table from §2 and the criteria. Keep the existing sentence "Small interactive fixes: the orchestrator may implement directly", folded into Lane S.
- **Roster, "antislop in the pipeline":** cut it to two sentences:
  - The Delivery Gate is orchestrator-owned and runs when a change is visible.
  - It is recorded in the plan (Lane P) or the PR body (Lane S). Everything else is a pointer to `frontend/CLAUDE.md`.
- **Roster, docs-keeper row:** "Phase end, only if a trigger fires (triggers: `.claude/agents/solvro-docs-keeper.md`)." The inline list goes.
- **Roster, spine paragraph:** keep a one-line summary by category (task ordering, date contract, `queries.ts`, view adapters, vendored `reui/`, Gantt exports, auth/admin/visibility, schema and migrations, docker/env, secrets and unauthenticated surfaces). Then: "The `SPINE` regex in `.claude/scripts/gates.sh` is the list." Delete "keep this prose in step with it".
- **Map, plan lifecycle line:** add the owner: "The orchestrator moves a plan (and its prompt) to `docs/archive/` with `git mv` in the PR that completes it, and sets `Status: shipped YYYY-MM-DD`."
- **New Roster sub-item, "Merge and cleanup":** after the user merges:
  - `git fetch --prune`.
  - Delete the local branch.
  - At each release PR, list remote heads other than `develop`/`main` that have no open PR, and ask the user before deleting them.

**`.claude/agents/solvro-implementor.md`**
- Drop "(v2, phase-based)".
- Replace the antislop paragraph with: "If the task changes UI or copy, apply `frontend/CLAUDE.md`'s antislop bullet, and report one line of reason per visual or copy decision. Placeholders are named."
- Shorten the gates bullet to the rule only: never run the full `gates.sh`. The lock rationale already lives in CLAUDE.md.

**`.claude/agents/solvro-reviewer.md`**
- Drop "(v2, phase-based)".
- State that instant mode also covers Lane S spine touches.
- Replace the restated `@theme inline` trap with "spot-verify tokens in `frontend/src/index.css` and `lib/theme.tsx`, per `frontend/CLAUDE.md`".

**`.claude/agents/solvro-docs-keeper.md`**
- Make the trigger list here the canonical one.
- Shorten the `description` to "end of phase or Lane S, only when a trigger in this file fires".
- Add a trigger: "a `docs/plans/` file the diff completed was not archived".

**`.claude/scripts/gates.sh`**
- Fix the header comment: full runs are orchestrator-owned (per wave integration and at close), with lanes per CLAUDE.md.
- Smoke skips when every `^frontend/` hit matches `\.test\.tsx?$` (print `SKIP playwright-smoke (test-only frontend diff)`). Typecheck and both vitest runs stay.
- New gate `docs-plan-citations`. Every `docs/archive/plans/<x>.md` cited in tracked files must exist either at that path or as `docs/plans/<x>.md`; every `docs/plans/<x>.md` cited in a code comment fails (cite the archive path). This catches both classes of stale reference found above.
- New gate `docs-plans-status`. Every `docs/plans/*.md` must carry a `Status:` line, bold allowed. A status starting with `shipped` fails ("archive it").
- Membership of the guardrail and spine gates does not change.

**`.claude/settings.local.json`** (tracked)
- SessionStart hook: change to `git fetch --quiet --prune origin`. Then print a one-line notice for local branches whose upstream is `[gone]` and for remote heads other than `develop`/`main`. The hook only reports; it never deletes.
- Optional, as user decision D3: move `git commit *`, `git push *`, `git push --force-with-lease *` and `gh pr create *` from `allow` to `ask`.

**`docs/reference/claude-agent-architecture-design.md`**
- Add a "v3 addendum (lanes)" that links this plan's archive path.
- Mark the "local-only roster" sentence as superseded (2026-10-01).

**`docs/reference/agent-workflow*.html`**
- Move both files to `docs/archive/` (they show the v2 flow, nothing references them, and they would go stale).

**GitHub settings** (`gh api`, run only with user approval)
- Set `allowed_merge_methods` to `["squash"]` in `protect-develop` and to `["merge"]` in `protect-main`. This enforces the merge rule mechanically.
- One-time repair: a PR that merges `origin/main` into `develop` (no content change) to restore shared history.
- Delete the stale ref `cust/develop` locally.

### 3b. Guardrails block: user-owned proposals (exact wording)

None of these touches the notes, iTop or secrets guardrails.

**G1. antislop**, last part of the sentence. Replace "a phase with frontend changes closes with its Delivery Gate" with:
> a change that alters what a user sees (rendered UI or user-facing copy) closes with its Delivery Gate; a `frontend/` change with no visible effect (tests, types, pure logic) records "Delivery Gate: not applicable, no visible change" instead.

**G2. Changelog Discipline**, insert after the first sentence:
> Changes confined to `docs/`, `.claude/`, the `CLAUDE.md` files, and `README.md` need no entry; this matches `gates.sh`'s `changelog-presence` gate.

**G3. Branch & PR flow**, append:
> Feature PRs into `develop` are squash-merged; a PR from `develop` into `main` (and a hotfix merge-back) uses a merge commit, never a squash, so the two branches keep shared history. The rulesets' allowed merge methods enforce this. Head branches are deleted on merge (`deleteBranchOnMerge`); a branch pushed without a PR is deleted once its work has landed or been dropped, with the user's approval.

**G4. No Claude/AI attribution** (approved 2026-11-18, decision D4). Append:
> This includes hidden metadata such as the `<!-- claude-projects-attribution … -->` comment some harnesses insert into PR bodies. It is enforced two ways: `"attribution": { "commit": "", "pr": "" }` in `.claude/settings.json`, and the `attribution` job in `.github/workflows/pr-hygiene.yml`, which fails a PR whose body or commits contain `Co-Authored-By: Claude`, `Generated with Claude`, or `claude-projects-attribution`.

**G5. No agent commits on its own** (approved 2026-11-18). Replace the whole bullet "No agent or session ever commits or opens a PR on its own. …" with:
> **Agents commit, push feature branches, and open PRs into `develop` without asking. No agent merges a PR or pushes to `develop` or `main`. The user's merge is the approval.** A PR into `main` still happens only on the user's explicit request.

## 4. Decisions for the user

- **D1. Approved 2026-11-18.** Lane S skips the opus review unless the spine is touched, and the user's PR review is the judgment layer.
- **D2. Approved 2026-11-18.** G1–G3 as worded.
- **D3. Replaced 2026-11-18 (user): fewer human steps, not more.** The `allow` list stays. The approval point moves from each commit to each merge: agents commit, push feature branches and open PRs into `develop` without asking; no agent merges a PR. Add `Bash(gh pr merge *)` to the `deny` list in `.claude/settings.local.json`. The GitHub rulesets (no direct push to `develop`/`main`, CI required) are the mechanical backstop. See G5. Later option, not adopted: auto-merge lane D PRs on green CI, to revisit after 2–3 weeks on the new flow.
- **D4. Decided 2026-11-18 (user): no AI attribution of any kind**, hidden metadata included, enforced by settings and CI (G4). The hidden comment was removed from the bodies of #226, #228 and #230 on 2026-11-18. Open check: confirm on the next PR that T3 thread-to-PR linking still works without the comment.
- **D5. Done 2026-11-18.** The audit had shipped in PR #220 with a stale status line; it is archived at `docs/archive/plans/antislop-audit-001-2026-11-10.md`, and its deferred findings were already in `docs/ISSUES.md`. The `gates.sh` and `frontend/CLAUDE.md` citations now resolve.

## Tasks

The lane is D throughout, except T6 and T9. T2–T5 are one PR. T6 is a GitHub-settings change made only with approval.

1. **Land the archive sweep** on `chore/archive-shipped-plans` (prerequisite).
   *Accept:* `docs/plans/` holds only active plans; `docs/prompts/` is empty or active.
2. **`gates.sh` edits** (header, test-only smoke skip, the two docs gates).
   *Accept:*
   - `GATES_DIFF_OVERRIDE='frontend/src/lib/x.test.ts'` gives a `SKIP playwright-smoke` line, and typecheck and vitest still run.
   - A fake `docs/plans/foo.md` without a `Status:` line fails `docs-plans-status`.
   - A citation of an archive plan that does not exist fails `docs-plan-citations`.
   - On the current tree, all gates pass except `docs-plan-citations` on the code comments that T9 fixes, and the D5 file. Land T9 before turning the gate on, or start it in warn-only mode.
3. **Root `CLAUDE.md` outside Guardrails** (lanes, roster trims, plan owner, merge-and-cleanup).
   *Accept:* the antislop rule appears in Guardrails plus `frontend/CLAUDE.md` only; the spine membership lives only in `gates.sh`; the docs-keeper triggers live only in its agent file.
4. **Agent files** (the three edits in §3a).
   *Accept:* `grep -n 'v2, phase-based' .claude/agents` is empty; no agent restates the gates lock rationale or the `@theme inline` trap.
5. **SessionStart hook prune and branch notice**, plus the architecture-doc addendum and the HTML archive.
   *Accept:* a fresh session prints no error; after `git fetch --prune`, `git branch -r` shows no `cust/develop`.
6. **GitHub rulesets and the history repair** (only with approval).
   *Accept:*
   - `gh api repos/alfi-rajasyah/solvro/rulesets/<id>` shows `["squash"]` for develop and `["merge"]` for main.
   - After the merge-back PR, `git rev-list --count origin/develop..origin/main` is 0.
7. **Guardrails G1–G4**, applied by the user.
   *Accept:* the wording matches §3b.
8. **Smoke noise**: find the dev-DB Google sign-in origin setting that fails the smoke console check, and either fix the dev seed or file it in `docs/ISSUES.md`.
   *Accept:* on a clean dev stack, the local `gates.sh --frontend` smoke passes.
9. **Code-comment plan citations** (Lane S, comments only; touches spine files, so it gets the instant opus review).
   Rewrite every `docs/plans/<x>.md` and `docs/prompts/<x>.md` citation in `backend/`, `frontend/` and `e2e/` to the `docs/archive/...` path, where the archived file exists. A citation whose target is not in the archive gets the closest archived file, or is dropped with a note in the PR body.
   *Accept:* `git grep -nE 'docs/(plans|prompts)/' -- backend frontend e2e` lists only plans still in `docs/plans/`; one CHANGELOG line; `gates.sh` passes.

10. **Attribution enforcement** (G4; CI is not a `.claude/` path, so it needs a CHANGELOG line).
   Add `"attribution": { "commit": "", "pr": "" }` to `.claude/settings.json`; add `Bash(gh pr merge *)`, `Bash(gh api *merge*)` and `Bash(gh api *Merge*)` to `deny` in `.claude/settings.local.json`; add `.github/workflows/pr-hygiene.yml` with an `attribution` job that reads the PR body and the commits `base.sha..head.sha`. It is a separate workflow because `ci.yml` skips docs-only PRs and never runs on description edits. Built 2026-11-18. Task 6 makes `attribution` a required check on both rulesets.
   *Accept:* a test PR whose body holds `claude-projects-attribution` fails the job; a clean PR passes; `gh pr merge` from an agent session is refused.

## Risks

- **Lane S misclassification.** A "small" fix that is really a behavior change skips the opus review. Mitigations: hard criteria (no model, route, page, dependency or restyle); the spine tripwire stays mechanical; the user reviews every PR.
- **Smoke skip on test-only diffs.** A test file that changes app runtime (a test util imported by app code) is not caught. Low risk: Vitest files are not bundled.
- **Merge-method rulesets** block a squash into `main` that you meant to do. That is intended, and it is reversible in the ruleset UI.
- **The merge-back PR** creates a merge commit on develop. With no content change it is harmless, but the "develop → main" release PR diff shrinks to the real delta only after it lands.
- **`ask` permissions (D3)** add one prompt per commit and push. That is the point, but it adds friction for batch work.
- **Order of T2 and T9.** The citation gate fails the current tree until T9 lands.

### Critical files for implementation
- `CLAUDE.md`
- `.claude/scripts/gates.sh`
- `.claude/agents/solvro-implementor.md`
- `.claude/agents/solvro-reviewer.md`
- `.claude/agents/solvro-docs-keeper.md`
- `.claude/settings.local.json`
