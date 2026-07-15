# TODO: TAM-Defined Services (feat/project-services)

Orchestrator: Fable · Implementors: Sonnet agents · Detail: see tasks/plan.md

## Phase 0 — Sync & Preflight (orchestrator)
- [x] Pull `origin/develop` (bd9f7d7), create `feat/project-services`
- [x] Stack up + baseline typechecks (backend `tsc --noEmit`, frontend `npm run typecheck`)

## Phase 1 — Backend
- [x] 1.1 Prisma: `ProjectService` model + `add_project_services` migration + start-fresh DELETEs (S)
- [x] 1.2 `services.ts`: writes `requireAdmin` → `requirePermission("project:write")` (XS, ∥ 1.1)
- [x] 1.3 `projects.ts`: `PUT /:id/services` (mirror customers.ts transaction) + `services` in detail include (M) — incl. vitest route tests
- [x] ✅ Checkpoint 1: backend tsc clean · 30/30 vitest tests pass · live curl smoke (login → create → assign → GET round-trip → 401 unauthenticated)

## Phase 2 — Frontend foundation
- [ ] 2.1 `queries.ts`: `ProjectServiceAssignment`, `ProjectDetail.services`, `useUpdateProjectServices` (S)
- [ ] 2.2 Extract `ServiceMappingList` + `ToolsEditor` + inline "Add service"; refit CustomerDetail tab (M, ∥ 2.1)
- [ ] ✅ Checkpoint 2: typechecks + customer-tab regression + inline add

## Phase 3 — Project vertical
- [ ] 3.1 ProjectServices page + route in `App.tsx` + tab in `ProjectDetail.tsx` TABS; subscribed badges via `useCustomer`; "Add all subscribed" (M)
- [ ] ✅ Checkpoint 3: browser E2E of full TAM flow

## Phase 4 — Relocate & retire
- [ ] 4.1 `ServiceCatalogueManager` → Settings section (project:write-gated); remove Admin Service Catalogue tab (M)

## Phase 5 — Review & ship (orchestrator)
- [ ] solvro-code-reviewer + solvro-ui-reviewer passes; fix findings
- [ ] ✅ Final checkpoint: E2E script, CHANGELOG complete, commits clean (no Claude attribution), PR on user go-ahead

**Standing rules baked into every task:** CHANGELOG.md entry in the same turn as the change · design tokens only, no inline hex · commit per task on the feature branch.
