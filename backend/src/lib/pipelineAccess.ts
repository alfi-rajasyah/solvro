import { prisma } from "../prisma.js";
import { hasPermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";

// Shared across routes/opportunities.ts and routes/opportunityItems.ts —
// the two pipeline routers used to carry divergent private copies of both
// the ownership gate (assertCanWrite / ensureOpportunityEditable) and the
// user-select shape (PIC_SELECT / actingUserSelect). One shared module now
// backs both, so the gate logic and 403 message can't drift between them
// again (found in M1 review, finding S3).

// Select shape for any relation projecting a user into an Opportunity's
// JSON response — the deal's `pic` and an OpportunityActivity's acting
// `user` both use this same shape.
export const PIC_SELECT = { id: true, username: true, avatarUrl: true } as const;

/**
 * edit_own/edit_all (and delete_own/delete_all) gate for a pipeline
 * resource scoped by an opportunity's PIC: `pipeline:{action}_all` (or the
 * "*" wildcard, handled inside hasPermission) always passes; otherwise the
 * caller needs `pipeline:{action}_own` AND to be the deal's own PIC.
 */
export function assertCanWriteOpportunity(
  user: JwtPayload,
  action: "edit" | "delete",
  opportunity: { picId: number | null },
): void {
  if (hasPermission(user, `pipeline:${action}_all`)) return;
  if (hasPermission(user, `pipeline:${action}_own`) && opportunity.picId === user.sub) return;
  throw new HttpError(
    403,
    "forbidden",
    `Missing permission: pipeline:${action}_all, or pipeline:${action}_own on your own deal`,
  );
}

/**
 * Fetch-and-gate helper for routes that only hold an opportunity id (e.g.
 * opportunityItems.ts's link mutations) and don't already have the row in
 * hand the way routes/opportunities.ts does after `findOpportunityOr404`.
 * 404s before the permission check so a caller can't distinguish "doesn't
 * exist" from "exists but I can't edit it" any more than the 403 path
 * already reveals. Always gates "edit" — none of this module's callers
 * need a delete variant of the fetch-first form.
 */
export async function ensureOpportunityEditable(
  user: JwtPayload,
  opportunityId: string,
): Promise<{ id: string; picId: number | null }> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, picId: true },
  });
  if (!opportunity) throw new HttpError(404, "not_found", "Opportunity not found");
  assertCanWriteOpportunity(user, "edit", opportunity);
  return opportunity;
}
