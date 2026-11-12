import { ApiError } from "@/lib/api";
import { hasPermission, type AuthUser } from "@/lib/auth";

// Ownership rules mirrored from the backend's `owner_only` guard
// (docs/archive/plans/collaboration-and-sharing.md, phase 2 decisions):
// access through project membership alone does not allow changing a
// project's TAM or customer, deleting a project, changing a customer's owner,
// or deleting a customer. The server is the authority — these only decide
// which controls to hide so people don't walk into a 403.

/** `project:view-all` (or the wildcard "*") sees and owns everything. */
export function hasViewAll(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, "project:view-all");
}

/**
 * Owner access to a project: view-all, the project's TAM, or the owner of the
 * project's customer. There is deliberately no arm for the project's SA: an
 * SA sees the project (visibility) but never owns it, so an SA cannot delete
 * it or change its TAM, customer or SA (docs/archive/plans/solvro-cust-port-plan.md
 * §10). `customerOwnerId` is `undefined` while unknown (the
 * customer list is still loading) and `null` for an unowned customer.
 */
export function canOwnProject(
  user: AuthUser | null | undefined,
  project: { tamId: number; saId?: number | null },
  customerOwnerId: number | null | undefined,
): boolean {
  if (!user) return false;
  if (hasViewAll(user)) return true;
  if (project.tamId === user.id) return true;
  return customerOwnerId != null && customerOwnerId === user.id;
}

/**
 * Owner access to a customer (change its owner, delete it): view-all, the
 * customer's owner, or an unowned customer. Being TAM of one of its projects
 * does not qualify (pentest finding M1; the backend's
 * `ensureCustomerOwnerAccess` and the PATCH owner-change guard).
 */
export function canOwnCustomer(
  user: AuthUser | null | undefined,
  customer: { tamId: number | null },
): boolean {
  if (!user) return false;
  if (hasViewAll(user)) return true;
  return customer.tamId === null || customer.tamId === user.id;
}

export const OWNER_ONLY_MESSAGE =
  "Only the project's TAM or the customer's owner can do this. Ask them, or an admin.";

/** True for the backend's 403 `owner_only` refusal. */
export function isOwnerOnlyError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body as { code?: unknown } | null;
  return body?.code === "owner_only";
}

/** The message to show for a failed save/delete, with `owner_only` made clear. */
export function saveErrorMessage(err: unknown, fallback: string): string {
  if (isOwnerOnlyError(err)) return OWNER_ONLY_MESSAGE;
  return err instanceof ApiError ? err.message : fallback;
}
