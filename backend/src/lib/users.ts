import type { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../http/errors.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Refuses a user id taken from a request body that points at no usable
 * account, with 400 `<field>_not_found`, instead of letting the foreign-key
 * violation surface as a 500
 * (docs/archive/plans/application-review-2026-10-22.md, F-23). Call it before
 * the write, inside the same transaction when there is one.
 *
 * `field` names the role the user would take ("tam", "sa", "assignee",
 * "owner") and becomes the error-code prefix. An inactive account counts as
 * missing unless `requireActive` is false — pass false where an existing
 * inactive account is already tolerated (a task may stay assigned to someone
 * who was later deactivated). Callers re-saving a value that has not changed
 * should skip the check so an unrelated edit never trips over it.
 */
export async function assertActiveUser(
  tx: Tx,
  id: number,
  field: string,
  opts: { requireActive?: boolean } = {},
): Promise<void> {
  const user = await tx.user.findUnique({ where: { id }, select: { active: true } });
  if (!user || (opts.requireActive !== false && !user.active)) {
    throw new HttpError(400, `${field}_not_found`, `The selected ${field} does not exist or is inactive`);
  }
}
