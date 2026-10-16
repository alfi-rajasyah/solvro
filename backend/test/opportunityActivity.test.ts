// Pipeline side of the activity log and notifications (lib/opportunityActivity.ts):
// every deal writer records exactly one structured ActivityEvent next to its
// unchanged OpportunityActivity sentence, in the same transaction.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/http/auth.js";
import { deleteExpiredActivityEvents } from "../src/lib/activityCleanup.js";
import {
  canUserSeePipeline,
  filterActiveUsersWhoCanSeeOpportunity,
} from "../src/lib/notifications.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";
import { createWonOpportunity } from "./pipelineWonFixture.js";

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

const uniq = (label: string) => `${label} ${Date.now()}-${Math.random()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let roleCounter = 0;
/** A user whose role holds exactly `permissions` (one throwaway role per call). */
async function userWith(permissions: string[]): Promise<{ userId: number; token: string; username: string }> {
  roleCounter += 1;
  const role = await prisma.role.create({
    data: { roleName: `test-oppact-role-${roleCounter}-${Date.now()}-${Math.random()}`, permissions },
  });
  const user = await prisma.user.create({
    data: {
      username: `test-oppact-${roleCounter}-${Date.now()}-${Math.random()}`,
      email: `test-oppact-${roleCounter}-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: null,
      roleId: role.id,
      active: true,
    },
  });
  return {
    userId: user.id,
    username: user.username,
    token: signToken({ sub: user.id, ver: 0 }),
  };
}

const ACTOR = ["pipeline:view", "pipeline:create", "pipeline:edit_all", "pipeline:delete_all", "project:write"];
const actor = () => userWith(ACTOR);
const viewer = () => userWith(["pipeline:view"]);
const tamOnly = () => userWith(["project:read", "project:write"]);

const createDeal = (token: string, body: Record<string, unknown> = {}) =>
  request(app).post("/opportunities").set(auth(token)).send({ title: uniq("Deal"), customerName: "Acme", ...body });
const patchDeal = (token: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`/opportunities/${id}`).set(auth(token)).send(body);
const post = (token: string, path: string, body: Record<string, unknown> = {}) =>
  request(app).post(path).set(auth(token)).send(body);

const eventsFor = (opportunityId: string) =>
  prisma.activityEvent.findMany({ where: { opportunityId }, orderBy: { id: "asc" } });
const sentences = async (opportunityId: string) =>
  (await prisma.opportunityActivity.findMany({ where: { opportunityId }, orderBy: { createdAt: "asc" } })).map(
    (a) => a.note,
  );
const notesFor = (userId: number) => prisma.notification.findMany({ where: { userId }, orderBy: { id: "asc" } });
const reasonsFor = async (userId: number) => (await notesFor(userId)).map((n) => n.reason);

async function newDeal(token: string, body: Record<string, unknown> = {}): Promise<{ id: string; title: string }> {
  const res = await createDeal(token, body);
  expect(res.status).toBe(201);
  return { id: res.body.id as string, title: res.body.title as string };
}

describe("POST /opportunities", () => {
  it("records one `created` event with the stage, value and PIC, and the 'Created' sentence", async () => {
    const creator = await actor();
    const pic = await viewer();
    const res = await createDeal(creator.token, { dealValue: 1_500_000, picId: pic.userId, stage: "RFP" });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    const events = await eventsFor(id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectId: null,
      entityId: null,
      entityType: "opportunity",
      action: "created",
      actorId: creator.userId,
      entityLabel: res.body.title,
      changes: { stage: "RFP", dealValue: 1_500_000, pic: { id: pic.userId, username: pic.username } },
    });
    expect(await sentences(id)).toEqual(["Created"]);
    // The assigned PIC is told; the creator is not.
    expect(await reasonsFor(pic.userId)).toEqual(["assigned"]);
    expect(await notesFor(creator.userId)).toHaveLength(0);
  });

  it("a deal created without a PIC, or with the creator as PIC, notifies nobody", async () => {
    const creator = await actor();
    const a = await newDeal(creator.token);
    const b = await newDeal(creator.token, { picId: creator.userId });
    expect(await eventsFor(a.id)).toHaveLength(1);
    expect(await eventsFor(b.id)).toHaveLength(1);
    expect(await notesFor(creator.userId)).toHaveLength(0);
  });
});

