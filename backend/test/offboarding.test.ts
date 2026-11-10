// Offboarding handover (docs/archive/plans/feedback-round-lifecycle-spec.md, F5).
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
  const newTam = await createUserWithRole("TAM");
  const newSa = await createUserWithRole("SA");
  return { admin, leaver, receiver, newTam, newSa };
}

type World = Awaited<ReturnType<typeof world>>;

/** A project where the leaver is TAM, with open + done tasks and an owned epic. */
async function tamProject(w: World, opts: { sa?: number } = {}) {
  const project = await prisma.project.create({
    data: { name: uniq("P"), tamId: w.leaver.userId, saId: opts.sa ?? null, status: "ACTIVE" },
  });
  const epic = await prisma.epic.create({
    data: { projectId: project.id, title: "E", ownerId: w.leaver.userId, status: "IN_PROGRESS" },
  });
  const doneEpic = await prisma.epic.create({
    data: { projectId: project.id, title: "E done", ownerId: w.leaver.userId, status: "DONE" },
  });
  const open1 = await prisma.task.create({
    data: { projectId: project.id, title: "a", assignedToId: w.leaver.userId, status: "TODO", position: 0 },
  });
  const open2 = await prisma.task.create({
    data: { projectId: project.id, title: "b", assignedToId: w.leaver.userId, status: "IN_PROGRESS", position: 1 },
  });
  const done = await prisma.task.create({
    data: { projectId: project.id, title: "c", assignedToId: w.leaver.userId, status: "DONE", position: 2 },
  });
  return { project, epic, doneEpic, open1, open2, done };
}

const preview = (w: World) =>
  request(app).get(`/admin/users/${w.leaver.userId}/handover-preview`).set(auth(w.admin.token));
const offboard = (w: World, body: unknown) =>
  request(app).post(`/admin/users/${w.leaver.userId}/offboard`).set(auth(w.admin.token)).send(body as object);

describe("GET /admin/users/:id/handover-preview", () => {
  it("returns the footprint: projects, customers and open deals", async () => {
    const w = await world();
    const { project } = await tamProject(w, { sa: w.newSa.userId });
    const saOnly = await prisma.project.create({
      data: { name: uniq("SA"), tamId: w.receiver.userId, saId: w.leaver.userId, status: "PLANNING" },
    });
    const closedSeat = await prisma.project.create({
      data: { name: uniq("Done"), tamId: w.leaver.userId, status: "COMPLETED" },
    });
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    await prisma.opportunity.create({
      data: { title: "open", customerName: "x", picId: w.leaver.userId },
    });
    await prisma.opportunity.create({
      data: { title: "won", customerName: "x", picId: w.leaver.userId, outcome: "WON", closedAt: new Date() },
    });

    const res = await preview(w);
    expect(res.status).toBe(200);
    const byId = new Map<number, { isTam: boolean; isSa: boolean; openTasks: number; openEpics: number }>(
      res.body.projects.map((p: { id: number }) => [p.id, p as never]),
    );
    expect(byId.get(project.id)).toMatchObject({ isTam: true, isSa: false, openTasks: 2, openEpics: 1 });
    expect(byId.get(saOnly.id)).toMatchObject({ isTam: false, isSa: true, openTasks: 0, openEpics: 0 });
    expect(byId.has(closedSeat.id)).toBe(false);
    expect(res.body.projects[0]).toEqual(
      expect.objectContaining({ id: expect.any(Number), name: expect.any(String), status: "ACTIVE" }),
    );
    expect(res.body.customers).toEqual([{ id: customer.id, name: customer.name }]);
    expect(res.body.openDeals).toBe(1);
  });

  it("is empty for a user who holds nothing", async () => {
    const w = await world();
    const res = await preview(w);
    expect(res.body).toEqual({ projects: [], customers: [], openDeals: 0 });
  });

  it("404 for an unknown user, 403 for a non-admin", async () => {
    const w = await world();
    const missing = await request(app).get("/admin/users/99999999/handover-preview").set(auth(w.admin.token));
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("user_not_found");
    const denied = await request(app)
      .get(`/admin/users/${w.leaver.userId}/handover-preview`)
      .set(auth(w.receiver.token));
    expect(denied.status).toBe(403);
  });
});

