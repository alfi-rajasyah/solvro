// Pure, React-free gating logic for the Pipeline board — split out of
// SolvroPipelineKanban.tsx so both are unit-testable without a DOM (this
// repo has no @testing-library/react; every kanban-adjacent test file is a
// plain vitest .test.ts over extracted pure functions — see
// kanban-v2/adapter.test.ts, pipeline/commitMapper.test.ts, etc.).
import { hasPermission, type AuthUser } from "@/lib/auth";
import type { PipelineBoardDeal } from "./adapter";

/**
 * Shared edit-permission check backing `canDragDeal`/`canCloseDeal`/
 * `canReopenDeal` below — mirrors the backend's
 * `assertCanWriteOpportunity(user, "edit", …)`
 * (backend/src/lib/pipelineAccess.ts): `pipeline:edit_all` (or the `"*"`
 * wildcard, handled inside `hasPermission`) always allows; otherwise the
 * caller needs `pipeline:edit_own` AND to be the deal's own PIC.
 */
function hasEditAccess(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId">,
): boolean {
  return (
    hasPermission(user, "pipeline:edit_all") ||
    (hasPermission(user, "pipeline:edit_own") && deal.picId === user?.id)
  );
}

/**
 * Drag-permission gate for a single deal — the edit gate (`hasEditAccess`)
 * AND the deal must not already be closed (2026-09-25 flow redesign D5: a
 * closed deal is locked, stage-wise; only Reopen can move it again).
 * `needsTerminalConfirm` (the old WON/DROP drag-confirm gate) is gone —
 * Won/Lost/Cancelled are no longer stages a drag can land on at all; a deal
 * is closed through `CloseDealDialog`/`canCloseDeal` below instead. This is
 * a proactive UI gate only (disables the drag handle) — the server remains
 * the authority (`POST /:id/move` 409s `closed` independently).
 */
export function canDragDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId" | "outcome">,
): boolean {
  return hasEditAccess(user, deal) && deal.outcome === null;
}

/**
 * Delete-permission gate for a single deal — mirrors the backend's
 * `assertCanWriteOpportunity(user, "delete", ...)`
 * (backend/src/lib/pipelineAccess.ts): `pipeline:delete_all` (or the `"*"`
 * wildcard, handled inside `hasPermission`) always allows; otherwise the
 * caller needs `pipeline:delete_own` AND to be the deal's own PIC. Same
 * proactive-UI-gate caveat as `canDragDeal` above (server remains the
 * authority). Colocated with `canDragDeal` (finding S10) rather than
 * OpportunityDetail.tsx's own private copy — both are pure permission
 * gates over the same `Pick<PipelineBoardDeal, "picId">` shape.
 */
export function canDeleteDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId">,
): boolean {
  return (
    hasPermission(user, "pipeline:delete_all") ||
    (hasPermission(user, "pipeline:delete_own") && deal.picId === user?.id)
  );
}

/**
 * Assign-permission gate for a single deal — mirrors the backend's new
 * `assertCanAssignOpportunity` (backend/src/lib/pipelineAccess.ts):
 * `pipeline:edit_all` (or the `"*"` wildcard, handled inside
 * `hasPermission`) always allows; otherwise the caller needs
 * `pipeline:edit_own` AND the deal must have no PIC yet (D1: an unassigned
 * deal stays locked for everything but this one action, for everyone but
 * `_all` holders — an `_own` holder can never reassign an already-assigned
 * deal through this gate, foreign or their own, per D4). Same
 * proactive-UI-gate caveat as `canDragDeal`/`canDeleteDeal` above — the
 * server remains the authority; a 403 here would just be a race.
 */
export function canAssignDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId">,
): boolean {
  return (
    hasPermission(user, "pipeline:edit_all") ||
    (hasPermission(user, "pipeline:edit_own") && deal.picId === null)
  );
}

/**
 * Gate for opening `CloseDealDialog` (2026-09-25 flow redesign D5) — the
 * edit gate AND the deal isn't already closed. Mirrors the backend's own
 * guard (`current.outcome !== null` -> 409 `already_closed`,
 * `POST /:id/close`).
 */
export function canCloseDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId" | "outcome">,
): boolean {
  return hasEditAccess(user, deal) && deal.outcome === null;
}

/**
 * Gate for the Reopen action (D5) — the edit gate, the deal IS closed, and
 * it hasn't already been handed off to a project. Mirrors the backend's own
 * guard (`POST /:id/reopen` 409s `handed_off` once `projectId` is set —
 * reopening a deal whose project already exists would resurrect a board
 * card for a deal that's no longer really "in the pipeline").
 */
export function canReopenDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId" | "outcome" | "projectId">,
): boolean {
  return hasEditAccess(user, deal) && deal.outcome !== null && deal.projectId === null;
}

/**
 * Gate for the "Create project" handoff offer (`HandoffProjectModal`,
 * `POST /:id/handoff`) — phase-review fix SF3: the offer was previously
 * gated on `hasPermission(user, "project:write")` alone, but the backend's
 * `/handoff` route ALSO runs `assertCanWriteOpportunity(user, "edit", deal)`
 * (same ownership check every other gate here mirrors), so an
 * edit_own-only holder viewing a colleague's Won deal saw the offer and got
 * a 403 on submit. The edit gate (`hasEditAccess`) AND the deal must be Won
 * AND not already linked to a project — mirrors the backend's own
 * `outcome !== WON` / already-linked guards. Callers still AND this with
 * `hasPermission(user, "project:write")` themselves (the separate
 * project-creation permission this gate doesn't know about).
 */
export function canHandoffDeal(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId" | "outcome" | "projectId">,
): boolean {
  return hasEditAccess(user, deal) && deal.outcome === "WON" && deal.projectId === null;
}

/**
 * Gate for plain field edits (title, value, customer, …) on a deal — the
 * ownership gate alone, no outcome clause. The backend still accepts a
 * plain-field `PATCH /:id` on a closed deal (only `subStatus`/`statusTag`
 * are refused with `deal_closed`, per §3.3), so the detail page's Edit
 * button stays available after Close/Reopen; `canDragDeal`/`canCloseDeal`
 * above are the ones that lock out on `outcome !== null`, not this one.
 */
export function canEditDealFields(
  user: AuthUser | null | undefined,
  deal: Pick<PipelineBoardDeal, "picId">,
): boolean {
  return hasEditAccess(user, deal);
}
