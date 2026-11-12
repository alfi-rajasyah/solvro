// Pure formatting helpers for the Pipeline (Solution Architect) UI — no
// React, no API calls. See PRD §2.3–§2.7 for the consuming surfaces (board
// cards, opportunity detail, KPI tiles). Currency formatting matches
// Velora's `lib/utils.ts` (../VeloraApp, read-only reference/data source
// per CLAUDE.md) verbatim so the ported UI reads identically to the
// reference app.
import { fmtDayFull } from "./formatDate";

/**
 * Pipeline stage enum, matching `backend/prisma/schema.prisma`'s
 * `PipelineStage` — the API speaks these uppercase enum strings verbatim.
 * Rebuilt 2026-09-25 for the opportunity flow redesign (VP spec,
 * docs/archive/plans/opportunity-flow-redesign.md D2): 6 values, in the spec's
 * order. `WON`, `DROP` and `HOLD` are no longer stages — a deal that's Won,
 * Lost, Cancelled or on Hold keeps the stage it stalled in; see `PipelineOutcome`
 * and `PipelineStatusTag` below for where those states actually live now.
 */
export type PipelineStage =
  | "ASSESSMENT"
  | "TECHNICAL_CLARIFICATION"
  | "POC"
  | "RFP"
  | "DELIVER_PROPOSAL"
  | "WAITING_RESPONSE";

/** Display label per stage, for board columns, chips, and detail surfaces. */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  ASSESSMENT: "Assessment",
  TECHNICAL_CLARIFICATION: "Technical Clarification",
  POC: "PoC",
  RFP: "RFP",
  DELIVER_PROPOSAL: "Delivered Proposal",
  WAITING_RESPONSE: "Waiting Response",
};

/** Board column order, left to right — matches the flow spec's order (D2)
 * and the backend `PipelineStage` Prisma enum's declaration order; the list
 * route sorts `stage asc`, so this order is load-bearing on both sides. */
export const STAGE_ORDER: PipelineStage[] = [
  "ASSESSMENT",
  "TECHNICAL_CLARIFICATION",
  "POC",
  "RFP",
  "DELIVER_PROPOSAL",
  "WAITING_RESPONSE",
];

/**
 * Single source of truth for the "how far along the funnel" alpha ramp
 * every Pipeline funnel-style visualization draws on the shared `primary`
 * accent token — `PipelineKpiBar.tsx`'s `FunnelStrip`,
 * `PipelineOverviewPanel.tsx`'s `StageDistribution`, and
 * `PipelineAnalyticsSection.tsx`'s conversion-funnel chart each previously
 * hand-declared an identical copy of these same numbers (finding N2).
 * Shrunk to the 6 real stages by the 2026-09-25 flow redesign — `WON`/
 * `DROP`/`HOLD` never had a real ramp step (they rendered via their own
 * dedicated rose/amber tone instead, matching `StageChip`), and now aren't
 * `PipelineStage` members at all, so there's nothing left to placeholder.
 * Tailwind-class consumers (PipelineKpiBar.tsx, PipelineOverviewPanel.tsx)
 * can't derive their class strings from this at runtime — Tailwind's
 * content scanner only detects literal `bg-primary/NN` substrings, not
 * string-interpolated ones — so those two sites keep a small local
 * `alpha -> literal class` lookup keyed off these same numbers instead.
 * This Record is the one place the *numbers* themselves live.
 */
export const STAGE_ALPHA: Record<PipelineStage, number> = {
  ASSESSMENT: 0.2,
  TECHNICAL_CLARIFICATION: 0.35,
  POC: 0.5,
  RFP: 0.65,
  DELIVER_PROPOSAL: 0.8,
  WAITING_RESPONSE: 0.95,
};

// ─────────────────────────────────────────────────────────────────────────
// Sub-status / tag / outcome — the flow redesign's independent attributes
// (docs/archive/plans/opportunity-flow-redesign.md §1 D2/§2.1). A deal's stage no
// longer encodes whether it's parked (statusTag), waiting on the Sales team
// (subStatus) or decided (outcome) — those are separate fields the API
// serializes alongside `stage`, mirrored here as their own enums/label maps
// so `PipelineFlagChips.tsx`/`CloseDealDialog.tsx`/`OpportunityDetail.tsx`
// share one source of truth with the backend's Prisma enums (schema.prisma).
// ─────────────────────────────────────────────────────────────────────────

