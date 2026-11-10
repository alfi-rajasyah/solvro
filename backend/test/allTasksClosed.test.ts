import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { seedRoles, createUserWithRole } from "./testAuth.js";

// "All tasks are closed" event (lib/allTasksClosed.ts, called from
// PATCH /tasks/:id; docs/archive/plans/feedback-round-lifecycle-spec.md, F3).

const app = createApp();

let tam: { userId: number; token: string };
let member: { userId: number; token: string };

beforeAll(async () => {
  await seedRoles();
  tam = await createUserWithRole("TAM");
  member = await createUserWithRole("TAM");
});

async function setup(status: "ACTIVE" | "PLANNING" | "ON_HOLD" | "COMPLETED" | "CANCELLED" = "ACTIVE") {
  const project = await prisma.project.create({
    data: { name: `P ${Date.now()}-${Math.random()}`, tamId: tam.userId, status },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.userId } });
  return project.id;
}

const mkTask = (projectId: number, status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED" = "TODO", parentTaskId?: number) =>
  prisma.task.create({ data: { projectId, title: "T", status, parentTaskId } }).then((t) => t.id);

const patch = (token: string, id: number, status: string) =>
  request(app).patch(`/tasks/${id}`).set("Authorization", `Bearer ${token}`).send({ status });

const events = (projectId: number) =>
  prisma.activityEvent.findMany({ where: { projectId, action: "all_tasks_closed" } });

describe("all_tasks_closed", () => {
  it("fires once when the last open task closes as DONE, with counts and recipients incl. the actor", async () => {
    const p = await setup();
    const a = await mkTask(p, "DONE");
    const b = await mkTask(p, "CANCELLED");
    const c = await mkTask(p);
    expect((await patch(tam.token, c, "DONE")).status).toBe(200);
    const evs = await events(p);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ entityType: "project", entityId: p, actorId: tam.userId });
    expect(evs[0].changes).toEqual({ done: 2, cancelled: 1 });
    const notes = await prisma.notification.findMany({ where: { activityEventId: evs[0].id } });
    expect(notes.map((n) => n.userId).sort()).toEqual([tam.userId, member.userId].sort());
    expect(notes.every((n) => n.reason === "all_tasks_closed")).toBe(true);
    void a; void b;
  });

  it("fires when the last open task closes as CANCELLED", async () => {
    const p = await setup();
    await mkTask(p, "DONE");
    const c = await mkTask(p, "IN_PROGRESS");
    await patch(member.token, c, "CANCELLED");
    const evs = await events(p);
    expect(evs).toHaveLength(1);
    expect(evs[0].changes).toEqual({ done: 1, cancelled: 1 });
  });

  it("does not fire while another task or an open subtask remains", async () => {
    const p = await setup();
    const a = await mkTask(p);
    const sub = await mkTask(p, "TODO", a);
    await patch(tam.token, a, "DONE");
    expect(await events(p)).toHaveLength(0);
    await patch(tam.token, sub, "DONE");
    expect(await events(p)).toHaveLength(1);
  });

  it.each(["PLANNING", "ON_HOLD", "COMPLETED", "CANCELLED"] as const)("does not fire for a %s project", async (st) => {
    const p = await setup(st);
    const a = await mkTask(p);
    await patch(tam.token, a, "DONE");
    expect(await events(p)).toHaveLength(0);
  });

  it("does not fire on deleting the last open task", async () => {
    const p = await setup();
    await mkTask(p, "DONE");
    const b = await mkTask(p);
    const res = await request(app).delete(`/tasks/${b}`).set("Authorization", `Bearer ${tam.token}`);
    expect(res.status).toBe(204);
    expect(await events(p)).toHaveLength(0);
  });

  it("does not fire on the project-cancel cascade", async () => {
    const p = await setup();
    await mkTask(p);
    const res = await request(app)
      .patch(`/projects/${p}`)
      .set("Authorization", `Bearer ${tam.token}`)
      .send({ status: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(await events(p)).toHaveLength(0);
  });

  describe("in a project where every task is already closed", () => {
    it("does not fire for DONE to CANCELLED", async () => {
      const p = await setup();
      const a = await mkTask(p, "DONE");
      await mkTask(p, "CANCELLED");
      expect((await patch(tam.token, a, "CANCELLED")).status).toBe(200);
      expect(await events(p)).toHaveLength(0);
    });

    it("does not fire for a title-only edit of a DONE task", async () => {
      const p = await setup();
      const a = await mkTask(p, "DONE");
      const res = await request(app)
        .patch(`/tasks/${a}`)
        .set("Authorization", `Bearer ${tam.token}`)
        .send({ title: "Renamed" });
      expect(res.status).toBe(200);
      expect(await events(p)).toHaveLength(0);
    });

    it("does not fire for re-sending DONE on a DONE task", async () => {
      const p = await setup();
      const a = await mkTask(p, "DONE");
      expect((await patch(tam.token, a, "DONE")).status).toBe(200);
      expect(await events(p)).toHaveLength(0);
    });
  });

  it("fires again after reopening and closing", async () => {
    const p = await setup();
    const a = await mkTask(p);
    await patch(tam.token, a, "DONE");
    await patch(tam.token, a, "TODO");
    await patch(tam.token, a, "DONE");
    expect(await events(p)).toHaveLength(2);
  });

  it("fires when the status rides a position write (kanban move)", async () => {
    const p = await setup();
    const a = await mkTask(p);
    const res = await request(app)
      .patch(`/tasks/${a}`)
      .set("Authorization", `Bearer ${tam.token}`)
      .send({ status: "DONE", position: 0 });
    expect(res.status).toBe(200);
    expect(await events(p)).toHaveLength(1);
  });

  it("skips inactive users and users who cannot see the project", async () => {
    const p = await setup();
    const gone = await createUserWithRole("TAM");
    await prisma.projectMember.create({ data: { projectId: p, userId: gone.userId } });
    await prisma.user.update({ where: { id: gone.userId }, data: { active: false } });
    const a = await mkTask(p);
    await patch(tam.token, a, "DONE");
    const [ev] = await events(p);
    const notes = await prisma.notification.findMany({ where: { activityEventId: ev.id } });
    expect(notes.map((n) => n.userId)).not.toContain(gone.userId);
    expect(notes.map((n) => n.userId).sort()).toEqual([tam.userId, member.userId].sort());
  });

  it("two concurrent closes of the last two tasks produce exactly one event", async () => {
    for (let i = 0; i < 5; i++) {
      const p = await setup();
      const a = await mkTask(p);
      const b = await mkTask(p);
      const [r1, r2] = await Promise.all([patch(tam.token, a, "DONE"), patch(member.token, b, "CANCELLED")]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect(await events(p)).toHaveLength(1);
    }
  });
});
