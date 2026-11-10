import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/http/auth.js";
import { seedRoles } from "./testAuth.js";

// Releasing a Hold goes through the real PATCH /opportunities/:id, which
// stamps lastActivityAt, so the idle clock restarts from the release
// (docs/archive/plans/feedback-round-lifecycle-spec.md, F4).

const app = createApp();

async function createSaUser() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const role = await prisma.role.create({
    data: {
      roleName: `test-hold-role-${stamp}`,
      permissions: ["pipeline:view", "pipeline:create", "pipeline:edit_own", "pipeline:delete_own"],
    },
  });
  const user = await prisma.user.create({
    data: {
      username: `test-hold-user-${stamp}`,
      email: `test-hold-${stamp}@example.com`,
      passwordHash: null,
      roleId: role.id,
      active: true,
    },
  });
  return { userId: user.id, token: signToken({ sub: user.id, ver: 0 }) };
}

beforeAll(async () => {
  await seedRoles();
});

describe("PATCH /opportunities/:id — releasing a hold restarts the idle clock", () => {
  it("stamps lastActivityAt and reports zero idle days once the hold is released", async () => {
    const sa = await createSaUser();
    const created = await request(app)
      .post("/opportunities")
      .set("Authorization", `Bearer ${sa.token}`)
      .send({ title: "Held deal", customerName: "Acme", picId: sa.userId, stage: "WAITING_RESPONSE" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // Held and untouched for 60 days: far past every idle threshold.
    const old = new Date(Date.now() - 60 * 86_400_000);
    await prisma.opportunity.update({
      where: { id },
      data: { statusTag: "HOLD", lastActivityAt: old },
    });

    const held = await request(app).get(`/opportunities/${id}`).set("Authorization", `Bearer ${sa.token}`);
    expect(held.body.idle).toEqual({ level: "none", days: 0, basis: null });

    const before = Date.now();
    const released = await request(app)
      .patch(`/opportunities/${id}`)
      .set("Authorization", `Bearer ${sa.token}`)
      .send({ statusTag: null });
    expect(released.status).toBe(200);
    expect(released.body.statusTag).toBeNull();
    expect(new Date(released.body.lastActivityAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(released.body.idle).toEqual({ level: "none", days: 0, basis: "activity" });

    // Control: without the release, the same stale deal would be critical.
    await prisma.opportunity.update({ where: { id }, data: { lastActivityAt: old } });
    const stale = await request(app).get(`/opportunities/${id}`).set("Authorization", `Bearer ${sa.token}`);
    expect(stale.body.idle.level).toBe("critical");
  });
});
