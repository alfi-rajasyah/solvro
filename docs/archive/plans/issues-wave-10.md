# Issues wave 10: contrast, focus, loading states, e2e waits

Status: shipped 2026-11-20, branch `fix/issues-wave-10`. Archive path: `docs/archive/plans/issues-wave-10.md`.

Lane P. One PR into `develop`; each group is one task and one commit. Scope: every open issue that is a plain fix and needs no user decision (triage 2026-11-20).

## Scope

| Task | Issues | Files (owner) |
|---|---|---|
| AI. Contrast and focus | ISS-078, ISS-079, ISS-080, ISS-200, ISS-086 | `hover:bg-primary-container` sites across `frontend/src` (or one shared button class / token pairing), `Login.tsx` and `Admin.tsx` `/60` text, vendored `ui/select.tsx`, `ui/input.tsx`, `ui/textarea.tsx` and other vendored focus classes, `reui/badge.tsx` solid tone variants, `docs/DESIGN.md` if a rule note changes, `.claude/scripts/gates.sh` patch counters |
| AJ. Loading states, iTop duration, docs | ISS-066, ISS-072, ISS-204, ISS-134 | bare `animate-pulse` sites and loading branches under `frontend/src/components/itop`, `components/customer`, `pages/` (onto `components/skeletons/` and `SkeletonRegion`), `backend/src/lib/itop/sync.ts` `upsertTimeEntry`, its test, `docs/CONFIGURATION.md` §2.17 |
| AK. E2E | ISS-150, ISS-151, ISS-154 | `e2e/tests/gantt-legend.spec.ts`, every `waitForTimeout` in `e2e/tests/*.spec.ts`, `e2e/tests/search.spec.ts`, e2e helpers |

ISS-168 (browser check of `/pipeline/:id`, `/share/:token` and the PWA banner) is done at the Delivery Gate.

## Dependency graph

AI and AJ may touch the same frontend file (for example `Admin.tsx`) on different lines; both use narrow edits. AK touches only `e2e/`. Backend tests run under the backend-tests lock; frontend typechecks under the frontend-tsc lock.

## Acceptance

- AI: no light-theme hover pairs white text with `primary-container`; the `/60` text sites reach 4.5:1; vendored inputs keep the border on focus and show the primary ring; the badge solid tone variants are gone or pass 4.5:1; patch counters match.
- AJ: no bare `animate-pulse` placeholder outside `components/skeletons/`; the listed loading states use `SkeletonRegion`; an out-of-range iTop duration is skipped with one log line and never breaks the page; the User-class read right is documented.
- AK: the colorBy choice survives a reload; no `waitForTimeout` left without a stated reason; `search.spec.ts` waits for the TopBar trigger, checks `res.ok`, anchors its regex.
- `gates.sh` green; one opus phase review; spine instants; Delivery Gate for visible changes, plus ISS-168.

## Delivery Gate

PASS, 2026-11-20, light and dark at 375px and 1280px.
- Projects, Overview and project List render with the new skeleton look and `primary-hover`; hover contrast is computed (light 11.38:1, dark 4.57-4.62:1).
- ISS-168: `/pipeline/:id`, `/share/:token` (a temporary guest link, revoked after) and the install banner (synthetic `beforeinstallprompt`) render correctly at 375px in both themes.

## Review and gates

- Opus phase review: 1 blocker (dark hover 3.66:1), 3 should-fix, 5 nits; all fixed. ISS-205 filed for faint placeholder text outside ISS-080's scope.
- `gates.sh --performed-review=opus`: all gates pass except `e2e-touched-specs`, whose 5 failures are all in `auth.spec.ts`: the dev database has Google sign-in configured (`auth_config` since 2026-11-01), which the spec assumes is off; CI's seeded stack has it off.
