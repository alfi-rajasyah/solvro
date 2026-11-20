// ISS-031: a TAM with thousands of projects is handed over inside the 30 s
// transaction timeout. The default (600) is above the old 500 cap; set
// OFFBOARD_SCALE=5000 to time the full cap.
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

const N = Number(process.env.OFFBOARD_SCALE ?? 600);

describe("offboarding a TAM with many projects", () => {
  it(`hands over ${N} projects in one request`, async () => {
    const admin = await createAdminAndToken();
    const leaver = await createUserWithRole("TAM");
    const receiver = await createUserWithRole("TAM");
    const stamp = Date.now();
    await prisma.project.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        name: `Scale ${stamp}-${i}`,
        tamId: leaver.userId,
        status: "ACTIVE" as const,
      })),
    });
    const projects = await prisma.project.findMany({
      where: { tamId: leaver.userId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    await prisma.task.createMany({
      data: projects.map((p) => ({
        projectId: p.id,
        title: "open",
        assignedToId: leaver.userId,
        status: "TODO" as const,
        priority: "MEDIUM" as const,
        position: 0,
      })),
    });

    const started = Date.now();
    const res = await request(app)
      .post(`/admin/users/${leaver.userId}/offboard`)
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({
        projects: projects.map((p) => ({
          projectId: p.id,
          assignTasksTo: receiver.userId,
          newTamId: receiver.userId,
          note: "handover",
        })),
        customers: [],
      });
    const ms = Date.now() - started;
    console.log(`offboard ${N} projects: ${ms} ms`);
    expect(res.status).toBe(200);
    expect(await prisma.project.count({ where: { tamId: receiver.userId } })).toBe(N);
    expect(await prisma.task.count({ where: { assignedToId: receiver.userId } })).toBe(N);
    expect(await prisma.activityEvent.count({ where: { projectId: { in: projects.map((p) => p.id) } } })).toBeGreaterThanOrEqual(N);
  }, 120_000);
});
