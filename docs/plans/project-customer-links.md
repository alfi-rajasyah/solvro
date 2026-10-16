# Document links on projects and customers

Status: in progress (2026-10-12). Archive path once shipped: `docs/archive/plans/project-customer-links.md`.

## Goal

Give projects and customers the same label + URL document links the Pipeline
deal page has (`OpportunityLink`, `backend/src/routes/opportunityItems.ts`,
the `LinksSection` in `frontend/src/pages/OpportunityDetail.tsx`).

## User decisions (2026-10-12)

- **Placement:** project links live in the project's Context panel
  (`frontend/src/components/layout/RightSidebar.tsx`); customer links live in
  their own "Links" tab right after "Services" on the customer page
  (`frontend/src/pages/CustomerDetail.tsx`) — moved there from the Overview tab
  at the user's request the same day.
- **Won-deal handoff:** deal links are NOT copied to the new project.
- **Edit rights:** anyone who can see the project/customer and holds
  `project:write` (same rule as customer notes) — the TAM and project members
  with write access. Not owner-only. The seeded SA role has no `project:write`,
  so an SA sees links but cannot change them (confirmed by the user the same
  day, after the review flagged it).

## Data model

Two tables mirroring `OpportunityLink` (FK integrity + cascade, no polymorphism):

- `ProjectLink` (`project_links`): `id` uuid, `projectId` Int → Project (Cascade), `label`, `url`, `createdAt`; index on `projectId`.
- `CustomerLink` (`customer_links`): `id` uuid, `customerId` Int → Customer (Cascade), `label`, `url`, `createdAt`; index on `customerId`.

## API contract

Same body rules as deal links: `label` trimmed 1–200 chars; `url` trimmed 1–2000
chars, `http:` or `https:` only. The URL schema is shared with
`opportunityItems.ts` (one definition).

| Method + path | Gate | Result |
|---|---|---|
| `GET /projects/:id/links` | `project:read` + `ensureProjectVisible` | `ProjectLink[]`, `createdAt` asc |
| `POST /projects/:id/links` | `project:write` + `ensureProjectVisible` | 201 + row |
| `PATCH /projects/:id/links/:linkId` | same | 200 + row; 404 `not_found` if the link is not this project's |
| `DELETE /projects/:id/links/:linkId` | same | 204; same 404 |
| `GET/POST/PATCH/DELETE /customers/:id/links[/:linkId]` | same gates with `ensureCustomerVisible` | same shapes |

Project link writes record a project activity event in the same transaction:
`entityType: "project_link"`, actions `added` / `updated` / `removed`,
`changes: { linkId, label }` — the label only, never the URL (same rule as
`opportunity_link`). An update with an unchanged label and URL records nothing.
Customer links record no activity (the activity log has no customer scope).

## Privacy

Links are internal. They never reach `frontend/src/lib/export/`, the guest
timeline (`routes/publicShare.ts`), or any customer-facing output.

## Tasks

1. **Backend** — schema + migration, shared URL schema, project and customer link routers, vitest coverage (visibility 404s, permission 403s, URL validation, cross-entity link id 404, activity event shape).
2. **Frontend** — extract the deal page's `LinksSection` into a shared component (deal page unchanged visually), query hooks for both entities, the Context-panel section and the customer Links tab, `project_link` activity text.
