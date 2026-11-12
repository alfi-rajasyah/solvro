// Document links on tasks (docs/archive/plans/task-links.md):
// GET/POST/PATCH/DELETE /tasks/:id/links. Fixtures write via `prisma`
// directly; the routes under test go through the real app.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

function uniq(label: string): string {
  return `${label} ${Date.now()}-${Math.random()}`;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fixture() {
  const tam = await createUserWithRole("TAM");
  const member = await createUserWithRole("TAM");
  const outsider = await createUserWithRole("TAM");
  const stakeholder = await createUserWithRole("STAKEHOLDER");
  const customer = await prisma.customer.create({
    data: { name: uniq("Customer"), description: "d", tamId: tam.userId },
  });
  const project = await prisma.project.create({
    data: { name: uniq("Project"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.userId } });
  const task = await prisma.task.create({
    data: { projectId: project.id, title: "Kickoff", status: "TODO" },
  });
  const otherTask = await prisma.task.create({
    data: { projectId: project.id, title: "Handover", status: "TODO" },
  });
  return { tam, member, outsider, stakeholder, project, task, otherTask };
}

const BAD_URLS = ["javascript:alert(1)", "ftp://example.com/file", "not a url", "data:text/html,hi"];

describe("task links", () => {
  it("creates, lists (oldest first), patches and deletes", async () => {
    const f = await fixture();
    const base = `/tasks/${f.task.id}/links`;

    const first = await request(app)
      .post(base)
      .set(auth(f.tam.token))
      .send({ label: "  Spec  ", url: " https://example.com/spec " });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      taskId: f.task.id,
      label: "Spec",
      url: "https://example.com/spec",
      createdAt: expect.any(String),
    });
    const second = await request(app)
      .post(base)
      .set(auth(f.tam.token))
      .send({ label: "Sheet", url: "http://example.com/sheet" });
    expect(second.status).toBe(201);

    const list = await request(app).get(base).set(auth(f.tam.token));
    expect(list.status).toBe(200);
    expect(list.body.map((l: { label: string }) => l.label)).toEqual(["Spec", "Sheet"]);

    const patched = await request(app)
      .patch(`${base}/${first.body.id}`)
      .set(auth(f.tam.token))
      .send({ label: "Spec v2" });
    expect(patched.status).toBe(200);
    expect(patched.body.label).toBe("Spec v2");
    expect(patched.body.url).toBe("https://example.com/spec");

    const del = await request(app).delete(`${base}/${first.body.id}`).set(auth(f.tam.token));
    expect(del.status).toBe(204);
    expect(await prisma.taskLink.count({ where: { taskId: f.task.id } })).toBe(1);
  });

  it("lets a project member write, and a read-only user read but not write", async () => {
    const f = await fixture();
    const base = `/tasks/${f.task.id}/links`;
    const byMember = await request(app)
      .post(base)
      .set(auth(f.member.token))
      .send({ label: "Doc", url: "https://example.com/d" });
    expect(byMember.status).toBe(201);

    // The stakeholder holds project:read only; make it a member so it can see the task.
    await prisma.projectMember.create({
      data: { projectId: f.project.id, userId: f.stakeholder.userId },
    });
    expect((await request(app).get(base).set(auth(f.stakeholder.token))).status).toBe(200);
    expect(
      (await request(app).post(base).set(auth(f.stakeholder.token)).send({ label: "x", url: "https://example.com/x" }))
        .status,
    ).toBe(403);
    expect(
      (await request(app).patch(`${base}/${byMember.body.id}`).set(auth(f.stakeholder.token)).send({ label: "y" }))
        .status,
    ).toBe(403);
    expect((await request(app).delete(`${base}/${byMember.body.id}`).set(auth(f.stakeholder.token))).status).toBe(403);
  });

  it("lets the project's SA read but not write", async () => {
    const f = await fixture();
    const sa = await createUserWithRole("SA");
    await prisma.project.update({ where: { id: f.project.id }, data: { saId: sa.userId } });
    const base = `/tasks/${f.task.id}/links`;
    const link = await prisma.taskLink.create({
      data: { taskId: f.task.id, label: "L", url: "https://example.com" },
    });
    expect((await request(app).get(base).set(auth(sa.token))).status).toBe(200);
    expect(
      (await request(app).post(base).set(auth(sa.token)).send({ label: "x", url: "https://example.com/x" })).status,
    ).toBe(403);
    expect((await request(app).patch(`${base}/${link.id}`).set(auth(sa.token)).send({ label: "y" })).status).toBe(403);
    expect((await request(app).delete(`${base}/${link.id}`).set(auth(sa.token))).status).toBe(403);
  });

  it("refuses a zero-permission account", async () => {
    const f = await fixture();
    const pending = await createUserWithRole("PENDING");
    await prisma.projectMember.create({ data: { projectId: f.project.id, userId: pending.userId } });
    expect((await request(app).get(`/tasks/${f.task.id}/links`).set(auth(pending.token))).status).toBe(403);
  });

  it("404s every verb for a user who cannot see the task (before body validation)", async () => {
    const f = await fixture();
    const link = await prisma.taskLink.create({
      data: { taskId: f.task.id, label: "L", url: "https://example.com" },
    });
    const base = `/tasks/${f.task.id}/links`;
    expect((await request(app).get(base).set(auth(f.outsider.token))).status).toBe(404);
    expect(
      (await request(app).post(base).set(auth(f.outsider.token)).send({ label: "", url: "junk" })).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`${base}/${link.id}`).set(auth(f.outsider.token)).send({ label: "x" })).status,
    ).toBe(404);
    expect((await request(app).delete(`${base}/${link.id}`).set(auth(f.outsider.token))).status).toBe(404);
    expect((await request(app).get("/tasks/999999999/links").set(auth(f.tam.token))).status).toBe(404);
    expect(await prisma.taskLink.count({ where: { taskId: f.task.id } })).toBe(1);
  });

  it("rejects non-http(s) and malformed URLs and bad labels with 400", async () => {
    const f = await fixture();
    const base = `/tasks/${f.task.id}/links`;
    for (const url of BAD_URLS) {
      const res = await request(app).post(base).set(auth(f.tam.token)).send({ label: "L", url });
      expect(res.status, url).toBe(400);
    }
    expect((await request(app).post(base).set(auth(f.tam.token)).send({ label: "  ", url: "https://a.io" })).status).toBe(400);
    expect(
      (await request(app).post(base).set(auth(f.tam.token)).send({ label: "x".repeat(201), url: "https://a.io" })).status,
    ).toBe(400);

    const link = await prisma.taskLink.create({
      data: { taskId: f.task.id, label: "L", url: "https://example.com" },
    });
    for (const url of BAD_URLS) {
      const res = await request(app).patch(`${base}/${link.id}`).set(auth(f.tam.token)).send({ url });
      expect(res.status, url).toBe(400);
    }
    expect(await prisma.taskLink.count({ where: { taskId: f.task.id } })).toBe(1);
  });

  it("404s a link id that belongs to another task", async () => {
    const f = await fixture();
    const foreign = await prisma.taskLink.create({
      data: { taskId: f.otherTask.id, label: "L", url: "https://example.com" },
    });
    const base = `/tasks/${f.task.id}/links/${foreign.id}`;
    expect((await request(app).patch(base).set(auth(f.tam.token)).send({ label: "x" })).status).toBe(404);
    expect((await request(app).delete(base).set(auth(f.tam.token))).status).toBe(404);
    const stillThere = await prisma.taskLink.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(stillThere.label).toBe("L");
  });

  it("records label-only project activity events and nothing for an unchanged PATCH", async () => {
    const f = await fixture();
    const base = `/tasks/${f.task.id}/links`;
    const url = "https://secret.example.com/path?token=abc";
    const created = await request(app).post(base).set(auth(f.tam.token)).send({ label: "Runbook", url });
    const id = created.body.id as string;

    await request(app).patch(`${base}/${id}`).set(auth(f.tam.token)).send({ label: "Runbook", url });
    await request(app).patch(`${base}/${id}`).set(auth(f.tam.token)).send({ url: "https://secret.example.com/other" });
    await request(app).patch(`${base}/${id}`).set(auth(f.tam.token)).send({ label: "Runbook 2" });
    await request(app).delete(`${base}/${id}`).set(auth(f.tam.token));

    const events = await prisma.activityEvent.findMany({
      where: { projectId: f.project.id, entityType: "task_link" },
      orderBy: { id: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["added", "updated", "updated", "removed"]);
    expect(events.map((e) => (e.changes as { label: string }).label)).toEqual([
      "Runbook",
      "Runbook",
      "Runbook 2",
      "Runbook 2",
    ]);
    for (const e of events) {
      expect(e.entityId).toBeNull();
      expect(e.entityLabel).toBe("Kickoff");
      expect(e.actorId).toBe(f.tam.userId);
      expect(e.changes).toEqual({ taskId: f.task.id, linkId: id, label: expect.any(String) });
      expect(JSON.stringify(e)).not.toContain("secret.example.com");
    }
    expect(
      await prisma.notification.count({ where: { activityEventId: { in: events.map((e) => e.id) } } }),
    ).toBe(0);
  });

  it("deletes a task's links when the task is deleted", async () => {
    const f = await fixture();
    await prisma.taskLink.create({ data: { taskId: f.task.id, label: "L", url: "https://example.com" } });
    const res = await request(app).delete(`/tasks/${f.task.id}`).set(auth(f.tam.token));
    expect(res.status).toBe(204);
    expect(await prisma.taskLink.count({ where: { taskId: f.task.id } })).toBe(0);
  });
});
