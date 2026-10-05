// Pure Pipeline analytics aggregations for the Executive dashboard's
// "Pipeline analytics" fold-in (PRD §2.7 point 4's numbered chart list). No
// React, no API calls — same "board math lives in a *.ts module, components
// render it" split this directory already uses (kpi.ts / PipelineKpiBar.tsx).
// Mirrors VeloraApp's admin analytics reference
// (../VeloraApp/components/admin/analytics/*.tsx,
// components/admin/workload-heatmap.tsx,
// components/dashboard/pic-detail-modal.tsx — read-only behavior reference
// per CLAUDE.md) metric-for-metric where the reference gives a formula;
// ports the stage/threshold vocabulary onto this repo's own `PipelineStage`
// enum where Velora's ids differ (snake_case stage ids, no HOLD stage).
import type { Tone } from "@/components/StatusChip";
import { MONTH_ABBR } from "@/lib/formatDate";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type PipelineOutcome,
  type PipelineOutcomeReason,
  type PipelineStage,
} from "@/lib/pipelineFormat";
import type { Opportunity } from "@/lib/queries";
import { isActiveDeal } from "./kpi";

// ---------------------------------------------------------------------------
// Stage funnel
// ---------------------------------------------------------------------------

export interface StageFunnelBucket {
  stage: PipelineStage;
  label: string;
  count: number;
  value: number;
}

type FunnelDeal = Pick<Opportunity, "stage" | "dealValue" | "outcome">;

/**
 * Per-stage deal count + summed `dealValue`, in board order (`STAGE_ORDER`),
 * over ACTIVE deals only (`outcome === null`, `isActiveDeal` from kpi.ts) —
 * matches Velora's `ConversionFunnel` (excludes "lost") and this directory's
 * own `kpi.ts` funnel bucket (`computePipelineKpis().funnel`, same
 * active-only filter, zero-count stages stay in) — this function is that
 * same shape with `value` added, since the KPI bar's funnel strip only ever
 * needed counts. All 6 `STAGE_ORDER` stages are covered; there's no
 * DROP/HOLD stage left to exclude post-2026-09-25 flow redesign, but a
 * closed deal (Won/Lost/Cancelled) still needs excluding — it keeps the
 * stage it stalled in, and would otherwise inflate that column's "still
 * moving" count.
 */