describe("PATCH /opportunities/:id", () => {
  it("a dealValue edit is recorded as numbers (BigInt never reaches the JSON), a description edit as { changed: true }", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token, { dealValue: 100 });
    const res = await patchDeal(u.token, id, {
      dealValue: 2_500_000_000,
      description: "very secret terms",
      title: "Renamed deal",
      deadline: "2026-12-31",
    });
    expect(res.status).toBe(200);
    const events = (await eventsFor(id)).filter((e) => e.action === "updated");
    expect(events).toHaveLength(1);
    expect(events[0]!.entityLabel).toBe("Renamed deal");
    expect(events[0]!.changes).toEqual({
      dealValue: { from: 100, to: 2_500_000_000 },
      description: { changed: true },
      title: { from: expect.any(String), to: "Renamed deal" },
      deadline: { from: null, to: "2026-12-31" },
    });
    expect(JSON.stringify(events[0]!.changes)).not.toContain("secret");
    // Plain field edits add no timeline sentence.
    expect(await sentences(id)).toEqual(["Created"]);
  });

  it("a no-op PATCH (same values, or an empty body) records no event and no sentence", async () => {
    const u = await actor();
    const { id, title } = await newDeal(u.token, { dealValue: 500 });
    expect((await patchDeal(u.token, id, { title, dealValue: 500 })).status).toBe(200);
    expect((await patchDeal(u.token, id, {})).status).toBe(200);
    expect(await eventsFor(id)).toHaveLength(1);
    expect(await sentences(id)).toEqual(["Created"]);
  });

  it("a sub-status transition keeps its sentence and records the change", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    expect((await patchDeal(u.token, id, { subStatus: "WAITING_SALES_INPUT" })).status).toBe(200);
    const events = (await eventsFor(id)).filter((e) => e.action === "updated");
    expect(events).toHaveLength(1);
    expect(events[0]!.changes).toEqual({ subStatus: { from: "PROGRESS", to: "WAITING_SALES_INPUT" } });
    expect(await sentences(id)).toEqual(["Created", "Waiting for Sales input"]);
  });

  it("a PIC change through PATCH writes 'Assigned to X', one event, and notifies the new PIC (not the actor)", async () => {
    const u = await actor();
    const first = await viewer();
    const second = await viewer();
    const { id } = await newDeal(u.token, { picId: first.userId });
    expect((await patchDeal(u.token, id, { picId: second.userId })).status).toBe(200);
    const events = (await eventsFor(id)).filter((e) => e.action === "updated");
    expect(events).toHaveLength(1);
    expect(events[0]!.changes).toEqual({
      pic: {
        from: { id: first.userId, username: first.username },
        to: { id: second.userId, username: second.username },
      },
    });
    expect(await sentences(id)).toEqual(["Created", `Assigned to ${second.username}`]);
    expect(await reasonsFor(second.userId)).toEqual(["assigned"]);
    expect(await reasonsFor(first.userId)).toEqual(["assigned"]); // from the create only
    expect(await notesFor(u.userId)).toHaveLength(0);

    // Clearing the PIC reads "Unassigned" and notifies nobody.
    expect((await patchDeal(u.token, id, { picId: null })).status).toBe(200);
    expect(await sentences(id)).toEqual(["Created", `Assigned to ${second.username}`, "Unassigned"]);
    expect(await reasonsFor(second.userId)).toEqual(["assigned"]);
  });

  it("two overlapping identical PIC PATCHes record one change", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token);
    const results = await Promise.all([
      patchDeal(u.token, id, { picId: pic.userId }),
      patchDeal(u.token, id, { picId: pic.userId }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect((await eventsFor(id)).filter((e) => e.action === "updated")).toHaveLength(1);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned"]);
  });
});

describe("POST /opportunities/:id/move", () => {
  it("records `moved` with the stages; a same-stage reorder records nothing", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token, { stage: "ASSESSMENT" });
    expect((await post(u.token, `/opportunities/${id}/move`, { stage: "RFP", stageOrder: 0 })).status).toBe(200);
    expect((await post(u.token, `/opportunities/${id}/move`, { stage: "RFP", stageOrder: 0 })).status).toBe(200);
    const moved = (await eventsFor(id)).filter((e) => e.action === "moved");
    expect(moved).toHaveLength(1);
    expect(moved[0]!.changes).toEqual({ stage: { from: "ASSESSMENT", to: "RFP" } });
    expect(await sentences(id)).toEqual(["Created", "Moved from Assessment to RFP"]);
  });

  it("the PoC-skip reason stays in the sentence and never enters `changes`", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token, { stage: "TECHNICAL_CLARIFICATION", picId: pic.userId });
    const res = await post(u.token, `/opportunities/${id}/move`, {
      stage: "RFP",
      stageOrder: 0,
      reason: "customer already has a prototype",
    });
    expect(res.status).toBe(200);
    const moved = (await eventsFor(id)).filter((e) => e.action === "moved");
    expect(moved[0]!.changes).toEqual({
      stage: { from: "TECHNICAL_CLARIFICATION", to: "RFP" },
      pocSkipped: true,
    });
    expect(JSON.stringify(moved[0]!.changes)).not.toContain("prototype");
    expect((await sentences(id))[1]).toContain("customer already has a prototype");
    // A stage move never notifies.
    expect(await reasonsFor(pic.userId)).toEqual(["assigned"]);
  });
});

