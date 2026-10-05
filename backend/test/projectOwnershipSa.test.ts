// The SA arm of the visibility rule (docs/archive/plans/solvro-cust-port-plan.md
// §10, decisions M-1..M-5): a project's SA SEES the project (and the customer
// behind it) but is never an owner — changing a project's TAM/SA/customer,
// deleting a project, and changing/deleting a customer are owner-only. The SA
// needs no ProjectMember row.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import type { JwtPayload } from "../src/http/auth.js";
import {
  canUserOwnProject,
  canUserSeeProject,
  projectVisibilityFilter,
} from "../src/lib/visibility.js";
import { createAdminAndToken, createUserWithRole, seedRoles } from "./testAuth.js";
import { createWonOpportunity } from "./pipelineWonFixture.js";

const app = createApp();

// Test-only role: the stock SA permissions plus project/task write, i.e. an
// SA whose role was edited in Admin (or a custom role) — the actor the owner
// gates exist for.
const SA_WRITE = "SA_WRITE_TEST";

beforeAll(async () => {
  await seedRoles();
  const sa = await prisma.role.findUniqueOrThrow({ where: { roleName: "SA" } });
  const permissions = [...(sa.permissions as string[]), "project:write", "task:write", "task:read"];
  await prisma.role.upsert({
    where: { roleName: SA_WRITE },
    update: { permissions },
    create: { roleName: SA_WRITE, permissions },
  });
});