export type PipelineSubStatus = "PROGRESS" | "WAITING_SALES_INPUT";
export type PipelineStatusTag = "HOLD" | "DELAYED";
export type PipelineOutcome = "WON" | "LOST" | "CANCELLED" | "ARCHIVED";
export type PipelineOutcomeReason =
  | "PRICE"
  | "COMPETITOR"
  | "TECHNICAL"
  | "BUDGET_WITHDRAWN"
  | "PROJECT_CANCELLED"
  | "LOST_CONTACT"
  | "OTHER";

/** `computeIdle`'s (backend/src/lib/pipelineSla.ts) three alert levels. */
export type IdleLevel = "none" | "warning" | "critical";

/**
 * `Opportunity.idle`'s shape (D1) — computed server-side on every read from
 * `lastActivityAt`/`waitingInputSince` and the SLA table, never stored or
 * client-computed. One source of truth for the field's shape, used by
 * `queries.ts` (`Opportunity.idle`), `adapter.ts` (`PipelineBoardDeal.idle`)
 * and `PipelineFlagChips.tsx`'s `SubStatusChip`/`IdleChip` props, instead of
 * each redeclaring the same object type literally.
 */
export interface IdleState {
  level: IdleLevel;
  days: number;
  /** Which SLA clock produced `level`/`days` — "waiting" while
   * `subStatus === "WAITING_SALES_INPUT"`, "activity" otherwise; `null` on a
   * closed deal (`level` is always "none" there). */
  basis: "waiting" | "activity" | null;
}

export const SUB_STATUS_LABELS: Record<PipelineSubStatus, string> = {
  PROGRESS: "In progress",
  WAITING_SALES_INPUT: "Waiting Sales input",
};

export const TAG_LABELS: Record<PipelineStatusTag, string> = {
  HOLD: "Hold",
  DELAYED: "Delayed",
};

export const OUTCOME_LABELS: Record<PipelineOutcome, string> = {
  WON: "Won",
  LOST: "Lost",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
};

export const OUTCOME_REASON_LABELS: Record<PipelineOutcomeReason, string> = {
  PRICE: "Price",
  COMPETITOR: "Competitor",
  TECHNICAL: "Technical",
  BUDGET_WITHDRAWN: "Budget withdrawn",
  PROJECT_CANCELLED: "Project cancelled",
  LOST_CONTACT: "Lost contact",
  OTHER: "Other",
};

/**
 * The reason categories `POST /:id/close` accepts per outcome (backend
 * §3.5) — mirrored here so `CloseDealDialog.tsx`'s "Reason category" select
 * offers exactly the set the server will accept, and the backend stays the
 * one place that actually enforces it. `WON` and `ARCHIVED` are empty: neither
 * takes a category (the backend 400s `reason_not_allowed` if one is sent).
 */
export const REASONS_BY_OUTCOME: Record<PipelineOutcome, PipelineOutcomeReason[]> = {
  WON: [],
  LOST: ["PRICE", "COMPETITOR", "TECHNICAL", "OTHER"],
  CANCELLED: ["BUDGET_WITHDRAWN", "PROJECT_CANCELLED", "LOST_CONTACT", "OTHER"],
  ARCHIVED: [],
};

/**
 * True for an outcome that counts as a decision — Won, Lost or Cancelled.
 * ARCHIVED parks a dead deal (a duplicate, a test entry, imported junk) and
 * stays out of win rate and every other pipeline KPI.
 */
export function isDecidedOutcome(outcome: PipelineOutcome | null): boolean {
  return outcome !== null && outcome !== "ARCHIVED";
}

/** True once a deal has been closed (Won, Lost, Cancelled or Archived) — D5: the stage
 * is locked at that point, never reset. Structural over `outcome` alone so
 * both `Opportunity` (queries.ts) and `PipelineBoardDeal` (adapter.ts)
 * satisfy it without a cast. */
export function isClosed(deal: { outcome: PipelineOutcome | null }): boolean {
  return deal.outcome !== null;
}

/** The one stage jump that requires a reason (D4): Technical Clarification
 * skipping straight to RFP, bypassing PoC. */
export function isSkipJump(from: PipelineStage, to: PipelineStage): boolean {
  return from === "TECHNICAL_CLARIFICATION" && to === "RFP";
}

export type DealOwner = "sa" | "client";

/** Derived "who owns the next move" (D3) — `client` only while the deal
 * sits in Waiting Response, `sa` for every other stage. The API computes and
 * returns this itself (`Opportunity.owner`, never a stored column); this
 * pure mirror lets the board's optimistic move write keep it in sync
 * without waiting on the round trip (see `queries.ts`'s `useMoveOpportunity`). */
