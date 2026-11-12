# Document links on tasks

Status: in progress (2026-11-12). Archive path once shipped: `docs/archive/plans/task-links.md`.

## Goal

Settle "task attachments" (`docs/ISSUES.md`, Pending features) with decision
D-13, option "Links only": tasks reuse the label + URL document links that
projects and customers already have (`docs/plans/project-customer-links.md`).
No file storage.

## Decisions

- **Links only.** No upload, no volume, no size limit, no backup change.
- **Placement:** a "Links" section in the task panel, after Subtasks and before
  Comments, through the shared `LinksSection` (`chrome="panel"`). Subtasks get
  links too.
- **Edit rights:** read follows the task read gate (`project:read` or
  `pipeline:view`, plus task visibility, same as comments). Writes need
  `task:write`, the same gate as editing the task in the panel.
- **Duplicate:** links are not copied to a duplicated task (same as comments).

## Data model

`TaskLink` (`task_links`): `id` uuid, `taskId` Int → Task (Cascade), `label`,
`url`, `createdAt`; index on `taskId`. One migration:
`20261112160000_task_links`.

## API contract

Body rules are the shared ones in `backend/src/lib/linkSchemas.ts`.

| Method + path | Gate | Result |
|---|---|---|
| `GET /tasks/:id/links` | `project:read` or `pipeline:view` + `ensureTaskVisible` | `TaskLink[]`, `createdAt` asc |
| `POST /tasks/:id/links` | `task:write` + `ensureTaskVisible` | 201 + row |
| `PATCH /tasks/:id/links/:linkId` | same | 200 + row; 404 if the link is not this task's |
| `DELETE /tasks/:id/links/:linkId` | same | 204; same 404 |

Every write records a project activity event in the same transaction:
`entityType: "task_link"`, actions `added` / `updated` / `removed`,
`entityLabel` = task title, `changes: { taskId, linkId, label }`. Never the
URL. An update with an unchanged label and URL records nothing. The feed row
links to the task.

## Privacy

Links are internal. They never reach `frontend/src/lib/export/`, the guest
timeline (`routes/publicShare.ts`), or any customer-facing output.

## Tasks

1. Backend: schema + migration, `routes/taskLinks.ts`, vitest (`test/taskLinks.test.ts`).
2. Frontend: query hooks, task panel section, `task_link` activity text and its test.
3. E2E: `e2e/tests/task-links.spec.ts` (add, edit, delete in the panel).

## Delivery Gate (antislop)

Pending: record PASS/FAIL here after the click-through in both themes and at 375px.
