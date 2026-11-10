import "./env.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import * as notifications from "../src/lib/notifications.js";
import { seedRoles, createUserWithRole } from "./testAuth.js";

// Project lifecycle writes: cancel cascade, on-hold stamp, reactivation date
// shift and the lifecycle preview
// (docs/archive/plans/feedback-round-lifecycle-spec.md F1, F7).

const app = createApp();
type Status = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

let userId: number;
let token: string;
let projectId: number;

async function mkProject(status: "ACTIVE" | "ON_HOLD" | "PLANNING" = "ACTIVE", onHoldSince?: Date) {
  const p = await prisma.project.create({
    data: { name: `Lifecycle ${Date.now()}-${Math.random()}`, tamId: userId, status, onHoldSince },
  });
  return p.id;
}

function task(
  status: Status,
  extra: { parentTaskId?: number; startDate?: Date; dueDate?: Date; baselineDueDate?: Date; pid?: number } = {},
) {
  return prisma.task.create({
    data: {
      projectId: extra.pid ?? projectId,
      title: "T",
      status,
      parentTaskId: extra.parentTaskId ?? null,
      startDate: extra.startDate ?? null,
      dueDate: extra.dueDate ?? null,
      baselineDueDate: extra.baselineDueDate ?? null,
    },
  });
}

const patch = (id: number, body: object, t = token) =>
  request(app).patch(`/projects/${id}`).set("Authorization", `Bearer ${t}`).send(body);

async function lastChanges(id: number) {
  const ev = await prisma.activityEvent.findFirst({
    where: { projectId: id, entityType: "project", action: "updated" },
    orderBy: { id: "desc" },
  });
  return ev?.changes as Record<string, unknown> | null;
}

beforeAll(async () => {
  await seedRoles();
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  const u = await createUserWithRole("TAM");
  userId = u.userId;
  token = u.token;
  projectId = await mkProject("ACTIVE");
});

