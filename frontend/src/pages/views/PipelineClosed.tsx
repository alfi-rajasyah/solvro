// Pipeline "Closed" board (docs/plans/opportunity-flow-redesign.md §4.4,
// D5/D11) — the Active/Closed switch's Closed side of the Kanban tab: three
// fixed columns, Won / Lost / Cancelled, over deals with a non-null
// `outcome`. A closed deal's stage is locked (D5) — this view shows it as a
// read-only `StageChip`, never a drop target (no drag here at all, same
// "Read-only" precedent PipelineQuarter.tsx/PipelineSwimlane.tsx already
// document for their own non-Kanban boards).
//
// Receives `deals` as a prop (already filtered to `outcome !== null`) from
// Pipeline.tsx, which owns the single `useOpportunities()` fetch and the
// Active/Closed switch (D11) — same "receives deals" architecture as
// SolvroPipelineKanban.tsx/PipelineList.tsx now use, a deliberate departure
// from the older self-contained-view convention (each view fetching its own
// list) those two files' own header comments used to document: the switch
// needs one shared source of truth for "which half of the list is this
// deal in", not four independent copies of the same filter.
//
// Summary tiles reuse `computeCloseReasons`/`computeWinRatePct`
// (components/pipeline/analytics.ts, §4.6) rather than a separate
// aggregation — "this year" (closedAt's UTC calendar year) is the same
// window both those functions already use, so `currentYear` below is read
// via `getUTCFullYear()`, not the host's local year (phase-review fix N1).
// Tile markup is a local copy of PipelineKpiBar.tsx's own `KpiTile` (that
// component isn't exported — same "copy, don't extract" precedent
// PipelineQuarter.tsx's `QUARTER_ACCENT` comment documents).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HandoffProjectModal } from "@/components/DealCard";
import { canHandoffDeal } from "@/components/pipeline/boardLogic";
import { OutcomeChip } from "@/components/PipelineFlagChips";
import { StageChip } from "@/components/StageChip";
import { Chip, type Tone } from "@/components/StatusChip";
import { hasPermission, useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/formatDate";
import {
  computeCloseReasons,
  computeWinRatePct,
  type CloseReasonRow,
} from "@/components/pipeline/analytics";
import {
  formatIDR,
  formatIDRCompact,
  OUTCOME_LABELS,
  OUTCOME_REASON_LABELS,
  type PipelineOutcome,
  type PipelineOutcomeReason,
} from "@/lib/pipelineFormat";
import type { Opportunity } from "@/lib/queries";

export interface PipelineClosedProps {
  /** Closed deals only (`outcome !== null`) — Pipeline.tsx's Active/Closed
   * switch has already applied this filter. */
  deals: Opportunity[];
}

const COLUMN_OUTCOMES: PipelineOutcome[] = ["WON", "LOST", "CANCELLED", "ARCHIVED"];

const COLUMN_TONE: Record<PipelineOutcome, Tone> = {
  WON: "emerald",
  LOST: "rose",
  CANCELLED: "gray",
  ARCHIVED: "gray",
};

function byClosedAtDesc(a: Opportunity, b: Opportunity): number {
  return (b.closedAt ?? "").localeCompare(a.closedAt ?? "");
}

/** Highest-count reason category for one outcome's `computeCloseReasons`
 * rows, summed across stages — the tile only needs "the one reason that
 * shows up most", not the per-stage breakdown. */
function topReasonLabel(rows: CloseReasonRow[], outcome: Extract<PipelineOutcome, "LOST" | "CANCELLED">) {
  const byCategory = new Map<PipelineOutcomeReason, number>();
  for (const row of rows) {
    if (row.outcome !== outcome) continue;
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.count);
  }
  let top: PipelineOutcomeReason | null = null;
  let topCount = 0;
  for (const [category, count] of byCategory) {
    if (count > topCount) {
      top = category;
      topCount = count;
    }
  }
  return top ? OUTCOME_REASON_LABELS[top] : null;
}

