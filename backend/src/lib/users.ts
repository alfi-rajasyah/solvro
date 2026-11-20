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
 * missing unless `requireActive` is false. Ordinary edits call it only for a
 * NEW value, so a deactivated account can never be newly assigned, and skip
 * it when the submitted value equals the record's current one, so an
 * unrelated edit never trips over an owner who was deactivated later.
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

/**
 * An epic's owner must be one of the project's people: its TAM, its SA, or a
 * member. 400 `owner_not_in_project` otherwise. Callers skip it when the owner
 * is unchanged, so an epic whose owner later left the project stays editable.
 */
export async function assertEpicOwnerInProject(
  tx: Tx,
  projectId: number,
  ownerId: number,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      tamId: true,
      saId: true,
      members: { where: { userId: ownerId }, select: { userId: true }, take: 1 },
    },
  });
  if (!project || (project.tamId !== ownerId && project.saId !== ownerId && project.members.length === 0)) {
    throw new HttpError(
      400,
      "owner_not_in_project",
      "The epic owner must be the project's TAM, its SA, or a project member",
    );
  }
}