describe("cancel cascade", () => {
  it("cancels open tasks and subtasks, leaves DONE and epics, records the count", async () => {
    const parent = await task("TODO");
    await task("IN_PROGRESS", { parentTaskId: parent.id });
    await task("DONE");
    await task("CANCELLED");
    const epic = await prisma.epic.create({ data: { projectId, title: "E", status: "TODO" } });

    const res = await patch(projectId, { status: "CANCELLED" });
    expect(res.status).toBe(200);
    const tasks = await prisma.task.findMany({ where: { projectId } });
    expect(tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS")).toHaveLength(0);
    expect(tasks.filter((t) => t.status === "DONE")).toHaveLength(1);
    expect(tasks.filter((t) => t.status === "CANCELLED")).toHaveLength(3);
    expect((await prisma.epic.findUniqueOrThrow({ where: { id: epic.id } })).status).toBe("TODO");
    expect((await lastChanges(projectId))?.cancelledTasks).toBe(2);
    // No per-task events.
    expect(await prisma.activityEvent.count({ where: { projectId, entityType: "task" } })).toBe(0);
  });

  it("omits cancelledTasks when there is nothing to cancel", async () => {
    await task("DONE");
    await patch(projectId, { status: "CANCELLED" });
    const ch = await lastChanges(projectId);
    expect(ch).not.toHaveProperty("cancelledTasks");
  });

  it("does not cascade on a re-save of an already cancelled project, nor restore on reactivation", async () => {
    await task("TODO");
    await patch(projectId, { status: "CANCELLED" });
    await patch(projectId, { status: "ACTIVE" });
    expect((await prisma.task.findFirstOrThrow({ where: { projectId } })).status).toBe("CANCELLED");
  });

  it("rolls the status change back when a step after the cascade fails", async () => {
    await task("TODO");
    // notifyForEvent runs after the cascade wrote; making it throw proves the
    // cascade and the status change share one transaction.
    vi.spyOn(notifications, "notifyForEvent").mockRejectedValueOnce(new Error("boom"));
    const res = await patch(projectId, { status: "CANCELLED" });
    expect(res.status).toBe(500);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe("ACTIVE");
    expect((await prisma.task.findFirstOrThrow({ where: { projectId } })).status).toBe("TODO");
  });

  it("answers 403 without project:write", async () => {
    const viewer = await createUserWithRole("STAKEHOLDER");
    const res = await patch(projectId, { status: "CANCELLED" }, viewer.token);
    expect(res.status).toBe(403);
  });
});

describe("onHoldSince", () => {
  it("is stamped on entering ON_HOLD and cleared on leaving", async () => {
    const held = await patch(projectId, { status: "ON_HOLD" });
    expect(held.status).toBe(200);
    expect(held.body.onHoldSince).toBeTruthy();
    const stamp = held.body.onHoldSince;
    // A re-save while on hold keeps the original stamp.
    const again = await patch(projectId, { status: "ON_HOLD" });
    expect(again.body.onHoldSince).toBe(stamp);
    const back = await patch(projectId, { status: "ACTIVE" });
    expect(back.body.onHoldSince).toBeNull();
    const read = await request(app).get(`/projects/${projectId}`).set("Authorization", `Bearer ${token}`);
    expect(read.body.onHoldSince).toBeNull();
  });

  it("is stamped when a project is created as ON_HOLD, null otherwise", async () => {
    const customer = await prisma.customer.create({ data: { name: `C ${Date.now()}`, tamId: userId, description: "" } });
    const mk = (status?: string) =>
      request(app)
        .post("/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "P", customerId: customer.id, status });
    const held = await mk("ON_HOLD");
    expect(held.status).toBe(201);
    expect(held.body.onHoldSince).toBeTruthy();
    const plain = await mk();
    expect(plain.body.onHoldSince).toBeNull();
  });
});

describe("shiftOpenDatesByDays", () => {
  it("shifts open tasks and open epics exactly, leaving closed work and baselines alone", async () => {
    const hold = await mkProject("ON_HOLD", new Date());
    const open = await task("TODO", { pid: hold, startDate: d("2026-02-26"), dueDate: d("2026-03-01"), baselineDueDate: d("2026-03-01") });
    const sub = await task("IN_PROGRESS", { pid: hold, parentTaskId: open.id, dueDate: d("2026-03-02") });
    const dueOnly = await task("TODO", { pid: hold, dueDate: d("2026-03-05") });
    const none = await task("TODO", { pid: hold });
    const done = await task("DONE", { pid: hold, dueDate: d("2026-03-01") });
    const cancelled = await task("CANCELLED", { pid: hold, dueDate: d("2026-03-01") });
    const openEpic = await prisma.epic.create({ data: { projectId: hold, title: "E1", status: "IN_PROGRESS", startDate: d("2026-02-20"), dueDate: d("2026-03-10") } });
    const doneEpic = await prisma.epic.create({ data: { projectId: hold, title: "E2", status: "DONE", dueDate: d("2026-03-10") } });
    await prisma.taskDependency.create({ data: { projectId: hold, predecessorTaskId: open.id, successorTaskId: sub.id } });

    const res = await patch(hold, { status: "ACTIVE", shiftOpenDatesByDays: 10 });
    expect(res.status).toBe(200);
    const get = (id: number) => prisma.task.findUniqueOrThrow({ where: { id } });
    const o = await get(open.id);
    expect(o.startDate).toEqual(d("2026-03-08"));
    expect(o.dueDate).toEqual(d("2026-03-11")); // crosses a month end exactly
    expect(o.baselineDueDate).toEqual(d("2026-03-01"));
    expect((await get(sub.id)).dueDate).toEqual(d("2026-03-12"));
    expect((await get(dueOnly.id)).dueDate).toEqual(d("2026-03-15"));
    expect((await get(dueOnly.id)).startDate).toBeNull();
    expect((await get(none.id)).dueDate).toBeNull();
    expect((await get(done.id)).dueDate).toEqual(d("2026-03-01"));
    expect((await get(cancelled.id)).dueDate).toEqual(d("2026-03-01"));
    const e1 = await prisma.epic.findUniqueOrThrow({ where: { id: openEpic.id } });
    expect(e1.startDate).toEqual(d("2026-03-02"));
    expect(e1.dueDate).toEqual(d("2026-03-20"));
    expect((await prisma.epic.findUniqueOrThrow({ where: { id: doneEpic.id } })).dueDate).toEqual(d("2026-03-10"));
    expect(await prisma.taskDependency.count({ where: { predecessorTaskId: open.id } })).toBe(1);
    const ch = await lastChanges(hold);
    expect(ch?.shiftedDays).toBe(10);
    expect(ch?.shiftedTasks).toBe(3);
    expect(res.body.onHoldSince).toBeNull();
  });

  it("rolls back status, onHoldSince and dates when a step after the shift fails", async () => {
    const since = d("2026-01-01");
    const hold = await mkProject("ON_HOLD", since);
    const t = await task("TODO", { pid: hold, dueDate: d("2026-03-01") });
    vi.spyOn(notifications, "notifyForEvent").mockRejectedValueOnce(new Error("boom"));
    const res = await patch(hold, { status: "ACTIVE", shiftOpenDatesByDays: 5 });
    expect(res.status).toBe(500);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: hold } });
    expect(p.status).toBe("ON_HOLD");
    expect(p.onHoldSince).toEqual(since);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).dueDate).toEqual(d("2026-03-01"));
  });

  it("also works moving to PLANNING", async () => {
    const hold = await mkProject("ON_HOLD", new Date());
    const t = await task("TODO", { pid: hold, dueDate: d("2026-01-01") });
    const res = await patch(hold, { status: "PLANNING", shiftOpenDatesByDays: 1 });
    expect(res.status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).dueDate).toEqual(d("2026-01-02"));
  });

  it("answers 400 shift_requires_reactivation outside an ON_HOLD reactivation and writes nothing", async () => {
    const t = await task("TODO", { dueDate: d("2026-01-01") });
    const notHeld = await patch(projectId, { status: "PLANNING", shiftOpenDatesByDays: 3 });
    expect(notHeld.status).toBe(400);
    expect(notHeld.body.code).toBe("shift_requires_reactivation");
    const noStatus = await patch(projectId, { shiftOpenDatesByDays: 3 });
    expect(noStatus.body.code).toBe("shift_requires_reactivation");
    const hold = await mkProject("ON_HOLD", new Date());
    const toCancelled = await patch(hold, { status: "CANCELLED", shiftOpenDatesByDays: 3 });
    expect(toCancelled.body.code).toBe("shift_requires_reactivation");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: hold } })).status).toBe("ON_HOLD");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).dueDate).toEqual(d("2026-01-01"));
  });

  it("rejects out-of-range days", async () => {
    const hold = await mkProject("ON_HOLD", new Date());
    expect((await patch(hold, { status: "ACTIVE", shiftOpenDatesByDays: 0 })).status).toBe(400);
    expect((await patch(hold, { status: "ACTIVE", shiftOpenDatesByDays: 3651 })).status).toBe(400);
  });
});