describe("POST /opportunities/:id/close and /reopen", () => {
  it("records `closed` with outcome and category only; the free-text reason stays in the sentence", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    const res = await post(u.token, `/opportunities/${id}/close`, {
      outcome: "LOST",
      reasonCategory: "PRICE",
      reason: "they found a cheaper vendor",
    });
    expect(res.status).toBe(200);
    const closed = (await eventsFor(id)).filter((e) => e.action === "closed");
    expect(closed).toHaveLength(1);
    expect(closed[0]!.changes).toEqual({ outcome: "LOST", reasonCategory: "PRICE" });
    expect(JSON.stringify(closed[0]!.changes)).not.toContain("cheaper");
    expect(await sentences(id)).toEqual(["Created", "Closed as Lost (Price): they found a cheaper vendor"]);
  });

  it("two concurrent closes record one event and one `deal_closed` notification; the loser gets 409", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token, { picId: pic.userId });
    const results = await Promise.all([
      post(u.token, `/opportunities/${id}/close`, { outcome: "WON" }),
      post(u.token, `/opportunities/${id}/close`, { outcome: "WON" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await eventsFor(id)).filter((e) => e.action === "closed")).toHaveLength(1);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned", "deal_closed"]);
    expect(await sentences(id)).toEqual(["Created", "Closed as Won"]);
  });

  it("two overlapping identical sub-status PATCHes write one sentence", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    const results = await Promise.all([
      patchDeal(u.token, id, { subStatus: "WAITING_SALES_INPUT" }),
      patchDeal(u.token, id, { subStatus: "WAITING_SALES_INPUT" }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await sentences(id)).toEqual(["Created", "Waiting for Sales input"]);
    expect((await eventsFor(id)).filter((e) => e.action === "updated")).toHaveLength(1);
  });

  it("records `reopened`", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    await post(u.token, `/opportunities/${id}/close`, { outcome: "WON" });
    expect((await post(u.token, `/opportunities/${id}/reopen`)).status).toBe(200);
    const reopened = (await eventsFor(id)).filter((e) => e.action === "reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.changes).toEqual({ outcome: { from: "WON", to: null } });
    expect(await sentences(id)).toEqual(["Created", "Closed as Won", "Reopened"]);
  });

  it("notifies the PIC (`deal_closed`) when someone else closes; closing your own deal notifies nobody; reopen never notifies", async () => {
    const u = await actor();
    const pic = await userWith(["pipeline:view", "pipeline:create", "pipeline:edit_own"]);
    const theirs = await newDeal(u.token, { picId: pic.userId });
    await post(u.token, `/opportunities/${theirs.id}/close`, { outcome: "WON" });
    expect(await reasonsFor(pic.userId)).toEqual(["assigned", "deal_closed"]);
    const notification = (await notesFor(pic.userId))[1]!;
    const event = await prisma.activityEvent.findUniqueOrThrow({ where: { id: notification.activityEventId } });
    expect(event).toMatchObject({ action: "closed", opportunityId: theirs.id });

    await post(u.token, `/opportunities/${theirs.id}/reopen`);
    expect(await notesFor(pic.userId)).toHaveLength(2);

    const own = await newDeal(pic.token, { picId: pic.userId });
    await post(pic.token, `/opportunities/${own.id}/close`, { outcome: "WON" });
    expect(await notesFor(pic.userId)).toHaveLength(2);
  });
});

