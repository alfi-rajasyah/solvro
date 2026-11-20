# Issues wave 7: backend checks, small UI, tests

Status: shipped 2026-11-19, branch `fix/issues-wave-7`. Archive path: `docs/archive/plans/issues-wave-7.md`.

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

## Records

- Commits: AA `05d3b6d`, AB `ff34ebb`, J `fae8ea4`, AB fixes `4d15c3f`, AA fixes `fc5d174`, J fixes `964cb54`, offboarding lock order `b65a33d`, then the issue records and this archive.
- Phase review (opus): 1 blocker (a disabled service checkbox kept a pointer cursor), 4 should-fix (ISS-184 left deadlock paths; the sidebar half of the dark-pin spec could not fail; deal-note mention chips not muted; ISS-162 had no change), 4 nits. All fixed. Re-check: 1 should-fix (offboarding locked the leaver's row before the stage locks, which could deadlock with a deal create), fixed by taking stage locks first.
- ISS-162 is verification only: with the task row lock removed, both concurrency tests failed 3 of 3 runs; with it restored they passed. The dark-pin spec went red when `dark` was removed from the sidebar.
- Closed 16: ISS-006, 034, 038 (accepted as is), 032, 069, 144, 153, 162, 163, 165, 183, 184, 185, 196, 197, 198. Filed: ISS-199 (autocomplete focus border, older).
- Delivery Gate: PASS. Light and dark, 375px and 1280px: the task form with the label creator open has no side-scroll (document 375/375, modal body 374/374); a deactivated user's mention chip renders muted with "(deactivated)" screen-reader text; no page side-scroll. The epic owner and service picker changes are covered by tests and the review.