export function PipelineClosed({ deals }: PipelineClosedProps) {
  const { user } = useAuth();
  const [handoffDeal, setHandoffDeal] = useState<Opportunity | null>(null);

  // Computed per-render, not module scope (same rationale as
  // PipelineQuarter.tsx's own `currentYear`) — a year rollover while the
  // tab stays mounted picks up the new year immediately. UTC, not local
  // (phase-review fix N1): `closedAt` bucketing throughout this file
  // (`computeCloseReasons`/`computeWinRatePct`, `wonValue`'s own filter
  // below) is all UTC-calendar-year, so the tile year must match or a deal
  // closed in the last/first few hours of a UTC year boundary could count
  // toward "this year" on one number but not another, depending on the
  // viewer's timezone.
  const currentYear = new Date().getUTCFullYear();

  const closeReasons = useMemo(() => computeCloseReasons(deals, currentYear), [deals, currentYear]);
  const winRate = useMemo(() => computeWinRatePct(deals, currentYear), [deals, currentYear]);

  const wonDeals = useMemo(
    () => deals.filter((d) => d.outcome === "WON").sort(byClosedAtDesc),
    [deals],
  );
  const lostDeals = useMemo(
    () => deals.filter((d) => d.outcome === "LOST").sort(byClosedAtDesc),
    [deals],
  );
  const cancelledDeals = useMemo(
    () => deals.filter((d) => d.outcome === "CANCELLED").sort(byClosedAtDesc),
    [deals],
  );
  // Archived deals get a column of their own but no tile: they are left out
  // of win rate and every value total.
  const archivedDeals = useMemo(
    () => deals.filter((d) => d.outcome === "ARCHIVED").sort(byClosedAtDesc),
    [deals],
  );

  const wonValue = useMemo(
    () =>
      wonDeals
        .filter((d) => d.closedAt !== null && new Date(d.closedAt).getUTCFullYear() === currentYear)
        .reduce((sum, d) => sum + d.dealValue, 0),
    [wonDeals, currentYear],
  );
  const lostValue = closeReasons
    .filter((r) => r.outcome === "LOST")
    .reduce((sum, r) => sum + r.value, 0);
  const cancelledValue = closeReasons
    .filter((r) => r.outcome === "CANCELLED")
    .reduce((sum, r) => sum + r.value, 0);
  const lostTopReason = topReasonLabel(closeReasons, "LOST");
  const cancelledTopReason = topReasonLabel(closeReasons, "CANCELLED");

  const columns: Record<PipelineOutcome, Opportunity[]> = {
    WON: wonDeals,
    LOST: lostDeals,
    CANCELLED: cancelledDeals,
    ARCHIVED: archivedDeals,
  };

  if (deals.length === 0) {
    return <EmptyClosedState />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          label="Win rate"
          value={`${winRate}%`}
          hint={`${currentYear}`}
          icon="percent"
          tone="primary"
        />
        <SummaryTile
          label="Won value"
          value={formatIDRCompact(wonValue)}
          hint={`${currentYear}`}
          icon="emoji_events"
          tone="emerald"
        />
        <SummaryTile
          label="Lost value"
          value={formatIDRCompact(lostValue)}
          hint={lostTopReason ? `Top reason: ${lostTopReason}` : "No reasons yet"}
          icon="cancel"
          tone="rose"
        />
        <SummaryTile
          label="Cancelled value"
          value={formatIDRCompact(cancelledValue)}
          hint={cancelledTopReason ? `Top reason: ${cancelledTopReason}` : "No reasons yet"}
          icon="block"
          tone="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMN_OUTCOMES.map((outcome) => {
          const columnDeals = columns[outcome];
          return (
            <div key={outcome} className="flex flex-col">
              <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-outline-variant bg-surface-container px-3 py-2">
                <h3 className="text-sm font-bold text-on-surface">{OUTCOME_LABELS[outcome]}</h3>
                <Chip tone={COLUMN_TONE[outcome]}>{columnDeals.length}</Chip>
              </div>
              <div className="max-h-[calc(100vh-360px)] flex-1 space-y-2 overflow-y-auto rounded-b-xl border border-outline-variant bg-surface-container-lowest p-2">
                {columnDeals.length === 0 ? (
                  <p className="py-6 text-center text-xs text-on-surface-variant">
                    No {OUTCOME_LABELS[outcome].toLowerCase()} deals
                  </p>
                ) : (
                  columnDeals.map((deal) => (
                    <ClosedDealCard
                      key={deal.id}
                      deal={deal}
                      outcome={outcome}
                      // phase-review fix SF3: project:write alone let an
                      // edit_own holder see (and 403 on) the offer for a
                      // colleague's Won deal — `canHandoffDeal` adds the
                      // backend's own ownership gate.
                      canOfferHandoff={hasPermission(user, "project:write") && canHandoffDeal(user, deal)}
                      onRequestHandoff={() => setHandoffDeal(deal)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <HandoffProjectModal open={handoffDeal !== null} onClose={() => setHandoffDeal(null)} deal={handoffDeal} />
    </div>
  );
}

function ClosedDealCard({
  deal,
  outcome,
  canOfferHandoff,
  onRequestHandoff,
}: {
  deal: Opportunity;
  /** The column's own outcome — narrower than `deal.outcome` (nullable on
   * the DTO), and always equal to it here since this card only ever renders
   * inside a column already filtered to one outcome. */
  outcome: PipelineOutcome;
  canOfferHandoff: boolean;
  onRequestHandoff: () => void;
}) {
  return (
    <div
      data-slot="closed-deal-card"
      className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
    >
      <Link
        to={`/pipeline/${deal.id}`}
        className="line-clamp-2 text-sm font-semibold leading-tight text-on-surface hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {deal.title}
      </Link>
      <p className="mt-0.5 truncate text-xs text-on-surface-variant">{deal.customerName}</p>
      <p className="mt-1 text-data-mono text-primary">{formatIDR(deal.dealValue)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StageChip stage={deal.stage} />
        <OutcomeChip outcome={deal.outcome} reasonCategory={deal.outcomeReasonCategory} />
      </div>

      {deal.closedAt && (
        <p className="mt-1.5 text-meta text-on-surface-variant">
          {OUTCOME_LABELS[outcome]} {fmtDateTime(deal.closedAt)} · {deal.pic?.username ?? "Unassigned"}
        </p>
      )}

      {outcome === "WON" && (
        <div className="mt-2 border-t border-outline-variant pt-2">
          {deal.projectId ? (
            <Link
              to={`/projects/${deal.projectId}`}
              className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              View project
            </Link>
          ) : (
            canOfferHandoff && (
              <button
                type="button"
                onClick={onRequestHandoff}
                className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                Create project
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface SummaryTileProps {
  label: string;
  value: string;
  hint: string;
  icon: string;
  tone: "primary" | "emerald" | "rose" | "neutral";
}

// Local copy of PipelineKpiBar.tsx's own (unexported) `KpiTile` — same
// visual language (rounded-sm border, label-caps header, mono value), see
// this file's header comment for why it isn't imported instead.
function SummaryTile({ label, value, hint, icon, tone }: SummaryTileProps) {
  const iconColor =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-chip-emerald-text"
        : tone === "rose"
          ? "text-chip-rose-text"
          : "text-on-surface-variant";
  return (
    <div className="rounded-sm border border-outline-variant bg-surface-container p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-base ${iconColor}`}>{icon}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="truncate text-2xl font-bold tabular-nums text-on-surface">{value}</span>
      </div>
      <p className="mt-1 text-meta text-on-surface-variant">{hint}</p>
    </div>
  );
}

function EmptyClosedState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant px-6 py-14 text-center">
      <span className="material-symbols-outlined text-3xl text-on-surface-variant">inventory_2</span>
      <p className="text-sm font-semibold text-on-surface">No closed deals yet</p>
      <p className="max-w-xs text-xs text-on-surface-variant">
        Deals you close as Won, Lost, Cancelled or Archived will appear here, grouped by outcome.
      </p>
    </div>
  );
}
