// Pure formatting helpers for the Pipeline (Solution Architect) UI — no
// React, no API calls. See PRD §2.3–§2.7 for the consuming surfaces (board
// cards, opportunity detail, KPI tiles). Currency formatting matches
// Velora's `lib/utils.ts` (../VeloraApp, read-only reference/data source
// per CLAUDE.md) verbatim so the ported UI reads identically to the
// reference app.

/**
 * Pipeline stage enum, matching `backend/prisma/schema.prisma`'s
 * `PipelineStage` — the API speaks these uppercase enum strings verbatim.
 * Defined here since this is the first Pipeline frontend module that needs
 * it; M2's hooks task (`src/lib/queries.ts`) re-exports/consumes it rather
 * than redeclaring it.
 */
export type PipelineStage =
  | "ASSESSMENT"
  | "RFP"
  | "POC"
  | "TECHNICAL_CLARIFICATION"
  | "DELIVER_PROPOSAL"
  | "WAITING_RESPONSE"
  | "WON"
  | "DROP"
  | "HOLD";

/** Display label per stage, for board columns, chips, and detail surfaces. */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  ASSESSMENT: "Assessment",
  RFP: "RFP",
  POC: "PoC",
  TECHNICAL_CLARIFICATION: "Technical Clarification",
  DELIVER_PROPOSAL: "Deliver Proposal",
  WAITING_RESPONSE: "Waiting Response",
  WON: "Won",
  DROP: "Drop",
  HOLD: "Hold",
};

/** Board column order, left to right — matches PRD §2.2/§2.3 and the
 * reference app's live schema (VeloraApp/scripts/migrate.mjs), which is
 * also the backend `PipelineStage` Prisma enum's declaration order. */
export const STAGE_ORDER: PipelineStage[] = [
  "ASSESSMENT",
  "RFP",
  "POC",
  "TECHNICAL_CLARIFICATION",
  "DELIVER_PROPOSAL",
  "WAITING_RESPONSE",
  "WON",
  "DROP",
  "HOLD",
];

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
