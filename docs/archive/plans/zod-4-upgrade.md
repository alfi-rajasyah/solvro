# Backend zod 3 to zod 4

Status: shipped 2026-11-27, branch `chore/zod-4`. Archive path: `docs/archive/plans/zod-4-upgrade.md`.

Lane P. Fixes ISS-207: `zod` 3.25.76 carries a high advisory (memory exhaustion on oversized constrained collections, fixed in 4.6.6). The target is `zod` ^4.6.7, the current latest. One PR into `develop`; each task is one commit. The tasks depend on each other in order (T1 pins behaviour, T2 changes it, T3 records it), so they run in sequence with one writer, not in a wave.

Only the backend uses zod: 35 files under `backend/src`. The frontend does not import zod; it reads the 400 body shape in `frontend/src/lib/formErrors.ts`.

## What zod 4 breaks here

Each row was checked by running the same code on zod 3.25.76 and 4.6.7 side by side (2026-11-27).

| # | Change in zod 4 | Where it hits | Effect if left alone | Fix |
|---|---|---|---|---|
| 1 | `.default()` short-circuits: on `undefined` it returns the default as-is and skips the inner schema | `deleteUserSchema` in `backend/src/routes/admin.ts` (line ~349): `z.object({ customers: ….default([]) }).default({})` Not reachable through HTTP today: Express 4 sets an empty `req.body` to `{}`, so the outer default never fires. When the body is `undefined` (Express 5, or a direct parse), `v.customers` is `undefined`, `superRefine` throws `TypeError`, and the API answers 500 | `.prefault({})`, which keeps the zod 3 behaviour |
| 2 | `z.string().uuid()` enforces the RFC 9562 version and variant digits | 6 path-param schemas: `opportunities.ts`, `opportunityItems.ts` (2), `taskLinks.ts`, `projectLinks.ts`, `customerLinks.ts` | An ID that zod 3 accepted but that is not RFC-shaped gets 400 instead of 404. Dev DB: 0 of 50 rows fail; prod rows from the Velora import are unknown | `z.guid()`, which is the zod 3 pattern |
| 3 | Default issue messages change wording | Every field with no custom `message`. The text reaches users through `fieldErrorsFrom` in `formErrors.ts` | "Required" becomes "Invalid input: expected string, received undefined"; "String must contain at most 3 character(s)" becomes "Too big: expected string to have <=3 characters" | Decision Q1 |
| 4 | `.int()` accepts only safe integers | 113 `.int()` sites | Integers above `Number.MAX_SAFE_INTEGER` now fail with 400. zod 3 let 2^53+2 through. No legitimate Solvro value is that large | Accept. This is stricter, not looser |
| 5 | `ZodError.flatten()` is deprecated; `z.flattenError()` replaces it | `backend/src/http/errors.ts` (line ~49) | Still works. Same `{ formErrors, fieldErrors }` shape | `z.flattenError(err)` |
| 6 | The `too_big` issue drops `type` and adds `origin` | `importRowFailureReason` in `opportunities.ts` (line ~251) | None: it reads only `code` and `path` | None. T1 pins it |
| 7 | Deprecated but still working: `message` param (117), `z.nativeEnum` (22), `.strict()` (16), `.passthrough()` (1), `.superRefine` (2), `z.ZodIssueCode` (1), `.email()` (2), `ZodTypeAny` (1) | many files | None at runtime | Decision Q2 |

Checked and safe:
- The email patterns of zod 3 and zod 4 give the same result on every case tested (leading dot, double dot, trailing dot, apostrophe, hyphenated domain, upper case). All 195 dev users pass.
- `z.string().default(x).transform(…)` in `backend/src/env.ts` (`TRUST_PROXY`, `ITOP_SYNC_DISABLED`) gives the same result: the default sits on the inner string, so the transform still runs.

## Decisions

User decision 2026-11-27: Q1 = A, Q2 = defer.

- **Q1. Error wording.** Decided: **A**.
  - **A.** Add one `z.config({ customError })` that gives the zod 3 text for the issue codes Solvro hits (`invalid_type`, `too_small`, `too_big`, `invalid_value`, `invalid_format`). The upgrade then changes nothing a user sees. Better wording is a separate copy decision later.
  - **B.** Accept the zod 4 wording. This is a visible change, so it needs the Delivery Gate.
  - **C.** Write new plain-language messages now. This is copy work under antislop and grows the scope.
- **Q2. Deprecated APIs** (row 7). Decided: **defer**. zod 4 still runs them. Changing 160 call sites would hide the real fixes inside a large diff, and `admin.ts` is on the spine. File one P3 debt entry for the cleanup.

