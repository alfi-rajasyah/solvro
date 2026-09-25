import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";

// Shared "give me a Won deal" fixture (opportunity-flow-redesign D5: Won is
// an outcome set by POST /opportunities/:id/close, not a creatable stage —
// `createOpportunity(..., { stage: "WON" })` 400s since the redesign).
// Every test file that just needs a Won deal to hand off (not a lens on
// /close itself — that's opportunityClose.test.ts's job) imports this
// instead of hand-rolling its own create-then-close pair.

/**
 * Creates a deal owned (picId) by `userId` and closes it as Won, returning
 * its id. Waiting Response: an arbitrary open-funnel starting stage — the
 * stage a deal reached is locked at close and never resets (D5), so which
 * one it started in doesn't matter to a fixture that only needs the
 * resulting Won deal.
 */
export async function createWonOpportunity(
  app: Express,
  token: string,
  userId: number,
  title = "Won Deal",
): Promise<string> {
  const created = await request(app)
    .post("/opportunities")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, customerName: "Acme Corp", picId: userId, stage: "WAITING_RESPONSE" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;

  const closed = await request(app)
    .post(`/opportunities/${id}/close`)
    .set("Authorization", `Bearer ${token}`)
    .send({ outcome: "WON" });
  expect(closed.status).toBe(200);

  return id;
}
