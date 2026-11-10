import type { Prisma, PrismaClient } from "@prisma/client";
import { recordActivity } from "./activity.js";
import { notifyForEvent } from "./notifications.js";
import { CLOSED_TASK_STATUSES, OPEN_TASK_STATUS_FILTER, isClosedTaskStatus } from "./taskStatus.js";

// "All tasks are closed" nudge
// (docs/archive/plans/feedback-round-lifecycle-spec.md, F3). Called from the
// task status write in routes/tasks.ts after the row is updated, inside the
// same transaction. The caller must already hold `lockProject` for the
// project (taken before any row lock), so two users closing the last two
// tasks at once serialise and exactly one of them sees zero open tasks.

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Records one `all_tasks_closed` project event (and notifies the project's
 * TAM and members, the actor included) when a write moved a task from open to
 * closed and the ACTIVE project now has no open task and at least one task.
 * Returns true when an event was recorded. Never called for task deletes or
 * the project-cancel cascade.
 */
export async function recordAllTasksClosedIfDone(
  tx: Tx,
  input: {
    projectId: number;
    actorId: number;
    statusBefore: string;
    statusAfter: string;
  },
): Promise<boolean> {
  if (isClosedTaskStatus(input.statusBefore) || !isClosedTaskStatus(input.statusAfter)) return false;

  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: {
      name: true,
      status: true,
      tamId: true,
    },
  });
  if (!project || project.status !== "ACTIVE") return false;

  const open = await tx.task.count({
    where: { projectId: input.projectId, status: OPEN_TASK_STATUS_FILTER },
  });
  if (open > 0) return false;

  const grouped = await tx.task.groupBy({
    by: ["status"],
    where: { projectId: input.projectId, status: { in: CLOSED_TASK_STATUSES } },
    _count: { _all: true },
  });
  const countOf = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const done = countOf("DONE");
  const cancelled = countOf("CANCELLED");
  if (done + cancelled === 0) return false;

  const event = await recordActivity(tx, {
    projectId: input.projectId,
    actorId: input.actorId,
    entityType: "project",
    entityId: input.projectId,
    action: "all_tasks_closed",
    entityLabel: project.name,
    changes: { done, cancelled },
  });
  const members = await tx.projectMember.findMany({
    where: { projectId: input.projectId },
    select: { userId: true },
  });
  const recipients = [
    ...(project.tamId !== null ? [project.tamId] : []),
    ...members.map((m) => m.userId),
  ];
  await notifyForEvent(tx, event, { allTasksClosedTo: recipients, includeActor: true });
  return true;
}
