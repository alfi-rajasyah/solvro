import { describe, expect, it } from "vitest";
import type { PipelineStage } from "@/lib/pipelineFormat";
import { computePipelineKpis, daysUntilDeadline, isActiveDeal, isDealOverdue, probabilityTone } from "./kpi";
import type { PipelineBoardDeal } from "./adapter";

type Deal = Pick<
  PipelineBoardDeal,
  "dealValue" | "stage" | "picId" | "deadline" | "wonAt" | "outcome" | "idle"
>;

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    dealValue: 0,
    stage: "ASSESSMENT",
    picId: null,
    deadline: null,
    wonAt: null,
    outcome: null,
    idle: { level: "none", days: 0, basis: null },
    ...overrides,
  };
}

// Fixed "today" so date-relative assertions don't depend on the wall clock.
const TODAY = new Date(2026, 7, 14); // 2026-08-14, local midnight

describe("daysUntilDeadline / isDealOverdue", () => {
  it("is 0 for a deadline that is today", () => {
    expect(daysUntilDeadline("2026-08-14", TODAY)).toBe(0);
  });

  it("is positive for a future deadline", () => {
    expect(daysUntilDeadline("2026-08-21", TODAY)).toBe(7);
  });

  it("is negative for a past deadline, and that deadline is overdue", () => {
    expect(daysUntilDeadline("2026-08-10", TODAY)).toBe(-4);
    expect(isDealOverdue("2026-08-10", TODAY)).toBe(true);
  });

  it("a future/today deadline is not overdue", () => {
    expect(isDealOverdue("2026-08-14", TODAY)).toBe(false);
    expect(isDealOverdue("2026-08-21", TODAY)).toBe(false);
  });

  it("a null deadline is never overdue", () => {
    expect(isDealOverdue(null, TODAY)).toBe(false);
  });
});

describe("probabilityTone", () => {
  // Single source of truth for OpportunityCard.tsx/PipelineList.tsx/
  // OpportunityDetail.tsx's win% chip (finding S10) — previously three
  // identical, untested, unexported copies.
  it("is emerald at and above 70", () => {
    expect(probabilityTone(70)).toBe("emerald");
    expect(probabilityTone(100)).toBe("emerald");
  });

  it("is amber from 40 up to (not including) 70", () => {
    expect(probabilityTone(40)).toBe("amber");
    expect(probabilityTone(69)).toBe("amber");
  });

  it("is rose below 40", () => {
    expect(probabilityTone(39)).toBe("rose");
    expect(probabilityTone(0)).toBe("rose");
  });
});

describe("isActiveDeal", () => {
  it("is true for a deal with no outcome", () => {
    expect(isActiveDeal({ outcome: null })).toBe(true);
  });

  it("is false once a deal has any outcome (2026-09-25 flow redesign D5 — replaces the old terminal-stage check)", () => {
    expect(isActiveDeal({ outcome: "WON" })).toBe(false);
    expect(isActiveDeal({ outcome: "LOST" })).toBe(false);
    expect(isActiveDeal({ outcome: "CANCELLED" })).toBe(false);
  });
});

