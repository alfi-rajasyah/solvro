# Issues wave 2: projects API, iTop backend, drag and keyboard

Status: in progress (2026-11-19), branch `fix/issues-wave-2`. Archive path once shipped: `docs/archive/plans/issues-wave-2.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| B. Projects API | ISS-001, ISS-029, ISS-166 | `backend/src/routes/projects.ts`, backend tests |
| C. iTop backend | ISS-016, ISS-129, ISS-130, ISS-131, ISS-132, ISS-133 | `backend/src/lib/itop/*`, `backend/src/routes/itop.ts`, `itopAdmin.ts`, `webhook.ts`, backend tests |
| G. Drag and keyboard | ISS-077, ISS-107, ISS-108 | `frontend/src/components/reui/sortable.tsx`, `reui/kanban.tsx`, `components/itop/board/TicketBoard.tsx`, `useCustomerTickets` in `frontend/src/lib/queries.ts`, the two patch counters in `.claude/scripts/gates.sh`, frontend tests |

## Dependency graph

B, C and G share no files, so all three run in one parallel wave in the main working tree. Backend test runs of B and C are serialized with a lock file. ISS-016 is fixed without a schema change if possible (one array bind parameter instead of one per row).

## Acceptance

- B: label create needs `task:write`, like edit and delete; section and epic create take `lockProject` in a transaction, with a concurrency test; a test covers the baseline route's lock order against cancel or reactivate.
- C: the full-sync removal passes no longer bind one parameter per id; the iTop client refuses redirects; the webhook's first rate-limit window is per IP; adding an org mapping forces the next sync to be full; `/itop/status` exposes a sanitised failed-sync flag; "Test connection" treats `TimeSpent` as informational.
- G: read-only rows are not in the tab order; Kanban keyboard drag is reachable; the ticket board pauses its refetch during a drag. Vendored patches carry `SOLVRO PATCH` markers and the `gates.sh` counters match.
- `gates.sh` green; one opus phase review (B and G touch the spine; C touches secrets and an unauthenticated surface); Delivery Gate for G's focus changes.

## Records

(Filled in at integration.)
