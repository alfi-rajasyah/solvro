# Issues wave 3: offboarding, app shell icons, query hooks

Status: in progress (2026-11-19), branch `fix/issues-wave-3`. Archive path once shipped: `docs/archive/plans/issues-wave-3.md`.

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

(Filled in at integration.)
