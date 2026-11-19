// ISS-027 (DELETE re-packs siblings), ISS-028 (effective start <= due on
// PATCH), ISS-039 (customer filter composed through AND, visibility intact).
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

const uniq = (label: string) => `${label} ${Date.now()}-${Math.random()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fixture() {
  const tam = await createUserWithRole("TAM");
  const customer = await prisma.customer.create({
    data: { name: uniq("Customer"), description: "d", tamId: tam.userId },
  });
  const project = await prisma.project.create({
    data: { name: uniq("Project"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
  });
  return { tam, customer, project };
}

async function seedTasks(projectId: number, count: number, parentTaskId: number | null = null) {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = await prisma.task.create({
      data: { projectId, parentTaskId, title: `T${i}`, status: "TODO", position: i },
    });
    ids.push(t.id);
  }
  return ids;
}

async function positionsOf(projectId: number, parentTaskId: number | null) {
  const rows = await prisma.task.findMany({
    where: { projectId, parentTaskId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  return rows;
}

describe("DELETE /tasks/:id re-packs siblings (ISS-027)", () => {
  it("closes the gap in a top-level list, keeping relative order", async () => {
    const { tam, project } = await fixture();
    const ids = await seedTasks(project.id, 5);
    const res = await request(app).delete(`/tasks/${ids[1]}`).set(auth(tam.token));
    expect(res.status).toBe(204);
    const rows = await positionsOf(project.id, null);
    expect(rows.map((r) => r.id)).toEqual([ids[0], ids[2], ids[3], ids[4]]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("closes the gap in a subtask list and leaves top-level positions alone", async () => {
    const { tam, project } = await fixture();
    const [parent, other] = await seedTasks(project.id, 2);
    const subs = await seedTasks(project.id, 3, parent);
    const res = await request(app).delete(`/tasks/${subs[0]}`).set(auth(tam.token));
    expect(res.status).toBe(204);
    expect((await positionsOf(project.id, parent)).map((r) => r.position)).toEqual([0, 1]);
    expect(await positionsOf(project.id, null)).toEqual([
      { id: parent, position: 0 },
      { id: other, position: 1 },
    ]);
  });

  it("stays dense when several siblings are deleted concurrently", async () => {
    const { tam, project } = await fixture();
    const ids = await seedTasks(project.id, 8);
    const doomed = [ids[0], ids[2], ids[3], ids[6]];
    const results = await Promise.all(
      doomed.map((id) => request(app).delete(`/tasks/${id}`).set(auth(tam.token))),
    );
    expect(results.map((r) => r.status)).toEqual([204, 204, 204, 204]);
    const rows = await positionsOf(project.id, null);
    expect(rows.map((r) => r.id)).toEqual([ids[1], ids[4], ids[5], ids[7]]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it("404s for a task that does not exist", async () => {
    const { tam } = await fixture();
    const res = await request(app).delete("/tasks/2147483000").set(auth(tam.token));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /tasks/:id date order (ISS-028)", () => {
  const patch = (token: string, id: number, body: object) =>
    request(app).patch(`/tasks/${id}`).set(auth(token)).send(body);

  async function datedTask(start: string | null, due: string | null) {
    const f = await fixture();
    const task = await prisma.task.create({
      data: {
        projectId: f.project.id,
        title: "Dated",
        status: "TODO",
        startDate: start ? new Date(`${start}T00:00:00.000Z`) : null,
        dueDate: due ? new Date(`${due}T00:00:00.000Z`) : null,
      },
    });
    return { ...f, task };
  }

  it("refuses a due date before the stored start date", async () => {
    const { tam, task } = await datedTask("2026-11-10", "2026-11-20");
    const res = await patch(tam.token, task.id, { dueDate: "2026-11-05" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_date_range");
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-20");
  });

  it("refuses a start date after the stored due date", async () => {
    const { tam, task } = await datedTask("2026-11-10", "2026-11-20");
    const res = await patch(tam.token, task.id, { startDate: "2026-11-25" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_date_range");
  });

  it("accepts a move that sends both dates (Gantt drag)", async () => {
    const { tam, task } = await datedTask("2026-11-10", "2026-11-20");
    const res = await patch(tam.token, task.id, { startDate: "2026-12-01", dueDate: "2026-12-05" });
    expect(res.status).toBe(200);
  });

  it("accepts equal dates and a single-sided date with no counterpart", async () => {
    const { tam, task } = await datedTask("2026-11-10", null);
    expect((await patch(tam.token, task.id, { dueDate: "2026-11-10" })).status).toBe(200);
    const open = await datedTask(null, "2026-11-20");
    expect((await patch(open.tam.token, open.task.id, { startDate: "2026-11-01" })).status).toBe(200);
  });

  it("does not block an unrelated edit on an already-inverted legacy row", async () => {
    const { tam, task } = await datedTask("2026-11-20", "2026-11-10");
    const res = await patch(tam.token, task.id, { title: "Renamed" });
    expect(res.status).toBe(200);
  });

  it("lets a milestone due-date edit through (start follows due)", async () => {
    const { tam, project } = await fixture();
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: "M",
        status: "TODO",
        isMilestone: true,
        startDate: new Date("2026-11-10T00:00:00.000Z"),
        dueDate: new Date("2026-11-10T00:00:00.000Z"),
      },
    });
    const res = await patch(tam.token, task.id, { dueDate: "2026-11-02" });
    expect(res.status).toBe(200);
    expect(res.body.startDate.slice(0, 10)).toBe("2026-11-02");
  });
});

describe("GET /tasks customerId filter (ISS-039)", () => {
  it("narrows by customer and still hides projects the caller cannot see", async () => {
    const mine = await fixture();
    const outsider = await fixture();
    const [visibleId] = await seedTasks(mine.project.id, 1);
    const [hiddenId] = await seedTasks(outsider.project.id, 1);

    const own = await request(app)
      .get(`/tasks?customerId=${mine.customer.id}`)
      .set(auth(mine.tam.token));
    expect(own.status).toBe(200);
    expect(own.body.map((t: { id: number }) => t.id)).toEqual([visibleId]);

    const foreign = await request(app)
      .get(`/tasks?customerId=${outsider.customer.id}`)
      .set(auth(mine.tam.token));
    expect(foreign.status).toBe(200);
    expect(foreign.body.map((t: { id: number }) => t.id)).not.toContain(hiddenId);
    expect(foreign.body).toEqual([]);
  });
});
