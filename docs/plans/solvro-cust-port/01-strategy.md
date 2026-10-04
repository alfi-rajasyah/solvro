# CUST -> INTERNAL porting strategy (research, 2026-10-02)

INTERNAL = /home/solvro-internal/solvro (develop @154b42f). CUST = /home/solvro-internal/solvro-cust (develop @127f316).
All numbers below come from local git commands run 2026-10-02; dry runs in throwaway worktrees under $PLAN. Items marked **(unverified)** were not proven by a command.

## 1. Fork point

**Fork point = INTERNAL 9f5fc20** ("README: features, architecture, and API reference (#180)", 2026-09-10; 8e97c28 has the identical tree).
CUST's own CHANGELOG entry in 10c0b16 says "copied as of commit 9f5fc20" and the tree diff confirms it.

| INTERNAL commit | files differing vs CUST 10c0b16 (all) | code-only (excl. docs/, .claude/, CLAUDE.md, CHANGELOG) |
|---|---|---|
| 7207264 (#178) | 182 | 10 files, +543/-68 |
| **9f5fc20 (#180)** | **182 (177 A, 5 M)** | **10 files, +346/-21 — packaging only** |
| 6034514 (#182) | 242 | 70 files, +1597/-5928 |
| 364085f (#184) | 83 | 70 (lower "all" count only because #184 began tracking the same docs CUST imported) |
| 154b42f (HEAD) | 86 | 70 |

What the import (10c0b16) adds/changes on top of 9f5fc20 — nothing was removed:
- **Modified (5):** `.github/workflows/docker-publish.yml` (IMAGE_OWNER -> IMAGE_NAME = github.repository => `solvro-cust-*` images), `.gitignore` (drops the local-only workflow block; tracks CLAUDE.md/.claude/docs), `CHANGELOG.md` (two customer-distribution entries), `README.md` (solvro-cust image names, clone+`bash setup.sh`), `setup.sh` (`solvro-cust-backend/frontend` images).
- **Added, packaging (6):** `INSTALL.md`, `OPERATIONS.md`, `SUPPORT.md`, `LICENSE.md`, `VERSION` (v1.0.0), `notes/TEMPLATE.md` — NOT wanted in INTERNAL.
- **Added, workflow/docs (171):** 4 CLAUDE.md, `.claude/` (agents x3, hooks, launch.json, reply-style.md, scripts/gates.sh, settings.local.json), `docs/` (archive 54, reference 88, plans 10, prompts 3, ideas, DESIGN/CONFIGURATION/ISSUES). INTERNAL started tracking the same set itself in #184 (c86f463, 173 files), so these are add/add on both sides from now on.

Docs at the import are near-identical to what INTERNAL later tracked in #184: `git diff 10c0b16 c86f463 -- docs .claude '*CLAUDE.md'` = 12 files (+337/-121), of which the substance is INTERNAL's opportunity-flow plan/prompt (added in archive) and CUST's `setup-sh-hardening.md` + `customer-repo-guardrails-draft.md` (customer-only). So the "docs layer" starts from a common baseline even though git sees it as add/add.

## 2. INTERNAL after the fork (9f5fc20..154b42f)

13 commits (10 non-merge, 3 merges = PRs #182, #184, #186). Total `git diff --stat 9f5fc20 develop`: 233 files, +26077/-1260 (of which #184 alone = 173 files of docs/workflow, +20145).

| PR | commit(s) | what | files |
|---|---|---|---|
| #182 (merge 6034514, 09-25) | 86a07e1 schema+migration (5 files) · c31887f API (17) · abfa5dd FE types/hooks/dialogs (22) · 957e83e board (8) · 20252e9 opportunity detail (1) · 1616203 analytics (5) · fffad1b e2e+changelog (3) | Pipeline 6-stage opportunity flow redesign; migration `20260925140000_opportunity_flow_redesign` (185 lines) | ~60 code files |
| #184 (merge 364085f, 10-01) | c86f463 | Track `CLAUDE.md`, `.claude/`, `docs/` in git; `.gitignore` | 173 |
| #186 (merge 154b42f, 10-02) | b80cc68, 19754a6 | Subagents to 5.5 models; no-AI-attribution guardrail | 5 + 1 |

### #182 — files it touched that are SHARED with non-Pipeline code (the only post-fork overlap with CUST's work)
| file | #182 change | CUST touches it? |
|---|---|---|
| `backend/prisma/schema.prisma` (+95/-30) | 4 new enums (PipelineSubStatus, PipelineStatusTag, PipelineOutcome, PipelineOutcomeReason) after `enum WeeklyStatus`; `model Opportunity` fields | yes, heavily (removal + 8 feature migrations) |
| `backend/prisma/seed.ts` (+5/-1) | new built-in role `SALES: ["pipeline:view"]` ("six built-in roles") | yes (removal drops pipeline perms; members/notifications may add) |
| `backend/test/testAuth.ts` (+1) | `SALES` role | yes (removal) |
| `backend/test/projectCustomerLink.test.ts`, `projectDelete.test.ts` | fixture updates for new Opportunity shape | yes (removal) |
| `frontend/src/lib/queries.ts` (+159/-29) | close/reopen/flag hooks, opportunity types | yes, by almost every CUST feature (spine file) |
| `frontend/src/lib/queries.reorder.test.ts` (+83/-12) | pipeline reorder cases | (check in census) |
| `frontend/src/components/StatusChip.tsx` (+5/-1) | `export const CHIP_BASE` | yes (removal + UI pass) |
| `CHANGELOG.md` | entries | yes, every CUST commit |
| `backend/src/lib/holidays.ts` (new), `lib/workingDays.ts` (new), `routes/holidays.ts` (-24 refactor) | holiday lookup extracted for pipeline SLA working days | CUST never touched these after import (`git log cust/develop -- routes/holidays.ts` = only 10c0b16) |

Everything else in #182 is Pipeline-only (`routes/opportunities*.ts`, `components/pipeline/*`, `pages/Pipeline*.tsx`, `OpportunityDetail.tsx`, Deal/Stage/MoveReason/CloseDeal components, `scripts/import-velora.ts`, pipeline tests and e2e) — CUST deleted all of those, so they are INTERNAL-only and conflict with nothing as long as CUST's removal is never applied.

#184/#186 touch only `.gitignore`, `CHANGELOG.md`, CLAUDE.md files, `.claude/`, `docs/` — add/add with CUST's imported copies (near-identical, see above).

## 3. Catalogue of all 92 CUST commits (topological order, `git rev-list --reverse --topo-order`)

Kind: COMMIT = single-parent, MERGE = GitHub PR merge (second parent = PR branch tip). Files/ins/del from `git show --numstat` (merges: 0 — their content is the sum of their PR's commits). Mig = Prisma migration added.

| # | hash | date (09-xx) | kind | tag | PR | files | +ins | -del | migration | subject |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 10c0b16 | 09-21 07:51 | COMMIT | PACKAGING | S0-import | 545 | 129163 | 0 | 33 baseline migrations (INTERNAL's set as of 9f5fc20) | Initial import: Solvro customer distribution v1.0.0 |
| 2 | d6a17cc | 09-21 02:31 | COMMIT | OTHER(dev-vite) | S0 | 2 | 11 | 0 | - | Allow Vite dev server behind a tunnel via VITE_ALLOWED_HOSTS |
| 3 | ae9e511 | 09-21 23:29 | COMMIT | PIPELINE-REMOVAL | S0 | 8 | 33 | 1048 | - | Retire the Velora reference stack from the dev stack and docs |
| 4 | 1a3e905 | 09-22 06:13 | COMMIT | PIPELINE-REMOVAL | PR#1 | 105 | 251 | 14157 | 20260922034304_remove_pipeline_module | Remove the Pipeline module and the Solution Architect project owner |
| 5 | af85228 | 09-22 06:21 | COMMIT | PIPELINE-REMOVAL | PR#1 | 1 | 2 | 2 | - | Update the Pipeline and SA guardrails to match the shipped code |
| 6 | bce1a5a | 09-22 06:33 | COMMIT | DOCS | PR#1 | 1 | 1 | 0 | - | Record the Vite HMR trap for tunnelled dev sessions |
| 7 | 30106e8 | 09-22 14:32 | MERGE | MERGE | PR#1 | 0 | 0 | 0 | - | Merge pull request #1 from alfi-rajasyah/feat/remove-pipeline-module |
| 8 | 6ff1d3a | 09-22 13:42 | COMMIT | SECURITY(ITOP) | PR#2 | 9 | 206 | 5 | - | Encrypt secrets at rest with a required SECRETS_KEY |
| 9 | 03ea2e4 | 09-22 13:42 | COMMIT | ITOP | PR#2 | 2 | 159 | 0 | 20260922075353_itop_snapshot | Add the iTop config, ticket snapshot and mapping columns |
| 10 | 9a54c29 | 09-22 13:42 | COMMIT | ITOP | PR#2 | 5 | 1386 | 0 | - | Add the iTop REST client and a fake iTop test double |
| 11 | c4d95c8 | 09-22 13:42 | COMMIT | ITOP | PR#2 | 5 | 1006 | 0 | - | Sync iTop tickets into the snapshot on a schedule |
| 12 | 4fea8c3 | 09-22 13:42 | COMMIT | ITOP | PR#2 | 2 | 957 | 0 | - | Add the iTop admin API |
| 13 | 842a3d9 | 09-22 13:42 | COMMIT | ITOP | PR#2 | 3 | 728 | 0 | - | Add the iTop tickets API |
| 14 | 9467f9b | 09-22 13:42 | COMMIT | ITOP | PR#2 | 5 | 1442 | 1 | - | Add the Admin iTop tab |
| 15 | cbaf7ee | 09-22 13:42 | COMMIT | ITOP | PR#2 | 8 | 967 | 11 | - | Add the customer Tickets tab |
| 16 | 742eef1 | 09-22 13:42 | COMMIT | ITOP/DOCS | PR#2 | 9 | 1027 | 8 | - | Document the iTop integration and its configuration |
| 17 | 2cf68b5 | 09-22 14:24 | COMMIT | ITOP(e2e) | PR#2 | 1 | 7 | 0 | - | Block service workers in the iTop tickets spec |
| 18 | 7027966 | 09-22 23:07 | MERGE | MERGE | PR#2 | 0 | 0 | 0 | - | Merge pull request #2 from alfi-rajasyah/feat/itop-p1-tickets |
| 19 | 242f5e9 | 09-22 16:53 | COMMIT | ITOP | PR#3 | 2 | 745 | 10 | - | Add the iTop daily ticket digest API |
| 20 | 33aa5ca | 09-22 16:53 | COMMIT | ITOP | PR#3 | 9 | 572 | 5 | - | Show an iTop ticket strip on the Daily Review operations card |
| 21 | f0678ea | 09-22 16:53 | COMMIT | ITOP/DOCS | PR#3 | 1 | 5 | 0 | - | Record the Daily Review iTop strip in the changelog |
| 22 | 14b115a | 09-23 00:55 | MERGE | MERGE | PR#3 | 0 | 0 | 0 | - | Merge pull request #3 from alfi-rajasyah/feat/itop-p2-daily-review |
| 23 | 5b3d0a5 | 09-23 02:02 | COMMIT | UTIL | PR#4 | 7 | 561 | 11 | 20260922182346_itop_time_entries,20260922185807_itop_time_entry_indexes | Sync iTop time entries into a snapshot table |
| 24 | 43b00d6 | 09-23 02:02 | COMMIT | UTIL | PR#4 | 3 | 802 | 0 | - | Add the utilization API |
| 25 | 065f078 | 09-23 02:02 | COMMIT | UTIL | PR#4 | 11 | 876 | 26 | - | Replace Work Logs with the Utilization page |
| 26 | 1ee63b6 | 09-23 02:02 | COMMIT | UTIL(test) | PR#4 | 2 | 25 | 0 | - | Wait for background syncs between admin API tests |
| 27 | b4e666d | 09-23 02:02 | COMMIT | UTIL/DOCS | PR#4 | 6 | 56 | 6 | - | Document Utilization and retire the Work Logs placeholder |
| 28 | 804c693 | 09-23 09:38 | MERGE | MERGE | PR#4 | 0 | 0 | 0 | - | Merge pull request #4 from alfi-rajasyah/feat/itop-p3-utilization |
| 29 | 9a677ad | 09-23 03:19 | COMMIT | ITOP | PR#5 | 5 | 416 | 3 | - | Add a secret-gated webhook so iTop can nudge a sync |
| 30 | 418d88b | 09-23 03:19 | COMMIT | ITOP | PR#5 | 6 | 254 | 1 | 20260923024304_task_itop_ticket_ref | Let a task pin an iTop ticket by reference |
| 31 | ebe58e2 | 09-23 03:19 | COMMIT | ITOP | PR#5 | 9 | 699 | 2 | - | Show the webhook card and the task ticket field |
| 32 | bf8dbca | 09-23 03:19 | COMMIT | ITOP/DOCS | PR#5 | 5 | 62 | 0 | - | Document the iTop webhook and task ticket links |
| 33 | 40d8f72 | 09-23 10:35 | MERGE | MERGE | PR#5 | 0 | 0 | 0 | - | Merge pull request #5 from alfi-rajasyah/feat/itop-p4-webhook-taskref |
| 34 | 8ce20af | 09-23 07:27 | COMMIT | ITOP | PR#6 | 6 | 760 | 17 | 20260923035039_itop_write_path | Store and verify personal iTop tokens |
| 35 | d4a5f07 | 09-23 07:27 | COMMIT | ITOP | PR#6 | 8 | 1024 | 38 | - | Send ticket actions and log entries to iTop under the user's token |
| 36 | ed35482 | 09-23 07:27 | COMMIT | ITOP | PR#6 | 13 | 1540 | 41 | - | Add the ticket panel, action sheets and token settings |
| 37 | efe4388 | 09-23 07:27 | COMMIT | ITOP/DOCS | PR#6 | 6 | 67 | 0 | - | Document iTop actions from Solvro |
| 38 | a980c86 | 09-23 14:48 | MERGE | MERGE | PR#6 | 0 | 0 | 0 | - | Merge pull request #6 from alfi-rajasyah/feat/itop-p5-write-path |
| 39 | 694c505 | 09-23 08:59 | COMMIT | ITOP | PR#7 | 5 | 781 | 16 | - | Create iTop tickets from Solvro |
| 40 | 0f16e79 | 09-23 08:59 | COMMIT | ITOP | PR#7 | 16 | 2085 | 49 | - | Add the ticket Board view, New-ticket sheet and strip quick actions |
| 41 | 9d64304 | 09-23 08:59 | COMMIT | ITOP/DOCS | PR#7 | 6 | 74 | 1 | - | Document the iTop board and new tickets |
| 42 | b5fab2d | 09-23 18:13 | MERGE | MERGE | PR#7 | 0 | 0 | 0 | - | Merge pull request #7 from alfi-rajasyah/feat/itop-p6-board |
| 43 | e4a64a6 | 09-23 12:59 | COMMIT | ITOP | PR#8 | 4 | 843 | 32 | - | Log time on an iTop ticket from Solvro |
| 44 | 4657f14 | 09-23 12:59 | COMMIT | ITOP | PR#8 | 14 | 1636 | 42 | - | Add the ticket timer and create-from-task |
| 45 | c6fe4c6 | 09-23 12:59 | COMMIT | ITOP/DOCS | PR#8 | 7 | 292 | 11 | - | Archive the iTop plan and close out its docs |
| 46 | c4e3bf0 | 09-23 13:00 | COMMIT | DOCS | PR#8 | 9 | 12 | 12 | - | Point remaining plan citations at the archive path |
| 47 | 8d5382d | 09-23 21:32 | MERGE | MERGE | PR#8 | 0 | 0 | 0 | - | Merge pull request #8 from alfi-rajasyah/feat/itop-p7-timer |
| 48 | b7757a7 | 09-24 03:35 | COMMIT | ITOP | PR#9 | 11 | 654 | 96 | - | Make iTop writes and sync work against a real install |
| 49 | b59a7b2 | 09-24 03:35 | COMMIT | ITOP | PR#9 | 12 | 223 | 50 | - | Ask for a pending reason and allow Pending to Assigned |
| 50 | c839f69 | 09-24 03:35 | COMMIT | ITOP/DOCS | PR#9 | 3 | 21 | 1 | - | Record the real-install iTop findings |
| 51 | c3839fb | 09-24 11:59 | MERGE | MERGE | PR#9 | 0 | 0 | 0 | - | Merge pull request #9 from alfi-rajasyah/fix/itop-real-install |
| 52 | 933d3d0 | 09-24 08:08 | COMMIT | ITOP | PR#10 | 22 | 1389 | 120 | 20260924063858_itop_timezone | Read iTop times in the iTop server's timezone |
| 53 | 0d52741 | 09-24 15:44 | MERGE | MERGE | PR#10 | 0 | 0 | 0 | - | Merge pull request #10 from alfi-rajasyah/fix/itop-timezone |
| 54 | e47d68a | 09-24 09:02 | COMMIT | DOCS(ITOP-guardrails) | PR#11 | 1 | 2 | 1 | - | Add the iTop write-token and ticket-board guardrails |
| 55 | 2d6a4c8 | 09-24 09:02 | COMMIT | SIGNIN | PR#11 | 7 | 116 | 27 | - | Stop admin pages bouncing to Overview after sign-in |
| 56 | d733af7 | 09-24 16:24 | MERGE | MERGE | PR#11 | 0 | 0 | 0 | - | Merge pull request #11 from alfi-rajasyah/fix/admin-guard-login |
| 57 | 5caef7f | 09-24 09:52 | COMMIT | HELP | PR#12 | 7 | 740 | 0 | - | Add an in-app Help page |
| 58 | f3fcbc3 | 09-24 09:53 | COMMIT | AGENT-WORKFLOW | PR#13 | 1 | 1 | 0 | - | Add the no-AI-attribution guardrail |
| 59 | a7dd824 | 09-24 17:19 | MERGE | MERGE | PR#12 | 0 | 0 | 0 | - | Merge pull request #12 from alfi-rajasyah/feat/help-page |
| 60 | 5669ed6 | 09-24 17:19 | MERGE | MERGE | PR#13 | 0 | 0 | 0 | - | Merge pull request #13 from alfi-rajasyah/docs/no-ai-attribution |
| 61 | 8b9fa3a | 09-25 02:27 | COMMIT | EPIC | PR#14 | 39 | 3137 | 50 | 20260924131112_epics | Add Epics: group tasks into Jira-style epics with progress and filters |
| 62 | 48b8739 | 09-25 09:56 | MERGE | MERGE | PR#14 | 0 | 0 | 0 | - | Merge pull request #14 from alfi-rajasyah/feat/epics |
| 63 | 489b0a4 | 09-29 08:57 | COMMIT | UIPASS(HEALTH,CUSTOMERS,OVERVIEW,TASKVIEWS,SIDEBAR,PALETTE) | PR#15 | 149 | 7622 | 2577 | - | Professional UI pass: consistent labels, day-first dates, clearer hierarchy |
| 64 | 3749e7c | 09-29 16:21 | MERGE | MERGE | PR#15 | 0 | 0 | 0 | - | Merge pull request #15 from alfi-rajasyah/feat/ui-professional-pass |
| 65 | 823639d | 09-29 09:27 | COMMIT | DOCS | PR#16 | 1 | 0 | 0 | - | Archive the shipped Epics spec |
| 66 | 25dbeec | 09-29 19:09 | COMMIT | LIVE | PR#17 | 9 | 359 | 3 | - | Refresh project data on focus and every 30 seconds |
| 67 | 3a19e75 | 09-29 19:09 | COMMIT | OTHER(copy-link) | PR#17 | 6 | 123 | 7 | - | Add Copy link buttons to projects, customers and tasks |
| 68 | fc02e6f | 09-29 19:09 | COMMIT | SIGNIN(deep-links) | PR#17 | 8 | 172 | 6 | - | Keep deep links through sign-in |
| 69 | 49c00b0 | 09-29 19:14 | COMMIT | DOCS | PR#17 | 3 | 40 | 2 | - | Track the collaboration plan and phase docs in git |
| 70 | ad246c6 | 09-30 01:07 | COMMIT | OTHER(test-fix) | PR#17 | 2 | 5 | 3 | - | Fix the Kanban subtask-reorder test locator |
| 71 | feeed56 | 09-30 08:31 | MERGE | MERGE | PR#16 | 0 | 0 | 0 | - | Merge pull request #16 from alfi-rajasyah/docs/archive-epics-spec |
| 72 | b24ebcc | 09-30 08:31 | MERGE | MERGE | PR#17 | 0 | 0 | 0 | - | Merge pull request #17 from alfi-rajasyah/feat/collab-quick-wins |
| 73 | af9a362 | 09-30 03:28 | COMMIT | MEMBERS | PR#18 | 37 | 2605 | 91 | 20260930090000_project_members | Add project members |
| 74 | b98ac14 | 09-30 03:28 | COMMIT | MEMBERS/DOCS | PR#18 | 2 | 30 | 1 | - | Record the project members decisions and visibility rule |
| 75 | c6f39b2 | 09-30 03:54 | COMMIT | MEMBERS | PR#18 | 1 | 4 | 4 | - | Show project member avatars side by side |
| 76 | 3e9261d | 09-30 12:02 | MERGE | MERGE | PR#18 | 0 | 0 | 0 | - | Merge pull request #18 from alfi-rajasyah/feat/project-members |
| 77 | 2d9b0a8 | 09-30 06:48 | COMMIT | CONFLICT | PR#19 | 10 | 2097 | 99 | - | Warn before overwriting someone else's task edit |
| 78 | 78d2a3f | 09-30 06:48 | COMMIT | CONFLICT/DOCS | PR#19 | 2 | 26 | 0 | - | Record the conflict-warning design and deferred findings |
| 79 | 2abbf56 | 09-30 07:39 | COMMIT | CONFLICT(test) | PR#19 | 4 | 47 | 52 | - | Make the conflict and date-picker tests match the new behaviour |
| 80 | e180a1a | 09-30 15:09 | MERGE | MERGE | PR#19 | 0 | 0 | 0 | - | Merge pull request #19 from alfi-rajasyah/feat/task-conflict-warning |
| 81 | 476288e | 09-30 09:20 | COMMIT | ACTIVITY+NOTIF+MENTION | PR#20 | 37 | 4878 | 143 | 20260930120000_activity_events,20260930130000_notifications,20260930140000_comment_mentions | Add a project activity log, notifications and @mentions |
| 82 | d183b57 | 09-30 09:20 | COMMIT | ACTIVITY/DOCS | PR#20 | 4 | 41 | 3 | - | Record the activity and notification design and deferred findings |
| 83 | 344becd | 09-30 16:38 | MERGE | MERGE | PR#20 | 0 | 0 | 0 | - | Merge pull request #20 from alfi-rajasyah/feat/activity-notifications |
| 84 | ebe8953 | 09-30 10:34 | COMMIT | NOTIF(test) | PR#21 | 2 | 38 | 12 | - | Make the notification query-count test deterministic |
| 85 | 1108d80 | 09-30 17:55 | MERGE | MERGE | PR#21 | 0 | 0 | 0 | - | Merge pull request #21 from alfi-rajasyah/fix/mention-query-count-test |
| 86 | eadc065 | 09-30 12:04 | COMMIT | SHARE | PR#22 | 31 | 3122 | 7 | 20260930150000_share_links | Add read-only guest links for project timelines |
| 87 | 2ecb148 | 09-30 12:04 | COMMIT | SHARE/DOCS | PR#22 | 4 | 57 | 0 | - | Record the guest-link design, configuration and deferred findings |
| 88 | 860d951 | 09-30 19:38 | MERGE | MERGE | PR#22 | 0 | 0 | 0 | - | Merge pull request #22 from alfi-rajasyah/feat/guest-links |
| 89 | c729454 | 09-30 15:23 | COMMIT | DOCS | PR#23 | 15 | 2239 | 5 | - | Close the collaboration plan and track the remaining docs |
| 90 | 929c5bf | 10-01 00:08 | MERGE | MERGE | PR#23 | 0 | 0 | 0 | - | Merge pull request #23 from alfi-rajasyah/docs/close-collaboration-plan |
| 91 | 3ad5731 | 10-01 03:59 | COMMIT | CI(PACKAGING-adjacent) | PR#25 | 2 | 9 | 1 | - | Tag release images with the branch CI ran on |
| 92 | 127f316 | 10-01 11:24 | MERGE | MERGE | PR#25 | 0 | 0 | 0 | - | Merge pull request #25 from alfi-rajasyah/fix/ghcr-branch-tag |

### 3a. Feature series (PR boundaries; merge diff = `git diff M^1 M`)

History shape: first-parent chain of 24 merges + 2 direct commits (d6a17cc, ae9e511 were committed straight onto develop before PR #1). Every PR branch forks from the previous merge, so the topo order = PR order; no criss-cross merges. PR #24 does not exist in history (never merged / closed — unverified which).

| series | CUST PR(s) | commits (non-merge) | merge diff | migrations | port? |
|---|---|---|---|---|---|
| S0 import + dev | — (10c0b16, d6a17cc, ae9e511) | 3 | import 545 files; ae9e511 8 files -1048 (deletes `import-velora.ts` + test, Velora docs) | — | NO for 10c0b16 and ae9e511 (INTERNAL keeps Velora import script; `import-velora.ts` was even extended by #182). d6a17cc (VITE_ALLOWED_HOSTS, 2 files) optional — INTERNAL already solves this with an untracked `vite.config.local.ts` (auto-memory) |
| PIPELINE-REMOVAL | #1 (1a3e905, af85228, bce1a5a) | 3 | 105 files +254/-14159 | `20260922034304_remove_pipeline_module` (MUST NEVER APPLY) | NO (bce1a5a = 1-line HMR trap in CLAUDE.md, optional) |
| ITOP P1 tickets (+SECRETS_KEY) | #2 | 10 | 48 files +7885/-25 | `20260922075353_itop_snapshot` | yes |
| ITOP P2 daily review strip | #3 | 3 | 12 files +1322/-15 | — | yes |
| UTIL (Work Logs -> Utilization) | #4 | 5 | 29 files +2320/-43 | `20260922182346_itop_time_entries`, `20260922185807_itop_time_entry_indexes` | yes (user decision overrides the WorkLogs standing decision) |
| ITOP P4 webhook + task ticket ref | #5 | 4 | 25 files +1431/-6 | `20260923024304_task_itop_ticket_ref` | yes |
| ITOP P5 write path, personal tokens | #6 | 4 | 33 files +3391/-96 | `20260923035039_itop_write_path` | yes |
| ITOP P6 board, new ticket | #7 | 3 | 27 files +2940/-66 | — | yes |
| ITOP P7 timer, archive plan | #8 | 4 | 34 files +2783/-97 | — | yes |
| ITOP real-install fixes | #9 | 3 | 26 files +898/-147 | — | yes |
| ITOP timezone | #10 | 1 | 22 files +1389/-120 | `20260924063858_itop_timezone` | yes |
| SIGNIN admin guard + iTop guardrails | #11 | 2 | 8 files +118/-28 | — | yes |
| HELP | #12 | 1 | 7 files +740 | — | yes (help content must add Pipeline/SA sections) |
| no-AI-attribution guardrail | #13 | 1 | 1 file +1 | — | already in INTERNAL (19754a6) — skip |
| EPIC | #14 | 1 | 39 files +3137/-50 | `20260924131112_epics` | yes |
| UIPASS (HEALTH, CUSTOMERS, OVERVIEW, TASKVIEWS, SIDEBAR, PALETTE, labels/formatDate, skeletons, focus, demo seed) | #15 | 1 | **149 files +7622/-2577** | — | yes — single monolithic commit, cannot be cherry-picked in parts |
| DOCS epics archive | #16 | 1 | rename only | — | yes (trivial) |
| LIVE refresh / copy link / deep links | #17 | 5 | 25 files +698/-20 | — | yes |
| MEMBERS | #18 | 3 | 39 files +2635/-92 | `20260930090000_project_members` | yes — but visibility.ts rule must keep `saId` matching (SA is not an owner, but SA visibility stays) |
| CONFLICT (stale-edit warning) | #19 | 3 | 13 files +2143/-124 | — | yes |
| ACTIVITY + NOTIF + MENTION | #20, #21 | 3 | 41 files +4919/-146; +2 files | `20260930120000_activity_events`, `20260930130000_notifications`, `20260930140000_comment_mentions` | yes, + extend activity to Pipeline events (new work) |
| SHARE (guest links) | #22 | 2 | 35 files +3179/-7 | `20260930150000_share_links` | yes |
| DOCS close collaboration plan | #23 | 1 | 15 files +2239/-5 | — | partly (archive docs; `itop-integration-guide.md`, `outline-knowledge-base.md` idea) |
| CI image tag fix | #25 | 1 | 2 files +9/-1 | — | yes, adapted: the fix applies to INTERNAL's `IMAGE_OWNER/solvro-*` line, not CUST's `IMAGE_NAME` line |

## 4. Removal commit 1a3e905 ("Remove the Pipeline module and the Solution Architect project owner")

105 paths: **48 deleted**, **51 modified**, **5 renamed** (pipeline plans/prompts moved to docs/archive), **1 added** (the `remove_pipeline_module` migration). +251/-14157.

Deleted (48): 2 backend routes (`opportunities.ts`, `opportunityItems.ts`), 1 backend lib, 5 backend tests (`opportunities`, `opportunityHandoff`, `opportunityImport`, `opportunityItems`, `projectSaOptional`), 2 e2e specs (`pipeline-board`, `pipeline-form`), 28 frontend components (`components/pipeline/*`, Deal/Stage/import dialog…), 5 frontend lib files, 5 frontend pages (Pipeline*, OpportunityDetail). Plus ae9e511 earlier deleted `backend/scripts/import-velora.ts` + `importVelora.test.ts`.

The migration drops `opportunities`, `opportunity_activities`, `opportunity_links`, `pipeline_import_logs`, enums `PipelineImportStatus`, `PipelineStage`, and `projects.sa_id` (+FK, index). **It must never reach INTERNAL** (INTERNAL prod has live pipeline data; also INTERNAL's later `20260925140000_opportunity_flow_redesign` alters those tables, so it would not even replay in order).

### Modified shared files — the conflict hot spots (51; +/- = lines added/removed by the removal)
| file | +/- | file | +/- |
|---|---|---|---|
| `CHANGELOG.md` | +13/-0 | `CLAUDE.md` | +1/-1 |
| `INSTALL.md` | +1/-1 | `OPERATIONS.md` | +1/-1 |
| `README.md` | +19/-38 | `backend/CLAUDE.md` | +1/-1 |
| `backend/prisma/schema.prisma` | +0/-131 | `backend/prisma/seed.ts` | +1/-8 |
| `backend/src/app.ts` | +0/-7 | `backend/src/lib/visibility.ts` | +8/-12 |
| `backend/src/routes/admin.ts` | +2/-9 | `backend/src/routes/customers.ts` | +0/-1 |
| `backend/src/routes/dailyReview.ts` | +12/-13 | `backend/src/routes/projects.ts` | +3/-13 |
| `backend/test/dailyReview.test.ts` | +9/-19 | `backend/test/portfolioCustomer.test.ts` | +0/-1 |
| `backend/test/portfolioOverdue.test.ts` | +1/-2 | `backend/test/portfolioRouteToday.test.ts` | +0/-1 |
| `backend/test/projectCustomerLink.test.ts` | +4/-89 | `backend/test/projectDelete.test.ts` | +2/-28 |
| `backend/test/projectNotes.test.ts` | +2/-2 | `backend/test/projectServices.test.ts` | +4/-4 |
| `backend/test/projectWipLimits.test.ts` | +3/-7 | `backend/test/sections.test.ts` | +0/-1 |
| `backend/test/taskOrdering.test.ts` | +0/-1 | `backend/test/tasksOverdue.test.ts` | +0/-1 |
| `backend/test/testAuth.ts` | +0/-7 | `docs/CONFIGURATION.md` | +2/-16 |
| `docs/DESIGN.md` | +1/-1 | `docs/ISSUES.md` | +66/-26 |
| `e2e/fixtures/seed.ts` | +0/-6 | `e2e/tests/daily-review.spec.ts` | +3/-5 |
| `e2e/tests/gantt-parity.spec.ts` | +7/-8 | `frontend/CLAUDE.md` | +1/-1 |
| `frontend/src/App.tsx` | +0/-19 | `frontend/src/components/ProjectFormModal.tsx` | +16/-39 |
| `frontend/src/components/StatusChip.tsx` | +1/-4 | `frontend/src/components/gantt-v2/SolvroGantt.tsx` | +1/-1 |
| `frontend/src/components/layout/RightSidebar.tsx` | +0/-6 | `frontend/src/lib/auth.tsx` | +2/-8 |
| `frontend/src/lib/navCommands.test.ts` | +0/-7 | `frontend/src/lib/navCommands.ts` | +0/-1 |
| `frontend/src/lib/queries.ts` | +6/-569 | `frontend/src/lib/tableSort.ts` | +1/-1 |
| `frontend/src/pages/Admin.tsx` | +9/-267 | `frontend/src/pages/CustomerDetail.tsx` | +0/-13 |
| `frontend/src/pages/Executive.tsx` | +0/-11 | `frontend/src/pages/Overview.tsx` | +1/-9 |
| `frontend/src/pages/ProjectDetail.tsx` | +1/-7 | `frontend/src/pages/Projects.tsx` | +1/-18 |
| `frontend/src/pages/views/ProjectOverview.tsx` | +0/-10 |  |  |

Heaviest modifications (these are where the SA/Pipeline code is interwoven with shared code): `frontend/src/lib/queries.ts` (-569: all pipeline hooks), `frontend/src/pages/Admin.tsx` (-267: pipeline import/admin tab), `backend/prisma/schema.prisma` (-131), `backend/test/projectCustomerLink.test.ts` (-89), `ProjectFormModal.tsx` (+16/-39: SA owner picker), `backend/src/lib/visibility.ts` (+8/-12: SA matching), `routes/projects.ts` (+3/-13: saId), `routes/dailyReview.ts` (+12/-13), `routes/admin.ts`, `App.tsx` (-19 routes), `Projects.tsx` (-18 SA column), `auth.tsx` (-8 pipeline perms), `RightSidebar.tsx`, `Overview.tsx`, `Executive.tsx`, `CustomerDetail.tsx`, `ProjectDetail.tsx`, `ProjectOverview.tsx` (SA facts).
Spine files among them: `schema.prisma`, `routes/projects.ts`, `routes/admin.ts`, `lib/visibility.ts`, `lib/queries.ts`, `gantt-v2/SolvroGantt.tsx`, docker/env-adjacent docs.

Consequence: every later CUST commit that edits one of these 51 files was written against the *removed* context; replayed onto INTERNAL its hunks meet Pipeline/SA lines that CUST never saw. That is the main conflict source for S1, and conversely the main conflict source for S2 (re-adding Pipeline into files that CUST later rewrote).

## 5. Strategy evaluation (with dry-run evidence)

### S1 — REPLAY: cherry-pick CUST's non-merge commits onto INTERNAL develop

**Dry run** (`$PLAN/s1b.sh`, worktree `$PLAN/wt-s1` detached at 154b42f, objects via local ref `refs/remotes/cust/develop`): 64 picks = all 68 non-merge CUST commits minus 10c0b16 (import), ae9e511 (Velora retirement), 1a3e905 + af85228 (removal). Each pick first tried plainly; on conflict the census recorded every unmerged path, marker count and per-hunk size (ours-lines/theirs-lines), then aborted and redid the pick with `-X theirs` (hunk-level), with `git checkout --theirs`/`git rm` for modify/delete leftovers, and committed (measurement only). Total run time ~3 s.
(An earlier pass that resolved with whole-file `checkout --theirs` gave 52 clean / 12 conflicted — lower only because whole-file "theirs" silently replaced INTERNAL files with CUST's, hiding later conflicts; that log is kept as `s1_log_wholefile.tsv` and is NOT trustworthy.)

**Result: 50 clean, 14 conflicted, 37 conflict hunks total (35 content hunks + 2 modify/delete).**

| CUST commit | series | hunks | conflicting files (hunks: ours-lines/theirs-lines per hunk) |
|---|---|---|---|
| d6a17cc Allow Vite dev server behind a tunnel via VITE_ALLOWED_HOSTS | OTHER(dev-vite) S0 | 1 | UU:CHANGELOG.md(1:1/5) |
| bce1a5a Record the Vite HMR trap for tunnelled dev sessions | DOCS PR#1 | 1 | UU:CLAUDE.md(1:1/1) |
| 03ea2e4 Add the iTop config, ticket snapshot and mapping columns | ITOP PR#2 | 1 | UU:backend/prisma/schema.prisma(1:110/35) |
| 9467f9b Add the Admin iTop tab | ITOP PR#2 | 3 | UU:frontend/src/pages/Admin.tsx(3:1/1<br>1/1<br>1/1) |
| 742eef1 Document the iTop integration and its configuration | ITOP/DOCS PR#2 | 4 | UU:CHANGELOG.md(1:0/32)<br>UU:CLAUDE.md(1:1/1)<br>DU:INSTALL.md(0:)<br>DU:OPERATIONS.md(0:)<br>UU:docs/CONFIGURATION.md(2:1/2<br>25/8) |
| 065f078 Replace Work Logs with the Utilization page | UTIL PR#4 | 2 | UU:frontend/src/lib/navCommands.test.ts(1:1/1)<br>UU:frontend/src/lib/navCommands.ts(1:5/2) |
| 9d64304 Document the iTop board and new tickets | ITOP/DOCS PR#7 | 1 | UU:docs/DESIGN.md(1:1/1) |
| e47d68a Add the iTop write-token and ticket-board guardrails | DOCS(ITOP-guardrails) PR#11 | 1 | UU:CLAUDE.md(1:2/2) |
| 489b0a4 Professional UI pass: consistent labels, day-first dates, clearer hierarchy | UIPASS(HEALTH,CUSTOMERS,OVERVIEW,TASKVIEWS,SIDEBAR,PALETTE) PR#15 | 12 | UU:backend/src/routes/dailyReview.ts(1:101/4)<br>UU:docs/DESIGN.md(1:1/1)<br>UU:frontend/src/components/ProjectFormModal.tsx(1:30/13)<br>UU:frontend/src/components/StatusChip.tsx(1:6/2)<br>UU:frontend/src/lib/navCommands.test.ts(1:4/17)<br>UU:frontend/src/lib/queries.ts(1:1/2)<br>UU:frontend/src/pages/Admin.tsx(1:3/3)<br>UU:frontend/src/pages/CustomerDetail.tsx(1:680/0)<br>UU:frontend/src/pages/Executive.tsx(1:1/1)<br>UU:frontend/src/pages/Overview.tsx(1:1/0)<br>UU:frontend/src/pages/ProjectDetail.tsx(2:7/1<br>16/6) |
| 49c00b0 Track the collaboration plan and phase docs in git | DOCS PR#17 | 1 | UU:CLAUDE.md(1:1/1) |
| af9a362 Add project members | MEMBERS PR#18 | 7 | UU:backend/prisma/schema.prisma(1:3/1)<br>UU:backend/src/lib/visibility.ts(3:5/8<br>7/8<br>3/3)<br>UU:backend/src/routes/projects.ts(2:3/2<br>2/3)<br>UU:frontend/src/components/ProjectFormModal.tsx(1:3/6) |
| b98ac14 Record the project members decisions and visibility rule | MEMBERS/DOCS PR#18 | 1 | UU:backend/CLAUDE.md(1:1/1) |
| c729454 Close the collaboration plan and track the remaining docs | DOCS PR#23 | 1 | UU:.gitignore(1:3/2) |
| 3ad5731 Tag release images with the branch CI ran on | CI(PACKAGING-adjacent) PR#25 | 1 | UU:.github/workflows/docker-publish.yml(1:1/4) |

**Conflicts per feature series** (hunks): S0 dev/vite 1 (CHANGELOG) · PR#1 HMR trap 1 (CLAUDE.md) · ITOP P1 #2: 8 (schema 1, Admin.tsx 3, docs 4 incl. 2 modify/delete on INSTALL/OPERATIONS which INTERNAL must simply drop) · UTIL #4: 2 (navCommands) · ITOP P6 #7: 1 (DESIGN.md) · #11: 1 (CLAUDE.md) · UIPASS #15: **12** · #17: 1 (CLAUDE.md) · MEMBERS #18: **8** (schema 1, visibility 3, projects 2, ProjectFormModal 1, backend/CLAUDE.md 1) · #23: 1 (.gitignore) · #25: 1 (docker-publish.yml). ITOP P2/P4/P5/P7/real-install/timezone, HELP, EPIC, LIVE, CONFLICT, ACTIVITY/NOTIF/MENTION, SHARE: **0 textual conflicts**.

**Conflict files ranked (hunks across the whole replay):**
| file | hunks | commits | nature |
|---|---|---|---|
| `backend/src/lib/visibility.ts` (spine) | 3 | af9a362 | members rule written against SA-less code; ours keeps `saId` match |
| `frontend/src/pages/Admin.tsx` | 4 | 9467f9b (3), 489b0a4 (1) | tab list / imports next to Pipeline tab |
| `CLAUDE.md` | 4 | bce1a5a, 742eef1, e47d68a, 49c00b0 | guardrail lines next to Pipeline/SA guardrails |
| `frontend/src/pages/ProjectDetail.tsx` | 2 | 489b0a4 | header next to SA facts |
| `backend/src/routes/projects.ts` (spine) | 2 | af9a362 | members include vs `sa` include |
| `backend/prisma/schema.prisma` (spine) | 2 | 03ea2e4 (**110/35**), af9a362 (3/1) | CUST appended iTop models exactly where the Pipeline models sit |
| `docs/CONFIGURATION.md` | 2 | 742eef1 | iTop section vs Velora section |
| `frontend/src/components/ProjectFormModal.tsx` | 2 | 489b0a4 (30/13), af9a362 (3/6) | SA owner picker |
| `frontend/src/lib/navCommands.ts` + `.test.ts` | 3 | 065f078, 489b0a4 | Pipeline nav command vs Utilization / regrouped nav |
| `docs/DESIGN.md` | 2 | 9d64304, 489b0a4 | |
| `CHANGELOG.md` | 2 | d6a17cc, 742eef1 | top-of-Unreleased |
| `backend/src/routes/dailyReview.ts` | 1 (**101/4**) | 489b0a4 | CUST moved scope logic into new `lib/dailyReviewScope.ts`; ours side carries SA scope |
| `frontend/src/pages/CustomerDetail.tsx` | 1 (**680/0**) | 489b0a4 | CUST rewrote the page into `components/customer/AccountOverview.tsx`; ours side carries the Pipeline/SA section |
| `frontend/src/lib/queries.ts` (spine) | 1 (1/2) | 489b0a4 | small — pipeline hooks sit in separate regions |
| `StatusChip.tsx`, `Executive.tsx`, `Overview.tsx` | 1 each | 489b0a4 | `CHIP_BASE` export (#182) vs UI pass; SA/pipeline tiles |
| `backend/CLAUDE.md`, `.gitignore`, `.github/workflows/docker-publish.yml` | 1 each | b98ac14, c729454, 3ad5731 | |
| `INSTALL.md`, `OPERATIONS.md` (modify/delete) | 2 | 742eef1 | customer packaging — resolve by keeping them deleted |

**The textual census understates the work.** Measured damage from mechanical `-X theirs` resolution (count of lines matching `saId|sa|pipeline|opportunit`, INTERNAL HEAD -> replay result): `schema.prisma` 69 -> 28 (the entire `model Opportunity` + `OpportunityActivity` … block was dropped by the 110/35 hunk in 03ea2e4), `visibility.ts` 4 -> 1, `dailyReview.ts` 3 -> 0, `CustomerDetail.tsx` 6 -> 0, `ProjectDetail.tsx` 2 -> 0, `ProjectFormModal.tsx` 9 -> 5, `StatusChip.tsx` 1 -> 0 (`CHIP_BASE` export lost — `PipelineFlagChips.tsx` would break), `navCommands.ts` 1 -> 0, `Admin.tsx` 36 -> 33, `projects.ts` 11 -> 9. Every conflict therefore needs a hand-written UNION resolution, never "theirs".

**Clean-but-semantically-risky picks** (applied with no conflict but edit removal-touched shared files, written against SA-less context; each needs an SA/Pipeline review): 842a3d9, 43b00d6, 9a677ad, 8ce20af (app.ts route mounts); cbaf7ee, ed35482, 0f16e79 (CustomerDetail); 33aa5ca, ebe58e2, 4657f14, 933d3d0, 2d9b0a8 (queries.ts); 5b3d0a5, 418d88b, b7757a7, c4e3bf0 (schema); 2d6a4c8, 4657f14 (auth.tsx — pipeline permissions); 5caef7f, fc02e6f (App.tsx routes); **8b9fa3a EPIC** (schema, app.ts, projects.ts, e2e seed, App.tsx, SolvroGantt, queries, ProjectDetail); 25dbeec LIVE (ProjectFormModal, SolvroGantt, queries); **476288e ACTIVITY** (schema, app.ts, visibility.ts, projects.ts, queries, ProjectOverview — activity log must also cover Pipeline per user decision); **eadc065 SHARE** (schema, app.ts, App.tsx, queries, ProjectDetail). Plus semantic gaps no conflict can reveal: UIPASS's `lib/dailyReviewScope.ts` (new file) lacks SA scoping; `components/customer/AccountOverview.tsx` (new) lacks the customer's Pipeline section; `routeMeta.ts`, `paletteActions.ts`, `Sidebar.tsx` groups (Workspace/Cadence/Insights/System) and `helpContent.ts` have no Pipeline entries; `labels.ts` has no Pipeline stage labels; `seed-demo.ts` seeds no opportunities; `ProjectHeaderFacts.tsx` no SA.

**CHANGELOG evidence from the dry run:** after the replay, `[Unreleased]` reads (top-down) CUST 10-01 … 09-22 entries, then — leaked in through the `-X theirs` resolution of the d6a17cc/742eef1 CHANGELOG hunks (ours 0 / theirs 32 lines) — three CUST-only entries that must never appear in INTERNAL (`Removed — 2026-09-22 — Pipeline module and the Solution Architect project owner`, `Changed — 2026-09-21 — Velora reference stack retired`, `Changed — 2026-09-21 — Customer distribution builds and installs its own images`), and only then INTERNAL's own 10-01 (#184) and 09-25 (#182) entries. So: CHANGELOG conflicts must be resolved by hand (keep ours + insert only the commit's own new entry), and the ported entries need re-dating/re-heading to the port date so the file stays reverse-chronological.

**Final tree of the S1 dry run** vs CUST HEAD: 127 files differ (+20004/-465) — i.e. the replay reproduces CUST plus INTERNAL's Pipeline (and re-adds INSTALL/OPERATIONS through the modify/delete resolution, which a real port would drop).

**Effort:** low mechanical effort (64 picks, 14 stops, ~37 hunks) but each of the ~20 risky picks needs SA/Pipeline re-integration, so real effort is medium. **Risk:** medium-high if conflicts are resolved quickly; Pipeline regressions are silent (no conflict) in new CUST files. **History/CHANGELOG/blame:** best — 64 commits keep CUST authorship/dates (cherry-pick keeps author date), blame points at the original change; CUST CHANGELOG entries apply cleanly at the top of `[Unreleased]` (only 2 CHANGELOG conflicts) and CUST's post-removal entries mention Pipeline/SA only once (the customer account page's "AM / SA" header strip — there SA is the customer's SA contact, still fine); they do reference CUST-only facts such as image names and CUST plan paths, so each must be proof-read before merge (INTERNAL's CHANGELOG is append-only once merged). CUST PR numbers (#1–#25) collide with INTERNAL's (#1–#186) if quoted in messages — subjects don't carry them (non-merge commits), so this is cosmetic. **Reviewability:** good if grouped into series PRs (each PR = a contiguous pick range + one "Pipeline/SA integration" commit). **Migrations:** come across as-is (new dirs never conflict); see 5.6.

### S2 — REVERSE: CUST HEAD as base, re-add Pipeline + SA

**Dry run** (worktree `$PLAN/wt-s2` of CUST, detached at 127f316):
1. `git revert --no-commit 1a3e905` -> **17 conflicted files, 27 hunks**; 48 files re-added, 34 modified cleanly, 5 renames undone, 1 deletion (the `remove_pipeline_module` migration dir).

| file | hunks (ours=CUST HEAD lines / theirs=pre-removal lines) |
|---|---|
| `CHANGELOG.md` | 1: 228/0 |
| `backend/CLAUDE.md` | 1: 1/1 |
| `backend/prisma/schema.prisma` | 2: 3/3 102/90 |
| `backend/src/lib/visibility.ts` | 3: 8/5 31/7 3/3 |
| `backend/src/routes/dailyReview.ts` | 1: 4/101 |
| `backend/src/routes/projects.ts` | 2: 2/3 3/2 |
| `docs/CONFIGURATION.md` | 1: 17/7 |
| `docs/DESIGN.md` | 1: 2/2 |
| `frontend/src/components/ProjectFormModal.tsx` | 2: 6/3 13/30 |
| `frontend/src/lib/navCommands.test.ts` | 2: 1/1 17/4 |
| `frontend/src/lib/navCommands.ts` | 1: 16/13 |
| `frontend/src/lib/queries.ts` | 1: 5/3 |
| `frontend/src/pages/Admin.tsx` | 4: 3/3 1/1 1/1 1/1 |
| `frontend/src/pages/CustomerDetail.tsx` | 1: 5/574 |
| `frontend/src/pages/Executive.tsx` | 1: 1/1 |
| `frontend/src/pages/Overview.tsx` | 1: 0/1 |
| `frontend/src/pages/ProjectDetail.tsx` | 2: 1/7 6/16 |

   It is the mirror image of S1's hot-spot list (same 15 code/docs files + CHANGELOG + backend/CLAUDE.md), e.g. `CustomerDetail.tsx` 5/574, `dailyReview.ts` 4/101, `visibility.ts` 8/5 · 31/7 · 3/3, `schema.prisma` 3/3 · 102/90.
2. `git revert af85228` and `git revert ae9e511` (to restore the Pipeline/SA guardrails and INTERNAL's Velora import script + docs): 1 conflict each, both in `CLAUDE.md` (1 hunk).
3. Re-applying INTERNAL's post-fork work on top (cherry-pick 9f5fc20..develop, 10 commits): #182's 7 commits -> 5 clean, 2 conflicts (`abfa5dd`: `StatusChip.tsx` 1 hunk — the `CHIP_BASE` export vs the UI pass; `fffad1b`: `CHANGELOG.md` 1); #184 `c86f463` -> **13 add/add conflicts** (every `.claude/*` file, `.gitignore`, all four CLAUDE.md, DESIGN/CONFIGURATION/ISSUES — both repos started tracking the same docs independently); #186 2 clean.
4. Resolution sensitivity (import-name check `$PLAN/impcheck.py`, a cheap stand-in for tsc — **not** a typecheck): whole-file resolution of step 1 left the tree with 149 unresolved named imports (queries.ts lost all CUST hooks); hunk-level `-X theirs` left 2 (`lib/notifications.ts` imports `canUserSeeProject`, `ProjectVisibilityFacts` that the reverted `visibility.ts` no longer exports). The S1 tree under the same check has 1 (`CHIP_BASE`). Either way `visibility.ts` is the one spine file that must be merged by hand.

S1 (hunk-level) and S2 (hunk-level) final trees differ in only **33 files** (+1167/-959): the ~17 hot-spot files resolved in opposite directions, plus packaging that S2 still carries (`LICENSE.md`, `SUPPORT.md`, `VERSION`, `notes/TEMPLATE.md`, `INSTALL.md`, `OPERATIONS.md`, `setup.sh`/`README.md`/`docker-publish.yml` pointing at `solvro-cust-*` images, `docs/plans/setup-sh-hardening.md`, `docs/reference/customer-repo-guardrails-draft.md`) and CUST's `docs/ISSUES.md` (411 lines of INTERNAL issues missing).

**What INTERNAL loses/keeps under S2:** S2 means making CUST's history the new trunk. INTERNAL's develop (380 commits, PRs #1–#186, all blame, the CHANGELOG as written) would be replaced by a history whose root is a 129k-line "Initial import" snapshot: `git blame` for everything older than 2026-09-21 collapses onto 10c0b16; INTERNAL PR numbers survive only in commit messages; CUST PR numbers #1–#25 would clash with INTERNAL's #1–#186 on GitHub (different repo, so links break). Pushing it to INTERNAL's GitHub `develop` needs a force-push or an unrelated-histories merge (`--allow-unrelated-histories`, which conflicts on every one of ~545 files as add/add) — both violate the "phase = branch = PR into develop" flow. It also re-creates INTERNAL's CHANGELOG from CUST's (CUST's has the customer-distribution entries and lacks INTERNAL's #184/#186 entries). Migration-wise S2 is the same as S1 (see 5.6), but the `remove_pipeline_module` directory must be deleted from history-visible trees — fine since INTERNAL's DB never saw it. **Verdict: highest risk to history and process for no conflict reduction. Reject.**

### S3 — FEATURE-BY-FEATURE manual port (CUST as reference)

Scope to re-implement: `git diff 30106e8 127f316` (everything CUST did after removal) = 338 files, +50976/-2816; excluding docs/.claude/CLAUDE/CHANGELOG = 314 files, +46789/-2789 (189 new files, 131 modified, 1 deleted = `WorkLogs.tsx`); of which tests = 101 files, +20249. No `package.json`/lock changes at all (no dependency risk). Re-typing ~47k lines by hand/agents is weeks of implementor time and would re-introduce bugs CUST already fixed (#9 real-install fixes, #10 timezone, #21 flaky test). Since 50 of 64 CUST commits replay with zero textual conflict and 189 files are brand-new, re-implementation buys nothing on those. **S3 only makes sense for the parts CUST could not have written: the Pipeline/SA integration of UIPASS (sidebar groups, palette, route meta, labels, help, demo seed), MEMBERS (SA visibility), ACTIVITY (Pipeline events) — i.e. as the "integration commit" inside each series PR, not as the transport.**

### S4 — Squashed single 3-way merge (`git merge-tree --write-tree`)

| base | ours | theirs | conflicted files | breakdown | silent damage |
|---|---|---|---|---|---|
| 9f5fc20 (true fork) | 154b42f | cust/develop | **58** | 9 content, 9 add/add (docs/.claude), **40 modify/delete** (Pipeline files #182 changed, CUST deleted) | **11 Pipeline files deleted with no conflict** (`lib/pipelineAccess.ts`, `AssignPicModal.tsx`, `OpportunityFormModal.tsx`, `PipelineGuard.tsx`, `pipeline/commitMapper.ts`, `quarterLogic(.test).ts`, `handoffDefaults(.test).ts`, `projectSaOptional.test.ts`, `WorkLogs.tsx`) |
| 30106e8 (CUST after removal PR #1) | 154b42f | cust/develop | **23** (= the earlier run's `squash_all_conflict_files.txt`, tree 644ff8e) | 21 content, 2 modify/delete (`INSTALL.md`, `OPERATIONS.md`) | only `WorkLogs.tsx` deleted (intended) |

The 23 with base 30106e8: `.github/workflows/docker-publish.yml`, `.gitignore`, `CHANGELOG.md`, `CLAUDE.md`, `INSTALL.md`, `OPERATIONS.md`, `backend/CLAUDE.md`, `schema.prisma`, `visibility.ts`, `dailyReview.ts`, `routes/projects.ts`, `docs/CONFIGURATION.md`, `docs/DESIGN.md`, `ProjectFormModal.tsx`, `StatusChip.tsx`, `navCommands(.test).ts`, `queries.ts`, `Admin.tsx`, `CustomerDetail.tsx`, `Executive.tsx`, `Overview.tsx`, `ProjectDetail.tsx` — identical to S1's conflict file set. Using the true fork as base is unusable (it imports the removal); the post-removal base is correct but produces one ~50k-line, 338-file PR that touches ~13 spine files at once — unreviewable under INTERNAL's rules, flattens 64 commits' blame into one, and forces one giant CHANGELOG entry.

### S4-hybrid — one squashed 3-way merge per CUST PR (`git cherry-pick -m 1 <merge>`)

**Dry run** (`$PLAN/wt-s4` at 154b42f; 22 CUST PR merges #2–#25 except #13): **13 clean, 9 conflicted, 35 hunks.**

| CUST PR | result | hunks | conflicting files |
|---|---|---|---|
| #2 feat/itop-p1-tickets | CONFLICT | 8 | UU:CHANGELOG.md(1)<br>UU:CLAUDE.md(1)<br>DU:INSTALL.md(0)<br>DU:OPERATIONS.md(0)<br>UU:backend/prisma/schema.prisma(1)<br>UU:docs/CONFIGURATION.md(2)<br>UU:frontend/src/pages/Admin.tsx(3) |
| #3 feat/itop-p2-daily-review | CLEAN | 0 | - |
| #4 feat/itop-p3-utilization | CONFLICT | 2 | UU:frontend/src/lib/navCommands.test.ts(1)<br>UU:frontend/src/lib/navCommands.ts(1) |
| #5 feat/itop-p4-webhook-taskref | CLEAN | 0 | - |
| #6 feat/itop-p5-write-path | CLEAN | 0 | - |
| #7 feat/itop-p6-board | CONFLICT | 1 | UU:docs/DESIGN.md(1) |
| #8 feat/itop-p7-timer | CLEAN | 0 | - |
| #9 fix/itop-real-install | CLEAN | 0 | - |
| #10 fix/itop-timezone | CLEAN | 0 | - |
| #11 fix/admin-guard-login | CONFLICT | 1 | UU:CLAUDE.md(1) |
| #12 feat/help-page | CLEAN | 0 | - |
| #14 feat/epics | CLEAN | 0 | - |
| #15 feat/ui-professional-pass | CONFLICT | 12 | UU:backend/src/routes/dailyReview.ts(1)<br>UU:docs/DESIGN.md(1)<br>UU:frontend/src/components/ProjectFormModal.tsx(1)<br>UU:frontend/src/components/StatusChip.tsx(1)<br>UU:frontend/src/lib/navCommands.test.ts(1)<br>UU:frontend/src/lib/queries.ts(1)<br>UU:frontend/src/pages/Admin.tsx(1)<br>UU:frontend/src/pages/CustomerDetail.tsx(1)<br>UU:frontend/src/pages/Executive.tsx(1)<br>UU:frontend/src/pages/Overview.tsx(1)<br>UU:frontend/src/pages/ProjectDetail.tsx(2) |
| #16 docs/archive-epics-spec | CLEAN | 0 | - |
| #17 feat/collab-quick-wins | CONFLICT | 1 | UU:CLAUDE.md(1) |
| #18 feat/project-members | CONFLICT | 8 | UU:backend/CLAUDE.md(1)<br>UU:backend/prisma/schema.prisma(1)<br>UU:backend/src/lib/visibility.ts(3)<br>UU:backend/src/routes/projects.ts(2)<br>UU:frontend/src/components/ProjectFormModal.tsx(1) |
| #19 feat/task-conflict-warning | CLEAN | 0 | - |
| #20 feat/activity-notifications | CLEAN | 0 | - |
| #21 fix/mention-query-count-test | CLEAN | 0 | - |
| #22 feat/guest-links | CLEAN | 0 | - |
| #23 docs/close-collaboration-plan | CONFLICT | 1 | UU:.gitignore(1) |
| #25 fix/ghcr-branch-tag | CONFLICT | 1 | UU:.github/workflows/docker-publish.yml(1) |

Final tree differs from the S1 replay in only 3 files (d6a17cc vite tweak, bce1a5a HMR-trap line, f3fcbc3 duplicate guardrail — all deliberately excluded here). So per-PR squashing costs nothing in conflicts versus per-commit replay; it only trades commit granularity for fewer stops.

### 5.6 Prisma migrations (all strategies)

INTERNAL `backend/prisma/migrations` ends with `20260909180922_weekly_achievements`, `20260925140000_opportunity_flow_redesign`; INTERNAL prod has all of them applied. CUST adds 13 (one forbidden):

| CUST migration | series | content | port as |
|---|---|---|---|
| `20260922034304_remove_pipeline_module` | removal | DROP opportunities, opportunity_activities, opportunity_links, pipeline_import_logs, 2 enums, `projects.sa_id` | **NEVER** (skipped in S1/hybrid; S2 must delete it) |
| `20260922075353_itop_snapshot` | ITOP P1 | +customers.itop_org_id/name, +users.itop_person_id/user_id, CREATE itop_config, itop_tickets | additive |
| `20260922182346_itop_time_entries` | UTIL | CREATE itop_time_entries, drop/recreate an itop_tickets index | additive (only touches its own tables) |
| `20260922185807_itop_time_entry_indexes` | UTIL | index swap on itop tables | additive |
| `20260923024304_task_itop_ticket_ref` | ITOP P4 | tasks +1 column | additive |
| `20260923035039_itop_write_path` | ITOP P5 | itop_tickets, users +columns (token storage) | additive |
| `20260924063858_itop_timezone` | ITOP tz | itop_config.timezone default 'UTC' | additive |
| `20260924131112_epics` | EPIC | CREATE epics, tasks.epic_id (+FK, index) | additive |
| `20260930090000_project_members` | MEMBERS | CREATE project_members | additive; no reference to sa_id |
| `20260930120000_activity_events` | ACTIVITY | CREATE activity_events (**project_id NOT NULL, entity_id INTEGER**) | additive — but see Pipeline note below |
| `20260930130000_notifications` | NOTIF | CREATE notifications (FK activity_event_id NOT NULL) | additive |
| `20260930140000_comment_mentions` | MENTION | comments.mentioned_user_ids int[] | additive |
| `20260930150000_share_links` | SHARE | CREATE share_links | additive |

Verified: no CUST feature migration references `sa_id`, `opportunit*` or pipeline enums (`grep -il` over all 12), and INTERNAL's `20260925140000` touches only the opportunity tables — the two sets are independent.

Reconciliation options:
1. **Keep CUST names verbatim.** Six of them sort *before* INTERNAL's `20260925140000`. `prisma migrate deploy` applies every not-yet-applied migration it finds, so prod would apply them after 0925 out of lexical order **(behaviour believed correct but unverified here — no docker/prisma runs allowed)**; the shadow DB in `migrate dev` replays lexically, which works only because the sets are independent. Benefit: byte-identical to CUST DBs. That benefit is moot — CUST DBs have `remove_pipeline_module` applied and can never converge onto INTERNAL's history anyway.
2. **Recommended: fresh timestamps.** In each port PR, `git mv` the CUST migration dir to `2026100x…_<same slug>` after the newest INTERNAL migration (SQL bytes unchanged, so "never edit committed SQL" is respected — this SQL was never committed/applied in INTERNAL), then verify with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url …` = empty (run by the implementor in the container; not run here). Apply strictly in CUST order (epics before members before activity before notifications …) because later ones FK to earlier ones (notifications -> activity_events).
3. Alternative to 2: regenerate each via `prisma migrate dev --name <slug>` from the merged schema (INTERNAL's documented convention) and diff against CUST's SQL as a cross-check; identical output expected for all 12 (generator-shaped, no hand edits seen).
- **ACTIVITY + Pipeline (new work):** `activity_events.project_id` is NOT NULL with an FK to projects and `entity_id` is INTEGER, while opportunities have UUID ids and no project until won. Extending the log/notifications to Pipeline events needs a new additive migration (e.g. nullable `project_id` + nullable `opportunity_id uuid` FK, or a second event source feeding `notifications` from the existing `opportunity_activities`). Design decision for the user before that PR.
- **Prod deploy note:** CUST PR #2 makes `SECRETS_KEY` (base64, 32 bytes) a *required* backend env var (`backend/src/env.ts`); `setup.sh` was updated to generate it for old installs. INTERNAL prod must re-run `setup.sh` (or add the var) before deploying the first iTop PR, or the backend will refuse to start.

### 5.7 Comparison

| | S1 replay (per commit) | S2 reverse | S3 manual | S4 single squash | S4-hybrid / S1-per-series |
|---|---|---|---|---|---|
| textual conflicts (measured) | 14/64 commits, 37 hunks | 17 files/27 hunks + 2 + 2 + 13 add/add | n/a | 23 files (base 30106e8) / 58 (base 9f5fc20, plus 11 silent deletions) | 9/22 PRs, 35 hunks |
| hand-merge hot spots | same ~17 files in all strategies | same | same (by construction) | same | same |
| silent Pipeline regressions | yes, in ~25 clean picks + new CUST files (UIPASS, ACTIVITY) | fewer in old files, same in new CUST files | none if done carefully | as S1 | as S1 |
| effort | low transport + medium integration | medium + history surgery | very high (~47k lines) | low transport, very high review | low transport + medium integration |
| history / blame | keeps 64 CUST commits, authors, dates | replaces INTERNAL history; blame collapses to 10c0b16 | new commits only | one commit | per-commit (S1-per-series) or one commit per CUST PR |
| CHANGELOG | CUST entries arrive per commit (need re-dating) | CUST's file wins, INTERNAL entries must be re-added | written fresh | one mega-entry | per PR |
| reviewability (phase=branch=PR, spine review) | good when grouped | poor (force-push/unrelated histories) | good but huge volume | unreviewable (338 files, ~13 spine files) | good |
| migrations | additive; rename to fresh timestamps | same + delete removal migration | regenerate | same as S1 | same as S1 |

## 6. Recommendation

**Hybrid: S1 replay grouped per feature series (one INTERNAL phase PR per series), each PR = the CUST commits cherry-picked in order (`git cherry-pick -x`, keeps CUST author/date and records the CUST hash) + one hand-written "Pipeline/SA integration" commit (S3-style, using CUST as the reference) + migration renames + CHANGELOG re-dating.** Reasons, all from the dry runs:
- Conflict cost is identical across S1, S2, S4 and the hybrid (same ~17 hot-spot files, 27–37 hunks); only S1/hybrid keep INTERNAL's history, PR flow and CHANGELOG intact. S2 and single-squash S4 are rejected (history replacement / 338-file PR). S3 as transport is rejected (~47k lines to retype for 50 commits that apply cleanly).
- 50/64 commits and 13/22 CUST PRs apply with no textual conflict; the 14 stops cluster in 3 series (iTop P1, UI pass, Members) plus trivial doc lines.
- The real work is semantic and is the same in every strategy: union-merge `schema.prisma`, `visibility.ts`, `routes/projects.ts`, `dailyReview.ts`↔new `lib/dailyReviewScope.ts`, `CustomerDetail.tsx`↔new `customer/AccountOverview.tsx`, `ProjectFormModal.tsx`, `ProjectDetail.tsx`, `Admin.tsx`, `navCommands.ts`, `StatusChip.tsx` (`CHIP_BASE`), `queries.ts`, `Overview.tsx`, `Executive.tsx`, docs; then add Pipeline/SA to CUST's new surfaces (sidebar groups, routeMeta, palette actions, labels, Help, demo seed, activity log).
- Never resolve with "theirs"/"ours": the dry run shows "theirs" deletes the Opportunity models from the schema and SA scoping from visibility/daily review; "ours" (S2 direction) drops members' `canUserSeeProject`.

Rules mapping: phase = branch (`port/<series>` off fresh `origin/develop`) = PR into `develop`, assigned to alfi-rajasyah; the cherry-picks and the integration commit are prepared by the orchestrator and committed only with explicit user approval; every PR touches the spine (`queries.ts` in all but 3), so each gets the reviewer pass; gates.sh once per PR; docs-keeper triggers fire for PRs that touch `index.css`, env/compose/`setup.sh`/`nginx.conf` (#1, #6–#7, #10). CUST guardrail lines arriving via `CLAUDE.md` conflicts (iTop write-token/ticket-board guardrails, members visibility rule, Vite HMR trap) are **proposals** for the user (Guardrails are user-owned); the WorkLogs standing decision and the "SA is an owner" wording need a user edit before/with the Utilization and Members PRs.

### Ordered PR sequence (must follow CUST order — later commits' context depends on earlier ones; e.g. the UI pass edits iTop and Epic components)

| # | INTERNAL PR (branch) | CUST PRs / commit range (non-merge, oldest..newest) | commits | size (code, excl. docs) | expected conflicts (dry run) | migrations (rename to fresh 202610xx timestamps) | integration work (manual) |
|---|---|---|---|---|---|---|---|
| 1 | `port/itop-tickets` — iTop P1+P2, SECRETS_KEY | #2 + #3: `6ff1d3a..f0678ea` | 13 | 53 files, +8187/-26 | 03ea2e4 `schema.prisma` 1 hunk (110/35 — append iTop models AFTER the Opportunity block, keep both); 9467f9b `Admin.tsx` 3×1/1 (tab list: keep Pipeline + add iTop); 742eef1 `CLAUDE.md`, `CHANGELOG.md`, `docs/CONFIGURATION.md` 2, `INSTALL.md`/`OPERATIONS.md` modify/delete (keep deleted) | itop_snapshot | SECRETS_KEY prod rollout (re-run setup.sh); ci env; spine: schema, migration, queries, setup.sh |
| 2 | `port/utilization` — Work Logs -> Utilization | #4: `5b3d0a5..b4e666d` | 5 | 26 files, +2280/-39 | 065f078 `navCommands.ts` 5/2 + `.test.ts` 1/1 (keep Pipeline nav entry) | itop_time_entries, itop_time_entry_indexes | user edits the WorkLogs standing decision in CLAUDE.md |
| 3 | `port/itop-actions` — webhook, task ticket ref, personal tokens | #5 + #6: `9a677ad..efe4388` | 8 | 43 files, +4704/-97 | none | task_itop_ticket_ref, itop_write_path | review `routes/tasks.ts` (spine) |
| 4 | `port/itop-board` — board, new ticket, timer, real-install + timezone fixes | #7–#10: `694c505..933d3d0` | 11 | 60 files, +7559/-335 | 9d64304 `docs/DESIGN.md` 1/1 | itop_timezone | docs-keeper (DESIGN) |
| 5 | `port/help-signin` — admin sign-in guard, Help page | #11 + #12: `e47d68a..5caef7f` (skip f3fcbc3 — INTERNAL already has 19754a6) | 3 | 14 files, +858/-28 | e47d68a `CLAUDE.md` 2/2 (guardrail proposal) | — | Help content: add Pipeline + SA sections (`helpContent.ts`) |
| 6 | `port/epics` | #14: `8b9fa3a` | 1 | 36 files, +3133/-48 | none textual | epics | review SolvroGantt (spine), `routes/projects.ts`, `routes/tasks.ts`; check Epic UI vs DESIGN.md |
| 7 | `port/ui-pass` — labels/day-first dates, health, customers account page, overview tiles, task filters, sidebar groups, palette, skeletons, focus | #15 + #16: `489b0a4`, `823639d` | 2 | 147 files, +7605/-2572 | **12 hunks**: `dailyReview.ts` 101/4, `CustomerDetail.tsx` 680/0, `ProjectFormModal.tsx` 30/13, `ProjectDetail.tsx` 7/1+16/6, `StatusChip.tsx` 6/2, `navCommands.test.ts` 4/17, `queries.ts`, `Admin.tsx`, `Executive.tsx`, `Overview.tsx`, `DESIGN.md` | — | largest: SA scope into `lib/dailyReviewScope.ts`; customer Pipeline section into `customer/AccountOverview.tsx`; keep `export CHIP_BASE`; Pipeline in sidebar groups/`routeMeta.ts`/`paletteActions.ts`/`labels.ts`; SA in `ProjectHeaderFacts.tsx`; opportunities in `seed-demo.ts`. Consider a follow-up PR 7b applying the UI-pass conventions (labels, `formatDate`, skeletons) to the Pipeline pages |
| 8 | `port/collab-quick-wins` — live refresh, copy link, deep links | #17: `25dbeec..ad246c6` | 5 | 23 files, +660/-20 | 49c00b0 `CLAUDE.md` 1/1 | — | live refresh for Pipeline queries too (optional) |
| 9 | `port/project-members` | #18: `af9a362..c6f39b2` | 3 | 38 files, +2606/-92 | **8 hunks**: `visibility.ts` 5/8, 7/8, 3/3; `routes/projects.ts` 3/2, 2/3; `schema.prisma` 3/1; `ProjectFormModal.tsx` 3/6; `backend/CLAUDE.md` 1/1 | project_members | visibility rule = owner/TAM ∪ SA (`saId`) ∪ members ∪ view-all; SA is not an owner (user decision); spine instant review |
| 10 | `port/edit-conflict-warning` | #19: `2d9b0a8..2abbf56` | 3 | 11 files, +2116/-124 | none | — | — (could ride with #9 or #11) |
| 11 | `port/activity-notifications` — activity log, notifications, @mentions | #20 + #21: `476288e..ebe8953` | 3 | 38 files, +4905/-144 | none textual | activity_events, notifications, comment_mentions | **new**: Pipeline events into the log/notifications — needs a design decision + one extra additive migration (nullable project_id / opportunity_id) |
| 12 | `port/guest-links` | #22: `eadc065..2ecb148` | 2 | 32 files, +3124/-7 | none | share_links | nginx.conf + setup.sh (spine, docs-keeper CONFIGURATION) |
| 13 | `port/docs-ci` — collaboration-plan archive, iTop guide, CI image-tag fix | #23 + #25: `c729454`, `3ad5731` (+ optional d6a17cc VITE_ALLOWED_HOSTS, bce1a5a HMR trap) | 2–4 | 4 files code, +19/-4; docs +2.2k | `.gitignore` 3/2; `docker-publish.yml` 1/4 (re-apply the `workflow_run.head_branch` tag fix to INTERNAL's `IMAGE_OWNER/solvro-*` lines) | — | drop CUST-only docs (`setup-sh-hardening.md`, customer guardrails draft) |

Never ported: 10c0b16 (import/packaging), ae9e511 (Velora retirement — INTERNAL keeps `import-velora.ts`), 1a3e905 + af85228 (removal + its guardrails, incl. the `remove_pipeline_module` migration), f3fcbc3 (duplicate guardrail).
Totals: ~59 CUST commits across 13 PRs, ~+47k/-3.5k code lines, 12 migrations (+1 new for Pipeline activity).

**Commit-message guardrail hit (verified):** 39 of CUST's post-removal non-merge commits carry `Co-Authored-By: Claude Fable 5.1 …` (33) or `Co-Authored-By: Claude Opus 5.5 …` (6) trailers. INTERNAL's guardrail (19754a6, 2026-10-02) forbids any Claude/AI attribution in commits. Plain `cherry-pick` copies the message verbatim, so every picked commit must have the trailer stripped before it is committed (e.g. `git cherry-pick -x --no-commit <c>` then `git commit -C <c>` followed by an amend whose message filters out `^Co-Authored-By: Claude`, or one squashed commit per CUST PR with a fresh message). If the user prefers fewer, cleaner commits, the S4-hybrid variant (`git cherry-pick -m 1 <CUST merge>` = one commit per CUST PR, 9/22 conflicted, same hunks) is the equivalent fallback and sidesteps the trailer issue.

Per-PR mechanics (suggested): `git fetch origin && git switch -c port/<series> origin/develop`; `git fetch /home/solvro-internal/solvro-cust develop:refs/remotes/cust/develop`; `git cherry-pick -x <range>`; on conflict union-resolve by hand (never -X); `git mv` migration dirs to fresh timestamps; integration commit; CHANGELOG re-date; scoped checks, then gates.sh; reviewer; user approval; PR + assignee.

## 7. Cleanup
Done 2026-10-02: worktrees `wt-s1`, `wt-s4` (INTERNAL) and `wt-s2` (CUST) removed with `git worktree remove --force` + `git worktree prune`; temp refs `refs/remotes/cust/develop` (INTERNAL) and `refs/dry/internal` (CUST) deleted. Verified: INTERNAL `git status -sb` = `## develop...origin/develop` + ` M .claude/settings.local.json` only; CUST clean; `git worktree list` shows one entry in each repo. The dry-run commits and cross-fetched objects remain only as unreachable loose objects (pruned by a future `git gc`); no branch, ref, index or working-tree change remains.

Artifacts kept in `$PLAN`: `s1b.sh` (census script), `s1_log.tsv` (hunk-level census, authoritative), `s1_log_wholefile.tsv` (superseded), `s2_conflicts.txt`, `s2_pick.log`, `s4_log.tsv`, `mt_9f5fc20.txt`, `mt_30106e8.txt`, `impcheck.py`, `tags.txt`, `removal_numstat.txt`.

### Unverified items
- Prisma `migrate deploy`/`migrate dev` behaviour with out-of-lexical-order migrations (option 1 in 5.6) — not run.
- Whether the merged schema produces zero drift against the 12 renamed migrations — `prisma migrate diff` not run.
- Type-correctness of any merged tree: only a regex import-name check was run, no `tsc`, no tests.
- Why CUST PR #24 is missing (closed/unmerged assumed).
