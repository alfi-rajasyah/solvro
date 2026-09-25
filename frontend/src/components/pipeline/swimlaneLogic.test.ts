import { describe, expect, it } from "vitest";
import {
  dealsInCell,
  groupIntoLanes,
  laneSummary,
  stageSummaries,
  SWIMLANE_STAGES,
  type SwimlaneDeal,
} from "./swimlaneLogic";

function deal(overrides: Partial<SwimlaneDeal> & Pick<SwimlaneDeal, "id" | "stage">): SwimlaneDeal {
  return {
    title: "Deal",
    dealValue: 0,
    picId: null,
    pic: null,
    deadline: null,
    outcome: null,
    ...overrides,
  };
}

describe("SWIMLANE_STAGES", () => {
  it("is the full 6-stage board order — nothing left to exclude post-2026-09-25 redesign", () => {
    expect(SWIMLANE_STAGES).toEqual([
      "ASSESSMENT",
      "TECHNICAL_CLARIFICATION",
      "POC",
      "RFP",
      "DELIVER_PROPOSAL",
      "WAITING_RESPONSE",
    ]);
  });
});

describe("groupIntoLanes", () => {
  it("groups by picId and sorts lanes by display name ascending", () => {
    const deals = [
      deal({ id: "1", stage: "RFP", picId: 2, pic: { id: 2, username: "Zoe" } }),
      deal({ id: "2", stage: "ASSESSMENT", picId: 1, pic: { id: 1, username: "Amir" } }),
      deal({ id: "3", stage: "WAITING_RESPONSE", picId: 1, pic: { id: 1, username: "Amir" } }),
    ];

    const lanes = groupIntoLanes(deals);

    expect(lanes.map((l) => l.picName)).toEqual(["Amir", "Zoe"]);
    expect(lanes[0].deals.map((d) => d.id)).toEqual(["2", "3"]);
    expect(lanes[1].deals.map((d) => d.id)).toEqual(["1"]);
  });

  it("buckets a null picId into a single 'Unassigned' lane", () => {
    const deals = [
      deal({ id: "1", stage: "RFP", picId: null, pic: null }),
      deal({ id: "2", stage: "POC", picId: null, pic: null }),
    ];

    const lanes = groupIntoLanes(deals);

    expect(lanes).toHaveLength(1);
    expect(lanes[0].picName).toBe("Unassigned");
    expect(lanes[0].picId).toBeNull();
    expect(lanes[0].deals.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("sorts 'Unassigned' alphabetically alongside named lanes, not pinned first/last", () => {
    const deals = [
      deal({ id: "1", stage: "RFP", picId: null, pic: null }), // "Unassigned"
      deal({ id: "2", stage: "RFP", picId: 1, pic: { id: 1, username: "Amir" } }),
      deal({ id: "3", stage: "RFP", picId: 2, pic: { id: 2, username: "Zoe" } }),
    ];

    const lanes = groupIntoLanes(deals);

    // "Amir" < "Unassigned" < "Zoe" under localeCompare — mirrors the
    // reference's plain string sort, no special-casing for the unassigned bucket.
    expect(lanes.map((l) => l.picName)).toEqual(["Amir", "Unassigned", "Zoe"]);
  });

  it("preserves input order within a lane and does not mutate the input array", () => {
    const deals = [
      deal({ id: "b", stage: "RFP", picId: 1, pic: { id: 1, username: "Amir" } }),
      deal({ id: "a", stage: "WAITING_RESPONSE", picId: 1, pic: { id: 1, username: "Amir" } }),
    ];
    const snapshot = [...deals];

    const lanes = groupIntoLanes(deals);

    expect(lanes[0].deals.map((d) => d.id)).toEqual(["b", "a"]);
    expect(deals).toEqual(snapshot);
  });

  it("returns an empty array for an empty deal list", () => {
    expect(groupIntoLanes([])).toEqual([]);
  });
});

describe("dealsInCell", () => {
  it("filters a lane's deals down to one stage", () => {
    const lane = {
      picId: 1,
      picName: "Amir",
      pic: { id: 1, username: "Amir" },
      deals: [
        deal({ id: "1", stage: "RFP" }),
        deal({ id: "2", stage: "WAITING_RESPONSE" }),
        deal({ id: "3", stage: "RFP" }),
      ],
    };

    expect(dealsInCell(lane, "RFP").map((d) => d.id)).toEqual(["1", "3"]);
    expect(dealsInCell(lane, "POC")).toEqual([]);
  });
});

describe("laneSummary", () => {
  it("sums active (open) deals in the lane", () => {
    const lane = {
      picId: 1,
      picName: "Amir",
      pic: { id: 1, username: "Amir" },
      deals: [
        deal({ id: "1", stage: "RFP", dealValue: 100 }),
        deal({ id: "2", stage: "WAITING_RESPONSE", dealValue: 250 }),
        deal({ id: "3", stage: "POC", dealValue: 50 }),
      ],
    };

    expect(laneSummary(lane)).toEqual({ count: 3, total: 400 });
  });

  it("excludes a closed deal from the count and value sum, even though groupIntoLanes doesn't filter by outcome (S6: second, independent safety net)", () => {
    const lane = {
      picId: 1,
      picName: "Amir",
      pic: { id: 1, username: "Amir" },
      deals: [
        deal({ id: "1", stage: "RFP", dealValue: 100 }),
        deal({ id: "2", stage: "DELIVER_PROPOSAL", dealValue: 999, outcome: "WON" }),
        deal({ id: "3", stage: "ASSESSMENT", dealValue: 50, outcome: "CANCELLED" }),
      ],
    };

    expect(laneSummary(lane)).toEqual({ count: 1, total: 100 });
  });

  it("returns zeroes for a lane with no deals", () => {
    const lane = {
      picId: 1,
      picName: "Amir",
      pic: { id: 1, username: "Amir" },
      deals: [],
    };

    expect(laneSummary(lane)).toEqual({ count: 0, total: 0 });
  });

  it("returns zeroes for a lane whose only deals are closed", () => {
    const lane = {
      picId: 1,
      picName: "Amir",
      pic: { id: 1, username: "Amir" },
      deals: [deal({ id: "1", stage: "DELIVER_PROPOSAL", dealValue: 500, outcome: "WON" })],
    };

    expect(laneSummary(lane)).toEqual({ count: 0, total: 0 });
  });
});

describe("stageSummaries", () => {
  it("sums count + value per stage across all lanes", () => {
    const lanes = groupIntoLanes([
      deal({ id: "1", stage: "RFP", dealValue: 100, picId: 1, pic: { id: 1, username: "Amir" } }),
      deal({ id: "2", stage: "RFP", dealValue: 200, picId: 2, pic: { id: 2, username: "Zoe" } }),
      deal({
        id: "3",
        stage: "WAITING_RESPONSE",
        dealValue: 999,
        picId: 1,
        pic: { id: 1, username: "Amir" },
      }),
    ]);

    const summaries = stageSummaries(lanes);

    expect(summaries.find((s) => s.stage === "RFP")).toEqual({ stage: "RFP", count: 2, total: 300 });
    expect(summaries.find((s) => s.stage === "WAITING_RESPONSE")).toEqual({
      stage: "WAITING_RESPONSE",
      count: 1,
      total: 999,
    });
    expect(summaries.find((s) => s.stage === "ASSESSMENT")).toEqual({
      stage: "ASSESSMENT",
      count: 0,
      total: 0,
    });
  });

  it("always returns every SWIMLANE_STAGES entry, in order, even for an empty lane list", () => {
    const summaries = stageSummaries([]);
    expect(summaries.map((s) => s.stage)).toEqual(SWIMLANE_STAGES);
    for (const s of summaries) {
      expect(s).toMatchObject({ count: 0, total: 0 });
    }
  });
});
