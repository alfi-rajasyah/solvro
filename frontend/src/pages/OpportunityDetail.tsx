// Opportunity detail — `/pipeline/:id` (PRD §2.5, docs/plans/velora-integration-prd.md).
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
// docs/plans/opportunity-flow-redesign.md §4.5): `canEditDeal` (`canDragDeal`)
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
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { AssignPicModal } from "@/components/AssignPicModal";
import { CloseDealDialog } from "@/components/CloseDealDialog";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { HandoffProjectModal } from "@/components/DealCard";
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
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import { fmtAgo, fmtDateTime } from "@/lib/formatDate";
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
  useOpportunityLinks,
  useReopenOpportunity,
  useUpdateOpportunity,
  useUpdateOpportunityLink,
  type Opportunity,
  type OpportunityActivity,
  type OpportunityLink,
} from "@/lib/queries";

// `insertAtStage` (backend/src/routes/opportunities.ts:138-152) clamps any
// requestedPosition to [0, siblings.length] inside a transaction — this
// constant is deliberately far larger than any realistic stage sibling
// count so a stage-menu selection always lands at the bottom of the target
// stage (the board's own drop-at-end default for a non-drag stage change).
const APPEND_TO_STAGE = 1_000_000;

// Mirrors Velora's `getDocIcon` (../VeloraApp
// app/opportunities/[id]/detail-content.tsx) — same URL-substring
// detection, remapped from emoji onto material-symbols glyphs per house
// icon convention (frontend/CLAUDE.md: app chrome uses the
// material-symbols-outlined font).
function linkIcon(url: string): string {
  if (url.includes("docs.google.com/spreadsheets")) return "table_chart";
  if (url.includes("docs.google.com/presentation")) return "slideshow";
  if (url.includes("docs.google.com/document")) return "description";
  if (url.includes("drive.google.com")) return "folder";
  return "link";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
    const dateText = deal.closedAt ? fmtDateTime(deal.closedAt) : "—";
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
          <span className="material-symbols-outlined text-[17px]">chevron_left</span>
          Pipeline
        </Link>

        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-h2 text-on-surface">{deal.title}</h1>
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
              className="h-8 w-8 rounded-sm border border-outline-variant hover:border-primary hover:text-primary"
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
                <span className="material-symbols-outlined text-base">business_center</span>
                View project
              </Link>
            )}
            {hasPermission(user, "project:write") && canHandoffDeal(user, deal) && (
              <button
                type="button"
                onClick={() => setHandoffOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-primary px-2.5 py-1.5 font-display text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-base">rocket_launch</span>
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
                <span className="material-symbols-outlined text-base">
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
                <span className="material-symbols-outlined text-base">
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
                <span className="material-symbols-outlined text-base">
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
                <span className="material-symbols-outlined text-base">flag</span>
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
                <span className="material-symbols-outlined text-base">restart_alt</span>
                Reopen
              </button>
            )}

            {canAssignThisDeal && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-primary px-2.5 py-1.5 font-display text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-base">person_add</span>
                Assign PIC
              </button>
            )}
            {canEditFieldsThisDeal && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <span className="material-symbols-outlined text-base">edit</span>
                Edit
              </button>
            )}
            {canDeleteThisDeal && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1.5 font-display text-xs font-semibold text-on-surface-variant hover:border-error hover:text-error"
              >
                <span className="material-symbols-outlined text-base">delete</span>
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
          <AlertDescription>Deal won — create the delivery project?</AlertDescription>
          <AlertAction>
            <button
              type="button"
              onClick={() => {
                setHandoffOpen(true);
                setJustWonOffer(false);
              }}
              className="rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container"
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
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
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
      <span className="material-symbols-outlined mt-0.5 text-[17px] text-on-surface-variant">
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
          {deal.requestDate ? formatPipelineDate(deal.requestDate) : "—"}
        </MetaItem>
        <MetaItem icon="event" label="Deadline">
          {deal.deadline ? formatPipelineDate(deal.deadline) : "—"}
        </MetaItem>
        <MetaItem icon="public" label="Lead source">
          {deal.leadSource || "—"}
        </MetaItem>
        <MetaItem icon="inventory_2" label="Product / Solution">
          {deal.productSolution || "—"}
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
              {deal.closedAt ? fmtDateTime(deal.closedAt) : "—"}
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
  const [note, setNote] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed || addActivity.isPending) return;
    try {
      await addActivity.mutateAsync(trimmed);
      setNote("");
    } catch {
      // Surfaced via addActivity.error below.
    }
  }

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
                  <p className="whitespace-pre-wrap wrap-break-word text-xs text-on-surface">
                    {a.note}
                  </p>
                </div>
              </div>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-outline-variant pt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Add a note…"
          className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between gap-2">
          {addActivity.isError ? (
            <p className="text-xs text-error">{(addActivity.error as Error).message}</p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={addActivity.isPending || !note.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">send</span>
            {addActivity.isPending ? "Adding…" : "Add note"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LinksSection({
  canEdit,
  links,
  isLoading,
  isError,
  error,
  addLink,
  updateLink,
  deleteLink,
}: {
  canEdit: boolean;
  links: OpportunityLink[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  addLink: ReturnType<typeof useAddOpportunityLink>;
  updateLink: ReturnType<typeof useUpdateOpportunityLink>;
  deleteLink: ReturnType<typeof useDeleteOpportunityLink>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteLink, setConfirmDeleteLink] = useState<OpportunityLink | null>(null);

  async function handleAdd() {
    setFormError(null);
    if (!label.trim()) {
      setFormError("Label is required.");
      return;
    }
    if (!isHttpUrl(url.trim())) {
      setFormError("URL must start with http:// or https://");
      return;
    }
    try {
      await addLink.mutateAsync({ label: label.trim(), url: url.trim() });
      setLabel("");
      setUrl("");
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not add link.");
    }
  }

  return (
    <div className="space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-label-caps uppercase text-on-surface-variant">
          Links {links && links.length > 0 && `· ${links.length}`}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setFormOpen((v) => !v);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2 py-1 font-display text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add link
          </button>
        )}
      </div>

      {isLoading && (
        <SkeletonRegion>
          <Skeleton className="h-10" />
        </SkeletonRegion>
      )}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load links: {(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {formOpen && (
        <div className="space-y-2 rounded-sm border border-outline-variant bg-surface-container-low p-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Proposal)"
            className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
          />
          {formError && <p className="text-xs text-error">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
              className="rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={addLink.isPending}
              className="rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              {addLink.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {links && links.length === 0 && !formOpen && (
        <p className="text-sm text-on-surface-variant">No links yet.</p>
      )}

      {links && links.length > 0 && (
        <ul className="divide-y divide-outline-variant/60">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              canEdit={canEdit}
              updateLink={updateLink}
              onDelete={() => setConfirmDeleteLink(link)}
            />
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmDeleteLink !== null}
        onClose={() => setConfirmDeleteLink(null)}
        onConfirm={() => {
          if (confirmDeleteLink) {
            deleteLink.mutate(confirmDeleteLink.id, {
              onSuccess: () => setConfirmDeleteLink(null),
            });
          }
        }}
        title="Delete link"
        body={
          confirmDeleteLink ? (
            <>
              Delete the link <strong>{confirmDeleteLink.label}</strong>?
            </>
          ) : null
        }
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleteLink.isPending}
      />
    </div>
  );
}

function LinkRow({
  link,
  canEdit,
  updateLink,
  onDelete,
}: {
  link: OpportunityLink;
  canEdit: boolean;
  updateLink: ReturnType<typeof useUpdateOpportunityLink>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [error, setError] = useState<string | null>(null);

  // `updateLink` is one shared mutation instance passed down to every
  // `LinkRow` (LinksSection creates it once) — its own `.isPending` is
  // global across every row's Save button, so saving link A would
  // incorrectly disable link B's Save button too while A is in flight
  // (both rows can independently be in `editing` state at once). Scope
  // "is THIS row's save in flight" by also checking the mutation's own
  // `.variables` — the acting link id from the most recent `.mutate()`
  // call — against this row's `link.id`.
  const isSaving = updateLink.isPending && updateLink.variables?.id === link.id;

  function startEdit() {
    setLabel(link.label);
    setUrl(link.url);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!isHttpUrl(url.trim())) {
      setError("URL must start with http:// or https://");
      return;
    }
    try {
      await updateLink.mutateAsync({ id: link.id, patch: { label: label.trim(), url: url.trim() } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update link.");
    }
  }

  if (editing) {
    return (
      <li className="space-y-2 py-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-sm px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-sm bg-primary px-3 py-1 font-display text-xs font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-2">
      <span className="material-symbols-outlined shrink-0 text-[17px] text-primary">
        {linkIcon(link.url)}
      </span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
      >
        {link.label}
      </a>
      {/* Always visible (not hover-gated) — hover-only actions are
          unreachable on the 375px touch-device floor (frontend/CLAUDE.md
          Mobile convention). */}
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit link"
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete link"
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-error"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      )}
    </li>
  );
}
