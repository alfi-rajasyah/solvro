// Opportunity detail — `/pipeline/:id` (PRD §2.5, docs/archive/plans/velora-integration-prd.md).
// Full page, not a side panel (the PRD is explicit: Velora's detail has too
// much content for a `TaskPanel`-style overlay) — structured like
// `ProjectDetail.tsx`/`CustomerDetail.tsx`: params -> query hook ->
// loading/404 gate -> content, back affordance to the list route.
//
// Edit affordance (M3 integration): opens `OpportunityFormModal` in edit
// mode, gated on `canEditDealFields` (boardLogic.ts, D16) — the plain
// ownership check with NO outcome clause: the backend still accepts a
// plain-field `PATCH /:id` (title, value, customer, …) on a closed deal,
// refusing only `subStatus`/`statusTag` there (`deal_closed`, §3.3), so the
// Edit button stays available after Close/Reopen. This is deliberately a
// DIFFERENT gate from `canEditDeal` (`canDragDeal`) below, which the stage
// menu and the flag toggles/Close button use and which locks out entirely
// once `outcome !== null` — see the header's Edit button and the modal
// mount near the bottom of this component.
//
// Assign PIC affordance (claim-unassigned-deals plan, D1/D2): an unassigned
// deal is locked for `pipeline:edit_own` holders — no drag, edit, stage
// change, link or delete — until it has a PIC. This button, gated on
// `canAssignThisDeal`, is the one exception; it opens `AssignPicModal`.
// Once assigned, the deal's normal own-rules (canEditDealFields/
// canEditDeal/canDeleteThisDeal above) take over — an `edit_all` holder
// reassigns an already-assigned deal through Edit, not through this button.
//
// Flag toggles / Close / Reopen (2026-09-25 opportunity flow redesign,
// docs/archive/plans/opportunity-flow-redesign.md §4.5): `canEditDeal` (`canDragDeal`)
// now doubles as "the deal is open AND I can edit it" (D5 — a closed deal is
// locked, stage-wise, never reset), so it also gates the three flag toggles
// — Waiting for Sales input/Input received (hidden on Waiting Response),
// Hold/Release hold, Mark delayed/Clear delayed — and the Close deal button.
// The toggles PATCH a single field through `useUpdateOpportunity`; Close
// opens `CloseDealDialog`, which owns its own `POST /:id/close` call end to
// end. Once a deal is closed (`outcome !== null`), its stage chip becomes
// read-only (a `lock` glyph replaces the menu), the flag toggles and Close
// disappear, and `canReopenDeal` gates a Reopen button instead (refused once
// the deal already has a linked project).
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { AssignPicModal } from "@/components/AssignPicModal";
import { CloseDealDialog } from "@/components/CloseDealDialog";
import { CommentBody, CommentComposer } from "@/components/CommentMentions";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { HandoffProjectModal } from "@/components/DealCard";
import { LinksSection } from "@/components/LinksSection";
import { MoveReasonModal } from "@/components/MoveReasonModal";
import { OpportunityFormModal } from "@/components/OpportunityFormModal";
import {
  IdleChip,
  OutcomeChip,
  OwnerChip,
  SubStatusChip,
  TagChip,
} from "@/components/PipelineFlagChips";
import {
  canAssignDeal,
  canCloseDeal,
  canDeleteDeal,
  canDragDeal,
  canEditDealFields,
  canHandoffDeal,
  canReopenDeal,
} from "@/components/pipeline/boardLogic";
import { probabilityTone } from "@/components/pipeline/kpi";
import { ActivityFeedBody } from "@/components/ProjectActivity";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import {
  Timeline,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
} from "@/components/reui/timeline";
import { SkeletonRegion } from "@/components/skeletons/SkeletonRegion";
import { StageChip } from "@/components/StageChip";
import { Chip } from "@/components/StatusChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPTY_VALUE } from "@/lib/emptyValue";
import { hasPermission, useAuth } from "@/lib/auth";
import { fmtAgo, fmtDateTime } from "@/lib/formatDate";
import { dealMentionCandidates } from "@/lib/mentions";
import {
  formatIDR,
  formatPipelineDate,
  formatWinProbability,
  isSkipJump,
  OUTCOME_LABELS,
  OUTCOME_REASON_LABELS,
  PIPELINE_SLA_HINT,
  STAGE_LABELS,
  STAGE_ORDER,
  type PipelineStage,
} from "@/lib/pipelineFormat";
import {
  useAddOpportunityActivity,
  useAddOpportunityLink,
  useDeleteOpportunity,
  useDeleteOpportunityLink,
  useMoveOpportunity,
  useOpportunity,
  useOpportunityActivities,
  useOpportunityActivity,
  useOpportunityLinks,
  useUsers,
  useReopenOpportunity,
  useUpdateOpportunity,
  useUpdateOpportunityLink,
  type ActivityEvent,
  type Opportunity,
  type OpportunityActivity,
} from "@/lib/queries";