describe("POST /opportunities/:id/assign", () => {
  it("an edit_all holder assigning notifies the new PIC; repeating the same PIC records nothing", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token);
    expect((await post(u.token, `/opportunities/${id}/assign`, { picId: pic.userId })).status).toBe(200);
    const assigned = (await eventsFor(id)).filter((e) => e.action === "assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0]!.changes).toEqual({
      pic: { from: null, to: { id: pic.userId, username: pic.username } },
    });
    expect(await sentences(id)).toEqual(["Created", `Assigned to ${pic.username}`]);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned"]);

    expect((await post(u.token, `/opportunities/${id}/assign`, { picId: pic.userId })).status).toBe(200);
    expect(await eventsFor(id)).toHaveLength(2);
    expect(await notesFor(pic.userId)).toHaveLength(1);
  });

  it("a self-claim by an edit_own holder records the event and notifies nobody", async () => {
    const u = await actor();
    const claimer = await userWith(["pipeline:view", "pipeline:edit_own"]);
    const { id } = await newDeal(u.token);
    expect((await post(claimer.token, `/opportunities/${id}/assign`, { picId: claimer.userId })).status).toBe(200);
    expect((await eventsFor(id)).filter((e) => e.action === "assigned")).toHaveLength(1);
    expect(await notesFor(claimer.userId)).toHaveLength(0);
  });

  it("skips a PIC without pipeline:view and an inactive PIC", async () => {
    const u = await actor();
    const tam = await tamOnly();
    const inactive = await viewer();
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const { id } = await newDeal(u.token);
    expect((await post(u.token, `/opportunities/${id}/assign`, { picId: tam.userId })).status).toBe(200);
    expect((await post(u.token, `/opportunities/${id}/assign`, { picId: inactive.userId })).status).toBe(200);
    expect(await notesFor(tam.userId)).toHaveLength(0);
    expect(await notesFor(inactive.userId)).toHaveLength(0);
    expect((await eventsFor(id)).filter((e) => e.action === "assigned")).toHaveLength(2);
  });
});

describe("deal links", () => {
  it("records added / updated / removed with the label only, never the URL; add and remove write a timeline sentence, update stays silent", async () => {
    const u = await actor();
    const { id, title } = await newDeal(u.token);
    const added = await request(app)
      .post(`/opportunities/${id}/links`)
      .set(auth(u.token))
      .send({ label: "Proposal", url: "https://example.com/secret-path" });
    expect(added.status).toBe(201);
    const linkId = added.body.id as string;
    const patchLink = (body: Record<string, unknown>) =>
      request(app).patch(`/opportunities/${id}/links/${linkId}`).set(auth(u.token)).send(body);
    expect((await patchLink({ label: "Proposal v2" })).status).toBe(200);
    // Re-saving identical values records nothing.
    expect((await patchLink({ label: "Proposal v2", url: "https://example.com/secret-path" })).status).toBe(200);
    expect(
      (await request(app).delete(`/opportunities/${id}/links/${linkId}`).set(auth(u.token))).status,
    ).toBe(204);

    const events = (await eventsFor(id)).filter((e) => e.entityType === "opportunity_link");
    expect(events.map((e) => [e.action, e.changes])).toEqual([
      ["added", { linkId, label: "Proposal" }],
      ["updated", { linkId, label: "Proposal v2" }],
      ["removed", { linkId, label: "Proposal v2" }],
    ]);
    expect(events.every((e) => e.entityLabel === title && e.entityId === null)).toBe(true);
    expect(JSON.stringify(events.map((e) => e.changes))).not.toContain("secret-path");
    expect(await sentences(id)).toEqual(["Created", "Link added: Proposal", "Link removed: Proposal v2"]);
    expect((await sentences(id)).join(" ")).not.toContain("secret-path");
  });
});