describe("computePipelineKpis", () => {
  it("sums deal value across active (outcome === null) deals only, for Total Pipeline", () => {
    const kpis = computePipelineKpis(
      [
        deal({ stage: "ASSESSMENT", dealValue: 100 }),
        deal({ stage: "RFP", dealValue: 200 }),
        deal({ stage: "DELIVER_PROPOSAL", dealValue: 9_999, outcome: "WON" }),
        deal({ stage: "ASSESSMENT", dealValue: 9_999, outcome: "CANCELLED" }),
      ],
      TODAY,
    );
    expect(kpis.totalPipelineValue).toBe(300);
    expect(kpis.activeDealCount).toBe(2);
  });

  it("counts deadline <=7d and <=3d among active deals only", () => {
    const kpis = computePipelineKpis(
      [
        deal({ stage: "ASSESSMENT", deadline: "2026-08-15" }), // +1d: soon + critical
        deal({ stage: "RFP", deadline: "2026-08-20" }), // +6d: soon only
        deal({ stage: "POC", deadline: "2026-09-30" }), // far: neither
        deal({ stage: "POC", deadline: null }), // no deadline: neither
        // Closed deal with a near deadline must NOT count — mirrors Velora's
        // own kpi-bar.tsx deriving deadlineOpps from activeOpps, not the raw list.
        deal({ stage: "DELIVER_PROPOSAL", deadline: "2026-08-15", outcome: "WON" }),
      ],
      TODAY,
    );
    expect(kpis.deadlineSoonCount).toBe(2);
    expect(kpis.deadlineCriticalCount).toBe(1);
  });

  it("reads Won this month from wonAt/outcome, not updated_at/anything else", () => {
    const kpis = computePipelineKpis(
      [
        // Noon UTC, not month-midnight — a UTC calendar-day boundary
        // fixture (e.g. "2026-08-01T00:00:00.000Z") shifts to the prior
        // local calendar day (and month) west of UTC, flaking `isSameMonth`
        // under e.g. TZ=America/Los_Angeles. Noon UTC stays within the same
        // calendar day (and month) in every real-world UTC offset.
        deal({ dealValue: 1_000, outcome: "WON", wonAt: "2026-08-05T12:00:00.000Z" }),
        deal({ dealValue: 2_000, outcome: "WON", wonAt: "2026-08-13T23:00:00.000Z" }),
        // Won last month — excluded even though it's still WON.
        deal({ dealValue: 5_000, outcome: "WON", wonAt: "2026-07-15T12:00:00.000Z" }),
        // WON with no wonAt (shouldn't happen post-close, but must not throw/count).
        deal({ dealValue: 7_000, outcome: "WON", wonAt: null }),
        // Closed as LOST must never count toward "won", regardless of wonAt.
        deal({ dealValue: 3_000, outcome: "LOST", wonAt: null }),
      ],
      TODAY,
    );
    expect(kpis.wonThisMonthValue).toBe(3_000);
    expect(kpis.wonThisMonthCount).toBe(2);
  });

  it("counts distinct PICs among active deals only", () => {
    const kpis = computePipelineKpis(
      [
        deal({ stage: "ASSESSMENT", picId: 1 }),
        deal({ stage: "RFP", picId: 1 }),
        deal({ stage: "RFP", picId: 2 }),
        deal({ stage: "ASSESSMENT", picId: null }),
        // Closed-deal PIC must not count.
        deal({ stage: "DELIVER_PROPOSAL", picId: 3, outcome: "WON" }),
      ],
      TODAY,
    );
    expect(kpis.activePicCount).toBe(2);
  });

  it("counts idle warning/critical among active deals only", () => {
    const kpis = computePipelineKpis(
      [
        deal({ idle: { level: "warning", days: 6, basis: "activity" } }),
        deal({ idle: { level: "warning", days: 8, basis: "waiting" } }),
        deal({ idle: { level: "critical", days: 15, basis: "waiting" } }),
        deal({ idle: { level: "none", days: 1, basis: "activity" } }),
        // Closed deal's idle is always "none" (server-computed) but even if
        // it weren't, a closed deal must not count toward the alert tiles.
        deal({ idle: { level: "critical", days: 30, basis: "waiting" }, outcome: "LOST" }),
      ],
      TODAY,
    );
    expect(kpis.idleWarning).toBe(2);
    expect(kpis.idleCritical).toBe(1);
  });

  it("funnel covers all 6 stages, counting active deals only, including zero-count ones", () => {
    const kpis = computePipelineKpis(
      [
        deal({ stage: "ASSESSMENT" }),
        deal({ stage: "ASSESSMENT" }),
        // Closed deal parked in ASSESSMENT must not inflate that column.
        deal({ stage: "ASSESSMENT", outcome: "CANCELLED" }),
      ],
      TODAY,
    );
    const stages = kpis.funnel.map((f) => f.stage);
    expect(stages).toEqual([
      "ASSESSMENT",
      "TECHNICAL_CLARIFICATION",
      "POC",
      "RFP",
      "DELIVER_PROPOSAL",
      "WAITING_RESPONSE",
    ] satisfies PipelineStage[]);
    expect(kpis.funnel.find((f) => f.stage === "ASSESSMENT")?.count).toBe(2);
    expect(kpis.funnel.find((f) => f.stage === "RFP")?.count).toBe(0);
  });
});