describe("PATCH /admin/users/:id/deactivate guard", () => {
  it("409 handover_required while the user holds work; the user stays active", async () => {
    const w = await world();
    await tamProject(w);
    const res = await request(app)
      .patch(`/admin/users/${w.leaver.userId}/deactivate`)
      .set(auth(w.admin.token))
      .send({ active: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("handover_required");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("409 for a customer-only and for a deal-only footprint", async () => {
    const onlyCustomer = await world();
    await prisma.customer.create({ data: { name: uniq("C"), description: "d", tamId: onlyCustomer.leaver.userId } });
    const a = await request(app)
      .patch(`/admin/users/${onlyCustomer.leaver.userId}/deactivate`)
      .set(auth(onlyCustomer.admin.token))
      .send({ active: false });
    expect(a.status).toBe(409);
    expect(a.body.code).toBe("handover_required");
    expect(a.body.details).toEqual({ projects: 0, customers: 1, openDeals: 0 });

    const onlyDeal = await world();
    await prisma.opportunity.create({ data: { title: "d", customerName: "x", picId: onlyDeal.leaver.userId } });
    const b = await request(app)
      .patch(`/admin/users/${onlyDeal.leaver.userId}/deactivate`)
      .set(auth(onlyDeal.admin.token))
      .send({ active: false });
    expect(b.status).toBe(409);
    expect(b.body.details).toEqual({ projects: 0, customers: 0, openDeals: 1 });
  });

  it("deactivates a user with nothing to hand over, and reactivation is unchanged", async () => {
    const w = await world();
    const off = await request(app)
      .patch(`/admin/users/${w.leaver.userId}/deactivate`)
      .set(auth(w.admin.token))
      .send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.active).toBe(false);
    const on = await request(app)
      .patch(`/admin/users/${w.leaver.userId}/deactivate`)
      .set(auth(w.admin.token))
      .send({ active: true });
    expect(on.body.active).toBe(true);
  });

  it("reactivating a user who still holds work is not blocked", async () => {
    const w = await world();
    await tamProject(w);
    await prisma.user.update({ where: { id: w.leaver.userId }, data: { active: false } });
    const res = await request(app)
      .patch(`/admin/users/${w.leaver.userId}/deactivate`)
      .set(auth(w.admin.token))
      .send({ active: true });
    expect(res.status).toBe(200);
  });
});

describe("POST /admin/users/:id/offboard", () => {
  it("hands everything over in one go and deactivates", async () => {
    const w = await world();
    const { project, epic, doneEpic, open1, open2, done } = await tamProject(w, { sa: w.newSa.userId });
    const saProject = await prisma.project.create({
      data: { name: uniq("SA"), tamId: w.receiver.userId, saId: w.leaver.userId, status: "ACTIVE" },
    });
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const deal = await prisma.opportunity.create({
      data: { title: "open", customerName: "x", picId: w.leaver.userId },
    });
    const wonDeal = await prisma.opportunity.create({
      data: { title: "won", customerName: "x", picId: w.leaver.userId, outcome: "WON", closedAt: new Date() },
    });
    const dealPic = await createUserWithRole("SALES");
    // The leaver is both TAM and SA nowhere; make the first project's SA the leaver too.
    await prisma.project.update({ where: { id: project.id }, data: { saId: w.leaver.userId } });

    const res = await offboard(w, {
      projects: [
        {
          projectId: project.id,
          assignTasksTo: w.receiver.userId,
          newTamId: w.newTam.userId,
          newSaId: w.newSa.userId,
          note: "SECRET handover body",
        },
        { projectId: saProject.id, assignTasksTo: null },
      ],
      customers: [{ customerId: customer.id, newOwnerId: w.receiver.userId }],
      dealsPicId: dealPic.userId,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: w.leaver.userId, active: false });

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.tamId).toBe(w.newTam.userId);
    expect(after.saId).toBe(w.newSa.userId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: saProject.id } })).saId).toBeNull();

    const tasks = await prisma.task.findMany({ where: { id: { in: [open1.id, open2.id, done.id] } } });
    const t = new Map(tasks.map((x) => [x.id, x]));
    expect(t.get(open1.id)).toMatchObject({ assignedToId: w.receiver.userId, status: "TODO" });
    expect(t.get(open2.id)).toMatchObject({ assignedToId: w.receiver.userId, status: "IN_PROGRESS" });
    expect(t.get(done.id)).toMatchObject({ assignedToId: w.leaver.userId, status: "DONE" });
    expect((await prisma.epic.findUniqueOrThrow({ where: { id: epic.id } })).ownerId).toBe(w.receiver.userId);
    expect((await prisma.epic.findUniqueOrThrow({ where: { id: doneEpic.id } })).ownerId).toBe(w.leaver.userId);
    // The receiver gained project access the way a task assignment grants it.
    expect(
      await prisma.projectMember.count({ where: { projectId: project.id, userId: w.receiver.userId } }),
    ).toBe(1);

    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBe(
      w.receiver.userId,
    );
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).picId).toBe(
      dealPic.userId,
    );
    // Closed deals keep their PIC as history.
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: wonDeal.id } })).picId).toBe(
      w.leaver.userId,
    );
    const dealEvents = await prisma.activityEvent.findMany({ where: { opportunityId: deal.id } });
    expect(dealEvents.map((e) => e.action)).toContain("assigned");

    // INTERNAL note, authored by the admin, body absent from every event.
    const notes = await prisma.projectNote.findMany({ where: { projectId: project.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ visibility: "INTERNAL", authorId: w.admin.userId });
    const events = await prisma.activityEvent.findMany({ where: { projectId: project.id } });
    expect(JSON.stringify(events)).not.toContain("SECRET");
    const upd = events.find((e) => e.entityType === "project" && e.action === "updated")!;
    const changes = upd.changes as Record<string, unknown>;
    expect(changes.handover).toMatchObject({ tasks: 2, epics: 1 });
    expect(changes.tam).toBeTruthy();
    expect(changes.sa).toBeTruthy();

    // Nothing left: the preview is now empty and the user is inactive.
    expect((await preview(w)).body).toEqual({ projects: [], customers: [], openDeals: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(false);
  });

  it("an omitted note creates no note; tasks can be left unassigned", async () => {
    const w = await world();
    const { project, open1 } = await tamProject(w);
    const res = await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: null, newTamId: w.newTam.userId }],
      customers: [],
    });
    expect(res.status).toBe(200);
    expect(await prisma.projectNote.count({ where: { projectId: project.id } })).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: open1.id } })).assignedToId).toBeNull();
    expect(await prisma.notification.count({ where: { reason: "tasks_handed_over", activityEvent: { projectId: project.id } } })).toBe(0);
  });

  it("400 handover_incomplete when a project, customer is missing from the body", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const noProject = await offboard(w, { projects: [], customers: [{ customerId: customer.id, newOwnerId: null }] });
    expect(noProject.status).toBe(400);
    expect(noProject.body.code).toBe("handover_incomplete");
    expect(noProject.body.details).toEqual({ projectIds: [project.id], customerIds: [] });
    const noCustomer = await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: null, newTamId: w.newTam.userId }],
      customers: [],
    });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body.code).toBe("handover_incomplete");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("400 tam_required where the leaver is TAM", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    const res = await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: w.receiver.userId }],
      customers: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("tam_required");
  });

  it("refuses inactive or leaver receivers", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    const inactive = await createUserWithRole("TAM");
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const base = { projectId: project.id, assignTasksTo: null as number | null, newTamId: w.newTam.userId };
    for (const [patch, code] of [
      [{ assignTasksTo: inactive.userId }, "assignee_not_found"],
      [{ assignTasksTo: w.leaver.userId }, "assignee_not_found"],
      [{ assignTasksTo: 99999999 }, "assignee_not_found"],
      [{ newTamId: inactive.userId }, "tam_not_found"],
      [{ newTamId: w.leaver.userId }, "tam_not_found"],
      [{ newTamId: 99999999 }, "tam_not_found"],
    ] as const) {
      const res = await offboard(w, { projects: [{ ...base, ...patch }], customers: [] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
      expect(res.body.details).toEqual({ projectId: project.id });
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("404 for an unknown user; self-offboarding is refused", async () => {
    const w = await world();
    const missing = await request(app)
      .post("/admin/users/99999999/offboard")
      .set(auth(w.admin.token))
      .send({ projects: [], customers: [] });
    expect(missing.status).toBe(404);
    const self = await request(app)
      .post(`/admin/users/${w.admin.userId}/offboard`)
      .set(auth(w.admin.token))
      .send({ projects: [], customers: [] });
    expect(self.status).toBe(400);
    expect(self.body.code).toBe("self_deactivate");
  });

  it("an already-inactive user can still be handed over", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    await prisma.user.update({ where: { id: w.leaver.userId }, data: { active: false } });
    const res = await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: w.receiver.userId, newTamId: w.newTam.userId }],
      customers: [],
    });
    expect(res.status).toBe(200);
    expect((await preview(w)).body.projects).toEqual([]);
  });

  it("403 for a non-admin", async () => {
    const w = await world();
    const res = await request(app)
      .post(`/admin/users/${w.leaver.userId}/offboard`)
      .set(auth(w.receiver.token))
      .send({ projects: [], customers: [] });
    expect(res.status).toBe(403);
  });

  it("SA seat: replaced, or cleared when newSaId is null/absent", async () => {
    const w = await world();
    const mk = () =>
      prisma.project.create({
        data: { name: uniq("S"), tamId: w.receiver.userId, saId: w.leaver.userId, status: "ACTIVE" },
      });
    const a = await mk();
    const b = await mk();
    const res = await offboard(w, {
      projects: [
        { projectId: a.id, assignTasksTo: null, newSaId: w.newSa.userId },
        { projectId: b.id, assignTasksTo: null, newSaId: null },
      ],
      customers: [],
    });
    expect(res.status).toBe(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: a.id } })).saId).toBe(w.newSa.userId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: b.id } })).saId).toBeNull();
    // The new SA hears about the seat like any seat change.
    expect(
      await prisma.notification.count({
        where: { userId: w.newSa.userId, reason: "assigned", activityEvent: { projectId: a.id } },
      }),
    ).toBe(1);
  });

  it("customer owner can be cleared", async () => {
    const w = await world();
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const res = await offboard(w, { projects: [], customers: [{ customerId: customer.id, newOwnerId: null }] });
    expect(res.status).toBe(200);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBeNull();
  });

  it("deal PIC: unassigned when omitted; an ineligible receiver is refused and nothing changes", async () => {
    const w = await world();
    const deal = await prisma.opportunity.create({
      data: { title: "d", customerName: "x", picId: w.leaver.userId },
    });
    const inactive = await createUserWithRole("SA");
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const bad = await offboard(w, { projects: [], customers: [], dealsPicId: inactive.userId });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("pic_not_found");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).picId).toBe(w.leaver.userId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);

    const before = await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } });
    const ok = await offboard(w, { projects: [], customers: [] });
    expect(ok.status).toBe(200);
    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } });
    expect(after.picId).toBeNull();
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(before.lastActivityAt.getTime());
  });

  it("is atomic: a failure in a later project rolls everything back", async () => {
    const w = await world();
    const first = await tamProject(w);
    const second = await tamProject(w);
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const res = await offboard(w, {
      projects: [
        { projectId: first.project.id, assignTasksTo: w.receiver.userId, newTamId: w.newTam.userId, note: "n" },
        // second.project: tam_required -> whole operation fails
        { projectId: second.project.id, assignTasksTo: w.receiver.userId },
      ],
      customers: [{ customerId: customer.id, newOwnerId: w.receiver.userId }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("tam_required");
    expect(res.body.details).toEqual({ projectId: second.project.id });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: first.project.id } })).tamId).toBe(
      w.leaver.userId,
    );
    expect((await prisma.task.findUniqueOrThrow({ where: { id: first.open1.id } })).assignedToId).toBe(
      w.leaver.userId,
    );
    expect(await prisma.projectNote.count({ where: { projectId: first.project.id } })).toBe(0);
    expect(await prisma.projectMember.count({ where: { projectId: first.project.id } })).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBe(
      w.leaver.userId,
    );
    expect(await prisma.activityEvent.count({ where: { projectId: first.project.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("notifies a task receiver once per project, never the leaver or the acting admin", async () => {
    const w = await world();
    const a = await tamProject(w);
    const b = await tamProject(w);
    const res = await offboard(w, {
      projects: [
        { projectId: a.project.id, assignTasksTo: w.receiver.userId, newTamId: w.newTam.userId },
        { projectId: b.project.id, assignTasksTo: w.receiver.userId, newTamId: w.newTam.userId },
      ],
      customers: [],
    });
    expect(res.status).toBe(200);
    for (const p of [a.project.id, b.project.id]) {
      // 2 tasks moved in each project -> still ONE notification for the receiver.
      expect(
        await prisma.notification.count({
          where: { userId: w.receiver.userId, reason: "tasks_handed_over", activityEvent: { projectId: p } },
        }),
      ).toBe(1);
      // The new TAM gets the seat notification instead.
      expect(
        await prisma.notification.count({
          where: { userId: w.newTam.userId, reason: "assigned", activityEvent: { projectId: p } },
        }),
      ).toBe(1);
    }
    expect(
      await prisma.notification.count({
        where: { userId: { in: [w.leaver.userId, w.admin.userId] } },
      }),
    ).toBe(0);
  });

  it("a receiver who is also the new TAM gets only the seat notification", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: w.newTam.userId, newTamId: w.newTam.userId }],
      customers: [],
    });
    const rows = await prisma.notification.findMany({
      where: { userId: w.newTam.userId, activityEvent: { projectId: project.id } },
    });
    expect(rows.map((r) => r.reason)).toEqual(["assigned"]);
  });
});