## Tasks

| Task | Commit | Files |
|---|---|---|
| T1. Pin current behaviour on zod 3 | Tests only. They pass on zod 3 before any upgrade | new `backend/test/validationContract.test.ts`, plus extra cases in existing route tests where they fit better |
| T2. Upgrade to zod ^4.6.7 | Dependency plus the fixes in rows 1, 2, 3 (per Q1) and 5. Then fix whatever `tsc` reports | `backend/package.json`, `backend/package-lock.json`, `admin.ts`, the 6 param schemas, `http/errors.ts`, a new zod config module imported before any schema is built (from `app.ts` and `env.ts`) |
| T3. Record | CHANGELOG entry; `docs/ISSUES.md`: close ISS-207, add the Q2 debt entry; move this plan to the archive | `CHANGELOG.md`, `docs/ISSUES.md`, this file |

T1 cases. Each one must pass unchanged after T2:
- The 400 body is `{ error: "Invalid request", code: "validation_error", details: { formErrors, fieldErrors } }`, for a missing field and for a wrong type. With Q1 = A, the message texts are pinned too.
- `DELETE /admin/users/:id` with no body succeeds (row 1). The existing case in `hardening.test.ts` covers it.
- A GUID that is not RFC-shaped (for example `12345678-1234-1234-1234-123456789abc`) on each UUID param route gets 404, not 400 (row 2).
- A Pipeline import row with an over-length title still gives "Title exceeds N characters" (row 6).
- The `env.ts` defaults run through their transforms: `TRUST_PROXY` unset gives `1`, `ITOP_SYNC_DISABLED` unset gives `false`, `PORT` unset gives `3000`, and the spellings of `ITOP_SYNC_DISABLED` parse the same. `publicBaseUrlEnv.test.ts` already covers an empty `PUBLIC_BASE_URL`.
- Leaf query defaults (`limit`, `utcOffsetMinutes`, `scope`) get no new case: the side-by-side run showed that `.default()` on a leaf schema behaves the same. Only a default on an object that holds its own defaults changes (row 1).

Lock file: install in the backend container only. If npm 10.9 crashes with `edgesOut` (root trap), install that one package with `--legacy-peer-deps`, then confirm with `npm ci --dry-run` without the flag.

## Acceptance

- `npm audit --omit=dev` in `backend/` reports 0 advisories.
- `docker compose exec backend npx tsc --noEmit` passes, and the full backend vitest suite passes. The T1 tests are unchanged between the T1 and T2 commits.
- `gates.sh` is green at the end of T2 and at close.
- Review: `admin.ts` is on the spine. One opus phase review on the combined diff, which also covers the spine touch.
- Delivery Gate: with Q1 = A, not applicable, no visible change. With Q1 = B or C: run it on the forms that show server field errors, in both themes and at 375px.

## Out of scope

- The deprecated-API cleanup (Q2).
- `holidays.ts` builds its default year once, when the module loads (ISS-209). It is a separate bug, older than this plan.

## Outcome

- T1 passed on zod 3.25.76 (14 tests). The same tests passed unchanged on zod 4.6.7.
- T2 found one more break that the side-by-side run did not: `permissionSchema` in `backend/src/lib/permissions.ts` passed a function as the second argument of `.refine()`, which zod 4 does not accept (`tsc` error). It now uses the `error` callback, with the same text. `validationContract.test.ts` gained 23 message cases (zod 3 strings captured 2026-11-27) and an unknown-permission case: 37 tests at that point.
- npm 10.9 installed zod 4.6.7 with no `edgesOut` crash; `npm ci --dry-run` accepts the lock file.
- `npm audit` in `backend/`: 0 advisories, with and without `--omit=dev`.
- Phase review (opus, covers the `admin.ts` spine touch): nothing blocking. It found that the wording map gave the wrong text for an enum field that is missing, null or not a string (zod 3: "Required" / "Expected 'a' | 'b', received null"), overwrote the discriminated-union text, and called `Infinity` on an int field "Number must be finite" (zod 3: "Expected integer, received float"). All three are fixed and pinned: `validationContract.test.ts` now has 48 tests. A remaining difference is accepted: when an array field with `.default([])` fails `.max()`, zod 4 skips the parent `superRefine`, so the offboard and delete-user bodies drop the duplicate-customer message in that case (still a 400).
- Full backend suite: 1538 passed, 18 skipped (before the review fixes; rerun by `gates.sh` at close).
- Q2 debt filed as ISS-210. ISS-207 closed.
- Delivery Gate: not applicable, no visible change (Q1 = A keeps the wording).
