# Issues wave 1: tasks API, Pipeline ordering, task form

Status: shipped 2026-11-19, branch `fix/issues-wave-1`. Archive path: `docs/archive/plans/issues-wave-1.md`.

Lane P (several defects in one phase). One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| A. Tasks API | ISS-027, ISS-028, ISS-039 | `backend/src/routes/tasks.ts`, `backend/src/lib/taskOrdering.ts` if needed, backend tests |
| E. Pipeline | ISS-116, ISS-026, ISS-119, ISS-117 | `backend/src/routes/opportunities.ts`, `backend/src/lib/pipelineImport/*`, backend tests, the import dialog's error text if needed |
| F. Task form | ISS-041, ISS-042, ISS-051 | `frontend/src/components/LabelPicker.tsx`, `frontend/src/components/TaskFormModal.tsx`, frontend tests |

Out of this wave: ISS-014 (needs pagination or filters, a new API surface) and ISS-143 (adds ESLint, a new dependency and CI gate). Both stay open.

## Dependency graph

A, E and F share no files, so all three run in one parallel wave in the main working tree (the Docker containers mount the main checkout, so worktrees would test the wrong files). Backend test runs of A and E are serialized with a lock file.

## Acceptance

- A: deleting a task leaves its siblings densely packed, in the same transaction; a PATCH that would leave the effective due date before the effective start date is refused with 400 (or clamped, per the implementor's report); the list handler composes `where.project` through `AND`. Tests cover each.
- E: deleting or moving a deal re-packs its stage with one set-based statement (no per-sibling loop), so two concurrent deletes in one stage cannot deadlock; a concurrency test proves it. A non-empty unparseable Win Probability is a row error. The import queue is capped and refuses past the cap with 503 and a plain message.
- F: a duplicate label name shows "A label with this name already exists"; create mode offers only top-level tasks as parent; the subtask checkbox is disabled without edit rights.
- `gates.sh` green at integration; one opus phase review (A touches task ordering, on the spine); Delivery Gate for F's visible changes.

## Records

- Commits: F `653c1eb`, A `39af8f6`, E `de9ae4a`, docs `d9feb6c`, review fixes `f075bf7`, test fix `1fd2bd1`.
- Phase review (opus): 0 blockers, 2 should-fix (Pipeline move/delete stale stage; create and import without the stage lock), 6 nits. All fixed except one nit filed as ISS-184; a re-check confirmed the fixes and found a timer-based test, fixed in `1fd2bd1`.
- New issues: ISS-183 (task create accepts due before start), ISS-184 (re-pack vs offboarding lock order), ISS-185 (task form side-scroll at 375px).
- `gates.sh --performed-review=opus`: all gates pass at `f075bf7`.
- Delivery Gate (F): PASS. Light and dark, 375px and 1280px: a duplicate label shows "A label with this name already exists."; the create-mode parent picker lists top-level tasks only (subtask T-1197 absent). The subtask checkbox gate is a `disabled` attribute with no visual change, covered by a unit test. ISS-185 seen, pre-existing.