describe("deal notes and @mentions", () => {
  const note = (token: string, id: string, body: Record<string, unknown>) =>
    post(token, `/opportunities/${id}/activities`, body);

  it("a note by SALES notifies the PIC with `commented`; the event holds only the note id", async () => {
    const u = await actor();
    const sales = await createUserWithRole("SALES");
    const pic = await viewer();
    const { id } = await newDeal(u.token, { picId: pic.userId });
    const res = await note(sales.token, id, { note: "client confirmed the budget" });
    expect(res.status).toBe(201);
    expect(res.body.mentionedUserIds).toEqual([]);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned", "commented"]);
    const notes = (await eventsFor(id)).filter((e) => e.entityType === "opportunity_note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      action: "created",
      actorId: sales.userId,
      entityId: null,
      changes: { activityId: res.body.id },
    });
    expect(JSON.stringify(notes[0]!.changes)).not.toContain("budget");
    // The sentence IS the note: no extra row.
    expect(await sentences(id)).toEqual(["Created", "client confirmed the budget"]);
  });

  it("a note by the PIC themself, or on a deal without a PIC, notifies nobody", async () => {
    const u = await actor();
    const pic = await userWith(["pipeline:view"]);
    const mine = await newDeal(u.token, { picId: pic.userId });
    const loose = await newDeal(u.token);
    await note(pic.token, mine.id, { note: "mine" });
    await note(pic.token, loose.id, { note: "hello" });
    expect(await reasonsFor(pic.userId)).toEqual(["assigned"]);
  });

  it("a mention notifies the mentioned pipeline:view user (and wins over `commented` for the PIC); never the actor", async () => {
    const u = await actor();
    const pic = await viewer();
    const colleague = await viewer();
    const { id } = await newDeal(u.token, { picId: pic.userId });
    const res = await note(u.token, id, {
      note: "@x @y please look",
      mentionedUserIds: [colleague.userId, pic.userId, colleague.userId, u.userId],
    });
    expect(res.status).toBe(201);
    // Deduplicated, self-mention kept so the chip renders.
    expect(res.body.mentionedUserIds).toEqual([colleague.userId, pic.userId, u.userId]);
    expect(await reasonsFor(colleague.userId)).toEqual(["mentioned"]);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned", "mentioned"]);
    expect(await notesFor(u.userId)).toHaveLength(0);

    const list = await request(app).get(`/opportunities/${id}/activities`).set(auth(u.token));
    expect(list.body[0].mentionedUserIds).toEqual([colleague.userId, pic.userId, u.userId]);
    const event = (await eventsFor(id)).find((e) => e.entityType === "opportunity_note")!;
    expect(event.changes).toEqual({ activityId: res.body.id });
  });

  it("drops mentions of users without pipeline:view, inactive and unknown users from the stored list", async () => {
    const u = await actor();
    const ok = await viewer();
    const tam = await tamOnly();
    const gone = await viewer();
    await prisma.user.update({ where: { id: gone.userId }, data: { active: false } });
    const { id } = await newDeal(u.token);
    const res = await note(u.token, id, {
      note: "ping",
      mentionedUserIds: [tam.userId, gone.userId, 999_999_999, ok.userId],
    });
    expect(res.status).toBe(201);
    expect(res.body.mentionedUserIds).toEqual([ok.userId]);
    expect(await notesFor(tam.userId)).toHaveLength(0);
    expect(await notesFor(gone.userId)).toHaveLength(0);
    expect(await reasonsFor(ok.userId)).toEqual(["mentioned"]);
  });

  it("rejects more than 20 mentions", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    const ids = Array.from({ length: 21 }, (_, i) => i + 1);
    expect((await note(u.token, id, { note: "x", mentionedUserIds: ids })).status).toBe(400);
  });
});

