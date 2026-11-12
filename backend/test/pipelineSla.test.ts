// Pure-function suite — no DB. Table-driven over PIPELINE_SLA's 6 rows
// (§3.6 / §5 item 8): none/warning/critical, waiting vs activity basis,
// closed -> none. `now` is fixed to a Friday (2026-09-25) with every "from"
// date computed backward across the SAME calendar week (or one clean
// weekend, 2026 has no Indonesian public holiday in September), so each
// case's expected day count is exact and independent of workingDays.test.ts.
import { describe, expect, it } from "vitest";
import { PipelineOutcome, PipelineStage, PipelineStatusTag, PipelineSubStatus } from "@prisma/client";
import { computeIdle, PIPELINE_SLA } from "../src/lib/pipelineSla.js";

const NOW = new Date("2026-09-25T00:00:00.000Z"); // Friday

// "from" dates such that workingDaysBetween(from, NOW) === the given working
// day count (verified against lib/workingDays.ts directly in
// workingDays.test.ts) — Sept 2026 has no Indonesian public holiday, so
// those are plain weekday-counting offsets; the August one (29) was read
// off workingDaysBetween itself, which also skips that month's holidays.
const DAYS_AGO: Record<number, string> = {
  2: "2026-09-23",
  3: "2026-09-22",
  4: "2026-09-21",
  5: "2026-09-18",
  6: "2026-09-17",
  7: "2026-09-16",
  8: "2026-09-15",
  14: "2026-09-07",
  15: "2026-09-04",
  29: "2026-08-13",
};

function since(n: number): Date {
  return new Date(`${DAYS_AGO[n]}T00:00:00.000Z`);
}

interface DealInput {
  stage: PipelineStage;
  outcome: PipelineOutcome | null;
  subStatus: PipelineSubStatus | null;
  statusTag: PipelineStatusTag | null;
  waitingInputSince: Date | null;
  lastActivityAt: Date;
}

function baseDeal(stage: PipelineStage): DealInput {
  return {
    stage,
    outcome: null,
    subStatus: PipelineSubStatus.PROGRESS,
    statusTag: null,
    waitingInputSince: null,
    lastActivityAt: NOW, // "just now" — activity basis, 0 days, none
  };
}

describe("computeIdle — closed deal", () => {
  it("is always none/0/null regardless of stage or subStatus", () => {
    const deal: DealInput = {
      stage: PipelineStage.WAITING_RESPONSE,
      outcome: PipelineOutcome.WON,
      subStatus: null,
      statusTag: null,
      waitingInputSince: since(15),
      lastActivityAt: since(15),
    };
    expect(computeIdle(deal, NOW)).toEqual({ level: "none", days: 0, basis: null });
  });
});

describe("computeIdle — waiting basis (subStatus WAITING_SALES_INPUT)", () => {
  const waitingCases: { stage: PipelineStage; waitingDays: number }[] = [
    { stage: PipelineStage.ASSESSMENT, waitingDays: 14 },
    { stage: PipelineStage.TECHNICAL_CLARIFICATION, waitingDays: 14 },
    { stage: PipelineStage.RFP, waitingDays: 14 },
    { stage: PipelineStage.POC, waitingDays: 14 },
    { stage: PipelineStage.DELIVER_PROPOSAL, waitingDays: 14 },
  ];

  it.each(waitingCases)(
    "$stage: none at exactly waitingDays, warning past it, critical past 2x",
    ({ stage, waitingDays }) => {
      expect(PIPELINE_SLA[stage].waitingDays).toBe(waitingDays);

      const atLimit: DealInput = {
        ...baseDeal(stage),
        subStatus: PipelineSubStatus.WAITING_SALES_INPUT,
        waitingInputSince: since(waitingDays),
      };
      expect(computeIdle(atLimit, NOW)).toEqual({ level: "none", days: waitingDays, basis: "waiting" });

      const overLimit: DealInput = {
        ...baseDeal(stage),
        subStatus: PipelineSubStatus.WAITING_SALES_INPUT,
        waitingInputSince: since(waitingDays + 1),
      };
      expect(computeIdle(overLimit, NOW)).toEqual({
        level: "warning",
        days: waitingDays + 1,
        basis: "waiting",
      });

      const criticalDays = waitingDays * 2 + 1;
      const critical: DealInput = {
        ...baseDeal(stage),
        subStatus: PipelineSubStatus.WAITING_SALES_INPUT,
        waitingInputSince: since(criticalDays),
      };
      expect(computeIdle(critical, NOW)).toEqual({ level: "critical", days: criticalDays, basis: "waiting" });
    },
  );

  it("Waiting Response has no waitingDays — a (defensive, shouldn't occur via PATCH) waiting subStatus never escalates past none", () => {
    expect(PIPELINE_SLA[PipelineStage.WAITING_RESPONSE].waitingDays).toBeNull();
    const deal: DealInput = {
      ...baseDeal(PipelineStage.WAITING_RESPONSE),
      subStatus: PipelineSubStatus.WAITING_SALES_INPUT,
      waitingInputSince: since(15),
    };
    expect(computeIdle(deal, NOW)).toEqual({ level: "none", days: 15, basis: "waiting" });
  });
});

