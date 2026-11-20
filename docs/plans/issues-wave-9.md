# Issues wave 9: user decisions, section colours, small UI and backend fixes

Status: in progress, branch `fix/issues-wave-9`. Archive path: `docs/archive/plans/issues-wave-9.md`.

Lane P. One PR into `develop`; each group is one task and one commit.

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| AF. Backend rules and sync | ISS-005, ISS-202, ISS-031, ISS-171 | `backend/src/routes/tasks.ts` comment routes, `backend/src/lib/itop/sync.ts` and the org-mapping route, `backend/src/routes/admin.ts` offboardSchema, `backend/src/lib/offboarding.ts`, `backend/scripts/import-velora.ts` (delete), `backend/package.json` script entry, `README.md` and `docs/CONFIGURATION.md` Velora import lines, backend tests |
| AG. Colours, Gantt and exports | ISS-090, ISS-105, ISS-140, ISS-045, ISS-096, ISS-054 | `frontend/src/index.css` dark primary token, `docs/DESIGN.md`, `gantt-v2/SolvroBar.tsx` ring, `lib/gantt/exportExcel.ts` and the Gantt row adapter, `lib/gantt/palette.ts` resolver and its uses in `ProjectList.tsx`, `Executive.tsx`, `TaskPanel.tsx` (section dot only), a sentinel parity check for `schema.prisma`'s Section.color default, `pages/Overview.tsx` and `pages/Executive.tsx` stat cards |
| AH. Small UI | ISS-056, ISS-047, ISS-052, ISS-065, ISS-193, ISS-149, plus the ISS-005 composer gate | `reui/filters.tsx` toolbar text, `CommentMentions.tsx` composer, `CommandPalette.tsx`, `layout/TopBar.tsx`, `useItopTicket` in `lib/queries.ts`, `frontend/index.html` and `index.css` icon stylesheet, `e2e/tests/pwa.spec.ts`, the comment composer's permission gate |

User decisions (2026-11-20):
- ISS-005: task comments need task:write (or project:write); STAKEHOLDER and SA are refused. Built-in roles stay editable.
- ISS-054: move the Overview and Executive KPI stat cards into Frame.
- ISS-056: one uniform 12-13px text scale in filter toolbars.
- ISS-090: lighten the dark primary token by the minimum that reaches 4.5:1.
- ISS-105: the Gantt Critical Path ring uses CRITICAL_PATH_HEX in both themes.
- ISS-140: add an iTop ticket column to the Gantt Excel export.
- ISS-171: the standalone Velora stack is retired; delete the import script.

ISS-201 stays a watch: no upstream release fixes the `minimatch` advisories yet.

## Dependency graph

AF is backend only. AG and AH are frontend; they share `TaskPanel.tsx` only if the comment composer's gate lives there (AG edits the section dot, AH the composer). Backend tests run under the backend-tests lock. Frontend typechecks are serialized with the frontend-tsc lock.

## Acceptance

- AF: a STAKEHOLDER or SA user gets 403 on comment create, edit and delete; a running sync cannot re-attach tickets of an unmapped org; a large offboarding is measured, its per-project writes are batched, and the cap is raised to what the measurement supports; no Velora import script or reference remains outside the archive and CHANGELOG.
- AG: dark primary reaches 4.5:1 on the hover and tinted surfaces; the ring is CRITICAL_PATH_HEX in both themes; the Excel export has an iTop ticket column and no note data; all four surfaces resolve section colour the same way; a test or gate fails if the Prisma default and the frontend sentinel differ; stat cards use Frame.
- AH: toolbar rows use the 12-13px scale; the comment composer grows as a textarea; the palette trigger has hover and focus styles and shows Ctrl K off macOS; `useItopTicket` keys on the offset; the icon font CSS loads from a `<link>`; pwa.spec.ts skips on the dev server; users without comment rights see no composer.
- `gates.sh` green; one opus phase review; spine instants; Delivery Gate for visible changes.

## Delivery Gate

Pending.
