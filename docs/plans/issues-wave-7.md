# Issues wave 7: backend checks, small UI, tests

Status: in progress, branch `fix/issues-wave-7`. Archive path: `docs/archive/plans/issues-wave-7.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| AA. Backend checks | ISS-183, ISS-184, ISS-198, ISS-032 | `backend/src/routes/projects.ts` (task create), `routes/opportunities.ts`, `routes/projectMembers.ts`, the project detail payload, services routes, `frontend/src/components/EpicPanel.tsx`, `ServiceMappingList.tsx`, `ProjectServices.tsx`, backend tests |
| AB. Small UI | ISS-185, ISS-069, ISS-196, ISS-197 | `frontend/src/components/LabelPicker.tsx`, `TaskFormModal.tsx` (assignee row only), `lib/mentions.ts` and its chip renderer, `reui/autocomplete.tsx`, `reui/VENDOR.md`, tests |
| J. Tests | ISS-144, ISS-153, ISS-162, ISS-163, ISS-165 | a new e2e spec, `backend/test/search.test.ts`, `activity.test.ts`, `notifications.test.ts`, `taskAssigneeMembers.test.ts`, `frontend/src/components/accessibleNames.test.ts` |

User decisions (2026-11-19):
- ISS-032: block new adds of inactive services (pickers, bulk add, PUT routes). Existing links stay.
- ISS-034, ISS-038, ISS-006: accepted as is, closed without a change.

## Dependency graph

AA, AB and J share no files. Backend tests run in AA and J under the backend-tests lock. Frontend typechecks are serialized with a lock file.

## Acceptance

- AA: task create refuses due before start (400 `invalid_date_range`); stage re-pack locks rows in id order; member DTO and project TAM/SA carry `active`, and the epic owner picker drops inactive people except the current owner; inactive services cannot be newly linked.
- AB: no side-scroll in the task form at 375px with the label creator open; mention chips of deactivated users look muted with a tooltip; the autocomplete item class matches upstream and the empty-list scroll fix is in.
- J: the always-dark pin has an e2e spec; the search, recipient-lock, backfill and accessible-name tests are tightened.
- `gates.sh` green; one opus phase review; Delivery Gate for visible changes.
