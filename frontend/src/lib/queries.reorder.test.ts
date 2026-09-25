import { describe, expect, it } from "vitest";
import { applyMoveSideEffects, reorderOpportunitiesLocally, type Opportunity } from "./queries";

// Pure-function coverage for `reorderOpportunitiesLocally` (M2 review
// finding N5) — the local-cache mirror of the server's insertAtStage /
// closeGapInStage pair (backend/src/routes/opportunities.ts's POST
// /:id/move). Placed alongside queries.ts itself (a `queries.<topic>.test.ts`
// split) rather than under components/pipeline/ — this is a queries.ts-owned
// pure helper, not board/adapter logic, and this repo has no existing
// `queries.test.ts` precedent to slot into (the task-board equivalent,
// `reorderTasksLocally`, has no dedicated test file of its own either).

function makeOpportunity(
  overrides: Partial<Opportunity> & Pick<Opportunity, "id" | "stage" | "stageOrder">,
): Opportunity {
  return {
    title: "Deal",
    customerName: "Acme Corp",
    dealValue: 0,
    subStatus: "PROGRESS",
    waitingInputSince: null,
    statusTag: null,
    outcome: null,
    outcomeReasonCategory: null,
    outcomeReason: null,
    closedAt: null,
    lastActivityAt: "2026-08-01T00:00:00.000Z",
    picId: null,
    pic: null,
    deadline: null,
    requestDate: null,
    description: null,
    productSolution: "",
    leadSource: null,
    winProbability: 50,
    wonAt: null,
    owner: "sa",
    idle: { level: "none", days: 0, basis: null },
    projectId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// Order + id (stageOrder asc / id asc — same canonical tiebreak
// compareDealsByStageOrder in components/pipeline/adapter.ts uses) of every
// deal currently in `stage`, for compact assertions.
function stageOrder(opportunities: Opportunity[], stage: string): Array<[string, number]> {
  return opportunities
    .filter((o) => o.stage === stage)
    .sort((a, b) => a.stageOrder - b.stageOrder)
    .map((o) => [o.id, o.stageOrder]);
}

describe("reorderOpportunitiesLocally", () => {
  it("same-position move: reinserting a deal at the index it already occupies leaves the stage order unchanged", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
      makeOpportunity({ id: "c", stage: "RFP", stageOrder: 2 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "b", "RFP", 1);

    expect(stageOrder(result, "RFP")).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("same-stage move UP: moving the last card to the top re-packs the rest downward", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
      makeOpportunity({ id: "c", stage: "RFP", stageOrder: 2 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "c", "RFP", 0);

    expect(stageOrder(result, "RFP")).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("same-stage move DOWN: moving the first card to the bottom re-packs the rest upward", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
      makeOpportunity({ id: "c", stage: "RFP", stageOrder: 2 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "a", "RFP", 2);

    expect(stageOrder(result, "RFP")).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 2],
    ]);
  });

  it("cross-stage move into an empty target stage lands the deal at stageOrder 0", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "ASSESSMENT", stageOrder: 0 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "a", "WAITING_RESPONSE", 0);

    const moved = result.find((o) => o.id === "a")!;
    expect(moved.stage).toBe("WAITING_RESPONSE");
    expect(moved.stageOrder).toBe(0);
    expect(stageOrder(result, "ASSESSMENT")).toEqual([]);
  });

  it("cross-stage move: the source stage's remaining siblings are re-packed to dense 0..n-1 (gap closed)", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
      makeOpportunity({ id: "c", stage: "RFP", stageOrder: 2 }),
      makeOpportunity({ id: "w", stage: "WAITING_RESPONSE", stageOrder: 0 }),
    ];

    // Move the MIDDLE RFP deal out entirely.
    const result = reorderOpportunitiesLocally(deals, "b", "WAITING_RESPONSE", 1);

    // RFP's remaining siblings (a, c) close the gap left by b: 0, 1 — not 0, 2.
    expect(stageOrder(result, "RFP")).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
    // WAITING_RESPONSE gains b at the requested index, after the pre-existing deal.
    expect(stageOrder(result, "WAITING_RESPONSE")).toEqual([
      ["w", 0],
      ["b", 1],
    ]);
  });

  it("clamps a requested index past the end of the target stage's siblings to append-at-bottom", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "POC", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "POC", stageOrder: 1 }),
      makeOpportunity({ id: "x", stage: "DELIVER_PROPOSAL", stageOrder: 0 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "x", "POC", 999);

    expect(stageOrder(result, "POC")).toEqual([
      ["a", 0],
      ["b", 1],
      ["x", 2],
    ]);
  });

  it("clamps a negative requested index to the top of the target stage", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "POC", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "POC", stageOrder: 1 }),
      makeOpportunity({ id: "x", stage: "DELIVER_PROPOSAL", stageOrder: 0 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "x", "POC", -5);

    expect(stageOrder(result, "POC")).toEqual([
      ["x", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("leaves every other stage's siblings untouched", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
      makeOpportunity({ id: "d1", stage: "DELIVER_PROPOSAL", stageOrder: 0 }),
      makeOpportunity({ id: "d2", stage: "DELIVER_PROPOSAL", stageOrder: 1 }),
    ];

    const result = reorderOpportunitiesLocally(deals, "a", "RFP", 1);

    expect(stageOrder(result, "DELIVER_PROPOSAL")).toEqual([
      ["d1", 0],
      ["d2", 1],
    ]);
  });

  it("returns the input array unchanged (by reference) when the moved id doesn't exist", () => {
    const deals = [makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 })];

    const result = reorderOpportunitiesLocally(deals, "does-not-exist", "WAITING_RESPONSE", 0);

    expect(result).toBe(deals);
  });

  it("does not mutate the input array", () => {
    const deals = [
      makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 }),
      makeOpportunity({ id: "b", stage: "RFP", stageOrder: 1 }),
    ];
    const snapshot = deals.map((o) => ({ ...o }));

    reorderOpportunitiesLocally(deals, "a", "WAITING_RESPONSE", 0);

    expect(deals).toEqual(snapshot);
  });
});

