import { describe, expect, it } from "vitest";
import type { PipelineStage } from "@/lib/pipelineFormat";
import type { Opportunity, OpportunityPic } from "@/lib/queries";
import {
  computeCloseReasons,
  computeMonthlyTrend,
  computePicLeaderboard,
  computeStageFunnel,
  computeWinRatePct,
  computeWorkloadHeatmap,
  dealsForPic,
  HEATMAP_STAGES,
  OVERLOAD_THRESHOLD,
  UNDERLOAD_THRESHOLD,
  workloadStatusTone,
} from "./analytics";

const PIC_A: OpportunityPic = { id: 1, username: "alice", avatarUrl: null };
const PIC_B: OpportunityPic = { id: 2, username: "bob", avatarUrl: null };

function opp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    title: "Deal",
    customerName: "Acme",
    dealValue: 0,
    stage: "ASSESSMENT",
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
    stageOrder: 0,
    wonAt: null,
    owner: "sa",
    idle: { level: "none", days: 0, basis: null },
    projectId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeStageFunnel", () => {
  it("covers all 6 board stages, counting active deals only", () => {
    const funnel = computeStageFunnel([
      opp({ stage: "ASSESSMENT", dealValue: 100 }),
      opp({ stage: "ASSESSMENT", dealValue: 50 }),
      // Closed deal parked in DELIVER_PROPOSAL must not inflate that column.
      opp({ stage: "DELIVER_PROPOSAL", dealValue: 9_999, outcome: "WON" }),
      opp({ stage: "ASSESSMENT", dealValue: 9_999, outcome: "CANCELLED" }),
    ]);

    expect(funnel.map((f) => f.stage)).toEqual([
      "ASSESSMENT",
      "TECHNICAL_CLARIFICATION",
      "POC",
      "RFP",
      "DELIVER_PROPOSAL",
      "WAITING_RESPONSE",
    ] satisfies PipelineStage[]);

    const assessment = funnel.find((f) => f.stage === "ASSESSMENT")!;
    expect(assessment.count).toBe(2);
    expect(assessment.value).toBe(150);

    const rfp = funnel.find((f) => f.stage === "RFP")!;
    expect(rfp.count).toBe(0);
    expect(rfp.value).toBe(0);

    const deliverProposal = funnel.find((f) => f.stage === "DELIVER_PROPOSAL")!;
    expect(deliverProposal.count).toBe(0);
    expect(deliverProposal.value).toBe(0);
  });
});

describe("computePicLeaderboard", () => {
  it("computes active/won counts+values per PIC and drops unassigned deals", () => {
    const rows = computePicLeaderboard([
      opp({ stage: "ASSESSMENT", dealValue: 100, picId: 1, pic: PIC_A }),
      opp({ stage: "DELIVER_PROPOSAL", dealValue: 500, picId: 1, pic: PIC_A, outcome: "WON" }),
      opp({ stage: "ASSESSMENT", dealValue: 999, picId: 1, pic: PIC_A, outcome: "CANCELLED" }),
      opp({ stage: "RFP", dealValue: 200, picId: null, pic: null }), // unassigned — excluded
    ]);

    expect(rows).toHaveLength(1);
    const alice = rows[0];
    expect(alice.picId).toBe(1);
    expect(alice.picName).toBe("alice");
    expect(alice.activeCount).toBe(1); // ASSESSMENT only — Won/Cancelled are closed
    expect(alice.activeValue).toBe(100);
    expect(alice.wonCount).toBe(1);
    expect(alice.wonValue).toBe(500);
    expect(alice.lostOrCancelledCount).toBe(1);
  });

  it("defines win rate as won / (won + lostOrCancelled), rounded, 0 with no closed deals", () => {
    const [noClosed] = computePicLeaderboard([
      opp({ stage: "ASSESSMENT", picId: 1, pic: PIC_A }),
    ]);
    expect(noClosed.winRatePct).toBe(0);

    const [mixed] = computePicLeaderboard([
      opp({ picId: 1, pic: PIC_A, outcome: "WON" }),
      opp({ picId: 1, pic: PIC_A, outcome: "WON" }),
      opp({ picId: 1, pic: PIC_A, outcome: "CANCELLED" }),
      // Active deals must not dilute the win-rate denominator.
      opp({ stage: "RFP", picId: 1, pic: PIC_A }),
    ]);
    expect(mixed.winRatePct).toBe(67); // 2 / (2 + 1) = 66.67% -> rounds to 67
  });

  it("sorts by wonValue descending, tiebroken by activeValue then name", () => {
    const rows = computePicLeaderboard([
      opp({ dealValue: 100, picId: 1, pic: PIC_A, outcome: "WON" }),
      opp({ dealValue: 300, picId: 2, pic: PIC_B, outcome: "WON" }),
    ]);
    expect(rows.map((r) => r.picId)).toEqual([2, 1]);
  });
});

