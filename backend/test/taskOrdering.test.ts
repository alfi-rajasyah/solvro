import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { seedRoles, createAdminAndToken } from "./testAuth.js";

const app = createApp();

let token: string;
let projectId: number;

async function createProject(): Promise<number> {
  const { userId } = await createAdminAndToken();
  const project = await prisma.project.create({
    data: {
      name: `Project ${Date.now()}-${Math.random()}`,
      saId: userId,
      tamId: userId,
      status: "ACTIVE",
    },
  });
  return project.id;
}

interface TaskRow {
  id: number;
  title: string;
  status: string;
  parentTaskId: number | null;
  position: number;
}

async function createTask(
  overrides: Partial<{
    title: string;
    status: string;
    parentTaskId: number | null;
  }> = {},
): Promise<TaskRow> {
  const res = await request(app)
    .post(`/projects/${projectId}/tasks`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: overrides.title ?? "Task", status: overrides.status, parentTaskId: overrides.parentTaskId });
  expect(res.status).toBe(201);
  return res.body as TaskRow;
}

async function patchTask(id: number, body: Record<string, unknown>) {
  return request(app).patch(`/tasks/${id}`).set("Authorization", `Bearer ${token}`).send(body);
}

async function listProjectTasks(query = ""): Promise<TaskRow[]> {
  const res = await request(app)
    .get(`/projects/${projectId}/tasks${query}`)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body as TaskRow[];
}

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const admin = await createAdminAndToken();
  token = admin.token;
  projectId = await createProject();
});

describe("task creation appends to sibling list", () => {
  it("assigns positions 0, 1, 2 to three top-level tasks created in the same status column", async () => {
    const t0 = await createTask({ title: "A" });
    const t1 = await createTask({ title: "B" });
    const t2 = await createTask({ title: "C" });

    expect(t0.position).toBe(0);
    expect(t1.position).toBe(1);
    expect(t2.position).toBe(2);

    const listed = await listProjectTasks();
    expect(listed.map((t) => t.id)).toEqual([t0.id, t1.id, t2.id]);
  });

  it("orders GET /tasks (cross-project) by position asc, then id asc", async () => {
    const t0 = await createTask({ title: "A" });
    const t1 = await createTask({ title: "B" });

    // Move t1 in front of t0 to prove the global list follows position, not id.
    const patchRes = await patchTask(t1.id, { position: 0 });
    expect(patchRes.status).toBe(200);

    const res = await request(app).get("/tasks").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body as TaskRow[]).map((t) => t.id).filter((id) => id === t0.id || id === t1.id);
    expect(ids).toEqual([t1.id, t0.id]);
  });
});

