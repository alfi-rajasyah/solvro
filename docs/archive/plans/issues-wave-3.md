# Issues wave 3: offboarding, app shell icons, query hooks

Status: shipped 2026-11-19, branch `fix/issues-wave-3`. Archive path: `docs/archive/plans/issues-wave-3.md`.

Lane P. One PR into `develop`. Task 0 (orchestrator) adds the DOM test environment the user approved for ISS-190; then D, H and K run in parallel.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| 0. DOM tests | ISS-190 | `frontend/package.json`, lock, `vitest.config.ts`, `src/test/domSmoke.test.tsx` (done, `9c06742`) |
| D. Offboarding | ISS-030, ISS-076, ISS-015, ISS-017, ISS-148 | `backend/src/lib/offboarding.ts`, `backend/src/routes/admin.ts`, `frontend/src/components/admin/HandoverModal.tsx`, `frontend/src/lib/handover.ts`, `frontend/src/pages/Admin.tsx`, `ProjectStatusChangeDialogs.tsx` (tests only), tests |
| H. App shell icons | ISS-043, ISS-081, ISS-049, ISS-082 | `frontend/index.html`, `frontend/src/index.css`, `InstallBanner.tsx`, `vite.config.ts`, `frontend/public/` |
| K. Query hooks | ISS-021, ISS-044, ISS-046, ISS-064, ISS-112 | `frontend/src/lib/queries.ts`, `frontend/src/pages/CustomerDetail.tsx`, tests |

Out of this wave: ISS-031 (needs a timing measurement first), ISS-022 and ISS-065 (considered and accepted in their entries), ISS-141 (self-hosted fonts change the app shell and need new packages).

## Dependency graph

D, H and K share no files. Frontend typechecks are serialized with a lock file (one `tsc` at a time in the container). H fixes ISS-043 at the stylesheet layer and reports, rather than edits, icon classes in files other tasks own.

## Acceptance

- D: the server refuses a PENDING or zero-permission receiver; the handover preview refetches on focus; the reassign column uses a searchable picker; customer reassignment checks each new owner once and uses one `updateMany` per owner; component tests for HandoverModal and ProjectStatusChangeDialogs.
- H: Tailwind size and display utilities win over the Material Symbols stylesheet; InstallBanner has two sibling buttons with a usable dismiss target; a 192px maskable icon; a dark-scheme favicon.
- K: creating a task refreshes Daily Review; service mapping is optimistic with rollback; the section chip follows a cross-section drag; CustomerDetail types and uses `itopOrgId`/`itopOrgName`; a failed section PATCH re-seeds the order.
- `gates.sh` green; one opus phase review (K touches `lib/queries.ts`, on the spine); Delivery Gate for visible changes (icons, InstallBanner, Admin picker).

## Records

- Commits: 0 `9c06742`, D `7e6547f`, H `be6a448`, K `b4bb1df`, docs `41410ef`, review fixes `cceb1f2` (prod icon font), `83d6cce` (docs), `406e02f` (D), `e23e3cf` (K), final copy fixes in the last commit.
- The user accepted the app-wide icon size change (icons now follow their size classes), 2026-11-19, after before/after screenshots.
- Phase review (opus): 1 blocker (in a production build Vite hoists the icon `@import`, so icon buttons lost the icon font; dev hid it), 5 should-fix, 5 nits. All fixed or filed (ISS-191 broadened, ISS-193). Re-check: 2 copy nits, fixed.
- Closed 15: ISS-015, 017, 021, 030, 043, 044, 046, 049, 064, 076, 081, 082, 112, 148, 190. New: ISS-191, 192, 193.
- `gates.sh --performed-review=opus`: all gates pass.
- Delivery Gate: PASS.
  - Icons: verified in a production build served by `vite preview` (the dev server hides the hoisting): 49 icons on the project Kanban, all on the icon font, including 11 icon buttons; size classes apply; a `hidden` icon is hidden.
  - TAM picker (Admin, Project Override): light and dark, 375px and 1280px; typing filters (111 matches for "a"), popup inside the viewport, no page side-scroll.
  - Install banner: covered by its unit tests (needs a real install prompt to show); `tap-target` on both dismiss buttons.
