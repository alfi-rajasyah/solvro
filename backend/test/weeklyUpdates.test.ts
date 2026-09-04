import "./env.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seedRoles, createAdminAndToken, createUserWithRole } from "./testAuth.js";

const app = createApp();

let token: string;

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  const admin = await createAdminAndToken();
  token = admin.token;
});

async function createCustomer(authToken = token): Promise<number> {
  const res = await request(app)
    .post("/customers")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: `Customer ${Date.now()}-${Math.random()}`, description: "d" });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function createProject(customerId: number, authToken = token): Promise<number> {
  const res = await request(app)
    .post("/projects")
    .set("Authorization", `Bearer ${authToken}`)
    .send({ name: `Project ${Date.now()}-${Math.random()}`, customerId });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("PUT /customers/:id/weekly-updates/:weekStart", () => {
  it("creates (201) then updates (200) the same row", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const created = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "First draft", status: "DRAFT" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const updated = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Second draft", status: "DRAFT" });
    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(id);
    expect(updated.body.achievement).toBe("Second draft");
  });

  it("rejects a non-Monday weekStart with 400 week_start_not_monday", async () => {
    const customerId = await createCustomer();
    // 2026-08-25 is a Tuesday.
    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/2026-08-25`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "x", status: "DRAFT" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("week_start_not_monday");
  });

  it("rejects an invalid day string with 400", async () => {
    const customerId = await createCustomer();
    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/not-a-date`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "x", status: "DRAFT" });
    expect(res.status).toBe(400);
  });

  it("rejects DONE without health, and DONE with a whitespace-only achievement: 400 weekly_update_incomplete", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const noHealth = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Ready to ship", status: "DONE" });
    expect(noHealth.status).toBe(400);
    expect(noHealth.body.code).toBe("weekly_update_incomplete");

    const emptyAchievement = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "   ", status: "DONE", health: "GREEN" });
    expect(emptyAchievement.status).toBe(400);
    expect(emptyAchievement.body.code).toBe("weekly_update_incomplete");
  });

  it("sets doneAt on DONE and clears it moving back to DRAFT", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const done = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipping this week", status: "DONE", health: "GREEN" });
    expect(done.status).toBe(201);
    expect(done.body.status).toBe("DONE");
    expect(done.body.doneAt).not.toBeNull();

    const reopened = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Reopened", status: "DRAFT" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("DRAFT");
    expect(reopened.body.doneAt).toBeNull();
  });

  it("does not re-stamp doneAt on a re-save of an already-DONE row, but stamps a new one re-entering DONE", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const done = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipping this week", status: "DONE", health: "GREEN" });
    expect(done.status).toBe(201);
    const firstDoneAt = done.body.doneAt;
    expect(firstDoneAt).not.toBeNull();

    // Small delay so a re-stamp (if it happened) would produce a different
    // timestamp — this only guards against a false negative, not required
    // for correctness of the fix itself.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const resaved = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipping this week (typo fix)", status: "DONE", health: "GREEN" });
    expect(resaved.status).toBe(200);
    expect(resaved.body.doneAt).toBe(firstDoneAt);

    const reopened = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Back to draft", status: "DRAFT" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.doneAt).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const doneAgain = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Done again", status: "DONE", health: "AMBER" });
    expect(doneAgain.status).toBe(200);
    expect(doneAgain.body.doneAt).not.toBeNull();
    expect(doneAgain.body.doneAt).not.toBe(firstDoneAt);
  });

  it("leaves a stored health unchanged when the body omits it, but clears it on explicit null", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const created = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "First draft", status: "DRAFT", health: "AMBER" });
    expect(created.status).toBe(201);
    expect(created.body.health).toBe("AMBER");

    const omitted = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Second draft", status: "DRAFT" });
    expect(omitted.status).toBe(200);
    expect(omitted.body.health).toBe("AMBER");

    const cleared = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Third draft", status: "DRAFT", health: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.health).toBeNull();
  });

  it("accepts NOT_STARTED: row is kept, doneAt null, status echoed", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "", status: "NOT_STARTED" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("NOT_STARTED");
    expect(res.body.doneAt).toBeNull();

    const list = await request(app)
      .get(`/customers/${customerId}/weekly-updates`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].status).toBe("NOT_STARTED");
  });

  it("lists weekly updates ordered weekStart desc with a limit", async () => {
    const customerId = await createCustomer();
    const mondays = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];
    for (const monday of mondays) {
      const res = await request(app)
        .put(`/customers/${customerId}/weekly-updates/${monday}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ achievement: `Update for ${monday}`, status: "DRAFT" });
      expect(res.status).toBe(201);
    }

    const list = await request(app)
      .get(`/customers/${customerId}/weekly-updates`)
      .query({ limit: 2 })
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].weekStart.slice(0, 10)).toBe("2026-08-24");
    expect(list.body[1].weekStart.slice(0, 10)).toBe("2026-08-17");
  });

  it("a partial save (only highlight) leaves a previously saved achievement, health and status unchanged", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const created = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipped the migration", health: "GREEN", status: "DRAFT" });
    expect(created.status).toBe(201);

    const partial = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ highlight: "New integration landed" });
    expect(partial.status).toBe(200);
    expect(partial.body.highlight).toBe("New integration landed");
    expect(partial.body.achievement).toBe("Shipped the migration");
    expect(partial.body.health).toBe("GREEN");
    expect(partial.body.status).toBe("DRAFT");
  });

  it("stores a whitespace-only risk as null and a padded category trimmed", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "  Ops Review  ", risk: "   " });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("Ops Review");
    expect(res.body.risk).toBeNull();
  });

  it("rejects a category longer than 120 characters with 400", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "x".repeat(121) });
    expect(res.status).toBe(400);
  });

  it("trims category before the 120-character check, so trailing padding doesn't push it over", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "x".repeat(120) + "  " });
    expect(res.status).toBe(201);
    expect(res.body.category).toHaveLength(120);
  });

  it("stamps midweekSavedAt only when the body carries a Mid-week field", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const reflectionOnly = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipped it", outstandingIssue: "None" });
    expect(reflectionOnly.status).toBe(201);
    expect(reflectionOnly.body.midweekSavedAt).toBeNull();

    const midweekTouch = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: null });
    expect(midweekTouch.status).toBe(200);
    expect(midweekTouch.body.midweekSavedAt).not.toBeNull();
    expect(midweekTouch.body.action).toBeNull();
  });

  it("keeps DONE and its doneAt when a Mid-week save omits status", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const done = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ achievement: "Shipped this week", status: "DONE", health: "GREEN" });
    expect(done.status).toBe(201);
    expect(done.body.status).toBe("DONE");
    const doneAt = done.body.doneAt;
    expect(doneAt).not.toBeNull();

    const midweekEdit = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ highlight: "Late Wednesday note" });
    expect(midweekEdit.status).toBe(200);
    expect(midweekEdit.body.status).toBe("DONE");
    expect(midweekEdit.body.doneAt).toBe(doneAt);
  });

  it("list endpoint returns all nine text fields and midweekSavedAt", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const saved = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "Ops",
        highlight: "Highlight text",
        risk: "Risk text",
        action: "Action text",
        achievement: "Achievement text",
        outstandingIssue: "Outstanding text",
        lessonLearned: "Lesson text",
        nextWeekFocus: "Focus text",
        managerDecision: "Decision text",
      });
    expect(saved.status).toBe(201);

    const list = await request(app)
      .get(`/customers/${customerId}/weekly-updates`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const row = list.body[0];
    expect(row.category).toBe("Ops");
    expect(row.highlight).toBe("Highlight text");
    expect(row.risk).toBe("Risk text");
    expect(row.action).toBe("Action text");
    expect(row.achievement).toBe("Achievement text");
    expect(row.outstandingIssue).toBe("Outstanding text");
    expect(row.lessonLearned).toBe("Lesson text");
    expect(row.nextWeekFocus).toBe("Focus text");
    expect(row.managerDecision).toBe("Decision text");
    expect(row.midweekSavedAt).not.toBeNull();
  });

  it("rejects DONE when achievement is stored null even with health present, and accepts it once achievement is supplied", async () => {
    const customerId = await createCustomer();
    const monday = "2026-08-24";

    const draft = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ health: "GREEN", status: "DRAFT" });
    expect(draft.status).toBe(201);
    expect(draft.body.achievement).toBeNull();

    const rejected = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "DONE" });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("weekly_update_incomplete");

    const accepted = await request(app)
      .put(`/customers/${customerId}/weekly-updates/${monday}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "DONE", achievement: "Finally shipped" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("DONE");
    expect(accepted.body.achievement).toBe("Finally shipped");
  });

  it("STAKEHOLDER gets 403 saving a weekly update", async () => {
    const customerId = await createCustomer();
    const stakeholder = await createUserWithRole("STAKEHOLDER");
    const res = await request(app)
      .put(`/customers/${customerId}/weekly-updates/2026-08-24`)
      .set("Authorization", `Bearer ${stakeholder.token}`)
      .send({ achievement: "x", status: "DRAFT" });
    expect(res.status).toBe(403);
  });

  it("PENDING (zero-permission) gets 403 reading weekly updates and operations notes", async () => {
    const customerId = await createCustomer();
    const pending = await createUserWithRole("PENDING");

    const weeklyRes = await request(app)
      .get(`/customers/${customerId}/weekly-updates`)
      .set("Authorization", `Bearer ${pending.token}`);
    expect(weeklyRes.status).toBe(403);

    const notesRes = await request(app)
      .get(`/customers/${customerId}/notes`)
      .set("Authorization", `Bearer ${pending.token}`);
    expect(notesRes.status).toBe(403);
  });
});

