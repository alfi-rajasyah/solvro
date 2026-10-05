import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Task assignment makes the assignee a project member
 * (docs/archive/plans/collaboration-and-sharing.md, C2): when `assigneeId` is
 * neither the project's TAM, its SA, nor already a member, insert the `ProjectMember`
 * row (`addedById` = the acting user). Call it inside the same transaction as
 * the task write. Idempotent — `skipDuplicates` (ON CONFLICT DO NOTHING) makes
 * concurrent assigns of the same person safe and never touches an existing
 * row. Removing the assignment later never removes the membership.
 *
 * An unknown or inactive assignee is a no-op here (the members API refuses
 * inactive users too), so the task write itself keeps reporting an unknown id
 * exactly as before. Callers invoke this only when the assignee actually
 * changes, so re-saving a task never re-adds a member who was removed.
 *
 * Assignment is gated by `task:write` while the members API needs
 * `project:write`, so a user with only `task:write` can still add a member by
 * assigning a task. That is a known, accepted limitation.
 */
export async function ensureAssigneeIsMember(
  tx: Tx,
  projectId: number,
  assigneeId: number,
  addedById: number,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { tamId: true, saId: true },
  });
  // The TAM and the SA already see the project (port decision M-1, docs/archive/plans/solvro-cust-port-plan.md §10: the SA needs no
  // member row).
  if (!project || project.tamId === assigneeId || project.saId === assigneeId) return;
  const assignee = await tx.user.findUnique({
    where: { id: assigneeId },
    select: { active: true },
  });
  if (!assignee?.active) return;
  await tx.projectMember.createMany({
    data: [{ projectId, userId: assigneeId, addedById }],
    skipDuplicates: true,
  });
}
