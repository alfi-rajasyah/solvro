import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/http/auth.js";
import { seedRoles } from "./testAuth.js";
import { REASONS_BY_OUTCOME } from "../src/routes/opportunities.js";

// POST /opportunities/:id/close and /:id/reopen (opportunity-flow-redesign
// §3.5, D5 — one Close deal action for Won/Lost/Cancelled; the stage a deal
// reached is locked, never reset). House pattern: a local, per-test
// permission-set helper mirroring opportunities.test.ts rather than
// testAuth.ts's fixed SA/Manager shapes.

const app = createApp();

let roleCounter = 0;

async function createUserWithPermissions(
  permissions: string[],
): Promise<{ userId: number; username: string; token: string }> {
  roleCounter += 1;
  const role = await prisma.role.create({
    data: { roleName: `test-close-role-${roleCounter}-${Date.now()}`, permissions },
  });
  const username = `test-close-user-${roleCounter}-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `test-close-user-${roleCounter}-${Date.now()}@example.com`,
      passwordHash: null,
      roleId: role.id,
      active: true,
    },
  });
  const token = signToken({ sub: user.id, role: role.roleName, permissions });
  return { userId: user.id, username: user.username, token };
}

async function createSaLikeUser(): Promise<{ userId: number; username: string; token: string }> {
  return createUserWithPermissions([
    "pipeline:view",
    "pipeline:create",
    "pipeline:edit_own",
    "pipeline:delete_own",
  ]);
}

function createOpportunity(token: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post("/opportunities")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Close Test Deal", customerName: "Acme Corp", ...body });
}

function getOpportunity(token: string, id: string) {
  return request(app).get(`/opportunities/${id}`).set("Authorization", `Bearer ${token}`);
}

function closeOpportunity(token: string, id: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/opportunities/${id}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function reopenOpportunity(token: string, id: string) {
  return request(app)
    .post(`/opportunities/${id}/reopen`)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

async function activitiesFor(opportunityId: string) {
  return prisma.opportunityActivity.findMany({
    where: { opportunityId },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  await seedRoles();
});

describe("REASONS_BY_OUTCOME", () => {
  it("restricts LOST and CANCELLED to their own subsets, both including OTHER", () => {
    expect(REASONS_BY_OUTCOME.LOST).toEqual(["PRICE", "COMPETITOR", "TECHNICAL", "OTHER"]);
    expect(REASONS_BY_OUTCOME.CANCELLED).toEqual([
      "BUDGET_WITHDRAWN",
      "PROJECT_CANCELLED",
      "LOST_CONTACT",
      "OTHER",
    ]);
  });
});

describe("POST /opportunities/:id/close — Won", () => {
  it("sets outcome/closedAt/wonAt, clears the open-deal flags, logs 'Closed as Won', and leaves stage/stageOrder untouched", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    const stageOrderBefore = created.body.stageOrder as number;
    await request(app)
      .patch(`/opportunities/${id}`)
      .set("Authorization", `Bearer ${sa.token}`)
      .send({ statusTag: "HOLD" });

    const res = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("WON");
    expect(res.body.closedAt).not.toBeNull();
    expect(res.body.wonAt).not.toBeNull();
    expect(res.body.subStatus).toBeNull();
    expect(res.body.statusTag).toBeNull();
    expect(res.body.waitingInputSince).toBeNull();
    // D5: the stage a deal reached is locked, never reset.
    expect(res.body.stage).toBe("RFP");
    expect(res.body.stageOrder).toBe(stageOrderBefore);
    expect(res.body.idle).toEqual({ level: "none", days: 0, basis: null });

    const activities = await activitiesFor(id);
    expect(activities[activities.length - 1].note).toBe("Closed as Won");
  });

  it("400s (reason_not_allowed) a Won close carrying a reasonCategory or a note", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const withCategory = await closeOpportunity(sa.token, id, { outcome: "WON", reasonCategory: "OTHER" });
    expect(withCategory.status).toBe(400);
    expect(withCategory.body.code).toBe("reason_not_allowed");

    const withNote = await closeOpportunity(sa.token, id, { outcome: "WON", reason: "Some note" });
    expect(withNote.status).toBe(400);
    expect(withNote.body.code).toBe("reason_not_allowed");
  });
});

describe("POST /opportunities/:id/close — Lost", () => {
  it("400s (reason_required) without a reasonCategory", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, { outcome: "LOST" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("reason_required");
  });

  it("400s (reason_category_invalid) a Cancelled-only category on a Lost close", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, { outcome: "LOST", reasonCategory: "BUDGET_WITHDRAWN" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("reason_category_invalid");
  });

  it("200s with a valid category, writing 'Closed as Lost (Competitor)'", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, { outcome: "LOST", reasonCategory: "COMPETITOR" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("LOST");
    expect(res.body.outcomeReasonCategory).toBe("COMPETITOR");
    expect(res.body.wonAt).toBeNull();

    const activities = await activitiesFor(id);
    expect(activities[activities.length - 1].note).toBe("Closed as Lost (Competitor)");
  });
});

describe("POST /opportunities/:id/close — Cancelled", () => {
  it("200s with a category + note, appending the note to the activity text", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, {
      outcome: "CANCELLED",
      reasonCategory: "PROJECT_CANCELLED",
      reason: "Client paused all IT spend for the quarter",
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("CANCELLED");
    expect(res.body.outcomeReason).toBe("Client paused all IT spend for the quarter");

    const activities = await activitiesFor(id);
    expect(activities[activities.length - 1].note).toBe(
      "Closed as Cancelled (Project cancelled): Client paused all IT spend for the quarter",
    );
  });

  it("omits the note suffix when no note is given", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, {
      outcome: "CANCELLED",
      reasonCategory: "LOST_CONTACT",
    });
    expect(res.status).toBe(200);

    const activities = await activitiesFor(id);
    expect(activities[activities.length - 1].note).toBe("Closed as Cancelled (Lost contact)");
  });

  it("400s an empty-string reason (N7) — omit the field entirely for no note", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, {
      outcome: "CANCELLED",
      reasonCategory: "LOST_CONTACT",
      reason: "",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /opportunities/:id/close — already closed / ownership", () => {
  it("409s (already_closed) closing a deal twice", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    const first = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(first.status).toBe(200);

    const second = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("already_closed");
  });

  it("403s an edit_own holder closing another PIC's deal", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(other.token, id, { outcome: "WON" });
    expect(res.status).toBe(403);
  });

  it("400s an unknown outcome literal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, { outcome: "ARCHIVED" });
    expect(res.status).toBe(400);
  });

  it("400s a body with an extra key — .strict()", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await closeOpportunity(sa.token, id, { outcome: "WON", stage: "ASSESSMENT" });
    expect(res.status).toBe(400);
  });
});

describe("POST /opportunities/:id/reopen", () => {
  it("clears the outcome group, restores subStatus PROGRESS on an open-funnel stage, and logs 'Reopened'", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await closeOpportunity(sa.token, id, { outcome: "LOST", reasonCategory: "PRICE" });

    const res = await reopenOpportunity(sa.token, id);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBeNull();
    expect(res.body.outcomeReasonCategory).toBeNull();
    expect(res.body.outcomeReason).toBeNull();
    expect(res.body.closedAt).toBeNull();
    expect(res.body.wonAt).toBeNull();
    expect(res.body.subStatus).toBe("PROGRESS");
    // The stage stays exactly where it was closed (D5) — reopen doesn't move it.
    expect(res.body.stage).toBe("RFP");

    const activities = await activitiesFor(id);
    expect(activities[activities.length - 1].note).toBe("Reopened");
  });

  it("restores subStatus null on a Waiting Response deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const id = created.body.id as string;
    await closeOpportunity(sa.token, id, { outcome: "WON" });

    const res = await reopenOpportunity(sa.token, id);
    expect(res.status).toBe(200);
    expect(res.body.subStatus).toBeNull();
    expect(res.body.owner).toBe("client");
  });

  it("409s (not_closed) reopening an open deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await reopenOpportunity(sa.token, id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_closed");
  });

  it("409s (handed_off) reopening a deal already linked to a project", async () => {
    const sa = await createUserWithPermissions([
      "pipeline:view",
      "pipeline:create",
      "pipeline:edit_all",
      "project:write",
    ]);
    const customer = await prisma.customer.create({
      data: { name: `Reopen Handoff Co ${Date.now()}`, description: "d" },
    });
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const id = created.body.id as string;
    await closeOpportunity(sa.token, id, { outcome: "WON" });

    const handoff = await request(app)
      .post(`/opportunities/${id}/handoff`)
      .set("Authorization", `Bearer ${sa.token}`)
      .send({ name: "Reopen Handoff Project", customerId: customer.id });
    expect(handoff.status).toBe(201);

    const res = await reopenOpportunity(sa.token, id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("handed_off");

    // Untouched — still closed as Won, still linked.
    const fetched = await getOpportunity(sa.token, id);
    expect(fetched.body.outcome).toBe("WON");
    expect(fetched.body.projectId).not.toBeNull();
  });

  it("403s an edit_own holder reopening another PIC's deal", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId, stage: "RFP" });
    const id = created.body.id as string;
    await closeOpportunity(owner.token, id, { outcome: "WON" });

    const res = await reopenOpportunity(other.token, id);
    expect(res.status).toBe(403);
  });
});

describe("POST /opportunities/:id/move — a reopened deal moves again", () => {
  it("clears the closed 409 once reopened", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await closeOpportunity(sa.token, id, { outcome: "LOST", reasonCategory: "PRICE" });
    await reopenOpportunity(sa.token, id);

    const res = await request(app)
      .post(`/opportunities/${id}/move`)
      .set("Authorization", `Bearer ${sa.token}`)
      .send({ stage: "ASSESSMENT", stageOrder: 0 });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("ASSESSMENT");
  });
});
