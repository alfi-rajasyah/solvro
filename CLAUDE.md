# CLAUDE.md

Shared contract for the interactive session and every subagent in `.claude/agents/`. Structure: **Guardrails** (invariants, user-owned) → **Map** → **Traps** → **Ops** → **Agent Roster**.

**This file carries rules, decisions, and traps — never current-state facts.** Derive facts (routes, models, components, counts) from the code at task time; don't trust cached descriptions of the codebase. Status lives elsewhere: `CHANGELOG.md` = shipped, `docs/plans/` = planned, `docs/ISSUES.md` = broken/deferred. Area conventions auto-load from `backend/CLAUDE.md`, `frontend/CLAUDE.md`, and `e2e/CLAUDE.md` when working in those directories.

## Product

Solvro serves two roles: TAMs (delivery) and SAs (sales pipeline, via the integrated Velora service — the Pipeline module). TAMs operate via a high-density dashboard (Kanban + Gantt). The SA loop: opty → staged deal → won deal hands off to a TAM project. Solvro replaces Asana (task tracking), Google Docs (daily notes), and the standalone Velora app (opportunity tracking). Multi-user: SA/TAM access is permission-gated — no longer solo-use.

## Guardrails

MUST/NEVER invariants. User-owned — agents read this block; only the user edits it.

