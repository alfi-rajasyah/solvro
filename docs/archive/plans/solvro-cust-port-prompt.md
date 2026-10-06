# Handoff prompt: port the customer edition into Solvro Internal, in one PR

> Archived 2026-10-05 with the plan (`solvro-cust-port-plan.md`, `solvro-cust-port/`) once every step was committed. Paths below that say `docs/plans/…` or `docs/prompts/…` now live in `docs/archive/plans/`.

> Paste this file as the first message of a fresh Claude Code session in `/home/solvro-internal/solvro`. It is self-contained; the session reads the plan and the reports from the repo.

## 0. Authority and autonomy (user approvals, 2026-10-04)

This prompt is the user's explicit approval, as required by `CLAUDE.md` → Guardrails, for all of the following. Do not ask again for any of them.

1. **Commits** on branch `port/solvro-cust` — one squash commit per step of section 4 (about 14 commits), each after its checks pass.
2. **The six guardrail edits** to `CLAUDE.md` and `.claude/scripts/gates.sh` with the exact wording in section 6. The user owns that block; the user approved this wording. Change nothing else in the Guardrails block.
3. **Opening the PR** `port/solvro-cust` → `develop` at the end, assigned to `alfi-rajasyah`, **merge-commit mode** (keep the commits; do not squash on merge).
4. **Subagents**: every research or implementation subagent runs with `model: "opus"` (or the `solvro-*` agents' own pinned models). Never Fable.

Ask the user **only** on a hard blocker (section 9). Everything else is decided in section 5; apply the decisions, do not re-open them.

## 1. Mission

Bring every feature of `alfi-rajasyah/solvro-cust` (the customer edition, forked from this repo at `9f5fc20` on 2026-09-21) into this repo, while keeping the Pipeline module and the SA role. Deliver it as **one branch, one PR, one commit per feature group**, with the full gate suite green on the final head.

Success = all of:

- All 14 steps of section 4 are committed on `port/solvro-cust`, in order.
- `.claude/scripts/gates.sh` passes on the final head (typechecks, backend vitest on the isolated test DB, Playwright smoke, CHANGELOG presence, guardrail greps, spine check).
- Full Playwright suite (`cd e2e && npm test`, desktop + mobile) passes.
- The `solvro-reviewer` agent has reviewed the final combined diff and every blocker finding is fixed.
- The PR is open, assigned, with the description template in section 8, and CI is green.
- `CHANGELOG.md`, `docs/CONFIGURATION.md`, `docs/DESIGN.md`, `docs/ISSUES.md`, the archived plan docs, and the `CLAUDE.md` guardrails are updated as in section 7.

## 2. Read first (in this order)

1. `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `e2e/CLAUDE.md` — the contract.
2. `docs/plans/solvro-cust-port-plan.md` — the plan: facts, strategy, PR sequence (now steps), rules, findings, **and the 49 answered decisions in its section 10**.
3. `docs/plans/solvro-cust-port/01-strategy.md` — fork point, the 92-commit catalogue, the conflict census per step, the per-step integration work.
4. The report for the step you are on (section 4 names it). Do not read all ten reports up front.

Treat the reports as research, not orders: where a report proposes its own task order or "port the file's final state", section 4 wins.

## 3. Setup

```bash
cd /home/solvro-internal/solvro
git fetch origin
git switch -c port/solvro-cust origin/develop
# If docs/plans/solvro-cust-port-plan.md is missing on develop, the plan PR is not merged yet:
#   git merge --no-edit origin/docs/solvro-cust-port-plan

# Customer edition: local clone with full history (clone it if missing; no network git in loops)
[ -d ../solvro-cust ] || git clone https://github.com/alfi-rajasyah/solvro-cust ../solvro-cust
git -C ../solvro-cust fetch --depth=1000 origin develop 2>/dev/null || true
git fetch ../solvro-cust develop:refs/remotes/cust/develop      # local-path fetch, no network

# Dev stack (docker compose; node_modules live in named volumes — see CLAUDE.md Traps)
docker compose up -d
```

- `docker-compose.yml` and `.env` are untracked. Step 1 adds `SECRETS_KEY` (base64 of exactly 32 bytes: `openssl rand -base64 32`) to the backend service's environment in **both** the dev compose file and the backend test env; without it the backend does not boot after step 1.
- The Customer repo's merge commits are the step boundaries: `git -C ../solvro-cust log --merges --format='%h %s' --reverse`. PR #n's content = `git diff <merge>^1 <merge>`.
- The dev VM has 2 vCPU and 3.8 GiB RAM. Run **one** frontend typecheck at a time and **one** `gates.sh` at a time (the script takes a lock). Typecheck serialization uses a lock file, not `pgrep` (the container has none).

## 4. The 14 steps (one squash commit each, in this order)

Mechanics for a step that ports Customer PR(s):

```bash
# one Customer PR → one squash commit on our branch
git cherry-pick -m 1 --no-commit <merge-hash>          # repeat for each PR in the step, in order
# resolve conflicts BY HAND as a union (never -X theirs / -X ours; never checkout --theirs/--ours)
# apply the step's integration items (below), rename migrations, fix CHANGELOG, run checks
git commit -F <message-file>
```

Rules for every step:

- **Never resolve mechanically.** In the dry run, "theirs" deleted `model Opportunity`, the SA scoping in `lib/visibility.ts`, and `export CHIP_BASE`. Union-merge every conflict by hand.
- **Migrations:** move each ported migration folder to a fresh timestamp later than `20260925140000_opportunity_flow_redesign` (`git mv backend/prisma/migrations/2026092xxxxxx_name backend/prisma/migrations/202610DDhhmmss_name`), keep the SQL, keep the order. **Never** copy or apply `20260922034304_remove_pipeline_module`. Verify with `docker compose exec backend npx prisma migrate dev` on the dev DB and `prisma migrate deploy` on the isolated test DB (see `backend/CLAUDE.md` gotchas).
- **CHANGELOG:** every step adds its entries under `[Unreleased]`, newest-first, written for a public reader (what/where/why), re-dated to the port date, with no Customer-only wording (no `solvro-cust-*`, INSTALL/OPERATIONS, "customer distribution"). Never rewrite existing entries.
- **Commit message:** `Port <step name> from the customer edition (solvro-cust #n[, #m])` + a body listing what changed and the Pipeline/SA integration done. **No `Co-Authored-By: Claude` or any AI attribution** — Customer commits carry such trailers; do not copy them.
- **Checks before each commit:** backend `npx tsc --noEmit` + frontend `npm run typecheck` (in the containers), the backend tests the step touched, then **one full `gates.sh` run**. Fix until green. Spine touches get the `solvro-reviewer` instant review at the step (the gate demands `--performed-review=opus`); batch non-blocking findings for the final review.
- **Implementation routing:** use `solvro-implementor` agents for the integration work and fix rounds (parallel waves of 2–3 when files do not overlap; worktree isolation when they do), continue the same agent for fixes, and run `gates.sh` yourself, serially. Small fixes you may do directly.

| Step | Commit | Customer PR(s) (merge hashes) | Report | Integration items (hand work after the cherry-pick) |
|---|---|---|---|---|
| 0 | Request-log redaction | hand-port from #22 (`860d951`): `backend/src/http/requestLogger.ts` + test, `trustProxy.ts` optional later | 02 §2, 09 §5 | Wire into `app.ts` replacing bare `pinoHttp({ logger })`; redact `Authorization`, `X-Solvro-Webhook-Secret`, cookies, and `/share/<token>` paths. Add `docs/CONFIGURATION.md` note: rotate `JWT_SECRET` after deploy (ops step for the user). |
| 1 | iTop tickets + Daily Review strip | #2 `7027966`, #3 `14b115a` | 06, 02 §5, 04 (Admin, DailyReview, Settings, CustomerDetail) | `schema.prisma`: append iTop models after the Opportunity block (keep both). `Admin.tsx`: keep the Pipeline tab **and** add the iTop tab. Gating per decisions I-1..I-4: `project:read` on every iTop read route, `task:write` on every write route, hide `privateLog` unless the user holds `task:write`; SA sees tickets via `saId` visibility. `SECRETS_KEY`: `env.ts`, test env, `ci.yml` (both jobs), CI compose, `setup.sh` fresh + upgrade paths, `docs/CONFIGURATION.md`. Guardrail edits G-1 (part: iTop token rule), G-5. Migration `itop_snapshot`. |
| 2 | Utilization | #4 `804c693` | 06, 04 | `/work-logs` → redirect to `/utilization`; delete `pages/WorkLogs.tsx`; keep the Pipeline entry in `navCommands.ts`. Decision I-6: exclude SA/SALES users from "By TAM" capacity. Decision I-7: gate the Utilization nav entry and route on `project:read`. Decision I-9: add `ITOP_SYNC_DISABLED` to the compose file `setup.sh` writes. Guardrail edit G-2 (WorkLogs wording). Migrations `itop_time_entries`, `itop_time_entry_indexes`. |
| 3 | iTop webhook, task ticket ref, personal tokens, write actions | #5 `40d8f72`, #6 `a980c86` | 06 §3, §5 | `routes/tasks.ts` is spine → instant review. Write routes gated `task:write`. Guardrail edit G-3 (webhook note). Migrations `task_itop_ticket_ref`, `itop_write_path`. Security findings not fixed here (decision I-5) go to `docs/ISSUES.md` in step 13. |
| 4 | iTop board, new ticket, timer, real-install + timezone fixes | #7 `b5fab2d`, #8 `8d5382d`, #9 `c3839fb`, #10 `0d52741` | 06 | `docs/DESIGN.md`: take the elevation rows for `TicketPanel`/drag overlay, keep Internal's Pipeline chip section and the `OpportunityCard` overlay mention. Guardrail edit G-4 (`itop/board/` drag layer). Migration `itop_timezone`. Copy `docs/archive/plans/itop-integration.md` + `itop-integration-spec.md`. |
| 5 | Help page + sign-in guard fix | #11 `d733af7`, #12 `a7dd824` (skip #13 `5669ed6`: already in Internal) | 07 | Apply the same guard fix to `PipelineGuard.tsx` (F-5). Help content per 07: topics `pipeline` and `deals` gated on `pipeline:view`, wording "Opportunities" (H-2), edit the 4 EDIT topics (visibility rule includes the SA; only PENDING is reserved; Admin has a Pipeline tab; "an SA is not an owner"), document F-6 (H-3), hide TAM topics from users without `project:read` **and** gate the matching sidebar entries the same way (H-4), TopBar entry only (H-5), no Velora import topic (H-6). Page title: add `help` to the TopBar title map (Internal has no `routeMeta.ts` until step 7). `helpContent.test.ts` requires a topic per sidebar page: `/pipeline` included. |
| 6 | Epics | #14 `48b8739` | 08 §4, §8 | `schema.prisma` hunks 3–4, `lib/duplicate.ts`, `queries.ts` hunk 4, `TaskPanel` hunks 2 and 8, `App.tsx` import, two test factories need hand fixes (08 §4). Decisions E-3 (SA read-only; add a test), E-4 (port as is; ISSUES entry for the `ownerId` check), E-6/E-7 (no handoff epics, no seed epics). Migration `epics`. Copy `docs/archive/plans/epics-spec.md`. |
| 7 | UI pass (labels, dates, health, customers page, overview tiles, task views, sidebar, palette, skeletons) | #15 `3749e7c`, #16 `feeed56` | 04, 05, 03 | **12 conflict hunks** (01 §5 lists them): `dailyReview.ts` (keep SA scoping, add `dailyReviewScope.ts` with an `saId` arm), `CustomerDetail.tsx` (take Customer; re-add the SA column in `customer/AccountOverview.tsx`), `ProjectFormModal.tsx` (keep the SA field), `ProjectDetail.tsx` (keep "unlinks any won deal"; SA in `ProjectHeaderFacts.tsx`), `StatusChip.tsx` (keep `export CHIP_BASE`), `navCommands.ts` + test (keep Pipeline), `queries.ts` (keep `saId`/`sa`, add `health`), `Admin.tsx`, `Overview.tsx`/`Executive.tsx` (keep Pipeline panels + `user`/`canViewPipeline`), `Projects.tsx` (keep `saInit`/SA avatar), `ProjectOverview.tsx` (keep `DealCard`). `routeMeta.ts`: add `/pipeline`, `/pipeline/:id`, `/help`, `/utilization`. `index.css`: add `text-meta`; register it in `lib/utils.ts` tailwind-merge config. Decisions U-2 (SA in all three new components), U-3 (accept removal of the placeholder customer tabs; `RightSidebar.tsx` must stop linking `?tab=documents`), U-4 (DESIGN.md: add the UI-pass rules as binding), U-5 (adopt `VITE_ALLOWED_HOSTS`; keep `vite.config.local.ts` working or document its removal). `Overview.tsx` destructures `data.workCounts` without a fallback — the backend part of the same commit must land with it. Update e2e specs that assert the old strings ("Active" → "In progress", "Med" → "Medium", Overview heading, Customers grid). Decision U-1: Pipeline pages get a **follow-up commit in this same branch** (step 7b) applying the same conventions (sentence-case buttons, `formatDate.ts`, no text under 12px, `text-meta`) to `pages/Pipeline.tsx`, `OpportunityDetail.tsx`, `views/Pipeline*.tsx`, `components/pipeline/*`, the deal dialogs. |
| 8 | Live refresh, copy link, deep links | #17 `b24ebcc` | 03, 05 | Extend live refresh to the Pipeline hooks the same way (board, deal detail). Keep `lib/dragActivity.ts` pausing during Pipeline drags. |
| 9 | Project members + owner-only gates | #18 `3e9261d` | 09 | **Key merge: `lib/visibility.ts`.** Implement the two-level design from 09 §2: `projectVisibilityFilter(user, "see" \| "own")`; see = view-all \| tamId \| saId \| customer.tamId \| members.some; own = view-all \| tamId \| customer.tamId. `ensureProjectOwnerAccess`/`ensureCustomerOwnerAccess`: 404 first, then 403 `{code:"owner_only"}`. Frontend `lib/ownerAccess.ts`: no SA arm. Decisions M-1 (SA needs no member row; `ensureAssigneeIsMember` and `useAssigneeMembership` skip the TAM **and** the SA), M-2 (changing `saId` is owner-only), M-3 (members managed by anyone who sees the project and has `project:write`), M-5 (Daily Review unchanged for SA projects). **M-4:** count assignees of open tasks who cannot see their project (SQL in 09 §4); if the count is above 0, the `project_members` migration backfills them as members; record the count in the PR description. Tests: SA sees the project; SA gets 403 `owner_only` on each gated action. Migration `project_members`. Guardrail edit G-6 (SA is not an owner). Copy `docs/archive/plans/collaboration-and-sharing.md`. |
| 10 | Stale-edit warning | #19 `e180a1a` | 02 §1 (`PATCH /tasks/:id`) | The `PATCH /tasks/:id` rewrite carries several features; take Customer's final form and keep Internal's Pipeline-related task fields. Spine → instant review. |
| 11 | Activity log, notifications, @mentions, **Pipeline events** | #20 `344becd`, #21 `1108d80` | 10 | Port as is, then the new work from 10 §3 with decisions A-1..A-12: dual-write — `OpportunityActivity` unchanged; `ActivityEvent` gets nullable `projectId` + nullable `opportunityId` (TEXT FK, cascade), CHECK exactly one set, `entityId` nullable; helper `recordOpportunityChange` writes both rows in one transaction; `dealValue` BigInt → `Number()`. Events: create, stage move (+reason), sub-status/tag change, PIC assign/claim, close (+outcome/reason), reopen, handoff, links, notes (A-4: add timeline sentences for the silent ones). Notify the PIC on assign, on a note by someone else, on close by someone else (A-2); never on bulk import (A-3); notify the new project's TAM and SA on handoff (A-5) and the PIC when someone else does the handoff (A-12); @mentions in deal notes (A-6); customer owner is a mention candidate (A-7); log + notify TAM/SA changes on a project (A-8); log project creation (A-9); epic create/edit/delete logged (E-2); **no cleanup for Pipeline events** — the 180-day cleanup deletes project-scoped events only (A-10); in-app only (A-11). Visibility: `canUserSeeProject` with the four arms; deal events visible to `pipeline:view`. Show Pipeline events on `OpportunityDetail`. `activityText.ts`: labels for `saId`, opportunity verbs. Migrations `activity_events`, `notifications`, `comment_mentions` + one new additive migration for the Pipeline columns. |
| 12 | Guest links | #22 `860d951` | 09 §5 | Rate limit + trust proxy (`http/rateLimit.ts`, `trustProxy.ts`), `TRUST_PROXY` env (`env.ts`, `setup.sh` validation), `frontend/nginx.conf` locations `/api/public/share/` and `/share/`, `vite.config.ts` service-worker denylist, unauthenticated mount order in `app.ts`. **M-8:** determine the hop count from `setup.sh`'s nginx config and `docs/CONFIGURATION.md` (tunnel → nginx → backend); set the default accordingly and document how to change it; state the value chosen in the PR description. Guest payload accepted as is (M-7). Migration `share_links`. |
| 13 | Docs, CI fix, issues | #23 `929c5bf` (archive docs only; drop `setup-sh-hardening.md` and customer guides), #25 `127f316` (adapt the tag fix to Internal's `IMAGE_OWNER/solvro-*` lines) | 02 §7–8 | `docs/ISSUES.md` entries: iTop Medium/Low findings (decision I-5), epic `ownerId` check (E-4), seed resets role permissions (F-7), frontend role list omits SALES (F-8), `TRUST_PROXY` assumption. `docs/CONFIGURATION.md` env table complete. `frontend/CLAUDE.md` + `backend/CLAUDE.md`: adopt Customer's conventions listed in 02 §8 (formatDate/labels/`text-meta`/routeMeta rules, public-surface + request-logging conventions, shadow-DB and Vite-HMR traps). Trigger `solvro-docs-keeper` (index.css, env, compose, setup.sh, nginx.conf, vite.config.ts all touched). Move `docs/plans/solvro-cust-port-plan.md`, `docs/plans/solvro-cust-port/`, and this prompt to `docs/archive/plans/` (code comments cite the archive path). |

**Step 1 prerequisite (decision I-8):** before step 1's e2e run, try to stand up a real iTop in Docker on this VM (official iTop image, with Time Tracking) and create dummy data, so the admin connection and sync can be exercised for real. **Time-box: 1 hour of work.** If it is not up by then, continue with the mocked e2e specs (every iTop spec intercepts the API with `page.route`; no real iTop is needed) and note in the PR description that the real-install check is pending.

## 5. Decisions already made (apply, do not re-ask)

All 49 answers are in `docs/plans/solvro-cust-port-plan.md` section 10. The ones that change code are folded into the step table above. Four more were answered on 2026-10-04:

| ID | Decision |
|---|---|
| X-1 | One branch, one PR, one squash commit per step; merge with a merge commit (no squash on merge). |
| X-2 | The session may commit, apply the guardrail edits of section 6, and open the PR without asking. |
| M-4 rule | Count first; if above 0, backfill those assignees as members in the `project_members` migration. |
| I-8 | Try a real iTop in Docker on this VM, time-boxed to 1 hour; otherwise mocked tests only. |

Interpretation notes:

- I-5 "port as is, fix later" applies to the Medium and Low iTop findings only. I-1 and I-3 still add the permission checks, which close the High finding.
- I-7 "gate the Utilization nav entry": the permission is `project:read` (the same as the Help topic gating).
- H-4 "hide TAM topics from SALES-only users": gate on `project:read`; gate the sidebar entries the same way, or the Help tests fail.
- A-10 "keep Pipeline events": the cleanup job must filter `projectId IS NOT NULL`.

## 6. Guardrail edits (approved wording; apply verbatim, each in the step named)

Edit `CLAUDE.md` only in these places. Do not touch other Guardrails lines.

**G-1 (step 1) — add to Guardrails, after the drag-library bullet:**

> - **iTop writes never use the application token** (adopted 2026-10-04 from the customer edition). Every iTop create, update, or stimulus from Solvro runs under the acting user's own personal token (`User.itopTokenEnc`), accepted only when it resolves to the iTop Person with that user's Solvro email. The application token (`ItopConfig.appTokenEnc`) only reads — no fallback to it for a write, ever. Integration secrets are sealed with `SECRETS_KEY` (`backend/src/lib/secretBox.ts`) and never serialised to any client; secret-bearing headers (`Authorization`, `X-Solvro-Webhook-Secret`) and guest-link tokens are redacted from request logs.

**G-2 (step 2) — in Standing decisions, replace** the sentence `` `WorkLogs.tsx`: placeholder for a future iTop API integration; don't wire it up until that spec exists. `` **with:**

> `WorkLogs.tsx` is superseded by the Utilization page (iTop time tracking, `docs/archive/plans/itop-integration.md`; user decision 2026-10-02); `/work-logs` redirects to `/utilization`. Hours and tickets are owned by iTop — Solvro keeps a read snapshot and never stores a ticket status or time entry iTop has not confirmed; no cell on Utilization is editable.

**G-3 (step 3) — in Standing decisions, append to the SA-blueprint sentence** (after `archived spec: docs/archive/plans/secure-ingestion-port-spec.md.`):

> The iTop webhook (`POST /webhook/itop`) is a different, approved surface: a secret-checked, body-ignoring, rate-limited nudge that only schedules an iTop pull with Solvro's own token — it ingests nothing.

**G-4 (step 4) — in the drag-library guardrail, replace** `plus Solvro layers (`gantt-v2/`, `kanban-v2/`)` **with** `plus Solvro layers (`gantt-v2/`, `kanban-v2/`, and the iTop ticket board `components/itop/board/`)`.

**G-5 (step 1) — `.claude/scripts/gates.sh`:** add the four checks proposed in `02-backend-schema-ops.md` §8: (a) spine list extended with `lib/secretBox.ts`, `routes/webhook.ts`, `routes/itopUser.ts`, `lib/itop/client.ts`, `http/requestLogger.ts`, `routes/publicShare.ts`, `lib/shareLinks.ts`; (b) `guardrail-pipeline-intact` as defined in 02 §8 (`routes/opportunities.ts` present; no migration SQL drops `opportunities` or `sa_id`; `projectVisibilityFilter` still contains `saId`); (c) `guardrail-guest-links-no-notes`: `lib/shareLinks.ts` never selects `notes`; (d) `guardrail-itop-no-app-token-writes`: no write path in `lib/itop/` or `routes/itop.ts` reads `appTokenEnc`. Add the Pipeline/SA line of CLAUDE.md's Standing decisions to the spine-check comment.

**G-6 (step 9) — add to Standing decisions:**

> SA is not a project owner (user decision 2026-10-02). `Project.saId` is a visibility arm only: owner-only actions (changing a project's TAM, customer, or SA; deleting a project; changing a customer's owner or deleting it; managing guest links) use `ensureProjectOwnerAccess`/`ensureCustomerOwnerAccess`, whose owner filter excludes both the member arm and the `saId` arm. `canUserSeeProject` and every "see" filter must include `saId`. Project members get TAM-level access without ownership; the SA needs no member row.

## 7. Documentation that must be complete at the end

- `CHANGELOG.md`: one block per step under `[Unreleased]`, public wording.
- `docs/CONFIGURATION.md`: `SECRETS_KEY`, `ITOP_SYNC_DISABLED`, `TRUST_PROXY`, `VITE_ALLOWED_HOSTS`, the `JWT_SECRET` rotation step, upgrade path for an existing deployment (`setup.sh` before the first new image).
- `docs/DESIGN.md`: `text-meta` role, UI-pass rules as binding (U-4), elevation rows, chip docs; Internal's Pipeline chip section kept.
- `docs/ISSUES.md`: the entries listed in step 13.
- `docs/archive/plans/`: `itop-integration.md`, `itop-integration-spec.md`, `epics-spec.md`, `collaboration-and-sharing.md`, plus this port's plan, reports, and prompt.
- `CLAUDE.md` files: the six guardrail edits; the convention adoptions from 02 §8; no status prose, no inventories.
- `README.md`: feature list and API reference updated for the new modules (keep Pipeline).

## 8. Finishing

1. Final `gates.sh` run on the branch head; full `cd e2e && npm test` (desktop + mobile).
2. `solvro-reviewer` on the combined diff `origin/develop...HEAD`; fix every blocker; batch the rest into `docs/ISSUES.md` with a one-line reason each.
3. `solvro-docs-keeper` (triggers fired: `index.css`, env, compose, `setup.sh`, `nginx.conf`, `vite.config.ts`, deferred findings).
4. Push: `git push -u origin port/solvro-cust`.
5. Open the PR into `develop` with `gh pr create`, then `gh pr edit <n> --add-assignee alfi-rajasyah`. **No AI attribution anywhere** (commit messages, PR title, PR body, comments). PR body template:

```
## Summary
One commit per feature group ported from alfi-rajasyah/solvro-cust (forked at 9f5fc20). Pipeline and the SA role are kept; SA is not an owner.

## Commits
<table: step · commit · Customer PRs · migrations · conflicts resolved>

## Decisions applied
Plan: docs/archive/plans/solvro-cust-port-plan.md §10 (49 answers) + §5 of the handoff prompt.

## Deployment
- SECRETS_KEY required: run setup.sh before the first new image (dev: add to docker-compose.yml)
- Rotate JWT_SECRET after deploy (request logs held bearer tokens before this PR)
- TRUST_PROXY=<value chosen> because <reason>
- Members backfill count: <n>
- Real iTop install check: <done | pending>

## Verification
gates.sh: <pass> · backend vitest: <n> tests · Playwright desktop+mobile: <n> tests · reviewer findings fixed: <n>, deferred to ISSUES.md: <n>

## Guardrail edits
G-1..G-6 applied with the approved wording (handoff prompt §6).
```

6. Subscribe to PR activity (`subscribe_pr_activity`) and drive CI to green; keep the PR watched until merged.
7. Report to the user: the PR link, the deployment steps they must run, the backfill count, the TRUST_PROXY value, and anything deferred.

## 9. When to stop and ask the user (hard blockers only)

- A conflict where both sides changed the same logic and either choice loses behaviour that the plan does not cover.
- A Customer feature that cannot keep Pipeline or SA behaviour without a design change not covered by section 5.
- A migration that cannot be made additive, or a data loss risk.
- `gates.sh` or the e2e suite stays red after three fix rounds on the same failure.
- Anything that needs a credential, a production action, or a change outside this repo (except the time-boxed iTop Docker attempt).
- A guardrail edit beyond the six approved wordings.

Everything else: decide per sections 4–6, record the choice in the commit body, and continue.