describe("computeMonthlyTrend", () => {
  const NOW = new Date(Date.UTC(2026, 7, 15)); // 2026-08-15T00:00:00Z

  it("zero-fills a trailing 12-month window ending at now's UTC month, ascending", () => {
    const trend = computeMonthlyTrend([], NOW);
    expect(trend).toHaveLength(12);
    expect(trend[0].month).toBe("2025-09");
    expect(trend[11].month).toBe("2026-08");
    expect(trend.every((p) => p.created === 0 && p.won === 0)).toBe(true);
  });

  it("crosses a year boundary correctly", () => {
    const trend = computeMonthlyTrend([], new Date(Date.UTC(2026, 0, 5))); // Jan 2026
    expect(trend[0].month).toBe("2025-02");
    expect(trend[11].month).toBe("2026-01");
  });

  it("buckets createdAt/wonAt by UTC calendar month via string slicing (TZ-stable)", () => {
    const trend = computeMonthlyTrend(
      [
        // Last instant of January (UTC) — must land in "2026-01", not spill
        // into February the way a LOCAL-timezone `getMonth()` read could.
        opp({ createdAt: "2026-01-31T23:59:59.999Z", wonAt: null }),
        // First instant of February (UTC) — must land in "2026-02".
        opp({ createdAt: "2026-02-01T00:00:00.000Z", wonAt: "2026-02-01T00:00:00.000Z" }),
      ],
      new Date(Date.UTC(2026, 1, 15)), // now = Feb 2026
    );

    const jan = trend.find((p) => p.month === "2026-01")!;
    const feb = trend.find((p) => p.month === "2026-02")!;
    expect(jan.created).toBe(1);
    expect(jan.won).toBe(0);
    expect(feb.created).toBe(1);
    expect(feb.won).toBe(1);
  });

  it("ignores a wonAt outside the trailing window", () => {
    const trend = computeMonthlyTrend(
      [opp({ createdAt: "2020-01-01T00:00:00.000Z", wonAt: "2020-01-01T00:00:00.000Z" })],
      new Date(Date.UTC(2026, 7, 15)),
    );
    expect(trend.reduce((sum, p) => sum + p.created + p.won, 0)).toBe(0);
  });
});

