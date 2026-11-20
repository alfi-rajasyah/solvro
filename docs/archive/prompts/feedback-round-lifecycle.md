# Goal prompt — feedback round (lifecycle, hold, offboarding, help)

Read `docs/archive/plans/feedback-round-lifecycle-spec.md` and `docs/archive/plans/feedback-round-lifecycle-plan.md` in full, then execute the plan as orchestrator. You write no feature code.

**Setup.** `git fetch origin`; work on `feat/feedback-round-lifecycle`, rebased on `origin/develop`. Dev stack up (`docker compose up -d`).

**Execution.**
- Dispatch waves exactly as the plan lays them out, one `solvro-implementor` per task, each briefed with its task block, its spec section, and its file boundary. T0 runs alone.
- When a wave's agents have reported: check the working tree, send each spine-touching task's diff to `solvro-reviewer`, return findings and any gate failure to the same implementor (never a fresh one), then run `.claude/scripts/gates.sh --performed-review=opus` once. Append that wave's CHANGELOG entries yourself, in public-reader wording.
- Do not poke idle agents; verify from the tree or stop them.
- Decisions in spec §6 are settled. Anything genuinely new and blocking: pick the option closest to the spec's intent, record it in the spec under §6, and carry on — only stop for something that would change a guardrail in `CLAUDE.md`.

**Close.** Full e2e once, `gates.sh` green, one phase review on the combined diff, fixes, docs-keeper if a trigger fired. Commits and the PR are pre-approved for this branch (spec §6 D4) once gates and the phase review are green: one commit per task, push, open one PR into `develop` (repo PR template, no attribution lines, no deployment hostnames), assign it to `alfi-rajasyah`, and `TaskStop` every agent. If gates or the review cannot be made green, stop and report instead.