describe("POST /opportunities/:id/handoff", () => {
  const handoff = (token: string, id: string, body: Record<string, unknown>) =>
    post(token, `/opportunities/${id}/handoff`, body);
  const customer = () =>
    prisma.customer.create({ data: { name: uniq("HandoffCo"), description: "d" } });

  it("notifies the new TAM and SA, and the PIC when someone else hands off; writes the project `created` event", async () => {
    const u = await actor();
    const pic = await viewer();
    const tam = await tamOnly();
    const sa = await userWith(["project:read"]);
    const c = await customer();
    const { id, title } = await newDeal(u.token, { picId: pic.userId });
    await post(u.token, `/opportunities/${id}/close`, { outcome: "WON" });

    const res = await handoff(u.token, id, {
      name: uniq("Rollout"),
      customerId: c.id,
      tamId: tam.userId,
      saId: sa.userId,
    });
    expect(res.status).toBe(201);
    const projectId = res.body.project.id as number;

    const projectEvents = await prisma.activityEvent.findMany({ where: { projectId } });
    expect(projectEvents).toHaveLength(1);
    expect(projectEvents[0]).toMatchObject({
      opportunityId: null,
      entityType: "project",
      entityId: projectId,
      action: "created",
      actorId: u.userId,
      entityLabel: res.body.project.name,
      changes: {
        fromOpportunity: { id, title },
        tam: { id: tam.userId, username: tam.username },
        sa: { id: sa.userId, username: sa.username },
      },
    });
    const dealEvents = (await eventsFor(id)).filter((e) => e.action === "handed_off");
    expect(dealEvents).toHaveLength(1);
    expect(dealEvents[0]!.changes).toEqual({ project: { id: projectId, name: res.body.project.name } });
    expect(await sentences(id)).toEqual(["Created", "Closed as Won", `Handed off to project "${res.body.project.name}"`]);

    expect(await reasonsFor(tam.userId)).toEqual(["assigned"]);
    expect(await reasonsFor(sa.userId)).toEqual(["assigned"]);
    expect(await reasonsFor(pic.userId)).toEqual(["assigned", "deal_closed", "handed_off"]);
    expect(await notesFor(u.userId)).toHaveLength(0);
  });

  it("withholds the source deal from the project feed and notification of a caller without pipeline:view", async () => {
    const u = await actor();
    const tam = await tamOnly();
    const sa = await userWith(["project:read", "pipeline:view"]);
    const c = await customer();
    const { id, title } = await newDeal(u.token);
    await post(u.token, `/opportunities/${id}/close`, { outcome: "WON" });
    const res = await handoff(u.token, id, {
      name: uniq("Withheld"),
      customerId: c.id,
      tamId: tam.userId,
      saId: sa.userId,
    });
    expect(res.status).toBe(201);
    const projectId = res.body.project.id as number;

    const asTam = await request(app).get(`/projects/${projectId}/activity`).set(auth(tam.token));
    expect(asTam.status).toBe(200);
    expect(asTam.body.events[0].changes.fromOpportunity).toEqual({ withheld: true });
    expect(JSON.stringify(asTam.body)).not.toContain(title);
    expect(JSON.stringify(asTam.body)).not.toContain(id);
    // The TAM's other change fields survive.
    expect(asTam.body.events[0].changes.tam.id).toBe(tam.userId);
    const tamBell = await request(app).get("/notifications").set(auth(tam.token));
    expect(tamBell.body.notifications).toHaveLength(1);
    expect(JSON.stringify(tamBell.body)).not.toContain(title);
    expect(tamBell.body.notifications[0].event.changes.fromOpportunity).toEqual({ withheld: true });

    // A caller with pipeline:view (the SA here) and `*` still see the deal.
    const admin = await createUserWithRole("ADMIN");
    for (const viewerToken of [sa.token, admin.token]) {
      const feed = await request(app).get(`/projects/${projectId}/activity`).set(auth(viewerToken));
      expect(feed.status).toBe(200);
      expect(feed.body.events[0].changes.fromOpportunity).toEqual({ id, title });
    }
    const saBell = await request(app).get("/notifications").set(auth(sa.token));
    expect(saBell.body.notifications.find((n: { event: { entityType: string } }) => n.event.entityType === "project").event.changes.fromOpportunity).toEqual({ id, title });
  });

  it("the PIC doing the handoff themself is not notified; the actor as TAM is not either", async () => {
    const u = await actor();
    const c = await customer();
    const id = await createWonOpportunity(app, u.token, u.userId);
    const res = await handoff(u.token, id, { name: uniq("Mine"), customerId: c.id });
    expect(res.status).toBe(201);
    expect(await notesFor(u.userId)).toHaveLength(0);
  });

  it("an already_linked retry and a concurrent race leave exactly one set of events", async () => {
    const u = await actor();
    const c = await customer();
    const id = await createWonOpportunity(app, u.token, u.userId);
    const prefix = uniq("Race");
    const attempts = await Promise.all(
      [0, 1, 2].map((i) => handoff(u.token, id, { name: `${prefix} ${i}`, customerId: c.id })),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409).every((r) => r.body.code === "already_linked")).toBe(true);
    expect((await eventsFor(id)).filter((e) => e.action === "handed_off")).toHaveLength(1);
    expect(
      await prisma.activityEvent.count({ where: { entityType: "project", entityLabel: { startsWith: prefix } } }),
    ).toBe(1);

    const retry = await handoff(u.token, id, { name: `${prefix} retry`, customerId: c.id });
    expect(retry.status).toBe(409);
    expect(
      await prisma.activityEvent.count({ where: { entityType: "project", entityLabel: { startsWith: prefix } } }),
    ).toBe(1);
    expect(await prisma.project.count({ where: { name: { startsWith: prefix } } })).toBe(1);
  });
});

describe("POST /opportunities/import", () => {
  it("records a `created` event per row ({ stage, source: 'import' }) and notifies nobody", async () => {
    const u = await actor();
    const pic = await viewer();
    const title = uniq("Imported");
    const res = await post(u.token, "/opportunities/import", {
      rows: [
        { title, customerName: "Imp Co", stage: "rfp", picId: pic.userId, activityLog: "seeded history" },
        { title: `${title} b`, customerName: "Imp Co", stage: "assessment" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.validCount).toBe(2);
    const firstId = res.body.results[0].id as string;
    const events = await eventsFor(firstId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "created",
      actorId: u.userId,
      changes: { stage: "RFP", source: "import" },
    });
    // No "Created" sentence: the activityLog seed is the timeline entry.
    expect(await sentences(firstId)).toEqual(["seeded history"]);
    expect(await eventsFor(res.body.results[1].id as string)).toHaveLength(1);
    expect(await notesFor(pic.userId)).toHaveLength(0);
  });
});

describe("DELETE /opportunities/:id", () => {
  it("cascades the deal's events and their notifications", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token, { picId: pic.userId });
    await post(u.token, `/opportunities/${id}/close`, { outcome: "WON" });
    expect(await eventsFor(id)).toHaveLength(2);
    expect(await notesFor(pic.userId)).toHaveLength(2);
    expect((await request(app).delete(`/opportunities/${id}`).set(auth(u.token))).status).toBe(204);
    expect(await eventsFor(id)).toHaveLength(0);
    expect(await notesFor(pic.userId)).toHaveLength(0);
  });
});

