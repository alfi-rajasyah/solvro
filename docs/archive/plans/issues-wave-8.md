# Issues wave 8: auth and iTop, drag and vendored UI, tests and lint

Status: shipped 2026-11-19, branch `fix/issues-wave-8`. Archive path: `docs/archive/plans/issues-wave-8.md`.

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

## Records

- Commits: AC `7f780fd`, AD `dd0dc0c`, AE `07bd7af`, AD lint fixes `b555343`, gate patch counts `8fd10ee`, AC fixes `db1cdd9`, AE fixes `7642b15`, risk selects `b2b444e`, then docs, issue records and this archive.
- AD also closed ISS-114 (same header). The new `npm run lint` flagged 4 hook findings in vendored and Gantt code, resolved by AD; the gate's vendored patch counts were raised to match the new SOLVRO PATCH markers (kanban 8, sortable 9, filters 19, data-grid 43).
- Phase review (opus): 0 blockers, 4 should-fix (`setup.sh` let shell characters into `PUBLIC_BASE_URL`, which bash sources from `.env`; risk selects lost centring; risk rows grew and the border changed on focus; docs behind), 4 nits. All fixed. Re-check: clean, 2 docs nits fixed.
- Closed 18: ISS-022, 058, 101, 114, 115, 132, 142, 143, 157, 158, 159, 161, 164, 186, 187, 188, 195, 199. Filed: ISS-200 (select focus border, older), ISS-201 (dev-only audit advisories from the lint packages), ISS-202 (iTop unmap race, older).
- Delivery Gate: PASS. Light and dark, 375px and 1280px: the Risks table shows centred 28px Prob/Impact selects and a status select in its tone colour, rows keep their height (46.5px, set by the actions cell), no border change on focus; the Kanban board and the Risks page have no side-scroll; phone risk cards unchanged. Handle hit areas are covered by the touch drag e2e test. AC has no visible change.