describe("computeIdle — activity basis (subStatus PROGRESS or null)", () => {
  const activityCases: { stage: PipelineStage; idleWarningDays: number }[] = [
    { stage: PipelineStage.ASSESSMENT, idleWarningDays: 5 },
    { stage: PipelineStage.TECHNICAL_CLARIFICATION, idleWarningDays: 5 },
    { stage: PipelineStage.RFP, idleWarningDays: 5 },
    { stage: PipelineStage.POC, idleWarningDays: 7 },
    { stage: PipelineStage.DELIVER_PROPOSAL, idleWarningDays: 7 },
  ];

  it.each(activityCases)(
    "$stage: none at exactly idleWarningDays, warning past it, never critical (idleCriticalDays is null)",
    ({ stage, idleWarningDays }) => {
      expect(PIPELINE_SLA[stage].idleCriticalDays).toBeNull();

      const atLimit: DealInput = { ...baseDeal(stage), lastActivityAt: since(idleWarningDays) };
      expect(computeIdle(atLimit, NOW)).toEqual({ level: "none", days: idleWarningDays, basis: "activity" });

      const overLimit: DealInput = { ...baseDeal(stage), lastActivityAt: since(idleWarningDays + 1) };
      expect(computeIdle(overLimit, NOW)).toEqual({
        level: "warning",
        days: idleWarningDays + 1,
        basis: "activity",
      });

      // Far past idleWarningDays — still "warning", never "critical", since
      // this stage's idleCriticalDays is null.
      const wayOver: DealInput = { ...baseDeal(stage), lastActivityAt: since(15) };
      expect(computeIdle(wayOver, NOW).level).toBe("warning");
    },
  );

  it("Waiting Response: none at 7, warning at 8, critical past 14 (its idleCriticalDays)", () => {
    const sla = PIPELINE_SLA[PipelineStage.WAITING_RESPONSE];
    expect(sla.idleWarningDays).toBe(7);
    expect(sla.idleCriticalDays).toBe(14);

    const none: DealInput = { ...baseDeal(PipelineStage.WAITING_RESPONSE), subStatus: null, lastActivityAt: since(7) };
    expect(computeIdle(none, NOW)).toEqual({ level: "none", days: 7, basis: "activity" });

    const warning: DealInput = {
      ...baseDeal(PipelineStage.WAITING_RESPONSE),
      subStatus: null,
      lastActivityAt: since(8),
    };
    expect(computeIdle(warning, NOW)).toEqual({ level: "warning", days: 8, basis: "activity" });

    const critical: DealInput = {
      ...baseDeal(PipelineStage.WAITING_RESPONSE),
      subStatus: null,
      lastActivityAt: since(15),
    };
    expect(computeIdle(critical, NOW)).toEqual({ level: "critical", days: 15, basis: "activity" });
  });
});

describe("computeIdle — Hold suppresses idle (feedback-round F4)", () => {
  const stale = (statusTag: PipelineStatusTag | null): DealInput => ({
    ...baseDeal(PipelineStage.WAITING_RESPONSE),
    statusTag,
    lastActivityAt: since(15), // past the 7 and 14 day thresholds
  });

  it("a HOLD deal past every threshold reports none/0/null", () => {
    expect(computeIdle(stale(PipelineStatusTag.HOLD), NOW)).toEqual({
      level: "none",
      days: 0,
      basis: null,
    });
  });

  it("a HOLD deal waiting on Sales input does not idle either", () => {
    const deal: DealInput = {
      ...baseDeal(PipelineStage.POC),
      statusTag: PipelineStatusTag.HOLD,
      subStatus: PipelineSubStatus.WAITING_SALES_INPUT,
      waitingInputSince: since(15),
    };
    expect(computeIdle(deal, NOW).level).toBe("none");
  });

  it("the same deal with no tag or DELAYED keeps its level", () => {
    expect(computeIdle(stale(null), NOW)).toMatchObject({ level: "critical", basis: "activity" });
    expect(computeIdle(stale(PipelineStatusTag.DELAYED), NOW)).toMatchObject({
      level: "critical",
      basis: "activity",
    });
  });

  // The release stamping itself is pinned at route level in pipelineHoldRelease.test.ts.
});