describe("activity_events_one_scope CHECK", () => {
  it("rejects an event with both scopes or neither (raw insert)", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: u.userId, status: "ACTIVE", customerId: (await prisma.customer.create({ data: { name: uniq("C"), description: "d" } })).id },
    });
    await expect(
      prisma.$executeRaw`INSERT INTO activity_events (project_id, opportunity_id, entity_type, action) VALUES (${project.id}, ${id}, 'opportunity', 'created')`,
    ).rejects.toThrow(/activity_events_one_scope/);
    await expect(
      prisma.$executeRaw`INSERT INTO activity_events (project_id, opportunity_id, entity_type, action) VALUES (NULL, NULL, 'opportunity', 'created')`,
    ).rejects.toThrow(/activity_events_one_scope/);
    await expect(
      prisma.$executeRaw`INSERT INTO activity_events (project_id, opportunity_id, entity_type, action) VALUES (NULL, ${id}, 'opportunity', 'created')`,
    ).resolves.toBe(1);
  });
});

describe("GET /opportunities/:id/activity", () => {
  it("lists the deal's structured events newest first with paging, for pipeline:view only", async () => {
    const u = await actor();
    const { id } = await newDeal(u.token);
    await post(u.token, `/opportunities/${id}/move`, { stage: "RFP", stageOrder: 0 });
    await post(u.token, `/opportunities/${id}/close`, { outcome: "WON" });
    const events = await eventsFor(id);

    const v = await viewer();
    const first = await request(app).get(`/opportunities/${id}/activity?limit=2`).set(auth(v.token));
    expect(first.status).toBe(200);
    expect(first.body.events.map((e: { id: number }) => e.id)).toEqual([events[2]!.id, events[1]!.id]);
    expect(first.body.nextBefore).toBe(events[1]!.id);
    expect(first.body.events[0]).toMatchObject({
      projectId: null,
      opportunityId: id,
      entityId: null,
      entityType: "opportunity",
      action: "closed",
      actor: { id: u.userId },
    });
    const second = await request(app)
      .get(`/opportunities/${id}/activity?limit=2&before=${first.body.nextBefore}`)
      .set(auth(v.token));
    expect(second.body.events.map((e: { id: number }) => e.id)).toEqual([events[0]!.id]);
    expect(second.body.nextBefore).toBeNull();

    const filtered = await request(app)
      .get(`/opportunities/${id}/activity?actorId=${v.userId}`)
      .set(auth(v.token));
    expect(filtered.body.events).toEqual([]);

    expect((await request(app).get(`/opportunities/${id}/activity`).set(auth((await tamOnly()).token))).status).toBe(403);
    expect((await request(app).get(`/opportunities/${id}/activity`)).status).toBe(401);
    expect(
      (await request(app).get(`/opportunities/00000000-0000-4000-8000-000000000000/activity`).set(auth(v.token))).status,
    ).toBe(404);
  });
});