describe("GET /projects/:id/lifecycle-preview", () => {
  it("returns counts, hold days and past-due open tasks", async () => {
    const hold = await mkProject("ON_HOLD", d("2026-03-01"));
    await task("TODO", { pid: hold, dueDate: d("2026-03-05") });
    await task("IN_PROGRESS", { pid: hold, dueDate: d("2026-03-10") }); // due today: not past due
    await task("TODO", { pid: hold, dueDate: d("2026-04-01") });
    await task("DONE", { pid: hold, dueDate: d("2026-02-01") });
    await task("DONE", { pid: hold });
    await task("CANCELLED", { pid: hold, dueDate: d("2026-02-01") });

    const res = await request(app)
      .get(`/projects/${hold}/lifecycle-preview?today=2026-03-10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openTasks: 3,
      doneTasks: 2,
      cancelledTasks: 1,
      holdDays: 9,
      pastDueOpenTasks: 1,
    });
    expect(res.body.onHoldSince).toBe("2026-03-01T00:00:00.000Z");
  });

  it("reports null hold fields for a project that is not on hold", async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/lifecycle-preview?today=2026-03-10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body).toMatchObject({ onHoldSince: null, holdDays: null, openTasks: 0 });
  });

  it("400s a malformed today", async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/lifecycle-preview?today=nope`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("404s a project the caller cannot see", async () => {
    const other = await createUserWithRole("TAM");
    const res = await request(app)
      .get(`/projects/${projectId}/lifecycle-preview`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it("403s without project:read", async () => {
    const sales = await createUserWithRole("SALES");
    const res = await request(app)
      .get(`/projects/${projectId}/lifecycle-preview`)
      .set("Authorization", `Bearer ${sales.token}`);
    expect(res.status).toBe(403);
  });
});
