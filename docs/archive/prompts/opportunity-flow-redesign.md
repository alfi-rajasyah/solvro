# Goal prompt — Opportunity Flow Redesign

Copy-paste the block below into a fresh session to execute the phase.

---

Execute the phase planned in `/Users/alfirajasyah/Documents/Solvro/docs/plans/opportunity-flow-redesign.md` (read it first, in full).

Context: the VP's opportunity flow spec (2026-09-25) replaces the Pipeline's single 9-value stage column with four independent attributes. `stage` becomes 6 values in a new order (Assessment → Technical Clarification → PoC → RFP → Delivered Proposal → Waiting Response); Won / Drop / Hold stop being stages and become `outcome` (won / lost / cancelled, with a reason category) and `statusTag` (hold / delayed); `subStatus` (progress / waiting for Sales input) and `lastActivityAt` are added; an idle alert is **computed on every read** from an SLA table in working days — never by a scheduled job (settled decision D1, do not re-open). A closed or held deal keeps the stage it stalled in. One migration rebuilds the enum and backfills existing Won / Drop / Hold rows. The board gets 6 columns, badges, a card menu (Hold, Delayed, Sales input, Close deal…), an Active / Closed switch and a Closed view; the detail page gets the Close deal dialog and Reopen; import, KPI, analytics and the handoff follow `outcome`.

Setup: `git fetch origin`, cut `feat/opportunity-flow-redesign` from `origin/develop`. No upstream until the post-approval push (`git push -u origin feat/opportunity-flow-redesign`).

Execution rules (per CLAUDE.md — read it and the area CLAUDE.md files as you go):
- Waves exactly as the plan's §7: W1 T1 (serial, spine: schema + migration → instant opus review) → W2 T2 ∥ T3 (backend on `solvro_t2_test`; `queries.ts` spine → instant opus review) → W3 T4 ∥ T5 ∥ T6 (serialize the three frontend typechecks) → W4 T7.
- `open -a Docker` and wait for the stack before any backend dispatch. `docker compose restart backend` before T7 (new routes 404 on a long-up container).
- `.claude/scripts/gates.sh` once per wave at integration, from the repo root; the expected reds after W1 and W2 are listed in §7 — record them, do not "fix" them out of order. Fix rounds CONTINUE the same implementor via SendMessage, never a respawn. Sonnet floor for all subagents.
- Each implementor reports its CHANGELOG entry text; append serially under `[Unreleased]` at integration — one writer.
- The plan's §1 Decisions are settled — follow them, don't re-ask. §10's VP questions have defaults applied; do not block on them.
- The migration SQL is hand-written (§2.3): Prisma's generated SQL fails on rows holding won / drop / hold. T1 reports its verification SELECT.
- Close: one `solvro-reviewer` phase review on the combined diff, `solvro-docs-keeper` (triggered: DESIGN.md's StageChip tone rows + docs/ISSUES.md line 196), then stage everything and draft one commit message per task + a PR body targeting `develop` (assign `alfi-rajasyah`) — and STOP for my approval. No commit, no push, no PR without it. `TaskStop` every agent at the end.
