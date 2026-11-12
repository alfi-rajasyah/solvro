import { PipelineStatusTag, PipelineSubStatus } from "@prisma/client";
import type { Opportunity, PipelineStage } from "@prisma/client";
import { workingDaysBetween } from "./workingDays.js";

// Idle-alert SLA table (opportunity-pipeline-flow-spec §7) and its
// computation (opportunity-flow-redesign D1: computed on every read, never a
// job — no scheduler, no stored `idle_alert` column, no run log). The idle
// numbers are placeholders the team validates; Waiting Sales input is 14
// working days in every stage (user decision 2026-11-12). There is no Admin
// editor for them in this phase (D8/D14).

export const PIPELINE_SLA: Record<
  PipelineStage,
  { waitingDays: number | null; idleWarningDays: number; idleCriticalDays: number | null }
> = {
  ASSESSMENT: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  TECHNICAL_CLARIFICATION: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  POC: { waitingDays: 14, idleWarningDays: 7, idleCriticalDays: null },
  RFP: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  DELIVER_PROPOSAL: { waitingDays: 14, idleWarningDays: 7, idleCriticalDays: null },
  WAITING_RESPONSE: { waitingDays: null, idleWarningDays: 7, idleCriticalDays: 14 },
};

export type IdleLevel = "none" | "warning" | "critical";
export type IdleBasis = "waiting" | "activity" | null;

export interface IdleState {
  level: IdleLevel;
  days: number;
  basis: IdleBasis;
}

type IdleInputDeal = Pick<
  Opportunity,
  "stage" | "outcome" | "subStatus" | "statusTag" | "waitingInputSince" | "lastActivityAt"
>;

/**
 * Closed deal -> `none`/0/null. A deal on Hold never idles
 * (docs/archive/plans/feedback-round-lifecycle-spec.md, F4) — releasing the
 * hold stamps `lastActivityAt`, so the clock restarts from the release. DELAYED
 * deals still go idle. Waiting Sales input -> "waiting" basis off
 * `waitingInputSince` (warning past `waitingDays`, critical past 2x). Every
 * other open deal -> "activity" basis off `lastActivityAt` (warning past
 * `idleWarningDays`, critical only where `idleCriticalDays` is set — today
 * only Waiting Response, past 14).
 */
export function computeIdle(deal: IdleInputDeal, now: Date): IdleState {
  if (deal.outcome !== null || deal.statusTag === PipelineStatusTag.HOLD) {
    return { level: "none", days: 0, basis: null };
  }

  const sla = PIPELINE_SLA[deal.stage];

  if (deal.subStatus === PipelineSubStatus.WAITING_SALES_INPUT && deal.waitingInputSince) {
    const days = workingDaysBetween(deal.waitingInputSince, now);
    let level: IdleLevel = "none";
    if (sla.waitingDays !== null) {
      if (days > sla.waitingDays) level = "warning";
      if (days > sla.waitingDays * 2) level = "critical";
    }
    return { level, days, basis: "waiting" };
  }

  const days = workingDaysBetween(deal.lastActivityAt, now);
  let level: IdleLevel = "none";
  if (days > sla.idleWarningDays) level = "warning";
  if (sla.idleCriticalDays !== null && days > sla.idleCriticalDays) level = "critical";
  return { level, days, basis: "activity" };
}