describe("applyMoveSideEffects", () => {
  it("entering WAITING_RESPONSE clears subStatus/waitingInputSince and flips owner to client", () => {
    const deal = makeOpportunity({
      id: "a",
      stage: "RFP",
      stageOrder: 0,
      owner: "sa",
      subStatus: "WAITING_SALES_INPUT",
      waitingInputSince: "2026-08-01T00:00:00.000Z",
    });

    const result = applyMoveSideEffects(deal, "RFP", "WAITING_RESPONSE");

    expect(result.owner).toBe("client");
    expect(result.subStatus).toBeNull();
    expect(result.waitingInputSince).toBeNull();
  });

  it("leaving WAITING_RESPONSE resets subStatus to PROGRESS and flips owner back to sa", () => {
    const deal = makeOpportunity({
      id: "a",
      stage: "WAITING_RESPONSE",
      stageOrder: 0,
      owner: "client",
      subStatus: null,
      waitingInputSince: null,
    });

    const result = applyMoveSideEffects(deal, "WAITING_RESPONSE", "RFP");

    expect(result.owner).toBe("sa");
    expect(result.subStatus).toBe("PROGRESS");
    expect(result.waitingInputSince).toBeNull();
  });

  it("a transition between two SA-owned stages leaves subStatus/waitingInputSince untouched", () => {
    const deal = makeOpportunity({
      id: "a",
      stage: "ASSESSMENT",
      stageOrder: 0,
      owner: "sa",
      subStatus: "WAITING_SALES_INPUT",
      waitingInputSince: "2026-08-01T00:00:00.000Z",
    });

    const result = applyMoveSideEffects(deal, "ASSESSMENT", "RFP");

    expect(result.owner).toBe("sa");
    expect(result.subStatus).toBe("WAITING_SALES_INPUT");
    expect(result.waitingInputSince).toBe("2026-08-01T00:00:00.000Z");
  });

  it("does not mutate the input deal", () => {
    const deal = makeOpportunity({ id: "a", stage: "RFP", stageOrder: 0 });
    const snapshot = { ...deal };

    applyMoveSideEffects(deal, "RFP", "WAITING_RESPONSE");

    expect(deal).toEqual(snapshot);
  });
});