describe("POST /admin/users/:id/offboard — receiver rules and late failures", () => {
  it("rolls back project, customer and note writes when the deal step fails", async () => {
    const w = await world();
    const { project, epic, open1 } = await tamProject(w, { sa: w.leaver.userId });
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const deal = await prisma.opportunity.create({
      data: { title: "d", customerName: "x", picId: w.leaver.userId },
    });
    const inactive = await createUserWithRole("SA");
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });

    // Project and customer writes happen first; the deal receiver is checked last.
    const res = await offboard(w, {
      projects: [
        {
          projectId: project.id,
          assignTasksTo: w.receiver.userId,
          newTamId: w.newTam.userId,
          newSaId: w.newSa.userId,
          note: "n",
        },
      ],
      customers: [{ customerId: customer.id, newOwnerId: w.receiver.userId }],
      dealsPicId: inactive.userId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("pic_not_found");

    const p = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(p.tamId).toBe(w.leaver.userId);
    expect(p.saId).toBe(w.leaver.userId);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: open1.id } })).assignedToId).toBe(w.leaver.userId);
    expect((await prisma.epic.findUniqueOrThrow({ where: { id: epic.id } })).ownerId).toBe(w.leaver.userId);
    expect(await prisma.projectNote.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.projectMember.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.activityEvent.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: w.receiver.userId } })).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBe(w.leaver.userId);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).picId).toBe(w.leaver.userId);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("refuses an inactive new SA and an inactive new customer owner, with the row id", async () => {
    const w = await world();
    const inactive = await createUserWithRole("TAM");
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const sa = await prisma.project.create({
      data: { name: uniq("S"), tamId: w.receiver.userId, saId: w.leaver.userId, status: "ACTIVE" },
    });
    const badSa = await offboard(w, {
      projects: [{ projectId: sa.id, assignTasksTo: null, newSaId: inactive.userId }],
      customers: [],
    });
    expect(badSa.status).toBe(400);
    expect(badSa.body.code).toBe("sa_not_found");
    expect(badSa.body.details).toEqual({ projectId: sa.id });

    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    for (const newOwnerId of [inactive.userId, 99999999, w.leaver.userId]) {
      const bad = await offboard(w, {
        projects: [{ projectId: sa.id, assignTasksTo: null }],
        customers: [{ customerId: customer.id, newOwnerId }],
      });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe("owner_not_found");
      expect(bad.body.details).toEqual({ customerId: customer.id });
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.leaver.userId } })).active).toBe(true);
  });

  it("refuses a deal receiver without pipeline:view; accepts one with it", async () => {
    const w = await world();
    const deal = await prisma.opportunity.create({
      data: { title: "d", customerName: "x", picId: w.leaver.userId },
    });
    const stakeholder = await createUserWithRole("STAKEHOLDER");
    const bad = await offboard(w, { projects: [], customers: [], dealsPicId: stakeholder.userId });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("pic_no_pipeline_access");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).picId).toBe(w.leaver.userId);

    const sales = await createUserWithRole("SALES");
    const ok = await offboard(w, { projects: [], customers: [], dealsPicId: sales.userId });
    expect(ok.status).toBe(200);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: deal.id } })).picId).toBe(sales.userId);
  });

  it("leaves a customer alone whose owner changed away from the leaver", async () => {
    const w = await world();
    const customer = await prisma.customer.create({
      data: { name: uniq("C"), description: "d", tamId: w.leaver.userId },
    });
    const other = await prisma.customer.create({
      data: { name: uniq("C2"), description: "d", tamId: w.leaver.userId },
    });
    // The first customer changes hands before the offboard runs.
    await prisma.customer.update({ where: { id: customer.id }, data: { tamId: w.receiver.userId } });
    const res = await offboard(w, {
      projects: [],
      customers: [
        { customerId: customer.id, newOwnerId: w.newTam.userId },
        { customerId: other.id, newOwnerId: w.newTam.userId },
      ],
    });
    expect(res.status).toBe(200);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).tamId).toBe(w.receiver.userId);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: other.id } })).tamId).toBe(w.newTam.userId);
  });

  it("adds no member row when no work moved", async () => {
    const w = await world();
    const sa = await prisma.project.create({
      data: { name: uniq("S"), tamId: w.newTam.userId, saId: w.leaver.userId, status: "ACTIVE" },
    });
    const res = await offboard(w, {
      projects: [{ projectId: sa.id, assignTasksTo: w.receiver.userId }],
      customers: [],
    });
    expect(res.status).toBe(200);
    expect(await prisma.projectMember.count({ where: { projectId: sa.id } })).toBe(0);
  });
});

