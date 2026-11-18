// DELETE /admin/users/:id asks for a new owner for every customer the user
// owns: an unowned customer is claimable by any TAM
// (docs/archive/plans/user-delete-customer-owner.md).
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createAdminAndToken, createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

const uniq = (label: string) => `${label} ${Date.now()}-${Math.random()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function world() {
  const admin = await createAdminAndToken();
  const leaver = await createUserWithRole("TAM");
  const receiver = await createUserWithRole("TAM");
  const c1 = await prisma.customer.create({ data: { name: uniq("Acme"), description: "", tamId: leaver.userId } });
  const c2 = await prisma.customer.create({ data: { name: uniq("Globex"), description: "", tamId: leaver.userId } });
  return { admin, leaver, receiver, c1, c2 };
}

const del = (adminToken: string, userId: number, body?: object) => {
  const r = request(app).delete(`/admin/users/${userId}`).set(auth(adminToken));
  return body === undefined ? r : r.send(body);
};

describe("DELETE /admin/users/:id — customer owners", () => {
  it("refuses with 409 customer_owner_required and lists the owned customers when no owner is chosen", async () => {
    const w = await world();
    const res = await del(w.admin.token, w.leaver.userId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("customer_owner_required");
    expect(res.body.details.customers).toEqual([
      { id: w.c1.id, name: w.c1.name },
      { id: w.c2.id, name: w.c2.name },
    ]);
    // Nothing changed.
    expect(await prisma.user.findUnique({ where: { id: w.leaver.userId } })).not.toBeNull();
    const after = await prisma.customer.findMany({ where: { id: { in: [w.c1.id, w.c2.id] } } });
    expect(after.every((c) => c.tamId === w.leaver.userId)).toBe(true);
  });

  it("refuses when only some owned customers have a new owner", async () => {
    const w = await world();
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [{ customerId: w.c1.id, newOwnerId: w.receiver.userId }],
    });
    expect(res.status).toBe(409);
    expect(res.body.details.customers).toEqual([{ id: w.c2.id, name: w.c2.name }]);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: w.c1.id } })).tamId).toBe(
      w.leaver.userId,
    );
  });

  it("moves every owned customer to the chosen owner, then deletes the user", async () => {
    const w = await world();
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [
        { customerId: w.c1.id, newOwnerId: w.receiver.userId },
        { customerId: w.c2.id, newOwnerId: w.admin.userId },
      ],
    });
    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: w.leaver.userId } })).toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: w.c1.id } })).tamId).toBe(
      w.receiver.userId,
    );
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: w.c2.id } })).tamId).toBe(
      w.admin.userId,
    );
  });

  it("rejects a null owner: a delete never leaves a customer unowned", async () => {
    const w = await world();
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [
        { customerId: w.c1.id, newOwnerId: null },
        { customerId: w.c2.id, newOwnerId: w.receiver.userId },
      ],
    });
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: w.leaver.userId } })).not.toBeNull();
  });

  it("rejects the leaver as the new owner", async () => {
    const w = await world();
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [
        { customerId: w.c1.id, newOwnerId: w.leaver.userId },
        { customerId: w.c2.id, newOwnerId: w.receiver.userId },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("owner_not_found");
    expect(res.body.details).toEqual({ customerId: w.c1.id });
  });

  it("rejects an inactive new owner and rolls back every owner change", async () => {
    const w = await world();
    const inactive = await createUserWithRole("TAM");
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [
        { customerId: w.c1.id, newOwnerId: w.receiver.userId },
        { customerId: w.c2.id, newOwnerId: inactive.userId },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("owner_not_found");
    expect(res.body.details).toEqual({ customerId: w.c2.id });
    // The first customer's change rolled back with the failed delete.
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: w.c1.id } })).tamId).toBe(
      w.leaver.userId,
    );
    expect(await prisma.user.findUnique({ where: { id: w.leaver.userId } })).not.toBeNull();
  });

  it("ignores a choice for a customer the user does not own", async () => {
    const w = await world();
    const other = await prisma.customer.create({ data: { name: uniq("Other"), description: "", tamId: w.receiver.userId } });
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: [
        { customerId: w.c1.id, newOwnerId: w.receiver.userId },
        { customerId: w.c2.id, newOwnerId: w.receiver.userId },
        { customerId: other.id, newOwnerId: w.admin.userId },
      ],
    });
    expect(res.status).toBe(204);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: other.id } })).tamId).toBe(
      w.receiver.userId,
    );
  });

  it("reports the other blockers before it asks for customer owners", async () => {
    const w = await world();
    await prisma.project.create({
      data: { name: uniq("P"), tamId: w.leaver.userId, customerId: w.c1.id, status: "ACTIVE" },
    });
    const res = await del(w.admin.token, w.leaver.userId);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("user_in_use");
  });

  it("still deletes a user who owns no customers without a body", async () => {
    const admin = await createAdminAndToken();
    const target = await createUserWithRole("TAM");
    const res = await del(admin.token, target.userId);
    expect(res.status).toBe(204);
  });

  it("answers 404 for an unknown user", async () => {
    const admin = await createAdminAndToken();
    const res = await del(admin.token, 999_999_999);
    expect(res.status).toBe(404);
  });


  it("accepts more than 500 customer owner choices", async () => {
    const w = await world();
    const names = Array.from({ length: 600 }, (_, i) => uniq(`Bulk${i}`));
    await prisma.customer.createMany({
      data: names.map((name) => ({ name, description: "", tamId: w.leaver.userId })),
    });
    const owned = await prisma.customer.findMany({ where: { tamId: w.leaver.userId }, select: { id: true } });
    expect(owned.length).toBe(602);
    const res = await del(w.admin.token, w.leaver.userId, {
      customers: owned.map((c) => ({ customerId: c.id, newOwnerId: w.receiver.userId })),
    });
    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: w.leaver.userId } })).toBeNull();
    expect(await prisma.customer.count({ where: { tamId: w.receiver.userId } })).toBe(602);
  }, 60_000);

  // The delete locks the user row and re-reads the owned customers under that
  // lock, so a customer that names the user as owner either commits first (the
  // delete then sees it and asks for a new owner) or fails on the foreign key.
  // The race is timing-dependent, so it runs a few rounds; every round must end
  // in one of the two consistent states and never in a 500.
  it("a delete racing a new customer for the same owner ends consistent: no 500, no orphaned ownership", async () => {
    const admin = await createAdminAndToken();
    for (let round = 0; round < 8; round++) {
      const target = await createUserWithRole("TAM");
      const name = uniq("Racing customer");
      const [delRes, createRes] = await Promise.all([
        del(admin.token, target.userId),
        request(app)
          .post("/customers")
          .set(auth(admin.token))
          .send({ name, description: "", tamId: target.userId }),
      ]);

      expect(delRes.status, JSON.stringify(delRes.body)).toBeLessThan(500);
      expect(createRes.status, JSON.stringify(createRes.body)).toBeLessThan(500);
      expect([204, 409]).toContain(delRes.status);

      const user = await prisma.user.findUnique({ where: { id: target.userId } });
      const customers = await prisma.customer.findMany({ where: { name } });
      // Nobody is left pointing at a user that no longer exists, and no
      // customer was silently left unowned by the delete.
      expect(await prisma.customer.count({ where: { tamId: target.userId } })).toBe(
        user ? customers.length : 0,
      );

      if (delRes.status === 204) {
        expect(user).toBeNull();
        // Deleted: the racing create must have been refused, not left a customer behind.
        expect(createRes.status).toBeGreaterThanOrEqual(400);
        expect(customers).toHaveLength(0);
      } else {
        // Refused cleanly: the user and the new customer both stand, still linked.
        expect(delRes.body.code).toBe("customer_owner_required");
        expect(user).not.toBeNull();
        expect(createRes.status).toBe(201);
        expect(customers).toHaveLength(1);
        expect(customers[0].tamId).toBe(target.userId);
      }
    }
  });
});