describe("GET /notifications — visibility arms", () => {
  async function seedBoth(userId: number) {
    const u = await actor();
    const { id, title } = await newDeal(u.token);
    const dealEvent = await prisma.activityEvent.create({
      data: { opportunityId: id, actorId: u.userId, entityType: "opportunity", action: "assigned", entityLabel: title },
    });
    const customer = await prisma.customer.create({ data: { name: uniq("C"), description: "d" } });
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: u.userId, customerId: customer.id, status: "ACTIVE" },
    });
    const projectEvent = await prisma.activityEvent.create({
      data: { projectId: project.id, actorId: u.userId, entityType: "task", entityId: 1, action: "updated", entityLabel: "T" },
    });
    // Sequential: the project row must be the newer id (ordering/paging tests).
    const dealRow = await prisma.notification.create({
      data: { userId, activityEventId: dealEvent.id, reason: "assigned" },
    });
    const projectRow = await prisma.notification.create({
      data: { userId, activityEventId: projectEvent.id, reason: "assigned" },
    });
    return { id, title, project, dealRow, projectRow };
  }
  const list = (token: string) => request(app).get("/notifications").set(auth(token));
  const unread = async (token: string) =>
    (await request(app).get("/notifications/unread-count").set(auth(token))).body.count as number;

  it("hides deal notifications from (and does not count them for) a caller without pipeline:view; view-all still sees project ones", async () => {
    const stakeholder = await createUserWithRole("AUDITOR");
    const f = await seedBoth(stakeholder.userId);
    const res = await list(stakeholder.token);
    expect(res.body.notifications.map((n: { id: number }) => n.id)).toEqual([f.projectRow.id]);
    expect(res.body.notifications[0]).toMatchObject({
      projectId: f.project.id,
      projectName: f.project.name,
      opportunityId: null,
      opportunityTitle: null,
    });
    expect(await unread(stakeholder.token)).toBe(1);
  });

  it("a pipeline:view-only caller sees deal rows and not project rows they cannot see; the DTO names the deal", async () => {
    const sales = await createUserWithRole("SALES");
    const f = await seedBoth(sales.userId);
    const res = await list(sales.token);
    expect(res.body.notifications.map((n: { id: number }) => n.id)).toEqual([f.dealRow.id]);
    expect(res.body.notifications[0]).toMatchObject({
      projectId: null,
      projectName: null,
      opportunityId: f.id,
      opportunityTitle: f.title,
      reason: "assigned",
    });
    expect(await unread(sales.token)).toBe(1);
  });

  it("`*` sees both kinds, newest first, and the paging crosses them", async () => {
    const admin = await createUserWithRole("ADMIN");
    const f = await seedBoth(admin.userId);
    const first = await request(app).get("/notifications?limit=1").set(auth(admin.token));
    expect(first.body.notifications.map((n: { id: number }) => n.id)).toEqual([f.projectRow.id]);
    const second = await request(app)
      .get(`/notifications?limit=1&before=${first.body.nextBefore}`)
      .set(auth(admin.token));
    expect(second.body.notifications.map((n: { id: number }) => n.id)).toEqual([f.dealRow.id]);
    expect(await unread(admin.token)).toBe(2);
  });

  it("a caller who loses pipeline:view (role changed in the database, same token) stops seeing the rows already delivered", async () => {
    const pic = await viewer();
    const f = await seedBoth(pic.userId);
    expect((await list(pic.token)).body.notifications.map((n: { id: number }) => n.id)).toEqual([f.dealRow.id]);
    // Permissions are read from the database on every request (http/auth.ts,
    // 2026-10-06), so the SAME token loses access the moment the role changes.
    const tam = await prisma.role.findUniqueOrThrow({ where: { roleName: "TAM" } });
    await prisma.user.update({ where: { id: pic.userId }, data: { roleId: tam.id } });
    expect((await list(pic.token)).body.notifications).toEqual([]);
    expect(await unread(pic.token)).toBe(0);
  });
});

describe("retention cleanup", () => {
  it("deletes old project-scoped events (and their notifications) but keeps old deal-scoped ones", async () => {
    const u = await actor();
    const pic = await viewer();
    const { id } = await newDeal(u.token, { picId: pic.userId });
    const old = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    const dealEvent = (await eventsFor(id))[0]!;
    await prisma.activityEvent.update({ where: { id: dealEvent.id }, data: { createdAt: old } });
    const customer = await prisma.customer.create({ data: { name: uniq("C"), description: "d" } });
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: u.userId, customerId: customer.id, status: "ACTIVE" },
    });
    const projectEvent = await prisma.activityEvent.create({
      data: { projectId: project.id, entityType: "task", entityId: 1, action: "updated", createdAt: old },
    });
    await prisma.notification.create({ data: { userId: pic.userId, activityEventId: projectEvent.id, reason: "assigned" } });

    await deleteExpiredActivityEvents();

    expect(await prisma.activityEvent.findUnique({ where: { id: projectEvent.id } })).toBeNull();
    expect(await prisma.notification.count({ where: { activityEventId: projectEvent.id } })).toBe(0);
    expect(await prisma.activityEvent.findUnique({ where: { id: dealEvent.id } })).not.toBeNull();
    expect(await prisma.notification.count({ where: { activityEventId: dealEvent.id } })).toBe(1);
  });
});

describe("filterActiveUsersWhoCanSeeOpportunity", () => {
  it("is active users holding pipeline:view or *, and agrees with canUserSeePipeline", async () => {
    const v = await viewer();
    const admin = await createUserWithRole("ADMIN");
    const tam = await tamOnly();
    const inactive = await viewer();
    await prisma.user.update({ where: { id: inactive.userId }, data: { active: false } });
    const all = [v, admin, tam, inactive].map((x) => x.userId);
    const visible = await filterActiveUsersWhoCanSeeOpportunity(prisma, [...all, 999_999_999]);
    expect([...visible].sort()).toEqual([v.userId, admin.userId].sort());
    expect(canUserSeePipeline({ permissions: ["pipeline:view"] })).toBe(true);
    expect(canUserSeePipeline({ permissions: ["*"] })).toBe(true);
    expect(canUserSeePipeline({ permissions: ["pipeline:edit_all"] })).toBe(false);
  });
});