// `insertAtStage` (backend/src/routes/opportunities.ts:138-152) clamps any
// requestedPosition to [0, siblings.length] inside a transaction — this
// constant is deliberately far larger than any realistic stage sibling
// count so a stage-menu selection always lands at the bottom of the target
// stage (the board's own drop-at-end default for a non-drag stage change).
const APPEND_TO_STAGE = 1_000_000;

// Display text for `PIPELINE_SLA_HINT`'s per-stage row (pipelineFormat.ts) —
// Waiting Response has no waiting-basis SLA (its owner is the client, not an
// SA sub-status), so it reads "no waiting SLA" plus its activity-basis
// warning/critical thresholds instead of the "N wd waiting" every SA-owned
// stage gets.
function slaHintCaption(stage: PipelineStage): string {
  const hint = PIPELINE_SLA_HINT[stage];
  if (hint.waitingDays === null) {
    const critical = hint.idleCriticalDays !== null ? `, ${hint.idleCriticalDays} wd critical` : "";
    return `no waiting SLA · ${hint.idleWarningDays} wd idle${critical}`;
  }
  return `${hint.waitingDays} wd waiting, ${hint.idleWarningDays} wd idle`;
}

// Finds the acting user's name on the latest "Closed as …" activity entry,
// for the closed-deal header caption ("Closed {date} by {user}"). Reads off
// the activities feed this page already loads for the Activity section
// (cheap — no extra request) rather than adding a dedicated lookup; returns
// null (caption omits "by {user}") when the feed hasn't loaded yet or simply
// carries no such entry.
function closedByUsername(activities: OpportunityActivity[] | undefined): string | null {
  if (!activities) return null;
  const closeEntries = activities.filter((a) => a.note.startsWith("Closed as "));
  if (closeEntries.length === 0) return null;
  const latest = closeEntries.reduce((a, b) =>
    new Date(a.createdAt) > new Date(b.createdAt) ? a : b,
  );
  return latest.user?.username ?? null;
}

// Header caption, below the chips row — two different lines depending on
// whether the deal is still open (D1's idle alert is computed server-side;
// this just mirrors the SLA table for display, see PIPELINE_SLA_HINT's doc
// comment) or closed (D5: the outcome note, plus who closed it when cheap to
// know).
function detailCaption(deal: Opportunity, closedBy: string | null): string {
  if (deal.outcome !== null) {
    const dateText = deal.closedAt ? fmtDateTime(deal.closedAt) : EMPTY_VALUE;
    const parts = [closedBy ? `Closed ${dateText} by ${closedBy}` : `Closed ${dateText}`];
    if (deal.outcomeReason) parts.push(deal.outcomeReason);
    return parts.join(" · ");
  }
  return `Last activity ${fmtDateTime(deal.lastActivityAt)} · SLA for this stage: ${slaHintCaption(deal.stage)}`;
}

