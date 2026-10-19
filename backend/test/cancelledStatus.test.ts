import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { computeProjectHealth, computeSlipDays, currentPhase } from "../src/lib/projectHealth.js";
import { derivePhase } from "../src/lib/shareLinks.js";
import { seedRoles, createUserWithRole } from "./testAuth.js";

// CANCELLED tasks are in no total: progress, epic progress, overdue and the
// open filter all ignore them, and every task write accepts the new status.

const app = createApp();
type Status = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
const PAST = new Date("2020-01-01T00:00:00.000Z");

let userId: number;
let token: string;
let projectId: number;

async function task(status: Status, extra: { dueDate?: Date; epicId?: number } = {}) {
  return prisma.task.create({
    data: { projectId, title: "Task", status, dueDate: extra.dueDate ?? null, epicId: extra.epicId ?? null },
  });
}

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const u = await createUserWithRole("TAM");
  userId = u.userId;
  token = u.token;
  const p = await prisma.project.create({
    data: { name: `Cancelled ${Date.now()}-${Math.random()}`, tamId: userId, status: "ACTIVE" },
  });
  projectId = p.id;
});

describe("CANCELLED task status", () => {
  it("accepts CANCELLED on create and PATCH", async () => {
    const created = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Called off", status: "CANCELLED" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("CANCELLED");

    const t = await task("TODO");
    const patched = await request(app)
      .patch(`/tasks/${t.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "CANCELLED" });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe("CANCELLED");
  });

  it("project progress drops cancelled tasks from the total", async () => {
    for (let i = 0; i < 11; i++) await task("DONE");
    await task("CANCELLED");
    const h = (await computeProjectHealth([projectId])).get(projectId)!;
    expect(h.progress).toEqual({ done: 11, total: 11 });
  });

  it("overdue count and ?overdue / ?open filters ignore cancelled tasks", async () => {
    await task("TODO", { dueDate: PAST });
    const cancelled = await task("CANCELLED", { dueDate: PAST });
    const h = (await computeProjectHealth([projectId])).get(projectId)!;
    expect(h.overdueCount).toBe(1);

    for (const qs of ["overdue=true", "open=true"]) {
      const res = await request(app)
        .get(`/tasks?${qs}&projectId=${projectId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const ids = (res.body as { id: number }[]).map((r) => r.id);
      expect(ids).toHaveLength(1);
      expect(ids).not.toContain(cancelled.id);
    }
  });

  it("epic progress (detail, list) excludes cancelled tasks", async () => {
    const epic = await prisma.epic.create({ data: { projectId, title: "E", position: 0 } });
    await task("DONE", { epicId: epic.id });
    await task("CANCELLED", { epicId: epic.id });

    const detail = await request(app).get(`/epics/${epic.id}`).set("Authorization", `Bearer ${token}`);
    expect(detail.body.progress).toEqual({ done: 1, total: 1 });
    expect(detail.body.tasks).toHaveLength(2);

    const list = await request(app).get(`/projects/${projectId}/epics`).set("Authorization", `Bearer ${token}`);
    const found = (list.body as { id: number; progress: unknown }[]).find((e) => e.id === epic.id)!;
    expect(found.progress).toEqual({ done: 1, total: 1 });

    const patched = await request(app)
      .patch(`/epics/${epic.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "E2" });
    expect(patched.body.progress).toEqual({ done: 1, total: 1 });
  });

  it("share-link phases ignore cancelled tasks", () => {
    const t = (status: Status) => ({ status, startDate: null, dueDate: null });
    expect(derivePhase("a", [t("DONE"), t("CANCELLED")]).status).toBe("done");
    expect(derivePhase("a", [t("TODO"), t("CANCELLED")]).status).toBe("not_started");
    expect(derivePhase("a", [t("CANCELLED"), t("CANCELLED")]).status).toBe("not_started");
    expect(derivePhase("a", [t("DONE"), t("TODO"), t("CANCELLED")]).status).toBe("in_progress");
  });

  it("epics cannot be set to CANCELLED (400), other statuses still work", async () => {
    const epic = await prisma.epic.create({ data: { projectId, title: "E", position: 0 } });
    const bad = await request(app)
      .patch(`/epics/${epic.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "CANCELLED" });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .patch(`/epics/${epic.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "DONE" });
    expect(ok.status).toBe(200);
  });

  it("cancelled task dates are ignored by health dates and slip", async () => {
    const early = new Date("2026-01-01T00:00:00.000Z");
    const late = new Date("2026-02-01T00:00:00.000Z");
    const far = new Date("2027-06-01T00:00:00.000Z");
    await prisma.task.create({ data: { projectId, title: "a", status: "TODO", startDate: late, dueDate: late } });
    await prisma.task.create({ data: { projectId, title: "x", status: "CANCELLED", startDate: early, dueDate: far } });
    const h = (await computeProjectHealth([projectId])).get(projectId)!;
    expect(h.startDate).toBe("2026-02-01");
    expect(h.endDate).toBe("2026-02-01");

    const base = new Date("2026-01-25T00:00:00.000Z");
    const lock = new Date();
    expect(
      computeSlipDays(lock, [
        { status: "TODO", dueDate: late, baselineDueDate: base },
        { status: "CANCELLED", dueDate: far, baselineDueDate: far },
      ]),
    ).toBe(7);

    await prisma.project.update({ where: { id: projectId }, data: { baselineLockedAt: lock } });
    await prisma.task.updateMany({ where: { projectId, status: "TODO" }, data: { baselineDueDate: base } });
    const detail = await request(app).get(`/projects/${projectId}`).set("Authorization", `Bearer ${token}`);
    expect(detail.body.health.slipDays).toBe(7);
  });

  it("currentPhase treats a done+cancelled section as complete and still registers it", () => {
    const section = { id: 1, name: "S", position: 0 };
    expect(currentPhase([{ status: "CANCELLED", section }])).toBe("All phases complete");
    expect(currentPhase([{ status: "DONE", section }, { status: "CANCELLED", section }])).toBe(
      "All phases complete",
    );
    expect(currentPhase([{ status: "TODO", section }, { status: "CANCELLED", section }])).toBe("S");
  });

  it("portfolio progress, overview taskCounts and Daily Review progress exclude cancelled", async () => {
    await task("DONE");
    await task("DONE");
    await task("CANCELLED", { dueDate: PAST });
    const res = await request(app).get("/overview").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.taskCounts).toEqual({ TODO: 0, IN_PROGRESS: 0, DONE: 2 });
    const row = (res.body.portfolio as { id: number; totalTasks: number; progressPct: number; isOverdue: boolean }[]).find(
      (r) => r.id === projectId,
    )!;
    expect(row.totalTasks).toBe(2);
    expect(row.progressPct).toBe(100);
    // The cancelled task's past due date must not make the project overdue.
    expect(row.isOverdue).toBe(false);

    const dr = await request(app)
      .get("/daily-review")
      .query({ week: "2026-W35", today: "2026-08-28" })
      .set("Authorization", `Bearer ${token}`);
    expect(dr.status).toBe(200);
    const dtos = [
      ...dr.body.unassignedProjects,
      ...dr.body.customers.flatMap((c: { projects: unknown[] }) => c.projects),
    ] as { id: number; progress: { done: number; total: number }; overdueTasks: unknown[] }[];
    const dto = dtos.find((p) => p.id === projectId)!;
    expect(dto.progress).toEqual({ done: 2, total: 2 });
    expect(dto.overdueTasks).toHaveLength(0);
  });
});
