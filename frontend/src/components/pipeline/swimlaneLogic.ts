// Pure grouping/aggregation logic for the Pipeline "Swimlane" view (PRD
// §2.4, M3.13) — no React, no API calls. Same "pure logic + colocated
// vitest suite" split as boardLogic.ts/kpi.ts/adapter.ts/quarterLogic.ts in
// this directory (quarterLogic.ts, M3.14, is the closest sibling: read
// alongside this file for the shared "pure grouping module for a
// PipelineSwimlane/PipelineQuarter view" precedent).
//
// Grouping mirrors Velora's swimlane-view.tsx (../VeloraApp
// components/kanban/swimlane-view.tsx, read-only reference per CLAUDE.md):
// one lane per distinct PIC plus an "Unassigned" lane for a null `picId`,
// sorted by display name ascending (`picRows` in the reference).
//
// Columns: `SWIMLANE_STAGES` is now the full 6-stage board (`PIPELINE_STAGES`)
// — the 2026-09-25 flow redesign moved Won, Lost, Cancelled and Hold off
// the stage enum entirely (see `pipelineFormat.ts`), so there's no longer a
// DROP-only exclusion to apply. Per D11, only ACTIVE deals are meant to reach
// the Swimlane at all: the caller (`PipelineSwimlane.tsx`) filters `allDeals`
// to `outcome === null` before calling `groupIntoLanes`. `laneSummary` below
// still filters by `outcome` itself, though — same "second, independent
// safety net" the pre-redesign version kept for its own WON exclusion — the
// type-level `SwimlaneDeal` contract can't otherwise express "the caller
// already filtered this".
import type { PipelineOutcome, PipelineStage } from "@/lib/pipelineFormat";
import { PIPELINE_STAGES } from "./adapter";
import { isActiveDeal } from "./kpi";

/** Columns rendered by the swimlane — the full 6-stage board order (see this
 * file's header comment). */
export const SWIMLANE_STAGES: readonly PipelineStage[] = PIPELINE_STAGES;

/**
 * Structural subset of `Opportunity` this module (and PipelineSwimlane.tsx)
 * needs — same "declare only the fields actually touched" convention as
 * adapter.ts's `PipelineBoardDeal`. `pic` carries `id` (not just a display
 * name) so the view can hand it straight to `AssigneeAvatar` without a
 * second lookup.
 */
export interface SwimlaneDeal {
  id: string;
  title: string;
  dealValue: number;
  stage: PipelineStage;
  picId: number | null;
  pic: { id: number; username: string } | null;
  deadline: string | null;
  outcome: PipelineOutcome | null;
}

export interface SwimlaneLane {
  picId: number | null;
  picName: string;
  pic: { id: number; username: string } | null;
  deals: SwimlaneDeal[];
}

const UNASSIGNED_LABEL = "Unassigned";

/**
 * Groups deals into one lane per distinct `picId`, plus a single
 * "Unassigned" lane for `picId === null`, sorted by display name ascending
 * (`localeCompare`) — mirrors the reference's `picRows` (a `Map` keyed by
 * `pic_id || "__unassigned__"`, built in input order then
 * `.sort((a, b) => a.picName.localeCompare(b.picName))`). Deals within a
 * lane keep their input order (no re-sort), matching the reference's
 * `map.get(key)!.opps.push(opp)`. Does not mutate `deals`.
 */
export function groupIntoLanes(deals: readonly SwimlaneDeal[]): SwimlaneLane[] {
  const byPic = new Map<string, SwimlaneLane>();

  for (const deal of deals) {
    const key = deal.picId === null ? "__unassigned__" : String(deal.picId);
    let lane = byPic.get(key);
    if (!lane) {
      lane = {
        picId: deal.picId,
        picName: deal.pic?.username ?? UNASSIGNED_LABEL,
        pic: deal.pic,
        deals: [],
      };
      byPic.set(key, lane);
    }
    lane.deals.push(deal);
  }

  return Array.from(byPic.values()).sort((a, b) => a.picName.localeCompare(b.picName));
}

/** Deals in `lane` sitting in `stage` — the cell content source for the grid. */
export function dealsInCell(lane: SwimlaneLane, stage: PipelineStage): SwimlaneDeal[] {
  return lane.deals.filter((deal) => deal.stage === stage);
}

export interface LaneSummary {
  count: number;
  total: number;
}

/**
 * A lane's row-header summary (count + value sum) excludes closed deals
 * (`outcome !== null`) — D11: the caller (`PipelineSwimlane.tsx`) is
 * expected to filter `allDeals` to `outcome === null` before calling
 * `groupIntoLanes`, but `groupIntoLanes` itself doesn't filter by outcome,
 * so this is a second, independent safety net for this summary specifically
 * (same role the pre-2026-09-25-redesign version's WON exclusion played
 * here) — not a redundant check.
 */
export function laneSummary(lane: SwimlaneLane): LaneSummary {
  const active = lane.deals.filter(isActiveDeal);
  return {
    count: active.length,
    total: active.reduce((sum, deal) => sum + deal.dealValue, 0),
  };
}

export interface StageSummary {
  stage: PipelineStage;
  count: number;
  total: number;
}

/**
 * Per-column count + value sum across every deal in `lanes` sitting in that
 * stage — mirrors the reference's `stageTotals`, computed from the
 * currently-visible lane set (all active deals, by D11).
 */
export function stageSummaries(lanes: readonly SwimlaneLane[]): StageSummary[] {
  return SWIMLANE_STAGES.map((stage) => {
    const deals = lanes.flatMap((lane) => dealsInCell(lane, stage));
    return {
      stage,
      count: deals.length,
      total: deals.reduce((sum, deal) => sum + deal.dealValue, 0),
    };
  });
}