describe("handover notifications — epics", () => {
  const handover = (userId: number, projectId: number) =>
    prisma.notification.findMany({
      where: { userId, activityEvent: { projectId } },
      include: { activityEvent: true },
    });

  it("a receiver of epics only is notified, with tasks: 0 in the payload", async () => {
    const w = await world();
    const project = await prisma.project.create({
      data: { name: uniq("E"), tamId: w.newTam.userId, status: "ACTIVE" },
    });
    await prisma.epic.create({
      data: { projectId: project.id, title: "E", ownerId: w.leaver.userId, status: "TODO" },
    });
    const res = await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: w.receiver.userId }],
      customers: [],
    });
    expect(res.status).toBe(200);
    const rows = await handover(w.receiver.userId, project.id);
    expect(rows.map((r) => r.reason)).toEqual(["tasks_handed_over"]);
    expect(rows[0]!.activityEvent.changes).toMatchObject({
      handover: { from: expect.any(String), to: expect.any(String), tasks: 0, epics: 1 },
    });
  });

  it("a receiver of tasks and epics gets exactly one notification", async () => {
    const w = await world();
    const { project } = await tamProject(w);
    await offboard(w, {
      projects: [{ projectId: project.id, assignTasksTo: w.receiver.userId, newTamId: w.newTam.userId }],
      customers: [],
    });
    const rows = await handover(w.receiver.userId, project.id);
    expect(rows.map((r) => r.reason)).toEqual(["tasks_handed_over"]);
  });

  it("unassigned epics notify nobody", async () => {
    const w = await world();
    const project = await prisma.project.create({
      data: { name: uniq("E"), tamId: w.newTam.userId, status: "ACTIVE" },
    });
    await prisma.epic.create({
      data: { projectId: project.id, title: "E", ownerId: w.leaver.userId, status: "TODO" },
    });
    await offboard(w, { projects: [{ projectId: project.id, assignTasksTo: null }], customers: [] });
    expect(await prisma.notification.count({ where: { activityEvent: { projectId: project.id } } })).toBe(0);
  });
});
