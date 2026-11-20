// GET /admin/roles `seeded` flag: the Admin > Roles KPI counts custom roles as !seeded.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { ROLE_PERMISSIONS } from "../prisma/seed.js";
import { SEEDED_ROLE_NAMES } from "../src/lib/seededRoles.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();
beforeAll(async () => {
  await seedRoles();
});

describe("GET /admin/roles seeded flag", () => {
  it("SEEDED_ROLE_NAMES matches the roles prisma/seed.ts creates", () => {
    expect([...SEEDED_ROLE_NAMES].sort()).toEqual(Object.keys(ROLE_PERMISSIONS).sort());
  });

  it("flags every seeded role, and a created role counts as one more custom role", async () => {
    const admin = await createUserWithRole("ADMIN");
    const get = async () =>
      (await request(app).get("/admin/roles").set("Authorization", `Bearer ${admin.token}`)).body as Array<{ roleName: string; seeded: boolean }>;
    // Other suites share this database and may leave custom roles; assert the delta.
    const before = (await get()).filter((r) => !r.seeded).length;
    for (const name of SEEDED_ROLE_NAMES) expect((await get()).find((r) => r.roleName === name)?.seeded).toBe(true);

    const created = await request(app)
      .post("/admin/roles")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ roleName: `CUSTOM_${Date.now()}`, permissions: ["project:read"] });
    expect(created.status).toBe(201);
    const after = await get();
    expect(after.filter((r) => !r.seeded)).toHaveLength(before + 1);
    expect(after.find((r) => r.roleName === created.body.roleName)?.seeded).toBe(false);
  });
});
