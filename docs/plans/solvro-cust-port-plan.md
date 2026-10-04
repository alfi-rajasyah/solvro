# Port plan: bring the customer edition's features into Solvro Internal

**Status:** decisions answered 2026-10-04 (section 10); implementation starts with PR 0 on the user's go.
**Source repo:** `alfi-rajasyah/solvro-cust` @ `develop 127f316` (92 commits). **Target:** this repo @ `develop 154b42f`.
**Research:** ten reports in [`solvro-cust-port/`](solvro-cust-port/) (4,652 lines). This file is the summary and the decision register; the reports hold the file-level detail.

Terms used below: **Internal** = this repo. **Customer** = `solvro-cust`.

---

## 1. Goal and scope

Internal gains every feature Customer built after the fork, and keeps the Pipeline module and the SA role, which Customer deleted.

**In scope (user decisions, 2026-10-02)**

| Feature | Decision |
|---|---|
| iTop integration + Utilization | Port. Work Logs becomes Utilization (`/work-logs` → `/utilization`). |
| Project members | Port. An SA is **not** an owner. |
| Guest links | Port. |
| Activity log | Port in full, and extend it to Pipeline (opportunity) changes. |
| Epics, notifications, @mentions, Help page | Port. |
| Shared UX work (wording/date pass, project health, customers table, overview tiles, saved task views, sidebar, palette actions, skeletons, live refresh, stale-edit warning, sign-in fixes, copy link) | Port (comes with the commits above). |

**Out of scope**

- Customer packaging: `INSTALL.md`, `OPERATIONS.md`, `SUPPORT.md`, `LICENSE.md`, `VERSION`, `notes/`, `solvro-cust-*` image names. (Assumed; not yet confirmed by the user.)
- Customer's Pipeline/SA removal (`1a3e905`, `af85228`) and its migration `20260922034304_remove_pipeline_module`. **This migration must never be applied or copied**: it drops every Pipeline table and `projects.sa_id`.
- Customer's Velora retirement (`ae9e511`).

## 2. Facts that shape the plan

1. **No shared git history.** Customer's root commit `10c0b16` is an import of Internal at `9f5fc20` (#180). `git merge` cannot work.
2. **Internal barely moved after the fork.** Only #182 (Pipeline 6-stage redesign), #184 (docs tracked) and #186. Outside Pipeline files, the only shared files #182 touched are `schema.prisma`, `seed.ts`/`testAuth.ts`, `lib/queries.ts`, `StatusChip.tsx` (`export CHIP_BASE`), two project tests and `CHANGELOG.md`. So almost every difference in a shared file is Customer's work.
3. **Size.** About 59 Customer commits to bring over, about +47,000 / −3,500 code lines, 12 migrations (+1 new for Pipeline activity), about 313 more backend test cases and about 20 more Playwright specs.
4. **No new npm dependency.** `package.json` files and lockfiles are byte-identical. `components/reui/` is byte-identical.
5. **The Pipeline/SA removal touched 51 shared files.** These are the conflict hot spots: `lib/queries.ts`, `Admin.tsx`, `schema.prisma`, `lib/visibility.ts`, `routes/projects.ts`, `routes/dailyReview.ts`, `ProjectFormModal.tsx`, `CustomerDetail.tsx`, `ProjectDetail.tsx`, `Overview.tsx`, `Executive.tsx`, `navCommands.ts`.
6. **Customer's new code knows nothing about Pipeline or the SA.** About 25 commits apply with no textual conflict yet still need Pipeline/SA additions (sidebar groups, `dailyReviewScope.ts`, `AccountOverview.tsx`, `ProjectHeaderFacts.tsx`, Help content, activity text, `routeMeta.ts`, `canUserSeeProject`).

## 3. Strategy

Four strategies were tested with real dry runs in throwaway worktrees ([01-strategy.md](solvro-cust-port/01-strategy.md)).

| Strategy | Result | Verdict |
|---|---|---|
| Replay Customer's commits onto Internal | 64 commits: 50 clean, 14 conflicted, 37 hunks | **Chosen**, grouped per feature series |
| Re-add Pipeline + SA on top of Customer | 17 files / 27 hunks, plus 13 add/add; replaces Internal's history | Rejected |
| Manual feature-by-feature re-implementation | About 47k lines to retype | Rejected as transport; used only for Pipeline/SA integration |
| One squashed 3-way merge | 23–58 conflicts in one 338-file PR | Rejected: not reviewable |