describe("computeWorkloadHeatmap", () => {
  it("HEATMAP_STAGES is the full 6-stage STAGE_ORDER — nothing left to exclude post-redesign", () => {
    expect(HEATMAP_STAGES).toEqual([
      "ASSESSMENT",
      "TECHNICAL_CLARIFICATION",
      "POC",
      "RFP",
      "DELIVER_PROPOSAL",
      "WAITING_RESPONSE",
    ]);
    expect(HEATMAP_STAGES).toHaveLength(6);
  });

  it("counts only active deals toward totalActive — a closed deal does not count, a Held one does", () => {
    const [row] = computeWorkloadHeatmap([
      opp({ stage: "ASSESSMENT", picId: 1, pic: PIC_A }),
      opp({ stage: "RFP", picId: 1, pic: PIC_A }),
      // On Hold is a tag, not a terminal state (2026-09-25 redesign) — still active.
      opp({ stage: "POC", picId: 1, pic: PIC_A, statusTag: "HOLD" }),
      opp({ stage: "DELIVER_PROPOSAL", picId: 1, pic: PIC_A, outcome: "WON" }),
    ]);
    expect(row.totalActive).toBe(3);
    expect(row.byStage.find((s) => s.stage === "ASSESSMENT")?.count).toBe(1);
    expect(row.byStage.find((s) => s.stage === "RFP")?.count).toBe(1);
    expect(row.byStage.find((s) => s.stage === "POC")?.count).toBe(1);
  });

  it(`applies overload (> ${OVERLOAD_THRESHOLD}) / underload (< ${UNDERLOAD_THRESHOLD}) thresholds`, () => {
    const manyDeals = Array.from({ length: 7 }, () => opp({ stage: "ASSESSMENT", picId: 1, pic: PIC_A }));
    const [overloaded] = computeWorkloadHeatmap(manyDeals);
    expect(overloaded.status).toBe("overload");

    const [underloaded] = computeWorkloadHeatmap([opp({ stage: "ASSESSMENT", picId: 2, pic: PIC_B })]);
    expect(underloaded.status).toBe("underload");

    const normalDeals = Array.from({ length: 3 }, () => opp({ stage: "ASSESSMENT", picId: 1, pic: PIC_A }));
    const [normal] = computeWorkloadHeatmap(normalDeals);
    expect(normal.status).toBe("normal");
  });

  it("sorts overload first, then normal, then underload", () => {
    const deals = [
      opp({ stage: "ASSESSMENT", picId: 2, pic: PIC_B }), // 1 deal -> underload
      ...Array.from({ length: 7 }, () => opp({ stage: "ASSESSMENT", picId: 1, pic: PIC_A })), // overload
    ];
    const rows = computeWorkloadHeatmap(deals);
    expect(rows.map((r) => r.status)).toEqual(["overload", "underload"]);
  });
});

describe("workloadStatusTone", () => {
  it("maps overload/underload/normal to rose/amber/emerald", () => {
    expect(workloadStatusTone("overload")).toBe("rose");
    expect(workloadStatusTone("underload")).toBe("amber");
    expect(workloadStatusTone("normal")).toBe("emerald");
  });
});

