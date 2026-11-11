// SolvroPipelineKanban — the Pipeline board container, composed the same
// way frontend/src/components/kanban-v2/SolvroKanban.tsx composes the
// vendored ReUI Kanban engine (frontend/src/components/reui/kanban.tsx)
// over its adapter.ts projection: a live local projection is authoritative
// during a drag (query-derived updates frozen), and onValueCommit routes
// through commitMapper.ts into the optimistic useMoveOpportunity write path.
// Scoped to the Pipeline module's 6 PipelineStage columns instead of the
// task board's 3 TaskStatus columns — see pipeline/adapter.ts's header for
// the field-by-field mapping between the two.
//
// Layout deviates from kanban-v2's dual "3-col grid on desktop / swipeable
// single-column pager on mobile" in one deliberate way: kanban-v2's mobile
// pager exists to solve "columns fit a desktop grid but not a phone
// viewport" — a problem this board never has at ANY viewport width, desktop
// included (the PRD's own §2.3 mockup literally labels the board row
// "horizontal scroll"). So this container uses ONE responsive
// horizontal-scroll row at every breakpoint (columns narrow to ~85vw below
// `sm:`) instead of porting the IntersectionObserver/chevron/dot pager,
// which would solve a layout problem this board doesn't have.
//
// M3 integration (view switcher + KPI hoist): `PipelineKpiBar` no longer
// mounts here — Pipeline.tsx now renders ONE instance above whichever view
// is active. The funnel strip's per-stage scroll-to-column only makes sense
// against this board's columns, so this component exposes `scrollToStage`
// via `forwardRef`/`useImperativeHandle` for Pipeline.tsx to call; the ref
// is naturally `null` whenever a different view is mounted, which is what
// makes that scroll a no-op outside the Kanban view. `onCreateOpportunity`
// wires the empty-state "+ Opportunity" CTA to the same OpportunityFormModal
// instance Pipeline.tsx's header CTA opens. Card clicks navigate to
// `/pipeline/:id` (OpportunityDetail) — the click-vs-drag guard is
// OpportunityCard's own `stopPropagation` wrapper, mirroring
// kanban-v2/cards.tsx's `TaskCard.handleClick` precedent exactly; the
// vendored engine's own 10px pointer-movement `activationConstraint`
// (reui/kanban.tsx's `MOUSE_SENSOR_OPTIONS`) is what keeps a real drag from
// ever registering as a click in the first place.
//
// 2026-09-25 flow redesign (docs/plans/opportunity-flow-redesign.md §4.4):
// - This container no longer fetches its own opportunity list — Pipeline.tsx
//   now owns the single `useOpportunities()` call and the Active/Closed
//   switch (D11), passing this component the ACTIVE deals only (a closed
//   deal is locked, stage-wise, and leaves the default board entirely for
//   `PipelineClosed.tsx`). `deals` is therefore a required prop, not
//   query-derived state.
// - The WON/DROP terminal-confirm branch (`ConfirmModal`,
//   `needsTerminalConfirm`) is gone: Won/Lost/Cancelled are no longer stages
//   a drag can land on at all. In its place, a Technical Clarification -> RFP
//   drop (the one gated jump, D4/`isSkipJump`) opens `MoveReasonModal` first
//   and commits the move with the collected reason; every other drop commits
//   directly, same as before.
// - `justWonDeal`/`handoffDeal` (the post-win "create project?" offer) now
//   come from the card menu's Close (Won) result — `CloseDealDialog`'s
//   `onClosed(updated)` — not from a drag landing on a WON column, since
//   WON is no longer reachable by drag.
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloseDealDialog } from "@/components/CloseDealDialog";
import { HandoffProjectModal } from "@/components/DealCard";
import { MoveReasonModal } from "@/components/MoveReasonModal";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanOverlay,
  type KanbanCommitMeta,
} from "@/components/reui/kanban";
import { hasPermission, useAuth } from "@/lib/auth";
import { useDragActivityGuard } from "@/lib/dragActivity";
import { formatIDRCompact, isSkipJump, STAGE_LABELS, type PipelineStage } from "@/lib/pipelineFormat";
import { useMoveOpportunity, type Opportunity } from "@/lib/queries";
import { PIPELINE_STAGES, projectToColumns } from "./adapter";
import { canCloseDeal, canDragDeal, canHandoffDeal } from "./boardLogic";
import { mapCommitToMove, type OpportunityMovePayload } from "./commitMapper";
import { OpportunityCard } from "./OpportunityCard";