export function ownerOf(stage: PipelineStage): DealOwner {
  return stage === "WAITING_RESPONSE" ? "client" : "sa";
}

/**
 * Display-only mirror of `backend/src/lib/pipelineSla.ts`'s `PIPELINE_SLA`
 * (flow spec §7) — the backend is authoritative (it's what `computeIdle`
 * actually reads to derive `Opportunity.idle` on every response, D1: no
 * job, no stored alert). This copy only feeds `OpportunityDetail.tsx`'s
 * "SLA for this stage" caption; keep both tables in sync by hand if the
 * spec's numbers ever change.
 */
export interface PipelineSlaHint {
  /** Working days before a WAITING_RESPONSE deal's "waiting" idle basis
   * warns — `null` for every SA-owned stage (they use the "activity" basis
   * instead; see `idleWarningDays`). */
  waitingDays: number | null;
  idleWarningDays: number;
  /** `null` = no critical threshold for this stage's basis. */
  idleCriticalDays: number | null;
}

export const PIPELINE_SLA_HINT: Record<PipelineStage, PipelineSlaHint> = {
  ASSESSMENT: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  TECHNICAL_CLARIFICATION: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  POC: { waitingDays: 14, idleWarningDays: 7, idleCriticalDays: null },
  RFP: { waitingDays: 14, idleWarningDays: 5, idleCriticalDays: null },
  DELIVER_PROPOSAL: { waitingDays: 14, idleWarningDays: 7, idleCriticalDays: null },
  WAITING_RESPONSE: { waitingDays: null, idleWarningDays: 7, idleCriticalDays: 14 },
};

/**
 * Full Indonesian Rupiah rendering for detail surfaces (e.g. the opportunity
 * detail page). Matches Velora's `formatCurrency` (../VeloraApp
 * lib/utils.ts) verbatim: `Intl.NumberFormat("id-ID", { style: "currency",
 * currency: "IDR" })` with no decimals. Confirmed against this repo's own
 * Node runtime (host node v24 and the `frontend` container's node v22 both
 * agree) that this renders as "Rp 1.250.000.000" — a space after the "Rp"
 * symbol, "." as the thousands separator, no decimal places.
 */
export function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Compact Rupiah rendering for cards/KPIs (Pipeline board cards, dashboard
 * KPI tiles). Matches Velora's `formatCurrencyCompact` (../VeloraApp
 * lib/utils.ts) verbatim — exactly two abbreviation tiers, Indonesian
 * `jt`/`M` (not English `M`/`B`):
 *   - below 1 juta (1_000_000):  plain grouped Rupiah, e.g. "Rp 999.999"
 *   - >= 1 juta:                 "Rp {n}jt", 0 decimals, e.g. "Rp 5jt"
 *   - >= 1 miliar (1_000_000_000): "Rp {n,n}M", 1 decimal with a comma as
 *     the decimal separator (Indonesian convention), e.g. "Rp 1,3M"
 * There is no "triliun"/"T" tier — Velora's source has none. A triliun-plus
 * value (>= 1e12) falls through to the miliar tier and renders as a large
 * "M" figure (e.g. 2.5 triliun -> "Rp 2500,0M"); that is intentional, to
 * match Velora's actual behavior rather than inventing a tier it lacks.
 */
export function formatIDRCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(0)}jt`;
  }
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/**
 * Win-probability percentage rendering used on Pipeline cards. Velora
 * (../VeloraApp components/kanban/card.tsx) interpolates `win_probability`
 * directly (e.g. `{opportunity.win_probability}%`) since the field is
 * always stored as an integer 0-100. We round defensively so a non-integer
 * input still renders a clean whole-number percentage instead of leaking
 * decimals — a no-op for the integer values the API actually sends.
 */
export function formatWinProbability(p: number): string {
  return `${Math.round(p)}%`;
}

/**
 * Short date rendering for Pipeline surfaces (board cards, List/Swimlane/
 * Quarter views, the detail page) — e.g. "30 Jun 2026". `day` is a plain
 * "yyyy-MM-dd" calendar day (`Opportunity.deadline`/`requestDate`'s wire
 * shape, see `queries.ts`'s `Opportunity` doc comment), formatted through the
 * house `fmtDayFull` (`lib/formatDate.ts`: day-first, host-locale-independent,
 * read as a calendar day so it never shifts a day in any timezone). Callers
 * guard the null case themselves — an unparsable/empty input renders as an
 * empty string rather than throwing.
 */
export function formatPipelineDate(day: string): string {
  return fmtDayFull(day);
}
