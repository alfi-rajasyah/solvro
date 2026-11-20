// ISS-005: posting a task comment needs task:write. A STAKEHOLDER (project:read)
// and the SA role (pipeline:view, project:read) can read a thread but not add to it.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await seedRoles();
});

async function fixture() {
  const tam = await createUserWithRole("TAM");
  const stakeholder = await createUserWithRole("STAKEHOLDER");
  const sa = await createUserWithRole("SA");
  const project = await prisma.project.create({
    data: {
      name: `P ${Date.now()}-${Math.random()}`,
      tamId: tam.userId,
      saId: sa.userId,
      status: "ACTIVE",
    },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: stakeholder.userId } });
  const task = await prisma.task.create({
    data: { projectId: project.id, title: "t", status: "TODO", priority: "MEDIUM", position: 0 },
  });
  return { tam, stakeholder, sa, task };
}

describe("task comment permission", () => {
  it("refuses STAKEHOLDER and SA with 403 and stores nothing; TAM may comment", async () => {
    const { tam, stakeholder, sa, task } = await fixture();
    for (const user of [stakeholder, sa]) {
      const res = await request(app)
        .post(`/tasks/${task.id}/comments`)
        .set(auth(user.token))
        .send({ body: "nope" });
      expect(res.status).toBe(403);
    }
    expect(await prisma.comment.count({ where: { taskId: task.id } })).toBe(0);

    const ok = await request(app)
      .post(`/tasks/${task.id}/comments`)
      .set(auth(tam.token))
      .send({ body: "fine" });
    expect(ok.status).toBe(201);
  });

  it("STAKEHOLDER and SA can still read the thread", async () => {
    const { tam, stakeholder, sa, task } = await fixture();
    await request(app).post(`/tasks/${task.id}/comments`).set(auth(tam.token)).send({ body: "hi" });
    for (const user of [stakeholder, sa]) {
      const res = await request(app).get(`/tasks/${task.id}/comments`).set(auth(user.token));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    }
  });
});