describe("admin user-delete blockers for notes/weekly updates", () => {
  it("blocks deleting a user who wrote a weekly update: 400 user_in_use", async () => {
    const author = await createUserWithRole("TAM");
    const customerId = await createCustomer(author.token);
    const saved = await request(app)
      .put(`/customers/${customerId}/weekly-updates/2026-08-24`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ achievement: "Weekly note", status: "DRAFT" });
    expect(saved.status).toBe(201);

    const del = await request(app)
      .delete(`/admin/users/${author.userId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(400);
    expect(del.body.code).toBe("user_in_use");
    expect(del.body.error).toMatch(/weekly update/);
  });

  it("blocks deleting a user who wrote a project note: 400 user_in_use", async () => {
    const author = await createUserWithRole("TAM");
    const customerId = await createCustomer(author.token);
    // Created by the author so the default tamId (= creator) makes the
    // project visible to them for the note POST below.
    const projectId = await createProject(customerId, author.token);
    const noteRes = await request(app)
      .post(`/projects/${projectId}/notes`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ body: "Daily note" });
    expect(noteRes.status).toBe(201);

    const del = await request(app)
      .delete(`/admin/users/${author.userId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(400);
    expect(del.body.code).toBe("user_in_use");
    expect(del.body.error).toMatch(/daily note/);
  });
});
