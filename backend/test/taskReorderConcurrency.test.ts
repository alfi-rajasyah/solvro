import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { seedRoles, createAdminAndToken } from "./testAuth.js";

// Reorder = one UPDATE ... FROM (VALUES ...) per re-pack, under a project row
// lock (docs/archive/plans/application-review-2026-10-22.md, F-10).

const app = createApp();
let token: string;
let projectId: number;

async function seedTasks(count: number): Promise<number[]> {
  await prisma.task.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      projectId,
      title: `T${i}`,
      status: "TODO" as const,
      position: i,
    })),
  });
  const rows = await prisma.task.findMany({
    where: { projectId, parentTaskId: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function positions(): Promise<number[]> {
  const rows = await prisma.task.findMany({
    where: { projectId, parentTaskId: null },
    select: { position: true },
  });
  return rows.map((r) => r.position).sort((a, b) => a - b);
}

function patch(id: number, body: Record<string, unknown>) {
  return request(app).patch(`/tasks/${id}`).set("Authorization", `Bearer ${token}`).send(body);
}

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const admin = await createAdminAndToken();
  token = admin.token;
  const project = await prisma.project.create({
    data: {
      name: `Reorder ${Date.now()}-${Math.random()}`,
      saId: admin.userId,
      tamId: admin.userId,
      status: "ACTIVE",
    },
  });
  projectId = project.id;
});

describe("concurrent reorders in one project", () => {
  it("keeps positions dense 0..n-1 with no duplicates when two moves race", async () => {
    for (let iter = 0; iter < 10; iter++) {
      await prisma.task.deleteMany({ where: { projectId } });
      const ids = await seedTasks(8);
      const [a, b] = await Promise.all([
        patch(ids[7], { position: 0 }),
        patch(ids[0], { position: 7 }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("serialises a cross-list move racing same-list moves (both lists stay dense)", async () => {
    for (let iter = 0; iter < 15; iter++) {
      await prisma.task.deleteMany({ where: { projectId } });
      const ids = await seedTasks(8);
      // ids[7] becomes a subtask of ids[0] while two siblings reorder the
      // top-level list it is leaving.
      const rs = await Promise.all([
        patch(ids[7], { parentTaskId: ids[0] }),
        patch(ids[3], { position: 0 }),
        patch(ids[1], { position: 6 }),
      ]);
      for (const r of rs) expect(r.status).toBe(200);
      expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6]);
      const subs = await prisma.task.findMany({ where: { parentTaskId: ids[0] } });
      expect(subs.map((x) => x.position)).toEqual([0]);
    }
  });

  it("racing section duplicate and task moves keep the top-level list dense", async () => {
    for (let iter = 0; iter < 20; iter++) {
      await prisma.task.deleteMany({ where: { projectId } });
      await prisma.section.deleteMany({ where: { projectId } });
      const section = await prisma.section.create({ data: { projectId, name: "S", position: 0 } });
      const ids = await seedTasks(5);
      await prisma.task.updateMany({ where: { id: { in: ids.slice(0, 2) } }, data: { sectionId: section.id } });
      const [a, b, c] = await Promise.all([
        request(app).post(`/sections/${section.id}/duplicate`).set("Authorization", `Bearer ${token}`),
        patch(ids[4], { position: 0 }),
        patch(ids[3], { position: 1 }),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(200);
      expect(c.status).toBe(200);
      expect(await positions()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it("keeps section positions dense when two section reorders race", async () => {
    for (let iter = 0; iter < 25; iter++) {
      await prisma.section.deleteMany({ where: { projectId } });
      const secs = [];
      for (let i = 0; i < 6; i++) {
        secs.push(await prisma.section.create({ data: { projectId, name: `S${i}`, position: i } }));
      }
      const rs = await Promise.all([
        request(app).patch(`/sections/${secs[5].id}`).set("Authorization", `Bearer ${token}`).send({ position: 0 }),
        request(app).patch(`/sections/${secs[0].id}`).set("Authorization", `Bearer ${token}`).send({ position: 5 }),
      ]);
      for (const r of rs) expect(r.status).toBe(200);
      const rows = await prisma.section.findMany({ where: { projectId }, select: { position: true } });
      expect(rows.map((r) => r.position).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("keeps epic positions dense when two epic reorders race", async () => {
    for (let iter = 0; iter < 10; iter++) {
      await prisma.epic.deleteMany({ where: { projectId } });
      const eps = [];
      for (let i = 0; i < 6; i++) {
        eps.push(await prisma.epic.create({ data: { projectId, title: `E${i}`, position: i } }));
      }
      const rs = await Promise.all([
        request(app).patch(`/epics/${eps[5].id}`).set("Authorization", `Bearer ${token}`).send({ position: 0 }),
        request(app).patch(`/epics/${eps[0].id}`).set("Authorization", `Bearer ${token}`).send({ position: 5 }),
      ]);
      for (const r of rs) expect(r.status).toBe(200);
      const rows = await prisma.epic.findMany({ where: { projectId }, select: { position: true } });
      expect(rows.map((r) => r.position).sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe("concurrent dependency writes", () => {
  it("accepts exactly one of A->B and B->A raced together (no cycle)", async () => {
    for (let iter = 0; iter < 10; iter++) {
      await prisma.task.deleteMany({ where: { projectId } });
      const [a, b] = await seedTasks(2);
      const post = (p: number, s: number) =>
        request(app)
          .post(`/projects/${projectId}/dependencies`)
          .set("Authorization", `Bearer ${token}`)
          .send({ predecessorTaskId: p, successorTaskId: s });
      const rs = await Promise.all([post(a, b), post(b, a)]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(rs.find((r) => r.status === 400)!.body.code).toBe("cycle");
    }
  });
});

describe("partial re-pack", () => {
  it("rewrites only rows whose position changes", async () => {
    const ids = await seedTasks(6);
    // Moving the 2nd row to index 2 only swaps neighbours 1 and 2; rows
    // 0, 3, 4, 5 keep their slot, so they must not be written.
    const rowsBefore = await prisma.$queryRaw<{ id: number; xmin: string }[]>`
      SELECT id, xmin::text AS xmin FROM tasks WHERE project_id = ${projectId}`;
    const res = await patch(ids[1], { position: 2 });
    expect(res.status).toBe(200);
    const rowsAfter = await prisma.$queryRaw<{ id: number; xmin: string }[]>`
      SELECT id, xmin::text AS xmin FROM tasks WHERE project_id = ${projectId}`;
    const before = new Map(rowsBefore.map((r) => [r.id, r.xmin]));
    const written = rowsAfter.filter((r) => before.get(r.id) !== r.xmin).map((r) => r.id);
    expect(written.sort()).toEqual([ids[1], ids[2]].sort());
    const ordered = await prisma.task.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(ordered.map((r) => r.id)).toEqual([ids[0], ids[2], ids[1], ids[3], ids[4], ids[5]]);
  });
});

describe("large reorder", () => {
  it("re-packs 300 tasks in one request (timing logged, generous bound)", async () => {
    const ids = await seedTasks(300);
    const t0 = performance.now();
    const res = await patch(ids[299], { position: 0 });
    const ms = performance.now() - t0;
    process.stderr.write(`300-task reorder PATCH: ${ms.toFixed(0)} ms\n`);
    expect(res.status).toBe(200);
    expect(await positions()).toEqual(Array.from({ length: 300 }, (_, i) => i));
    expect(ms).toBeLessThan(5000);
  });
});
