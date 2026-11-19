# Issues wave 8: auth and iTop, drag and vendored UI, tests and lint

Status: in progress, branch `fix/issues-wave-8`. Archive path: `docs/archive/plans/issues-wave-8.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| AC. Auth, iTop, guest links | ISS-195, ISS-132, ISS-186, ISS-142 | `frontend/src/lib/auth.tsx`, `backend/src/lib/itop/sync.ts`, the org-mapping route, `backend/src/routes/publicShare.ts` or the share-link builder, `backend/src/config.ts`, `setup.sh`, `docs/CONFIGURATION.md`, tests |
| AD. Drag and vendored UI | ISS-187, ISS-188, ISS-115, ISS-058, ISS-199, ISS-101 | `frontend/src/components/reui/kanban*`, `reui/sortable*`, `reui/data-grid/*` header, `reui/autocomplete.tsx`, `reui/VENDOR.md`, `kanban-v2/*` handle, `pages/views/ProjectRisks.tsx`, the Gantt `handleResourceReorder` file, tests |
| AE. Tests and lint | ISS-143, ISS-157, ISS-158, ISS-159, ISS-161, ISS-022 | `frontend/eslint.config.js`, `frontend/package.json` and lock (container-written), `.claude/scripts/gates.sh`, `.github/workflows/ci.yml`, `reui/filters.test.ts` (move), e2e helpers and `daily-review.spec.ts`, `backend/test/taskOrdering.test.ts`, the duplicate hooks in `lib/queries.ts` |

User decisions (2026-11-19):
- ISS-143: add ESLint with react-hooks rules and the TypeScript parser only; `npm run lint` in gates.sh and CI.
- ISS-132: wrap each page of iTop upserts in a transaction; no notice on the Tickets tab.
- ISS-164: closed; its cause (shared seeded state) was fixed by per-file seeding.

## Dependency graph

AC, AD and AE share no files, except that AE's lint run may flag code in AC or AD files; AE reports those instead of editing them. Backend tests run in AC and AE under the backend-tests lock. Frontend typechecks are serialized with a lock file.

## Acceptance

- AC: an id change in the /auth/me reply is handled as an account switch; each iTop page commits atomically; a running full sync cannot undo a new mapping's reset; guest links use `PUBLIC_BASE_URL` when set.
- AD: drag handles are the dnd-kit activator node; Kanban handles are 24px or larger touch targets with the same icon; the data-grid header can center-align; ProjectRisks inline cells use `ui/select`; the autocomplete focus keeps the border; `handleResourceReorder` is split into named helpers with no behaviour change.
- AE: `npm run lint` passes and runs in gates.sh and CI; `filters.test.ts` lives outside `reui/`; one shared createTask e2e helper; daily-review.spec.ts cleans up; the taskOrdering test is scoped to its project; duplicate hooks await only the project tasks refetch.
- `gates.sh` green; one opus phase review; Delivery Gate for visible changes.
