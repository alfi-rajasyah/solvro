import { z } from "zod";

// The permission vocabulary a role may carry: the values the role editor
// offers (`PERMISSION_CATALOG` in frontend/src/lib/auth.tsx) and the seed
// grants. Add a value in both places; each side pins the full list in a test
// (test/hardening.test.ts here, src/lib/auth.test.ts in the frontend), so a
// drift fails one of them. Role writes validate against this list so a
// misspelt permission is a 400 instead of a silently inert grant
// (docs/archive/plans/application-review-2026-10-22.md, F-31).
export const KNOWN_PERMISSIONS = [
  "*",
  "project:view-all",
  "project:read",
  "project:write",
  "task:read",
  "task:write",
  "pipeline:view",
  "pipeline:create",
  "pipeline:edit_own",
  "pipeline:edit_all",
  "pipeline:delete_own",
  "pipeline:delete_all",
  "report:executive",
] as const;

const KNOWN_SET: ReadonlySet<string> = new Set(KNOWN_PERMISSIONS);

/** A single permission string, rejected with a message naming the bad value. */
export const permissionSchema = z
  .string()
  .max(100)
  .refine((value) => KNOWN_SET.has(value), (value) => ({
    message: `Unknown permission "${value.slice(0, 100)}"; expected one of: ${KNOWN_PERMISSIONS.join(", ")}`,
  }));

/** A role's permission list: known values only. */
export const permissionsSchema = z.array(permissionSchema).max(KNOWN_PERMISSIONS.length);