type Columns = Record<PipelineStage, Opportunity[]>;

interface PendingReasonMove {
  payload: OpportunityMovePayload;
  deal: Opportunity;
}

/**
 * Imperative handle exposed to Pipeline.tsx's hoisted KPI funnel strip
 * (M3 integration). Deliberately minimal — one method, the one thing a
 * parent that doesn't own this board's DOM needs to trigger.
 */
export interface SolvroPipelineKanbanHandle {
  scrollToStage: (stage: PipelineStage) => void;
}

export interface SolvroPipelineKanbanProps {
  /** Active deals only (`outcome === null`) — the container filtering
   * happens once, in Pipeline.tsx's Active/Closed switch (D11). */
  deals: Opportunity[];
  /**
   * Wired by Pipeline.tsx so the board's empty state (PRD §2.11: "board with
   * zero deals → centered empty state with '+ Opportunity' CTA") opens the
   * same OpportunityFormModal instance as the page header's own CTA.
   * `undefined` when the caller has no pipeline:create permission —
   * EmptyBoardState then renders no button at all, the same
   * optional-prop-omits-affordance convention OpportunityCard's `onClick`
   * already uses.
   */
  onCreateOpportunity?: () => void;
}

export const SolvroPipelineKanban = forwardRef<SolvroPipelineKanbanHandle, SolvroPipelineKanbanProps>(
  function SolvroPipelineKanban({ deals, onCreateOpportunity }, ref) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const moveOpportunity = useMoveOpportunity();

    // Drag-live local projection (Architecture Decision 5, kanban-v2): `null`
    // when not dragging (columns derive from query data), during a live drag
    // this holds the vendor's own live-preview arrangement.
    const [liveColumns, setLiveColumns] = useState<Columns | null>(null);
    // Ref, not state, so the write is synchronous within the same call stack
    // — see kanban-v2/SolvroKanban.tsx's handleValueChange doc for the
    // "permanent freeze" bug this guards against.
    const isDraggingRef = useRef(false);
    // Pauses the Pipeline queries' 30 s refresh for the gesture's lifetime and
    // releases it on unmount mid-drag (docs/archive/plans/collaboration-and-sharing.md).
    const dragActivity = useDragActivityGuard();

    // The Technical Clarification -> RFP skip-reason gate (D4). Mirrors the
    // old WON/DROP `pendingMove`/`isConfirming` pair's freeze-and-restore
    // shape, scoped to the one drop that still needs a confirm step.
    const [pendingReasonMove, setPendingReasonMove] = useState<PendingReasonMove | null>(null);
    const [isMoveReasonBusy, setIsMoveReasonBusy] = useState(false);

    // Close deal dialog — opened by a card's ⋯ menu ("Close deal…"), not by
    // a drag (D5: Won/Lost/Cancelled are outcomes, not drop targets).
    const [closingDeal, setClosingDeal] = useState<Opportunity | null>(null);

    // Phase-review fix N4 — a card's inline flag toggle (Waiting for Sales
    // input, Hold, Delayed) can 400/403 (e.g. `deal_closed` if the deal was
    // just closed in another tab); `OpportunityCard`'s own mutation reports
    // it here via `onToggleError` rather than swallowing it, since this repo
    // has no toast system. Rendered beside `moveOpportunity.isError` below.
    const [toggleError, setToggleError] = useState<string | null>(null);

    // Post-won handoff offer (PRD §2.10) — mirrors OpportunityDetail.tsx's
    // own `justWonOffer`/`handoffOpen` pair, scoped per-deal here since the
    // board can win any card, not just "the" one. `justWonDeal` drives the
    // transient inline Alert; `handoffDeal` drives the modal — kept separate
    // so dismissing the banner (clearing `justWonDeal`) never closes an
    // already-open modal, and so opening the modal clears the banner (see
    // the Alert's own action button below). Populated by `CloseDealDialog`'s
    // `onClosed` result now (WON outcome), not by a drag landing on WON.
    const [justWonDeal, setJustWonDeal] = useState<Opportunity | null>(null);
    const [handoffDeal, setHandoffDeal] = useState<Opportunity | null>(null);

    const columnRefs = useRef<Partial<Record<PipelineStage, HTMLDivElement | null>>>({});

    // No `as Columns` cast (finding S3): `projectToColumns` is generic over
    // `T extends PipelineBoardDeal` now, so calling it with `Opportunity[]`
    // already infers `Record<PipelineStage, Opportunity[]>`.
    const derivedColumns = useMemo(() => projectToColumns(deals), [deals]);
    const columns = liveColumns ?? derivedColumns;

    const getItemValue = useCallback((deal: Opportunity): string => deal.id, []);

    function handleValueChange(next: Record<string, Opportunity[]>) {
      if (!isDraggingRef.current) return;
      setLiveColumns(next as Columns);
    }

    function handleDragStart() {
      isDraggingRef.current = true;
      dragActivity.begin();
      setLiveColumns(derivedColumns);
    }

    function handleDragEnd() {
      isDraggingRef.current = false;
      dragActivity.end();
      setLiveColumns(null);
    }

    function handleDragCancel() {
      isDraggingRef.current = false;
      dragActivity.end();
      setLiveColumns(null);
    }

    // Commit -> mapper -> either the optimistic write path, or (the one
    // gated jump only) the reason modal first. `null` from the mapper
    // (no-op guards: drop-in-place, cancelled drag, unchanged arrangement)
    // means no request at all.
    function handleValueCommit(committedValue: Record<string, Opportunity[]>, meta: KanbanCommitMeta<Opportunity>) {
      const payload = mapCommitToMove(committedValue, meta);
      if (!payload) return;

      // The deal itself — specifically its OWN pre-drag `stage` field, read
      // straight off the query-cache-sourced object the vendor engine
      // repositions but never mutates — is the authoritative source for
      // "what stage is this move coming FROM", not `meta.activeContainer`.
      // Fail-closed: if the moved deal can't be found at its committed
      // position, bail without firing any request rather than guessing.
      const deal = committedValue[payload.stage]?.[meta.overIndex];
      if (!deal) return;

      if (isSkipJump(deal.stage, payload.stage)) {
        // Deliberately NOT calling moveOpportunity.mutate() here — the
        // optimistic onMutate write must not fire until the user supplies a
        // reason. handleDragEnd (above) has already nulled liveColumns by
        // the time this runs (the vendor engine calls onDragEnd before
        // onValueCommit — see reui/kanban.tsx's handleDragEnd), so without
        // intervention `columns` would already be back to `derivedColumns`
        // — the pre-drag, query-derived arrangement — and the card would
        // visually snap back to its origin column for the duration the
        // reason modal is open. Freezing the just-committed arrangement
        // back into `liveColumns` here keeps the card resting where it was
        // dropped instead, closer to what actually happens once the reason
        // is confirmed. Cleared back to `null` in the confirm handler's
        // `finally` and the modal's cancel path below, so both confirming
        // (the list gets invalidated/rolled back either way) and cancelling
        // (nothing was ever written) fall back to the query-derived
        // arrangement rather than staying frozen on this snapshot.
        setLiveColumns(committedValue as Columns);
        setPendingReasonMove({ payload, deal });
        return;
      }

      moveOpportunity.mutate({ id: payload.opportunityId, stage: payload.stage, stageOrder: payload.stageOrder });
    }

    // MoveReasonModal.onConfirm — async internally (mutateAsync), but the
    // prop's own type is `(reason: string) => void`; TS's void-return
    // compatibility allows a Promise-returning implementation here.
    async function handleConfirmReasonMove(reason: string) {
      if (!pendingReasonMove) return;
      const { payload } = pendingReasonMove;
      setIsMoveReasonBusy(true);
      try {
        await moveOpportunity.mutateAsync({
          id: payload.opportunityId,
          stage: payload.stage,
          stageOrder: payload.stageOrder,
          reason,
        });
      } catch {
        // Surfaced via the isError Alert below; nothing else to do here.
      } finally {
        setPendingReasonMove(null);
        setLiveColumns(null);
        setIsMoveReasonBusy(false);
      }
    }

    function handleCancelReasonMove() {
      // Nothing was ever written, so dropping the frozen liveColumns
      // snapshot alongside pendingReasonMove restores the card to its
      // pre-drag column/position immediately.
      setPendingReasonMove(null);
      setLiveColumns(null);
    }

    // useCallback (not a plain function): identity feeds useImperativeHandle
    // below, so the exposed `scrollToStage` only needs to be rebuilt if this
    // callback's own identity changes (it never does — columnRefs is a ref,
    // stable across renders).
    const scrollToStage = useCallback((stage: PipelineStage) => {
      columnRefs.current[stage]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, []);

    useImperativeHandle(ref, () => ({ scrollToStage }), [scrollToStage]);

    return (
      <div className="space-y-4">
        {moveOpportunity.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Could not move the opportunity: {(moveOpportunity.error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {/* N4: a card-menu flag toggle's own failure — see `toggleError`'s
            doc comment above. Dismissible (unlike the move-error Alert
            above, which clears itself once `moveOpportunity` next
            succeeds): `toggleError` is plain local state, not driven by a
            mutation's own `isError`, so nothing else clears it on its own. */}
        {toggleError && (
          <Alert variant="destructive">
            <AlertDescription>{toggleError}</AlertDescription>
            <AlertAction>
              <button
                type="button"
                onClick={() => setToggleError(null)}
                className="rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Dismiss
              </button>
            </AlertAction>
          </Alert>
        )}

        {/* Non-blocking inline offer, not a modal ambush (PRD §2.10) —
            mirrors OpportunityDetail.tsx's own post-won Alert. */}
        {justWonDeal && (
          <Alert variant="success">
            <AlertDescription>
              "{justWonDeal.title}" won. Create the delivery project?
            </AlertDescription>
            <AlertAction>
              <button
                type="button"
                onClick={() => {
                  setHandoffDeal(justWonDeal);
                  setJustWonDeal(null);
                }}
                className="rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container"
              >
                Create project
              </button>
              <button
                type="button"
                onClick={() => setJustWonDeal(null)}
                className="rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                Dismiss
              </button>
            </AlertAction>
          </Alert>
        )}

        {deals.length === 0 ? (
          <EmptyBoardState onCreate={onCreateOpportunity} />
        ) : (
          <Kanban
            value={columns}
            onValueChange={handleValueChange}
            onValueCommit={handleValueCommit}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            restoreOnCancel
            getItemValue={getItemValue}
          >
            <div className="flex gap-4 overflow-x-auto pb-2">
              <KanbanBoard className="contents">
                {PIPELINE_STAGES.map((stage) => {
                  const stageDeals = columns[stage];
                  const stageValue = stageDeals.reduce((sum, d) => sum + d.dealValue, 0);

                  return (
                    <div
                      key={stage}
                      ref={(el) => {
                        columnRefs.current[stage] = el;
                      }}
                      className="w-[85vw] shrink-0 sm:w-72"
                    >
                      <KanbanColumn
                        value={stage}
                        className={[
                          "flex min-h-32 flex-col gap-2.5 rounded-xl bg-surface-container p-2",
                          // PoC is the flow spec's hand-off risk point (§3): the
                          // column carries the amber attention tone on its top
                          // edge (the title stays in the ink colour for contrast) (docs/archive/plans/opportunity-flow-redesign.md D12).
                          stage === "POC" ? "border-t-2 border-chip-amber-text" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2 px-1 pb-1">
                          <h2 className="text-sm font-bold text-on-surface">
                            {STAGE_LABELS[stage]}
                          </h2>
                          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-meta text-on-surface-variant">
                            {stageDeals.length}
                          </span>
                          <span className="flex-1" />
                          <span className="text-meta tabular-nums text-on-surface-variant">
                            {formatIDRCompact(stageValue)}
                          </span>
                        </div>

                        <KanbanColumnContent value={stage} className="flex flex-col gap-2.5">
                          {stageDeals.map((deal) => {
                            const dragOk = canDragDeal(user, deal);
                            const editOk = canCloseDeal(user, deal);
                            return (
                              <KanbanItem
                                key={deal.id}
                                value={getItemValue(deal)}
                                disabled={!dragOk}
                                className={dragOk ? undefined : "opacity-100"}
                              >
                                <OpportunityCard
                                  deal={deal}
                                  canDrag={dragOk}
                                  canEdit={editOk}
                                  onClick={() => navigate(`/pipeline/${deal.id}`)}
                                  onRequestClose={() => setClosingDeal(deal)}
                                  onToggleError={setToggleError}
                                />
                              </KanbanItem>
                            );
                          })}
                          {/* Per-column empties render nothing (PRD §2.11) — no
                              placeholder card, no dashed drop hint. */}
                        </KanbanColumnContent>
                      </KanbanColumn>
                    </div>
                  );
                })}
              </KanbanBoard>
            </div>

            <KanbanOverlay>
              {({ value }) => {
                const deal = deals.find((d) => d.id === String(value));
                if (!deal) return null;
                return (
                  <KanbanItem value={getItemValue(deal)}>
                    <OpportunityCard deal={deal} canDrag dragging />
                  </KanbanItem>
                );
              }}
            </KanbanOverlay>
          </Kanban>
        )}

        <MoveReasonModal
          open={pendingReasonMove !== null}
          onClose={handleCancelReasonMove}
          onConfirm={handleConfirmReasonMove}
          dealTitle={pendingReasonMove?.deal.title ?? ""}
          busy={isMoveReasonBusy}
        />

        {closingDeal && (
          <CloseDealDialog
            deal={closingDeal}
            open
            onClose={() => setClosingDeal(null)}
            onClosed={(updated) => {
              setClosingDeal(null);
              // phase-review fix SF3: project:write alone let an edit_own
              // holder see (and 403 on) the offer for a colleague's Won
              // deal — `canHandoffDeal` adds the backend's own ownership
              // gate (mirrors PipelineClosed.tsx's identical fix).
              if (hasPermission(user, "project:write") && canHandoffDeal(user, updated)) {
                setJustWonDeal(updated);
              }
            }}
          />
        )}

        <HandoffProjectModal
          open={handoffDeal !== null}
          onClose={() => setHandoffDeal(null)}
          deal={handoffDeal}
        />
      </div>
    );
  },
);

function EmptyBoardState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-outline-variant px-6 py-14 text-center">
      <span aria-hidden="true" className="material-symbols-outlined text-3xl text-on-surface-variant">monetization_on</span>
      <p className="text-sm font-semibold text-on-surface">No opportunities yet</p>
      <p className="max-w-xs text-xs text-on-surface-variant">
        Opportunities you create will appear here, grouped by stage.
      </p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-2 inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary hover:bg-primary-container"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
          New opportunity
        </button>
      )}
    </div>
  );
}