export function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const dealId = id ?? null;
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: deal, isLoading, isError, error } = useOpportunity(dealId);
  const activities = useOpportunityActivities(dealId);
  const links = useOpportunityLinks(dealId);

  const moveOpportunity = useMoveOpportunity();
  const updateOpportunity = useUpdateOpportunity();
  const reopenOpportunity = useReopenOpportunity();
  const deleteOpportunity = useDeleteOpportunity();
  // Constructed with `id ?? ""` — these mutation hooks take a plain string
  // (no `enabled` gate like the query hooks above), but every path that can
  // actually call `.mutate()`/`.mutateAsync()` on them is only reachable
  // after the loading/404 gate below has already confirmed `deal` (and thus
  // a real `id`) loaded successfully.
  const addActivity = useAddOpportunityActivity(id ?? "");
  const addLink = useAddOpportunityLink(id ?? "");
  const updateLink = useUpdateOpportunityLink(id ?? "");
  const deleteLink = useDeleteOpportunityLink(id ?? "");

  // The one gated stage jump (D4): Technical Clarification -> RFP requires a
  // reason. Holds the TARGET stage while `MoveReasonModal` collects it; every
  // other stage pick moves immediately without this detour.
  const [pendingMoveReasonStage, setPendingMoveReasonStage] = useState<PipelineStage | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [closeDealOpen, setCloseDealOpen] = useState(false);
  // Post-won handoff offer (PRD §2.10, M5.24): a transient nudge shown
  // right after THIS SESSION's own Close-as-Won succeeds — separate from
  // the persistent "Create project" button below, which covers the case
  // where this banner was dismissed or the deal was already WON on load
  // (see that button's own `outcome === "WON" && !projectId` gate — the
  // offer must not evaporate just because this one-shot banner was closed).
  const [justWonOffer, setJustWonOffer] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);

  if (isLoading) {
    return (
      <SkeletonRegion className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </SkeletonRegion>
    );
  }

  if (isError || !deal) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error
            ? error.message
            : "Opportunity not found or you don't have access."}{" "}
          <Link to="/pipeline" className="ml-2 font-bold underline">
            Back to Pipeline
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const canEditDeal = canDragDeal(user, deal);
  // The plain-field-edit gate (D16) — NO outcome clause, unlike `canEditDeal`
  // above: the backend keeps accepting a plain-field PATCH on a closed deal
  // (only subStatus/statusTag are refused there), so Edit stays reachable
  // after Close/Reopen even though the stage menu, the flag toggles and
  // Close all lock out via `canEditDeal`/`canCloseDeal`.
  const canEditFieldsThisDeal = canEditDealFields(user, deal);
  const canCloseThisDeal = canCloseDeal(user, deal);
  // Also reused below to gate the persistent "Create project" button once a
  // WON deal is closed: `canEditDeal`/`canDragDeal` always return false once
  // ANY deal is closed (D5), so they can no longer stand in for "do I have
  // edit rights on this deal" post-close the way they could pre-redesign.
  // `canReopenDeal`'s own shape — edit rights AND closed AND no linked
  // project yet — happens to be exactly the precondition a handoff needs
  // too, so it does double duty here rather than adding a second helper to
  // boardLogic.ts for the same boolean.
  const canReopenThisDeal = canReopenDeal(user, deal);
  const canDeleteThisDeal = canDeleteDeal(user, deal);
  // Shows only on an unassigned deal — an `edit_all` holder reassigns an
  // already-assigned deal through Edit, not through this button (D4).
  const canAssignThisDeal = deal.picId === null && canAssignDeal(user, deal);

  function handleSelectStage(stage: PipelineStage) {
    if (!deal || stage === deal.stage) return;
    if (isSkipJump(deal.stage, stage)) {
      setPendingMoveReasonStage(stage);
      return;
    }
    moveOpportunity.mutate({ id: deal.id, stage, stageOrder: APPEND_TO_STAGE });
  }

  // Mirrors SolvroPipelineKanban.tsx's equivalent handler: async
  // mutateAsync, closes the modal either way once it settles — a failed
  // move surfaces via the isError Alert below (the mutation's own onError
  // already rolled back any optimistic write).
  async function handleConfirmSkipMove(reason: string) {
    if (!deal || !pendingMoveReasonStage) return;
    try {
      await moveOpportunity.mutateAsync({
        id: deal.id,
        stage: pendingMoveReasonStage,
        stageOrder: APPEND_TO_STAGE,
        reason,
      });
    } catch {
      // Surfaced via the isError Alert below.
    } finally {
      setPendingMoveReasonStage(null);
    }
  }

  function handleToggleWaitingInput() {
    if (!deal) return;
    const next = deal.subStatus === "WAITING_SALES_INPUT" ? "PROGRESS" : "WAITING_SALES_INPUT";
    updateOpportunity.mutate({ id: deal.id, patch: { subStatus: next } });
  }

  function handleToggleHold() {
    if (!deal) return;
    updateOpportunity.mutate({
      id: deal.id,
      patch: { statusTag: deal.statusTag === "HOLD" ? null : "HOLD" },
    });
  }

  function handleToggleDelayed() {
    if (!deal) return;
    updateOpportunity.mutate({
      id: deal.id,
      patch: { statusTag: deal.statusTag === "DELAYED" ? null : "DELAYED" },
    });
  }

  // `onClosed` callback for `CloseDealDialog` — uses the mutation's own
  // fresh return value (`updated`), never the stale `deal`/`canEditDeal`
  // closed over at render time: by the moment this fires, `deal.outcome` is
  // no longer null, so `canDragDeal`/`canEditDeal` would already read false
  // regardless of the actual pre-close permission check.
  function handleDealClosed(updated: Opportunity) {
    if (
      updated.outcome === "WON" &&
      hasPermission(user, "project:write") &&
      canReopenDeal(user, updated)
    ) {
      setJustWonOffer(true);
    }
  }

  async function handleReopen() {
    if (!deal) return;
    try {
      await reopenOpportunity.mutateAsync(deal.id);
    } catch {
      // Surfaced via the isError Alert below.
    }
  }

  async function handleDelete() {
    if (!deal) return;
    try {
      await deleteOpportunity.mutateAsync(deal.id);
      navigate("/pipeline");
    } catch {
      // Surfaced via the isError Alert below; modal closes either way,
      // same pattern as the stage-change confirm above.
    } finally {
      setConfirmDeleteOpen(false);
    }
  }

  const caption = detailCaption(deal, closedByUsername(activities.data));

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/pipeline"
          className="inline-flex items-center gap-1 font-display text-xs font-semibold text-on-surface-variant hover:text-primary"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[17px]">chevron_left</span>
          Pipeline
        </Link>

        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-h1 text-on-surface">{deal.title}</h1>
              <StageMenu
                stage={deal.stage}
                canEdit={canEditDeal}
                closed={deal.outcome !== null}
                onSelect={handleSelectStage}
              />
            </div>
            <p className="text-sm text-on-surface-variant">{deal.customerName}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OwnerChip owner={deal.owner} showSa />
              <SubStatusChip subStatus={deal.subStatus} idle={deal.idle} />
              <TagChip tag={deal.statusTag} />
              <IdleChip idle={deal.idle} />
              <OutcomeChip outcome={deal.outcome} reasonCategory={deal.outcomeReasonCategory} />
            </div>

            <p className="mt-1.5 text-xs text-on-surface-variant">{caption}</p>
          </div>

          <div className="flex flex-wrap shrink-0 items-center gap-3">
            <span className="text-lg tabular-nums text-primary">{formatIDR(deal.dealValue)}</span>
            {/* Copies the address bar's URL at click time, so a deal has a
                shareable address. */}
            <CopyLinkButton
              label="Copy link"
              className="tap-target h-8 w-8 rounded-sm border border-outline-variant hover:border-primary hover:text-primary"
            />
            {/* Persistent handoff affordance (PRD §2.10) — deliberately NOT
                gated on the transient `justWonOffer` banner below: it must
                stay available for as long as `outcome === "WON" &&
                !projectId` holds, including a fresh page load on an
                already-WON deal or after the banner's own Dismiss.
                Already-linked WON deals get a plain link to the project
                instead — no permission gate on that one, since following a
                link isn't a write. Gated on `project:write` AND
                `canHandoffDeal` (edit rights + Won + no project) —
                phase-review fix SF3: `canReopenThisDeal` (edit + CLOSED +
                no project) happened to share the "closed, no project" half
                of this shape by coincidence, not by contract, and a plain
                `project:write` + `canReopenDeal` combo let an edit_own
                holder see (and 403 on) this button for a colleague's Won
                deal — `canHandoffDeal` is the dedicated gate mirroring the
                backend's own `POST /:id/handoff` ownership + outcome check. */}
            {deal.outcome === "WON" && deal.projectId && (
              <Link
                to={`/projects/${deal.projectId}`}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">business_center</span>
                View project
              </Link>
            )}
            {hasPermission(user, "project:write") && canHandoffDeal(user, deal) && (
              <button
                type="button"
                onClick={() => setHandoffOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-primary px-2.5 py-1.5 font-display text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">rocket_launch</span>
                Create project
              </button>
            )}

            {canEditDeal && deal.stage !== "WAITING_RESPONSE" && (
              <button
                type="button"
                onClick={handleToggleWaitingInput}
                disabled={updateOpportunity.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">
                  {deal.subStatus === "WAITING_SALES_INPUT" ? "check_circle" : "schedule"}
                </span>
                {deal.subStatus === "WAITING_SALES_INPUT" ? "Input received" : "Waiting for Sales input"}
              </button>
            )}
            {/* Hold and Delayed share one `statusTag` column (D16, N5): while
                one is set, only ITS OWN clear action shows — the other
                setter would silently overwrite the active tag, so it's
                hidden rather than offered. Both setters show together only
                when neither tag is active. Mirrors the board card menu's
                same rule (OpportunityCard.tsx). */}
            {canEditDeal && deal.statusTag !== "DELAYED" && (
              <button
                type="button"
                onClick={handleToggleHold}
                disabled={updateOpportunity.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">
                  {deal.statusTag === "HOLD" ? "play_circle" : "pause_circle"}
                </span>
                {deal.statusTag === "HOLD" ? "Release hold" : "Hold"}
              </button>
            )}
            {canEditDeal && deal.statusTag !== "HOLD" && (
              <button
                type="button"
                onClick={handleToggleDelayed}
                disabled={updateOpportunity.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">
                  {deal.statusTag === "DELAYED" ? "event_available" : "event"}
                </span>
                {deal.statusTag === "DELAYED" ? "Clear delayed" : "Mark delayed"}
              </button>
            )}
            {canCloseThisDeal && (
              <button
                type="button"
                onClick={() => setCloseDealOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-error px-2.5 py-1.5 font-display text-xs font-semibold text-error hover:bg-error/10"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">flag</span>
                Close deal
              </button>
            )}
            {canReopenThisDeal && (
              <button
                type="button"
                onClick={handleReopen}
                disabled={reopenOpportunity.isPending}
                className="inline-flex items-center gap-1 rounded-sm border border-primary px-2.5 py-1.5 font-display text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">restart_alt</span>
                Reopen
              </button>
            )}

            {canAssignThisDeal && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-primary px-2.5 py-1.5 font-display text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">person_add</span>
                Assign PIC
              </button>
            )}
            {canEditFieldsThisDeal && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">edit</span>
                Edit
              </button>
            )}
            {canDeleteThisDeal && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-error hover:text-error"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-base">delete</span>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {moveOpportunity.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not change stage: {(moveOpportunity.error as Error).message}
          </AlertDescription>
        </Alert>
      )}
      {updateOpportunity.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not update the deal: {(updateOpportunity.error as Error).message}
          </AlertDescription>
        </Alert>
      )}
      {reopenOpportunity.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not reopen the deal: {(reopenOpportunity.error as Error).message}
          </AlertDescription>
        </Alert>
      )}
      {deleteOpportunity.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not delete this opportunity: {(deleteOpportunity.error as Error).message}
          </AlertDescription>
        </Alert>
      )}

      {/* Non-blocking inline offer, not a modal ambush (PRD §2.10) — only
          for as long as this deal has no linked project yet; a second Close
          on an already-linked deal can't happen (Close is gone once a deal
          is closed) so this wouldn't re-show a stale offer. */}
      {justWonOffer && !deal.projectId && (
        <Alert variant="success">
          <AlertDescription>Deal won. Create the delivery project?</AlertDescription>
          <AlertAction>
            <button
              type="button"
              onClick={() => {
                setHandoffOpen(true);
                setJustWonOffer(false);
              }}
              className="rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary primary-hover"
            >
              Create project
            </button>
            <button
              type="button"
              onClick={() => setJustWonOffer(false)}
              className="rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              Dismiss
            </button>
          </AlertAction>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <MetaGrid deal={deal} />
          <ActivitySection
            activities={activities.data}
            isLoading={activities.isLoading}
            isError={activities.isError}
            error={activities.error}
            addActivity={addActivity}
          />
          <RecentChanges dealId={deal.id} />
        </div>

        <div className="space-y-6">
          <LinksSection
            canEdit={canEditDeal}
            links={links.data}
            isLoading={links.isLoading}
            isError={links.isError}
            error={links.error}
            addLink={addLink}
            updateLink={updateLink}
            deleteLink={deleteLink}
          />
        </div>
      </div>

      <MoveReasonModal
        open={pendingMoveReasonStage !== null}
        onClose={() => setPendingMoveReasonStage(null)}
        onConfirm={handleConfirmSkipMove}
        dealTitle={deal.title}
        busy={moveOpportunity.isPending}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete opportunity"
        body={
          <>
            Delete <strong>{deal.title}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleteOpportunity.isPending}
      />

      <OpportunityFormModal open={editOpen} onClose={() => setEditOpen(false)} opportunity={deal} />

      <AssignPicModal open={assignOpen} onClose={() => setAssignOpen(false)} opportunity={deal} />

      <CloseDealDialog
        deal={deal}
        open={closeDealOpen}
        onClose={() => setCloseDealOpen(false)}
        onClosed={handleDealClosed}
      />

      <HandoffProjectModal open={handoffOpen} onClose={() => setHandoffOpen(false)} deal={deal} />
    </div>
  );
}

