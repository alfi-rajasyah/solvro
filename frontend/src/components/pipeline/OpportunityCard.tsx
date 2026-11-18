// Board card — PRD §2.3's "Card anatomy", restyled from Velora's card.tsx
// (../VeloraApp/components/kanban/card.tsx, read-only reference) onto
// Technical Precision tokens. Presentational only, same split as
// kanban-v2/cards.tsx's TaskCard: the parent (SolvroPipelineKanban.tsx)
// wraps this in the vendored engine's `<KanbanItem>`, this component owns
// only the card body + the `KanbanItemHandle` drag grip.
//
// No StageChip here by design (PRD §2.3: the column already says the
// stage) — `dispatch brief point 2` confirms this explicitly.
//
// 2026-09-25 flow redesign (docs/archive/plans/opportunity-flow-redesign.md §4.4):
// a badges row (`OwnerChip`/`SubStatusChip`/`TagChip`/`IdleChip`,
// `PipelineFlagChips.tsx`) renders below the product line — each chip
// renders nothing when its condition doesn't hold, so the row can render
// unconditionally and only the applicable ones draw anything. The old
// "Held from {preHoldStage}" cue is gone with `preHoldStage` itself (Hold
// is a `statusTag` now, not a stage — see `TagChip`). A ⋯ menu at the title
// row's end (shown when the caller passes `canEdit`) exposes the same
// inline flag toggles the detail page's actions offer, plus Close deal —
// see `canEdit`'s own doc comment below.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { OwnerChip, SubStatusChip, TagChip, IdleChip } from "@/components/PipelineFlagChips";
import { KanbanItemHandle } from "@/components/reui/kanban";
import { Chip } from "@/components/StatusChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api";
import { formatIDRCompact, formatPipelineDate, formatWinProbability } from "@/lib/pipelineFormat";
import { useUpdateOpportunity, type Opportunity, type UpdateOpportunityInput } from "@/lib/queries";
import { isDealOverdue, probabilityTone } from "./kpi";

export interface OpportunityCardProps {
  deal: Opportunity;
  canDrag: boolean;
  // Ghost-in-KanbanOverlay treatment (M4 in kanban-v2's SolvroKanban.tsx) —
  // true only for the drag overlay's copy of this card, never a card sitting
  // in its normal column position.
  dragging?: boolean;
  // Card click -> `/pipeline/:id` (PRD §2.3, OpportunityDetail/M3.16).
  // Wired by each call site (SolvroPipelineKanban.tsx's board cards,
  // PipelineQuarter.tsx's cells — M3 integration); the KanbanOverlay ghost
  // copy in SolvroPipelineKanban.tsx deliberately omits it, same as
  // kanban-v2/SolvroKanban.tsx's overlay TaskCard never gets an onClick
  // either. Optional so this component still renders standalone.
  onClick?: () => void;
  /** Shows the ⋯ menu when true — the caller's own edit gate
   * (`canCloseDeal`, boardLogic.ts: the edit permission AND the deal isn't
   * already closed). Omitted entirely (no menu, no trigger button) rather
   * than rendered-disabled, same optional-prop-omits-affordance convention
   * `onClick` above uses. */
  canEdit?: boolean;
  /** Menu's "Close deal…" item — the container owns `CloseDealDialog`
   * (D5: one Close action for Won/Lost/Cancelled), this card only asks it
   * to open for `deal`. */
  onRequestClose?: (deal: Opportunity) => void;
  /** Phase-review fix N4 — a failed toggle (400 `deal_closed`/
   * `sub_status_not_allowed`, 403, …) previously had no surface at all
   * (this repo has no toast system, and `useUpdateOpportunity` is a plain,
   * non-optimistic mutation, so nothing visually rolled back either). The
   * container (`SolvroPipelineKanban.tsx`) owns a real error `Alert` beside
   * its existing `moveOpportunity.isError` one and feeds it this callback's
   * message. */
  onToggleError?: (message: string) => void;
}

