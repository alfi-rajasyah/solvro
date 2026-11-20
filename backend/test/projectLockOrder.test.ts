import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { seedRoles, createAdminAndToken, createUserWithRole } from "./testAuth.js";

// Project-scoped writes that take the project lock first: section and epic
// appends (docs/ISSUES.md ISS-029), the baseline lock against a concurrent
// lifecycle change (ISS-166), and label creation's permission (ISS-001).

const app = createApp();
let token: string;
let userId: number;
let projectId: number;

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

async function mkProject(status: "ACTIVE" | "ON_HOLD" = "ACTIVE", ownerId = userId) {
  const p = await prisma.project.create({
    data: { name: `Lock ${Date.now()}-${Math.random()}`, saId: ownerId, tamId: ownerId, status },
  });
  return p.id;
}

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const admin = await createAdminAndToken();
  token = admin.token;
  userId = admin.userId;
  projectId = await mkProject();
});

describe("concurrent section and epic creates", () => {
  it("gives parallel section creates distinct positions", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app).post(`/projects/${projectId}/sections`).set(auth()).send({ name: `S${i}` }),
      ),
    );
    for (const r of results) expect(r.status).toBe(201);
    const positions = results.map((r) => r.body.position as number).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("gives parallel epic creates distinct positions", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app).post(`/projects/${projectId}/epics`).set(auth()).send({ title: `E${i}` }),
      ),
    );
    for (const r of results) expect(r.status).toBe(201);
    const positions = results.map((r) => r.body.position as number).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("baseline lock racing a lifecycle change", () => {
  const start = new Date("2026-01-05T00:00:00.000Z");
  const due = new Date("2026-01-09T00:00:00.000Z");

  async function seedHeldProject(): Promise<number> {
    const pid = await mkProject("ON_HOLD");
    await prisma.task.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        projectId: pid,
        title: `T${i}`,
        status: "TODO" as const,
        position: i,
        startDate: start,
        dueDate: due,
      })),
    });
    return pid;
  }

  it("neither deadlocks nor mixes pre- and post-shift dates when racing a reactivation", async () => {
    for (let iter = 0; iter < 6; iter++) {
      const pid = await seedHeldProject();
      const [baseline, reactivate] = await Promise.all([
        request(app).post(`/projects/${pid}/baseline`).set(auth()).send({}),
        request(app).patch(`/projects/${pid}`).set(auth()).send({ status: "ACTIVE", shiftOpenDatesByDays: 7 }),
      ]);
      expect(baseline.status).toBe(200);
      expect(reactivate.status).toBe(200);

      const tasks = await prisma.task.findMany({ where: { projectId: pid } });
      // Serialised by the project lock: the baseline copy saw every task
      // before the shift, or every task after it, never a mix.
      const copied = new Set(tasks.map((t) => t.baselineDueDate?.toISOString()));
      expect(copied.size).toBe(1);
      const live = new Set(tasks.map((t) => t.dueDate?.toISOString()));
      expect(live.size).toBe(1);
      expect(tasks[0].dueDate!.getTime()).toBe(due.getTime() + 7 * 86_400_000);
    }
  });

  it("neither deadlocks nor loses the baseline when racing a cancellation", async () => {
    for (let iter = 0; iter < 6; iter++) {
      const pid = await seedHeldProject();
      const [baseline, cancel] = await Promise.all([
        request(app).post(`/projects/${pid}/baseline`).set(auth()).send({}),
        request(app).patch(`/projects/${pid}`).set(auth()).send({ status: "CANCELLED" }),
      ]);
      expect(baseline.status).toBe(200);
      expect(cancel.status).toBe(200);

      const project = await prisma.project.findUniqueOrThrow({ where: { id: pid } });
      expect(project.status).toBe("CANCELLED");
      expect(project.baselineLockedAt).not.toBeNull();
      const tasks = await prisma.task.findMany({ where: { projectId: pid } });
      for (const t of tasks) {
        expect(t.status).toBe("CANCELLED");
        expect(t.baselineDueDate?.getTime()).toBe(due.getTime());
      }
    }
  });
});

describe("label creation permission", () => {
  async function userWith(permissions: string[]) {
    const roleName = `LABELS_${permissions.join("_").replace(/:/g, "")}`;
    await prisma.role.upsert({
      where: { roleName },
      update: { permissions },
      create: { roleName, permissions },
    });
    return createUserWithRole(roleName);
  }

  it("allows task:write without project:write on a project the caller can see", async () => {
    const u = await userWith(["project:read", "task:read", "task:write"]);
    const pid = await mkProject("ACTIVE", u.userId);
    const res = await request(app).post(`/projects/${pid}/labels`).set(auth(u.token)).send({ name: "bug" });
    expect(res.status).toBe(201);
  });

  it("refuses project:write without task:write", async () => {
    const u = await userWith(["project:read", "project:write"]);
    const pid = await mkProject("ACTIVE", u.userId);
    const res = await request(app).post(`/projects/${pid}/labels`).set(auth(u.token)).send({ name: "bug" });
    expect(res.status).toBe(403);
  });
});