- **Notes never appear in exports or customer-facing output.** `ProjectNote` has no visibility column (dropped 2026-11-12). No note of any kind may reach an export, a guest link, or any customer-facing output. Verify on every change touching an export builder (`frontend/src/lib/gantt/export*.ts`), `routes/publicShare.ts`, or the notes routes. A future customer-facing notes feature needs a new user decision and a new gate.
- **`Tasks.tsx` and its `/tasks` route must never be deleted** (hidden from the sidebar only). The Timeline tab (`/projects/:id/timeline`) also stays — intentional phase-level view distinct from the task-level Gantt.
- **Never install `gantt-task-react`** or any npm Gantt, board, or drag-and-drop library. All drag engines are vendored ReUI source in `frontend/src/components/reui/` (Gantt, Kanban, Sortable, Data Grid — broadened 2026-08-01) plus Solvro layers (`gantt-v2/`, `kanban-v2/`, and the iTop ticket board `components/itop/board/`); the installed dnd-kit packages (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, and `@dnd-kit/modifiers` — the last approved by the user 2026-08-01 for the vendored data-grid) are the only sanctioned drag dependencies. `@tanstack/react-table` and `@tanstack/react-virtual` (same approval) are sanctioned headless logic deps for the vendored data-grid.
- **iTop writes never use the application token** (adopted 2026-10-04 from the customer edition). Every iTop create, update, or stimulus from Solvro runs under the acting user's own personal token (`User.itopTokenEnc`), accepted only when it resolves to the iTop Person with that user's Solvro email. The application token (`ItopConfig.appTokenEnc`) only reads — no fallback to it for a write, ever. Integration secrets are sealed with `SECRETS_KEY` (`backend/src/lib/secretBox.ts`) and never serialised to any client; secret-bearing headers (`Authorization`, `X-Solvro-Webhook-Secret`) and guest-link tokens are redacted from request logs.
- **`docs/DESIGN.md` is binding for all visual work.** Read it directly — design rules are not duplicated here; its frontmatter is canonical.
- **antislop filters all UI and user-facing copy work** (user decision 2026-11-10). `docs/DESIGN.md` gives the direction; `docs/reference/antislop.md` is then applied as the filter, in "during" mode: its rules hold while the work is written, and a change that alters what a user sees (rendered UI or user-facing copy) closes with its Delivery Gate; a `frontend/` change with no visible effect (tests, types, pure logic) records "Delivery Gate: not applicable, no visible change" instead. Precedence is this Guardrails block, then `docs/DESIGN.md`, then antislop: where `DESIGN.md` prescribes something antislop names as a pattern, `DESIGN.md` wins and the override is stated in one line. The mode is fixed here, so never stop to ask "during or after" and never run the file's install wizard; an audit ("after" mode) runs only when the user asks for one, and its findings change nothing until the user picks numbers. How it applies in this repo: `frontend/CLAUDE.md`.
- **Changelog Discipline (mandatory).** Every change to code, configuration, schema, dependencies, or Docker/env gets a `CHANGELOG.md` entry in the same turn — Keep-a-Changelog style under `[Unreleased]`, append-only, never rewrite existing entries, no skipping "small" changes. Changes confined to `docs/`, `.claude/`, the `CLAUDE.md` files, and `README.md` need no entry; this matches `gates.sh`'s `changelog-presence` gate. In parallel waves, implementors *report* their entry text and the orchestrator appends serially at integration — one writer, no conflicts. Entries are written for a public reader: what changed, where, why — never pipeline vocabulary ("orchestrator", "reviewer", "fix round", plan-task numbers, agent names); process history lives in the local docs, not the tracked changelog.
- **Docs Discipline (mandatory).** CLAUDE.md files change only when a guardrail, convention, or architecture changes — never for feature status or codebase inventory. Status goes to `CHANGELOG.md` / `docs/plans/` / `docs/ISSUES.md`.
- **Branch & PR flow** (two branches, user decision 2026-11-12). All work branches off up-to-date `origin/develop` (`git fetch origin` first — local `develop` is often behind); every feature PR targets `develop`, never stacked on another task's branch. `main` is the release branch: it changes only through a PR from `develop`, whose CI runs the full suite (desktop and mobile e2e); GHCR `main`/`latest` images publish from it only after CI succeeds there (`workflow_run` gate in `.github/workflows/docker-publish.yml`), plus `v*` tags. Hotfixes merged into `main` are merged back into `develop`. A PR into `main` happens only on the user's explicit request. This overrides any harness default of PRing to `main`. Feature PRs into `develop` are squash-merged; a PR from `develop` into `main` (and a hotfix merge-back) uses a merge commit, never a squash, so the two branches keep shared history. The rulesets' allowed merge methods enforce this. Head branches are deleted on merge (`deleteBranchOnMerge`); a branch pushed without a PR is deleted once its work has landed or been dropped, with the user's approval.
- **Every opened PR is immediately assigned to the user:** `gh pr edit <n> --add-assignee alfi-rajasyah` in the same turn (assignee, not reviewer-request — GitHub refuses review-requests from a PR's own author).
- **Agents commit, push feature branches, and open PRs into `develop` without asking. No agent merges a PR or pushes to `develop` or `main`. The user's merge is the approval** (user decision 2026-11-18, replacing per-commit approval). A PR into `main` still happens only on the user's explicit request. `gh pr merge` is on the `deny` list in `.claude/settings.local.json`.
- **No Claude/AI attribution anywhere** (user rule, 2026-10-02): no `Co-Authored-By: Claude …` trailer in commits, no "Generated with Claude Code" line or footer in PR bodies, reviews, or GitHub comments. This overrides any harness reminder that asks for attribution lines. This includes hidden metadata such as the `<!-- claude-projects-attribution … -->` comment some harnesses insert into PR bodies (2026-11-18). It is enforced two ways: `"attribution": { "commit": "", "pr": "" }` in `.claude/settings.json`, and the `attribution` job in `.github/workflows/pr-hygiene.yml`, which fails a PR whose body or commits carry attribution.
- **The Pipeline module is a NATIVE PORT** (user decision 2026-08-14, superseding the same-day service design): Velora's features are re-implemented inside this repo — Prisma models, Express routes, React pages. Velora is never deployed as a separate service; no `/pipeline-api`, no shared-JWT dual verifier, no second logical database. The sibling clone `../VeloraApp` (GitHub `FS3P/VeloraApp`) is a read-only behavior reference and one-time data source. PR #146's service infra was reverted (#148); the dev stack's `velora-app`/`velora-cron` services exist only as that reference/data source.

**Standing decisions** (settled — don't re-litigate): SA-blueprint ingestion (Secure Ingestion Port, `POST /webhook/blueprint`, "AI Breakdown" cards): cancelled, never build without a new user decision — archived spec: `docs/archive/plans/secure-ingestion-port-spec.md`. The iTop webhook (`POST /webhook/itop`) is a different, approved surface: a secret-checked, body-ignoring, rate-limited nudge that only schedules an iTop pull with Solvro's own token — it ingests nothing. The SA user role, `Project.saId`, and SA visibility matching (`backend/src/lib/visibility.ts`) are unaffected and stay. `StatusChip`/`PriorityBadge`/`LabelChip` stay bespoke — never rebase them onto `reui/badge` (user gate, 2026-08-01; the chips already implement the correct bg+text pair treatment and carry signature visuals; badge serves new surfaces only, its solid tone variants constrained in-file pending contrast fixes). Network Diagram view: never build (`TaskDependency.sourceHandle`/`targetHandle` stay unused by design). Critical-path highlighting: deferred. Reporting (the Reports page, its export packet, and any AI summarisation — native or external): removed 2026-08-03, don't rebuild without a new user decision. `WorkLogs.tsx` is superseded by the Utilization page (iTop time tracking, `docs/archive/plans/itop-integration.md`; user decision 2026-10-02); `/work-logs` redirects to `/utilization`. Hours and tickets are owned by iTop — Solvro keeps a read snapshot and never stores a ticket status or time entry iTop has not confirmed; no cell on Utilization is editable. SA is not a project owner (user decision 2026-10-02). `Project.saId` is a visibility arm only: owner-only actions (changing a project's TAM, customer, or SA; deleting a project; changing a customer's owner or deleting it; managing guest links) use `ensureProjectOwnerAccess`/`ensureCustomerOwnerAccess`, whose owner filter excludes both the member arm and the `saId` arm. `canUserSeeProject` and every "see" filter must include `saId`. Project members get TAM-level access without ownership; the SA needs no member row.

## Map

| Where | What |
|---|---|
| `backend/src/` | Express + Prisma API — conventions in `backend/CLAUDE.md` |
| `frontend/src/` | React + Vite + Tailwind v4 app — conventions in `frontend/CLAUDE.md` |
| `e2e/` | Playwright suite — conventions in `e2e/CLAUDE.md` |
| `ci/` + `.github/workflows/` | CI stack; `ci.yml` is the merge gate, `pr-hygiene.yml` runs on every PR (docs-only included), `docker-publish.yml` the release path |
| `docs/ideas/` → `docs/plans/` → `docs/prompts/` | Planning pipeline — active work only |
| `docs/reference/` | Living reference: `paper-extraction/` (DESIGN.md's regeneration source), agent-architecture rationale, `antislop.md` (the UI and copy filter: an unmodified upstream file, updated only by replacing it whole) |
| `docs/DESIGN.md` | Design system ("Technical Precision") — binding, docs-keeper-owned |
| `docs/CONFIGURATION.md` | Env vars, ports, volumes, prod deploy (`setup.sh`) — docs-keeper-owned |
| `docs/ISSUES.md` | Known issues & deferred findings — docs-keeper-owned |
| `docs/archive/` | Superseded docs & dated snapshots |
| `CHANGELOG.md` | What shipped — the public, release-facing record |

Everything in this table is tracked in git — every `CLAUDE.md`, `.claude/`, and `docs/` included (decided by the user 2026-10-01; `gates.sh`'s `guardrail-local-only-tracked` fails if they stop being tracked). Docs ride in the same phase PR as the code they describe: the phase's plan in `docs/plans/`, its deferred findings in `docs/ISSUES.md`, and any `DESIGN.md` / `CONFIGURATION.md` sync. The repo can be public while a PR's CI runs, so these files must never hold secrets, tokens, or credentials.

Specs and plans land in `docs/plans/` no matter which tool or skill writes them — never in tool-named folders (a past `docs/superpowers/` was archived for this reason). When a feature ships, its idea/plan/prompt files move to `docs/archive/`: the orchestrator `git mv`s them in the PR that completes the plan and sets `Status: shipped YYYY-MM-DD` (`gates.sh`'s `docs-plans-status` fails a shipped plan left in `docs/plans/`). Code comments that cite a plan use its eventual archive path (`docs/archive/plans/<name>.md`) from the start, never a bare `docs/plans/` path or a bare decision id — every plan ends up archived, so a live-path citation goes stale at archive time.

## Traps (cross-cutting)

- Dev `node_modules` lives in a Docker named volume, not the host bind mount. After touching `package.json`: `docker compose exec <service> npm install` (plus host `npm ci` for IDE types), then `docker compose restart <service>` for native/Prisma deps.
- **`package-lock.json` is container-written only** (trap confirmed 2026-08-01, caused two broken-CI incidents): the host's npm 11 rewrites the lock in a form the container/CI's npm 10 cannot `npm ci` (drops the nested vitest→esbuild tree + platform entries). Any lock-writing command (`npm install`, `npm prune`, `npm update`) runs inside the container; on the host use `npm ci` only, which never writes the lock.
- `docker-compose.yml` and `.env.example` are local-only (untracked). Prod deploys via `setup.sh`, which writes its own compose file — see `docs/CONFIGURATION.md`.
- The dev stack requires a sibling checkout at `../VeloraApp` (the Pipeline module's source, a separate repo) — `docker compose up -d` fails without it, since the `velora-app` service builds from that path. Clone it alongside this repo before running the dev stack.
- Never let more than one frontend `tsc --noEmit` run at a time in the frontend container — it's a single-container resource, not just full `gates.sh`: six concurrent scoped typechecks from a 3-implementor wave GC-thrashed the container for 20+ minutes (a single run takes ~50s), 2026-09-09. Serialize scoped per-task typechecks in a parallel wave the same way full gate runs are already serialized.
- The frontend container has no `pgrep`: a typecheck-serialization wait (see above) must poll a lock file (e.g. `/tmp/tsc.lock`), not a process-grep check for a running `tsc` — a grep-based wait silently no-ops and lets a second run start anyway (bit a wave on 2026-09-25).

## Ops

```bash
docker compose up -d                    # start (--build first time)
docker compose logs -f backend          # tail a service
docker compose down                     # stop; -v also wipes postgres (DESTRUCTIVE)
# app :5173 · API :3000/health · postgres :5432

docker compose exec backend  npx tsc --noEmit    # typecheck backend
docker compose exec frontend npm run typecheck   # typecheck frontend
docker compose exec backend  npm test            # backend vitest — use the isolated test DB, see backend/CLAUDE.md
cd e2e && npm test                               # playwright, desktop + mobile

docker compose exec -it backend npx prisma migrate dev --name <slug>  # -it required; gotchas in backend/CLAUDE.md
docker compose exec backend npm run db:seed
docker compose exec backend npm run prisma:studio   # needs a 5555:5555 port mapping on backend first — not mapped by default

docker compose exec -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... \
  backend npx tsx scripts/create-admin.ts           # first admin — seed creates no users
```

## Agent Roster & Phase Pipeline

The orchestrator is the interactive session itself: plans phases with the user (`docs/ideas` → `docs/plans` → `docs/prompts`), routes work with discretion, integrates waves, commits, pushes the feature branch, and opens the PR into `develop` — and never merges (see Guardrails).

| Agent | Model | Role |
|---|---|---|
| `solvro-implementor` | sonnet-5.5 | Executes one task: code + tests; verifies with **scoped checks only** (its area's typecheck + the tests it touched — never the full `gates.sh`); its final action is always its report to the orchestrator (incl. CHANGELOG entry text). Fix rounds **continue the same agent** (SendMessage) — never respawn a fresh one. Never self-certifies or commits. |
| `solvro-reviewer` | opus-5.5 | **One review per phase** on the combined diff, before the PR — plus an **instant review** of any single task that touches the spine list. Design lens on `frontend/` diffs, reads `docs/DESIGN.md` live, then `docs/reference/antislop.md` as the filter. Severity-ranked findings, no fixes. |
| `solvro-docs-keeper` | sonnet-5.5 | End of a lane-S change or a phase, **only if a trigger fires** (triggers: `.claude/agents/solvro-docs-keeper.md`). Verify-and-prune on CLAUDE.md files; proposes (never applies) Guardrails edits. |

There is no QA agent — its charter is `.claude/scripts/gates.sh` (typechecks, vitest on the isolated DB, Playwright smoke on frontend diffs, CHANGELOG presence, guardrail greps, spine check). Full runs are **orchestrator-owned and serial** (rule added 2026-07-30 after concurrent wave runs thrashed the shared Docker stack and cross-contaminated results): once at each wave integration, after interactive fixes, and at phase close — never by implementors, and the script holds an exclusive lock that refuses a second concurrent run.

**Lanes** (user decision 2026-11-18, `docs/archive/plans/pipeline-v3-simplify.md`). The orchestrator picks the lane before work starts and states it in one line ("Lane: S"); if any criterion fails, the work is Lane P.

| Lane | Applies when **all** hold |
|---|---|
| **D** (docs/agent) | The diff is only `docs/`, `.claude/`, `CLAUDE.md` files, or `README.md`. |
| **S** (small fix) | One defect or one small behavior change, at most 3 commits, one writer. No new Prisma model, route, page, or dependency; no restyle or relayout of an existing screen. |
| **P** (phase) | Anything else: features, multi-task work, migrations that add models, new public surfaces. |

| Step | D | S | P |
|---|---|---|---|
| Plan doc | no | no (the PR body is the record) | yes, with `Status:` and archive-path lines |
| Writer | orchestrator | orchestrator or 1 implementor | implementor waves, only when ≥2 tasks are independent |
| `gates.sh` | once | once before the commit | per wave integration plus at close |
| Local e2e | none | the touched specs plus smoke; the full suite only on request | the touched specs plus smoke; CI runs the shards |
| Reviewer | none, unless the Guardrails block changed | only on a spine touch (instant mode) | one phase review, plus spine instants |
| Delivery Gate | no | if the change is visible; recorded in the PR body | if visible; recorded in the plan |
| docs-keeper | no | if a trigger fires | if a trigger fires |

A spine touch never forces Lane P; it forces the instant opus review in any lane. **Phase flow (Lane P)**: derive the task dependency graph → independent tasks implement in **parallel waves** (2–3 concurrent; worktree isolation when files overlap; phase = branch = PR, tasks = commits) → scoped checks per task, one full gates run per wave at integration → failures/findings return to the same implementor with context intact → one phase review → Delivery Gate if visible → docs-keeper if triggered → the PR, which the user merges.

**Delivery Gate** (the antislop rule is in Guardrails, its repo scoping in `frontend/CLAUDE.md`): orchestrator-owned, after `gates.sh` is green and any review is cleared: run the app, click through what changed in both themes and at 375px, and record PASS/FAIL in the plan (Lane P) or the PR body (Lane S). A FAIL goes back to the owning implementor like any other finding.

**Merge and cleanup**: after the user merges, `git fetch --prune` and delete the local branch. The SessionStart hook reports local branches whose remote is gone and remote branches other than `develop`/`main`; it never deletes.

**Agent lifecycle** (rules added 2026-07-30): never poke an idle agent for a missing report — a queued message re-wakes it into redundant re-verification; instead verify its work from the working tree, or stop it. Phase close ends with `TaskStop` for every spawned agent — stand-down messages queue behind an agent's backlog and don't reliably stop it.

**Spine (instant opus review in any lane, enforced mechanically by `gates.sh`)**: task ordering, `routes/projects.ts` (notes + baseline), auth/admin/visibility, `schema.prisma` + migrations, the date contract, `lib/queries.ts`, the Kanban adapters, `gantt-v2/`, vendored `reui/`, the Gantt exports, docker/env/`setup.sh`/`nginx.conf`, and secrets and unauthenticated surfaces. The `SPINE` regex in `.claude/scripts/gates.sh` is the list.

Sonnet is the floor for every subagent — never haiku. Rationale: `docs/reference/claude-agent-architecture-design.md` (v2 and v3 addenda) + `docs/archive/plans/pipeline-v2-design.md` + `docs/archive/plans/pipeline-v3-simplify.md`.
