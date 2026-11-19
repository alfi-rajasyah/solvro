# Issues wave 1: tasks API, Pipeline ordering, task form

Status: in progress (2026-11-19), branch `fix/issues-wave-1`. Archive path once shipped: `docs/archive/plans/issues-wave-1.md`.

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

(Filled in at integration.)