function StageMenu({
  stage,
  canEdit,
  closed,
  onSelect,
}: {
  stage: PipelineStage;
  canEdit: boolean;
  closed: boolean;
  onSelect: (stage: PipelineStage) => void;
}) {
  // A closed deal's stage is locked (D5) — no menu at all, edit rights or
  // not, plus a `lock` glyph so it reads differently from the plain
  // view-only chip below.
  if (closed) {
    return (
      <span className="inline-flex items-center gap-1">
        <StageChip stage={stage} />
        <span
          className="material-symbols-outlined text-[15px] text-on-surface-variant"
          aria-hidden="true"
        >
          lock
        </span>
      </span>
    );
  }

  // View-only callers (no pipeline:edit_own/edit_all on this deal, mirrors
  // canDragDeal's board gate) get the plain chip, no dropdown affordance.
  if (!canEdit) return <StageChip stage={stage} />;

  return (
    <DropdownMenu>
      {/* All visual content lives INSIDE the `render` element (house
          pattern — see reui/gantt/gantt-nav.tsx, reui/filters.tsx: every
          DropdownMenuTrigger usage in this codebase composes this way, not
          via separate `children` on the trigger itself). */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Change stage"
            className="inline-flex items-center gap-1 rounded-full outline-hidden hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <StageChip stage={stage} />
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-on-surface-variant">
              expand_more
            </span>
          </button>
        }
      />
      <DropdownMenuContent align="start">
        {STAGE_ORDER.map((s) => (
          <DropdownMenuItem key={s} disabled={s === stage} onClick={() => onSelect(s)}>
            {STAGE_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MetaItem({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-[17px] text-on-surface-variant">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-label-caps uppercase text-on-surface-variant">{label}</p>
        <div className="text-sm text-on-surface">{children}</div>
      </div>
    </div>
  );
}

function MetaGrid({ deal }: { deal: Opportunity }) {
  return (
    <div className="space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="font-display text-label-caps uppercase text-on-surface-variant">
        Details
      </h2>

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <MetaItem icon="person" label="PIC">
          <span className="flex items-center gap-2">
            <AssigneeAvatar user={deal.pic} size="xs" />
            {deal.pic?.username ?? "Unassigned"}
          </span>
        </MetaItem>
        <MetaItem icon="show_chart" label="Win probability">
          <Chip tone={probabilityTone(deal.winProbability)}>
            {formatWinProbability(deal.winProbability)}
          </Chip>
        </MetaItem>
        <MetaItem icon="today" label="Request date">
          {deal.requestDate ? formatPipelineDate(deal.requestDate) : EMPTY_VALUE}
        </MetaItem>
        <MetaItem icon="event" label="Deadline">
          {deal.deadline ? formatPipelineDate(deal.deadline) : EMPTY_VALUE}
        </MetaItem>
        <MetaItem icon="public" label="Lead source">
          {deal.leadSource || EMPTY_VALUE}
        </MetaItem>
        <MetaItem icon="inventory_2" label="Product / Solution">
          {deal.productSolution || EMPTY_VALUE}
        </MetaItem>
        {/* Open + waiting on the client (D3/D10): the SA is waiting for the
            Sales team to clear the flag — see SubStatusChip in the header. */}
        {deal.outcome === null &&
          deal.subStatus === "WAITING_SALES_INPUT" &&
          deal.waitingInputSince && (
          <MetaItem icon="schedule" label="Waiting on Sales since">
            {fmtDateTime(deal.waitingInputSince)}
          </MetaItem>
        )}
        {/* Closed (D5): the stage never resets, so it's shown here as history
            alongside the outcome and when it closed. */}
        {deal.outcome !== null && (
          <>
            <MetaItem icon="flag" label="Stage at close">
              {STAGE_LABELS[deal.stage]}
            </MetaItem>
            <MetaItem icon="check_circle" label="Outcome">
              {deal.outcomeReasonCategory
                ? `${OUTCOME_LABELS[deal.outcome]} · ${OUTCOME_REASON_LABELS[deal.outcomeReasonCategory]}`
                : OUTCOME_LABELS[deal.outcome]}
            </MetaItem>
            <MetaItem icon="event_available" label="Closed">
              {deal.closedAt ? fmtDateTime(deal.closedAt) : EMPTY_VALUE}
            </MetaItem>
          </>
        )}
      </div>

      {deal.description && (
        <div className="border-t border-outline-variant pt-3">
          <p className="whitespace-pre-wrap wrap-break-word text-sm text-on-surface-variant">
            {deal.description}
          </p>
        </div>
      )}
    </div>
  );
}

function ActivitySection({
  activities,
  isLoading,
  isError,
  error,
  addActivity,
}: {
  activities: OpportunityActivity[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  addActivity: ReturnType<typeof useAddOpportunityActivity>;
}) {
  // @mentions in a note: active users who can open the Pipeline (the
  // `pipeline:view` permission or `*`), so a mention always lands on someone
  // who can follow the link. Chips render from the note's returned ids and the
  // whole directory, so a mention of a since-deactivated user still shows.
  const { data: directory } = useUsers();
  const candidates = useMemo(() => dealMentionCandidates(directory), [directory]);
  const known = useMemo(
    () => (directory ?? []).map((u) => ({ id: u.id, username: u.username, active: u.active })),
    [directory],
  );

  return (
    <div className="space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="font-display text-label-caps uppercase text-on-surface-variant">
        Activity {activities && activities.length > 0 && `· ${activities.length}`}
      </h2>

      {isLoading && (
        <SkeletonRegion>
          <Skeleton className="h-16" />
        </SkeletonRegion>
      )}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load activity: {(error as Error).message}
          </AlertDescription>
        </Alert>
      )}
      {activities && activities.length === 0 && (
        <p className="text-sm text-on-surface-variant">No activity yet.</p>
      )}

      {/* `value={-1}` neutralizes reui Timeline's step/active-state concept
          (SOLVRO PATCH convention from ProjectTimeline.tsx) — this is a
          newest-first activity feed, not a progress tracker; no item should
          receive the vendored "completed" styling. */}
      {activities && activities.length > 0 && (
        <Timeline value={-1} role="list">
          {activities.map((a, index) => (
            <TimelineItem
              key={a.id}
              step={index}
              role="listitem"
              className="group-data-[orientation=vertical]/timeline:not-last:pb-4"
            >
              <TimelineSeparator className="bg-outline-variant" />
              <TimelineIndicator className="border-surface-container-lowest bg-primary" />
              <div className="flex gap-2.5">
                <AssigneeAvatar user={a.user} size="xs" />
                <div className="min-w-0 flex-1 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2">
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-on-surface">
                      {a.user?.username ?? "Unknown"}
                    </span>
                    <span className="shrink-0 text-on-surface-variant">
                      {fmtAgo(a.createdAt)}
                    </span>
                  </div>
                  <CommentBody body={a.note} mentionedUserIds={a.mentionedUserIds} users={known} />
                </div>
              </div>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      <CommentComposer
        variant="note"
        candidates={candidates}
        isPending={addActivity.isPending}
        error={addActivity.isError ? (addActivity.error as Error).message : null}
        onSend={async (note, mentionedUserIds) => {
          await addActivity.mutateAsync({ note, mentionedUserIds });
        }}
      />
    </div>
  );
}

// The Activity timeline above has a sentence for every deal action, field
// edits included since 2026-11-12. This list keeps only the field edits, as
// the structured per-field record of them.
const isFieldEdit = (event: ActivityEvent) =>
  event.entityType === "opportunity" && event.action === "updated";

/**
 * The deal's field edits (GET /opportunities/:id/activity, narrowed to
 * `opportunity` / `updated` events): value, deadline, win probability and so
 * on, each with its before and after. The notes themselves stay in the
 * Activity timeline above; this feed never carries note text.
 */
function RecentChanges({ dealId }: { dealId: string }) {
  const query = useOpportunityActivity(dealId);
  return (
    <section
      aria-labelledby="deal-changes-heading"
      className="space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-4"
    >
      <h2
        id="deal-changes-heading"
        className="font-display text-label-caps uppercase text-on-surface-variant"
      >
        Field changes
      </h2>
      <ActivityFeedBody
        query={query}
        emptyText="Edits to this deal's fields show up here, with the old and new values."
        filter={isFieldEdit}
        currentHref={`/pipeline/${dealId}`}
      />
    </section>
  );
}
