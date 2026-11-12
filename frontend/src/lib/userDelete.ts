// Pure logic behind the Admin "Delete user" dialog: a user who owns customers
// is deleted only together with a new owner for each of them, and
// DELETE /admin/users/:id answers 409 customer_owner_required otherwise
// (docs/archive/plans/user-delete-customer-owner.md).
import { ApiError } from "@/lib/api";

export interface OwnedCustomer {
  id: number;
  name: string;
}

/** customerId -> chosen new owner; null = not chosen yet. */
export type OwnerDraft = Record<number, number | null>;

/** Keeps the choices already made for customers that are still listed. */
export function ownerDraftFor(customers: readonly OwnedCustomer[], prev: OwnerDraft = {}): OwnerDraft {
  const draft: OwnerDraft = {};
  for (const c of customers) draft[c.id] = prev[c.id] ?? null;
  return draft;
}

export function isOwnerDraftComplete(customers: readonly OwnedCustomer[], draft: OwnerDraft): boolean {
  return customers.every((c) => draft[c.id] != null);
}

export function buildDeleteUserBody(
  customers: readonly OwnedCustomer[],
  draft: OwnerDraft,
): { customers: { customerId: number; newOwnerId: number }[] } {
  return {
    customers: customers
      .filter((c) => draft[c.id] != null)
      .map((c) => ({ customerId: c.id, newOwnerId: draft[c.id] as number })),
  };
}

export interface DeleteUserError {
  message: string;
  /** The customer row the error belongs to, when the server names one. */
  customerId?: number;
  /** The owned-customer list changed on the server: reload it. */
  stale?: boolean;
}

export function deleteUserErrorFrom(err: unknown): DeleteUserError {
  if (!(err instanceof ApiError)) return { message: "Could not delete this user." };
  const body = err.body as { code?: unknown; details?: unknown } | null | undefined;
  const code = typeof body?.code === "string" ? body.code : "";
  const details = body?.details as { customerId?: unknown } | undefined;
  switch (code) {
    case "customer_owner_required":
      return {
        message: "This user's customers changed while you were choosing. Review the list and try again.",
        stale: true,
      };
    case "owner_not_found":
      return {
        message: "The new owner is not an active user.",
        customerId: typeof details?.customerId === "number" ? details.customerId : undefined,
      };
    default:
      return { message: err.message || "Could not delete this user." };
  }
}
