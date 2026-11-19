# Issues wave 4: Gantt, task panel and section modal, accessibility components

Status: shipped 2026-11-19, branch `fix/issues-wave-4`. Archive path: `docs/archive/plans/issues-wave-4.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| GA. Gantt | ISS-093, ISS-095, ISS-097, ISS-098, ISS-100, ISS-102, ISS-103, ISS-104, ISS-106 | `frontend/src/components/reui/gantt/*`, `frontend/src/components/gantt-v2/*`, `frontend/src/lib/gantt/palette.ts`, tests |
| LR. Task panel and section modal | ISS-061, ISS-067, ISS-111, ISS-113, ISS-155, ISS-189, ISS-192 | `frontend/src/components/TaskPanel.tsx`, `SectionReorderModal.tsx`, `pages/views/ProjectList.tsx` only for the modal mount, a new e2e spec, tests |
| T. Accessibility components | ISS-083, ISS-084, ISS-088, ISS-089, ISS-091, ISS-092 | `hooks/useDialogFocus.ts`, `LinksSection.tsx`, `Modal.tsx`, `Drawer.tsx`, `pages/Overview.tsx`, `portfolio/PortfolioCalendar.tsx`, `pages/views/ProjectEpics.tsx`, the one ProjectList.tsx line in ISS-091, tests |

The planned M (engine) and N (layer) groups both edit `SolvroGantt.tsx`, so they merge into one writer (GA). Out of this wave: ISS-096 (needs a schema change or a new API field) and ISS-101 (a readability refactor of a spine callback).

## Dependency graph

GA, LR and T share no file except `ProjectList.tsx`, where LR may touch only the modal mount and T only the line ISS-091 names; they coordinate through the orchestrator. Frontend typechecks are serialized with a lock file.

## Acceptance

- GA: the name column follows the pane width live and never clips the fixed columns; the date picker and drag clone use whitelisted shadows (or the dead picker is removed); milestone arrows meet the diamond; the Dates cell shows the range once while editing; Gantt mutations surface failures; section-id parsing lives in `adapter.ts`; the legend does not sort twice. Vendored edits carry `SOLVRO PATCH` markers.
- LR: header-menu errors are visible; a failed tasks fetch shows an error with retry; the modal guards its own permission, always has one exit, re-seeds after a failed save, uses `FIELD_FOCUS` on handles (as TaskPanel's handle does); a Playwright spec drags a section.
- T: the shared focus trap wraps from any focus position; LinksSection buttons show the focus ring; off-scale text sizes move to type roles; Overview and PortfolioCalendar use the data-mono token and no `rounded-full` bar; epic swatches are usable on touch.
- `gates.sh` green; one opus phase review (GA touches `gantt-v2/` and vendored `reui/`, on the spine); Delivery Gate for visible changes.

## Records

- Commits: T `cbd2923`, GA `27eef7f`, comment `65f0291`, LR `c2a68d3`, ISS-062 `4fe66db`, LR fixes `6799b2e`, GA fixes (the commit before the docs commit).
- ISS-062 joined LR during the wave: the section modal's new permission guard exposed the same task:write vs project:write gap on the Project List.
- Phase review (opus): 0 blockers, 3 should-fix (copied modal header reintroduced an off-scale title; Reorder button gate; Gantt section no-op regression), 5 nits, 1 deferrable. All fixed; the deferrable two-drop race was small and fixed; ISS-194 (Modal close button) filed and fixed.
- Splitter drag cost measured on 160 tasks (p95 frame): engine alone 16.8ms; React-state width 316ms; CSS-variable width 50ms (about 20fps). The user chose the live drag (no clipping) over a smooth drag that clips until release, 2026-11-19.
- Closed 24: ISS-061, 062, 067, 083, 084, 088, 089, 091, 092, 093, 095, 097, 098, 100, 102, 103, 104, 106, 111, 113, 155, 189, 192, 194.