**Chosen: replay per feature series, one Internal PR per series.** Each PR is:

1. The Customer commits of that series, squashed into one commit per Customer PR (decision S-2); the commit message names the Customer PR numbers and hashes.
2. Conflicts merged by hand as a union. **Never resolve with `-X theirs` or `-X ours`**: in the dry run, "theirs" deleted the whole `model Opportunity` block and the SA scoping.
3. One hand-written "Pipeline/SA integration" commit.
4. Migration folders renamed to fresh `202610xx` timestamps (SQL unchanged; all are additive, none references `sa_id` or the opportunity tables). Internal's newest migration is `20260925140000_opportunity_flow_redesign`.
5. Changelog entries re-dated so `CHANGELOG.md` stays newest-first, and rewritten where they name Customer-only things.
6. No `Co-Authored-By: Claude …` trailer is carried over (39 Customer commits have one; this repo's guardrail forbids it).

**The order must follow Customer's order.** Later commits build on earlier ones (the UI pass edits iTop and Epic components; `lib/queries.ts` applies 47 of 48 hunks in Customer order and mostly fails in any other order). See decision S-1 for the alternative.

## 4. PR sequence

PR 0 is new. PRs 1–13 are from the strategy report.

| # | Branch | Content | Customer commits | Code size | Conflicts (dry run) | Migrations | Needs first |
|---|---|---|---|---|---|---|---|
| 0 | `fix/request-log-redaction` | Keep tokens out of request logs (`http/requestLogger.ts` + test), then rotate `JWT_SECRET` once | part of `eadc065` series, hand-ported | small | — | — | — |
| 0b | (local) | Install iTop on the dev VM with dummy data (decision I-8) | — | — | — | — | before PR 1 testing |
| 1 | `port/itop-tickets` | iTop P0–P2: secrets at rest, connection, snapshot, Tickets tab, Daily Review strip | #2–#3, 13 commits | +8.2k | 8 hunks (`schema.prisma`, `Admin.tsx`, docs) | 1 | G-1, I-1..I-4; `SECRETS_KEY` rollout |
| 2 | `port/utilization` | Utilization; Work Logs redirect | #4, 5 commits | +2.3k | 2 (`navCommands`) | 2 | G-1 |
| 3 | `port/itop-actions` | Webhook, task ticket ref, personal tokens, write actions | #5–#6, 8 commits | +4.7k | 0 | 2 | I-3, I-8 |
| 4 | `port/itop-board` | Board, new ticket, timer, real-install and timezone fixes | #7–#10, 11 commits | +7.6k | 1 (docs) | 1 | — |
| 5 | `port/help-signin` | Help page, sign-in guard fix (+ `PipelineGuard`) | #11–#12, 3 commits | +0.9k | 1 (`CLAUDE.md`) | — | H-2..H-4 |
| 6 | `port/epics` | Epics | #14, 1 commit | +3.1k | 0 | 1 | E-2..E-4 |
| 7 | `port/ui-pass` | Labels, day-first dates, project health, customers account page, overview tiles, task views, sidebar, palette, skeletons | #15–#16, 2 commits | 147 files, +7.6k/−2.6k | **12 hunks** | — | U-1..U-5 |
| 8 | `port/collab-quick-wins` | Live refresh, copy link, deep links | #17, 5 commits | +0.7k | 1 | — | — |
| 9 | `port/project-members` | Members, owner-only gates | #18, 3 commits | +2.6k | **8 hunks** (`visibility.ts`, `projects.ts`) | 1 | M-1..M-6, G-2 |
| 10 | `port/edit-conflict-warning` | Stale-edit warning | #19, 3 commits | +2.1k | 0 | — | — |
| 11 | `port/activity-notifications` | Activity log, notifications, @mentions, **+ Pipeline events (new work)** | #20–#21, 3 commits | +4.9k + new | 0 textual | 3 + 1 new | A-1..A-12 |
| 12 | `port/guest-links` | Guest links, rate limit, `TRUST_PROXY` | #22, 2 commits | +3.1k | 0 | 1 | M-7, M-8 |
| 13 | `port/docs-ci` | Archived plan docs, release image-tag fix | #23, #25 | small | 2 | — | — |

**Heaviest integration work:** PR 7 (UI pass) and PR 9 (members; the `lib/visibility.ts` merge). **New design work, not a port:** the Pipeline part of PR 11.

Every PR touches spine files, so every PR gets the reviewer pass and one full `gates.sh` run. Every commit and PR waits for the user's approval.

## 5. Cross-cutting rules for every PR

- **Visibility has two levels** ([09](solvro-cust-port/09-spec-members-guest-links.md)):
  - *see* = `project:view-all` | `tamId` | `saId` | `customer.tamId` | member.
  - *own* = `project:view-all` | `tamId` | `customer.tamId`. The SA and members are not owners.
  - Do not port Customer's `viaMembership:false` flag as is: it would leave the SA arm inside the owner rule. Use an access level (`"see" | "own"`).
- **Keep these Internal blocks** when a Customer file replaces an Internal file: the 673-line Pipeline block in `lib/queries.ts` and 14 SA/Pipeline sites ([03](solvro-cust-port/03-frontend-lib.md)); 12 hunks in `Admin.tsx` (both the Pipeline and the iTop tab); SA fields in `ProjectFormModal.tsx`, `Projects.tsx`, `RightSidebar.tsx`; `export CHIP_BASE` in `StatusChip.tsx`; the "unlinks any won deal" delete copy; Pipeline panels in `Overview.tsx` and `Executive.tsx`; `DealCard` in `ProjectOverview.tsx` ([04](solvro-cust-port/04-frontend-pages.md), [05](solvro-cust-port/05-frontend-components-e2e.md)).
- **Add the SA to Customer-only components:** `ProjectHeaderFacts.tsx`, `customer/AccountOverview.tsx`, `ProjectActivity.tsx` person filter, `ProjectMembers.tsx`, `useAssigneeMembership` (needs an `saId` parameter), `activityText.ts` (label for `saId`), `routeMeta.ts` (`/pipeline` title).
- **Notes guardrail:** activity events store only a note's id and visibility, never the body. Guest links select no notes. `gates.sh`'s note-consumer allowlist is identical in both repos and passes as is.
- **Plan documents come along:** Customer code comments cite `docs/archive/plans/itop-integration.md`, `itop-integration-spec.md`, `epics-spec.md`, `collaboration-and-sharing.md`. They do not exist here and must be copied with the code.
- **`docs/DESIGN.md`:** take Customer's additions (`text-meta` role, elevation rows, chip docs) but keep Internal's Pipeline chip documentation; Customer's version of that section is stale.
- **`PATCH /tasks/:id`** becomes one large rewrite carrying six features. Port it in its final Customer form within its series; do not hand-split it.

## 6. Problems found in Internal today

| # | Finding | Evidence | Fixed by |
|---|---|---|---|
| F-1 | **Bearer tokens are written to the request logs.** `pinoHttp({ logger })` has no serializer or redaction; pino-http 10.5.0 logs `req.headers` at `info`. Confirmed from code, not from a running log line. | `backend/src/app.ts:44`, `logger.ts` | PR 0, then rotate `JWT_SECRET` |
| F-2 | An SA whose role has `project:write` can change or delete another TAM's customer reached through an SA project. Not reachable with the default SA role (`project:read` only). | [09](solvro-cust-port/09-spec-members-guest-links.md) | PR 9 owner gates |
| F-3 | A task assignee who is not the TAM, SA, or customer owner cannot open the project of the task. | [09](solvro-cust-port/09-spec-members-guest-links.md) | PR 9 (new assignments); M-4 for old ones |
| F-4 | A `main` release image is also tagged `develop`. | `.github/workflows/docker-publish.yml` | PR 13 (or earlier) |
| F-5 | `PipelineGuard` redirects before sign-in is confirmed. | [03](solvro-cust-port/03-frontend-lib.md) | PR 5 |
| F-6 | The default SA role lacks `project:write`, so an SA cannot use "Create project" on the SA's own won deal. | `backend/prisma/seed.ts:15-21` | Decision H-3 |
| F-7 | The seed resets built-in role permissions on every container start. | `seed.ts:33-37`, `setup.sh:150` | `docs/ISSUES.md` entry |
| F-8 | The frontend's built-in role list omits `SALES`. | [07](solvro-cust-port/07-spec-help.md) | `docs/ISSUES.md` entry |

## 7. Security findings in the code to be ported (iTop)

These exist in Customer today. Fix them during the port (decision I-5). Detail: [06](solvro-cust-port/06-spec-itop-utilization.md).

| Severity | Finding | Proposed fix |
|---|---|---|
| High (in Internal) | iTop routes check login + customer visibility only. Internal shows unowned customers to everyone, so PENDING and SALES users could read tickets and private logs. | `project:read` on reads, `task:write` on writes |
| Medium | `POST /admin/itop/test` with only a `baseUrl` sends the stored app token to that host. | Require the token in the request when `baseUrl` differs |
| Medium | Personal-token ownership check is best-effort; a token can be accepted for the wrong person. | Fail closed |
| Low–medium | `X-Solvro-Webhook-Secret` reaches request logs. | Add to the redaction list in PR 0 |
| Low | iTop client follows redirects; GCM tag length unchecked; no key rotation; webhook rate limit is global. | `redirect: "error"`; rest to `docs/ISSUES.md` |

## 8. Deployment and environment changes

- **`SECRETS_KEY`** (base64 of 32 bytes) becomes required at boot with PR 1. It must land together in: `env.ts`, test env, `ci.yml` (2 jobs), the CI compose file, `setup.sh` (fresh install and upgrade paths), `docs/CONFIGURATION.md`.
  - Dev: the untracked `docker-compose.yml` needs it added by hand, or the backend does not start.
  - Prod: re-run `setup.sh` before the first image that needs it, or the backend crash-loops.
- **`TRUST_PROXY`** arrives with PR 12. The default of 1 may be wrong behind the tunnel → nginx path (decision M-8).
- **`ITOP_SYNC_DISABLED`** is optional.
- **`JWT_SECRET`** rotation after PR 0 signs every user out once.
- `frontend/nginx.conf` and `vite.config.ts` change in PR 12.

## 9. Guardrail edits (user-owned; proposed wording is in the reports)

| # | Edit | Before PR |
|---|---|---|
| G-1 | Replace the `WorkLogs.tsx` standing decision: superseded by Utilization and the iTop integration. | 1 |
| G-2 | New standing decision: an SA is not a project owner. | 9 |
| G-3 | Note that `/webhook/itop` is not the cancelled `/webhook/blueprint`. | 3 |
| G-4 | Add `components/itop/board/` to the approved drag layers. | 4 |
| G-5 | New guardrail: iTop writes never use the application token. | 3 |
| G-6 | Four new `gates.sh` checks: wider spine list; Pipeline + SA arm intact; guest links return no notes; iTop writes never use the app token. | 1 |

## 10. Decisions (answered by the user on 2026-10-04)

Answered in the plan artifact's decision register. Rows marked ≠ differ from the research recommendation.

### Sequencing

| ID | Question | Decision |
|---|---|---|
| S-1 | Order | Customer's order (iTop first) |
| S-2 | Commit granularity | **≠** One squash commit per Customer PR (not one per Customer commit) |
| S-3 | PR 0 log redaction first, then rotate `JWT_SECRET` | Yes |
| S-4 | Customer packaging | Stays out |
| S-5 | Committing this plan | **≠** Commit as is. Note: "No need to make the repo public, use GitHub Actions." |

### iTop and Utilization (PRs 1–4)

| ID | Question | Decision |
|---|---|---|
| I-1 | PENDING and SALES access to iTop data | Cut off: require `project:read` on reads |
| I-2 | SA sees customer tickets | Yes, through `saId` visibility |
| I-3 | Who writes to iTop | `task:write` holders only |
| I-4 | Private ticket logs for STAKEHOLDER | Hide |
| I-5 | Other iTop security findings (section 7) | **≠** Port as is, fix later. I-1 and I-3 still apply, so the High finding is closed by the permission checks; the Medium and Low findings go to `docs/ISSUES.md`. |
| I-6 | Utilization "By TAM": matched SA/SALES users | Leave them out of capacity |
| I-7 | Utilization nav entry | **≠** Gate it on a permission (which one: to decide in PR 2; proposal `project:read`) |
| I-8 | Which iTop install | Install iTop on this machine and create dummy data (prerequisite before PR 1 is tested) |
| I-9 | `ITOP_SYNC_DISABLED` in the generated compose file | Add it |

### Help (PR 5)

| ID | Question | Decision |
|---|---|---|
| H-2 | Name for deals in Help | "Opportunities" |
| H-3 | SA cannot "Create project" on a won deal (F-6) | Document it |
| H-4 | TAM topics for SALES-only users | **≠** Hide them (the sidebar must be gated the same way, or the Help tests fail) |
| H-5 | Where Help is reachable | TopBar only |
| H-6 | Velora import in Help | Left out |

### Epics (PR 6)

| ID | Question | Decision |
|---|---|---|
| E-2 | Epic create/edit/delete in the activity log | Log them, in PR 11 |
| E-3 | SA access to epics | Read-only |
| E-4 | Unchecked epic `ownerId` | **≠** Port as is (file the check in `docs/ISSUES.md`) |
| E-6 | Handoff creates epics | No |
| E-7 | Epics in the normal seed | No |
| E-8 | Story points, issue types, Jira import | Out of scope |

### UI pass (PR 7)

| ID | Question | Decision |
|---|---|---|
| U-1 | UI pass for Pipeline pages | Follow-up PR right after PR 7 |
| U-2 | Where the SA shows | Project header facts, customer project grid, activity filter |
| U-3 | Placeholder customer tabs removed | Accept the removal |
| U-4 | UI-pass rules in `docs/DESIGN.md` | Make them binding |
| U-5 | Vite tunnel hosts | Adopt `VITE_ALLOWED_HOSTS` |

### Members and guest links (PRs 9, 12)

| ID | Question | Decision |
|---|---|---|
| M-1 | SA member row | Not needed: treat the SA like the TAM for auto-add and the picker |
| M-2 | Who changes a project's SA | Owners only |
| M-3 | Who manages members | Anyone who sees the project and has `project:write` |
| M-4 | Backfill assignees who cannot see their project (F-3) | Count first, then decide |
| M-5 | SA projects in Daily Review | Stay out (unchanged) |
| M-7 | Guest page content | Acceptable as is |
| M-8 | `TRUST_PROXY` value | Unknown: check the deployment before PR 12 |

### Activity log, notifications, @mentions (PR 11)

| ID | Question | Decision |
|---|---|---|
| A-1 | Pipeline events in the log | Dual-write |
| A-2 | Pipeline events that notify the PIC | Assign; notes by others; close by others |
| A-3 | Bulk import | Records events, never notifies |
| A-4 | Silent deal changes (create, PIC change, links) | Add timeline sentences |
| A-5 | Handoff to a new project | Notify the TAM and the SA |
| A-6 | @mentions in deal notes | **≠** Include in PR 11 |
| A-7 | Customer owner as mention candidate | Yes |
| A-8 | TAM and SA changes on a project | Log and notify |
| A-9 | Project creation | Log it |
| A-10 | 180-day cleanup for Pipeline events | **≠** Keep Pipeline events (no cleanup) |
| A-11 | Notification channel | In-app only |
| A-12 | Handoff done by someone else | Notify the PIC |

## 11. What is not verified

- No typecheck, test, or Prisma run was done on any ported code. The dry runs prove that patches apply, not that the result compiles.
- F-1 was confirmed from code and the library version, not from a log line of a running instance.
- iTop admin route permissions, CI job timeouts, and how the frontend reads `X-Total-Count`.
- Whether Prisma leaves a hand-written CHECK constraint alone (A-1).
- Which existing e2e specs assert strings the UI pass changes.
- Effort figures are estimates from diff size and dry-run conflict counts.

## 12. Report index

| File | Content |
|---|---|
| [01-strategy.md](solvro-cust-port/01-strategy.md) | Fork point, 92-commit catalogue, conflict census, PR sequence |
| [02-backend-schema-ops.md](solvro-cust-port/02-backend-schema-ops.md) | Backend hunks, schema diff, migration plan, ops, docs, guardrail audit |
| [03-frontend-lib.md](solvro-cust-port/03-frontend-lib.md) | `lib/queries.ts` hook table, other `lib/` files, blocks to keep |
| [04-frontend-pages.md](solvro-cust-port/04-frontend-pages.md) | 17 pages hunk by hunk, merge strategy per page, `DESIGN.md` diff |
| [05-frontend-components-e2e.md](solvro-cust-port/05-frontend-components-e2e.md) | 47 components, guardrail checks, e2e specs |
| [06-spec-itop-utilization.md](solvro-cust-port/06-spec-itop-utilization.md) | iTop phases, security review, config and rollout |
| [07-spec-help.md](solvro-cust-port/07-spec-help.md) | Topic inventory, new Pipeline topics |
| [08-spec-epics.md](solvro-cust-port/08-spec-epics.md) | Epics behaviour, schema, tasks |
| [09-spec-members-guest-links.md](solvro-cust-port/09-spec-members-guest-links.md) | Visibility design, owner gates, guest-link infra |
| [10-spec-activity-notifications-mentions.md](solvro-cust-port/10-spec-activity-notifications-mentions.md) | Activity log, Pipeline extension, notifications, mentions |

Note: the reports were written before the replay strategy was chosen. Where a feature spec proposes its own task order or "port the file's final state", the PR sequence in section 4 wins.
