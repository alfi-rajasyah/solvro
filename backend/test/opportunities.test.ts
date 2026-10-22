import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/http/auth.js";
import { seedRoles } from "./testAuth.js";

const app = createApp();

let roleCounter = 0;

// test/testAuth.ts's SA role mirror already carries the pipeline:* grants,
// in sync with prisma/seed.ts. A one-off role per test isn't a workaround
// for a missing grant — it keeps each test exact about which permission
// combination it exercises (e.g. edit_own vs edit_all) rather than coupling
// to testAuth.ts's fixed SA/Manager shape.
async function createUserWithPermissions(
  permissions: string[],
): Promise<{ userId: number; username: string; token: string }> {
  roleCounter += 1;
  const role = await prisma.role.create({
    data: { roleName: `test-opp-role-${roleCounter}-${Date.now()}`, permissions },
  });
  const username = `test-opp-user-${roleCounter}-${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `test-opp-user-${roleCounter}-${Date.now()}@example.com`,
      passwordHash: null,
      roleId: role.id,
      active: true,
    },
  });
  const token = signToken({ sub: user.id, ver: 0 });
  return { userId: user.id, username: user.username, token };
}

// Mirrors the real SA role's pipeline grants (view/create/edit_own/delete_own).
async function createSaLikeUser(): Promise<{ userId: number; username: string; token: string }> {
  return createUserWithPermissions([
    "pipeline:view",
    "pipeline:create",
    "pipeline:edit_own",
    "pipeline:delete_own",
  ]);
}

// Mirrors the plan's "SA Manager" custom role (edit_all/delete_all, granted
// as explicit strings — not the "*" wildcard — so these tests exercise the
// actual permission-string path, not just hasPermission's wildcard shortcut).
async function createManagerLikeUser(): Promise<{ userId: number; username: string; token: string }> {
  return createUserWithPermissions([
    "pipeline:view",
    "pipeline:create",
    "pipeline:edit_all",
    "pipeline:delete_all",
  ]);
}

function createOpportunity(token: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post("/opportunities")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Test Deal", customerName: "Acme Corp", ...body });
}

function getOpportunity(token: string, id: string) {
  return request(app).get(`/opportunities/${id}`).set("Authorization", `Bearer ${token}`);
}

function patchOpportunity(token: string, id: string, body: Record<string, unknown>) {
  return request(app)
    .patch(`/opportunities/${id}`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function moveOpportunity(token: string, id: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/opportunities/${id}/move`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function closeOpportunity(token: string, id: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/opportunities/${id}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function deleteOpportunity(token: string, id: string) {
  return request(app).delete(`/opportunities/${id}`).set("Authorization", `Bearer ${token}`);
}

function assignOpportunity(token: string, id: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/opportunities/${id}/assign`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

async function activitiesFor(opportunityId: string) {
  // The "Created" sentence a new deal now opens its timeline with is asserted
  // in opportunityActivity.test.ts; the sentences under test here follow it.
  return prisma.opportunityActivity.findMany({
    where: { opportunityId, NOT: { note: "Created" } },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  await seedRoles();
});

describe("POST /opportunities/:id/move — stage transitions", () => {
  it("moves between any two of the 6 stages (D4, no forward-only enforcement) and logs a human-readable activity", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "ASSESSMENT" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // ASSESSMENT -> RFP: not the guarded TC -> RFP jump, so no reason needed.
    const moved = await moveOpportunity(sa.token, id, { stage: "RFP", stageOrder: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.stage).toBe("RFP");

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe("Moved from Assessment to RFP");
    expect(activities[0].userId).toBe(sa.userId);

    // Backward move (D4's default: backward moves allowed).
    const movedBack = await moveOpportunity(sa.token, id, { stage: "ASSESSMENT", stageOrder: 0 });
    expect(movedBack.status).toBe(200);
    expect(movedBack.body.stage).toBe("ASSESSMENT");
    const activitiesAfter = await activitiesFor(id);
    expect(activitiesAfter).toHaveLength(2);
    expect(activitiesAfter[1].note).toBe("Moved from RFP to Assessment");
  });

  it("a same-stage reorder logs no activity and leaves lastActivityAt untouched (D15)", async () => {
    const sa = await createSaLikeUser();
    // POC: untouched by any earlier test in this describe block — bottom-
    // append semantics (S6) make a fresh stage's absolute stageOrder
    // assertions the only reliable ones in a suite that shares one DB
    // across `it` blocks.
    const first = await createOpportunity(sa.token, { picId: sa.userId, stage: "POC" });
    const second = await createOpportunity(sa.token, { picId: sa.userId, stage: "POC" });
    const firstId = first.body.id as string;
    const secondId = second.body.id as string;
    // Both created "at the bottom" of POC: first appended first at
    // stageOrder 0, second lands after it at 1 (S6 — append-at-bottom).
    expect((await getOpportunity(sa.token, firstId)).body.stageOrder).toBe(0);
    expect((await getOpportunity(sa.token, secondId)).body.stageOrder).toBe(1);

    const before = await getOpportunity(sa.token, secondId);
    const reordered = await moveOpportunity(sa.token, secondId, { stage: "POC", stageOrder: 0 });
    expect(reordered.status).toBe(200);
    expect(reordered.body.stage).toBe("POC");
    expect(reordered.body.stageOrder).toBe(0);
    // D15: a same-stage reorder isn't activity — lastActivityAt stays
    // exactly what it was before the reorder.
    expect(reordered.body.lastActivityAt).toBe(before.body.lastActivityAt);

    const activities = await activitiesFor(secondId);
    expect(activities).toHaveLength(0);

    // The sibling list re-packed dense 0..1 with second now on top and
    // first pushed down.
    expect((await getOpportunity(sa.token, firstId)).body.stageOrder).toBe(1);
  });
});

describe("POST /opportunities/:id/move — Technical Clarification -> RFP skip-reason (D4)", () => {
  it("400s (skip_reason_required) without a reason", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, {
      picId: sa.userId,
      stage: "TECHNICAL_CLARIFICATION",
    });
    const id = created.body.id as string;

    const res = await moveOpportunity(sa.token, id, { stage: "RFP", stageOrder: 0 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("skip_reason_required");

    const unchanged = await getOpportunity(sa.token, id);
    expect(unchanged.body.stage).toBe("TECHNICAL_CLARIFICATION");
  });

  it("200s with a reason and carries it into the activity note", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, {
      picId: sa.userId,
      stage: "TECHNICAL_CLARIFICATION",
    });
    const id = created.body.id as string;

    const res = await moveOpportunity(sa.token, id, {
      stage: "RFP",
      stageOrder: 0,
      reason: "Client skipped PoC — budget already approved",
    });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("RFP");

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe(
      "Moved from Technical Clarification to RFP, PoC skipped: Client skipped PoC — budget already approved",
    );
  });

  it("does not require a reason for any other transition, including RFP -> Technical Clarification", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await moveOpportunity(sa.token, id, { stage: "TECHNICAL_CLARIFICATION", stageOrder: 0 });
    expect(res.status).toBe(200);
  });
});

describe("POST /opportunities/:id/move — Waiting Response subStatus bookkeeping (D3)", () => {
  it("clears subStatus and waitingInputSince on entering Waiting Response", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    expect(created.body.subStatus).toBe("PROGRESS");

    const patched = await patchOpportunity(sa.token, id, { subStatus: "WAITING_SALES_INPUT" });
    expect(patched.status).toBe(200);
    expect(patched.body.waitingInputSince).not.toBeNull();

    const moved = await moveOpportunity(sa.token, id, { stage: "WAITING_RESPONSE", stageOrder: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.subStatus).toBeNull();
    expect(moved.body.waitingInputSince).toBeNull();
    expect(moved.body.owner).toBe("client");
  });

  it("sets subStatus back to PROGRESS on leaving Waiting Response", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const id = created.body.id as string;
    expect(created.body.subStatus).toBeNull();

    const moved = await moveOpportunity(sa.token, id, { stage: "DELIVER_PROPOSAL", stageOrder: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.subStatus).toBe("PROGRESS");
    expect(moved.body.owner).toBe("sa");
  });
});

describe("POST /opportunities/:id/move — closed deals (D5)", () => {
  it("409s (closed) a move on a deal already closed", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const id = created.body.id as string;
    const closed = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(closed.status).toBe(200);

    const res = await moveOpportunity(sa.token, id, { stage: "ASSESSMENT", stageOrder: 0 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("closed");
  });
});

describe("PATCH /opportunities/:id — edit_own / edit_all gate", () => {
  it("lets an edit_own holder patch their own deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { title: "Renamed Deal" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed Deal");
  });

  it("403s an edit_own holder patching another PIC's deal", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(other.token, id, { title: "Hijacked" });
    expect(res.status).toBe(403);

    const stillOriginal = await getOpportunity(owner.token, id);
    expect(stillOriginal.body.title).toBe("Test Deal");
  });

  it("lets an edit_all holder patch any deal regardless of PIC", async () => {
    const owner = await createSaLikeUser();
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(manager.token, id, { title: "Manager Edit" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Manager Edit");
  });

  it("rejects a PATCH body containing stage with a 400 — stage changes only go through /move", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "ASSESSMENT" });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { stage: "WON" });
    expect(res.status).toBe(400);

    const unchanged = await getOpportunity(sa.token, id);
    expect(unchanged.body.stage).toBe("ASSESSMENT");
  });
});

describe("PATCH /opportunities/:id — subStatus (§3.3)", () => {
  it("sets waitingInputSince and writes 'Waiting for Sales input' on a real transition into WAITING_SALES_INPUT", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    expect(created.body.subStatus).toBe("PROGRESS");
    expect(created.body.waitingInputSince).toBeNull();

    const res = await patchOpportunity(sa.token, id, { subStatus: "WAITING_SALES_INPUT" });
    expect(res.status).toBe(200);
    expect(res.body.subStatus).toBe("WAITING_SALES_INPUT");
    expect(res.body.waitingInputSince).not.toBeNull();

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe("Waiting for Sales input");
  });

  it("clears waitingInputSince and writes 'Input received' on a real transition back to PROGRESS", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await patchOpportunity(sa.token, id, { subStatus: "WAITING_SALES_INPUT" });

    const res = await patchOpportunity(sa.token, id, { subStatus: "PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.subStatus).toBe("PROGRESS");
    expect(res.body.waitingInputSince).toBeNull();

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(2);
    expect(activities[1].note).toBe("Input received");
  });

  it("repeating the same subStatus is a true no-op — no note written", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { subStatus: "PROGRESS" });
    expect(res.status).toBe(200);
    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(0);
  });

  it("400s (sub_status_not_allowed) setting a non-null subStatus on a Waiting Response deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { subStatus: "WAITING_SALES_INPUT" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("sub_status_not_allowed");
  });

  it("400s (deal_closed) setting subStatus on a closed deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    const closed = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(closed.status).toBe(200);

    const res = await patchOpportunity(sa.token, id, { subStatus: "WAITING_SALES_INPUT" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("deal_closed");
  });
});

describe("PATCH /opportunities/:id — statusTag (§3.3)", () => {
  it("writes 'Put on hold' / 'Hold released' around a HOLD transition", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const held = await patchOpportunity(sa.token, id, { statusTag: "HOLD" });
    expect(held.status).toBe(200);
    expect(held.body.statusTag).toBe("HOLD");

    const released = await patchOpportunity(sa.token, id, { statusTag: null });
    expect(released.status).toBe(200);
    expect(released.body.statusTag).toBeNull();

    const activities = await activitiesFor(id);
    expect(activities.map((a) => a.note)).toEqual(["Put on hold", "Hold released"]);
  });

  it("writes 'Marked as delayed' / 'Delay cleared' around a DELAYED transition", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;

    const delayed = await patchOpportunity(sa.token, id, { statusTag: "DELAYED" });
    expect(delayed.status).toBe(200);

    const cleared = await patchOpportunity(sa.token, id, { statusTag: null });
    expect(cleared.status).toBe(200);

    const activities = await activitiesFor(id);
    expect(activities.map((a) => a.note)).toEqual(["Marked as delayed", "Delay cleared"]);
  });

  it("a Hold -> Delayed swap writes both 'Hold released' and 'Marked as delayed', in that order (N5)", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await patchOpportunity(sa.token, id, { statusTag: "HOLD" });

    const swapped = await patchOpportunity(sa.token, id, { statusTag: "DELAYED" });
    expect(swapped.status).toBe(200);
    expect(swapped.body.statusTag).toBe("DELAYED");

    const activities = await activitiesFor(id);
    expect(activities.map((a) => a.note)).toEqual(["Put on hold", "Hold released", "Marked as delayed"]);
  });

  it("a Delayed -> Hold swap writes both 'Delay cleared' and 'Put on hold', in that order (N5)", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await patchOpportunity(sa.token, id, { statusTag: "DELAYED" });

    const swapped = await patchOpportunity(sa.token, id, { statusTag: "HOLD" });
    expect(swapped.status).toBe(200);
    expect(swapped.body.statusTag).toBe("HOLD");

    const activities = await activitiesFor(id);
    expect(activities.map((a) => a.note)).toEqual(["Marked as delayed", "Delay cleared", "Put on hold"]);
  });

  it("400s (deal_closed) setting statusTag on a closed deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const id = created.body.id as string;
    await closeOpportunity(sa.token, id, { outcome: "WON" });

    const res = await patchOpportunity(sa.token, id, { statusTag: "HOLD" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("deal_closed");
  });
});

describe("DELETE /opportunities/:id — closes the stage-order gap it leaves (S4)", () => {
  it("re-packs the stage densely after deleting a middle sibling, so the next create/import lands last", async () => {
    const sa = await createSaLikeUser();
    // Reads the current count first rather than assuming WAITING_RESPONSE is
    // untouched — this describe block runs after several earlier tests in
    // this file that create/move rows into WAITING_RESPONSE (D3's owner/
    // subStatus coverage), so an absolute 0/1/2 assumption would be exactly
    // the order-dependent trap docs/ISSUES.md:196 flagged for a different
    // stage/test (fix direction generalized here too).
    const before = await prisma.opportunity.count({ where: { stage: "WAITING_RESPONSE" } });
    const first = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const middle = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const last = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    const firstId = first.body.id as string;
    const middleId = middle.body.id as string;
    const lastId = last.body.id as string;
    // Appended at the bottom in creation order: first, middle, last.
    expect((await getOpportunity(sa.token, firstId)).body.stageOrder).toBe(before);
    expect((await getOpportunity(sa.token, middleId)).body.stageOrder).toBe(before + 1);
    expect((await getOpportunity(sa.token, lastId)).body.stageOrder).toBe(before + 2);

    const deleted = await deleteOpportunity(sa.token, middleId);
    expect(deleted.status).toBe(204);

    // Without the gap-close, `last` would still sit at its old stageOrder (a
    // hole where `middle` was) and a naive count()-based append would hand
    // the next row that same slot, colliding with `last`.
    expect((await getOpportunity(sa.token, firstId)).body.stageOrder).toBe(before);
    expect((await getOpportunity(sa.token, lastId)).body.stageOrder).toBe(before + 1);

    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });
    expect(created.status).toBe(201);
    expect(created.body.stageOrder).toBe(before + 2);

    const imported = await request(app)
      .post("/opportunities/import")
      .set("Authorization", `Bearer ${sa.token}`)
      .send({
        rows: [
          {
            title: "ImpTest S4 Gap",
            customerName: "ImpTest S4 Gap Co",
            stage: "waiting_response",
          },
        ],
      });
    expect(imported.status).toBe(200);
    expect(imported.body.validCount).toBe(1);
    const importedId = imported.body.results[0].id as string;
    expect((await getOpportunity(sa.token, importedId)).body.stageOrder).toBe(before + 3);
  });
});

describe("DELETE /opportunities/:id — delete_own / delete_all gate", () => {
  it("lets a delete_own holder delete their own deal", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await deleteOpportunity(sa.token, id);
    expect(res.status).toBe(204);

    const gone = await getOpportunity(sa.token, id);
    expect(gone.status).toBe(404);
  });

  it("403s a delete_own holder deleting another PIC's deal", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await deleteOpportunity(other.token, id);
    expect(res.status).toBe(403);

    const stillThere = await getOpportunity(owner.token, id);
    expect(stillThere.status).toBe(200);
  });

  it("lets a delete_all holder delete any deal regardless of PIC", async () => {
    const owner = await createSaLikeUser();
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await deleteOpportunity(manager.token, id);
    expect(res.status).toBe(204);
  });
});

describe("dealValue BigInt round-trip", () => {
  it("a BigInt dealValue survives POST -> GET as a plain JSON number", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { dealValue: 250_000_000_000 });
    expect(created.status).toBe(201);
    expect(created.body.dealValue).toBe(250_000_000_000);
    expect(typeof created.body.dealValue).toBe("number");

    const fetched = await getOpportunity(sa.token, created.body.id as string);
    expect(fetched.status).toBe(200);
    expect(fetched.body.dealValue).toBe(250_000_000_000);
    expect(typeof fetched.body.dealValue).toBe("number");
  });

  it("defaults dealValue to 0 when omitted", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, {});
    expect(created.status).toBe(201);
    expect(created.body.dealValue).toBe(0);
  });
});

describe("GET /opportunities — list + view gate", () => {
  it("403s a caller without pipeline:view", async () => {
    const noPerms = await createUserWithPermissions([]);
    const res = await request(app).get("/opportunities").set("Authorization", `Bearer ${noPerms.token}`);
    expect(res.status).toBe(403);
  });

  it("lists opportunities ordered by stage then stageOrder, each with its pic", async () => {
    const sa = await createSaLikeUser();
    const a = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP", title: "A" });
    const b = await createOpportunity(sa.token, { picId: sa.userId, stage: "ASSESSMENT", title: "B" });

    const res = await request(app).get("/opportunities").set("Authorization", `Bearer ${sa.token}`);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((o) => o.id);
    // ASSESSMENT sorts before RFP per the enum's declared order.
    expect(ids.indexOf(b.body.id as string)).toBeLessThan(ids.indexOf(a.body.id as string));

    const found = (res.body as { id: string; pic: { id: number } | null }[]).find(
      (o) => o.id === (a.body.id as string),
    );
    expect(found?.pic).toEqual({ id: sa.userId, username: expect.any(String), avatarUrl: null });
  });

  it("serializes owner per stage and an idle object on both list and detail (§3.1, D3, §3.6)", async () => {
    const sa = await createSaLikeUser();
    const saOwned = await createOpportunity(sa.token, { picId: sa.userId, stage: "RFP" });
    const clientOwned = await createOpportunity(sa.token, { picId: sa.userId, stage: "WAITING_RESPONSE" });

    const list = await request(app).get("/opportunities").set("Authorization", `Bearer ${sa.token}`);
    expect(list.status).toBe(200);
    const rows = list.body as { id: string; owner: string; idle: { level: string; days: number; basis: unknown } }[];
    const saRow = rows.find((o) => o.id === saOwned.body.id);
    const clientRow = rows.find((o) => o.id === clientOwned.body.id);
    expect(saRow?.owner).toBe("sa");
    expect(clientRow?.owner).toBe("client");
    expect(saRow?.idle).toMatchObject({ level: expect.any(String), days: expect.any(Number) });
    expect(clientRow?.idle).toMatchObject({ level: expect.any(String), days: expect.any(Number) });

    const detail = await getOpportunity(sa.token, saOwned.body.id as string);
    expect(detail.body.owner).toBe("sa");
    expect(detail.body.idle).toMatchObject({ level: "none", days: 0 });
  });
});

describe("POST /opportunities/:id/move — permission gate", () => {
  it("403s a non-PIC edit_own holder attempting to move another PIC's deal", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId, stage: "ASSESSMENT" });
    const id = created.body.id as string;

    const res = await moveOpportunity(other.token, id, { stage: "RFP", stageOrder: 0 });
    expect(res.status).toBe(403);
  });
});

describe("deadline / requestDate day-string contract", () => {
  it("round-trips deadline and requestDate through create -> GET as exact yyyy-MM-dd strings", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, {
      deadline: "2026-09-15",
      requestDate: "2026-08-01",
    });
    expect(created.status).toBe(201);
    expect(created.body.deadline).toBe("2026-09-15");
    expect(created.body.requestDate).toBe("2026-08-01");

    const fetched = await getOpportunity(sa.token, created.body.id as string);
    expect(fetched.status).toBe(200);
    expect(fetched.body.deadline).toBe("2026-09-15");
    expect(fetched.body.requestDate).toBe("2026-08-01");
  });

  it("400s an invalid calendar day for deadline", async () => {
    const sa = await createSaLikeUser();
    const res = await createOpportunity(sa.token, { deadline: "2026-02-30" });
    expect(res.status).toBe(400);
  });

  it("400s an invalid calendar day for requestDate", async () => {
    const sa = await createSaLikeUser();
    const res = await createOpportunity(sa.token, { requestDate: "2026-02-30" });
    expect(res.status).toBe(400);
  });
});

describe("createOpportunitySchema / updateOpportunitySchema — server-only fields rejected", () => {
  it("400s a PATCH body containing stageOrder — stageOrder changes only go through /move", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { stageOrder: 5 });
    expect(res.status).toBe(400);
  });

  it("400s a create body containing outcome — never client-writable, close/reopen own it", async () => {
    const sa = await createSaLikeUser();
    const res = await createOpportunity(sa.token, { outcome: "WON" });
    expect(res.status).toBe(400);
  });

  it("400s a create body containing statusTag", async () => {
    const sa = await createSaLikeUser();
    const res = await createOpportunity(sa.token, { statusTag: "HOLD" });
    expect(res.status).toBe(400);
  });

  it("400s a PATCH body containing outcome — POST /:id/close is the one writer", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { outcome: "WON" });
    expect(res.status).toBe(400);
  });

  it("400s a PATCH body containing closedAt", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { closedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it("400s a PATCH body containing wonAt", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { wonAt: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it("400s a PATCH body containing waitingInputSince", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { waitingInputSince: new Date().toISOString() });
    expect(res.status).toBe(400);
  });

  it("400s a PATCH body containing lastActivityAt", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await patchOpportunity(sa.token, id, { lastActivityAt: new Date().toISOString() });
    expect(res.status).toBe(400);
  });
});

describe("Permission gates on single-opportunity / create routes", () => {
  it("403s GET /opportunities/:id without pipeline:view", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, {});
    const id = created.body.id as string;

    const noPerms = await createUserWithPermissions([]);
    const res = await getOpportunity(noPerms.token, id);
    expect(res.status).toBe(403);
  });

  it("403s POST /opportunities without pipeline:create", async () => {
    const noPerms = await createUserWithPermissions(["pipeline:view"]);
    const res = await createOpportunity(noPerms.token, {});
    expect(res.status).toBe(403);
  });
});

describe("POST /opportunities/:id/move — cross-stage repacking", () => {
  it("repacks the SOURCE stage densely after a cross-stage move (relative order — docs/ISSUES.md:196)", async () => {
    const sa = await createSaLikeUser();
    // Asserts RELATIVE order among this test's own three rows, not absolute
    // stageOrder — a full gates.sh run shares one `solvro_test` DB across
    // every test file, so DELIVER_PROPOSAL's absolute sibling count can be
    // shifted by another file's rows landing in it first (docs/ISSUES.md
    // line 196, opportunities.test.ts:439 in the pre-redesign file).
    const before = await prisma.opportunity.count({ where: { stage: "DELIVER_PROPOSAL" } });
    const a = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const b = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const c = await createOpportunity(sa.token, { picId: sa.userId, stage: "DELIVER_PROPOSAL" });
    const aId = a.body.id as string;
    const bId = b.body.id as string;
    const cId = c.body.id as string;
    // Appended at the bottom in creation order: a, b, c land consecutively.
    expect((await getOpportunity(sa.token, aId)).body.stageOrder).toBe(before);
    expect((await getOpportunity(sa.token, bId)).body.stageOrder).toBe(before + 1);
    expect((await getOpportunity(sa.token, cId)).body.stageOrder).toBe(before + 2);

    // Move the middle one out of DELIVER_PROPOSAL entirely.
    const moved = await moveOpportunity(sa.token, bId, { stage: "WAITING_RESPONSE", stageOrder: 0 });
    expect(moved.status).toBe(200);

    // The remaining DELIVER_PROPOSAL siblings (a, c) are re-packed densely,
    // a still immediately ahead of c.
    const aOrder = (await getOpportunity(sa.token, aId)).body.stageOrder as number;
    const cOrder = (await getOpportunity(sa.token, cId)).body.stageOrder as number;
    expect(cOrder).toBe(aOrder + 1);
  });
});

describe("POST /opportunities — create directly into Waiting Response (D3)", () => {
  it("starts subStatus null (no Sales-input gate while the deal sits with the client)", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { stage: "WAITING_RESPONSE" });
    expect(created.status).toBe(201);
    expect(created.body.stage).toBe("WAITING_RESPONSE");
    expect(created.body.subStatus).toBeNull();
    expect(created.body.owner).toBe("client");
  });

  it("starts subStatus PROGRESS and owner sa on any other stage", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { stage: "POC" });
    expect(created.status).toBe(201);
    expect(created.body.subStatus).toBe("PROGRESS");
    expect(created.body.owner).toBe("sa");
    expect(created.body.lastActivityAt).not.toBeNull();
  });
});

describe("POST /opportunities — append-at-bottom ordering", () => {
  it("appends new opportunities at the bottom of their stage, in creation order", async () => {
    const sa = await createSaLikeUser();
    // TECHNICAL_CLARIFICATION: untouched by any straightforward-append test
    // earlier in this file (it's used elsewhere only as the CURRENT stage in
    // the skip-reason describe block, which moves rows OUT of it, never
    // appends INTO it) — reads the current count first anyway, same
    // discipline as the cross-stage repacking test above.
    const before = await prisma.opportunity.count({ where: { stage: "TECHNICAL_CLARIFICATION" } });
    const a = await createOpportunity(sa.token, { stage: "TECHNICAL_CLARIFICATION", title: "A" });
    const b = await createOpportunity(sa.token, { stage: "TECHNICAL_CLARIFICATION", title: "B" });
    const c = await createOpportunity(sa.token, { stage: "TECHNICAL_CLARIFICATION", title: "C" });

    expect((await getOpportunity(sa.token, a.body.id as string)).body.stageOrder).toBe(before);
    expect((await getOpportunity(sa.token, b.body.id as string)).body.stageOrder).toBe(before + 1);
    expect((await getOpportunity(sa.token, c.body.id as string)).body.stageOrder).toBe(before + 2);
  });
});

describe("POST /opportunities/:id/assign", () => {
  it("lets an edit_own holder claim an unassigned deal for themselves, logging one activity", async () => {
    const manager = await createManagerLikeUser();
    const sa = await createSaLikeUser();
    // Created by a manager with no picId — unassigned.
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;
    expect(created.body.pic).toBeNull();

    const res = await assignOpportunity(sa.token, id, { picId: sa.userId });
    expect(res.status).toBe(200);
    expect(res.body.pic.id).toBe(sa.userId);

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe(`Assigned to ${sa.username}`);
    expect(activities[0].userId).toBe(sa.userId);
  });

  it("lets an edit_own holder assign an unassigned deal to another existing user (D4)", async () => {
    const manager = await createManagerLikeUser();
    const sa = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(sa.token, id, { picId: other.userId });
    expect(res.status).toBe(200);
    expect(res.body.pic.id).toBe(other.userId);
  });

  it("403s an edit_own holder assigning a deal whose PIC is another user", async () => {
    const owner = await createSaLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await assignOpportunity(other.token, id, { picId: other.userId });
    expect(res.status).toBe(403);
  });

  it("403s an edit_own holder assigning their own already-assigned deal (Edit covers own deals)", async () => {
    const sa = await createSaLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId });
    const id = created.body.id as string;

    const res = await assignOpportunity(sa.token, id, { picId: sa.userId });
    expect(res.status).toBe(403);
  });

  it("lets an edit_all holder assign an already-assigned deal; repeating the same picId 200s with no second note (D6)", async () => {
    const owner = await createSaLikeUser();
    const manager = await createManagerLikeUser();
    const other = await createSaLikeUser();
    const created = await createOpportunity(owner.token, { picId: owner.userId });
    const id = created.body.id as string;

    const res = await assignOpportunity(manager.token, id, { picId: other.userId });
    expect(res.status).toBe(200);
    expect(res.body.pic.id).toBe(other.userId);
    let activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe(`Assigned to ${other.username}`);

    const again = await assignOpportunity(manager.token, id, { picId: other.userId });
    expect(again.status).toBe(200);
    activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    // True no-op (N1 fix): a repeat assign to the same PIC does not write
    // the row at all, so updatedAt stays exactly what the first assign set.
    expect(again.body.updatedAt).toBe(res.body.updatedAt);
  });

  it("403s a pipeline:view-only caller", async () => {
    const manager = await createManagerLikeUser();
    const viewer = await createUserWithPermissions(["pipeline:view"]);
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(viewer.token, id, { picId: viewer.userId });
    expect(res.status).toBe(403);
  });

  it("400s an unknown picId with code pic_not_found", async () => {
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(manager.token, id, { picId: 999_999_999 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("pic_not_found");
  });

  it("400s a missing picId", async () => {
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(manager.token, id, {});
    expect(res.status).toBe(400);
  });

  it("400s a non-positive picId", async () => {
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(manager.token, id, { picId: 0 });
    expect(res.status).toBe(400);
  });

  it("400s a malformed :id", async () => {
    const manager = await createManagerLikeUser();

    const res = await request(app)
      .post("/opportunities/not-a-uuid/assign")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ picId: manager.userId });
    expect(res.status).toBe(400);
  });

  it("404s a well-formed but unknown id", async () => {
    const manager = await createManagerLikeUser();

    const res = await assignOpportunity(manager.token, "00000000-0000-0000-0000-000000000000", {
      picId: manager.userId,
    });
    expect(res.status).toBe(404);
  });

  it("400s a body with an extra key — .strict() (D2)", async () => {
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await assignOpportunity(manager.token, id, { picId: manager.userId, title: "x" });
    expect(res.status).toBe(400);
  });

  it("401s without a token", async () => {
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const res = await request(app).post(`/opportunities/${id}/assign`).send({ picId: manager.userId });
    expect(res.status).toBe(401);
  });

  it("D1 regression guard: an edit_own holder still can't PATCH or DELETE an unassigned deal", async () => {
    const manager = await createManagerLikeUser();
    const sa = await createSaLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;

    const patched = await patchOpportunity(sa.token, id, { title: "x" });
    expect(patched.status).toBe(403);

    const deleted = await deleteOpportunity(sa.token, id);
    expect(deleted.status).toBe(403);
  });
});

describe("lastActivityAt bumps (§3.7)", () => {
  it("bumps on /move, PATCH, and /close; stays put on a repeat /assign to the same PIC", async () => {
    const sa = await createSaLikeUser();
    const manager = await createManagerLikeUser();
    const created = await createOpportunity(sa.token, { picId: sa.userId, stage: "ASSESSMENT" });
    const id = created.body.id as string;
    const afterCreate = created.body.lastActivityAt as string;

    const moved = await moveOpportunity(sa.token, id, { stage: "RFP", stageOrder: 0 });
    expect(Date.parse(moved.body.lastActivityAt)).toBeGreaterThanOrEqual(Date.parse(afterCreate));

    const patched = await patchOpportunity(sa.token, id, { title: "Bumped by PATCH" });
    expect(Date.parse(patched.body.lastActivityAt)).toBeGreaterThanOrEqual(Date.parse(moved.body.lastActivityAt));

    // edit_all (not edit_own — D1 only lets edit_own claim an UNASSIGNED
    // deal) repeats the same picId on an already-assigned deal, D6's true
    // no-op path.
    const reAssigned = await assignOpportunity(manager.token, id, { picId: sa.userId });
    expect(reAssigned.status).toBe(200);
    // Same PIC again is a true no-op (D6) — the row isn't written at all, so
    // lastActivityAt (like updatedAt) stays exactly what PATCH last set.
    expect(reAssigned.body.lastActivityAt).toBe(patched.body.lastActivityAt);

    const closed = await closeOpportunity(sa.token, id, { outcome: "WON" });
    expect(closed.status).toBe(200);
    expect(Date.parse(closed.body.lastActivityAt)).toBeGreaterThanOrEqual(Date.parse(reAssigned.body.lastActivityAt));
  });
});

// docs/archive/plans/application-review-2026-10-22.md, F-09: the permission check for `/assign` ran on
// a pre-lock snapshot only. Two `edit_own` holders claiming the same
// unassigned deal at once both passed it; the second transaction then saw
// the first claimant as PIC and silently overwrote the claim.
describe("POST /opportunities/:id/assign — concurrent claims", () => {
  it("lets exactly one of two simultaneous edit_own claimants win; the other gets 403", async () => {
    const manager = await createManagerLikeUser();
    const a = await createSaLikeUser();
    const b = await createSaLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;
    expect(created.body.pic).toBeNull();

    const [resA, resB] = await Promise.all([
      assignOpportunity(a.token, id, { picId: a.userId }),
      assignOpportunity(b.token, id, { picId: b.userId }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 403]);

    const winner = resA.status === 200 ? a : b;
    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id }, select: { picId: true } });
    expect(row.picId).toBe(winner.userId);

    const activities = await activitiesFor(id);
    expect(activities).toHaveLength(1);
    expect(activities[0].note).toBe(`Assigned to ${winner.username}`);
  });

  it("still lets an edit_all holder reassign a deal that was claimed under it", async () => {
    const manager = await createManagerLikeUser();
    const a = await createSaLikeUser();
    const created = await createOpportunity(manager.token, {});
    const id = created.body.id as string;
    expect((await assignOpportunity(a.token, id, { picId: a.userId })).status).toBe(200);
    const res = await assignOpportunity(manager.token, id, { picId: manager.userId });
    expect(res.status).toBe(200);
    expect(res.body.pic.id).toBe(manager.userId);
  });
});
