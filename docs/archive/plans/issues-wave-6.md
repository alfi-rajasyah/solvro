# Issues wave 6: backend rules, tooling, docs

Status: shipped 2026-11-19, branch `fix/issues-wave-6`. Archive path: `docs/archive/plans/issues-wave-6.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| Q. Backend rules | ISS-025, ISS-035, ISS-037, ISS-040 | `backend/src/lib/duplicate.ts`, `routes/sections.ts`, `routes/epics.ts`, `routes/projects.ts`, `routes/customers.ts`, `routes/tasks.ts`, `lib/projectHealth.ts`, `routes/opportunities.ts`, `routes/itop.ts`, `routes/itopUser.ts`, the frontend spots that render those strings, backend tests |
| U. Tooling | ISS-146, ISS-147, ISS-152, ISS-176, ISS-182, ISS-169 | `.claude/scripts/gates.sh`, `backend/tsconfig*.json`, `backend/package.json` (scripts only), `frontend/package.json` (scripts only), `frontend/tsconfig.node.json`, `frontend/nginx.conf`, `backend/test/sessionRevocation.test.ts`, `backend/test/itop/client.test.ts`, `backend/scripts/seed-demo.ts` |
| V. Docs and comments | ISS-178, ISS-179, ISS-180, ISS-181 | `docs/DESIGN.md`, `docs/CONFIGURATION.md`, `frontend/src/index.css` (comment only), `frontend/src/components/reui/autocomplete.tsx` (header only), a vendor manifest, one e2e assertion |

User decisions (2026-11-19):
- ISS-024: accepted as is, closed without a change.
- ISS-035: an epic owner must be one of the project's people (TAM, SA, members); otherwise 400 `owner_not_in_project`. Existing epics stay.
- ISS-037: a new assignment to a deactivated user returns 400. A PATCH that keeps the current deactivated value still passes.

## Dependency graph

Q, U and V share no files. Backend tests run only in Q (U runs only the backend typecheck). Frontend typechecks are serialized with a lock file.

## Acceptance

- Q: section duplicate batches inserts; epic owner check; deactivated receivers refused on change only; no em dash reaches the UI from the backend, and the empty mark is `null`.
- U: backend typecheck covers `scripts/` and `test/`; frontend typecheck covers `vite.config.ts`; the smoke gate also runs e2e specs touched by the diff and skips with a clear message without `npx`; a gate checks that the CLAUDE.md spine prose and the `SPINE` regex agree; nginx sets Cache-Control on `/icons/` and `/favicon.png`.
- V: DESIGN.md `theme_default: system`; CONFIGURATION.md names `personal_tokens_allowed_profiles`; the chip-violet comment is correct; the autocomplete header names its patch count and pins registry hashes; the palette input style has an e2e assertion.
- `gates.sh` green; one opus phase review (routes, nginx, `reui/` on the spine); Delivery Gate for visible changes.

## Records

- Commits: U `5a1dbe3`, V `5c85567`, Q `de1c2d6`, U fixes and header wording `00e704f`, Q fixes `50b5873`, then the issue records and this archive.
- Q also applied the ISS-037 rule to PATCH /tasks/:id (the user decision named the task assignee).
- Phase review (opus): 0 blockers, 3 should-fix (pickers still offered refused users; one em dash left in the iTop paging error; touched e2e specs ran only on frontend diffs), 5 nits. All fixed. Re-check: all resolved, 1 new nit filed as ISS-198.
- Closed 15: ISS-024 (accepted as is), 025, 035, 037, 040, 146, 147, 152, 169, 176, 178, 179, 180, 181, 182. Filed: ISS-196, ISS-197 (autocomplete drift), ISS-198.
- Delivery Gate: PASS. Light and dark, 375px and 1280px: the epic owner picker lists only the project's people (Unassigned, qa on project 299); an outsider owner returns 400 `owner_not_in_project` with a plain sentence; the Daily Review Phase metric reads "No sections"; no page side-scroll. Picker filtering of deactivated users is covered by `selectableUsers.test.ts`.
