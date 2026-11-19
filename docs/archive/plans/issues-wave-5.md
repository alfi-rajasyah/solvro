# Issues wave 5: exports, users and access, small UI

Status: shipped 2026-11-19, branch `fix/issues-wave-5`. Archive path: `docs/archive/plans/issues-wave-5.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| O. Exports | ISS-138, ISS-139 | `frontend/src/lib/gantt/exportExcel.ts`, `exportPdf.ts`, `PipelineImportDialog.tsx` (download helper only), a shared download helper, tests |
| P. Users and access | ISS-007, ISS-009 (tag length only), ISS-191, ISS-071, ISS-012 | `backend/src/logger.ts`, `lib/secretBox.ts`, `routes/users.ts`, `routes/admin.ts`, `lib/offboarding.ts`, `frontend/src/lib/auth.tsx`, `lib/api.ts`, `lib/handover.ts`, `pages/Admin.tsx`, tests |
| S. Small UI | ISS-060, ISS-063, ISS-070, ISS-074, ISS-075 | `pages/Tasks.tsx`, `kanban-v2/cards.tsx`, `daily-review/MidweekSyncModal.tsx`, `ReflectionSyncModal.tsx`, `ProjectMembers.tsx`, `pages/Projects.tsx`, tests |

Out of this wave: ISS-010 and ISS-013 (paginating GET /users changes every picker's API shape), the AAD and key-rotation half of ISS-009 (needs a migration of stored secrets).

## Dependency graph

O, P and S share no files. Backend tests run only in P. Frontend typechecks are serialized with a lock file.

## Acceptance

- O: one download helper revokes the object URL on a later task; the PDF export hatches the incomplete part of a bar and squares rollup caps like the screen; no note reaches an export (Guardrail).
- P: pino redacts token fields; `open` requires a 16-byte GCM tag; GET /users carries a `hasAccess` flag, both handover and reassign pickers filter on it, PUT /admin/projects/reassign refuses a receiver without access, and the server drops its role-name check; SALES counts as built-in (derived from the server's builtIn flag); a sign-out in one tab signs out the others.
- S: Tasks grid and Kanban subtask rows show the Critical Path mark; a blocked midweek or reflection save marks the card missing its title; the Members button explains the SA; the Tasks page needs no extra GET /projects; filter operator labels come from one constant.
- `gates.sh` green; one opus phase review (exports, secrets and auth are on the spine); Delivery Gate for visible changes.

## Records

- Commits: S `8339f1c`, O `a902632`, P `bfae8f7`, adopt navigation `f47c73f`, ISS-074 `362475e` (needed the GET /tasks project status, done after P freed queries.ts), S nits `bdbbd2c`, O nits `33fd96a`, P fixes and docs `294e2b9`, copy and docs `a63eb89`, same-account token swap (the last code commit).
- Phase review (opus): 0 blockers, 3 should-fix (custom roles KPI counted seeded roles; log redaction missed auth headers; cross-tab adopt could write the old user back), 7 nits. All fixed. Re-check: 1 should-fix (a same-account token change reloaded other tabs), fixed; copy and changelog nits fixed.
- Closed 11: ISS-007, 012, 060, 063, 070, 071, 074, 075, 138, 139, 191. ISS-009 narrowed to AAD and key rotation.
- Delivery Gate: PASS. Light and dark, 375px and 1280px: the members dialog shows the SA sentence; the Tasks grid shows Critical Path marks; no page side-scroll. The PDF hatch and caps were checked by rendering before and after PDFs (pdf.js). The Custom roles count, sync-modal marking and cross-tab behaviour are covered by tests.