const uniq = (label: string) => `${label} ${Date.now()}-${Math.random()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** tam owns the customer and the project; sa / saWrite are SA on separate projects of it. */
async function fixture() {
  const tam = await createUserWithRole("TAM");
  const other = await createUserWithRole("TAM");
  const sa = await createUserWithRole("SA");
  const saWrite = await createUserWithRole(SA_WRITE);
  const customer = await prisma.customer.create({
    data: { name: uniq("Customer"), description: "d", tamId: tam.userId },
  });
  const saProject = await prisma.project.create({
    data: {
      name: uniq("SA Project"),
      tamId: tam.userId,
      saId: sa.userId,
      customerId: customer.id,
      status: "ACTIVE",
    },
  });
  const saWriteProject = await prisma.project.create({
    data: {
      name: uniq("SA-write Project"),
      tamId: tam.userId,
      saId: saWrite.userId,
      customerId: customer.id,
      status: "ACTIVE",
    },
  });
  return { tam, other, sa, saWrite, customer, saProject, saWriteProject };
}

describe("a stock SA (project:read) reads everything behind its saId project", () => {
  it("lists and opens the project, its tasks and members, and the customer", async () => {
    const { sa, saProject, customer } = await fixture();
    await prisma.task.create({ data: { title: "T", projectId: saProject.id } });

    const list = await request(app).get("/projects").set(auth(sa.token));
    expect(list.status).toBe(200);
    expect((list.body as { id: number }[]).map((p) => p.id)).toContain(saProject.id);

    for (const url of [
      `/projects/${saProject.id}`,
      `/projects/${saProject.id}/tasks`,
      `/projects/${saProject.id}/members`,
      `/customers/${customer.id}`,
    ]) {
      const res = await request(app).get(url).set(auth(sa.token));
      expect(res.status, url).toBe(200);
    }
  });

  it("cannot write at all (no project:write) — 403 forbidden, not owner_only", async () => {
    const { sa, saProject } = await fixture();
    const res = await request(app)
      .patch(`/projects/${saProject.id}`)
      .set(auth(sa.token))
      .send({ name: "x" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });
});

describe("an SA with write permissions is refused owner actions (403 owner_only)", () => {
  it("PATCH /projects/:id — tamId", async () => {
    const { saWrite, saWriteProject, tam, other } = await fixture();
    const res = await request(app)
      .patch(`/projects/${saWriteProject.id}`)
      .set(auth(saWrite.token))
      .send({ tamId: other.userId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("owner_only");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: saWriteProject.id } })).tamId).toBe(
      tam.userId,
    );
  });

  it("PATCH /projects/:id — customerId", async () => {
    const { saWrite, saWriteProject, customer } = await fixture();
    const target = await prisma.customer.create({
      data: { name: uniq("Target"), description: "d", tamId: null },
    });
    const res = await request(app)
      .patch(`/projects/${saWriteProject.id}`)
      .set(auth(saWrite.token))
      .send({ customerId: target.id });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("owner_only");
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: saWriteProject.id } })).customerId,
    ).toBe(customer.id);
  });

  it("PATCH /projects/:id — saId (decision M-2), both reassigning and clearing", async () => {
    const { saWrite, saWriteProject, other } = await fixture();
    for (const saId of [other.userId, null]) {
      const res = await request(app)
        .patch(`/projects/${saWriteProject.id}`)
        .set(auth(saWrite.token))
        .send({ saId });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("owner_only");
    }
    expect((await prisma.project.findUniqueOrThrow({ where: { id: saWriteProject.id } })).saId).toBe(
      saWrite.userId,
    );
  });

  it("PATCH /projects/:id — other fields and re-sent current tamId/customerId/saId still work", async () => {
    const { saWrite, saWriteProject, tam, customer } = await fixture();
    const res = await request(app)
      .patch(`/projects/${saWriteProject.id}`)
      .set(auth(saWrite.token))
      .send({
        name: "Renamed by SA",
        tamId: tam.userId,
        customerId: customer.id,
        saId: saWrite.userId,
      });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed by SA");
  });

  it("DELETE /projects/:id", async () => {
    const { saWrite, saWriteProject } = await fixture();
    const res = await request(app).delete(`/projects/${saWriteProject.id}`).set(auth(saWrite.token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("owner_only");
    expect(await prisma.project.count({ where: { id: saWriteProject.id } })).toBe(1);
  });

  it("PATCH and DELETE /customers/:id on a customer reached only through the SA project", async () => {
    const { saWrite, customer, tam } = await fixture();
    // Reachable (200) ...
    expect((await request(app).get(`/customers/${customer.id}`).set(auth(saWrite.token))).status).toBe(
      200,
    );
    // ... but not changeable by ownership.
    const patch = await request(app)
      .patch(`/customers/${customer.id}`)
      .set(auth(saWrite.token))
      .send({ tamId: saWrite.userId });
    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe("owner_only");
    const del = await request(app).delete(`/customers/${customer.id}`).set(auth(saWrite.token));
    expect(del.status).toBe(403);
    expect(del.body.code).toBe("owner_only");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBe(
      tam.userId,
    );

    // Non-owner fields stay editable.
    const rename = await request(app)
      .patch(`/customers/${customer.id}`)
      .set(auth(saWrite.token))
      .send({ name: "Renamed by SA" });
    expect(rename.status).toBe(200);
  });
});

describe("the SA needs no member row (decision M-1)", () => {
  it("assigning the project's SA a task creates no ProjectMember", async () => {
    const { tam, saWrite, saWriteProject } = await fixture();
    const created = await request(app)
      .post(`/projects/${saWriteProject.id}/tasks`)
      .set(auth(tam.token))
      .send({ title: "For the SA", assignedToId: saWrite.userId });
    expect(created.status).toBe(201);
    expect(await prisma.projectMember.count({ where: { projectId: saWriteProject.id } })).toBe(0);

    const task = await prisma.task.create({ data: { title: "T2", projectId: saWriteProject.id } });
    const patched = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(auth(tam.token))
      .send({ assignedToId: saWrite.userId });
    expect(patched.status).toBe(200);
    expect(await prisma.projectMember.count({ where: { projectId: saWriteProject.id } })).toBe(0);
  });

  it("POST /projects/:id/members with the SA is 400 is_sa; a stale SA row is hidden from the list", async () => {
    const { tam, saWrite, saWriteProject, other } = await fixture();
    const res = await request(app)
      .post(`/projects/${saWriteProject.id}/members`)
      .set(auth(tam.token))
      .send({ userId: saWrite.userId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("is_sa");

    // A pre-existing member who is later made the SA stays out of the list.
    await prisma.projectMember.create({
      data: { projectId: saWriteProject.id, userId: other.userId },
    });
    await prisma.project.update({ where: { id: saWriteProject.id }, data: { saId: other.userId } });
    const list = await request(app).get(`/projects/${saWriteProject.id}/members`).set(auth(tam.token));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });

  it("members are managed by an SA holding project:write (decision M-3)", async () => {
    const { saWrite, saWriteProject, other } = await fixture();
    const add = await request(app)
      .post(`/projects/${saWriteProject.id}/members`)
      .set(auth(saWrite.token))
      .send({ userId: other.userId });
    expect(add.status).toBe(201);
    const del = await request(app)
      .delete(`/projects/${saWriteProject.id}/members/${other.userId}`)
      .set(auth(saWrite.token));
    expect(del.status).toBe(204);
  });
});

describe("owners still pass the owner gates", () => {
  it("a customer owner who is not the TAM, and a view-all user, can re-parent and delete", async () => {
    const tam = await createUserWithRole("TAM");
    const customerOwner = await createUserWithRole("TAM");
    const newTam = await createUserWithRole("TAM");
    const admin = await createAdminAndToken();
    const customer = await prisma.customer.create({
      data: { name: uniq("Customer"), description: "d", tamId: customerOwner.userId },
    });
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
    });

    const byOwner = await request(app)
      .patch(`/projects/${project.id}`)
      .set(auth(customerOwner.token))
      .send({ tamId: newTam.userId });
    expect(byOwner.status).toBe(200);

    const byAdmin = await request(app)
      .patch(`/projects/${project.id}`)
      .set(auth(admin.token))
      .send({ tamId: tam.userId, saId: newTam.userId });
    expect(byAdmin.status).toBe(200);

    expect((await request(app).delete(`/projects/${project.id}`).set(auth(customerOwner.token))).status).toBe(
      204,
    );
  });

  it("an SA who is also the customer owner passes the owner gates", async () => {
    const tam = await createUserWithRole("TAM");
    const saWrite = await createUserWithRole(SA_WRITE);
    const customer = await prisma.customer.create({
      data: { name: uniq("Customer"), description: "d", tamId: saWrite.userId },
    });
    const project = await prisma.project.create({
      data: {
        name: uniq("P"),
        tamId: tam.userId,
        saId: saWrite.userId,
        customerId: customer.id,
        status: "ACTIVE",
      },
    });
    const patch = await request(app)
      .patch(`/projects/${project.id}`)
      .set(auth(saWrite.token))
      .send({ saId: null });
    expect(patch.status).toBe(200);
    expect(
      (await request(app).delete(`/projects/${project.id}`).set(auth(saWrite.token))).status,
    ).toBe(204);
  });
});

describe("projectVisibilityFilter access levels and the pure twins", () => {
  const user: JwtPayload = { sub: 7, role: "X", permissions: ["project:read"] };

  it('"see" has all four arms, "own" only the TAM and customer-owner arms', () => {
    const see = projectVisibilityFilter(user).OR!;
    const own = projectVisibilityFilter(user, "own").OR!;
    expect(Object.keys(projectVisibilityFilter(user))).toEqual(["OR"]);
    expect(Object.keys(projectVisibilityFilter(user, "own"))).toEqual(["OR"]);
    expect(see).toEqual(
      expect.arrayContaining([
        { tamId: 7 },
        { customer: { tamId: 7 } },
        { saId: 7 },
        { members: { some: { userId: 7 } } },
      ]),
    );
    expect(see).toHaveLength(4);
    expect(own).toEqual([{ tamId: 7 }, { customer: { tamId: 7 } }]);
  });

  it("view-all short-circuits both levels", () => {
    const viewAll: JwtPayload = { sub: 7, role: "X", permissions: ["project:view-all"] };
    expect(projectVisibilityFilter(viewAll)).toEqual({});
    expect(projectVisibilityFilter(viewAll, "own")).toEqual({});
  });

  it("canUserSeeProject agrees with the filter for each arm, canUserOwnProject excludes SA and members", async () => {
    const { tam, sa, other, customer, saProject } = await fixture();
    await prisma.projectMember.create({ data: { projectId: saProject.id, userId: other.userId } });
    const facts = {
      tamId: tam.userId,
      saId: sa.userId,
      customerTamId: tam.userId,
      memberIds: new Set([other.userId]),
    };
    const asUser = (id: number): JwtPayload => ({ sub: id, role: "X", permissions: ["project:read"] });
    const outsider = await createUserWithRole("TAM");
    for (const [id, see, own] of [
      [tam.userId, true, true],
      [sa.userId, true, false],
      [other.userId, true, false],
      [outsider.userId, false, false],
    ] as const) {
      const u = asUser(id);
      const viaFilterSee =
        (await prisma.project.count({ where: { id: saProject.id, ...projectVisibilityFilter(u) } })) === 1;
      const viaFilterOwn =
        (await prisma.project.count({
          where: { id: saProject.id, ...projectVisibilityFilter(u, "own") },
        })) === 1;
      expect(canUserSeeProject(u, facts), `see ${id}`).toBe(see);
      expect(viaFilterSee, `filter see ${id}`).toBe(see);
      expect(canUserOwnProject(u, facts), `own ${id}`).toBe(own);
      expect(viaFilterOwn, `filter own ${id}`).toBe(own);
    }
    expect(customer.id).toBeGreaterThan(0);
  });
});

describe("handoff by an admin names the SA", () => {
  it("the SA sees the project; an SA with write permissions gets owner_only on delete", async () => {
    const admin = await createAdminAndToken();
    const saWrite = await createUserWithRole(SA_WRITE);
    const tam = await createUserWithRole("TAM");
    const customer = await prisma.customer.create({
      data: { name: uniq("Customer"), description: "d", tamId: null },
    });
    const dealId = await createWonOpportunity(app, admin.token, admin.userId);
    const res = await request(app)
      .post(`/opportunities/${dealId}/handoff`)
      .set(auth(admin.token))
      .send({
        name: uniq("Handed off"),
        saId: saWrite.userId,
        tamId: tam.userId,
        customerId: customer.id,
      });
    expect(res.status).toBe(201);
    const projectId = res.body.project.id as number;

    expect((await request(app).get(`/projects/${projectId}`).set(auth(saWrite.token))).status).toBe(200);
    const del = await request(app).delete(`/projects/${projectId}`).set(auth(saWrite.token));
    expect(del.status).toBe(403);
    expect(del.body.code).toBe("owner_only");
    // The handoff creates no member rows (the TAM and SA arms cover both).
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(0);
  });
});


describe("guest links are owner-only: the SA never shares a project", () => {
  it("a stock SA (project:read) gets 403 owner_only on the list; write routes answer forbidden", async () => {
    const { sa, saProject } = await fixture();
    const list = await request(app).get(`/projects/${saProject.id}/share-links`).set(auth(sa.token));
    expect(list.status).toBe(403);
    expect(list.body.code).toBe("owner_only");
    const create = await request(app)
      .post(`/projects/${saProject.id}/share-links`)
      .set(auth(sa.token))
      .send({});
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("forbidden");
    expect(await prisma.shareLink.count({ where: { projectId: saProject.id } })).toBe(0);
  });

  it("an SA with write permissions gets 403 owner_only on create, list and revoke", async () => {
    const { saWrite, saWriteProject, tam } = await fixture();
    const create = await request(app)
      .post(`/projects/${saWriteProject.id}/share-links`)
      .set(auth(saWrite.token))
      .send({});
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("owner_only");
    const list = await request(app).get(`/projects/${saWriteProject.id}/share-links`).set(auth(saWrite.token));
    expect(list.status).toBe(403);
    expect(list.body.code).toBe("owner_only");
    // The owner creates one; the SA still cannot revoke it.
    const owned = await request(app)
      .post(`/projects/${saWriteProject.id}/share-links`)
      .set(auth(tam.token))
      .send({});
    expect(owned.status).toBe(201);
    const linkId = (owned.body as { id: number }).id;
    const revoke = await request(app)
      .delete(`/projects/${saWriteProject.id}/share-links/${linkId}`)
      .set(auth(saWrite.token));
    expect(revoke.status).toBe(403);
    expect(revoke.body.code).toBe("owner_only");
    expect(await prisma.shareLink.count({ where: { projectId: saWriteProject.id, revokedAt: null } })).toBe(1);
  });
});