describe("reorder within the same column", () => {
  it("re-packs positions densely after moving the last task to the front", async () => {
    const t0 = await createTask({ title: "A" });
    const t1 = await createTask({ title: "B" });
    const t2 = await createTask({ title: "C" });

    const res = await patchTask(t2.id, { position: 0 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(0);

    const listed = await listProjectTasks();
    const relevant = listed.filter((t) => [t0.id, t1.id, t2.id].includes(t.id));
    expect(relevant.map((t) => t.id)).toEqual([t2.id, t0.id, t1.id]);
    expect(relevant.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("clamps an out-of-range position to the end of the list", async () => {
    const t0 = await createTask({ title: "A" });
    const t1 = await createTask({ title: "B" });

    const res = await patchTask(t0.id, { position: 999 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(1);

    const listed = await listProjectTasks();
    const relevant = listed.filter((t) => [t0.id, t1.id].includes(t.id));
    expect(relevant.map((t) => t.id)).toEqual([t1.id, t0.id]);
  });
});

describe("move across columns (status change)", () => {
  it("appends to the end of the destination column and closes the gap in the source column", async () => {
    const a0 = await createTask({ title: "A0", status: "TODO" });
    const a1 = await createTask({ title: "A1", status: "TODO" });
    const a2 = await createTask({ title: "A2", status: "TODO" });
    const b0 = await createTask({ title: "B0", status: "IN_PROGRESS" });

    // Move the middle TODO task to IN_PROGRESS without specifying position
    // -> should append (position 1, after b0).
    const res = await patchTask(a1.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.position).toBe(1);

    const listed = await listProjectTasks();
    const todoTasks = listed.filter((t) => t.status === "TODO" && [a0.id, a1.id, a2.id].includes(t.id));
    // Old column gap closed + re-packed: a0 stays at 0, a2 shifts down to 1.
    expect(todoTasks.map((t) => t.id)).toEqual([a0.id, a2.id]);
    expect(todoTasks.map((t) => t.position)).toEqual([0, 1]);

    const inProgress = listed.filter((t) => t.status === "IN_PROGRESS" && [b0.id, a1.id].includes(t.id));
    expect(inProgress.map((t) => t.id)).toEqual([b0.id, a1.id]);
    expect(inProgress.map((t) => t.position)).toEqual([0, 1]);
  });

  it("inserts at an explicit position in the destination column", async () => {
    const b0 = await createTask({ title: "B0", status: "IN_PROGRESS" });
    const b1 = await createTask({ title: "B1", status: "IN_PROGRESS" });
    const a0 = await createTask({ title: "A0", status: "TODO" });

    const res = await patchTask(a0.id, { status: "IN_PROGRESS", position: 1 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(1);

    const listed = await listProjectTasks();
    const inProgress = listed.filter((t) => [b0.id, b1.id, a0.id].includes(t.id));
    expect(inProgress.map((t) => t.id)).toEqual([b0.id, a0.id, b1.id]);
    expect(inProgress.map((t) => t.position)).toEqual([0, 1, 2]);
  });
});

describe("re-parenting", () => {
  it("moves a top-level task into another task's subtask list (task -> subtask)", async () => {
    const parent = await createTask({ title: "Parent" });
    const child0 = await createTask({ title: "ExistingChild", parentTaskId: parent.id });
    const promotable = await createTask({ title: "WillBecomeSubtask" });

    const res = await patchTask(promotable.id, { parentTaskId: parent.id });
    expect(res.status).toBe(200);
    expect(res.body.parentTaskId).toBe(parent.id);
    expect(res.body.position).toBe(1); // appended after child0

    const subtasks = await listProjectTasks(`?parentTaskId=${parent.id}`);
    expect(subtasks.map((t) => t.id)).toEqual([child0.id, promotable.id]);
    expect(subtasks.map((t) => t.position)).toEqual([0, 1]);
  });

  it("promotes a subtask to top-level with an explicit position, keeping its status", async () => {
    const parent = await createTask({ title: "Parent" });
    const sub0 = await createTask({ title: "Sub0", parentTaskId: parent.id, status: "IN_PROGRESS" });
    const sub1 = await createTask({ title: "Sub1", parentTaskId: parent.id, status: "IN_PROGRESS" });

    const topLevelInProgress = await createTask({ title: "TL-IP-0", status: "IN_PROGRESS" });

    const res = await patchTask(sub0.id, { parentTaskId: null, position: 0 });
    expect(res.status).toBe(200);
    expect(res.body.parentTaskId).toBeNull();
    // Subtasks carry their own status; promoting keeps it unless the caller
    // also passes a new status. sub0 was IN_PROGRESS.
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.position).toBe(0);

    const topLevel = await listProjectTasks("?status=IN_PROGRESS");
    const relevant = topLevel.filter((t) => t.parentTaskId === null);
    expect(relevant.map((t) => t.id)).toEqual([sub0.id, topLevelInProgress.id]);

    // Remaining subtask re-packed to position 0.
    const remainingSubtasks = await listProjectTasks(`?parentTaskId=${parent.id}`);
    expect(remainingSubtasks.map((t) => t.id)).toEqual([sub1.id]);
    expect(remainingSubtasks.map((t) => t.position)).toEqual([0]);
  });
});

describe("depth and parent validation", () => {
  it("rejects giving a parent to a task that already has subtasks (depth > 1)", async () => {
    const parent = await createTask({ title: "Parent" });
    await createTask({ title: "Child", parentTaskId: parent.id });
    const other = await createTask({ title: "Other" });

    const res = await patchTask(parent.id, { parentTaskId: other.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("max_depth_exceeded");
  });

  it("rejects setting a parent that itself has a parent (depth > 1)", async () => {
    const grandparent = await createTask({ title: "GP" });
    const parent = await createTask({ title: "P", parentTaskId: grandparent.id });
    const orphan = await createTask({ title: "Orphan" });

    const res = await patchTask(orphan.id, { parentTaskId: parent.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("max_depth_exceeded");
  });

  it("rejects a task being its own parent", async () => {
    const task = await createTask({ title: "Solo" });
    const res = await patchTask(task.id, { parentTaskId: task.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_parent");
  });

  it("rejects a parentTaskId that belongs to a different project", async () => {
    const otherProjectId = await createProject();
    const foreignParentRes = await request(app)
      .post(`/projects/${otherProjectId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "ForeignParent" });
    expect(foreignParentRes.status).toBe(201);
    const foreignParent = foreignParentRes.body as TaskRow;

    const task = await createTask({ title: "Local" });
    const res = await patchTask(task.id, { parentTaskId: foreignParent.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_parent");
  });

  it("rejects cross-project parentTaskId on create", async () => {
    const otherProjectId = await createProject();
    const foreignParentRes = await request(app)
      .post(`/projects/${otherProjectId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "ForeignParent" });
    const foreignParent = foreignParentRes.body as TaskRow;

    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Bad", parentTaskId: foreignParent.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_parent");
  });
});
