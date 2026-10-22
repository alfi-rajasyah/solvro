// Regression test for docs/archive/plans/application-review-2026-10-22.md, F-02: `prisma db seed`
// runs on every container start and used to upsert each built-in role with
// `update: { permissions }`, silently resetting any edit an admin made in
// Admin > Roles. The seed must create what is missing and never touch an
// existing row.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { ROLE_PERMISSIONS, runSeed } from "../prisma/seed.js";

describe("prisma/seed.ts is create-only (F-02)", () => {
  beforeAll(async () => {
    await runSeed(prisma);
  });

  it("creates every built-in role with its default permissions on a fresh database", async () => {
    for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await prisma.role.findUnique({ where: { roleName } });
      expect(role, roleName).not.toBeNull();
      expect(role!.permissions).toEqual(permissions);
    }
  });

  it("keeps an admin's edit to a built-in role across a re-seed", async () => {
    const edited = ["project:read"]; // TAM narrowed by an admin
    await prisma.role.update({ where: { roleName: "TAM" }, data: { permissions: edited } });

    await runSeed(prisma);

    const tam = await prisma.role.findUniqueOrThrow({ where: { roleName: "TAM" } });
    expect(tam.permissions).toEqual(edited);

    // Restore so later suites that seed via testAuth.ts see the defaults.
    await prisma.role.update({
      where: { roleName: "TAM" },
      data: { permissions: ROLE_PERMISSIONS.TAM },
    });
  });

  it("keeps a permission an admin added to a built-in role across a re-seed", async () => {
    const widened = [...ROLE_PERMISSIONS.STAKEHOLDER, "project:view-all"];
    await prisma.role.update({ where: { roleName: "STAKEHOLDER" }, data: { permissions: widened } });

    await runSeed(prisma);

    const stakeholder = await prisma.role.findUniqueOrThrow({ where: { roleName: "STAKEHOLDER" } });
    expect(stakeholder.permissions).toEqual(widened);

    await prisma.role.update({
      where: { roleName: "STAKEHOLDER" },
      data: { permissions: ROLE_PERMISSIONS.STAKEHOLDER },
    });
  });

  it("re-creates a deleted built-in role with its defaults", async () => {
    // Other suites in the same run may own PENDING users (users.role_id is
    // RESTRICT), so the whole check runs inside a transaction that is rolled
    // back at the end: move those users aside, drop the role, re-seed, assert.
    const ROLLBACK = new Error("rollback");
    await prisma
      .$transaction(async (tx) => {
        const tam = await tx.role.findUniqueOrThrow({ where: { roleName: "TAM" } });
        const pendingRole = await tx.role.findUniqueOrThrow({ where: { roleName: "PENDING" } });
        await tx.user.updateMany({ where: { roleId: pendingRole.id }, data: { roleId: tam.id } });
        await tx.role.delete({ where: { roleName: "PENDING" } });
        expect(await tx.role.findUnique({ where: { roleName: "PENDING" } })).toBeNull();

        await runSeed(tx);

        const pending = await tx.role.findUniqueOrThrow({ where: { roleName: "PENDING" } });
        expect(pending.permissions).toEqual([]);
        throw ROLLBACK;
      })
      .catch((err: unknown) => {
        if (err !== ROLLBACK) throw err;
      });
    // Rolled back: the original row (and every user on it) is untouched.
    expect(await prisma.role.findUnique({ where: { roleName: "PENDING" } })).not.toBeNull();
  });

  it("never overwrites admin-edited AuthConfig values", async () => {
    await prisma.authConfig.update({
      where: { id: "default" },
      data: { googleAllowedDomains: ["example.com"] },
    });

    await runSeed(prisma);

    const config = await prisma.authConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(config.googleAllowedDomains).toEqual(["example.com"]);
    await prisma.authConfig.update({ where: { id: "default" }, data: { googleAllowedDomains: [] } });
  });
});
