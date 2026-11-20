import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createAdminAndToken, createUserWithRole, seedRoles } from "./testAuth.js";

// A NEW assignment to a deactivated user is refused with 400 `<field>_not_found`
// (the same code the offboarding receivers use); re-saving the current value
// passes even after that user was deactivated.

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

const uniq = (l: string) => `${l} ${Date.now()}-${Math.random()}`;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function inactiveTam() {
  const u = await createUserWithRole("TAM");
  await prisma.user.update({ where: { id: u.userId }, data: { active: false } });
  return u;
}

describe("PATCH /projects/:id", () => {
  it("passes an unchanged TAM who was deactivated, refuses a changed-to-inactive TAM", async () => {
    const admin = await createAdminAndToken();
    const tam = await createUserWithRole("TAM");
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: tam.userId, status: "ACTIVE" },
    });
    await prisma.user.update({ where: { id: tam.userId }, data: { active: false } });

    const same = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(admin.token))
      .send({ tamId: tam.userId, name: uniq("Renamed") });
    expect(same.status).toBe(200);

    const gone = await inactiveTam();
    const changed = await request(app)
      .patch(`/projects/${project.id}`)
      .set(bearer(admin.token))
      .send({ tamId: gone.userId });
    expect(changed.status).toBe(400);
    expect(changed.body.code).toBe("tam_not_found");
  });
});

describe("customers", () => {
  it("refuses an inactive TAM on create and on a changed owner; an unchanged owner passes", async () => {
    const admin = await createAdminAndToken();
    const gone = await inactiveTam();
    const created = await request(app)
      .post("/customers")
      .set(bearer(admin.token))
      .send({ name: uniq("C"), description: "d", tamId: gone.userId });
    expect(created.status).toBe(400);
    expect(created.body.code).toBe("tam_not_found");

    const owner = await createUserWithRole("TAM");
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: owner.userId },
    });
    await prisma.user.update({ where: { id: owner.userId }, data: { active: false } });
    const same = await request(app)
      .patch(`/customers/${customer.id}`)
      .set(bearer(admin.token))
      .send({ tamId: owner.userId, description: "changed" });
    expect(same.status).toBe(200);
    const changed = await request(app)
      .patch(`/customers/${customer.id}`)
      .set(bearer(admin.token))
      .send({ tamId: gone.userId });
    expect(changed.status).toBe(400);
    expect(changed.body.code).toBe("tam_not_found");
  });
});

describe("POST /projects/:id/tasks", () => {
  it("refuses an inactive assignee with 400 assignee_not_found", async () => {
    const admin = await createAdminAndToken();
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: admin.userId, status: "ACTIVE" },
    });
    const gone = await inactiveTam();
    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(bearer(admin.token))
      .send({ title: "T", assignedToId: gone.userId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("assignee_not_found");
  });
});

describe("PATCH /tasks/:id", () => {
  it("refuses a changed inactive assignee, passes an unchanged one, and keeps 404 for an unknown id", async () => {
    const admin = await createAdminAndToken();
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: admin.userId, status: "ACTIVE" },
    });
    const gone = await inactiveTam();
    const task = await prisma.task.create({ data: { title: "T", projectId: project.id } });

    const changed = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(bearer(admin.token))
      .send({ assignedToId: gone.userId });
    expect(changed.status).toBe(400);
    expect(changed.body.code).toBe("assignee_not_found");

    const unknown = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(bearer(admin.token))
      .send({ assignedToId: 2_000_000_000 });
    expect(unknown.status).toBe(404);

    await prisma.task.update({ where: { id: task.id }, data: { assignedToId: gone.userId } });
    const same = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(bearer(admin.token))
      .send({ title: "Renamed", assignedToId: gone.userId });
    expect(same.status).toBe(200);
  });
});
