import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG } from "@/lib/auth";

// Pins the permission vocabulary. The backend validates role writes against
// KNOWN_PERMISSIONS (backend/src/lib/permissions.ts) and pins the same 13
// values in backend/test/hardening.test.ts. The frontend cannot import backend
// source, so each side hard-codes the list: a value added to only one side
// breaks one of the two tests.
describe("PERMISSION_CATALOG", () => {
  it("lists exactly the permissions the backend accepts on a role", () => {
    expect(PERMISSION_CATALOG.map((p) => p.value)).toEqual([
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
    ]);
  });
});