export function OpportunityCard({
  deal,
  canDrag,
  dragging = false,
  onClick,
  canEdit = false,
  onRequestClose,
  onToggleError,
}: OpportunityCardProps) {
  const overdue = isDealOverdue(deal.deadline);
  const updateOpportunity = useUpdateOpportunity();
  const [pending, setPending] = useState(false);

  // stopPropagation mirrors kanban-v2/cards.tsx's TaskCard.handleClick
  // exactly — click-vs-drag separation is actually handled upstream by the
  // vendored engine's pointer-movement activation constraint (reui/
  // kanban.tsx's `MOUSE_SENSOR_OPTIONS`, distance: 10), not by this
  // stopPropagation; this just keeps a card click from bubbling to any
  // ancestor click handler (the column, the board scroll container).
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onClick?.();
  }

  // Fire-and-forget inline toggle — `useUpdateOpportunity` is a plain
  // (non-optimistic) mutation, so a failed toggle simply leaves the card
  // showing its pre-toggle state rather than flipping and rolling back;
  // nothing to reconcile visually. `pending` only disables the menu items
  // for the duration of one in-flight toggle so a slow request can't be
  // double-fired from repeat clicks. A failure is reported to the
  // container via `onToggleError` (N4) rather than swallowed — this repo
  // has no toast system, so the container's own error `Alert` is the only
  // surface available.
  function toggle(patch: UpdateOpportunityInput) {
    setPending(true);
    updateOpportunity.mutate(
      { id: deal.id, patch },
      {
        onError: (err) => {
          onToggleError?.(err instanceof ApiError ? err.message : "Could not update the deal.");
        },
        onSettled: () => setPending(false),
      },
    );
  }

  return (
    <div
      onClick={handleClick}
      className={[
        "touch-manipulation rounded-sm border bg-surface-container-lowest p-3 transition-colors",
        onClick ? "cursor-pointer" : "",
        dragging
          ? "rotate-[-1.2deg] border-[1.5px] border-primary shadow-overlay ring-2 ring-primary"
          : "border-outline-variant hover:border-primary",
      ].join(" ")}
    >
      {/* Title + drag handle + win% + ⋯ menu */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {canDrag && (
            <KanbanItemHandle
              aria-label="Drag to reorder"
              className="mt-0.5 inline-flex shrink-0 touch-none items-center text-on-surface-variant/60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">drag_indicator</span>
            </KanbanItemHandle>
          )}
          {/* Title as a real `<Link>` — keyboard/screen-reader route to the
              detail page (the card's own `onClick`, below, isn't reachable
              via Tab). `stopPropagation` keeps the click from also bubbling
              to the card's `handleClick` and double-navigating; the card
              click stays the mouse affordance. Unobtrusive styling — same
              ink color as before, `hover:text-primary` only as an extra
              affordance the card's own `hover:border-primary` doesn't
              provide for keyboard focus. */}
          <Link
            to={`/pipeline/${deal.id}`}
            onClick={(e) => e.stopPropagation()}
            className="line-clamp-2 min-w-0 rounded-sm text-sm font-semibold leading-tight text-on-surface hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {deal.title}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Chip tone={probabilityTone(deal.winProbability)}>{formatWinProbability(deal.winProbability)}</Chip>
          {canEdit && (
            // stopPropagation on the wrapper — Base-UI's menu content renders
            // via a Portal but stays in the REACT tree under this element, so
            // a click anywhere in the (portalled) menu still bubbles through
            // here in React's event model; this one wrapper stops it from
            // also reaching the card's own `handleClick` (which would
            // navigate) or the vendored Kanban's drag activation.
            <span onClick={(e) => e.stopPropagation()}>
              <OpportunityCardMenu
                deal={deal}
                pending={pending || updateOpportunity.isPending}
                onToggle={toggle}
                onOpen={() => onClick?.()}
                onRequestClose={() => onRequestClose?.(deal)}
              />
            </span>
          )}
        </div>
      </div>

      {/* Customer + deal value */}
      <p className="mb-0.5 truncate text-xs text-on-surface-variant">{deal.customerName}</p>
      <p className="mb-2 text-data-mono text-primary">{formatIDRCompact(deal.dealValue)}</p>

      {/* PIC + deadline row */}
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-on-surface-variant">
        <span className="flex min-w-0 items-center gap-1.5">
          <AssigneeAvatar user={deal.pic} size="xs" />
          <span className="truncate">{deal.pic?.username ?? "Unassigned"}</span>
        </span>
        {deal.deadline && (
          <span
            className={[
              "flex shrink-0 items-center gap-1",
              overdue ? "font-semibold text-chip-rose-text" : "",
            ].join(" ")}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">event</span>
            {formatPipelineDate(deal.deadline)}
          </span>
        )}
      </div>

      {/* Product/solution, truncated */}
      {deal.productSolution && (
        <p className="truncate text-meta text-on-surface-variant">{deal.productSolution}</p>
      )}

      {/* Badges row — owner / sub-status / tag / idle. Each chip renders
          nothing when its condition doesn't hold (PipelineFlagChips.tsx's own
          convention), so this row can render unconditionally. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <OwnerChip owner={deal.owner} />
        <SubStatusChip subStatus={deal.subStatus} idle={deal.idle} />
        <TagChip tag={deal.statusTag} />
        <IdleChip idle={deal.idle} />
      </div>
    </div>
  );
}

function OpportunityCardMenu({
  deal,
  pending,
  onToggle,
  onOpen,
  onRequestClose,
}: {
  deal: Opportunity;
  pending: boolean;
  onToggle: (patch: { subStatus?: Opportunity["subStatus"]; statusTag?: Opportunity["statusTag"] }) => void;
  onOpen: () => void;
  onRequestClose: () => void;
}) {
  const isWaitingSalesInput = deal.subStatus === "WAITING_SALES_INPUT";
  const isHold = deal.statusTag === "HOLD";
  const isDelayed = deal.statusTag === "DELAYED";

  return (
    <DropdownMenu>
      {/* All visual content lives INSIDE the `render` element (house
          pattern — see OpportunityDetail.tsx's StageMenu, reui/gantt/
          gantt-nav.tsx, reui/filters.tsx). */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="More actions"
            className="tap-target inline-flex h-6 w-6 items-center justify-center rounded-sm text-on-surface-variant outline-hidden hover:bg-surface-container-high hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">more_vert</span>
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpen}>Open deal</DropdownMenuItem>
        <DropdownMenuSeparator />
        {deal.stage !== "WAITING_RESPONSE" && (
          <DropdownMenuItem
            disabled={pending}
            onClick={() => onToggle({ subStatus: isWaitingSalesInput ? "PROGRESS" : "WAITING_SALES_INPUT" })}
          >
            {isWaitingSalesInput ? "Input received" : "Waiting for Sales input"}
          </DropdownMenuItem>
        )}
        {/* Hold and Delayed write the same single column (`statusTag`) —
            phase-review fix N5: showing both setters unconditionally let a
            click on "Mark delayed" silently replace an existing Hold with
            no visible warning. While one tag is set, only ITS clearing item
            shows (the other tag's setter hides entirely); both setters show
            only when no tag is set. */}
        {isHold && (
          <DropdownMenuItem disabled={pending} onClick={() => onToggle({ statusTag: null })}>
            Release hold
          </DropdownMenuItem>
        )}
        {isDelayed && (
          <DropdownMenuItem disabled={pending} onClick={() => onToggle({ statusTag: null })}>
            Clear delayed
          </DropdownMenuItem>
        )}
        {!isHold && !isDelayed && (
          <>
            <DropdownMenuItem disabled={pending} onClick={() => onToggle({ statusTag: "HOLD" })}>
              Hold
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={() => onToggle({ statusTag: "DELAYED" })}>
              Mark delayed
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRequestClose}>
          Close deal…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