describe("dealsForPic", () => {
  it("filters to the given PIC and sorts by stageOrder then id (same stage)", () => {
    const deals = [
      opp({ id: "b", picId: 1, pic: PIC_A, stageOrder: 2 }),
      opp({ id: "a", picId: 1, pic: PIC_A, stageOrder: 1 }),
      opp({ id: "c", picId: 2, pic: PIC_B, stageOrder: 0 }),
    ];
    const result = dealsForPic(deals, 1);
    expect(result.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("sorts by board stage position first, before the per-stage stageOrder value (finding N1)", () => {
    // `stageOrder` is only dense/comparable WITHIN a single stage's own
    // sibling list — a later-board-stage deal at stageOrder 0 must still
    // sort AFTER an earlier-board-stage deal at a higher stageOrder, not
    // before it, once deals span more than one stage.
    const deals = [
      opp({ id: "waiting-0", picId: 1, pic: PIC_A, stage: "WAITING_RESPONSE", stageOrder: 0 }),
      opp({ id: "assessment-5", picId: 1, pic: PIC_A, stage: "ASSESSMENT", stageOrder: 5 }),
      opp({ id: "rfp-0", picId: 1, pic: PIC_A, stage: "RFP", stageOrder: 0 }),
    ];
    const result = dealsForPic(deals, 1);
    expect(result.map((d) => d.id)).toEqual(["assessment-5", "rfp-0", "waiting-0"]);
  });
});

describe("computeCloseReasons", () => {
  it("groups LOST/CANCELLED deals by (stage, outcome, category), closed in the given year", () => {
    const rows = computeCloseReasons(
      [
        opp({
          stage: "RFP",
          dealValue: 100,
          outcome: "LOST",
          outcomeReasonCategory: "PRICE",
          closedAt: "2026-03-01T00:00:00.000Z",
        }),
        opp({
          stage: "RFP",
          dealValue: 200,
          outcome: "LOST",
          outcomeReasonCategory: "PRICE",
          closedAt: "2026-06-01T00:00:00.000Z",
        }),
        opp({
          stage: "ASSESSMENT",
          dealValue: 50,
          outcome: "CANCELLED",
          outcomeReasonCategory: "BUDGET_WITHDRAWN",
          closedAt: "2026-01-01T00:00:00.000Z",
        }),
        // Won deal never appears — no reason category applies.
        opp({ stage: "RFP", outcome: "WON", closedAt: "2026-05-01T00:00:00.000Z" }),
        // Open deal never appears.
        opp({ stage: "RFP", outcome: null }),
        // Closed in a different year — excluded.
        opp({
          stage: "RFP",
          outcome: "LOST",
          outcomeReasonCategory: "PRICE",
          closedAt: "2025-06-01T00:00:00.000Z",
        }),
      ],
      2026,
    );

    expect(rows).toHaveLength(2);
    const rfpPrice = rows.find((r) => r.stage === "RFP")!;
    expect(rfpPrice).toMatchObject({ outcome: "LOST", category: "PRICE", count: 2, value: 300 });
    const assessmentBudget = rows.find((r) => r.stage === "ASSESSMENT")!;
    expect(assessmentBudget).toMatchObject({
      outcome: "CANCELLED",
      category: "BUDGET_WITHDRAWN",
      count: 1,
      value: 50,
    });
  });

  it("keeps a LOST/OTHER and a CANCELLED/OTHER row in the same stage separate (shared category value)", () => {
    const rows = computeCloseReasons(
      [
        opp({
          stage: "POC",
          dealValue: 10,
          outcome: "LOST",
          outcomeReasonCategory: "OTHER",
          closedAt: "2026-01-01T00:00:00.000Z",
        }),
        opp({
          stage: "POC",
          dealValue: 20,
          outcome: "CANCELLED",
          outcomeReasonCategory: "OTHER",
          closedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      2026,
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.outcome === "LOST")).toMatchObject({ count: 1, value: 10 });
    expect(rows.find((r) => r.outcome === "CANCELLED")).toMatchObject({ count: 1, value: 20 });
  });

  it("returns an empty array when nothing closed in that year", () => {
    expect(computeCloseReasons([opp({ outcome: null })], 2026)).toEqual([]);
  });
});

describe("computeWinRatePct", () => {
  it("is won / closed for deals CLOSED in the given year, rounded", () => {
    const rate = computeWinRatePct(
      [
        opp({ outcome: "WON", closedAt: "2026-01-01T00:00:00.000Z" }),
        opp({ outcome: "WON", closedAt: "2026-06-01T00:00:00.000Z" }),
        opp({ outcome: "LOST", closedAt: "2026-03-01T00:00:00.000Z" }),
        // Closed in a different year — excluded from both numerator and denominator.
        opp({ outcome: "WON", closedAt: "2025-01-01T00:00:00.000Z" }),
        // Still open — excluded.
        opp({ outcome: null }),
      ],
      2026,
    );
    expect(rate).toBe(67); // 2 / 3 = 66.67% -> rounds to 67
  });

  it("is 0 when nothing closed in that year (avoids a 0/0 NaN)", () => {
    expect(computeWinRatePct([opp({ outcome: null })], 2026)).toBe(0);
    expect(computeWinRatePct([], 2026)).toBe(0);
  });

  it("keys off closedAt's year, not createdAt's", () => {
    const rate = computeWinRatePct(
      [
        opp({
          outcome: "WON",
          createdAt: "2025-01-01T00:00:00.000Z",
          closedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      2026,
    );
    expect(rate).toBe(100);
  });

  it("reads the year via string-slice (closedAt.slice(0, 4)), not a Date getter — a UTC year boundary must not walk back a year", () => {
    // Last instant of 2026 in UTC — a LOCAL-timezone `new Date(iso).getFullYear()`
    // read could shift this to 2027 in a timezone east of UTC.
    const rate = computeWinRatePct(
      [opp({ outcome: "WON", closedAt: "2026-12-31T23:59:59.999Z" })],
      2026,
    );
    expect(rate).toBe(100);
  });
});
