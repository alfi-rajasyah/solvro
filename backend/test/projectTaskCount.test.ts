import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { seedRoles, createUserWithRole, createAdminAndToken } from "./testAuth.js";

// `_count.tasks` on a project is the number of tasks that count toward its
// totals: CANCELLED tasks are left out, so the figure agrees with
// `health.progress.total` everywhere it is shown
// (docs/archive/plans/application-review-2026-10-22.md, F-26).

const app = createApp();

let token: string;
let projectId: number;
let customerId: number;

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const u = await createUserWithRole("TAM");
  token = u.token;
  const customer = await prisma.customer.create({
    data: { name: `Count customer ${Date.now()}-${Math.random()}`, description: "", tamId: u.userId },
  });
  customerId = customer.id;
  const p = await prisma.project.create({
    data: { name: `Count ${Date.now()}-${Math.random()}`, tamId: u.userId, customerId, status: "ACTIVE" },
  });
  projectId = p.id;
  await prisma.task.createMany({
    data: [
      { projectId, title: "a", status: "TODO" },
      { projectId, title: "b", status: "TODO" },
      { projectId, title: "c", status: "CANCELLED" },
    ],
  });
});

describe("project _count.tasks excludes cancelled tasks", () => {
  it("GET /projects counts 2 of 3 and matches health.progress.total", async () => {
    const res = await request(app).get("/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<{ id: number; _count: { tasks: number }; health: { progress: { total: number } } }>).find(
      (r) => r.id === projectId,
    )!;
    expect(row._count.tasks).toBe(2);
    expect(row.health.progress.total).toBe(2);
  });

  it("GET /projects/:id counts 2 of 3", async () => {
    const res = await request(app).get(`/projects/${projectId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body._count.tasks).toBe(2);
    expect(res.body.health.progress.total).toBe(2);
  });

  it("GET /customers/:id nested projects count 2 of 3", async () => {
    const res = await request(app).get(`/customers/${customerId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const nested = (res.body.projects as Array<{ id: number; _count: { tasks: number } }>).find(
      (p) => p.id === projectId,
    )!;
    expect(nested._count.tasks).toBe(2);
  });

  it("GET /admin/projects counts 2 of 3", async () => {
    const admin = await createAdminAndToken();
    const res = await request(app).get("/admin/projects").set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<{ id: number; _count: { tasks: number } }>).find((p) => p.id === projectId)!;
    expect(row._count.tasks).toBe(2);
  });

  it("deleting the project still removes the cancelled task too", async () => {
    const res = await request(app).delete(`/projects/${projectId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.task.count({ where: { projectId } })).toBe(0);
  });
});