export function computeStageFunnel(deals: FunnelDeal[]): StageFunnelBucket[] {
  const active = deals.filter(isActiveDeal);
  return STAGE_ORDER.map((stage) => {
    const inStage = active.filter((d) => d.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: inStage.length,
      value: inStage.reduce((sum, d) => sum + d.dealValue, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Shared PIC grouping
// ---------------------------------------------------------------------------

interface PicGroup<D> {
  picName: string;
  deals: D[];
}

/**
 * Groups deals by their assigned PIC, dropping unassigned (`picId === null`)
 * deals. Shared by the leaderboard and workload-heatmap aggregations below
 * so both surfaces agree on "who counts as a PIC" — every distinct assignee
 * appearing in the fetched deal list. There is no separate roster fetch:
 * PRD §2.7's fold-ins are client-side-only over `useOpportunities()`, so a
 * PIC with zero deals never appears (unlike Velora's reference, which lists
 * every `profiles` row with `role === "member"` regardless of deal count —
 * not reproducible here without a users fetch this task's dispatch brief
 * scopes out).
 */
function groupDealsByPic<D extends Pick<Opportunity, "picId" | "pic">>(
  deals: D[],
): Map<number, PicGroup<D>> {
  const byPic = new Map<number, PicGroup<D>>();
  for (const deal of deals) {
    if (deal.picId === null || deal.pic === null) continue;
    const group = byPic.get(deal.picId);
    if (group) {
      group.deals.push(deal);
    } else {
      byPic.set(deal.picId, { picName: deal.pic.username, deals: [deal] });
    }
  }
  return byPic;
}

// ---------------------------------------------------------------------------
// PIC leaderboard
// ---------------------------------------------------------------------------

export interface PicLeaderboardRow {
  picId: number;
  picName: string;
  activeCount: number;
  activeValue: number;
  wonCount: number;
  wonValue: number;
  /** Closed, not Won — Lost or Cancelled (`outcome !== null && outcome !==
   * "WON"`). Renamed from the pre-redesign "dropped" (there's no DROP stage
   * anymore); feeds the analytics table's "Lost / Cancelled" column. */
  lostOrCancelledCount: number;
  /**
   * won / (won + lostOrCancelled) * 100, rounded; 0 when there are no closed
   * deals yet. Matches VeloraApp's `WorkloadHeatmap` component's own
   * `winRate` (../VeloraApp/components/admin/workload-heatmap.tsx:
   * `closedTotal > 0 ? Math.round((wonOpps.length / closedTotal) * 100) : 0`,
   * `closedTotal = won.length + lost.length`) — the sibling
   * `pic-performance-table.tsx` reference renders an identically-named
   * `win_rate` field but computes it server-side with no formula visible in
   * that file, so WorkloadHeatmap's client-computed formula is the one this
   * ports.
   */
  winRatePct: number;
}

type LeaderboardDeal = Pick<Opportunity, "dealValue" | "picId" | "pic" | "outcome">;

/**
 * Per-PIC active/won counts + values and win rate, sorted by `wonValue`
 * descending (Velora's `Leaderboard`: "Top PIC by Won Value"), tiebroken by
 * `activeValue` descending then name ascending for a deterministic order.
 *
 * "Active"/"won"/"lost or cancelled" all key off `outcome` now (2026-09-25
 * flow redesign D5) rather than `stage` — `isActiveDeal` (kpi.ts) is the
 * same "outcome === null" definition the KPI bar's "Active PICs" tile and
 * the board drag gating already use.
 */
export function computePicLeaderboard(deals: LeaderboardDeal[]): PicLeaderboardRow[] {
  const byPic = groupDealsByPic(deals);
  const rows: PicLeaderboardRow[] = [];

  for (const [picId, { picName, deals: picDeals }] of byPic) {
    const active = picDeals.filter(isActiveDeal);
    const won = picDeals.filter((d) => d.outcome === "WON");
    const lostOrCancelled = picDeals.filter((d) => d.outcome !== null && d.outcome !== "WON");
    const closedTotal = won.length + lostOrCancelled.length;

    rows.push({
      picId,
      picName,
      activeCount: active.length,
      activeValue: active.reduce((sum, d) => sum + d.dealValue, 0),
      wonCount: won.length,
      wonValue: won.reduce((sum, d) => sum + d.dealValue, 0),
      lostOrCancelledCount: lostOrCancelled.length,
      winRatePct: closedTotal > 0 ? Math.round((won.length / closedTotal) * 100) : 0,
    });
  }

  return rows.sort(
    (a, b) =>
      b.wonValue - a.wonValue || b.activeValue - a.activeValue || a.picName.localeCompare(b.picName),
  );
}

// ---------------------------------------------------------------------------
// Monthly trend
// ---------------------------------------------------------------------------

export interface MonthlyTrendPoint {
  /** "yyyy-MM", UTC calendar month. */
  month: string;
  /** e.g. "Aug 2026" — rendered in the UTC timezone so it always matches `month`. */
  label: string;
  created: number;
  won: number;
}

type TrendDeal = Pick<Opportunity, "createdAt" | "wonAt">;

/**
 * Deals created vs. won per calendar month, for the trailing `months`
 * months ending in `now`'s month (default 12; `now` defaults to
 * `new Date()` but is injectable so tests don't depend on the wall clock).
 * Every month in the window is present, zero-filled, in ascending
 * chronological order — same "zero-count stages stay in" spirit as
 * `computeStageFunnel`.
 *
 * TZ-stability: both the trailing-window boundaries and the per-deal
 * bucketing use UTC exclusively — `trailingMonthKeys` walks `now`'s UTC
 * year/month backwards, and `monthKeyFromIso` slices the ISO instant string
 * directly rather than routing through `new Date(iso).getMonth()` (a LOCAL
 * getter). `Opportunity.createdAt`/`wonAt` are Prisma `DateTime` values
 * serialized as UTC ISO instants ("...T...Z"), so the first 7 characters
 * are always that instant's UTC calendar month in every host timezone — the
 * same class of local-vs-UTC bug `dateField.ts` documents for plain
 * calendar-day strings, here for instants instead.
 */
export function computeMonthlyTrend(
  deals: TrendDeal[],
  now: Date = new Date(),
  months = 12,
): MonthlyTrendPoint[] {
  const keys = trailingMonthKeys(now, months);
  const buckets = new Map<string, { created: number; won: number }>(
    keys.map((key) => [key, { created: 0, won: 0 }]),
  );

  for (const deal of deals) {
    const createdBucket = buckets.get(monthKeyFromIso(deal.createdAt));
    if (createdBucket) createdBucket.created++;
    if (deal.wonAt !== null) {
      const wonBucket = buckets.get(monthKeyFromIso(deal.wonAt));
      if (wonBucket) wonBucket.won++;
    }
  }

  return keys.map((key) => {
    const bucket = buckets.get(key)!;
    return { month: key, label: monthLabel(key), created: bucket.created, won: bucket.won };
  });
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function trailingMonthKeys(now: Date, months: number): string[] {
  const keys: string[] = [];
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed
  for (let i = 0; i < months; i++) {
    keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return keys.reverse();
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

// ---------------------------------------------------------------------------
// Workload heatmap
// ---------------------------------------------------------------------------

/**
 * The 6 "in-motion" stages the heatmap renders as columns — matches
 * Velora's `ACTIVE_STAGES` (../VeloraApp/components/admin/workload-heatmap.tsx)
 * and PRD §2.7 point 4 ("columns = the 6 active stages"). Now identical to
 * the full `STAGE_ORDER`: the 2026-09-25 flow redesign moved Won, Lost,
 * Cancelled and Hold off the stage enum entirely (see `pipelineFormat.ts`),
 * so there's nothing left to filter out here. A deal tagged `statusTag:
 * "HOLD"` still counts (Hold is a tag on an otherwise-active deal, not a
 * terminal state) — only `outcome !== null` (closed) excludes a deal from
 * `computeWorkloadHeatmap`'s per-stage counts below.
 */
export const HEATMAP_STAGES: readonly PipelineStage[] = STAGE_ORDER;

export const OVERLOAD_THRESHOLD = 6;
export const UNDERLOAD_THRESHOLD = 2;

export type WorkloadStatus = "overload" | "underload" | "normal";

export interface WorkloadHeatmapRow {
  picId: number;
  picName: string;
  totalActive: number;
  status: WorkloadStatus;
  /** One entry per `HEATMAP_STAGES` member, in that order. */
  byStage: { stage: PipelineStage; count: number }[];
}

type HeatmapDeal = Pick<Opportunity, "stage" | "picId" | "pic" | "outcome">;

/**
 * Per-PIC deal counts across `HEATMAP_STAGES`, ACTIVE deals only
 * (`outcome === null` — see `HEATMAP_STAGES`'s doc comment), with an
 * overload/underload/normal `status` (`OVERLOAD_THRESHOLD`/
 * `UNDERLOAD_THRESHOLD`, matching Velora's thresholds verbatim: overload
 * strictly greater than 6, underload strictly less than 2). Sorted
 * overload-first, then normal, then underload, tiebroken by `totalActive`
 * descending then name ascending — mirrors Velora's own sort
 * (`workload-heatmap.tsx`'s `sorted` memo).
 */
export function computeWorkloadHeatmap(deals: HeatmapDeal[]): WorkloadHeatmapRow[] {
  const byPic = groupDealsByPic(deals);
  const rows: WorkloadHeatmapRow[] = [];

  for (const [picId, { picName, deals: picDeals }] of byPic) {
    const active = picDeals.filter(isActiveDeal);
    const byStage = HEATMAP_STAGES.map((stage) => ({
      stage,
      count: active.filter((d) => d.stage === stage).length,
    }));
    const totalActive = byStage.reduce((sum, s) => sum + s.count, 0);
    const status: WorkloadStatus =
      totalActive > OVERLOAD_THRESHOLD
        ? "overload"
        : totalActive < UNDERLOAD_THRESHOLD
          ? "underload"
          : "normal";
    rows.push({ picId, picName, totalActive, status, byStage });
  }

  const statusOrder: Record<WorkloadStatus, number> = { overload: 0, normal: 1, underload: 2 };
  return rows.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      b.totalActive - a.totalActive ||
      a.picName.localeCompare(b.picName),
  );
}

/**
 * Status → house chip `Tone`, per PRD §2.7 point 4: overload `rose`,
 * underload `amber`, normal `emerald`.
 */
export function workloadStatusTone(status: WorkloadStatus): Tone {
  if (status === "overload") return "rose";
  if (status === "underload") return "amber";
  return "emerald";
}

// ---------------------------------------------------------------------------
// PIC drill-down
// ---------------------------------------------------------------------------

/**
 * A PIC's own deals, board-order sorted: board column position
 * (`STAGE_ORDER.indexOf(stage)`) first, then `stageOrder` ascending, then
 * `id` ascending tiebreak (finding N1). Feeds the drill-down modal opened
 * from a leaderboard row or heatmap lane (PRD §2.7: "mirroring the
 * reference's `pic-detail-modal` content").
 *
 * `stageOrder` alone (the pre-fix comparator) isn't safe to sort by across
 * stages: it's only a dense 0..n-1 position WITHIN one stage's own sibling
 * list (see backend/src/routes/opportunities.ts's `stageSiblingIds`) — a
 * PIC's deals typically span several stages, so comparing raw `stageOrder`
 * values across them produced a meaningless interleave (e.g. a
 * WAITING_RESPONSE deal at position 0 sorting ahead of an ASSESSMENT deal at
 * position 5). The stage
 * index goes first so the list groups by board column, same order the
 * board itself reads left to right, with `stageOrder` only breaking ties
 * *within* a stage — matching adapter.ts's own per-column
 * `compareDealsByStageOrder`, generalized here to a cross-stage list.
 */
export function dealsForPic<D extends Pick<Opportunity, "picId" | "stage" | "stageOrder" | "id">>(
  deals: D[],
  picId: number,
): D[] {
  return deals
    .filter((d) => d.picId === picId)
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
        a.stageOrder - b.stageOrder ||
        a.id.localeCompare(b.id),
    );
}

// ---------------------------------------------------------------------------
// Close reasons + win rate (2026-09-25 flow redesign, §4.6)
// ---------------------------------------------------------------------------

export interface CloseReasonRow {
  stage: PipelineStage;
  /** LOST or CANCELLED only — a Won close carries no reason category
   * (backend §3.5 rejects one). Included alongside `category` (not just
   * folded into a single key) because `PipelineOutcomeReason`'s "OTHER"
   * value is shared by both outcomes (`REASONS_BY_OUTCOME.LOST` and
   * `.CANCELLED` each list it) — without `outcome` in the row/grouping key,
   * a stage's LOST/OTHER and CANCELLED/OTHER deals would silently merge
   * into one ambiguous row. */
  outcome: Extract<PipelineOutcome, "LOST" | "CANCELLED">;
  category: PipelineOutcomeReason;
  count: number;
  value: number;
}

type CloseReasonDeal = Pick<
  Opportunity,
  "stage" | "dealValue" | "outcome" | "outcomeReasonCategory" | "closedAt"
>;

/**
 * One row per (stage, outcome, reason category) combination with at least
 * one LOST or CANCELLED deal closed in `year` — a UTC calendar year; pass
 * `new Date().getUTCFullYear()`, not the host's local year. Matches
 * `computeMonthlyTrend`'s own TZ-stability approach below: both read the
 * year straight off the first 4 characters of the ISO instant string
 * (`closedAt.slice(0, 4)`) rather than routing through `new Date(iso)`'s
 * LOCAL getters — same class of bug `monthKeyFromIso` documents for month
 * bucketing, here for the year alone. Rows with no `outcomeReasonCategory`
 * (shouldn't happen post-close, defensive) or no `closedAt` are skipped.
 * Sorted board-stage order, then count descending. Feeds
 * `PipelineAnalyticsSection.tsx`'s "Close reasons by stage" table (Stage,
 * Outcome, Reason, Count, Value).
 */
export function computeCloseReasons(deals: CloseReasonDeal[], year: number): CloseReasonRow[] {
  const buckets = new Map<string, CloseReasonRow>();

  for (const deal of deals) {
    if (deal.outcome !== "LOST" && deal.outcome !== "CANCELLED") continue;
    if (deal.outcomeReasonCategory === null || deal.closedAt === null) continue;
    if (Number(deal.closedAt.slice(0, 4)) !== year) continue;

    const key = `${deal.stage}:${deal.outcome}:${deal.outcomeReasonCategory}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.value += deal.dealValue;
    } else {
      buckets.set(key, {
        stage: deal.stage,
        outcome: deal.outcome,
        category: deal.outcomeReasonCategory,
        count: 1,
        value: deal.dealValue,
      });
    }
  }

  return Array.from(buckets.values()).sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.count - a.count,
  );
}

type WinRateDeal = Pick<Opportunity, "outcome" | "closedAt">;

/**
 * Win rate (won / closed, rounded to a whole percent — same rounding
 * convention the name mirrors, `PicLeaderboardRow.winRatePct` above) for
 * deals CLOSED in `year` — a UTC calendar year; pass
 * `new Date().getUTCFullYear()`, not the host's local year (NOT
 * `createdAt`, unlike `computeMonthlyTrend`'s trailing window: a deal's win
 * rate belongs to the year it was DECIDED, not the year it entered the
 * pipeline). Same string-slice year extraction as `computeCloseReasons`
 * above (`closedAt.slice(0, 4)`, not `new Date(iso).getUTCFullYear()` — see
 * that function's doc comment). 0 when nothing closed that year (avoids a
 * 0/0 NaN).
 */
export function computeWinRatePct(deals: WinRateDeal[], year: number): number {
  const closedThisYear = deals.filter(
    (d) => d.outcome !== null && d.closedAt !== null && Number(d.closedAt.slice(0, 4)) === year,
  );
  if (closedThisYear.length === 0) return 0;
  const won = closedThisYear.filter((d) => d.outcome === "WON").length;
  return Math.round((won / closedThisYear.length) * 100);
}
